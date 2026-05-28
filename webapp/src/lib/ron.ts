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
import type { VillagerDef } from "@/types/villager";
import type { ItemDef, ConsumableEffect, WeaponElement } from "@/types/item";
import type { MonsterDef, MonsterElement } from "@/types/monster";
import type { StartLoadoutDef } from "@/types/start-loadout";

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
    if (src[i] === '"') {
      let s = "";
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") { i++; s += src[i]; }
        else s += src[i];
        i++;
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
    glyphAscii: string; glyphUnicode: string; glyphGameIcon: string;
    pickupMessage: string;
  } {
    let id = "", displayName = "", glyphAscii = "", glyphUnicode = "",
      glyphGameIcon = "", pickupMessage = "";

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "id":              id = this.parseString(); break;
        case "display_name":    displayName = this.parseString(); break;
        case "glyph_ascii":     glyphAscii = this.parseString(); break;
        case "glyph_unicode":   glyphUnicode = this.parseString(); break;
        case "glyph_game_icon": glyphGameIcon = this.parseString(); break;
        case "pickup_message":  pickupMessage = this.parseString(); break;
        default:
          if (!handleKindKey(key)) throw new Error(`Unknown item field: ${key}`);
      }
      this.tryPunct(",");
    }
    return { id, displayName, glyphAscii, glyphUnicode, glyphGameIcon, pickupMessage };
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
    const common = this.parseItemCommon((key) => {
      if (key === "desc") { desc = this.parseString(); return true; }
      return false;
    });
    this.expectPunct(")");
    return { kind: "accessory", ...common, desc };
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
      case "SpawnGuards": {
        let count = 1;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "count") count = this.parseNumber();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        return { type: "SpawnGuards", count };
      }
      case "PlaceTraps": {
        let kind: TrapKind = "Spike";
        let count = 1;
        // hidden 미지정 시 serde default = true (게임 측 default_trap_hidden)
        let hidden = true;
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "kind") kind = this.parseTrapKind();
          else if (key === "count") count = this.parseNumber();
          else if (key === "hidden") hidden = this.parseBool();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        return { type: "PlaceTraps", kind, count, hidden };
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
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          if (key === "id") monsterId = this.parseString();
          else if (key === "count") count = this.parseNumber();
          this.tryPunct(",");
        }
        this.expectPunct(")");
        return { type: "SpawnMonster", monsterId, count };
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
    let when: Condition | undefined;
    let actions: Action[] = [];

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "from":    from = this.parseString(); break;
        case "to":      to = this.parseString(); break;
        case "trigger": {
          const v = this.parseIdent();
          if (v !== "Interact" && v !== "Auto") throw new Error(`Unknown trigger: ${v}`);
          trigger = v;
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
    return t;
  }

  // ── Spawn ─────────────────────────────────────────────────────────────────

  parseSpawnZone(): SpawnZone {
    const name = this.parseIdent();
    // 괄호 없는 단순 변형: Town | Forest
    if (!(this.peek()?.kind === "punct" && this.peek()?.val === "(")) {
      if (name === "Town" || name === "Forest") return { type: name };
      throw new Error(`Unknown bare zone: ${name}`);
    }
    this.expectPunct("(");
    if (name === "Dungeon") {
      const level = this.parseNumber();
      this.expectPunct(")");
      return { type: "Dungeon", level };
    }
    if (name === "Named") {
      const id = this.parseString();
      this.expectPunct(")");
      return { type: "Named", id };
    }
    throw new Error(`Unknown zone with params: ${name}`);
  }

  parseSpawn(): QuestSpawn {
    let phase = "", item = "";
    let zone: SpawnZone = { type: "Dungeon", level: 1 };
    let count: number | undefined;
    let condition: Condition | undefined;

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "phase":     phase = this.parseString(); break;
        case "item":      item  = this.parseString(); break;
        case "zone":      zone  = this.parseSpawnZone(); break;
        case "count":     count = this.parseNumber(); break;
        case "condition": condition = this.parseOptionCondition(); break;
        default: break;
      }
      this.tryPunct(",");
    }
    const spawn: QuestSpawn = { phase, item, zone };
    if (count !== undefined) spawn.count = count;
    if (condition !== undefined) spawn.condition = condition;
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
function q(s: string) { return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` ; }

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
    case "DespawnWorldItem": return `${i}DespawnWorldItem(${q(action.itemId)})`;
    case "KillNpc":          return `${i}KillNpc(${q(action.npcId)})`;
    case "SetFlag":          return `${i}SetFlag(flag: ${q(action.flag)}, value: ${q(action.value)})`;
    case "ClearFlag":        return `${i}ClearFlag(${q(action.flag)})`;
    case "OpenPortal": {
      const parts = [`zone: ${q(action.zone)}`, `generator: ${q(action.generator)}`];
      if (action.placement) parts.push(`placement: ${serializePlacement(action.placement)}`);
      return `${i}OpenPortal(${parts.join(", ")})`;
    }
    case "ClosePortal":      return `${i}ClosePortal(${q(action.zone)})`;
    case "SpawnGuards":      return `${i}SpawnGuards(count: ${action.count})`;
    case "PlaceTraps":       return `${i}PlaceTraps(kind: ${action.kind}, count: ${action.count}, hidden: ${action.hidden})`;
    case "Explode":          return `${i}Explode(radius: ${action.radius}, terrain: ${action.terrain}, entity_damage: ${action.entityDamage})`;
    case "SpawnMonster":     return `${i}SpawnMonster(id: ${q(action.monsterId)}, count: ${action.count})`;
  }
}

function serializeZone(zone: SpawnZone): string {
  switch (zone.type) {
    case "Town":    return "Town";
    case "Forest":  return "Forest";
    case "Dungeon": return `Dungeon(${zone.level})`;
    case "Named":   return `Named(${q(zone.id)})`;
  }
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
  const head = `from: ${q(t.from)}, trigger: ${t.trigger}`;
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
  return [
    `        id: ${q(item.id)},`,
    `        display_name: ${q(item.displayName)},`,
    `        glyph_ascii: ${q(item.glyphAscii)},`,
    `        glyph_unicode: ${q(item.glyphUnicode)},`,
    `        glyph_game_icon: ${q(item.glyphGameIcon)},`,
    `        pickup_message: ${q(item.pickupMessage)},`,
  ];
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
  return arrayWrap("AccessoryDef", items.map((i) => [
    ...serializeItemCommon(i),
    `        desc: ${q(i.desc)},`,
  ]));
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
