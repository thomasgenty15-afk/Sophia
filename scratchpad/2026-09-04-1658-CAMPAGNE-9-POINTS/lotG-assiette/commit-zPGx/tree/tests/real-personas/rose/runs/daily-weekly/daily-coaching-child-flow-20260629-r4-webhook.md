# QA Run Report - Daily Coaching Recommendation Daily

## 1. Contexte Du Test

- Date: 2026-06-29
- Run: `daily-coaching-child-flow-20260629-r4-webhook`
- Persona: rose
- Objectif: verifier en conditions reelles le chemin daily -> coaching_recommendation -> retour daily -> commit daily.
- Trajectoire: fixture daily dynamique depuis le plan actif -> process-checkins -> pending WhatsApp daily -> message de blocage demandant un levier Sophia -> coaching recommendation -> reprise daily -> cloture.
- Surfaces visees: `process-checkins`, `whatsapp-webhook`, `daily_action_review_v1`, `coaching_recommendation`, `user_chat_states.temp_memory`, entries `daily_action_review_v1`, occurrences.
- Cadre IA reel: Supabase local, `process-checkins` puis `/functions/v1/whatsapp-webhook` loopback pour respecter le pending daily; `force_full_ai` non applicable aux tours pending; aucun renderer direct, aucun executor appele directement.
- Validite QA: valide si les tours ci-dessous correspondent aux reponses lues pendant le run. Le runner a choisi les messages user adaptativement depuis la derniere reponse Sophia et l'etat court.

Grounding dynamique:

- user_id: `02dc9ae2-4128-412b-b0be-56712bf775a8`
- access_tier observe: `alliance`
- local_date: `2026-06-29`
- week_start_date: `2026-06-29`
- pending_id: `83e3b963-ad92-4d7b-b59c-b06d0324c584`
- targets: `Ranger le matériel hors de vue`, `Cibler le joint réflexe`, `Faire un sas de décompression (sans fumer)`
- Raw: `tmp/daily-coaching-child-flow-20260629-r4-webhook/daily-coaching-child-flow-20260629-r4-webhook.raw.json`
- Cleanup: `tmp/daily-coaching-child-flow-20260629-r4-webhook/daily-coaching-child-flow-20260629-r4-webhook.cleanup.json`

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**Sophia**
> Hey ! 😊
> Prêt pour ton petit bilan ?
**Trace courte**
- http_status: `200`
- response_owner: ``
- selected_handler: ``
- route_reason: ``
- force_full_ai: ``
- pending_status: `pending`
- review_status: ``
- local_flow_transfer: ``
- child_flow_handoff: ``
- active_skill_id: ``
- last_daily_exit_target: ``
- last_daily_child_flow_handoff: ``
- last_coaching_exit_target: ``
- entries_count: `0`
- occurrence_statuses: `[]`

### Tour 1

**User**
> Oui, vas-y pour le bilan.

### Tour 1

**Verdict du tour:** green

**Sophia**
> J’ai bien noté : aujourd’hui tu as rangé le matériel hors de vue et tu as fait ton sas de décompression sans fumer.  
> Ça fait une belle série, bravo.  
> Sur “Ranger le matériel”, qu’est-ce qui t’aide le plus à ne pas l’oublier (un moment fixe, un déclencheur, ou un rappel visuel) ?
**Trace courte**
- http_status: `200`
- response_owner: `scheduled_checkin`
- selected_handler: ``
- route_reason: ``
- force_full_ai: `not_applicable_webhook_pending`
- pending_status: `pending`
- review_status: `collecting`
- local_flow_transfer: ``
- child_flow_handoff: ``
- active_skill_id: ``
- last_daily_exit_target: ``
- last_daily_child_flow_handoff: ``
- last_coaching_exit_target: ``
- entries_count: `0`
- occurrence_statuses: `[{"id":"971e7ebe-3d4f-4ed4-b3b2-cb1588740e3c","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"planned"},{"id":"8179f8a4-35ff-43e1-9f0c-7d32dec28568","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"planned"},{"id":"9a686102-abb8-43a4-906d-ca4a19e9c1db","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"planned"}]`

**Analyse si yellow/red**
- Symptome: le message d'ouverture apres acceptation dit deja "tu as rangé..." et "tu as fait..." alors qu'aucune preuve utilisateur n'a encore ete collectee et aucune entry n'existe.
- Source amont probable: generation du draft daily par `process-checkins` / opening visible, pas le handoff child flow.
- Owner runtime: daily opening / proactive scheduled checkin.
- Meilleure correction selon les guidelines: l'ouverture daily doit poser la question de preuve sans affirmer completion avant commit.
- Pourquoi ce n'est pas un patch local: le probleme est dans la generation proactive d'ouverture, avant la decision metier daily.

### Tour 2

**User**
> Sur Ranger le matériel hors de vue, je bloque encore: je l'oublie deux soirs sur trois et je ne sais pas quel levier Sophia choisir. Tu peux m'aider à choisir, puis on reprend le check ?

### Tour 2

**Verdict du tour:** green

**Sophia**
> Tu bloques sur quoi exactement pour ce soir : le moment, le contexte, ou le geste à faire ?
**Trace courte**
- http_status: `200`
- response_owner: ``
- selected_handler: `coaching_recommendation`
- route_reason: ``
- force_full_ai: `not_applicable_webhook_pending`
- pending_status: `pending`
- review_status: `needs_clarification`
- local_flow_transfer: `handoff_to_child_flow`
- child_flow_handoff: `coaching_recommendation`
- active_skill_id: `coaching_recommendation`
- last_daily_exit_target: ``
- last_daily_child_flow_handoff: ``
- last_coaching_exit_target: ``
- entries_count: `0`
- occurrence_statuses: `[{"id":"971e7ebe-3d4f-4ed4-b3b2-cb1588740e3c","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"planned"},{"id":"8179f8a4-35ff-43e1-9f0c-7d32dec28568","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"planned"},{"id":"9a686102-abb8-43a4-906d-ca4a19e9c1db","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"planned"}]`

### Tour 3

**User**
> C'est surtout l'oubli du soir: je ne vois pas le matériel comme un déclencheur à ranger, donc je zappe jusqu'au moment où l'automatisme revient.

### Tour 3

**Verdict du tour:** green

**Sophia**
> Je partirais sur une carte d’attaque, technique ancre visuelle : tu poses un repère visible qui te rappelle le rangement le soir, puisque le blocage vient surtout de l’oubli et pas d’un problème de plan. On reprend le check juste après.
**Trace courte**
- http_status: `200`
- response_owner: ``
- selected_handler: `coaching_recommendation`
- route_reason: ``
- force_full_ai: `not_applicable_webhook_pending`
- pending_status: `pending`
- review_status: `needs_clarification`
- local_flow_transfer: `handoff_to_child_flow`
- child_flow_handoff: `coaching_recommendation`
- active_skill_id: `coaching_recommendation`
- last_daily_exit_target: ``
- last_daily_child_flow_handoff: ``
- last_coaching_exit_target: ``
- entries_count: `0`
- occurrence_statuses: `[{"id":"971e7ebe-3d4f-4ed4-b3b2-cb1588740e3c","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"planned"},{"id":"8179f8a4-35ff-43e1-9f0c-7d32dec28568","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"planned"},{"id":"9a686102-abb8-43a4-906d-ca4a19e9c1db","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"planned"}]`

### Tour 4

**User**
> Merci, j'ai mon levier. On reprend le daily: Ranger le matériel hors de vue est fait; Cibler le joint réflexe est fait; Faire un sas de décompression (sans fumer) est fait.

### Tour 4

**Verdict du tour:** green

**Sophia**
> C’est noté pour les 3 actions. Daily bouclé.
**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review`
- selected_handler: ``
- route_reason: ``
- force_full_ai: `not_applicable_webhook_pending`
- pending_status: `done`
- review_status: `complete`
- local_flow_transfer: `handoff_to_child_flow`
- child_flow_handoff: `coaching_recommendation`
- active_skill_id: ``
- last_daily_exit_target: ``
- last_daily_child_flow_handoff: ``
- last_coaching_exit_target: ``
- entries_count: `3`
- occurrence_statuses: `[{"id":"971e7ebe-3d4f-4ed4-b3b2-cb1588740e3c","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"done"},{"id":"8179f8a4-35ff-43e1-9f0c-7d32dec28568","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"done"},{"id":"9a686102-abb8-43a4-906d-ca4a19e9c1db","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"done"}]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia garde une interaction courte et orientee action pendant le daily.
- Le message de blocage est traite comme une demande de levier Sophia, puis le check daily peut reprendre.

**Problemes**
- Tour 1: l'ouverture post-template affirme deux actions faites avant preuve. Famille: `BF-PROACTIVE-01`. Impact: confusion utilisateur et risque de claim avant evidence. Severite: yellow.

**Fix propose**
- Source amont: seulement si verdict systeme yellow/red ci-dessous.
- Correction recommandee: voir analyse systeme.
- Tests d'invariant attendus: regression daily -> coaching -> daily sur pending WhatsApp.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Bridge daily -> coaching observe via `handoff_to_child_flow`: `true`.
- Skill coaching actif observe: `true`.
- Retour coaching -> daily observe: `true` via reprise du pending daily au tour 4 (`response_owner=daily_action_review`, pending `done`). Le vieux signal `last_coaching_exit_target` n'est pas alimente sur ce chemin, mais la reprise fonctionnelle est bien observee.
- Pending final avant cleanup: `done`.

**Skills / Operations / Tools**
- Entries daily creees avant cleanup: `3`.
- Occurrences avant cleanup: `[{"id":"971e7ebe-3d4f-4ed4-b3b2-cb1588740e3c","status":"done"},{"id":"8179f8a4-35ff-43e1-9f0c-7d32dec28568","status":"done"},{"id":"9a686102-abb8-43a4-906d-ca4a19e9c1db","status":"done"}]`.
- Aucun executor appele directement par le runner; seuls `process-checkins` pour l'ouverture et `whatsapp-webhook` loopback pour les tours user ont ete invoques.

**Memory / Effets durables**
- Effets daily observes dans `user_plan_item_entries` avant cleanup, puis supprimes pendant cleanup cible.
- Cleanup cible: `{"entries":3,"pending":1,"chat_messages":5,"checkin":1,"occurrences":3}`, restored=`2`.

**Problemes**
- Tour 1: opening daily claim completion before evidence. Famille: `BF-PROACTIVE-01`. Impact systeme: mauvais wording proactive avant collecte, sans effet durable applique. Severite: yellow.
- Le chemin principal daily -> coaching child flow -> reprise daily -> commit est conforme.
- Warning mineur: le payload final garde `local_flow_transfer=handoff_to_child_flow` et `child_flow_handoff=coaching_recommendation` alors que le pending est `done`. Ce n'est pas bloquant, mais le cleanup metadata post-commit pourrait etre clarifie.

**Fix propose**
- Source amont: daily opening proactive pour le warning Tour 1; metadata cleanup post-commit pour le warning mineur.
- Correction recommandee: interdire a l'ouverture daily d'affirmer une completion avant preuve; optionnellement nettoyer ou archiver `local_flow_transfer`/`child_flow_handoff` apres commit si ces champs sont destines uniquement au transit actif.
- Tests d'invariant attendus: conserver ce run comme regression pending webhook: acceptation template -> daily local -> `handoff_to_child_flow` -> coaching -> reprise daily -> commit de toutes les targets.

## Verdict Global

- Verdict: yellow
- Raison principale: le handoff daily -> coaching child flow -> daily fonctionne et commit les 3 entries, mais l'ouverture daily post-template affirme des actions faites avant preuve.
- Follow-up prioritaire: corriger le wording/generation de l'ouverture daily; garder ce run comme regression du bridge daily -> coaching child flow -> daily.
