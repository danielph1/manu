@echo off
setlocal
if "%~1"=="" (
  echo Uso: INSTALAR_AUROX_TRIAGEM_POOL.bat "C:\manuSiteOficialOriginal" [--check]
  exit /b 2
)
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 "%~dp0INSTALAR_AUROX_TRIAGEM_POOL.py" "%~1" %2
) else (
  python "%~dp0INSTALAR_AUROX_TRIAGEM_POOL.py" "%~1" %2
)
if errorlevel 1 pause
