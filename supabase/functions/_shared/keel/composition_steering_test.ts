// FF-041 — LE PILOTAGE DE COMPOSITION. Ce que ces tests protègent, dans l'ordre
// de ce qui coûte le plus cher quand ça casse:
//
//   * LE HASH DU BLOC CHAT — s'il bouge, toute la base se refragmente pour une
//     donnée qu'aucun tour de conversation ne lit;
//   * A1 — un `deficit_style: "aggressive"` qui compilerait, c'est un moteur qui
//     EXÉCUTE de la restriction rapide, précisément le produit que le plancher
//     TCA existe pour ne pas être;
//   * LE REROUTAGE SOUS FLAG — le flag écrête, il ne choisit pas la grandeur de
//     remplacement d'un coach qui ne l'a pas demandée;
//   * LE REPLI SILENCIEUX — un coach qui croit que sa méthode gouverne alors
//     qu'elle n'a pas été lue.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  applyPiloting,
  CARB_TIMING_GOAL,
  offAxesFor,
  parseCompositionSteering,
  type SteeringEntry,
  steeredFocus,
  STEERING_AXES,
  steeringFor,
  UNEXTINGUISHABLE_AXIS,
} from "./composition_steering.ts";
import {
  type Envelope,
  envelopeFingerprint,
  envelopeFor,
} from "./meal_envelope.ts";
import {
  compileAllDoctrineVariants,
  compileDoctrineBlock,
  doctrineCacheFootprint,
  parseCoachDoctrine,
} from "./doctrine.ts";
import { focusFor } from "./week_plan_generation.ts";
import type { MealBodyContext } from "./meal_body.ts";
import { GOAL_TOKENS } from "./tokens.ts";

function entry(over: Partial<SteeringEntry> = {}): SteeringEntry {
  return {
    goal_scope: null,
    priorities: [],
    off: [],
    belief_key: null,
    proportions: null,
    protein_range: "standard",
    surplus_style: "standard",
    deficit_style: "standard",
    maintenance_weeks: "auto",
    recalibration: "observed_trend",
    carb_timing: "off",
    ...over,
  };
}

function body(over: Partial<MealBodyContext> = {}): MealBodyContext {
  return {
    heightCm: 175,
    ageBand: "30_44",
    gender: "male",
    latestWeight: { weekStart: "2026-08-03", value: 80 },
    latestWaist: null,
    restrictionFlag: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// A1 — LE TOKEN QUI N'EXISTE PAS
// ---------------------------------------------------------------------------

Deno.test("A1: `deficit_style: \"aggressive\"` NE COMPILE PAS", () => {
  // Ce n'est pas un `if` qui rejette: c'est une valeur absente du type. Un `if`
  // se retire un jour « pour un cas particulier »; un type se casse. Si cette
  // ligne se met à compiler, l'arbitrage A1 a été défait.
  // @ts-expect-error — il n'existe pas de déficit agressif dans ce produit.
  const illegal: SteeringEntry = entry({ deficit_style: "aggressive" });
  assert(illegal.deficit_style !== undefined);
  // …et l'ASYMÉTRIE est intacte: `surplus_style`, lui, a bien son "aggressive".
  const legal = entry({ surplus_style: "aggressive" });
  assertEquals(legal.surplus_style, "aggressive");
});

Deno.test("A1: un `aggressive` posé dans le jsonb est lu `standard` ET compté", () => {
  const parsed = parseCompositionSteering([{ deficit_style: "aggressive" }]);
  assertEquals(parsed.entries[0].deficit_style, "standard");
  assert(parsed.issues.some((i) => i.includes("no aggressive deficit")));
});

Deno.test("A1: aucun pilotage ne peut creuser le déficit", () => {
  const b = body({ heightCm: 200, latestWeight: { weekStart: "w", value: 140 } });
  const plain = envelopeFor("fat_loss", b, "30_44", false, null, null, null);
  for (const style of ["gentle", "standard"] as const) {
    const piloted = envelopeFor("fat_loss", b, "30_44", false, entry({ deficit_style: style }), null, null);
    assert(plain.mode === "per_kg" && piloted.mode === "per_kg");
    assert(
      piloted.energy!.low >= plain.energy!.low,
      `${style} ne doit jamais descendre le bas de bande`,
    );
  }
});

// ---------------------------------------------------------------------------
// LA PROTÉINE NE S'ÉTEINT PAS
// ---------------------------------------------------------------------------

Deno.test("`protein` dans `off` fait tomber l'entrée ENTIÈRE, bruyamment", () => {
  // La nettoyer silencieusement (retirer `protein` et garder le reste)
  // publierait une méthode que le coach n'a pas écrite.
  const parsed = parseCompositionSteering([
    { off: [UNEXTINGUISHABLE_AXIS, "energy"], priorities: ["micro_coverage"] },
  ]);
  assertEquals(parsed.entries, []);
  assert(parsed.issues.some((i) => i.includes("cannot be switched off")));
});

Deno.test("les autres axes s'éteignent normalement", () => {
  const parsed = parseCompositionSteering([{ off: ["energy"] }]);
  assertEquals(parsed.entries.length, 1);
  assertEquals(offAxesFor(parsed.entries[0]), ["energy"]);
});

// ---------------------------------------------------------------------------
// LE PARSE — strict et bruyant
// ---------------------------------------------------------------------------

Deno.test("une entrée malformée est ÉCARTÉE et COMPTÉE, le reste vit", () => {
  const parsed = parseCompositionSteering([
    "not an object",
    { goal_scope: "fat_loss", priorities: ["protein"] },
  ]);
  assertEquals(parsed.entries.length, 1);
  assertEquals(parsed.entries[0].goal_scope, "fat_loss");
  assert(parsed.issues.some((i) => i.includes("not an object")));
});

Deno.test("`carb_timing` hors performance est rejeté, compté, et dit", () => {
  const bad = parseCompositionSteering([
    { goal_scope: "fat_loss", carb_timing: "around_sessions" },
  ]);
  assertEquals(bad.entries[0].carb_timing, "off");
  assert(bad.issues.some((i) => i.includes("carb_timing")));

  const good = parseCompositionSteering([
    { goal_scope: CARB_TIMING_GOAL, carb_timing: "around_sessions" },
  ]);
  assertEquals(good.entries[0].carb_timing, "around_sessions");
  assertEquals(good.issues, []);
});

Deno.test("une seule entrée par portée — la seconde tombe", () => {
  const parsed = parseCompositionSteering([
    { goal_scope: "fat_loss", priorities: ["protein"] },
    { goal_scope: "fat_loss", priorities: ["energy"] },
  ]);
  assertEquals(parsed.entries.length, 1);
  assert(parsed.issues.some((i) => i.includes("a second entry")));
});

Deno.test("`proportions` prioritaire sans gabarit est compté", () => {
  const parsed = parseCompositionSteering([{ priorities: ["proportions"] }]);
  assertEquals(parsed.entries[0].proportions, null);
  assert(parsed.issues.some((i) => i.includes("no template")));
});

Deno.test("les axes sont dédupliqués et l'ORDRE est gardé", () => {
  const parsed = parseCompositionSteering([
    { priorities: ["micro_coverage", "protein", "micro_coverage", "nonsense"] },
  ]);
  assertEquals(parsed.entries[0].priorities, ["micro_coverage", "protein"]);
});

Deno.test("la portée PRÉCISE gagne sur la portée globale", () => {
  const entries = parseCompositionSteering([
    { priorities: ["protein"] },
    { goal_scope: "fat_loss", priorities: ["micro_coverage"] },
  ]).entries;
  assertEquals(steeringFor(entries, "fat_loss")?.priorities, ["micro_coverage"]);
  assertEquals(steeringFor(entries, "maintenance")?.priorities, ["protein"]);
});

// ---------------------------------------------------------------------------
// LE FLAG ÉCRÊTE, IL NE REROUTE JAMAIS
// ---------------------------------------------------------------------------

Deno.test("sous flag, un coach qui pilote produit l'enveloppe DÉGRADÉE, à l'identique", () => {
  // Le flag ne choisit pas la grandeur de remplacement d'un coach qui ne l'a
  // pas demandée: il écrête. Et le résultat doit être indiscernable de celui
  // d'un élève au corps inconnu chez un coach muet — sinon le statut de
  // restriction devient lisible.
  const piloting = entry({ priorities: ["energy"], protein_range: "very_high" });
  const flagged = envelopeFor("fat_loss", body({ restrictionFlag: true }), "30_44", true, piloting, null, null);
  const unknownBody = envelopeFor("fat_loss", null, null, false, null, null, null);
  assertEquals(envelopeFingerprint(flagged), envelopeFingerprint(unknownBody));
});

Deno.test("l'indiscernabilité tient pour TOUTES les dynamiques ET tous les pilotages", () => {
  const prints = new Set<string>();
  for (const goal of GOAL_TOKENS) {
    for (const steering of [null, entry({ priorities: ["energy"] }), entry({ off: ["energy"] })]) {
      prints.add(envelopeFingerprint(
        envelopeFor(goal, body({ restrictionFlag: true }), "30_44", true, steering, null, null),
      ));
    }
  }
  assertEquals(prints.size, 1);
});

Deno.test("`applyPiloting` sur une enveloppe per_portion la rend TELLE QUELLE", () => {
  // Reconstruire un objet ici ferait diverger l'empreinte pour la moitié de la
  // population, sans qu'aucun champ n'ait changé.
  const degraded: Envelope = { mode: "per_portion", proteinPortionPerMeal: true };
  const out = applyPiloting(entry({ priorities: ["energy"] }), degraded, true);
  assertEquals(out, degraded);
});

// ---------------------------------------------------------------------------
// `off` RETIRE L'ARBITRE, JAMAIS L'INSTRUMENT
// ---------------------------------------------------------------------------

Deno.test("`off: [energy]` retire la bande, pas le plancher protéique", () => {
  const off = envelopeFor("fat_loss", body(), "30_44", false, entry({ off: ["energy"] }), null, null);
  const on = envelopeFor("fat_loss", body(), "30_44", false, null, null, null);
  assert(off.mode === "per_kg" && on.mode === "per_kg");
  assertEquals(off.energy, null);
  // Les ceintures produit survivent: le plancher protéique est le rang 2 du
  // design, et il n'est pas dans la liste des grandeurs désactivables.
  assertEquals(off.proteinFloorG, on.proteinFloorG);
});

Deno.test("`protein_range` HAUSSE le plancher, jamais ne le baisse", () => {
  const base = envelopeFor("maintenance", body(), "30_44", false, null, null, null);
  const high = envelopeFor("maintenance", body(), "30_44", false, entry({ protein_range: "very_high" }), null, null);
  assert(base.mode === "per_kg" && high.mode === "per_kg");
  assert(high.proteinFloorG > base.proteinFloorG);
});

// ---------------------------------------------------------------------------
// LE HASH DU BLOC CHAT — l'invariant le plus cher
// ---------------------------------------------------------------------------

function doctrineRow(over: Record<string, unknown> = {}) {
  return {
    coach_id: "c1",
    version: 3,
    coach_display_name: "Marc",
    beliefs: [{ claim: "Three meals a day", rationale: "grazing teaches nothing" }],
    forbidden: [{ token: "six_small_meals", reason: "it never ends" }],
    vocabulary: [],
    arbitrations: [],
    foods: {},
    qa: [],
    voice: {},
    content_locale: "en",
    ...over,
  };
}

Deno.test("le bloc chat est IDENTIQUE, octet pour octet, avec et sans pilotage", () => {
  // Le bloc compilé part à CHAQUE tour de conversation. Une entrée de pilotage
  // qui y entrerait refragmenterait le cache de TOUTE la base, pour une donnée
  // qu'aucun tour ne lit. Patron `dailyPractices`.
  const without = parseCoachDoctrine(doctrineRow()).doctrine!;
  const with_ = parseCoachDoctrine(doctrineRow({
    composition_steering: [{ priorities: ["micro_coverage"], off: ["energy"] }],
  })).doctrine!;
  assertEquals(with_.compositionSteering.length, 1, "le pilotage a bien été lu");
  // Les SIX variantes, pas seulement celle sans objectif: une seule qui
  // bougerait refragmenterait le cache d'une cohorte entière.
  for (const goal of [null, ...GOAL_TOKENS] as const) {
    const a = compileDoctrineBlock(without, goal);
    const b = compileDoctrineBlock(with_, goal);
    assertEquals(a.text, b.text, `variante ${goal ?? "toutes"}`);
    assertEquals(a.hash, b.hash, `hash de la variante ${goal ?? "toutes"}`);
  }
  assertEquals(
    doctrineCacheFootprint(without),
    doctrineCacheFootprint(with_),
  );
  assertEquals(
    compileAllDoctrineVariants(without).map((v) => v.compiled.hash),
    compileAllDoctrineVariants(with_).map((v) => v.compiled.hash),
  );
});

Deno.test("une doctrine sans la colonne se lit sans bruit", () => {
  // Toute la base est dans ce cas: `[]` doit être silencieux, pas compté comme
  // une anomalie.
  const parsed = parseCoachDoctrine(doctrineRow());
  assertEquals(parsed.doctrine!.compositionSteering, []);
  assertEquals(parsed.issues.filter((i) => i.includes("composition_steering")), []);
});

// ---------------------------------------------------------------------------
// L'ACCENT — désarmement par ÉGALITÉ DE CHAÎNES
// ---------------------------------------------------------------------------

Deno.test("sans pilotage, l'accent est celui de `focusFor` au CARACTÈRE PRÈS", () => {
  for (const goal of GOAL_TOKENS) {
    const base = focusFor(goal).emphasis;
    assertEquals(steeredFocus(base, null), base, goal);
    // Une entrée vide ne pilote rien non plus.
    assertEquals(steeredFocus(base, entry()), base, goal);
  }
});

Deno.test("un pilotage AJOUTE une phrase, sans effacer celle du produit", () => {
  const base = focusFor("fat_loss").emphasis;
  const steered = steeredFocus(base, entry({ priorities: ["micro_coverage"] }));
  assert(steered.startsWith(base), "l'accent du produit doit survivre en tête");
  assert(steered.length > base.length);
});

Deno.test("un axe sans accent (energy) laisse la consigne intacte", () => {
  // La direction d'énergie s'exprime dans les JETONS de correction, jamais dans
  // un accent permanent: un accent d'énergie est l'endroit exact où le registre
  // du régime rentrerait.
  const base = focusFor("fat_loss").emphasis;
  assertEquals(steeredFocus(base, entry({ priorities: ["energy"] })), base);
});

Deno.test("le vocabulaire des axes est fermé et non vide", () => {
  assert(STEERING_AXES.length === 7);
  assert((STEERING_AXES as readonly string[]).includes(UNEXTINGUISHABLE_AXIS));
});
