import { createRequire } from 'module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * Tudo sobre repo em memória e pastas temporárias; o `require` do script puxa
 * `config.cjs`, então ONEDRIVE_ROOT e SQLITE_DIR ficam isolados mesmo assim
 * (mesmo padrão de `server/routes/alvos.test.ts`).
 */
const MODULOS = [
  '../config.cjs', '../modo.cjs', '../dbSqlite.cjs', '../db.cjs', '../dominio/repo.cjs',
  '../dominio/clientes.cjs', '../dominio/produtosHistorico.cjs', '../dominio/statusHistorico.cjs',
  '../relatoriosAutomaticos.cjs', './migrarProdutos.cjs',
];

let oneDriveDir: string;
let sqliteDir: string;
let maquinasDir: string;

function limparCaches() {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
}

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-migrar-od-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-migrar-sq-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  limparCaches();
  maquinasDir = path.join(oneDriveDir, 'dados', 'maquinas');
  fs.mkdirSync(maquinasDir, { recursive: true });
});

afterEach(() => {
  try { require('../dbSqlite.cjs')._fecharParaTestes(); } catch { /* não aberta */ }
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

const AGORA = '2026-10-31T12:00:00.000Z';
const CRIADO = '2026-05-25T12:00:00.000Z';

const logMaquina = (nome: string, ...versoes: string[]) => fs.writeFileSync(
  path.join(maquinasDir, `${nome}.log`),
  versoes.map((v) => `2026-10-01T10:00:00.000Z\t${v}\tclient\n`).join(''),
);

const cli = (id: string, extra: Record<string, unknown> = {}) => ({
  id, empresa: id, estado: 'Ativo', status: 'Regular', createdAt: CRIADO, ...extra,
});

const categorias = () => [
  { id: 'c1', tipo: 'servico', valor: 'Precificação', ordem: 0 },
  { id: 'c2', tipo: 'servico', valor: 'Monitoria', ordem: 1 },
  { id: 'c3', tipo: 'servico', valor: '2D Nexus', ordem: 2 },
  { id: 'c4', tipo: 'status_evento', valor: 'Monitoria', ordem: 0 },
];

function montar(sheets: Record<string, unknown[]> = {}) {
  const { repoMemoria } = require('../dominio/repo.cjs');
  return repoMemoria({ Categorias: categorias(), Clientes: [], Agenda: [], AgendaSeries: [], Acoes: [], Cadencias: [], ProdutosHistorico: [], ...sheets });
}

const migrar = (repo: unknown, opts: Record<string, unknown> = {}) => require('./migrarProdutos.cjs').migrar(repo, {
  aplicar: true, agora: AGORA, maquinasDir, backup: async () => '', ...opts,
});

describe('migrarProdutos: trava de versão', () => {
  const clientes = [cli('a', { servicos: ['Monitoria'] })];

  it('com máquina na 1.6, aplicar recusa sem gravar', async () => {
    logMaquina('Bruno2D', '1.6.17');
    const repo = montar({ Clientes: clientes });
    const antes = JSON.stringify(repo._dump());
    const r = await migrar(repo);
    expect(r.gravado).toBe(false);
    expect(r.recusa).toMatch(/Bruno2D/);
    expect(JSON.stringify(repo._dump())).toBe(antes);
  });

  it('vale a ÚLTIMA linha do log', async () => {
    logMaquina('Bruno2D', '1.6.17', '1.7.0');
    logMaquina('Monitor-2D', '1.7.0', '1.6.17');
    const r = await migrar(montar({ Clientes: clientes }));
    expect(r.maquinasAtrasadas).toEqual([{ maquina: 'Monitor-2D', versao: '1.6.17' }]);
  });

  it('segue quando a máquina é nomeada em ignorarMaquinas', async () => {
    logMaquina('Bruno2D', '1.6.17');
    const r = await migrar(montar({ Clientes: clientes }), { ignorarMaquinas: ['Bruno2D'] });
    expect(r.gravado).toBe(true);
  });

  it('nome diferente do log não libera', async () => {
    logMaquina('Bruno2D', '1.6.17');
    const r = await migrar(montar({ Clientes: clientes }), { ignorarMaquinas: ['bruno2d', 'Bruno'] });
    expect(r.gravado).toBe(false);
  });

  it('1.10 não conta como abaixo de 1.7', async () => {
    logMaquina('A', '1.10.0');
    logMaquina('B', '2.0.0');
    const r = await migrar(montar({ Clientes: clientes }));
    expect(r.maquinasAtrasadas).toEqual([]);
  });
});

describe('migrarProdutos: simulação', () => {
  it('não altera o repo nem faz a cópia, e devolve o mesmo relatório', async () => {
    const repo = montar({
      Clientes: [cli('a', { servicos: ['Monitoria', 'Precificação', '2D Nexus'] })],
      Agenda: [{ id: 'e1', clientId: 'a', servicos: '["Monitoria"]', status: 'Agendado', date: '2026-11-10' }],
    });
    const antes = JSON.stringify(repo._dump());
    let copiou = false;
    const r = await migrar(repo, { aplicar: false, backup: async () => { copiou = true; } });
    expect(JSON.stringify(repo._dump())).toBe(antes);
    expect(copiou).toBe(false);
    expect(r.gravado).toBe(false);
    expect(r.recusa).toBeNull();
    expect(r.clientes.porFase).toEqual({ Ativo: 2, 'Em breve': 1 });
    expect(r.textoCorrigido.eventos).toBe(1);
  });
});

describe('migrarProdutos: aplicar', () => {
  it('gera os produtos: Nexus/Alcance Em breve, demais Ativo, com link, login e senha', async () => {
    const repo = montar({
      Clientes: [cli('a', {
        servicos: ['Monitoria', 'Precificação', '2D Nexus'],
        servicosIndependentes: ['Monitoria'],
        linksServicos: { Monitoria: 'http://l' },
        loginPrice: 'x',
        senhaPriceCifrada: 's',
      })],
    });
    const r = await migrar(repo);
    expect(r.gravado).toBe(true);
    const [c] = repo.get('Clientes');
    expect(c.produtos.map((p: { produto: string; fase: string }) => [p.produto, p.fase])).toEqual([
      ['Plataforma 2D', 'Ativo'], ['2D Price', 'Ativo'], ['2D Nexus', 'Em breve'],
    ]);
    const motivos = new Set(c.produtos.map((p: { motivoFase: string }) => p.motivoFase));
    expect([...motivos]).toEqual(['migração para produtos (1.7)']);
    // Trocar para Em breve não pode carimbar "agora": a data é a do cadastro.
    expect(c.produtos.map((p: { faseDesde: string }) => p.faseDesde)).toEqual([CRIADO, CRIADO, CRIADO]);
    expect(c.produtos[0]).toMatchObject({ independente: true, link: 'http://l' });
    expect(c.produtos[1]).toMatchObject({ login: 'x', senhaCifrada: 's' });
    expect(c.servicos).toEqual(['Plataforma 2D', '2D Price']);
    expect(c.linksServicos).toEqual({ 'Plataforma 2D': 'http://l' });
    expect(r.relogios.divergencias).toEqual([]);
    expect(r.relogios.comparados).toBe(1);
  });

  it('renomeia e ordena só a categoria servico, sem duplicar', async () => {
    const repo = montar({ Categorias: [...categorias(), { id: 'c5', tipo: 'servico', valor: 'Plataforma 2D', ordem: 3 }, { id: 'c6', tipo: 'servico', valor: 'Outro', ordem: 4 }] });
    await migrar(repo);
    const cats = repo.get('Categorias');
    const servico = cats.filter((c: { tipo: string }) => c.tipo === 'servico').sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem);
    expect(servico.map((c: { valor: string }) => c.valor)).toEqual(['Plataforma 2D', '2D Nexus', '2D Price', 'Outro']);
    expect(cats.find((c: { id: string }) => c.id === 'c4').valor).toBe('Monitoria');
  });

  it('corrige texto e renomeia evento, série, contato e chave de link', async () => {
    const repo = montar({
      Clientes: [cli('a', {
        servicos: '["Monitoria"]',
        contatos: [{ id: 'k', nome: 'Ana', servicos: ['Precificação'] }, { id: 'j', nome: 'Beto' }],
        linksServicos: { Precificação: 'http://p' },
      })],
      Agenda: [
        { id: 'e1', clientId: 'a', servicos: '["Monitoria"]', status: 'Agendado', date: '2026-11-10' },
        { id: 'e2', clientId: 'a', servicos: ['Monitoria', 'Plataforma 2D'], status: 'Agendado', date: '2026-11-11' },
        { id: 'e3', clientId: 'a', status: 'Agendado', date: '2026-11-12' },
      ],
      AgendaSeries: [{ id: 's1', clientId: 'a', servicos: ['Precificação'] }],
    });
    const r = await migrar(repo);
    const eventos = repo.get('Agenda');
    expect(eventos[0].servicos).toEqual(['Plataforma 2D']);
    expect(eventos[1].servicos).toEqual(['Plataforma 2D']);
    expect(eventos[2].servicos).toBeUndefined();
    expect(repo.get('AgendaSeries')[0].servicos).toEqual(['2D Price']);
    const [c] = repo.get('Clientes');
    expect(c.servicos).toEqual(['Plataforma 2D']);
    expect(c.contatos[0].servicos).toEqual(['2D Price']);
    expect(c.contatos[1].servicos).toBeUndefined();
    expect(c.linksServicos).toEqual({ '2D Price': 'http://p' });
    expect(r.textoCorrigido).toEqual({ clientes: 1, eventos: 1 });
  });

  it('produto do registro DW parte de 30/10; o resto segue do cadastro e o relógio novo é permitido', async () => {
    const repo = montar({ Clientes: [cli('a', { servicos: ['Monitoria', 'Precificação'] })] });
    const r = await migrar(repo, { registroDw: { clientes: [{ id: 'a', entra: ['Precificação'] }] } });
    expect(r.gravado).toBe(true);
    const [c] = repo.get('Clientes');
    expect(c.produtos[0].faseDesde).toBe(CRIADO);
    expect(c.produtos[1].faseDesde).toBe('2026-10-30');
    expect(r.relogios.divergencias).toEqual([]);
    expect(r.relogios.permitidas).toHaveLength(1);
    expect(r.relogios.permitidas[0]).toMatchObject({ clientId: 'a', servico: '2D Price' });
    expect(r.relogios.permitidas[0].depois).toMatch(/^em_dia/);
  });

  it('registro DW sem a lista clientes recusa sem gravar (formato inesperado)', async () => {
    const repo = montar({ Clientes: [cli('a', { servicos: ['Monitoria'] })] });
    const antes = JSON.stringify(repo._dump());
    const r = await migrar(repo, { registroDw: [{ id: 'a', entra: ['Precificação'] }] });
    expect(r.gravado).toBe(false);
    expect(r.recusa).toMatch(/registro/i);
    expect(JSON.stringify(repo._dump())).toBe(antes);
  });

  it('cliente editado antes da migração: refaz o item MOTIVO_LEGADO e mantém decisão real', async () => {
    const { MOTIVO_LEGADO } = require('../dominio/clientes.cjs');
    const repo = montar({
      Clientes: [cli('a', {
        servicos: ['Monitoria', '2D Nexus', 'Precificação', 'Apura'],
        produtos: [
          { produto: 'Monitoria', fase: 'Ativo', faseDesde: CRIADO, motivoFase: MOTIVO_LEGADO, link: 'http://l' },
          { produto: '2D Nexus', fase: 'Ativo', faseDesde: CRIADO, motivoFase: MOTIVO_LEGADO },
          { produto: 'Precificação', fase: 'Ativo', faseDesde: CRIADO, motivoFase: MOTIVO_LEGADO },
          { produto: 'Apura', fase: 'Suspenso', faseDesde: '2026-10-20', motivoFase: 'pediu pausa' },
        ],
      })],
      ProdutosHistorico: [
        { id: 'h1', clientId: 'a', produto: '2D Price', fase: 'Ativo', motivo: MOTIVO_LEGADO, mudouEm: CRIADO, gravadoEm: AGORA },
        { id: 'h2', clientId: 'a', produto: 'Apura', fase: 'Ativo', motivo: MOTIVO_LEGADO, mudouEm: CRIADO, gravadoEm: AGORA },
        { id: 'h3', clientId: 'a', produto: 'Apura', fase: 'Suspenso', motivo: 'pediu pausa', mudouEm: '2026-10-20', gravadoEm: AGORA },
      ],
    });
    const r = await migrar(repo, { registroDw: { clientes: [{ id: 'a', entra: ['Precificação'] }] } });
    expect(r.gravado).toBe(true);
    const [c] = repo.get('Clientes');
    const por = (n: string) => c.produtos.find((p: { produto: string }) => p.produto === n);
    expect(por('Plataforma 2D')).toMatchObject({ fase: 'Ativo', motivoFase: 'migração para produtos (1.7)', link: 'http://l', faseDesde: CRIADO });
    expect(por('2D Nexus')).toMatchObject({ fase: 'Em breve', motivoFase: 'migração para produtos (1.7)', faseDesde: CRIADO });
    expect(por('2D Price')).toMatchObject({ fase: 'Ativo', faseDesde: '2026-10-30' });
    expect(por('Apura')).toMatchObject({ fase: 'Suspenso', motivoFase: 'pediu pausa', faseDesde: '2026-10-20' });
    // A linha-base suposta do Price saiu: mês passado não pode mostrar Price
    // antes de 30/10. A da Apura é história real (a suspensão veio depois).
    const hist = repo.get('ProdutosHistorico');
    const price = hist.filter((h: { produto: string }) => h.produto === '2D Price');
    expect(price).toHaveLength(1);
    expect(price[0].mudouEm).toBe('2026-10-30');
    expect(hist.filter((h: { produto: string }) => h.produto === 'Apura').map((h: { id: string }) => h.id)).toEqual(['h2', 'h3']);
  });

  it('grava a linha-base de cada cliente+produto e é idempotente', async () => {
    const repo = montar({ Clientes: [cli('a', { servicos: ['Monitoria', '2D Nexus'] }), cli('b', { servicos: [] })] });
    const r1 = await migrar(repo);
    expect(r1.historico).toBe(2);
    const estado = JSON.stringify(repo.get('Clientes'));
    const r2 = await migrar(repo);
    expect(r2.gravado).toBe(true);
    expect(r2.historico).toBe(0);
    expect(r2.relogios.divergencias).toEqual([]);
    expect(JSON.stringify(repo.get('Clientes'))).toBe(estado);
    expect(repo.get('ProdutosHistorico').map((h: { produto: string; fase: string; motivo: string; mudouEm: string }) => [h.produto, h.fase, h.motivo, h.mudouEm])).toEqual([
      ['Plataforma 2D', 'Ativo', 'migração para produtos (1.7)', CRIADO],
      ['2D Nexus', 'Em breve', 'migração para produtos (1.7)', CRIADO],
    ]);
  });

  it('relógio que diverge fora da regra aborta sem gravar, inclusive de cliente hoje inativo', async () => {
    // Flag legada sem `servicos`: hoje tem relógio; o `monitoria` derivado o tiraria.
    const repo = montar({ Clientes: [cli('a', { servicos: [], monitoria: true, estado: 'Inativo' })] });
    const antes = JSON.stringify(repo._dump());
    let copiou = false;
    const r = await migrar(repo, { backup: async () => { copiou = true; } });
    expect(r.gravado).toBe(false);
    expect(r.recusa).toMatch(/relógio/i);
    expect(r.relogios.divergencias).toHaveLength(1);
    expect(r.relogios.divergencias[0]).toMatchObject({ clientId: 'a', servico: 'Plataforma 2D', depois: null });
    expect(copiou).toBe(false);
    expect(JSON.stringify(repo._dump())).toBe(antes);
  });

  it('o registro DW só libera o relógio do produto que entrou', async () => {
    const repo = montar({ Clientes: [cli('a', { servicos: ['Precificação'], monitoria: true })] });
    const r = await migrar(repo, { registroDw: { clientes: [{ id: 'a', entra: ['Precificação'] }] } });
    expect(r.gravado).toBe(false);
    expect(r.relogios.divergencias.map((d: { servico: string }) => d.servico)).toEqual(['Plataforma 2D']);
  });

  it('faz a cópia antes de qualquer escrita; se ela falha, nada é gravado', async () => {
    const repo = montar({ Clientes: [cli('a', { servicos: ['Monitoria'] })] });
    const antes = JSON.stringify(repo._dump());
    let durante = '';
    await migrar(repo, { backup: async () => { durante = JSON.stringify(repo._dump()); } });
    expect(durante).toBe(antes);

    const repo2 = montar({ Clientes: [cli('a', { servicos: ['Monitoria'] })] });
    const antes2 = JSON.stringify(repo2._dump());
    await expect(migrar(repo2, { backup: async () => { throw new Error('disco cheio'); } })).rejects.toThrow('disco cheio');
    expect(JSON.stringify(repo2._dump())).toBe(antes2);
  });
});

describe('migrarProdutos: SQLite de verdade (pasta temporária)', () => {
  it('copia o banco sem sobrescrever a cópia anterior e grava pelo repo real', async () => {
    const { repoPlanilha } = require('../dominio/repo.cjs');
    const { initDbSqlite } = require('../dbSqlite.cjs');
    const { copiarBanco } = require('./migrarProdutos.cjs');
    initDbSqlite();
    const repo = repoPlanilha();
    repo.save('Categorias', categorias());
    repo.save('Clientes', [cli('a', { servicos: '["Monitoria","Precificação"]' })]);
    repo.save('Agenda', [{ id: 'e1', clientId: 'a', servicos: '["Monitoria"]', status: 'Agendado', date: '2026-11-10' }]);

    const r = await migrar(repo, { backup: () => copiarBanco(new Date(AGORA)) });
    expect(r.gravado).toBe(true);
    const [c] = repo.get('Clientes');
    expect(c.servicos).toEqual(['Plataforma 2D', '2D Price']);
    expect(c.produtos).toHaveLength(2);
    expect(repo.get('Agenda')[0].servicos).toEqual(['Plataforma 2D']);
    expect(repo.get('ProdutosHistorico')).toHaveLength(2);

    const pasta = path.join(oneDriveDir, 'dados', 'migracoes');
    expect(r.copia).toBe(path.join(pasta, '2026-10-31-produtos-1.7.antes.sqlite'));
    const copia = new (require('better-sqlite3'))(r.copia, { readonly: true });
    const linha = copia.prepare('SELECT servicos FROM Clientes').get();
    copia.close();
    expect(linha.servicos).toContain('Monitoria'); // é o "antes"

    const segunda = await copiarBanco(new Date(AGORA));
    expect(segunda).not.toBe(r.copia);
    expect(fs.readdirSync(pasta).filter((f) => f.endsWith('.sqlite'))).toHaveLength(2);
  });
});

// ---- Bordas (testador): cada caso cobre uma promessa do plano/spec que os
// testes acima não exercitam com dado real.

const AGORA_D = new Date(AGORA);
const diasAntes = (n: number) => new Date(AGORA_D.getTime() - n * 86400000).toISOString();
const diasDepois = (n: number) => new Date(AGORA_D.getTime() + n * 86400000).toISOString();

describe('migrarProdutos: critério de sucesso (relógios idênticos)', () => {
  /** Calculado à parte do `compararRelogios` do script: é ele que está sob teste. */
  function fila(repo: { get: (s: string) => unknown[] }) {
    const { buildFilaCadencia } = require('../../shared/cadenciaServico.cjs');
    const cad = Object.fromEntries((repo.get('Cadencias') as { chave: string; valor: unknown }[]).map((r) => [r.chave, Number(r.valor)]));
    return buildFilaCadencia(repo.get('Clientes'), repo.get('Agenda'), repo.get('Acoes'), cad, AGORA_D)
      .map((f: { cliente: { id: string }; relogios: unknown }) => ({ id: f.cliente.id, relogios: f.relogios }));
  }

  it('carteira variada: fila inteira igual antes e depois, sem nenhuma exceção', async () => {
    const reuniao = (id: string, clientId: string, servicos: unknown, status: string, date: string) => ({ id, clientId, type: 'Reunião', servicos, status, date });
    const repo = montar({
      Cadencias: [{ chave: 'monitoria_dias', valor: 30 }, { chave: 'price_dias', valor: 15 }],
      Clientes: [
        cli('vencido', { servicos: '["Monitoria","Precificação"]' }),
        cli('emdia', { servicos: ['Monitoria', 'Precificação'] }),
        cli('misto', { servicos: ['Monitoria', 'Plataforma 2D', 'Price'] }),
        cli('indep', { servicos: ['Monitoria', 'Precificação'], servicosIndependentes: '["Monitoria"]' }),
        cli('nunca', { servicos: ['Monitoria', 'Precificação', '2D Nexus', '2D Alcance', 'Apura'] }),
        cli('g1', { grupo: 'Rede', servicos: ['Precificação'] }),
        cli('g2', { grupo: 'Rede', servicos: ['Precificação'] }),
        cli('acao', { servicos: ['Monitoria', 'Precificação'] }),
        cli('suspenso', { status: 'Suspenso', servicos: ['Monitoria'] }),
      ],
      Agenda: [
        reuniao('e1', 'vencido', '["Monitoria","Precificação"]', 'Concluído', diasAntes(60)),
        reuniao('e2', 'emdia', ['Monitoria'], 'Concluído', diasAntes(5)),
        reuniao('e3', 'emdia', ['Precificação'], 'Agendado', diasDepois(3)),
        reuniao('e4', 'misto', ['Monitoria', 'Plataforma 2D'], 'Concluído', diasAntes(10)),
        reuniao('e5', 'indep', ['Precificação'], 'Cancelado', diasAntes(2)),
        { id: 'e6', clientId: 'g1', type: 'Precificação', status: 'Concluído', date: diasAntes(4) },
      ],
      Acoes: [
        { id: 'a1', clientId: 'acao', tipo: 'price', status: 'concluido', servico: 'Precificação', dueAt: diasAntes(3) },
        { id: 'a2', clientId: 'acao', tipo: 'relatorio', status: 'concluido', servico: 'Monitoria', dueAt: diasAntes(7) },
      ],
    });
    const antes = fila(repo);
    expect(antes.length).toBeGreaterThanOrEqual(8); // o caso não pode passar por fila vazia
    const r = await migrar(repo);
    expect(r.gravado).toBe(true);
    expect(fila(repo)).toEqual(antes);
    expect(r.relogios.divergencias).toEqual([]);
    expect(r.relogios.permitidas).toEqual([]);
    expect(r.relogios.comparados).toBeGreaterThan(antes.length); // inclui o suspenso
  });

  it('só o relógio do produto do registro DW sai de vencido; o resto do mesmo cliente não muda', async () => {
    const repo = montar({ Clientes: [cli('a', { servicos: ['Monitoria', 'Precificação'] })] });
    const [antes] = fila(repo);
    const r = await migrar(repo, { registroDw: { clientes: [{ id: 'a', entra: ['Precificação'] }] } });
    const [depois] = fila(repo);
    const de = (f: { relogios: { servico: string; status: string; atraso: number }[] }, s: string) => f.relogios.find((x) => x.servico === s);
    expect(de(depois, 'Plataforma 2D')).toEqual(de(antes, 'Plataforma 2D'));
    expect(de(antes, '2D Price')!.atraso).toBeGreaterThan(100);
    expect(de(depois, '2D Price')!.atraso).toBeLessThanOrEqual(0);
    expect(r.relogios.permitidas.map((p: { servico: string }) => p.servico)).toEqual(['2D Price']);
  });
});

describe('migrarProdutos: trava de versão, bordas', () => {
  const clientes = [cli('a', { servicos: ['Monitoria'] })];

  it('recusa por máquina não faz a cópia do banco', async () => {
    logMaquina('Bruno2D', '1.6.17');
    let copiou = false;
    await migrar(montar({ Clientes: clientes }), { backup: async () => { copiou = true; } });
    expect(copiou).toBe(false);
  });

  it('nomear só uma de duas atrasadas não libera, e a recusa cita só a que falta', async () => {
    logMaquina('Bruno2D', '1.6.17');
    logMaquina('JENIFFER-2D', '1.5.9');
    const repo = montar({ Clientes: clientes });
    const antes = JSON.stringify(repo._dump());
    const r = await migrar(repo, { ignorarMaquinas: ['Bruno2D'] });
    expect(r.gravado).toBe(false);
    expect(r.recusa).toMatch(/JENIFFER-2D \(1\.5\.9\)/);
    expect(r.recusa).not.toMatch(/Bruno2D/);
    expect(JSON.stringify(repo._dump())).toBe(antes);
  });

  it('simulação lista a máquina atrasada mas não recusa', async () => {
    logMaquina('Bruno2D', '1.6.17');
    const r = await migrar(montar({ Clientes: clientes }), { aplicar: false });
    expect(r.recusa).toBeNull();
    expect(r.maquinasAtrasadas).toEqual([{ maquina: 'Bruno2D', versao: '1.6.17' }]);
  });

  it('entende o log gravado pelo registroVersao de verdade', async () => {
    const { registrarVersao } = require('../registroVersao.cjs');
    registrarVersao({ dir: maquinasDir, versao: '1.7.0' });
    registrarVersao({ dir: maquinasDir, versao: '1.6.17' });
    const r = await migrar(montar({ Clientes: clientes }), { aplicar: false });
    expect(r.maquinasAtrasadas).toEqual([{ maquina: os.hostname(), versao: '1.6.17' }]);
  });

  it.each([
    ['vazio', ''],
    ['sem versão', 'lixo sem tabulação\n'],
    ['versão ilegível', '2026-10-01\tv1.7.0\tclient\n'],
  ])('log %s conta como atrasada (não saber não libera)', async (_nome, conteudo) => {
    fs.writeFileSync(path.join(maquinasDir, 'X.log'), conteudo);
    const r = await migrar(montar({ Clientes: clientes }));
    expect(r.gravado).toBe(false);
    expect(r.recusa).toMatch(/X \(/);
  });

  it('final de linha CRLF e linhas em branco no fim: vale a última versão', async () => {
    fs.writeFileSync(path.join(maquinasDir, 'X.log'), '2026\t1.6.17\tclient\r\n2026\t1.7.0\tclient\r\n\r\n');
    const r = await migrar(montar({ Clientes: clientes }));
    expect(r.maquinasAtrasadas).toEqual([]);
    expect(r.gravado).toBe(true);
  });

  it('ignora arquivo que não é .log', async () => {
    fs.writeFileSync(path.join(maquinasDir, 'Bruno2D-conflito.txt'), '2026\t1.6.17\tclient\n');
    const r = await migrar(montar({ Clientes: clientes }));
    expect(r.gravado).toBe(true);
  });

  it('sem a pasta de máquinas lança e não grava', async () => {
    const repo = montar({ Clientes: clientes });
    const antes = JSON.stringify(repo._dump());
    await expect(migrar(repo, { maquinasDir: path.join(oneDriveDir, 'nao-existe') })).rejects.toThrow();
    expect(JSON.stringify(repo._dump())).toBe(antes);
  });
});

describe('migrarProdutos: registro DW, bordas', () => {
  it.each([
    ['Precificação'], ['Precificacao'], ['Price'], ['2D Price'],
  ])('entra com o nome "%s" casa com o 2D Price', async (nome) => {
    const repo = montar({ Clientes: [cli('a', { servicos: ['Precificação'] })] });
    await migrar(repo, { registroDw: { clientes: [{ id: 'a', entra: [nome] }] } });
    expect(repo.get('Clientes')[0].produtos[0].faseDesde).toBe('2026-10-30');
  });

  it('id que não é da carteira e produto que o cliente não tem não criam nada', async () => {
    const repo = montar({ Clientes: [cli('a', { servicos: ['Monitoria'] })] });
    const r = await migrar(repo, { registroDw: { clientes: [{ id: 'fantasma', entra: ['Monitoria'] }, { id: 'a', entra: ['Precificação'] }] } });
    expect(r.gravado).toBe(true);
    const [c] = repo.get('Clientes');
    expect(c.produtos.map((p: { produto: string }) => p.produto)).toEqual(['Plataforma 2D']);
    expect(c.produtos[0].faseDesde).toBe(CRIADO);
    expect(r.relogios.permitidas).toEqual([]);
  });

  it('decisão real de alguém não é remarcada pelo registro DW', async () => {
    const repo = montar({
      Clientes: [cli('a', {
        servicos: ['Precificação'],
        produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-08-01', motivoFase: 'contratou em agosto' }],
      })],
    });
    await migrar(repo, { registroDw: { clientes: [{ id: 'a', entra: ['Precificação'] }] } });
    expect(repo.get('Clientes')[0].produtos[0]).toMatchObject({ faseDesde: '2026-08-01', motivoFase: 'contratou em agosto' });
  });

  it('simulação também recusa registro em formato inesperado', async () => {
    const repo = montar({ Clientes: [cli('a', { servicos: ['Monitoria'] })] });
    const r = await migrar(repo, { aplicar: false, registroDw: null });
    expect(r.recusa).toMatch(/registro/i);
  });
});

describe('migrarProdutos: nada do que existia se perde', () => {
  it('senha, login e link do Price vão pro item; independência fica em produto Em breve', async () => {
    const repo = montar({
      Clientes: [cli('a', {
        servicos: ['Precificação', '2D Alcance'],
        servicosIndependentes: ['2D Alcance'],
        loginPrice: 'x',
        senhaPriceCifrada: 'cifra',
        linksServicos: { Price: 'http://p', '2D Alcance': 'http://a' },
      })],
    });
    await migrar(repo);
    const [c] = repo.get('Clientes');
    expect(c.produtos[0]).toMatchObject({ produto: '2D Price', login: 'x', senhaCifrada: 'cifra', link: 'http://p' });
    expect(c.produtos[1]).toMatchObject({ produto: '2D Alcance', fase: 'Em breve', independente: true, link: 'http://a' });
    expect(c.loginPrice).toBe('x');
    expect(c.senhaPriceCifrada).toBe('cifra');
    expect(c.servicosIndependentes).toEqual([]); // só Ativo no derivado
  });

  it('loja de grupo sem Price marcado mantém login, senha e link legados', async () => {
    const repo = montar({
      Clientes: [cli('a', {
        servicos: ['Monitoria'],
        loginPrice: 'grupo',
        senhaPriceCifrada: 'cifra',
        linksServicos: { Precificação: 'http://p' },
      })],
    });
    await migrar(repo);
    const [c] = repo.get('Clientes');
    expect(c.loginPrice).toBe('grupo');
    expect(c.senhaPriceCifrada).toBe('cifra');
    expect(c.linksServicos).toEqual({ '2D Price': 'http://p' });
  });

  it('contatos gravados como texto e série com texto viram array com nome novo', async () => {
    const repo = montar({
      Clientes: [cli('a', { servicos: [], contatos: JSON.stringify([{ id: 'k', servicos: '["Monitoria"]' }]) })],
      AgendaSeries: [{ id: 's1', clientId: 'a', servicos: '["Precificação","Monitoria"]' }],
    });
    const r = await migrar(repo);
    expect(repo.get('Clientes')[0].contatos[0].servicos).toEqual(['Plataforma 2D']);
    expect(repo.get('AgendaSeries')[0].servicos).toEqual(['2D Price', 'Plataforma 2D']);
    expect(r.seriesRenomeadas).toBe(1);
  });

  it('serviço fora da lista oficial segue com o mesmo nome', async () => {
    const repo = montar({
      Clientes: [cli('a', { servicos: ['Consultoria X'] })],
      Agenda: [{ id: 'e1', clientId: 'a', servicos: ['Consultoria X'], status: 'Agendado', date: '2026-11-10' }],
    });
    const r = await migrar(repo);
    expect(repo.get('Clientes')[0].produtos[0]).toMatchObject({ produto: 'Consultoria X', fase: 'Ativo' });
    expect(repo.get('Agenda')[0].servicos).toEqual(['Consultoria X']);
    expect(r.eventosRenomeados).toBe(0);
  });

  it('linha-base legada com nome antigo também cai com o item refeito', async () => {
    const { MOTIVO_LEGADO } = require('../dominio/clientes.cjs');
    const repo = montar({
      Clientes: [cli('a', {
        servicos: ['Precificação'],
        produtos: [{ produto: 'Precificação', fase: 'Ativo', faseDesde: CRIADO, motivoFase: MOTIVO_LEGADO }],
      })],
      ProdutosHistorico: [{ id: 'h0', clientId: 'a', produto: 'Precificação', fase: 'Ativo', motivo: MOTIVO_LEGADO, mudouEm: CRIADO, gravadoEm: AGORA }],
    });
    await migrar(repo, { registroDw: { clientes: [{ id: 'a', entra: ['Precificação'] }] } });
    const hist = repo.get('ProdutosHistorico');
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ produto: '2D Price', mudouEm: '2026-10-30', motivo: 'migração para produtos (1.7)' });
  });
});

describe('migrarProdutos: queda no meio', () => {
  const dados = () => ({
    Clientes: [cli('a', { servicos: ['Monitoria', 'Precificação', '2D Nexus'] }), cli('b', { servicos: '["Monitoria"]' })],
    Agenda: [{ id: 'e1', clientId: 'a', type: 'Reunião', servicos: '["Monitoria"]', status: 'Concluído', date: diasAntes(5) }],
    AgendaSeries: [{ id: 's1', clientId: 'a', servicos: ['Precificação'] }],
  });
  const registroDw = { clientes: [{ id: 'a', entra: ['Precificação'] }] };
  const semId = (hist: Record<string, unknown>[]) => hist.map((h) => ({ ...h, id: '' }));

  it('rodar de novo depois de falhar no meio chega ao mesmo estado de uma rodada limpa', async () => {
    const limpo = montar(dados());
    await migrar(limpo, { registroDw });

    const repo = montar(dados());
    const original = repo.save;
    let falhou = false;
    repo.save = (sheet: string, rows: unknown[]) => {
      if (sheet === 'Agenda' && !falhou) { falhou = true; throw new Error('queda'); }
      return original(sheet, rows);
    };
    await expect(migrar(repo, { registroDw })).rejects.toThrow('queda');
    expect(repo.get('Agenda')[0].servicos).toBe('["Monitoria"]'); // parou mesmo no meio

    const r = await migrar(repo, { registroDw });
    expect(r.gravado).toBe(true);
    expect(r.relogios.divergencias).toEqual([]);
    for (const s of ['Categorias', 'Clientes', 'Agenda', 'AgendaSeries']) expect(repo.get(s)).toEqual(limpo.get(s));
    expect(semId(repo.get('ProdutosHistorico'))).toEqual(semId(limpo.get('ProdutosHistorico')));
  });

  it('segunda rodada dias depois não refaz data nem acrescenta histórico', async () => {
    const repo = montar(dados());
    await migrar(repo, { registroDw });
    const clientes = JSON.stringify(repo.get('Clientes'));
    const hist = repo.get('ProdutosHistorico').length;
    const r = await migrar(repo, { registroDw, agora: '2026-11-20T12:00:00.000Z' });
    expect(r.relogios.permitidas).toEqual([]);
    expect(JSON.stringify(repo.get('Clientes'))).toBe(clientes);
    expect(repo.get('ProdutosHistorico')).toHaveLength(hist);
  });
});

describe('migrarProdutos: CLI em processo separado (pastas temporárias)', () => {
  const SCRIPT = path.join(__dirname, 'migrarProdutos.cjs');

  function semear() {
    const { repoPlanilha } = require('../dominio/repo.cjs');
    const { initDbSqlite, _fecharParaTestes } = require('../dbSqlite.cjs');
    initDbSqlite();
    const repo = repoPlanilha();
    repo.save('Categorias', categorias());
    repo.save('Clientes', [cli('a', { servicos: ['Monitoria', 'Precificação'] })]);
    _fecharParaTestes();
  }
  function rodar(args: string[], env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ONEDRIVE_ROOT: oneDriveDir, SQLITE_DIR: sqliteDir, APP_MODE: 'server', ...env },
    });
  }
  function noBanco() {
    const db = new (require('better-sqlite3'))(path.join(sqliteDir, 'carteira.sqlite'), { readonly: true });
    const linha = db.prepare('SELECT servicos, produtos FROM Clientes').get();
    db.close();
    return linha;
  }
  const pasta = () => path.join(oneDriveDir, 'dados', 'migracoes');
  const copias = () => (fs.existsSync(pasta()) ? fs.readdirSync(pasta()).filter((f) => f.endsWith('.sqlite')) : []);
  const registro = (conteudo = JSON.stringify({ clientes: [{ id: 'a', entra: ['Precificação'] }] })) => {
    fs.mkdirSync(pasta(), { recursive: true });
    fs.writeFileSync(path.join(pasta(), '2026-10-30-produtos-dw.json'), conteudo);
  };

  it('sem flag só simula: banco intacto e nenhuma cópia', () => {
    semear();
    const antes = noBanco();
    const r = rodar([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/nada foi gravado/);
    expect(noBanco()).toEqual(antes);
    expect(copias()).toEqual([]);
  });

  it('--aplicar sem o registro DW recusa', () => {
    semear();
    const antes = noBanco();
    const r = rodar(['--aplicar']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Registro do DW não encontrado/);
    expect(noBanco()).toEqual(antes);
    expect(copias()).toEqual([]);
  });

  it('--aplicar com máquina na 1.6 sai com erro; --ignorar-maquinas= nomeando grava e faz a cópia', () => {
    semear();
    registro();
    logMaquina('Bruno2D', '1.6.17');
    const antes = noBanco();
    const recusado = rodar(['--aplicar']);
    expect(recusado.status).toBe(1);
    expect(recusado.stderr).toMatch(/Bruno2D/);
    expect(noBanco()).toEqual(antes);
    expect(copias()).toEqual([]);

    const ok = rodar(['--aplicar', '--ignorar-maquinas=Outra, Bruno2D']);
    expect(ok.status).toBe(0);
    expect(JSON.parse(noBanco().servicos)).toEqual(['Plataforma 2D', '2D Price']);
    expect(copias()).toHaveLength(1);
    const copia = new (require('better-sqlite3'))(path.join(pasta(), copias()[0]), { readonly: true });
    const linha = copia.prepare('SELECT servicos FROM Clientes').get();
    copia.close();
    expect(linha.servicos).toBe(antes.servicos); // é o "antes" de verdade
  });

  it('em modo cliente recusa antes de tocar em qualquer coisa', () => {
    semear();
    registro();
    const antes = noBanco();
    const r = rodar(['--aplicar'], { APP_MODE: 'client' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/máquina servidora/);
    expect(noBanco()).toEqual(antes);
    expect(copias()).toEqual([]);
  });

  it('registro DW com JSON corrompido não grava', () => {
    semear();
    registro('{ corrompido');
    const antes = noBanco();
    const r = rodar(['--aplicar']);
    expect(r.status).toBe(1);
    expect(noBanco()).toEqual(antes);
    expect(copias()).toEqual([]);
  });
});
