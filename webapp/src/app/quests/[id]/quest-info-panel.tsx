"use client";

import type { QuestDocument } from "@/types/quest";

interface Props {
  quest: QuestDocument;
  onUpdate: (updated: Partial<Pick<QuestDocument, "title" | "id" | "giverNpc">>) => void;
}

export function QuestInfoPanel({ quest, onUpdate }: Props) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 text-sm">
      <h2 className="font-semibold">퀘스트 정보</h2>

      <section>
        <label className="text-xs font-semibold text-gray-500 block mb-1">제목</label>
        <input
          type="text"
          value={quest.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="w-full border rounded px-2 py-1 text-xs"
        />
      </section>

      <section>
        <label className="text-xs font-semibold text-gray-500 block mb-1">ID</label>
        <input
          type="text"
          value={quest.id}
          onChange={(e) => onUpdate({ id: e.target.value })}
          className="w-full border rounded px-2 py-1 text-xs font-mono"
        />
      </section>

      <section>
        <label className="text-xs font-semibold text-gray-500 block mb-1">Giver NPC</label>
        <input
          type="text"
          value={quest.giverNpc}
          onChange={(e) => onUpdate({ giverNpc: e.target.value })}
          className="w-full border rounded px-2 py-1 text-xs font-mono"
          placeholder="npc_id"
        />
      </section>
    </div>
  );
}
