#!/usr/bin/env python3
"""
Post-compile verification for UniApp X -> mp-weixin output (V3).

历史背景:
  HBuilderX 5.21 alpha 编译 UniApp X -> mp-weixin 时曾缺失 createSSRApp /
  createPinia / defineStore 全局，且 stores/ 使用 pinia defineStore 时产物
  出现裸调用，需要注入兼容补丁（旧版本脚本负责注入）。

V3 现状（2026-08-13 实测，HBuilderX 5.23 干净编译）:
  - stores/ 已全部改为 reactive 模块级单例，产物中零 defineStore 引用。
  - vendor.js 由编译器正确输出 `exports.createSSRApp`，app.js 以
    `common_vendor.createSSRApp` 带前缀调用。
  - components/v2/ 已删除，产物中不再有任何 v2 编译文件。
  因此全部 Pinia 注入与 defineStore 绑定补丁已失效，本脚本不再注入任何代码，
  只对真实编译产物做幂等校验；校验失败时给出明确修复指引而不是写文件。

Usage: python3 patch-vendor.py [dist-directory]
Exit code 0 = 产物无需补丁且结构符合 V3 预期; 1 = 校验失败。
"""
import sys, os, glob

DIST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "unpackage", "dist", "dev", "mp-weixin"
)
VENDOR = os.path.join(DIST, "common", "vendor.js")
APP_JS = os.path.join(DIST, "app.js")
STORES_DIR = os.path.join(DIST, "stores")

failures = []

if not os.path.exists(VENDOR):
    print(f"[FAIL] vendor.js not found: {VENDOR}（请先执行 HBuilderX mp-weixin 编译）")
    sys.exit(1)

with open(VENDOR, encoding="utf-8") as f:
    v = f.read()

# 1. createSSRApp 必须由编译器导出（V3 门禁：不再注入）
if "exports.createSSRApp" not in v:
    failures.append("vendor.js 缺少 exports.createSSRApp（HBuilderX 5.23 应原生输出；若缺失说明编译器回退，需升级而非注入补丁）")

# 2. app.js 必须以 vendor 前缀调用 createSSRApp（禁止裸引用）
if os.path.exists(APP_JS):
    a = open(APP_JS, encoding="utf-8").read()
    if "createSSRApp(" in a and ".createSSRApp(" not in a:
        failures.append("app.js 存在裸 createSSRApp 调用（应形如 common_vendor.createSSRApp）")
else:
    failures.append(f"app.js not found: {APP_JS}")

# 3. 产物中禁止残留 defineStore / createPinia（V3 stores 为 reactive 单例）
if "defineStore" in v or "createPinia" in v:
    failures.append("vendor.js 仍含 defineStore/createPinia（V3 stores 已不用 pinia，出现即编译缓存残留，请删除 unpackage/dist 后重新编译）")

# 4. stores 产物禁止裸 defineStore；home-feed-store 必须是 reactive 单例
if os.path.isdir(STORES_DIR):
    for js_path in glob.glob(os.path.join(STORES_DIR, "*.js")):
        content = open(js_path, encoding="utf-8").read()
        base = os.path.basename(js_path)
        if "defineStore(" in content:
            failures.append(f"{base} 仍引用 defineStore（应改为 reactive 模块级单例）")
    home_store = os.path.join(STORES_DIR, "home-feed-store.js")
    if os.path.exists(home_store):
        if "reactive" not in open(home_store, encoding="utf-8").read():
            failures.append("home-feed-store.js 缺少 reactive 单例绑定")
    else:
        failures.append("stores/home-feed-store.js 编译产物缺失")
else:
    failures.append(f"stores/ 编译产物目录缺失: {STORES_DIR}")

# 5. 产物禁止出现已删除的 components/v2（防旧产物/旧引用混入）
v2_artifacts = glob.glob(os.path.join(DIST, "components", "v2", "*.js"))
if v2_artifacts:
    failures.append(f"产物仍含已删除的 components/v2 编译文件: {[os.path.basename(p) for p in v2_artifacts]}")

if failures:
    for f_ in failures:
        print(f"[FAIL] {f_}")
    sys.exit(1)

print(f"[OK] mp-weixin 产物 V3 结构校验通过（无需补丁）: {DIST}")
