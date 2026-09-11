/**
 * LA LANE MULTI-BOUCHES NE BOUGE PAS D'UN OCTET — épingles (2026-09-07).
 *
 * ⛔ C'EST LA PROPRIÉTÉ QUI AUTORISE CE CHANTIER À EXISTER. La méthode nouvelle
 * est écrite, calibrée et mesurée sur UN foyer d'UNE personne. Tant qu'elle
 * n'est pas généralisée, le chemin neuf doit être PRÉCÉDÉ — jamais substitué —
 * et un foyer de deux bouches doit rendre exactement ce qu'il rendait hier.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  PORTION_SIZING_MAX_MOUTHS,
  sizingPathFor,
} from "./portion_sizing.ts";
import { slotPlanTargets } from "./mouth_anchor.ts";

Deno.test("à DEUX bouches, le chemin est ARMÉ depuis la bascule", () => {
  // ⟳ BASCULE (2026-09-08) — retourné. Ce test gardait « la table retombe sur
  // le chemin d'avant », qui était la vérité tant que le moteur ne savait
  // dimensionner qu'une bouche. Il garde maintenant l'inverse, et c'est le même
  // fait: la borne dit qui est armé, et deux bouches sont sous la borne.
  const r = sizingPathFor({
    platedMouths: 2,
    merge: false,
    unmerge: false,
    compositionLoaded: true,
  });
  assertEquals(r.path, "portion_v1");
  // ⛔ ET LA FUSION RESTE FERMÉE: elle reprend UNE personne et son échelle
  // gouverne, quel que soit le chemin de dimensionnement.
  assertEquals(
    sizingPathFor({ platedMouths: 2, merge: true, unmerge: false, compositionLoaded: true })
      .path,
    "legacy_measure",
  );
});

Deno.test("au-delà de la borne, AUCUN chemin armé — quelle que soit la borne", () => {
  // Écrit contre la CONSTANTE et pas contre « 2 »: le jour où la borne monte,
  // ce test doit suivre au lieu d'épingler un mensonge.
  for (const n of [PORTION_SIZING_MAX_MOUTHS + 1, PORTION_SIZING_MAX_MOUTHS + 5]) {
    assertEquals(
      sizingPathFor({ platedMouths: n, merge: false, unmerge: false, compositionLoaded: true })
        .path,
      "legacy_measure",
      `${n} bouches`,
    );
  }
});

Deno.test("les quatre appelants LEGACY passent `[]` et `null`, et rien ne bouge", () => {
  // ⛔ LA PREUVE ARITHMÉTIQUE, pas une relecture. Un appelant legacy passe
  // `lightSlots: []` et `slotFixedKcal: null`; le résultat doit être celui
  // d'avant le lot — c'est-à-dire ne dépendre d'aucun des deux champs neufs.
  const args = {
    targetKcal: 2200,
    coveredSlots: ["breakfast", "lunch", "dinner"],
    wholeSlots: ["breakfast", "lunch", "dinner"],
  };
  const legacy = slotPlanTargets({ ...args, lightSlots: [], slotFixedKcal: null });
  const vide = slotPlanTargets({ ...args, lightSlots: [], slotFixedKcal: new Map() });
  assertEquals(legacy.total, vide.total, "une carte VIDE vaut `null`");
  assertEquals([...legacy.fixedCovered.keys()], []);
  // ⟳ 2026-09-10 — LA JOURNÉE ENTIÈRE ARRIVE DANS L'ASSIETTE. Aucun retrait
  // n'est fait au nom d'un aliment que le plan ne compose pas: les trois parts
  // somment la cible du jour, au kcal près.
  assertEquals(Math.round(legacy.total), 2200);
});

Deno.test("un moment marqué léger qui n'est ni couvert ni déclaré ne change RIEN", () => {
  // La renormalisation porte sur les moments de la journée: marquer léger un
  // moment absent ne doit pas déplacer les autres.
  const args = {
    targetKcal: 2000,
    coveredSlots: ["lunch"],
    wholeSlots: ["breakfast", "lunch", "dinner"],
    slotFixedKcal: null,
  };
  const a = slotPlanTargets({ ...args, lightSlots: [] });
  const b = slotPlanTargets({ ...args, lightSlots: ["snack_pm", "before_bed"] });
  assertEquals(a.total, b.total);
});

Deno.test("la fusion et la défusion ferment le chemin, à une bouche comme à dix", () => {
  for (const flag of ["merge", "unmerge"] as const) {
    const r = sizingPathFor({
      platedMouths: 1,
      merge: flag === "merge",
      unmerge: flag === "unmerge",
      compositionLoaded: true,
    });
    assertEquals(r.path, "legacy_measure");
    assert(r.reason.startsWith(flag));
  }
});
