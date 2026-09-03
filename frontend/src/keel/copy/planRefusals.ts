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
  // ── C2 · CE QUI SE DÉCIDE AVANT LE MODÈLE, ET QUI SE PAYAIT APRÈS ────────
  // Les deux sont NEUFS côté serveur et tous deux mesurés en HTTP réel:
  // `window_beyond_this_week` remplace un `422 empty_meal` à 6,2 s (les jetons
  // de jour ne vont pas au-delà de dimanche), et `plan_overlaps_existing`
  // reprend MOT POUR MOT le refus de `write_student_meal_plan` — celui que la
  // fusion payait 16,1 s avant que L10 ne le ferme de son côté.
  window_beyond_this_week: "plan.refusal.window_beyond_this_week",
  plan_overlaps_existing: "plan.refusal.plan_overlaps_existing",
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

  // ── LE BROUILLON (`intent: "draft"`) ────────────────────────────────────
  //
  // ⚠️ CES DEUX-LÀ SONT POSÉS AVANT QUE LE SERVEUR NE LES RENDE, ET C'EST UN
  // CHOIX D'ORDRE, PAS UN OUBLI. La liste des jetons de refus est FERMÉE et
  // elle est écrite d'un seul geste, ici, pour que personne d'autre n'ouvre ce
  // fichier ensuite. Le prix est connu et borné: tant que les deux générateurs
  // n'émettent pas `draft_not_composed` et `note_unusable`, le cas
  // « n'invente aucun jeton que le serveur ne rend pas » de
  // `planRefusals.int.test.ts` les compte comme orphelins et rougit.
  //
  // L'ordre inverse coûtait plus cher: le jeton arrivé côté serveur en premier
  // fait rougir « couvre chaque jeton », et le seul fichier qui puisse fermer
  // ce rouge n'appartient alors à personne. Un rouge qui a un propriétaire et
  // une date vaut mieux qu'un rouge qui n'en a pas.
  draft_not_composed: "plan.refusal.draft_not_composed",
  note_unusable: "plan.refusal.note_unusable",

  // ── CE QUI TOMBE APRÈS LE MODÈLE ────────────────────────────────────────
  // Chacune de ces phrases dit « ton plan précédent est intact », parce que
  // c'est vrai (le générateur n'écrit qu'à la toute fin) et parce que la
  // première peur devant un échec est d'avoir perdu la semaine.
  empty_meal: "plan.refusal.empty_meal",
  meal_unparseable: "plan.refusal.meal_unparseable",
  model_returned_tool_call: "plan.refusal.model_returned_tool_call",
  plan_not_written: "plan.refusal.plan_not_written",
  plan_adoption_timed_out: "plan.refusal.plan_adoption_timed_out",
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
 * `not_a_member`, `no_household`…) ne sont PAS dédoublés ici: ils vivent une
 * seule fois, dans `HOUSEHOLD_REFUSAL_KEYS`, et les deux écrans les atteignent
 * par les chaînes composées du bas de ce fichier. Deux tables feraient deux
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

/**
 * LES REFUS DES RPC DE FOYER — la liste que `/app/household` portait SEUL.
 *
 * ⚠️ ELLE A DÉMÉNAGÉ ICI, ET C'EST LE CORRECTIF DE D2. Elle vivait dans un
 * `switch` privé de `HouseholdPage.tsx`, donc inatteignable depuis la carte de
 * proposition — qui reçoit pourtant les MÊMES motifs, puisque les deux RPC de
 * réglage refusent `not_a_member` et `not_authenticated` comme toutes les
 * autres. Mesuré deux fois en HTTP réel: le maître lisait `not_a_member`, mot
 * pour mot, sur la carte. Un commentaire de ce fichier affirmait le contraire
 * (« restent traduits par `householdErrorText` »): c'était vrai d'un écran et
 * faux de l'autre, et un commentaire qui ment coûte plus cher qu'un silence.
 *
 * `not_authenticated` — le jeton des deux RPC quand `auth.uid()` est NULL —
 * pointe sur la MÊME phrase que `Unauthorized`, le jeton du portail edge. Un
 * seul fait (« la session ne vaut plus »), une seule phrase, deux vocabulaires.
 */
export const HOUSEHOLD_REFUSAL_KEYS: Record<string, MessageKey> = {
  bad_first_name: "household.error.bad_first_name",
  bad_birth_date: "household.error.bad_birth_date",
  bad_goal: "household.error.bad_goal",
  bad_label: "household.error.bad_label",
  bad_away: "household.error.bad_away",
  // Les habitudes d'une bouche (spec du 2026-08-14, §G2). `not_a_member`,
  // `not_your_line` et `not_authenticated` sont DÉJÀ dans cette table et ne
  // sont pas dédoublés: la RPC des habitudes refuse avec les mêmes mots que
  // toutes les autres RPC de foyer.
  bad_slots: "household.error.bad_slots",
  bad_note: "household.error.bad_note",
  // ── LE RÉGIME D'UNE BOUCHE (spec du 2026-08-14, R3) ─────────────────────
  // EN LITTÉRAL, jamais dans un ternaire: ce fichier est scanné par
  // `planRefusals.int.test.ts`, qui ne lit QUE les littéraux — un motif calculé
  // devient orphelin en silence, et ce dépôt l'a déjà payé.
  bad_diet: "household.error.bad_diet",
  // ⚠️ `has_account` MANQUAIT DÉJÀ, ET IL N'ÉTAIT PAS ORPHELIN PAR HASARD:
  // `keel_household_set_member_goal` le rend depuis D1, mais l'écran masque le
  // contrôle pour une bouche qui a un compte, donc personne ne l'avait jamais
  // vu. Le régime suit la même règle d'affichage — et un motif qu'on ne peut
  // pas traduire finit toujours par arriver en jeton nu le jour où un chemin
  // change. On le nomme maintenant qu'une seconde RPC le rend.
  has_account: "household.error.has_account",
  household_full: "household.error.household_full",
  not_owner: "household.error.not_owner",
  not_a_member: "household.error.not_a_member",
  not_your_line: "household.error.not_your_line",
  no_household: "household.error.no_household",
  cannot_remove_owner: "household.error.cannot_remove_owner",
  cannot_detach_owner: "household.error.cannot_detach_owner",
  not_claimed: "household.error.not_claimed",
  not_found: "household.error.not_found",
  // ── LE CORPS D'UNE BOUCHE, ET LA PERSONNE DE RÉFÉRENCE (L5-B, 2026-08-18) ─
  //
  // ⛔ HUIT JETONS QUI ARRIVAIENT NUS À L'ÉCRAN. Les phrases existaient toutes
  // dans les deux packs (sauf `bad_activity_level`, ajouté avec elles); c'est
  // la TABLE qui ne les nommait pas, donc `householdErrorKey` rendait `null` et
  // l'écran affichait « bad_height » mot pour mot. `planRefusals.int.test.ts`
  // le disait déjà en rouge — « chaque `household.error.*` écrit dans `en.ts`
  // doit rester atteignable » — et personne n'avait relié le rouge au symptôme.
  //
  // ⚠️ CE N'EST PAS UN TROU THÉORIQUE DEPUIS LE POP-UP « UNE BOUCHE ». La
  // marche 2 de `persistMouth` EST `keel_household_set_member_body`: le bloc 3
  // réclame taille/poids/sexe/cran, et `submitIsHeld` vérifie leur PRÉSENCE,
  // jamais leurs bornes. Une taille de 999 passe la fenêtre et revient en
  // `bad_height` — c'est-à-dire, avant ce correctif, en jeton brut posé sous un
  // formulaire d'accueil.
  body_incomplete: "household.error.body_incomplete",
  bad_height: "household.error.bad_height",
  bad_weight: "household.error.bad_weight",
  bad_gender: "household.error.bad_gender",
  bad_activity_level: "household.error.bad_activity_level",
  bad_day_activity: "household.error.bad_day_activity",
  bad_sport_frequency: "household.error.bad_sport_frequency",
  bad_appetite: "household.error.bad_appetite",
  // ── ③ LES JOURS DE TRADITION (20260820160000) ────────────────────────────
  // ⚠️ EN LITTÉRAL, comme leurs voisins: ce fichier est scanné par
  // `planRefusals.int.test.ts`, qui ne lit QUE les littéraux — un motif calculé
  // devient orphelin en silence (cicatrice « la garde des refus ne lit que les
  // littéraux »).
  bad_weekday: "household.error.bad_weekday",
  bad_slot: "household.error.bad_slot",
  empty_label: "household.error.empty_label",
  label_too_long: "household.error.label_too_long",
  too_many_traditions: "household.error.too_many_traditions",
  // Les trois de `keel_household_set_reference_member` — même défaut, même
  // remède, et ils sont ANTÉRIEURS au pop-up (FF-043).
  minor_cannot_be_reference: "household.error.minor_cannot_be_reference",
  age_unknown_cannot_be_reference:
    "household.error.age_unknown_cannot_be_reference",
  not_your_household: "household.error.not_your_household",
  // ── LE POIDS VISÉ ET LE RYTHME D'UNE BOUCHE (L5, migration 20260818190000) ─
  // EN LITTÉRAL, jamais dans un ternaire: ce fichier est scanné par
  // `planRefusals.int.test.ts`, qui ne lit QUE les littéraux — un motif calculé
  // devient orphelin en silence.
  //
  // ⚠️ CES QUATRE-LÀ NE SONT PAS DÉCORATIFS, contrairement à `has_account` en
  // son temps: le pop-up « une bouche » RETIENT son bouton sur un poids visé
  // refusé, mais il ne connaît pas `goal` tel qu'il est EN BASE — la marche
  // précédente vient de l'écrire, et une seconde fenêtre ouverte a pu changer
  // la direction entre-temps. `target_needs_direction` est donc atteignable
  // par une course, pas seulement par un appel direct de la RPC.
  target_incomplete: "household.error.target_incomplete",
  bad_target_weight: "household.error.bad_target_weight",
  bad_pace: "household.error.bad_pace",
  target_needs_direction: "household.error.target_needs_direction",
  // ── S4 (`20260822041500`) · AUCUN OBJECTIF DE POIDS SUR UN MINEUR ────────
  // EN LITTÉRAL, comme leurs voisins: ce fichier est scanné par
  // `planRefusals.int.test.ts`, qui ne lit QUE les littéraux.
  //
  // ⚠️ NÉS LE 2026-08-22 SUR LES QUATRE PORTES, ARRIVÉS EN JETON BRUT PENDANT
  // DOUZE JOURS. `goal_not_for_minor` est rendu par l'ajout, par la direction
  // ET par la date (le détour temporel: poser une date de mineur sur une ligne
  // qui porte `fat_loss`); `target_not_for_minor` par la cible chiffrée. Depuis
  // le 2026-09-03 (chantier P3) l'écran ne propose plus à un mineur que
  // « Manger normalement » et plie une direction héritée AVANT d'écrire la
  // date — ces deux phrases restent la ceinture pour une course entre deux
  // onglets, et pour un appel direct de la RPC. La phrase nomme le remède que
  // la migration désigne (retirer la direction, puis poser la date), pas un
  // verdict sur un corps: registre éducatif, PIVOT-FOYER §8.4.
  goal_not_for_minor: "household.error.goal_not_for_minor",
  target_not_for_minor: "household.error.target_not_for_minor",
  // ── LA RÉPONSE HEBDOMADAIRE DU DÉJEUNER (L6, RPC de L3, 20260818120000) ───
  // EN LITTÉRAL, jamais dans un ternaire: ce fichier est scanné par
  // `planRefusals.int.test.ts`, qui ne lit QUE les littéraux.
  //
  // ⚠️ `not_adult` EST ATTEIGNABLE MALGRÉ LE FILTRE DE L'ÉCRAN, et c'est
  // précisément le genre de motif qu'on croit décoratif. La carte ne pose la
  // question qu'aux `adult` du roster, mais une date de naissance peut changer
  // dans un second onglet entre le rendu et le clic — et l'âge inconnu tombe
  // dans le MÊME refus. Un jeton nu sous un formulaire d'accueil est
  // exactement le défaut que L5-B a fermé sur huit autres.
  bad_work_lunch: "household.error.bad_work_lunch",
  not_adult: "household.error.not_adult",
  too_many_away: "household.error.too_many_away",
  // Le refus que `persistMouth` fabrique lui-même quand la porte d'ajout rend
  // `ok: true` SANS `member_id`. Les cinq marches suivantes viseraient alors la
  // chaîne vide — cinq `not_a_member` au lieu d'une cause.
  no_member_id: "household.error.no_member_id",
  not_authenticated: "plan.validate.error.not_authenticated",
};

export function householdRefusalKey(reason: string): MessageKey | null {
  return HOUSEHOLD_REFUSAL_KEYS[reason.trim()] ?? null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES CHAÎNES — UN SEUL APPEL PAR SITE, ET LE TEST TESTE LA MÊME CHOSE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chaque écran regarde plusieurs tables, dans un ordre qui lui est propre: la
 * carte de proposition reçoit des refus de fonction edge ET des refus de RPC,
 * `/app/household` l'inverse. Cet ordre EST la décision d'affichage — la
 * recopier dans un test en ferait deux exemplaires, dont un seul serait
 * exécuté par un utilisateur. Le dépôt a déjà payé ce patron (« un test
 * paramétré par sa propre constante reste vert quand on change la constante »).
 *
 * D'où trois fonctions publiques: l'écran en appelle une, le test appelle la
 * MÊME. Un ordre changé sans le vouloir se voit alors dans la suite.
 *
 * R7 tient partout: quand aucune table ne connaît le jeton, on rend `null` et
 * l'appelant affiche le jeton tel quel. Un mot inconnu se rapporte; « une
 * erreur est survenue » ne se rapporte pas.
 */

/**
 * `/app/household` — la liste du foyer d'abord, les réglages de fusion ensuite.
 *
 * L'ordre compte: `member_is_owner` et `no_validated_plan` n'existent QUE dans
 * la table de réglage, et les motifs de foyer ont leur phrase à eux depuis bien
 * avant la fusion.
 */
export function householdErrorKey(reason: string): MessageKey | null {
  return householdRefusalKey(reason) ?? mergeSettingRefusalKey(reason);
}

/**
 * LA CARTE DE PROPOSITION, pour un GESTE refusé (fusion, défusion, « refuser »).
 *
 * Les refus de fonction edge d'abord: la carte parle de composition, et
 * `not_owner` y veut dire « le serveur a refusé ce geste-là », pas « tu n'es
 * pas maître de ce foyer ». Les deux derniers maillons sont ceux de D2.
 */
export function mergeCardRefusalKey(reason: string): MessageKey | null {
  return edgeRefusalKey(reason) ??
    mergeSettingRefusalKey(reason) ??
    householdRefusalKey(reason);
}

/**
 * POURQUOI UNE BOUCHE N'EST PAS PROPOSÉE — et c'est le correctif de D1.
 *
 * ⚠️ LE LECTEUR REVERSE DEUX VOCABULAIRES DANS UN SEUL. `household_merge_notice.ts`
 * fait `skip(pair.refusal)`: le motif rangé dans `skipped[]` n'est alors pas un
 * `SKIP_*` mais un refus de FENÊTRE (`merge_windows_disjoint`,
 * `merge_window_all_past`, `merge_window_unreadable`), qui a déjà ses mots dans
 * `EDGE_REFUSAL_KEYS`. Mesuré: le maître lisait `merge_windows_disjoint` en
 * toutes lettres sous le nom de Zoé.
 *
 * ── POURQUOI ICI, ET PAS EN AJOUTANT LES DEUX CLÉS À `MERGE_SKIP_KEYS` ─────
 * Parce que ce serait une SECONDE phrase pour un jeton qui en a déjà une, et
 * parce que la bijection inverse du test (« n'invente aucun motif que le
 * lecteur ne produit pas ») deviendrait fausse: elle scanne les déclarations
 * `export const SKIP_… = "…"`, et `pair.refusal` n'en est pas une. Le repli
 * respecte la forme du serveur au lieu de la contredire.
 *
 * L'ordre est celui de la précision: `merge_quota_exhausted` vit dans LES DEUX
 * tables, et sa phrase de `skipped[]` (« le foyer a utilisé ses fusions de la
 * semaine ») est celle qui répond à la question posée par cette liste-là.
 */
export function mergeCardSkipKey(reason: string): MessageKey | null {
  return mergeSkipKey(reason) ?? edgeRefusalKey(reason);
}
