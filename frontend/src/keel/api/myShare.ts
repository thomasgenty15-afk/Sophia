/**
 * LA PART DU RÉCLAMÉ — QUELLE LIGNE DE `member_portions` EST LA MIENNE.
 *
 * Contrat: `scratchpad/PLAN-ECRAN-DEMANDE-CONTRAT.md` §4.5 et §2.1 arbitrage n°5.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ON NE GÉNÈRE RIEN. LA PART EXISTE DÉJÀ, ET DEPUIS TOUJOURS.
 *
 * Le plan du foyer porte `member_portions`: un objet PAR BOUCHE, calculé sur
 * SES données (corps, objectif résolu, allergies, rythme). « Créer le plan du
 * compte réclamé en prenant ses datas » est donc déjà fait à chaque
 * composition — ce qui manquait n'est pas un calcul, c'est un ÉCRAN. Ce module
 * ne compose rien, n'appelle aucun modèle, n'écrit rien: il CHOISIT une ligne.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI IL N'Y A PAS DE LECTEUR ICI ──────────────────────────────────
 * Le plan du foyer se lit par `loadHouseholdMeal` (`api/household.ts:1251`),
 * qui existe, qui filtre `plan_kind='household'`, et que `/app/plan` appelle
 * DÉJÀ (`StudentWeekPlanPage.tsx:1168`). Écrire ici une seconde requête sur
 * `student_generated_meals` ferait:
 *   1. un second lecteur de la même ligne, donc deux vérités possibles à
 *      l'écran — c'est le défaut que `household_plan_kind_readers_test.ts`
 *      scanne, et il a déjà mordu DEUX fois le 2026-08-12;
 *   2. un aller-réseau en double sur le chemin nominal.
 * Ce module n'a donc AUCUNE I/O et n'apparaît pas dans la liste `READERS` de
 * ce test: y inscrire un fichier sans requête le ferait échouer
 * (`offsets.length > 0`, `household_plan_kind_readers_test.ts:63`).
 *
 * ⚠️ `household_id is not null` NE VEUT PAS DIRE « PLAN DU FOYER ». Un plan
 * PERSONNEL le porte aussi — `generate-meal-v1` l'estampe exprès pour que la
 * fusion le retrouve. Seul `plan_kind` dit la nature. Vérifié en base le
 * 2026-08-13 sur le foyer « Bramble »: trois lignes `personal` y portent le
 * même `household_id` que les trois lignes `household`. Si un jour ce module
 * gagne une requête, elle doit porter `.eq("plan_kind", "household")` et le
 * fichier doit rejoindre `READERS`.
 *
 * PURE MODULE: aucune I/O, aucune horloge, aucun aléa, aucun `t()`.
 */

import type { MemberPortionView } from "./household";

/**
 * LA PART QU'ON A LE DROIT DE MONTRER À QUELQU'UN, une fois qu'on la tient.
 *
 * ⚠️ C'EST UNE GARDE D'IDENTITÉ, PAS UNE COMMODITÉ. « Jamais la part d'un
 * autre dans sa carte à lui »: une carte titrée « Ta part » qui rend la ligne
 * de quelqu'un d'autre ne se voit pas — les deux lignes ont exactement la même
 * forme, et une instruction de service est plausible pour n'importe qui. La
 * seule chose qui les distingue est `member_id`, donc on le compare.
 *
 * ⚠️ `meMemberId` EST REQUIS, ET `null` FERME. Tant que la place n'a pas été
 * lue, on ne SAIT pas de qui est la ligne qu'on tient: se taire est la seule
 * réponse juste. Un défaut permissif ici afficherait la part d'un autre
 * pendant le temps d'un chargement, ce qui suffit à la lire.
 */
export function sharePresentedTo(input: {
  /** La ligne qu'on tient. `null` = rien à montrer. */
  mine: MemberPortionView | null;
  /** MA bouche. REQUIS. `null` = on ne sait pas encore, donc on se tait. */
  meMemberId: string | null;
}): MemberPortionView | null {
  if (!input.meMemberId) return null;
  if (!input.mine) return null;
  if (input.mine.memberId !== input.meMemberId) return null;
  return input.mine;
}

/**
 * MA LIGNE DANS LES `member_portions` D'UN PLAN DE FOYER — ou `null`.
 *
 * C'est la fonction du SITE DE MONTAGE: lui seul connaît la place (`isOwner`),
 * la carte ne la connaît pas.
 *
 * ⚠️ `isOwner` EST UNE MOITIÉ DE LA RÈGLE, PAS UNE PRÉCAUTION. Le maître A une
 * ligne dans `member_portions` — il est une bouche comme les autres, et sa part
 * est calculée comme celle des autres. Mais il n'a pas « une part » à valider:
 * IL A LE PLAN. Lui rendre une carte « Ta part / Je valide » sous le formulaire
 * qu'il vient d'envoyer lui demanderait de valider son propre geste. C'est la
 * ligne 7 du tableau de §1.2 du contrat, mot pour mot: « le maître n'a pas une
 * part: il a le plan ».
 *
 * ⚠️ AUCUN PARAMÈTRE OPTIONNEL. Un appelant qui ne sait pas s'il est maître ne
 * doit pas hériter de `false`: `false` est une AFFIRMATION. Cicatrice du dépôt
 * — « paramètre de garde optionnel = garde désarmée ».
 */
export function selectMyShare(input: {
  /** Les `member_portions` du plan du foyer. `[]` = le plan n'en porte aucune. */
  portions: readonly MemberPortionView[];
  /** MA bouche. REQUIS. */
  meMemberId: string | null;
  /** Suis-je le maître du foyer ? REQUIS. */
  isOwner: boolean;
}): MemberPortionView | null {
  if (input.isOwner) return null;
  if (!input.meMemberId) return null;
  const found = input.portions.find((p) => p.memberId === input.meMemberId) ?? null;
  // ON REPASSE PAR LA GARDE D'IDENTITÉ plutôt que de rendre `found` tel quel:
  // la règle « jamais la part d'un autre » vit à UN endroit, et les deux
  // chemins qui la respectent la lisent au même endroit.
  return sharePresentedTo({ mine: found, meMemberId: input.meMemberId });
}
