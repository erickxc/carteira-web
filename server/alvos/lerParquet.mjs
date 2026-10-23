// Processo filho do leitor dos Dados Alvos (`leitor.cjs`) para arquivos parquet:
//   node lerParquet.mjs <movimento.parquet> [<produto.parquet>]
// Lê com hyparquet (JavaScript puro, sem nada nativo), passa os registros pelas MESMAS
// funções do leitor CSV (catálogo, normalização, devolução ao fornecedor, agregação) e
// imprime o agregado em JSON no stdout. Só leitura.
import { createRequire } from 'module';
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';

const require = createRequire(import.meta.url);
const { catalogoDeRegistros, linhasDeRegistros, agregar } = require('./leitor.cjs');

const MOVIMENTO = ['ID_LOJA', 'TIPO_MOVIMENTO', 'MOV', 'NOME_CLIENTE', 'NOME_VENDEDOR', 'CODIGO_PRODUTO', 'CODIGO_REFERENCIA_PRODUTO',
  'DESCRICAO_PRODUTO', 'NOME_FABRICANTE', 'ANO', 'MES', 'QUANTIDADE', 'TOTAL', 'CMV'];
const PRODUTO = ['ID_LOJA', 'CODIGO_INTERNO_PRODUTO', 'DESCRICAO_HARMONIZADA', 'QUANTIDADE_ESTOQUE'];

// Só as colunas que existem no arquivo (pedir coluna ausente derruba a leitura) e BigInt -> Number.
async function ler(caminho, colunas) {
  const file = await asyncBufferFromFile(caminho);
  const metadata = await parquetMetadataAsync(file);
  const existentes = new Set(metadata.schema.map((c) => c.name));
  const registros = await parquetReadObjects({ file, metadata, columns: colunas.filter((c) => existentes.has(c)) });
  for (const r of registros) {
    for (const k in r) if (typeof r[k] === 'bigint') r[k] = Number(r[k]);
  }
  return registros;
}

const [movimento, produto] = process.argv.slice(2);
const catalogo = produto ? catalogoDeRegistros(await ler(produto, PRODUTO)) : null;
const { linhas, brutas, descartadas, devolucoesFornecedor } = linhasDeRegistros(await ler(movimento, MOVIMENTO), catalogo, movimento);
process.stdout.write(JSON.stringify({ brutas, descartadas, devolucoesFornecedor, temCatalogoProduto: Boolean(catalogo), ...agregar(linhas) }));
