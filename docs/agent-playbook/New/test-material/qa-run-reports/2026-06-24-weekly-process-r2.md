# QA Run Report - Weekly Process R2

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `weekly-qa-20260624-r2-partial_habits_mission_partial`
- Persona: connexion temporaire locale `qa-weekly-deep-weekly-qa-20260624-r2-partial_habits_mission_partial@example.com`
- Objectif: retester le weekly apres ajout de `weekly_planning_context`, `adjust_recommendation` et visible `weekly_adjust_recommendation`.
- Trajectoire: fixture weekly dynamique semaine 2026-06-15 -> 2026-06-21 -> Tour 0 via `/functions/v1/process-checkins` -> 6 tours utilisateur via `/functions/v1/test-send-message`.
- Surfaces visees: `process-checkins`, active state `weekly_adaptive_review_v1`, dispatcher local weekly, visible agents weekly, `adjust_recommendation`, ownership/arbitration, EffectLedger, DB.
- Cadre IA reel: Supabase local, execution hors sandbox, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Le Tour 0 vient de `process-checkins`; les 6 tours utilisateur sont HTTP 200, non vides, et passent par le chemin IA reel local.

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r2-partial_habits_mission_partial/setup.json`
- Transcript brut/state: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r2-partial_habits_mission_partial/state.json`
- DB avant cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r2-partial_habits_mission_partial/db-after-run.json`
- DB extra avant cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r2-partial_habits_mission_partial/db-after-run-extra.json`
- Cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r2-partial_habits_mission_partial/cleanup.json`
- Feuille bugs: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-24-weekly-process-r2-bugs.md`

Preuves Tour 0:
- `process_checkins.success=true`, `processed=1`.
- Checkin cible `28f57d72-5f5c-4af7-9d65-a3c9e1c5d40c` passe `sent`, `delivery_last_error=null`.
- `opening_source=process-checkins:weekly_adaptive_review_opening`.

Cleanup:
- Cleanup cible execute sur le user temporaire; `errors=[]`, Auth delete `200`.
- Verification directe post-cleanup: `user_chat_states=0`.
- Tables post-cleanup: `user_plan_item_entries=0`, `user_habit_week_occurrences=0`, `scheduled_checkins=0`, `chat_messages=0`, `user_plan_items=0`, `user_plans_v2=0`, `profiles=0`, `user_cycles=0`.

## 2. Tours De Conversation

### Tour 0 - Process Checkins / Ouverture Weekly

**Verdict du tour:** green

**User**
> Aucun message utilisateur. Declenchement proactif via `process-checkins`.

**Sophia**
> C’est le moment du bilan de la semaine : j’ai une vue assez claire de ce qui a avancé et de ce qui est resté un peu en retrait.
> Globalement, il y a eu du mouvement, avec quelques actions bien tenues et d’autres qui sont restées plus difficiles en fin de semaine.
> Comment tu l’as vécue, toi, dans l’ensemble ?

**Trace courte**
- http_status: 200 sur `process-checkins`
- process_checkins: `success=true`, `processed=1`
- scheduled_checkin_status: `sent`
- active_skill_state: `weekly_adaptive_review_v1`
- message_payload_keys: `weekly_progress_review`, `weekly_adaptive_review`, `chat_capability`
- durable_effect: ouverture weekly persistee; aucun patch de plan applique

### Tour 1

**Verdict du tour:** green

**User**
> Je l’ai vécue de manière assez contrastée. Au début j’étais content d’avoir relancé quelques petits gestes, mais en fin de semaine j’ai senti que ça devenait trop lourd, surtout le soir.

**Sophia**
> Tu as senti une avancée vers ton objectif global cette semaine, même avec la charge plus lourde en fin de semaine ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `answer_weekly_question`
- visible_task: `ask_global_progress_feeling`
- weekly_stage: `global_progress`
- weekly_planning_context.mode: `next_level_required`
- adjust_recommendation: `status=none`, `safe_to_surface=false`
- EffectLedger: `committed=0`, `proposed=0`

### Tour 2

**Verdict du tour:** green

**User**
> Oui, un peu. Je me sens plus capable de repérer quand je dois faire une pause, mais pas encore vraiment stable. J’étais plutôt encouragé lundi et mardi, puis frustré vendredi.

**Sophia**
> Je vois surtout un levier de simplicité et de bon timing: garder un geste très léger pour les soirs chargés. Est-ce que le frein vient plutôt de la lourdeur du geste ou du moment où tu le fais ?

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
- adjust_recommendation: `status=none`, `safe_to_surface=false`
- EffectLedger: `committed=0`, `proposed=0`

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> C’est surtout le moment tardif. Pour être précis: le point positif, je l’ai vraiment fait lundi, mercredi j’ai commencé mais je n’ai pas terminé, vendredi je l’ai laissé tomber. La respiration, mardi oui, jeudi non. Et le signal de pause, j’ai écrit un brouillon mais je ne l’ai pas envoyé.

**Sophia**
> Je vois surtout un levier clair : alléger et sécuriser le moment du soir, parce que c’est là que ça coince le plus. Tu veux qu’on parte plutôt sur un rythme plus court, ou sur un signal plus simple pour t’aider à t’arrêter plus tôt ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_flow_arbitration: `continue_active`
- flow_action: `confirm_weekly_diagnostic`
- visible_task: `qualify_solution_fit`
- weekly_stage: `solution_fit`
- weekly_planning_context.mode: `next_level_required`
- adjust_recommendation: `status=none`, `safe_to_surface=false`
- EffectLedger: `committed=0`, `proposed=0`

**Analyse si yellow/red**
- Symptome: Sophia identifie un levier pertinent, mais formule "tu veux qu’on parte plutôt sur..." comme si le weekly pouvait choisir directement un ajustement, sans rappeler la destination plateforme/niveau.
- Source amont probable: visible `qualify_solution_fit` ne reprend pas assez la contrainte `weekly_planning_context.mode=next_level_required`.
- Owner runtime: `weekly_adaptive_review_v1` visible agent `weekly_solution_bridge`.
- Meilleure correction selon les guidelines: injecter la destination d'ajustement dans les visibles de qualification, pas seulement dans le visible dedie et la synthese.
- Pourquoi ce n'est pas un patch local: le probleme est une obligation de contrat visible transverse; une retouche de phrase ne garantit pas le respect du mode `next_level_required`.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne; `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Pour la semaine prochaine, tu me conseillerais quoi exactement ? Et est-ce que tu peux ajuster mon plan directement ici ou je dois faire autre chose ?

**Sophia**
> Vu ce que tu décris, je partirais sur un ajustement du plan : le signal de pause semble surtout trop lourd et mal placé le soir, donc il faut le recalibrer pour qu’il colle mieux à ton rythme. Ici, je peux t’aider à voir quoi changer, mais l’ajustement concret se fait dans l’espace Plan, sur l’action “Convenir d’un signal de pause”.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- active_flow_arbitration: `minimal_global_dispatcher`, `active_owner=none`, `selected_owner=coaching_recommendation`
- weekly tool_status: `exit_to_global`
- weekly reason_code: `weekly_review_local_exit_to_global_dispatcher`
- weekly flow_action: `exit_to_global_dispatcher`
- visible_task: `exit_or_cancel`
- EffectLedger: `committed=0`, `proposed=0`
- DB: aucun changement de plan durable observe

**Analyse si yellow/red**
- Symptome: la question est explicitement dans le perimetre weekly modifie: "quoi faire semaine prochaine" + "peux-tu ajuster ici". Le owner attendu etait `weekly_adaptive_review_v1`, idealement `weekly_adjust_recommendation` ou synthese weekly. Le run sort vers `coaching_recommendation`.
- Source amont probable: dispatcher weekly local classe encore la demande d'ajustement comme besoin `coaching_recommendation` / sortie globale au lieu de remplir ou refuser `adjust_recommendation`.
- Owner runtime: `weekly_adaptive_review_v1` dispatcher local + active flow arbitration.
- Meilleure correction selon les guidelines: dans le dispatcher weekly, traiter la demande "quoi faire semaine prochaine / ajuster ici" comme continuation weekly tant que le user parle du bilan weekly; choisir `weekly_adjust_recommendation` si la recommandation est sure, sinon expliquer la destination sans quitter le flow.
- Pourquoi ce n'est pas un patch local: la fuite vient de l'owner selectionne et du contrat d'interruption, pas du wording final.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Ancien flow capture une nouvelle intention

**User**
> Ok, garde ça comme intention pour moi, mais je veux surtout terminer le bilan weekly maintenant. Tu peux me faire la synthèse de la semaine sans modifier le plan ?

**Sophia**
> Oui. Voilà la synthèse de ta semaine :
> - Lundi : tu as bien fait le point positif.
> - Mercredi : tu as commencé, mais sans aller au bout.
> - Vendredi : tu as laissé tomber.
> - Respiration : faite mardi, pas jeudi.
> - Signal de pause : tu as rédigé un brouillon, mais tu ne l’as pas envoyé.
>
> En bref, tu as déjà un début de régularité, mais le moment tardif reste le plus fragile.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, `active_owner=coaching_recommendation`
- weekly_stage: null
- EffectLedger: `committed=0`, `proposed=0`

**Analyse si yellow/red**
- Symptome: le user demande explicitement de revenir/terminer le weekly, mais le flow actif `coaching_recommendation` garde la main.
- Source amont probable: active flow arbitration ne restitue pas le parent weekly apres une sortie provoquee par une demande qui appartenait en fait au weekly.
- Owner runtime: active flow arbitration + `coaching_recommendation` parent/child return policy.
- Meilleure correction selon les guidelines: eviter la sortie au Tour 4; a defaut, `coaching_recommendation` doit reconnaitre la demande de retour weekly et rendre la main au parent.
- Pourquoi ce n'est pas un patch local: l'erreur est une transition de flow et d'owner, pas une phrase de synthese.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Ancien flow capture une nouvelle intention; `BF-STATE-01` - Mauvaise transition de flow

**User**
> Merci, ça me va. On peut clôturer le weekly comme ça, sans changement automatique.

**Sophia**
> C’est bon, on clôture le weekly comme ça, sans changement automatique du plan.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, `active_owner=coaching_recommendation`
- weekly_stage: null
- user_chat_states avant cleanup: state weekly vide / owner coaching actif
- EffectLedger: `committed=0`, `proposed=0`
- DB: aucun changement de plan durable observe

**Analyse si yellow/red**
- Symptome: le message visible dit "on clôture le weekly", mais le owner systeme n'est plus le weekly et aucune clôture weekly n'est tracee par `weekly_adaptive_review_v1`.
- Source amont probable: mauvaise transition de flow au Tour 4 puis capture persistante par `coaching_recommendation`.
- Owner runtime: active flow arbitration + weekly reducer exit policy.
- Meilleure correction selon les guidelines: ne pas quitter le weekly sur une demande `adjust_recommendation`; si une sortie arrive, exiger un retour parent explicite avant de rendre une clôture weekly.
- Pourquoi ce n'est pas un patch local: l'incoherence visible/systeme vient de l'etat de flow, pas de la phrase finale.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- L'ouverture est naturelle, courte, et issue du vrai `process-checkins`.
- Les tours 1-2 restent fluides et ne refont pas inutilement tout le daily action par action.
- Tour 4 respecte partiellement le fond non-mutant: Sophia dit que l'ajustement concret se fait hors chat, et aucun plan n'est modifie.
- Tour 5 restitue correctement les statuts action par action: fait, commence sans finir, laisse tomber, brouillon non envoye.

**Problemes**
- Tour 3: wording de qualification trop proche d'un choix d'ajustement direct. Famille: `BF-PROACTIVE-01`. Impact: confusion legere sur ce que le chat weekly peut faire. Severite: yellow.
- Tour 4: demande centrale "quoi faire semaine prochaine / ajuster ici ?" sort du weekly. Famille: `BF-ROUTE-01`. Impact: le nouvel agent visible `weekly_adjust_recommendation` n'est pas teste en nominal parce que l'owner change. Severite: red.
- Tour 5: demande explicite de terminer le weekly reste capturee par `coaching_recommendation`. Famille: `BF-ROUTE-02`. Impact: l'utilisateur croit etre dans le weekly, le systeme non. Severite: red.
- Tour 6: cloture visible du weekly sans cloture systeme weekly. Famille: `BF-STATE-01`. Impact: incoherence entre experience et etat runtime. Severite: red.

**Fix propose**
- Source amont: dispatcher local weekly + active flow arbitration + visible qualification.
- Correction recommandee: la question "quoi faire la semaine prochaine / peux-tu ajuster ici" doit rester dans `weekly_adaptive_review_v1`; utiliser `weekly_adjust_recommendation` si le seuil 0.95 est atteint, sinon repondre dans le weekly avec la destination correcte.
- Tests d'invariant attendus: run IA reel ou integration avec message "quoi faire semaine prochaine"; owner reste weekly; `visible_task=weekly_adjust_recommendation` ou `weekly_synthesis`; pas de sortie `coaching_recommendation`; si `weekly_planning_context.mode=next_level_required`, wording oriente vers validation du niveau, pas Plan.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1-T3: routage correct, `response_owner=weekly_adaptive_review_v1`, `reason_code=active_weekly_adaptive_review`.
- T4: routage incorrect, `response_owner=coaching_recommendation`, `route_reason=coaching_recommendation_signal`, alors que l'intention est explicitement weekly.
- T5-T6: `coaching_recommendation` reste owner actif et capture des intentions de synthese/cloture weekly.

**Skills / Operations / Tools**
- T1-T3 utilisent bien le dispatcher local weekly.
- `weekly_planning_context.mode=next_level_required` est injecte dans les tours weekly, car la fixture n'a pas de `current_level_runtime` / semaine suivante configuree.
- `adjust_recommendation` reste `none` avant la sortie. Le chemin nominal attendu n'est pas atteint.
- Aucun executor de plan n'est appele, ce qui est correct.

**Memory / Effets durables**
- EffectLedger: `committed=0`, `proposed=0` sur tous les tours.
- DB avant cleanup: 1 plan actif, 4 plan items actifs, 6 entries, 6 occurrences; aucun changement durable de plan observe.
- Cleanup strict: artefacts du user temporaire supprimes; verification directe `user_chat_states=0`.

**Problemes**
- Tour 4: mauvais owner. Famille: `BF-ROUTE-01`. Impact systeme: le nouveau visible `weekly_adjust_recommendation` est contourne. Severite: red.
- Tour 4: mauvaise destination sous `next_level_required`. Famille: `BF-PROACTIVE-01`. Impact systeme: Sophia dit "espace Plan" alors que le contrat demande validation du niveau / inputs du niveau suivant quand aucune semaine suivante n'est configuree. Severite: red.
- Tours 5-6: capture persistante par `coaching_recommendation`. Famille: `BF-ROUTE-02` / `BF-STATE-01`. Impact systeme: clôture visible non adossee au reducer weekly. Severite: red.

**Fix propose**
- Source amont: `weekly_adaptive_review.local_dispatcher` field completion / transition rules; `active_flow_arbitration` pour retour parent; visible `weekly_solution_bridge`.
- Correction recommandee: rendre la demande d'ajustement future in-flow weekly, pas `coaching_recommendation`; propager `weekly_planning_context.adjustment_destination` dans toutes les visible tasks qui parlent de levier; bloquer la cloture weekly visible si le owner courant n'est plus weekly.
- Tests d'invariant attendus:
  - `quoi faire semaine prochaine` pendant weekly reste `response_owner=weekly_adaptive_review_v1`;
  - `weekly_planning_context.mode=next_level_required` => destination "validation du niveau", jamais "Ajuster mon plan" / "espace Plan";
  - demande de synthese/cloture apres detour rend la main au weekly ou ne pretend pas cloturer le weekly;
  - aucun plan commit sans confirmation plateforme.

## Verdict Global

- Verdict: red
- Raison principale: la demande centrale d'ajustement/recommandation future sort du weekly vers `coaching_recommendation`, perd le contexte `next_level_required`, puis le mauvais owner capture la synthese et la cloture.
- Follow-up prioritaire: corriger le dispatcher weekly pour garder "quoi faire semaine prochaine / peux-tu ajuster ici" dans `weekly_adaptive_review_v1` et router vers `weekly_adjust_recommendation` ou une reponse weekly non-mutante mode-aware.
