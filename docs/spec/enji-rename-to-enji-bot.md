# @enji → @enji-bot 리네임

## 목표

멘션 이름을 `@enji` → `@enji-bot` 으로 변경하고, 기존 DB 레코드도 갱신한다.

## 변경 범위

### 코드

| 파일 | 변경 내용 |
|------|-----------|
| `src/app/api/enji/route.ts` | `author: 'enji'` → `'enji-bot'`, SYSTEM_PROMPT 내 이름, `/@enji/gi` 정규식 |
| `src/hooks/use-comments.ts` | `/@enji/i` 정규식 |
| `src/app/post/view/[[...id]]/comments.section.tsx` | `'enji'` 멘션 이름 |
| `src/components/comment-input.tsx` | `name === 'enji'` 비교 |
| `src/components/comment-item.tsx` | `aria-label`, placeholder 텍스트 (표시용, 기능 무관) |

### API URL / DB 스키마

- `/api/enji` 라우트 경로 **유지** (변경 불필요)
- `isEnji: Boolean` 필드 **유지** (변경 불필요)
- Comment.author 필드: `'enji'` → `'enji-bot'` (DB 마이그레이션 필요)

### DB 마이그레이션

```js
db.comments.updateMany({ author: 'enji' }, { $set: { author: 'enji-bot' } })
```

MongoDB shell 또는 `mongosh` 로 직접 실행.

## 테스트 파일

- `src/app/api/enji/route.test.ts` — `author: 'enji'` 기대값 → `'enji-bot'`
- `src/hooks/use-comments.test.ts` — `@enji` 문자열 → `@enji-bot`
- `src/components/comment-input.test.tsx` — `@enji` → `@enji-bot`
