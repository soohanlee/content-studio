'use strict';
// 파일 저장소. 모든 데이터는 data/ 아래 JSON·Markdown 파일이다.
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');

// STUDIO_DATA로 저장 위치를 바꿀 수 있다(테스트 모드는 data-mock, 비교 실험은 data-compare/<실험>).
const DATA = path.resolve(ROOT, process.env.STUDIO_DATA || (process.env.STUDIO_MOCK === '1' ? 'data-mock' : 'data'));
const dirs = {
  data: DATA,
  weeks: path.join(DATA, 'weeks'),   // 뉴스레터(주간 노트)
  topics: path.join(DATA, 'topics'), // 주제 추천 묶음. 받을 때마다 하나씩 쌓인다
  posts: path.join(DATA, 'posts'),
  research: path.join(DATA, 'research'),
  logs: path.join(DATA, 'logs'),
};
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
function readText(file, fallback = '') {
  try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; }
}
function exists(file) { return fs.existsSync(file); }

const weekDir = (weekId) => path.join(dirs.weeks, weekId);
const topicDir = (batchId) => path.join(dirs.topics, batchId);
const researchDir = (rid) => path.join(dirs.research, rid);
const postDir = (postId) => path.join(dirs.posts, postId);
// 스킬에 넘기는 인자: 프로젝트 기준 상대 경로(ASCII, 슬래시)
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

function getPost(id) { return readJson(path.join(postDir(id), 'post.json')); }
function savePost(id, patch) {
  const file = path.join(postDir(id), 'post.json');
  const cur = readJson(file, {});
  const next = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
  writeJson(file, next);
  return next;
}
function listPosts() {
  if (!exists(dirs.posts)) return [];
  return fs.readdirSync(dirs.posts)
    .filter((n) => exists(path.join(dirs.posts, n, 'post.json')))
    .map((n) => {
      const p = getPost(n);
      const topic = readJson(path.join(dirs.posts, n, 'topic.json'), {});
      const meta = readJson(path.join(dirs.posts, n, 'meta.json'), {});
      return { ...p, title: (meta.titles && meta.titles[0]) || topic.title, group: topic.group, pillar: topic.pillar, week: topic.week_id, researchMode: topic.research_mode };
    })
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

// 리서치 기록: data/research/<rid>/ (request.json 요청, brief.json 조사 결과, research.json 상태)
function getResearch(rid) { return readJson(path.join(researchDir(rid), 'research.json')); }
function saveResearch(rid, patch) {
  const file = path.join(researchDir(rid), 'research.json');
  const next = { ...readJson(file, {}), ...patch, id: rid, updatedAt: new Date().toISOString() };
  writeJson(file, next);
  return next;
}
// 주제 추천 묶음(최신순). used.json: 후보 id → 그 후보로 만든 글/리서치 id
function listTopicBatches() {
  if (!exists(dirs.topics)) return [];
  return fs.readdirSync(dirs.topics).filter((n) => exists(path.join(dirs.topics, n, 'topics.json'))).sort().reverse();
}
function getTopicBatch(id) {
  const t = readJson(path.join(topicDir(id), 'topics.json'));
  if (!t) return null;
  const used = readJson(path.join(topicDir(id), 'used.json'), {});
  return { ...t, id, topics: (t.topics || []).map((x) => ({ ...x, used: used[x.id] || null })) };
}
function listResearch() {
  if (!exists(dirs.research)) return [];
  return fs.readdirSync(dirs.research)
    .filter((n) => exists(path.join(dirs.research, n, 'research.json')))
    .map((n) => {
      const r = getResearch(n);
      const req = readJson(path.join(dirs.research, n, 'request.json'), {});
      const b = readJson(path.join(dirs.research, n, 'brief.json'), {}) || {};
      return { ...r, title: b.title || req.title, group: req.group, pillar: req.pillar,
        facts: (b.facts || []).length, numbers: (b.numbers || []).length, rounds: (b.rounds || []).length, summary: b.summary || '' };
    })
    .sort((a, b) => ((a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1));
}
// 같은 날짜 접두어로 다음 번호 만들기 (예: 2026-10-03-r01)
function nextId(dir, prefix) {
  const used = exists(dir) ? fs.readdirSync(dir).filter((n) => n.startsWith(prefix)).length : 0;
  let n = used + 1;
  while (exists(path.join(dir, `${prefix}${String(n).padStart(2, '0')}`))) n++;
  return `${prefix}${String(n).padStart(2, '0')}`;
}

module.exports = { dirs, readJson, writeJson, readText, exists, weekDir, topicDir, listTopicBatches, getTopicBatch, postDir, researchDir, rel, getPost, savePost, listPosts, getResearch, saveResearch, listResearch, nextId };
