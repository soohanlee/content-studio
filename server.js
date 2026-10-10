'use strict';
// 콘텐츠 스튜디오 로컬 서버. 127.0.0.1에서만 열린다(로그인 없음, 한 사람용).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const { ROOT, load } = require('./lib/config');
const store = require('./lib/store');
const week = require('./lib/week');
const jobs = require('./lib/jobs');
const flow = require('./lib/flow');
const feedback = require('./lib/feedback');
const photos = require('./lib/photos');
const inbox = require('./lib/inbox');
const profile = require('./lib/profile');
const samples = require('./lib/samples');
const { PRESETS } = require('./lib/presets');

const cfg = load();
jobs.init(cfg);
feedback.load(); // brand/feedback.md 생성
flow.migrate(cfg);
migrateTopics();

const PUBLIC = path.join(ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const SAFE_ID = /^[A-Za-z0-9-]+$/;

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}

function weekState() {
  const w = week.current();
  return { ...w, newsletter: store.readText(path.join(store.weekDir(w.weekId), 'newsletter.md'), '') };
}
// 가장 최근 주제 추천 묶음
function topicsState() {
  const ids = store.listTopicBatches();
  return ids.length ? { ...store.getTopicBatch(ids[0]), batches: ids.length } : null;
}
// 예전 형식(주마다 topics.json 하나)을 추천 묶음으로 옮긴다. 이미 쓴 후보는 글 제목으로 찾아 표시
function migrateTopics() {
  if (store.listTopicBatches().length || !fs.existsSync(store.dirs.weeks)) return;
  const posts = store.listPosts();
  for (const wk of fs.readdirSync(store.dirs.weeks).sort()) {
    const t = store.readJson(path.join(store.weekDir(wk), 'topics.json'));
    if (!t || !Array.isArray(t.topics)) continue;
    const day = String(t.generated_at || new Date().toISOString()).slice(0, 10);
    const id = store.nextId(store.dirs.topics, `${day}-t`);
    const used = {};
    for (const p of posts) {
      const tp = store.readJson(path.join(store.postDir(p.id), 'topic.json'), {});
      const hit = t.topics.find((x) => x.title === tp.title);
      if (hit && !used[hit.id]) used[hit.id] = p.id;
    }
    store.writeJson(path.join(store.topicDir(id), 'topics.json'), { ...t, batch_id: id });
    store.writeJson(path.join(store.topicDir(id), 'used.json'), used);
  }
}

function postDetail(id) {
  const dir = store.postDir(id);
  const r = (f) => store.readJson(path.join(dir, f));
  return {
    post: store.getPost(id),
    topic: r('topic.json'),
    brief: r('brief.json'),
    meta: r('meta.json'),
    checks: r('checks.json'),
    social: r('social.json'),
    revision: r('revision.json'),
    draft: store.readText(path.join(dir, 'draft.md'), ''),
    photos: photos.list(dir),
  };
}


// 화면에서 바꾸는 설정(캐릭터 이름, 인스타 계정, 뉴스레터 주소, 처음 안내 완료 여부)
const SETTINGS_FILE = path.join(store.dirs.data, 'settings.json');
const SETTING_KEYS = ['characterName', 'instagramHandle', 'newsletterUrl', 'onboarded'];
function saveSettings(patch) {
  const cur = store.readJson(SETTINGS_FILE, {});
  for (const k of SETTING_KEYS) if (patch[k] !== undefined) cur[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
  store.writeJson(SETTINGS_FILE, cur);
  Object.assign(cfg, cur); // 실행 중인 설정에도 바로 반영
  return cur;
}

// 연결 확인: Claude 구독 로그인, 카드용 브라우저 (1분 캐시)
let systemCache = null;
function systemCheck(force) {
  return new Promise((resolve) => {
    if (!force && systemCache && Date.now() - systemCache.at < 60000) return resolve(systemCache);
    const done = (claude) => {
      systemCache = { at: Date.now(), claude, browser: { ok: !!(cfg.browserBin && fs.existsSync(cfg.browserBin)), path: cfg.browserBin || '' }, model: cfg.model || '기본값', mock: cfg.mock, platform: os.platform() };
      resolve(systemCache);
    };
    if (cfg.mock) return done({ ok: true, loggedIn: true, authMethod: 'claude.ai', plan: '테스트 모드', bin: cfg.claudeBin });
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    execFile(cfg.claudeBin, ['auth', 'status'], { env, timeout: 15000, windowsHide: true, shell: /\.(cmd|bat)$/i.test(cfg.claudeBin) }, (err, stdout) => {
      if (err && !stdout) return done({ ok: false, error: `Claude Code를 실행하지 못했어요 (${cfg.claudeBin}).`, bin: cfg.claudeBin });
      try {
        const a = JSON.parse(String(stdout).trim());
        const sub = a.loggedIn && a.authMethod === 'claude.ai';
        done({ ok: sub, loggedIn: !!a.loggedIn, authMethod: a.authMethod, plan: a.subscriptionType || '', bin: cfg.claudeBin,
          error: !a.loggedIn ? 'Claude에 로그인하지 않았어요.' : (!sub ? '구독(claude.ai)이 아닌 방식으로 로그인해서 API 요금이 나갈 수 있어요.' : '') });
      } catch { done({ ok: false, error: '로그인 상태를 확인하지 못했어요.', bin: cfg.claudeBin }); }
    });
  });
}

function createPosts(batchId, picks) {
  const batch = store.getTopicBatch(batchId);
  if (!batch) return [];
  const usedFile = path.join(store.topicDir(batchId), 'used.json');
  const used = store.readJson(usedFile, {});
  const created = [];
  for (const pick of picks) {
    const t = batch.topics.find((x) => x.id === pick.id);
    if (!t) continue;
    const { used: _u, ...topic } = t;
    const r = flow.start(cfg, topic, { mode: pick.mode || 'full', take: (pick.take || '').trim() });
    used[t.id] = r.postId || r.researchId;
    if (r.postId) created.push(r.postId);
  }
  store.writeJson(usedFile, used);
  return created;
}

function researchDetail(rid) {
  const dir = store.researchDir(rid);
  return {
    research: store.getResearch(rid),
    request: store.readJson(path.join(dir, 'request.json')),
    brief: store.readJson(path.join(dir, 'brief.json')),
  };
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  if (method === 'GET' && parts[1] === 'state') {
    const prof = profile.get();
    return send(res, 200, {
      profile: prof ? { ...prof, ready: profile.isReady() } : null,
      pillars: profile.pillars(),
      presets: prof && prof.lockedAt ? [] : PRESETS,
      voices: profile.VOICES,
      week: weekState(),
      topics: topicsState(),
      mail: inbox.publicState(),
      posts: store.listPosts(),
      jobs: jobs.loadJobs().slice(-40).reverse(),
      research: store.listResearch(),
      feedback: feedback.load(),
      scopes: feedback.SCOPES,
      config: { characterName: cfg.characterName, mock: cfg.mock, newsletterUrl: cfg.newsletterUrl || '',
        instagramHandle: cfg.instagramHandle || '', onboarded: !!cfg.onboarded, model: cfg.model || '' },
    });
  }
  if (method === 'GET' && parts[1] === 'system') return send(res, 200, await systemCheck(url.searchParams.get('force') === '1'));
  if (method === 'POST' && parts[1] === 'settings') return send(res, 200, saveSettings(await readBody(req)));
  // 카테고리: 한 번 고정하면 바꾸지 않는다. 고정하면 맞춤 규칙 만들기(setup) 작업을 바로 시작한다.
  if (parts[1] === 'profile' && method === 'POST') {
    const b = await readBody(req);
    if (parts[2] === 'lock') {
      try { profile.lock(b.profile || {}, b.samples || []); } catch (e) { return send(res, 400, { error: e.message }); }
      return send(res, 200, jobs.enqueue('setup', 'brand'));
    }
    // 문체 샘플 미리보기: 주소·경로에서 글을 읽어 오기만 하고 저장은 고정할 때 한다.
    if (parts[2] === 'samples') {
      if (profile.isLocked()) return send(res, 409, { error: '이미 분야를 고정했어요.' });
      return send(res, 200, await samples.collect(b.sources));
    }
    if (parts[2] === 'setup') {
      if (!profile.isLocked()) return send(res, 409, { error: '먼저 카테고리를 정해 주세요.' });
      profile.setSetup({ status: 'queued', error: null });
      return send(res, 200, jobs.enqueue('setup', 'brand'));
    }
    if (parts[2] === 'colors') {
      try { return send(res, 200, profile.setColors(b)); } catch (e) { return send(res, 400, { error: e.message }); }
    }
  }
  // 글쓰기 작업은 카테고리 맞춤 규칙이 준비된 뒤에만 받는다.
  const writing = (parts[1] === 'topics') || (parts[1] === 'research' && parts[3]) || (parts[1] === 'newsletter') || (parts[1] === 'mail' && parts[2] === 'poll');
  if (method === 'POST' && writing && !profile.isReady()) return send(res, 409, { error: '먼저 처음 설정(카테고리 정하기)을 끝내 주세요.' });
  // 메일 자동화
  if (parts[1] === 'mail') {
    const b = method === 'POST' ? await readBody(req) : {};
    if (method === 'POST' && parts[2] === 'settings') { inbox.saveSettings(b); return send(res, 200, inbox.publicState()); }
    if (method === 'POST' && parts[2] === 'test') return send(res, 200, await inbox.test());
    if (method === 'POST' && parts[2] === 'poll') {
      const r = await inbox.poll(cfg);
      return r.error ? send(res, 400, { error: r.error }) : send(res, 200, r);
    }
    if (method === 'POST' && parts[3] === 'process' && SAFE_ID.test(parts[2] || '')) return send(res, 200, inbox.processRecord(parts[2]));
  }
  if (method === 'POST' && parts[1] === 'open-data') {
    if (process.platform === 'darwin') execFile('open', [store.dirs.data]); else if (process.platform === 'win32') execFile('explorer', [store.dirs.data]);
    return send(res, 200, { ok: true });
  }
  if (method === 'POST' && parts[1] === 'topics' && parts[2] === 'generate') {
    const busy = jobs.loadJobs().find((j) => j.type === 'topics' && (j.status === 'queued' || j.status === 'running'));
    if (busy) return send(res, 200, busy);
    return send(res, 200, jobs.enqueue('topics', store.nextId(store.dirs.topics, `${week.current().today}-t`)));
  }
  if (method === 'POST' && parts[1] === 'topics' && parts[2] === 'select') {
    const body = await readBody(req);
    const picks = Array.isArray(body.picks) ? body.picks.slice(0, 8) : [];
    if (!picks.length) return send(res, 400, { error: '주제를 하나 이상 골라 주세요.' });
    if (!SAFE_ID.test(String(body.batch || '')) || !store.getTopicBatch(body.batch)) return send(res, 400, { error: '추천 주제를 찾지 못했어요. 화면을 새로 고쳐 주세요.' });
    return send(res, 200, { posts: createPosts(body.batch, picks) });
  }
  // 새 주제(직접 입력): mode = full | research | notes
  if (method === 'POST' && parts[1] === 'topics' && parts[2] === 'custom') {
    const b = await readBody(req);
    const title = String(b.title || '').trim();
    if (!title) return send(res, 400, { error: '주제를 적어 주세요.' });
    const groups = profile.get().groups || [];
    const group = groups.includes(b.group) ? b.group : groups[0];
    const pillars = profile.pillars();
    const pl = pillars.find((x) => x.id === b.pillar) || pillars[0] || {};
    const topic = { id: null, title, group, pillar: pl.id || '', format: pl.format || '', why_now: String(b.notes || '').slice(0, 300), angles: [], bridge: '', sources: [] };
    const mode = ['full', 'research', 'notes', 'onepass'].includes(b.mode) ? b.mode : 'full';
    if (mode === 'notes' && !String(b.notes || '').trim()) return send(res, 400, { error: '조사 없이 쓰려면 메모를 적어 주세요.' });
    if (b.outline && !String(b.notes || '').trim()) return send(res, 400, { error: '흐름대로 쓰려면 메모에 흐름을 적어 주세요.' });
    return send(res, 200, flow.start(cfg, topic, { mode, take: String(b.take || '').trim(), notes: String(b.notes || '').trim(), outline: !!b.outline }));
  }
  // 리서치 기록
  if (parts[1] === 'research' && parts[2]) {
    const rid = parts[2];
    if (!SAFE_ID.test(rid) || !store.getResearch(rid)) return send(res, 404, { error: '리서치 기록을 찾지 못했어요.' });
    if (method === 'GET' && !parts[3]) return send(res, 200, researchDetail(rid));
    const b = method === 'POST' ? await readBody(req) : {};
    if (method === 'POST' && parts[3] === 'extend') {
      if (!String(b.focus || '').trim()) return send(res, 400, { error: '더 조사할 내용을 적어 주세요.' });
      return send(res, 200, flow.extendResearch(rid, b.focus));
    }
    if (method === 'POST' && parts[3] === 'write') {
      if ((store.getResearch(rid) || {}).status !== 'ready') return send(res, 409, { error: '조사가 끝난 기록으로만 글을 쓸 수 있어요.' });
      return send(res, 200, { postId: flow.writeFromResearch(cfg, rid, { take: String(b.take || '').trim(), notes: String(b.notes || '').trim() }) });
    }
  }
  // 피드백
  if (parts[1] === 'feedback') {
    const b = method === 'POST' ? await readBody(req) : {};
    if (method === 'POST' && !parts[2]) {
      if (!String(b.text || '').trim()) return send(res, 400, { error: '의견을 적어 주세요.' });
      return send(res, 200, feedback.add(b.text, b.scope));
    }
    if (method === 'POST' && parts[2] && parts[3] === 'toggle') {
      const cur = feedback.load().find((x) => x.id === parts[2]);
      if (!cur) return send(res, 404, { error: '의견을 찾지 못했어요.' });
      return send(res, 200, feedback.update(parts[2], { active: !cur.active }));
    }
    if (method === 'POST' && parts[2] && parts[3] === 'delete') { feedback.remove(parts[2]); return send(res, 200, { ok: true }); }
  }
  if (parts[1] === 'posts' && parts[2]) {
    const id = parts[2];
    if (!SAFE_ID.test(id) || !store.getPost(id)) return send(res, 404, { error: '글을 찾지 못했어요.' });
    const action = parts[3];
    if (method === 'GET' && !action) return send(res, 200, postDetail(id));
    // 사진 올리기: 본문이 이미지 바이트 그대로(Content-Type: image/jpeg|png)
    if (method === 'POST' && action === 'photo') {
      const type = String(req.headers['content-type'] || '');
      const ext = type.includes('png') ? '.png' : type.includes('jpeg') || type.includes('jpg') ? '.jpg' : null;
      if (!ext) return send(res, 400, { error: 'JPG나 PNG 사진만 올릴 수 있어요.' });
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > 15e6) return send(res, 413, { error: '15MB 이하 사진만 올릴 수 있어요.' }); chunks.push(c); }
      const item = photos.addOwn(store.postDir(id), Buffer.concat(chunks), ext);
      store.savePost(id, { coverPhoto: item.file });
      jobs.enqueue('cards', id);
      return send(res, 200, item);
    }
    const body = method === 'POST' ? await readBody(req) : {};
    if (method === 'POST' && action === 'cover') {
      store.savePost(id, { coverPhoto: String(body.file || 'none') });
      return send(res, 200, jobs.enqueue('cards', id));
    }
    if (method === 'POST' && action === 'revise') {
      const comment = String(body.comment || '').trim();
      if (!comment) return send(res, 400, { error: '수정할 내용을 적어 주세요.' });
      const file = path.join(store.postDir(id), 'revision.json');
      const rev = store.readJson(file, { requests: [] });
      rev.requests.push({ comment, at: new Date().toISOString() });
      store.writeJson(file, rev);
      store.savePost(id, { status: 'revising' });
      return send(res, 200, jobs.enqueue('revise', id));
    }
    if (method === 'POST' && action === 'approve') {
      if (store.getPost(id).status !== 'review') return send(res, 409, { error: '검수를 기다리는 글만 승인할 수 있어요.' });
      return send(res, 200, store.savePost(id, { status: 'approved', approvedAt: new Date().toISOString(), titleIndex: Number(body.titleIndex) || 0 }));
    }
    if (method === 'POST' && action === 'publish') {
      return send(res, 200, store.savePost(id, { status: 'published', publishedAt: new Date().toISOString(), blogUrl: String(body.url || '').trim() }));
    }
    if (method === 'POST' && action === 'retry') {
      const p = store.getPost(id);
      if (p.failedJob === 'research' && p.researchId) return send(res, 200, jobs.enqueue('research', p.researchId, { then: 'draft', postId: id }));
      return send(res, 200, jobs.enqueue(p.failedJob || 'draft', id));
    }
    if (method === 'POST' && action === 'mail') return send(res, 200, await inbox.sendPost(cfg, id));
    if (method === 'POST' && action === 'open-cards') {
      const dir = path.join(store.postDir(id), 'cards');
      if (process.platform === 'darwin') execFile('open', [dir]);
      else if (process.platform === 'win32') execFile('explorer', [dir]);
      return send(res, 200, { ok: true });
    }
  }
  if (method === 'POST' && parts[1] === 'newsletter') {
    return send(res, 200, jobs.enqueue('newsletter', week.current().weekId));
  }
  if (method === 'POST' && parts[1] === 'jobs' && parts[2] && parts[3] === 'retry') {
    return send(res, 200, jobs.retry(parts[2]) || { error: '작업을 찾지 못했어요.' });
  }
  return send(res, 404, { error: '없는 요청이에요.' });
}

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/cards/') || url.pathname.startsWith('/charts/') || url.pathname.startsWith('/photos/')) {
      // /cards/<postId>/slide-01.png, /charts/<postId>/chart-01.png, /photos/<postId>/commons-01.jpg
      const [, kind, id, file] = url.pathname.split('/');
      const re = kind === 'cards' ? /^slide-\d+\.(png|html)$/ : kind === 'charts' ? /^chart-\d+\.png$/ : /^(commons|own)-\d+\.(jpg|png)$/;
      if (!SAFE_ID.test(id || '') || !re.test(file || '')) return send(res, 404, 'Not found', 'text/plain');
      return serveFile(res, path.join(store.postDir(id), kind, file));
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
    return serveFile(res, file);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
});

server.listen(cfg.port, '127.0.0.1', () => {
  console.log(`콘텐츠 스튜디오: http://localhost:${cfg.port}${cfg.mock ? '  (테스트 모드)' : ''}`);
  console.log(`claude: ${cfg.claudeBin}  모델: ${cfg.model || '기본값'}`);
});
