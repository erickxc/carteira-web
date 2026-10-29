import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { repoMemoria } from '../dominio/repo.cjs';

const require = createRequire(import.meta.url);
const agenda = require('../dominio/agenda.cjs');

// PDF da ata: um só por evento, refeito quando a ata muda. Pasta de anexos temporária
// (o default é UPLOADS_DIR, no OneDrive de produção).
function montar(attachments: unknown[]) {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
  for (const a of attachments as { filename: string }[]) fs.writeFileSync(path.join(uploadsDir, a.filename), 'velho');
  const repo = repoMemoria({
    Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-10-30T03:00:00.000Z', type: 'Reunião', ata: 'Ata antiga', attachments: JSON.stringify(attachments) }],
    Clientes: [{ id: 'c1', empresa: 'Pecita', contatos: '[]' }],
  });
  const anexos = () => { const a = repo.get('Agenda')[0].attachments; return typeof a === 'string' ? JSON.parse(a) : a; };
  return { uploadsDir, repo, anexos };
}

describe('PDF da ata anexado', () => {
  it('ata editada refaz o PDF: um só, arquivo antigo apagado, outros anexos intactos', () => {
    const m = montar([{ id: 't', filename: 't.txt' }, { id: 'p', filename: 'velho.pdf', ataPdf: true }]);
    agenda.atualizar(m.repo, 'e1', { ata: 'Ata nova' }, { uploadsDir: m.uploadsDir });
    const lista = m.anexos();
    expect(lista.map((a: { id: string }) => a.id)[0]).toBe('t');
    const pdfs = lista.filter((a: { ataPdf?: boolean }) => a.ataPdf);
    expect(pdfs).toHaveLength(1);
    expect(fs.existsSync(path.join(m.uploadsDir, 'velho.pdf'))).toBe(false);
    expect(fs.readFileSync(path.join(m.uploadsDir, pdfs[0].filename)).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('sem PDF da ata anexado, ou ata igual, não gera nada', () => {
    const sem = montar([{ id: 't', filename: 't.txt' }]);
    agenda.atualizar(sem.repo, 'e1', { ata: 'Ata nova' }, { uploadsDir: sem.uploadsDir });
    expect(sem.anexos()).toHaveLength(1);

    const igual = montar([{ id: 'p', filename: 'velho.pdf', ataPdf: true }]);
    agenda.atualizar(igual.repo, 'e1', { ata: 'Ata antiga' }, { uploadsDir: igual.uploadsDir });
    expect(fs.existsSync(path.join(igual.uploadsDir, 'velho.pdf'))).toBe(true);
  });
});
