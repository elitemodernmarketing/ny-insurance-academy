@echo off
REM NY Insurance Licensing Academy - Windows launcher
REM Builds the app (first run installs dependencies) and serves it at http://localhost:4173
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20 LTS or newer is required: https://nodejs.org/ & pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies - first run only...
  call npm install || (pause & exit /b 1)
)
echo Building the app...
call npx vite build || (pause & exit /b 1)
echo.
echo Opening http://localhost:4173  - keep this window open while studying. Press Ctrl+C to stop.
start "" http://localhost:4173
call npx vite preview --port 4173 --strictPort
