'use strict';
// 글에 쓸 실제 사진. 저작권 때문에 두 종류만 쓴다.
//   commons : 위키미디어 커먼즈의 자유 라이선스 사진(저작자 표기를 자동으로 붙인다)
//   own     : 사용자가 직접 찍어 올린 사진
// 결과는 글 폴더의 photos/ 와 photos/photos.json(목록과 표기 문구)에 저장된다.
const fs = require('fs');
const path = require('path');
const https = require('https');
const store = require('./store');

const UA = 'ContentStudio/0.1 (local blog tool)';

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
function download(url, file, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).href, file, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`사진 다운로드 실패 (${res.statusCode})`)); }
      const out = fs.createWriteStream(file);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    }).on('error', reject);
  });
}
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function listFile(dirAbs) { return path.join(dirAbs, 'photos', 'photos.json'); }
function list(dirAbs) { return store.readJson(listFile(dirAbs), []); }
function saveList(dirAbs, items) { store.writeJson(listFile(dirAbs), items); }

// commons URL에서 파일 이름을 뽑는다: .../wiki/File:Name.jpg
function commonsFileName(url) {
  const m = String(url).match(/(?:File|파일):([^?#]+)/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : null;
}

async function fetchCommons(dirAbs, media) {
  const name = commonsFileName(media.url);
  if (!name) return null;
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1600&titles=${encodeURIComponent('File:' + name)}`;
  const d = await getJson(api);
  const page = Object.values((d.query && d.query.pages) || {})[0];
  const ii = page && page.imageinfo && page.imageinfo[0];
  if (!ii) return null;
  const em = ii.extmetadata || {};
  const license = stripTags(em.LicenseShortName && em.LicenseShortName.value);
  // 자유 라이선스만 쓴다(CC BY, CC BY-SA, CC0, 퍼블릭 도메인)
  if (!/^(CC|Public domain|PD)/i.test(license)) return null;
  const artist = stripTags(em.Artist && em.Artist.value) || '저작자 미상';
  const ext = (path.extname(ii.thumburl ? new URL(ii.thumburl).pathname : name) || '.jpg').toLowerCase();
  const items = list(dirAbs);
  const file = `commons-${String(items.filter((x) => x.kind === 'commons').length + 1).padStart(2, '0')}${ext === '.png' ? '.png' : '.jpg'}`;
  fs.mkdirSync(path.join(dirAbs, 'photos'), { recursive: true });
  await download(ii.thumburl || ii.url, path.join(dirAbs, 'photos', file));
  const item = { file, kind: 'commons', title: media.title || name, license, artist, credit: `사진: ${artist} / Wikimedia Commons / ${license}`, source_url: ii.descriptionurl || media.url };
  saveList(dirAbs, [...items, item]);
  return item;
}

// brief.json의 photo 후보 중 아직 받지 않은 커먼즈 사진을 받는다.
async function ensureFromBrief(dirAbs) {
  const brief = store.readJson(path.join(dirAbs, 'brief.json'), {}) || {};
  const have = new Set(list(dirAbs).map((x) => x.source_url));
  const done = [];
  for (const m of (brief.media || []).filter((x) => x.kind === 'photo' && /commons\.wikimedia\.org/.test(x.url || ''))) {
    if ([...have].some((u) => u && commonsFileName(u) === commonsFileName(m.url))) continue;
    try { const it = await fetchCommons(dirAbs, m); if (it) done.push(it); } catch (e) { /* 사진 하나 실패해도 계속 */ }
  }
  return done;
}

// 사용자가 올린 사진 저장
function addOwn(dirAbs, buf, ext) {
  const items = list(dirAbs);
  const file = `own-${String(items.filter((x) => x.kind === 'own').length + 1).padStart(2, '0')}${ext}`;
  fs.mkdirSync(path.join(dirAbs, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(dirAbs, 'photos', file), buf);
  const item = { file, kind: 'own', title: '직접 찍은 사진', credit: '', source_url: '' };
  saveList(dirAbs, [...items, item]);
  return item;
}

// 표지에 쓸 사진: post.coverPhoto로 고른 것 → 직접 찍은 사진 → 커먼즈 사진 순
function coverPhoto(dirAbs, chosen) {
  const items = list(dirAbs);
  if (chosen === 'none') return null;
  return items.find((x) => x.file === chosen) || items.find((x) => x.kind === 'own') || items.find((x) => x.kind === 'commons') || null;
}

module.exports = { list, ensureFromBrief, addOwn, coverPhoto };
