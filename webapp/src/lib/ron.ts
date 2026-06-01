import type {
  QuestDef,
  QuestPhaseDef,
  QuestTransition,
  TriggerKind,
  Action,
  Condition,
  PortalPlacement,
  QuestSpawn,
  SpawnZone,
  TrapKind,
} from "@/types/quest";
import type { VillagerDef, HomeLandmark } from "@/types/villager";
import { HOME_LANDMARKS } from "@/types/villager";
import type { ItemDef, ConsumableEffect, WeaponElement, AccessoryEffect } from "@/types/item";
import { ACCESSORY_EFFECTS } from "@/types/item";
import type { MonsterDef, MonsterElement } from "@/types/monster";
import type { StartLoadoutDef } from "@/types/start-loadout";
import type { TownConfig, TownEnvironment } from "@/types/town-config";

// ─────────────────────────────────────────────────────────────────────────────
// Tokenizer
// ─────────────────────────────────────────────────────────────────────────────

type Token =
  | { kind: "ident"; val: string }
  | { kind: "str"; val: string }
  | { kind: "num"; val: number }
  | { kind: "punct"; val: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    // 라인 주석
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    // RON 확장 directive (예: #![enable(implicit_some)]) — 라인 스킵
    if (src[i] === "#") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    // 공백
    if (/\s/.test(src[i])) { i++; continue; }
    // 문자열
    // Rust/RON 호환 escape 처리:
    //   \n \r \t \\ \" \0  → 표준 escape
    //   \x7F                → 8비트 hex (Rust 호환, 0x7F 까지만 안전)
    //   \u{XXXX} / \u{XXXXXX} → 유니코드 codepoint (game RON 의 glyph_game_icon 이 사용)
    //   기타 \?              → ? 를 그대로 (예: 이전 호환 유지)
    if (src[i] === '"') {
      let s = "";
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") {
          i++;
          const esc = src[i];
          if (esc === "n")      { s += "\n"; i++; }
          else if (esc === "r") { s += "\r"; i++; }
          else if (esc === "t") { s += "\t"; i++; }
          else if (esc === "0") { s += "\0"; i++; }
          else if (esc === "\\") { s += "\\"; i++; }
          else if (esc === '"')  { s += '"';  i++; }
          else if (esc === "x") {
            // \xHH (2 자리 hex)
            const hh = src.slice(i + 1, i + 3);
            const cp = parseInt(hh, 16);
            if (/^[0-9a-fA-F]{2}$/.test(hh) && Number.isFinite(cp)) {
              s += String.fromCharCode(cp);
              i += 3;
            } else {
              s += esc; i++;
            }
          }
          else if (esc === "u" && src[i + 1] === "{") {
            // \u{XXXX} — 1~6 자리 hex
            const end = src.indexOf("}", i + 2);
            if (end >= 0) {
              const hex = src.slice(i + 2, end);
              const cp = parseInt(hex, 16);
              if (/^[0-9a-fA-F]{1,6}$/.test(hex) && Number.isFinite(cp) && cp <= 0x10FFFF) {
                s += String.fromCodePoint(cp);
                i = end + 1;
              } else {
                // 잘못된 형식 — escape 를 그대로 보존
                s += esc;
                i++;
              }
            } else {
              s += esc;
              i++;
            }
          }
          else {
            // 알 수 없는 escape — escape 문자만 보존 (이전 동작 호환)
            s += esc; i++;
          }
        }
        else {
          s += src[i];
          i++;
        }
      }
      i++;
      tokens.push({ kind: "str", val: s });
      continue;
    }
    // 식별자 / 키워드
    if (/[a-zA-Z_]/.test(src[i])) {
      let s = "";
      while (i < src.length && /[\w]/.test(src[i])) s += src[i++];
      tokens.push({ kind: "ident", val: s });
      continue;
    }
    // 숫자 (음수·소수 포함)
    if (/[0-9]/.test(src[i]) || (src[i] === "-" && /[0-9]/.test(src[i + 1] ?? ""))) {
      let s = "";
      if (src[i] === "-") s += src[i++];
      while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
      tokens.push({ kind: "num", val: Number(s) });
      continue;
    }
    // 구두점
    tokens.push({ kind: "punct", val: src[i++] });
  }

  return tokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined { return this.tokens[this.pos]; }
  next(): Token { return this.tokens[this.pos++]; }

  expectPunct(val: string): void {
    const t = this.next();
    if (t.kind !== "punct" || t.val !== val)
      throw new Error(`Expected '${val}' got '${JSON.stringify(t)}' at pos ${this.pos}`);
  }

  expectIdent(): string {
    const t = this.next();
    if (t.kind !== "ident")
      throw new Error(`Expected ident got '${JSON.stringify(t)}' at pos ${this.pos}`);
    return t.val;
  }

  tryPunct(val: string): boolean {
    if (this.peek()?.kind === "punct" && this.peek()?.val === val) {
      this.next();
      return true;
    }
    return false;
  }

  parseString(): string {
    const t = this.next();
    if (t.kind !== "str") throw new Error(`Expected string, got ${JSON.stringify(t)}`);
    return t.val;
  }

  parseIdent(): string {
    return this.expectIdent();
  }

  parseNumber(): number {
    const t = this.next();
    if (t.kind !== "num") throw new Error(`Expected number, got ${JSON.stringify(t)}`);
    return t.val;
  }

  parseOptionString(): string | null {
    // implicit_some: bare 문자열도 수용
    if (this.peek()?.kind === "str") return this.parseString();
    const name = this.parseIdent();
    if (name === "None") return null;
    this.expectPunct("(");
    const v = this.parseString();
    this.expectPunct(")");
    return v;
  }

  parseOptionCondition(): Condition | undefined {
    const name = this.parseIdent();
    if (name === "None") return undefined;
    if (name !== "Some") throw new Error(`Expected Some/None, got ${name}`);
    this.expectPunct("(");
    const c = this.parseCondition();
    this.expectPunct(")");
    return c;
  }

  parseNumberTuple3(): [number, number, number] {
    this.expectPunct("(");
    const a = this.parseNumber();
    this.tryPunct(",");
    const b = this.parseNumber();
    this.tryPunct(",");
    const c = this.parseNumber();
    this.tryPunct(",");
    this.expectPunct(")");
    return [a, b, c];
  }

  // ── ItemDef (4 종) ────────────────────────────────────────────────────────

  // 공통 필드를 def 객체에 채워넣고 미처리 키를 콜백으로 위임
  parseItemCommon(handleKindKey: (key: string) => boolean): {
    id: string; displayName: string;
    glyphAscii: string; glyphGameIcon: string;
    pickupMessage: string;
    hidden?: boolean;
  } {
    let id = "", displayName = "", glyphAscii = "",
      glyphGameIcon = "", pickupMessage = "";
    let hidden: boolean | undefined;

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "id":              id = this.parseString(); break;
        case "display_name":    displayName = this.parseString(); break;
        case "glyph_ascii":     glyphAscii = this.parseString(); break;
        // 하위 호환: 옛 RON 의 glyph_unicode 키는 silently 소비 (값 폐기).
        // 마이그레이션 후 모든 RON 에서 제거되었으나, 캐시된 옛 데이터를 안전하게 흡수.
        case "glyph_unicode":   this.parseString(); break;
        case "glyph_game_icon": glyphGameIcon = this.parseString(); break;
        case "pickup_message":  pickupMessage = this.parseString(); break;
        case "hidden":          hidden = this.parseBool(); break;
        default:
          if (!handleKindKey(key)) throw new Error(`Unknown item field: ${key}`);
      }
      this.tryPunct(",");
    }
    const out: {
      id: string; displayName: string;
      glyphAscii: string; glyphGameIcon: string;
      pickupMessage: string; hidden?: boolean;
    } = { id, displayName, glyphAscii, glyphGameIcon, pickupMessage };
    if (hidden !== undefined) out.hidden = hidden;
    return out;
  }

  parseQuestItemDef(): Extract<ItemDef, { kind: "quest" }> {
    const name = this.parseIdent();
    if (name !== "QuestItemDef") throw new Error(`Expected QuestItemDef, got ${name}`);
    this.expectPunct("(");
    let imagePath = "";
    const common = this.parseItemCommon((key) => {
      if (key === "image_path") { imagePath = this.parseString(); return true; }
      return false;
    });
    this.expectPunct(")");
    return { kind: "quest", ...common, imagePath };
  }

  parseWeaponDef(): Extract<ItemDef, { kind: "weapon" }> {
    const name = this.parseIdent();
    if (name !== "WeaponDef") throw new Error(`Expected WeaponDef, got ${name}`);
    this.expectPunct("(");
    let attackPower: number | undefined;
    let attackPowerMin: number | undefined;
    let attackPowerMax: number | undefined;
    let tier: number | undefined;
    let element: WeaponElement | null = null;
    const common = this.parseItemCommon((key) => {
      if (key === "attack_power")     { attackPower = this.parseNumber(); return true; }
      if (key === "attack_power_min") { attackPowerMin = this.parseNumber(); return true; }
      if (key === "attack_power_max") { attackPowerMax = this.parseNumber(); return true; }
      if (key === "tier")             { tier = this.parseNumber(); return true; }
      if (key === "element") {
        // Some("fire") | None
        const peek = this.parseIdent();
        if (peek === "None") { element = null; return true; }
        if (peek !== "Some") throw new Error(`Expected Some/None for element, got ${peek}`);
        this.expectPunct("(");
        const v = this.parseString();
        if (v !== "fire" && v !== "ice" && v !== "lightning") {
          throw new Error(`Unknown element: ${v}`);
        }
        element = v;
        this.expectPunct(")");
        return true;
      }
      return false;
    });
    this.expectPunct(")");
    // fallback: 둘 중 한쪽만 있어도 다른쪽을 추론 → round-trip 안전성 확보
    if (attackPower === undefined) {
      if (attackPowerMin !== undefined && attackPowerMax !== undefined) {
        attackPower = Math.round((attackPowerMin + attackPowerMax) / 2);
      } else {
        attackPower = 0;
      }
    }
    const def: Extract<ItemDef, { kind: "weapon" }> = {
      kind: "weapon", ...common, attackPower, element,
    };
    if (attackPowerMin !== undefined) def.attackPowerMin = attackPowerMin;
    if (attackPowerMax !== undefined) def.attackPowerMax = attackPowerMax;
    if (tier !== undefined) def.tier = tier;
    return def;
  }

  parseArmorDef(): Extract<ItemDef, { kind: "armor" }> {
    const name = this.parseIdent();
    if (name !== "ArmorDef") throw new Error(`Expected ArmorDef, got ${name}`);
    this.expectPunct("(");
    let defenseBonus: number | undefined;
    let defenseBonusMin: number | undefined;
    let defenseBonusMax: number | undefined;
    let tier: number | undefined;
    const common = this.parseItemCommon((key) => {
      if (key === "defense_bonus")     { defenseBonus = this.parseNumber(); return true; }
      if (key === "defense_bonus_min") { defenseBonusMin = this.parseNumber(); return true; }
      if (key === "defense_bonus_max") { defenseBonusMax = this.parseNumber(); return true; }
      if (key === "tier")              { tier = this.parseNumber(); return true; }
      return false;
    });
    this.expectPunct(")");
    if (defenseBonus === undefined) {
      if (defenseBonusMin !== undefined && defenseBonusMax !== undefined) {
        defenseBonus = Math.round((defenseBonusMin + defenseBonusMax) / 2);
      } else {
        defenseBonus = 0;
      }
    }
    const def: Extract<ItemDef, { kind: "armor" }> = {
      kind: "armor", ...common, defenseBonus,
    };
    if (defenseBonusMin !== undefined) def.defenseBonusMin = defenseBonusMin;
    if (defenseBonusMax !== undefined) def.defenseBonusMax = defenseBonusMax;
    if (tier !== undefined) def.tier = tier;
    return def;
  }

  parseConsumableEffect(): ConsumableEffect {
    const name = this.parseIdent();
    if (name !== "Heal") throw new Error(`Unknown consumable effect: ${name}`);
    this.expectPunct("(");
    const amount = this.parseNumber();
    this.expectPunct(")");
    return { type: "Heal", amount };
  }

  parseConsumableDef(): Extract<ItemDef, { kind: "consumable" }> {
    const name = this.parseIdent();
    if (name !== "ConsumableDef") throw new Error(`Expected ConsumableDef, got ${name}`);
    this.expectPunct("(");
    let effect: ConsumableEffect = { type: "Heal", amount: 0 };
    const common = this.parseItemCommon((key) => {
      if (key === "effect") { effect = this.parseConsumableEffect(); return true; }
      return false;
    });
    this.expectPunct(")");
    return { kind: "consumable", ...common, effect };
  }

  parseAccessoryDef(): Extract<ItemDef, { kind: "accessory" }> {
    const name = this.parseIdent();
    if (name !== "AccessoryDef") throw new Error(`Expected AccessoryDef, got ${name}`);
    this.expectPunct("(");
    let desc = "";
    let effects: AccessoryEffect[] | undefined;
    const common = this.parseItemCommon((key) => {
      if (key === "desc") { desc = this.parseString(); return true; }
      if (key === "effects") {
        // RON: effects: [RevealGuardVision, RevealTrapsInSight]
        effects = this.parseArray(() => {
          const id = this.parseIdent();
          if (!ACCESSORY_EFFECTS.includes(id as AccessoryEffect)) {
            throw new Error(`Unknown AccessoryEffect: ${id}`);
          }
          return id as AccessoryEffect;
        });
        return true;
      }
      return false;
    });
    this.expectPunct(")");
    const out: Extract<ItemDef, { kind: "accessory" }> = { kind: "accessory", ...common, desc };
    if (effects !== undefined) out.effects = effects;
    return out;
  }

  // ── StartLoadout ─────────────────────────────────────────────────────────
  // 게임 측 Rust StartLoadout: { gold: u32, weapon: Option<String>, armor: Option<String>,
  //                             items: Vec<String>, consumables: Vec<(String, u32)> }
  // implicit_some directive 있을 수도 없을 수도 있어 양쪽 다 수용.

  /** `("health_potion", 10)` 형식의 (id, count) 튜플. */
  parseConsumableTuple(): { id: string; count: number } {
    this.expectPunct("(");
    const id = this.parseString();
    this.tryPunct(",");
    const count = this.parseNumber();
    this.tryPunct(",");
    this.expectPunct(")");
    return { id, count };
  }

  /** weapon/armor 의 Option<String> — None, Some("x"), 또는 bare "x" (implicit_some). */
  parseOptionStringField(): string | null {
    if (this.peek()?.kind === "str") return this.parseString();
    const name = this.parseIdent();
    if (name === "None") return null;
    if (name !== "Some") throw new Error(`Expected Some/None, got ${name}`);
    this.expectPunct("(");
    const v = this.parseString();
    this.expectPunct(")");
    return v;
  }

  parseStartLoadout(): StartLoadoutDef {
    const name = this.parseIdent();
    if (name !== "StartLoadout") throw new Error(`Expected StartLoadout, got ${name}`);
    this.expectPunct("(");

    const def: StartLoadoutDef = {
      gold: 0,
      weapon: null,
      armor: null,
      items: [],
      consumables: [],
    };

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "gold":        def.gold        = this.parseNumber(); break;
        case "weapon":      def.weapon      = this.parseOptionStringField(); break;
        case "armor":       def.armor       = this.parseOptionStringField(); break;
        case "items":       def.items       = this.parseArray(() => this.parseString()); break;
        case "consumables": def.consumables = this.parseArray(() => this.parseConsumableTuple()); break;
        default: break;
      }
      this.tryPunct(",");
    }
    this.expectPunct(")");
    return def;
  }

  // ── VillagerDef ──────────────────────────────────────────────────────────

  parseVillagerDef(): VillagerDef {
    const name = this.parseIdent();
    if (name !== "VillagerDef") throw new Error(`Expected VillagerDef, got ${name}`);
    this.expectPunct("(");

    const def: VillagerDef = {
      id: "",
      name: "",
      color: [0, 0, 0],
      dialogs: [],
      speed: 1.0,
    };

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "id":         def.id         = this.parseString(); break;
        case "name":       def.name       = this.parseString(); break;
        case "color":      def.color      = this.parseNumberTuple3(); break;
        case "dialogs":    def.dialogs    = this.parseArray(() => this.parseString()); break;
        // 하위호환: 구 형식의 quest_id 는 소비 후 무시
        case "quest_id":   this.parseOptionString(); break;
        case "speed":      def.speed      = this.parseNumber(); break;
        case "stationary": def.stationary = this.parseBool(); break;
        case "vendor":     def.vendor     = this.parseBool(); break;
        // home_zone — 게임의 ZoneId 와 동일한 RON 인코딩(parseSpawnZone 재사용).
        // 누락 시 default = Town (게임 측 #[serde(default)] 와 미러).
        case "home_zone":  def.homeZone   = this.parseSpawnZone(); break;
        // home_landmark — PascalCase enum (Random/Road/Inn/Smithy/Temple/Guard/
        // Market/Manor). 누락 시 default = "random" (게임 측 #[serde(default)] 미러).
        case "home_landmark": def.homeLandmark = this.parseHomeLandmark(); break;
        // free_roam — bool. 누락 시 default = false (게임 측 #[serde(default)] 미러).
        case "free_roam":  def.freeRoam   = this.parseBool(); break;
        default: break;
      }
      this.tryPunct(",");
    }
    this.expectPunct(")");
    return def;
  }

  // ── MonsterDef ─────────────────────────────────────────────────────────────

  parseMonsterDef(): MonsterDef {
    const name = this.parseIdent();
    if (name !== "MonsterDef") throw new Error(`Expected MonsterDef, got ${name}`);
    this.expectPunct("(");

    const def: MonsterDef = {
      id: "",
      displayName: "",
      glyph: "",
      color: [0, 0, 0],
      hp: 0,
      attack: 0,
      defense: 0,
      visionRadius: 0,
      speed: 1.0,
      element: null,
      spawnWeight: 1.0,
      zones: [],
      questOnly: false,
    };

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "id":             def.id           = this.parseString(); break;
        case "display_name":   def.displayName  = this.parseString(); break;
        case "glyph":          def.glyph        = this.parseString(); break;
        case "color":          def.color        = this.parseNumberTuple3(); break;
        case "hp":             def.hp           = this.parseNumber(); break;
        case "attack":         def.attack       = this.parseNumber(); break;
        case "defense":        def.defense      = this.parseNumber(); break;
        case "vision_radius":  def.visionRadius = this.parseNumber(); break;
        case "speed":          def.speed        = this.parseNumber(); break;
        case "element":        def.element      = this.parseMonsterElement(); break;
        case "spawn_weight":   def.spawnWeight  = this.parseNumber(); break;
        case "zones":          def.zones        = this.parseArray(() => this.parseSpawnZone()); break;
        case "spawn_condition": {
          const c = this.parseOptionCondition();
          if (c !== undefined) def.spawnCondition = c;
          break;
        }
        case "quest_only":     def.questOnly    = this.parseBool(); break;
        default: break;
      }
      this.tryPunct(",");
    }
    this.expectPunct(")");
    return def;
  }

  /** Some("fire") | None — 몬스터 원소 (poison 포함). */
  parseMonsterElement(): MonsterElement | null {
    const peek = this.parseIdent();
    if (peek === "None") return null;
    if (peek !== "Some") throw new Error(`Expected Some/None for element, got ${peek}`);
    this.expectPunct("(");
    const v = this.parseString();
    this.expectPunct(")");
    if (v !== "fire" && v !== "ice" && v !== "poison" && v !== "lightning") {
      throw new Error(`Unknown monster element: ${v}`);
    }
    return v;
  }

  parseBool(): boolean {
    const v = this.parseIdent();
    if (v === "true") return true;
    if (v === "false") return false;
    throw new Error(`Expected bool, got ${v}`);
  }

  /**
   * HomeLandmark enum — bare ident (Random | Road | Inn | Smithy | Temple |
   * Guard | Market | Manor). 게임 측 PascalCase 와 TS lowercase 매핑.
   */
  parseHomeLandmark(): HomeLandmark {
    const v = this.parseIdent();
    const lower = v.toLowerCase();
    if ((HOME_LANDMARKS as readonly string[]).includes(lower)) {
      return lower as HomeLandmark;
    }
    throw new Error(`Unknown home_landmark: ${v}`);
  }

  /** TrapKind enum — bare ident (Spike | Poison | Alarm | Teleport). */
  parseTrapKind(): TrapKind {
    const v = this.parseIdent();
    if (v === "Spike" || v === "Poison" || v === "Alarm" || v === "Teleport") return v;
    throw new Error(`Unknown trap kind: ${v}`);
  }

  parseArray<T>(parseItem: () => T): T[] {
    this.expectPunct("[");
    const items: T[] = [];
    while (!(this.peek()?.kind === "punct" && this.peek()?.val === "]")) {
      items.push(parseItem());
      this.tryPunct(",");
    }
    this.expectPunct("]");
    return items;
  }

  // ── Condition ─────────────────────────────────────────────────────────────

  parseCondition(): Condition {
    const name = this.parseIdent();

    switch (name) {
      case "Always":
        return { type: "Always" };

      case "FlagIs": {
        this.expectPunct("(");
        this.expectIdent(); this.expectPunct(":"); const flag = this.parseString();
        this.tryPunct(",");
        this.expectIdent(); this.expectPunct(":"); const value = this.parseString();
        this.tryPunct(",");
        this.expectPunct(")");
        return { type: "FlagIs", flag, value };
      }

      case "HasFlag": {
        this.expectPunct("(");
        const flag = this.parseString();
        this.expectPunct(")");
        return { type: "HasFlag", flag };
      }

      case "HasItem": {
        this.expectPunct("(");
        const itemId = this.parseString();
        this.expectPunct(")");
        return { type: "HasItem", itemId };
      }

      case "And": {
        this.expectPunct("(");
        const conditions = this.parseArray(() => this.parseCondition());
        this.expectPunct(")");
        return { type: "And", conditions };
      }

      case "Or": {
        this.expectPunct("(");
        const conditions = this.parseArray(() => this.parseCondition());
        this.expectPunct(")");
        return { type: "Or", conditions };
      }

      case "Not": {
        this.expectPunct("(");
        const condition = this.parseCondition();
        this.expectPunct(")");
        return { type: "Not", condition };
      }

      case "PhaseIs": {
        this.expectPunct("(");
        this.expectIdent(); this.expectPunct(":"); const quest = this.parseString();
        this.tryPunct(",");
        this.expectIdent(); this.expectPunct(":"); const phase = this.parseString();
        this.tryPunct(",");
        this.expectPunct(")");
        return { type: "PhaseIs", quest, phase };
      }

      case "InZone": {
        this.expectPunct("(");
        const zone = this.parseSpawnZone();
        this.expectPunct(")");
        return { type: "InZone", zone };
      }

      default:
        throw new Error(`Unknown condition: ${name}`);
    }
  }

  // ── Action list ──────────────────────────────────────────────────────────

  parseActionList(): Action[] {
    return this.parseArray(() => this.parseAction());
  }

  parseAction(): Action {
    const name = this.parseIdent();
    this.expectPunct("(");

    switch (name) {
      case "Log": {
        const text = this.parseString();
        this.expectPunct(")");
        return { type: "Log", text };
      }
      case "GiveItem": {
        const itemId = this.parseString();
        this.expectPunct(")");
        return { type: "GiveItem", itemId };
      }
      case "GiveItems": {
        let itemId = "", count = 1;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "item") itemId = this.parseString();
          else if (key === "count") count = this.parseNumber();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        return { type: "GiveItems", itemId, count };
      }
      case "RemoveItem": {
        const itemId = this.parseString();
        this.expectPunct(")");
        return { type: "RemoveItem", itemId };
      }
      case "RemoveItems": {
        // RemoveItems(item: "x", count: Some(2))  또는  RemoveItems(item: "x")
        let itemId = "";
        let count: number | undefined;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "item") itemId = this.parseString();
          else if (key === "count") {
            // Option<u32>: None / Some(n) / bare n (implicit_some).
            const t = this.peek();
            if (t?.kind === "ident" && t.val === "None") {
              this.parseIdent();
            } else if (t?.kind === "ident" && t.val === "Some") {
              this.parseIdent();
              this.expectPunct("(");
              count = this.parseNumber();
              this.expectPunct(")");
            } else {
              count = this.parseNumber();
            }
          }
          this.tryPunct(",");
        }
        this.expectPunct(")");
        const out: Extract<Action, { type: "RemoveItems" }> = { type: "RemoveItems", itemId };
        if (count !== undefined) out.count = count;
        return out;
      }
      case "TeleportToNpcHome": {
        // TeleportToNpcHome(npc_id: "elder")
        let npcId = "";
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "npc_id") npcId = this.parseString();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        return { type: "TeleportToNpcHome", npcId };
      }
      case "DespawnWorldItem": {
        const itemId = this.parseString();
        this.expectPunct(")");
        return { type: "DespawnWorldItem", itemId };
      }
      case "SetFlag": {
        this.expectIdent(); this.expectPunct(":"); const flag = this.parseString();
        this.tryPunct(",");
        this.expectIdent(); this.expectPunct(":"); const value = this.parseString();
        this.tryPunct(",");
        this.expectPunct(")");
        return { type: "SetFlag", flag, value };
      }
      case "ClearFlag": {
        const flag = this.parseString();
        this.expectPunct(")");
        return { type: "ClearFlag", flag };
      }
      case "KillNpc": {
        const npcId = this.parseString();
        this.expectPunct(")");
        return { type: "KillNpc", npcId };
      }
      case "OpenPortal": {
        let zone = "", generator = "";
        let placement: PortalPlacement | undefined;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "zone") zone = this.parseString();
          else if (key === "generator") generator = this.parseString();
          else if (key === "placement") placement = this.parsePlacement();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        const action: Extract<Action, { type: "OpenPortal" }> = { type: "OpenPortal", zone, generator };
        if (placement) action.placement = placement;
        return action;
      }
      case "ClosePortal": {
        const zone = this.parseString();
        this.expectPunct(")");
        return { type: "ClosePortal", zone };
      }
      case "OpenZonePortal": {
        // OpenZonePortal(target: <ZoneId>, placement?: <PortalPlacement>)
        let target: SpawnZone | undefined;
        let placement: PortalPlacement | undefined;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "target") target = this.parseSpawnZone();
          else if (key === "placement") placement = this.parsePlacement();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        if (!target) throw new Error("OpenZonePortal: target 필수");
        const action: Extract<Action, { type: "OpenZonePortal" }> = { type: "OpenZonePortal", target };
        if (placement) action.placement = placement;
        return action;
      }
      case "SpawnGuards": {
        let count = 1;
        let zone: SpawnZone | undefined;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "count") count = this.parseNumber();
          else if (key === "zone") zone = this.parseOptionalZone();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        const action: Extract<Action, { type: "SpawnGuards" }> = { type: "SpawnGuards", count };
        if (zone) action.zone = zone;
        return action;
      }
      case "PlaceTraps": {
        let kind: TrapKind = "Spike";
        let count = 1;
        // hidden 미지정 시 serde default = true (게임 측 default_trap_hidden)
        let hidden = true;
        let zone: SpawnZone | undefined;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "kind") kind = this.parseTrapKind();
          else if (key === "count") count = this.parseNumber();
          else if (key === "hidden") hidden = this.parseBool();
          else if (key === "zone") zone = this.parseOptionalZone();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        const action: Extract<Action, { type: "PlaceTraps" }> = { type: "PlaceTraps", kind, count, hidden };
        if (zone) action.zone = zone;
        return action;
      }
      case "Explode": {
        let radius = 0, entityDamage = 0;
        let terrain = false;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "radius") radius = this.parseNumber();
          else if (key === "terrain") terrain = this.parseBool();
          else if (key === "entity_damage") entityDamage = this.parseNumber();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        return { type: "Explode", radius, terrain, entityDamage };
      }
      case "SpawnMonster": {
        let monsterId = "", count = 1;
        let zone: SpawnZone | undefined;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "id") monsterId = this.parseString();
          else if (key === "count") count = this.parseNumber();
          else if (key === "zone") zone = this.parseOptionalZone();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        const action: Extract<Action, { type: "SpawnMonster" }> = { type: "SpawnMonster", monsterId, count };
        if (zone) action.zone = zone;
        return action;
      }
      default:
        throw new Error(`Unknown action: ${name}`);
    }
  }

  // ── PortalPlacement ──────────────────────────────────────────────────────

  parsePlacement(): PortalPlacement {
    const name = this.parseIdent();
    if (name === "InsideRoom" || name === "Border" || name === "Random") {
      return { type: name };
    }
    if (name === "NearGiver") {
      this.expectPunct("(");
      let radius = 0;
      while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
        const key = this.parseIdent();
        this.expectPunct(":");
        if (key === "radius") radius = this.parseNumber();
        this.tryPunct(",");
      }
      this.expectPunct(")");
      return { type: "NearGiver", radius };
    }
    throw new Error(`Unknown placement: ${name}`);
  }

  // ── Transition ─────────────────────────────────────────────────────────────

  /** `when:` 값을 파싱한다. bare 조건(implicit_some), Some(..), None 모두 수용. */
  parseWhenValue(): Condition | undefined {
    const t = this.peek();
    if (t?.kind === "ident" && (t.val === "Some" || t.val === "None")) {
      return this.parseOptionCondition();
    }
    return this.parseCondition();
  }

  parseTransition(): QuestTransition {
    let from = "";
    let to = "";
    let trigger: TriggerKind = "Interact";
    let triggerNpcId: string | undefined;
    let triggerItemId: string | undefined;
    let when: Condition | undefined;
    let actions: Action[] = [];

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "from":    from = this.parseString(); break;
        case "to":      to = this.parseString(); break;
        case "trigger": {
          // 변형 두 종류:
          //   1) bare ident: Interact / Auto
          //   2) 구조체: EnterNpcFov(npc_id: "x") / HoldingItemInNpcFov(npc_id: "x", item_id: "y")
          const v = this.parseIdent();
          if (v === "Interact" || v === "Auto") {
            trigger = v;
          } else if (v === "EnterNpcFov" || v === "HoldingItemInNpcFov") {
            trigger = v;
            this.expectPunct("(");
            while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
              const k = this.parseIdent();
              this.expectPunct(":");
              if (k === "npc_id") triggerNpcId = this.parseString();
              else if (k === "item_id") triggerItemId = this.parseString();
              this.tryPunct(",");
            }
            this.expectPunct(")");
          } else {
            throw new Error(`Unknown trigger: ${v}`);
          }
          break;
        }
        case "when":    when = this.parseWhenValue(); break;
        case "actions": actions = this.parseActionList(); break;
        default: break;
      }
      this.tryPunct(",");
    }

    const t: QuestTransition = { from, trigger, actions, to };
    if (when !== undefined) t.when = when;
    if (triggerNpcId !== undefined) t.triggerNpcId = triggerNpcId;
    if (triggerItemId !== undefined) t.triggerItemId = triggerItemId;
    return t;
  }

  // ── Spawn ─────────────────────────────────────────────────────────────────

  parseSpawnZone(): SpawnZone {
    const name = this.parseIdent();
    // 괄호 없는 단순 변형:
    //   - `Town` — 새 schema 의 유일한 정적 variant
    //   - `Forest` / `MountainVillage` / `SeasideHarbor` — 옛 schema 호환 (Named 로 변환)
    if (!(this.peek()?.kind === "punct" && this.peek()?.val === "(")) {
      if (name === "Town") return { type: "Town" };
      if (name === "Forest")          return { type: "Named", id: "forest" };
      if (name === "MountainVillage") return { type: "Named", id: "mountain_village" };
      if (name === "SeasideHarbor")   return { type: "Named", id: "seaside_harbor" };
      throw new Error(`Unknown bare zone: ${name}`);
    }
    this.expectPunct("(");
    if (name === "Dungeon") {
      // 옛 schema 호환 — `Dungeon(N)` → `Named("dungeon_N")`.
      const level = this.parseNumber();
      this.expectPunct(")");
      return { type: "Named", id: `dungeon_${level}` };
    }
    if (name === "Named") {
      const id = this.parseString();
      this.expectPunct(")");
      return { type: "Named", id };
    }
    throw new Error(`Unknown zone with params: ${name}`);
  }

  /**
   * `Option<ZoneId>` 파싱 — None / Some(<zone>) / (implicit_some 활성 시)<zone> 직접.
   *
   * - `None` → undefined
   * - `Some(Named("…"))` → { type: "Named", id: "…" }
   * - `Named("…")` (RON `#![enable(implicit_some)]`) → 직접 zone 파싱.
   *
   * 게임 측 QuestAction 의 zone 필드는 `Option<ZoneId>`(`#[serde(default)] None`).
   * 기존 RON 의 SpawnGuards/PlaceTraps/SpawnMonster 에 zone 필드 없는 경우는
   * 호출부에서 키 자체가 없으므로 이 함수가 호출되지 않는다.
   */
  parseOptionalZone(): SpawnZone | undefined {
    const tok = this.peek();
    if (tok?.kind === "ident" && tok.val === "None") {
      this.parseIdent();
      return undefined;
    }
    if (tok?.kind === "ident" && tok.val === "Some") {
      this.parseIdent();
      this.expectPunct("(");
      const zone = this.parseSpawnZone();
      this.expectPunct(")");
      return zone;
    }
    // implicit_some — zone 값이 바로 옴.
    return this.parseSpawnZone();
  }

  parseSpawn(): QuestSpawn {
    let phase = "", item = "";
    // 게임의 새 schema: Town | Named. 기본값은 dungeon_1 (가장 흔한 spawn zone).
    let zone: SpawnZone = { type: "Named", id: "dungeon_1" };
    let count: number | undefined;
    let condition: Condition | undefined;
    let landmark: HomeLandmark | undefined;

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "phase":     phase = this.parseString(); break;
        case "item":      item  = this.parseString(); break;
        case "zone":      zone  = this.parseSpawnZone(); break;
        case "count":     count = this.parseNumber(); break;
        case "condition": condition = this.parseOptionCondition(); break;
        case "landmark": {
          // Option<HomeLandmark> — None / Some(Market) / bare Market (implicit_some).
          const t = this.peek();
          if (t?.kind === "ident" && t.val === "None") {
            this.parseIdent();
          } else if (t?.kind === "ident" && t.val === "Some") {
            this.parseIdent();
            this.expectPunct("(");
            const lmPascal = this.parseIdent();
            landmark = lmPascal.toLowerCase() as HomeLandmark;
            this.expectPunct(")");
          } else {
            const lmPascal = this.parseIdent();
            landmark = lmPascal.toLowerCase() as HomeLandmark;
          }
          break;
        }
        default: break;
      }
      this.tryPunct(",");
    }
    const spawn: QuestSpawn = { phase, item, zone };
    if (count !== undefined) spawn.count = count;
    if (condition !== undefined) spawn.condition = condition;
    if (landmark !== undefined) spawn.landmark = landmark;
    return spawn;
  }

  // ── PhaseDef ──────────────────────────────────────────────────────────────

  parsePhaseDef(): QuestPhaseDef {
    const def: QuestPhaseDef = {
      dialog: [],
      objective: null,
    };

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");

      switch (key) {
        case "dialog":
          def.dialog = this.parseArray(() => this.parseString());
          break;
        case "objective":
          def.objective = this.parseOptionString();
          break;
        default:
          break;
      }
      this.tryPunct(",");
    }

    return def;
  }

  // ── QuestDef ──────────────────────────────────────────────────────────────

  parseQuest(): QuestDef {
    const name = this.parseIdent();
    if (name !== "QuestDef") throw new Error(`Expected QuestDef, got ${name}`);
    this.expectPunct("(");

    const quest: QuestDef = {
      id: "",
      title: "",
      giverNpc: "",
      initialPhase: "",
      phases: {},
      transitions: [],
      spawns: [],
    };

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");

      switch (key) {
        case "id":            quest.id           = this.parseString(); break;
        case "title":         quest.title        = this.parseString(); break;
        case "giver_npc":     quest.giverNpc     = this.parseString(); break;
        case "initial_phase": quest.initialPhase = this.parseString(); break;
        case "spawn_chance":  quest.spawnChance  = this.parseNumber(); break;
        case "phases": {
          this.expectPunct("{");
          while (!(this.peek()?.kind === "punct" && this.peek()?.val === "}")) {
            const phaseId = this.parseString();
            this.expectPunct(":");
            const phaseName = this.parseIdent();
            if (phaseName !== "QuestPhaseDef") throw new Error(`Expected QuestPhaseDef`);
            this.expectPunct("(");
            const phase = this.parsePhaseDef();
            this.expectPunct(")");
            quest.phases[phaseId] = phase;
            this.tryPunct(",");
          }
          this.expectPunct("}");
          break;
        }
        case "transitions":
          quest.transitions = this.parseArray(() => {
            const tname = this.parseIdent();
            if (tname !== "Transition") throw new Error(`Expected Transition, got ${tname}`);
            this.expectPunct("(");
            const t = this.parseTransition();
            this.expectPunct(")");
            return t;
          });
          break;
        case "spawns":
          quest.spawns = this.parseArray(() => {
            const sname = this.parseIdent();
            if (sname !== "QuestSpawn") throw new Error(`Expected QuestSpawn`);
            this.expectPunct("(");
            const s = this.parseSpawn();
            this.expectPunct(")");
            return s;
          });
          break;
        default:
          break;
      }
      this.tryPunct(",");
    }

    this.expectPunct(")");
    return quest;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function parseRon(src: string): QuestDef {
  const tokens = tokenize(src);
  const parser = new Parser(tokens);
  return parser.parseQuest();
}

export function parseVillagersRon(src: string): VillagerDef[] {
  const tokens = tokenize(src);
  const parser = new Parser(tokens);
  return parser.parseArray(() => parser.parseVillagerDef());
}

export function parseQuestItemsRon(src: string): Extract<ItemDef, { kind: "quest" }>[] {
  const parser = new Parser(tokenize(src));
  return parser.parseArray(() => parser.parseQuestItemDef());
}

export function parseWeaponsRon(src: string): Extract<ItemDef, { kind: "weapon" }>[] {
  const parser = new Parser(tokenize(src));
  return parser.parseArray(() => parser.parseWeaponDef());
}

export function parseArmorsRon(src: string): Extract<ItemDef, { kind: "armor" }>[] {
  const parser = new Parser(tokenize(src));
  return parser.parseArray(() => parser.parseArmorDef());
}

export function parseConsumablesRon(src: string): Extract<ItemDef, { kind: "consumable" }>[] {
  const parser = new Parser(tokenize(src));
  return parser.parseArray(() => parser.parseConsumableDef());
}

export function parseAccessoriesRon(src: string): Extract<ItemDef, { kind: "accessory" }>[] {
  const parser = new Parser(tokenize(src));
  return parser.parseArray(() => parser.parseAccessoryDef());
}

export function parseMonstersRon(src: string): MonsterDef[] {
  const parser = new Parser(tokenize(src));
  return parser.parseArray(() => parser.parseMonsterDef());
}

export function parseStartLoadoutDef(src: string): StartLoadoutDef {
  const parser = new Parser(tokenize(src));
  return parser.parseStartLoadout();
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

function ind(n: number) { return "    ".repeat(n); }
function q(s: string) {
  // RON 문자열 직렬화: ASCII 인쇄 가능 문자는 그대로, 비-ASCII 중에서도 BMP 바깥/
  // PUA(아이콘 폰트 영역) 처럼 가시성이 떨어지거나 깨지기 쉬운 코드포인트는 \u{XXXX}
  // 로 escape 한다. 인쇄 가능 한글/한자 등 일반 BMP 글리프는 그대로 두어 가독성 유지.
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    // PUA(E000~F8FF) 와 supplementary PUA(F0000+, 100000+) 는 escape 로 출력 →
    // 게임의 game-icons.net (PUA U+FF000~U+100005) 폰트 codepoint 가 안정 round-trip.
    else if (
      (cp >= 0xE000 && cp <= 0xF8FF) ||
      cp >= 0x10000 // 모든 supplementary plane (이모지 등) 도 escape
    ) {
      out += `\\u{${cp.toString(16).toUpperCase()}}`;
    }
    else {
      out += ch;
    }
  }
  out += '"';
  return out;
}

function serializeCondition(cond: Condition): string {
  switch (cond.type) {
    case "Always":  return "And([])";
    case "FlagIs":  return `FlagIs(flag: ${q(cond.flag)}, value: ${q(cond.value)})`;
    case "HasFlag": return `HasFlag(${q(cond.flag)})`;
    case "HasItem": return `HasItem(${q(cond.itemId)})`;
    case "PhaseIs": return `PhaseIs(quest: ${q(cond.quest)}, phase: ${q(cond.phase)})`;
    case "Not":     return `Not(${serializeCondition(cond.condition)})`;
    case "And":     return `And([${cond.conditions.map(serializeCondition).join(", ")}])`;
    case "Or":      return `Or([${cond.conditions.map(serializeCondition).join(", ")}])`;
    case "InZone":  return `InZone(${serializeZone(cond.zone)})`;
  }
}

function serializePlacement(p: PortalPlacement): string {
  switch (p.type) {
    case "InsideRoom":
    case "Border":
    case "Random":
      return p.type;
    case "NearGiver":
      return `NearGiver(radius: ${p.radius})`;
  }
}

function serializeAction(action: Action, depth: number): string {
  const i = ind(depth);
  switch (action.type) {
    case "Log":              return `${i}Log(${q(action.text)})`;
    case "GiveItem":         return `${i}GiveItem(${q(action.itemId)})`;
    case "GiveItems":        return `${i}GiveItems(item: ${q(action.itemId)}, count: ${action.count})`;
    case "RemoveItem":       return `${i}RemoveItem(${q(action.itemId)})`;
    case "RemoveItems": {
      const parts = [`item: ${q(action.itemId)}`];
      if (action.count !== undefined) parts.push(`count: Some(${action.count})`);
      return `${i}RemoveItems(${parts.join(", ")})`;
    }
    case "TeleportToNpcHome": return `${i}TeleportToNpcHome(npc_id: ${q(action.npcId)})`;
    case "DespawnWorldItem": return `${i}DespawnWorldItem(${q(action.itemId)})`;
    case "KillNpc":          return `${i}KillNpc(${q(action.npcId)})`;
    case "SetFlag":          return `${i}SetFlag(flag: ${q(action.flag)}, value: ${q(action.value)})`;
    case "ClearFlag":        return `${i}ClearFlag(${q(action.flag)})`;
    case "OpenPortal": {
      const parts = [`zone: ${q(action.zone)}`, `generator: ${q(action.generator)}`];
      if (action.placement) parts.push(`placement: ${serializePlacement(action.placement)}`);
      return `${i}OpenPortal(${parts.join(", ")})`;
    }
    case "OpenZonePortal": {
      // OpenZonePortal(target: <ZoneId>, placement?: <PortalPlacement>)
      // placement 미지정 시 게임 측 default = Border 가 적용된다. 명시되어 있으면 그대로 직렬화.
      const parts = [`target: ${serializeZone(action.target)}`];
      if (action.placement) parts.push(`placement: ${serializePlacement(action.placement)}`);
      return `${i}OpenZonePortal(${parts.join(", ")})`;
    }
    case "ClosePortal":      return `${i}ClosePortal(${q(action.zone)})`;
    case "SpawnGuards": {
      const parts = [`count: ${action.count}`];
      if (action.zone) parts.push(`zone: Some(${serializeZone(action.zone)})`);
      return `${i}SpawnGuards(${parts.join(", ")})`;
    }
    case "PlaceTraps": {
      const parts = [
        `kind: ${action.kind}`,
        `count: ${action.count}`,
        `hidden: ${action.hidden}`,
      ];
      if (action.zone) parts.push(`zone: Some(${serializeZone(action.zone)})`);
      return `${i}PlaceTraps(${parts.join(", ")})`;
    }
    case "Explode":          return `${i}Explode(radius: ${action.radius}, terrain: ${action.terrain}, entity_damage: ${action.entityDamage})`;
    case "SpawnMonster": {
      const parts = [`id: ${q(action.monsterId)}`, `count: ${action.count}`];
      if (action.zone) parts.push(`zone: Some(${serializeZone(action.zone)})`);
      return `${i}SpawnMonster(${parts.join(", ")})`;
    }
  }
}

function serializeZone(zone: SpawnZone): string {
  // 단순 schema: Town 만 bare, 나머지는 Named("...").
  if (zone.type === "Town") return "Town";
  return `Named(${q(zone.id)})`;
}

function serializePhase(phaseId: string, phase: QuestPhaseDef, depth: number): string {
  const i = ind(depth);
  const i1 = ind(depth + 1);
  const lines: string[] = [];

  lines.push(`${i}${q(phaseId)}: QuestPhaseDef(`);

  if (phase.dialog.length === 0) {
    lines.push(`${i1}dialog: [],`);
  } else {
    lines.push(`${i1}dialog: [`);
    for (const d of phase.dialog) lines.push(`${ind(depth + 2)}${q(d)},`);
    lines.push(`${i1}],`);
  }

  const obj = phase.objective == null ? "None" : `Some(${q(phase.objective)})`;
  lines.push(`${i1}objective: ${obj},`);

  lines.push(`${i}),`);
  return lines.join("\n");
}

function serializeTransition(t: QuestTransition, depth: number): string {
  const i = ind(depth);
  const i1 = ind(depth + 1);
  // 트리거 직렬화 — bare ident (Interact/Auto) 또는 구조체 (EnterNpcFov/HoldingItemInNpcFov).
  let triggerStr: string = t.trigger;
  if (t.trigger === "EnterNpcFov") {
    const npc = t.triggerNpcId ?? "";
    triggerStr = `EnterNpcFov(npc_id: ${q(npc)})`;
  } else if (t.trigger === "HoldingItemInNpcFov") {
    const npc = t.triggerNpcId ?? "";
    const item = t.triggerItemId ?? "";
    triggerStr = `HoldingItemInNpcFov(npc_id: ${q(npc)}, item_id: ${q(item)})`;
  }
  const head = `from: ${q(t.from)}, trigger: ${triggerStr}`;
  const whenPart = t.when ? `when: ${serializeCondition(t.when)}` : null;

  // actions 가 없으면 한 줄로
  if (t.actions.length === 0) {
    const parts = [head];
    if (whenPart) parts.push(whenPart);
    parts.push(`to: ${q(t.to)}`);
    return `${i}Transition(${parts.join(", ")}),`;
  }

  // actions 가 있으면 여러 줄
  const headParts = [head];
  if (whenPart) headParts.push(whenPart);
  const lines: string[] = [`${i}Transition(${headParts.join(", ")},`];
  lines.push(`${i1}actions: [`);
  for (const a of t.actions) lines.push(`${serializeAction(a, depth + 2)},`);
  lines.push(`${i1}],`);
  lines.push(`${i1}to: ${q(t.to)}),`);
  return lines.join("\n");
}

function serializeSpawn(s: QuestSpawn): string {
  const parts = [
    `phase: ${q(s.phase)}`,
    `item: ${q(s.item)}`,
    `zone: ${serializeZone(s.zone)}`,
  ];
  if (s.count !== undefined) parts.push(`count: ${s.count}`);
  if (s.condition !== undefined) parts.push(`condition: Some(${serializeCondition(s.condition)})`);
  if (s.landmark !== undefined) {
    // 게임 HomeLandmark enum 은 PascalCase (TS 는 kebab/lowercase).
    const pascal = s.landmark.charAt(0).toUpperCase() + s.landmark.slice(1);
    parts.push(`landmark: Some(${pascal})`);
  }
  return `        QuestSpawn(${parts.join(", ")}),`;
}

function serializeVillagerDef(v: VillagerDef): string {
  const lines: string[] = [];
  lines.push(`    VillagerDef(`);
  lines.push(`        id: ${q(v.id)},`);
  lines.push(`        name: ${q(v.name)},`);
  lines.push(`        color: (${v.color[0]}, ${v.color[1]}, ${v.color[2]}),`);
  // stationary/vendor 는 게임 측 #[serde(default)] 와 호환을 위해 true 일 때만 출력.
  // false(기본값)는 생략 → 기존 .ron 텍스트와 동일 형태 유지.
  if (v.stationary) lines.push(`        stationary: true,`);
  if (v.vendor)     lines.push(`        vendor: true,`);
  if (v.dialogs.length === 0) {
    lines.push(`        dialogs: [],`);
  } else {
    lines.push(`        dialogs: [`);
    for (const d of v.dialogs) lines.push(`            ${q(d)},`);
    lines.push(`        ],`);
  }
  lines.push(`        speed: ${v.speed},`);
  // home_zone — 기본 `Town` 은 생략(`#[serde(default)]` 와 호환). 그 외는 명시.
  if (v.homeZone && v.homeZone.type !== "Town") {
    lines.push(`        home_zone: ${serializeZone(v.homeZone)},`);
  }
  // home_landmark — 기본 `Random` 은 생략(게임 측 #[serde(default)] 미러).
  // 그 외 14 값은 PascalCase enum 으로 명시:
  //   Road/Inn/Smithy/Temple/Guard/Market/Manor/Tavern/Herbalist/Graveyard/
  //   Jail/Guild/Alchemist/Docks.
  if (v.homeLandmark && v.homeLandmark !== "random") {
    const pascal = v.homeLandmark.charAt(0).toUpperCase() + v.homeLandmark.slice(1);
    lines.push(`        home_landmark: ${pascal},`);
  }
  // free_roam — 기본 false 는 생략(게임 측 #[serde(default)] 미러). true 만 출력.
  if (v.freeRoam) lines.push(`        free_roam: true,`);
  lines.push(`    ),`);
  return lines.join("\n");
}

export function serializeVillagersRon(villagers: VillagerDef[]): string {
  if (villagers.length === 0) return "[]\n";
  const lines = ["["];
  for (const v of villagers) lines.push(serializeVillagerDef(v));
  lines.push("]");
  return lines.join("\n") + "\n";
}

// ── Monster serializer ───────────────────────────────────────────────────────

function serializeMonsterDef(m: MonsterDef): string {
  const lines: string[] = [];
  lines.push(`    MonsterDef(`);
  lines.push(`        id: ${q(m.id)},`);
  lines.push(`        display_name: ${q(m.displayName)},`);
  lines.push(`        glyph: ${q(m.glyph)},`);
  lines.push(`        color: (${m.color[0]}, ${m.color[1]}, ${m.color[2]}),`);
  lines.push(`        hp: ${m.hp},`);
  lines.push(`        attack: ${m.attack},`);
  lines.push(`        defense: ${m.defense},`);
  lines.push(`        vision_radius: ${m.visionRadius},`);
  lines.push(`        speed: ${m.speed},`);
  lines.push(`        element: ${m.element == null ? "None" : `Some(${q(m.element)})`},`);
  lines.push(`        spawn_weight: ${m.spawnWeight},`);
  if (m.zones.length === 0) {
    lines.push(`        zones: [],`);
  } else {
    lines.push(`        zones: [${m.zones.map(serializeZone).join(", ")}],`);
  }
  const cond = m.spawnCondition === undefined
    ? "None"
    : `Some(${serializeCondition(m.spawnCondition)})`;
  lines.push(`        spawn_condition: ${cond},`);
  lines.push(`        quest_only: ${m.questOnly},`);
  lines.push(`    ),`);
  return lines.join("\n");
}

export function serializeMonstersRon(monsters: MonsterDef[]): string {
  if (monsters.length === 0) return "[]\n";
  const lines = ["["];
  for (const m of monsters) lines.push(serializeMonsterDef(m));
  lines.push("]");
  return lines.join("\n") + "\n";
}

// ── Item serializers (4 종) ──────────────────────────────────────────────────

function serializeItemCommon(item: ItemDef): string[] {
  const lines = [
    `        id: ${q(item.id)},`,
    `        display_name: ${q(item.displayName)},`,
    `        glyph_ascii: ${q(item.glyphAscii)},`,
    `        glyph_game_icon: ${q(item.glyphGameIcon)},`,
    `        pickup_message: ${q(item.pickupMessage)},`,
  ];
  // hidden 기본값(false/누락) 은 생략 — 게임 측 #[serde(default)] 미러.
  if (item.hidden) lines.push(`        hidden: true,`);
  return lines;
}

function arrayWrap(structName: string, lines: string[][]): string {
  if (lines.length === 0) return "[]\n";
  const out = ["["];
  for (const inner of lines) {
    out.push(`    ${structName}(`);
    out.push(...inner);
    out.push(`    ),`);
  }
  out.push("]");
  return out.join("\n") + "\n";
}

export function serializeQuestItemsRon(items: Extract<ItemDef, { kind: "quest" }>[]): string {
  return arrayWrap("QuestItemDef", items.map((i) => [
    ...serializeItemCommon(i),
    `        image_path: ${q(i.imagePath)},`,
  ]));
}

export function serializeWeaponsRon(items: Extract<ItemDef, { kind: "weapon" }>[]): string {
  return arrayWrap("WeaponDef", items.map((i) => {
    // 게임 RON 형식과 일치: random-stat 모드(min/max + tier) 가 있으면 그것을,
    // 없으면 단일값(attack_power) 형식만 출력 → round-trip 보존.
    const hasRandom = i.attackPowerMin !== undefined && i.attackPowerMax !== undefined;
    const lines = [...serializeItemCommon(i)];
    if (hasRandom) {
      lines.push(`        attack_power_min: ${i.attackPowerMin},`);
      lines.push(`        attack_power_max: ${i.attackPowerMax},`);
      if (i.tier !== undefined) lines.push(`        tier: ${i.tier},`);
    } else {
      lines.push(`        attack_power: ${i.attackPower},`);
      if (i.tier !== undefined) lines.push(`        tier: ${i.tier},`);
    }
    lines.push(`        element: ${i.element == null ? "None" : `Some(${q(i.element)})`},`);
    return lines;
  }));
}

export function serializeArmorsRon(items: Extract<ItemDef, { kind: "armor" }>[]): string {
  return arrayWrap("ArmorDef", items.map((i) => {
    const hasRandom = i.defenseBonusMin !== undefined && i.defenseBonusMax !== undefined;
    const lines = [...serializeItemCommon(i)];
    if (hasRandom) {
      lines.push(`        defense_bonus_min: ${i.defenseBonusMin},`);
      lines.push(`        defense_bonus_max: ${i.defenseBonusMax},`);
      if (i.tier !== undefined) lines.push(`        tier: ${i.tier},`);
    } else {
      lines.push(`        defense_bonus: ${i.defenseBonus},`);
      if (i.tier !== undefined) lines.push(`        tier: ${i.tier},`);
    }
    return lines;
  }));
}

export function serializeConsumablesRon(items: Extract<ItemDef, { kind: "consumable" }>[]): string {
  return arrayWrap("ConsumableDef", items.map((i) => [
    ...serializeItemCommon(i),
    `        effect: ${i.effect.type}(${i.effect.amount}),`,
  ]));
}

export function serializeAccessoriesRon(items: Extract<ItemDef, { kind: "accessory" }>[]): string {
  return arrayWrap("AccessoryDef", items.map((i) => {
    const lines = [
      ...serializeItemCommon(i),
      `        desc: ${q(i.desc)},`,
    ];
    // effects 가 정의돼 있을 때만 직렬화 — undefined 면 빈 키도 안 적어서 round-trip 안정.
    if (i.effects !== undefined) {
      lines.push(`        effects: [${i.effects.join(", ")}],`);
    }
    return lines;
  }));
}

/**
 * StartLoadout 직렬화 — 게임의 assets/items/start_loadout.ron 과 round-trip 호환.
 * - weapon/armor: None / Some("x") 형식.
 * - consumables: ("id", count) 튜플 형식.
 * - items 가 비어있어도 [] 로 명시.
 */
export function serializeStartLoadoutRon(def: StartLoadoutDef): string {
  const lines: string[] = [];
  lines.push(`StartLoadout(`);
  lines.push(`    gold: ${def.gold},`);
  lines.push(`    weapon: ${def.weapon == null ? "None" : `Some(${q(def.weapon)})`},`);
  lines.push(`    armor: ${def.armor == null ? "None" : `Some(${q(def.armor)})`},`);
  if (def.items.length === 0) {
    lines.push(`    items: [],`);
  } else {
    lines.push(`    items: [${def.items.map(q).join(", ")}],`);
  }
  if (def.consumables.length === 0) {
    lines.push(`    consumables: [],`);
  } else {
    const tuples = def.consumables.map((c) => `(${q(c.id)}, ${c.count})`).join(", ");
    lines.push(`    consumables: [${tuples}],`);
  }
  lines.push(`)`);
  return lines.join("\n") + "\n";
}

/**
 * TownConfig → RON 직렬화 (시작 마을 ZoneId::Town 생성 옵션).
 * 게임 측 `TownOptions` 와 1:1 매핑. enum 변환:
 *   kebab-case (TS) → PascalCase (Rust enum variants).
 *
 * 예:
 *   TownOptions(
 *       size: Village,
 *       roads: Radial,
 *       wealth: Common,
 *       defenses: None,
 *       landmarks: [Inn, Smithy],
 *       fields: true,
 *       environment: Plains,
 *   )
 */
export function serializeTownConfigRon(def: TownConfig): string {
  const pascal = (s: string): string =>
    s.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");

  // environment 는 신규 필드 — 누락 시 기본 Plains (하위 호환).
  const env: TownEnvironment = def.environment ?? "plains";

  const lines: string[] = [];
  lines.push(`TownOptions(`);
  lines.push(`    size: ${pascal(def.size)},`);
  lines.push(`    roads: ${pascal(def.roads)},`);
  lines.push(`    wealth: ${pascal(def.wealth)},`);
  lines.push(`    defenses: ${pascal(def.defenses)},`);
  if (def.landmarks.length === 0) {
    lines.push(`    landmarks: [],`);
  } else {
    lines.push(`    landmarks: [${def.landmarks.map(pascal).join(", ")}],`);
  }
  lines.push(`    fields: ${def.fields ? "true" : "false"},`);
  lines.push(`    environment: ${pascal(env)},`);
  lines.push(`)`);
  return lines.join("\n") + "\n";
}

export function serializeRon(quest: QuestDef): string {
  const lines: string[] = [];

  // when/objective 을 Some() 없이 표기하기 위한 RON 확장 directive
  lines.push(`#![enable(implicit_some)]`);
  lines.push(``);
  lines.push(`QuestDef(`);
  lines.push(`    id: ${q(quest.id)},`);
  lines.push(`    title: ${q(quest.title)},`);
  lines.push(`    giver_npc: ${q(quest.giverNpc)},`);
  lines.push(`    initial_phase: ${q(quest.initialPhase)},`);
  if (quest.spawnChance !== undefined) {
    lines.push(`    spawn_chance: ${quest.spawnChance},`);
  }
  lines.push(``);
  lines.push(`    phases: {`);
  lines.push(``);

  for (const [phaseId, phase] of Object.entries(quest.phases)) {
    lines.push(serializePhase(phaseId, phase, 2));
    lines.push(``);
  }

  lines.push(`    },`);
  lines.push(``);

  if (quest.transitions.length === 0) {
    lines.push(`    transitions: [],`);
  } else {
    lines.push(`    transitions: [`);
    for (const t of quest.transitions) lines.push(serializeTransition(t, 2));
    lines.push(`    ],`);
  }
  lines.push(``);

  if (quest.spawns.length === 0) {
    lines.push(`    spawns: [],`);
  } else {
    lines.push(`    spawns: [`);
    for (const s of quest.spawns) lines.push(serializeSpawn(s));
    lines.push(`    ],`);
  }

  lines.push(`)`);
  return lines.join("\n");
}
