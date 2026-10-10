# 콘텐츠 스튜디오 설계

분야(카테고리)를 한 번 정하면 그 분야의 블로그·인스타그램·쓰레드 콘텐츠를 만드는 **한 사람용 로컬 도구**다. 외부 npm 패키지 없이 Node.js 내장 모듈만 쓰고, AI 작업은 Anthropic API가 아니라 **Claude Code 헤드리스 실행(`claude -p`)을 사용자의 Claude 구독으로** 돌린다.

## 1. 전체 구조

```
┌──────────────────────────────────────────────────────────────────────┐
│ 실행층   아이콘(콘텐츠 스튜디오.app / 바탕화면 바로가기) → launch 스크립트 │
└───────────────┬──────────────────────────────────────────────────────┘
                │ ① 서버가 없으면 node server.js 를 숨겨서 켠다
                │ ② 엣지/크롬을 --app=http://localhost:4600 로 연다
┌───────────────▼───────────────┐        ┌────────────────────────────┐
│ 서버층  server.js              │◀──────▶│ 화면층  public/ (앱 창)      │
│  HTTP API + 정적 파일          │  JSON  │  처음 설정·홈·주제·검수·발행 │
│  127.0.0.1 에서만 열림         │  3초    │  ·뉴스레터·리서치 기록·피드백 │
└───────────────┬───────────────┘  폴링   └────────────────────────────┘
                │ enqueue
┌───────────────▼───────────────┐
│ 작업층  lib/jobs.js            │  한 번에 하나씩 처리하는 큐(data/jobs.json)
│  setup·topics·research·draft  │  재시작해도 대기 작업을 이어서 처리
│  ·onepass·revise·social·cards │
└──────┬─────────────┬──────────┘
       │             │
┌──────▼──────┐ ┌────▼──────────────────────────────┐
│ AI층         │ │ 코드층 (사용량 없음)                 │
│ lib/claude.js│ │ cards.js  카드·도표 PNG(헤드리스 브라우저) │
│ claude -p    │ │ photos.js 위키미디어 사진·직접 찍은 사진  │
│ "/스킬 경로"  │ │ codeChecks 말줄임표 등 규칙 점검        │
└──────┬──────┘ └────┬──────────────────────────────┘
       │ 읽기          │ 쓰기
┌──────▼──────────────▼─────────────────────────────────────────────┐
│ 규칙층  CLAUDE.md, brand/ (처음 설정에서 분야에 맞게 생성)              │
│         .claude/skills/ (스킬 10개)                                  │
│ 저장층  data/ (profile·topics·research·posts·jobs·logs·feedback)      │
└──────────────────────────────────────────────────────────────────┘
```

핵심 원칙:

- **분야는 규칙 파일로만 들어간다.** 코드와 스킬에는 특정 분야 이야기가 없다. 분야에 따라 달라지는 것(출처, 금지 표현, 문체, 채널 형식, 콘텐츠 기둥)은 처음 설정에서 `studio-setup`이 `brand/`에 쓰고, 다른 스킬은 그 파일을 읽는다.
- **AI는 판단과 글쓰기만, 나머지는 코드가.** 작업 순서, 파일 검증, 이미지 생성, 규칙 점검은 코드가 결정적으로 처리한다.
- **AI와 코드는 파일로 대화한다.** 서버가 입력 파일(`topic.json` 등)을 쓰고, 스킬이 정해진 출력 파일(`brief.json`, `draft.md` 등)을 쓰면, 서버가 그 파일이 있는지·JSON이 올바른지 확인하고 다음 단계로 넘긴다.
- **쓰는 쪽은 언제나 하나.** 여러 단계가 있어도 한 번에 한 작업만 돌고, 한 결과 파일은 한 단계만 쓴다.
- **모든 결과는 로컬 파일.** DB, 로그인, 클라우드가 없다. 폴더를 통째로 복사하면 백업이 된다.

## 2. 분야 고정과 맞춤 규칙 (lib/profile.js, studio-setup)

- 처음 설정 화면에서 분야, 세부 분야(2~4개), 독자, 내 관점, 말투, 문체 샘플(선택)을 받아 `data/profile.json`에 쓰고 `lockedAt`을 남긴다. 이후 이 값은 API로 바꿀 수 없다(카드 색만 예외).
- 고정과 동시에 `setup` 작업이 `studio-setup`을 실행한다. 웹 검색으로 그 분야의 믿을 만한 출처·저작권·위험 표현·잘되는 제목 틀을 확인하고 아래 파일을 만든다.

| 파일 | 내용 | 읽는 스킬 |
|---|---|---|
| `brand/pillars.json` | 콘텐츠 기둥 4~6개(id, 이름, 형식, 분량) | 주제·초안, 화면 |
| `brand/brand.md` | 포지셔닝, 화자, 세부 분야, 독자, 비유 규칙, 금지 | 전부 |
| `brand/style-guide.md` | 문체(1~8장: 화자, 줄바꿈, 연결어 기준, 숫자, 뼈대, 제목 틀, 분량, AI 말투 금지) | 초안·수정·SNS |
| `brand/channels.md` | 인스타 카드 kind별 글자 수, 시리즈, 쓰레드 형식 | SNS |
| `brand/rules.md` | 리서치 순서, 우선 출처, 미디어 저작권, 금지 | 주제·리서치·초안 |
| `brand/feedback.md` | 화면에서 남긴 의견(프로그램이 생성, 최우선) | 전부 |
| `brand/corpus/` | 문체 샘플(선택)과 index.json | 초안 |

- `profile.isReady()`가 참(고정 + setup 완료 + 파일 5개)이어야 주제·글쓰기 API가 열린다.
- 주제 후보 12개는 세부 분야에 고르게 나눈다(`profile.topicMix`).

## 3. 데이터 모델 (data/)

```
data/
├─ profile.json            분야 설정(고정), 카드 색, setup 상태
├─ settings.json           캐릭터 이름, 인스타 계정, 뉴스레터 주소(바꿀 수 있음)
├─ setup/input.json        studio-setup 입력
├─ topics/<2026-10-10-t01>/  주제 추천 묶음: context.json(입력), topics.json(후보 12개), used.json
├─ research/<2026-10-10-r01>/ 리서치 기록(글과 분리, 재사용·추가 조사 가능)
│   ├─ request.json         주제, 내 관점(take), 메모(notes), mode(new|extend), focus
│   ├─ brief.json           조사 결과: 사실·수치(출처·확인 상태)·비유 후보(analogies)·미디어·조사 이력(rounds)
│   └─ research.json        상태(queued|researching|ready|failed), 이 기록으로 쓴 글 목록
├─ posts/<2026-10-10-01>/
│   ├─ topic.json           주제 + group·pillar + research_id + research_mode(researched|reuse|notes|onepass)
│   ├─ post.json            상태, 표지 사진, 카드·도표 파일 목록, 블로그 주소
│   ├─ brief.json, draft.md, meta.json, checks.json, social.json, revision.json
│   ├─ photos/, cards/, charts/
├─ weeks/<2026-W41>/        뉴스레터 입력과 결과
├─ inbox/                  메일로 받은 주제(선택 기능)
├─ jobs.json, logs/<작업ID>.json, feedback.json
```

## 4. 흐름과 상태

| mode | 작업 체인 | 쓰는 곳 |
|---|---|---|
| `full` | research → draft → social → cards | 기본값 |
| `research` | research만 | "리서치만 하고 저장" |
| `notes` | (메모를 리서치 기록에 저장) → draft → social → cards | "조사 없이 내 메모로 쓰기" |
| `onepass` | onepass(리서치·초안·SNS를 claude 한 번에) → cards | "한 번에 쓰기 (빠름)": 개념 설명·가벼운 글용. 비교 실험 |
| reuse | draft → social → cards | 리서치 기록의 "이 기록으로 글쓰기" |
| extend | research(추가 조사, 기존 항목 유지) | 리서치 기록의 "더 조사하기" |

글 상태: `queued → researching → writing → writing_social → review ──승인──▶ approved ──▶ published` (수정 요청 시 `revising`, 실패 시 `failed` + `failedJob`에서 다시 시도).

## 5. AI 실행 (lib/claude.js + 스킬)

```
claude -p "/studio-research data/research/2026-10-10-r01"
       --output-format json --permission-mode acceptEdits --no-session-persistence
       --model claude-sonnet-5-5 --allowedTools Read,Write,Edit,Glob,Grep,WebSearch,WebFetch
```

- **구독으로 실행**: 자식 프로세스 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`을 지운다.
- **인자는 ASCII 경로만**: 한국어 입력은 파일로 넘겨 Windows 셸 따옴표 문제를 피한다.
- **모델**: `config.models[스킬]` > `config.model` > Claude Code 기본값.
- **제한 시간**: 작업당 25분(`jobTimeoutMinutes`).
- **기록**: 결과 JSON의 `usage`에서 토큰·턴·환산 금액을 `data/logs/`와 작업에 남긴다.

| 스킬 | 입력 | 출력 | 웹 검색 |
|---|---|---|---|
| `studio-setup` | setup/input.json (+ 문체 샘플) | brand/ 규칙 파일 5개 | 함 |
| `studio-topics` | topics/T/context.json | topics.json | 함 |
| `studio-research` | research/R/request.json (+ 기존 brief) | brief.json | 함 |
| `studio-draft` | posts/P/topic.json, brief.json | draft.md, meta.json, checks.json | **안 함** |
| `studio-revise` | revision.json 마지막 요청 | draft.md, checks.json (+ research_additions.json) | 필요할 때만 |
| `studio-social` | draft.md, brief.json | social.json | 안 함 |
| `studio-onepass` | posts/P/topic.json | brief.json + 초안 3종 + social.json | 리서치 부분만 |
| `studio-newsletter` | newsletter_input.json | newsletter.md | 일정 확인만 |
| `studio-intake` | inbox/M/email.json | intake.json | 안 함 |
| `studio-judge` | data-compare/X/judge/X,Y | judge.json | 출처 확인만 |

**규칙 우선순위**: `brand/feedback.md` > `brand/style-guide.md`·`channels.md`·`rules.md`·`brand.md` > `brand/corpus/` > 각 SKILL.md·`CLAUDE.md`.

**AI를 믿지 않고 코드로 확인하는 것**: 결과 파일 존재·JSON 형식, 말줄임표(설정에서 켰을 때), 위키미디어 사진의 라이선스(CC·퍼블릭 도메인만 받음).

## 6. 이미지와 색

| 종류 | 만드는 곳 | 방법 |
|---|---|---|
| 인스타 카드 | `cards.js` | social.json 슬라이드 → HTML 템플릿 → 헤드리스 크롬/엣지로 PNG. 표지·비유(compare)·마지막 장은 진한 브랜드 바탕, 나머지는 밝은 바탕 |
| 블로그 도표 | `cards.js` | brief.json의 `chart.data`(출처 있는 수치) → 막대 도표 PNG |
| 사진 | `photos.js` | 커먼즈 파일 주소 → 커먼즈 API로 라이선스·저작자 확인 → 내려받기. 또는 직접 올린 사진 |

카드 색은 `data/profile.json`의 `colors`(primary: 진한 바탕, accent: 강조)이고 설정 화면에서 바꾼다. 기본값은 남색 `#191D28` + 주황 `#FF6A2B`. 화면 색은 `public/style.css`의 `:root` 변수.

## 7. 비교 실험 (scripts/compare.js)

같은 주제를 `full`과 `onepass`로 만들고 `studio-judge`가 눈가림으로 채점한다. 실험마다 `data-compare/<id>/`를 `STUDIO_DATA`로 써서 실제 `data/`와 섞이지 않게 한다. 결과: `report.json`, `report.md`.

## 8. 실행·예약·플랫폼

| | Mac | Windows |
|---|---|---|
| 아이콘 | `콘텐츠 스튜디오.app` (`scripts/make-mac-app.sh`로 생성) | 바탕화면 바로가기 (`install.bat`이 생성) |
| 켜기·끄기 | `scripts/launch.sh` · `stop.command` | `scripts/launch.ps1` · `stop.bat` |
| 앱 창 | 크롬 `--app` | 엣지 `--app` (없으면 크롬) |
| 카드 촬영 | 크롬 헤드리스 | 엣지 헤드리스 |
| 주간 예약 | launchd (`schedule-weekly.sh`) | 작업 스케줄러 (`schedule-weekly.ps1`) |
| 설치 확인 | `setup-mac.sh` | `setup-windows.ps1` |

## 9. 보안과 한계

- 서버는 `127.0.0.1`에만 열린다. 같은 컴퓨터 밖에서는 접속할 수 없어 로그인이 없다.
- 경로에 쓰이는 ID와 파일 이름은 정규식으로 검사한다(경로 조작 방지).
- 메일 본문은 글감으로만 읽는다(`studio-intake`는 읽기·쓰기 도구만, 본문 속 지시는 따르지 않는다).
- 블로그 발행은 복사·붙여 넣기다. 남은 구독 사용량을 프로그램에서 조회하는 공식 방법이 없다.

## 10. 확장 지점

| 하고 싶은 것 | 고칠 곳 |
|---|---|
| 분야 예시 추가 | `lib/presets.js` |
| 새 단계 추가(예: 쇼츠 영상) | 스킬 추가 → `jobs.js`에 처리기와 체인 연결 → 화면에 표시 |
| 단계별 모델 바꾸기 | `config.json`의 `models` (예: `{"studio-research": "claude-opus-5-5"}`) |
| 다른 분야도 쓰기 | 폴더를 통째로 복사하고 `config.json`의 `port`를 바꿔 따로 설정 |
