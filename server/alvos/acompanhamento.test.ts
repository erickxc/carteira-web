import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let tmp: string;
let statusPath: string;
let ac: typeof import('./acompanhamento.cjs');

const CLIENTE = { id: 'c-itab', empresa: 'Aliança - Itaboraí' };
const VINCULOS = { 'Dados Mockados': { alianca_itaborai: 'c-itab' } };
const LOJAS = { 'Dados Mockados': ['alianca_itaborai'] };

/** Linha do cruzamento na loja do cliente. */
const cruz = (mes: number, receita: number, qtd: number, over: Record<string, unknown> = {}) => ({
  loja: 'alianca_itaborai',
  cliente: 'EDUARDO MECANICO (CM)',
  produto: 'Kit Amortecedor',
  ano: 2026,
  mes,
  receita,
  qtd,
  ...over,
});

/** Agregado mínimo: 3 meses de base + 2 meses depois da reunião de 12/06. */
function agregado(extra: Record<string, unknown>[] = []) {
  return {
    lojas: [{ loja: 'alianca_itaborai', receita: 1 }],
    produtos: [
      { loja: 'alianca_itaborai', produto: 'Kit Amortecedor', receita: 1 },
      { loja: 'alianca_itaborai', produto: 'Lubrificante', receita: 1 },
      { loja: 'loja_de_outro', produto: 'Pneu Fora', receita: 1 },
    ],
    clientes: [
      { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', receita: 1 },
      { loja: 'loja_de_outro', cliente: 'CLIENTE DE FORA (CM)', receita: 1 },
    ],
    cruzamento: [
      cruz(3, 1000, 10), cruz(4, 1000, 10), cruz(5, 1000, 10),
      ...extra,
    ],
  };
}

const eventos = [
  { date: '2026-06-12', ata: 'Combinado reduzir margem do Kit Amortecedor.' },
  { date: '2026-07-10', ata: 'Reforçado: seguir com Kit Amortecedor.' },
];

const base = { vinculos: VINCULOS, lojasPorEmpresa: LOJAS, periodoParcial: '2026-09' };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-acomp-'));
  statusPath = path.join(tmp, 'ac.json');
  process.env.ALVOS_ACOMPANHAMENTO_PATH = statusPath;
  process.env.ALVOS_VINCULOS_PATH = path.join(tmp, 'v.json');
  for (const m of ['./mapa.cjs', './estado.cjs', './acompanhamento.cjs']) delete require.cache[require.resolve(m)];
  ac = require('./acompanhamento.cjs');
});

afterEach(() => {
  delete process.env.ALVOS_ACOMPANHAMENTO_PATH;
  delete process.env.ALVOS_VINCULOS_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('acompanhamento: vínculo governa a análise', () => {
  it('cliente sem vínculo não recebe métrica, e devolve o motivo', () => {
    const r = ac.fatosDeReuniao(CLIENTE, eventos, agregado(), { vinculos: {}, lojasPorEmpresa: LOJAS });
    expect(r.estado).toBe('sem_vinculo');
    expect(r.acompanhamentos).toEqual([]);
    expect(r.motivo).toMatch(/nenhuma loja/);
  });

  it('vínculo quebrado também bloqueia', () => {
    const r = ac.fatosDeReuniao(CLIENTE, eventos, agregado(), {
      vinculos: VINCULOS,
      lojasPorEmpresa: { 'Dados Mockados': ['outra_loja'] },
    });
    expect(r.estado).toBe('vinculo_quebrado');
    expect(r.acompanhamentos).toEqual([]);
  });

  it('só considera produtos e clientes DAS LOJAS do cliente', () => {
    const listas = ac.listasDoCliente(agregado(), ['alianca_itaborai']);
    expect(listas.produtos).toEqual(['Kit Amortecedor', 'Lubrificante']);
    expect(listas.clientes).toEqual(['EDUARDO MECANICO (CM)']);
  });
});

describe('acompanhamento: retorno do combinado', () => {
  it('mede o movimento desde a primeira reunião que pautou a entidade', () => {
    const r = ac.fatosDeReuniao(CLIENTE, eventos, agregado([cruz(7, 500, 5), cruz(8, 500, 5)]), base);
    const kit = r.acompanhamentos.find((a) => a.nome === 'Kit Amortecedor');
    expect(kit?.combinadoEm).toBe('2026-06-12');
    expect(kit?.reunioes).toHaveLength(2);
    expect(kit?.movimento.veredicto).toBe('piorou');
  });

  /** O segundo exemplo do usuário: insistiram duas vezes e nada mudou. */
  it('alerta quando foi insistido em 2+ reuniões sem retorno', () => {
    const r = ac.fatosDeReuniao(CLIENTE, eventos, agregado([cruz(7, 1000, 10), cruz(8, 1000, 10)]), base);
    const kit = r.acompanhamentos.find((a) => a.nome === 'Kit Amortecedor');
    expect(kit?.movimento.veredicto).toBe('nao_movimentou');
    expect(kit?.alerta).toBe(true);
    expect(kit?.razao).toBe('insistido_sem_retorno');
  });

  it('não alerta com uma única menção — ainda não é padrão', () => {
    const r = ac.fatosDeReuniao(CLIENTE, [eventos[0]], agregado([cruz(7, 1000, 10), cruz(8, 1000, 10)]), base);
    expect(r.acompanhamentos[0].alerta).toBe(false);
  });

  it('movimento positivo não alerta', () => {
    const r = ac.fatosDeReuniao(CLIENTE, eventos, agregado([cruz(7, 2000, 20), cruz(8, 2000, 20)]), base);
    const kit = r.acompanhamentos.find((a) => a.nome === 'Kit Amortecedor');
    expect(kit?.movimento.veredicto).toBe('movimentou');
    expect(kit?.alerta).toBe(false);
  });

  it('alerta quando receita e quantidade divergem (sinal de preço)', () => {
    const r = ac.fatosDeReuniao(CLIENTE, [eventos[0]], agregado([cruz(7, 1050, 5), cruz(8, 1050, 5)]), base);
    expect(r.acompanhamentos[0].razao).toBe('receita_e_qtd_divergem');
  });

  it('ordena alerta primeiro, depois por impacto em R$', () => {
    const evs = [
      { date: '2026-06-12', ata: 'Kit Amortecedor e Lubrificante em pauta.' },
      { date: '2026-07-10', ata: 'Seguir com Kit Amortecedor.' },
    ];
    const dados = agregado([
      cruz(7, 1000, 10), cruz(8, 1000, 10),
      cruz(3, 500, 5, { produto: 'Lubrificante' }), cruz(4, 500, 5, { produto: 'Lubrificante' }),
      cruz(7, 5000, 50, { produto: 'Lubrificante' }),
    ]);
    const r = ac.fatosDeReuniao(CLIENTE, evs, dados, base);
    // Kit não movimentou em 2 reuniões => alerta, vem antes do Lubrificante,
    // que teve impacto muito maior em R$ mas não alerta.
    expect(r.acompanhamentos[0].nome).toBe('Kit Amortecedor');
    expect(r.acompanhamentos[0].alerta).toBe(true);
  });
});

describe('acompanhamento: decisão humana persistida', () => {
  const kit = { nome: 'Kit Amortecedor', tipo: 'produto' };

  it('status padrão é em_curso, sem nada gravado', () => {
    const r = ac.fatosDeReuniao(CLIENTE, eventos, agregado([cruz(7, 1000, 10), cruz(8, 1000, 10)]), base);
    expect(r.acompanhamentos[0].status).toBe('em_curso');
  });

  it('abandonado para de alertar', () => {
    ac.definirStatus(CLIENTE.id, kit, 'abandonado', { caminho: statusPath, decididoEm: '2026-08-20' });
    const r = ac.fatosDeReuniao(CLIENTE, eventos, agregado([cruz(7, 1000, 10), cruz(8, 1000, 10)]), { ...base, caminho: statusPath });
    const item = r.acompanhamentos.find((a) => a.nome === 'Kit Amortecedor');
    expect(item?.status).toBe('abandonado');
    expect(item?.alerta).toBe(false);
    expect(item?.decididoEm).toBe('2026-08-20');
  });

  /** Silenciar não pode virar cegueira: se voltou a andar, precisa reaparecer. */
  it('abandonado que VOLTA a se mover alerta de novo, com outra razão', () => {
    ac.definirStatus(CLIENTE.id, kit, 'abandonado', { caminho: statusPath });
    const r = ac.fatosDeReuniao(CLIENTE, eventos, agregado([cruz(7, 3000, 30), cruz(8, 3000, 30)]), { ...base, caminho: statusPath });
    const item = r.acompanhamentos.find((a) => a.nome === 'Kit Amortecedor');
    expect(item?.alerta).toBe(true);
    expect(item?.razao).toBe('abandonado_voltou_a_mover');
  });

  it('resolvido nunca alerta', () => {
    ac.definirStatus(CLIENTE.id, kit, 'resolvido', { caminho: statusPath });
    const r = ac.fatosDeReuniao(CLIENTE, eventos, agregado([cruz(7, 100, 1), cruz(8, 100, 1)]), { ...base, caminho: statusPath });
    expect(r.acompanhamentos.find((a) => a.nome === 'Kit Amortecedor')?.alerta).toBe(false);
  });

  it('status nulo volta ao padrão', () => {
    ac.definirStatus(CLIENTE.id, kit, 'abandonado', { caminho: statusPath });
    ac.definirStatus(CLIENTE.id, kit, null, { caminho: statusPath });
    expect(ac.carregarStatus(statusPath)[CLIENTE.id]).toEqual({});
  });

  it('recusa status fora do vocabulário', () => {
    expect(() => ac.definirStatus(CLIENTE.id, kit, 'meio_resolvido', { caminho: statusPath }))
      .toThrow(/Status inválido/);
  });

  it('gravar um acompanhamento preserva os outros e os outros clientes', () => {
    ac.definirStatus(CLIENTE.id, kit, 'abandonado', { caminho: statusPath });
    ac.definirStatus(CLIENTE.id, { nome: 'Lubrificante', tipo: 'produto' }, 'resolvido', { caminho: statusPath });
    ac.definirStatus('outro-cliente', kit, 'em_curso', { caminho: statusPath });
    const tudo = ac.carregarStatus(statusPath);
    expect(Object.keys(tudo[CLIENTE.id])).toHaveLength(2);
    expect(tudo['outro-cliente']).toBeTruthy();
  });

  it('arquivo corrompido não derruba a leitura', () => {
    fs.writeFileSync(statusPath, 'não é json');
    expect(ac.carregarStatus(statusPath)).toEqual({});
  });

  it('a chave da entidade ignora acento e caixa', () => {
    expect(ac.chaveEntidade({ nome: 'Vela Ignição', tipo: 'produto' }))
      .toBe(ac.chaveEntidade({ nome: 'VELA IGNICAO', tipo: 'produto' }));
  });
});
