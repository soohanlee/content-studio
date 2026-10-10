---
name: studio-onepass
description: 주제 하나를 한 번의 실행으로 조사하고 블로그 초안·메타·점검·인스타·쓰레드까지 만든다(단계를 나눈 방식과 비교하기 위한 진행 방식). 인자로 포스트 폴더 경로(data/posts/<id>)를 받는다.
argument-hint: data/posts/<id>
disable-model-invocation: true
allowed-tools: Read Write Glob Grep WebSearch WebFetch
---

# 한 번에 쓰기 (리서치 → 초안 → SNS)

인자: `$ARGUMENTS` (예: `data/posts/2026-10-05-01`). 이하 POST.

단계를 나눈 방식(studio-research → studio-draft → studio-social)과 **같은 규칙, 같은 결과 파일**로 만든다. 다른 점은 한 번의 실행 안에서 이어서 한다는 것뿐이다. 그래서 각 단계의 규칙은 아래 스킬 문서를 그대로 따른다.

## 0. 읽기

1. `brand/feedback.md`: 사용자의 의견. **가장 먼저 읽고 다른 규칙보다 우선한다.**
2. `.claude/skills/studio-research/SKILL.md`, `.claude/skills/studio-draft/SKILL.md`, `.claude/skills/studio-social/SKILL.md` — 세 단계의 규칙. 경로 이름만 아래처럼 바꿔 읽는다.
   - studio-research의 `RES/request.json` → `POST/topic.json`(같은 필드를 담고 있다. `mode`는 항상 `new`)
   - studio-research의 `RES/brief.json` → `POST/brief.json`
3. 위 스킬들이 읽으라고 한 `brand/` 파일들.

## 1. 순서

1. **리서치**: studio-research의 1-A 규칙대로 조사해 `POST/brief.json`을 쓴다.
2. **초안**: studio-draft의 규칙대로 `POST/draft.md`, `POST/meta.json`, `POST/checks.json`을 쓴다. 이 단계부터는 웹 검색을 하지 않고 `brief.json`에 적은 것만 근거로 쓴다(조사하다 본 내용이라도 brief.json에 없으면 쓰지 않는다).
3. **SNS**: studio-social의 규칙대로 `POST/social.json`을 쓴다.

마지막 응답에는 만든 파일 경로만 적는다.
