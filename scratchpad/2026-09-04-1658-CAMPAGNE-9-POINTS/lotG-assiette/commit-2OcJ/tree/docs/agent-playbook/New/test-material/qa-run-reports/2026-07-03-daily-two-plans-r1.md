# QA Run Report - Daily Action Review, 2 actions sur 2 plans (D-2plans.1)

## 1. Contexte Du Test

- Date: 2026-07-03
- Run: `daily-2plans-20260703-r2`
- Persona: `qa-skill` (user temporaire cree de toutes pieces, `is_test_persona=true`, email `qa-daily-2plans-...@example.com`, user_id `9740752b-6609-480a-a42c-f39e02db8e5d`)
- Objectif: tester le daily `action_evening_review` en conditions reelles, declenche par `process-checkins` (ouverture IA proactive = tour 0, reponse user vide au depart), avec **2 actions a checker reparties sur 2 plans distincts**.
- Trajectoire: seed dynamique (1 cycle -> 2 transformations -> 2 plans actifs -> 1 action reviewable chacun, occurrences `planned` aujourd'hui `fri` 2026-07-03) -> `schedule-whatsapp-v2-checkins` -> `process-checkins` (matin, puis daily) -> pending `daily_action_review` avec 2 targets -> pilotage conversationnel loopback WhatsApp tour par tour.
- Surfaces visees: `scheduled_checkins`, `process-checkins`, `whatsapp_pending_actions.chat_capability=daily_action_review`, `whatsapp-webhook/handlers_pending`, `daily_action_review_v1` (selector/intake/reducer/effects/executor/ledger), et — au tour de continuation — dispatcher `normal_reply` + direct-effect `track_progress_plan_item`.
- Cadre IA reel: Supabase local; ouverture et reponses produites par le chemin IA reel (process-checkins opening generatif + intake daily LLM + companion). Chemin pending reel WhatsApp: `process-checkins` puis `/functions/v1/whatsapp-webhook` en loopback. `force_full_ai` non applicable aux tours pending (endpoint `test-send-message` non utilise, conforme a l'exception daily des guidelines). Aucun renderer deterministe, aucun `processMessage` direct, aucun executor appele directement.
- Validite QA: valide. Pending genere par le systeme (aucun ID/date/action/message hardcode par le runner), 2 targets sur 2 plan_id distincts, opening IA reelle, reponses user choisies apres lecture des reponses Sophia.

Grounding dynamique (decouvert au runtime):

- pending_id: `d4b4643b-5377-4d97-9e46-a41389beadf7`, status final `done`
- targets.length: `2`, plan_ids distincts: `527e7855-...` (Plan Focus) et `fac7ee45-...` (Plan Sommeil)
- local_date: `2026-07-03`, weekday: `fri`
- Isolation: la seule file `scheduled_checkins` due hors scope (1 `one_shot_reminder` de la persona `02dc9ae2`) a ete temporairement parkee (scheduled_for repousse) le temps du run puis **restauree a l'identique** en cleanup (verifie: retour a `2026-07-02 19:00:00`).

## 2. Tours De Conversation

### Tour 0 (ouverture proactive Sophia, reponse user vide)

**Verdict du tour:** green

**User**
> (aucun message: declenchement systeme `process-checkins` -> `action_evening_review_v2`)

**Sophia**
> Je reviens sur tes deux marches prévues aujourd’hui : 20 min au réveil et 15 min cet après-midi pour préparer ton sommeil.
> Au final, ça s’est passé comment pour toi ?

**Trace courte**
- source: pending daily genere par `process-checkins`
- response_owner: `process-checkins` (opening generatif)
- chat_capability: `daily_action_review`
- pending_status: `awaiting_user`
- targets: 2 (1 par plan), une seule question principale, aucune target hors focus
- direct_effects: aucun
- durable_effect: aucun (ouverture uniquement)

Ouverture conforme au contrat daily: une seule question principale, les 2 actions nommees et desambiguisees par le moment (au reveil / cet apres-midi), pas de "deja fait/deja rate", aucune solution/tool/potion/plan.

### Tour 1 (reponse mixte sur les 2 actions)

**Verdict du tour:** green

**User**
> La marche du matin au réveil je l'ai bien faite, ça m'a réveillé d'un coup. Par contre celle de cet après-midi j'ai pas réussi, j'étais coincé en réunion tout le temps.

**Sophia**
> C’est noté pour les 2 actions. La marche du matin est faite, et celle de l’après-midi est manquée.

**Trace courte**
- http_status: `200`
- response_owner: pending handler `handleActionEveningReviewReply` (purpose `action_evening_review`)
- selected_handler: `daily_action_review_v1`
- safety: aucun signal
- pending_confirmation: pending daily prioritaire, marque `done`
- direct_effects / effet durable:
  - `Faire 20 min de marche au réveil` (Plan Focus `527e7855`) -> entry `checkin/completed`, occurrence `done` (validated_at set)
  - `Marcher 15 min l'après-midi...` (Plan Sommeil `fac7ee45`) -> entry `skip/missed`, `reason_category=external`, `still_relevant=true`, occurrence `rescheduled`
  - review_state: `source=daily_action_review_v1`, `intent=answer_review`, `confidence=high`, `missing_slots=[]` sur les 2 items
  - entries `source=daily_action_review_v1` = 2 (exactement 1 par plan)

Comportement conforme au contrat: outcome par action correct sur 2 plans, missed avec raison + still_relevant captures, "C'est noté" rendu **apres** commit (invariant EffectLedger respecte), aucune carte/potion/ajustement propose pendant la collecte, aucun report interdit.

### Tour 2 (continuation emotionnelle apres daily done)

**Verdict du tour:** red

**Famille de bugs:** BF-INTAKE-04 — Ambiguite non reconnue (primaire) ; BF-EFFECT-01 — Effet durable non consenti (co-famille effect gate)

**User**
> Ouais ça m'embête un peu pour l'après-midi, j'aurais bien voulu tenir les deux aujourd'hui.

**Sophia**
> Oui, c’est frustrant quand tu voulais tenir les deux. Le matin a quand même été fait, donc t’as gardé l’élan sur une partie de l’objectif 💪

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- reason_code: `direct_effects_then_normal_reply`
- selected_handler: `track_progress_plan_item`
- agent_used: `companion`
- direct_effects: `track_progress_plan_item` sur `target_item_id=2b76667e` (= "Faire 20 min de marche au réveil", **l'action DU MATIN deja completed**), `status_hint=missed`, `explicitness=explicit`, `confidence_band=high`
- effect_ledger: `requested=1, allowed=1, committed=1, blocked=0, asked=0`
- durable_effect: **entry parasite** `user_plan_item_entries` `a035b9f9-...`, `skip/missed`, `source=router_parallel_tracking_v2`, sur l'item du matin. Etat DB final contradictoire: l'action du matin porte a la fois `completed` (daily, tour 1) ET `missed` (router, tour 2).

**Analyse**
- Symptome: une phrase emotionnelle de reflexion sur l'apres-midi ("j'aurais bien voulu tenir les deux") est classee comme report de progression **explicite / high confidence** de type `missed`, et committee sans confirmation sur l'action **du matin deja validee completed** le meme jour.
- Source amont probable: le classifieur direct-effect du dispatcher (turn_frame `direct_effects` -> `track_progress_plan_item`) surcote l'explicitness/confidence sur un enonce non-report; la selection de cible attrape le mauvais item (matin) a partir de "tenir les deux"; l'effect gate admet l'ecriture (`allowed`) sans confirmation ni verification d'une evidence contradictoire deja committee le meme jour.
- Owner runtime: dispatcher direct-effect intake + `track_progress_plan_item` (router `router_parallel_tracking_v2`) + effect admission gate (`operation_runtime_pipeline` / effect ledger).
- Meilleure correction selon les guidelines (amont, pas patch de phrase):
  1. Relever le seuil d'ambiguite du direct-effect `track_progress` (BF-INTAKE-04): un enonce affectif sans verbe d'action factuel du jour ne doit pas passer en `explicitness=explicit`; en cas de doute -> pas d'effet, clarification.
  2. Effect gate / EffectLedger (BF-EFFECT-01): bloquer un `track_progress` non confirme quand une evidence du meme `plan_item_id` + meme `local_date` est deja committee avec un outcome oppose (idempotence/contradiction guard), au lieu d'ecrire une 2e entry contradictoire.
- Pourquoi ce n'est pas un patch local: corriger la formulation ou ajouter une regex "j'aurais voulu" ne traite ni la surcote d'explicitness ni l'admission d'un effet durable contradictoire; la source est le contrat direct-effect/effect-gate, transverse a tous les items et messages.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Ouverture daily naturelle, une seule question, 2 actions desambiguisees par le moment de la journee (Tour 0).
- Accuse de reception clair et non culpabilisant sur les 2 outcomes, sans repartir dans une operation de plan (Tour 1).
- Reponse de soutien juste et humaine sur la frustration, valorise l'elan garde le matin (Tour 2).

**Problemes**
- Aucun probleme de fluidite cote texte visible. Le bug du Tour 2 est invisible pour l'utilisateur dans la conversation (l'effet durable faux est silencieux) — mais il degrade la verite du dossier utilisateur.

**Fix propose**
- Rien cote fluidite. Voir Analyse Systeme.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 0/1: `process-checkins` -> pending `daily_action_review` (2 targets, 2 plans) -> `handleActionEveningReviewReply` -> `daily_action_review_v1`. Correct, pending priorise, marque `done`.
- Tour 2: dispatcher route `normal_reply` avec `reason_code=direct_effects_then_normal_reply` et declenche un direct-effect `track_progress_plan_item`. Le texte de reponse (`companion`) est correct, mais le direct-effect est illegitime.

**Skills / Operations / Tools**
- Daily: `chat_capability=daily_action_review`, `review_state.source=daily_action_review_v1`, `intent=answer_review`, outcomes `completed`/`missed` corrects, `reason_category=external`, `still_relevant=true`, 2 entries daily (1 par plan). Green.
- Tour 2: `track_progress_plan_item` s'est declenche alors que l'intention n'etait pas un report clair; cible = mauvaise action (matin, deja completed); commit sans confirmation. Red.

**Memory / Effets durables**
- Effets attendus (daily): 2 entries `daily_action_review_v1`, occurrence matin `done`, occurrence apres-midi `rescheduled`, pending `done`. Presents et corrects.
- Effet inattendu (bug): 3e entry `skip/missed` `source=router_parallel_tracking_v2` sur l'item du matin -> **evidence durable contradictoire** (completed + missed le meme jour, meme item). Cette entry alimentera a tort le weekly (`weekly_progress_review` lit `user_plan_item_entries`).

**Problemes**
- Tour 2: effet durable faux et non consenti. Famille: BF-INTAKE-04 (+ BF-EFFECT-01). Impact systeme: corruption d'evidence pour le weekly, contradiction avec l'outcome daily confirme. Severite: red.

**Fix propose**
- Source amont: contrat direct-effect (explicitness/confidence intake) + effect admission gate.
- Correction recommandee: (1) ne pas classer un enonce affectif/regret comme `track_progress` explicite -> clarification ou no-op; (2) guard d'idempotence/contradiction: refuser un `track_progress` non confirme quand une evidence opposee du meme item + meme jour est deja committee.
- Tests d'invariant attendus:
  - un message de regret ("j'aurais voulu tenir les deux") ne produit aucun `track_progress` (0 effet, ou clarification);
  - un `track_progress` `missed` est bloque si une entry `completed` du meme `plan_item_id` + `local_date` existe deja (pas de 2e entry contradictoire sans confirmation explicite);
  - la selection de cible ne mappe pas "les deux" sur une seule action arbitraire deja resolue.

## Verdict Global

- Verdict: red
- Raison principale: le coeur daily (2 actions sur 2 plans, ouverture IA, collecte, commit, ledger) est green; mais le tour de continuation a produit un effet durable faux et non consenti (`track_progress missed` sur une action deja `completed`), via le dispatcher direct-effect — analyse systeme red -> verdict global red.
- Follow-up prioritaire: durcir le seuil d'explicitness du direct-effect `track_progress` et ajouter un guard de contradiction/idempotence par `plan_item_id`+`local_date` dans l'effect gate. Voir feuille de suivi.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-03-daily-two-plans-r1-bugs.md`
