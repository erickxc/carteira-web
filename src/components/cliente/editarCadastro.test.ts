import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CadastroCliente } from './CadastroCliente';
import { EditarCadastroModal } from './EditarCadastroModal';
import { ProdutosCliente } from './ProdutosCliente';
import { ModalShell } from '../ModalShell';
import type { Cliente, ProdutoClienteTela } from '../../types';

// Sem DOM nos testes: os componentes são chamados como função e a árvore é lida
// direto. `estados` substitui, na ordem, o valor inicial dos useState do componente.
const h = vi.hoisted(() => ({
  estados: [] as unknown[],
  atualizar: (async () => {}) as (id: string, patch: unknown) => Promise<void>,
  toast: (() => {}) as (msg: string) => void,
}));

vi.mock('react', async (original) => {
  const real = await original<typeof import('react')>();
  return {
    ...real,
    useState: (init: unknown) => {
      const valor = h.estados.length ? h.estados.shift() : typeof init === 'function' ? (init as () => unknown)() : init;
      return [valor, () => {}];
    },
  };
});
vi.mock('../../api/client', () => ({
  buscarRetratoDw: vi.fn(), atualizarRetratoDw: vi.fn(),
  revelarCredenciaisPrice: vi.fn(), revelarCredenciaisProduto: vi.fn(),
}));
vi.mock('../../utils/toast', () => ({ toastError: (m: string) => h.toast(m), toastSuccess: vi.fn() }));
vi.mock('../../context/CarteiraContext', () => ({
  useCarteira: () => ({ clientes: [], opcoesPorTipo: () => [], atualizarCliente: (id: string, patch: unknown) => h.atualizar(id, patch) }),
}));

type Props = Record<string, unknown> & { children?: ReactNode };

function elementos(no: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as ReactElement<Props>;
  return [el, ...elementos(el.props.children)];
}

const CNPJ = '11222333000181';
const cliente = {
  id: 'c1', empresa: 'Pecita', status: 'Regular', estado: 'Ativo', observacao: 'nota interna',
  lojasCadastro: [{ nome: 'Matriz', cnpj: CNPJ, endereco: 'Rua A' }],
} as Cliente;

/** Abre o modal: `aberto` é o cliente de quando abriu, `vivo` o atual na tela. */
function abrir(rascunho: Cliente, { aberto = cliente, vivo = aberto }: { aberto?: Cliente; vivo?: Cliente } = {}) {
  const onClose = vi.fn();
  h.estados = [aberto, rascunho, false];
  const modal = EditarCadastroModal({ cliente: vivo, onClose }) as ReactElement<Props>;
  expect(modal.type).toBe(ModalShell);
  const botao = (rotulo: string) => elementos(modal.props.footer as ReactNode).find((e) => e.props.children === rotulo)!;
  const salvar = (formulario: { querySelector: (s: string) => unknown } = { querySelector: () => null }) =>
    (modal.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault() {}, currentTarget: formulario });
  return { botao, salvar, onClose, travarFechar: modal.props.travarFechar };
}

let gravados: unknown[][];
let avisos: string[];

beforeEach(() => {
  gravados = [];
  avisos = [];
  h.estados = [];
  h.atualizar = async (...args) => { gravados.push(args); };
  h.toast = (m) => { avisos.push(m); };
});

describe('EditarCadastroModal', () => {
  it('Cancelar depois de mexer em vários campos não grava nada', () => {
    const { botao, onClose } = abrir({ ...cliente, status: 'Suspenso', empresa: 'Outro', endereco: 'Rua B' });
    (botao('Cancelar').props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(gravados).toEqual([]);
  });

  it('Salvar manda um único patch só com o que mudou e fecha', async () => {
    const { salvar, onClose } = abrir({ ...cliente, status: 'Suspenso', endereco: ' Rua B ' });
    await salvar();
    expect(gravados).toEqual([['c1', { status: 'Suspenso', endereco: 'Rua B' }]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('nada mudou: só fecha', async () => {
    const { salvar, onClose } = abrir({ ...cliente });
    await salvar();
    expect(gravados).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('produto gravado durante a edição não é desfeito pelo Salvar', async () => {
    const vivo = { ...cliente, produtos: [{ produto: '2D Price', fase: 'Cancelado' }] as ProdutoClienteTela[] };
    const { salvar } = abrir({ ...cliente, status: 'Suspenso' }, { vivo });
    await salvar();
    expect(gravados).toEqual([['c1', { status: 'Suspenso' }]]);
  });

  it('CNPJ incompleto não salva e mantém o painel aberto', async () => {
    const { salvar, onClose } = abrir({ ...cliente, lojasCadastro: [{ nome: 'Matriz', cnpj: '112', endereco: '' }] });
    await salvar();
    expect(gravados).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
    expect(avisos[0]).toMatch(/CNPJ incompleto/);
  });

  it('CNPJ antigo incompleto em loja intocada não trava outro campo', async () => {
    const velho = { ...cliente, lojasCadastro: [{ nome: 'Matriz', cnpj: '112', endereco: '' }] };
    const { salvar } = abrir({ ...velho, status: 'Suspenso' }, { aberto: velho });
    await salvar();
    expect(gravados).toEqual([['c1', { status: 'Suspenso' }]]);
  });

  it('nome vazio não salva', async () => {
    const { salvar } = abrir({ ...cliente, empresa: '   ' });
    await salvar();
    expect(gravados).toEqual([]);
    expect(avisos[0]).toMatch(/nome/);
  });

  it('desligar o relatório vai no patch', async () => {
    const comRel = { ...cliente, relatorioCadencia: { numero: 2, unidade: 'mes' } } as Cliente;
    const { salvar } = abrir({ ...comRel, relatorioCadencia: undefined }, { aberto: comRel });
    await salvar();
    expect(gravados).toHaveLength(1);
    expect('relatorioCadencia' in (gravados[0][1] as object)).toBe(true);
  });

  it('número do relatório apagado vira 1', async () => {
    const { salvar } = abrir({ ...cliente, relatorioCadencia: { numero: 0, unidade: 'mes' } } as Cliente);
    await salvar();
    expect(gravados).toEqual([['c1', { relatorioCadencia: { numero: 1, unidade: 'mes' } }]]);
  });

  it('recusa do servidor avisa e não fecha', async () => {
    h.atualizar = async () => { throw new Error('recusado'); };
    const { salvar, onClose } = abrir({ ...cliente, status: 'Suspenso' });
    await salvar();
    expect(onClose).not.toHaveBeenCalled();
    expect(avisos).toEqual(['recusado']);
  });
});

describe('EditarCadastroModal: não perder o que foi digitado', () => {
  it('sem alteração fecha com Esc e clique fora; com alteração, só pelos botões', () => {
    expect(abrir({ ...cliente }).travarFechar).toBe(false);
    expect(abrir({ ...cliente, endereco: 'Rua B' }).travarFechar).toBe(true);
  });

  it('troca de fase aberta: o Salvar do painel avisa, não grava e não fecha', async () => {
    const seletores: string[] = [];
    const { salvar, onClose } = abrir({ ...cliente, status: 'Suspenso' });
    await salvar({ querySelector: (s) => { seletores.push(s); return {}; } });
    expect(seletores).toEqual(['[data-bloco-produtos] textarea']);
    expect(gravados).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
    expect(avisos[0]).toMatch(/troca de fase/);
  });

  it('o que o Salvar procura existe: o bloco tem a marca e só a edição de fase tem textarea', () => {
    const comProduto = { ...cliente, produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2025-03-15', motivoFase: 'x' }] as ProdutoClienteTela[] };
    const bloco = (estados: unknown[]) => {
      h.estados = estados;
      return renderToStaticMarkup(createElement(ProdutosCliente, { cliente: comProduto, salvar: async () => true, linksEditaveis: true }));
    };
    expect(bloco([])).not.toContain('<textarea');
    expect(bloco([{ produto: '2D Price', fase: 'Cancelado', motivo: '', novo: false, de: 'Ativo' }])).toContain('<textarea');
    expect(bloco([{ produto: 'Protocolo GPS', fase: 'Ativo', motivo: '', novo: true }])).toContain('<textarea');
    h.estados = [];
    expect(renderToStaticMarkup(createElement(CadastroCliente, { cliente, valor: cliente, onChange: () => {} }))).toContain('data-bloco-produtos');
  });
});

describe('CadastroCliente em edição', () => {
  const arvore = (valor: Cliente, estados: unknown[] = []) => {
    const onChange = vi.fn<(c: Cliente) => void>();
    h.estados = estados;
    const raiz = CadastroCliente({ cliente, valor, onChange }) as ReactElement<{ cliente: Cliente; valor: Cliente; onChange: (c: Cliente) => void }>;
    const render = raiz.type as (p: typeof raiz.props) => ReactNode;
    return { els: elementos(render(raiz.props)), onChange };
  };
  const porRotulo = (els: ReactElement<Props>[], rotulo: string) => els.find((e) => e.props.label === rotulo);

  it('mudar campo só avisa o rascunho: não chama atualizarCliente', () => {
    const { els, onChange } = arvore(cliente);
    (porRotulo(els, 'Status')!.props.onChange as (v: string) => void)('Suspenso');
    expect(onChange).toHaveBeenCalledWith({ ...cliente, status: 'Suspenso' });
    expect(gravados).toEqual([]);
  });

  it('lojas entram no rascunho sem máscara', () => {
    const { els, onChange } = arvore(cliente);
    const editor = els.find((e) => e.props.lojas !== undefined)!;
    (editor.props.onChange as (l: unknown[]) => void)([{ nome: 'Matriz', cnpj: '11.222.333/0001-81', endereco: 'Rua A' }]);
    expect(onChange.mock.calls[0][0].lojasCadastro).toEqual(cliente.lojasCadastro);
  });

  it('o bloco de produtos recebe o cliente vivo e grava sozinho', async () => {
    const { els } = arvore({ ...cliente, status: 'Suspenso' });
    const produtos = els.find((e) => typeof e.props.salvar === 'function')!;
    expect(produtos.props.cliente).toBe(cliente);
    await expect((produtos.props.salvar as (p: unknown) => Promise<boolean>)({ produtoAlterado: { produto: 'X' } })).resolves.toBe(true);
    expect(gravados).toEqual([['c1', { produtoAlterado: { produto: 'X' } }]]);
  });

  it('observação saiu daqui e "Pausado até" só aparece quando pedido ou marcado', () => {
    const { els } = arvore(cliente);
    expect(porRotulo(els, 'Observação')).toBeUndefined();
    expect(porRotulo(els, 'Pausado até')).toBeUndefined();
    expect(porRotulo(arvore(cliente, [true]).els, 'Pausado até')).toBeDefined();
    expect(porRotulo(arvore({ ...cliente, pausadoAte: '2026-12-01' }).els, 'Pausado até')).toBeDefined();
  });
});

describe('CadastroCliente em leitura', () => {
  const html = (c: Cliente) => renderToStaticMarkup(createElement(CadastroCliente, { valor: c, somenteLeitura: true }));

  it('mostra tudo em texto, sem campo nem botão', () => {
    const saida = html({
      ...cliente,
      pausadoAte: '2026-12-01', motivoPausa: 'obra',
      produtos: [
        { produto: 'Protocolo GPS', fase: 'Negociação', faseDesde: '2025-03-15T12:00:00.000Z' },
        { produto: '2D Price', fase: 'Ativo', faseDesde: '2025-03-15T12:00:00.000Z', login: 'pecita.price', temSenha: true, independente: true },
      ] as ProdutoClienteTela[],
      relatorioCadencia: { numero: 2, unidade: 'mes' },
    });
    expect(saida).not.toMatch(/<(input|select|textarea|button)/);
    expect(saida).toMatch(/2D Price.*Ativo desde 03\/2025.*independente/);
    expect(saida.indexOf('2D Price')).toBeLessThan(saida.indexOf('Protocolo GPS'));
    expect(saida).toContain('pecita.price');
    expect(saida).toContain('senha salva');
    expect(saida).toContain('01/12/2026');
    expect(saida).toContain('11.222.333/0001-81');
    expect(saida).toContain('A cada 2 (Mês)');
    expect(saida).not.toContain('nota interna');
  });

  it('cliente sem nada não quebra', () => {
    const saida = html({ id: 'c2', empresa: 'Vazio' } as Cliente);
    expect(saida).toContain('Nenhum produto');
    expect(saida).toContain('Nenhuma loja cadastrada');
    expect(saida).toContain('Sem login');
    expect(saida).toContain('Desligado');
    expect(saida).not.toContain('Pausado até');
  });
});

describe('EditarCadastroModal: bordas do patch', () => {
  it('Cancelar não envia o formulário; só Salvar é submit', () => {
    const { botao } = abrir({ ...cliente, status: 'Suspenso' });
    expect(botao('Cancelar').props.type).not.toBe('submit');
    expect(botao('Salvar').props.type).toBe('submit');
  });

  it('relatório ligado e intocado fica fora do patch: o servidor gera relatórios quando a chave vem', async () => {
    const comRel = { ...cliente, relatorioCadencia: { numero: 2, unidade: 'personalizado', diasSemana: [1, 3] } } as Cliente;
    const { salvar } = abrir({ ...comRel, status: 'Suspenso' }, { aberto: comRel });
    await salvar();
    expect(gravados).toEqual([['c1', { status: 'Suspenso' }]]);
  });

  it('limpar a pausa manda vazio, não undefined: undefined sumiria do JSON e a pausa continuaria valendo', async () => {
    const pausado = { ...cliente, pausadoAte: '2026-12-01', motivoPausa: 'obra' };
    const { salvar } = abrir({ ...pausado, pausadoAte: '', motivoPausa: '' }, { aberto: pausado });
    await salvar();
    expect(gravados).toEqual([['c1', { pausadoAte: '', motivoPausa: '' }]]);
    expect(JSON.parse(JSON.stringify(gravados[0][1]))).toEqual({ pausadoAte: '', motivoPausa: '' });
  });

  it('campo mudado em outra máquina durante a edição não é desfeito', async () => {
    const vivo = { ...cliente, status: 'Férias' };
    const { salvar } = abrir({ ...cliente, endereco: 'Rua B' }, { vivo });
    await salvar();
    expect(gravados).toEqual([['c1', { endereco: 'Rua B' }]]);
  });

  it('CNPJ antigo incompleto bloqueia quando a lista de lojas foi alterada', async () => {
    const velho = { ...cliente, lojasCadastro: [{ nome: 'Matriz', cnpj: '112', endereco: '' }] };
    const novaLista = [...velho.lojasCadastro, { nome: 'Filial', cnpj: CNPJ, endereco: '' }];
    const { salvar, onClose } = abrir({ ...velho, lojasCadastro: novaLista }, { aberto: velho });
    await salvar();
    expect(gravados).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('recusa sem mensagem usa o aviso padrão e não fecha', async () => {
    h.atualizar = async () => { throw 'falhou'; };
    const { salvar, onClose } = abrir({ ...cliente, status: 'Suspenso' });
    await salvar();
    expect(onClose).not.toHaveBeenCalled();
    expect(avisos).toEqual(['Não foi possível salvar. Tente de novo.']);
  });
});

describe('CadastroCliente em edição: bordas', () => {
  const montar = (valor: Cliente, estados: unknown[] = []) => {
    const onChange = vi.fn<(c: Cliente) => void>();
    h.estados = estados;
    const raiz = CadastroCliente({ cliente, valor, onChange }) as ReactElement<{ cliente: Cliente; valor: Cliente; onChange: (c: Cliente) => void }>;
    const render = raiz.type as (p: typeof raiz.props) => ReactNode;
    return { els: elementos(render(raiz.props)), onChange };
  };
  const campo = (els: ReactElement<Props>[], rotulo: string) => els.find((e) => e.props.label === rotulo)!;
  const html = (valor: Cliente) => renderToStaticMarkup(createElement(CadastroCliente, { cliente: { ...cliente, ...valor }, valor, onChange: () => {} }));

  it('nenhum botão dentro do painel envia o formulário sem querer', () => {
    const saida = html({
      ...cliente,
      produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2025-03-15', temSenha: true }] as ProdutoClienteTela[],
      relatorioCadencia: { numero: 1, unidade: 'personalizado', diasSemana: [1] },
    });
    const botoes = saida.match(/<button[^>]*>/g) ?? [];
    expect(botoes.length).toBeGreaterThan(5);
    expect(botoes.filter((b) => !b.includes('type="button"'))).toEqual([]);
  });

  it('o aviso de salvar ao sair do campo sumiu', () => {
    expect(html(cliente)).not.toMatch(/salvas ao sair/);
  });

  it('senha de produto nunca aparece no formulário', () => {
    const saida = html({ ...cliente, produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2025-03-15', login: 'x', temSenha: true, senha: 'segredo123' }] as ProdutoClienteTela[] });
    expect(saida).not.toContain('segredo123');
    expect(saida).toContain('salva — digite para trocar');
  });

  it('digitar e desfazer nas lojas não gera patch', async () => {
    const { els, onChange } = montar(cliente);
    const editor = els.find((e) => e.props.lojas !== undefined)!;
    (editor.props.onChange as (l: unknown[]) => void)(editor.props.lojas as unknown[]);
    const { salvar, onClose } = abrir(onChange.mock.calls[0][0]);
    await salvar();
    expect(gravados).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('produto recusado pelo servidor devolve false e avisa: o motivo digitado fica', async () => {
    h.atualizar = async () => { throw new Error('Informe o motivo da mudança de fase.'); };
    const { els } = montar(cliente);
    const produtos = els.find((e) => typeof e.props.salvar === 'function')!;
    await expect((produtos.props.salvar as (p: unknown) => Promise<boolean>)({ produtoAlterado: { produto: 'X' } })).resolves.toBe(false);
    expect(avisos).toEqual(['Informe o motivo da mudança de fase.']);
  });

  it('Enter em campo de produto não envia o painel; em textarea e outras teclas segue normal', () => {
    class InputFalso {}
    vi.stubGlobal('HTMLInputElement', InputFalso);
    try {
      const { els } = montar(cliente);
      const bloco = els.find((e) => typeof e.props.onKeyDown === 'function')!;
      const tecla = (key: string, target: unknown) => {
        const preventDefault = vi.fn();
        (bloco.props.onKeyDown as (e: unknown) => void)({ key, target, preventDefault });
        return preventDefault;
      };
      expect(tecla('Enter', new InputFalso())).toHaveBeenCalledTimes(1);
      expect(tecla('Enter', {})).not.toHaveBeenCalled();
      expect(tecla('a', new InputFalso())).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('status legado fora da lista continua entre as opções', () => {
    const { els } = montar({ ...cliente, status: 'Antigo' });
    expect((campo(els, 'Status').props.options as { value: string }[]).map((o) => o.value)).toContain('Antigo');
  });

  it('cliente inativo não oferece pausa', () => {
    const rotulos = (c: Cliente) => montar(c).els.filter((e) => e.props.children === 'Pausar temporariamente');
    expect(rotulos(cliente)).toHaveLength(1);
    expect(rotulos({ ...cliente, estado: 'Inativo' })).toHaveLength(0);
  });

  it('limpar a data da pausa zera data e motivo no rascunho', () => {
    const { els, onChange } = montar({ ...cliente, pausadoAte: '2026-12-01', motivoPausa: 'obra' });
    const input = campo(els, 'Pausado até').props.children as ReactElement<Props>;
    (input.props.onChange as (e: unknown) => void)({ target: { value: '' } });
    expect(onChange.mock.calls[0][0]).toMatchObject({ pausadoAte: '', motivoPausa: '' });
  });

  it('desmarcar relatório desliga; sair de personalizado descarta os dias', () => {
    const rel = { numero: 2, unidade: 'personalizado', diasSemana: [1, 3] } as Cliente['relatorioCadencia'];
    const { els, onChange } = montar({ ...cliente, relatorioCadencia: rel });
    const caixa = els.find((e) => e.props.type === 'checkbox' && e.props.checked === true)!;
    (caixa.props.onChange as (e: unknown) => void)({ target: { checked: false } });
    expect(onChange.mock.calls[0][0].relatorioCadencia).toBeUndefined();
    (campo(els, 'Unidade').props.onChange as (v: string) => void)('mes');
    expect(onChange.mock.calls[1][0].relatorioCadencia).toEqual({ numero: 2, unidade: 'mes' });
  });
});

describe('CadastroCliente em leitura: bordas', () => {
  const html = (c: Cliente) => renderToStaticMarkup(createElement(CadastroCliente, { valor: c, somenteLeitura: true }));
  const produto = (p: Partial<ProdutoClienteTela>) => ({ fase: 'Ativo', faseDesde: '2025-03-15', ...p }) as ProdutoClienteTela;

  it('mostra os grupos que o plano pede', () => {
    const saida = html(cliente);
    for (const grupo of ['Identificação', 'Situação', 'Produtos', 'Lojas (1)', 'Login no Price', 'Relatório automático']) {
      expect(saida).toContain(grupo);
    }
  });

  it('senha nunca aparece, mesmo se vier no objeto', () => {
    const saida = html({ ...cliente, produtos: [produto({ produto: '2D Price', login: 'l', temSenha: true, senha: 'segredo123' })] });
    expect(saida).not.toContain('segredo123');
    expect(saida).toContain('senha salva');
  });

  it('login de outro produto não vira login do Price; sem senha, nada de "senha salva"', () => {
    const saida = html({ ...cliente, produtos: [produto({ produto: 'Protocolo GPS', login: 'gps.login', temSenha: true })] });
    expect(saida).not.toContain('gps.login');
    expect(saida).toContain('Sem login');
    expect(saida).not.toContain('senha salva');
  });

  it('Price sem marcar independente não escreve "false" nem "independente"', () => {
    const saida = html({ ...cliente, produtos: [produto({ produto: '2D Price', independente: false })] });
    expect(saida).not.toContain('false');
    expect(saida).not.toContain('independente');
  });

  it('data de fase inválida vira traço, sem quebrar', () => {
    expect(html({ ...cliente, produtos: [produto({ produto: '2D Price', faseDesde: 'lixo' })] })).toContain('desde —');
  });

  it('relatório personalizado lista os dias, ou diz que não há', () => {
    expect(html({ ...cliente, relatorioCadencia: { numero: 1, unidade: 'personalizado', diasSemana: [] } } as Cliente)).toContain('nenhum dia marcado');
    expect(html({ ...cliente, relatorioCadencia: { numero: 1, unidade: 'personalizado', diasSemana: [1] } } as Cliente)).toMatch(/Personalizado: \S/);
  });

  it('sem pílula nem ponto colorido', () => {
    expect(html({ ...cliente, status: 'Suspenso', produtos: [produto({ produto: '2D Price' })] })).not.toMatch(/class="[^"]*(pill|badge|dot)/i);
  });
});
