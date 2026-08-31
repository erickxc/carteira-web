import { describe, expect, it } from 'vitest';
import { gerarAnaliseIA, montarPrompt, textoEvento } from './analiseCliente.cjs';

const cliente = { id: 'c1', empresa: 'Empresa Teste' };

function ollamaFake(resposta: unknown) {
  return { gerarJSON: async () => resposta, chat: async () => '' };
}

describe('analiseCliente: gerarAnaliseIA', () => {
  it('devolve os campos da resposta do modelo, já normalizados', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [{ date: '2026-08-01', status: 'Concluído', ata: 'Cliente satisfeito.' }],
      dossieAnterior: '',
      ollama: ollamaFake({
        nivelRisco: 'medio',
        resumo: 'Cliente estável, com um ponto de atenção.',
        fatores: ['Atraso no envio de dados'],
        sugestaoProximaPauta: 'Revisar prazos de envio.',
        dossieAtualizado: 'Dossiê atualizado.',
      }),
    });

    expect(resultado).toEqual({
      nivelRisco: 'medio',
      resumo: 'Cliente estável, com um ponto de atenção.',
      fatores: ['Atraso no envio de dados'],
      sugestaoProximaPauta: 'Revisar prazos de envio.',
      dossieAtualizado: 'Dossiê atualizado.',
    });
  });

  it('cai para "baixo" quando o modelo devolve um nível de risco fora do enum esperado', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [],
      dossieAnterior: '',
      ollama: ollamaFake({ nivelRisco: 'crítico', resumo: '', fatores: [], sugestaoProximaPauta: '' }),
    });
    expect(resultado.nivelRisco).toBe('baixo');
  });

  it('mantém o dossiê anterior quando o modelo não devolve um dossieAtualizado válido', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [],
      dossieAnterior: 'Dossiê anterior mantido.',
      ollama: ollamaFake({ nivelRisco: 'baixo', resumo: '', fatores: [], sugestaoProximaPauta: '' }),
    });
    expect(resultado.dossieAtualizado).toBe('Dossiê anterior mantido.');
  });
});

describe('analiseCliente: montarPrompt inclui o segmento do cliente (campo Local)', () => {
  it('inclui o segmento quando cliente.local está preenchido', () => {
    const prompt = montarPrompt({
      cliente: { id: 'c1', empresa: 'Empresa Teste', local: 'Autopeça' },
      eventosNovos: [],
      dossieAnterior: '',
    });
    expect(prompt).toContain('(segmento: Autopeça)');
  });

  it('não inventa segmento quando cliente.local não está preenchido', () => {
    const prompt = montarPrompt({
      cliente: { id: 'c1', empresa: 'Empresa Teste' },
      eventosNovos: [],
      dossieAnterior: '',
    });
    expect(prompt).not.toContain('segmento:');
  });

  it('funciona junto com a identidade de loja segmentada (grupo)', () => {
    const prompt = montarPrompt({
      cliente: { id: 'c1', empresa: 'Aliança - Itaboraí', grupo: 'Aliança', local: 'Distribuidora' },
      eventosNovos: [],
      dossieAnterior: '',
    });
    expect(prompt).toContain('a loja "Itaboraí" da rede "Aliança"');
    expect(prompt).toContain('(segmento: Distribuidora)');
  });
});

describe('analiseCliente: textoEvento inclui motivo e histórico de remarcação', () => {
  it('inclui o motivo do cancelamento/reagendamento quando presente', () => {
    const texto = textoEvento({ date: '2026-08-20', status: 'Cancelado', motivo: 'Cliente pediu para adiar por falta de agenda.' });
    expect(texto).toContain('Motivo: Cliente pediu para adiar por falta de agenda.');
  });

  it('não inventa motivo quando o evento não tem um', () => {
    const texto = textoEvento({ date: '2026-08-20', status: 'Concluído', description: 'Reunião de rotina.' });
    expect(texto).not.toContain('Motivo:');
  });

  it('sinaliza quando o evento já foi remarcado antes', () => {
    const texto = textoEvento({ date: '2026-08-20', status: 'Cancelado', reagendamentos: 2, motivo: 'Segunda vez que cancela.' });
    expect(texto).toContain('já foi remarcada 2x antes deste registro');
  });

  it('reagendamentos zero ou ausente não gera a linha', () => {
    expect(textoEvento({ date: '2026-08-20', status: 'Concluído', reagendamentos: 0 })).not.toContain('remarcada');
    expect(textoEvento({ date: '2026-08-20', status: 'Concluído' })).not.toContain('remarcada');
  });

  it('motivo e reagendamentos aparecem juntos, antes dos blocos de produto', () => {
    const texto = textoEvento({
      date: '2026-08-20', status: 'Cancelado', motivo: 'Sem verba este mês.', reagendamentos: 3,
      produtosSituacao: [{ produto: 'Kit Amortecedor', situacao: 'zerou' }],
    });
    const ordem = [texto.indexOf('Motivo:'), texto.indexOf('remarcada'), texto.indexOf('Produtos — situação')];
    expect(ordem.every((i) => i !== -1)).toBe(true);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });
});

describe('analiseCliente: norma de cancelamento repetido como desengajamento', () => {
  it('instrui o modelo a tratar 2+ cancelamentos/remarcações como padrão, não fato isolado', () => {
    const prompt = montarPrompt({ cliente, eventosNovos: [], dossieAnterior: '' });
    expect(prompt).toMatch(/desengajamento/);
    expect(prompt).toMatch(/2\+ ocorrências/);
  });
});
