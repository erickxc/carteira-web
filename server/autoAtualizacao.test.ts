import { createRequire } from 'module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * Auto-atualização: o risco desta feature não é "não atualizar", é REINICIAR
 * o servidor na cara de alguém que está usando (a API cai por segundos, e uma
 * pergunta ao monitorIA leva 30-120s). Por isso o que está coberto aqui é
 * principalmente a recusa: em voo, uso recente, versão igual.
 */
type Modulo = typeof import('./autoAtualizacao.cjs');

let mod: Modulo;

function carregar(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  delete require.cache[require.resolve('./autoAtualizacao.cjs')];
  return require('./autoAtualizacao.cjs') as Modulo;
}

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  mod = carregar({ AUTO_ATUALIZACAO: undefined, AUTO_ATUALIZACAO_OCIOSO_MIN: '10' });
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
  vi.useRealTimers();
});

/** Simula uma requisição passando pelo middleware, do começo ao fim. */
function requisicao(url: string, method = 'GET') {
  const ouvintes: Record<string, (() => void)[]> = {};
  const res = { on: (evento: string, cb: () => void) => { (ouvintes[evento] ??= []).push(cb); } };
  const next = vi.fn();
  mod.middlewareAtividade({ originalUrl: url, method } as never, res as never, next);
  expect(next).toHaveBeenCalled();
  return { finalizar: () => ouvintes.finish?.forEach((cb) => cb()) };
}

describe('autoAtualizacao: o que conta como "alguém usando"', () => {
  it('polling de tela não conta como atividade', () => {
    for (const url of ['/api/status/base', '/api/fila/status', '/api/atualizacao/status']) {
      expect(mod.EH_POLLING(url)).toBe(true);
    }
  });

  it('rota de dado normal conta como atividade', () => {
    expect(mod.EH_POLLING('/api/clients')).toBe(false);
    expect(mod.EH_POLLING('/api/ia/chat')).toBe(false);
  });

  it('atividade recente impede aplicar', () => {
    requisicao('/api/clients').finalizar();
    expect(mod.podeAplicar()).toBe(false);
  });

  it('ociosidade suficiente libera aplicar', () => {
    const { finalizar } = requisicao('/api/clients');
    finalizar();
    // 11 minutos depois (ocioso exigido = 10)
    expect(mod.podeAplicar(Date.now() + 11 * 60_000)).toBe(true);
  });

  it('requisição EM VOO impede aplicar mesmo com o relógio adiantado', () => {
    // Sem chamar `finalizar`: é o caso da pergunta ao monitorIA em andamento.
    requisicao('/api/ia/chat', 'POST');
    expect(mod.podeAplicar(Date.now() + 60 * 60_000)).toBe(false);
  });

  it('polling sozinho não segura a atualização', () => {
    const inicio = Date.now();
    requisicao('/api/clients').finalizar();
    // Só polling depois disso — não deve renovar a atividade.
    requisicao('/api/status/base').finalizar();
    requisicao('/api/atualizacao/status').finalizar();
    expect(mod.podeAplicar(inicio + 11 * 60_000)).toBe(true);
  });
});

describe('autoAtualizacao: comparação de versão', () => {
  it('maior/menor/igual', () => {
    expect(mod.versaoMaiorQue('1.4.15', '1.4.14')).toBe(true);
    expect(mod.versaoMaiorQue('1.5.0', '1.4.99')).toBe(true);
    expect(mod.versaoMaiorQue('1.4.14', '1.4.14')).toBe(false);
    expect(mod.versaoMaiorQue('1.4.13', '1.4.14')).toBe(false);
  });
});

describe('autoAtualizacao: quando o laço nem liga', () => {
  it('desligada por env não agenda nada', () => {
    const m = carregar({ AUTO_ATUALIZACAO: '0', CARTEIRA_LAUNCHER_EXE: 'C:\\x\\2D_Carteira.exe' });
    const log = vi.fn();
    expect(m.iniciarAutoAtualizacao({ aplicar: vi.fn(), log })).toBeNull();
    expect(log.mock.calls.join(' ')).toMatch(/desligada/i);
  });

  it('sem .exe (dev/npm start) não agenda nada — não há zip pra instalar', () => {
    const m = carregar({ AUTO_ATUALIZACAO: undefined, CARTEIRA_LAUNCHER_EXE: undefined });
    const log = vi.fn();
    expect(m.iniciarAutoAtualizacao({ aplicar: vi.fn(), log })).toBeNull();
    expect(log.mock.calls.join(' ')).toMatch(/não foi aberto pelo \.exe/i);
  });

  it('com .exe e versão igual à publicada, não aplica', () => {
    const m = carregar({ AUTO_ATUALIZACAO: undefined, CARTEIRA_LAUNCHER_EXE: 'C:\\x\\2D_Carteira.exe' });
    const aplicar = vi.fn();
    vi.useFakeTimers();
    m.iniciarAutoAtualizacao({ aplicar, log: vi.fn() });
    // `versaoNovaDisponivel` compara o package.json local com o latest.json do
    // OneDrive; nesta máquina de teste eles batem (ou o manifesto não existe),
    // então nada deve ser aplicado por mais que o tempo passe.
    vi.advanceTimersByTime(24 * 3_600_000);
    expect(aplicar).not.toHaveBeenCalled();
  });
});

describe('autoAtualizacao: statusAuto', () => {
  it('reporta o que a tela precisa mostrar', () => {
    requisicao('/api/clients').finalizar();
    const s = mod.statusAuto();
    expect(s.ligada).toBe(true);
    expect(s.aguardandoOcioso).toBe(false);
    expect(s.ociosoNecessarioSegundos).toBe(600);
    expect(s.requisicoesEmVoo).toBe(0);
  });
});
