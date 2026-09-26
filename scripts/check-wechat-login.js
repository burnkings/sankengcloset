#!/usr/bin/env node
/**
 * 微信登录链路体检 —— 只读探针，不改任何状态。
 *
 * 跑三段：
 *  1) 直连微信 jscode2session（用假 code），判断「AppID/AppSecret + IP 白名单」是否就绪；
 *  2) 打自家后端 POST /api/v1/sessions/wechat（空 body），判断路由是否为公开路由（不是被鉴权中间件挡住）；
 *  3) 打自家后端（假 code），判断后端是否已实现 code2Session 代理。
 *
 * 用法：
 *   node scripts/check-wechat-login.js
 * 凭据来源（按优先级）：
 *   环境变量 WECHAT_MP_APPID / WECHAT_MP_APP_SECRET → 项目根 .env.local
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const API_BASE = process.env.SANKENG_API_BASE || 'https://api.sankengcloset.icu'
const FAKE_CODE = 'PROBE_FAKE_CODE_NOT_FROM_WECHAT'

function readEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...readEnvLocal(), ...process.env }
const APPID = env.WECHAT_MP_APPID || ''
const SECRET = env.WECHAT_MP_APP_SECRET || ''

// 微信 errcode → 结论（只列本次会遇到的几个）
const WECHAT_CODES = {
  40013: ['FAIL', 'AppID 无效'],
  40125: ['FAIL', 'AppSecret 无效'],
  40164: ['BLOCKED', '调用方 IP 不在微信 IP 白名单（凭据本身未被否掉，需在公众平台把后端服务器公网 IP 加白）'],
  40029: ['PASS', 'code 无效 —— 说明 AppID/AppSecret/白名单全部通过（假 code 本就该报这个）'],
  45011: ['WARN', '接口调用频率超限，稍后重试'],
  89503: ['WARN', '命中微信风控，需用户侧验证'],
}

/** 带超时的 fetch：用显式 AbortController，超时后清掉定时器（避免 Node 退出时的 libuv 断言噪音） */
async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function mask(value) {
  if (value === '') return '(未配置)'
  if (value.length <= 8) return '***'
  return `${value.slice(0, 6)}***${value.slice(-4)}`
}

async function probeWechat() {
  console.log('\n[1/3] 直连微信 jscode2session（假 code）')
  if (APPID === '' || SECRET === '') {
    console.log('  SKIP — 未找到 WECHAT_MP_APPID / WECHAT_MP_APP_SECRET（环境变量或 .env.local）')
    return null
  }
  console.log(`  appid  = ${APPID}`)
  console.log(`  secret = ${mask(SECRET)}`)
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${FAKE_CODE}&grant_type=authorization_code`
  try {
    const res = await fetchWithTimeout(url, {}, 20000)
    const text = await res.text()
    console.log(`  HTTP ${res.status}  ${text}`)
    let body = null
    try { body = JSON.parse(text) } catch { /* 非 JSON */ }
    if (body && typeof body.errcode === 'number') {
      const hit = WECHAT_CODES[body.errcode]
      const [verdict, why] = hit || ['UNKNOWN', `未收录的 errcode ${body.errcode}`]
      console.log(`  → ${verdict}  ${why}`)
      return verdict
    }
    if (body && body.openid) {
      console.log('  → WARN  假 code 竟然换到了 openid，请确认 code 是否被复用')
      return 'WARN'
    }
    return 'UNKNOWN'
  } catch (e) {
    console.log(`  → FAIL  请求微信失败：${e.message}`)
    return 'FAIL'
  }
}

/** 空 body 探路由：公开登录路由应回 400 参数校验错，被鉴权中间件挡住则会回 401 */
async function probeRouteIsPublic() {
  console.log(`\n[2/3] 路由可见性 POST ${API_BASE}/api/v1/sessions/wechat（空 body）`)
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/sessions/wechat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }, 20000)
    const text = await res.text()
    console.log(`  HTTP ${res.status}  ${text.slice(0, 300)}`)
    if (res.status === 400 || res.status === 422) {
      console.log('  → PASS  公开路由且做参数校验（登录接口本该无需鉴权）')
      return 'PASS'
    }
    if (res.status === 401 || res.status === 403) {
      console.log('  → FAIL  被鉴权中间件挡住了：登录接口必须是公开路由，否则永远登不进来')
      return 'FAIL'
    }
    if (res.status === 404) {
      console.log('  → FAIL  路由不存在')
      return 'FAIL'
    }
    console.log('  → WARN  非预期状态码，人工确认')
    return 'WARN'
  } catch (e) {
    console.log(`  → FAIL  请求失败：${e.message}`)
    return 'FAIL'
  }
}

async function probeBackend() {
  console.log(`\n[3/3] code2Session 代理 POST ${API_BASE}/api/v1/sessions/wechat（假 code）`)
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/sessions/wechat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: FAKE_CODE, deviceId: 'probe_device' }),
    }, 20000)
    const text = await res.text()
    console.log(`  HTTP ${res.status}  ${text.slice(0, 400)}`)
    if (res.status >= 200 && res.status < 300) {
      console.log('  → WARN  假 code 竟然登录成功，后端可能没真调 code2Session')
      return 'WARN'
    }
    if (res.status === 404) {
      console.log('  → FAIL  接口不存在：后端还没实现 /api/v1/sessions/wechat')
      return 'FAIL'
    }
    if (res.status === 400 || res.status === 401 || res.status === 422) {
      console.log('  → PASS  后端已实现：假 code 被拒绝（这正是期望结果）')
      console.log('         注意：若真机登录也报同一句「登录凭证已失效」，')
      console.log('         第一嫌疑是后端服务器公网 IP 未进微信白名单（见上面 [1/3]）。')
      return 'PASS'
    }
    if (res.status >= 500) {
      console.log('  → FAIL  后端 5xx：code2Session 代理报错（多半是 AppSecret 或 IP 白名单）')
      return 'FAIL'
    }
    console.log('  → WARN  非预期状态码，人工确认返回体')
    return 'WARN'
  } catch (e) {
    console.log(`  → FAIL  请求后端失败：${e.message}`)
    return 'FAIL'
  }
}

;(async () => {
  console.log('微信登录链路体检 — 只读探针（不写入任何数据）')
  const a = await probeWechat()
  const b = await probeRouteIsPublic()
  const c = await probeBackend()
  console.log(`\n小结：微信直连 ${a || 'SKIP'} / 路由公开 ${b} / 后端代理 ${c}`)
  if (a === 'BLOCKED') {
    console.log('待办：在微信公众平台 → 开发管理 → 开发设置 → IP 白名单，加入后端服务器公网 IP。')
  }
  const ok = c === 'PASS' && b === 'PASS'
  process.exit(ok ? 0 : 1)
})()
