# content-studio

카테고리(분야)를 한 번 정하면 그 분야의 블로그·인스타그램·쓰레드 콘텐츠를 만드는 로컬 자동화 도구다. `server.js`가 화면을 띄우고, 단계마다 `claude -p "/스킬 경로"`로 `.claude/skills/`의 스킬을 실행한다.

흐름: 처음 설정(`studio-setup`: 고정한 카테고리로 `brand/` 규칙 파일 생성) → 주제(`studio-topics`) → 리서치(`studio-research`, 결과는 `data/research/`에 쌓임) → 초안(`studio-draft`, 조사 없음) → 수정(`studio-revise`) → SNS(`studio-social`) → 뉴스레터(`studio-newsletter`). 메일로 받은 주제는 `studio-intake`가 먼저 정리한다. `studio-onepass`는 리서치·초안·SNS를 한 번에 하는 비교 실험용 방식이다.

## 헤드리스 실행에서 반드시 지킬 것

0. `brand/feedback.md`(사용자가 화면에서 남긴 의견)를 가장 먼저 읽고, 다른 모든 규칙보다 우선한다.
1. 글을 쓰기 전에 `brand/style-guide.md`, `brand/brand.md`, `brand/rules.md`를 읽는다. SNS는 `brand/channels.md`도 읽는다. 문체 참조는 `brand/corpus/`(사용자가 넣은 샘플)만 쓴다.
2. 출처 없는 수치나 사실은 쓰지 않는다. 모든 수치는 `brief.json`의 출처와 연결한다.
3. 금지 출처와 금지 표현은 `brand/rules.md`와 `brand/brand.md`를 따른다.
4. 결과는 스킬이 지정한 경로와 형식의 파일에만 쓴다. 다른 파일을 만들거나 고치지 않는다. JSON은 유효한 JSON으로 쓴다.
5. 글쓴이의 개인 경험은 지어내지 않는다. 실명·직장은 쓰지 않는다.
6. 작업이 끝나면 마지막 응답에 만든 파일 목록만 짧게 적는다.

## 개발 메모

- 외부 npm 패키지 없이 Node.js 내장 모듈만 쓴다.
- 데이터는 `data/`(Git 제외)에 파일로 저장한다. 카테고리 설정은 `data/profile.json`, 그로 만든 규칙은 `brand/`(Git 제외).
- `STUDIO_MOCK=1`이면 `claude`를 부르지 않고 가짜 결과로 화면 흐름을 시험한다(`data-mock/`).
- `node scripts/compare.js "주제"`는 같은 주제를 나눈 방식과 한 번에 쓰기로 각각 만들어 비교한다(`data-compare/`).
