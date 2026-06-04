"use client";

import type { Choice, ChoiceCondition, StatKey } from "@/types/web-adventure";
import { ConditionBuilder } from "./conditionBuilder";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const STATS: { value: StatKey; label: string }[] = [
  { value: "str", label: "근력" },
  { value: "dex", label: "민첩" },
  { value: "int", label: "지능" },
  { value: "cha", label: "매력" },
  { value: "con", label: "체력" },
  { value: "wis", label: "지혜" },
];

const inputCls = "w-full border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800";

const stopPropagation = (e: React.PointerEvent) => e.stopPropagation();

// ── reorder helper (테스트 export) ──────────────────────────────────────────────
export function reorderChoices(items: Choice[], from: number, to: number): Choice[] {
  if (from === to) return items;
  return arrayMove(items, from, to);
}

function emptyChoice(kind: Choice["kind"]): Choice {
  switch (kind) {
    case "plain":
      return { kind: "plain", id: "", label: "", to: "" };
    case "probability":
      return {
        kind: "probability",
        id: "",
        label: "",
        stat: "str",
        difficulty: 10,
        onSuccess: "",
        onFailure: "",
      };
    case "conditional":
      return {
        kind: "conditional",
        id: "",
        label: "",
        condition: { kind: "minStat", stat: "str", min: 0 },
        to: "",
      };
  }
}

function SceneSelect({
  value,
  onChange,
  ariaLabel,
  sceneIds,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  sceneIds: string[];
}) {
  // 현재 값이 후보에 없으면 추가하여 표시 (편집 중 임시 상태)
  const options = sceneIds.includes(value) || !value ? sceneIds : [value, ...sceneIds];
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={stopPropagation}
      className={inputCls}
    >
      <option value="">(선택)</option>
      {options.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  );
}

// ── ChoiceCard ────────────────────────────────────────────────────────────────

function ChoiceCard({
  choice,
  onChange,
  onRemove,
  allSceneIds,
}: {
  choice: Choice;
  onChange: (c: Choice) => void;
  onRemove: () => void;
  allSceneIds: string[];
}) {
  const idMissing = !choice.id.trim();
  const labelMissing = !choice.label.trim();
  return (
    <div className="rounded border p-2 space-y-1 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1 flex-1">
          <span className="text-gray-500 shrink-0">종류</span>
          <select
            aria-label="choice kind"
            value={choice.kind}
            onChange={(e) => onChange({ ...emptyChoice(e.target.value as Choice["kind"]), id: choice.id, label: choice.label })}
            onPointerDown={stopPropagation}
            className={inputCls}
          >
            <option value="plain">plain (단순 이동)</option>
            <option value="probability">probability (확률)</option>
            <option value="conditional">conditional (조건부)</option>
          </select>
        </label>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`선택지 "${choice.id || '(없음)'}" 를 삭제하시겠습니까?`)) {
              onRemove();
            }
          }}
          onPointerDown={stopPropagation}
          aria-label={`선택지 ${choice.id} 삭제`}
          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-200 rounded"
        >
          삭제
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1 flex-1">
          <span className="text-gray-500 shrink-0">ID</span>
          <input
            aria-label="choice id"
            value={choice.id}
            onChange={(e) => onChange({ ...choice, id: e.target.value })}
            onPointerDown={stopPropagation}
            placeholder="예: c1"
            className={inputCls}
          />
        </label>
        <label className="flex items-center gap-1 flex-1">
          <span className="text-gray-500 shrink-0">라벨</span>
          <input
            aria-label="choice label"
            value={choice.label}
            onChange={(e) => onChange({ ...choice, label: e.target.value })}
            onPointerDown={stopPropagation}
            placeholder="예: 계속한다"
            className={inputCls}
          />
        </label>
      </div>
      {idMissing && <p className="text-xs text-red-500">ID 는 필수입니다.</p>}
      {labelMissing && <p className="text-xs text-red-500">라벨 은 필수입니다.</p>}

      {choice.kind === "plain" && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-gray-500">다음 씬</span>
          <SceneSelect
            ariaLabel="to"
            value={choice.to}
            onChange={(v) => onChange({ ...choice, to: v })}
            sceneIds={allSceneIds}
          />
        </label>
      )}

      {choice.kind === "probability" && (
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 flex-1">
              <span className="text-gray-500 shrink-0">stat</span>
              <select
                aria-label="stat"
                value={choice.stat}
                onChange={(e) => onChange({ ...choice, stat: e.target.value as StatKey })}
                onPointerDown={stopPropagation}
                className={inputCls}
              >
                {STATS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label} ({s.value})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 w-32">
              <span className="text-gray-500 shrink-0">난이도</span>
              <input
                aria-label="난이도"
                type="number"
                value={choice.difficulty}
                onChange={(e) => onChange({ ...choice, difficulty: Number(e.target.value) })}
                onPointerDown={stopPropagation}
                className={inputCls}
              />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-gray-500">성공 시</span>
            <SceneSelect
              ariaLabel="onSuccess"
              value={choice.onSuccess}
              onChange={(v) => onChange({ ...choice, onSuccess: v })}
              sceneIds={allSceneIds}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-gray-500">실패 시</span>
            <SceneSelect
              ariaLabel="onFailure"
              value={choice.onFailure}
              onChange={(v) => onChange({ ...choice, onFailure: v })}
              sceneIds={allSceneIds}
            />
          </label>
        </div>
      )}

      {choice.kind === "conditional" && (
        <div className="space-y-1 text-xs">
          <ConditionBuilder
            condition={choice.condition}
            onChange={(c: ChoiceCondition) => onChange({ ...choice, condition: c })}
          />
          <label className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-gray-500">다음 씬</span>
            <SceneSelect
              ariaLabel="to"
              value={choice.to}
              onChange={(v) => onChange({ ...choice, to: v })}
              sceneIds={allSceneIds}
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ── SortableChoiceCard ────────────────────────────────────────────────────────

function SortableChoiceCard({
  id,
  choice,
  onChange,
  onRemove,
  allSceneIds,
}: {
  id: string;
  choice: Choice;
  onChange: (c: Choice) => void;
  onRemove: () => void;
  allSceneIds: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-sortable-card
      className="cursor-grab active:cursor-grabbing touch-none"
      {...attributes}
      {...listeners}
    >
      <ChoiceCard choice={choice} onChange={onChange} onRemove={onRemove} allSceneIds={allSceneIds} />
    </div>
  );
}

// ── ChoiceEditor ──────────────────────────────────────────────────────────────

interface Props {
  choices: Choice[];
  onChange: (choices: Choice[]) => void;
  allSceneIds: string[];
}

export function ChoiceEditor({ choices, onChange, allSceneIds }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = choices.map((_, i) => `choice-${i}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) {
      onChange(reorderChoices(choices, from, to));
    }
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {choices.map((c, i) => (
            <SortableChoiceCard
              key={ids[i]}
              id={ids[i]}
              choice={c}
              allSceneIds={allSceneIds}
              onChange={(next) => {
                const arr = [...choices];
                arr[i] = next;
                onChange(arr);
              }}
              onRemove={() => onChange(choices.filter((_, j) => j !== i))}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() => onChange([...choices, emptyChoice("plain")])}
        className="text-xs text-blue-500 hover:text-blue-700"
      >
        + 선택지 추가
      </button>
    </div>
  );
}
