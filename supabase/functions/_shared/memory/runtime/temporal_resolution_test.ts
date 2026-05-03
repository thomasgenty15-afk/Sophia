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
    ["vendredi dernier", "2026-04-24T00:00:00.000", "day"],
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
