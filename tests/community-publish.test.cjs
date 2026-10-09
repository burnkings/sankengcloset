/**
 * community-publish.test.cjs — 「发布动态」成功路径的回归护栏
 *
 * 为什么单独钉这一条
 * ------------------
 * 2026-10-02 线上（体验版）实际发生：发动态时报 `reload is not defined`，但帖子其实**已经发出去了**，
 * 只是发布后的列表刷新整段没执行 —— 用户看到的是「报错 + 图片不显示 + 头像不同步」。
 * 根因是 `stores/community-store.uts` 的 `publishOutfitRemote()` 里调了 `reload()`，
 * 而 `reload()` 定义在 `stores/content-library-store.uts`（那是反向依赖本模块的门面），
 * 本模块里根本没有这个标识符。
 *
 * 这类 bug 的共性是：**只在一个从没被单测跑过的代码路径上才会炸**，
 * 静态门禁（检查 import / 样式声明）和类型检查都看不见它。所以这里把发布成功路径真跑一遍：
 * 用桩替掉网络与存储，断言 `publishOutfitRemote` 不抛错、且发布后确实去拉了两个列表。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

/** 剥掉 import/export 后丢进 vm —— 与 catalog-cache.test.cjs 同一手法 */
function loadStore(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/^import .*$/mg, '')
    .replace(/export /g, '');
  return stripTypeScriptTypes(source, { mode: 'transform' });
}

test('publishOutfitRemote 成功路径不引用未定义标识符，且发布后会刷新两个列表', async () => {
  const calls = { upload: 0, create: 0, listMine: 0, listPublic: 0 };
  const ctx = vm.createContext({
    console,
    // reactive(): 原样返回即可，断言只看调用次数
    reactive: (value) => value,
    JSON,
    Math,
    Date,
    // 本模块依赖的其余模块，全部打桩
    getCachedAccessToken: () => 'token',
    getCurrentSyncUserId: () => 'usr_test',
    enqueueLocalOperation: () => {},
    showFeedback: () => {},
    readString: () => '',
    readList: () => [],
    writeList: () => {},
    // 以下四个是 user-data-service 的导出，在源码里被 import 剥掉后成了裸标识符
    uploadOutfitImageRemote: async () => { calls.upload++; return 'med_x' },
    createCommunityPostRemote: async () => { calls.create++; return {} },
    deleteCommunityPostRemote: async () => {},
    setCommunityPostLikeRemote: async () => {},
    listCommunityPostsRemote: async (cursor, category, topic, mine) => {
      if (mine) { calls.listMine++ } else { calls.listPublic++ }
      return []
    },
    listCommunityPostPageRemote: async (cursor, category, topic, mine) => {
      if (mine) { calls.listMine++ } else { calls.listPublic++ }
      return { items: [], nextCursor: '', hasMore: false }
    },
    // useSessionStore 也要有：远程帖映射时会读昵称/头像
    useSessionStore: () => ({ profile: { nickname: '三坑女孩', avatarUrl: '', avatarText: '三' }, isLoggedIn: true }),
    uni: { getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {} },
  });

  const source = loadStore('stores/community-store.uts');
  vm.runInContext(source + `
globalThis.__publish = publishOutfitRemote;
globalThis.__refreshMyPosts = refreshMyPosts;
`, ctx);

  // 发布：私密帖只刷「我的动态」，公开帖两个都刷
  await ctx.__publish(['/tmp/a.jpg'], '今天也认真搭配了', '混搭', '今日穿搭', [], '', 'private');
  assert.equal(calls.upload, 1, '应上传 1 张图');
  assert.equal(calls.create, 1, '应调用一次建帖接口');
  assert.equal(calls.listMine, 1, '发布后必须刷新「我的动态」');
  assert.equal(calls.listPublic, 0, '私密帖不进公开广场，不该去拉公开列表');

  await ctx.__publish(['/tmp/b.jpg'], '公开一条', 'JK', '好价情报', [], '', 'public');
  assert.equal(calls.listMine, 2, '公开帖同样要刷新「我的动态」');
  assert.equal(calls.listPublic, 1, '公开帖必须刷新公开广场，否则新帖的图和头像不会出现');
});

test('publishOutfitRemote 的失败前置条件仍然明确报错', async () => {
  let token = '';
  const ctx = vm.createContext({
    console, reactive: (v) => v, JSON, Math, Date,
    getCachedAccessToken: () => token,
    getCurrentSyncUserId: () => '',
    enqueueLocalOperation: () => {}, showFeedback: () => {},
    readString: () => '', readList: () => [], writeList: () => {},
    uploadOutfitImageRemote: async () => 'med_x',
    createCommunityPostRemote: async () => ({}),
    deleteCommunityPostRemote: async () => {}, setCommunityPostLikeRemote: async () => {},
    listCommunityPostsRemote: async () => [],
    listCommunityPostPageRemote: async () => ({ items: [], nextCursor: '', hasMore: false }),
    useSessionStore: () => ({ profile: { nickname: 'x', avatarUrl: '', avatarText: 'x' }, isLoggedIn: false }),
    uni: { getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {} },
  });
  vm.runInContext(loadStore('stores/community-store.uts') + 'globalThis.__publish = publishOutfitRemote;', ctx);

  // 注意：vm 里抛出的 Error 与外层不是同一个 realm，assert.rejects 的 `instanceof Error`
  // 校验会失败，所以这里只比对消息文本
  const messageOf = async (fn) => {
    try { await fn(); return '<未抛错>' } catch (e) { return String(e && e.message ? e.message : e) }
  };
  assert.match(await messageOf(() => ctx.__publish(['/tmp/a.jpg'], 'x', 'JK', 't')), /请先登录/,
    '游客不能发布（本机假发布会让「我的动态」与服务端长期不一致）');
  token = 'token';
  assert.match(await messageOf(() => ctx.__publish([], 'x', 'JK', 't')), /请先选择图片/);
});
