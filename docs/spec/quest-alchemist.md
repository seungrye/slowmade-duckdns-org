# 연금술사의 비전 퀘스트 (`alchemist_quest`)

bevy-rogue `assets/quests/alchemist_quest.ron` 기준 문서.

## 개요

| 항목 | 값 |
|------|-----|
| quest id | `alchemist_quest` |
| giver | `alchemist` (연금술사) |
| spawn_chance | 0.7 |
| initial_phase | `not_started` |

재료 3종 수집 + 보유 조합에 따라 전설/정통 두 결말로 분기하는 비선형 퀘스트.

## 수집 재료

| item_id | 이름 | 위치 |
|---------|------|------|
| `dragon_scale` | 용비늘 | Dungeon(2) |
| `ancient_scroll` | 고대 주문서 | Dungeon(1) |
| `philosophers_stone` | 현자의 돌 | `gem_quest` 보상 (선택) |

## 페이즈 흐름

```
not_started
  └─[on_interact]─► gathering

gathering (auto_advance 우선순위)
  ├─[1순위] dragon_scale AND ancient_scroll ─► both_ready
  ├─[2순위] dragon_scale only              ─► has_scale_hint
  └─[3순위] ancient_scroll only            ─► has_scroll_hint

has_scale_hint
  └─[auto] HasItem(ancient_scroll)         ─► both_ready

has_scroll_hint
  └─[auto] HasItem(dragon_scale)           ─► both_ready

both_ready (핵심 분기)
  └─[on_interact] Branch:
      ├─ dragon_scale + ancient_scroll + gem_quest.done + philosophers_stone
      │    ─► RemoveItem×3 + GiveItem(bow) + GiveItem(health_potion)
      │    ─► AdvancePhase("legendary_done")
      └─ else Branch:
           ├─ dragon_scale + ancient_scroll
           │    ─► RemoveItem×2 + GiveItem(spear)
           │    ─► AdvancePhase("normal_done")
           └─ else (재료 분실)
                ─► AdvancePhase("gathering")

legendary_done  [terminal]
normal_done     [terminal]
```

## 결말

| 결말 | 조건 | 보상 |
|------|------|------|
| 전설 (`legendary_done`) | 두 재료 + `gem_quest` 완료 + `philosophers_stone` | `bow`, `health_potion` |
| 정통 (`normal_done`) | 두 재료만 | `spear` |

## 스폰

| phase | item | zone | 비고 |
|-------|------|------|------|
| `gathering` | `dragon_scale` | Dungeon(2) | |
| `gathering` | `ancient_scroll` | Dungeon(1) | |
| `has_scale_hint` | `ancient_scroll` | Dungeon(1) | zone dedup으로 한 인스턴스만 |
| `has_scroll_hint` | `dragon_scale` | Dungeon(2) | zone dedup으로 한 인스턴스만 |

zone-단위 dedup 적용: `world_fracture` 가 같은 zone+item 에 spawn 시도해도 한 인스턴스만 등장.

## `world_fracture` 와의 연관

`world_fracture` 결말 조건에서 `alchemist_quest` 진행 수준을 참조:
- `PhaseIs(quest: "alchemist_quest", phase: "legendary_done")` → 전설 결말 기여
- `PhaseIs(quest: "alchemist_quest", phase: "normal_done")` → 일반 결말 기여
