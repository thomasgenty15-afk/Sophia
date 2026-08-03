// KEEL W3.3 — crisis resource resolution: per country, and LOUD on fallback.
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  CRISIS_RESOURCE_KINDS,
  crisisCountryForProfile,
  crisisCountryFromLocale,
  crisisResourceRegistryRows,
  fetchCrisisResources,
  formatCrisisContacts,
  INTERNATIONAL_FALLBACK_COUNTRY,
  parseCrisisResourceKind,
  resolveCrisisResources,
  resolveSafetyResourceNumbers,
  resolveSafetyResourceNumbersForProfile,
} from "./crisis_resources.ts";

/** Captures console.warn so "loud" can be asserted, not assumed. */
function captureWarnings<T>(run: () => T): { result: T; warnings: string[] } {
  const original = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => JSON.stringify(a)).join(" "));
  };
  try {
    return { result: run(), warnings };
  } finally {
    console.warn = original;
  }
}

// ---------------------------------------------------------------------------
// Resolution by country
// ---------------------------------------------------------------------------

Deno.test("resolveCrisisResources — US suicide is 988, not 3114", () => {
  const { result, warnings } = captureWarnings(() =>
    resolveCrisisResources("US", "suicide")
  );
  assertEquals(result.fallbackUsed, false);
  assertEquals(result.resolutionSource, "country");
  assertEquals(result.resources[0].contact, "988");
  assertEquals(warnings.length, 0);
});

Deno.test("resolveCrisisResources — country sets are disjoint (the whole bug)", () => {
  const suicideByCountry = ["US", "GB", "FR"].map((country) =>
    resolveCrisisResources(country, "suicide").resources[0].contact
  );
  assertEquals(suicideByCountry, ["988", "116 123", "3114"]);
  const emergencyFirst = ["US", "GB", "FR"].map((country) =>
    resolveCrisisResources(country, "emergency").resources[0].contact
  );
  assertEquals(emergencyFirst, ["911", "999", "15"]);
});

Deno.test("resolveCrisisResources — 'UK' is an input alias for 'GB'", () => {
  const { result, warnings } = captureWarnings(() =>
    resolveCrisisResources("uk", "emergency")
  );
  assertEquals(result.country, "GB");
  assertEquals(result.fallbackUsed, false);
  assertEquals(warnings.length, 0);
});

Deno.test("resolveCrisisResources — priority orders the contacts", () => {
  const fr = resolveCrisisResources("FR", "emergency");
  assertEquals(fr.resources.map((r) => r.contact), ["15", "112"]);
  assertEquals(formatCrisisContacts(fr, "ou"), "15 ou 112");
  assertEquals(formatCrisisContacts(fr), "15 or 112");
});

Deno.test("resolveCrisisResources — every seeded country covers every kind or degrades", () => {
  for (const country of ["US", "GB", "FR", "ZZ"]) {
    for (const kind of CRISIS_RESOURCE_KINDS) {
      const { result } = captureWarnings(() =>
        resolveCrisisResources(country, kind)
      );
      // The contract that matters on a crisis path: never empty.
      assertEquals(result.resources.length > 0, true, `${country}/${kind}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Loud fallback (R7)
// ---------------------------------------------------------------------------

Deno.test("resolveCrisisResources — unknown country degrades LOUDLY, never silently", () => {
  const { result, warnings } = captureWarnings(() =>
    resolveCrisisResources("DE", "suicide")
  );
  assertEquals(result.fallbackUsed, true);
  assertEquals(result.country, INTERNATIONAL_FALLBACK_COUNTRY);
  assertEquals(
    result.resolutionSource,
    "international_fallback_country_unsupported",
  );
  assertEquals(result.requestedCountry, "DE");
  assertEquals(warnings.length, 1);
  assertEquals(warnings[0].includes("keel.crisis_resources.fallback_used"), true);
  assertEquals(warnings[0].includes("\"DE\""), true);
});

Deno.test("resolveCrisisResources — a German user is NEVER handed 3114", () => {
  const { result } = captureWarnings(() =>
    resolveCrisisResources("DE", "suicide")
  );
  assertEquals(
    result.resources.some((r) => r.contact === "3114"),
    false,
  );
});

Deno.test("resolveCrisisResources — missing country degrades LOUDLY", () => {
  for (const missing of [null, undefined, "", "   ", "x"]) {
    const { result, warnings } = captureWarnings(() =>
      resolveCrisisResources(missing, "emergency")
    );
    assertEquals(result.fallbackUsed, true);
    assertEquals(
      result.resolutionSource,
      "international_fallback_country_missing",
    );
    assertEquals(result.resources[0].contact, "112");
    assertEquals(warnings.length, 1);
  }
});

Deno.test("parseCrisisResourceKind — unknown kind THROWS (R7)", () => {
  assertThrows(
    () => parseCrisisResourceKind("burnout"),
    Error,
    "Unknown crisis resource kind",
  );
  assertThrows(() => resolveCrisisResources("FR", "hotline"), Error);
  assertEquals(parseCrisisResourceKind("Eating-Disorder"), "eating_disorder");
});

// ---------------------------------------------------------------------------
// Locale -> country
// ---------------------------------------------------------------------------

Deno.test("crisisCountryFromLocale — region subtag wins", () => {
  assertEquals(crisisCountryFromLocale("en-US"), "US");
  assertEquals(crisisCountryFromLocale("en_GB"), "GB");
  assertEquals(crisisCountryFromLocale("fr-FR"), "FR");
  assertEquals(crisisCountryFromLocale("fr-CA"), "FR"); // language default, CA unseeded
});

Deno.test("crisisCountryFromLocale — 'en' alone is NOT guessed", () => {
  // Guessing US or GB from 'en' is the silent guess R7 forbids.
  assertEquals(crisisCountryFromLocale("en"), null);
  assertEquals(crisisCountryFromLocale(""), null);
  assertEquals(crisisCountryFromLocale(null), null);
  assertEquals(crisisCountryFromLocale("de-DE"), null);
});

// ---------------------------------------------------------------------------
// The two strings the legacy safety surfaces interpolate
// ---------------------------------------------------------------------------

Deno.test("resolveSafetyResourceNumbers — FR reproduces the previous hardcoded strings", () => {
  const { result } = captureWarnings(() =>
    resolveSafetyResourceNumbers("FR", { conjunction: "ou" })
  );
  assertEquals(result.emergency_numbers, "15 ou 112");
  assertEquals(result.suicide_prevention_number, "3114");
  assertEquals(result.fallback_used, false);
});

Deno.test("resolveSafetyResourceNumbers — US does not reproduce them", () => {
  const { result } = captureWarnings(() => resolveSafetyResourceNumbers("US"));
  assertEquals(result.emergency_numbers, "911");
  assertEquals(result.suicide_prevention_number, "988");
});

// ---------------------------------------------------------------------------
// Drift between the migration seed and the compiled-in mirror
// ---------------------------------------------------------------------------

Deno.test("registry mirrors the migration seed exactly (no drift)", async () => {
  const sqlUrl = new URL(
    "../../../migrations/20260727170000_keel_crisis_resources.sql",
    import.meta.url,
  );
  const sql = await Deno.readTextFile(sqlUrl);
  const valuesBlock = sql.slice(
    sql.indexOf("(country, kind, label, contact, url, content_locale, priority)"),
    sql.indexOf("on conflict"),
  );
  // One tuple per row: ('XX', 'kind', 'label', 'contact', url|null, 'locale', n)
  const tuples = [
    ...valuesBlock.matchAll(
      /\(\s*'([A-Z]{2})',\s*'([a-z_]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*(null|'(?:[^']|'')*'),\s*'([a-z-]+)',\s*(\d+)\s*\)/g,
    ),
  ];
  const fromSql = tuples.map((m) => ({
    country: m[1],
    kind: m[2],
    label: m[3].replaceAll("''", "'"),
    contact: m[4].replaceAll("''", "'"),
    url: m[5] === "null" ? null : m[5].slice(1, -1).replaceAll("''", "'"),
    contentLocale: m[6],
    priority: Number(m[7]),
  }));
  const fromRegistry = crisisResourceRegistryRows();
  assertEquals(
    fromSql.length,
    fromRegistry.length,
    "row count differs between the SQL seed and the compiled-in registry",
  );
  const key = (r: { country: string; kind: string; contact: string }) =>
    `${r.country}|${r.kind}|${r.contact}`;
  const sqlByKey = new Map(fromSql.map((r) => [key(r), r]));
  for (const row of fromRegistry) {
    const seeded = sqlByKey.get(key(row));
    assertEquals(Boolean(seeded), true, `missing in SQL seed: ${key(row)}`);
    assertEquals(seeded, {
      country: row.country,
      kind: row.kind,
      label: row.label,
      contact: row.contact,
      url: row.url,
      contentLocale: row.contentLocale,
      priority: row.priority,
    });
  }
});

// ---------------------------------------------------------------------------
// DB-backed variant
// ---------------------------------------------------------------------------

function fakeDb(
  outcome: { rows?: unknown[] | null; error?: unknown; throws?: boolean },
) {
  return {
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_c1: string, _v1: string) {
              return {
                eq(_c2: string, _v2: string) {
                  return {
                    // deno-lint-ignore require-await
                    async order(_c: string, _o: { ascending: boolean }) {
                      if (outcome.throws) throw new Error("connection reset");
                      return {
                        data: (outcome.rows ?? null) as never,
                        error: outcome.error ?? null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

Deno.test("fetchCrisisResources — reads the table when it answers", async () => {
  const db = fakeDb({
    rows: [{
      country: "US",
      kind: "suicide",
      label: "seeded from db",
      contact: "988",
      url: null,
      content_locale: "en",
      priority: 10,
    }],
  });
  const result = await fetchCrisisResources(db, "US", "suicide");
  assertEquals(result.fallbackUsed, false);
  assertEquals(result.resources[0].label, "seeded from db");
});

Deno.test("fetchCrisisResources — a DB failure degrades onto the registry, loudly", async () => {
  const original = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => JSON.stringify(a)).join(" "));
  };
  try {
    const result = await fetchCrisisResources(fakeDb({ throws: true }), "FR", "suicide");
    assertEquals(result.resources[0].contact, "3114");
    assertEquals(
      warnings.some((w) => w.includes("keel.crisis_resources.db_read_failed")),
      true,
    );
  } finally {
    console.warn = original;
  }
});

Deno.test("fetchCrisisResources — an empty table degrades onto the registry", async () => {
  const result = await fetchCrisisResources(fakeDb({ rows: [] }), "GB", "suicide");
  assertEquals(result.resources[0].contact, "116 123");
});

// ---------------------------------------------------------------------------
// W4.2 — country wins over locale (closes the W3.3 "inert resolver" defect)
// ---------------------------------------------------------------------------

Deno.test("crisisCountryForProfile — profiles.country wins over locale", () => {
  // THE defect, in one assertion: an American student whose locale is still the
  // fleet default 'fr-FR' must NOT be handed 3114.
  const resolution = crisisCountryForProfile({ country: "US", locale: "fr-FR" });
  assertEquals(resolution.country, "US");
  assertEquals(resolution.source, "profile_country");

  const numbers = resolveSafetyResourceNumbersForProfile({
    country: "US",
    locale: "fr-FR",
  });
  assertEquals(numbers.suicide_prevention_number, "988");
  assertEquals(numbers.emergency_numbers, "911");
  assertEquals(numbers.fallback_used, false);
  assertEquals(numbers.countrySource, "profile_country");
});

Deno.test("crisisCountryForProfile — locale is the fallback, not the default", () => {
  assertEquals(crisisCountryForProfile({ country: null, locale: "en-GB" }), {
    country: "GB",
    source: "locale",
  });
  assertEquals(crisisCountryForProfile({ locale: "fr-FR" }), {
    country: "FR",
    source: "locale",
  });
});

Deno.test("crisisCountryForProfile — nothing resolvable stays null, never a guess", () => {
  assertEquals(crisisCountryForProfile({ country: null, locale: "en" }), {
    country: null,
    source: "none",
  });
  assertEquals(crisisCountryForProfile(null), { country: null, source: "none" });
  // A malformed country does not poison the resolution: locale still answers.
  assertEquals(crisisCountryForProfile({ country: "usa!", locale: "en-GB" }), {
    country: "GB",
    source: "locale",
  });
});

Deno.test("crisisCountryForProfile — an unseeded country lands on the LOUD fallback", () => {
  // country='DE' is honoured (it is not overridden by a French locale) and the
  // absence of a German seed produces the documented international set with a
  // warning -- never a neighbouring country's number.
  assertEquals(crisisCountryForProfile({ country: "DE", locale: "fr-FR" }).country, "DE");
  const { result, warnings } = captureWarnings(() =>
    resolveSafetyResourceNumbersForProfile({ country: "DE", locale: "fr-FR" })
  );
  assertEquals(result.fallback_used, true);
  assertEquals(result.country, INTERNATIONAL_FALLBACK_COUNTRY);
  assertEquals(
    warnings.some((w) => w.includes("keel.crisis_resources.fallback_used")),
    true,
  );
});

Deno.test("crisisCountryForProfile — 'UK' alias resolves, aliases are input-only", () => {
  assertEquals(crisisCountryForProfile({ country: "uk" }).country, "GB");
});
