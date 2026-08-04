# QA Run Report — defense-uncertain-fields-r1

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `defense-uncertain-fields-r1`
- Persona: Alex
- Objectif: tester un user qui ne sait pas s'il lui faut attaque ou défense, ne connaît pas les champs UI, puis donne progressivement le risque et les champs.
- Trajectoire: ambiguïté attaque/défense -> clarification vers défense -> demande explicite de préparation -> multi-champs donnés par le user.
- Surfaces visees: dispatcher, orientation clarification, `prepare_defense_card`, field intake, renderer handoff, effets DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `scripts/qa_prepare_defense_turn.mjs`, pas de fallback déterministe.
- Validite QA: valide. Run mené tour par tour après lecture des réponses et traces courtes. Aucun changement de code pendant le run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-03` — product/status/tool mal priorisés

**User**
> Je ne sais pas si je dois faire une carte d'attaque ou de défense, ni quels champs remplir. Demain j'ai mes mails du soir à faire et je veux éviter de finir sur YouTube après. Tu me guides ?

**Sophia**
> Est-ce que tu veux une explication sur le fonctionnement des cartes, ou est-ce qu'on prépare ton démarrage pour tes mails de demain ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: none in trace
- direct_effects: `[]`
- operation: none
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: no defense card

**Analyse si yellow/red**
- Symptôme: clarification non-exécutante correcte, mais elle transforme le besoin en opposition "explication produit" vs "démarrage mails" au lieu de clarifier attaque/défense autour du risque YouTube.
- Source amont probable: orientation clarification / arbitration before tool skill.
- Owner runtime: dispatcher + clarification contract.
- Meilleure correction selon les guidelines: si le user demande "attaque ou défense" avec un risque de dérapage, la clarification doit poser l'alternative métier attaque/défense ou handoff vers `prepare_defense_card` si la défense est assez claire.
- Pourquoi ce n'est pas un patch local: la famille concerne toutes les demandes de carte incertaines, pas la phrase "YouTube".

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — mauvais owner sélectionné

**User**
> Je veux plutôt une défense pour éviter YouTube après les mails du soir, mais je ne sais pas quels champs la plateforme va me demander.

**Sophia**
> Est-ce que tu veux une explication sur les champs d'une carte de défense, ou est-ce que tu veux préparer ton démarrage pour tes mails ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: none in trace
- direct_effects: `[]`
- operation: none
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: no defense card

**Analyse si yellow/red**
- Symptôme: le user choisit explicitement défense, mais Sophia reste en clarification générique et répète presque la même alternative.
- Source amont probable: active orientation clarification ne libère pas le tour vers `prepare_defense_card`.
- Owner runtime: routing / orientation clarification arbitration.
- Meilleure correction selon les guidelines: une clarification résolue vers défense doit router vers le skill ou au minimum poser une question de champ UI défense, pas reposer une alternative product-help.
- Pourquoi ce n'est pas un patch local: le problème est la transition d'état clarification -> skill, pas le wording exact.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — mauvais owner sélectionné

**User**
> Non, prépare une carte de défense pour éviter YouTube après mes mails. Je ne veux pas une carte d'attaque. Je connais seulement le risque, pas les champs.

**Sophia**
> C'est noté, on part sur une carte de défense pour protéger ta soirée.
>
> Pour les champs, la plateforme va te demander trois choses simples :
>
> 1. Le déclencheur : c'est le moment précis où tu bascules (ex: quand tu fermes ton dernier mail).
> 2. L'action de défense : ce que tu fais à la place pour couper court (ex: fermer l'ordi direct ou lancer un podcast).
> 3. La promesse : pourquoi c'est important pour toi de ne pas finir sur YouTube.
>
> On commence par le déclencheur : c'est quoi le signal exact qui te donne envie d'aller sur YouTube d'habitude ? 🛡️

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `orientation_clarification_topic_change`
- safety: none in trace
- direct_effects: `[]`
- operation: none
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: no defense card

**Analyse si yellow/red**
- Symptôme: Sophia accepte verbalement la défense, mais répond hors skill et invente un champ "promesse" qui n'est pas dans le catalogue UI `prepare_defense_card`.
- Source amont probable: route sortie de clarification vers `normal_reply` au lieu de `prepare_defense_card`.
- Owner runtime: routing / handoff from clarification to tool skill.
- Meilleure correction selon les guidelines: une demande explicite "prépare une carte de défense" doit entrer dans le skill, qui possède le catalogue `platform_fields`.
- Pourquoi ce n'est pas un patch local: la bonne correction est de restaurer l'owner métier; le normal reply ne doit pas porter les champs UI défense.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — mauvais owner sélectionné

**User**
> Le moment c'est quand je ferme les mails vers 22h30. Le signal c'est que j'ouvre YouTube en me disant juste cinq minutes. Le geste ce serait poser le téléphone dans l'entrée et préparer une tisane.

**Sophia**
> Parfait, là t’as déjà les 3 blocs d’une carte de défense bien claire 😄
>
> Déclencheur (moment) : quand tu fermes les mails du soir vers 22h30.
> Signal (tentation) : quand tu ouvres YouTube en te disant “juste cinq minutes”.
> Geste de défense : poser le téléphone dans l’entrée + préparer une tisane.
>
> Il te reste juste à écrire la “promesse” en 1 phrase. Tu veux que ça sonne plutôt “santé/sommeil” ou plutôt “discipline/temps gagné” ? 🌿

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `orientation_clarification_topic_change`
- safety: none in trace
- direct_effects: `[]`
- operation: none
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: no defense card

**Analyse si yellow/red**
- Symptôme: la multi-extraction explicite n'atteint jamais `prepare_defense_card`; Sophia continue avec un champ "promesse" inventé et ne produit pas de destination plateforme.
- Source amont probable: état de clarification/orientation garde le contrôle et route vers `normal_reply`.
- Owner runtime: routing / orientation clarification lifecycle.
- Meilleure correction selon les guidelines: dès que moment + signal + geste sont donnés dans un contexte carte de défense, le tour doit être capturé par `prepare_defense_card` et produire un handoff compact.
- Pourquoi ce n'est pas un patch local: le cas couvre la famille "user incertain puis clarification résolue", qui doit marcher pour toutes les cartes défense.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun effet durable n'est déclenché à tort.
- Le premier tour évite une création prématurée.

**Problemes**
- Tour 1: clarification peu utile, centrée produit/démarrage au lieu d'attaque/défense. Famille: `BF-ROUTE-03`. Impact: le user doit reformuler. Sévérité: yellow.
- Tour 2: répétition de clarification malgré choix explicite de défense. Famille: `BF-ROUTE-01`. Impact: boucle visible. Sévérité: red.
- Tours 3-4: réponse hors skill, champs UI faux, pas de destination plateforme. Famille: `BF-ROUTE-01`. Impact: le user reçoit une préparation non conforme à l'UI. Sévérité: red.

**Fix propose**
- Source amont: orientation clarification lifecycle et arbitration vers tool skill.
- Correction recommandee: quand une clarification attaque/défense est résolue vers défense, transférer l'état au skill `prepare_defense_card` avec les éléments déjà donnés; empêcher `normal_reply` de continuer le parcours métier défense.
- Tests d'invariant attendus: user incertain -> clarification métier; "plutôt défense" -> `prepare_defense_card`; multi-champs -> handoff plateforme compact; aucun champ "promesse".

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1 route vers `orientation_clarification`, acceptable mais question mal ciblée.
- Tour 2 reste `orientation_clarification` malgré intention défense explicite.
- Tours 3-4 route vers `normal_reply` avec `route_reason=orientation_clarification_topic_change`, alors que l'owner attendu est `prepare_defense_card`.

**Skills / Operations / Tools**
- `prepare_defense_card` n'est jamais sélectionné.
- Aucun `platform_handoff` n'est produit.
- Le catalogue field-aware n'est jamais utilisé; le normal reply invente "promesse".

**Memory / Effets durables**
- `executed_tools=[]` sur tous les tours.
- `pending_confirmation=null` sur tous les tours.
- `user_defense_cards=[]`.
- Cleanup ciblé effectué sur le scope `qa-prepare-defense-card-alex-2026-06-03-defense-uncertain-fields-r1`: 8 `chat_messages` supprimés, 1 `user_chat_states` supprimé, `after_messages=0`.

**Problemes**
- Tours 2-4: mauvais owner. Famille: `BF-ROUTE-01`. Impact système: le workflow défense field-aware est contourné. Sévérité: red.
- Tours 3-4: normal reply porte des champs UI non canoniques. Famille: `BF-ROUTE-01` en source amont, symptôme renderer/intake aval. Sévérité: red.

**Fix propose**
- Source amont: orientation clarification et route policy de sortie de clarification.
- Correction recommandee: faire de `prepare_defense_card` l'owner dès que le user résout l'ambiguïté vers défense ou donne des champs défense après une clarification active.
- Tests d'invariant attendus: traces `selected_handler=prepare_defense_card`, `tool_execution=platform_handoff`, `executed_tools=[]`, `committed_effects=[]`, wording sans "promesse".

## Verdict Global

- Verdict: red
- Raison principale: le run réel ne touche jamais `prepare_defense_card`; Sophia reste en clarification/normal reply et prépare des champs non conformes.
- Follow-up prioritaire: corriger la sortie de `orientation_clarification` vers le skill défense quand l'utilisateur choisit explicitement défense ou donne les champs attendus.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-defense-uncertain-fields-r1-bugs.md`
