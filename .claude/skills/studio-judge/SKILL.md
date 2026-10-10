---
name: studio-judge
description: 같은 주제로 두 방식이 만든 결과물(X, Y)을 누가 만들었는지 모르는 상태로 비교 채점해 judge.json으로 남긴다. 비교 실험(scripts/compare.js) 전용. 인자로 채점 폴더 경로(data-compare/<실험>/judge)를 받는다.
argument-hint: data-compare/<실험>/judge
disable-model-invocation: true
allowed-tools: Read Write Glob WebFetch
---

# 두 결과물 눈가림 채점

인자: `$ARGUMENTS`. 이하 JUDGE.

## 읽기

- `JUDGE/X/`와 `JUDGE/Y/`: 각각 `draft.md`, `brief.json`, `checks.json`, `social.json`, `topic.json`. 어느 쪽이 어떤 방식으로 만들었는지는 알려 주지 않는다. 추측하지 말고 결과물만 본다.
- `brand/style-guide.md`, `brand/brand.md`, `brand/rules.md`, `brand/channels.md` — 채점 기준이 되는 규칙.

## 채점

항목마다 1~10점. 반드시 X와 Y를 같은 기준으로 본다.

| 항목 | 보는 것 |
|---|---|
| `grounding` 사실 근거 | 초안의 수치·사실이 brief.json에 출처와 함께 있는가. 출처가 두 곳인 비율. 근거 없는 단정이 있는가 |
| `accuracy` 출처 확인 | 각 결과물에서 핵심 수치 3개를 골라 brief.json의 출처 페이지를 열어(WebFetch) 실제로 그렇게 적혀 있는지 확인한다. 맞은 개수로 점수 |
| `reader` 독자 이해 | `brand/brand.md`의 독자가 읽고 바로 이해하는가. 비유가 닮은 점과 다른 점을 함께 말하는가 |
| `style` 문체 규칙 | `brand/style-guide.md`의 말투, 줄 길이, 연결어 범위, 금지 부호, AI 말투 금지를 지켰는가 |
| `structure` 구성 | 도입(장면·전제), 소제목 흐름, 마무리. 질문에 답했는가 |
| `social` SNS | `brand/channels.md`의 카드 장수·글자 수·타래 5개·450자 규칙을 지켰고, 블로그 내용과 맞는가 |

## 출력: `JUDGE/judge.json`

```json
{
  "scores": {
    "X": {"grounding": 8, "accuracy": 7, "reader": 8, "style": 7, "structure": 8, "social": 8},
    "Y": {"grounding": 7, "accuracy": 7, "reader": 8, "style": 8, "structure": 7, "social": 8}
  },
  "accuracy_checks": [
    {"side": "X", "claim": "확인한 수치·사실", "url": "https://...", "result": "맞음 | 다름 | 페이지에서 찾지 못함", "note": ""}
  ],
  "winner": "X | Y | 비슷함",
  "reasons": ["승패를 가른 이유 2~4개, 구체적인 문장이나 수치를 짚어서"],
  "notes": {"X": "강점과 약점 한두 문장", "Y": "강점과 약점 한두 문장"}
}
```

마지막 응답에는 만든 파일 경로만 적는다.
