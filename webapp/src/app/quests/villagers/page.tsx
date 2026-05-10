"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { VillagerDocument } from "@/types/villager";

interface FormState {
  name: string;
  color: [number, number, number];
  dialogs: string;
  questId: string;
  speed: number;
}

const emptyForm: FormState = {
  name: "",
  color: [1.0, 1.0, 1.0],
  dialogs: "",
  questId: "",
  speed: 1.0,
};

export default function VillagersPage() {
  const [list, setList] = useState<VillagerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);

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
    if (!createForm.name.trim()) return;
    const res = await fetch("/api/quests/villagers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createForm.name.trim(),
        color: createForm.color,
        dialogs: parseDialogs(createForm.dialogs),
        questId: createForm.questId.trim() || null,
        speed: createForm.speed,
      }),
    });
    if (res.ok) {
      setCreating(false);
      setCreateForm(emptyForm);
      load();
    } else {
      const json = await res.json();
      alert(json.message);
    }
  }

  async function handleSave(name: string) {
    const res = await fetch(`/api/quests/villagers/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        color: editForm.color,
        dialogs: parseDialogs(editForm.dialogs),
        questId: editForm.questId.trim() || null,
        speed: editForm.speed,
      }),
    });
    if (res.ok) {
      setEditingName(null);
      load();
    } else {
      const json = await res.json();
      alert(json.message);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`"${name}" villager 를 삭제하시겠습니까?`)) return;
    await fetch(`/api/quests/villagers/${encodeURIComponent(name)}`, { method: "DELETE" });
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
      alert(`가져오기 완료: 신규 ${json.data.created}, 갱신 ${json.data.updated}`);
      load();
    } else {
      alert(json.message);
    }
  }

  function startEdit(v: VillagerDocument) {
    setEditingName(v.name);
    setEditForm({
      name: v.name,
      color: [v.color[0], v.color[1], v.color[2]],
      dialogs: v.dialogs.join("\n"),
      questId: v.questId ?? "",
      speed: v.speed,
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
            onClick={() => setCreating(true)}
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
          <FormFields form={createForm} setForm={setCreateForm} nameEditable />
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
            <li key={v.name} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-5 h-5 rounded shrink-0 border border-gray-300"
                    style={{ background: `rgb(${v.color[0] * 255}, ${v.color[1] * 255}, ${v.color[2] * 255})` }}
                    title={`(${v.color.join(", ")})`}
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{v.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {v.questId ? `quest: ${v.questId}` : "일반"} · 대사 {v.dialogs.length}줄 · speed {v.speed}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link
                    href={`/quests/villagers/${encodeURIComponent(v.name)}/revisions`}
                    className="px-2 py-1 text-xs rounded border hover:border-purple-400 hover:text-purple-500 transition-colors"
                  >
                    히스토리 (v{v.version})
                  </Link>
                  {editingName === v.name ? (
                    <button
                      onClick={() => setEditingName(null)}
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
                    onClick={() => handleDelete(v.name)}
                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
              {editingName === v.name && (
                <div className="p-3 bg-white dark:bg-gray-950 space-y-2">
                  <FormFields form={editForm} setForm={setEditForm} nameEditable={false} />
                  <button
                    onClick={() => handleSave(v.name)}
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
  nameEditable,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  nameEditable: boolean;
}) {
  const inputCls = "border rounded px-2 py-1 text-sm w-full bg-white dark:bg-gray-800";
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={!nameEditable}
            placeholder="장로"
            className={`${inputCls} w-40 ${!nameEditable ? "opacity-60" : ""}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">questId (없으면 빈 값)</span>
          <input
            value={form.questId}
            onChange={(e) => setForm({ ...form, questId: e.target.value })}
            placeholder="gem_quest"
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
      <div className="flex gap-2 items-end">
        <span className="text-xs text-gray-500 self-end mb-1">color (RGB 0~1)</span>
        {[0, 1, 2].map((i) => (
          <input
            key={i}
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={form.color[i]}
            onChange={(e) => {
              const c = [...form.color] as [number, number, number];
              c[i] = Number(e.target.value);
              setForm({ ...form, color: c });
            }}
            className={`${inputCls} w-20`}
          />
        ))}
        <span
          className="w-7 h-7 rounded border border-gray-300 ml-1 self-end"
          style={{ background: `rgb(${form.color[0] * 255}, ${form.color[1] * 255}, ${form.color[2] * 255})` }}
        />
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
