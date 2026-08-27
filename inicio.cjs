/**
 * Ponto de entrada do app INSTALADO (`C:\SistemaCarteira\app\inicio.cjs`) —
 * é isto que o `2D_Carteira.exe` executa, não mais o `server.cjs` direto.
 *
 * Por que existe: tudo que mora aqui viaja dentro do `.zip` da release, ou
 * seja, **é corrigido com um `publicarRelease` e chega sozinho em todo mundo**.
 * O que ficasse dentro do `.exe` exigiria recompilar e redistribuir o binário
 * pra cada pessoa a cada correção — o que na prática não acontece. Por isso o
 * `.exe` foi reduzido a um stub (achar a instalação, atualizar pelo `.zip`,
 * chamar este arquivo) e todo o resto do comportamento de inicialização veio
 * pra cá.
 *
 * A tela de carregamento NÃO é aberta aqui: o stub já a abriu antes de
 * atualizar (a atualização pode levar um minuto, e a pessoa precisa ver algo
 * nesse meio tempo). Rodando este arquivo na mão (sem o launcher), passe
 * `CARTEIRA_ABRIR_TELA=1` pra abrir também.
 */
const path = require('path');
const fs = require('fs');
const { abrirBandeja } = require('./server/bandeja.cjs');

const PORTA = Number(process.env.PORT) || 3011;

function iconeDoApp() {
  const candidato = path.join(__dirname, 'icone.ico');
  return fs.existsSync(candidato) ? candidato : null;
}

if (process.env.CARTEIRA_ABRIR_TELA === '1') {
  const { abrirTelaCarregando } = require('./server/telaCarregando.cjs');
  abrirTelaCarregando(PORTA, process.env.CARTEIRA_LOG || null);
}

abrirBandeja({ porta: PORTA, icone: iconeDoApp(), log: (m) => console.log(m) });

// Conserta o autostart quando o `.exe` foi renomeado/movido — a chave `Run`
// guarda caminho absoluto e ficaria apontando pro nada, sem erro visível (ver
// `server/routes/sistemaLocal.cjs`). Roda aqui, no boot do app instalado, que
// é onde `CARTEIRA_LAUNCHER_EXE` existe. Falha aqui nao pode derrubar o boot:
// autostart é conveniência, servidor é o essencial.
try {
  const { corrigirAutostartQuebrado } = require('./server/routes/sistemaLocal.cjs');
  const r = corrigirAutostartQuebrado();
  if (r.corrigido) console.log(`Autostart corrigido: ${r.de} -> ${r.para}`);
} catch (err) {
  console.log(`Autostart: nao foi possivel verificar (${err.message})`);
}

// Sobe o servidor no MESMO processo (não um filho): o PID que a bandeja vigia
// e mata no "Sair" precisa ser o do servidor de verdade.
require('./server.cjs');
