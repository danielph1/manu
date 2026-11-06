@echo off
setlocal
if "%~1"=="" (
 echo Informe o caminho do projeto MANU.
 echo Exemplo: aplicar-triagem-10s.bat "C:\manuSiteOficialOriginal"
 pause
 exit /b 2
)
where py >nul 2>nul
if %errorlevel% equ 0 (
 py -3 "%~dp0aplicar_triagem_10s.py" "%~1"
) else (
 python "%~dp0aplicar_triagem_10s.py" "%~1"
)
if errorlevel 1 pause
