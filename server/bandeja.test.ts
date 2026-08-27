import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { gerarScript } = require('./bandeja.cjs');

describe('gerarScript (bandeja)', () => {
  it('aponta o menu pra porta certa e vigia/mata o PID do servidor', () => {
    const ps = gerarScript({ porta: 3097, icone: 'C:\\app\\icone.ico', pid: 4242 });
    expect(ps).toContain("$url = 'http://127.0.0.1:3097/'");
    expect(ps).toContain('$pidServidor = 4242');
    expect(ps).toContain('Stop-Process -Id $pidServidor');
    // Sem o laço de mensagens em STA o ícone aparece mas não responde a clique.
    expect(ps).toContain('[System.Windows.Forms.Application]::Run()');
  });

  it('sem ícone no disco, cai no ícone padrão do sistema em vez de quebrar', () => {
    const ps = gerarScript({ porta: 3011, icone: null, pid: 1 });
    expect(ps).toContain('[System.Drawing.SystemIcons]::Application');
    expect(ps).not.toContain('New-Object System.Drawing.Icon');
  });

  it('escapa aspas simples do caminho do ícone (escape do PowerShell é dobrar)', () => {
    const ps = gerarScript({ porta: 3011, icone: "C:\\pasta'estranha\\icone.ico", pid: 1 });
    expect(ps).toContain("New-Object System.Drawing.Icon('C:\\pasta''estranha\\icone.ico')");
  });

  it('porta e pid entram como número — nunca texto solto vindo de fora', () => {
    const ps = gerarScript({ porta: '3011; Remove-Item C:\\', icone: null, pid: '9; calc' });
    expect(ps).toContain("$url = 'http://127.0.0.1:NaN/'");
    expect(ps).toContain('$pidServidor = NaN');
    expect(ps).not.toContain('Remove-Item');
    expect(ps).not.toContain('calc');
  });
});
