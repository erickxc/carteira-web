import { createRequire } from 'module';
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
