# QA Run Report - Product Help vers Adjust Plan avec observabilite brute

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `product-help-adjust-observability-20260613-r1`
- Persona: Rose (`rose@gmail.com`, Supabase local)
- Objectif: verifier en conditions reelles que Product Help peut basculer vers le flow local `adjust_plan_item`, puis que les sorties IA sont recuperables en DB.
- Trajectoire: Product Help informatif -> demande d'ajustement de Plan -> clarification -> brouillon d'ajustement -> revision -> question de frontiere effet/DB.
- Surfaces visees: `product_help`, `adjust_plan_item.local_dispatcher`, visible agents stage-specific, raw LLM trace, runtime trace, effect boundary.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage`, pas de staging.
- Validite QA: valide. T1 a ete trace sous le `turn_id` genere `f294274b-7837-4e25-ad59-d9d1ae96fc80`, pas sous le run request id attendu; T2-T5 sont traces sous les request ids QA explicites.

Incident technique hors conversation: un premier essai T2 a echoue avant envoi a cause d'un quoting shell (`unmatched "`). Aucun tour Sophia n'a ete envoye par cette tentative.

Artefacts:

- Reponses: `tmp/qa-product-help-adjust-observability/product-help-adjust-observability-20260613-r1/t01.json` a `t05.json`
- Dump observabilite DB: `tmp/qa-product-help-adjust-observability/product-help-adjust-observability-20260613-r1/db-observability.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 - Product/status/tool mal priorises

**User**
> Je suis un peu perdue dans Sophia : quand une action de mon Plan est trop floue, comment je peux la transformer en quelque chose de plus concret sans modifier le reste ? Explique-moi juste le principe, ne change rien.

**Sophia**
> Le principe est simple : au lieu de modifier l'action elle-même dans ton plan, on vient ajouter une couche de préparation, comme une Carte d'attaque. L'idée est d'isoler le tout premier geste concret et minuscule à faire pour démarrer. Ça permet de lever le flou et de réduire la résistance sans toucher à la structure de ta transformation.

**Trace courte**
- http_status: 200
- response_owner: `product_help` d'apres sortie console courte
- selected_handler: `product_help` d'apres sortie console courte
- route_reason: `skill_entry_signal` d'apres sortie console courte
- safety: non observe
- direct_effects: aucun
- operation: aucune operation durable
- pending_confirmation: non observe
- memory_plan: non observe
- executed_tools: aucun
- durable_effect: aucun
- DB trace: sous `f294274b-7837-4e25-ad59-d9d1ae96fc80`, 2 `llm_raw_response_events`, 1 `llm_usage_events`, 12 `conversation_runtime_events`

**Analyse si yellow/red**
- Symptome: Product Help explique une action floue du Plan via Carte d'attaque, alors que la surface la plus proche est Ajuster mon plan.
- Source amont probable: arbitration ou grounding produit de Product Help.
- Owner runtime: `product_help`.
- Meilleure correction selon les guidelines: renforcer le contexte produit et les bridges pour que l'aide informative sur une action de Plan priorise `adjust_plan_item` quand le user parle de transformer/modifier une action existante.
- Pourquoi ce n'est pas un patch local: le probleme est un choix de surface produit, pas une phrase a remplacer.

### Tour 2

**Verdict du tour:** green

**User**
> Ok. Maintenant aide-moi a ajuster une action de mon Plan nommee Preparer un plan anti-ennui : elle est trop vague, je veux la rendre plus concrete pour ce week-end, sans ajouter une nouvelle action.

**Sophia**
> C'est vrai que "Préparer un plan anti-ennui" est un peu vague pour ce week-end. Pour rendre cette action plus concrète, quelle activité précise ou quel premier geste as-tu en tête ?

**Trace courte**
- http_status: 200
- response_owner: `adjust_plan_item` via `routing_decision_summary.tool_skill_runtime.selected_handler`
- selected_handler: `adjust_plan_item`
- route_reason: Product Help handoff to local dispatcher observe: `brain:product_help_handoff_to_local_dispatcher`
- flow_action: `clarify_adjustment_need`
- visible_task.kind: `clarify_adjustment_need`
- direct_effects: aucun
- operation: `adjust_plan_item`
- pending_confirmation: null
- executed_tools: aucun
- durable_effect: aucun
- raw IA: `adjust_plan_item.local_dispatcher` success + `adjust_plan_item.visible.clarify_adjustment_need` success

### Tour 3

**Verdict du tour:** green

**User**
> Je veux que ca devienne tres concret : choisir trois options anti-ennui pour le week-end, une dehors, une a la maison, et une option sociale seulement si ca ne demande pas de contacter quelqu un. Je veux preparer ca vendredi soir en 15 minutes.

**Sophia**
> Ton action pour préparer un plan anti-ennui est actuellement un peu trop vague. Pour lui donner plus de force, tu peux la remplacer par une mission concrète de 15 minutes ce vendredi soir, avec tes trois options spécifiques (dehors, maison, sociale sans contact).
>
> Pour mettre cela à jour, rends-toi dans ton Plan sur la plateforme. Sous le niveau actif, tu trouveras **Ajuster mon plan**. Tu pourras y saisir :
>
> *Rendre l'action concrète : Vendredi soir, prendre 15 min pour choisir 3 options anti-ennui pour le week-end (1 dehors, 1 maison, 1 sociale sans contact).*

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- flow_action: `prepare_plan_handoff`
- visible_task.kind: `plan_handoff_ready`
- mode: `platform_handoff`
- no_chat_mutation: true
- executable_from_chat: false
- allowed_effects: []
- requested_effects: []
- committed_effects: []
- durable_effect: aucun
- raw IA: `adjust_plan_item.local_dispatcher` success + `adjust_plan_item.visible.plan_handoff_ready` success

### Tour 4

**Verdict du tour:** green

**User**
> Je ne veux pas juste etre renvoyee vers un bouton. Je veux que tu m aides ici a ajuster cette action du Plan, avec le bon flow, et que tu gardes ma contrainte sociale sans contact.

**Sophia**
> J'ai bien intégré ta demande pour l'option sociale sans contact afin de rendre l'action « Préparer un plan anti-ennui » plus concrète. La nouvelle version à reprendre est : « Vendredi soir, prendre 15 min pour choisir 3 options anti-ennui pour le week-end (1 dehors, 1 maison, 1 sociale sans contact) ». Tu trouveras l'option « Ajuster mon plan » sous le niveau actif de ton Plan pour y reporter ce changement. Est-ce que cette formulation te convient ?

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- flow_action: `revise_plan_handoff`
- visible_task.kind: `revise_plan_handoff`
- mode: `platform_handoff`
- no_chat_mutation: true
- executable_from_chat: false
- allowed_effects: []
- requested_effects: []
- committed_effects: []
- durable_effect: aucun
- raw IA: `adjust_plan_item.local_dispatcher` success + `adjust_plan_item.visible.revise_plan_handoff` success

### Tour 5

**Verdict du tour:** green

**User**
> Donc la, est-ce que mon Plan a deja ete modifie, ou est-ce que je dois encore copier cette proposition moi-meme dans Ajuster mon plan ?

**Sophia**
> Non, ton plan n'a pas encore été modifié. Pour que ton action 'Préparer un plan anti-ennui' soit plus concrète et moins vague, je te propose de la remplacer par un objectif précis : choisir 3 options (dehors, maison, sociale sans contact) ce vendredi soir en 15 minutes. Pour valider cela, va dans ton Plan et utilise le bouton 'Ajuster mon plan' situé sous le niveau actif pour y saisir cette proposition.

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- flow_action: `explain_handoff`
- visible_task.kind: `explain_handoff`
- mode: `platform_handoff`
- no_chat_mutation: true
- executable_from_chat: false
- allowed_effects: []
- requested_effects: []
- committed_effects: []
- durable_effect: aucun
- evidence: `no_chat_mutation: true`
- raw IA: `adjust_plan_item.local_dispatcher` success + `adjust_plan_item.visible.explain_handoff` success

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- A partir de T2, Sophia pose une clarification utile au lieu de faire semblant d'appliquer une modification.
- Les contraintes explicites sont conservees: pas de nouvelle action, week-end, vendredi soir, 15 minutes, option sociale sans contact.
- T5 repond correctement a la frontiere effet/DB: le Plan n'a pas ete modifie.

**Problemes**
- Tour 1: Product Help donne une explication orientee Carte d'attaque pour une action de Plan trop floue. Famille: BF-ROUTE-03. Impact: l'utilisateur peut etre envoye vers la mauvaise surface avant meme le bridge operationnel. Severite: yellow.
- Tour 3-5: si le produit attend une execution chat-native d'Ajuster mon plan, l'experience reste frustrante car le flow cible explique comment reporter la proposition dans la plateforme. Si la V1 attend seulement un handoff plateforme, ce comportement est coherent. Severite: yellow par attente produit a clarifier.

**Fix propose**
- Source amont: Product Help surface selection + contrat `adjust_plan_item`.
- Correction recommandee: Product Help doit orienter vers `adjust_plan_item` pour les demandes de modification d'action existante. Separément, clarifier si `adjust_plan_item` doit rester `platform_handoff/no_chat_mutation` ou devenir executable depuis chat.
- Tests d'invariant attendus: Product Help informatif sur action de Plan -> surface Ajuster mon plan; Product Help operationnel -> `adjust_plan_item.local_dispatcher`; anti-faux-positif Carte d'attaque quand le user demande explicitement une carte.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T2 montre le bridge attendu: `brain:product_help_handoff_to_local_dispatcher`, puis `selected_handler=adjust_plan_item`.
- T3-T5 restent sous `brain:active_adjust_plan_item_local_dispatcher`.
- Le dispatcher global normal est saute pendant le flow actif: runtime T2 contient `brain:product_help.global_dispatcher_skipped`, puis T3-T5 chargent l'active flow et utilisent le dispatcher local.
- Ce n'est pas le legacy Product Help qui repond a partir de T2: les sources raw sont `adjust_plan_item.local_dispatcher` et `adjust_plan_item.visible.*`.

**Skills / Operations / Tools**
- `adjust_plan_item.local_dispatcher` produit des decisions JSON valides:
  - T2: `clarify_adjustment_need`
  - T3: `prepare_plan_handoff`
  - T4: `revise_plan_handoff`
  - T5: `explain_handoff`
- Les visible agents stage-specific sont appeles:
  - `adjust_plan_item.visible.clarify_adjustment_need`
  - `adjust_plan_item.visible.plan_handoff_ready`
  - `adjust_plan_item.visible.revise_plan_handoff`
  - `adjust_plan_item.visible.explain_handoff`
- Le flow est explicitement `mode=platform_handoff`, `no_chat_mutation=true`, `executable_from_chat=false`.

**Effets**
- Aucun effet durable n'est execute.
- `allowed_effects`, `requested_effects` et `committed_effects` restent vides.
- T5 rend correctement l'absence de mutation.

**Observabilite**
- T2-T5 ont chacun 4 raw events: dispatcher `attempt_start`, dispatcher `success`, visible `attempt_start`, visible `success`.
- `llm_usage_events`: 8 lignes pour T2-T5.
- `conversation_runtime_events`: 35 lignes pour T2-T5.
- Warning: T1 est trace, mais sous un `turn_id` genere et non sous `product-help-adjust-observability-20260613-r1-t01`; le rapport initial cherchait donc le mauvais id.

**Fix propose**
- Source amont: `product_help` pour le mauvais conseil T1; propagation du request id QA pour l'ecart d'identifiant T1.
- Correction recommandee: Product Help doit cibler `plan.adjustment` quand le user demande comment rendre une action existante du Plan plus concrete. Cote observabilite, stabiliser la convention d'identifiant exposee par `test-send-message` pour ne pas melanger run request id et turn id genere.
- Tests d'invariant attendus: Product Help informatif sur action floue du Plan -> `plan.adjustment`; chaque tour `test-send-message` avec `force_full_ai=true` doit exposer l'id sous lequel les traces DB sont ecrites; chaque appel LLM doit avoir `attempt_start` puis `success` ou une erreur stockee.

## Verdict Global

**yellow**

Le fix de bridge Product Help -> `adjust_plan_item` est valide sur T2-T5: le dispatcher cible recoit bien les JSON IA, le legacy ne capture pas la suite, et Sophia ne ment pas sur un effet DB. Restent deux points a corriger ou trancher: T1 oriente encore vers Carte d'attaque pour une demande de Plan, et T1 a ete trace sous un turn id genere plutot que sous le request id QA attendu.
