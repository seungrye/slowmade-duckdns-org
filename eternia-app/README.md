# 에테르니아의 추락 — 안드로이드 앱 (eternia-app)

웹 어드벤처 〈에테르니아의 추락〉을 **「모험가 이야기」풍 픽셀 저널 플레이어**로 만드는 안드로이드 앱.
**Capacitor**로 웹 플레이어(Vite SPA)를 감싸 네이티브 앱으로 빌드한다.

> 상태(2026-07-29): **첫 마일스톤 = 파이프라인 검증**. 픽셀 저널 목업이 그대로 설치 가능한 디버그
> APK로 빌드된다(웹→Vite→Capacitor→APK). 담긴 콘텐츠는 아직 **목업**(바닐라)이며, 실제 게임 로직·
> 콘텐츠 연결과 네이티브 기능은 다음 반복.

## 이 폴더의 위치·관계

`~/site` 저장소 안의 **독립 폴더**다. 같은 저장소의 다른 것들과 혼동 주의:

| 경로 | 정체 | 관계 |
|---|---|---|
| `webapp/` | Next.js 사이트(handmade.r-e.kr) | **무관**. 블루/그린 배포 대상 ≠ 이 앱 |
| `android/` | 네이티브 Kotlin 앱 `org.slowmade.presence` | **무관**. 이 앱은 별도(`eternia-app/android/`) |
| **`eternia-app/`** | 이 Capacitor 게임 앱 | 여기 |

- **블루/그린 배포와 무관**: `eternia-app`은 webapp 빌드/`deploy.sh`에 포함되지 않는다.
- 게임 로직·타입 원본은 `webapp/src/lib/web-adventure`·`src/types/web-adventure.ts`(스탯·확률판정·
  조건부·침식도, 마크업 규약). 지금은 목업이 로직을 내장하고 있고, 향후 **순수 TS 공유 패키지**로
  분리해 웹(저작)·앱(플레이어)이 공유할 계획.

## 구조

```
eternia-app/
  index.html            # 플레이어 진입(HTML) — style.css / main.js 참조
  src/
    style.css           # 픽셀 저널 UI 스타일(목업 이식)
    main.js             # 블록 스트림 미니 엔진(para·figure·choice·roll + {{변수}})
  vite.config.js        # base:'./' (Capacitor file:// 로드용 상대경로 필수)
  capacitor.config.json # appId org.slowmade.eternia · appName "에테르니아의 추락" · webDir dist
                        # (JSON 사용 — .ts 는 typescript 의존 필요, CI 클린빌드 위해 JSON)
  dist/                 # vite 빌드 산출(webDir) — gitignore
  android/              # Capacitor 생성 안드로이드 플랫폼(이 앱 전용)
  setup-build-env.sh    # JDK17 + Android SDK 헤드리스 설치(재현용)
  .env.build            # JAVA_HOME/ANDROID_HOME/PATH (setup 이 생성) — gitignore
```

플레이어는 `~/web-adventure-vn-mock/index.html` 목업을 `index.html`+`src/style.css`+`src/main.js`로
3분할한 것(로직 동일). 자체 완결(외부 요청 0)이라 오프라인·WebView 로드에 안전.

## 요구 환경

- **Node 20+**, npm
- **JDK 17** (Capacitor 6 요구; JDK 21 아님 주의)
- **Android SDK**: `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`
- (실행용) 안드로이드 기기 또는 에뮬레이터 — 헤드리스 서버엔 없음, APK 사이드로드로 확인

### 빌드 환경 자동 설치(리눅스, 헤드리스)

이 서버에는 `setup-build-env.sh`로 JDK17 + Android SDK를 설치해 두었다(재실행 멱등):

```bash
cd ~/site/eternia-app
bash setup-build-env.sh        # JDK17(apt 또는 Temurin) + cmdline-tools + platform-34/build-tools 34
                               # 완료 후 .env.build 생성(JAVA_HOME/ANDROID_HOME/PATH)
```

이후 모든 빌드 명령 전에 환경을 로드한다:

```bash
source ~/site/eternia-app/.env.build
```

## 빌드 (디버그 APK)

```bash
cd ~/site/eternia-app
source .env.build

npm install                    # 최초 1회
npm run build                  # Vite → dist/
npx cap add android            # 최초 1회(android/ 생성). 이후엔 생략
npx cap sync android           # dist → android 로 웹자산 동기화(빌드 전마다)
echo "sdk.dir=$ANDROID_HOME" > android/local.properties   # 최초 1회
cd android && ./gradlew assembleDebug --no-daemon
```

산출물: `android/app/build/outputs/apk/debug/app-debug.apk`

설치: 안드로이드 폰에 파일 전송 → **설정 > 출처 불명 앱 설치 허용** 후 열기. 또는 기기 연결 시
`adb install -r app-debug.apk`.

### 한 줄 재빌드(코드 수정 후)

```bash
cd ~/site/eternia-app && source .env.build && npm run build && npx cap sync android && (cd android && ./gradlew assembleDebug --no-daemon)
```

## 개발 (웹 미리보기)

앱 빌드 없이 브라우저에서 플레이어만 확인:

```bash
cd ~/site/eternia-app && npm run dev     # http://localhost:5173
```

## 앱 메타

- 패키지(appId): `org.slowmade.eternia`
- 앱 이름: 에테르니아의 추락
- minSdk 22 / targetSdk 34 / compileSdk 34
- 디버그 서명: Android 기본 debug 키스토어(`~/.android/debug.keystore`, 자동). **릴리스 서명 키는 별도
  생성 필요**(Play Store 업로드 시).

## 상태 / 로드맵

- [x] **M1 파이프라인**: 목업 → Vite → Capacitor → 디버그 APK (완료)
- [ ] **M2 온디바이스 확인·튜닝**: 폰 실행 검증, 세로 고정·상태바 색·스플래시·앱 아이콘
- [ ] **M3 네이티브 기능**: 오디오(켈틱 BGM 루프)·세이브(Preferences/Filesystem)·햅틱·풀스크린 몰입
- [ ] **M4 게임 로직 공유 패키지** 분리(순수 TS) + 실제 `web-adventure` 콘텐츠 연결(목업 → 진짜 데이터)
- [ ] **M5 릴리스**: 아이콘·스플래시·릴리스 서명·Play Store

정직한 병목(엔진 아님): ① 씬을 **빠르게 저작**하는 파이프라인 ② **도트/픽셀 삽화 생산량**
(AI는 배경엔 좋지만 캐릭터 일관성 취약 → 씬당 키아트로 우회). 1챕터 완성으로 이 둘을 먼저 검증할 것.

## 트러블슈팅

- **`SDK location not found`**: `echo "sdk.dir=$ANDROID_HOME" > android/local.properties` 또는
  `source .env.build`로 `ANDROID_HOME` 노출.
- **`Unsupported class file major version` / JDK 오류**: JDK **17**인지 확인(`java -version`). 21이면
  Capacitor 6와 충돌 가능.
- **첫 gradle 빌드가 느림**: gradle 배포판·의존성 최초 다운로드(수 분). 이후 캐시됨.
- **화면이 흰색/자산 미로드**: `vite.config.js`의 `base: './'` 필수. `npx cap sync android` 재실행.
- **빌드물이 git에 잡힘**: `.gitignore`가 `dist/`·`android/build`·`*.apk`·`node_modules` 제외. 커밋 전
  `git status` 확인.
