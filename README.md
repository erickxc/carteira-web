# Carteira Web

Sistema de gerenciamento de carteira de clientes local com agenda, lembretes recorrentes e dashboard inteligente.

## Tecnologias

- **Frontend:** React 19 + Vite
- **Backend:** Express (Node.js)
- **Banco de dados:** Arquivo Excel (`database.xlsx`) salvo dentro do OneDrive (backup/sync automático)
- **Estilização:** CSS customizado (glassmorphism / dark mode)

## Como Executar

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar o projeto manualmente
npm start
```

O sistema estará disponível em `http://localhost:5173` e a API em `http://127.0.0.1:3001`.

## Funcionalidades

- 📊 **Dashboard** com visão geral, alertas de acompanhamento e lembretes.
- 👥 **Gerenciamento de Clientes** completo com histórico.
- 📅 **Agenda** com calendário interativo, highlight por data e tooltips.
- 🔔 **Lembretes Recorrentes** (diário, semanal, mensal) com popup de notificação do Windows.
- 🔍 **Busca Global (Ctrl+K)** interativa (clientes, eventos, lembretes e datas).
- 📆 **Feriados Brasileiros** inteligentes (nacionais, estaduais RJ e municipais Duque de Caxias) com cálculo de dia útil retroativo para notificações.

## ⚠️ Segurança e Privacidade

Este projeto foi desenhado **exclusivamente para uso local (offline/localhost)**, garantindo a privacidade dos dados reais dos clientes que ficam armazenados na sua própria máquina. 

Para sua proteção:
- **Blindagem de Rede:** O servidor escuta estritamente a interface `127.0.0.1`. Ele é **invisível e inacessível** para outros dispositivos conectados no mesmo Wi-Fi ou rede local.
- **CORS Restrito:** Apenas o próprio painel da Carteira Web tem permissão para se comunicar com a API e o banco de dados.
- O arquivo de banco de dados (`database.xlsx`) e os anexos ficam fora da pasta do projeto, dentro do OneDrive — nunca são versionados no Git.

## Automação (Windows)

O projeto inclui um ecossistema de scripts locais para facilitar o uso no dia a dia sem abrir telas pretas (CMD):

- `Ligar_Sistema.vbs`: Inicia silenciosamente o Node.js e o ícone de atalho na bandeja (Tray) perto do relógio.
- `Desligar_Sistema.vbs`: Encerra totalmente a aplicação.
- `monitor_tray.ps1`: Cria o ícone interativo na bandeja do Windows para ligar/desligar o sistema.
- `Configurar_Agendamento.bat`: Registra tarefas automáticas no Windows (Liga de Seg-Sex às 08:00, desliga às 18:00).

*(Estes scripts dispensam caminhos absolutos e se adaptam dinamicamente ao local onde a pasta for salva).*

## Licença

Uso pessoal.
