const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * 话题清单契约（2026-10-11）
 *
 * 用户问「这八个标签的边界到底清晰吗」——边界是产品判断，但**判断的前提**可以钉死：
 *   ① 不能有重复项（发布页和筛选页都会出现两遍）；
 *   ② 每个话题都必须有非空的边界说明（否则「边界清晰」就无从谈起 —— UI 上没告诉用户怎么选）；
 *   ③ 「开箱测评」已按用户拍板删除，不许它从任何路径复活；
 *   ④ 发布页与筛选页必须继续共用这一份常量（2026-10-04 那套「两处各写一份」的 bug 不许回归）。
 */

const TOPICS_FILE = path.join(__dirname, '..', 'domain', 'content', 'community-topics.uts');
const src = fs.readFileSync(TOPICS_FILE, 'utf8');

const MARKER = 'COMMUNITY_TOPICS: string[] = [';

function topicList() {
  const start = src.indexOf(MARKER);
  assert.notEqual(start, -1, 'community-topics.uts 里找不到 COMMUNITY_TOPICS');
  // ⚠️ 必须从 MARKER 之后开始找 `]`：MARKER 自己含 `string[]`，从 start 找会命中它里面那个 `]`，
  //    解析结果直接变成空数组（本护栏第一版就栽在这里，且失败信息完全指不到原因）。
  const end = src.indexOf(']', start + MARKER.length);
  assert.notEqual(end, -1, 'COMMUNITY_TOPICS 数组没有闭合的 ]');
  return src
    .slice(start + MARKER.length, end)
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .filter((line) => line.startsWith("'"))
    .map((line) => line.replace(/^'|'$/g, ''));
}

test('话题清单没有重复项', () => {
  const topics = topicList();
  assert.ok(topics.length >= 5, `话题太少了，实际 ${topics.length}`);
  const seen = new Set();
  for (const topic of topics) {
    assert.ok(!seen.has(topic), `话题重复：${topic}`);
    seen.add(topic);
  }
});

test('每个话题都有非空的边界说明（communityTopicHint 必须覆盖全部）', () => {
  for (const topic of topicList()) {
    const marker = `if (topic == '${topic}') return `;
    const hit = src.indexOf(marker);
    assert.notEqual(hit, -1, `话题「${topic}」没有在 communityTopicHint 里给边界说明`);
    const line = src.slice(hit, src.indexOf('\n', hit));
    const text = line.slice(marker.length).trim();
    assert.ok(
      text.length >= 6 && text !== "''",
      `话题「${topic}」的边界说明太短或为空（当前：${text}）—— 边界说不清就等于没划`,
    );
  }
});

test('「开箱测评」已删除，不许复活', () => {
  assert.ok(
    !topicList().includes('开箱测评'),
    '「开箱测评」已按 2026-10-11 的决定删除（它与「避雷拔草」同轴、会把社区带成比价站）',
  );
});

test('发布页与筛选页共用这一份常量（不许两处各写一套）', () => {
  const create = fs.readFileSync(path.join(__dirname, '..', 'pages', 'share', 'create.uvue'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'pages', 'community', 'index.uvue'), 'utf8');
  assert.match(
    create,
    /COMMUNITY_TOPICS[^}]*\}\s*from\s*'@\/domain\/content\/community-topics'/,
    '发布页必须从 community-topics 导入 COMMUNITY_TOPICS',
  );
  assert.match(
    index,
    /COMMUNITY_TOPICS[^}]*\}\s*from\s*'@\/domain\/content\/community-topics'/,
    '筛选页必须从 community-topics 导入 COMMUNITY_TOPICS',
  );
});
