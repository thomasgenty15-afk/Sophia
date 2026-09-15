# QA Run Report - Weekly Process R5

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `weekly-qa-20260624-r5-partial_habits_mission_partial`
- Persona: connexion temporaire locale `qa-weekly-deep-weekly-qa-20260624-r5-partial_habits_mission_partial@example.com`
- Objectif: retester le weekly apres correction R4 sur `adjust_recommendation`, destination user-facing et cloture visible.
- Trajectoire: fixture weekly dynamique semaine 2026-06-15 -> 2026-06-21 -> Tour 0 via `/functions/v1/process-checkins` -> 5 tours utilisateur via `/functions/v1/test-send-message`.
- Surfaces visees: `process-checkins`, active state `weekly_adaptive_review_v1`, dispatcher/reducer weekly, visibles weekly, `adjust_recommendation`, gates `solution_fit/synthesis/closure`, EffectLedger, DB.
- Cadre IA reel: Supabase local, execution hors sandbox, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Le Tour 0 vient de `process-checkins`; les 5 tours utilisateur sont HTTP 200, non vides, et passent par le chemin IA reel local.

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r5-partial_habits_mission_partial/setup.json`
- Transcript brut/state: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r5-partial_habits_mission_partial/state.json`
- DB avant cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r5-partial_habits_mission_partial/db-after-run.json`
- Cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r5-partial_habits_mission_partial/cleanup.json`
- Feuille bugs: aucune, verdict green.

Preuves Tour 0:
- `process_checkins.success=true`, `processed=1`, request id `weekly-ai-opening-mqsh9pir`.
- Run cible `weekly-qa-20260624-r5-partial_habits_mission_partial` passe `sent`, `delivery_last_error=null`.
- Ouverture issue de `process-checkins:weekly_adaptive_review_opening`.

Cleanup:
- Cleanup cible execute sur le user temporaire; `errors=[]`, Auth delete `200`.
- Verification directe post-cleanup: `user_chat_states=0`, `chat_messages=0`, `scheduled_checkins=0`, `user_plan_item_entries=0`, `user_habit_week_occurrences=0`, `user_habit_week_plans=0`, `user_plan_items=0`, `user_plans_v2=0`, `user_cycles=0`.

## 2. Tours De Conversation

### Tour 0 - Process Checkins / Ouverture Weekly

**Verdict du tour:** green

**User**
> Aucun message utilisateur. Declenchement proactif via `process-checkins`.

**Sophia**
> C’est le moment de faire le point sur ta semaine, avec ce qui a tenu et ce qui est resté un peu en suspens.
> J’ai l’impression qu’il y a eu de petits pas, mais aussi de la fatigue qui a pesé sur la suite.
> Comment tu l’as vécue, globalement ?

**Trace courte**
- http_status: 200 sur `process-checkins`
- process_checkins: `success=true`, `processed=1`
- scheduled_checkin_status cible: `sent`
- active_skill_state: `weekly_adaptive_review_v1`
- durable_effect: ouverture weekly persistee; aucun patch de plan applique

### Tour 1

**Verdict du tour:** green

**User**
> Je l’ai vécue comme utile mais encore fragile. Les repères m’ont aidé à ne pas décrocher, mais les soirs où je rentrais tard, je n’avais plus l’énergie pour faire les actions normalement.

**Sophia**
> Sur cette semaine, avec les actions que tu as faites malgré la fatigue du soir, tu as le sentiment d’avancer vers ton objectif global, même un peu ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `answer_weekly_question`
- visible_task: `ask_global_progress_feeling`
- weekly_stage: `global_progress`
- weekly_gates: `global_progress_status=missing`, `felt_progress_status=captured`
- adjust_recommendation: `status=none`, `confidence=0`
- EffectLedger: `committed_effects=[]`

### Tour 2

**Verdict du tour:** green

**User**
> Oui, un peu. Je n’ai pas installé un rythme stable, mais je n’ai pas lâché complètement. Côté actions : le point positif a été fait lundi, commencé mercredi, sauté vendredi. La respiration a marché mardi mais pas jeudi. Le signal de pause est resté en brouillon.

**Sophia**
> Je vois le point clé : ça t’aide, mais le soir ça tient mal quand tu rentres tard. Pour toi, le bon levier serait plutôt une version plus légère à ce moment-là, ou un autre moment de la journée ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `confirm_weekly_diagnostic`
- visible_task: `qualify_solution_fit`
- weekly_stage: `solution_fit`
- weekly_gates: `global_progress_status=captured`, `felt_progress_status=captured`, `solution_fit_status=captured`
- adjust_recommendation: `status=none`, `confidence=0`
- EffectLedger: `committed_effects=[]`

### Tour 3

**Verdict du tour:** green

**User**
> Plutôt une version plus légère au moment du retour tardif. Quand je rentre tard, je peux encore faire une mini-version, mais pas la version normale.

**Sophia**
> Cette semaine, tu n’as pas lâché, même sans rythme stable. Les repères t’ont aidé à tenir, et côté actions il y a eu du fait, du commencé et du sauté selon les jours : le point positif a avancé partiellement, la respiration a bien marché certains jours mais a sauté quand tu rentrais tard, et le signal de pause est resté en brouillon. Je retiens aussi que tu avances un peu vers l’objectif global, mais de façon encore fragile. Le point le plus fragile, c’est la tenue des actions en fin de journée quand l’énergie baisse. Voici la synthèse à garder pour la cloture.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `answer_weekly_question`
- visible_task: `weekly_synthesis`
- weekly_stage: `synthesis`
- weekly_gates: `solution_fit_status=captured`, `synthesis_status=needs_deeper`, `closure_status=missing`
- adjust_recommendation: `status=none`, `confidence=0`
- EffectLedger: `committed_effects=[]`
- durable_effect: aucun changement de plan; aucune recommandation d'ajustement precise sans champ safe

### Tour 4

**Verdict du tour:** green

**User**
> Pour la suite, si je veux garder une intention claire, tu me recommandes quoi exactement ? Et est-ce que tu peux ajuster le plan ici ou je dois le mettre quelque part ?

**Sophia**
> Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait d’alléger les actions de fin de journée avec une mini-version au retour tardif, parce que l’énergie basse le soir a surtout bloqué la version normale alors que la mini-version semble tenable. Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau. Confiance élevée.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `explain_weekly_reasoning`
- visible_task: `weekly_adjust_recommendation`
- weekly_stage: `synthesis`
- weekly_planning_context.mode: `next_level_required`
- adjust_recommendation: `status=surfaced`, `confidence=0.98`, `safe_to_surface=true`, `target_scope=next_level_inputs`
- adjust_recommendation.what_to_adjust: alleger la forme des actions de fin de journee; prevoir une version mini au retour tardif; rendre optionnelles les actions impossibles les soirs tardifs
- adjust_recommendation.evidence: cause soir tardif + mini-version tenable + distribution d'actions `2/6 faites, 2 partielles, 2 non faites`
- EffectLedger: `committed_effects=[]`
- durable_effect: aucun changement de plan

### Tour 5

**Verdict du tour:** green

**User**
> Ok, ça me va. Tu peux clôturer le bilan weekly maintenant, sans changement automatique.

**Sophia**
> Ta semaine a été utile mais encore fragile. Tu as gardé les repères, avec une vraie tenue sur certaines actions, mais les soirs de retour tardif ont coupé l’énergie et fait sauter la version normale. Tu avances quand même vers ton objectif global : il y a un peu plus de stabilité qu’au départ, sans installation complète du rythme. Le point fragile est clair : la forme actuelle demande trop les soirs tardifs. Je ne modifie pas le plan ici. En revanche, l’ajustement utile à envisager serait d’alléger la fin de journée, avec une mini-version prévue quand tu rentres tard. Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau. Je clôture le bilan weekly ici.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `complete_weekly_no_change`
- visible_task: `weekly_closure`
- weekly_stage: `closing`
- weekly_gates: `synthesis_status=complete`, `closure_status=complete`
- validation_unlock_status: `available`
- adjust_recommendation: `status=surfaced`, `confidence=0.98`, `safe_to_surface=true`, `target_scope=next_level_inputs`
- EffectLedger: `committed_effects=[]`
- durable_effect: aucun changement de plan

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia reste dans le weekly tout du long et suit une progression naturelle: ressenti global, progression, levier, synthese, recommandation explicite, cloture.
- Elle ne recommande pas d'ajustement avant d'avoir le signal explicite sur mini-version / retour tardif.
- La destination est claire et user-facing: `Validation du niveau, au moment de valider le niveau`.
- La cloture est visible et alignee: "Je clôture le bilan weekly ici."
- Le wording interdit "ce qui bougerait / ce qui resterait" ne sort pas dans les reponses visibles.

**Problemes**
- Aucun probleme bloquant observe. Petit detail non bloquant: Tour 3 affiche "cloture" sans accent dans une phrase, sans impact de comprehension ou de contrat runtime.

**Fix propose**
- Aucun fix requis pour ce scenario.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours user restent `response_owner=weekly_adaptive_review_v1`.
- `active_flow_arbitration=continue_active` sur tous les tours.
- Aucune sortie vers `coaching_recommendation`.
- Aucune occurrence runtime visible de `minimal_global_dispatcher`.

**Skills / Operations / Tools**
- Operation active: `weekly_adaptive_review_v1` uniquement.
- Aucun executor adjust-plan appele.
- Aucun tool durable execute.
- `committed_effects=[]` sur tous les tours.

**Etat weekly**
- `weekly_planning_context.mode=next_level_required`.
- Avant T4, `adjust_recommendation=status=none`, et les messages restent sur constats/synthese sans recommandation d'ajustement precise.
- T4 peuple correctement `adjust_recommendation`:
  - `status=surfaced`
  - `confidence=0.98`
  - `safe_to_surface=true`
  - `target_scope=next_level_inputs`
  - `surfaced_in_weekly=true`
- T5 cloture proprement:
  - `flow_action=complete_weekly_no_change`
  - `visible_task=weekly_closure`
  - `synthesis_status=complete`
  - `closure_status=complete`
  - `validation_unlock_status=available`

**DB / Effets durables**
- Capture avant cleanup:
  - `user_chat_states=2`
  - `chat_messages=12`
  - `scheduled_checkins=1`
  - `user_plan_item_entries=6`
  - `user_habit_week_occurrences=6`
  - `user_habit_week_plans=3`
  - `user_plan_items=4`
  - `user_plans_v2=1`
  - `user_cycles=1`
  - `user_transformations=1`
- Aucun effet durable de plan applique par le weekly conversationnel.
- Cleanup cible OK: `errors=[]`; verification directe post-cleanup OK.

**Fix propose**
- Aucun fix requis pour ce scenario.

## Verdict Global

`green`.

Le run valide les corrections post-R4: pas de recommandation visible sans champ safe, `adjust_recommendation` est bien structuree quand la recommandation est rendue, la destination `Validation du niveau` est user-facing, et la cloture visible est alignee avec `closure_status=complete`. Aucun changement de plan n'est applique depuis le chat.
