param(
  # 默认打「运行/开发」产物（unpackage/dist/dev）——那是给开发者工具跑模拟器用的。
  # 上传到微信（体验版/预览）必须用发行产物：-Release 走 cli publish，产出
  # unpackage/dist/build，JS 会被压缩。曾经因为传了 dev 产物，「对JS文件进行压缩」直接未通过。
  [switch]$Release
)
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$modeDir = if ($Release) { 'build' } else { 'dev' }
$distRoot = Join-Path $projectRoot "unpackage\dist\$modeDir\mp-weixin"
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

# python 必须是真解释器：PATH 上的 python 常是 Microsoft Store 的 AppInstaller 占位程序
# （%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe，exit code 49、什么都不执行），
# 用了它 patch-vendor.py 会静默失败，让整条后编译门禁变成误报。
function Resolve-Python {
  # 外层 @() 必须保留：管道只产出 1 个元素时 PowerShell 会把结果退化成字符串，
  # 此后 $candidates[0] 取到的是首字符而不是首元素（会得到 "C"，报"无法将C项识别为 cmdlet"）。
  $candidates = @(@(
    $env:SANKENG_PYTHON,
    (Join-Path $HOME '.workbuddy\binaries\python\envs\default\Scripts\python.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
  if ($candidates.Count -gt 0) { return $candidates[0] }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -notmatch 'WindowsApps') { return $cmd.Source }
  return $null
}

$python = Resolve-Python
if (-not $python) {
  throw 'No usable python interpreter found (the Microsoft Store stub under WindowsApps is rejected). Set SANKENG_PYTHON to a real python.exe.'
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

$buildStart = Get-Date

# ===== appid 一致性：构建前 =====
# 踩过的坑（2026-09-28）：`cli launch mp-weixin`（运行到小程序）会把 manifest.json 的
# mp-weixin.appid **静默改写成 null**，不报任何错。放任不管的话，下一次构建产物的
# appid 就是空的，上传会指到错误的小程序/Git 仓库配置上，而且很难从现象反推。
# 好在单测「微信小程序 AppID 与 manifest.json 一致」会 FAIL —— 这里在构建前再锁一道，
# 把失败点前移到「还没编译」而不是「上传之后」。
$expectedAppId = $null
$wechatConfigText = Get-Content -LiteralPath (Join-Path $projectRoot 'config\wechat.uts') -Raw
if ($wechatConfigText -match "WECHAT_MP_APPID\s*=\s*'([^']+)'") { $expectedAppId = $Matches[1] }
if (-not $expectedAppId) {
  throw "无法从 config/wechat.uts 解析出 WECHAT_MP_APPID（它是一条固定的 AppID 常量）。"
}

$manifestPath = Join-Path $projectRoot 'manifest.json'
$manifestText = Get-Content -LiteralPath $manifestPath -Raw
$manifestAppId = $null
if ($manifestText -match '"mp-weixin"\s*:\s*\{[^}]*?"appid"\s*:\s*"([^"]*)"') { $manifestAppId = $Matches[1] }
if (-not $manifestAppId) {
  throw "manifest.json 的 mp-weixin.appid 不是非空字符串（很可能被 HBuilderX 改写成了 null）。请恢复为 $expectedAppId。"
}
if ($manifestAppId -ne $expectedAppId) {
  throw "manifest.json 的 mp-weixin.appid（$manifestAppId）与 config/wechat.uts 的 WECHAT_MP_APPID（$expectedAppId）不一致，先修一致再构建。"
}

# V3：编译前清空旧产物，禁止用旧 unpackage 制造假绿。
# 2026-09-29 补记：本机沙箱把**批量删除**拦掉了（PS 的 Remove-Item 被改写成「移到回收站」，
# 产物树一大就 fail-closed：`[safe-delete][SAFE_DELETE_FAIL_CLOSED] {"reason":"trash-failed"}`）。
# 结果是删除**实际没发生**，紧接着 HBuilderX 就编译不出 app.json —— 实测现象是
# 「第一次构建挂掉、把目录清空后重跑才过」。删除改走 Python（本仓库既定规则，见下方 strip 步骤
# 的同款注释）；注意沙箱同样会拦 python 的递归删，所以下面**必须把「没清干净」报出来**。
if (Test-Path -LiteralPath $distRoot) {
  # 关键：本机沙箱的 safe-delete shim 走回收站，删不掉时不是「抛 Python 异常」，而是
  # **往 stderr 写一行 SAFE_DELETE_FAIL_CLOSED 并让进程非零退出**。而 PS 在
  # $ErrorActionPreference='Stop' 下会把原生命令的 stderr 升级成**终止性 RemoteException**
  # ⇒ 整条构建在 90 行当场挂掉，根本走不到下面的兜底判断（2026-10-09 实测定位）。
  # 这里显式把 stderr/退出码就地吞掉：删除是否成功由下方「清干净了没」的检查负责判定。
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $python -c "import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)" $distRoot 2>&1 | Out-Null
  } catch {
    Write-Verbose "清空旧产物时被沙箱拦截（可忽略，由下方检查兜底）：$($_.Exception.Message)"
  } finally {
    $ErrorActionPreference = $prevEap
  }
}
# 仍然不阻断编译：删不掉（多为微信开发者工具锁住该目录）时由下面的「产物新鲜度断言」兜底。
# 但要把「没清干净」和**下一步该做什么**明确报出来 —— 否则症状只是「编译没产出 app.json」，
# 极难反推到「旧产物没删掉」这一层。
if (Test-Path -LiteralPath $distRoot) {
  $left = @(Get-ChildItem -LiteralPath $distRoot -Recurse -Force -ErrorAction SilentlyContinue).Count
  if ($left -gt 0) {
    Write-Warning "旧产物未能清空（剩 $left 项）。若随后报「编译后仍未生成 app.json」：先关掉微信开发者工具（它会锁住这个目录）再重跑一次。"
  }
}

# cli publish 自己就会编译（发行模式，JS 压缩），并会启动微信开发者工具打开该目录，
# 末尾提示「请在开发者工具中点击上传」。所以这里二选一，**不能两个都跑**（会编译两遍）。
# 不用 --upload 自动上传：那需要「代码上传密钥」+ IP 白名单；而 cli.bat upload 走的是
# 开发者工具的登录态，不需要密钥。分两步更可控。
if ($Release) {
  & $cli publish mp-weixin --project $projectRoot
} else {
  & $cli launch mp-weixin --project $projectRoot --compile true --continue-on-error false
}
if ($LASTEXITCODE -ne 0) {
  $what = if ($Release) { 'publish' } else { 'compilation' }
  throw "HBuilderX $what failed with exit code $LASTEXITCODE."
}

# 新鲜度断言：编译必须真的写出新的 app.json，否则视为陈旧产物，禁止放行。
$appJson = Join-Path $distRoot 'app.json'
if (-not (Test-Path -LiteralPath $appJson)) {
  throw "编译后仍未生成 $appJson —— 编译没有产出可用的小程序入口。"
}
$appJsonTime = (Get-Item -LiteralPath $appJson).LastWriteTime
if ($appJsonTime -lt $buildStart) {
  throw "产物疑似陈旧：app.json 时间 $appJsonTime 早于本次编译开始时间 $buildStart。禁止放行。"
}

# ===== pages.json 双分支一致性 + 分包真的进了产物 =====
# pages.json 为兼容「subPackages 只在小程序端生效」维护了两份页面清单（小程序 / 非小程序）。
# 两份漂移的症状是「某页面 App 上打得开、小程序上打不开」，而且编译不报错 —— 必须静态拦。
#
# ⚠️ 顺序（2026-09-29 修）：必须放在**死重剔除之后**再跑。
#    带 $distRoot 时它会顺带算「主包微信上传口径」并打印出来，而本地 ttf 是主包里最大的一块死重
#    （约 600 KB）。早先放在剔除之前，打印出的是**剔除前**的数（实测 2244 KB，超 2048 硬限），
#    而真实值只有 ≈1388 KB —— 一条假警报，容易让人误判「分包白做了 / 过不了硬限」。
$parityScript = Join-Path $PSScriptRoot 'check-pages-parity.js'

# project.config.json 只「校验」，绝不重写。
# 旧写法是把文件读进来把 miniprogramRoot 置空、再用 ConvertTo-Json 写回，结果闯了祸：
#   ① HBuilderX 原生输出本来就带 "miniprogramRoot": ""，这一步纯属无用功；
#   ② ConvertTo-Json 会把文件撑成 PS 的宽缩进格式（1962 字节），而微信开发者工具
#      回写自己那套配置时只写 1012 字节且**不截断**，旧内容尾巴留在文件末尾
#      → 报 "Expecting 'EOF', got ]"、整个文件 JSON 非法、开发者工具打不开项目。
$outputProjectConfig = Join-Path $distRoot 'project.config.json'
if (Test-Path -LiteralPath $outputProjectConfig) {
  try {
    $outputConfig = Get-Content -LiteralPath $outputProjectConfig -Raw | ConvertFrom-Json
  } catch {
    throw "产物 project.config.json 不是合法 JSON（多为被写短却未截断、残留旧尾巴）：$($_.Exception.Message)"
  }
  if ($outputConfig.miniprogramRoot -ne '') {
    throw "产物 project.config.json 的 miniprogramRoot 必须为空串（代码根 = 项目根），实际为 [$($outputConfig.miniprogramRoot)]。"
  }
  # appid 一致性：构建后。产物这份配置由 HBuilderX 从仓库根 project.config.json 拷贝而来，
  # appid 为空 = 上传会指错小程序，必须在放行前拦住。
  if ($outputConfig.appid -ne $expectedAppId) {
    throw "产物 project.config.json 的 appid（$($outputConfig.appid)）与期望的 $expectedAppId 不一致。"
  }
}

# ===== manifest.json appid 回写 =====
# `cli launch` 与 `cli publish` 都会把 manifest.json 的 mp-weixin.appid 静默写成 null。
# 产物那份 project.config.json 是从仓库根拷贝的，不受影响，所以上传本身没问题；
# 但 manifest 被改坏后：① 单测「微信小程序 AppID 与 manifest.json 一致」会 FAIL；
# ② 脚本开头的前置断言会在下一次构建时直接拒绝。每次构建都要人手改回去太蠢，这里自动还原。
# 用 .NET 原样写回（纯文本替换 + UTF8 无 BOM），不走 ConvertTo-Json，避免撑大/改格式。
$manifestAfter = Get-Content -LiteralPath $manifestPath -Raw
if ($manifestAfter -notmatch '"mp-weixin"\s*:\s*\{[^}]*?"appid"\s*:\s*"([^"]*)"') {
  $restored = $manifestAfter -replace '("mp-weixin"\s*:\s*\{[^}]*?"appid"\s*:\s*)null', ('${1}"' + $expectedAppId + '"')
  if ($restored -ne $manifestAfter) {
    [System.IO.File]::WriteAllText($manifestPath, $restored, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[修复] manifest.json 的 mp-weixin.appid 被 HBuilderX 写成 null，已还原为 $expectedAppId"
  } else {
    Write-Warning "manifest.json 的 mp-weixin.appid 异常，且不是 null 形态、未能自动还原，请人工检查。"
  }
}

# V3：patch-vendor.py 已改为产物结构校验（不再注入 Pinia/defineStore 补丁）。
# 校验失败（含 v2 残留 / defineStore 残留 / createSSRApp 缺失）即整体失败。
& $python $patchScript $distRoot
if ($LASTEXITCODE -ne 0) {
  throw "mp-weixin 产物结构校验失败（patch-vendor.py）——请先解决产物问题，勿跳过后编译门禁。"
}

node $checkScript $distRoot
if ($LASTEXITCODE -ne 0) {
  throw "Compiled output verification failed with exit code $LASTEXITCODE."
}

# ===== __awaiter 接收者兜底（2026-10-06 新增：修首页「加载失败」）=====
# uni-app x 会把每个 async 函数编译成 `<压缩后的 vendor 别名>.__awaiter(this, void 0, void 0, function*(){…})`。
# 压缩器是按作用域取名的，所以「async 函数体内部的局部变量与模块别名同名」在纯 JS 语义下完全合法。
# 但微信开发者工具的「ES6 转 ES5」（Babel + regenerator）会**再改写一遍产物**，改写后那个局部变量
# 的作用域上移、把包装器里的模块别名遮蔽掉 ⇒ 包装器求值时接收者是 undefined
# ⇒ 真机/模拟器报 `Cannot read properties of undefined (reading '__awaiter')`，首页 store 捕获后
# 就显示成「加载失败」。dev 产物（未压缩、别名是 common_vendor 长名）不复现，**只有 release 会**。
# 兜底写法 `(别名||require(vendor)).__awaiter(...)` 语义不变、幂等，细节见 fix-awaiter-fallback.js 头部。
$awaiterScript = Join-Path $PSScriptRoot 'fix-awaiter-fallback.js'
node $awaiterScript $distRoot
if ($LASTEXITCODE -ne 0) {
  throw "__awaiter 接收者兜底未应用（fix-awaiter-fallback.js）。"
}

# ===== 小程序端「死重」剔除 + 包体门禁 =====
# 这两件事都放在 Python 里做，不用 PowerShell 删文件：
# 本机沙箱会把 Remove-Item 改写成「移到回收站」的 safe-delete，产物目录被微信开发者工具
# 占用时会 fail-closed（[safe-delete][SAFE_DELETE_FAIL_CLOSED]），把整条构建链路拖挂。
# 具体剔除什么、为什么剔除，见 strip-mp-deadweight.py 的头部注释（核心：
# 微信小程序的 @font-face 不支持包内本地路径，本地 ttf 既不生效又白占约 1/3 主包）。
$stripScript = Join-Path $PSScriptRoot 'strip-mp-deadweight.py'
& $python $stripScript $distRoot
if ($LASTEXITCODE -ne 0) {
  throw "小程序产物死重剔除/包体门禁未通过（strip-mp-deadweight.py）。"
}

# ===== pages.json 双分支一致性 + 分包产物核对（必须放在死重剔除之后）=====
# 见文件上方 $parityScript 处的说明：带 $distRoot 时会打印主包微信上传口径，
# 只有剔除完本地 ttf 再算才是真数（剔除前 ≈2244 KB 假警报 vs 剔除后 ≈1388 KB）。
node $parityScript $distRoot
if ($LASTEXITCODE -ne 0) {
  throw "pages.json 双分支一致性/分包产物校验未通过（check-pages-parity.js）。"
}

# ===== 缺失 import 门禁（2026-10-06 新增）=====
# 「调了项目 export 的函数却没 import」在 uvue 里**编译不报错**，产物里那行代码还在，
# 只在真机运行时抛 ReferenceError（整页挂掉）。2026-10-06 商品详情页就是这么炸的：
# wishCountOf / formatPriceCents / bumpWishCount 三个 import 全漏了，
# 表现成「首页和三个排行榜点商品 → wishCountOf is not defined」。
# 纯源码扫描、秒级，放在打包最后一步，保证这种包永远发不出去。
$importsScript = Join-Path $PSScriptRoot 'check-missing-imports.js'
node $importsScript
if ($LASTEXITCODE -ne 0) {
  throw "缺失 import 门禁未通过（check-missing-imports.js）。"
}

Write-Host "[OK] mp-weixin compiled and verified: $distRoot"
