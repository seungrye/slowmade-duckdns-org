# 컨셉 + 비전

## 한 줄 컨셉

> *"양피지 위에 펼쳐진 도트 일러스트. 선택지 한 번에 운명이 갈린다."*
> — 30~45 분 분량의 **한국어 텍스트 어드벤처 + 스탯 RPG**. 회차마다 다른 결말. mongo 에 진행도 저장.

## 비전

`bevy-rogue` 가 **픽셀 액션** 으로 *손과 눈* 을 자극한다면, 본 게임은
**선택지와 능력치** 로 *판단* 을 자극한다. 같은 사이트
(`/home/seungrye/site`) 안에 두 게임이 공존하며 서로의 부족을 메운다.

- **bevy-rogue** : 즉각적 보상, 시각적 즐거움, 짧은 호흡
- **모험 (web-adventure)** : 선택지 한 번에 운명이 갈리고, 회차마다 다른 길

CYOA (Choose Your Own Adventure) 의 *얇은 종이책 향수* 와 모던 모바일
RPG 의 *스탯 판정* 을 합친 모델. *모험가 이야기 (Studio Wheel)* 가
직접 referent — 한국어 톤, 6 스탯 시스템, 다회차 권장, 도트 감성.

## 핵심 가치 3 가지

1. **선택지로 의도 표현** — 명령어 입력 X. 씬당 2~4 개 버튼 클릭이 게임의 본체.
2. **스탯이 분기를 만든다** — 같은 씬에서도 *지능 7 이상* 만 보이는 선택지가 다른 길로.
3. **회차 별 다른 결말** — 1 회 클리어 ≠ 끝. 다른 시작 보너스 + 다른 선택 → 다른 엔딩.

## 사례 조사 표

> 본 기획이 *어느 사례에서 어떤 점* 을 가져오는지 표기.

### 0. 직접 referent — CYOA + 스탯 RPG

| 사례 | URL | 출시/상태 | 핵심 메커니즘 | 기술 | 규모 | 한 줄 평 |
|------|-----|----------|-------------|------|------|---------|
| **모험가 이야기 (Tales of Quests)** | [Play Store](https://play.google.com/store/apps/details?id=com.StudioWheel.Bard&hl=en_US) | 2021 / 운영 중 (Studio Wheel) | 6 스탯 (힘/민/지/카/건/지혜) 18 점 분배 시작, 레벨업 시 +3 추가. *상시 / 확률 / 조건* 3 가지 선택지. 다양한 엔딩. 직업 (전사/위저드/소서러) 시작 보너스. | Unity 모바일 | 한국 인디 히트, 다회차 게임 표준 | **본 기획의 직접 referent**. ← *6 스탯 / 3 종 선택지 / 시작 보너스* 그대로 가져옴. |
| **모험가 이야기 / 엔딩 가이드** | [나무위키](https://namu.wiki/w/모험가%20이야기/엔딩) | — | 진 엔딩은 지능 27 + 비요르크 거절 + 게스 + 다니카 + 진실의 거울. 수십 종 엔딩. | — | — | **다회차의 깊이**. 한 번 클리어로는 전혀 못 봄. 단편 30~45 분 × 다회차 모델의 정점. |
| **80 Days (inkle)** | [inklestudios.com/80days](https://www.inklestudios.com/80days/) | 2014 / 다플랫폼 | 75 만 단어 CYOA. 1 회 플레이 = 2 % 만 봄. 시간·돈·주인 건강·아이템 동시 관리. 스탯 *숨김*. 일러스트 + 아르데코 UI. | Ink 엔진 (자체) | TIME 베스트 게임, 아이튠즈 GOTY | **CYOA 정점**. ← *분기 깊이 + 일러스트 톤* 참고. 본 기획은 *스탯 노출* 로 차별화. |
| **Sorcery! 시리즈 (inkle)** | [Wikipedia](https://en.wikipedia.org/wiki/Steve_Jackson's_Sorcery!) | 2013~2016 / 4 부작 | 스탯 = Stamina (HP). 전사 / 마법사 시작 직업. 전투 슬라이더 (공격력 vs 방어), 48 개 주문 (3 글자 단어 암기). | Ink 엔진 | Fighting Fantasy 의 모던 포팅 | **시작 직업 = 분기축**. ← *시작 보너스 시스템* 직접 영감. 본 기획은 직업 대신 *어빌리티 3~4 개* 변형. |
| **Choice of Games** | [choiceofgames.com](https://www.choiceofgames.com/make-your-own-games/choicescript-intro/) | 2010~ / 플랫폼 | ChoiceScript 언어. 스탯 = 1~100 바 차트. 대립 변수쌍 (Honor↔Cunning). `*if` 조건 분기. 평균 100~200 K 단어. | ChoiceScript (자체) | 100+ 작품 운영 | **스탯 + 조건 분기의 표준 데이터 모델**. ← *대립 변수 / stat_chart* UI 참고. |
| **Reigns** | [reignsgames.com](https://www.reignsgames.com/) | 2016 / 모바일 정점 | 카드 좌/우 스와이프 = 2 지선다. 4 게이지 (군·민·교회·금고) 중간 유지. 887 카드, 다단계 이벤트 체인. 미니멀 흑백 실루엣. | Unity | Apple Design Award | **모바일 친화 카드 UX**. ← *2 지선다 + 게이지 4 개* 의 *극단적 단순화* — 본 기획은 *2~4 지선다* 로 적당히 깊이. |
| **Roadwarden** | [Steam](https://store.steampowered.com/app/1155970/Roadwarden/) | 2022 / Moral Anxiety Studio | 일러스트 텍스트 RPG. 전사 / 마법사 / 학자 시작. 활력 / 영양 / 외모 / 갑옷 / 시간 스탯. 인벤토리. 한 회 25~40 시간. 95 % 긍정. | Ren'Py + 픽셀 일러 | Steam 베스트셀러 | **CYOA + 도트 + 스탯 + 인벤토리 = 본 기획과 가장 닮음**. ← *일러스트 톤 / 사이드 패널 구성* 가장 가까운 참고. 단 본 기획은 *30~45 분 단편*. |

### A. 텍스트 미니멀 진화형 (영감 — 점진 공개)

| 사례 | URL | 출시/상태 | 핵심 메커니즘 | 기술 | 규모 | 한 줄 평 |
|------|-----|----------|-------------|------|------|---------|
| **A Dark Room** | [adarkroom.doublespeakgames.com](https://adarkroom.doublespeakgames.com/) | 2013 / 운영 중 | 싱글 / 자동 진행 (불 → 마을 → 탐험). 버튼 UI. 환경 묘사 | HTML5/JS | iOS App Store 1 위 | **점진 공개의 정점**. 처음엔 버튼 1 개, 끝엔 RPG. ← *튜토리얼 없는 점진 공개* 만 참고 |
| **Universal Paperclips** | [decisionproblem.com/paperclips](https://www.decisionproblem.com/paperclips/) | 2017 / 운영 중 | idle → 우주 정복까지 단계 진화. 명확한 끝. | JS 단일 페이지 | 11 일 만에 45 만 명 | **명확한 끝이 있는 incremental**. ← *30~45 분 단편* 모델 정당화 |

### B. Interactive Fiction (IF) — 분기 깊이 참고

| 사례 | URL | 출시/상태 | 핵심 메커니즘 | 기술 | 규모 | 한 줄 평 |
|------|-----|----------|-------------|------|------|---------|
| **Howling Dogs (Twine)** | [xrafstar.monster](https://xrafstar.monster/games/twine/howlingdogs/) | 2012 / 영구 공개 | 하이퍼텍스트 IF, 링크 클릭 | Twine HTML | IF 컴프 우승 | **링크 = 선택지** 의 가장 가벼운 형태 |
| **AI Dungeon** | [play.aidungeon.com](https://play.aidungeon.com/) | 2019 / 운영 중 | AI 가 텍스트 생성 | GPT 기반 | 출시 한 달 1 백만 | **무한 가능성, 일관성 없음**. 본 기획은 *손으로 짠 단편* 으로 정 반대 길 |

### C. 한국어 텍스트 게임 향수 (세계관 영감만)

| 사례 | URL | 출시/상태 | 핵심 메커니즘 | 기술 | 규모 | 한 줄 평 |
|------|-----|----------|-------------|------|------|---------|
| **단군의 땅** | [나무위키](https://namu.wiki/w/단군의%20땅) | 1993~ / 정식 종료 | 멀티 머드, 한국 사극 배경 | LPMUD | 동접 100~200 (전성기) | **한국형 판타지 머드의 원점**. *세계관* 만 영감 |
| **천외천** | [나무위키](https://namu.wiki/w/천외천) | 운영 중 | 웹/모바일 한국어 머드 | 자체 서버 + 웹 클라 | 소규모 | **현재형 한국어 텍스트 게임의 존재 증거** |

## 본 기획이 배워 올 핵심 7 가지

1. **모험가 이야기의 6 스탯 + 3 종 선택지** — *그대로 가져옴* (force / agility / int / cha / con / wis, 상시 / 확률 / 조건)
2. **모험가 이야기의 시작 보너스** — 게임 시작 시 1 가지 특성 선택, 변경 불가
3. **Sorcery! 의 시작 직업 분기** — 본 기획은 *어빌리티 3~4 개* 변형 (분기축 추가)
4. **80 Days 의 일러스트 + 텍스트 페어링** — 씬마다 도트 일러스트 1 장
5. **Choice of Games 의 stat_chart UI** — 사이드 패널에 6 스탯 바
6. **Roadwarden 의 사이드 패널 구성** — 현재 위치 / 인벤 / 스탯 한 화면에
7. **Reigns 의 모바일 친화** — 풀스크린 + 큰 버튼 + 가벼운 한 손 조작

## 본 기획이 *피해야 할* 함정

- **AI Dungeon 식 무한 생성** → 일관성 붕괴. 본 기획은 *손으로 짠 30~40 씬*.
- **Choice of Games 식 100K 단어** → 1 인 6 주 MVP 에는 과함. *2 만 단어* cap.
- **모험가 이야기의 인 앱 결제 / 광고 모델** → 본 기획은 *사이트 부속 무료 컨텐츠*.
- **Roadwarden 식 25~40 시간 분량** → 본 기획은 *30~45 분 단편*.
- **80 Days 식 스탯 숨김** → 모바일 첫 플레이엔 *스탯 노출이 더 친절*. (Choice of Games 방식 채택)
- **Reigns 식 2 지선다 only** → 한국어 CYOA 정서엔 *2~4 지선다* 가 자연.

## 참고 출처

- [모험가 이야기 - Play Store](https://play.google.com/store/apps/details?id=com.StudioWheel.Bard&hl=en_US)
- [모험가 이야기/엔딩 - 나무위키](https://namu.wiki/w/모험가%20이야기/엔딩)
- [80 Days - Wikipedia](https://en.wikipedia.org/wiki/80_Days_(2014_video_game))
- [80 Days - inkle studios](https://www.inklestudios.com/80days/)
- [Steve Jackson's Sorcery! - Wikipedia](https://en.wikipedia.org/wiki/Steve_Jackson's_Sorcery!)
- [Choice of Games / ChoiceScript Intro](https://www.choiceofgames.com/make-your-own-games/choicescript-intro/)
- [ChoiceScript Stats Screen](https://www.choiceofgames.com/make-your-own-games/customizing-the-choicescript-stats-screen/)
- [Reigns - Wikipedia](https://en.wikipedia.org/wiki/Reigns_(video_game))
- [Reigns Design Deep Dive - Game Developer](https://www.gamedeveloper.com/design/game-design-deep-dive-creating-an-adaptive-narrative-in-i-reigns-i-)
- [Roadwarden - Wikipedia](https://en.wikipedia.org/wiki/Roadwarden)
- [Roadwarden - Steam](https://store.steampowered.com/app/1155970/Roadwarden/)
- [A Dark Room - Wikipedia](https://en.wikipedia.org/wiki/A_Dark_Room)
- [Universal Paperclips - Wikipedia](https://en.wikipedia.org/wiki/Universal_Paperclips)
- [Howling Dogs - IFWiki](https://www.ifwiki.org/Howling_dogs)
- [AI Dungeon - Wikipedia](https://en.wikipedia.org/wiki/AI_Dungeon)
- [단군의 땅 - 나무위키](https://namu.wiki/w/단군의%20땅)
- [천외천 - 나무위키](https://namu.wiki/w/천외천)
- [itch.io CC0 Pixel Art](https://itch.io/game-assets/free/tag-cc0/tag-pixel-art)
