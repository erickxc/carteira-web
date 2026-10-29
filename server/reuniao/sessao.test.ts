import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { repoMemoria } from '../dominio/repo.cjs';

const require = createRequire(import.meta.url);

// Sessão com tudo injetado: sem Python, sem ffmpeg, sem IA, relógio na mão.
// O módulo guarda a sessão atual em memória — require fresco por teste.
function montar() {
  delete require.cache[require.resolve('./sessao.cjs')];
  const sessao = require('./sessao.cjs');
  let t = 0;
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'reunioes-'));
  const ciclo = { rodar: vi.fn(async () => {}), despachar: vi.fn(), adicionar: vi.fn(), enviados: vi.fn(() => [{ texto: 'X' }]) };
  const deps = {
    raiz,
    agora: () => t,
    spawnTranscritor: vi.fn(({ pasta }) => {
      // transcritor falso: termina assim que aparece PARAR
      const timer = setInterval(() => {
        if (fs.existsSync(path.join(pasta, 'PARAR'))) { fs.writeFileSync(path.join(pasta, 'transcritor.fim'), ''); clearInterval(timer); }
      }, 20);
      return { kill: vi.fn() };
    }),
    iniciarFonte: vi.fn(() => ({ parar: vi.fn(), concluida: Promise.resolve() })),
    iniciarCaptura: vi.fn(() => ({ parar: vi.fn(), concluida: Promise.resolve() })),
    finalizar: vi.fn(async () => ({ ok: true })),
    criarCicloInsights: vi.fn(() => ciclo),
    criarPastaReuniao: vi.fn(({ pastaSessao }) => { const p = path.join(pastaSessao, 'pasta-cliente'); fs.mkdirSync(p, { recursive: true }); return p; }),
    vocabulario: () => 'CMV',
    notificar: vi.fn(),
    investigar: null,
    intervaloMs: 0, // sem setInterval: o teste chama passo()
  };
  const repo = repoMemoria({ Agenda: [{ id: 'e1', clientId: 'c1', subject: 'Mensal', monitores: '["Erick Cardoso"]' }], Clientes: [{ id: 'c1', empresa: 'Pecita' }] });
  const escreverSegmento = (pasta: string, inicio: number, texto: string) =>
    fs.appendFileSync(path.join(pasta, 'transcricao.jsonl'), JSON.stringify({ faixa: 'sistema', pedaco: 1, inicio, fim: inicio + 2, texto }) + '\n');
  return { sessao, deps, repo, ciclo, avancar: (s: number) => { t += s * 1000; }, escreverSegmento };
}

describe('sessão de reunião', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => { m = montar(); });

  it('inicia ouvindo, com transcritor, fonte e pasta do cliente', () => {
    const e = m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', simularArquivo: 'a.mp4', deps: m.deps });
    expect(e).toMatchObject({ ativa: true, fase: 'ouvindo', eventId: 'e1' });
    expect(m.deps.spawnTranscritor).toHaveBeenCalledTimes(1);
    expect(m.deps.iniciarFonte).toHaveBeenCalledWith(expect.objectContaining({ arquivo: 'a.mp4' }));
    expect(m.deps.criarPastaReuniao).toHaveBeenCalledTimes(1);
  });

  it('sem arquivo, ouve ao vivo pela captura', () => {
    m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', deps: m.deps });
    expect(m.deps.iniciarCaptura).toHaveBeenCalledTimes(1);
    expect(m.deps.iniciarFonte).not.toHaveBeenCalled();
  });

  it('409 ao iniciar com sessão ativa', () => {
    m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', simularArquivo: 'a.mp4', deps: m.deps });
    expect(() => m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', simularArquivo: 'a.mp4', deps: m.deps })).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('a cada 3 min manda só o trecho novo ao ciclo e atualiza a transcrição da pasta', async () => {
    const e = m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', simularArquivo: 'a.mp4', deps: m.deps });
    const pasta = m.sessao._pastaAtual();
    m.escreverSegmento(pasta, 5, 'primeira fala');
    m.avancar(60); await m.sessao.passo();
    expect(m.ciclo.rodar).not.toHaveBeenCalled();
    m.avancar(120); await m.sessao.passo();
    expect(m.ciclo.rodar).toHaveBeenCalledWith('[00:05] Cliente: primeira fala');
    m.escreverSegmento(pasta, 200, 'segunda fala');
    m.avancar(180); await m.sessao.passo();
    expect(m.ciclo.rodar).toHaveBeenLastCalledWith('[03:20] Cliente: segunda fala');
    expect(fs.readFileSync(path.join(pasta, 'pasta-cliente', 'transcricao.txt'), 'utf8')).toContain('segunda fala');
    expect(e.eventId).toBe('e1');
  });

  it('encerra sozinha após 5 min sem segmento novo', async () => {
    m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', simularArquivo: 'a.mp4', deps: m.deps });
    m.escreverSegmento(m.sessao._pastaAtual(), 5, 'oi');
    m.avancar(10); await m.sessao.passo();
    m.avancar(290); await m.sessao.passo();
    expect(m.sessao.estadoSessao().fase).toBe('ouvindo');
    m.avancar(15); await m.sessao.passo();
    await m.sessao._finalizacao();
    expect(m.deps.finalizar).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e1', nomeMonitor: 'Erick Cardoso', insights: [{ texto: 'X' }] }));
    expect(m.sessao.estadoSessao().fase).toBe('concluida');
  });

  it('transcritor que cai não deixa a sessão presa em "finalizando"', async () => {
    const { EventEmitter } = require('events');
    const proc = Object.assign(new EventEmitter(), { kill: vi.fn() });
    m.deps.spawnTranscritor = vi.fn(() => proc); // nunca escreve transcritor.fim
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', deps: m.deps });
    m.sessao.encerrarSessao();
    proc.emit('exit', 1);
    await m.sessao._finalizacao();
    expect(m.deps.finalizar).toHaveBeenCalledTimes(1);
  });

  it('pausar cria PAUSAR (captura grava silêncio), retomar apaga; pausa não conta como silêncio', async () => {
    m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', deps: m.deps });
    const pasta = m.sessao._pastaAtual();
    m.escreverSegmento(pasta, 5, 'oi');
    m.avancar(10); await m.sessao.passo();
    expect(m.sessao.pausarSessao(true)).toMatchObject({ pausada: true, fase: 'ouvindo' });
    expect(fs.existsSync(path.join(pasta, 'PAUSAR'))).toBe(true);
    m.avancar(400); await m.sessao.passo(); // 6+ min pausado
    expect(m.sessao.estadoSessao().fase).toBe('ouvindo');
    expect(m.sessao.pausarSessao(false).pausada).toBe(false);
    expect(fs.existsSync(path.join(pasta, 'PAUSAR'))).toBe(false);
    m.avancar(310); await m.sessao.passo(); // depois de retomar, o silêncio volta a contar
    await m.sessao._finalizacao();
    expect(m.sessao.estadoSessao().fase).toBe('concluida');
    expect(() => m.sessao.pausarSessao(true)).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('encerrar duas vezes: a segunda é 409 e finalizar roda uma vez; pasta do cliente apagada', async () => {
    m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', simularArquivo: 'a.mp4', deps: m.deps });
    const pasta = m.sessao._pastaAtual();
    m.sessao.encerrarSessao();
    expect(() => m.sessao.encerrarSessao()).toThrow(expect.objectContaining({ status: 409 }));
    await m.sessao._finalizacao();
    expect(m.deps.finalizar).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(pasta, 'pasta-cliente'))).toBe(false);
    expect(m.deps.notificar).toHaveBeenLastCalledWith(expect.objectContaining({ titulo: 'Ata pronta · Pecita' }));
  });

  it('encerrar sem sessão é 409', () => {
    expect(() => m.sessao.encerrarSessao()).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('falha ao gerar a ata deixa a fase em erro com o motivo', async () => {
    m.deps.finalizar = vi.fn(async () => ({ ok: false, erro: 'IA fora' }));
    m.sessao.iniciarSessao({ repo: m.repo, eventId: 'e1', simularArquivo: 'a.mp4', deps: m.deps });
    m.sessao.encerrarSessao();
    await m.sessao._finalizacao();
    expect(m.sessao.estadoSessao()).toMatchObject({ fase: 'erro', erro: 'IA fora' });
  });
});
