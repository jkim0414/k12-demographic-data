import {
  Aggregate,
  DEMOGRAPHIC_FIELDS,
  DemographicField,
  Entity,
} from "./types";

export function aggregate(entities: Entity[]): Aggregate {
  const breakdown = {} as Aggregate["breakdown"];
  for (const field of DEMOGRAPHIC_FIELDS) {
    breakdown[field] = { total: 0, percent: null, coverage: 0 };
  }

  let total_enrollment = 0;
  let enrollment_coverage = 0;

  for (const e of entities) {
    if (e.total_enrollment != null) {
      total_enrollment += e.total_enrollment;
      enrollment_coverage += 1;
    }
    for (const field of DEMOGRAPHIC_FIELDS) {
      const v = e[field];
      if (v != null) {
        breakdown[field].total += v;
        breakdown[field].coverage += 1;
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

  void enrollment_coverage;

  return {
    entity_count: entities.length,
    total_enrollment,
    breakdown,
  };
}

export function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export function formatInt(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString();
}

export type { DemographicField };
