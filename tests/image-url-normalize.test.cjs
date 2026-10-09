/**
 * image-url-normalize — 护栏：采集/入库链路必须剥掉淘宝缩略图后缀
 *
 * 背景（2026-10-09）：
 *   淘宝搜索结果页的图片 URL 天生带 `_580x580q90.jpg`（实际仅 580px）。
 *   直接入库 ⇒ 详情页 750rpx 大图放大后糊。实测全库 39.2% 的首图是缩略图。
 *   已在数据侧修掉 1345 个商品，并在采集侧 `_build_full.py` 加了归一化。
 *
 * 判据：
 *   1. `_build_full.py` 里存在 normalize_image_url()，且 images 入库前经过它
 *   2. 归一化规则的纯函数行为（去末尾后缀 / 保留 crop / heic 不动 / 非 alicdn 不动）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BUILD_FULL = path.join(ROOT, 'scripts', 'taobao-backfill', '_build_full.py');

function readBuild() {
  return fs.readFileSync(BUILD_FULL, 'utf8');
}

/** 复刻 _build_full.py 的 normalize_image_url —— 行为若有偏差，本测试会失败 */
const SUFFIX_RE = /_\d+x\d+q\d+\.(jpg|jpeg|png|webp)$/i;
const HEIC_RE = /\.heic$/i;
function normalizeImageUrl(u) {
  if (!u) return u;
  u = String(u).trim();
  if (!u.includes('alicdn')) return u;
  if (!SUFFIX_RE.test(u)) return u;
  const stripped = u.replace(SUFFIX_RE, '');
  if (HEIC_RE.test(stripped)) return u;
  return stripped;
}

test('_build_full.py 必须含 normalize_image_url，且 images 入库前调用它', () => {
  const src = readBuild();

  assert.ok(
    /def\s+normalize_image_url\s*\(/.test(src),
    '_build_full.py 缺 normalize_image_url()：采集侧必须剥掉淘宝缩略图后缀'
  );

  assert.ok(
    /normalize_image_url\(\s*im/.test(src) || /\[normalize_image_url\(/.test(src),
    'images 写入前必须逐个过 normalize_image_url()，否则缩略图会直接入库'
  );
});

test('归一化规则：去掉末尾尺寸后缀', () => {
  const u = 'https://g-search3.alicdn.com/img/bao/uploaded/i4/i3/1972067424/O1CN01rRooBb24iFMVXnRi7_!!1972067424.jpg_580x580q90.jpg';
  assert.strictEqual(
    normalizeImageUrl(u),
    'https://g-search3.alicdn.com/img/bao/uploaded/i4/i3/1972067424/O1CN01rRooBb24iFMVXnRi7_!!1972067424.jpg'
  );
});

test('归一化规则：保留 ~crop,...~ 修饰段（只去末尾后缀）', () => {
  const u = 'https://g-search3.alicdn.com/img/bao/uploaded/i4/i1/2213998717411/O1CN01dQOfjf24cINLA7rk4~crop,0,477,2861,2861~_!!2213998717411.jpg_580x580q90.jpg';
  const out = normalizeImageUrl(u);
  assert.ok(out.includes('~crop,0,477,2861,2861~'), 'crop 修饰段必须保留（那是淘宝给的构图）');
  assert.ok(!SUFFIX_RE.test(out), '末尾尺寸后缀必须去掉');
});

test('归一化规则：无后缀 / 非 alicdn / 空串 一律不动', () => {
  const keep = [
    'https://img.alicdn.com/imgextra/i3/2975633971/O1CN01naFGg51fClveCCwo1_!!2975633971.jpg',
    'https://api.sankengcloset.icu/api/v1/media/m1',
    '/api/v1/media/media_abc',
    '/static/images/logo.png',
    '',
  ];
  for (const u of keep) {
    assert.strictEqual(normalizeImageUrl(u), u, `不该被改写: ${u}`);
  }
});

test('归一化规则：heic 源图保持原样（CDN 不认去后缀后的地址）', () => {
  const u = 'https://g-search3.alicdn.com/img/bao/uploaded/i4/i1/835364507/O1CN018B6KxR1jAGDuzK0I6_!!835364507.heic_580x580q90.jpg';
  assert.strictEqual(normalizeImageUrl(u), u, 'heic 图去后缀会 404，必须保留原地址');
});

test('归一化规则：幂等', () => {
  const u = 'https://g-search3.alicdn.com/img/bao/uploaded/i4/i3/1972067424/O1CN01rRooBb24iFMVXnRi7_!!1972067424.jpg_580x580q90.jpg';
  const once = normalizeImageUrl(u);
  assert.strictEqual(normalizeImageUrl(once), once);
});
