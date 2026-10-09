/**
 * session-boundary-contract — 护栏：**会话边界（发起者 / 代际 / 退出清理）**
 *
 * 背景（2026-10-09 评审 P1-1 / P1-2 / P1-3）：
 *   登录态是全局单例，但异步操作可能在「用户已退出或换了账号」之后才回来。
 *   没有会话代际时，迟到响应会把旧账号数据写进新账号上下文：
 *     - P1-1：A 的写入失败后 owner 取「当前用户」= B ⇒ A 的 payload 挂到 B 名下
 *     - P1-2：A 的 refresh 在途，退出后 refresh 成功把 token 复活成 A-new
 *     - P1-3：退出只递增 seq，不清已显示的内存 ⇒ getPurchaseById 仍返回 A 的记录
 *
 * 判据（双向）：
 *   1. 必须存在 utils/session-generation.uts，且 logout/登录成功都递增代际。
 *   2. write-back 必须在**动作开始时**固定 owner 与 epoch，不得在 catch 里现取 owner。
 *   3. refresh 与 401 重试必须在写回前校验代际。
 *   4. logout 必须调用各个人 store 的 resetSession（清内存），而不只是 bumpFetchSeq。
 *   5. 退出清理必须覆盖按账号分键的个人数据（含历史裸键）。
 *   6. 远端恢复必须与本地 CRUD 读写**同一个源**（否则新设备首次编辑/删除必失败）。
 *   7. 个人 repo 必须按账号分键，不得用全局单键。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8');
}

/** 去掉注释，避免「注释里提到的写法」被误判成活代码 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SESSION_GEN = 'utils/session-generation.uts';
const WRITE_BACK = 'services/sync/write-back.uts';
const API_CLIENT = 'services/platform/api-client.uts';
const SESSION_STORE = 'stores/session-store.uts';

// ── 1. 会话代际模块本身 ────────────────────────────────────────────────────

test('必须存在 utils/session-generation.uts，并提供代际读取/失效/守卫三个 API', () => {
  const src = stripComments(read(SESSION_GEN));
  assert.ok(/export function getSessionGeneration/.test(src), '必须 export getSessionGeneration');
  assert.ok(/export function invalidateSessionGeneration/.test(src), '必须 export invalidateSessionGeneration');
  assert.ok(/export function isSameSession/.test(src), '必须 export isSameSession');
  // ⚠️ 必须独立于 session-store，否则 api-client ↔ session-store 会循环依赖
  assert.ok(
    !/from '@\/stores\/session-store'/.test(src),
    'session-generation 不得依赖 session-store（会与 api-client 形成循环依赖）',
  );
});

// ── 2. logout 必须换代 + 清内存 ────────────────────────────────────────────

test('logout 必须先使会话失效，再清理（次序决定迟到响应能否被拦下）', () => {
  const src = stripComments(read(SESSION_STORE));
  const logoutMatch = src.match(/function logout\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(logoutMatch != null, 'session-store 里应能找到 logout 函数');
  const body = logoutMatch[0];

  assert.ok(
    /invalidateSessionGeneration\(\)/.test(body),
    'logout 必须调用 invalidateSessionGeneration() —— 否则迟到的 refresh/SWR 会污染下一个会话',
  );
  // 次序：失效必须早于清理
  const idxInvalidate = body.indexOf('invalidateSessionGeneration()');
  const idxClear = body.indexOf('clearStoredSession()');
  assert.ok(idxInvalidate >= 0 && idxClear >= 0, 'logout 应同时包含 invalidate 与 clearStoredSession');
  assert.ok(
    idxInvalidate < idxClear,
    'invalidateSessionGeneration() 必须**先于** clearStoredSession() —— 先断代际，再清理',
  );
});

test('登录成功也必须换代（切账号后旧会话的迟到响应不得污染新账号）', () => {
  const src = stripComments(read(SESSION_STORE));
  // 登录成功路径里 saveSessionTokens 之前要有 invalidateSessionGeneration
  const idxSave = src.indexOf("saveSessionTokens(accessToken");
  assert.ok(idxSave >= 0, '应能找到登录成功时的 saveSessionTokens 调用');
  const before = src.slice(Math.max(0, idxSave - 800), idxSave);
  assert.ok(
    /invalidateSessionGeneration\(\)/.test(before),
    '登录成功（saveSessionTokens 之前）必须 invalidateSessionGeneration()，开启新会话',
  );
});

test('logout 必须清空各个人 store 的内存态，而不只是递增 fetchSeq', () => {
  const src = stripComments(read(SESSION_STORE));
  const logoutMatch = src.match(/function logout\(\)\s*\{[\s\S]*?\n\}/);
  const body = logoutMatch[0];

  for (const name of ['resetWardrobeSession', 'resetPurchaseSession', 'resetWishlistSession', 'resetReminderSession']) {
    assert.ok(body.includes(name), `logout 必须调用 ${name}() 清空内存态（仅 bumpFetchSeq 清不掉已显示的数据）`);
  }
  assert.ok(
    !/bumpWardrobeFetch\(\)/.test(body),
    'logout 不应再只用 bumpWardrobeFetch() —— 它只防迟到响应，不清已显示的数据',
  );
});

// ── 3. 各个人 store 必须提供 resetSession ──────────────────────────────────

test('四个个人 store 必须各自 export resetSession（清内存 + 递增 seq）', () => {
  for (const f of ['wardrobe', 'purchase', 'wishlist', 'reminder']) {
    const src = stripComments(read(`stores/${f}-store.uts`));
    assert.ok(
      /export function resetSession\s*\(/.test(src),
      `stores/${f}-store.uts 必须 export resetSession()`,
    );
    const m = src.match(/export function resetSession\s*\(\)\s*\{[\s\S]*?\n\}/);
    assert.ok(m != null, `stores/${f}-store.uts 的 resetSession 应有函数体`);
    assert.ok(
      /_fetchSeq\s*\+=\s*1/.test(m[0]),
      `stores/${f}-store.uts 的 resetSession 必须同时递增 _fetchSeq（丢弃 in-flight 请求）`,
    );
    assert.ok(
      /_state\.items\s*=\s*\[\]/.test(m[0]),
      `stores/${f}-store.uts 的 resetSession 必须清空 _state.items（否则退出后仍能读到上一个账号的记录）`,
    );
  }
});

// ── 4. 退出清理清单必须覆盖四个个人 repo 的落盘键 ──────────────────────────

test('退出清理必须覆盖四个个人 repo 的基础键（含按账号分键的作用域变体）', () => {
  const src = stripComments(read(SESSION_STORE));
  // 基础键登记在 utils/user-scope.uts 的 USER_DATA_BASES（唯一登记处）
  const scopeSrc = stripComments(read('utils/user-scope.uts'));
  for (const key of ['wardrobe_items', 'purchase_records', 'wishlist_items', 'reminder_items']) {
    assert.ok(
      scopeSrc.includes(`'${key}'`),
      `utils/user-scope.uts 的 USER_DATA_BASES 必须登记 '${key}' —— 否则退出时漏清该账号数据`,
    );
  }
  // logout 必须调用会清这些作用域键的函数
  const logoutMatch = src.match(/function logout\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(
    /clearUserDataScopedKeys\(\)/.test(logoutMatch[0]),
    'logout 必须调用 clearUserDataScopedKeys() 清除按账号分键的个人数据',
  );
  // 该函数必须同时清「裸键」与「作用域键」
  const helper = src.match(/function clearUserDataScopedKeys\(\)[\s\S]*?\n\}/);
  assert.ok(helper != null, 'session-store 应有 clearUserDataScopedKeys 实现');
  assert.ok(
    /removeStorageSync\(base\)/.test(helper[0]),
    'clearUserDataScopedKeys 必须清掉历史遗留的**裸键**（未分账号时期写下的数据）',
  );
  assert.ok(
    /scopedKeyFor\(base, scope\)/.test(helper[0]),
    'clearUserDataScopedKeys 必须清掉**当前账号的作用域键**',
  );
});

test('个人 repo 必须使用按账号分键（不得再用全局单键）', () => {
  // 2026-10-09 评审 P0-1 的正确解法：业务数据可以落盘，但必须按账号隔离。
  for (const f of ['wardrobe', 'purchase', 'wishlist', 'reminder']) {
    const src = stripComments(read(`domain/repositories/${f}-repo.uts`));
    assert.ok(
      /import \{ scopedKey \} from '@\/utils\/user-scope'/.test(src),
      `domain/repositories/${f}-repo.uts 必须引入 scopedKey 做账号隔离`,
    );
    assert.ok(
      /function storageKey\(\)/.test(src),
      `domain/repositories/${f}-repo.uts 必须有 storageKey() 返回当前账号的作用域键`,
    );
    // 禁止直接用裸常量读写 storage（那会重新变成全局单键）
    assert.ok(
      !/uni\.(get|set|remove)StorageSync\(STORAGE_KEY[,)]/.test(src),
      `domain/repositories/${f}-repo.uts 不得再用裸 STORAGE_KEY 读写 —— 会退回全局单键、换账号串数据`,
    );
  }
});

test('logout 中的作用域清理必须早于 resetToGuest（否则算不出当前账号 scope）', () => {
  const src = stripComments(read(SESSION_STORE));
  const logoutMatch = src.match(/function logout\(\)\s*\{[\s\S]*?\n\}/);
  const body = logoutMatch[0];
  const idxScoped = body.indexOf('clearUserDataScopedKeys()');
  const idxGuest = body.indexOf('resetToGuest()');
  assert.ok(idxScoped >= 0 && idxGuest >= 0, 'logout 应同时含 clearUserDataScopedKeys 与 resetToGuest');
  assert.ok(
    idxScoped < idxGuest,
    'clearUserDataScopedKeys() 必须在 resetToGuest() **之前** —— resetToGuest 会清掉 userId，' +
      '之后就再也算不出「当前账号」的 scope，导致漏清数据',
  );
});

// ── 5. write-back 必须在动作开始时固定 owner + epoch ───────────────────────

test('write-back 必须在动作开始时固定 owner 与 epoch（不得在 catch 里现取 owner）', () => {
  const src = stripComments(read(WRITE_BACK));

  // 必需：开始时捕获
  assert.ok(
    /const owner = getCurrentSyncUserId\(\)/.test(src),
    'write-back 必须在函数开始处 `const owner = getCurrentSyncUserId()` 固定归属',
  );
  assert.ok(
    /const epoch = getSessionGeneration\(\)/.test(src),
    'write-back 必须在函数开始处捕获 session generation',
  );

  // 禁止：在 enqueueLocalOperation 的参数位置直接现取 owner（历史 bug 的写法）
  assert.ok(
    !/enqueueLocalOperation\(\s*getCurrentSyncUserId\(\)/.test(src),
    'enqueueLocalOperation 不得直接传 getCurrentSyncUserId() —— 失败时才取会取到**新**账号，把旧 payload 挂错人',
  );

  // 必需：入队前做代际守卫
  assert.ok(
    /isSameSession\(epoch\)/.test(src),
    'write-back 入队前必须用 isSameSession(epoch) 守卫，会话已变则取消',
  );
  // 取消语义必须存在（不能把取消伪装成成功）
  assert.ok(
    /SYNC_CANCELLED|cancelled/.test(src),
    'write-back 必须返回明确的「已取消」结果，不得把取消伪装成成功',
  );
});

// ── 6. refresh / 401 重试必须在写回前校验代际 ──────────────────────────────

test('doRefreshRemoteSession 必须在 saveSessionTokens 之前校验代际与 refreshToken', () => {
  const src = stripComments(read(API_CLIENT));
  const fn = src.match(/async function doRefreshRemoteSession\(\)[\s\S]*?\n\}/);
  assert.ok(fn != null, 'api-client 里应能找到 doRefreshRemoteSession');
  const body = fn[0];

  assert.ok(/getSessionGeneration\(\)/.test(body), 'refresh 必须捕获代际');
  assert.ok(
    /isSameSession\(epoch\)/.test(body),
    'refresh 写回前必须用 isSameSession(epoch) 校验 —— 否则退出后迟到的 refresh 会把 token 复活',
  );
  // 代际校验必须出现在 saveSessionTokens 之前
  const idxGuard = body.indexOf('isSameSession(epoch)');
  const idxSave = body.indexOf('saveSessionTokens');
  assert.ok(idxGuard >= 0 && idxSave >= 0, 'refresh 应同时含代际校验与 saveSessionTokens');
  assert.ok(idxGuard < idxSave, '代际校验必须**先于** saveSessionTokens 执行');
  // 还应校验 refreshToken 未被换掉
  assert.ok(
    /refreshToken !== getCachedRefreshToken\(\)/.test(body),
    'refresh 还必须校验 refreshToken 未被替换（防另一路刷新覆盖）',
  );
});

test('apiAuthorized 的 401 重试必须限定在同一会话内', () => {
  const src = stripComments(read(API_CLIENT));
  const fn = src.match(/async function apiAuthorized\([\s\S]*?\n\}/);
  assert.ok(fn != null, 'api-client 里应能找到 apiAuthorized');
  const body = fn[0];

  assert.ok(/getSessionGeneration\(\)/.test(body), 'apiAuthorized 必须捕获代际');
  assert.ok(
    /isSameSession\(epoch\)/.test(body),
    'apiAuthorized 必须在刷新前后校验代际 —— 否则 A 的旧请求会用 B 的凭据重放',
  );
});

// ── 7. 无 history 残留：旧的「失败才取 owner」写法不得复活 ─────────────────

test('不得在任何地方出现「catch 里现取 owner 入队」的历史写法', () => {
  const offenders = [];
  const files = ['services/sync/write-back.uts', 'stores/wardrobe-store.uts', 'stores/purchase-store.uts'];
  for (const f of files) {
    const src = stripComments(read(f));
    if (/enqueueLocalOperation\(\s*getCurrentSyncUserId\(\)/.test(src)) {
      offenders.push(f);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `以下文件仍在用「现取 owner」的危险写法：\n  ${offenders.join('\n  ')}`,
  );
});

// ── 8. 云端恢复必须与本地 CRUD 读写同一个源（评审 P1-4） ───────────────────

test('远端恢复必须把快照写进 repo，让 CRUD 与 state 读写同源', () => {
  // 历史 bug：fetchItems 的远端分支只赋 _state.items，不写 repo；
  // 而 updateItem/deleteItem/toggleFavorite 都从 repo.loadAll() 找 ID
  // ⇒ 新设备上首次编辑/删除/收藏全部返回 false，连远端请求都不发。
  const src = stripComments(read('stores/wardrobe-store.uts'));
  const fetchFn = src.match(/async function fetchItems\(\)[\s\S]*?\n\}/);
  assert.ok(fetchFn != null, 'wardrobe-store 应有 fetchItems');
  const body = fetchFn[0];
  assert.ok(
    /repo\.replaceAll\(/.test(body),
    'fetchItems 的远端分支必须调用 repo.replaceAll(...) 把快照写进 repo —— 只赋 _state.items 会让首次 CRUD 失败',
  );
  // state 应从 repo 派生，而不是直接用远端数组
  assert.ok(
    /_state\.items = repo\.getAll\(\)/.test(body),
    'fetchItems 远端分支应让 _state.items 从 repo 派生（读写同源）',
  );
});

test('每个个人 repo 都必须提供 replaceAll（供远端快照写入）', () => {
  for (const f of ['wardrobe', 'purchase', 'wishlist', 'reminder']) {
    const src = stripComments(read(`domain/repositories/${f}-repo.uts`));
    assert.ok(
      /export function replaceAll\s*\(/.test(src),
      `domain/repositories/${f}-repo.uts 必须 export replaceAll()，供远端恢复写入同一数据源`,
    );
  }
});
