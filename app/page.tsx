"use client";

import { useEffect, useMemo, useState } from "react";
import { EntityAutocomplete } from "./components/EntityAutocomplete";
import { FileUpload } from "./components/FileUpload";
import { MatchReview } from "./components/MatchReview";
import { ResultsPanel } from "./components/ResultsPanel";
import { SelectedEntities } from "./components/SelectedEntities";
import { Aggregate, Entity, MatchResult, SearchHit } from "@/lib/types";

// Find selected entities that are nested inside another selected entity —
// e.g. a school whose LEA is also selected, or an LEA whose SEA is also
// selected. Aggregating both would double-count, so the UI surfaces this
// and offers to drop the descendants.
function findOverlaps(selected: SearchHit[]): {
  overlappingIds: Set<number>;
  parentNames: Map<number, string>;
} {
  const byNcesId = new Map<string, SearchHit>();
  for (const e of selected) byNcesId.set(e.nces_id, e);

  const overlappingIds = new Set<number>();
  const parentNames = new Map<number, string>();
  for (const e of selected) {
    let parent: SearchHit | undefined;
    if (e.lea_id && byNcesId.has(e.lea_id)) parent = byNcesId.get(e.lea_id);
    else if (e.sea_id && byNcesId.has(e.sea_id)) parent = byNcesId.get(e.sea_id);
    if (parent) {
      overlappingIds.add(e.id);
      parentNames.set(e.id, parent.name);
    }
  }
  return { overlappingIds, parentNames };
}

export default function Page() {
  const [selected, setSelected] = useState<SearchHit[]>([]);
  const [pendingMatches, setPendingMatches] = useState<MatchResult[] | null>(
    null
  );
  const [agg, setAgg] = useState<{ entities: Entity[]; aggregate: Aggregate } | null>(null);
  const [aggLoading, setAggLoading] = useState(false);

  const { overlappingIds, parentNames } = useMemo(
    () => findOverlaps(selected),
    [selected]
  );

  function removeOverlaps() {
    setSelected((s) => s.filter((e) => !overlappingIds.has(e.id)));
  }

  // Re-aggregate whenever selection changes.
  useEffect(() => {
    if (selected.length === 0) {
      setAgg(null);
      return;
    }
    const ids = selected.map((s) => s.id);
    const ac = new AbortController();
    setAggLoading(true);
    fetch("/api/aggregate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      signal: ac.signal,
    })
      .then((r) => r.json())
      .then((b) => setAgg(b))
      .catch((e) => {
        if (e?.name !== "AbortError") console.error(e);
      })
      .finally(() => setAggLoading(false));
    return () => ac.abort();
  }, [selected]);

  function addHit(hit: SearchHit) {
    setSelected((s) => (s.some((x) => x.id === hit.id) ? s : [...s, hit]));
  }

  function removeId(id: number) {
    setSelected((s) => s.filter((x) => x.id !== id));
  }

  function onMatched(results: MatchResult[]) {
    setPendingMatches(results);
  }

  function confirmMatches(hits: SearchHit[]) {
    setSelected((s) => {
      const seen = new Set(s.map((x) => x.id));
      return [...s, ...hits.filter((h) => !seen.has(h.id))];
    });
    setPendingMatches(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          K-12 District Data Explorer
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Aggregate enrollment, demographics, staff, and community data
          for U.S. schools, districts, and state education agencies.
          Sources: NCES CCD, CRDC, and Census (SAIPE + ACS).
        </p>
      </header>

      <section className="mb-6 space-y-3">
        <label className="text-sm font-medium text-gray-700">
          Add entities
        </label>
        <EntityAutocomplete onSelect={addHit} />
        <FileUpload onMatched={onMatched} />
      </section>

      {pendingMatches && (
        <section className="mb-6">
          <MatchReview
            results={pendingMatches}
            onConfirm={confirmMatches}
            onCancel={() => setPendingMatches(null)}
          />
        </section>
      )}

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Selected ({selected.length})
          </h2>
          {selected.length > 0 && (
            <button
              onClick={() => setSelected([])}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              Clear all
            </button>
          )}
        </div>
        <SelectedEntities
          entities={selected}
          onRemove={removeId}
          overlappingIds={overlappingIds}
          parentNames={parentNames}
        />
      </section>

      {overlappingIds.size > 0 && (
        <OverlapBanner
          count={overlappingIds.size}
          onRemove={removeOverlaps}
        />
      )}

      {aggLoading && (
        <p className="text-sm text-gray-500">Aggregating…</p>
      )}
      {agg && !aggLoading && (
        <ResultsPanel agg={agg.aggregate} entities={agg.entities} />
      )}
    </main>
  );
}

function OverlapBanner({
  count,
  onRemove,
}: {
  count: number;
  onRemove: () => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <p>
        <span className="font-semibold">Heads up:</span> {count} selected{" "}
        {count === 1 ? "entity is" : "entities are"} nested inside another
        selected entity (e.g. a school whose district is also selected).
        Totals below will double-count{count === 1 ? " it" : " them"}.
      </p>
      <button
        onClick={onRemove}
        className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
      >
        Remove {count === 1 ? "1 overlap" : `${count} overlaps`}
      </button>
    </div>
  );
}
