/**
 * KEEL W3.3 — crisis resources resolved BY COUNTRY, with a loud fallback.
 *
 * Authority: docs/keel/CONTRACT.md (R1, R7), docs/keel/BUILD_PLAN.md W3.3.
 * Database source of truth: supabase/migrations/20260727170000_keel_crisis_resources.sql
 *
 * WHY A COMPILED-IN MIRROR OF A DATABASE TABLE
 * The three call sites that consume this module are the DETERMINISTIC crisis
 * paths: the reducer's `safety_resources`, the visible agent's anti-empty
 * fallback message, and sentry's fallback answer. Those paths exist precisely
 * because something upstream failed (the LLM, the network, the runtime). Making
 * them `await` a database round-trip would put the failure mode inside the
 * failure handler. So the registry below is compiled in, and
 * `crisisResourceRegistryRows()` is compared against the migration seed by
 * crisis_resources_test.ts — drift fails the test suite, not a student's turn.
 * `fetchCrisisResources()` is the async, DB-backed variant for surfaces that
 * can afford I/O (coach screens, render layer); it degrades onto the same
 * registry, loudly.
 *
 * R7 — FAIL LOUDLY, NEVER SILENTLY
 *   - unknown `kind`            -> throws (it is a code token, not user data)
 *   - unknown / missing country -> console.warn with a stable event name AND a
 *                                  `fallbackUsed: true` field on the result,
 *                                  degrading onto the documented international
 *                                  set (country 'ZZ'). Never empty, never a
 *                                  neighbouring country's number, never silent.
 * A crisis path must not throw on an unknown country: an exception here would
 * produce the silent safety turn that `safetyCrisisDeterministicVisibleMessage`
 * exists to prevent. "Loud" therefore means logged + flagged + documented, not
 * "throws". The distinction is deliberate and is the reason this module does
 * not simply reuse the `makeParser` throw-everything helper from tokens.ts.
 */

// ---------------------------------------------------------------------------
// Vocabularies (R1: ASCII snake_case tokens, never translated)
// ---------------------------------------------------------------------------

export const CRISIS_RESOURCE_KINDS = [
  "suicide",
  "emergency",
  "eating_disorder",
  "poison",
  "domestic_violence",
] as const;

export type CrisisResourceKind = typeof CRISIS_RESOURCE_KINDS[number];

const CRISIS_RESOURCE_KIND_SET: ReadonlySet<string> = new Set(
  CRISIS_RESOURCE_KINDS,
);

/**
 * R7: a `kind` is a token emitted by our own code. An unknown one is a bug at
 * the call site, so it throws — same discipline as tokens.ts.
 */
export function parseCrisisResourceKind(value: unknown): CrisisResourceKind {
  const normalized = String(value ?? "").trim().toLowerCase().replace(
    /[\s-]+/g,
    "_",
  );
  if (CRISIS_RESOURCE_KIND_SET.has(normalized)) {
    return normalized as CrisisResourceKind;
  }
  throw new Error(
    `[keel/crisis_resources] Unknown crisis resource kind: ${
      JSON.stringify(value)
    }. Expected one of: ${CRISIS_RESOURCE_KINDS.join(", ")}`,
  );
}

/** ISO 3166-1 alpha-2 codes seeded today. */
export const CRISIS_RESOURCE_COUNTRIES = ["US", "GB", "FR"] as const;

/**
 * ISO 3166-1 user-assigned code reserved for the documented international
 * fallback set. Not a country: a declared degradation target.
 */
export const INTERNATIONAL_FALLBACK_COUNTRY = "ZZ";

/**
 * Input aliases tolerated on the way in, never stored (same rule as tokens.ts:
 * aliases are an input courtesy, the canonical value is what circulates).
 * 'UK' is what humans and the BUILD_PLAN write; 'GB' is what ISO says.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  UK: "GB",
  UAE: "AE",
  USA: "US",
};

/**
 * ── PIERRE TOMBALE — `LEGACY_FRENCH_BRANCH_COUNTRY = "FR"`, RETIRÉ LE
 *    2026-08-12 (T-20) ───────────────────────────────────────────────────────
 *
 * C'était le « défaut DÉCLARÉ de la branche française », lu par deux call sites
 * (`safety_crisis/reducer.ts`, `agents/sentry.ts`) quand ils n'avaient ni pays
 * ni locale. Son en-tête se justifiait ainsi : « `profiles` a `locale`, pas
 * `country` ». Cette phrase est fausse depuis la migration 20260727190000, et
 * c'est tout ce qui restait pour tenir le défaut en place.
 *
 * Ce qu'il produisait, mesuré (RAPPORT-FF-020 §C.2) : un tour de crise chez
 * quelqu'un dont le produit ne sait RIEN servait « 15 ou 112 · 3114 ». Un
 * défaut déclaré reste un défaut : la personne, elle, lit un numéro affirmé.
 *
 * ⚠️ NE PAS LE RECRÉER, sous aucun nom. La question qu'il prétendait résoudre
 * (« quel pays pour un élève sans pays ? ») n'a pas de réponse dans le code :
 * elle se répond en CAPTANT `profiles.country` à l'inscription élève —
 * `handle_new_user()` ne l'insère jamais. Tant qu'elle est vide, la seule
 * réponse honnête est `INTERNATIONAL_FALLBACK_COUNTRY`, et
 * `crisisCountryForProfile` la rend.
 */

export type CrisisResource = {
  country: string;
  kind: CrisisResourceKind;
  label: string;
  contact: string;
  url: string | null;
  contentLocale: string;
  priority: number;
};

export type CrisisResourceResolutionSource =
  | "country"
  | "international_fallback_country_missing"
  | "international_fallback_country_unsupported"
  | "international_fallback_kind_missing";

export type CrisisResourceResolution = {
  kind: CrisisResourceKind;
  /** What the caller asked for, verbatim-ish (normalized case only). */
  requestedCountry: string | null;
  /** What was actually served: a seeded country, or 'ZZ'. */
  country: string;
  resolutionSource: CrisisResourceResolutionSource;
  fallbackUsed: boolean;
  /** Never empty. Ordered by `priority` ascending. */
  resources: CrisisResource[];
};

// ---------------------------------------------------------------------------
// Registry — mirror of the migration seed (drift-tested)
// ---------------------------------------------------------------------------

const REGISTRY: readonly CrisisResource[] = [
  // United States
  r("US", "suicide", "988 Suicide and Crisis Lifeline (call or text 988)", "988", "https://988lifeline.org", 10),
  r("US", "emergency", "Emergency services", "911", null, 10),
  r("US", "eating_disorder", "NEDA (National Eating Disorders Association) helpline", "https://www.nationaleatingdisorders.org/help-support/contact-helpline", "https://www.nationaleatingdisorders.org", 10),
  r("US", "eating_disorder", "National Alliance for Eating Disorders helpline", "1-866-662-1235", "https://www.allianceforeatingdisorders.com", 20),
  r("US", "poison", "Poison Help line", "1-800-222-1222", "https://www.poisonhelp.org", 10),
  r("US", "domestic_violence", "National Domestic Violence Hotline", "1-800-799-7233", "https://www.thehotline.org", 10),

  // United Kingdom
  r("GB", "suicide", "Samaritans (free, 24/7)", "116 123", "https://www.samaritans.org", 10),
  r("GB", "emergency", "Emergency services", "999", null, 10),
  r("GB", "emergency", "European emergency number", "112", null, 20),
  r("GB", "eating_disorder", "Beat eating disorders helpline (England)", "0808 801 0677", "https://www.beateatingdisorders.org.uk", 10),
  r("GB", "poison", "Emergency services (poisoning)", "999", null, 10),
  r("GB", "domestic_violence", "National Domestic Abuse Helpline", "0808 2000 247", "https://www.nationaldahelpline.org.uk", 10),

  // France
  r("FR", "suicide", "National suicide prevention line (3114)", "3114", "https://3114.fr", 10),
  r("FR", "emergency", "Emergency medical services (SAMU)", "15", null, 10),
  r("FR", "emergency", "European emergency number", "112", null, 20),
  r("FR", "eating_disorder", "FFAB eating disorder helpline (Anorexie Boulimie Info Ecoute)", "09 69 325 900", "https://www.ffab.fr", 10),
  r("FR", "poison", "Emergency medical services (SAMU), poisoning", "15", null, 10),
  r("FR", "domestic_violence", "Violences Femmes Info", "3919", "https://arretonslesviolences.gouv.fr", 10),

  // ZZ — international fallback, every kind covered (see R7 note at the top)
  r("ZZ", "suicide", "Find a helpline in your country", "https://findahelpline.com", "https://findahelpline.com", 10),
  r("ZZ", "emergency", "International emergency number (routes to local services on most networks)", "112", null, 10),
  r("ZZ", "eating_disorder", "Find a helpline in your country", "https://findahelpline.com", "https://findahelpline.com", 10),
  r("ZZ", "poison", "International emergency number (routes to local services on most networks)", "112", null, 10),
  r("ZZ", "domestic_violence", "Find a helpline in your country", "https://findahelpline.com", "https://findahelpline.com", 10),
];

function r(
  country: string,
  kind: CrisisResourceKind,
  label: string,
  contact: string,
  url: string | null,
  priority: number,
): CrisisResource {
  return { country, kind, label, contact, url, contentLocale: "en", priority };
}

/** Flat copy of the compiled-in registry (used by the drift test). */
export function crisisResourceRegistryRows(): CrisisResource[] {
  return REGISTRY.map((row) => ({ ...row }));
}

function rowsFor(country: string, kind: CrisisResourceKind): CrisisResource[] {
  return REGISTRY
    .filter((row) => row.country === country && row.kind === kind)
    .sort((a, b) => a.priority - b.priority)
    .map((row) => ({ ...row }));
}

// ---------------------------------------------------------------------------
// Country normalization
// ---------------------------------------------------------------------------

/** Uppercase + alias resolution. Returns null for anything unusable. */
export function normalizeCrisisCountry(
  value: unknown,
): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  const aliased = COUNTRY_ALIASES[raw] ?? raw;
  return /^[A-Z]{2}$/.test(aliased) ? aliased : null;
}

/**
 * Derive a country from a BCP-47 locale.
 *
 * Region subtag wins ('en-GB' -> 'GB'). A bare language is only mapped when
 * exactly one seeded country speaks it as its national default ('fr' -> 'FR');
 * 'en' is deliberately NOT mapped, because guessing US or GB from it is exactly
 * the class of silent guess R7 forbids — it returns null and the caller lands
 * on the loud fallback.
 *
 * SINCE W4.2 THIS IS THE SECOND CHOICE, NOT THE FIRST. `profiles.country`
 * exists (migration 20260727190000) and `crisisCountryForProfile()` below reads
 * it first. Locale remains the fallback for the rows that have no country yet.
 */
export function crisisCountryFromLocale(
  locale: string | null | undefined,
): string | null {
  const raw = String(locale ?? "").trim();
  if (!raw) return null;
  const parts = raw.replace(/_/g, "-").split("-");
  for (const part of parts.slice(1)) {
    const candidate = normalizeCrisisCountry(part);
    if (candidate && CRISIS_RESOURCE_COUNTRIES.includes(candidate as never)) {
      return candidate;
    }
  }
  const language = parts[0].toLowerCase();
  // Closed list: one entry, and it is here because the whole legacy branch of
  // this product is written in French for French users.
  if (language === "fr") return "FR";
  return null;
}

export type CrisisCountrySource = "profile_country" | "none";

export type CrisisCountryResolution = {
  country: string | null;
  source: CrisisCountrySource;
};

/**
 * KEEL W4.2 — resolve a student's country for the crisis path. THE ONE RULE:
 * `profiles.country`, or nothing.
 *
 * THE DEFECT THIS CLOSES (EXECUTION_LOG W3.3, "reste inerte en production")
 * `crisis_resources` shipped with 23 seeded rows and a correct resolver, but
 * the only signal reaching it was `profiles.locale`, which is
 * `not null default 'fr-FR'` for the whole fleet. Every user therefore resolved
 * to FR: an American student in crisis was handed 3114, a French number that
 * does not connect from the United States. `profiles.country` (migration
 * 20260727190000) is the column that makes the resolver real, and this function
 * is the ordering rule.
 *
 * ── T-20, 2026-08-12 — LE REPLI PAR LA LOCALE EST RETIRÉ ────────────────────
 * W4.2 avait posé `country` D'ABORD et laissé la locale en second choix, « pour
 * les lignes qui n'ont pas encore de pays ». Mesuré depuis (RAPPORT-FF-020
 * §C.2, 34 élèves à l'époque, 208 lignes `country IS NULL` en local le
 * 2026-08-12 dont 204 en locale `fr%`) : ce second choix N'EST PAS un repli,
 * c'est LE chemin nominal de la flotte — et il rend la France.
 *
 * La raison est arithmétique, pas doctrinale : `profiles.locale` est
 * `not null default 'fr-FR'`. Une colonne à valeur par défaut ne porte aucune
 * information sur la personne ; la lire comme un signal déclaré, c'est habiller
 * une DEVINETTE en donnée. Et la devinette tombe toujours du même côté, parce
 * que le défaut est le même pour tout le monde. Le sous-segment région d'un
 * `fr-FR` par défaut n'est pas plus un lieu de vie que le `en-US` que
 * `JoinPage` écrivait en dur (cicatrice `student-country-null-crisis-misrouting`,
 * qui décrivait l'AUTRE face de la même pièce : là c'était 'US' qui sortait).
 *
 * FF-020 §7 et §8 disent l'inverse du code depuis W4.2 :
 *   « Pays absent du profil ⇒ jeu `ZZ`, warn, `fallbackUsed: true` »
 *   « Étant donné un élève sans pays connu … Alors il rend le jeu international »
 * C'est la fiche qui a raison, et c'est un arbitrage de SÉCURITÉ : le jeu `ZZ`
 * (112 + findahelpline) est une réponse DÉGRADÉE ET DÉCLARÉE ; « 15 ou 112 ·
 * 3114 » servi à quelqu'un dont on ignore le pays est une réponse FAUSSE ET
 * AFFIRMÉE. Entre les deux, c'est la seconde qui consomme la seule tentative
 * que la personne fera peut-être (R2).
 *
 * ⚠️ CE QUE ÇA COÛTE, ET IL FAUT LE DIRE : un élève réellement français sans
 * `country` renseigné perd le 3114 et lit le jeu international. La réparation
 * n'est pas de rouvrir ce repli — c'est de CAPTER `country` à l'inscription
 * élève (`handle_new_user()` ne l'insère jamais). Tant que la colonne est vide,
 * le produit ne SAIT pas où vit cette personne, et la seule phrase honnête est
 * celle du jeu `ZZ`.
 *
 * WHY COUNTRY WINS, ALWAYS
 * Locale is a language preference; country is a place. A Brit living in Paris
 * reading the app in English, a fr-FR speaker in Montreal, an American who
 * never changed the default: for all three, locale is a worse answer than a
 * declared country, and the answer here is a phone number that either connects
 * or does not.
 *
 * WHY LOCALE IS STILL A PARAMETER
 * Not to decide — to be AUDITABLE. When a crisis answer is reviewed later,
 * "what would the old rule have served, and did it differ" is the first
 * question, and the log line is the only place it can be answered. `debug` and
 * never `warn`: the genuinely degraded case already warns
 * (`keel.crisis_resources.fallback_used`), and drowning it is how a real signal
 * stops being read.
 */
export function crisisCountryForProfile(
  profile: {
    country?: string | null;
    locale?: string | null;
  } | null | undefined,
): CrisisCountryResolution {
  const fromCountry = normalizeCrisisCountry(profile?.country);
  const fromLocale = crisisCountryFromLocale(profile?.locale);

  if (fromCountry) {
    if (fromLocale && fromLocale !== fromCountry) {
      console.debug("keel.crisis_resources.country_locale_divergence", {
        served_country: fromCountry,
        locale_would_have_served: fromLocale,
        detail:
          "profiles.country wins over locale. Normal for a user whose language " +
          "is not their location; logged so a crisis answer stays auditable.",
      });
    }
    return { country: fromCountry, source: "profile_country" };
  }

  if (fromLocale) {
    console.debug("keel.crisis_resources.locale_country_not_used", {
      locale_would_have_served: fromLocale,
      served_country: INTERNATIONAL_FALLBACK_COUNTRY,
      detail:
        "T-20: profiles.country is empty and the locale no longer decides a " +
        "place. profiles.locale is `not null default 'fr-FR'`, so this value " +
        "may be a column default rather than a declared signal. Serving the " +
        "international set; capture profiles.country to fix it properly.",
    });
  }
  // Null, not a guess. `resolveCrisisResources` turns it into the loud
  // documented international fallback.
  return { country: null, source: "none" };
}

/**
 * The two strings the safety surfaces interpolate, resolved from a profile
 * rather than from a bare country. Thin wrapper: it exists so a call site can
 * hand over `{ country, locale }` without having to re-derive the precedence
 * rule (and get it wrong in one of the three places).
 */
export function resolveSafetyResourceNumbersForProfile(
  profile: { country?: string | null; locale?: string | null } | null | undefined,
  options: { conjunction?: string } = {},
): SafetyResourceNumbers & { countrySource: CrisisCountrySource } {
  const resolution = crisisCountryForProfile(profile);
  return {
    ...resolveSafetyResourceNumbers(resolution.country, options),
    countrySource: resolution.source,
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function fallback(
  kind: CrisisResourceKind,
  requestedCountry: string | null,
  resolutionSource: CrisisResourceResolutionSource,
): CrisisResourceResolution {
  const resources = rowsFor(INTERNATIONAL_FALLBACK_COUNTRY, kind);
  if (resources.length === 0) {
    // Invariant of the registry, not a runtime condition: 'ZZ' covers every
    // kind. If it ever does not, the crisis path would return nothing, which
    // is worse than throwing at boot of the call.
    throw new Error(
      `[keel/crisis_resources] International fallback set has no '${kind}' row. ` +
        "The 'ZZ' registry must cover every CRISIS_RESOURCE_KINDS value.",
    );
  }
  console.warn("keel.crisis_resources.fallback_used", {
    kind,
    requested_country: requestedCountry,
    served_country: INTERNATIONAL_FALLBACK_COUNTRY,
    resolution_source: resolutionSource,
    supported_countries: CRISIS_RESOURCE_COUNTRIES.join(","),
    detail:
      "Country could not be resolved to a seeded crisis-resource set; serving " +
      "the documented international fallback. This is a degraded safety " +
      "answer: seed the country or thread the student's country to fix it.",
  });
  return {
    kind,
    requestedCountry,
    country: INTERNATIONAL_FALLBACK_COUNTRY,
    resolutionSource,
    fallbackUsed: true,
    resources,
  };
}

/**
 * Resolve the crisis resources of one `kind` for one country.
 *
 * Never returns an empty list. Never guesses a country. Logs
 * `keel.crisis_resources.fallback_used` whenever the answer is degraded.
 */
export function resolveCrisisResources(
  country: string | null | undefined,
  kind: CrisisResourceKind | string,
): CrisisResourceResolution {
  const parsedKind = parseCrisisResourceKind(kind);
  const normalized = normalizeCrisisCountry(country);
  if (!normalized) {
    return fallback(
      parsedKind,
      country == null ? null : String(country),
      "international_fallback_country_missing",
    );
  }
  if (!CRISIS_RESOURCE_COUNTRIES.includes(normalized as never)) {
    return fallback(
      parsedKind,
      normalized,
      "international_fallback_country_unsupported",
    );
  }
  const resources = rowsFor(normalized, parsedKind);
  if (resources.length === 0) {
    return fallback(
      parsedKind,
      normalized,
      "international_fallback_kind_missing",
    );
  }
  return {
    kind: parsedKind,
    requestedCountry: normalized,
    country: normalized,
    resolutionSource: "country",
    fallbackUsed: false,
    resources,
  };
}

/**
 * Compose the contacts of a resolution into one interpolatable string
 * ("15 or 112"). `conjunction` is passed by the caller because the sentence
 * around it is the caller's language, not this module's (R3: the render layer
 * owns content; this module owns tokens and contacts).
 */
export function formatCrisisContacts(
  resolution: CrisisResourceResolution,
  conjunction = "or",
): string {
  const contacts = resolution.resources.map((row) => row.contact);
  if (contacts.length <= 1) return contacts[0] ?? "";
  const last = contacts[contacts.length - 1];
  const head = contacts.slice(0, -1);
  return `${head.join(", ")} ${conjunction} ${last}`;
}

export type SafetyResourceNumbers = {
  emergency_numbers: string;
  suicide_prevention_number: string;
  country: string;
  fallback_used: boolean;
};

/**
 * The two strings the legacy safety_crisis surfaces interpolate. Kept as one
 * function so the three call sites cannot drift apart again — the reason this
 * whole module exists.
 */
export function resolveSafetyResourceNumbers(
  country: string | null | undefined,
  options: { conjunction?: string } = {},
): SafetyResourceNumbers {
  const conjunction = options.conjunction ?? "or";
  const emergency = resolveCrisisResources(country, "emergency");
  const suicide = resolveCrisisResources(country, "suicide");
  return {
    emergency_numbers: formatCrisisContacts(emergency, conjunction),
    suicide_prevention_number: formatCrisisContacts(suicide, conjunction),
    country: emergency.country,
    fallback_used: emergency.fallbackUsed || suicide.fallbackUsed,
  };
}

// ---------------------------------------------------------------------------
// Database-backed variant (for surfaces that can afford I/O)
// ---------------------------------------------------------------------------

type CrisisResourcesDbRow = {
  country: string;
  kind: string;
  label: string;
  contact: string;
  url: string | null;
  content_locale: string;
  priority: number;
};

/** Structural type: tests inject a fake, production injects a SupabaseClient. */
export type CrisisResourcesDb = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          order(column: string, options: { ascending: boolean }): PromiseLike<
            { data: CrisisResourcesDbRow[] | null; error: unknown }
          >;
        };
      };
    };
  };
};

/**
 * Read the table. Any error, or an empty result, degrades onto
 * `resolveCrisisResources` — loudly, with the DB failure named in the log. A
 * crisis surface never shows nothing because a query failed.
 */
export async function fetchCrisisResources(
  db: CrisisResourcesDb,
  country: string | null | undefined,
  kind: CrisisResourceKind | string,
): Promise<CrisisResourceResolution> {
  const parsedKind = parseCrisisResourceKind(kind);
  const normalized = normalizeCrisisCountry(country);
  if (!normalized) return resolveCrisisResources(country, parsedKind);
  try {
    const { data, error } = await db
      .from("crisis_resources")
      .select("country, kind, label, contact, url, content_locale, priority")
      .eq("country", normalized)
      .eq("kind", parsedKind)
      .order("priority", { ascending: true });
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return resolveCrisisResources(normalized, parsedKind);
    return {
      kind: parsedKind,
      requestedCountry: normalized,
      country: normalized,
      resolutionSource: "country",
      fallbackUsed: false,
      resources: rows.map((row) => ({
        country: row.country,
        kind: parseCrisisResourceKind(row.kind),
        label: row.label,
        contact: row.contact,
        url: row.url,
        contentLocale: row.content_locale,
        priority: row.priority,
      })),
    };
  } catch (error) {
    console.warn("keel.crisis_resources.db_read_failed", {
      country: normalized,
      kind: parsedKind,
      error: error instanceof Error ? error.message : String(error),
      detail: "Falling back to the compiled-in registry.",
    });
    return resolveCrisisResources(normalized, parsedKind);
  }
}
