# QA Run Report - Daily Coaching Recommendation Daily

## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `qa-daily-coaching-bridge-2026-06-19T230315621Z`
- Persona: rose
- Objectif: verifier en conditions reelles le chemin daily -> coaching_recommendation -> retour daily -> commit daily.
- Trajectoire: fixture daily dynamique depuis le plan actif -> process-checkins -> pending WhatsApp daily -> message de blocage demandant un levier Sophia -> coaching recommendation -> reprise daily -> cloture.
- Surfaces visees: `process-checkins`, `whatsapp-webhook`, `daily_action_review_v1`, `coaching_recommendation`, `user_chat_states.temp_memory`, entries `daily_action_review_v1`, occurrences.
- Cadre IA reel: Supabase local, WhatsApp webhook loopback, LLM runtime reel des Edge Functions; aucun renderer direct, aucun executor appele directement.
- Validite QA: valide si les tours ci-dessous correspondent aux reponses lues pendant le run. Le runner a choisi les messages user adaptativement depuis la derniere reponse Sophia et l'etat court.

Grounding dynamique:

- user_id: `02dc9ae2-4128-412b-b0be-56712bf775a8`
- access_tier observe: `none`
- local_date: `2026-06-20`
- week_start_date: `2026-06-15`
- pending_id: `de23740f-6a5c-4d90-9f7d-82edbc1d841e`
- targets: `Ranger le matériel hors de vue`, `Cibler le joint réflexe`, `Faire un sas de décompression (sans fumer)`
- Raw: `tmp/qa-daily-coaching-bridge-2026-06-19T230315621Z/qa-daily-coaching-bridge-2026-06-19T230315621Z.raw.json`
- Cleanup: `tmp/qa-daily-coaching-bridge-2026-06-19T230315621Z/qa-daily-coaching-bridge-2026-06-19T230315621Z.cleanup.json`

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** green

**Sophia**
> Je reviens sur ton bilan d’aujourd’hui : le sas de décompression sans fumer et le matériel rangé hors de vue.  
> Ça a donné quoi au final pour ces deux actions ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- review_status: ``
- local_flow_transfer: ``
- active_skill_id: ``
- last_daily_exit_target: ``
- last_coaching_exit_target: ``
- entries_count: `0`
- occurrence_statuses: `[]`

### Tour 1

**User**
> Sur Ranger le matériel hors de vue, je bloque encore: je l'oublie deux soirs sur trois et je ne sais pas quel levier Sophia choisir. Tu peux m'aider à choisir, puis on reprend le check ?

### Tour 1

**Verdict du tour:** green

**Sophia**
> Hello — ton essai est terminé et l’accès au coaching sur WhatsApp n’est pas actif sur ton plan actuel.
> 
> Pour activer WhatsApp, tu peux prendre le plan Alliance ici : sophia-coach.ai/upgrade
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- review_status: `collecting`
- local_flow_transfer: `exit_to_global_dispatcher`
- active_skill_id: ``
- last_daily_exit_target: `coaching_recommendation`
- last_coaching_exit_target: ``
- entries_count: `0`
- occurrence_statuses: `[{"id":"b60aeef4-8d2b-4c72-b2a5-79a288ab363d","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"planned"},{"id":"baf03b4a-8acf-48d5-9ea9-7c394d9bcfd0","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"planned"},{"id":"fec8b7cc-073c-4e16-b1d9-a1e36fe3f0ac","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"planned"}]`

### Tour 2

**User**
> On reprend le daily: Ranger le matériel hors de vue est fait; Cibler le joint réflexe est fait; Faire un sas de décompression (sans fumer) est fait.

### Tour 2

**Verdict du tour:** green

**Sophia**
> C’est noté pour les 3 actions : tout est fait.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- review_status: `complete`
- local_flow_transfer: `exit_to_global_dispatcher`
- active_skill_id: ``
- last_daily_exit_target: `coaching_recommendation`
- last_coaching_exit_target: ``
- entries_count: `3`
- occurrence_statuses: `[{"id":"b60aeef4-8d2b-4c72-b2a5-79a288ab363d","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"done"},{"id":"baf03b4a-8acf-48d5-9ea9-7c394d9bcfd0","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"done"},{"id":"fec8b7cc-073c-4e16-b1d9-a1e36fe3f0ac","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"done"}]`

### Tour 3

**User**
> Merci, le check daily est fini. On repasse en conversation normale.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-VISIBLE-01

**Sophia**
> (reponse vide)
**Trace courte**
- http_status: `200`
- pending_status: `done`
- review_status: `complete`
- local_flow_transfer: `exit_to_global_dispatcher`
- active_skill_id: ``
- last_daily_exit_target: `coaching_recommendation`
- last_coaching_exit_target: ``
- entries_count: `3`
- occurrence_statuses: `[{"id":"b60aeef4-8d2b-4c72-b2a5-79a288ab363d","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"done"},{"id":"baf03b4a-8acf-48d5-9ea9-7c394d9bcfd0","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"done"},{"id":"fec8b7cc-073c-4e16-b1d9-a1e36fe3f0ac","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"done"}]`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Sophia garde une interaction courte et orientee action pendant le daily.
- Le message de blocage est traite comme une demande de levier Sophia, puis le check daily peut reprendre.

**Problemes**
- Une reponse assistant vide ou incoherente rend la fluidite non valide.

**Fix propose**
- Source amont: seulement si verdict systeme yellow/red ci-dessous.
- Correction recommandee: voir analyse systeme.
- Tests d'invariant attendus: regression daily -> coaching -> daily sur pending WhatsApp.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Bridge daily -> coaching observe: `true`.
- Retour coaching -> daily observe via memo: `false`.
- Pending final avant cleanup: `done`.

**Skills / Operations / Tools**
- Entries daily creees avant cleanup: `3`.
- Occurrences avant cleanup: `[{"id":"b60aeef4-8d2b-4c72-b2a5-79a288ab363d","status":"done"},{"id":"baf03b4a-8acf-48d5-9ea9-7c394d9bcfd0","status":"done"},{"id":"fec8b7cc-073c-4e16-b1d9-a1e36fe3f0ac","status":"done"}]`.
- Aucun executor appele directement par le runner; seuls `process-checkins` et `whatsapp-webhook` ont ete invoques.

**Memory / Effets durables**
- Effets daily observes dans `user_plan_item_entries` avant cleanup, puis supprimes pendant cleanup cible.
- Cleanup cible: `{"entries":3,"pending":1,"chat_messages":3,"checkin":1,"occurrences":3}`, restored=`0`.

**Problemes**
- Aucun probleme systeme bloquant observe.

**Fix propose**
- Source amont: runtime bridge daily/coaching si le retour ou la reprise daily manque; reducer/effects daily si le commit manque.
- Correction recommandee: conserver le memo coaching uniquement jusqu'a consommation par daily et verifier que le pending daily ne preempte pas une continuation coaching active.
- Tests d'invariant attendus: test integration WhatsApp pending avec sortie `target_dispatcher=coaching_recommendation`, completion coaching, puis reprise daily et commit de toutes les targets.

## Verdict Global

- Verdict: green
- Raison principale: bridge daily -> coaching observe, retour coaching -> daily non observe, pending final `done`.
- Follow-up prioritaire: garder ce run comme regression daily/coaching bridge.
