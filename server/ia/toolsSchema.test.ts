import { describe, expect, it } from 'vitest';
import { FERRAMENTAS } from './tools.cjs';

/**
 * Contrato entre o SCHEMA de cada ferramenta e a implementação dela.
 *
 * Existe por causa de um bug real: `buscar_clientes` declarava filtros de
 * risco/status/serviço/grupo, mas não tinha filtro por NOME — e o agente, sem
 * ter como buscar "o cliente 27 de setembro", usava `grupo` (o único campo
 * parecido com nome), recebia zero resultado e respondia que o cliente não
 * existia. O cliente existia.
 *
 * O inverso é igualmente silencioso e pior: um parâmetro declarado no schema
 * que a função ignora. O modelo lê a descrição, manda o filtro, a ferramenta
 * devolve a lista inteira e o agente afirma com confiança um resultado que
 * ninguém filtrou. Nada quebra, nada loga — só a resposta fica errada.
 *
 * Estes testes leem a assinatura real de cada `executar` (todas destruturam o
 * segundo argumento) e comparam com as `properties` do schema. Não substituem
 * teste de comportamento (`tools.test.ts`), garantem só que as duas pontas
 * falam do mesmo conjunto de parâmetros.
 */

/**
 * Parâmetros que a implementação realmente lê. Dois formatos aparecem em
 * `tools.cjs`, e o audit tem que entender os dois — senão ele acusa a
 * ferramenta errada em vez de encontrar o problema:
 *
 *  - `executar(repo, { a, b } = {})`  -> destruturado na assinatura
 *  - `executar(repo, args)`           -> objeto inteiro, campos lidos no corpo
 */
function parametrosDaImplementacao(fn: (...args: unknown[]) => unknown): string[] {
  const fonte = fn.toString();

  // Assinatura: do primeiro "(" até o ")" que casa com ele.
  const abre = fonte.indexOf('(');
  let nivel = 0;
  let fim = -1;
  for (let i = abre; i < fonte.length; i++) {
    if (fonte[i] === '(') nivel++;
    else if (fonte[i] === ')') { nivel -= 1; if (nivel === 0) { fim = i; break; } }
  }
  const assinatura = fonte.slice(abre + 1, fim);
  const corpo = fonte.slice(fim + 1);

  const chaveAbre = assinatura.indexOf('{');
  if (chaveAbre !== -1) {
    // Fecha na chave que CASA com a primeira — `lastIndexOf('}')` pegaria a do
    // default `= {}` no fim da assinatura e trazia "grupo }" como parâmetro.
    let n = 0;
    let chaveFecha = -1;
    for (let i = chaveAbre; i < assinatura.length; i++) {
      if (assinatura[i] === '{') n++;
      else if (assinatura[i] === '}') { n -= 1; if (n === 0) { chaveFecha = i; break; } }
    }
    return assinatura.slice(chaveAbre + 1, chaveFecha)
      .split(',')
      .map((x) => x.split('=')[0].split(':')[0].trim())
      .filter(Boolean);
  }

  // Sem destruturação na assinatura: descobre o nome do 2º parâmetro e procura
  // no corpo tanto `const { a, b } = args;` (o formato de `criar_evento` e
  // `criar_lembrete`) quanto acessos soltos `args.campo`.
  const partes = assinatura.split(',').map((x) => x.trim()).filter(Boolean);
  const segundo = partes[1]?.split('=')[0].trim();
  if (!segundo) return [];

  const encontrados = new Set<string>();

  const destruturaNoCorpo = corpo.match(new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${segundo}\\b`));
  if (destruturaNoCorpo) {
    for (const nome of destruturaNoCorpo[1].split(',')) {
      const limpo = nome.split('=')[0].split(':')[0].trim();
      if (limpo) encontrados.add(limpo);
    }
  }

  for (const m of corpo.matchAll(new RegExp(`\\b${segundo}\\s*(?:\\?\\.|\\.)\\s*([A-Za-z_$][\\w$]*)`, 'g'))) {
    encontrados.add(m[1]);
  }
  return [...encontrados];
}

const nomes = FERRAMENTAS.map((f) => f.name);

describe('schema das ferramentas x implementação', () => {
  it.each(FERRAMENTAS.map((f) => [f.name, f] as const))(
    '%s: todo parâmetro declarado é lido pela implementação',
    (_nome, ferramenta) => {
      const declarados = Object.keys(ferramenta.parameters?.properties ?? {});
      const lidos = parametrosDaImplementacao(ferramenta.executar);
      const ignorados = declarados.filter((d) => !lidos.includes(d));
      expect(ignorados, `declarados no schema mas ignorados por ${ferramenta.name}: ${ignorados.join(', ')}`).toEqual([]);
    },
  );

  it.each(FERRAMENTAS.map((f) => [f.name, f] as const))(
    '%s: todo parâmetro lido está declarado no schema',
    (_nome, ferramenta) => {
      const declarados = Object.keys(ferramenta.parameters?.properties ?? {});
      const lidos = parametrosDaImplementacao(ferramenta.executar);
      // Um parâmetro que a função usa mas o schema não anuncia é invisível
      // pro modelo: a capacidade existe e nunca é exercida.
      const naoDeclarados = lidos.filter((l) => !declarados.includes(l));
      expect(naoDeclarados, `lidos por ${ferramenta.name} mas ausentes do schema: ${naoDeclarados.join(', ')}`).toEqual([]);
    },
  );

  /**
   * Parâmetro destruturado mas nunca usado no corpo. Passaria nos dois testes
   * acima (o nome existe nas duas pontas) e ainda assim seria um filtro que
   * não filtra — o modelo manda, a ferramenta aceita, nada acontece.
   */
  it.each(FERRAMENTAS.map((f) => [f.name, f] as const))(
    '%s: parâmetro declarado é de fato usado no corpo',
    (_nome, ferramenta) => {
      const fonte = ferramenta.executar.toString();
      const corpo = fonte.slice(fonte.indexOf('{', fonte.indexOf(')')));
      const declarados = Object.keys(ferramenta.parameters?.properties ?? {});
      const naoUsados = declarados.filter((d) => {
        // Conta ocorrências como identificador inteiro. A primeira, quando a
        // destruturação está no corpo, é a própria declaração — por isso o
        // corte é > 1 nesse caso e >= 1 quando ela está na assinatura.
        const ocorrencias = [...corpo.matchAll(new RegExp(`\\b${d}\\b`, 'g'))].length;
        const declaradoNoCorpo = new RegExp(`(?:const|let|var)\\s*\\{[^}]*\\b${d}\\b`).test(corpo);
        return declaradoNoCorpo ? ocorrencias < 2 : ocorrencias < 1;
      });
      expect(naoUsados, `${ferramenta.name}: declarados e nunca usados: ${naoUsados.join(', ')}`).toEqual([]);
    },
  );

  it('nenhuma ferramenta duplicada (o Map por nome silenciaria a segunda)', () => {
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('toda ferramenta tem nome, descrição e schema de objeto', () => {
    for (const f of FERRAMENTAS) {
      expect(f.name, 'nome ausente').toMatch(/^[a-z][a-z0-9_]*$/);
      expect(f.description?.length ?? 0, `descrição vazia em ${f.name}`).toBeGreaterThan(20);
      expect(f.parameters?.type, `schema sem type object em ${f.name}`).toBe('object');
      expect(typeof f.executar, `executar não é função em ${f.name}`).toBe('function');
    }
  });

  it('parâmetro obrigatório está entre os declarados', () => {
    for (const f of FERRAMENTAS) {
      const declarados = Object.keys(f.parameters?.properties ?? {});
      for (const req of f.parameters?.required ?? []) {
        expect(declarados, `${f.name}: "${req}" é required mas não está em properties`).toContain(req);
      }
    }
  });

  /**
   * `clientId` é o parâmetro mais comum e o mais fácil de o modelo inventar
   * (ele tem o NOME do cliente, não o uuid). Toda ferramenta que o exige
   * precisa falhar de forma explícita quando ele não vem — se devolvesse algo
   * vazio em silêncio, o agente concluiria "esse cliente não tem nada".
   */
  it('ferramenta que exige clientId falha claro quando ele não vem', () => {
    const repoVazio = { get: () => [], save: () => {}, update: () => null, delete: () => false };
    const comClientId = FERRAMENTAS.filter((f) => (f.parameters?.required ?? []).includes('clientId'));
    expect(comClientId.length).toBeGreaterThan(0);
    for (const f of comClientId) {
      expect(() => f.executar(repoVazio, {}), `${f.name} não reclamou de clientId ausente`).toThrow();
    }
  });
});
