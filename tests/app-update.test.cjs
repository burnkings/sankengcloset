const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const root = path.resolve(__dirname, '..')

// 复用 content-flows.test.cjs 的加载方式：抹掉类型后在同一 context 里执行真实 .uts 模块。
function harness() {
  const h = { fail: false, response: null, requests: [] }
  const stubs = {
    '@/services/platform/api-client': {
      apiGet: async (p) => {
        h.requests.push(p)
        if (h.fail) throw Error('offline')
        return h.response
      },
    },
  }
  const cache = new Map()
  const context = vm.createContext({ console, Map, Set, Date, Math, JSON, Error, Promise, isNaN, parseInt, uni: { getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {} } })
  function load(id) {
    if (stubs[id]) return stubs[id]
    if (cache.has(id)) return cache.get(id)
    const file = path.join(root, id.replace(/^@\//, '') + '.uts')
    let code = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'transform' })
    const exports = []
    code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, src) => `const {${names.replace(/\s+as\s+/g, ': ')}} = require(${JSON.stringify(src)});`)
    code = code.replace(/export\s+(async\s+)?(function|class|const|let)\s+(\w+)/g, (_, a, b, n) => { exports.push(n); return `${a ?? ''}${b} ${n}` })
    const result = {}
    cache.set(id, result)
    vm.runInContext(`(function(require,exports){${code}\nObject.assign(exports,{${exports.join(',')}})})`, context, { filename: file })(load, result)
    return result
  }
  h.load = load
  return h
}

test('版本号规范化：去掉 V 前缀与构建元数据', () => {
  const u = harness().load('@/services/user-data/app-update-service')
  assert.equal(u.normalizeVersion('V2.5.0-beta.4'), '2.5.0-beta.4')
  assert.equal(u.normalizeVersion('  v2.5.0 '), '2.5.0')
  assert.equal(u.normalizeVersion('2.5.0+build.7'), '2.5.0')
})

test('版本比较：正式版高于预发布版，预发布序号按数字比', () => {
  const u = harness().load('@/services/user-data/app-update-service')
  const cmp = u.compareVersion
  assert.equal(cmp('2.5.0', '2.5.0-beta.4'), 1)
  assert.equal(cmp('2.5.0-beta.4', '2.5.0'), -1)
  assert.equal(cmp('2.5.0-beta.10', '2.5.0-beta.4'), 1)
  assert.equal(cmp('2.5.0-beta.4', '2.5.0-beta.4'), 0)
  assert.equal(cmp('V2.5.0', '2.5.0'), 0)
  assert.equal(cmp('2.5.1', '2.6.0'), -1)
  assert.equal(cmp('2.6', '2.5.9'), 1)
  assert.equal(cmp('2.5.0-alpha.1', '2.5.0-beta.1'), -1)
})

test('检查更新：新版号才提示更新（不信服务端的 hasUpdate 布尔）', async () => {
  const h = harness()
  const u = h.load('@/services/user-data/app-update-service')
  h.response = { data: { latestVersion: '2.6.0', latestVersionCode: 26000, hasUpdate: false, updateUrl: 'https://dl/2.6.0.apk', releaseNote: '修复通知深色模式' } }
  const info = await u.checkUpdateRemote()
  assert.equal(h.requests[0], '/api/v1/app/version')
  assert.equal(info.hasUpdate, true)
  assert.equal(info.forceUpdate, false)
  assert.equal(info.latestVersion, '2.6.0')
  assert.equal(info.latestVersionCode, 26000)
  assert.equal(info.updateUrl, 'https://dl/2.6.0.apk')
  assert.equal(info.releaseNote, '修复通知深色模式')
  assert.equal(info.requestFailed, false)
})

test('检查更新：服务端版本不高于本地时，即使标了 hasUpdate 也不提示', async () => {
  const h = harness()
  const u = h.load('@/services/user-data/app-update-service')
  h.response = { data: { latestVersion: 'V2.5.0-beta.3', hasUpdate: true, updateUrl: 'https://dl/x.apk' } }
  const info = await u.checkUpdateRemote()
  assert.equal(info.hasUpdate, false)
})

test('检查更新：minVersionCode 高于本地 → 强制更新且不允许稍后', async () => {
  const h = harness()
  const u = h.load('@/services/user-data/app-update-service')
  h.response = { data: { latestVersion: '2.6.0', minVersionCode: 30000 } }
  const info = await u.checkUpdateRemote()
  assert.equal(info.forceUpdate, true)
  assert.equal(info.hasUpdate, true)
})

test('检查更新：minVersion 字符串高于本地 → 强制更新', async () => {
  const h = harness()
  const u = h.load('@/services/user-data/app-update-service')
  h.response = { data: { latestVersion: '2.6.0', minVersion: '2.6.0' } }
  const info = await u.checkUpdateRemote()
  assert.equal(info.forceUpdate, true)
})

test('检查更新：接口失败 → 标记 requestFailed，不误报更新', async () => {
  const h = harness()
  const u = h.load('@/services/user-data/app-update-service')
  h.fail = true
  const info = await u.checkUpdateRemote()
  assert.equal(info.requestFailed, true)
  assert.equal(info.hasUpdate, false)
  assert.equal(info.forceUpdate, false)
})

test('检查更新：服务端未配置版本号 → 视为已是最新，不算失败', async () => {
  const h = harness()
  const u = h.load('@/services/user-data/app-update-service')
  h.response = { data: {} }
  const info = await u.checkUpdateRemote()
  assert.equal(info.hasUpdate, false)
  assert.equal(info.requestFailed, false)
})

test('版本常量与 manifest.json 一致（防止再次漂移）', () => {
  const cfg = harness().load('@/config/app-version')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
  assert.equal(cfg.APP_VERSION.replace(/^V/, ''), manifest.versionName)
  assert.equal(String(cfg.APP_VERSION_CODE), String(manifest.versionCode))
})

test('更新地址：平台归一认不出的一律归 other（不猜）', () => {
  const c = harness().load('@/config/app-update')
  assert.equal(c.normalizePlatform('android'), 'android')
  assert.equal(c.normalizePlatform('Android 14'), 'android')
  assert.equal(c.normalizePlatform('ios'), 'ios')
  assert.equal(c.normalizePlatform('iOS'), 'ios')
  assert.equal(c.normalizePlatform('harmony'), 'other')
  assert.equal(c.normalizePlatform(''), 'other')
})

test('更新地址：服务端优先 → 平台配置 → default', () => {
  const c = harness().load('@/config/app-update')
  const pick = c.pickUpdateUrl
  assert.equal(pick('https://dl/x.apk', 'android', 'https://a.apk', 'https://i', 'https://d'), 'https://dl/x.apk')
  assert.equal(pick('', 'android', 'https://a.apk', 'https://i', 'https://d'), 'https://a.apk')
  assert.equal(pick('', 'ios', 'https://a.apk', 'https://i', 'https://d'), 'https://i')
  assert.equal(pick('', 'harmony', 'https://a.apk', 'https://i', 'https://d'), 'https://d')
  assert.equal(pick('', 'android', '', 'https://i', 'https://d'), 'https://d')
})

test('更新地址：全空 → 返回空串（页面据此走「待配置」提示，不给点不动的按钮）', () => {
  const c = harness().load('@/config/app-update')
  assert.equal(c.resolveUpdateUrl('', 'android'), c.UPDATE_URL_ANDROID)
  assert.equal(c.resolveUpdateUrl('', 'android'), '')
  assert.equal(c.resolveUpdateUrl('https://dl/x.apk', 'ios'), 'https://dl/x.apk')
})

test('检查更新：服务端 updateUrl 为空时落到前端平台配置', async () => {
  const h = harness()
  const u = h.load('@/services/user-data/app-update-service')
  const c = h.load('@/config/app-update')
  h.response = { data: { latestVersion: '9.9.9', updateUrl: '' } }
  const info = await u.checkUpdateRemote()
  // 断言与配置无关：期望值由同一套选择规则算出（测试环境下 platform 取不到 → other → default）
  const expected = c.pickUpdateUrl('', '', c.UPDATE_URL_ANDROID, c.UPDATE_URL_IOS, c.UPDATE_URL_DEFAULT)
  assert.equal(info.updateUrl, expected)
})

test('检查更新：连点只发一次请求（单飞）', async () => {
  const h = harness()
  const u = h.load('@/services/user-data/app-update-service')
  h.response = { data: { latestVersion: '2.6.0', latestVersionCode: 26000 } }
  const results = await Promise.all([u.checkUpdateRemote(), u.checkUpdateRemote(), u.checkUpdateRemote()])
  assert.equal(h.requests.length, 1)
  for (const info of results) {
    assert.equal(info.latestVersion, '2.6.0')
    assert.equal(info.hasUpdate, true)
  }
})

test('微信小程序 AppID 与 manifest.json 一致（防止再次漂移）', () => {
  const cfg = harness().load('@/config/wechat')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
  assert.equal(cfg.WECHAT_MP_APPID, manifest['mp-weixin'].appid)
})

test('前端凭据文件不出现 AppSecret（安全红线）', () => {
  const src = fs.readFileSync(path.join(root, 'config/wechat.uts'), 'utf8')
  // 只允许注释里出现「AppSecret」这个词，不允许出现真实密钥形态的赋值
  assert.equal(/APP_?SECRET\s*[:=]\s*['"][^'"]+['"]/i.test(src), false)
  assert.equal(/b6f3ddfc/.test(src), false)
})
