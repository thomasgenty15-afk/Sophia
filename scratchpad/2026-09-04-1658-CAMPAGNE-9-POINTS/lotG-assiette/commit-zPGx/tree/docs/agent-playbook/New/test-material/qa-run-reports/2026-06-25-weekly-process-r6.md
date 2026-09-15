# Weekly Process R6 - QA Run Report

## 1. Contexte Du Test

- Date: 2026-06-25
- Run: `weekly-qa-20260625-r6-partial_habits_mission_partial`
- Persona: temporary QA user, email `qa-weekly-deep-weekly-qa-20260625-r6-partial_habits_mission_partial@example.com`
- Objectif: verifier le weekly depuis Tour 0 `process-checkins`, avec contexte semaine passee + destination Validation du niveau, `adjust_recommendation` non-mutant, absence de "Confiance elevee", et cloture sans repetition.
- Trajectoire: `process-checkins` weekly opening -> `test-send-message` local full AI -> weekly adaptive review active flow -> recommendation -> closure.
- Surfaces visees: `weekly_adaptive_review_v1`, local dispatcher/reducer, visible tasks `weekly_synthesis`, `weekly_adjust_recommendation`, `weekly_closure`, routing active-flow, effect ledger, DB state, cleanup.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Incident technique: premier appel Tour 0 `process-checkins` a retourne `502 upstream`; Supabase local etait actif. Retente une fois, succes, sans fallback.
- Validite QA: valide. Le run conversationnel exploitable commence apres le Tour 0 reussi.

## 2. Tours De Conversation

### Tour 0 - Opening proactive

**Verdict du tour:** green

**User**
> N/A - scheduled checkin weekly via `process-checkins`.

**Sophia**
> C’est le moment du bilan de ta semaine. J’ai l’impression qu’il y a eu quelques points bien tenus, et aussi des actions restées plus lourdes en fin de semaine.
>
> Tu l’as vécue comment, globalement ?

**Trace courte**
- endpoint: `process-checkins`
- status: success after one retry
- processed: 2
- opening_source: `process-checkins:weekly_adaptive_review_opening`
- durable_effect: active weekly state initialized

### Tour 1

**Verdict du tour:** green

**User**
> Je l’ai vécue comme une semaine utile, mais fragile. Les repères m’ont aidé à tenir, sauf les soirs tardifs où la version normale devenait trop lourde.

**Sophia**
> Tu me dis que la semaine a été utile mais fragile, avec les soirs tardifs comme vrai point de lourdeur. Globalement, tu sens que tu avances vers ton objectif, même un peu, ou pas vraiment ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `ask_global_progress_feeling`
- operation: `weekly_review_local_confirm_weekly_diagnostic`
- executed_tools: []
- durable_effect: none, effect ledger committed=0

### Tour 2

**Verdict du tour:** green

**User**
> Oui, j’ai un peu avancé sans installer un vrai rythme. Le point positif : lundi fait, mercredi commencé, vendredi sauté. La respiration a marché mardi, pas jeudi. Le signal de pause est resté en brouillon.

**Sophia**
> Je vois surtout un besoin de version plus légère pour les soirs tardifs, parce que la version normale te pèse à ce moment-là. Est-ce que le bon levier pour toi, c’est de réduire l’effort du soir, ou de déplacer ce moment plus tôt ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `qualify_solution_fit`
- operation: `weekly_review_local_confirm_weekly_diagnostic`
- executed_tools: []
- durable_effect: none, effect ledger committed=0

### Tour 3

**Verdict du tour:** green

**User**
> Le bon levier, c’est clairement une mini-version au retour tardif. Quand je rentre tard, je peux faire une version très courte, pas la version normale.

**Sophia**
> Tu as vécu une semaine utile, avec un progrès léger mais réel : lundi fait, mercredi commencé, vendredi sauté ; la respiration a tenu mardi, pas jeudi ; le signal de pause est resté en brouillon. Le point fragile ressort clairement dans les retours tardifs, où la version normale devient trop lourde ; c’est la synthèse à garder pour la suite.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_synthesis`
- operation: `weekly_review_local_clarify_human_signal`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- DB state after turn: `synthesis_visible_status=rendered`; `adjust_recommendation.safe_to_surface=false`

### Tour 4

**Verdict du tour:** green

**User**
> Pour la suite, tu me recommandes quoi concrètement ? Tu peux ajuster ici ou je dois mettre l’intention quelque part ?

**Sophia**
> Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait de prévoir une mini-version explicite pour les soirs de retour tardif, et de laisser la version normale optionnelle quand l’énergie est basse. La base, c’est que le rythme normal devient trop lourd le soir tardif, et que la mini-version ressort comme levier clair et stable. Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_adjust_recommendation`
- operation: `weekly_review_local_confirm_weekly_diagnostic`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- DB state: `adjust_recommendation.status=surfaced`, `safe_to_surface=true`, `surfaced_in_weekly=true`, `confidence=0.97`, `target_scope=next_level_inputs`

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Ok, ça me va. Tu peux clôturer le bilan weekly maintenant, sans changement automatique.

**Sophia**
> Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait de prévoir une mini-version explicite pour les soirs de retour tardif, et tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau. Cette semaine reste utile mais fragile, avec un progrès léger à garder en tête.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_closure`
- operation: `complete_weekly_no_change`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- final DB state: `status=completed`, `stage=closing`, `synthesis_status=complete`, `closure_status=complete`, `validation_unlock.status=available`, `adjust_recommendation.surfaced_in_weekly=true`

**Analyse si yellow/red**
- Symptome: la cloture reste courte et ne refait pas tout le bilan action par action, mais elle repete la recommandation d'ajustement deja donnee au Tour 4.
- Source amont probable: renderer/prompt de `weekly_closure` ne consomme pas assez strictement `adjust_recommendation.surfaced_in_weekly=true`.
- Owner runtime: `weekly_adaptive_review_v1` visible response for closure.
- Meilleure correction selon les guidelines: quand `visible_task=weekly_closure` et `adjust_recommendation.surfaced_in_weekly=true`, la cloture doit seulement accuser reception et fermer le bilan, sans redescrire l'intention d'ajustement.
- Pourquoi ce n'est pas un patch local: le bug vient de la coordination state -> visible closure; il faut un invariant de rendu, pas une simple suppression de phrase.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'ouverture weekly est naturelle et part de la semaine passee.
- Sophia garde le bon cadre: elle ne promet pas de modifier le plan par chat.
- Le handoff est correct pour le mode `next_level_required`: destination `Validation du niveau`.
- La formulation interdite "Confiance elevee" n'apparait pas dans les reponses visibles.
- Pas de formulation visible "ce qui bougerait / ce qui resterait".

**Problemes**
- Tour 5: repetition de l'ajustement deja donne au Tour 4. Famille: BF-PROACTIVE-01. Impact: la cloture parait redire le conseil au lieu de simplement fermer le bilan. Severite: yellow.

**Fix propose**
- Source amont: visible closure weekly.
- Correction recommandee: ajouter un invariant closure: si `synthesis_visible_status=rendered` et `adjust_recommendation.surfaced_in_weekly=true`, reponse de cloture en 1 phrase, sans recap hebdo et sans repetition de l'intention d'ajustement.
- Tests d'invariant attendus: run avec recommandation deja surfacée puis demande de cloture; verifier que la reponse contient seulement cloture/validation disponible, pas la recommandation.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours sont routes vers `weekly_adaptive_review_v1`.
- `active_flow_arbitration` est coherent: `continue_active`, `active_owner=weekly_adaptive_review_v1`.
- Aucun label `minimal_global_dispatcher` observe.
- Pas d'exit premature avant synthese et cloture.

**Skills / Operations / Tools**
- `visible_task` progresse correctement: `ask_global_progress_feeling` -> `qualify_solution_fit` -> `weekly_synthesis` -> `weekly_adjust_recommendation` -> `weekly_closure`.
- Aucun tool execute.
- Aucun executor weekly appele directement.

**Memory / Effets durables**
- EffectLedger: committed=0 sur les 5 tours.
- `adjust_recommendation` est strictement non-mutant: recommendation stockee, aucun patch plan applique.
- Final DB: `status=completed`, `synthesis_status=complete`, `closure_status=complete`, `validation_unlock.status=available`.
- Nettoyage cible effectue: `user_chat_states_count=0`, `chat_messages_count=0`, `profiles_count=0` apres cleanup.

**Problemes**
- Aucun probleme systeme bloquant observe. Le yellow est UX/renderer de cloture, pas side effect.

**Fix propose**
- Source amont: weekly visible closure prompt/state contract.
- Correction recommandee: consommer `adjust_recommendation.surfaced_in_weekly` dans la consigne de cloture comme un stop de repetition.
- Tests d'invariant attendus: test local reducer + run IA reel paraphrase avec demande de cloture apres recommandation.

## Verdict Global

**yellow** - Le workflow systeme est sain et la recommandation est stockee/surfacee selon les seuils attendus, sans mutation de plan. Il reste une friction visible: la cloture repete l'ajustement deja donne au tour precedent.
