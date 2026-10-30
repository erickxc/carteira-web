import { describe, expect, it } from 'vitest';
import { autenticar } from './sessao';

describe('autenticar', () => {
  it('aceita as três equipes com usuário = senha', () => {
    expect(autenticar('negocios', 'negocios')).toBe('negocios');
    expect(autenticar('fiscal', 'fiscal')).toBe('fiscal');
    expect(autenticar('admin', 'admin')).toBe('admin');
  });

  it('tolera acento, maiúscula e espaço no usuário', () => {
    expect(autenticar(' Negócios ', 'negocios')).toBe('negocios');
  });

  it('recusa senha errada, senha de outra equipe e usuário desconhecido', () => {
    expect(autenticar('fiscal', 'errada')).toBeNull();
    expect(autenticar('fiscal', 'admin')).toBeNull();
    expect(autenticar('fulano', 'fulano')).toBeNull();
    expect(autenticar('', '')).toBeNull();
  });
});
