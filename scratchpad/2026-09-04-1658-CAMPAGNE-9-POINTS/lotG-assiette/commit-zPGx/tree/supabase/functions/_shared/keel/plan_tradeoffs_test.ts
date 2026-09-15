import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  explainPlanTradeoffs,
  MAX_NAMED_AWAY_MOUTHS,
  type PlanTradeoffFacts,
  TRADEOFF_FAMILIES,
} from "./plan_tradeoffs.ts";
import { SEPARATE_DISH_MIN_WEEKLY_MINUTES } from "./household_portions.ts";

// ---------------------------------------------------------------------------
// LES DEUX POPULATIONS — c'est le squelette de tout ce fichier
// ---------------------------------------------------------------------------
//
// ⚠️ Cicatrice du dépôt: « un paramètre de garde optionnel est une garde
// désarmée », et sa jumelle « une garde a besoin d'un cas qui passe ». Chaque
// famille est donc exercée DEUX fois: prémisse ARMÉE (la phrase sort) et
// prémisse VIDE (elle ne sort pas). Une famille testée d'un seul côté est
// indiscernable d'une famille câblée en dur.

/**
 * LE FOYER LE PLUS ANODIN QU'ON PUISSE ÉCRIRE: deux bouches, personne
 * d'absent, tout le monde a dit ce qu'il lui faut, aucune forme demandée,
 * aucun plafond, la lane dimensionne au poids.
 *
 * ⛔ IL NE DOIT PRODUIRE AUCUNE LIGNE. C'est le seuil du lot: « aucune sur un
 * foyer sans compromis » — une phrase de compromis sur un plan qui n'en porte
 * aucun serait une invention.
 */
function calmTable(): PlanTradeoffFacts {
  return {
    mouthsServed: 2,
    awayMouths: [],
    mouthsWithoutBody: [],
    sharedDishRegime: null,
    cookingShapeChoice: null,
    weeklyCookingMinutes: SEPARATE_DISH_MIN_WEEKLY_MINUTES,
    laneMode: "per_kg",
  };
}

Deno.test("un foyer SANS compromis ne produit RIEN — ni ligne, ni famille", () => {
  const out = explainPlanTradeoffs({ facts: calmTable(), locale: "fr" });
  assertEquals(out.lines, []);
  assertEquals(out.families, []);
  assertEquals(out.refusal, null);
});

Deno.test("une bouche seule ne lit AUCUNE de ces phrases", () => {
  // ⛔ Le seuil du lot, mot pour mot: « AUCUNE sur un foyer d'une seule bouche
  // sans absence ». Toutes les prémisses sont armées ici — et la condition
  // englobante doit toutes les faire taire.
  const solo: PlanTradeoffFacts = {
    mouthsServed: 1,
    awayMouths: [{ name: "Léa", days: ["wed"], allWindow: false }],
    mouthsWithoutBody: ["Léa"],
    sharedDishRegime: { regime: "vegetarian" },
    cookingShapeChoice: { capped: true, unused: false },
    weeklyCookingMinutes: 30,
    laneMode: "per_portion",
  };
  assertEquals(explainPlanTradeoffs({ facts: solo, locale: "fr" }).lines, []);
  // Et la lane individuelle, qui passe `null`, se tait pareil.
  assertEquals(
    explainPlanTradeoffs({
      facts: { ...solo, mouthsServed: null },
      locale: "fr",
    }).lines,
    [],
  );
});

// ---------------------------------------------------------------------------
// ① LA BOUCHE QUE LE PLAN NE COMPTE PAS
// ---------------------------------------------------------------------------

Deno.test("① absente TOUTE la fenêtre: le plan dit qu'il ne compte pas sa part", () => {
  const out = explainPlanTradeoffs({
    facts: {
      ...calmTable(),
      mouthsServed: 3,
      awayMouths: [{ name: "Léa", days: [], allWindow: true }],
    },
    locale: "fr",
  });
  assert(out.families.includes("mouth_absent"));
  assertEquals(out.lines.length, 1);
  assert(out.lines[0].includes("Léa"), out.lines[0]);
  assert(out.lines[0].includes("ne compte pas"), out.lines[0]);
});

Deno.test("① absente QUELQUES JOURS: les jours se NOMMENT, ils ne se comptent pas", () => {
  const out = explainPlanTradeoffs({
    facts: {
      ...calmTable(),
      mouthsServed: 4,
      awayMouths: [{ name: "Yanis", days: ["wed", "sat"], allWindow: false }],
    },
    locale: "fr",
  });
  assertEquals(out.lines.length, 1);
  assert(out.lines[0].includes("mercredi"), out.lines[0]);
  assert(out.lines[0].includes("samedi"), out.lines[0]);
  // ⛔ GARDE ② — AUCUN NOMBRE À CÔTÉ D'UN PRÉNOM. « Yanis manque 2 repas »
  // serait un nombre qui vise une personne, et c'est très exactement la faute
  // mesurée sur un run réel (« Zoé : 0,85 de la part de Marc »).
  assert(!/\d/.test(out.lines[0]), `un chiffre a fui: ${out.lines[0]}`);
});

Deno.test("① LE CAS RÉEL DU CORPUS: une absence de MIDI produit bien une ligne", () => {
  // ⛔ MESURÉ LE 2026-08-22, et c'est ce qui a fixé la granularité de `days`:
  // les 8 bouches du corpus qui portent une absence déclarée manquent des
  // REPAS, jamais une journée entière. Yanis (fixture `V0-C`) est absent
  // mercredi midi et soir, et dehors samedi soir — il petit-déjeune ici les
  // deux jours. Une famille armée sur la journée pleine rendrait `[]` ici, et
  // ressemblerait trait pour trait à une famille débranchée.
  const out = explainPlanTradeoffs({
    facts: {
      ...calmTable(),
      mouthsServed: 4,
      awayMouths: [{ name: "Yanis", days: ["wed", "sat"], allWindow: false }],
    },
    locale: "fr",
  });
  assertEquals(
    out.lines[0],
    "Yanis manque des repas mercredi et samedi : ces parts-là ne sont pas comptées.",
  );
});

Deno.test("① les DEUX phrases d'absence ne se confondent pas", () => {
  const out = explainPlanTradeoffs({
    facts: {
      ...calmTable(),
      mouthsServed: 4,
      awayMouths: [
        { name: "Léa", days: [], allWindow: true },
        { name: "Yanis", days: ["wed"], allWindow: false },
      ],
    },
    locale: "fr",
  });
  assertEquals(out.lines.length, 2);
  assert(out.lines[0].includes("Léa") && out.lines[0].includes("ne compte pas"));
  assert(out.lines[1].includes("Yanis") && out.lines[1].includes("mercredi"));
  // La famille est comptée une fois par phrase produite: c'est le compteur.
  assertEquals(out.families.filter((f) => f === "mouth_absent").length, 2);
});

Deno.test("① une absence SANS JOUR NOMMABLE se tait — garde ① de falsifiabilité", () => {
  // `days: []` avec `allWindow: false` = on ne peut confronter la phrase à
  // RIEN sur la grille. Moins précis, jamais faux: elle ne sort pas.
  const out = explainPlanTradeoffs({
    facts: {
      ...calmTable(),
      awayMouths: [{ name: "Yanis", days: [], allWindow: false }],
    },
    locale: "fr",
  });
  assertEquals(out.lines, []);
});

Deno.test("① au-delà du plafond de prénoms, on compte au lieu d'énumérer", () => {
  // ⚠️ LE TEST FRANCHIT LA CONSTANTE, IL NE LA RECOPIE PAS: « un test
  // paramétré par sa propre constante reste vert quand on change la
  // constante ». On construit `MAX + 1` bouches depuis la constante importée.
  const crowd = Array.from(
    { length: MAX_NAMED_AWAY_MOUTHS + 1 },
    (_, i) => ({ name: `P${i}`, days: ["wed"] as const, allWindow: false }),
  );
  const out = explainPlanTradeoffs({
    facts: { ...calmTable(), mouthsServed: 8, awayMouths: crowd },
    locale: "fr",
  });
  assertEquals(out.lines.length, 1);
  assert(out.lines[0].startsWith("Plusieurs bouches"), out.lines[0]);
  for (const mouth of crowd) {
    assert(!out.lines[0].includes(mouth.name), "un prénom a fui dans le repli");
  }
  // Et JUSTE EN DESSOUS du plafond, on nomme encore.
  const named = explainPlanTradeoffs({
    facts: {
      ...calmTable(),
      mouthsServed: 8,
      awayMouths: crowd.slice(0, MAX_NAMED_AWAY_MOUTHS),
    },
    locale: "fr",
  });
  assertEquals(named.lines.length, MAX_NAMED_AWAY_MOUTHS);
});

// ---------------------------------------------------------------------------
// ② LA BOUCHE DONT LE PLAN NE SAIT RIEN
// ---------------------------------------------------------------------------

Deno.test("② personne sans corps ⇒ rien; une bouche sans corps ⇒ une phrase", () => {
  assertEquals(
    explainPlanTradeoffs({ facts: calmTable(), locale: "fr" })
      .families.includes("mouth_without_body"),
    false,
  );
  const out = explainPlanTradeoffs({
    facts: { ...calmTable(), mouthsWithoutBody: ["Sarah"] },
    locale: "fr",
  });
  assert(out.families.includes("mouth_without_body"));
  const line = out.lines.find((l) => l.includes("Sarah"));
  assert(line, "la phrase ne nomme pas la bouche");
  assert(line.includes("comme celle de la table"), line);
  assert(!/\d/.test(line), `un chiffre a fui: ${line}`);
});

Deno.test("② deux bouches sans corps: le pluriel, et une seule ligne", () => {
  const out = explainPlanTradeoffs({
    facts: { ...calmTable(), mouthsServed: 4, mouthsWithoutBody: ["Sarah", "Malo"] },
    locale: "fr",
  });
  const line = out.lines.find((l) => l.includes("Sarah"));
  assert(line && line.includes("Malo"), "les deux prénoms doivent être sur LA MÊME ligne");
  assert(line.includes("n'ont pas dit"), line);
});

Deno.test("② un prénom vide est ÉCARTÉ, jamais rendu", () => {
  const out = explainPlanTradeoffs({
    facts: { ...calmTable(), mouthsWithoutBody: ["   ", ""] },
    locale: "fr",
  });
  assertEquals(out.families.includes("mouth_without_body"), false);
});

// ---------------------------------------------------------------------------
// ③ LE COMPROMIS DE LA FORME DE CUISINE
// ---------------------------------------------------------------------------

Deno.test("③ plafond MORDU + régime connu ⇒ le compromis se nomme", () => {
  const out = explainPlanTradeoffs({
    facts: {
      ...calmTable(),
      mouthsServed: 4,
      cookingShapeChoice: { capped: true, unused: false },
      sharedDishRegime: { regime: "vegetarian" },
    },
    locale: "fr",
  });
  assert(out.families.includes("simple_cooking_regime"));
  const line = out.lines.find((l) => l.includes("cuisiner simplement"));
  assert(line, "la phrase du compromis n'est pas sortie");
  assert(line.includes("végétarien"), line);
  // ⛔ ELLE NE NOMME PERSONNE: le sacrifice est celui de la table, la décision
  // est celle de qui compose. Nommer ici la bouche la plus restrictive lui
  // ferait porter un choix qu'elle n'a pas fait.
  assert(!line.includes("Sarah") && !line.includes("Malo"), line);
});

Deno.test("③ les TROIS prémisses sont armées, une par une", () => {
  const armed: PlanTradeoffFacts = {
    ...calmTable(),
    mouthsServed: 4,
    cookingShapeChoice: { capped: true, unused: false },
    sharedDishRegime: { regime: "vegan" },
  };
  const has = (f: PlanTradeoffFacts) =>
    explainPlanTradeoffs({ facts: f, locale: "fr" })
      .families.includes("simple_cooking_regime");
  assert(has(armed));
  // 1. le plafond n'a PAS mordu
  assert(!has({ ...armed, cookingShapeChoice: { capped: false, unused: true } }));
  assert(!has({ ...armed, cookingShapeChoice: null }));
  // 2. aucun régime déclaré
  assert(!has({ ...armed, sharedDishRegime: null }));
  // 3. le régime n'est pas nommable dans la copie ⇒ silence, jamais le slug
  const unknown = explainPlanTradeoffs({
    facts: { ...armed, sharedDishRegime: { regime: "carnivore" } },
    locale: "fr",
  });
  assertEquals(unknown.families.includes("simple_cooking_regime"), false);
  for (const line of unknown.lines) {
    assert(!line.includes("carnivore"), `le slug a fui: ${line}`);
  }
});

// ---------------------------------------------------------------------------
// ④ LA PHRASE FIXE — ⛔ L'INVERSE D'UNE PRÉMISSE ARMÉE
// ---------------------------------------------------------------------------
//
// ⛔ CES TESTS SONT LA DÉFENSE DE LA GARDE. Ils existent pour ROUGIR le jour où
// quelqu'un branchera la phrase sur le seul cas où elle est « vraiment » utile.
// Si l'un d'eux échoue après une simplification, ce n'est pas le test qui est
// trop strict: c'est la garde qui vient d'être cassée.

const FIXED_LINE_FR =
  "Les parts de ce plan sont servies à l'assiette, au plus près, plutôt " +
  "qu'ajustées bouche par bouche.";

Deno.test("④ le verrou de lane fait sortir la phrase fixe", () => {
  const out = explainPlanTradeoffs({
    facts: { ...calmTable(), laneMode: "per_portion" },
    locale: "fr",
  });
  assertEquals(out.lines, [FIXED_LINE_FR]);
  assertEquals(out.families, ["shares_at_the_plate"]);
});

Deno.test("④ ⛔ elle sort AUSSI dans TROIS cas anodins — sinon elle DÉSIGNE", () => {
  // Chacune de ces trois tables dimensionne au poids (`per_kg`): PERSONNE n'y
  // est protégé. La phrase doit sortir quand même, sinon sa présence dans un
  // foyer devient la preuve qu'une bouche y est sous plancher.
  const anodins: Record<string, PlanTradeoffFacts> = {
    "une bouche n'a rien déclaré": {
      ...calmTable(),
      mouthsWithoutBody: ["Sarah"],
    },
    "le plafond de forme a mordu": {
      ...calmTable(),
      cookingShapeChoice: { capped: true, unused: false },
    },
    "le temps ne permet pas un second plat": {
      ...calmTable(),
      weeklyCookingMinutes: SEPARATE_DISH_MIN_WEEKLY_MINUTES - 1,
    },
  };
  for (const [why, facts] of Object.entries(anodins)) {
    assertEquals(facts.laneMode, "per_kg", `${why}: la table doit être ANODINE`);
    const out = explainPlanTradeoffs({ facts, locale: "fr" });
    assert(
      out.lines.includes(FIXED_LINE_FR),
      `${why}: la phrase fixe n'est pas sortie — la garde est cassée`,
    );
    assert(out.families.includes("shares_at_the_plate"), why);
  }
});

Deno.test("④ ⛔ deux des trois portes anodines mordent sur un foyer où TOUT LE MONDE a déclaré", () => {
  // ⛔ C'EST LA MOITIÉ QUI COMPTE. Si les seules portes anodines étaient
  // « quelqu'un n'a rien déclaré », alors dans un foyer complet la phrase ne
  // sortirait QUE sous verrou — et redeviendrait un signal. Ces deux-là sont
  // donc NON NÉGOCIABLES, et ce test rougit si on les retire.
  const complete = { ...calmTable(), mouthsWithoutBody: [] };
  assertEquals(complete.laneMode, "per_kg");
  assertEquals(complete.mouthsWithoutBody, []);
  for (
    const facts of [
      { ...complete, cookingShapeChoice: { capped: true, unused: false } },
      { ...complete, weeklyCookingMinutes: SEPARATE_DISH_MIN_WEEKLY_MINUTES - 1 },
    ]
  ) {
    assert(
      explainPlanTradeoffs({ facts, locale: "fr" }).lines.includes(FIXED_LINE_FR),
      "une porte anodine a été retirée: la phrase fixe DÉSIGNE désormais",
    );
  }
});

Deno.test("④ elle est FIXE: même octet sous verrou et dans un cas anodin", () => {
  const sous_verrou = explainPlanTradeoffs({
    facts: { ...calmTable(), laneMode: "per_portion" },
    locale: "fr",
  }).lines.find((l) => l.includes("à l'assiette"));
  const anodin = explainPlanTradeoffs({
    facts: { ...calmTable(), cookingShapeChoice: { capped: true, unused: false } },
    locale: "fr",
  }).lines.find((l) => l.includes("à l'assiette"));
  assertEquals(sous_verrou, anodin);
  // Aucun prénom, aucun nombre, aucune branche de pluriel: deux formulations
  // différentes redeviendraient un signal à qui les compare d'une semaine à
  // l'autre.
  assert(sous_verrou && !/\d/.test(sous_verrou), String(sous_verrou));
});

Deno.test("④ elle NE sort PAS quand aucune des quatre portes n'est ouverte", () => {
  // Une garde qui sort TOUJOURS n'est plus une garde, c'est du bruit — et un
  // lecteur qui la voit partout cesse de lire les autres lignes.
  const out = explainPlanTradeoffs({ facts: calmTable(), locale: "fr" });
  assertEquals(out.families.includes("shares_at_the_plate"), false);
});

// ---------------------------------------------------------------------------
// LES DEUX LANGUES, ET LES CONTRATS DE BORD
// ---------------------------------------------------------------------------

Deno.test("les quatre familles sortent dans les DEUX langues", () => {
  const loud: PlanTradeoffFacts = {
    mouthsServed: 4,
    awayMouths: [{ name: "Léa", days: [], allWindow: true }],
    mouthsWithoutBody: ["Sarah"],
    sharedDishRegime: { regime: "vegetarian" },
    cookingShapeChoice: { capped: true, unused: false },
    weeklyCookingMinutes: 120,
    laneMode: "per_portion",
  };
  for (const locale of ["fr", "en"] as const) {
    const out = explainPlanTradeoffs({ facts: loud, locale });
    assertEquals(out.refusal, null);
    for (const family of TRADEOFF_FAMILIES) {
      assert(out.families.includes(family), `${locale}: ${family} manque`);
    }
    // ⛔ GARDE ② sur TOUTE la sortie, dans les deux langues: aucun chiffre
    // n'atteint le texte visible.
    for (const line of out.lines) {
      assert(!/\d/.test(line), `${locale}: un chiffre a fui — ${line}`);
    }
  }
  // Les deux langues ne rendent pas le même texte — sinon l'une des deux n'est
  // pas branchée. (Cicatrice: « garde testée dans une seule langue ».)
  const fr = explainPlanTradeoffs({ facts: loud, locale: "fr" }).lines.join(" ");
  const en = explainPlanTradeoffs({ facts: loud, locale: "en" }).lines.join(" ");
  assert(fr !== en);
  assert(en.includes("vegetarian") && fr.includes("végétarien"));
});

Deno.test("un champ OUBLIÉ jette, une locale inconnue jette", () => {
  const partial = { ...calmTable() } as Record<string, unknown>;
  delete partial.laneMode;
  assertThrows(
    () =>
      explainPlanTradeoffs({
        facts: partial as unknown as PlanTradeoffFacts,
        locale: "fr",
      }),
    Error,
    "laneMode est REQUIS",
  );
  assertThrows(
    () =>
      explainPlanTradeoffs({
        facts: calmTable(),
        locale: "de" as unknown as "fr",
      }),
    Error,
    "locale inconnue",
  );
});

Deno.test("aucun gabarit ne culpabilise — la porte finale ne doit jamais mordre", () => {
  const loud: PlanTradeoffFacts = {
    mouthsServed: 6,
    awayMouths: [
      { name: "Léa", days: [], allWindow: true },
      { name: "Yanis", days: ["wed", "sat"], allWindow: false },
    ],
    mouthsWithoutBody: ["Sarah", "Malo"],
    sharedDishRegime: { regime: "pescatarian" },
    cookingShapeChoice: { capped: true, unused: false },
    weeklyCookingMinutes: 60,
    laneMode: "per_portion",
  };
  for (const locale of ["fr", "en"] as const) {
    assertEquals(explainPlanTradeoffs({ facts: loud, locale }).refusal, null);
  }
});
