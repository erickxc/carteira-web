> **Status: histórico — quase tudo concluído** (30/10/2026). Motivo: ata por IA (`gerarAtaIA`), `datasAnteriores`, `ClientesFinais`, escopos 5.2/5.3, marcar concluído e PDF pelo agente já estão implementados. Vínculos de Dados Alvos revisados em 30/10/2026 (ver itens abaixo); só sobra o que depende do Ecossistema gerar pasta (Santa Luzia e os suspensos).

# Pendências — 2026-08-31

Levantamento feito ao fim de uma sessão longa de trabalho na integração com
"Dados Alvos" e em correções de evento/ata/dossiê. Reflete o estado real do
código nesta data — não um plano futuro, e sim o que ficou de fora do que já
foi entregue na release 1.4.0.

## Evento · Ata · Dossiê

- [ ] **Reagendamento manter o slot antigo na tela, marcado "realocado"**
      (campo `datasAnteriores` no evento + render fantasma na Agenda). Hoje o
      horário antigo simplesmente some quando a reunião é remarcada.
- [ ] **Unificar a contagem de remarcação.** Existem 3 caminhos que
      incrementam `reagendamentos` de forma independente (arrastar de dia,
      arrastar no kanban, edição manual do formulário) — nenhum deles sabe
      dos outros.
- [ ] **Geração de ata pela IA — capacidade inteira, do zero.** Confirmado
      nesta sessão: a geração de ata hoje é 100% determinística (template +
      regex, `src/utils/ata.ts`), sem nenhuma chamada a LLM. Falta:
  - Campo **Transcrição** da reunião.
  - Botão "Gerar ata com IA" (o LLM lê os campos já existentes — resumo,
    checklist, produtos/situação, transcrição — e decide o que faz sentido
    em cada seção da ata).
  - Ao salvar o evento como concluído/reagendado/cancelado, o LLM analisar o
    dossiê atual e atualizar com base na ata.
  - Animação "Atualizando dossiê..." nesse fluxo de salvar/concluir/cancelar.

## Dados Alvos (integração de vendas por loja)

- [ ] **Escopo 5.2 — dados gerais.** Receita e quantidade por mês/ano, total
      de clientes por período. O agregado (`leitor.cjs`) já calcula tudo
      isso — falta expor numa rota e numa tela.
- [ ] **Escopo 5.3 — análises estratégicas.** Queda de receita persistente
      (3+ períodos seguidos), erosão de cliente contra o pico histórico,
      poder de compra pela média dos 3 melhores meses. As janelas exatas já
      foram medidas contra os relatórios reais da 2D — falta portar o
      cálculo.
- [ ] **Recomendação de reunião no módulo Ações usando o escopo reunião dos
      Dados Alvos.** Só o filtro por campo Local entrou em Ações nesta
      sessão — a recomendação em si (puxar o "retorno do combinado" pra
      dentro da fila de priorização) ainda não.
- [ ] **11 clientes sem pasta correspondente** em Dados Alvos (Rainha,
      Brondani, Quality, CG. Braga, Edumar - CBRAGA, SMAP, AA Bangu,
      Condessa, Guigo, SETE LAGOAS, e mais alguma que aparecer). Não é falha
      de busca — nenhuma das 46 pastas reais bate com esses nomes. Fica
      esperando o Ecossistema-Monitoria gerar o arquivo dessas empresas.
      **Atualização 30/10/2026:** o Ecossistema gerou as pastas Guigo, SMAP,
      Mosca_Branca, 7 Lagoas e CBraga. Vinculados (confirmado pelo usuário):
      Guigo (2 lojas), SMAP (6 lojas por CNPJ), Mosca Branca (1), SETE LAGOAS
      (`7lagoas`) e CBraga por loja — `cbraga_sj`→C. Braga (Silva Jardim),
      `cbraga_ca`→CG. Braga (Casimiro de Abreu), `cbraga_ar`→Edumar - CBRAGA
      (Araruama), pela cidade no cadastro de lojas do DW; antes as 3 estavam
      todas em C. Braga. **Correção de erro:** `7lagoas` (R$ 12,4 mi) estava
      vinculada à Peça.com — as vendas de Sete Lagoas contavam na Peça.com e a
      SETE LAGOAS aparecia sem dado; movida para SETE LAGOAS. Ainda sem pasta:
      Rainha, Brondani, Quality, AA Bangu, Condessa (suspensos/problemas
      externos) e Santa Luzia (ativo). "Pecita" sem vínculo é esperado: é o
      registro da rede, as lojas estão nos clientes por loja.
- [x] **Resolvido 30/10/2026** — motivo: o usuário decidiu que CD e EC fazem
      parte do atendimento da Penha; as duas lojas foram vinculadas a "Altese -
      GM, Ford, Fiat, VW" (que passa a somar 6 lojas). SMART segue com
      `altese_smart` + `altese_recreio`. Texto original:
      **Altese — `altese_cd` e `altese_ec`** sem cliente correspondente na
      carteira (R$ 14,5 mi e R$ 4,5 mi represados). Decisão do usuário: ficam
      sem vínculo, fora de qualquer análise, até ele decidir criar clientes
      novos pra elas — quando isso acontecer, só vincular pelo painel já
      existente, sem precisar de código novo.
- [x] **Pecita — "Pecita - Itaguaí"** tem cliente cadastrado mas nenhuma
      loja correspondente apareceu no arquivo real ainda. **Resolvido**
      (conferido 30/10/2026): a loja `pecita` está vinculada a Pecita - Itaguaí.

## Bloqueado por decisão do usuário

- [ ] **Entidade `ClientesFinais`** (status do cliente do cliente:
      inadimplente / regular / situação externa). Precisa decidir: o status
      é por CLIENTE DA CARTEIRA (a mesma oficina pode estar inadimplente numa
      loja e regular em outra) ou GLOBAL por nome? Recomendação já dada:
      por cliente da carteira. Depois disso: sheet nova, entrada na fila
      multi-máquina, ferramenta do agente pra gravar pelo chat.
- [ ] **Agente marcar evento como "Concluído" pelo chat.** Hoje a única
      ferramenta de edição do agente é `corrigir_dossie_cliente` — abrir
      `Agenda` pra edição é mudança de política, não só de código.

## Backlog sem data (não bloqueado, só não priorizado)

- [ ] Reanálise das ~37 atas desatualizadas restantes (o mecanismo já existe
      — `reanalisar_cliente` —, é rodar sob demanda, uma de cada vez, por
      causa de cota de IA).
- [ ] Ata em PDF gerada pelo agente — **deliberadamente fora de escopo**:
      duplicaria ~150 linhas do layout que já existe no botão da tela do
      evento (`src/utils/ataPdf.ts`), sem ganho real pro usuário.

## O que foi entregue nesta sessão (não repetir)

Vínculo loja↔cliente com sugestão automática (balcão/sigla), 43 de 54
clientes vinculados, correção do limite de ~512 MB do Node em arquivos
grandes (`server/alvos/leitorBytes.cjs`), escopo reunião ("retorno do
combinado"), ferramentas do agente (`buscar_fatos_alvos`,
`definir_status_acompanhamento`), dashboard de Cadastro + Alertas em
`/clientes`, campo Local (cadastro, dossiê, conversa, filtros em Carteira e
Ações), motivo obrigatório também no cancelamento de reunião, e o dossiê
citando cancelamento/reagendamento repetido como sinal de desengajamento.
