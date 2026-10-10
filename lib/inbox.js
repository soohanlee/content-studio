'use strict';
// 메일로 들어온 주제 처리.
// 1) 화면의 '지금 확인' 버튼을 누를 때 Gmail을 읽기 전용으로 확인 → 허용한 보낸 사람 + 정해진 제목의 새 메일만 고른다.
//    최근 3일 안에 받은 메일만 바로 처리하고, 그보다 오래된 메일은 목록에만 올린다.
// 2) 메일마다 data/inbox/<id>/에 기록을 만들고 'intake' 작업(studio-intake 스킬)으로 주제를 뽑아 글을 시작한다.
// 3) 그 메일로 만든 글이 모두 끝나면 'mailreply' 작업으로 결과물을 보낸 사람에게 회신한다(자동 회신이 켜져 있을 때).
const fs = require('fs');
const path = require('path');
const store = require('./store');
const week = require('./week');
const mail = require('./mail');
const exportpack = require('./exportpack');
const profile = require('./profile');

const INBOX = path.join(store.dirs.data, 'inbox');
const SETTINGS_FILE = path.join(store.dirs.data, 'settings.json');
const SECRET_FILE = path.join(store.dirs.data, 'secrets.json');
const STATE_FILE = path.join(INBOX, '_state.json');
fs.mkdirSync(INBOX, { recursive: true });

const RECENT_MS = 3 * 86400000; // 이보다 오래된 메일은 자동으로 처리하지 않는다
const DEFAULTS = { enabled: false, address: '', allowedFrom: [], subject: '', autoReply: true, enabledAt: null };
// 테스트용으로 서버 주소를 바꿀 수 있다(STUDIO_IMAP=host:port, STUDIO_SMTP=host:port → 암호화 없이 접속)
const server = (env, def) => { const v = process.env[env]; if (!v) return def; const [host, port] = v.split(':'); return { host, port: Number(port), secure: false }; };

function settings() { return { ...DEFAULTS, ...((store.readJson(SETTINGS_FILE, {}) || {}).mail || {}) }; }
function hasPassword() { return !!(store.readJson(SECRET_FILE, {}) || {}).gmailAppPassword; }
function password() { return String((store.readJson(SECRET_FILE, {}) || {}).gmailAppPassword || '').replace(/\s+/g, ''); }

function saveSettings(patch) {
  const all = store.readJson(SETTINGS_FILE, {}) || {};
  const cur = { ...DEFAULTS, ...(all.mail || {}) };
  const next = { ...cur };
  if (patch.address !== undefined) next.address = String(patch.address).trim().toLowerCase();
  if (patch.subject !== undefined) next.subject = String(patch.subject).trim();
  if (patch.allowedFrom !== undefined) next.allowedFrom = String(patch.allowedFrom).split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => /.+@.+/.test(s));
  if (patch.autoReply !== undefined) next.autoReply = !!patch.autoReply;
  if (patch.enabled !== undefined) {
    next.enabled = !!patch.enabled;
    if (next.enabled && !cur.enabled) next.enabledAt = new Date().toISOString(); // 켠 시점 이전 메일은 자동 처리하지 않는다
  }
  store.writeJson(SETTINGS_FILE, { ...all, mail: next });
  if (patch.appPassword) {
    store.writeJson(SECRET_FILE, { ...(store.readJson(SECRET_FILE, {}) || {}), gmailAppPassword: String(patch.appPassword).replace(/\s+/g, '') });
    try { fs.chmodSync(SECRET_FILE, 0o600); } catch {}
  }
  return next;
}

// ── 기록
const dir = (id) => path.join(INBOX, id);
function get(id) { return store.readJson(path.join(dir(id), 'record.json')); }
function save(id, patch) {
  const file = path.join(dir(id), 'record.json');
  const next = { ...store.readJson(file, {}), ...patch, id, updatedAt: new Date().toISOString() };
  store.writeJson(file, next);
  return next;
}
function list() {
  return fs.readdirSync(INBOX).filter((n) => store.exists(path.join(INBOX, n, 'record.json'))).map(get)
    .sort((a, b) => ((a.receivedAt || '') < (b.receivedAt || '') ? 1 : -1));
}
function state() { return store.readJson(STATE_FILE, {}) || {}; }
function setState(patch) { store.writeJson(STATE_FILE, { ...state(), ...patch }); }

function publicState() {
  const m = settings();
  const posts = store.listPosts();
  return {
    settings: { ...m, hasPassword: hasPassword() },
    ...state(),
    polling,
    records: list().slice(0, 20).map((r) => ({
      id: r.id, subject: r.subject, from: r.from, receivedAt: r.receivedAt, status: r.status, error: r.error || '', note: r.note || '', repliedAt: r.repliedAt || null,
      topics: r.topics || [], posts: (r.posts || []).map((pid) => { const p = posts.find((x) => x.id === pid); return { id: pid, title: p ? p.title : pid, status: p ? p.status : 'missing' }; }),
    })),
  };
}

// ── 메일함 확인
let polling = false;
const allowed = (from, m) => m.allowedFrom.includes(String(from || '').toLowerCase());
// 제목은 손으로 쓰니 띄어쓰기·하이픈·대소문자 차이는 무시하고 비교한다(예: '글감 - 주간 노트'도 '글감주간노트'로 본다)
const norm = (t) => String(t || '').toLowerCase().replace(/[\s\-‐-―_·.,:]+/g, '');
const subjectOk = (subject, m) => norm(subject).includes(norm(m.subject));

async function poll(cfg) {
  const m = settings();
  if (!m.address || !hasPassword()) return { error: 'Gmail 주소와 앱 비밀번호를 먼저 저장해 주세요.' };
  if (!m.allowedFrom.length || !m.subject) return { error: '보낸 사람과 제목을 먼저 저장해 주세요.' };
  if (polling) return { skipped: '이미 확인하는 중이에요.' };
  polling = true;
  const imap = new mail.Imap({ user: m.address, pass: password(), ...server('STUDIO_IMAP', {}) });
  const found = [];
  try {
    await imap.connect();
    await imap.examine('INBOX');
    // 보낸 사람은 서버에서 거르고(ASCII), 한글 제목은 받은 뒤 거른다.
    const from = m.allowedFrom.length > 1 ? `{${m.allowedFrom.map((a) => `from:${a}`).join(' ')}}` : `from:${m.allowedFrom[0]}`;
    const uids = await imap.search(`${from} newer_than:30d`);
    const heads = await imap.fetch(uids, 'BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT FROM DATE)]');
    const known = new Set(list().map((r) => r.messageId));
    const fresh = heads.map((h) => ({ uid: h.uid, ...mail.parseMessage(h.data) }))
      .filter((h) => allowed(h.from, m) && subjectOk(h.subject, m) && h.messageId && !known.has(h.messageId));
    for (const h of fresh) {
      const [full] = await imap.fetch([h.uid], 'BODY.PEEK[]');
      if (!full) continue;
      const msg = mail.parseMessage(full.data);
      if (!allowed(msg.from, m) || !subjectOk(msg.subject, m)) continue;
      found.push(receive(cfg, msg, m));
    }
    setState({ lastPollAt: new Date().toISOString(), lastError: '' });
    return { found: found.length };
  } catch (e) {
    setState({ lastPollAt: new Date().toISOString(), lastError: e.message });
    return { error: e.message };
  } finally {
    polling = false;
    imap.logout().catch(() => {});
  }
}

// 새 메일 한 통 기록 → 켠 이후 메일이면 바로 주제 뽑기 작업을 넣는다
function receive(cfg, msg, m) {
  const id = store.nextId(INBOX, `${week.current().today}-m`);
  const d = dir(id);
  fs.mkdirSync(path.join(d, 'files'), { recursive: true });
  const images = [];
  for (const a of msg.attachments) {
    if (!/^image\/(jpeg|png)$/i.test(a.contentType) || a.size > 15e6) continue;
    const name = `${String(images.length + 1).padStart(2, '0')}${/png/i.test(a.contentType) ? '.png' : '.jpg'}`;
    fs.writeFileSync(path.join(d, 'files', name), a.data);
    images.push(name);
  }
  // 스킬에는 본문만 넘긴다. 보낸 사람 이름(실명)은 넘기지 않는다.
  store.writeJson(path.join(d, 'email.json'), { received_at: msg.date, today: week.current().today, text: msg.text.slice(0, 20000), images });
  const old = Date.now() - Date.parse(msg.date) > RECENT_MS;
  save(id, { messageId: msg.messageId, references: msg.headers.references || '', from: msg.from, subject: msg.subject, receivedAt: msg.date, images,
    status: old ? 'skipped' : 'queued', note: old ? '3일보다 오래된 메일이라 목록에만 올렸어요.' : '' });
  if (!old) require('./jobs').enqueue('intake', id);
  return id;
}

// 건너뛴 메일을 직접 처리
function processRecord(id) {
  const r = get(id);
  if (!r) throw new Error('메일 기록을 찾지 못했어요.');
  save(id, { status: 'queued', error: '', note: '' });
  return require('./jobs').enqueue('intake', id);
}

// intake.json의 주제로 글을 시작한다
function startTopics(cfg, id) {
  const flow = require('./flow');
  const photos = require('./photos');
  const r = get(id);
  const intake = store.readJson(path.join(dir(id), 'intake.json'), {}) || {};
  const topics = (Array.isArray(intake.topics) ? intake.topics : []).slice(0, 3);
  if (!topics.length) return save(id, { status: 'done', note: intake.note || '메일에서 글로 쓸 주제를 찾지 못했어요.' });
  const posts = []; const research = [];
  for (const t of topics) {
    const groups = profile.get().groups || [];
    const group = groups.includes(t.group) ? t.group : groups[0] || '';
    const pillars = profile.pillars();
    const pl = pillars.find((x) => x.id === t.pillar) || pillars[0] || {};
    const notes = String(t.notes || '').trim();
    const mode = t.mode === 'notes' && notes ? 'notes' : 'full';
    const topic = { id: null, title: String(t.title || '').trim() || '메일로 받은 주제', group, pillar: pl.id || '',
      format: pl.format || '', why_now: notes.slice(0, 300), angles: [], bridge: '', sources: [], fixed_title: !!t.fixed_title };
    const res = flow.start(cfg, topic, { mode, take: String(t.take || '').trim(), notes, outline: !!t.outline && !!notes });
    if (res.postId) {
      store.savePost(res.postId, { source: { type: 'email', inboxId: id } });
      // 메일에 첨부한 사진은 직접 찍은 사진으로 넣는다(표지 우선)
      for (const img of r.images || []) photos.addOwn(store.postDir(res.postId), fs.readFileSync(path.join(dir(id), 'files', img)), path.extname(img));
      posts.push(res.postId);
    }
    research.push(res.researchId);
  }
  return save(id, { status: 'started', topics: topics.map((t) => t.title), posts, research, note: intake.note || '' });
}

// 글 하나가 끝나거나 실패할 때마다 부른다. 그 메일의 글이 모두 끝났으면 회신 작업을 넣는다.
function checkDone(id) {
  const r = get(id);
  if (!r || r.status !== 'started') return;
  const ps = (r.posts || []).map((pid) => store.getPost(pid) || {});
  const finished = ps.every((p) => ['review', 'approved', 'published', 'failed'].includes(p.status));
  if (!finished) return;
  if (settings().autoReply && ps.some((p) => p.status !== 'failed')) { save(id, { status: 'replying' }); require('./jobs').enqueue('mailreply', id); }
  else save(id, { status: 'done' });
}

// 회신 메일 만들기·보내기
function composeReply(cfg, id) {
  const r = get(id);
  const ps = (r.posts || []).map((pid) => ({ pid, post: store.getPost(pid) || {} }));
  const ok = ps.filter((x) => x.post.status !== 'failed');
  const failed = ps.filter((x) => x.post.status === 'failed');
  const packs = ok.map((x, i) => exportpack.build(cfg, x.pid, ok.length > 1 ? `글${i + 1}_` : ''));
  const parts = [`[자동 생성] 보내 준 메일로 글${packs.length > 1 ? ` ${packs.length}편` : ''}을 만들었어. 아직 아무도 검토하지 않은 초안이라 올리기 전에 아래 "확인할 것"부터 봐 줘.`];
  if (r.note) parts.push(`메일을 이렇게 읽었어: ${r.note}`);
  packs.forEach((p, i) => {
    parts.push(`■ ${packs.length > 1 ? `글${i + 1}. ` : ''}${p.title}`);
    if (p.outline.length) parts.push(`[네가 적은 흐름은 이렇게 썼어]\n${p.outline.join('\n')}`);
    parts.push(p.attention.length ? `[확인할 것]\n${p.attention.slice(0, 12).join('\n')}${p.attention.length > 12 ? `\n- 그 밖에 ${p.attention.length - 12}개` : ''}` : '[확인할 것]\n- 자동 점검에서 걸린 항목은 없어. 그래도 수치와 사실은 한 번 훑어봐 줘.');
  });
  if (failed.length) parts.push(`[만들지 못한 글]\n${failed.map((x) => `- ${x.post.title || x.pid}: ${x.post.error || '오류'}`).join('\n')}`);
  parts.push(`[첨부 파일]\n- 1_블로그_글.txt: 제목 후보, 본문, 태그, 사진 출처. [사진 넣는 자리]에 블로그사진·블로그도표를 넣으면 돼.\n- 2_인스타_캡션.txt / 3_쓰레드.txt: 인스타 캡션, 쓰레드 요약 타래(순서대로)와 단독 글\n- 인스타카드: 캐러셀 순서대로 올리면 돼\n- 블로그사진: 위키미디어 사진은 출처 문구를 사진 아래 꼭 같이 적어 줘`);
  const attachments = packs.flatMap((p) => p.files).map((f) => ({ filename: f.name, contentType: f.contentType, data: fs.readFileSync(f.path) }));
  const total = attachments.reduce((n, a) => n + a.data.length, 0);
  if (total > 20e6) throw new Error(`첨부파일이 너무 커요(${Math.round(total / 1e6)}MB). Gmail 한도는 25MB예요.`);
  const subject = /^re:/i.test(r.subject) ? r.subject : `Re: ${r.subject}`;
  return { to: r.from, subject, text: parts.join('\n\n'), attachments, inReplyTo: r.messageId, references: r.references, posts: ok.map((x) => x.pid) };
}

async function sendReply(cfg, id) {
  const m = settings();
  const c = composeReply(cfg, id);
  if (!allowed(c.to, m)) throw new Error('허용한 보낸 사람이 아니라 회신하지 않았어요.');
  const raw = mail.buildMessage({ from: m.address, ...c });
  if (cfg.mock && !process.env.STUDIO_SMTP) fs.writeFileSync(path.join(dir(id), 'reply.eml'), raw); // 테스트 모드는 보내지 않고 파일로 남긴다
  else await mail.sendMail({ user: m.address, pass: password(), from: m.address, to: c.to, raw, ...server('STUDIO_SMTP', {}) });
  const at = new Date().toISOString();
  for (const pid of c.posts) store.savePost(pid, { mailedAt: at });
  save(id, { status: 'replied', repliedAt: at, error: '' });
}

// 아무 글이나 지금 메일로 보내기(검수함·발행 화면 버튼)
async function sendPost(cfg, pid) {
  const m = settings();
  if (!m.address || !hasPassword()) throw new Error('설정에서 Gmail 주소와 앱 비밀번호를 먼저 저장해 주세요.');
  const to = m.allowedFrom[0];
  if (!to) throw new Error('설정에서 받는 사람 메일 주소를 먼저 저장해 주세요.');
  const p = exportpack.build(cfg, pid);
  const text = [`글 하나 보낼게. 올리기 전에 아래 "확인할 것"부터 봐 줘.`, `■ ${p.title}`,
    p.outline.length ? `[네가 적은 흐름은 이렇게 썼어]\n${p.outline.join('\n')}` : '',
    p.attention.length ? `[확인할 것]\n${p.attention.slice(0, 12).join('\n')}` : '[확인할 것]\n- 자동 점검에서 걸린 항목은 없어.'].filter(Boolean).join('\n\n');
  const raw = mail.buildMessage({ from: m.address, to, subject: `[콘텐츠 스튜디오] ${p.title}`, text, attachments: p.files.map((f) => ({ filename: f.name, contentType: f.contentType, data: fs.readFileSync(f.path) })) });
  if (cfg.mock && !process.env.STUDIO_SMTP) fs.writeFileSync(path.join(store.postDir(pid), 'mail.eml'), raw);
  else await mail.sendMail({ user: m.address, pass: password(), from: m.address, to, raw, ...server('STUDIO_SMTP', {}) });
  store.savePost(pid, { mailedAt: new Date().toISOString() });
  return { to };
}

// 연결 확인: 로그인과 받은편지함 열기만 해 본다
async function test() {
  const m = settings();
  if (!m.address || !hasPassword()) throw new Error('Gmail 주소와 앱 비밀번호를 먼저 저장해 주세요.');
  const imap = new mail.Imap({ user: m.address, pass: password(), ...server('STUDIO_IMAP', {}) });
  try { await imap.connect(); await imap.examine('INBOX'); } finally { imap.logout().catch(() => {}); }
  return { ok: true };
}

module.exports = { settings, saveSettings, publicState, poll, processRecord, startTopics, checkDone, sendReply, sendPost, test, get, save, dir, list };
