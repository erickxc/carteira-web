# Memória Importada (2026-09-21)

Resumo dos principais aprendizados e decisões sincronizadas do backup de contextos/conversas.

## 🚨 Crítico — Não quebrar produção

### Testar com agente de chat: isolar AMBOS os paths

**Problema:** Tools do monitorIA (`criar_evento`, `criar_lembrete`) chamam `executarMutacao()` que IGNORA o repo injetado e abre `repoPlanilha()` internamente. `repoPlanilha()` usa `process.env.SQLITE_DIR` (não `ONEDRIVE_ROOT`), então um teste que só sobrescreve `ONEDRIVE_ROOT` vaza dados pra SQLite de produção.

**Como fazer:** ANTES de qualquer `require('./server/...')`:
```js
process.env.ONEDRIVE_ROOT = '/tmp/teste';
process.env.SQLITE_DIR = '/tmp/teste';
```

**Já aconteceu:** 
- 3 lembretes de teste vazaram pro banco real (27/08/2026)
- Dossiê real de cliente (Altese) foi sobrescrito com conteúdo de teste (27/08/2026)

**Se mexer com:** `server/ia/tools.cjs`, testes manuais, qualquer coisa com `criar_evento`/`criar_lembrete`.

---

## 📋 Decisões de Arquitetura

### Excel + OneDrive é a escolha final (não vai mudar)

Reabriu a discussão de multi-máquina/fila (`plano_seguranca_paralelismo.md`), porque apareceu necessidade real: alguém precisa acessar de máquina/rede sem acesso ao Apache da Karol-2D.

**Status:** plano de fila reaberto e em implementação.

**Leia:** `memory/decisao_excel_onedrive.md` pro contexto completo.

---

## 🎨 UI/Design

### Identidade × Categoria: Ponto colorido + texto, nunca fundo pastel

Usuário **rejeita fortemente** badges/pills com fundo colorido/pastel em qualquer parte da UI ("gerado por IA").

**Padrão correto:**
```tsx
<i style={{ background: 'cor-solida', borderRadius: '50%', width: 7, height: 7 }} />
<span className="text-text-secondary">{label}</span>
```

**Usar como referência:**
- `ClientesPage.tsx` (colunas Serviços e Situação)
- `ConfiguracoesPage.tsx` (preview de cores)

**Funções de cor:**
- `clienteStatusCor()` / `corDoServico()` — devolve cor sólida pra dot
- ~~`corDoServicoBg()` / `corDoServicoBorda()`~~ — DELETADAS, não recriar

**Parar de usar:** `Badge` component com fundo pastel pra exibir status (continuam existindo em outras telas; só mude se aparecer a mesma reclamação).

**Leia:** `memory/feedback_sem_bordas_coloridas_pastel.md`

---

## 📝 Documentação / Releases

### NOVIDADES.md: curto e direto

Bullets devem ser uma linha por item, sem explicar "porquê" ou contexto.

❌ **Errado:**
> Só funciona em quem abre pelo .exe local, em vez de precisar abrir um seletor de arquivo...

✅ **Certo:**
> Abrir arquivo de anexo direto na tela

**Leia:** `memory/feedback_novidades_resumido.md`

---

## 🔍 Debugging em Produção

### Log de erros: `launcher.log`

Arquivo: `C:\SistemaCarteira\app\launcher.log` (ou onde o `.exe` estiver instalado)

Contém **tudo**: mensagens do launcher + todo `console.log`/`console.error` do backend (`server.cjs`).

Quando usuário reportar erro, pedir/checar aí.

**Leia:** `memory/log_erros_carteira.md`

---

## 📚 Outras Memórias

Todas sincronizadas automaticamente em `~/.nexo/profiles/2d/claude/projects/C--projects-Carteira-Web/memory/`:

- `decisao_excel_onedrive.md` — contexto do design de persistência
- `feedback_teste_agente_sqlite.md` — armadilhas de teste (detalhado acima)
- `feedback_sem_bordas_coloridas_pastel.md` — design de badges (detalhado acima)
- `feedback_novidades_resumido.md` — estilo NOVIDADES.md (detalhado acima)
- `log_erros_carteira.md` — onde achar erros (detalhado acima)

---

**Importação:** 2026-09-22  
**Fonte:** `claude-todos-projetos-2026-09-21.zip`
