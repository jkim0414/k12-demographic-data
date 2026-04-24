"use client";

import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";
import { SearchHit } from "@/lib/types";

type Props = {
  onSelect: (hit: SearchHit) => void;
};

export function EntityAutocomplete({ onSelect }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=15`,
          { signal: ac.signal }
        );
        if (!res.ok) return;
        const body = (await res.json()) as { results: SearchHit[] };
        setResults(body.results);
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") console.error(e);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Command
        shouldFilter={false}
        className="rounded-lg border border-gray-300 bg-white"
      >
        <Command.Input
          value={q}
          onValueChange={(v) => {
            setQ(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search a school, district, or state (by name or NCES code)…"
        />
        {open && q.trim() && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
            <Command.List>
              {loading && (
                <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
              )}
              {!loading && results.length === 0 && (
                <Command.Empty>No matches.</Command.Empty>
              )}
              {results.map((hit) => (
                <Command.Item
                  key={hit.id}
                  value={`${hit.id}`}
                  onSelect={() => {
                    onSelect(hit);
                    setQ("");
                    setResults([]);
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{hit.name}</span>
                    <span className="text-xs text-gray-500">
                      <TypeBadge t={hit.entity_type} /> {hit.state ?? ""} ·{" "}
                      {hit.nces_id}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {hit.match_kind === "code"
                      ? "exact code"
                      : `${(hit.similarity * 100).toFixed(0)}% name match`}
                  </span>
                </Command.Item>
              ))}
            </Command.List>
          </div>
        )}
      </Command>
    </div>
  );
}

function TypeBadge({ t }: { t: "sea" | "lea" | "school" }) {
  const label = t === "sea" ? "SEA" : t === "lea" ? "LEA" : "School";
  const color =
    t === "sea"
      ? "bg-purple-100 text-purple-800"
      : t === "lea"
      ? "bg-blue-100 text-blue-800"
      : "bg-emerald-100 text-emerald-800";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${color}`}
    >
      {label}
    </span>
  );
}
