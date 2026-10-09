@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  sankengcloset 推送脚本
REM  用途：绕过坏掉的 git-credential-manager，走可用代理 7900 推送
REM  用法：双击运行，或在本目录执行  scripts\push-remote.cmd <TOKEN>
REM ============================================================

cd /d "%~dp0.."

set "PROXY=http://127.0.0.1:7900"
set "TOKEN=%~1"

if "%TOKEN%"=="" (
  echo.
  echo [i] 未提供 token，将使用匿名推送（公有仓库读取可过，写入会 401）。
  echo     若要认证推送，请传入 GitHub Personal Access Token：
  echo        scripts\push-remote.cmd ghp_xxxxxxxxxxxx
  echo.
) else (
  echo [i] 已提供 token，将写入仓库本地凭据存储（仅本仓库，不污染全局）。
)

REM 关掉坏掉的全局凭据助手，改为本仓库独立的 store 文件
git config --local --unset-all credential.helper 2>nul
git config --local credential.helper "store --file=.git/.git-credentials-local"

if not "%TOKEN%"=="" (
  > ".git\.git-credentials-local" echo https://x-access-token:%TOKEN%@github.com
)

REM 把「不存在的 GCM」从全局配置里摘掉（只影响本机，不影响仓库）
git config --global --unset-all credential.helper 2>nul

echo [i] 使用代理 %PROXY% 推送 origin/main ...
set HTTPS_PROXY=%PROXY%
set HTTP_PROXY=%PROXY%
set https_proxy=%PROXY%
set http_proxy=%PROXY%
set GIT_TERMINAL_PROMPT=0

git push origin main
set RC=%ERRORLEVEL%

if %RC%==0 (
  echo.
  echo [OK] 推送成功。
) else (
  echo.
  echo [X] 推送失败（exit=%RC%）。
  echo     网络已确认可用；401 基本就是 token 缺失或过期。
)

endlocal
