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

test('每个话题都有维护用的定义（写在 community-topics.uts 的注释里）', () => {
  // 2026-10-11：原先要求「每个话题都有一句 UI 边界说明」，用户反馈发布页显示太繁琐 ⇒ 已撤掉 UI。
  // 但定义本身必须留在文件里（维护依据），否则下一个人不知道该把「出片分享」和「今日穿搭」怎么分。
  for (const topic of topicList()) {
    assert.ok(
      src.includes(`${topic} →`) || src.includes(`${topic} `),
      `话题「${topic}」在文件注释里没有定义说明 —— 边界依据不能只存在于某个人脑子里`,
    );
  }
});

test('发布页不再显示话题边界提示（用户反馈太繁琐）', () => {
  const create = fs.readFileSync(path.join(__dirname, '..', 'pages', 'share', 'create.uvue'), 'utf8');
  assert.ok(
    !create.includes('communityTopicHint'),
    '发布页不应再引入/显示话题边界说明（2026-10-11 已按用户反馈撤掉）',
  );
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
