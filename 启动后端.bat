@echo off
setlocal
title 家庭智能配餐系统 - 后端服务

cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js。请先安装 Node.js 24 或更高版本。
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 npm。请重新安装 Node.js。
  goto :failed
)

if not exist ".env" (
  echo [错误] 缺少 server\.env 配置文件。
  echo 请先复制 .env.example 并填写 MySQL 项目账号密码。
  goto :failed
)

if not exist "node_modules" (
  echo [提示] 第一次启动，正在安装后端依赖...
  call npm install
  if errorlevel 1 goto :failed
)

echo.
echo [提示] 后端正在启动。看到 API listening 后即可在微信开发者工具点击“编译”。
echo [提示] 请保持此窗口开启；关闭窗口即停止后端服务。
echo.
call npm run dev
set "exitCode=%errorlevel%"

echo.
if not "%exitCode%"=="0" echo [错误] 后端已退出，退出代码：%exitCode%
if "%exitCode%"=="0" echo [提示] 后端已停止。
pause
exit /b %exitCode%

:failed
echo.
echo [提示] 请根据上方信息处理后，再双击“启动后端.bat”。
pause
exit /b 1
