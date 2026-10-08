@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node is not installed. Double-click PLAY.html instead.
  pause
  exit /b 1
)
node START.cjs
pause
