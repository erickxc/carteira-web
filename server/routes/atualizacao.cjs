/**
 * Status de atualização do `.exe`/launcher — pedido explícito do usuário:
 * além da checagem automática que já existe (o launcher se atualiza sozinho
 * a cada abertura, lendo `releases/latest.json`), um jeito de VER isso na
 * interface, com botão manual de "verificar agora".
 *
 * `GET /status` só INFORMA se há versão mais nova. `POST /aplicar` puxa a
 * atualização de fato — sem trocar arquivo nenhum aqui dentro: fecha este
 * processo e reabre o `.exe`, deixando a troca real com o launcher
 * (`launcher/atualizar.cjs`), que já faz isso a cada abertura. Ver
 * `agendarReinicio` abaixo pro porquê de não dar pra trocar em execução.
 *
 * `instalada` vem do `package.json` deste processo — é a única fonte
 * confiável, já que app.cjs sempre roda a partir da pasta que o launcher
 * extraiu (`C:\SistemaCarteira\app`, ou a pasta do projeto em dev/na Karol-2D
 * via Tarefa Agendada, que reflete o código local diretamente).
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const { BACKUP_ONEDRIVE_DIR } = require('../config.cjs');

const RELEASES_DIR = path.join(BACKUP_ONEDRIVE_DIR, 'releases');

/** Mesma lógica de `launcher/atualizar.cjs:versaoMaiorQue` — duplicada de
 * propósito, não importada: este módulo faz parte do que o `.zip` da release
 * distribui (server/), mas `launcher/` não (é só o executável que baixa e
 * extrai o `.zip`) — importar de lá criaria uma dependência de uma pasta que
 * não existe no pacote publicado. É uma função pura de 10 linhas; duplicar é
 * mais simples e seguro do que reestruturar os dois pra compartilhar código. */
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

function lerVersaoInstalada() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  return pkg.version;
}

function lerReleaseDisponivel() {
  try {
    return JSON.parse(fs.readFileSync(path.join(RELEASES_DIR, 'latest.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Aplicar a atualização a partir daqui = sair com um código de saída
 * ESPECIAL (`CODIGO_SAIDA_ATUALIZAR`) — NÃO trocar arquivos por conta
 * própria. Motivo: quem faz a troca (`launcher/atualizar.cjs`) precisa que a
 * pasta `app/` não esteja em uso, e ela ESTÁ (é o `cwd` deste processo — o
 * Windows não deixa renomear a pasta de trabalho de um processo vivo).
 *
 * A primeira versão disto tentava relançar o `.exe` de dentro daqui, com um
 * PowerShell desacoplado (`spawn(..., { detached: true }).unref()`) esperando
 * este processo sair pra então reabrir o launcher. Não sobrevivia: `.exe`
 * empacotado com `pkg` cria um Job Object do Windows pra sua árvore de
 * processos com `KILL_ON_JOB_CLOSE` — quando o launcher (dono do job) sai,
 * o Windows mata TODOS os descendentes ainda vivos, incluindo aquele
 * PowerShell "desacoplado" (bug real, reproduzido e diagnosticado aqui: o
 * `.exe` nunca reabria sozinho). `detached: true` no `spawn` do Node não
 * tira o processo do job do ancestral no Windows.
 *
 * A saída sem essa armadilha: o LAUNCHER (que continua vivo até este
 * servidor sair — é ele quem criou o job, então sobrevive à própria árvore)
 * reconhece este código de saída e reinicia o servidor NO MESMO processo,
 * sem precisar de PowerShell nenhum nem sobreviver a Job Object algum — ver
 * `launcher/index.cjs`.
 *
 * Só existe quando o app foi aberto pelo `.exe` empacotado
 * (`CARTEIRA_LAUNCHER_EXE`, mesmo critério de `server/routes/sistemaLocal.cjs`).
 * Rodando pela pasta do projeto (dev / Tarefa Agendada da máquina servidora),
 * não há `.exe` nem instalação por `.zip` pra trocar — aí a atualização é
 * `git pull` + build, feita fora do app.
 */
function exeDoLauncher() {
  return process.env.CARTEIRA_LAUNCHER_EXE || null;
}

/** Precisa bater com `CODIGO_SAIDA_ATUALIZAR` em `launcher/index.cjs`. */
const CODIGO_SAIDA_ATUALIZAR = 42;

const router = express.Router();

router.get('/status', (req, res) => {
  const instalada = lerVersaoInstalada();
  const release = lerReleaseDisponivel();
  const disponivel = release?.versao ?? null;
  res.json({
    instalada,
    disponivel,
    atualizada: !disponivel || !versaoMaiorQue(disponivel, instalada),
    publicadoEm: release?.publicadoEm ?? null,
    podeAplicar: Boolean(exeDoLauncher()),
  });
});

router.post('/aplicar', (req, res) => {
  const exe = exeDoLauncher();
  if (!exe) {
    return res.status(400).json({
      error: 'Esta instalação não atualiza sozinha: o app não foi aberto pelo .exe local. Atualize pela máquina servidora.',
    });
  }
  const instalada = lerVersaoInstalada();
  const release = lerReleaseDisponivel();
  if (!release?.versao || !versaoMaiorQue(release.versao, instalada)) {
    return res.status(409).json({ error: 'Não há versão mais nova publicada.' });
  }

  res.json({ ok: true, versao: release.versao });
  // Dá tempo da resposta chegar ao navegador antes de o processo morrer — sem
  // isso o front vê "falha de conexão" numa atualização que deu certo. O
  // launcher reconhece este código e reinicia sozinho (ver comentário acima).
  setTimeout(() => process.exit(CODIGO_SAIDA_ATUALIZAR), 1000);
});

module.exports = router;
module.exports.CODIGO_SAIDA_ATUALIZAR = CODIGO_SAIDA_ATUALIZAR;
