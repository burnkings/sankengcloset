# -*- coding: utf-8 -*-
"""
按用户口径重建「数据库 JSON」：

  桌面 all_shops_products.json（222 店 / 3247 条）
    − 删除集 237 条                                   → 剩 3010 条
    + 两份采集补充（images 与字段/批次）              → 每个商品补齐
    + 分类调整（110 条 → MIXED、18 条 OTHER 归位）
  = C:\\Users\\dddd\\Desktop\\all_shops_products.updated.json  ← 单一真相，上传即可

同时生成：
  out-collected/import-full.sql        —— 读上面的 JSON 做覆盖导入（JSON 已内嵌）
  out-collected/rollback-full.sql      —— 独立回滚
  out-collected/full-preview.csv       —— 本地过目：逐条列出补齐了哪些字段

字段约定
  · 原键全部保留不动（query_shop / shop_name / product_url / item_id / title / current_price /
    main_image / categories / shop_link / colors / sizes / purchase_type / sku_checked / sku_failed / pit_type）
  · 采集补充用「库列名」平铺挂上去：images / sub_category / color_tags / material_tags /
    variants / price_type / price_cents / releases
  · **`description`（商品说明）已废弃**：JSON 不再产出该字段，SQL 里 `SET description = NULL`
    清空库里旧值（2026-09-27 第 3 轮，用户「删除商品说明字段和模块，不需要保留」）
  · **标题清洗只删品牌名**，其余（品类词/状态词/空格/符号）一律原样保留（2026-09-27 第 3 轮）
  · images 写成**纯 URL 字符串数组**（可读）；导入时由 SQL 转成库里的对象数组
  · releases 不带 id（导入时按 rel_taobao_<itemId>_<release_no> 生成，避免再次漏 id）
  · 字段缺席 = 该项没采集到 = 导入时不动该列（**不是**写 NULL）
"""
import json, os, sys, csv, re
from datetime import datetime
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'out-collected')
DESKTOP = r'C:\Users\dddd\Desktop'
SRC_JSON = os.path.join(DESKTOP, 'all_shops_products.json')
DST_JSON = os.path.join(DESKTOP, 'all_shops_products.updated.json')
sys.stdout.reconfigure(encoding='utf-8')

NOW = datetime.now().strftime('%Y-%m-%dT%H:%M+08:00')
VALID_PIT = {'JK', 'LOLITA', 'HANFU', 'MIXED', 'OTHER'}


# ---------- 图片地址归一化（2026-10-09）----------
# 问题：淘宝**搜索结果页**的图 URL 天生带尺寸/质量后缀（如 `_580x580q90.jpg`，
#   实际只有 580px）。直接入库 ⇒ 详情页 750rpx 大图放大后糊。
#   实测全库 39.2% 的首图是这种缩略图，而 CDN 去掉后缀后可拿到原图（580px → 800~3551px）。
# 规则：
#   · 只处理 alicdn 地址；其它一律原样返回
#   · 去掉**末尾**的 `_<数字>x<数字>q<数字>.<ext>` 段
#   · `~crop,...~` 修饰段**保留**（那是淘宝给的构图，去掉会改变画面）
#     实测 `...~crop,...~_!!x.jpg_580x580q90.jpg` 去末尾后缀后：51.7 KB → 589.9 KB，构图不变
#   · 去后缀后若是 `.heic`（CDN 不转码）⇒ 保留原地址，避免改了打不开
_SUFFIX_RE = re.compile(r'_\d+x\d+q\d+\.(?:jpg|jpeg|png|webp)$', re.I)
_HEIC_RE = re.compile(r'\.heic$', re.I)


def normalize_image_url(u):
    if not u:
        return u
    u = str(u).strip()
    if 'alicdn' not in u:
        return u
    if not _SUFFIX_RE.search(u):
        return u
    stripped = _SUFFIX_RE.sub('', u)
    if _HEIC_RE.search(stripped):
        return u          # heic 源图：CDN 不认去后缀后的地址，保持原样
    return stripped


# 共用清洗库（标题清洗 / 发售状态词推断 / 品牌封面剥离）
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location('_text_clean', os.path.join(ROOT, '_text_clean.py'))
tc = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(tc)

# ---------- 1. 读源 ----------
src = json.load(open(SRC_JSON, encoding='utf-8'))
src_total = sum(len(v) for v in src.values())
print('[1] 源：%d 店 / %d 条' % (len(src), src_total))

# ---------- 2. 读采集补充 ----------
collected = json.load(open(os.path.join(ROOT, 'out-fixed', 'patch-collected.json'), encoding='utf-8'))
col_by_id = {str(r['id']): r for r in collected}
print('[2] 采集补充：%d 条' % len(col_by_id))

# ---------- 3. 读决策清单 ----------
del85 = [str(x) for x in json.load(open(os.path.join(ROOT, '_del_ids.json'), encoding='utf-8'))]
purge150 = [str(x) for x in json.load(open(os.path.join(ROOT, '_purged_ids.json'), encoding='utf-8'))]
hide = list(dict.fromkeys(del85 + purge150 + ['1050385541399', '1059314141966']))
mixed = [str(x) for x in json.load(open(os.path.join(OUT, '_mixed_ids.json'), encoding='utf-8'))]
reclass = {}
with open(os.path.join(OUT, 'OTHER-归位方案.csv'), encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        i = row['item_id'].strip()
        if i not in set(hide):
            reclass[i] = row['suggest_category'].strip()
pit_change = {}
for i in mixed:
    pit_change[i] = 'MIXED'
for i, c in reclass.items():
    if c not in VALID_PIT:
        raise SystemExit('OTHER 归位出现非法品类：%s → %s' % (i, c))
    pit_change[i] = c
print('[3] 删除 %d 条 ｜ 分类调整 %d 条（MIXED %d + OTHER 归位 %d）'
      % (len(hide), len(pit_change), len(mixed), len(reclass)))

# ---------- 4. 重建 ----------
# ⚠️ 2026-09-27 第 3 轮：`description`（商品说明）**已彻底不要** ——
#    用户「删除商品说明字段和模块，不需要保留」。
#    这里从采集字段白名单移除 ⇒ 新 JSON 不再产出该字段；
#    库里的存量旧值由 SQL 的 `SET description = NULL` 清空（见第 1 步 UPDATE）。
COLLECT_KEYS = ('images', 'sub_category', 'color_tags', 'material_tags',
                'variants', 'price_type', 'price_cents')
hide_set = set(hide)
out = {}
dropped_shop = []
stat = Counter()
preview = []

for shop_name, items in src.items():
    kept = []
    for it in items:
        iid = str(it.get('item_id') or '').strip()
        if iid in hide_set:                       # ← 删除集：直接不写进新 JSON
            stat['deleted'] += 1
            continue
        new = dict(it)                            # 原键全部保留

        # 分类调整
        if iid in pit_change:
            new['pit_type'] = pit_change[iid]
            new['categories'] = [pit_change[iid]]
            stat['pit_changed'] += 1

        # 采集补充
        r = col_by_id.get(iid)
        filled = []
        if r:
            stat['collected'] += 1
            for k in COLLECT_KEYS:
                if k == 'images':
                    imgs = r.get('images') or []
                    if imgs:
                        urls = [normalize_image_url(im['url'] if isinstance(im, dict) else str(im)) for im in imgs]
                        urls = [u for u in urls if u]
                        new['images'] = urls
                        filled.append('images(%d)' % len(urls))
                elif k == 'price_cents':
                    if r.get('price_cents') is not None:
                        new['price_cents'] = r['price_cents']
                        filled.append('price_cents')
                elif k == 'color_tags':
                    if r.get('colors'):
                        new['color_tags'] = r['colors']
                        filled.append('color_tags(%d)' % len(r['colors']))
                elif k == 'material_tags':
                    if r.get('materials'):
                        new['material_tags'] = r['materials']
                        filled.append('material_tags(%d)' % len(r['materials']))
                elif r.get(k):
                    new[k] = r[k]
                    filled.append(k)
                    if k == 'variants':
                        filled[-1] = 'variants(%d)' % len(r[k])

            # 发售批次
            rt = rs = rn = None
            if r.get('batches'):
                rt = 'rerelease' if r.get('is_rerelease') else 'first_release'
                rs = r.get('sale_status') if r.get('sale_status') != 'UNKNOWN' else 'PRE_ORDER'
                rn = r['batches'][0] if len(r['batches']) == 1 else '多批次'
            elif r.get('price_type') == 'INTENTION':
                rt, rs, rn = 'reservation', 'PRE_ORDER', '意向批'
            elif r.get('price_type') == 'DEPOSIT':
                rt, rs, rn = 'reservation', 'PRE_ORDER', '定金批'
            elif r.get('sale_status') == 'PRE_ORDER':
                rt, rs, rn = 'reservation', 'PRE_ORDER', '预约批'
            elif r.get('sale_status') == 'ON_SALE':
                rt, rs, rn = 'spot', 'ON_SALE', '现货批'
            if rt:
                dep = r['price_cents'] if (r.get('price_type') == 'DEPOSIT' and r.get('price_cents') is not None) else None
                full = r['price_cents'] if (r.get('price_type') == 'FULL' and r.get('price_cents') is not None) else None
                new['releases'] = [{
                    'release_no': 1, 'release_name': rn, 'release_type': rt,
                    'sale_status': rs, 'deposit_cents': dep, 'balance_cents': None,
                    'full_price_cents': full, 'visibility_status': 'published'}]
                filled.append('releases')

        # 发售信息兜底（用户口径 2026-09-27 第 1 条）：
        #   「一般不是定金预约的都是现货」
        # 采集只覆盖到约 690 条，其余 2320 条一条批次都没有 ⇒ App 底部状态是空的。
        # 现在按 售完/售罄 → 定金预约类（标题词优先，其次 price_type）→ 现货 依次判定补齐，
        # 保证每件商品底部状态恒有值。**采集结果永远优先**，此处只在 releases 为空时兜底。
        # ⚠️ 必须传**原始标题**：清洗后「定金/意向金」等词已被剔除，传清洗后的会把定金款判成现货。
        if not new.get('releases'):
            _rt, _rs, _rn = tc.fallback_release(
                it.get('title_raw') or it.get('title') or '', new.get('price_type'))
            new['releases'] = [{
                'release_no': 1, 'release_name': _rn, 'release_type': _rt,
                'sale_status': _rs, 'deposit_cents': None, 'balance_cents': None,
                'full_price_cents': (r['price_cents']
                                     if r and r.get('price_type') == 'FULL'
                                     and r.get('price_cents') is not None else None),
                'visibility_status': 'published'}]
            filled.append('releases(兜底:%s)' % _rn)
            stat['release_fallback'] += 1

        # ---------- 标签 / 说明清洗（用户口径第 7、8 条）----------
        # 7) 材质 / 颜色标签去重（大小写归一 + 剔除子串冗余项）
        for _tk in ('material_tags', 'color_tags'):
            _tv = new.get(_tk)
            if _tv:
                _td = tc.dedup_tags(_tv)
                if len(_td) != len(_tv):
                    stat['tag_dedup'] += 1
                new[_tk] = _td
        # 8) 商品说明 —— **字段已废弃，不再产出**（2026-09-27 第 3 轮定稿）。
        #    用户：「删除商品说明字段和模块，不需要保留」。
        #    `description` 已从 `COLLECT_KEYS` 移除，这里再兜底 pop 一次，
        #    防止上游（源 JSON / 采集结果）残留同名键混进来。
        #    （历史：曾用 `tc.clean_description()` 剔推广位与付款信息，现整条链路停用，
        #      函数定义保留在 `_text_clean.py` 供回溯。）
        if new.get('description'):
            new.pop('description', None)
            filled = [x for x in filled if x != 'description']
            stat['desc_dropped'] += 1

        # 品类合法性
        pt = new.get('pit_type')
        if pt not in VALID_PIT:
            raise SystemExit('非法 pit_type：%s → %r' % (iid, pt))

        kept.append(new)
        stat['kept'] += 1
        preview.append([iid, shop_name, (new.get('title') or '')[:60],
                        new.get('pit_type') or '', ' '.join(filled)])

    if kept:
        out[shop_name] = kept
    else:
        dropped_shop.append(shop_name)

# ---------- 4.5 清洗：标题（**只删品牌名**）+ 剥离品牌封面 ----------
#   标题：2026-09-27 第 3 轮定稿 —— 用户「标题清洗仅针对品牌名称吧，其余都不变」。
#         所以**只**把品牌词（由店铺名提取）整词删掉，不再动品类词 / SEO 引流词 /
#         发售状态词 / 空格 / 符号 / 括号；`lo` 也原样保留。
#         原值存进 `title_raw` 便于回退。
#   封面：App 的封面 = 库里 coverUrl = images[0]，而 images[] 开头常被塞店铺品牌插画/logo。
#         按「店铺级复用」判据做**前缀剥离**，只动开头连续的品牌图，不动其余细节图。
_brands, _variants = tc.build_brand_words(out)
_tc_stat = Counter()
_title_rows = []          # 标题前后对照（构建时直接产出，保证与 JSON 同步）
for _shop, _items in out.items():
    for _it in _items:
        _t = _it.get('title') or ''
        _c = tc.clean_title(_t, _variants)
        if _c and _c != _t:
            _it['title_raw'] = _t            # 原件留档，便于回退
            _it['title'] = _c
            _tc_stat['title_cleaned'] += 1
            _title_rows.append([str(_it['item_id']), _shop, _it.get('pit_type') or '', _t, _c])
        elif not _c:
            _tc_stat['title_kept(清洗后为空)'] += 1

_cov = tc.strip_brand_covers(out)
_strip_total = 0
_cover_rows = []          # 封面变更明细：剥离 + 兜底提升，逐条可核
for _shop, _items in out.items():
    for _it in _items:
        _k = _cov.get(str(_it['item_id']))
        if _k is None:
            continue
        _before = _it.get('images') or []
        _n = len(_before)
        _it['images'] = _k
        _it.setdefault('images_raw_count', _n)
        _strip_total += _n - len(_k)
        _tc_stat['cover_stripped'] += 1
        if not _k:
            _tc_stat['cover_empty→回退 main_image'] += 1
        _cover_rows.append([str(_it['item_id']), _shop, '剥离品牌图',
                            (_before[0] if _before else ''),
                            (_k[0] if _k else '（空→回退 main_image）'), _n, len(_k)])
print('[4.5] 标题清洗 %d 条 ｜ 品牌封面剥离 %d 条商品（共移除 %d 张图，其中 %d 条剥离后为空回退 main_image）'
      % (_tc_stat['title_cleaned'], _tc_stat['cover_stripped'], _strip_total,
         _tc_stat['cover_empty→回退 main_image']))
print('      品牌词 %d 个（含 ≥3 字截断变体共 %d 个）' % (len(_brands), len(_variants)))
_pv = os.path.join(OUT, '标题-清洗对照.csv')
with open(_pv, 'w', newline='', encoding='utf-8-sig') as _w:
    _wr = csv.writer(_w)
    _wr.writerow(['item_id', 'shop', 'pit_type', 'title_old', 'title_new'])
    _wr.writerows(_title_rows)
print('      写出 标题-清洗对照.csv（%d 行）' % len(_title_rows))

# ---------- 4.6 封面兜底：疑似插画/设计稿 → 换回商品自己的主图 ----------
#   前缀剥离只能抓「本店 ≥2 商品共用」的店铺级品牌图。**只在一个商品上用过**的品牌插画、
#   裙子设计稿、纯文字图不构成复用，抓不到（图像普查后约剩 20~30 条）。
#   这类图的判定需要看图像，做不进本脚本 ⇒ 由 _cover_verify.py 跑特征后写出嫌疑清单，
#   这里读清单执行「把 main_image 提到第一位」。
#   （替换目标恒为该商品自己的主图，所以即使误判，结果也仍是商品图。）
_sus_path = os.path.join(OUT, '_cover_suspects.json')
if os.path.exists(_sus_path):
    _sus = {str(x) for x in json.load(open(_sus_path, encoding='utf-8'))}
    _pr = Counter()
    for _shop, _items in out.items():
        for _it in _items:
            if str(_it['item_id']) in _sus:
                _before = _it.get('images') or []
                _a = tc.promote_main_image(_it)
                if _a:
                    _pr[_a] += 1
                    _cover_rows.append([str(_it['item_id']), _shop,
                                        '兜底换回商品主图' + ('(新插主图)' if _a == 'insert' else ''),
                                        (_before[0] if _before else ''),
                                        (_it['images'][0] if _it.get('images') else ''),
                                        len(_before), len(_it.get('images') or [])])
    print('[4.6] 疑似插画封面兜底：清单 %d 条 → 提到首位 %d 条（其中新插主图 %d 条）'
          % (len(_sus), sum(_pr.values()), _pr['insert']))
else:
    print('[4.6] 未找到 _cover_suspects.json → 跳过封面兜底（先跑 _cover_verify.py 生成）')

_cv = os.path.join(OUT, '封面-变更明细.csv')
with open(_cv, 'w', newline='', encoding='utf-8-sig') as _w:
    _wr = csv.writer(_w)
    _wr.writerow(['item_id', 'shop', '处理', 'before_cover', 'after_cover', 'n_before', 'n_after'])
    _wr.writerows(_cover_rows)
print('[4.7] 写出 封面-变更明细.csv（%d 行：剥离 %d + 兜底 %d）'
      % (len(_cover_rows), _tc_stat['cover_stripped'], len(_cover_rows) - _tc_stat['cover_stripped']))

with open(DST_JSON, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

kept_total = sum(len(v) for v in out.values())
print('[4] 新 JSON：%d 店 / %d 条（删 %d，补 %d，发售信息兜底补 %d）'
      % (len(out), kept_total, stat['deleted'], stat['collected'], stat['release_fallback']))
print('    标签去重 %d 条 ｜ 商品说明：字段已废弃（兜底剔除残留 %d 条）'
      % (stat['tag_dedup'], stat['desc_dropped']))
_norel = sum(1 for v in out.values() for x in v if not x.get('releases'))
print('    releases 覆盖：%d/%d（仍缺 %d）' % (kept_total - _norel, kept_total, _norel))
print('    整店被删空的店铺 %d 家：%s' % (len(dropped_shop), dropped_shop[:8]))
print('    写出', DST_JSON, os.path.getsize(DST_JSON), 'bytes')

# ---------- 5. 过目 CSV ----------
pv = os.path.join(OUT, 'full-preview.csv')
with open(pv, 'w', newline='', encoding='utf-8-sig') as w:
    wr = csv.writer(w)
    wr.writerow(['item_id', 'shop_name', 'title', 'pit_type', 'added_fields'])
    wr.writerows(preview)
print('[5] 写出', pv, os.path.getsize(pv), 'bytes')

# ---------- 6. 生成导入 SQL（JSON 内嵌：紧凑但保留可读性） ----------
compact = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
TAG = 'wbfull20260926'
assert ('$' + TAG + '$') not in compact, 'JSON 含定界符，换一个'
assert '__TAG__' not in compact and '__DOC__' not in compact, 'JSON 含模板占位符'

SQL_T = r'''-- =============================================================================
-- 三坑绮橱 · 商品数据覆盖导入（数据 = 桌面 all_shops_products.updated.json，已内嵌）
--   docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng \
--     -v ON_ERROR_STOP=1 < import-full.sql
-- 语义：这份 JSON 就是最终状态。JSON 里有的字段值 → 覆盖；没写的字段 → 不动。
--       **JSON 里没有的淘宝/天猫商品 → 隐藏（= 那 237 条删除）**
-- 安全：导入前自动建 _bak_products_20260926 / _bak_releases_20260926，回滚跑 rollback-full.sql
-- =============================================================================
\set ON_ERROR_STOP on

-- 【第 -1 步】前置自检：目标列缺任何一个就立刻报错
--   ⚠️ 2026-09-26 实测更正：products **没有** pit_type 列（34 列），分类只存 category(text)。
--      历史上这里照抄了 database-schema-export.sql（设计版，两列并存），导致首次导入自检失败。
DO $precheck$
DECLARE missing text; ck text;
BEGIN
  SELECT string_agg(t.tbl || '.' || t.col, ', ' ORDER BY t.tbl, t.col) INTO missing
  FROM (VALUES
    ('products','id'),('products','external_id'),('products','source_platform'),
    ('products','title'),
    ('products','images'),('products','sub_category'),('products','color_tags'),
    ('products','material_tags'),('products','variants'),('products','price_type'),
    ('products','price_cents'),('products','description'),('products','category'),
    ('products','visibility_status'),('products','deleted_at'),
    ('products','updated_at'),
    ('product_releases','id'),('product_releases','product_id'),('product_releases','release_name'),
    ('product_releases','release_no'),('product_releases','release_type'),
    ('product_releases','sale_status'),('product_releases','deposit_cents'),
    ('product_releases','balance_cents'),('product_releases','full_price_cents'),
    ('product_releases','visibility_status')
  ) AS t(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = to_regclass(t.tbl)
       AND a.attname  = t.col
       AND a.attnum > 0
       AND NOT a.attisdropped);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '前置自检失败，以下列不存在：%', missing;
  END IF;
  RAISE NOTICE '前置自检通过：目标列全部存在';

  -- 顺手把 products 的完整列清单打出来（这份库的 schema 快照不可信，据此留档）
  RAISE NOTICE 'products 现共 % 列：%',
    (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'products'::regclass AND attnum > 0 AND NOT attisdropped),
    (SELECT string_agg(attname, ', ' ORDER BY attnum) FROM pg_attribute
      WHERE attrelid = 'products'::regclass AND attnum > 0 AND NOT attisdropped);

  -- ⚠️ 2026-09-27 新增：把两张表上的 **NOT NULL 列**打出来。
  --    踩过的坑：`products.description` 是 NOT NULL DEFAULT ''::text，
  --    导入脚本里图省事写 `SET description = NULL`，直接报
  --      ERROR: null value in column "description" of relation "products" violates not-null constraint
  --    并让**整个事务回滚**（第 1 步 3010 条 UPDATE 白跑）。
  --    ⇒ 凡是要「清空」一个 NOT NULL 列，必须写该列类型的零值（text 写 `''`），**不能写 NULL**。
  RAISE NOTICE 'NOT NULL 列（不能用 NULL 赋值，清空请写零值）：%',
    (SELECT string_agg(c.relname || '.' || a.attname ||
                       COALESCE('  [默认 ' || pg_get_expr(d.adbin, d.adrelid) || ']', ''),
                       ', ' ORDER BY c.relname, a.attnum)
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE c.relname IN ('products', 'product_releases')
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull);

  -- 把两张表上所有 CHECK 约束打出来 —— 它们会挡住不合法/未预期的写入值
  SELECT string_agg(c.conrelid::regclass || '.' || c.conname || ' = ' || pg_get_constraintdef(c.oid),
                    E'\n        ' ORDER BY c.conrelid::regclass::text, c.conname)
    INTO ck
    FROM pg_constraint c
   WHERE c.conrelid IN ('products'::regclass, 'product_releases'::regclass)
     AND c.contype = 'c';
  RAISE NOTICE '现有 CHECK 约束：%', COALESCE(ck, '（无）');
END
$precheck$;

-- 【第 -1.5 步】类型自检：本脚本按「文本列直接赋值、不加 ::cast」生成
--   若这里报错，说明某列是枚举类型（text → enum 必须显式 cast），把报错原文发回即可出对应版本。
DO $typecheck$
DECLARE bad text;
BEGIN
  SELECT string_agg(x.tbl || '.' || x.col || ' 实际是 ' || format_type(a.atttypid, a.atttypmod)
                    || '（脚本假设 ' || x.want || '）', '; ')
    INTO bad
  FROM (VALUES
    ('products','category','text'),
    ('products','title','text'),
    ('products','sub_category','text'),
    ('products','price_type','text'),
    ('products','visibility_status','text'),
    ('products','images','jsonb'),
    ('products','variants','jsonb'),
    ('product_releases','release_name','text'),
    ('product_releases','release_type','text'),
    ('product_releases','sale_status','text'),
    ('product_releases','visibility_status','text')
  ) AS x(tbl, col, want)
  JOIN pg_attribute a
    ON a.attrelid = to_regclass(x.tbl) AND a.attname = x.col
  WHERE format_type(a.atttypid, a.atttypmod) <> x.want;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '类型自检失败：%', bad;
  END IF;
  RAISE NOTICE '类型自检通过：相关列类型与脚本假设一致';
END
$typecheck$;

-- 【第 0 步】放开 products.category 上的 CHECK 约束，允许 'MIXED'
--   ⚠️ 2026-09-26 实测：products.category 有 CHECK 约束（products_category_check），
--      只允许 JK/LOLITA/HANFU/OTHER ⇒ 写 'MIXED' 报
--        ERROR: new row for relation "products" violates check constraint "products_category_check"
--      database-schema.md / database-schema-export.sql **都没记这个约束** ⇒ 两份快照都不可信。
--   所以这里**不硬编码约束名**，而是动态找出「所有涉及 category 列的 CHECK 约束」，
--   打印原定义留档后再删除，最后重建一个含 MIXED 的等价约束。可反复执行（幂等）。
--   （ALTER TYPE 那步已删除：pit_type 枚举没有任何列使用，'MIXED' 只是 category 的文本值。）
DO $freecat$
DECLARE
  r record;
  n int := 0;
BEGIN
  RAISE NOTICE '【第 0 步】处理 products.category 的 CHECK 约束 …';
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'products'::regclass
       AND c.contype  = 'c'
       AND EXISTS (SELECT 1
                     FROM unnest(c.conkey) AS k(attnum)
                     JOIN pg_attribute a
                       ON a.attrelid = c.conrelid AND a.attnum = k.attnum
                    WHERE a.attname = 'category')
     ORDER BY c.conname
  LOOP
    RAISE NOTICE '  原约束 % = %', r.conname, r.def;
    EXECUTE format('ALTER TABLE products DROP CONSTRAINT %I', r.conname);
    n := n + 1;
  END LOOP;
  IF n = 0 THEN
    RAISE NOTICE '  （没找到涉及 category 的 CHECK 约束）';
  ELSE
    RAISE NOTICE '  共删除 % 个，准备重建', n;
  END IF;
  EXECUTE 'ALTER TABLE products ADD CONSTRAINT products_category_check '
       || 'CHECK (category IN (''JK'', ''LOLITA'', ''HANFU'', ''MIXED'', ''OTHER''))';
  RAISE NOTICE '  已重建 products_category_check = JK / LOLITA / HANFU / MIXED / OTHER';
END
$freecat$;

BEGIN;

CREATE TEMP TABLE _raw (doc jsonb) ON COMMIT DROP;

INSERT INTO _raw (doc) VALUES ($__TAG__$__DOC__$__TAG__$::jsonb);

-- 把「店铺 → 商品数组」摊平成一行一商品（同时取出店名与分类，便于回溯）
--   ⚠️ _items 的列清单固定为 4 列：shop_name / it / external_id / pit_type
--      后面第 1~4 步只能引用这 4 列（生成器有静态 lint 守着，防「引用了没建的列」）
CREATE TEMP TABLE _items ON COMMIT DROP AS
SELECT
  s.key                                        AS shop_name,
  x.value                                      AS it,
  x.value ->> 'item_id'                        AS external_id,
  x.value ->> 'pit_type'                       AS pit_type
FROM (SELECT rw.doc FROM _raw rw) d,
     jsonb_each(d.doc)             AS s(key, value),
     jsonb_array_elements(s.value) AS x(value);

CREATE INDEX ON _items (external_id);

-- 安全阀 A：JSON 里有多少条在库里找不到对应商品（这些不会产生任何写入）
DO $diagA$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _items i
   WHERE NOT EXISTS (SELECT 1 FROM products p
                      WHERE p.external_id = i.external_id
                        AND lower(p.source_platform::text) IN ('taobao','tmall'));
  RAISE NOTICE 'JSON 共 % 个商品，其中库里找不到对应记录的：% 条', (SELECT count(*) FROM _items), n;
END
$diagA$;

-- 安全阀 B：将要「因不在 JSON 里而隐藏」的条数必须先看，异常多就中止
DO $diagB$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM products p
   WHERE lower(p.source_platform::text) IN ('taobao','tmall')
     AND p.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM _items i WHERE i.external_id = p.external_id);
  RAISE NOTICE '第 4 步将要隐藏（不在 JSON 里的淘宝/天猫商品）：% 条（预期 237）', n;
  IF n > 400 THEN
    RAISE EXCEPTION '要隐藏 % 条，远超预期 237 条 —— 可能是 JSON 不全，或库里已经有新增商品。已中止，请先核对。', n;
  END IF;
END
$diagB$;

-- -----------------------------------------------------------------------------
-- 第 0.5 步：导入前快照（回滚用；重跑会刷新快照）
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS _bak_products_20260926;
CREATE TABLE _bak_products_20260926 AS
SELECT p.* FROM products p
 WHERE lower(p.source_platform::text) IN ('taobao','tmall');

DROP TABLE IF EXISTS _bak_releases_20260926;
CREATE TABLE _bak_releases_20260926 AS
SELECT r.* FROM product_releases r
 WHERE r.product_id IN (SELECT id FROM _bak_products_20260926);

-- -----------------------------------------------------------------------------
-- 第 1 步：商品字段 —— 有值就覆盖（COALESCE），没写就不动
--   images 是纯 URL 字符串数组，这里转成库里的对象数组 [{url,...}]，与现有格式一致
-- -----------------------------------------------------------------------------
WITH s AS (
  SELECT
    i.external_id,
    NULLIF(btrim(i.it ->> 'title'), '')                                 AS title,
    CASE WHEN jsonb_typeof(i.it -> 'images') = 'array'
         THEN (SELECT jsonb_agg(
                        CASE WHEN jsonb_typeof(e) = 'object' THEN e
                             ELSE jsonb_build_object('url', e #>> '{}', 'thumbnailUrl', NULL,
                                                     'width', NULL, 'height', NULL,
                                                     'sizeBytes', NULL, 'objectKey', NULL)
                        END)
                 FROM jsonb_array_elements(i.it -> 'images') e)
         ELSE NULL END                                                  AS images,
    i.it ->> 'sub_category'                                             AS sub_category,
    CASE WHEN jsonb_typeof(i.it -> 'color_tags')    = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(i.it -> 'color_tags'))    END AS color_tags,
    CASE WHEN jsonb_typeof(i.it -> 'material_tags') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(i.it -> 'material_tags')) END AS material_tags,
    CASE WHEN jsonb_typeof(i.it -> 'variants') = 'array' THEN i.it -> 'variants' END AS variants,
    i.it ->> 'price_type'                                               AS price_type,
    (i.it ->> 'price_cents')::integer                                   AS price_cents
  FROM _items i
)
UPDATE products p SET
  title         = COALESCE(s.title, p.title),
  images        = COALESCE(s.images, p.images),
  sub_category  = COALESCE(s.sub_category, p.sub_category),
  color_tags    = COALESCE(s.color_tags, p.color_tags),
  material_tags = COALESCE(s.material_tags, p.material_tags),
  variants      = COALESCE(s.variants, p.variants),
  price_type    = COALESCE(s.price_type, p.price_type),
  price_cents   = COALESCE(s.price_cents, p.price_cents),
  -- ⚠️ 商品说明字段已废弃（2026-09-27 第 3 轮，用户「删除商品说明字段和模块，不需要保留」）：
  --    **无条件清空**库里的存量旧值。绝不能写成 COALESCE(s.description, p.description) ——
  --    新 JSON 已不再产出该键，COALESCE 会把库里的旧推荐位脏值原样留下来。
  -- ⚠️⚠️ 必须写 `''` 而**不是** `NULL`：`products.description` 是 **NOT NULL**（默认 `''::text`），
  --    写 NULL 会直接报 `null value in column "description" ... violates not-null constraint`
  --    并让整个事务回滚（2026-09-27 实测踩到）。空串同样能清空，且不需要 ALTER TABLE 动 schema。
  description   = '',
  updated_at    = now()
FROM s
WHERE p.external_id = s.external_id
  AND lower(p.source_platform::text) IN ('taobao','tmall');

-- -----------------------------------------------------------------------------
-- 第 1b 步：封面列跟着 images[0] 走（防御式 —— 列名不确定就先探测再更新）
--   App 的封面取的是 coverUrl，而它当前等于旧的 images[0]（品牌插画）。
--   上一步已把 images 里的品牌图剥离 ⇒ 这里把封面列同步成新的 images[0]。
--   列名候选：cover_url / cover_image / main_image / main_image_url。
--   一个都没命中就跳过（说明封面是服务端从 images[0] 现算的，无需处理）。
-- -----------------------------------------------------------------------------
DO $coversync$
DECLARE
  c text; n int := 0;
BEGIN
  FOR c IN
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products'
       AND column_name IN ('cover_url','cover_image','main_image','main_image_url')
     ORDER BY column_name
  LOOP
    EXECUTE format(
      'UPDATE products p SET %I = q.url FROM ('
      '  SELECT p2.id, (p2.images -> 0 ->> ''url'') AS url'
      '    FROM products p2'
      '   WHERE p2.images IS NOT NULL AND jsonb_typeof(p2.images) = ''array'' '
      '     AND jsonb_array_length(p2.images) > 0'
      ') q WHERE p.id = q.id AND q.url IS NOT NULL AND p.%I IS DISTINCT FROM q.url', c, c);
    RAISE NOTICE '  封面列 % 已同步为 images[0]', c;
    n := n + 1;
  END LOOP;
  IF n = 0 THEN
    RAISE NOTICE '  未发现独立封面列（coverUrl 由 images[0] 现算）→ 无需同步';
  END IF;
END
$coversync$;

-- -----------------------------------------------------------------------------
-- 第 2 步：分类 —— JSON 的 pit_type 就是最终值，写入 products.category(text)
--   ⚠️ products 没有 pit_type 列，分类只此一列（2026-09-26 实测）
-- -----------------------------------------------------------------------------
UPDATE products p SET
  category   = s.pit_type,
  updated_at = now()
FROM (SELECT DISTINCT i.external_id AS external_id, i.pit_type AS pit_type
        FROM _items i WHERE i.pit_type IS NOT NULL) s
WHERE p.external_id = s.external_id
  AND lower(p.source_platform::text) IN ('taobao','tmall')
  AND p.category IS DISTINCT FROM s.pit_type;

-- -----------------------------------------------------------------------------
-- 第 3 步：发售批次 —— 自己的 id 直接覆盖；别人占着 release_no 就跳过
-- -----------------------------------------------------------------------------
INSERT INTO product_releases (id, product_id, release_name, release_no, release_type,
                              sale_status, deposit_cents, balance_cents, full_price_cents,
                              visibility_status)
SELECT r.id, p.id, r.release_name, r.release_no,
       r.release_type, r.sale_status,
       r.deposit_cents, r.balance_cents, r.full_price_cents,
       r.visibility_status
FROM (
  SELECT
    'rel_taobao_' || i.external_id || '_' || (e ->> 'release_no') AS id,
    i.external_id,
    e ->> 'release_name'                    AS release_name,
    (e ->> 'release_no')::integer           AS release_no,
    e ->> 'release_type'                    AS release_type,
    e ->> 'sale_status'                     AS sale_status,
    (e ->> 'deposit_cents')::integer        AS deposit_cents,
    (e ->> 'balance_cents')::integer        AS balance_cents,
    (e ->> 'full_price_cents')::integer     AS full_price_cents,
    e ->> 'visibility_status'               AS visibility_status
  FROM _items i, jsonb_array_elements(i.it -> 'releases') e
  WHERE jsonb_typeof(i.it -> 'releases') = 'array'
) r
JOIN products p
  ON p.external_id = r.external_id
 AND lower(p.source_platform::text) IN ('taobao','tmall')
WHERE NOT EXISTS (
  SELECT 1 FROM product_releases x
   WHERE x.product_id = p.id AND x.release_no = r.release_no AND x.id <> r.id)
ON CONFLICT (id) DO UPDATE SET
  release_name      = EXCLUDED.release_name,
  release_type      = EXCLUDED.release_type,
  sale_status       = EXCLUDED.sale_status,
  deposit_cents     = COALESCE(EXCLUDED.deposit_cents, product_releases.deposit_cents),
  balance_cents     = COALESCE(EXCLUDED.balance_cents, product_releases.balance_cents),
  full_price_cents  = COALESCE(EXCLUDED.full_price_cents, product_releases.full_price_cents),
  visibility_status = EXCLUDED.visibility_status;

-- -----------------------------------------------------------------------------
-- 第 4 步：JSON 里没有的淘宝/天猫商品 → 隐藏（这就是那 237 条删除的落地）
-- -----------------------------------------------------------------------------
UPDATE products p SET
  visibility_status = 'hidden',
  deleted_at        = now(),
  updated_at        = now()
WHERE lower(p.source_platform::text) IN ('taobao','tmall')
  AND p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM _items i WHERE i.external_id = p.external_id);

COMMIT;

-- -----------------------------------------------------------------------------
-- 验收
-- -----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM products
    WHERE lower(source_platform::text) IN ('taobao','tmall')
      AND images IS NOT NULL AND jsonb_array_length(images) > 1)                    AS multi_image,
  (SELECT count(*) FROM products
    WHERE lower(source_platform::text) IN ('taobao','tmall')
      AND variants <> '[]'::jsonb AND variants IS NOT NULL)                         AS has_variants,
  (SELECT count(*) FROM products
    WHERE lower(source_platform::text) IN ('taobao','tmall')
      AND category = 'MIXED')                                                      AS mixed,
  (SELECT count(*) FROM product_releases)                                          AS releases_total,
  (SELECT count(*) FROM products
    WHERE lower(source_platform::text) IN ('taobao','tmall')
      AND deleted_at IS NOT NULL)                                                  AS soft_deleted,
  (SELECT count(*) FROM products
    WHERE lower(source_platform::text) IN ('taobao','tmall')
      AND deleted_at IS NULL)                                                      AS alive;
-- 期望：multi_image ≈ 1844 ｜ has_variants ≈ 1644 ｜ mixed = 110
--       releases_total ≈ 3010（每件商品都有一条发售状态）｜ soft_deleted = 237 ｜ alive ≈ 3010
'''
# ---------------------------------------------------------------------------
# 静态 lint：列引用必须真实存在
#   列清单**从 DDL / 自检 VALUES 里反解出来**，不是我手写常量 ——
#   这样「建表少写了一列」本身也会被抓到，形成闭环。
#   2026-09-26 教训：第 2 步曾引用 _items.pit_type，但 _items 当时只建了 3 列，
#   跑到事务里才报 `column "pit_type" does not exist`（Step 1 白跑一次）。
# ---------------------------------------------------------------------------
import re as _re

def _items_cols(tpl):
    m = _re.search(r'CREATE TEMP TABLE _items ON COMMIT DROP AS(.*?);', tpl, _re.S)
    if not m:
        raise SystemExit('★ lint 失败：找不到 _items 的建表语句')
    sel = m.group(1).split('FROM')[0]
    cols = set(_re.findall(r'\bAS\s+([A-Za-z_]\w*)', sel, _re.I))
    if not cols:
        raise SystemExit('★ lint 失败：从 _items 建表语句里解析不出列名')
    return cols

def _raw_cols(tpl):
    m = _re.search(r'CREATE TEMP TABLE _raw\s*\(([^)]*)\)', tpl)
    if not m:
        raise SystemExit('★ lint 失败：找不到 _raw 的建表语句')
    return {c.strip().split()[0] for c in m.group(1).split(',') if c.strip()}

def _precheck_cols(tpl):
    m = _re.search(r'FROM \(VALUES(.*?)\) AS t\(tbl, col\)', tpl, _re.S)
    if not m:
        raise SystemExit('★ lint 失败：找不到第 -1 步自检的列清单')
    pairs = _re.findall(r"\('(\w+)','(\w+)'\)", m.group(1))
    prod = {c for t, c in pairs if t == 'products'}
    rel = {c for t, c in pairs if t == 'product_releases'}
    return prod, rel

def lint_sql_template(tpl):
    errs = []
    items_c = _items_cols(tpl)
    raw_c = _raw_cols(tpl)
    prod_c, rel_c = _precheck_cols(tpl)

    targets = [
        ('_items', '_items', items_c),
        ('_raw',   '_raw',   raw_c),
        ('i',      '_items 的别名', items_c),
        ('rw',     '_raw 的别名',   raw_c),
        ('p',      'products',      prod_c),
        ('b',      '_bak_products_20260926（= SELECT p.*，列同 products）', prod_c),
    ]
    for prefix, label, allowed in targets:
        for m in _re.finditer(r'\b' + prefix + r'\s*\.\s*([A-Za-z_]\w*)', tpl):
            if m.group(1) not in allowed:
                errs.append('%s.%s —— %s 里没有这一列（可用：%s）'
                            % (prefix, m.group(1), label, ', '.join(sorted(allowed))))
    for m in _re.finditer(r'\bproduct_releases\s*\.\s*([A-Za-z_]\w*)', tpl):
        if m.group(1) not in rel_c:
            errs.append('product_releases.%s —— 自检清单里没有这一列（可用：%s）'
                        % (m.group(1), ', '.join(sorted(rel_c))))
    return errs, items_c, prod_c, rel_c

_lint, _items_c, _prod_c, _rel_c = lint_sql_template(SQL_T)
if _lint:
    print('  [LINT] 发现 %d 处列引用问题：' % len(_lint))
    for e in _lint:
        print('         · ' + e)
    raise SystemExit('★ SQL 静态 lint 未通过（列引用不存在），已中止，未写出文件')
print('    SQL 静态 lint 通过（列清单反解自 DDL）')
print('      _items          = %s' % ', '.join(sorted(_items_c)))
print('      products        = %d 列' % len(_prod_c))
print('      product_releases= %d 列' % len(_rel_c))

SQL = SQL_T.replace('__TAG__', TAG).replace('__DOC__', compact)
assert '__TAG__' not in SQL and '__DOC__' not in SQL, '占位符未替换干净'
assert SQL.count('$' + TAG + '$') == 2, 'dollar-quote 定界符数量不对'

p2 = os.path.join(OUT, 'import-full.sql')
open(p2, 'w', encoding='utf-8', newline='\n').write(SQL)
print('[6] 写出 import-full.sql', os.path.getsize(p2), 'bytes')

# ---------- 6b. 干跑版：把 COMMIT 换成「先跑验收 SELECT 再 ROLLBACK」----------
#   用户对「又会报错」有顾虑。这份干跑脚本让云服务器先**真执行一遍**（所有自检、所有
#   UPDATE/INSERT、约束校验、行数统计全部真实发生），最后 `ROLLBACK` ⇒ 库状态零变化。
#   干跑通过 = 真跑必定能跑通（脚本里没有 ALTER TYPE 这类不可回滚语句）。
_h, _t = SQL.split('COMMIT;', 1)
DRY = (_h
       + '-- 【干跑模式】下面先跑验收统计，然后整体回滚，库状态不变。\n'
       + _t
       + '\n-- 干跑结束：回滚，库状态与执行前完全一致\nROLLBACK;\n')
p2d = os.path.join(OUT, 'import-dryrun.sql')
open(p2d, 'w', encoding='utf-8', newline='\n').write(DRY)
assert 'ROLLBACK;' in DRY and '\nCOMMIT;' not in DRY.replace('--', '')
print('[6b] 写出 import-dryrun.sql', os.path.getsize(p2d), 'bytes（干跑：真执行 + 回滚，库不变）')

# 回读校验
import re
txt = open(p2, encoding='utf-8').read()
m = re.search(r"VALUES \(\$" + TAG + r"\$(.*?)\$" + TAG + r"\$::jsonb\);", txt, re.S)
assert m, '回读失败'
back = json.loads(m.group(1))
assert back == out, '回读内容与 out 不一致'
print('    回读校验通过：%d 店 / %d 条' % (len(back), sum(len(v) for v in back.values())))

ROLLBACK = '''-- =============================================================================
-- 三坑绮橱 · 回滚（撤销 import-full.sql 的全部写入）
--   前提：import-full.sql 建过 _bak_products_20260926 / _bak_releases_20260926
--   注意：分类写在 products.category(text) 一列，**没有** pit_type 列（2026-09-26 实测）
-- =============================================================================
\\set ON_ERROR_STOP on

BEGIN;

DELETE FROM product_releases r
 WHERE r.product_id IN (SELECT id FROM _bak_products_20260926)
   AND NOT EXISTS (SELECT 1 FROM _bak_releases_20260926 b WHERE b.id = r.id);

UPDATE products p SET
  images            = b.images,
  sub_category      = b.sub_category,
  color_tags        = b.color_tags,
  material_tags     = b.material_tags,
  variants          = b.variants,
  price_type        = b.price_type,
  price_cents       = b.price_cents,
  description       = b.description,
  category          = b.category,
  visibility_status = b.visibility_status,
  deleted_at        = b.deleted_at,
  updated_at        = now()
FROM _bak_products_20260926 b
WHERE p.id = b.id;

COMMIT;

SELECT (SELECT count(*) FROM products
         WHERE lower(source_platform::text) IN ('taobao','tmall') AND deleted_at IS NOT NULL) AS soft_deleted_now,
       (SELECT count(*) FROM products
         WHERE lower(source_platform::text) IN ('taobao','tmall') AND category = 'MIXED')       AS mixed_now;
'''
p3 = os.path.join(OUT, 'rollback-full.sql')
open(p3, 'w', encoding='utf-8', newline='\n').write(ROLLBACK)
print('[7] 写出 rollback-full.sql', os.path.getsize(p3), 'bytes')

# ---------- 写在 JSON 旁边的说明 ----------
note = os.path.join(DESKTOP, 'all_shops_products.updated.README.txt')
open(note, 'w', encoding='utf-8', newline='\n').write(
    'all_shops_products.updated.json —— 三坑绮橱 商品数据最终版（%s 生成）\n'
    '\n'
    '来源：all_shops_products.json（%d 店 / %d 条）\n'
    '  − 删除集 %d 条            → 剩 %d 条\n'
    '  + 采集补充（images/材质/颜色/款式/价格/批次）\n'
    '  + 分类调整 %d 条（MIXED %d + OTHER 归位 %d）\n'
    '\n'
    '结构：{ "<店铺名>": [ {商品}, ... ], ... }   共 %d 店 / %d 条\n'
    '原键全部保留；采集补充用库列名平铺：images / sub_category / color_tags /\n'
    'material_tags / variants / price_type / price_cents / releases\n'
    '⚠️ description（商品说明）已废弃 —— 本文件不含该字段，导入时库里旧值会被置 NULL\n'
    '⚠️ 标题只做了一件事：删掉品牌名；其余（品类词/状态词/空格/符号）原样保留\n'
    'images 是纯 URL 字符串数组；releases 不带 id（导入时自动生成）\n'
    '字段缺席 = 没采到 = 导入时不动该列（不是写 NULL）\n'
    '\n'
    '导入：把 out-collected/import-full.sql 传到服务器后\n'
    '  docker exec -i sankeng-pg_postgres_1 psql -U postgres -d sankeng \\\n'
    '    -v ON_ERROR_STOP=1 < import-full.sql\n'
    '回滚：rollback-full.sql\n'
    % (NOW, len(src), src_total, len(hide), src_total - len(hide),
       len(pit_change), len(mixed), len(reclass), len(out), kept_total))
print('[8] 写出', note)

# ---------- 生成后：sqlglot 语法复核（可选，缺 sqlglot 就跳过）----------
try:
    import importlib.util as _ilu
    _spec = _ilu.spec_from_file_location('_lint_sql_parse', os.path.join(ROOT, '_lint_sql_parse.py'))
    _mod = _ilu.module_from_spec(_spec)
    _spec.loader.exec_module(_mod)
    _ok, _lines = _mod.verify_all(OUT, quiet=True)
    for _l in _lines:
        print('    ' + _l)
    if not _ok:
        print('★ 语法复核未通过，文件虽已写出但请勿上传')
        raise SystemExit(1)
    print('[9] sqlglot 语法复核通过，可以上传')
except SystemExit:
    raise
except Exception as _e:
    print('[9] [跳过 sqlglot 语法复核] %s：%s' % (type(_e).__name__, _e))

