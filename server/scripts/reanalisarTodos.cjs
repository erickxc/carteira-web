/**
 * Reanálise em LOTE: reconstrói o dossiê e a análise de risco de todos os
 * clientes a partir das atas, no formato atual do prompt.
 *
 * Serve pra quando o FORMATO do dossiê muda (template/regras em
 * `analiseCliente.cjs`): os dossiês já gravados continuam no formato antigo
 * até o cliente ter um evento novo, porque a análise automática só reprocessa
 * o que mudou. Aqui `forcar` ignora isso e relê o histórico relevante inteiro.
 *
 * Roda À MÃO (`node server/scripts/reanalisarTodos.cjs`), nunca no boot:
 * - é 1 chamada de LLM POR CLIENTE (custo real, ~US$ 0,05 e ~50s cada);
 * - sobrescreve dossiê e análise de todo mundo (irreversível sem o backup).
 *
 * Decisões que valem manter:
 * - UMA chamada de `gerarAnalisesPendentes` por cliente, não uma pro lote
 *   inteiro: aquela função só faz `repo.save('AnalisesIA')` no fim do laço,
 *   então uma falha no meio deixaria dossiês (salvos por cliente) atualizados
 *   e as análises não. Por cliente, cada salvamento é atômico.
 * - Backup antes de qualquer escrita: os dossiês são arquivos sem versão
 *   nenhuma e a análise antiga é sobrescrita.
 * - Aborta após 3 falhas consecutivas: se a credencial expirou ou a cota
 *   estourou, não faz sentido queimar as outras 50 tentativas.
 *
 * Flags: `--dry-run` (só lista), `--ativos` (só clientes ativos),
 *        `--limite=N` (processa no máximo N — útil pra validar o formato
 *        em 1-2 clientes antes de rodar tudo).
 */
const fs = require('fs');
const path = require('path');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { gerarAnalisesPendentes, EVENTO_RELEVANTE } = require('../ia/analisesAutomaticas.cjs');
const { DOSSIES_DIR, DATA_DIR } = require('../config.cjs');

const seco = process.argv.includes('--dry-run');
const soAtivos = process.argv.includes('--ativos');
const limiteArg = process.argv.find((a) => a.startsWith('--limite='));
const limite = limiteArg ? Number(limiteArg.split('=')[1]) : Infinity;

/** Mesma regra de `isClienteAtivo` (src/utils/formatters.ts). */
function clienteAtivo(c) {
  const status = String(c.status || '').trim();
  if (c.estado) return /^ativo$/i.test(String(c.estado).trim()) && /^(ativo|regular|gratuidade)?$/i.test(status);
  return /^(ativ|gratuidade)/i.test(status);
}

/** Copia dossiês + análises pra uma pasta com timestamp, antes de sobrescrever. */
function backup(repo) {
  const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = path.join(DATA_DIR, 'backups-dossies', marca);
  fs.mkdirSync(destino, { recursive: true });

  let arquivos = 0;
  if (fs.existsSync(DOSSIES_DIR)) {
    for (const nome of fs.readdirSync(DOSSIES_DIR)) {
      const origem = path.join(DOSSIES_DIR, nome);
      if (fs.statSync(origem).isFile()) {
        fs.copyFileSync(origem, path.join(destino, nome));
        arquivos++;
      }
    }
  }
  fs.writeFileSync(path.join(destino, '_AnalisesIA.json'), JSON.stringify(repo.get('AnalisesIA'), null, 2), 'utf8');
  return { destino, arquivos };
}

async function main() {
  const repo = repoPlanilha();
  const clientes = repo.get('Clientes');
  const agenda = repo.get('Agenda');

  const temAta = (id) => agenda.some((a) => String(a.clientId) === String(id) && EVENTO_RELEVANTE.test(a.status || ''));

  const alvos = clientes
    .filter((c) => (soAtivos ? clienteAtivo(c) : true))
    // Cliente sem nenhum evento relevante não gera análise (a própria função
    // pula) — não entra na conta pra não parecer que falhou.
    .filter((c) => temAta(c.id))
    .slice(0, limite);

  console.log(`Clientes: ${clientes.length} no total, ${alvos.length} com histórico pra reanalisar${soAtivos ? ' (só ativos)' : ''}.`);
  console.log(`Estimativa: ~${Math.round(alvos.length * 50 / 60)} min e ~US$ ${(alvos.length * 0.05).toFixed(2)} (1 chamada de LLM por cliente).\n`);

  if (seco) {
    alvos.forEach((c, i) => console.log(`${String(i + 1).padStart(3)}. ${c.empresa}`));
    console.log('\nDry-run: nada foi alterado.');
    return;
  }

  const { destino, arquivos } = backup(repo);
  console.log(`Backup: ${arquivos} dossiê(s) + AnalisesIA em\n  ${destino}\n`);

  let ok = 0;
  let vazios = 0;
  const falhas = [];
  let consecutivas = 0;
  const t0 = Date.now();

  for (const [i, cliente] of alvos.entries()) {
    const prefixo = `[${String(i + 1).padStart(3)}/${alvos.length}] ${cliente.empresa}`;
    const inicio = Date.now();
    try {
      const processados = await gerarAnalisesPendentes({ repo, apenasClientId: cliente.id, forcar: true });
      const seg = Math.round((Date.now() - inicio) / 1000);
      if (processados > 0) {
        ok++;
        consecutivas = 0;
        console.log(`${prefixo} — ok (${seg}s)`);
      } else {
        vazios++;
        console.log(`${prefixo} — sem alteração (${seg}s)`);
      }
    } catch (err) {
      falhas.push({ empresa: cliente.empresa, erro: err.message });
      consecutivas++;
      console.warn(`${prefixo} — FALHA: ${err.message}`);
      if (consecutivas >= 3) {
        console.error('\n3 falhas consecutivas — abortando (credencial/cota?). Nada além daqui foi tocado.');
        break;
      }
    }
  }

  console.log(`\nConcluído em ${Math.round((Date.now() - t0) / 60000)} min: ${ok} reanalisado(s), ${vazios} sem alteração, ${falhas.length} falha(s).`);
  if (falhas.length) {
    console.log('Falhas:');
    falhas.forEach((f) => console.log(`  - ${f.empresa}: ${f.erro}`));
  }
  console.log(`\nBackup do estado anterior: ${destino}`);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
