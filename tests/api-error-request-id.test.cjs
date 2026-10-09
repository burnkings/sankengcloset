/**
 * api-error-request-id.test.cjs — 错误响应里的 requestId 必须一路带到用户面前
 *
 * 背景（2026-09-29）：微信登录一直报 401，而后端把**所有** code2Session 失败都压成同一句
 * 「登录凭证已失效，请重试」——微信的 40013(AppID 不符) / 40125(AppSecret 错) /
 * 40029(code 无效) / 40164(IP 未白名单) 在前端看起来一模一样。
 * 后端每个响应都带 requestId，它是唯一能把「用户屏幕上这次失败」对上「后端日志里那一条」的把手。
 *
 * 回归风险很隐蔽：parseResponse 是在**抛异常之前**读 requestId 还是之后，只差一行，
 * 但读错位置就静默丢失，界面上什么都没有、测试也不会红 —— 所以这里钉死这条链路。
 */
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const path = require('path');
const root = path.resolve(__dirname, '..') + '/';

let source = fs.readFileSync(root + 'services/platform/api-client.uts', 'utf8')
  .replace(/^import .*$/mg, '')
  .replace(/export /g, '');
source = stripTypeScriptTypes(source, { mode: 'transform' });

const ctx = vm.createContext({
  JSON, console, Promise, Map, Set, Error, Date, Array, Object, String, Number, Boolean, Math,
  uni: { request: () => {} },
  getRuntimeConfig: () => ({ apiBaseUrl: '' }),
  getCachedAccessToken: () => '',
  getCachedRefreshToken: () => '',
  saveSessionTokens: () => {},
  catalogMemoryMs: () => 0,
  isCatalogPath: () => false,
  isCatalogFresh: () => false,
  readCatalog: () => null,
  writeCatalog: () => {},
  clearCatalogCache: () => {},
});
vm.runInContext(source + `
globalThis.api = { parseResponse, apiErrorStatus, apiErrorCode, apiErrorRequestId, ApiRequestError, ApiResponse };
`, ctx);
const api = ctx.api;

// ---------- 1. 非 2xx：requestId 必须跟着异常出来 ----------
let thrown = null;
try {
  api.parseResponse(401, {
    requestId: 'req-1ks',
    error: { code: 'UNAUTHORIZED', message: '登录凭证已失效，请重试' },
  });
} catch (e) { thrown = e }
assert.ok(thrown != null, 'parseResponse 对非 2xx 必须抛错');
assert.equal(api.apiErrorStatus(thrown), 401, '状态码应透传');
assert.equal(api.apiErrorCode(thrown), 'UNAUTHORIZED', '后端错误码应透传');
assert.equal(api.apiErrorRequestId(thrown), 'req-1ks',
  'requestId 必须在 throw 之前取出并挂到错误对象上 —— 丢了它就没法让后端捞日志，只能继续猜');

// ---------- 2. 2xx：requestId 同样要带出来（成功路径也要能对上日志）----------
const ok = api.parseResponse(200, { requestId: 'req-ok', data: { accessToken: 't' } });
assert.equal(ok.requestId, 'req-ok');
assert.equal(ok.statusCode, 200);
assert.deepEqual(ok.data, { accessToken: 't' });

// ---------- 3. 缺字段 / 非本类错误：一律空串，不得抛错 ----------
const noId = (() => { try { api.parseResponse(500, { error: { code: 'INTERNAL' } }) } catch (e) { return e } })();
assert.equal(api.apiErrorRequestId(noId), '', '响应体没有 requestId 时应为空串');
assert.equal(api.apiErrorRequestId(new Error('network down')), '', '非 ApiRequestError 应返回空串而不是抛错');
assert.equal(api.apiErrorRequestId(null), '', 'null 应返回空串');
assert.equal(api.apiErrorCode(new Error('x')), '', 'apiErrorCode 同样不得抛错');

// ---------- 4. 登录页必须把它显示出来（否则后端拿到 id 也没用）----------
const loginSrc = fs.readFileSync(root + 'pages/auth/login.uvue', 'utf8');
assert.match(loginSrc, /session\.errorRequestId/,
  '登录页必须读取 session.errorRequestId —— 不显示出来，用户就没法把它报给后端');

console.log('# PASS: api error requestId — 401 的 requestId 已能从响应体一路带到用户界面');
