import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CadastroCliente } from './CadastroCliente';
import { EditarCadastroModal } from './EditarCadastroModal';
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
  return { botao, salvar: () => (modal.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault() {} }), onClose };
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
