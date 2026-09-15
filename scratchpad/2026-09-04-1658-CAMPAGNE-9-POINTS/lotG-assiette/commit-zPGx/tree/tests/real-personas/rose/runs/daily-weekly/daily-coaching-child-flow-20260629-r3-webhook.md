# QA Run Report - Daily Coaching Recommendation Daily

## 1. Contexte Du Test

- Date: 2026-06-29
- Run: `daily-coaching-child-flow-20260629-r3-webhook`
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
- pending_id: `09fea3a5-f0b3-46a5-b158-da3efb4da65c`
- targets: `Ranger le matériel hors de vue`, `Cibler le joint réflexe`, `Faire un sas de décompression (sans fumer)`
- Raw: `tmp/daily-coaching-child-flow-20260629-r3-webhook/daily-coaching-child-flow-20260629-r3-webhook.raw.json`
- Cleanup: `tmp/daily-coaching-child-flow-20260629-r3-webhook/daily-coaching-child-flow-20260629-r3-webhook.cleanup.json`

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** green

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
> Je te fais un point rapide sur ce lundi.
> Tu as réussi à ranger le matériel hors de vue et à te faire un sas de décompression sans fumer, c’est solide.
> Qu’est-ce qui t’a le plus aidé à les faire aujourd’hui ?
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
- occurrence_statuses: `[{"id":"f8f05a2e-75b0-4c5e-9858-aa43ff135006","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"planned"},{"id":"15fc146c-b7a9-445f-a369-071598d2d935","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"planned"},{"id":"e74e2e05-32e3-4f35-9d6f-fa9fd6196a5c","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"planned"}]`

### Tour 2

**User**
> Sur Ranger le matériel hors de vue, je bloque encore: je l'oublie deux soirs sur trois et je ne sais pas quel levier Sophia choisir. Tu peux m'aider à choisir, puis on reprend le check ?

### Tour 2

**Verdict du tour:** green

**Sophia**
> Tu veux te débloquer par rapport à quoi exactement : l’oubli du soir, le moment où tu le fais, ou le fait que le geste ne tient pas ?
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
- occurrence_statuses: `[{"id":"f8f05a2e-75b0-4c5e-9858-aa43ff135006","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"planned"},{"id":"15fc146c-b7a9-445f-a369-071598d2d935","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"planned"},{"id":"e74e2e05-32e3-4f35-9d6f-fa9fd6196a5c","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"planned"}]`

### Tour 3

**User**
> Merci, j'ai mon levier. On reprend le daily: Ranger le matériel hors de vue est fait; Cibler le joint réflexe est fait; Faire un sas de décompression (sans fumer) est fait.

### Tour 3

**Verdict du tour:** green

**Sophia**
> C’est noté pour tes 3 actions. Daily clôturé de mon côté.
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
- occurrence_statuses: `[{"id":"f8f05a2e-75b0-4c5e-9858-aa43ff135006","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"done"},{"id":"15fc146c-b7a9-445f-a369-071598d2d935","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"done"},{"id":"e74e2e05-32e3-4f35-9d6f-fa9fd6196a5c","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"done"}]`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia garde une interaction courte et orientee action pendant le daily.
- Le message de blocage est traite comme une demande de levier Sophia, puis le check daily peut reprendre.

**Problemes**
- Aucun probleme bloquant observe dans la fluidite du transcript.

**Fix propose**
- Source amont: seulement si verdict systeme yellow/red ci-dessous.
- Correction recommandee: voir analyse systeme.
- Tests d'invariant attendus: regression daily -> coaching -> daily sur pending WhatsApp.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Bridge daily -> coaching observe via `handoff_to_child_flow`: `true`.
- Skill coaching actif observe: `true`.
- Retour coaching -> daily observe via memo: `false`.
- Pending final avant cleanup: `done`.

**Skills / Operations / Tools**
- Entries daily creees avant cleanup: `3`.
- Occurrences avant cleanup: `[{"id":"f8f05a2e-75b0-4c5e-9858-aa43ff135006","status":"done"},{"id":"15fc146c-b7a9-445f-a369-071598d2d935","status":"done"},{"id":"e74e2e05-32e3-4f35-9d6f-fa9fd6196a5c","status":"done"}]`.
- Aucun executor appele directement par le runner; seuls `process-checkins` pour l'ouverture et `whatsapp-webhook` loopback pour les tours user ont ete invoques.

**Memory / Effets durables**
- Effets daily observes dans `user_plan_item_entries` avant cleanup, puis supprimes pendant cleanup cible.
- Cleanup cible: `{"entries":3,"pending":1,"chat_messages":4,"checkin":1,"occurrences":3}`, restored=`2`.

**Problemes**
- Bridge/retour/commit incomplet. Famille: BF-ROUTING-01 ou BF-STATE-01 selon le tour concerne.

**Fix propose**
- Source amont: runtime bridge daily/coaching si le retour ou la reprise daily manque; reducer/effects daily si le commit manque.
- Correction recommandee: conserver le memo coaching uniquement jusqu'a consommation par daily et verifier que le pending daily ne preempte pas une continuation coaching active.
- Tests d'invariant attendus: test integration pending avec sortie `handoff_to_child_flow`, activation coaching, puis reprise daily et commit de toutes les targets.

## Verdict Global

- Verdict: yellow
- Raison principale: bridge daily -> coaching observe, skill coaching actif observe, retour coaching -> daily non observe, pending final `done`.
- Follow-up prioritaire: corriger le point de rupture observe dans les tours, puis relancer le meme scenario.
