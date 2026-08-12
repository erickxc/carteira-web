import { useState } from 'react';
import { preAnaliseParaTexto, type PreAnalise } from '../../types';

/**
 * Estado da pré-análise (preparação da reunião) — hoje só um texto breve.
 *
 * O formato antigo (tabela de orientações cliente/produto + dois campos gerais)
 * é convertido para texto na abertura por `preAnaliseParaTexto`, então nada do
 * que já estava gravado se perde de vista. Ao salvar, os campos legados vão
 * vazios: o conteúdo passou a viver em `texto`, e manter os dois preenchidos
 * criaria duas fontes de verdade para a mesma anotação.
 */
export function usePreAnalise(initial?: PreAnalise) {
  const [texto, setTexto] = useState(preAnaliseParaTexto(initial));

  const preAnalise: PreAnalise = { texto, orientacoes: [], clientesGeral: '', produtosGeral: '' };

  return { texto, setTexto, preAnalise };
}
