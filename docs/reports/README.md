# 报告目录说明

本目录存放验证报告与审计记录。

- `archive/2026-07/`：V2 阶段历史报告与旧设计文档归档。**仅供历史追溯，不具备当前设计决策权**；当前唯一视觉规范见 [../design/DESIGN-SYSTEM-V3.md](../design/DESIGN-SYSTEM-V3.md)，当前产品方向见 [../product/PRODUCT-DIRECTION-CURRENT.md](../product/PRODUCT-DIRECTION-CURRENT.md)。
- 本目录根：当前阶段的验证报告。
  - [Migration-Analysis-V3-20260812.md](Migration-Analysis-V3-20260812.md)：V3 全局迁移分析 + 2026-08-13 V3 全量审计修复记录（P0 门禁 / 首页混合 Feed / 深色模式 computed 化 / 外观三态恢复 / 补充门禁）。
  - [Phase0-Design-V3-Inventory-20260812.md](Phase0-Design-V3-Inventory-20260812.md)：V3 设计盘点。
- 门禁说明：`scripts/check.js` 现为四段聚合门禁（v24 运行时契约 / v25 Android 静态 / source gates 源码门禁 / 编译产物 require 检查），任何静态断言都不能替代 HBuilderX 干净编译与真机验证。
