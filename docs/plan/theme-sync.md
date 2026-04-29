# 테마 동기화 구현 ✅

## 목표
설정 페이지에서 저장한 테마(light/dark/system)를 로그인 시 자동 적용하고, FOUC 없이 초기 렌더링한다.

## 변경 파일

- `webapp/src/app/api/user/settings/route.tsx` — PUT 응답에 `Set-Cookie: theme=...` 추가
- `webapp/src/app/layout.tsx` — async 서버 컴포넌트로 변경, cookie 읽어 `<html className>` 설정
- `webapp/src/components/dark-class-sync.tsx` — `ThemeSync` 컴포넌트로 확장:
  - `system`: `prefers-color-scheme` 감시
  - `light`/`dark`: 직접 클래스 제어
  - 로그인 시(`status === 'authenticated'`) DB 조회 → cookie + DOM 갱신
- `webapp/src/components/dark-class-sync.test.tsx` — 새 동작에 맞게 테스트 업데이트

## 구현 방식

```
PUT /api/user/settings
  └─ Set-Cookie: theme=dark; Max-Age=31536000; Path=/; SameSite=Lax

layout.tsx (async server component)
  └─ cookies().get('theme') → <html className="dark"> or ""
  └─ system 테마용 인라인 <script> → prefers-color-scheme 즉시 적용 (FOUC 방지)

ThemeSync({ initialTheme })
  └─ useEffect: system일 때 prefers-color-scheme 변경 감시
  └─ useEffect: status === 'authenticated' → fetch /api/user/settings → cookie + classList 갱신
```
