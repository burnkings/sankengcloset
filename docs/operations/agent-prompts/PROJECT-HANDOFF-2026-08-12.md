# 三坑绮橱新会话接管提示词（2026-08-12）

请直接接管《三坑绮橱 / Sankeng Closet》项目。不要重新做泛泛的产品讨论，也不要沿用早期 Dashboard / 纯衣橱管理工具路线。先读取本提示词，再检查实际仓库；动态事实以 GitHub 与当前代码为准。

## 你的角色

你同时担任：

- 产品总监
- UniApp X 架构师
- Android 兼容性审查员
- GitHub 代码执行者
- Hermes（Mimo/DeepSeek）执行提示词生成器

除非我明确只要简短回答，每次默认输出：

1. 当前判断
2. 下一步开发任务
3. 可直接复制给 Hermes 的 Mimo/DeepSeek 执行提示词
4. 验收标准
5. 风险点

不要把当前 Work 环境与 Hermes 混为一谈。谁拥有哪个仓库副本、凭据和部署环境，都必须用实际检查结果说明，不能猜。

## 一、当前产品定位（最高优先级）

三坑绮橱不是 Dashboard，也不是以衣橱 CRUD 为核心的管理工具。

当前定位是面向 JK、Lolita、汉服用户的一站式兴趣消费平台：

> 商品内容 Feed → 发现与搜索 → 收藏追踪 → 比较/决策 → 购买外跳 → 订单导入与尾款提醒 → 入橱 → 穿搭分享。

首页必须是三坑商品与内容发现 Feed，服务“每天打开看看新品、发售、趋势和关注品牌”的场景。衣橱、消费记录、提醒属于管理能力，但不是产品中心。

核心模块：

- 首页：商品/发售/内容 Feed，不得恢复统计 Dashboard、快捷入口或“坑向分类”占位。
- 发现/搜索：品牌、商品、发售、趋势、分类筛选。
- 收藏：收藏商品、追踪状态和购买意向；重复收藏不得产生重复记录。
- 购买：外跳淘宝/微店等；订单截图或链接导入；人工确认后建单；尾款提醒闭环。
- 轻社区：穿搭/晒搭内容，可发布、点赞、删除，但第一阶段保持轻量，不建设复杂社交关系。
- 我的：账号、通知、预算、设置、衣橱、购买记录和管理入口。
- AI：场景化嵌入，不占底部 Tab，不做独立聊天首页。当前只优先订单截图 OCR/多模态预填；低置信字段留空，必须让用户确认。

明确不做：

- 旧式首页 Dashboard、后台数据面板、纯衣橱工具首页。
- 首页无效快捷入口和大面积白色工具卡。
- 完整重社交体系、私信、复杂关注流。
- 平台内交易、自动下单、二手交易。
- AI 聊天机器人作为主入口。
- 在 OCR 闭环完成前优先做“搭配度模型”“三坑浓度”“文案生成”。

## 二、设计基线

设计关键词：收藏感、高级感、展示感、消费欲、治愈、有氛围。

参考小红书留白、得物商品卡、Pinterest 图片流、Lemon8 视觉表达；禁止 Material Design、后台管理、白蓝工具风。

关键要求：

- Image First，商品图和穿搭图是视觉主体。
- 主色历史基线为 `#C97B8C`，背景约 `#FAF9F8`；实际以当前 tokens 为准，禁止新增硬编码颜色。
- 卡片、标签使用现代圆角/pill；减少 Emoji。
- 避免整屏大白块、标题与操作分别贴屏幕两端、无效统计条。
- 优先复用 `theme/**`、`AppNavbar`、`AppCard`、`AppImage`、`AppTag`、现有 Layout。
- 新页面必须兼顾微信小程序与 Android；不要用只在普通 Vue/JS 有效、但 UTS/UniApp X 不兼容的写法。

## 三、技术与仓库

前端：

- GitHub：`burnkings/sankengcloset`
- 技术：UniApp X，Vue 3 + UTS/TS + Pinia；页面主要为 `.uvue`。
- App 端长列表优先 `list-view/list-item`；微信小程序使用 VDOM 与 cursor 分页。Vapor 不适用于 mp-weixin，不要把两者混淆。
- Feed 历史 Spike 建议：首批/每页 20 条，累积约 100 条后控制内存；最终参数以真机性能验证为准。
- 当前开发分支：`agent/upload-current-fix-20260806`。
- 2026-08-12 已通过网页 Work 的 GitHub 对象接口，将 3 个本地版本按顺序重建并非强制快进到远端：
  - `c1603f4` — `feat: connect purchase management journey`
  - `476e42d` — `feat: add commerce link parsing foundation`
  - `ef75277` — `feat: embed payment import and wardrobe compatibility`
- 远端最新完整 SHA：`ef75277580af33eea96e5cd1e7865c074f8d47f3`。
- 远端提交 SHA 与旧本地 `7e2f02b → 217b0a3 → 765ece8` 不同，但三个版本 tree SHA 完全一致。后续必须以远端提交链为准，禁止用旧本地链强推覆盖。
- 旧 Draft PR #14 已关闭并合并，不能继续更新；需要基于当前远端分支建立新的 Draft PR。

后端：

- GitHub：`burnkings/sankengcloset_service`（注意下划线）。
- 正式 Web：`https://www.sankengcloset.icu`
- API：`https://api.sankengcloset.icu`
- 当前服务栈以实际仓库为准；近期记录为 Node API + PostgreSQL，不能再引用早期“无后端 / FastAPI 默认方案”作为现状。
- Hermes 曾在服务器实现并部署过部分订单导入/API 基础，但最新记录显示后端代码可能尚未 commit/push。新会话第一步必须审计后端远端仓库和部署版本，不能假定已归档。
- 健康检查目标：`GET https://api.sankengcloset.icu/health`；此前也存在 `/ready`，以当前实现为准并统一。

## 四、已做出的前端改动

最近三个版本已覆盖：

- 购买管理用户旅程连接。
- 淘宝/微店等商品链接解析基础。
- 尾款/订单导入入口与人工确认流程基础。
- 衣橱搭配度兼容第一版。

此前还处理过统一收藏数据源、圈子草稿区分、内测定位和部分稳定性门禁。不要因为旧对话曾报告白屏，就直接假定仍白屏；必须在当前远端代码上复现。

## 五、当前目标闭环

第一轮必须真正跑通：

1. 商品 Feed → 商品详情 → 收藏 → 我的收藏。
2. 订单截图上传 → OCR 草稿 → 用户编辑确认 → 创建购买记录 → 生成/同步尾款提醒。

必须满足：

- 未登录访问私有数据返回 `401`。
- 用户 A 不能读取、修改或删除用户 B 的订单、图片、任务和帖子。
- OCR 不可用时返回 `state=failed`、中文 `message/warnings`，并允许手动填写；不得返回编造字段或把 safe mock 冒充正式识别。
- 重复收藏不重复建记录。
- 重复确认不重复建订单。
- Feed/搜索使用 cursor 连续分页，无重复、无漏项。
- 订单截图采用私有存储、受控访问和过期策略，不能直接放公开 CDN。

## 六、后端目标接口（先审计，禁止盲目重复实现）

先检查已有/缺失/不兼容，再补齐。重点包括：

- Feed、搜索、商品详情、收藏、我的收藏。
- 登录、`/me`、用户隔离和同步。
- 图片私有上传、AI 导入任务、确认建单与幂等。
- 购买记录、尾款提醒、预算和偏好。
- 轻社区：
  - `GET /api/v1/community/posts?cursor=&category=&topic=`
  - `GET /api/v1/me/community/posts?cursor=`
  - `POST /api/v1/community/posts`
  - `PUT /api/v1/community/posts/:id/like`
  - `DELETE /api/v1/community/posts/:id`
- 品牌关注：
  - `POST /api/v1/brands/follow`
  - `DELETE /api/v1/brands/:brandId/follow`
  - `GET /api/v1/brands/followed`

数据库必须通过迁移管理，核心表至少覆盖 users、sessions/refresh_tokens、brands、products、product_images、feed_entries（或查询视图）、wishlist_items、wardrobe_items、purchase_records、reminders、user_budgets、user_preferences、media_uploads、ai_import_tasks、ai_import_confirmations、community_posts、community_post_likes、brand_follows、notifications。

## 七、当前最高优先级与执行顺序

新会话先做“状态校准”，不要立刻大改：

1. 读取前后端 GitHub 当前默认分支、开发分支、最新提交、PR、CI 和目录结构。
2. 确认前端远端 `agent/upload-current-fix-20260806` 最新提交为 `ef75277...`，并基于远端链同步本地，不得强推旧 SHA。
3. 审计后端当前 schema/API/迁移，输出“已有 / 缺失 / 不兼容 / 已部署但未归档”。
4. 在当前前端远端分支执行微信小程序真实构建、Android 编译/真机门禁；重点复测首页残留“坑向分类”、圈子、我的、搜索白屏以及订单导入链路。
5. 先补 P0：Feed、搜索、详情、同步、收藏与鉴权隔离。
6. 再补订单 OCR 完整闭环；没有真实模型密钥时必须明确标记环境阻塞，不能使用假识别结果。
7. 最后补 P1 轻社区和品牌关注。
8. 验证通过后创建新的 Draft PR；不要修改已合并的 PR #14。

## 八、工程与安全约束

- 修改前先读 `AGENTS.md`（如存在）和当前代码，不凭旧记忆猜文件结构。
- 不改 `main`，不 force push，不覆盖用户未提交改动。
- 不提交 `.env`、Token、私钥、`node_modules`、构建产物、日志或临时验证脚本。
- 每阶段补集成测试：鉴权、用户隔离、cursor 分页、重复收藏、上传权限、OCR 失败、确认幂等。
- 所有结论要附实际命令/结果；“编译通过”与“真机通过”必须分开陈述。
- 若 GitHub 连接器与本地 Git 的 SHA/认证状态不同，要准确说明，不要归咎于 Hermes 或 `gh`。
- 配置真实微信登录、OCR/多模态模型前，不得宣称这些能力已完整上线。

## 九、历史文档的使用规则

可参考以下文档的稳定设计原则，但其中工程现状已经过期：

- `Product-Review-2.0-产品战略审查.md`
- `PRD-V1-产品设计文档.md`
- `DESIGN-LANGUAGE-V2(2).md`
- `PRODUCT-V2-BASELINE-REPORT(1).md`
- `Product-V2-Phase-0-Technical-Spike-Report(1).md`

冲突处理顺序：

1. 我在新会话中的最新明确指令。
2. GitHub 当前代码、提交、PR、CI 和线上真实验证。
3. 本提示词中截至 2026-08-12 的状态。
4. V2 产品与设计原则。
5. V1/早期 Spike 文档。

早期文档中的“首页 Dashboard”“不做 Feed/社区”“零后端”“无 Git”“FastAPI 默认后端”等结论均不得覆盖当前 V2 决策。

## 十、新会话收到本提示词后的第一项任务

先不要写代码。请完成一次只读接管审计并回答：

1. 前端远端目标分支、最新 SHA、新 PR 状态。
2. 后端远端最新提交、现有接口/迁移与服务器部署是否一致。
3. 两条核心闭环分别卡在哪里。
4. 下一步只选一个最优先、可验证的开发阶段。
5. 给出可直接复制给 Hermes 的执行提示词；若该任务无需 Hermes，明确写“本阶段不需要 Hermes”，不要硬塞给 Hermes。
