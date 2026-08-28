import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * Suíte das 22 ferramentas do agente (`server/ia/tools.cjs`) — 100 casos
 * cobrindo: contrato de cada ferramenta (campos que o prompt promete),
 * validação de argumento obrigatório, guardas de negócio (conflito de agenda,
 * teto de resultado), e o defeito de dupla serialização JSON que existe no
 * banco real (campos de array chegando como string) — este último é o que mais
 * quebrou código novo nesta base, então cada ferramenta que lê array tem caso
 * dedicado com o dado "sujo".
 *
 * Tudo com `repoMemoria` + env de teste isolada (ONEDRIVE_ROOT e SQLITE_DIR
 * sobrescritos ANTES de qualquer require do app — ver
 * `analisesAutomaticas.test.ts`): ferramentas de escrita passam por
 * `executarMutacao`, que abre seu próprio repo real se o SQLITE_DIR não
 * estiver redirecionado.
 */

let tmpOneDrive: string;
let tmpSqlite: string;
let repoMemoria: typeof import('../dominio/repo.cjs').repoMemoria;
let FERRAMENTAS: { name: string; description: string; parameters: unknown; executar: (repo: unknown, args?: unknown) => unknown }[];
let DOSSIES_DIR: string;

const MODULOS = [
  '../config.cjs', '../modo.cjs', '../dominio/repo.cjs', '../dominio/cadenciaServico.cjs',
  '../dominio/sugestaoAgenda.cjs', '../dominio/feriados.cjs', '../ceoAgenda.cjs',
  './tools.cjs', './analisesAutomaticas.cjs', './analiseCliente.cjs', './ollamaClient.cjs',
  '../fila/mutacao.cjs', '../dominio/agenda.cjs', '../dominio/lembretes.cjs',
];

function limparCaches() {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
}

beforeEach(() => {
  tmpOneDrive = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-tools-od-'));
  tmpSqlite = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-tools-sq-'));
  process.env.ONEDRIVE_ROOT = tmpOneDrive;
  process.env.SQLITE_DIR = tmpSqlite;
  limparCaches();
  ({ repoMemoria } = require('../dominio/repo.cjs'));
  ({ FERRAMENTAS } = require('./tools.cjs'));
  ({ DOSSIES_DIR } = require('../config.cjs'));
});

afterEach(() => {
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  limparCaches();
  fs.rmSync(tmpOneDrive, { recursive: true, force: true });
  fs.rmSync(tmpSqlite, { recursive: true, force: true });
});

const tool = (nome: string) => {
  const f = FERRAMENTAS.find((x) => x.name === nome);
  if (!f) throw new Error(`ferramenta "${nome}" não existe`);
  return f;
};
const exec = (nome: string, repo: unknown, args?: unknown) => tool(nome).executar(repo, args) as any;

/** Cliente base: ativo, Regular, com Monitoria+Price, 1 contato. */
function clienteBase(over: Record<string, unknown> = {}) {
  return {
    id: 'c1', empresa: 'Loja Teste', monitor: 'Erick Cardoso',
    servicos: ['Monitoria', 'Precificação'], servicosIndependentes: [],
    contatos: [{ id: 'ct1', nome: 'João Silva', cargo: 'Gerente', telefone: '21 99999-0000', servicos: [], escopo: 'loja' }],
    observacao: '', estado: 'Ativo', status: 'Regular', tipoAnalise: 'unitaria', grupo: '',
    createdAt: '2026-01-01T00:00:00.000Z', ...over,
  };
}

function repoBase(over: Record<string, unknown[]> = {}) {
  return repoMemoria({
    Clientes: [clienteBase()], Agenda: [], AnalisesIA: [], Lembretes: [], Acoes: [], AcoesIA: [],
    Cadencias: [], AgilTarefas: [], AgilColunas: [], AgilBoards: [], ...over,
  });
}

function escreverDossie(clientId: string, slug: string, corpo: string) {
  fs.writeFileSync(path.join(DOSSIES_DIR, `${clientId}--${slug}.md`), corpo, 'utf8');
}

// ---------------------------------------------------------------------------
// 1-8: catálogo e contrato geral das ferramentas
// ---------------------------------------------------------------------------
describe('catálogo de ferramentas', () => {
  it('1. expõe exatamente as 26 ferramentas esperadas', () => {
    expect(FERRAMENTAS).toHaveLength(26);
  });

  it('2. nenhum nome de ferramenta duplicado', () => {
    const nomes = FERRAMENTAS.map((f) => f.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('3. toda ferramenta tem name, description e executar', () => {
    for (const f of FERRAMENTAS) {
      expect(typeof f.name).toBe('string');
      expect(f.name.length).toBeGreaterThan(0);
      expect(typeof f.description).toBe('string');
      expect(typeof f.executar).toBe('function');
    }
  });

  it('4. toda description tem substância (>= 40 chars) — é o que o modelo lê pra escolher', () => {
    for (const f of FERRAMENTAS) expect(f.description.length).toBeGreaterThanOrEqual(40);
  });

  it('5. todo parameters é um JSON Schema de objeto', () => {
    for (const f of FERRAMENTAS) expect((f.parameters as any).type).toBe('object');
  });

  it('6. required, quando existe, aponta pra propriedade declarada', () => {
    for (const f of FERRAMENTAS) {
      const p = f.parameters as any;
      for (const req of p.required ?? []) expect(Object.keys(p.properties ?? {})).toContain(req);
    }
  });

  /**
   * A intenção original ("só uma ferramenta de edição") era garantir que o
   * agente não edita Cliente/Agenda/Lembrete. Isso continua valendo: as
   * ferramentas de escrita que existem hoje atuam sobre memória do agente
   * (dossiê e regras do processo) e sobre CRIAÇÃO de evento/lembrete — nenhuma
   * altera ou apaga cadastro existente.
   */
  it('7. as ferramentas de edição são só as de memória do agente', () => {
    const edicao = FERRAMENTAS.filter((f) => /^(corrigir|atualizar|editar|remover|excluir|deletar)/.test(f.name));
    expect(edicao.map((f) => f.name).sort()).toEqual(['corrigir_dossie_cliente', 'remover_memoria']);
  });

  it('7b. nenhuma ferramenta edita ou apaga Cliente, Agenda ou Lembrete', () => {
    const proibidas = FERRAMENTAS.filter((f) => /(cliente|evento|lembrete|agenda)$/.test(f.name)
      && /^(atualizar|editar|remover|excluir|deletar)/.test(f.name));
    expect(proibidas.map((f) => f.name)).toEqual([]);
  });

  it('8. nome de ferramenta segue snake_case', () => {
    for (const f of FERRAMENTAS) expect(f.name).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

// ---------------------------------------------------------------------------
// 9-20: buscar_clientes
// ---------------------------------------------------------------------------
describe('buscar_clientes', () => {
  it('9. lista todos sem filtro', () => {
    expect(exec('buscar_clientes', repoBase())).toHaveLength(1);
  });

  it('10. devolve identidade (empresa/grupo/loja) e situação', () => {
    const [r] = exec('buscar_clientes', repoBase());
    expect(r).toMatchObject({ empresa: 'Loja Teste', grupo: null, loja: null, status: 'Regular', estado: 'Ativo' });
  });

  it('11. cliente de rede vem com grupo e loja separados', () => {
    const repo = repoBase({ Clientes: [clienteBase({ empresa: 'Rede X - Filial Norte', grupo: 'Rede X' })] });
    const [r] = exec('buscar_clientes', repo);
    expect(r).toMatchObject({ grupo: 'Rede X', loja: 'Filial Norte' });
  });

  it('12. filtra por grupo (case-insensitive)', () => {
    const repo = repoBase({ Clientes: [clienteBase({ id: 'a', empresa: 'Rede X - N', grupo: 'Rede X' }), clienteBase({ id: 'b', empresa: 'Outro' })] });
    expect(exec('buscar_clientes', repo, { grupo: 'rede x' })).toHaveLength(1);
  });

  it('13. filtra por grupo parcial', () => {
    const repo = repoBase({ Clientes: [clienteBase({ id: 'a', empresa: 'Altese - N', grupo: 'Altese' })] });
    expect(exec('buscar_clientes', repo, { grupo: 'alte' })).toHaveLength(1);
  });

  it('14. filtro de grupo que não casa devolve vazio', () => {
    expect(exec('buscar_clientes', repoBase(), { grupo: 'inexistente' })).toHaveLength(0);
  });

  it('15. filtra por status', () => {
    const repo = repoBase({ Clientes: [clienteBase({ id: 'a' }), clienteBase({ id: 'b', status: 'Suspenso' })] });
    expect(exec('buscar_clientes', repo, { status: 'Suspenso' })).toHaveLength(1);
  });

  it('16. filtra por serviço', () => {
    const repo = repoBase({ Clientes: [clienteBase({ id: 'a' }), clienteBase({ id: 'b', servicos: ['Monitoria'] })] });
    expect(exec('buscar_clientes', repo, { servico: 'Precificação' })).toHaveLength(1);
  });

  it('17. filtra por serviço mesmo com servicos duplamente serializado (bug do banco real)', () => {
    const repo = repoBase({ Clientes: [clienteBase({ servicos: '["Monitoria","Precificação"]' as unknown as string[] })] });
    expect(exec('buscar_clientes', repo, { servico: 'Precificação' })).toHaveLength(1);
  });

  it('18. filtra por nivelRisco cruzando com AnalisesIA', () => {
    const repo = repoBase({ AnalisesIA: [{ id: 'a1', clientId: 'c1', nivelRisco: 'alto' }] });
    expect(exec('buscar_clientes', repo, { nivelRisco: 'alto' })).toHaveLength(1);
    expect(exec('buscar_clientes', repo, { nivelRisco: 'baixo' })).toHaveLength(0);
  });

  it('19. cliente sem análise vem com nivelRisco null', () => {
    const [r] = exec('buscar_clientes', repoBase());
    expect(r.nivelRisco).toBeNull();
  });

  it('20. filtros combinados aplicam em AND', () => {
    const repo = repoBase({
      Clientes: [clienteBase({ id: 'a', grupo: 'G', empresa: 'G - Um' }), clienteBase({ id: 'b', grupo: 'G', empresa: 'G - Dois', status: 'Suspenso' })],
    });
    expect(exec('buscar_clientes', repo, { grupo: 'G', status: 'Suspenso' })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 21-32: buscar_dossie_cliente
// ---------------------------------------------------------------------------
describe('buscar_dossie_cliente', () => {
  it('21. exige clientId', () => {
    expect(() => exec('buscar_dossie_cliente', repoBase(), {})).toThrow(/clientId.*obrigat/i);
  });

  it('22. erro claro em cliente inexistente', () => {
    expect(() => exec('buscar_dossie_cliente', repoBase(), { clientId: 'nope' })).toThrow(/não encontrado/i);
  });

  it('23. devolve o texto do dossiê gravado', () => {
    escreverDossie('c1', 'loja-teste', '## Loja Teste\n\n### Perfil\nLoja de peças.\n');
    expect(exec('buscar_dossie_cliente', repoBase(), { clientId: 'c1' }).dossie).toContain('Loja de peças');
  });

  it('24. dossiê ausente devolve string vazia, não erro', () => {
    expect(exec('buscar_dossie_cliente', repoBase(), { clientId: 'c1' }).dossie).toBe('');
  });

  it('25. ultimaAnalise null quando cliente nunca foi analisado (gatilho do prompt)', () => {
    expect(exec('buscar_dossie_cliente', repoBase(), { clientId: 'c1' }).ultimaAnalise).toBeNull();
  });

  it('26. devolve a última análise quando existe', () => {
    const repo = repoBase({ AnalisesIA: [{ id: 'a1', clientId: 'c1', nivelRisco: 'medio', resumo: 'ok' }] });
    expect(exec('buscar_dossie_cliente', repo, { clientId: 'c1' }).ultimaAnalise).toMatchObject({ nivelRisco: 'medio' });
  });

  it('27. expõe estado/status pro gatilho de cliente fora de atendimento', () => {
    const repo = repoBase({ Clientes: [clienteBase({ status: 'Atendido pelo Marco' })] });
    expect(exec('buscar_dossie_cliente', repo, { clientId: 'c1' })).toMatchObject({ estado: 'Ativo', status: 'Atendido pelo Marco' });
  });

  it('28. proximoEvento null quando não há reunião futura (gatilho risco sem pauta)', () => {
    expect(exec('buscar_dossie_cliente', repoBase(), { clientId: 'c1' }).proximoEvento).toBeNull();
  });

  it('29. proximoEvento traz a reunião futura mais próxima', () => {
    const futuro = new Date(Date.now() + 5 * 86400e3).toISOString();
    const maisLonge = new Date(Date.now() + 20 * 86400e3).toISOString();
    const repo = repoBase({ Agenda: [
      { id: 'e2', clientId: 'c1', type: 'Reunião', date: maisLonge, status: 'Agendado' },
      { id: 'e1', clientId: 'c1', type: 'Reunião', date: futuro, status: 'Agendado' },
    ] });
    expect(exec('buscar_dossie_cliente', repo, { clientId: 'c1' }).proximoEvento.date).toBe(futuro);
  });

  it('30. evento cancelado não conta como proximoEvento', () => {
    const futuro = new Date(Date.now() + 5 * 86400e3).toISOString();
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', type: 'Reunião', date: futuro, status: 'Cancelado' }] });
    expect(exec('buscar_dossie_cliente', repo, { clientId: 'c1' }).proximoEvento).toBeNull();
  });

  it('31. evento passado não conta como proximoEvento', () => {
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', type: 'Reunião', date: '2020-01-01', status: 'Agendado' }] });
    expect(exec('buscar_dossie_cliente', repo, { clientId: 'c1' }).proximoEvento).toBeNull();
  });

  it('32. servicosIndependentes normalizado mesmo duplamente serializado', () => {
    const repo = repoBase({ Clientes: [clienteBase({ servicosIndependentes: '["Precificação"]' as unknown as string[] })] });
    expect(exec('buscar_dossie_cliente', repo, { clientId: 'c1' }).servicosIndependentes).toEqual(['Precificação']);
  });
});

// ---------------------------------------------------------------------------
// 33-42: buscar_registros_produto
// ---------------------------------------------------------------------------
describe('buscar_registros_produto', () => {
  const comRegistro = (over: Record<string, unknown> = {}) => ({
    id: 'e1', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: '2026-08-01',
    produtosSituacao: [{ id: 'p1', produto: 'Óleo', situacao: 'vendas zeraram' }], precificacoes: [], ...over,
  });

  it('33. exige clientId', () => {
    expect(() => exec('buscar_registros_produto', repoBase(), {})).toThrow(/obrigat/i);
  });

  it('34. cliente inexistente lança erro', () => {
    expect(() => exec('buscar_registros_produto', repoBase(), { clientId: 'x' })).toThrow(/não encontrado/i);
  });

  it('35. devolve registro de produtosSituacao', () => {
    const repo = repoBase({ Agenda: [comRegistro()] });
    expect(exec('buscar_registros_produto', repo, { clientId: 'c1' }).registros[0].produtosSituacao[0].produto).toBe('Óleo');
  });

  it('36. devolve registro de precificacoes', () => {
    const repo = repoBase({ Agenda: [comRegistro({ produtosSituacao: [], precificacoes: [{ id: 'q1', produto: 'Filtro', margem: 'desceu' }] })] });
    expect(exec('buscar_registros_produto', repo, { clientId: 'c1' }).registros[0].precificacoes[0].margem).toBe('desceu');
  });

  it('37. evento sem nenhum registro é filtrado fora', () => {
    const repo = repoBase({ Agenda: [comRegistro({ produtosSituacao: [], precificacoes: [] })] });
    expect(exec('buscar_registros_produto', repo, { clientId: 'c1' }).registros).toHaveLength(0);
  });

  it('38. funciona com produtosSituacao duplamente serializado (bug do banco real)', () => {
    const repo = repoBase({ Agenda: [comRegistro({ produtosSituacao: '[{"id":"p1","produto":"Óleo","situacao":"zerou"}]' })] });
    expect(exec('buscar_registros_produto', repo, { clientId: 'c1' }).registros).toHaveLength(1);
  });

  it('39. mais recente primeiro', () => {
    const repo = repoBase({ Agenda: [comRegistro({ id: 'a', date: '2026-07-01' }), comRegistro({ id: 'b', date: '2026-08-01' })] });
    expect(exec('buscar_registros_produto', repo, { clientId: 'c1' }).registros[0].date).toBe('2026-08-01');
  });

  it('40. teto de 10 registros (não estoura o prompt)', () => {
    const muitos = Array.from({ length: 15 }, (_, i) => comRegistro({ id: `e${i}`, date: `2026-01-${String(i + 1).padStart(2, '0')}` }));
    const repo = repoBase({ Agenda: muitos });
    expect(exec('buscar_registros_produto', repo, { clientId: 'c1' }).registros).toHaveLength(10);
  });

  it('41. expõe reagendamentos (gatilho de desengajamento)', () => {
    const repo = repoBase({ Agenda: [comRegistro({ reagendamentos: 3 })] });
    expect(exec('buscar_registros_produto', repo, { clientId: 'c1' }).registros[0].reagendamentos).toBe(3);
  });

  it('42. não vaza registro de outro cliente', () => {
    const repo = repoBase({
      Clientes: [clienteBase(), clienteBase({ id: 'c2', empresa: 'Outra' })],
      Agenda: [comRegistro({ clientId: 'c2' })],
    });
    expect(exec('buscar_registros_produto', repo, { clientId: 'c1' }).registros).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 43-50: contatos (por cliente, global, cobertura)
// ---------------------------------------------------------------------------
describe('ferramentas de contato', () => {
  it('43. buscar_contatos_cliente exige clientId', () => {
    expect(() => exec('buscar_contatos_cliente', repoBase(), {})).toThrow(/obrigat/i);
  });

  it('44. buscar_contatos_cliente devolve os contatos', () => {
    expect(exec('buscar_contatos_cliente', repoBase(), { clientId: 'c1' }).contatos[0].nome).toBe('João Silva');
  });

  it('45. buscar_contatos_cliente aceita contatos duplamente serializados', () => {
    const repo = repoBase({ Clientes: [clienteBase({ contatos: '[{"id":"x","nome":"Maria"}]' as unknown as [] })] });
    expect(exec('buscar_contatos_cliente', repo, { clientId: 'c1' }).contatos[0].nome).toBe('Maria');
  });

  it('46. buscar_contatos (global) achata a carteira toda', () => {
    const repo = repoBase({ Clientes: [clienteBase(), clienteBase({ id: 'c2', empresa: 'Outra', contatos: [{ id: 'ct2', nome: 'Ana' }] })] });
    expect(exec('buscar_contatos', repo, {}).total).toBe(2);
  });

  it('47. buscar_contatos filtra por nome parcial, sem case', () => {
    expect(exec('buscar_contatos', repoBase(), { nome: 'joão' }).total).toBe(1);
    expect(exec('buscar_contatos', repoBase(), { nome: 'zzz' }).total).toBe(0);
  });

  it('48. buscar_contatos filtra por cargo', () => {
    expect(exec('buscar_contatos', repoBase(), { cargo: 'gerente' }).total).toBe(1);
  });

  it('49. buscar_contatos: contato sem serviço marcado é geral e entra em qualquer filtro de serviço', () => {
    expect(exec('buscar_contatos', repoBase(), { servico: 'Monitoria' }).total).toBe(1);
  });

  it('50. buscar_contatos inclui a empresa de origem de cada contato', () => {
    expect(exec('buscar_contatos', repoBase(), {}).contatos[0].empresa).toBe('Loja Teste');
  });
});

describe('buscar_cobertura_contatos', () => {
  it('51. exige clientId', () => {
    expect(() => exec('buscar_cobertura_contatos', repoBase(), {})).toThrow(/obrigat/i);
  });

  it('52. contato geral (sem serviço) cobre tudo — nenhum serviço sem responsável', () => {
    expect(exec('buscar_cobertura_contatos', repoBase(), { clientId: 'c1' }).servicosSemResponsavel).toEqual([]);
  });

  it('53. acusa serviço contratado sem responsável', () => {
    const repo = repoBase({ Clientes: [clienteBase({ contatos: [{ id: 'ct1', nome: 'João', servicos: ['Monitoria'] }] })] });
    expect(exec('buscar_cobertura_contatos', repo, { clientId: 'c1' }).servicosSemResponsavel).toEqual(['Precificação']);
  });

  it('54. cliente sem nenhum contato não acusa lacuna (nada a analisar)', () => {
    const repo = repoBase({ Clientes: [clienteBase({ contatos: [] })] });
    expect(exec('buscar_cobertura_contatos', repo, { clientId: 'c1' }).servicosSemResponsavel).toEqual([]);
  });

  it('55. herda contato de outra loja do mesmo grupo quando escopo = grupo', () => {
    const repo = repoBase({ Clientes: [
      clienteBase({ id: 'c1', empresa: 'G - A', grupo: 'G', contatos: [] }),
      clienteBase({ id: 'c2', empresa: 'G - B', grupo: 'G', contatos: [{ id: 'ct9', nome: 'Chefe', escopo: 'grupo' }] }),
    ] });
    const r = exec('buscar_cobertura_contatos', repo, { clientId: 'c1' });
    expect(r.contatos.some((c: any) => c.nome === 'Chefe' && c.herdadoDoGrupo)).toBe(true);
  });

  it('56. contato escopo loja NÃO é herdado por outra loja do grupo', () => {
    const repo = repoBase({ Clientes: [
      clienteBase({ id: 'c1', empresa: 'G - A', grupo: 'G', contatos: [] }),
      clienteBase({ id: 'c2', empresa: 'G - B', grupo: 'G', contatos: [{ id: 'ct9', nome: 'Local', escopo: 'loja' }] }),
    ] });
    expect(exec('buscar_cobertura_contatos', repo, { clientId: 'c1' }).contatos).toHaveLength(0);
  });

  it('57. cliente sem grupo não herda nada', () => {
    const repo = repoBase({ Clientes: [clienteBase({ contatos: [] }), clienteBase({ id: 'c2', empresa: 'X', contatos: [{ id: 'z', nome: 'Y', escopo: 'grupo' }] })] });
    expect(exec('buscar_cobertura_contatos', repo, { clientId: 'c1' }).contatos).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 58-66: buscar_historico_eventos / buscar_lembretes_cliente / buscar_tarefas_cliente
// ---------------------------------------------------------------------------
describe('buscar_historico_eventos', () => {
  it('58. exige clientId', () => {
    expect(() => exec('buscar_historico_eventos', repoBase(), {})).toThrow(/obrigat/i);
  });

  it('59. devolve eventos, mais recente primeiro', () => {
    const repo = repoBase({ Agenda: [
      { id: 'a', clientId: 'c1', type: 'Contato', status: 'Concluído', date: '2026-07-01' },
      { id: 'b', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: '2026-08-01' },
    ] });
    expect(exec('buscar_historico_eventos', repo, { clientId: 'c1' }).eventos[0].date).toBe('2026-08-01');
  });

  it('60. inclui ata e resumo (o conteúdo que importa)', () => {
    const repo = repoBase({ Agenda: [{ id: 'a', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: '2026-08-01', ata: 'Ata X', resumo: 'Resumo Y' }] });
    expect(exec('buscar_historico_eventos', repo, { clientId: 'c1' }).eventos[0]).toMatchObject({ ata: 'Ata X', resumo: 'Resumo Y' });
  });

  it('61. respeita limite pedido', () => {
    const eventos = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, clientId: 'c1', type: 'Reunião', status: 'Concluído', date: `2026-01-${String(i + 1).padStart(2, '0')}` }));
    expect(exec('buscar_historico_eventos', repoBase({ Agenda: eventos }), { clientId: 'c1', limite: 3 }).eventos).toHaveLength(3);
  });

  it('62. teto de 15 mesmo pedindo mais', () => {
    const eventos = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, clientId: 'c1', type: 'Reunião', status: 'Concluído', date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` }));
    expect(exec('buscar_historico_eventos', repoBase({ Agenda: eventos }), { clientId: 'c1', limite: 999 }).eventos).toHaveLength(15);
  });

  it('63. inclui evento cancelado (é histórico, não agenda ativa)', () => {
    const repo = repoBase({ Agenda: [{ id: 'a', clientId: 'c1', type: 'Reunião', status: 'Cancelado', date: '2026-08-01' }] });
    expect(exec('buscar_historico_eventos', repo, { clientId: 'c1' }).eventos).toHaveLength(1);
  });
});

describe('buscar_lembretes_cliente', () => {
  const lembrete = (over: Record<string, unknown> = {}) => ({ id: 'l1', clientId: 'c1', title: 'Ligar', datetime: '2026-09-01T10:00:00.000Z', status: 'ativo', type: 'Contato', recurrence: 'none', ...over });

  it('64. exige clientId', () => {
    expect(() => exec('buscar_lembretes_cliente', repoBase(), {})).toThrow(/obrigat/i);
  });

  it('65. lista lembretes ativos do cliente', () => {
    expect(exec('buscar_lembretes_cliente', repoBase({ Lembretes: [lembrete()] }), { clientId: 'c1' }).total).toBe(1);
  });

  it('66. esconde concluídos por padrão', () => {
    expect(exec('buscar_lembretes_cliente', repoBase({ Lembretes: [lembrete({ status: 'concluido' })] }), { clientId: 'c1' }).total).toBe(0);
  });

  it('67. incluirConcluidos=true traz o histórico', () => {
    expect(exec('buscar_lembretes_cliente', repoBase({ Lembretes: [lembrete({ status: 'concluido' })] }), { clientId: 'c1', incluirConcluidos: true }).total).toBe(1);
  });

  it('68. ordena por data crescente (o mais próximo primeiro)', () => {
    const repo = repoBase({ Lembretes: [lembrete({ id: 'b', datetime: '2026-10-01T10:00:00.000Z' }), lembrete({ id: 'a', datetime: '2026-09-01T10:00:00.000Z' })] });
    expect(exec('buscar_lembretes_cliente', repo, { clientId: 'c1' }).lembretes[0].datetime).toBe('2026-09-01T10:00:00.000Z');
  });

  it('69. não vaza lembrete de outro cliente', () => {
    const repo = repoBase({ Clientes: [clienteBase(), clienteBase({ id: 'c2', empresa: 'B' })], Lembretes: [lembrete({ clientId: 'c2' })] });
    expect(exec('buscar_lembretes_cliente', repo, { clientId: 'c1' }).total).toBe(0);
  });
});

describe('buscar_tarefas_cliente', () => {
  const tarefa = (over: Record<string, unknown> = {}) => ({ id: 't1', clientId: 'c1', boardId: 'b1', colunaId: 'col1', titulo: 'Revisar preço', responsavel: 'Erick Cardoso', ...over });
  const agilBase = { AgilBoards: [{ id: 'b1', nome: 'Tarefas Diárias' }], AgilColunas: [{ id: 'col1', titulo: 'Em andamento' }] };

  it('70. exige clientId', () => {
    expect(() => exec('buscar_tarefas_cliente', repoBase(), {})).toThrow(/obrigat/i);
  });

  it('71. lista tarefa vinculada ao cliente', () => {
    expect(exec('buscar_tarefas_cliente', repoBase({ ...agilBase, AgilTarefas: [tarefa()] }), { clientId: 'c1' }).total).toBe(1);
  });

  it('72. resolve nome do board e da coluna (não devolve id cru)', () => {
    const r = exec('buscar_tarefas_cliente', repoBase({ ...agilBase, AgilTarefas: [tarefa()] }), { clientId: 'c1' });
    expect(r.tarefas[0]).toMatchObject({ board: 'Tarefas Diárias', coluna: 'Em andamento' });
  });

  it('73. expõe bloqueio e motivo', () => {
    const repo = repoBase({ ...agilBase, AgilTarefas: [tarefa({ bloqueado: true, motivoBloqueio: 'aguardando cliente' })] });
    expect(repo && exec('buscar_tarefas_cliente', repo, { clientId: 'c1' }).tarefas[0]).toMatchObject({ bloqueado: true, motivoBloqueio: 'aguardando cliente' });
  });

  it('74. motivoBloqueio é null quando não está bloqueada', () => {
    const repo = repoBase({ ...agilBase, AgilTarefas: [tarefa({ bloqueado: false, motivoBloqueio: 'resíduo antigo' })] });
    expect(exec('buscar_tarefas_cliente', repo, { clientId: 'c1' }).tarefas[0].motivoBloqueio).toBeNull();
  });

  it('75. tarefa sem cliente vinculado não aparece', () => {
    const repo = repoBase({ ...agilBase, AgilTarefas: [tarefa({ clientId: '' })] });
    expect(exec('buscar_tarefas_cliente', repo, { clientId: 'c1' }).total).toBe(0);
  });

  it('76. board/coluna desconhecidos viram null em vez de quebrar', () => {
    const repo = repoBase({ AgilBoards: [], AgilColunas: [], AgilTarefas: [tarefa()] });
    expect(exec('buscar_tarefas_cliente', repo, { clientId: 'c1' }).tarefas[0]).toMatchObject({ board: null, coluna: null });
  });
});

// ---------------------------------------------------------------------------
// 77-88: métricas de carteira
// ---------------------------------------------------------------------------
describe('métricas de carteira', () => {
  const hoje = new Date();
  const diasAtras = (n: number) => new Date(hoje.getTime() - n * 86400e3).toISOString().slice(0, 10);

  it('77. buscar_config_cadencias devolve a régua completa', () => {
    const cfg = exec('buscar_config_cadencias', repoBase());
    expect(cfg).toMatchObject({ monitoria_dias: 30, price_dias: 30, recontato_dias: 5 });
  });

  it('78. config reflete valor sobrescrito no banco', () => {
    const cfg = exec('buscar_config_cadencias', repoBase({ Cadencias: [{ chave: 'monitoria_dias', valor: 45 }] }));
    expect(cfg.monitoria_dias).toBe(45);
  });

  it('79. buscar_fila_priorizacao devolve o contrato de campos que o prompt promete', () => {
    const r = exec('buscar_fila_priorizacao', repoBase(), {});
    for (const campo of ['total', 'pct', 'emDia', 'agendaMarcada', 'contatoRecente', 'precisaContato']) {
      expect(r).toHaveProperty(campo);
    }
  });

  it('80. cliente com reunião recente conta como em dia', () => {
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: diasAtras(3), servicos: ['Monitoria'] }] });
    expect(exec('buscar_fila_priorizacao', repo, {}).emDia).toBe(1);
  });

  it('81. cliente nunca atendido precisa de contato', () => {
    expect(exec('buscar_fila_priorizacao', repoBase(), {}).precisaContato).toBe(1);
  });

  it('82. cliente suspenso sai da conta de aderência', () => {
    const repo = repoBase({ Clientes: [clienteBase({ status: 'Suspenso' })] });
    expect(exec('buscar_fila_priorizacao', repo, {}).total).toBe(0);
  });

  it('83. cliente atendido pelo Marco sai da conta', () => {
    const repo = repoBase({ Clientes: [clienteBase({ status: 'Atendido pelo Marco' })] });
    expect(exec('buscar_fila_priorizacao', repo, {}).total).toBe(0);
  });

  it('84. serviço marcado como independente não é cobrado na cadência', () => {
    const repo = repoBase({ Clientes: [clienteBase({ servicos: ['Precificação'], servicosIndependentes: ['Precificação'] })] });
    expect(exec('buscar_fila_priorizacao', repo, {}).total).toBe(0);
  });

  it('85. filtro por serviço restringe a conta', () => {
    const repo = repoBase({ Clientes: [clienteBase({ servicos: ['Monitoria'] })] });
    expect(exec('buscar_fila_priorizacao', repo, { servico: 'Price' }).total).toBe(0);
    expect(exec('buscar_fila_priorizacao', repo, { servico: 'Monitoria' }).total).toBe(1);
  });

  it('86. buscar_cobertura: reunião recente cobre o cliente', () => {
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: diasAtras(5) }] });
    const r = exec('buscar_cobertura', repo);
    expect(r).toMatchObject({ total: 1, cobertos: 1, pct: 100 });
  });

  it('87. buscar_cobertura: sem evento nenhum, 0% e lista quem falta', () => {
    const r = exec('buscar_cobertura', repoBase());
    expect(r.pct).toBe(0);
    expect(r.semContatoClientes).toContain('Loja Teste');
  });

  it('88. buscar_cobertura ignora Contato (só reunião/relatório cobre)', () => {
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', type: 'Contato', status: 'Concluído', date: diasAtras(2) }] });
    expect(exec('buscar_cobertura', repo).pct).toBe(0);
  });

  it('89. buscar_cobertura_servicos devolve uma linha por serviço', () => {
    const r = exec('buscar_cobertura_servicos', repoBase());
    expect(r.servicos.map((s: any) => s.servico)).toEqual(['Monitoria', 'Price']);
  });

  it('90. buscar_cobertura_servicos aponta quem contratou e não foi atendido', () => {
    const r = exec('buscar_cobertura_servicos', repoBase());
    expect(r.servicos[0].descobertosClientes).toContain('Loja Teste');
  });

  it('91. buscar_alertas_acompanhamento pega cliente sem contato há muito tempo', () => {
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: diasAtras(60) }] });
    const r = exec('buscar_alertas_acompanhamento', repo);
    expect(r.alertas[0]).toMatchObject({ empresa: 'Loja Teste' });
    expect(r.alertas[0].diasSemContato).toBeGreaterThanOrEqual(30);
  });

  it('92. contato recente NÃO gera alerta', () => {
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: diasAtras(3) }] });
    expect(exec('buscar_alertas_acompanhamento', repo).alertas).toHaveLength(0);
  });

  it('93. cliente sem nenhum histórico entra nos alertas (diasSemContato null)', () => {
    expect(exec('buscar_alertas_acompanhamento', repoBase()).alertas[0].diasSemContato).toBeNull();
  });

  it('94. buscar_vencendo devolve total e itens', () => {
    const r = exec('buscar_vencendo', repoBase());
    expect(r).toHaveProperty('total');
    expect(Array.isArray(r.itens)).toBe(true);
  });

  it('95. gerar_relatorio_executivo agrega por nível de risco', () => {
    const repo = repoBase({ AnalisesIA: [
      { id: 'a1', clientId: 'c1', nivelRisco: 'alto', sugestaoProximaPauta: 'Falar de preço' },
    ] });
    const r = exec('gerar_relatorio_executivo', repo);
    expect(r.porNivelRisco.alto).toBe(1);
    expect(r.clientesRiscoAlto[0]).toMatchObject({ empresa: 'Loja Teste' });
  });
});

// ---------------------------------------------------------------------------
// 96-100: agendamento (sugestão, disponibilidade, CEO)
// ---------------------------------------------------------------------------
describe('agendamento', () => {
  it('96. sugerir_encaixes_agenda sugere dia útil, com monitor e motivo', () => {
    const r = exec('sugerir_encaixes_agenda', repoBase(), { max: 1 });
    expect(r.total).toBe(1);
    const s = r.sugestoes[0];
    expect(s).toMatchObject({ empresa: 'Loja Teste', monitor: 'Erick Cardoso' });
    expect(s.hora).toMatch(/^\d{2}:\d{2}$/);
    const diaSemana = new Date(`${s.dia}T12:00:00`).getDay();
    expect(diaSemana).not.toBe(0);
    expect(diaSemana).not.toBe(6);
    expect(s.motivo.length).toBeGreaterThan(0);
  });

  it('97. cliente com reunião futura marcada não recebe sugestão', () => {
    const futuro = new Date(Date.now() + 4 * 86400e3).toISOString().slice(0, 10);
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', type: 'Reunião', status: 'Agendado', date: futuro, servicos: ['Monitoria'], monitores: ['Erick Cardoso'] }] });
    expect(exec('sugerir_encaixes_agenda', repo, {}).total).toBe(0);
  });

  it('98. verificar_disponibilidade acusa conflito do mesmo monitor no mesmo dia/hora', () => {
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', clientName: 'Loja Teste', type: 'Reunião', status: 'Agendado', date: '2026-09-10', time: '14:00', monitores: ['Erick Cardoso'] }] });
    const r = exec('verificar_disponibilidade', repo, { date: '2026-09-10', time: '14:00', monitores: ['Erick Cardoso'] });
    expect(r.disponivel).toBe(false);
    expect(r.motivo).toMatch(/Erick Cardoso/);
  });

  it('99. criar_evento é bloqueado por conflito de monitor (guarda que só existia no formulário)', () => {
    const repo = repoBase({ Agenda: [{ id: 'e1', clientId: 'c1', clientName: 'Loja Teste', type: 'Reunião', status: 'Agendado', date: '2026-09-10', time: '14:00', monitores: ['Erick Cardoso'] }] });
    expect(() => exec('criar_evento', repo, { clientId: 'c1', type: 'Reunião', date: '2026-09-10', time: '14:00', monitores: ['Erick Cardoso'] }))
      .toThrow(/conflito de agenda/i);
  });

  it('100. buscar_agenda_ceo devolve contrato estável mesmo com cache vazio', () => {
    const r = exec('buscar_agenda_ceo', repoBase(), { dias: 7 });
    expect(r).toMatchObject({ janelaDias: 7 });
    expect(r).toHaveProperty('sincronizadoEm');
    expect(Array.isArray(r.eventos)).toBe(true);
  });
});
