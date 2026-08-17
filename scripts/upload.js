#!/usr/bin/env node
const ci = require('/opt/HBuilderX/plugins/weapp-miniprogram-ci/node_modules/miniprogram-ci');
const path = require('path');

// 敏感信息从环境变量读取，禁止硬编码 appid / 私钥路径
const appid = process.env.MP_APPID || '';
const privateKeyPath = process.env.MP_PRIVATE_KEY || '';
if (!appid || !privateKeyPath) {
  console.error('[FAIL] 缺少环境变量 MP_APPID / MP_PRIVATE_KEY，请配置后重试');
  process.exit(1);
}

const project = new ci.Project({
  appid,
  type: 'miniProgram',
  projectPath: path.resolve(process.env.MP_DIST_DIR || 'unpackage/dist/dev/mp-weixin'),
  privateKeyPath,
  ignores: ['node_modules/**/*', '.git/**/*'],
});

ci.upload({
  project,
  version: process.env.MP_VERSION || '1.8.0',
  desc: process.env.MP_DESC || '',
  setting: {
    es6: true,
    minify: false,
    autoPrefixWXSS: false,
  },
}).then(res => {
  console.log('[OK] Upload success:', JSON.stringify(res));
  process.exit(0);
}).catch(err => {
  console.error('[FAIL] Upload error:', err.message || err);
  process.exit(1);
});
