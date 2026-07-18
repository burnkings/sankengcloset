# 三坑绮橱 API

V2.3 后端基础服务。当前目标是让 UniApp X 客户端可以从 Mock 平滑切换到真实 HTTP API，并保留离线同步、幂等、AI 人工确认和外部购买记录的业务边界。

## 技术栈

- Node.js 22+
- Fastify 5 + TypeScript
- PostgreSQL 17
- Zod 请求校验
- JWT 会话
- 本地对象存储适配器（开发），后续可替换 S3/OSS/COS

## 快速启动

```bash
cp .env.example .env
npm install
npm run dev
```

默认 `DATA_DRIVER=memory`，无需数据库即可浏览 OpenAPI 和验证接口：

- API: `http://localhost:8787`
- OpenAPI UI: `http://localhost:8787/docs`
- 健康检查: `GET /health`

完整 PostgreSQL 模式：

```bash
docker compose up --build
```

## 开发登录

仅 `NODE_ENV != production` 时开放：

```bash
curl -X POST http://localhost:8787/api/v1/sessions/dev \
  -H 'content-type: application/json' \
  -d '{"nickname":"本地测试用户"}'
```

生产环境必须接入 `POST /api/v1/sessions/wechat`，并配置微信 App ID/Secret。开发登录在生产环境会返回 404。

## 已落地端点

- 会话：开发登录、微信登录边界、刷新、退出、`GET /me`
- 内容：Feed、商品详情
- 同步：批量幂等回执、checkpoint
- 媒体：准备上传、开发环境原始二进制上传、删除
- AI：创建任务、查询任务、确认并写入衣橱/心愿单

## 重要边界

- 本应用不处理商品支付；购买记录只表示用户在外部渠道的决策记录。
- AI 任务不会自动创建用户资产，必须调用 confirm。
- `safe_mock` 不读取图片内容、不猜品牌，便于先打通链路。
- 图片与结构化记录分开上传，批量同步只传 objectKey。
- 生产必须更换 JWT Secret、对象存储适配器并关闭开发登录。
