"use client";

import { SearchHit } from "@/lib/types";
import { Tooltip } from "./Tooltip";

type Props = {
  entities: SearchHit[];
  onRemove: (id: number) => void;
  // Optional: ids whose parent (LEA/SEA) is also selected, with a name
  // for each so we can explain in a tooltip. Pills get an amber tint.
  overlappingIds?: Set<number>;
  parentNames?: Map<number, string>;
};

export function SelectedEntities({
  entities,
  onRemove,
  overlappingIds,
  parentNames,
}: Props) {
  if (entities.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No entities selected yet. Search above or upload a spreadsheet.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entities.map((e) => {
        const overlapping = overlappingIds?.has(e.id) ?? false;
        const parentName = parentNames?.get(e.id);
        const pillClass = overlapping
          ? "inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900"
          : "inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm";
        const pill = (
          <>
            <TypeDot t={e.entity_type} />
            <span className="font-medium">{e.name}</span>
            <span className="text-xs text-gray-400">
              {e.state ?? "??"} · {e.nces_id}
            </span>
            <button
              type="button"
              onClick={() => onRemove(e.id)}
              className="ml-1 text-gray-400 hover:text-red-600"
              aria-label="Remove"
            >
              ×
            </button>
          </>
        );
        return overlapping && parentName ? (
          <Tooltip
            key={e.id}
            label={`Nested inside ${parentName}, which is also selected. Aggregating both will double-count this entity's data.`}
            className={pillClass + " cursor-help"}
          >
            {pill}
          </Tooltip>
        ) : (
          <span key={e.id} className={pillClass}>
            {pill}
          </span>
        );
      })}
    </div>
  );
}

function TypeDot({ t }: { t: "sea" | "lea" | "school" }) {
  const color =
    t === "sea"
      ? "bg-purple-500"
      : t === "lea"
      ? "bg-blue-500"
      : "bg-emerald-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}
