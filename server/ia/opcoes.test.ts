import { describe, expect, it } from 'vitest';
import { FERRAMENTAS, resolverOpcao } from './tools.cjs';
import { repoMemoria } from '../dominio/repo.cjs';

/**
 * Resolução de valores de cadastro (monitor/serviço/sala/tipo) ao criar
 * evento/lembrete.
 *
 * Existe por causa de um bug real: o agente criou uma reunião com
 * `monitores: ["Erick"]` — a opção cadastrada é "Erick Cardoso". O valor foi
 * gravado como veio, não casou com nenhuma opção na tela de edição (que é um
 * <select>), e o campo apareceu VAZIO pro usuário. Silencioso: nenhum erro,
 * nenhum log, só dado corrompido — o pior tipo de falha porque parece que deu
 * certo.
 */
const F = (nome: string) => FERRAMENTAS.find((f: { name: string }) => f.name === nome)!;

const CATEGORIAS = [
  { id: '1', tipo: 'monitor', valor: 'Yann Cruz' },
  { id: '2', tipo: 'monitor', valor: 'Erick Cardoso' },
  { id: '3', tipo: 'monitor', valor: 'Karol Santana' },
  { id: '4', tipo: 'servico', valor: 'Monitoria' },
  { id: '5', tipo: 'servico', valor: 'Precificação' },
  { id: '6', tipo: 'sala', valor: 'Nova Iorque' },
  { id: '7', tipo: 'sala', valor: 'Paris' },
  { id: '8', tipo: 'tipo_evento', valor: 'Reunião' },
];

describe('resolverOpcao', () => {
  const repo = repoMemoria({ Categorias: CATEGORIAS });

  it('casa nome parcial com a opção cadastrada — o bug real', () => {
    expect(resolverOpcao(repo, 'monitor', 'Erick', 'monitor')).toBe('Erick Cardoso');
  });

  it('ignora acento e maiúscula no match exato', () => {
    expect(resolverOpcao(repo, 'servico', 'precificacao', 'servico')).toBe('Precificação');
    expect(resolverOpcao(repo, 'monitor', 'KAROL SANTANA', 'monitor')).toBe('Karol Santana');
  });

  it('erra com a lista de opções quando não existe — nunca inventa nem grava vazio', () => {
    expect(() => resolverOpcao(repo, 'monitor', 'João', 'monitor'))
      .toThrow(/não existe.*Yann Cruz.*Erick Cardoso.*Karol Santana/s);
  });

  it('erra (não escolhe por conta própria) quando o parcial é ambíguo', () => {
    const comAmbiguidade = repoMemoria({ Categorias: [...CATEGORIAS, { id: '9', tipo: 'monitor', valor: 'Erick Almeida' }] });
    expect(() => resolverOpcao(comAmbiguidade, 'monitor', 'erick', 'monitor')).toThrow(/ambíguo/);
  });

  it('categoria sem nenhuma opção cadastrada não trava — devolve o valor como veio', () => {
    const semCategoria = repoMemoria({ Categorias: [] });
    expect(resolverOpcao(semCategoria, 'monitor', 'Qualquer', 'monitor')).toBe('Qualquer');
  });
});

describe('criar_evento: resolve antes de gravar', () => {
  function repoComCliente() {
    return repoMemoria({
      Categorias: CATEGORIAS,
      Clientes: [{ id: 'c1', empresa: 'Cliente Teste', servicos: '[]' }],
      Agenda: [],
    });
  }

  it('grava o nome completo mesmo quando o modelo manda parcial', () => {
    const repo = repoComCliente();
    const criado = F('criar_evento').executar(repo, {
      clientId: 'c1', type: 'reuniao', date: '2026-09-10', time: '10:00',
      monitores: ['Erick'], servicos: ['monitoria'], sala: 'nova iorque',
    });
    expect(criado.monitores).toEqual(['Erick Cardoso']);
    expect(criado.servicos).toEqual(['Monitoria']);
    expect(criado.sala).toBe('Nova Iorque');
    expect(criado.type).toBe('Reunião');
  });

  it('falha ANTES de gravar quando o monitor não existe — não cria evento com dado ruim', () => {
    const repo = repoComCliente();
    expect(() => F('criar_evento').executar(repo, {
      clientId: 'c1', type: 'Reunião', date: '2026-09-10', monitores: ['Fulano'],
    })).toThrow(/não existe/);
    expect(repo.get('Agenda')).toHaveLength(0);
  });
});

describe('buscar_opcoes_evento', () => {
  it('devolve os cinco tipos de categoria usados na criação de evento/lembrete', () => {
    const repo = repoMemoria({
      Categorias: [...CATEGORIAS, { id: '9', tipo: 'tipo_lembrete', valor: 'Contato' }],
    });
    expect(F('buscar_opcoes_evento').executar(repo)).toEqual({
      monitor: ['Yann Cruz', 'Erick Cardoso', 'Karol Santana'],
      servico: ['Monitoria', 'Precificação'],
      sala: ['Nova Iorque', 'Paris'],
      tipo_evento: ['Reunião'],
      tipo_lembrete: ['Contato'],
    });
  });
});
