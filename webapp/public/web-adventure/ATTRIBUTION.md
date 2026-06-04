# Web Adventure — 자산 라이선스 / 저작권 표기

## 일러스트 — Painter-bot 생성본 (2026-06-04)

5 카테고리 이미지 모두 사이트의 painter-bot (Pollinations FLUX + Gemini 한→영 번역) 으로 생성. 생성일 2026-06-04.

### town-square-dawn.jpg
- 모델: Pollinations FLUX (gen.pollinations.ai)
- 번역: Gemini gemini-2.5-flash (한→영). 본 prompt 는 짧아 별도 번역본 미생성 — 한국어 prompt 그대로 사용.
- 원본 prompt (한국어): "한국 전통 마을 광장 새벽, 한옥 지붕, 종이 등불, 우물, 분홍빛 새벽 하늘, 양피지 색감, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문): (한국어 prompt 그대로 — Pollinations FLUX 가 직접 처리)
- minio key: `painter-images/1780598855212-7bd8344c0bd0.jpg`
- 원본 크기: 1024 x 1024 px (JPEG)
- 적용 씬: `town_square_dawn`

### market.jpg
- 모델: Pollinations FLUX (gen.pollinations.ai)
- 번역: Gemini gemini-2.5-flash (한→영)
- 원본 prompt (한국어): "한국 전통 시장 아침, 좌판에 빵·약초·횃불·항아리, 박씨 같은 구두쇠 상인의 가게, 따뜻한 햇살, 양피지 색감, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문): "Early morning in a traditional Korean market, a miserly merchant's stall laden with bread, herbs, torches, and jars. Warm sunlight illuminates the scene, rendered in a parchment-hued palette, 16-bit RPG pixel art style. No characters."
- minio key: `painter-images/1780600928367-37e984b91af1.jpg`
- 원본 크기: 1024 x 1024 px (JPEG)
- 적용 씬: `market_morning`, `market_buy`, `market_storage_success`, `market_caught`

### elder-house.jpg
- 모델: Pollinations FLUX (gen.pollinations.ai)
- 번역: 없음 — prompt 가 영어로 직접 작성됨.
- 원본 prompt (영문): "Pixel art, interior of a Korean village elder's hanok hut, wooden floor maru, sliding paper doors, small altar with candles, dim warm amber lighting, cozy 16-bit RPG aesthetic, no characters, 16:9"
- minio key: `painter-images/1780598291669-c77cab1f6526.jpg`
- 원본 크기: 1024 x 1024 px (JPEG)
- 적용 씬: `elder_house_arrival`, `ending_main`

### forest.jpg
- 모델: Pollinations FLUX (gen.pollinations.ai)
- 번역: Gemini gemini-2.5-flash (한→영)
- 원본 prompt (한국어): "한국 전통 산림 숲 입구, 안개 자욱한 새벽, 이끼 낀 바위, 굵은 소나무, 산신령의 기운, 신비로운 분위기, 양피지 색감, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문): "Entrance to a traditional Korean forest, a misty dawn, moss-laden rocks, sturdy pine trees, the lingering presence of a mountain spirit, an enigmatic ambiance, parchment color palette, 16-bit RPG pixel art, no characters."
- minio key: `painter-images/1780600940055-bc818e93c36b.jpg`
- 원본 크기: 1024 x 1024 px (JPEG)
- 적용 씬: `forest_entry`, `forest_inner`, `forest_lost`, `forest_find_glasses`, `forest_inner_with_glasses`, `ending_spirit`

### cave.jpg
- 모델: Pollinations FLUX (gen.pollinations.ai)
- 번역: Gemini gemini-2.5-flash (한→영)
- 원본 prompt (한국어): "한국 산기슭 동굴 입구, 어두운 동굴 안에서 새어 나오는 푸른 빛, 횃불이 필요한 어둠, 이끼 바위, 도깨비의 기운, 음산하지만 매혹적, 양피지 색감, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문): "A cave entrance on a Korean mountainside. A mysterious blue glow emanates from the dark depths within, revealing a profound darkness that demands the flicker of a torch. Moss-covered rocks frame the opening, imbued with an unsettling aura of Dokkaebi. Eerie yet captivating, rendered in a parchment color palette. 16-bit RPG pixel art, no characters."
- minio key: `painter-images/1780600952412-67d9034ff24b.jpg`
- 원본 크기: 1024 x 1024 px (JPEG)
- 적용 씬: `cave_entry`, `cave_inside`, `cave_after_spellbook`, `goblin_encounter`, `ending_goblin_friend`

## 일러스트 — CC0/CC-BY (이전 임시 자산, 백업 보존)

기존 OpenGameArt 자산은 백업으로 보존 (`*.png`).

### town-square-dawn.png
- 출처: https://opengameart.org/content/gothicvania-town
- 원본 파일: `GothicVania-town-files/PNG/environment/environment-preview.png` (Gothicvania Town 자산 팩 내)
- 작가: ansimuz (Luis Zuno)
- 라이선스: CC0 1.0 Universal (Public Domain Dedication)
- 라이선스 URL: https://creativecommons.org/publicdomain/zero/1.0/
- 다운로드일: 2026-06-05
- 원본 크기: 1536 x 288 px (PNG)

### elder-house.png
- 출처: https://opengameart.org/content/village-landscape-pixel-art-background
- 원본 파일: `Village landscape Free Pixel Art Background.png`
- 작가: CraftPix.net 2D Game Assets
- 라이선스: OGA-BY 3.0 (저작자 표시 필요, 상업 이용 가능)
- 라이선스 URL: https://static.opengameart.org/OGA-BY-3.0.txt
- 다운로드일: 2026-06-05
- 원본 크기: 2304 x 1296 px (PNG)

## 코드 및 컨텐츠

본 게임의 코드 (React/Next.js 구현, 씬 엔진, 스탯 시스템) 및 게임 컨텐츠 (씬 텍스트, 선택지 문구, 분기 로직)는 사이트 운영자 저작.
