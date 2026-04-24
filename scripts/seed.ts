import { sql } from "../lib/db";

// A small hand-curated seed of well-known NCES entities with approximate
// demographics so the app is demo-able without running the full ingest.
// Numbers are rounded estimates drawn from recent CCD releases and should
// NOT be used for analysis — run `npm run db:ingest` for accurate data.
//
// Fields (in order):
//   entity_type, nces_id, name, state, lea_id, sea_id, school_year,
//   total_enrollment, am_indian, asian, black, hispanic, pacific_islander,
//   white, two_or_more, frl_eligible, english_learners, swd

type Row = [
  "sea" | "lea" | "school",
  string,
  string,
  string | null,
  string | null,
  string | null,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null
];

const rows: Row[] = [
  // SEAs
  ["sea", "06", "California Department of Education", "CA", null, null, "2023-24",
    5852544, 18000, 500000, 300000, 3300000, 25000, 1200000, 250000, 3300000, 1100000, 700000],
  ["sea", "36", "New York State Education Department", "NY", null, null, "2023-24",
    2400000, 4000, 250000, 430000, 700000, 5000, 900000, 80000, 1200000, 240000, 480000],
  ["sea", "48", "Texas Education Agency", "TX", null, null, "2023-24",
    5500000, 20000, 270000, 700000, 2900000, 10000, 1400000, 180000, 3300000, 1100000, 660000],
  ["sea", "12", "Florida Department of Education", "FL", null, null, "2023-24",
    2850000, 8000, 90000, 600000, 1050000, 4000, 950000, 120000, 1700000, 300000, 400000],

  // LEAs — California
  ["lea", "0622710", "Los Angeles Unified", "CA", null, "06", "2023-24",
    538000, 1200, 20000, 40000, 400000, 1500, 55000, 15000, 430000, 140000, 90000],
  ["lea", "0634770", "San Diego Unified", "CA", null, "06", "2023-24",
    95000, 350, 8000, 8500, 45000, 500, 22000, 9000, 55000, 20000, 14000],
  ["lea", "0636840", "San Francisco Unified", "CA", null, "06", "2023-24",
    49500, 100, 16000, 3500, 15000, 400, 7500, 6000, 27000, 12000, 7500],
  ["lea", "0628050", "Oakland Unified", "CA", null, "06", "2023-24",
    34000, 100, 3500, 7500, 15500, 300, 3500, 3100, 26000, 11000, 5800],
  ["lea", "0638010", "Santa Ana Unified", "CA", null, "06", "2023-24",
    41000, 50, 1200, 200, 37500, 80, 1400, 600, 35000, 17000, 7500],
  ["lea", "0632550", "Fresno Unified", "CA", null, "06", "2023-24",
    71000, 900, 8000, 5500, 45000, 500, 8500, 2600, 62000, 15000, 10500],

  // LEAs — New York
  ["lea", "3620580", "New York City Geographic District #2", "NY", null, "36", "2023-24",
    60000, 150, 18000, 9000, 18000, 150, 12000, 2700, 32000, 8000, 11000],
  ["lea", "3600004", "New York City Department Of Education", "NY", null, "36", "2023-24",
    914000, 1500, 165000, 225000, 380000, 1800, 125000, 16000, 660000, 150000, 200000],
  ["lea", "3620430", "Buffalo City Schools", "NY", null, "36", "2023-24",
    31000, 400, 1500, 13000, 9500, 150, 5200, 1500, 27000, 6500, 6200],
  ["lea", "3625850", "Rochester City School District", "NY", null, "36", "2023-24",
    22500, 100, 750, 11000, 8500, 80, 1700, 700, 20500, 4800, 5500],

  // LEAs — Texas
  ["lea", "4823640", "Houston ISD", "TX", null, "48", "2023-24",
    184000, 200, 8000, 42000, 115000, 500, 16000, 2500, 145000, 66000, 15500],
  ["lea", "4816230", "Dallas ISD", "TX", null, "48", "2023-24",
    141000, 200, 1400, 30000, 100000, 200, 6000, 3000, 120000, 55000, 14000],
  ["lea", "4808940", "Austin ISD", "TX", null, "48", "2023-24",
    73000, 200, 3000, 4500, 40000, 300, 20000, 5000, 38000, 22000, 8500],
  ["lea", "4840860", "Fort Worth ISD", "TX", null, "48", "2023-24",
    74000, 300, 2000, 16000, 47000, 200, 7000, 1500, 60000, 24000, 7500],
  ["lea", "4844010", "San Antonio ISD", "TX", null, "48", "2023-24",
    44000, 50, 300, 2500, 39000, 80, 1500, 570, 40000, 11000, 5500],

  // LEAs — Florida
  ["lea", "1200150", "Miami-Dade County Public Schools", "FL", null, "12", "2023-24",
    331000, 400, 4000, 77000, 230000, 400, 16000, 3200, 240000, 80000, 40000],
  ["lea", "1200840", "Broward County Public Schools", "FL", null, "12", "2023-24",
    258000, 600, 11000, 100000, 90000, 500, 47000, 8900, 170000, 38000, 34000],
  ["lea", "1201140", "Orange County Public Schools", "FL", null, "12", "2023-24",
    209000, 400, 11000, 54000, 94000, 400, 41000, 8200, 140000, 40000, 28000],
  ["lea", "1201470", "Hillsborough County Public Schools", "FL", null, "12", "2023-24",
    225000, 700, 9500, 47000, 82000, 800, 73000, 12000, 140000, 34000, 29000],

  // Schools — a few well-known ones per district
  ["school", "062271003234", "Hollywood Senior High", "CA", "0622710", "06", "2023-24",
    1350, 5, 50, 120, 1050, 10, 90, 25, 1200, 400, 200],
  ["school", "062271006116", "Fairfax Senior High", "CA", "0622710", "06", "2023-24",
    1800, 8, 100, 200, 1250, 15, 180, 47, 1500, 420, 270],
  ["school", "063684006053", "Lowell High School", "CA", "0636840", "06", "2023-24",
    2700, 3, 1600, 60, 270, 10, 400, 357, 650, 90, 160],
  ["school", "063684006051", "Mission High School", "CA", "0636840", "06", "2023-24",
    1050, 5, 230, 60, 630, 12, 85, 28, 770, 340, 170],
  ["school", "360007702877", "Stuyvesant High School", "NY", "3600004", "36", "2023-24",
    3400, 3, 2100, 100, 280, 5, 750, 162, 1500, 80, 120],
  ["school", "360007702878", "Bronx High School Of Science", "NY", "3600004", "36", "2023-24",
    3050, 2, 1700, 110, 380, 5, 670, 183, 1400, 120, 180],
  ["school", "360007702894", "Brooklyn Technical High School", "NY", "3600004", "36", "2023-24",
    5850, 4, 3800, 500, 600, 10, 760, 176, 3500, 250, 400],
  ["school", "480894000003", "Austin High School", "TX", "4808940", "48", "2023-24",
    2400, 5, 100, 150, 1200, 15, 830, 100, 1100, 480, 280],
  ["school", "481623000070", "Booker T. Washington High School", "TX", "4816230", "48", "2023-24",
    950, 3, 20, 490, 330, 5, 80, 22, 720, 60, 95],
  ["school", "482364000130", "Lamar High School", "TX", "4823640", "48", "2023-24",
    3300, 5, 180, 500, 2100, 15, 450, 50, 2200, 780, 380],
  ["school", "120015000361", "Miami Senior High School", "FL", "1200150", "12", "2023-24",
    2800, 3, 30, 80, 2600, 6, 70, 11, 2500, 1400, 340],
  ["school", "120015000477", "Coral Gables Senior High", "FL", "1200150", "12", "2023-24",
    3350, 5, 100, 220, 2700, 10, 280, 35, 2100, 600, 390],
  ["school", "120084000540", "Nova High School", "FL", "1200840", "12", "2023-24",
    2400, 10, 130, 700, 1020, 15, 440, 85, 1400, 180, 300],
];

async function main() {
  console.log(`seeding ${rows.length} entities...`);

  // Insert in a single multi-row statement; ON CONFLICT updates.
  const values = rows.map((r) => ({
    entity_type: r[0],
    nces_id: r[1],
    name: r[2],
    state: r[3],
    lea_id: r[4],
    sea_id: r[5],
    school_year: r[6],
    total_enrollment: r[7],
    am_indian: r[8],
    asian: r[9],
    black: r[10],
    hispanic: r[11],
    pacific_islander: r[12],
    white: r[13],
    two_or_more: r[14],
    frl_eligible: r[15],
    english_learners: r[16],
    swd: r[17],
  }));

  for (const v of values) {
    await sql`
      INSERT INTO entities ${sql(v)}
      ON CONFLICT (nces_id) DO UPDATE SET
        name = EXCLUDED.name,
        state = EXCLUDED.state,
        lea_id = EXCLUDED.lea_id,
        sea_id = EXCLUDED.sea_id,
        school_year = EXCLUDED.school_year,
        total_enrollment = EXCLUDED.total_enrollment,
        am_indian = EXCLUDED.am_indian,
        asian = EXCLUDED.asian,
        black = EXCLUDED.black,
        hispanic = EXCLUDED.hispanic,
        pacific_islander = EXCLUDED.pacific_islander,
        white = EXCLUDED.white,
        two_or_more = EXCLUDED.two_or_more,
        frl_eligible = EXCLUDED.frl_eligible,
        english_learners = EXCLUDED.english_learners,
        swd = EXCLUDED.swd,
        updated_at = now()
    `;
  }

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM entities`;
  console.log(`done. ${count} entities in database.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
