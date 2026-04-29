# 테마 CSS 클래스 방식 통일 ✅

## 문제
`_variables.scss`에는 `.dark` 클래스 기반 CSS 변수가 정의되어 있지만,
`globals.css`의 `--background`/`--foreground`는 `@media (prefers-color-scheme: dark)` 기반이고,
Tailwind v4 `dark:` 유틸리티도 기본적으로 미디어쿼리 기반이다.

결과: ThemeSync가 `<html class="dark">`를 설정해도 `dark:bg-gray-800` 등이 반응하지 않음.

## 변경 파일

- `webapp/src/app/globals.css`
  - `@custom-variant dark (&:where(.dark, .dark *));` 추가 → `dark:` 유틸리티가 `.dark` 클래스에 반응
  - `@media (prefers-color-scheme: dark)` 블록 제거
  - `.dark { --background: ...; --foreground: ...; }` 추가

## 동작 방식

```
system 테마 : ThemeSync가 prefers-color-scheme 감시 → .dark 클래스 토글
dark 테마   : SSR <html class="dark"> + 로그인 시 ThemeSync가 .dark 추가
light 테마  : SSR <html class=""> + 로그인 시 ThemeSync가 .dark 제거

.dark 클래스 있을 때:
  - dark: 유틸리티 활성 (Tailwind v4 @custom-variant)
  - _variables.scss .dark 변수 활성 (기존)
  - globals.css --background/--foreground 다크 값 활성 (수정)
```
