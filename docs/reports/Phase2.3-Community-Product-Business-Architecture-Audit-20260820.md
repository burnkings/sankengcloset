# Phase 2.3 Community → Product — Business & Architecture Audit

日期：2026-08-20
基线：Phase 2.1 / 2.2-A / 2.2-B 全 PASS（203 passed / 66 Query Matrix）
性质：纯业务+架构审计（零代码零数据库零 migration 零 commit）
结论：**PASS**（审计完成；推荐最小方案 = 单 product_id 闭环，见 §8）

---

## 1. 当前社区系统全貌

```
圈子 Gallery（轻量穿搭灵感，非重社交）

后端（sankengcloset_service）：
  GET  /api/v1/community/posts            公开流（category/topic 筛选，游客可读）
  GET  /api/v1/me/community/posts         我的发布
  POST /api/v1/community/posts            发布（需登录 + outfit 图片）
  GET  /api/v1/community/posts/:id        详情（游客可读）
  PUT  /api/v1/community/posts/:id/like   点赞
  DELETE /api/v1/community/posts/:id      删除（仅作者）
  swagger-docs.ts：community tag 已注册

前端（sankengcloset）：
  pages/community/index.uvue  圈子 Gallery（筛选 + 双列 NoteCard）
  pages/community/mine.uvue   我的发布
  pages/share/create.uvue     发布页（图片 + 说明 + 坑向 + 话题 + 衣橱单品选择）
  stores/content-library-store.uts   PublicLookPost / publishOutfitRemote
  services/user-data/user-data-service.uts  createCommunityPostRemote

存储：
  community_posts 表 + community_post_likes 表 + media_objects（purpose=outfit）
```

## 2. 当前数据模型（生产库 127.0.0.1:5433 实测 \d）

```sql
community_posts (
  id text PK,
  author_user_id text NOT NULL FK users ON DELETE CASCADE,
  media_id text NOT NULL FK media_objects ON DELETE RESTRICT,
  image_url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (JK/LOLITA/HANFU/MIXED),
  topic text NOT NULL,
  visibility text NOT NULL DEFAULT 'public' CHECK (public/private),
  created_at / updated_at / deleted_at timestamptz
)
索引：pkey / author_idx(author_user_id, created_at DESC) / public_idx(category, topic, created_at DESC)
```

**无 product_id 列。无任何商品关联字段。**

community_post_likes：post_id / user_id / created_at（无多余字段）
media_objects：id/owner_user_id/object_key/upload_id/purpose/content_type/size_bytes/…（**无 metadata 列**）

## 3. 当前发布链路（真实代码逐段核对）

```
share/create.uvue
  publishLook() → library.publishOutfitRemote(image, caption, category, topic, wardrobeIds)
    → uploadOutfitImageRemote（POST /uploads:prepare purpose=outfit → PUT 二进制）
    → createCommunityPostRemote({ mediaId, caption, category, topic, wardrobeIds })
      → POST /api/v1/community/posts
  backend: postCreateSchema = z.object({ mediaId, caption(≤600), category(enum), topic(≤80) })
  → repository.createCommunityPost → INSERT community_posts
未登录：saveOutfit 本地草稿（outfit_ 前缀，登录后同步队列重放）
```

**发现：前端 payload 含 wardrobeIds，但后端 zod schema 无此字段（默认 strip 丢弃）→ 衣橱关联实际未持久化**。发布页展示"已选 N 件衣橱单品"但服务端不保存——前端 UI 与后端契约不一致（衣橱单品本身也无 product_id，见 §7）。

## 4. 当前商品关联能力

| 通道 | 是否存在 | 证据 |
|---|---|---|
| community_posts.product_id 列 | ❌ | \d 实测无 |
| productId / sourceRecordId | ❌ | contracts.CreateCommunityPostInput 无 |
| metadata / content JSON | ❌ | media_objects 无 metadata；community_posts 无 jsonb |
| tags / mention | ❌ | caption 纯文本，topic 为固定话题 |
| URL | ❌ | image_url 仅图片 |
| wardrobeIds（前端传） | ⚠️ 假关联 | 前端传但后端 schema strip 丢弃，未落库 |
| wishlist_items.product_id | ✅ 旁路 | 收藏链路有 product_id，但社区不读 |

**结论：当前社区内容零商品关联能力。**

## 5. Product ↔ Community 断点（逐题回答）

- Q1 数据模型：见 §2，11 列纯内容字段，无商品锚点。
- Q2 隐式商品关联：**无**。唯一旁路是 wishlist_items.product_id（收藏链路），社区与商品无任何共享通道。
- Q3 发布流程：§3 全链路已列出。
- Q4 发布时能否选商品：**不能**。只能选「衣橱单品」（wardrobe），且该选择未持久化；无商品搜索/收藏选择器。
- Q5 商品详情能否看社区返图：**不能**。detail.uvue 无 community/返图/测评/买家 任何模块（grep 0 命中）。
- Q6 社区内容能否跳商品详情：**不能**。community/index.uvue 帖子点击仅 previewPostImage（预览大图）。
- Q7 Feed 是否消费社区：**部分接口占位，实际为空**。
  - 前端：CHANNELS 含「穿搭」，channelCode('穿搭')→'outfit'，FEED_OUTFIT 类型已定义
  - 后端：listFeed `if (query.channel === 'outfit') clauses.push(sql`false`)` —— **outfit 频道强制空**
- Q8 是否存在双向链路：**不存在**。Product 不消费 Community，Community 不指向 Product。

## 6. 真实用户场景

| # | 场景 | 当前能力 | 缺口 |
|---|---|---|---|
| 1 | 晒已购买 JK 商品 | 只能发图+坑向 | 无法关联该商品 |
| 2 | Lolita 上身返图 | 只能发图 | 无法跳商品详情 |
| 3 | 汉服穿搭 | 只能发图 | 无商品锚点 |
| 4 | 商品测评 | 只能文字+图 | 测评无对象 |
| 5 | 尺码/面料体验 | 同上 | 无法挂商品 |
| 6 | 购买体验 | 同上 | 无法挂商品 |
| 7 | 普通闲聊 | ✅ 可发（topic/category） | 无需商品 |
| 8 | 非商品内容 | ✅ 可发 | 无需商品 |
| 9 | 一帖一商品 | ❌ | 无字段 |
| 10 | 一帖多商品 | ❌ | MVP 不做（P2） |

**MVP 判断：只允许单 product_id（可空）。** 用户心智是"晒这件商品"；多商品是 P2 增强，不做前瞻设计。

## 7. 实体边界方案对比

| 方案 | 关联对象 | 用户价值 | 数据准确性 | 复杂度 | 维护 | 商品历史/再贩 | 同款不同色 | 同款不同链接 | 评价 |
|---|---|---|---|---|---|---|---|---|---|
| A | CommunityPost → Product | 高（晒的就是商品） | 高（商品可追踪） | 低 | 低 | 中（链接失效需保留） | 中（不同色=不同 product 或同 style） | 中（不同链接=不同 product） | ✅ **MVP 推荐** |
| B | → Style | 中（款式聚合） | 中（无法到具体商品） | 中 | 中 | 低（再贩同 style） | 高（同款同 style） | 高 | ❌ MVP 不选（无法表达"买的这件"） |
| C | → Product + Style | 高 | 高 | 中 | 中 | 中 | 高 | 高 | P2 增强（product_id 可经 style_id 聚合，无需双字段） |
| D | → Release | 低（批次概念用户不感知） | 高（精确批次） | 中 | 高（批次易过期） | 高（首发/再贩分开） | 中 | 中 | ❌（Release 生命周期短，返图应长存） |
| E | → Product + Release | 高 | 高 | 中高 | 高 | 高 | 中 | 中 | ❌ MVP 过重（Release 绑定会让历史内容随批次失效） |

**推荐：方案 A（单 product_id，nullable）**。理由：
- 返图锚定"商品"（用户购买的实际对象），Product 是 Feed/收藏/购买/提醒链路的汇聚点，闭环最短
- 同款不同色/不同链接 = 不同 product，天然可区分；需要款式聚合时经 products.style_id（Phase 2.1 已建）JOIN 即可，**不需要在社区表冗余 style_id**
- 不绑定 Release：再贩/首发共享返图（用户看"这商品"的所有返图，不看"这批次"），且 Release 有生命周期，绑定会造成历史内容漂移
- product_id 可空：不知道准确商品时先发普通内容（场景 7/8）

## 8. 推荐最小方案（Community → Product → Detail 闭环）

```
数据：migration 0012（本阶段只设计不执行）
  ALTER TABLE community_posts ADD COLUMN product_id text NULL REFERENCES products(id);
  CREATE INDEX community_posts_product_idx ON community_posts (product_id)
    WHERE deleted_at IS NULL AND product_id IS NOT NULL;

API：
  POST /api/v1/community/posts  body 增加可选 productId（zod optional，校验存在性）
  GET  /api/v1/products/:id/community?cursor=&limit=  商品返图列表（author/images/caption/created_at/likes）
    或 detail 内嵌 communityPreview（首屏 3 条）
  GET  /api/v1/community/posts/:id 响应增加 productId（跳转用）

前端：
  share/create.uvue：新增「关联商品（可选）」选择器（从收藏/搜索选，替代无用的衣橱选择）
  product/detail.uvue：新增「真实买家」模块（返图横滑，点击进社区/大图）
  community/index.uvue：NoteCard 支持 product 角标 + 点击跳商品详情

兼容：product_id 可空 → 旧帖/闲聊帖不受影响；Feed 不加（见 §13）
```

## 9. API 变化建议（P1，实施阶段执行）

| 变化 | 说明 |
|---|---|
| postCreateSchema + productId | z.string().optional()，服务端校验商品存在且 published（避免挂幽灵商品） |
| CreateCommunityPostInput + productId | contracts 类型同步 |
| GET /products/:id/community | 分页返图流（cursor keyset，按 created_at desc） |
| CommunityPost 响应 + productId | 帖子详情/列表返回商品锚点（null 兼容） |
| 删除商品时 | products 为软删除（deleted_at），FK 不破坏；社区帖保留显示"已下架" |

## 10. 前端变化建议（P1）

- **发布页商品选择器**：从「收藏的商品」（wishlist 本地已有）或搜索选择，替代当前无效的衣橱选择；未选 = 普通内容
- **Product Detail「真实买家」模块**：位置建议在「同款式」模块之后、价格/发售信息之前（或底部"买家返图"独立 section）；数据 = post id/author/images/caption/created_at/likes
- **社区卡片商品角标**：有 productId 的帖子显示商品名 + 可点跳转
- 明确不做：评论、私信、关注流、创作者主页

## 11. 数据迁移建议

**生产库 community_posts 当前 0 条**（实测 count(*) = 0）→ **无需 backfill，无存量风险**。

- 总帖子数：0
- 可识别商品关联：0
- 无法关联：0

实施时仅需：migration 0012 加列 + 索引（纯增量，幂等）。未来若 Product 被合并/删除：
- 软删除 → 帖保留（product_id 指向软删商品，展示兜底"已下架"）
- 合并 → 提供 UPDATE 映射脚本（旧 product_id → 新 product_id），按需执行，不自动跑

## 12. Product Detail 社区展示建议

| 项 | 建议 |
|---|---|
| 模块名 | 「真实买家」/「真人返图」（三坑语境强） |
| 位置 | 「同款式」模块之后（商品信息完整后，返图作为社会证明收尾） |
| 数据 | post id / author nickname / images（多图横滑）/ caption / created_at / likes / product_id |
| 空态 | 无返图时不渲染模块（同 Phase 2.1「同款式」模式，不占位） |
| 交互 | 点击进帖子详情 / 大图预览；暂不做评论/关注 |
| 排序 | created_at desc（最新返图）或 likes 加权（P2） |

## 13. Feed 是否接入

**结论：P1 阶段不接入，P2 再评估。**
- 应该：社区内容是"真实买家轻内容"，是 Feed 个性化的重要信号，且前端 CHANNELS/feed-item 已预留 outfit 类型、channelCode 已映射
- 但 MVP 最小闭环（§8）先打通 Product ↔ Detail，Feed 混排涉及 feedType 扩展、rank 归一、商品去重、缓存失效，复杂度不成比例
- 后端 listFeed 的 outfit 分支已强制 false（显式占位），前端「穿搭」频道保持空态展示，不阻塞
- P2 接入时：FeedItem 新增 FEED_OUTFIT 类型（feedType/entityId=post id/productId 可选/author/images/caption/likeCount），rank 与商品流统一

## 14. 明确不做的功能（本阶段及 P1 范围外）

- 社区评论 / 回复 / 私信 / 群聊 / 好友
- 创作者实体 / 内容实体 / product mention 实体 / 知识图谱
- 多商品关联（一帖多商品）
- 人工补关联运营后台
- 社区搜索
- Release 绑定返图
- Style 冗余关联字段（经 products.style_id 聚合即可）
- 完整社交 Timeline

## 15. P0 / P1 / P2

### P0 必须修
**无。** 当前社区可发可看可点赞，无崩溃无数据风险；商品关联是能力缺口而非故障。

### P1 建议修（最小闭环，实施阶段范围）
1. migration 0012：community_posts.product_id（nullable + 部分索引）
2. API：postCreateSchema.productId 可选 + GET /products/:id/community + CommunityPost 响应带 productId
3. 前端：发布页「关联商品」选择器（替代无效衣橱选择） + Product Detail「真实买家」模块 + 社区卡片商品跳转
4. 契约同步：contracts.ts / postgres.ts / memory.ts / 前端 service/store 类型

### P2 后续优化
- Feed「穿搭」频道真实接入（FEED_OUTFIT 混排）
- 人工补关联（运营后台/帖子编辑）
- 多商品关联（一帖多商品）
- 返图按点赞/热度排序
- 商品合并时的 community_posts.product_id 迁移脚本

### 无需处理
- Release 绑定、Style 冗余、社交图谱、评论体系（明确不做）

## 16. 最终判断

**PASS**（审计完成，最小方案可行）

- Q1「返图属于商品还是款式」→ 属于商品（用户买的是商品）；款式聚合经 style_id JOIN 实现，不在社区表冗余
- Q2 同款不同色 → 关联具体 product（不同色不同链接即不同 product）；同款聚合走 style_id
- Q3 首发/再贩 → **不绑定 Release**（返图长存，Release 生命周期短）
- Q4 链接失效 → 软删除保留帖，展示兜底
- Q5 Product 合并 → 提供 UPDATE 映射脚本，不自动跑
- Q6 不知道准确商品 → 允许先发普通内容（product_id 可空）
- Q7 人工补关联 → P2 运营后台
- Q8 Product Community Feed → 需要；P2 接入 Feed 前先做 Detail 内嵌（P1）
- 数据迁移 → 0 条存量，仅加列+索引，无 backfill

---

## 审计证据汇总

- 生产库 \d community_posts / community_post_likes / media_objects / wardrobe_items / user_assets / v_content_feed（真实 schema）
- 生产库 community_posts count(*) = 0（真实数据量）
- routes/user-data.ts community 路由 + postCreateSchema（真实 API）
- contracts.ts CommunityPost/CreateCommunityPostInput（真实类型，无 productId）
- postgres.ts communityPage/createCommunityPost/listFeed（outfit 强制 false）
- memory.ts createCommunityPost（同构）
- pages/share/create.uvue / community/index.uvue / stores/content-library-store.uts / home-feed-store.uts / domain/content/feed-item.uts / services/content/feed-service.uts（真实前端链路）
- swagger-docs.ts community tag（API 文档已注册）

报告：docs/reports/Phase2.3-Community-Product-Business-Architecture-Audit-20260820.md

停止。未修改任何代码/数据库/migration。未进入 Phase 2.3 Implementation，等待产品指令。
