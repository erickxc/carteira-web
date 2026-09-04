import type { Cliente } from '../types';

/**
 * "Grupo" (`Cliente.grupo`) é uma REDE de lojas — cada loja é um cliente 100%
 * independente (cadastro, status, cadência, análise de IA próprios; ver
 * `tipoAnalise: 'segmentado'`), só compartilhando o mesmo nome de grupo pra
 * poderem ser encontradas juntas. Não existe (e este módulo não cria) um
 * registro "de grupo" à parte — é sempre uma convenção sobre os cadastros de
 * loja existentes.
 *
 * "Loja principal": a mais ANTIGA do grupo (menor `createdAt`) — regra
 * automática, sem exigir nenhum campo novo no cadastro nem escolha manual.
 * Usada pra decidir de qual loja vêm os Links de Power BI mostrados/editados
 * pro grupo inteiro (`ClientesPage`, `ClientFormModal`) — antes cada loja
 * guardava (e alguém preenchia à mão) uma cópia dos mesmos links.
 */
export function lojaPrincipal(grupo: string, todos: Cliente[]): Cliente | undefined {
  const lojas = todos.filter((c) => c.grupo === grupo);
  if (lojas.length === 0) return undefined;
  return lojas.reduce((a, b) => (chaveOrdenacao(a) <= chaveOrdenacao(b) ? a : b));
}

/** Sem `grupo`, o cliente é sempre "principal" de si mesmo (não faz parte de
 *  nenhuma rede). Com `grupo`, só é principal se for a loja mais antiga. */
export function ehLojaPrincipal(cliente: Cliente, todos: Cliente[]): boolean {
  if (!cliente.grupo) return true;
  return lojaPrincipal(cliente.grupo, todos)?.id === cliente.id;
}

// `createdAt` ausente (cadastro bem antigo, de antes desse campo existir)
// não deve "vencer" por acidente um cadastro novo só por vir vazio primeiro
// na comparação de string — trata como se fosse o mais recente possível,
// nunca principal por default de um jeito surpreendente.
function chaveOrdenacao(c: Cliente): string {
  return c.createdAt || '9999-12-31T23:59:59.999Z';
}

export interface LinhaGrupo {
  tipo: 'grupo';
  grupo: string;
  lojas: Cliente[];
  principal: Cliente;
}
export interface LinhaCliente {
  tipo: 'cliente';
  cliente: Cliente;
}
export type LinhaTabela = LinhaGrupo | LinhaCliente;

/**
 * Agrupa uma lista JÁ FILTRADA/ORDENADA de clientes em blocos por `grupo` —
 * usado pra renderizar a tabela de clientes como acordeão (uma linha
 * recolhível por rede, as lojas dentro). A ORDEM dos blocos segue a posição
 * da primeira loja de cada grupo na lista de entrada (preserva a ordenação
 * já aplicada pelo chamador).
 *
 * `todosOsClientes`: usado só pra achar `principal` (precisa considerar TODAS
 * as lojas do grupo, mesmo as que um filtro ativo excluiu de `filtrados` —
 * senão "loja principal" mudaria dependendo do filtro aplicado na hora).
 *
 * Grupo com só 1 loja PRESENTE na lista filtrada (ex.: filtro reduziu a rede
 * inteira a uma única loja que bate o critério) vira uma linha normal, sem
 * acordeão — um acordeão de 1 item só confundiria sem ganhar nada.
 */
export function agruparPorGrupo(filtrados: Cliente[], todosOsClientes: Cliente[]): LinhaTabela[] {
  const linhas: LinhaTabela[] = [];
  const gruposVistos = new Set<string>();
  for (const cliente of filtrados) {
    if (!cliente.grupo) {
      linhas.push({ tipo: 'cliente', cliente });
      continue;
    }
    if (gruposVistos.has(cliente.grupo)) continue; // já emitido no primeiro encontro
    gruposVistos.add(cliente.grupo);
    const lojas = filtrados.filter((c) => c.grupo === cliente.grupo);
    if (lojas.length === 1) {
      linhas.push({ tipo: 'cliente', cliente: lojas[0] });
      continue;
    }
    const principal = lojaPrincipal(cliente.grupo, todosOsClientes) ?? lojas[0];
    linhas.push({ tipo: 'grupo', grupo: cliente.grupo, lojas, principal });
  }
  return linhas;
}
