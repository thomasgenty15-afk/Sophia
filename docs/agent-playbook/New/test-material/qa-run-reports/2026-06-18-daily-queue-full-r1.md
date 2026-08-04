# QA Run Report - Daily Queue Full R1

## 1. Contexte Du Test

- Date: 2026-06-18
- Run: `qa-daily-queue-rerun-20260618-r1`
- Persona: Rose locale
- Objectif: verifier le flow daily complet quand l'ouverture ne pose que 2 actions alors que le pending contient 3 targets; Sophia doit revenir chercher la 3e target avant de cloturer.
- Trajectoire: occurrences QA dynamiques -> `scheduled_checkins` `action_evening_review_v2` -> `process-checkins` local -> pending `daily_action_review` -> `whatsapp-webhook` local -> dispatcher local daily -> visible clarification -> commit DB -> message post-daily hors pending.
- Surfaces visees: `process-checkins`, `whatsapp_pending_actions`, `daily_action_review_v1`, reducer de file `remaining_occurrence_ids`, visible clarification, executor `log_daily_action_review`, retour hors flow daily.
- Cadre IA reel: Supabase local, fonctions locales, LLM/reducer/executor reels, aucun renderer deterministe utilise comme resultat QA, aucun fallback direct.
- Validite QA: valide. Le run suit le chemin local reel, parle a Sophia tour par tour, verifie DB et nettoie uniquement les artefacts QA crees par le run.

Artefacts:

- Raw: `tmp/qa-daily-queue-rerun-20260618-r1/qa-daily-queue-rerun-20260618-r1.raw.json`
- Cleanup: `tmp/qa-daily-queue-rerun-20260618-r1/qa-daily-queue-rerun-20260618-r1.cleanup.json`
- Cleanup cible effectue: 3 entries, 1 pending, 7 chat messages, 1 checkin, 3 occurrences.

Targets du pending:

- `Faire un sas de decompression (sans fumer)`
- `Ranger le materiel hors de vue`
- `Cibler le joint reflexe`

## 2. Tours De Conversation

### Tour 0 - Ouverture Proactive

**Verdict du tour:** green

**Sophia**
> Je repasse pour le bilan d’aujourd’hui côté soirée.
> Tu as pu faire le sas de décompression sans fumer, et garder le matériel bien hors de vue ?
> Si tu veux, tu peux me répondre en une phrase, même juste “fait / pas fait” pour chacun.

**Trace courte**

- http_status: `200`
- process_response: `processed=1`
- pending_status: `pending`
- targets_count: `3`
- asked_occurrence_ids: `["38093cce-333c-4282-8e28-a6e8d50898fd","41d37167-53d4-4ac4-83f9-d3329f27619f"]`
- not_yet_asked_occurrence_ids: `["91a5c549-c026-4b42-80b6-e72ea413b54a"]`
- durable_effect: aucun commit daily a l'ouverture

### Tour 1

**Verdict du tour:** green

**User**
> Pour les deux dont tu me parles là : le sas sans fumer est fait en rentrant, et le matériel est rangé dans une boîte. Je réponds juste sur ces deux-là.

**Sophia**
> Et pour le joint réflexe, c’est fait ou pas fait ?

**Trace courte**

- http_status: `200`
- response_owner: `daily_action_review_clarification`
- pending_status: `pending`
- review_status: `needs_clarification`
- current_focus_occurrence_ids: `["91a5c549-c026-4b42-80b6-e72ea413b54a"]`
- remaining_occurrence_ids: `[]`
- next_question_targets: `["91a5c549-c026-4b42-80b6-e72ea413b54a"]`
- entries_count: `0`
- occurrence_statuses: 3 occurrences encore `planned`

**Analyse**

- Comportement attendu: Sophia ne commit pas les deux premieres actions seules.
- Le reducer avance correctement la file: la target restante devient le focus courant.

### Tour 2

**Verdict du tour:** green

**User**
> Oui, pour le joint réflexe je l’ai fait aussi : le moment précis, c’est juste après le dîner quand je range la cuisine.

**Sophia**
> C’est noté pour les trois : le sas en rentrant, le matériel rangé, et le moment réflexe juste après le dîner quand tu ranges la cuisine.

**Trace courte**

- http_status: `200`
- response_owner: `daily_action_review`
- pending_status: `done`
- review_status: `complete`
- current_focus_occurrence_ids: `["91a5c549-c026-4b42-80b6-e72ea413b54a"]`
- remaining_occurrence_ids: `[]`
- next_question_targets: `[]`
- entries_count: `3`
- occurrence_statuses: 3 occurrences `done`
- durable_effect: 3 entries `daily_action_review_v1`

**Effets observes**

- `Faire un sas de decompression (sans fumer)`: outcome `completed`, evidence `le sas sans fumer est fait en rentrant`, occurrence `done`.
- `Ranger le materiel hors de vue`: outcome `completed`, evidence `le matériel est rangé dans une boîte`, occurrence `done`.
- `Cibler le joint reflexe`: outcome `completed`, evidence `le moment précis, c’est juste après le dîner quand je range la cuisine`, occurrence `done`.

### Tour 3 - Probe Post-Daily

**Verdict du tour:** green

**User**
> Maintenant que le check est fini, tu peux me rappeler rapidement ce que tu peux faire dans Sophia ?

**Sophia**
> Hello — ton essai est terminé et l’accès au coaching sur WhatsApp n’est pas actif sur ton plan actuel.
>
> Pour activer WhatsApp, tu peux prendre le plan Alliance ici : sophia-coach.ai/upgrade

**Trace courte**

- http_status: `200`
- response_owner: hors daily; metadata `purpose=whatsapp_paywall_upgrade`
- pending_status: `done`
- review_status: `complete`
- daily capture: non observee
- entries_count: `3`
- occurrence_statuses: 3 occurrences `done`

**Analyse**

- Le daily est bien ferme avant ce tour.
- Le message suivant ne repasse pas dans `daily_action_review_v1`; il est traite par la couche globale/paywall WhatsApp selon l'etat d'acces de la persona.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**

- L'ouverture sur 2 actions est acceptable: elle ne pretend pas couvrir tout le pending et ne valide rien avant preuve.
- Quand le user precise qu'il repond seulement aux 2 actions visibles, Sophia comprend et demande naturellement la 3e action.
- La question de clarification est courte et claire: "Et pour le joint reflexe, c'est fait ou pas fait ?"
- Le message de cloture recapitule les 3 preuves sans demander autre chose.

**Problemes**

- Aucun probleme bloquant observe sur le flow daily de ce run.
- Le Tour 3 renvoie un paywall au lieu d'une reponse produit, mais c'est hors daily et coherent avec la trace `whatsapp_paywall_upgrade`.

**Fix propose**

- Aucun fix daily requis sur ce scenario.
- Garder un test de regression sur la file restante: si `targets_count > asked_occurrence_ids.length`, une reponse partielle ne doit pas declencher `commit_success`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**

- `process-checkins` cree bien un pending `daily_action_review`.
- Le premier tour user est traite par `daily_action_review_clarification`, pas par le global.
- Apres commit, le pending passe `done`.
- Le tour post-daily n'est plus capture par le daily.

**Skills / Operations / Tools**

- Effet canonique observe: `log_daily_action_review`.
- Aucun `track_progress_plan_item` parasite observe.
- Aucun commit avant couverture complete des 3 targets.

**Side Effects**

- Avant cleanup: 3 entries creees avec `metadata.source=daily_action_review_v1`.
- Les 3 occurrences QA passent en `done`.
- Cleanup cible effectue ensuite: entries, pending, messages QA, checkin et occurrences QA supprimes.

**Invariant valide**

- Tour 1: `entries_count=0` malgre 2 actions resolues, parce qu'une target reste a collecter.
- Tour 1: `current_focus_occurrence_ids` devient la 3e occurrence.
- Tour 2: commit seulement apres evidence sur la 3e target.

## Verdict Global

- Verdict: green
- Raison principale: le flow daily gere correctement une ouverture partielle sur 2 actions, revient chercher la 3e target, commit les 3 effets, puis libere le pending.
- Follow-up prioritaire: ajouter/maintenir un test QA de regression pour ce scenario exact, car c'est le coeur du bug initial.
