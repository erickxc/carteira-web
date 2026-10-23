import { describe, expect, it } from 'vitest';
import { formatarCNPJ } from './cnpj';
import { cnpjIncompleto, lojasParaEdicao, lojasParaSalvar } from './lojas';

describe('formatarCNPJ', () => {
  it('máscara padrão; incompleto fica como veio', () => {
    expect(formatarCNPJ('35774611000333')).toBe('35.774.611/0003-33');
    expect(formatarCNPJ('3577')).toBe('3577');
  });
});

describe('lojas no cadastro', () => {
  it('edição mostra CNPJ formatado; salvar volta para dígitos e descarta linha vazia', () => {
    const edicao = lojasParaEdicao([{ nome: 'Altese GM', cnpj: '31263577000209', endereco: 'Av. Lobo Júnior 980' }]);
    expect(edicao[0].cnpj).toBe('31.263.577/0002-09');
    expect(lojasParaSalvar([...edicao, { nome: ' ', cnpj: '', endereco: 'x' }])).toEqual([
      { nome: 'Altese GM', cnpj: '31263577000209', endereco: 'Av. Lobo Júnior 980' },
    ]);
  });

  it('avisa CNPJ incompleto, mas aceita vazio', () => {
    expect(cnpjIncompleto('31.263.577/0002-0')).toBe(true);
    expect(cnpjIncompleto('')).toBe(false);
    expect(cnpjIncompleto('31.263.577/0002-09')).toBe(false);
  });
});
