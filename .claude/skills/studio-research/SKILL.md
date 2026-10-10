---
name: studio-research
description: 주제 하나를 조사해 리서치 기록(brief.json)을 만들거나, 기존 리서치에 추가 조사를 덧붙인다. 인자로 리서치 폴더 경로(data/research/<rid>)를 받는다.
argument-hint: data/research/<rid>
disable-model-invocation: true
allowed-tools: Read Write Glob Grep WebSearch WebFetch
---

# 리서치

인자: `$ARGUMENTS` (예: `data/research/2026-10-05-r01`). 이하 이 경로를 RES라고 부른다. 조사 결과는 로컬 리서치 기록으로 남아 나중에 다시 쓰이므로, 글 한 편에만 맞추지 말고 이 주제에 대한 쓸모 있는 기록이 되게 정리한다.

## 0. 읽기

1. `brand/feedback.md`: 사용자의 의견. **가장 먼저 읽고 다른 규칙보다 우선한다.**
2. `RES/request.json`: `title`, `group`(세부 분야), `pillar`, `why_now`, `angles`, `bridge`(비유 아이디어), `sources`, `take`(사용자의 한 줄 관점), `notes`(사용자의 메모·궁금한 점), `outline`(true면 `notes`가 사용자가 짠 글 흐름), `mode`(`new` 또는 `extend`), `focus`(추가 조사할 내용, `extend`일 때), `today`
3. `brand/rules.md`(리서치 순서와 금지 출처), `brand/brand.md`(비유 규칙과 금지)
4. `mode`가 `extend`이면 기존 `RES/brief.json`도 읽는다.

## 1-A. 새 리서치 (`mode: new`)

`brand/rules.md`의 순서를 따른다. 질문 3~5개 → 한·영 검색 → 사실 메모 → 교차 확인 → 비교 사례 → **비유 조사** → 미디어 후보.

- `notes`에 사용자가 궁금하다고 적은 것은 질문 목록에 반드시 넣는다.
- `take`가 있으면 그 관점을 검증하거나 반박할 사실도 함께 찾는다(관점에 유리한 것만 모으지 않는다).
- 비유 조사: 독자가 이미 아는 것에 빗댈 후보 2~3개를 `analogies`에 적는다. 닮았다고 보는 근거와 들어맞지 않는 부분을 함께 적는다. 이야기형 기둥이면 자연스러운 것만 한두 개, 없으면 빈 배열.
- `outline`이 true면 `notes`의 **줄마다** 사실인지 확인한다. 줄마다 하나 이상의 `facts` 항목을 만들고, `note`에 몇 번째 줄인지 적는다(예: "흐름 2번"). 사실과 다르거나 확인되지 않으면 `status`를 `unverified`로 두고 `note`에 실제로 확인된 내용을 적는다. 그런 줄은 `open_questions`에도 적는다. 흐름에 "~가 있다면 더 소개"처럼 찾아 달라는 줄이 있으면 그 내용을 따로 조사한다.

## 1-B. 추가 조사 (`mode: extend`)

- `focus`에 적힌 것만 조사한다. 이미 있는 항목은 다시 조사하지 않는다.
- 기존 `facts`, `numbers` 등은 **지우거나 고치지 않는다.** 새 항목을 뒤에 덧붙이고, id는 기존 번호에 이어서 붙인다(f8, n28 …).
- 새 사실이 기존 항목과 어긋나면 기존 항목은 그대로 두고, 새 항목의 `note`에 "f3과 다름: …"처럼 적는다.
- 확인 상태가 바뀐 기존 수치가 있으면(예: 두 번째 출처 발견) 그 항목의 `status`와 출처 목록만 갱신해도 된다.

## 2. 출력: `RES/brief.json`

```json
{
  "title": "리서치 제목(주제를 한 줄로)",
  "summary": "이 리서치에서 알게 된 핵심 두세 문장",
  "questions": ["이 주제에서 답할 질문"],
  "facts": [
    {"id": "f1", "text": "사실 요약(내 말로)", "date": "2026-10-04", "sources": ["https://...", "https://..."], "status": "two_sources", "note": ""}
  ],
  "numbers": [
    {"id": "n1", "label": "무엇의 수치인지", "value": "3.12", "as_of": "기준 시점", "source": "https://...", "status": "two_sources"}
  ],
  "comparisons": [{"text": "과거 비슷한 사례", "source": "https://..."}],
  "analogies": [
    {"angle": "비유 각도", "subject": "설명할 대상과 특징", "familiar": "독자가 아는 것과 특징", "basis": "닮았다고 보는 근거", "gap": "들어맞지 않는 부분", "sources": ["https://..."]}
  ],
  "media": [
    {"kind": "youtube", "title": "영상 제목", "url": "https://www.youtube.com/watch?v=...", "license": "공식 채널 링크 삽입", "credit": "", "placement": "도입부 다음"},
    {"kind": "photo", "title": "사진 설명", "url": "https://commons.wikimedia.org/wiki/File:...", "license": "CC BY-SA 4.0", "credit": "저작자 / Wikimedia Commons / CC BY-SA 4.0", "placement": "본문 중간"},
    {"kind": "chart", "title": "도표 제목", "url": "", "license": "직접 제작", "credit": "", "placement": "수치 설명 부분", "source": "출처: (출처 이름, 기준 시점)", "data": [{"label": "2025", "value": 3.41}, {"label": "2026", "value": 3.12}]}
  ],
  "open_questions": ["확인하지 못한 것"],
  "rounds": [
    {"at": "2026-10-05", "mode": "new", "focus": "", "summary": "이번 조사에서 한 일 한 줄"}
  ]
}
```

- `status`: `two_sources`, `one_source`, `unverified`.
- 미디어 후보 2~5개. 저작권 기준은 `brand/rules.md`. 주제의 중심 대상(사람·제품·장소·사물)의 **위키미디어 커먼즈 사진이 있으면 1~2장** 넣는다. 인스타 표지와 블로그에 실제 사진으로 쓰인다. `url`은 반드시 커먼즈 파일 페이지 주소(`https://commons.wikimedia.org/wiki/File:…`)로 적고, 라이선스가 CC BY, CC BY-SA, CC0, 퍼블릭 도메인인 것만 고른다. 프로그램이 이 주소로 사진과 저작자 정보를 자동으로 받는다. 없으면 넣지 않는다(억지로 관계없는 사진을 고르지 않는다).
- 수치 비교가 있으면 `chart`를 1~2개 넣는다. `chart.data` 값은 숫자만, 3~8개, 모두 `numbers`에 출처가 있는 값.
- `rounds`에는 조사할 때마다 한 줄씩 덧붙인다(`extend`면 기존 목록 뒤에 추가).
- `summary`는 추가 조사 뒤에도 전체 내용을 반영해 다시 쓴다.

마지막 응답에는 만든 파일 경로만 적는다.
