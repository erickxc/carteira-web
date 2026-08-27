/**
 * Motor de datas das séries recorrentes de agenda.
 *
 * FONTE ÚNICA da matemática de recorrência: o frontend NÃO recalcula datas —
 * ele salva a regra e consulta `POST /api/agenda/series/preview` para mostrar
 * as próximas ocorrências. Isso evita o problema que já existe entre
 * `src/utils/cadenciaRelatorio.ts` e `server/cadenciaRelatorio.cjs`, que são
 * espelhos manuais da mesma regra e podem divergir em silêncio.
 *
 * As regras são ABERTAS (não têm "durante N meses" nem "total de ocorrências"):
 * quem limita é a janela pedida por quem chama. O servidor materializa mês a
 * mês (ver server/agendaSeries.cjs), em vez de gerar centenas de eventos de uma
 * vez no momento em que o usuário salva o formulário.
 *
 * Modos:
 *  - `semanal`     { diaSemana: 0..6 }        → toda semana naquele dia
 *  - `mensalVezes` { vezesPorMes, diaBase }   → N vezes por mês, a 1ª no diaBase
 *                                               e as demais espaçadas por
 *                                               floor(28 / vezesPorMes) dias
 *  - `diasMes`     { diasDoMes: number[] }    → dias fixos do mês; dia maior que
 *                                               o mês (31 em fevereiro) cai no
 *                                               último dia
 */

const DIAS_MS = 24 * 60 * 60 * 1000;

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || min));

/** Data local à meia-noite (a hora do evento vive no campo `time`, à parte). */
function dia(ano, mes, d) {
  return new Date(ano, mes, d, 0, 0, 0, 0);
}

function diasNoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

function meiaNoite(d) {
  return dia(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Parse de string "yyyy-MM-dd" (data pura, sem hora) como MEIA-NOITE LOCAL.
 * `new Date("yyyy-MM-dd")` é interpretado pelo JS como meia-noite UTC — em
 * fusos negativos (Brasil, UTC-3) isso volta um dia quando lido em hora local
 * (bug real: pedir início "2026-08-19" devolvia ocorrências a partir de
 * "2026-08-18"). Datas com hora (ISO completo, ex. `serie.createdAt`) não
 * passam por aqui — só campos de data pura como `inicio`.
 */
function parseDataLocal(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
  if (!m) return new Date(NaN);
  return dia(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Datas geradas pela `regra` dentro da janela [inicio, fim] (ambos inclusive,
 * comparados por dia, não por instante). Devolve ordenado e sem repetição.
 */
function datasNoIntervalo(regra, inicio, fim) {
  if (!regra || !regra.modo) return [];
  const de = meiaNoite(inicio);
  const ate = meiaNoite(fim);
  if (de > ate) return [];

  const out = [];

  if (regra.modo === 'semanal') {
    const alvo = clamp(regra.diaSemana, 0, 6);
    // Primeira ocorrência: o próximo `alvo` em ou depois de `de`.
    const delta = (alvo - de.getDay() + 7) % 7;
    for (let d = new Date(de.getTime() + delta * DIAS_MS); d <= ate; d = new Date(d.getTime() + 7 * DIAS_MS)) {
      out.push(meiaNoite(d));
    }
  } else if (regra.modo === 'mensalVezes') {
    const vezes = clamp(regra.vezesPorMes, 1, 31);
    const diaBase = clamp(regra.diaBase, 1, 31);
    const passo = Math.max(1, Math.floor(28 / vezes));
    // Começa um mês antes da janela: uma ocorrência espaçada a partir do mês
    // anterior pode cair dentro da janela (ex.: diaBase 25 + passo 9).
    let ano = de.getFullYear();
    let mes = de.getMonth() - 1;
    const limite = new Date(ate.getFullYear(), ate.getMonth() + 1, 1);
    while (dia(ano, mes, 1) < limite) {
      const primeiro = dia(ano, mes, Math.min(diaBase, diasNoMes(ano, mes)));
      for (let i = 0; i < vezes; i++) {
        const d = new Date(primeiro.getTime() + i * passo * DIAS_MS);
        if (d >= de && d <= ate) out.push(meiaNoite(d));
      }
      mes += 1;
      if (mes > 11) { mes = 0; ano += 1; }
    }
  } else if (regra.modo === 'diasMes') {
    const dias = Array.isArray(regra.diasDoMes) ? regra.diasDoMes.map((d) => clamp(d, 1, 31)) : [];
    if (dias.length === 0) return [];
    let ano = de.getFullYear();
    let mes = de.getMonth();
    const limite = new Date(ate.getFullYear(), ate.getMonth() + 1, 1);
    while (dia(ano, mes, 1) < limite) {
      for (const d of dias) {
        const data = dia(ano, mes, Math.min(d, diasNoMes(ano, mes)));
        if (data >= de && data <= ate) out.push(data);
      }
      mes += 1;
      if (mes > 11) { mes = 0; ano += 1; }
    }
  } else {
    return [];
  }

  // Ordena e remove repetições (mensalVezes com passo pequeno pode repetir dia).
  const vistos = new Set();
  return out
    .sort((a, b) => a - b)
    .filter((d) => {
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

/** Descrição curta da regra, para exibir na UI sem reimplementar a leitura. */
const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function descreverRegra(regra) {
  if (!regra || !regra.modo) return '';
  if (regra.modo === 'semanal') return `Toda ${NOMES_DIA[clamp(regra.diaSemana, 0, 6)]}`;
  if (regra.modo === 'mensalVezes') {
    const v = clamp(regra.vezesPorMes, 1, 31);
    return v === 1 ? 'Uma vez por mês' : `${v}x por mês`;
  }
  if (regra.modo === 'diasMes') {
    const dias = (regra.diasDoMes || []).slice().sort((a, b) => a - b);
    return dias.length ? `Dias ${dias.join(', ')} de cada mês` : '';
  }
  return '';
}

module.exports = { datasNoIntervalo, descreverRegra, parseDataLocal };
