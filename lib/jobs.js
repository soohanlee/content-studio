'use strict';
// 작업 큐: 구독 사용량 한도 때문에 한 번에 하나씩 처리한다. 상태는 data/jobs.json에 저장해 재시작해도 이어간다.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const week = require('./week');
const { runSkill } = require('./claude');
const mock = require('./mock');
const { renderCards, renderCharts } = require('./cards');
const { ROOT } = require('./config');

const JOBS_FILE = path.join(store.dirs.data, 'jobs.json');
const profile = require('./profile');

const LABELS = { setup: '카테고리 맞춤 규칙 만들기', topics: '주제 후보 만들기', research: '리서치', draft: '초안 쓰기', onepass: '한 번에 쓰기(리서치·초안·SNS)', revise: '수정 반영', social: '인스타·쓰레드 만들기', cards: '카드 이미지 만들기', newsletter: '뉴스레터 만들기', intake: '메일에서 주제 읽기', mailreply: '결과 메일 보내기' };
// 글 폴더를 대상으로 하는 작업(실패하면 글 상태를 failed로)
const POST_JOBS = ['draft', 'onepass', 'revise', 'social', 'cards'];

let cfg = null;
let running = false;

function loadJobs() { return store.readJson(JOBS_FILE, []); }
function saveJobs(jobs) { store.writeJson(JOBS_FILE, jobs.slice(-300)); }
function updateJob(id, patch) {
  const jobs = loadJobs();
  const j = jobs.find((x) => x.id === id);
  if (j) Object.assign(j, patch);
  saveJobs(jobs);
  return j;
}

function enqueue(type, target, extra = {}) {
  const jobs = loadJobs();
  // 같은 대상의 같은 작업이 이미 대기 중이면 다시 넣지 않는다.
  const dup = jobs.find((j) => j.type === type && j.target === target && (j.status === 'queued' || j.status === 'running'));
  if (dup) return dup;
  const job = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type, label: LABELS[type], target, status: 'queued', createdAt: new Date().toISOString(), ...extra };
  jobs.push(job);
  saveJobs(jobs);
  setImmediate(pump);
  return job;
}

async function skill(name, arg, job, tools) {
  if (cfg.mock) return mock.run(name, arg);
  const r = await runSkill(cfg, { skill: name, arg, jobId: job.id, tools, onProgress: (sec) => updateJob(job.id, { elapsed: sec }) });
  if (r.meta && r.meta.tokens) {
    const t = r.meta.tokens;
    updateJob(job.id, { usage: { total: t.input + t.output + t.cache_read + t.cache_write, output: t.output, turns: r.meta.num_turns, web: (r.meta.web_search || 0) + (r.meta.web_fetch || 0), cost_equiv_usd: r.meta.total_cost_usd } });
  }
  return r;
}

function requireFiles(dirAbs, files) {
  const missing = files.filter((f) => !store.exists(path.join(dirAbs, f)));
  if (missing.length) throw new Error(`결과 파일이 없어요: ${missing.join(', ')}`);
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    try { JSON.parse(fs.readFileSync(path.join(dirAbs, f), 'utf8')); } catch { throw new Error(`${f} 형식이 잘못됐어요.`); }
  }
}


// 코드로 하는 규칙 점검(사용량 없음): 말줄임표를 쓰지 않기로 했는데 남아 있으면 checks.json에 위반으로 추가한다.
function codeChecks(dirAbs) {
  const file = path.join(dirAbs, 'checks.json');
  const checks = (store.readJson(file, []) || []).filter((c) => !c.code);
  if (!profile.forSkill().noEllipsis) return store.writeJson(file, checks);
  const count = (t) => (String(t).match(/\.\.\.|…/g) || []).length;
  const draft = store.readText(path.join(dirAbs, 'draft.md'), '');
  const nDraft = count(draft);
  if (nDraft) checks.unshift({ type: 'style', text: `블로그 초안에 말줄임표 ${nDraft}회`, source_url: '', status: 'violation', note: '말줄임표는 쓰지 않기로 했어요. 수정 요청으로 빼 달라고 하거나 붙여 넣을 때 지워 주세요.', code: true });
  const social = store.readJson(path.join(dirAbs, 'social.json'));
  if (social) {
    const nSocial = count(JSON.stringify(social).replace(/\{\{BLOG_URL\}\}/g, ''));
    if (nSocial) checks.unshift({ type: 'style', text: `인스타·쓰레드 글에 말줄임표 ${nSocial}회`, source_url: '', status: 'violation', note: '말줄임표는 쓰지 않기로 했어요.', code: true });
  }
  store.writeJson(file, checks);
}


// 수정 단계에서 새로 조사한 내용(research_additions.json)을 원래 리서치 기록에 합친다.
function mergeAdditions(postDirAbs) {
  const addFile = path.join(postDirAbs, 'research_additions.json');
  const add = store.readJson(addFile);
  if (!add) return;
  const topic = store.readJson(path.join(postDirAbs, 'topic.json'), {});
  if (topic.research_id) {
    const bf = path.join(store.researchDir(topic.research_id), 'brief.json');
    const b = store.readJson(bf, {});
    for (const k of ['facts', 'numbers']) {
      const have = new Set((b[k] || []).map((x) => x.id));
      b[k] = [...(b[k] || []), ...((add[k] || []).filter((x) => !have.has(x.id)))];
    }
    b.rounds = [...(b.rounds || []), { at: new Date().toISOString().slice(0, 10), mode: 'revise', focus: '', summary: `수정 반영 중 추가 조사 (${topic.title || ''})` }];
    store.writeJson(bf, b);
    store.saveResearch(topic.research_id, {});
  }
  fs.renameSync(addFile, addFile.replace('.json', `.merged-${Date.now()}.json`));
}

const EMPTY_BRIEF = { facts: [], numbers: [], media: [], analogies: [], open_questions: [] };

const handlers = {
  // 처음 설정: 고정한 카테고리로 brand/ 규칙 파일을 만든다. 웹 검색으로 그 분야의 믿을 만한 출처와 요즘 흐름을 확인한다.
  async setup(job) {
    const dir = path.join(store.dirs.data, 'setup');
    const p = profile.get();
    if (!p) throw new Error('카테고리를 먼저 정해 주세요.');
    profile.setSetup({ status: 'running', error: null, jobId: job.id });
    store.writeJson(path.join(dir, 'input.json'), {
      ...profile.forSkill(), characterName: cfg.characterName, today: week.current().today, samples: p.samples || 0,
      channels: { blog: '네이버 블로그', instagram: cfg.instagramHandle || '', threads: true, newsletter: !!cfg.newsletterUrl },
    });
    const r = await skill('studio-setup', store.rel(dir), job);
    if (!r.ok) throw new Error(r.error);
    requireFiles(profile.BRAND, profile.BRAND_FILES);
    if (!profile.pillars().length) throw new Error('콘텐츠 기둥(pillars.json)이 비어 있어요.');
    profile.setSetup({ status: 'ready', readyAt: new Date().toISOString() });
  },

  async topics(job) {
    const dir = store.topicDir(job.target);
    const w = week.current();
    const recent = store.listPosts().slice(0, 20).map((p) => p.title).filter(Boolean);
    // 직전 추천 묶음의 후보는 다시 내지 않도록 넘긴다
    const prevId = store.listTopicBatches().find((id) => id !== job.target);
    const prev = prevId ? (store.getTopicBatch(prevId).topics || []).map((t) => t.title) : [];
    store.writeJson(path.join(dir, 'context.json'), {
      batch_id: job.target, today: w.today, isoTime: w.isoTime, ...profile.forSkill(),
      mix: profile.topicMix(12), pillars: profile.pillars(), characterName: cfg.characterName, recent_titles: recent, previous_candidates: prev,
    });
    const r = await skill('studio-topics', store.rel(dir), job);
    if (!r.ok) throw new Error(r.error);
    requireFiles(dir, ['topics.json']);
    const t = store.readJson(path.join(dir, 'topics.json'));
    if (!Array.isArray(t.topics) || !t.topics.length) throw new Error('추천 주제가 비어 있어요.');
  },

  // 리서치: data/research/<rid>에 조사 결과를 쌓는다. job.then === 'draft'이면 끝난 뒤 그 글의 초안을 쓴다.
  async research(job) {
    const dir = store.researchDir(job.target);
    store.saveResearch(job.target, { status: 'researching', error: null });
    if (job.postId) store.savePost(job.postId, { status: 'researching', error: null });
    const r = await skill('studio-research', store.rel(dir), job);
    if (!r.ok) throw new Error(r.error);
    requireFiles(dir, ['brief.json']);
    store.saveResearch(job.target, { status: 'ready', lastRunAt: new Date().toISOString() });
    if (job.then === 'draft' && job.postId) enqueue('draft', job.postId);
  },

  // 초안: 리서치 기록을 글 폴더로 복사한 뒤, 새 조사 없이 글을 쓴다.
  async draft(job) {
    const dir = store.postDir(job.target);
    const topic = store.readJson(path.join(dir, 'topic.json'), {});
    const brief = topic.research_id && path.join(store.researchDir(topic.research_id), 'brief.json');
    if (brief && store.exists(brief)) fs.copyFileSync(brief, path.join(dir, 'brief.json'));
    else if (!store.exists(path.join(dir, 'brief.json'))) store.writeJson(path.join(dir, 'brief.json'), EMPTY_BRIEF);
    store.savePost(job.target, { status: 'writing', error: null });
    const r = await skill('studio-draft', store.rel(dir), job);
    if (!r.ok) throw new Error(r.error);
    requireFiles(dir, ['draft.md', 'meta.json', 'checks.json']);
    codeChecks(dir);
    store.savePost(job.target, { status: 'writing_social' });
    enqueue('social', job.target);
  },

  // 한 번에 쓰기: 리서치·초안·SNS를 claude 실행 한 번으로 끝낸다(단계를 나눈 방식과 비교하려고 만든 진행 방식).
  // 조사 결과(brief.json)는 리서치 기록에도 복사해 나중에 다시 쓸 수 있게 한다.
  async onepass(job) {
    const dir = store.postDir(job.target);
    const topic = store.readJson(path.join(dir, 'topic.json'), {});
    store.savePost(job.target, { status: 'writing', error: null });
    if (topic.research_id) store.saveResearch(topic.research_id, { status: 'researching', error: null });
    const r = await skill('studio-onepass', store.rel(dir), job);
    if (!r.ok) throw new Error(r.error);
    requireFiles(dir, ['brief.json', 'draft.md', 'meta.json', 'checks.json', 'social.json']);
    codeChecks(dir);
    if (topic.research_id) {
      fs.copyFileSync(path.join(dir, 'brief.json'), path.join(store.researchDir(topic.research_id), 'brief.json'));
      store.saveResearch(topic.research_id, { status: 'ready', lastRunAt: new Date().toISOString() });
    }
    store.savePost(job.target, { status: 'writing_social' });
    enqueue('cards', job.target);
  },

  async revise(job) {
    const dir = store.postDir(job.target);
    store.savePost(job.target, { status: 'revising', error: null });
    const r = await skill('studio-revise', store.rel(dir), job);
    if (!r.ok) throw new Error(r.error);
    requireFiles(dir, ['draft.md', 'checks.json']);
    codeChecks(dir);
    mergeAdditions(dir);
    store.savePost(job.target, { status: 'writing_social' });
    enqueue('social', job.target);
  },

  async social(job) {
    const dir = store.postDir(job.target);
    store.savePost(job.target, { status: 'writing_social', error: null });
    const r = await skill('studio-social', store.rel(dir), job);
    if (!r.ok) throw new Error(r.error);
    requireFiles(dir, ['social.json']);
    codeChecks(dir);
    enqueue('cards', job.target);
  },

  async cards(job) {
    const dir = store.postDir(job.target);
    const files = await renderCards(cfg, dir, (store.getPost(job.target) || {}).coverPhoto);
    const charts = await renderCharts(cfg, dir);
    // 이미 승인·발행한 글은 상태를 되돌리지 않는다.
    const cur = store.getPost(job.target) || {};
    const keep = cur.status === 'approved' || cur.status === 'published';
    store.savePost(job.target, { status: keep ? cur.status : 'review', cards: files, charts });
    if (cur.source && cur.source.type === 'email') require('./inbox').checkDone(cur.source.inboxId);
  },

  // 메일 한 통 → 주제(intake.json) → 글 시작. 메일 본문만 다루므로 웹 도구 없이 읽기·쓰기만 허용한다.
  async intake(job) {
    const inbox = require('./inbox');
    inbox.save(job.target, { status: 'parsing', error: '' });
    const r = await skill('studio-intake', store.rel(inbox.dir(job.target)), job, 'Read,Write');
    if (!r.ok) throw new Error(r.error);
    requireFiles(inbox.dir(job.target), ['intake.json']);
    inbox.startTopics(cfg, job.target);
  },

  async mailreply(job) {
    await require('./inbox').sendReply(cfg, job.target);
  },

  async newsletter(job) {
    const dir = store.weekDir(job.target);
    // 최근 7일 동안 승인·발행한 글
    const since = Date.now() - 7 * 86400000;
    const posts = store.listPosts().filter((p) => (p.status === 'approved' || p.status === 'published') && Date.parse(p.updatedAt || 0) >= since);
    store.writeJson(path.join(dir, 'newsletter_input.json'), {
      week_id: job.target, characterName: cfg.characterName, today: week.current().today, ...profile.forSkill(),
      newsletter_name: cfg.newsletterName || `${profile.forSkill().category || ''} 주간 노트`.trim(),
      posts: posts.map((p) => ({ path: store.rel(store.postDir(p.id)), blog_url: p.blogUrl || '' })),
    });
    const r = await skill('studio-newsletter', store.rel(dir), job);
    if (!r.ok) throw new Error(r.error);
    requireFiles(dir, ['newsletter.md']);
  },
};

async function pump() {
  if (running) return;
  const next = loadJobs().find((j) => j.status === 'queued');
  if (!next) return;
  running = true;
  updateJob(next.id, { status: 'running', startedAt: new Date().toISOString(), elapsed: 0 });
  try {
    await handlers[next.type](next);
    updateJob(next.id, { status: 'done', endedAt: new Date().toISOString() });
  } catch (err) {
    updateJob(next.id, { status: 'failed', endedAt: new Date().toISOString(), error: err.message });
    if (POST_JOBS.includes(next.type)) store.savePost(next.target, { status: 'failed', error: err.message, failedJob: next.type });
    if (next.type === 'onepass') { const t = store.readJson(path.join(store.postDir(next.target), 'topic.json'), {}); if (t.research_id) store.saveResearch(t.research_id, { status: 'failed', error: err.message }); }
    if (next.type === 'setup') profile.setSetup({ status: 'failed', error: err.message });
    if (next.type === 'research') {
      store.saveResearch(next.target, { status: 'failed', error: err.message });
      if (next.postId) store.savePost(next.postId, { status: 'failed', error: err.message, failedJob: 'research' });
    }
    if (next.type === 'intake' || next.type === 'mailreply') require('./inbox').save(next.target, { status: 'failed', error: err.message });
    // 메일로 들어온 글이 실패해도 나머지 글이 끝났으면 회신한다
    const failedPost = POST_JOBS.includes(next.type) ? next.target : next.type === 'research' ? next.postId : null;
    const src = failedPost && (store.getPost(failedPost) || {}).source;
    if (src && src.type === 'email') require('./inbox').checkDone(src.inboxId);
  } finally {
    running = false;
    setImmediate(pump);
  }
}

function retry(jobId) {
  const j = loadJobs().find((x) => x.id === jobId);
  if (!j) return null;
  const { type, target, then, postId } = j;
  return enqueue(type, target, { then, postId });
}

function init(config) {
  cfg = config;
  // 꺼지기 전에 돌던 작업은 다시 대기열로
  const jobs = loadJobs();
  for (const j of jobs) if (j.status === 'running') j.status = 'queued';
  saveJobs(jobs);
  setImmediate(pump);
}

// 대기 중인 작업이 모두 끝날 때까지 기다린다(주간 예약 실행용).
function drain() {
  return new Promise((resolve) => {
    const tick = () => {
      const active = loadJobs().some((j) => j.status === 'queued' || j.status === 'running');
      if (!active && !running) return resolve();
      setTimeout(tick, 2000);
    };
    tick();
  });
}

module.exports = { init, enqueue, retry, loadJobs, drain, codeChecks, ROOT };
