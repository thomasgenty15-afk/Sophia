# QA Run Report - Coaching Recommendation Ownership Product Guidance R2

## 1. Contexte Du Test

- Date: 2026-06-23
- Run: `coachingrec-ownership-product-guidance-20260623-r2`
- Persona: user QA temporaire `qa-normal-coachingrec-ownership-product-guidance-20260623-r2-1782168444933@example.com`
- Objectif: retester `coaching_recommendation` sur action du plan, guidance produit in-scope et emotion liee a l'action, puis verifier le mode hors plan.
- Trajectoire: action du plan -> choix de levier -> explication novice -> destination Plan -> emotion liee a l'action -> destination potion -> action hors plan -> destination Ressources.
- Surfaces visees: dispatcher global, `readActiveFlowState`, local dispatcher `coaching_recommendation`, visible agents `action_plan_coaching` et `no_plan_coaching`, exit notes, product guidance, absence de side effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Setup: plan QA run-scope avec action active `Préparer le dossier mutuelle`.
- Cleanup: fixtures plan run-scope supprimees; user/messages/chat state/memory run-scopes supprimes. `user_memories` a retourne 404 pendant cleanup car table non disponible sur ce local, sans effet observe sur le run.
- Validite QA: valide.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Dans mon plan, j'ai Préparer le dossier mutuelle. Je reste bloqué avant de m'y mettre et je ne sais pas si Sophia devrait me conseiller une carte d'attaque, une défense, ou carrément modifier l'action.

**Sophia**
> Ici, je partirais sur une carte d’attaque, technique Préparer le terrain : tu bloques avant de commencer, donc l’objectif est de rendre le démarrage plus simple sans toucher à l’action du plan. L’ajustement du plan, ce serait seulement si “Préparer le dossier mutuelle” était mal calibré ou impossible à tenir.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `coaching_type=plan_action`, `last_visible_decision.lever=attack_card`, `variant=preparer_terrain`

### Tour 2

**Verdict du tour:** green

**User**
> Je ne suis pas sûr de comprendre : une carte d'attaque, ça fait quoi concrètement ? Et Préparer le terrain, ça veut dire que je dois changer mon action ?

**Sophia**
> Oui :
> - carte d’attaque = pour t’aider à démarrer quand tu restes bloqué avant l’action
> - carte de défense = pour éviter de décrocher au moment critique, ou de te faire embarquer par un piège
> - ajustement du plan = quand l’action elle-même est mal calibrée, trop lourde ou mal placée
>
> Ici, je partirais sur une carte d’attaque, technique Préparer le terrain : tu bloques avant de t’y mettre, donc l’objectif est de rendre le démarrage plus simple sans changer l’action du plan.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `coaching_type=plan_action`, `last_visible_decision.lever=attack_card`

### Tour 3

**Verdict du tour:** green

**User**
> Ok, je veux juste savoir où cliquer pour la préparer moi-même. Ne lance aucune création depuis le chat.

**Sophia**
> Tu peux le faire depuis **Dashboard > Plan** : ouvre l’action **« Préparer le dossier mutuelle »**, puis prépare une **carte d’attaque**. Ici, le plus adapté est **Préparer le terrain** : tu bloques juste ce qu’il faut autour de l’action pour rendre le démarrage plus simple.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `coaching_type=plan_action`, `current_recommendation.feature=attack_card`, `destination_hint=Dashboard > Plan`

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-06` - Mauvais domaine semantique; `BF-STATE-01` - Mauvaise transition de flow

**User**
> En vrai, c'est surtout que j'ai une boule au ventre quand je pense au dossier mutuelle. Est-ce que là une potion serait plus logique que la carte d'attaque ?

**Sophia**
> Oui, là une potion est plus logique si tu veux surtout faire retomber la boule au ventre 🙂  
> La carte d’attaque sert plutôt à te mettre en mouvement; la potion sert à calmer l’état avant de démarrer. Si l’émotion bloque plus que l’action elle-même, la potion passe d’abord.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `coaching_recommendation_exit_to_global`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- selected_skill_id: `coaching_recommendation`
- active_flow_arbitration: `continue_active`, `active_owner=coaching_recommendation`
- skill_run.status: `exit`
- exit_target: `global`
- exit_note_information.handoff_reason: `topic_change`
- exit_note_information.structured_context.collected_state.current_recommendation: `attack_card`
- exit_note_information.structured_context.collected_state.dispatcher_signal_context.coaching_type: `plan_action`
- active_skill after turn: null

**Analyse si yellow/red**
- Symptome: Sophia recommande une potion alors que l'emotion est explicitement liee a l'action du plan `Préparer le dossier mutuelle`. Selon le contrat metier discute, cela doit rester dans `action_plan_coaching` avec carte d'attaque/defense ou ajustement selon le cas, pas basculer vers potion d'etat global.
- Source amont probable: interpretation locale/visible du dernier message et completion policy. La trace montre que l'active flow arbitration voulait continuer `coaching_recommendation`, mais le skill sort avec `handoff_reason=topic_change`.
- Owner runtime: `coaching_recommendation` local dispatcher + visible `action_plan_coaching` + exit-note policy.
- Meilleure correction selon les guidelines: renforcer le contrat runtime: emotion liee a une action concrete du plan reste `plan_action`; potion seulement pour etat emotionnel global non rattache a une action. Un tour qui compare potion vs carte pour la meme action ne doit pas produire `topic_change`.
- Pourquoi ce n'est pas un patch local: le probleme combine classification semantique, decision visible et transition d'etat; corriger une phrase ne protegerait pas les paraphrases.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne, consequence de `BF-STATE-01`

**User**
> D'accord, et si je suis cette piste, je trouve cette potion où dans Sophia ?

**Sophia**
> Tu la trouves dans **Dashboard > Ressources**.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: null

**Analyse si yellow/red**
- Symptome: la reponse produit est correcte isolee, mais le tour part en `product_help` parce que le flow coaching a ete vide au T4.
- Source amont probable: consequence directe de l'exit T4.
- Owner runtime: `coaching_recommendation` pour la persistence d'ownership; dispatcher global par absence d'active state.
- Meilleure correction selon les guidelines: corriger T4 pour que le flow reste actif, ou si un exit est vraiment necessaire, transmettre une note robuste permettant au global de ne pas traiter comme product_help standalone.
- Pourquoi ce n'est pas un patch local: `product_help` ne doit pas devenir le reparateur des pertes d'ownership coaching.

### Tour 6

**Verdict du tour:** green

**User**
> Autre chose : j'ai une réponse à envoyer à Camille, elle n'est pas dans mon plan, et je repousse dès que j'ouvre le message. Sophia peut m'aider comment sans l'ajouter au plan ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique Préparer le terrain : avant d’ouvrir le message, tu mets tout ce qu’il te faut à portée, pour que le premier geste soit plus simple et que la gêne au démarrage baisse.
>
> Tu la retrouves dans Ressources, puis tu choisis ou crées ce type de carte.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `coaching_type=no_plan_action`, `last_visible_decision.lever=free_attack_card`, `variant=preparer_terrain`

### Tour 7

**Verdict du tour:** green

**User**
> Quand tu dis Ressources, c'est bien là que je la prépare aussi ? Je ne veux pas passer par le Plan pour ce mail.

**Sophia**
> Oui, pour ce mail tu passes par Ressources : tu ouvres Ressources, puis tu choisis ou tu crées ta carte d’attaque libre. Je partirais sur une carte d’attaque, technique Preparer le terrain : elle aide parce que ton blocage est au moment de démarrer, et cette technique rend l’ouverture du message plus simple sans passer par le Plan.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `coaching_type=no_plan_action`, `current_recommendation.feature=attack_card`, `destination_hint=Dashboard > Ressources`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- T1-T3 sont naturels et utiles: Sophia choisit une carte d'attaque, explique le vocabulaire et guide vers `Dashboard > Plan`.
- T6-T7 montrent que le mode hors plan fonctionne: carte d'attaque libre, Ressources, sans passage par le Plan.
- Aucun side effect n'est lance malgre les demandes de guidance.

**Problemes**
- Tour 4: Sophia accepte la piste potion pour une emotion liee a une action du plan. Famille: `BF-INTAKE-06` + `BF-STATE-01`. Impact: le user peut partir vers la mauvaise feature et perdre le raisonnement d'origine. Severite: red.
- Tour 5: la continuite coaching est perdue et `product_help` reprend. Famille: `BF-ROUTE-01` consequence de `BF-STATE-01`. Impact: experience fragmenteee; le contexte "cette emotion est liee a mon action du plan" disparait. Severite: yellow.

**Fix propose**
- Source amont: contrat de classification dans `coaching_recommendation` local dispatcher + visible `action_plan_coaching` + exit policy.
- Correction recommandee: inscrire comme invariant bloquant: emotion rattachee a une action concrete du plan ne route pas vers potion et ne produit pas `topic_change`; elle reste dans `plan_action` avec carte d'attaque/defense ou ajustement uniquement si l'action est mal calibree/impossible.
- Tests d'invariant attendus: paraphrases "boule au ventre", "stress", "peur d'ouvrir", "angoisse avant de commencer" rattachees a une action du plan doivent rester `coaching_type=plan_action`, `response_owner=coaching_recommendation`, sans `exit_to_global`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1-T3: correct, active flow conserve.
- T4: contradiction systeme. L'arbitrage global indique `continue_active` avec `active_owner=coaching_recommendation`, mais le skill sort en `status=exit`, `exit_target=global`, `handoff_reason=topic_change`.
- T5: par absence d'active state, le global route en `product_help_signal`.
- T6-T7: re-entree correcte et ownership conserve pour action hors plan.

**Skills / Operations / Tools**
- Skill principal: `coaching_recommendation`.
- Aucun tool ni operation engageante.
- Le visible ou le local dispatcher de T4 ne respecte pas la distinction emotion globale vs emotion rattachee a l'action.

**Memory / Effets durables**
- Aucun effet durable attendu.
- Aucun effet durable observe.
- Cleanup run-scope effectue.

**Problemes**
- Tour 4: mauvaise decision metier + mauvaise transition `topic_change`. Famille: `BF-INTAKE-06` et `BF-STATE-01`. Impact systeme: le flow actif est supprime malgre une demande in-scope. Severite: red.
- Tour 5: mauvais owner par cascade. Famille: `BF-ROUTE-01`. Impact systeme: `product_help` traite une question qui aurait du rester rattachee au coaching. Severite: yellow.

**Fix propose**
- Source amont: `coaching_recommendation` reducer/local dispatcher/visible prompt contracts.
- Correction recommandee: rendre le `coaching_type` transmis par le global et l'etat actif contraignant: si `coaching_type=plan_action` et `action_context.source=plan`, une emotion dans le dernier message est analysee comme friction de l'action, pas comme emotion globale, sauf signal explicite de detachement du plan.
- Tests d'invariant attendus:
  - T4-like: "j'ai une boule au ventre quand je pense a [action du plan]" reste `plan_action`, recommande carte d'attaque/defense selon cause, pas potion.
  - T5-like: demande "ou la trouver" apres T4-like reste `active_coaching_recommendation`.
  - Vrai etat global: "je suis anxieux depuis ce matin sans action precise" peut aller vers potion/emotion coaching.

## Verdict Global

Verdict global: **red**.

Les follow-ups produit sont correctement geres quand l'active flow reste vivant. Le run echoue sur le cas central emotion liee a action du plan: Sophia conseille une potion, produit un `topic_change`, vide l'active flow, puis laisse `product_help` reprendre le tour suivant.
