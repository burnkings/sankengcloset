/**
 * wechat-login-error.test.cjs —— 微信登录失败文案分流回归
 *
 * 背景（2026-09-28，用户第 5 条反馈）：
 *   「微信登陆显示微信授权失效，需要重新点击登录，一直这样」
 * 根因不在前端逻辑，而在文案把两种病因说成了同一种：
 *   ① 微信 code 过期（用户再点一次真的会好）
 *   ② 后端服务器公网 IP 不在微信白名单（微信 errcode 40164）—— 用户点一万次也不会好
 * 探针实测：直连 jscode2session 返回
 *   {"errcode":40164,"errmsg":"invalid ip 112.0.140.70 ... not in whitelist"}
 * 而后端把 40164 压缩成 `401 {code:'UNAUTHORIZED', message:'登录凭证已失效，请重试'}`，
 * 前端拿不到任何可分辨信号 ⇒ 只能落到 401 那一档 ⇒ 旧文案「请重新点击登录」成了死循环。
 *
 * 做法：不加载整个 session-store（它 import 了十几个 store，打桩成本高且脆弱），
 * 而是从源码里**按名字抽出这个纯函数**再求值。它是纯的（只依赖参数与 Error），
 * 所以抽出来执行的语义与线上完全一致；函数一旦改名，这里会明确报错而不是静默失效。
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { stripTypeScriptTypes } = require('node:module')

const root = path.resolve(__dirname, '..')
const FILE = 'stores/session-store.uts'
const FN = 'wechatLoginErrorMessage'

/** 从源码中按名字抽出函数声明（按大括号配对找结束位置） */
function extractFunction(source, name) {
  const head = `function ${name}(`
  const start = source.indexOf(head)
  assert.ok(start >= 0, `${FILE} 里找不到 ${head}...）—— 函数被改名或删除，请同步更新本测试`)
  const open = source.indexOf('{', start)
  let depth = 0
  let i = open
  while (i < source.length) {
    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      i++
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++
        i++
      }
    } else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
    i++
  }
  throw new Error(`${FILE} 的 ${name} 大括号不配对`)
}

const raw = fs.readFileSync(path.join(root, FILE), 'utf8')
const body = stripTypeScriptTypes(extractFunction(raw, FN), { mode: 'transform' })
const ctx = vm.createContext({ Error })
vm.runInContext(`globalThis.${FN} = ${body.split(`function ${FN}`)[1].replace(/^/, 'function ')}`, ctx)
const message = ctx[FN]
assert.equal(typeof message, 'function', '抽取出来的不是可调用函数')

const at = (status, code, msg) => message(Object.assign(new Error(msg ?? ''), { status }), status, code ?? '')

// ---------- 1. 白名单类：必须是「联系管理员」，不能让用户反复重试 ----------
const whitelistSignals = [
  ['WECHAT_IP_NOT_WHITELIST', '后端按约定透传的稳定错误码（待后端改）'],
  ['40164', '微信原始 errcode 万一被透传'],
  ['', 'errmsg 原样透传（not in whitelist）'],
]
for (const [code, how] of whitelistSignals) {
  const text = at(401, code, code === '' ? 'invalid ip 1.2.3.4, not in whitelist' : '')
  assert.match(text, /白名单/, `${how} 应命中白名单分支`)
  assert.match(text, /管理员/, `${how} 必须给出「联系管理员」这个非重试动作`)
  assert.equal(/重新点击登录|重新登录/.test(text), false, `${how} 不许再出现「重新点击登录」这种死循环说法`)
}
assert.match(at(503, 'WECHAT_IP_NOT_WHITELIST'), /白名单/, '白名单错误码优先于状态码')

// ---------- 1.5 凭据类：同样是「联系管理员」，绝不能落到 503 的「稍后重试」 ----------
// 2026-09-29 服务器实调微信拿到原始 errcode 40125（invalid appsecret）。
// 后端将按契约把这一族映射成 503 + code:'WECHAT_CREDENTIAL_INVALID'，
// 若前端没有这一支，就会显示「登录服务暂时不可用，请稍后重试」—— 又一个死循环。
const credentialSignals = [
  ['WECHAT_CREDENTIAL_INVALID', '后端按约定透传的稳定错误码（待后端改）'],
  ['40125', '微信原始 errcode：invalid appsecret'],
  ['40013', '微信原始 errcode：invalid appid'],
  ['41002', '微信原始 errcode：appid missing'],
  ['41004', '微信原始 errcode：appsecret missing'],
]
for (const [code, how] of credentialSignals) {
  const text = at(503, code)
  assert.match(text, /管理员/, `${how} 必须指向管理员，不能只教用户重试`)
  assert.equal(/稍后重试/.test(text), false, `${how} 落在 503 时不许出现「稍后重试」`)
}
assert.match(at(401, '40125'), /管理员/, '凭据类错误码优先于 401 那档「两条出路」文案')
assert.equal(
  at(401, '40125'),
  at(503, 'WECHAT_CREDENTIAL_INVALID'),
  '微信原始 errcode 与后端稳定码必须收敛到同一句文案',
)

// ---------- 2. 401/403：唯一无法分辨病因的一档，必须同时给两条出路 ----------
const ambiguous = at(401, 'UNAUTHORIZED', '登录凭证已失效，请重试')
assert.match(ambiguous, /过期/, '要说清「可能是凭证过期」（重试有效）')
assert.match(ambiguous, /服务器/, '也要说清「可能是服务端没配好」（重试无效）')
assert.match(ambiguous, /联系管理员/, '必须给出重试以外的出路，否则就是死循环')
assert.equal(/^微信授权已失效，请重新点击登录$/.test(ambiguous), false, '这正是引发死循环的旧文案')
assert.equal(at(403, 'UNAUTHORIZED'), at(401, 'UNAUTHORIZED'), '403 与 401 同档同文案')

// ---------- 3. 其余分支各归其位 ----------
assert.match(at(404), /尚未上线/)
assert.match(at(400), /参数|版本/)
assert.match(at(503), /稍后/)
assert.match(at(500), /稍后/)
assert.match(at(0), /检查网络/)
assert.match(at(418, '', '茶壶'), /茶壶/, '没归一的状态码应把后端 message 原样带出')
assert.equal(at(418, '', ''), '微信登录失败，请重试', '连 message 都没有时给兜底文案，不能是空串')

// ---------- 4. 任何一档都不许是空串（空串 = 页面上什么都不显示） ----------
for (const status of [0, 400, 401, 403, 404, 500, 503, 418, 999]) {
  assert.notEqual(at(status), '', `状态码 ${status} 的文案不能为空`)
}

console.log('PASS: wechat login error copy — 白名单类指向管理员、401 同时给出重试与联系管理员两条出路、其余状态码各自归位')
