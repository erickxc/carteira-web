import type { Cliente } from '../types';

/** O que o retrato sabe de um CNPJ. `produtos` só existe pra quem está no
 *  `parametro_bi`; o resto, conforme a fonte (DW `empresas`/Apura, Receita). */
export interface LojaNoRetrato {
  produtos?: string[];
  /** `yyyy-MM-dd` */
  certificadoValidade?: string | null;
  telefone?: string | null;
  email?: string | null;
  grupoFiscal?: { codigo: string; nome: string };
  apura?: { usuarios: number; ultimoAcesso: string | null };
  receita?: { situacao: string; desde: string | null; consultadoEm: string };
}

/** Retrato do DW gravado pelo servidor (`server/dw/retratoProdutos.cjs`):
 *  CNPJ (só dígitos) → produtos marcados no `parametro_bi` e dados fiscais. */
export interface RetratoDw {
  geradoEm: string;
  porCnpj: Record<string, LojaNoRetrato>;
}

export interface ProdutoNoDw {
  /** Lojas do atendimento com o produto marcado. */
  marcado: number;
  /** Lojas do atendimento com CNPJ achado no retrato. */
  total: number;
}

// Produtos que existem como coluna no DW (Protocolo GPS e Raptor não existem).
const PRODUTOS_NO_DW = ['Plataforma 2D', 'Controladoria', 'Apura', '2D Alcance', '2D Nexus', 'OptiMarco', '2D Price'];

const cnpjsDe = (c: Cliente) => (c.lojasCadastro ?? []).map((l) => String(l.cnpj || '').replace(/\D/g, '')).filter(Boolean);
const chaveGrupo = (c: Cliente) => String(c.grupo || '').trim().toLowerCase();

/**
 * "No DW agora" da ficha: por produto, quantas lojas do atendimento o têm
 * marcado no DW. Só leitura — divergência com a fase vira aviso na tela.
 * Plataforma 2D marcada em qualquer loja do grupo vale para todas (spec §5).
 * `{}` quando nenhuma loja do atendimento tem CNPJ achado no retrato.
 */
export function produtosNoDw(cliente: Cliente, retrato: RetratoDw | null | undefined, clientes: Cliente[]): Record<string, ProdutoNoDw> {
  if (!retrato) return {};
  const lojas = cnpjsDe(cliente).filter((cnpj) => retrato.porCnpj[cnpj]?.produtos);
  if (lojas.length === 0) return {};

  const grupo = chaveGrupo(cliente);
  const plataformaNoGrupo = grupo !== '' && clientes.some((c) =>
    chaveGrupo(c) === grupo && cnpjsDe(c).some((cnpj) => retrato.porCnpj[cnpj]?.produtos?.includes('Plataforma 2D')));

  const resultado: Record<string, ProdutoNoDw> = {};
  for (const produto of PRODUTOS_NO_DW) {
    const marcado = produto === 'Plataforma 2D' && plataformaNoGrupo
      ? lojas.length
      : lojas.filter((cnpj) => retrato.porCnpj[cnpj].produtos?.includes(produto)).length;
    resultado[produto] = { marcado, total: lojas.length };
  }
  return resultado;
}
