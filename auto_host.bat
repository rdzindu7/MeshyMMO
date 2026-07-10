@echo off
chcp 65001 >nul
title MeshyMMO Auto Host (NAO FECHE)
cd /d "%~dp0"
echo.
echo  MeshyMMO - subindo servidor + tunel publico automatico...
echo  Deixe esta janela aberta.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto_host.ps1"
echo.
echo  Auto host encerrou.
pause
