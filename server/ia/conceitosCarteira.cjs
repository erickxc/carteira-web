/**
 * Glossário de conceitos da Carteira que já causaram confusão real — do
 * agente (bug real: "quantos clientes ativos" contava só pelo campo bruto
 * `estado`, ignorando `status`/pausa) ou do usuário (perguntou a diferença
 * entre "Cobertura da Carteira" e "Saúde da Carteira" no mesmo dia).
 *
 * Só os pontos com histórico de confusão — não é uma cópia do CLAUDE.md.
 * Consumido por `explicar_conceito_carteira` (`server/ia/tools.cjs`): cada
 * definição aqui é combinada com um recorte de dado REAL da carteira antes
 * de virar pergunta pro modelo, pra explicação nunca ser só teoria solta.
 */
const CONCEITOS = {
  cliente_ativo: 'Um cliente só é "ativo" se passar em TRÊS checagens ao mesmo tempo: (1) campo Estado = "Ativo"; (2) campo Status numa situação de atendimento de verdade (Regular ou Gratuidade — Suspenso, Atendido pelo Marco e Problemas Externos NÃO contam, mesmo com Estado=Ativo); (3) sem pausa temporária vigente (pausadoAte no futuro ou hoje). Falhou em qualquer uma das três, conta como inativo. Nunca confiar só no campo Estado sozinho.',

  atendimento_vs_cliente: '"Atendimento" conta por LOJA — cada linha de cadastro é um atendimento, mesmo que várias lojas sejam da mesma rede (ex.: "Altese - Recreio" e "Altese - GM Ford Fiat VW" são 2 atendimentos). "Cliente" (contagem única) agrupa por rede (campo `grupo`): a rede Altese inteira conta como 1 cliente da 2D, não 2. Loja sem `grupo` conta como cliente próprio de qualquer forma.',

  cadencia: 'Cada serviço contratado (Monitoria, Precificação/Price) tem um prazo configurável em dias (hoje: Monitoria e Price a cada 30 dias) — passado esse prazo desde o último toque (reunião, relatório ou ação concluída daquele serviço), o cliente fica "vencido"; a poucos dias do prazo, "vencendo"; sem nunca ter tido um toque, "nunca atendido". Cliente com o serviço marcado como "independente" (faz sozinho) não entra nessa conta pra aquele serviço.',

  cobertura_vs_saude: 'São métricas diferentes, apesar do nome parecido. "Cobertura da Carteira": dos clientes ATIVOS, quantos tiveram ao menos 1 reunião/relatório nos últimos 2 meses vs. quantos ficaram sem contato — mede atendimento no tempo, muda mês a mês. "Saúde da Carteira": composição por Status de cadastro (Regular/Suspenso/Atendido pelo Marco/Gratuidade/Problemas Externos), incluindo ATIVOS E INATIVOS juntos — não tem relação com quando foi o último contato, é uma foto da situação cadastral.',

  risco_ia: 'Nível de risco (baixo/médio/alto) vem da análise automática do monitorIA, lendo as atas das reuniões — não é um campo que o usuário preenche. Fica em `AnalisesIA` (a análise atual de cada cliente); versões anteriores ficam guardadas em `AnalisesIAHistorico`, então dá pra ver a evolução do risco ao longo do tempo, não só o valor de agora.',

  acao_sem_sucesso: 'Registrar uma Ação de contato tem dois resultados possíveis: "sucesso" (conseguiu falar/entregar de fato — conta como toque de cadência, reseta o prazo) ou "sem_sucesso" (tentou e não conseguiu: ligou e não atendeu, mandou mensagem sem resposta — NÃO conta como toque, o cliente continua vencido/vencendo na fila de cadência, só fica registrado que houve uma tentativa). Nunca registrar tentativa falha como sucesso só pra "resolver" a pendência.',

  pausa_temporaria: 'Um cliente pode ser marcado como pausado até uma data futura (campo pausadoAte, com motivo em motivoPausa), sem precisar inativar o cadastro inteiro. Enquanto a pausa estiver vigente, o cliente conta como INATIVO em todo lugar (dashboard, fila de cadência) mesmo com Estado=Ativo e Status=Regular — e volta a contar como ativo sozinho assim que a data passa, sem precisar de nenhuma ação manual.',

  segmento_linha: '"Segmento" (campo `local` no cadastro) é o tipo de negócio do cliente — Autopeça, Oficina, Distribuidora etc. "Linha" (campo `linha`) é a categoria de veículo atendida — Leve, Pesada ou Geral. São dois campos totalmente independentes, cada um configurável separadamente em Categorias.',
};

module.exports = { CONCEITOS };
