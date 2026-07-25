# V2.5 正式前后端联调收口

## 仓库
- 前端: burnkings/sankengcloset → feature/v2-5-production-integration
- 后端: burnkings/sankengcloset_service → feature/v2-5-production-integration

## 分工

### 前端 A: Runtime 固化 + 配置清理
- config/runtime.uts: 移除 MOCK/LOCAL, 固定 REMOTE + api.sankengcloset.icu
- 删除 setRuntimeMode/setApiBaseUrl/setMockOnline/setMockLatency + 调用点
- pages/sync/index.uvue: 移除 API 输入框/连接测试/切换环境, 保留同步状态展示
- pages/account/index.uvue: 移除本地数据/迁移入口

### 前端 B: Session + 收藏 + Feed
- stores/session-store.uts: 删除 dev login, 实现正式微信登录
- pages/product/detail.uvue: 收藏走远程 API
- Feed 数据只来自 /api/v1/feed, 删 demo 兜底

### 后端
- sessions/dev 仅 test 环境
- 保留 feed/products/wishlist/sessions/wechat
- 添加 import-taobao-products.ts 脚本
- 单测 + typecheck

## 验收
1. yarn typecheck
2. yarn build
3. API curl 验证
