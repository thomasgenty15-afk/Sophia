# Product Help Local Doctrine Real QA R1

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: product-help-local-doctrine-real-r1
- Persona: qa-skill, connexion cible `product_help`
- Objectif: verifier en conditions reelles locales les modifications du flow local `product_help` apres suppression legacy et passage dispatcher local -> reducer -> conversation_context -> visible agent.
- Trajectoire: tentative de run local IA reel via `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Surfaces visees: Supabase local, Auth local, `test-send-message`, dispatcher global d'entree, dispatcher local `product_help`, reducer, visible agent, traces.
- Cadre IA reel: exige, mais non atteint.
- Validite QA: invalide. Aucun tour Sophia exploitable n'a ete obtenu.

## 2. Tours De Conversation

Aucun tour conversationnel valide n'a ete execute.

### Incident Technique Avant Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> N/A - aucun message utilisateur n'a ete envoye a Sophia.

**Sophia**
> N/A - aucune reponse Sophia.

**Trace courte**
- http_status: N/A
- response_owner: N/A
- selected_handler: N/A
- route_reason: N/A
- safety: N/A
- direct_effects: N/A
- operation: N/A
- pending_confirmation: N/A
- memory_plan: N/A
- executed_tools: N/A
- durable_effect: N/A

**Analyse si yellow/red**
- Symptome: l'environnement local repond par intermittence sur `http://127.0.0.1:54321`, puis echoue immediatement avec `curl: (7) Failed to connect to 127.0.0.1 port 54321`.
- Source amont probable: environnement QA local instable ou surcharge/concurrence de runs locaux; `supabase status` signale aussi des services arretes.
- Owner runtime: environnement de test local, pas `product_help`.
- Meilleure correction selon les guidelines: stabiliser le local Supabase et relancer un vrai run IA reel; ne pas utiliser de renderer, de fallback ou de runner pre-scripted.
- Pourquoi ce n'est pas un patch local: le code `product_help` n'a pas ete atteint; aucun signal runtime du flow n'a ete produit.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien a evaluer: aucune reponse Sophia n'a ete obtenue.

**Problemes**
- Avant Tour 1: run techniquement invalide. Famille: BF-TEST-01. Impact: impossible de juger la fluidite conversationnelle du nouveau flow local. Severite: red.

**Fix propose**
- Source amont: environnement Supabase local / orchestration QA.
- Correction recommandee: relancer lorsque le local est stable et qu'aucun autre run concurrent ne perturbe `54321`; conserver le chemin `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Tests d'invariant attendus: obtenir au moins un tour `response_owner=product_help` ou `selected_handler=product_help`, sans fallback, avec trace exploitable.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Non evaluable: le message n'a pas atteint Sophia.

**Skills / Operations / Tools**
- Non evaluable: aucun skill, outil ou operation n'a ete execute.

**Effets Durables**
- Aucun effet durable observe par ce run, car aucun tour n'a ete envoye.

**Incidents Observes**
- `supabase status --output json` a retourne les URLs locales mais precede la sortie de `Stopped services: [supabase_imgproxy_Sophia_2 supabase_analytics_Sophia_2 supabase_vector_Sophia_2 supabase_pooler_Sophia_2]`.
- Creation de connexion temporaire via `scripts/qa-create-run-connection.sh` a echoue une premiere fois car le script n'a pas obtenu de status local exploitable.
- Relance avec variables locales explicites a echoue sur `fetch failed`.
- Healthcheck Auth a repondu `200 OK` une fois, puis les appels Auth suivants ont echoue avec `curl: (7) Failed to connect to 127.0.0.1 port 54321`.
- Les guidelines interdisent `supabase restart`, `supabase stop` ou equivalent; le run a donc ete arrete sans fallback.

## Verdict Global

red - run QA reel invalide. Les modifications `product_help` ne sont pas validees par ce run, car le chemin IA reel local n'a pas pu etre execute.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-09-product-help-local-doctrine-real-r1-bugs.md`
