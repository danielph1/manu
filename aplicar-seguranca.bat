@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Arraste a pasta do projeto para este BAT ou execute: aplicar-seguranca.bat "C:\caminho\manu"
  pause
  exit /b 1
)
py -3 aplicar-seguranca.py "%~1" --dry-run
if errorlevel 1 (
  echo Falha na verificacao. Nada foi alterado.
  pause
  exit /b 1
)
echo.
echo APLICAR? Antes, rode a migration SQL no Supabase e tenha backup do banco.
choice /c SN /m "Aplicar alteracoes"
if errorlevel 2 exit /b 0
py -3 aplicar-seguranca.py "%~1"
pause
