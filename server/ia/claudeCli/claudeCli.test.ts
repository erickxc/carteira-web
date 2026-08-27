import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * `server/config.cjs` resolve `CLAUDE_STATE_FILE` a partir de `SQLITE_DIR` na
 * primeira vez que é exigido — mesmo cuidado de `dbSqlite.test.ts`: cada
 * teste ganha uma pasta temporária e um `require` fresco, senão o token de
 * teste iria pro arquivo REAL da máquina (e um teste de logout apagaria o
 * login de produção do usuário).
 */
let tmpDir: string;
let estado: typeof import('./estado.cjs');
let cliente: typeof import('./cliente.cjs');
let login: typeof import('./login.cjs');

const MODULOS = ['../../config.cjs', './estado.cjs', './cliente.cjs', './login.cjs', './localizar.cjs', './auth.cjs'];

function recarregar() {
  for (const m of MODULOS) delete require.cache[require.resolve(m)];
  estado = require('./estado.cjs');
  cliente = require('./cliente.cjs');
  login = require('./login.cjs');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-claude-test-'));
  process.env.SQLITE_DIR = tmpDir;
  delete process.env.IA_PROVIDER;
  delete process.env.CLAUDE_CLI_PATH;
  recarregar();
});

afterEach(() => {
  // Mata qualquer `claude setup-token` de mentira que tenha ficado de pé —
  // no Windows um filho vivo segura a pasta e o `rmSync` toma EPERM.
  login.cancelarLogin();
  delete process.env.SQLITE_DIR;
  delete process.env.IA_PROVIDER;
  delete process.env.CLAUDE_CLI_PATH;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    // Pasta temporária presa por processo já encerrando: o SO limpa depois.
    // Falhar a limpeza não invalida o que o teste verificou.
  }
});

describe('estado: provedor e token', () => {
  it('cai para ollama quando nada foi configurado', () => {
    expect(estado.provedorAtivo()).toBe('ollama');
    expect(estado.provedorTravado()).toBe(false);
  });

  it('grava e lê a escolha do provedor', () => {
    estado.definirProvedor('claude-cli');
    expect(estado.provedorAtivo()).toBe('claude-cli');
    recarregar();
    expect(estado.provedorAtivo()).toBe('claude-cli');
  });

  it('rejeita provedor desconhecido', () => {
    expect(() => estado.definirProvedor('gpt')).toThrow(/inválido/i);
  });

  it('IA_PROVIDER no .env vence o arquivo e trava a troca pela interface', () => {
    estado.definirProvedor('claude-cli');
    process.env.IA_PROVIDER = 'ollama';
    recarregar();
    expect(estado.provedorAtivo()).toBe('ollama');
    expect(estado.provedorTravado()).toBe(true);
    expect(() => estado.definirProvedor('claude-cli')).toThrow(/fixado/i);
  });

  it('guarda o token fora do OneDrive, em SQLITE_DIR', () => {
    estado.salvarToken('sk-ant-oat01-teste');
    expect(fs.existsSync(path.join(tmpDir, 'claude-cli.json'))).toBe(true);
    expect(estado.tokenSalvo()).toBe('sk-ant-oat01-teste');
    estado.removerToken();
    expect(estado.tokenSalvo()).toBe('');
  });
});

describe('estado: ambiente das chamadas ao CLI', () => {
  it('passa o token OAuth e remove credenciais de API paga do ambiente', () => {
    estado.salvarToken('sk-ant-oat01-teste');
    const env = estado.ambienteCredencial({
      ANTHROPIC_API_KEY: 'sk-ant-api-nao-usar',
      ANTHROPIC_AUTH_TOKEN: 'bearer-nao-usar',
      CLAUDE_CODE_USE_BEDROCK: '1',
      PATH: '/bin',
    } as NodeJS.ProcessEnv);

    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat01-teste');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
    expect(env.PATH).toBe('/bin');
  });

  it('não define CLAUDE_CODE_OAUTH_TOKEN quando não há token salvo', () => {
    const env = estado.ambienteCredencial({ CLAUDE_CODE_OAUTH_TOKEN: 'sobra-de-outro-lugar' } as NodeJS.ProcessEnv);
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });
});

describe('cliente: prompt da conversa', () => {
  it('separa system prompt do histórico e marca a pergunta atual', () => {
    const { sistema, prompt } = cliente.montarPromptConversa([
      { role: 'system', content: 'Você é o monitorIA.' },
      { role: 'user', content: 'quem devo agendar?' },
      { role: 'assistant', content: 'A loja X.' },
      { role: 'user', content: 'e depois dela?' },
    ]);

    expect(sistema).toBe('Você é o monitorIA.');
    expect(prompt).toContain('<conversa_anterior>');
    expect(prompt).toContain('Usuário: quem devo agendar?');
    expect(prompt).toContain('monitorIA: A loja X.');
    expect(prompt).toContain('<pergunta_atual>\ne depois dela?\n</pergunta_atual>');
    // Pergunta atual não pode aparecer também no histórico — duplicar faria o
    // modelo achar que ela já foi respondida.
    expect(prompt.indexOf('e depois dela?')).toBe(prompt.lastIndexOf('e depois dela?'));
  });

  it('omite o bloco de histórico na primeira mensagem', () => {
    const { prompt } = cliente.montarPromptConversa([
      { role: 'system', content: 's' },
      { role: 'user', content: 'primeira' },
    ]);
    expect(prompt).not.toContain('<conversa_anterior>');
  });
});

describe('cliente: guardas antes de gastar chamada', () => {
  it('erra claro quando o CLI não existe no caminho configurado', async () => {
    process.env.CLAUDE_CLI_PATH = path.join(tmpDir, 'nao-existe.exe');
    recarregar();
    await expect(cliente.rodarCli('oi')).rejects.toThrow(/não encontrado/i);
  });

  it('erra claro quando a conta não está conectada', async () => {
    // CLI "encontrado" (qualquer arquivo existente serve pra passar da
    // detecção), mas sem token salvo: tem que falhar antes do spawn.
    const falso = path.join(tmpDir, 'claude.exe');
    fs.writeFileSync(falso, '');
    process.env.CLAUDE_CLI_PATH = falso;
    recarregar();
    await expect(cliente.rodarCli('oi')).rejects.toThrow(/não conectada/i);
  });

  it('diagnostico reporta CLI ausente e conta desconectada', async () => {
    process.env.CLAUDE_CLI_PATH = path.join(tmpDir, 'nao-existe.exe');
    recarregar();
    const d = await cliente.diagnostico();
    expect(d.cliInstalado).toBe(false);
    expect(d.autenticado).toBe(false);
  });
});

describe('login: token manual', () => {
  it('recusa texto que não é token do Claude Code', async () => {
    await expect(login.definirTokenManual('meu-token')).rejects.toThrow(/não parece um token/i);
    expect(estado.tokenSalvo()).toBe('');
  });

  it('não grava o token se a validação falhar', async () => {
    await expect(login.definirTokenManual('sk-ant-oat01-abcdefghijklmnopqrstuvwx', {
      validar: async () => { throw new Error('credencial rejeitada'); },
    })).rejects.toThrow(/credencial rejeitada/);
    expect(estado.tokenSalvo()).toBe('');
  });

  it('grava depois de validar', async () => {
    await login.definirTokenManual('sk-ant-oat01-abcdefghijklmnopqrstuvwx', { validar: async () => {} });
    expect(estado.tokenSalvo()).toBe('sk-ant-oat01-abcdefghijklmnopqrstuvwx');
  });

  it('logout limpa o token', async () => {
    await login.definirTokenManual('sk-ant-oat01-abcdefghijklmnopqrstuvwx', { validar: async () => {} });
    login.logout();
    expect(estado.tokenSalvo()).toBe('');
  });
});

describe('login: fluxo de link + código dirigindo o CLI', () => {
  /**
   * CLI de mentira: imprime um link de autorização, espera um código no stdin
   * e responde com um token — o mesmo roteiro do `claude setup-token` real.
   * Testa o fluxo inteiro (captura do link, envio do código, captura do
   * token) sem depender de instalação nem de conta.
   */
  function cliFalso(script: string) {
    const arquivo = path.join(tmpDir, 'claude-falso.cjs');
    fs.writeFileSync(arquivo, script);
    const cmd = path.join(tmpDir, process.platform === 'win32' ? 'claude.cmd' : 'claude.sh');
    fs.writeFileSync(
      cmd,
      process.platform === 'win32'
        ? `@echo off\r\n"${process.execPath}" "${arquivo}" %*\r\n`
        : `#!/bin/sh\nexec "${process.execPath}" "${arquivo}" "$@"\n`,
      { mode: 0o755 },
    );
    process.env.CLAUDE_CLI_PATH = cmd;
    recarregar();
  }

  const esperar = async (cond: () => boolean, ms = 15000) => {
    const limite = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > limite) throw new Error(`condição não atingida: ${login.statusLogin().mensagem}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  it('captura o link, repassa o código e salva o token impresso', async () => {
    cliFalso(`
      process.stdout.write('Abra: https://claude.ai/oauth/authorize?client_id=abc&code=true\\n');
      let buf = '';
      process.stdin.on('data', (d) => {
        buf += d.toString();
        if (buf.includes('\\n')) {
          if (buf.trim() === 'codigo-do-navegador') process.stdout.write('sk-ant-oat01-TOKENDETESTE1234567890abcd\\n');
          process.exit(0);
        }
      });
    `);

    login.iniciarLogin({ cwd: tmpDir });
    await esperar(() => login.statusLogin().estado === 'aguardando_codigo');
    expect(login.statusLogin().link).toBe('https://claude.ai/oauth/authorize?client_id=abc&code=true');

    login.enviarCodigo('codigo-do-navegador');
    await esperar(() => login.statusLogin().estado === 'concluido');
    expect(estado.tokenSalvo()).toBe('sk-ant-oat01-TOKENDETESTE1234567890abcd');
  });

  it('reporta erro (sem travar) quando o login não se completa', async () => {
    cliFalso(`process.stderr.write('nao autorizado\\n'); process.exit(1);`);
    login.iniciarLogin({ cwd: tmpDir });
    await esperar(() => login.statusLogin().estado === 'erro');
    expect(login.statusLogin().mensagem).toMatch(/não foi concluído/i);
    expect(estado.tokenSalvo()).toBe('');
  });

  it('recusa código quando não há login aguardando', () => {
    expect(() => login.enviarCodigo('123')).toThrow(/Nenhum login aguardando/i);
  });

  it('nunca expõe token nem a saída crua do CLI no status público', async () => {
    cliFalso(`process.stdout.write('https://claude.ai/oauth/authorize?x=1\\nsk-ant-oat01-SEGREDOSEGREDOSEGREDO123\\n');`);
    login.iniciarLogin({ cwd: tmpDir });
    await esperar(() => login.statusLogin().estado === 'concluido');
    expect(JSON.stringify(login.statusLogin())).not.toContain('sk-ant');
  });
});

describe('cliente: chamada headless ao CLI', () => {
  /**
   * CLI de mentira no formato de `claude -p --output-format json`: lê o prompt
   * do STDIN, e devolve como resultado tanto os argumentos que recebeu quanto o
   * prompt — dá pra verificar de uma vez que o prompt NÃO vai por argumento
   * (dossiê longo estouraria o limite de linha de comando do Windows), que as
   * flags de segurança estão todas lá, e que a saída JSON é parseada certo.
   *
   * Instalado como shim `.cmd` no Windows de propósito: é o caso da instalação
   * por npm, o que também exercita o caminho com shell de `spawnCli.cjs`.
   */
  function cliFalsoJson(resposta?: (dados: { args: string[]; prompt: string }) => unknown) {
    const script = path.join(tmpDir, 'cli-json.cjs');
    const corpo = resposta
      ? `const gerar = ${resposta.toString()};`
      : 'const gerar = (d) => ({ type: "result", subtype: "success", is_error: false, result: JSON.stringify(d) });';
    fs.writeFileSync(script, [
      corpo,
      'let entrada = "";',
      'process.stdin.on("data", (d) => { entrada += d; });',
      'process.stdin.on("end", () => {',
      '  process.stdout.write(JSON.stringify(gerar({ args: process.argv.slice(2), prompt: entrada })));',
      '});',
    ].join('\n'));

    const bin = path.join(tmpDir, process.platform === 'win32' ? 'claude.cmd' : 'claude.sh');
    fs.writeFileSync(
      bin,
      process.platform === 'win32'
        ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
        : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
      { mode: 0o755 },
    );
    process.env.CLAUDE_CLI_PATH = bin;
    recarregar();
    estado.salvarToken('sk-ant-oat01-abcdefghijklmnopqrstuvwx');
  }

  it('manda o prompt pelo STDIN e nega as ferramentas nativas do CLI', async () => {
    cliFalsoJson();
    const dados = await cliente.rodarCli('pergunta longa do usuário');
    const eco = JSON.parse(dados.result) as { args: string[]; prompt: string };

    expect(eco.prompt).toContain('pergunta longa do usuário');
    expect(eco.args.join(' ')).not.toContain('pergunta longa');
    expect(eco.args).toContain('-p');
    expect(eco.args).toContain('--disallowed-tools');
    expect(eco.args.join(' ')).toMatch(/Bash.*WebFetch/);
  });

  it('conversar devolve o texto final e libera só as ferramentas MCP da carteira', async () => {
    cliFalsoJson(() => ({ type: 'result', subtype: 'success', is_error: false, result: 'A loja X vence amanhã.' }));
    const resposta = await cliente.conversar({
      mensagens: [
        { role: 'system', content: 'Você é o monitorIA. Use "aspas" e 100% de cuidado.' },
        { role: 'user', content: 'quem vence amanhã?' },
      ],
      origem: 'chat',
    });
    expect(resposta).toBe('A loja X vence amanhã.');

    const config = JSON.parse(fs.readFileSync(cliente.CONFIG_MCP, 'utf8'));
    expect(config.mcpServers.carteira.env.CARTEIRA_IA_SEGREDO).toBe(cliente.SEGREDO_INTERNO);
    expect(config.mcpServers.carteira.args[0]).toMatch(/mcpServidor\.cjs$/);
  });

  it('system prompt com aspas e % não vira sintaxe de shell no caminho do shim .cmd', async () => {
    // Regressão: `shell: true` (obrigatório pra shim `.cmd`) não escapa
    // argumento. Um system prompt com `"`/`%`/`&` como argumento quebraria a
    // linha de comando — por isso ele vai pelo STDIN nesse caminho.
    cliFalsoJson();
    const sistema = 'Regra: use "aspas duplas" & 100% de cuidado | não > isso';
    const dados = await cliente.rodarCli('oi', { systemPrompt: sistema });
    const eco = JSON.parse(dados.result) as { args: string[]; prompt: string };

    if (process.platform === 'win32') {
      expect(eco.args).not.toContain('--append-system-prompt');
      expect(eco.prompt).toContain(sistema);
    } else {
      expect(eco.args).toContain('--append-system-prompt');
    }
  });

  it('traduz credencial expirada em instrução de reconectar', async () => {
    cliFalsoJson(() => ({ type: 'result', subtype: 'success', is_error: true, result: 'Login expired · Please run /login' }));
    await expect(cliente.rodarCli('oi')).rejects.toThrow(/reconecte em Configurações/i);
  });

  it('saída que não é um objeto de resultado vira erro, não resposta vazia', async () => {
    cliFalsoJson(() => 'isso não é um objeto de resultado');
    await expect(cliente.rodarCli('oi')).rejects.toThrow(/sem JSON válido/i);
  });
});
