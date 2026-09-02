import type { ReactNode } from 'react';
import { extrairLinkUpload, separarBlocos } from './blocosMarkdown';
import { urlAnexo } from '../../api/client';

/**
 * Renderiza a resposta do monitorIA. Antes o chat imprimia `{m.content}` como
 * texto puro e os modelos devolvem markdown — o usuário via `**Loja X**` e
 * linhas cheias de asterisco no meio da resposta.
 *
 * É um renderizador MÍNIMO e proposital: cobre só o que os modelos de fato
 * emitem aqui (negrito, itálico, `código`, bullets, listas numeradas, títulos
 * curtos) e ignora o resto do markdown. Duas razões pra não usar biblioteca:
 * o projeto não tem dependência de markdown, e — mais importante — o texto vem
 * de um LLM, então nada aqui pode virar HTML. Este código monta elementos
 * React; não existe `dangerouslySetInnerHTML`, então não há superfície de
 * injeção mesmo se o modelo devolver `<script>`.
 *
 * O que NÃO é tratado (de propósito, porque não aparece na prática e cada caso
 * a mais é código pra manter): tabelas, blocos de código com cerca, citações,
 * aninhamento de lista. Link virou exceção (ver abaixo) só pro caso concreto
 * de `gerar_ata_pdf` devolver uma URL pro monitor abrir — não é link genérico
 * pra qualquer coisa que o modelo decida inventar.
 */

// Negrito/itálico/código/link inline, numa passada só. A ordem importa: `**`
// antes de `*` (senão o negrito é lido como dois itálicos), e o link antes
// dos dois (o texto dentro de `[...]` pode ter negrito/itálico).
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;

function formatarInline(texto: string, chaveBase: string): ReactNode[] {
  return texto.split(INLINE).filter(Boolean).map((parte, i) => {
    const chave = `${chaveBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(parte) || /^__[^_]+__$/.test(parte)) {
      return <strong key={chave}>{parte.slice(2, -2)}</strong>;
    }
    if (/^`[^`]+`$/.test(parte)) {
      return <code key={chave} className="px-1 rounded-sm text-[0.95em]" style={{ background: 'var(--card-hover)' }}>{parte.slice(1, -1)}</code>;
    }
    if (/^\*[^*]+\*$/.test(parte)) {
      return <em key={chave}>{parte.slice(1, -1)}</em>;
    }
    // `urlAnexo` (não a URL relativa crua): em dev o front roda em porta
    // separada do backend (5173 vs 3011) — um `href` relativo abriria contra
    // a porta do Vite, que não serve `/uploads`. Mesma função que o resto do
    // app já usa pra anexos de evento.
    const link = extrairLinkUpload(parte);
    if (link) {
      return <a key={chave} href={urlAnexo(link.arquivo)} target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent)' }}>{link.rotulo}</a>;
    }
    return <span key={chave}>{parte}</span>;
  });
}

export default function RespostaIA({ texto }: { texto: string }) {
  const blocos = separarBlocos(texto);

  return (
    <div className="flex flex-col gap-2">
      {blocos.map((bloco, i) => {
        if (bloco.tipo === 'titulo') {
          return <strong key={i} className="text-[0.9rem]">{formatarInline(bloco.texto, `t${i}`)}</strong>;
        }
        if (bloco.tipo === 'lista') {
          const Tag = bloco.ordenada ? 'ol' : 'ul';
          return (
            <Tag key={i} className={`m-0 pl-[1.1rem] flex flex-col gap-1 ${bloco.ordenada ? 'list-decimal' : 'list-disc'}`}>
              {bloco.itens.map((item, j) => <li key={j}>{formatarInline(item, `l${i}-${j}`)}</li>)}
            </Tag>
          );
        }
        // Linhas do mesmo parágrafo viram quebras de linha, não parágrafos
        // separados: o modelo costuma quebrar linha dentro de uma ideia só.
        return (
          <p key={i} className="m-0">
            {bloco.linhas.map((linha, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {formatarInline(linha, `p${i}-${j}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
