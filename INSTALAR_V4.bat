@echo off
setlocal
if "%~1"=="" (
 echo Uso: INSTALAR_V4.bat "C:\manuSiteOficialOriginal" --check
 exit /b 2
)
where py >nul 2>nul
if not errorlevel 1 (
 py -3 "%~dp0INSTALAR_V4.py" %*
) else (
 python "%~dp0INSTALAR_V4.py" %*
)
exit /b %errorlevel%
