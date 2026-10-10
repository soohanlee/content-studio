---
name: studio-draft
description: 포스트 폴더의 리서치 기록(brief.json)과 사용자의 메모만으로 블로그 초안, 메타 정보, 자동 점검 결과를 만든다. 새로 조사하지 않는다. 인자로 포스트 폴더 경로(data/posts/<id>)를 받는다.
argument-hint: data/posts/<id>
disable-model-invocation: true
allowed-tools: Read Write Glob Grep
---

# 블로그 초안 쓰기

인자: `$ARGUMENTS` (예: `data/posts/2026-10-05-01`). 이하 POST. **이 단계에서는 웹 검색을 하지 않는다.** 필요한 사실은 모두 `POST/brief.json`과 `POST/topic.json`의 `notes`에서만 가져온다.

## 0. 읽기

1. `brand/feedback.md`: 사용자의 의견. **가장 먼저 읽고 다른 규칙보다 우선한다.**
2. `POST/topic.json`: `title`, `group`, `pillar`, `format`, `take`(사용자의 한 줄 관점), `notes`(사용자의 메모), `outline`(true면 `notes`가 사용자가 짠 글 흐름), `research_mode`, `characterName`, `today`, `newsletter`(구독 안내를 넣을지와 이름)
   - `research_mode`: `researched`(방금 조사함), `reuse`(예전 리서치를 그대로 씀), `notes`(조사 없이 메모로만 씀)
3. `POST/brief.json`: 리서치 기록. `notes` 모드면 거의 비어 있다.
4. `brand/style-guide.md`(가장 중요), `brand/brand.md`, `brand/rules.md`, `brand/pillars.json`(이 기둥의 `length`)
5. 문체 예시: `brand/corpus/index.json`이 있으면 `score`가 높은 순으로 **최대 3편**을 읽는다. 문장을 베끼지 말고 리듬과 장치만 익힌다. 없으면 건너뛴다.

`topic.json`의 `fixed_title`이 true면 사용자가 정한 제목이다. 초안 첫 줄(`# 제목`)과 `meta.json`의 첫 번째 제목 후보에 `title`을 글자 하나 바꾸지 않고 그대로 쓴다. 나머지 후보 2개만 새로 만든다.

`take`가 있으면 글의 결론과 관점은 반드시 `take`를 따른다. `notes`에 적힌 내용(경험, 주장, 강조점)은 빠짐없이 반영한다.

`outline`이 true면 사용자가 짠 흐름이 글의 뼈대다. 스타일 가이드 5장의 뼈대보다 이 흐름을 우선한다.
- 흐름의 순서대로 쓴다. 첫 줄의 내용으로 열고, 마지막 줄의 내용으로 닫는다. 줄을 빼거나 순서를 바꾸지 않는다.
- 줄마다 `brief.json`의 해당 `facts`(note에 "흐름 N번")로 살을 붙인다.
- 확인되지 않았거나 사실과 다른 줄은 지어내지 않는다. 확인된 사실로 바꿔 쓰거나 단정하지 않고 쓴 뒤, 점검에 `unverified`로 남겨 사용자가 고르게 한다.

## 1. 초안 → `POST/draft.md`

- `brand/style-guide.md`의 화자, 줄바꿈, 연결어 빈도, 숫자 다루는 법, 뼈대를 따른다.
- 분량: `brand/pillars.json`에서 이 기둥의 `length`. 사용자의 흐름(`outline`)을 다 담느라 넘치면 넘쳐도 되고, `notes` 모드에서 근거가 적으면 짧아도 된다(억지로 늘리지 않는다).
- 도입은 장면 한 줄이나 독자가 알고 있는 전제로 연다. 결론 요약으로 시작하지 않는다.
- 문단은 짧게 끊는다(스타일 가이드 2장).
- 해설형·정리형 글에는 `brief.json`의 `analogies`에서 비유를 하나 이상 넣고, 닮은 점과 다른 점을 함께 쓴다. 이야기형은 자연스러울 때만. `notes` 모드에서 근거가 없으면 메모에 있는 비유만 쓰고, 없으면 쓰지 않는다.
- 스타일 가이드가 말줄임표를 금지하면(`...`, `…`) 쓰지 않는다.
- **글쓴이의 개인 경험은 지어내지 않는다.** "직접 써 봤는데", "가 봤더니", "기억에 남는다" 같은 1인칭 경험·일화는 `topic.json`의 `notes`나 `brand/brand.md`의 화자 설정에 있는 것만 쓴다. 없으면 경험 대신 사실이나 독자에게 던지는 질문으로 쓴다.
- 첫 줄은 `# 제목`. 소제목은 `##`를 2~4개.
- 미디어 자리는 단독 줄에 `[영상: 제목]`, `[사진: 설명]`, `[도표: 제목]`. `brief.json`의 `media` 순서와 맞춘다.
- `brief.json`에 없는 수치·사실은 쓰지 않는다. `unverified` 수치도 쓰지 않는다. 사용자의 `notes`에 있는 수치는 쓰되, 점검에서 `unverified`로 표시한다.
- 날짜 표현("오늘 아침", "내일")은 `today` 기준이다. 발행일이 달라질 수 있으니 가능하면 "10월 3일"처럼 날짜로 쓴다.
- `newsletter.enabled`가 true면 맨 끝 빈 줄 뒤 구독 안내 한 줄: `매주 {newsletter.name}을 메일로 받아 보세요 → {{NEWSLETTER_URL}}`. false면 쓰지 않는다.

## 2. 메타 → `POST/meta.json`

```json
{
  "titles": ["제목 후보 1(초안 제목)", "제목 후보 2", "제목 후보 3 — 셋 중 2개 이상은 스타일 가이드 6장의 제목 틀로, 검색어를 앞쪽에, 40~55자"],
  "tags": ["블로그 태그 10개, # 없이"],
  "summary": "글 요약 두 문장",
  "char_count": 2000,
  "style_refs": [{"file": "sample-01.md", "title": "참조한 원문 제목", "why": "고른 이유 한 줄"}]
}
```

## 3. 자동 점검 → `POST/checks.json`

초안을 다시 읽고 아래를 하나씩 확인해 배열로 쓴다.

- 초안에 나온 **모든 수치**: `brief.json`의 `numbers`와 값이 같은지. 같으면 `ok`(출처 1곳이면 `one_source`), 없으면 `unverified`.
- 핵심 사실 문장: `facts`와 연결.
- 직접 인용: 한 문장 이하인지, 출처가 있는지.
- `outline`이 true면: 흐름의 줄이 모두 순서대로 들어갔는지 `type: "outline"`으로 줄마다 하나씩 적는다. 확인된 줄은 `ok`, 사실과 다르거나 확인 못 한 줄은 `unverified`로 두고 `note`에 실제로 확인된 내용과 초안에서 어떻게 처리했는지 적는다.
- 비유: 해설형·정리형 글에 비유가 있는지, 근거와 다른 점이 적혔는지 → 부족하면 `style`로 표시하고 보완한다.
- `brand/feedback.md`의 의견을 지켰는지 → 어기면 고친다.
- 금지 항목: `brand/brand.md`와 `brand/rules.md`의 금지, 실명·직장 노출, 기사 문장 전재 의심 → `violation`.
- 문체: `brand/style-guide.md` 3장 '초안 기준'을 넘는 표현, AI 말투(8장), 한 줄 길이 기준을 넘는 줄이 잦은지 → `style`. 범위를 넘으면 초안을 고친 뒤 `note`에 적는다.

```json
[
  {"type": "number", "text": "42%", "source_url": "https://...", "status": "ok", "note": "기준 시점"},
  {"type": "fact", "text": "...", "source_url": "https://...", "status": "one_source", "note": ""},
  {"type": "style", "text": "...", "source_url": "", "status": "ok", "note": ""}
]
```

`violation`이 있으면 초안을 고친 뒤 다시 점검하고, 최종 `checks.json`에는 고친 결과를 남긴다.

마지막 응답에는 만든 파일 경로만 적는다.
