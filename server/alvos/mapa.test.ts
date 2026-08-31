import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * Cenário destes testes é o REAL, com os nomes que estão no cadastro hoje:
 * "Aliança - Itaboraí" e "Aliança - Cabo Frio" (análise segmentada), contra os
 * dois ids que o arquivo mockado traz — `alianca_itaborai` e
 * `alianca_itaborai_CF`. É o caso que quebra qualquer match por substring:
 * um id é prefixo do outro, e o id da loja de Cabo Frio contém "itaborai".
 */

let tmp: string;
let vinculosPath: string;
let mapa: typeof import('./mapa.cjs');

const CLIENTES = [
  { id: 'c-itab', empresa: 'Aliança - Itaboraí', grupo: 'Aliança', estado: 'Ativo', tipoAnalise: 'segmentado' },
  { id: 'c-cabo', empresa: 'Aliança - Cabo Frio', grupo: 'Aliança', estado: 'Ativo', tipoAnalise: 'segmentado' },
  { id: 'c-outro', empresa: 'Mineirão', grupo: '', estado: 'Ativo', tipoAnalise: 'unitaria' },
];

/** Agregado mínimo no formato de `leitor.agregar`, com os balcões de cada loja. */
const AGREGADO = {
  lojas: [
    { loja: 'alianca_itaborai', receita: 12_000_000 },
    { loja: 'alianca_itaborai_CF', receita: 4_000_000 },
  ],
  clientes: [
    { loja: 'alianca_itaborai', cliente: 'CONSUMIDOR ITABORAI (SA)', receita: 12_726_544 },
    { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', receita: 724_250 },
    { loja: 'alianca_itaborai_CF', cliente: 'CONSUMIDOR CABO FRIO (SA)', receita: 4_126_663 },
    // Existe no arquivo real: um resíduo do balcão da OUTRA cidade lançado
    // nesta loja (R$ 182 contra R$ 4,1 mi). Se contar como pista, "Itaboraí"
    // vira identidade das duas lojas.
    { loja: 'alianca_itaborai_CF', cliente: 'CONSUMIDOR ITABORAI (SA)', receita: 182 },
  ],
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-alvos-mapa-'));
  vinculosPath = path.join(tmp, 'alvos-vinculos.json');
  // Sem isto o módulo gravaria em DATA_DIR — o OneDrive de produção.
  process.env.ALVOS_VINCULOS_PATH = vinculosPath;
  delete require.cache[require.resolve('./mapa.cjs')];
  mapa = require('./mapa.cjs');
});

afterEach(() => {
  delete process.env.ALVOS_VINCULOS_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('mapa: pistas de identidade da loja', () => {
  it('usa o balcão da loja para descobrir a cidade que o id não diz', () => {
    const cf = mapa.pistasDaLoja(AGREGADO, 'alianca_itaborai_CF');
    expect([...cf.balcao]).toEqual(expect.arrayContaining(['cabo', 'frio']));
    // A loja de Itaboraí não pode herdar as pistas da outra.
    expect(mapa.pistasDaLoja(AGREGADO, 'alianca_itaborai').balcao.has('cabo')).toBe(false);
  });

  it('ignora balcão residual da outra cidade (materialidade)', () => {
    const cf = mapa.pistasDaLoja(AGREGADO, 'alianca_itaborai_CF');
    expect(cf.balcao.has('cabo')).toBe(true);
    expect(cf.balcao.has('itaborai')).toBe(false);
  });

  it('mantém as pistas do id separadas das do balcão', () => {
    // O id da loja de Cabo Frio contém "itaborai": é pista a favor do cliente
    // errado, e não pode entrar no mesmo conjunto que o balcão.
    const cf = mapa.pistasDaLoja(AGREGADO, 'alianca_itaborai_CF');
    expect(cf.id.has('itaborai')).toBe(true);
    expect(cf.balcao.has('itaborai')).toBe(false);
  });

  it('ignora clientes que não são balcão', () => {
    expect(mapa.pistasDaLoja(AGREGADO, 'alianca_itaborai').balcao.has('eduardo')).toBe(false);
  });

  it('extrai a parte da loja do nome "Grupo - Loja"', () => {
    expect(mapa.trechoDaLoja({ empresa: 'Aliança - Cabo Frio' })).toBe('Cabo Frio');
    expect(mapa.trechoDaLoja({ empresa: 'Mineirão' })).toBe('Mineirão');
  });
});

describe('mapa: sugestão de vínculo', () => {
  it('acerta as duas lojas do grupo segmentado, sem trocar uma pela outra', () => {
    const sug = mapa.sugerir('Dados Mockados', AGREGADO, CLIENTES);
    const porLoja = Object.fromEntries(sug.map((s) => [s.loja, s]));

    expect(porLoja.alianca_itaborai.sugestao?.clientId).toBe('c-itab');
    expect(porLoja.alianca_itaborai_CF.sugestao?.clientId).toBe('c-cabo');
    expect(porLoja.alianca_itaborai.ambiguo).toBe(false);

    // "Aliança - Itaboraí" ainda aparece como candidato da loja de Cabo Frio
    // (o id dela contém "itaborai"), mas NUNCA com confiança alta — senão as
    // duas opções da tela pareceriam igualmente confiáveis.
    const errado = porLoja.alianca_itaborai_CF.candidatos.find((c) => c.clientId === 'c-itab');
    expect(errado?.confianca).toBe('media');
    expect(errado?.motivo).toMatch(/só o ID_LOJA/);
  });

  it('não sugere nada com confiança quando só o grupo casa', () => {
    // Loja sem balcão nomeado: sobra apenas o token "alianca", que serve para as
    // duas lojas igualmente — sugerir uma seria escolher no lugar do usuário.
    const semPista = {
      lojas: [{ loja: 'alianca_penha', receita: 1000 }],
      clientes: [{ loja: 'alianca_penha', cliente: 'OFICINA Z (CM)', receita: 1000 }],
    };
    const [s] = mapa.sugerir('X', semPista, CLIENTES);
    expect(s.sugestao).toBeNull();
    expect(s.candidatos.every((c) => c.confianca === 'baixa')).toBe(true);
    expect(s.candidatos[0].motivo).toMatch(/não distingue/);
  });

  it('não sugere cliente inativo', () => {
    const inativos = CLIENTES.map((c) => ({ ...c, estado: 'Inativo' }));
    expect(mapa.sugerir('X', AGREGADO, inativos).every((s) => s.candidatos.length === 0)).toBe(true);
  });

  it('loja sem nenhum candidato não vira sugestão nem erro', () => {
    const [s] = mapa.sugerir('X', { lojas: [{ loja: '0001', receita: 5 }], clientes: [] }, CLIENTES);
    expect(s.sugestao).toBeNull();
    expect(s.candidatos).toEqual([]);
  });
});

describe('mapa: persistência do vínculo', () => {
  it('ausência de arquivo é estado normal, não erro', () => {
    expect(mapa.carregar(vinculosPath)).toEqual({});
    expect(mapa.clienteDaLoja('Dados Mockados', 'alianca_itaborai', vinculosPath)).toBeNull();
  });

  it('grava e lê o vínculo de uma loja', () => {
    mapa.vincular('Dados Mockados', 'alianca_itaborai', 'c-itab', vinculosPath);
    expect(mapa.clienteDaLoja('Dados Mockados', 'alianca_itaborai', vinculosPath)).toBe('c-itab');
  });

  it('vincular uma loja preserva as outras e as outras empresas', () => {
    mapa.vincular('Dados Mockados', 'alianca_itaborai', 'c-itab', vinculosPath);
    mapa.vincular('Dados Mockados', 'alianca_itaborai_CF', 'c-cabo', vinculosPath);
    mapa.vincular('Mineirao', '0001', 'c-outro', vinculosPath);

    const tudo = mapa.carregar(vinculosPath);
    expect(tudo['Dados Mockados']).toEqual({ alianca_itaborai: 'c-itab', alianca_itaborai_CF: 'c-cabo' });
    expect(tudo.Mineirao).toEqual({ '0001': 'c-outro' });
  });

  it('vincular com clientId vazio remove o vínculo', () => {
    mapa.vincular('Dados Mockados', 'alianca_itaborai', 'c-itab', vinculosPath);
    mapa.vincular('Dados Mockados', 'alianca_itaborai', null, vinculosPath);
    expect(mapa.clienteDaLoja('Dados Mockados', 'alianca_itaborai', vinculosPath)).toBeNull();
  });

  it('arquivo corrompido não derruba a leitura', () => {
    fs.writeFileSync(vinculosPath, '{ isto não é json');
    expect(mapa.carregar(vinculosPath)).toEqual({});
  });

  it('sugerir marca a loja já vinculada', () => {
    mapa.vincular('Dados Mockados', 'alianca_itaborai', 'c-itab', vinculosPath);
    delete require.cache[require.resolve('./mapa.cjs')];
    const fresco: typeof import('./mapa.cjs') = require('./mapa.cjs');
    const [primeira] = fresco.sugerir('Dados Mockados', AGREGADO, CLIENTES);
    expect(primeira.vinculado).toBe('c-itab');
  });
});
