import { addDays, format } from 'date-fns';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CabecalhoFicha } from './CabecalhoFicha';
import { PainelFicha } from './PainelFicha';
import { resumoDaConversa, type ResumoFicha } from '../../utils/resumoFicha';
import type { ContatoVisivel } from '../../utils/contatos';
import type { Cliente, EventoAgenda } from '../../types';

const cliente = { id: 'c1', empresa: 'Pecita', monitor: 'Erick', status: 'Regular', estado: 'Ativo', contatos: [] } as unknown as Cliente;
const VAZIO: ResumoFicha = { prazos: [], ultima: null, proxima: null };

const evento = (campos: Partial<EventoAgenda>) => ({
  id: 'e1', subject: 'Revisão', type: 'Reunião', status: 'Agendado', date: new Date(2026, 10, 3).toISOString(), time: '14:30', ...campos,
}) as unknown as EventoAgenda;

const contato = (n: number) => ({ id: `k${n}`, nome: `Pessoa ${n}`, cargo: 'Compras', telefone: '21999999999', doGrupo: false }) as unknown as ContatoVisivel;

const prazo = (campos: Partial<ResumoFicha['prazos'][number]>): ResumoFicha['prazos'][number] => ({
  servico: 'Plataforma 2D', independente: false, atraso: 0, status: 'em_dia', proximo: null, ...campos,
});

function painel(resumo: ResumoFicha, contatos: ContatoVisivel[] = [], c: Cliente = cliente) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PainelFicha, {
    cliente: c, resumo, contatos, onWhatsApp: () => {}, onVerContatos: () => {},
  })));
}

describe('PainelFicha', () => {
  it('cliente sem nada: cada bloco fica de pé com a sua linha curta', () => {
    const html = painel(VAZIO);
    for (const texto of ['Sem produto com prazo', 'Nenhuma conversa concluída', 'Nenhuma reunião marcada', 'Nenhum contato cadastrado', 'Nenhum acesso cadastrado', 'Prazos', 'Reuniões', 'monitorIA', 'Contatos e acessos']) {
      expect(html).toContain(texto);
    }
  });

  // Data como o input grava, relativa a hoje: `isClienteAtivo` e o cabeçalho comparam com o relógio real.
  const diaLocal = (dias: number) => format(addDays(new Date(), dias), 'yyyy-MM-dd');

  it('prazos vazios de cliente fora de atendimento não dizem que falta produto', () => {
    for (const fora of [{ pausadoAte: diaLocal(1) }, { status: 'Suspenso' }, { estado: 'Inativo' }]) {
      const html = painel(VAZIO, [], { ...cliente, ...fora } as Cliente);
      expect(html).toContain('Fora da cadência');
      expect(html).not.toContain('Sem produto com prazo');
    }
    expect(painel(VAZIO, [], { ...cliente, pausadoAte: diaLocal(-1) })).toContain('Sem produto com prazo');
  });

  it('cabeçalho: pausa vigente (inclusive o próprio dia) aparece na situação; vencida ou sem data, não', () => {
    const cabecalho = (pausadoAte?: string) => renderToStaticMarkup(createElement(CabecalhoFicha, {
      cliente: { ...cliente, pausadoAte },
      onNovoEvento: () => {}, onLembrete: () => {}, onContatoCliente: () => {}, onEditar: () => {}, onRelatorios: () => {}, onExcluir: () => {},
    }));
    expect(cabecalho(diaLocal(0))).toContain(`Pausado até ${format(new Date(), 'dd/MM')}`);
    expect(cabecalho(diaLocal(-1))).not.toContain('Pausado');
    expect(cabecalho('')).not.toContain('Pausado');
    expect(cabecalho()).not.toContain('Pausado');
  });

  it('sem contato, "ver todos" continua lá: é a única porta para cadastrar o primeiro', () => {
    expect(painel(VAZIO)).toContain('ver todos (0)');
  });

  it('prazo: nunca não se lê pelo sinal, vencido soma, no prazo conta o que falta, independente sem número', () => {
    const html = painel({
      ...VAZIO,
      prazos: [
        prazo({ status: 'nunca', atraso: -20 }),
        prazo({ servico: 'A', status: 'vencido', atraso: 12 }),
        prazo({ servico: 'B', status: 'em_dia', atraso: -9 }),
        prazo({ servico: 'C', status: 'vencendo', atraso: -3 }),
        prazo({ servico: 'D', independente: true, atraso: null, status: null }),
      ],
    });
    expect(html).toContain('nunca atendido');
    expect(html).not.toContain('20 d');
    expect(html).toMatch(/danger-fg[^>]*>\+12 d/);
    expect(html).toMatch(/success-fg[^>]*>9 d/);
    expect(html).toMatch(/warning-fg[^>]*>3 d/);
    expect(html).toMatch(/text-text-muted[^>]*>independente/);
  });

  it('prazo de hoje não vira "0 d"', () => {
    expect(painel({ ...VAZIO, prazos: [prazo({ status: 'vencendo', atraso: 0 })] })).toContain('vence hoje');
  });

  it('reuniões: última com tipo e resumo; próxima com hora e aviso de pendente', () => {
    const html = painel({
      ...VAZIO,
      ultima: evento({ subject: 'Fechamento', status: 'Concluído', date: new Date(2026, 9, 2).toISOString(), resumo: 'Margem subiu\nsegunda linha' }),
      proxima: evento({ status: 'Pendente' }),
    });
    expect(html).toContain('02/10 · Reunião · Fechamento');
    expect(html).toContain('Margem subiu');
    expect(html).not.toContain('segunda linha');
    expect(html).toContain('03/11 14:30 · Revisão');
    expect(html).toContain('(pendente)');
  });

  it('próxima confirmada não leva o aviso de pendente', () => {
    expect(painel({ ...VAZIO, proxima: evento({}) })).not.toContain('(pendente)');
  });

  it('mostra até 3 contatos e o total em "ver todos"', () => {
    const html = painel(VAZIO, [1, 2, 3, 4].map(contato));
    expect(html).toContain('Pessoa 3');
    expect(html).not.toContain('Pessoa 4');
    expect(html).toContain('ver todos (4)');
  });

  it('WhatsApp desligado para telefone inválido, como no modal de contatos', () => {
    expect(painel(VAZIO, [{ ...contato(1), telefone: '123' }])).toMatch(/<button[^>]*disabled[^>]*>.*WhatsApp/);
  });

  it('acessos expostos no bloco, sem revelar senha', () => {
    const html = painel(VAZIO, [], { ...cliente, produtos: [{ produto: 'Plataforma 2D', fase: 'Ativo', link: 'https://bi.exemplo/x' }], temSenhaPrice: false } as unknown as Cliente);
    expect(html).toContain('Plataforma 2D');
    expect(html).not.toContain('Nenhum acesso cadastrado');
    expect(html).not.toContain('senha');
  });
});

describe('resumoDaConversa', () => {
  it('prefere o resumo do monitor à ata', () => {
    expect(resumoDaConversa(evento({ resumo: '\n  Texto do monitor  \nresto', ata: 'ATA DE REUNIÃO' }))).toBe('Texto do monitor');
  });

  it('da ata gerada pega a seção de resumo, não o título "ATA DE REUNIÃO"', () => {
    const ata = 'ATA DE REUNIÃO\nCliente: Pecita\n\n1. RESUMO\n   Margem subiu no trimestre\n\n2. O QUE FOI TRATADO\n   Outra coisa';
    expect(resumoDaConversa(evento({ ata }))).toBe('Margem subiu no trimestre');
  });

  it('ata gerada ainda em branco não mostra "(a preencher)"', () => {
    expect(resumoDaConversa(evento({ ata: 'ATA DE REUNIÃO\n\n1. RESUMO\n   (a preencher)\n\n2. O QUE FOI TRATADO\n' }))).toBe('');
  });

  it('ata digitada à mão, sem a seção: primeira linha', () => {
    expect(resumoDaConversa(evento({ ata: 'Conversamos sobre preço\nDepois' }))).toBe('Conversamos sobre preço');
  });

  it('sem resumo e sem ata: vazio', () => {
    expect(resumoDaConversa(evento({}))).toBe('');
  });
});

describe('CabecalhoFicha', () => {
  const nada = () => {};
  const cabecalho = (c: Cliente) => renderToStaticMarkup(createElement(CabecalhoFicha, {
    cliente: c, onNovoEvento: nada, onLembrete: nada, onContatoCliente: nada, onEditar: nada, onRelatorios: nada, onExcluir: nada,
  }));

  it('situação em texto corrido, sem campo vazio sobrando separador', () => {
    const html = cabecalho({ ...cliente, grupo: 'Altese', local: 'Autopeça' } as Cliente);
    expect(html).toContain('Rede Altese · Erick · Autopeça · Regular · Ativo');
    expect(cabecalho(cliente)).toContain('>Erick · Regular · Ativo<');
  });

  it('ações à vista; Relatórios e Excluir só dentro do menu fechado', () => {
    const html = cabecalho(cliente);
    for (const acao of ['Novo evento', 'Lembrete', 'Cliente entrou em contato', 'Editar cadastro']) expect(html).toContain(acao);
    expect(html).toContain('aria-label="Mais ações"');
    expect(html).not.toContain('Excluir');
  });
});
