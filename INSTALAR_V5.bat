@echo off
setlocal
if "%~1"=="" (echo USO: INSTALAR_V5.bat "C:\pasta\do\MANU" [--check] & exit /b 2)
py -3 "%~dp0INSTALAR_V5.py" "%~1" %2
if errorlevel 1 (echo ERRO: verifique o texto acima. & exit /b 1)
endlocal
