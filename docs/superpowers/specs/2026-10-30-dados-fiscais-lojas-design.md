# Dados fiscais das lojas (DW + Receita) — design

> Aprovado na conversa em 30/10/2026. Entra depois da 1.7 (reaproveita o padrão de `server/dw/retratoProdutos.cjs`), junto com a ficha nova (`2026-10-30-ficha-do-cliente-design.md`), cuja aba Lojas mostra estes dados.

## O que entra

Por **CNPJ de loja** (`Cliente.lojasCadastro[].cnpj`):

| Dado | Fonte | Consulta |
|---|---|---|
| Vencimento do certificado digital | DW `public.empresas.certificado_validade` | `cnpj`, `certificado_validade` |
| Telefone e e-mail da empresa | DW `public.empresas.telefone`, `.email` | idem |
| Grupo fiscal | DW `public.grupos_fiscais` + `grupos_fiscais_raizes` (por raiz = 8 primeiros dígitos do CNPJ, só `ativo`) | `codigo`, `nome` |
| Último acesso ao Apura | DW `public.apura_usuarios` (por `cnpj`, `ativo`) | `max(ultimo_login_em)`, quantidade de usuários |
| Situação CNPJ | Receita via BrasilAPI `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}` com `User-Agent` (sem ele a API responde 403) | `descricao_situacao_cadastral`, `data_situacao_cadastral` |

**Nunca** ler `certificado_senha`, `certificado_nome` nem `apura_usuarios.senha` — as consultas listam colunas explicitamente. Nada é gravado no DW (usuário `agentes`, só leitura). Logs e agenda de download de XML ficam de fora (decisão do usuário).

## Onde fica

Nada vai para a tabela `Clientes`. Os dados entram no **mesmo retrato por CNPJ que a 1.7 já grava**, `DATA_DIR/dw-produtos.json` (`server/dw/retratoProdutos.cjs`) — um arquivo e uma rotina só (decisão do usuário: não criar um segundo JSON). Cada `porCnpj[cnpj]` ganha os campos abaixo ao lado dos produtos:

```json
{ "geradoEm": "...", "porCnpj": { "12345678000190": {
  "certificadoValidade": "2026-12-01", "telefone": "...", "email": "...",
  "grupoFiscal": { "codigo": "altese", "nome": "Altese" },
  "apura": { "usuarios": 2, "ultimoAcesso": "2026-10-28T..." },
  "receita": { "situacao": "ATIVA", "desde": "2005-11-03", "consultadoEm": "..." } } } }
```

- Parte DW: gerada no boot e no cron diário da máquina servidora (mesmo gatilho do retrato de produtos), só com `DW_PLATAFORMA_CONFIGURADO`.
- Parte Receita: semanal por idade (CNPJ consultado há 7+ dias ou nunca; a máquina não fica ligada no domingo, então dia fixo nunca rodaria), só para CNPJs das `lojasCadastro`; 700 ms entre consultas; falha de um CNPJ mantém o valor anterior. Gravação atômica (tmp + rename), como o retrato de produtos.
- Por que arquivo e não `Clientes`: o DW/Receita continuam sendo a fonte, e máquina em versão antiga não apaga o dado ao salvar cliente (o `normalizarLojas` da 1.6 descarta campos extras das lojas).
- Leitura: a mesma rota do retrato de produtos da 1.7 (lê o arquivo; vale em servidor e cliente). Front junta por CNPJ.

## Onde aparece

- **Carteira (lista, uma linha por loja):** coluna **"Vencimento Cert."** — data dd/MM/aaaa; vencido = número em `text-danger` + "vencido"; ≤ 60 dias = destaque (cor no número); sem dado = "—". Só para sessão `fiscal` ou `admin` (`lerSessao()`); Negócios não vê.
- **Ficha, aba Lojas:** por loja — situação CNPJ (texto; diferente de ATIVA em `text-danger`), vencimento do certificado, telefone, e-mail, grupo fiscal.
- **Ficha, bloco Contatos e acessos:** "Apura — último acesso dd/mm/aaaa" (ou "nunca acessou") quando a loja tem usuário Apura.
- **monitorIA:** `lojas` em `buscar_clientes`/identidade (`server/ia/tools.cjs`, onde já saem `nome/cnpj/endereco`) ganha `situacaoCnpj`, `certificadoValidade`, `grupoFiscal`, `apuraUltimoAcesso`; alerta novo **"Certificado vencendo"** em `server/ia/alertas.cjs` (vencido ou ≤ 30 dias; um cartão por cliente, com as lojas). A tela do monitorIA mostra esse tipo de alerta só para sessão `fiscal`/`admin`.

## Testes

- `montarRetrato` (da 1.7) estendido, puro: junta por CNPJ, grupo fiscal pela raiz, Apura pelo máximo, mantém Receita anterior quando a nova falhou.
- Consulta SQL: teste que a string das consultas não contém `senha` nem `certificado_nome`.
- `vencimentoCert(data, hoje)` → `{ texto, nivel: 'vencido' | 'perto' | 'ok' | 'sem' }` com bordas (hoje, 60 e 61 dias).
- Alerta: loja vencida, loja a 30 e a 31 dias, cliente sem dado.
- `toolsSchema.test.ts` continua verde.
