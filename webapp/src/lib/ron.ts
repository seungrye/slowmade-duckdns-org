import type {
  QuestDef,
  QuestPhaseDef,
  Action,
  AutoAdvance,
  Condition,
  PortalPlacement,
  QuestSpawn,
  SpawnZone,
} from "@/types/quest";
import type { VillagerDef } from "@/types/villager";

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

  // ── VillagerDef ──────────────────────────────────────────────────────────

  parseVillagerDef(): VillagerDef {
    const name = this.parseIdent();
    if (name !== "VillagerDef") throw new Error(`Expected VillagerDef, got ${name}`);
    this.expectPunct("(");

    const def: VillagerDef = {
      name: "",
      color: [0, 0, 0],
      dialogs: [],
      questId: null,
      speed: 1.0,
    };

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "name":     def.name    = this.parseString(); break;
        case "color":    def.color   = this.parseNumberTuple3(); break;
        case "dialogs":  def.dialogs = this.parseArray(() => this.parseString()); break;
        case "quest_id": def.questId = this.parseOptionString(); break;
        case "speed":    def.speed   = this.parseNumber(); break;
        default: break;
      }
      this.tryPunct(",");
    }
    this.expectPunct(")");
    return def;
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
      case "AdvancePhase": {
        const phaseId = this.parseString();
        this.expectPunct(")");
        return { type: "AdvancePhase", phaseId };
      }
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
      case "Branch": {
        // Branch(condition: ..., if_true: [...], if_false: [...])
        let condition: Condition = { type: "Always" };
        let ifTrue: Action[] = [];
        let ifFalse: Action[] = [];

        while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
          const key = this.parseIdent();
          this.expectPunct(":");
          switch (key) {
            case "condition": condition = this.parseCondition(); break;
            case "if_true":   ifTrue   = this.parseActionList(); break;
            case "if_false":  ifFalse  = this.parseActionList(); break;
            default: break;
          }
          this.tryPunct(",");
        }
        this.expectPunct(")");
        return { type: "Branch", condition, ifTrue, ifFalse };
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

  // ── AutoAdvance ───────────────────────────────────────────────────────────

  parseAutoAdvance(): AutoAdvance {
    let condition: Condition = { type: "Always" };
    let nextPhase = "";
    let actions: Action[] | undefined;

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");
      switch (key) {
        case "condition":  condition = this.parseCondition(); break;
        case "next_phase": nextPhase = this.parseString(); break;
        case "actions":    actions   = this.parseActionList(); break;
        default: break;
      }
      this.tryPunct(",");
    }

    const aa: AutoAdvance = { condition, nextPhase };
    if (actions && actions.length > 0) aa.actions = actions;
    return aa;
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
      on_interact: [],
      auto_advance: [],
      objective: null,
    };

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expectPunct(":");

      switch (key) {
        case "dialog":
          def.dialog = this.parseArray(() => this.parseString());
          break;
        case "on_interact":
          def.on_interact = this.parseActionList();
          break;
        case "auto_advance":
          def.auto_advance = this.parseArray(() => {
            const n = this.parseIdent();
            if (n !== "AutoAdvance") throw new Error(`Expected AutoAdvance, got ${n}`);
            this.expectPunct("(");
            const aa = this.parseAutoAdvance();
            this.expectPunct(")");
            return aa;
          });
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

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

function ind(n: number) { return "    ".repeat(n); }
function q(s: string) { return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` ; }

function serializeCondition(cond: Condition): string {
  switch (cond.type) {
    case "Always":  return "Always";
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
    case "AdvancePhase":     return `${i}AdvancePhase(${q(action.phaseId)})`;
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
    case "Branch": {
      const lines = [
        `${i}Branch(`,
        `${ind(depth + 1)}condition: ${serializeCondition(action.condition)},`,
      ];
      if (action.ifTrue.length === 0) {
        lines.push(`${ind(depth + 1)}if_true: [],`);
      } else {
        lines.push(`${ind(depth + 1)}if_true: [`);
        for (const a of action.ifTrue) lines.push(`${serializeAction(a, depth + 2)},`);
        lines.push(`${ind(depth + 1)}],`);
      }
      if (action.ifFalse.length === 0) {
        lines.push(`${ind(depth + 1)}if_false: [],`);
      } else {
        lines.push(`${ind(depth + 1)}if_false: [`);
        for (const a of action.ifFalse) lines.push(`${serializeAction(a, depth + 2)},`);
        lines.push(`${ind(depth + 1)}],`);
      }
      lines.push(`${i})`);
      return lines.join("\n");
    }
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

  if (phase.on_interact.length === 0) {
    lines.push(`${i1}on_interact: [],`);
  } else {
    lines.push(`${i1}on_interact: [`);
    for (const a of phase.on_interact) lines.push(`${serializeAction(a, depth + 2)},`);
    lines.push(`${i1}],`);
  }

  if (phase.auto_advance.length === 0) {
    lines.push(`${i1}auto_advance: [],`);
  } else {
    lines.push(`${i1}auto_advance: [`);
    for (const aa of phase.auto_advance) {
      lines.push(`${ind(depth + 2)}AutoAdvance(`);
      lines.push(`${ind(depth + 3)}condition: ${serializeCondition(aa.condition)},`);
      lines.push(`${ind(depth + 3)}next_phase: ${q(aa.nextPhase)},`);
      if (aa.actions && aa.actions.length > 0) {
        lines.push(`${ind(depth + 3)}actions: [`);
        for (const a of aa.actions) lines.push(`${serializeAction(a, depth + 4)},`);
        lines.push(`${ind(depth + 3)}],`);
      }
      lines.push(`${ind(depth + 2)}),`);
    }
    lines.push(`${i1}],`);
  }

  const obj = phase.objective == null ? "None" : `Some(${q(phase.objective)})`;
  lines.push(`${i1}objective: ${obj},`);

  lines.push(`${i}),`);
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
  lines.push(`        name: ${q(v.name)},`);
  lines.push(`        color: (${v.color[0]}, ${v.color[1]}, ${v.color[2]}),`);
  if (v.dialogs.length === 0) {
    lines.push(`        dialogs: [],`);
  } else {
    lines.push(`        dialogs: [`);
    for (const d of v.dialogs) lines.push(`            ${q(d)},`);
    lines.push(`        ],`);
  }
  const qid = v.questId == null ? "None" : `Some(${q(v.questId)})`;
  lines.push(`        quest_id: ${qid},`);
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

export function serializeRon(quest: QuestDef): string {
  const lines: string[] = [];

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
