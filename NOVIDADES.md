# Novidades por versão

Uma seção `## <versão>` por release, do mais novo pro mais antigo, com bullets
curtos escritos **para quem usa o sistema** — não mensagem de commit. O que
estiver na seção da versão publicada aparece na tela de Configurações →
Sistema quando houver atualização disponível, e depois de atualizar.

Regra: se a mudança não muda nada no dia a dia de quem usa (refatoração,
teste, ajuste interno), não entra aqui.

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
