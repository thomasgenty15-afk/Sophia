# QA Run Report - Weekly Planning Gate

## 1. Contexte Du Test

- Date: 2026-05-16
- Run: `weekly-gate-20260516-r6`
- Persona: conversationnel Paul-like fatigue; compte technique temporaire `qa-weekly-gate-weekly-gate-20260516-r6@example.com`
- Objectif: verifier que la validation de la semaine suivante est bloquee avant le weekly, puis que le weekly produit une proposition sans patch automatique.
- Trajectoire: scheduler local samedi -> tentative confirm_bundle trop tot -> weekly_progress_review_v2 via process-checkins.
- Surfaces visees: `schedule-whatsapp-v2-checkins`, `habit-week-planning-v1`, `process-checkins`, `weekly_adaptive_review_v1`, `user_habit_week_plans`, `user_plan_item_entries`.
- Cadre IA reel: Supabase local, Edge Functions locales, donnees creees dynamiquement, pas de renderer deterministe comme verdict.
- Validite QA: valide pour le workflow weekly/planning; conversation utilisateur limitee car le point teste est le gate de validation.

Raw: `tmp/weekly-planning-gate-qa/weekly-gate-20260516-r6/raw.json`

## 2. Tours De Conversation

### Tour 0 - Setup systeme

**Trace courte**
- persona technique: `qa-weekly-gate-weekly-gate-20260516-r6@example.com`
- timezone: `Europe/Paris`
- local_now: `2026-05-16 sat`
- current_week_start: `2026-05-11`
- next_week_start: `2026-05-18`
- items: `Session focus courte`, `Marche de decompression`
- daily_action_review_v1 entries: `6`

### Tour 1 - Scheduler samedi

**Systeme**
> Appel local `schedule-whatsapp-v2-checkins` avec `user_id` de la connexion temporaire.

**Trace courte**
- http_status: `200`
- weekly_planning_validation_prompt_created: `0`
- scheduled_checkins_created: `0`

### Tour 2 - Tentative de validation trop tot

**User/Systeme**
> Appel utilisateur reel `habit-week-planning-v1.confirm_bundle` pour la semaine suivante avant le weekly.

**Trace courte**
- http_status: `409`
- error: `weekly_planning_locked_until_weekly_review`
- next_week_confirmed_plans: `0`

### Tour 3 - Weekly progress/adaptive review

**Sophia**
> J’ai surtout vu ce blocage cette semaine : fatigue…  
> Tu veux qu’on parte sur une semaine “pont” pour te laisser reprendre de l’élan sans pression ?

**Trace courte**
- http_status: `200`
- scheduled_checkin_status: `sent`
- weekly_adaptive_review_present: `true`
- habit_verdict: `failed`
- daily_evidence_coverage: `complete`
- daily_evidence_covered_count: `6`
- week_strategy: `bridge_week`
- plan_patch.requires_confirmation: `true`
- plan_patch.operations: `insert_bridge_week`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le message weekly reste court et n'applique rien silencieusement.
- La validation suivante n'est pas proposee avant le weekly.

**Problemes**
- Aucun probleme bloquant observe sur ce run cible.

**Fix propose**
- Si un prochain run conversationnel complet est demande, jouer la reponse utilisateur au weekly et verifier la confirmation de plan dans le dashboard.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Scheduler samedi: `0` prompt de validation cree, attendu `0`.
- API planning: confirmation trop tot retourne `409`, attendu `409`.

**Skills / Operations / Tools**
- Weekly adaptive review present: `true`.
- Habit verdict: `failed`.
- Strategy: `bridge_week`.
- Plan patch requires confirmation: `true`.

**Memory / Effets durables**
- Daily evidence consumed: coverage `complete`, covered `6` / actions `6`.
- Next week confirmed plans after early attempt: `0`.
- Supports in weekly item decisions: `0`.

**Problemes**
- Aucun probleme systeme bloquant observe.

**Fix propose**
- Aucun fix obligatoire pour ce gate; garder un run conversationnel de suivi pour la validation post-weekly.

## Verdict Global

- Verdict: green
- Raison principale: le gate samedi bloque la validation trop tot, le backend refuse la confirmation prematuree, et le weekly conserve requires_confirmation=true.
- Follow-up prioritaire: tester une confirmation utilisateur apres weekly dans une prochaine variante.
