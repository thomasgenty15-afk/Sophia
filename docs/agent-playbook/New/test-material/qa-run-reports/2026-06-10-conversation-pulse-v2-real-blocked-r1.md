# QA Run Report — Conversation Pulse V2 Real Run Blocked R1

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `conversation-pulse-v2-real-blocked-r1`
- Persona: Alex, connexion locale existante
- Objectif: tester en conditions reelles le nouveau chemin `watcher_conversation_pulse_v2` -> `daily_conversation_pulse_v2` -> morning nudge / memory plan.
- Trajectoire visee: conversation emotionnelle recente, generation watcher pulse, aggregation daily pulse, verification absence fallback `conversation_pulse` legacy.
- Surfaces visees: `/functions/v1/test-send-message`, watcher, daily conversation pulse, `system_runtime_snapshots`, morning nudge loader.
- Cadre IA reel: requis, local Supabase, `force_full_ai=true`, pas de renderer, pas de fallback.
- Validite QA: invalide. Le run n'a pas atteint Sophia; le gateway Supabase local est devenu indisponible avant le premier tour exploitable.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** environnement local / infrastructure QA, pas un bug runtime Sophia classe BF produit.

**User prevu**
> J ai encore un peu la boule au ventre depuis hier soir avec ma soeur. Je pensais que ce serait passe ce matin, mais ca me prend encore de la place.

**Sophia**
> Aucune reponse Sophia. Le message n'a pas atteint `/functions/v1/test-send-message`.

**Trace courte**
- http_status: absent
- response_owner: absent
- selected_handler: absent
- route_reason: absent
- safety: absent
- direct_effects: absent
- operation: absent
- pending_confirmation: absent
- memory_plan: absent
- executed_tools: absent
- durable_effect: absent

**Incident technique**
- Probe initial `curl http://127.0.0.1:54321/auth/v1/settings`: `200 OK`.
- Ensuite, login JWT via `scripts/get-jwt.sh alex`: echec `curl: (7) Failed to connect to 127.0.0.1 port 54321`.
- Nouveau probe direct non-login: echec `curl: (7) Failed to connect to 127.0.0.1 port 54321`.
- `supabase status --output json` et `docker ps` ont bloque; les process de diagnostic lances par ce run ont ete termines.
- Aucun `supabase restart`, `supabase stop` ou reset DB n'a ete lance.

## 3. Analyse De Fluidite Humaine

**Verdict:** red

**Ce qui marche**
- Non observable: aucune reponse Sophia exploitable.

**Problemes**
- Tour 1: run non valide car Sophia n'a pas ete jointe. Impact: impossible de juger la fluidite humaine du nouveau chemin pulse.

**Fix propose**
- Source amont: environnement local Supabase/Docker.
- Correction recommandee: retenter le run apres restauration manuelle du gateway local. Ne pas classer ce resultat comme bug conversationnel ou morning nudge.
- Tests d'invariant attendus au prochain run: conversation reelle via `test-send-message`, puis snapshot watcher V2, puis snapshot daily V2, puis lecture morning nudge sans fallback legacy.

## 4. Analyse Systeme

**Verdict:** red

**Routage**
- Non observable. Le dispatcher global/local n'a pas ete appele.

**Skills / Operations / Tools**
- Non observable.

**Memory / Pulse**
- Non observable en conditions reelles.
- Le run n'a pas pu verifier `watcher_conversation_pulse_v2`, `daily_conversation_pulse_v2` ni le target memory plan `runtime_snapshot`.

**Effets durables**
- Aucun effet durable Sophia observe.
- Aucun cleanup DB necessaire: le tour n'a pas atteint l'endpoint Sophia.

## Verdict Global

`red / invalide`: run conditions reelles bloque par indisponibilite du gateway Supabase local. Les tests unitaires et checks passes precedemment restent valables techniquement, mais ils ne remplacent pas ce run IA reel.
