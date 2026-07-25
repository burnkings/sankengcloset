#!/usr/bin/env node
const fs = require('fs')

const required = {
  'config/runtime.uts': ['DATA_MODE_REMOTE', 'saveSessionTokens'],
  'services/platform/api-client.uts': ["apiGet", "apiPostAuthorized", "refreshRemoteSession", "'/health'"],
  'services/content/feed-service.uts': ['/api/v1/feed', 'mapFeedItem'],
  'services/sync/local-sync-queue.uts': ["'/api/v1/sync/operations:batch'", 'receipts', 'apiPostAuthorized'],
  'stores/session-store.uts': ["'/api/v1/sessions/dev'", 'loginWithRuntime', 'saveSessionTokens'],
}
const notAllowed = {
  'config/runtime.uts': ['setRuntimeMode', 'setApiBaseUrl', 'setMockOnline', 'setMockLatency', 'DATA_MODE_LOCAL', 'DATA_MODE_MOCK'],
  'stores/sync-store.uts': ['setMockOnline'],
  'stores/session-store.uts': ['loginPreview', 'localAssetsPending', 'markLocalAssetsQueued'],
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
console.log('[PASS] V2.5 runtime contract checks — mock/local modes fully removed')
