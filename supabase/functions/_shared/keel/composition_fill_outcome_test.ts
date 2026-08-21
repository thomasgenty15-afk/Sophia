import {
  assert,
  assertEquals,
  assertStrictEquals,
} from "jsr:@std/assert@^1.0.0";

import {
  compositionFillColumns,
  type CompositionFillMiss,
  fillPlanComposition,
} from "./composition_fill_io.ts";
import { buildCompositionIndex } from "./food_composition.ts";
import type { EnergySourceShares } from "./composition_fill.ts";

/**
 * V0-B-bis · « PAS MESURÉ » ET « MESURÉ À ZÉRO » NE SONT PLUS LE MÊME OCTET.
 *
 * ── LE DÉFAUT, ET POURQUOI IL COÛTAIT CHER ────────────────────────────────
 * Les deux lanes de génération partaient de
 * `{ unknowns: 0, shares: {}, counts: {} }` et n'en bougeaient QUE si le
 * remplissage aboutissait. Deux chemins écrivaient donc `0` et `{}` sur la
 * ligne du plan — c'est-à-dire « mesuré, aucun inconnu » — sur un plan que le
 * sas n'a jamais regardé: `composition` absent, et `repairPlanComposition` qui
 * lève (dans un `catch` MUET).
 *
 * C'est exactement le mensonge que `V0-B` a effacé de 180 lignes le
 * 2026-08-21 (`drop default`, `drop not null`, `update … = null`), et que le
 * premier run réel aurait réécrit le lendemain. `composition_fill_weekly` l'a
 * lu six semaines de suite comme un sans-faute parfait.
 *
 * ── CE QUE CE FICHIER AFFIRME ─────────────────────────────────────────────
 *   ① NOMINAL — le remplissage a tourné → un NOMBRE, inchangé
 *   ② `composition` ABSENT             → `null`, `attempt` jamais appelé
 *   ③ le remplissage LÈVE              → `null`, index de base rendu intact
 *   ④ ⛔ LE CAS QUI DISCRIMINE — un ZÉRO RÉELLEMENT MESURÉ reste `0`.
 *      Sans lui, « rendre `null` partout » passerait ①②③ et détruirait la
 *      seule mesure qui compte.
 *   ⑤ L'ÉCHEC EST COMPTÉ — `onMiss` est appelé une fois, avec son motif.
 *      Un `console.warn` ne se compte pas: un remplissage qui lève en boucle
 *      ressemblait à un remplissage qui marche.
 *   ⑥ AUCUNE LANE NE REFABRIQUE LE ZÉRO — la garde de source.
 */

const EMPTY_INDEX = buildCompositionIndex([], []);
const OTHER_INDEX = buildCompositionIndex([], []);

const SHARES = { table: 0.75, promoted: 0, model: 0.25, group_bounds: 0 };
const sharesOf = (o: Record<string, number>) =>
  o as unknown as EnergySourceShares;

// ---------------------------------------------------------------------------
// ① NOMINAL — le chemin qui marchait doit continuer de marcher À L'IDENTIQUE
// ---------------------------------------------------------------------------

Deno.test("① nominal: le remplissage qui tourne écrit un NOMBRE", async () => {
  const misses: CompositionFillMiss[] = [];
  const { index, outcome } = await fillPlanComposition({
    baseIndex: EMPTY_INDEX,
    attempt: () =>
      Promise.resolve({
        index: OTHER_INDEX,
        unknowns: 7,
        shares: sharesOf(SHARES),
        counts: { requested: 3, answered: 2 },
      }),
    onMiss: (reason) => misses.push(reason),
  });

  assert(outcome.measured, "le plan est MESURÉ");
  assertEquals(outcome.unknowns, 7);
  assertEquals(outcome.shares, SHARES);
  assertEquals(outcome.counts, { requested: 3, answered: 2 });
  // L'index RÉPARÉ remonte, c'est toute la raison d'être de l'appel.
  assertStrictEquals(index, OTHER_INDEX);
  // Aucun motif d'échec: le compteur ne doit pas bouger sur un succès.
  assertEquals(misses, []);

  assertEquals(compositionFillColumns(outcome), {
    composition_unknowns: 7,
    composition_energy_sources: SHARES,
  });
});

// ---------------------------------------------------------------------------
// ② `composition` ABSENT — le premier des deux chemins qui mentaient
// ---------------------------------------------------------------------------

Deno.test("② index absent: `null`, et `attempt` n'est JAMAIS appelé", async () => {
  const misses: CompositionFillMiss[] = [];
  let attempts = 0;
  const { index, outcome } = await fillPlanComposition({
    baseIndex: null,
    attempt: () => {
      attempts += 1;
      throw new Error("ne doit pas être atteint");
    },
    onMiss: (reason) => misses.push(reason),
  });

  assertEquals(attempts, 0, "un index absent ne déclenche aucun appel modèle");
  assertEquals(outcome, { measured: false, reason: "no_index" });
  assertEquals(index, null);
  assertEquals(misses, ["no_index"]);

  // ⛔ LE CŒUR DU LOT: `null`, et surtout PAS `0` / `{}`.
  assertEquals(compositionFillColumns(outcome), {
    composition_unknowns: null,
    composition_energy_sources: null,
  });
});

// ---------------------------------------------------------------------------
// ③ LE REMPLISSAGE LÈVE — le second, et il était dans un `catch` muet
// ---------------------------------------------------------------------------

Deno.test("③ remplissage qui lève: `null`, index de base intact", async () => {
  const seen: { reason: CompositionFillMiss; message: string }[] = [];
  const boom = new Error("sas en panne");
  const { index, outcome } = await fillPlanComposition({
    baseIndex: EMPTY_INDEX,
    attempt: () => Promise.reject(boom),
    onMiss: (reason, error) =>
      seen.push({
        reason,
        message: error instanceof Error ? error.message : String(error),
      }),
  });

  assertEquals(outcome, { measured: false, reason: "threw" });
  // ⚠️ L'index de BASE remonte — exactement ce que faisait le `catch` des deux
  // lanes, qui laissait `composition` à sa valeur d'avant l'appel. Rendre
  // `null` ici ferait tomber tout l'aval pour une panne d'instrument.
  assertStrictEquals(index, EMPTY_INDEX);

  // ⑤ L'ÉCHEC EST COMPTÉ, une fois, avec son motif ET son message.
  assertEquals(seen, [{ reason: "threw", message: "sas en panne" }]);

  assertEquals(compositionFillColumns(outcome), {
    composition_unknowns: null,
    composition_energy_sources: null,
  });
});

// ---------------------------------------------------------------------------
// ④ ⛔ LE CAS QUI DISCRIMINE — sans lui, ② et ③ ne prouvent rien
// ---------------------------------------------------------------------------

Deno.test("④ un ZÉRO réellement mesuré reste `0`, jamais `null`", async () => {
  const { outcome } = await fillPlanComposition({
    baseIndex: EMPTY_INDEX,
    attempt: () =>
      Promise.resolve({
        index: EMPTY_INDEX,
        // Un plan dont TOUT résout: zéro inconnu. C'est le meilleur résultat
        // possible du lot 18, et c'est une MESURE.
        unknowns: 0,
        shares: sharesOf({ table: 1, promoted: 0, model: 0, group_bounds: 0 }),
        counts: { requested: 0, answered: 0 },
      }),
  });

  assert(outcome.measured);
  const columns = compositionFillColumns(outcome);
  assertEquals(columns.composition_unknowns, 0);
  // ⛔ ET IL N'EST PAS `null`. Un correctif qui rendrait `null` dès que le
  // compteur vaut zéro serait vert sur ①②③ et jetterait la seule mesure qui
  // dit que le sas a réussi.
  assert(
    columns.composition_unknowns !== null,
    "zéro mesuré n'est pas une absence de mesure",
  );
  // Et une part d'énergie vide MESURÉE reste un objet, pas `null`.
  const empty = compositionFillColumns({
    measured: true,
    unknowns: 0,
    shares: {},
    counts: {},
  });
  assertEquals(empty.composition_energy_sources, {});
  assert(empty.composition_energy_sources !== null);
});

// ---------------------------------------------------------------------------
// ⑥ LA GARDE DE SOURCE — aucune lane ne refabrique le zéro
// ---------------------------------------------------------------------------
//
// ⚠️ POURQUOI UNE GARDE NÉGATIVE ET PAS UNE POSITIVE. Le corps des deux lanes
// appartient à un chantier en cours; une assertion « la lane appelle
// `compositionFillColumns` » serait rouge sur tout arbre où ce chantier n'est
// pas là, et un test rouge par construction se désarme au premier `--filter`.
// Ce qu'on affirme est plus étroit et vrai partout: AUCUNE lane n'a le droit
// d'initialiser les compteurs de composition à un zéro qui ressemble à une
// mesure. C'est la forme littérale du défaut, et c'est elle qui doit ne jamais
// revenir.

const LANES = [
  "../../generate-meal-v1/index.ts",
  "../../generate-household-meal-v1/index.ts",
] as const;

/**
 * ⛔ LES COMMENTAIRES SONT RETIRÉS AVANT DE CHERCHER, et c'est une cicatrice
 * écrite du dépôt: « un audit d'appelants qui ne retire pas les commentaires
 * compte des faux vivants ». Ici le piège se retourne — les deux lanes CITENT
 * la forme du défaut dans le commentaire qui explique pourquoi elle est partie.
 * Un grep naïf rougirait sur l'explication du correctif.
 */
const withoutComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

Deno.test("⑥ aucune lane n'initialise les compteurs à un zéro mesuré", async () => {
  for (const lane of LANES) {
    const src = await Deno.readTextFile(new URL(lane, import.meta.url));
    const flat = withoutComments(src).replace(/\s+/g, " ");
    assert(
      !flat.includes("{ unknowns: 0, shares: {}, counts: {} }"),
      `${lane}: le zéro de départ est revenu — « pas mesuré » redevient « mesuré à zéro »`,
    );
    // Et le `catch` muet non plus: le motif doit être compté, pas seulement
    // écrit en clair dans un `console.warn`.
    assert(
      !flat.includes("] composition fill failed`, error)"),
      `${lane}: le catch muet est revenu — un échec non compté ne se voit pas`,
    );
  }
});
