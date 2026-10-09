#!/usr/bin/env bash
#
# apply-wechat-appsecret.sh —— 在**后端服务器**上安全替换小程序 AppSecret
#
# 背景：2026-09-29 排查微信登录，定位到后端 .env.production 里的 WECHAT_APP_SECRET
# 是一个**过期值**（微信回 40125 invalid appsecret）。本脚本把换值的四个动作做成一条命令：
#   备份 → 只替换那一行 → 落盘校验(md5) → 重启 → 确认**运行中进程**里已是新值
#
# 用法（在服务器上）：
#   bash apply-wechat-appsecret.sh
#   然后按提示粘贴新 AppSecret（不回显、不进 shell 历史、不进 ps 输出）
#
# 设计要点（踩过的坑，别改回去）：
#   * 新值一律走 `read -rsp` 交互读入：命令行参数会进 shell 历史，也会被同机其他用户
#     在 `ps` 里看到。**绝不要**改成 `echo 'xxx' >> .env` 或 `sed -i "s/.../xxx/"`。
#   * 只替换目标行，其余行**逐字节保留**（用 awk 显式 print，不用 FS/OFS 重排字段 ——
#     后者会把 `DATABASE_URL=...?a=1&b=2` 这种含 = 的值改坏）。
#   * 替换结果先写临时文件，校验非空且行数不减少才 mv 覆盖；否则原文件不动。
#   * 校验只打印 len 与 md5，**不打印明文**。
#   * 最后必须核 /proc/<pid>/environ —— 文件对了但进程还是旧 env（改了没重启 / restart
#     没带 --update-env）才是真正的坑。

set -eu

DEPLOY_DIR="${WX_DEPLOY_DIR:-/home/admin/projects/sankengcloset_service}"
ENV_FILE="$DEPLOY_DIR/.env.production"
APP_NAME="${WX_PM2_NAME:-sankengcloset-api}"

# 期望值（2026-09-29 从公众平台取到并核对过）。留空则跳过 md5 比对。
EXPECT_MD5="${WX_EXPECT_MD5:-6e6683ffd5b0847b58f6228c9aadf370}"

say() { printf '%s\n' "$*"; }
die() { printf '❌ %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "找不到 $ENV_FILE（用 WX_DEPLOY_DIR 指定部署目录）"

say "== 0/5 备份 =="
BAK_DIR="/tmp/envbak"
mkdir -p "$BAK_DIR"
BAK="$BAK_DIR/$(basename "$ENV_FILE").$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "$BAK"
say "   已备份 → $BAK"

say "== 1/5 读入新 AppSecret（输入不回显）=="
printf '   粘贴新的 AppSecret 后回车: '
read -rs WXSEC
printf '\n'
[ -n "${WXSEC:-}" ] || die "没读到内容，已中止（原文件未改动）"
# 去掉粘贴时最常见的污染：两端空白与包裹引号
WXSEC="${WXSEC#"${WXSEC%%[![:space:]]*}"}"
WXSEC="${WXSEC%"${WXSEC##*[![:space:]]}"}"
WXSEC="${WXSEC%\"}"; WXSEC="${WXSEC#\"}"
WXSEC="${WXSEC%\'}"; WXSEC="${WXSEC#\'}"
say "   收到 ${#WXSEC} 个字符"

say "== 2/5 只替换 WECHAT_APP_SECRET 这一行 =="
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
awk -v s="$WXSEC" '
  BEGIN { done = 0 }
  /^WECHAT_APP_SECRET=/ { print "WECHAT_APP_SECRET=" s; done = 1; next }
  { print }
  END { if (!done) print "WECHAT_APP_SECRET=" s }
' "$ENV_FILE" > "$TMP"

[ -s "$TMP" ] || die "替换结果为空，已中止（原文件未改动）"
OLD_LINES="$(wc -l < "$ENV_FILE")"
NEW_LINES="$(wc -l < "$TMP")"
[ "$NEW_LINES" -ge "$OLD_LINES" ] || die "替换后行数变少（$OLD_LINES → $NEW_LINES），已中止"
mv "$TMP" "$ENV_FILE"
trap - EXIT
say "   已写入（行数 $OLD_LINES → $(wc -l < "$ENV_FILE")）"

say "== 3/5 落盘校验（不打印明文）=="
FILE_LEN="$(awk -F= '/^WECHAT_APP_SECRET=/{print length($2)}' "$ENV_FILE")"
FILE_MD5="$(awk -F= '/^WECHAT_APP_SECRET=/{print $2}' "$ENV_FILE" | tr -d '\n' | md5sum | cut -d' ' -f1)"
say "   文件内 len=$FILE_LEN  md5=$FILE_MD5"
[ "$FILE_LEN" = "32" ] || die "len 不是 32 —— 多半带了引号或空格，请检查 $ENV_FILE 后重跑"
if [ -n "$EXPECT_MD5" ] && [ "$FILE_MD5" != "$EXPECT_MD5" ]; then
  die "md5 与期望值不符（期望 $EXPECT_MD5）—— 值不是后台那个，别继续重启"
fi

say "== 4/5 重启 $APP_NAME =="
pm2 restart "$APP_NAME" --update-env
sleep 2

say "== 5/5 确认运行中进程里已经是新值 =="
PID="$(pgrep -f 'dist/src/server\.js' | head -1 || true)"
[ -n "${PID:-}" ] || die "没找到 node dist/src/server.js 进程，请人工确认"
say "   PID=$PID"
PROC_LEN="$(tr '\0' '\n' < "/proc/$PID/environ" | awk -F= '/^WECHAT_APP_SECRET=/{print length($2)}')"
PROC_MD5="$(tr '\0' '\n' < "/proc/$PID/environ" | awk -F= '/^WECHAT_APP_SECRET=/{print $2}' | tr -d '\n' | md5sum | cut -d' ' -f1)"
say "   进程内 len=$PROC_LEN  md5=$PROC_MD5"
[ "$PROC_LEN" = "32" ] || say "   ⚠️ 进程 env 里没读到 32 位的值 —— 检查 start-prod.sh 是否正确 source 了 .env.production"
[ "$PROC_MD5" = "$FILE_MD5" ] || say "   ⚠️ 进程内 md5 与文件不一致 —— 进程没真正重启 / 没带 --update-env"

say ""
say "✅ 完成。若上面两项 md5 一致且 len=32，接着做两件事："
say "   1) node /tmp/wxcheck.js                # 服务器侧：期望 40029 invalid code"
say "   2) 在本机跑：node scripts/check-wechat-login.js --expect-split"
say "      回 401 UNAUTHORIZED = 凭据已被微信接受；回 503 WECHAT_CREDENTIAL_INVALID = 值仍不对"
