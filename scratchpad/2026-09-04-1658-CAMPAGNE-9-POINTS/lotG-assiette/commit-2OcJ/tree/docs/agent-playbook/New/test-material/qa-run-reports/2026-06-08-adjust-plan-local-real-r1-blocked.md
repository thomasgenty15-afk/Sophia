# QA Run Report - Adjust Plan Local Real R1 Blocked

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `2026-06-08-adjust-plan-local-real-r1-blocked`
- Persona: tentative sur connexion locale `qa-skill/connections/connection_adjust-plan-action-20260601-r1.json`, puis contexte Alex disponible pour plan action. Aucun JWT affiche.
- Objectif: verifier en conditions reelles le nouveau flow local `adjust_plan_item` via `/functions/v1/test-send-message`.
- Trajectoire: demande user d'alleger une action du Plan, clarification si necessaire, handoff Plan non-mutant, tentative d'application bloquee.
- Surfaces visees: global dispatcher, `adjust_plan_item.local_dispatcher`, visible agent, platform handoff Plan, absence d'effet durable, active flow local.
- Cadre IA reel: run local requis, Supabase local, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: invalide. Le run n'a pas atteint le tour 1 Sophia car l'API locale `127.0.0.1:54321` est devenue intermittente puis indisponible avant l'appel conversationnel. Retry demande par l'utilisateur le 2026-06-08: memes symptomes, avec `health=200` et `rest=200` au depart, puis retour a `http_status=000` pendant l'etape Auth.

## 2. Tours De Conversation

### Pre-run 1 - Verification REST locale

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Aucun message utilisateur envoye a Sophia. Probe technique: `GET /rest/v1/`.

**Sophia**
> Aucun message Sophia. Probe REST initiale a retourne ponctuellement `200`, puis les probes suivantes ont alterne avec `curl: (7) Failed to connect to 127.0.0.1 port 54321`.

**Trace courte**
- http_status: `200` puis `000`
- response_owner: n/a
- selected_handler: n/a
- route_reason: n/a
- safety: n/a
- direct_effects: aucun
- operation: aucune
- pending_confirmation: non verifie
- memory_plan: n/a
- executed_tools: aucun
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: disponibilite locale instable avant conversation.
- Source amont probable: environnement Supabase local / gateway Kong local.
- Owner runtime: environnement QA local, pas `adjust_plan_item`.
- Meilleure correction selon les guidelines: remettre le service local dans un etat stable avant de relancer le run; ne pas substituer par un fallback.
- Pourquoi ce n'est pas un patch local: le probleme survient avant le dispatcher Sophia, donc aucune correction de prompt ou reducer ne peut valider le run.

### Pre-run 2 - Verification Auth locale

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Aucun message utilisateur envoye a Sophia. Tentative Auth locale pour obtenir/verifier un token sans afficher le JWT.

**Sophia**
> Aucun message Sophia. L'appel Auth a echoue avec `curl: (7) Failed to connect to 127.0.0.1 port 54321`, `http_status=000`.

**Trace courte**
- http_status: `000`
- response_owner: n/a
- selected_handler: n/a
- route_reason: n/a
- safety: n/a
- direct_effects: aucun
- operation: aucune
- pending_confirmation: non verifie
- memory_plan: n/a
- executed_tools: aucun
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: impossible de verifier le token user local; le endpoint Auth refuse la connexion.
- Source amont probable: service local instable ou indisponible.
- Owner runtime: environnement QA local.
- Meilleure correction selon les guidelines: arreter le run, documenter l'incident, ne pas utiliser staging, remote, renderer, ni `processMessage`.
- Pourquoi ce n'est pas un patch local: aucune requete conversationnelle n'a atteint Sophia.

### Pre-run 3 - Derniere sonde avant abandon

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Aucun message utilisateur envoye a Sophia. Apres attente de 5 secondes, nouvelle sonde REST locale.

**Sophia**
> Aucun message Sophia. Resultat: `curl: (7) Failed to connect to 127.0.0.1 port 54321`, `http_status=000`.

**Trace courte**
- http_status: `000`
- response_owner: n/a
- selected_handler: n/a
- route_reason: n/a
- safety: n/a
- direct_effects: aucun
- operation: aucune
- pending_confirmation: non verifie
- memory_plan: n/a
- executed_tools: aucun
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: indisponibilite persistante apres attente.
- Source amont probable: stack locale Supabase/Kong.
- Owner runtime: environnement QA local.
- Meilleure correction selon les guidelines: ne pas redemarrer depuis ce run car `14-qa-test-guidelines.md` interdit `supabase restart`, `supabase stop`, etc.; demander intervention ou relancer quand le service local est stable.
- Pourquoi ce n'est pas un patch local: le blocage est pre-runtime Sophia.

### Pre-run 4 - Retry utilisateur

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Aucun message utilisateur envoye a Sophia. Retry apres demande utilisateur: probes `GET /auth/v1/health`, `GET /rest/v1/`, puis verification Auth locale sans afficher le JWT.

**Sophia**
> Aucun message Sophia. Les probes initiales ont retourne `200`, puis l'etape Auth a echoue avec `curl: (7) Failed to connect to 127.0.0.1 port 54321`, `http_status=000`. Apres attente de 10 secondes, `GET /auth/v1/health` retournait encore `000`.

**Trace courte**
- http_status: `200` initial, puis `000`
- response_owner: n/a
- selected_handler: n/a
- route_reason: n/a
- safety: n/a
- direct_effects: aucun
- operation: aucune
- pending_confirmation: non verifie
- memory_plan: n/a
- executed_tools: aucun
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le gateway local accepte quelques probes, puis devient indisponible avant tout appel conversationnel.
- Source amont probable: stack locale Supabase/Kong/Auth instable.
- Owner runtime: environnement QA local.
- Meilleure correction selon les guidelines: arreter le run, documenter le retry, ne pas redemarrer Supabase dans ce run.
- Pourquoi ce n'est pas un patch local: aucun message n'a atteint Sophia; le probleme est pre-runtime.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien d'evaluable: aucun tour Sophia n'a ete produit.
- Le cadre de validite a ete respecte: aucun fallback, aucun renderer, aucun run remote.

**Problemes**
- Pre-run 2-4: le user ne peut pas atteindre Sophia. Famille: BF-TEST-01. Impact: run conversationnel impossible. Severite: red.

**Fix propose**
- Source amont: disponibilite Supabase local / gateway local.
- Correction recommandee: remettre l'environnement local dans un etat stable avant le run; si un redemarrage est necessaire, il doit etre demande/autorise hors de ce run car les guidelines interdisent les commandes de reboot.
- Tests d'invariant attendus: `GET /auth/v1/health`, login Auth, `GET /auth/v1/user`, puis `POST /functions/v1/test-send-message` avec `force_full_ai=true` doivent retourner des statuts stables avant de demarrer le transcript QA.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Non evalue. Aucun message n'a atteint le dispatcher global ni le dispatcher local `adjust_plan_item`.

**Skills / Operations / Tools**
- Non evalues. Aucun `selected_handler`, `operationRuntime`, `executedTools` ou handoff Plan observable.

**Memory / Effets durables**
- Aucun effet durable observe ou attendu. Aucun nettoyage DB cible n'a ete necessaire, car aucun tour Sophia n'a ete envoye.

**Problemes**
- Pre-run 2-4: endpoint local indisponible avant Auth et avant `test-send-message`. Famille: BF-TEST-01. Impact systeme: run QA reel invalide; impossible de verifier les invariants `adjust_plan_item`. Severite: red.

**Fix propose**
- Source amont: environnement local Supabase.
- Correction recommandee: stabiliser le service local, puis relancer le meme objectif QA avec une connexion locale dediee et messages choisis tour par tour.
- Tests d'invariant attendus: verifier que le run produit au moins: `response_owner=tool_skill`, `selected_handler=adjust_plan_item`, `executed_tools=[]`, `platform_handoff.surface_id=plan`, aucune confirmation executable, aucun effet durable.

## Verdict Global

- Verdict: red
- Raison principale: run techniquement invalide; l'API locale est devenue indisponible avant tout tour Sophia.
- Follow-up prioritaire: remettre Supabase local en etat stable, puis relancer un run IA reel `adjust_plan_item` via `/functions/v1/test-send-message` avec `force_full_ai=true`.
