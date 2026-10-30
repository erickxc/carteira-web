// Declarações de tipo de `produtos.cjs` (regras de produto do cliente).
// Estruturais de propósito, como `cadenciaServico.d.cts`: o backend também
// consome este pacote e não depende de `src/`.

export type FaseProduto = 'Em breve' | 'Suspenso' | 'Ativo' | 'Cancelado';

export interface ProdutoCliente {
  produto: string;
  /** Um de `FASES`; string para aceitar dado ainda não validado. */
  fase: FaseProduto | string;
  /** ISO — quando entrou na fase atual. */
  faseDesde: string;
  motivoFase: string;
  independente?: boolean;
  link?: string;
  login?: string;
  /** AES-256-GCM; nunca sai pro navegador. */
  senhaCifrada?: string;
}

export interface CamposLegados {
  servicos: string[];
  servicosIndependentes: string[];
  linksServicos: Record<string, string>;
  loginPrice?: string;
  senhaPriceCifrada?: string;
}

/** Campos antigos que um cliente/patch pode trazer (texto JSON ou já parseado). */
export interface ClienteLegado {
  createdAt?: string;
  servicos?: string[] | string;
  servicosIndependentes?: string[] | string;
  linksServicos?: Record<string, string> | string;
  loginPrice?: string;
  senhaPriceCifrada?: string;
}

export interface MudancaDeFase {
  produto: string;
  de: string | null;
  /** `null` = produto removido da lista. */
  para: string | null;
  motivoMudou: boolean;
}

export const PRODUTOS_OFICIAIS: string[];
export const FASES: FaseProduto[];
export const MOTIVO_VERSAO_ANTERIOR: string;

export function ehPlataforma2D(nome: string): boolean;
export function eh2DPrice(nome: string): boolean;
export function renomearProduto(nome: string): string;
/** `null` quando `produtos` está ausente (cliente não migrado). */
export function derivarCamposLegados(
  produtos: ProdutoCliente[] | string | null | undefined,
  linksAtuais?: Record<string, string> | string | null,
): CamposLegados | null;
/** Links com a chave no nome oficial; aceita objeto ou texto JSON. */
export function linksRenomeados(raw: Record<string, string> | string | null | undefined): Record<string, string>;
export function comNomesDaCategoria<T extends object>(cliente: T, categorias: string[]): T;
export function produtosDeLegado(
  cliente: ClienteLegado,
  opts: {
    agora: string;
    faseInicial?: (produto: string) => string;
    desde?: (produto: string) => string | undefined;
    motivo: string;
  },
): ProdutoCliente[];
export function traduzirPatchLegado(
  produtosAtuais: ProdutoCliente[] | string | null | undefined,
  patch: ClienteLegado & { produtos?: unknown; [campo: string]: unknown },
  agora: string,
): ProdutoCliente[] | null;
export function mudancasDeFase(
  antes: ProdutoCliente[] | string | undefined,
  depois: ProdutoCliente[] | string | undefined,
): MudancaDeFase[];
