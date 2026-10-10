'use strict';
// 글 한 편의 결과물을 메일 첨부용 파일로 모은다(exports/<글 id>/).
// 폰에서 바로 저장해 올릴 수 있게 이미지는 묶지 않고 한 장씩 둔다.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { ROOT } = require('./config');

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=UTF-8' };

function blogText(draft, media, newsletterUrl) {
  const out = [];
  for (const b of draft.replace(/\{\{NEWSLETTER_URL\}\}/g, newsletterUrl || '[뉴스레터 주소]').split(/\n\s*\n/)) {
    const t = b.trim();
    if (!t || t.startsWith('# ')) continue;
    if (t.startsWith('## ')) { out.push('■ ' + t.slice(3)); continue; }
    const m = t.match(/^\[(영상|사진|도표):\s*(.+)\]$/);
    if (m) {
      const kinds = { 영상: ['youtube', 'social'], 사진: ['photo', 'social'], 도표: ['chart'] }[m[1]];
      const c = media.find((x) => kinds.includes(x.kind) && x.title && x.title.includes(m[2].slice(0, 6)));
      const url = c && (c.kind === 'youtube' || c.kind === 'social') ? c.url : '';
      out.push(`[${m[1]} 넣는 자리: ${m[2]}]${url ? '\n' + url : ''}`);
      continue;
    }
    out.push(t.replace(/\*\*(.+?)\*\*/g, '$1'));
  }
  return out.join('\n\n');
}

// prefix: 여러 편을 한 메일에 넣을 때 파일 이름 앞에 붙인다(예: '글1_').
function build(cfg, pid, prefix = '') {
  const src = store.postDir(pid);
  const out = path.join(ROOT, 'exports', pid);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const J = (f, d = {}) => store.readJson(path.join(src, f), d) || d;
  const meta = J('meta.json'); const social = J('social.json'); const brief = J('brief.json'); const post = J('post.json');
  const photos = J('photos/photos.json', []);
  const draft = store.readText(path.join(src, 'draft.md'), '');
  const files = [];
  const add = (name, write) => { const p = path.join(out, prefix + name); write(p); files.push({ name: prefix + name, path: p, contentType: TYPES[path.extname(name)] || 'application/octet-stream' }); };

  const titles = meta.titles || [];
  const credits = photos.filter((p) => p.credit).map((p) => p.credit).join('\n');
  add('1_블로그_글.txt', (p) => fs.writeFileSync(p,
    `[제목 후보]\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n[본문]\n\n${blogText(draft, brief.media || [], cfg.newsletterUrl)}\n\n` +
    `[태그]\n${(meta.tags || []).map((t) => '#' + t).join(' ')}\n` + (credits ? `\n[사진 출처 (사진 아래에 함께 적어 주세요)]\n${credits}\n` : '')));
  const ig = social.instagram || {};
  add('2_인스타_캡션.txt', (p) => fs.writeFileSync(p, `${ig.caption || ''}\n\n${(ig.hashtags || []).map((h) => '#' + h).join(' ')}\n`));
  const th = social.threads || {};
  const url = post.blogUrl || '[블로그 주소]';
  add('3_쓰레드.txt', (p) => fs.writeFileSync(p,
    `[요약 타래: 순서대로 이어서 올리기]\n\n${(th.thread || []).map((t) => t.replace(/\{\{BLOG_URL\}\}/g, url)).join('\n\n-----\n\n')}\n\n\n` +
    `[단독 글: 따로 하나씩 올리기]\n\n${(th.singles || []).map((s) => s.text).join('\n\n-----\n\n')}\n`));
  for (const c of (post.cards || []).filter((f) => f.endsWith('.png')).sort()) add(c.replace(/slide-(\d+)/, '인스타카드_$1'), (p) => fs.copyFileSync(path.join(src, 'cards', c), p));
  photos.forEach((ph, i) => add(`블로그사진_${String(i + 1).padStart(2, '0')}${path.extname(ph.file)}`, (p) => fs.copyFileSync(path.join(src, 'photos', ph.file), p)));
  for (const c of (post.charts || []).filter((f) => f.endsWith('.png')).sort()) add(c.replace('chart-', '블로그도표_'), (p) => fs.copyFileSync(path.join(src, 'charts', c), p));

  // 올리기 전에 확인할 것: 자동 점검에서 걸린 항목
  const checks = Array.isArray(J('checks.json', [])) ? J('checks.json', []) : [];
  const attention = checks.filter((c) => c.status && c.status !== 'ok').map((c) => {
    const tag = { one_source: '출처 1곳', unverified: '확인 필요', violation: '규칙' }[c.status] || c.status;
    return `- [${tag}] ${c.text}${c.note ? ` (${c.note})` : ''}`;
  });
  // 흐름대로 쓴 글이면 줄마다 어떻게 처리했는지(리서치로 고친 내용 포함)
  const outline = checks.filter((c) => c.type === 'outline').map((c) => `- ${c.text}${c.note ? `\n  → ${c.note}` : ''}`);
  return { pid, title: titles[0] || '', files, attention, outline, size: files.reduce((n, f) => n + fs.statSync(f.path).size, 0) };
}

module.exports = { build };
