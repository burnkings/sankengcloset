#!/usr/bin/env node
/**
 * V2.6 Android 静态检查
 * - 正式 Manifest 不得全局允许 cleartext HTTP（beta 配置隔离）
 * - 生产 API 走 HTTPS
 */
const fs = require('node:fs')

const manifest = fs.readFileSync('manifest.json', 'utf8')
const nativeManifest = fs.readFileSync('nativeResources/android/AndroidManifest.xml', 'utf8')
const networkConfig = fs.readFileSync('nativeResources/android/res/xml/sankeng_network_security_config.xml', 'utf8')
const betaConfig = fs.readFileSync('nativeResources/android/res/xml/sankeng_beta_network_security_config.xml', 'utf8')
const runtime = fs.readFileSync('config/runtime.uts', 'utf8')
const detail = fs.readFileSync('pages/product/detail.uvue', 'utf8')
const detailStore = fs.readFileSync('stores/product-detail-store.uts', 'utf8')
const service = fs.readFileSync('services/content/product-service.uts', 'utf8')
const layout = fs.readFileSync('components/layout/MainLayout.uvue', 'utf8')
const theme = fs.readFileSync('theme/use-theme.uts', 'utf8')

const checks = [
  ['beta version', manifest.includes('"versionName" : "2.5.0-beta.2"') && manifest.includes('"versionCode" : "25002"')],
  ['Vapor enabled', manifest.includes('"vapor" : true')],
  ['Android network permission', nativeManifest.includes('android.permission.INTERNET')],
  ['release cleartext disabled', !nativeManifest.includes('android:usesCleartextTraffic="true"')],
  ['release uses secure network config', nativeManifest.includes('@xml/sankeng_network_security_config')],
  ['secure config forbids cleartext', networkConfig.includes('cleartextTrafficPermitted="false"')],
  ['beta config isolated (not referenced by release manifest)', !nativeManifest.includes('sankeng_beta_network_security_config') && betaConfig.includes('cleartextTrafficPermitted="true"')],
  ['production API base URL', runtime.includes("apiBaseUrl: string = 'https://api.sankengcloset.icu'")],
  ['remote detail service', service.includes('/api/v1/products/') && detailStore.includes('fetchProductDetail') && detail.includes('productDetailStore.load')],
  ['multi-image detail', detail.includes('detailImages') && detail.includes('<swiper')],
  ['Android-safe root layout', !layout.includes("height: '100vh'") && !layout.includes("height: '0'") && layout.includes('getWindowHeight')],
  ['theme chrome limited to supported platform', theme.includes('#ifdef MP-WEIXIN') && theme.includes('#endif') && theme.includes('setNavigationBarColor')],
]
let failed = false
for (const [name, ok] of checks) {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}`)
  if (!ok) failed = true
}
if (failed) process.exit(1)
