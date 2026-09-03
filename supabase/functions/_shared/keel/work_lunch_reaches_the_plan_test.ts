import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";

import { workLunchBlock } from "./household_meal_generation.ts";
import { parseWorkLunch } from "./household_presence.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * D6.1 + D6.2 — « LE DÉJEUNER EN SEMAINE » CESSE D'ÊTRE DÉCORATIF.
 * chantier-0903/CUISINE, A2 · 2026-09-03
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La question posait trois choses depuis le 2026-08-18: au bureau ? gamelle ou
 * dehors ? micro-ondes ? Deux moitiés ne servaient à rien.
 *
 *   · **D6.1** — `generate-meal-v1` ne lisait QUE
 *     `student_goals.practical_constraints.away_days`. Or depuis le 2026-09-01
 *     un solo a un foyer d'UNE bouche et compose avec cette lane: les cinq
 *     midis `eating_out` que la porte SQL pose sur `household_members` ne
 *     l'atteignaient jamais, et le moteur lui composait cinq déjeuners qu'il ne
 *     mangeait pas chez lui. **Sa réponse n'avait aucun effet sur son plan.**
 *   · **D6.2** — `lunchbox` et `microwave` n'avaient **aucun lecteur**, nulle
 *     part, pendant que trois commentaires promettaient « transportable, et bon
 *     froid s'il n'y a pas de micro-ondes ».
 *
 * ⛔ CE QUE CES TESTS DOIVENT EMPÊCHER: que l'un des deux câblages se
 * débranche en silence. Un lot désarmé ressemble trait pour trait à un lot qui
 * marche quand la donnée est simplement absente — d'où la lecture de SOURCE.
 */

const LANES: readonly [string, string][] = [
  ["solo", "../../generate-meal-v1/index.ts"],
  ["foyer", "../../generate-household-meal-v1/index.ts"],
];

/**
 * La source d'une lane, PRIVÉE DE SES COMMENTAIRES.
 *
 * ⛔ SANS ÇA, CES TESTS SERAIENT FAUX. Les deux fichiers RACONTENT le défaut
 * qu'ils ferment, en nommant les colonnes: un grep naïf y verrait des appelants
 * vivants et resterait vert le jour où le câblage part.
 */
async function codeOf(rel: string): Promise<string> {
  const src = await Deno.readTextFile(new URL(rel, import.meta.url));
  return src
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
}

// ---------------------------------------------------------------------------
// D6.1 — LE ROSTER ATTEINT LES DEUX LANES
// ---------------------------------------------------------------------------

Deno.test("D6.1 — la lane SOLO lit `household_members.away_days`, en union", () => {
  // ⚠️ UNION, PAS REMPLACEMENT. Les deux sources disent des choses
  // différentes: la colonne du profil porte ce que la personne a écrit pour
  // elle-même, la ligne de membre ce que le foyer a posé. En préférer une
  // effacerait l'autre en silence.
  return codeOf(LANES[0][1]).then((code) => {
    assertStringIncludes(code, '.from("household_members")');
    assertStringIncludes(code, '.select("away_days")');
    assertStringIncludes(code, "const declaredAway = parseAwayDays([");
    assertStringIncludes(code, "...rosterAway,");
    // ⛔ ET LA PANNE EST NOMMÉE. Un fail-open muet serait indiscernable d'une
    // personne qui n'a rien déclaré.
    assertStringIncludes(code, "roster_away_days_unreadable");
  });
});

Deno.test("D6.1 — la lane FOYER lisait déjà le roster, et ça n'a pas bougé", () => {
  // La lane foyer résout la présence par `parseMemberAway`, sur le roster, et
  // son commentaire dit que « le roster a déjà concaténé les deux sources ».
  // Ce cas existe pour que le câblage solo ne puisse pas être « réparé » en
  // débranchant celui du foyer.
  return codeOf(LANES[1][1]).then((code) => {
    assertStringIncludes(code, "away: parseMemberAway(r.away_days),");
  });
});

// ---------------------------------------------------------------------------
// D6.2 — LA GAMELLE A UNE CONSIGNE
// ---------------------------------------------------------------------------

const MEMBERS = [
  { memberId: "m-1", displayName: "Alex" },
  { memberId: "m-2", displayName: "Bo" },
  { memberId: "m-3", displayName: "Cy" },
] as unknown as Parameters<typeof workLunchBlock>[0];

Deno.test("D6.2 — sans gamelle, PAS UN OCTET", () => {
  // Le cas nominal, et la contre-épreuve du lot: le prompt d'un foyer où
  // personne n'emporte son déjeuner est celui de v22 au caractère près.
  assertEquals(workLunchBlock(MEMBERS, []), { block: "", mouths: 0, cold: 0 });
  // « Dehors » n'est PAS une gamelle: son effet est ailleurs (les cinq midis
  // `eating_out` que la porte SQL a posés), et le redire ici ferait poser une
  // contrainte de transport sur un repas que le plan ne compose pas.
  assertEquals(
    workLunchBlock(MEMBERS, [{ memberId: "m-1", mode: "outside", microwave: null }]),
    { block: "", mouths: 0, cold: 0 },
  );
});

Deno.test("D6.2 — la gamelle se transporte, et le froid ne s'invente pas", () => {
  const out = workLunchBlock(MEMBERS, [
    { memberId: "m-1", mode: "lunchbox", microwave: true },
    { memberId: "m-2", mode: "lunchbox", microwave: false },
    { memberId: "m-3", mode: "lunchbox", microwave: null },
  ]);
  assertEquals(out.mouths, 3);
  // ⛔ SEUL UN « NON » DÉCLARÉ FAIT UN PLAT FROID. `microwave: null` veut dire
  // « pas demandé, ou pas répondu »; fabriquer « bon froid » sur un silence
  // poserait une contrainte que personne n'a exprimée.
  assertEquals(out.cold, 1);
  assertStringIncludes(out.block, "Bo: carried, and eaten COLD");
  assertStringIncludes(out.block, "Alex: carried to work.");
  assertStringIncludes(out.block, "Cy: carried to work.");
  assert(!out.block.includes("Alex: carried, and eaten COLD"));
  assert(!out.block.includes("Cy: carried, and eaten COLD"));
});

Deno.test("D6.2 — une bouche hors de CE prompt n'est jamais NOMMÉE", () => {
  // Même règle que `eatingOutBlock`: écrire un identifiant nu ferait citer au
  // modèle un id qu'il ne peut rapprocher de rien.
  const out = workLunchBlock(MEMBERS, [
    { memberId: "m-absent", mode: "lunchbox", microwave: false },
  ]);
  assertEquals(out, { block: "", mouths: 0, cold: 0 });
});

Deno.test("D6.2 — le bloc NE RETIRE aucun repas, et il le dit", () => {
  const out = workLunchBlock(MEMBERS, [
    { memberId: "m-1", mode: "lunchbox", microwave: false },
  ]);
  // La gamelle EST un déjeuner de ce plan, préparé la veille. Le bloc doit
  // demander de le composer, jamais de le sauter — sinon il ferait le contraire
  // de ce que la réponse veut dire.
  assertStringIncludes(out.block, "Compose it as usual");
  assert(!out.block.includes("Compose NOTHING"));
});

Deno.test("D6.2 — la lane FOYER passe le champ, et compte ce qu'il a donné", async () => {
  const code = await codeOf(LANES[1][1]);
  // ⛔ LE CÂBLAGE, LU DANS LA SOURCE. `workLunch` est OPTIONNEL sur
  // `HouseholdPromptInput` (65 littéraux le construisent, et un lot en vol y
  // ajoute déjà un champ requis): c'est ce test-ci et le compteur qui
  // remplacent la casse de compilation.
  assertStringIncludes(code, "workLunch: workLunchRows,");
  assertStringIncludes(code, "const parsed = parseWorkLunch(row.work_lunch);");
  assertStringIncludes(code, '.select("id, work_lunch")');
  assertStringIncludes(code, "work_lunch_unreadable");
});

Deno.test("D6.2 — le parseur de la colonne est CELUI du module, pas une relecture", () => {
  // Il porte les trois états du formulaire déplié, et une seconde lecture de
  // cette forme divergerait au premier ajustement.
  assertEquals(parseWorkLunch(null), null);
  assertEquals(parseWorkLunch({ at_work: false }), {
    atWork: false,
    mode: null,
    microwave: null,
  });
  assertEquals(
    parseWorkLunch({ at_work: true, mode: "lunchbox", microwave: false }),
    { atWork: true, mode: "lunchbox", microwave: false },
  );
  // ⛔ LE MICRO-ONDES N'EXISTE QUE POUR LA GAMELLE.
  assertEquals(
    parseWorkLunch({ at_work: true, mode: "outside", microwave: false }),
    { atWork: true, mode: "outside", microwave: null },
  );
});

// ---------------------------------------------------------------------------
// LES DEUX `readCookingCapacity` — recopiées, donc comparées
// ---------------------------------------------------------------------------

Deno.test("A2 — les deux lanes lisent la MÊME cuisine, et la DÉRIVENT au même endroit", async () => {
  // ⛔ `readCookingCapacity` EST RECOPIÉE DANS LES DEUX FICHIERS, sans qu'aucun
  // test ne les ait jamais comparées (état constaté le 2026-09-03). Toucher
  // l'une sans l'autre est un interdit du mandat: ce cas le rend mécanique.
  //
  // ⚠️ ON COMPARE LES CLÉS LUES, PAS LE TEXTE. Les deux fonctions n'écrivent
  // pas leurs commentaires pareil et l'une déclare son type de retour: exiger
  // l'égalité des octets ferait rougir ce test sur une reformulation.
  const [solo, foyer] = await Promise.all(LANES.map(([, rel]) => codeOf(rel)));
  for (const [name, code] of [["solo", solo], ["foyer", foyer]] as const) {
    for (
      const key of [
        "cookingStyle: readCookingStyle(pc),",
        "groceryRuns: readGroceryRuns(pc),",
        "const capacity = resolveCookingCapacity({",
        "leadDay: cookOnlyDay !== null,",
      ]
    ) {
      assertStringIncludes(code, key, `${name}: ${key}`);
    }
    // ⛔ ET AUCUNE DES DEUX NE RÉÉCRIT LA RÈGLE. Un `min(` sur des sessions ou
    // une table de minutes dans un `index.ts` serait le jumeau que
    // `cooking_plan.ts` existe pour empêcher.
    assert(
      !code.includes("sessionCap"),
      `${name}: le plafond du style est recopié hors du module`,
    );
  }
});
