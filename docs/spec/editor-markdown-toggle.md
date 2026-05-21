# 에디터 UI ↔ Markdown 토글 ✅

게시글 작성 에디터에서 WYSIWYG 모드와 순수 Markdown 소스 모드를 전환할 수 있다.

## 패키지

`@tiptap/markdown` (MIT, TipTap 공식, v3 지원)

## 동작

1. 툴바 우측에 **Code / Visual** 토글 버튼 추가
2. **Visual → Code**: `editor.storage.markdown.getMarkdown()` → `<textarea>` 표시
3. **Code → Visual**: textarea 내용 → `editor.commands.setContent(md, { contentType: 'markdown' })` → TipTap 렌더링 (시그니처: `(content, options)`, `false` 인자 없음)
4. 에디터 핸들 `getContent()`: Code 모드일 때도 정확한 HTML 반환 (내부적으로 md → editor 파싱 후 getHTML)

## 커스텀 Markdown 직렬화 (수식)

`@tiptap/markdown`의 `Markdown.configure()` 에 커스텀 serializer 등록:
- `inlineMath` 노드 → `$latex$`
- `blockMath` 노드 → `$$\nlatex\n$$`

TaskList, Highlight 등 표준 GFM 노드는 `@tiptap/markdown`이 자동 처리.

## UI

- 버튼 레이블: Code 모드일 때 `Visual`, Visual 모드일 때 `Code`
- Code 모드: `<textarea>` monospace, min-height 에디터와 동일
- 모바일: 툴바 main view에만 표시 (secondary toolbar에서는 숨김)

## 변경 파일

- `webapp/src/components/rich-web-editor/editor.tsx` — Markdown 익스텐션 추가 + 토글 UI

---

## 왕복 손실 방지 — Code 모드 무변경 시 원본 복원 ✅

### 문제
Visual → Code → Visual (아무것도 안 고침) 시 content 가 바뀜.  
HTML → Markdown → HTML 변환이 손실 없는 왕복(round-trip)이 아니기 때문.

### 해결
- Visual → Code 진입 시 `editor.getJSON()` 으로 원본 상태 저장
- Code → Visual 복귀 시:
  - 마크다운 텍스트가 **변경 없음** → 저장된 JSON으로 `setContent` (원본 완전 복원)
  - 마크다운 텍스트가 **변경됨** → `setContent(md, { contentType: 'markdown' })` 으로 파싱
