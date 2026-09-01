# Novidades por versão

Uma seção `## <versão>` por release, do mais novo pro mais antigo, com bullets
curtos escritos **para quem usa o sistema** — não mensagem de commit. O que
estiver na seção da versão publicada aparece na tela de Configurações →
Sistema quando houver atualização disponível, e depois de atualizar.

Regra: se a mudança não muda nada no dia a dia de quem usa (refatoração,
teste, ajuste interno), não entra aqui.

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
