'use strict';
// 카테고리 프로필(data/profile.json). 처음 실행할 때 한 번 정하고 고정한다.
// 고정하면 studio-setup 스킬이 이 값으로 brand/ 규칙 파일(브랜드·문체·채널·리서치 규칙·콘텐츠 기둥)을 만든다.
// 다른 분야를 쓰려면 이 폴더를 통째로 하나 더 복사해서 따로 설정한다.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { MIN_CHARS, MAX_ITEMS } = require('./samples');
const { ROOT } = require('./config');

const FILE = path.join(store.dirs.data, 'profile.json');
// 테스트 모드는 실제 규칙 파일을 건드리지 않도록 data-mock/brand에 쓴다(스킬은 실행하지 않는다).
const BRAND = process.env.STUDIO_MOCK === '1' ? path.join(store.dirs.data, 'brand') : path.join(ROOT, 'brand');
const CORPUS = path.join(BRAND, 'corpus');
// studio-setup이 만들어야 하는 파일. 모두 있어야 글쓰기를 시작할 수 있다.
const BRAND_FILES = ['brand.md', 'style-guide.md', 'channels.md', 'rules.md', 'pillars.json'];
const VOICES = {
  plain: '평서체(~다). 칼럼처럼 담백하게',
  polite: '존댓말(~요). 친구에게 설명하듯 친근하게',
  formal: '합니다체(~습니다). 정중하고 깔끔하게',
};
const DEFAULT_COLORS = { primary: '#191D28', accent: '#FF6A2B' };
const HEX = /^#[0-9A-Fa-f]{6}$/;

function get() { return store.readJson(FILE, null); }
const isLocked = () => !!(get() || {}).lockedAt;

// 설정이 끝났는지: 고정했고, 규칙 파일이 모두 있다.
function isReady() {
  const p = get();
  return !!(p && p.lockedAt && p.setup && p.setup.status === 'ready' && BRAND_FILES.every((f) => fs.existsSync(path.join(BRAND, f))));
}

function clean(s, max = 200) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }

// 고정하기 전까지만 바꿀 수 있는 값
function validate(input) {
  const category = clean(input.category, 40);
  if (!category) throw new Error('카테고리를 정해 주세요.');
  const groups = (Array.isArray(input.groups) ? input.groups : String(input.groups || '').split(/[,\n]/))
    .map((g) => clean(g, 20)).filter(Boolean).filter((g, i, a) => a.indexOf(g) === i).slice(0, 4);
  if (!groups.length) throw new Error('세부 분야를 하나 이상 적어 주세요.');
  const voice = VOICES[input.voice] ? input.voice : 'plain';
  return {
    category, presetId: clean(input.presetId, 20) || null, groups,
    audience: clean(input.audience) || `${category}에 관심 있는 사람`,
    angle: clean(input.angle),
    voice, voiceText: VOICES[voice],
    noEllipsis: input.noEllipsis !== false,
  };
}

// 카테고리를 고정한다. 문체 샘플(선택)은 brand/corpus/에 저장한다.
function lock(input, samples = []) {
  if (isLocked()) throw new Error('카테고리는 이미 고정했어요. 다른 분야는 폴더를 하나 더 복사해서 쓰세요.');
  const p = validate(input);
  const saved = saveSamples(samples);
  const profile = { ...p, samples: saved, colors: { ...DEFAULT_COLORS }, lockedAt: new Date().toISOString(), setup: { status: 'queued' } };
  store.writeJson(FILE, profile);
  return profile;
}

// 고정한 뒤에도 바꿀 수 있는 것: 카드 색만. (이름·계정·뉴스레터 주소는 settings.json)
function setColors(colors) {
  const p = get();
  if (!p) throw new Error('먼저 카테고리를 정해 주세요.');
  const next = { ...DEFAULT_COLORS, ...(p.colors || {}) };
  for (const k of ['primary', 'accent']) if (HEX.test(String(colors[k] || ''))) next[k] = colors[k].toUpperCase();
  store.writeJson(FILE, { ...p, colors: next });
  return next;
}

function setSetup(patch) {
  const p = get();
  if (!p) return null;
  store.writeJson(FILE, { ...p, setup: { ...(p.setup || {}), ...patch } });
  return get();
}

// 문체 샘플: 사용자의 예전 글. 붙여 넣은 본문(문자열)이나 주소·경로에서 가져온 글({ title, text, source })을 받는다.
// 스킬이 리듬과 장치만 참고한다.
function saveSamples(samples) {
  const list = (Array.isArray(samples) ? samples : [])
    .map((s) => (typeof s === 'string' ? { text: s } : s || {}))
    .map((s) => ({ title: clean(s.title, 80), source: clean(s.source, 300), text: String(s.text || '').trim() }))
    .filter((s) => s.text.length >= MIN_CHARS).slice(0, MAX_ITEMS);
  if (!list.length) return 0;
  fs.mkdirSync(CORPUS, { recursive: true });
  const index = list.map((s, i) => {
    const file = `sample-${String(i + 1).padStart(2, '0')}.md`;
    const title = s.title || (s.text.split('\n').find((l) => l.trim()) || '').replace(/^#+\s*/, '').slice(0, 60);
    const head = s.source ? `# ${title}\n\n- 출처: ${s.source}\n\n` : '';
    fs.writeFileSync(path.join(CORPUS, file), `${head}${s.text}\n`);
    return { file, title, kind: 'sample', score: 0, chars: s.text.length, ...(s.source ? { source: s.source } : {}) };
  });
  store.writeJson(path.join(CORPUS, 'index.json'), index);
  return list.length;
}

// 콘텐츠 기둥(brand/pillars.json): [{ id, name, what, format }]
function pillars() {
  const list = store.readJson(path.join(BRAND, 'pillars.json'), []);
  return Array.isArray(list) ? list.filter((x) => x && x.id && x.name) : [];
}

// 주제 후보 12개를 세부 분야에 고르게 나눈다(앞쪽 분야부터 하나씩 더).
function topicMix(total = 12) {
  const groups = (get() || {}).groups || ['일반'];
  const base = Math.floor(total / groups.length);
  return Object.fromEntries(groups.map((g, i) => [g, base + (i < total % groups.length ? 1 : 0)]));
}

// 스킬 입력 파일에 넣는 요약
function forSkill() {
  const p = get() || {};
  return { category: p.category, groups: p.groups, audience: p.audience, angle: p.angle, voice: p.voiceText, noEllipsis: p.noEllipsis !== false };
}

const colors = () => ({ ...DEFAULT_COLORS, ...((get() || {}).colors || {}) });

module.exports = { get, isLocked, isReady, lock, setColors, setSetup, pillars, topicMix, forSkill, colors, VOICES, BRAND_FILES, BRAND, DEFAULT_COLORS };
