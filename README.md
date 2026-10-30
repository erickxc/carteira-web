# CARTEIRA 2D — Carteira de Monitoria da 2D Consultores

Gestão da carteira de monitoria: clientes e lojas, agenda de reuniões e entregas, cadência por serviço (Acompanhamento/Ações), lembretes, Visão Geral e Dashboard da Carteira, quadro Ágil, Dados Alvos (vendas) e o **monitorIA** (agente de análise de risco, chat com ferramentas, ata e apoio ao vivo nas reuniões). Interface preto e branco.

- **Mapa técnico**: [ARQUITETURA.md](ARQUITETURA.md)
- **Regras, decisões e histórico de bugs**: [CLAUDE.md](CLAUDE.md)
- **O que mudou em cada versão**: [NOVIDADES.md](NOVIDADES.md)
- **Documentos antigos**: [docs/historico/](docs/historico/)

## Stack

React 19 + TypeScript + Vite · Express (CommonJS) · **SQLite local** (`better-sqlite3`, em `%LOCALAPPDATA%\CarteiraWeb`) com espelho `.xlsx`, backups, anexos e fila multi-máquina **no OneDrive** · launcher `2D_Carteira.exe` · Vitest.

## Pré-requisitos

- Node.js 20+
- OneDrive sincronizado com a pasta da Carteira (o backend **não sobe** sem ela, de propósito — sem fallback local). Caminho padrão em `server/config.cjs`, sobrescrevível por `ONEDRIVE_ROOT` no `.env`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Backend (porta 3011) + Vite (5173) |
| `npm run start:dev` | Igual, sobre uma cópia dos dados em `.dev/` (backend na 3012) |
| `npm test` | Vitest (backend + utilitários do front) |
| `npm run build` | Zip da extensão + `tsc -b` + build do Vite |
| `npm run lint` | ESLint |
| `npm run build:launcher` | Regera o `.exe` (só ao mexer em `launcher/`) |
| `node server/scripts/publicarRelease.cjs` | Publica uma versão para as máquinas (ver CLAUDE.md) |

## Produção

Máquina Karol-2D: Apache (XAMPP) na porta 8080 serve o `dist/` e faz proxy de `/api` e `/uploads` para o Node em `127.0.0.1:3011`, iniciado pelo `2D_Carteira.exe`. Demais máquinas rodam em modo *client* e escrevem pela fila no OneDrive.

## Segurança

Sem autenticação (uso interno). O Node só escuta em loopback; o Apache é o único ponto exposto na LAN — confira que a porta 8080 não está encaminhada para a internet. Dados reais nunca vão para o Git.
