# #4 작성/보기 화면 전체 높이 채우기

## 문제

작성·보기 페이지의 에디터/콘텐츠 영역이 `min-h-[480px]` 고정값으로 지정되어 있어 큰 화면에서 빈 여백이 남음.

## 분석

| 관점 | 내용 |
|------|------|
| 사용자 | 에디터가 화면을 채우면 더 넓고 몰입감 있는 글쓰기 경험 제공. 짧은 글 보기 시에도 여백 없이 일관된 레이아웃 |
| 개발자 | `min-h-screen` 단순 추가는 Navbar/Footer 높이를 무시함. `calc(100vh - Npx)` 방식은 navbar 높이를 하드코딩해야 해서 취약 |
| 데스크톱 | Navbar(~56px) + Footer(~100px) 제외 나머지를 에디터가 채워야 함 |
| 모바일 | `100vh`는 iOS Safari에서 주소창 포함 계산 → 스크롤 발생. `100dvh` 사용으로 해결 |
| 관리자 | 관리 기능 미구현으로 직접 영향 없음 |

## 결정: flex 체인 방식

```
<body>          flex flex-col min-h-dvh
  <Navbar />    고정 높이
  <main>        flex-1 flex flex-col
    <Page>      flex-1 flex flex-col
      <Form>    flex-1 flex flex-col   (작성 페이지)
        editor  flex-1 min-h-[240px]  ← 나머지 공간 채움
  <Footer />    고정 높이
```

Navbar/Footer 높이를 하드코딩하지 않고, flex 자동 계산에 맡김.

## 주요 버그: flex 컨텍스트의 mx-auto

`main`이 `flex flex-col`이 되면서 하위 페이지 래퍼의 `mx-auto`가 실제 auto 마진으로 동작 (블록 레이아웃에서는 max-width 없이 `mx-auto`가 무효였지만, flex에서는 남은 공간을 좌우에 균등 분배).

**해결:** 모든 페이지 래퍼에서 `mx-auto` 제거. root layout의 `lg:container mx-auto`가 이미 중앙 정렬을 담당하므로 개별 페이지에서 중복 불필요.

영향 파일: `home`, `tags`, `tags/[tag]`, `dashboard/profile`, `dashboard/posts`, `dashboard/settings`

## 변경 요약

- `src/app/layout.tsx` — body, main에 flex 체인 추가
- `src/app/post/write/.../page.tsx` — `flex-1 flex flex-col`
- `src/app/post/write/.../writer-form.section.tsx` — Fragment → `flex flex-col flex-1` div, 에디터 `min-h-[480px]` → `flex-1 min-h-[240px]`
- `src/app/post/view/.../page.tsx` — `flex-1 flex flex-col`, 콘텐츠 박스 `flex-1 min-h-[240px]`
- 전체 페이지 래퍼 `mx-auto` 제거 (8곳)
