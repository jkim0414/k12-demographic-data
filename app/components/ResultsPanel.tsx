"use client";

import {
  Aggregate,
  CCD_YEAR,
  CRDC_YEAR,
  DEMOGRAPHIC_FIELDS,
  DEMOGRAPHIC_LABELS,
  DEMOGRAPHIC_SOURCE,
  DemographicField,
  Entity,
  RACE_FIELDS,
} from "@/lib/types";
import { formatInt, formatPct } from "@/lib/aggregate";

const PROGRAM_FIELDS: DemographicField[] = [
  "frl_eligible",
  "english_learners",
  "swd",
];

type Props = {
  agg: Aggregate;
  entities: Entity[];
};

export function ResultsPanel({ agg, entities }: Props) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-300 bg-white p-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">Aggregate demographics</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {agg.entity_count.toLocaleString()} entities · total enrollment{" "}
              {formatInt(agg.total_enrollment)}
            </span>
            <ExportMenu agg={agg} entities={entities} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
          <BreakdownTable
            title="Race / ethnicity"
            fields={RACE_FIELDS}
            agg={agg}
          />
          <BreakdownTable
            title="Programs"
            fields={PROGRAM_FIELDS}
            agg={agg}
          />
        </div>
        <p className="mt-4 text-[11px] text-gray-400">
          Sources: NCES CCD {CCD_YEAR} for enrollment, race/ethnicity, and
          FRL. CRDC {CRDC_YEAR} for English learners and students with
          disabilities (CCD no longer publishes those counts at the directory
          level; CRDC is biennial, so the vintage differs).
        </p>
      </div>

      <div className="rounded-lg border border-gray-300 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Included entities ({entities.length})
        </h3>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">State</th>
                <th className="px-2 py-2">NCES ID</th>
                <th className="px-2 py-2 text-right">Enrollment</th>
                <th className="px-2 py-2 text-right">FRL</th>
                <th className="px-2 py-2 text-right" title="English learners (CRDC 2021-22)">EL</th>
                <th className="px-2 py-2 text-right" title="Students with disabilities (CRDC 2021-22)">SWD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entities.map((e) => (
                <tr key={e.id}>
                  <td className="px-2 py-2 font-medium">{e.name}</td>
                  <td className="px-2 py-2 text-xs uppercase text-gray-500">
                    {e.entity_type}
                  </td>
                  <td className="px-2 py-2">{e.state ?? "—"}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.nces_id}</td>
                  <td className="px-2 py-2 text-right">
                    {formatInt(e.total_enrollment)}
                  </td>
                  <td className="px-2 py-2 text-right">{pctOfEnrollment(e.frl_eligible, e.total_enrollment)}</td>
                  <td className="px-2 py-2 text-right">{pctOfEnrollment(e.english_learners, e.total_enrollment)}</td>
                  <td className="px-2 py-2 text-right">{pctOfEnrollment(e.swd, e.total_enrollment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function pctOfEnrollment(v: number | null, enrollment: number | null): string {
  if (v == null || !enrollment) return "—";
  return `${((v / enrollment) * 100).toFixed(0)}%`;
}

function ExportMenu({ agg, entities }: Props) {
  function download(name: string, mime: string, body: string) {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportAggregateCsv() {
    const lines = [
      "category,students,percent,entities_reporting",
      `total_enrollment,${agg.total_enrollment},,${agg.entity_count}`,
    ];
    for (const f of DEMOGRAPHIC_FIELDS) {
      const b = agg.breakdown[f];
      const tot = b.coverage === 0 ? "" : String(b.total);
      const pct = b.percent == null ? "" : b.percent.toFixed(2);
      lines.push(`${f},${tot},${pct},${b.coverage}`);
    }
    download(
      `aggregate-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv",
      lines.join("\n")
    );
  }

  function exportEntitiesCsv() {
    const cols: (keyof Entity)[] = [
      "entity_type",
      "nces_id",
      "name",
      "state",
      "sea_id",
      "lea_id",
      "school_year",
      "total_enrollment",
      "white",
      "black",
      "hispanic",
      "asian",
      "am_indian",
      "pacific_islander",
      "two_or_more",
      "frl_eligible",
      "english_learners",
      "swd",
    ];
    const esc = (v: unknown) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [cols.join(",")];
    for (const e of entities) rows.push(cols.map((c) => esc(e[c])).join(","));
    download(
      `entities-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv",
      rows.join("\n")
    );
  }

  function exportJson() {
    download(
      `demographics-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json",
      JSON.stringify({ aggregate: agg, entities }, null, 2)
    );
  }

  return (
    <div className="relative">
      <details className="group">
        <summary className="cursor-pointer list-none rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Export ▾
        </summary>
        <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={exportAggregateCsv}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
          >
            Aggregate (CSV)
          </button>
          <button
            onClick={exportEntitiesCsv}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
          >
            Per-entity rows (CSV)
          </button>
          <button
            onClick={exportJson}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
          >
            Both (JSON)
          </button>
        </div>
      </details>
    </div>
  );
}

function BreakdownTable({
  title,
  fields,
  agg,
}: {
  title: string;
  fields: DemographicField[];
  agg: Aggregate;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500">
            <th className="py-1">Category</th>
            <th className="py-1 text-right">Students</th>
            <th className="py-1 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const b = agg.breakdown[f];
            const isCrdc = DEMOGRAPHIC_SOURCE[f] === CRDC_YEAR;
            return (
              <tr key={f} className="border-t border-gray-100">
                <td className="py-1.5">
                  {DEMOGRAPHIC_LABELS[f]}
                  {isCrdc && (
                    <span
                      className="ml-1 text-[10px] text-gray-400"
                      title={`Source: CRDC ${CRDC_YEAR}`}
                    >
                      (CRDC {CRDC_YEAR})
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {b.coverage === 0 ? "—" : formatInt(b.total)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatPct(b.percent)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
