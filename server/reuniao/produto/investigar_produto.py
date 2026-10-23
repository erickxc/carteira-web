"""Investigação de um produto de um cliente (monitorIA na reunião) — Python + DuckDB, só leitura.

Lê os parquet do cliente: Dados Alvos (<EMPRESA>_MOVIMENTO_ATUAL / _PRODUTO) e, para compras,
o DW (<EMPRESA>_MOVIMENTO_ATUAL com COMPRA). Regras do transfer (REGRAS-NEGOCIO.md §2–3):
D15 = (2·S1 + S2)/3·2; Máximo = ⌈⌈D15⌉·1,12⌉; giro de 15 dias com 1+ venda/semana.
Devolução ao fornecedor (DEVOLUCAO com MOV = S) NUNCA entra como venda.

Saída: um JSON em stdout (ver produto.cjs).
"""
import argparse, datetime as dt, json, math, os, sys

import duckdb


def args():
    p = argparse.ArgumentParser()
    p.add_argument('--alvos', required=True)
    p.add_argument('--dw', default='')
    p.add_argument('--empresa', required=True)
    p.add_argument('--produto', required=True)
    p.add_argument('--fim', default='')
    p.add_argument('--reajustar', default='[]', help='JSON: produtos que o analisador manda reajustar (fora da promoção)')
    return p.parse_args()


def per(d):
    return d.year * 100 + d.month


def meses_antes(d, n):
    """Os n meses fechados antes do mês de d, do mais antigo ao mais recente (AAAAMM)."""
    out, a, m = [], d.year, d.month
    for _ in range(n):
        m -= 1
        if m == 0:
            a, m = a - 1, 12
        out.append(a * 100 + m)
    return list(reversed(out))


def num(c):
    return f"TRY_CAST(REPLACE(REPLACE({c}, '.', ''), ',', '.') AS DOUBLE)"


def main():
    a = args()
    con = duckdb.connect()
    mov = os.path.join(a.alvos, f'{a.empresa}_MOVIMENTO_ATUAL.parquet').replace('\\', '/')
    prd = os.path.join(a.alvos, f'{a.empresa}_PRODUTO.parquet').replace('\\', '/')
    con.execute(f"""CREATE VIEW m AS SELECT ID_LOJA loja, TIPO_MOVIMENTO tipo, DATA_MOVIMENTO::DATE data, ANO*100+MES per, DOC doc,
        COALESCE(NOME_CLIENTE, '') cliente, CODIGO_PRODUTO cod, QUANTIDADE qtd, TOTAL rec, CMV cmv
        FROM '{mov}' WHERE NOT (TIPO_MOVIMENTO = 'DEVOLUCAO' AND MOV = 'S')""")
    con.execute(f"""CREATE VIEW p AS SELECT ID_LOJA loja, CODIGO_INTERNO_PRODUTO cod, DESCRICAO_HARMONIZADA prod, NOME_FABRICANTE fab,
        {num('ULTIMO_CUSTO')} ult, {num('CUSTO_MEDIO_UNITARIO')} med, {num('PRECO_UNITARIO_PRODUTO')} preco, GREATEST(QUANTIDADE_ESTOQUE, 0) est
        FROM '{prd}'""")

    fim = dt.date.fromisoformat(a.fim) if a.fim else con.execute("SELECT MAX(data) FROM m").fetchone()[0]
    s1_fim = fim if fim.weekday() == 6 else fim - dt.timedelta(days=fim.weekday() + 1)
    semanas = [(s1_fim - dt.timedelta(days=7 * k + 6), s1_fim - dt.timedelta(days=7 * k)) for k in range(4)]  # S1..S4
    fechados = meses_antes(fim, 11)
    atual, anterior = per(fim), meses_antes(fim, 1)[0]
    ano_ant = (fim.year - 1) * 100 + fim.month
    P = a.produto.replace("'", "''")

    # Por SKU e loja: D15, máximo, meses com venda, vendas por semana. Base de quase tudo abaixo.
    (s1i, s1f), (s2i, s2f), _, (s4i, _) = semanas
    con.execute(f"""CREATE TABLE sku AS
      WITH v AS (SELECT loja, cod,
          COALESCE(SUM(qtd) FILTER (WHERE data BETWEEN '{s1i}' AND '{s1f}'), 0) s1,
          COALESCE(SUM(qtd) FILTER (WHERE data BETWEEN '{s2i}' AND '{s2f}'), 0) s2,
          COUNT(DISTINCT per) FILTER (WHERE per IN ({','.join(map(str, fechados))})) meses_venda,
          COUNT(DISTINCT doc) FILTER (WHERE data BETWEEN '{s4i}' AND '{s1f}') / 4.0 tk_semana,
          MAX(data) ultima_venda
        FROM m WHERE tipo = 'VENDA' GROUP BY 1, 2)
      SELECT p.*, COALESCE(v.s1, 0) s1, COALESCE(v.s2, 0) s2, (2 * COALESCE(v.s1, 0) + COALESCE(v.s2, 0)) / 3 * 2 d15,
        COALESCE(v.meses_venda, 0) meses_venda, COALESCE(v.tk_semana, 0) tk_semana, v.ultima_venda
      FROM p LEFT JOIN v USING (loja, cod)""")
    con.execute("ALTER TABLE sku ADD COLUMN maximo DOUBLE")
    con.execute("UPDATE sku SET maximo = CASE WHEN d15 > 0 THEN CEIL(CEIL(ROUND(d15, 6)) * 1.12) ELSE 0 END")

    def linhas(sql):
        r = con.execute(sql)
        cols = [c[0] for c in r.description]
        return [dict(zip(cols, x)) for x in r.fetchall()]

    def r1(v):
        return None if v is None else round(float(v), 1)

    # 1. Venda no mesmo período (dia 1..dia do fim), por loja e total (loja = None).
    venda = linhas(f"""SELECT loja,
        SUM(qtd) FILTER (WHERE per = {atual}) atual, SUM(qtd) FILTER (WHERE per = {anterior}) anterior, SUM(qtd) FILTER (WHERE per = {ano_ant}) ano_anterior,
        SUM(rec - cmv) FILTER (WHERE per = {atual}) lucro_atual, SUM(rec - cmv) FILTER (WHERE per = {anterior}) lucro_anterior
      FROM m JOIN p USING (loja, cod) WHERE p.prod = '{P}' AND DAY(data) <= {fim.day} AND per IN ({atual}, {anterior}, {ano_ant})
      GROUP BY ROLLUP (loja) ORDER BY loja NULLS LAST""")
    venda_mesmo_periodo = [{'loja': v['loja'], 'atual': r1(v['atual'] or 0), 'anterior': r1(v['anterior'] or 0), 'anoAnterior': r1(v['ano_anterior'] or 0),
                            'lucroAtual': r1(v['lucro_atual'] or 0), 'lucroAnterior': r1(v['lucro_anterior'] or 0)} for v in venda]

    # 2. Série mensal (meses fechados).
    serie = linhas(f"""SELECT per, SUM(qtd) qtd, SUM(rec) receita, 100 * SUM(rec - cmv) / NULLIF(SUM(rec), 0) margem
      FROM m JOIN p USING (loja, cod) WHERE p.prod = '{P}' AND per IN ({','.join(map(str, fechados))}) GROUP BY 1 ORDER BY 1""")
    serie_mensal = [{'per': s['per'], 'qtd': r1(s['qtd']), 'receita': r1(s['receita']), 'margemPct': r1(s['margem'])} for s in serie]

    # 3. Por loja: ocorrência (pesos do transfer), giro, estoque x máximo.
    pesos = {mm: (1 if i < 5 else 2 if i < 10 else 3) for i, mm in enumerate(fechados)}
    por_loja = []
    for l in linhas(f"""SELECT loja, SUM(est) estoque, SUM(d15) d15, SUM(maximo) maximo, SUM(GREATEST(est - maximo, 0)) excesso,
          SUM(GREATEST(est - maximo, 0) * ult) excesso_rs, SUM(GREATEST(maximo - est, 0)) falta, SUM(tk_semana) tk_semana, MAX(ultima_venda) ultima
        FROM sku WHERE prod = '{P}' GROUP BY 1 ORDER BY 1"""):
        vend = {x['per'] for x in linhas(f"SELECT DISTINCT per FROM m JOIN p USING (loja, cod) WHERE p.prod = '{P}' AND m.loja = '{l['loja']}' AND tipo = 'VENDA'")}
        primeira = min(vend) if vend else None
        considerados = [mm for mm in fechados if primeira is not None and mm >= primeira]
        teve = lambda dias: con.execute(f"SELECT COUNT(*) FROM m JOIN p USING (loja, cod) WHERE p.prod = '{P}' AND m.loja = '{l['loja']}' AND tipo = 'VENDA' AND data > DATE '{fim}' - {dias}").fetchone()[0] > 0
        pontos = sum(pesos[mm] for mm in considerados if mm in vend) + (4 if teve(14) else 0) + (5 if teve(7) else 0)
        total = sum(pesos[mm] for mm in considerados) + 9
        sem_venda = l['ultima'] is None or (fim - l['ultima']).days > 90
        d15 = float(l['d15'] or 0)
        por_loja.append({
            'loja': l['loja'], 'ocorrenciaPct': round(100 * pontos / total) if total else 0,
            'vendasSemana': r1(l['tk_semana']), 'giro': 'sem venda' if sem_venda else ('15 dias' if (l['tk_semana'] or 0) >= 1 else '30 dias'),
            'estoque': r1(l['estoque']), 'd15': r1(d15), 'maximo': r1(l['maximo']),
            'diasCobertura': round(float(l['estoque']) / (d15 / 15)) if d15 > 0 else None,
            'excesso': r1(l['excesso']), 'excessoRs': round(float(l['excesso_rs'] or 0)), 'falta': r1(l['falta']),
        })

    # 4. Transferências por SKU (sobra acima do máximo -> falta abaixo do máximo) e o que ainda precisa comprar.
    transferencias, comprar = [], {'skus': 0, 'un': 0.0, 'rs': 0.0}
    for cod in [x['cod'] for x in linhas(f"SELECT DISTINCT cod FROM sku WHERE prod = '{P}' ORDER BY cod")]:
        skus = linhas(f"SELECT loja, fab, est, maximo, ult FROM sku WHERE prod = '{P}' AND cod = '{cod}' ORDER BY loja")
        sobra = {s['loja']: s['est'] - s['maximo'] for s in skus if s['est'] - s['maximo'] > 0}
        faltas = sorted(((s['maximo'] - s['est'], s['loja']) for s in skus if s['maximo'] - s['est'] > 0), reverse=True)
        restante = 0
        for falta, para in faltas:
            for de in sorted(sobra, key=sobra.get, reverse=True):
                if falta <= 0:
                    break
                un = min(falta, sobra[de])
                if un > 0:
                    transferencias.append({'cod': cod, 'fab': skus[0]['fab'], 'de': de, 'para': para, 'un': r1(un)})
                    sobra[de] -= un
                    falta -= un
            restante += falta
        if restante > 0:
            comprar['skus'] += 1
            comprar['un'] += restante
            comprar['rs'] += restante * max(s['ult'] or 0 for s in skus)
    comprar = {'skus': comprar['skus'], 'un': r1(comprar['un']), 'rs': round(comprar['rs'])}

    # 5. Clientes importantes (top 150 em receita, sem balcão) que pararam ou caíram no produto.
    ult3, ant6 = fechados[-3:], fechados[-9:-3]
    clientes = linhas(f"""
      WITH tot AS (SELECT SUM(rec) t FROM m WHERE per IN ({','.join(map(str, fechados))})),
       rk AS (SELECT cliente, SUM(rec) rec, ROW_NUMBER() OVER (ORDER BY SUM(rec) DESC) pos FROM m
              WHERE per IN ({','.join(map(str, fechados))}) AND cliente NOT IN ('', 'CONSUMIDOR') GROUP BY 1),
       v AS (SELECT cliente, COALESCE(SUM(qtd) FILTER (WHERE per IN ({','.join(map(str, ant6))})), 0) / 6 antes,
                    COALESCE(SUM(qtd) FILTER (WHERE per IN ({','.join(map(str, ult3))})), 0) / 3 depois, MAX(data) ultima
             FROM m JOIN p USING (loja, cod) WHERE p.prod = '{P}' AND tipo = 'VENDA' GROUP BY 1)
      SELECT rk.pos, v.cliente, 100 * rk.rec / tot.t part, v.antes, v.depois, v.ultima
      FROM v JOIN rk USING (cliente), tot WHERE rk.pos <= 150 AND v.antes >= 1 AND v.depois < 0.5 * v.antes ORDER BY rk.pos LIMIT 10""")
    clientes_que_cairam = [{'ranking': c['pos'], 'cliente': c['cliente'], 'partReceitaPct': round(float(c['part']), 2),
                            'unMesAntes': r1(c['antes']), 'unMesDepois': r1(c['depois']), 'ultimaCompra': str(c['ultima'])} for c in clientes]

    # 6. Custo da última compra x média das anteriores (DW), por fabricante.
    custo_compras = []
    dwmov = os.path.join(a.dw, f'{a.empresa}_MOVIMENTO_ATUAL.parquet').replace('\\', '/') if a.dw else ''
    if dwmov and os.path.exists(dwmov):
        con.execute(f"""CREATE VIEW c AS SELECT ID_LOJA loja, CODIGO_PRODUTO cod, strptime(DATA_MOVIMENTO, '%d/%m/%Y %H:%M:%S')::DATE data,
            {num('QUANTIDADE')} qtd, {num('TOTAL')} total FROM '{dwmov}' WHERE TIPO_MOVIMENTO = 'COMPRA'""")
        for f in linhas(f"""
          WITH o AS (SELECT c.*, p.fab, c.total / NULLIF(c.qtd, 0) unit, ROW_NUMBER() OVER (PARTITION BY c.loja, c.cod ORDER BY c.data DESC) n
                     FROM c JOIN p USING (loja, cod) WHERE p.prod = '{P}' AND c.qtd > 0),
           u AS (SELECT loja, cod, fab, MAX(data) FILTER (WHERE n = 1) ultima, MAX(unit) FILTER (WHERE n = 1) u1, AVG(unit) FILTER (WHERE n > 1) ua FROM o GROUP BY 1, 2, 3)
          SELECT fab, COUNT(*) skus, MAX(ultima) ultima, AVG(100 * (u1 / ua - 1)) var FROM u WHERE ua IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 6"""):
            custo_compras.append({'fab': f['fab'], 'skus': f['skus'], 'ultimaCompra': str(f['ultima']), 'varCustoPct': r1(f['var'])})

    # 7. Promoção: acima do máximo e AINDA vendendo (8+ dos 11 meses), fora o produto investigado e o que o analisador manda reajustar.
    reajustar = [x.replace("'", "''") for x in json.loads(a.reajustar)]
    fora = ', '.join(f"'{x}'" for x in reajustar + [a.produto.replace("'", "''")])
    promo = linhas(f"""SELECT prod, SUM(GREATEST(est - maximo, 0)) excesso, SUM(GREATEST(est - maximo, 0) * ult) excesso_rs,
        SUM(est) / NULLIF(SUM(d15) / 15, 0) dias, AVG(100 * (1 - med / NULLIF(preco, 0))) margem
      FROM sku WHERE meses_venda >= 8 AND d15 > 0 AND LOWER(prod) NOT LIKE 'n_o harmonizado' AND prod NOT IN ({fora})
      GROUP BY 1 HAVING SUM(GREATEST(est - maximo, 0) * ult) > 0 ORDER BY excesso_rs DESC LIMIT 5""")
    promocao = [{'produto': x['prod'], 'excessoUn': r1(x['excesso']), 'excessoRs': round(float(x['excesso_rs'])),
                 'diasCobertura': round(float(x['dias'])) if x['dias'] is not None else None, 'margemPct': r1(x['margem'])} for x in promo]

    json.dump({
        'empresa': a.empresa, 'produto': a.produto, 'fim': str(fim),
        'vendaMesmoPeriodo': venda_mesmo_periodo, 'serieMensal': serie_mensal, 'porLoja': por_loja,
        'transferencias': transferencias, 'comprar': comprar, 'clientesQueCairam': clientes_que_cairam,
        'custoCompras': custo_compras, 'promocao': promocao,
    }, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
