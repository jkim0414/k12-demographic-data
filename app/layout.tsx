import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const SITE_URL = "https://k12-demographic-data.vercel.app";
const SITE_NAME = "K-12 District Data Explorer";
const TAGLINE =
  "Look up and aggregate federal data for U.S. schools, school districts, and state education agencies.";

// One descriptive paragraph that does double duty as a meta description, an
// OG description, and the lead text in llms.txt. Keep it factual and
// source-attributed — that's what AEO crawlers and AI answer engines lift
// to summarize the site.
const DESCRIPTION =
  "Search U.S. K-12 schools (NCES), school districts (LEAs), and state education agencies (SEAs); " +
  "aggregate enrollment, race/ethnicity, FRL, English learners, students with disabilities, " +
  "discipline, restraint and seclusion, teacher and counselor staffing, child poverty, and " +
  "community demographics from NCES Common Core of Data, the Civil Rights Data Collection, " +
  "Census SAIPE, and Census ACS — joined to NCES district boundaries.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "K-12 data",
    "school district demographics",
    "NCES Common Core of Data",
    "Civil Rights Data Collection",
    "CRDC",
    "Census SAIPE",
    "Census ACS",
    "school discipline disparity",
    "restraint and seclusion",
    "child poverty by district",
    "school district race ethnicity",
    "LEA NCESSCH lookup",
  ],
  authors: [{ name: "James Kim" }],
  creator: "James Kim",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    // app/opengraph-image.tsx renders the OG image dynamically; Next picks
    // it up via the file convention, so no explicit `images` array needed.
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: TAGLINE,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "education",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

// JSON-LD structured data. Two graphs:
//   1. WebApplication — what the site is and who runs it.
//   2. Dataset — the integrated, joined federal dataset the site exposes,
//      with `isBasedOn` references to each upstream source so AEO crawlers
//      can resolve provenance to NCES, CRDC, and the Census Bureau.
// Combined into one @graph so a single <script> emits both.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "EducationalApplication",
      operatingSystem: "All (web)",
      description: DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      audience: {
        "@type": "Audience",
        audienceType:
          "Education researchers, journalists, school district staff, advocacy organizations, parents",
      },
      featureList: [
        "Autocomplete search by NCES code or fuzzy name match",
        "Bulk upload of school/district names via CSV/TSV/XLSX",
        "Aggregate view: enrollment-weighted demographics across selected entities",
        "Compare view: side-by-side metric comparison across districts",
        "Discipline rates and disproportionality (race × disability) including restraint and seclusion",
        "Community demographics within district boundaries (Census SAIPE + ACS)",
        "Shareable URLs that round-trip the exact selection",
        "CSV / JSON export",
      ],
    },
    {
      "@type": "Dataset",
      "@id": `${SITE_URL}/#dataset`,
      name: "Integrated K-12 district demographic dataset",
      description:
        "Per-entity (school / district / SEA) demographic, programmatic, " +
        "discipline, and community-context measures, joined from four federal " +
        "data products to NCES district boundaries.",
      url: SITE_URL,
      keywords: [
        "education",
        "K-12",
        "school district",
        "demographics",
        "discipline",
        "restraint and seclusion",
        "child poverty",
      ],
      isAccessibleForFree: true,
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      creator: {
        "@type": "Person",
        name: "James Kim",
      },
      includedInDataCatalog: {
        "@type": "DataCatalog",
        name: SITE_NAME,
        url: SITE_URL,
      },
      isBasedOn: [
        {
          "@type": "Dataset",
          name: "NCES Common Core of Data (CCD)",
          url: "https://nces.ed.gov/ccd/",
          temporalCoverage: "2023/2024",
        },
        {
          "@type": "Dataset",
          name: "Civil Rights Data Collection (CRDC)",
          url: "https://civilrightsdata.ed.gov/",
          temporalCoverage: "2021/2022",
        },
        {
          "@type": "Dataset",
          name: "Census Small Area Income and Poverty Estimates (SAIPE)",
          url: "https://www.census.gov/programs-surveys/saipe.html",
          temporalCoverage: "2023/2024",
        },
        {
          "@type": "Dataset",
          name: "Census American Community Survey 5-year (ACS)",
          url: "https://www.census.gov/programs-surveys/acs/",
          temporalCoverage: "2019/2023",
        },
      ],
      variableMeasured: [
        "Total enrollment",
        "Enrollment by race/ethnicity",
        "Free / reduced-price lunch eligibility",
        "English learners",
        "Students with disabilities",
        "Discipline counts (suspensions, expulsions, law enforcement referrals, arrests) by race × disability",
        "Restraint and seclusion counts by race × disability",
        "Teacher and counselor FTE; teacher certification, first-year, and absenteeism rates",
        "School-age (5–17) population and child poverty within district boundary",
        "Community race/ethnicity and median household income within district boundary",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Plain inline <script> so the JSON-LD is server-rendered into
            the static HTML and visible to non-JS crawlers (AI answer
            engines, smaller search bots). next/script with a
            beforeInteractive strategy puts it in the deferred script
            buffer instead, which some crawlers don't execute. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
