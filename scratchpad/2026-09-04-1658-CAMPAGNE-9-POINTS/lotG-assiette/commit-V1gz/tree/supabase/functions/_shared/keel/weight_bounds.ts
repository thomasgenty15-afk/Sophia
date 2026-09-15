/**
 * LES BORNES DE PLAUSIBILITÉ D'UN POIDS — UNE SEULE DÉCLARATION, POUR TOUT LE
 * BACK.
 *
 * Lot `X1′`. Ce module n'existe que pour une raison: avant lui, le refus d'un
 * poids aberrant était déclaré QUATRE fois dans `_shared/keel/`, et il avait
 * DÉJÀ divergé.
 *
 * ── LA DIVERGENCE, MESURÉE LE 2026-08-22 ────────────────────────────────────
 *     weekly_flow.ts:92-93        25 / 400
 *     energy_target.ts:213-214    25 / 400   (préfixe TARGET_)
 *     weight_pace.ts:588-589      25 / 400   (préfixe TARGET_)
 *     student_body_io.ts:88-89    25 / 350   ← LA COPIE QU'ON REGARDE LE MOINS
 *
 * Et les trois commentaires qui l'entouraient affirmaient tous le contraire de
 * ce que le code faisait:
 *   · `weight_pace.ts` : « Recopiées ici, elles se mettraient à diverger;
 *     importées, elles restent le même refus » — puis recopie.
 *   · `student_body_io.ts` : « Bornes de plausibilité, alignées sur celles du
 *     formulaire hebdo » — le formulaire hebdo porte 400, ce fichier portait
 *     350. Le commentaire n'était pas approximatif, il était FAUX.
 *
 * ── CE QUE LE 350 COÛTAIT, ET CE N'EST PAS UNE QUESTION DE GOÛT ─────────────
 * La base ACCEPTE 400: `student_body_measures_value_in_range`
 * (`20260810090000`) borne la pesée à 25-400, `student_goals` et
 * `household_members` bornent la cible à 25-400, et six gardes de RPC recopient
 * les mêmes nombres. Le formulaire du dimanche accepte 400. Une pesée de 360 kg
 * était donc SAISIE, ACCEPTÉE et ÉCRITE — puis rendue INVISIBLE au seul lecteur
 * qui la relit (`student_body_io`), sans un mot. Le trou n'était pas « deux
 * nombres différents », c'était une ligne écrite que personne ne relit.
 *
 * ── LA VALEUR TRANCHÉE: 400 ─────────────────────────────────────────────────
 * Décision §⑥ n° 25 du plan du 2026-08-21: « une seule valeur : 400, cohérente
 * avec `TARGET_WEIGHT_KG_MAX` ». C'est la valeur de la BASE, du formulaire et
 * de trois des quatre porteurs. Aligner sur 350 aurait demandé de resserrer six
 * contraintes `check` sur des lignes déjà écrites.
 *
 * ── CE QUE CES BORNES NE SONT PAS ───────────────────────────────────────────
 * Un jugement sur un corps. Elles attrapent une faute de frappe et une unité
 * mal lue, rien d'autre — volontairement larges. HORS BORNES = REFUSÉ ET NOMMÉ,
 * jamais ramené au bord: un 500 kg ramené à 400 produit une donnée fausse qui a
 * l'air vraie, et c'est pire qu'une case vide. `restriction_guard` JETTE
 * au-delà de 20-500 kg; ces bornes-ci sont strictement à l'intérieur, donc
 * aucune valeur acceptée ici ne peut faire jeter la ceinture en aval.
 *
 * ── LA COPIE QUI RESTE, ET ELLE EST NOMMÉE ──────────────────────────────────
 * `body_measure_floor.ts` porte `BODY_MEASURE_BOUNDS.weight_kg_max = 350`. Ce
 * module est un PLANCHER DE SÉCURITÉ déclaré (il arme `restriction_guard`), et
 * `X1′` ne réécrit pas une ligne de sécurité. La divergence y est donc GARDÉE,
 * FICHÉE (`X1′-a`) et ASSERTÉE dans `weight_bounds_test.ts` — pas silencieuse.
 *
 * ── LES TROIS COPIES DU FRONT ───────────────────────────────────────────────
 * Le front est en Vite/TS, le back en Deno: aucun import n'est possible entre
 * les deux runtimes, donc `api/weeklyCheckIn.ts`, `api/bodyMeasures.ts` et
 * `lib/weekInFood.ts` recopient ces nombres. La copie est assumée; ce qui ne
 * l'est pas, c'est qu'elle dérive. `weight_bounds_test.ts` les lit sur le
 * disque et compare.
 *
 * PURE MODULE : no I/O, no clock, no randomness.
 */

/** Poids minimal plausible, en kilogrammes. */
export const WEIGHT_KG_MIN = 25;

/** Poids maximal plausible, en kilogrammes. */
export const WEIGHT_KG_MAX = 400;
