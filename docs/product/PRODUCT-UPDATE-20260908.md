# 前端与数据更新

## 已落地的商品模型

以 `services/mock/mock-catalog.uts` 的 MockCatalogProduct 和现有 ProductDetailModel 为准。撤销独立 catalog 子模型；继续读取 title、images、description、priceCents、priceType、colorTags、currentRelease 等已有字段，增加可选 shopName 用于未知品牌时显示店铺。

用户采集 Excel 只有「商品」一张表：名称、链接、店铺、坑向、图片必填；全价、销售状态、品牌、分类、颜色、说明选填。首图为封面，同格换行放多图。复杂价格、系列、尺码和发货信息写说明；不要求 SKU、编号或多表关联。未知价格不当作免费，未知品牌不以店铺名自动建立，历史预售日期不当成当前活动。

后端使用 PostgreSQL 的现有 products、product_images、brands 和 product_releases / sale_events。0015_product_source 只补店铺名、允许品牌为空及未知销售状态。用户收藏、动态、衣橱、提醒和同步沿用原有服务与表。完整字段映射见后端 docs/PRODUCT-INTAKE.md。

## 本轮界面修改

- 首页等页面共用商品卡：图片后先显示两行以内标题，再显示品牌；收藏按钮加主题背景，复杂图片上仍可辨认；图片复用 AppImage 的加载/失败处理。
- 发现：热榜、上新榜、收藏榜都有入口和简短区别说明；去掉无操作的专题「查看更多」；专题横向容器随内容数量伸展；品牌简介为空时隐藏；榜单颜色响应深色模式。
- 动态：去掉占据首屏的介绍文案，筛选从左排列；无匹配结果可清除筛选；动态卡去掉重复描边。
- 衣橱：筛选无结果时可清除关键词、分类和未穿条件；保留已有排序与分类功能。
- 我的：删除设置列表末尾空白条目。

方向是图片优先、标题清晰、少容器嵌套、操作有效。保留本产品配色与图标，不复制第三方品牌界面。没有为填满页面而捏造真实用户收藏量或品牌介绍。

## 验证与边界

本轮 `npm run check` 中源码、Android 静态检查通过；总门禁因缺少 `unpackage/dist/dev/mp-weixin/app.js` 编译产物未通过。后端上一轮 228 项测试通过、1 项跳过。此环境不能代替 HBuilderX 的 Android / 微信小程序编译及真机截图验收。远程代码推送不等于服务部署，数据库迁移需在目标环境执行。

后端正确仓库是 burnkings/sankengcloset_service。此前用 sankengcloset-service 调用导致 404，不应据此判断公开仓库不可访问。
