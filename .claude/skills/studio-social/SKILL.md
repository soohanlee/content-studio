---
name: studio-social
description: 블로그 초안으로 인스타그램 캐러셀 문구·캡션·해시태그와 쓰레드 타래·단독 글을 social.json으로 만든다. 인자로 포스트 폴더 경로(data/posts/<id>)를 받는다.
argument-hint: data/posts/<id>
disable-model-invocation: true
allowed-tools: Read Write Glob
---

# 인스타그램·쓰레드 콘텐츠 만들기

인자: `$ARGUMENTS`. 이하 POST. 웹 검색은 하지 않는다. 블로그 초안과 브리프에 있는 내용만 쓴다.

## 읽기

- `brand/feedback.md`: 사용자의 의견. **가장 먼저 읽고 다른 규칙보다 우선한다.**
- `POST/draft.md`, `POST/meta.json`, `POST/brief.json`, `POST/topic.json`(`characterName`, `pillar`, `format`)
- `brand/channels.md` (가장 중요), `brand/style-guide.md`, `brand/brand.md`

## 규칙

- 블로그에 없는 수치·사실은 새로 넣지 않는다.
- **글쓴이의 개인 경험은 지어내지 않는다.** 1인칭 경험·일화는 블로그 초안, `topic.json`의 `notes`나 `brand/brand.md`의 화자 설정에 있는 것만 쓴다.
- `brand/channels.md`가 말줄임표를 금지하면 카드, 캡션, 쓰레드 어디에도 쓰지 않는다.
- 인스타그램 캐러셀 8~10장. `brand/channels.md`의 kind와 글자 수 제한을 지킨다. 첫 장은 `cover`, 마지막 장은 `outro`, 그 앞은 `summary`. 초안에 비유가 있으면 `compare` 카드를 1장 넣고, `compare_label`은 `brand/channels.md`에 정한 라벨로 한다. 수치가 핵심이면 `stat`을 1~2장 쓴다.
- `series`는 `brand/channels.md`의 시리즈 이름 중 글에 맞는 것.
- `outro`에는 캐릭터 이름(`characterName`)과 "저장해 두세요"를 넣는다.
- 쓰레드 타래 정확히 5개, 각 450자 이내. 5번째 글 끝에 `{{BLOG_URL}}`을 그대로 둔다.
- 쓰레드 단독 글 2~3개. `brand/channels.md`의 format 중 글에 맞는 것을 고른다.
- 쇼츠 대본: 45초 분량(약 220자), 캐릭터가 말하는 1인칭.

## 출력: `POST/social.json`

```json
{
  "instagram": {
    "series": "시리즈 이름",
    "compare_label": "쉽게 말하면",
    "slides": [
      {"kind": "cover", "title": "큰 질문이나 숫자", "body": "부제"},
      {"kind": "point", "title": "한 메시지", "body": "설명"},
      {"kind": "stat", "title": "42%", "body": "숫자의 뜻 한 줄"},
      {"kind": "compare", "title": "아는 것에 빗대면", "body": "비유와 다른 점"},
      {"kind": "summary", "title": "세 줄 요약", "body": "첫째 줄\n둘째 줄\n셋째 줄"},
      {"kind": "outro", "title": "캐릭터 한마디", "body": "저장해 두세요. 팔로우 안내"}
    ],
    "caption": "첫 줄 훅\n\n핵심 세 줄\n\n질문 하나",
    "hashtags": ["태그1", "태그2"]
  },
  "threads": {
    "thread": ["1/5 …", "2/5 …", "3/5 …", "4/5 …", "5/5 … {{BLOG_URL}}"],
    "singles": [{"format": "question", "text": "…"}]
  },
  "shorts_script": "…"
}
```

마지막 응답에는 만든 파일 경로만 적는다.
