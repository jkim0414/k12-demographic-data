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
  teachers_certified_fte: number | null;
  teachers_first_year_fte: number | null;
  teachers_absent_fte: number | null;
  population_total: number | null;
  population_5_17: number | null;
  population_5_17_poverty: number | null;
  saipe_year: string | null;
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

export const RACE_FIELDS: DemographicField[] = [
  "am_indian",
  "asian",
  "black",
  "hispanic",
  "pacific_islander",
  "white",
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
};

// Staff FTE fields. Sourced from CCD directory for teachers/staff/counselors
// (at LEA level) and the school-level teachers_fte; from CRDC teachers-staff
// for certified/first-year/absent counts.
export const STAFF_FIELDS = [
  "teachers_fte",
  "staff_total_fte",
  "counselors_fte",
  "teachers_certified_fte",
  "teachers_first_year_fte",
  "teachers_absent_fte",
] as const;

export type StaffField = (typeof STAFF_FIELDS)[number];

export const STAFF_SOURCE: Record<StaffField, string> = {
  teachers_fte: CCD_YEAR,
  staff_total_fte: CCD_YEAR,
  counselors_fte: CCD_YEAR, // LEAs from CCD; schools roll up from CRDC
  teachers_certified_fte: CRDC_YEAR,
  teachers_first_year_fte: CRDC_YEAR,
  teachers_absent_fte: CRDC_YEAR,
};

// Community population: residents within an LEA's geographic boundary,
// from the Census Bureau's SAIPE program (joined to NCES districts).
// Only LEAs and SEAs (rolled up); schools have no SAIPE concept.
export const COMMUNITY_FIELDS = [
  "population_total",
  "population_5_17",
  "population_5_17_poverty",
] as const;

export type CommunityField = (typeof COMMUNITY_FIELDS)[number];

export const SAIPE_YEAR = "2023-24";
