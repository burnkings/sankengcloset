// 评审「待验证疑点」护栏（2026-10-10）
// ① services/content/product-service.uts 的 images 映射必须同时兼容对象与 string[]
//    —— 线上实测是对象（{url,...}），但若后端改成 string[]，只按对象读会**静默丢副图**。
// ② services/user-data/user-data-service.uts 引用的 api-client 导出必须真的 import
//    —— 去类型跑 JS 看不出来，原生 UTS 编译才可能炸（曾用 Promise<ApiResponse> 但未 import）。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('product-service images 映射兼容 string[]（对象分支不得丢）', () => {
  const src = read('services/content/product-service.uts')
  // 找到 images 循环体
  const start = src.indexOf("const rawImages = raw['images']")
  assert.ok(start > -1, '找不到 images 映射起点')
  const body = src.slice(start, start + 1400)
  assert.match(body, /typeof\s+img\s*===\s*'string'/, '缺少 string[] 兼容分支（只按对象读会丢副图）')
  assert.match(body, /pi\.url\s*=\s*img\s+as\s+string/, 'string 分支必须把字符串本身当 url')
  assert.match(body, /obj\['url'\]/, '对象分支必须保留（线上契约是对象）')
  assert.match(body, /if\s*\(pi\.url\s*!==\s*''\)\s*result\.images\.push\(pi\)/, '空 url 不得入列')
})

test('user-data-service 引用 api-client 的导出必须 import', () => {
  const apiClient = read('services/platform/api-client.uts')
  const svc = read('services/user-data/user-data-service.uts')

  // api-client 的具名导出
  const exported = new Set()
  for (const m of apiClient.matchAll(/^export\s+(?:async\s+)?(?:class|function|const|let)\s+(\w+)/gm)) {
    exported.add(m[1])
  }
  assert.ok(exported.size > 0, 'api-client 没解析出导出，测试本身失效')

  // 该文件从 api-client 的 import 名单
  const importLine = svc.split('\n').find((l) => l.includes("from '@/services/platform/api-client'"))
  assert.ok(importLine, 'user-data-service 应有一条 api-client 的 import')
  const imported = new Set(
    (importLine.match(/\{([^}]*)\}/)?.[1] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )

  const missing = []
  for (const name of exported) {
    const used = new RegExp(`\\b${name}\\b`).test(svc.replace(importLine, ''))
    if (used && !imported.has(name)) missing.push(name)
  }
  assert.deepEqual(missing, [], `引用了但没 import（原生编译会挂）：${missing.join(', ')}`)
})
