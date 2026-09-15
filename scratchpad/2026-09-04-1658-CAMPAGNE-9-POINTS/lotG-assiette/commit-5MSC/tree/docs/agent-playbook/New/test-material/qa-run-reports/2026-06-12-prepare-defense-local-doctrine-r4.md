## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `prepare-defense-local-doctrine-r4`
- Persona: Alex, connexion locale dediee, endpoint local `/functions/v1/test-send-message`
- Objectif: verifier le flow local `prepare_defense_card` apres les correctifs de confirmation initiale et de sortie vers attaque.
- Trajectoire: entree directe defense -> confirmation -> destination -> revision -> tentative d'application -> changement vers carte d'attaque.
- Surfaces visees: global dispatcher initial, active flow arbitration, dispatcher local defense, reducer, prompts visibles, handoff plateforme, absence de mutation durable.
- Cadre IA reel: Supabase local, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage`, pilotage tour par tour apres lecture des reponses et traces.
- Validite QA: valide. Tentatives precedentes R2/R3 etaient invalides pour HTTP 502 / Edge Runtime restart et sont documentees separement. R4 est complet et exploitable.
- Cleanup fin de run: scope exact nettoye (`chat_messages=12`, `user_chat_states=1` supprimes), `user_defense_cards=0` avant et apres.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je veux préparer une carte de défense pour le moment où je rentre lessivé, je vois les applis de livraison sur mon téléphone et je commande trop vite au lieu de manger un truc simple chez moi.

**Sophia**
> C'est souvent là que les automatismes s'installent, quand on est épuisé en fin de journée. Pour ta carte de défense, je te propose cette formulation :
>
> "Quand je rentre lessivé et que je suis tenté de commander sur les applis au lieu de manger un truc simple chez moi."
>
> C'est ce qu'on utilisera pour répondre à : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?
>
> Est-ce que ça te convient ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: false
- memory_plan: light/targeted
- executed_tools: []
- durable_effect: aucune carte creee
- local_trace: global dispatcher utilise seulement pour l'entree initiale; `note_information_consumed`; `flow_action=confirm_proposed_field`; `visible_task.kind=confirm_support_need_proposal`; `support_need=proposed`; `ai_call_count=2`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, ça me convient.

**Sophia**
> C'est parfait, c'est très clair. Pour finaliser, tu peux maintenant créer ta carte de défense dans Ressources / Défense / Cartes de défense libres. Pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu peux recopier ceci : Quand je rentre lessivé et que je suis tenté de commander sur les applis au lieu de manger un truc simple chez moi. La carte n'est pas créée automatiquement depuis notre échange, il te suffit de l'ajouter manuellement avec cette formulation.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: false
- memory_plan: none observed in summary
- executed_tools: []
- durable_effect: aucune carte creee
- local_trace: `flow_action=handoff_ready`; `visible_task.kind=handoff_ready`; `support_need=locked`; `handoff_ready=true`; `ai_call_count=2`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Tu peux me redire où je dois la saisir ?

**Sophia**
> Tu peux créer ta carte dans Ressources / Défense / Cartes de défense libres. Dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu n'as plus qu'à recopier : Quand je rentre lessivé et que je suis tenté de commander sur les applis au lieu de manger un truc simple chez moi.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: false
- memory_plan: none observed in summary
- executed_tools: []
- durable_effect: aucune carte creee
- local_trace: `flow_action=platform_destination_followup`; `visible_task.kind=destination_short`; `support_need=locked`; `ai_call_count=2`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Reformule plutôt comme ça : quand je rentre lessivé, j’ai besoin d’aide à ne pas ouvrir les applis de livraison par réflexe.

**Sophia**
> Voici la formulation : "quand je rentre lessivé, j’ai besoin d’aide à ne pas ouvrir les applis de livraison par réflexe."
>
> Tu peux maintenant l'utiliser pour ta carte de défense. Rends-toi dans Ressources / Défense / Cartes de défense libres et recopie-la dans le champ : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? Sache que la carte n'est pas créée automatiquement depuis ce chat, c'est à toi de l'ajouter dans l'application.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: false
- memory_plan: none observed in summary
- executed_tools: []
- durable_effect: aucune carte creee
- local_trace: `flow_action=handoff_ready`; `visible_task.kind=handoff_ready`; `support_need=locked`; nouvelle valeur visible remplace la formulation principale; `ai_call_count=2`

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok, ajoute-la pour moi.

**Sophia**
> Je ne peux pas créer la carte directement pour toi depuis notre discussion. Pour l'activer, rends-toi dans Ressources / Défense / Cartes de défense libres et choisis Ajouter une carte. Il te suffira ensuite de remplir les champs, notamment celui-ci : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? quand je rentre lessivé, j’ai besoin d’aide à ne pas ouvrir les applis de livraison par réflexe.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: false
- memory_plan: none observed in summary
- executed_tools: []
- durable_effect: aucune carte creee, aucun pending executable
- local_trace: `flow_action=apply_attempt`; `visible_task.kind=apply_attempt`; `support_need=locked`; `ai_call_count=2`

**Analyse si yellow/red**
- Symptome: la frontiere anti-mutation est respectee, mais la reponse dit "remplir les champs, notamment celui-ci" alors que le contrat defense prepare un seul champ plateforme canonique.
- Source amont probable: prompt visible `apply_attempt` laisse trop de marge sur la formulation des champs plateforme.
- Owner runtime: prompt visible local `prepare_defense_card`.
- Meilleure correction selon les guidelines: renforcer le prompt visible pour dire "le champ" et non "les champs"; ne pas ajouter de renderer ni regex.
- Pourquoi ce n'est pas un patch local: le comportement doit rester generationnel stage-specific, mais la contrainte de singularite du champ doit etre explicite dans `conversation_context` / prompt visible.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> En fait je change : j’ai plutôt besoin d’une carte d’attaque pour me lancer sur mon dossier CAF demain matin.

**Sophia**
> Ça marche, on bascule sur une carte d'attaque. Est-ce que l'objectif est bien de te lancer sur ton dossier CAF demain matin ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: low/none
- direct_effects: []
- operation: none
- pending_confirmation: false
- memory_plan: light/targeted on `dossier_caf`
- executed_tools: []
- durable_effect: aucune carte creee
- local_trace: `prepare_attack_card.local_flow` demarre directement; `prepare_defense_card.local_flow` n'est pas appele sur ce tour; `route_decision.active_flow_arbitration.reason_code=no_active_flow`
- debug critique: `read_active_flow_state` voit encore `active_tool_skill_id=prepare_defense_card`, puis `before_run_conversation_routers` perd `__active_tool_skill_intake`; le global dispatcher traite ensuite la demande comme une nouvelle entree `prepare_attack_card`.

**Analyse si yellow/red**
- Symptome: la conversation visible est acceptable, mais la doctrine n'est pas respectee. Le dispatcher local defense n'a pas produit `exit_to_global_dispatcher`; l'active flow est efface avant l'arbitrage final.
- Source amont probable: lifecycle active skill / reconciliation supprime `__active_tool_skill_intake` apres handoff ou apres apply_attempt, avant que l'arbitrator impose la sortie locale.
- Owner runtime: active flow arbitration / lifecycle state, pas le prompt attack.
- Meilleure correction selon les guidelines: conserver l'owner `prepare_defense_card` tant que le flow est dans une fenetre de follow-up post-handoff, et forcer tout changement de sujet a passer par le dispatcher local defense qui emet `exit_to_global_dispatcher` avec `note_information`.
- Pourquoi ce n'est pas un patch local: corriger le prompt defense ne suffit pas si le runtime supprime l'etat actif avant de l'appeler.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1 corrige le probleme precedent de handoff trop rapide: Sophia propose une formulation et demande confirmation.
- Tours 2 et 3 donnent un handoff naturel, avec destination et label exacts.
- Tour 4 revise correctement la phrase principale.
- Tour 5 refuse l'application directe sans claim de creation.

**Problemes**
- Tour 5: "les champs, notamment celui-ci" introduit une petite confusion UX alors que le flow defense ne prepare qu'un champ canonique. Famille: BF-STATE-01. Impact: faible a moyen. Severite: yellow.
- Tour 6: Sophia bascule correctement en surface, mais le chemin runtime n'est pas doctrinal. Famille: BF-ROUTE-01. Impact: invisible pour le user dans ce cas, mais dangereux pour la coherence des flows locaux. Severite: red systeme, yellow UX.

**Fix propose**
- Source amont: prompt visible `apply_attempt` et lifecycle active flow.
- Correction recommandee: verrouiller dans le prompt visible que `support_need` est le seul champ prepare; puis maintenir l'etat actif defense jusqu'a `exit_to_global_dispatcher`, `cancel_flow` ou `exit_to_global_dispatcher` explicite.
- Tests d'invariant attendus: `apply_attempt` ne mentionne jamais "les champs"; apres handoff/apply_attempt, une demande attaque appelle d'abord `prepare_defense_card.local_dispatcher` et ne route global qu'apres `exit_to_global_dispatcher`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: global dispatcher admissible pour la premiere activation explicite, avec `note_information`, puis local defense.
- T2-T5: global dispatcher saute pendant le flow actif; `active_prepare_defense_card_local_dispatcher` observe.
- T6: violation. L'etat actif est lu comme `prepare_defense_card`, puis disparait avant la decision finale; le routeur conclut `no_active_flow` et lance directement `prepare_attack_card`.

**Skills / Operations / Tools**
- `prepare_defense_card` utilise bien dispatcher local + reducer + prompt visible aux tours 1-5.
- Tour actif normal observe: 2 appels IA maximum selon trace locale.
- Aucun `executePrepareDefenseCard`, aucun writer `user_defense_cards`, aucun pending confirmation.
- `prepare_attack_card` demarre au tour 6, mais sans exit local defense prealable.

**Memory / Effets durables**
- Durable check final avant cleanup: `user_defense_cards=[]`.
- Cleanup cible: `chat_messages=12`, `user_chat_states=1` supprimes pour le scope exact; `user_defense_cards=0` avant/apres.
- Pas de mutation plateforme observee.

**Problemes**
- Tour 5: prompt visible laisse entendre plusieurs champs. Famille: BF-STATE-01. Impact systeme: mineur, peut faire diverger le user du contrat plateforme. Severite: yellow.
- Tour 6: perte de l'owner actif avant arbitrage. Famille: BF-ROUTE-01. Impact systeme: le global dispatcher fonctionne alors qu'un flow local etait encore suivi en QA. Severite: red.

**Fix propose**
- Source amont: lifecycle active skill / active flow arbitration, plus prompt visible `apply_attempt`.
- Correction recommandee: ne pas supprimer `__active_tool_skill_intake` de defense juste parce que `handoff_ready` a ete livre; conserver un mode post-handoff follow-up jusqu'a sortie explicite. Ajouter une trace `prepare_defense_card_exit_to_global_dispatcher` exigee avant tout `prepare_attack_card` dans ce cas.
- Tests d'invariant attendus: unit test arbitration "post-handoff defense + explicit attack request => selected_handler prepare_defense_card, blocked global, local flow_action exit_to_global_dispatcher"; real QA tour 6 doit montrer `prepare_defense_card.local_flow` puis global `prepare_attack_card` seulement apres note_information.

## Verdict Global

- Verdict: red
- Raison principale: les tours 1-5 valident les corrections principales, mais le tour 6 prouve que le global dispatcher peut reprendre sans `exit_to_global_dispatcher` local lorsque l'etat actif defense est efface avant arbitrage.
- Follow-up prioritaire: corriger le lifecycle active flow post-handoff pour que `prepare_defense_card` reste l'owner jusqu'a sortie locale explicite, puis relancer le run.
