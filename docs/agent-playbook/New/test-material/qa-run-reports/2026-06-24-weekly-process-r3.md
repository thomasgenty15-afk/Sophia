# QA Run Report - Weekly Process R3

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `weekly-qa-20260624-r3-partial_habits_mission_partial`
- Persona: connexion temporaire locale `qa-weekly-deep-weekly-qa-20260624-r3-partial_habits_mission_partial@example.com`
- Objectif: retester le weekly apres correction de la sortie prematuree, du label `minimal_global_dispatcher`, du contexte `next_level_required` et de `adjust_recommendation`.
- Trajectoire: fixture weekly dynamique semaine 2026-06-15 -> 2026-06-21 -> Tour 0 via `/functions/v1/process-checkins` -> 7 tours utilisateur via `/functions/v1/test-send-message`.
- Surfaces visees: `process-checkins`, active state `weekly_adaptive_review_v1`, dispatcher weekly, reducer/gates weekly, visible agents weekly, `weekly_planning_context`, `adjust_recommendation`, EffectLedger, observabilite route, DB.
- Cadre IA reel: Supabase local, execution hors sandbox, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Le Tour 0 vient de `process-checkins`; les 7 tours utilisateur sont HTTP 200, non vides, et passent par le chemin IA reel local.

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r3-partial_habits_mission_partial/setup.json`
- Transcript brut/state: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r3-partial_habits_mission_partial/state.json`
- DB avant cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r3-partial_habits_mission_partial/db-after-run.json`
- Cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r3-partial_habits_mission_partial/cleanup.json`
- Feuille bugs: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-24-weekly-process-r3-bugs.md`

Preuves Tour 0:
- `process_checkins.success=true`, `processed=1`, request id `weekly-ai-opening-mqs4ufdf`.
- Checkin cible passe `sent`.
- Ouverture issue de `process-checkins:weekly_adaptive_review_opening`.

Cleanup:
- Cleanup cible execute sur le user temporaire; `errors=[]`, Auth delete `200`.
- Verification directe post-cleanup: `user_chat_states=0`.
- Tables post-cleanup: `chat_messages=0`, `scheduled_checkins=0`, `user_plan_item_entries=0`, `user_habit_week_occurrences=0`, `user_habit_week_plans=0`, `user_plan_items=0`, `user_plans_v2=0`, `user_cycles=0`.

Incident technique mineur:
- Une premiere capture DB a echoue avant requete utile avec `ERR_AMBIGUOUS_MODULE_SYNTAX` dans un `node -e`; aucune mutation DB. La capture a ete relancee correctement et ecrite dans `db-after-run.json`.

## 2. Tours De Conversation

### Tour 0 - Process Checkins / Ouverture Weekly

**Verdict du tour:** green

**User**
> Aucun message utilisateur. Declenchement proactif via `process-checkins`.

**Sophia**
> C’est le moment de faire le point sur ta semaine.
> J’ai vu qu’il y a eu des choses qui ont avancé, avec aussi un peu de fatigue et quelques points restés ouverts.
> Comment tu l’as vécue dans l’ensemble ?

**Trace courte**
- http_status: 200 sur `process-checkins`
- process_checkins: `success=true`, `processed=1`
- scheduled_checkin_status: `sent`
- active_skill_state: `weekly_adaptive_review_v1`
- durable_effect: ouverture weekly persistee; aucun patch de plan applique

### Tour 1

**Verdict du tour:** green

**User**
> Je l’ai vécue comme une semaine utile mais pas fluide. Les premiers repères m’ont aidé, puis dès que les soirées ont été tardives j’ai senti que ça redevenait trop lourd.

**Sophia**
> Ta semaine semble utile, mais les soirées tardives l’ont clairement alourdie. Pour chaque action, tu me dis simplement : fait, partiel ou pas fait, et pourquoi ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `confirm_weekly_diagnostic`
- visible_task: `review_action_gaps`
- weekly_stage: `action_review`
- weekly_planning_context.mode: `next_level_required`
- adjust_recommendation: `status=none`, `confidence=0`, `safe_to_surface=false`
- EffectLedger: `committed_effects=[]`

### Tour 2

**Verdict du tour:** green

**User**
> Pour le point positif : lundi fait, mercredi commencé mais pas fini, vendredi pas fait parce que j’étais vidé. La respiration : mardi fait, jeudi pas fait en rentrant trop tard. Le signal de pause : brouillon écrit, pas envoyé.

**Sophia**
> Tu as senti que ta semaine t’a fait avancer vers ton objectif global, ou tu as surtout tenu le rythme sans vraie avancée ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `confirm_weekly_diagnostic`
- visible_task: `ask_global_progress_feeling`
- weekly_stage: `global_progress`
- weekly_planning_context.mode: `next_level_required`
- adjust_recommendation: `status=none`, `confidence=0`, `safe_to_surface=false`
- EffectLedger: `committed_effects=[]`

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> J’ai avancé un peu, surtout parce que les repères m’ont évité de décrocher complètement. Mais ça reste fragile : dès que la journée finit tard, les actions deviennent trop grosses et je reporte.

**Sophia**
> Le levier utile à envisager serait de protéger la fin de journée : quand c’est tard, tes actions deviennent trop lourdes et ça décroche. Ici, je ne modifie pas ton plan ; dans la validation du niveau, l’input à renseigner sera surtout celui-là : validation du niveau suivant. Est-ce que le vrai point dur pour toi, c’est plutôt l’heure tardive ou l’énergie qui tombe ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `answer_weekly_question`
- visible_task: `qualify_solution_fit`
- weekly_stage: `solution_fit`
- weekly_planning_context.mode: `next_level_required`
- adjust_recommendation: `status=none`, `confidence=0`, `safe_to_surface=false`
- EffectLedger: `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: la contrainte non-mutante est respectee, mais la formulation de destination est maladroite et redondante: "l’input a renseigner sera surtout celui-la : validation du niveau suivant".
- Source amont probable: visible `qualify_solution_fit` ne rend pas proprement `weekly_planning_context.adjustment_destination` en mode `next_level_required`.
- Owner runtime: `weekly_adaptive_review_v1` renderer / visible `qualify_solution_fit`.
- Meilleure correction selon les guidelines: rendre la destination sous forme claire et stable: "a renseigner dans la validation du niveau", sans repeter le label comme contenu.
- Pourquoi ce n'est pas un patch local: le bug concerne la projection visible du contexte de planification, qui doit etre commune a tous les visibles weekly qui parlent d'ajustement.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - Slot fourni mais redemande

**User**
> C’est surtout l’énergie qui tombe quand l’heure est tardive. Si je rentre tard, je n’ai plus la marge mentale pour faire une version normale de l’action.

**Sophia**
> Je vois le levier le plus utile : alléger la version des actions les soirs où tu rentres tard, parce que c’est là que ça devient trop lourd. Comme il n’y a pas de semaine suivante configurée, ça va plutôt dans la validation du niveau. Est-ce que le vrai point dur, c’est surtout les soirs tardifs ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `clarify_human_signal`
- visible_task: `qualify_solution_fit`
- weekly_stage: `solution_fit`
- weekly_planning_context.mode: `next_level_required`
- adjust_recommendation: `status=none`, `confidence=0`, `safe_to_surface=false`
- EffectLedger: `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: Sophia redemande "est-ce que le vrai point dur, c’est surtout les soirs tardifs ?" alors que le user vient de confirmer "surtout l’energie qui tombe quand l’heure est tardive".
- Source amont probable: intake/reducer weekly ne marque pas `solution_fit_status` comme suffisamment capture apres la distinction energie + heure tardive.
- Owner runtime: `weekly_adaptive_review_v1` local dispatcher/reducer.
- Meilleure correction selon les guidelines: si le user fournit une cause claire et coherente avec les preuves daily, avancer vers recommandation ou synthese au lieu de redemander le meme slot.
- Pourquoi ce n'est pas un patch local: ce n'est pas une phrase a retirer; c'est une condition de transition du reducer sur signal humain deja capture.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Oui, c’est bien les soirs tardifs. Pour la suite, tu me recommandes quoi concrètement ? Et est-ce que tu peux ajuster ça ici dans le chat ou il faut que je le mette ailleurs ?

**Sophia**
> Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager est d’alléger la version des actions les soirs où l’énergie tombe, avec une version minimale ou un déclencheur simple pour les retours tardifs. La base, c’est que tu n’as plus la marge mentale quand l’heure est tardive, et que la charge de fin de journée semble être le vrai point de rupture. Confiance élevée.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `explain_weekly_reasoning`
- visible_task: `weekly_adjust_recommendation`
- weekly_stage: `solution_fit`
- weekly_planning_context.mode: `next_level_required`
- adjust_recommendation: `status=surfaced`, `confidence=0.98`, `safe_to_surface=true`, `target_scope=next_level_inputs`
- adjust_recommendation.destination_instruction: `Validation du niveau : renseigner cet input de manière concrète, sans modifier le plan depuis le chat.`
- EffectLedger: `committed_effects=[]`
- durable_effect: aucun changement de plan

**Analyse si yellow/red**
- Symptome: le bug critique R2 est corrige: le owner reste weekly et la recommandation est stockee avec confiance 0.98. Mais le user demande explicitement "il faut que je le mette ailleurs ?" et la reponse visible ne rend pas la destination "validation du niveau", alors qu'elle existe dans l'etat.
- Source amont probable: visible `weekly_adjust_recommendation` n'inclut pas systematiquement `adjust_recommendation.destination_instruction`.
- Owner runtime: `weekly_adaptive_review_v1` renderer / visible `weekly_adjust_recommendation`.
- Meilleure correction selon les guidelines: faire du rendu de destination un invariant visible quand le user demande ou que `weekly_planning_context.mode=next_level_required`.
- Pourquoi ce n'est pas un patch local: l'information correcte existe deja dans l'etat; le fix doit lier le renderer a ce champ plutot que specialiser une phrase.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow; `BF-LEDGER-01` - Claim sans commit

**User**
> Ok, fais-moi la synthèse de la semaine et ce que je dois garder pour la clôture.

**Sophia**
> Tu as vécu une semaine utile mais pas fluide : les repères t’ont aidé, puis les soirées tardives ont rendu les actions trop lourdes. Côté actions, il y a eu du fait, du partiel et du non fait : le point positif, la respiration et le signal de pause ont avancé, mais de façon incomplète, surtout quand l’énergie tombait en fin de journée. Le ressenti d’avance vers l’objectif global reste réel mais léger : tu n’as pas décroché, pourtant ça reste fragile dès que la journée finit tard. Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait d’alléger la version des actions les soirs où tu rentres tard, avec une version minimale ou un déclencheur simple. Je clôture ce point weekly : pour la suite, ça se note côté validation du niveau.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `recap_weekly`
- visible_task: `weekly_synthesis`
- weekly_stage: `synthesis`
- weekly_gates: `synthesis_status=needs_deeper`, `closure_status=missing`
- adjust_recommendation: `status=surfaced`, `confidence=0.98`, `safe_to_surface=true`
- EffectLedger: `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: le message visible dit "Je clôture ce point weekly", mais l'etat interne n'a pas encore `closure_status=complete`. Le flow reste actif et ne sort pas, donc le bug R2 critique n'est pas reproduit, mais la claim visible est trop forte.
- Source amont probable: mismatch entre visible `weekly_synthesis` et transition reducer `complete_weekly_no_change`.
- Owner runtime: `weekly_adaptive_review_v1` reducer + renderer de synthese.
- Meilleure correction selon les guidelines: le visible ne doit dire "cloture" que si le reducer passe les gates en `complete`; sinon dire "voici ce que tu peux garder pour la cloture" et demander confirmation.
- Pourquoi ce n'est pas un patch local: l'invariant concerne alignement state machine / claim visible, pas une formulation isolee.

### Tour 7

**Verdict du tour:** green

**User**
> Oui, tu peux clôturer le bilan weekly maintenant.

**Sophia**
> Cette semaine, tu as avancé un peu : les repères t’ont aidé à ne pas décrocher, avec une avancée légère sur l’objectif global. Les actions ont été inégales : certaines ont été faites, d’autres seulement commencées, et les soirs tardifs ont surtout fait basculer vers le report. Le point clé, c’est bien la chute d’énergie en fin de journée. Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait d’alléger la version des actions les soirs tardifs, avec une version minimale ou un déclencheur très simple. Pour ta clôture, retiens surtout ça : progression légère, fragilité quand l’horaire se fait tard, et levier prioritaire sur la charge de fin de journée. La synthèse weekly est clôturée.

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

**Verdict: yellow**

**Ce qui marche**
- L'ouverture est courte, naturelle, et issue du vrai `process-checkins`.
- Le flow ne sort plus vers `coaching_recommendation` quand le user demande quoi faire pour la suite.
- Sophia refuse clairement la modification du plan dans le chat.
- La synthese finale est globalement utile: elle relie actions, cause, progression et levier d'ajustement.
- Le mode `next_level_required` est compris dans plusieurs reponses: "pas de semaine suivante configuree", "validation du niveau".

**Problemes**
- Tour 3: destination `validation du niveau` rendue maladroitement. Famille: `BF-PROACTIVE-01`. Impact: comprehension produit moins nette. Severite: yellow.
- Tour 4: clarification repetee sur un point deja fourni. Famille: `BF-INTAKE-01`. Impact: friction conversationnelle, impression de boucle. Severite: yellow.
- Tour 5: destination omise alors que le user la demande explicitement. Famille: `BF-PROACTIVE-01`. Impact: le user sait que ce n'est pas dans le chat, mais pas assez clairement ou mettre l'input. Severite: yellow.
- Tour 6: claim visible de cloture avant gates completes. Famille: `BF-STATE-01` / `BF-LEDGER-01`. Impact: si le user s'arrete la, le systeme et la phrase visible ne sont pas parfaitement alignes. Severite: yellow.

**Fix propose**
- Source amont: reducer/renderer weekly, pas dispatcher global.
- Correction recommandee: rendre `weekly_planning_context.adjustment_destination` et `adjust_recommendation.destination_instruction` obligatoires dans tout visible qui parle d'ajustement; marquer `solution_fit` capture quand cause + scope sont clairs; n'autoriser une claim de cloture que si les gates passent en `complete`.
- Tests d'invariant attendus:
  - `next_level_required` + demande "ou le mettre ?" -> reponse mentionne validation du niveau.
  - Cause deja fournie energie + heure tardive -> pas de redemande du meme slot.
  - Message visible "cloture" -> `closure_status=complete`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Correctif R2 valide: tous les tours utilisateur restent `response_owner=weekly_adaptive_review_v1`.
- T5 "recommandes quoi / ajuster ici ?" reste dans le weekly avec `visible_task=weekly_adjust_recommendation`.
- T7 cloture par le weekly avec `flow_action=complete_weekly_no_change`.
- Ancien label d'observabilite non reproduit: aucune occurrence de `minimal_global_dispatcher` dans `state.json`.
- `active_flow_arbitration` est present parce qu'un active flow weekly existe; ce n'est pas le cas "no active flow" vise par le bug d'observabilite.

**Skills / Operations / Tools**
- Operation active: `weekly_adaptive_review_v1` uniquement.
- Aucun executor adjust-plan appele.
- Aucun tool durable execute.
- `committed_effects=[]` sur tous les tours.

**Etat weekly**
- `weekly_planning_context.mode=next_level_required` sur tout le run.
- `adjust_recommendation` devient visible au T5 avec:
  - `status=surfaced`
  - `confidence=0.98`
  - `safe_to_surface=true`
  - `target_scope=next_level_inputs`
  - `destination_instruction=Validation du niveau...`
- Les gates finales sont correctes seulement au T7:
  - `synthesis_status=complete`
  - `closure_status=complete`
  - `validation_unlock_status=available`

**DB / Effets durables**
- Capture avant cleanup:
  - `user_chat_states=2`
  - `chat_messages=16`
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
- Source amont: `weekly_adaptive_review_v1` reducer + renderer.
- Correction recommandee:
  - lier le rendu de destination a `adjust_recommendation.destination_instruction`;
  - faire avancer `solution_fit_status` quand la cause est deja explicite;
  - bloquer les claims de cloture visibles tant que les gates ne sont pas completees.
- Tests d'invariant attendus:
  - Integration weekly R3 paraphrase "quoi faire la suite / est-ce ici ?" -> owner weekly, `adjust_recommendation.confidence>=0.95`, destination visible.
  - Anti-faux-positif: question vague sans preuves solides -> pas de `safe_to_surface=true`.
  - Cloture: reponse contenant "cloturee" -> gates `synthesis_status=complete`, `closure_status=complete`.

## Verdict Global

`yellow`.

Les deux regressions critiques visees par le rerun sont corrigees: pas de sortie prematuree vers `coaching_recommendation`, pas de label `minimal_global_dispatcher`, pas de mutation de plan, et `adjust_recommendation` est bien non-mutant avec confiance 0.98. Le run n'est pas `green` a cause des frictions T3/T4/T5 et du mismatch T6 entre claim visible de cloture et gates internes.
