import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * O LLM é injetado (`opts.gerarJSON`) em todos os casos: nenhum teste aqui fala
 * com o Ollama. O que está sob teste não é a qualidade da resposta do modelo, e
 * sim o que o código FAZ com ela — recusar id inventado, e nunca deixar a pessoa
 * sem uma pergunta que resolva o caso.
 */

let tmp: string;
let vinculosPath: string;
let mapaIA: typeof import('./mapaIA.cjs');
let mapa: typeof import('./mapa.cjs');

const CLIENTES = [
  { id: 'c-itab', empresa: 'Aliança - Itaboraí', grupo: 'Aliança', estado: 'Ativo' },
  { id: 'c-cabo', empresa: 'Aliança - Cabo Frio', grupo: 'Aliança', estado: 'Ativo' },
];

/** Loja sem balcão nomeado e sem sigla: a heurística não decide. */
const SEM_PISTA = {
  lojas: [{ loja: 'alianca_penha', receita: 1000 }],
  clientes: [{ loja: 'alianca_penha', cliente: 'OFICINA Z (CM)', receita: 1000 }],
};

/** Caso resolvido pela sigla: `_CF` = Cabo Frio. */
const COM_SIGLA = {
  lojas: [{ loja: 'alianca_itaborai_CF', receita: 4_000_000 }],
  clientes: [{ loja: 'alianca_itaborai_CF', cliente: 'OFICINA W (CM)', receita: 4_000_000 }],
};

/**
 * O caso que ninguém resolve pelo arquivo: ids numéricos e balcão sem cidade.
 * É o Mineirão real (`0001`/`0002`, "CONSUMIDOR ESPECIAL"). A única saída é
 * perguntar para quem conhece o cliente.
 */
const MINEIRAO = {
  lojas: [{ loja: '0001', receita: 500_000 }, { loja: '0002', receita: 300_000 }],
  clientes: [
    { loja: '0001', cliente: 'CONSUMIDOR ESPECIAL', receita: 500_000 },
    { loja: '0002', cliente: 'CONSUMIDOR ESPECIAL', receita: 300_000 },
  ],
};
const CLIENTES_MINEIRAO = [
  { id: 'm-matriz', empresa: 'Mineirão - Matriz', grupo: 'Mineirão', estado: 'Ativo' },
  { id: 'm-filial', empresa: 'Mineirão - Filial', grupo: 'Mineirão', estado: 'Ativo' },
];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-alvos-ia-'));
  vinculosPath = path.join(tmp, 'v.json');
  process.env.ALVOS_VINCULOS_PATH = vinculosPath;
  for (const m of ['./mapa.cjs', './mapaIA.cjs']) delete require.cache[require.resolve(m)];
  mapa = require('./mapa.cjs');
  mapaIA = require('./mapaIA.cjs');
});

afterEach(() => {
  delete process.env.ALVOS_VINCULOS_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('mapaIA: quando o LLM é chamado', () => {
  it('não chama o LLM quando a heurística já resolveu', async () => {
    let chamadas = 0;
    const r = await mapaIA.validarComIA('X', COM_SIGLA, CLIENTES, {
      gerarJSON: async () => { chamadas += 1; return { clientId: 'c-cabo' }; },
    });
    expect(chamadas).toBe(0);
    expect(r[0].sugestao?.clientId).toBe('c-cabo');
    expect(r[0].ia).toBeNull();
  });

  it('chama o LLM quando a heurística não tem resposta', async () => {
    const r = await mapaIA.validarComIA('X', SEM_PISTA, CLIENTES, {
      gerarJSON: async () => ({ clientId: 'c-cabo', confianca: 'media', motivo: 'Penha é mais perto', situacao: 'loja pequena' }),
    });
    expect(r[0].ia?.clientId).toBe('c-cabo');
    expect(r[0].ia?.origem).toBe('ollama');
    expect(r[0].ia?.situacao).toBe('loja pequena');
  });

  it('revisarTodas faz o LLM opinar mesmo no que a heurística resolveu', async () => {
    const r = await mapaIA.validarComIA('X', COM_SIGLA, CLIENTES, {
      revisarTodas: true,
      gerarJSON: async () => ({ clientId: 'c-cabo', confianca: 'alta', motivo: 'sigla CF' }),
    });
    expect(r[0].ia?.divergeDaHeuristica).toBe(false);
  });

  it('marca divergência entre LLM e heurística', async () => {
    const r = await mapaIA.validarComIA('X', COM_SIGLA, CLIENTES, {
      revisarTodas: true,
      gerarJSON: async () => ({ clientId: 'c-itab', confianca: 'alta', motivo: 'o id diz itaborai' }),
    });
    expect(r[0].sugestao?.clientId).toBe('c-cabo');
    expect(r[0].ia?.clientId).toBe('c-itab');
    expect(r[0].ia?.divergeDaHeuristica).toBe(true);
  });
});

describe('mapaIA: indecisão vira pergunta, nunca silêncio', () => {
  it('devolve a pergunta escrita pelo LLM quando ele não decide', async () => {
    const r = await mapaIA.validarComIA('Mineirao', MINEIRAO, CLIENTES_MINEIRAO, {
      gerarJSON: async () => ({
        clientId: null,
        situacao: 'as duas lojas só têm balcão, sem cidade no nome',
        pergunta: 'No Mineirão, qual loja é a matriz: 0001 ou 0002?',
      }),
    });
    expect(r[0].ia?.clientId).toBeNull();
    expect(r[0].ia?.pergunta).toMatch(/qual loja é a matriz/);
    expect(r[0].ia?.origem).toBe('ollama');
    expect(r[0].ia?.situacao).toMatch(/sem cidade/);
  });

  it('monta pergunta própria quando o LLM não escreve nenhuma', async () => {
    const r = await mapaIA.validarComIA('Mineirao', MINEIRAO, CLIENTES_MINEIRAO, {
      gerarJSON: async () => ({ clientId: null, pergunta: null }),
    });
    expect(r[0].ia?.pergunta).toContain('0001');
    expect(r[0].ia?.pergunta).toContain('Mineirão - Matriz');
    expect(r[0].ia?.origem).toBe('codigo');
  });

  it('id inventado é tratado como indecisão e também gera pergunta', async () => {
    const r = await mapaIA.validarComIA('X', SEM_PISTA, CLIENTES, {
      gerarJSON: async () => ({ clientId: 'c-inventado', confianca: 'alta', motivo: 'tenho certeza' }),
    });
    expect(r[0].ia?.descartado).toBe('cliente fora da lista');
    expect(r[0].ia?.bruto).toBe('c-inventado');
    expect(r[0].ia?.clientId).toBeNull();
    expect(r[0].ia?.pergunta).toBeTruthy();
  });

  it('trata a string "null" como indecisão, não como id', async () => {
    const r = await mapaIA.validarComIA('X', SEM_PISTA, CLIENTES, {
      gerarJSON: async () => ({ clientId: 'null' }),
    });
    expect(r[0].ia?.clientId).toBeNull();
    expect(r[0].ia?.descartado).toBeUndefined();
    expect(r[0].ia?.pergunta).toBeTruthy();
  });

  it('Ollama fora do ar ainda entrega a pergunta', async () => {
    const r = await mapaIA.validarComIA('X', SEM_PISTA, CLIENTES, {
      gerarJSON: async () => { throw new Error('Ollama indisponível'); },
    });
    expect(r[0].ia?.erro).toMatch(/indisponível/);
    expect(r[0].ia?.pergunta).toBeTruthy();
    expect(r[0].ia?.opcoes?.length).toBeGreaterThan(1);
  });

  it('loja sem candidato nenhum pergunta sem gastar chamada de LLM', async () => {
    let chamadas = 0;
    const r = await mapaIA.validarComIA('X', { lojas: [{ loja: '0001', receita: 5 }], clientes: [] }, CLIENTES, {
      gerarJSON: async () => { chamadas += 1; return {}; },
    });
    expect(chamadas).toBe(0);
    expect(r[0].ia?.pergunta).toContain('0001');
  });

  it('as opções são do código e sempre incluem uma saída negativa', async () => {
    const r = await mapaIA.validarComIA('Mineirao', MINEIRAO, CLIENTES_MINEIRAO, {
      gerarJSON: async () => ({ clientId: null, pergunta: 'qual é a matriz?' }),
    });
    const opcoes = r[0].ia?.opcoes ?? [];
    expect(opcoes.map((o) => o.rotulo)).toContain('Nenhum destes / é outro cliente');
    expect(opcoes.filter((o) => o.clientId === null)).toHaveLength(1);
  });

  it('confiança fora do vocabulário cai para baixa', async () => {
    const r = await mapaIA.validarComIA('X', SEM_PISTA, CLIENTES, {
      gerarJSON: async () => ({ clientId: 'c-cabo', confianca: 'absoluta' }),
    });
    expect(r[0].ia?.confianca).toBe('baixa');
  });

  it('erro numa loja não derruba as outras', async () => {
    let n = 0;
    const r = await mapaIA.validarComIA('Mineirao', MINEIRAO, CLIENTES_MINEIRAO, {
      gerarJSON: async () => {
        n += 1;
        if (n === 1) throw new Error('timeout');
        return { clientId: 'm-filial', confianca: 'baixa', motivo: 'a menor é a filial' };
      },
    });
    expect(r[0].ia?.erro).toMatch(/timeout/);
    expect(r[1].ia?.clientId).toBe('m-filial');
  });
});

describe('mapaIA: interpretar a resposta da pessoa', () => {
  const candidatos = [
    { clientId: 'm-matriz', empresa: 'Mineirão - Matriz' },
    { clientId: 'm-filial', empresa: 'Mineirão - Filial' },
  ];
  const nunca = async () => { throw new Error('não deveria chamar o LLM'); };

  it('resolve sem LLM quando a resposta cita o nome da loja', async () => {
    const r = await mapaIA.interpretarResposta('qual é a matriz?', 'é a Matriz', candidatos, { gerarJSON: nunca });
    expect(r.clientId).toBe('m-matriz');
    expect(r.origem).toBe('texto');
  });

  it('resolve sem LLM quando a resposta cita o id', async () => {
    const r = await mapaIA.interpretarResposta('?', 'o certo é m-filial', candidatos, { gerarJSON: nunca });
    expect(r.clientId).toBe('m-filial');
  });

  it('reconhece "nenhum" como resposta legítima, distinta de não entendida', async () => {
    const r = await mapaIA.interpretarResposta('?', 'nenhum desses', candidatos, { gerarJSON: nunca });
    expect(r.entendido).toBe(true);
    expect(r.naoEhNenhum).toBe(true);
    expect(r.clientId).toBeNull();
  });

  it('cai no LLM só quando o texto não casa direto', async () => {
    let chamadas = 0;
    const r = await mapaIA.interpretarResposta('qual é a matriz?', 'a maior das duas, claro', candidatos, {
      gerarJSON: async () => { chamadas += 1; return { clientId: 'm-matriz', motivo: 'a maior é a matriz' }; },
    });
    expect(chamadas).toBe(1);
    expect(r.clientId).toBe('m-matriz');
    expect(r.origem).toBe('ollama');
  });

  it('recusa id inventado também na interpretação da resposta', async () => {
    const r = await mapaIA.interpretarResposta('?', 'sei lá', candidatos, {
      gerarJSON: async () => ({ clientId: 'm-outra-coisa' }),
    });
    expect(r.clientId).toBeNull();
    expect(r.entendido).toBe(false);
  });

  it('resposta vazia não gasta chamada de LLM', async () => {
    const r = await mapaIA.interpretarResposta('?', '   ', candidatos, { gerarJSON: nunca });
    expect(r.entendido).toBe(false);
    expect(r.motivo).toMatch(/vazia/);
  });

  it('não decide quando a resposta serve para os dois candidatos', async () => {
    // "Mineirão" está no nome dos dois — comparar o nome inteiro casaria ambos.
    const r = await mapaIA.interpretarResposta('?', 'é o Mineirão', candidatos, {
      gerarJSON: async () => ({ clientId: null, naoEhNenhum: false, motivo: 'ambíguo' }),
    });
    expect(r.entendido).toBe(false);
  });

  it('falha do LLM na interpretação não vira escolha', async () => {
    const r = await mapaIA.interpretarResposta('?', 'a maior', candidatos, {
      gerarJSON: async () => { throw new Error('offline'); },
    });
    expect(r.clientId).toBeNull();
    expect(r.entendido).toBe(false);
    expect(r.motivo).toMatch(/offline/);
  });
});

describe('mapaIA: gravar depois da resposta', () => {
  const candidatos = [
    { clientId: 'm-matriz', empresa: 'Mineirão - Matriz' },
    { clientId: 'm-filial', empresa: 'Mineirão - Filial' },
  ];

  it('grava o vínculo confirmado', () => {
    mapaIA.aplicarResposta('Mineirao', '0001', 'm-matriz', candidatos, vinculosPath);
    expect(mapa.clienteDaLoja('Mineirao', '0001', vinculosPath)).toBe('m-matriz');
  });

  it('recusa gravar id fora dos candidatos', () => {
    expect(() => mapaIA.aplicarResposta('Mineirao', '0001', 'x', candidatos, vinculosPath))
      .toThrow(/não está entre os candidatos/);
    expect(mapa.clienteDaLoja('Mineirao', '0001', vinculosPath)).toBeNull();
  });

  it('"nenhum destes" limpa o vínculo em vez de gravar lixo', () => {
    mapaIA.aplicarResposta('Mineirao', '0001', 'm-matriz', candidatos, vinculosPath);
    mapaIA.aplicarResposta('Mineirao', '0001', null, candidatos, vinculosPath);
    expect(mapa.clienteDaLoja('Mineirao', '0001', vinculosPath)).toBeNull();
  });
});
