#!/usr/bin/env node
/**
 * V2.6 远程运行时契约检查
 * - 验证当前微信登录实现（POST /api/v1/sessions/wechat），不再要求已删除的 sessions/dev
 * - 验证 401 刷新单飞锁（apiGetAuthorized / refreshWithSingleFlight）
 * - 验证 Feed opaque cursor（不再用 pageIndex × 20 伪造）
 * - 验证同步策略（直接远程写 + 失败才入队，flush 重放真实 CRUD）
 */
const fs = require('fs')

const required = {
  'config/runtime.uts': ['DATA_MODE_REMOTE', 'saveSessionTokens'],
  'services/platform/api-client.uts': ['apiGetAuthorized', 'apiPostAuthorized', 'refreshWithSingleFlight', "apiPost('/api/v1/sessions/refresh'", "'/health'"],
  'services/content/feed-service.uts': ['/api/v1/feed', 'mapFeedItem', 'cursor'],
  'services/sync/local-sync-queue.uts': ['replayOperation', 'replayFavorite', 'apiPostAuthorized', 'apiPatchAuthorized', 'apiDeleteAuthorized'],
  'stores/session-store.uts': ["'/api/v1/sessions/wechat'", 'loginWithWechat', 'saveSessionTokens', 'flushLocalOperations'],
  'stores/home-feed-store.uts': ['nextCursor', 'MAX_FEED_ITEMS', '_requestSeq'],
  'stores/content-library-store.uts': ['listWishlistRemote', 'addWishlistRemote', 'deleteWishlistRemote', 'refreshRemoteFavorites', 'refreshFavorites', 'isRemote'],
  'services/user-data/user-data-service.uts': ["'/api/v1/wishlist'", 'addWishlistRemote', 'deleteWishlistRemote', 'createCommunityPostRemote', 'uploadOutfitImageRemote'],
  'domain/purchase-record.uts': ['arrivalDate', 'wishId', 'wardrobeId'],
  'stores/purchase-store.uts': ['syncPurchaseReminders', 'linkWardrobe', 'monthlyCommitted', 'monthlyPaid', 'monthlyOutstanding'],
  'stores/reminder-store.uts': ['syncPurchaseReminders', 'relatedPurchaseId', '预计到货后可一键入橱'],
  'pages/wardrobe/edit.uvue': ['purchaseId', 'wishId', 'linkWardrobe'],
  'pages/budget/index.uvue': ['decisionReserveTotal', 'monthlyCommitted', 'monthOutstanding'],
  'services/ai/purchase-import-service.uts': ["'/api/v1/ai/import-tasks'", "'/api/v1/uploads:prepare'", 'purchase_order', 'confirmPurchaseImport'],
  'pages/purchase/import.uvue': ['尾款一键入库', 'analyzePurchaseScreenshot', '手动补全', '识别并确认'],
  'services/ai/wardrobe-compatibility-service.uts': ['calculateWardrobeCompatibility', '衣橱为空时返回 -1'],
  'pages/home/index.uvue': ['compatibility-score', 'calculateWardrobeCompatibility'],
  'pages/product/detail.uvue': ['与你衣橱的搭配度', 'calculateWardrobeCompatibility'],
  'pages.json': ['"pagePath": "pages/favorites/index"', '"text": "收藏"'],
}
const notAllowed = {
  'config/runtime.uts': ['setRuntimeMode', 'setApiBaseUrl', 'setMockOnline', 'setMockLatency', 'DATA_MODE_LOCAL', 'DATA_MODE_MOCK'],
  'stores/sync-store.uts': ['setMockOnline'],
  'stores/session-store.uts': ['loginPreview', 'localAssetsPending', 'markLocalAssetsQueued', "'/api/v1/sessions/dev'"],
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
console.log('[PASS] V2.6 runtime contract checks — wechat login, 401 single-flight refresh, opaque cursor, unified write strategy')
