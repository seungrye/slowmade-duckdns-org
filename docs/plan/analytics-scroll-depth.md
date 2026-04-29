---
title: Analytics scroll_depth 이벤트 추가
status: ✅ done
---

## 목적

포스트를 얼마나 읽었는지 측정. Firebase Analytics Events 탭에 `scroll_depth` 이벤트로 쌓임.

## 변경 내용

### `src/components/post-scroll-depth.tsx` (신규)
- 스크롤 위치를 감지해 25%, 50%, 75%, 100% 구간마다 `scroll_depth` 이벤트 전송
- 각 구간은 페이지당 한 번만 발생
- 파라미터: `percent_scrolled`, `post_id`, `post_title`

### `src/app/post/view/[[...id]]/post-view-container.tsx`
- `<PostScrollDepth>` 컴포넌트 추가
