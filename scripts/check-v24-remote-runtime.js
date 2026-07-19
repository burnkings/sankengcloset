#!/usr/bin/env node
const fs = require('fs')

const required = {
  'config/runtime.uts': ['setApiBaseUrl', 'saveSessionTokens', 'DATA_MODE_REMOTE'],
  'services/platform/api-client.uts': ["apiGet", "apiPostAuthorized", "refreshRemoteSession", "'/health'"],
  'services/content/feed-service.uts': ['/api/v1/feed', 'mapFeedItem', 'DATA_MODE_REMOTE'],
  'services/sync/local-sync-queue.uts': ["'/api/v1/sync/operations:batch'", 'receipts', 'apiPostAuthorized'],
  'stores/session-store.uts': ["'/api/v1/sessions/dev'", 'loginWithRuntime', 'saveSessionTokens'],
  'pages/sync/index.uvue': ['保存并检查连接', 'Fastify API', 'testApiConnection'],
}
let failed = false
for (const [file, needles] of Object.entries(required)) {
  if (!fs.existsSync(file)) { console.error(`[FAIL] missing ${file}`); failed = true; continue }
  const text = fs.readFileSync(file, 'utf8')
  for (const needle of needles) if (!text.includes(needle)) { console.error(`[FAIL] ${file} missing ${needle}`); failed = true }
}
if (failed) process.exit(1)
console.log('[PASS] V2.4 remote runtime contract checks')
