# QA Run Report - Product Help vers Adjust Plan apres regle anti Carte d'attaque

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `product-help-adjust-observability-20260613-r2`
- Persona: Rose (`rose@gmail.com`, Supabase local)
- Objectif: verifier en conditions reelles que Product Help n'oriente plus vers Carte d'attaque quand le user demande comment rendre une action du Plan plus concrete sans toucher au reste du Plan, puis verifier le bridge vers `adjust_plan_item`.
- Trajectoire: question produit informative -> demande explicite d'ajustement de Plan -> precision concrete -> question de frontiere effet/DB.
- Surfaces visees: `dispatcher-v2-llm`, `product_help.local_dispatcher`, `adjust_plan_item.local_dispatcher`, visible agents stage-specific, raw LLM trace, runtime trace, effect boundary.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage`, pas de staging.
- Validite QA: valide. Les tours ont ete conduits tour par tour. Les traces raw/runtime/usage sont presentes.

Artefacts:

- Reponses: `tmp/qa-product-help-adjust-observability/product-help-adjust-observability-20260613-r2/t01.json` a `t04.json`
- Dump observabilite DB: `tmp/qa-product-help-adjust-observability/product-help-adjust-observability-20260613-r2/db-observability.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-03 - Product/status/tool mal priorises

**User**
> Je suis un peu perdue dans Sophia : quand une action de mon Plan est trop floue, comment je peux la transformer en quelque chose de plus concret sans toucher au reste du Plan ? Explique-moi juste le principe, ne change rien.

**Sophia**
> Le principe, c'est d'utiliser une **Carte d'attaque**. Contrairement à l'ajustement du plan qui modifie l'action elle-même, la carte d'attaque est une ressource de préparation. Elle sert à définir ton tout premier geste et à réduire l'effort pour démarrer, sans toucher à la structure de ton Plan. C'est un peu comme un mode d'emploi concret pour t'aider à passer à l'acte plus facilement.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- dispatcher global raw: `dispatcher-v2-llm`, success
- note_information amont: recommended focus = expliquer le mecanisme Carte d'attaque
- product_help raw: `product_help.local_dispatcher`, success, tracee sous `source_message_id=f24c13b4-eb10-45e7-ab7e-3eeb81060189`
- product_help flow_action: `answer_product_question`
- product_help target: `feature_id=resources.attack_card`, `object_type=attack_card`
- product_help grounding: `resources.attack_card`, `plan.adjustment`, `resources.attack_vs_defense_cards`
- direct_effects: aucun
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le fix attendu echoue. Product Help repond encore Carte d'attaque alors que le user parle d'une action du Plan trop floue a rendre plus concrete sans toucher au reste.
- Source amont probable: double faute de priorisation. Le dispatcher global injecte deja un focus Carte d'attaque dans la note vers Product Help, puis le dispatcher Product Help accepte ce cadrage et choisit `resources.attack_card` malgre la regle locale.
- Owner runtime: `dispatcher-v2-llm` + `product_help.local_dispatcher`.
- Meilleure correction selon les guidelines: corriger la doctrine/prompt du dispatcher global pour ne pas pre-orienter ce cas vers Carte d'attaque, et renforcer Product Help pour resister a une note_information amont incorrecte quand le message courant correspond au cas prioritaire Plan.
- Pourquoi ce n'est pas un patch local: le mauvais cadrage arrive avant Product Help; Product Help doit aussi arbitrer depuis le message courant, mais le signal amont pollue la decision.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok. Maintenant aide-moi a ajuster une action de mon Plan nommee Preparer un plan anti-ennui : elle est trop vague, je veux la rendre plus concrete pour ce week-end, sans ajouter une nouvelle action.

**Sophia**
> L'action 'Préparer un plan anti-ennui' est un peu vague pour ce week-end. Pour la rendre plus concrète, tu peux demander cet ajustement directement dans ton interface.
>
> Va dans ton **Plan**, et sous le niveau actif, utilise l'option **Ajuster mon plan**. Tu pourras y copier cette proposition :
>
> *Rendre l'action 'Préparer un plan anti-ennui' plus concrète pour ce week-end (ex: choisir un film ou un jeu précis) sans créer de nouvelle tâche.*
>
> C'est à cet endroit que tu pourras reprendre la main sur ton programme.

**Trace courte**
- http_status: 200
- first route owner: `product_help`
- bridge event: `brain:product_help_exit_to_global_dispatcher`
- selected_handler final: `adjust_plan_item`
- product_help local dispatcher raw: `exit_to_global_dispatcher`, target `adjust_plan_item`, note_information present
- adjust_plan flow_action: `prepare_plan_handoff`
- visible_task.kind: `plan_handoff_ready`
- mode: `platform_handoff`
- no_chat_mutation: true
- executable_from_chat: false
- direct_effects: aucun
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le bridge marche, mais le flow `adjust_plan_item` saute directement a un brouillon generique sans clarification utile.
- Source amont probable: reducer/dispatcher `adjust_plan_item` considere le besoin suffisamment complet.
- Owner runtime: `adjust_plan_item.local_dispatcher`.
- Meilleure correction selon les guidelines: si le besoin de concretion ne contient pas encore le contenu concret attendu, rester sur `clarify_adjustment_need` au lieu de `prepare_plan_handoff`.
- Pourquoi ce n'est pas un patch local: la decision stage vient du dispatcher/reducer local, pas du visible prompt.

### Tour 3

**Verdict du tour:** green

**User**
> Je veux que ca devienne tres concret : choisir trois options anti-ennui pour le week-end, une dehors, une a la maison, et une option sociale seulement si ca ne demande pas de contacter quelqu un. Je veux preparer ca vendredi soir en 15 minutes.

**Sophia**
> Pour que ton action "Préparer un plan anti-ennui" soit moins vague, voici la version affinée avec tes critères : "Vendredi soir (15 min), choisir 3 options anti-ennui pour le week-end : une dehors, une à la maison, et une sociale sans contact." Tu peux maintenant reprendre cette formulation dans ton Plan, juste sous le niveau actif, via le bouton "Ajuster mon plan".

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- flow_action: `revise_plan_handoff`
- visible_task.kind: `revise_plan_handoff`
- mode: `platform_handoff`
- no_chat_mutation: true
- executable_from_chat: false
- direct_effects: aucun
- durable_effect: aucun

### Tour 4

**Verdict du tour:** green

**User**
> Donc la, est-ce que mon Plan a deja ete modifie, ou est-ce que je dois encore copier cette proposition moi-meme dans Ajuster mon plan ?

**Sophia**
> Ton plan n'est pas encore modifié car je n'ai pas la main pour le faire directement. Pour que ton action 'Préparer un plan anti-ennui' soit moins vague et plus facile à réaliser ce vendredi soir, c'est à toi de la préciser. Rends-toi dans ton Plan, et sous l'étape 'Casser l'automatisme du soir', utilise l'option 'Ajuster mon plan' pour saisir ceci : 'Vendredi soir (15 min), choisir 3 options anti-ennui pour le week-end : une dehors, une à la maison, et une sociale sans contact.'

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- flow_action: `explain_handoff`
- visible_task.kind: `explain_handoff`
- mode: `platform_handoff`
- no_chat_mutation: true
- executable_from_chat: false
- direct_effects: aucun
- durable_effect: aucun
- effect boundary: correct, Sophia dit que le Plan n'est pas modifie

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- T2-T4 restent dans `adjust_plan_item` apres le bridge.
- Les contraintes de T3 sont conservees.
- T4 clarifie correctement que le Plan n'a pas ete modifie.

**Problemes**
- Tour 1: la reponse initiale reste exactement le mauvais cadrage produit: Carte d'attaque au lieu d'Ajuster mon plan. Famille: BF-ROUTE-03. Impact: l'utilisateur recoit une explication contraire a la doctrine produit attendue pour une action du Plan trop floue. Severite: red.
- Tour 2: la transition vers `adjust_plan_item` fonctionne, mais le flow saute une clarification et propose un exemple generique. Famille: BF-STATE-01. Impact: utilisable, mais moins fluide et moins fiable si le user n'a pas encore donne le contenu concret. Severite: yellow.

**Fix propose**
- Source amont: `dispatcher-v2-llm` note_information + `product_help.local_dispatcher` arbitration.
- Correction recommandee: ajouter au dispatcher global une regle de note_information qui cible `plan.adjustment` pour "rendre une action du Plan concrete / action trop floue / sans toucher au reste". Renforcer Product Help pour que le message courant prime sur une note_information amont incoherente.
- Tests d'invariant attendus: question informative "action du Plan trop floue -> rendre concret sans toucher le reste" ne doit jamais cibler `resources.attack_card`; variante explicite "carte d'attaque" doit rester Carte d'attaque; demande operationnelle d'ajustement doit handoff vers `adjust_plan_item`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: `dispatcher-v2-llm` detecte Product Help correctement, mais sa note amont recommande "Explain the Attack Card mechanism".
- T1: `product_help.local_dispatcher` est bien appele avec le nouveau code charge (`system_prompt_chars` plus haut que le run precedent), mais il choisit `resources.attack_card`.
- T2: Product Help cree bien un handoff direct vers `adjust_plan_item`; le global normal ne reprend pas pour rendre la reponse visible.
- T3-T4: `adjust_plan_item` reste owner actif.

**Skills / Operations / Tools**
- `product_help.local_dispatcher` T1: `flow_action=answer_product_question`, `target.feature_id=resources.attack_card`.
- `product_help.local_dispatcher` T2: `flow_action=exit_to_global_dispatcher`, `target.feature_id=plan.adjustment`, `bridge.operation_type=adjust_plan_item`, `note_information.target_dispatcher=adjust_plan_item`.
- `adjust_plan_item.local_dispatcher`:
  - T2: `prepare_plan_handoff`
  - T3: `revise_plan_handoff`
  - T4: `explain_handoff`

**Effets**
- Aucun effet durable n'est execute.
- `mode=platform_handoff`, `no_chat_mutation=true`, `executable_from_chat=false`.
- Pas de claim sans commit en T4.

**Observabilite**
- `llm_raw_response_events`: 14 lignes pour les request ids QA T1-T4.
- `llm_usage_events`: 7 lignes.
- `conversation_runtime_events`: 39 lignes.
- Particularite: `product_help.local_dispatcher` trace sous `source_message_id` UUID, pas sous le `request_id` QA; le JSON a ete retrouve via les derniers raw events `source=product_help.local_dispatcher`.

**Fix propose**
- Source amont: dispatcher global + Product Help local dispatcher.
- Correction recommandee: ne pas seulement ajouter une phrase au prompt Product Help. Il faut empecher le cadrage amont Carte d'attaque dans la note_information globale, puis ajouter une garde contractuelle Product Help: quand `current_user_message` parle d'action du Plan a rendre concrete sans mutation, Product Help doit choisir `plan.adjustment` meme si `note_information` ou les catalog candidates contiennent `resources.attack_card`.
- Tests d'invariant attendus: unit test prompt/global dispatcher note; test Product Help local dispatcher avec note_information polluee "attack card"; run reel T1.

## Verdict Global

**red**

Le bridge Product Help -> `adjust_plan_item` reste fonctionnel, mais le fix demande sur le premier tour n'est pas valide: Sophia conseille encore Carte d'attaque. Les traces montrent que le mauvais cadrage vient du dispatcher global puis est confirme par Product Help, pas d'une absence d'observabilite ni d'un legacy Product Help.
