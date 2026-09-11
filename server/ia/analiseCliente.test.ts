import { describe, expect, it } from 'vitest';
import { gerarAnaliseIA, montarPrompt, textoEvento, truncarSemQuebrarFrase, truncarPreservandoProximaPauta } from './analiseCliente.cjs';

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
        // Dossiê com a seção "Próxima pauta" já presente (dossiê real sempre
        // tem, por vir do TEMPLATE_DOSSIE) — sem isso, a rede de segurança
        // de "seção ausente" completaria o corpo com o campo separado, o que
        // é o comportamento certo em produção, mas não o que este teste
        // específico quer exercitar (normalização simples dos campos).
        dossieAtualizado: 'Dossiê atualizado.\n\n### Próxima pauta\nRevisar prazos de envio.',
      }),
    });

    expect(resultado).toEqual({
      nivelRisco: 'medio',
      resumo: 'Cliente estável, com um ponto de atenção.',
      fatores: ['Atraso no envio de dados'],
      sugestaoProximaPauta: 'Revisar prazos de envio.',
      dossieAtualizado: 'Dossiê atualizado.\n\n### Próxima pauta\nRevisar prazos de envio.',
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

  /**
   * Caso REAL (Altese, 03/09/2026): o modelo devolveu risco "medio" com 5
   * bullets em "Pontos de Atenção" e `fatores: []`. `fatores` é o campo que a
   * ficha do cliente mostra como justificativa do risco e que o agente cita
   * quando perguntam "por que o risco é médio?" — vazio ali reproduz a queixa
   * de "ele não sabe explicar o risco". O prompt pede, mas pedir não garante.
   */
  it('deriva fatores dos "Pontos de Atenção" quando o risco não é baixo e vieram vazios', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [{ date: '2026-08-05', status: 'Concluído', ata: 'x' }],
      dossieAnterior: '',
      ollama: ollamaFake({
        nivelRisco: 'medio',
        resumo: 'r',
        fatores: [],
        sugestaoProximaPauta: 'p',
        dossieAtualizado: [
          '### Perfil', 'Loja de autopeças.', '',
          '### Pontos de Atenção',
          '- [05/08/2026] Widmen zerou a compra de lubrificante em julho.',
          '- [05/08/2026] Paulo Salles com queda em vela de ignição.', '',
          '### Oportunidades', '- [05/08/2026] Nilvan em crescimento.', '',
          '### Próxima pauta', 'Retomar pendência.',
        ].join('\n'),
      }),
    });

    expect(resultado.fatores).toEqual([
      '[05/08/2026] Widmen zerou a compra de lubrificante em julho.',
      '[05/08/2026] Paulo Salles com queda em vela de ignição.',
    ]);
  });

  it('risco baixo com fatores vazios continua vazio — não inventa fator', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [{ date: '2026-08-05', status: 'Concluído', ata: 'x' }],
      dossieAnterior: '',
      ollama: ollamaFake({
        nivelRisco: 'baixo',
        resumo: 'r',
        fatores: [],
        sugestaoProximaPauta: 'p',
        dossieAtualizado: '### Pontos de Atenção\n- [05/08] algo pequeno.\n',
      }),
    });
    expect(resultado.fatores).toEqual([]);
  });

  it('seção vazia ("nenhum registro") não vira fator', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [{ date: '2026-08-05', status: 'Concluído', ata: 'x' }],
      dossieAnterior: '',
      ollama: ollamaFake({
        nivelRisco: 'alto',
        resumo: 'r',
        fatores: [],
        sugestaoProximaPauta: 'p',
        dossieAtualizado: '### Pontos de Atenção\n— nenhum registro\n\n### Oportunidades\n- [05/08] x\n',
      }),
    });
    expect(resultado.fatores).toEqual([]);
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

describe('analiseCliente: completa "Proxima pauta" ausente com o campo separado', () => {
  /**
   * Caso REAL (Maniacar, 03/09/2026): o corpo veio bem abaixo do teto (nao
   * foi corte) mas o modelo simplesmente nao escreveu a secao "### Proxima
   * pauta". O JSON tem um campo SEPARADO `sugestaoProximaPauta` com o mesmo
   * conteudo que deveria estar la - usa ele pra completar sem chamada nova.
   */
  it('injeta a secao a partir de sugestaoProximaPauta quando o corpo nao a tem', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [{ date: '2026-08-05', status: 'Concluído', ata: 'x' }],
      dossieAnterior: '',
      ollama: ollamaFake({
        nivelRisco: 'medio', resumo: 'r', fatores: ['f'],
        sugestaoProximaPauta: 'Verificar estoque crítico e reconquistar Compel.',
        dossieAtualizado: '### Perfil\nDistribuidora.\n\n### Pontos de Atenção\n- [05/08] algo.\n',
      }),
    });
    expect(resultado.dossieAtualizado).toContain('### Próxima pauta');
    expect(resultado.dossieAtualizado).toContain('Verificar estoque crítico e reconquistar Compel.');
  });

  it('não mexe quando a seção já veio no corpo', async () => {
    const corpo = '### Perfil\nX.\n\n### Próxima pauta\nJá escrita pelo modelo.';
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [{ date: '2026-08-05', status: 'Concluído', ata: 'x' }],
      dossieAnterior: '',
      ollama: ollamaFake({ nivelRisco: 'baixo', resumo: 'r', fatores: [], sugestaoProximaPauta: 'Outra coisa.', dossieAtualizado: corpo }),
    });
    expect(resultado.dossieAtualizado).toBe(corpo);
  });

  it('sem sugestaoProximaPauta também, não inventa nada — fica sem a seção', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [{ date: '2026-08-05', status: 'Concluído', ata: 'x' }],
      dossieAnterior: '',
      ollama: ollamaFake({ nivelRisco: 'baixo', resumo: 'r', fatores: [], sugestaoProximaPauta: '', dossieAtualizado: '### Perfil\nX.' }),
    });
    expect(resultado.dossieAtualizado).not.toContain('### Próxima pauta');
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

describe('truncarSemQuebrarFrase', () => {
  /**
   * Caso real de produção (lote de 03/09): `.slice()` puro cortou um dossiê
   * em "R$102 mil vs. R" e outro em "...status: pendente par" (de "para") —
   * texto visivelmente quebrado, pior do que só passar do teto.
   */
  it('não corta no meio de uma palavra', () => {
    const r = truncarSemQuebrarFrase('Receita cresceu R$102 mil vs. R$80 mil no mês anterior, um bom resultado.', 30);
    expect(r).not.toMatch(/vs\. R$/);
    expect(r.endsWith(' ')).toBe(false);
  });

  it('prefere cortar em fim de frase quando há um dentro da margem', () => {
    const texto = 'Primeira frase completa aqui. Segunda frase que estoura o limite proposto porque é longa.';
    const r = truncarSemQuebrarFrase(texto, 40);
    expect(r).toBe('Primeira frase completa aqui.');
  });

  it('texto dentro do limite não é alterado', () => {
    expect(truncarSemQuebrarFrase('Texto curto.', 100)).toBe('Texto curto.');
  });

  it('sem fim de frase nem quebra de linha na margem, corta em fim de palavra completa', () => {
    const original = 'palavra1 palavra2 palavra3 palavra4 palavra5 palavra6';
    const r = truncarSemQuebrarFrase(original, 20);
    expect(original.startsWith(r)).toBe(true);
    // O caractere logo depois do corte, no texto original, tem que ser um
    // espaço (ou o fim do texto) — nunca outro caractere da mesma palavra.
    const proximoChar = original[r.length];
    expect(proximoChar === ' ' || proximoChar === undefined).toBe(true);
  });
});

describe('truncarPreservandoProximaPauta', () => {
  /**
   * Caso real de produção (Aliança - Itaboraí, lote de 03/09): o corte
   * seguro de frase (`truncarSemQuebrarFrase` puro) parava de escrever ANTES
   * do título "### Próxima pauta" começar — a seção inteira sumia do
   * dossiê, e `sugestaoProximaPauta` (extraída dela) ficava vazia mesmo o
   * modelo tendo escrito uma pauta de verdade.
   */
  const CORPO = [
    '### Perfil', 'Cliente institucional.', '',
    '### Pontos de Atenção',
    '- [18/08] Ata em branco.', '- [20/08] Ata em branco.', '- [25/08] Reunião sem decisão registrada.', '',
    '### Oportunidades', '— nenhum registro', '',
    '### Pendências', '- [Cliente] Preencher atas pendentes — status: pendente', '',
    '### Próxima pauta',
    'Cobrar preenchimento das atas e validar cronograma da revisão de precificação.',
  ].join('\n');

  it('a seção "Próxima pauta" sempre sobrevive ao corte, mesmo quando o resto precisa encolher muito', () => {
    const r = truncarPreservandoProximaPauta(CORPO, 120); // teto bem apertado
    expect(r).toContain('### Próxima pauta');
    expect(r).toContain('Cobrar preenchimento das atas');
  });

  it('texto dentro do limite não é alterado', () => {
    expect(truncarPreservandoProximaPauta(CORPO, 5000)).toBe(CORPO);
  });

  it('template sem o título esperado cai no corte simples (nunca quebra)', () => {
    const semSecao = 'Texto qualquer sem os títulos do template, bem mais longo que o teto proposto aqui.';
    expect(() => truncarPreservandoProximaPauta(semSecao, 20)).not.toThrow();
  });
});

describe('analiseCliente: serviços contratados e independentes no prompt', () => {
  /**
   * Queixa do usuário: a análise sugeria reunião/pauta pra serviço que o
   * cliente conduz sozinho. O chat já recebia `servicosIndependentes`
   * (`situacaoCadastro` em tools.cjs) e tinha norma pra respeitar; o prompt da
   * análise automática não recebia NEM `servicos` NEM os independentes — não
   * tinha como saber.
   */
  const base = { id: 'c1', empresa: 'Empresa Teste' };

  it('lista os serviços contratados', () => {
    const p = montarPrompt({
      cliente: { ...base, servicos: ['Monitoria', 'Precificação'] },
      eventosNovos: [], dossieAnterior: '',
    });
    expect(p).toContain('SERVIÇOS CONTRATADOS: Monitoria, Precificação.');
  });

  it('separa os independentes e proíbe tratar ausência de reunião como risco', () => {
    const p = montarPrompt({
      cliente: { ...base, servicos: ['Monitoria', 'Precificação'], servicosIndependentes: ['Precificação'] },
      eventosNovos: [], dossieAnterior: '',
    });
    expect(p).toContain('CONDUZ SOZINHO (independentes): Precificação');
    expect(p).toMatch(/ACOMPANHAR OS NÚMEROS/);
    expect(p).toMatch(/não sugira pauta\/reunião pra eles/);
    // E diz explicitamente o que SOBRA pra cadência.
    expect(p).toContain('Reunião/cadência vale para: Monitoria.');
  });

  it('cliente com TODOS os serviços independentes: pauta é acompanhamento de indicadores', () => {
    const p = montarPrompt({
      cliente: { ...base, servicos: ['Precificação'], servicosIndependentes: ['Precificação'] },
      eventosNovos: [], dossieAnterior: '',
    });
    expect(p).toMatch(/não depende de reunião para nenhum serviço contratado/);
    expect(p).not.toContain('Reunião/cadência vale para:');
  });

  it('aceita o campo serializado como string JSON (como vem da planilha)', () => {
    const p = montarPrompt({
      cliente: { ...base, servicos: '["Monitoria","Precificação"]', servicosIndependentes: '["Precificação"]' },
      eventosNovos: [], dossieAnterior: '',
    });
    expect(p).toContain('SERVIÇOS CONTRATADOS: Monitoria, Precificação.');
    expect(p).toContain('CONDUZ SOZINHO (independentes): Precificação');
  });

  it('cliente sem serviço cadastrado não ganha bloco nenhum (nada inventado)', () => {
    const p = montarPrompt({ cliente: base, eventosNovos: [], dossieAnterior: '' });
    expect(p).not.toContain('SERVIÇOS CONTRATADOS');
    expect(p).not.toContain('CONDUZ SOZINHO');
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
    const ordem = [texto.indexOf('Motivo:'), texto.indexOf('remarcada'), texto.indexOf('Registro da monitoria')];
    expect(ordem.every((i) => i !== -1)).toBe(true);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });
});

describe('analiseCliente: registro da monitoria (cliente final / produto / tag)', () => {
  it('registro SÓ de cliente final (sem produto) aparece no prompt (legado, sem direcao)', () => {
    const texto = textoEvento({
      date: '2026-09-01', status: 'Concluído',
      produtosSituacao: [{ cliente: 'Comac', situacao: 'parou de comprar, migrou pra distribuição direta' }],
    });
    expect(texto).toContain('- Comac: parou de comprar, migrou pra distribuição direta');
  });

  it('cliente + produto + direção (queda) + observação sai identificado', () => {
    const texto = textoEvento({
      date: '2026-09-01', status: 'Concluído',
      produtosSituacao: [{ cliente: 'GSM Logística', produto: 'Amortecedor', direcao: 'queda', observacao: 'caiu em agosto' }],
    });
    expect(texto).toContain('- GSM Logística · Amortecedor: ↓ queda — caiu em agosto');
  });

  it('direção sem observação sai só com o rótulo', () => {
    const texto = textoEvento({
      date: '2026-09-01', status: 'Concluído',
      produtosSituacao: [{ cliente: 'Comac', direcao: 'aumento' }],
    });
    expect(texto).toContain('- Comac: ↑ aumento');
  });
});

describe('analiseCliente: norma de cancelamento repetido como desengajamento', () => {
  it('instrui o modelo a tratar 2+ cancelamentos/remarcações como padrão, não fato isolado', () => {
    const prompt = montarPrompt({ cliente, eventosNovos: [], dossieAnterior: '' });
    expect(prompt).toMatch(/desengajamento/);
    expect(prompt).toMatch(/2\+ ocorrências/);
  });
});
