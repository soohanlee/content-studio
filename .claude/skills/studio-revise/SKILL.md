---
name: studio-revise
description: 사용자의 수정 메모를 반영해 블로그 초안을 고치고 다시 점검한다. 인자로 포스트 폴더 경로(data/posts/<id>)를 받는다.
argument-hint: data/posts/<id>
disable-model-invocation: true
allowed-tools: Read Write Glob Grep WebSearch WebFetch
---

# 수정 요청 반영

인자: `$ARGUMENTS`. 이하 POST.

## 읽기

- `brand/feedback.md`: 사용자의 의견. **가장 먼저 읽고 다른 규칙보다 우선한다.**
- `POST/revision.json`의 `requests` 배열에서 **마지막 항목**의 `comment`가 이번 수정 요청이다. 이전 항목은 이미 반영된 요청이니 되돌리지 않는다.
- `POST/draft.md`, `POST/brief.json`, `POST/meta.json`, `POST/topic.json`
- `brand/style-guide.md`(3장 빈도 기준 포함), `brand/rules.md`. 문체 참고가 더 필요하면 `meta.json`의 `style_refs`에 있는 원문만 다시 읽는다.

## 하기

1. 요청을 그대로 반영한다. 스타일 가이드의 금지 부호(말줄임표 등)와 비유 규칙(닮은 점과 다른 점을 함께)을 유지한다. `topic.json`의 `outline`이 true면 사용자가 짠 흐름의 순서와 마무리를 유지한다. 글쓴이의 개인 경험은 지어내지 않는다(`notes`와 brand.md에 있는 것만). 요청이 문체 가이드와 부딪히면 사용자의 요청을 우선한다.
2. 새 사실이나 수치가 꼭 필요하면 `brand/rules.md` 순서로 짧게 조사하고 `POST/brief.json`에 항목을 덧붙인다(기존 항목은 지우지 않는다). 새로 조사한 항목은 `POST/research_additions.json`에도 같은 형식(`facts`, `numbers` 배열)으로 남긴다. 프로그램이 이것을 리서치 기록에 합친다.
3. 고친 초안을 `POST/draft.md`에 덮어쓴다. 제목이 바뀌면 `POST/meta.json`의 `titles[0]`도 바꾼다.
4. `studio-draft`의 3단계 규칙으로 `POST/checks.json`을 다시 만든다.
5. `POST/revision.json`의 마지막 항목에 `"applied_note": "무엇을 어떻게 고쳤는지 한두 문장"`을 추가해 저장한다.

마지막 응답에는 고친 파일 경로만 적는다.
