# QA Run Report - daily-bridge-child-flow-20260630-r2

## 1. Contexte Du Test

- Date: 2026-06-29
- Run: `daily-bridge-child-flow-20260630-r2`
- Persona: Rose, user `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: tester un daily avec 2 plans et 4 actions, dont 2 actions ou le user dit explicitement qu'il n'y arrive pas et demande de l'aide.
- Trajectoire: fixture pending `daily_action_review` avec 4 targets -> `whatsapp-webhook` tour par tour -> `daily_action_review_v1` -> `log_daily_action_review` -> verification DB -> cleanup cible.
- Surfaces visees: pending daily, dispatcher local daily, visible daily `explain_target` et clarifications, reducer/effects daily, `user_plan_item_entries.reason_category`, statuts occurrences, retour hors pending.
- Cadre IA reel: Supabase local, vrai webhook WhatsApp local, aucun renderer deterministe, aucun fallback direct, aucun `test-send-message` pendant le pending daily.
- Validite QA: valide pour le flow daily local. Limite: pending fixture dynamique creee directement pour eviter de dependre de `process-checkins`; le chemin teste est bien `whatsapp-webhook -> handlePendingActions -> daily_action_review_v1`.
- Raw: `tests/real-personas/rose/runs/daily-weekly/daily-bridge-child-flow-20260630-r2.raw.json`
- Cleanup: effectue et verifie.

Targets du run:

- undefined: Ranger deux papiers administratifs
- undefined: Journée sans fumer
- undefined: Préparer la pochette documents
- undefined: Respiration cinq minutes

## 2. Tours De Conversation

### Tour 0 - Ouverture daily

**Verdict du tour:** green

**User**
> N/A - ouverture proactive daily depuis le pending QA.

**Sophia**
> Je fais un petit point sur ta soirée : comment ça s’est passé pour la journée sans fumer et les 5 minutes de respiration quand une envie montait ?

**Trace courte**
- http_status: opening fixture OK
- response_owner: pending daily
- selected_handler: `daily_action_review_v1`
- route_reason: pending `chat_capability=daily_action_review`
- safety: none
- direct_effects: none
- operation: pending daily ouvert
- pending_confirmation: pending `efdbc7ad-5983-4a3a-94ed-7b8b6842d62a`
- memory_plan: N/A
- executed_tools: none
- durable_effect: pending contient 4 targets, ouverture configuree sur les 2 premieres

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, vas-y pour le bilan.

**Sophia**
> Je fais un petit point sur ta soirée : comment ça s’est passé pour la journée sans fumer et les 5 minutes de respiration quand une envie montait ?

**Trace courte**
- http_status: `200`
- response_owner: `scheduled_checkin`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`collecting`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je ne me souviens plus : « Journée sans fumer », ça devait faire quoi exactement ?

**Sophia**
> « Journée sans fumer », c’était tenir la journée sans fumer de joint, en faisant attention au moment où l’envie monte. Faisable aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok, alors pas faite : j’ai fumé après une contrariété en fin d’après-midi. Oui, ça reste à garder.

**Sophia**
> Pour **Respiration cinq minutes**, c’est fait ou pas fait aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et « Respiration cinq minutes », je ne vois plus trop ce que ça devait m’apporter. Tu peux me rappeler ?

**Sophia**
> Respiration cinq minutes, c’est prendre cinq minutes pour respirer calmement, afin de traverser une envie sans fumer.  
> C’est un appui court pour te laisser passer le moment sans réagir tout de suite.  
> 
> Fait ou pas fait aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pas faite non plus : j’oublie à chaque fois quand l’envie monte. Je n’y arrive pas, tu peux m’aider à trouver le bon levier Sophia pour réussir celle-là ?

**Sophia**
> Je partirais sur une carte d’attaque, technique ancre visuelle : comme tu oublies au moment où l’envie monte, le plus utile est d’avoir un repère visible qui te relance tout de suite vers la respiration. Tu la prépares depuis l’action « Respiration cinq minutes » dans le Plan.
> 
> Pour « Ranger deux papiers administratifs », c’est bien : fait, pas fait, ou en partie ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_coaching_recommendation`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 6

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour « Ranger deux papiers administratifs », j’ai oublié l’idée. Ça servait à quoi déjà ?

**Sophia**
> Ranger deux papiers administratifs, c’était simplement de choisir deux courriers, puis de les trier et les ranger ou les jeter.  
> Pour « Ranger deux papiers administratifs », c’est bien : fait, pas fait, ou en partie ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 7

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Non, pas fait : je bloque complètement et je repousse dès que je vois les papiers. Aide-moi à trouver quoi faire pour y arriver.

**Sophia**
> Je partirais sur une carte d’attaque, technique texte magique : ton blocage a l’air de venir du réflexe mental au moment de voir les papiers, donc une phrase courte peut t’aider à couper l’élan de rejet et démarrer.
> 
> Pour « Préparer la pochette documents », tu le considères plutôt fait ou pas fait ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_coaching_recommendation`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 8

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et la pochette documents, pareil, je ne sais plus ce que c’était censé régler. Tu m’expliques ?

**Sophia**
> Préparer la pochette documents, c’était pour regrouper tes papiers utiles au même endroit, bien visibles, afin de te simplifier les recherches et de réduire le blocage quand tu vois les documents.  
> Fait ou pas fait aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 9

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pas faite : un imprévu familial m’a pris le créneau. Je veux la garder pour demain.

**Sophia**
> C’est clôturé pour aujourd’hui : 4 actions ont été prises en compte.

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily done`
- safety: none observed
- direct_effects: `log_daily_action_review x4`
- operation: `daily_action_review_v1`
- pending_confirmation: `done`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`4`, review_status=`complete`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le daily garde l'ownership sur les tours du pending.
- Sophia avance dans la file des actions et va chercher les actions du second plan.
- Le daily peut suspendre vers `coaching_recommendation` uniquement quand la demande d'aide est explicite.

**Problemes**
- Aucun probleme de fluidite bloquant observe.

**Fix propose**
- Source amont: visible daily / stage target context si une reference vague apparait.
- Correction recommandee: continuer a nommer explicitement la target quand le daily change d'action.
- Tests d'invariant attendus: multi-target daily avec changement de plan nomme toujours la target suivante.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours du pending passent via `whatsapp-webhook`.
- Le pending daily reste owner jusqu'au commit.
- Handoffs coaching observes: `0`; messages coaching observes: `2`.
- Aucun `normal_reply` ne capture les preuves daily.

**Skills / Operations / Tools**
- Skill observe: `daily_action_review_v1`.
- Effet canonique attendu: `log_daily_action_review`.
- Aucun `create_one_shot_reminder` ni outil hors scope.

**Memory / Effets durables**
- Préparer la pochette documents: outcome=`missed`, reason_category=`external`, reason_text=`un imprévu familial m’a pris le créneau`, blocker_hint=`external`
- Respiration cinq minutes: outcome=`missed`, reason_category=`forgot`, reason_text=`j’oublie à chaque fois quand l’envie monte`, blocker_hint=`forgot`
- Ranger deux papiers administratifs: outcome=`missed`, reason_category=`too_hard`, reason_text=`je bloque complètement et je repousse dès que je vois les papiers`, blocker_hint=`too_hard`
- Journée sans fumer: outcome=`missed`, reason_category=`emotional`, reason_text=`j’ai fumé après une contrariété en fin d’après-midi`, blocker_hint=`emotional`

**Problemes**
- Aucun mismatch reason_category observe.

**Fix propose**
- Source amont: n/a.
- Correction recommandee: conserver les invariants reason_category sur craquage/fume, oubli, fatigue et imprévu.
- Tests d'invariant attendus: webhook pending 4 targets cree 4 entries avec categories attendues.

## Verdict Global

**green**

Le daily fonctionne correctement sur ce run: 2 plans, 4 actions, demandes d'aide explicites routees vers coaching quand applicable, puis commit durable complet.