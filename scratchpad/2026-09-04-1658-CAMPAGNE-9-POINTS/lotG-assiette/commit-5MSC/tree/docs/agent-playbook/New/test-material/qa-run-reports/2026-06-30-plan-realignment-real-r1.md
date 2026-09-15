# QA Run Report - plan_realignment_real_r1

## 1. Contexte Du Test

- Date: 2026-06-30
- Run: `plan_realignment_real_r1`
- Persona: `qa-skill`, connexion temporaire `plan_realign_planrealign_r1`
- Objectif: tester en conditions reelles locales le nouveau flow `plan_realignment`.
- Trajectoire: decrochage du plan global -> refus d'execution depuis le chat -> guidance produit dans le flow -> conseil de realignement -> recentrage vers action precise.
- Surfaces visees: dispatcher global, `readActiveFlowState`, router actif, local flow `plan_realignment`, visible agent, exit note vers global, absence d'effet durable.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, appels tour par tour, aucune reponse fabriquee par renderer/fallback.
- Validite QA: valide. Trace exportee dans `tmp/planrealign_r1_trace.json`; 10 `chat_messages`, 0 `system_error_logs`, 0 effet durable. Connexion temporaire nettoyee apres run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai complètement décroché de mon plan cette semaine. J'ai pris du retard partout et je ne sais pas si je dois tout rattraper ou revoir le plan.

**Sophia**
> Ça arrive, et tu n’as pas à tout rattraper d’un coup. Le plus utile là, c’est de repartir sur un plan réaliste : va dans Dashboard > Plan pour revoir ta semaine et réaligner tes actions depuis l’interface.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `plan_realignment_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`, `response_intent=plan_realignment_week_drift`
- executed_tools: []
- durable_effect: none
- skill_run: `selected_skill_id=plan_realignment`, `status=continue`

### Tour 2

**Verdict du tour:** green

**User**
> Ok, tu peux me le réorganiser directement ici ? Genre alléger ma semaine toi-même.

**Sophia**
> Non, je ne peux pas le faire ici. Le réalignement se fait dans Dashboard > Plan : ouvre ton plan, puis allège, décale ou repriorise tes actions depuis l’interface.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none
- skill_run: `selected_skill_id=plan_realignment`, `status=continue`

### Tour 3

**Verdict du tour:** green

**User**
> Je vais où exactement dans Sophia pour faire ça ? Je ne connais pas trop l’interface.

**Sophia**
> Va dans Dashboard > Plan. C’est là que tu peux revoir ta semaine et, si besoin, alléger, déplacer ou reprioriser tes actions depuis l’interface. Le plan sert justement à te réaligner quand tu as décroché.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none
- skill_run: `selected_skill_id=plan_realignment`, `status=continue`

### Tour 4

**Verdict du tour:** green

**User**
> Mais comment je choisis quoi alléger ? J’ai peur de juste supprimer les trucs importants parce que je panique.

**Sophia**
> Le plus sûr, c’est de ne rien supprimer dans la panique. Dans Dashboard > Plan, garde d’abord ce qui est vraiment urgent ou indispensable, puis allège le reste en décalant ou en retirant les tâches les moins critiques.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none
- skill_run: `selected_skill_id=plan_realignment`, `status=continue`

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-04` - Ambiguite non reconnue; secondaire `BF-INTAKE-06` - Mauvais domaine semantique

**User**
> En fait ce n’est peut-être pas toute la semaine : c’est surtout le mail à Camille, je bloque dès que j’ouvre le brouillon. Là tu m’aiderais comment ?

**Sophia**
> Je partirais sur une carte d’attaque, technique texte magique : une phrase courte pour casser le blocage au moment où tu ouvres le brouillon et te remettre dans le geste sans te prendre la tête. Tu la prépares depuis l’action « mail à Camille » dans le Plan.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=light`, `response_intent=coaching on blocked email action after plan drift context`
- executed_tools: []
- durable_effect: none
- note_information: `source_flow_id=plan_realignment`, `target_dispatcher=global`, `recommended_next_focus=global`
- coaching signal: `coaching_type=plan_action`, `action_context.source=plan`, `plan_item_id=null`, `action_title=mail à Camille`
- skill_run: `selected_skill_id=coaching_recommendation`, `status=continue`

**Analyse si yellow/red**
- Symptome: le handoff `plan_realignment -> global -> coaching_recommendation` est bon, mais le coaching suppose une action du Plan alors que `plan_item_id=null`. La phrase "depuis l’action mail à Camille dans le Plan" n'est donc pas justifiee.
- Source amont probable: contrat d'intake du signal `coaching_recommendation.context.action_context` et/ou garde reducer coaching. `source=plan` ne devrait pas etre admissible sans `plan_item_id`.
- Owner runtime: dispatcher global `coaching_recommendation` + local dispatcher/reducer `coaching_recommendation`.
- Meilleure correction selon les guidelines: renforcer le contrat structurel, pas patcher la phrase. Si `coaching_type=plan_action`, alors `action_context.source=plan` exige un `plan_item_id` resolu; sinon le signal doit etre `no_plan_action` ou `ambiguous`, et le visible ne doit pas utiliser `action_plan_coaching`.
- Pourquoi ce n'est pas un patch local: le probleme vient du contexte structure transmis au visible agent, pas d'un wording isole. Corriger uniquement la phrase laisserait le meme faux domaine alimenter les decisions suivantes.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1-T4 sont naturels: Sophia rassure sans culpabiliser, ne pousse pas a tout rattraper, et guide vers `Dashboard > Plan`.
- T2 respecte clairement la contrainte produit: pas d'ajustement du plan depuis le chat.
- T3 garde la question produit dans le flow actif au lieu de sauter vers `product_help`.

**Problemes**
- Tour 5: la transition vers coaching est naturelle, mais la recommandation produit est trop affirmative sur une action du Plan non resolue. Famille: `BF-INTAKE-04`. Impact: le user peut chercher une action inexistante dans le Plan. Severite: yellow.

**Fix propose**
- Source amont: contrat `coaching_recommendation` d'entree + reducer/garde de visible target.
- Correction recommandee: rendre invalide `plan_action` quand `plan_item_id=null`, sauf cas explicitement marque comme `ambiguous` avec demande de clarification. Pour une action precise non reliee au plan, utiliser `no_plan_action`.
- Tests d'invariant attendus: paraphrase "ce n'est pas toute la semaine, c'est le mail X" sans action plan existante -> `coaching_type=no_plan_action|ambiguous`, jamais `action_plan_coaching`; cas positif avec `plan_item_id` resolu -> `plan_action`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: signal global `plan_realignment` correct: `drift_type=missed_plan`, `scope=week`, `product_execution_allowed=false`.
- T2-T4: `readActiveFlowState` fonctionne; le router garde `response_owner=plan_realignment` avec `route_reason=active_plan_realignment`.
- T5: la sortie du local flow est propre: `note_information.source_flow_id=plan_realignment`, `target_dispatcher=global`, puis reprise par `coaching_recommendation`.

**Skills / Operations / Tools**
- `plan_realignment` ne declenche aucun tool et ne promet aucun patch de plan.
- Aucun effet durable n'est cree pendant le run.
- Le probleme T5 est dans le skill suivant, pas dans l'ownership de `plan_realignment`.

**Memory / Effets durables**
- `memory_mode=none` pendant T1-T4, proportionne au besoin.
- T5 passe en `memory_mode=light`, acceptable pour coaching.
- DB: `chat_messages=10`, `system_error_logs=0`, `effect_ledger.committed=0`.
- Apres run, connexion temporaire nettoyee via `scripts/qa-cleanup-run-connection.sh`.

**Problemes**
- Tour 5: `coaching_recommendation` recoit `action_context.source=plan` avec `plan_item_id=null` et produit une guidance Plan non fondee. Famille: `BF-INTAKE-04`. Impact systeme: le contrat d'entree laisse passer un etat contradictoire. Severite: yellow.

**Fix propose**
- Source amont: global dispatcher signal contract + local coaching reducer admission.
- Correction recommandee: ajouter un invariant contractuel "plan_action exige plan_item_id" et fallback structurel vers `no_plan_action`/`ambiguous`; ajouter un test global dispatcher et un test reducer/visible admission.
- Tests d'invariant attendus: action precise non resolue apres sortie `plan_realignment` -> pas de `action_plan_coaching`; action resolue dans plan snapshot -> `action_plan_coaching`; question produit dans plan_realignment actif -> reste `plan_realignment`.

## Verdict Global

- Verdict: yellow
- Raison principale: le nouveau flow `plan_realignment` fonctionne bien, mais la sortie vers coaching revele une ambiguite non reconnue entre action du Plan et action hors Plan.
- Follow-up prioritaire: verrouiller le contrat `coaching_recommendation`: `coaching_type=plan_action` ne doit jamais etre produit ni consomme comme tel sans `plan_item_id` resolu.
