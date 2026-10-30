import { eh2DPrice, ehPlataforma2D, mesmoProduto } from 'carteira-shared/produtos.cjs';
import { truthy } from './formatters';
import type { Cliente } from '../types';

/**
 * Chips de produto do formulário de evento (spec §3): os Ativos do cliente, ou a
 * categoria inteira com "ver todos". Sem cliente ou sem nenhum Ativo que exista
 * na categoria mostra todos — senão não haveria o que marcar num campo
 * obrigatório. Um chip por produto, mesmo com os dois nomes na lista. O que já está
 * marcado nunca some: chip invisível seria regravado a cada Salvar sem ninguém
 * poder desmarcar. Compara pelo nome oficial porque, antes da migração, a
 * categoria ainda se chama "Monitoria" e `produtos` já diz "Plataforma 2D".
 */
export function opcoesProdutoEvento(categorias: string[], cliente: Cliente | undefined, marcados: string[], verTodos: boolean): string[] {
  const ativos = (cliente?.produtos ?? []).filter((p) => p.fase === 'Ativo').map((p) => p.produto);
  const casados = categorias.filter((c) => ativos.some((p) => mesmoProduto(p, c)));
  const todos = verTodos || casados.length === 0;
  const visiveis = categorias
    .filter((c) => todos || casados.includes(c) || marcados.some((m) => mesmoProduto(m, c)))
    // Marcado com o outro nome ocupa o lugar da categoria: o chip compara texto.
    .map((c) => marcados.find((m) => mesmoProduto(m, c)) ?? c);
  return [...visiveis, ...marcados.filter((m) => !categorias.some((c) => mesmoProduto(m, c)))]
    .filter((s, i, lista) => lista.findIndex((x) => mesmoProduto(x, s)) === i);
}

/** Clientes com o produto no cadastro, em qualquer fase e com qualquer dos nomes:
 * `servicos` só tem os Ativos, então 2D Nexus (Em breve) contaria zero. */
export function clientesComProduto(clientes: Cliente[], nome: string): number {
  return clientes.filter((c) =>
    [...(c.produtos ?? []).map((p) => p.produto), ...(c.servicos ?? [])].some((s) => mesmoProduto(s, nome))
  ).length;
}

/**
 * Filtro de produto da Carteira (spec §3). `fase` é uma das fases ou "Todas".
 * Sem produto escolhido, a fase padrão não filtra: quem não tem produto nenhum
 * continua na lista, como hoje.
 */
export function passaFiltroProduto(cliente: Cliente, selecionados: string[], fase: string): boolean {
  const naFase = (cliente.produtos ?? []).filter((p) => fase === 'Todas' || p.fase === fase);
  if (selecionados.length === 0) return fase === 'Ativo' || fase === 'Todas' || naFase.length > 0;
  return naFase.some((p) => selecionados.some((s) => mesmoProduto(s, p.produto)));
}

/**
 * Colunas da planilha de importação, com nome novo ou antigo. Grava o nome VIGENTE
 * da categoria: `/bulk` não passa por `comNomesDaCategoria`, e antes da migração
 * a máquina 1.6 só reconhece a Monitoria pelo nome antigo.
 */
export function servicosDaImportacao(row: Record<string, unknown>, categorias: string[]): string[] {
  const marcada = (...colunas: string[]) => colunas.some((c) => truthy(row[c]));
  const servicos: string[] = [];
  if (marcada('Plataforma 2D', 'plataforma 2d', 'Monitoria', 'monitoria')) {
    servicos.push(categorias.find(ehPlataforma2D) ?? 'Plataforma 2D');
  }
  if (marcada('2D Price', '2d price', 'Price', 'price', 'Precificacao', 'Precificação')) {
    servicos.push(categorias.find(eh2DPrice) ?? '2D Price');
  }
  return servicos;
}
