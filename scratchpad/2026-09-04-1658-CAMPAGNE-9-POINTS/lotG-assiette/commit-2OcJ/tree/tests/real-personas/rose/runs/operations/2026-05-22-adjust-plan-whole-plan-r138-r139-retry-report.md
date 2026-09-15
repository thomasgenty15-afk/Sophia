# QA Run Report - Adjust Plan Whole Plan r138-r139 Retry

## 1. Contexte Du Test

- Date: 2026-05-22
- Runs: r138, r139
- Persona: Rose
- Objectif: relancer le test whole-plan implicite apres retour du runtime, puis verifier robustesse routing, brouillon, details et validation.
- Trajectoire: le user parle de la prochaine partie du plan et demande une mini marche pour revenir en lien apres accrochage avant de reparler du fond.
- Surfaces visees: routing, `adjust_plan_item`, whole-plan intake, draft review details, validation, cleanup.
- Cadre IA reel: Supabase local, `force_full_ai=true`, aucun fallback deterministe utilise comme resultat QA.
- Validite QA: r138 valide comme detection de bug; r139 valide jusqu'au brouillon, invalide sur l'execution finale car validation bloquee par 3 x 502.

## 2. Tours De Conversation

### Run r138 - Retry apres retour runtime

#### Tour 1

**User**
> Je viens de relire la prochaine partie du plan. Ce qui me manque, ce n est pas analyser la dispute, c est une mini marche pour revenir en lien apres un accrochage avant de reparler du fond.

**Sophia**
> Je peux préparer cet ajustement du plan global sans changer l'objectif de fond.
>
> je clarifie la séparation entre deux étapes du plan: Une marche plus nette entre les petits sujets du quotidien et les sujets sensibles comme l'argent, la famille ou l'intimité.
>
> L'objectif global et la progression par étapes restent stables; on rend surtout la frontière entre deux étapes plus nette.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- route_reason_code: implicit_whole_plan_repair_bridge_adjustment
- direct_effects: aucun

**Analyse courte**
- Routing corrige.
- Classification encore fausse: derive vers split petits sujets / sujets sensibles.

#### Tours 2-5

- Tour 2: deux 502, puis Sophia corrige au 3e essai vers "phase de réparation légère après petite tension".
- Tour 3: reponse correcte sur "pas plusieurs nouvelles actions".
- Tour 4: fond correct sur progression, mais phrase mal assemblee: "ensuite. sert de marche claire".
- Tour 5: nuance correctement ajoutee sans validation.

#### Tour 6 - Validation

- Essai 1: 502
- Essai 2: 502
- Essai 3: 502
- Run arrete.
- Inspection: aucun plan v2 cree; plan v1 toujours actif.
- Cleanup: scope supprime, aucun plan/item cree restant, 7 lignes restaurees.

### Correctifs appliques apres r138

- Whole-plan intake reconnait maintenant:
  - `mini marche`
  - `revenir en lien`
  - `retour en lien`
  - `retour au lien`
  - `accrochage`
  - `reparler du fond`
- Le cas est classe en `missing_bridge_or_level` + `insert_phase_kind:repair_reconnection_after_tension`.
- La reponse progression est reformulee pour eviter la phrase cassee.
- Test ajoute: `adjust_plan_item whole-plan implicit return-in-link bridge is repair step`.

### Run r139 - Post-fix

#### Tour 1

**User**
> Je viens de relire la prochaine partie du plan. Ce qui me manque, ce n est pas analyser la dispute, c est une mini marche pour revenir en lien apres un accrochage avant de reparler du fond.

**Sophia**
> Oui, je vois mieux la marche à ajouter. Je ne la formulerais pas comme un bloc abstrait.
>
> Je formulerais l'ajustement comme une courte étape de réparation: Une étape explicite en deux temps: reconnaître brièvement la tension, puis proposer un petit geste de retour au contact.
>
> L'objectif global reste stable, et les actions de soutien ne changent pas sauf si la régénération montre qu'il faut les reformuler.
>
> Si tu valides, je régénère une nouvelle version du plan avec ce feedback. Rien n'est encore appliqué.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- route_reason_code: implicit_whole_plan_repair_bridge_adjustment
- direct_effects: aucun

#### Tour 2

**User**
> Avant de valider, confirme-moi que tu ne rajoutes pas plusieurs nouvelles actions. Je veux juste cette marche dans la trajectoire, pas un gros bloc en plus.

**Sophia**
> Oui: le brouillon ne rajoute pas plusieurs nouvelles actions. Il ajuste la trajectoire autour de ça: Une étape explicite en deux temps: reconnaître brièvement la tension, puis proposer un petit geste de retour au contact.
>
> Je n'applique rien tant que tu ne me le confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- operation: draft_review_details
- direct_effects: aucun

#### Tour 3

**User**
> Et avec cette marche prévue, on garde quand même l idée de progression ? Je veux éviter que le plan devienne juste au feeling.

**Sophia**
> Non: l'idée n'est pas de rendre le plan flou ou de fonctionner au feeling.
>
> Le brouillon garde une progression. La marche prévue est claire: Une étape explicite en deux temps: reconnaître brièvement la tension, puis proposer un petit geste de retour au contact.
>
> Si tu valides, ce feedback servira à régénérer le plan dans ce sens. Rien n'est encore appliqué.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- operation: draft_review_details
- direct_effects: aucun

#### Tour 4

**User**
> Ajoute au brouillon que cette marche doit rester légère : une phrase de reconnaissance suffit, pas une longue discussion. Ne valide pas encore.

**Sophia**
> C'est corrigé dans le brouillon: Nuance intégrée: cette marche doit rester légère : une phrase de reconnaissance suffit, pas une longue discussion. Je n'applique rien tant que tu ne me le confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft_review_updated
- direct_effects: aucun

#### Tour 5 - Validation

**User**
> Ok, valide et applique cet ajustement du plan global.

**Sophia**
> Reponse vide.

**Trace courte**
- essai 1: 502 `An invalid response was received from the upstream server`
- essai 2: 502 `An invalid response was received from the upstream server`
- essai 3: 502 `An invalid response was received from the upstream server`
- durable_effect: aucun; plan v1 toujours actif, aucun plan v2 cree

**Cleanup**
- remaining_scope_messages: 0
- remaining_created_plan_ids: []
- remaining_created_item_ids: []
- restored_count: 7

## 3. Analyse De Fluidite Humaine

**Verdict: yellow/green jusqu'a validation**

**Ce qui marche**
- r139 comprend la demande implicite sans que le user dise "ajuster le plan global".
- La reponse ne mentionne plus argent/famille/intimite.
- La question "pas plusieurs nouvelles actions" recoit une reponse concrete.
- La question sur la progression est claire et non templatee.
- La nuance est ajoutee sans execution prematuree.

**Problemes**
- r138 Tour 1 etait red avant fix: mauvaise famille whole-plan.
- r139 ne peut pas valider l'experience finale a cause des 502 sur execution.

**Fix propose**
- Aucun fix conversationnel urgent sur r139 pre-validation.
- Investiguer le 502 de validation, qui semble lie a l'appel de regeneration/execution.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- r138/r139 routent bien vers `adjust_plan_item`.
- r139 confirme que la variation implicite est captee par le signal deterministe.

**Skills / Operations / Tools**
- Whole-plan intake corrige: `mini marche / revenir en lien / accrochage / reparler du fond` materialise une etape de reparation.
- Le brouillon reste bloque jusqu'a confirmation explicite.
- La validation finale appelle probablement la regeneration whole-plan, mais l'upstream renvoie 502 avant effet durable.

**Memory / Effets durables**
- r138: aucun plan v2 cree apres echec validation; cleanup OK.
- r139: aucun plan v2 cree apres echec validation; cleanup OK.
- Rose restauree.

**Problemes**
- Validation whole-plan encore fragile runtime: 3 x 502 sur r138, 3 x 502 sur r139.
- Le pre-validation est maintenant robuste, mais l'execution ne peut pas etre declaree green tant que la regeneration echoue.

**Fix propose**
- Prochaine correction 20/80: isoler la cause du 502 sur `executePendingAdjustPlanDraft` / regeneration whole-plan avec logs runtime autour de l'appel provider.

## Verdict Global

**yellow**

La robustesse conversationnelle avant validation est nettement meilleure et le cas implicite est maintenant bien route et bien classe. Le point bloquant restant est l'execution finale: la validation tombe en 502 trois fois, sans effet durable. Rose a ete restauree.
