---
name: studio-topics
description: 지금 시점의 분야(카테고리) 이슈를 웹 검색해 블로그 주제 후보 12개를 topics.json으로 만든다. 인자로 추천 폴더 경로(data/topics/<id>)를 받는다.
argument-hint: data/topics/<id>
disable-model-invocation: true
allowed-tools: Read Write Glob WebSearch WebFetch
---

# 주제 후보 만들기

인자: `$ARGUMENTS` (예: `data/topics/2026-10-05-t01`). 이하 이 경로를 BATCH라고 부른다. 글은 하루에 여러 편일 수도, 며칠에 한 편일 수도 있다. 후보는 "지금 쓰기 좋은 주제"로 고른다.

## 1. 읽기

- `brand/feedback.md`: 사용자의 의견. **가장 먼저 읽고 다른 규칙보다 우선한다.**
- `BATCH/context.json`: `batch_id`, `today`, `isoTime`, `category`(분야), `groups`(세부 분야), `mix`(세부 분야별 후보 수, 예: `{"AI 도구": 4, "업무 자동화": 4, "AI 소식": 4}`), `pillars`(콘텐츠 기둥 목록), `audience`, `angle`, `characterName`, `recent_titles`(최근에 쓴 글 제목, 겹치지 않게), `previous_candidates`(직전 추천 후보 제목, 같은 후보를 다시 내지 않는다. 그 사이 큰 진전이 있으면 새 각도로만)
- `brand/brand.md`(주제 우선순위와 독자), `brand/rules.md`(우선 출처), `brand/style-guide.md` 6장(제목 틀)

## 2. 지금 상황 조사 (WebSearch, 필요하면 WebFetch)

`today` 기준으로 세부 분야마다 조사한다. 검색은 15회 안팎으로 끝낸다.

- 지난 1~2주 안에 나온 큰 소식(발표, 출시, 제도 변경, 기록, 논란)과 앞으로 1~2주 안의 일정
- 독자가 지금 많이 찾는 질문(검색어, 커뮤니티에서 반복되는 질문)
- `brand/rules.md`의 우선 출처를 먼저 확인한다.

## 3. 후보 12개 만들기

- 세부 분야별 개수는 `mix`를 따른다.
- `pillar`는 `pillars`의 `id` 중에서 고르고, 기둥이 고르게 섞이게 한다. `format`은 그 기둥의 `format`.
- 우선순위는 `brand/brand.md`의 주제 우선순위를 따른다. 그다음은 **최근 1~2주 안에 터진 큰 소식**이다. 소식이 언제 나왔는지 `why_now`에 날짜로 적고, 2주가 넘은 소식은 새 진전이 있을 때만 넣는다.
- **검색으로 오래 읽히는 정보 정리 글**(일정, 방법, 제도 설명, 비교표 등)을 12개 중 2~3개 넣는다.
- `recent_titles`와 겹치는 주제는 빼거나 새 각도로 바꾼다.
- 확인되지 않은 소문, `brand/brand.md`의 금지 항목에 걸리는 주제는 만들지 않는다.
- `title`은 `brand/style-guide.md` 6장의 제목 틀 중 하나로 쓰고, 검색어를 앞쪽에 둔다.
- `bridge`: 독자가 이미 아는 것에 빗댈 아이디어 한두 개(`brand/brand.md`의 비유 규칙).

## 4. 출력: `BATCH/topics.json`

```json
{
  "batch_id": "2026-10-05-t01",
  "generated_at": "2026-10-05T07:00:00+09:00",
  "season_phase": "지금 이 분야의 흐름을 한 줄로",
  "topics": [
    {
      "id": "t01",
      "group": "세부 분야 이름(groups 중 하나)",
      "pillar": "pillars의 id",
      "format": "해설형",
      "title": "블로그 제목안 (검색어를 앞쪽에)",
      "why_now": "지금 써야 하는 이유 한두 문장(날짜 포함)",
      "angles": ["관점 후보 1", "관점 후보 2"],
      "bridge": "독자가 아는 것에 빗댈 아이디어",
      "sources": [{"title": "출처 제목", "url": "https://..."}]
    }
  ]
}
```

`id`는 t01부터 t12까지. `sources`는 1~3개. 마지막 응답에는 만든 파일 경로만 적는다.
