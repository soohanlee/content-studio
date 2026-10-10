'use strict';
// 같은 주제를 두 방식으로 만들어 비교한다.
//   나눈 방식  : 리서치(studio-research) → 초안(studio-draft) → SNS(studio-social), claude를 세 번 실행
//   한 번에 쓰기: studio-onepass, claude를 한 번 실행(같은 규칙 문서를 읽는다)
// 끝나면 누가 만들었는지 가린 채로 studio-judge가 채점한다.
//
// 사용법: node scripts/compare.js "주제" [세부 분야] [기둥 id]
// 결과: data-compare/<실험 id>/report.json, report.md (각 방식의 글 폴더도 그 안에 있다)
// 처음 설정(분야 고정과 맞춤 규칙)이 끝난 폴더에서만 실행할 수 있다. 구독 사용량을 꽤 쓴다(글 두 편 + 채점).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const title = process.argv[2];
if (!title) { console.error('사용법: node scripts/compare.js "주제" [세부 분야] [기둥 id]'); process.exit(1); }

// 실험 데이터는 data-compare/<id>에 따로 쌓는다. lib을 불러오기 전에 정해야 한다.
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{6})$/, '$1-$2');
const runId = `cmp-${stamp}`;
const DIR = path.join(ROOT, 'data-compare', runId);
fs.mkdirSync(DIR, { recursive: true });
for (const f of ['profile.json', 'settings.json']) {
  const src = path.join(ROOT, 'data', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIR, f));
}
process.env.STUDIO_DATA = DIR;

const { load } = require('../lib/config');
const store = require('../lib/store');
const profile = require('../lib/profile');
const flow = require('../lib/flow');
const jobs = require('../lib/jobs');
const { runSkill } = require('../lib/claude');

const cfg = load();
if (!profile.isReady()) { console.error('처음 설정(분야 고정과 맞춤 규칙 만들기)을 먼저 끝내 주세요.'); process.exit(1); }

const p = profile.get();
const pillars = profile.pillars();
const group = p.groups.includes(process.argv[3]) ? process.argv[3] : p.groups[0];
const pl = pillars.find((x) => x.id === process.argv[4]) || pillars[0];
const topic = { id: null, title, group, pillar: pl.id, format: pl.format, why_now: '', angles: [], bridge: '', sources: [] };

const sec = (j) => (j.startedAt && j.endedAt ? Math.round((Date.parse(j.endedAt) - Date.parse(j.startedAt)) / 1000) : 0);
const count = (t, re) => (String(t).match(re) || []).length;

function metrics(name, postId, researchId) {
  const all = jobs.loadJobs().filter((j) => j.target === postId || j.target === researchId);
  const ai = all.filter((j) => j.type !== 'cards');
  const sum = (f) => ai.reduce((n, j) => n + (f(j) || 0), 0);
  const dir = store.postDir(postId);
  const J = (f, d) => store.readJson(path.join(dir, f), d) || d;
  const draft = store.readText(path.join(dir, 'draft.md'), '');
  const brief = J('brief.json', {}); const checks = J('checks.json', []); const social = J('social.json', {});
  const body = draft.replace(/^#.*$/gm, '').replace(/\[(영상|사진|도표):[^\]]*\]/g, '').replace(/\s+/g, '');
  const facts = brief.facts || []; const numbers = brief.numbers || [];
  const by = (arr, st) => arr.filter((x) => x.status === st).length;
  return {
    name, postId, researchId, status: (store.getPost(postId) || {}).status,
    runs: ai.map((j) => ({ type: j.type, seconds: sec(j), turns: (j.usage || {}).turns || 0, tokens: (j.usage || {}).total || 0, output: (j.usage || {}).output || 0, web: (j.usage || {}).web || 0, cost: (j.usage || {}).cost_equiv_usd || 0, status: j.status, error: j.error || '' })),
    claudeRuns: ai.length,
    seconds: sum(sec), cardsSeconds: all.filter((j) => j.type === 'cards').reduce((n, j) => n + sec(j), 0),
    turns: sum((j) => (j.usage || {}).turns), tokens: sum((j) => (j.usage || {}).total), output: sum((j) => (j.usage || {}).output),
    web: sum((j) => (j.usage || {}).web), cost: Math.round(sum((j) => (j.usage || {}).cost_equiv_usd) * 100) / 100,
    quality: {
      chars: body.length,
      headings: count(draft, /^## /gm),
      facts: facts.length, factsTwoSources: by(facts, 'two_sources'),
      numbers: numbers.length, numbersTwoSources: by(numbers, 'two_sources'), numbersUnverified: by(numbers, 'unverified'),
      analogies: (brief.analogies || []).length, media: (brief.media || []).length,
      checks: checks.length, checksOk: by(checks, 'ok'), checksOneSource: by(checks, 'one_source'), checksUnverified: by(checks, 'unverified'), violations: by(checks, 'violation'),
      ellipsis: count(draft, /\.\.\.|…/g),
      slides: ((social.instagram || {}).slides || []).length, threads: ((social.threads || {}).thread || []).length,
      threadsOver450: ((social.threads || {}).thread || []).filter((t) => t.length > 450).length,
    },
  };
}

(async () => {
  console.log(`[${runId}] 주제: ${title} · ${group} · ${pl.name}`);
  jobs.init(cfg);
  const A = flow.start(cfg, topic, { mode: 'full' });
  const B = flow.start(cfg, topic, { mode: 'onepass' });
  console.log(`나눈 방식 글 ${A.postId} · 한 번에 쓰기 글 ${B.postId}. 둘 다 끝날 때까지 기다려요(보통 20~40분).`);
  await jobs.drain();

  const split = metrics('나눈 방식 (리서치 → 초안 → SNS)', A.postId, A.researchId);
  const one = metrics('한 번에 쓰기', B.postId, B.researchId);

  // 눈가림 채점: X/Y 자리를 무작위로 정한다
  const judgeDir = path.join(DIR, 'judge');
  const swap = Math.random() < 0.5;
  const sides = swap ? { X: one, Y: split } : { X: split, Y: one };
  for (const [k, m] of Object.entries(sides)) {
    const to = path.join(judgeDir, k);
    fs.mkdirSync(to, { recursive: true });
    for (const f of ['draft.md', 'brief.json', 'checks.json', 'social.json', 'topic.json']) {
      const src = path.join(store.postDir(m.postId), f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(to, f));
    }
    // 방식이 드러나는 값은 지운다
    const tf = path.join(to, 'topic.json');
    const t = store.readJson(tf, {}); delete t.research_mode; delete t.research_id; store.writeJson(tf, t);
  }
  let judge = null;
  if (split.status !== 'failed' && one.status !== 'failed') {
    console.log('채점 중이에요.');
    const r = await runSkill(cfg, { skill: 'studio-judge', arg: store.rel(judgeDir), jobId: `${runId}-judge`, tools: 'Read,Write,Glob,WebFetch' });
    judge = store.readJson(path.join(judgeDir, 'judge.json'), null);
    if (judge) {
      judge.labels = { X: sides.X.name, Y: sides.Y.name };
      judge.usage = r.meta ? { turns: r.meta.num_turns, cost: r.meta.total_cost_usd } : null;
      const total = (s) => Object.values(s || {}).reduce((n, v) => n + Number(v || 0), 0);
      judge.totals = { [sides.X.name]: total(judge.scores.X), [sides.Y.name]: total(judge.scores.Y) };
      judge.winnerName = judge.winner === 'X' || judge.winner === 'Y' ? sides[judge.winner].name : judge.winner;
    }
  }

  const report = { runId, at: new Date().toISOString(), topic, category: p.category, model: cfg.model || '기본값', split, onepass: one, judge };
  store.writeJson(path.join(DIR, 'report.json'), report);

  const row = (k, f) => `| ${k} | ${f(split)} | ${f(one)} |`;
  const md = [
    `# 나눈 방식 vs 한 번에 쓰기 · ${runId}`, '',
    `- 분야: ${p.category} · 주제: ${title} (${group} · ${pl.name})`, `- 모델: ${report.model}`, '',
    '| | 나눈 방식 | 한 번에 쓰기 |', '|---|---|---|',
    row('claude 실행 횟수', (m) => m.claudeRuns),
    row('AI 작업 시간', (m) => `${Math.floor(m.seconds / 60)}분 ${m.seconds % 60}초`),
    row('턴 수', (m) => m.turns), row('토큰(캐시 포함)', (m) => `${Math.round(m.tokens / 1000)}k`), row('출력 토큰', (m) => `${Math.round(m.output / 1000)}k`),
    row('웹 검색·열람', (m) => m.web), row('API 정가 환산', (m) => `$${m.cost}`),
    row('본문 글자 수', (m) => m.quality.chars), row('사실 (출처 2곳)', (m) => `${m.quality.facts} (${m.quality.factsTwoSources})`),
    row('수치 (출처 2곳 / 미확인)', (m) => `${m.quality.numbers} (${m.quality.numbersTwoSources} / ${m.quality.numbersUnverified})`),
    row('자동 점검: 확인됨 / 출처 1곳 / 확인 필요 / 위반', (m) => `${m.quality.checksOk} / ${m.quality.checksOneSource} / ${m.quality.checksUnverified} / ${m.quality.violations}`),
    row('말줄임표', (m) => m.quality.ellipsis), row('인스타 카드 / 쓰레드 타래', (m) => `${m.quality.slides} / ${m.quality.threads}`), '',
    judge ? `## 눈가림 채점 (${judge.winnerName} 우세)\n\n${Object.entries(judge.totals).map(([k, v]) => `- ${k}: ${v}점 / 60`).join('\n')}\n\n${(judge.reasons || []).map((x) => `- ${x}`).join('\n')}` : '채점하지 못했어요(한쪽이 실패).',
  ].join('\n');
  fs.writeFileSync(path.join(DIR, 'report.md'), md + '\n');
  console.log(md);
  console.log(`\n결과 폴더: ${path.relative(ROOT, DIR)}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
