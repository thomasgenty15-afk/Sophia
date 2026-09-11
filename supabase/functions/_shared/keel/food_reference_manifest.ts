/**
 * LOT A — LE MANIFESTE DE VALIDATION DU RÉFÉRENTIEL (2026-09-11).
 *
 * Chantier: `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/CHANTIER.md` § Lot A.
 * Preuves: `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/lotA-audit.json`.
 *
 * ── LA QUESTION À LAQUELLE CE FICHIER RÉPOND ──────────────────────────────
 * « Cette ligne du référentiel a-t-elle le droit de servir à COMPOSER un
 * repas ? » — et pas « d'où vient-elle ». Les deux se confondaient: une ligne
 * qui dit `source = 'ciqual'` passait pour vérifiée, et l'enquête du
 * 2026-09-11 a montré que non. `pear` disait `ciqual`, portait le code 20039 et
 * les cinq macronutriments du POIREAU.
 *
 * ⛔ LE SEUL CHAMP `source = 'ciqual'` NE DONNE PAS `verifie`, ET L'ABSENCE DE
 * CODE NE LE RETIRE PAS NON PLUS. Mesuré le 2026-09-11 sur les 943 lignes de
 * la base locale: 881 disent `ciqual`, et **689 d'entre elles n'ont AUCUN
 * `ciqual_code`** (elles viennent de `20260812090000_ciqual_full_import.sql`,
 * qui n'a pas importé la colonne). Exiger un code pour être « vérifié »
 * supprimerait les trois quarts du référentiel: le produit ne composerait plus
 * rien. Ces 689 lignes ne sont pas FAUSSES, elles sont NON TRAÇABLES — on ne
 * peut pas les confronter à la source ANSES, il n'y a rien à joindre.
 *
 * ── LA RÈGLE, ET OÙ VIVENT SES EXCEPTIONS ─────────────────────────────────
 * La règle est ICI, dans le code, et elle tient en une ligne: une estimation
 * de MODÈLE n'est pas vérifiée, tout le reste l'est par défaut. Les
 * exceptions sont NOMMÉES, une par une, dans les colonnes `validation_*` de
 * `food_composition_refs` (migration `20260911*`), lues par
 * `food_composition_io.ts`. Une exception porte son état, sa raison et sa date:
 * sans les trois, la contrainte SQL refuse la ligne.
 *
 * ── LA PORTE EST À LA COMPOSITION, PAS À LA MESURE (arbitrage ② du socle) ──
 * `resolveIngredient` continue de résoudre et de rendre l'état dans la
 * référence. Mesurer un plan déjà écrit reste possible et reste honnête — sans
 * quoi on ne pourrait plus relire ce qu'on a servi. Ce qui est refusé sans
 * échappatoire, c'est ① une référence non `verifie` dans le catalogue montré au
 * modèle et ② un identifiant non `verifie` accepté par le parseur d'une
 * génération neuve. Les deux sont le LOT C; ce fichier leur donne le prédicat.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { CompositionRef } from "./food_composition.ts";

/** L'état de validation d'une référence du référentiel. */
export type RefValidation = "verifie" | "a_verifier" | "rejete";

/** Le vocabulaire FERMÉ, pour la contrainte SQL et pour les lecteurs. */
export const REF_VALIDATIONS = ["verifie", "a_verifier", "rejete"] as const;

/**
 * LA RÈGLE PAR DÉFAUT, PAR PROVENANCE.
 *
 * ⛔ `sas`, `model` et `group_bounds` sont les trois provenances où AUCUN
 * humain n'a lu la ligne: le sas promeut ce qu'un modèle a écrit après trois
 * observations, `model` est l'appel de secours du plan courant, `group_bounds`
 * est le MILIEU d'une bande de groupe. Le chantier le dit en toutes lettres:
 * « une estimation modèle » n'est pas admissible à la composition.
 *
 * `ciqual` et `manual` sont le référentiel HUMAIN — une mesure ANSES ou une
 * entrée curée à la main. `verifie` par défaut, et les lignes qu'on sait
 * abîmées sont retirées NOMMÉMENT par la table d'exceptions, jamais par une
 * règle qui en emporterait 689 au passage.
 */
export function defaultValidationFor(source: CompositionRef["source"]): RefValidation {
  return source === "sas" || source === "model" || source === "group_bounds"
    ? "a_verifier"
    : "verifie";
}

/**
 * L'état d'une référence.
 *
 * ⚠️ `ref.validation` ABSENT N'EST PAS UNE GARDE DÉSARMÉE, et la distinction
 * est tout le contrat de cette fonction. Le champ porte l'EXCEPTION lue en
 * base; son absence veut dire « aucune exception pour cette ligne », donc la
 * règle s'applique. Une référence fabriquée à la main (un test, une ligne
 * remplie par `composition_fill` en cours de plan) reçoit donc l'état que sa
 * provenance mérite, et pas un `verifie` de complaisance.
 *
 * ⛔ C'EST LE SEUL CHEMIN DE LECTURE. Personne ne lit `ref.validation` en
 * direct — même raison que `yieldFactorOf(ref)` face à `ref.yieldFactor`: un
 * lecteur direct rate le repli et rend un état que la règle n'a pas produit.
 */
export function validationOf(ref: CompositionRef): RefValidation {
  return ref.validation ?? defaultValidationFor(ref.source);
}

/**
 * Vrai seulement pour `verifie`. C'est la porte de la COMPOSITION.
 *
 * ⛔ ET SEULEMENT DE LA COMPOSITION. L'employer pour filtrer une MESURE
 * rendrait un plan déjà servi illisible — c'est-à-dire qu'on effacerait la
 * trace d'un défaut au lieu de la lire. Arbitrage ② du socle.
 */
export function isComposable(ref: CompositionRef): boolean {
  return validationOf(ref) === "verifie";
}

/**
 * LES RÉFÉRENCES NON VÉRIFIÉES D'UNE MESURE, NOMMÉES.
 *
 * ⛔ « Compté et nommé, jamais silencieux » (arbitrage ② du socle). Un simple
 * booléen « il y en avait » ne dit pas LESQUELLES, et une mesure qui s'appuie
 * sur trois lignes `a_verifier` ne se distingue alors pas d'une mesure propre.
 * La sortie est triée pour qu'un diff de deux mesures soit lisible.
 */
export function unverifiedSlugs(refs: readonly CompositionRef[]): string[] {
  const out = new Set<string>();
  for (const r of refs) if (!isComposable(r)) out.add(r.slug);
  return [...out].sort();
}
