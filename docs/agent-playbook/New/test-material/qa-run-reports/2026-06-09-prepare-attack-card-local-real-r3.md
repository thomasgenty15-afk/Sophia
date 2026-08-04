# QA Run Report — prepare_attack_card local real R3

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `prepare_attack_card_local_real_r3`
- Persona: `qa-skill`, connexion temporaire `all_skills_prepare_attack_local_20260609_r3`
- Objectif: verifier le nouveau flow local `prepare_attack_card` en conditions reelles apres suppression legacy.
- Trajectoire: demande de carte d'attaque -> confirmation piege -> technique -> champs plateforme -> handoff -> apply attempt -> sortie vers priorisation.
- Surfaces visees: `prepare_attack_card.local_dispatcher`, reducer local, visible agent, `run.ts` active flow, EffectLedger/no mutation, exit vers dispatcher global.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer, pas de fallback `processMessage`, messages choisis tour par tour.
- Validite QA: valide. Incidents techniques hors conversation: les connexions `r1`/`r2` ont ete abandonnees avant tour utile; un POST T5 invalide a retourne `Invalid JWT` a cause d'une erreur de header de test, puis le meme tour a ete retente correctement.
- Cleanup: connexions temporaires `r1`, `r2`, `r3` supprimees via `scripts/qa-cleanup-run-connection.sh`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` — Draft lifecycle casse

**User**
> Je veux préparer une carte d’attaque pour arrêter de repousser mon footing du soir. Le piège, c’est que quand je rentre tard je me dis que ce sera plus sérieux demain.

**Sophia**
> Est-ce que c'est bien cette pensée de remettre à demain quand tu rentres tard qui finit par te faire sauter ton footing du soir ? Pour mettre ça au clair, rends-toi dans la section Cartes d’attaque : ouvre la section Cartes, choisis Carte d’attaque et reprends le brouillon proposé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- operation: `prepare_attack_card`
- reason_code: `prepare_attack_card_local_ask_blocker`
- flow_action: `confirm_candidate`
- visible_task: `ask_blocker`
- executed_tools: `[]`
- durable_effect: none; `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: bonne entree dans le flow local, mais la reponse donne deja une destination et parle de brouillon propose alors que le flow est encore en clarification.
- Source amont probable: prompt visible `ask_blocker` / conversation_context expose trop tot `handoff_data.platform_steps`.
- Owner runtime: `prepare_attack_card.visible.ask_blocker`
- Meilleure correction selon les guidelines: ne rendre destination/handoff que dans `handoff_ready`, `repeat_handoff`, `destination_short`, `apply_attempt`.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` — Draft lifecycle casse

**User**
> Oui, c’est exactement ce piège-là: je rentre tard, je me dis que demain ce sera mieux, et je saute le footing.

**Sophia**
> Pour ton footing du soir, est-ce que la technique Le texte magique te semble être la bonne approche pour contrer ce piège ? Pour continuer, rends-toi dans la section Cartes d’attaque : ouvre la section Cartes, choisis Carte d’attaque et reprends le brouillon proposé.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- reason_code: `prepare_attack_card_local_ask_or_confirm_technique`
- flow_action: `choose_technique`
- visible_task: `ask_or_confirm_technique`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le global dispatcher est bien evite pendant flow actif, mais destination/handoff reste premature.
- Source amont probable: meme fuite de contexte visible que T1.
- Owner runtime: `prepare_attack_card.visible.ask_or_confirm_technique`
- Meilleure correction: masquer les etapes plateforme pendant les stages de choix/confirmation.

### Tour 3

**Verdict du tour:** green

**User**
> Oui, Le texte magique me va bien pour cette carte.

**Sophia**
> Pour ta technique Le texte magique, est-ce que ton footing du soir est bien l'action que tu as tendance à négocier ?

**Trace courte**
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- reason_code: `prepare_attack_card_local_confirm_platform_field_proposal`
- flow_action: `confirm_technique_proposal`
- visible_task: `confirm_platform_field_proposal`
- current_field_id: `negotiated_action`
- technique_key: `texte_recadrage`
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Oui, l’action négociée c’est bien mon footing du soir.

**Sophia**
> Pour préparer Le texte magique, est-ce que la pensée 'ce sera plus sérieux demain' est bien l'excuse qui revient le plus souvent quand tu hésites à partir courir ?

**Trace courte**
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- reason_code: `prepare_attack_card_local_confirm_platform_field_proposal`
- flow_action: `confirm_proposed_field`
- current_field_id: `recurring_excuse`
- `negotiated_action`: locked
- executed_tools: `[]`
- durable_effect: none

### Tour 5

**Verdict du tour:** green

**User**
> Oui, l’excuse récurrente c’est vraiment: ce sera plus sérieux demain.

**Sophia**
> Pour que ce texte magique soit efficace au moment où tu te dis que ce sera plus sérieux demain, dans quel état d'esprit est-ce que tu veux te remettre en l'écrivant ?

**Trace courte**
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- reason_code: `prepare_attack_card_local_ask_platform_field`
- flow_action: `continue_local`
- visible_task: `ask_platform_field`
- current_field_id: `desired_reframe_state`
- `negotiated_action`: locked
- `recurring_excuse`: locked
- executed_tools: `[]`
- durable_effect: none

### Tour 6

**Verdict du tour:** green

**User**
> Je veux me remettre dans un état simple et décidé: je n’ai pas besoin que ce soit parfait, je mets mes chaussures et je sors dix minutes.

**Sophia**
> Tout est prêt pour ta technique Le texte magique. Pour terminer, rends-toi dans la section Cartes d’attaque. Il te suffit de suivre ces étapes : ouvre la section Cartes, choisis Carte d’attaque, puis reprends le brouillon proposé avec ces éléments :
>
> Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : footing du soir
> Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : ce sera plus sérieux demain
> Dans quel etat tu veux te remettre en ecrivant ce texte ? : simple et décidé (pas de perfection, juste sortir 10 min)

**Trace courte**
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- reason_code: `handoff_ready`
- flow_action: `handoff_ready`
- visible_task: `handoff_ready`
- toolExecution: `platform_handoff`
- platform_handoff: `operation_type=prepare_attack_card`, `surface_id=attack_cards`, `no_chat_mutation=true`
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 7

**Verdict du tour:** green

**User**
> Ok crée-la maintenant.

**Sophia**
> Je ne peux pas créer la carte directement depuis notre discussion, mais tout est prêt pour que tu puisses le faire dans la section Cartes d'attaque. Pour finaliser ta carte Le texte magique, ouvre la section Cartes, choisis Carte d’attaque et reprends le brouillon proposé avec ces informations :
>
> - Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : footing du soir
> - Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : ce sera plus sérieux demain
> - Dans quel etat tu veux te remettre en ecrivant ce texte ? : simple et décidé (pas de perfection, juste sortir 10 min)

**Trace courte**
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- reason_code: `apply_attempt_no_chat_mutation`
- flow_action: `apply_attempt`
- visible_task: `apply_attempt`
- blocked_effects: `create_attack_card/chat_creation_disabled_platform_handoff`
- executed_tools: `[]`
- committed_effects: `[]`
- DB: `user_attack_cards=[]`

### Tour 8

**Verdict du tour:** green

**User**
> Laisse tomber la carte pour maintenant, aide-moi plutôt à prioriser ce que je fais ce soir.

**Sophia**
> D'accord, concentrons-nous sur l'organisation de votre soirée. Parmi les actions prévues, lesquelles souhaiteriez-vous traiter en priorité ?

**Trace courte**
- http_status: 200
- final selected_handler: `adjust_plan_item`
- final route_reason: `tool_skill_intent_start`
- toolExecution: `none`
- selected flow after exit: `adjust_plan_item`
- executed_tools: `[]`
- durable_effect: none

**Analyse**
- Le bug initial de capture par l'ancien flow n'apparait plus: la carte est abandonnee et le message est traite comme priorisation.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le flow avance naturellement apres confirmation.
- Les questions de champs sont courtes et comprehensibles.
- Le handoff final donne les valeurs utiles sans claim de creation.
- `Ok crée-la` est bien refuse sans friction excessive.
- La sortie vers priorisation fonctionne et repond au nouveau besoin.

**Problemes**
- Tours 1-2: Sophia donne la destination plateforme trop tot et parle de "brouillon propose" alors que le brouillon n'est pas encore complet. Famille: `BF-STATE-03`. Impact: l'utilisateur peut croire qu'il doit deja quitter le chat ou qu'un brouillon existe deja. Severite: yellow.

**Fix propose**
- Source amont: prompt visible / conversation_context des stages `ask_blocker` et `ask_or_confirm_technique`.
- Correction recommandee: ne pas transmettre ou ne pas autoriser `platform_steps` dans les stages de clarification; reserver la destination aux stages `handoff_ready`, `repeat_handoff`, `destination_short`, `apply_attempt`.
- Tests d'invariant attendus: visible stage tests qui interdisent "rends-toi", "ouvre la section", "reprends le brouillon" avant `handoff_ready`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1: entree correcte depuis global vers `prepare_attack_card`, avec `note_information` de premiere activation.
- T2-T7: `route_reason=active_prepare_attack_card_local_dispatcher`; le dispatcher global normal ne reprend pas pendant le flow actif.
- T8: la sortie de flow fonctionne; le message est retraite et aboutit a `adjust_plan_item` pour la priorisation.

**Skills / Operations / Tools**
- `prepare_attack_card.local_dispatcher` produit les decisions metier.
- Le reducer verrouille les champs dans l'ordre attendu pour `texte_recadrage`.
- Technique verrouillee: `texte_recadrage` / `Le texte magique`.
- Champs respectes: `negotiated_action`, `recurring_excuse`, `desired_reframe_state`.
- `apply_attempt` bloque la creation.

**Memory / Effets durables**
- `executed_tools=[]` sur le flow carte.
- `committed_effects=[]` sur le flow carte.
- `platform_handoff.operation_type=prepare_attack_card`.
- `platform_handoff.surface_id=attack_cards`.
- DB finale avant cleanup: `user_attack_cards=[]`.

**Problemes**
- Aucun probleme systeme bloquant observe sur les invariants critiques.
- Warning UX uniquement: destination/handoff premature dans visible prompt T1/T2.

**Fix propose**
- Source amont: visible prompt/context filtering.
- Correction recommandee: gating strict des donnees de handoff dans les stages visibles non-handoff.
- Tests d'invariant attendus: unit + run reel court T1/T2.

**Verdict global:** yellow.

Le correctif principal est valide cote systeme: pas de legacy visible, pas de creation chat, apply bloque, et sortie vers global/adjust fonctionne. Reste une friction UX a corriger sur les deux premiers stages visibles.

