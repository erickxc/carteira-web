# Produtos do cliente (1.7.0) — desenho

**Data:** 30/10/2026 · **Status:** aguardando revisão do usuário · **Subprojeto 1 de 3** da entrada da equipe Fiscal (2 = equipes e login; 3 = dossiê novo).

## Objetivo

Cada cliente passa a ter um cadastro **por produto**: em que fase ele está, desde quando, por quê, e como acessar (link, login, senha). Hoje a Carteira só sabe "tem / não tem" (`servicos`), com o acesso espalhado em outros campos e só o Price com login/senha.

Junto vem a lista oficial de produtos e a troca de nome dos dois produtos com cadência: **Monitoria → Plataforma 2D** e **Precificação → 2D Price**. "Monitoria" deixa de ser produto: é o tipo de reunião que trata desses dois.

**Critério de sucesso:** depois da migração, os relógios de cadência de todos os clientes são **idênticos** aos de antes (mesmo status, mesmo atraso), exceto pela regra nova de "desde quando" (seção 4), que só muda clientes cujo produto entrou depois do cadastro.

## Decisões do usuário (30/10/2026)

- Produtos, nesta ordem: **Plataforma 2D, Controladoria, Apura, 2D Alcance, 2D Nexus, OptiMarco, 2D Price, Protocolo GPS, Raptor**.
- Reunião continua sendo o tipo de evento; marcar Plataforma 2D e/ou 2D Price é o que faz dela uma reunião de monitoria. Regras de relógio não mudam.
- Fases: **Em breve, Suspenso, Ativo, Cancelado**. Só **Ativo** entra na cadência.
- O status do produto fica no **mesmo cadastro** que guarda link, login e senha da plataforma.
- **Base de produtos = DW** (`public.parametro_bi`): marcado no DW = tem; não marcado = não tem. A base já foi alinhada ao DW em 30/10 (`dados/migracoes/2026-10-30-produtos-dw.json`). Plataforma marcada em qualquer loja vale para o grupo todo.
- Na migração, **2D Nexus e 2D Alcance entram como Em breve**; os demais como Ativo.
- As **independências** existentes são mantidas.
- Toda mudança de estado registra **motivo** (regra geral do usuário).

## 1. Dados

### `Cliente.produtos` (coluna nova em `Clientes`)

```ts
interface ProdutoCliente {
  produto: string;            // nome da categoria `servico` (lista oficial)
  fase: 'Em breve' | 'Suspenso' | 'Ativo' | 'Cancelado';
  faseDesde: string;          // ISO — quando entrou na fase atual
  motivoFase: string;         // obrigatório ao mudar de fase
  independente?: boolean;     // sem relógio de cadência (antes: servicosIndependentes)
  link?: string;              // acesso do cliente (antes: linksServicos[produto])
  login?: string;             // antes: loginPrice (só Price)
  senhaCifrada?: string;      // AES-256-GCM (server/crypto.cjs); nunca sai pro navegador
}
```

**Embutido no cliente, não tabela própria** (revisão com a skill de banco): é lido sempre junto do cliente, são no máximo 9 por cliente e já trafega pela mesma tela e pela mesma fila multi-máquina (`entidades.clientes`). Tabela separada exigiria entidade nova na fila (ordem de atualização das máquinas), rotas e cascata sem ganho. Mesmo padrão de `lojasCadastro`/`contatos`.

Integridade (o SQLite daqui não tem constraints) em `server/validation.cjs` + domínio:
- `produto` existe na categoria `servico`; sem produto repetido no cliente;
- `fase` só os 4 valores;
- mudar `fase` sem `motivoFase` novo → 400 "Informe o motivo da mudança de fase".

### Campos antigos continuam, **derivados**

Calculados em `syncClienteColumns` (`server/db.cjs`) a cada gravação, a partir de `produtos`:

| Campo antigo | Passa a ser |
|---|---|
| `servicos` | produtos com fase **Ativo** |
| `servicosIndependentes` | Ativos com `independente` |
| `linksServicos` | `{ produto: link }` dos que têm link |
| `loginPrice` / `senhaPriceCifrada` | login/senha do produto 2D Price |
| `monitoria` / `price` (flags) | iguais a hoje, sobre o `servicos` derivado |

Motivo: cadência, cards, monitorIA, espelho `.xlsx` (analisador do Ecossistema) e `2d_hub` continuam funcionando sem mudar tudo de uma vez. Código novo lê `produtos`.

### Máquinas em versão antiga

Uma máquina 1.6.x edita `servicos`/`servicosIndependentes`/`linksServicos`, nunca `produtos`. Se o servidor só derivasse, essa edição se perderia em silêncio. Por isso, quando o patch traz campo antigo e **não** traz `produtos`, o domínio traduz: produto que aparece em `servicos` → fase Ativo; produto que **era Ativo** e some → Cancelado, com `motivoFase` "alterado por versão anterior da Carteira"; produtos Em breve/Suspenso/Cancelado não são tocados (não estão no `servicos` derivado, então "sumir" ali não significa nada); independente/link idem. Retirar quando `dados/maquinas/*.log` mostrar todas em 1.7+.

### `ProdutosHistorico` (tabela nova, só acrescenta)

`id, clientId, produto, fase, motivo, mudouEm, gravadoEm`. Mesmo modelo do `StatusHistorico` (`server/dominio/statusHistorico.cjs`): o servidor compara `produtos` com a última linha de cada cliente+produto e grava só o que mudou — cobre rota, fila, `/bulk` e sincronização. Chamado pelo domínio após gravar cliente, no boot e no cron das 4h. Só o servidor escreve (fora da fila).

**Por que é obrigatório:** `clientesEm(data)` (`src/utils/statusHistorico.ts`) hoje refaz `status/estado/pausadoAte` do mês passado, mas usa os produtos de **hoje**. Com fases, cancelar um produto hoje tiraria ele dos meses passados da Visão Geral. `clientesEm` passa a refazer também `servicos` a partir de `ProdutosHistorico` na data.

## 2. Produtos e renomeação

- Categoria `servico`: renomear **Monitoria → Plataforma 2D** e **Precificação → 2D Price** (renomear, não apagar); ordem conforme a lista oficial. "2D Alcance" e "2D Nexus" já existem (criadas em 30/10).
- Eventos (`Agenda.servicos`) e chaves de `linksServicos`: mesma troca.
- **Reconhecimento num lugar só** (`shared/cadenciaServico.cjs`): `ehPlataforma2D(nome)` (`/plataforma|monitor/i`) e `eh2DPrice(nome)` (`/price|prec/i`), usadas por `ehToqueMonitoria`, `ehToquePrice`, `temServico`, `ehIndependente`, `servicoPadraoDoEvento`, `ehServicoDeReuniao` e pelos ~5 arquivos que repetem a expressão hoje. Aceitam nome antigo e novo: dado antigo e máquina antiga seguem reconhecidos.
- Rótulos: "Monitoria"/"Price" → **Plataforma 2D**/**2D Price** em cards, filtros, fila de Ações, Carga por monitor. O **tipo** de evento não muda (Reunião, Contato, Relatório, Ligação, Precificação).

## 3. Telas

**Ficha do cliente** (`CadastroCliente.tsx`, hoje "Serviços"): bloco **Produtos**, uma linha por produto do cliente na ordem oficial, mais "Adicionar produto".

| Produto | Fase | Desde | No DW agora | Acesso |
|---|---|---|---|---|
| Plataforma 2D | Ativo ▾ | 03/2025 | marcado | link · login · senha 🔒 |

- Trocar a fase abre o campo **Motivo** (obrigatório) antes de salvar; a linha mostra o último motivo.
- "Independente" vira caixa por produto.
- Senha: campo "definir/trocar"; nunca exibida. O botão de acesso (`AcessosExternosButton`) passa a listar login/senha de qualquer produto.
- **No DW agora**: só leitura (seção 5). Divergência vira texto ("marcado no DW, mas Cancelado aqui"), nunca altera nada.

**Configurações:** lista de produtos na ordem oficial, reordenável.

**Formulário da reunião:** opções = produtos **Ativos** do cliente, com "ver todos"; mantém a sugestão automática. Regras de relógio iguais.

**Carteira (lista):** filtro de produto aceita fase (padrão: Ativo).

**Importação de Excel** (`ClientesPage`): aceita colunas com nome antigo e novo.

## 4. Cadência

Iguais a hoje: dois relógios independentes por cliente (Plataforma 2D, 30 dias; 2D Price, 15 dias — configuráveis em Cadências), só para produto **Ativo** e não independente; reunião zera só o relógio do produto marcado; 2D Price vale para o grupo.

**Muda uma coisa:** o ponto de partida de "nunca atendido" passa a ser `max(createdAt do cliente, faseDesde do produto)`, não só o cadastro. Hoje, produto que entra depois nasce vencido desde o cadastro — foi o que aconteceu com os 8 clientes que ganharam Price em 30/10 (143 dias de atraso no primeiro dia). Na migração, `faseDesde` = 30/10/2026 para os produtos acrescentados pelo DW nessa data (pelo registro em `dados/migracoes/`); `createdAt` do cliente para os demais — esses ficam exatamente como hoje.

## 5. "No DW agora"

- O servidor lê `parametro_bi` (somente leitura, `server/dw/dwPlataforma.cjs`) no boot e no cron diário, e grava o retrato em `dados/dw-produtos.json` (`{ geradoEm, porCnpj }`). Arquivo no OneDrive de propósito: as máquinas em modo client não têm credencial do DW e leem dali.
- Por atendimento: junta as lojas pelo CNPJ (`lojasCadastro`); produto marcado em qualquer loja = marcado (mostrando "2 de 3 lojas" quando parcial); Plataforma (`monitoria`) vale para o grupo todo.
- Mapa de colunas: `monitoria`→Plataforma 2D, `controladoria`, `apura`, `alcance`→2D Alcance, `nexus`→2D Nexus, `optimarco`, `precificar`→2D Price. Protocolo GPS e Raptor não existem no DW ("—").
- Botão "atualizar" na ficha força nova leitura.

## 6. monitorIA (checklist do CLAUDE.md)

- `buscar_clientes`/ficha: devolvem `produtos` com fase/desde/motivo/independente — **sem** login/senha.
- Ferramenta nova **`alterar_fase_produto`** (`escreve: true`): `clientId`, `produto`, `fase`, `motivo` obrigatórios; descrição instrui a só chamar depois de o usuário confirmar. Na reunião (somente leitura) fica bloqueada como as demais de escrita.
- `toolsSchema.test.ts` cobre a ferramenta nova.

## 7. Migração (`server/scripts/migrarProdutos.cjs`)

Simula por padrão; `--aplicar` grava. Antes de gravar: cópia `dados/migracoes/<data>-produtos-1.7.antes.sqlite`.

1. Categorias: renomear e ordenar.
2. Clientes: `produtos` a partir de `servicos` (renomeados), fase Ativo (2D Nexus/2D Alcance: Em breve), `independente` de `servicosIndependentes`, `link` de `linksServicos`, login/senha do Price no 2D Price; `faseDesde` conforme seção 4; `motivoFase` "migração para produtos (1.7)".
3. Corrige os **6 clientes e 85 eventos** com `servicos` gravado como texto (resíduo da dupla serialização).
4. Eventos: renomeia os produtos.
5. `ProdutosHistorico`: linha-base por cliente+produto.
6. Relatório: relógio de cada cliente antes × depois; aborta se divergir fora da regra da seção 4.

Grava pelo domínio (mesmo caminho das telas). Rodar primeiro numa cópia (`start:dev` / `.dev`).

## 8. Segurança

- `semSegredo` (`server/routes/clients.cjs`) remove `senhaCifrada` de **cada** produto, além de `senhaPriceCifrada`.
- Revelar senha: `POST /api/clients/:id/produtos/:produto/credenciais/revelar`; a rota antiga do Price continua (lê o 2D Price).
- Teste: nenhuma resposta de `/api/clients` contém `senhaCifrada`.
- `sincronizarPrice.cjs` passa a gravar login/senha no produto 2D Price.

## 9. Testes

- Reconhecimento de nomes antigos e novos (`ehPlataforma2D`/`eh2DPrice`).
- Fase sem motivo → 400; motivo vai para `ProdutosHistorico`.
- `clientesEm` refaz `servicos` de um mês passado (produto cancelado hoje continua no mês passado).
- Tradução de patch de máquina antiga (servicos → fases).
- Derivação dos campos antigos (`servicos`, `servicosIndependentes`, `linksServicos`, `loginPrice`).
- Nenhuma senha na resposta da API.
- Ponto de partida do relógio por `faseDesde`.
- Migração sobre cópia dos dados reais: relógios iguais antes × depois (fora a seção 4); simulação não grava nada.

## 10. Entrega

- Versão **1.7.0**. A Karol-2D (servidor) atualiza primeiro; o servidor aceita patch antigo (seção 1), então máquinas 1.6.x seguem funcionando até atualizar.
- **A 1.7 funciona sem a migração**: cliente sem `produtos` é lido montando os produtos a partir de `servicos`/`servicosIndependentes`/`linksServicos` (só em memória, sem gravar), e snapshot sem a tabela `ProdutosHistorico` não quebra nada.
- **Snapshot do OneDrive** (`filas/leitura/carteira-snapshot.sqlite`, cópia inteira do SQLite lida pelas máquinas client com as colunas que cada versão conhece): coluna e tabela novas são ignoradas pela 1.6 sem erro. O que quebra a 1.6 é a **renomeação** (ela acha a Monitoria por `/monitor/i`; "Plataforma 2D" some). Por isso a migração só grava quando todas as máquinas em uso estão na 1.7+ (`dados/maquinas/*.log`); o script lista as atrasadas e só segue com confirmação explícita de que não estão em uso.
- Ordem: publicar → atualizar Karol-2D → aguardar as demais máquinas na 1.7 → migração simulada → conferir relatório com o usuário → `--aplicar`.
- Mostrar a ficha nova local (`start:dev` + prints claro/escuro/celular) antes de publicar.

## Riscos

- **Espelho `2d_hub` e analisador do Ecossistema** leem o `.xlsx` e passam a ver "Plataforma 2D"/"2D Price" em `servicos`. Se algum depende do nome antigo, quebra fora deste código — confirmar com quem mantém antes de publicar.
- DW por loja × Carteira por atendimento: a coluna "No DW agora" depende de `lojasCadastro` com CNPJ (6 atendimentos não têm).

## Fora de escopo

- Equipes e login (subprojeto 2) e dossiê novo (subprojeto 3).
- Sincronizar **automaticamente** produtos do DW para a Carteira (aqui o DW só é mostrado).
- Logins de Apura (`apura_usuarios`) e OptiMarco (`usuarios_optimarco`) e link do Power BI (`controle_att_bi`) vindos do DW — próximos passos, o cadastro já tem onde guardar.
