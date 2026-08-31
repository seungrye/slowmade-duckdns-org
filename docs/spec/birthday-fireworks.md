## 생일 폭죽 (#326)

프로필에 생일을 등록해 두면, **생일 당일 로그인 상태로 접속했을 때 화면 전체에 폭죽**이 터진다.

## 규칙

- 생일은 **연도 포함 전체 날짜**로 저장한다(`User.birthday: Date`).
- 폭죽은 **그날 첫 접속 1회**만 터진다. 이후 페이지 이동에는 뜨지 않는다.
- 판정 기준 시간대는 **KST** — 사용자 기기 시간대와 무관하게 한국 날짜로 본다.
- 2월 29일생은 **평년에 3월 1일** 축하한다.

## 구글 로그인에서 생일을 못 가져오는 이유

구글 로그인은 기본 범위(`openid email profile`)로만 돌고, 그 id_token 에는 생일이 없다.
받으려면 People API 와 `user.birthday.read` 를 붙여야 하는데:

- 민감 범위라 **구글 앱 검증**이 필요하다(안 하면 테스트 모드 100명 제한 + 경고 화면).
- access token 저장·갱신을 되살려야 한다 — #228 에서 `drive.file` 과 함께 이미 걷어낸 것이다.
- 구글 프로필 생일은 **연도가 비공개인 경우가 흔하고**, 아예 안 채운 사용자도 많다.

적중률이 낮은데 비용이 커서, 수동 입력을 기본 경로로 둔다. 나중에 "구글에서 가져오기"를
옵션으로 얹더라도 저장 필드·입력 UI·폴백은 그대로 필요하므로 이 구현이 토대가 된다.

## 시간대 — 하루 밀리는 함정

date-only 값을 로컬 시각으로 만들면 KST 사용자가 넣은 `1990-03-15` 가 UTC 로
`1990-03-14T15:00Z` 가 되어 **월·일이 하루 밀린다**. 그래서

- 저장은 `Date.UTC(y, m-1, d)` 로 UTC 자정,
- 판정은 `getUTCMonth()`·`getUTCDate()` 로

읽고 쓰는 쪽을 UTC 로 통일한다. "오늘"만 `Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul'})`
로 KST 에서 뽑는다.

## 구성

| 갈래 | 파일 |
|---|---|
| 모델 | `models/user.tsx` — `birthday: Date` (optional) |
| 순수 로직 | `lib/birthday.ts` — 파싱·포맷·KST 오늘·윤년·1회 판정 |
| API | `api/user/profile/route.tsx` — `PUT` 추가, `GET` 에 `birthday` 포함 |
| 입력 UI | `dashboard/profile/my-profile.section.tsx` — `<input type="date">` + 저장 |
| 효과 | `components/birthday-fireworks.tsx` — canvas 파티클 전체화면 오버레이 |

**새 npm 의존성을 넣지 않는다** — 폭죽은 canvas 로 직접 그린다. **새 API 라우트도 만들지
않는다** — 같은 정보를 주는 경로가 둘이 되면 나중에 한쪽만 고치게 된다.

## 하루 1회를 어떻게 지키나

localStorage 표식 두 개로 나눈다. 하나로 합치면 "오늘 확인했다"와 "올해 축하했다"를 구분 못 해,
생일이 아닌 날에도 매번 조회하거나 같은 해에 두 번 터진다.

- `birthday-checked` = 마지막으로 조회한 KST 날짜 → **네트워크를 하루 1회로 제한**
- `birthday-celebrated` = 마지막으로 축하한 KST 연도 → **같은 해 중복 방지**

생일을 저장하면 두 표식을 모두 지운다 — 오늘이 생일인데 방금 등록한 경우 바로 터지도록.

## 접근성

- 오버레이는 `pointer-events: none` — 클릭·스크롤을 막지 않는다.
- `prefers-reduced-motion: reduce` 면 애니메이션 대신 정적 축하 배너를 보여준다.
