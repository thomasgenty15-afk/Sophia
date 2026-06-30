# QA Run Report - Daily Coaching Recommendation Daily

## 1. Contexte Du Test

- Date: 2026-06-20
- Run: `qa-one-shot-daily-20260624-r1`
- Persona: rose
- Objectif: verifier en conditions reelles le chemin daily -> coaching_recommendation -> retour daily -> commit daily.
- Trajectoire: fixture daily dynamique depuis le plan actif -> process-checkins -> pending WhatsApp daily -> message de blocage demandant un levier Sophia -> coaching recommendation -> reprise daily -> cloture.
- Surfaces visees: `process-checkins`, `whatsapp-webhook`, `daily_action_review_v1`, `coaching_recommendation`, `user_chat_states.temp_memory`, entries `daily_action_review_v1`, occurrences.
- Cadre IA reel: Supabase local, WhatsApp webhook loopback, LLM runtime reel des Edge Functions; aucun renderer direct, aucun executor appele directement.
- Validite QA: valide si les tours ci-dessous correspondent aux reponses lues pendant le run. Le runner a choisi les messages user adaptativement depuis la derniere reponse Sophia et l'etat court.

Grounding dynamique:

- user_id: `02dc9ae2-4128-412b-b0be-56712bf775a8`
- access_tier observe: `alliance`
- local_date: `2026-06-24`
- week_start_date: `2026-06-22`
- pending_id: `e6fa47a0-d598-4c02-8287-10db6cb07147`
- targets: `Faire un sas de décompression (sans fumer)`, `Ranger le matériel hors de vue`, `Cibler le joint réflexe`
- Raw: `tmp/qa-one-shot-daily-20260624-r1/qa-one-shot-daily-20260624-r1.raw.json`
- Cleanup: `tmp/qa-one-shot-daily-20260624-r1/qa-one-shot-daily-20260624-r1.cleanup.json`

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** green

**Sophia**
> Je voulais faire le point sur tes deux actions du jour : le sas de décompression (sans fumer) et ranger le matériel hors de vue.  
> Sur ta soirée d’hier, ça s’est passé comment pour ces deux points ?
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
> Rappelle-moi demain à 20h de vérifier mon bilan daily, et pour le check d'aujourd'hui : les actions prévues sont faites, sans blocage particulier.

### Tour 1

**Verdict du tour:** green

**Sophia**
> Et pour « Cibler le joint réflexe », c’est fait ou pas fait ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- review_status: `needs_clarification`
- local_flow_transfer: ``
- active_skill_id: ``
- last_daily_exit_target: ``
- last_coaching_exit_target: ``
- entries_count: `0`
- occurrence_statuses: `[{"id":"0ebfb4c0-d72b-458a-b11a-1eeff11f19b1","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"planned"},{"id":"50e77f74-426d-466a-8054-676178763c57","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"planned"},{"id":"66547d7c-91f1-4996-a00f-9a422dccc347","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"planned"}]`

### Tour 2

**User**
> Cibler le joint réflexe est fait aujourd'hui.

### Tour 2

**Verdict du tour:** green

**Sophia**
> C’est noté pour les 3 actions.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- review_status: `complete`
- local_flow_transfer: ``
- active_skill_id: ``
- last_daily_exit_target: ``
- last_coaching_exit_target: ``
- entries_count: `3`
- occurrence_statuses: `[{"id":"0ebfb4c0-d72b-458a-b11a-1eeff11f19b1","plan_item_id":"3db6278b-bd59-4401-bbdf-80b575ee14bb","status":"done"},{"id":"50e77f74-426d-466a-8054-676178763c57","plan_item_id":"ba4815d2-2af7-4d55-8c08-ec355c43988a","status":"done"},{"id":"66547d7c-91f1-4996-a00f-9a422dccc347","plan_item_id":"bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c","status":"done"}]`

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

**Verdict: red**

**Routage**
- Bridge daily -> coaching observe: `false`.
- Skill coaching actif observe: `false`.
- Retour coaching -> daily observe via memo: `false`.
- Pending final avant cleanup: `done`.

**Skills / Operations / Tools**
- Entries daily creees avant cleanup: `3`.
- Occurrences avant cleanup: `[{"id":"0ebfb4c0-d72b-458a-b11a-1eeff11f19b1","status":"done"},{"id":"50e77f74-426d-466a-8054-676178763c57","status":"done"},{"id":"66547d7c-91f1-4996-a00f-9a422dccc347","status":"done"}]`.
- Aucun executor appele directement par le runner; seuls `process-checkins` et `whatsapp-webhook` ont ete invoques.

**Memory / Effets durables**
- Effets daily observes dans `user_plan_item_entries` avant cleanup, puis supprimes pendant cleanup cible.
- Cleanup cible: `{"entries":3,"pending":1,"chat_messages":3,"checkin":1,"occurrences":3}`, restored=`2`.

**Problemes**
- Bridge/retour/commit incomplet. Famille: BF-ROUTING-01 ou BF-STATE-01 selon le tour concerne.

**Fix propose**
- Source amont: runtime bridge daily/coaching si le retour ou la reprise daily manque; reducer/effects daily si le commit manque.
- Correction recommandee: conserver le memo coaching uniquement jusqu'a consommation par daily et verifier que le pending daily ne preempte pas une continuation coaching active.
- Tests d'invariant attendus: test integration WhatsApp pending avec sortie `target_dispatcher=coaching_recommendation`, completion coaching, puis reprise daily et commit de toutes les targets.

## Verdict Global

- Verdict: red
- Raison principale: bridge daily -> coaching non observe, skill coaching actif non observe, retour coaching -> daily non observe, pending final `done`.
- Follow-up prioritaire: corriger le point de rupture observe dans les tours, puis relancer le meme scenario.
