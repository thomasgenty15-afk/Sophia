# QA Run Report - adjust_plan_item local dispatcher real rerun invalid R2 - 2026-06-09

## 1. Context

- Date: 2026-06-09.
- Flow vise: `adjust_plan_item` local dispatcher.
- Objectif: rerun en conditions reelles apres R1 invalide.
- Cadre attendu: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback direct.
- Connexion QA temporaire reutilisee: `qa-skill / all_skills_adjustplan_local_20260609_qa1`.
- Validite QA: invalide. Aucun tour conversationnel Sophia exploitable n'a pu etre execute.

## 2. Tours

### Preflight R2

- Premiere tentative `auth/v1/settings` + `auth/v1/token`: refus de connexion sur `127.0.0.1:54321`.
- `supabase status --output json`: a parfois annonce l'API locale sur `http://127.0.0.1:54321`.
- `GET /auth/v1/settings`: a retourne `200` une fois pendant le preflight.

### Tentative T1 R2

Message prevu:

> Mon plan est trop lourd cette semaine, surtout l'action du soir. Je voudrais l'alleger sans tout abandonner.

Resultat:

- L'appel `auth/v1/token?grant_type=refresh_token` a echoue avec `curl: (7) Failed to connect to 127.0.0.1 port 54321`.
- Le `POST /functions/v1/test-send-message` n'a donc pas ete appele avec un token utilisateur valide.
- Aucun message visible Sophia et aucune trace runtime exploitable.

### Probe Stabilite

5 probes consecutifs sur `GET /auth/v1/settings`:

- probe 1: `http=000`, refus de connexion.
- probe 2: `http=000`, refus de connexion.
- probe 3: `http=000`, refus de connexion.
- probe 4: `http=000`, refus de connexion.
- probe 5: `http=000`, refus de connexion.

Le run a ete stoppe sans redemarrage Supabase, conformement aux guidelines.

## 3. Fluidite humaine

Verdict: red / invalide.

Aucune reponse Sophia n'a ete produite. Impossible d'evaluer la fluidite conversationnelle ou les comportements locaux `adjust_plan_item`.

## 4. Analyse systeme

Verdict: red / invalide.

- Le chemin IA reel requis ne peut pas demarrer.
- Le probleme est anterieur au dispatcher: instabilite / indisponibilite de l'API locale `127.0.0.1:54321`.
- Aucune preuve runtime ne permet de valider les invariants doctrine.
- Famille bug: `BF-TEST-01`.

Cleanup:

- Non retente en R2 car les probes montrent que l'API locale est indisponible.
- La connexion temporaire `all_skills_adjustplan_local_20260609_qa1` reste a nettoyer quand l'API locale sera stable.

## 5. Verdict Global

Verdict global: red / QA invalide.

Raison principale: l'API locale refuse les connexions sur 5 probes consecutifs, puis le token auth ne peut pas etre obtenu. Le rerun ne valide ni n'invalide fonctionnellement les modifications `adjust_plan_item`.

Critere de relance:

- Obtenir 3 succes consecutifs sur `GET /auth/v1/settings`.
- Obtenir un token via `auth/v1/token?grant_type=refresh_token`.
- Appeler ensuite `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Nettoyer la connexion temporaire QA avant ou apres le prochain run.
