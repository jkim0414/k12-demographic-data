"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ACS_YEAR,
  Aggregate,
  CCD_YEAR,
  CRDC_YEAR,
  DEMOGRAPHIC_FIELDS,
  DEMOGRAPHIC_LABELS,
  DEMOGRAPHIC_SOURCE,
  DISCIPLINE_METRIC_LABELS,
  DISCIPLINE_METRICS,
  DISCIPLINE_RACE_TO_ENROLLED,
  DemographicField,
  DisciplineMetric,
  ENROLLED_TO_COMMUNITY,
  Entity,
  RACE_FIELDS,
  SAIPE_YEAR,
} from "@/lib/types";
import { formatFte, formatInt, formatPct, formatRatio } from "@/lib/aggregate";
import { Tooltip } from "./Tooltip";

const PROGRAM_FIELDS: DemographicField[] = [
  "frl_eligible",
  "english_learners",
  "swd",
];

export type ViewMode = "aggregate" | "compare";

type Props = {
  agg: Aggregate;
  entities: Entity[];
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  // Compare-mode only — mirrors the Selected-pills × so users don't
  // have to scroll back up to drop a column.
  onRemoveEntity: (id: number) => void;
};

// =============================================================================
// Top-level layout
// =============================================================================

export function ResultsPanel({
  agg,
  entities,
  mode,
  onModeChange,
  onRemoveEntity,
}: Props) {
  const sections = visibleSections(agg);

  // Sections start expanded. Users can collapse any. Anchor-nav clicks
  // also auto-expand the target so clicking a nav pill never scrolls to
  // a closed section.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => {
      const init: Record<string, boolean> = {};
      for (const id of sections) init[id] = true;
      return init;
    }
  );

  const toggle = useCallback((id: string) => {
    setOpenSections((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const openAndScroll = useCallback((id: string) => {
    setOpenSections((s) => ({ ...s, [id]: true }));
    // Defer scroll so the section's body has rendered before we scroll
    // (otherwise the browser scrolls to the still-collapsed header
    // position, which under-shoots).
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const sectionProps = (id: string) => ({
    id,
    open: openSections[id] ?? true,
    onToggle: () => toggle(id),
  });

  // Mode toggle is only meaningful with 2+ entities. With 1 entity,
  // "compare" is just the aggregate view in a transposed layout — no
  // benefit, so suppress the toggle.
  const showModeToggle = entities.length >= 2;
  const effectiveMode: ViewMode = showModeToggle ? mode : "aggregate";

  return (
    <div className="space-y-6">
      {/* Aggregate card */}
      <div className="rounded-lg border border-gray-300 bg-white">
        <div className="border-b border-gray-200 px-3 pb-4 pt-5 sm:px-5">
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-semibold">
                {effectiveMode === "compare" ? "Compare" : "Aggregate"}
              </h2>
              {showModeToggle && (
                <ModeToggle mode={effectiveMode} onChange={onModeChange} />
              )}
            </div>
            <ExportMenu agg={agg} entities={entities} />
          </div>
          {effectiveMode === "aggregate" && <HeadlineStrip agg={agg} />}
        </div>

        <AnchorNav
          sections={
            effectiveMode === "aggregate"
              ? sections
              : COMPARE_SECTION_IDS
          }
          onJump={(id) => {
            // Compare doesn't have collapsibility, so jump-to is just scroll.
            if (effectiveMode === "compare") {
              document.getElementById(id)?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            } else {
              openAndScroll(id);
            }
          }}
        />

        <div className="px-3 pb-5 sm:px-5">
          {effectiveMode === "compare" ? (
            <CompareView
              entities={entities}
              onRemoveEntity={onRemoveEntity}
            />
          ) : (
            <>
              {sections.includes("race") && (
                <Section
                  {...sectionProps("race")}
                  title="Race / ethnicity"
                  caption={
                    agg.community.community_population_acs.coverage > 0
                      ? `CCD ${CCD_YEAR} • ACS ${ACS_YEAR}`
                      : `CCD ${CCD_YEAR}`
                  }
                >
                  <RaceComparisonTable agg={agg} />
                </Section>
              )}

              {sections.includes("community") && (
                <Section
                  {...sectionProps("community")}
                  title="Community"
                  subtitle="Residents in the district boundary, not enrolled students. Available for districts and states only — Census doesn't publish population at the school level."
                  caption={`SAIPE ${SAIPE_YEAR} • ACS ${ACS_YEAR}`}
                >
                  <CommunityTable agg={agg} />
                </Section>
              )}

              {sections.includes("programs") && (
                <Section
                  {...sectionProps("programs")}
                  title="Programs"
                  caption={`CCD ${CCD_YEAR} • CRDC ${CRDC_YEAR}`}
                >
                  <ProgramsTable agg={agg} />
                </Section>
              )}

              {sections.includes("discipline") && (
                <Section
                  {...sectionProps("discipline")}
                  title="Discipline"
                  subtitle="Counts are unique students who experienced each action, not incidents. Rates are % of that group's enrolled students. Disproportionality compares each group's rate to white students' rate, with White pinned at 1.0× by definition."
                  caption={`CRDC ${CRDC_YEAR}`}
                >
                  <DisciplineSection agg={agg} />
                </Section>
              )}

              {sections.includes("teachers") && (
                <Section
                  {...sectionProps("teachers")}
                  title="Teachers & staff"
                  caption={`CCD ${CCD_YEAR} • CRDC ${CRDC_YEAR}`}
                >
                  <TeachersTable agg={agg} />
                </Section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Entities card — only in aggregate mode; in compare mode the
          entity list IS the column headers, so the separate card is
          redundant. */}
      {effectiveMode === "aggregate" && <EntitiesCard entities={entities} />}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-xs">
      {(["aggregate", "compare"] as ViewMode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`px-2.5 py-1 font-medium ${
              active
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            aria-pressed={active}
          >
            {m === "aggregate" ? "Aggregate" : "Compare"}
          </button>
        );
      })}
    </div>
  );
}

// Decide which sections render. Hides ones with no data so the anchor nav
// stays accurate. Order matches the rendered order: Race → Community →
// Programs → Discipline → Teachers (demographic context first, then
// student-experience cluster, then workforce).
function visibleSections(agg: Aggregate): string[] {
  const out: string[] = ["race"];
  if (
    agg.community.population_total.coverage > 0 ||
    agg.community.community_population_acs.coverage > 0
  ) {
    out.push("community");
  }
  if (PROGRAM_FIELDS.some((f) => agg.breakdown[f].coverage > 0)) {
    out.push("programs");
  }
  if (agg.discipline.coverage > 0) {
    out.push("discipline");
  }
  // teachers: show if at least one staff field has coverage
  const staff = agg.staff;
  const teachersHasData =
    staff.teachers_fte.coverage > 0 ||
    staff.counselors_fte.coverage > 0 ||
    staff.teachers_certified_fte.coverage > 0 ||
    staff.teachers_first_year_fte.coverage > 0 ||
    staff.teachers_absent_fte.coverage > 0;
  if (teachersHasData) out.push("teachers");
  return out;
}

// =============================================================================
// Headline strip — key numbers at the top of the aggregate card
// =============================================================================

function HeadlineStrip({ agg }: { agg: Aggregate }) {
  const c = agg.community;
  const inc = agg.median_household_income;

  const enrolled = agg.total_enrollment;
  const communityPop = c.population_total.coverage > 0 ? c.population_total.total : null;
  const schoolAge = c.population_5_17.coverage > 0 ? c.population_5_17.total : null;
  const captureRate =
    schoolAge && schoolAge > 0 && enrolled > 0 ? (enrolled / schoolAge) * 100 : null;

  type Stat = { label: string; value: string; tooltip?: string };
  const stats: Stat[] = [
    {
      label: agg.entity_count === 1 ? "Entity" : "Entities",
      value: agg.entity_count.toLocaleString(),
    },
    {
      label: "Enrolled students",
      value: formatInt(enrolled),
    },
  ];
  // School-age population is the actual denominator for capture rate;
  // surface it next to enrolled so users don't mentally divide enrolled
  // by total community population.
  if (schoolAge != null) {
    stats.push({
      label: "School-age (5–17)",
      value: formatInt(schoolAge),
      tooltip:
        "Census-estimated population aged 5–17 living within the district boundary. The denominator for public-school capture rate.",
    });
  }
  if (communityPop != null) {
    stats.push({
      label: "Community population",
      value: formatInt(communityPop),
      tooltip:
        "Total residents of all ages within the district boundary. Use the school-age figure, not this one, when reasoning about how many kids attend public schools.",
    });
  }
  if (captureRate != null) {
    stats.push({
      label: "Public-school capture",
      value: `${captureRate.toFixed(1)}%`,
      tooltip:
        "Enrolled students ÷ school-age residents in district. The national average is ~85%. Values below 100% reflect students in the boundary attending private, charter, homeschool, or cross-district public schools. Values above 100% mean the district enrolls students from outside its tabulated boundary — common for charter or virtual districts and where the SAIPE-tabulated boundary differs from the actual service area.",
    });
  }
  if (inc.weighted != null) {
    stats.push({
      label:
        agg.entity_count > 1
          ? "Median income (weighted)"
          : "Median household income",
      value: `$${inc.weighted.toLocaleString()}`,
    });
  }

  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-6">
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="text-[11px] uppercase tracking-wide text-gray-500">
            {s.tooltip ? (
              <Tooltip
                label={s.tooltip}
                className="cursor-help underline decoration-dotted decoration-gray-300"
              >
                {s.label}
              </Tooltip>
            ) : (
              s.label
            )}
          </dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// =============================================================================
// In-card anchor navigation
// =============================================================================

const SECTION_LABELS: Record<string, string> = {
  race: "Race / ethnicity",
  programs: "Programs",
  discipline: "Discipline",
  community: "Community",
  teachers: "Teachers & staff",
};

// Compare mode always shows all five sections (no per-section coverage
// suppression — every section has the same shape regardless of which
// entities are selected).
const COMPARE_SECTION_IDS: string[] = [
  "race",
  "community",
  "programs",
  "discipline",
  "teachers",
];

function AnchorNav({
  sections,
  onJump,
}: {
  sections: string[];
  onJump: (id: string) => void;
}) {
  if (sections.length <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-3 text-xs sm:px-5">
      <span className="font-medium uppercase tracking-wide text-gray-500">
        Jump to
      </span>
      {sections.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onJump(id)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-700 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
        >
          {SECTION_LABELS[id]}
        </button>
      ))}
    </nav>
  );
}

// =============================================================================
// Section wrapper — consistent heading + caption + content area
// =============================================================================

function Section({
  id,
  title,
  subtitle,
  caption,
  children,
  open,
  onToggle,
}: {
  id: string;
  title: string;
  subtitle?: string;
  caption?: string;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section id={id} className="scroll-mt-4 pt-6 first:pt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <Chevron open={open} />
      </button>
      {open && (
        <div id={`${id}-body`}>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
          )}
          {caption && (
            <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">
              {caption}
            </p>
          )}
          <div className="mt-3">{children}</div>
        </div>
      )}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`shrink-0 text-gray-400 transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M5 7l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.75"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// =============================================================================
// Table primitives — used by every metric table
// =============================================================================

type ColAlign = "left" | "right";

// Pin the first ("label") column of every metric table to a consistent
// minimum width. This is what gives the page its visual rhythm — the
// left edge of every metric table starts in the same place, regardless
// of section.
//
// `min-w` (not `w`) so a label longer than 14rem grows the column
// instead of wrapping it ("Free / reduced-price lunch eligible" plus
// the CEP badge needs ~17rem). On mobile the cell can wrap, since
// horizontal scrolling for label content is a worse experience than a
// two-line label; `sm:whitespace-nowrap` flips it to single-line on
// desktop where there's room.
const LABEL_COL_WIDTH = "min-w-[14rem] whitespace-normal sm:whitespace-nowrap";

function MetricTable({
  columns,
  children,
}: {
  columns: { key: string; label: string; align?: ColAlign }[];
  children: React.ReactNode;
}) {
  return (
    <table className="text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-gray-500">
          {columns.map((c, i) => (
            <th
              key={c.key}
              className={`px-3 py-1.5 ${i === 0 ? LABEL_COL_WIDTH : ""} ${
                c.align === "right" ? "text-right" : "text-left"
              }`}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

// One row in a metric table. `value` is the primary number cell; `coverage`
// / `total` populate the small rightmost cell. For derived rows (ratios,
// rates), pass the *limiting* underlying coverage — e.g. for the
// student:teacher ratio that's teachers_fte.coverage, since enrollment
// is universally reported. Don't use a separate "derived" sentinel; doing
// so would conflate "this row is computed" with "this row's data
// coverage" and the ratio is only valid for the entities that reported
// the underlying inputs anyway.
function MetricRow({
  label,
  labelTooltip,
  value,
  valueExtra,
  isMissing,
  missingKind,
  missingSource,
  coverage,
  total,
}: {
  label: string;
  labelTooltip?: string;
  value: string | null;
  valueExtra?: string | null;
  isMissing?: boolean;
  missingKind?: "ccd" | "crdc" | "saipe" | "acs";
  missingSource?: string;
  coverage?: number;
  total?: number;
}) {
  const partial =
    coverage != null && total != null && coverage > 0 && coverage < total;

  return (
    <tr className="border-t border-gray-100">
      <td className={`px-3 py-1.5 ${LABEL_COL_WIDTH}`}>
        {labelTooltip ? (
          <Tooltip
            label={labelTooltip}
            className="cursor-help underline decoration-dotted decoration-gray-300"
          >
            {label}
          </Tooltip>
        ) : (
          label
        )}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {isMissing ? (
          <NotReported
            kind={missingKind ?? "ccd"}
            source={missingSource ?? CCD_YEAR}
          />
        ) : (
          <>
            {value ?? "—"}
            {valueExtra && (
              <span className="ml-1 text-xs text-gray-500">{valueExtra}</span>
            )}
          </>
        )}
      </td>
      <td className="px-3 py-1.5 text-right text-xs text-gray-500 tabular-nums">
        {coverage != null && total != null ? (
          partial ? (
            <Tooltip
              label={`${coverage} of ${total} entities reported this field; the value reflects only the reporting subset.`}
              className="cursor-help text-amber-700 underline decoration-dotted decoration-amber-300"
            >
              {coverage}/{total}
            </Tooltip>
          ) : (
            `${coverage}/${total}`
          )
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function NotReported({
  source,
  kind,
}: {
  source: string;
  kind: "ccd" | "crdc" | "saipe" | "acs";
}) {
  const sourceLabel =
    kind === "crdc"
      ? `CRDC ${source}`
      : kind === "saipe"
      ? `Census SAIPE ${source}`
      : kind === "acs"
      ? `Census ACS ${source}`
      : `CCD ${source}`;
  const label =
    kind === "crdc"
      ? `Not reported or suppressed by ${sourceLabel} for this entity`
      : `Not reported by ${sourceLabel} for this entity`;
  return (
    <Tooltip
      label={label}
      className="cursor-help text-gray-400 underline decoration-dotted decoration-gray-300"
    >
      —
    </Tooltip>
  );
}

// =============================================================================
// Race comparison table — 4 columns when community data is available
// =============================================================================

function RaceComparisonTable({ agg }: { agg: Aggregate }) {
  const c = agg.community;
  const enrolledDenom = agg.total_enrollment;
  const communityDenom = c.community_population_acs.total;
  const hasCommunity = c.community_population_acs.coverage > 0;

  // Race fields generally have uniform coverage across racial groups for a
  // given entity (an entity either reports race breakdown or not), so we
  // surface coverage once below the table rather than per row. Use the
  // 'white' field's coverage as representative; in practice it's the same
  // across all race fields.
  const enrolledRaceCoverage = agg.breakdown.white.coverage;
  const communityRaceCoverage = c.community_white.coverage;
  const enrolledPartial =
    enrolledRaceCoverage > 0 && enrolledRaceCoverage < agg.entity_count;
  const communityPartial =
    hasCommunity &&
    communityRaceCoverage > 0 &&
    communityRaceCoverage < agg.entity_count;

  // Column order mirrors the Programs table's pattern (Label · Students ·
  // Enrolled % · …) so the two race-vs-program tables are visually
  // parallel: the absolute count comes first, then percentages.
  const columns = hasCommunity
    ? [
        { key: "group", label: "Group" },
        { key: "students", label: "Students", align: "right" as ColAlign },
        { key: "enrolled", label: "Enrolled %", align: "right" as ColAlign },
        { key: "community", label: "Community %", align: "right" as ColAlign },
        { key: "gap", label: "Gap (pts)", align: "right" as ColAlign },
      ]
    : [
        { key: "group", label: "Group" },
        { key: "students", label: "Students", align: "right" as ColAlign },
        { key: "enrolled", label: "Enrolled %", align: "right" as ColAlign },
      ];

  return (
    <>
      <div className="overflow-x-auto">
      <MetricTable columns={columns}>
        {RACE_FIELDS.map((f) => {
          const b = agg.breakdown[f];
          const enrolledPct =
            b.coverage > 0 && enrolledDenom > 0
              ? (b.total / enrolledDenom) * 100
              : null;

          const cf = ENROLLED_TO_COMMUNITY[f];
          const cBucket = cf ? c[cf] : null;
          const communityPct =
            cBucket && cBucket.coverage > 0 && communityDenom > 0
              ? (cBucket.total / communityDenom) * 100
              : null;

          const gap =
            enrolledPct != null && communityPct != null
              ? enrolledPct - communityPct
              : null;

          return (
            <tr key={f} className="border-t border-gray-100">
              <td className={`px-3 py-1.5 ${LABEL_COL_WIDTH}`}>
                {DEMOGRAPHIC_LABELS[f]}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {b.coverage > 0 ? formatInt(b.total) : "—"}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {enrolledPct != null ? `${enrolledPct.toFixed(1)}%` : "—"}
              </td>
              {hasCommunity && (
                <>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {communityPct != null
                      ? `${communityPct.toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <GapBadge gap={gap} />
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </MetricTable>
      </div>
      <div className="mt-2 space-y-1">
        {hasCommunity && (
          <p className="text-[11px] text-gray-400">
            Gap = enrolled% − community%. Blue: enrolled % higher than
            community %. Amber: enrolled % lower.
          </p>
        )}
        {(enrolledPartial || communityPartial) && (
          <p className="text-[11px] text-gray-500">
            Coverage:{" "}
            <span className={enrolledPartial ? "text-amber-700" : ""}>
              enrolled {enrolledRaceCoverage}/{agg.entity_count}
            </span>
            {hasCommunity && (
              <>
                {" "}·{" "}
                <span className={communityPartial ? "text-amber-700" : ""}>
                  community {communityRaceCoverage}/{agg.entity_count}
                </span>
              </>
            )}
          </p>
        )}
      </div>
    </>
  );
}

function GapBadge({ gap }: { gap: number | null }) {
  if (gap == null) return <span className="text-gray-400">—</span>;
  const sign = gap > 0 ? "+" : "";
  const color =
    Math.abs(gap) < 1
      ? "text-gray-400"
      : gap > 0
      ? "text-blue-700"
      : "text-amber-700";
  return (
    <span className={`tabular-nums ${color}`}>
      {sign}
      {gap.toFixed(1)}
    </span>
  );
}

// =============================================================================
// Programs table
// =============================================================================

function ProgramsTable({ agg }: { agg: Aggregate }) {
  // Programs has a meaningful percent (share of enrolled students), so —
  // matching the Race table — give the percent its own column rather than
  // squashing it into the value cell as a parenthetical. Coverage stays
  // in the rightmost column.
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-500">
            <th className={`px-3 py-1.5 text-left ${LABEL_COL_WIDTH}`}>Metric</th>
            <th className="px-3 py-1.5 text-right">Students</th>
            <th className="px-3 py-1.5 text-right">Enrolled %</th>
            <th className="px-3 py-1.5 text-right">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {PROGRAM_FIELDS.map((f) => {
            const b = agg.breakdown[f];
            const isCrdc = DEMOGRAPHIC_SOURCE[f] === CRDC_YEAR;
            const isMissing = b.coverage === 0;
            const partial =
              b.coverage > 0 && b.coverage < agg.entity_count;
            const showCepNote = f === "frl_eligible" && agg.cep_count > 0;
            return (
              <tr key={f} className="border-t border-gray-100">
                <td className={`px-3 py-1.5 ${LABEL_COL_WIDTH}`}>
                  {DEMOGRAPHIC_LABELS[f]}
                  {showCepNote && (
                    <Tooltip
                      label={`${agg.cep_count} of ${agg.entity_count} selected ${agg.cep_count === 1 ? "entity participates" : "entities participate"} in the Community Eligibility Provision (CEP). Under CEP, all students get free meals regardless of household income, and reporting methodology for the FRL count varies by district — sometimes universal eligibility (~100%), sometimes identified-students × 1.6, sometimes individual applications. Year-over-year jumps in this number can reflect a methodology change rather than a real demographic shift.`}
                      className="ml-2 inline-flex cursor-help items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
                    >
                      CEP
                    </Tooltip>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {isMissing ? (
                    <NotReported
                      kind={isCrdc ? "crdc" : "ccd"}
                      source={isCrdc ? CRDC_YEAR : CCD_YEAR}
                    />
                  ) : (
                    formatInt(b.total)
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {isMissing ? "—" : formatPct(b.percent)}
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-gray-500 tabular-nums">
                  {partial ? (
                    <Tooltip
                      label={`${b.coverage} of ${agg.entity_count} entities reported this field; the value reflects only the reporting subset.`}
                      className="cursor-help text-amber-700 underline decoration-dotted decoration-amber-300"
                    >
                      {b.coverage}/{agg.entity_count}
                    </Tooltip>
                  ) : (
                    `${b.coverage}/${agg.entity_count}`
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

// =============================================================================
// Discipline section — three sub-tables:
//   1. Counts and rates by race (incl. an "All students" row at the top —
//      replaces the old standalone Rates table since its info is now this
//      table's first row)
//   2. Counts and rates by disability (All vs. SWD)
//   3. Disproportionality vs. White (race rows pinned at White=1.0×) plus
//      an SWD-vs-non-SWD row, the standard civil-rights framing
// =============================================================================

// Minimum group-enrollment threshold for computing a meaningful rate or
// ratio. Below this, small-N noise dominates (e.g. one student of a group
// flipping a 0% rate into a 20% rate). Show "—" with a tooltip rather
// than risk a misleading number.
const SMALL_N_THRESHOLD = 10;

function DisciplineSection({ agg }: { agg: Aggregate }) {
  const counts = agg.discipline.counts;
  const partial =
    agg.discipline.coverage > 0 &&
    agg.discipline.coverage < agg.entity_count;

  // Suppress a metric column if every entity reported zero — typically
  // an artifact of CRDC for that metric (e.g. expulsion is 0 at almost
  // every school in the country).
  const visibleMetrics = DISCIPLINE_METRICS.filter(
    (m) => counts[m].total > 0
  );

  return (
    <div className="space-y-6">
      <DisciplineByRaceTable agg={agg} metrics={visibleMetrics} />
      <DisciplineByDisabilityTable agg={agg} metrics={visibleMetrics} />
      <DisciplineDisproportionalityTable
        agg={agg}
        metrics={visibleMetrics}
      />
      {partial && (
        <p className="text-[11px] text-amber-700">
          Coverage: {agg.discipline.coverage}/{agg.entity_count} entities
          reported CRDC discipline data; counts and rates above reflect
          only the reporting subset.
        </p>
      )}
    </div>
  );
}

const SHORT_METRIC: Record<DisciplineMetric, string> = {
  in_school_susp: "Susp. (in)",
  out_school_susp: "Susp. (out)",
  expulsion: "Expulsion",
  law_enforcement_ref: "LE referral",
  arrest: "Arrest",
};

// Cell renderer for a count + rate. Rate (% of group's enrollment) is
// the headline; count appears below in smaller text so the reader can
// gauge significance (a 50% rate from 2 students is very different from
// the same rate from 200).
function CountRateCell({
  count,
  enrolled,
}: {
  count: number;
  enrolled: number;
}) {
  if (enrolled <= 0) {
    return <span className="text-gray-400">—</span>;
  }
  const rate = (count / enrolled) * 100;
  return (
    <span className="inline-block leading-tight">
      <span className="block tabular-nums">{rate.toFixed(1)}%</span>
      <span className="block text-[10px] text-gray-500 tabular-nums">
        n={count.toLocaleString()}
      </span>
    </span>
  );
}

// Shared column-width skeleton so the three discipline tables align
// vertically regardless of how many rows each has. Without this each
// table auto-sizes its columns to its own content and they end up
// misaligned with each other.
function DisciplineColGroup({ metricCount }: { metricCount: number }) {
  return (
    <colgroup>
      <col className={LABEL_COL_WIDTH} />
      {Array.from({ length: metricCount }).map((_, i) => (
        <col key={i} />
      ))}
    </colgroup>
  );
}

function DisciplineHead({ metrics }: { metrics: DisciplineMetric[] }) {
  return (
    <thead>
      <tr className="text-xs uppercase tracking-wide text-gray-500">
        <th className="px-3 py-1.5 text-left">Group</th>
        {metrics.map((m) => (
          <th key={m} className="px-3 py-1.5 text-right">
            {SHORT_METRIC[m]}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function DisciplineByRaceTable({
  agg,
  metrics,
}: {
  agg: Aggregate;
  metrics: DisciplineMetric[];
}) {
  const counts = agg.discipline.counts;
  const races = Object.keys(DISCIPLINE_RACE_TO_ENROLLED) as Array<
    keyof typeof DISCIPLINE_RACE_TO_ENROLLED
  >;

  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <DisciplineColGroup metricCount={metrics.length} />
        <DisciplineHead metrics={metrics} />
        <tbody>
          <tr className="border-t border-gray-100 font-medium">
            <td className="px-3 py-1.5 whitespace-normal sm:whitespace-nowrap">All students</td>
            {metrics.map((m) => (
              <td key={m} className="px-3 py-1.5 text-right">
                <CountRateCell
                  count={counts[m].total}
                  enrolled={agg.total_enrollment}
                />
              </td>
            ))}
          </tr>
          {races.map((race) => {
            const enrolledField = DISCIPLINE_RACE_TO_ENROLLED[race];
            const raceEnrolled = agg.breakdown[enrolledField].total;
            return (
              <tr key={race} className="border-t border-gray-100">
                <td className="px-3 py-1.5 whitespace-normal sm:whitespace-nowrap">
                  {DEMOGRAPHIC_LABELS[enrolledField]}
                </td>
                {metrics.map((m) => (
                  <td key={m} className="px-3 py-1.5 text-right">
                    <CountRateCell
                      count={counts[m][race]}
                      enrolled={raceEnrolled}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DisciplineByDisabilityTable({
  agg,
  metrics,
}: {
  agg: Aggregate;
  metrics: DisciplineMetric[];
}) {
  const counts = agg.discipline.counts;
  const swdEnrolled = agg.breakdown.swd.total;
  if (swdEnrolled <= 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <DisciplineColGroup metricCount={metrics.length} />
        <DisciplineHead metrics={metrics} />
        <tbody>
          <tr className="border-t border-gray-100 font-medium">
            <td className="px-3 py-1.5 whitespace-normal sm:whitespace-nowrap">All students</td>
            {metrics.map((m) => (
              <td key={m} className="px-3 py-1.5 text-right">
                <CountRateCell
                  count={counts[m].total}
                  enrolled={agg.total_enrollment}
                />
              </td>
            ))}
          </tr>
          <tr className="border-t border-gray-100">
            <td className="px-3 py-1.5 whitespace-normal sm:whitespace-nowrap">Students with disabilities</td>
            {metrics.map((m) => (
              <td key={m} className="px-3 py-1.5 text-right">
                <CountRateCell
                  count={counts[m].swd}
                  enrolled={swdEnrolled}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DisciplineDisproportionalityTable({
  agg,
  metrics,
}: {
  agg: Aggregate;
  metrics: DisciplineMetric[];
}) {
  const counts = agg.discipline.counts;
  const races = Object.keys(DISCIPLINE_RACE_TO_ENROLLED) as Array<
    keyof typeof DISCIPLINE_RACE_TO_ENROLLED
  >;
  const whiteEnrolled = agg.breakdown.white.total;
  const swdEnrolled = agg.breakdown.swd.total;

  // For race rows: ratio = group rate / white rate. White is by
  // definition 1.0×. Suppress when the white denominator is too small
  // for white-rate to be meaningful (small-N at small schools turns
  // ratios into noise).
  function raceRatio(
    m: DisciplineMetric,
    race: keyof typeof DISCIPLINE_RACE_TO_ENROLLED
  ): { value: number | null; reason?: string } {
    if (race === "white") return { value: 1 };
    if (whiteEnrolled < SMALL_N_THRESHOLD) {
      return {
        value: null,
        reason: `White enrollment (${whiteEnrolled}) is below the ${SMALL_N_THRESHOLD}-student threshold for a stable reference rate.`,
      };
    }
    const whiteCount = counts[m].white;
    if (whiteCount === 0) {
      return {
        value: null,
        reason:
          "Zero white students experienced this action; ratio is undefined.",
      };
    }
    const enrolledField = DISCIPLINE_RACE_TO_ENROLLED[race];
    const groupEnrolled = agg.breakdown[enrolledField].total;
    if (groupEnrolled <= 0) return { value: null };
    const whiteRate = whiteCount / whiteEnrolled;
    const groupRate = counts[m][race] / groupEnrolled;
    return { value: groupRate / whiteRate };
  }

  // For the SWD row: ratio = SWD rate / non-SWD rate.
  function swdRatio(
    m: DisciplineMetric
  ): { value: number | null; reason?: string } {
    const nonSwdEnrolled = agg.total_enrollment - swdEnrolled;
    if (nonSwdEnrolled < SMALL_N_THRESHOLD) return { value: null };
    const nonSwdCount = counts[m].total - counts[m].swd;
    if (nonSwdCount === 0) {
      return {
        value: null,
        reason:
          "Zero non-SWD students experienced this action; ratio is undefined.",
      };
    }
    if (swdEnrolled <= 0) return { value: null };
    const swdRate = counts[m].swd / swdEnrolled;
    const nonSwdRate = nonSwdCount / nonSwdEnrolled;
    return { value: swdRate / nonSwdRate };
  }

  const metricCount = metrics.length;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <DisciplineColGroup metricCount={metricCount} />
          <DisciplineHead metrics={metrics} />
          {/* Race rows — reference is White */}
          <tbody>
            <tr>
              <td
                colSpan={metricCount + 1}
                className="border-t border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500"
              >
                By race · vs. White students
              </td>
            </tr>
            {races.map((race) => {
              const enrolledField = DISCIPLINE_RACE_TO_ENROLLED[race];
              const isReference = race === "white";
              return (
                <tr
                  key={race}
                  className={`border-t border-gray-100 ${
                    isReference ? "bg-gray-50/50" : ""
                  }`}
                >
                  <td className="px-3 py-1.5 whitespace-normal sm:whitespace-nowrap">
                    {DEMOGRAPHIC_LABELS[enrolledField]}
                  </td>
                  {metrics.map((m) => {
                    const r = raceRatio(m, race);
                    return (
                      <td
                        key={m}
                        className="px-3 py-1.5 text-right tabular-nums"
                      >
                        <RatioBadge
                          ratio={r.value}
                          reference={isReference}
                          reason={r.reason}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {/* Disability row — reference is non-SWD */}
          {swdEnrolled > 0 && (
            <tbody>
              <tr>
                <td
                  colSpan={metricCount + 1}
                  className="border-t border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500"
                >
                  By disability · vs. non-SWD students
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-3 py-1.5 whitespace-normal sm:whitespace-nowrap">Students with disabilities</td>
                {metrics.map((m) => {
                  const r = swdRatio(m);
                  return (
                    <td
                      key={m}
                      className="px-3 py-1.5 text-right tabular-nums"
                    >
                      <RatioBadge ratio={r.value} reason={r.reason} />
                    </td>
                  );
                })}
              </tr>
            </tbody>
          )}
        </table>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Higher than 1.0× means the group is disciplined at a higher rate
        than the reference; lower than 1.0× means a lower rate. Cells
        show &quot;—&quot; when the reference group has fewer than{" "}
        {SMALL_N_THRESHOLD} enrolled students or zero disciplined
        students (denominator too small or zero).
      </p>
    </div>
  );
}

function RatioBadge({
  ratio,
  reference,
  reason,
}: {
  ratio: number | null;
  reference?: boolean;
  reason?: string;
}) {
  if (ratio == null || !isFinite(ratio)) {
    if (reason) {
      return (
        <Tooltip
          label={reason}
          className="cursor-help text-gray-400 underline decoration-dotted decoration-gray-300"
        >
          —
        </Tooltip>
      );
    }
    return <span className="text-gray-400">—</span>;
  }
  // White-as-reference: 1.0× is by construction. Other groups colored
  // by direction and magnitude. The ±10% band reads as essentially
  // equal; larger gaps get colored. Higher (above-reference) is amber
  // — the standard civil-rights "concerning" direction.
  const color = reference
    ? "text-gray-500"
    : Math.abs(ratio - 1) < 0.1
    ? "text-gray-500"
    : ratio > 1
    ? "text-amber-700"
    : "text-blue-700";
  return (
    <span className={`tabular-nums ${color}`}>{ratio.toFixed(1)}×</span>
  );
}

// =============================================================================
// Community table
// =============================================================================

function CommunityTable({ agg }: { agg: Aggregate }) {
  const c = agg.community;
  const enrolled = agg.total_enrollment;
  const inc = agg.median_household_income;

  const popTotal = c.population_total.total;
  const pop517 = c.population_5_17.total;
  const pop517pov = c.population_5_17_poverty.total;
  const childPovertyPct =
    pop517 > 0 && c.population_5_17_poverty.coverage > 0
      ? (pop517pov / pop517) * 100
      : null;
  const captureRate =
    pop517 > 0 && enrolled > 0 ? (enrolled / pop517) * 100 : null;

  const columns = [
    { key: "metric", label: "Metric" },
    { key: "value", label: "Value", align: "right" as ColAlign },
    { key: "coverage", label: "Coverage", align: "right" as ColAlign },
  ];

  return (
    <div className="overflow-x-auto">
    <MetricTable columns={columns}>
      <MetricRow
        label="Total population"
        value={
          c.population_total.coverage > 0 ? formatInt(popTotal) : null
        }
        isMissing={c.population_total.coverage === 0}
        missingKind="saipe"
        missingSource={SAIPE_YEAR}
        coverage={c.population_total.coverage}
        total={agg.entity_count}
      />
      <MetricRow
        label="School-age population (5–17)"
        value={c.population_5_17.coverage > 0 ? formatInt(pop517) : null}
        isMissing={c.population_5_17.coverage === 0}
        missingKind="saipe"
        missingSource={SAIPE_YEAR}
        coverage={c.population_5_17.coverage}
        total={agg.entity_count}
      />
      <MetricRow
        label="Children in poverty (5–17)"
        value={
          c.population_5_17_poverty.coverage > 0
            ? formatInt(pop517pov)
            : null
        }
        valueExtra={
          childPovertyPct != null
            ? `(${childPovertyPct.toFixed(1)}% of school-age)`
            : null
        }
        isMissing={c.population_5_17_poverty.coverage === 0}
        missingKind="saipe"
        missingSource={SAIPE_YEAR}
        coverage={c.population_5_17_poverty.coverage}
        total={agg.entity_count}
      />
      <MetricRow
        label="Median household income"
        labelTooltip={
          agg.entity_count > 1
            ? "Population-weighted average of LEA medians (true grand median requires microdata). Approximates state-level published medians within ~1–2%."
            : "Median household income within the district boundary."
        }
        value={
          inc.weighted != null ? `$${inc.weighted.toLocaleString()}` : null
        }
        valueExtra={
          agg.entity_count > 1 && inc.weighted != null ? "(weighted)" : null
        }
        isMissing={inc.coverage === 0}
        missingKind="acs"
        missingSource={ACS_YEAR}
        coverage={inc.coverage}
        total={agg.entity_count}
      />
      <MetricRow
        label="Public-school capture rate"
        labelTooltip="Enrolled students ÷ school-age residents in district. National average is ~85%. Values below 100% reflect students in the boundary attending private, charter, homeschool, or cross-district public schools. Values >100% mean the district enrolls more students than live within its tabulated boundary — common for charter, virtual, or magnet districts and where SAIPE's boundary doesn't match the actual service area."
        value={captureRate != null ? `${captureRate.toFixed(1)}%` : null}
        coverage={c.population_5_17.coverage}
        total={agg.entity_count}
      />
    </MetricTable>
    </div>
  );
}

// =============================================================================
// Teachers & staff table
// =============================================================================

function TeachersTable({ agg }: { agg: Aggregate }) {
  const s = agg.staff;
  const enrollment = agg.total_enrollment;

  const columns = [
    { key: "metric", label: "Metric" },
    { key: "value", label: "Value", align: "right" as ColAlign },
    { key: "coverage", label: "Coverage", align: "right" as ColAlign },
  ];

  type Row = {
    key: string;
    label: string;
    labelTooltip?: string;
    value: string | null;
    valueExtra?: string | null;
    coverage?: number;
    total?: number;
    isMissing?: boolean;
    kind: "ccd" | "crdc";
    hide: boolean;
  };

  const rows: Row[] = [
    {
      key: "teachers",
      label: "Teachers FTE",
      value:
        s.teachers_fte.coverage > 0
          ? formatFte(s.teachers_fte.total)
          : null,
      coverage: s.teachers_fte.coverage,
      total: agg.entity_count,
      isMissing: s.teachers_fte.coverage === 0,
      kind: "ccd",
      hide: s.teachers_fte.coverage === 0,
    },
    {
      key: "st_ratio",
      label: "Student : teacher ratio",
      labelTooltip:
        "Enrollment ÷ teacher FTE. Coverage reflects entities that reported teacher FTE (enrollment is essentially universal in CCD).",
      value: formatRatio(
        s.teachers_fte.total > 0 ? enrollment : null,
        s.teachers_fte.total > 0 ? s.teachers_fte.total : null
      ),
      coverage: s.teachers_fte.coverage,
      total: agg.entity_count,
      kind: "ccd",
      hide: s.teachers_fte.total <= 0,
    },
    {
      key: "counselors",
      label: "Counselors FTE",
      value:
        s.counselors_fte.coverage > 0
          ? formatFte(s.counselors_fte.total)
          : null,
      coverage: s.counselors_fte.coverage,
      total: agg.entity_count,
      isMissing: s.counselors_fte.coverage === 0,
      kind: "ccd",
      hide: s.counselors_fte.coverage === 0,
    },
    {
      key: "sc_ratio",
      label: "Student : counselor ratio",
      labelTooltip:
        "Enrollment ÷ counselor FTE. Coverage reflects entities that reported counselor FTE.",
      value: formatRatio(
        s.counselors_fte.total > 0 ? enrollment : null,
        s.counselors_fte.total > 0 ? s.counselors_fte.total : null
      ),
      coverage: s.counselors_fte.coverage,
      total: agg.entity_count,
      kind: "ccd",
      hide: s.counselors_fte.total <= 0,
    },
    {
      key: "certified",
      label: "Certified teachers",
      labelTooltip:
        "Share of CRDC-reported teachers who hold a state teaching certificate. Denominator is CRDC's own teacher count (same vintage), not CCD's, since CRDC sometimes self-reports certified ≥ teachers due to multi-credential counting.",
      value: percentOfTeachersCrdc(
        s.teachers_certified_fte.total,
        s.teachers_fte_crdc.total
      ),
      coverage: s.teachers_certified_fte.coverage,
      total: agg.entity_count,
      isMissing: s.teachers_certified_fte.coverage === 0,
      kind: "crdc",
      hide: s.teachers_certified_fte.coverage === 0,
    },
    {
      key: "first_year",
      label: "First-year teachers",
      labelTooltip:
        "Share of CRDC-reported teachers in their first year of teaching. Denominator is CRDC's own teacher count.",
      value: percentOfTeachersCrdc(
        s.teachers_first_year_fte.total,
        s.teachers_fte_crdc.total
      ),
      coverage: s.teachers_first_year_fte.coverage,
      total: agg.entity_count,
      isMissing: s.teachers_first_year_fte.coverage === 0,
      kind: "crdc",
      hide: s.teachers_first_year_fte.coverage === 0,
    },
    {
      key: "absent",
      label: "Teachers absent >10 days",
      labelTooltip:
        "Share of CRDC-reported teachers absent more than 10 school days during the year. Denominator is CRDC's own teacher count.",
      value: percentOfTeachersCrdc(
        s.teachers_absent_fte.total,
        s.teachers_fte_crdc.total
      ),
      coverage: s.teachers_absent_fte.coverage,
      total: agg.entity_count,
      isMissing: s.teachers_absent_fte.coverage === 0,
      kind: "crdc",
      hide: s.teachers_absent_fte.coverage === 0,
    },
  ];

  const visible = rows.filter((r) => !r.hide);
  if (visible.length === 0) return null;

  return (
    <div className="overflow-x-auto">
    <MetricTable columns={columns}>
      {visible.map((r) => (
        <MetricRow
          key={r.key}
          label={r.label}
          labelTooltip={r.labelTooltip}
          value={r.value}
          valueExtra={r.valueExtra}
          isMissing={r.isMissing}
          missingKind={r.kind}
          missingSource={r.kind === "crdc" ? CRDC_YEAR : CCD_YEAR}
          coverage={r.coverage}
          total={r.total}
        />
      ))}
    </MetricTable>
    </div>
  );
}

function percentOfTeachersCrdc(
  numerator: number,
  teachersCrdc: number
): string | null {
  if (teachersCrdc <= 0 || numerator <= 0) return null;
  const pct = (numerator / teachersCrdc) * 100;
  // CRDC sometimes self-reports certified > teachers (multi-credential
  // counting). Clamp to 100% with an explicit marker so the value stays
  // legible without misrepresenting it as a clean percentage.
  if (pct > 100) return ">100% (CRDC reporting quirk)";
  return `${pct.toFixed(1)}%`;
}

// =============================================================================
// Included entities — separate card, matched header style
// =============================================================================

function EntitiesCard({ entities }: { entities: Entity[] }) {
  return (
    <div className="rounded-lg border border-gray-300 bg-white">
      <div className="border-b border-gray-200 px-3 py-4 sm:px-5">
        <h2 className="text-lg font-semibold">
          Included entities{" "}
          <span className="text-sm font-normal text-gray-500">
            ({entities.length})
          </span>
        </h2>
      </div>
      <div className="max-h-[420px] overflow-auto px-3 py-3 sm:px-5">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 text-left">Name</th>
              <th className="py-2 text-left">Type</th>
              <th className="py-2 text-left">State</th>
              <th className="py-2 text-left">NCES ID</th>
              <th className="py-2 text-right">Enrollment</th>
              <th className="py-2 text-right">FRL</th>
              <th className="py-2 text-right">EL</th>
              <th className="py-2 text-right">SWD</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="py-2 font-medium">{e.name}</td>
                <td className="py-2 text-xs uppercase text-gray-500">
                  {e.entity_type}
                </td>
                <td className="py-2">{e.state ?? "—"}</td>
                <td className="py-2 font-mono text-xs">{e.nces_id}</td>
                <td className="py-2 text-right tabular-nums">
                  {e.total_enrollment == null ? (
                    <NotReported source={CCD_YEAR} kind="ccd" />
                  ) : (
                    formatInt(e.total_enrollment)
                  )}
                </td>
                <PctCell
                  value={e.frl_eligible}
                  enrollment={e.total_enrollment}
                  kind="ccd"
                  source={CCD_YEAR}
                  cep={e.cep_participating ?? false}
                />
                <PctCell
                  value={e.english_learners}
                  enrollment={e.total_enrollment}
                  kind="crdc"
                  source={CRDC_YEAR}
                />
                <PctCell
                  value={e.swd}
                  enrollment={e.total_enrollment}
                  kind="crdc"
                  source={CRDC_YEAR}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PctCell({
  value,
  enrollment,
  kind,
  source,
  cep,
}: {
  value: number | null;
  enrollment: number | null;
  kind: "ccd" | "crdc";
  source: string;
  cep?: boolean;
}) {
  if (value == null) {
    return (
      <td className="py-2 text-right">
        <NotReported source={source} kind={kind} />
      </td>
    );
  }
  if (!enrollment) {
    return (
      <td className="py-2 text-right tabular-nums">
        <span className="text-gray-400">{formatInt(value)}</span>
        {cep && <CepDot />}
      </td>
    );
  }
  return (
    <td className="py-2 text-right tabular-nums">
      {`${((value / enrollment) * 100).toFixed(0)}%`}
      {cep && <CepDot />}
    </td>
  );
}

function CepDot() {
  return (
    <Tooltip
      label="Participates in the Community Eligibility Provision (CEP). Under CEP all students get free meals regardless of household income, and the FRL count's reporting methodology varies by district — sometimes universal eligibility, sometimes identified-students × 1.6, sometimes individual applications."
      className="ml-1 inline-block cursor-help align-middle text-[9px] font-semibold uppercase text-amber-700"
    >
      CEP
    </Tooltip>
  );
}

// =============================================================================
// Compare view — metrics as rows, entities as columns (transposed from
// aggregate's metrics-as-cells layout). Race comparison's
// enrolled-vs-community columns and Discipline's race/disability
// disparity matrices don't transpose to N entities meaningfully, so
// those views are aggregate-only; compare shows the headline rate per
// metric per entity.
// =============================================================================

// Each row defines how to extract a numeric value from an entity and
// how to format it for display. Keeping value() separate from format()
// makes downstream uses (CSV export, future small-multiples charts)
// cleaner — they get the raw number without re-parsing formatted text.
type CompareRow = {
  key: string;
  label: string;
  value: (e: Entity) => number | null;
  format: (v: number | null) => React.ReactNode;
};

const RACE_ROWS: CompareRow[] = RACE_FIELDS.map((f) => ({
  key: f,
  label: DEMOGRAPHIC_LABELS[f],
  value: (e) =>
    e[f] != null && e.total_enrollment
      ? ((e[f] as number) / e.total_enrollment) * 100
      : null,
  format: pctFormat,
}));

const PROGRAM_ROWS: CompareRow[] = PROGRAM_FIELDS.map((f) => ({
  key: f,
  label: DEMOGRAPHIC_LABELS[f],
  value: (e) =>
    e[f] != null && e.total_enrollment
      ? ((e[f] as number) / e.total_enrollment) * 100
      : null,
  format: pctFormat,
}));

const COMMUNITY_ROWS: CompareRow[] = [
  {
    key: "pop_total",
    label: "Total population",
    value: (e) => e.population_total ?? null,
    format: intFormat,
  },
  {
    key: "pop_5_17",
    label: "School-age (5–17)",
    value: (e) => e.population_5_17 ?? null,
    format: intFormat,
  },
  {
    key: "child_poverty",
    label: "Children in poverty (5–17)",
    value: (e) =>
      e.population_5_17 && e.population_5_17_poverty != null
        ? (e.population_5_17_poverty / e.population_5_17) * 100
        : null,
    format: pctFormat,
  },
  {
    key: "income",
    label: "Median household income",
    value: (e) => e.median_household_income ?? null,
    format: (v) =>
      v == null ? nullDash() : `$${Math.round(v).toLocaleString()}`,
  },
  {
    key: "capture",
    label: "Public-school capture rate",
    value: (e) =>
      e.population_5_17 && e.total_enrollment
        ? (e.total_enrollment / e.population_5_17) * 100
        : null,
    format: pctFormat,
  },
];

const DISCIPLINE_ROWS: CompareRow[] = DISCIPLINE_METRICS.map((m) => ({
  key: m,
  label: DISCIPLINE_METRIC_LABELS[m],
  value: (e) => {
    const c = e.discipline?.[m]?.total ?? null;
    if (c == null || !e.total_enrollment) return null;
    return (c / e.total_enrollment) * 100;
  },
  format: pctFormat,
}));

const TEACHERS_ROWS: CompareRow[] = [
  {
    key: "teachers_fte",
    label: "Teachers FTE",
    value: (e) => e.teachers_fte ?? null,
    format: (v) => (v == null ? nullDash() : formatFte(v)),
  },
  {
    key: "st_ratio",
    label: "Student : teacher ratio",
    value: (e) =>
      e.teachers_fte && e.total_enrollment
        ? e.total_enrollment / e.teachers_fte
        : null,
    format: (v) => (v == null ? nullDash() : `${v.toFixed(1)} : 1`),
  },
  {
    key: "counselors_fte",
    label: "Counselors FTE",
    value: (e) => e.counselors_fte ?? null,
    format: (v) => (v == null ? nullDash() : formatFte(v)),
  },
  {
    key: "sc_ratio",
    label: "Student : counselor ratio",
    value: (e) =>
      e.counselors_fte && e.total_enrollment
        ? e.total_enrollment / e.counselors_fte
        : null,
    format: (v) => (v == null ? nullDash() : `${Math.round(v)} : 1`),
  },
  {
    key: "certified",
    label: "Certified teachers",
    value: (e) => {
      const num = e.teachers_certified_fte;
      const denom = e.teachers_fte_crdc;
      if (num == null || denom == null || denom <= 0) return null;
      return (num / denom) * 100;
    },
    format: (v) => {
      if (v == null) return nullDash();
      if (v > 100) return ">100%";
      return `${v.toFixed(1)}%`;
    },
  },
];

const COMPARE_SECTIONS = [
  { id: "race", title: "Race / ethnicity", rows: RACE_ROWS, firstColLabel: "Group" },
  { id: "programs", title: "Programs", rows: PROGRAM_ROWS, firstColLabel: "Metric" },
  { id: "community", title: "Community", rows: COMMUNITY_ROWS, firstColLabel: "Metric" },
  { id: "discipline", title: "Discipline", rows: DISCIPLINE_ROWS, firstColLabel: "Metric" },
  { id: "teachers", title: "Teachers & staff", rows: TEACHERS_ROWS, firstColLabel: "Metric" },
] as const;

function captionFor(id: string): string {
  if (id === "race") return `CCD ${CCD_YEAR}`;
  if (id === "programs") return `CCD ${CCD_YEAR} • CRDC ${CRDC_YEAR}`;
  if (id === "community") return `SAIPE ${SAIPE_YEAR} • ACS ${ACS_YEAR}`;
  if (id === "discipline") return `CRDC ${CRDC_YEAR}`;
  return `CCD ${CCD_YEAR} • CRDC ${CRDC_YEAR}`;
}

function CompareView({
  entities,
  onRemoveEntity,
}: {
  entities: Entity[];
  onRemoveEntity?: (id: number) => void;
}) {
  return (
    <div className="space-y-8 pt-2">
      {entities.length > 8 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Comparing {entities.length} entities — beyond ~8 the table gets
          hard to scan. Consider narrowing the selection or switching to
          Aggregate.
        </p>
      )}

      {COMPARE_SECTIONS.map((s) => (
        <CompareSection
          key={s.id}
          id={s.id}
          title={s.title}
          caption={captionFor(s.id)}
          subtitle={
            s.id === "community"
              ? "Residents in the district boundary, not enrolled students. Schools have no boundary-level data."
              : undefined
          }
        >
          <CompareTable
            entities={entities}
            rows={s.rows}
            firstColLabel={s.firstColLabel}
            onRemoveEntity={onRemoveEntity}
          />
        </CompareSection>
      ))}
    </div>
  );
}

function CompareSection({
  id,
  title,
  subtitle,
  caption,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
      {caption && (
        <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">
          {caption}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CompareTable({
  entities,
  rows,
  firstColLabel = "Metric",
  onRemoveEntity,
}: {
  entities: Entity[];
  rows: CompareRow[];
  firstColLabel?: string;
  onRemoveEntity?: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_0_rgb(229,231,235)]">
          <tr className="text-xs uppercase tracking-wide text-gray-500">
            <th
              className={`sticky left-0 z-30 bg-white px-3 py-2 text-left ${LABEL_COL_WIDTH}`}
            >
              {firstColLabel}
            </th>
            {entities.map((e) => (
              <th
                key={e.id}
                className="min-w-[10rem] bg-white px-3 py-2 text-right"
              >
                <CompareEntityHeader
                  entity={e}
                  onRemove={onRemoveEntity}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-gray-100">
              <td
                className={`sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-normal sm:whitespace-nowrap ${LABEL_COL_WIDTH}`}
              >
                {row.label}
              </td>
              {entities.map((e) => (
                <td
                  key={e.id}
                  className="px-3 py-1.5 text-right tabular-nums"
                >
                  {row.format(row.value(e))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompareEntityHeader({
  entity,
  onRemove,
}: {
  entity: Entity;
  onRemove?: (id: number) => void;
}) {
  const truncated =
    entity.name.length > 24 ? entity.name.slice(0, 22) + "…" : entity.name;
  return (
    <div className="flex items-start justify-end gap-1 whitespace-nowrap">
      <div className="flex flex-col items-end">
        <span
          className="font-semibold normal-case text-gray-900"
          title={entity.name}
        >
          {truncated}
        </span>
        <span className="text-[10px] font-normal normal-case text-gray-500">
          {entity.entity_type.toUpperCase()} · {entity.state ?? "—"} ·{" "}
          {entity.nces_id}
        </span>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(entity.id)}
          className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-700"
          aria-label={`Remove ${entity.name}`}
          title={`Remove ${entity.name}`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

function pctFormat(v: number | null): React.ReactNode {
  if (v == null) return nullDash();
  return `${v.toFixed(1)}%`;
}

function intFormat(v: number | null): React.ReactNode {
  if (v == null) return nullDash();
  return formatInt(v);
}

function nullDash() {
  return <span className="text-gray-400">—</span>;
}

// =============================================================================
// Export menu (unchanged behavior, lifted out for layout)
// =============================================================================

function ExportMenu({
  agg,
  entities,
}: {
  agg: Aggregate;
  entities: Entity[];
}) {
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
    for (const f of Object.keys(
      agg.community
    ) as (keyof typeof agg.community)[]) {
      const s = agg.community[f];
      const tot = s.coverage === 0 ? "" : String(s.total);
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
      "population_total",
      "population_5_17",
      "population_5_17_poverty",
      "saipe_year",
      "community_population_acs",
      "community_white",
      "community_black",
      "community_hispanic",
      "community_asian",
      "community_am_indian",
      "community_pacific_islander",
      "community_two_or_more",
      "median_household_income",
      "acs_year",
      "cep_participating",
      "discipline",
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
        <summary className="cursor-pointer list-none rounded-md border border-gray-300 bg-white px-3 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
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
