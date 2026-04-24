"use client";

import Papa from "papaparse";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { MatchResult } from "@/lib/types";

type ParsedRow = { raw: string; code?: string; name?: string };

type Props = {
  onMatched: (results: MatchResult[]) => void;
};

export function FileUpload({ onMatched }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    setLoading(true);
    try {
      const rows = await parseFile(file);
      const queries = rowsToQueries(rows);
      if (queries.length === 0) {
        setError(
          "No recognizable entity column. Expected a column named `nces_id`, `code`, `leaid`, `ncessch`, or `name`."
        );
        return;
      }
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries }),
      });
      if (!res.ok) {
        setError(`Match API returned ${res.status}`);
        return;
      }
      const body = (await res.json()) as { results: MatchResult[] };
      onMatched(body.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "Parsing…" : "Upload spreadsheet"}
      </button>
      {fileName && !error && (
        <span className="ml-2 text-xs text-gray-500">{fileName}</span>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-700">{error}</p>
      )}
      <p className="mt-1 text-xs text-gray-500">
        CSV, TSV, or XLSX. The first row must be a header. We look for either
        an NCES-ID column (any of <code>nces_id</code>, <code>leaid</code>,{" "}
        <code>ncessch</code>, <code>district_id</code>, <code>school_id</code>) or
        a name column (any of <code>name</code>, <code>school_name</code>,{" "}
        <code>district_name</code>, <code>lea_name</code>). If both are present,
        the NCES ID is used first (exact match) and the name is used as a
        fallback (fuzzy match). A single-column file is treated as names.
      </p>
    </div>
  );
}

async function parseFile(file: File): Promise<Record<string, string>[]> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
      defval: "",
      raw: false,
    });
  }
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}

function rowsToQueries(rows: Record<string, string>[]): ParsedRow[] {
  if (rows.length === 0) return [];
  const cols = Object.keys(rows[0]).map((c) => c.toLowerCase().trim());
  const codeCol = cols.find((c) =>
    ["nces_id", "ncesid", "leaid", "ncessch", "school_id", "district_id"].includes(c)
  );
  const nameCol = cols.find((c) =>
    ["name", "school_name", "lea_name", "district_name", "entity_name"].includes(c)
  );

  if (!codeCol && !nameCol) {
    // fall back: treat single-column input as name
    if (cols.length === 1) {
      return rows
        .map((r) => ({ raw: String(Object.values(r)[0] ?? "").trim() }))
        .filter((q) => q.raw.length > 0)
        .map((q) => ({ ...q, name: q.raw }));
    }
    return [];
  }

  const out: ParsedRow[] = [];
  for (const r of rows) {
    const lower: Record<string, string> = {};
    for (const k of Object.keys(r)) lower[k.toLowerCase().trim()] = String(r[k] ?? "").trim();
    const code = codeCol ? lower[codeCol] : "";
    const name = nameCol ? lower[nameCol] : "";
    const raw = code || name;
    if (!raw) continue;
    out.push({ raw, code: code || undefined, name: name || undefined });
  }
  return out;
}
