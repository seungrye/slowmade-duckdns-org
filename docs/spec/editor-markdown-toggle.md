# 에디터 UI ↔ Markdown 토글 ✅

게시글 작성 에디터에서 WYSIWYG 모드와 순수 Markdown 소스 모드를 전환할 수 있다.

## 패키지

`@tiptap/markdown` (MIT, TipTap 공식, v3 지원)

## 동작

1. 툴바 우측에 **Code / Visual** 토글 버튼 추가
2. **Visual → Code**: `editor.storage.markdown.getMarkdown()` → `<textarea>` 표시
3. **Code → Visual**: textarea 내용 → `editor.commands.setContent(md, false, { contentType: 'markdown' })` → TipTap 렌더링
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
