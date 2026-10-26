@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
if not exist "dist\index.html" goto missing_build
node scripts\serve.mjs --open
pause
exit /b
:missing_node
echo 请先安装 Node.js 24 LTS，再启动 Folio。
pause
exit /b 1
:missing_build
echo 未找到构建文件。请在项目目录执行 npm ci 和 npm run build。
pause
exit /b 1
