import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apagarPastaReuniao, atualizarTranscricaoNaPasta, criarPastaReuniao, limparPastasOrfas } from './pastaReuniao.cjs';
import { repoMemoria } from '../dominio/repo.cjs';

// A pasta é o "mundo" que o agente de investigação enxerga durante a reunião.
// Dossiê e Alvos são injetados: os reais leem o OneDrive.
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sessao-'));
const repo = () => repoMemoria({
  Clientes: [{ id: 'c1', empresa: 'Pecita' }],
  AnalisesIA: [{ clientId: 'c1', nivelRisco: 'médio', resumo: 'Margem pressionada.' }],
  Agenda: [
    { id: 'e0', clientId: 'c1', date: '2026-09-10T00:00:00.000Z', subject: 'Mensal set', ata: 'Falamos de margem.' },
    { id: 'e9', clientId: 'c1', date: '2026-08-10T00:00:00.000Z', subject: 'Sem ata', ata: '' },
    { id: 'e1', clientId: 'c1', date: '2026-10-23T00:00:00.000Z', subject: 'Mensal out', description: 'Revisar Kit Embreagem' },
  ],
});
const alvosOk = { analise: () => ({ estado: 'ok', quedaPersistente: [{ produto: 'Kit Embreagem' }] }), resumo: () => ({ estado: 'ok', serie: [] }) };
const alvosFora = { analise: () => ({ estado: 'sem_vinculo', motivo: 'x' }), resumo: () => ({ estado: 'sem_vinculo', motivo: 'x' }) };

describe('pasta da reunião', () => {
  it('tem pauta, dossiê, análise, atas anteriores (só com ata), alvos e transcrição', () => {
    const r = repo();
    const pasta = criarPastaReuniao({ repo: r, evento: r.get('Agenda')[2], pastaSessao: tmp(), alvos: alvosOk, lerDossie: () => '# Dossiê Pecita' });
    expect(fs.readdirSync(pasta).sort()).toEqual(['alvos.json', 'analise.md', 'atas-anteriores.md', 'dossie.md', 'pauta.md', 'transcricao.txt']);
    expect(fs.readFileSync(path.join(pasta, 'pauta.md'), 'utf8')).toContain('Revisar Kit Embreagem');
    const atas = fs.readFileSync(path.join(pasta, 'atas-anteriores.md'), 'utf8');
    expect(atas).toContain('Falamos de margem.');
    expect(atas).not.toContain('Sem ata');
    atualizarTranscricaoNaPasta(pasta, '[00:10] Cliente: oi');
    expect(fs.readFileSync(path.join(pasta, 'transcricao.txt'), 'utf8')).toBe('[00:10] Cliente: oi');
  });

  it('alvos indisponível → sem alvos.json; reunião sem cliente não lança', () => {
    const r = repo();
    const pasta = criarPastaReuniao({ repo: r, evento: r.get('Agenda')[2], pastaSessao: tmp(), alvos: alvosFora, lerDossie: () => null });
    expect(fs.existsSync(path.join(pasta, 'alvos.json'))).toBe(false);
    expect(() => criarPastaReuniao({ repo: r, evento: { id: 'x', subject: 'Interna' }, pastaSessao: tmp(), alvos: alvosOk, lerDossie: () => null })).not.toThrow();
  });

  it('apagar e limpar órfãs: só a sessão ativa sobrevive', () => {
    const raiz = tmp();
    for (const id of ['s1', 's2']) fs.mkdirSync(path.join(raiz, id, 'pasta-cliente'), { recursive: true });
    limparPastasOrfas(raiz, 's2');
    expect(fs.existsSync(path.join(raiz, 's1', 'pasta-cliente'))).toBe(false);
    expect(fs.existsSync(path.join(raiz, 's2', 'pasta-cliente'))).toBe(true);
    apagarPastaReuniao(path.join(raiz, 's2'));
    expect(fs.existsSync(path.join(raiz, 's2', 'pasta-cliente'))).toBe(false);
    expect(() => limparPastasOrfas(path.join(raiz, 'nao-existe'), null)).not.toThrow();
  });
});
