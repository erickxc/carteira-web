import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

let tmpDir: string;
let installDir: string;
let releasesDir: string;
let appDir: string;
let versaoArquivoPath: string;
let launcherIndex: typeof import('./index.cjs');

function limparCacheDe(modulePath: string) {
  delete require.cache[require.resolve(modulePath)];
}

function criarReleaseFixture(dir: string, versao: string, conteudoServerJs: string) {
  const arquivo = `carteira-v${versao}.zip`;
  const zip = new AdmZip();
  zip.addFile('server.cjs', Buffer.from(conteudoServerJs));
  zip.writeZip(path.join(dir, arquivo));
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ versao, arquivo }));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-launcher-idx-'));
  installDir = path.join(tmpDir, 'install');
  releasesDir = path.join(tmpDir, 'releases');
  fs.mkdirSync(releasesDir, { recursive: true });
  appDir = path.join(installDir, 'app');
  versaoArquivoPath = path.join(installDir, 'versao-instalada.txt');
  process.env.CARTEIRA_INSTALL_DIR = installDir;
  process.env.CARTEIRA_RELEASES_DIR = releasesDir;
  // Sem isso, `registrarLog` (index.cjs) escreveria no `launcher.log` REAL do
  // usuário rodando os testes — `PONTEIRO_INSTALL` é de onde `LOG_FILE` é
  // derivado, e o default cai fora da área isolada por `CARTEIRA_INSTALL_DIR`.
  process.env.CARTEIRA_PONTEIRO_INSTALL = path.join(tmpDir, 'pasta-instalacao.txt');
  limparCacheDe('./config.cjs');
  limparCacheDe('./index.cjs');
  launcherIndex = require('./index.cjs');
});

afterEach(() => {
  delete process.env.CARTEIRA_INSTALL_DIR;
  delete process.env.CARTEIRA_RELEASES_DIR;
  delete process.env.CARTEIRA_PONTEIRO_INSTALL;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('atualizarSeNecessario', () => {
  it('sem releases/latest.json, não atualiza (fica na versão instalada, sem erro)', () => {
    const resultado = launcherIndex.atualizarSeNecessario({ appDir, versaoArquivoPath });
    expect(resultado.atualizou).toBe(false);
    expect(resultado.versao).toBe('0.0.0');
  });

  it('instala a primeira release quando não há nada instalado ainda', () => {
    criarReleaseFixture(releasesDir, '1.0.0', '// v1');
    const resultado = launcherIndex.atualizarSeNecessario({ appDir, versaoArquivoPath });
    expect(resultado).toEqual({ atualizou: true, versao: '1.0.0' });
    expect(fs.readFileSync(path.join(installDir, 'app', 'server.cjs'), 'utf8')).toBe('// v1');
  });

  it('já na versão mais recente: não reaplica a atualização', () => {
    criarReleaseFixture(releasesDir, '1.0.0', '// v1');
    launcherIndex.atualizarSeNecessario({ appDir, versaoArquivoPath });
    const resultado = launcherIndex.atualizarSeNecessario({ appDir, versaoArquivoPath });
    expect(resultado.atualizou).toBe(false);
    expect(resultado.versao).toBe('1.0.0');
  });

  it('detecta e aplica uma versão mais nova publicada depois', () => {
    criarReleaseFixture(releasesDir, '1.0.0', '// v1');
    launcherIndex.atualizarSeNecessario({ appDir, versaoArquivoPath });

    criarReleaseFixture(releasesDir, '1.1.0', '// v1.1');
    const resultado = launcherIndex.atualizarSeNecessario({ appDir, versaoArquivoPath });
    expect(resultado).toEqual({ atualizou: true, versao: '1.1.0' });
    expect(fs.readFileSync(path.join(installDir, 'app', 'server.cjs'), 'utf8')).toBe('// v1.1');
  });
});

describe('caminhoNodePortavel', () => {
  afterEach(() => {
    delete (process as unknown as { pkg?: unknown }).pkg;
  });

  it('usa o Node embutido em app/node/ quando existe, mesmo empacotado', () => {
    const nodeDir = path.join(appDir, 'node');
    fs.mkdirSync(nodeDir, { recursive: true });
    const candidato = path.join(nodeDir, process.platform === 'win32' ? 'node.exe' : 'node');
    fs.writeFileSync(candidato, '');
    (process as unknown as { pkg?: unknown }).pkg = {};
    expect(launcherIndex.caminhoNodePortavel(appDir)).toBe(candidato);
  });

  it('fora do pkg (dev), sem Node embutido, cai pro process.execPath (Node real rodando o launcher)', () => {
    expect(launcherIndex.caminhoNodePortavel(appDir)).toBe(process.execPath);
  });

  it('empacotado (pkg) e sem Node embutido: busca um Node real no sistema (where/which), nunca o próprio .exe', () => {
    (process as unknown as { pkg?: unknown }).pkg = {};
    // Não mocka `localizarNodeNoSistema` (função interna, não exportada) —
    // roda a busca real (`where`/`which node`). Nesta máquina de teste há um
    // Node real instalado, então deve achar (pode coincidir com
    // process.execPath, já que os testes também rodam sob esse mesmo Node —
    // o que importa é que veio de uma busca real no sistema, não do atalho
    // perigoso "usa a si mesmo", que é o bug real encontrado em produção:
    // sem Node embutido nem no sistema, isso lançaria erro em vez de rodar
    // o launcher como se fosse Node).
    const resultado = launcherIndex.caminhoNodePortavel(appDir);
    expect(fs.existsSync(resultado)).toBe(true);
  });

  it('empacotado (pkg), sem Node embutido e sem Node no sistema: lança erro claro (nunca usa o próprio .exe)', () => {
    (process as unknown as { pkg?: unknown }).pkg = {};
    const pathOriginal = process.env.PATH;
    process.env.PATH = ''; // simula "nenhum Node encontrável no sistema"
    try {
      expect(() => launcherIndex.caminhoNodePortavel(appDir)).toThrow(/Node não encontrado/);
    } finally {
      process.env.PATH = pathOriginal;
    }
  });
});


describe('entrypointDoApp', () => {
  it('usa inicio.cjs (bandeja + servidor) quando a instalação já tem esse arquivo', () => {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'server.cjs'), '');
    fs.writeFileSync(path.join(appDir, 'inicio.cjs'), '');
    expect(launcherIndex.entrypointDoApp(appDir)).toBe(path.join(appDir, 'inicio.cjs'));
  });

  it('instalação antiga (só server.cjs): cai no server.cjs em vez de não subir nada', () => {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'server.cjs'), '');
    expect(launcherIndex.entrypointDoApp(appDir)).toBe(path.join(appDir, 'server.cjs'));
  });
});

describe('carregarTela', () => {
  it('prefere a tela de carregamento que veio na release (é o que permite corrigi-la sem redistribuir o .exe)', () => {
    fs.mkdirSync(path.join(appDir, 'server'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'server', 'telaCarregando.cjs'),
      'module.exports = { gerarHtml: () => "<html>da release</html>", abrirTelaCarregando: () => null };',
    );
    expect(launcherIndex.carregarTela(appDir).gerarHtml(1)).toBe('<html>da release</html>');
  });

  it('sem cópia na instalação, usa a embutida no .exe', () => {
    fs.mkdirSync(appDir, { recursive: true });
    expect(launcherIndex.carregarTela(appDir).gerarHtml(3097)).toContain('const PORTA = 3097;');
  });
});

describe('trava de instância única', () => {
  it('sem lock nenhum: obtém a trava normalmente', () => {
    expect(launcherIndex.obterTravaUnica()).toBe(true);
    expect(fs.readFileSync(launcherIndex.LOCK_FILE, 'utf8').trim()).toBe(String(process.pid));
  });

  it('lock de um PID ainda vivo: recusa (é o caso de dois cliques quase juntos)', () => {
    fs.mkdirSync(path.dirname(launcherIndex.LOCK_FILE), { recursive: true });
    // process.pid está vivo (é este próprio processo de teste) — simula "outra
    // instância do launcher ainda no meio da abertura".
    fs.writeFileSync(launcherIndex.LOCK_FILE, String(process.pid));
    expect(launcherIndex.obterTravaUnica()).toBe(false);
  });

  it('lock de um PID morto (launcher crashou sem limpar): trata como obsoleta e sobrescreve', () => {
    fs.mkdirSync(path.dirname(launcherIndex.LOCK_FILE), { recursive: true });
    fs.writeFileSync(launcherIndex.LOCK_FILE, '999999999'); // PID praticamente impossível de existir
    expect(launcherIndex.obterTravaUnica()).toBe(true);
    expect(fs.readFileSync(launcherIndex.LOCK_FILE, 'utf8').trim()).toBe(String(process.pid));
  });

  it('liberarTravaUnica só remove o lock se for o nosso PID', () => {
    fs.mkdirSync(path.dirname(launcherIndex.LOCK_FILE), { recursive: true });
    fs.writeFileSync(launcherIndex.LOCK_FILE, '999999999');
    launcherIndex.liberarTravaUnica();
    expect(fs.existsSync(launcherIndex.LOCK_FILE)).toBe(true); // não era nosso — não mexe

    fs.writeFileSync(launcherIndex.LOCK_FILE, String(process.pid));
    launcherIndex.liberarTravaUnica();
    expect(fs.existsSync(launcherIndex.LOCK_FILE)).toBe(false);
  });
});

describe('servidorJaNoAr', () => {
  it('nenhum servidor respondendo numa porta livre: false, rápido (timeout curto, não trava a abertura normal)', async () => {
    // Não usa CARTEIRA_PORTA/PORTA real (`launcher/config.cjs`) — nesta
    // própria máquina de desenvolvimento pode HAVER uma Carteira de verdade
    // rodando na porta padrão, o que faria este teste "passar" pelo motivo
    // errado. Bate direto numa porta alta improvável de estar em uso.
    const http = require('http');
    function servidorEmPortaLivre(porta, timeoutMs) {
      return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${porta}/api/status/base`, { timeout: timeoutMs }, (res) => {
          res.resume();
          resolve(true);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });
    }
    const antes = Date.now();
    const resultado = await servidorEmPortaLivre(58234, 200);
    expect(resultado).toBe(false);
    expect(Date.now() - antes).toBeLessThan(2000);
  });
});

describe('reinício em processo (código de saída de atualização)', () => {
  // `subirServidor` termina com `process.exit()` fora do caso de reinício —
  // comportamento real e intencional (é o launcher saindo de vez), mas
  // destrutivo demais pra rodar de verdade dentro do processo do vitest.
  // Substitui por um espião em todos os testes deste bloco.
  let saidaEspiao: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    saidaEspiao = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as unknown) as typeof process.exit);
  });
  afterEach(() => { saidaEspiao.mockRestore(); });

  it('servidor sai com CODIGO_SAIDA_ATUALIZAR: sobe de novo sozinho, sem passar por process.exit', async () => {
    fs.mkdirSync(appDir, { recursive: true });
    const contadorPath = path.join(tmpDir, 'contador.txt');
    fs.writeFileSync(contadorPath, '0');
    // Fake "servidor": na 1ª subida sai pedindo atualização; na 2ª, sai normal.
    // Escreve no arquivo a cada execução — é como o teste enxerga "subiu de novo".
    fs.writeFileSync(path.join(appDir, 'inicio.cjs'), `
      const fs = require('fs');
      const contadorPath = ${JSON.stringify(contadorPath)};
      const n = Number(fs.readFileSync(contadorPath, 'utf8')) + 1;
      fs.writeFileSync(contadorPath, String(n));
      process.exit(n === 1 ? ${launcherIndex.CODIGO_SAIDA_ATUALIZAR} : 0);
    `);

    launcherIndex.subirServidor(appDir, installDir);

    // Espera o ESPIÃO ser chamado (saída final, depois do 2º ciclo), não só o
    // arquivo — o arquivo é escrito ANTES do `process.exit()` do filho, então
    // esperar só por ele corre pra frente do evento `exit` de verdade (efeito
    // colateral real encontrado aqui: o teste seguinte via uma chamada tardia
    // deste processo "vazando" pro spy dele, e o `afterEach` falhava ao
    // apagar `tmpDir` — pasta ainda em uso pelo processo que não tinha
    // terminado de verdade).
    const fim = Date.now() + 15000;
    while (saidaEspiao.mock.calls.length === 0 && Date.now() < fim) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(Number(fs.readFileSync(contadorPath, 'utf8'))).toBe(2);
    // Reiniciou sozinho no meio (código 42) sem sair do processo launcher —
    // só a saída final (código 0, depois do 2º ciclo) passa por process.exit.
    expect(saidaEspiao).toHaveBeenCalledTimes(1);
    expect(saidaEspiao).toHaveBeenCalledWith(0);
  }, 20000);

  it('falha logo na subida (ex.: OneDrive ainda montando no boot do Windows): tenta de novo até conseguir, sem matar o launcher', async () => {
    fs.mkdirSync(appDir, { recursive: true });
    const contadorPath = path.join(tmpDir, 'contador-boot.txt');
    fs.writeFileSync(contadorPath, '0');
    // Falha (código 1) nas 2 primeiras tentativas — simula `server/config.cjs`
    // saindo com `process.exit(1)` por não achar o ONEDRIVE_ROOT ainda — e
    // sobe normal (código 0) na 3ª, como se o OneDrive tivesse acabado de montar.
    fs.writeFileSync(path.join(appDir, 'inicio.cjs'), `
      const fs = require('fs');
      const contadorPath = ${JSON.stringify(contadorPath)};
      const n = Number(fs.readFileSync(contadorPath, 'utf8')) + 1;
      fs.writeFileSync(contadorPath, String(n));
      process.exit(n < 3 ? 1 : 0);
    `);

    launcherIndex.subirServidor(appDir, installDir);

    const fim = Date.now() + 15000;
    while (saidaEspiao.mock.calls.length === 0 && Date.now() < fim) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(Number(fs.readFileSync(contadorPath, 'utf8'))).toBe(3);
    expect(saidaEspiao).toHaveBeenCalledTimes(1);
    expect(saidaEspiao).toHaveBeenCalledWith(0);
  }, 20000);

  it('sem installDir (chamada avulsa): sai em qualquer código, sem tentar reiniciar', async () => {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'inicio.cjs'), `process.exit(${launcherIndex.CODIGO_SAIDA_ATUALIZAR});`);
    launcherIndex.subirServidor(appDir); // sem installDir — nunca deve tentar reiniciar
    const fim = Date.now() + 15000;
    while (saidaEspiao.mock.calls.length === 0 && Date.now() < fim) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(saidaEspiao).toHaveBeenCalledWith(launcherIndex.CODIGO_SAIDA_ATUALIZAR);
  }, 20000);
});
