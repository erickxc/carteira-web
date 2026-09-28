const agendaDominio = require('./agenda.cjs');

/** Assunto fixo do contato criado ao cancelar uma reunião (EventFormModal). */
const ASSUNTO_AVISO = 'Contato ao cancelar reunião pendente';

/**
 * Marca com `motivoContato: 'cancelamento'` os avisos de cancelamento criados
 * antes de o campo existir (reconhecidos pelo assunto fixo). Idempotente: só
 * toca quem ainda está sem a marca. Roda no boot do servidor — não num script
 * manual, porque um backend antigo (sem a coluna) regravaria a tabela Agenda e
 * apagaria a marca.
 */
function marcarAvisosDeCancelamento(repo) {
  const alvo = repo.get('Agenda').filter((e) => e.subject === ASSUNTO_AVISO && e.motivoContato !== 'cancelamento');
  for (const e of alvo) agendaDominio.atualizar(repo, e.id, { motivoContato: 'cancelamento' }, { efeitosExternos: false });
  return alvo.length;
}

function marcarSemQuebrar(repo) {
  try {
    const n = marcarAvisosDeCancelamento(repo);
    if (n > 0) console.log(`Avisos de cancelamento marcados: ${n}`);
  } catch (err) {
    console.warn('Falha ao marcar avisos de cancelamento:', err.message);
  }
}

module.exports = { ASSUNTO_AVISO, marcarAvisosDeCancelamento, marcarSemQuebrar };
