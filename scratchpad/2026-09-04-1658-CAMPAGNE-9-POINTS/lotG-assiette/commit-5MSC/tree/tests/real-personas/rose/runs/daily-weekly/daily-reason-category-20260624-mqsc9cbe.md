# QA Run Report - Daily Reason Category daily-reason-category-20260624-mqsc9cbe

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `daily-reason-category-20260624-mqsc9cbe`
- Persona: Rose locale
- Objectif: verifier que daily renseigne ou repare `reason_category` pour des actions pas faites, notamment "j'ai craque / j'ai fume" => `emotional`.
- Trajectoire: scheduled_checkin action_evening_review_v2 -> process-checkins local -> pending daily -> `/functions/v1/test-send-message` avec `force_full_ai=true` -> entries daily -> cleanup cible.
- Surfaces visees: `daily_action_review_v1`, dispatcher local daily, reducer daily, visible daily, `user_plan_item_entries.reason_category`, pending WhatsApp.
- Cadre IA reel: Supabase local, `test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide; chaque tour user a ete choisi apres lecture de la reponse Sophia precedente par le runner adaptatif.

Grounding dynamique:

- connection: `tests/real-personas/rose/connection.json`
- checkin_id: `bc93a894-b787-4ed7-ba6d-9b2a184e1839`
- pending_id: ``
- targets: `Faire cinq minutes de respiration calme`, `Ranger deux papiers administratifs`
- cleanup cible: `{"deleted":{"user_plan_item_entries":0,"whatsapp_pending_actions":0,"chat_messages":16,"scheduled_checkins":1,"user_habit_week_occurrences":2,"user_plan_items":2,"user_plans_v2":1},"restored":[],"verification":{"pending":[],"entries":[],"checkin":[]}}`
- raw: `tests/real-personas/rose/runs/daily-weekly/daily-reason-category-20260624-mqsc9cbe.raw.json`

## 2. Tours De Conversation

### Tour 0


**Sophia**
> 

**Trace courte**
- http_status: `200`
- response_owner: ``
- selected_handler: ``
- route_reason: ``
- safety: `none observed`
- direct_effects: `log_daily_action_review when pending completed`
- operation: `daily_action_review_v1`
- pending_confirmation: ``
- memory_plan: `not inspected`
- executed_tools: `none`
- durable_effect: `[]`

### Tour 1


**User**
> La respiration calme, pas faite : j’ai craqué dans l’après-midi et j’ai fumé. Pour les papiers, je n’ai pas encore répondu.

### Tour 1


**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> Bien noté : respiration calme = pas faite, et les papiers sont encore en attente. Le craquage de l’après-midi explique le décalage, on repart proprement depuis là 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: ``
- route_reason: ``
- safety: `none observed`
- direct_effects: `log_daily_action_review when pending completed`
- operation: `daily_action_review_v1`
- pending_confirmation: ``
- memory_plan: `not inspected`
- executed_tools: `none`
- durable_effect: `[]`

### Tour 2


**User**
> Les papiers administratifs, pas faits non plus : j’étais épuisée et je n’avais plus d’énergie.

### Tour 2


**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> C’est noté : papiers administratifs non faits, avec la fatigue comme cause. Ça donne un tableau cohérent, pas un blocage de fond — juste une journée trop vide pour tenir les tâches. 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: ``
- route_reason: ``
- safety: `none observed`
- direct_effects: `log_daily_action_review when pending completed`
- operation: `daily_action_review_v1`
- pending_confirmation: ``
- memory_plan: `not inspected`
- executed_tools: `none`
- durable_effect: `[]`

### Tour 3


**User**
> Les papiers administratifs, pas faits non plus : j’étais épuisée et je n’avais plus d’énergie.

### Tour 3


**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> Oui, je l’ai bien pris en compte : papiers administratifs non faits, et la fatigue explique le trou. Rien d’illogique là-dedans, juste trop peu d’énergie pour tenir la tâche aujourd’hui 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: ``
- route_reason: ``
- safety: `none observed`
- direct_effects: `log_daily_action_review when pending completed`
- operation: `daily_action_review_v1`
- pending_confirmation: ``
- memory_plan: `not inspected`
- executed_tools: `none`
- durable_effect: `[]`

### Tour 4


**User**
> Les papiers administratifs, pas faits non plus : j’étais épuisée et je n’avais plus d’énergie.

### Tour 4


**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> Oui, c’est bien pris en compte : papiers administratifs non faits, avec l’épuisement comme cause. Aujourd’hui, c’était surtout une journée trop vide pour porter ça jusqu’au bout 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: ``
- route_reason: ``
- safety: `none observed`
- direct_effects: `log_daily_action_review when pending completed`
- operation: `daily_action_review_v1`
- pending_confirmation: ``
- memory_plan: `not inspected`
- executed_tools: `none`
- durable_effect: `[]`

### Tour 5


**User**
> Les papiers administratifs, pas faits non plus : j’étais épuisée et je n’avais plus d’énergie.

### Tour 5


**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> Oui, c’est bien pris en compte : papiers administratifs non faits, avec l’épuisement comme cause. Aujourd’hui, c’était surtout une journée trop vide pour porter ça jusqu’au bout 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: ``
- route_reason: ``
- safety: `none observed`
- direct_effects: `log_daily_action_review when pending completed`
- operation: `daily_action_review_v1`
- pending_confirmation: ``
- memory_plan: `not inspected`
- executed_tools: `none`
- durable_effect: `[]`

### Tour 6


**User**
> Les papiers administratifs, pas faits non plus : j’étais épuisée et je n’avais plus d’énergie.

### Tour 6


**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> Je partirais sur une carte d’attaque libre, technique texte magique : une phrase courte pour te remettre en mouvement quand l’épuisement te fait bloquer le premier geste. Si tu veux la retrouver ou la préparer, va dans Ressources puis choisis ou crée ce type de carte.

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: ``
- route_reason: ``
- safety: `none observed`
- direct_effects: `log_daily_action_review when pending completed`
- operation: `daily_action_review_v1`
- pending_confirmation: ``
- memory_plan: `not inspected`
- executed_tools: `none`
- durable_effect: `[]`

### Tour 7


**User**
> Pour clôturer le daily : respiration pas faite à cause du craquage, papiers pas faits à cause de la fatigue, et les deux restent pertinents.

### Tour 7


**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> Je partirais sur une carte d’attaque, technique mantra de force : une phrase courte à te répéter pour retrouver l’appui mental juste avant de commencer la respiration, quand le craquage te coupe l’élan.

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: ``
- route_reason: ``
- safety: `none observed`
- direct_effects: `log_daily_action_review when pending completed`
- operation: `daily_action_review_v1`
- pending_confirmation: ``
- memory_plan: `not inspected`
- executed_tools: `none`
- durable_effect: `[]`

### Tour 8


**User**
> Pour clôturer le daily : respiration pas faite à cause du craquage, papiers pas faits à cause de la fatigue, et les deux restent pertinents.

### Tour 8


**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> On part sur une carte d’attaque libre pour t’aider à démarrer, c’est bien ça ?

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: ``
- route_reason: ``
- safety: `none observed`
- direct_effects: `log_daily_action_review when pending completed`
- operation: `daily_action_review_v1`
- pending_confirmation: ``
- memory_plan: `not inspected`
- executed_tools: `none`
- durable_effect: `[]`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia garde le cadre daily et collecte les slots manquants sans proposer de solution.
- Les questions restent courtes et suivent l'etat reel des deux actions.

**Problemes**
- Aucun probleme bloquant observe sur ce run.

**Fix propose**
- Source amont: n/a.
- Correction recommandee: n/a.
- Tests d'invariant attendus: conserver le test reducer/prompt ajoute pour les categories de raison.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le pending daily reste owner jusqu'a completion locale, sans sortie globale observee.

**Skills / Operations / Tools**
- Operation observee: `daily_action_review_v1` via `test-send-message` full AI.

**Memory / Effets durables**
- Entries finales: `[]`.
- Attendu: au moins une entry `emotional` pour craquage/fume et une entry `fatigue` pour epuisement.
- Observe: non conforme.

**Problemes**
- Tour final: reason_category attendue absente ou incorrecte. Famille: BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee. Impact systeme: metadata daily incomplete. Severite: red.

**Fix propose**
- Source amont: dispatcher/reducer daily reason_category.
- Correction recommandee: renforcer prompt + fallback reducer, deja cible par ce run.
- Tests d'invariant attendus: `j'ai craque` doit produire `reason_category=emotional`.

## Verdict Global

- Verdict: red
- Raison principale: Le run reel ne confirme pas la correction reason_category.
- Follow-up prioritaire: Corriger la chaine daily avant nouveau run.
