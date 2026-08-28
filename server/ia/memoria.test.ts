import { describe, expect, it } from 'vitest';
import { FERRAMENTAS } from './tools.cjs';
import { repoMemoria } from '../dominio/repo.cjs';
import { blocoMemoria, montarSystemPrompt } from './agente.cjs';

/**
 * Memória GERAL do agente — regras do processo que não pertencem a nenhum
 * cliente.
 *
 * Existe porque faltava: pedir pro agente guardar "a ata só é preenchida ao
 * final da reunião" não tinha onde cair (o dossiê é por cliente), e um agente
 * externo, sem a ferramenta, culpou permissão de escrita de arquivo em vez de
 * dizer que não existia lugar pra isso.
 */
const F = (nome: string) => FERRAMENTAS.find((f: { name: string }) => f.name === nome)!;
const REGRA = 'A ata da reunião só é preenchida ao final da reunião.';

describe('memória geral do agente', () => {
  it('registra a regra e devolve na listagem', () => {
    const repo = repoMemoria({ MemoriaIA: [] });
    const criada = F('registrar_memoria').executar(repo, { texto: REGRA });
    expect(criada.jaExistia).toBe(false);
    expect(F('buscar_memoria').executar(repo)).toEqual([
      { id: criada.id, texto: REGRA, criadoEm: criada.criadoEm },
    ]);
  });

  it('não duplica a mesma regra (o prompt é reenviado a cada chamada)', () => {
    const repo = repoMemoria({ MemoriaIA: [] });
    const a = F('registrar_memoria').executar(repo, { texto: REGRA });
    const b = F('registrar_memoria').executar(repo, { texto: `  ${REGRA.toUpperCase()}  ` });
    expect(b.jaExistia).toBe(true);
    expect(b.id).toBe(a.id);
    expect(F('buscar_memoria').executar(repo)).toHaveLength(1);
  });

  it('recusa texto vazio e texto longo demais', () => {
    const repo = repoMemoria({ MemoriaIA: [] });
    expect(() => F('registrar_memoria').executar(repo, { texto: '   ' })).toThrow(/obrigatório/i);
    expect(() => F('registrar_memoria').executar(repo, { texto: 'x'.repeat(401) })).toThrow(/longa demais/i);
  });

  it('remove pelo id e reclama de id inexistente', () => {
    const repo = repoMemoria({ MemoriaIA: [] });
    const criada = F('registrar_memoria').executar(repo, { texto: REGRA });
    expect(F('remover_memoria').executar(repo, { id: criada.id })).toEqual({ removido: REGRA });
    expect(F('buscar_memoria').executar(repo)).toEqual([]);
    expect(() => F('remover_memoria').executar(repo, { id: 'nao-existe' })).toThrow(/não encontrada/i);
  });

  it('a regra entra no system prompt, não só na ferramenta', () => {
    // O ponto da memória geral é valer SEM ninguém pedir. Se só existisse
    // atrás de `buscar_memoria`, o modelo esqueceria de consultar.
    const prompt = montarSystemPrompt({ memorias: [{ texto: REGRA }] });
    expect(prompt).toContain(REGRA);
    expect(prompt).toMatch(/REGRAS DO PROCESSO/);
  });

  it('sem memórias, o prompt não ganha bloco vazio', () => {
    expect(blocoMemoria([])).toBe('');
    expect(montarSystemPrompt({})).not.toMatch(/REGRAS DO PROCESSO/);
  });

  it('limita o bloco no prompt, que é reenviado a cada chamada do modelo', () => {
    const muitas = Array.from({ length: 80 }, (_, i) => ({ texto: `regra número ${i} `.repeat(4) }));
    const bloco = blocoMemoria(muitas);
    expect(bloco.length).toBeLessThan(2200);
    // Corta as ANTIGAS: a última registrada é a mais provável de importar.
    expect(bloco).toContain('regra número 79');
  });
});

describe('buscar_clientes: estado x status', () => {
  const clientes = [
    { id: '1', empresa: 'Loja Ativa', estado: 'Ativo', status: 'Regular', servicos: '[]' },
    { id: '2', empresa: 'Loja Suspensa', estado: 'Ativo', status: 'Suspenso', servicos: '[]' },
    { id: '3', empresa: 'Loja Desligada', estado: 'Inativo', status: 'Regular', servicos: '[]' },
    { id: '4', empresa: 'Loja Legada', status: 'Regular', servicos: '[]' },
  ];

  it('filtra por estado — o campo que significa "cliente ativo"', () => {
    // Bug visto no log de produção: "quantos clientes ativos" virava
    // `status: "Ativo"` e devolvia zero, porque nenhum cliente tem esse status.
    const repo = repoMemoria({ Clientes: clientes, AnalisesIA: [] });
    const buscar = F('buscar_clientes').executar;
    expect(buscar(repo, { estado: 'Ativo' }).map((c: { empresa: string }) => c.empresa)).toEqual(['Loja Ativa', 'Loja Suspensa']);
    expect(buscar(repo, { estado: 'Inativo' }).map((c: { empresa: string }) => c.empresa)).toEqual(['Loja Desligada']);
    expect(buscar(repo, { status: 'Ativo' })).toEqual([]);
  });

  it('estado e status combinam como filtros independentes', () => {
    const repo = repoMemoria({ Clientes: clientes, AnalisesIA: [] });
    const r = F('buscar_clientes').executar(repo, { estado: 'Ativo', status: 'Regular' });
    expect(r.map((c: { empresa: string }) => c.empresa)).toEqual(['Loja Ativa']);
  });
});
