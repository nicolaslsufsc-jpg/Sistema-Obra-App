@echo off
chcp 65001 >nul
title Sistema Obra na rede (deixe esta janela aberta)
if not exist "%~dp0servidor_python.py" (
  echo.
  echo Extraia o zip inteiro antes de abrir: botao direito no zip, Extrair tudo.
  echo.
  pause
  exit /b 1
)
cd /d "%~dp0"
echo.
echo  Abre o Sistema Obra para este PC e para celulares e tablets no mesmo Wi-Fi.
echo  Se o Windows perguntar sobre o acesso a rede, clique em PERMITIR.
echo.
where py >nul 2>nul && py "%~dp0servidor_python.py" rede && goto fim
where python >nul 2>nul && python "%~dp0servidor_python.py" rede && goto fim
echo.
echo Este PC nao tem Python, que o modo rede usa. Use o ABRIR_SISTEMA_OBRA.bat (so neste PC).
:fim
echo.
pause
