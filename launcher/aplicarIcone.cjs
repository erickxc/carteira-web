/**
 * Prepara um binário-base do Node **com o ícone do app**, para o `pkg` usar no
 * lugar do base padrão dele. É assim que o `.exe` do launcher ganha o ícone da
 * 2D em vez do ícone do Node.
 *
 * Três coisas aqui são consequência de tentativa e erro, não preferência:
 *
 * 1. **O ícone entra no binário-base, nunca no `.exe` pronto.** O `pkg` anexa o
 *    payload (o código do launcher) DEPOIS do fim da imagem PE. Reescrever
 *    recursos regenera o PE e muda o tamanho do arquivo, o que descarta esse
 *    payload — o binário fica com cara de válido e morre ao rodar com
 *    "Pkg: Error reading from file.". Aconteceu de verdade aqui com `rcedit`, e
 *    é o motivo de o `.exe` ter ficado tanto tempo com o ícone do Node.
 *    (`marcarComoGui.cjs` é diferente: troca 2 bytes no lugar, sem mudar
 *    tamanho, então aquele é seguro no `.exe` pronto.)
 *
 * 2. **Não editamos o base dentro de `~/.pkg-cache`.** O `pkg-fetch` confere o
 *    SHA do arquivo cacheado e, se não bater, apaga e baixa de novo — logando
 *    "Binary hash does NOT match. Re-fetching...". O build passava "verde" com
 *    o ícone do Node de volta. Além disso o cache é compartilhado com outros
 *    projetos que usem `pkg`.
 *
 * 3. **`PKG_NODE_PATH` é o mecanismo suportado.** Com ela definida, o
 *    `pkg-fetch` usa o caminho indicado como base E pula a verificação de hash
 *    (`lib-es5/places.js:20` e `lib-es5/index.js:124`). Então a receita é:
 *    copiar o base limpo pra fora do cache, aplicar o ícone na cópia, e apontar
 *    `PKG_NODE_PATH` pra ela. O cache fica intocado.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ResEdit = require('resedit');

// Idioma dos recursos: 1033 (en-US) é o neutro que praticamente todo binário
// Windows usa; o Explorer não olha o idioma pra escolher o ícone.
const LANG = 1033;
// ID 1: é o grupo que o Windows usa como ícone principal do programa.
const ID_GRUPO_PRINCIPAL = 1;

/**
 * Acha o binário-base que o `pkg` usa pro `target`. Busca por padrão em vez de
 * caminho fixo: a pasta de versão (`v3.6`) e a versão exata do Node
 * (`fetched-v22.23.2-win-x64`) são detalhes internos do `pkg`, que mudam quando
 * ele é atualizado. Pega o mais recente quando há vários.
 */
function localizarBase(target = 'node22-win-x64') {
  const cacheDir = process.env.PKG_CACHE_PATH || path.join(os.homedir(), '.pkg-cache');
  if (!fs.existsSync(cacheDir)) return null;

  const [, plataforma, arco] = target.split('-'); // node22-win-x64 -> win, x64
  const sufixo = `${plataforma}-${arco}`;

  const encontrados = [];
  for (const versaoDir of fs.readdirSync(cacheDir)) {
    const dir = path.join(cacheDir, versaoDir);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const nome of fs.readdirSync(dir)) {
      if (!nome.startsWith('fetched-') || !nome.endsWith(sufixo)) continue;
      const completo = path.join(dir, nome);
      encontrados.push({ completo, mtime: fs.statSync(completo).mtimeMs });
    }
  }
  if (!encontrados.length) return null;
  encontrados.sort((a, b) => b.mtime - a.mtime);
  return encontrados[0].completo;
}

/** Grupos de ícone de um PE, com quantas imagens (resoluções) cada um tem. */
function gruposDeIcone(caminhoExe) {
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(caminhoExe), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  return ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)
    .map((g) => ({ id: g.id, imagens: g.icons.length }));
}

/**
 * Copia o base limpo pra `destino` e grava nele os ícones do `.ico`.
 * Devolve `{ pronto, caminho }` — `caminho` é o que vai em `PKG_NODE_PATH`.
 *
 * Falha de forma suave (`pronto: false` + motivo) em vez de derrubar o build:
 * um `.exe` com ícone errado é um problema cosmético, não vale bloquear a
 * geração do binário por causa dele. Quem chama loga o motivo.
 */
function prepararBaseComIcone({ target = 'node22-win-x64', ico, destino } = {}) {
  if (process.platform !== 'win32') return { pronto: false, motivo: 'nao-windows' };
  if (!ico || !fs.existsSync(ico)) return { pronto: false, motivo: `ico-ausente (${ico})` };

  const base = localizarBase(target);
  if (!base) return { pronto: false, motivo: 'base-do-pkg-nao-encontrada-no-cache' };

  const arquivoIco = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
  if (!arquivoIco.icons.length) return { pronto: false, motivo: 'ico-sem-imagens' };

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(base), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    ID_GRUPO_PRINCIPAL,
    LANG,
    arquivoIco.icons.map((i) => i.data),
  );
  res.outputResource(exe);
  fs.writeFileSync(destino, Buffer.from(exe.generate()));

  return { pronto: true, caminho: destino, base, imagens: arquivoIco.icons.length };
}

module.exports = { prepararBaseComIcone, localizarBase, gruposDeIcone, ID_GRUPO_PRINCIPAL };
