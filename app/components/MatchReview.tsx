"use client";

import { useState } from "react";
import { MatchResult, SearchHit } from "@/lib/types";

type Props = {
  results: MatchResult[];
  onConfirm: (selected: SearchHit[]) => void;
  onCancel: () => void;
};

// Lets the user confirm or override the auto-matched entities for each row
// of an uploaded spreadsheet. Rows with no hits are skipped; rows with an
// auto-selected top hit are checked by default.
export function MatchReview({ results, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<Record<number, number | null>>(
    () => {
      const init: Record<number, number | null> = {};
      results.forEach((r, i) => {
        init[i] = r.chosen?.id ?? null;
      });
      return init;
    }
  );

  const matched = results.filter((r) => r.hits.length > 0).length;
  const auto = results.filter((r) => r.chosen != null).length;
  const unmatched = results.length - matched;

  function confirm() {
    const byId = new Map<number, SearchHit>();
    for (const [i, id] of Object.entries(selected)) {
      if (id == null) continue;
      const r = results[Number(i)];
      const hit = r.hits.find((h) => h.id === id);
      if (hit) byId.set(id, hit);
    }
    onConfirm([...byId.values()]);
  }

  return (
    <div className="rounded-lg border border-gray-300 bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Review matches</h3>
          <p className="text-xs text-gray-500">
            {results.length} rows parsed · {auto} auto-matched · {matched - auto}{" "}
            need review · {unmatched} unmatched
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add selected
          </button>
        </div>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-2 py-2">Include</th>
              <th className="px-2 py-2">Input</th>
              <th className="px-2 py-2">Best match</th>
              <th className="px-2 py-2">Confidence</th>
              <th className="px-2 py-2">Other candidates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {results.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected[i] != null}
                    onChange={(e) =>
                      setSelected((s) => ({
                        ...s,
                        [i]: e.target.checked
                          ? r.hits[0]?.id ?? null
                          : null,
                      }))
                    }
                    disabled={r.hits.length === 0}
                  />
                </td>
                <td className="px-2 py-2 font-mono text-xs">{r.query}</td>
                <td className="px-2 py-2">
                  {r.hits.length === 0 ? (
                    <span className="text-red-600">No match</span>
                  ) : (
                    <div className="flex flex-col">
                      <span className="font-medium">{r.hits[0].name}</span>
                      <span className="text-xs text-gray-500">
                        {r.hits[0].entity_type.toUpperCase()} ·{" "}
                        {r.hits[0].state ?? ""} · {r.hits[0].nces_id}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-xs">
                  {r.hits.length === 0
                    ? "—"
                    : r.hits[0].match_kind === "code"
                    ? "exact code"
                    : `${(r.hits[0].similarity * 100).toFixed(0)}%`}
                </td>
                <td className="px-2 py-2">
                  {r.hits.length > 1 && (
                    <select
                      className="max-w-xs rounded border border-gray-300 px-2 py-1 text-xs"
                      value={selected[i] ?? ""}
                      onChange={(e) =>
                        setSelected((s) => ({
                          ...s,
                          [i]: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                    >
                      <option value="">— skip —</option>
                      {r.hits.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.nces_id}) —{" "}
                          {h.match_kind === "code"
                            ? "exact"
                            : `${(h.similarity * 100).toFixed(0)}%`}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
