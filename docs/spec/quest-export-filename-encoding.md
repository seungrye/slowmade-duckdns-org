# 퀘스트 export — Content-Disposition 파일명 인코딩 버그픽스

## 문제

`GET /api/quests/[id]/export` 에서 `Content-Disposition: attachment; filename="..."` 헤더에
한글을 포함한 `def.id` 를 그대로 넣으면 HTTP 헤더는 Latin-1(ByteString)만 허용하므로
`TypeError: Cannot convert argument to a ByteString` 오류가 발생한다.

## 수정

RFC 5987 (`filename*=UTF-8''<percent-encoded>`) 형식으로 파일명을 인코딩한다.

```ts
const encodedFilename = encodeURIComponent(`${def.id}.ron`);
headers: {
  "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
}
```

ASCII 전용 fallback(`filename=`) 은 현대 브라우저에서 불필요하므로 생략한다.

## 검증

- `def.id` 에 한글이 포함된 경우에도 500 없이 파일이 다운로드된다.
- 다운로드된 파일명이 `<id>.ron` 형태로 올바르게 보인다.
