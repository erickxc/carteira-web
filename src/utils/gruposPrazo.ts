import { differenceInCalendarDays, format } from 'date-fns';
import type { ItemPrazo, LinhaAtendimento } from './indicadoresPrazo';
import type { RelogioServico, ServicoCad } from './cadenciaServico';

export type Tom = 'boa' | 'atencao' | 'ruim' | 'neutra';
/** `forca` (0–1): intensidade da cor da data — mais recente, mais forte. */
export interface Celula { texto: string; tom: Tom; forca?: number; dica?: string }
interface Coluna { titulo: string; valor: (l: LinhaAtendimento) => Celula }

export interface GrupoPrazo {
  key: string;
  label: string;
  cor: string;
  /** Uma frase: o que coloca um atendimento neste grupo. */
  descricao: string;
  itens: ItemPrazo[];
  /** A última coluna é sempre "Última entrega". */
  colunas: Coluna[];
  /** Data que ordena a lista (mais recente primeiro; sem data vai para o fim). */
  entrega: (l: LinhaAtendimento) => Date | null;
}

const dm = (d: Date) => format(d, 'dd/MM');
const VAZIO: Celula = { texto: '—', tom: 'neutra' };
/** Dias até a cor da data chegar ao mais claro. */
const DIAS_ATE_CLARO = 90;

/** Texto curto: a cor já diz o estado (vermelho = vencida/nunca, amarelo = vence logo, verde = em dia). */
export function celulaPrazo(r: RelogioServico | undefined): Celula {
  if (!r) return VAZIO;
  if (r.statusReal === 'nunca') return { texto: 'nunca', tom: 'ruim' };
  // "3d atrasada", não "há 3d": ao lado de "Última entrega · há 18d", "há 3d" lia como entrega recente.
  if (r.statusReal === 'vencido') return { texto: `${r.atrasoReal}d atrasada`, tom: 'ruim' };
  const dias = -r.atrasoReal;
  return { texto: dias === 0 ? 'vence hoje' : `vence em ${dias}d`, tom: r.statusReal === 'vencendo' ? 'atencao' : 'boa' };
}

/** Força da cor pela idade da data: hoje = 1; DIAS_ATE_CLARO ou mais = 0. */
export function forcaPorIdade(data: Date, hoje: Date): number {
  return Math.max(0, Math.min(1, 1 - differenceInCalendarDays(hoje, data) / DIAS_ATE_CLARO));
}

const colServico = (s: ServicoCad): Coluna => ({ titulo: s, valor: (l) => celulaPrazo(l.relogios[s]) });
const colMarcada: Coluna = { titulo: 'Marcada', valor: (l) => (l.proxima ? { texto: dm(l.proxima), tom: 'neutra' } : VAZIO) };
const colContato: Coluna = { titulo: 'Contato', valor: (l) => (l.ultimoContato ? { texto: dm(l.ultimoContato), tom: 'neutra' } : VAZIO) };

interface Entrada {
  ritmo: { emDia: ItemPrazo[]; emDiaMarcada: ItemPrazo[]; agendaMarcada: ItemPrazo[]; contatoRecente: ItemPrazo[]; precisa: ItemPrazo[] };
  cobertura: { cobertos: ItemPrazo[]; semContato: ItemPrazo[] };
  servicos: { servico: ServicoCad; descobertos: ItemPrazo[] }[];
  /** Recorte do Ritmo: quais prazos mostrar nas colunas. */
  filtroServico: ServicoCad | 'Todos';
  janela: string;
  hoje: Date;
}

interface GrupoBase { key: string; label: string; cor: string; descricao: string; itens: ItemPrazo[]; colunas: Coluna[] }

/** Grupos das legendas dos cards de prazo, por card. */
export function montarGruposPrazo(e: Entrada): Record<'ritmo' | 'cobertura' | 'servico', GrupoPrazo[]> {
  const prazos = (e.filtroServico === 'Todos' ? (['Monitoria', 'Price'] as ServicoCad[]) : [e.filtroServico]).map(colServico);
  const geral = (l: LinhaAtendimento) => l.ultimaEntrega?.data ?? null;
  // Toda lista termina em "Última entrega": ordena e esmaece pela mesma data.
  const grupo = (g: GrupoBase, entrega = geral, comTipo = false): GrupoPrazo => ({
    ...g,
    entrega,
    colunas: [...g.colunas, {
      titulo: 'Última entrega',
      valor: (l) => {
        const d = entrega(l);
        if (!d) return { texto: 'nenhuma', tom: 'ruim' };
        // Dias desde a entrega ('4d'); a data exata fica na dica ao passar o mouse.
        const n = Math.max(0, differenceInCalendarDays(e.hoje, d));
        const idade = n === 0 ? 'hoje' : `há ${n}d`;
        return { texto: comTipo && l.ultimaEntrega ? `${idade} · ${l.ultimaEntrega.tipo}` : idade, tom: 'neutra', forca: forcaPorIdade(d, e.hoje), dica: dm(d) };
      },
    }],
  });
  return {
    ritmo: [
      grupo({
        key: 'ritmo-emdia', label: 'em dia', cor: 'var(--success)',
        descricao: 'Todos os prazos em dia. "Marcada": próxima entrega já agendada.',
        itens: e.ritmo.emDia, colunas: [...prazos, colMarcada],
      }),
      // Rótulos curtos: a legenda cabe numa linha. "marcado" = fora do prazo com
      // entrega marcada; o total de marcados (inclusive em dia) fica na linha de cima.
      grupo({ key: 'ritmo-reuniao', label: 'marcado', cor: 'var(--warning)', descricao: 'Fora do prazo, mas com a próxima entrega já marcada.', itens: e.ritmo.agendaMarcada, colunas: [...prazos, colMarcada] }),
      grupo({ key: 'ritmo-contato', label: 'contato', cor: 'var(--warning)', descricao: 'Fora do prazo; houve contato recente, mas contato não conta como entrega.', itens: e.ritmo.contatoRecente, colunas: [...prazos, colContato] }),
      grupo({ key: 'ritmo-semnada', label: 'sem nada', cor: 'var(--danger)', descricao: 'Fora do prazo, sem entrega marcada e sem contato recente.', itens: e.ritmo.precisa, colunas: prazos }),
    ],
    cobertura: [
      grupo({ key: 'cobertura-com', label: 'com entrega', cor: 'var(--success)', descricao: `Tiveram entrega concluída em ${e.janela}.`, itens: e.cobertura.cobertos, colunas: [] }, geral, true),
      grupo({ key: 'cobertura-sem', label: 'sem entrega', cor: 'var(--danger)', descricao: `Nenhuma entrega concluída em ${e.janela}.`, itens: e.cobertura.semContato, colunas: [] }, geral, true),
    ],
    // Aqui a data é a última entrega DAQUELE serviço (o relógio dele), não a geral.
    servico: e.servicos.map((s) => grupo(
      { key: `servico-${s.servico}`, label: `${s.servico} fora do prazo`, cor: 'var(--danger)', descricao: `Prazo de ${s.servico} vencido ou nunca entregue.`, itens: s.descobertos, colunas: [colServico(s.servico), colMarcada] },
      (l) => l.relogios[s.servico]?.ultimo ?? null,
    )),
  };
}
