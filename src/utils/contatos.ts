import type { Cliente, Contato } from '../types';

/** Contato como a tela vê: o próprio da loja ou um herdado do grupo. */
export interface ContatoVisivel extends Contato {
  /** Cliente onde o contato está GRAVADO (pode ser outra loja do mesmo grupo). */
  origemClienteId: string;
  origemEmpresa: string;
  /** true = vem de outra loja do grupo (não é editável por aqui). */
  doGrupo: boolean;
}

/**
 * Contatos que devem aparecer para um cliente.
 *
 * Em análise segmentada cada loja é um Cliente próprio (empresa = "Grupo -
 * Loja"), e os contatos são um campo do cliente — então uma pessoa que atende
 * duas lojas tinha que ser cadastrada duas vezes, sem nenhum lugar para dizer
 * "este contato vale para o grupo". `Contato.escopo = 'grupo'` resolve isso:
 * o contato continua gravado em UMA loja (fonte única, editável num lugar só) e
 * as outras lojas do mesmo `grupo` passam a exibi-lo como herdado.
 *
 * A alternativa seria copiar o contato para cada loja, o que criaria N cópias
 * para atualizar quando o telefone mudasse.
 */
export function contatosVisiveis(cliente: Cliente | undefined, clientes: Cliente[]): ContatoVisivel[] {
  if (!cliente) return [];

  const proprios: ContatoVisivel[] = (cliente.contatos ?? []).map((c) => ({
    ...c,
    origemClienteId: cliente.id,
    origemEmpresa: cliente.empresa,
    doGrupo: false,
  }));

  if (!cliente.grupo) return proprios;

  const herdados: ContatoVisivel[] = [];
  for (const outro of clientes) {
    if (outro.id === cliente.id || outro.grupo !== cliente.grupo) continue;
    for (const c of outro.contatos ?? []) {
      if (c.escopo !== 'grupo') continue;
      herdados.push({ ...c, origemClienteId: outro.id, origemEmpresa: outro.empresa, doGrupo: true });
    }
  }

  return [...proprios, ...herdados];
}

/**
 * Serviços contratados que não têm ninguém responsável entre os contatos
 * visíveis. Contato sem serviço marcado conta como geral (cobre qualquer
 * serviço), então só acusa falta quando há contatos e todos são específicos de
 * outros serviços.
 */
export function servicosSemResponsavel(cliente: Cliente | undefined, contatos: ContatoVisivel[]): string[] {
  const doCliente = cliente?.servicos ?? [];
  if (doCliente.length === 0 || contatos.length === 0) return [];
  if (contatos.some((c) => (c.servicos ?? []).length === 0)) return [];
  const cobertos = new Set(contatos.flatMap((c) => c.servicos ?? []));
  return doCliente.filter((s) => !cobertos.has(s));
}
