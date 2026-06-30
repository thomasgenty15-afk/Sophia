# QA Run Report - Weekly Process R4

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `weekly-qa-20260624-r4-partial_habits_mission_partial`
- Persona: connexion temporaire locale `qa-weekly-deep-weekly-qa-20260624-r4-partial_habits_mission_partial@example.com`
- Objectif: observer les fixes weekly sur destination `next_level_required`, non-repetition de clarification, `adjust_recommendation`, et cloture.
- Trajectoire: fixture weekly dynamique semaine 2026-06-15 -> 2026-06-21 -> Tour 0 via `/functions/v1/process-checkins` -> 4 tours utilisateur via `/functions/v1/test-send-message`.
- Surfaces visees: `process-checkins`, active state `weekly_adaptive_review_v1`, dispatcher/reducer weekly, visibles weekly, `adjust_recommendation`, gates `solution_fit/synthesis/closure`, EffectLedger, DB.
- Cadre IA reel: Supabase local, execution hors sandbox, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Le Tour 0 vient de `process-checkins`; les 4 tours utilisateur sont HTTP 200, non vides, et passent par le chemin IA reel local.

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r4-partial_habits_mission_partial/setup.json`
- Transcript brut/state: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r4-partial_habits_mission_partial/state.json`
- DB avant cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r4-partial_habits_mission_partial/db-after-run.json`
- Cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r4-partial_habits_mission_partial/cleanup.json`
- Feuille bugs: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-24-weekly-process-r4-bugs.md`

Preuves Tour 0:
- `process_checkins.success=true`, `processed=2`, request id `weekly-ai-opening-mqsc5bl0`.
- Run cible `weekly-qa-20260624-r4-partial_habits_mission_partial` passe `sent`, `delivery_last_error=null`.
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
> C’est le moment du bilan de ta semaine, et je vois qu’il y a eu un rythme un peu en dents de scie avec quelques points bien tenus.
> On regarde ensemble ce que tu as vécu sur l’ensemble de la semaine ?

**Trace courte**
- http_status: 200 sur `process-checkins`
- process_checkins: `success=true`, `processed=2`
- scheduled_checkin_status cible: `sent`
- active_skill_state: `weekly_adaptive_review_v1`
- durable_effect: ouverture weekly persistee; aucun patch de plan applique

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee; `BF-LEDGER-01` - Claim sans commit

**User**
> Globalement, je dirais que ça m’a aidé à ne pas lâcher complètement, mais ça n’a pas été stable. Dès que je finissais tard, les petites actions devenaient trop coûteuses.

**Sophia**
> Cette semaine, tu as avancé de façon un peu irrégulière, avec une stabilité partielle malgré la fatigue et des fins de journée trop tardives. Côté actions, certaines ont été faites comme prévu, mais d’autres sont restées partielles ou ont sauté quand l’énergie manquait. Le point le plus net, c’est que les petites actions te coûtent davantage quand tu rentres tard. Globalement, je vois un léger progrès vers ton objectif de stabiliser le rythme de fin de journée, et tu te sens plutôt encouragé malgré la fatigue. Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait de le faire passer par la Validation du niveau : le plan ne se modifie pas par chat weekly. Sans semaine suivante configurée, tu dois valider le niveau et renseigner ces inputs dans le bilan du niveau suivant.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `confirm_weekly_diagnostic`
- visible_task: `weekly_synthesis`
- weekly_stage: `synthesis`
- weekly_gates: `solution_fit_status=captured`, `synthesis_status=missing`, `closure_status=missing`
- adjust_recommendation: `status=none`, `confidence=0`, `safe_to_surface=false`
- EffectLedger: `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: Sophia donne une recommandation visible d'ajustement alors que `adjust_recommendation` est vide et non safe. C'est exactement l'invariant qui devait etre protege.
- Source amont probable: visible `weekly_synthesis` utilise `adjustment_destination` comme s'il s'agissait d'une recommandation, sans exiger `adjust_recommendation.safe_to_surface=true`.
- Owner runtime: `weekly_adaptive_review_v1` renderer / visible `weekly_synthesis_closure`.
- Meilleure correction selon les guidelines: separer strictement destination produit et recommandation. La destination ne doit etre rendue que si une recommandation safe existe ou si le user demande ou renseigner un input deja formule.
- Pourquoi ce n'est pas un patch local: le bug vient de l'interface state -> visible agent, pas d'une phrase exacte.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee; `BF-LEDGER-01` - Claim sans commit

**User**
> Pour être précis : le point positif a été fait une fois, commencé une fois, puis sauté vendredi. La respiration a marché mardi mais pas jeudi. Le signal de pause est resté en brouillon. La cause principale, c’est vraiment le retour tardif qui vide l’énergie.

**Sophia**
> Cette semaine, tu as surtout tenu le cap sans stabilité: ça t’a aidé à ne pas lâcher complètement, mais dès que tu finissais tard, les petites actions devenaient trop coûteuses. Côté actions, elles restent partielles: le point positif a été fait une fois puis sauté en fin de semaine, la respiration de pause a bien marché mardi mais pas jeudi, et le signal de pause est resté au brouillon. Je vois quand même un léger progrès vers ton objectif global, avec un ressenti d’avancée plutôt encourageant malgré la fatigue du soir. Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait de traiter le retour tardif comme le vrai point de fragilité, et de le reprendre dans le bilan du niveau suivant : Le plan ne se modifie pas par chat weekly. Sans semaine suivante configuree, le user doit valider le niveau et renseigner ces inputs dans le bilan du niveau suivant. Voici la synthèse à garder pour la clôture.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `recap_weekly`
- visible_task: `weekly_synthesis`
- weekly_stage: `synthesis`
- weekly_gates: `solution_fit_status=captured`, `synthesis_status=captured`, `closure_status=missing`
- adjust_recommendation: `status=none`, `confidence=0`, `safe_to_surface=false`
- EffectLedger: `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: meme recommandation visible sans champ `adjust_recommendation`. En plus, la reponse fuite une formulation d'instruction interne: "le user doit valider le niveau...".
- Source amont probable: `hard_constraints.adjust_recommendation_destination_instruction` est donne au visible comme texte brut d'instruction, puis recopie sans transformation user-facing.
- Owner runtime: visible `weekly_synthesis_closure` + construction du prompt visible.
- Meilleure correction selon les guidelines: fournir deux champs separes au visible: `destination_label_user_facing` et `destination_explanation_user_facing`, jamais l'instruction systeme brute.
- Pourquoi ce n'est pas un patch local: il faut corriger la forme du contexte visible, pas interdire une phrase en aval.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Ok. Concrètement, si je veux garder une intention pour la suite, ce serait quoi ? Et je ne veux pas que tu modifies le plan ici : dis-moi juste où je dois mettre l’info.

**Sophia**
> Cette semaine, tu as tenu partiellement le cap malgré des retours tardifs qui t’ont vidé. Le point positif a été fait une fois, commencé une fois, puis sauté vendredi ; la respiration a marché mardi mais pas jeudi ; le signal de pause est resté en brouillon. L’avancée vers ton objectif global est légère, mais réelle : tu n’as pas lâché complètement. Le levier recommandé, c’est de traiter le retour tardif comme le vrai point de rupture. Je ne modifie pas le plan ici ; en revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait à renseigner dans la Validation du niveau. Voici la synthèse à garder pour la clôture.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `clarify_human_signal`
- visible_task: `weekly_closure`
- weekly_stage: `closure`
- weekly_gates: `synthesis_status=captured`, `closure_status=missing`
- adjust_recommendation: `status=none`, `confidence=0`, `safe_to_surface=false`
- EffectLedger: `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: le user demande explicitement quoi garder et ou le mettre. La destination visible est meilleure, mais le champ `adjust_recommendation` reste vide. `flow_action=clarify_human_signal` est incoherent avec `visible_task=weekly_closure`.
- Source amont probable: dispatcher/reducer ne force pas la creation ou le refus explicite de `adjust_recommendation` quand le visible formule un levier recommande.
- Owner runtime: weekly local dispatcher + reducer/renderer contract.
- Meilleure correction selon les guidelines: si le seuil de confiance n'est pas atteint, le visible doit dire qu'il ne formule pas de recommandation precise et demander le signal manquant. S'il formule une recommandation, le reducer doit avoir `adjust_recommendation.safe_to_surface=true`.
- Pourquoi ce n'est pas un patch local: c'est un invariant de contrat entre decision structuree et message visible.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow; `BF-LEDGER-01` - Claim/etat visible non aligne

**User**
> Oui, tu peux clôturer le bilan weekly maintenant, sans changement automatique.

**Sophia**
> Cette semaine, tu as tenu une dynamique, mais de façon irrégulière : l’objectif t’a aidé à ne pas lâcher, sans installer un rythme stable. Les actions sont restées partielles : un point positif partagé une fois, la respiration qui a marché certains jours, et le signal de pause encore au brouillon. Le vrai frein, c’est le retour tardif qui te vide l’énergie. Tu avances un peu vers ton objectif global, surtout parce que tu as identifié le bon obstacle et ce qui tient encore en partie. Pour la suite, l’info à mettre va dans la Validation du niveau : le plan ne se modifie pas par chat weekly. Sans semaine suivante configurée, tu dois valider le niveau et renseigner ces inputs dans le bilan du niveau suivant. Voici la synthèse à garder pour la clôture.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `complete_weekly_no_change`
- visible_task: `weekly_synthesis`
- weekly_stage: `synthesis`
- weekly_gates: `synthesis_status=captured`, `closure_status=complete`
- adjust_recommendation: `status=none`, `confidence=0`, `safe_to_surface=false`
- EffectLedger: `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: l'etat interne cloture (`closure_status=complete`) mais le visible reste en synthese et ne dit pas clairement que le bilan est cloture. Le fix a evite le faux claim premature, mais produit l'inverse: cloture interne sans cloture visible.
- Source amont probable: le guard de cloture permet `complete_weekly_no_change` avec `visible_task=weekly_synthesis` ou ne force pas le visible effectif a `weekly_closure`.
- Owner runtime: weekly reducer + visible task selection.
- Meilleure correction selon les guidelines: toute transition `complete_weekly_no_change` avec `closure_status=complete` doit rendre `visible_task=weekly_closure`, ou bloquer la completion.
- Pourquoi ce n'est pas un patch local: il faut aligner state machine et renderer, pas changer le texte de synthese.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le flow reste dans `weekly_adaptive_review_v1` sur tous les tours.
- Sophia ne modifie pas le plan et le rappelle explicitement.
- L'ancien wording "ce qui bougerait / ce qui resterait" ne revient pas.
- La destination `Validation du niveau` apparait clairement aux Tours 1, 3 et 4.
- Pas de repetition de clarification sur les soirs tardifs observee dans cette variante.

**Problemes**
- Tours 1-3: Sophia formule une recommandation visible sans `adjust_recommendation.safe_to_surface=true`. Famille: `BF-PROACTIVE-01` / `BF-LEDGER-01`. Impact: le user recoit une recommandation non prouvee par le champ contractuel. Severite: red.
- Tours 2 et 4: fuite de style instruction interne "le user doit..." et formulation brute de destination. Famille: `BF-PROACTIVE-01`. Impact: experience non naturelle et trace prompt-like. Severite: red.
- Tour 4: le user demande explicitement la cloture; l'etat cloture mais la reponse visible dit seulement "synthese a garder pour la cloture". Famille: `BF-STATE-01`. Impact: confusion finale, cloture non rendue. Severite: red.

**Fix propose**
- Source amont: contrat reducer/renderer weekly.
- Correction recommandee:
  - Ne jamais rendre un "levier recommande" ou "ajustement utile" si `adjust_recommendation.safe_to_surface` n'est pas true.
  - Remplacer `adjust_recommendation_destination_instruction` brut par une destination user-facing separee.
  - Forcer `visible_task=weekly_closure` quand `complete_weekly_no_change` complete la closure.
- Tests d'invariant attendus:
  - `adjust_recommendation.status=none` + visible synthesis -> pas de recommandation d'ajustement.
  - Destination level validation injectee -> pas de "le user doit".
  - `complete_weekly_no_change` + `closure_status=complete` -> visible task `weekly_closure`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Correct: `response_owner=weekly_adaptive_review_v1` sur tous les tours.
- Correct: aucune sortie vers `coaching_recommendation`.
- Correct: aucune occurrence de `minimal_global_dispatcher` dans `state.json`.

**Skills / Operations / Tools**
- Operation active: `weekly_adaptive_review_v1` uniquement.
- Aucun executor adjust-plan appele.
- Aucun tool durable execute.
- `committed_effects=[]` sur tous les tours.

**Etat weekly**
- `weekly_planning_context.mode=next_level_required`.
- `solution_fit_status` est bien capture rapidement, ce qui confirme une partie du fix.
- `adjust_recommendation` reste `status=none`, `confidence=0`, `safe_to_surface=false` sur tous les tours, alors que le visible formule des recommandations.
- T4: `closure_status=complete`, mais `visible_task=weekly_synthesis`, pas `weekly_closure`.

**DB / Effets durables**
- Capture avant cleanup:
  - `user_chat_states=2`
  - `chat_messages=10`
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
- Source amont: `weekly_adaptive_review_v1` reducer + visible prompt context.
- Correction recommandee:
  - Rendre impossible cote visible la recommandation d'ajustement sans champ safe.
  - Convertir les instructions destination en texte utilisateur avant injection.
  - Corriger l'admission `complete_weekly_no_change` pour imposer `weekly_closure`.
- Tests d'invariant attendus:
  - Real QA paraphrase R4: aucune recommandation visible tant que `adjust_recommendation=none`.
  - Unit visible: prompt/context avec `adjust_recommendation=none` interdit "ajustement utile".
  - Unit reducer: completion avec `closure_status=complete` ne peut pas sortir avec `visible_task=weekly_synthesis`.

## Verdict Global

`red`.

Le run valide deux points techniques: owner weekly conserve, aucune mutation de plan, pas de `minimal_global_dispatcher`, pas de clarification repetee. Mais les invariants centraux post-fix ne passent pas: Sophia recommande un ajustement alors que `adjust_recommendation` reste vide, une instruction interne fuit dans le visible, et la cloture interne n'est pas rendue comme cloture visible.
