#!/usr/bin/env node
const fs = require('node:fs')

const manifest = fs.readFileSync('manifest.json', 'utf8')
const nativeManifest = fs.readFileSync('nativeResources/android/AndroidManifest.xml', 'utf8')
const networkConfig = fs.readFileSync('nativeResources/android/res/xml/sankeng_beta_network_security_config.xml', 'utf8')
const runtime = fs.readFileSync('config/runtime.uts', 'utf8')
const detail = fs.readFileSync('pages/product/detail.uvue', 'utf8')
const service = fs.readFileSync('services/content/product-service.uts', 'utf8')
const layout = fs.readFileSync('components/layout/MainLayout.uvue', 'utf8')
const theme = fs.readFileSync('theme/use-theme.uts', 'utf8')

const checks = [
  ['beta version', manifest.includes('"versionName" : "2.5.0-beta.2"') && manifest.includes('"versionCode" : "25002"')],
  ['Vapor enabled', manifest.includes('"vapor" : true')],
  ['Android network permission', nativeManifest.includes('android.permission.INTERNET')],
  ['cleartext explicitly beta-only', nativeManifest.includes('android:usesCleartextTraffic="true"') && networkConfig.includes('cleartextTrafficPermitted="true"')],
  ['production API base URL', runtime.includes("apiBaseUrl: string = 'https://api.sankengcloset.icu'")],
  ['remote detail service', service.includes('/api/v1/products/') && detail.includes('fetchProductDetail')],
  ['multi-image detail', detail.includes('detailImages') && detail.includes('<swiper')],
  ['Android-safe root layout', !layout.includes("height: '100vh'") && !layout.includes("height: '0'" ) && layout.includes('getWindowHeight')],
  ['theme chrome limited to supported platform', theme.includes('// #ifdef MP-WEIXIN\n  const palette') && theme.includes('// #endif\n}')],
]
let failed = false
for (const [name, ok] of checks) {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}`)
  if (!ok) failed = true
}
if (failed) process.exit(1)
