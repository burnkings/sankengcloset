#!/usr/bin/env node
/**
 * 微信登录链路体检 —— 只读探针，不改任何状态。
 *
 * 跑三段：
 *  1) 直连微信 jscode2session（用假 code），判断「AppID/AppSecret + API IP 白名单」是否就绪；
 *     ⚠️ 这一段是**从本机**发的请求，所以它的结论只关于「本机出口 IP」，
 *        **不能**用来判断后端服务器在不在白名单里（详见 WECHAT_CODES 上方的注释）。
 *  2) 打自家后端 POST /api/v1/sessions/wechat（空 body），判断路由是否为公开路由（不是被鉴权中间件挡住）；
 *  3) 打自家后端（假 code），判断后端是否已实现 code2Session 代理。
 *     注意这一条**分辨不出**拒绝原因：后端把「code 无效」和「40164」都压成同一个 401。
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
  40125: ['FAIL', 'AppSecret 被拒：**值**无效，或 AppID 与 AppSecret **不配对**（两者居其一，见下方说明）'],
  // 41002 / 41004 / 41008 是同一族：**参数根本没传到位**，与「值对不对」无关。
  // 它们几乎总是参数名写错或变量为空，不是凭据本身有问题 —— 别去后台重置 Secret。
  41002: ['FAIL', 'appid 参数缺失（键名写错或值为空）'],
  41004: ['FAIL', 'secret 参数缺失（键名写错或值为空）——「没传」而不是「传错」，见下方说明'],
  41008: ['FAIL', 'js_code 参数缺失（键名写错或值为空）'],
  40164: ['BLOCKED', '调用方 IP 不在「API IP 白名单」里（凭据本身未被否掉）'],
  40029: ['PASS', 'code 无效 —— 说明 AppID/AppSecret/白名单全部通过（假 code 本就该报这个）'],
  45011: ['WARN', '接口调用频率超限，稍后重试'],
  89503: ['WARN', '命中微信风控，需用户侧验证'],
}

/**
 * 41004 的两种成因（2026-09-29 实测踩过）。
 *
 * `{"errcode":41004,"errmsg":"appsecret missing"}` 的字面意思是
 * **「请求里没有 secret 这个参数（或它是空串）」**，不是「secret 的值不对」——
 * 值不对会报 40125。所以看到 41004 时**不要**去公众平台重置 AppSecret，那是白费。
 *
 *   ① 参数名写错：必须叫 `secret`。写成 `appsecret` / `app_secret` / `appSecret`
 *      都会得到这条错。微信官方社区里这个报错绝大多数就是这个原因。
 *   ② 变量是空的：env 没加载 / 名字拼错 / **改了 .env 却没重启进程**（跑着的老进程还是旧 env）。
 *
 * ⚠️ 最容易制造假象的是**服务器上手工 curl**：写成 `secret=$SECRET` 这类占位变量名时，
 *    变量不存在会被 shell 展开成空串 ⇒ 你其实什么都没传，却会误判成「后端配错了」。
 *    ⚠️⚠️ 变量名有**两套**，别混（2026-09-29 实测踩过）：
 *        本仓库 `.env.local`         = `WECHAT_MP_APPID` / `WECHAT_MP_APP_SECRET`
 *        后端线上（PM2 那台机器）    = `WECHAT_APP_ID`  / `WECHAT_APP_SECRET`
 *    两边名字不同**本身不是 bug**，但拿着 A 的名字去读 B 的 env 只会取到空串 ⇒ 伪造出一个假 41004。
 */
function explainMissingParam(code) {
  if (code === 41004) {
    console.log('         41004 是「secret 参数**没传**或为空」，**不是**「secret 值不对」（那是 40125）。')
    console.log('         先查参数名：微信只认 `secret`，写成 appsecret / app_secret / appSecret 都报这条。')
    console.log('         再查变量：env 没加载、名字拼错、或**改了 .env 没重启进程**。')
    console.log('         ⚠️ 手工 curl 时写 `secret=$SOMETHING`，变量不存在会展开成空串 ——')
    console.log('            那等于你自己没传，别把它当成后端的结论。')
    console.log('            变量名两套：本仓库 .env.local = WECHAT_MP_APP_SECRET；后端线上 = WECHAT_APP_SECRET。')
    // 2026-09-29 实测：微信的检查顺序是「先 IP 白名单，后参数校验」。
    // 从**不在白名单**的机器发空 secret，得到的是 40164 而不是 41004（本机已复现两次）。
    // 所以「能收到 41004」本身就是白名单已通过的**二次证明**，见下方小结。
    console.log('         补充：微信先查 IP 后查参数 ⇒ 只有在**白名单已通过**的机器上才可能看到 41004，')
    console.log('               这反过来证明发出这次请求的机器是白名单内的。')
  }
}

/**
 * 凭据被微信**拒掉**（不是「没传」）时的说明 —— 2026-09-29 服务器实测结论。
 *
 * 实测拿到 `{"errcode":40125,"errmsg":"invalid appsecret"}`，且同一次请求里
 * appid/secret 都非空、参数名正确、调用方在白名单内 ⇒ 凭据本身被否。
 * 这一步**先别急着重置 AppSecret**，因为 40125 有两种成因，重置只能治其中一种。
 */
function explainRejectedCredential(code) {
  if (code === 40125 || code === 40013) {
    console.log('         40125 有两种成因，先分清再动手（重置 AppSecret 只能治第一种）：')
    console.log('           ① AppSecret 的值本身失效了（被重置过 / 当初就没配对）')
    console.log('           ② **AppID 与 AppSecret 不配对** —— 拿了另一个应用的 secret')
    console.log('         ⚠️ 要的是**小程序 AppSecret（小程序密钥）**，路径：公众平台 → 开发管理 → 开发设置 →')
    console.log('            **开发者 ID** → AppSecret(小程序密钥)。且必须与 AppID wx976f673896c8b565')
    console.log('            出自**同一个小程序**。这几个都不对：公众号 AppSecret（走 sns/oauth2/access_token）、')
    console.log('            开放平台移动应用 AppSecret（那是 App 端微信登录的另一套）、微信支付 APIv3 密钥、')
    console.log('            小程序代码上传密钥（只管 miniprogram-ci）、access_token。')
    console.log('         零成本分辨法（只比 md5，不暴露明文）：')
    console.log("           printf '%s' \"$APPID\"  | md5sum   # 期望 14504ba0f1908f393575c2d9b11a7c80")
    console.log("           printf '%s' \"$SECRET\" | md5sum   # 期望 821be8b956fa42963b2ec25bb103119b")
    console.log('           appid md5 不符 ⇒ 是 appid 指错了应用，**别重置 secret**；')
    console.log('           两个都相符   ⇒ 值确实失效了，这时才去小程序后台重置 AppSecret。')
    console.log('         重置后要改的是 **.env.production**（不是 .env；后端没用 dotenv，')
    console.log('         且 ecosystem.config.cjs 里写死的空值全靠 start-prod.sh 覆盖），')
    console.log('         然后 `pm2 restart sankengcloset-api --update-env`。')
  }
}

/**
 * 40164 的唯一修法。
 *
 * 官方文档（微信开发者平台 → 操作指南 → 平台基础功能 → API IP 白名单）说明：
 * 小程序/小游戏有**两个** IP 白名单，名字很像但管的事完全不同，别配错：
 *
 *   · **API IP 白名单** —— 路径：开发管理 → 开发设置 → **开发者 ID** → IP 白名单
 *     开启后只有名单内的 IP 才能调用「参数为 AppSecret 的接口」。`sns/jscode2session`
 *     的参数是 appid + **secret** + js_code + grant_type ⇒ 归它管，不在名单内就报 40164。
 *     **登录要加白的是这一条。**
 *   · **代码上传 IP 白名单** —— 路径：开发管理 → 开发设置 → **小程序代码上传** → IP 白名单
 *     只影响「代码上传接口」即 miniprogram-ci（CI 上传）。与登录、与 40164 都无关。
 *     本项目用开发者工具的登录态上传，连这条都用不到。
 *
 * 两者共同的配置规则：最多 10 个；支持 `1.2.3.4` / `1.2.3.*` / `1.2.3.0/24`；
 * **不支持「IP:端口」**（填了会存不进去或无效）；要填**出口公网 IP**，不是内网 IP。
 */
const WHITELIST_HINT = '开发管理 → 开发设置 → 开发者 ID → IP 白名单（官方名「API IP 白名单」）'
const API_IP_WHITELIST_DOC = 'https://developers.weixin.qq.com/doc/oplatform/developers/basic_func/ip_whitelist'

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

/**
 * 凭据脱敏描述：**绝不回显任何字符**。
 * 旧实现打的是 `前6位***后4位`，等于把一个可用 Secret 的 10/32 个字符留在终端历史和
 * 对话记录里；一旦这段输出被贴出去排查，凭据就废了。只报「有/无 + 长度」足够定位问题
 * （长度不对 = 复制粘贴缺字符）。
 */
function describeSecret(value) {
  if (value === '') return '(未配置)'
  return `已配置（长度 ${value.length}，不打印）`
}

async function probeWechat() {
  console.log('\n[1/3] 直连微信 jscode2session（假 code）')
  if (APPID === '' || SECRET === '') {
    // 不要静默 SKIP：凭据为空时微信会回 41004「appsecret missing」，
    // 那是个很容易被误读成「后端凭据配错」的错误，这里直接把话说明白。
    console.log(`  appid  = ${APPID === '' ? '(未配置)' : APPID}`)
    console.log(`  secret = ${describeSecret(SECRET)}`)
    console.log('  SKIP — 未找到 WECHAT_MP_APPID / WECHAT_MP_APP_SECRET（环境变量或 .env.local）')
    console.log('         ⚠️ 带着空 secret 去调微信：**白名单内**的机器回 41004「appsecret missing」')
    console.log('            （= 参数没传），白名单外的机器会先被 40164 拦掉。两种都别读成「凭据配错」。')
    return null
  }
  console.log(`  appid  = ${APPID}`)
  console.log(`  secret = ${describeSecret(SECRET)}`)
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
      if (body.errcode === 40164) {
        // ⚠️ 这一段请求是**从跑本脚本的这台机器**发出的，所以 errmsg 里的 IP 是**本机出口 IP**，
        //    不是后端服务器的 IP。把它当成「后端服务器没加白」是误读——本探针根本证明不了
        //    后端那一跳的状态（后端把 40164 和 code 过期都压成同一个 401，[3/3] 段也分辨不出）。
        const ip = /invalid ip ([0-9a-fA-F:.]+)/.exec(typeof body.errmsg === 'string' ? body.errmsg : '')
        console.log('         注意：本次调用方是**本机**，上面 errmsg 里的 IP 是本机出口 IP，'
          + `不是后端服务器 IP${ip ? `（本机出口 IP = ${ip[1]}）` : ''}。`)
        console.log('         由此只能得出：① 该白名单确实**已开启**（40164 只在开启后才会出现）')
        console.log('                       ② **本机**不在名单内。')
        console.log('         后端服务器在不在名单内，本探针**证明不了** —— 要在后台看一眼名单内容，')
        console.log('         或让后端把微信原始 errmsg 打进日志（errmsg 里就带着后端自己的出口 IP）。')
      }
      explainMissingParam(body.errcode)
      explainRejectedCredential(body.errcode)
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
    let body = null
    try { body = JSON.parse(text) } catch { /* 非 JSON */ }
    // 客户端 wechatLoginErrorMessage() 靠 error.code 区分「code 过期」和「IP 未白名单」。
    // 后端不回 code，前端就只能看到一句笼统文案，排查时会被绕圈。
    const code = body && body.error && typeof body.error.code === 'string' ? body.error.code : ''
    if (code === '') {
      console.log('  → WARN  响应体没有 error.code：前端无法区分「code 过期」与「IP 未白名单」，请后端补上稳定错误码')
    } else {
      console.log(`  error.code = ${code}`)
    }
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

/**
 * 后端是否**已经**按契约 §3.2.1 做了三档分流（人工确认后才能置真）。
 *
 * 为什么必须人工确认：未分流时后端把几乎所有 code2Session 失败都塌成
 * `401 UNAUTHORIZED`，此时「收到 401」根本不能推断「凭据已通过」——
 * 凭据被拒也是 401。只有分流上线后，凭据类才会变成
 * `503 WECHAT_CREDENTIAL_INVALID`，401 才真正等价于「凭据 OK、只是 code 无效」。
 * 不做这个区分的话，探针会给出一个漂亮的假阳性 ✅。
 */
const EXPECT_SPLIT = process.argv.includes('--expect-split') || process.env.EXPECT_SPLIT === '1'

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
    // ⚠️ 这一段必须自己解析响应体：probeRouteIsPublic 里的那个 code 是另一个作用域，别复用。
    let body = null
    try { body = JSON.parse(text) } catch { /* 非 JSON */ }
    const code = body && body.error && typeof body.error.code === 'string' ? body.error.code : ''
    const requestId = body && typeof body.requestId === 'string' ? body.requestId : ''
    if (code !== '') console.log(`  error.code = ${code}${requestId !== '' ? `   requestId = ${requestId}` : ''}`)
    if (res.status >= 200 && res.status < 300) {
      console.log('  → WARN  假 code 竟然登录成功，后端可能没真调 code2Session')
      return 'WARN'
    }
    if (res.status === 404) {
      console.log('  → FAIL  接口不存在：后端还没实现 /api/v1/sessions/wechat')
      return 'FAIL'
    }
    // 后端按契约 §3.2.1 做三档分流之后，这一段就变成**远程验收**：
    // 本机没有白名单也能靠 error.code 判断凭据过没过 ——
    //   凭据 OK   → 微信回 40029（假 code）→ 后端映射 401 UNAUTHORIZED   ← 期望
    //   凭据被拒  → 503 WECHAT_CREDENTIAL_INVALID
    if (code === 'WECHAT_CREDENTIAL_INVALID') {
      console.log('  → FAIL  后端已按 errcode 分流，判定为**微信凭据被拒**')
      console.log('         说明 env 里那个 AppSecret 仍然不对 ⇒ 回契约 §3.1.2 第 2 步重核一次 md5')
      return 'FAIL'
    }
    if (code === 'WECHAT_IP_NOT_WHITELIST') {
      console.log('  → FAIL  后端判定为**出口 IP 不在微信白名单**')
      console.log('         白名单已核对过 ⇒ 这条属意外：先确认 API 到底跑在哪台机器上（契约 §1.2 ⑥ 前提校验）')
      return 'FAIL'
    }
    if (res.status === 400 || res.status === 401 || res.status === 422) {
      if (code === 'UNAUTHORIZED') {
        if (EXPECT_SPLIT) {
          console.log('  → PASS  ✅ 凭据已被微信接受（假 code 本该报 40029 → 401 UNAUTHORIZED）')
          console.log('         前提：后端三档分流已上线（由 --expect-split 人工确认）。')
          console.log('         即 AppID / AppSecret / 白名单三项全部通过，登录链路这一环修好了。')
        } else {
          console.log('  → PASS  假 code 被拒绝了 —— 但**现在这一条分辨不出原因**：')
          console.log('         后端还没做三档分流时，凭据被拒 / code 无效 / IP 未白名单 全都塌成这个 401，')
          console.log('         所以「收到 401」此刻**不能**推断凭据已通过。')
          console.log('         等 §3.2.1 的三档分流上线后，加 `--expect-split` 再跑一次即可判定。')
        }
      } else {
        console.log('  → PASS  后端已实现：假 code 被拒绝（这正是期望结果）')
        console.log('         但响应体没有可分辨的 error.code ⇒ 凭据问题与 code 问题仍分不开（契约 §3.2.1）。')
      }
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
    console.log('待办：本探针 [1/3] 显示 BLOCKED，只说明**本机**不在白名单内 —— 不等于后端没加白。')
    console.log('      2026-09-29 已核对：公众平台「开发者 ID → IP 白名单」里就是后端出口 IP')
    console.log('      （服务器 `curl ifconfig.me` = 白名单里的值）⇒ **这一条已经排除**，别再往这里改配置。')
    console.log('      ✅ 2026-09-29 23:5x **本条已闭环**（完整证据链见契约 §1.2 ⑦）：')
    console.log('         ① 用后端进程自己的 env 直连微信 → 原始 errcode = 40125 invalid appsecret')
    console.log('         ② 与公众平台当前值比 md5：线上那份是**过期值**（821be8b9… ≠ 6e6683ff…）')
    console.log('            ⇒ 直接替换 .env.production，**不必重置 AppSecret**（契约 §3.1.2）')
    console.log('         ③ 换值后直连微信 → 40029 invalid code ⇒ 凭据已被接受')
    console.log('         ④ 后端已上线三档分流：抛错前 log.warn errcode/errmsg，以后 grep requestId 就能看到原始错误')
    console.log('         ⑤ 本机远程验收 → 本文件 --expect-split 回「✅ 凭据已被微信接受」')
    console.log('      ▶ 仍然只有「服务器域名 request 合法域名」这一项**只能你在后台确认**，见下方第 1 条。')
    console.log('      ⚠️ 唯一正确的输入是**后端进程的 env**；手敲 `secret=$XXX` 时变量不存在会展开成空串，')
    console.log('         那会伪造出一个「appsecret missing」，把你自己带偏。')
    console.log('         变量名两套：本仓库 .env.local = WECHAT_MP_APP_SECRET，后端线上 = WECHAT_APP_SECRET。')
    console.log('      ▶ 换完 secret + 上线三档分流后，**本机也能远程判定**：')
    console.log('          node scripts/check-wechat-login.js --expect-split')
    console.log('        回「✅ 凭据已被微信接受」= 凭据/白名单/参数全过；回 FAIL WECHAT_CREDENTIAL_INVALID = 值还不对。')
    console.log(`      若确实还要加白：路径 = ${WHITELIST_HINT}；填**出口公网 IP**（不是内网 IP、不是域名、不能带端口），`)
    console.log('      支持 `1.2.3.4` / `1.2.3.*` / `1.2.3.0/24`，上限 10 个；不要把本机 IP 当成后端的。')
    console.log(`      官方说明：${API_IP_WHITELIST_DOC}`)
    console.log('      ⚠️ 不要动「开发管理 → 开发设置 → 小程序代码上传 → IP 白名单」——')
    console.log('         它只管 miniprogram-ci（CI 上传代码），与登录、与 40164 无关。')
  }
  console.log('')
  console.log('本探针查不到、但真机登录必需的两项（只能你在微信公众平台手动确认）：')
  console.log(`  1) 服务器域名 request 合法域名 必须含 ${new URL(API_BASE).host}`)
  console.log('     缺它的话，小程序端连请求都发不出去（真机报 "不在以下 request 合法域名列表中"，')
  console.log('     而开发者工具勾了「不校验合法域名」时会假装正常——所以必须在真机上验一次）。')
  console.log('  2) 该域名必须是 HTTPS 且已完成 ICP 备案（微信硬性要求）。')
  const ok = c === 'PASS' && b === 'PASS'
  process.exit(ok ? 0 : 1)
})()
