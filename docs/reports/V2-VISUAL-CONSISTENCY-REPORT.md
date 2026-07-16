# Product V2 Phase 2A.4 Visual Consistency Report

## 1. Scope and acceptance boundary

This phase polishes the five Product V2 top-level pages only:

- Home
- Discover
- Qiling AI
- Favorites
- Profile

The phase does not redesign business flows, replace stores, or change wardrobe, order, reminder, and budget data models. Management remains under Profile > Management Center.

Compilation and static checks in this report prove only that the source can produce a structurally valid WeChat Mini Program bundle. They do not prove visual acceptance. Final visual acceptance remains pending until the required real-device screenshots are reviewed.

## 2. Pre-change consistency audit

| Concept | Home | Discover | AI | Favorites | Profile | Problem before this phase |
| --- | --- | --- | --- | --- | --- | --- |
| Page header | Custom wordmark/header | Page-local title | Page-local title | Page-local title | Page-local title | Heights, title baselines, and body offsets differed |
| Section heading | Feed-local labels | Plain text headings | Plain text headings | Plain text heading | Plain text headings | No shared title/action rhythm |
| Horizontal tabs | Home-only implementation | None | None | Favorites-only implementation | None | Same interaction used different spacing and hit areas |
| List group | Feed-specific rows | Calendar rows | Recent-use rows | None | Settings rows | Row heights, dividers, and outer surfaces differed |
| Product card | Home implementation | Local promotional cards | None | Favorites copy | None | Home and Favorites could drift visually |
| Page gutter | Mixed local values | Mixed local values | Mixed local values | Mixed local values | Mixed local values | Content frequently touched the screen edge or felt over-wide |
| Bottom clearance | Page-specific | Page-specific | Page-specific | Page-specific | Page-specific | Last content could be obscured by the TabBar |

The root cause was not a missing token declaration alone. The five pages implemented the same concepts independently, while some inline `gap` and `calc()` styles were unreliable in the mp-weixin output.

## 3. Shared V2 component layer

The following components now provide the shared visual contract:

| Component | Used by | Responsibility |
| --- | --- | --- |
| `V2PageHeader` | Discover, AI, Favorites, Profile | Status-bar offset, 96rpx title row, stable title baseline and side padding |
| `V2SectionHeader` | Discover, AI, Favorites, Profile | Section title, optional subtitle/action, 48rpx section rhythm and 20rpx content offset |
| `V2HorizontalTabs` | Home, Favorites | Scrollable tabs, 88rpx touch target, fixed leading/trailing gutter and active indicator |
| `V2ListGroup` | Discover, AI, Profile | White grouped surface, border, radius, clipping and dividers |
| `V2ListRow` | AI, Profile | 96rpx row, icon container, adaptive label area, value and optional arrow |
| `V2ProductCard` | Home, Favorites | Shared image ratio, badge, brand, title, price and failure-placeholder behavior |

Home keeps its branded wordmark header because it is content navigation rather than a plain title page, but its heights, search control, tabs, gutters, card component, and bottom clearance now use the same V2 system.

## 4. Unified visual tokens

| Token / behavior | Value |
| --- | --- |
| Normal page gutter | 40rpx |
| Compact page gutter | 32rpx |
| Page header row | 96rpx |
| Header-to-body spacing | 24rpx |
| Section spacing | 48rpx |
| Section header-to-content spacing | 20rpx |
| Inter-group spacing | 20rpx |
| Card padding | 24rpx |
| Compact card padding | 20rpx |
| List row height | 96rpx |
| Minimum touch target | 88rpx |
| Search height | 76rpx |
| Search radius | 24rpx |
| Bottom content clearance | 176rpx |
| Primary page background | `#F7F1F3` in the light neutral theme |

Two-column and horizontal layouts use explicit widths, flex rows, and spacer views. The five top-level pages and `components/v2` do not depend on CSS Grid, `gap`, or `calc()`.

## 5. Duplicate implementations removed

- Replaced four page-local plain title headers with `V2PageHeader`.
- Replaced repeated page-local section title/action styles with `V2SectionHeader`.
- Replaced the separate Home and Favorites tab implementations with `V2HorizontalTabs`.
- Replaced the copied Home/Favorites product-card markup with `V2ProductCard`.
- Replaced AI recent rows and Profile settings rows with the shared list group/row system.
- Moved shared sizing and safe-area behavior into responsive tokens and `MainLayout`.

## 6. Page-by-page visual result

### Home

- Preserves the branded wordmark and content-feed character.
- Search, channel tabs, first-feed offset, product pair spacing, and bottom clearance now follow the shared rhythm.
- Product cards use the same component as Favorites.
- Existing product, event, outfit, and brand-post feed logic is retained.

### Discover

- Search is separated from the title header and constrained to the shared content canvas.
- Category cards use equal columns with restrained icon-color differentiation.
- Reservations use stable horizontal cards and explicit spacers.
- Hot brands use independent chips limited to two rows.
- Release calendar is a grouped 96rpx-row list.
- Price drops use compact horizontal product rows with clear current/original price hierarchy.

### Qiling AI

- Welcome input remains the page's distinct branded area.
- The send action is now a readable icon button instead of an empty color block.
- Six capabilities use a consistent 2-by-3 grid with fixed card dimensions and spacing.
- Recent activity uses the shared list group and places time consistently on the right.

### Favorites

- Tabs use the same touch target and active-state language as Home.
- Empty-state spacing and the secondary "Go discover" action are restrained and centered.
- Recommended products use the shared Home product-card component.

### Profile

- Retains the Product V2 order: identity, management center, preferences, settings.
- Identity card, edit action, primary wardrobe card, and three management summaries now have stable hierarchy.
- Preference items form one aligned three-column group.
- Settings use uniform 96rpx rows and shared icon/value/arrow alignment.
- Sync and import/export remain removed as requested.

## 7. Business and data behavior

This phase did not intentionally change stores, persistence, repositories, filtering logic, navigation ownership, or management data models. It reorganized view composition and shared presentation components. Existing unrelated dirty files in the working tree were not reverted.

## 8. Build and static validation

Completed locally:

- HBuilderX 5.21 mp-weixin development build: 14 pages compiled successfully.
- Existing Pinia postbuild patch retained and executed.
- `patch-vendor.py`: two generated-vendor changes applied; all five stores were bound.
- `scripts/check-uts-compile.js`: required compiled files and relative `require()` paths resolved.
- Generated `app.json` exists under `unpackage/dist/dev/mp-weixin`.
- Generated `project.config.json` uses an empty `miniprogramRoot` for that output directory.
- Target scan: no Emoji in the five top-level pages or `components/v2`.
- Target scan: no CSS Grid, `gap`, or `calc()` in the five top-level pages or `components/v2`.
- `git diff --check`: passed; line-ending warnings remain informational.

Residual repository debt outside this phase:

- Older management pages and legacy components still contain Emoji and `gap` usage.
- Those files were not globally rewritten because Phase 2A.4 is scoped to the five top-level pages and forbids unrelated business rewrites.

## 9. Real-device visual checklist

The following screenshots must be captured on a real WeChat device before visual acceptance:

1. Home: title/search/tabs and the first complete product row.
2. Home: a mixed feed section showing non-product content rhythm.
3. Discover: search, category cards, and reservations.
4. Discover: hot brands and release calendar.
5. Discover: recent price-drop rows.
6. Qiling AI: welcome card, input/send action, and all six capability cards.
7. Qiling AI: recent-use list and bottom clearance.
8. Favorites: empty state and the first complete recommendation row.
9. Favorites: lower recommendation row and bottom clearance.
10. Profile: identity, management center, and preferences.
11. Profile: complete settings list including About and bottom clearance.

Acceptance should check content-canvas width, title baseline, tab spacing, two-column stability, image fallback quality, text wrapping, bottom TabBar clearance, and visual consistency across all five pages.

## 10. Upload status

Requested test version: `v1.6.2-visual-consistency`.

The source version is set to `1.6.2`, but the test version was not uploaded. Automated WeChat DevTools control was unavailable because the computer-control runtime could not initialize, and the local WeChat DevTools CLI exited with an `EEXIST` error while opening its application-data directory. No user configuration was deleted or modified to bypass that failure.

Current status: source implementation complete, mp-weixin bundle validated, test upload blocked, real-device visual acceptance pending.
