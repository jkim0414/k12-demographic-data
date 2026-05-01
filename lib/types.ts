export type EntityType = "sea" | "lea" | "school";

export type Entity = {
  id: number;
  entity_type: EntityType;
  nces_id: string;
  name: string;
  state: string | null;
  lea_id: string | null;
  sea_id: string | null;
  school_year: string | null;
  total_enrollment: number | null;
  am_indian: number | null;
  asian: number | null;
  black: number | null;
  hispanic: number | null;
  pacific_islander: number | null;
  white: number | null;
  two_or_more: number | null;
  frl_eligible: number | null;
  english_learners: number | null;
  swd: number | null;
  teachers_fte: number | null;
  staff_total_fte: number | null;
  counselors_fte: number | null;
  teachers_fte_crdc: number | null;
  teachers_certified_fte: number | null;
  teachers_first_year_fte: number | null;
  teachers_absent_fte: number | null;
  population_total: number | null;
  population_5_17: number | null;
  population_5_17_poverty: number | null;
  saipe_year: string | null;
  community_white: number | null;
  community_black: number | null;
  community_hispanic: number | null;
  community_asian: number | null;
  community_am_indian: number | null;
  community_pacific_islander: number | null;
  community_two_or_more: number | null;
  community_population_acs: number | null;
  median_household_income: number | null;
  acs_year: string | null;
  cep_participating: boolean | null;
  discipline: DisciplineCounts | null;
  // CRDC restraint and seclusion. Unique-student counts in the same
  // metric × group shape as `discipline`, so the Discipline UI tables
  // host these as additional columns rather than a separate sub-table.
  restraint: RestraintCounts | null;
};

// Restraint metric vocabulary. Lives alongside DisciplineMetric rather
// than under it because the source data is a separate CRDC release
// (different field names, different reporting universe), but
// downstream the UI treats them as one combined column set on the
// Discipline tables. See `ALL_DISCIPLINE_METRICS` in components.
export type RestraintMetric =
  | "mech_restraint"
  | "phys_restraint"
  | "seclusion";

export const RESTRAINT_METRICS: RestraintMetric[] = [
  "mech_restraint",
  "phys_restraint",
  "seclusion",
];

export const RESTRAINT_METRIC_LABELS: Record<RestraintMetric, string> = {
  mech_restraint: "Mechanical restraint",
  phys_restraint: "Physical restraint",
  seclusion: "Seclusion",
};

export type RestraintCounts = Record<
  RestraintMetric,
  Record<DisciplineGroup, number>
>;

// Per-entity discipline counts from CRDC. Five headline metrics, each
// broken down by total / SWD / seven racial groups. Null at the entity
// level when CRDC suppressed everything for that school's release; for
// rolled-up LEAs and SEAs, the rollup sums whatever its descendant
// schools reported.
export type DisciplineMetric =
  | "in_school_susp"
  | "out_school_susp"
  | "expulsion"
  | "law_enforcement_ref"
  | "arrest";

export const DISCIPLINE_METRICS: DisciplineMetric[] = [
  "in_school_susp",
  "out_school_susp",
  "expulsion",
  "law_enforcement_ref",
  "arrest",
];

export const DISCIPLINE_METRIC_LABELS: Record<DisciplineMetric, string> = {
  in_school_susp: "In-school suspension",
  out_school_susp: "Out-of-school suspension",
  expulsion: "Expulsion",
  law_enforcement_ref: "Referred to law enforcement",
  arrest: "School-related arrest",
};

export type DisciplineGroup =
  | "total"
  | "swd"
  | "white"
  | "black"
  | "hispanic"
  | "asian"
  | "am_indian"
  | "pacific_islander"
  | "two_or_more";

export type DisciplineCounts = Record<
  DisciplineMetric,
  Record<DisciplineGroup, number>
>;

// Maps discipline race-group keys back to enrolled-race fields, so the
// UI can compute "Black students disciplined ÷ Black students enrolled".
export const DISCIPLINE_RACE_TO_ENROLLED: Record<
  Exclude<DisciplineGroup, "total" | "swd">,
  DemographicField
> = {
  white: "white",
  black: "black",
  hispanic: "hispanic",
  asian: "asian",
  am_indian: "am_indian",
  pacific_islander: "pacific_islander",
  two_or_more: "two_or_more",
};

export type SearchHit = Entity & {
  match_kind: "code" | "name";
  similarity: number; // 1.0 for exact code match
};

export type MatchResult = {
  query: string;
  hits: SearchHit[];
  chosen: SearchHit | null;
};

export const DEMOGRAPHIC_FIELDS = [
  "am_indian",
  "asian",
  "black",
  "hispanic",
  "pacific_islander",
  "white",
  "two_or_more",
  "frl_eligible",
  "english_learners",
  "swd",
] as const;

export type DemographicField = (typeof DEMOGRAPHIC_FIELDS)[number];

export const DEMOGRAPHIC_LABELS: Record<DemographicField, string> = {
  am_indian: "American Indian / Alaska Native",
  asian: "Asian",
  black: "Black",
  hispanic: "Hispanic / Latino",
  pacific_islander: "Native Hawaiian / Pacific Islander",
  white: "White",
  two_or_more: "Two or more races",
  frl_eligible: "Free / reduced-price lunch eligible",
  english_learners: "English learners",
  swd: "Students with disabilities",
};

// The race and FRL columns are populated from CCD; EL and SWD are populated
// from CRDC (biennial) because CCD no longer publishes those counts at the
// directory level. Surfaced in the UI next to each field.
export const CCD_YEAR = "2023-24";
export const CRDC_YEAR = "2021-22";

export const DEMOGRAPHIC_SOURCE: Record<DemographicField, string> = {
  am_indian: CCD_YEAR,
  asian: CCD_YEAR,
  black: CCD_YEAR,
  hispanic: CCD_YEAR,
  pacific_islander: CCD_YEAR,
  white: CCD_YEAR,
  two_or_more: CCD_YEAR,
  frl_eligible: CCD_YEAR,
  english_learners: CRDC_YEAR,
  swd: CRDC_YEAR,
};

// Order matches COMMUNITY_RACE_FIELDS and DISCIPLINE_RACE_TO_ENROLLED so
// every race-keyed table in the app reads in the same sequence. Follows
// the NCES-conventional ordering (white, black, hispanic, asian, AIAN,
// NHPI, two-or-more) rather than alphabetical.
export const RACE_FIELDS: DemographicField[] = [
  "white",
  "black",
  "hispanic",
  "asian",
  "am_indian",
  "pacific_islander",
  "two_or_more",
];

export type Aggregate = {
  entity_count: number;
  total_enrollment: number;
  breakdown: Record<
    DemographicField,
    {
      total: number;
      percent: number | null; // share of total enrollment (null if no enrollment)
      coverage: number;       // number of entities reporting this field
    }
  >;
  staff: Record<
    StaffField,
    {
      total: number;
      coverage: number;
    }
  >;
  community: Record<
    CommunityField,
    {
      total: number;
      coverage: number;
    }
  >;
  // Population-weighted median household income across the entities that
  // reported it. Median can't be summed; this is the standard summary.
  median_household_income: {
    weighted: number | null;
    coverage: number;
  };
  // Count of selected entities that participate in CEP (Community
  // Eligibility Provision). Surfaced as a flag on the FRL row because
  // CEP changes how FRL counts are reported.
  cep_count: number;
  // Summed discipline counts (one bucket per metric × group) plus the
  // count of entities that contributed any reported data. UI computes
  // rates and disparity ratios from these and from breakdown totals.
  discipline: {
    counts: DisciplineCounts;
    coverage: number; // entities with non-null discipline JSON
  };
  // Restraint and seclusion: same shape as discipline (per-metric ×
  // per-group sums). Surfaced on the Discipline tables as three extra
  // metric columns alongside the five discipline columns.
  restraint: {
    counts: RestraintCounts;
    coverage: number; // entities with non-null restraint JSON
  };
};

// Staff FTE fields. Sourced from CCD directory for teachers/staff/counselors
// (at LEA level) and the school-level teachers_fte; from CRDC teachers-staff
// for certified/first-year/absent counts.
export const STAFF_FIELDS = [
  "teachers_fte",
  "staff_total_fte",
  "counselors_fte",
  "teachers_fte_crdc",
  "teachers_certified_fte",
  "teachers_first_year_fte",
  "teachers_absent_fte",
] as const;

export type StaffField = (typeof STAFF_FIELDS)[number];

export const STAFF_SOURCE: Record<StaffField, string> = {
  teachers_fte: CCD_YEAR,
  staff_total_fte: CCD_YEAR,
  counselors_fte: CCD_YEAR, // LEAs from CCD; schools roll up from CRDC
  teachers_fte_crdc: CRDC_YEAR,
  teachers_certified_fte: CRDC_YEAR,
  teachers_first_year_fte: CRDC_YEAR,
  teachers_absent_fte: CRDC_YEAR,
};

// Community fields: stats about residents within an LEA's geographic
// boundary (not enrolled students). Only LEAs and SEAs (rolled up);
// schools have no boundary-level concept.
//
// SAIPE counts come from Census SAIPE; race + income come from Census
// ACS 5-year. Both sources are joined to NCES districts via state FIPS
// + 5-digit district code, so they share the same denominator.
export const COMMUNITY_FIELDS = [
  // SAIPE
  "population_total",
  "population_5_17",
  "population_5_17_poverty",
  // ACS race buckets — mutually exclusive, sum to community_population_acs
  "community_white",
  "community_black",
  "community_hispanic",
  "community_asian",
  "community_am_indian",
  "community_pacific_islander",
  "community_two_or_more",
  "community_population_acs",
] as const;

export type CommunityField = (typeof COMMUNITY_FIELDS)[number];

// Race-only subset for side-by-side comparison with enrolled students.
// Order intentionally mirrors RACE_FIELDS so the two tables read together.
export const COMMUNITY_RACE_FIELDS: CommunityField[] = [
  "community_white",
  "community_black",
  "community_hispanic",
  "community_asian",
  "community_am_indian",
  "community_pacific_islander",
  "community_two_or_more",
];

// Maps an enrolled-students race field to the matching community field.
export const ENROLLED_TO_COMMUNITY: Partial<
  Record<DemographicField, CommunityField>
> = {
  white: "community_white",
  black: "community_black",
  hispanic: "community_hispanic",
  asian: "community_asian",
  am_indian: "community_am_indian",
  pacific_islander: "community_pacific_islander",
  two_or_more: "community_two_or_more",
};

export const SAIPE_YEAR = "2023-24";
export const ACS_YEAR = "2019-2023";
