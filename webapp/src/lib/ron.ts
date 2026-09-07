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
    // a line comment
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    // a RON extension directive (#![enable(implicit_some)], say) - skip the line
    if (src[i] === "#") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    // whitespace
    if (/\s/.test(src[i])) { i++; continue; }
    // a string
    // Rust/RON-compatible escape handling:
    //   \n \r \t \\ \" \0  -> the standard escapes
    //   \x7F                -> 8-bit hex (Rust-compatible, safe only up to 0x7F)
    //   \u{XXXX} / \u{XXXXXX} -> a Unicode code point (used by the game RON's glyph_game_icon)
    //   any other \?         -> the ? as is (kept for backwards compatibility)
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
            // \xHH (2 hex digits)
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
            // \u{XXXX} - 1 to 6 hex digits
            const end = src.indexOf("}", i + 2);
            if (end >= 0) {
              const hex = src.slice(i + 2, end);
              const cp = parseInt(hex, 16);
              if (/^[0-9a-fA-F]{1,6}$/.test(hex) && Number.isFinite(cp) && cp <= 0x10FFFF) {
                s += String.fromCodePoint(cp);
                i = end + 1;
              } else {
                // a malformed form - the escape is preserved as is
                s += esc;
                i++;
              }
            } else {
              s += esc;
              i++;
            }
          }
          else {
            // an unknown escape - only the escaped character is kept (matching the previous behaviour)
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
    // identifiers and keywords
    if (/[a-zA-Z_]/.test(src[i])) {
      let s = "";
      while (i < src.length && /[\w]/.test(src[i])) s += src[i++];
      tokens.push({ kind: "ident", val: s });
      continue;
    }
    // numbers (negatives and decimals included)
    if (/[0-9]/.test(src[i]) || (src[i] === "-" && /[0-9]/.test(src[i + 1] ?? ""))) {
      let s = "";
      if (src[i] === "-") s += src[i++];
      while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
      tokens.push({ kind: "num", val: Number(s) });
      continue;
    }
    // punctuation
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
    // implicit_some: a bare string is accepted too
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

  // ── ItemDef (4 kinds) ────────────────────────────────────────────────────────

  // Fills the shared fields into the def object and delegates unhandled keys to the callback
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
        // Backwards compatibility: an old RON's glyph_unicode key is consumed silently (its value discarded).
        // It was removed from every RON after the migration, but cached old data is absorbed safely.
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
    // fallback: with only one of the two present the other is inferred -> round-trip safe
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
  // The game's Rust StartLoadout: { gold: u32, weapon: Option<String>, armor: Option<String>,
  //                             items: Vec<String>, consumables: Vec<(String, u32)> }
  // The implicit_some directive may or may not be present, so both are accepted.

  /** An (id, count) tuple in the `("health_potion", 10)` form. */
  parseConsumableTuple(): { id: string; count: number } {
    this.expectPunct("(");
    const id = this.parseString();
    this.tryPunct(",");
    const count = this.parseNumber();
    this.tryPunct(",");
    this.expectPunct(")");
    return { id, count };
  }

  /** weapon/armor's Option<String> - None, Some("x"), or a bare "x" (implicit_some). */
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
        // Backwards compatibility: the old form's quest_id is consumed and ignored
        case "quest_id":   this.parseOptionString(); break;
        case "speed":      def.speed      = this.parseNumber(); break;
        case "stationary": def.stationary = this.parseBool(); break;
        case "vendor":     def.vendor     = this.parseBool(); break;
        // home_zone - the same RON encoding as the game's ZoneId (reusing parseSpawnZone).
        // Absent defaults to Town (mirroring the game's #[serde(default)]).
        case "home_zone":  def.homeZone   = this.parseSpawnZone(); break;
        // home_landmark — PascalCase enum (Random/Road/Inn/Smithy/Temple/Guard/
        // Market/Manor). Absent defaults to "random" (mirroring the game's #[serde(default)]).
        case "home_landmark": def.homeLandmark = this.parseHomeLandmark(); break;
        // free_roam - a bool. Absent defaults to false (mirroring the game's #[serde(default)]).
        case "free_roam":  def.freeRoam   = this.parseBool(); break;
        // vendor_vision_radius - Option<u32>. None, Some(N) and absent are all accepted.
        // Absent mirrors the game's #[serde(default) None] - left as undefined.
        case "vendor_vision_radius": {
          const t = this.peek();
          if (t?.kind === "ident" && t.val === "None") {
            this.parseIdent();
            // undefined 으로 두어 export 시 다시 누락 처리.
          } else if (t?.kind === "ident" && t.val === "Some") {
            this.parseIdent();
            this.expectPunct("(");
            def.vendorVisionRadius = this.parseNumber();
            this.expectPunct(")");
          } else {
            // implicit_some - a bare number N becomes Some(N).
            def.vendorVisionRadius = this.parseNumber();
          }
          break;
        }
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

  /** Some("fire") | None - the monster's element (poison included). */
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
   * The HomeLandmark enum - a bare ident (Random | Road | Inn | Smithy | Temple |
   * Guard | Market | Manor). It maps the game's PascalCase to TS lowercase.
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
        // RemoveItems(item: "x", count: Some(2))  or  RemoveItems(item: "x")
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
        // With hidden unspecified, serde's default is true (the game's default_trap_hidden)
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
      case "SpawnItem": {
        // SpawnItem(item_id: "x", zone: Some(...), landmark: Some(Market),
        //            vendor_distance_min: Some(2), count: Some(1))
        // Every optional field accepts None, Some, implicit_some and bare alike.
        let itemId = "";
        let zone: SpawnZone | undefined;
        let landmark: HomeLandmark | undefined;
        let vendorDistanceMin: number | undefined;
        let count: number | undefined;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "item_id") {
            itemId = this.parseString();
          } else if (key === "zone") {
            zone = this.parseOptionalZone();
          } else if (key === "landmark") {
            // landmark: Option<HomeLandmark>. None / Some(PascalCase) / bare PascalCase.
            const t = this.peek();
            if (t?.kind === "ident" && t.val === "None") {
              this.parseIdent();
            } else if (t?.kind === "ident" && t.val === "Some") {
              this.parseIdent();
              this.expectPunct("(");
              landmark = this.parseHomeLandmark();
              this.expectPunct(")");
            } else {
              landmark = this.parseHomeLandmark();
            }
          } else if (key === "vendor_distance_min" || key === "count") {
            // Option<u32>: None / Some(n) / bare n.
            const t = this.peek();
            let n: number | undefined;
            if (t?.kind === "ident" && t.val === "None") {
              this.parseIdent();
            } else if (t?.kind === "ident" && t.val === "Some") {
              this.parseIdent();
              this.expectPunct("(");
              n = this.parseNumber();
              this.expectPunct(")");
            } else {
              n = this.parseNumber();
            }
            if (key === "vendor_distance_min") vendorDistanceMin = n;
            else count = n;
          }
          this.tryPunct(",");
        }
        this.expectPunct(")");
        const action: Extract<Action, { type: "SpawnItem" }> = { type: "SpawnItem", itemId };
        if (zone !== undefined) action.zone = zone;
        if (landmark !== undefined) action.landmark = landmark;
        if (vendorDistanceMin !== undefined) action.vendorDistanceMin = vendorDistanceMin;
        if (count !== undefined) action.count = count;
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

  /** Parses a `when:` value. A bare condition (implicit_some), Some(..) and None are all accepted. */
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
          // Two variant shapes:
          //   1) bare ident: Interact / Auto
          //   2) a struct: EnterNpcFov(npc_id: "x") / HoldingItemInNpcFov(npc_id: "x", item_id: "y")
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
    // Simple variants without parentheses:
    //   - `Town` - the new schema's only static variant
    //   - `Forest` / `MountainVillage` / `SeasideHarbor` - old-schema compatibility (converted to Named)
    if (!(this.peek()?.kind === "punct" && this.peek()?.val === "(")) {
      if (name === "Town") return { type: "Town" };
      if (name === "Forest")          return { type: "Named", id: "forest" };
      if (name === "MountainVillage") return { type: "Named", id: "mountain_village" };
      if (name === "SeasideHarbor")   return { type: "Named", id: "seaside_harbor" };
      throw new Error(`Unknown bare zone: ${name}`);
    }
    this.expectPunct("(");
    if (name === "Dungeon") {
      // Old-schema compatibility - `Dungeon(N)` -> `Named("dungeon_N")`.
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
   * Parses an `Option<ZoneId>` - None, Some(<zone>), or (with implicit_some enabled) the <zone> directly.
   *
   * - `None` -> undefined
   * - `Some(Named("…"))` -> { type: "Named", id: "…" }
   * - `Named("…")` (RON `#![enable(implicit_some)]`) -> parsed as a zone directly.
   *
   * The zone field on the game's QuestAction is `Option<ZoneId>` (`#[serde(default)] None`).
   * When an existing RON's SpawnGuards/PlaceTraps/SpawnMonster has no zone field, the caller has no key at all and
   * this function is never called.
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
    // implicit_some - the zone value arrives directly.
    return this.parseSpawnZone();
  }

  parseSpawn(): QuestSpawn {
    let phase = "", item = "";
    // The game's new schema: Town | Named. The default is dungeon_1 (the commonest spawn zone).
    let zone: SpawnZone = { type: "Named", id: "dungeon_1" };
    let count: number | undefined;
    let condition: Condition | undefined;
    let landmark: HomeLandmark | undefined;
    let vendorDistanceMin: number | undefined;

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
        case "vendor_distance_min": {
          // Option<u32> — None / Some(N) / bare N (implicit_some).
          const t = this.peek();
          if (t?.kind === "ident" && t.val === "None") {
            this.parseIdent();
          } else if (t?.kind === "ident" && t.val === "Some") {
            this.parseIdent();
            this.expectPunct("(");
            vendorDistanceMin = this.parseNumber();
            this.expectPunct(")");
          } else {
            vendorDistanceMin = this.parseNumber();
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
    if (vendorDistanceMin !== undefined) spawn.vendorDistanceMin = vendorDistanceMin;
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
  // RON string serialisation: printable ASCII is kept as is, while non-ASCII code points that are hard to see or
  // easily mangled - outside the BMP, or in the PUA (the icon font's range) - are escaped as \u{XXXX}.
  // Ordinary printable BMP glyphs such as Hangul and hanja stay as they are, keeping it readable.
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
      cp >= 0x10000 // every supplementary plane (emoji and so on) is escaped too
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
      // With placement unspecified the game's default of Border applies. When stated, it is serialised as is.
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
    case "SpawnItem": {
      // SpawnItem(item_id: "x", zone: Some(...), landmark: Some(Market),
      //            vendor_distance_min: Some(2), count: Some(1))
      const parts = [`item_id: ${q(action.itemId)}`];
      if (action.zone) parts.push(`zone: Some(${serializeZone(action.zone)})`);
      if (action.landmark !== undefined) {
        const pascal = action.landmark.charAt(0).toUpperCase() + action.landmark.slice(1);
        parts.push(`landmark: Some(${pascal})`);
      }
      if (action.vendorDistanceMin !== undefined) {
        parts.push(`vendor_distance_min: Some(${action.vendorDistanceMin})`);
      }
      if (action.count !== undefined) {
        parts.push(`count: Some(${action.count})`);
      }
      return `${i}SpawnItem(${parts.join(", ")})`;
    }
  }
}

function serializeZone(zone: SpawnZone): string {
  // The simple schema: only Town is bare, everything else is Named("...").
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
  // Trigger serialisation - a bare ident (Interact/Auto) or a struct (EnterNpcFov/HoldingItemInNpcFov).
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

  // on one line when there are no actions
  if (t.actions.length === 0) {
    const parts = [head];
    if (whenPart) parts.push(whenPart);
    parts.push(`to: ${q(t.to)}`);
    return `${i}Transition(${parts.join(", ")}),`;
  }

  // across several lines when there are actions
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
    // The game's HomeLandmark enum is PascalCase (TS uses kebab/lowercase).
    const pascal = s.landmark.charAt(0).toUpperCase() + s.landmark.slice(1);
    parts.push(`landmark: Some(${pascal})`);
  }
  if (s.vendorDistanceMin !== undefined) {
    parts.push(`vendor_distance_min: Some(${s.vendorDistanceMin})`);
  }
  return `        QuestSpawn(${parts.join(", ")}),`;
}

function serializeVillagerDef(v: VillagerDef): string {
  const lines: string[] = [];
  lines.push(`    VillagerDef(`);
  lines.push(`        id: ${q(v.id)},`);
  lines.push(`        name: ${q(v.name)},`);
  lines.push(`        color: (${v.color[0]}, ${v.color[1]}, ${v.color[2]}),`);
  // stationary/vendor are emitted only when true, for compatibility with the game's #[serde(default)].
  // false (the default) is omitted, keeping the same shape as the existing .ron text.
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
  // home_zone - the default `Town` is omitted (compatible with `#[serde(default)]`). Anything else is stated.
  if (v.homeZone && v.homeZone.type !== "Town") {
    lines.push(`        home_zone: ${serializeZone(v.homeZone)},`);
  }
  // home_landmark - the default `Random` is omitted (mirroring the game's #[serde(default)]).
  // The other 14 values are stated as PascalCase enum variants:
  //   Road/Inn/Smithy/Temple/Guard/Market/Manor/Tavern/Herbalist/Graveyard/
  //   Jail/Guild/Alchemist/Docks.
  if (v.homeLandmark && v.homeLandmark !== "random") {
    const pascal = v.homeLandmark.charAt(0).toUpperCase() + v.homeLandmark.slice(1);
    lines.push(`        home_landmark: ${pascal},`);
  }
  // free_roam - the default false is omitted (mirroring the game's #[serde(default)]). Only true is emitted.
  if (v.freeRoam) lines.push(`        free_roam: true,`);
  // vendor_vision_radius - Option<u32>. None (or null/undefined) is omitted (mirroring the game's
  // #[serde(default) None]). Only a stated value is emitted as Some(N).
  if (v.vendorVisionRadius !== undefined && v.vendorVisionRadius !== null) {
    lines.push(`        vendor_vision_radius: Some(${v.vendorVisionRadius}),`);
  }
  // vendor_inventory - Option<Vec<String>>. The game's SHOP_CATALOG fallback has to be distinguished from an
  // explicitly empty shop ([]), so only undefined is omitted and [] is emitted explicitly as Some([]).
  //   undefined -> the key is omitted -> the game's SHOP_CATALOG fallback (phase 2)
  //   []        -> Some([])          -> an explicitly empty shop
  //   [...]     -> Some([…])         -> only those ids are sold
  if (v.vendorInventory !== undefined) {
    const ids = v.vendorInventory.map((id) => q(id)).join(", ");
    lines.push(`        vendor_inventory: Some([${ids}]),`);
  }
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

// ── Item serializers (4 kinds) ──────────────────────────────────────────────────

function serializeItemCommon(item: ItemDef): string[] {
  const lines = [
    `        id: ${q(item.id)},`,
    `        display_name: ${q(item.displayName)},`,
    `        glyph_ascii: ${q(item.glyphAscii)},`,
    `        glyph_game_icon: ${q(item.glyphGameIcon)},`,
    `        pickup_message: ${q(item.pickupMessage)},`,
  ];
  // The default hidden (false or absent) is omitted - mirroring the game's #[serde(default)].
  if (item.hidden) lines.push(`        hidden: true,`);
  return lines;
}

/**
 * Serialises the shop price fields (buyPrice/sellPrice). Shared by every kind.
 * undefined/null -> the key is omitted (mirroring the game's `#[serde(default)] None`).
 * An integer -> emitted as `Some(N)`.
 *
 * It is a separate function so every kind's serializer can append it in the same form at its shared tail.
 */
function serializeShopPriceLines(item: ItemDef): string[] {
  const out: string[] = [];
  if (item.buyPrice !== undefined && item.buyPrice !== null) {
    out.push(`        buy_price: Some(${item.buyPrice}),`);
  }
  if (item.sellPrice !== undefined && item.sellPrice !== null) {
    out.push(`        sell_price: Some(${item.sellPrice}),`);
  }
  return out;
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
    ...serializeShopPriceLines(i),
  ]));
}

export function serializeWeaponsRon(items: Extract<ItemDef, { kind: "weapon" }>[]): string {
  return arrayWrap("WeaponDef", items.map((i) => {
    // Matches the game's RON form: emit the random-stat mode (min/max plus tier) when it exists,
    // and otherwise only the single-value form (attack_power) -> round-trip preserving.
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
    lines.push(...serializeShopPriceLines(i));
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
    lines.push(...serializeShopPriceLines(i));
    return lines;
  }));
}

export function serializeConsumablesRon(items: Extract<ItemDef, { kind: "consumable" }>[]): string {
  return arrayWrap("ConsumableDef", items.map((i) => [
    ...serializeItemCommon(i),
    `        effect: ${i.effect.type}(${i.effect.amount}),`,
    ...serializeShopPriceLines(i),
  ]));
}

export function serializeAccessoriesRon(items: Extract<ItemDef, { kind: "accessory" }>[]): string {
  return arrayWrap("AccessoryDef", items.map((i) => {
    const lines = [
      ...serializeItemCommon(i),
      `        desc: ${q(i.desc)},`,
    ];
    // effects is serialised only when defined - undefined writes no empty key either, so round trips stay stable.
    if (i.effects !== undefined) {
      lines.push(`        effects: [${i.effects.join(", ")}],`);
    }
    lines.push(...serializeShopPriceLines(i));
    return lines;
  }));
}

/**
 * StartLoadout serialisation - round-trip compatible with the game's assets/items/start_loadout.ron.
 * - weapon/armor: the None / Some("x") form.
 * - consumables: the ("id", count) tuple form.
 * - items is stated as [] even when empty.
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
 * TownConfig -> RON serialisation (the generation options for the starting town, ZoneId::Town).
 * A 1:1 mapping with the game's `TownOptions`. Enum conversion:
 *   kebab-case (TS) -> PascalCase (Rust enum variants).
 *
 * For example:
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

  // environment is a new field - absent defaults to Plains (backwards compatible).
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

  // The RON extension directive that lets when/objective be written without Some()
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
