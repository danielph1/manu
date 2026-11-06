@echo off
setlocal
if "%~1"=="" (
 echo Informe a pasta local do MANU.
 echo Exemplo: aplicar-desempenho.bat "C:\manuSiteOficialOriginal"
 exit /b 2
)
py -3 "%~dp0aplicar_desempenho.py" "%~1"
if errorlevel 9009 (
 python "%~dp0aplicar_desempenho.py" "%~1"
)
exit /b %ERRORLEVEL%
