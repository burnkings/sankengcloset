/**
 * catalog-cache.test.cjs — 目录长缓存（services/platform/catalog-cache.uts）
 *
 * 这套缓存的三档时间语义很容易被改错，而且错了以后症状很隐蔽：
 *   · freshMs 写大了 → 用户看到一天前的数据却以为是最新的
 *   · staleMs 写大了 → 品牌下架了还在展示
 *   · 作用域漏校验 → 换账号后读到上一个账号的缓存（关注状态串号）
 * 所以这里把窗口边界、作用域隔离、失效与清理都钉死。
 */
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const path = require('path');
const root = path.resolve(__dirname, '..') + '/';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

let now = 1_800_000_000_000;
let token = 'token-a';
const storage = new Map();

let source = fs.readFileSync(root + 'services/platform/catalog-cache.uts', 'utf8')
  .replace(/^import .*$/mg, '')
  .replace(/export /g, '');
source = stripTypeScriptTypes(source, { mode: 'transform' });

const ctx = vm.createContext({
  Date: { now: () => now },
  getCachedAccessToken: () => token,
  JSON, console,
  uni: {
    getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
    setStorageSync: (k, v) => { storage.set(k, v) },
    removeStorageSync: (k) => { storage.delete(k) },
  },
});
vm.runInContext(source + `
globalThis.cc = { catalogMemoryMs, isCatalogPath, readCatalog, isCatalogFresh, writeCatalog, invalidateCatalog, clearCatalogCache, catalogCacheBytes };
`, ctx);
const cc = ctx.cc;

// ---------- 1. 策略表：哪些算「目录」，哪些必须排除 ----------
assert.equal(cc.isCatalogPath('/api/v1/brands'), true, '品牌列表应走长缓存');
assert.equal(cc.isCatalogPath('/api/v1/brands/brd_x'), true, '品牌详情应走长缓存');
assert.equal(cc.isCatalogPath('/api/v1/calendar?month=2026-09'), true, '发售日历应走长缓存');
assert.equal(cc.isCatalogPath('/api/v1/brands/followed'), false, '关注列表是个人数据，绝不能落盘');
assert.equal(cc.isCatalogPath('/api/v1/brands/brd_x/products'), false, '品牌商品带价格/销售状态，属于会变的数据');
assert.equal(cc.isCatalogPath('/api/v1/wishlist'), false);
assert.equal(cc.isCatalogPath('/api/v1/me/preferences'), false);
// 2026-10-03 起信息流走内容档：原来 `/feed` 被硬编码成 TTL=0（「每次必须新鲜」），
// 结果是首页**完全没有缓存**，每次冷启动/切回来都要重新等一遍网络。商品流不会秒变。
assert.equal(cc.isCatalogPath('/api/v1/feed'), true, '首页信息流应走内容档，冷启动才能秒出');
assert.equal(cc.catalogMemoryMs('/api/v1/feed'), 60 * 60 * 1000, '信息流进程内窗口 1 小时（2026-10-04 用户口径）');
// 榜单同批加入：按天才明显变动的数据，不该每次进页面都等一次网络往返
assert.equal(cc.isCatalogPath('/api/v1/ranking?tab=hot'), true, '榜单应走内容档');
assert.equal(cc.catalogMemoryMs('/api/v1/ranking?tab=hot'), 60 * 60 * 1000, '榜单进程内窗口 1 小时（同日口径）');
// 个人数据仍然一个都不许落盘
assert.equal(cc.isCatalogPath('/api/v1/community/posts'), false, '动态列表含仅自己可见帖，不落盘');
assert.equal(cc.isCatalogPath('/api/v1/wardrobe'), false);
assert.ok(cc.catalogMemoryMs('/api/v1/brands') >= 30 * 60 * 1000, '品牌目录内存窗口应≥30min');
assert.equal(cc.catalogMemoryMs('/api/v1/wishlist'), 0, '非目录路径由 api-client 的默认档处理');

// ---------- 2. 读写与「新鲜」窗口（写后 24h 内直接用，不发请求） ----------
const KEY = '/api/v1/brands';
cc.writeCatalog(KEY, JSON.stringify({ data: [{ id: 'b1' }] }));
let hit = cc.readCatalog(KEY);
assert.ok(hit != null, '刚写入的快照应能读到');
assert.equal(JSON.parse(hit.body).data[0].id, 'b1');
assert.equal(hit.ageMs, 0);
assert.equal(cc.isCatalogFresh(KEY, hit.ageMs), true, '刚写入应在新鲜窗口内');

now += 25 * HOUR;
hit = cc.readCatalog(KEY);
assert.ok(hit != null, '25h 仍在可接受陈旧窗口内，应该返回（交给 SWR 后台刷新）');
assert.equal(cc.isCatalogFresh(KEY, hit.ageMs), false, '25h 已超出 24h 新鲜窗口，需后台刷新');

now += 8 * DAY;
// 2026-10-04：品牌目录的保留期按用户口径放宽到**一年**，`HARD_MAX_MS` 同步从 7 天抬到 400 天
// （否则 7 天这条兜底会先把一年窗口截断）。所以「9 天前 = 必须丢弃」这条断言已经不成立。
assert.ok(cc.readCatalog(KEY) != null, '9 天仍在品牌目录的陈旧窗口内（保留期一年，先出旧数据再后台刷新）');
now += 366 * DAY;
assert.equal(cc.readCatalog(KEY), null, '超过一年（陈旧窗口）应丢弃，不能拿去年的目录糊弄用户');

// ---------- 3. 作用域隔离：换账号读不到上一个账号的快照 ----------
now += DAY;
cc.writeCatalog(KEY, JSON.stringify({ data: [{ id: 'b2' }] }));
assert.ok(cc.readCatalog(KEY) != null);
token = 'token-b';
assert.equal(cc.readCatalog(KEY), null, '换账号后不得复用上一个会话的目录快照');
token = 'token-a';
assert.equal(cc.readCatalog(KEY), null, '被判定为外部作用域的条目应已被清除，不能换回来又冒出来');

// ---------- 4. 失效与清理 ----------
cc.writeCatalog('/api/v1/brands', JSON.stringify({ data: [] }));
cc.writeCatalog('/api/v1/brands/brd_x', JSON.stringify({ data: {} }));
cc.writeCatalog('/api/v1/calendar?month=2026-09', JSON.stringify({ data: [] }));
cc.invalidateCatalog('/api/v1/brands');
assert.equal(cc.readCatalog('/api/v1/brands'), null, 'invalidateCatalog 应作废品牌前缀下的快照');
assert.ok(cc.readCatalog('/api/v1/calendar?month=2026-09') != null, '不该误伤其它目录');

assert.ok(cc.catalogCacheBytes() > 0, '清理缓存的口径要求能算出占用字节');
cc.clearCatalogCache();
assert.equal(cc.catalogCacheBytes(), 0);
assert.equal(cc.readCatalog('/api/v1/calendar?month=2026-09'), null, 'clearCatalogCache 必须连进程内副本一起清掉');

console.log('PASS: catalog cache — 策略表(个人数据/可变数据不落盘)、fresh/stale 窗口、会话作用域隔离、失效与清理');
