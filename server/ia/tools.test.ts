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
/** Forma mínima do JSON Schema que `parameters` de cada ferramenta declara —
 *  só os campos que os testes 5/6 verificam (objeto, required, properties). */
interface JsonSchemaObjeto {
  type: string;
  required?: string[];
  properties?: Record<string, unknown>;
}

let FERRAMENTAS: { name: string; description: string; parameters: unknown; executar: (repo: unknown, args?: unknown) => unknown }[];
let DOSSIES_DIR: string;
let UPLOADS_DIR: string;
let dbSqlite: typeof import('../dbSqlite.cjs');

const MODULOS = [
  '../config.cjs', '../dbSqlite.cjs', '../modo.cjs', '../dominio/repo.cjs', '../dominio/cadenciaServico.cjs',
  '../dominio/sugestaoAgenda.cjs', '../dominio/feriados.cjs', '../ceoAgenda.cjs',
  './tools.cjs', './analisesAutomaticas.cjs', './analiseCliente.cjs', './ollamaClient.cjs',
  '../fila/mutacao.cjs', '../dominio/agenda.cjs', '../dominio/lembretes.cjs',
  '../alvos/leitor.cjs', '../alvos/cache.cjs', '../alvos/mapa.cjs', '../alvos/estado.cjs',
  '../alvos/entidades.cjs', '../alvos/movimento.cjs', '../alvos/acompanhamento.cjs', '../alvos/consulta.cjs',
  '../alvos/clientesFinais.cjs', '../alvos/tags.cjs',
];

/** Vocabulário compartilhado do Ecossistema (`Bancos/tags.json`) — em teste,
 *  um arquivo temporário apontado por `TAGS_CLIENTE_FINAL_PATH`. */
const TAGS_FIXTURE = [
  { id: 'alerta', rotulo: 'Alerta', ativa: true, entra_na_analise: true },
  { id: 'inadimplente', rotulo: 'Inadimplente', ativa: true, entra_na_analise: true },
];

function limparCaches() {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
}

let tmpAlvos: string;

beforeEach(() => {
  tmpOneDrive = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-tools-od-'));
  tmpSqlite = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-tools-sq-'));
  tmpAlvos = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-tools-alvos-'));
  process.env.ONEDRIVE_ROOT = tmpOneDrive;
  process.env.SQLITE_DIR = tmpSqlite;
  process.env.ALVOS_DIR = tmpAlvos;
  process.env.TAGS_CLIENTE_FINAL_PATH = path.join(tmpOneDrive, 'tags.json');
  fs.writeFileSync(path.join(tmpOneDrive, 'tags.json'), JSON.stringify(TAGS_FIXTURE), 'utf8');
  limparCaches();
  ({ repoMemoria } = require('../dominio/repo.cjs'));
  ({ FERRAMENTAS } = require('./tools.cjs'));
  ({ DOSSIES_DIR, UPLOADS_DIR } = require('../config.cjs'));
  dbSqlite = require('../dbSqlite.cjs');
});

afterEach(() => {
  // Fecha a conexão SQLite ANTES de apagar a pasta temp — sem isso, o
  // handle do arquivo fica aberto (Windows não deixa remover), e o próximo
  // teste que reabrisse o MESMO caminho (improvável, é um tmpdir novo por
  // teste, mas o processo do Node mantém o handle preso mesmo assim) vazava
  // entre testes. Mesmo padrão de `dbSqlite.test.ts`.
  dbSqlite._fecharParaTestes();
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  delete process.env.ALVOS_DIR;
  delete process.env.TAGS_CLIENTE_FINAL_PATH;
  limparCaches();
  fs.rmSync(tmpOneDrive, { recursive: true, force: true });
  fs.rmSync(tmpSqlite, { recursive: true, force: true });
  fs.rmSync(tmpAlvos, { recursive: true, force: true });
});

const tool = (nome: string) => {
  const f = FERRAMENTAS.find((x) => x.name === nome);
  if (!f) throw new Error(`ferramenta "${nome}" não existe`);
  return f;
};
// Retorno de `unknown` de propósito — cada ferramenta devolve um formato
// diferente (é JSON dinâmico, não um contrato único), então tipar aqui só
// empurraria o `any` pra dentro de um alias em vez de removê-lo. Os testes
// que precisam acessar campos específicos já fazem o cast localmente (ver
// `opcoes.test.ts` pro mesmo padrão).
const exec = (nome: string, repo: unknown, args?: unknown, ctx?: unknown): unknown => tool(nome).executar(repo, args, ctx);

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
  it('1. expõe exatamente as 41 ferramentas esperadas', () => {
    expect(FERRAMENTAS).toHaveLength(41);
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
    for (const f of FERRAMENTAS) expect((f.parameters as JsonSchemaObjeto).type).toBe('object');
  });

  it('6. required, quando existe, aponta pra propriedade declarada', () => {
    for (const f of FERRAMENTAS) {
      const p = f.parameters as JsonSchemaObjeto;
      for (const req of p.required ?? []) expect(Object.keys(p.properties ?? {})).toContain(req);
    }
  });

  /**
   * A intenção original ("só uma ferramenta de edição") era garantir que o
   * agente não edita Cliente/Agenda/Lembrete. Isso segue valendo pro NOME —
   * o filtro por prefixo (atualizar/editar/remover/...) continua achando só
   * dossiê e memória. A exceção deliberada (pedido do usuário — "especialista
   * de ata" que o monitorIA usa) é `redigir_ata_reuniao`/`gerar_ata_pdf`: elas
   * ATUALIZAM um evento existente, mas só os campos `ata`/`attachments`, nunca
   * date/status/monitor/clientId — ver "8b" abaixo, que testa esse limite de
   * verdade (não só o nome). E só escrevem quando `salvar`/`anexar` vem
   * explicitamente `true` (o agente só deve mandar isso após confirmação).
   */
  /**
   * A lista de ferramentas de edição é fechada de propósito: cada uma aqui
   * grava dado que o usuário vê na tela. `atualizar_evento`/`atualizar_cliente`
   * entraram por pedido explícito do usuário — antes o agente criava a reunião
   * e, ao ser pedido pra completar monitor/serviço, respondia "a edição de
   * agenda é manual no sistema", deixando o evento incompleto que ele mesmo
   * havia criado. Ampliar esta lista é decisão de produto, não detalhe de
   * implementação — por isso o teste falha ao adicionar uma nova.
   */
  it('7. a lista de ferramentas de edição é a esperada', () => {
    const edicao = FERRAMENTAS.filter((f) => /^(corrigir|atualizar|editar|remover|excluir|deletar)/.test(f.name));
    expect(edicao.map((f) => f.name).sort()).toEqual([
      'atualizar_cliente', 'atualizar_evento', 'corrigir_dossie_cliente', 'remover_memoria',
    ]);
  });

  it('7b. nenhuma ferramenta APAGA Cliente, Agenda ou Lembrete (editar sim, excluir não)', () => {
    const proibidas = FERRAMENTAS.filter((f) => /(cliente|evento|lembrete|agenda)$/.test(f.name)
      && /^(remover|excluir|deletar)/.test(f.name));
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

  it('11b. expõe o segmento (campo Local) quando cadastrado, null quando não', () => {
    const repo = repoBase({ Clientes: [clienteBase({ local: 'Autopeça' })] });
    expect(exec('buscar_clientes', repo)[0]).toMatchObject({ local: 'Autopeça' });
    expect(exec('buscar_clientes', repoBase())[0]).toMatchObject({ local: null });
  });

  it('11c. filtra por local (segmento), ignorando acento e maiúscula', () => {
    const repo = repoBase({
      Clientes: [
        clienteBase({ id: 'a', local: 'Autopeça' }),
        clienteBase({ id: 'b', local: 'Oficina' }),
        clienteBase({ id: 'c' }),
      ],
    });
    expect(exec('buscar_clientes', repo, { local: 'autopeca' })).toHaveLength(1);
    expect(exec('buscar_clientes', repo, { local: 'AUTOPEÇA' })[0]).toMatchObject({ id: 'a' });
  });

  it('11d. filtro de local é igualdade exata, não substring — "atacado" não casa com outro valor que contenha o trecho', () => {
    const repo = repoBase({ Clientes: [clienteBase({ id: 'a', local: 'Distribuidora/Atacado' })] });
    expect(exec('buscar_clientes', repo, { local: 'atacado' })).toHaveLength(0);
  });

  it('11e. local não cadastrado não casa com filtro nenhum', () => {
    const repo = repoBase({ Clientes: [clienteBase({ id: 'a' })] });
    expect(exec('buscar_clientes', repo, { local: 'Autopeça' })).toHaveLength(0);
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

  /**
   * Bug real encontrado testando o agente ao vivo: "quantos clientes ativos"
   * contava por `estado === 'Ativo'` sozinho e inflava o número — um cliente
   * com estado=Ativo mas status="Atendido pelo Marco" (fora de atendimento)
   * contava como ativo. `ativo` (calculado com a MESMA regra do resto do
   * app, isClienteAtivo) tem que refletir estado+status+pausa juntos, não
   * só o campo bruto `estado`.
   */
  it('20b. campo "ativo" combina estado+status (nunca só estado)', () => {
    const repo = repoBase({
      Clientes: [
        clienteBase({ id: 'a', estado: 'Ativo', status: 'Regular' }),
        clienteBase({ id: 'b', estado: 'Ativo', status: 'Atendido pelo Marco' }),
        clienteBase({ id: 'c', estado: 'Ativo', status: 'Suspenso' }),
      ],
    });
    const porId = new Map(exec('buscar_clientes', repo).map((c: { id: string }) => [c.id, c]));
    expect(porId.get('a')).toMatchObject({ ativo: true });
    expect(porId.get('b')).toMatchObject({ ativo: false });
    expect(porId.get('c')).toMatchObject({ ativo: false });
  });

  it('20c. expõe pausadoAte/motivoPausa e reflete no campo "ativo" durante a pausa', () => {
    const repo = repoBase({
      Clientes: [clienteBase({ id: 'a', pausadoAte: '2099-01-01', motivoPausa: 'Férias do responsável' })],
    });
    const [r] = exec('buscar_clientes', repo) as { pausadoAte: string; motivoPausa: string; ativo: boolean }[];
    expect(r).toMatchObject({ pausadoAte: '2099-01-01', motivoPausa: 'Férias do responsável', ativo: false });
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
    // Data CIVIL (AAAA-MM-DD), nunca o ISO completo — ver `dataCivilEvento`.
    expect(exec('buscar_dossie_cliente', repo, { clientId: 'c1' }).proximoEvento.date).toBe(futuro.slice(0, 10));
  });

  /**
   * Bug real de produção (03/09/2026, cliente Peça.com): o evento não tinha
   * hora marcada (`time` vazio), mas a data estava gravada como
   * "2026-09-08T12:00:00.000Z" — o meio-dia UTC que `normalizarDataEvento` usa
   * de sentinela pra data não escorregar de fuso. O agente leu o ISO, tratou
   * 12:00 como horário da reunião e respondeu ao usuário "próxima reunião às
   * 12h". Hora que ninguém marcou, afirmada com confiança.
   */
  it('29b. evento SEM hora não pode expor hora nenhuma, mesmo com ISO em 12:00 UTC (bug Peça.com)', () => {
    const dia = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10);
    const repo = repoBase({ Agenda: [
      { id: 'e1', clientId: 'c1', type: 'Reunião', date: `${dia}T12:00:00.000Z`, status: 'Pendente' },
    ] });
    const { proximoEvento } = exec('buscar_dossie_cliente', repo, { clientId: 'c1' });
    expect(proximoEvento.hora).toBeNull();
    expect(proximoEvento.date).toBe(dia); // sem "T12:00:00.000Z" de onde inferir hora
    expect(JSON.stringify(proximoEvento)).not.toContain('12:00');
  });

  it('29c. evento COM hora expõe a hora do campo time, não a do ISO', () => {
    const dia = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10);
    const repo = repoBase({ Agenda: [
      { id: 'e1', clientId: 'c1', type: 'Reunião', date: `${dia}T12:00:00.000Z`, time: '14:00', status: 'Pendente' },
    ] });
    expect(exec('buscar_dossie_cliente', repo, { clientId: 'c1' }).proximoEvento.hora).toBe('14:00');
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
    const r = exec('buscar_cobertura_contatos', repo, { clientId: 'c1' }) as { contatos: { nome: string; herdadoDoGrupo?: boolean }[] };
    expect(r.contatos.some((c) => c.nome === 'Chefe' && c.herdadoDoGrupo)).toBe(true);
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

  it('59b. histórico devolve data civil e hora só do campo time (bug da hora fantasma)', () => {
    const repo = repoBase({ Agenda: [
      { id: 'a', clientId: 'c1', type: 'Reunião', status: 'Pendente', date: '2026-09-08T12:00:00.000Z' },
      { id: 'b', clientId: 'c1', type: 'Reunião', status: 'Pendente', date: '2026-09-05T03:00:00.000Z', time: '14:00' },
    ] });
    const { eventos } = exec('buscar_historico_eventos', repo, { clientId: 'c1' });
    const semHora = eventos.find((e: { id: string }) => e.id === 'a');
    const comHora = eventos.find((e: { id: string }) => e.id === 'b');
    expect(semHora).toMatchObject({ date: '2026-09-08', time: null });
    expect(comHora).toMatchObject({ date: '2026-09-05', time: '14:00' });
    // Nenhuma hora vazando pelo ISO da data — é dela que o agente inferiu "12h".
    expect(JSON.stringify(semHora)).not.toContain('12:00');
  });

  it('60. inclui ata e resumo (o conteúdo que importa)', () => {
    const repo = repoBase({ Agenda: [{ id: 'a', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: '2026-08-01', ata: 'Ata X', resumo: 'Resumo Y' }] });
    expect(exec('buscar_historico_eventos', repo, { clientId: 'c1' }).eventos[0]).toMatchObject({ ata: 'Ata X', resumo: 'Resumo Y' });
  });

  it('60b. inclui anexos com nome legível e URL — bug real: agente dizia não ter acesso a ata/anexo quando o campo já vinha aqui', () => {
    const repo = repoBase({
      Agenda: [{
        id: 'a', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: '2026-08-01',
        attachments: [{ id: 'x1', filename: 'abc-relatorio.pdf', originalName: 'relatorio-agosto.pdf', uploadedAt: '2026-08-01T00:00:00.000Z' }],
      }],
    });
    expect(exec('buscar_historico_eventos', repo, { clientId: 'c1' }).eventos[0].anexos).toEqual([
      { nome: 'relatorio-agosto.pdf', url: '/uploads/abc-relatorio.pdf' },
    ]);
  });

  it('60c. evento sem anexo devolve lista vazia, não erro', () => {
    const repo = repoBase({ Agenda: [{ id: 'a', clientId: 'c1', type: 'Reunião', status: 'Concluído', date: '2026-08-01' }] });
    expect(exec('buscar_historico_eventos', repo, { clientId: 'c1' }).eventos[0].anexos).toEqual([]);
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
  const tarefa = (over: Record<string, unknown> = {}) => ({ id: 't1', clientId: 'c1', boardId: 'b1', colunaId: 'col1', titulo: 'Revisar preço', responsaveis: ['Erick Cardoso'], ...over });
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
    const r = exec('buscar_cobertura_servicos', repoBase()) as { servicos: { servico: string }[] };
    expect(r.servicos.map((s) => s.servico)).toEqual(['Monitoria', 'Price']);
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

  /**
   * Item 2 do levantamento de gaps: antes só existia aviso de conflito
   * PONTUAL (mesmo dia+hora exatos) — nada dava noção da carga da semana
   * antes de tentar marcar um horário. Puramente informativo, não bloqueia.
   */
  it('98b. verificar_disponibilidade também devolve a carga da semana (informativo, não bloqueia)', () => {
    // 2026-09-10 é quinta; 08 (terça) e 12 (sábado) caem na MESMA semana
    // (seg-dom); 15 (a terça seguinte) cai na semana DEPOIS.
    const repo = repoBase({
      Agenda: [
        { id: 'e1', clientId: 'c1', clientName: 'Loja A', type: 'Reunião', status: 'Agendado', date: '2026-09-08', time: '09:00', monitores: ['Erick Cardoso'] },
        { id: 'e2', clientId: 'c1', clientName: 'Loja A', type: 'Reunião', status: 'Agendado', date: '2026-09-12', time: '11:00', monitores: ['Erick Cardoso'] },
        { id: 'e3', clientId: 'c1', clientName: 'Loja A', type: 'Reunião', status: 'Agendado', date: '2026-09-15', time: '11:00', monitores: ['Erick Cardoso'] },
      ],
    });
    const r = exec('verificar_disponibilidade', repo, { date: '2026-09-10', time: '16:00', monitores: ['Erick Cardoso'] });
    expect(r.cargaSemana).toEqual([{ monitor: 'Erick Cardoso', reunioesNaSemana: 2 }]);
    expect(r.disponivel).toBe(true); // não bloqueia nada, só informa
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

describe('corrigir_dossie_cliente: sincroniza AnalisesIA.sugestaoProximaPauta', () => {
  // Bug real de produção: o dossiê (arquivo) e AnalisesIA (sheet, lida pelo
  // card de análise na ficha do cliente) são fontes SEPARADAS. Corrigir uma
  // não atualizava a outra — o usuário confirmava que a reunião concluiu, o
  // agente atualizava o dossiê, e a ficha do cliente continuava mostrando a
  // pauta antiga.
  function repoComAnalise(sugestaoProximaPauta: string) {
    return repoBase({
      AnalisesIA: [{ id: 'a1', clientId: 'c1', nivelRisco: 'baixo', resumo: '', sugestaoProximaPauta }],
    });
  }

  const DOSSIE = (pauta: string) => `### Perfil\nX\n\n### Pontos de Atenção\n— nenhum registro\n\n### Oportunidades\n— nenhum registro\n\n### Pendências\n— nenhum registro\n\n### Próxima pauta\n${pauta}`;

  it('atualiza a pauta na AnalisesIA junto com o dossiê', () => {
    const repo = repoComAnalise('pauta antiga');
    exec('corrigir_dossie_cliente', repo, { clientId: 'c1', dossie: DOSSIE('Tema encerrado, sem próxima pauta específica.') });
    expect(repo.get('AnalisesIA')[0].sugestaoProximaPauta).toBe('Tema encerrado, sem próxima pauta específica.');
  });

  it('seção vazia ("— nenhum registro") vira pauta vazia, não o texto literal do placeholder', () => {
    const repo = repoComAnalise('pauta antiga');
    exec('corrigir_dossie_cliente', repo, { clientId: 'c1', dossie: DOSSIE('— nenhum registro') });
    expect(repo.get('AnalisesIA')[0].sugestaoProximaPauta).toBe('');
  });

  it('cliente sem AnalisesIA (nunca analisado) não quebra a correção do dossiê', () => {
    const repo = repoBase({ AnalisesIA: [] });
    expect(() => exec('corrigir_dossie_cliente', repo, { clientId: 'c1', dossie: DOSSIE('nova pauta') })).not.toThrow();
  });

  /**
   * Caso real: o usuário corrigiu no dossiê o motivo de duas reuniões, o
   * agente confirmou a correção, e a FICHA do cliente continuou mostrando
   * "padrão de desalinhamento" — porque resumo/fatores/risco vêm da análise
   * automática, outro registro. O retorno agora carrega esse aviso pro
   * agente ter como avisar e oferecer a reanálise.
   */
  it('avisa que resumo/fatores/risco da ficha continuam desatualizados', () => {
    const repo = repoBase({
      AnalisesIA: [{
        id: 'a1', clientId: 'c1', nivelRisco: 'medio',
        resumo: 'histórico recente de desalinhamento', fatores: ['padrão de desalinhamento operacional'],
        sugestaoProximaPauta: 'pauta antiga',
      }],
    });
    const r = exec('corrigir_dossie_cliente', repo, { clientId: 'c1', dossie: DOSSIE('nova pauta') });
    expect(r.analiseDesatualizada).toBeTruthy();
    expect(r.analiseDesatualizada.nivelRiscoAtual).toBe('medio');
    expect(r.analiseDesatualizada.resumoAtual).toContain('desalinhamento');
    expect(r.analiseDesatualizada.comoResolver).toMatch(/reanalisar_cliente/);
  });

  it('cliente sem análise não recebe aviso de desatualizado (não há o que reanalisar)', () => {
    const repo = repoBase({ AnalisesIA: [] });
    const r = exec('corrigir_dossie_cliente', repo, { clientId: 'c1', dossie: DOSSIE('nova pauta') });
    expect(r.analiseDesatualizada).toBe(false);
  });
});

describe('redigir_ata_reuniao / gerar_ata_pdf: agente especialista de ata', () => {
  function eventoBase(over: Record<string, unknown> = {}) {
    return {
      id: 'e1', clientId: 'c1', clientName: 'Loja Teste', type: 'Reunião', status: 'Concluído',
      date: '2026-09-01T00:00:00.000Z', time: '10:00', subject: 'Reunião mensal',
      resumo: 'Falamos sobre o estoque.', ata: '', checklist: [], monitores: ['Erick Cardoso'],
      servicos: [], attachments: [], ...over,
    };
  }

  it('redigir_ata_reuniao: exige eventId', async () => {
    const repo = repoBase();
    await expect(exec('redigir_ata_reuniao', repo, {})).rejects.toThrow(/eventId/);
  });

  it('redigir_ata_reuniao: falha claro quando o evento não existe', async () => {
    const repo = repoBase({ Agenda: [eventoBase()] });
    await expect(exec('redigir_ata_reuniao', repo, { eventId: 'inexistente' })).rejects.toThrow(/não encontrado/);
  });

  it('gerar_ata_pdf: exige eventId', () => {
    const repo = repoBase();
    expect(() => exec('gerar_ata_pdf', repo, {})).toThrow(/eventId/);
  });

  it('gerar_ata_pdf: falha claro quando o evento não existe', () => {
    const repo = repoBase({ Agenda: [eventoBase()] });
    expect(() => exec('gerar_ata_pdf', repo, { eventId: 'inexistente' })).toThrow(/não encontrado/);
  });

  it('gerar_ata_pdf: gera um PDF de verdade em UPLOADS_DIR e devolve a URL, sem anexar por padrão', () => {
    const evento = eventoBase({ ata: 'ATA DE REUNIÃO — Loja Teste\n\n2. O QUE FOI TRATADO\n   Estoque revisado.' });
    const repo = repoBase({ Agenda: [evento] });
    const resultado = exec('gerar_ata_pdf', repo, { eventId: 'e1' });

    expect(resultado.anexado).toBe(false);
    expect(resultado.url).toMatch(/^\/uploads\/.+\.pdf$/);
    const arquivo = path.join(UPLOADS_DIR, resultado.url.replace('/uploads/', ''));
    const bytes = fs.readFileSync(arquivo);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    // Sem anexar=true, o evento no repo não muda em nada.
    expect(repo.get('Agenda')[0].attachments).toEqual([]);
  });

  it('gerar_ata_pdf: com anexar=true, adiciona o PDF aos attachments SEM tocar em mais nada do evento', () => {
    const evento = eventoBase();
    const repo = repoBase({ Agenda: [evento] });
    const resultado = exec('gerar_ata_pdf', repo, { eventId: 'e1', anexar: true });

    expect(resultado.anexado).toBe(true);
    const atualizado = repo.get('Agenda')[0];
    expect(atualizado.attachments).toHaveLength(1);
    expect(atualizado.attachments[0]).toMatchObject({ originalName: resultado.nomeArquivo });
    // Escopo estreito da exceção de edição (ver teste "7" acima): só
    // `attachments` muda — status/date/clientId/subject continuam os mesmos.
    expect(atualizado.status).toBe(evento.status);
    expect(atualizado.date).toBe(evento.date);
    expect(atualizado.clientId).toBe(evento.clientId);
    expect(atualizado.subject).toBe(evento.subject);
  });

  it('gerar_ata_pdf: funciona com produtosSituacao/checklist/monitores duplamente serializados (dado sujo do banco real)', () => {
    const evento = eventoBase({
      checklist: JSON.stringify([{ id: '1', text: 'Rever preços', done: true }]),
      monitores: JSON.stringify(['Erick Cardoso']),
    });
    const repo = repoBase({ Agenda: [evento] });
    expect(() => exec('gerar_ata_pdf', repo, { eventId: 'e1' })).not.toThrow();
  });
});

describe('buscar_fatos_alvos / definir_status_acompanhamento', () => {
  /**
   * Empresa pequena de teste, com o mesmo formato do arquivo real (colunas em
   * PT, mês por nome, "Receita Acumulada 11 Meses" na verdade por linha) —
   * grande o bastante para exercitar o cálculo de movimento, pequena o
   * bastante para ler em milissegundos em vez dos ~20s do arquivo real.
   */
  function criarEmpresaDeTeste(clientId: string) {
    const xlsx = require('xlsx');
    const linha = (mes: string, receita: number, qtd: number, produto = 'Kit Amortecedor') => ({
      ID_LOJA: 'loja_teste', NOME_CLIENTE: 'EDUARDO MECANICO (CM)', DESCRICAO_PRODUTO: produto,
      ANO: 2026, 'MÊS': mes, CODIGO_INTERNO_PRODUTO: '1', CODIGO_REFERENCIA_PRODUTO: 'X',
      NOME_FABRICANTE: 'FAB', 'Receita Acumulada 11 Meses': receita, QTD: qtd,
    });
    const linhas = [
      linha('Março', 1000, 10), linha('Abril', 1000, 10), linha('Maio', 1000, 10),
      linha('Julho', 1000, 10), linha('Agosto', 1000, 10),
    ];
    const { ALVOS_DIR, ALVOS_ARQUIVO } = require('../config.cjs');
    const dir = path.join(ALVOS_DIR, 'Empresa Teste');
    fs.mkdirSync(dir, { recursive: true });
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(linhas), 'Dados');
    xlsx.writeFile(wb, path.join(dir, ALVOS_ARQUIVO));

    const { vincular } = require('../alvos/mapa.cjs');
    vincular('Empresa Teste', 'loja_teste', clientId);
  }

  function repoComEventoDeReuniao() {
    return repoBase({
      Agenda: [{
        id: 'ev1', clientId: 'c1', date: '2026-06-12', status: 'Concluído',
        ata: 'Combinado reduzir margem do Kit Amortecedor.',
      }],
    });
  }

  it('clientId ausente falha explícito', () => {
    expect(() => exec('buscar_fatos_alvos', repoBase(), {})).toThrow(/clientId.*obrigatório/);
  });

  it('cliente sem vínculo não inventa número: devolve estado e motivo', () => {
    const r = exec('buscar_fatos_alvos', repoComEventoDeReuniao(), { clientId: 'c1' });
    expect(r.estado).toBe('sem_vinculo');
    expect(r.acompanhamentos).toEqual([]);
    expect(r.motivo).toMatch(/nenhuma loja/);
  });

  it('com vínculo e ata, mede o movimento desde a reunião', () => {
    criarEmpresaDeTeste('c1');
    const r = exec('buscar_fatos_alvos', repoComEventoDeReuniao(), { clientId: 'c1' });
    expect(r.estado).toBe('ok');
    expect(r.acompanhamentos).toHaveLength(1);
    expect(r.acompanhamentos[0].entidade).toBe('Kit Amortecedor');
    expect(r.acompanhamentos[0].combinadoEm).toBe('2026-06-12');
    expect(r.acompanhamentos[0].veredicto).toBe('nao_movimentou');
  });

  it('cliente inexistente falha explícito, igual às outras ferramentas', () => {
    expect(() => exec('buscar_fatos_alvos', repoBase(), { clientId: 'fantasma' })).toThrow(/não encontrado/);
  });

  it('definir_status_acompanhamento exige clientId, entidade e status', () => {
    expect(() => exec('definir_status_acompanhamento', repoBase(), { entidade: 'X', status: 'em_curso' }))
      .toThrow(/clientId.*obrigatório/);
    expect(() => exec('definir_status_acompanhamento', repoBase(), { clientId: 'c1', status: 'em_curso' }))
      .toThrow(/entidade.*obrigatório/);
  });

  it('recusa status fora do vocabulário', () => {
    criarEmpresaDeTeste('c1');
    expect(() => exec('definir_status_acompanhamento', repoBase(), {
      clientId: 'c1', entidade: 'Kit Amortecedor', status: 'meio_resolvido',
    })).toThrow(/status inválido/);
  });

  /**
   * A mesma disciplina do resolverOpcao: nome que não existe no catálogo da
   * loja não pode virar registro — geraria um acompanhamento que nenhum cálculo
   * de movimento jamais encontra.
   */
  it('recusa entidade que não existe no catálogo da loja', () => {
    criarEmpresaDeTeste('c1');
    expect(() => exec('definir_status_acompanhamento', repoBase(), {
      clientId: 'c1', entidade: 'Produto Que Não Existe', status: 'abandonado',
    })).toThrow(/não existe no catálogo/);
  });

  it('grava o status e o próximo buscar_fatos_alvos reflete a decisão', () => {
    criarEmpresaDeTeste('c1');
    const r1 = exec('definir_status_acompanhamento', repoBase(), {
      clientId: 'c1', entidade: 'Kit Amortecedor', status: 'abandonado', nota: 'sem verba este trimestre',
    });
    expect(r1.success).toBe(true);

    const r2 = exec('buscar_fatos_alvos', repoComEventoDeReuniao(), { clientId: 'c1' });
    expect(r2.acompanhamentos[0].status).toBe('abandonado');
    expect(r2.acompanhamentos[0].alerta).toBe(false);
  });

  it('buscar_resumo_vendas_alvos: clientId ausente falha explícito', () => {
    expect(() => exec('buscar_resumo_vendas_alvos', repoBase(), {})).toThrow(/clientId.*obrigatório/);
  });

  it('buscar_resumo_vendas_alvos: cliente sem vínculo devolve estado e motivo, sem inventar número', () => {
    const r = exec('buscar_resumo_vendas_alvos', repoBase(), { clientId: 'c1' });
    expect(r.estado).toBe('sem_vinculo');
    expect(r.serie).toEqual([]);
    expect(r.motivo).toMatch(/nenhuma loja/);
  });

  it('buscar_resumo_vendas_alvos: com vínculo, devolve série e totais reais do arquivo', () => {
    criarEmpresaDeTeste('c1');
    const r = exec('buscar_resumo_vendas_alvos', repoBase(), { clientId: 'c1' });
    expect(r.estado).toBe('ok');
    expect(r.totalReceita).toBe(5000);
    expect(r.totalQtd).toBe(50);
    expect(r.totalClientesDistintos).toBe(1);
    expect(r.serie).toHaveLength(5);
    expect(r.primeiroPeriodo).toBe('2026-03');
    expect(r.ultimoPeriodo).toBe('2026-08');
  });

  it('buscar_resumo_vendas_alvos: cliente inexistente falha explícito', () => {
    expect(() => exec('buscar_resumo_vendas_alvos', repoBase(), { clientId: 'fantasma' })).toThrow(/não encontrado/);
  });

  it('buscar_analise_estrategica_alvos: clientId ausente falha explícito', () => {
    expect(() => exec('buscar_analise_estrategica_alvos', repoBase(), {})).toThrow(/clientId.*obrigatório/);
  });

  it('buscar_analise_estrategica_alvos: cliente sem vínculo devolve estado e motivo, sem inventar número', () => {
    const r = exec('buscar_analise_estrategica_alvos', repoBase(), { clientId: 'c1' });
    expect(r.estado).toBe('sem_vinculo');
    expect(r).toMatchObject({ quedaPersistente: [], erosaoClientes: [], semVenda: [], poderDeCompra: [] });
  });

  it('buscar_analise_estrategica_alvos: com vínculo, roda as 4 análises e devolve o shape esperado', () => {
    criarEmpresaDeTeste('c1');
    const r = exec('buscar_analise_estrategica_alvos', repoBase(), { clientId: 'c1' });
    expect(r.estado).toBe('ok');
    expect(Array.isArray(r.quedaPersistente)).toBe(true);
    expect(Array.isArray(r.erosaoClientes)).toBe(true);
    expect(Array.isArray(r.semVenda)).toBe(true);
    expect(Array.isArray(r.poderDeCompra)).toBe(true);
  });

  it('buscar_analise_estrategica_alvos: cliente inexistente falha explícito', () => {
    expect(() => exec('buscar_analise_estrategica_alvos', repoBase(), { clientId: 'fantasma' })).toThrow(/não encontrado/);
  });

  it('buscar_fichas_clientes_finais: clientId ausente falha explícito', () => {
    expect(() => exec('buscar_fichas_clientes_finais', repoBase(), {})).toThrow(/clientId.*obrigatório/);
  });

  it('buscar_fichas_clientes_finais: cliente inexistente falha explícito', () => {
    expect(() => exec('buscar_fichas_clientes_finais', repoBase(), { clientId: 'fantasma' })).toThrow(/não encontrado/);
  });

  it('buscar_fichas_clientes_finais: sem nada registrado devolve lista vazia + as tags disponíveis', () => {
    const r = exec('buscar_fichas_clientes_finais', repoBase(), { clientId: 'c1' });
    expect(r.clientesFinais).toEqual([]);
    expect(r.tagsDisponiveis.map((t: { id: string }) => t.id)).toContain('inadimplente');
  });

  it('definir_ficha_cliente_final: exige clientId e clienteFinal, e algo pra gravar', () => {
    expect(() => exec('definir_ficha_cliente_final', repoBase(), { clienteFinal: 'X', tags: [] }))
      .toThrow(/clientId.*obrigatório/);
    expect(() => exec('definir_ficha_cliente_final', repoBase(), { clientId: 'c1', tags: [] }))
      .toThrow(/clienteFinal.*obrigatório/);
    expect(() => exec('definir_ficha_cliente_final', repoBase(), { clientId: 'c1', clienteFinal: 'X' }))
      .toThrow(/nada a gravar/);
  });

  it('definir_ficha_cliente_final: recusa tag fora do tags.json compartilhado', () => {
    criarEmpresaDeTeste('c1');
    expect(() => exec('definir_ficha_cliente_final', repoBase(), {
      clientId: 'c1', clienteFinal: 'EDUARDO MECANICO (CM)', tags: ['inventada'],
    })).toThrow(/Tag inválida/);
  });

  it('definir_ficha_cliente_final: recusa grupo fora da categoria grupo_referencia', () => {
    criarEmpresaDeTeste('c1');
    expect(() => exec('definir_ficha_cliente_final', repoBase(), {
      clientId: 'c1', clienteFinal: 'EDUARDO MECANICO (CM)', grupo: 'G9',
    })).toThrow(/grupo inválido/);
  });

  // Mesma disciplina do resolverOpcao/definir_status_acompanhamento: nome que
  // não existe no catálogo real da loja não pode virar registro.
  it('definir_ficha_cliente_final: recusa cliente final que não existe no catálogo da loja', () => {
    criarEmpresaDeTeste('c1');
    expect(() => exec('definir_ficha_cliente_final', repoBase(), {
      clientId: 'c1', clienteFinal: 'Cliente Que Não Existe', tags: ['inadimplente'],
    })).toThrow(/não existe no catálogo/);
  });

  it('definir_ficha_cliente_final: grava tags e buscar_fichas_clientes_finais reflete', () => {
    criarEmpresaDeTeste('c1');
    const r1 = exec('definir_ficha_cliente_final', repoBase(), {
      clientId: 'c1', clienteFinal: 'EDUARDO MECANICO (CM)', tags: ['inadimplente'], observacao: 'atrasou 3 boletos',
    });
    expect(r1).toMatchObject({ success: true, clienteFinal: 'EDUARDO MECANICO (CM)' });

    const r2 = exec('buscar_fichas_clientes_finais', repoBase(), { clientId: 'c1' });
    expect(r2.clientesFinais).toHaveLength(1);
    expect(r2.clientesFinais[0]).toMatchObject({ nome: 'EDUARDO MECANICO (CM)', tags: ['inadimplente'], observacao: 'atrasou 3 boletos' });
  });

  it('definir_ficha_cliente_final: mesmo nome em outro clientId não conflita (escopo por loja)', () => {
    criarEmpresaDeTeste('c1');
    exec('definir_ficha_cliente_final', repoBase(), { clientId: 'c1', clienteFinal: 'EDUARDO MECANICO (CM)', tags: ['inadimplente'] });
    // c2 não tem vínculo/catálogo — confirma só que a gravação de c1 não vazou pra outro clientId.
    const { fichasDoCliente } = require('../alvos/clientesFinais.cjs');
    expect(fichasDoCliente('c2')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Escopo por "filtro universal de monitor" (CarteiraContext.filtroMonitor)
// ---------------------------------------------------------------------------
describe('escopo por filtro de monitor (ctx.monitor)', () => {
  function repoComDoisMonitores() {
    return repoBase({
      Clientes: [
        clienteBase({ id: 'c1', empresa: 'Loja do Erick', monitor: 'Erick Cardoso' }),
        clienteBase({ id: 'c2', empresa: 'Loja do Yan', monitor: 'Yan' }),
      ],
      AnalisesIA: [
        { id: 'a1', clientId: 'c1', nivelRisco: 'alto', sugestaoProximaPauta: 'Pauta do Erick' },
        { id: 'a2', clientId: 'c2', nivelRisco: 'alto', sugestaoProximaPauta: 'Pauta do Yan' },
      ],
    });
  }

  it('buscar_clientes sem ctx.monitor (ou "Todos") devolve a carteira inteira — comportamento de hoje preservado', () => {
    const r = exec('buscar_clientes', repoComDoisMonitores(), {});
    expect(r.map((c: { empresa: string }) => c.empresa).sort()).toEqual(['Loja do Erick', 'Loja do Yan']);
  });

  it('buscar_clientes com ctx.monitor devolve só os clientes daquele monitor', () => {
    const r = exec('buscar_clientes', repoComDoisMonitores(), {}, { monitor: 'Yan' });
    expect(r).toHaveLength(1);
    expect(r[0].empresa).toBe('Loja do Yan');
  });

  it('gerar_relatorio_executivo escopado não conta análise de cliente de outro monitor', () => {
    const semEscopo = exec('gerar_relatorio_executivo', repoComDoisMonitores(), {});
    expect(semEscopo.clientesAnalisados).toBe(2);

    const doYan = exec('gerar_relatorio_executivo', repoComDoisMonitores(), {}, { monitor: 'Yan' });
    expect(doYan.clientesAnalisados).toBe(1);
    expect(doYan.clientesRiscoAlto).toEqual([{ empresa: 'Loja do Yan', sugestaoProximaPauta: 'Pauta do Yan' }]);
  });

  it('buscar_fila_priorizacao escopado só considera os clientes do monitor na aderência', () => {
    const repo = repoComDoisMonitores();
    const semEscopo = exec('buscar_fila_priorizacao', repo, {});
    const doYan = exec('buscar_fila_priorizacao', repo, {}, { monitor: 'Yan' });
    // Sem asserção de fórmula interna (já coberta em cadenciaServico.test.ts) —
    // só confirma que o universo de clientes considerado mudou de fato.
    expect(doYan.total).toBeLessThanOrEqual(semEscopo.total);
    expect(doYan.total).toBe(1);
  });

  it('ctx ausente (chamada antiga, sem 3º argumento) não quebra — equivale a sem filtro', () => {
    const r = exec('buscar_clientes', repoComDoisMonitores());
    expect(r).toHaveLength(2);
  });

  it('clientId explícito (buscar_dossie_cliente) não é bloqueado pelo escopo de monitor — só as ferramentas de carteira inteira filtram', () => {
    const repo = repoComDoisMonitores();
    escreverDossie('c2', 'loja-do-yan', '### Perfil\nCliente do Yan.');
    const r = exec('buscar_dossie_cliente', repo, { clientId: 'c2' }, { monitor: 'Erick Cardoso' });
    expect(r.empresa).toBe('Loja do Yan');
  });
});

// ---------------------------------------------------------------------------
// Busca tolerante de nome + id do evento no histórico — dois defeitos vistos
// numa conversa real de produção:
//  - "Peças.com" (plural) fez o agente afirmar que o cliente "não está
//    cadastrado na carteira"; o cadastro é "Peça.com".
//  - pedir a ata em PDF falhou porque `buscar_historico_eventos` não devolvia
//    o `id` do evento, que `gerar_ata_pdf` exige.
// ---------------------------------------------------------------------------
describe('buscar_clientes: nome tolerante a plural e pontuação', () => {
  const repoPeca = () => repoBase({ Clientes: [clienteBase({ id: 'p1', empresa: 'Peça.com' })] });

  it('acha com o nome exato', () => {
    expect(exec('buscar_clientes', repoPeca(), { nome: 'Peça.com' })).toHaveLength(1);
  });

  it('acha escrito no plural ("Peças.com")', () => {
    expect(exec('buscar_clientes', repoPeca(), { nome: 'Peças.com' })).toHaveLength(1);
  });

  it('acha sem a pontuação ("pecas com")', () => {
    expect(exec('buscar_clientes', repoPeca(), { nome: 'pecas com' })).toHaveLength(1);
  });

  it('substring exata continua tendo prioridade sobre a busca tolerante', () => {
    const repo = repoBase({
      Clientes: [
        clienteBase({ id: 'a1', empresa: 'Altese - Recreio' }),
        clienteBase({ id: 'a2', empresa: 'Altese - Barra' }),
      ],
    });
    expect(exec('buscar_clientes', repo, { nome: 'recreio' })).toHaveLength(1);
    expect(exec('buscar_clientes', repo, { nome: 'altese' })).toHaveLength(2);
  });

  it('nome que não existe continua devolvendo vazio (a tolerância não vira palpite)', () => {
    expect(exec('buscar_clientes', repoPeca(), { nome: 'Mecânica do Zé' })).toHaveLength(0);
  });
});

describe('buscar_historico_eventos: expõe o id do evento', () => {
  it('devolve `id` em cada evento (necessário pra gerar_ata_pdf)', () => {
    const repo = repoBase({
      Agenda: [{
        id: 'ev-42', clientId: 'c1', clientName: 'Loja Teste', date: '2026-08-28T00:00:00.000Z',
        type: 'Reunião', status: 'Concluído', subject: 'Análise de precificação',
        ata: 'ATA DE REUNIÃO', attachments: [], servicos: [], monitores: [],
      }],
    });
    const r = exec('buscar_historico_eventos', repo, { clientId: 'c1' });
    expect(r.eventos[0].id).toBe('ev-42');
  });
});

// ---------------------------------------------------------------------------
// Edição de evento/cliente — criadas depois de um caso real: o agente criou
// uma reunião sem monitor/serviço, sem hora, com `date` em formato diferente
// do resto da base e status "Agendado" enquanto AFIRMAVA ter criado um
// rascunho; e ao ser pedido pra completar, respondeu que "a edição de agenda
// é manual no sistema".
// ---------------------------------------------------------------------------
describe('criar_evento: status e formato de data', () => {
  const statusCadastrados = () => ({
    Categorias: [
      { id: 'k1', tipo: 'status_evento', valor: 'Agendado', ordem: 1 },
      { id: 'k2', tipo: 'status_evento', valor: 'Pendente', ordem: 2 },
    ],
  });

  it('grava `date` em ISO completo mesmo recebendo data pura (AAAA-MM-DD)', () => {
    const repo = repoBase();
    const ev = exec('criar_evento', repo, { clientId: 'c1', type: 'Reunião', date: '2026-09-08', subject: 'x' });
    expect(ev.date).toMatch(/^2026-09-08T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // O dia civil não escorrega: é o mesmo 08/09 em qualquer fuso do Brasil.
    expect(ev.date.slice(0, 10)).toBe('2026-09-08');
  });

  it('aceita `status` do cadastro em vez de fixar "Agendado"', () => {
    const repo = repoBase(statusCadastrados());
    const ev = exec('criar_evento', repo, { clientId: 'c1', type: 'Reunião', date: '2026-09-08', status: 'Pendente' });
    expect(ev.status).toBe('Pendente');
  });

  it('status inexistente ERRA com a lista válida — não grava torto nem finge sucesso', () => {
    const repo = repoBase(statusCadastrados());
    expect(() => exec('criar_evento', repo, { clientId: 'c1', type: 'Reunião', date: '2026-09-08', status: 'Rascunho' }))
      .toThrow(/Rascunho.*não existe.*Agendado, Pendente/s);
  });

  it('sem `status`, continua "Agendado" (comportamento anterior preservado)', () => {
    const ev = exec('criar_evento', repoBase(), { clientId: 'c1', type: 'Reunião', date: '2026-09-08' });
    expect(ev.status).toBe('Agendado');
  });
});

describe('atualizar_evento', () => {
  /**
   * A ferramenta LÊ pelo repo injetado e ESCREVE por `executarMutacao`, que
   * usa o repo real (`repoPlanilha`) e ignora o argumento — assimetria já
   * documentada no CLAUDE.md. Em produção os dois são o mesmo banco; no teste
   * é preciso semear os DOIS lados, senão a leitura acha e a escrita não (ou
   * o contrário).
   */
  const EVENTO = {
    id: 'ev1', clientId: 'c1', clientName: 'Loja Teste', date: '2026-09-08T12:00:00.000Z',
    time: '', duracao: undefined, type: 'Reunião', status: 'Agendado', subject: '', description: '',
    servicos: [], monitores: [], sala: '', attachments: [], checklist: [],
    createdAt: '2026-09-02T00:00:00.000Z',
  };

  const CATEGORIAS = [
    { id: 'k1', tipo: 'monitor', valor: 'Erick Cardoso', ordem: 1 },
    { id: 'k2', tipo: 'servico', valor: 'Precificação', ordem: 1 },
    { id: 'k3', tipo: 'sala', valor: 'Paris', ordem: 1 },
    { id: 'k4', tipo: 'status_evento', valor: 'Agendado', ordem: 1 },
    { id: 'k5', tipo: 'tipo_evento', valor: 'Reunião', ordem: 1 },
  ];

  /** Semeia o evento nos dois repos e devolve o repo em memória. */
  function preparar(over: Record<string, unknown> = {}) {
    const evento = { ...EVENTO, ...over };
    dbSqlite.saveSheetData('Clientes', [clienteBase()]);
    dbSqlite.saveSheetData('Agenda', [evento]);
    return repoBase({ Agenda: [evento], Categorias: CATEGORIAS });
  }

  const lista = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

  it('completa monitor e serviço de um evento já criado', () => {
    const r = exec('atualizar_evento', preparar(), {
      eventId: 'ev1', monitores: ['Erick'], servicos: ['Precificação'],
    });
    // "Erick" resolve pro nome cadastrado, igual em criar_evento.
    expect(lista(r.monitores)).toEqual(['Erick Cardoso']);
    expect(lista(r.servicos)).toEqual(['Precificação']);
  });

  it('só altera o que foi informado — o resto do evento fica intacto', () => {
    const r = exec('atualizar_evento', preparar({ subject: 'Original', sala: 'Paris' }), {
      eventId: 'ev1', time: '15:00',
    });
    expect(r.time).toBe('15:00');
    expect(r.subject).toBe('Original');
    expect(r.sala).toBe('Paris');
  });

  it('valor fora do cadastro erra com a lista válida', () => {
    expect(() => exec('atualizar_evento', preparar(), { eventId: 'ev1', monitores: ['Fulano'] }))
      .toThrow(/Fulano.*não existe/s);
  });

  it('evento inexistente erra explicitamente', () => {
    expect(() => exec('atualizar_evento', preparar(), { eventId: 'nada', time: '10:00' }))
      .toThrow(/"nada" não encontrado/);
  });

  it('sem nenhum campo pra mudar, erra em vez de gravar patch vazio', () => {
    expect(() => exec('atualizar_evento', preparar(), { eventId: 'ev1' }))
      .toThrow(/nenhum campo pra alterar/);
  });

  it('não conflita consigo mesmo ao mudar só a sala', () => {
    const r = exec('atualizar_evento', preparar({ time: '15:00', monitores: ['Erick Cardoso'] }), {
      eventId: 'ev1', sala: 'Paris',
    });
    expect(r.sala).toBe('Paris');
  });

  it('conflito de sala com OUTRO evento no mesmo horário continua sendo barrado', () => {
    const outro = {
      ...EVENTO, id: 'ev2', clientName: 'Outra Loja', time: '15:00', sala: 'Paris', monitores: [],
    };
    dbSqlite.saveSheetData('Clientes', [clienteBase()]);
    dbSqlite.saveSheetData('Agenda', [{ ...EVENTO, time: '15:00' }, outro]);
    const repo = repoBase({ Agenda: [{ ...EVENTO, time: '15:00' }, outro], Categorias: CATEGORIAS });
    expect(() => exec('atualizar_evento', repo, { eventId: 'ev1', sala: 'Paris' }))
      .toThrow(/sala "Paris" já está ocupada/);
  });
});

describe('atualizar_cliente', () => {
  const CATEGORIAS = [
    { id: 'k1', tipo: 'monitor', valor: 'Erick Cardoso', ordem: 1 },
    { id: 'k2', tipo: 'status_cliente', valor: 'Suspenso', ordem: 1 },
    { id: 'k3', tipo: 'linha_cliente', valor: 'Pesada', ordem: 1 },
  ];

  /** Mesmo motivo do bloco acima: semeia nos dois repos. */
  function preparar() {
    dbSqlite.saveSheetData('Clientes', [clienteBase()]);
    return repoBase({ Categorias: CATEGORIAS });
  }

  it('altera status e linha resolvendo contra o cadastro', () => {
    const r = exec('atualizar_cliente', preparar(), { clientId: 'c1', status: 'Suspenso', linha: 'Pesada' });
    expect(r.status).toBe('Suspenso');
    expect(r.linha).toBe('Pesada');
  });

  it('estado aceita só Ativo/Inativo', () => {
    expect(exec('atualizar_cliente', preparar(), { clientId: 'c1', estado: 'inativo' }).estado).toBe('Inativo');
    expect(() => exec('atualizar_cliente', preparar(), { clientId: 'c1', estado: 'Pausado' }))
      .toThrow(/estado "Pausado" inválido/);
  });

  it('cliente inexistente erra explicitamente', () => {
    expect(() => exec('atualizar_cliente', preparar(), { clientId: 'zzz', status: 'Suspenso' }))
      .toThrow(/"zzz" não encontrado/);
  });

  it('sem nenhum campo pra mudar, erra em vez de gravar patch vazio', () => {
    expect(() => exec('atualizar_cliente', preparar(), { clientId: 'c1' })).toThrow(/nenhum campo pra alterar/);
  });

  describe('pausadoAte — pausa temporária (item 5 do levantamento de gaps)', () => {
    it('grava pausadoAte + motivoPausa juntos', () => {
      const r = exec('atualizar_cliente', preparar(), {
        clientId: 'c1', pausadoAte: '2026-09-20', motivoPausa: 'Obra fechada',
      }) as { pausadoAte: string; motivoPausa: string };
      expect(r.pausadoAte).toBe('2026-09-20');
      expect(r.motivoPausa).toBe('Obra fechada');
    });

    it('pausadoAte: null limpa os dois campos (retomada antecipada)', () => {
      const r = exec('atualizar_cliente', preparar(), { clientId: 'c1', pausadoAte: null }) as { pausadoAte: string; motivoPausa: string };
      expect(r.pausadoAte).toBe('');
      expect(r.motivoPausa).toBe('');
    });

    it('formato de data inválido erra explícito', () => {
      expect(() => exec('atualizar_cliente', preparar(), { clientId: 'c1', pausadoAte: '20/09/2026' }))
        .toThrow(/formato AAAA-MM-DD/);
    });
  });
});

describe('registrar_acao', () => {
  const CATEGORIAS = [
    { id: 'k1', tipo: 'monitor', valor: 'Erick Cardoso', ordem: 1 },
    { id: 'k2', tipo: 'servico', valor: 'Precificação', ordem: 1 },
  ];

  /** Mesmo motivo dos blocos de escrita acima: executarMutacao usa o repo
   *  REAL (repoPlanilha), então precisa semear os dois lados. */
  function preparar() {
    dbSqlite.saveSheetData('Clientes', [clienteBase()]);
    dbSqlite.saveSheetData('Agenda', []);
    dbSqlite.saveSheetData('Acoes', []);
    return repoBase({ Categorias: CATEGORIAS });
  }

  it('exige clientId e tipo', () => {
    expect(() => exec('registrar_acao', preparar(), { tipo: 'contato' })).toThrow(/clientId.*obrigat/i);
    expect(() => exec('registrar_acao', preparar(), { clientId: 'c1', tipo: 'invalido' })).toThrow(/contato, reuniao, relatorio ou price/);
  });

  it('data de hoje + resultado "sucesso" grava status concluido', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const r = exec('registrar_acao', preparar(), { clientId: 'c1', tipo: 'contato', data: hoje, resultado: 'sucesso' }) as { status: string };
    expect(r.status).toBe('concluido');
  });

  /**
   * Bug real corrigido (item 3 do levantamento de gaps): antes só existia
   * 'concluido', e qualquer 'concluido' zera o relógio de cadência — uma
   * tentativa sem sucesso registrada como "concluído" fazia o sistema achar
   * que o cliente tinha sido atendido de verdade.
   */
  it('data de hoje + resultado "sem_sucesso" grava status sem_sucesso, não concluido', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const r = exec('registrar_acao', preparar(), { clientId: 'c1', tipo: 'contato', data: hoje, resultado: 'sem_sucesso' }) as { status: string };
    expect(r.status).toBe('sem_sucesso');
  });

  it('data futura vira "programado", ignorando "resultado"', () => {
    const r = exec('registrar_acao', preparar(), { clientId: 'c1', tipo: 'reuniao', data: '2099-01-01' }) as { status: string };
    expect(r.status).toBe('programado');
  });

  it('sem "resultado" e data de hoje, assume sucesso (concluido)', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const r = exec('registrar_acao', preparar(), { clientId: 'c1', tipo: 'contato', data: hoje }) as { status: string };
    expect(r.status).toBe('concluido');
  });

  it('cliente inexistente erra explicitamente', () => {
    expect(() => exec('registrar_acao', preparar(), { clientId: 'zzz', tipo: 'contato' })).toThrow(/"zzz" não encontrado/);
  });

  it('serviço fora do cadastro erra com a lista válida', () => {
    expect(() => exec('registrar_acao', preparar(), { clientId: 'c1', tipo: 'contato', servico: 'Fulano' })).toThrow(/não existe/);
  });
});

describe('buscar_historico_risco_cliente', () => {
  it('exige clientId', () => {
    expect(() => exec('buscar_historico_risco_cliente', repoBase(), {})).toThrow(/obrigat/i);
  });

  it('combina histórico arquivado + análise atual, mais antiga primeiro', () => {
    const repo = repoBase({
      Clientes: [clienteBase()],
      AnalisesIAHistorico: [
        { id: 'h1', clientId: 'c1', nivelRisco: 'baixo', resumo: 'Início tranquilo.', geradoEm: '2026-06-01T00:00:00.000Z' },
        { id: 'h2', clientId: 'c1', nivelRisco: 'medio', resumo: 'Começou a esfriar.', geradoEm: '2026-07-01T00:00:00.000Z' },
      ],
      AnalisesIA: [{ id: 'a1', clientId: 'c1', nivelRisco: 'alto', resumo: 'Piorou de vez.', geradoEm: '2026-08-01T00:00:00.000Z' }],
    });
    const r = exec('buscar_historico_risco_cliente', repo, { clientId: 'c1' }) as { historico: { nivelRisco: string }[] };
    expect(r.historico.map((h) => h.nivelRisco)).toEqual(['baixo', 'medio', 'alto']);
  });

  it('cliente sem nenhuma análise devolve histórico vazio, não erro', () => {
    const repo = repoBase({ Clientes: [clienteBase()], AnalisesIAHistorico: [], AnalisesIA: [] });
    const r = exec('buscar_historico_risco_cliente', repo, { clientId: 'c1' }) as { historico: unknown[] };
    expect(r.historico).toEqual([]);
  });

  it('cliente inexistente erra explicitamente', () => {
    expect(() => exec('buscar_historico_risco_cliente', repoBase(), { clientId: 'zzz' })).toThrow(/não encontrado/);
  });
});

describe('explicar_conceito_carteira', () => {
  function llmFake(resposta: unknown) {
    const chamadas: string[] = [];
    return { fn: { gerarJSON: async (prompt: string) => { chamadas.push(prompt); return resposta; } }, chamadas };
  }

  it('conceito inválido erra com a lista de chaves válidas', async () => {
    const { fn } = llmFake({ explicacao: 'x' });
    await expect(
      tool('explicar_conceito_carteira').executar(repoBase(), { conceito: 'inventado', pergunta: 'oi' }, {}, fn)
    ).rejects.toThrow(/cliente_ativo/);
  });

  it('sem "pergunta" erra explicitamente', async () => {
    const { fn } = llmFake({ explicacao: 'x' });
    await expect(
      tool('explicar_conceito_carteira').executar(repoBase(), { conceito: 'cliente_ativo' }, {}, fn)
    ).rejects.toThrow(/pergunta/);
  });

  it('devolve a explicação do modelo e passa o dado real (não inventado) no prompt', async () => {
    const repo = repoBase({
      Clientes: [
        clienteBase({ id: 'c1' }),
        clienteBase({ id: 'c2', estado: 'Ativo', status: 'Atendido pelo Marco' }),
      ],
    });
    const { fn, chamadas } = llmFake({ explicacao: '**2 clientes**, 1 ativo e 1 inativo.' });
    const r = await tool('explicar_conceito_carteira').executar(
      repo, { conceito: 'cliente_ativo', pergunta: 'o que é cliente ativo?' }, {}, fn
    ) as { explicacao: string };
    expect(r.explicacao).toBe('**2 clientes**, 1 ativo e 1 inativo.');
    expect(chamadas[0]).toContain('"totalClientes": 2');
    expect(chamadas[0]).toContain('"ativos": 1');
    expect(chamadas[0]).toContain('o que é cliente ativo?');
  });

  it('grava o uso com origem "conceito"', async () => {
    const repo = repoBase();
    const { fn } = llmFake({ explicacao: 'x' });
    await tool('explicar_conceito_carteira').executar(repo, { conceito: 'cadencia', pergunta: 'como funciona cadência?' }, {}, fn);
    const uso = repo.get('UsoIA') as { origem: string; pergunta: string }[];
    expect(uso).toHaveLength(1);
    expect(uso[0]).toMatchObject({ origem: 'conceito', pergunta: 'conceito — cadencia' });
  });
});

describe('buscar_proximas_reunioes', () => {
  function amanha() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  function ontem() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  it('devolve eventos futuros do cliente, excluindo concluído/cancelado', () => {
    const repo = repoBase({
      Agenda: [
        { id: 'e1', clientId: 'c1', clientName: 'Loja Teste', type: 'Reunião', date: amanha(), status: 'Agendado', monitores: [] },
        { id: 'e2', clientId: 'c1', clientName: 'Loja Teste', type: 'Reunião', date: amanha(), status: 'Concluído', monitores: [] },
        { id: 'e3', clientId: 'c1', clientName: 'Loja Teste', type: 'Reunião', date: amanha(), status: 'Cancelado', monitores: [] },
      ],
    });
    const r = exec('buscar_proximas_reunioes', repo, {}) as { total: number; eventos: { clientId: string; status: string }[] };
    expect(r.total).toBe(1);
    expect(r.eventos[0].status).toBe('Agendado');
  });

  it('não devolve evento no passado', () => {
    const repo = repoBase({
      Agenda: [{ id: 'e1', clientId: 'c1', clientName: 'Loja Teste', type: 'Reunião', date: ontem(), status: 'Agendado', monitores: [] }],
    });
    const r = exec('buscar_proximas_reunioes', repo, {}) as { total: number };
    expect(r.total).toBe(0);
  });

  it('respeita janela de dias (padrão 14) e escopo por monitor (ctx)', () => {
    const repo = repoBase({
      Clientes: [
        clienteBase({ id: 'c1', empresa: 'Loja do Erick', monitor: 'Erick Cardoso' }),
        clienteBase({ id: 'c2', empresa: 'Loja do Yan', monitor: 'Yan' }),
      ],
      Agenda: [
        { id: 'e1', clientId: 'c1', clientName: 'Loja do Erick', type: 'Reunião', date: amanha(), status: 'Agendado', monitores: [] },
        { id: 'e2', clientId: 'c2', clientName: 'Loja do Yan', type: 'Reunião', date: amanha(), status: 'Agendado', monitores: [] },
      ],
    });
    const doErick = exec('buscar_proximas_reunioes', repo, {}, { monitor: 'Erick Cardoso' }) as { eventos: { empresa: string }[] };
    expect(doErick.eventos.map((e) => e.empresa)).toEqual(['Loja do Erick']);
  });

  it('data devolvida é só a parte civil (sem hora fantasma) — hora vem separada em "time"', () => {
    const repo = repoBase({
      Agenda: [{ id: 'e1', clientId: 'c1', clientName: 'Loja Teste', type: 'Reunião', date: `${amanha()}T12:00:00.000Z`, time: '', status: 'Agendado', monitores: [] }],
    });
    const r = exec('buscar_proximas_reunioes', repo, {}) as { eventos: { date: string; time: string | null }[] };
    expect(r.eventos[0].date).toBe(amanha());
    expect(r.eventos[0].time).toBeNull();
  });
});
