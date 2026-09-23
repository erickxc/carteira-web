import { describe, expect, it } from 'vitest';
import { desempacotarPrefs, destinoDoEndereco, ehEnderecoDoExe, empacotarPrefs, prefsParaGravar } from './regras';

const loc = (hostname: string, port: string) => ({ hostname, port });

// URLs escritas por extenso de propósito: comparar com a própria constante não pegaria erro de digitação nela.
describe('destinoDoEndereco', () => {
  it('por IP, escolhido "nome": vai pro endereço por nome', () => {
    expect(destinoDoEndereco(loc('127.0.0.1', '3011'), 'nome')).toBe('http://carteira-2d.localhost:3011');
    expect(destinoDoEndereco(loc('localhost', '3011'), 'nome')).toBe('http://carteira-2d.localhost:3011');
  });

  it('por nome, escolhido "ip": volta pro endereço por IP', () => {
    expect(destinoDoEndereco(loc('carteira-2d.localhost', '3011'), 'ip')).toBe('http://127.0.0.1:3011');
  });

  it('já no endereço escolhido: não redireciona', () => {
    expect(destinoDoEndereco(loc('carteira-2d.localhost', '3011'), 'nome')).toBeNull();
    expect(destinoDoEndereco(loc('127.0.0.1', '3011'), 'ip')).toBeNull();
  });

  it('fora do .exe (Apache 8080, Vite 5173): nunca redireciona', () => {
    expect(destinoDoEndereco(loc('127.0.0.1', '8080'), 'nome')).toBeNull();
    expect(destinoDoEndereco(loc('127.0.0.1', '5173'), 'nome')).toBeNull();
    expect(destinoDoEndereco(loc('karol-2d', '8080'), 'ip')).toBeNull();
  });
});

describe('ehEnderecoDoExe', () => {
  it('reconhece os três jeitos de abrir o backend do .exe', () => {
    expect(ehEnderecoDoExe(loc('127.0.0.1', '3011'))).toBe(true);
    expect(ehEnderecoDoExe(loc('localhost', '3011'))).toBe(true);
    expect(ehEnderecoDoExe(loc('carteira-2d.localhost', '3011'))).toBe(true);
  });

  it('host estranho na mesma porta não conta', () => {
    expect(ehEnderecoDoExe(loc('karol-2d', '3011'))).toBe(false);
  });
});

describe('empacotar/desempacotar preferências', () => {
  it('ida e volta preserva acento e emoji', () => {
    const prefs = { 'assistenteIA:conversa': '[{"texto":"ação 🎉"}]', tema: 'dark' };
    expect(desempacotarPrefs(empacotarPrefs(prefs))).toEqual(prefs);
  });

  it('pacote corrompido vira objeto vazio, sem lançar', () => {
    expect(desempacotarPrefs('%%%não-é-base64')).toEqual({});
    expect(desempacotarPrefs(empacotarPrefs({ a: '1' }).slice(0, 3))).toEqual({});
  });

  it('pacote que não é objeto de strings é descartado', () => {
    const lista = btoa(JSON.stringify(['a'])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(desempacotarPrefs(lista)).toEqual({});
  });
});

describe('prefsParaGravar', () => {
  it('nunca sobrescreve o que já existe no destino', () => {
    const existe = (k: string) => k === 'tema';
    expect(prefsParaGravar({ tema: 'dark', filtro: 'Erick' }, existe)).toEqual({ filtro: 'Erick' });
  });
});
