@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo ERRO: Node.js 22 ou superior nao foi encontrado.
 echo Instale em https://nodejs.org/
 pause
 exit /b 1
)
node --version
if not exist "server\.env" (
 copy "server\.env.example" "server\.env" >nul
 echo Configure a chave OpenAI em server\.env e execute este programa novamente.
 start "" notepad "%~dp0server\.env"
 pause
 exit /b 1
)
echo Servidor ChatGPT Voice Bridge iniciando...
node server\index.js
echo Servidor encerrado.
pause
