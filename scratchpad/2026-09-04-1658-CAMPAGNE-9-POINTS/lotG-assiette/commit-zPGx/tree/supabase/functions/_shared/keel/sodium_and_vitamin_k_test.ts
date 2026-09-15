/**
 * L5 — LES ÉPREUVES DU SEL ET DE LA VITAMINE K.
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L5`.
 *
 * ⛔ CE QUE CE FICHIER DOIT PROUVER, ET QUI N'EST PAS ÉVIDENT
 * ----------------------------------------------------------
 * ① Rien ne peut formuler un MANQUE DE SEL. Une absence ne se teste pas en
 *    appelant la fonction qui n'existe pas: on asserte la LISTE des verdicts,
 *    et un quatrième membre fait rougir.
 * ② Un plan sous warfarine tient la K STABLE, **pas basse**. Une garde qui
 *    pousse la K vers le bas est aussi fausse qu'une garde absente — donc le
 *    cas « sept journées parfaitement constantes à 12 µg » doit sortir
 *    `suppressed`, jamais `stable`.
 * ③ Chaque garde a un cas qui MORD **et un cas qui PASSE**. Une garde cassée
 *    bloque tout et ressemble à une garde qui marche.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dailySodiumMg,
  dailyVitaminKUg,
  HIGH_VITAMIN_K_UG_PER_100G,
  isHighVitaminK,
  saltGramsOf,
  SALT_PER_SODIUM,
  SODIUM_MAX_MG_PER_DAY,
  SODIUM_VERDICTS,
  sodiumVerdict,
  sumPer100g,
  VITAMIN_K_STABILITY_TOLERANCE,
  VITAMIN_K_STABILITY_VERDICTS,
  vitaminKStability,
} from "./sodium_and_vitamin_k.ts";

// ---------------------------------------------------------------------------
// ⛔ ① LE SEL NE PEUT PAS MANQUER
// ---------------------------------------------------------------------------

Deno.test("L5 · sodium: la liste des verdicts a EXACTEMENT trois membres, et aucun ne dit « en dessous »", () => {
  // ⛔ C'EST L'ÉPREUVE QUI TIENT L'ABSENCE. Ajouter `below` à
  // `SODIUM_VERDICTS` fait rougir cette ligne, et c'est le seul moyen connu
  // de ce dépôt d'empêcher un membre d'apparaître.
  assertEquals([...SODIUM_VERDICTS], ["unknown", "within", "above"]);
  for (const v of SODIUM_VERDICTS) {
    assert(
      !/below|under|low|deficit|manque|insuffis/i.test(v),
      `verdict interdit: ${v} — \`sodium_mg\` est une valeur à MAXIMUM`,
    );
  }
});

Deno.test("L5 · sodium: ZÉRO milligramme rend `within`, jamais un manque", () => {
  // ⛔ LA LIGNE QUI COMPTE LE PLUS DU LOT. « Vous êtes en dessous de votre
  // besoin en sel » est un conseil activement nocif: la population française
  // en avale 9-10 g par jour contre moins de 5 recommandés.
  assertEquals(sodiumVerdict(0), "within");
  assertEquals(sodiumVerdict(1), "within");
});

Deno.test("L5 · sodium: le plafond mord au-dessus, et pas en dessous", () => {
  assertEquals(sodiumVerdict(SODIUM_MAX_MG_PER_DAY - 1), "within");
  assertEquals(sodiumVerdict(SODIUM_MAX_MG_PER_DAY), "within");
  assertEquals(sodiumVerdict(SODIUM_MAX_MG_PER_DAY + 1), "above");
  // Un cas qui MORD haut: une journée de 9 g de sel, la moyenne française.
  assertEquals(sodiumVerdict(3540), "above");
});

Deno.test("L5 · sodium: l'inconnu et l'absurde s'abstiennent, ils ne retombent pas sur `within`", () => {
  assertEquals(sodiumVerdict(null), "unknown");
  assertEquals(sodiumVerdict(Number.NaN), "unknown");
  assertEquals(sodiumVerdict(-1), "unknown");
});

Deno.test("L5 · sodium: le plafond est 2 000 mg, soit 5 g de sel", () => {
  // La constante est assertée pour la même raison que `MEAL_PROMPT_VERSION`
  // l'est ailleurs: la déplacer en passant doit se voir.
  assertEquals(SODIUM_MAX_MG_PER_DAY, 2000);
  assertEquals(SALT_PER_SODIUM, 2.54);
  assertEquals(saltGramsOf(2000), 5.1);
  assertEquals(saltGramsOf(null), null);
  assertEquals(saltGramsOf(-3), null);
});

Deno.test("L5 · sodium: une journée se somme sur les grammes servis", () => {
  // 0,5 g de sel de table (38 758 mg/100 g) = 194 mg de sodium.
  assertEquals(dailySodiumMg([{ grams: 0.5, per100g: 38758 }]), 193.8);
  // ⛔ UNE LIGNE SANS VALEUR SUFFIT À S'ABSTENIR.
  assertEquals(
    dailySodiumMg([{ grams: 0.5, per100g: 38758 }, { grams: 100, per100g: null }]),
    null,
  );
  assertEquals(dailySodiumMg([]), null);
});

// ---------------------------------------------------------------------------
// ⛔ ② LA VITAMINE K TIENT STABLE, PAS BASSE
// ---------------------------------------------------------------------------

Deno.test("L5 · K: la liste des verdicts nomme `suppressed` À PART de `unstable`", () => {
  // Les deux disent « hors bande ». Ils appellent des corrections OPPOSÉES:
  // resserrer la composition d'un côté, REMETTRE des légumes verts de l'autre.
  assertEquals([...VITAMIN_K_STABILITY_VERDICTS], [
    "unknown",
    "stable",
    "suppressed",
    "unstable",
  ]);
});

Deno.test("L5 · K: ⛔ un plan warfarine PARFAITEMENT CONSTANT mais BAS n'est PAS `stable`", () => {
  // ⛔ LE CŒUR DU LOT. Sept journées à 12 µg, écart-type ZÉRO: une garde qui
  // ne regarderait que la variance dirait « stable » et laisserait le produit
  // retirer tous les légumes verts d'un porteur d'antivitamine K — ce qui
  // déstabilise l'INR exactement comme un excès.
  const constant = vitaminKStability({
    referenceUg: 120,
    dailyUg: [12, 12, 12, 12, 12, 12, 12],
  });
  assertEquals(constant.verdict, "suppressed");
  assertEquals(constant.belowDays, [0, 1, 2, 3, 4, 5, 6]);
  assertEquals(constant.aboveDays, []);

  // Et une SEULE journée effondrée suffit — la stabilité n'est pas une moyenne.
  const uneSeule = vitaminKStability({
    referenceUg: 120,
    dailyUg: [118, 125, 130, 9, 122, 119, 121],
  });
  assertEquals(uneSeule.verdict, "suppressed");
  assertEquals(uneSeule.belowDays, [3]);
});

Deno.test("L5 · K: LE CAS QUI PASSE — une semaine autour de l'apport habituel est `stable`", () => {
  // ⛔ UNE GARDE A BESOIN D'UN CAS QUI PASSE. Sans lui, elle bloque tout et
  // ressemble à une garde qui marche.
  const st = vitaminKStability({
    referenceUg: 120,
    dailyUg: [95, 140, 118, 131, 104, 126, 112],
  });
  assertEquals(st.verdict, "stable");
  assertEquals(st.belowDays, []);
  assertEquals(st.aboveDays, []);
  assertEquals(st.lowUg, 84);
  assertEquals(st.highUg, 156);
});

Deno.test("L5 · K: un dépassement PAR LE HAUT est `unstable`, pas `suppressed`", () => {
  const st = vitaminKStability({
    referenceUg: 120,
    dailyUg: [118, 125, 480, 122],
  });
  assertEquals(st.verdict, "unstable");
  assertEquals(st.aboveDays, [2]);
  assertEquals(st.belowDays, []);
});

Deno.test("L5 · K: quand le plan sort des DEUX côtés, c'est `suppressed` qui l'emporte", () => {
  // Délibéré: des deux défauts, la suppression est celui dont la correction
  // est urgente et contre-intuitive.
  const st = vitaminKStability({
    referenceUg: 120,
    dailyUg: [9, 480, 120],
  });
  assertEquals(st.verdict, "suppressed");
  assertEquals(st.belowDays, [0]);
  assertEquals(st.aboveDays, [1]);
});

Deno.test("L5 · K: sans référence, sans journées, ou avec un trou — ABSTENTION", () => {
  // ⛔ CE MODULE N'INVENTE PAS DE RÉFÉRENCE. L'apport habituel est un
  // paramètre; l'absence rend `unknown`, jamais une RNP posée en passant
  // (porte G6).
  assertEquals(vitaminKStability({ referenceUg: null, dailyUg: [120] }).verdict, "unknown");
  assertEquals(vitaminKStability({ referenceUg: 120, dailyUg: [] }).verdict, "unknown");
  assertEquals(
    vitaminKStability({ referenceUg: 120, dailyUg: [120, null, 118] }).verdict,
    "unknown",
  );
  assertEquals(vitaminKStability({ referenceUg: 0, dailyUg: [0] }).verdict, "unknown");
  // Une tolérance absurde ne rend pas un verdict optimiste: elle s'abstient.
  assertEquals(
    vitaminKStability({ referenceUg: 120, dailyUg: [120], tolerance: 0 }).verdict,
    "unknown",
  );
  assertEquals(
    vitaminKStability({ referenceUg: 120, dailyUg: [120], tolerance: 1 }).verdict,
    "unknown",
  );
});

Deno.test("L5 · K: la bande vaut ±30 % et la constante est assertée", () => {
  assertEquals(VITAMIN_K_STABILITY_TOLERANCE, 0.3);
});

// ---------------------------------------------------------------------------
// LA SOMME, ET LA LISTE FERMÉE
// ---------------------------------------------------------------------------

Deno.test("L5 · K: la somme d'une journée s'abstient sur un trou, jamais une somme partielle", () => {
  // 150 g d'épinards (482,9 µg/100 g) = 724 µg.
  assertEquals(dailyVitaminKUg([{ grams: 150, per100g: 482.9 }]), 724.4);
  // ⛔ Un seul aliment sans valeur éteint la journée. Une somme partielle
  // « 40 µg » sur un plan qui en porte 500 est le nombre sur lequel un
  // porteur de warfarine réglerait sa dose.
  assertEquals(
    dailyVitaminKUg([{ grams: 150, per100g: 482.9 }, { grams: 80, per100g: null }]),
    null,
  );
  assertEquals(sumPer100g([{ grams: -1, per100g: 10 }]), null);
});

Deno.test("L5 · K: « varier les légumes » déplace la journée de deux ordres de grandeur", () => {
  // ⛔ LE FAIT QUI JUSTIFIE LA COLONNE, ÉCRIT COMME UNE ÉPREUVE.
  // 200 g, à masse RIGOUREUSEMENT constante, d'une espèce à l'autre:
  const courgette = dailyVitaminKUg([{ grams: 200, per100g: 5 }]);
  const epinard = dailyVitaminKUg([{ grams: 200, per100g: 482.9 }]);
  const kale = dailyVitaminKUg([{ grams: 200, per100g: 704.8 }]);
  assertEquals(courgette, 10);
  assertEquals(epinard, 965.8);
  assertEquals(kale, 1409.6);
  assert(
    epinard !== null && courgette !== null && epinard / courgette > 90,
    "l'écart épinard/courgette doit rester de deux ordres de grandeur",
  );

  // Et la garde le VOIT: le même plan, un légume changé, bascule.
  const stable = vitaminKStability({ referenceUg: 965.8, dailyUg: [965.8, 965.8, 965.8] });
  assertEquals(stable.verdict, "stable");
  const varie = vitaminKStability({ referenceUg: 965.8, dailyUg: [965.8, 10, 965.8] });
  assertEquals(varie.verdict, "suppressed");
});

Deno.test("L5 · liste fermée: le seuil « K élevée » est 100 µg/100 g et il mord aux deux bords", () => {
  assertEquals(HIGH_VITAMIN_K_UG_PER_100G, 100);
  assertEquals(isHighVitaminK(100), true); // pesto, exactement au seuil
  assertEquals(isHighVitaminK(99.9), false);
  assertEquals(isHighVitaminK(704.8), true); // kale
  assertEquals(isHighVitaminK(5), false); // courgette
  assertEquals(isHighVitaminK(null), false); // ⛔ inconnu n'est pas « élevé »
});
