'use strict';
// 인스타그램 캐러셀 카드: social.json의 slides를 HTML로 만들고 헤드리스 브라우저로 PNG를 찍는다.
// 색은 data/profile.json의 colors(primary: 진한 바탕색, accent: 강조색)를 따른다.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { ROOT } = require('./config');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lines = (s) => esc(s).split(/\n/).join('<br>');

function characterBadge(name) {
  const img = path.join(ROOT, 'brand', 'character.png');
  if (fs.existsSync(img)) {
    const b64 = fs.readFileSync(img).toString('base64');
    return `<img class="avatar" src="data:image/png;base64,${b64}" alt="">`;
  }
  return `<div class="avatar initial">${esc(String(name || '나').slice(0, 2))}</div>`;
}

// 브랜드 색 두 개로 카드에 쓸 색을 만든다.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => {
  const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
function palette() {
  const { primary, accent } = require('./profile').colors();
  const dark = lum(primary) < 0.2 ? primary : '#191D28'; // 진한 바탕은 어두운 색이어야 흰 글자가 읽힌다
  return {
    dark, accent, paper: '#F2F3F5', ink: dark, sub: mix(dark, '#FFFFFF', 0.38), line: mix(dark, '#FFFFFF', 0.82),
    onAccent: lum(accent) > 0.35 ? dark : '#FFFFFF', onDarkSub: mix('#FFFFFF', dark, 0.3),
  };
}

function css(c) {
  return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;background:${c.paper};color:${c.ink};word-break:keep-all;overflow-wrap:anywhere}
.card{position:relative;width:1080px;height:1350px;padding:96px 92px 0;display:flex;flex-direction:column;background:${c.paper}}
.top{display:flex;justify-content:space-between;align-items:center;font-size:30px;letter-spacing:.04em;color:${c.sub};font-weight:600}
.series{color:${c.ink}}
.rule{height:10px;background:${c.accent};width:120px;margin:0 0 52px;border-radius:5px}
h1{font-size:92px;line-height:1.18;font-weight:800;letter-spacing:-.02em}
h2{font-size:68px;line-height:1.25;font-weight:800;letter-spacing:-.015em}
p.body{font-size:44px;line-height:1.6;margin-top:40px;color:${c.sub};font-weight:500}
.big{font-size:210px;line-height:1;font-weight:800;color:${c.accent};letter-spacing:-.04em;margin-top:40px}
.sum{list-style:none;margin-top:36px}
.sum li{font-size:46px;line-height:1.45;padding:26px 0;border-top:3px solid ${c.line};font-weight:600}
.sum li b{color:${c.accent};margin-right:18px}
.foot{position:absolute;left:92px;right:92px;bottom:72px;display:flex;align-items:center;gap:22px;font-size:30px;color:${c.sub};font-weight:600}
.avatar{width:84px;height:84px;border-radius:50%;object-fit:cover}
.initial{background:${c.accent};color:${c.onAccent};display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800}
.foot .page{margin-left:auto;font-variant-numeric:tabular-nums}
.dark{background:${c.dark};color:#FFFFFF}
.dark .top,.dark .foot{color:${c.onDarkSub}}.dark .series{color:#FFFFFF}.dark p.body{color:${c.onDarkSub}}
.label{display:inline-block;font-size:34px;font-weight:800;padding:10px 22px;border-radius:10px;background:${c.accent};color:${c.onAccent};margin-bottom:34px;align-self:flex-start}
.content{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:170px}
.outro .content{align-items:flex-start}
.outro .avatar{width:220px;height:220px;margin-bottom:48px}.outro .initial{font-size:80px}
.cover h1{font-size:104px}
.photo{background:#111 center 30%/cover no-repeat;color:#fff}
.photo::before{content:"";position:absolute;inset:0;background:linear-gradient(to top,${c.dark}F2 0%,${c.dark}B8 36%,${c.dark}1A 66%,${c.dark}66 100%)}
.photo>.top,.photo>.content{position:relative}
.photo .top,.photo .series{color:#fff}
.photo .content{justify-content:flex-end;padding-bottom:210px}
.photo h1{font-size:96px;text-shadow:0 2px 18px rgba(0,0,0,.35)}
.photo p.body{color:#EEF0F4}
.photo .foot{color:#E3E7EE}
.photo .credit{position:absolute;right:40px;top:150px;writing-mode:vertical-rl;font-size:20px;color:rgba(255,255,255,.75);font-weight:500;letter-spacing:.02em}
`;
}

function slideHtml(slide, i, total, opts) {
  const kind = slide.kind || 'point';
  const page = `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  const top = `<div class="top"><span class="series">${esc(opts.series || '')}</span><span>${esc(opts.characterName)}</span></div>`;
  const foot = `<div class="foot">${kind === 'outro' ? '' : characterBadge(opts.characterName)}<span>${esc(opts.handle || '')}</span><span class="page">${page}</span></div>`;
  let inner = '';
  const photo = kind === 'cover' && opts.photo;
  if (kind === 'cover') {
    inner = `${top}<div class="rule"></div><h1>${lines(slide.title)}</h1><p class="body">${lines(slide.body)}</p>`;
  } else if (kind === 'stat') {
    inner = `${top}<div class="big">${esc(slide.title)}</div><p class="body">${lines(slide.body)}</p>`;
  } else if (kind === 'compare') {
    // 독자가 이미 아는 것에 빗대 설명하는 카드. 라벨은 social.json의 instagram.compare_label(없으면 "쉽게 말하면")
    inner = `${top}<span class="label">${esc(opts.compareLabel || '쉽게 말하면')}</span><h2>${lines(slide.title)}</h2><p class="body">${lines(slide.body)}</p>`;
  } else if (kind === 'summary') {
    const items = String(slide.body || '').split(/\n/).filter(Boolean).map((l, n) => `<li><b>${n + 1}</b>${esc(l)}</li>`).join('');
    inner = `${top}<div class="rule"></div><h2>${lines(slide.title || '세 줄 요약')}</h2><ul class="sum">${items}</ul>`;
  } else if (kind === 'outro') {
    inner = `${characterBadge(opts.characterName)}<h2>${lines(slide.title)}</h2><p class="body">${lines(slide.body)}</p>`;
  } else {
    inner = `${top}<div class="rule"></div><h2>${lines(slide.title)}</h2><p class="body">${lines(slide.body)}</p>`;
  }
  // 상단 표시줄은 위에 두고, 나머지 내용은 세로 가운데에 놓는다.
  const hasTop = inner.startsWith(top);
  const body = hasTop ? inner.slice(top.length) : inner;
  const bg = photo ? ` style="background-image:url('${photo.url}')"` : '';
  const credit = photo && photo.credit ? `<div class="credit">${esc(photo.credit)}</div>` : '';
  // 표지·비유·마지막 장은 진한 브랜드 바탕, 나머지는 밝은 바탕
  const dark = !photo && ['cover', 'compare', 'outro'].includes(kind) ? ' dark' : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css(opts.palette || palette())}</style></head><body><div class="card ${kind}${dark}${photo ? ' photo' : ''}"${bg}>${hasTop ? top : ''}<div class="content">${body}</div>${credit}${foot}</div></body></html>`;
}

function screenshot(browserBin, htmlFile, pngFile, size = '1080,1350') {
  return new Promise((resolve, reject) => {
    const profileDir = path.join(os.tmpdir(), 'content-studio-browser');
    const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profileDir}`, '--force-device-scale-factor=1', `--window-size=${size}`,
      '--virtual-time-budget=1500', `--screenshot=${pngFile}`, pathToFileURL(htmlFile).href];
    try { fs.unlinkSync(pngFile); } catch {}
    const child = spawn(browserBin, args, { stdio: 'ignore' });
    // macOS Chrome은 스크린샷을 저장한 뒤에도 종료하지 않는 경우가 있어, 파일 크기가 멈추면 직접 끈다.
    let lastSize = -1;
    let done = false;
    const end = (err) => {
      if (done) return;
      done = true;
      clearInterval(watch);
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch {}
      if (err) reject(err); else resolve();
    };
    const watch = setInterval(() => {
      if (!fs.existsSync(pngFile)) return;
      const size = fs.statSync(pngFile).size;
      if (size > 0 && size === lastSize) end();
      lastSize = size;
    }, 250);
    const timer = setTimeout(() => end(new Error('카드 이미지를 만드는 데 시간이 너무 오래 걸립니다.')), 45000);
    child.on('error', (e) => end(new Error(`브라우저 실행 실패: ${e.message}`)));
    child.on('close', () => {
      if (fs.existsSync(pngFile) && fs.statSync(pngFile).size > 0) end();
      else end(new Error('카드 이미지를 만들지 못했어요.'));
    });
  });
}

async function renderCards(cfg, postDirAbs, coverChoice) {
  const photos = require('./photos');
  await photos.ensureFromBrief(postDirAbs);
  const cover = photos.coverPhoto(postDirAbs, coverChoice);
  const social = JSON.parse(fs.readFileSync(path.join(postDirAbs, 'social.json'), 'utf8'));
  const ig = social.instagram || {};
  const slides = ig.slides || [];
  const out = path.join(postDirAbs, 'cards');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const opts = { characterName: cfg.characterName, handle: cfg.instagramHandle, series: ig.series, compareLabel: ig.compare_label, palette: palette(),
    photo: cover ? { url: pathToFileURL(path.join(postDirAbs, 'photos', cover.file)).href, credit: cover.credit } : null };
  const files = [];
  for (let i = 0; i < slides.length; i++) {
    const name = `slide-${String(i + 1).padStart(2, '0')}`;
    const htmlFile = path.join(out, `${name}.html`);
    fs.writeFileSync(htmlFile, slideHtml(slides[i], i, slides.length, opts));
    const pngFile = path.join(out, `${name}.png`);
    if (cfg.browserBin && fs.existsSync(cfg.browserBin)) {
      await screenshot(cfg.browserBin, htmlFile, pngFile);
      files.push(`${name}.png`);
    } else {
      files.push(`${name}.html`);
    }
  }
  return files;
}


// 블로그용 도표: brief.json의 media 중 kind=chart이고 data가 있는 항목을 막대 도표 PNG로 만든다.
function chartHtml(media, characterName, c = palette()) {
  const data = (media.data || []).filter((d) => isFinite(Number(d.value)));
  const max = Math.max(...data.map((d) => Number(d.value)), 0) || 1;
  const rows = data.map((d) => {
    const v = Number(d.value);
    return `<div class="r"><span class="l">${esc(d.label)}</span><span class="t"><i style="width:${Math.max(2, (v / max) * 100)}%"></i></span><span class="v">${esc(d.value)}</span></div>`;
  }).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:720px;overflow:hidden}
body{font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;background:#FFFFFF;color:${c.ink};padding:64px 72px;display:flex;flex-direction:column}
h1{font-size:44px;font-weight:800;margin-bottom:40px}
.rows{flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px}
.r{display:grid;grid-template-columns:220px 1fr 150px;align-items:center;gap:20px;font-size:32px}
.l{font-weight:600;color:${c.sub}}.t{height:44px;background:${c.paper};border-radius:6px;overflow:hidden}.t i{display:block;height:100%;background:${c.accent}}
.v{text-align:right;font-weight:800;font-variant-numeric:tabular-nums}
.f{margin-top:30px;font-size:24px;color:${c.sub};display:flex;justify-content:space-between}
</style></head><body><h1>${esc(media.title)}</h1><div class="rows">${rows}</div><div class="f"><span>${esc(media.source || '')}</span><span>${esc(characterName)}</span></div></body></html>`;
}

async function renderCharts(cfg, postDirAbs) {
  let brief = null;
  try { brief = JSON.parse(fs.readFileSync(path.join(postDirAbs, 'brief.json'), 'utf8')); } catch { return []; }
  const charts = ((brief && brief.media) || []).filter((m) => m.kind === 'chart' && Array.isArray(m.data) && m.data.length);
  const out = path.join(postDirAbs, 'charts');
  fs.rmSync(out, { recursive: true, force: true });
  if (!charts.length) return [];
  fs.mkdirSync(out, { recursive: true });
  const files = [];
  for (let i = 0; i < charts.length; i++) {
    const name = `chart-${String(i + 1).padStart(2, '0')}`;
    const htmlFile = path.join(out, `${name}.html`);
    fs.writeFileSync(htmlFile, chartHtml(charts[i], cfg.characterName));
    if (cfg.browserBin && fs.existsSync(cfg.browserBin)) {
      await screenshot(cfg.browserBin, htmlFile, path.join(out, `${name}.png`), '1080,720');
      files.push(`${name}.png`);
    }
  }
  return files;
}

module.exports = { renderCards, renderCharts, slideHtml, chartHtml, palette };
