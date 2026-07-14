#!/usr/bin/env python3
"""Post-compile patch: inject ALL missing globals into vendor.js.
HBuilderX 5.21 alpha does NOT bundle these when compiling UniApp X -> mp-weixin:
  - createSSRApp (from vue)
  - createPinia (from pinia)
  - defineStore (from pinia)
Also fixes app.js bare function references -> common_vendor. prefix.

CRITICAL: storeToRefs is NOT injected. No compiled files use it, and injecting
it causes ReferenceError because WeChat's module system doesn't support function
hoisting. See skill SKILL.md §18e for full explanation.

Usage: python3 patch-vendor.py [dist-directory]
"""
import sys, os

DIST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "unpackage", "dist", "dev", "mp-weixin"
)
VENDOR = os.path.join(DIST, "common", "vendor.js")
APP_JS = os.path.join(DIST, "app.js")

if not os.path.exists(VENDOR):
    print(f"[FAIL] vendor.js not found: {VENDOR}")
    sys.exit(1)

with open(VENDOR) as f:
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

# 2b. storeToRefs — DISABLED
# No compiled files use storeToRefs (source files use direct store.xxx access).
# Injecting it causes ReferenceError because WeChat module system doesn't hoist
# function declarations. Also toRef is missing from vendor.js.
# See skill SKILL.md §18e for full explanation.

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
    print("[PATCH] defineStore (+ globalThis fallback)")

# 3b. Patch native createPinia to hook globalThis.__pinia
if "function createPinia" in v and "globalThis.__pinia" not in v:
    # Use flexible matching — the line may have varying indentation
    v = v.replace(
        "app.config.globalProperties.$pinia = pinia;",
        "app.config.globalProperties.$pinia = pinia;\n        globalThis.__pinia = pinia;",
        1  # only first occurrence (inside createPinia)
    )
    changes += 1
    print("[PATCH] createPinia: globalThis.__pinia hook")

# 4. Add missing exports (NO storeToRefs — not needed, causes ReferenceError)
missing = []
if "exports.createSSRApp" not in v:
    missing.append("exports.createSSRApp = createSSRApp;")
if "exports.createPinia" not in v:
    missing.append("exports.createPinia = createPinia;")
# storeToRefs export DISABLED — see §18e in SKILL.md
# if "exports.storeToRefs" not in v and "function storeToRefs(" in v:
#     missing.append("exports.storeToRefs = storeToRefs;")
if missing:
    v = _insert_before_exports(v, "\n" + "\n".join(missing))
    changes += 1
    for e in missing:
        print(f"[PATCH] export {e.partition('=')[0].strip()}")

with open(VENDOR, "w") as f:
    f.write(v)
print(f"[OK] vendor.js: {changes} change(s)")

# 5. Fix app.js bare references
if os.path.exists(APP_JS):
    with open(APP_JS) as f:
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
        with open(APP_JS, "w") as f:
            f.write(a)
print("[DONE]")
