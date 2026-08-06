' Lançador do backend (server.cjs) para produção via Tarefa Agendada do Windows.
' Roda SEM janela de console (o "0" no sh.Run) e só inicia o Node depois que a
' pasta do OneDrive estiver disponível — no logon o OneDrive pode levar alguns
' segundos pra montar, e o server.cjs sai com erro se a pasta de dados não
' existir. Aqui a gente espera ela aparecer antes de subir.
Option Explicit
Dim fso, sh, oneDrive, proj, node
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

oneDrive = "C:\Users\Monitor1-2D\OneDrive - 2dconsultores.com.br\01 - Marco + Monitores\6 - Erick"
proj     = "C:\Carteira Web"
node     = "C:\Program Files\nodejs\node.exe"

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
  sh.Run """" & node & """ server.cjs", 0, True
  WScript.Sleep 5000
Loop
