import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Teste nenhum enxerga a pasta real do OneDrive nem o SQLite de produção, mesmo
// sem isolar por conta própria: `server/config.cjs` deriva tudo destas duas, e o
// `.env` não sobrescreve o que já está definido. Quem grava arquivo que outro
// teste leria continua criando a própria pasta (a suíte roda em paralelo).
export default function pastaIsolada() {
  const pasta = mkdtempSync(join(tmpdir(), 'carteira-testes-'));
  process.env.ONEDRIVE_ROOT = pasta;
  process.env.SQLITE_DIR = pasta;
  return () => rmSync(pasta, { recursive: true, force: true });
}
