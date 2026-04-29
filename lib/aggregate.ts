import {
  Aggregate,
  COMMUNITY_FIELDS,
  DEMOGRAPHIC_FIELDS,
  DemographicField,
  Entity,
  STAFF_FIELDS,
} from "./types";

export function aggregate(entities: Entity[]): Aggregate {
  const breakdown = {} as Aggregate["breakdown"];
  for (const field of DEMOGRAPHIC_FIELDS) {
    breakdown[field] = { total: 0, percent: null, coverage: 0 };
  }
  const staff = {} as Aggregate["staff"];
  for (const field of STAFF_FIELDS) {
    staff[field] = { total: 0, coverage: 0 };
  }
  const community = {} as Aggregate["community"];
  for (const field of COMMUNITY_FIELDS) {
    community[field] = { total: 0, coverage: 0 };
  }

  let total_enrollment = 0;

  for (const e of entities) {
    if (e.total_enrollment != null) {
      total_enrollment += e.total_enrollment;
    }
    for (const field of DEMOGRAPHIC_FIELDS) {
      const v = e[field];
      if (v != null) {
        breakdown[field].total += v;
        breakdown[field].coverage += 1;
      }
    }
    for (const field of STAFF_FIELDS) {
      const v = e[field];
      if (v != null) {
        staff[field].total += v;
        staff[field].coverage += 1;
      }
    }
    for (const field of COMMUNITY_FIELDS) {
      const v = e[field];
      if (v != null) {
        community[field].total += v;
        community[field].coverage += 1;
      }
    }
  }

  // Percentages are against the total enrollment of entities that reported
  // the given field — not against the grand total — so a partially-reported
  // field doesn't look artificially low. For each field we recompute the
  // denominator across entities that had that field populated AND reported
  // enrollment.
  for (const field of DEMOGRAPHIC_FIELDS) {
    let denom = 0;
    for (const e of entities) {
      if (e[field] != null && e.total_enrollment != null) {
        denom += e.total_enrollment;
      }
    }
    breakdown[field].percent =
      denom > 0 ? (breakdown[field].total / denom) * 100 : null;
  }

  // Population-weighted median income. True statewide median requires
  // microdata, but weighting LEA medians by population is the standard
  // ad-hoc summary and lines up well with state-published medians.
  let income_numer = 0;
  let income_denom = 0;
  let income_coverage = 0;
  for (const e of entities) {
    if (
      e.median_household_income != null &&
      e.community_population_acs != null &&
      e.community_population_acs > 0
    ) {
      income_numer += e.median_household_income * e.community_population_acs;
      income_denom += e.community_population_acs;
      income_coverage += 1;
    }
  }

  let cep_count = 0;
  for (const e of entities) if (e.cep_participating) cep_count += 1;

  return {
    entity_count: entities.length,
    total_enrollment,
    breakdown,
    staff,
    community,
    median_household_income: {
      weighted: income_denom > 0 ? Math.round(income_numer / income_denom) : null,
      coverage: income_coverage,
    },
    cep_count,
  };
}

export function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export function formatInt(v: number | null): string {
  if (v == null) return "—";
  return Math.round(v).toLocaleString();
}

export function formatFte(v: number | null): string {
  if (v == null) return "—";
  // FTE counts at LEA/SEA scale are 4–5 digits, where a fractional
  // remainder would just be visual noise. Round those. But at school
  // scale a counselor can legitimately be 0.5 FTE, and rounding that to 1
  // makes derived ratios (e.g. student:counselor) look wrong against the
  // displayed value. Keep a decimal for small values.
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString();
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(1);
}

export function formatRatio(
  numerator: number | null,
  denominator: number | null
): string {
  if (numerator == null || denominator == null || denominator === 0) return "—";
  return `${Math.round(numerator / denominator).toLocaleString()} : 1`;
}

export type { DemographicField };
