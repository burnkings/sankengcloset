-- ============================================================================
-- 三坑绮橱 (Sankeng Closet) 数据库结构导出
-- 导出时间: 2026-09-14
-- 数据库: sankeng @ 127.0.0.1:5433
-- 使用: CREATE DATABASE newdb; \c newdb; \i database-schema-export.sql
-- ============================================================================

-- ============================================================================
-- 0. 扩展
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 1. 自定义枚举类型
-- ============================================================================

CREATE TYPE pit_type AS ENUM ('JK', 'LOLITA', 'HANFU', 'OTHER');
CREATE TYPE data_source AS ENUM ('OFFICIAL', 'TAOBAO', 'TMALL', 'WEIBO', 'XIAOHONGSHU', 'WECHAT_MP', 'BILIBILI', 'USER_SUBMIT', 'ADMIN', 'AI_EXTRACT');
CREATE TYPE data_status AS ENUM ('FRESH', 'STALE', 'DELETED', 'ARCHIVED');
CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CORRECTED');
CREATE TYPE visibility_status AS ENUM ('draft', 'reviewing', 'published', 'hidden');
CREATE TYPE sale_status AS ENUM ('UPCOMING', 'ON_SALE', 'PRE_ORDER', 'SOLD_OUT', 'ENDED', 'UNKNOWN');
CREATE TYPE price_type AS ENUM ('FULL', 'DEPOSIT', 'BALANCE', 'INTENTION', 'UNKNOWN');
CREATE TYPE release_type AS ENUM ('first_release', 'rerelease', 'reservation', 'spot', 'lottery', 'unknown');
CREATE TYPE event_type AS ENUM ('PREVIEW', 'RESERVATION', 'DEPOSIT', 'FINAL_PAYMENT', 'RELEASE', 'RESTOCK', 'PRICE_DROP');
CREATE TYPE event_status AS ENUM ('UPCOMING', 'ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE crawl_status AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');
CREATE TYPE crawl_mode AS ENUM ('incremental', 'full', 'backfill', 'manual');

-- ============================================================================
-- 2. 核心业务表 (按依赖顺序)
-- ============================================================================

-- 用户表 (无外键依赖)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 品牌表 (无外键依赖)
CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  category pit_type NOT NULL DEFAULT 'OTHER',
  logo_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  official_url TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_platform data_source NOT NULL DEFAULT 'ADMIN',
  follower_count INTEGER NOT NULL DEFAULT 0,
  data_status data_status NOT NULL DEFAULT 'FRESH',
  review_status review_status NOT NULL DEFAULT 'PENDING',
  confidence INTEGER NOT NULL DEFAULT 100,
  fetched_at TIMESTAMPTZ,
  heat_score INTEGER NOT NULL DEFAULT 0,
  update_frequency_days INTEGER NOT NULL DEFAULT 0,
  avg_price_cents INTEGER NOT NULL DEFAULT 0,
  popular_series TEXT[] NOT NULL DEFAULT '{}',
  release_cycle_days INTEGER NOT NULL DEFAULT 0,
  brand_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 款式表 (依赖: brands)
CREATE TABLE styles (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  canonical_name TEXT NOT NULL,
  category pit_type NOT NULL DEFAULT 'OTHER',
  sub_category TEXT NOT NULL DEFAULT '',
  style_tags TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 商品表 (依赖: brands, styles)
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  brand_id TEXT REFERENCES brands(id),
  shop_id TEXT,
  pit_type pit_type NOT NULL DEFAULT 'OTHER',
  category TEXT NOT NULL DEFAULT '',
  sub_category TEXT NOT NULL DEFAULT '',
  style_tags TEXT[] NOT NULL DEFAULT '{}',
  color_tags TEXT[] NOT NULL DEFAULT '{}',
  material_tags TEXT[] NOT NULL DEFAULT '{}',
  season_tags TEXT[] NOT NULL DEFAULT '{}',
  scene_tags TEXT[] NOT NULL DEFAULT '{}',
  element_tags TEXT[] NOT NULL DEFAULT '{}',
  recommended_tags TEXT[] NOT NULL DEFAULT '{}',
  sale_status sale_status NOT NULL DEFAULT 'UPCOMING',
  current_price INTEGER NOT NULL DEFAULT 0,
  original_price INTEGER NOT NULL DEFAULT 0,
  deposit_price INTEGER NOT NULL DEFAULT 0,
  balance_price INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  price_type price_type NOT NULL DEFAULT 'UNKNOWN',
  preorder_start_at TIMESTAMPTZ,
  preorder_end_at TIMESTAMPTZ,
  balance_start_at TIMESTAMPTZ,
  balance_end_at TIMESTAMPTZ,
  release_at TIMESTAMPTZ,
  source_url TEXT NOT NULL DEFAULT '',
  source_platform data_source NOT NULL DEFAULT 'ADMIN',
  external_id TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  images TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  raw_description TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL DEFAULT '',
  source_published_at TIMESTAMPTZ,
  shop_name TEXT NOT NULL DEFAULT '',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_status data_status NOT NULL DEFAULT 'FRESH',
  review_status review_status NOT NULL DEFAULT 'PENDING',
  confidence INTEGER NOT NULL DEFAULT 100,
  view_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  visibility_status visibility_status NOT NULL DEFAULT 'draft',
  feed_score INTEGER NOT NULL DEFAULT 0,
  style_id TEXT REFERENCES styles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 商品发售事件 (依赖: products)
CREATE TABLE product_releases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  release_name TEXT NOT NULL DEFAULT '',
  release_no INTEGER NOT NULL DEFAULT 0,
  release_type release_type NOT NULL DEFAULT 'unknown',
  sale_status sale_status NOT NULL DEFAULT 'UPCOMING',
  deposit_price_cents INTEGER NOT NULL DEFAULT 0,
  balance_price_cents INTEGER NOT NULL DEFAULT 0,
  full_price_cents INTEGER NOT NULL DEFAULT 0,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  balance_due_at TIMESTAMPTZ,
  ship_at TIMESTAMPTZ,
  is_rerelease BOOLEAN NOT NULL DEFAULT false,
  is_sold_out BOOLEAN NOT NULL DEFAULT false,
  source_url TEXT NOT NULL DEFAULT '',
  visibility_status visibility_status NOT NULL DEFAULT 'draft',
  review_status review_status NOT NULL DEFAULT 'PENDING',
  confidence INTEGER NOT NULL DEFAULT 100,
  lifecycle_status TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 商品规格变体 (依赖: products)
CREATE TABLE product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  stock_status TEXT NOT NULL DEFAULT 'IN_STOCK',
  stock_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 商品图片 (依赖: products)
CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  url TEXT NOT NULL DEFAULT '',
  object_key TEXT,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_cover BOOLEAN NOT NULL DEFAULT false,
  source_url TEXT NOT NULL DEFAULT '',
  phash TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. 数据溯源表 (无外键依赖)
-- ============================================================================

-- 导入批次
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  crawler_version TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  fetched_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_records INTEGER NOT NULL DEFAULT 0,
  success_records INTEGER NOT NULL DEFAULT 0,
  failed_records INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 数据来源追踪
CREATE TABLE source_records (
  id TEXT PRIMARY KEY,
  source_type data_source NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  original_id TEXT NOT NULL DEFAULT '',
  raw_data_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  parser_version TEXT NOT NULL DEFAULT 'v1',
  review_status review_status NOT NULL DEFAULT 'PENDING',
  confidence INTEGER NOT NULL DEFAULT 100,
  human_modified BOOLEAN NOT NULL DEFAULT false,
  reviewer_id TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 原始采集数据 (依赖: source_records, import_batches)
CREATE TABLE raw_data (
  id TEXT PRIMARY KEY,
  source_record_id TEXT REFERENCES source_records(id),
  source_type data_source NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'text/html',
  raw_content TEXT NOT NULL DEFAULT '',
  parsed_json JSONB NOT NULL DEFAULT '{}',
  http_status INTEGER,
  http_headers JSONB NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  import_batch_id TEXT
);

-- 价格历史快照 (依赖: products)
CREATE TABLE price_snapshots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  price_cents INTEGER NOT NULL DEFAULT 0,
  original_price_cents INTEGER NOT NULL DEFAULT 0,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  release_id TEXT
);

-- 发售事件 (依赖: products, source_records)
CREATE TABLE sale_events (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  event_type event_type NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  deposit_amount INTEGER NOT NULL DEFAULT 0,
  balance_amount INTEGER NOT NULL DEFAULT 0,
  status event_status NOT NULL DEFAULT 'UPCOMING',
  source_id TEXT REFERENCES source_records(id),
  data_status data_status NOT NULL DEFAULT 'FRESH',
  review_status review_status NOT NULL DEFAULT 'PENDING',
  confidence INTEGER NOT NULL DEFAULT 100,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 审核记录
CREATE TABLE review_records (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  field_changes JSONB NOT NULL DEFAULT '{}',
  reviewer_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. 采集系统表
-- ============================================================================

-- 采集任务
CREATE TABLE crawl_jobs (
  id TEXT PRIMARY KEY,
  source_type data_source NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  status crawl_status NOT NULL DEFAULT 'PENDING',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  items_total INTEGER NOT NULL DEFAULT 0,
  items_success INTEGER NOT NULL DEFAULT 0,
  items_failed INTEGER NOT NULL DEFAULT 0,
  items_skipped INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  parser_version TEXT NOT NULL DEFAULT 'v1',
  trigger TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  crawl_mode crawl_mode NOT NULL DEFAULT 'incremental'
);

-- 采集记录 (依赖: crawl_jobs)
CREATE TABLE crawl_records (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES crawl_jobs(id),
  source_type data_source NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  status crawl_status NOT NULL DEFAULT 'PENDING',
  entity_type TEXT,
  entity_id TEXT,
  dedup_action TEXT NOT NULL DEFAULT 'insert',
  error_message TEXT,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 品牌采集策略 (依赖: brands)
CREATE TABLE brand_crawl_policies (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  source_type data_source NOT NULL DEFAULT 'OFFICIAL',
  source_url TEXT NOT NULL DEFAULT '',
  crawl_enabled BOOLEAN NOT NULL DEFAULT false,
  incremental_interval_hours INTEGER NOT NULL DEFAULT 24,
  full_interval_days INTEGER NOT NULL DEFAULT 30,
  backfill_enabled BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0,
  last_incremental_crawled_at TIMESTAMPTZ,
  last_full_crawled_at TIMESTAMPTZ,
  last_backfill_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. 媒体与用户系统表
-- ============================================================================

-- 媒体对象 (依赖: users)
CREATE TABLE media_objects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  object_key TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. AI 导入系统表 (依赖: users, media_objects)
-- ============================================================================

-- AI 导入任务
CREATE TABLE ai_import_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  object_key TEXT NOT NULL,
  state TEXT NOT NULL,
  request_id TEXT NOT NULL DEFAULT '',
  model_provider TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL DEFAULT '',
  model_version TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  target_type TEXT,
  target_id TEXT,
  media_id TEXT REFERENCES media_objects(id),
  task_type TEXT NOT NULL DEFAULT 'purchase_order',
  source_platform TEXT NOT NULL DEFAULT '',
  source_link TEXT NOT NULL DEFAULT ''
);

-- AI 导入建议 (依赖: ai_import_tasks)
CREATE TABLE ai_import_suggestions (
  task_id TEXT PRIMARY KEY REFERENCES ai_import_tasks(id),
  suggestion_json JSONB NOT NULL DEFAULT '{}',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  field_confidence_json JSONB NOT NULL DEFAULT '{}',
  evidence_json JSONB NOT NULL DEFAULT '[]',
  warnings_json JSONB NOT NULL DEFAULT '[]'
);

-- AI 导入确认 (依赖: ai_import_tasks, users)
CREATE TABLE ai_import_confirmations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES ai_import_tasks(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  confirmed_json JSONB NOT NULL DEFAULT '{}',
  correction_json JSONB NOT NULL DEFAULT '{}',
  op_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, op_id)
);

-- ============================================================================
-- 7. 用户系统表
-- ============================================================================

-- 用户身份 (依赖: users)
CREATE TABLE user_identities (
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(provider, provider_subject)
);

-- 用户会话 (依赖: users)
CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  refresh_token_hash TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 用户设置 (依赖: users)
CREATE TABLE user_settings (
  user_id TEXT NOT NULL REFERENCES users(id),
  setting_key TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, setting_key)
);

-- 用户资产 (依赖: users)
CREATE TABLE user_assets (
  user_id TEXT NOT NULL REFERENCES users(id),
  asset_type TEXT NOT NULL,
  id TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY(user_id, asset_type, id)
);

-- 用户事件 (依赖: users)
CREATE TABLE user_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同步操作 (依赖: users)
CREATE TABLE sync_operations (
  user_id TEXT NOT NULL REFERENCES users(id),
  op_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  result TEXT NOT NULL DEFAULT '',
  server_version BIGINT NOT NULL DEFAULT 0,
  client_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, op_id)
);

-- ============================================================================
-- 8. 社区与互动表 (依赖: users, media_objects)
-- ============================================================================

-- 社区帖子
CREATE TABLE community_posts (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL REFERENCES users(id),
  media_id TEXT REFERENCES media_objects(id),
  image_url TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  topic TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 社区帖子点赞 (依赖: community_posts, users)
CREATE TABLE community_post_likes (
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(post_id, user_id)
);

-- 品牌关注 (依赖: users, brands)
CREATE TABLE brand_followers (
  user_id TEXT NOT NULL REFERENCES users(id),
  brand_id TEXT NOT NULL REFERENCES brands(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, brand_id)
);

-- 用户反馈 (依赖: users)
CREATE TABLE feedback_records (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  images JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 9. 标签表
-- ============================================================================

-- 标签
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'style',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name)
);

-- 商品标签关联 (依赖: products, tags)
CREATE TABLE product_tags (
  product_id TEXT NOT NULL REFERENCES products(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY(product_id, tag_id)
);

-- ============================================================================
-- 10. 搜索别名表
-- ============================================================================

-- 搜索别名
CREATE TABLE aliases (
  id TEXT PRIMARY KEY,
  term TEXT NOT NULL,
  canonical_term TEXT NOT NULL,
  alias_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  confidence INTEGER NOT NULL DEFAULT 100,
  source TEXT NOT NULL DEFAULT 'seed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 11. 衣橱与心愿单表
-- ============================================================================

-- 衣橱物品 (依赖: users)
CREATE TABLE wardrobe_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 心愿单 (依赖: users)
CREATE TABLE wishlist_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 12. 迁移记录表
-- ============================================================================

-- Schema 迁移
CREATE TABLE schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 13. 索引定义
-- ============================================================================

-- 品牌索引
CREATE UNIQUE INDEX brands_name_unique ON brands(name, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_brands_heat_score ON brands(heat_score DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_brands_name_trgm ON brands USING gin(name gin_trgm_ops) WHERE deleted_at IS NULL;

-- 款式索引
CREATE UNIQUE INDEX styles_brand_name_unique ON styles(brand_id, canonical_name) WHERE deleted_at IS NULL;

-- 商品索引
CREATE UNIQUE INDEX products_brand_canonical_unique ON products(brand_id, canonical_name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX products_platform_external_unique ON products(source_platform, external_id) WHERE external_id != '' AND deleted_at IS NULL;
CREATE INDEX products_brand_idx ON products(brand_id);
CREATE INDEX products_canonical_idx ON products(canonical_name, brand_id);
CREATE INDEX products_created_idx ON products(created_at DESC);
CREATE INDEX products_pit_type_idx ON products(pit_type);
CREATE INDEX products_sale_status_idx ON products(sale_status);
CREATE INDEX products_review_status_idx ON products(review_status);
CREATE INDEX products_source_idx ON products(source_platform, external_id);
CREATE INDEX products_style_idx ON products(style_id) WHERE deleted_at IS NULL AND style_id IS NOT NULL;
CREATE INDEX idx_products_brand_sale ON products(brand_id, sale_status) WHERE deleted_at IS NULL AND visibility_status = 'published';
CREATE INDEX idx_products_feed_score ON products(feed_score DESC) WHERE deleted_at IS NULL AND visibility_status = 'published';
CREATE INDEX idx_products_price ON products(current_price) WHERE deleted_at IS NULL AND visibility_status = 'published' AND current_price > 0;
CREATE INDEX idx_products_title_trgm ON products USING gin(canonical_name gin_trgm_ops) WHERE deleted_at IS NULL AND visibility_status = 'published';
CREATE INDEX idx_products_visibility ON products(visibility_status) WHERE deleted_at IS NULL;

-- 商品发售索引
CREATE UNIQUE INDEX idx_releases_dedup ON product_releases(product_id, release_no, release_type) WHERE deleted_at IS NULL AND release_no > 0;
CREATE INDEX idx_releases_product ON product_releases(product_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_releases_status ON product_releases(visibility_status, sale_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_releases_lifecycle ON product_releases(lifecycle_status) WHERE deleted_at IS NULL;

-- 商品变体索引
CREATE UNIQUE INDEX product_variants_product_id_color_size_key ON product_variants(product_id, color, size);
CREATE INDEX product_variants_product_idx ON product_variants(product_id);

-- 商品图片索引
CREATE UNIQUE INDEX product_images_product_id_sort_order_key ON product_images(product_id, sort_order);
CREATE INDEX product_images_product_idx ON product_images(product_id);
CREATE INDEX product_images_phash_idx ON product_images(phash) WHERE phash != '';

-- 价格快照索引
CREATE INDEX price_snapshots_product_idx ON price_snapshots(product_id, fetched_at DESC);
CREATE INDEX idx_snapshots_release ON price_snapshots(release_id) WHERE release_id IS NOT NULL;

-- 发售事件索引
CREATE INDEX sale_events_product_idx ON sale_events(product_id, start_at);
CREATE INDEX sale_events_status_idx ON sale_events(status);

-- 数据溯源索引
CREATE UNIQUE INDEX source_records_dedup_uniq ON source_records(source_type, original_id, entity_type, entity_id);
CREATE INDEX source_records_entity_idx ON source_records(entity_type, entity_id);
CREATE INDEX source_records_source_idx ON source_records(source_type, original_id);
CREATE INDEX source_records_url_idx ON source_records(source_url);

-- 原始数据索引
CREATE INDEX raw_data_batch_idx ON raw_data(import_batch_id);
CREATE INDEX raw_data_source_idx ON raw_data(source_record_id);
CREATE INDEX raw_data_source_idx2 ON raw_data(source_type, fetched_at);

-- 审核记录索引
CREATE INDEX review_records_entity_idx ON review_records(entity_type, entity_id);

-- 采集索引
CREATE INDEX crawl_jobs_status_idx ON crawl_jobs(status, created_at DESC);
CREATE INDEX crawl_records_job_idx ON crawl_records(job_id);
CREATE INDEX crawl_records_source_idx ON crawl_records(source_type, external_id);
CREATE INDEX idx_crawl_policies_brand ON brand_crawl_policies(brand_id);
CREATE UNIQUE INDEX idx_crawl_policies_unique ON brand_crawl_policies(brand_id, source_type);
CREATE INDEX idx_crawl_policies_enabled ON brand_crawl_policies(crawl_enabled, priority DESC) WHERE crawl_enabled = true;

-- AI 导入索引
CREATE INDEX ai_import_tasks_user_state_idx ON ai_import_tasks(user_id, state);
CREATE UNIQUE INDEX ai_import_confirmations_task_uniq ON ai_import_confirmations(task_id);

-- 用户系统索引
CREATE INDEX user_sessions_hash_idx ON user_sessions(refresh_token_hash);
CREATE INDEX user_sessions_user_idx ON user_sessions(user_id, created_at DESC);
CREATE INDEX user_assets_active_idx ON user_assets(user_id, asset_type, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_user_type ON user_events(user_id, event_type, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_events_target ON user_events(target_type, target_id, created_at DESC);
CREATE INDEX idx_events_anon ON user_events(event_type, created_at DESC) WHERE user_id IS NULL;
CREATE INDEX user_events_user_type_created_idx ON user_events(user_id, event_type, created_at DESC);

-- 品牌关注索引
CREATE INDEX idx_brand_followers_brand ON brand_followers(brand_id, created_at DESC);
CREATE INDEX idx_followed_brands ON brand_followers(user_id) WHERE user_id IS NOT NULL;

-- 社区索引
CREATE INDEX community_posts_author_idx ON community_posts(author_user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX community_posts_public_idx ON community_posts(category, topic, created_at DESC) WHERE deleted_at IS NULL AND visibility = 'public';
CREATE INDEX community_posts_product_id_idx ON community_posts(product_id) WHERE deleted_at IS NULL AND product_id IS NOT NULL;
CREATE INDEX community_post_likes_user_idx ON community_post_likes(user_id, created_at DESC);

-- 反馈索引
CREATE INDEX feedback_records_user_idx ON feedback_records(user_id) WHERE deleted_at IS NULL;

-- 标签索引 (tags_name_key 由 UNIQUE(name) 自动创建)

-- 媒体索引
CREATE UNIQUE INDEX media_objects_object_key_key ON media_objects(object_key);
CREATE UNIQUE INDEX media_objects_upload_id_key ON media_objects(upload_id);

-- 搜索别名索引
CREATE UNIQUE INDEX aliases_term_type_unique ON aliases(term, alias_type) WHERE deleted_at IS NULL;
CREATE INDEX aliases_lookup_idx ON aliases(term) WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX aliases_canonical_idx ON aliases(canonical_term, alias_type) WHERE status = 'active' AND deleted_at IS NULL;

-- 衣橱索引
CREATE INDEX wardrobe_items_user_category_idx ON wardrobe_items(user_id, category);

-- 心愿单索引
CREATE INDEX idx_wishlist_product ON wishlist_items(user_id, product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX wishlist_items_user_product_uniq ON wishlist_items(user_id, product_id) WHERE product_id IS NOT NULL;
CREATE INDEX wishlist_items_user_status_idx ON wishlist_items(user_id, status);

-- ============================================================================
-- 14. 视图定义
-- ============================================================================

-- 内容 Feed 视图
CREATE VIEW v_content_feed AS
SELECT 
  p.id AS product_id,
  p.brand_id,
  COALESCE(b.name, p.canonical_name) AS brand_name,
  p.canonical_name AS title,
  p.category,
  p.cover_url,
  p.shop_id,
  p.current_price AS price_cents,
  p.original_price AS original_price_cents,
  p.sale_status,
  p.feed_score,
  p.season_tags,
  p.scene_tags,
  p.element_tags,
  p.recommended_tags,
  p.visibility_status,
  p.review_status,
  p.created_at,
  p.updated_at,
  r.id AS release_id,
  r.release_type,
  r.release_name,
  r.deposit_price_cents,
  r.balance_price_cents,
  r.full_price_cents,
  r.start_at AS release_start_at,
  r.end_at AS release_end_at,
  r.is_rerelease,
  r.is_sold_out,
  r.lifecycle_status AS release_lifecycle,
  ps.price_cents AS snapshot_price,
  ps.fetched_at AS price_captured_at
FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN LATERAL (
    SELECT pr.*
    FROM product_releases pr
    WHERE pr.product_id = p.id AND pr.deleted_at IS NULL
    ORDER BY pr.created_at DESC
    LIMIT 1
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT ps.*
    FROM price_snapshots ps
    WHERE ps.product_id = p.id
    ORDER BY ps.fetched_at DESC
    LIMIT 1
  ) ps ON true
WHERE p.deleted_at IS NULL AND p.visibility_status = 'published';

-- ============================================================================
-- 导出完成 (36表 + 1视图 + 12枚举 + 75索引)
-- ============================================================================
