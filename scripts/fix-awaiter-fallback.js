#!/usr/bin/env node
/**
 * fix-awaiter-fallback.js —— 给产物里的 async 包装器加「接收者兜底」
 *
 * 背景（2026-10-06 实测定案）：
 *   uni-app x 把每个 async 函数编译成 `<模块别名>.__awaiter(this, void 0, void 0, function* () {…})`，
 *   其中 `<模块别名>` 是 `require("…/common/vendor.js")` 被压缩成的一个字母（e / t / n …）。
 *   压缩器是**按作用域**取名的，所以「同名局部变量出现在 async 函数体内部」在纯 JS 语义下完全合法。
 *   但微信开发者工具的「ES6 转 ES5」（Babel + regenerator）会再改写一遍产物，
 *   改写后那个局部变量的作用域上移，**把包装器里的模块别名遮蔽掉** ⇒ 包装器求值时接收者是 undefined
 *   ⇒ 真机/模拟器报 `Cannot read properties of undefined (reading '__awaiter')`，
 *   首页 store 捕获后显示成「加载失败」。
 *
 *   实证：release（压缩）产物必现；dev（未压缩，别名是 common_vendor 长名）不复现。
 *
 * 做法：把 `<别名>.__awaiter(` 改写成 `(<别名> || require("<同文件里的 vendor 路径>")).__awaiter(`。
 *   · 正常情况 `<别名>` 有值，`||` 短路，语义完全不变；
 *   · 被遮蔽时回退到 vendor 模块，照样拿到 helper；
 *   · 幂等：已改写过的不会再改。
 *
 * 用法: node scripts/fix-awaiter-fallback.js <dist-dir> [--check]
 *   --check 只检查不改，发现未加兜底就 exit 1（给门禁用）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const dist = process.argv[2] || 'unpackage/dist/build/mp-weixin';
const checkOnly = process.argv.includes('--check');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

let patchedFiles = 0;
let patchedCalls = 0;
const problems = [];

for (const file of walk(dist)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('__awaiter')) continue;
  // vendor.js 自己是 helper 的定义处（`exports.__awaiter = …`），没有接收者，跳过。
  if (path.relative(dist, file).replace(/\\/g, '/') === 'common/vendor.js') continue;
  // 本文件里 vendor 的 require 路径（取第一个）
  const reqRe = /require\(\s*(["'])((?:\.\.?\/)*common\/vendor\.js)\1\s*\)/;
  const reqMatch = reqRe.exec(src);
  if (!reqMatch) {
    problems.push(`${path.relative(dist, file)}: 含 __awaiter 但找不到 vendor require`);
    continue;
  }
  const vendorPath = reqMatch[2];
  // 声明到的别名
  const aliasRe = new RegExp(
    '([A-Za-z_$][\\w$]*)\\s*=\\s*require\\(\\s*(["\'])' + vendorPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\2\\s*\\)',
    'g'
  );
  const aliases = new Set();
  let m;
  while ((m = aliasRe.exec(src))) aliases.add(m[1]);
  if (!aliases.size) {
    problems.push(`${path.relative(dist, file)}: 含 __awaiter 但没解析出 vendor 别名`);
    continue;
  }
  let out = src;
  for (const alias of aliases) {
    const callRe = new RegExp('(?:\\b(?:' + alias + '))\\s*\\.\\s*__awaiter\\s*\\(', 'g');
    const bare = new RegExp('\\b' + alias + '\\.__awaiter\\s*\\(', 'g');
    let hits = 0;
    out = out.replace(callRe, (matched, offset) => {
      // 已经是兜底写法的直接跳过（幂等）
      const before = out.slice(Math.max(0, offset - alias.length - 14), offset);
      if (/\|\|\s*require\([^)]*\)\)\s*$/.test(before)) return matched;
      hits++;
      return `(${alias}||require("${vendorPath}")).__awaiter(`;
    });
    if (hits) {
      void bare;
      patchedCalls += hits;
    }
  }
  if (out !== src) {
    patchedFiles++;
    if (!checkOnly) fs.writeFileSync(file, out);
  }
}

if (checkOnly) {
  if (patchedCalls || problems.length) {
    for (const p of problems) console.log('[FAIL] ' + p);
    if (patchedCalls) console.log(`[FAIL] ${patchedCalls} 处 __awaiter 缺少接收者兜底（共 ${patchedFiles} 个文件），请跑 node scripts/fix-awaiter-fallback.js <dist>`);
    process.exit(1);
  }
  console.log('[PASS] __awaiter 接收者兜底已全部就位');
  process.exit(0);
}

for (const p of problems) console.log('[WARN] ' + p);
console.log(`[OK] 已为 ${patchedCalls} 处 __awaiter 调用加接收者兜底（${patchedFiles} 个文件）`);
