@echo off
cd /d "%~dp0"
py -3.14 -X utf8 "%~dp0linea.py" install
if errorlevel 1 (echo Installazione non riuscita. Verifica Python 3.14 e il messaggio sopra.)
pause
