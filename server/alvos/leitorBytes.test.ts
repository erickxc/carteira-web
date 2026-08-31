import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');
const leitorBytes: typeof import('./leitorBytes.cjs') = require('./leitorBytes.cjs');

/**
 * A validação central deste arquivo não é "o parser por bytes está certo" em
 * isolado — é que ele produz o MESMO resultado que `xlsx.readFile` +
 * `sheet_to_json` (o caminho normal, já testado em `leitor.test.ts`) num
 * arquivo pequeno o bastante pros dois caminhos conseguirem ler. Não dá pra
 * testar com um arquivo de 500 MB de verdade — a prova de corretude é essa
 * comparação cruzada, não um fixture gigante.
 */

let dir: string;

const LINHA = (over: Record<string, unknown> = {}) => ({
  ID_LOJA: 'loja_a', NOME_CLIENTE: 'OFICINA X (CM)', DESCRICAO_PRODUTO: 'Kit Amortecedor',
  ANO: 2026, 'MÊS': 'Julho', CODIGO_INTERNO_PRODUTO: 49953, CODIGO_REFERENCIA_PRODUTO: '15W40',
  NOME_FABRICANTE: 'HEXXLUB', 'Receita Acumulada 11 Meses': 99.6, QTD: 4,
  ...over,
});

const COLUNAS_OBRIGATORIAS = ['ID_LOJA', 'NOME_CLIENTE', 'DESCRICAO_PRODUTO', 'ANO', 'QTD'];

function escreverXlsx(nome: string, abas: Record<string, Record<string, unknown>[]>, comSharedStrings = false) {
  const caminho = path.join(dir, nome);
  const wb = xlsx.utils.book_new();
  for (const [aba, linhas] of Object.entries(abas)) {
    // `bookSST: true` faz o SheetJS escrever com sharedStrings.xml em vez de
    // inlineStr — testa o caminho de resolução por índice, não só o inline.
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(linhas), aba);
  }
  xlsx.writeFile(wb, caminho, comSharedStrings ? { bookSST: true } : undefined);
  return caminho;
}

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-leitorbytes-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('leitorBytes: precisaFallback', () => {
  it('arquivo pequeno não precisa de fallback', () => {
    const caminho = escreverXlsx('pequeno.xlsx', { Dados: [LINHA()] });
    expect(leitorBytes.precisaFallback(caminho)).toBe(false);
  });

  it('limite injetável baixo força o fallback mesmo num arquivo pequeno', () => {
    const caminho = escreverXlsx('pequeno2.xlsx', { Dados: [LINHA()] });
    expect(leitorBytes.precisaFallback(caminho, 10)).toBe(true);
  });
});

describe('leitorBytes: lerLinhasPorBytes — equivalente ao caminho normal', () => {
  it('lê as mesmas linhas que xlsx.readFile + sheet_to_json (inlineStr)', () => {
    const linhas = [LINHA(), LINHA({ ID_LOJA: 'loja_b', QTD: 7 }), LINHA({ NOME_CLIENTE: 'OUTRO (CM)' })];
    const caminho = escreverXlsx('igual.xlsx', { Dados: linhas });

    const normal = xlsx.utils.sheet_to_json(xlsx.readFile(caminho).Sheets.Dados, { defval: null });
    const porBytes = leitorBytes.lerLinhasPorBytes(caminho, COLUNAS_OBRIGATORIAS);

    expect(porBytes?.aba).toBe('Dados');
    expect(porBytes?.linhas).toHaveLength(normal.length);
    for (let i = 0; i < normal.length; i++) {
      expect(porBytes!.linhas[i].ID_LOJA).toBe(normal[i].ID_LOJA);
      expect(porBytes!.linhas[i].NOME_CLIENTE).toBe(normal[i].NOME_CLIENTE);
      expect(porBytes!.linhas[i].QTD).toBe(normal[i].QTD);
      expect(porBytes!.linhas[i]['Receita Acumulada 11 Meses']).toBe(normal[i]['Receita Acumulada 11 Meses']);
    }
  });

  it('resolve texto via sharedStrings.xml (não só inlineStr)', () => {
    const caminho = escreverXlsx('shared.xlsx', { Dados: [LINHA(), LINHA({ ID_LOJA: 'loja_b' })] }, true);
    const porBytes = leitorBytes.lerLinhasPorBytes(caminho, COLUNAS_OBRIGATORIAS);
    expect(porBytes?.linhas.map((l: Record<string, unknown>) => l.ID_LOJA)).toEqual(['loja_a', 'loja_b']);
    expect(porBytes?.linhas[0].NOME_CLIENTE).toBe('OFICINA X (CM)');
  });

  it('escolhe a aba com header compatível e mais linhas, igual escolherAba', () => {
    const caminho = escreverXlsx('duas-abas.xlsx', {
      Vazia: [{ Foo: 1 }],
      Pequena: [LINHA()],
      Grande: [LINHA(), LINHA(), LINHA()],
    });
    const r = leitorBytes.lerLinhasPorBytes(caminho, COLUNAS_OBRIGATORIAS);
    expect(r?.aba).toBe('Grande');
    expect(r?.linhas).toHaveLength(3);
  });

  it('devolve null quando nenhuma aba tem o header esperado — nunca inventa', () => {
    const caminho = escreverXlsx('sem-header.xlsx', { Dados: [{ Foo: 1, Bar: 2 }] });
    expect(leitorBytes.lerLinhasPorBytes(caminho, COLUNAS_OBRIGATORIAS)).toBeNull();
  });

  it('valores numéricos vêm como number, não string', () => {
    const caminho = escreverXlsx('numeros.xlsx', { Dados: [LINHA({ ANO: 2025, QTD: 12 })] });
    const r = leitorBytes.lerLinhasPorBytes(caminho, COLUNAS_OBRIGATORIAS);
    expect(r?.linhas[0].ANO).toBe(2025);
    expect(r?.linhas[0].QTD).toBe(12);
    expect(typeof r?.linhas[0].ANO).toBe('number');
  });

  it('nome de cliente com caracteres especiais (&, parênteses, acento) sobrevive', () => {
    const caminho = escreverXlsx('especiais.xlsx', {
      Dados: [LINHA({ NOME_CLIENTE: 'MATOS & FILHAS AUTO CENTER LTDA (CQ)', DESCRICAO_PRODUTO: 'Vela Ignição' })],
    });
    const r = leitorBytes.lerLinhasPorBytes(caminho, COLUNAS_OBRIGATORIAS);
    expect(r?.linhas[0].NOME_CLIENTE).toBe('MATOS & FILHAS AUTO CENTER LTDA (CQ)');
    expect(r?.linhas[0].DESCRICAO_PRODUTO).toBe('Vela Ignição');
  });
});
