#Requires -Version 5.1
<#
  push-remote.ps1 — 把 main 推到 GitHub（**自动探测可用代理端口**）

  为什么要有这个脚本（2026-10-11 踩坑）：
    本机出网必须走代理（关掉代理 GitHub 直接不通），但**代理客户端监听的端口是会变的** ——
    记忆里一直写的是 127.0.0.1:7900，而那天实际变成了 **7897**（Clash Verge / mihomo 的默认混合端口）。
    于是「按记忆写死 7900」的推送全部失败，报 `CONNECT tunnel failed, response 502`
    （看着像代理挂了，其实是端口根本没人监听 / 打到了别的进程上）。
    ⚠️ 同一台机器上 **48950 是沙箱自己的转发端口**：curl 能过、但 **git push 过不去**（502）。
    所以**探测必须用 git 自己来探**（`git ls-remote`），不能用 curl 探 —— curl 通不代表 git 通。

  另一个坑：**不同工具用的 git 不是同一个**
    · Bash 工具 → /mingw64/bin/git（PortableGit），且 **git push 会被安全策略静默掐掉**
    · PowerShell 工具 → C:\FILES\PROGRAMMING\GIT\CMD\git.exe（系统 Git）
    而且 $env:HTTPS_PROXY 有时不生效（进程里可能已有小写的 http_proxy/https_proxy，
    libcurl 优先读小写）。⇒ **一律用 git 配置级覆盖 -c http.proxy=… / -c https.proxy=…**，优先级最高。

  用法（必须带 Bypass —— 本机 ExecutionPolicy 禁止直接跑脚本）：
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\push-remote.ps1
    可选：-DryRun（只探测代理并打印结果，不推）

  退出码：0 成功；2 没探测到可用代理；其它 = git 的退出码
#>
[CmdletBinding()]
param(
  [switch]$DryRun
)

# 原生命令（git）的 stderr 在 'Stop' 下会被升格成终止性异常，脚本会当场挂
# （scripts\build-mp-weixin.ps1 踩过同一个坑）。这里一律用显式 $LASTEXITCODE 判断。
$ErrorActionPreference = 'Continue'

# 候选端口：先常见默认端口（真正能用的通常在这里），再看环境变量里现成的
$candidates = New-Object System.Collections.Generic.List[string]
foreach ($port in 7897, 7900, 7890, 10809, 1080, 48950) {
  $candidates.Add("http://127.0.0.1:$port")
}
foreach ($raw in @($env:HTTPS_PROXY, $env:https_proxy, $env:HTTP_PROXY, $env:http_proxy)) {
  if ($raw -and $raw.Trim() -ne '') { $candidates.Add($raw.Trim()) }
}

$seen = @{}
$ordered = @()
foreach ($c in $candidates) {
  if (-not $seen.ContainsKey($c)) { $seen[$c] = $true; $ordered += $c }
}

Write-Output "[i] 用 git ls-remote 逐个探测代理（候选 $($ordered.Count) 个）..."
$proxy = ''
foreach ($candidate in $ordered) {
  $probe = & git -c "http.proxy=$candidate" -c "https.proxy=$candidate" ls-remote origin main 2>$null
  if ($LASTEXITCODE -eq 0 -and $probe) {
    Write-Output "[OK] 可用代理：$candidate"
    $proxy = $candidate
    break
  }
  Write-Output "[ ] $candidate 不可用（git 退出码 $LASTEXITCODE）"
}

if ($proxy -eq '') {
  Write-Output "[X] 没有探测到可用代理。"
  Write-Output "    1) 确认代理客户端在运行（Clash Verge / mihomo 等）"
  Write-Output "    2) 看它监听哪个端口：Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 7897,7900,7890"
  Write-Output "    3) 不要把系统代理关掉 —— 关掉之后 GitHub 完全不通"
  exit 2
}

$gitArgs = @('-c', "http.proxy=$proxy", '-c', "https.proxy=$proxy")

if ($DryRun) {
  Write-Output "[i] -DryRun：将执行 git $($gitArgs -join ' ') push origin main"
  exit 0
}

$env:GIT_TERMINAL_PROMPT = '0'
Write-Output "[i] 推送 origin/main ..."
& git @gitArgs push origin main
$code = $LASTEXITCODE
if ($code -ne 0) {
  Write-Output "[X] 推送失败（git 退出码 $code）。排查顺序："
  Write-Output "    1) 代理客户端是否切了节点/端口（端口会变，别写死）"
  Write-Output "    2) 凭据：cmdkey /list | findstr github（有条目就别重置 token）"
  Write-Output "    3) 换一个候选端口再试：git -c http.proxy=http://127.0.0.1:7897 push origin main"
  exit $code
}
Write-Output "[OK] 推送成功。"
exit 0
