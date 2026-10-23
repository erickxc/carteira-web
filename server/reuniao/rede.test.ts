import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { contextoDaRede, produtosAReajustar } = require('./rede.cjs');

const vinculos = { Pecita: { pecita_cg: 'c-cg', pecita: 'c-ita', Pecita_seropedica: 'c-ser' }, Outra: { x: 'c-x' } };
const clientes = [
  { id: 'c-cg', empresa: 'Pecita - Campo Grande' }, { id: 'c-ita', empresa: 'Pecita - Itaguaí' },
  { id: 'c-ser', empresa: 'Pecita - Seropédica' }, { id: 'c-x', empresa: 'Só Fiat' },
];

describe('rede do cliente (vínculo do Alvos)', () => {
  it('acha a empresa e dá nome amigável às lojas (tira o prefixo comum)', () => {
    expect(contextoDaRede('c-cg', { vinculos, clientes })).toEqual({
      empresa: 'Pecita', cliente: 'Pecita - Campo Grande',
      nomesLoja: { pecita_cg: 'Campo Grande', pecita: 'Itaguaí', Pecita_seropedica: 'Seropédica' },
    });
  });

  it('loja única mantém o nome inteiro; cliente sem vínculo devolve null', () => {
    expect(contextoDaRede('c-x', { vinculos, clientes }).nomesLoja).toEqual({ x: 'Só Fiat' });
    expect(contextoDaRede('nada', { vinculos, clientes })).toBeNull();
  });

  it('produtos a reajustar vêm do cartão de precificação mais recente do analisador', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'analisador-'));
    const telas = path.join(raiz, 'Pecita', '_cache_telas');
    fs.mkdirSync(telas, { recursive: true });
    const gravar = (nome: string, produtos: unknown[], quando: Date) => {
      const f = path.join(telas, nome);
      fs.writeFileSync(f, zlib.gzipSync(JSON.stringify({ resultado: { produtos } })));
      fs.utimesSync(f, quando, quando);
    };
    gravar('a-precificar-vvelho.json.gz', [{ descricao: 'Velho', reajuste: 3 }], new Date('2026-10-01'));
    gravar('a-precificar-vnovo.json.gz', [{ descricao: 'Lubrificante', reajuste: 5.35 }, { descricao: 'Graxa', reajuste: 0 }], new Date('2026-10-23'));
    expect(produtosAReajustar('Pecita', raiz)).toEqual(['Lubrificante']);
    expect(produtosAReajustar('Inexistente', raiz)).toEqual([]);
  });
});
