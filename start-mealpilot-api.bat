@echo off
setlocal EnableExtensions

rem Keep console output ASCII so cmd.exe never renders batch text as mojibake.
chcp 65001 >nul
title MealPilot API

set "PROJECT_ROOT=%~dp0"
set "SERVER_ROOT=%PROJECT_ROOT%server"

if not exist "%SERVER_ROOT%\package.json" (
  echo [ERROR] Backend project folder not found: %SERVER_ROOT%
  goto :failed
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 18 or newer.
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js.
  goto :failed
)

cd /d "%~dp0server"
if errorlevel 1 (
  echo [ERROR] Cannot enter backend folder: %SERVER_ROOT%
  goto :failed
)

if not exist ".env" (
  echo [ERROR] Missing server\.env configuration file.
  echo [INFO] Copy server\.env.example to server\.env and fill in local database settings.
  goto :failed_in_server
)

if not exist "node_modules" (
  echo [INFO] Backend dependencies are missing. Running npm install...
  call npm install
  if errorlevel 1 goto :failed_in_server
)

echo [INFO] Applying idempotent database upgrades...
call npm run db:migrate
if errorlevel 1 goto :failed_in_server

netstat -ano -p tcp | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
  echo [WARN] Port 3000 is already in use.
  echo [INFO] Stop the old backend process and run this script again.
  echo [INFO] Restarting the backend is required after route changes.
  goto :failed_in_server
)

echo.
echo [INFO] Starting backend. Wait for the API listening message.
echo [INFO] Working directory: %CD%
echo [INFO] Keep this window open. Closing it stops the backend.
echo.

call npm run dev
set "EXIT_CODE=%errorlevel%"

echo.
if "%EXIT_CODE%"=="0" (
  echo [INFO] Backend stopped.
) else (
  echo [ERROR] Backend exited with code %EXIT_CODE%.
)
cd /d "%PROJECT_ROOT%"
pause
exit /b %EXIT_CODE%

:failed_in_server
cd /d "%PROJECT_ROOT%"

:failed
echo.
echo [INFO] Resolve the message above and run this script again.
pause
exit /b 1
