import type {
  QuestDef,
  QuestPhaseDef,
  Action,
  AutoAdvance,
  Condition,
  QuestSpawn,
  SpawnZone,
} from "@/types/quest";

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
    // 숫자
    if (/[0-9\-]/.test(src[i]) && (src[i] !== "-" || /[0-9]/.test(src[i + 1]))) {
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

  expect(kind: "punct", val: string): void;
  expect(kind: "ident"): string;
  expect(kind: string, val?: string): string | void {
    const t = this.next();
    if (kind === "punct") {
      if (t.kind !== "punct" || t.val !== val)
        throw new Error(`Expected '${val}' but got '${JSON.stringify(t)}'`);
    } else {
      if (t.kind !== kind)
        throw new Error(`Expected ${kind} but got '${JSON.stringify(t)}'`);
      return (t as { kind: "ident"; val: string }).val;
    }
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
    const t = this.next();
    if (t.kind !== "ident") throw new Error(`Expected ident, got ${JSON.stringify(t)}`);
    return t.val;
  }

  parseNumber(): number {
    const t = this.next();
    if (t.kind !== "num") throw new Error(`Expected number, got ${JSON.stringify(t)}`);
    return t.val;
  }

  /** `Some("...")` 또는 `None` */
  parseOptionString(): string | null {
    const name = this.parseIdent();
    if (name === "None") return null;
    this.expect("punct", "(");
    const v = this.parseString();
    this.expect("punct", ")");
    return v;
  }

  /** `[item, item, ...]` */
  parseArray<T>(parseItem: () => T): T[] {
    this.expect("punct", "[");
    const items: T[] = [];
    while (!(this.peek()?.kind === "punct" && this.peek()?.val === "]")) {
      items.push(parseItem());
      this.tryPunct(",");
    }
    this.expect("punct", "]");
    return items;
  }

  parseCondition(): Condition {
    const name = this.parseIdent();
    if (name === "Always") return { type: "Always" };

    this.expect("punct", "(");
    if (name === "FlagIs") {
      // FlagIs(flag: "...", value: "...")
      this.expect("ident"); this.expect("punct", ":"); const flag = this.parseString();
      this.tryPunct(",");
      this.expect("ident"); this.expect("punct", ":"); const value = this.parseString();
      this.tryPunct(",");
      this.expect("punct", ")");
      return { type: "FlagIs", flag, value };
    }
    if (name === "HasItem") {
      const itemId = this.parseString();
      this.expect("punct", ")");
      return { type: "HasItem", itemId };
    }
    throw new Error(`Unknown condition: ${name}`);
  }

  parseAction(): Action {
    const name = this.parseIdent();
    this.expect("punct", "(");

    switch (name) {
      case "AdvancePhase": {
        const phaseId = this.parseString();
        this.expect("punct", ")");
        return { type: "AdvancePhase", phaseId };
      }
      case "Log": {
        const text = this.parseString();
        this.expect("punct", ")");
        return { type: "Log", text };
      }
      case "GiveItem": {
        const itemId = this.parseString();
        this.expect("punct", ")");
        return { type: "GiveItem", itemId };
      }
      case "SetFlag": {
        this.expect("ident"); this.expect("punct", ":"); const flag = this.parseString();
        this.tryPunct(",");
        this.expect("ident"); this.expect("punct", ":"); const value = this.parseString();
        this.tryPunct(",");
        this.expect("punct", ")");
        return { type: "SetFlag", flag, value };
      }
      case "KillNpc": {
        const npcId = this.parseString();
        this.expect("punct", ")");
        return { type: "KillNpc", npcId };
      }
      case "Branch": {
        // Branch 는 개별 파일에서 명시적으로 안 쓰이지만 구조는 지원
        const branches: { condition: Condition; phaseId: string }[] = [];
        this.expect("punct", "[");
        while (!(this.peek()?.kind === "punct" && this.peek()?.val === "]")) {
          this.expect("punct", "(");
          this.parseIdent(); this.expect("punct", ":"); const cond = this.parseCondition();
          this.tryPunct(",");
          this.parseIdent(); this.expect("punct", ":"); const phaseId = this.parseString();
          this.tryPunct(",");
          this.expect("punct", ")");
          branches.push({ condition: cond, phaseId });
          this.tryPunct(",");
        }
        this.expect("punct", "]");
        this.expect("punct", ")");
        return { type: "Branch", branches };
      }
      default:
        throw new Error(`Unknown action: ${name}`);
    }
  }

  parseAutoAdvance(): AutoAdvance {
    // AutoAdvance( condition: ..., next_phase: "..." )
    this.expect("ident"); this.expect("punct", ":");
    const condition = this.parseCondition();
    this.tryPunct(",");
    this.expect("ident"); this.expect("punct", ":");
    const nextPhase = this.parseString();
    this.tryPunct(",");
    return { condition, nextPhase };
  }

  parseSpawnZone(): SpawnZone {
    const name = this.parseIdent();
    this.expect("punct", "(");
    if (name === "Dungeon") {
      const level = this.parseNumber();
      this.expect("punct", ")");
      return { type: "Dungeon", level };
    }
    if (name === "World") {
      const mapId = this.parseString();
      this.expect("punct", ")");
      return { type: "World", mapId };
    }
    throw new Error(`Unknown zone: ${name}`);
  }

  parseSpawn(): QuestSpawn {
    // QuestSpawn(phase: "...", item: "...", zone: Dungeon(1))
    this.expect("ident"); this.expect("punct", ":"); const phase = this.parseString();
    this.tryPunct(",");
    this.expect("ident"); this.expect("punct", ":"); const item = this.parseString();
    this.tryPunct(",");
    this.expect("ident"); this.expect("punct", ":"); const zone = this.parseSpawnZone();
    this.tryPunct(",");
    return { phase, item, zone };
  }

  parsePhaseDef(): QuestPhaseDef {
    // dialog: [...], on_interact: [...], auto_advance: [...], objective: Some(...)|None
    const def: QuestPhaseDef = {
      dialog: [],
      on_interact: [],
      auto_advance: [],
      objective: null,
    };

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expect("punct", ":");

      switch (key) {
        case "dialog":
          def.dialog = this.parseArray(() => this.parseString());
          break;
        case "on_interact":
          def.on_interact = this.parseArray(() => this.parseAction());
          break;
        case "auto_advance":
          def.auto_advance = this.parseArray(() => {
            const name = this.parseIdent();
            if (name !== "AutoAdvance") throw new Error(`Expected AutoAdvance, got ${name}`);
            this.expect("punct", "(");
            const aa = this.parseAutoAdvance();
            this.expect("punct", ")");
            return aa;
          });
          break;
        case "objective":
          def.objective = this.parseOptionString();
          break;
        default:
          // 알 수 없는 필드 스킵
          break;
      }
      this.tryPunct(",");
    }

    return def;
  }

  parseQuest(): QuestDef {
    // QuestDef( id: "...", title: "...", giver_npc: "...", initial_phase: "...", phases: { ... }, spawns: [...] )
    const name = this.parseIdent();
    if (name !== "QuestDef") throw new Error(`Expected QuestDef, got ${name}`);
    this.expect("punct", "(");

    const quest: Partial<QuestDef> & { phases: Record<string, QuestPhaseDef>; spawns: QuestSpawn[] } = {
      id: "",
      title: "",
      giverNpc: "",
      initialPhase: "",
      phases: {},
      spawns: [],
    };

    while (!(this.peek()?.kind === "punct" && this.peek()?.val === ")")) {
      const key = this.parseIdent();
      this.expect("punct", ":");

      switch (key) {
        case "id":
          quest.id = this.parseString();
          break;
        case "title":
          quest.title = this.parseString();
          break;
        case "giver_npc":
          quest.giverNpc = this.parseString();
          break;
        case "initial_phase":
          quest.initialPhase = this.parseString();
          break;
        case "phases": {
          // { "phaseId": QuestPhaseDef(...), ... }
          this.expect("punct", "{");
          while (!(this.peek()?.kind === "punct" && this.peek()?.val === "}")) {
            const phaseId = this.parseString();
            this.expect("punct", ":");
            const phaseName = this.parseIdent();
            if (phaseName !== "QuestPhaseDef") throw new Error(`Expected QuestPhaseDef`);
            this.expect("punct", "(");
            const phase = this.parsePhaseDef();
            this.expect("punct", ")");
            quest.phases[phaseId] = phase;
            this.tryPunct(",");
          }
          this.expect("punct", "}");
          break;
        }
        case "spawns":
          quest.spawns = this.parseArray(() => {
            const sname = this.parseIdent();
            if (sname !== "QuestSpawn") throw new Error(`Expected QuestSpawn`);
            this.expect("punct", "(");
            const s = this.parseSpawn();
            this.expect("punct", ")");
            return s;
          });
          break;
        default:
          break;
      }
      this.tryPunct(",");
    }

    this.expect("punct", ")");
    return quest as QuestDef;
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

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

function indent(n: number) { return "    ".repeat(n); }
function q(s: string) { return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` ; }

function serializeCondition(cond: Condition): string {
  if (cond.type === "Always") return "Always";
  if (cond.type === "FlagIs") return `FlagIs(flag: ${q(cond.flag)}, value: ${q(cond.value)})`;
  if (cond.type === "HasItem") return `HasItem(${q(cond.itemId)})`;
  return "Always";
}

function serializeAction(action: Action, depth: number): string {
  const i = indent(depth);
  switch (action.type) {
    case "AdvancePhase": return `${i}AdvancePhase(${q(action.phaseId)})`;
    case "Log":          return `${i}Log(${q(action.text)})`;
    case "GiveItem":     return `${i}GiveItem(${q(action.itemId)})`;
    case "KillNpc":      return `${i}KillNpc(${q(action.npcId)})`;
    case "SetFlag":      return `${i}SetFlag(flag: ${q(action.flag)}, value: ${q(action.value)})`;
    case "Branch": {
      const branches = action.branches
        .map(b => `${indent(depth + 1)}(condition: ${serializeCondition(b.condition)}, phaseId: ${q(b.phaseId)})`)
        .join(",\n");
      return `${i}Branch([\n${branches},\n${i}])`;
    }
  }
}

function serializeZone(zone: SpawnZone): string {
  if (zone.type === "Dungeon") return `Dungeon(${zone.level})`;
  return `World(${q(zone.mapId)})`;
}

function serializePhase(phaseId: string, phase: QuestPhaseDef, depth: number): string {
  const i = indent(depth);
  const i1 = indent(depth + 1);
  const lines: string[] = [];

  lines.push(`${i}${q(phaseId)}: QuestPhaseDef(`);

  // dialog
  if (phase.dialog.length === 0) {
    lines.push(`${i1}dialog: [],`);
  } else {
    lines.push(`${i1}dialog: [`);
    for (const d of phase.dialog) lines.push(`${indent(depth + 2)}${q(d)},`);
    lines.push(`${i1}],`);
  }

  // on_interact
  if (phase.on_interact.length === 0) {
    lines.push(`${i1}on_interact: [],`);
  } else {
    lines.push(`${i1}on_interact: [`);
    for (const a of phase.on_interact) lines.push(`${serializeAction(a, depth + 2)},`);
    lines.push(`${i1}],`);
  }

  // auto_advance
  if (phase.auto_advance.length === 0) {
    lines.push(`${i1}auto_advance: [],`);
  } else {
    lines.push(`${i1}auto_advance: [`);
    for (const aa of phase.auto_advance) {
      lines.push(`${indent(depth + 2)}AutoAdvance(`);
      lines.push(`${indent(depth + 3)}condition: ${serializeCondition(aa.condition)},`);
      lines.push(`${indent(depth + 3)}next_phase: ${q(aa.nextPhase)},`);
      lines.push(`${indent(depth + 2)}),`);
    }
    lines.push(`${i1}],`);
  }

  // objective
  const obj = phase.objective == null ? "None" : `Some(${q(phase.objective)})`;
  lines.push(`${i1}objective: ${obj},`);

  lines.push(`${i}),`);
  return lines.join("\n");
}

export function serializeRon(quest: QuestDef): string {
  const lines: string[] = [];

  lines.push(`QuestDef(`);
  lines.push(`    id: ${q(quest.id)},`);
  lines.push(`    title: ${q(quest.title)},`);
  lines.push(`    giver_npc: ${q(quest.giverNpc)},`);
  lines.push(`    initial_phase: ${q(quest.initialPhase)},`);
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
    for (const s of quest.spawns) {
      lines.push(`        QuestSpawn(phase: ${q(s.phase)}, item: ${q(s.item)}, zone: ${serializeZone(s.zone)}),`);
    }
    lines.push(`    ],`);
  }

  lines.push(`)`);
  return lines.join("\n");
}
