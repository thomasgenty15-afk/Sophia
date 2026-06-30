# QA Run Report - daily-two-plans-four-actions-webhook-20260624-mqtc4b4p

## 1. Contexte Du Test

- Date: 2026-06-25
- Run: `daily-two-plans-four-actions-webhook-20260624-mqtc4b4p`
- Persona: Rose, user `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: tester un daily avec 2 plans et 4 actions, via le bon chemin `whatsapp-webhook`, en verifiant la collecte de non-realisation et les `reason_category`.
- Trajectoire: fixture pending `daily_action_review` avec 4 targets -> `whatsapp-webhook` tour par tour -> `daily_action_review_v1` -> `log_daily_action_review` -> verification DB -> cleanup cible.
- Surfaces visees: pending daily, dispatcher local daily, visible daily, reducer/effects daily, `user_plan_item_entries.reason_category`, statuts occurrences, retour hors pending.
- Cadre IA reel: Supabase local, vrai webhook WhatsApp local, aucun renderer deterministe, aucun fallback direct, aucun `test-send-message` pendant le pending daily.
- Validite QA: valide pour le flow daily local. Limite: pending fixture dynamique creee directement pour eviter de dependre de `process-checkins`; le chemin teste est bien `whatsapp-webhook -> handlePendingActions -> daily_action_review_v1`.
- Raw: `tests/real-personas/rose/runs/daily-weekly/daily-two-plans-four-actions-webhook-20260624-mqtc4b4p.raw.json`
- Cleanup: effectue et verifie.

Targets du run:

- QA plan cannabis daily-two-plans-four-actions-webhook-20260624-mqtc4b4p: Journée sans fumer
- QA plan cannabis daily-two-plans-four-actions-webhook-20260624-mqtc4b4p: Respiration cinq minutes
- QA plan administratif daily-two-plans-four-actions-webhook-20260624-mqtc4b4p: Ranger deux papiers administratifs
- QA plan administratif daily-two-plans-four-actions-webhook-20260624-mqtc4b4p: Préparer la pochette documents

## 2. Tours De Conversation

### Tour 0 - Ouverture daily

**Verdict du tour:** green

**User**
> N/A - ouverture proactive daily depuis le pending QA.

**Sophia**
> Je fais le point sur aujourd'hui : Journée sans fumer et Respiration cinq minutes.
> Tu en es où sur ces deux-là ?

**Trace courte**
- http_status: opening fixture OK
- response_owner: pending daily
- selected_handler: `daily_action_review_v1`
- route_reason: pending `chat_capability=daily_action_review`
- safety: none
- direct_effects: none
- operation: pending daily ouvert
- pending_confirmation: pending `056e1e32-8bf6-4eb3-9a1b-dd71f4c87050`
- memory_plan: N/A
- executed_tools: none
- durable_effect: pending contient 4 targets, ouverture configuree sur les 2 premieres

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour la journée sans fumer, pas faite : j’ai craqué en fin d’après-midi et j’ai fumé. Pour la respiration, je n’ai pas encore répondu.

**Sophia**
> Pour « Respiration cinq minutes », c’est fait ou pas fait ?

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

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, la journée sans fumer reste pertinente pour demain.

**Sophia**
> Pour « Ranger deux papiers administratifs », c’est fait ou pas fait ?

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
> La respiration cinq minutes, pas faite non plus : j’ai oublié quand l’envie est montée. Oui, c’est à garder.

**Sophia**
> Pour « Ranger deux papiers administratifs », c’est fait ou pas fait ?

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
> Pour l’action Ranger deux papiers administratifs, pas faite : j’étais épuisée et je n’avais plus d’énergie. Je ne parle pas encore de la pochette documents. Ça reste pertinent.

**Sophia**
> Pour « Préparer la pochette documents », c’est fait ou pas fait ?

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
> La pochette documents, pas faite non plus : un imprévu familial m’a pris le créneau. Oui, je veux la garder.

**Sophia**
> C’est bon, les 4 actions de la journée sont clôturées.

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

### Tour 6

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Merci, on peut s’arrêter là pour ce soir.

**Sophia**
> C’est bon, on s’arrête là pour ce soir. Repose-toi, on reprend demain si tu veux 🙂

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp-webhook`
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
- La conversation reste courte et ne part pas vers `coaching_recommendation`.

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
- Aucun `normal_reply` ou `coaching_recommendation` ne capture les preuves daily.

**Skills / Operations / Tools**
- Skill observe: `daily_action_review_v1`.
- Effet canonique attendu: `log_daily_action_review`.
- Aucun `create_one_shot_reminder` ni outil hors scope.

**Memory / Effets durables**
- Respiration cinq minutes: outcome=`missed`, reason_category=`forgot`, reason_text=`j’ai oublié quand l’envie est montée`, blocker_hint=`forgot`
- Journée sans fumer: outcome=`missed`, reason_category=`emotional`, reason_text=`j’ai craqué en fin d’après-midi`, blocker_hint=`emotional`
- Ranger deux papiers administratifs: outcome=`missed`, reason_category=`fatigue`, reason_text=`j’étais épuisée et je n’avais plus d’énergie`, blocker_hint=`fatigue`
- Préparer la pochette documents: outcome=`missed`, reason_category=`external`, reason_text=`un imprévu familial m’a pris le créneau`, blocker_hint=`external`

**Problemes**
- Aucun mismatch reason_category observe.

**Fix propose**
- Source amont: n/a.
- Correction recommandee: conserver les invariants reason_category sur craquage/fume, oubli, fatigue et imprévu.
- Tests d'invariant attendus: webhook pending 4 targets cree 4 entries avec categories attendues.

## Verdict Global

**green**

Le daily fonctionne correctement sur ce run: 2 plans, 4 actions, ownership conserve via webhook, commit durable complet et categories de raison conformes.