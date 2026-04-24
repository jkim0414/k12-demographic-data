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
};
