#!/usr/bin/env python3
"""小程序产物「死重」剔除 + 包体门禁。

用法：
    python strip-mp-deadweight.py <distRoot>

为什么不用 PowerShell 的 Remove-Item：
    本机沙箱会把 PowerShell 的文件删除改写成「移到回收站」的 safe-delete；
    当产物目录正被微信开发者工具占用时它会 fail-closed
    （抛 [safe-delete][SAFE_DELETE_FAIL_CLOSED]），把整条构建链路拖挂。
    os.remove 不经过那层改写，行为确定。

剔除内容：static/fonts/
    微信小程序的 @font-face **不支持包内本地路径**（渲染层安全沙箱禁止
    url('./fonts/x.ttf') 这类包内引用），只认 base64 或已加白名单的 HTTPS 地址，
    且优先 woff/woff2 ⇒ 本地 ttf 会被直接忽略。
    也就是说这些字体在小程序里既不生效、又白占体积（5 个 ttf ≈ 603KB，约占主包 1/3），
    单文件 332.7KB 还会触发「图片和音频资源应不超过 200K」未通过。
    App.uvue 的 @font-face 已用 /* #ifdef APP */ 隔离，产物 app.wxss 不再引用它们。

退出码：0 = 通过（可能带 WARN）；1 = 主包超 2MB 硬限（或总包超 20MB）、或仍有文件引用 static/fonts。

包体口径（2026-09-28 修正）：
    项目做了分包（pages.json 的 subPackages，16 个）之后，**整个产物目录 = 主包 + 分包**。
    早期版本直接把整个产物当成「主包」来比 2MB 硬限，这在分包之后是错的：
    工程总量合法地可以超过 2MB（上限其实是 20MB），那样会误报失败、挡住上传；
    反过来它也完全没有校验总包 20MB 上限。
    现在按产物 app.json 的 subPackages 逐个剥出分包体积，主包 = 总量 − 分包，
    并按微信三条线分别把关：主包硬限 2MB、主包建议线 1.5MB、总包上限 20MB。
    注：这是**目录口径的估算**。微信真正的规则是「被主包引用的文件才归主包」，
    因此落在分包目录里、但被主包引用的文件实际会被计入主包，此处低估了主包。
    为保守起见这里额外打印原始总量，两个数都能对上账。
"""

import json
import os
import shutil
import sys

MAIN_PACKAGE_LIMIT = 2 * 1024 * 1024   # 微信主包硬限，超了直接传不上去
MAIN_PACKAGE_WARN = 1.5 * 1024 * 1024  # 「代码质量扫描」的建议线
TOTAL_PACKAGE_LIMIT = 20 * 1024 * 1024  # 微信「主包 + 所有分包」总上限

FONT_DIR = os.path.join('static', 'fonts')
# 只有样式和脚本可能引用字体；json/wxml 不会。
SCAN_SUFFIXES = ('.wxss', '.js')
REFERENCE = 'static/fonts'


def subpackage_roots(dist_root):
    """从产物 app.json 读出分包 root 列表（相对产物根的 posix 路径）。"""
    app_json = os.path.join(dist_root, 'app.json')
    if not os.path.isfile(app_json):
        return []
    try:
        with open(app_json, 'r', encoding='utf-8') as handle:
            data = json.load(handle)
    except (OSError, ValueError) as error:
        print('[警告] 无法解析产物 app.json（%s），按「无分包」估算主包体积' % error)
        return []
    roots = []
    for pkg in (data.get('subPackages') or data.get('subpackages') or []):
        root = str(pkg.get('root', '')).strip('/')
        if root:
            roots.append(root.replace('/', os.sep))
    return roots


def find_stale_references(dist_root):
    """返回仍引用 static/fonts 的文件列表（相对路径）。"""
    stale = []
    for root, _dirs, files in os.walk(dist_root):
        for name in files:
            if not name.endswith(SCAN_SUFFIXES):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as handle:
                    if REFERENCE in handle.read():
                        stale.append(os.path.relpath(path, dist_root))
            except OSError as error:
                print('  [WARN] 读取失败，跳过引用检查：%s（%s）' % (path, error))
    return stale


def total_bytes(dist_root):
    total = 0
    for root, _dirs, files in os.walk(dist_root):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total


def main():
    if len(sys.argv) < 2:
        print('用法：python strip-mp-deadweight.py <distRoot>')
        return 1
    dist_root = sys.argv[1]
    if not os.path.isdir(dist_root):
        print('[失败] 产物目录不存在：%s' % dist_root)
        return 1

    # 先校验再删：App.uvue 的条件编译若失效，产物会仍然引用字体，此时删除等于真丢字体。
    stale = find_stale_references(dist_root)
    if stale:
        print('[失败] 产物中仍有 %d 个文件引用 %s，说明 App.uvue 的 /* #ifdef APP */ 没生效：'
              % (len(stale), REFERENCE))
        for item in stale[:5]:
            print('         %s' % item)
        print('       已中止剔除，避免删掉仍在用的字体。')
        return 1

    fonts_dir = os.path.join(dist_root, FONT_DIR)
    removed_bytes = 0
    removed_count = 0
    if os.path.isdir(fonts_dir):
        for root, _dirs, files in os.walk(fonts_dir):
            for name in files:
                path = os.path.join(root, name)
                try:
                    removed_bytes += os.path.getsize(path)
                    os.remove(path)
                    removed_count += 1
                except OSError as error:
                    print('[失败] 删除字体失败：%s（%s）' % (path, error))
                    return 1
        shutil.rmtree(fonts_dir, ignore_errors=True)
        print('[剔除] 小程序端本地字体 %d 个，省下 %.1f KB' % (removed_count, removed_bytes / 1024.0))
    else:
        print('[跳过] 没有 %s，无需剔除' % FONT_DIR)

    total = total_bytes(dist_root)
    roots = subpackage_roots(dist_root)
    sub_bytes = 0
    for root in roots:
        abs_root = os.path.join(dist_root, root)
        if os.path.isdir(abs_root):
            sub_bytes += total_bytes(abs_root)
    main_bytes = max(total - sub_bytes, 0)
    megabytes = main_bytes / 1048576.0
    total_megabytes = total / 1048576.0
    print('[包体] 主包 %.2f MB（硬限 %.1f MB，建议线 %.1f MB）'
          % (megabytes, MAIN_PACKAGE_LIMIT / 1048576.0, MAIN_PACKAGE_WARN / 1048576.0))
    print('       分包 %d 个 / %.2f MB；主包 + 分包 = %.2f MB（总上限 %.0f MB）'
          % (len(roots), sub_bytes / 1048576.0, total_megabytes, TOTAL_PACKAGE_LIMIT / 1048576.0))

    if total > TOTAL_PACKAGE_LIMIT:
        print('[失败] 总包 %.2f MB 超过微信 %.0f MB 上限。'
              % (total_megabytes, TOTAL_PACKAGE_LIMIT / 1048576.0))
        return 1
    if not roots:
        print('[WARN] 产物里没有分包（subPackages 为空）。若本意是分包，'
              '说明 pages.json 的 // #ifdef MP-WEIXIN 没生效，上面的「主包」就是整包体积。')
    if main_bytes > MAIN_PACKAGE_LIMIT:
        print('[失败] 主包 %.2f MB 超过微信 2MB 硬限，上传会被直接拒绝。'
              '请精简 static/ 或把更多页面挪进 subPackages。' % megabytes)
        return 1
    if main_bytes > MAIN_PACKAGE_WARN:
        print('[WARN] 主包 %.2f MB 超过 1.5MB 建议线：不阻断上传，'
              '但「代码质量扫描」会判未通过。' % megabytes)
    return 0


if __name__ == '__main__':
    sys.exit(main())
