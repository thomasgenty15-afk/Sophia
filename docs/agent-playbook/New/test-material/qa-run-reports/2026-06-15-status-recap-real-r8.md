# QA Run Report — status-recap-real-r8

## 1. Contexte Du Test

- Date: 2026-06-15 Europe/Paris
- Run: `status-recap-real-r8`
- Persona: `qa-skill`, connexion temporaire `status_recap_status_recap_20260615_r8`, user `5e9462a1-b6b7-4c84-bc74-eeda6e85a40c`
- Objectif: verifier en IA reelle locale que le flow `status_recap` reste robuste apres ajout du merge server-owned/audit de mutation: activation, active local dispatcher, cancelled reminders, sources, absence de mutation.
- Trajectoire: point factuel read-only -> relance factuelle -> follow-up rappels annules -> demande de sources.
- Surfaces visees: dispatcher global entree `status_recap`, dispatcher local actif, reducer state server-owned, `state_mutation_audit`, visible agent `status_compact`/`cancelled_objects`/`explain_sources`, projection DB, cleanup temp memory.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer/fallback deterministe, execution hors sandbox. Note: le runner herite injecte un temps simule `client_now_iso=2026-06-12T10:00:00+02:00`; ce run valide le flow/routing/state, pas une regression de date courante.
- Validite QA: valide. Les quatre tours ont retourne HTTP 200 via le chemin IA reel. Cleanup DB et Auth temporaire effectues.

Artefacts:
- Raw: `tests/real-personas/qa-skill/runs/status_recap/2026-06-15-status-recap-real-r8.raw.json`
- Durable: `tests/real-personas/qa-skill/runs/status_recap/2026-06-15-status-recap-real-r8.durable.json`
- Cleanup: `tests/real-personas/qa-skill/runs/status_recap/2026-06-15-status-recap-real-r8.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Tu peux me dire simplement ce qui est vraiment enregistré dans mon espace, sans rien changer ?

**Sophia**
> Dans ton espace, je vois un rappel pour 'relire le dossier budget' à 09h30 et ton point hebdo chaque lundi à 08h45. Concernant nos échanges, tu as configuré un ton chaleureux et direct.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `answer_status`
- visible_task: `status_compact`
- reason_code: `status_recap_local_answer_status`
- state_mutation_audit: present; restored_fields=[], cleared_fields=[], rejected_changes=[]
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=1`, `coach_preference_count=9`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, fais-moi le point maintenant, en restant juste factuel.

**Sophia**
> Voici le point factuel sur ton espace. Tu as un rappel pour 'relire le dossier budget' le 13 juin à 09:30 et ton 'faire le point hebdo' chaque lundi à 08:45. Un 'ancien rappel annulé de devis' figure dans tes archives récentes. Pour nos échanges, tes préférences sont réglées sur un ton direct et chaleureux, avec un focus sur la discipline et un niveau de challenge équilibré.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by `active_status_recap_uses_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `answer_status`
- visible_task: `status_compact`
- reason_code: `status_recap_local_answer_status`
- state_mutation_audit: present; restored_fields=[], cleared_fields=[], rejected_changes=[]
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=1`, `coach_preference_count=9`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et pour les rappels annulés, tu vois quelque chose ou pas ?

**Sophia**
> Oui, je vois un rappel annulé : celui pour l'ancien rappel de devis qui était prévu à 17h00. Sinon, tu as toujours ton rappel pour relire le dossier budget à 09h30 et ton point hebdo chaque lundi à 08h45. Je suis ravie de t'aider à y voir plus clair, tu as besoin d'autre chose ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by `active_status_recap_uses_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `answer_cancelled_objects`
- visible_task: `cancelled_objects`
- reason_code: `status_recap_local_answer_cancelled_objects`
- state_mutation_audit: present; restored_fields=[], cleared_fields=[], rejected_changes=[]
- projection_summary: `one_shot_cancelled_recent_count=1`, `one_shot_pending_count=1`, `recurring_reminder_count=1`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Sur quoi tu t'appuies pour ce récap ?

**Sophia**
> Je me base sur les données concrètes enregistrées dans ton espace personnel, comme tes rappels et tes réglages, plutôt que sur ma simple mémoire de notre discussion. C'est ce qui me permet de retrouver précisément ton rappel pour « relire le dossier budget » à 09h30, ton point hebdo du lundi à 08h45, ou encore la trace de ton rappel de devis annulé. Je m'appuie aussi sur tes préférences de coaching, comme ton choix d'un ton chaleureux et direct, pour m'assurer que mes réponses restent toujours alignées avec tes attentes.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by `active_status_recap_uses_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `explain_sources`
- visible_task: `explain_sources`
- reason_code: `status_recap_local_explain_sources`
- state_mutation_audit: present; preserved_fields include previous intent/target/answer summary; rejected_changes=[]
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=1`, `coach_preference_count=9`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia repond naturellement au besoin: état factuel, rappel annule, puis sources.
- Pas de retour au format mecanique `Fait / Prevu / Fragile`.
- Le follow-up sur les rappels annules reste dans le contexte local sans changement de sujet.
- Le follow-up sources est compréhensible et ne révèle pas de table brute, prompt, JSON ou dispatcher.

**Problemes**
- Aucun probleme bloquant. Le Tour 3 ajoute une phrase de cloture chaleureuse; elle n'empêche pas la comprehension et ne change pas le verdict.

**Fix propose**
- Aucun fix requis.
- Invariant a garder: le stage `explain_sources` doit rester conversationnel et source-grounded, sans fallback technique.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1: activation `status_recap` via `skill_entry_signal`.
- T2-T4: `active_status_recap_local_dispatcher`; le global dispatcher est bloque pendant le flow actif.
- Aucun fallback global silencieux observe.

**Skills / Operations / Tools**
- `flow_action` attendu sur chaque tour: `answer_status`, `answer_status`, `answer_cancelled_objects`, `explain_sources`.
- `visible_task` attendu: `status_compact`, `status_compact`, `cancelled_objects`, `explain_sources`.
- `state_mutation_audit` present sur les 4 tours, sans `rejected_changes`.
- Aucun tool execute: `executed_tools=[]`.
- Aucun effet durable: `durable_effect=null`.

**Memory / Effets durables**
- Cleanup DB cible apres run: `chat_messages=[]`, `scheduled_checkins=[]`, `user_recurring_reminders=[]`, `temp_memory={}`.
- La fixture `coach.tone` du run est supprimee. Les preferences coach systeme par defaut restent hors perimetre fixture.
- Auth user/connection temporaire nettoye via `scripts/qa-cleanup-run-connection.sh`.

**Problemes**
- Aucun probleme systeme observe.

**Fix propose**
- Aucun fix requis.
- Garder ce scenario comme regression QA pour: active local dispatcher, audit mutation, cancelled reminders, explain_sources, no mutation.

## Verdict Global

- Verdict: green
- Raison principale: le run IA reel local valide le flow complet demande: activation, continuation locale, follow-up annules, explanation de sources, audit de mutation present, et aucun effet durable.
