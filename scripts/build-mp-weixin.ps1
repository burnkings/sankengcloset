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

python $patchScript $distRoot
if ($LASTEXITCODE -ne 0) {
  throw "Pinia compatibility patch failed with exit code $LASTEXITCODE."
}

$homeStore = Join-Path $distRoot 'stores\home-feed-store.js'
$vendor = Join-Path $distRoot 'common\vendor.js'
if (-not (Select-String -LiteralPath $homeStore -Pattern 'patch-vendor: defineStore bound' -Quiet)) {
  throw 'Compiled home store is missing the defineStore binding.'
}
if (-not (Select-String -LiteralPath $vendor -Pattern 'exports.defineStore = defineStore' -Quiet)) {
  throw 'Compiled vendor.js is missing the defineStore export.'
}

node $checkScript $distRoot
if ($LASTEXITCODE -ne 0) {
  throw "Compiled output verification failed with exit code $LASTEXITCODE."
}

Write-Host "[OK] mp-weixin compiled and patched: $distRoot"
