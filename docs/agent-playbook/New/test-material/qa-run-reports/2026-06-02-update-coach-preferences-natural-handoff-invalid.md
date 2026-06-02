# QA Run Report - update_coach_preferences natural handoff invalid

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `qa-coach-pref-natural-handoff-20260602-r1`
- Persona: non creee, endpoint local indisponible avant `init`
- Objectif: relancer un run reel sur le wording naturel de `update_coach_preferences`, avec interruption d'un autre flow, explication plateforme, `apply_attempt` non mutant, et reprise eventuelle du flow precedent.
- Trajectoire visee: flow actif non preference -> preference durable "plus doucement / moins de questions" -> question produit sur les reglages -> "ok applique" -> reprise du flow initial.
- Surfaces visees: dispatcher, active-flow arbitration, `update_coach_preferences`, renderer handoff plateforme, no-mutation, product-help knowledge.
- Cadre IA reel: local Supabase, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback.
- Validite QA: invalide. Le runtime local n'a pas repondu, donc aucun tour conversationnel exploitable n'a ete produit.

## 2. Tours De Conversation

### Setup / tentative de lancement

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Aucun message utilisateur envoye a Sophia. Le run a ete bloque avant creation de persona QA.

**Sophia**
> Aucune reponse Sophia. L'endpoint local ne repondait pas.

**Trace courte**
- http_status: aucun, timeout avant reponse HTTP exploitable
- response_owner: n/a
- selected_handler: n/a
- route_reason: n/a
- safety: n/a
- direct_effects: n/a
- operation: n/a
- pending_confirmation: n/a
- memory_plan: n/a
- executed_tools: n/a
- durable_effect: n/a

**Tentatives observees**
- `docker restart supabase_edge_runtime_Sophia_2`: commande bloquee, aucune sortie.
- `docker ps --filter name=supabase_edge_runtime_Sophia_2`: commande bloquee, aucune sortie.
- `curl -sS -i http://127.0.0.1:54321/functions/v1/test-send-message`: commande bloquee, stoppee ensuite.
- `./node_modules/.bin/supabase status --output json`: commande bloquee, aucune sortie.
- `curl --max-time 8 -sS -i http://127.0.0.1:54321/functions/v1/test-send-message`: timeout apres 8 secondes, `0 bytes received`.
- `./node_modules/.bin/supabase start`: tentative non destructive, bloquee sans sortie, stoppee ensuite.

**Analyse si yellow/red**
- Symptome: impossible d'atteindre l'endpoint local requis par le cadre QA reel.
- Source amont probable: infrastructure locale Supabase/Docker indisponible ou Docker daemon non repondant.
- Owner runtime: testability / environnement local QA.
- Meilleure correction selon les guidelines: retablir l'infra locale avant tout run ; ne pas substituer par un renderer, un fallback `processMessage`, un run staging ou un transcript reconstruit.
- Pourquoi ce n'est pas un patch local: le probleme est pre-run et infra ; aucun comportement Sophia n'a ete observe.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien a evaluer cote conversation : aucun tour utilisateur/Sophia n'a pu etre execute.

**Problemes**
- Setup: run inexploitable. Famille: BF-TEST-01. Impact: impossible de juger si le nouveau wording de handoff est naturel ou si le flow reprend correctement. Severite: red.

**Fix propose**
- Source amont: environnement local QA Supabase/Docker.
- Correction recommandee: remettre le runtime local en etat repondant, puis relancer un run tour par tour via `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Tests d'invariant attendus: le ping local repond avant `init`; le runner cree une persona dediee ; chaque message est choisi apres lecture de la reponse et de la trace courte.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Non evalue. Aucun message n'a atteint le dispatcher.

**Skills / Operations / Tools**
- Non evalues. `update_coach_preferences` n'a pas ete invoque.

**Memory / Effets durables**
- Aucun effet durable observe. Aucune persona QA n'a ete creee par cette tentative.

**Problemes**
- Setup: infrastructure locale indisponible. Famille: BF-TEST-01. Impact systeme: impossibilite de produire un run IA reel valide. Severite: red.

**Fix propose**
- Source amont: testability / local runtime.
- Correction recommandee: debloquer Docker/Supabase local sans reset DB, verifier `/auth/v1/settings` et `/functions/v1/test-send-message`, puis relancer le run adaptatif.
- Tests d'invariant attendus: `supabase status` repond ; `curl --max-time 8` vers l'endpoint de test retourne une reponse HTTP ; le runner capture `conversation_turn_trace`.

## Verdict Global

- Verdict: red
- Raison principale: run invalide, l'IA reelle locale etait injoignable avant le premier tour.
- Follow-up prioritaire: retablir Supabase/Docker local puis relancer le run sans fallback et sans correction pendant le run.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-02-update-coach-preferences-natural-handoff-invalid-bugs.md`
