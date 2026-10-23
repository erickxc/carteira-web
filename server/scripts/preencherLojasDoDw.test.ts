import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { planejar } = require('./preencherLojasDoDw.cjs');

const lojasDw = [
  { empresa: 'Altese', loja: 'Altese GM', cnpj: '31263577000209', ativo: 'S' },
  { empresa: 'Altese', loja: 'Altese FORD', cnpj: '07503705000170', ativo: 'S' },
  { empresa: 'Altese', loja: 'Altese Smart - Barra', cnpj: '31263577000543', ativo: 'S' },
  { empresa: 'Altese', loja: 'Altese Smart - Recreio', cnpj: '31263577000624', ativo: 'S' },
  { empresa: 'Quality', loja: 'Quality', cnpj: '24422016000150', ativo: 'S' },
  { empresa: 'Quality', loja: 'Velha', cnpj: '24422016000999', ativo: 'N' },
  { empresa: 'Pecita', loja: 'CAMPO GRANDE', cnpj: '35774611000333', ativo: 'S' },
  { empresa: 'Lupi', loja: 'Lupi', cnpj: '40384356000190', ativo: 'S' },
];
const enderecoPorCnpj = new Map([['40384356000190', { endereco: 'RUA TOPAZIOS 171', cidade: 'RIO DE JANEIRO', estado: 'RJ', cep: '21540-020' }]]);
const plano = (clientes: object[]) => planejar(clientes, { lojasDw, enderecoPorCnpj });

describe('preencherLojasDoDw.planejar', () => {
  it('grupo de lojas com CNPJs exatos (Altese Recreio + Barra)', () => {
    const [p] = plano([{ empresa: 'Altese - Recreio + Barra', loginPrice: '31263577000110' }]);
    expect(p.lojas.map((l: { nome: string }) => l.nome)).toEqual(['Altese Smart - Barra', 'Altese Smart - Recreio']);
  });

  it('grupo pela empresa do DW traz só as lojas ativas', () => {
    const [p] = plano([{ empresa: 'Quality' }]);
    expect(p.lojas.map((l: { cnpj: string }) => l.cnpj)).toEqual(['24422016000150']);
  });

  it('uma loja: pelo nome conferido, ou pelo login do Price só dela; endereço do atendimento só quando vazio', () => {
    const [pecita, lupi] = plano([
      { empresa: 'Pecita - Campo Grande', loginPrice: '35774611000171' },
      { empresa: 'Lupi', loginPrice: '40.384.356/0001-90' },
    ]);
    expect(pecita.lojas[0]).toMatchObject({ nome: 'CAMPO GRANDE', cnpj: '35774611000333' });
    expect(lupi.lojas[0].endereco).toContain('RUA TOPAZIOS 171');
    expect(lupi.endereco).toContain('RUA TOPAZIOS 171');

    const [comEnd] = plano([{ empresa: 'Lupi', loginPrice: '40384356000190', endereco: 'já tem' }]);
    expect(comEnd.endereco).toBe('');
  });

  it('login do Price repetido entre atendimentos não serve de vínculo', () => {
    const [a, b] = plano([{ empresa: 'Lupi A', loginPrice: '40384356000190' }, { empresa: 'Lupi B', loginPrice: '40384356000190' }]);
    expect(a.pula).toBe('sem vínculo seguro');
    expect(b.pula).toBe('sem vínculo seguro');
  });

  it('nunca sobrescreve quem já tem lojas, nem vincula sem certeza', () => {
    const [ja, sem] = plano([{ empresa: 'Lupi', lojasCadastro: [{ nome: 'x', cnpj: '', endereco: '' }] }, { empresa: 'Desconhecida' }]);
    expect(ja.pula).toBe('já tem lojas');
    expect(sem.pula).toBe('sem vínculo seguro');
  });
});
