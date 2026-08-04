# Weekly Process R9 - QA Run Report

## 1. Contexte Du Test

- Date: 2026-06-26
- Run: `weekly-qa-20260626-r9-partial_habits_mission_partial`
- Persona: temporary QA user, email `qa-weekly-deep-weekly-qa-20260626-r9-partial_habits_mission_partial@example.com`
- Objectif: reverifier le fix R8-B02 sur la cloture durable au premier tour de `weekly_closure`, et observer le rendu `adjust_recommendation`.
- Trajectoire: fixture weekly dynamique semaine 2026-06-15 -> 2026-06-21, Tour 0 via `/functions/v1/process-checkins`, puis 5 tours via `/functions/v1/test-send-message`.
- Surfaces visees: `process-checkins`, `weekly_adaptive_review_v1`, reducer weekly, visible agents `weekly_synthesis`, `weekly_adjust_recommendation`, `weekly_closure`, `adjust_recommendation`, validation unlock, active-flow lifecycle.
- Cadre IA reel: Supabase local, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct, pas de staging, pas de code modifie pendant le run.
- Validite QA: valide. Tour 0 a bien ete traite par `process-checkins` (`success=true`, `processed=1`) et les tours user passent par `test-send-message` full AI.

## 2. Tours De Conversation

### Tour 0 - Opening proactive

**Verdict du tour:** green

**User**
> N/A - scheduled checkin weekly via `process-checkins`.

**Sophia**
> C’est le moment de faire le point sur ta semaine, et je vois qu’elle a eu des hauts et des bas avec quelques actions restées un peu en retrait.
> Qu’est-ce que tu en retiens globalement ?

**Trace courte**
- endpoint: `/functions/v1/process-checkins`
- http_status: 200
- process_checkins: `success=true`, `processed=1`
- scheduled_checkin.status: `sent`
- opening_source: `process-checkins:weekly_adaptive_review_opening`
- durable_effect: active weekly state initialized

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Je retiens une semaine plutôt utile, mais pas encore stable. Quand je finissais tôt, je gardais le point positif ou la respiration. Quand je rentrais tard, la version normale devenait trop lourde et je laissais tomber.

**Sophia**
> La semaine a l’air utile mais un peu instable, surtout quand tu rentrais tard. Et toi, comment tu l’as vécue au global ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- empty_response: false
- aborted: false
- executed_tools: none observed
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: Sophia redemande le ressenti global alors que le user vient deja de le donner.
- Source amont probable: dispatcher/gates weekly ne reconnaissent pas assez le slot `week_experience` dans la premiere reponse.
- Owner runtime: `weekly_adaptive_review_v1` intake/gates.
- Meilleure correction selon les guidelines: mieux mapper les signaux structurés deja fournis vers `week_experience_status=captured`, sans regex metier.
- Pourquoi ce n'est pas un patch local: le probleme est l'etat de gate, pas la phrase visible.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Au global, je l’ai vécue comme un petit progrès fragile. Le point positif a tenu lundi et un peu mercredi, pas vendredi. La respiration a tenu mardi, pas jeudi. Le signal de pause est resté en brouillon. Donc le souci principal, c’est les soirs chargés.

**Sophia**
> Je vois un petit progrès fragile: tu as tenu quand l’énergie était là, mais les soirs chargés font encore basculer la version normale. Au global, tu le sens plutôt comme un vrai pas en avant ou comme quelque chose qui reste très instable ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- empty_response: false
- aborted: false
- executed_tools: none observed
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: la question de clarification est comprehensible, mais elle continue a demander une nuance deja largement donnee.
- Source amont probable: gate `global_progress` / `felt_progress` trop prudente.
- Owner runtime: `weekly_adaptive_review_v1` dispatcher/gate reducer.
- Meilleure correction selon les guidelines: faire capturer `felt_progress` quand le user donne deja `petit progrès fragile` + cause claire, puis passer a la synthese.
- Pourquoi ce n'est pas un patch local: il faut corriger la capture structuree, pas interdire une phrase.

### Tour 3

**Verdict du tour:** green

**User**
> Plutôt un vrai pas en avant, mais incomplet. Je veux garder l’idée que ça marche quand c’est court et réaliste, et que la version normale est trop ambitieuse les soirs tardifs.

**Sophia**
> Tu as vécu une semaine plutôt utile mais encore fragile : les points positifs et la respiration ont tenu surtout quand la fin de journée restait légère, et le signal de pause est resté au brouillon. Tu avances quand c’est court et réaliste, avec un vrai petit progrès, mais les soirs chargés restent le point fragile.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- empty_response: false
- aborted: false
- visible behavior: synthese courte
- durable_effect: none observed

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Pour la suite, quelle intention précise je devrais renseigner au moment de valider le niveau ? Je ne veux pas modifier le plan ici, juste savoir quoi noter.

**Sophia**
> Le bilan hebdo est clos. Tu gardes surtout l’idée que ça tient quand c’est court et réaliste, et que les soirs chargés restent le point fragile.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- empty_response: false
- aborted: false
- DB state after turn: `status=completed`, `stage=closing`, `synthesis_status=complete`, `closure_status=complete`
- DB adjust_recommendation: `status=surfaced`, `safe_to_surface=true`, `confidence=0.96`, `target_scope=next_level_inputs`, `destination_instruction=Orienter vers la validation du niveau / bilan du niveau suivant, pas vers Ajuster mon plan`
- validation_unlock: `available`
- executed_tools: none observed
- durable plan mutation: none observed

**Analyse si yellow/red**
- Symptome: le fix R8-B02 est verifie techniquement car l'etat durable est finalise dans le meme tour. Mais Sophia ne rend pas vraiment le visible attendu: elle ne dit pas clairement "je ne modifie pas le plan ici", ne mentionne pas la Validation du niveau, et cloture alors que le user demandait d'abord l'intention precise a noter.
- Source amont probable: selection visible / reducer autour de `weekly_adjust_recommendation` vs `weekly_closure`; la recommandation est bien stockee mais la tache visible rendue ressemble a une cloture.
- Owner runtime: `weekly_adaptive_review_v1` reducer + visible task selection.
- Meilleure correction selon les guidelines: quand `adjust_recommendation.safe_to_surface=true` et que le user demande explicitement quoi renseigner pour la validation du niveau, rendre `weekly_adjust_recommendation` avant toute cloture, puis seulement cloturer si la demande de cloture est explicite ou si la synthese+reco ont ete visibles.
- Pourquoi ce n'est pas un patch local: la DB contient la bonne recommandation; le bug est l'orchestration structuree de la tache visible, pas une phrase manquante.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Ok, donc le bilan weekly est bien terminé maintenant ?

**Sophia**
> Le bilan weekly est clos pour moi. Tu gardes surtout un progrès réel mais fragile, avec un rythme qui tient mieux quand c’est court et réaliste.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- empty_response: false
- aborted: false
- DB before cleanup: active skill state still present with `skill_id=weekly_adaptive_review_v1`, `status=completed`, `stage=closing`
- validation_unlock: `available`
- executed_tools: none observed

**Analyse si yellow/red**
- Symptome: apres completion, le flow weekly continue a capter le tour suivant. La reponse est acceptable, mais elle repete encore un mini-recap au lieu d'une confirmation strictement courte.
- Source amont probable: lifecycle active-flow conserve un `__active_skill_state` completed qui reste routable.
- Owner runtime: active-flow policy / weekly state cleanup.
- Meilleure correction selon les guidelines: un active skill completed ne doit plus etre traite comme owner actif, sauf endpoint/status explicitement prevu; soit le state est retire, soit l'arbitrage ignore les flows `status=completed`.
- Pourquoi ce n'est pas un patch local: le probleme est la frontiere active-flow apres completion, pas le wording de ce tour.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 0 est propre et vient bien de `process-checkins`.
- La synthese du Tour 3 est concise, lisible et basee sur la semaine observee.
- Sophia ne pretend pas appliquer un changement de plan et aucun effet durable de plan n'est observe.
- Le bug R8-B02 est techniquement corrige: la cloture durable et `validation_unlock=available` arrivent au premier tour de fermeture.

**Problemes**
- Tours 1-2: Sophia redemande deux fois une nuance deja donnee. Famille: BF-INTAKE-01. Impact: flow un peu lourd. Severite: yellow.
- Tour 4: la demande "quoi noter dans la Validation du niveau" est traitee comme une cloture; la recommandation existe en DB mais n'est pas rendue avec le wording/destination attendus. Famille: BF-STATE-01. Impact: le user obtient une idee generale, mais pas l'instruction precise promise par le design. Severite: yellow.
- Tour 5: le flow completed continue a capter le tour suivant. Famille: BF-ROUTE-02. Impact: faible ici, mais risque de garder un vieux flow trop longtemps. Severite: yellow.

**Fix propose**
- Source amont: weekly reducer / visible task selection + active-flow lifecycle.
- Correction recommandee: prioriser `weekly_adjust_recommendation` sur une demande explicite de destination/validation tant que la recommandation safe n'a pas ete rendue clairement; ensuite seulement autoriser `weekly_closure`. Ignorer ou nettoyer les active skill states `status=completed`.
- Tests d'invariant attendus: integration IA reelle avec demande paraphrasee "quoi renseigner dans la validation du niveau"; attendu visible `weekly_adjust_recommendation`, destination correcte, no mutation, puis demande de cloture -> `status=completed` et unlock.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours metier sont restes dans `weekly_adaptive_review_v1`.
- Warning: apres completion, T5 reste route vers `weekly_adaptive_review_v1` car l'active skill state completed reste present.

**Skills / Operations / Tools**
- Aucun tool execute observe.
- Aucun patch de plan applique.
- `adjust_recommendation` est bien non-mutant et stocke avec `confidence=0.96`, `safe_to_surface=true`, `target_scope=next_level_inputs`.

**Memory / Effets durables**
- T4 finalise bien le weekly: `status=completed`, `synthesis_status=complete`, `closure_status=complete`, `validation_unlock.status=available`.
- Cleanup cible effectue et verifie: `user_chat_states_count=0`, `chat_messages_count=0`, `profiles_count=0`, `scheduled_checkins_count=0`.
- Trace detaillee REST `conversation_turn_traces` non exploitable via la requete tentee; les bodies `/test-send-message` contiennent au minimum `response_owner`.

**Problemes**
- T1-T2: capture de slots trop prudente. Famille: BF-INTAKE-01. Impact systeme: tours de clarification en trop.
- T4: `adjust_recommendation` safe est stockee mais l'orchestration visible cloture avant d'avoir rendu la destination/intention attendue. Famille: BF-STATE-01. Impact systeme: transition de flow correcte pour closure, mais mauvaise priorisation de la tache visible.
- T5: active flow completed encore routable. Famille: BF-ROUTE-02. Impact systeme: risque de capture post-completion.

**Fix propose**
- Source amont: weekly local reducer/visible selection et active-flow arbitration.
- Correction recommandee: utiliser les champs structurels `adjust_recommendation.safe_to_surface`, `surfaced_in_weekly`, `visible_task` et `status=completed` pour garantir l'ordre visible suivant: synthese -> recommandation si demandee/non rendue -> cloture explicite -> sortie active-flow.
- Tests d'invariant attendus: positif demande validation niveau; paraphrase "qu'est-ce que je mets dans le bilan du niveau"; anti-faux-positif demande pure cloture sans demander de reco; post-completion "merci" ne doit pas garder weekly comme active owner.

## Verdict Global

**yellow** - Le correctif principal R8-B02 est verifie: la premiere cloture durable finalise bien le weekly et debloque la validation dans le meme tour. Le run revele toutefois une fragilite restante: la demande d'intention pour la Validation du niveau est absorbee par une cloture trop precoce, et le flow completed reste encore routable au tour suivant.
