"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ZoneDocument } from "@/types/zone";

interface FormState {
  name: string;
  generator: string;
  description: string;
}

const emptyForm: FormState = { name: "", generator: "bsp", description: "" };

const KNOWN_GENERATORS = [
  "bsp",
  "bsp_indoor",
  "forest",
  "cellular_automata",
  "organic_village",
];

export default function ZonesPage() {
  const [list, setList] = useState<ZoneDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [extracting, setExtracting] = useState(false);

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
    else alert((await res.json()).message);
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
    else alert((await res.json()).message);
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
      if (data.conflicts.length > 0) {
        msg += `\n\n⚠ generator 불일치 (수동 해결 필요):`;
        for (const c of data.conflicts) {
          msg += `\n  ${c.name}: 카탈로그 "${c.catalogGenerator}" vs 발견 "${c.foundGenerator}"`;
        }
      }
      alert(msg);
      load();
    } else {
      alert((await res.json()).message);
    }
  }

  function startEdit(z: ZoneDocument) {
    setEditingName(z.name);
    setEditForm({ name: z.name, generator: z.generator, description: z.description ?? "" });
  }

  return (
    <div className="mx-auto px-4 py-6">
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
          <input
            value={form.generator}
            onChange={(e) => setForm({ ...form, generator: e.target.value })}
            list="zone-generators"
            placeholder="bsp"
            className={`${inputCls} w-48 font-mono`}
          />
          <datalist id="zone-generators">
            {KNOWN_GENERATORS.map((g) => <option key={g} value={g} />)}
          </datalist>
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
