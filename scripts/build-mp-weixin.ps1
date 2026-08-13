$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distRoot = Join-Path $projectRoot 'unpackage\dist\dev\mp-weixin'
$patchScript = Join-Path $PSScriptRoot 'patch-vendor.py'
$checkScript = Join-Path $PSScriptRoot 'check-uts-compile.js'

$cliCandidates = @(@(
  $env:HBUILDERX_CLI,
  (Join-Path $HOME 'Desktop\HBuilderX\cli.exe'),
  'C:\Program Files\HBuilderX\cli.exe',
  'D:\HBuilderX\cli.exe'
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) })

if ($cliCandidates.Count -eq 0) {
  throw 'HBuilderX cli.exe was not found. Set HBUILDERX_CLI to its absolute path.'
}

$cli = $cliCandidates[0]
if (-not (Get-Process HBuilderX -ErrorAction SilentlyContinue)) {
  $hbuilderExecutable = Join-Path (Split-Path -Parent $cli) 'HBuilderX.exe'
  if (-not (Test-Path -LiteralPath $hbuilderExecutable)) {
    throw "HBuilderX.exe was not found next to cli.exe: $hbuilderExecutable"
  }
  Start-Process -FilePath $hbuilderExecutable
  Start-Sleep -Seconds 10
}

# V3：编译前清空旧产物，禁止用旧 unpackage 制造假绿
if (Test-Path -LiteralPath $distRoot) {
  Remove-Item -Recurse -Force $distRoot
}

& $cli launch mp-weixin --project $projectRoot --compile true --continue-on-error false
if ($LASTEXITCODE -ne 0) {
  throw "HBuilderX compilation failed with exit code $LASTEXITCODE."
}

$outputProjectConfig = Join-Path $distRoot 'project.config.json'
if (Test-Path -LiteralPath $outputProjectConfig) {
  $outputConfig = Get-Content -LiteralPath $outputProjectConfig -Raw | ConvertFrom-Json
  $outputConfig.miniprogramRoot = ''
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    $outputProjectConfig,
    (($outputConfig | ConvertTo-Json -Depth 10) + [Environment]::NewLine),
    $utf8NoBom
  )
}

# V3：patch-vendor.py 已改为产物结构校验（不再注入 Pinia/defineStore 补丁）。
# 校验失败（含 v2 残留 / defineStore 残留 / createSSRApp 缺失）即整体失败。
python $patchScript $distRoot
if ($LASTEXITCODE -ne 0) {
  throw "mp-weixin 产物结构校验失败（patch-vendor.py）——请先解决产物问题，勿跳过后编译门禁。"
}

node $checkScript $distRoot
if ($LASTEXITCODE -ne 0) {
  throw "Compiled output verification failed with exit code $LASTEXITCODE."
}

Write-Host "[OK] mp-weixin compiled and verified: $distRoot"
