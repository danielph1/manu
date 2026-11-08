@echo off
setlocal
if "%~1"=="" (
 echo Uso: INSTALAR_AUROX.bat "C:\manuSiteOficialOriginal"
 exit /b 1
)
where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%~dp0aplicar_aurox.py" "%~1" %2
) else (
  python "%~dp0aplicar_aurox.py" "%~1" %2
)
if errorlevel 1 (
 echo Instalação cancelada por segurança. Nenhuma mudança parcial aplicada.
 exit /b 1
)
echo Fim. Confira LEIA_PRIMEIRO.md.
