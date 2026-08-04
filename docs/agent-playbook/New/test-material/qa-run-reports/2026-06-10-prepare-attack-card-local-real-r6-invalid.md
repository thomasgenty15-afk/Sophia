# QA Run - prepare_attack_card local dispatcher r6 invalid

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `prepare_attack_card_local_real_r6_invalid`
- Persona: `qa-skill`
- Objectif: relancer un run reel multi-tours apres suppression des hard rejects visibles problematiques du flow `prepare_attack_card`.
- Trajectoire prevue: demande de carte d'attaque avec cible/piege, choix technique, champs plateforme, handoff, apply attempt, sortie.
- Surfaces visees: Supabase local, Auth local, `/functions/v1/test-send-message`, dispatcher local `prepare_attack_card`, agent visible.
- Cadre IA reel: attendu `force_full_ai=true`, mais aucun tour Sophia n'a pu etre lance.
- Validite QA: invalide. Le run n'a pas atteint `/functions/v1/test-send-message` avec un utilisateur authentifie.

## 2. Tours De Conversation

### Tour 0 - incident setup

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> n/a - aucun message utilisateur n'a ete envoye a Sophia.

**Sophia**
> n/a - aucune reponse Sophia.

**Trace courte**
- http_status: `GET /auth/v1/settings` retourne `200 OK`
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
- incident 1: `scripts/qa-create-run-connection.sh qa-skill all_skills prepare_attack_local_20260610_r6` bloque sans sortie; processus cible arrete.
- incident 2: aucun fichier `tests/real-personas/qa-skill/connections/all_skills_prepare_attack_local_20260610_r6.json` cree.
- incident 3: `scripts/get-jwt.sh qa-skill all_skills` echoue avec `unexpected_failure` et `dial tcp 172.18.0.7:5432: connect: no route to host`.
- incident 4: `supabase status --output json` reste bloque; pas de redemarrage Supabase effectue conformement aux guidelines.

**Analyse si yellow/red**
- Symptome: impossible d'obtenir un JWT local, donc impossible de lancer un tour Sophia valide.
- Source amont probable: incident environnement local Supabase/Auth/DB ou concurrence de runs QA locaux.
- Owner runtime: environnement QA local, pas `prepare_attack_card`.
- Meilleure correction selon les guidelines: remettre le Supabase local en etat par intervention explicite utilisateur hors run, puis relancer le test reel.
- Pourquoi ce n'est pas un patch local: aucun code `prepare_attack_card` n'a ete execute; le blocage est avant Auth/test-send-message.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun comportement conversationnel Sophia n'a ete observe.

**Problemes**
- Tour 0: le test n'a pas pu demarrer. Famille: `BF-TEST-01`. Impact: aucune validation possible de la correction. Severite: red.

**Fix propose**
- Source amont: environnement local Supabase/Auth.
- Correction recommandee: retablir Auth -> DB local sans `supabase db reset`, puis relancer un run avec une connexion temporaire neuve.
- Tests d'invariant attendus: `scripts/get-jwt.sh` doit retourner un token non affiche; `/functions/v1/test-send-message` doit repondre avec un payload Sophia `ok=true`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Non teste. Aucun tour n'a atteint le dispatcher.

**Skills / Operations / Tools**
- Non teste. Aucun tool skill n'a ete appele.

**Memory / Effets durables**
- Aucun effet durable observe.
- Aucune connexion temporaire r6 exploitable n'a ete creee.

**Problemes**
- Tour 0: Auth local ne peut pas generer de JWT car la connexion interne a la DB echoue avec `no route to host`. Famille: `BF-TEST-01`. Impact systeme: run QA techniquement invalide. Severite: red.

**Fix propose**
- Source amont: Supabase local / Docker network / Auth DB connectivity.
- Correction recommandee: diagnostiquer l'etat local Supabase hors run, sans reset DB, puis relancer le QA prepare_attack_card.
- Tests d'invariant attendus: creation connexion temporaire, login JWT, premier appel `test-send-message` avec `force_full_ai=true`.

## Verdict Global

- Verdict: red
- Raison principale: le run est techniquement invalide; impossible d'obtenir un JWT local a cause d'un incident Auth -> DB.
- Follow-up prioritaire: remettre l'environnement local Supabase/Auth en etat, puis relancer le run multi-tours.
