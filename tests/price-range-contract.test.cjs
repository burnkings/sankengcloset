const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * 详情页价格「三级回落」的**顺序**契约（2026-10-11）
 *
 * 起因是一个上线一年多的死代码 bug：原实现先取商品级区间、**非空就 return**，
 * 然后才轮到「款式参考价现算」。而 `formatPriceRange(23300, 0)` 在最高价缺失时
 * 返回的是**单值 `¥233.00`（非空）**，于是那个 return 永远先命中 ⇒
 * 款式价那一段**一行都跑不到**，3095 个商品全显示商品级单值。
 * 用户问「把款式的最低价和最高价结合起来不难吧」时才发现。
 *
 * 教训：**回落链的每一级都要有明确的进入条件，不能靠「上一级返回空串」兜底。**
 * 这条护栏钉住的就是这个顺序，防止有人再把它「简化」回去。
 */

const PRESENTER = path.join(__dirname, '..', 'presentation', 'content', 'feed-presenter.uts');
const DETAIL = path.join(__dirname, '..', 'pages', 'product', 'detail.uvue');

function resolverBody() {
  const src = fs.readFileSync(PRESENTER, 'utf8');
  const start = src.indexOf('export function resolveProductPriceRange(');
  assert.notEqual(start, -1, 'feed-presenter.uts 里找不到 resolveProductPriceRange');
  const end = src.indexOf('\n}', start);
  assert.notEqual(end, -1, 'resolveProductPriceRange 函数体没有闭合大括号');
  // ⚠️ 必须剥掉注释再判：函数里的**块注释**引用了那个 bug 的原形（`if (range !== '') return range`），
  //    不剥的话「禁止出现旧写法」这条断言会自己误报（同类坑在话题契约护栏里也踩过一次）。
  //    注意要**先剥 /* */ 再剥 //** —— 只处理行注释会漏掉块注释里的引用。
  return src
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const cut = line.indexOf('//');
      return cut >= 0 ? line.slice(0, cut) : line;
    })
    .join('\n');
}

test('三级回落的顺序：商品级「有真区间」→ 款式价现算 → 单值兜底', () => {
  const body = resolverBody();
  const guard = body.indexOf('maxPriceCents > priceCents');
  const variantLoop = body.indexOf('variantPrices.length');
  assert.notEqual(guard, -1, '必须先判断 maxPriceCents > priceCents（把「缺失」和「单值」区分开）');
  assert.notEqual(variantLoop, -1, '必须有款式参考价现算那一段');
  // 最后那个 return（单值兜底）必须排在款式价之后
  const lastReturn = body.lastIndexOf('return formatPriceRange(');
  assert.ok(guard < variantLoop, '商品级区间的判断必须排在款式价之前');
  assert.ok(variantLoop < lastReturn, '款式价现算必须排在最后的单值兜底之前');
});

test('商品级区间必须先判「有没有真区间」再取，不能无条件优先', () => {
  // 这一条才是那个 bug 的**真正反面**：原文不是 `if (range !== '') return range` 本身有问题
  // （它写在守卫里完全正确），问题是**当时根本没有守卫** —— 无条件先取商品级区间，
  // 而单值时它返回的是非空单值 ⇒ 款式价那段永远跑不到。
  const body = resolverBody();
  const guard = body.indexOf('maxPriceCents > priceCents');
  assert.notEqual(guard, -1, '必须先判断 maxPriceCents > priceCents（把「缺失」和「单值」区分开）');
  const firstFormat = body.indexOf('formatPriceRange(');
  assert.notEqual(firstFormat, -1, '函数体里应该有 formatPriceRange 调用');
  assert.ok(
    guard < firstFormat,
    '守卫必须排在第一次 formatPriceRange 调用之前 —— 无条件先取区间就是原 bug',
  );
});

test('守卫必须紧跟函数体开头（不能把守卫藏到后面）', () => {
  const body = resolverBody();
  const guardLine = body.split('\n').findIndex((line) => line.includes('maxPriceCents > priceCents'));
  assert.ok(
    guardLine >= 0 && guardLine <= 3,
    `守卫应在函数体前 3 行内（实际第 ${guardLine} 行）—— 藏太深就等于没有守卫`,
  );
});

test('详情页顶部价格走 resolveProductPriceRange，不再自己拼回落链', () => {
  const detail = fs.readFileSync(DETAIL, 'utf8');
  assert.match(detail, /resolveProductPriceRange\(/, 'detail.uvue 必须调用 resolveProductPriceRange');
  assert.doesNotMatch(
    detail,
    /if \(range !== ''\) return range/,
    'detail.uvue 不得再自己写「非空就 return」的回落链',
  );
});

test('详情页规格价格走统一格式化，不许手拼 ¥low–high', () => {
  const detail = fs.readFileSync(DETAIL, 'utf8');
  assert.doesNotMatch(
    detail,
    /return '¥' \+ low \+/,
    "规格价格必须走 formatPriceRange，手拼会导致万级缩写/小数位/en-dash 与商品卡分叉",
  );
});
