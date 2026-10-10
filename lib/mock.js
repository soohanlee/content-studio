'use strict';
// STUDIO_MOCK=1 일 때 claude 대신 가짜 결과 파일을 쓴다. 화면 흐름 시험용이며 내용은 모두 예시다.
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const { readJson, writeJson } = require('./store');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const abs = (rel) => path.join(ROOT, rel);

// 처음 설정: 카테고리 이름만 넣은 예시 규칙 파일
async function setup(rel) {
  await sleep(1500);
  const p = readJson(path.join(abs(rel), 'input.json'), {});
  const dir = require('./profile').BRAND;
  fs.mkdirSync(dir, { recursive: true });
  const cat = p.category || '내 분야';
  fs.writeFileSync(path.join(dir, 'brand.md'), `# 브랜드 설정 (테스트 모드 예시)\n\n- 한 줄: ${cat}을 ${p.audience || '독자'}의 언어로\n- 화자: ${p.characterName || '나'}\n`);
  fs.writeFileSync(path.join(dir, 'style-guide.md'), `# 문체 가이드 (테스트 모드 예시)\n\n- 말투: ${p.voice || '평서체'}\n`);
  fs.writeFileSync(path.join(dir, 'channels.md'), '# 인스타그램·쓰레드 규칙 (테스트 모드 예시)\n');
  fs.writeFileSync(path.join(dir, 'rules.md'), '# 리서치와 저작권 규칙 (테스트 모드 예시)\n');
  writeJson(path.join(dir, 'pillars.json'), [
    { id: 'explainer', name: `${cat} 쉽게 풀기`, what: '어려운 개념을 독자의 말로', format: '해설형' },
    { id: 'news', name: '이번 주 소식', what: '최근 1~2주 큰 이슈', format: '정리형' },
    { id: 'howto', name: '따라 하기', what: '오늘 바로 해 볼 수 있는 방법', format: '실용형' },
    { id: 'story', name: '이야기', what: '비하인드와 잡학, 가볍게', format: '이야기형' },
  ]);
}

async function topics(rel) {
  await sleep(1500);
  const ctx = readJson(path.join(abs(rel), 'context.json'), {});
  const pillars = ctx.pillars && ctx.pillars.length ? ctx.pillars : [{ id: 'explainer', name: '해설', format: '해설형' }];
  const list = [];
  for (const [group, n] of Object.entries(ctx.mix || { 일반: 12 })) {
    for (let k = 0; k < n; k++) {
      const pl = pillars[(list.length) % pillars.length];
      list.push({
        id: `t${String(list.length + 1).padStart(2, '0')}`, group, pillar: pl.id, format: pl.format,
        title: `[${group}] (예시) ${ctx.category || ''} 주제 후보 ${list.length + 1}`,
        why_now: '(예시) 테스트 모드에서 만든 주제예요. 실제로는 요즘 이슈를 찾아 채워요.',
        angles: ['(예시) 관점 후보 1', '(예시) 관점 후보 2'],
        bridge: '(예시) 독자가 아는 것에 빗대면 이런 상황',
        sources: [{ title: '예시 출처', url: 'https://example.com/' }],
      });
    }
  }
  writeJson(path.join(abs(rel), 'topics.json'), { batch_id: ctx.batch_id, generated_at: new Date().toISOString(), season_phase: '(예시) 지금 흐름 한 줄', topics: list });
}

function exampleBrief(topic) {
  return {
    title: topic.title, summary: '(예시) 테스트 모드 리서치 요약입니다.',
    rounds: [{ at: topic.today, mode: 'new', focus: '', summary: '(예시) 새 리서치' }],
    questions: ['(예시) 이 글이 답할 질문 1', '(예시) 질문 2'],
    facts: [{ id: 'f1', text: '(예시) 사실 요약', date: topic.today, sources: ['https://example.com/a', 'https://example.com/b'], status: 'two_sources' }],
    numbers: [{ id: 'n1', label: '(예시) 핵심 수치', value: '42%', as_of: '발표일', source: 'https://example.com/a', status: 'two_sources' },
      { id: 'n2', label: '(예시) 비교 수치', value: '1.5배', as_of: '발표일', source: 'https://example.com/b', status: 'one_source' }],
    comparisons: [{ text: '(예시) 과거 비슷한 사례', source: 'https://example.com/c' }],
    analogies: [{ angle: '(예시) 쉽게 말하면', subject: '(예시) 낯선 개념', familiar: '(예시) 독자가 아는 것', basis: '(예시) 닮은 점', gap: '(예시) 다른 점', sources: [] }],
    media: [
      { kind: 'youtube', title: '(예시) 공식 영상', url: 'https://www.youtube.com/', license: '공식 채널 링크 삽입', credit: '', placement: '도입부 다음' },
      { kind: 'chart', title: '(예시) 최근 3년 변화', url: '', license: '직접 제작', credit: '', placement: '수치 설명', source: '출처: 예시', data: [{ label: '2024', value: 30 }, { label: '2025', value: 36 }, { label: '2026', value: 42 }] },
    ],
    open_questions: ['(예시) 확인하지 못한 것'],
  };
}

async function research(rel) {
  await sleep(1500);
  const dir = abs(rel);
  const topic = readJson(path.join(dir, 'request.json'), {});
  const prev = readJson(path.join(dir, 'brief.json'));
  if (prev && topic.mode === 'extend') {
    prev.facts.push({ id: `f${prev.facts.length + 1}`, text: `(예시) 추가 조사: ${topic.focus}`, date: topic.today, sources: ['https://example.com/'], status: 'one_source' });
    prev.rounds = [...(prev.rounds || []), { at: topic.today, mode: 'extend', focus: topic.focus, summary: '(예시) 추가 조사' }];
    writeJson(path.join(dir, 'brief.json'), prev);
    return;
  }
  writeJson(path.join(dir, 'brief.json'), exampleBrief(topic));
}

async function draft(rel) {
  await sleep(2000);
  const dir = abs(rel);
  const topic = readJson(path.join(dir, 'topic.json'), {});
  const title = topic.title || '(예시) 제목';
  fs.writeFileSync(path.join(dir, 'draft.md'), `# ${title}

(테스트 모드 예시 초안입니다.)

처음 이 소식을 들었을 때 고개가 갸웃했다.
이게 왜 지금 이야기가 될까.

${topic.take ? `내 관점: ${topic.take}\n` : ''}
[영상: (예시) 공식 영상]

## 숫자로 보면

핵심 수치는 42%.
겉으로 보면 큰 변화는 아니다.
하지만 3년 흐름으로 보면 이야기가 달라진다.

[도표: (예시) 최근 3년 변화]

## 쉽게 말하면

독자가 이미 아는 것에 빗대면 이런 상황이다.
닮은 점과 다른 점을 함께 보면 더 분명해진다.

과연 이 흐름은 계속될까?

매주 일요일, 주간 노트를 메일로 받아 보세요 → {{NEWSLETTER_URL}}
`);
  writeJson(path.join(dir, 'meta.json'), { titles: [title, '(예시) 제목 후보 2', '(예시) 제목 후보 3'], tags: ['예시태그1', '예시태그2', '예시태그3'], summary: '(예시) 요약 두 문장.', char_count: 400, style_refs: [] });
  writeJson(path.join(dir, 'checks.json'), [
    { type: 'number', text: '핵심 수치 42%', source_url: 'https://example.com/a', status: 'ok', note: '발표일 기준' },
    { type: 'number', text: '비교 수치 1.5배', source_url: 'https://example.com/b', status: 'one_source', note: '출처 1곳' },
    { type: 'style', text: '한 줄 길이', source_url: '', status: 'ok', note: '' },
  ]);
}

async function revise(rel) {
  await sleep(1500);
  const dir = abs(rel);
  const rev = readJson(path.join(dir, 'revision.json'), { requests: [] });
  const last = rev.requests[rev.requests.length - 1];
  const text = fs.readFileSync(path.join(dir, 'draft.md'), 'utf8');
  fs.writeFileSync(path.join(dir, 'draft.md'), text.replace('(테스트 모드 예시 초안입니다.)', `(테스트 모드 예시 초안입니다. 수정 반영: ${last ? last.comment : ''})`));
  if (last) last.applied_note = '(예시) 요청을 반영했습니다.';
  writeJson(path.join(dir, 'revision.json'), rev);
}

async function social(rel) {
  await sleep(1500);
  const dir = abs(rel);
  writeJson(path.join(dir, 'social.json'), {
    instagram: {
      series: '(예시) 한 장 정리',
      compare_label: '쉽게 말하면',
      slides: [
        { kind: 'cover', title: '(예시)\n큰 질문 하나', body: '1분 만에 이해하기' },
        { kind: 'point', title: '무슨 일인가', body: '(예시) 한 장에 한 메시지' },
        { kind: 'stat', title: '42%', body: '(예시) 이 숫자의 뜻 한 줄' },
        { kind: 'compare', title: '이미 아는 것에 빗대면', body: '(예시) 닮은 점과 다른 점' },
        { kind: 'point', title: '그래서 나는', body: '(예시) 오늘 해 볼 수 있는 것' },
        { kind: 'summary', title: '세 줄 요약', body: '첫째 줄\n둘째 줄\n셋째 줄' },
        { kind: 'outro', title: '오늘도 한 장 정리', body: '저장해 두세요' },
      ],
      caption: '(예시) 첫 줄 훅\n\n핵심 세 줄\n\n질문 하나',
      hashtags: ['예시1', '예시2', '예시3'],
    },
    threads: {
      thread: ['1/5 (예시) 훅', '2/5 (예시) 핵심 1', '3/5 (예시) 핵심 2', '4/5 (예시) 핵심 3', '5/5 (예시) 결론 {{BLOG_URL}}'],
      singles: [{ format: 'question', text: '(예시) 여러분은 어떻게 하세요? 답글 주시면 하나씩 풀어 드릴게요.' }],
    },
    shorts_script: '(예시) 30초 만에 알려 드릴게요.',
  });
}

// 한 번에 쓰기: 리서치·초안·SNS 결과를 한꺼번에
async function onepass(rel) {
  const dir = abs(rel);
  const topic = readJson(path.join(dir, 'topic.json'), {});
  writeJson(path.join(dir, 'brief.json'), exampleBrief(topic));
  await draft(rel);
  await social(rel);
}

async function newsletter(rel) {
  await sleep(1500);
  const input = readJson(path.join(abs(rel), 'newsletter_input.json'), {});
  fs.writeFileSync(path.join(abs(rel), 'newsletter.md'), `# ${input.newsletter_name || '주간 노트'} · ${input.week_id || ''}

(테스트 모드 예시 뉴스레터입니다.)

## 이번 주 꼭 알아야 할 것 5가지
1. (예시) 첫 번째 소식
2. (예시) 두 번째 소식

## 다음 주에 볼 것
- (예시) 눈여겨볼 점

## ${input.characterName || '나'}의 한마디
(예시) 이번 주도 정리 완료.
`);
}

// 메일 본문에서 '주제:' 줄과 '-' 흐름 줄을 뽑는다
async function intake(rel) {
  await sleep(500);
  const email = readJson(path.join(abs(rel), 'email.json'), {});
  const text = String(email.text || '');
  const title = ((text.match(/주제\s*[:：]\s*(.+)/) || [])[1] || '(예시) 메일로 받은 주제').trim();
  const lines = text.split('\n').filter((l) => /^\s*[-•]/.test(l)).map((l) => l.trim());
  writeJson(path.join(abs(rel), 'intake.json'), {
    topics: [{ title, group: '', pillar: '', take: '', notes: lines.join('\n') || text.slice(0, 500), outline: lines.length > 1, mode: 'full' }],
    note: '(예시) 테스트 모드에서 읽은 결과예요.',
  });
}

async function run(skill, arg) {
  const map = { 'studio-setup': setup, 'studio-intake': intake, 'studio-topics': topics, 'studio-research': research, 'studio-draft': draft,
    'studio-onepass': onepass, 'studio-revise': revise, 'studio-social': social, 'studio-newsletter': newsletter };
  await map[skill](arg);
  return { ok: true, result: `(mock) ${skill} ${arg}`, meta: { mock: true } };
}

module.exports = { run };
