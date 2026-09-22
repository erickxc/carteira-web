/**
 * Empacota `extensao-price-login/` (extensão Chrome de acesso rápido a
 * Price/BI) num .zip dentro de `public/` — de lá o Vite copia pra `dist/`
 * como qualquer outro asset estático (favicon, ícones PWA), e o Apache serve
 * direto em produção sem passar pelo backend Node (mesmo caminho de
 * `DocumentRoot`/proxy já documentado no CLAUDE.md). Card de instalação em
 * Configurações → Sistema (`ExtensaoAcessosCard.tsx`) linka pra esse arquivo.
 *
 * Rodar de novo depois de qualquer mudança em `extensao-price-login/` —
 * mesmo critério de `gerarIconesPwa.cjs` pro SVG do logotipo.
 *
 * Uso: node scripts/gerarZipExtensao.cjs
 */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const RAIZ = path.join(__dirname, '..');
const PASTA_EXTENSAO = path.join(RAIZ, 'extensao-price-login');
const DESTINO = path.join(RAIZ, 'public', 'extensao-2d-acessos.zip');

function main() {
  if (!fs.existsSync(PASTA_EXTENSAO)) throw new Error(`Pasta não encontrada: ${PASTA_EXTENSAO}`);
  const zip = new AdmZip();
  // Pasta única dentro do zip (não solto os arquivos na raiz): ao extrair,
  // "Carregar sem compactação" no Chrome espera apontar pra uma pasta — com
  // os arquivos soltos, extrair no Downloads bagunçaria a pasta do usuário.
  zip.addLocalFolder(PASTA_EXTENSAO, '2D Acessos');
  zip.writeZip(DESTINO);
  console.log(`Gerado: ${DESTINO}`);
}

main();
