# Novidades por versão

Uma seção `## <versão>` por release, do mais novo pro mais antigo, com bullets
curtos escritos **para quem usa o sistema** — não mensagem de commit. O que
estiver na seção da versão publicada aparece na tela de Configurações →
Sistema quando houver atualização disponível, e depois de atualizar.

Regra: se a mudança não muda nada no dia a dia de quem usa (refatoração,
teste, ajuste interno), não entra aqui.

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
