# QA Run Report - Daily Reason Category daily-reason-category-20260624-mqscdhi8

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `daily-reason-category-20260624-mqscdhi8`
- Persona: Rose locale
- Objectif: verifier que daily renseigne ou repare `reason_category` pour des actions pas faites, notamment "j'ai craque / j'ai fume" => `emotional`.
- Trajectoire: scheduled_checkin action_evening_review_v2 -> process-checkins local -> pending daily -> `/functions/v1/test-send-message` avec `force_full_ai=true` -> entries daily -> cleanup cible.
- Surfaces visees: `daily_action_review_v1`, dispatcher local daily, reducer daily, visible daily, `user_plan_item_entries.reason_category`, pending WhatsApp.
- Cadre IA reel: Supabase local, `test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide; chaque tour user a ete choisi apres lecture de la reponse Sophia precedente par le runner adaptatif.

Grounding dynamique:

- connection: `tests/real-personas/rose/connection.json`
- checkin_id: ``
- pending_id: ``
- targets: `Faire cinq minutes de respiration calme`, `Ranger deux papiers administratifs`
- cleanup cible: `{"deleted":{"user_plan_item_entries":0,"whatsapp_pending_actions":1,"chat_messages":0,"scheduled_checkins":1,"user_habit_week_occurrences":2,"user_plan_items":2,"user_plans_v2":1},"restored":[],"verification":{"pending":[],"entries":[],"checkin":[]}}`
- raw: `tests/real-personas/rose/runs/daily-weekly/daily-reason-category-20260624-mqscdhi8.raw.json`

## 2. Tours De Conversation



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
