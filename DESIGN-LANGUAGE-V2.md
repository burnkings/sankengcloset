# 三坑绮橱 Design Language v2.0

> 所有新页面、新组件必须遵循本规范。
> 不得出现后台管理风格、Material Design 风格、白蓝工具风格。
> 可复用样式模块位于 `theme/components/`，优先 import 使用。

---

## 1. 设计哲学

**关键词**：收藏感 · 高级感 · 展示感 · 消费欲 · 治愈 · 有氛围

**不是**：Material Design / 后台管理 / CRUD 工具 / 电商平台

**参考**：小红书（留白）· 得物（商品卡）· Pinterest（瀑布流）· Lemon8（视觉）

---

## 2. 页面布局规范

### 2.1 页面结构

```
┌─────────────────────────┐
│ Navbar                   │ ← AppNavbar, fixed
├─────────────────────────┤
│ Hero 区域（可选）        │ ← 品牌色 + 情感文案 + 统计
├─────────────────────────┤
│ 工具栏（筛选/排序）      │ ← 一行紧凑
├─────────────────────────┤
│ 内容区域                 │ ← 主体
├─────────────────────────┤
│ 底部留白                 │ ← spacing[8]
└─────────────────────────┘
```

### 2.2 页面分类

| 类型 | 有 Hero | 示例 |
|------|---------|------|
| 首页 | ✅ | Home |
| 收藏页 | ✅ | Wishlist, Wardrobe |
| 管理页 | ✅ | Reminder, Purchase |
| 详情页 | ❌ | Detail |
| 编辑页 | ❌ | Edit |

### 2.3 间距

- 水平间距：`semanticSpacing.pageHorizontal` (32rpx)
- 列表间距：`spacing[3]` (24rpx)
- 底部留白：`spacing[8]` (64rpx)

---

## 3. Hero Design System

### 代码引用

```uts
import { heroSection, heroTitle, heroSub } from '@/theme/components/hero'
import { heroStatBar, heroStatItem, heroStatNum, heroStatLabel, heroStatDivider } from '@/theme/components/hero'
import { heroDataBar, heroDataLabel, heroDataValue, heroDataBadge } from '@/theme/components/hero'
import { HERO_COLORS, createHeroSection } from '@/theme/components/hero'
```

### 结构

```
┌─────────────────────────────┐
│ 动态标题（白色 bold xl）     │
│ 副文案（半透明白色 sm）      │
│ [可选] 数据条（半透明 15%）  │
│ 统计胶囊行（半透明 12%）     │
└─────────────────────────────┘
```

### 配色

| 页面 | Hero 色 |
|------|---------|
| Home | `HERO_COLORS.brand` |
| Wardrobe | `HERO_COLORS.brand` |
| Wishlist | `HERO_COLORS.accent` |
| Purchase | `HERO_COLORS.brand` |
| Reminder | `HERO_COLORS.brand` |

### 统计胶囊

- 4 列均分，半透明底 12%
- 数字：白色 bold xl
- 标签：`rgba(255,255,255,0.65)` xs
- 分隔线：`rgba(255,255,255,0.15)` 1rpx

---

## 4. Card Design System

### 代码引用

```uts
import { cardContainer, cardWithAccent, cardAccentBar, cardContent } from '@/theme/components/card'
import { cardTopRow, cardDateRow, cardActionRow } from '@/theme/components/card'
import { statusPill, statusPillText, timeBadge, timeBadgeText } from '@/theme/components/card'
import { doneBtn, doneBtnIcon, doneBtnText } from '@/theme/components/card'
import { coverWrap, gradientOverlay, overlayNameWrap, overlayNameText } from '@/theme/components/card'
import { placeholderWrap, priorityCorner, priorityCornerText, favCorner } from '@/theme/components/card'
```

### 卡片类型

#### A. 列表卡片（Purchase, Reminder）

```
┌┬──────────────────────────┐
││ 标题行            [状态]  │
││ 副标题                    │
││ 📅 日期 + 时间标签        │
││              [操作按钮]   │
└┴──────────────────────────┘
```

- 左色条：`cardAccentBar(color)`
- 状态：`statusPill(color)`

#### B. 封面卡片（Wishlist）

```
┌──────────────────────────┐
│     大封面 360rpx         │
│  渐变遮罩 + 白色名称      │
│  ❤️           [优先级]   │
├──────────────────────────┤
│ 品牌名            [状态]  │
│ ¥xxx                      │
└──────────────────────────┘
```

- 封面：`coverWrap` + `gradientOverlay`
- 角标：`priorityCorner(color)` + `favCorner`

#### C. 信息卡片（Wardrobe List）

```
┌──────────────────────────┐
│ [图片] 名称        ❤️    │
│        品牌               │
│        [分类] [穿着]      │
│        ¥xxx      日期    │
└──────────────────────────┘
```

---

## 5. Toolbar Design System

### 代码引用

```uts
import { toolbarSection, chipScroll, chipRow } from '@/theme/components/toolbar'
import { createSortBtn, createSortIcon } from '@/theme/components/toolbar'
import { favToggle, favToggleText } from '@/theme/components/toolbar'
```

---

## 6. Image First Rule

| 场景 | 尺寸 | 比例 |
|------|------|------|
| Wishlist 封面 | 100% × 360rpx | ~2:1 |
| Wardrobe Grid | 100% × 320rpx | ~2:1 |
| Wardrobe List | 180 × 220rpx | 4:5 |

- 加载：`mode="aspectFill"` + `lazy-load`
- 占位：品牌色浅底 + emoji
- 失败：🖼️ emoji

---

## 7. 字体层级

| 用途 | 字号 | 字重 |
|------|------|------|
| Hero 标题 | `fontSize.xl` | bold |
| Section 标题 | `fontSize.lg` | semibold |
| 卡片标题 | `fontSize.base` | semibold |
| 正文 | `fontSize.base` | regular |
| 副标题 | `fontSize.sm` | regular |
| 标签 | `fontSize.xs` | medium |

---

## 8. Tag / Badge 规范

- 状态：`statusPill(color)` — 圆角 pill，背景 20%
- 时间：`timeBadge(color)` — 圆角 pill，背景 15%
- 筛选：`AppTag` component，variant=`TAG_CHIP`
- 分类：`AppTag` component，variant=`TAG_CATEGORY`

---

## 9. 禁止事项

1. 禁止水平数字统计条（后台仪表盘风格）
2. 禁止方角标签（必须 pill）
3. 禁止独立搜索栏占一整行
4. 禁止硬编码颜色
5. 禁止内联写 chipStyle / emptyStyle
6. 禁止"列表"、"管理"等后台风格标题

---

## 10. 文件清单

```
theme/components/
├── index.uts          # 统一导出
├── hero.uts           # Hero 区域样式
├── card.uts           # 卡片样式
└── toolbar.uts        # 工具栏样式
```

---

*版本：v2.0 | 2026-07-14*
