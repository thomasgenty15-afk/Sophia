# Weekly Process R8 - QA Run Report

## 1. Contexte Du Test

- Date: 2026-06-26
- Run: `weekly-qa-20260626-r8-partial_habits_mission_partial`
- Persona: temporary QA user, email `qa-weekly-deep-weekly-qa-20260626-r8-partial_habits_mission_partial@example.com`
- Objectif: verifier les fixes R7 sur `weekly_adjust_recommendation` et transition `weekly_synthesis` -> `weekly_closure`.
- Trajectoire: `process-checkins` weekly opening -> `/functions/v1/test-send-message` local full AI -> synthese -> recommandation -> cloture -> verification completion.
- Surfaces visees: `weekly_adaptive_review_v1`, reducer weekly, visible tasks `weekly_synthesis`, `weekly_adjust_recommendation`, `weekly_closure`, gates weekly, validation unlock, EffectLedger.
- Cadre IA reel: Supabase local, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct, pas de staging.
- Validite QA: valide avec incident runtime documente. Le Tour 3 a retourne `500 WorkerAlreadyRetired` sans effet durable; le run a repris au meme point.

## 2. Tours De Conversation

### Tour 0 - Opening proactive

**Verdict du tour:** green

**User**
> N/A - scheduled checkin weekly via `process-checkins`.

**Sophia**
> C’est le moment du bilan de fin de semaine : j’ai vu que quelques points ont avancé, et que d’autres sont restés un peu lourds en fin de semaine.
> J’aimerais bien avoir ton ressenti global sur cette semaine.

**Trace courte**
- endpoint: `process-checkins`
- status: success
- processed: 1
- opening_source: `process-checkins:weekly_adaptive_review_opening`
- durable_effect: active weekly state initialized

### Tour 1

**Verdict du tour:** green

**User**
> Je dirais que la semaine a été encourageante mais pas encore solide. Quand je finissais à une heure normale, j’arrivais à garder le repère. Les soirs où je rentrais tard, la version complète me demandait trop.

**Sophia**
> Je vois une semaine plutôt encourageante, mais encore fragile à cause de la fatigue en fin de journée. Comment tu l’as vécue, toi, au global ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `ask_week_experience`
- operation: `confirm_weekly_diagnostic`
- reason_code: `weekly_review_gate_order_requires_ask_week_experience`
- executed_tools: []
- durable_effect: none, effect ledger committed=0

### Tour 2

**Verdict du tour:** green

**User**
> Au global je l’ai vécue comme un petit progrès, mais fragile. Le point positif : fait lundi, commencé mercredi, pas fait vendredi. La respiration a tenu mardi, pas jeudi. Le signal de pause est resté en brouillon. Donc ça avance un peu, mais seulement quand la journée ne déborde pas.

**Sophia**
> Ta semaine a été encourageante mais encore fragile : tu gardes le repère quand la journée finit à une heure normale, et ça se complique dès que tu rentres tard. Les actions ont surtout tenu quand le rythme restait simple ; dès que la fin de journée débordait, la version complète devenait trop lourde. Tu avances donc, mais surtout dans les jours qui laissent de l’espace.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_synthesis`
- operation: `confirm_weekly_diagnostic`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- DB after turn: `synthesis_visible_status=rendered`, `synthesis_status=missing`, `adjust_recommendation.safe_to_surface=false`

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> D’accord. Pour le prochain niveau, quelle phrase concrète je devrais reprendre dans la Validation du niveau ? Je veux juste l’intention utile, sans changement de plan dans le chat.

**Sophia**
> Réponse vide.

**Trace courte**
- http_status: 500
- error: `WorkerAlreadyRetired: request cannot be handled because the worker has already retired`
- response_owner: null
- durable_effect: none; DB state unchanged, `turn_count=2`

**Analyse si yellow/red**
- Symptome: incident runtime Supabase Edge worker, pas de reponse assistant.
- Source amont probable: worker local retire pendant la requete.
- Owner runtime: test/runtime local, pas weekly reducer.
- Meilleure correction selon les guidelines: documenter, verifier absence d'effet durable, reprendre au meme point sans fallback.
- Pourquoi ce n'est pas un patch local: aucun symptome metier weekly observe sur ce tour.

### Tour 4

**Verdict du tour:** green

**User**
> Je reprends : pour le prochain niveau, quelle phrase concrète je devrais mettre dans la Validation du niveau ? Je veux seulement l’intention utile, sans changement automatique ici.

**Sophia**
> Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait de valider un niveau plus simple, centré sur une version minimale tenable les soirs chargés, pour stabiliser le rythme de fin de journée. Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_adjust_recommendation`
- operation: `answer_weekly_question`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- DB state: `adjust_recommendation.status=surfaced`, `safe_to_surface=true`, `surfaced_in_weekly=true`, `confidence=0.96`, `target_scope=next_level_inputs`

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> C’est bon, je l’ai. Tu peux clôturer le bilan weekly maintenant, sans répéter la phrase ni refaire le bilan.

**Sophia**
> C’est bon pour moi, on s’arrête là pour le weekly.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_closure`
- operation: `clarify_human_signal`
- executed_tools: []
- durable_effect: none, effect ledger committed=0
- DB state: `status=open`, `stage=closure`, `synthesis_status=captured`, `closure_status=captured`, `validation_unlock.status=locked_until_weekly_complete`

**Analyse si yellow/red**
- Symptome: la reponse visible est courte et ne repete pas la recommandation, mais elle claim une sortie weekly alors que l'etat n'est pas encore completed.
- Source amont probable: dispatcher/reducer ne transforme pas la premiere `weekly_closure` visible en completion; il laisse `closure_status=captured`.
- Owner runtime: weekly reducer / gate completion.
- Meilleure correction selon les guidelines: quand `visible_task=weekly_closure` rend une fermeture explicite et que le user demande la cloture, le reducer doit finaliser ou forcer une completion dans le meme tour.
- Pourquoi ce n'est pas un patch local: la couche visible a bien fait son travail; le probleme restant est l'effet d'etat durable.

### Tour 6

**Verdict du tour:** green

**User**
> Ok, merci. Est-ce que le bilan weekly est bien terminé maintenant ?

**Sophia**
> C’est noté, le bilan weekly est clôturé. Tu peux maintenant reprendre avec la Validation du niveau.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- visible_task: `weekly_closure`
- operation: `complete_flow`
- executed_tools: []
- durable_effect: final state completed
- final DB state: `status=completed`, `stage=closing`, `synthesis_status=complete`, `closure_status=complete`, `validation_unlock.status=available`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- La recommandation est maintenant rendue par `weekly_adjust_recommendation`, pas par `weekly_synthesis`.
- La cloture ne repete plus la phrase d'ajustement ni le bilan detaille.
- Sophia ne pretend pas modifier le plan par chat.
- Pas de "Confiance elevee" visible.
- Pas de `minimal_global_dispatcher`.

**Problemes**
- Tour 3: incident runtime `WorkerAlreadyRetired`. Famille: BF-TEST-01. Impact: interruption technique, run repris proprement. Severite: yellow.
- Tour 5: la cloture visible est bonne, mais l'etat durable reste ouvert jusqu'au tour suivant. Famille: BF-STATE-01. Impact: le user doit demander confirmation pour obtenir l'unlock. Severite: yellow.

**Fix propose**
- Source amont: weekly reducer/gates.
- Correction recommandee: quand le user demande explicitement la cloture et que le visible task final est `weekly_closure`, promouvoir `closure_status=complete` et finaliser dans le meme tour si `synthesis_visible_status=rendered`.
- Tests d'invariant attendus: un run reducer ou IA reel ou T5 seul suffit a verifier `status=completed` directement apres le premier message de cloture.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours metier sont bien restes dans `weekly_adaptive_review_v1`.
- `active_flow_arbitration` coherent: `continue_active`, `selected_owner=weekly_adaptive_review_v1`.
- Le routage R7-B01 est ameliore: T4 utilise `visible_task=weekly_adjust_recommendation`.

**Skills / Operations / Tools**
- Aucun tool execute.
- EffectLedger `committed=0` sur tous les tours.
- `adjust_recommendation` est non-mutant et stocke avec `confidence=0.96`, `safe_to_surface=true`, `target_scope=next_level_inputs`.

**Memory / Effets durables**
- Aucun patch de plan applique.
- T5 ne finalise pas malgre une cloture visible.
- T6 finalise correctement: `status=completed`, `validation_unlock.status=available`.
- Cleanup cible effectue: `user_chat_states_count=0`, `chat_messages_count=0`, `profiles_count=0`.

**Problemes**
- T5: claim de cloture sans completion durable immediate. Famille: BF-STATE-01. Impact systeme: unlock retarde d'un tour.

**Fix propose**
- Source amont: reducer weekly completion around `weekly_closure`.
- Correction recommandee: aligner la premiere cloture visible sur l'etat durable final, au lieu de passer par `closure_status=captured`.
- Tests d'invariant attendus: replay local T5 avec `synthesis_visible_status=rendered`, `adjust_recommendation.surfaced_in_weekly=true`, user demande cloture; attendu `status=completed` et `validation_unlock=available`.

## Verdict Global

**yellow** - Les deux gros problemes R7 sont nettement ameliores: la recommandation passe par `weekly_adjust_recommendation`, la cloture ne repete plus la reco, et le flow finit par debloquer la validation. Il reste un warning systeme: la premiere cloture visible ne finalise pas encore l'etat durable dans le meme tour.
