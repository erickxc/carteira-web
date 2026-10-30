# Pendências (atualizado em 30/10/2026)

Branch com tudo pronto e testado: `feat/integracao-1.7` (versão 1.7.0, não publicada). Produção: 1.6.20.

## Para publicar a 1.7

1. Avisar o responsável pelo 2d_hub e pelo analisador sobre os nomes novos (Plataforma 2D, 2D Price).
2. Atualizar as máquinas em uso. Bruno2D, JENIFFER-2D e DESKTOP-IOK3GHR estavam na 1.5: atualizar ou decidir ignorar (a migração tem `--ignorar-maquinas=`).
3. Juntar `feat/integracao-1.7` na `main` e publicar; atualizar a Karol-2D primeiro.
4. Rodar `node server/scripts/migrarProdutos.cjs` (simula), conferir, e só então `--aplicar`.

## Decisões do usuário em aberto

- **Motivo ao mudar status ou estado do cliente:** a regra "toda mudança de estado tem motivo" vale dentro do app? Hoje vale para fase de produto e vínculo de loja, não para status.
- **Reunião só de produto fiscal** (ex.: Apura): hoje conta em Cobertura e Ritmo. Conta só na Visão Geral da Fiscal?
- **Agenda:** "não ter reuniões ao mesmo tempo" vale para o mesmo cliente ou para qualquer reunião das duas equipes? Aviso ou bloqueio? Proposta: cor por equipe (pelo produto) + aviso para o mesmo cliente.
- **Lojas com CNPJ baixado:** 6 da WIDMEN, e Motobrás Recreio, Multimarcas E-commerce ES, Paralama Filial 2 e Periperi, Peça.com VONIXX, SMAP PASOLA (baixadas); Santa Luzia Loja 0002 (inapta). Ficam no cadastro?
- **219 lojas de 66 empresas** ativas no BI sem atendimento na Carteira: alguma entra?

## Próximos subprojetos

- **Separação por equipe (2b):** responsável por equipe, lembretes, relatórios, Ágil, ações e cadência, Visão Geral. Produtos Negócios: Plataforma 2D, 2D Price, Protocolo GPS. Fiscal: Controladoria, Apura, OptiMarco, Raptor. 2D Alcance e 2D Nexus sem equipe enquanto "Em breve".
- **Dossiê novo:** Resumo Executivo, Monitoria, Fiscal, Entregas (com a próxima pauta), Pontos de Atenção, Observações.
- **Usabilidade do resto do app:** o usuário considera o frontend ruim; Carteira e fichas foram refeitas, faltam Visão Geral, Agenda e Ações.
- **Guarda de só leitura no DW:** `default_transaction_read_only=on` no pool de `server/dw/dwPlataforma.cjs`.

## Pequenos, anotados na revisão

- A coluna "Vencimento Cert." ainda não ordena por clique.
- `consultarLojas` não registra quantas consultas à Receita falharam: se a BrasilAPI bloquear, a tela segue mostrando a situação antiga sem aviso. Vale um `console.warn` com a contagem.
- `/api/alvos/alertas` continua síncrono (13 s): abrir o painel de Dados Alvos ainda trava o servidor. A cura de verdade é calcular em processo filho ou guardar em cache.
