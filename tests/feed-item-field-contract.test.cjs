/**
 * feed-item-field-contract — 护栏：**不许读 FeedItem 上不存在的字段**
 *
 * 为什么需要（2026-10-08 真实事故）：
 *   商品详情页要显示「商品级发货说明」时，字段其实加在模型层 `ProductDetailModel.shippingNote` 上，
 *   而页面写成了 `item.value!.shippingNote.trim()` —— `item.value` 是 **FeedItem**，没有这个字段。
 *   uvue/UTS **编译期不报错**（产物照常生成、上传成功），运行时取到 undefined 再 `.trim()`
 *   直接抛错 ⇒ **商品详情整页卡在「加载中」**。
 *   同类前科：2026-10-05 的 `FeedItem.favoriteCount`（同样是读不存在的字段）。
 *
 * 判据（保守，宁漏报不误报）：
 *   只检查**显式声明了 `Ref<FeedItem` 的文件**，把其中 `item.value!.x` / `item!.x` / `item.value.x`
 *   的属性名与 `domain/content/feed-item.uts` 里 `class FeedItem` 实际声明的字段对照。
 *   不显式声明该类型的文件一律跳过（项目里 `item` 这个名字被 purchase / reminder / wardrobe
 *   等多个模型复用，全项目扫描必然误报）。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FEED_ITEM = path.join(ROOT, 'domain', 'content', 'feed-item.uts');

/**
 * `releases` 是**故意**不在 FeedItem 上声明的：它在映射边界
 * （`product-service.uts` 的 `mapRemoteProduct`）以 `item.releases = batches` 动态挂上去，
 * 类型来自 `ProductReleaseBatch`，domain 层不 import services 层（避免反向依赖成环）。
 * 这是已知的历史遗留，**不属于本护栏要拦的错**，显式放行。
 */
const ALLOWED_DYNAMIC = new Set(['releases']);

function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** 从 feed-item.uts 抽出 FeedItem 实际声明的字段名 */
function feedItemFields() {
  const body = stripComments(fs.readFileSync(FEED_ITEM, 'utf8'));
  const start = body.indexOf('export class FeedItem');
  assert.ok(start >= 0, 'feed-item.uts 里找不到 export class FeedItem');
  const end = body.indexOf('\n}', start);
  assert.ok(end > start, 'FeedItem 类体没找到结束大括号');
  const classBody = body.slice(start, end);

  const names = [];
  const re = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  let m;
  while ((m = re.exec(classBody)) !== null) names.push(m[1]);
  assert.ok(names.length > 10, `FeedItem 字段解析异常，只拿到 ${names.length} 个`);
  return new Set(names);
}

/** 递归收集页面/组件里的 .uvue */
function collectUvue(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectUvue(full));
    else if (entry.name.endsWith('.uvue')) out.push(full);
  }
  return out;
}

/** 文件里对 FeedItem 实例的属性访问 */
function feedItemAccesses(src) {
  const body = stripComments(src);
  const found = [];
  const patterns = [
    /item\.value!\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/g,
    /item\.value\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/g,
    /item!\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(body)) !== null) found.push(m[1]);
  }
  return found;
}

test('页面不许读 FeedItem 上不存在的字段（uvue 编译期不报错，真机整页崩）', () => {
  const declaredFields = feedItemFields();
  const files = [
    ...collectUvue(path.join(ROOT, 'pages')),
    ...collectUvue(path.join(ROOT, 'components')),
  ];

  const violations = [];
  let checkedFiles = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // 只检查显式把 ref 声明成 FeedItem 的文件 —— 否则 `item` 可能是别的模型
    if (!/Ref<\s*FeedItem/.test(src)) continue;
    checkedFiles++;

    for (const field of feedItemAccesses(src)) {
      if (declaredFields.has(field) || ALLOWED_DYNAMIC.has(field)) continue;
      violations.push(`${path.relative(ROOT, file)} → item.${field}`);
    }
  }

  assert.ok(checkedFiles > 0, '没有扫到任何 Ref<FeedItem> 文件，护栏失效（检查判据）');
  assert.deepStrictEqual(
    violations,
    [],
    `以下访问读取了 FeedItem 上不存在的字段（真机会抛错让整页卡在加载中）：\n  ${violations.join('\n  ')}`,
  );
});
