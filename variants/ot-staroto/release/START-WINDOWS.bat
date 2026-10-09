@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node 20.19+ or 22.12+ and run this launcher again.
  pause
  exit /b 1
)
node START.cjs
pause
