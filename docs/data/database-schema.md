# 三坑绮橱 数据库结构文档

> sankeng @ 127.0.0.1:5433 (PostgreSQL 17)
> 生成时间: 2026-09-15

---

## 数据库总览

共 36 张表。

| 表名 | 行数 | 说明 |
|------|------|------|
| brands | 252 | 品牌 |
| aliases | 31 | 别名/标准化映射 |
| schema_migrations | 18 | 数据库迁移记录 |
| user_assets | 4 | 用户资产（衣橱/购买/提醒/愿望） |
| feedback_records | 1 | 用户反馈 |
| brand_followers | 1 | 品牌关注 |
| wishlist_items | 1 | 愿望清单 |
| users | 1 | 用户 |
| products | 0 | 商品（核心表） |
| styles | 0 | 风格系列 |
| product_images | 0 | 商品图片 |
| product_releases | 0 | 商品发售批次 |
| product_variants | 0 | 商品规格（尺码/颜色） |
| product_tags | 0 | 商品-标签关联 |
| tags | 0 | 标签 |
| price_snapshots | 0 | 价格快照 |
| sale_events | 0 | 销售事件 |
| source_records | 0 | 数据来源记录 |
| raw_data | 0 | 原始抓取数据 |
| import_batches | 0 | 导入批次 |
| crawl_jobs | 0 | 爬虫任务 |
| crawl_records | 0 | 爬虫记录 |
| brand_crawl_policies | 0 | 品牌爬虫策略 |
| community_posts | 0 | 社区帖子 |
| community_post_likes | 0 | 社区帖子点赞 |
| media_objects | 0 | 媒体对象（上传文件） |
| user_events | 0 | 用户行为事件 |
| user_sessions | 0 | 用户会话 |
| user_identities | 0 | 用户身份绑定 |
| user_settings | 0 | 用户设置 |
| sync_operations | 0 | 同步操作日志 |
| wardrobe_items | 0 | 衣橱单品 |
| review_records | 0 | 审核记录 |
| ai_import_tasks | 0 | AI识别任务 |
| ai_import_suggestions | 0 | AI识别建议 |
| ai_import_confirmations | 0 | AI识别确认 |

---

## 自定义枚举类型

| 枚举名 | 值 |
|--------|-----|
| pit_type | JK / LOLITA / HANFU / OTHER |
| data_source | OFFICIAL / TAOBAO / TMALL / WEIBO / XIAOHONGSHU / WECHAT_MP / BILIBILI / USER_SUBMIT / ADMIN / AI_EXTRACT |
| data_status | FRESH / STALE / DELETED / ARCHIVED |
| review_status | PENDING / APPROVED / REJECTED / CORRECTED |
| sale_status | UPCOMING / ON_SALE / PRE_ORDER / SOLD_OUT / ENDED / UNKNOWN |
| visibility_status | draft / reviewing / published / hidden |
| crawl_status | PENDING / RUNNING / SUCCESS / FAILED / SKIPPED |
| crawl_mode | incremental / full / backfill / manual |
| release_type | first_release / rerelease / reservation / spot / lottery / unknown |
| event_type | PREVIEW / RESERVATION / DEPOSIT / FINAL_PAYMENT / RELEASE / RESTOCK / PRICE_DROP |
| event_status | UPCOMING / ACTIVE / ENDED / CANCELLED |
| price_type | FULL / DEPOSIT / BALANCE / INTENTION / UNKNOWN |

---

## 逐表结构

### 1. users (1行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| nickname | text | NOT NULL | - |
| status | text | NOT NULL | 'active' |
| avatar_url | text | NOT NULL | '' |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

样例: id=`usr_e2e_cal_1786945204`, nickname=`e2e-cal-test`, status=`active`

---

### 2. brands (252行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| name | text | NOT NULL | - |
| name_en | text | NOT NULL | '' |
| category | pit_type | NOT NULL | 'OTHER' |
| logo_url | text | NOT NULL | '' |
| description | text | NOT NULL | '' |
| official_url | text | NOT NULL | '' |
| source_url | text | NOT NULL | '' |
| source_platform | data_source | NOT NULL | 'ADMIN' |
| follower_count | integer | NOT NULL | 0 |
| data_status | data_status | NOT NULL | 'FRESH' |
| review_status | review_status | NOT NULL | 'PENDING' |
| confidence | integer | NOT NULL | 100 |
| fetched_at | timestamptz | - | - |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |
| deleted_at | timestamptz | - | - |
| heat_score | integer | NOT NULL | 0 |
| update_frequency_days | integer | NOT NULL | 0 |
| avg_price_cents | integer | NOT NULL | 0 |
| popular_series | text[] | NOT NULL | '{}' |
| release_cycle_days | integer | NOT NULL | 0 |
| brand_status | text | NOT NULL | 'active' |

唯一索引: (name, category) WHERE deleted_at IS NULL
CHECK: confidence 0-100

样例: id=`br_3e407829...`, name=`Alice girl原创工作室`, category=`OTHER`, source_platform=`TAOBAO`, confidence=`80`

---

### 3. aliases (31行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| term | text | NOT NULL | - |
| canonical_term | text | NOT NULL | - |
| alias_type | text | NOT NULL, CHECK | - |
| status | text | NOT NULL, CHECK | 'active' |
| confidence | integer | NOT NULL, CHECK 0-100 | 100 |
| source | text | NOT NULL | 'seed' |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |
| deleted_at | timestamptz | - | - |

alias_type CHECK: category / brand / style
status CHECK: active / disabled / review
唯一索引: (term, alias_type) WHERE deleted_at IS NULL

样例: term=`lo裙`, canonical_term=`LOLITA`, alias_type=`category`

---

### 4. products (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| canonical_name | text | NOT NULL | - |
| display_name | text | NOT NULL | - |
| brand_id | text | FK→brands | - |
| shop_id | text | - | - |
| pit_type | pit_type | NOT NULL | 'OTHER' |
| category | text | NOT NULL | '' |
| sub_category | text | NOT NULL | '' |
| style_tags | text[] | NOT NULL | '{}' |
| color_tags | text[] | NOT NULL | '{}' |
| material_tags | text[] | NOT NULL | '{}' |
| sale_status | sale_status | NOT NULL | 'UPCOMING' |
| current_price | integer | NOT NULL, CHECK ≥0 | 0 |
| original_price | integer | NOT NULL, CHECK ≥0 | 0 |
| deposit_price | integer | NOT NULL, CHECK ≥0 | 0 |
| balance_price | integer | NOT NULL, CHECK ≥0 | 0 |
| currency | text | NOT NULL | 'CNY' |
| preorder_start_at | timestamptz | - | - |
| preorder_end_at | timestamptz | - | - |
| balance_start_at | timestamptz | - | - |
| balance_end_at | timestamptz | - | - |
| release_at | timestamptz | - | - |
| source_url | text | NOT NULL | '' |
| source_platform | data_source | NOT NULL | 'ADMIN' |
| external_id | text | NOT NULL | '' |
| cover_url | text | NOT NULL | '' |
| images | text[] | NOT NULL | '{}' |
| description | text | NOT NULL | '' |
| raw_description | text | NOT NULL | '' |
| source_published_at | timestamptz | - | - |
| first_seen_at | timestamptz | NOT NULL | now() |
| last_seen_at | timestamptz | NOT NULL | now() |
| collected_at | timestamptz | NOT NULL | now() |
| data_status | data_status | NOT NULL | 'FRESH' |
| review_status | review_status | NOT NULL | 'PENDING' |
| confidence | integer | NOT NULL, CHECK 0-100 | 100 |
| view_count | integer | NOT NULL | 0 |
| favorite_count | integer | NOT NULL | 0 |
| version | integer | NOT NULL | 1 |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |
| deleted_at | timestamptz | - | - |
| visibility_status | visibility_status | NOT NULL | 'draft' |
| season_tags | text[] | NOT NULL | '{}' |
| scene_tags | text[] | NOT NULL | '{}' |
| element_tags | text[] | NOT NULL | '{}' |
| recommended_tags | text[] | NOT NULL | '{}' |
| feed_score | integer | NOT NULL | 0 |
| style_id | text | FK→styles | - |
| canonical_url | text | NOT NULL | '' |
| price_type | price_type | NOT NULL | 'UNKNOWN' |
| shop_name | text | NOT NULL | '' |

唯一索引: (brand_id, canonical_name) / (source_platform, external_id) WHERE deleted_at IS NULL
索引: feed_score DESC, trgm(canonical_name), brand+sale_status, pit_type, style_id

---

### 5. styles (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| brand_id | text | FK→brands, NOT NULL | - |
| canonical_name | text | NOT NULL | - |
| category | pit_type | NOT NULL | 'OTHER' |
| sub_category | text | NOT NULL | '' |
| style_tags | text[] | NOT NULL | '{}' |
| description | text | NOT NULL | '' |
| created_at/updated_at/deleted_at | timestamptz | - | - |

唯一索引: (brand_id, canonical_name) WHERE deleted_at IS NULL

---

### 6. product_images (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| product_id | text | FK→products, NOT NULL | - |
| url | text | NOT NULL | - |
| object_key | text | - | - |
| width | integer | - | - |
| height | integer | - | - |
| file_size | integer | - | - |
| sort_order | integer | NOT NULL | 0 |
| is_cover | boolean | NOT NULL | false |
| source_url | text | NOT NULL | '' |
| phash | text | NOT NULL | '' |
| created_at | timestamptz | NOT NULL | now() |

唯一索引: (product_id, sort_order)
索引: phash WHERE phash <> ''

---

### 7. product_releases (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| product_id | text | FK→products, NOT NULL | - |
| release_name | text | NOT NULL | '' |
| release_no | integer | NOT NULL | 0 |
| release_type | release_type | NOT NULL | 'unknown' |
| sale_status | sale_status | NOT NULL | 'UPCOMING' |
| deposit_price_cents | integer | NOT NULL | 0 |
| balance_price_cents | integer | NOT NULL | 0 |
| full_price_cents | integer | NOT NULL | 0 |
| start_at/end_at/balance_due_at/ship_at | timestamptz | - | - |
| is_rerelease | boolean | NOT NULL | false |
| is_sold_out | boolean | NOT NULL | false |
| source_url | text | NOT NULL | '' |
| visibility_status | visibility_status | NOT NULL | 'draft' |
| review_status | review_status | NOT NULL | 'PENDING' |
| confidence | integer | NOT NULL | 100 |
| lifecycle_status | text | NOT NULL | 'unknown' |
| created_at/updated_at/deleted_at | timestamptz | - | - |

唯一索引: (product_id, release_no, release_type) WHERE deleted_at IS NULL AND release_no > 0

---

### 8. product_variants (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| product_id | text | FK→products, NOT NULL | - |
| name | text | NOT NULL | - |
| sku | text | NOT NULL | '' |
| color | text | NOT NULL | '' |
| size | text | NOT NULL | '' |
| price_cents | integer | NOT NULL, CHECK ≥0 | 0 |
| stock_status | text | NOT NULL | 'IN_STOCK' |
| stock_count | integer | - | - |
| created_at/updated_at | timestamptz | NOT NULL | now() |

唯一索引: (product_id, color, size)

---

### 9. product_tags (0行)

| 列名 | 类型 | 约束 |
|------|------|------|
| product_id | text | FK→products, PK |
| tag_id | text | FK→tags, PK |

---

### 10. tags (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| name | text | UNIQUE, NOT NULL | - |
| category | text | NOT NULL | 'style' |
| created_at | timestamptz | NOT NULL | now() |

---

### 11. price_snapshots (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| product_id | text | FK→products, NOT NULL | - |
| price_cents | integer | NOT NULL, CHECK ≥0 | - |
| original_price_cents | integer | NOT NULL | 0 |
| deposit_cents | integer | NOT NULL | 0 |
| balance_cents | integer | NOT NULL | 0 |
| source | text | NOT NULL | '' |
| source_url | text | NOT NULL | '' |
| fetched_at | timestamptz | NOT NULL | now() |
| created_at | timestamptz | NOT NULL | now() |
| release_id | text | - | - |

索引: (product_id, fetched_at DESC), release_id

---

### 12. sale_events (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| product_id | text | FK→products, NOT NULL | - |
| event_type | event_type | NOT NULL | - |
| title | text | NOT NULL | '' |
| description | text | NOT NULL | '' |
| start_at/end_at | timestamptz | - | - |
| deposit_amount | integer | NOT NULL, CHECK ≥0 | 0 |
| balance_amount | integer | NOT NULL, CHECK ≥0 | 0 |
| status | event_status | NOT NULL | 'UPCOMING' |
| source_id | text | FK→source_records | - |
| data_status | data_status | NOT NULL | 'FRESH' |
| review_status | review_status | NOT NULL | 'PENDING' |
| confidence | integer | NOT NULL | 100 |
| fetched_at | timestamptz | - | - |
| created_at/updated_at | timestamptz | NOT NULL | now() |

---

### 13. source_records (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| source_type | data_source | NOT NULL | - |
| source_name | text | NOT NULL | '' |
| source_url | text | NOT NULL | - |
| original_id | text | NOT NULL | '' |
| raw_data_id | text | - | - |
| entity_type | text | NOT NULL | - |
| entity_id | text | NOT NULL | - |
| fetched_at | timestamptz | NOT NULL | now() |
| published_at | timestamptz | - | - |
| parser_version | text | NOT NULL | 'v1' |
| review_status | review_status | NOT NULL | 'PENDING' |
| confidence | integer | NOT NULL | 100 |
| human_modified | boolean | NOT NULL | false |
| reviewer_id | text | - | - |
| reviewed_at | timestamptz | - | - |
| created_at | timestamptz | NOT NULL | now() |

唯一索引: (source_type, original_id, entity_type, entity_id)

---

### 14. raw_data (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| source_record_id | text | FK→source_records | - |
| source_type | data_source | NOT NULL | - |
| source_url | text | NOT NULL | - |
| content_type | text | NOT NULL | 'text/html' |
| raw_content | text | NOT NULL | - |
| parsed_json | jsonb | NOT NULL | '{}' |
| http_status | integer | - | - |
| http_headers | jsonb | NOT NULL | '{}' |
| fetched_at | timestamptz | NOT NULL | now() |
| created_at | timestamptz | NOT NULL | now() |
| import_batch_id | text | FK→import_batches | - |

---

### 15. import_batches (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| source | text | NOT NULL | - |
| crawler_version | text | NOT NULL | '' |
| file_name | text | NOT NULL | '' |
| fetched_at | timestamptz | - | - |
| imported_at | timestamptz | NOT NULL | now() |
| total_records | integer | NOT NULL | 0 |
| success_records | integer | NOT NULL | 0 |
| failed_records | integer | NOT NULL | 0 |
| status | text | NOT NULL | 'pending' |
| created_at | timestamptz | NOT NULL | now() |

---

### 16. crawl_jobs (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| source_type | data_source | NOT NULL | - |
| source_url | text | NOT NULL | '' |
| status | crawl_status | NOT NULL | 'PENDING' |
| started_at/finished_at | timestamptz | - | - |
| items_total | integer | NOT NULL | 0 |
| items_success | integer | NOT NULL | 0 |
| items_failed | integer | NOT NULL | 0 |
| items_skipped | integer | NOT NULL | 0 |
| error_message | text | - | - |
| parser_version | text | NOT NULL | 'v1' |
| trigger | text | NOT NULL | 'manual' |
| created_at | timestamptz | NOT NULL | now() |
| crawl_mode | crawl_mode | NOT NULL | 'incremental' |

---

### 17. crawl_records (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| job_id | text | FK→crawl_jobs, NOT NULL | - |
| source_type | data_source | NOT NULL | - |
| source_url | text | NOT NULL | - |
| external_id | text | NOT NULL | '' |
| status | crawl_status | NOT NULL | 'PENDING' |
| entity_type | text | - | - |
| entity_id | text | - | - |
| dedup_action | text | NOT NULL | 'insert' |
| error_message | text | - | - |
| fetched_at | timestamptz | - | - |
| created_at | timestamptz | NOT NULL | now() |

---

### 18. brand_crawl_policies (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| brand_id | text | FK→brands, NOT NULL | - |
| source_type | text | NOT NULL | 'OFFICIAL' |
| source_url | text | NOT NULL | '' |
| crawl_enabled | boolean | NOT NULL | false |
| incremental_interval_hours | integer | NOT NULL | 24 |
| full_interval_days | integer | NOT NULL | 30 |
| backfill_enabled | boolean | NOT NULL | false |
| priority | integer | NOT NULL | 0 |
| last_incremental_crawled_at | timestamptz | - | - |
| last_full_crawled_at | timestamptz | - | - |
| last_backfill_crawled_at | timestamptz | - | - |
| created_at/updated_at | timestamptz | NOT NULL | now() |

唯一索引: (brand_id, source_type)

---

### 19. brand_followers (1行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| user_id | text | FK→users, PK | - |
| brand_id | text | PK | - |
| created_at | timestamptz | NOT NULL | now() |

样例: user_id=`usr_e2e_cal_1786945204`, brand_id=`br_02597b90...`

---

### 20. community_posts (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| author_user_id | text | FK→users, NOT NULL | - |
| media_id | text | FK→media_objects, NOT NULL | - |
| image_url | text | NOT NULL | - |
| caption | text | NOT NULL | '' |
| category | text | NOT NULL, CHECK | - |
| topic | text | NOT NULL | - |
| visibility | text | NOT NULL, CHECK | 'public' |
| created_at/updated_at/deleted_at | timestamptz | - | - |
| product_id | text | - | - |

category CHECK: JK / LOLITA / HANFU / MIXED
visibility CHECK: public / private

---

### 21. community_post_likes (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| post_id | text | FK→community_posts, PK | - |
| user_id | text | FK→users, PK | - |
| created_at | timestamptz | NOT NULL | now() |

---

### 22. media_objects (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| owner_user_id | text | FK→users, NOT NULL | - |
| object_key | text | UNIQUE, NOT NULL | - |
| upload_id | text | UNIQUE, NOT NULL | - |
| purpose | text | NOT NULL | - |
| content_type | text | NOT NULL | - |
| size_bytes | integer | NOT NULL | 0 |
| uploaded_at | timestamptz | - | - |
| created_at | timestamptz | NOT NULL | now() |
| retention_until | timestamptz | - | - |
| deleted_at | timestamptz | - | - |

---

### 23. user_assets (4行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| user_id | text | FK→users, PK | - |
| asset_type | text | PK, CHECK | - |
| id | text | PK | - |
| payload_json | jsonb | NOT NULL | '{}' |
| version | bigint | NOT NULL | 1 |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |
| deleted_at | timestamptz | - | - |

asset_type CHECK: wardrobe / purchase / reminder / wish / notification
索引: (user_id, asset_type, updated_at DESC) WHERE deleted_at IS NULL

样例: user_id=`usr_e2e_cal_1786945204`, asset_type=`reminder`, title=`测试尾款提醒`, type=`BALANCE`

---

### 24. wardrobe_items (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| user_id | text | FK→users, NOT NULL | - |
| category | text | NOT NULL | - |
| title | text | NOT NULL | - |
| payload_json | jsonb | NOT NULL | '{}' |
| version | integer | NOT NULL | 1 |
| created_at | timestamptz | NOT NULL | now() |

---

### 25. wishlist_items (1行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| user_id | text | FK→users, NOT NULL | - |
| title | text | NOT NULL | - |
| status | text | NOT NULL, CHECK | - |
| payload_json | jsonb | NOT NULL | '{}' |
| version | integer | NOT NULL | 1 |
| created_at | timestamptz | NOT NULL | now() |
| product_id | text | - | - |
| release_id | text | - | - |
| note | text | NOT NULL | '' |
| updated_at | timestamptz | - | - |

status CHECK: WISH / WANT / WATCHING / WAIT_RELEASE / WAIT_PRICE / PURCHASED
唯一索引: (user_id, product_id) WHERE product_id IS NOT NULL

---

### 26. user_events (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| user_id | text | FK→users (nullable) | - |
| event_type | text | NOT NULL | - |
| target_type | text | NOT NULL | - |
| target_id | text | NOT NULL | '' |
| metadata | jsonb | NOT NULL | '{}' |
| created_at | timestamptz | NOT NULL | now() |

---

### 27. user_sessions (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| user_id | text | FK→users, NOT NULL | - |
| refresh_token_hash | text | NOT NULL | - |
| device_id | text | NOT NULL | '' |
| platform | text | NOT NULL | '' |
| expires_at | timestamptz | NOT NULL | - |
| revoked_at | timestamptz | - | - |
| created_at | timestamptz | NOT NULL | now() |
| last_used_at | timestamptz | NOT NULL | now() |

---

### 28. user_identities (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| user_id | text | FK→users | - |
| provider | text | PK | - |
| provider_subject | text | PK | - |
| created_at | timestamptz | NOT NULL | now() |

---

### 29. user_settings (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| user_id | text | FK→users, PK | - |
| setting_key | text | PK, CHECK | - |
| payload_json | jsonb | NOT NULL | '{}' |
| updated_at | timestamptz | NOT NULL | now() |

setting_key CHECK: budget / preferences

---

### 30. sync_operations (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| user_id | text | FK→users, PK | - |
| op_id | text | PK | - |
| device_id | text | NOT NULL | - |
| entity_type | text | NOT NULL | - |
| entity_id | text | NOT NULL | - |
| action | text | NOT NULL | - |
| payload_json | jsonb | NOT NULL | '{}' |
| result | text | NOT NULL, CHECK | - |
| server_version | bigint | NOT NULL | - |
| client_created_at | timestamptz | NOT NULL | - |
| accepted_at | timestamptz | NOT NULL | now() |

result CHECK: accepted / rejected / conflict

---

### 31. feedback_records (1行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| user_id | text | - | - |
| type | text | NOT NULL | '' |
| content | text | NOT NULL | '' |
| contact | text | NOT NULL | '' |
| images | jsonb | NOT NULL | '[]' |
| status | text | NOT NULL | 'open' |
| created_at | timestamptz | NOT NULL | now() |
| deleted_at | timestamptz | - | - |

---

### 32. ai_import_tasks (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| user_id | text | FK→users, NOT NULL | - |
| object_key | text | FK→media_objects(object_key), NOT NULL | - |
| state | text | NOT NULL | - |
| request_id | text | NOT NULL | - |
| model_provider | text | NOT NULL | - |
| model_name | text | NOT NULL | - |
| model_version | text | NOT NULL | - |
| created_at | timestamptz | NOT NULL | - |
| expires_at | timestamptz | NOT NULL | - |
| confirmed_at | timestamptz | - | - |
| target_type | text | - | - |
| target_id | text | - | - |
| media_id | text | FK→media_objects(id) ON DELETE SET NULL | - |
| task_type | text | NOT NULL | 'purchase_order' |
| source_platform | text | NOT NULL | '' |
| source_link | text | NOT NULL | '' |

---

### 33. ai_import_suggestions (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| task_id | text | FK→ai_import_tasks, PK | - |
| suggestion_json | jsonb | NOT NULL | - |
| confidence | double precision | NOT NULL | - |
| field_confidence_json | jsonb | NOT NULL | '{}' |
| evidence_json | jsonb | NOT NULL | '[]' |
| warnings_json | jsonb | NOT NULL | '[]' |

---

### 34. ai_import_confirmations (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| task_id | text | FK→ai_import_tasks, UNIQUE, NOT NULL | - |
| user_id | text | FK→users, NOT NULL | - |
| target_type | text | NOT NULL, CHECK | - |
| target_id | text | NOT NULL | - |
| confirmed_json | jsonb | NOT NULL | - |
| correction_json | jsonb | NOT NULL | - |
| op_id | text | NOT NULL | - |
| created_at | timestamptz | NOT NULL | now() |

target_type CHECK: wardrobe / wishlist / purchase
唯一索引: (user_id, op_id)

---

### 35. review_records (0行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| id | text | PK | - |
| entity_type | text | NOT NULL | - |
| entity_id | text | NOT NULL | - |
| action | text | NOT NULL | - |
| field_changes | jsonb | NOT NULL | '{}' |
| reviewer_id | text | - | - |
| reason | text | NOT NULL | '' |
| created_at | timestamptz | NOT NULL | now() |

---

### 36. schema_migrations (18行)

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| filename | text | PK | - |
| applied_at | timestamptz | NOT NULL | now() |

样例: `0001_initial.sql` → 2026-08-15

---

## 数据流关系

```
brands ──→ products ──→ product_images
                   ├──→ product_releases
                   ├──→ price_snapshots
                   ├──→ product_variants
                   ├──→ sale_events ──→ source_records ──→ raw_data
                   └──→ product_tags ──→ tags

users ──→ user_assets (wardrobe/purchase/reminder/wish/notification)
     ├──→ wishlist_items ──→ products (optional)
     ├──→ wardrobe_items
     ├──→ brand_followers ──→ brands
     ├──→ user_sessions
     ├──→ user_identities
     ├──→ user_settings
     ├──→ sync_operations
     ├──→ media_objects ──→ ai_import_tasks ──→ ai_import_suggestions
     │                                      └──→ ai_import_confirmations
     ├──→ community_posts ──→ community_post_likes
     └──→ user_events

crawl_jobs ──→ crawl_records
import_batches ──→ raw_data
brands ──→ brand_crawl_policies
brands ──→ styles ──→ products
```
