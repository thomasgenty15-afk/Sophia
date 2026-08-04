# Bug Sheet — Paul Global 15 (r1) — 2026-07-03

Run: `paul-global15-r1` — persona Paul (`d265435c-4be5-4b39-a0c6-12f18fa8bfff`).
Rapport: `../qa-run-reports/2026-07-03-paul-global15-r1.md`.
Verdict run: **red** (système red via R1-B01).

## R1-B01 — track_progress committé sur une question de vérification (doublon durable)

- Tours: 15
- Famille: `BF-EFFECT-01` (effet durable non consenti) ; secondaire `BF-STATUS-02`.
- Domaine owner: intake/classification `track_progress_plan_item` + gate
  d'admission / idempotence de l'EffectLedger.
- Source amont: l'intent track_progress est émis sur un message **interrogatif**
  (« Tu l'as bien enregistré ou pas ? ») sans report d'action ; aucune garde
  d'idempotence n'empêche un 2e check-in identique le même jour sur le même item.
- Symptome visible: réponse « oui, bien noté ✅ » et création d'un **doublon** de
  check-in `completed` sur « Faire 10 min de mouvement en rentrant ».
- Preuve systeme: `direct_effects=[track_progress_plan_item]`, ledger committed 1,
  `user_plan_item_entries` item `d39162ba` deux entries identiques
  (01:03:34 puis 01:10:23, même outcome `completed`). route_reason
  `direct_effects_then_normal_reply`.
- Correction attendue: (1) intake distingue report d'action vs question de statut,
  et n'émet pas de track sur une interrogation ; (2) garde d'idempotence au commit
  par (plan_item_id, jour, entry_kind, outcome) côté ledger/executor ; (3) le
  recall de statut lit les entries existantes au lieu de re-committer.
- Statut: `fix_applied` (rerun requis)
- Fix reference: (1) doctrine dispatcher 3e (`dispatcher.prompts.ts`) : une
  question de vérification/statut n'est jamais un nouveau report, aucune
  émission track — « un statut se lit dans le contexte, il ne se ré-écrit
  pas » ; (2) garde d'idempotence journalière dans `logPlanItemProgressV2`
  (`track_progress_plan_item/db.ts`) : entry identique (item, jour, outcome)
  déjà en DB → aucun re-write ; même `source_message_id` (ré-exécution de
  lane) → commit existant re-renvoyé, autre message → `already_tracked_today`
  bloqué ; (3) le blocage est exposé au composeur via
  `blocked_track_progress` dans `direct_effect_confirmation_context`
  (`direct_effect_local_context.ts`) avec règle « confirme l'existant, ne le
  re-loggue pas, ne nie jamais l'enregistrement ». Tests :
  `db_counter_test.ts` (re-entrance/duplicate/anti-FP outcome différent),
  `track_progress_plan_item_tool_test.ts` (already_tracked_today),
  `direct_effect_local_context_test.ts`, contrat dispatcher.
- Tests requis: positif (report explicite ⇒ 1 entry) ; anti-faux-positif
  (question de statut ⇒ 0 direct effect) ; idempotence (2 reports identiques même
  jour ⇒ pas de 2e entry silencieuse) ; intégration runtime sur le turn interrogatif.

## R1-B02 — Recap semaine aveugle aux entries de progression de la session

- Tours: 14 (confirmé au 15)
- Famille: `BF-STATUS-02` (historique incomplet / projection status).
- Domaine owner: projection status/recap + loader de contexte de recap.
- Source amont: le chemin de recap « où j'en suis cette semaine » ne charge pas
  `user_plan_item_entries` de la fenêtre ; ne restitue que pendings/reminders.
- Symptome visible: « je n'ai pas la liste complète de tes séances faites ou
  prévues », alors que 3 check-ins ont été committés minutes avant dans la session.
- Preuve systeme: `response_owner=normal_reply`, aucun effet, mais DB contient
  entries `d39162ba` (completed), `1ec5b99a` (missed + completed). Recap ne les cite pas.
- Correction attendue: la projection recap doit lire les `user_plan_item_entries`
  récentes (fenêtre semaine) et les résumer (fait / raté / en attente) par item.
- Statut: `fix_applied` (rerun requis)
- Fix reference: les entries de la semaine étaient déjà chargées
  (`loadCurrentWeekPlanContext`, `context/loader.ts`) mais le bloc ne se
  désignait pas comme source du recap et tronquait à 3 entries/item en
  silence. Fix : ligne Usage explicite « executions_semaine EST la liste des
  exécutions enregistrées (y compris cette session) — ne dis jamais que la
  liste des séances te manque quand ce bloc est présent » + annonce de
  troncature `(+N autres exécutions)` (no silent caps). Tests :
  `loader_v2_runtime_test.ts` (source recap + cap annoncé + anti-FP).
- Tests requis: recap après N check-ins ⇒ cite chaque entry committée ; anti-faux
  (pas d'invention si 0 entry) ; intégration : report puis recap dans la même session.

## R1-B03 — Effet durable admis sur cible inférée sans micro-confirmation

- Tours: 8
- Famille: `BF-INTAKE-04` (ambiguïté non reconnue).
- Domaine owner: intake `track_progress_plan_item` + gate d'ambiguïté avant
  admission du direct effect.
- Source amont: référent « ça » non nommé, résolu par anaphore vers « préparer le
  sac de sport », puis commit direct sans confiance haute ni confirmation ; entre
  en contradiction silencieuse avec l'entry `missed` du tour 4 sur le même item.
- Symptome visible: « le fait d'avoir préparé ton sac de sport la veille est
  enregistré comme terminé ✅ » sur un message où l'item n'est jamais nommé.
- Preuve systeme: `direct_effects=[track_progress_plan_item]`, committed 1,
  entry `1ec5b99a` `checkin/completed` après un `skip/missed` 3 tours plus tôt.
- Correction attendue: quand la cible est inférée par anaphore à confiance
  non-haute, demander une confirmation 1-ligne avant commit (« le sac de sport ? »).
- Statut: `fix_applied` (rerun requis)
- Fix reference: doctrine dispatcher 3f (`dispatcher.prompts.ts`) : cible
  déduite d'une référence vague (« ça ») sans référent clair dans le message
  ou le tour immédiatement précédent → `target_status=inferred` +
  `confidence_band=medium` au plus, « une cible devinée n'est jamais
  identified/high ». Le garde structurel existant
  (`turnFrameHasRunnableDirectEffect` + `runDirectEffectGate`) produit alors
  la micro-confirmation (« Tu parles de quel élément exactement ? ») au lieu
  du commit. Complément : le garde d'évidence même-jour
  (`contradicts_same_day_evidence`, session parallèle) bloque un outcome
  opposé non confirmé — le cas exact `completed` après `missed` du T4→T8.
  Tests : contrat dispatcher (3f), gate déjà couvert.
- Tests requis: cible nommée ⇒ commit direct ; cible inférée basse confiance ⇒
  demande de confirmation, pas de commit ; anti-faux (report clair ⇒ pas de
  friction inutile).

## R1-B04 — Handoff soutien→produit trop rapide en moment vulnérable

- Tours: 12
- Famille: `a classifier` (altitude/timing de handoff ; proche BF-INTAKE-06 mais le
  domaine émotionnel est correctement lu, donc pas un mauvais domaine sémantique).
- Domaine owner: skill `coaching_recommendation`, branche émotionnelle (ordre
  validation → nommage outil).
- Source amont: en détresse non-crise, la réponse nomme immédiatement l'outil
  produit (« potion », « Amour », « levier ») avant d'avoir tenu l'espace émotionnel.
- Symptome visible: réponse qui sonne mécanique/catalogue au moment où Paul se
  dévalorise.
- Preuve systeme: `response_owner=coaching_recommendation`,
  reason `coaching_recommendation_signal`, aucun side effect (bon), mais altitude
  de handoff produit-first.
- Correction attendue: en contexte émotionnel bas, différer le nommage produit
  d'un tour — valider d'abord, proposer l'outil ensuite. Règle d'altitude, pas regex.
- Statut: `fix_applied` (rerun requis)
- Fix reference: généralisation presence-first à deux niveaux : (1) dispatcher
  global règle 5 (`dispatcher.prompts.ts`) — tour à charge émotionnelle basse
  sans demande de levier ⇒ aucun signal coaching, la réponse normale
  accueille et valide d'abord (même règle que le craving aigu) ; (2) règles
  visibles coaching (`visible_agents/shared.ts`) — « Altitude premier tour
  émotionnel » : beat de validation d'abord, levier nommé après en une phrase
  au plus, jamais d'instructions UI à ce tour. Tests : contrat dispatcher +
  `local_flow_test.ts`.
- Tests requis: contexte émotionnel bas ⇒ 1er tour = validation sans nommage
  produit ; le nommage de la potion/carte n'apparaît qu'après validation.

## Note de propreté du run

Effets durables créés par le run puis **réinitialisés après confirmation
utilisateur explicite** : 4 `user_plan_item_entries`, 1 `scheduled_checkins`
(rappel 2026-07-04), 6 `memory_items` + artefacts memorizer, 30 `chat_messages`.
Vérif post-reset : tous les compteurs du user à 0. Le plan actif de Paul est
intact (track_progress n'ajoute que des entries, aucun item modifié/supprimé).
