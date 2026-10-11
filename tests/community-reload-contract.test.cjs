const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * reloadCommunity 契约：**不得把「我的发布」整条覆盖成本机帖**
 *
 * 背景（2026-10-11 用户反馈「发完动态后，我的动态没有自动更新」）：
 *   reloadCommunity() 原先是 `communityState.outfitPosts = readMockPosts()` —— 整条覆盖。
 *   而 library.reload() 会被首页 / 发现 / 收藏 / 登录 / 提醒编辑这些**并不紧接着
 *   refreshMyPosts()** 的页面调用 ⇒ 每次切到它们，远程帖（含用户刚发布的那条）被清成
 *   「只有本机帖」；对纯远程用户等于空列表，现象就是「我的动态不更新」。
 *
 *   这条护栏钉住两件事：
 *     ① reloadCommunity 必须**保留 isRemote 的帖**（合并，而不是覆盖）；
 *     ② 合并顺序与 refreshMyPosts 一致：远程在前、本机在后。
 *
 * 注入验证：把源码改回 `communityState.outfitPosts = readMockPosts()` → 本用例 FAIL。
 */

const STORE = path.join(__dirname, '..', 'stores', 'community-store.uts');

/** 取 reloadCommunity 的**代码行**（剥掉注释）——注释里会引用旧写法，不能当成代码来判 */
function reloadCommunityCode() {
  const src = fs.readFileSync(STORE, 'utf8');
  const start = src.indexOf('export function reloadCommunity()');
  assert.notEqual(start, -1, 'stores/community-store.uts 里找不到 reloadCommunity');
  const end = src.indexOf('\n}', start);
  assert.notEqual(end, -1, 'reloadCommunity 函数体没有闭合大括号');
  return src
    .slice(start, end)
    .split('\n')
    .map((line) => {
      const cut = line.indexOf('//');
      return cut >= 0 ? line.slice(0, cut) : line;
    })
    .join('\n');
}

test('reloadCommunity 保留远程帖（不能整条覆盖成本机帖）', () => {
  const body = reloadCommunityCode();
  assert.match(
    body,
    /\.isRemote/,
    'reloadCommunity 必须按 isRemote 保留远程帖；整条覆盖成 readMockPosts() 会让「我的动态」凭空变空/不更新',
  );
  // 反向：不允许出现「直接把 readMockPosts() 的结果赋给 outfitPosts」这种覆盖写法
  assert.doesNotMatch(
    body,
    /outfitPosts\s*=\s*readMockPosts\(\)/,
    'outfitPosts 不得被直接赋成 readMockPosts()（会丢掉远程帖）',
  );
});

test('reloadCommunity 的合并顺序与 refreshMyPosts 一致（远程在前、本机在后）', () => {
  const body = reloadCommunityCode();
  const spread = body.match(/outfitPosts\s*=\s*\[([^\]]*)\]/);
  assert.notEqual(spread, null, 'reloadCommunity 应该用 `[...远程, ...本机]` 的形式合并');
  const parts = spread[1].split(',').map((s) => s.trim());
  assert.equal(parts.length, 2, `合并数组应恰好两段，实际：${spread[1]}`);
  assert.match(parts[0], /remote/i, '第一段必须是远程帖（与 refreshMyPosts 的 [...saved, ...mock] 一致）');
  assert.match(parts[1], /local|mock/i, '第二段必须是本机帖');
});
