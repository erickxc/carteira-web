import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

// Módulos de domínio são CommonJS (`server/` inteiro é `.cjs`, sem build step)
// — `createRequire` garante semântica de `require` correta em vez de depender
// de interop de ESM do bundler de teste.
const require = createRequire(import.meta.url);
const { repoMemoria } = require('./repo.cjs');
const clientesDominio = require('./clientes.cjs');
const agendaDominio = require('./agenda.cjs');
const acoesDominio = require('./acoes.cjs');

// `efeitosExternos: false` em todos os testes: nenhum deles deve tocar
// arquivo real (REUNIOES_DIR, geração de relatório) — só a planilha em
// memória do repo. Sem isso, os testes de domínio dependeriam de OneDrive
// disponível na máquina que roda `npm test`.
const SEM_EFEITOS = { efeitosExternos: false };

describe('dominio/clientes', () => {
  it('criar gera id e deriva monitoria/price/suspenso via syncClienteColumns', () => {
    const repo = repoMemoria({ Clientes: [], Agenda: [], Lembretes: [], Acoes: [] });
    const novo = clientesDominio.criar(repo, { empresa: 'Teste', servicos: ['Monitoria'], status: 'Suspenso' }, SEM_EFEITOS);
    expect(novo.id).toBeTruthy();
    expect(novo.monitoria).toBe(true);
    expect(novo.price).toBe(false);
    expect(novo.suspenso).toBe(true);
    expect(repo.get('Clientes')).toHaveLength(1);
  });

  it('criar ignora um id vindo no payload e gera um novo (mesmo comportamento de antes)', () => {
    const repo = repoMemoria({ Clientes: [] });
    const novo = clientesDominio.criar(repo, { id: 'id-forjado', empresa: 'Teste', servicos: [] }, SEM_EFEITOS);
    expect(novo.id).not.toBe('id-forjado');
  });

  it('opts.id permite ao chamador decidir o id (uso futuro: fila/overlay)', () => {
    const repo = repoMemoria({ Clientes: [] });
    const novo = clientesDominio.criar(repo, { empresa: 'Teste', servicos: [] }, { ...SEM_EFEITOS, id: 'id-fixo' });
    expect(novo.id).toBe('id-fixo');
  });

  it('atualizar faz merge e reaplica syncClienteColumns', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'Teste', servicos: [], status: 'Regular' }] });
    const updated = clientesDominio.atualizar(repo, 'c1', { status: 'Suspenso' }, SEM_EFEITOS);
    expect(updated?.suspenso).toBe(true);
  });

  it('atualizar devolve null quando o id não existe', () => {
    const repo = repoMemoria({ Clientes: [] });
    expect(clientesDominio.atualizar(repo, 'inexistente', { status: 'Regular' }, SEM_EFEITOS)).toBeNull();
  });

  it('remover faz cascade delete de Agenda, Lembretes e Acoes vinculados', () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'Teste' }],
      Agenda: [{ id: 'e1', clientId: 'c1' }, { id: 'e2', clientId: 'outro' }],
      Lembretes: [{ id: 'l1', clientId: 'c1' }, { id: 'l2', clientId: 'outro' }],
      Acoes: [{ id: 'a1', clientId: 'c1' }, { id: 'a2', clientId: 'outro' }],
    });
    const found = clientesDominio.remover(repo, 'c1');
    expect(found).toBe(true);
    expect(repo.get('Clientes')).toHaveLength(0);
    expect(repo.get('Agenda').map((a: { id: string }) => a.id)).toEqual(['e2']);
    expect(repo.get('Lembretes').map((l: { id: string }) => l.id)).toEqual(['l2']);
    expect(repo.get('Acoes').map((a: { id: string }) => a.id)).toEqual(['a2']);
  });

  it('flags monitoria/price reconhecem os nomes novos dos produtos', () => {
    const repo = repoMemoria({ Clientes: [] });
    const novo = clientesDominio.criar(repo, { empresa: 'T', servicos: ['Plataforma 2D', '2D Price'] }, SEM_EFEITOS);
    expect(novo.monitoria).toBe(true);
    expect(novo.price).toBe(true);
  });

  it('remover devolve false quando o cliente não existe (sem tocar as outras abas)', () => {
    const repo = repoMemoria({ Clientes: [], Agenda: [{ id: 'e1', clientId: 'x' }] });
    expect(clientesDominio.remover(repo, 'inexistente')).toBe(false);
    expect(repo.get('Agenda')).toHaveLength(1);
  });
});

describe('dominio/clientes: produtos (1.7)', () => {
  const D = '2026-01-01T00:00:00.000Z';
  const prod = (produto: string, fase: string, extra: Record<string, unknown> = {}) =>
    ({ produto, fase, faseDesde: D, motivoFase: 'migração', ...extra });
  const clienteCom = (produtos: unknown[]) => repoMemoria({
    Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, produtos, servicos: [] }],
  });
  type P = { produto: string; fase: string; faseDesde: string; motivoFase: string; senhaCifrada?: string };
  const achar = (lista: P[], nome: string) => lista.find((p) => p.produto === nome);

  it('criar com produtos deriva servicos/independentes/links dos Ativos', () => {
    const repo = repoMemoria({ Clientes: [] });
    const novo = clientesDominio.criar(repo, {
      empresa: 'T',
      produtos: [prod('Plataforma 2D', 'Ativo', { independente: true, link: 'L' }), prod('Apura', 'Suspenso')],
    }, SEM_EFEITOS);
    expect(novo.servicos).toEqual(['Plataforma 2D']);
    expect(novo.servicosIndependentes).toEqual(['Plataforma 2D']);
    expect(novo.linksServicos).toEqual({ 'Plataforma 2D': 'L' });
    expect(novo.monitoria).toBe(true);
  });

  it('mudar fase sem motivo novo → erro 400 e cliente inalterado', () => {
    const repo = clienteCom([prod('Plataforma 2D', 'Ativo'), prod('Apura', 'Ativo')]);
    const antes = repo.get('Clientes')[0];
    let erro: { status?: number; message?: string } | undefined;
    try {
      clientesDominio.atualizar(repo, 'c1', { produtos: [prod('Plataforma 2D', 'Ativo'), prod('Apura', 'Suspenso')] }, SEM_EFEITOS);
    } catch (e) { erro = e as typeof erro; }
    expect(erro?.status).toBe(400);
    expect(erro?.message).toBe('Informe o motivo da mudança de fase.');
    expect(repo.get('Clientes')[0]).toEqual(antes);
  });

  it('mudar fase com motivo grava, atualiza faseDesde e tira o produto de servicos', () => {
    const repo = clienteCom([prod('Plataforma 2D', 'Ativo'), prod('Apura', 'Ativo')]);
    const salvo = clientesDominio.atualizar(repo, 'c1', {
      produtos: [prod('Plataforma 2D', 'Ativo'), prod('Apura', 'Suspenso', { motivoFase: 'cliente pediu pausa' })],
    }, SEM_EFEITOS);
    expect(salvo.servicos).toEqual(['Plataforma 2D']);
    const apura = achar(salvo.produtos, 'Apura');
    expect(apura?.fase).toBe('Suspenso');
    expect(apura?.faseDesde).not.toBe(D);
  });

  it('tirar produto da lista (em vez de Cancelar) → 400', () => {
    const repo = clienteCom([prod('Plataforma 2D', 'Ativo'), prod('Apura', 'Ativo')]);
    expect(() => clientesDominio.atualizar(repo, 'c1', { produtos: [prod('Plataforma 2D', 'Ativo')] }, SEM_EFEITOS))
      .toThrow(expect.objectContaining({ status: 400 }));
  });

  it('produto fora da lista, repetido (nome antigo + novo) ou fase inválida → 400', () => {
    const repo = clienteCom([]);
    const tentar = (produtos: unknown[]) => () => clientesDominio.atualizar(repo, 'c1', { produtos }, SEM_EFEITOS);
    expect(tentar([prod('Inventado', 'Ativo', { motivoFase: 'x' })])).toThrow(expect.objectContaining({ status: 400 }));
    expect(tentar([prod('Monitoria', 'Ativo', { motivoFase: 'x' }), prod('Plataforma 2D', 'Ativo', { motivoFase: 'x' })]))
      .toThrow(expect.objectContaining({ status: 400 }));
    expect(tentar([prod('Apura', 'Ligado', { motivoFase: 'x' })])).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('produto da categoria servico (fora da lista oficial) é aceito', () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'T', produtos: [] }],
      Categorias: [{ id: 'k', tipo: 'servico', valor: 'Novo Produto' }],
    });
    const salvo = clientesDominio.atualizar(repo, 'c1', { produtos: [prod('Novo Produto', 'Ativo', { motivoFase: 'contratou' })] }, SEM_EFEITOS);
    expect(salvo.servicos).toEqual(['Novo Produto']);
  });

  it('patch legado (máquina 1.6) só com servicos: Ativo que some vira Cancelado, Suspenso fica', () => {
    const repo = clienteCom([prod('Plataforma 2D', 'Ativo'), prod('2D Price', 'Ativo'), prod('Apura', 'Suspenso')]);
    const salvo = clientesDominio.atualizar(repo, 'c1', { servicos: ['Plataforma 2D'] }, SEM_EFEITOS);
    expect(achar(salvo.produtos, '2D Price')).toMatchObject({ fase: 'Cancelado', motivoFase: 'alterado por versão anterior da Carteira' });
    expect(achar(salvo.produtos, 'Apura')?.fase).toBe('Suspenso');
    expect(salvo.servicos).toEqual(['Plataforma 2D']);
  });

  it('produto vindo da tela sem senhaCifrada mantém a senha já salva', () => {
    const repo = clienteCom([prod('2D Price', 'Ativo', { login: 'X', senhaCifrada: 'S' })]);
    const salvo = clientesDominio.atualizar(repo, 'c1', { produtos: [prod('2D Price', 'Ativo', { login: 'Y' })] }, SEM_EFEITOS);
    expect(achar(salvo.produtos, '2D Price')?.senhaCifrada).toBe('S');
    expect(salvo.loginPrice).toBe('Y');
    expect(salvo.senhaPriceCifrada).toBe('S');
  });

  it('cliente sem produtos (pré-migração): editar outro campo não grava produtos', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, servicos: ['Monitoria'] }] });
    clientesDominio.atualizar(repo, 'c1', { observacao: 'nota' }, SEM_EFEITOS);
    expect('produtos' in repo.get('Clientes')[0]).toBe(false);
    expect(repo.get('Clientes')[0].servicos).toEqual(['Monitoria']);
  });

  it('cliente sem produtos recebendo a lista montada do legado (tela 1.7) não exige motivo', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, servicos: ['Monitoria'] }] });
    const legado = clientesDominio.produtosDoCliente(repo.get('Clientes')[0]);
    const salvo = clientesDominio.atualizar(repo, 'c1', { produtos: legado }, SEM_EFEITOS);
    expect(salvo.servicos).toEqual(['Plataforma 2D']);
  });

  it('patch legado com nomes antigos não cancela nada; Em breve continua Em breve', () => {
    const repo = clienteCom([prod('Plataforma 2D', 'Ativo'), prod('2D Price', 'Ativo'), prod('2D Nexus', 'Em breve')]);
    const salvo = clientesDominio.atualizar(repo, 'c1', { servicos: ['Monitoria', 'Precificação'] }, SEM_EFEITOS);
    expect(salvo.produtos.map((p: P) => [p.produto, p.fase, p.faseDesde])).toEqual([
      ['Plataforma 2D', 'Ativo', D], ['2D Price', 'Ativo', D], ['2D Nexus', 'Em breve', D],
    ]);
  });

  it('reativar produto Cancelado repetindo o motivo antigo → 400', () => {
    const repo = clienteCom([prod('Apura', 'Cancelado')]);
    expect(() => clientesDominio.atualizar(repo, 'c1', { produtos: [prod('Apura', 'Ativo')] }, SEM_EFEITOS))
      .toThrow('Informe o motivo da mudança de fase.');
  });

  it('cliente legado sem createdAt: eco da lista montada pela tela 1.7 mantém faseDesde vazio', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'T', servicos: ['Monitoria'] }] });
    const legado = clientesDominio.produtosDoCliente(repo.get('Clientes')[0]);
    const salvo = clientesDominio.atualizar(repo, 'c1', { produtos: legado }, SEM_EFEITOS);
    expect(achar(salvo.produtos, 'Plataforma 2D')?.faseDesde).toBe('');
  });

  it('produto órfão já gravado (fora da lista e das categorias) não trava patch de outro campo nem patch 1.6', () => {
    const repo = clienteCom([prod('Plataforma 2D', 'Ativo'), prod('Consultoria', 'Ativo')]);
    expect(clientesDominio.atualizar(repo, 'c1', { observacao: 'nota' }, SEM_EFEITOS)?.observacao).toBe('nota');
    const salvo = clientesDominio.atualizar(repo, 'c1', { servicos: ['Plataforma 2D', 'Consultoria'], observacao: 'n2' }, SEM_EFEITOS);
    expect(salvo.observacao).toBe('n2');
    expect(salvo.servicos).toEqual(['Plataforma 2D', 'Consultoria']);
    // eco da tela 1.7 com o órfão também passa; produto órfão NOVO continua 400
    expect(() => clientesDominio.atualizar(repo, 'c1', { produtos: salvo.produtos }, SEM_EFEITOS)).not.toThrow();
    expect(() => clientesDominio.atualizar(repo, 'c1', {
      produtos: [...salvo.produtos, prod('Inventado', 'Ativo', { motivoFase: 'x' })],
    }, SEM_EFEITOS)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('cliente sem 2D Price mantém loginPrice/senhaPriceCifrada legados (login do grupo)', () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'T', servicos: ['Monitoria'], loginPrice: '12345678000199', senhaPriceCifrada: 'X' }],
    });
    const legado = clientesDominio.produtosDoCliente(repo.get('Clientes')[0]);
    const salvo = clientesDominio.atualizar(repo, 'c1', { produtos: legado }, SEM_EFEITOS);
    expect(salvo.loginPrice).toBe('12345678000199');
    expect(salvo.senhaPriceCifrada).toBe('X');
  });

  it('salvar sem mudar a fase preserva faseDesde vazio (cliente sem createdAt não ganha carência)', () => {
    // produtosDeLegado grava faseDesde '' quando não há createdAt ("nunca agora").
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'T', servicos: [], produtos: [prod('Plataforma 2D', 'Ativo', { faseDesde: '' })] }],
    });
    const salvo = clientesDominio.atualizar(repo, 'c1', {
      produtos: [prod('Plataforma 2D', 'Ativo', { faseDesde: '', link: 'http://novo' })],
    }, SEM_EFEITOS);
    expect(achar(salvo.produtos, 'Plataforma 2D')?.faseDesde).toBe('');
  });
});

describe('dominio/agenda', () => {
  it('remover faz cascade de Lembretes pelo eventId', () => {
    const repo = repoMemoria({
      Agenda: [{ id: 'e1', clientId: 'c1' }],
      Lembretes: [{ id: 'l1', eventId: 'e1' }, { id: 'l2', eventId: 'outro' }],
    });
    const found = agendaDominio.remover(repo, 'e1', SEM_EFEITOS);
    expect(found).toBe(true);
    expect(repo.get('Lembretes').map((l: { id: string }) => l.id)).toEqual(['l2']);
  });

  it('criar e atualizar preservam id e fazem merge simples', () => {
    const repo = repoMemoria({ Agenda: [] });
    const novo = agendaDominio.criar(repo, { clientId: 'c1', type: 'Reunião', status: 'Agendado' }, SEM_EFEITOS);
    const updated = agendaDominio.atualizar(repo, novo.id, { status: 'Concluído' }, SEM_EFEITOS);
    expect(updated?.status).toBe('Concluído');
    expect(updated?.clientId).toBe('c1');
  });
});

describe('dominio/acoes', () => {
  it('criar define createdAt/updatedAt; atualizar recalcula updatedAt', async () => {
    const repo = repoMemoria({ Acoes: [] });
    const nova = acoesDominio.criar(repo, { clientId: 'c1', tipo: 'contato', segmento: 'engajado', status: 'programado' });
    expect(nova.createdAt).toBe(nova.updatedAt);
    await new Promise((r) => setTimeout(r, 2));
    const updated = acoesDominio.atualizar(repo, nova.id, { status: 'concluido' });
    expect(updated?.status).toBe('concluido');
    expect(updated?.updatedAt).not.toBe(nova.createdAt);
  });
});

describe('dominio/clientes: gravações do bloco Produtos da ficha', () => {
  const D = '2026-01-01T00:00:00.000Z';
  const prod = (produto: string, fase = 'Ativo', extra: Record<string, unknown> = {}) =>
    ({ produto, fase, faseDesde: D, motivoFase: 'migração', ...extra });
  const novoPrice = { produto: '2D Price', fase: 'Ativo', faseDesde: '', motivoFase: 'contratou' };
  // Loja de grupo com o login do Price e sem o serviço marcado (comentário de
  // derivarCamposLegados): sincronizarPriceDoDW acha o cliente por esse CNPJ.
  const credencial = { loginPrice: '12345678000199', senhaPriceCifrada: 'cifrada' };

  it('"Adicionar produto" 2D Price não apaga o login e a senha que o cliente já tinha', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, servicos: [], produtos: [prod('Apura')], ...credencial }] });
    const salvo = clientesDominio.atualizar(repo, 'c1', { produtos: [prod('Apura'), novoPrice] }, SEM_EFEITOS);
    expect(salvo.loginPrice).toBe(credencial.loginPrice);
    expect(salvo.senhaPriceCifrada).toBe(credencial.senhaPriceCifrada);
  });

  it('idem em cliente ainda não migrado', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, servicos: ['Monitoria'], ...credencial }] });
    const lista = clientesDominio.produtosDoCliente(repo.get('Clientes')[0]);
    const salvo = clientesDominio.atualizar(repo, 'c1', { produtos: [...lista, novoPrice] }, SEM_EFEITOS);
    expect(salvo.loginPrice).toBe(credencial.loginPrice);
    expect(salvo.senhaPriceCifrada).toBe(credencial.senhaPriceCifrada);
  });

  it('idem quando uma máquina 1.6 marca Precificação', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, servicos: [], produtos: [prod('Apura')], ...credencial }] });
    const salvo = clientesDominio.atualizar(repo, 'c1', { servicos: ['Apura', 'Precificação'] }, SEM_EFEITOS);
    expect(salvo.loginPrice).toBe(credencial.loginPrice);
    expect(salvo.senhaPriceCifrada).toBe(credencial.senhaPriceCifrada);
  });

  it('"Remover senha" do 2D Price apaga a senha e mantém o login', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, produtos: [prod('2D Price', 'Ativo', { login: 'L', senhaCifrada: 'x' })] }] });
    const salvo = clientesDominio.atualizar(repo, 'c1', { produtos: [prod('2D Price', 'Ativo', { login: 'L', senhaCifrada: '' })] }, SEM_EFEITOS);
    expect(salvo.senhaPriceCifrada).toBe('');
    expect(salvo.loginPrice).toBe('L');
  });

  it('limpar o link tira o produto de linksServicos', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, produtos: [prod('Apura', 'Ativo', { link: 'L' })] }] });
    const salvo = clientesDominio.atualizar(repo, 'c1', { produtos: [prod('Apura', 'Ativo', { link: '' })] }, SEM_EFEITOS);
    expect(salvo.linksServicos).toEqual({});
  });

  it('produto novo sem motivo → 400', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, produtos: [] }] });
    expect(() => clientesDominio.atualizar(repo, 'c1', { produtos: [{ ...novoPrice, motivoFase: '  ' }] }, SEM_EFEITOS))
      .toThrow('Informe o motivo da mudança de fase.');
  });
});
