const fs = require('fs');
const path = require('path');
const { SQLITE_DIR, ALVOS_DIR } = require('../config.cjs');
const { caminhoDaEmpresa, lerEAgregar } = require('./leitor.cjs');

/**
 * Cache do agregado por empresa.
 *
 * Existe por um custo medido, não por precaução: ler o xlsx do mock (20,9 MB,
 * 456.785 linhas) leva **18,6 s e 1,5 GB de RSS**; o da Altese (57,2 MB), 10,2 s.
 * O backend é um processo único servindo a LAN inteira — fazer isso dentro de um
 * request travaria o app para todos os usuários e poderia estourar a heap.
 *
 * Fica em `SQLITE_DIR` (LOCALAPPDATA), NUNCA no OneDrive: é derivado, cada
 * máquina reconstrói o seu, e um arquivo de 15 MB reescrito numa pasta
 * sincronizada seria tráfego puro de sincronização sem valor nenhum.
 *
 * Invalidação por `mtime` + `size` do arquivo de origem, mais `VERSAO`: mudar a
 * forma do agregado no código invalida os caches antigos sem ninguém apagar
 * nada à mão (o formato antigo em disco não bate mais com o que o app espera).
 */

const VERSAO = 1;
const CACHE_DIR = process.env.ALVOS_CACHE_DIR || path.join(SQLITE_DIR, 'alvos-cache');

const slug = (nome) => String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa';

const arquivoCache = (empresa) => path.join(CACHE_DIR, `${slug(empresa)}.json`);

function assinatura(caminho) {
  const st = fs.statSync(caminho);
  return { mtimeMs: st.mtimeMs, size: st.size, versao: VERSAO };
}

const mesmaAssinatura = (a, b) => !!a && !!b
  && a.mtimeMs === b.mtimeMs && a.size === b.size && a.versao === b.versao;

/**
 * Agregado da empresa, do cache quando ele está válido.
 * `opts.forcar` reprocessa mesmo com cache válido (para o botão "atualizar").
 */
function agregadoDaEmpresa(empresa, opts = {}) {
  const raiz = opts.raiz || ALVOS_DIR;
  const origem = caminhoDaEmpresa(empresa, raiz);
  if (!fs.existsSync(origem)) {
    throw new Error(`Arquivo de dados não encontrado para "${empresa}".`);
  }
  const atual = assinatura(origem);
  const destino = arquivoCache(empresa);

  if (!opts.forcar) {
    try {
      const salvo = JSON.parse(fs.readFileSync(destino, 'utf8'));
      if (mesmaAssinatura(salvo.assinatura, atual)) return { ...salvo.dados, deCache: true };
    } catch {
      // Cache ausente ou corrompido: reprocessa. Não é erro.
    }
  }

  const dados = lerEAgregar(empresa, raiz);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  // `geradoEm` fica FORA de `dados` a propósito: dentro, mudaria o conteúdo a
  // cada geração e faria qualquer comparação de agregado parecer diferente.
  fs.writeFileSync(destino, JSON.stringify({ assinatura: atual, geradoEm: new Date().toISOString(), dados }), 'utf8');
  return { ...dados, deCache: false };
}

/** Só o estado do cache, sem ler o xlsx — para a tela dizer se está frio. */
function estadoDoCache(empresa, raiz = ALVOS_DIR) {
  const origem = caminhoDaEmpresa(empresa, raiz);
  if (!fs.existsSync(origem)) return { existe: false };
  const atual = assinatura(origem);
  try {
    const salvo = JSON.parse(fs.readFileSync(arquivoCache(empresa), 'utf8'));
    return { existe: true, valido: mesmaAssinatura(salvo.assinatura, atual), geradoEm: salvo.geradoEm };
  } catch {
    return { existe: true, valido: false, geradoEm: null };
  }
}

module.exports = { VERSAO, CACHE_DIR, arquivoCache, agregadoDaEmpresa, estadoDoCache };
