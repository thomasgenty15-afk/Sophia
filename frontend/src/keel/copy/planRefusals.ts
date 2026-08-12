/**
 * L8 — LES REFUS NOMMÉS DU SERVEUR, ET LES MOTS QU'ILS DEVIENNENT À L'ÉCRAN.
 *
 * Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md.
 *
 * ── LA DETTE QUE CE FICHIER SOLDE ─────────────────────────────────────────
 * Chaque lot serveur a soigneusement NOMMÉ son refus, puis l'a laissé arriver
 * à l'écran comme un jeton brut. Écrit noir sur blanc dans le registre, lot
 * après lot:
 *
 *   · L1 — « `frontend/src/keel/api/mealGeneration.ts` ne mappe pas
 *     `household_frozen` — un secondaire de foyer gelé verra le jeton brut. »
 *   · L2 — `window_fully_away` · L3 — `all_members_have_own_plan`
 *   · L4/L5 — les onze refus de fusion et les six de défusion
 *   · L7 — « un maître verrait le jeton brut » pour `merge_quota_exhausted`
 *
 * Un refus muet se lit comme une PANNE, et quelqu'un qui croit à une panne
 * ouvre un ticket au lieu de faire le geste qu'on attend de lui.
 *
 * ── POURQUOI UN MODULE, ET PAS UN `switch` DANS CHAQUE ÉCRAN ──────────────
 * Les mêmes jetons sortent de DEUX fonctions edge et atteignent TROIS écrans
 * (le plan, le foyer, la proposition de fusion). Trois listes divergeraient,
 * et la divergence serait muette — c'est exactement le défaut mesuré sur
 * `flagReasons` en 2026-08-03: six codes sur huit tombaient dans le jeton brut
 * parce que le moteur avait été renommé d'un seul côté.
 *
 * Le module rend le fichier TESTABLE: `planRefusals.int.test.ts` lit les
 * sources des fonctions edge et exige une bijection. Un refus ajouté côté
 * serveur sans étiquette ici fait rougir la suite, au lieu de sortir en jargon
 * devant quelqu'un.
 *
 * ── UNE CLÉ, PAS UNE PHRASE ───────────────────────────────────────────────
 * On rend une `MessageKey` et l'appelant appelle `t()`. Une phrase écrite ici
 * serait une phrase dans une seule langue, hors du seul catalogue que la
 * parité surveille (leçon `optout-confirmation-hardcoded-french`).
 *
 * ⚠️ ON NE RÉÉCRIT AUCUNE PHRASE DU SERVEUR. Les fenêtres, les plafonds, les
 * dates et la phrase de proposition (`sentence`) sont calculés serveur et
 * rendus tels quels par l'écran. Ce module ne traduit qu'un VOCABULAIRE FERMÉ
 * de jetons — c'est-à-dire la seule chose qui ne porte aucune arithmétique.
 */

import type { MessageKey } from "../i18n/t";

/**
 * Les refus des deux fonctions edge de composition, par jeton.
 *
 * `Unauthorized` (401) n'a pas la forme des autres — il vient du portail JWT,
 * pas d'une règle produit — et il est traité comme les autres exprès: un jeton
 * qui arrive à l'écran doit avoir des mots, quelle que soit sa provenance.
 */
export const EDGE_REFUSAL_KEYS: Record<string, MessageKey> = {
  // ── LE PORTAIL ──────────────────────────────────────────────────────────
  Unauthorized: "plan.validate.error.not_authenticated",

  // ── LES GARDES DE FOYER (L1, D13) ───────────────────────────────────────
  household_frozen: "plan.refusal.household_frozen",
  no_household: "plan.refusal.no_household",
  not_owner: "plan.refusal.not_owner",
  empty_household: "plan.refusal.empty_household",

  // ── CE QU'IL FAUT AVOIR POSÉ AVANT DE COMPOSER ──────────────────────────
  goal_required: "plan.refusal.goal_required",
  no_coach: "plan.refusal.no_coach",
  local_day_unresolved: "plan.refusal.local_day_unresolved",

  // ── LA REQUÊTE ELLE-MÊME ────────────────────────────────────────────────
  window_required: "plan.refusal.window_required",
  bad_window: "plan.refusal.bad_window",
  unknown_intent: "plan.refusal.unknown_intent",
  replaces_required: "plan.refusal.replaces_required",
  mode_required: "plan.refusal.mode_required",
  pantry_required: "plan.refusal.pantry_required",
  unknown_operation: "plan.refusal.unknown_operation",

  // ── LA TABLE EST VIDE (L2, L3) ──────────────────────────────────────────
  window_fully_away: "plan.refusal.window_fully_away",
  all_members_have_own_plan: "plan.refusal.all_members_have_own_plan",

  // ── LA SÉCURITÉ, FAIL-CLOSED ────────────────────────────────────────────
  safety_constraints_unreadable: "plan.refusal.safety_constraints_unreadable",

  // ── CE QUI TOMBE APRÈS LE MODÈLE ────────────────────────────────────────
  // Chacune de ces phrases dit « ton plan précédent est intact », parce que
  // c'est vrai (le générateur n'écrit qu'à la toute fin) et parce que la
  // première peur devant un échec est d'avoir perdu la semaine.
  empty_meal: "plan.refusal.empty_meal",
  meal_unparseable: "plan.refusal.meal_unparseable",
  model_returned_tool_call: "plan.refusal.model_returned_tool_call",
  plan_not_written: "plan.refusal.plan_not_written",
  house_rule_violated: "plan.refusal.house_rule_violated",

  // ── LES ONZE REFUS DE FUSION (L4/D6, D15, D16) ──────────────────────────
  merge_member_required: "plan.refusal.merge_member_required",
  merge_member_not_in_household: "plan.refusal.merge_member_not_in_household",
  merge_member_is_owner: "plan.refusal.merge_member_is_owner",
  merge_member_has_no_plan: "plan.refusal.merge_member_has_no_plan",
  merge_no_household_plan: "plan.refusal.merge_no_household_plan",
  merge_windows_disjoint: "plan.refusal.merge_windows_disjoint",
  merge_window_all_past: "plan.refusal.merge_window_all_past",
  merge_window_unreadable: "plan.refusal.merge_window_unreadable",
  merge_plan_vanished: "plan.refusal.merge_plan_vanished",
  merge_member_away_all_window: "plan.refusal.merge_member_away_all_window",
  // L7/D11 — le seul refus dont la phrase dit AUSSI quand ça repart. Le
  // serveur porte la date dans `detail` et dans `merge_quota.resets_on`; la
  // ligne d'ici ne la recalcule pas, elle dit que rien n'est perdu.
  merge_quota_exhausted: "plan.refusal.merge_quota_exhausted",

  // ── LES SIX REFUS DE DÉFUSION (L5/D8) ───────────────────────────────────
  unmerge_member_required: "plan.refusal.unmerge_member_required",
  unmerge_member_not_in_household: "plan.refusal.unmerge_member_not_in_household",
  unmerge_member_is_owner: "plan.refusal.unmerge_member_is_owner",
  unmerge_member_not_merged: "plan.refusal.unmerge_member_not_merged",
  unmerge_window_all_past: "plan.refusal.unmerge_window_all_past",
  unmerge_window_unreadable: "plan.refusal.unmerge_window_unreadable",
};

/**
 * La clé d'un refus de fonction edge, ou `null` s'il n'en a pas.
 *
 * R7 — `null` PLUTÔT QU'UNE PHRASE PASSE-PARTOUT. L'appelant affiche alors le
 * jeton tel quel: un utilisateur qui lit `some_new_token` peut le rapporter,
 * un utilisateur qui lit « une erreur est survenue » ne peut rien. Et le
 * silence force à ajouter l'étiquette au lieu de la tolérer — c'est la même
 * discipline que `householdErrorText` et `inviteErrorText`.
 */
export function edgeRefusalKey(reason: string): MessageKey | null {
  return EDGE_REFUSAL_KEYS[reason.trim()] ?? null;
}

/**
 * LES REFUS DE `keel_validate_meal_plan` — la gâchette de la prise de main.
 *
 * ⚠️ `already: true` N'EST PAS ICI, ET C'EST LE POINT. La RPC est idempotente
 * sous concurrence (mesuré le 2026-08-11: quatre appels simultanés, une seule
 * écriture) et rend `{ok: true, already: true}` quand le plan était déjà
 * validé. Le ranger parmi les refus ferait paniquer sur un double-clic.
 */
export const VALIDATION_REFUSAL_KEYS: Record<string, MessageKey> = {
  not_authenticated: "plan.validate.error.not_authenticated",
  not_your_plan: "plan.validate.error.not_your_plan",
  plan_retired: "plan.validate.error.plan_retired",
  not_a_personal_plan: "plan.validate.error.not_a_personal_plan",
};

export function validationRefusalKey(reason: string): MessageKey | null {
  return VALIDATION_REFUSAL_KEYS[reason.trim()] ?? null;
}

/**
 * POURQUOI UNE BOUCHE N'A PAS DE PROPOSITION (`skipped[]` du lecteur).
 *
 * Ces motifs ne sont pas des erreurs: ce sont les réponses à « pourquoi Zoé
 * n'apparaît-elle pas ? ». Sans eux, la question n'a de réponse que dans une
 * base de production — c'est le mot du serveur, en toutes lettres.
 */
export const MERGE_SKIP_KEYS: Record<string, MessageKey> = {
  member_is_owner: "household.merge.skip.member_is_owner",
  no_validated_plan: "household.merge.skip.no_validated_plan",
  proposals_muted: "household.merge.skip.proposals_muted",
  dismissed_by_owner: "household.merge.skip.dismissed_by_owner",
  already_merged: "household.merge.skip.already_merged",
  merge_quota_exhausted: "household.merge.skip.merge_quota_exhausted",
};

export function mergeSkipKey(reason: string): MessageKey | null {
  return MERGE_SKIP_KEYS[reason.trim()] ?? null;
}

/**
 * LES REFUS DES DEUX RPC DE RÉGLAGE (D17 et « refuser » de D8).
 *
 * Les motifs partagés avec les autres RPC de foyer (`not_owner`,
 * `not_a_member`, `no_household`…) restent traduits par `householdErrorText`,
 * qui est la liste fermée de cet écran-là: les dédoubler ici ferait deux
 * phrases pour un même mot.
 */
export const MERGE_SETTING_REFUSAL_KEYS: Record<string, MessageKey> = {
  muted_required: "household.merge.error.muted_required",
  validated_at_required: "household.merge.error.validated_at_required",
  member_is_owner: "household.merge.error.member_is_owner",
  no_validated_plan: "household.merge.error.no_validated_plan",
  notice_moved_on: "household.merge.error.notice_moved_on",
};

export function mergeSettingRefusalKey(reason: string): MessageKey | null {
  return MERGE_SETTING_REFUSAL_KEYS[reason.trim()] ?? null;
}
