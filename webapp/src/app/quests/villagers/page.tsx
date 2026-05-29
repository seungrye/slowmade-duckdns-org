"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { VillagerDocument } from "@/types/villager";
import type { ZoneIdValue } from "@/types/zone";
import { useInfoDialog } from "@/components/info-dialog";

interface FormState {
  id: string;
  name: string;
  color: [number, number, number];
  dialogs: string;
  speed: number;
  stationary: boolean;
  vendor: boolean;
  /**
   * homeZone — Town 만 정적, 그 외 모든 zone 은 Named(id) 로 통일된 schema.
   * 표준 Named id (mountain_village/seaside_harbor/forest/dungeon_<N>) 와 site
   * 카탈로그의 동적 Named zone 모두 같은 입력칸으로 처리.
   */
  homeZoneTag: HomeZoneTag;
  homeZoneNamedId: string;
}

// `homeZone` UI 태그 — Town 또는 Named.
type HomeZoneTag = "Town" | "Named";

const HOME_ZONE_OPTIONS: { tag: HomeZoneTag; label: string }[] = [
  { tag: "Town",  label: "마을 (Town) — 시작 마을 · 기본값" },
  { tag: "Named", label: 'Named("…") — id 로 모든 zone' },
];

/** UI 자동완성용 표준 Named id (게임 코드 내장) + 동적 카탈로그 zone. */
const STANDARD_NAMED_ZONES: { id: string; label: string }[] = [
  { id: "mountain_village", label: "mountain_village — 산속 마을 (사냥꾼/광부/전사)" },
  { id: "seaside_harbor",   label: "seaside_harbor — 항구 마을 (탐험가/마법사)" },
  { id: "forest",           label: "forest — 숲" },
  { id: "dungeon_1",        label: "dungeon_1 — 던전 1층" },
  { id: "dungeon_2",        label: "dungeon_2 — 던전 2층" },
];

function tagFromHomeZone(z: ZoneIdValue | undefined): HomeZoneTag {
  if (!z) return "Town";
  return z.type === "Town" ? "Town" : "Named";
}

function homeZoneFromForm(form: FormState): ZoneIdValue {
  if (form.homeZoneTag === "Town") return { type: "Town" };
  return { type: "Named", id: form.homeZoneNamedId.trim() };
}

const emptyForm: FormState = {
  id: "",
  name: "",
  color: [1.0, 1.0, 1.0],
  dialogs: "",
  speed: 1.0,
  stationary: false,
  vendor: false,
  homeZoneTag: "Town",
  homeZoneNamedId: "",
};

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

export default function VillagersPage() {
  const [list, setList] = useState<VillagerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const { showInfo } = useInfoDialog();

  async function load() {
    setLoading(true);
    const res = await fetch("/api/quests/villagers");
    const json = await res.json();
    setList(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.id.trim() || !createForm.name.trim()) return;
    const res = await fetch("/api/quests/villagers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createForm.id.trim(),
        name: createForm.name.trim(),
        color: createForm.color,
        dialogs: parseDialogs(createForm.dialogs),
        speed: createForm.speed,
        stationary: createForm.stationary,
        vendor: createForm.vendor,
        homeZone: homeZoneFromForm(createForm),
      }),
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
    const res = await fetch(`/api/quests/villagers/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name.trim(),
        color: editForm.color,
        dialogs: parseDialogs(editForm.dialogs),
        speed: editForm.speed,
        stationary: editForm.stationary,
        vendor: editForm.vendor,
        homeZone: homeZoneFromForm(editForm),
      }),
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
    if (!confirm(`"${id}" villager 를 삭제하시겠습니까?`)) return;
    await fetch(`/api/quests/villagers/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  async function handleImport(file: File) {
    const text = await file.text();
    const res = await fetch("/api/quests/villagers/import", {
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

  function startEdit(v: VillagerDocument) {
    setEditingId(v.id);
    const tag = tagFromHomeZone(v.homeZone);
    setEditForm({
      id: v.id,
      name: v.name,
      color: [v.color[0], v.color[1], v.color[2]],
      dialogs: v.dialogs.join("\n"),
      speed: v.speed,
      stationary: !!v.stationary,
      vendor: !!v.vendor,
      homeZoneTag: tag,
      homeZoneNamedId: v.homeZone?.type === "Named" ? v.homeZone.id : "",
    });
  }

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Villager 카탈로그</h1>
        <div className="flex gap-2">
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
            onClick={() => { window.location.href = "/api/quests/villagers/export"; }}
            className="px-3 py-2 text-sm rounded-lg border hover:border-green-400 hover:text-green-600 transition-colors"
          >
            내보내기
          </button>
          <button
            onClick={() => { setCreateForm({ ...emptyForm, color: randomColor() }); setCreating(true); }}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            + 새 villager
          </button>
        </div>
      </div>

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
        <p className="text-gray-400">등록된 villager 가 없습니다. .ron 가져오기로 시드하거나 + 새 villager 로 추가하세요.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((v) => (
            <li key={v.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-5 h-5 rounded shrink-0 border border-gray-300"
                    style={{ background: `rgb(${v.color[0] * 255}, ${v.color[1] * 255}, ${v.color[2] * 255})` }}
                    title={`(${v.color.join(", ")})`}
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {v.name} <span className="font-mono text-xs text-gray-400">{v.id}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      대사 {v.dialogs.length}줄 · speed {v.speed}
                      {v.homeZone && v.homeZone.type !== "Town" && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-mono">
                          {`Named("${v.homeZone.id}")`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link
                    href={`/quests/villagers/${encodeURIComponent(v.id)}/revisions`}
                    className="px-2 py-1 text-xs rounded border hover:border-purple-400 hover:text-purple-500 transition-colors"
                  >
                    히스토리 (v{v.version})
                  </Link>
                  {editingId === v.id ? (
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 text-xs rounded border"
                    >
                      취소
                    </button>
                  ) : (
                    <button
                      onClick={() => startEdit(v)}
                      className="px-2 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500 transition-colors"
                    >
                      편집
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(v.id)}
                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
              {editingId === v.id && (
                <div className="p-3 bg-white dark:bg-gray-950 space-y-2">
                  <FormFields form={editForm} setForm={setEditForm} idEditable={false} />
                  <button
                    onClick={() => handleSave(v.id)}
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

function parseDialogs(s: string): string[] {
  return s.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
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
          <span className="text-xs text-gray-500">id (퀘스트 giver_npc 가 참조)</span>
          <input
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            disabled={!idEditable}
            placeholder="elder"
            className={`${inputCls} w-40 font-mono ${!idEditable ? "opacity-60" : ""}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">name (표시용)</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="장로"
            className={`${inputCls} w-40`}
          />
        </label>
        <label className="flex flex-col gap-1 w-20">
          <span className="text-xs text-gray-500">speed</span>
          <input
            type="number"
            step={0.05}
            value={form.speed}
            onChange={(e) => setForm({ ...form, speed: Number(e.target.value) })}
            className={inputCls}
          />
        </label>
      </div>
      <div className="flex gap-2 items-center">
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
      </div>
      <div className="flex gap-4 items-center">
        <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs">
          <input
            type="checkbox"
            aria-label="stationary"
            checked={form.stationary}
            onChange={(e) => setForm({ ...form, stationary: e.target.checked })}
          />
          <span>stationary <span className="text-gray-400">(가판대 뒤 고정 NPC)</span></span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs">
          <input
            type="checkbox"
            aria-label="vendor"
            checked={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.target.checked })}
          />
          <span>vendor <span className="text-gray-400">(상호작용 시 상점 열림)</span></span>
        </label>
      </div>
      {/*
        home_zone 선택 — Town 만 정적, 그 외 모든 zone 은 Named(id) 로 통일된 schema.
        Named 일 때는 표준 Named id(mountain_village 등) + 카탈로그 zone 을 datalist
        로 자동완성한다.
      */}
      <div className="flex gap-2 items-end flex-wrap">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">home_zone (거주 zone)</span>
          <select
            aria-label="home_zone"
            value={form.homeZoneTag}
            onChange={(e) => setForm({ ...form, homeZoneTag: e.target.value as HomeZoneTag })}
            className={`${inputCls} w-80`}
          >
            {HOME_ZONE_OPTIONS.map((o) => (
              <option key={o.tag} value={o.tag}>{o.label}</option>
            ))}
          </select>
        </label>
        {form.homeZoneTag === "Named" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Named id</span>
            <input
              aria-label="named_id"
              list="home-zone-named-ids"
              value={form.homeZoneNamedId}
              onChange={(e) => setForm({ ...form, homeZoneNamedId: e.target.value })}
              placeholder="mountain_village / seaside_harbor / forest / dungeon_1 / herb_glade"
              className={`${inputCls} w-96 font-mono`}
            />
            <datalist id="home-zone-named-ids">
              {STANDARD_NAMED_ZONES.map((z) => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </datalist>
          </label>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">dialogs (한 줄 = 한 대사, 빈 줄 무시)</span>
        <textarea
          rows={6}
          value={form.dialogs}
          onChange={(e) => setForm({ ...form, dialogs: e.target.value })}
          placeholder="안녕하세요.&#10;마을은 평화롭소."
          className={`${inputCls} resize-y font-mono text-xs`}
        />
      </label>
    </div>
  );
}
