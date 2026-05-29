"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ItemDocument, ItemKind, WeaponElement, AccessoryEffect } from "@/types/item";
import { ACCESSORY_EFFECTS, ACCESSORY_EFFECT_LABELS } from "@/types/item";
import { useInfoDialog } from "@/components/info-dialog";

type Filter = "all" | ItemKind;

interface FormState {
  id: string;
  kind: ItemKind;
  displayName: string;
  glyphAscii: string;
  glyphUnicode: string;
  glyphGameIcon: string;
  pickupMessage: string;
  imagePath: string;
  attackPower: number;
  attackPowerMin: number | "";
  attackPowerMax: number | "";
  element: WeaponElement | null;
  defenseBonus: number;
  defenseBonusMin: number | "";
  defenseBonusMax: number | "";
  tier: number | "";
  effectAmount: number;
  desc: string;
  /** 액세서리 효과 키 — 빈 배열은 효과 없는 장식용. */
  effects: AccessoryEffect[];
}

const emptyForm: FormState = {
  id: "", kind: "quest",
  displayName: "", glyphAscii: "", glyphUnicode: "", glyphGameIcon: "",
  pickupMessage: "",
  imagePath: "scene/open-chest.png",
  attackPower: 0,
  attackPowerMin: "",
  attackPowerMax: "",
  element: null,
  defenseBonus: 0,
  defenseBonusMin: "",
  defenseBonusMax: "",
  tier: "",
  effectAmount: 0,
  desc: "",
  effects: [],
};

export default function ItemsPage() {
  const [list, setList] = useState<ItemDocument[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const { showInfo } = useInfoDialog();

  async function load() {
    setLoading(true);
    setSelectedIds(new Set());
    const res = await fetch("/api/quests/items");
    const json = await res.json();
    setList(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: list.length, quest: 0, weapon: 0, armor: 0, consumable: 0, accessory: 0 };
    for (const it of list) c[it.kind]++;
    return c;
  }, [list]);

  const visible = useMemo(
    () => filter === "all" ? list : list.filter((it) => it.kind === filter),
    [list, filter],
  );

  function startEdit(item: ItemDocument) {
    setEditingId(item.id);
    const f: FormState = {
      ...emptyForm,
      id: item.id,
      kind: item.kind,
      displayName: item.displayName,
      glyphAscii: item.glyphAscii,
      glyphUnicode: item.glyphUnicode,
      glyphGameIcon: item.glyphGameIcon,
      pickupMessage: item.pickupMessage,
    };
    if (item.kind === "quest") f.imagePath = item.imagePath;
    else if (item.kind === "weapon") {
      f.attackPower = item.attackPower;
      f.attackPowerMin = item.attackPowerMin ?? "";
      f.attackPowerMax = item.attackPowerMax ?? "";
      f.tier = item.tier ?? "";
      f.element = item.element;
    }
    else if (item.kind === "armor") {
      f.defenseBonus = item.defenseBonus;
      f.defenseBonusMin = item.defenseBonusMin ?? "";
      f.defenseBonusMax = item.defenseBonusMax ?? "";
      f.tier = item.tier ?? "";
    }
    else if (item.kind === "consumable") f.effectAmount = item.effect.amount;
    else if (item.kind === "accessory") {
      f.desc = item.desc;
      f.effects = item.effects ?? [];
    }
    setEditForm(f);
  }

  function bodyFromForm(form: FormState, includeId: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      displayName: form.displayName,
      glyphAscii: form.glyphAscii,
      glyphUnicode: form.glyphUnicode,
      glyphGameIcon: form.glyphGameIcon,
      pickupMessage: form.pickupMessage,
    };
    if (includeId) { body.id = form.id; body.kind = form.kind; }
    switch (form.kind) {
      case "quest":      body.imagePath = form.imagePath; break;
      case "weapon": {
        body.attackPower = form.attackPower;
        if (form.attackPowerMin !== "") body.attackPowerMin = Number(form.attackPowerMin);
        if (form.attackPowerMax !== "") body.attackPowerMax = Number(form.attackPowerMax);
        if (form.tier !== "") body.tier = Number(form.tier);
        body.element = form.element;
        break;
      }
      case "armor": {
        body.defenseBonus = form.defenseBonus;
        if (form.defenseBonusMin !== "") body.defenseBonusMin = Number(form.defenseBonusMin);
        if (form.defenseBonusMax !== "") body.defenseBonusMax = Number(form.defenseBonusMax);
        if (form.tier !== "") body.tier = Number(form.tier);
        break;
      }
      case "consumable": body.effect = { type: "Heal", amount: form.effectAmount }; break;
      case "accessory":
        body.desc = form.desc;
        // 빈 배열도 명시적으로 보내서 효과 제거가 가능하게 한다.
        body.effects = form.effects;
        break;
    }
    return body;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.id.trim() || !createForm.displayName.trim()) return;
    const res = await fetch("/api/quests/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyFromForm(createForm, true)),
    });
    if (res.ok) { setCreating(false); setCreateForm(emptyForm); load(); }
    else showInfo({ title: "생성 실패", body: (await res.json()).message ?? "알 수 없는 오류", variant: "error" });
  }

  async function handleSave(id: string) {
    const res = await fetch(`/api/quests/items/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyFromForm(editForm, false)),
    });
    if (res.ok) { setEditingId(null); load(); }
    else showInfo({ title: "저장 실패", body: (await res.json()).message ?? "알 수 없는 오류", variant: "error" });
  }

  async function handleDelete(id: string) {
    if (!confirm(`"${id}" item 을 삭제하시겠습니까?`)) return;
    await fetch(`/api/quests/items/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleIds = useMemo(() => visible.map((it) => it.id), [visible]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}개 item 을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    const res = await fetch("/api/quests/items/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setDeleting(false);
    if (res.ok) load();
    else showInfo({ title: "일괄 삭제 실패", body: (await res.json()).message ?? "알 수 없는 오류", variant: "error" });
  }

  async function handleImport(file: File, kind: ItemKind) {
    const text = await file.text();
    const res = await fetch(`/api/quests/items/import?kind=${kind}`, {
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

  function summarize(item: ItemDocument): string {
    switch (item.kind) {
      case "quest":      return `image: ${item.imagePath}`;
      case "weapon": {
        const atk = item.attackPowerMin !== undefined && item.attackPowerMax !== undefined
          ? `ATK ${item.attackPowerMin}~${item.attackPowerMax}`
          : `ATK ${item.attackPower}`;
        const tier = item.tier !== undefined ? ` T${item.tier}` : "";
        const elem = item.element ? ` (${item.element})` : "";
        return `${atk}${tier}${elem}`;
      }
      case "armor": {
        const def = item.defenseBonusMin !== undefined && item.defenseBonusMax !== undefined
          ? `DEF +${item.defenseBonusMin}~${item.defenseBonusMax}`
          : `DEF +${item.defenseBonus}`;
        const tier = item.tier !== undefined ? ` T${item.tier}` : "";
        return `${def}${tier}`;
      }
      case "consumable": return `${item.effect.type} +${item.effect.amount}`;
      case "accessory": {
        const eff = item.effects && item.effects.length > 0
          ? ` [${item.effects.join(", ")}]`
          : "";
        return `${item.desc}${eff}`;
      }
    }
  }

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Item 카탈로그</h1>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/quests/items/start-loadout"
            className="px-3 py-2 text-sm rounded-lg border hover:border-blue-400 hover:text-blue-500 transition-colors"
          >
            시작 인벤토리 편집
          </Link>
          <ImportButton onPick={handleImport} />
          <ExportButton filter={filter} />
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            + 새 item
          </button>
        </div>
      </div>

      {/* kind 필터 */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {(["all", "quest", "weapon", "armor", "consumable", "accessory"] as Filter[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1 text-xs rounded border transition-colors ${
              filter === k
                ? "bg-blue-600 text-white border-blue-600"
                : "hover:border-blue-400 hover:text-blue-500"
            }`}
          >
            {k === "all" ? "전체" : k} ({counts[k]})
          </button>
        ))}
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900 space-y-2"
        >
          <FormFields form={createForm} setForm={setCreateForm} idEditable kindEditable />
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1 text-sm rounded bg-blue-600 text-white">생성</button>
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
      ) : visible.length === 0 ? (
        <p className="text-gray-400">
          {filter === "all" ? "등록된 item 이 없습니다." : `${filter} 카테고리에 item 이 없습니다.`}
        </p>
      ) : (
        <>
          {/* 선택 삭제 툴바 */}
          <div className="flex items-center gap-3 mb-2 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="전체 선택"
                checked={allVisibleSelected}
                ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                onChange={toggleSelectAll}
              />
              <span className="text-gray-500">전체 선택</span>
            </label>
            <button
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0 || deleting}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                selectedIds.size === 0 || deleting
                  ? "opacity-50 cursor-not-allowed border-gray-300 text-gray-400"
                  : "border-red-300 text-red-500 hover:bg-red-50"
              }`}
            >
              {deleting ? "삭제 중..." : `선택 삭제 (${selectedIds.size})`}
            </button>
          </div>
          <ul className="space-y-2">
          {visible.map((item) => (
            <li key={item.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    aria-label={`${item.id} 선택`}
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="shrink-0"
                  />
                  <span className="font-mono text-lg w-7 text-center">{item.glyphAscii}</span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.displayName}</div>
                    <div className="text-xs text-gray-500 truncate">
                      <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono mr-2">
                        {item.kind}
                      </span>
                      <span className="font-mono">{item.id}</span>
                      {" · "}{summarize(item)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link
                    href={`/quests/items/${encodeURIComponent(item.id)}/revisions`}
                    className="px-2 py-1 text-xs rounded border hover:border-purple-400 hover:text-purple-500 transition-colors"
                  >
                    히스토리 (v{item.version})
                  </Link>
                  {editingId === item.id ? (
                    <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs rounded border">취소</button>
                  ) : (
                    <button
                      onClick={() => startEdit(item)}
                      className="px-2 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500 transition-colors"
                    >
                      편집
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
              {editingId === item.id && (
                <div className="p-3 bg-white dark:bg-gray-950 space-y-2">
                  <FormFields form={editForm} setForm={setEditForm} idEditable={false} kindEditable={false} />
                  <button onClick={() => handleSave(item.id)} className="px-3 py-1 text-sm rounded bg-blue-600 text-white">
                    저장
                  </button>
                </div>
              )}
            </li>
          ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ImportButton({ onPick }: { onPick: (file: File, kind: ItemKind) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-2 text-sm rounded-lg border border-dashed border-gray-400 hover:border-blue-500 hover:text-blue-500 transition-colors"
      >
        .ron 가져오기
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-10 bg-white dark:bg-gray-900 border rounded-lg shadow-lg p-2 space-y-1 min-w-[160px]">
          {(["quest", "weapon", "armor", "consumable", "accessory"] as ItemKind[]).map((k) => (
            <label
              key={k}
              className="block cursor-pointer px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {k} 파일
              <input
                type="file"
                accept=".ron"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onPick(file, k);
                  e.target.value = "";
                  setOpen(false);
                }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportButton({ filter }: { filter: Filter }) {
  if (filter === "all") {
    return (
      <button
        disabled
        title="kind 필터를 선택해야 export 가능"
        className="px-3 py-2 text-sm rounded-lg border opacity-50 cursor-not-allowed"
      >
        내보내기
      </button>
    );
  }
  return (
    <button
      onClick={() => { window.location.href = `/api/quests/items/export?kind=${filter}`; }}
      className="px-3 py-2 text-sm rounded-lg border hover:border-green-400 hover:text-green-600 transition-colors"
    >
      {filter} 내보내기
    </button>
  );
}

function FormFields({
  form, setForm, idEditable, kindEditable,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  idEditable: boolean;
  kindEditable: boolean;
}) {
  const inputCls = "border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800";
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">id</span>
          <input
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            disabled={!idEditable}
            placeholder="eternal_gem"
            className={`${inputCls} w-48 font-mono ${!idEditable ? "opacity-60" : ""}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">kind</span>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as ItemKind })}
            disabled={!kindEditable}
            className={`${inputCls} ${!kindEditable ? "opacity-60" : ""}`}
          >
            <option value="quest">quest</option>
            <option value="weapon">weapon</option>
            <option value="armor">armor</option>
            <option value="consumable">consumable</option>
            <option value="accessory">accessory</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span className="text-xs text-gray-500">displayName</span>
          <input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="영원의 보석"
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex gap-2 items-end">
        <label className="flex flex-col gap-1 w-20">
          <span className="text-xs text-gray-500">glyph_ascii</span>
          <input value={form.glyphAscii} onChange={(e) => setForm({ ...form, glyphAscii: e.target.value })} className={`${inputCls} font-mono`} />
        </label>
        <label className="flex flex-col gap-1 w-20">
          <span className="text-xs text-gray-500">glyph_unicode</span>
          <input value={form.glyphUnicode} onChange={(e) => setForm({ ...form, glyphUnicode: e.target.value })} className={`${inputCls} font-mono`} />
        </label>
        <label className="flex flex-col gap-1 w-20">
          <span className="text-xs text-gray-500">glyph_game_icon</span>
          <input value={form.glyphGameIcon} onChange={(e) => setForm({ ...form, glyphGameIcon: e.target.value })} className={`${inputCls} font-mono`} />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">pickup_message</span>
        <input
          value={form.pickupMessage}
          onChange={(e) => setForm({ ...form, pickupMessage: e.target.value })}
          className={inputCls}
          placeholder="영원의 보석을 획득했다!"
        />
      </label>

      {/* 종별 필드 */}
      {form.kind === "quest" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">image_path</span>
          <input
            value={form.imagePath}
            onChange={(e) => setForm({ ...form, imagePath: e.target.value })}
            className={`${inputCls} font-mono`}
            placeholder="scene/open-chest.png"
          />
        </label>
      )}

      {form.kind === "weapon" && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <label className="flex flex-col gap-1 w-32">
              <span className="text-xs text-gray-500">attack_power (단일)</span>
              <input
                type="number"
                value={form.attackPower}
                onChange={(e) => setForm({ ...form, attackPower: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 w-40">
              <span className="text-xs text-gray-500">element</span>
              <select
                value={form.element ?? ""}
                onChange={(e) => setForm({ ...form, element: (e.target.value || null) as WeaponElement | null })}
                className={inputCls}
              >
                <option value="">(none)</option>
                <option value="fire">fire</option>
                <option value="ice">ice</option>
                <option value="lightning">lightning</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2 flex-wrap items-end">
            <label className="flex flex-col gap-1 w-28">
              <span className="text-xs text-gray-500">attack_power_min</span>
              <input
                type="number"
                value={form.attackPowerMin}
                onChange={(e) => setForm({ ...form, attackPowerMin: e.target.value === "" ? "" : Number(e.target.value) })}
                className={inputCls}
                placeholder="(없으면 단일값)"
              />
            </label>
            <label className="flex flex-col gap-1 w-28">
              <span className="text-xs text-gray-500">attack_power_max</span>
              <input
                type="number"
                value={form.attackPowerMax}
                onChange={(e) => setForm({ ...form, attackPowerMax: e.target.value === "" ? "" : Number(e.target.value) })}
                className={inputCls}
                placeholder="(없으면 단일값)"
              />
            </label>
            <label className="flex flex-col gap-1 w-20">
              <span className="text-xs text-gray-500">tier (1~5)</span>
              <input
                type="number"
                min={1}
                max={5}
                value={form.tier}
                onChange={(e) => setForm({ ...form, tier: e.target.value === "" ? "" : Number(e.target.value) })}
                className={inputCls}
              />
            </label>
            <span className="text-[10px] text-gray-400">
              min/max + tier 입력 시 게임이 그 범위에서 랜덤 롤
            </span>
          </div>
        </div>
      )}

      {form.kind === "armor" && (
        <div className="space-y-2">
          <label className="flex flex-col gap-1 w-32">
            <span className="text-xs text-gray-500">defense_bonus (단일)</span>
            <input
              type="number"
              value={form.defenseBonus}
              onChange={(e) => setForm({ ...form, defenseBonus: Number(e.target.value) })}
              className={inputCls}
            />
          </label>
          <div className="flex gap-2 flex-wrap items-end">
            <label className="flex flex-col gap-1 w-28">
              <span className="text-xs text-gray-500">defense_bonus_min</span>
              <input
                type="number"
                value={form.defenseBonusMin}
                onChange={(e) => setForm({ ...form, defenseBonusMin: e.target.value === "" ? "" : Number(e.target.value) })}
                className={inputCls}
                placeholder="(없으면 단일값)"
              />
            </label>
            <label className="flex flex-col gap-1 w-28">
              <span className="text-xs text-gray-500">defense_bonus_max</span>
              <input
                type="number"
                value={form.defenseBonusMax}
                onChange={(e) => setForm({ ...form, defenseBonusMax: e.target.value === "" ? "" : Number(e.target.value) })}
                className={inputCls}
                placeholder="(없으면 단일값)"
              />
            </label>
            <label className="flex flex-col gap-1 w-20">
              <span className="text-xs text-gray-500">tier (1~5)</span>
              <input
                type="number"
                min={1}
                max={5}
                value={form.tier}
                onChange={(e) => setForm({ ...form, tier: e.target.value === "" ? "" : Number(e.target.value) })}
                className={inputCls}
              />
            </label>
            <span className="text-[10px] text-gray-400">
              min/max + tier 입력 시 게임이 그 범위에서 랜덤 롤
            </span>
          </div>
        </div>
      )}

      {form.kind === "consumable" && (
        <label className="flex flex-col gap-1 w-32">
          <span className="text-xs text-gray-500">Heal amount</span>
          <input
            type="number"
            value={form.effectAmount}
            onChange={(e) => setForm({ ...form, effectAmount: Number(e.target.value) })}
            className={inputCls}
          />
        </label>
      )}

      {form.kind === "accessory" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">desc (효과 설명)</span>
            <input
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              className={inputCls}
              placeholder="잠입 전용. 착용하면 가드 시야가 붉게 표시된다."
            />
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs text-gray-500">
              effects (효과 키 — 데이터 주도, id 아닌 이 키로 게임 동작 결정)
            </legend>
            <div className="flex flex-col gap-1">
              {ACCESSORY_EFFECTS.map((eff) => {
                const checked = form.effects.includes(eff);
                return (
                  <label key={eff} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.effects, eff]
                          : form.effects.filter((x) => x !== eff);
                        setForm({ ...form, effects: next });
                      }}
                    />
                    <span>
                      <code className="text-xs">{eff}</code>{" "}
                      <span className="text-gray-500">— {ACCESSORY_EFFECT_LABELS[eff]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </>
      )}
    </div>
  );
}
