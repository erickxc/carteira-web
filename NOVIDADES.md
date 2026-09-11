# Novidades por versão

Uma seção `## <versão>` por release, do mais novo pro mais antigo, com bullets
curtos escritos **para quem usa o sistema** — não mensagem de commit. O que
estiver na seção da versão publicada aparece na tela de Configurações →
Sistema quando houver atualização disponível, e depois de atualizar.

Regra: se a mudança não muda nada no dia a dia de quem usa (refatoração,
teste, ajuste interno), não entra aqui.

## 1.4.29

- Registro da Monitoria agora também vale pra Precificação (era um campo separado) — inclui a opção "manteve", e cliente/grupo ficam preenchidos ao lançar vários produtos do mesmo cliente.
- Corrigido: tremor ao passar o mouse perto da borda em vários lugares (sidebar, cards, badges, linhas da Agenda, Kanban).
- Corrigido: "Gerar ata com IA" podia deixar Decisões/Próximos Passos vazios em reuniões longas.

## 1.4.28

- Dossiê do cliente: entre pendências, um erro/inconsistência encontrada (ex.: parâmetro de estoque errado) agora tem prioridade sobre tarefa administrativa de rotina.

## 1.4.27

- Registro da Monitoria: seta de aumento/queda em vez de texto livre + observação opcional (tag removida).
- "Gerar ata com IA" mais rápida e com progresso legível (sem JSON quebrado na tela).
- Corrigido: transcrição colada no evento não estava sendo salva.
- Corrigido: salvar reunião "Agendado" não deve mais disparar a análise do dossiê.
- Corrigido: resumo de reunião com certos formatos de export ficava cortado no meio de uma frase.

## 1.4.26

- Corrigido: tarefa sem prazo não impede mais concluir uma Iniciativa (Ágil).

## 1.4.25

- **Notificações do Windows**, configuráveis por categoria (Configurações →
  Sistema): reuniões, lembretes, relatórios, análises de IA, cliente novo,
  novo evento.
- Ágil: filtros num painel fixo à direita, separados do board.
- Ágil: Frente vira ícone no card, sem precisar abrir seletor.
- Ágil: Iniciativa não pode ser concluída com tarefa pendente.
- Ágil: card mais compacto + correção de coluna duplicada na migração.

## 1.4.24

- Botões de ícone (adicionar loja/item/produto, editar/excluir modelo ou
  categoria, dispensar lembrete, fechar aviso) agora mostram uma dica ao
  passar o mouse, explicando o que cada um faz.

## 1.4.23

- **"Gerar ata com IA" mostra o texto sendo escrito ao vivo**, em vez do
  botão travado por até 2-3 minutos sem nenhum retorno.
- Ata gerada por IA ficou mais direta (frases mais curtas por linha, sem
  perder conteúdo).
- Corrigido: perguntar ao monitorIA "quais reuniões tenho essa semana"
  podia responder com compromissos da agenda pessoal do Marco, em vez da
  sua própria agenda de clientes.
- Ajuste de contraste nas bordas de campos/filtros no modo escuro (ficavam
  quase invisíveis contra o fundo).
- Ícone de expandir do card "Abrangência da Monitoria" alinhado à direita e
  maior.

## 1.4.22

- **monitorIA agora explica conceitos do sistema com dado real da sua
  carteira** — pergunte "o que é cliente ativo", "qual a diferença entre
  Cobertura e Saúde da Carteira" etc., e a resposta já vem com os números da
  sua carteira, não só teoria.
- Corrigido: em alguns casos, "quantos clientes ativos" podia contar um
  cliente a mais (ex.: "Atendido pelo Marco" contando como ativo por engano).
- **Corrigido bug real na Agenda**: filtrar por um monitor podia mostrar
  reuniões de outro monitor, quando o cliente e a reunião tinham monitores
  diferentes. O filtro do topo (header) agora também funciona certo nas
  telas de Agenda, Clientes, Ações e Contatos — antes só o filtro de dentro
  de cada tela funcionava.
- Ao criar um evento novo e escolher o cliente, o monitor já vem
  pré-selecionado (dá pra trocar se quiser).
- Linha do tempo do cliente: janela padrão de 30 dias atrás / 10 dias à
  frente, com botão para ver tudo.
- Corrigido: o botão de recolher grupo de lojas (redes tipo Altese) não
  funcionava enquanto qualquer filtro estivesse ativo.
- Novo filtro "Outros filtros" (Segmento, Linha, Risco) na tela de Clientes.
- Dashboard da Carteira: novo card de distribuição de risco (do monitorIA),
  e "Total de clientes" (agrupado por rede) volta a aparecer também na Visão
  Geral, ao lado de "Total de atendimentos".

## 1.4.21

- **Dashboard da Carteira ganha "Total de clientes"**, separado dos
  atendimentos: um grupo com várias lojas (ex.: rede Altese) conta como 1
  cliente da 2D, mesmo tendo mais de um atendimento ativo. A Visão Geral
  passa a chamar o número de lojas atendidas de "Total de atendimentos",
  pra não confundir os dois conceitos.

## 1.4.20

- **Pausa temporária de cliente.** Dá pra marcar um cliente como pausado até
  uma data (com motivo), sem precisar inativar o cadastro — ele some da fila
  de cobrança até a data passar e volta sozinho.
- **Tentativa de contato sem sucesso não conta mais como atendimento.**
  Registrar "tentei ligar e não consegui" não zera a cadência do cliente como
  se ele tivesse sido atendido de verdade.
- **Histórico de risco do cliente é preservado.** Antes, cada nova análise do
  monitorIA substituía a anterior; agora dá pra ver a evolução do risco ao
  longo do tempo.
- **Agenda mostra a carga da semana do monitor** ao marcar uma reunião, pra
  ajudar a decidir o horário.
- **monitorIA ganha mais autonomia no chat**: agora consegue registrar uma
  ação (contato, reunião, relatório, Price) direto pela conversa, consultar o
  histórico de risco de um cliente e enxergar a carga de reuniões da semana.
- Grupos de lojas na lista de clientes ficaram mais claros ao expandir/
  recolher (mostra o nome do grupo e todas as lojas, sem informação
  duplicada).
- Pequenos ajustes visuais: campos de seleção mais consistentes em todas as
  telas, popup de filtro alinhado corretamente, transição entre tema claro/
  escuro mais suave.

## 1.4.19

- Corrigido: em máquinas diferentes da principal, abrir o Price podia dar erro
  ("PRICE_CREDENCIAIS_CHAVE não configurada"). Agora a chave é configurada
  sozinha automaticamente, sem precisar mexer em nada máquina por máquina.

## 1.4.17

- **Fila de Ações agora também considera o risco do dossiê do monitorIA.**
  Além de vencido/vencendo/em dia, quem tem risco alto no dossiê sobe na
  frente dentro do mesmo grupo — o card mostra o nível de risco pra explicar
  a ordem.
- **Cancelar um evento agora abre um popup dedicado** pra informar o motivo,
  em vez de um campo escondido no meio do formulário de edição.
- Corrigido: o monitorIA podia informar um horário de reunião que não existia
  (quando a reunião não tinha hora marcada) e a tela às vezes não mostrava a
  alteração mais recente feita pelo agente até atualizar a página manualmente.

## 1.4.16

- **Login automático no Price a partir do cadastro do cliente.** Clientes com
  serviço de Precificação ganham um botão de acesso ao Price que já entra
  logado — cadastre o login/senha uma vez no cadastro do cliente (senha fica
  guardada de forma criptografada) e o sistema faz o login sozinho, com uma
  animação mostrando os campos sendo preenchidos.
- Troca entre tema claro/escuro agora é suave, sem a mudança brusca de antes.

## 1.4.15

- **O sistema passa a se atualizar sozinho.** Ele procura versão nova a cada
  30 minutos e instala automaticamente quando ninguém estiver usando
  (normalmente à noite). O botão "Atualizar agora" continua ali para quando
  você não quiser esperar.
- **Novo campo Linha (Leve / Pesada / Geral)** no cadastro do cliente,
  editável em Configurações, com gráfico no Dashboard da Carteira.
- **Coluna Links na tabela de clientes**: os links de Power BI do cliente
  ficam a um clique, sem abrir o cadastro.
- **monitorIA agora edita reunião e cadastro de cliente.** Antes ele criava a
  reunião e, se você pedisse para completar monitor/serviço, respondia que a
  edição era manual. Também deixou de inventar: se você pedir um status que
  não existe (ex.: "Rascunho"), ele avisa e sugere o cadastrado mais próximo
  ("Pendente") em vez de gravar outro e dizer que fez.
- **monitorIA explica o nível de risco** com os motivos que a análise
  registrou (antes dizia que "o critério não está explícito" e chutava), e
  avisa quando a ficha do cliente ficou desatualizada após uma correção no
  dossiê, oferecendo refazer a análise.
- **Ata:** a seção "Pauta" (que quase sempre saía vazia) virou um resumo
  curto, e as tarefas da 2D passam a levar o **nome do monitor** em vez de
  "[2D]".
- **Ágil:** a "Frente" foi removida (não estava sendo usada), e reordenar
  colunas voltou a funcionar mesmo com a primeira raia recolhida.
- **Relatórios** deixou de ser um módulo próprio e virou um botão dentro do
  cadastro de cada cliente, já filtrado por aquele cliente.
- Cobertura por Serviço ganhou o seletor **Coberto/Descoberto**; o card
  Vencendo ficou mais legível; o Top 10 virou **Top 10 Atendimentos** com
  filtro Geral/Monitoria/Precificação; e o seletor de tema ficou só com os
  ícones de sol e lua.

## 1.4.14

- **Correção: monitorIA (Claude) parado de novo** — inclusive "Gerar ata com
  IA" e a análise automática de risco. Uma reinstalação recente do Claude
  Code deixava o sistema tentando rodar o arquivo errado nos bastidores.
  Corrigido.
- **Dashboard da Carteira reformulado**: agora mostra saúde da carteira por
  status, quantos serviços cada cliente contratou (cross-sell), concentração
  por monitor, distribuição por segmento, crescimento acumulado de clientes
  e o mapa de abrangência (que mudou de lugar, veio da Visão Geral).
- **Visão Geral**: o mapa de abrangência deu lugar a um ranking dos 10
  clientes com mais atendimentos (reunião ou relatório) no ano.
- **Tabela de Clientes**: os indicadores de Serviço e Situação ficaram mais
  legíveis (ponto colorido + texto, sem fundo colorido atrás).
- **Ficha do cliente**: as tarefas do Ágil ainda pendentes aparecem ao lado
  da Análise de IA, e ganhou um botão "Vamos falar sobre isso?" que já abre
  o monitorIA perguntando sobre aquele cliente.

## 1.4.13

- **Correção urgente: o sistema caía ao abrir Configurações → Sistema.**
  Um import que faltava numa rota interna (consulta do limite da conta
  Claude) fazia o servidor inteiro derrubar sempre que essa tela era
  aberta. Corrigido.

## 1.4.12

- **Módulo Ágil (Kanban) agora funciona em qualquer máquina**, não só na
  principal — as tarefas passaram a usar a mesma fila das outras telas, que
  já resolve conflito quando mais de uma máquina mexe ao mesmo tempo.
- **Tarefa do Ágil aceita mais de um responsável** (antes só um monitor por
  tarefa), escolhido na mesma lista de monitores cadastrados.
- **Novo card de tarefas Ágil na ficha do cliente**, mostrando as tarefas
  vinculadas àquele cliente sem precisar abrir o quadro Kanban.
- Ajustes visuais no quadro Ágil (breadcrumb de navegação e espaçamento das
  colunas).

## 1.4.11

- **Cadastro do cliente reorganizado de novo.** O cabeçalho não mostra mais o
  status duas vezes (dropdown + etiqueta repetindo o mesmo valor). A Análise
  de IA ficou mais estreita e o texto não é mais cortado. Contatos e
  Anotações viraram botões que abrem um pop-up, em vez de ficar sempre
  ocupando espaço na tela.
- **Linha do tempo agora parece uma linha do tempo de verdade**, com um
  trilho vertical ligando os eventos, e cada reunião ganhou um botão para
  baixar a ata em PDF direto dali.
- **Novo campo Endereço** no cadastro do cliente.
- **Tabela da Carteira mais enxuta:** Estado e Status viraram uma coluna só;
  Última reunião, Próximo agendamento e Último contato viraram uma única
  coluna "Cadência"; Análise virou um ícone; e Serviços mostra só 2
  etiquetas + "+N" (passe o mouse pra ver o resto) — antes uma linha com
  muitos serviços contratados esticava a tabela inteira.
- **Grupo referência (G1/G2/G3) agora aparece na hora de registrar a
  reunião**, junto do cliente final — antes só dava pra configurar em
  Categorias, mas não tinha onde preencher na prática.

## 1.4.10

- **Link do PowerBI corrigido**: cliente com mais de um serviço com link
  (ex.: Monitoria + OptiMarco) agora mostra um campo de link para CADA
  serviço, todos visíveis ao mesmo tempo — antes só dava pra editar um dos
  dois por vez, escondido atrás de um seletor.
- **Ficha do cliente reorganizada**: a Análise de IA (risco + resumo) subiu
  para logo abaixo do cabeçalho, num quadro pequeno — antes ficava sozinha
  no fim da página. Os serviços do cliente agora ficam num único botão
  ("Serviços") em vez de uma fileira de etiquetas que só crescia.
- Tirado o efeito de deixar o texto do rótulo dourado ao passar o mouse nos
  campos dos formulários — estava feio, principalmente no campo de escolher
  o cliente.

## 1.4.9

- **Cadastro do cliente reorganizado.** Os campos estavam meio soltos, sem
  nenhuma lógica visível de agrupamento. Agora estão em blocos com título
  (Identificação, Situação, Serviços, Estrutura, Notas e links, Automação),
  os campos curtos (Monitor/Local, Status/Estado) ficam lado a lado em vez de
  ocupar uma linha inteira cada, e "Serviços contratados" virou uma grade de
  botões — mais rápido de marcar do que a lista de caixinhas de antes.

## 1.4.8

- **Ata com IA usa os produtos e clientes cadastrados de verdade.** A
  transcrição automática às vezes ouve o nome errado (ex.: "queijo de
  embreagem" em vez de "Kit Embreagem"). Agora a IA compara com o que está no
  arquivo de vendas do cliente e corrige o nome antes de escrever a ata —
  sempre que o cliente tiver Dados Alvos vinculados.
- **Próximos passos da ata agora têm o responsável certo.** Antes, toda tarefa
  saía marcada como "[2D]", mesmo quando quem ficou de fazer era o próprio
  cliente ou outra pessoa citada na reunião. Agora a ata identifica quem
  ficou de fazer o quê.
- **Os registros que você digita em "Registro da Monitoria" (cliente
  final/produto/situação) agora aparecem na ata.** Antes eles só ficavam
  guardados por trás — iam pro dossiê, mas sumiam da ata.
- **Achamos onde marcar um serviço como "PowerBI" ou "Aplicação".** Esse
  ajuste (Configurações → Categorias → Serviço) estava escondido atrás do
  botão de editar, sem nenhuma pista de que existia. Agora aparece direto na
  tela, com uma explicação do que cada opção faz.

## 1.4.7

- "Serviços tratados" na reunião voltou a mostrar só Monitoria e Precificação.
  Os outros serviços (Controladoria, OptiMarco, Raptor, Protocolo GPS, Apura,
  Book Fiscal) são informacionais: seguem no cadastro do cliente e no Dashboard
  da Carteira, mas não são tratados numa reunião.
- Corrigido no Registro da Monitoria: no modo "Cliente × Situação" não dava pra
  escrever o que foi conversado, porque o campo de situação tinha virado um
  seletor de tag. Agora situação é texto livre e a tag é um campo separado e
  opcional (e as duas informações chegam ao dossiê e à ata).

## 1.4.6

- O dossiê não prende mais a tela: ao concluir/cancelar/reagendar, o evento
  salva na hora e a atualização do dossiê roda em segundo plano no servidor.
  (Antes o modal ficava travado em "Atualizando dossiê..." — e a mensagem
  aparecia nos três botões ao mesmo tempo.)
- Corrigido: o botão "Cancelar evento" cancelava sem pedir o motivo. Agora ele
  pede a justificativa antes de salvar, igual ao reagendamento.
- O painel de consumo de IA passa a incluir a geração de ata e a análise
  automática — antes só o chat aparecia, e essas duas gastavam sem registro.

## 1.4.5

- Corrigido (importante): gerar a ata com IA agora **salva na hora**. Antes o
  texto aparecia na tela mas era descartado se você fechasse o evento sem
  clicar em Salvar — junto com a transcrição colada.
- Novo "Registro da Monitoria" na reunião, com três formas de registrar:
  só cliente final, cliente + produto, ou só produto. E o nome de
  produto/cliente final agora vem por sugestão dos dados reais de venda, em
  vez de texto digitado às cegas.
- A lista de produtos e clientes finais passou a ser guardada e atualizada a
  cada reunião concluída/cancelada — não depende mais de cache e não
  desaparece.
- Situação de cliente final usa as tags compartilhadas do Ecossistema
  (Alerta, Inadimplente, Cliente Balcão, Encerrou operação) e ganhou grupo
  G1/G2/G3.
- Corrigido: pedir uma reunião ao monitorIA com o nome do monitor escrito de
  dois jeitos gravava o mesmo monitor duas vezes.

## 1.4.4

- Novo botão de acesso rápido no cadastro do cliente: link para o Power BI
  e/ou para a Plataforma, específico de cada cliente. Aparece só quando você
  preenche o link (em "Links externos" na edição do cliente) — se preencher
  os dois, vira um seletor.
- O monitorIA agora respeita o filtro de monitor do cabeçalho: com um monitor
  selecionado, o chat responde só sobre os clientes dele (antes respondia com
  a carteira inteira mesmo com o filtro ativo).
- Novo card "Outros Serviços" no Dashboard: Controladoria, OptiMarco,
  AutoTech, Book Fiscal, Raptor e Protocolo GPS entram como serviços
  selecionáveis, com contagem simples de clientes por serviço (sem entrar na
  métrica de cadência da Monitoria/Price).

## 1.4.3

- O monitorIA agora registra e consulta a situação do cliente final de cada
  loja (inadimplente, regular ou situação externa como fechamento/troca de
  dono) — só quando você informar isso na conversa, nunca deduzido sozinho
  por queda de compra.

## 1.4.2

- Nova transcrição da reunião e botão "Gerar ata com IA": a IA escreve o que
  foi tratado, as decisões e os próximos passos a partir do resumo, da pauta
  e da transcrição (se você colar uma) — cabeçalho e participantes continuam
  preenchidos automaticamente, sem risco de a IA errar cliente ou data.
- Ao concluir, reagendar ou cancelar uma reunião, o dossiê do cliente agora
  atualiza na hora (antes só na próxima segunda-feira ou se alguém pedisse no
  chat).
- Corrigido: cancelar ou reagendar uma reunião não contava como contato com o
  cliente em nenhum lugar do sistema (Dashboard, Ações, Carteira) — mesmo
  falando com o cliente para desmarcar, o "último contato" mostrava dias a
  mais do que o real.

## 1.4.1

- Reagendar uma reunião agora mantém o horário antigo na Agenda, marcado
  como "Realocado" — antes ele simplesmente desaparecia.
- A fila de priorização em Ações passa a recomendar reunião com base no que
  foi combinado numa reunião anterior e ainda não teve retorno (Dados
  Alvos), não só por atraso de cadência.
- Novo resumo de vendas por período (receita, quantidade, clientes
  distintos) e novas análises estratégicas (queda persistente, erosão de
  cliente, poder de compra) a partir dos Dados Alvos, disponíveis pro
  monitorIA consultar na conversa.

## 1.4.0

- Nova integração com os dados de venda por loja de cada empresa (Dados
  Alvos): a Carteira agora consegue ler o histórico de compra dos clientes
  finais e trazer isso pro dossiê e pra conversa com o monitorIA — quem
  parou de comprar, o que foi combinado numa reunião e não teve retorno
  depois, etc.
- Novo painel de Cadastro em Carteira, com uma aba de Alertas: mostra quando
  um cliente ainda não tem os dados de venda vinculados e traz cartões que
  já abrem o chat com a pergunta pronta.
- Corrigido: em empresas com histórico de vendas muito grande, o sistema
  podia ler um recorte errado ou incompleto dos dados sem avisar nada — a
  leitura agora sempre pega o dado completo.
- Novo campo "Local" no cadastro do cliente (Autopeça, Oficina,
  Distribuidora...), com filtro na Carteira e em Ações, e usado como
  contexto na análise do monitorIA.
- Cancelar uma reunião agora pede o motivo, igual já acontecia ao reagendar.
- O dossiê passa a registrar quando uma reunião é cancelada/reagendada
  repetidas vezes como sinal de desengajamento, citando o motivo.

## 1.3.2

- Corrigido: ata escrita DEPOIS de concluir a reunião (o fluxo normal) nunca
  chegava ao dossiê — a análise só reagia a reunião nova, não a ata nova. Na
  base havia 38 de 45 atas nessa situação.
- O agente passa a ler o que ficou COMBINADO em cada ata (responsável +
  ação), o que permite cobrar o que não virou reunião nem lembrete.
- Peça ao agente para "reanalisar" um cliente e ele reprocessa as atas do
  zero, sem esperar uma reunião nova.

## 1.3.1

- Barras de rolagem com o visual do sistema em todas as telas — antes só
  alguns painéis eram estilizados e o resto usava a barra padrão do Windows,
  clara e destoante (bem visível no tema escuro).

## 1.3.0

- Atualização muito mais rápida: o pacote deixou de carregar bibliotecas que
  só o navegador usa. Baixa bem menos e descompacta em uma fração do tempo.
- Esta tela passa a mostrar o que mudou em cada versão.
- Textos de apoio (legendas, datas, detalhes dos cards) ficaram mais legíveis
  nos dois temas — antes tinham contraste abaixo do recomendado.

## 1.2.34

- O monitorIA voltou a funcionar por completo nas máquinas que não são a
  principal: histórico de ações, consumo e memória agora são registrados
  também de lá.

## 1.2.33

- O painel "Ações do agente" avisa quando está mostrando ações de todos os
  monitores e explica como ver só as suas (escolhendo seu nome no filtro do
  topo).

## 1.2.32

- Corrigido: o painel de ações mostrava um código interno no lugar do nome
  quando o cliente não era identificado.
- O consumo do monitorIA agora guarda a pergunta e a resposta, o que permite
  revisar o que o agente respondeu.

## 1.2.31

- Corrigido travamento do monitorIA nas máquinas que não são a principal.

## 1.2.30

- O agente passa a ler a ata completa das reuniões e listar os arquivos
  anexados a elas.
- Corrigido: ao pedir para o agente atualizar a próxima pauta, a ficha do
  cliente continuava mostrando a pauta antiga.
- Conversas do chat agora são separadas por monitor.
- "Vencendo" aceita qualquer período ("semana que vem", "próximos 15 dias"),
  não só 5 dias.
