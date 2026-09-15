# 2026-06-10 - update_coach_preferences conditional r7 invalid

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `update-coach-preferences-conditional-r7`
- Persona: `qa-skill`, tentative de connexion temporaire `updatecoachpref_updatecoachpref_r7`
- Objectif: vérifier le fix post-r6 sur la confirmation générale après proposition partielle conditionnelle
- Trajectoire prévue: demande conditionnelle partiellement supportée -> confirmation générale -> commit DB
- Surfaces visées: dispatcher local `update_coach_preferences`, reducer local, writer DB, `user_profile_facts`
- Cadre IA réel attendu: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, hors sandbox, aucun renderer déterministe, aucun fallback direct
- Validité QA: invalide. Aucun tour conversationnel Sophia exploitable n'a pu démarrer à cause d'un problème d'environnement local.

## 2. Tours De Conversation

### Pré-run

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` — environnement QA local indisponible

**User**
> n/a

**Sophia**
> n/a

**Trace courte**
- http_status: n/a pour conversation
- response_owner: n/a
- selected_handler: n/a
- route_reason: n/a
- safety: n/a
- direct_effects: n/a
- operation: n/a
- pending_confirmation: n/a
- memory_plan: n/a
- executed_tools: n/a
- durable_effect: none observed
- tentative connexion: `scripts/qa-create-run-connection.sh qa-skill updatecoachpref updatecoachpref_r7` bloquée sur `supabase status --output json`, puis relancée avec variables locales explicites
- Auth admin: échec `Database error finding users`
- endpoint probe: `POST /functions/v1/test-send-message` avec `force_full_ai=true` retourne `503 BOOT_ERROR`, `Worker failed to boot`
- check code: `deno check supabase/functions/sophia-brain/index.ts` passe
- docker probe: `docker ps` bloqué; interrompu sans redémarrage

**Analyse si yellow/red**
- Symptôme: impossible de créer une connexion QA temporaire ou de démarrer un tour IA réel.
- Source amont probable: environnement Supabase local / Edge Runtime local, pas le reducer `update_coach_preferences`.
- Owner runtime: QA harness / Supabase local.
- Meilleure correction selon les guidelines: stabiliser l'environnement local hors run QA, puis relancer le même scénario via `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Pourquoi ce n'est pas un patch local: aucun transcript Sophia n'existe; corriger le flow applicatif sur cette base violerait la charte QA.

## 3. Analyse De Fluidité Humaine

**Verdict: red**

**Ce qui marche**
- n/a, aucune réponse Sophia réelle n'a été produite.

**Problèmes**
- Pré-run: aucun tour utilisateur/Sophia exploitable. Famille: `BF-TEST-01`. Impact: le fix ne peut pas être validé en conditions réelles. Sévérité: red.

**Fix proposé**
- Source amont: environnement local Supabase / Edge Runtime.
- Correction recommandée: remettre l'Edge Runtime et l'accès DB local en état stable sans modifier le flow pendant le run.
- Tests d'invariant attendus: relancer `r7` ou `r8` avec création de connexion temporaire, T1 conditionnel -> no write, T2 confirmation générale -> write DB.

## 4. Analyse Système

**Verdict: red**

**Routage**
- Non évalué: aucun message n'a atteint le dispatcher IA réel.

**Skills / Operations / Tools**
- Non évalué.

**Memory / Effets durables**
- Aucun effet durable observé. La connexion temporaire n'a pas été créée.

**Problèmes**
- Environnement local indisponible pour QA réelle:
  - `supabase status --output json` bloque.
  - Auth admin local retourne `Database error finding users`.
  - `/functions/v1/test-send-message` retourne `503 BOOT_ERROR`.
  - `docker ps` bloque également.

**Fix proposé**
- Source amont: QA local runtime.
- Correction recommandée: diagnostiquer Supabase/Docker local hors run, sans `supabase db reset` et sans commande destructive, puis relancer le même scénario.
- Tests d'invariant attendus: endpoint `/functions/v1/test-send-message` répond `200`, trace présente, aucun fallback, et vérification DB post-tour.

## Verdict Global

`red` technique.

Le run ne valide ni n'invalide le fix `update_coach_preferences`: l'environnement local n'a pas permis de produire un tour IA réel.
