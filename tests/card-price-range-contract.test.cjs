const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * 商品卡片的价格区间契约（2026-10-12）
 *
 * 背景：用户提「详情页实现了价格区间，卡片列表也实现吧」。
 * 查下来**卡片侧其实早就接好了**（`FeedColumn` / 收藏 / 搜索 / 品牌 / 合辑 五处都调
 * `formatPriceCard(priceType, price, maxPriceCents, …)`），真正缺的是**数据**：
 * `products.max_price_cents` 自 0112 新增起从未回填 ⇒ `formatPriceRange(price, 0)` 退成单值。
 * 已在后端补上推导（migrations/0113 + 运营后台写入时自动重算）。
 *
 * 这条护栏钉两件容易在重构里丢掉的事：
 *   ① `formatPriceCard` 必须**先算区间**再退 price_type 摘要（顺序反了卡片就永远只显示单值）；
 *   ② 所有卡片调用点必须把 `item.maxPriceCents` 传进去（漏了这个参数等于没有区间）。
 */

const PRESENTER = path.join(__dirname, '..', 'presentation', 'content', 'feed-presenter.uts');
const CARD_CALLERS = [
  path.join('components', 'v3', 'FeedColumn.uvue'),
  path.join('pages', 'favorites', 'index.uvue'),
  path.join('pages', 'search', 'index.uvue'),
  path.join('pages', 'brand', 'detail.uvue'),
  path.join('pages', 'editorial', 'detail.uvue'),
];

test('formatPriceCard 先算区间、再退 price_type 摘要', () => {
  const src = fs.readFileSync(PRESENTER, 'utf8');
  const start = src.indexOf('export function formatPriceCard(');
  assert.notEqual(start, -1, 'feed-presenter.uts 里找不到 formatPriceCard');
  const end = src.indexOf('\n}', start);
  // 剥块注释再判：注释里会引用写法，直接匹配会误报
  const body = src.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const rangeIdx = body.indexOf('formatPriceRange(');
  assert.notEqual(rangeIdx, -1, 'formatPriceCard 必须先尝试 formatPriceRange');
  const summaryIdx = body.indexOf('formatPriceSummaryByType(');
  if (summaryIdx !== -1) {
    assert.ok(rangeIdx < summaryIdx, '区间的判断必须排在 price_type 摘要之前（顺序反了卡片只会显示单值）');
  }
});

test('所有卡片调用点都把 maxPriceCents 传给了 formatPriceCard', () => {
  for (const rel of CARD_CALLERS) {
    const file = path.join(__dirname, '..', rel);
    const src = fs.readFileSync(file, 'utf8');
    const hits = src.match(/formatPriceCard\([^)]*\)/g) ?? [];
    assert.ok(hits.length > 0, `${rel} 里没有找到 formatPriceCard 调用`);
    for (const hit of hits) {
      assert.match(
        hit,
        /maxPriceCents/,
        `${rel} 的调用漏了 maxPriceCents：${hit.trim()} —— 漏了它卡片就永远没有区间`,
      );
    }
  }
});
