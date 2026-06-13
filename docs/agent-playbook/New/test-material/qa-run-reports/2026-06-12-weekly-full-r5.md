# QA Run Report - Weekly Full R5

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `weekly-full-20260612-r5-rose`
- Persona: Rose, connexion locale `tests/real-personas/rose/connection.json`
- Objectif: tester un weekly complet IA reel, avec au moins 8 tours, un detour enfant utile, retour au weekly, synthese et cloture.
- Trajectoire: ouverture weekly -> experience de semaine -> actions/gaps -> blocage action specifique -> qualification carte de defense -> handoff `prepare_defense_card` -> retour weekly -> synthese corrigee -> cloture.
- Surfaces visees: `weekly_adaptive_review_v1`, dispatcher local weekly, reducer local, visible agent weekly, handoff local vers `prepare_defense_card`, plateforme handoff, cleanup QA.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, hors sandbox, pas de renderer deterministe, pas de fallback `processMessage`.
- Validite QA: valide pour juger le flow conversationnel. Warning: cleanup runner a supprime un scope QA non lie au run courant, voir Analyse Systeme.

Preparation: Rose a ete retenue car le runner a decouvert trois actions du plan `Libération progressive du cannabis`: `Ranger le matériel hors de vue`, `Cibler le joint réflexe`, `Faire un sas de décompression (sans fumer)`.

Nettoyage: messages du scope courant supprimes, `remaining_scope_messages=0`. Warning: `deleted_created_user_chat_states` contient aussi `qa-product-help-to-adjust-plan-20260612-r1`, qui ne correspond pas au run id courant.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Oui, on peut faire le weekly. Globalement la semaine a été un peu bizarre : j’ai eu deux bons débuts de journée, mais le soir j’étais fatiguée et j’ai encore eu des automatismes. Je ne sais pas trop si je dois voir ça comme un progrès ou comme un échec.

**Sophia**
> C'est noté pour cette dualité : tes matinées sont encourageantes, même si la fatigue du soir a rendu le sas de décompression difficile à tenir. Malgré ces automatismes en fin de journée, as-tu le sentiment d'avoir globalement avancé vers ton objectif de libération cette semaine ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- safety: `none`
- operation: `weekly_review_local_answer_weekly_question`
- flow_action: `answer_weekly_question`
- visible_task: `review_action_gaps`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun commit

**Analyse si yellow/red**
- Symptome: la trace annonce `review_action_gaps`, mais la reponse demande surtout le ressenti d'avancement global. Le weekly saute trop vite l'etape action review.
- Source amont probable: contrat entre reducer weekly et visible prompt `review_action_gaps`, ou priorisation des `weekly_gates`.
- Owner runtime: `weekly_review` local flow / visible agent.
- Meilleure correction selon les guidelines: renforcer le prompt/stage `review_action_gaps` pour demander d'abord le point sur les actions si les gaps ne sont pas couverts, puis seulement ensuite le ressenti global.
- Pourquoi ce n'est pas un patch local: la correction doit porter sur l'ordre des gates weekly, pas sur une phrase exacte.

### Tour 2

**Verdict du tour:** green

**User**
> Je dirais que oui, un peu, parce que je ne fume plus automatiquement dès le matin. Mais sur les actions : ranger le matériel, je l’ai fait trois jours puis j’ai relâché. Cibler le joint réflexe, je l’ai vraiment vu jeudi soir : c’est juste après le dîner. Le sas de décompression, je l’ai tenu lundi et mercredi, mais vendredi j’ai craqué direct.

**Sophia**
> C'est encourageant pour tes matinées. Pour ton sas de décompression, quand la fatigue s'installe en fin de semaine, est-ce que c'est l'effort de lancer l'exercice qui te pèse le plus ou le besoin d'un soulagement immédiat ?

**Trace courte**
- http_status: `200`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- visible_task: `explore_action_blocker`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun commit

### Tour 3

**Verdict du tour:** green

**User**
> C’est plutôt le besoin de soulagement immédiat. Le vendredi, je rentre vidée, je vois la boîte, et j’ai l’impression que si je dois encore faire un effort je vais exploser. Le sas paraît trop long à ce moment-là.

**Sophia**
> C'est tout à fait compréhensible : quand tu es épuisée le vendredi, un sas de décompression trop long peut vite devenir une contrainte de plus. Pour que cela t'apporte le soulagement immédiat dont tu as besoin sans te demander d'effort, à quoi pourrait ressembler une version ultra-courte ou passive de ce moment ?

**Trace courte**
- http_status: `200`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- visible_task: `qualify_solution_fit`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun commit

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PREF-01 - Preference non appliquee runtime

**User**
> Peut-être juste 10 minutes de douche + pyjama, sans me demander de tenir 45 minutes. Et oui, je me demande si une carte de défense pourrait m’aider pour le moment où je vois la boîte et où je veux un soulagement tout de suite.

**Sophia**
> C'est une excellente idée de réduire le sas à 10 minutes pour le rendre plus accessible quand tu es fatigué. Pour la carte de défense, elle servirait justement à te protéger au moment précis où tu vois la boîte le vendredi soir. Est-ce que tu penses que ce duo « sas court + carte » est suffisant pour sécuriser tes soirées ?

**Trace courte**
- http_status: `200`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- visible_task: `qualify_solution_fit`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun commit

**Analyse si yellow/red**
- Symptome: accord masculin `fatigué` pour Rose, alors que les tours precedents utilisaient `épuisée` et `vidée`.
- Source amont probable: contexte visible/persona insuffisant ou consigne de style non stable dans le visible agent.
- Owner runtime: visible agent weekly.
- Meilleure correction selon les guidelines: passer un signal d'accord/persona fiable dans `conversation_context` ou utiliser une formulation neutre quand le genre n'est pas certain.
- Pourquoi ce n'est pas un patch local: il faut stabiliser la contrainte de rendu visible, pas remplacer un mot ponctuel.

### Tour 5

**Verdict du tour:** green

**User**
> Oui, je pense que c’est suffisant pour l’instant. Je veux bien qu’on prépare cette carte de défense pour le vendredi soir, sur le moment où je vois la boîte et je cherche un soulagement immédiat.

**Sophia**
> C'est une situation très claire. Pour le champ **Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?**, on peut utiliser : *Le vendredi soir quand je rentre vidée, que je vois la boîte et que je cherche un soulagement immédiat.* Qu'est-ce que cette défense doit t'aider à interrompre ou à empêcher en priorité ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `weekly_adaptive_review_v1_handoff_to_prepare_defense_card`
- operation_status: `collecting`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun commit

### Tour 6

**Verdict du tour:** green

**User**
> Elle doit m’aider à interrompre le geste automatique : ouvrir la boîte, rouler presque sans réfléchir, et me dire que je l’ai mérité parce que la semaine a été dure.

**Sophia**
> C'est vrai qu'après une semaine intense, le cerveau cherche vite un soulagement et ce « je l'ai mérité » est un piège classique. Pour le champ « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? », est-ce que cette formulation te semble juste : « Le vendredi soir quand je rentre vidée, que je vois la boîte et que mon cerveau me dit que j'ai mérité de rouler tout de suite pour décompresser » ?

**Trace courte**
- http_status: `200`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- operation_status: `collecting`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun commit

### Tour 7

**Verdict du tour:** green

**User**
> Oui, c’est juste. Ajoute peut-être que le piège principal c’est de vouloir un soulagement immédiat avant même de me changer ou de prendre une douche.

**Sophia**
> C'est très pertinent d'avoir identifié ce piège du soulagement immédiat. Est-ce que cette formulation te convient pour le champ « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? » : « Le vendredi soir quand je rentre vidée, que je vois la boîte et que je cherche un soulagement immédiat avant même de me changer ou de prendre une douche. » ?

**Trace courte**
- http_status: `200`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- operation_status: `collecting`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun commit

### Tour 8

**Verdict du tour:** green

**User**
> Oui, cette formulation me convient. La carte doit surtout m’aider à casser ce pilote automatique et à faire au moins le mini sas douche + pyjama avant toute décision.

**Sophia**
> C'est parfait, cette formulation est très claire pour contrer ce pilote automatique. Pour finaliser ta nouvelle carte de défense, rends-toi dans Ressources / Défense / Cartes de défense libres. Tu n'auras qu'à créer une nouvelle carte et recopier ce texte dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : Le vendredi soir quand je rentre vidée, que je vois la boîte et que je cherche un soulagement immédiat avant même de me changer ou de prendre une douche. Ta carte n'est pas créée automatiquement depuis notre discussion, c'est à toi de l'ajouter dans ton espace.

**Trace courte**
- http_status: `200`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- operation_status: `handoff_delivered`
- platform_handoff: `prepare_defense_card`, `surface_id=defense_cards`, `no_chat_mutation=true`
- platform_fields: `support_need` locked
- committed_effects: `[]`
- durable_effect: aucun commit DB de carte depuis le chat

### Tour 9

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Ok, je ferai la carte dans l’espace Ressources après. Pour l’instant on peut revenir au weekly et continuer le bilan.

**Sophia**
> On a bien cadré ta carte de défense pour gérer ces moments de fatigue le vendredi. Pour résumer ta semaine : tu as été rigoureux sur le rangement du matériel, même si le sas de décompression a été difficile à tenir à cause de la surcharge. Tu finis cette étape encouragé, avec un outil concret pour mieux protéger tes soirées. Est-ce que cette synthèse te convient pour boucler ton bilan ?

**Trace courte**
- http_status: `200`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- visible_task: `weekly_synthesis`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: retour parent weekly effectif, aucun commit

**Analyse si yellow/red**
- Symptome: la synthese surestime le rangement (`rigoureux`) alors que l'utilisatrice a dit `trois jours puis relâché`; elle repete aussi l'accord masculin `encouragé`.
- Source amont probable: `weekly_synthesis` ne reprend pas assez strictement les corrections utilisateur et les statuts action par action.
- Owner runtime: reducer/context weekly synthesis et visible agent.
- Meilleure correction selon les guidelines: faire porter a `conversation_context` les statuts corriges des actions, les incertitudes et le ressenti exact; le prompt de synthese doit interdire d'embellir un statut partiel.
- Pourquoi ce n'est pas un patch local: la correction vise la projection de synthese weekly, pas une phrase du run.

### Tour 10

**Verdict du tour:** green

**User**
> Pas tout à fait : je ne dirais pas rigoureuse sur le rangement, je l’ai tenu trois jours puis j’ai relâché. Et je finis plutôt partagée : encouragée pour le matin, mais inquiète pour les soirs de fatigue.

**Sophia**
> On a une vision claire de ta semaine : une belle avancée sur les matins et trois jours de rangement tenus, mais une fatigue qui reprend le dessus le soir. C'est normal que tu te sentes inquiète face à cette surcharge. Pour t'aider, on a mis en place ta carte de défense pour le déclencheur du vendredi soir. Est-ce qu'on peut clore ce bilan là-dessus ?

**Trace courte**
- http_status: `200`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- flow_action: `forgotten_progress_correction`
- visible_task: `weekly_synthesis`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: correction de synthese acceptee, aucun commit

### Tour 11

**Verdict du tour:** green

**User**
> Oui, on peut clore comme ça. Le bilan est bon pour moi.

**Sophia**
> C'est entendu. Nous avons fait le tour de ta semaine et identifié comment mieux protéger ton sas de décompression le vendredi. Ce point hebdomadaire est maintenant terminé. On se retrouve très vite pour la suite !

**Trace courte**
- http_status: `200`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- operation_status: `closed`
- flow_action: `complete_flow`
- visible_task: `weekly_closure`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: active skill state weekly `status=completed`, validation unlock `available`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le weekly reste dans son flow et ne se fait pas avaler par le dispatcher global.
- Sophia explore le blocage d'action avant de proposer un outil, ce qui correspond a l'intention coaching.
- Le detour `prepare_defense_card` est naturel: il collecte le champ, confirme, livre un handoff plateforme sans pretendre creer la carte.
- Le retour au weekly apres le child flow fonctionne et la cloture est claire.
- Quand l'utilisatrice corrige la synthese, Sophia accepte la correction et reformule mieux.

**Problemes**
- Tour 1: Sophia demande trop vite le ressenti global alors que l'etape action review n'est pas encore stabilisee. Famille: BF-PROACTIVE-01. Impact: le user doit aider Sophia a reprendre la structure weekly. Severite: yellow.
- Tour 4 et Tour 9: accords masculins pour Rose. Famille: BF-PREF-01. Impact: friction visible, confiance reduite. Severite: yellow.
- Tour 9: synthese trop positive sur le rangement. Famille: BF-PROACTIVE-01. Impact: l'utilisatrice doit corriger une conclusion partiellement fausse. Severite: yellow.

**Fix propose**
- Source amont: `weekly_review` gates + `conversation_context` de synthese + visible prompts stage-specific.
- Correction recommandee: rendre l'ordre des gates plus strict tant que l'action review n'est pas complete; transmettre explicitement les statuts corriges par action et le ressenti final; stabiliser l'accord/persona ou imposer des formulations neutres.
- Tests d'invariant attendus: ouverture weekly qui force action review avant ressenti global; synthese avec action partielle qui ne devient pas succes plein; correction utilisateur prise en compte; persona Rose sans accord masculin.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tours 1-4: `selected_handler=weekly_adaptive_review_v1`, `route_reason=active_weekly_review_local_dispatcher`.
- Tour 5: handoff propre vers `prepare_defense_card`, `route_reason=weekly_adaptive_review_v1_handoff_to_prepare_defense_card`.
- Tours 6-8: `active_prepare_defense_card_local_dispatcher`.
- Tours 9-11: retour a `weekly_adaptive_review_v1`, puis `complete_flow`.
- Aucun fallback global observe pendant le flow actif.

**Skills / Operations / Tools**
- `prepare_defense_card` livre un `platform_handoff` avec `no_chat_mutation=true`.
- Aucun outil execute depuis le chat et aucun commit DB de carte, ce qui est conforme au contrat visible.
- Aucun side effect applique pendant le weekly.

**Memory / Effets durables**
- A la fin du tour 11, `__active_skill_state.status=completed`, `weekly_flow_state.stage=closing`, `validation_unlock.status=available`.
- Les gates durables indiquent `week_experience`, `action_review`, `global_progress`, `felt_progress`, `solution_fit`, `synthesis` et `closure` en `complete`.
- Warning systeme: l'objet durable contient encore un sous-etat `weekly_adaptive_review.plan_patch.requires_confirmation=true` avec des operations `carry_over_item`, meme si aucun effet n'a ete applique. C'est un reste legacy dangereux pour la lisibilite V1.
- Warning testability: la requete REST `conversation_turn_traces` du runner retourne `400`; les traces utiles sont bien dans les responses de tour, mais la projection DB trace n'a pas ete verifiee via ce runner.
- Cleanup warning: le runner a supprime `qa-product-help-to-adjust-plan-20260612-r1` en plus du scope courant, car il supprime tout `user_chat_states` apparu apres snapshot au lieu de se limiter au scope du run.

**Problemes**
- Tour 1: stage visible et question visible mal alignes. Famille: BF-PROACTIVE-01. Impact systeme: gates weekly pas assez directives. Severite: yellow.
- Tour 9: synthese fondee sur une projection trop optimiste. Famille: BF-PROACTIVE-01. Impact systeme: risque de cloture avec etat hebdo faux si le user ne corrige pas. Severite: yellow.
- Durable t11: presence de `plan_patch` legacy dans `weekly_adaptive_review`. Famille: BF-STATE-01. Impact systeme: chemin legacy non totalement supprime, risque futur de confirmation ou carry-over parasite. Severite: yellow.
- Cleanup: deletion d'un scope QA hors run courant. Famille: BF-TEST-01. Impact systeme: runner non conforme au perimetre de cleanup strict. Severite: yellow.

**Fix propose**
- Source amont: weekly reducer/context, visible prompts, cleanup runner `tmp/weekly_local_real_qa.mjs`.
- Correction recommandee: retirer le sous-etat legacy `weekly_adaptive_review.plan_patch` du durable V1 ou l'isoler comme read-only non utilise; renforcer les gates de synthese; limiter cleanup aux scopes explicitement crees par le run courant.
- Tests d'invariant attendus: scan anti-legacy weekly durable; run avec action partielle; child flow defense puis retour weekly; cleanup qui ne supprime que le scope `qa-rose-...weekly-full-20260612-r5-rose`.

## Verdict Global

- Verdict: yellow
- Raison principale: le weekly full fonctionne de bout en bout avec handoff enfant et cloture, mais l'ordre des gates, la synthese et des restes legacy/test harness empechent de le declarer green.
- Follow-up prioritaire: corriger la projection/synthese weekly et supprimer le `plan_patch` durable legacy, puis relancer un full run avec cleanup strict.
