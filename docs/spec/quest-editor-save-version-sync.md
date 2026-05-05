# ✅ 퀘스트 에디터 — 저장 후 버전 번호 동기화

## 문제

저장 시 서버 PUT API는 `quest.version + 1`로 올리고 응답으로 갱신된 quest를 반환하지만,
클라이언트 `save()` 함수가 응답을 무시해 UI의 버전 번호가 갱신되지 않는다.

## 변경

`page.tsx`의 `save()` 함수에서 PUT 응답의 `data`를 읽어 `setQuest`로 업데이트한다.
