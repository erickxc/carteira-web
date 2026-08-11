' Lançador do backend (server.cjs) para produção via Tarefa Agendada do Windows.
' Roda SEM janela de console (o "0" no sh.Run) e só inicia o Node depois que a
' pasta do OneDrive estiver disponível — no logon o OneDrive pode levar alguns
' segundos pra montar, e o server.cjs sai com erro se a pasta de dados não
' existir. Aqui a gente espera ela aparecer antes de subir.
'
' Nada de caminho de projeto/OneDrive fixo aqui: antes este script só servia na
' máquina Monitor1-2D (pasta C:\Carteira Web). Agora a pasta do projeto vem da
' localização do próprio .vbs e o OneDrive vem do .env (quando existe), então o
' mesmo arquivo funciona em qualquer máquina que rode a Carteira.
Option Explicit
Dim fso, sh, oneDrive, proj, node, envFile, args

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

' Pasta do projeto = pasta onde este .vbs está.
proj = fso.GetParentFolderName(WScript.ScriptFullName)
node = "C:\Program Files\nodejs\node.exe"

' Default = caminho da máquina de produção (Monitor1-2D), o mesmo default do
' server/config.cjs. Um .env na pasta do projeto sobrescreve.
oneDrive = "C:\Users\Monitor1-2D\OneDrive - 2dconsultores.com.br\01 - Marco + Monitores\6 - Erick"

envFile = fso.BuildPath(proj, ".env")
args = "server.cjs"
If fso.FileExists(envFile) Then
  ' Sem --env-file o Node ignora o .env e o server.cjs cai no caminho default,
  ' saindo com erro numa máquina cujo OneDrive fica em outro lugar.
  args = "--env-file=.env server.cjs"

  Dim ts, linha, pos, valor
  Set ts = fso.OpenTextFile(envFile, 1)
  Do Until ts.AtEndOfStream
    linha = Trim(ts.ReadLine)
    If Left(linha, 14) = "ONEDRIVE_ROOT=" Then
      valor = Trim(Mid(linha, 15))
      ' Tira aspas em volta do valor, se houver.
      If Len(valor) > 1 And Left(valor, 1) = """" And Right(valor, 1) = """" Then
        valor = Mid(valor, 2, Len(valor) - 2)
      End If
      If Len(valor) > 0 Then oneDrive = valor
    End If
  Loop
  ts.Close
End If

' Espera a pasta do OneDrive aparecer (até ~5 min, checando a cada 10s).
Dim tentativas
tentativas = 0
Do While (Not fso.FolderExists(oneDrive)) And (tentativas < 30)
  WScript.Sleep 10000
  tentativas = tentativas + 1
Loop

' Sobe o Node no diretório do projeto, janela oculta (0), e ESPERA (True) ele
' terminar. Se o Node cair por qualquer motivo (erro, OneDrive dessincronizou,
' etc.), o Run retorna e o loop sobe ele de novo — supervisor simples, sem
' depender do RestartOnFailure do Task Scheduler (que não pega crash de um
' processo desacoplado via Run assíncrono).
sh.CurrentDirectory = proj
Do
  sh.Run """" & node & """ " & args, 0, True
  WScript.Sleep 5000
Loop
