/**
 * Executa uma mutação (create/update/delete) de forma agnóstica ao modo —
 * Etapa 3 do plano, "rotas ficam agnósticas ao modo".
 *
 * - `server` (Karol-2D, dona do banco real): chama a função de domínio direto
 *   sobre `repoPlanilha()` — comportamento IDÊNTICO ao de antes da fila.
 * - `client` (as outras 3 máquinas): nunca escreve no SQLite local (bloqueado
 *   de qualquer forma pela guarda em `dbSqlite.cjs`) — em vez disso:
 *     1. gera o id definitivo já aqui pro `create` (o controller nunca gera id
 *        ao aplicar — todo `create` da fila é upsert idempotente por id, ver
 *        "Correção factual que muda o desenho" no plano);
 *     2. calcula uma resposta otimista aplicando a MESMA função de domínio
 *        sobre um repo em memória, semeado com a leitura atual JÁ com o
 *        overlay de operações próprias ainda sem ack (server/fila/pendentes.cjs)
 *        — sem isso, editar duas vezes em seguida na mesma máquina antes do
 *        controller aplicar a primeira operação partiria da versão velha;
 *     3. grava a operação na fila (server/fila/escrever.cjs) pro controller
 *        aplicar de verdade depois (Etapa 4);
 *     4. devolve essa resposta otimista — mesmo formato que o caller já
 *        esperava do modo server, pra rota não precisar saber o modo.
 *
 * `efeitosExternos` fica sempre desligado no cálculo otimista (relatório
 * automático, `reunioes_json`, etc.) — são efeitos que gravam fora da fila e
 * só devem rodar quando a operação for de fato aplicada pelo controller.
 */
const crypto = require('crypto');
const { isClient } = require('../modo.cjs');
const { repoPlanilha, repoMemoria } = require('../dominio/repo.cjs');
const { escreverOperacao } = require('./escrever.cjs');
const { aplicarOverlay } = require('./pendentes.cjs');
const { ENTIDADES } = require('./entidades.cjs');

function executarMutacaoServidor(dominio, operation, { id, patch, payload }) {
  const repo = repoPlanilha();
  if (operation === 'create') return dominio.criar(repo, payload);
  if (operation === 'update') return dominio.atualizar(repo, id, patch);
  if (operation === 'delete') return dominio.remover(repo, id);
  throw new Error(`executarMutacao: operação desconhecida "${operation}".`);
}

function executarMutacaoCliente(entityKey, sheet, dominio, operation, { id, patch, payload, userName }) {
  const recordId = operation === 'create' ? crypto.randomUUID() : id;
  const changes = operation === 'create' ? payload : operation === 'update' ? patch : {};

  const dadosAtuais = aplicarOverlay(sheet, repoPlanilha().get(sheet));
  const memRepo = repoMemoria({ [sheet]: dadosAtuais });

  let resultado;
  if (operation === 'create') {
    resultado = dominio.criar(memRepo, payload, { id: recordId, efeitosExternos: false });
  } else if (operation === 'update') {
    resultado = dominio.atualizar(memRepo, recordId, patch, { efeitosExternos: false });
    if (!resultado) return null; // id inexistente — mesmo contrato do modo server
  } else if (operation === 'delete') {
    const found = dominio.remover(memRepo, recordId, { efeitosExternos: false });
    if (!found) return null;
    resultado = true;
  } else {
    throw new Error(`executarMutacao: operação desconhecida "${operation}".`);
  }

  escreverOperacao({ entity: entityKey, operation, recordId, changes, userName });
  return resultado;
}

function executarMutacao(entityKey, operation, opts = {}) {
  const entidade = ENTIDADES[entityKey];
  if (!entidade) throw new Error(`executarMutacao: entidade desconhecida "${entityKey}".`);
  const { sheet, dominio } = entidade;
  return isClient
    ? executarMutacaoCliente(entityKey, sheet, dominio, operation, opts)
    : executarMutacaoServidor(dominio, operation, opts);
}

module.exports = { executarMutacao };
