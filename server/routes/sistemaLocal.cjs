/**
 * "Iniciar com o Windows" — configuração local desta MÁQUINA (não é dado da
 * carteira, não vai pro SQLite/fila — é por isso que fica aqui, fora do
 * domínio normal). Só existe de verdade quando este processo foi subido pelo
 * `.exe` empacotado: `CARTEIRA_LAUNCHER_EXE` é passado pelo launcher
 * (`launcher/index.cjs:subirServidor`) com o caminho do próprio `.exe` — sem
 * ele (dev, ou acessando via Apache/LAN o navegador de outra pessoa), não faz
 * sentido registrar nada no Windows, porque o navegador que fez a requisição
 * não é necessariamente a máquina que deveria iniciar o app.
 *
 * Implementado via `reg.exe` (chave `HKCU\...\Run`) em vez de um módulo nativo
 * de registro — mesma cautela do resto do projeto com dependências que
 * exigem compilação (ver `server/scripts/publicarRelease.cjs` sobre
 * `better-sqlite3`): `reg.exe` já vem com o Windows, zero dependência nova.
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const CHAVE_RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const NOME_VALOR = 'CarteiraWeb';

function caminhoExeAtual() {
  return process.env.CARTEIRA_LAUNCHER_EXE || null;
}

function suportado() {
  return process.platform === 'win32' && Boolean(caminhoExeAtual());
}

/**
 * Caminho gravado hoje na chave `Run`, ou `null` se o valor não existe.
 *
 * `reg query` imprime o valor numa linha do tipo
 * `    CarteiraWeb    REG_SZ    C:\\caminho\\app.exe` — o caminho é o resto da
 * linha depois do tipo, e pode conter espaços (o `Desktop` do usuário
 * frequentemente contém).
 */
function valorRegistrado() {
  try {
    const saida = execFileSync('reg', ['query', CHAVE_RUN, '/v', NOME_VALOR], { encoding: 'utf8', windowsHide: true });
    const m = saida.match(new RegExp(`${NOME_VALOR}\\s+REG_SZ\\s+(.+)`, 'i'));
    return m ? m[1].trim().replace(/^"|"$/g, '') : null;
  } catch {
    return null; // `reg query` sai com código != 0 quando o valor não existe
  }
}

/**
 * `ativo` só é verdade se o valor existe E aponta pra um arquivo que existe.
 *
 * A chave guarda caminho ABSOLUTO do `.exe`. Renomear ou mover o binário
 * (aconteceu: `CarteiraLauncher.exe` -> `2D_Carteira.exe`) deixa a chave
 * apontando pro nada, e a versão anterior desta função respondia "ativo" nesse
 * caso — a tela dizia que iniciava com o Windows enquanto o Windows tentava
 * abrir um arquivo inexistente, sem erro visível pra ninguém.
 */
function estaAtivo() {
  if (!suportado()) return false;
  const valor = valorRegistrado();
  return Boolean(valor) && fs.existsSync(valor);
}

function ativar() {
  const exe = caminhoExeAtual();
  if (!exe) throw new Error('CARTEIRA_LAUNCHER_EXE não definido — não é possível registrar (não é o .exe empacotado).');
  execFileSync('reg', ['add', CHAVE_RUN, '/v', NOME_VALOR, '/t', 'REG_SZ', '/d', exe, '/f'], { stdio: 'ignore' });
}

function desativar() {
  try {
    execFileSync('reg', ['delete', CHAVE_RUN, '/v', NOME_VALOR, '/f'], { stdio: 'ignore' });
  } catch {
    // Já não existia — mesmo resultado observável de "desativado".
  }
}

const express = require('express');
const router = express.Router();

router.get('/iniciar-com-windows', (req, res) => {
  res.json({ suportado: suportado(), ativo: estaAtivo() });
});

router.put('/iniciar-com-windows', (req, res) => {
  if (!suportado()) return res.status(400).json({ error: 'Só é possível configurar isso a partir do .exe local.' });
  try {
    if (req.body.ativo) ativar(); else desativar();
    res.json({ suportado: true, ativo: estaAtivo() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Autocorreção no boot: se a chave `Run` existe mas aponta pra um `.exe` que
 * não existe mais, reescreve com o caminho do `.exe` que está rodando AGORA.
 *
 * Serve o caso de renomear/mover o binário, em que a pessoa perderia o
 * autostart silenciosamente e só recuperaria desligando e religando a opção
 * em Configurações. Chamado por `inicio.cjs` (o entrypoint do app instalado,
 * que é quem tem `CARTEIRA_LAUNCHER_EXE`).
 *
 * Mora aqui, e não no `launcher/`, de propósito: `inicio.cjs` e `server/`
 * viajam na release e se atualizam sozinhos, enquanto o `.exe` precisa ser
 * redistribuído à mão em cada máquina. Deste lado, a correção chega pra quem
 * ainda está com o binário antigo também.
 *
 * Só reescreve o que já estava ativado: quem nunca ligou a opção não passa a
 * ter o app no autostart por causa de uma correção.
 */
function corrigirAutostartQuebrado({
  ler = valorRegistrado,
  existe = fs.existsSync,
  exe = caminhoExeAtual(),
  escrever = ativar,
} = {}) {
  if (!exe) return { corrigido: false, motivo: 'nao-suportado' };
  const valor = ler();
  if (!valor) return { corrigido: false, motivo: 'nao-registrado' };
  if (existe(valor)) return { corrigido: false, motivo: 'ok' };
  // Registro já aponta pro exe atual e nem ele existe: não há nada melhor pra
  // gravar, e reescrever o mesmo valor só esconderia o problema.
  if (valor === exe) return { corrigido: false, motivo: 'proprio-exe-ausente' };
  escrever();
  return { corrigido: true, motivo: 'caminho-obsoleto', de: valor, para: exe };
}

module.exports = router;
module.exports.corrigirAutostartQuebrado = corrigirAutostartQuebrado;
module.exports.valorRegistrado = valorRegistrado;
module.exports.estaAtivo = estaAtivo;
