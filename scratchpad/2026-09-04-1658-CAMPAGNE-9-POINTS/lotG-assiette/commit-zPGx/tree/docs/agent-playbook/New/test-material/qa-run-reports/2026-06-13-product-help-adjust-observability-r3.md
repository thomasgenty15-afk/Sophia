# QA Run Report - Product Help vers Adjust Plan apres correctif global/local r3

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `product-help-adjust-observability-20260613-r3`
- Persona: Rose (`rose@gmail.com`, Supabase local)
- Objectif: verifier en conditions reelles que le cas "action existante du Plan trop floue / plus concrete / sans toucher au reste" ne part plus vers Carte d'attaque et que le bridge Product Help -> `adjust_plan_item` reste correct.
- Trajectoire: question produit informative -> demande explicite d'ajustement de Plan -> precision concrete -> question de frontiere effet/DB.
- Surfaces visees: `dispatcher-v2-llm`, `product_help.local_dispatcher`, `adjust_plan_item.local_dispatcher`, visible agents stage-specific, raw LLM trace, runtime trace, effect boundary.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage`, pas de staging.
- Validite QA: valide. Les tours ont ete conduits tour par tour et les traces raw/runtime/usage sont presentes.

Artefacts:

- Reponses: `tmp/qa-product-help-adjust-observability/product-help-adjust-observability-20260613-r3/t01.json` a `t04.json`
- Dump observabilite DB: `tmp/qa-product-help-adjust-observability/product-help-adjust-observability-20260613-r3/db-observability.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu perdue dans Sophia : quand une action de mon Plan est trop floue, comment je peux la transformer en quelque chose de plus concret sans toucher au reste du Plan ? Explique-moi juste le principe, ne change rien.

**Sophia**
> Le principe est d'utiliser l'**Ajustement du plan** dans ton Dashboard. Tu m'expliques simplement quelle action est trop floue, et je te propose une version plus concrète. Une fois que tu valides la proposition, seul cet élément est mis à jour : le reste de ton Plan reste exactement comme il est. Est-ce que ça répond à ta question ?

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- product_help flow_action: `answer_product_question`
- product_help target: `feature_id=plan.adjustment`, `object_type=plan_item`
- bridge: `needed=false`, `operation_type=null`
- direct_effects: aucun
- durable_effect: aucun
- raw Product Help: `product_help.local_dispatcher` success sous `source_message_id=b4fa03cd-b6d3-4fd0-9eba-c67faebd1e87`

### Tour 2

**Verdict du tour:** green

**User**
> Ok. Maintenant aide-moi a ajuster une action de mon Plan nommee Preparer un plan anti-ennui : elle est trop vague, je veux la rendre plus concrete pour ce week-end, sans ajouter une nouvelle action.

**Sophia**
> C'est vrai que « Préparer un plan anti-ennui » est un peu vague pour ce week-end. Quelle activité concrète ou quelle étape précise aimerais-tu mettre à la place pour que ce soit vraiment utile pour toi ?

**Trace courte**
- http_status: 200
- first route owner: `product_help`
- bridge event: `brain:product_help_exit_to_global_dispatcher`
- selected_handler final: `adjust_plan_item`
- product_help local dispatcher: `exit_to_global_dispatcher`, `feature_id=plan.adjustment`, `bridge.operation_type=adjust_plan_item`
- adjust_plan flow_action: `clarify_adjustment_need`
- visible_task.kind: `clarify_adjustment_need`
- mode: `platform_handoff`
- no_chat_mutation: true
- executable_from_chat: false
- direct_effects: aucun
- durable_effect: aucun

### Tour 3

**Verdict du tour:** green

**User**
> Je veux que ca devienne tres concret : choisir trois options anti-ennui pour le week-end, une dehors, une a la maison, et une option sociale seulement si ca ne demande pas de contacter quelqu un. Je veux preparer ca vendredi soir en 15 minutes.

**Sophia**
> Ton action « Préparer un plan anti-ennui » est un peu trop floue pour t'aider concrètement. Pour lui donner plus de force, l'idée est de la remplacer par un objectif bien plus précis. Sur la plateforme, dans ton Plan, regarde sous le niveau actif : tu y trouveras « Ajuster mon plan » pour saisir cette proposition : Choisir 3 options anti-ennui (dehors, maison, sociale sans contact) vendredi soir en 15 minutes.

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- flow_action: `prepare_plan_handoff`
- visible_task.kind: `plan_handoff_ready`
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
> Non, ton Plan n'a pas encore été modifié. Ici, on prépare ensemble la meilleure version de tes actions avant que tu ne les valides. Comme ton action "Préparer un plan anti-ennui" est un peu trop vague pour ce week-end, je te propose de la remplacer par : "Choisir 3 options anti-ennui (dehors, maison, sociale sans contact) vendredi soir en 15 minutes". Pour appliquer ce changement, rends-toi dans ton Plan : tu trouveras l'option "Ajuster mon plan" juste sous ton niveau actif pour y saisir cette nouvelle formulation.

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

**Verdict: green**

**Ce qui marche**
- T1 ne parle plus de Carte d'attaque et explique la bonne surface: Ajustement du plan.
- T2 ne saute plus directement vers un brouillon generique; il demande la precision concrete manquante.
- T3 conserve les contraintes explicites: trois options, dehors, maison, sociale sans contact, vendredi soir, 15 minutes.
- T4 clarifie correctement que le Plan n'a pas ete modifie.

**Problemes**
- Aucun probleme visible bloquant sur le parcours teste.

**Fix propose**
- Aucun correctif conversationnel immediat requis pour ce parcours visible.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le comportement final est correct: Product Help cible `plan.adjustment`, puis handoff vers `adjust_plan_item`.
- `adjust_plan_item` reste owner actif T2-T4.
- Le dispatcher global normal ne reprend pas pendant le flow actif.

**Skills / Operations / Tools**
- T1 Product Help local dispatcher: `flow_action=answer_product_question`, `target.feature_id=plan.adjustment`, `object_type=plan_item`.
- T2 Product Help local dispatcher: `flow_action=exit_to_global_dispatcher`, `bridge.operation_type=adjust_plan_item`, `note_information.target_dispatcher=adjust_plan_item`.
- `adjust_plan_item.local_dispatcher`:
  - T2: `clarify_adjustment_need`
  - T3: `prepare_plan_handoff`
  - T4: `explain_handoff`

**Effets**
- Aucun effet durable execute.
- `mode=platform_handoff`, `no_chat_mutation=true`, `executable_from_chat=false`.
- Pas de claim sans commit.

**Observabilite**
- `llm_raw_response_events`: 28 lignes pour les request ids QA T1-T4.
- `llm_usage_events`: 7 lignes.
- `conversation_runtime_events`: 43 lignes.
- Raw Product Help local dispatcher retrouve sous les `source_message_id` UUID, pas seulement sous les request ids QA.

**Warning systeme**
- Le raw `dispatcher-v2-llm` T1 contient encore une `note_information` amont avec `recommended_next_focus` orientee Carte d'attaque: "Explain the product feature (Attack Cards) ... Do not trigger adjust_plan_item."
- Product Help local corrige ce mauvais hint et cible `plan.adjustment`; donc le bug n'est plus visible, mais la note globale reste incoherente avec le contrat attendu.

**Fix propose**
- Source amont: `dispatcher-v2-llm` note_information vers `product_help`.
- Correction recommandee: renforcer encore la section note_information globale ou ajouter un exemple few-shot global pour ce cas precis. La regle locale Product Help est maintenant suffisante pour l'experience visible, mais le global devrait cesser de produire le hint Carte d'attaque.
- Tests d'invariant attendus: raw `dispatcher-v2-llm` pour "action du Plan trop floue / sans toucher au reste" doit recommander `plan.adjustment / adjust_plan_item`, pas Attack Card.

## Verdict Global

**yellow**

Le parcours utilisateur est maintenant vert: plus de Carte d'attaque visible, bridge Product Help -> `adjust_plan_item` correct, clarification correcte, pas de claim sans commit. Il reste un warning systeme: le dispatcher global continue a produire une note amont Carte d'attaque, mais Product Help local la corrige dans ce run.
