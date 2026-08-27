' Abre o 2D_Carteira.exe (mesma pasta deste arquivo) sem nenhuma janela
' de console visível — mesma técnica já usada em produção na Karol-2D
' (iniciar-servidor.vbs, ver CLAUDE.md): WScript.Shell.Run com janela 0
' (oculta) e "esperar terminar" = False (não bloqueia).
'
' O .exe empacotado com pkg é um executável "console" — clicado direto, abre
' uma janela preta que fica ali sem motivo (a real tela de status é a página
' de carregamento no navegador, não o console). Este .vbs é o que a pessoa
' deve clicar, não o .exe diretamente.
Dim fso, pastaAtual, caminhoExe
Set fso = CreateObject("Scripting.FileSystemObject")
pastaAtual = fso.GetParentFolderName(WScript.ScriptFullName)
caminhoExe = pastaAtual & "\2D_Carteira.exe"

CreateObject("WScript.Shell").Run """" & caminhoExe & """", 0, False
