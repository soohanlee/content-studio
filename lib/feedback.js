'use strict';
// 사용자의 피드백(의견). data/feedback.json에 저장하고, 스킬이 읽는 brand/feedback.md를 다시 만든다.
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const store = require('./store');

const FILE = path.join(store.dirs.data, 'feedback.json');
// 기본 data 폴더를 쓸 때만 실제 규칙 파일을 고친다. 테스트 모드나 비교 실험(STUDIO_DATA)은 그 폴더 안에 따로 쓴다.
const MD = store.dirs.data === path.join(ROOT, 'data') ? path.join(ROOT, 'brand', 'feedback.md') : path.join(store.dirs.data, 'feedback.md');
const SCOPES = ['전체', '블로그', '인스타그램', '쓰레드', '주제', '리서치'];

function load() {
  let list = store.readJson(FILE, null);
  if (!list) { list = []; save(list); }
  return list;
}

function writeMarkdown(list) {
  const active = list.filter((x) => x.active);
  const lines = ['# 피드백 (최우선 규칙)', '',
    '사용자가 화면에서 남긴 의견이다. 문체 가이드, 채널 규칙, 스킬 지시보다 **우선한다.** 서로 부딪히면 여기 적힌 것을 따른다.', ''];
  if (!active.length) lines.push('(아직 남긴 의견이 없다.)');
  for (const scope of SCOPES) {
    const items = active.filter((x) => (x.scope || '전체') === scope);
    if (!items.length) continue;
    lines.push(`## ${scope}`, '');
    for (const x of items) lines.push(`- ${x.text.replace(/\s*\n\s*/g, ' ')} (${(x.at || '').slice(0, 10)})`);
    lines.push('');
  }
  fs.mkdirSync(path.dirname(MD), { recursive: true });
  fs.writeFileSync(MD, lines.join('\n'));
}

function save(list) {
  store.writeJson(FILE, list);
  writeMarkdown(list);
}

function add(text, scope) {
  const list = load();
  const n = list.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0) + 1;
  const item = { id: `fb${n}`, text: String(text).trim(), scope: SCOPES.includes(scope) ? scope : '전체', active: true, at: new Date().toISOString() };
  list.push(item);
  save(list);
  return item;
}
function update(id, patch) {
  const list = load();
  const item = list.find((x) => x.id === id);
  if (!item) return null;
  Object.assign(item, patch);
  save(list);
  return item;
}
function remove(id) {
  const list = load().filter((x) => x.id !== id);
  save(list);
}

module.exports = { load, add, update, remove, SCOPES, writeMarkdown };
