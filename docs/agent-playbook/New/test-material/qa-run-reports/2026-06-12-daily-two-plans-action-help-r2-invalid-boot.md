# QA Run Report - Daily Two Plans Action Help R2 Invalid Boot

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `daily-two-plans-action-help-20260612144355-r2`
- Persona: Rose, connexion locale `tests/real-personas/rose/connection.json`
- Objectif: tester le daily action review avec deux plans, une action par plan, puis deux messages utilisateur separes ou le user demande ce que chaque action veut dire parce qu'il a oublie.
- Trajectoire: fixture QA dynamique -> `process-checkins` -> ouverture proactive `daily_action_review` -> deux tours entrants via `whatsapp-webhook`.
- Surfaces visees: `process-checkins`, `whatsapp-send`, `whatsapp_pending_actions`, `whatsapp-webhook`, dispatcher local `daily_action_review_v1`, reducer local, visible agent.
- Cadre IA reel: Supabase local, fonctions Edge locales, run hors sandbox, pas de renderer deterministe, pas de fallback direct, pas de fabrication de reponse assistant.
- Validite QA: invalide pour juger la conversation daily apres ouverture; valide comme run rouge technique, car l'ouverture reelle passe mais `whatsapp-webhook` retourne `503 BOOT_ERROR` sur les deux messages utilisateur.

Tentatives non exploitees:

- `daily-two-plans-action-help-20260612144326-r2`: echec de setup avant flow, contrainte unique `scheduled_checkins_user_event_time_unique` pendant le decalage temporaire de rappels existants. Cleanup/restauration effectue.
- `daily-two-plans-action-help-20260612144340-r2`: echec de setup avant flow, contrainte unique `user_plans_v2_transformation_version_key`. Cleanup/restauration effectue.
- `daily-two-plans-action-help-20260612144355-r2`: tentative exploitable jusqu'a l'ouverture, puis blocage runtime sur les tours entrants.

Nettoyage: effectue. Verification finale du runner: `qaCheckin=[]`, `qaPending=[]`, `qaEntries=[]`, `qaPlans=[]`, `qaMessages=[]`. Les check-ins preexistants de Rose ont ete restaures depuis snapshot.

Artefacts bruts:

- `tmp/daily-two-plans-action-help-20260612144355-r2/result-before-cleanup.json`
- `tmp/daily-two-plans-action-help-20260612144355-r2/result.json`

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> Je reviens sur tes deux actions du jour : Faire cinq minutes de respiration calme et Ranger deux papiers administratifs.  
> Comment ca s'est passe pour toi ?

**Trace courte**
- source: `process-checkins`
- http_status: `200`
- processed: `1`
- selected surface: `action_evening_review_v2`
- pending_status: `pending`
- chat_capability: `daily_action_review`
- review_state.status: `collecting`
- targets.length: `2`
- initial_note_information: presente
- direct_effects: assistant opening + pending daily cree

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> J'ai oublie l'action respiration. C'est quoi exactement ? Ca consiste en quoi, concretement ?

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: `503`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- pending_status: `pending`
- entries_count: `0`
- occurrence_statuses: `planned`, `planned`
- error: `{"code":"BOOT_ERROR","message":"Worker failed to boot (please check logs)"}`

**Analyse si yellow/red**
- Symptome: le message entrant n'atteint pas le dispatcher local daily; le worker `whatsapp-webhook` ne boote pas.
- Source amont probable: import legacy restant dans `supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts`.
- Preuve systeme: `/usr/local/bin/deno check supabase/functions/whatsapp-webhook/index.ts` echoue avec `TS2305: Module ... weekly_review/runtime.ts has no exported member 'isExplicitPendingApplyConfirmation'` sur `adjust_plan_operation_bridge.ts:14`.
- Owner runtime: boot du worker `whatsapp-webhook`, dependency graph Sophia Brain / bridge adjust-plan.
- Meilleure correction selon les guidelines: corriger le contrat d'import du bridge adjust-plan, puis relancer le meme run. Ne pas contourner par renderer, direct executor ou fallback.
- Pourquoi ce n'est pas un patch local daily: le daily n'est jamais appele; l'echec est anterieur au dispatcher daily.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Et pour les deux papiers administratifs, j'ai oublie aussi : c'est quoi l'action, je dois faire quoi precisement ?

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: `503`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- pending_status: `pending`
- entries_count: `0`
- occurrence_statuses: `planned`, `planned`
- error: `{"code":"BOOT_ERROR","message":"Worker failed to boot (please check logs)"}`

**Analyse si yellow/red**
- Symptome: deuxieme message entrant bloque au meme niveau que le Tour 1.
- Source amont probable: meme boot error du worker `whatsapp-webhook`.
- Owner runtime: boot du worker `whatsapp-webhook`.
- Meilleure correction selon les guidelines: restaurer la compilation/boot du chemin IA reel local, puis rerun avec deux messages adaptes apres lecture de la reponse Sophia precedente.
- Pourquoi ce n'est pas un patch local daily: aucune trace daily dispatcher/reducer/visible agent n'est produite sur ce tour.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- L'ouverture proactive est naturelle et couvre bien les deux actions.
- La question d'ouverture ne force pas une completion; elle laisse le user expliquer ce qui s'est passe.

**Problemes**
- Tours 1 et 2: Sophia ne repond pas aux demandes d'explication. Famille: BF-TEST-01. Impact: impossible de savoir si le flow daily sait traiter "j'ai oublie ce que c'est" action par action. Severite: red.

**Fix propose**
- Source amont: boot du worker `whatsapp-webhook`, dependency graph Sophia Brain.
- Correction recommandee: corriger l'import legacy `isExplicitPendingApplyConfirmation` ou le remplacer par le contrat actuel du bridge adjust-plan, sans restaurer le vieux runtime weekly et sans fallback visible.
- Tests d'invariant attendus: `deno check` du worker entrant, puis rerun daily avec deux demandes d'explication separees; verifier que Sophia explique l'action sans marquer l'action comme faite.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 0 prouve le chemin `process-checkins -> whatsapp-send -> pending daily` avec `initial_note_information`.
- Tours 1 et 2 ne produisent aucun routage observable: le worker entrant echoue avant `whatsapp_pending_actions` / dispatcher local.

**Skills / Operations / Tools**
- Aucun skill conversationnel n'est execute apres les messages user.
- Aucun effet durable daily n'est applique: pas d'entree `user_plan_item_entries`, occurrences toujours `planned`, pending toujours `pending`.

**Memory / Effets durables**
- La fixture cree deux plans QA, deux items actifs, deux occurrences planifiees et un scheduled checkin daily.
- `process-checkins` cree le pending daily attendu.
- Cleanup cible effectue: toutes les lignes QA ont ete supprimees et les lignes preexistantes restaurees.

**Problemes**
- Tours 1 et 2: worker entrant casse. Famille: BF-TEST-01. Impact systeme: aucun run IA reel local via `whatsapp-webhook` ne peut valider le daily tant que la fonction ne boote pas. Severite: red.

**Fix propose**
- Source amont: `supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts:14`.
- Correction recommandee: aligner le bridge adjust-plan sur les exports actuels de `weekly_review/runtime.ts` ou extraire la logique necessaire dans le bon owner, sans dependance legacy.
- Tests d'invariant attendus:
  - `/usr/local/bin/deno check supabase/functions/whatsapp-webhook/index.ts`
  - test integration du bridge adjust-plan;
  - rerun daily reel local `process-checkins -> whatsapp-webhook` avec deux demandes d'explication, une par action;
  - verification DB: pending non commite pendant les demandes d'aide, occurrences restent `planned`, aucune entree daily creee sans evidence d'execution.

## Verdict Global

- Verdict: red
- Raison principale: l'ouverture daily fonctionne, mais le chemin entrant reel `whatsapp-webhook` ne boote pas sur les messages user.
- Follow-up prioritaire: corriger le boot worker (`isExplicitPendingApplyConfirmation` legacy), relancer `deno check`, puis refaire ce run jusqu'aux deux demandes d'explication.
