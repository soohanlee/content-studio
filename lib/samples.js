'use strict';
// 문체 샘플 가져오기: 사용자가 적은 글 주소·블로그 주소·파일 경로에서 예전 글 본문을 읽어 온다.
// 저장은 하지 않고 미리보기만 돌려준다. 고정할 때 profile.lock이 brand/corpus/에 저장한다.
//   네이버 블로그 글 주소   → 글 한 편
//   네이버 블로그 주소      → 최근 글 여러 편(주소에 categoryNo가 있으면 그 카테고리만)
//   그 밖의 웹 주소         → 글 한 편(본문 영역 추정)
//   파일 경로(.md .txt .html) → 글 한 편, 폴더 경로 → 안의 글 파일 여러 편
// 네이버 글은 logNo·날짜·카테고리·공감·댓글 수도 함께 돌려준다(있는 만큼).
const fs = require('fs');
const os = require('os');
const path = require('path');

const MIN_CHARS = 200;
const MAX_ITEMS = 20; // 한 번에 가져오는 최대 편수(고정할 때 저장하는 최대 편수와 같다)
const BLOG_POSTS = 10; // 블로그 주소 하나에서 가져오는 최근 글 수
const FILE_EXT = ['.md', '.txt', '.html', '.htm'];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const NAVER = { 'User-Agent': UA, Referer: 'https://m.blog.naver.com/' };

const ENTITIES = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', middot: '·', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×' };
// 네이버 제목은 &amp;middot;처럼 두 번 감싼 경우가 있어 두 번 푼다.
function decode(s) {
  let out = String(s || '');
  for (let k = 0; k < 2; k++) {
    out = out.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
  }
  return out;
}

// HTML 조각을 줄 단위 본문으로 바꾼다. 문단·줄바꿈은 살리고 태그·스크립트는 지운다.
function htmlToText(html) {
  const text = String(html || '')
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/p>(\s*<\/div>)+/gi, '</p>') // 네이버는 문단 하나가 여러 겹의 div로 끝난다. 빈 줄이 두 번 생기지 않게 한다.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(text).split('\n').map((l) => l.replace(/[ \t​]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function meta(html, prop) {
  const m = String(html).match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=(["'])([\\s\\S]*?)\\1`, 'i'));
  return m ? decode(m[2]).trim() : '';
}

// 네이버 addDate(밀리초)를 한국 날짜 YYYY-MM-DD로
const day = (ms) => (Number(ms) ? new Date(Number(ms) + 9 * 3600e3).toISOString().slice(0, 10) : '');

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`열지 못했어요(${res.status})`);
  return res.text();
}

// 네이버 블로그 주소에서 blogId·logNo·categoryNo를 꺼낸다.
function parseNaver(u) {
  if (!/(^|\.)blog\.naver\.com$/.test(u.hostname)) return null;
  const q = u.searchParams;
  const seg = u.pathname.split('/').filter(Boolean);
  const blogId = q.get('blogId') || (seg[0] && !/\.naver$/i.test(seg[0]) ? seg[0] : '');
  const logNo = q.get('logNo') || (seg[1] && /^\d+$/.test(seg[1]) ? seg[1] : '');
  if (!blogId) return null;
  return { blogId, logNo, categoryNo: q.get('categoryNo') || '0' };
}

async function naverPost(blogId, logNo) {
  const url = `https://m.blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(logNo)}`;
  const html = await get(url, NAVER);
  // 스마트에디터 ONE은 se-main-container, 예전 에디터는 postViewArea에 본문이 있다.
  let start = html.indexOf('se-main-container');
  if (start < 0) start = html.indexOf('postViewArea');
  if (start < 0) throw new Error('본문을 찾지 못했어요(비공개 글일 수 있어요)');
  const endMarks = ['post_footer_contents', 'wrap_postcomment', 'post-btn', 'blog_authorArea'];
  const end = Math.min(...endMarks.map((m) => html.indexOf(m, start)).filter((i) => i > start), html.length);
  const title = meta(html, 'og:title').replace(/\s*:\s*네이버 블로그$/, '');
  const attr = (k) => (html.match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1] || '';
  const cat = (html.match(/blog_category"><a href="[^"]*categoryName=([^"&#]*)/) || [])[1] || '';
  return {
    title, text: htmlToText(html.slice(html.indexOf('>', start) + 1, end)), source: `https://blog.naver.com/${blogId}/${logNo}`,
    logNo: String(logNo), date: day(attr('addDate')), category: cat ? decodeURIComponent(cat.replace(/\+/g, ' ')) : '', comments: Number(attr('commentCount')) || 0,
  };
}

async function naverList(blogId, categoryNo) {
  const url = `https://m.blog.naver.com/api/blogs/${encodeURIComponent(blogId)}/post-list?categoryNo=${encodeURIComponent(categoryNo)}&itemCount=${BLOG_POSTS}&page=1`;
  const data = JSON.parse(await get(url, NAVER));
  const items = (data && data.result && data.result.items) || [];
  if (!items.length) throw new Error('공개된 글을 찾지 못했어요');
  return items.map((x) => ({ logNo: String(x.logNo), category: x.categoryName || '', likes: x.sympathyCnt || 0, comments: x.commentCnt || 0, date: day(x.addDate) }));
}

async function webPost(url) {
  const html = await get(url);
  const pick = (re) => { const m = html.match(re); return m ? m[1] : ''; };
  const body = pick(/<article[^>]*>([\s\S]*?)<\/article>/i) || pick(/<main[^>]*>([\s\S]*?)<\/main>/i) || pick(/<body[^>]*>([\s\S]*?)<\/body>/i) || html;
  const title = meta(html, 'og:title') || decode(pick(/<title[^>]*>([\s\S]*?)<\/title>/i)).trim();
  return { title, text: htmlToText(body), source: url };
}

function readFileItem(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const html = /\.html?$/i.test(file);
  const text = html ? htmlToText(raw) : raw.trim();
  const title = (html ? decode((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '') : '') || (text.split('\n').find((l) => l.trim()) || '').replace(/^#+\s*/, '');
  return { title: title.trim(), text, source: file };
}

function localItems(input) {
  const p = path.resolve(input.replace(/^~(?=$|\/)/, os.homedir()));
  if (!fs.existsSync(p)) throw new Error('파일이나 폴더가 없어요');
  if (fs.statSync(p).isDirectory()) {
    const files = fs.readdirSync(p).filter((f) => FILE_EXT.includes(path.extname(f).toLowerCase())).sort().map((f) => path.join(p, f));
    if (!files.length) throw new Error('.md·.txt·.html 파일이 없어요');
    return files.slice(0, MAX_ITEMS).map(readFileItem);
  }
  if (!FILE_EXT.includes(path.extname(p).toLowerCase())) throw new Error('.md·.txt·.html 파일만 읽어요');
  return [readFileItem(p)];
}

// 한 줄(주소나 경로)에서 글 목록을 만든다.
async function fromLine(line) {
  if (!/^https?:\/\//i.test(line)) return localItems(line);
  const u = new URL(line);
  const n = parseNaver(u);
  if (n && n.logNo) return [await naverPost(n.blogId, n.logNo)];
  if (n) {
    const list = await naverList(n.blogId, n.categoryNo);
    const out = [];
    for (const x of list) {
      try { out.push({ ...(await naverPost(n.blogId, x.logNo)), ...x }); } catch { /* 비공개·삭제 글은 건너뛴다 */ }
    }
    return out;
  }
  return [await webPost(line)];
}

// sources: 한 줄에 하나씩 적은 문자열. 결과는 200자 이상인 글만, 중복 출처는 한 번만.
async function collect(sources) {
  const lines = String(sources || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_ITEMS);
  const items = [];
  const errors = [];
  for (const line of lines) {
    try {
      for (const it of await fromLine(line)) {
        if (items.some((x) => x.source === it.source)) continue;
        if (it.text.length < MIN_CHARS) { errors.push({ source: it.source, error: `본문이 ${MIN_CHARS}자보다 짧아요` }); continue; }
        items.push({ ...it, title: (it.title || '').slice(0, 80), chars: it.text.length });
        if (items.length >= MAX_ITEMS) break;
      }
    } catch (e) { errors.push({ source: line, error: e.name === 'TimeoutError' ? '응답이 없어요' : e.message }); }
    if (items.length >= MAX_ITEMS) break;
  }
  return { items, errors };
}

module.exports = { collect, MIN_CHARS, MAX_ITEMS };
