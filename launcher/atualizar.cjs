const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/** Compara duas versões "x.y.z" numericamente por segmento (não usa semver
 * completo de propósito — só precisamos saber "é mais nova ou não"). */
function versaoMaiorQue(a, b) {
  const pa = String(a || '0.0.0').split('.').map(Number);
  const pb = String(b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na > nb;
  }
  return false;
}

function lerVersaoInstalada(versaoArquivoPath) {
  try { return fs.readFileSync(versaoArquivoPath, 'utf8').trim(); } catch { return '0.0.0'; }
}

function precisaAtualizar(versaoInstalada, versaoDisponivel) {
  return versaoMaiorQue(versaoDisponivel, versaoInstalada);
}

// No Windows, EBUSY/EPERM/EACCES ao renomear ou apagar pasta costumam ser
// passageiros: antivírus verificando os arquivos novos, indexador, Explorer
// aberto na pasta, o processo do servidor que acabou de sair ainda soltando
// arquivos. Tentar de novo por alguns segundos resolve a maioria.
const CODIGOS_PASSAGEIROS = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY']);
const ESPERAS_MS = [200, 400, 800, 1600, 3200];

const DICAS = {
  EBUSY: 'arquivo em uso por outro programa (antivírus, Explorer aberto na pasta ou a Carteira ainda fechando)',
  EPERM: 'o Windows negou a operação (arquivo em uso, somente leitura ou bloqueado pelo antivírus)',
  EACCES: 'sem permissão na pasta (arquivo em uso ou bloqueado pelo antivírus)',
  ENOTEMPTY: 'a pasta ainda tem arquivos em uso',
  ENOSPC: 'disco cheio',
  ENOENT: 'arquivo não encontrado (o OneDrive pode ainda estar baixando a atualização)',
  ENAMETOOLONG: 'caminho de arquivo longo demais para o Windows',
  EMFILE: 'arquivos abertos demais ao mesmo tempo',
  UNKNOWN: 'erro do Windows ao ler o arquivo (se ele estiver "só na nuvem" no OneDrive, pode ter falhado ao baixar)',
};

// adm-zip lança erros sem `code`; reconhece pela mensagem.
const ZIP_INVALIDO = /zip format|END header|CRC32|invalid|unsupported|corrupt/i;
const DICA_ZIP_INVALIDO = 'zip incompleto ou corrompido (o OneDrive pode não ter terminado de sincronizar)';

function descreverErro(err) {
  const codigo = err && err.code ? String(err.code) : undefined;
  const mensagem = (err && err.message) || String(err);
  let dica = codigo ? DICAS[codigo] : undefined;
  if (!dica && ZIP_INVALIDO.test(mensagem)) dica = DICA_ZIP_INVALIDO;
  return { codigo, detalhe: dica ? `${dica} — ${mensagem}` : mensagem };
}

function falha(etapa, err, contexto, avisos) {
  const { codigo, detalhe } = descreverErro(err);
  return { ok: false, etapa, codigo, erro: `${contexto}: ${detalhe}`, avisos };
}

// Espera síncrona: o launcher faz tudo isto antes de subir o servidor, não há UI a travar.
function dormirSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function comRetentativa(operacao, dormir) {
  for (let i = 0; ; i++) {
    try {
      return operacao();
    } catch (err) {
      if (!CODIGOS_PASSAGEIROS.has(err && err.code) || i >= ESPERAS_MS.length) throw err;
      dormir(ESPERAS_MS[i]);
    }
  }
}

/** Confere a pasta extraída ANTES de mexer na instalação: um zip "válido"
 * pode vir sem o servidor, ou ser o de outra versão (OneDrive entregando o
 * arquivo antigo enquanto o `latest.json` já anuncia o novo). */
function validarExtracao(fsImpl, pastaExtraida, novaVersao) {
  const temEntrada = ['inicio.cjs', 'server.cjs'].some((f) => fsImpl.existsSync(path.join(pastaExtraida, f)));
  if (!temEntrada) return 'a atualização não contém inicio.cjs nem server.cjs';
  const pkgPath = path.join(pastaExtraida, 'package.json');
  if (fsImpl.existsSync(pkgPath)) {
    const { version } = JSON.parse(fsImpl.readFileSync(pkgPath, 'utf8'));
    if (version && version !== novaVersao) return `o zip é da versão ${version}, mas era esperada a ${novaVersao}`;
  }
  return null;
}

/**
 * Extrai `zipPath` numa pasta temporária, confere o conteúdo e só então faz a
 * troca (`rename`) por `appDir` — nunca escreve direto em `appDir`. Toda falha
 * devolve `{ ok: false, etapa, codigo, erro }`, com a etapa exata e uma dica em
 * português; nada é engolido em silêncio. Problemas que não impedem a
 * atualização (sobra de pasta que não deu pra apagar, por exemplo) vão em `avisos`.
 *
 * `opcoes` existe para os testes simularem falhas do Windows.
 */
function aplicarAtualizacao({ appDir, zipPath, novaVersao, versaoArquivoPath }, opcoes = {}) {
  const fsImpl = opcoes.fs || fs;
  const dormir = opcoes.dormir || dormirSync;
  const tmpDir = `${appDir}-novo`;
  const oldDir = `${appDir}-antigo`;
  const avisos = [];

  const apagar = (alvo) => {
    if (fsImpl.existsSync(alvo)) comRetentativa(() => fsImpl.rmSync(alvo, { recursive: true, force: true }), dormir);
  };
  const limparTmp = () => {
    try {
      apagar(tmpDir);
    } catch (err) {
      avisos.push(`não foi possível apagar ${tmpDir}: ${descreverErro(err).detalhe}`);
    }
  };

  // 1. Sobra de uma tentativa anterior.
  try {
    apagar(tmpDir);
  } catch (err) {
    return falha('limpeza-previa', err, `Não foi possível apagar a pasta temporária de uma tentativa anterior (${tmpDir})`, avisos);
  }

  // 2. Abrir o zip (0 bytes = placeholder do OneDrive ou cópia interrompida).
  let zip;
  try {
    if (fsImpl.statSync(zipPath).size === 0) {
      return { ok: false, etapa: 'leitura-zip', erro: `Não foi possível abrir ${zipPath}: ${DICA_ZIP_INVALIDO} — o arquivo tem 0 bytes`, avisos };
    }
    zip = new AdmZip(zipPath);
  } catch (err) {
    return falha('leitura-zip', err, `Não foi possível abrir ${zipPath}`, avisos);
  }

  // 3. Extrair.
  try {
    zip.extractAllTo(tmpDir, true);
  } catch (err) {
    limparTmp();
    return falha('extracao', err, `Falha ao extrair a atualização em ${tmpDir}`, avisos);
  }

  // 4. Conferir o que foi extraído.
  let problema;
  try {
    problema = validarExtracao(fsImpl, tmpDir, novaVersao);
  } catch (err) {
    problema = `package.json ilegível (${descreverErro(err).detalhe})`;
  }
  if (problema) {
    limparTmp();
    return { ok: false, etapa: 'validacao', erro: `Atualização recusada: ${problema}. A instalação atual não foi alterada.`, avisos };
  }

  // 5. Sobra da pasta -antigo de uma troca anterior.
  try {
    apagar(oldDir);
  } catch (err) {
    limparTmp();
    return falha('limpeza-previa', err, `Não foi possível apagar a sobra ${oldDir} de uma atualização anterior`, avisos);
  }

  // 6. Tirar a instalação atual do caminho.
  const tinhaInstalacao = fsImpl.existsSync(appDir);
  if (tinhaInstalacao) {
    try {
      comRetentativa(() => fsImpl.renameSync(appDir, oldDir), dormir);
    } catch (err) {
      limparTmp();
      return falha('troca', err, `Não foi possível mover a instalação atual (${appDir}) para ${oldDir}; nada foi alterado`, avisos);
    }
  }

  // 7. Colocar a nova no lugar; se falhar, devolver a anterior.
  try {
    comRetentativa(() => fsImpl.renameSync(tmpDir, appDir), dormir);
  } catch (errTroca) {
    const motivo = descreverErro(errTroca).detalhe;
    if (tinhaInstalacao) {
      try {
        comRetentativa(() => fsImpl.renameSync(oldDir, appDir), dormir);
      } catch (errRestauracao) {
        // Pior caso: ficou sem pasta de app. Dizer exatamente onde está a anterior.
        return {
          ok: false,
          etapa: 'restauracao',
          codigo: errRestauracao.code,
          erro: `Falha ao instalar a nova versão (${motivo}) e também ao restaurar a anterior (${descreverErro(errRestauracao).detalhe}). `
            + `A instalação anterior está intacta em ${oldDir}: renomeie essa pasta de volta para ${appDir}.`,
          avisos,
        };
      }
    }
    limparTmp();
    return { ok: false, etapa: 'troca', codigo: errTroca.code, erro: `Falha ao colocar a nova versão em ${appDir}: ${motivo}. A instalação anterior foi mantida.`, avisos };
  }

  // 8. A nova versão JÁ está instalada: nada abaixo desfaz isso nem vira falha.
  try {
    fsImpl.writeFileSync(versaoArquivoPath, novaVersao, 'utf8');
  } catch (err) {
    avisos.push(`versão ${novaVersao} instalada, mas não foi possível gravar ${versaoArquivoPath} (${descreverErro(err).detalhe}); a próxima abertura vai reinstalar`);
  }
  try {
    apagar(oldDir);
  } catch (err) {
    avisos.push(`não foi possível apagar a versão anterior em ${oldDir} (${descreverErro(err).detalhe}); ela será removida na próxima atualização`);
  }

  return { ok: true, avisos };
}

module.exports = { versaoMaiorQue, precisaAtualizar, lerVersaoInstalada, aplicarAtualizacao };
