@echo off
setlocal EnableExtensions EnableDelayedExpansion

chcp 65001 >nul
title MealPilot API

rem Always resolve paths from this file, so it works from a desktop shortcut too.
set "PROJECT_ROOT=%~dp0"
set "SERVER_ROOT=%PROJECT_ROOT%server"
set "API_PORT=3000"
if /I "%~1"=="migrate" set "MEALPILOT_RUN_MIGRATION=1"

if not exist "%SERVER_ROOT%\package.json" (
  echo [ERROR] Backend folder not found:
  echo         %SERVER_ROOT%
  goto :failed
)

if not exist "%SERVER_ROOT%\.env" (
  echo [ERROR] Missing configuration file: %SERVER_ROOT%\.env
  echo [INFO]  Copy server\.env.example to server\.env and fill in local settings.
  goto :failed
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH. Install Node.js 18 or newer.
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH. Reinstall Node.js or repair PATH.
  goto :failed
)

rem Read PORT from server\.env without printing any secret values.
for /f "usebackq tokens=1,* delims==" %%A in ("%SERVER_ROOT%\.env") do (
  if /I "%%A"=="PORT" if not "%%B"=="" set "API_PORT=%%B"
)

cd /d "%SERVER_ROOT%"
if errorlevel 1 (
  echo [ERROR] Cannot enter backend folder:
  echo         %SERVER_ROOT%
  goto :failed
)

if not exist "node_modules\.bin\node" if not exist "node_modules\express" (
  echo [INFO] Installing backend dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    goto :failed_in_server
  )
)

netstat -ano -p tcp | findstr /R /C:":%API_PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo [ERROR] Port %API_PORT% is already in use.
  echo [INFO]  Stop the process using this port, or change PORT in server\.env.
  goto :failed_in_server
)

echo.
echo [INFO] MealPilot API is starting...
echo [INFO] URL:  http://127.0.0.1:%API_PORT%
echo [INFO] Root: %SERVER_ROOT%
echo.
echo [INFO] Database migration is skipped by default.
echo [INFO] To migrate first, run this script with:
echo         start-mealpilot-api.bat migrate
echo.

if /I "%MEALPILOT_RUN_MIGRATION%"=="1" (
  echo [INFO] Applying database migrations...
  call npm run db:migrate
  if errorlevel 1 (
    echo [ERROR] Database migration failed. API was not started.
    goto :failed_in_server
  )
)

call npm run dev
set "EXIT_CODE=%errorlevel%"

echo.
if "%EXIT_CODE%"=="0" (
  echo [INFO] MealPilot API stopped.
) else (
  echo [ERROR] MealPilot API exited with code %EXIT_CODE%.
)

cd /d "%PROJECT_ROOT%"
pause
exit /b %EXIT_CODE%

:failed_in_server
cd /d "%PROJECT_ROOT%"

:failed
echo.
echo [INFO] Fix the message above and run this file again.
pause
exit /b 1
