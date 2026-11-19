@echo off
title Sistema Obra (deixe esta janela aberta)
if not exist "%~dp0servidor.ps1" (
  echo.
  echo Extraia o zip inteiro antes de abrir: botao direito no zip, Extrair tudo.
  echo.
  pause
  exit /b 1
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -Site app %*
if not errorlevel 1 goto fim
echo.
echo O PowerShell nao conseguiu abrir. Tentando pelo Python...
where py >nul 2>nul && py "%~dp0servidor_python.py" app && goto fim
where python >nul 2>nul && python "%~dp0servidor_python.py" app && goto fim
echo.
echo Nao deu para abrir neste PC. Veja no LEIA-ME.txt a parte "Se nao abrir".
:fim
echo.
pause
