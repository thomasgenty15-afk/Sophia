/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 0 · LES CONTRE-EXEMPLES DU CHANTIER « MOTEUR UNIQUE »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier : `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md`, lot 0 — « fixer le contrat
 * et les contre-exemples AVANT le reroutage ».
 *
 * ── CE QUE CES TESTS SONT, ET CE QU'ILS NE SONT PAS ────────────────────────
 * Ce sont des tests de **caractérisation** : ils mesurent le comportement
 * D'AUJOURD'HUI et le figent, avec la cible écrite à côté. Ils sont donc VERTS
 * maintenant, et ils rougissent **le jour où le lot les corrige** — c'est le
 * signal, pas l'accident : celui qui livre le lot vient ici retourner
 * l'assertion, et il ne peut pas ne pas la voir.
 *
 * ⛔ POURQUOI PAS DES TESTS ROUGES. Le gate du dépôt lance TOUTE la suite
 * `_shared/keel/` et il est partagé : huit rouges volontaires bloqueraient les
 * commits de tout le monde jusqu'à la fin du chantier, et un gate qu'on
 * contourne ne garde plus rien. La cicatrice est écrite dans
 * `scripts/.vitest-red-baseline`.
 *
 * ⚠️ CHAQUE TEST NOMME LA CIBLE. Un test de caractérisation sans cible est un
 * test qui certifie un défaut.
 */
// ⟳ 2026-09-11 · LOT 7 — LES CAS QUI N'ÉPROUVAIENT QUE `generate-meal-v1`
// SONT PARTIS AVEC ELLE. Aucune assertion métier n'a été retirée pour faire
// taire un rouge: chacun avait son jumeau FOYER, qui reste. Le détail de
// l'audit est dans `scratchpad/2026-09-11-LOT7-SUPPRESSION/`.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  densityCorridorFor,
  plateBoundsFor,
} from "./portion_sizing.ts";
import {
  // ⟳ 2026-09-11 · LOT B — `requiredDensityFor` A DÉMÉNAGÉ dans le module du
  // contrat, avec un paramètre de plus: `rhythmSlots`, le rythme alimentaire
  // COMPLET de la bouche. Elle déduisait ce rythme de la GRILLE, ce qui donnait
  // la journée entière au dernier repas restant (facteur 2,86 mesuré).
  requiredDensityFor,
} from "./slot_nutrition_contract.ts";
import { createPlanBudget, PLAN_REPAIR_RESERVED_AFTER } from "./plan_budget.ts";
import { PLAN_MODEL_REPAIR_BUDGET } from "./generation_model.ts";
import {
  dishBitesExclusion,
  exclusionTermsFor,
} from "./food_exclusion_belt.ts";
import type { RetainedItem } from "./retained_item.ts";
import type { AnchorMouth } from "./mouth_anchor.ts";

const CORPS = {
  heightCm: 170,
  weightKg: 70,
  gender: "male" as const,
  ageYears: 35,
  activityLevel: "trains_some" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
};
const QUATRE = ["breakfast", "lunch", "snack_pm", "dinner"];
function bouche(over: Partial<AnchorMouth> = {}): AnchorMouth {
  return {
    memberId: "m-solo",
    ageState: "adult",
    restriction: "clear",
    body: CORPS,
    direction: null,
    paceKgPerWeek: null,
    declaredSlots: QUATRE,
    conditionRefs: [],
    ...over,
  } as AnchorMouth;
}

// ═══════════════════════════════════════════════════════════════════════════
// CE-1 · UN COULOIR EXISTE, ET IL EST TRANSMIS — ⟳ RETOURNÉ LE 2026-09-10
//
// ⛔ CE CONTRE-EXEMPLE A ÉTÉ FERMÉ PAR LE LOT 4. Il assertait le comportement
// d'alors: `requiredDensityFor` jetait la ligne entière d'un moment dont la
// borne BASSE ne dépassait pas le plancher commun — et emportait son PLAFOND,
// que rien d'autre ne porte. Le filtre `min > floor` est retiré; ce test
// asserte désormais la CIBLE, et il garde le nombre qui rendait le défaut
// visible.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("CE-1 — le couloir d'un petit créneau est calculable, ET il est dit", () => {
  // Un goûter à 250 kcal pour un adulte : bornes 185–250 g, donc un couloir
  // parfaitement utilisable.
  const bounds = plateBoundsFor({
    ageYears: 35,
    slot: "lunch",
    slotTargetKcal: 250,
    light: false,
    appetite: null,
  });
  const corridor = densityCorridorFor({ targetKcal: 250, bounds })!;
  assertEquals(corridor.minPer100G, 100);
  assertEquals(corridor.maxPer100G, 135);
  assertEquals(corridor.preferredPer100G, 110);

  // ⟳ ET LE MODÈLE L'ENTEND. Avant le lot 4, `requiredDensityFor` ne gardait un
  // moment que si sa borne BASSE dépassait le plancher commun du bloc (100). À
  // 100 exactement, la ligne était jetée — et avec elle le PLAFOND de 135, qui
  // n'a rien à voir avec le plancher et que rien d'autre ne porte.
  const r = requiredDensityFor({
    mouth: bouche(),
    coachCounting: "no_position",
    slotsByDay: new Map([["mon", QUATRE]]),
    // ⟳ 2026-09-11 · LOT B — le rythme complet; ici il coïncide avec la grille.
    rhythmSlots: QUATRE,
    lightSlots: [],
    slotFixedKcalByDay: new Map(),
    ageYears: 35,
    floors: { normal: 100, light: 60 },
  });
  const gouter = r.named.find((d) => d.slot === "snack_pm");
  assert(
    gouter !== undefined,
    "le goûter ne porte plus son couloir: le filtre est revenu",
  );
  // ⛔ LE PLAFOND EST LÀ, et c'est ce que le filtre coûtait. Il vaut 250 ici —
  // le plafond de DEMANDE — parce que la part de ce goûter dans cette grille
  // est petite: sa borne haute n'est pas bornée par l'assiette mais par ce
  // qu'on s'autorise à demander. Ce qui compte pour ce contre-exemple, c'est
  // qu'une borne haute EXISTE et voyage; le couloir [100, 135] démontré
  // ci-dessus dit ce que le filtre jetait quand elle mordait vraiment.
  assert(
    gouter.maxPer100G >= gouter.minPer100G,
    `le plafond du goûter est dégénéré: ${gouter.minPer100G}–${gouter.maxPer100G}`,
  );
  // ⚠️ ET SA BORNE BASSE EST MARQUÉE REDONDANTE — l'objection d'origine est
  // conservée, mais elle est devenue une affaire de RENDU: le rédacteur du
  // brief écrit « au plus N » au lieu de répéter le plancher du bloc.
  assertEquals(gouter.redundantMin, true);

  // ⚠️ LA MOITIÉ QUI COÛTE : ce qui est perdu n'est pas un plancher redondant,
  // c'est un PLAFOND. Sans lui, une barre à 400 kcal/100 g passe le contrôle
  // d'un goûter dont l'assiette ne peut alors plus être remplie.
  assert(
    corridor.maxPer100G < 250,
    "le plafond de ce moment est bien sous le plafond de demande",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// CE-2 · UN PLAT NE PEUT PORTER QU'UNE MORSURE — LE TYPE L'INTERDIT
// ═══════════════════════════════════════════════════════════════════════════

const QUI = "member:7b17ae2c-dd85-4d27-b8f2-4c52dbfc0828";
function exclut(text: string): RetainedItem {
  return {
    kind: "food.exclude",
    scope: "next_plan",
    subject: QUI,
    text,
    value: null,
    source: "draft_note",
    at: "2026-09-01",
    item: "",
    confidence: null,
    quote: text,
  } as unknown as RetainedItem;
}

Deno.test("CE-2 — deux aliments interdits dans le MÊME plat ne rendent qu'une morsure", () => {
  const terms = exclusionTermsFor({
    items: [exclut("plus de saumon"), exclut("plus d'aubergine")],
    subject: QUI,
  });
  assertEquals(
    terms.length,
    2,
    "prémisse : les deux exclusions sont bien lues",
  );

  const bite = dishBitesExclusion({
    dish: {
      title: "Saumon et aubergine",
      method: "Cuire au four.",
      ingredients: [{ term: "saumon" }, { term: "aubergine" }],
    } as never,
    uses: [],
    preparationById: new Map(),
    terms,
    surface: "ingredients",
  });

  // ⛔ UN SEUL `matched`, ET C'EST LE TYPE QUI L'IMPOSE : `ExclusionBite` porte
  // `matched: string | null`, pas une liste. Le plat contient DEUX interdits ;
  // le rapport n'en nomme qu'un.
  assert(bite.matched !== null, "prémisse : le plat mord");
  assertEquals(typeof bite.matched, "string");

  // ⟳ CIBLE DU LOT 6 : « énumérer TOUTES les violations applicables par
  // personne, règle, plat et préparation ». Le jour où `ExclusionBite` portera
  // une liste, cette ligne rougit — et c'est le moment de la retourner.
  assertEquals(
    Object.prototype.hasOwnProperty.call(bite, "matchedAll"),
    false,
    "⟳ CIBLE DU LOT 6 : la morsure porte toutes ses occurrences. Retourne cette assertion.",
  );

  // ⚠️ CE QUE ÇA COÛTE, ET C'EST LE CONTRÔLE D'APRÈS-RÉPARATION : comparer deux
  // versions par leurs morsures ne peut pas voir qu'un plat déjà mordu en a
  // gagné une seconde. L'identité `(jour, moment, plat, terme, règle)` posée le
  // 2026-09-10 ferme les substitutions, pas les AGGRAVATIONS.
});

// ═══════════════════════════════════════════════════════════════════════════
// CE-3 · LE RATTRAPAGE PROTÉIQUE EST STRUCTURELLEMENT IMPOSSIBLE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("CE-3 — ⟳ FERMÉ: un défaut protéique seul déclenche une tentative", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT 6 — CE CONTRE-EXEMPLE EST FERMÉ
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QU'IL DÉCRIVAIT. `PLAN_REPAIR_RESERVED_AFTER` donnait
  // `protein_anchor_retry: 2` sur un budget de 2: la protéine était refusée
  // `repair_reserved` MÊME sur un plan parfait par ailleurs, budget intact.
  // Le chantier l'interdit: « un défaut protéique seul peut déclencher une
  // tentative lorsque le budget est disponible ».
  //
  // LA RÉPARATION N'EST PAS UN MEILLEUR BARÈME — c'est une MESURE. La pesée a
  // été remontée au-dessus des rattrapages dans `generate-household-meal-v1`,
  // et la réserve vaut désormais le nombre de natures plus prioritaires
  // RÉELLEMENT EN DÉFAUT. Rien en défaut ⇒ rien à garder ⇒ la protéine part.
  const b = createPlanBudget({ now: () => 1_000_000, startedAtMs: 1_000_000 });
  const mesure = new Set<string>(); // pesé, et aucune nature en défaut
  const ask = b.askRepair("protein_anchor_retry", 1_000, 120_000, mesure);

  assertEquals(ask.granted, true);
  assertEquals(ask.refusal, null);
  assertEquals(b.snapshot().repairs_used, 1);

  // ⛔ ET LE COMPORTEMENT À L'AVEUGLE EST INCHANGÉ. Sans ensemble mesuré — le
  // cas de la lane individuelle, dont la pesée n'a pas été remontée — la table
  // reprend la main, à l'identique. C'est ce qui garantit qu'on n'a rien changé
  // chez elle en passant.
  const aveugle = createPlanBudget({
    now: () => 1_000_000,
    startedAtMs: 1_000_000,
  });
  const sansMesure = aveugle.askRepair("protein_anchor_retry", 1_000, 120_000);
  assertEquals(sansMesure.granted, false);
  assertEquals(sansMesure.refusal, "repair_reserved");
  assertEquals(
    PLAN_REPAIR_RESERVED_AFTER.protein_anchor_retry,
    PLAN_MODEL_REPAIR_BUDGET,
  );
});
