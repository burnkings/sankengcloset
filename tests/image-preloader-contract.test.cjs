/**
 * image-preloader-contract — 护栏：图片预取「不会拖慢、不会卡死、不会白下」
 *
 * 背景（2026-10-09）：用户要求「避免打开一个页面时图片才开始加载」。
 * 方案：1px 隐藏 `<image>` 预取（见 `components/base/ImagePreloader.uvue` 顶部注释）。
 *
 * 这个护栏拦的是**四类会让预取从「优化」变成「事故」的写法**：
 *   1. **槽位不释放** ⇒ 并发退化，4 张之后永久卡死（必须 @load 与 @error 都挂）
 *   2. **地址口径分叉** ⇒ 预取了 A 档、列表用 B 档，白下载一遍反而更慢
 *   3. **无上限预取** ⇒ 一次把整列拉下来，抢首屏带宽
 *   4. **用 getImageInfo 批量预热** ⇒ 小程序里它内部是 xhr，**阻塞主线程**
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PRELOADER = path.join(ROOT, 'components', 'base', 'ImagePreloader.uvue');
const PRELOADER_UTIL = path.join(ROOT, 'utils', 'image-preloader.uts');
const HOME = path.join(ROOT, 'pages', 'home', 'index.uvue');

function read(p) {
  return fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8');
}
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ── 1. 关键：槽位必须能被释放（否则并发卡死） ──────────────────────────────

test('每个预取槽位必须同时挂 @load 与 @error（只挂一个 ⇒ 异常的图会永久占住槽位）', () => {
  const src = stripComments(read(PRELOADER));

  // 统计 <image ...> 上的 @load / @error 出现次数
  const loadCount = (src.match(/@load="done[A-D]"/g) || []).length;
  const errorCount = (src.match(/@error="done[A-D]"/g) || []).length;

  assert.ok(loadCount >= 4, `应有 4 个槽位各挂 @load（当前 ${loadCount}）`);
  assert.equal(
    loadCount, errorCount,
    `@load 与 @error 数量必须相等（load=${loadCount} error=${errorCount}）—— ` +
    '只挂 @load 的话，加载失败的图会把槽位永久占住，并发退化成「4 张之后永久卡死」'
  );

  // done 函数必须真的把槽位清空并补位
  for (const fn of ['doneA', 'doneB', 'doneC', 'doneD']) {
    assert.ok(
      new RegExp(`function\\s+${fn}\\s*\\(`).test(src),
      `缺少槽位释放函数 ${fn}()`
    );
  }
  assert.ok(
    /function\s+pump\s*\(/.test(src),
    '必须有 pump() 在槽位空出后补位'
  );
});

test('事件绑定不得写成 @load="fn(x)"（uvue 会当成立即调用，不是事件绑定）', () => {
  const src = stripComments(read(PRELOADER));
  assert.ok(
    !/@(load|error)="\w+\([^)]*\)"/.test(src),
    '模板里出现 @load="fn(args)" 形式 —— uvue 会把带参数的调用当成**立即执行**，' +
    '必须用无参函数名（@load="doneA"）'
  );
});

// ── 2. 槽位数与常量必须一致 ────────────────────────────────────────────────

test('PRELOAD_MAX_CONCURRENT 必须与组件实际槽位数一致', () => {
  const util = stripComments(read(PRELOADER_UTIL));
  const comp = stripComments(read(PRELOADER));

  const m = util.match(/PRELOAD_MAX_CONCURRENT\s*=\s*(\d+)/);
  assert.ok(m != null, 'utils/image-preloader.uts 必须导出 PRELOAD_MAX_CONCURRENT');

  const declared = parseInt(m[1], 10);
  // 组件里的槽位：v-if="slotA !== '' || ..." 最多 4 个 slot 变量
  const slots = new Set((comp.match(/slot[A-Z]/g) || []));
  const actualSlots = ['slotA', 'slotB', 'slotC', 'slotD'].filter((s) => slots.has(s)).length;

  assert.equal(
    actualSlots, declared,
    `常量 PRELOAD_MAX_CONCURRENT=${declared}，但组件实际有 ${actualSlots} 个槽位 —— 必须一致`
  );
});

// ── 3. 必须有并发/批量上限（不抢首屏带宽） ─────────────────────────────────

test('必须有预取上限（防一次拉整列）', () => {
  const util = stripComments(read(PRELOADER_UTIL));
  const comp = stripComments(read(PRELOADER));

  assert.ok(
    /PRELOAD_MAX_PER_BATCH\s*=\s*(\d+)/.test(util),
    '必须定义 PRELOAD_MAX_PER_BATCH（单批上限）'
  );
  assert.ok(
    /added\s*>=\s*PRELOAD_MAX_PER_BATCH/.test(comp),
    '入队循环必须真的用 PRELOAD_MAX_PER_BATCH 截断（定义了不用等于没有）'
  );
});

// ── 4. 必须走隐藏 image，不得用 getImageInfo 批量预热 ──────────────────────

test('预取必须用隐藏 <image>，不得用 uni.getImageInfo 做批量预热', () => {
  const comp = stripComments(read(PRELOADER));

  assert.ok(
    /<image/.test(comp),
    '预取必须靠 <image> 驱动（渲染层加载，不阻塞主线程）'
  );
  assert.ok(
    !/getImageInfo/.test(comp),
    '不得用 uni.getImageInfo 做批量预热 —— 小程序里它内部是 xhr，**阻塞主线程**'
  );
  // 不能用 display:none（部分端不触发加载）
  assert.ok(
    !/display:\s*['"]none['"]/.test(comp),
    '不能用 display:none —— 部分端在 display:none 下**不触发图片加载**，' +
    '必须 1px + absolute + opacity:0'
  );
});

// ── 5. 首页必须真的接上（否则模块写了没人用） ──────────────────────────────

test('首页必须挂载 ImagePreloader 并在数据变化后触发', () => {
  const src = stripComments(read(HOME));

  assert.ok(
    /import\s+ImagePreloader\s+from\s+'@\/components\/base\/ImagePreloader\.uvue'/.test(src),
    '首页必须导入 ImagePreloader'
  );
  assert.ok(
    /<ImagePreloader/.test(src),
    '首页模板必须真的渲染 ImagePreloader'
  );
  // 必须在 nextTick 里触发（首帧提交后，不与首屏渲染抢主线程）
  assert.ok(
    /nextTick\(\s*\(\)\s*=>\s*\{\s*runImagePreload\(\)/.test(src),
    '预取必须在 nextTick 里跑 —— 同步跑会和首屏渲染抢主线程，反而更慢'
  );
  // 必须监听列表长度变化
  assert.ok(
    /watch\(\s*\(\)\s*=>\s*store\.displayItems\.length/.test(src),
    '必须监听 displayItems.length（首屏 / 切频道 / 加载更多都要重新预热）'
  );
});

test('首页预取的档位必须与列表 :list-width 一致（500 卡 / 800 大图）', () => {
  const src = stripComments(read(HOME));

  assert.ok(
    /LIST_WIDTH_CARD/.test(src) && /LIST_WIDTH_FULL/.test(src),
    '首页必须用 LIST_WIDTH_CARD / LIST_WIDTH_FULL 常量（不要写字面量 500/800，避免与组件漂移）'
  );
  // 两个预取实例都要有
  const inst = (src.match(/<ImagePreloader[^>]*\/>/g) || []);
  assert.ok(inst.length >= 2, '应有 2 个 ImagePreloader 实例（500 档 + 800 档）');
  assert.ok(
    inst.some((s) => /LIST_WIDTH_CARD/.test(s)),
    '必须有一个实例用 LIST_WIDTH_CARD'
  );
  assert.ok(
    inst.some((s) => /LIST_WIDTH_FULL/.test(s)),
    '必须有一个实例用 LIST_WIDTH_FULL'
  );
  assert.ok(
    !/list-width="(500|800|400)"/.test(src),
    '首页不得硬编码 list-width 数值（用常量，便于与组件同步）'
  );
});
