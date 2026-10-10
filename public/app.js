'use strict';
// 콘텐츠 스튜디오 화면. 서버 상태를 3초마다 받아 그린다. 입력 중인 값은 ui 객체에 보관해 다시 그려도 지워지지 않는다.

const ui = { tab: 'home', picks: {}, takes: {}, modes: {}, custom: { group: '', pillar: '', mode: 'full' }, showCustom: false, researchId: null, rdetail: {}, rsearch: '', extend: {}, rtake: {}, reviewId: null, publishId: null, revise: {}, titleChoice: {}, blogUrl: {}, detail: {}, showRevise: {}, onb: { open: false, step: 0 }, set: null, prof: null, sys: null, sysLoading: false, jobsOpen: false };
let state = null;
let lastSig = '';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 콘텐츠 기둥 이름(brand/pillars.json, 처음 설정에서 카테고리에 맞게 만들어진다)
const pillarName = (id) => ((state && state.pillars || []).find((x) => x.id === id) || {}).name || id || '';
const prof = () => (state && state.profile) || null;
const category = () => (prof() && prof().category) || '내 분야';
const STATUS = { queued: '대기 중', researching: '리서치 중', writing: '초안 쓰는 중', writing_social: 'SNS 만드는 중', review: '검수 대기', revising: '수정 중', approved: '발행 대기', published: '발행 완료', failed: '실패' };
const WORKING = ['queued', 'researching', 'writing', 'writing_social', 'revising'];
const RSTATUS = { queued: '대기 중', researching: '조사 중', ready: '조사 완료', failed: '실패' };
const CHECK_TYPE = { number: '수치', fact: '사실', quote: '인용', style: '문체', outline: '흐름', violation: '규칙' };
const MODE_LABEL = { researched: '새 리서치', reuse: '기존 리서치 사용', notes: '메모로 작성', onepass: '한 번에 쓰기' };

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '요청을 처리하지 못했어요.');
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200);
}
async function copy(html, text) {
  try {
    if (html && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    toast('복사했어요');
  } catch { toast('복사하지 못했어요. 직접 선택해서 복사해 주세요.'); }
}

// ── 마크다운 → HTML (초안 미리보기와 네이버 붙여넣기용)
function mdToHtml(md, { forPaste = false, media = [] } = {}) {
  const nl = (state && state.config.newsletterUrl) || (forPaste ? '[뉴스레터 주소]' : '{{NEWSLETTER_URL}}');
  const blocks = String(md || '').replace(/\{\{NEWSLETTER_URL\}\}/g, nl).split(/\n\s*\n/);
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
  let mi = 0;
  return blocks.map((b) => {
    const t = b.trim();
    if (!t) return '';
    if (t.startsWith('# ')) return forPaste ? '' : `<h1>${inline(t.slice(2))}</h1>`;
    if (t.startsWith('## ')) return `<h2>${inline(t.slice(3))}</h2>`;
    if (t.startsWith('### ')) return `<h3>${inline(t.slice(4))}</h3>`;
    const m = t.match(/^\[(영상|사진|도표):\s*(.+)\]$/);
    if (m) {
      const kindMap = { 영상: 'youtube', 사진: 'photo', 도표: 'chart' };
      const cand = media.filter((x) => x.kind === kindMap[m[1]] || (m[1] === '영상' && x.kind === 'social'))[0] || media[mi];
      mi++;
      const extra = cand && cand.url ? ` ${cand.url}` : '';
      return forPaste ? `<p>[${m[1]}: ${esc(m[2])}${esc(extra)}]</p>` : `<span class="media">${m[1]} 자리 · ${esc(m[2])}</span>`;
    }
    if (t.startsWith('> ')) return `<blockquote>${inline(t.replace(/^> ?/gm, ''))}</blockquote>`;
    return `<p>${t.split('\n').map(inline).join('<br>')}</p>`;
  }).join('\n');
}
const mdTitle = (md) => ((String(md).match(/^# (.+)$/m) || [])[1] || '');

// ── 상태 받기
async function refresh(force) {
  try {
    const s = await api('/api/state');
    state = s;
    const sig = JSON.stringify([s.profile && [s.profile.lockedAt, s.profile.ready, s.profile.setup, s.profile.colors], s.pillars.length, s.topics && s.topics.id, s.topics && s.topics.topics.map((x) => x.used), s.week.newsletter.length, s.config, s.posts.map((p) => [p.id, p.status, p.updatedAt]), s.jobs.map((j) => [j.id, j.status, j.elapsed]), s.research.map((r) => [r.id, r.status, r.updatedAt]), s.feedback.map((f) => [f.id, f.active]), s.mail && [s.mail.lastPollAt, s.mail.lastError, s.mail.polling, s.mail.records.map((r) => [r.id, r.status, r.posts.map((x) => x.status)])]]);
    $('#catChip').textContent = s.profile && s.profile.lockedAt ? s.profile.category : '';
    $('#catChip').hidden = !(s.profile && s.profile.lockedAt);
    $('#mockBadge').hidden = !s.config.mock;
    $('#nTopics').textContent = '';
    $('#nReview').textContent = s.posts.filter((p) => p.status === 'review').length || '';
    $('#nPublish').textContent = s.posts.filter((p) => p.status === 'approved').length || '';
    $('#nFeedback').textContent = s.feedback.filter((f) => f.active).length || '';
    $('#nSettings').textContent = !(s.profile && s.profile.lockedAt) || HANDLE_UNSET(s.config.instagramHandle) ? '!' : '';
    if (!(s.profile && s.profile.lockedAt) && !ui.onbShown) { ui.onbShown = true; openOnb(0); }
    if (!$('#fbScope').options.length) $('#fbScope').innerHTML = s.scopes.map((x) => `<option>${x}</option>`).join('');
    if (force || sig !== lastSig) {
      // 상태가 바뀐 글의 상세는 다시 받는다
      for (const p of s.posts) if (ui.detail[p.id] && ui.detail[p.id].post.updatedAt !== p.updatedAt) delete ui.detail[p.id];
      for (const r of s.research) if (ui.rdetail[r.id] && ui.rdetail[r.id].research.updatedAt !== r.updatedAt) delete ui.rdetail[r.id];
      // 입력 중이면 그리지 않고 다음 주기에 다시 본다(lastSig를 그대로 두어 놓치지 않게)
      if (!isTyping()) { lastSig = sig; render(); }
    }
  } catch (e) { /* 서버가 잠시 꺼진 경우 다음 주기에 다시 시도 */ }
}
const isTyping = () => { const a = document.activeElement; return ui.onb.open || a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.type !== 'radio')); };

async function detail(id) {
  if (!ui.detail[id]) ui.detail[id] = await api(`/api/posts/${id}`);
  return ui.detail[id];
}

// ── 화면
function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  if (!state) return;
  renderHint();
  ({ home: renderHome, topics: renderTopics, review: renderReview, publish: renderPublish, newsletter: renderNewsletter, research: renderResearch, feedback: renderFeedback, settings: renderSettings })[ui.tab]();
}

function jobLine(j) {
  const icon = j.status === 'running' ? '<span class="spin"></span>' : '';
  const t = new Date(j.endedAt || j.createdAt || Date.now());
  const when = j.status === 'running' ? `${j.elapsed || 0}초` : `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  const retry = j.status === 'failed' ? `<button class="btn small" data-retry-job="${j.id}">다시 시도</button>` : '';
  const err = j.status === 'failed' && j.error ? `<div class="small" style="color:var(--stitch)">${esc(j.error).slice(0, 200)}</div>` : '';
  const usage = j.usage ? `<div class="small muted">토큰 ${Math.round(j.usage.total / 1000).toLocaleString()}k · ${j.usage.turns}턴 · 웹 ${j.usage.web}회</div>` : '';
  return `<li>${icon}<span class="pill ${j.status}">${{ queued: '대기', running: '진행 중', done: '완료', failed: '실패' }[j.status]}</span><span><b>${esc(j.label)}</b> <span class="muted small">${esc(j.target)}</span>${err}${usage}</span><span class="when">${when}</span>${retry}</li>`;
}

// ── 글 쓰는 순서: 주제 정하기 → 리서치·초안·SNS(자동) → 검수 → 발행
// 기간 단위가 아니라 글 단위로 진행한다. 하루에 여러 편도, 며칠에 한 편도 된다.
const HANDLE_UNSET = (h) => !h || h === '@계정';
const busyJob = (type) => state.jobs.find((j) => j.type === type && (j.status === 'queued' || j.status === 'running'));
const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};
function flowState() {
  const posts = state.posts;
  const n = (sts) => posts.filter((p) => sts.includes(p.status)).length;
  const t = state.topics;
  const unused = t ? t.topics.filter((x) => !x.used).length : 0;
  const c = { working: n(WORKING), review: n(['review']), approved: n(['approved']), failed: n(['failed']), published: n(['published']) };
  const topicJob = busyJob('topics');
  const steps = [
    { key: 'topic', tab: 'topics', who: '나', title: '주제 정하기', desc: '추천에서 고르거나 직접 입력', count: topicJob ? null : unused, pre: '추천 ', unit: '개 남음', busy: !!topicJob, busyText: '추천 받는 중' },
    { key: 'write', tab: 'home', who: '자동', title: '리서치·초안·SNS', desc: '조사하고 블로그·인스타·쓰레드 글까지', count: c.working, unit: '편 쓰는 중', busy: c.working > 0, warn: c.failed, busyText: `${c.working}편 쓰는 중` },
    { key: 'review', tab: 'review', who: '나', title: '검수', desc: '읽고 승인하거나 고칠 점 적기', count: c.review, unit: '편 대기' },
    { key: 'publish', tab: 'publish', who: '나', title: '발행', desc: '복사해서 붙여 넣기', count: c.approved, unit: '편 대기' },
  ];
  return { posts, c, steps, topicJob, unused, t };
}

// 다음에 할 일 하나. tone: go(내가 할 일) / wait(자동 진행 중) / warn(문제) / done(할 일 없음)
function nextAction(f = flowState()) {
  const { c, topicJob, unused } = f;
  const custom = { label: '주제 직접 입력', attr: 'data-act="custom-open"' };
  const p = prof();
  if (!p || !p.lockedAt) return { tone: 'go', tab: 'home', title: '처음 설정: 어떤 분야의 글을 쓸지 정해 주세요', desc: '분야를 정하면 그 분야에 맞는 문체·출처·채널 규칙을 만들어 두고, 그다음부터 주제만 고르면 글이 나와요. 분야는 한 번 정하면 고정돼요.', btn: { label: '분야 정하기', attr: 'data-act="onb-open"' } };
  const setupJob = busyJob('setup');
  if (!p.ready && (setupJob || ['queued', 'running'].includes((p.setup || {}).status))) return { tone: 'wait', tab: 'home', title: `${p.category} 맞춤 규칙을 만드는 중이에요`, desc: `믿을 만한 출처, 문체, 인스타·쓰레드 규칙, 콘텐츠 기둥을 정리하고 있어요. 5~10분 걸려요${setupJob && setupJob.elapsed ? ` (${Math.floor(setupJob.elapsed / 60)}분 ${setupJob.elapsed % 60}초 지남)` : ''}. 끝나면 바로 주제를 받을 수 있어요.` };
  if (!p.ready) return { tone: 'warn', tab: 'home', title: '맞춤 규칙을 만들다 멈췄어요', desc: `${(p.setup && p.setup.error) || ''} 다시 시도하면 대부분 돼요. 계속 멈추면 구독 사용량 한도일 수 있어요.`.trim(), btn: { label: '다시 만들기', attr: 'data-act="setup-retry"' } };
  if (c.failed) return { tone: 'warn', tab: 'review', title: `글 ${c.failed}편을 만들다 멈췄어요`, desc: '대부분 다시 시도하면 돼요. 계속 멈추면 구독 사용량 한도일 수 있으니 조금 뒤에 다시 해 주세요.', btn: { label: '다시 시도하러 가기', attr: 'data-goto="review"' } };
  if (c.review) return { tone: 'go', tab: 'review', title: `검수할 글이 ${c.review}편 있어요`, desc: '읽어 보고 승인하거나 고칠 점을 적어 주세요. 한 편에 10분쯤 걸려요.', btn: { label: '검수하기', attr: 'data-goto="review"' } };
  if (c.approved) return { tone: 'go', tab: 'publish', title: `블로그에 올릴 글이 ${c.approved}편 있어요`, desc: '복사해서 네이버 블로그·인스타그램·쓰레드에 붙여 넣고, 마지막에 블로그 주소를 넣으면 끝나요.', btn: { label: '발행하기', attr: 'data-goto="publish"' } };
  if (c.working) return { tone: 'wait', tab: 'home', title: `글 ${c.working}편 쓰는 중이에요`, desc: '다 쓰면 검수함에 올려 둘게요. 기다리는 동안 다른 주제를 넣어도 돼요.', btn2: { label: '다른 주제 넣기', attr: 'data-goto="topics"' } };
  if (topicJob) return { tone: 'wait', tab: 'topics', title: '추천 주제를 찾는 중이에요', desc: `요즘 ${category()} 소식을 찾아 주제 12개를 골라 드려요. 몇 분 걸려요 (${topicJob.elapsed || 0}초 지남).`, btn2: custom };
  if (unused) return { tone: 'go', tab: 'topics', title: '쓸 주제를 정해 주세요', desc: `추천 주제가 ${unused}개 남아 있어요. 고르거나 직접 입력하면 블로그 글, 인스타 카드, 쓰레드 글까지 만들어 드려요.`, btn: { label: '추천 주제 보기', attr: 'data-goto="topics"' }, btn2: custom };
  return { tone: 'go', tab: 'topics', title: '쓸 주제를 정해 주세요', desc: '추천 주제를 받거나 직접 입력하면 블로그 글, 인스타 카드, 쓰레드 글까지 만들어 드려요.', btn: { label: '추천 주제 받기', attr: 'data-act="gen-topics"' }, btn2: custom };
}

function actionCard(a, compact) {
  const btns = `${a.btn ? `<button class="btn primary ${compact ? '' : 'big'}" ${a.btn.attr}>${a.btn.label}</button>` : ''}${a.btn2 ? `<button class="btn ${compact ? '' : 'big'}" ${a.btn2.attr}>${a.btn2.label}</button>` : ''}`;
  const tag = { go: '지금 할 일', wait: '자동으로 하는 중', warn: '확인해 주세요', done: '완료' }[a.tone];
  if (compact) return `<div class="hintbar ${a.tone}"><span class="tag">${a.tone === 'wait' ? '<span class="spin"></span> ' : ''}${tag}</span><span class="t">${esc(a.title)}</span><span class="row">${btns}</span></div>`;
  return `<section class="next ${a.tone}"><div><span class="tag">${a.tone === 'wait' ? '<span class="spin"></span> ' : ''}${tag}</span><h2>${esc(a.title)}</h2><p>${esc(a.desc)}</p></div>${btns ? `<div class="row">${btns}</div>` : ''}</section>`;
}

// 홈의 순서 그림: 단계마다 지금 몇 편이 머물러 있는지
function stepper(steps) {
  return `<ol class="journey">${steps.map((s, i) => {
    const cls = s.warn ? 'warn' : s.busy || s.count ? 'active' : '';
    const note = s.warn ? `${s.warn}편 멈춤` : s.busy ? s.busyText : s.count ? `${s.pre || ''}${s.count}${s.unit}` : '';
    return `<li class="${cls}"><button ${s.tab === 'home' ? 'disabled' : `data-goto="${s.tab}"`} aria-label="${i + 1}단계 ${s.title}">
      <span class="num">${s.warn ? '!' : i + 1}</span>
      <span class="who">${s.who}</span>
      <b>${s.title}</b>
      <span class="desc">${s.desc}</span>
      <span class="note">${s.busy ? '<span class="spin"></span> ' : ''}${esc(note)}</span>
    </button></li>`;
  }).join('')}</ol>`;
}

// 글 한 편의 진행 줄: 리서치 → 초안 → SNS·카드 → 검수 → 발행
const TRACK = ['리서치', '초안', 'SNS·카드', '검수', '발행'];
function postTrack(p) {
  const failedAt = { research: 0, draft: 1, onepass: 1, revise: 1, social: 2, cards: 2 };
  const at = { queued: 0, researching: 0, writing: 1, revising: 1, writing_social: 2, review: 3, approved: 4, published: 5 }[p.status] ?? (p.status === 'failed' ? (failedAt[p.failedJob] ?? 1) : 0);
  const job = state.jobs.find((j) => (j.target === p.id || j.postId === p.id) && (j.status === 'queued' || j.status === 'running'));
  const ahead = job && job.status === 'queued' ? state.jobs.filter((j) => (j.status === 'queued' || j.status === 'running') && j.createdAt < job.createdAt).length : 0;
  const skip = p.researchMode === 'notes' ? '메모 사용' : p.researchMode === 'reuse' ? '기존 기록' : p.researchMode === 'onepass' ? '한 번에' : '';
  const cell = (label, i) => {
    let cls = i < at ? 'done' : i === at ? (p.status === 'failed' ? 'warn' : ['review', 'approved'].includes(p.status) ? 'me' : 'now') : '';
    if (p.status === 'queued' && i === 0) cls = 'wait';
    const sub = i === 0 && skip ? skip : '';
    return `<span class="${cls}">${cls === 'now' ? '<span class="spin"></span>' : cls === 'done' ? '✓ ' : ''}${label}${sub ? `<small>${sub}</small>` : ''}</span>`;
  };
  let action = '';
  if (p.status === 'review') action = `<button class="btn primary small" data-goto="review" data-review-id="${p.id}">검수하기</button>`;
  else if (p.status === 'approved') action = `<button class="btn primary small" data-goto="publish" data-publish-id="${p.id}">발행하기</button>`;
  else if (p.status === 'failed') action = `<button class="btn small" data-retry-post="${p.id}">다시 시도</button>`;
  const el = (job && job.elapsed) || 0;
  const label = p.status === 'queued' ? (ahead ? `차례 기다리는 중 · 앞에 ${ahead}개` : '곧 시작해요') : job && job.status === 'running' ? `${STATUS[p.status]} · ${Math.floor(el / 60)}분 ${el % 60}초` : (STATUS[p.status] || p.status);
  return `<li class="ptrack ${['review', 'approved', 'failed'].includes(p.status) ? 'mine' : ''}"><div class="ph"><b>${esc(p.title)}</b><span class="small muted">${esc(label)}</span>${action}</div><div class="track">${TRACK.map(cell).join('')}</div></li>`;
}

function renderHome() {
  const f = flowState();
  const a = nextAction(f);
  const jobs = state.jobs.slice(0, 15);
  const failedJobs = jobs.some((j) => j.status === 'failed');
  const setupTodo = [HANDLE_UNSET(state.config.instagramHandle) && '인스타 계정', !state.config.newsletterUrl && '뉴스레터 주소'].filter(Boolean);
  // 내가 손댈 글 먼저, 그다음 자동 진행 중인 글
  const order = { failed: 0, review: 1, approved: 2 };
  const active = f.posts.filter((p) => p.status !== 'published').sort((x, y) => (order[x.status] ?? 5) - (order[y.status] ?? 5));
  const done = f.posts.filter((p) => p.status === 'published');
  const pending = state.research.filter((r) => (r.status === 'queued' || r.status === 'researching') && !(r.posts || []).length);
  $('#view').innerHTML = `
    <div class="homehead"><div><h1>${prof() && prof().lockedAt ? `${esc(category())} 스튜디오` : '콘텐츠 스튜디오'}</h1><p class="sub">${prof() && prof().lockedAt ? `${esc(state.config.characterName || '나')} · ` : ''}주제만 정하면 블로그 글, 인스타 카드, 쓰레드 글까지 만들어 드려요.</p></div>
      ${setupTodo.length ? `<button class="btn small" data-goto="settings">${setupTodo.join(', ')} 적기</button>` : ''}</div>
    ${actionCard(a)}
    <h2>글 쓰는 순서</h2>
    ${stepper(f.steps)}
    ${mailPanel()}
    <div class="h2row"><h2>쓰고 있는 글 ${active.length + pending.length ? `<span class="count">${active.length + pending.length}</span>` : ''}</h2><button class="btn small" data-goto="topics">+ 새 글 쓰기</button></div>
    ${active.length || pending.length ? `<ul class="ptracks">${active.map(postTrack).join('')}${pending.map((r) => `<li class="ptrack"><div class="ph"><b>${esc(r.title)}</b><span class="small muted"><span class="spin"></span> 리서치만 하는 중 · 끝나면 리서치 기록에 저장해요</span><button class="btn small" data-goto-research="${r.id}">보기</button></div></li>`).join('')}</ul>`
      : `<div class="panel empty-s"><p class="muted">쓰고 있는 글이 없어요. 주제를 정하면 글마다 어디까지 됐는지 여기서 보여 드려요.</p></div>`}
    ${done.length ? `<h2>올린 글 <span class="count">${done.length}</span></h2><div class="panel"><ul class="donelist">${done.slice(0, ui.showAllDone ? 999 : 5).map((p) => `<li><span class="pill done">올림</span><span class="t">${esc(p.title)}</span><span class="small muted">${esc((p.updatedAt || '').slice(0, 10))}</span>${p.blogUrl ? `<a class="small" href="${esc(p.blogUrl)}" target="_blank" rel="noopener">블로그</a>` : ''}<button class="btn small" data-goto="publish" data-publish-id="${p.id}">자료 보기</button></li>`).join('')}</ul>${done.length > 5 && !ui.showAllDone ? `<button class="btn small" data-act="show-all-done" style="margin-top:8px">모두 보기</button>` : ''}</div>` : ''}
    <details class="joblog" ${ui.jobsOpen || failedJobs ? 'open' : ''}><summary>작업 기록 ${jobs.length ? `(${jobs.length})` : ''}</summary>
      <div class="panel">${jobs.length ? `<ul class="joblist">${jobs.map(jobLine).join('')}</ul>` : '<p class="muted">아직 작업이 없어요.</p>'}</div>
      <p class="small muted">작업은 하나씩 차례로 해요. 토큰 수는 구독 사용량을 가늠하는 참고 값이에요.</p>
    </details>
  `;
}

// ── 메일로 받은 주제
const MAIL_STATUS = { queued: ['대기 중', 'running'], parsing: ['메일 읽는 중', 'running'], started: ['글 쓰는 중', 'running'], replying: ['회신 보내는 중', 'running'], replied: ['회신 완료', 'done'], done: ['완료', 'done'], skipped: ['건너뜀', 'queued'], failed: ['멈춤', 'failed'] };
const timeText = (iso) => { if (!iso) return ''; const t = new Date(iso); return `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
function mailPanel() {
  const m = state.mail;
  if (!m || (!m.settings.hasPassword && !m.records.length)) return '';
  const rows = m.records.slice(0, 5).map((r) => {
    const [label, cls] = MAIL_STATUS[r.status] || [r.status, 'queued'];
    const posts = r.posts.map((x) => `<span class="small muted">· ${esc(x.title)} (${esc(STATUS[x.status] || x.status)})</span>`).join('<br>');
    const act = r.status === 'skipped' ? `<button class="btn small" data-mail-process="${r.id}">이 메일로 글쓰기</button>` : r.status === 'failed' ? `<button class="btn small" data-mail-process="${r.id}">다시 시도</button>` : '';
    return `<li><span class="pill ${cls}">${['running'].includes(cls) ? '<span class="spin"></span> ' : ''}${label}</span><span><b>${esc(r.topics.length ? r.topics.join(', ') : r.subject)}</b> <span class="small muted">${timeText(r.receivedAt)} 받음${r.repliedAt ? ` · ${timeText(r.repliedAt)} 회신` : ''}</span>${posts ? `<br>${posts}` : ''}${r.note ? `<br><span class="small muted">${esc(r.note)}</span>` : ''}${r.error ? `<br><span class="small" style="color:var(--stitch)">${esc(r.error).slice(0, 200)}</span>` : ''}</span>${act}</li>`;
  }).join('');
  const info = m.lastError ? `확인하지 못했어요: ${m.lastError}` : m.lastPollAt ? `${ago(m.lastPollAt)} 확인함` : '아직 확인하지 않았어요';
  return `<div class="h2row"><h2>메일로 받은 주제</h2><span class="row"><span class="small ${m.lastError ? '' : 'muted'}" ${m.lastError ? 'style="color:var(--stitch)"' : ''}>${esc(info)}</span><button class="btn small" data-act="mail-poll" ${m.polling ? 'disabled' : ''}>${m.polling ? '<span class="spin"></span> 확인 중' : '지금 확인'}</button></span></div>
    <div class="panel">${rows ? `<ul class="joblist">${rows}</ul>` : `<p class="muted small">아직 받은 메일이 없어요. ${esc(m.settings.allowedFrom.join(', '))}에서 제목에 "${esc(m.settings.subject)}" 문구를 넣어 보낸 메일이 여기에 나와요. 위의 <b>지금 확인</b>을 눌러 가져오세요.</p>`}</div>`;
}
function mailForm() {
  const m = state.mail.settings;
  const v = ui.mailForm;
  return `<section class="panel mailbox"><h2 style="margin-top:0">메일로 주제 받기</h2>
    <p class="small muted">휴대폰에서 글감을 메일로 보내 두면 돼요. 홈이나 여기서 <b>지금 메일 확인</b>을 누르면 등록한 주소에서 보낸 새 메일로 글을 만들고, 다 되면 결과를 회신해요. 최근 3일 안에 받은 메일만 바로 처리하고, 더 오래된 메일은 홈 목록에서 골라 처리할 수 있어요.</p>
    <div class="form">
      <label for="ml-addr">확인할 Gmail 주소<input type="text" id="ml-addr" data-mail="address" value="${esc(v.address)}" placeholder="example@gmail.com"></label>
      <label for="ml-pw">앱 비밀번호 <span class="hint-t">Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호에서 만든 16자리예요. 저장하면 다시 보여 주지 않고 이 컴퓨터(data/secrets.json)에만 남아요.</span><input type="password" id="ml-pw" data-mail="appPassword" value="${esc(v.appPassword || '')}" placeholder="${m.hasPassword ? '저장됨 (바꿀 때만 입력)' : 'xxxx xxxx xxxx xxxx'}" autocomplete="new-password"></label>
      <label for="ml-from">보낸 사람 메일 <span class="hint-t">이 주소에서 온 메일만 처리해요. 여러 개면 쉼표로 나눠 주세요.</span><input type="text" id="ml-from" data-mail="allowedFrom" value="${esc(v.allowedFrom)}"></label>
      <label for="ml-subj">메일 제목에 들어가는 말<input type="text" id="ml-subj" data-mail="subject" value="${esc(v.subject)}"></label>
      <label class="check"><input type="checkbox" data-mail="autoReply" ${v.autoReply ? 'checked' : ''}><span>다 되면 보낸 사람에게 자동으로 회신<small>아무도 검토하지 않은 초안이 나가요. 회신 맨 위에 확인할 것을 정리해 넣어요.</small></span></label>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-act="mail-save">저장</button><button class="btn" data-act="mail-test">연결 확인</button><button class="btn" data-act="mail-poll">지금 메일 확인</button></div>
    ${state.mail.lastPollAt || state.mail.lastError ? `<p class="small muted" style="margin-top:10px">마지막 확인 ${timeText(state.mail.lastPollAt)}${state.mail.lastError ? ` · <span style="color:var(--stitch)">${esc(state.mail.lastError)}</span>` : ''}</p>` : ''}
  </section>`;
}
function resetMailForm() { const m = state.mail.settings; ui.mailForm = { enabled: m.enabled, address: m.address, appPassword: '', allowedFrom: m.allowedFrom.join(', '), subject: m.subject, autoReply: m.autoReply }; }

// ── 흐름 탭 위쪽의 "다음 할 일" 띠
function renderHint() {
  const el = $('#hint');
  const flowTabs = ['topics', 'review', 'publish', 'research'];
  if (!state || !flowTabs.includes(ui.tab) || ui.onb.open) { el.innerHTML = ''; return; }
  const a = nextAction();
  el.innerHTML = a.tab === ui.tab || a.tone === 'done' || (!a.btn && a.tone !== 'wait') ? '' : `<div class="hintwrap">${actionCard(a, true)}</div>`;
}

// ── 처음 실행 안내
async function loadSystem(force) {
  ui.sys = null; ui.sysLoading = true;
  try { ui.sys = await api(`/api/system${force ? '?force=1' : ''}`); } catch (e) { ui.sys = { claude: { ok: false, error: e.message }, browser: { ok: false } }; }
  ui.sysLoading = false;
}
function sysRows() {
  if (ui.sysLoading || !ui.sys) return '<p class="muted"><span class="spin"></span> 확인하는 중이에요</p>';
  const s = ui.sys; const win = s.platform === 'win32';
  const term = win ? '시작 메뉴에서 PowerShell을 열고' : '터미널 앱을 열고';
  const row = (ok, title, okText, badText, fix) => `<li class="sys ${ok ? 'ok' : 'bad'}"><span class="mark">${ok ? '✓' : '!'}</span><div><b>${title}</b><p>${ok ? okText : badText}</p>${!ok && fix ? `<p class="fix">${fix}</p>` : ''}</div></li>`;
  return `<ul class="syslist">
    ${row(s.claude.ok, 'Claude 구독 연결', `연결됐어요${s.claude.plan ? ` · ${esc(s.claude.plan)} 구독` : ''}. 구독 사용량으로 글을 써서 구독료 외에 추가 비용은 없어요.`, esc(s.claude.error || '연결되지 않았어요.'),
      `${term} <code>claude</code> 를 입력하고 Enter를 누르세요. 브라우저가 열리면 Claude 구독 계정으로 로그인하고 <b>다시 확인</b>을 눌러 주세요.`)}
    ${row(s.browser.ok, '카드 이미지용 브라우저', '인스타그램 카드와 도표 이미지를 만들 수 있어요.', '크롬이나 엣지를 찾지 못해서 카드 이미지는 만들 수 없어요. 글은 그대로 만들어져요.', win ? 'Microsoft Edge가 깔려 있는지 확인해 주세요.' : 'Google Chrome을 깔아 주세요.')}
  </ul>`;
}
function settingsForm(prefix) {
  const v = ui.set;
  return `<div class="form">
    <label for="${prefix}-name">글쓴이 이름 <span class="hint-t">블로그와 카드에 나오는 이름이에요. 실명은 쓰지 않아요.</span><input type="text" id="${prefix}-name" data-set="characterName" value="${esc(v.characterName)}" placeholder="예: 오늘의 정리왕"></label>
    <label for="${prefix}-ig">인스타그램 계정 <span class="hint-t">카드 아래쪽에 나와요. 예: @my_account</span><input type="text" id="${prefix}-ig" data-set="instagramHandle" value="${esc(HANDLE_UNSET(v.instagramHandle) ? '' : v.instagramHandle)}" placeholder="@계정"></label>
    <label for="${prefix}-nl">뉴스레터 구독 주소 (선택) <span class="hint-t">블로그 글 끝 구독 안내에 들어가요. 아직 없으면 비워 두세요.</span><input type="text" id="${prefix}-nl" data-set="newsletterUrl" value="${esc(v.newsletterUrl)}" placeholder="https://…"></label>
  </div>`;
}
function resetSet() { const c = state.config; ui.set = { characterName: c.characterName || '', instagramHandle: c.instagramHandle || '', newsletterUrl: c.newsletterUrl || '' }; }
async function saveSet(extra = {}) {
  const v = { ...ui.set, ...extra };
  if (v.instagramHandle && !v.instagramHandle.startsWith('@')) v.instagramHandle = '@' + v.instagramHandle;
  if (!String(v.characterName || '').trim()) throw new Error('글쓴이 이름을 적어 주세요.');
  await api('/api/settings', v);
  ui.set = { ...ui.set, instagramHandle: v.instagramHandle };
}

// 분야를 아직 정하지 않았으면 6단계(분야 정하기 → 고정), 이미 정했으면 4단계(다시 보기)
const ONB_SETUP = ['환영', '연결 확인', '분야 정하기', '글쓴이·말투', '문체 샘플', '확인·고정'];
const ONB_AGAIN = ['환영', '연결 확인', '기본 설정', '시작'];
const onbSteps = () => (prof() && prof().lockedAt ? ONB_AGAIN : ONB_SETUP);
function resetProf() {
  ui.prof = { presetId: '', category: '', groups: '', audience: '', angle: '', voice: 'plain', noEllipsis: true, samples: ['', '', ''], sources: '', fetched: [], fetchErrors: [], fetching: false };
}
function openOnb(step = 0) { ui.onb = { open: true, step }; resetSet(); if (!ui.prof) resetProf(); renderOnb(); if (!ui.sys) loadSystem().then(renderOnb); }
function closeOnb() { ui.onb.open = false; $('#onb').hidden = true; render(); }

function presetGrid() {
  const v = ui.prof;
  const btn = (id, name, sub) => `<button class="preset ${v.presetId === id ? 'on' : ''}" data-preset="${id}" aria-pressed="${v.presetId === id}"><b>${esc(name)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</button>`;
  return `<div class="presets">${state.presets.map((p) => btn(p.id, p.name, p.groups.join(' · '))).join('')}${btn('custom', '직접 입력', '여기 없는 분야')}</div>`;
}
function profForm() {
  const v = ui.prof;
  if (!v.presetId) return '<p class="small muted">위에서 분야를 고르면 아래 칸이 채워져요. 고쳐 써도 돼요.</p>';
  return `<div class="form" style="margin-top:16px">
    <label for="pf-cat">분야 이름<input type="text" id="pf-cat" data-prof="category" value="${esc(v.category)}" placeholder="예: 캠핑, 커피, 부동산"></label>
    <label for="pf-groups">세부 분야 (쉼표로 2~4개) <span class="hint-t">주제 추천을 이 분야들에 고르게 나눠요.</span><input type="text" id="pf-groups" data-prof="groups" value="${esc(v.groups)}" placeholder="예: 장비, 캠핑장, 요리"></label>
    <label for="pf-aud">누가 읽나요<input type="text" id="pf-aud" data-prof="audience" value="${esc(v.audience)}" placeholder="예: 캠핑을 막 시작한 30대 가족"></label>
    <label for="pf-angle">내 관점·차별점 (선택) <span class="hint-t">다른 블로그와 다른 점 한 줄. 모든 글에 들어가는 장치가 돼요.</span><input type="text" id="pf-angle" data-prof="angle" value="${esc(v.angle)}" placeholder="예: 장비 가격을 1박 비용으로 바꿔 비교한다"></label>
  </div>`;
}
function voiceForm() {
  const v = ui.prof;
  const voices = state.voices || {};
  return `<div class="modes" role="radiogroup" aria-label="말투">${Object.entries(voices).map(([k, t]) => `<label><input type="radio" name="pf-voice" value="${k}" ${v.voice === k ? 'checked' : ''}><span>${esc(t.split('.')[0])}<small>${esc(t.split('.').slice(1).join('.').trim())}</small></span></label>`).join('')}</div>
    <label class="check" style="margin-top:10px"><input type="checkbox" data-prof-ellipsis="1" ${v.noEllipsis ? 'checked' : ''}><span>말줄임표(…) 쓰지 않기<small>AI 글에 자주 들어가는 말줄임표를 빼고, 남아 있으면 검수함에 표시해요.</small></span></label>`;
}
// 고정할 때 보낼 문체 샘플: 가져온 글 중 고른 것 + 직접 붙여 넣은 글(200자 이상), 최대 20편
const SAMPLE_MAX = 20;
function chosenSamples() {
  const v = ui.prof;
  const picked = v.fetched.filter((x) => x.on).map(({ title, text, source }) => ({ title, text, source }));
  return [...picked, ...v.samples.filter((x) => x.trim().length >= 200)].slice(0, SAMPLE_MAX);
}
function sampleForm() {
  const v = ui.prof;
  const picked = v.fetched.filter((x) => x.on).length;
  const list = v.fetched.length ? `<p class="small muted">가져온 글 ${v.fetched.length}편 중 ${picked}편을 써요. 말투가 다른 글(일상 글 등)은 체크를 빼 주세요.</p>
    <div class="form">${v.fetched.map((x, k) => `<label class="check"><input type="checkbox" data-prof-pick="${k}" ${x.on ? 'checked' : ''}><span>${esc(x.title || '(제목 없음)')}<small>${x.chars.toLocaleString()}자${x.category ? ` · ${esc(x.category)}` : ''} · ${esc(x.source)}</small></span></label>`).join('')}</div>` : '';
  const errs = v.fetchErrors.length ? `<ul class="small muted">${v.fetchErrors.map((e) => `<li>${esc(e.source)}: ${esc(e.error)}</li>`).join('')}</ul>` : '';
  return `<div class="form">
      <label for="pf-src">글 주소·블로그 주소·파일 경로 <span class="hint-t">한 줄에 하나씩. 네이버 블로그 주소를 넣으면 최근 글 10편을 가져와요(카테고리 주소면 그 카테고리만). 이 컴퓨터의 .md·.txt·.html 파일이나 폴더 경로도 돼요.</span><textarea id="pf-src" data-prof="sources" placeholder="https://blog.naver.com/아이디/글번호&#10;https://blog.naver.com/아이디&#10;/Users/나/Documents/예전 글" style="min-height:90px">${esc(v.sources)}</textarea></label>
    </div>
    <div class="row" style="margin:8px 0 12px"><button class="btn" data-onb="fetch-samples" ${v.fetching ? 'disabled' : ''}>${v.fetching ? '가져오는 중' : '가져오기'}</button></div>
    ${list}${errs}
    <details style="margin-top:12px"><summary>직접 붙여 넣기</summary>
      <div class="form">${v.samples.map((x, k) => `<label for="pf-s${k}">글 ${k + 1}<textarea id="pf-s${k}" data-prof-sample="${k}" placeholder="블로그 글 본문을 그대로 붙여 넣어 주세요. 200자 이상인 글만 써요." style="min-height:80px">${esc(x)}</textarea></label>`).join('')}</div>
    </details>`;
}
function profSummary() {
  const v = ui.prof;
  const n = chosenSamples().length;
  const row = (k, t) => `<li><span class="muted small">${k}</span><b>${esc(t || '-')}</b></li>`;
  return `<ul class="sumlist">${row('분야', v.category)}${row('세부 분야', v.groups)}${row('독자', v.audience)}${row('내 관점', v.angle)}${row('글쓴이', ui.set.characterName)}${row('말투', ((state.voices || {})[v.voice] || '').split('.')[0])}${row('문체 샘플', n ? `${n}편` : '없음 (기본 문체로 시작)')}</ul>`;
}

function renderOnb() {
  const box = $('#onb');
  if (!ui.onb.open) { box.hidden = true; return; }
  box.hidden = false;
  const steps = onbSteps();
  const locked = steps === ONB_AGAIN;
  const i = ui.onb.step;
  const dots = `<ol class="onb-steps">${steps.map((t, k) => `<li class="${k < i ? 'done' : k === i ? 'on' : ''}"><span>${k < i ? '✓' : k + 1}</span>${t}</li>`).join('')}</ol>`;
  let body = '';
  let foot = '';
  const back = '<button class="btn" data-onb="back">이전</button>';
  if (i === 0) {
    body = `<h2 id="onbTitle">반가워요, 콘텐츠 스튜디오예요</h2>
      <p>${locked ? `<b>${esc(category())}</b> 분야로 설정되어 있어요. ` : '먼저 <b>어떤 분야의 글을 쓸지</b> 정해요. 분야를 정하면 그 분야에 맞는 문체·출처·채널 규칙을 만들어 두고, '}주제 하나만 정하면 <b>블로그 글, 인스타그램 카드, 쓰레드 글</b>이 한 번에 나와요. 모든 작업은 이 컴퓨터 안에서 하고, Claude 구독으로 써요.</p>
      <ol class="journey mini">
        <li class="active"><button disabled><span class="num">1</span><span class="who">나 · 1분</span><b>주제 정하기</b><span class="note">추천에서 고르거나 직접 입력</span></button></li>
        <li><button disabled><span class="num">2</span><span class="who">자동 · 10분 안팎</span><b>리서치·초안·SNS</b><span class="note">조사하고 카드까지 만들기</span></button></li>
        <li class="active"><button disabled><span class="num">3</span><span class="who">나 · 10분</span><b>검수</b><span class="note">승인하거나 고칠 점 적기</span></button></li>
        <li class="active"><button disabled><span class="num">4</span><span class="who">나 · 5분</span><b>발행</b><span class="note">복사해서 붙여 넣기</span></button></li>
      </ol>
      <p class="small muted">강조된 단계는 내가 직접 해요. 바라는 점은 오른쪽 아래 <b>의견 남기기</b>에 적으면 다음 글부터 반영해요.</p>`;
    foot = `${locked ? '<button class="btn" data-onb="skip">닫기</button>' : ''}<button class="btn primary big" data-onb="next">시작하기</button>`;
  } else if (i === 1) {
    body = `<h2 id="onbTitle">연결 확인</h2><p>글을 쓰려면 아래 두 가지가 필요해요.</p>${sysRows()}`;
    const ok = ui.sys && ui.sys.claude.ok;
    foot = `${back}<button class="btn" data-onb="recheck">다시 확인</button><button class="btn primary big" data-onb="next">${ok || ui.sysLoading ? '다음' : '나중에 연결할게요'}</button>`;
  } else if (locked && i === 2) {
    body = `<h2 id="onbTitle">기본 설정</h2><p>나중에 <b>설정</b>에서 언제든 바꿀 수 있어요.</p>${settingsForm('onb')}`;
    foot = `${back}<button class="btn primary big" data-onb="save">저장하고 다음</button>`;
  } else if (locked) {
    const t = state.topics;
    const hasTopics = !!(t && t.topics.some((x) => !x.used));
    const choice = (act, title, desc, primary) => `<button class="choice ${primary ? 'primary' : ''}" data-onb="${act}"><b>${title}</b><span>${desc}</span></button>`;
    body = `<h2 id="onbTitle">어떻게 시작할까요?</h2>
      <div class="choices">
        ${hasTopics ? choice('topics', '추천 주제에서 고르기', '받아 둔 추천 주제가 있어요.', true)
          : choice('gen', '추천 주제 받기', `요즘 ${esc(category())} 소식으로 주제 12개를 골라 드려요. 몇 분 걸리고 구독 사용량을 써요.`, true)}
        ${choice('custom', '쓰고 싶은 주제 직접 넣기', '정해 둔 주제가 있으면 바로 리서치부터 시작해요.')}
        ${choice('browse', '먼저 둘러볼게요', '홈에서 글 쓰는 순서와 지금 할 일을 볼 수 있어요.')}
      </div>`;
    foot = back;
  } else if (i === 2) {
    body = `<h2 id="onbTitle">어떤 분야의 글을 쓸까요?</h2>
      <p>한 번 정하면 <b>바꿀 수 없어요.</b> 이 분야에 맞춰 문체·출처·채널 규칙을 만들기 때문이에요. 다른 분야도 쓰고 싶으면 프로그램 폴더를 하나 더 복사해서 따로 설정하면 돼요.</p>
      ${presetGrid()}${profForm()}`;
    foot = `${back}<button class="btn primary big" data-onb="prof-next" ${ui.prof.presetId ? '' : 'disabled'}>다음</button>`;
  } else if (i === 3) {
    body = `<h2 id="onbTitle">글쓴이와 말투</h2><p>이름·계정은 나중에 <b>설정</b>에서 바꿀 수 있어요. 말투는 분야와 함께 고정돼요.</p>
      ${settingsForm('onb')}<h3>말투</h3>${voiceForm()}`;
    foot = `${back}<button class="btn primary big" data-onb="save">다음</button>`;
  } else if (i === 4) {
    body = `<h2 id="onbTitle">예전에 쓴 글이 있나요? (선택)</h2>
      <p>예전 글의 주소나 파일 위치를 알려 주면 줄 길이, 자주 쓰는 연결어, 도입·마무리 방식을 세어서 <b>내 말투</b>로 써요. <b>내가 쓴 글만</b> 넣어 주세요. 없으면 비워 두세요. 고른 말투로 시작해요.</p>
      ${sampleForm()}`;
    foot = `${back}<button class="btn primary big" data-onb="next">다음</button>`;
  } else {
    body = `<h2 id="onbTitle">이 분야로 고정할까요?</h2>
      ${profSummary()}
      <p class="notice">고정하면 분야·세부 분야·독자·관점·말투는 <b>다시 바꿀 수 없어요.</b> 고정하는 즉시 이 분야의 믿을 만한 출처와 글쓰기 규칙을 조사해 만들어요(5~10분, 구독 사용량을 써요).</p>`;
    foot = `${back}<button class="btn primary big" data-onb="lock">이 분야로 고정하고 시작</button>`;
  }
  box.innerHTML = `<div class="modal-box onb-box">${dots}<div class="onb-body">${body}</div><div class="row onb-foot">${foot}</div></div>`;
}
async function finishOnb(then) {
  await api('/api/settings', { onboarded: true });
  state.config.onboarded = true;
  ui.onb.open = false; $('#onb').hidden = true;
  if (then === 'gen') { await api('/api/topics/generate', {}); toast('추천 주제를 찾고 있어요. 몇 분 걸려요'); ui.tab = 'topics'; }
  else if (then === 'topics') ui.tab = 'topics';
  else if (then === 'custom') { ui.tab = 'topics'; ui.showCustom = true; }
  else ui.tab = 'home';
  await refresh(true);
  if (then === 'custom') { const t = document.getElementById('c-title'); if (t) t.focus(); }
}
async function lockProfile() {
  const v = ui.prof;
  await api('/api/profile/lock', { profile: { presetId: v.presetId, category: v.category, groups: v.groups, audience: v.audience, angle: v.angle, voice: v.voice, noEllipsis: v.noEllipsis }, samples: chosenSamples() });
  await api('/api/settings', { onboarded: true });
  ui.onb.open = false; $('#onb').hidden = true; ui.tab = 'home';
  toast(`${v.category} 분야로 고정했어요. 맞춤 규칙을 만들기 시작해요`);
  await refresh(true);
}

// ── 설정
function renderSettings() {
  if (!ui.set) resetSet();
  if (!ui.mailForm) resetMailForm();
  if (!ui.sys && !ui.sysLoading) loadSystem().then(() => { if (ui.tab === 'settings') renderSettings(); });
  const c = state.config;
  $('#view').innerHTML = `<h1>설정</h1><p class="sub">이 컴퓨터에만 저장돼요 (data/settings.json).</p>
    <div class="settings">
      ${profilePanel()}
      <section class="panel"><h2 style="margin-top:0">기본 정보</h2>${settingsForm('st')}<div class="row" style="margin-top:14px"><button class="btn primary" data-act="settings-save">저장</button></div></section>
      ${colorPanel()}
      ${mailForm()}
      <section class="panel"><h2 style="margin-top:0">연결 상태</h2>${sysRows()}<div class="row"><button class="btn" data-act="sys-recheck">다시 확인</button></div>
        <p class="small muted" style="margin-top:12px">글쓰기 모델: ${esc(c.model || '기본값')}${c.mock ? ' · 테스트 모드(실제로 글을 쓰지 않아요)' : ''}</p></section>
      <section class="panel"><h2 style="margin-top:0">도움말</h2>
        <div class="row"><button class="btn" data-act="onb-open">처음 안내 다시 보기</button><button class="btn" data-act="open-data">저장 폴더 열기</button></div>
        <ul class="help">
          <li>만든 건 모두 이 컴퓨터의 <code>data</code> 폴더에 있어요. 추천 주제는 topics, 글은 posts, 조사 기록은 research 폴더예요.</li>
          <li>창을 닫아도 프로그램이 켜져 있으면 작업은 계속돼요. 완전히 끄려면 폴더의 stop 파일을 실행하세요.</li>
          <li>작업이 계속 멈추면 구독 사용량 한도일 수 있어요. 시간이 좀 지난 뒤 홈에서 다시 시도해 주세요.</li>
          <li>추천 주제는 언제든 새로 받을 수 있어요. 받은 주제를 다 쓰지 않아도 돼요.</li>
        </ul></section>
    </div>`;
}

// 고정한 분야(읽기 전용)
function profilePanel() {
  const p = prof();
  if (!p || !p.lockedAt) return `<section class="panel"><h2 style="margin-top:0">분야</h2><p class="muted">아직 분야를 정하지 않았어요.</p><button class="btn primary" data-act="onb-open">분야 정하기</button></section>`;
  const st = p.ready ? '<span class="pill done">규칙 준비됨</span>' : (p.setup || {}).status === 'failed' ? '<span class="pill failed">규칙 만들기 멈춤</span>' : '<span class="pill running"><span class="spin"></span> 규칙 만드는 중</span>';
  const row = (k, t) => `<li><span class="muted small">${k}</span><b>${esc(t || '-')}</b></li>`;
  return `<section class="panel"><h2 style="margin-top:0">분야 <span class="chip">고정됨</span> ${st}</h2>
    <ul class="sumlist">${row('분야', p.category)}${row('세부 분야', (p.groups || []).join(', '))}${row('독자', p.audience)}${row('내 관점', p.angle)}${row('말투', (p.voiceText || '').split('.')[0])}${row('글 종류', (state.pillars || []).map((x) => x.name).join(', '))}${row('고정한 날', (p.lockedAt || '').slice(0, 10))}</ul>
    <p class="small muted">분야는 처음에 정하면 바꾸지 않아요. 다른 분야도 쓰고 싶으면 프로그램 폴더를 통째로 하나 더 복사해서 따로 설정하세요. 만들어진 규칙은 <code>brand/</code> 폴더에 있고, 바라는 점은 <b>의견 남기기</b>로 고쳐 나가면 돼요.</p>
    ${p.ready ? '' : '<button class="btn" data-act="setup-retry">맞춤 규칙 다시 만들기</button>'}</section>`;
}
// 카드 색: 고정 뒤에도 바꿀 수 있다
function colorPanel() {
  const p = prof();
  if (!p || !p.lockedAt) return '';
  const c = ui.colors || (ui.colors = { ...(p.colors || {}) });
  return `<section class="panel"><h2 style="margin-top:0">카드 색</h2><p class="small muted">인스타 카드와 도표에 쓰는 색이에요. 진한 색은 표지 바탕, 강조색은 숫자·라벨에 들어가요. 바꾸면 다음에 만드는 카드부터 적용돼요.</p>
    <div class="row"><label class="colorpick">진한 색<input type="color" data-color="primary" value="${esc(c.primary)}"></label><label class="colorpick">강조색<input type="color" data-color="accent" value="${esc(c.accent)}"></label>
    <span class="swatch" style="background:${esc(c.primary)}"><i style="background:${esc(c.accent)}"></i></span><button class="btn primary" data-act="colors-save">색 저장</button></div></section>`;
}

function renderTopics() {
  const t = state.topics;
  const topicJob = busyJob('topics');
  const head = `<h1>주제 정하기</h1><p class="sub">쓰고 싶은 주제를 직접 넣거나 추천에서 고르세요. 주제 하나에 글 한 편을 만들어요.</p>${customForm()}`;
  if (!t || topicJob) {
    $('#view').innerHTML = `${head}<section class="panel recobox"><h2 style="margin-top:0">추천 주제</h2>${topicJob
      ? `<p><span class="spin"></span> 요즘 ${esc(category())} 소식으로 주제 12개를 고르는 중이에요 (${topicJob.elapsed || 0}초). 몇 분 걸려요. 그동안 직접 넣은 주제로 먼저 시작해도 돼요.</p>`
      : `<p class="muted">요즘 ${esc(category())} 소식으로 주제 12개를 골라 드려요. 몇 분 걸리고 구독 사용량을 써요.</p><button class="btn primary big" data-act="gen-topics">추천 주제 받기</button>`}</section>`;
    return;
  }
  const n = Object.keys(ui.picks).filter((k) => ui.picks[k]).length;
  const card = (x) => {
    const label = pillarName(x.pillar);
    const sel = !!ui.picks[x.id];
    if (x.used) return `<div class="tcard used"><div class="chips"><span class="chip">${esc(label)}</span><span class="chip donechip">글 시작함</span></div><h4>${esc(x.title)}</h4></div>`;
    return `<div class="tcard ${sel ? 'sel' : ''}" data-pick="${x.id}" role="button" tabindex="0" aria-pressed="${sel}">
      <div class="chips"><span class="chip">${esc(label)}</span><span class="chip soft">${esc(x.format || '')}</span></div>
      <h4>${esc(x.title)}</h4>
      <p>${esc(x.why_now)}</p>
      ${x.angles && x.angles.length ? `<p>관점 후보: ${x.angles.map(esc).join(' / ')}</p>` : ''}
      ${sel ? `<input type="text" id="take-${x.id}" data-take="${x.id}" placeholder="한 줄 관점 (선택) 예: 결국 초보에게는 무료판이면 충분하다" value="${esc(ui.takes[x.id] || '')}">
      <select data-mode="${x.id}" aria-label="진행 방식"><option value="full" ${(ui.modes[x.id] || 'full') === 'full' ? 'selected' : ''}>리서치 후 글쓰기 (추천)</option><option value="research" ${ui.modes[x.id] === 'research' ? 'selected' : ''}>리서치만 하고 저장</option><option value="onepass" ${ui.modes[x.id] === 'onepass' ? 'selected' : ''}>한 번에 쓰기 (빠름)</option></select>` : ''}
    </div>`;
  };
  const unused = t.topics.filter((x) => !x.used).length;
  const groups = [...new Set([...((prof() || {}).groups || []), ...t.topics.map((x) => x.group || '기타')])];
  $('#view').innerHTML = `${head}
    <div class="h2row"><h2>추천 주제 <span class="small muted" style="font-weight:400">${esc(t.season_phase || '')} · ${ago(t.generated_at)} 받음 · ${unused}개 남음</span></h2><button class="btn" data-act="gen-topics">새로 추천 받기</button></div>
    <p class="small muted" style="margin-top:-4px">카드를 누르면 골라져요. 한 줄 관점을 적으면 그 관점으로 써요. 여러 개를 고르면 한 편씩 차례로 써요.</p>
    ${groups.map((g) => { const list = t.topics.filter((x) => (x.group || '기타') === g); return list.length ? `<h3>${esc(g)}</h3><div class="topics">${list.map(card).join('')}</div>` : ''; }).join('')}
    ${n ? `<div class="floatbar"><span><b>${n}</b>개 골랐어요 · 글 ${n}편을 써요</span><button class="btn" data-act="clear-picks">선택 해제</button><button class="btn primary big" data-act="select">이 주제로 글 쓰기</button></div>` : ''}
  `;
}

function customForm() {
  const c = ui.custom;
  if (!ui.showCustom) return `<button class="panel customcta" data-act="show-custom"><b>✎ 쓰고 싶은 주제 직접 입력</b><span>정해 둔 주제가 있으면 바로 리서치부터 시작해요. 조사 없이 메모로만 쓸 수도 있어요.</span></button>`;
  const groups = (prof() || {}).groups || [];
  const pillars = (state.pillars || []).map((x) => [x.id, `${x.name}${x.format ? ` · ${x.format}` : ''}`]);
  if (!c.group) c.group = groups[0] || '';
  if (!c.pillar && pillars[0]) c.pillar = pillars[0][0];
  const mode = (v, t, d) => `<label><input type="radio" name="c-mode" value="${v}" ${c.mode === v ? 'checked' : ''}><span>${t}<small>${d}</small></span></label>`;
  return `<section class="panel" style="margin-bottom:24px">
    <h2 style="margin-top:0">주제 직접 입력</h2>
    <div class="form">
      <label for="c-title">주제<input type="text" id="c-title" data-c="title" value="${esc(c.title || '')}" placeholder="쓰고 싶은 주제를 한 줄로"></label>
      <div class="two">
        <label for="c-group">세부 분야<select id="c-group" data-c="group">${groups.map((g) => `<option ${c.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        <label for="c-pillar">종류<select id="c-pillar" data-c="pillar">${pillars.map(([v, t]) => `<option value="${v}" ${c.pillar === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <label for="c-take">한 줄 관점 (선택)<input type="text" id="c-take" data-c="take" value="${esc(c.take || '')}" placeholder="이 글의 결론이 될 내 생각"></label>
      <label for="c-notes">메모·흐름 (선택, '조사 없이 쓰기'면 필수)<textarea id="c-notes" data-c="notes" placeholder="내가 아는 것, 넣고 싶은 경험, 꼭 확인할 것. 글 흐름을 줄마다 적어도 돼요." style="min-height:130px">${esc(c.notes || '')}</textarea></label>
      <label class="check"><input type="checkbox" data-c-outline="1" ${c.outline ? 'checked' : ''}><span>메모에 적은 흐름대로 쓰기<small>적은 순서와 마무리를 그대로 따라요. 줄마다 사실인지 확인하고, 확인이 안 되는 내용은 검수함에 표시해요.</small></span></label>
      <div class="modes" role="radiogroup" aria-label="진행 방식">
        ${mode('full', '리서치 후 글쓰기 (추천)', '리서치 → 초안 → SNS를 단계별로 나눠 써요. 요금·기능 비교, 법·제도처럼 숫자와 사실이 중요한 글에 맞아요.')}
        ${mode('research', '리서치만 하고 저장', '조사한 것만 리서치 기록에 남겨요. 나중에 거기서 글을 쓸 수 있어요.')}
        ${mode('notes', '조사 없이 내 메모로 쓰기', '웹 조사 없이 위 메모만으로 초안을 써요.')}
        ${mode('onepass', '한 번에 쓰기 (빠름)', '리서치부터 SNS까지 한 번에 이어서 써요. 시험해 보니 사용량이 약 3분의 1 적고 더 빨랐어요. 개념 설명이나 가벼운 글에 맞아요.')}
      </div>
      <div class="row"><button class="btn primary" data-act="custom-go">시작</button><button class="btn" data-act="hide-custom">닫기</button></div>
    </div>
  </section>`;
}

function postList(filter, current, attr) {
  const posts = state.posts.filter(filter);
  return `<ul class="postlist">${posts.map((p) => `<li><button class="${p.id === current ? 'on' : ''}" data-${attr}="${p.id}"><span class="pill ${p.status === 'failed' ? 'failed' : WORKING.includes(p.status) ? 'running' : 'done'}">${STATUS[p.status] || p.status}</span><span class="t">${esc(p.title)}</span><span class="small muted">${esc(p.id)}</span></button></li>`).join('')}</ul>`;
}

async function renderReview() {
  const list = state.posts.filter((p) => ['review', 'revising', 'writing', 'writing_social', 'researching', 'queued', 'failed'].includes(p.status));
  if (!list.length) { $('#view').innerHTML = '<div class="empty"><h1>검수할 글이 없어요</h1><p>주제를 정하면 다 쓴 글이 여기에 올라와요.</p><p class="row" style="justify-content:center"><button class="btn primary" data-goto="topics">주제 정하러 가기</button><button class="btn" data-goto="home">홈으로</button></p></div>'; return; }
  if (!ui.reviewId || !list.find((p) => p.id === ui.reviewId)) ui.reviewId = (list.find((p) => p.status === 'review') || list[0]).id;
  const p = list.find((x) => x.id === ui.reviewId);
  $('#view').innerHTML = `<h1>검수함</h1><p class="sub">초안을 읽고 승인하거나 고칠 점을 적어 주세요. 승인하면 인스타·쓰레드 글도 같이 승인돼요.</p>
    <div class="split">${postList((x) => list.includes(x), ui.reviewId, 'review-id')}<div id="rv"><div class="empty"><span class="spin"></span></div></div></div>`;
  if (WORKING.includes(p.status)) { $('#rv').innerHTML = `<div class="empty"><p><span class="spin"></span> ${STATUS[p.status]}이에요. 끝나면 여기에 나와요.</p></div>`; return; }
  if (p.status === 'failed') { $('#rv').innerHTML = `<div class="error"><b>만들다 멈췄어요.</b><br>${esc(p.error || '')}</div><p class="row" style="margin-top:12px"><button class="btn primary" data-retry-post="${p.id}">다시 시도</button></p>`; return; }
  const d = await detail(p.id);
  if (ui.tab !== 'review' || ui.reviewId !== p.id) return;
  const media = (d.brief && d.brief.media) || [];
  const titles = (d.meta && d.meta.titles) || [mdTitle(d.draft)];
  const choice = ui.titleChoice[p.id] ?? 0;
  const checks = Array.isArray(d.checks) ? d.checks : [];
  const warn = checks.filter((c) => c.status !== 'ok').length;
  const st = { ok: '확인됨', one_source: '출처 1곳', unverified: '확인 필요', violation: '규칙 위반' };
  const social = d.social || {};
  const cards = (d.post.cards || []).filter((f) => f.endsWith('.png'));
  $('#rv').innerHTML = `
    <div class="review">
      <div>
        <article class="phone">${mdToHtml(d.draft, { media })}</article>
        <h2>인스타그램 카드</h2>
        ${cards.length ? `<div class="cards">${cards.map((f) => `<img src="/cards/${p.id}/${f}?v=${encodeURIComponent(d.post.updatedAt)}" alt="카드 ${f}">`).join('')}</div>` : '<p class="muted small">카드 이미지가 없어요.</p>'}
        ${social.instagram ? `<h3>캡션</h3><div class="pre">${esc(social.instagram.caption)}\n\n${(social.instagram.hashtags || []).map((h) => '#' + h).join(' ')}</div>` : ''}
        <h2>쓰레드 글</h2>
        <div class="threads">${((social.threads && social.threads.thread) || []).map((t) => `<div class="tpost">${esc(t)}</div>`).join('')}</div>
        ${social.threads && social.threads.singles ? `<h3>단독 글</h3><div class="threads">${social.threads.singles.map((s) => `<div class="tpost">${esc(s.text)}</div>`).join('')}</div>` : ''}
      </div>
      <aside class="side">
        <div class="panel">
          <h3 style="margin-top:0">제목 고르기</h3>
          <div class="titles">${titles.map((t, i) => `<label><input type="radio" name="title-${p.id}" data-title="${i}" ${i === choice ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>
          <div class="row" style="margin-top:14px">
            <button class="btn primary big" data-approve="${p.id}">승인</button>
            <button class="btn big" data-toggle-revise="${p.id}">수정 요청</button>
          </div>
          <div class="row" style="margin-top:8px"><button class="btn small" data-mail-post="${p.id}">메일로 보내기</button>${d.post.mailedAt ? `<span class="small muted">${timeText(d.post.mailedAt)} 보냄</span>` : ''}</div>
          ${ui.showRevise[p.id] ? `<div style="margin-top:12px"><textarea id="revise-${p.id}" data-revise="${p.id}" placeholder="예: 두 번째 문단은 너무 길어요. 비유를 더 일상적인 예로 바꿔 주세요.">${esc(ui.revise[p.id] || '')}</textarea><div class="row" style="margin-top:8px"><button class="btn primary" data-send-revise="${p.id}">이대로 고쳐 주세요</button></div></div>` : ''}
          ${d.topic && d.topic.research_id ? `<p class="small muted" style="margin-top:10px">근거: <a href="#" data-goto-research="${d.topic.research_id}">리서치 ${esc(d.topic.research_id)}</a> · ${MODE_LABEL[d.topic.research_mode] || ''}</p>` : ''}
          ${d.revision && d.revision.requests.length ? `<p class="small muted" style="margin-top:10px">지난 수정 요청 ${d.revision.requests.length}건 · 마지막: ${esc(d.revision.requests[d.revision.requests.length - 1].applied_note || d.revision.requests[d.revision.requests.length - 1].comment)}</p>` : ''}
        </div>
        <div class="panel">
          <h3 style="margin-top:0">사진 (인스타 표지·블로그)</h3>
          ${(d.photos || []).length ? `<div class="cards">${d.photos.map((ph) => `<label style="display:grid;gap:4px;font-size:12px"><img src="/photos/${p.id}/${ph.file}" alt="${esc(ph.title)}"><span><input type="radio" name="cover-${p.id}" data-cover="${p.id}" value="${ph.file}" ${(d.post.coverPhoto || (d.photos.find((x) => x.kind === 'own') || d.photos[0]).file) === ph.file ? 'checked' : ''}> 표지</span><span class="muted">${ph.kind === 'own' ? '직접 찍은 사진' : esc(ph.license)}</span></label>`).join('')}</div>
          <label class="small" style="display:block;margin-top:6px"><input type="radio" name="cover-${p.id}" data-cover="${p.id}" value="none" ${d.post.coverPhoto === 'none' ? 'checked' : ''}> 표지에 사진 쓰지 않기</label>` : '<p class="small muted">쓸 수 있는 사진을 찾지 못했어요. 직접 찍은 사진을 올리면 표지에 들어가요.</p>'}
          <label class="btn" style="display:inline-block;margin-top:10px;cursor:pointer">직접 찍은 사진 올리기<input type="file" accept="image/jpeg,image/png" data-upload="${p.id}" hidden></label>
          <p class="small muted">언론사·공식 사이트 사진은 저작권 때문에 쓰지 않아요. 위키미디어 사진에는 출처를 자동으로 붙여요.</p>
        </div>
        <div class="panel">
          <h3 style="margin-top:0">자동 점검 ${warn ? `<span class="pill failed">확인할 것 ${warn}</span>` : '<span class="pill done">문제 없음</span>'}</h3>
          <ul class="checks">${checks.map((c) => `<li><span class="st ${esc(c.status)}">${st[c.status] || esc(c.status)} · ${esc(CHECK_TYPE[c.type] || c.type)}</span><span>${esc(c.text)}</span>${c.source_url ? `<a class="small" href="${esc(c.source_url)}" target="_blank" rel="noopener">출처 열기</a>` : ''}${c.note ? `<span class="small muted">${esc(c.note)}</span>` : ''}</li>`).join('')}</ul>
        </div>
        <div class="panel">
          <h3 style="margin-top:0">사진·영상 후보</h3>
          ${media.length ? `<ul class="checks">${media.map((m) => `<li><span class="st ok">${esc({ youtube: '영상', social: 'SNS', photo: '사진', chart: '도표' }[m.kind] || m.kind)} · ${esc(m.placement || '')}</span><span>${esc(m.title)}</span>${m.url ? `<a class="small" href="${esc(m.url)}" target="_blank" rel="noopener">열기</a>` : ''}<span class="small muted">${esc(m.license || '')}${m.credit ? ' · ' + esc(m.credit) : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">후보가 없어요.</p>'}
        </div>
      </aside>
    </div>`;
}

async function renderPublish() {
  const list = state.posts.filter((p) => p.status === 'approved' || p.status === 'published');
  if (!list.length) { $('#view').innerHTML = '<div class="empty"><h1>올릴 글이 없어요</h1><p>검수함에서 승인한 글이 여기에 올라와요.</p><p class="row" style="justify-content:center"><button class="btn primary" data-goto="review">검수함으로</button><button class="btn" data-goto="home">홈으로</button></p></div>'; return; }
  if (!ui.publishId || !list.find((p) => p.id === ui.publishId)) ui.publishId = (list.find((p) => p.status === 'approved') || list[0]).id;
  const p = list.find((x) => x.id === ui.publishId);
  $('#view').innerHTML = `<h1>발행</h1><p class="sub">복사해서 네이버 블로그, 인스타그램, 쓰레드에 붙여 넣으세요.</p>
    <div class="split">${postList((x) => list.includes(x), ui.publishId, 'publish-id')}<div id="pb"></div></div>`;
  const d = await detail(p.id);
  if (ui.tab !== 'publish' || ui.publishId !== p.id) return;
  const media = (d.brief && d.brief.media) || [];
  const titles = (d.meta && d.meta.titles) || [mdTitle(d.draft)];
  const title = titles[ui.titleChoice[p.id] ?? d.post.titleIndex ?? 0] || titles[0];
  const social = d.social || {};
  const blogUrl = ui.blogUrl[p.id] ?? d.post.blogUrl ?? '';
  const fill = (s) => String(s).replace(/\{\{BLOG_URL\}\}/g, blogUrl || '[블로그 주소]');
  const cards = (d.post.cards || []).filter((f) => f.endsWith('.png'));
  const credits = (d.photos || []).filter((ph) => ph.credit).map((ph) => ph.credit).join('\n') || media.filter((m) => m.credit).map((m) => `사진: ${m.credit}`).join('\n');
  const tags = ((d.meta && d.meta.tags) || []).join(' ');
  $('#pb').innerHTML = `
    <div class="panel">
      <h2 style="margin-top:0">1. 네이버 블로그</h2>
      <p class="small muted">본문의 [영상: …], [사진: …], [도표: …] 자리에 링크나 이미지를 넣어 주세요. 영상은 링크만 붙여 넣으면 돼요.</p>
      <div class="row">
        <button class="btn" data-copy="title">제목 복사</button>
        <button class="btn primary" data-copy="body">본문 복사</button>
        <button class="btn" data-copy="tags">태그 복사</button>
        ${credits ? '<button class="btn" data-copy="credits">사진 출처 복사</button>' : ''}
        <button class="btn" data-mail-post="${p.id}">메일로 보내기</button>${d.post.mailedAt ? `<span class="small muted">${timeText(d.post.mailedAt)} 보냄</span>` : ''}
      </div>
      <p class="small" style="margin-top:10px"><b>제목</b> ${esc(title)}</p>
      ${(d.photos || []).length ? `<h3>사진 (본문의 [사진] 자리에 넣고 출처 문구를 함께)</h3><div class="cards">${d.photos.map((ph) => `<a href="/photos/${p.id}/${ph.file}" download="${p.id}-${ph.file}" title="${esc(ph.credit || '직접 찍은 사진')}"><img src="/photos/${p.id}/${ph.file}" alt="${esc(ph.title)}"></a>`).join('')}</div>` : ''}
      ${(d.post.charts || []).length ? `<h3>도표 이미지 (본문의 [도표] 자리에 넣기)</h3><div class="cards">${d.post.charts.map((f) => `<a href="/charts/${p.id}/${f}" download="${p.id}-${f}"><img src="/charts/${p.id}/${f}?v=${encodeURIComponent(d.post.updatedAt)}" alt="도표 ${f}"></a>`).join('')}</div>` : ''}
    </div>
    <div class="panel" style="margin-top:14px">
      <h2 style="margin-top:0">2. 블로그 주소 넣고 마무리</h2>
      <div class="row"><input type="url" id="url-${p.id}" data-blogurl="${p.id}" placeholder="https://blog.naver.com/…" value="${esc(blogUrl)}" style="flex:1"><button class="btn primary" data-published="${p.id}">${p.status === 'published' ? '주소 저장' : '발행 완료'}</button></div>
      <p class="small muted">주소를 넣으면 쓰레드 마지막 글에 링크를 채워 드려요.</p>
    </div>
    <div class="panel" style="margin-top:14px">
      <h2 style="margin-top:0">3. 인스타그램</h2>
      ${cards.length ? `<div class="cards">${cards.map((f) => `<a href="/cards/${p.id}/${f}" download="${p.id}-${f}"><img src="/cards/${p.id}/${f}?v=${encodeURIComponent(d.post.updatedAt)}" alt="카드 ${f}"></a>`).join('')}</div>` : ''}
      <div class="row" style="margin-top:10px"><button class="btn" data-open-cards="${p.id}">카드 폴더 열기</button><button class="btn primary" data-copy="caption">캡션 복사</button></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <h2 style="margin-top:0">4. 쓰레드</h2>
      <h3>블로그 요약 타래 (순서대로 이어 올리기)</h3>
      <div class="threads">${((social.threads && social.threads.thread) || []).map((t, i) => `<div class="tpost">${esc(fill(t))}<button class="btn" data-copy-thread="${i}">복사</button></div>`).join('')}</div>
      <h3>단독 글</h3>
      <div class="threads">${((social.threads && social.threads.singles) || []).map((s, i) => `<div class="tpost">${esc(s.text)}<button class="btn" data-copy-single="${i}">복사</button></div>`).join('')}</div>
    </div>`;
  ui._pub = { d, title, tags, credits, social, fill, media };
}


async function renderResearch() {
  const q = ui.rsearch.trim().toLowerCase();
  const list = state.research.filter((r) => !q || `${r.title} ${r.summary} ${r.id}`.toLowerCase().includes(q));
  if (!state.research.length) { $('#view').innerHTML = '<div class="empty"><h1>아직 리서치 기록이 없어요</h1><p>주제를 정하면 조사한 내용이 여기에 쌓여요. 모두 이 컴퓨터의 data/research 폴더에 저장돼요.</p></div>'; return; }
  if (!ui.researchId || !state.research.find((r) => r.id === ui.researchId)) ui.researchId = (list[0] || state.research[0]).id;
  const items = list.map((r) => `<li><button class="${r.id === ui.researchId ? 'on' : ''}" data-research-id="${r.id}"><span class="pill ${r.status === 'failed' ? 'failed' : r.status === 'ready' ? 'done' : 'running'}">${RSTATUS[r.status] || r.status}</span><span class="t">${esc(r.title)}</span><span class="small muted">${esc(r.id)} · 사실 ${r.facts} · 수치 ${r.numbers} · 조사 ${r.rounds}회</span></button></li>`).join('');
  $('#view').innerHTML = `<h1>리서치 기록</h1><p class="sub">조사한 내용은 모두 이 컴퓨터(data/research)에 있어요. 더 조사하거나, 이 기록만으로 바로 글을 쓸 수 있어요.</p>
    <div class="split"><div><input class="search" type="text" id="r-search" data-rsearch="1" placeholder="검색: 주제, 키워드" value="${esc(ui.rsearch)}"><ul class="postlist">${items || '<li class="muted small">찾는 기록이 없어요.</li>'}</ul></div><div id="rd"><div class="empty"><span class="spin"></span></div></div></div>`;
  const r = state.research.find((x) => x.id === ui.researchId);
  if (!ui.rdetail[r.id]) ui.rdetail[r.id] = await api(`/api/research/${r.id}`);
  if (ui.tab !== 'research' || ui.researchId !== r.id) return;
  const d = ui.rdetail[r.id];
  const b = d.brief || {};
  const busy = r.status === 'queued' || r.status === 'researching';
  const st = { two_sources: '출처 2곳', one_source: '출처 1곳', unverified: '확인 필요' };
  const stc = { two_sources: 'ok', one_source: 'one_source', unverified: 'unverified' };
  const link = (u) => u ? `<a class="small" href="${esc(u)}" target="_blank" rel="noopener">출처</a>` : '';
  const posts = (d.research.posts || []).map((pid) => { const p = state.posts.find((x) => x.id === pid); return p ? `<li><span>${esc(p.title)}</span><span class="small muted">${esc(pid)} · ${STATUS[p.status] || p.status}</span></li>` : ''; }).join('');
  $('#rd').innerHTML = `<div class="review"><div class="panel">
      <h2 style="margin-top:0">${esc(b.title || (d.request || {}).title || '')}</h2>
      ${busy ? '<p class="notice"><span class="spin"></span> 조사하는 중이에요. 끝나면 여기에 나와요.</p>' : ''}
      ${r.status === 'failed' ? `<div class="error">조사하다 멈췄어요. ${esc(r.error || '')}</div>` : ''}
      ${b.summary ? `<p>${esc(b.summary)}</p>` : ''}
      ${(d.request || {}).take ? `<p class="small muted">내 관점: ${esc(d.request.take)}</p>` : ''}
      ${b.notes ? `<div class="rsec"><h3>내 메모</h3><div class="pre">${esc(b.notes)}</div></div>` : ''}
      ${(b.questions || []).length ? `<div class="rsec"><h3>질문</h3><ul class="rlist">${b.questions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${(b.facts || []).length ? `<div class="rsec"><h3>사실 ${b.facts.length}</h3><ul class="rlist">${b.facts.map((f) => `<li><span class="s st ${stc[f.status] || ''}">${esc(f.id)} · ${st[f.status] || esc(f.status || '')}</span><span>${esc(f.text)}</span><span>${(f.sources || []).map(link).join(' ')}${f.note ? ` <span class="small muted">${esc(f.note)}</span>` : ''}</span></li>`).join('')}</ul></div>` : ''}
      ${(b.numbers || []).length ? `<div class="rsec"><h3>수치 ${b.numbers.length}</h3><ul class="rlist">${b.numbers.map((n) => `<li><span class="s st ${stc[n.status] || ''}">${esc(n.id)} · ${st[n.status] || esc(n.status || '')}</span><span><b>${esc(n.value)}</b> ${esc(n.label)} <span class="small muted">${esc(n.as_of || '')}</span></span>${link(n.source)}</li>`).join('')}</ul></div>` : ''}
      ${(b.analogies || []).length ? `<div class="rsec"><h3>쉽게 말하면 (비유 후보)</h3><ul class="rlist">${b.analogies.map((k) => typeof k === 'string' ? `<li>${esc(k)}</li>` : `<li><span class="s">${esc(k.angle || '')}</span><span>${esc(k.subject || '')} ↔ ${esc(k.familiar || '')}</span><span class="small muted">근거: ${esc(k.basis || '')}${k.gap ? ' · 다른 점: ' + esc(k.gap) : ''}</span></li>`).join('')}</ul></div>` : ''}
      ${(b.comparisons || []).length ? `<div class="rsec"><h3>비교 사례</h3><ul class="rlist">${b.comparisons.map((c) => `<li><span>${esc(c.text)}</span>${link(c.source)}</li>`).join('')}</ul></div>` : ''}
      ${(b.media || []).length ? `<div class="rsec"><h3>사진·영상 후보</h3><ul class="rlist">${b.media.map((m) => `<li><span class="s">${esc(m.kind)}</span><span>${esc(m.title)}</span><span class="small muted">${esc(m.license || '')}${m.credit ? ' · ' + esc(m.credit) : ''} ${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">열기</a>` : ''}</span></li>`).join('')}</ul></div>` : ''}
      ${(b.open_questions || []).length ? `<div class="rsec"><h3>확인하지 못한 것</h3><ul class="rlist">${b.open_questions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${(b.rounds || []).length ? `<div class="rsec"><h3>조사 이력</h3><ul class="rlist">${b.rounds.map((x) => `<li><span class="s">${esc(x.at || '')} · ${esc({ new: '새 리서치', extend: '추가 조사', notes: '메모', revise: '수정 중 추가' }[x.mode] || x.mode || '')}</span><span>${esc(x.focus ? x.focus + ' — ' : '')}${esc(x.summary || '')}</span></li>`).join('')}</ul></div>` : ''}
    </div>
    <aside class="side">
      <div class="panel">
        <h3 style="margin-top:0">더 조사하기</h3>
        <textarea id="ext-${r.id}" data-extend="${r.id}" placeholder="예: 작년 수치도 같이 찾아 줘 / 반대 의견도 조사해 줘">${esc(ui.extend[r.id] || '')}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn primary" data-extend-go="${r.id}" ${busy ? 'disabled' : ''}>조사 시작</button></div>
        <p class="small muted">있던 내용은 그대로 두고 뒤에 붙여요.</p>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">이 기록으로 글쓰기</h3>
        <input type="text" class="search" id="rt-${r.id}" data-rtake="${r.id}" placeholder="한 줄 관점 (선택)" value="${esc(ui.rtake[r.id] || '')}">
        <button class="btn primary" data-write-go="${r.id}" ${r.status !== 'ready' ? 'disabled' : ''}>이 기록으로 글쓰기</button>
        <p class="small muted">다시 조사하지 않아서 빠르고 사용량도 적어요.</p>
      </div>
      ${posts ? `<div class="panel"><h3 style="margin-top:0">이 기록으로 쓴 글</h3><ul class="rlist">${posts}</ul></div>` : ''}
    </aside></div>`;
}

function renderFeedback() {
  const list = state.feedback.slice().reverse();
  $('#view').innerHTML = `<h1>피드백</h1><p class="sub">남긴 의견은 앞으로 만드는 주제·리서치·글·SNS에 가장 먼저 반영해요(brand/feedback.md). 끄면 반영하지 않고 기록만 남겨요.</p>
    <div class="panel"><div class="form">
      <div class="two"><label for="fb2Scope">어느 쪽 의견인가요?<select id="fb2Scope">${state.scopes.map((x) => `<option>${x}</option>`).join('')}</select></label><span></span></div>
      <label for="fb2Text">의견<textarea id="fb2Text" placeholder="예: 쓰레드 타래는 4개로 줄여 줘."></textarea></label>
      <div class="row"><button class="btn primary" data-act="fb2-save">저장</button></div>
    </div></div>
    <h2>남긴 의견 ${list.filter((f) => f.active).length}개 반영 중</h2>
    <div class="panel">${list.length ? list.map((f) => `<div class="fbitem ${f.active ? '' : 'off'}"><span class="chip">${esc(f.scope)}</span><span>${esc(f.text)}<br><span class="small muted">${(f.at || '').slice(0, 10)} · ${f.active ? '반영 중' : '꺼짐'}</span></span><span class="row"><button class="btn small" data-fb-toggle="${f.id}">${f.active ? '끄기' : '켜기'}</button><button class="btn small danger" data-fb-delete="${f.id}">삭제</button></span></div>`).join('') : '<p class="muted">아직 남긴 의견이 없어요.</p>'}</div>`;
}

function renderNewsletter() {
  const w = state.week;
  const job = busyJob('newsletter');
  const since = Date.now() - 7 * 86400000;
  const approved = state.posts.filter((p) => (p.status === 'approved' || p.status === 'published') && Date.parse(p.updatedAt || 0) >= since).length;
  $('#view').innerHTML = `<h1>뉴스레터</h1><p class="sub">최근 7일 동안 승인한 글(지금 ${approved}편)을 모아 ${esc(category())} 주간 노트를 만들어요.${approved ? '' : ' 승인한 글이 생기면 만들 수 있어요.'}</p>
    <p class="row"><button class="btn primary" data-act="newsletter" ${job || !approved ? 'disabled' : ''}>${job ? '<span class="spin"></span> 만드는 중' : w.newsletter ? '다시 만들기' : '뉴스레터 만들기'}</button>
    ${w.newsletter ? '<button class="btn" data-copy="newsletter">본문 복사</button>' : ''}</p>
    ${w.newsletter ? `<article class="phone" style="max-width:640px">${mdToHtml(w.newsletter)}</article>` : ''}`;
}

// ── 이벤트
document.addEventListener('click', async (e) => {
  const gr = e.target.closest('[data-goto-research]');
  if (gr) { e.preventDefault(); ui.tab = 'research'; ui.researchId = gr.dataset.gotoResearch; return render(); }
  const el = e.target.closest('button, [data-pick]');
  if (!el) return;
  try {
    if (el.dataset.onb) return onbClick(el.dataset.onb);
    if (el.dataset.preset) {
      const id = el.dataset.preset; const p = state.presets.find((x) => x.id === id);
      ui.prof = { ...ui.prof, presetId: id, ...(p ? { category: p.name, groups: p.groups.join(', '), audience: p.audience, angle: p.angle } : { category: '', groups: '', audience: '', angle: '' }) };
      renderOnb(); const f = document.getElementById(p ? 'pf-groups' : 'pf-cat'); if (f) f.focus(); return;
    }
    if (el.dataset.tab) { ui.tab = el.dataset.tab; if (ui.tab === 'settings') { resetSet(); resetMailForm(); } render(); window.scrollTo(0, 0); return; }
    if (el.dataset.goto) {
      if (el.dataset.reviewId) ui.reviewId = el.dataset.reviewId;
      if (el.dataset.publishId) ui.publishId = el.dataset.publishId;
      ui.tab = el.dataset.goto; if (ui.tab === 'settings') resetSet(); render(); window.scrollTo(0, 0); return;
    }
    if (el.dataset.pick && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION')) return;
    if (el.dataset.pick) {
      const id = el.dataset.pick;
      const n = Object.keys(ui.picks).filter((k) => ui.picks[k]).length;
      if (!ui.picks[id] && n >= 8) return toast('한 번에 8개까지 고를 수 있어요.');
      ui.picks[id] = !ui.picks[id];
      render();
      if (ui.picks[id]) { const inp = document.getElementById(`take-${id}`); if (inp) inp.focus(); }
      return;
    }
    const act = el.dataset.act;
    if (act === 'clear-picks') { ui.picks = {}; return render(); }
    if (act === 'show-all-done') { ui.showAllDone = true; return render(); }
    if (act === 'custom-open') { ui.tab = 'topics'; ui.showCustom = true; render(); window.scrollTo(0, 0); const t = document.getElementById('c-title'); if (t) t.focus(); return; }
    if (act === 'settings-save') { await saveSet(); toast('저장했어요'); return refresh(true); }
    if (act === 'sys-recheck') { loadSystem(true).then(() => ui.tab === 'settings' && renderSettings()); return renderSettings(); }
    if (act === 'onb-open') return openOnb(0);
    if (act === 'setup-retry') { await api('/api/profile/setup', {}); toast('맞춤 규칙을 다시 만들기 시작했어요'); return refresh(true); }
    if (act === 'colors-save') { await api('/api/profile/colors', ui.colors || {}); ui.colors = null; toast('카드 색을 저장했어요. 다음 카드부터 적용돼요'); return refresh(true); }
    if (act === 'mail-save') {
      const f = ui.mailForm;
      const body = { address: f.address, allowedFrom: f.allowedFrom, subject: f.subject, autoReply: f.autoReply };
      if (f.appPassword) body.appPassword = f.appPassword;
      await api('/api/mail/settings', body); ui.mailForm.appPassword = '';
      toast('메일 설정을 저장했어요'); await refresh(true); resetMailForm(); return render();
    }
    if (act === 'mail-test') { el.disabled = true; try { await api('/api/mail/test', {}); toast('Gmail에 연결됐어요'); } finally { el.disabled = false; } return; }
    if (act === 'mail-poll') { el.disabled = true; try { const r = await api('/api/mail/poll', {}); toast(r.skipped ? r.skipped : r.found ? `새 메일 ${r.found}통을 받았어요. 글을 쓰기 시작해요` : '새 메일이 없어요'); } finally { el.disabled = false; } return refresh(true); }
    if (act === 'open-data') { await api('/api/open-data', {}); return; }
    if (act === 'show-custom') { ui.showCustom = true; render(); const t = document.getElementById('c-title'); if (t) t.focus(); return; }
    if (act === 'hide-custom') { ui.showCustom = false; return render(); }
    if (act === 'custom-go') {
      const r = await api('/api/topics/custom', ui.custom);
      toast(ui.custom.mode === 'research' ? '리서치를 시작했어요. 리서치 기록에서 볼 수 있어요' : '시작했어요. 홈에서 어디까지 됐는지 볼 수 있어요');
      ui.custom = { group: '', pillar: '', mode: 'full' }; ui.showCustom = false;
      if (r.researchId && !r.postId) { ui.tab = 'research'; ui.researchId = r.researchId; } else ui.tab = 'home';
      return refresh(true);
    }
    if (act === 'fb2-save') {
      await api('/api/feedback', { text: $('#fb2Text').value, scope: $('#fb2Scope').value });
      toast('의견을 저장했어요'); return refresh(true);
    }
    if (el.dataset.mailProcess) { await api(`/api/mail/${el.dataset.mailProcess}/process`, {}); toast('이 메일로 글을 쓰기 시작했어요'); return refresh(true); }
    if (el.dataset.mailPost) {
      el.disabled = true; const t = el.textContent; el.innerHTML = '<span class="spin"></span> 보내는 중';
      try { const r = await api(`/api/posts/${el.dataset.mailPost}/mail`, {}); delete ui.detail[el.dataset.mailPost]; toast(`${r.to}로 보냈어요`); } finally { el.disabled = false; el.textContent = t; }
      return refresh(true);
    }
    if (el.dataset.fbToggle) { await api(`/api/feedback/${el.dataset.fbToggle}/toggle`, {}); return refresh(true); }
    if (el.dataset.fbDelete) { await api(`/api/feedback/${el.dataset.fbDelete}/delete`, {}); toast('지웠어요'); return refresh(true); }
    if (el.dataset.researchId) { ui.researchId = el.dataset.researchId; return render(); }
    if (el.dataset.extendGo) {
      const rid = el.dataset.extendGo;
      await api(`/api/research/${rid}/extend`, { focus: ui.extend[rid] || '' });
      ui.extend[rid] = ''; delete ui.rdetail[rid]; toast('더 조사하기 시작했어요'); return refresh(true);
    }
    if (el.dataset.writeGo) {
      const rid = el.dataset.writeGo;
      await api(`/api/research/${rid}/write`, { take: ui.rtake[rid] || '' });
      ui.rtake[rid] = ''; toast('이 기록으로 초안을 쓰기 시작했어요'); ui.tab = 'home'; return refresh(true);
    }
    if (act === 'gen-topics') { await api('/api/topics/generate', {}); ui.picks = {}; toast('추천 주제를 찾고 있어요. 몇 분 걸려요'); return refresh(true); }
    if (act === 'select') {
      const picks = Object.keys(ui.picks).filter((k) => ui.picks[k]).map((id) => ({ id, take: ui.takes[id] || '', mode: ui.modes[id] || 'full' }));
      await api('/api/topics/select', { batch: state.topics.id, picks });
      ui.picks = {}; ui.takes = {}; ui.modes = {};
      toast(`${picks.length}편 쓰기 시작했어요. 홈에서 어디까지 됐는지 볼 수 있어요`);
      ui.tab = 'home'; return refresh(true);
    }
    if (act === 'newsletter') { await api('/api/newsletter', {}); toast('뉴스레터를 만들기 시작했어요'); return refresh(true); }
    if (el.dataset.retryJob) { await api(`/api/jobs/${el.dataset.retryJob}/retry`, {}); toast('다시 시도할게요'); return refresh(true); }
    if (el.dataset.retryPost) { await api(`/api/posts/${el.dataset.retryPost}/retry`, {}); toast('다시 시도할게요'); return refresh(true); }
    if (el.dataset.reviewId) { ui.reviewId = el.dataset.reviewId; return render(); }
    if (el.dataset.publishId) { ui.publishId = el.dataset.publishId; return render(); }
    if (el.dataset.toggleRevise) { ui.showRevise[el.dataset.toggleRevise] = !ui.showRevise[el.dataset.toggleRevise]; render(); const ta = document.getElementById(`revise-${el.dataset.toggleRevise}`); if (ta) ta.focus(); return; }
    if (el.dataset.sendRevise) {
      const id = el.dataset.sendRevise;
      await api(`/api/posts/${id}/revise`, { comment: ui.revise[id] || '' });
      ui.revise[id] = ''; ui.showRevise[id] = false; delete ui.detail[id];
      toast('고칠 점을 보냈어요. 고친 글이 다시 검수함에 올라와요'); return refresh(true);
    }
    if (el.dataset.approve) {
      const id = el.dataset.approve;
      await api(`/api/posts/${id}/approve`, { titleIndex: ui.titleChoice[id] ?? 0 });
      delete ui.detail[id];
      toast('승인했어요. 이제 올리기만 하면 돼요'); return refresh(true);
    }
    if (el.dataset.published) {
      const id = el.dataset.published;
      const was = (state.posts.find((x) => x.id === id) || {}).status;
      await api(`/api/posts/${id}/publish`, { url: ui.blogUrl[id] ?? '' });
      delete ui.detail[id];
      toast(was === 'published' ? '주소를 저장했어요' : '다 올렸어요. 수고했어요!'); return refresh(true);
    }
    if (el.dataset.openCards) { await api(`/api/posts/${el.dataset.openCards}/open-cards`, {}); return; }
    const P = ui._pub;
    if (el.dataset.copy === 'title') return copy(null, P.title);
    if (el.dataset.copy === 'body') { const html = mdToHtml(P.d.draft, { forPaste: true, media: P.media }); return copy(html, html.replace(/<br>/g, '\n').replace(/<\/(p|h2|h3)>/g, '\n\n').replace(/<[^>]+>/g, '')); }
    if (el.dataset.copy === 'tags') return copy(null, P.tags);
    if (el.dataset.copy === 'credits') return copy(null, P.credits);
    if (el.dataset.copy === 'caption') return copy(null, `${P.social.instagram.caption}\n\n${(P.social.instagram.hashtags || []).map((h) => '#' + h).join(' ')}`);
    if (el.dataset.copyThread !== undefined) return copy(null, P.fill(P.social.threads.thread[Number(el.dataset.copyThread)]));
    if (el.dataset.copySingle !== undefined) return copy(null, P.social.threads.singles[Number(el.dataset.copySingle)].text);
    if (el.dataset.copy === 'newsletter') return copy(mdToHtml(state.week.newsletter, { forPaste: true }), state.week.newsletter);
  } catch (err) { toast(err.message); }
});

async function fetchSamples() {
  const v = ui.prof;
  if (!v.sources.trim()) throw new Error('글 주소나 파일 경로를 한 줄 이상 적어 주세요.');
  v.fetching = true; renderOnb();
  try {
    const r = await api('/api/profile/samples', { sources: v.sources });
    for (const it of r.items) if (!v.fetched.some((x) => x.source === it.source)) v.fetched.push({ ...it, on: true });
    v.fetchErrors = r.errors;
    toast(r.items.length ? `글 ${r.items.length}편을 가져왔어요` : '가져온 글이 없어요');
  } finally { v.fetching = false; renderOnb(); }
}
async function onbClick(a) {
  try {
    if (a === 'next') { ui.onb.step++; return renderOnb(); }
    if (a === 'back') { ui.onb.step--; return renderOnb(); }
    if (a === 'recheck') { const p = loadSystem(true); renderOnb(); await p; return renderOnb(); }
    if (a === 'save') { await saveSet(); ui.onb.step++; return renderOnb(); }
    if (a === 'prof-next') {
      const v = ui.prof;
      if (!v.category.trim()) throw new Error('분야 이름을 적어 주세요.');
      if (!v.groups.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).length) throw new Error('세부 분야를 하나 이상 적어 주세요.');
      ui.onb.step++; return renderOnb();
    }
    if (a === 'fetch-samples') return await fetchSamples();
    if (a === 'lock') return await lockProfile();
    if (a === 'skip') return finishOnb('browse');
    return finishOnb(a);
  } catch (err) { toast(err.message); }
}

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.set) ui.set[t.dataset.set] = t.value;
  if (t.dataset.prof) ui.prof[t.dataset.prof] = t.value;
  if (t.dataset.profSample !== undefined) ui.prof.samples[Number(t.dataset.profSample)] = t.value;
  if (t.dataset.color) { ui.colors = { ...(ui.colors || {}), [t.dataset.color]: t.value }; const sw = document.querySelector('.swatch'); if (sw) { sw.style.background = ui.colors.primary; sw.firstElementChild.style.background = ui.colors.accent; } }
  if (t.dataset.mail && t.type !== 'checkbox') ui.mailForm[t.dataset.mail] = t.value;
  if (t.dataset.take) ui.takes[t.dataset.take] = t.value;
  if (t.dataset.revise) ui.revise[t.dataset.revise] = t.value;
  if (t.dataset.blogurl) ui.blogUrl[t.dataset.blogurl] = t.value;
  if (t.dataset.c) ui.custom[t.dataset.c] = t.value;
  if (t.dataset.extend) ui.extend[t.dataset.extend] = t.value;
  if (t.dataset.rtake) ui.rtake[t.dataset.rtake] = t.value;
  if (t.dataset.rsearch) { ui.rsearch = t.value; clearTimeout(ui._rs); ui._rs = setTimeout(() => { renderResearch(); const i = document.getElementById('r-search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); }
  if (t.dataset.title !== undefined) { const id = t.name.replace('title-', ''); ui.titleChoice[id] = Number(t.dataset.title); }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.mode) ui.modes[t.dataset.mode] = t.value;
  if (t.dataset.profPick !== undefined) { ui.prof.fetched[Number(t.dataset.profPick)].on = t.checked; renderOnb(); }
  if (t.dataset.cover) { api(`/api/posts/${t.dataset.cover}/cover`, { file: t.value }).then(() => { delete ui.detail[t.dataset.cover]; toast('표지 사진을 바꿨어요. 카드를 다시 만들게요'); refresh(true); }).catch((err) => toast(err.message)); }
  if (t.dataset.upload && t.files && t.files[0]) {
    const id = t.dataset.upload; const f = t.files[0];
    fetch(`/api/posts/${id}/photo`, { method: 'POST', headers: { 'Content-Type': f.type }, body: f })
      .then((r) => r.json().then((j) => { if (!r.ok) throw new Error(j.error || '사진을 올리지 못했어요.'); }))
      .then(() => { delete ui.detail[id]; toast('사진을 올렸어요. 표지 카드를 다시 만들게요'); refresh(true); })
      .catch((err) => toast(err.message));
  }
  if (t.name === 'c-mode') { ui.custom.mode = t.value; }
  if (t.dataset.c === 'group') ui.custom.group = t.value;
  if (t.name === 'pf-voice') ui.prof.voice = t.value;
  if (t.dataset.profEllipsis) ui.prof.noEllipsis = t.checked;
  if (t.dataset.c === 'pillar') ui.custom.pillar = t.value;
  if (t.dataset.cOutline) ui.custom.outline = t.checked;
  if (t.dataset.mail && t.type === 'checkbox') ui.mailForm[t.dataset.mail] = t.checked;
  if (t.dataset.title !== undefined) { const id = t.name.replace('title-', ''); ui.titleChoice[id] = Number(t.dataset.title); }
});
document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('joblog')) ui.jobsOpen = e.target.open; }, true);
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.pick && e.target.tagName !== 'INPUT') { e.preventDefault(); e.target.click(); }
});

// 어느 화면에서나 의견 남기기
const fbModal = $('#fbModal');
$('#fbFab').addEventListener('click', () => { fbModal.hidden = false; $('#fbText').focus(); });
$('#fbCancel').addEventListener('click', () => { fbModal.hidden = true; });
fbModal.addEventListener('click', (e) => { if (e.target === fbModal) fbModal.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !fbModal.hidden) fbModal.hidden = true; });
$('#fbSave').addEventListener('click', async () => {
  try {
    await api('/api/feedback', { text: $('#fbText').value, scope: $('#fbScope').value });
    $('#fbText').value = ''; fbModal.hidden = true; toast('의견을 저장했어요. 다음 작업부터 반영해요'); refresh(true);
  } catch (err) { toast(err.message); }
});

refresh(true);
setInterval(() => refresh(false), 3000);
