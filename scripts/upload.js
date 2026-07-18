#!/usr/bin/env node
const ci = require('/opt/HBuilderX/plugins/weapp-miniprogram-ci/node_modules/miniprogram-ci');
const path = require('path');

const project = new ci.Project({
  appid: 'wx976f673896c8b565',
  type: 'miniProgram',
  projectPath: path.resolve('/home/admin/projects/sankengcloset/unpackage/dist/dev/mp-weixin'),
  privateKeyPath: '/home/admin/projects/sankengcloset/.wechat/private.key',
  ignores: ['node_modules/**/*', '.git/**/*'],
});

ci.upload({
  project,
  version: '1.7.0',
  desc: 'V2 UX一致性修复：深色模式/Toast/晒搭→圈子/推荐偏好/衣橱筛选/信息架构',
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
