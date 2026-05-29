"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ZoneDocument } from "@/types/zone";
import { useInfoDialog } from "@/components/info-dialog";

interface FormState {
  name: string;
  generator: string;
  description: string;
}

const emptyForm: FormState = { name: "", generator: "bsp", description: "" };

// 게임에 등록된 모든 generator (`bevy-rogue/src/modules/map/generators/*.rs`).
// strict select 로 노출하므로 새 generator 추가 시 여기도 갱신해야 한다.
// 카테고리 그룹 + 설명을 함께 보유 — <optgroup> 으로 렌더링.
const GENERATOR_GROUPS: { category: string; items: { id: string; desc: string }[] }[] = [
  {
    category: "던전 (방+복도)",
    items: [
      { id: "tinykeep",           desc: "TinyKeep — 들로네/MST 기반 부정형 방 배치 + 유기적 복도 네트워크" },
      { id: "bsp",                desc: "BSP 분할, 규칙적 방 + 깔끔한 복도" },
      { id: "rooms",              desc: "크기 다양한 방 랜덤 배치 (simple_rooms)" },
      { id: "recursive_division", desc: "재귀 분할 (미로 변형)" },
    ],
  },
  {
    category: "동굴 (유기적)",
    items: [
      { id: "drunkard",           desc: "술취한 보행, 굴곡진 통로" },
      { id: "cellular_automata",  desc: "자연 침식 동굴" },
      { id: "dla",                desc: "디퓨전 한정 응집, 중심에서 뻗는 침식 구조" },
    ],
  },
  {
    category: "실내 (건물 평면도)",
    items: [
      { id: "bsp_indoor",         desc: "BSP 소규모 적용" },
      { id: "prefab",             desc: "손제작 방 청사진 조합" },
    ],
  },
  {
    category: "마을",
    items: [
      { id: "organic_village",    desc: "유기적 건물 배치" },
      { id: "grid_village",       desc: "격자 도로망 + 블록" },
      { id: "walled_town",        desc: "성벽 마을 (잠입 퀘스트용)" },
    ],
  },
  {
    category: "미로",
    items: [
      { id: "maze",               desc: "Wilson 알고리즘 미로" },
      { id: "maze_prim",          desc: "Prim 알고리즘 미로" },
    ],
  },
  {
    category: "보로노이/구획",
    items: [
      { id: "voronoi_rooms",      desc: "보로노이 셀 = 방" },
      { id: "voronoi_districts",  desc: "보로노이 구획 + 도로" },
    ],
  },
  {
    category: "자연 (숲)",
    items: [
      { id: "forest",             desc: "나무 군집 + 좁은 길" },
      { id: "perlin",             desc: "펄린 노이즈 자연 지형" },
    ],
  },
  {
    category: "수상/해안 (Water/Sand 타일)",
    items: [
      { id: "coastal",            desc: "해안선" },
      { id: "island",             desc: "단일 섬" },
      { id: "archipelago",        desc: "군도 (여러 섬)" },
      { id: "ocean",              desc: "외해" },
      { id: "biome_world",        desc: "다중 바이옴" },
    ],
  },
  {
    category: "알고리즘 기반",
    items: [
      { id: "wfc",                desc: "Wave Function Collapse" },
    ],
  },
];

// 필요시 평면 id 배열: `GENERATOR_GROUPS.flatMap((g) => g.items.map((i) => i.id))`.
// Next page 파일은 named export 제약이 있어 별도 상수로 두지 않는다(테스트에서 직접 사용).

export default function ZonesPage() {
  const [list, setList] = useState<ZoneDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [extracting, setExtracting] = useState(false);
  const { showInfo } = useInfoDialog();

  async function load() {
    setLoading(true);
    const res = await fetch("/api/quests/zones");
    const json = await res.json();
    setList(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.generator.trim()) return;
    const res = await fetch("/api/quests/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    if (res.ok) { setCreating(false); setCreateForm(emptyForm); load(); }
    else showInfo({ title: "생성 실패", body: (await res.json()).message ?? "알 수 없는 오류", variant: "error" });
  }

  async function handleSave(name: string) {
    const res = await fetch(`/api/quests/zones/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generator: editForm.generator,
        description: editForm.description,
      }),
    });
    if (res.ok) { setEditingName(null); load(); }
    else showInfo({ title: "저장 실패", body: (await res.json()).message ?? "알 수 없는 오류", variant: "error" });
  }

  async function handleDelete(name: string) {
    if (!confirm(`"${name}" zone 을 삭제하시겠습니까?`)) return;
    await fetch(`/api/quests/zones/${encodeURIComponent(name)}`, { method: "DELETE" });
    load();
  }

  async function handleExtract() {
    if (!confirm("모든 quest 의 OpenPortal 액션을 스캔해 카탈로그에 추가합니다. 진행하시겠습니까?")) return;
    setExtracting(true);
    const res = await fetch("/api/quests/zones/extract", { method: "POST" });
    setExtracting(false);
    if (res.ok) {
      const { data } = await res.json();
      let msg = `추출 완료: 신규 ${data.created}, 건너뜀 ${data.skipped}`;
      const hasConflicts = data.conflicts.length > 0;
      if (hasConflicts) {
        msg += `\n\n⚠ generator 불일치 (수동 해결 필요):`;
        for (const c of data.conflicts) {
          msg += `\n  ${c.name}: 카탈로그 "${c.catalogGenerator}" vs 발견 "${c.foundGenerator}"`;
        }
      }
      showInfo({
        title: hasConflicts ? "zone 추출 — 충돌 있음" : "zone 추출 완료",
        body: msg,
        variant: hasConflicts ? "warning" : "success",
      });
      load();
    } else {
      showInfo({ title: "zone 추출 실패", body: (await res.json()).message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  function startEdit(z: ZoneDocument) {
    setEditingName(z.name);
    setEditForm({ name: z.name, generator: z.generator, description: z.description ?? "" });
  }

  return (
    <div className="mx-auto px-4 py-6">
      {/*
        시스템 정적 zone 안내 — 게임 코드의 ZoneId enum 에 박혀 있는 zone 들.
        DB 등록 대상이 아니고 카탈로그에 추가되지 않지만, villager.homeZone /
        OpenZonePortal 액션에서 이 식별자들을 참조할 수 있다.
      */}
      <SystemZonesPanel />
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Zone 카탈로그</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="px-3 py-2 text-sm rounded-lg border hover:border-purple-400 hover:text-purple-500 transition-colors disabled:opacity-50"
          >
            {extracting ? "추출 중..." : "퀘스트에서 추출"}
          </button>
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            + 새 zone
          </button>
        </div>
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900 space-y-2"
        >
          <FormFields form={createForm} setForm={setCreateForm} nameEditable />
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
      ) : list.length === 0 ? (
        <p className="text-gray-400">등록된 zone 이 없습니다. 퀘스트에서 추출 또는 + 새 zone 으로 추가하세요.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((z) => (
            <li key={z.name} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900">
                <div className="min-w-0">
                  <div className="font-medium truncate">{z.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono mr-2">
                      {z.generator}
                    </span>
                    {z.description || <span className="text-gray-400">(설명 없음)</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link
                    href={`/quests/zones/${encodeURIComponent(z.name)}/revisions`}
                    className="px-2 py-1 text-xs rounded border hover:border-purple-400 hover:text-purple-500 transition-colors"
                  >
                    히스토리 (v{z.version})
                  </Link>
                  {editingName === z.name ? (
                    <button onClick={() => setEditingName(null)} className="px-2 py-1 text-xs rounded border">취소</button>
                  ) : (
                    <button
                      onClick={() => startEdit(z)}
                      className="px-2 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500 transition-colors"
                    >
                      편집
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(z.name)}
                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
              {editingName === z.name && (
                <div className="p-3 bg-white dark:bg-gray-950 space-y-2">
                  <FormFields form={editForm} setForm={setEditForm} nameEditable={false} />
                  <button onClick={() => handleSave(z.name)} className="px-3 py-1 text-sm rounded bg-blue-600 text-white">
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

/**
 * 시스템 정적 zone (게임의 `ZoneId::Town`) 패널 — DB 카탈로그가 아닌, 코드에 박혀
 * 있는 시작 zone 의 참조 카드. villager.homeZone / OpenZonePortal 액션에서 이
 * 식별자를 직접 쓴다. 편집 대상이 아니므로 read-only.
 *
 * 그 외 zone (forest/dungeon_<N>/mountain_village/seaside_harbor 등) 은 모두
 * `Named(id)` 로 통일되어 아래 일반 카탈로그에 등록·편집 가능하다.
 */
function SystemZonesPanel() {
  const systemZones: { name: string; generator: string; desc: string }[] = [
    { name: "Town", generator: "organic_village", desc: "시작 마을 — 신규 게임 진입 zone (유일한 정적 ZoneId)" },
  ];
  return (
    <details className="mb-6 border rounded-lg bg-gray-50 dark:bg-gray-900">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">
        시스템 정적 zone ({systemZones.length}개) — 게임의 ZoneId::Town
      </summary>
      <div className="p-3 border-t text-xs space-y-1">
        <p className="text-gray-500">
          <code className="px-1 mx-0.5 font-mono">Town</code> 은 코드에 정의된 유일한
          정적 zone 으로 DB 카탈로그에 등록되지 않습니다.
          <code className="px-1 mx-0.5 font-mono">villager.homeZone</code> 과
          <code className="px-1 mx-0.5 font-mono">OpenZonePortal</code> 액션의 target 에서
          참조됩니다. 그 외 모든 zone (forest, dungeon_1, mountain_village,
          seaside_harbor 등) 은 아래 카탈로그에 Named id 로 등록됩니다.
        </p>
        <ul className="space-y-1 mt-2">
          {systemZones.map((z) => (
            <li key={z.name} className="flex gap-2 items-center">
              <span className="font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">{z.name}</span>
              <span className="font-mono text-gray-500">{z.generator}</span>
              <span className="text-gray-600 dark:text-gray-400">— {z.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function FormFields({
  form, setForm, nameEditable,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  nameEditable: boolean;
}) {
  const inputCls = "border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800";
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={!nameEditable}
            placeholder="demon_cave"
            className={`${inputCls} w-48 font-mono ${!nameEditable ? "opacity-60" : ""}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">generator</span>
          {/*
            게임이 모르는 generator 가 들어가면 그 zone 진입 시 깨지므로
            datalist 자유입력 대신 strict select 로 고정. KNOWN_GENERATORS 는
            게임의 등록 generator 와 동일.
          */}
          <select
            value={form.generator}
            onChange={(e) => setForm({ ...form, generator: e.target.value })}
            className={`${inputCls} w-72 font-mono`}
          >
            {GENERATOR_GROUPS.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.items.map((i) => (
                  <option key={i.id} value={i.id}>{i.id} — {i.desc}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">description (선택)</span>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="용도 메모"
          className={inputCls}
        />
      </label>
    </div>
  );
}
