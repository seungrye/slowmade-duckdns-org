"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MonsterDocument, MonsterElement } from "@/types/monster";
import type { Condition, SpawnZone } from "@/types/quest";
import { useInfoDialog } from "@/components/info-dialog";

interface FormState {
  id: string;
  displayName: string;
  glyph: string;
  color: [number, number, number];
  hp: number;
  attack: number;
  defense: number;
  visionRadius: number;
  speed: number;
  element: MonsterElement | "";
  spawnWeight: number;
  questOnly: boolean;
  // 중첩 구조 — UI 편집은 RON import 에 위임하고 편집 시 보존만 한다.
  zones: SpawnZone[];
  spawnCondition?: Condition;
}

const emptyForm: FormState = {
  id: "",
  displayName: "",
  glyph: "",
  color: [0.8, 0.2, 0.2],
  hp: 6,
  attack: 3,
  defense: 0,
  visionRadius: 6,
  speed: 1.0,
  element: "",
  spawnWeight: 1.0,
  questOnly: false,
  zones: [],
  spawnCondition: undefined,
};

const ELEMENTS: MonsterElement[] = ["fire", "ice", "poison", "lightning"];

// ── 색상 유틸 (RON 은 0~1 RGB, <input type=color> 는 #rrggbb) ──
function randomColor(): [number, number, number] {
  return [Math.random(), Math.random(), Math.random()];
}

function rgb01ToHex(c: [number, number, number]): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function formToBody(f: FormState) {
  const body: Record<string, unknown> = {
    displayName: f.displayName.trim(),
    glyph: f.glyph.trim(),
    color: f.color,
    hp: f.hp,
    attack: f.attack,
    defense: f.defense,
    visionRadius: f.visionRadius,
    speed: f.speed,
    element: f.element === "" ? null : f.element,
    spawnWeight: f.spawnWeight,
    zones: f.zones,
    spawnCondition: f.spawnCondition ?? null,
    questOnly: f.questOnly,
  };
  return body;
}

export default function MonstersPage() {
  const [list, setList] = useState<MonsterDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { showInfo } = useInfoDialog();

  async function load() {
    setLoading(true);
    setSelectedIds(new Set());
    const res = await fetch("/api/quests/monsters");
    const json = await res.json();
    setList(json.data ?? []);
    setLoading(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allSelected = list.length > 0 && list.every((m) => selectedIds.has(m.id));
  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) for (const m of list) next.delete(m.id);
      else for (const m of list) next.add(m.id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}개 monster 를 삭제하시겠습니까?`)) return;
    setBulkDeleting(true);
    const res = await fetch("/api/quests/monsters/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setBulkDeleting(false);
    if (res.ok) {
      const { data } = await res.json();
      showInfo({ title: "일괄 삭제 완료", body: `${data.deleted}개 monster 삭제.`, variant: "success" });
      load();
    } else {
      const json = await res.json().catch(() => ({}));
      showInfo({ title: "일괄 삭제 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.id.trim() || !createForm.displayName.trim() || !createForm.glyph.trim()) return;
    const res = await fetch("/api/quests/monsters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: createForm.id.trim(), ...formToBody(createForm) }),
    });
    if (res.ok) {
      setCreating(false);
      setCreateForm(emptyForm);
      load();
    } else {
      const json = await res.json();
      showInfo({ title: "생성 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  async function handleSave(id: string) {
    const res = await fetch(`/api/quests/monsters/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formToBody(editForm)),
    });
    if (res.ok) {
      setEditingId(null);
      load();
    } else {
      const json = await res.json();
      showInfo({ title: "저장 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`"${id}" monster 를 삭제하시겠습니까?`)) return;
    await fetch(`/api/quests/monsters/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  async function handleImport(file: File) {
    const text = await file.text();
    const res = await fetch("/api/quests/monsters/import", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: text,
    });
    const json = await res.json();
    if (res.ok) {
      showInfo({
        title: "가져오기 완료",
        body: `신규 ${json.data.created}개, 갱신 ${json.data.updated}개`,
        variant: "success",
      });
      load();
    } else {
      showInfo({ title: "가져오기 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  function startEdit(m: MonsterDocument) {
    setEditingId(m.id);
    setEditForm({
      id: m.id,
      displayName: m.displayName,
      glyph: m.glyph,
      color: [m.color[0], m.color[1], m.color[2]],
      hp: m.hp,
      attack: m.attack,
      defense: m.defense,
      visionRadius: m.visionRadius,
      speed: m.speed,
      element: m.element ?? "",
      spawnWeight: m.spawnWeight,
      questOnly: m.questOnly,
      zones: m.zones ?? [],
      spawnCondition: m.spawnCondition,
    });
  }

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Monster 카탈로그</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <label className="cursor-pointer px-3 py-2 text-sm rounded-lg border border-dashed border-gray-400 hover:border-blue-500 hover:text-blue-500 transition-colors">
            .ron 가져오기
            <input
              type="file"
              accept=".ron"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={() => { window.location.href = "/api/quests/monsters/export"; }}
            className="px-3 py-2 text-sm rounded-lg border hover:border-green-400 hover:text-green-600 transition-colors"
          >
            내보내기
          </button>
          <button
            onClick={() => { setCreateForm({ ...emptyForm, color: randomColor() }); setCreating(true); }}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            + 새 monster
          </button>
        </div>
      </div>

      {list.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-sm">
          <label className="flex items-center gap-1 text-gray-600 dark:text-gray-400 select-none cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="전체 선택" />
            전체 선택
          </label>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDeleting || selectedIds.size === 0}
            className="px-3 py-1 rounded border border-red-300 text-red-500 hover:border-red-500 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bulkDeleting ? "삭제 중..." : `선택 삭제 (${selectedIds.size})`}
          </button>
        </div>
      )}

      {creating && (
        <form
          onSubmit={handleCreate}
          className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900 space-y-2"
        >
          <FormFields form={createForm} setForm={setCreateForm} idEditable />
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1 text-sm rounded bg-blue-600 text-white">
              생성
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setCreateForm(emptyForm); }}
              className="px-3 py-1 text-sm rounded border"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : list.length === 0 ? (
        <p className="text-gray-400">등록된 monster 가 없습니다. .ron 가져오기로 시드하거나 + 새 monster 로 추가하세요.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900">
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.id)}
                  onChange={() => toggleSelect(m.id)}
                  aria-label={`${m.id} 선택`}
                  className="shrink-0"
                />
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className="w-6 h-6 rounded shrink-0 border border-gray-300 grid place-items-center font-mono text-xs"
                    style={{ color: `rgb(${m.color[0] * 255}, ${m.color[1] * 255}, ${m.color[2] * 255})` }}
                    title={`(${m.color.join(", ")})`}
                  >
                    {m.glyph}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {m.displayName} <span className="font-mono text-xs text-gray-400">{m.id}</span>
                      {m.questOnly && <span className="ml-2 text-[10px] px-1 rounded bg-purple-100 text-purple-600">quest_only</span>}
                      {m.element && <span className="ml-1 text-[10px] px-1 rounded bg-orange-100 text-orange-600">{m.element}</span>}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      HP {m.hp} · ATK {m.attack} · DEF {m.defense} · 시야 {m.visionRadius} · speed {m.speed} · 가중치 {m.spawnWeight}
                      {m.zones.length > 0 && ` · 존 ${m.zones.length}`}
                      {m.spawnCondition && ` · 조건有`}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link
                    href={`/quests/monsters/${encodeURIComponent(m.id)}/revisions`}
                    className="px-2 py-1 text-xs rounded border hover:border-purple-400 hover:text-purple-500 transition-colors"
                  >
                    히스토리 (v{m.version})
                  </Link>
                  {editingId === m.id ? (
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 text-xs rounded border"
                    >
                      취소
                    </button>
                  ) : (
                    <button
                      onClick={() => startEdit(m)}
                      className="px-2 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500 transition-colors"
                    >
                      편집
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
              {editingId === m.id && (
                <div className="p-3 bg-white dark:bg-gray-950 space-y-2">
                  <FormFields form={editForm} setForm={setEditForm} idEditable={false} />
                  <button
                    onClick={() => handleSave(m.id)}
                    className="px-3 py-1 text-sm rounded bg-blue-600 text-white"
                  >
                    저장
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NumField({
  label, value, step, onChange,
}: {
  label: string; value: number; step?: number; onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 w-20">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="border rounded px-2 py-1 text-sm w-full bg-white dark:bg-gray-800"
      />
    </label>
  );
}

function FormFields({
  form,
  setForm,
  idEditable,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  idEditable: boolean;
}) {
  const inputCls = "border rounded px-2 py-1 text-sm w-full bg-white dark:bg-gray-800";
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">id (SpawnMonster 가 참조)</span>
          <input
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            disabled={!idEditable}
            placeholder="goblin"
            className={`${inputCls} w-40 font-mono ${!idEditable ? "opacity-60" : ""}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">display_name (표시용)</span>
          <input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="고블린"
            className={`${inputCls} w-40`}
          />
        </label>
        <label className="flex flex-col gap-1 w-16">
          <span className="text-xs text-gray-500">glyph</span>
          <input
            value={form.glyph}
            onChange={(e) => setForm({ ...form, glyph: e.target.value })}
            placeholder="g"
            className={`${inputCls} font-mono`}
          />
        </label>
      </div>

      <div className="flex gap-2 flex-wrap items-end">
        <NumField label="hp" value={form.hp} onChange={(n) => setForm({ ...form, hp: n })} />
        <NumField label="attack" value={form.attack} onChange={(n) => setForm({ ...form, attack: n })} />
        <NumField label="defense" value={form.defense} onChange={(n) => setForm({ ...form, defense: n })} />
        <NumField label="vision" value={form.visionRadius} onChange={(n) => setForm({ ...form, visionRadius: n })} />
        <NumField label="speed" value={form.speed} step={0.05} onChange={(n) => setForm({ ...form, speed: n })} />
        <NumField label="weight" value={form.spawnWeight} step={0.1} onChange={(n) => setForm({ ...form, spawnWeight: n })} />
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <span className="text-xs text-gray-500">color</span>
        <input
          type="color"
          aria-label="color"
          value={rgb01ToHex(form.color)}
          onChange={(e) => setForm({ ...form, color: hexToRgb01(e.target.value) })}
          className="h-8 w-12 rounded border border-gray-300 bg-white dark:bg-gray-800 cursor-pointer p-0.5"
        />
        <span className="text-[10px] text-gray-400 font-mono">
          ({form.color.map((c) => c.toFixed(2)).join(", ")})
        </span>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">element</span>
          <select
            aria-label="element"
            value={form.element}
            onChange={(e) => setForm({ ...form, element: e.target.value as MonsterElement | "" })}
            className={`${inputCls} w-28`}
          >
            <option value="">(없음)</option>
            {ELEMENTS.map((el) => (
              <option key={el} value={el}>{el}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 mt-4">
          <input
            type="checkbox"
            checked={form.questOnly}
            onChange={(e) => setForm({ ...form, questOnly: e.target.checked })}
          />
          <span className="text-xs text-gray-500">quest_only (자연 스폰 안 됨)</span>
        </label>
      </div>

      {(form.zones.length > 0 || form.spawnCondition) && (
        <p className="text-[11px] text-gray-400">
          zones / spawn_condition 은 RON 가져오기로 관리됩니다 (편집 시 보존).
          {form.zones.length > 0 && ` 존 ${form.zones.length}개`}
          {form.spawnCondition && ` · 스폰 조건 설정됨`}
        </p>
      )}
    </div>
  );
}
