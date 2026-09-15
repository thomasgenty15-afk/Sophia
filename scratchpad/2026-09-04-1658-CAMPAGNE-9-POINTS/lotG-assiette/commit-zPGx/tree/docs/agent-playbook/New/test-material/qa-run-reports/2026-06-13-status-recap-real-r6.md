# QA Run Report — status-recap-real-r6

## 1. Contexte Du Test

- Date: 2026-06-13 Europe/Paris
- Run: `status-recap-real-r6`
- Persona: `qa-skill`, connexion temporaire neuve `status_recap_status_recap_20260613_r6`, user `f388d5db-b592-4d0f-8301-057584ae3ba5`
- Objectif: rerun IA reel apres suppression du blocker regex visible, pour verifier que `status_recap` reste fluide et que le stage `explain_sources` ne retombe plus en fallback technique.
- Trajectoire: demande de point factuel read-only -> relance factuelle -> follow-up rappels annules -> demande de sources.
- Surfaces visees: dispatcher `status_recap`, active flow local, visible agent `status_compact`, stage `cancelled_objects`, stage `explain_sources`, projection DB, absence de mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer/fallback deterministe. Le runner herite injecte `client_now_iso=2026-06-12T10:00:00.000+02:00`; les dates relatives de la reponse sont donc evaluees dans ce temps simule.
- Validite QA: valide. Les quatre tours ont repondu HTTP 200 via le chemin IA reel. La connexion temporaire/Auth user a ete nettoyee apres le run.

Artefacts:
- Raw: `tests/real-personas/qa-skill/runs/status_recap/2026-06-13-status-recap-real-r6.raw.json`
- Durable: `tests/real-personas/qa-skill/runs/status_recap/2026-06-13-status-recap-real-r6.durable.json`
- Cleanup: `tests/real-personas/qa-skill/runs/status_recap/2026-06-13-status-recap-real-r6.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Tu peux me dire simplement ce qui est vraiment enregistré dans mon espace, sans rien changer ?

**Sophia**
> Dans ton espace, je vois un rappel pour relire le dossier budget demain à 09:30 et ton point hebdo récurrent chaque lundi à 08:45. Un ancien rappel de devis est marqué comme annulé. Tes préférences coach sont définies sur un ton chaleureux et direct, avec un focus sur la discipline. Tu n'as pas de cartes ou de sessions actives pour l'instant.

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
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=1`, `coach_preference_count=9`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, fais-moi le point maintenant, en restant juste factuel.

**Sophia**
> Côté rappels, tu en as un de prévu le 13 juin à 09h30 pour relire le dossier budget, et celui concernant le devis est bien annulé. Ton point hebdo est programmé tous les lundis à 08h45. Pour tes préférences coach, le ton est chaleureux et direct.

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
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=1`, `coach_preference_count=9`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et pour les rappels annulés, tu vois quelque chose ou pas ?

**Sophia**
> Oui, je vois effectivement un rappel annulé : il concernait le devis et était prévu pour le 11 juin à 17h. Tes autres rappels, comme celui pour le dossier budget ou ton point hebdo, sont toujours bien actifs de leur côté.

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
- projection_summary: `one_shot_cancelled_recent_count=1`, `one_shot_pending_count=1`, `recurring_reminder_count=1`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Sur quoi tu t'appuies pour ce récap ?

**Sophia**
> Pour ce récapitulatif, je m'appuie uniquement sur les informations concrètes enregistrées dans ton espace. Je consulte tes rappels en attente, comme celui pour relire le dossier budget, et tes rituels comme ton point hebdo du lundi. Je prends aussi en compte l'historique, notamment ton rappel de devis annulé, ainsi que tes préférences de coaching où tu as opté pour un ton chaleureux et direct. Rien n'est inventé, tout provient de ce que nous avons acté ensemble.

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
- projection_summary: `one_shot_cancelled_recent_count=1`, `one_shot_pending_count=1`, `recurring_reminder_count=1`, `coach_preference_count=9`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La restitution est naturelle et lisible, sans grille imposee `Fait / Prevu / Fragile`.
- Le rappel annule est presente comme un rappel annule, sans categorie artificielle.
- Le follow-up sur les sources est fluide: Sophia explique les familles de sources exploitees sans exposer de table brute, dispatcher, JSON ou trace technique.
- Le user peut enchainer normalement; il n'a pas besoin de reformuler en langage de test.

**Problemes**
- Aucun probleme bloquant observe. Note de contexte: le mot `demain` au Tour 1 vient du `client_now_iso` simule au 2026-06-12 par le runner, pas d'une erreur de projection du flow.

**Fix propose**
- Aucun fix requis sur le flow pour ce run.
- Invariant a garder: `explain_sources` doit rester conversationnel et source-grounded, sans fallback technique ni blocker de surface.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 active `status_recap` depuis le dispatcher global avec `route_reason=skill_entry_signal`.
- T2, T3 et T4 restent dans le dispatcher local actif avec `route_reason=active_status_recap_local_dispatcher`.
- Le dispatcher global est explicitement bloque pendant l'active flow (`active_status_recap_uses_local_dispatcher`).

**Skills / Operations / Tools**
- T1/T2: `flow_action=answer_status`, `visible_task=status_compact`.
- T3: `flow_action=answer_cancelled_objects`, `visible_task=cancelled_objects`.
- T4: `flow_action=explain_sources`, `visible_task=explain_sources`.
- Aucun tool durable execute: `executed_tools=[]`, `durable_effect=null`, `direct_effects=[]` sur tous les tours.

**Memory / Effets durables**
- Seed r6: 1 rappel ponctuel pending, 1 rappel ponctuel cancelled, 1 rappel recurrent actif, 1 preference coach explicite, plus defaults coach systeme crees automatiquement.
- Cleanup DB cible: `chat_messages=[]`, `scheduled_checkins=[]`, `user_recurring_reminders=[]`, `temp_memory={}` apres le run; la fixture `coach.tone` est supprimee. Les defaults coach systeme restent hors perimetre fixture.
- Cleanup Auth/connexion temporaire: effectue via `scripts/qa-cleanup-run-connection.sh` pour `status_recap_status_recap_20260613_r6`.

**Problemes**
- Aucun probleme systeme bloquant observe.

**Fix propose**
- Aucun fix requis.
- Garder ce run comme regression pour: active local dispatcher, cancelled reminders, explain_sources, no mutation, no regex surface blocker.

## Verdict Global

- Verdict: green
- Raison principale: les quatre tours sont passes en IA reelle locale, le flow est reste local apres activation, la demande de sources aboutit maintenant en `explain_sources`, et aucun effet durable n'a ete applique.
