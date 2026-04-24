"use client";

import { useEffect, useState } from "react";
import { EntityAutocomplete } from "./components/EntityAutocomplete";
import { FileUpload } from "./components/FileUpload";
import { MatchReview } from "./components/MatchReview";
import { ResultsPanel } from "./components/ResultsPanel";
import { SelectedEntities } from "./components/SelectedEntities";
import { Aggregate, Entity, MatchResult, SearchHit } from "@/lib/types";

export default function Page() {
  const [selected, setSelected] = useState<SearchHit[]>([]);
  const [pendingMatches, setPendingMatches] = useState<MatchResult[] | null>(
    null
  );
  const [agg, setAgg] = useState<{ entities: Entity[]; aggregate: Aggregate } | null>(null);
  const [aggLoading, setAggLoading] = useState(false);

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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          K-12 Demographic Data
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Look up and aggregate NCES demographic data for schools (NCESSCH),
          districts (LEAID), and state education agencies (SEA FIPS). Search by
          name with fuzzy matching or by NCES code with exact matching, or
          upload a spreadsheet of entities.
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
        <SelectedEntities entities={selected} onRemove={removeId} />
      </section>

      {aggLoading && (
        <p className="text-sm text-gray-500">Aggregating…</p>
      )}
      {agg && !aggLoading && (
        <ResultsPanel agg={agg.aggregate} entities={agg.entities} />
      )}
    </main>
  );
}
