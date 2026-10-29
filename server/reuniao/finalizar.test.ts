import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { finalizarReuniao } from './finalizar.cjs';
import { repoMemoria } from '../dominio/repo.cjs';

// Ordem importa: transcrição salva ANTES da IA (se a ata falhar, o texto não se
// perde) e o áudio só é apagado depois que a ata foi gravada.
function montar() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'sessao-'));
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
  fs.writeFileSync(path.join(pasta, 'sistema-0001.wav'), 'x');
  fs.writeFileSync(path.join(pasta, 'mic-0001.wav'), 'x');
  fs.writeFileSync(path.join(pasta, 'transcricao.jsonl'),
    '{"faixa":"mic","pedaco":1,"inicio":1,"fim":2,"texto":"Bom dia"}\n{"faixa":"sistema","pedaco":1,"inicio":3,"fim":4,"texto":"Bom dia, tudo certo"}\n');
  const repo = repoMemoria({ Agenda: [{ id: 'e1', clientId: 'c1', attachments: '[{"id":"a","filename":"a.pdf"}]' }] });
  const mutar = vi.fn();
  const redigir = vi.fn(async () => ({ ataCompleta: '## Ata\nConteúdo' }));
  return { pasta, uploadsDir, repo, mutar, redigir, base: { repo, eventId: 'e1', pasta, nomeMonitor: 'Erick Cardoso', insights: [] as unknown[], redigir, mutar, uploadsDir } };
}

describe('finalizar reunião', () => {
  it('salva transcrição antes da ata, ata com marca e insights, anexa txt, apaga wav', async () => {
    const m = montar();
    const r = await finalizarReuniao({ ...m.base, insights: [{ texto: 'Margem em queda', acao: 'Perguntar preço', fontes: 'alvos.json' }] });
    expect(r).toEqual({ ok: true });

    const transcricao = m.mutar.mock.calls[0][2].patch.transcricao;
    expect(transcricao).toBe('[00:01] Erick Cardoso: Bom dia\n[00:03] Cliente: Bom dia, tudo certo');
    expect(m.redigir).toHaveBeenCalledWith(m.repo, expect.objectContaining({ eventId: 'e1', salvar: false, transcricao }));

    const patch = m.mutar.mock.calls[1][2].patch;
    expect(patch.ata.startsWith('> Gerada pelo monitorIA — revise antes de concluir.')).toBe(true);
    expect(patch.ata).toContain('### Insights da reunião\n- Margem em queda — Perguntar preço (Fontes: alvos.json)');
    expect(patch.attachments).toHaveLength(2);
    const anexo = patch.attachments[1];
    expect(fs.readFileSync(path.join(m.uploadsDir, anexo.filename), 'utf8')).toBe(transcricao);
    expect(fs.readdirSync(m.pasta).filter((f) => f.endsWith('.wav'))).toEqual([]);

    // PDF da ata anexado depois da ata: transcrição + PDF, marcado `ataPdf`.
    const comPdf = m.mutar.mock.calls[2][2].patch.attachments;
    expect(comPdf).toHaveLength(3);
    expect(comPdf[2]).toMatchObject({ ataPdf: true });
    expect(fs.readFileSync(path.join(m.uploadsDir, comPdf[2].filename)).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('sem insights a seção diz "Nenhum."', async () => {
    const m = montar();
    await finalizarReuniao(m.base);
    expect(m.mutar.mock.calls[1][2].patch.ata).toContain('### Insights da reunião\n- Nenhum.');
  });

  it('falha da IA mantém o áudio e a transcrição já salva', async () => {
    const m = montar();
    const r = await finalizarReuniao({ ...m.base, redigir: async () => { throw new Error('fora'); } });
    expect(r).toEqual({ ok: false, erro: 'fora' });
    expect(m.mutar).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(m.pasta).filter((f) => f.endsWith('.wav')).length).toBe(2);
  });
});
