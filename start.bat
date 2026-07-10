@echo off
chcp 65001 >nul
title MeshyMMO-Server (NAO FECHE ESTA JANELA)
cd /d "%~dp0"

echo.
echo  ================================================
echo   MeshyMMO - Astralon Online
echo  ================================================
echo.
echo  IMPORTANTE: deixe ESTA janela aberta enquanto joga.
echo  Se fechar, o site cai (ERR_CONNECTION_REFUSED).
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [ERRO] Node.js nao encontrado.
  echo  Instale em https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo  Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo  Falha no npm install
    pause
    exit /b 1
  )
)

REM libera porta 3000 se estiver presa
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

echo  Subindo servidor...
start "" "http://127.0.0.1:3000/?dev=1"
timeout /t 1 /nobreak >nul

echo.
echo  URL:  http://127.0.0.1:3000/?dev=1
echo  DEV:  dev / dev123
echo  Hero: DevHero
echo.
echo  ================================================
echo   Servidor em execucao - NAO FECHE
echo  ================================================
echo.

node server/index.js

echo.
echo  Servidor parou.
pause
