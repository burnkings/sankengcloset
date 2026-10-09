/**
 * image-tier-contract — 护栏：**列表按显示尺寸取图，详情页保留原图**
 *
 * 背景（2026-10-09，三轮结论）：
 *   - 第一轮：给 alicdn 图追加 `_400x400q75.jpg` 做「降档」。**从未生效** ——
 *     后缀被拼到了扩展名之后（`...xxx.jpg_400x400q75.jpg` 才是对的，做成了替换扩展名）⇒ 404。
 *     当时报的「3.01MB → 0.34MB」是**测 404 的 49 字节响应体**得出的假数据。
 *   - 第二轮：用户要求「清晰度不允许被修改」⇒ 整体撤销。
 *   - 第三轮（实测）：线上封面尺寸 300×300 → 5865×7820 跨度 20 倍、单张最大 1725KB、
 *     首屏 20 张 7.5MB。微信 `image` 对超大图会保护性降采样 ⇒ **大图反而糊**。
 *     正确做法是**按列表显示尺寸取图**（`_500x500q75`，单张 47KB），
 *     这消除的是失真来源、**不是**降清晰度；
 *     细节：`AppImage.uvue` 顶部注释 + `.workbuddy/memory/MEMORY.md` 规则 51/52/53。
 *
 * 判据（双向）：
 *   1. 列表侧（ProductCard / FeedColumn / wardrobe / history / discover / PostCard / FeedBlock）
 *      **必须**传 `:list-width`，且取值落在预期档位内。
 *   2. 详情页 hero（`pages/product/detail.uvue` 的 swiper 内 AppImage）
 *      **必须不**传 `:list-width` —— 大图清晰度不允许被改动。
 *   3. `tieredSrc` 逻辑必须**追加**后缀（`${u}_${w}x${w}q75`），
 *      不得出现「替换扩展名」的写法（那会 404，是本 bug 的历史根因）。
 *   4. 全项目不得硬编码 `_400x400q75.jpg` 这类**具体文件名后缀字面量**（应走 listWidth 参数）。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APP_IMAGE = path.join(ROOT, 'components', 'base', 'AppImage.uvue');
const IMAGE_URL_UTIL = path.join(ROOT, 'utils', 'image-url.uts');
const PRELOADER = path.join(ROOT, 'components', 'base', 'ImagePreloader.uvue');
const FEED_IMAGE_POLICY = path.join(ROOT, 'utils', 'feed-image-policy.uts');

function read(rel) {
  return fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8');
}

/** 去掉注释，避免「注释里提到后缀」被误判成活代码 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // 不误伤 http://
}

// ── 1. tieredSrc 必须「追加」后缀（现在住在 utils/image-url.uts 这个唯一出口） ──

test('tieredSrc 必须「追加」尺寸后缀，不得替换扩展名', () => {
  const src = stripComments(read(IMAGE_URL_UTIL));

  assert.ok(
    /export\s+function\s+tieredSrc\s*\(/.test(src),
    'utils/image-url.uts 必须导出 tieredSrc()（图片地址的唯一出口，AppImage 与预加载共用）'
  );

  // 正确写法：模板串 `${u}_${listWidth}x${listWidth}q75`（追加）
  assert.ok(
    /`\$\{u\}_\$\{listWidth\}x\$\{listWidth\}q75`/.test(src),
    'tieredSrc 必须**在地址末尾追加** `_${w}x${w}q75`；若改成替换扩展名会 404（历史 bug 根因）'
  );

  // 反向：不得出现「先剥掉扩展名再拼」的写法
  assert.ok(
    !/replace\(\s*\/\\?\.[a-z\]+\$?\/[^)]*\)\s*\+\s*`?_\$\{/.test(src),
    'tieredSrc 里出现了「替换扩展名后再拼后缀」的写法 —— 这正是 2026-10 之前 404 的原因'
  );
});

test('AppImage 必须复用公共 tieredSrc，不得再本地实现一遍（否则与预加载口径分叉）', () => {
  const src = stripComments(read(APP_IMAGE));

  assert.ok(
    /import\s*\{[^}]*tieredSrc[^}]*\}\s*from\s*'@\/utils\/image-url'/.test(src),
    'AppImage 必须从 @/utils/image-url 导入 tieredSrc'
  );
  assert.ok(
    !/function\s+tieredSrc\s*\(/.test(src),
    'AppImage 不得再本地实现 tieredSrc —— 预加载必须预取与列表**完全相同**的地址'
  );
});

test('ImagePreloader 必须用同一个 tieredSrc 规范化（否则预取地址与列表不一致）', () => {
  const src = stripComments(read(PRELOADER));

  assert.ok(
    /import\s*\{[^}]*tieredSrc[^}]*\}\s*from\s*'@\/utils\/image-url'/.test(src),
    'ImagePreloader 必须从 @/utils/image-url 导入 tieredSrc'
  );
  // 必须真的调用它，而不是把原始 URL 直接塞进 <image>
  assert.ok(
    /tieredSrc\(/.test(src),
    'ImagePreloader 入队前必须调 tieredSrc() 把地址规范成「列表真正会请求的那个」'
  );
});

test('AppImage: listWidth 默认 0 = 原图，模板绑 :src="effectiveSrc"', () => {
  const src = read(APP_IMAGE);

  assert.ok(/:src="effectiveSrc"/.test(src), '模板 <image> 必须绑 :src="effectiveSrc"');
  assert.ok(
    /listWidth:\s*0\s*[,}]/.test(src),
    'listWidth 默认值必须是 0（= 不取图，详情页/预览大图走这条）'
  );
  assert.ok(
    /tieredSrc\(props\.src,\s*props\.listWidth\)/.test(src),
    'effectiveSrc 必须把 listWidth 传进 tieredSrc'
  );
});

test('tieredSrc: 已带后缀 / heic 源图时不得追加；~crop 图必须照常追加', () => {
  const src = stripComments(read(IMAGE_URL_UTIL));

  assert.ok(
    /export\s+function\s+shouldSkipResize\s*\(/.test(src),
    '必须保留 shouldSkipResize() 跳过判断'
  );
  assert.ok(
    /alicdn\.com/.test(src),
    '必须限定只对 alicdn 图追加后缀（本地路径/后端相对路径拼了会 404）'
  );
  // heic 源图：实测 5/5 追加后缀 → 404，必须跳过
  assert.ok(
    /heic/.test(src),
    '必须跳过 `.heic` 源图（实测追加 _500x500q75 → 404）'
  );
  // ~crop 图：实测 3024×3024 追加后 1278KB → 52KB，**必须照常追加**，不得被当成跳过条件
  assert.ok(
    !/indexOf\('~'\)/.test(src),
    '不得把「含 ~」当作跳过条件 —— ~crop 图恰恰是最需要按尺寸取图的巨图（实测 3024×3024/1278KB → 52KB）'
  );
});

// ── 2. 列表侧必须传 list-width ────────────────────────────────────────────

/** 期望的列表取图档位（文件 → 该文件应出现的 listWidth 取值集合） */
const LIST_CONSUMERS = [
  ['components/v3/ProductCard.uvue', ['500']],
  ['components/v3/FeedColumn.uvue', ['500']],
  ['components/v3/FeedBlock.uvue', ['800']],
  ['components/v3/PostCard.uvue', ['800']],
  ['pages/wardrobe/index.uvue', ['500']],
  ['pages/history/index.uvue', ['400']],
  ['pages/discover/index.uvue', ['800']],
  // ⚠️ 以下三张卡曾漏网（2026-10-09 评审 P0-2）：
  //    RankingCard 完全没传 ⇒ 默认 0 ⇒ 请求原图；
  //    Release/EditorialCard 用原生 <image> 直出 URL ⇒ 完全绕过 AppImage 的分档。
  ['components/v3/RankingCard.uvue', ['400']],
  ['components/v3/ReleaseCard.uvue', ['800']],
  ['components/v3/EditorialCard.uvue', ['800']],
];

test('列表侧 AppImage 必须传 :list-width（否则列表仍在下巨图，触发客户端降采样）', () => {
  const missing = [];
  for (const [file, expected] of LIST_CONSUMERS) {
    const src = read(file);
    const found = [...src.matchAll(/:list-width="(\d+)"/g)].map((m) => m[1]);
    if (found.length === 0) {
      missing.push(`${file}: 完全没有 :list-width`);
      continue;
    }
    for (const v of found) {
      if (!expected.includes(v)) {
        missing.push(`${file}: :list-width="${v}" 不在预期档位 ${expected.join('/')}`);
      }
    }
  }
  assert.deepStrictEqual(missing, [], `以下列表图未按显示尺寸取图：\n  ${missing.join('\n  ')}`);
});

test('列表图档位与卡片宽度匹配（500 档用于 337rpx 双列卡；800 档用于全宽卡）', () => {
  // 337rpx ≈ 168.5 逻辑px，@3x ≈ 506px ⇒ 500 档精确命中
  const productCard = read('components/v3/ProductCard.uvue');
  assert.ok(
    /:list-width="500"/.test(productCard),
    'ProductCard（337rpx 双列卡）必须用 500 档'
  );

  // FeedBlock 的 imgWrap45 = 718rpx ≈ 359 逻辑px，@3x ≈ 1077px ⇒ 800 档
  const feedBlock = read('components/v3/FeedBlock.uvue');
  assert.ok(
    /:list-width="800"/.test(feedBlock),
    'FeedBlock（718rpx 单卡大图）必须用 800 档，不能用列表卡的 500 档'
  );
});

// ── 2b. 分类必须同源（预取分类 vs 实际渲染分类） ─────────────────────────────

test('预取分类与实际渲染分类必须同源（否则预取 URL 与列表请求 URL 对不上，预取白做）', () => {
  // 2026-10-09 评审 P0-2：首页预取曾手写 `feedType === FEED_OUTFIT || feedType === 'release_event'`，
  // 而实际渲染是 FeedColumn 的 outfit→500 双列、FeedBlock 的 release_event→800 全宽 —— **结论相反**。
  // 修法：分类判断全部收敛到 utils/feed-image-policy，各调用点只 import。
  const policy = stripComments(read(FEED_IMAGE_POLICY));
  assert.ok(
    /export function isFeedCardType/.test(policy),
    'utils/feed-image-policy.uts 必须 export isFeedCardType（唯一分类出口）',
  );
  assert.ok(
    /export function isFeedFullWidthType/.test(policy),
    'utils/feed-image-policy.uts 必须 export isFeedFullWidthType',
  );

  // 首页预取必须用共享函数，不得再手写 feedType 相等比较
  const home = stripComments(read('pages/home/index.uvue'));
  assert.ok(
    /isFeedFullWidthType\(/.test(home),
    'pages/home/index.uvue 的预取分类必须调用 isFeedFullWidthType，不得手写 feedType 比较',
  );
  assert.ok(
    !/feedType\s*===\s*'release_event'/.test(home),
    "首页预取不得手写 `feedType === 'release_event'` —— 该判断曾与实际渲染相反，导致预取白做",
  );

  // store 的双列分类也必须走共享函数
  const store = stripComments(read('stores/home-feed-store.uts'));
  assert.ok(
    /isFeedCardType\(/.test(store),
    'stores/home-feed-store.uts 的 isCardEligible 必须调用 isFeedCardType',
  );
});

test('分类函数的档位常量必须与各卡片的 :list-width 取值一致', () => {
  const policy = stripComments(read(FEED_IMAGE_POLICY));
  assert.ok(/FEED_CARD_LIST_WIDTH\s*=\s*500/.test(policy), '双列卡档位常量必须是 500');
  assert.ok(/FEED_FULL_LIST_WIDTH\s*=\s*800/.test(policy), '全宽块档位常量必须是 800');
  assert.ok(/FEED_THUMB_LIST_WIDTH\s*=\s*400/.test(policy), '小缩略图档位常量必须是 400');
});

// ── 2c. 列表卡不得绕过 AppImage 直出 <image> ─────────────────────────────────

test('列表卡片不得用原生 <image> 直出封面（会绕过按尺寸取图）', () => {
  // Release/EditorialCard 曾用 <image :src="image"> 直出，完全绕过 AppImage 的 tieredSrc
  const offenders = [];
  for (const [file] of LIST_CONSUMERS) {
    const src = stripComments(read(file));
    const nativeImgs = [...src.matchAll(/<image\b[^>]*:src=/g)];
    for (const m of nativeImgs) {
      offenders.push(`${file}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `以下列表卡片仍在用原生 <image> 直出封面（应改用 AppImage 并传 :list-width）：\n  ${offenders.join('\n  ')}`,
  );
});

// ── 3. 详情页必须保留原图（不得传 list-width） ─────────────────────────────

test('详情页 hero 图不得传 :list-width（大图清晰度不允许被改动）', () => {
  const detail = read('pages/product/detail.uvue');
  // hero swiper 内的 AppImage（mode="aspectFit"）
  const heroMatch = detail.match(/<AppImage[^>]*mode="aspectFit"[^>]*\/>/);
  assert.ok(heroMatch != null, 'detail.uvue 里应能找到 hero AppImage（mode="aspectFit"）');
  assert.ok(
    !/list-width/.test(heroMatch[0]),
    'detail.uvue 的 hero 图**不得**传 :list-width —— 详情页必须用原图保证放大后清晰'
  );
});

// ── 4. 全项目不得硬编码具体后缀字面量 ──────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', 'unpackage', '_archive-2026-09-26', '_chromeprof',
  '.git', '.workbuddy', 'dist', 'build',
]);
const SRC_EXT = new Set(['.uts', '.uvue', '.ts', '.js', '.vue']);

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) { walk(full, out); continue; }
    if (SRC_EXT.has(path.extname(name))) out.push(full);
  }
  return out;
}

test('全项目源码不得硬编码具体图片后缀字面量（应走 listWidth 参数）', () => {
  const offenders = [];
  const suffixRe = /['"`]_?\d+x\d+q\d+\.(jpg|jpeg|png|webp)/i;
  for (const f of walk(ROOT, [])) {
    const rel = path.relative(ROOT, f);
    if (rel === path.join('tests', 'image-tier-contract.test.cjs')) continue;
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (suffixRe.test(stripComments(text))) offenders.push(rel);
  }
  assert.deepStrictEqual(
    offenders, [],
    `以下文件硬编码了图片尺寸/质量后缀（应改用 AppImage 的 :list-width）：\n  ${offenders.join('\n  ')}`
  );
});

// ── 5. 透传层完整性 ───────────────────────────────────────────────────────

test('透传层存在：loadedSrcs 记录用 effectiveSrc.value', () => {
  const src = read(APP_IMAGE);
  assert.ok(
    /loadedSrcs\.add\(effectiveSrc\.value\)/.test(src),
    'onLoad 必须记录 effectiveSrc.value（与实际请求 URL 一致），否则重挂载重复闪骨架'
  );
});
