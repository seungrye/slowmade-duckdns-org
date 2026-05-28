"use client";

// 새 게임 시작 시 적용되는 기본 인벤토리 편집 페이지.
// PUT /api/quests/start-loadout 로 저장. weapons/armors/consumables 셀렉트는
// /api/quests/items?kind=... 에서 받아 채운다.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ItemDocument } from "@/types/item";
import type { StartLoadoutDef } from "@/types/start-loadout";

interface ItemOption {
  id: string;
  displayName: string;
}

const EMPTY: StartLoadoutDef = {
  gold: 50,
  weapon: null,
  armor: null,
  items: [],
  consumables: [],
};

export default function StartLoadoutPage() {
  const [def, setDef] = useState<StartLoadoutDef>(EMPTY);
  const [original, setOriginal] = useState<StartLoadoutDef>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 옵션 소스 — weapon/armor/consumable 카탈로그
  const [weapons, setWeapons] = useState<ItemOption[]>([]);
  const [armors, setArmors] = useState<ItemOption[]>([]);
  const [consumables, setConsumables] = useState<ItemOption[]>([]);

  // items 슬롯 — weapon 또는 armor 둘 다 허용. UI 에서는 (id) 만 보관.
  const weaponAndArmorOptions = useMemo(
    () => [...weapons, ...armors].sort((a, b) => a.id.localeCompare(b.id)),
    [weapons, armors],
  );

  async function load() {
    setLoading(true);
    try {
      const [defRes, weaponsRes, armorsRes, consumablesRes] = await Promise.all([
        fetch("/api/quests/start-loadout"),
        fetch("/api/quests/items?kind=weapon"),
        fetch("/api/quests/items?kind=armor"),
        fetch("/api/quests/items?kind=consumable"),
      ]);
      const defJson = await defRes.json();
      const weaponsJson = await weaponsRes.json();
      const armorsJson = await armorsRes.json();
      const consumablesJson = await consumablesRes.json();

      // server 가 _id 등 부가 필드를 포함해서 보낼 수 있으므로 필요한 필드만 추출
      const d = defJson.data ?? EMPTY;
      const normalized: StartLoadoutDef = {
        gold: d.gold ?? 50,
        weapon: d.weapon ?? null,
        armor: d.armor ?? null,
        items: [...(d.items ?? [])],
        consumables: (d.consumables ?? []).map((c: { id: string; count: number }) => ({
          id: c.id, count: c.count,
        })),
      };
      setDef(normalized);
      setOriginal(normalized);
      setWeapons((weaponsJson.data ?? []).map((it: ItemDocument) => ({ id: it.id, displayName: it.displayName })));
      setArmors((armorsJson.data ?? []).map((it: ItemDocument) => ({ id: it.id, displayName: it.displayName })));
      setConsumables((consumablesJson.data ?? []).map((it: ItemDocument) => ({ id: it.id, displayName: it.displayName })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const isDirty = useMemo(
    () => JSON.stringify(def) !== JSON.stringify(original),
    [def, original],
  );

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/quests/start-loadout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(def),
    });
    setSaving(false);
    if (res.ok) {
      setOriginal(def);
      setMessage("저장됨.");
    } else {
      const json = await res.json();
      setMessage(`오류: ${json.message ?? "저장 실패"}`);
    }
  }

  function handleReset() {
    setDef(original);
    setMessage(null);
  }

  // ── items 슬롯 핸들러 ──────────────────────────────────────────────────
  function addItem() {
    const first = weaponAndArmorOptions[0]?.id ?? "";
    setDef({ ...def, items: [...def.items, first] });
  }
  function removeItem(idx: number) {
    setDef({ ...def, items: def.items.filter((_, i) => i !== idx) });
  }
  function updateItem(idx: number, value: string) {
    setDef({ ...def, items: def.items.map((v, i) => (i === idx ? value : v)) });
  }

  // ── consumables 핸들러 ────────────────────────────────────────────────
  function addConsumable() {
    const first = consumables[0]?.id ?? "";
    setDef({ ...def, consumables: [...def.consumables, { id: first, count: 1 }] });
  }
  function removeConsumable(idx: number) {
    setDef({ ...def, consumables: def.consumables.filter((_, i) => i !== idx) });
  }
  function updateConsumable(idx: number, patch: Partial<{ id: string; count: number }>) {
    setDef({
      ...def,
      consumables: def.consumables.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    });
  }

  const inputCls = "border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800";

  return (
    <div className="mx-auto px-4 py-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">시작 인벤토리 편집</h1>
        <Link
          href="/quests/items"
          className="text-sm text-gray-500 hover:text-blue-500 underline"
        >
          ← Item 카탈로그
        </Link>
      </div>
      <p className="text-xs text-gray-500 mb-6">
        새 게임 시작 시 플레이어에게 적용되는 금화·장착 장비·인벤토리 아이템·소모품.
        weapons/armors/consumables 카탈로그에 정의된 id 만 선택 가능.
      </p>

      {loading ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : (
        <div className="space-y-6">
          {/* gold */}
          <section className="space-y-1">
            <label className="text-xs text-gray-500">시작 금화 (gold)</label>
            <input
              type="number"
              min={0}
              value={def.gold}
              onChange={(e) => setDef({ ...def, gold: Number(e.target.value) })}
              className={`${inputCls} w-32`}
            />
          </section>

          {/* weapon */}
          <section className="space-y-1">
            <label className="text-xs text-gray-500">장착 무기 (weapon)</label>
            <select
              value={def.weapon ?? ""}
              onChange={(e) => setDef({ ...def, weapon: e.target.value === "" ? null : e.target.value })}
              className={`${inputCls} w-full max-w-md`}
            >
              <option value="">None (미장착)</option>
              {weapons.map((w) => (
                <option key={w.id} value={w.id}>{w.id} — {w.displayName}</option>
              ))}
            </select>
          </section>

          {/* armor */}
          <section className="space-y-1">
            <label className="text-xs text-gray-500">장착 방어구 (armor)</label>
            <select
              value={def.armor ?? ""}
              onChange={(e) => setDef({ ...def, armor: e.target.value === "" ? null : e.target.value })}
              className={`${inputCls} w-full max-w-md`}
            >
              <option value="">None (미장착)</option>
              {armors.map((a) => (
                <option key={a.id} value={a.id}>{a.id} — {a.displayName}</option>
              ))}
            </select>
          </section>

          {/* items */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">
                인벤토리 무기/방어구 (items) — 중복 허용
              </label>
              <button
                type="button"
                onClick={addItem}
                disabled={weaponAndArmorOptions.length === 0}
                className="px-2 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
              >
                + 추가
              </button>
            </div>
            {def.items.length === 0 ? (
              <p className="text-xs text-gray-400">(없음)</p>
            ) : (
              <ul className="space-y-1">
                {def.items.map((id, idx) => (
                  <li key={idx} className="flex gap-2 items-center">
                    <select
                      value={id}
                      onChange={(e) => updateItem(idx, e.target.value)}
                      className={`${inputCls} flex-1 max-w-md`}
                    >
                      {/* 선택값이 현재 옵션에 없는 경우(레거시 데이터) 도 그대로 표시 */}
                      {!weaponAndArmorOptions.some((o) => o.id === id) && id !== "" && (
                        <option value={id}>{id} (알 수 없는 id)</option>
                      )}
                      {weaponAndArmorOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.id} — {o.displayName}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="px-2 py-1 text-xs rounded border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-colors"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* consumables */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">소모품 (consumables)</label>
              <button
                type="button"
                onClick={addConsumable}
                disabled={consumables.length === 0}
                className="px-2 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
              >
                + 추가
              </button>
            </div>
            {def.consumables.length === 0 ? (
              <p className="text-xs text-gray-400">(없음)</p>
            ) : (
              <ul className="space-y-1">
                {def.consumables.map((c, idx) => (
                  <li key={idx} className="flex gap-2 items-center">
                    <select
                      value={c.id}
                      onChange={(e) => updateConsumable(idx, { id: e.target.value })}
                      className={`${inputCls} flex-1 max-w-md`}
                    >
                      {!consumables.some((o) => o.id === c.id) && c.id !== "" && (
                        <option value={c.id}>{c.id} (알 수 없는 id)</option>
                      )}
                      {consumables.map((o) => (
                        <option key={o.id} value={o.id}>{o.id} — {o.displayName}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={c.count}
                      onChange={(e) => updateConsumable(idx, { count: Number(e.target.value) })}
                      className={`${inputCls} w-20`}
                      aria-label="count"
                    />
                    <button
                      type="button"
                      onClick={() => removeConsumable(idx)}
                      className="px-2 py-1 text-xs rounded border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-colors"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 저장/취소 */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saving}
              className={`px-4 py-2 text-sm rounded ${
                !isDirty || saving
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty || saving}
              className="px-3 py-2 text-sm rounded border disabled:opacity-50"
            >
              되돌리기
            </button>
            {message && (
              <span className={`text-xs ${message.startsWith("오류") ? "text-red-500" : "text-green-600"}`}>
                {message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
