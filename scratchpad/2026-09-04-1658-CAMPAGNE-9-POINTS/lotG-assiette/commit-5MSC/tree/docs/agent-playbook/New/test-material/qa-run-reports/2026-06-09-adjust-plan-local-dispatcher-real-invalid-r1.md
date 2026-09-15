# QA Run Report - adjust_plan_item local dispatcher real run invalid R1 - 2026-06-09

## 1. Context

- Date: 2026-06-09.
- Flow vise: `adjust_plan_item` local dispatcher, apres migration doctrine dispatchers locaux.
- Objectif: verifier en conditions reelles que les nouvelles modifications fonctionnent via le chemin Sophia IA complet.
- Cadre attendu: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback direct.
- Connexion QA temporaire creee: `qa-skill / all_skills_adjustplan_local_20260609_qa1`.
- Validite QA: invalide. Aucun tour conversationnel Sophia exploitable n'a pu etre execute.

## 2. Tours

### Preflight

- `GET http://127.0.0.1:54321/auth/v1/settings`: a retourne `200` a plusieurs reprises.
- `supabase status --output json`: intermittent dans le sandbox, parfois lisible, parfois bloque par permission Docker.
- Creation connexion QA temporaire: OK via script whiteliste.
- Reset cible du user QA temporaire: OK via script whiteliste.

### Tentative T1

Message prevu:

> Mon plan est trop lourd cette semaine, surtout l'action du soir. Je voudrais l'alleger sans tout abandonner.

Resultat:

- Aucun `POST /functions/v1/test-send-message` exploitable n'a abouti.
- L'appel au token local `auth/v1/token?grant_type=refresh_token` a echoue par intermittence avec `curl: (7) Failed to connect to 127.0.0.1 port 54321`.
- Le transport Node `fetch` vers `127.0.0.1:54321` echoue aussi avec `TypeError: fetch failed`, alors que `curl` direct peut parfois obtenir `200` sur `/auth/v1/settings`.
- Le run a ete stoppe avant toute reponse visible Sophia, conformement aux guidelines qui interdisent de redemarrer Supabase pendant le QA.

## 3. Fluidite humaine

Verdict: red / invalide.

Aucune reponse Sophia n'a ete produite. Impossible d'evaluer la fluidite conversationnelle, la qualite du handoff Plan, les revisions, les repetitions ou le comportement `apply_attempt`.

## 4. Analyse systeme

Verdict: red / invalide.

- Le chemin IA reel requis n'a pas pu etre execute jusqu'au dispatcher.
- Aucune trace `conversation_turn_trace` exploitable n'a ete produite.
- Les invariants doctrine `adjust_plan_item` ne peuvent pas etre prouves par ce run.
- La cause observee est un probleme de disponibilite locale / acces runtime: endpoint local intermittent, Docker status intermittent dans sandbox, auth token parfois inaccessible.
- Famille bug: `BF-TEST-01` / runtime QA local indisponible ou instable.

Cleanup:

- Tentative `scripts/qa-cleanup-run-connection.sh qa-skill all_skills_adjustplan_local_20260609_qa1`: echec, car le script ne pouvait pas relire `supabase status`.
- Tentative avec `SUPABASE_URL=http://127.0.0.1:54321` et service role local genere en memoire: echec `curl: (7) Failed to connect`.
- La connexion temporaire peut rester presente tant que l'API locale n'est pas stable. Elle est marquee temporaire/test par le script de creation.

## 5. Verdict Global

Verdict global: red / QA invalide.

Raison principale: le run reel n'a pas atteint `/functions/v1/test-send-message` de maniere exploitable. Les modifications `adjust_plan_item` ne sont donc ni validees ni invalidees fonctionnellement par ce run.

Critere de relance:

- Stabiliser l'endpoint local `127.0.0.1:54321` sans reset global.
- Verifier que `auth/v1/token` et `/functions/v1/test-send-message` repondent de facon consecutive.
- Nettoyer la connexion temporaire `all_skills_adjustplan_local_20260609_qa1`.
- Relancer le scenario en vrai tour par tour avec `force_full_ai=true`.
