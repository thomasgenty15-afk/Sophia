# QA Run Report - Coaching Recommendation Exit Note R1

## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `coachingrec-exit-note-20260619-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-exit-note-20260619-r1-1781869302476@example.com`
- Objectif: verifier que les notes d'exit des dispatchers locaux sont exposees dans la trace, puis observer le bug d'ownership coaching.
- Trajectoire: action du plan -> coaching recommendation -> exit vers global -> question de suivi produit.
- Surfaces visees: `coaching_recommendation`, router global, trace `skill_run.exit_note_information`, `product_help`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: valide. Cleanup cible execute.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Je bloque sur l'action Préparer le dossier mutuelle dans mon plan. Dès que j'ouvre les justificatifs je repousse, et je ne sais pas si je dois préparer une carte d'attaque ou modifier l'action.

**Sophia**
> Prends plutôt une carte d’attaque. Le blocage ressemble à une résistance au démarrage, pas à un problème de plan en soi.
>
> Pour l’action mutuelle, je la verrais comme ça :
> - objectif trop large → la découper
> - justificatifs anxiogènes → enlever la friction
> - démarrage difficile → prévoir une entrée ultra simple, genre “ouvrir 1 seul justificatif”
>
> Si tu veux, je peux te proposer une version d’action plus petite et plus facile à lancer 🙂

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: coaching_recommendation_exit_to_global
- selected_skill_id: coaching_recommendation
- skill_status: exit
- exit_target: global
- direct_effects: []
- operation: none
- durable_effect: none

**Note d'exit exposee**
- `source_flow_id`: `coaching_recommendation`
- `handoff_reason`: `topic_change`
- `target_dispatcher`: `global`
- `structured_context.collected_state.dispatcher_signal_context.category`: `plan_action_coaching`
- `structured_context.collected_state.dispatcher_signal_context.failure_mode`: `avoidance`
- `structured_context.collected_state.dispatcher_signal_context.priority_features`: `["attack_card"]`
- `structured_context.collected_state.current_recommendation`: `adjust_plan`
- `structured_context.collected_state.candidate_features`: `adjust_plan`

**Analyse si yellow/red**
- Symptome: le skill sort vers global alors que le tour est bien une demande coaching.
- Source amont probable: local dispatcher/reducer produit `exit_to_global_dispatcher` ou status exit pour une recommandation qui devrait rester active.
- Owner runtime: `coaching_recommendation` local flow.
- Meilleure correction: apres une recommandation coaching action-plan, conserver le flow actif sauf cloture explicite/off-topic/safety.
- Pourquoi ce n'est pas un patch local: la note revele une contradiction structurelle entre `priority_features=attack_card` et `current_recommendation=adjust_plan`, puis un exit global injustifie.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> Ok, si je veux préparer cette carte d'attaque moi-même dans Sophia, je vais où exactement ? Ne crée rien depuis le chat.

**Sophia**
> Va dans Dashboard > Plan, ouvre la mission ou l’habitude concernée, puis passe à Dashboard > Ressources si l’option est disponible. La carte d’attaque se retrouve ensuite là, rangée par niveau.

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: product_help_signal
- selected_skill_id: product_help
- direct_effects: []
- operation: none
- durable_effect: none

**Analyse si yellow/red**
- Symptome: la question de suivi d'une reco coaching part vers `product_help`.
- Source amont probable: le flow coaching n'est plus actif apres T1.
- Owner runtime: active flow persistence + `coaching_recommendation`.
- Meilleure correction: ne pas sortir vers global au T1; `readActiveFlowState` doit ensuite garder l'owner `coaching_recommendation`.
- Pourquoi ce n'est pas un patch local: `product_help` n'aurait jamais du posseder ce tour si le flow coaching avait conserve l'ownership.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- La trace expose maintenant clairement la note d'exit du local flow.

**Problemes**
- Tour 1: Sophia donne une reponse incoherente, recommande carte d'attaque mais explique aussi de decouper.
- Tour 2: Sophia donne une guidance produit melangeant Plan et Ressources, hors ownership attendu.

**Fix propose**
- Source amont: local dispatcher/reducer coaching.
- Correction recommandee: bloquer l'exit global pour les recommandations actives; aligner `current_recommendation` avec `priority_features` ou demander clarification.
- Tests d'invariant attendus: `plan_action + avoidance + priority attack_card` ne doit pas produire `current_recommendation=adjust_plan` ni `exit_to_global`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: router initial a selectionne `coaching_recommendation`, puis le skill a retourne `status=exit`, expose dans `skill_run`.
- T2: `product_help` reprend faute d'active flow coaching.

**Skills / Operations / Tools**
- Aucun tool execute.
- Aucun effet durable.
- Cleanup cible execute; `user_memories` retourne 404 en local.

**Verdict global:** red. L'observabilite demandee est maintenant effective; elle prouve que le bug vient de l'exit injustifie et d'une contradiction dans la note/recommandation du local flow coaching.
