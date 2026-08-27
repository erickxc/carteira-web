const fs = require('fs');
const path = require('path');
const { PONTEIRO_INSTALL, PASTA_PADRAO_SUGERIDA } = require('./config.cjs');

function lerPastaConfigurada() {
  try {
    const salva = fs.readFileSync(PONTEIRO_INSTALL, 'utf8').trim();
    return salva || null;
  } catch {
    return null;
  }
}

function salvarPastaConfigurada(pasta) {
  fs.mkdirSync(path.dirname(PONTEIRO_INSTALL), { recursive: true });
  fs.writeFileSync(PONTEIRO_INSTALL, pasta, 'utf8');
}

/**
 * Na primeira execução (sem pasta configurada ainda), cria automaticamente a
 * pasta padrão — direto na raiz do `C:\`, não uma pasta funda em AppData:
 * evita o pacote (node_modules + Node portátil) esbarrar no limite de
 * caminho longo do Windows, e é fácil de achar se alguém precisar. Não
 * pergunta nada: um `.exe` clicado por alguém não técnico não pode depender
 * de uma janela de console aparecer certo pra ler `stdin` — só avisa onde
 * ficou instalado. A escolha é gravada em `PONTEIRO_INSTALL`, fora da
 * própria pasta de instalação, e reaproveitada nas execuções seguintes.
 */
function obterPastaInstalacao() {
  const salva = lerPastaConfigurada();
  if (salva) return salva;

  const pasta = PASTA_PADRAO_SUGERIDA;
  salvarPastaConfigurada(pasta);
  console.log(`Primeira execução — instalando em: ${pasta}`);
  return pasta;
}

module.exports = { obterPastaInstalacao, lerPastaConfigurada, salvarPastaConfigurada };
