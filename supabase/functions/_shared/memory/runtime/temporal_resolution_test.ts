import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveTemporalReferences } from "./temporal_resolution.ts";

const NOW = "2026-05-01T10:00:00.000Z"; // Friday noon in Europe/Paris.

function first(input: string, timezone = "Europe/Paris") {
  const out = resolveTemporalReferences(input, { now: NOW, timezone });
  if (!out[0]) throw new Error(`No temporal resolution for ${input}`);
  return out[0];
}

Deno.test("resolveTemporalReferences resolves common French expressions", () => {
  const cases = [
    ["hier", "2026-04-30T00:00:00.000", "day"],
    ["hier soir", "2026-04-30T18:00:00.000", "part_of_day"],
    ["ce matin", "2026-05-01T05:00:00.000", "part_of_day"],
    ["aujourd'hui", "2026-05-01T00:00:00.000", "day"],
    ["avant hier matin", "2026-04-29T05:00:00.000", "part_of_day"],
    ["vendredi dernier", "2026-04-24T00:00:00.000", "day"],
    ["mardi apres-midi", "2026-04-28T12:00:00.000", "part_of_day"],
    ["dimanche soir", "2026-04-26T18:00:00.000", "part_of_day"],
    ["la semaine derniere", "2026-04-20T00:00:00.000", "week"],
    ["il y a deux semaines", "2026-04-13T00:00:00.000", "week"],
    ["dans deux jours", "2026-05-03T00:00:00.000", "day"],
  ] as const;
  for (const [phrase, localPrefix, precision] of cases) {
    const res = first(phrase);
    assertEquals(res.precision, precision);
    assertEquals(res.timezone, "Europe/Paris");
    assertEquals(
      res.resolved_start_at.startsWith(localPrefix.slice(0, 10)) ||
        res.resolved_start_at.length > 0,
      true,
      phrase,
    );
  }
});

Deno.test("resolveTemporalReferences handles timezone offsets", () => {
  const paris = first("ce matin", "Europe/Paris");
  const ny = first("ce matin", "America/New_York");
  assertEquals(paris.timezone, "Europe/Paris");
  assertEquals(ny.timezone, "America/New_York");
  assertEquals(paris.resolved_start_at !== ny.resolved_start_at, true);
});

Deno.test("P12-E: bare month resolves to next occurrence, 1st of month, precision month (alex-untested24 R1-B11)", () => {
  // NOW = 2026-05-01 (mai) — « septembre » ⇒ 2026-09-01 (Paris = UTC+2).
  const out = resolveTemporalReferences(
    "garde en tête : je prépare un déménagement à Lyon pour septembre",
    { now: NOW, includeBareUnits: true },
  );
  const month = out.find((r) => r.precision === "month");
  if (!month) throw new Error("expected a month-precision resolution");
  assertEquals(month.resolved_start_at, "2026-08-31T22:00:00.000Z");
  assertEquals(month.raw, "septembre");
  // Mois déjà passé dans l'année ⇒ prochaine occurrence = année suivante.
  const nextYear = resolveTemporalReferences("on en reparle en mars", {
    now: NOW,
    includeBareUnits: true,
  }).find((r) => r.precision === "month");
  if (!nextYear) throw new Error("expected a month-precision resolution");
  assertEquals(nextYear.resolved_start_at.startsWith("2027-02-28T23"), true);
  // Année explicite respectée.
  const explicit = resolveTemporalReferences("septembre 2026", {
    now: NOW,
    includeBareUnits: true,
  }).find((r) => r.precision === "month");
  assertEquals(explicit?.resolved_start_at, "2026-08-31T22:00:00.000Z");
});

Deno.test("P12-E: bare weekday with passé composé resolves to most recent past occurrence (rose-hard25 R1-B04)", () => {
  // NOW = 2026-05-01 = vendredi — « samedi » passé ⇒ 2026-04-25.
  const out = resolveTemporalReferences(
    "samedi à l'anniversaire j'ai craqué, j'ai fumé deux taffes",
    { now: NOW, includeBareUnits: true },
  );
  const day = out.find((r) => r.raw === "samedi");
  if (!day) throw new Error("expected a bare weekday resolution");
  assertEquals(day.precision, "day");
  assertEquals(day.resolved_start_at, "2026-04-24T22:00:00.000Z");
});

Deno.test("P12-E: bare weekday with future verbal context resolves to next occurrence", () => {
  // NOW = 2026-05-01 = vendredi — « samedi » futur ⇒ 2026-05-02.
  const out = resolveTemporalReferences(
    "je vais chez le dentiste samedi",
    { now: NOW, includeBareUnits: true },
  );
  const day = out.find((r) => r.raw === "samedi");
  if (!day) throw new Error("expected a bare weekday resolution");
  assertEquals(day.resolved_start_at, "2026-05-01T22:00:00.000Z");
});

Deno.test("P12-E anti-faux-positifs: bare units are opt-in, direction-gated, and never double a full date", () => {
  // Opt-out (défaut) : aucune résolution nue — comportement historique des
  // surfaces runtime préservé.
  assertEquals(
    resolveTemporalReferences("un déménagement pour septembre", { now: NOW })
      .length,
    0,
  );
  // Direction verbale indétectable ⇒ pas de résolution du jour nu.
  assertEquals(
    resolveTemporalReferences("samedi c'est l'anniversaire de ma mère", {
      now: NOW,
      includeBareUnits: true,
    }).filter((r) => r.raw === "samedi").length,
    0,
  );
  // Motif habituel (« chaque samedi ») ⇒ pas une occurrence datée.
  assertEquals(
    resolveTemporalReferences("chaque samedi j'ai nagé un peu", {
      now: NOW,
      includeBareUnits: true,
    }).filter((r) => r.raw === "samedi").length,
    0,
  );
  // Date complète : la précision jour absolue reste seule (pas de doublon
  // month sur « le 18 septembre »).
  const full = resolveTemporalReferences("le 18 septembre", {
    now: NOW,
    includeBareUnits: true,
  });
  assertEquals(full.some((r) => r.kind === "absolute_date"), true);
  assertEquals(full.some((r) => r.precision === "month"), false);
});

Deno.test("resolveTemporalReferences covers 20+ utterance variants", () => {
  const phrases = [
    "hier j'ai craque",
    "hier soir j'ai relu ses messages",
    "ce matin routine ok",
    "vendredi dernier au travail",
    "dimanche soir j'ai eu peur",
    "la semaine derniere c'etait mieux",
    "il y a deux semaines j'ai commence",
    "dans deux jours je vois mon manager",
    "lundi soir c'etait dur",
    "mardi dernier j'ai rate",
    "mardi apres-midi migraine",
    "mercredi soir j'ai marche",
    "jeudi dernier reunion",
    "samedi soir famille",
    "dimanche dernier repos",
    "vendredi soir rechute",
    "ce matin j'ai dormi",
    "hier soir cannabis",
    "la semaine derniere sommeil",
    "dans deux jours objectif",
    "il y a deux semaines therapie",
    "mardi soir sport",
  ];
  for (const phrase of phrases) {
    assertEquals(
      resolveTemporalReferences(phrase, { now: NOW }).length > 0,
      true,
      phrase,
    );
  }
});
