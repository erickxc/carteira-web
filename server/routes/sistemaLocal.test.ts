import { createRequire } from 'module';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

function limparCaches() {
  try { delete require.cache[require.resolve('./sistemaLocal.cjs', { paths: [__dirname] })]; } catch { /* não carregado */ }
}

async function subirAppDeTeste() {
  limparCaches();
  const router = require('./sistemaLocal.cjs');
  const app = express();
  app.use(express.json());
  app.use('/api/sistema', router);
  return new Promise<{ base: string; fechar: () => void }>((resolve) => {
    const servidor = app.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as { port: number };
      resolve({ base: `http://127.0.0.1:${port}/api/sistema`, fechar: () => servidor.close() });
    });
  });
}

describe('GET /api/sistema/iniciar-com-windows', () => {
  afterEach(() => {
    delete process.env.CARTEIRA_LAUNCHER_EXE;
    limparCaches();
  });

  it('sem CARTEIRA_LAUNCHER_EXE (dev, ou acesso via navegador/LAN): suportado=false, ativo=false', async () => {
    delete process.env.CARTEIRA_LAUNCHER_EXE;
    const { base, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${base}/iniciar-com-windows`);
      expect(await res.json()).toEqual({ suportado: false, ativo: false });
    } finally {
      fechar();
    }
  });

  it('PUT sem suporte (sem CARTEIRA_LAUNCHER_EXE) devolve 400, nunca tenta tocar o registro', async () => {
    delete process.env.CARTEIRA_LAUNCHER_EXE;
    const { base, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${base}/iniciar-com-windows`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: true }),
      });
      expect(res.status).toBe(400);
    } finally {
      fechar();
    }
  });
});

describe('corrigirAutostartQuebrado', () => {
  afterEach(() => {
    delete process.env.CARTEIRA_LAUNCHER_EXE;
    limparCaches();
  });

  // Cenário real que motivou isto: o `.exe` foi renomeado de
  // `CarteiraLauncher.exe` para `2D_Carteira.exe`. A chave `Run` guarda caminho
  // absoluto, então o autostart apontava pro arquivo antigo — que deixa de
  // existir quando o binário é substituído.
  function corrigir(opts: Record<string, unknown>) {
    limparCaches();
    const mod = require('./sistemaLocal.cjs');
    return mod.corrigirAutostartQuebrado(opts);
  }

  it('reescreve a chave quando ela aponta pro exe antigo, já ausente', () => {
    const escritas: string[] = [];
    const r = corrigir({
      ler: () => 'C:/Desktop/CarteiraLauncher.exe',
      existe: (p: string) => p !== 'C:/Desktop/CarteiraLauncher.exe',
      exe: 'C:/Desktop/2D_Carteira.exe',
      escrever: () => escritas.push('ativar'),
    });
    expect(r).toMatchObject({ corrigido: true, motivo: 'caminho-obsoleto', para: 'C:/Desktop/2D_Carteira.exe' });
    expect(escritas).toEqual(['ativar']);
  });

  it('não toca em nada quando o caminho registrado ainda existe', () => {
    const escritas: string[] = [];
    const r = corrigir({
      ler: () => 'C:/Desktop/2D_Carteira.exe',
      existe: () => true,
      exe: 'C:/Desktop/2D_Carteira.exe',
      escrever: () => escritas.push('ativar'),
    });
    expect(r).toMatchObject({ corrigido: false, motivo: 'ok' });
    expect(escritas).toEqual([]);
  });

  it('não ATIVA autostart pra quem nunca ligou a opção', () => {
    const escritas: string[] = [];
    const r = corrigir({
      ler: () => null,
      existe: () => false,
      exe: 'C:/Desktop/2D_Carteira.exe',
      escrever: () => escritas.push('ativar'),
    });
    expect(r).toMatchObject({ corrigido: false, motivo: 'nao-registrado' });
    expect(escritas).toEqual([]);
  });

  it('não reescreve o mesmo valor quando nem o exe atual existe', () => {
    const escritas: string[] = [];
    const r = corrigir({
      ler: () => 'C:/Desktop/2D_Carteira.exe',
      existe: () => false,
      exe: 'C:/Desktop/2D_Carteira.exe',
      escrever: () => escritas.push('ativar'),
    });
    expect(r).toMatchObject({ corrigido: false, motivo: 'proprio-exe-ausente' });
    expect(escritas).toEqual([]);
  });

  it('não faz nada fora do .exe empacotado (dev, ou navegador de outra máquina)', () => {
    const r = corrigir({ ler: () => 'C:/qualquer.exe', existe: () => false, exe: null, escrever: () => { throw new Error('não devia escrever'); } });
    expect(r).toMatchObject({ corrigido: false, motivo: 'nao-suportado' });
  });
});
