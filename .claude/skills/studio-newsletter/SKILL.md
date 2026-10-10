---
name: studio-newsletter
description: 그 주에 승인된 블로그 글로 주간 뉴스레터를 newsletter.md로 만든다. 인자로 주간 폴더 경로(data/weeks/YYYY-Www)를 받는다.
argument-hint: data/weeks/YYYY-Www
disable-model-invocation: true
allowed-tools: Read Write Glob WebSearch WebFetch
---

# 주간 뉴스레터 만들기

인자: `$ARGUMENTS`. 이하 WEEK.

## 읽기

- `brand/feedback.md`: 사용자의 의견. **가장 먼저 읽고 다른 규칙보다 우선한다.**
- `WEEK/newsletter_input.json`: `week_id`, `newsletter_name`, `category`, `groups`, `characterName`, `today`, `posts`(그 주 승인된 글의 폴더 경로와 블로그 주소)
- 각 글의 `draft.md`, `meta.json`, `brief.json`
- `brand/style-guide.md`, `brand/brand.md`, `brand/rules.md`

## 구성

```
# {newsletter_name} · {week_id}

(캐릭터의 인사 2~3줄)

## 이번 주 꼭 알아야 할 것 5가지
1. … (각 2~3줄, 해당 블로그 글이 있으면 [블로그에서 더 보기](주소))

## 세부 분야 소식
(groups마다 한두 줄. 이번 주에 소식이 없는 분야는 생략)

## 다음 주에 볼 것
(일정과 눈여겨볼 점 2~3개. 일정은 웹 검색으로 확인하고 출처가 있는 것만)

## {characterName}의 한마디
(짧은 한 줄. 지어낸 개인 경험은 쓰지 않는다)
```

- 블로그 글에 있는 사실을 우선 쓰고, 새 사실은 `brand/rules.md`대로 출처를 확인한 것만 쓴다.
- 블로그 주소가 없는 글은 링크를 빼고 쓴다.
- 분량 1,500~2,500자.

출력: `WEEK/newsletter.md`. 마지막 응답에는 파일 경로만 적는다.
