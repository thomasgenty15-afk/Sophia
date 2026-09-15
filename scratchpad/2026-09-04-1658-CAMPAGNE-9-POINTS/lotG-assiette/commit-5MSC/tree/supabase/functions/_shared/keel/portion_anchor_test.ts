import { STUDENT_GOALS } from "./week_plan_generation.ts";
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  portionAnchorFor,
  portionAnchorPromptLine,
} from "./portion_anchor.ts";
import { envelopeFor } from "./meal_envelope.ts";
import type { AgeBand } from "./student_age.ts";

function body(
  weightKg: number,
  heightCm: number,
  gender: "male" | "female",
  restrictionFlag = false,
) {
  return {
    heightCm,
    ageBand: "30_44" as AgeBand,
    gender,
    latestWeight: { weekStart: "2026-08-09", value: weightKg },
    latestWaist: null,
    declaredWeightKg: null,
    restrictionFlag,
  };
}

const BIG = body(92, 186, "male");
const SMALL = body(55, 162, "female");

// ===========================================================================
// L'ANCRE DE PORTION — ce que ce fichier garde
//
// Le défaut d'origine, MESURÉ en run réel le 2026-08-11: à 100 % de
// résolution, un plan servait 1140 kcal et 34 g de protéines pour une cible de
// 2354-2426 kcal et 184 g. Et une relance de correction ne rendait que
// ×1,21 en énergie — très loin du ×2,1 nécessaire.
//
// Ce module existe pour donner au modèle la seule chose qui lui manquait: un
// ORDRE DE GRANDEUR de portion. Les tests gardent les trois façons de le rater:
//   1. servir la même part à tout le monde (l'ancre ne suivrait pas le corps)
//   2. faire fuir un chiffre vers la PERSONNE (la frontière du produit)
//   3. survivre au plancher TCA (une part dérivée du poids d'un élève flaggé)
// ===========================================================================

Deno.test("l'ancre SUIT le corps — c'est toute sa raison d'être", () => {
  const big = portionAnchorFor(envelopeFor("fat_loss", BIG, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null), 3)!;
  const small = portionAnchorFor(envelopeFor("fat_loss", SMALL, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null), 3)!;
  assert(big, "pas d'ancre pour un corps connu");
  assert(small);

  // 92 kg doit recevoir une part franchement plus grande que 55 kg. « Un peu
  // plus » ne suffirait pas: c'est exactement le défaut mesuré, où les deux
  // recevaient presque la même assiette.
  assert(
    big.proteinFoodG >= small.proteinFoodG * 1.4,
    `92 kg: ${big.proteinFoodG} g vs 55 kg: ${small.proteinFoodG} g — l'écart est trop faible`,
  );
  assert(big.starchDryG > small.starchDryG);
});

Deno.test("l'objectif change la FORME de l'assiette, pas seulement sa taille", () => {
  const loss = portionAnchorFor(envelopeFor("fat_loss", BIG, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null), 3)!;
  const gain = portionAnchorFor(envelopeFor("muscle_gain", BIG, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null), 3)!;

  // À corps identique, la prise de masse mange PLUS de féculent — c'est l'axe
  // qui gouverne cette dynamique (l'apport, pas la retenue).
  assert(
    gain.starchDryG > loss.starchDryG,
    `muscle_gain devrait porter plus de féculent: ${gain.starchDryG} vs ${loss.starchDryG}`,
  );
  // Et la perte de gras porte plus de protéine par repas: son plancher est
  // plus haut en g/kg.
  assert(loss.proteinFoodG > gain.proteinFoodG);
});

Deno.test("moins de repas ⇒ des parts plus grandes, pas la même servie deux fois", () => {
  const three = portionAnchorFor(envelopeFor("fat_loss", BIG, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null), 3)!;
  const two = portionAnchorFor(envelopeFor("fat_loss", BIG, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null), 2)!;
  assert(
    two.proteinFoodG > three.proteinFoodG,
    "un élève à deux repas doit voir des parts plus grandes",
  );
});

Deno.test("sous le plancher TCA, il n'y a PAS d'ancre", () => {
  // Une part calculée depuis un poids serait un chiffre dérivé du corps d'un
  // élève sous plancher. `null`, jamais des valeurs par défaut: une ancre
  // « moyenne » ferait exactement ce que ce module corrige, à l'envers —
  // servir la même assiette à tout le monde en ayant l'air de personnaliser.
  const flagged = envelopeFor("fat_loss", body(92, 186, "male", true), "30_44", true, null, null, { day: null, sport: null, asked: false }, null, null);
  assertEquals(portionAnchorFor(flagged, 3), null);

  // Corps inconnu: même silence, et c'est ce qui rend les deux indiscernables.
  assertEquals(portionAnchorFor(envelopeFor("fat_loss", null, null, false, null, null, { day: null, sport: null, asked: false }, null, null), 3), null);
});

Deno.test("la consigne ne porte AUCUN chiffre sur la personne", () => {
  // LA FRONTIÈRE DU PRODUIT: « des chiffres sur l'ALIMENT, jamais sur la
  // PERSONNE ». Une kcal, un nom de macro ou un total journalier dans cette
  // ligne la franchirait.
  for (const goal of STUDENT_GOALS) {
    for (const b of [BIG, SMALL]) {
      const anchor = portionAnchorFor(envelopeFor(goal, b, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null), 3);
      if (!anchor) continue;
      const line = portionAnchorPromptLine(anchor).toLowerCase();

      // ── CE QUI EST INTERDIT EST UN CHIFFRE ACCOLÉ, PAS LE MOT ───────────
      // La première version de ce test bannissait le mot « calorie » en
      // sous-chaîne — et mordait sur la consigne elle-même, qui dit « never
      // turn them into calories ». Une INTERDICTION de parler de calories
      // n'est pas une calorie. Ce qui franchit la frontière du produit, c'est
      // un NOMBRE collé à une unité d'énergie ou à une macro.
      for (
        const pattern of [
          /\d[\d.,\s]*(kcal|calories?|kj|kilojoules?)/,
          /\d[\d.,\s]*g\s*(of\s+)?(protein|carb|fat|macro)/,
          /(per day|daily total|a day|par jour)/,
        ]
      ) {
        assertEquals(
          pattern.test(line),
          false,
          `${goal}: la consigne franchit la frontière — ${pattern} dans « ${line} »`,
        );
      }
      // Et le canari: la ligne PORTE bien des grammes d'aliment, sinon ce test
      // passerait sur une consigne vide.
      assert(/\d+\s*g\b/.test(line), "aucun gramme d'aliment dans la consigne");
      // Et elle dit explicitement de ne pas les rendre à l'élève.
      assert(line.includes("never write these numbers back"));
      assert(line.includes("orders of magnitude"));
    }
  }
});

Deno.test("les parts restent dans des ordres de grandeur crédibles", () => {
  // Une ancre qui dirait « 900 g de viande » serait pire que pas d'ancre: le
  // modèle la suivrait. Bornes larges, mais bornes.
  for (const goal of STUDENT_GOALS) {
    for (const b of [BIG, SMALL]) {
      const a = portionAnchorFor(envelopeFor(goal, b, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null), 3);
      if (!a) continue;
      const tag = `${goal}/${b.latestWeight.value}kg`;
      assert(a.proteinFoodG >= 80 && a.proteinFoodG <= 400, `${tag}: protéine ${a.proteinFoodG} g`);
      assert(a.starchDryG >= 10 && a.starchDryG <= 250, `${tag}: féculent ${a.starchDryG} g`);
      assert(a.addedFatG >= 10 && a.addedFatG <= 60, `${tag}: gras ${a.addedFatG} g`);
      // Les grammes sont ronds: une portion n'est pas une pesée.
      assertEquals(a.proteinFoodG % 10, 0, tag);
      assertEquals(a.starchDryG % 10, 0, tag);
    }
  }
});

Deno.test("l'ancre couvre RÉELLEMENT le plancher protéique", () => {
  // Le test qui relie ce module à ce qu'il sert: si la part de protéine, prise
  // trois fois, n'atteint pas le plancher de l'enveloppe, l'ancre calibre vers
  // un plan qui restera « under » — et on aurait déplacé le problème sans le
  // résoudre.
  for (const b of [BIG, SMALL]) {
    for (const goal of ["fat_loss", "muscle_gain"] as const) {
      const env = envelopeFor(goal, b, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null);
      const a = portionAnchorFor(env, 3)!;
      assert(a);
      // ~24 g de protéine pour 100 g d'aliment protéique.
      const dailyProteinG = (a.proteinFoodG * 0.24) * 3;
      const floor = "proteinFloorG" in env ? env.proteinFloorG : 0;
      assert(
        dailyProteinG >= floor * 0.9,
        `${goal}/${b.latestWeight.value}kg: l'ancre donne ~${Math.round(dailyProteinG)} g pour un plancher de ${floor} g`,
      );
    }
  }
});
