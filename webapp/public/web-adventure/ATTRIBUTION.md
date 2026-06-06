# Web Adventure — 자산 라이선스 / 저작권 표기

## 일러스트 — Painter-bot 생성본 (2026-06-04 / 2026-06-05)

### 1차 (2026-06-04) — 5 카테고리 대표 이미지

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
- 적용 씬: `market_morning` (#227 이후 — 나머지 시장 씬은 *2차 painter 생성본* 으로 갱신됨)

### elder-house.jpg
- 모델: Pollinations FLUX (gen.pollinations.ai)
- 번역: 없음 — prompt 가 영어로 직접 작성됨.
- 원본 prompt (영문): "Pixel art, interior of a Korean village elder's hanok hut, wooden floor maru, sliding paper doors, small altar with candles, dim warm amber lighting, cozy 16-bit RPG aesthetic, no characters, 16:9"
- minio key: `painter-images/1780598291669-c77cab1f6526.jpg`
- 원본 크기: 1024 x 1024 px (JPEG)
- 적용 씬: `elder_house_arrival` (#227 이후 — `ending_main` 은 *2차 painter 생성본* 으로 갱신됨)

### forest.jpg
- 모델: Pollinations FLUX (gen.pollinations.ai)
- 번역: Gemini gemini-2.5-flash (한→영)
- 원본 prompt (한국어): "한국 전통 산림 숲 입구, 안개 자욱한 새벽, 이끼 낀 바위, 굵은 소나무, 산신령의 기운, 신비로운 분위기, 양피지 색감, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문): "Entrance to a traditional Korean forest, a misty dawn, moss-laden rocks, sturdy pine trees, the lingering presence of a mountain spirit, an enigmatic ambiance, parchment color palette, 16-bit RPG pixel art, no characters."
- minio key: `painter-images/1780600940055-bc818e93c36b.jpg`
- 원본 크기: 1024 x 1024 px (JPEG)
- 적용 씬: `forest_entry` (#227 이후 — 나머지 forest 씬은 *2차 painter 생성본* 으로 갱신됨)

### cave.jpg
- 모델: Pollinations FLUX (gen.pollinations.ai)
- 번역: Gemini gemini-2.5-flash (한→영)
- 원본 prompt (한국어): "한국 산기슭 동굴 입구, 어두운 동굴 안에서 새어 나오는 푸른 빛, 횃불이 필요한 어둠, 이끼 바위, 도깨비의 기운, 음산하지만 매혹적, 양피지 색감, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문): "A cave entrance on a Korean mountainside. A mysterious blue glow emanates from the dark depths within, revealing a profound darkness that demands the flicker of a torch. Moss-covered rocks frame the opening, imbued with an unsettling aura of Dokkaebi. Eerie yet captivating, rendered in a parchment color palette. 16-bit RPG pixel art, no characters."
- minio key: `painter-images/1780600952412-67d9034ff24b.jpg`
- 원본 크기: 1024 x 1024 px (JPEG)
- 적용 씬: `cave_entry` (#227 이후 — 나머지 cave 씬은 *2차 painter 생성본* 으로 갱신됨)

### 2차 (2026-06-05, #227) — 신규 25 씬 고유 일러스트

기존 5 카테고리 이미지를 25 개 씬이 공유하던 구조에서, 각 씬 *고유 이미지* 로 전환.
한국어 prompt 는 *Gemini gemini-2.5-flash* 가 씬의 `title` + `body` 텍스트를 입력 받아 *환경/조명/소품 중심* 의 시각적 도트 픽셀 prompt 로 자동 작성. 그 후 *Gemini 한→영 번역* 을 거쳐 *Pollinations FLUX (gen.pollinations.ai)* 로 1024 x 1024 JPEG 생성, MinIO `painter-images/` 에 업로드.

생성 스크립트: `webapp/scripts/painter-generate-scene-illustrations.mjs`
공통 스타일 suffix: `양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음`
모든 이미지 1024 x 1024 px (JPEG), 모델 Pollinations FLUX.

처리 중 Gemini 번역 quota (RPM) 가 일부 호출에서 초과 — 해당 10 씬은 *수동으로 사전 번역한 영어 prompt* (`webapp/scripts/painter-scene-english-overrides.json`) 를 직접 Pollinations 에 전달했다. 일부 씬은 Gemini 가 추출한 한국어 prompt 가 부족 (예: 인물 중심 묘사) 해 *수동 보정 prompt* (스크립트 내 `manualOverride` 마킹) 으로 갱신했다.

#### market_buy — 시장의 좌판 — 물건 구매
- minio key: `painter-images/1780627849940-70366b33362d.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "시장 좌판, 목재 탁자, 구운 빵, 횃불, 말린 약초, 풍성한 진열, 밝은 시장 조명, 낮 시간, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Market stall, wooden table, freshly baked bread, flickering torches, dried herbs, a bountiful display, vibrant market lighting, daytime, parchment hues, a warm and inviting atmosphere, 16-bit RPG pixel art, no characters."
- 적용 씬: `market_buy`

#### market_storage_success — 비밀 창고 — 성공
- minio key: `painter-images/1780627862001-2b8d499fbc81.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "비밀 창고, 어두운 실내, 희미한 빛, 낡은 나무 선반, 먼지, 작은 보따리, 고요한 분위기, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "A secret storeroom, a dim interior, with faint light casting soft shadows. Aged wooden shelves, adorned with dust, hold small, forgotten bundles. A tranquil stillness permeates the air, bathed in warm parchment hues. 16-bit RPG dot pixel art, no characters."
- 적용 씬: `market_storage_success`

#### market_caught — 시장 — 들켰다
- minio key: `painter-images/1780627869505-fcee9de50558.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "시장, 광장, 흔들리는 좌판, 다양한 상품, 나무 상자, 분주한 거리, 낮 시간, 밝은 햇살, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Marketplace, town square, swaying stalls, various goods, wooden crates, bustling street, daytime, bright sunlight, parchment colors, warm atmosphere, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `market_caught`

#### market_back_alley — 시장 뒷골목 — 어둠 속의 의심
- minio key: `painter-images/1780628370586-b940e3ce24ea.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "시장 뒷골목, 좁은 골목길, 낡은 벽, 어두운 밤, 희미한 가로등, 그림자, 쓰레기 더미, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: a Korean traditional market back alley at night, narrow path between weathered hanok walls, faint paper lantern light, dark shadows, piles of debris, oppressive suspicious mood, parchment color palette, warm atmosphere, dot pixel art style"
- 적용 씬: `market_back_alley`

#### peddler — 광장 옆 — 떠돌이 행상인
- minio key: `painter-images/1780627961652-a515f260dd54.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "광장, 해질녘, 떠돌이 행상인의 보따리, 낡은 두루마리, 영수증, 나무 좌판, 먼지, 나무 바닥, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Plaza, sunset, traveling merchant's wares, old scrolls, receipts, wooden stall, dust, wooden floor, parchment colors, warm atmosphere, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `peddler`

#### peddler_success — 행상인 — 영수증
- minio key: `painter-images/1780628342445-84805b494792.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "양피지, 낡은 책상, 잉크병, 깃펜, 촛불, 어두운 방, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: an old wooden desk, a parchment receipt, ink bottle, quill pen, lit candle, dim cozy room, soft amber lighting, parchment color palette, warm atmosphere, dot pixel art style"
- 적용 씬: `peddler_success`

#### forest_inner — 숲 깊은 곳 — 산신령의 흔적
- minio key: `painter-images/1780627876308-c91bb0629808.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "깊은 숲, 짙은 안개, 희미한 빛, 울창한 나무들, 축축한 땅, 고요한, 신비로운 분위기, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Deep forest, thick fog, faint light, lush trees, damp earth, serene, mystical atmosphere, parchment colors, warm mood, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `forest_inner`

#### forest_lost — 숲 — 길을 잃다
- minio key: `painter-images/1780627883287-bcd21140ebcf.jpg`
- 원본 prompt (한국어) (Gemini 자동 생성 + 수동 보정): "짙은 안개 낀 숲 한가운데, 보이지 않는 발밑, 굵은 나무 둥치, 길 잃은 흔적, 흐릿한 빛, 음울한 분위기, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "In the heart of a dense, foggy forest, unseen ground beneath, thick tree trunks, a lost trail, hazy light, a somber atmosphere, parchment colors, a warm mood, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `forest_lost`

#### forest_find_glasses — 이끼 사이의 안경
- minio key: `painter-images/1780627902917-e83d4ce26338.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "이끼 낀 숲 바닥, 둥근 안경, 반짝이는 빛, 부드러운 햇살, 촉촉한 이끼, 고요한 분위기, 오래된 유물, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Mossy forest floor, round glasses, shimmering light, soft sunlight, damp moss, serene atmosphere, ancient relic, parchment color palette, warm mood, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `forest_find_glasses`

#### forest_inner_with_glasses — 산신령의 길 — 보이지 않던 것
- minio key: `painter-images/1780627910119-93af88ec6f1c.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "산길, 안개 낀 숲, 은빛 길, 몽환적인 빛, 신비로운 분위기, 깊은 숲 속, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Mountain path, foggy forest, silver road, dreamlike light, mystical atmosphere, deep within the woods, parchment colors, warm ambiance, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `forest_inner_with_glasses`

#### forest_deep — 숲의 가장 깊은 곳
- minio key: `painter-images/1780627916849-af7a1424b5e9.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "울창한 숲, 숲의 가장 깊은 곳, 고대 나무, 거대한 나무 둥치, 둥치에 새겨진 문자, 희미한 숲길, 어둑한 숲 속, 신비로운 분위기, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Lush forest, deepest part of the forest, ancient trees, giant tree trunks, ancient runes carved into the trunk, faint forest path, dim forest, mystical atmosphere, parchment colors, warm mood, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `forest_deep`

#### cave_inside — 동굴 안 — 마법서와 그림자
- minio key: `painter-images/1780627805232-df2f0b68225e.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "동굴 내부, 횃불 조명, 푸르게 빛나는 동굴 벽, 낡은 마법서, 어두운 구석, 돌 재질, 고대 분위기, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Cave interior, illuminated by torchlight, with walls glowing a mystical blue. An old, worn grimoire rests amidst dark corners, the scene steeped in ancient stone textures and a warm, parchment palette. Rendered in 16-bit RPG dot pixel art, no characters."
- 적용 씬: `cave_inside`

#### cave_after_spellbook — 마법서를 챙겼다
- minio key: `painter-images/1780627923318-3863873bc8e0.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "낡은 마법서, 빛나는 글자, 책상, 촛불, 나무 재질, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "An old grimoire, glowing script, a desk, candlelight, wooden texture, parchment colors, warm atmosphere, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `cave_after_spellbook`

#### cave_treasure — 동굴 보물 — 낡은 두루마리
- minio key: `painter-images/1780627935737-01656f3d42f6.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "동굴, 어두컴컴한 조명, 낡은 두루마리, 마법서, 그림자, 돌 벽, 16비트 RPG 도트 픽셀 아트, 양피지 색감, 따뜻한 분위기, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Cave, dim lighting, old scroll, grimoire, shadows, stone walls, 16-bit RPG dot pixel art, parchment colors, warm atmosphere, no characters"
- 적용 씬: `cave_treasure`

#### goblin_encounter — 도깨비 — 작은 친구
- minio key: `painter-images/1780627942857-8b88dcff19dc.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "어두운 숲 속, 반딧불이, 도깨비불, 낡은 돌담, 덩굴, 나무 뿌리, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Dark forest, fireflies, will-o'-the-wisp, old stone wall, vines, tree roots, parchment colors, warm atmosphere, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `goblin_encounter`

#### companion_meeting — 광장의 가장자리 — 동행할 자
- minio key: `painter-images/1780628347920-1cd4a9157e68.jpg`
- 원본 prompt (한국어) (Gemini 자동 생성 + 수동 보정): "한국 전통 마을 광장의 동쪽 가장자리, 새벽빛, 빈 좌판, 돌 바닥, 망토 걸이, 등불, 고요한 분위기, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: the eastern edge of a traditional Korean village plaza at dawn, empty wooden market stalls, paved stone ground, a cloak hanging on a hook, a lantern, peaceful quiet morning, parchment color palette, warm atmosphere, dot pixel art style"
- 적용 씬: `companion_meeting`

#### companion_success — 동행의 증표
- minio key: `painter-images/1780628353577-1d7512b6ebe5.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "조용한 숲길, 황혼, 작은 동행 증표, 낡은 나무, 이끼 낀 돌, 희미한 햇살, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: a quiet forest path at dusk, a small wooden talisman charm lying on the ground, weathered ancient trees, mossy stones, soft fading sunlight, parchment color palette, warm atmosphere, dot pixel art style"
- 적용 씬: `companion_success`

#### mountain_foot — 산기슭 — 바위 길의 시작
- minio key: `painter-images/1780628359122-6562af1c5599.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "산기슭 길, 절벽 사이 오솔길, 늙은 마법사의 오두막, 걷힌 안개, 바위 길, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: a Korean mountain foothill path, a narrow trail winding between rocky cliffs, mist clearing, a distant old wizard's hanok hut at the path's end, stone path, parchment color palette, warm atmosphere, dot pixel art style"
- 적용 씬: `mountain_foot`

#### wizard_meeting — 마법사의 오두막 — 시험
- minio key: `painter-images/1780628365138-f3619fd56921.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "마법사의 오두막, 낡은 책 더미, 약초, 나무 책상, 먼지 낀 공기, 촛불 조명, 낡은 나무 질감, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: an old Korean wizard's hanok hut interior, towering stacks of dusty spellbooks, dried herbs hanging from beams, a wooden desk with ink and quill, candle light, dust motes in the air, weathered wood texture, parchment color palette, warm atmosphere, dot pixel art style"
- 적용 씬: `wizard_meeting`

#### ending_main — 장로의 비밀 간식 — 메인 엔딩
- minio key: `painter-images/1780628375688-0966f2fe8746.jpg`
- 원본 prompt (한국어) (Gemini 자동 생성 + 수동 보정): "한국 전통 한옥 장로의 방, 낡은 보따리 풀린 상태, 은은한 촛불, 향 피우는 연기, 다과상, 따뜻한 호박색 조명, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: interior of a Korean village elder's hanok room, an opened cloth bundle revealing sweet treats on a tray, soft candle light, incense smoke curling, a low wooden tea table, warm amber lighting, parchment color palette, cozy warm atmosphere, dot pixel art style"
- 적용 씬: `ending_main`

#### ending_spirit — 산신령의 동행 — 비밀 엔딩
- minio key: `painter-images/1780628063981-7ec772aa16b6.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "안개 걷히는 숲, 고요한 산길, 아침 빛, 신비로운 분위기, 낡은 돌길, 울창한 나무, 바위, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "A misty forest, a serene mountain path, morning light, a mystical atmosphere, an old stone path, lush trees, rocks, parchment color palette, warm mood, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `ending_spirit`

#### ending_goblin_friend — 도깨비의 친구 — 엔딩
- minio key: `painter-images/1780628071232-cbd7f2a5bca1.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "동굴, 또 다른 길, 바위 벽, 작은 부적, 어렴풋한 빛, 신비로운 분위기, 미지의 길, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (Gemini gemini-2.5-flash 자동 번역): "Cave, another path, rock walls, a small amulet, dim light, mystical atmosphere, unknown path, parchment colors, warm mood, 16-bit RPG dot pixel art, no characters"
- 적용 씬: `ending_goblin_friend`

#### ending_fail — 마을 추방 — 실패 엔딩
- minio key: `painter-images/1780628381208-46fc81a5244e.jpg`
- 원본 prompt (한국어) (Gemini 자동 생성 + 수동 보정): "한국 전통 마을 어귀 흙길, 늘어진 발자국, 황량한 황혼, 멀어지는 마을 풍경, 적막한 분위기, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: a Korean traditional village outskirts dirt road at dusk, a line of fading footprints stretching into the distance, abandoned desolate twilight, distant village rooftops fading from view, somber lonely mood, parchment color palette, warm atmosphere, dot pixel art style"
- 적용 씬: `ending_fail`

#### ending_shopkeeper — 시장의 새 주인 — 정착 엔딩
- minio key: `painter-images/1780628390058-3a9d129eef48.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "시장 광장, 새벽녘, 어스름한 빛, 동이 터오는 하늘, 빈 좌판, 풀어헤쳐진 보따리, 나무 상자, 돌 바닥, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: a Korean traditional market plaza at early dawn, soft pre-sunrise twilight glow, an empty wooden market stall, an opened bundle of goods, wooden crates, stone-paved ground, hopeful new beginning mood, parchment color palette, warm atmosphere, dot pixel art style"
- 적용 씬: `ending_shopkeeper`

#### ending_wizard_apprentice — 마법사의 제자 — 비밀 엔딩
- minio key: `painter-images/1780628395570-1d0a45afb10d.jpg`
- 원본 prompt (한국어) (Gemini gemini-2.5-flash 자동 생성): "마법사의 오두막, 책상, 마법서, 마법서의 빛, 창밖 안개, 신비로운 분위기, 낡은 목재, 양피지 색감, 따뜻한 분위기, 16비트 RPG 도트 픽셀 아트, 인물 없음"
- 사용 prompt (영문) (수동 번역 — Gemini 번역 quota 초과로 보정): "16-bit RPG pixel art, no characters, no people: an old wizard's hanok hut interior, a wooden desk near a window, an open glowing spellbook on the desk, mist swirling outside the window, mystical atmosphere, weathered wooden floor, candle light, parchment color palette, warm atmosphere, dot pixel art style"
- 적용 씬: `ending_wizard_apprentice`


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
