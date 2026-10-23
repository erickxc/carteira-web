import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { pidsNaPorta, ehServidorDaCarteira, ehLauncherDaCarteira, encerrarCarteiraNaPorta } = require('./instanciaAnterior.cjs');

const NETSTAT = `
Conexões ativas

  Proto  Endereço local         Endereço externo       Estado         PID
  TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       900
  TCP    127.0.0.1:3011         0.0.0.0:0              LISTENING       17664
  TCP    127.0.0.1:3011         127.0.0.1:52000        ESTABLISHED     17664
  TCP    127.0.0.1:30110        0.0.0.0:0              LISTENING       555
`;

describe('pidsNaPorta', () => {
  it('pega só quem está ouvindo exatamente na porta', () => {
    expect(pidsNaPorta(NETSTAT, 3011)).toEqual([17664]);
    expect(pidsNaPorta(NETSTAT, 3001)).toEqual([900]);
    expect(pidsNaPorta(NETSTAT, 3012)).toEqual([]);
  });
});

describe('reconhecer processos da Carteira', () => {
  it('servidor: Node portátil renomeado ou node rodando o entrypoint da Carteira', () => {
    expect(ehServidorDaCarteira({ Name: '2D_Carteira_Servidor.exe' })).toBe(true);
    expect(ehServidorDaCarteira({ Name: 'node.exe', CommandLine: '"C:\\SistemaCarteira\\app\\node\\node.exe" C:\\SistemaCarteira\\app\\inicio.cjs' })).toBe(true);
    expect(ehServidorDaCarteira({ Name: 'node.exe', CommandLine: 'node C:\\medstone-main\\server.js' })).toBe(false);
    expect(ehServidorDaCarteira({ Name: 'chrome.exe' })).toBe(false);
    expect(ehServidorDaCarteira(null)).toBe(false);
  });

  it('launcher: nome atual e o antigo, nunca o servidor', () => {
    expect(ehLauncherDaCarteira({ Name: '2D_Carteira.exe' })).toBe(true);
    expect(ehLauncherDaCarteira({ Name: 'CarteiraLauncher.exe' })).toBe(true);
    expect(ehLauncherDaCarteira({ Name: '2D_Carteira_Servidor.exe' })).toBe(false);
    expect(ehLauncherDaCarteira({ Name: 'explorer.exe' })).toBe(false);
  });
});

describe('encerrarCarteiraNaPorta', () => {
  const processos: Record<number, { Name: string; CommandLine?: string; ParentProcessId?: number }> = {
    17664: { Name: '2D_Carteira_Servidor.exe', ParentProcessId: 4000 },
    4000: { Name: '2D_Carteira.exe', ParentProcessId: 1 },
    900: { Name: 'node.exe', CommandLine: 'node C:\\medstone-main\\server.js', ParentProcessId: 1 },
  };
  const deps = (matar = vi.fn()) => ({ lerNetstat: () => NETSTAT, lerProcesso: (pid: number) => processos[pid] ?? null, matarArvore: matar });

  it('encerra pelo launcher dono do servidor, para ele não reiniciar o antigo', () => {
    const matar = vi.fn();
    expect(encerrarCarteiraNaPorta(3011, { meuPid: 9999, deps: deps(matar) })).toBe(true);
    expect(matar).toHaveBeenCalledWith(4000);
  });

  it('sem launcher reconhecível, encerra o próprio servidor', () => {
    const matar = vi.fn();
    const semPai = { ...deps(matar), lerProcesso: (pid: number) => (pid === 17664 ? { Name: '2D_Carteira_Servidor.exe', ParentProcessId: 7 } : { Name: 'explorer.exe' }) };
    expect(encerrarCarteiraNaPorta(3011, { meuPid: 9999, deps: semPai })).toBe(true);
    expect(matar).toHaveBeenCalledWith(17664);
  });

  it('nunca encerra programa que não é da Carteira', () => {
    const matar = vi.fn();
    expect(encerrarCarteiraNaPorta(3001, { meuPid: 9999, deps: deps(matar) })).toBe(false);
    expect(matar).not.toHaveBeenCalled();
  });

  it('porta livre: nada a encerrar', () => {
    const matar = vi.fn();
    expect(encerrarCarteiraNaPorta(3012, { meuPid: 9999, deps: deps(matar) })).toBe(true);
    expect(matar).not.toHaveBeenCalled();
  });

  it('não encerra o próprio launcher que está pedindo', () => {
    const matar = vi.fn();
    expect(encerrarCarteiraNaPorta(3011, { meuPid: 4000, deps: deps(matar) })).toBe(true);
    expect(matar).toHaveBeenCalledWith(17664);
  });
});
