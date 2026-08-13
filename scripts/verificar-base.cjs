const fs = require('fs');
const os = require('os');
const path = require('path');

const RELATIVE_BASE = path.join(
  '01 - Marco + Monitores',
  '6 - Erick',
  'Carteira Web',
  'database_dev.xlsx'
);

const candidatos = [
  path.join('C:\\Users\\Kerol\\OneDrive - 2dconsultores.com.br', RELATIVE_BASE),
  process.env.OneDriveCommercial && path.join(process.env.OneDriveCommercial, RELATIVE_BASE),
  process.env.OneDrive && path.join(process.env.OneDrive, RELATIVE_BASE),
  path.join(os.homedir(), 'OneDrive - 2dconsultores.com.br', RELATIVE_BASE),
].filter(Boolean);

const unicos = [...new Set(candidatos)];
console.log('Máquina:', os.hostname());
console.log('Pasta do usuário:', os.homedir());
console.log('Caminhos testados:');

let encontrado = false;
for (const arquivo of unicos) {
  try {
    const stat = fs.statSync(arquivo);
    if (!stat.isFile()) continue;
    encontrado = true;
    console.log(`OK  ${arquivo}`);
    console.log(`    Tamanho: ${stat.size} bytes | Modificado: ${stat.mtime.toISOString()}`);
  } catch {
    console.log(`--  não encontrado: ${arquivo}`);
  }
}

if (!encontrado) {
  console.error('\nBase não encontrada nesta máquina.');
  console.error('Verifique se o OneDrive está instalado e se a pasta está sincronizada localmente.');
  process.exitCode = 1;
} else {
  console.log('\nBase encontrada.');
}
