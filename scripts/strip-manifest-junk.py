#!/usr/bin/env python3
"""剥掉 manifest.json 里 HBuilderX 反复写回的巨量乱码注释。

背景（2026-10-10 / 11 实测）
    `cli publish` 每次都会往 manifest.json 里写回**两行**乱码注释，
    2,765,982 + 2,832,800 字符 ≈ 16.7MB 字节。这两行是合法的 JSON5 注释
    （HBuilderX 自己读得懂、产物不受影响），但内容已多重编码、不可恢复、无任何语义，
    副作用是把一个 1.9KB 的文件撑成 16.7MB：拖慢构建、污染 git、让 diff 没法看。
    实测每 publish 一次就再写回来一次，所以必须自动剥离，而不是靠人记得清。

判据
    只删「超长单行」（默认 > 4000 字符）且**确实是注释行**（首字符序列以 /* 开头）的行。
    其余行原样保留；行尾风格（CRLF / LF）与是否带 BOM 都按原样还原。

退出码
    0 = 正常（可能什么都没删，也可能删了 N 行）
    1 = 剥离后不再是合法 JSON（注释按 JSON5 规则整体去掉后再校验；正常不会发生）
    2 = 用法错误 / 文件不存在
"""

import json
import re
import sys

MAX_LINE_CHARS = 4000


def strip_json5_comments(text: str) -> str:
    """把 JSON5 注释（// 与 /* */）整体去掉，用于剥离后做一次 JSON 合法性校验。"""
    out = []
    i = 0
    n = len(text)
    in_string = False
    while i < n:
        ch = text[i]
        if in_string:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def main() -> int:
    if len(sys.argv) != 2:
        print("用法: strip-manifest-junk.py <manifest.json>", file=sys.stderr)
        return 2

    path = sys.argv[1]
    try:
        with open(path, "rb") as handle:
            raw = handle.read()
    except FileNotFoundError:
        print(f"[strip-manifest] 文件不存在: {path}", file=sys.stderr)
        return 2

    has_bom = raw.startswith(b"\xef\xbb\xbf")
    body = raw[3:] if has_bom else raw
    text = body.decode("utf-8")
    newline = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(newline)

    kept = []
    removed = 0
    removed_chars = 0
    for line in lines:
        stripped = line.lstrip()
        is_comment = stripped.startswith("/*") or stripped.startswith("//")
        if len(line) > MAX_LINE_CHARS and is_comment:
            removed += 1
            removed_chars += len(line)
            continue
        kept.append(line)

    if removed == 0:
        print(f"[strip-manifest] 无需处理（没有超长注释行），文件 {len(raw)} 字节")
        return 0

    result = newline.join(kept)
    # 校验：去掉注释后必须是合法 JSON，否则宁可不动
    try:
        json.loads(strip_json5_comments(result))
    except Exception as error:  # noqa: BLE001 - 任何解析失败都拒绝写入
        print(f"[strip-manifest] 剥离后 JSON 不合法，已放弃写入：{error}", file=sys.stderr)
        return 1

    payload = result.encode("utf-8")
    with open(path, "wb") as handle:
        handle.write((b"\xef\xbb\xbf" if has_bom else b"") + payload)

    print(
        f"[strip-manifest] 已剥离 {removed} 行超长乱码注释"
        f"（{removed_chars} 字符）：{len(raw)} → {len(payload) + (3 if has_bom else 0)} 字节"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
