import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// `server/` é CommonJS (sem build step) — ver comentário em dbSqlite.test.ts.
const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

/**
 * Toda leitura aqui é sobre uma pasta TEMPORÁRIA montada pelo teste, nunca sobre
 * `ALVOS_DIR` real: `leitor.cjs` recebe a raiz por parâmetro exatamente para
 * isso. (Já aconteceu neste projeto um teste escrever no OneDrive de produção
 * por causa de caminho derivado de config — ver DOSSIES_DIR no CLAUDE.md.)
 */
const leitor: typeof import('./leitor.cjs') = require('./leitor.cjs');

let raiz: string;

/** Linha no formato exato do arquivo de origem (nomes de coluna incluídos). */
function linha(over: Record<string, unknown> = {}) {
  return {
    ID_LOJA: 'loja_a',
    NOME_CLIENTE: 'OFICINA X (CM)',
    DESCRICAO_PRODUTO: 'Lubrificante',
    ANO: 2026,
    'MÊS': 'Julho',
    CODIGO_INTERNO_PRODUTO: 49953,
    CODIGO_REFERENCIA_PRODUTO: '15W40',
    NOME_FABRICANTE: 'HEXXLUB',
    'Receita Acumulada 11 Meses': 100,
    QTD: 4,
    ...over,
  };
}

function criarEmpresa(nome: string, abas: Record<string, Record<string, unknown>[]>) {
  const dir = path.join(raiz, nome);
  fs.mkdirSync(dir, { recursive: true });
  const wb = xlsx.utils.book_new();
  for (const [aba, linhas] of Object.entries(abas)) {
    // Aba vazia de verdade (é o caso do Gomec): folha sem `!ref`.
    xlsx.utils.book_append_sheet(wb, linhas.length ? xlsx.utils.json_to_sheet(linhas) : xlsx.utils.aoa_to_sheet([]), aba);
  }
  xlsx.writeFile(wb, path.join(dir, leitor.ALVOS_ARQUIVO));
}

beforeAll(() => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-alvos-test-'));
});

afterAll(() => {
  fs.rmSync(raiz, { recursive: true, force: true });
});

describe('leitor: escolha da aba', () => {
  it('ignora a primeira aba quando ela está vazia (caso Gomec)', () => {
    criarEmpresa('Gomecoide', { Dados: [], 'Dados (2)': [linha(), linha()] });
    const { aba, linhas } = leitor.lerLinhas(leitor.caminhoDaEmpresa('Gomecoide', raiz));
    expect(aba).toBe('Dados (2)');
    expect(linhas).toHaveLength(2);
  });

  it('escolhe a aba com mais linhas entre as compatíveis', () => {
    criarEmpresa('Duas', { Pequena: [linha()], Grande: [linha(), linha(), linha()] });
    expect(leitor.lerLinhas(leitor.caminhoDaEmpresa('Duas', raiz)).aba).toBe('Grande');
  });

  it('falha explícito quando nenhuma aba tem o header esperado', () => {
    criarEmpresa('Errada', { Outra: [{ Foo: 1, Bar: 2 }] });
    expect(() => leitor.lerLinhas(leitor.caminhoDaEmpresa('Errada', raiz)))
      .toThrow(/Nenhuma aba com o header esperado/);
  });

  it('lista só pastas que têm o arquivo', () => {
    fs.mkdirSync(path.join(raiz, 'PastaSemArquivo'), { recursive: true });
    const empresas = leitor.empresasDisponiveis(raiz);
    expect(empresas).toContain('Gomecoide');
    expect(empresas).not.toContain('PastaSemArquivo');
  });

  it('empresasDisponiveis devolve vazio (não lança) quando a pasta não existe', () => {
    expect(leitor.empresasDisponiveis(path.join(raiz, 'inexistente'))).toEqual([]);
  });

  it('não deixa o nome da empresa escapar da raiz', () => {
    const alvo = leitor.caminhoDaEmpresa('../../fora', raiz);
    expect(alvo.startsWith(raiz)).toBe(true);
  });
});

describe('leitor: normalização de linha', () => {
  it('traduz o mês em português para número', () => {
    expect(leitor.normalizarLinha(linha({ 'MÊS': 'Março' }))?.mes).toBe(3);
    expect(leitor.normalizarLinha(linha({ 'MÊS': 'MARCO' }))?.mes).toBe(3);
  });

  it('mês ausente vira 0 sem descartar a venda', () => {
    const n = leitor.normalizarLinha(linha({ 'MÊS': null }));
    expect(n?.mes).toBe(0);
    expect(n?.receita).toBe(100);
  });

  it('renomeia "Receita Acumulada 11 Meses" para receita da linha', () => {
    expect(leitor.normalizarLinha(linha({ 'Receita Acumulada 11 Meses': 42.5 }))?.receita).toBe(42.5);
  });

  it('cliente vazio recebe rótulo explícito', () => {
    expect(leitor.normalizarLinha(linha({ NOME_CLIENTE: '   ' }))?.cliente).toBe('(sem cliente)');
  });

  it('descarta só linha sem loja ou sem ano', () => {
    expect(leitor.normalizarLinha(linha({ ID_LOJA: '' }))).toBeNull();
    expect(leitor.normalizarLinha(linha({ ANO: null }))).toBeNull();
    expect(leitor.normalizarLinha(linha({ QTD: null }))).not.toBeNull();
  });
});

describe('leitor: produto não harmonizado', () => {
  it('marca AUSENTE DO MAPA, NÃO HARMONIZADO e vazio como não harmonizados', () => {
    for (const desc of ['AUSENTE DO MAPA', 'NÃO HARMONIZADO', 'nao harmonizado', '']) {
      expect(leitor.classificarProduto(desc).harmonizado, `${desc} deveria ser não harmonizado`).toBe(false);
    }
    expect(leitor.classificarProduto('Lubrificante').harmonizado).toBe(true);
  });

  it('não descarta a venda não harmonizada — ela entra no agregado', () => {
    const ag = leitor.agregar([
      leitor.normalizarLinha(linha({ DESCRICAO_PRODUTO: 'AUSENTE DO MAPA', 'Receita Acumulada 11 Meses': 10 })),
      leitor.normalizarLinha(linha({ 'Receita Acumulada 11 Meses': 90 })),
    ]);
    expect(ag.lojas[0].receita).toBe(100);
    expect(ag.produtos.find((p) => !p.harmonizado)?.receita).toBe(10);
  });
});

describe('leitor: agregação', () => {
  /**
   * O ponto central do módulo: no arquivo real, a mesma
   * (loja, cliente, produto, ano, mês) aparece dezenas ou centenas de vezes,
   * porque cada linha é uma VENDA. Somar é a única leitura correta — contar
   * linhas responderia "quantas vendas", não "quanto vendeu".
   */
  it('soma as vendas repetidas da mesma chave em vez de contar linhas', () => {
    const linhas = [
      linha({ 'Receita Acumulada 11 Meses': 99.6, QTD: 4 }),
      linha({ 'Receita Acumulada 11 Meses': 74.7, QTD: 3 }),
      linha({ 'Receita Acumulada 11 Meses': 49.8, QTD: 2 }),
    ].map((l) => leitor.normalizarLinha(l));
    const ag = leitor.agregar(linhas);

    expect(ag.cruzamento).toHaveLength(1);
    expect(ag.cruzamento[0].receita).toBe(224.1);
    expect(ag.cruzamento[0].qtd).toBe(9);
    expect(ag.cruzamento[0].vendas).toBe(3);
    expect(ag.totalLinhas).toBe(3);
  });

  it('separa por loja, cliente, produto e mês', () => {
    const linhas = [
      linha(),
      linha({ ID_LOJA: 'loja_b' }),
      linha({ NOME_CLIENTE: 'OFICINA Y (CM)' }),
      linha({ DESCRICAO_PRODUTO: 'Vela Ignição' }),
      linha({ 'MÊS': 'Agosto' }),
    ].map((l) => leitor.normalizarLinha(l));
    const ag = leitor.agregar(linhas);

    expect(ag.lojas.map((l) => l.loja).sort()).toEqual(['loja_a', 'loja_b']);
    expect(ag.periodos).toEqual(['2026-07', '2026-08']);
    expect(ag.clientes.filter((c) => c.loja === 'loja_a').length).toBe(2);
    expect(ag.produtos.filter((p) => p.loja === 'loja_a').length).toBe(2);
    expect(ag.cruzamento).toHaveLength(5);
  });

  it('ordena clientes e produtos por receita, do maior para o menor', () => {
    const ag = leitor.agregar([
      linha({ NOME_CLIENTE: 'PEQUENO', 'Receita Acumulada 11 Meses': 10 }),
      linha({ NOME_CLIENTE: 'GRANDE', 'Receita Acumulada 11 Meses': 1000 }),
    ].map((l) => leitor.normalizarLinha(l)));
    expect(ag.clientes.map((c) => c.cliente)).toEqual(['GRANDE', 'PEQUENO']);
  });

  it('lerEAgregar informa a aba usada e quantas linhas foram descartadas', () => {
    criarEmpresa('ComRuim', { Dados: [linha(), linha({ ID_LOJA: '' })] });
    const ag = leitor.lerEAgregar('ComRuim', raiz);
    expect(ag.aba).toBe('Dados');
    expect(ag.brutas).toBe(2);
    expect(ag.descartadas).toBe(1);
    expect(ag.totalLinhas).toBe(1);
  });
});

/**
 * O caminho por bytes (`leitorBytes.cjs`) existe por um bug real de produção:
 * o SheetJS engolia em silêncio o erro de "aba grande demais" e usava uma
 * aba menor errada (medido em Altese, Gomec, Motobras — vínculo gravado com
 * dado incompleto antes de existir essa ligação). Como não dá pra ter um
 * fixture de 400+ MB no teste, `opts.limiteFallback` força esse caminho num
 * arquivo pequeno — o que garante é a LIGAÇÃO entre `lerLinhas` e
 * `leitorBytes`, não o parser em si (esse já tem sua própria suíte).
 */
describe('leitor: caminho por bytes (arquivo "grande demais")', () => {
  it('com o limite baixo, usa leitorBytes e chega ao mesmo resultado do caminho normal', () => {
    criarEmpresa('Grandona', { Dados: [linha(), linha({ ID_LOJA: 'loja_b', QTD: 7 })] });
    const caminho = leitor.caminhoDaEmpresa('Grandona', raiz);

    const normal = leitor.lerLinhas(caminho);
    const porBytes = leitor.lerLinhas(caminho, { limiteFallback: 1 });

    expect(porBytes.linhas).toEqual(normal.linhas);
    expect(porBytes.aba).toBe(normal.aba);
    expect(porBytes.descartadas).toBe(0);
  });

  it('descarta linha inválida também no caminho por bytes', () => {
    criarEmpresa('GrandonaRuim', { Dados: [linha(), linha({ ID_LOJA: '' })] });
    const caminho = leitor.caminhoDaEmpresa('GrandonaRuim', raiz);
    const r = leitor.lerLinhas(caminho, { limiteFallback: 1 });
    expect(r.brutas).toBe(2);
    expect(r.descartadas).toBe(1);
  });

  it('sem aba com header compatível, falha explícito também no caminho por bytes', () => {
    criarEmpresa('GrandonaSemHeader', { Dados: [{ Foo: 1, Bar: 2 }] });
    const caminho = leitor.caminhoDaEmpresa('GrandonaSemHeader', raiz);
    expect(() => leitor.lerLinhas(caminho, { limiteFallback: 1 }))
      .toThrow(/Nenhuma aba com o header esperado/);
  });

  it('lerEAgregar repassa opts.limiteFallback até o fim da cadeia', () => {
    criarEmpresa('GrandonaAgregada', { Dados: [linha(), linha({ ID_LOJA: 'loja_b' })] });
    const ag = leitor.lerEAgregar('GrandonaAgregada', raiz, { limiteFallback: 1 });
    expect(ag.lojas.map((l) => l.loja).sort()).toEqual(['loja_a', 'loja_b']);
  });
});
