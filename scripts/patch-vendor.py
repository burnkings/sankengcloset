#!/usr/bin/env python3
"""Post-compile patch: inject ALL missing globals into vendor.js.
HBuilderX 5.21 alpha does NOT bundle these when compiling UniApp X -> mp-weixin:
  - createSSRApp (from vue)
  - createPinia (from pinia)
  - defineStore (from pinia)

HBuilderX 5.21 alpha 兼容措施 (临时):
  WeChat 小程序模块系统中 globalThis 赋值不可靠。
  patch 会同时：
  1. 在 vendor.js 中定义 defineStore 并 exports
  2. 在每个使用裸 defineStore 的 Store 文件中注入本地绑定
     dev 格式: 在 require 行后插入 `var defineStore = common_vendor.defineStore;`
     build 格式: 替换 `=defineStore(` 为 `=<var>.defineStore(`
  3. 幂等：通过标记注释/替换检查防止重复插入

Usage: python3 patch-vendor.py [dist-directory]
"""
import sys, os, re, glob

DIST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "unpackage", "dist", "dev", "mp-weixin"
)
VENDOR = os.path.join(DIST, "common", "vendor.js")
APP_JS = os.path.join(DIST, "app.js")
STORES_DIR = os.path.join(DIST, "stores")

if not os.path.exists(VENDOR):
    print(f"[FAIL] vendor.js not found: {VENDOR}")
    sys.exit(1)

with open(VENDOR, encoding="utf-8") as f:
    v = f.read()

changes = 0


def _insert_before_exports(code, new_block):
    """Insert new_block just before the last export line (exports.watch = watch;)."""
    watch_line_marker = "exports.watch = watch;"
    if watch_line_marker not in code:
        last_export = code.rfind("exports.")
        if last_export < 0:
            return code + new_block
        nl = code.find("\n", last_export)
        if nl < 0:
            return code + "\n" + new_block
        return code[:nl] + new_block + code[nl:]
    nl = code.find("\n", code.rfind(watch_line_marker))
    return code[:nl] + new_block + code[nl:]


# 1. createSSRApp
if "function createApp$1" not in v and "exports.createSSRApp" not in v:
    block = """

function createApp$1(rootComponent, rootProps) {
  rootComponent && (rootComponent.mpType = "app");
  return createVueApp(rootComponent, rootProps).use(plugin);
}
const createSSRApp = createApp$1;
"""
    v = _insert_before_exports(v, block)
    changes += 1
    print("[PATCH] createSSRApp")

# 2. createPinia (only if missing)
if "function createPinia" not in v and "exports.createPinia" not in v:
    block = """

function createPinia() {
  const scope = effectScope(true);
  const state = scope.run(() => ref({}));
  let _p = [], toBeInstalled = [];
  const pinia = markRaw({
    install(app) { pinia._a = app; app.provide(piniaSymbol, pinia);
      app.config.globalProperties.$pinia = pinia;
      toBeInstalled.forEach(p => _p.push(p)); toBeInstalled = []; },
    use(p) { (this._a ? _p : toBeInstalled).push(p); return this; },
    _p, _a: null, _e: scope, _s: new Map(), state });
  return pinia;
}
"""
    v = _insert_before_exports(v, block)
    changes += 1
    print("[PATCH] createPinia")

# 3. defineStore
if "function defineStore(" not in v:
    block = """

function defineStore(idOrOptions, setup, setupOptions) {
  var id, opts, isSetup = typeof setup === 'function';
  if (typeof idOrOptions === 'string') { id = idOrOptions; opts = isSetup ? setupOptions : setup; }
  else { opts = idOrOptions; id = idOrOptions.id; isSetup = !opts.state; }
  function useStore(pinia) {
    var ap = pinia;
    if (!ap) try { var ci = getCurrentInstance && getCurrentInstance();
      if (ci && ci.appContext && ci.appContext.app._context && ci.appContext.app._context.provides) {
        var sym = Object.getOwnPropertySymbols(ci.appContext.app._context.provides)
          .find(function(s) { return s.toString().indexOf('pinia') >= 0; });
        if (sym) ap = ci.appContext.app._context.provides[sym]; }
    } catch(e) {}
    if (!ap && typeof globalThis !== 'undefined' && globalThis.__pinia) {
      ap = globalThis.__pinia;
    }
    if (!ap) { console.warn('[Pinia] no active Pinia'); return {}; }
    if (!ap._s.has(id)) {
      var r = isSetup ? setup() : (typeof opts === 'function' ? opts() : opts);
      r.$id = id; r.$pinia = ap;
      r.$patch = function(p) { if (typeof p === 'function') p(store);
        else for (var k in p) store[k] = p[k]; };
      r.$subscribe = function() { return function(){}; };
      r.$onAction = function() { return function(){}; };
      r.$reset = function(){}; r.$dispose = function(){};
      var store = new Proxy(r, {
        get: function(t, k) {
          if (k === '$id'||k==='$pinia'||k==='$patch'||k==='$subscribe'||k==='$onAction'||k==='$reset'||k==='$dispose') return t[k];
          if (typeof k === 'symbol' || k === 'toJSON' || k === 'constructor') return t[k];
          var v = t[k];
          if (v && typeof v === 'object' && v.__v_isRef) v = v.value;
          if (v && typeof v === 'object' && !Array.isArray(v) && !v.__v_isRef && !v.__v_isReactive)
            try { return reactive(v); } catch(e) { return v; }
          return v;
        },
        set: function(t, k, v) {
          var e = t[k];
          if (e && typeof e === 'object' && e.__v_isRef) { e.value = v; return true; }
          t[k] = v; return true;
        }
      });
      for (var k in r) { if (typeof r[k] === 'function' && k[0] !== '$') (function(k,fn){ r[k]=function(){return fn.apply(store,arguments);}; })(k, r[k]); }
      ap._s.set(id, store);
    }
    return ap._s.get(id);
  }
  useStore.$id = id;
  return useStore;
}
;(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global)).defineStore = defineStore;
"""
    v = _insert_before_exports(v, block)
    changes += 1
    print("[PATCH] defineStore")

# 3b. Patch native createPinia to hook globalThis.__pinia
if "function createPinia" in v and "globalThis.__pinia" not in v:
    v = v.replace(
        "app.config.globalProperties.$pinia = pinia;",
        "app.config.globalProperties.$pinia = pinia;\n        globalThis.__pinia = pinia;",
        1
    )
    changes += 1
    print("[PATCH] createPinia: globalThis.__pinia hook")

# 4. Add missing exports
missing = []
if "exports.createSSRApp" not in v:
    missing.append("exports.createSSRApp = createSSRApp;")
if "exports.createPinia" not in v:
    missing.append("exports.createPinia = createPinia;")
if "exports.defineStore" not in v:
    missing.append("exports.defineStore = defineStore;")
if missing:
    v = _insert_before_exports(v, "\n" + "\n".join(missing))
    changes += 1
    for e in missing:
        print(f"[PATCH] export {e.partition('=')[0].strip()}")

with open(VENDOR, "w", encoding="utf-8", newline="\n") as f:
    f.write(v)
print(f"[OK] vendor.js: {changes} change(s)")

# 5. Fix app.js bare references
if os.path.exists(APP_JS):
    with open(APP_JS, encoding="utf-8") as f:
        a = f.read()
    fx = 0
    if "const app = createSSRApp(" in a:
        a = a.replace("const app = createSSRApp(", "const app = common_vendor.createSSRApp(")
        fx += 1
        print("[FIX] app.js: createSSRApp")
    if "const pinia = createPinia()" in a:
        a = a.replace("const pinia = createPinia()", "const pinia = common_vendor.createPinia()")
        fx += 1
        print("[FIX] app.js: createPinia")
    if fx:
        with open(APP_JS, "w", encoding="utf-8", newline="\n") as f:
            f.write(a)

# 6. Patch Store files: bind defineStore from vendor import
#    HBuilderX 5.21 alpha 兼容：编译器输出裸 defineStore() 调用，
#    但 WeChat 模块系统中 globalThis 赋值不可靠。
#    两种策略：
#    A. dev (多行): 在 require 行后插入 `var defineStore = <vendor>.defineStore;`
#    B. build (单行压缩): 替换 `=defineStore(` 为 `=<vendor>.defineStore(`
BIND_MARKER = "/* patch-vendor: defineStore bound */"
store_patched = 0
if os.path.isdir(STORES_DIR):
    for js_path in glob.glob(os.path.join(STORES_DIR, "*.js")):
        with open(js_path, encoding="utf-8") as f:
            content = f.read()
        if BIND_MARKER in content:
            continue  # already patched
        if "defineStore(" not in content:
            continue  # doesn't use defineStore

        # Find the vendor import variable name
        m = re.search(r'const\s+(\w+)\s*=\s*require\("\.\./common/vendor\.js"\)', content)
        if not m:
            print(f"[WARN] {os.path.basename(js_path)}: cannot find vendor import, skipping")
            continue
        vendor_var = m.group(1)

        # Check if already uses prefixed form (e.g. e.defineStore or common_vendor.defineStore)
        if f"{vendor_var}.defineStore(" in content:
            continue

        line_count = content.count("\n") + 1
        if line_count <= 2:
            # Strategy B: single-line minified — replace bare defineStore( with <var>.defineStore(
            # Only replace the store creation call, not exports.defineStore
            # Pattern: =defineStore( (assignment context, not exports.)
            # Use negative lookbehind to avoid matching exports.defineStore
            new_content = re.sub(
                r'(?<!exports\.)(?<!\w)defineStore\(',
                f'{vendor_var}.defineStore(',
                content,
                count=1  # only first occurrence (the store creation)
            )
            if new_content != content:
                with open(js_path, "w", encoding="utf-8", newline="\n") as f:
                    f.write(new_content)
                store_patched += 1
                print(f"[FIX] {os.path.basename(js_path)}: defineStore -> {vendor_var}.defineStore (minified)")
        else:
            # Strategy A: multi-line — insert binding after vendor require
            lines = content.split("\n")
            inject_idx = -1
            for i, line in enumerate(lines):
                if f'{vendor_var} = require("../common/vendor.js")' in line:
                    inject_idx = i
                    break
            if inject_idx >= 0:
                inject = f'{BIND_MARKER}\nvar defineStore = {vendor_var}.defineStore;'
                lines.insert(inject_idx + 1, inject)
                with open(js_path, "w", encoding="utf-8", newline="\n") as f:
                    f.write("\n".join(lines))
                store_patched += 1
                print(f"[FIX] {os.path.basename(js_path)}: defineStore bound from {vendor_var}.defineStore")

if store_patched:
    print(f"[OK] {store_patched} store file(s) patched")
else:
    print("[OK] no store files need defineStore binding")

print("[DONE]")
