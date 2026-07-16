# Carteira de Monitoria — 2D Consultores

Sistema local para gestão da carteira de monitoria: clientes, agendamento de reuniões, histórico, anotações, lembretes/alertas programados e dashboard. Interface preto e branco.

## Tecnologias

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Express (Node.js, `server.cjs`)
- **Dados:** planilha Excel (`database_dev.xlsx`) — lida/gravada via SheetJS, armazenada **dentro do OneDrive** (backup/sync automático), nunca versionada
- **Roteamento:** react-router-dom · **Datas:** date-fns · **Ícones:** lucide-react

## Pré-requisitos

- **Node.js 18+** (recomendado 20+)
- **OneDrive** instalado e sincronizado nesta máquina (o backend grava os dados lá — ver seção "Onde ficam os dados")

## Instalação

```bash
git clone https://github.com/erickxc/carteira-web.git
cd carteira-web
npm install
```

## Como rodar

```bash
npm start
```

Sobe backend + frontend juntos. Acesse **http://localhost:5173** (a API fica em `http://127.0.0.1:3001`).

Comandos individuais:

| Comando | O que faz |
|---|---|
| `npm start` | Backend (`server.cjs`, porta 3001) + Vite (porta 5173) via `concurrently` |
| `npm run dev` | Só o Vite (frontend) |
| `node server.cjs` | Só o backend (precisa do OneDrive disponível) |
| `npm run build` | `tsc -b` + build de produção do Vite (falha se houver erro de tipo) |
| `npm run lint` | ESLint sobre todo o projeto |
| `npm run preview` | Preview do build de produção |

## Onde ficam os dados

Todo o dado (planilha + anexos) vive **dentro do OneDrive**, nunca na pasta do projeto. O caminho está fixo no topo do `server.cjs`:

```js
const ONEDRIVE_ROOT = 'C:/Users/.../OneDrive - .../6 - Erick';
const DATA_DIR = path.join(ONEDRIVE_ROOT, 'Carteira Web');
// → database_dev.xlsx e uploads/ ficam em DATA_DIR
```

- Na primeira execução, o backend cria `database_dev.xlsx` (abas `Clientes`, `Agenda`, `Lembretes`, `Categorias`) e semeia as categorias iniciais.
- Se o OneDrive não estiver disponível, o servidor **falha ao iniciar** de propósito — nunca grava os dados em outro lugar.
- Para usar outra máquina/pasta, ajuste `ONEDRIVE_ROOT`/`DATA_DIR` no `server.cjs`.

## Funcionalidades

- **Dashboard** — cartões-resumo, reuniões por tipo, clientes por status, alertas de acompanhamento (clientes sem contato há 30+ dias, com botão "Programar relatório" em 1 clique) e painel de alertas programados.
- **Clientes** — CRUD, importação de Excel, monitor responsável, serviços, status e observação; página de detalhe com histórico de reuniões e anexos.
- **Agenda** — calendário interativo com feriados brasileiros (nacionais, estaduais RJ, municipais Duque de Caxias); eventos com assunto, tipo, status e anexos.
- **Lembretes / Alertas programados** — por tipo (Reunião, Relatório, Alvo…), com recorrência (diário/semanal/mensal) e popup de notificação nativa. O disparo antecipa para o dia útil anterior quando cai em fim de semana/feriado.
- **Categorias editáveis (CRUD)** — em *Configurações*: serviços, tipos de evento, status de cliente/evento, monitores e tipos de alerta.
- **Busca global (Ctrl+K)** — clientes, eventos, lembretes e datas.

## Segurança e privacidade

- Uso **estritamente local**: o backend escuta só em `127.0.0.1` (invisível na rede/Wi-Fi) e o CORS aceita apenas o próprio painel.
- `database_dev.xlsx`, `uploads/` e `.env` estão no `.gitignore` — **dados reais de clientes nunca vão para o Git**.
- Este repositório é **privado**.

## Estrutura

```
server.cjs            Backend Express + persistência em Excel (OneDrive)
src/
  api/client.ts       Cliente HTTP + (de)serialização
  context/            Estado global (CarteiraContext)
  pages/              Dashboard, Clientes, Detalhe, Agenda, Configurações
  components/         Sidebar, modais, cards, busca, popup de lembrete
  utils/              feriados, badges de status, formatadores
```
