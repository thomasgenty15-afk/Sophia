# QA Run Report - product-help bridges adjust/defense 20260612

## 1. Contexte Du Test

- Date: 2026-06-12.
- Runs:
  - `product-help-to-adjust-plan-20260612-r1`
  - `product-help-to-prepare-defense-20260612-r2`
- Personas:
  - Rose, auth locale verifiee `200`, pour `adjust_plan_item`.
  - Alex, auth locale verifiee `200`, pour `prepare_defense_card`.
- Objectif: verifier deux ponts depuis `product_help` vers des flows locaux hors carte d'attaque, avec 5 tours minimum chacun.
- Trajectoires:
  - product_help explication Plan -> handoff local `adjust_plan_item` -> clarification -> handoff plateforme -> revision -> question frontiere d'effet.
  - product_help explication carte defense -> handoff local `prepare_defense_card` -> collecte -> handoff plateforme -> revision -> question frontiere d'effet.
- Surfaces visees: `/functions/v1/test-send-message`, `force_full_ai=true`, dispatcher global, `product_help`, `adjust_plan_item`, `prepare_defense_card`, traces LLM brutes, EffectLedger.
- Cadre IA reel: Supabase local, endpoint local, auth password locale + verification `/auth/v1/user`, pas de staging, pas de renderer deterministe, pas de fallback direct `processMessage`, pas de correction code pendant le run.
- Validite QA: valide pour les deux runs retenus. Un essai preliminaire defense `product-help-to-prepare-defense-20260612-r1` a retourne `401 Unauthorized` avant toute reponse Sophia; il est exclu du run final et documente comme incident pre-run.
- Artefacts locaux:
  - `tmp/qa-product-help-bridges-runs/product-help-to-adjust-plan-20260612-r1/summary.json`
  - `tmp/qa-product-help-bridges-runs/product-help-to-prepare-defense-20260612-r2/summary.json`
- Raw IA DB:
  - adjust: 7 lignes `llm_raw_response_events`, sources `dispatcher-v2-llm`, `adjust_plan_item.local_dispatcher`, `adjust_plan_item.visible.*`.
  - defense: 8 lignes `llm_raw_response_events`, sources `dispatcher-v2-llm`, `prepare_defense_card.local_dispatcher`, `prepare_defense_card.visible.*`.

## 2. Tours De Conversation

### Run A - product_help -> adjust_plan_item

### Tour A1

**Verdict du tour:** green

**User**
> Je suis un peu perdue dans Sophia : si une action de mon Plan est trop vague, comment je la modifie sans casser tout le plan ? Explique-moi juste le principe, sans rien changer.

**Sophia**
> C'est tout simple : pour ne rien casser, on ne modifie jamais le plan directement. Le principe, c'est que tu m'expliques ce qui est flou ou inadapté, et je te prépare une proposition d'ajustement. Rien n'est appliqué tant que tu n'as pas validé la nouvelle version. Est-ce que cette idée de « proposition avant validation » te rassure pour la suite ?

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun

### Tour A2

**Verdict du tour:** green

**User**
> Oui. Alors ajuste mon Plan maintenant : l'action 'Préparer un plan anti-ennui' est trop vague, je veux la rendre plus concrète pour ce week-end, sans ajouter de nouvelle action.

**Sophia**
> C'est vrai que 'Préparer un plan anti-ennui' reste un peu général. Pour que ce soit vraiment utile ce week-end, à quelles activités concrètes penses-tu pour remplacer cet intitulé ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `product_help_handoff_to_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation_status: `clarifying`
- operation_reason: `adjust_plan_item_local_clarify_adjustment_need`
- flow_action: `clarify_adjustment_need`
- visible_task: `clarify_adjustment_need`
- executed_tools: `[]`
- durable_effect: aucun

### Tour A3

**Verdict du tour:** green

**User**
> Je veux que ça devienne : choisir trois activités de remplacement, une dehors, une à la maison, une avec quelqu'un. Et je veux que ce soit faisable en 15 minutes de préparation vendredi soir.

**Sophia**
> Comme l'action 'Préparer un plan anti-ennui' est un peu vague, l'idée est de la remplacer par une consigne plus précise pour ton vendredi soir. Pour effectuer ce changement, rends-toi sur la plateforme dans ton Plan : sous le niveau actif, tu trouveras l'option 'Ajuster mon plan'. Tu pourras y saisir cette proposition :
>
> Remplacer 'Préparer un plan anti-ennui' par : 'Choisir 3 activités de remplacement (1 dehors, 1 maison, 1 avec quelqu'un)'. À faire vendredi soir en 15 minutes pour préparer ce week-end.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation_status: `draft_delivered`
- operation_reason: `adjust_plan_item_local_plan_handoff_ready`
- flow_action: `prepare_plan_handoff`
- visible_task: `plan_handoff_ready`
- executed_tools: `[]`
- durable_effect: aucun

### Tour A4

**Verdict du tour:** green

**User**
> Garde quand même l'idée 'anti-ennui' dans le titre, mais rends le titre moins vague. Et ne mets pas 'avec quelqu'un' si ça oblige à contacter quelqu'un.

**Sophia**
> C'est noté pour la contrainte sociale et le titre plus précis. Voici la formulation mise à jour pour remplacer ton action trop vague : « Plan anti-ennui : choisir 3 activités (1 dehors, 1 maison, 1 avec quelqu'un si possible sans obligation) ». Tu peux maintenant l'utiliser dans « Ajuster mon plan », que tu trouveras dans ton Plan juste sous ton niveau actif.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation_status: `draft_delivered`
- operation_reason: `adjust_plan_item_local_revise_plan_handoff`
- flow_action: `revise_plan_handoff`
- visible_task: `revise_plan_handoff`
- executed_tools: `[]`
- durable_effect: aucun

### Tour A5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Donc là tu l'as déjà modifié dans mon Plan, ou je dois encore aller le faire moi-même ?

**Sophia**
> Je garde l'ajustement du plan en cours, mais je n'arrive pas a traiter correctement ce tour. Reessaie dans un instant.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation_status: `blocked`
- operation_reason: `adjust_plan_item_local_dispatcher_failed`
- flow_action: `null`
- visible_task: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: une question simple de frontiere d'effet apres handoff plateforme fait echouer le dispatcher local au lieu de repondre clairement "non, rien n'a ete modifie; tu dois le faire dans la plateforme".
- Source amont probable: `adjust_plan_item` local dispatcher, action manquante ou sortie JSON rejetee sur question post-handoff de statut d'effet.
- Owner runtime: `adjust_plan_item`.
- Meilleure correction selon les guidelines: ajouter une continuation locale stage-specific pour `effect_boundary_question` ou renforcer `get_info_product`/`repeat_handoff` afin de repondre sans global, sans effet durable et sans message de contrat interne.
- Pourquoi ce n'est pas un patch product_help: le pont product_help est deja vert au T2; le bug apparait en flow actif `adjust_plan_item`.

### Run B - product_help -> prepare_defense_card

### Tour B1

**Verdict du tour:** green

**User**
> Je confonds un peu : une carte de défense, ça sert à quoi dans Sophia ? Explique-moi juste, sans en créer une.

**Sophia**
> Une carte de défense, c'est ton bouclier pour les moments où tu risques de dérailler. Elle sert à anticiper les pièges concrets — comme une impulsion, un coup de fatigue ou une pression extérieure — et à prévoir une réponse très simple ou un plan B à appliquer en moins de 30 secondes. C'est ce qui te permet de protéger ton action quand l'environnement devient difficile.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun

### Tour B2

**Verdict du tour:** green

**User**
> D'accord. Alors prépare-moi une carte de défense pour le moment où je rentre fatigué le soir et que je commande automatiquement à manger au lieu de cuisiner.

**Sophia**
> Je comprends, la fatigue du soir rend souvent ces commandes automatiques. Pour cette carte de défense, qu'est-ce que tu voudrais qu'elle t'aide à interrompre ou à préserver en priorité ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `product_help_handoff_to_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation_status: `collecting`
- operation_reason: `prepare_defense_card_local_collecting`
- executed_tools: `[]`
- durable_effect: aucun

### Tour B3

**Verdict du tour:** green

**User**
> Je veux surtout interrompre le réflexe d'ouvrir l'appli de livraison dès que je pose mon sac, et préserver mon énergie sans exploser mon budget.

**Sophia**
> Le moment où tu poses ton sac est un signal très précis pour agir. Pour créer ta carte, rends-toi dans Ressources / Défense / Cartes de défense libres. Comme elle n'est pas créée automatiquement ici, tu pourras copier cette formulation dans le champ « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? » :
>
> quand je rentre fatigué le soir et que je commande automatiquement à manger au lieu de cuisiner
>
> Est-ce que cette description te semble fidèle à ce que tu vis ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation_status: `handoff_delivered`
- operation_reason: `platform_handoff_delivered`
- executed_tools: `[]`
- durable_effect: aucun

### Tour B4

**Verdict du tour:** green

**User**
> Oui, mais ajoute que le vrai danger c'est le geste automatique : téléphone en main, appli ouverte avant même d'avoir réfléchi.

**Sophia**
> C'est une précision importante pour bien identifier ce déclic physique. Pour finaliser ta carte de défense, rends-toi dans Ressources / Défense / Cartes de défense libres. Tu pourras alors copier cette formulation dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : quand je rentre fatigué le soir et que j'ouvre l'appli de livraison par pur geste automatique, téléphone en main, avant même d'avoir réfléchi. La carte n'est pas créée automatiquement depuis le chat, c'est à toi de l'ajouter dans l'outil.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation_status: `handoff_delivered`
- operation_reason: `revised_platform_handoff`
- executed_tools: `[]`
- durable_effect: aucun

### Tour B5

**Verdict du tour:** green

**User**
> Donc concrètement, elle existe déjà dans Sophia ou je dois encore la créer moi-même dans les cartes de défense ?

**Sophia**
> Elle n'existe pas encore dans ton dashboard. On prépare tout le contenu ensemble ici, puis tu pourras l'ajouter toi-même dans l'onglet Ressources, sous Cartes de défense libres. On continue la préparation ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation_status: `collecting`
- operation_reason: `prepare_defense_card_get_info_product`
- flow_action: `get_info_product`
- visible_task: `none`
- executed_tools: `[]`
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les deux premiers tours product_help restent explicatifs quand le user demande seulement a comprendre.
- Les deux demandes operationnelles sortent correctement de product_help vers le dispatcher local cible.
- Le run defense est fluide: la carte n'est jamais pretendue creee, la destination est claire, la revision est reprise correctement.
- Aucun outil ni effet durable n'est execute dans les deux runs.

**Problemes**
- Run A Tour 5: le flow `adjust_plan_item` echoue sur une question humaine normale de frontiere d'effet. Famille: `BF-STATE-01`. Impact: fort, car c'est exactement le type de question qui suit un handoff non-mutant.

**Fix propose**
- Source amont: `adjust_plan_item` local dispatcher / reducer.
- Correction recommandee: traiter les questions post-handoff "est-ce deja modifie / dois-je le faire moi-meme / est-ce applique" comme continuation locale non-mutante, avec visible stage specifique de frontiere d'effet ou `repeat_handoff`.
- Tests d'invariant attendus: apres `plan_handoff_ready`, une question de frontiere d'effet reste dans `adjust_plan_item`, ne globalise pas, ne bloque pas, n'applique aucun effet, et repond "non modifie depuis le chat".

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Adjust T1: `product_help`, puis T2: `product_help_handoff_to_local_dispatcher` vers `adjust_plan_item`.
- Adjust T3-T5: reprise active par `active_adjust_plan_item_local_dispatcher`.
- Defense T1: `product_help`, puis T2: `product_help_handoff_to_local_dispatcher` vers `prepare_defense_card`.
- Defense T3-T5: reprise active par `active_prepare_defense_card_local_dispatcher`.
- Aucun retour observe vers legacy product_help pour fabriquer une reponse cible.

**Skills / Operations / Tools**
- `product_help`: conforme sur les deux ponts testes.
- `adjust_plan_item`: handoff et revision OK; echec local au T5.
- `prepare_defense_card`: conforme sur handoff, revision, question de frontiere d'effet.
- Tools: `executed_tools=[]` sur les 10 tours.

**Effets Durables**
- `direct_effects=[]` sur les 10 tours.
- Aucun effet durable observe.
- Les reponses sont des handoffs plateforme ou reponses produit, pas des mutations DB.

**Raw IA / Trace DB**
- Adjust: 7 lignes dans `llm_raw_response_events` pour `request_id like 'product-help-to-adjust-plan-20260612-r1%'`.
- Defense: 8 lignes dans `llm_raw_response_events` pour `request_id like 'product-help-to-prepare-defense-20260612-r2%'`.
- Les sources incluent bien les dispatchers locaux cibles et les visibles stage-specific.

**Fix propose**
- Source amont: `adjust_plan_item` uniquement.
- Correction recommandee: ajouter/renforcer la sortie structuree du dispatcher pour les questions de frontiere d'effet apres handoff, puis mapper vers un prompt visible local court.
- Tests d'invariant attendus: product_help -> adjust_plan_item et product_help -> prepare_defense_card restent verts; question "tu l'as deja modifie ?" apres handoff adjust ne produit pas `adjust_plan_item_local_dispatcher_failed`.

## 5. Verdict Global

**Verdict: yellow.**

Les deux ponts demandes depuis `product_help` sont valides en IA reelle: `adjust_plan_item` et `prepare_defense_card` reprennent bien via `product_help_handoff_to_local_dispatcher`. Le run defense est vert. Le run adjust reste yellow/red au T5 a cause d'un bug downstream `adjust_plan_item_local_dispatcher_failed` sur question de frontiere d'effet post-handoff.
