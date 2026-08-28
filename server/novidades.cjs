const fs = require('fs');
const path = require('path');

/**
 * Novidades por versão, lidas de `NOVIDADES.md` (fonte única, versionada no
 * git junto do código que ela descreve).
 *
 * Por que um arquivo e não uma constante no código: quem escreve a novidade é
 * quem fez a mudança, no mesmo commit — e o texto é para o USUÁRIO ("atualização
 * mais rápida"), não a mensagem de commit ("prune de deps de frontend no
 * staging"). Arquivo separado deixa isso explícito e fácil de revisar no diff.
 *
 * O `.md` viaja na release (`publicarRelease.cjs`), então o app instalado
 * consegue mostrar as novidades da versão que ele mesmo está rodando, sem
 * depender de rede.
 */

const RAIZ = path.join(__dirname, '..');

/** Parser mínimo: `## <versão>` abre uma seção, `- item` é um bullet. */
function parsear(markdown) {
  const secoes = {};
  let atual = null;
  for (const linha of String(markdown).split('\n')) {
    const cabecalho = linha.match(/^##\s+(\d+\.\d+\.\d+)\s*$/);
    if (cabecalho) {
      atual = cabecalho[1];
      secoes[atual] = [];
      continue;
    }
    if (!atual) continue;
    const item = linha.match(/^-\s+(.*)$/);
    if (item) {
      secoes[atual].push(item[1].trim());
    } else if (/^\s+\S/.test(linha) && secoes[atual].length) {
      // Continuação de um bullet quebrado em várias linhas (o `.md` é
      // formatado em 80 colunas) — junta no item anterior.
      secoes[atual][secoes[atual].length - 1] += ` ${linha.trim()}`;
    }
  }
  return secoes;
}

function lerTodas(raiz = RAIZ) {
  try {
    return parsear(fs.readFileSync(path.join(raiz, 'NOVIDADES.md'), 'utf8'));
  } catch {
    return {}; // sem arquivo (instalação antiga): a tela simplesmente não mostra nada
  }
}

/**
 * Novidades de UMA versão. `[]` quando a versão não tem seção — o normal pra
 * release sem mudança visível ao usuário, e o motivo de a tela esconder o
 * bloco em vez de mostrar "nenhuma novidade".
 */
function novidadesDaVersao(versao, raiz = RAIZ) {
  if (!versao) return [];
  return lerTodas(raiz)[versao] ?? [];
}

module.exports = { novidadesDaVersao, lerTodas, parsear };
