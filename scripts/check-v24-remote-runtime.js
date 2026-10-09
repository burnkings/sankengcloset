#!/usr/bin/env node
/**
 * V2.7 远程运行时契约检查
 * - 验证**只有微信登录**这一条真实登录链路（「仅在本机使用」/mock 会话已删除，不得复活）
 * - 验证 401 刷新单飞锁（apiGetAuthorized / refreshWithSingleFlight）
 * - 验证 Feed opaque cursor（不再用 pageIndex × 20 伪造）
 * - 验证同步策略（直接远程写 + 失败才入队，flush 重放真实 CRUD）
 * - 验证收藏：下架/失效的商品仍要展示（快照补齐），不得再从列表里消失
 */
const fs = require('fs')

const required = {
  'config/runtime.uts': ['DATA_MODE_REMOTE', 'saveSessionTokens'],
  'services/platform/api-client.uts': ['apiGetAuthorized', 'apiPostAuthorized', 'refreshWithSingleFlight', "apiPost('/api/v1/sessions/refresh'", "'/health'", 'apiErrorStatus'],
  'services/content/feed-service.uts': ['/api/v1/feed', 'mapFeedItem', 'cursor'],
  'services/sync/write-back.uts': ['syncWriteBack', 'await remoteCall()', 'enqueueLocalOperation', '失败入队'],
  'services/sync/local-sync-queue.uts': ['replayOperation', 'replayFavorite', 'apiPostAuthorized', 'apiPatchAuthorized', 'apiDeleteAuthorized', 'replayErrorResult', 'apiErrorStatus', 'uni.getNetworkType'],
  'stores/session-store.uts': ["'/api/v1/sessions/wechat'", 'loginWithWechat', 'clearSessionTokens', 'saveSessionTokens', 'flushLocalOperations'],
  'stores/home-feed-store.uts': ['nextCursor', 'MAX_FEED_ITEMS', '_requestSeq'],
  // 收藏：快照是「已下架仍能展示」的唯一数据来源，删了就等于把下架商品重新变成空壳
  'stores/favorite-store.uts': ['listWishlistRemote', 'queueFavorite', 'refreshRemoteFavorites', 'refreshFavorites', 'FavoriteSnapshot', 'rememberFavoriteSnapshot', 'favoriteSnapshotOf', 'placeholderFavorite'],
  'stores/community-store.uts': ['isRemote', 'refreshPublicPosts'],
  'services/user-data/user-data-service.uts': ["'/api/v1/wishlist'", 'addWishlistRemote', 'deleteWishlistRemote', 'createCommunityPostRemote', 'uploadOutfitImageRemote'],
  'domain/purchase-record.uts': ['arrivalDate', 'wishId', 'wardrobeId'],
  'stores/purchase-store.uts': ['syncPurchaseReminders', 'removePurchaseLinkedReminders', 'linkWardrobe', 'monthlyCommitted', 'monthlyPaid', 'monthlyOutstanding'],
  'stores/reminder-store.uts': ['syncPurchaseReminders', 'removePurchaseLinkedReminders', 'relatedPurchaseId', '预计到货后可一键入橱'],
  'pages/wardrobe/edit.uvue': ['purchaseId', 'wishId', 'linkWardrobe'],
  'pages/budget/index.uvue': ['recordsForMonth', 'monthlyPaid(monthCursor', 'monthlyOutstanding(monthCursor'],
  'services/ai/purchase-import-service.uts': ["'/api/v1/ai/import-tasks'", "'/api/v1/uploads:prepare'", 'purchase_order', 'confirmPurchaseImport'],
  'pages/purchase/import.uvue': ['尾款一键入库', 'aiImportStore.analyzePurchase', '手动补全', '识别并确认'],
  'stores/ai-import-store.uts': ['analyzePurchaseScreenshot', 'analyzePurchase'],
  // 搭配度：2026-09-14 用户决定整体下线（算法为启发式 v1，等排期重做），
  // 故不再断言 services/ai/wardrobe-compatibility-service.uts 与详情页的搭配度文案。
  'pages.json': ['"pagePath": "pages/favorites/index"', '"text": "收藏"'],
}
const notAllowed = {
  'config/runtime.uts': ['setRuntimeMode', 'setApiBaseUrl', 'setMockOnline', 'setMockLatency', 'DATA_MODE_LOCAL', 'DATA_MODE_MOCK', 'isLocalMockSession'],
  'stores/sync-store.uts': ['setMockOnline'],
  // 2026-09-30：「仅在本机使用」删除。它是没有 token 的假登录态，留着会伪装成已登录并把
  // demo_* 假商品当收藏（收藏页全部 404 显示「已下架」）。核心实现与开关都不许再出现。
  'stores/session-store.uts': ['loginPreview', 'localAssetsPending', 'markLocalAssetsQueued', "'/api/v1/sessions/dev'", "saveSessionTokens('mock", 'loginMock', 'mock_user_local', "SESSION_MODE_MOCK"],
  'services/content/feed-service.uts': ['__DEV__', 'pageIndex'],
  'pages/product/detail.uvue': ["'/api/v1/wishlist'"],
  'pages/favorites/index.uvue': ['远程收藏数据获取将在后续迭代中集成', 'recommendationProducts'],
  'pages/budget/index.uvue': ['monthSpent'],
  'pages.json': ['"text": "绮灵AI"'],
}
let failed = false
for (const [file, needles] of Object.entries(required)) {
  if (!fs.existsSync(file)) { console.error(`[FAIL] missing ${file}`); failed = true; continue }
  const text = fs.readFileSync(file, 'utf8')
  for (const needle of needles) if (!text.includes(needle)) { console.error(`[FAIL] ${file} missing ${needle}`); failed = true }
}
for (const [file, needles] of Object.entries(notAllowed)) {
  if (!fs.existsSync(file)) { console.error(`[FAIL] missing ${file}`); failed = true; continue }
  const text = fs.readFileSync(file, 'utf8')
  for (const needle of needles) if (text.includes(needle)) { console.error(`[FAIL] ${file} still contains ${needle}`); failed = true }
}
if (failed) process.exit(1)
console.log('[PASS] V2.7 runtime contract checks — wechat-only login (no local mock session), 401 single-flight refresh, opaque cursor, unified write strategy, delisted favorites still rendered from local snapshot')

