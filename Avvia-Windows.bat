@echo off
cd /d "%~dp0"
"%~dp0outputs\mio-agente-ai\.venv\Scripts\python.exe" -X utf8 "%~dp0linea.py" start
pause
