const { isClient } = require('../modo.cjs');

/**
 * O que roda DEPOIS de um evento virar concluído/reagendado/cancelado:
 * atualizar o dossiê (análise) e o espelho do catálogo de Dados Alvos.
 *
 * Roda no BACKEND, em segundo plano, e é isto que importa aqui: antes o
 * frontend chamava a atualização e ESPERAVA na tela — o modal ficava travado
 * com "Atualizando dossiê..." até a análise (chamada de modelo, mais leitura
 * de xlsx que pode custar ~20s) terminar. Decisão do usuário: "não quero ter
 * que ficar na tela esperando o dossiê atualizar, o dossiê tem que ir
 * atualizando no backend".
 *
 * Sem `await` no caminho da resposta HTTP de propósito, e com o erro apenas
 * logado: isto é trabalho de bastidor. Se falhar, o dado do evento já está
 * salvo e a varredura automática (boot + cron semanal) cobre depois.
 *
 * Só na máquina SERVIDORA (`!isClient`): `AnalisesIA` tem dono único (ver
 * CLAUDE.md, "IA e máquinas cliente"), e o espelho do catálogo depende de ler
 * o arquivo de vendas, que também é papel do servidor.
 */
const EVENTO_RELEVANTE = /conclu|realiz|cancel|reagend/i;

function relevante(status) {
  return EVENTO_RELEVANTE.test(String(status || ''));
}

function dispararPosEvento(repo, clientId, status) {
  if (isClient || !clientId || !relevante(status)) return;

  // `setImmediate` solta o trabalho do ciclo da requisição: a rota responde
  // primeiro, o usuário fecha a tela, e isto segue rodando.
  setImmediate(() => {
    const { gerarAnalisesPendentes } = require('./analisesAutomaticas.cjs');
    Promise.resolve()
      .then(() => gerarAnalisesPendentes({ repo, apenasClientId: clientId }))
      .catch((err) => console.warn(`posEvento: dossiê não atualizou para "${clientId}" — ${err.message}`));

    try {
      const { catalogoDoCliente } = require('../alvos/consulta.cjs');
      catalogoDoCliente(clientId, { aquecer: true });
    } catch (err) {
      console.warn(`posEvento: catálogo de Alvos não atualizou para "${clientId}" — ${err.message}`);
    }
  });
}

module.exports = { dispararPosEvento, relevante, EVENTO_RELEVANTE };
