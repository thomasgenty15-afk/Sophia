# Weekly Process R7 - QA Run Report

## 1. Contexte Du Test

- Date: 2026-06-25
- Run: `weekly-qa-20260625-r7-partial_habits_mission_partial`
- Persona: temporary QA user, email `qa-weekly-deep-weekly-qa-20260625-r7-partial_habits_mission_partial@example.com`
- Objectif: verifier le fix anti-repetition de recommandation en cloture weekly, depuis Tour 0 `process-checkins`, avec recommandation `adjust_recommendation` deja surfacee.
- Trajectoire: `process-checkins` weekly opening -> `/functions/v1/test-send-message` local full AI -> weekly adaptive review active flow -> synthese -> recommandation -> demandes explicites de cloture.
- Surfaces visees: `weekly_adaptive_review_v1`, local dispatcher/reducer, visible tasks `weekly_synthesis`, `weekly_adjust_recommendation`, `weekly_closure`, active-flow routing, gates weekly, effect ledger, validation unlock.
- Cadre IA reel: Supabase local, `test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct, pas de staging.
- Validite QA: valide. Le Tour 0 a ete produit par `process-checkins`; les tours utilisateur ont ete choisis apres lecture des reponses Sophia et des traces.

## 2. Tours De Conversation

### Tour 0 - Opening proactive

**Verdict du tour:** green

**User**
> N/A - scheduled checkin weekly via `process-checkins`.

**Sophia**
> C’est le moment du bilan de la semaine, et je vois qu’il y a eu un mélange de choses faites, en cours et restées un peu de côté.
> Comment tu l’as vécue, globalement ?

**Trace courte**
- endpoint: `process-checkins`
- status: success
- processed: 1
- opening_source: `process-checkins:weekly_adaptive_review_opening`
- durable_effect: active weekly state initialized

### Tour 1

**Verdict du tour:** green

**User**
> Globalement, je dirais que ça a aidé, mais que ça n’a pas tenu partout. J’ai réussi quand la journée finissait normalement ; dès que je rentrais tard, la version complète devenait trop lourde.

**Sophia**
> Je comprends : la fatigue et les retours tardifs expliquent surtout pourquoi la tenue a coincé. Le levier à préciser, c’est plutôt une version plus courte en fin de journée, ou autre chose ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `qualify_solution_fit`
- operation: `weekly_review_local_confirm_weekly_diagnostic`
- executed_tools: []
- durable_effect: none, effect ledger committed=0

### Tour 2

**Verdict du tour:** green

**User**
> Oui, la version courte me paraît être le vrai levier. Côté actions : le point positif a été fait lundi, commencé mercredi, raté vendredi. La respiration a marché mardi mais pas jeudi. Et le signal de pause est resté au stade de brouillon. Donc je vois un petit progrès, mais pas encore un rythme stable.

**Sophia**
> Cette semaine, tu as bien avancé par moments : le point positif a été fait lundi, la respiration de pause a marché mardi, et le signal de pause est resté au brouillon. Le gain est réel mais partiel sur ton objectif de stabiliser le rythme de fin de journée : ça tient quand la journée finit normalement, et ça casse dès que tu rentres tard, avec une version complète trop lourde. Le point fragile est donc clair : la version courte est la bonne base, mais la tenue n’est pas encore stable partout.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_synthesis`
- operation: `weekly_review_local_confirm_weekly_diagnostic`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- DB after turn: `synthesis_visible_status=rendered`, `adjust_recommendation.safe_to_surface=false`

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Ok. Pour la suite, qu’est-ce que tu me conseilles de noter précisément ? Et est-ce que ça se fait ici ou dans la plateforme ?

**Sophia**
> Sur la semaine du 15 au 21 juin, tu as tenu la version courte quand la journée finissait normalement, et tu as vu que la version complète devenait trop lourde quand tu rentrais tard. Côté actions, le point positif a été fait lundi, commencé mercredi puis raté vendredi ; la respiration a marché mardi mais pas jeudi ; le signal de pause est resté au stade de brouillon. Tu avances un peu, mais le rythme n’est pas encore stable, surtout dès que la fin de journée se complique.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_synthesis`
- operation: `weekly_review_local_recap_weekly`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- DB state: `adjust_recommendation.status=none`

**Analyse si yellow/red**
- Symptome: le user demande explicitement quoi noter et ou le faire; Sophia repete la synthese sans repondre a la destination ni a l'intention precise.
- Source amont probable: dispatcher weekly choisit `weekly_synthesis` / `recap_weekly` au lieu de `weekly_adjust_recommendation` quand la demande user porte sur "quoi noter pour la suite".
- Owner runtime: `weekly_adaptive_review_v1` local dispatcher/reducer.
- Meilleure correction selon les guidelines: router cette intention vers `weekly_adjust_recommendation` si la recommandation peut etre remplie au seuil, sinon demander le signal manquant.
- Pourquoi ce n'est pas un patch local: le probleme est une transition de flow/intention, pas une phrase visible isolee.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Oui, ça c’est le bilan. Mais concrètement, l’intention à renseigner pour le prochain niveau, ce serait quoi ? Je veux juste la phrase utile à reprendre, sans que tu modifies le plan ici.

**Sophia**
> Note surtout ceci dans la Validation du niveau : « stabiliser une version courte du rituel de fin de journée, surtout les jours de retour tardif ». Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, c’est l’ajustement utile à envisager. Côté semaine : tu as eu un petit progrès, avec une meilleure tenue quand la journée finit normalement, mais la version complète devient trop lourde quand tu rentres tard, et le signal de pause est encore resté en brouillon.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_synthesis`
- operation: `weekly_review_local_explain_weekly_reasoning`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- DB state: `adjust_recommendation.status=surfaced`, `safe_to_surface=true`, `surfaced_in_weekly=true`, `confidence=0.98`, `target_scope=next_level_inputs`

**Analyse si yellow/red**
- Symptome: la reponse fournit enfin la bonne intention et la bonne destination, mais reste routee/rendue comme `weekly_synthesis` et ajoute un recap non demande.
- Source amont probable: le dispatcher remplit `adjust_recommendation` mais ne choisit pas `visible_task=weekly_adjust_recommendation`.
- Owner runtime: `weekly_adaptive_review_v1` local dispatcher/reducer.
- Meilleure correction selon les guidelines: quand `adjust_recommendation.safe_to_surface=true` et le user demande la phrase a reprendre, utiliser le visible agent dedie `weekly_adjust_recommendation`.
- Pourquoi ce n'est pas un patch local: la preuve systeme montre une incoherence entre champ rempli et visible task selectionnee.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok, c’est clair. Tu peux clôturer le bilan weekly maintenant, sans refaire le conseil ni le bilan détaillé.

**Sophia**
> Je ne modifie pas le plan ici. En revanche, la phrase utile à reprendre est : « Stabiliser une version courte du rituel de fin de journée, surtout les jours de retour tardif. » Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_synthesis`
- operation: `complete_weekly_no_change`
- reason_code: `weekly_review_completion_requires_synthesis`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- DB state: `closure_status=complete`, `synthesis_status=captured`, `status=open`, `validation_unlock.status=locked_until_weekly_complete`

**Analyse si yellow/red**
- Symptome: le user demande une cloture sans repetition; Sophia repete exactement la recommandation et ne cloture pas le flow.
- Source amont probable: reducer bloque `complete_weekly_no_change` avec `weekly_review_completion_requires_synthesis` parce que `synthesis_status` reste `captured`, tout en gardant `closure_status=complete`; la visible task forcee reste `weekly_synthesis`, donc les hard constraints de `weekly_closure` ne s'appliquent pas.
- Owner runtime: weekly reducer / gate completion.
- Meilleure correction selon les guidelines: quand `synthesis_visible_status=rendered` et qu'une synthese a deja ete visible, le gate `synthesis_status` doit pouvoir passer `complete` ou la completion doit forcer `weekly_closure`, pas `weekly_synthesis`.
- Pourquoi ce n'est pas un patch local: le fix anti-repetition de `weekly_closure` n'est pas exerce car le reducer ne choisit pas `weekly_closure`.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Non, je ne veux pas répéter l’intention. Je veux seulement terminer le point weekly maintenant.

**Sophia**
> C’est noté. Je garde seulement le point utile : petit progrès, mais ça reste fragile quand tu rentres tard, et la version courte tient mieux que la complète. Pour la validation du niveau, la phrase à reprendre est : « stabiliser une version courte du rituel de fin de journée, surtout les jours de retour tardif ».

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_synthesis`
- operation: `complete_weekly_no_change`
- reason_code: `weekly_review_completion_requires_synthesis`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- final DB state: `status=open`, `stage=synthesis`, `closure_status=complete`, `synthesis_status=captured`, `validation_unlock.status=locked_until_weekly_complete`

**Analyse si yellow/red**
- Symptome: meme apres correction explicite du user, Sophia repete encore l'intention et ne termine pas le weekly.
- Source amont probable: meme blocage gate/reducer que T5; le flow est coince en `weekly_synthesis` alors que le user demande `weekly_closure`.
- Owner runtime: weekly reducer / gate completion.
- Meilleure correction selon les guidelines: traiter `synthesis_visible_status=rendered` comme preuve de synthese deja visible pour la completion; interdire `weekly_synthesis` quand `closure_status=complete` et le user demande uniquement cloture.
- Pourquoi ce n'est pas un patch local: la reponse visible suit le mauvais stage; il faut corriger la machine d'etat.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Sophia garde le bon cadre non-mutant: elle ne dit pas que le plan a ete modifie.
- La destination "Validation du niveau" est correcte quand elle apparait.
- Pas de "Confiance elevee" visible.
- Pas de `minimal_global_dispatcher`.

**Problemes**
- Tour 3: la demande "quoi noter / ou" est ignoree et remplacee par un recap. Famille: BF-PROACTIVE-01. Impact: le user doit se repeter.
- Tour 4: Sophia repond finalement, mais ajoute un recap non demande. Famille: BF-PROACTIVE-01. Impact: lourdeur conversationnelle.
- Tours 5-6: le user demande explicitement de cloturer et de ne pas repeter l'intention; Sophia repete encore l'intention et ne cloture pas. Famille: BF-STATE-01. Impact: experience bloquee, le user perd le controle de la fin du flow.

**Fix propose**
- Source amont: weekly local reducer + dispatcher visible task selection.
- Correction recommandee: si `synthesis_visible_status=rendered`, ne pas bloquer `complete_weekly_no_change` sur `synthesis_status=captured`; forcer `visible_task=weekly_closure` quand le user demande seulement cloture. Si `adjust_recommendation.safe_to_surface=true` sur demande "quoi noter", utiliser `weekly_adjust_recommendation`, pas `weekly_synthesis`.
- Tests d'invariant attendus: run local reducer avec `synthesis_visible_status=rendered`, `adjust_recommendation.surfaced_in_weekly=true`, user demande cloture; attendu `visible_task=weekly_closure`, `status=completed`, `validation_unlock.status=available`, pas de repetition visible.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tous les tours restent chez `weekly_adaptive_review_v1`, ce qui est correct pour un active weekly.
- `active_flow_arbitration` est coherent: `continue_active`, `active_owner=weekly_adaptive_review_v1`.
- Le probleme n'est pas le global router; il est dans le local dispatcher/reducer weekly.

**Skills / Operations / Tools**
- Aucun tool execute; effect ledger `committed=0` sur tous les tours.
- `adjust_recommendation` devient bien `surfaced` avec `confidence=0.98`, `target_scope=next_level_inputs`, `safe_to_surface=true`.
- Mais le visible task reste `weekly_synthesis` aux Tours 4, 5 et 6, meme quand le user demande recommandation ou cloture.

**Memory / Effets durables**
- Aucun patch de plan applique.
- Final DB avant cleanup: `status=open`, `stage=synthesis`, `closure_status=complete`, `synthesis_status=captured`, `validation_unlock.status=locked_until_weekly_complete`.
- Cleanup cible effectue: `user_chat_states_count=0`, `chat_messages_count=0`, `profiles_count=0`.

**Problemes**
- T5-T6: etat incoherent `closure_status=complete` mais `status=open` et validation verrouillee. Famille: BF-STATE-01. Impact systeme: flow weekly non terminable dans ce scenario.

**Fix propose**
- Source amont: reducer `weekly_review_completion_requires_synthesis` et mapping des gates visibles.
- Correction recommandee: faire converger `synthesis_visible_status=rendered` avec `synthesis_status=complete` lors d'une demande explicite de cloture, ou prioriser `weekly_closure` si `closure_status=complete` mais `status` reste open.
- Tests d'invariant attendus: test reducer + rerun IA reel R8 sur la meme trajectoire.

## Verdict Global

**red** - Le run est valide et montre que le fix anti-repetition n'est pas verifie en conditions reelles: le flow ne selectionne pas `weekly_closure`, reste bloque en `weekly_synthesis`, repete la recommandation malgre la consigne user, et laisse la validation verrouillee.
