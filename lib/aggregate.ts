import {
  Aggregate,
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

  return {
    entity_count: entities.length,
    total_enrollment,
    breakdown,
    staff,
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
  // FTE counts at LEA/SEA scale are big (5-digit) so drop the decimal;
  // small-school values round cleanly too.
  return Math.round(v).toLocaleString();
}

export function formatRatio(
  numerator: number | null,
  denominator: number | null
): string {
  if (numerator == null || denominator == null || denominator === 0) return "—";
  return `${Math.round(numerator / denominator).toLocaleString()} : 1`;
}

export type { DemographicField };
