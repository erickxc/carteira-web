# Plano de segurança e paralelismo

## Objetivo

Permitir que executáveis instalados em máquinas diferentes, inclusive em redes diferentes, trabalhem sobre a mesma base Excel armazenada no OneDrive, sem perda de dados ou sobrescrita silenciosa.

## Arquitetura proposta

```text
Máquina A (.exe) ─┐
Máquina B (.exe) ─┼─ OneDrive compartilhado ─> Máquina controladora
Máquina C (.exe) ─┘                           └─ Excel oficial
```

As máquinas não precisam estar na mesma rede. Cada uma usa a cópia sincronizada pelo próprio OneDrive. A máquina controladora é a única responsável por aplicar alterações nas abas oficiais.

## Regra principal

Os executáveis não devem editar diretamente as abas oficiais (`Clientes`, `Agenda`, `Lembretes` etc.). Eles registram operações em uma fila.

Cada operação deve conter:

- `operationId`: UUID gerado no momento da ação;
- `machineId`: identificador persistente da máquina, com o MAC como dado inicial;
- `userName`: nome informado pelo usuário no primeiro uso do `.exe`;
- `createdAt`: data/hora local e, quando possível, UTC;
- `entity`: entidade alterada;
- `recordId`: ID do registro;
- `operation`: criar, atualizar ou excluir;
- `changes`: somente os campos alterados;
- `status`: pendente, processando, concluída ou erro;
- `attempts`: quantidade de tentativas;
- `error`: mensagem do último erro, quando houver.

O UUID é obrigatório. O MAC identifica a máquina e o nome identifica o usuário conforme informado no cadastro. Nenhum dos dois substitui autenticação.

## Cadastro do usuário no primeiro uso

Na primeira execução, o `.exe` solicita o nome do usuário e salva localmente a configuração da máquina. Exemplo:

```json
{
  "machineId": "AA-BB-CC-DD-EE-FF",
  "userName": "Nome informado",
  "registeredAt": "2026-08-12T12:00:00.000Z"
}
```

Esse nome é incluído em todas as operações e exibido como usuário ativo no sistema. A troca deve ocorrer somente por uma opção explícita, como `Alterar usuário`, registrando o nome anterior, o novo nome, o MAC e o horário no log.

O nome informado serve para auditoria, não como prova de identidade.

## Fila de operações

Para reduzir conflitos no arquivo principal, a primeira versão deve usar uma destas estratégias, em ordem de preferência:

1. Um arquivo de fila por máquina, por exemplo `fila_<machineId>.xlsx` ou `.json`, sincronizado pelo OneDrive. A máquina controladora lê todas as filas.
2. Uma aba única `Fila_Operacoes`, apenas se os testes confirmarem que o OneDrive não está gerando conflitos entre gravações simultâneas.

Arquivos de fila separados são mais seguros porque cada máquina escreve apenas no próprio arquivo. A base oficial continua com um único gravador.

## Funcionamento do controller

O controller roda apenas na máquina central e verifica as filas em intervalos curtos.

Para cada operação encontrada:

1. valida o formato e os campos permitidos;
2. verifica se `operationId` já foi processado;
3. recarrega a versão mais recente da base oficial;
4. confere se o registro ainda está na versão esperada;
5. aplica somente os campos enviados;
6. grava uma cópia de backup antes da alteração;
7. salva a base de forma atômica;
8. marca a operação como concluída;
9. registra o resultado em um log.

O controller deve processar uma operação por vez. O intervalo de 10 segundos pode ser usado como janela de agrupamento, mas não deve ser considerado um bloqueio confiável.

## Idempotência e duplicidade

Se uma máquina reenviar uma operação após uma falha de conexão, o controller deve reconhecer o mesmo `operationId` e não aplicar a mudança duas vezes.

Uma operação só pode ser marcada como concluída depois que a gravação da base oficial terminar com sucesso.

## Conflitos

Se duas pessoas alterarem campos diferentes do mesmo registro, o controller pode mesclar as alterações.

Se alterarem o mesmo campo, a operação mais recente não deve sobrescrever automaticamente a anterior. O controller deve registrar conflito e deixar a operação em `erro` ou `conflito` para revisão.

Exemplo:

- Máquina A altera `status` do cliente;
- Máquina B altera `monitor` do mesmo cliente;
- as duas alterações podem ser mescladas;
- se ambas alterarem `status`, é necessário escolher ou revisar.

## Integridade do Excel

Toda gravação da base oficial deve:

- ler o arquivo completo antes da alteração;
- preservar os headers conhecidos;
- gravar em arquivo temporário;
- substituir o arquivo original apenas depois da gravação completa;
- manter backup rotativo;
- tentar novamente se o OneDrive ou o Excel estiver usando o arquivo;
- nunca gravar em um arquivo vazio ou parcialmente sincronizado.

O controller deve verificar se o arquivo está disponível localmente e se o OneDrive está em estado operacional. A confirmação local não garante que a nuvem já sincronizou, por isso a operação deve permanecer registrada até a próxima verificação.

## Falhas e recuperação

### OneDrive offline

O `.exe` mantém a operação na fila local. Quando o OneDrive voltar, a fila é sincronizada e o controller processa a operação.

### Controller desligado

As operações permanecem pendentes nas filas. Ao iniciar, o controller retoma o processamento sem duplicar operações já concluídas.

### Arquivo bloqueado

O controller aguarda e tenta novamente com limite de tentativas. Depois disso, registra erro e mostra a situação para revisão.

### Conflito do OneDrive

O controller não deve escolher silenciosamente uma versão. Deve preservar a cópia conflitante, registrar o incidente e impedir novas gravações até a base ser reconciliada.

## Segurança

- O arquivo Excel e as filas devem ficar em uma biblioteca/pasta do OneDrive com permissões restritas.
- Os executáveis não devem aceitar caminhos arbitrários para a base.
- O caminho encontrado pelo instalador deve ser validado e salvo em configuração local.
- Operações devem aceitar somente entidades e campos conhecidos.
- O controller deve registrar máquina, horário, operação e resultado.
- Backups devem ser mantidos fora do arquivo principal, com retenção definida.
- O MAC não deve ser tratado como autenticação; ele é apenas identificação técnica.
- O nome informado pelo usuário deve ser tratado como dado de auditoria, não como autenticação.
- Alterações no nome cadastrado devem ficar registradas no log.

## Experimento inicial

Antes de colocar dados reais em risco:

1. criar uma cópia de teste da base;
2. instalar o `.exe` em duas máquinas de redes diferentes;
3. testar criação simultânea de clientes;
4. testar atualização do mesmo campo por duas máquinas;
5. desligar o OneDrive durante uma gravação;
6. desligar o controller durante o processamento;
7. provocar duplicação da mesma operação;
8. verificar backups, logs e recuperação;
9. somente depois testar com uma cópia controlada da base real.

## Critério para produção

O sistema só deve ser considerado seguro quando:

- nenhuma operação válida for perdida;
- nenhuma operação for aplicada duas vezes;
- conflitos forem identificados explicitamente;
- o backup permitir restauração;
- filas offline forem processadas após reconexão;
- o Excel oficial tiver apenas um gravador.

## Decisão recomendada

O melhor desenho mantendo Excel é: `.exe` com fila local por máquina, OneDrive como transporte, controller central como único gravador e Excel oficial protegido contra edição direta pelos executáveis.

Gravação direta de várias máquinas na mesma planilha pode funcionar em testes simples, mas não oferece garantia suficiente contra conflitos de sincronização.
