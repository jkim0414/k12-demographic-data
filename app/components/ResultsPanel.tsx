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
import { formatFte, formatInt, formatPct, formatRatio } from "@/lib/aggregate";
import { Tooltip } from "./Tooltip";

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
        <StaffSection agg={agg} />
        <p className="mt-4 text-[11px] text-gray-400">
          Sources: NCES CCD {CCD_YEAR} for enrollment, race/ethnicity, FRL,
          and teacher/counselor FTE. CRDC {CRDC_YEAR} for English learners,
          students with disabilities, teacher certification, first-year
          teachers, and teacher absenteeism (CCD does not publish these at
          the directory level; CRDC is biennial, so the vintage differs).
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
                    {e.total_enrollment == null ? (
                      <NotReported source={CCD_YEAR} kind="ccd" />
                    ) : (
                      formatInt(e.total_enrollment)
                    )}
                  </td>
                  <PctCell value={e.frl_eligible} enrollment={e.total_enrollment} source={CCD_YEAR} kind="ccd" />
                  <PctCell value={e.english_learners} enrollment={e.total_enrollment} source={CRDC_YEAR} kind="crdc" />
                  <PctCell value={e.swd} enrollment={e.total_enrollment} source={CRDC_YEAR} kind="crdc" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StaffSection({ agg }: { agg: Aggregate }) {
  const s = agg.staff;
  const enrollment = agg.total_enrollment;

  const rows: Array<{
    label: string;
    value: string;
    coverage?: { reporting: number; total: number };
    source: string;
    kind: "ccd" | "crdc";
    derivedFrom?: "teachers" | "counselors";
  }> = [
    {
      label: "Teachers FTE",
      value: formatFte(s.teachers_fte.coverage > 0 ? s.teachers_fte.total : null),
      coverage: { reporting: s.teachers_fte.coverage, total: agg.entity_count },
      source: CCD_YEAR,
      kind: "ccd",
    },
    {
      label: "Student : teacher ratio",
      value: formatRatio(
        s.teachers_fte.total > 0 ? enrollment : null,
        s.teachers_fte.total > 0 ? s.teachers_fte.total : null
      ),
      source: CCD_YEAR,
      kind: "ccd",
      derivedFrom: "teachers",
    },
    {
      label: "Counselors FTE",
      value: formatFte(
        s.counselors_fte.coverage > 0 ? s.counselors_fte.total : null
      ),
      coverage: {
        reporting: s.counselors_fte.coverage,
        total: agg.entity_count,
      },
      source: CCD_YEAR,
      kind: "ccd",
    },
    {
      label: "Student : counselor ratio",
      value: formatRatio(
        s.counselors_fte.total > 0 ? enrollment : null,
        s.counselors_fte.total > 0 ? s.counselors_fte.total : null
      ),
      source: CCD_YEAR,
      kind: "ccd",
      derivedFrom: "counselors",
    },
    {
      label: "Certified teachers",
      value: percentOfTeachers(s.teachers_certified_fte.total, s.teachers_fte.total),
      coverage: {
        reporting: s.teachers_certified_fte.coverage,
        total: agg.entity_count,
      },
      source: CRDC_YEAR,
      kind: "crdc",
    },
    {
      label: "First-year teachers",
      value: percentOfTeachers(s.teachers_first_year_fte.total, s.teachers_fte.total),
      coverage: {
        reporting: s.teachers_first_year_fte.coverage,
        total: agg.entity_count,
      },
      source: CRDC_YEAR,
      kind: "crdc",
    },
    {
      label: "Teachers absent >10 days",
      value: percentOfTeachers(s.teachers_absent_fte.total, s.teachers_fte.total),
      coverage: {
        reporting: s.teachers_absent_fte.coverage,
        total: agg.entity_count,
      },
      source: CRDC_YEAR,
      kind: "crdc",
    },
  ];

  return (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">
        Staff & teacher quality
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500">
            <th className="py-1">Metric</th>
            <th className="py-1 text-right">Value</th>
            <th className="py-1 text-right">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const partial =
              r.coverage &&
              r.coverage.reporting > 0 &&
              r.coverage.reporting < r.coverage.total;
            const zero = r.coverage && r.coverage.reporting === 0;
            const isCrdc = r.kind === "crdc";
            return (
              <tr key={r.label} className="border-t border-gray-100">
                <td className="py-1.5">
                  {r.label}
                  {isCrdc && (
                    <span className="ml-1 text-[10px] text-gray-400">
                      (CRDC {CRDC_YEAR})
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {zero ? (
                    <NotReported source={r.source} kind={r.kind} />
                  ) : (
                    r.value
                  )}
                </td>
                <td className="py-1.5 text-right text-xs text-gray-500 tabular-nums">
                  {r.derivedFrom
                    ? "derived"
                    : r.coverage
                    ? partial ? (
                        <Tooltip
                          label={`${r.coverage.reporting} of ${r.coverage.total} entities reported this field.`}
                          className="cursor-help text-amber-700 underline decoration-dotted decoration-amber-300"
                        >
                          {r.coverage.reporting}/{r.coverage.total}
                        </Tooltip>
                      ) : (
                        `${r.coverage.reporting}/${r.coverage.total}`
                      )
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function percentOfTeachers(
  numerator: number,
  teachers: number
): string {
  if (teachers <= 0 || numerator <= 0) return "—";
  return `${((numerator / teachers) * 100).toFixed(1)}%`;
}

function NotReported({
  source,
  kind,
}: {
  source: string;
  kind: "ccd" | "crdc";
}) {
  // CRDC null = often CRDC suppression for that entity (cell or whole-district
  // withhold, as with SFUSD 2021-22 LEP). CCD null just means the directory
  // didn't publish the value.
  const label =
    kind === "crdc"
      ? `Not reported or suppressed by CRDC ${source} for this entity`
      : `Not reported by CCD ${source} for this entity`;
  return (
    <Tooltip
      label={label}
      className="cursor-help text-gray-400 underline decoration-dotted decoration-gray-300"
    >
      —
    </Tooltip>
  );
}

function PctCell({
  value,
  enrollment,
  source,
  kind,
}: {
  value: number | null;
  enrollment: number | null;
  source: string;
  kind: "ccd" | "crdc";
}) {
  if (value == null) {
    return (
      <td className="px-2 py-2 text-right">
        <NotReported source={source} kind={kind} />
      </td>
    );
  }
  if (!enrollment) {
    return (
      <td className="px-2 py-2 text-right" title="No enrollment denominator">
        <span className="text-gray-400">{formatInt(value)}</span>
      </td>
    );
  }
  return (
    <td className="px-2 py-2 text-right">
      {`${((value / enrollment) * 100).toFixed(0)}%`}
    </td>
  );
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
      "category,students_or_fte,percent,entities_reporting",
      `total_enrollment,${agg.total_enrollment},,${agg.entity_count}`,
    ];
    for (const f of DEMOGRAPHIC_FIELDS) {
      const b = agg.breakdown[f];
      const tot = b.coverage === 0 ? "" : String(b.total);
      const pct = b.percent == null ? "" : b.percent.toFixed(2);
      lines.push(`${f},${tot},${pct},${b.coverage}`);
    }
    for (const f of Object.keys(agg.staff) as (keyof typeof agg.staff)[]) {
      const s = agg.staff[f];
      const tot = s.coverage === 0 ? "" : s.total.toFixed(2);
      lines.push(`${f},${tot},,${s.coverage}`);
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
      "teachers_fte",
      "staff_total_fte",
      "counselors_fte",
      "teachers_certified_fte",
      "teachers_first_year_fte",
      "teachers_absent_fte",
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
            const partial = b.coverage > 0 && b.coverage < agg.entity_count;
            const zero = b.coverage === 0;
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
                  {zero ? (
                    <NotReported
                      source={isCrdc ? CRDC_YEAR : CCD_YEAR}
                      kind={isCrdc ? "crdc" : "ccd"}
                    />
                  ) : (
                    formatInt(b.total)
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {partial ? (
                    <Tooltip
                      label={`${b.coverage} of ${agg.entity_count} entities reported this field; percentage reflects only the reporting subset.`}
                      className="cursor-help text-amber-700 underline decoration-dotted decoration-amber-300"
                    >
                      {formatPct(b.percent)}
                      <span className="ml-1 text-[10px]">
                        ({b.coverage}/{agg.entity_count})
                      </span>
                    </Tooltip>
                  ) : (
                    <span>{formatPct(b.percent)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
