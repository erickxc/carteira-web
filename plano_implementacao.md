# GestorPro — Transformação Comercial Multi-Usuário

Transformar o sistema pessoal "Carteira Web" em um **produto comercial multi-usuário** chamado **GestorPro**, com PostgreSQL como banco de dados, controle administrativo, dashboard de equipe e redesign visual minimalista com **modo claro e escuro** (sem glassmorphism).

---

## User Review Required

> [!IMPORTANT]
> **Banco de dados**: Migrando de `database.xlsx` para **PostgreSQL**. Será necessário ter o PostgreSQL instalado e rodando localmente. O servidor criará as tabelas automaticamente na primeira execução. A conexão padrão será `postgresql://postgres:postgres@localhost:5432/gestorpro`.

> [!IMPORTANT]
> **Usuários pré-configurados**: Na primeira execução, o sistema cria automaticamente **3 usuários**:
> | Usuário | Senha | Role | Nome |
> |---------|-------|------|------|
> | `admin` | `admin123` | admin | Administrador |
> | `func1` | `func123` | funcionario | Funcionário 1 |
> | `func2` | `func123` | funcionario | Funcionário 2 |
>
> O admin poderá cadastrar/editar/remover funcionários pela interface.

> [!IMPORTANT]
> **Segurança robusta**: Mesmo rodando local, o sistema terá segurança profissional:
> - **bcrypt** para hash de senhas (nunca armazenadas em texto plano)
> - **JWT (JSON Web Token)** com expiração de **8 horas** para sessões
> - **Middleware de autenticação** protegendo todas as rotas da API
> - **JWT_SECRET** configurável via variável de ambiente (gerado automaticamente se ausente)
> - Sim, haverá um **servidor Express local** rodando (`localhost:3001`) que gerencia toda a autenticação e acesso ao banco

> [!WARNING]
> **Breaking change — Layout**: O layout muda completamente de **sidebar lateral** para **navbar superior**. 

> [!WARNING]
> **Breaking change — Visual**: A identidade visual atual (dark glassmorphism com blur, degradês, glow) será **completamente removida** e substituída por um design minimalista com **dois temas** (claro e escuro), ambos sem glassmorphism, sem backdrop-filter, sem gradientes.

> [!WARNING]
> **Breaking change — Banco de dados**: A migração de Excel para PostgreSQL exige que o PostgreSQL esteja rodando na máquina. Os dados antigos do `database.xlsx` **não serão migrados automaticamente**. Se precisar de um script de migração, sinalize.

---

## Proposed Changes

### 1. Banco de Dados — Migração para PostgreSQL

#### [MODIFY] [package.json](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/package.json)

**Novas dependências:**
- `pg` — Driver nativo do PostgreSQL para Node.js
- `bcrypt` — Hash de senhas com salt rounds
- `jsonwebtoken` — Geração e verificação de JWT
- Remoção de `xlsx` das dependências do servidor (mantém apenas para importação no frontend)

#### [MODIFY] [server.cjs](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/server.cjs)

**Reescrita completa do backend** para usar PostgreSQL + segurança:

1. **Conexão com PostgreSQL** via `pg.Pool`:
   ```
   postgresql://postgres:postgres@localhost:5432/gestorpro
   ```

2. **Criação automática de tabelas** na inicialização:
   - `usuarios` (`id UUID PK`, `username VARCHAR UNIQUE`, `password_hash VARCHAR`, `name`, `role`, `created_at`)
   - `clientes` (`id UUID PK`, `empresa`, `monitoria BOOL`, `price BOOL`, `controladoria BOOL`, `observacao`, `suspenso BOOL`, `user_id FK`, `created_at`)
   - `agenda` (`id UUID PK`, `client_id FK`, `client_name`, `date TIMESTAMP`, `type`, `description`, `status`, `user_id FK`, `notified_day BOOL`, `notified_previous_day BOOL`, `created_at`)
   - `lembretes` (`id UUID PK`, `title`, `datetime TIMESTAMP`, `description`, `status`, `client_id`, `recurrence`, `user_id FK`, `created_at`)

3. **Seed de usuários pré-configurados** (se tabela vazia) — senhas hasheadas com bcrypt:
   - `admin / admin123 / Administrador / admin`
   - `func1 / func123 / Funcionário 1 / funcionario`
   - `func2 / func123 / Funcionário 2 / funcionario`

---

### 2. Segurança — JWT + bcrypt + Middleware

#### Arquitetura de Segurança

```
┌─────────┐     POST /api/auth/login      ┌──────────────┐
│ Frontend │ ──────────────────────────────▶│   Servidor   │
│ (React)  │     { username, password }     │  (Express)   │
│          │◀──────────────────────────────│              │
│          │     { token, user }            │  bcrypt.compare()
└────┬─────┘                               │  jwt.sign()  │
     │                                     └──────┬───────┘
     │  GET /api/clients                          │
     │  Authorization: Bearer <token>              │
     │ ──────────────────────────────────────────▶│
     │                                     ┌──────┴───────┐
     │                                     │ authMiddleware│
     │                                     │ jwt.verify()  │
     │                                     │ req.user = {} │
     │                                     └──────┬───────┘
     │◀────────────────────────────────────────────│
     │     [dados filtrados por user_id]           │
```

#### Detalhamento:

**1. Hash de senhas com bcrypt:**
- Salt rounds: `10`
- Ao criar ou editar usuário, a senha é hasheada via `bcrypt.hash(password, 10)`
- Ao fazer login, valida via `bcrypt.compare(inputPassword, storedHash)`
- A coluna no banco é `password_hash` — nenhuma senha em texto plano é armazenada

**2. JWT com expiração:**
- `JWT_SECRET` — string gerada automaticamente via `crypto.randomBytes(64).toString('hex')` na primeira execução, salva em `.env`
- Token gerado no login via `jwt.sign({ id, username, role }, JWT_SECRET, { expiresIn: '8h' })`
- Payload do token: `{ id, username, name, role, iat, exp }`
- Expiração: **8 horas** (alinhado com jornada de trabalho)
- Após expirar, o frontend redireciona para a tela de login

**3. Middleware de autenticação (`authMiddleware`):**
- Aplicado em **todas as rotas** exceto `POST /api/auth/login`
- Extrai token do header `Authorization: Bearer <token>`
- Verifica e decodifica com `jwt.verify(token, JWT_SECRET)`
- Se válido → popula `req.user` com `{ id, username, name, role }`
- Se inválido/expirado → retorna `401 Unauthorized`

**4. Middleware de autorização (`adminOnly`):**
- Aplicado nos endpoints de gerenciamento de usuários
- Verifica se `req.user.role === 'admin'`
- Se não → retorna `403 Forbidden`

**5. Filtro por `user_id`:**
- O `user_id` é extraído automaticamente do JWT (`req.user.id`)
- Admin vê todos os dados (sem filtro WHERE)
- Funcionário vê apenas os seus (`WHERE user_id = $1`)
- Ao criar registros, o `user_id` do JWT é vinculado automaticamente
- Nenhum endpoint aceita `userId` via query param — **sempre vem do token** (impede spoofing)

#### Endpoints de autenticação e usuários:

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/api/auth/login` | ❌ Público | Valida credenciais, retorna `{ token, user }` |
| `POST` | `/api/auth/refresh` | ✅ JWT | Renova token se ainda válido (gera novo com +8h) |
| `GET` | `/api/users` | ✅ Admin | Lista todos os usuários (sem password_hash) |
| `POST` | `/api/users` | ✅ Admin | Cria novo usuário (senha hasheada) |
| `PUT` | `/api/users/:id` | ✅ Admin | Edita usuário (re-hasheia se senha alterada) |
| `DELETE` | `/api/users/:id` | ✅ Admin | Remove usuário (impede excluir a si mesmo) |

#### Endpoints de dados (todos protegidos com JWT):

| Método | Rota | Auth | Filtro |
|--------|------|------|--------|
| `GET/POST/PUT/DELETE` | `/api/clients` | ✅ JWT | Por `user_id` do token |
| `POST` | `/api/clients/bulk` | ✅ JWT | `user_id` do token |
| `GET/POST/PUT/DELETE` | `/api/agenda` | ✅ JWT | Por `user_id` do token |
| `POST` | `/api/agenda/bulk` | ✅ JWT | `user_id` do token |
| `GET/POST/PUT/DELETE` | `/api/reminders` | ✅ JWT | Por `user_id` do token |

#### [NEW] [.env](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/.env)

Gerado automaticamente na primeira execução se não existir:
```env
JWT_SECRET=<random_64_bytes_hex>
DB_URL=postgresql://postgres:postgres@localhost:5432/gestorpro
```

#### [MODIFY] [.gitignore](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/.gitignore)

- Adicionar `.env` (contém JWT_SECRET — nunca versionar)
- Remover referência ao `database.xlsx`

---

### 3. Design System — Redesign Minimalista com Modo Claro e Escuro

#### [MODIFY] [design-system.css](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/styles/design-system.css)

Reescrita total do design system com **dois temas via CSS variables** e sem glassmorphism:

**Modo Claro (padrão — `[data-theme="light"]` ou `:root`):**

| Token | Valor |
|---|---|
| `--bg-main` | `#F5F6F8` |
| `--bg-card` | `#FFFFFF` |
| `--bg-card-hover` | `#F9FAFB` |
| `--bg-sidebar` | `#FFFFFF` |
| `--text-primary` | `#111827` |
| `--text-secondary` | `#6B7280` |
| `--text-muted` | `#9CA3AF` |
| `--border-color` | `#E5E7EB` |
| `--input-bg` | `#F9FAFB` |

**Modo Escuro (`[data-theme="dark"]`):**

| Token | Valor |
|---|---|
| `--bg-main` | `#111318` |
| `--bg-card` | `#1A1D24` |
| `--bg-card-hover` | `#22262E` |
| `--bg-sidebar` | `#1A1D24` |
| `--text-primary` | `#F3F4F6` |
| `--text-secondary` | `#9CA3AF` |
| `--text-muted` | `#6B7280` |
| `--border-color` | `#2D3139` |
| `--input-bg` | `#22262E` |

**Cores de acento (compartilhadas entre temas):**

| Token | Valor |
|---|---|
| `--accent-primary` | `#2563EB` |
| `--accent-primary-hover` | `#1D4ED8` |
| `--accent-success` | `#059669` |
| `--accent-warning` | `#D97706` |
| `--accent-danger` | `#DC2626` |

**O que é removido:**
- ❌ `backdrop-filter: blur()` — eliminado em todo o sistema
- ❌ `rgba()` em backgrounds — substituído por cores sólidas
- ❌ `linear-gradient()` nos botões — cor sólida flat
- ❌ `.title-glow` com gradient text — texto sólido simples
- ❌ `box-shadow: glow/neon` — sombra sutil `0 1px 3px rgba(0,0,0,0.08)`
- ❌ `border-radius: 16px` — reduzido para `8px`
- ❌ `color-scheme: dark` fixo — dinâmico via data-theme

**O que é adicionado:**
- ✅ Toggle de tema via `data-theme` no `<html>`
- ✅ `.card` como substituto de `.glass-card` (fundo sólido, borda sutil, sombra leve)
- ✅ Botões flat com cores sólidas
- ✅ Inputs com fundo `--input-bg` e borda `--border-color`
- ✅ Badges com cores sólidas leves
- ✅ Layout flex column (navbar + conteúdo) ao invés de grid com sidebar

---

### 4. Autenticação e Multi-Usuário (Frontend)

#### [NEW] [AuthContext.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/context/AuthContext.jsx)

Novo contexto de autenticação React:
- Estado: `user` (null = deslogado, objeto = logado com `id`, `username`, `name`, `role`)
- `token` — armazenado em state + `sessionStorage`
- `login(username, password)` → `POST /api/auth/login` → recebe `{ token, user }` → armazena ambos
- `logout()` → limpa state, sessionStorage, e redireciona para login
- `isAdmin` — derivado de `user.role === 'admin'`
- **Auto-logout**: verifica periodicamente se o token expirou (decodifica `exp` do JWT) e faz logout automático
- **Interceptor**: fornece função `authFetch()` que inclui automaticamente o header `Authorization: Bearer <token>` em todas as requisições
- Se a API retornar `401`, faz logout automático (token expirado/inválido)

#### [NEW] [LoginPage.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/LoginPage.jsx)

Tela de login minimalista e centralizada:
- Logo "GestorPro" no topo
- Campo de usuário e senha
- Botão "Entrar"
- Mensagem de erro inline caso credenciais inválidas
- Visual limpo, funciona nos dois temas (claro/escuro)

---

### 5. Navbar Superior

#### [NEW] [Navbar.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/Navbar.jsx)

Substitui a `Sidebar.jsx` por navbar horizontal fixa no topo:
- **Esquerda**: Logo "GestorPro"
- **Centro**: Navegação — Dashboard | Clientes | Agenda (+ "Equipe" visível apenas para admin)
- **Direita**: 
  - Botão busca (Ctrl+K)
  - Botão "Novo Evento"
  - Botão "Novo Lembrete"
  - Toggle de tema (☀️/🌙)
  - Nome do usuário logado + botão logout
- Altura fixa: `~60px`
- Borda inferior: `1px solid var(--border-color)`
- Fundo sólido: `var(--bg-card)`

#### [DELETE] [Sidebar.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/Sidebar.jsx)

Removida — funcionalidade migrada para `Navbar.jsx`.

---

### 6. Dashboard Administrativo (Admin)

#### [NEW] [AdminDashboard.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/AdminDashboard.jsx)

Tela exclusiva do admin ("Equipe") com visão consolidada:

- **Cards de resumo global**: Total de clientes, alertas pendentes, reuniões agendadas, lembretes ativos (de toda a equipe)
- **Tabela de desempenho por funcionário**:
  - Nome do funcionário
  - Qtd de clientes
  - Reuniões realizadas (últimos 30 dias)
  - Precificações realizadas (últimos 30 dias)
  - Alertas pendentes
- **Seção de Gerenciamento de Usuários**:
  - Lista de usuários com nome, username, role
  - Botão "Novo Funcionário"
  - Botões de editar/excluir por funcionário
  - Modal de criação/edição de usuário

---

### 7. Atualização dos Componentes Existentes

#### [MODIFY] [App.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/App.jsx)

- Envolve tudo com `<AuthProvider>`
- Se não logado → mostra `<LoginPage />`
- Se logado → mostra `<Navbar />` + conteúdo da view ativa
- Admin vê rota "Equipe" (`<AdminDashboard />`) adicional no menu
- Layout muda de `grid-template-columns: 260px 1fr` para `flex-direction: column` (navbar em cima, conteúdo embaixo)

#### [MODIFY] [main.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/main.jsx)

- Importar `AuthProvider` e envolver `App`

#### [MODIFY] [index.html](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/index.html)

- Adiciona `<link>` para Google Fonts Inter (400, 500, 600, 700)
- Atualiza `<title>` para "GestorPro"
- Adiciona `data-theme="light"` no `<html>` como padrão

#### [MODIFY] [Dashboard.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/Dashboard.jsx)

- Substitui `glass-card` por `card` (novo design system)
- Remove `title-glow` — usa texto sólido `var(--text-primary)`
- Remove todos os `rgba()` hardcoded nos backgrounds — usa variáveis CSS
- Filtra dados pelo `userId` do usuário logado (se funcionário)
- Cores dos badges e stat cards adaptadas para funcionar em ambos os temas

#### [MODIFY] [ClientManager.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/ClientManager.jsx)

- Substitui `glass-card` por `card`
- Remove `title-glow`
- Remove `rgba()` hardcoded — usa variáveis do tema
- Vincula cada novo cliente ao `userId` do funcionário logado
- Modal de formulário: background sólido, sem blur

#### [MODIFY] [AgendaManager.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/AgendaManager.jsx)

- Substitui `glass-card` por `card`
- Remove `title-glow`
- Calendário: fundo `var(--bg-card)`, bordas `var(--border-color)`, sem rgba
- Vincula eventos ao `userId`
- Tooltip: fundo sólido `var(--bg-card)`, sem blur

#### [MODIFY] [GlobalSearch.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/GlobalSearch.jsx)

- Overlay: `var(--bg-main)` com opacidade, sem blur
- Card da busca: `var(--bg-card)` sólido
- Textos usam variáveis do tema
- Filtra resultados pelo `userId` (funcionário vê apenas seus)

#### [MODIFY] [ReminderFormModal.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/ReminderFormModal.jsx)

- Modal: fundo sólido, sem blur
- Botão salvar: cor sólida `var(--accent-primary)`, sem gradiente
- Vincula lembrete ao `userId`

#### [MODIFY] [ReminderPopup.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/components/ReminderPopup.jsx)

- Popup: fundo sólido `var(--bg-card)`, sem blur
- Cores adaptadas para funcionar em ambos os temas

#### [MODIFY] [ClientContext.jsx](file:///c:/Users/bi_2d_gzgh6n0/Desktop/Yann/Carteira%20Web/src/context/ClientContext.jsx)

- Usa `authFetch()` do `AuthContext` em vez de `fetch()` direto — todas as requisições incluem JWT automaticamente
- O `userId` **não é enviado como parâmetro** — o backend extrai do token JWT (mais seguro)
- A filtragem por funcionário é feita no backend via JWT (PostgreSQL query `WHERE user_id = $1`)
- Se qualquer chamada retornar `401`, o AuthContext faz logout automático

---

### 8. Funcionalidades Preservadas (sem alteração de lógica)

Todas as funcionalidades atuais serão mantidas — apenas o visual, o banco e a camada de filtro por usuário mudam:

- ✅ CRUD de clientes
- ✅ Agenda com calendário interativo e tooltips
- ✅ Lembretes recorrentes com popup de notificação
- ✅ Busca global (Ctrl+K) com navegação por data
- ✅ Feriados brasileiros (nacionais, estaduais RJ, municipais DC)
- ✅ Importação de Excel (clientes e histórico)
- ✅ Recomendações inteligentes de acompanhamento
- ✅ Automação Windows (scripts .vbs/.ps1/.bat)

---

### 9. Resumo de Arquivos

| Ação | Arquivo |
|------|---------|
| **MODIFY** | `server.cjs` — Reescrita total: PostgreSQL + JWT + bcrypt + middlewares |
| **MODIFY** | `package.json` — Adicionar `pg`, `bcrypt`, `jsonwebtoken` |
| **MODIFY** | `design-system.css` — Reescrita total (claro + escuro) |
| **MODIFY** | `index.html` — Google Fonts, título, data-theme |
| **MODIFY** | `main.jsx` — AuthProvider |
| **MODIFY** | `App.jsx` — Auth gate, navbar, layout |
| **MODIFY** | `Dashboard.jsx` — Redesign + userId filter |
| **MODIFY** | `ClientManager.jsx` — Redesign + userId |
| **MODIFY** | `AgendaManager.jsx` — Redesign + userId |
| **MODIFY** | `GlobalSearch.jsx` — Redesign + userId filter |
| **MODIFY** | `ReminderFormModal.jsx` — Redesign + userId |
| **MODIFY** | `ReminderPopup.jsx` — Redesign |
| **MODIFY** | `ClientContext.jsx` — userId integration |
| **MODIFY** | `.gitignore` — Adicionar `.env` (JWT_SECRET) |
| **NEW** | `.env` — JWT_SECRET + DB_URL (auto-gerado) |
| **NEW** | `AuthContext.jsx` — Contexto de autenticação |
| **NEW** | `LoginPage.jsx` — Tela de login |
| **NEW** | `Navbar.jsx` — Navegação superior |
| **NEW** | `AdminDashboard.jsx` — Painel de equipe |
| **DELETE** | `Sidebar.jsx` — Substituída pela Navbar |

---

## Verification Plan

### Automated Tests
```bash
# Build e verificar que não há erros de compilação
npm run build
```

### Manual Verification
1. **PostgreSQL**: Verificar que o servidor cria as tabelas e seeds automaticamente
2. **Segurança — Login**: Testar login com `admin/admin123`, `func1/func123`, `func2/func123`
3. **Segurança — Token**: Verificar que o JWT é retornado no login e enviado em todas as requisições
4. **Segurança — Expiração**: Verificar que após alterar manualmente o token, a API retorna 401
5. **Segurança — Senhas**: Verificar no PostgreSQL que `password_hash` contém hash bcrypt (começa com `$2b$`)
6. **Segurança — Admin**: Verificar que endpoints de usuários retornam 403 para funcionários
7. **Admin**: Verificar que admin vê dashboard de equipe, pode cadastrar funcionários, e vê todos os dados
8. **Funcionário**: Verificar que funcionário vê apenas seus clientes/eventos/lembretes
9. **Tema claro**: Confirmar que não há glassmorphism, degradês, glow ou blur — tudo minimalista e sólido
10. **Tema escuro**: Confirmar que o toggle funciona e o escuro também é minimalista (sem glass)
11. **Funcionalidades**: Testar CRUD de clientes, agenda, lembretes, busca global, importação Excel
12. **Navbar**: Verificar que navegação funciona corretamente no topo
