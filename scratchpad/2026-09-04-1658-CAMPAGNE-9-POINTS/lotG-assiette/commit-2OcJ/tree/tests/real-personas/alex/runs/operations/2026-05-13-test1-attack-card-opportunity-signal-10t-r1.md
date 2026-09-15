# QA Run Report - Attack Card Opportunity Signal 10T

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `attack-card-opportunity-signal-10t-r1`
- Persona: Alex, connexion locale dediee (`tests/real-personas/alex/connection.json`)
- Objectif: tester d'abord le signal `tool_skill_opportunity.type=attack_card` / `operation_type=prepare_attack_card`, puis conduire un run de 10 tours jusqu'a la preparation et creation d'une carte d'attaque.
- Trajectoire: action faite avec friction de demarrage -> proposition de Carte d'attaque -> acceptation -> recuperation de cible -> correction de draft -> confirmation -> effet durable -> questions produit -> stop.
- Surfaces visees: dispatcher v2, `tool_skill_opportunity`, recommendation tool, `prepare_attack_card`, `track_progress_plan_item`, product help, effet durable `user_attack_cards`.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`, `disable_debounce=true`; messages user choisis tour par tour apres lecture de Sophia et traces courtes.
- Contraintes forbidden patterns: pas de test skip, pas de mock, pas de fallback deterministe, pas de transcript reconstruit, pas de SQL destructif, pas de messages user pre-scripted.
- Incident technique: premiere tentative avant tour 1 bloquee par sandbox `EPERM 127.0.0.1:54321`; relance autorisee vers localhost, sans fallback et sans tour Sophia perdu.
- Validite QA: valide.

## 2. Tours De Conversation

### Tour 1

**User**
> J'ai fait le sas de déchargement hier soir, mais j'ai tourné autour 45 minutes avant d'ouvrir le carnet. J'aimerais éviter ce marchandage ce soir.

**Sophia**
> Ah je vois le pattern: tu es bien en route (tu l’as fait), mais ton cerveau négocie avant de “ouvrir le carnet”. 😅 Ce soir, objectif pas de “se motiver” : juste casser le démarrage.
>
> 1) Pareil que hier, mais avec une règle bête et méchante: 2 minutes chrono d’ouverture uniquement.
> 2) Ensuite seulement, tu choisis: soit tu écris 3 lignes, soit tu arrêtes. Mais tu dois avoir ouvert.
> 3) Mets le carnet visible/près de toi avant (même posé sur la table, pas rangé).
>
> Si tu veux, je peux aussi te proposer de passer par la Carte d’attaque pour rendre le démarrage plus direct, sans laisser la place au marchandage. Tu es partant ? ✅🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `none`
- direct_effects: `track_progress_plan_item`, `target_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`, `status_hint=completed`
- operation: aucune execution
- tool_skill_opportunity: `attack_card`, `prepare_attack_card`, `target_hint=Faire le sas de déchargement`, `should_offer=true`, `must_not_execute=true`
- recommendation: `recommend_operation attack_card`, mais `operation_input.target=Préparer ta zone de déchargement`
- pending_confirmation: none
- memory_plan: `light/targeted`
- executed_tools: [`track_progress_plan_item`]
- durable_effect: completion du sas logguee

### Tour 2

**User**
> Oui, partons sur une carte d'attaque pour ce démarrage du sas, surtout le moment où je dois ouvrir le carnet.

**Sophia**
> Il manque la cible à rattacher à cette carte.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `operation_intent_start`
- safety: `none`
- direct_effects: []
- operation: `invalid_recommendation_payload`
- pending_confirmation: none
- memory_plan: `light/targeted`
- executed_tools: []
- durable_effect: aucun

### Tour 3

**User**
> La cible c'est l'habitude active: Faire le sas de déchargement. Pas préparer la zone, vraiment ouvrir le carnet et lancer les 5 minutes.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Meditation de 5 minutes
> Ferme les yeux, vois-toi au moment de Faire le sas de déchargement, puis vois le premier geste se faire sans debat.
>
> Mode d'emploi: Prends 5 minutes pour te voir faire l'action de facon calme et concrete.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `operation_intent_start`
- safety: `none`
- direct_effects: []
- operation: `pending_confirmation`
- operation_id: `8f37346f-2150-4e00-a5e4-c0c0f3526044`
- pending_confirmation: non expose dans la trace courte, mais operation flow en confirmation
- memory_plan: `light/targeted`
- executed_tools: []
- durable_effect: aucun

### Tour 4

**User**
> Pas méditation. Je veux un texte magique court contre le marchandage: ouvrir le carnet, écrire une ligne, puis seulement après décider si je continue.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance. Mon premier geste: ouvrir le carnet.
>
> Mode d'emploi: Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `confirmation_correction_to_pending`
- safety: `none`
- direct_effects: []
- operation: `pending_confirmation_updated`
- operation_id: `c0ae0fda-4fad-47f5-959c-a5b077eaf01f`
- pending_confirmation: non expose dans la trace courte, mais operation flow en confirmation
- memory_plan: `light/targeted`
- executed_tools: []
- durable_effect: aucun

### Tour 5

**User**
> Presque. Ajoute explicitement: après ouvrir le carnet, j'écris une seule ligne. Et garde le côté 'je décide après', pas avant.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance. Mon premier geste: ouvrir le carnet.
>
> Mode d'emploi: Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `confirmation_correction_to_pending`
- safety: `none`
- direct_effects: []
- operation: `pending_confirmation_updated`
- operation_id: `41b24eca-8d8c-466b-b1ab-031fe8b8f6f1`
- pending_confirmation: non expose dans la trace courte, mais operation flow en confirmation
- memory_plan: `light/targeted`
- executed_tools: []
- durable_effect: aucun

### Tour 6

**User**
> Ok crée-la comme ça pour l'instant.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Carte d'attaque - Faire le sas de déchargement
> Technique : Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance. Mon premier geste: ouvrir le carnet.
>
> Mode d'emploi : Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque du plan pour la modifier ou l'imprimer.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes_with_adjustment`
- safety: `none`
- direct_effects: []
- operation: `executed`
- operation_id: `41b24eca-8d8c-466b-b1ab-031fe8b8f6f1`
- pending_confirmation: none
- memory_plan: `light/targeted`
- executed_tools: [`prepare_attack_card`]
- durable_effect: `user_attack_cards.id=8091f9ef-e251-4310-b6dd-f6f0387fcd2a`, `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`

### Tour 7

**User**
> Je la retrouve où exactement si je veux la relire ce soir ?

**Sophia**
> Tu la retrouves dans Dashboard > Ressources > Cartes d'attaque du plan.
>
> Cherche la carte liee a l'action concernee. C'est la que tu peux la consulter, la modifier ou l'imprimer.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_handoff_requested`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `light/targeted`
- executed_tools: []
- durable_effect: aucun nouveau

### Tour 8

**User**
> Elle est bien rattachée à Faire le sas de déchargement, pas à préparer la zone ?

**Sophia**
> Oui, elle est rattachée à Faire le sas de déchargement, pas à préparer la zone. 🙂 Et pour que ce soit béton au moment d’ouvrir le carnet, le “texte magique” doit déclencher exactement le premier geste (ouvrir + lancer les 5 minutes), pas un truc vague. Tu veux qu’il soit plutôt “anti-marcheage” (du style couper court aux débats) ou plutôt “anti-peur” (rassurer et rendre ça simple) ?

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `none`
- direct_effects: []
- operation: none
- recommendation: `recommend_operation attack_card`, `operation_input={}`, non executee
- pending_confirmation: none
- memory_plan: `light/targeted`
- executed_tools: []
- durable_effect: aucun nouveau

### Tour 9

**User**
> Ne modifie rien maintenant. Je voulais juste vérifier. Mais dans le contenu actuel, tu vois bien qu'il manque écrire une ligne, non ?

**Sophia**
> Oui, je vois le manque: il manque une ligne dans le contenu actuel de la carte (donc une petite “étape”/phrase clé qui complète le démarrage). Et comme tu m’as dit de ne rien modifier maintenant, je ne touche à rien. ✅😄 Si tu veux juste valider, tu confirmes que la ligne manquante doit correspondre à l’endroit exact où tu dois ouvrir le carnet et lancer les 5 minutes ? (oui/non)

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `none`
- direct_effects: []
- operation: none
- tool_skill_opportunity: `attack_card`, `prepare_attack_card`, `target_hint=Faire le sas de déchargement`, `should_offer=true`, `must_not_execute=true`
- pending_confirmation: none
- memory_plan: `light/targeted`
- executed_tools: []
- durable_effect: aucun nouveau

### Tour 10

**User**
> Oui, mais stop pour maintenant: ne crée rien d'autre et ne modifie rien.

**Sophia**
> Ok, j'arrête là. Je ne crée rien d'autre.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `light/targeted`
- executed_tools: []
- durable_effect: aucun nouveau

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: Sophia comprend le vrai probleme humain: l'action est faite, mais le demarrage est frictionnel.
- Tour 1: la Carte d'attaque est proposee comme option, pas imposee.
- Tours 3-6: malgre le derail initial, Sophia revient a une carte lisible, demande confirmation, puis cree une seule carte.
- Tour 7: l'explication d'emplacement est claire.
- Tour 10: le stop est respecte sans relance.

**Problemes**
- Tour 2: apres un oui naturel, Sophia repond "Il manque la cible" alors que le tour 1 avait deja identifie `Faire le sas de déchargement`. Impact: friction forte, le user doit reparer le systeme. Severite: red.
- Tour 3: le premier draft propose une "Meditation de 5 minutes", peu coherente avec le besoin anti-marchandage et avec "ouvrir le carnet". Impact: sentiment que Sophia part sur une technique par defaut plutot que sur le besoin exprime. Severite: yellow.
- Tours 4-5: Sophia ignore la correction "ecrire une seule ligne" et "je decide apres". Impact: perte de confiance dans la capacite a corriger un draft avant creation. Severite: yellow.
- Tours 8-9: Sophia continue a proposer une optimisation alors que le user demande surtout verification et explicitement "ne modifie rien". Impact: petite pression conversationnelle inutile. Severite: yellow.

**Fix propose**
- Quand `tool_skill_opportunity.target_status=identified`, l'offre visible doit conserver cette cible dans le pending de recommandation.
- En correction de draft, verifier que les contraintes nouvelles du user apparaissent dans le draft regenere avant de redemander confirmation.
- Pour les questions post-creation de verification, repondre d'abord factuellement et ne proposer une nouvelle operation que si le user demande vraiment de modifier.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1: dispatcher correct. `tool_skill_opportunity.type=attack_card`, `operation_type=prepare_attack_card`, `target_hint=Faire le sas de déchargement`, `should_offer=true`, `must_not_execute=true`.
- Tour 1: conflit systeme observe. La recommendation utilise `surface_id=attack_card`, mais son `operation_input.target` pointe vers `Préparer ta zone de déchargement`, pas vers la cible identifiee par `tool_skill_opportunity`.
- Tour 2: l'acceptation de l'offre route vers `operation_flow/prepare_attack_card`, mais aboutit a `invalid_recommendation_payload`. C'est le coeur du bug du run.
- Tours 3-6: le flow direct `prepare_attack_card` recupere apres clarification utilisateur et execute correctement apres confirmation.
- Tours 7-10: pas de side effect supplementaire; le stop final est bien route en `normal_reply`.

**Skills / Operations / Tools**
- `track_progress_plan_item` s'execute au tour 1 avec la bonne habitude ciblee.
- `prepare_attack_card` ne s'execute qu'au tour 6 apres confirmation.
- `pending_confirmation_updated` fonctionne au sens ou il regenere un draft, mais il ne conserve pas toutes les corrections utilisateur.
- `product_help` repond bien sur l'emplacement, mais reste un peu trop actif sur les suggestions post-creation.

**Memory / Effets durables**
- Effet durable cree: `user_attack_cards.id=8091f9ef-e251-4310-b6dd-f6f0387fcd2a`.
- Rattachement durable correct: `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1` (`Faire le sas de déchargement`).
- `user_plan_items` montre `Faire le sas de déchargement.cards_status=ready` et `attack_card_id=8091f9ef-e251-4310-b6dd-f6f0387fcd2a`.
- Le contenu durable ne contient pas la correction demandee "j'ecris une seule ligne" / "je decide apres".

**Problemes**
- Tour 1 -> Tour 2: `tool_skill_opportunity` identifie la bonne cible mais la recommendation concurrente/persisted pending porte un payload incoherent ou incomplet. Impact systeme: le consentement utilisateur ne lance pas proprement le flow recommande. Severite: red.
- Tour 2: message visible "Il manque la cible" alors que la trace `missing_slots=["technique"]` signale autre chose. Impact systeme: diagnostic visible non aligne avec l'etat technique. Severite: yellow.
- Tours 4-5: correction utilisateur non preservee dans `generated_asset` et `instruction`. Impact systeme: le draft confirme peut diverger des contraintes utilisateur. Severite: yellow.
- Trace: `operation_flow_run.status=pending_confirmation`, mais `has_pending_confirmation=false` dans le resume du runner. Impact observabilite: le rapport doit lire `operation_flow_run`, pas seulement le champ pending. Severite: yellow.

**Fix propose**
- Prioriser `tool_skill_opportunity` sur la recommendation issue du skill quand les deux pointent vers le meme `operation_type` mais pas la meme cible, ou fusionner en gardant la cible `tool_skill_opportunity` si `target_status=identified`.
- Dans `buildAttackCardRecommendationOperationInput`, accepter et transmettre la cible identifiee par `tool_skill_opportunity` avec un payload minimal suffisant, ou demarrer un intake normal qui pose la bonne question de technique.
- Harmoniser les messages `invalid_recommendation_payload` avec les `missing_slots` reels.
- Ajouter un test conversationnel/integration pour: friction action completed -> offer attack card -> oui -> pending confirmation sans redemander la cible.
- Ajouter un test de correction de draft: une correction contenant deux contraintes doit apparaitre dans le draft suivant ou etre clarifiee.

## Verdict Global

- Verdict: red
- Raison principale: le signal `tool_skill_opportunity` est correct, mais le passage consentement -> `prepare_attack_card` echoue au tour 2 avec un payload de recommendation incoherent/invalide.
- Follow-up prioritaire: corriger la fusion/priorisation entre `tool_skill_opportunity` et recommendation tool pour que la cible identifiee survive jusqu'au pending `prepare_attack_card`.
