'use strict';
// 주제 → 리서치 → 글을 만드는 흐름. 진행 방식(mode)에 따라 어떤 작업을 큐에 넣을지 정한다.
//   full     : 새로 리서치한 뒤 글쓰기
//   research : 리서치만 하고 기록에 저장
//   notes    : 조사 없이 내 메모로 글쓰기
//   reuse    : 예전 리서치로 바로 글쓰기(추가 조사 없음)
//   onepass  : 리서치·초안·SNS를 claude 실행 한 번으로(단계를 나눈 full과 비교하는 실험용)
const fs = require('fs');
const path = require('path');
const store = require('./store');
const week = require('./week');
const jobs = require('./jobs');

const TOPIC_FIELDS = ['title', 'group', 'pillar', 'format', 'why_now', 'angles', 'bridge', 'sources', 'fixed_title'];
const newsletterName = (cfg) => cfg.newsletterName || `${(require('./profile').get() || {}).category || ''} 주간 노트`.trim();
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

function createResearch(cfg, topic, { take = '', notes = '', outline = false } = {}) {
  const w = week.current();
  const rid = store.nextId(store.dirs.research, `${w.today}-r`);
  store.writeJson(path.join(store.researchDir(rid), 'request.json'), {
    ...pick(topic, TOPIC_FIELDS), take, notes, outline, mode: 'new', focus: '', today: w.today, characterName: cfg.characterName,
  });
  store.saveResearch(rid, { status: 'queued', createdAt: new Date().toISOString(), posts: [] });
  return rid;
}

function createPost(cfg, topic, { take = '', notes = '', outline = false, researchId = null, researchMode = 'researched' } = {}) {
  const w = week.current();
  const id = store.nextId(store.dirs.posts, `${w.today}-`);
  store.writeJson(path.join(store.postDir(id), 'topic.json'), {
    ...pick(topic, TOPIC_FIELDS), take, notes, outline, research_id: researchId, research_mode: researchMode,
    week_id: w.weekId, today: w.today, characterName: cfg.characterName,
    newsletter: { enabled: !!cfg.newsletterUrl, name: newsletterName(cfg) },
  });
  store.savePost(id, { status: 'queued', createdAt: new Date().toISOString(), researchId, topicId: topic.id || null });
  if (researchId) {
    const r = store.getResearch(researchId) || {};
    store.saveResearch(researchId, { posts: [...(r.posts || []), id] });
  }
  return id;
}

// 주제 하나를 진행 방식에 맞게 시작한다. 돌려주는 값: { researchId, postId }
// outline: 사용자가 메모에 적은 흐름(순서·마무리)대로 쓴다
function start(cfg, topic, { mode = 'full', take = '', notes = '', outline = false } = {}) {
  if (mode === 'notes') {
    const rid = createResearch(cfg, topic, { take, notes, outline });
    // 조사 없이 쓰는 글도 메모를 리서치 기록으로 남긴다.
    store.writeJson(path.join(store.researchDir(rid), 'brief.json'), {
      title: topic.title, summary: '조사 없이 내 메모로 쓴 글이에요.', questions: [], facts: [], numbers: [], comparisons: [],
      analogies: [], media: [], open_questions: [], notes,
      rounds: [{ at: week.current().today, mode: 'notes', focus: '', summary: '메모만 저장(웹 조사 없음)' }],
    });
    store.saveResearch(rid, { status: 'ready' });
    const pid = createPost(cfg, topic, { take, notes, outline, researchId: rid, researchMode: 'notes' });
    jobs.enqueue('draft', pid);
    return { researchId: rid, postId: pid };
  }
  const rid = createResearch(cfg, topic, { take, notes, outline });
  if (mode === 'onepass') {
    const pid = createPost(cfg, topic, { take, notes, outline, researchId: rid, researchMode: 'onepass' });
    jobs.enqueue('onepass', pid);
    return { researchId: rid, postId: pid };
  }
  if (mode === 'research') {
    jobs.enqueue('research', rid);
    return { researchId: rid, postId: null };
  }
  const pid = createPost(cfg, topic, { take, notes, outline, researchId: rid, researchMode: 'researched' });
  jobs.enqueue('research', rid, { then: 'draft', postId: pid });
  return { researchId: rid, postId: pid };
}

// 예전 리서치로 바로 글쓰기
function writeFromResearch(cfg, rid, { take = '', notes = '' } = {}) {
  const req = store.readJson(path.join(store.researchDir(rid), 'request.json'), {});
  const brief = store.readJson(path.join(store.researchDir(rid), 'brief.json'), {}) || {};
  const topic = { ...req, title: req.title || brief.title };
  const pid = createPost(cfg, topic, { take: take || req.take || '', notes: notes || req.notes || '', outline: !!req.outline, researchId: rid, researchMode: 'reuse' });
  jobs.enqueue('draft', pid);
  return pid;
}

// 예전 리서치에 추가 조사
function extendResearch(rid, focus) {
  const file = path.join(store.researchDir(rid), 'request.json');
  const req = store.readJson(file, {});
  store.writeJson(file, { ...req, mode: 'extend', focus: String(focus).trim(), today: week.current().today });
  store.saveResearch(rid, { status: 'queued' });
  return jobs.enqueue('research', rid);
}

// 리서치 기록이 생기기 전에 만든 글은 그 글의 브리프로 리서치 기록을 만들어 연결한다.
function migrate(cfg) {
  for (const p of store.listPosts()) {
    if (p.researchId) continue;
    const dir = store.postDir(p.id);
    const topic = store.readJson(path.join(dir, 'topic.json'), {});
    const brief = store.readJson(path.join(dir, 'brief.json'));
    if (!brief) continue;
    const rid = createResearch(cfg, topic, { take: topic.take || '' });
    store.writeJson(path.join(store.researchDir(rid), 'brief.json'), {
      title: topic.title, summary: '', ...brief,
      rounds: brief.rounds || [{ at: topic.today || '', mode: 'new', focus: '', summary: '리서치 기록 기능 이전에 조사한 내용' }],
    });
    store.saveResearch(rid, { status: 'ready', posts: [p.id] });
    store.writeJson(path.join(dir, 'topic.json'), { ...topic, research_id: rid, research_mode: topic.research_mode || 'researched' });
    store.savePost(p.id, { researchId: rid });
  }
}

module.exports = { start, writeFromResearch, extendResearch, migrate };
