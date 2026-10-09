@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  sankengcloset 推送脚本
REM
REM  背景（2026-10-09 查明）：
REM    全局 git-credential-manager 路径是 ~/.workbuddy/vendor/PortableGit/...
REM    —— 该目录**整个不存在**（供应商目录已迁移到 binaries/）。
REM    凭据本身没丢（Windows 凭据管理器里有 git:https://x-access-token@github.com），
REM    仅仅因为 helper 二进制找不到 ⇒ push 报 401 / could not read Username。
REM
REM  另外：环境变量里的代理 50102 是坏的（SSL 反复 renegotiate 后挂死），
REM    GitHub 必须走 7900；但直连又完全不通。所以本脚本强制覆盖代理。
REM ============================================================

cd /d "%~dp0.."

set "PROXY=http://127.0.0.1:7900"
set "GCM=C:/Users/dddd/.workbuddy/binaries/PortableGit/versions/1.2.0/mingw64/bin/git-credential-manager.exe"

REM 自愈：全局 helper 若指向不存在的路径，就地修正
git config --global --get credential.helper | findstr /i "vendor\\PortableGit" >nul 2>&1
if not errorlevel 1 (
  echo [i] 检测到全局凭据助手路径失效，正在修正为 %GCM%
  git config --global --replace-all credential.helper "!\"%GCM%\""
)

echo [i] 使用代理 %PROXY% 推送 origin/main ...
set HTTPS_PROXY=%PROXY%
set HTTP_PROXY=%PROXY%
set https_proxy=%PROXY%
set http_proxy=%PROXY%
set GIT_TERMINAL_PROMPT=0

git push origin main
if errorlevel 1 goto :fail
echo.
echo [OK] 推送成功。
goto :eof

:fail
echo.
echo [X] 推送失败。排查顺序：
echo     1) 代理客户端是否开着（需要监听 127.0.0.1:7900）
echo     2) 凭据是否过期：控制面板 → 凭据管理器 → 搜 github，删掉后重推会提示重新登录
echo     3) 目标路径是否正确：%GCM%
endlocal
