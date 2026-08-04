# QA Run Report — Conversation Pulse V2 Real R2

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `pulse-v2-real-1781097066`
- Persona: Alex, connexion locale existante
- Objectif: verifier en conditions reelles le nouveau chemin conversation pulse V2.
- Trajectoire: conversation emotionnelle recente -> watcher reel -> tentative `watcher_conversation_pulse_v2` -> daily pulse.
- Surfaces visees: `/functions/v1/test-send-message`, `runWatcher`, `buildDailyConversationPulse`, `system_runtime_snapshots`, cleanup DB.
- Cadre IA reel: local Supabase, `force_full_ai=true` pour les tours, watcher avec `MEGA_TEST_MODE=0`, pas de renderer ni fallback.
- Validite QA: valide pour les tours conversationnels et la tentative watcher; verdict global red car l'insert snapshot V2 est bloque par schema DB.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J ai encore un peu la boule au ventre depuis hier soir avec ma soeur. Je pensais que ce serait passe ce matin, mais ca me prend encore de la place.

**Sophia**
> C'est épuisant quand une tension avec ta sœur reste accrochée comme ça, même le lendemain. Cette boule au ventre est le signe que ton corps essaie encore de digérer ce qui s'est passé hier soir. Prends juste un instant pour souffler et laisser cette sensation exister, sans chercher à la chasser tout de suite.

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: non expose dans la trace courte retournee
- safety: non declenche
- memory_plan: non expose dans la trace courte retournee
- durable_effect: messages DB crees dans scope `qa-pulse-v2-real-1781097066`

### Tour 2

**Verdict du tour:** green

**User**
> Oui c est exactement ca. Je n ai pas envie d en refaire tout un sujet, mais demain matin si Sophia me remet doucement un peu de force sans citer tous les details, ca m aiderait.

**Sophia**
> Je comprends tout à fait, on en reste là. Je t'envoie toute la force et la douceur nécessaires pour ton réveil demain matin. Repose-toi bien.

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: non expose dans la trace courte retournee
- safety: non declenche
- durable_effect: 4 `chat_messages` presents avant cleanup

### Background Watcher / Daily

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-02 — Effet attendu absent

**Action QA**
> Appel direct du vrai `runWatcher` sur le scope QA, avec `MEGA_TEST_MODE=0` et watcher active uniquement pour ce process.

**Trace courte**
- watcher_main_prompt_cache_ready: present
- gemini_result source `trigger-watcher-batch`: present
- scheduled_checkins_inserted: 1
- watcher_momentum_state_updated: present, state `friction_legere`
- gemini_result source `watcher_conversation_pulse_v2`: present
- insert snapshot: failed
- error: `system_runtime_snapshots_snapshot_type_check`
- failing snapshot_type: `watcher_conversation_pulse_v2`

**Analyse**
- Symptome: le watcher produit bien l'appel IA du pulse V2 mais la DB refuse la persistance.
- Source amont probable: migration/schema `system_runtime_snapshots_snapshot_type_check`.
- Owner runtime: schema DB + runtime snapshots.
- Correction attendue: autoriser `watcher_conversation_pulse_v2`, `daily_conversation_pulse_v2`, `weekly_conversation_pulse_v2` dans la contrainte.
- Pourquoi ce n'est pas un patch local: le runtime est correct jusqu'a l'insert; le blocage est contractuel DB.

## 3. Analyse De Fluidite Humaine

**Verdict:** green pour la conversation, red pour le flow complet

**Ce qui marche**
- Sophia repond humainement au signal emotionnel.
- Elle respecte la demande de ne pas rouvrir les details.
- Le ton est doux et non intrusif.

**Problemes**
- Background: le flow proactif ne peut pas persister le pulse V2. Famille: BF-EFFECT-02. Impact: morning nudge ne pourra pas consommer le nouveau daily/watcher pulse.

**Fix propose**
- Source amont: schema DB.
- Correction recommandee: migration de contrainte + rerun watcher/daily.
- Tests d'invariant attendus: watcher snapshot V2 insere, daily snapshot V2 insere, zero `conversation_pulse` legacy.

## 4. Analyse Systeme

**Verdict:** red

**Routage**
- Conversation normale OK via endpoint reel.
- Watcher reel appele et non stubbe.

**Skills / Operations / Tools**
- Pas de skill/tool conversationnel engageant.
- Watcher a cree un check-in ponctuel de soutien emotionnel. Il a ete supprime au cleanup.

**Memory / Pulse**
- `watcher_conversation_pulse_v2` tente de s'inserer.
- La contrainte DB bloque l'insert.
- `daily_conversation_pulse_v2` n'est pas genere car aucun watcher pulse persiste.
- Aucun fallback legacy `conversation_pulse` n'a ete cree.

**Effets durables et cleanup**
- Cleanup cible effectue:
  - `scheduled_checkins`: 1 ligne supprimee
  - `chat_messages`: 4 lignes supprimees
  - `user_chat_states`: 1 ligne supprimee
- Aucun reset DB, aucun restart/stop Supabase.

## Verdict Global

`red`: le chemin IA reel atteint bien Sophia et le watcher, mais la persistance pulse V2 est bloquee par la contrainte SQL `system_runtime_snapshots_snapshot_type_check`.
