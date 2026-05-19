# QA Run Report - Test 1.6 Attack Card Hard 10T

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `attack-card-hard-10t-r13`
- Persona: Alex, connexion locale dediee
- Objectif: verifier le flow carte d'attaque apres corrections `pas terrain`, correction de draft, emplacement Ressources, stop final.
- Trajectoire: demande vague -> clarification cible -> choix technique -> correction contenu -> confirmation -> aide produit -> cloture.
- Surfaces visees: dispatcher, router operations, `prepare_attack_card`, `product_help`, effet durable `user_attack_cards`.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`; messages choisis tour par tour apres lecture des reponses.
- Validite QA: valide. Tentatives precedentes `r8-r12` ont servi a trouver/corriger des erreurs avant ce run frais.

## 2. Tours De Conversation

### Tour 1

**User**
> Il me faut une attaque pour le machin du soir, celui ou je commence a marchander avec moi-meme. Je te laisse deviner l'action.

**Sophia**
> Il me manque l'action exacte à viser. Je peux viser "Faire le sas de déchargement" / "Préparer ta zone de déchargement" / "Repérer les pièges de l'hypervigilance", ou une autre action si ce n'est pas ça.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `operation_intent_start`
- operation: `ask_question`
- executed_tools: []

### Tour 2

**User**
> Le sas. Pas preparer la zone, pas le bilan. L'action active du soir ou je vide ma tete.

**Sophia**
> Quelle technique d'attaque tu veux utiliser ?
> 1. Preparer le terrain...
> 2. Le texte magique...
> Reponds avec le nom ou le numero.

**Trace courte**
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- operation: `ask_question`
- effet: cible conservee sur `Faire le sas de déchargement`

### Tour 3

**User**
> Pas terrain. Le texte magique, celui contre les excuses et la negociation.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- operation: `pending_confirmation`
- operation_id: `74af2a63-8ee1-4989-9381-37a6fd6f9e30`
- executed_tools: []

### Tour 4

**User**
> Avant de creer, rends-la utilisable: premier geste = ouvrir le carnet, puis noter une ligne. Pas de double phrase.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Le texte magique
> ... Mon premier geste: ouvrir le carnet, puis noter une ligne.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- response_owner: `operation_flow`
- route_reason: `confirmation_correction_to_pending`
- operation: `pending_confirmation_updated`
- operation_id: `48fa0af5-8692-4df8-a0e1-16dc924fe2aa`
- durable_effect: aucun

### Tour 5

**User**
> Oui, cree cette carte maintenant.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Carte d'attaque - Faire le sas de déchargement
> Technique : Le texte magique
> ... Mon premier geste: ouvrir le carnet, puis noter une ligne.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque du plan pour la modifier ou l'imprimer.

**Trace courte**
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes`
- operation: `executed`
- executed_tools: [`prepare_attack_card`]
- durable_effect: `attack_card_id=6ea6d6a7-b875-4dcb-9080-d674cc5845ab`

### Tour 6

**User**
> Je la retrouve ou si je veux la modifier ou l'imprimer ?

**Sophia**
> Tu la retrouves dans Dashboard > Ressources > Cartes d'attaque du plan.
>
> Cherche la carte liee a l'action concernee. C'est la que tu peux la consulter, la modifier ou l'imprimer.

**Trace courte**
- response_owner: `product_help`
- selected_handler: `product_help`
- executed_tools: []
- operation: aucune

### Tour 7

**User**
> Donc pas dans Plan, c'est bien dans Ressources ?

**Sophia**
> Tu la retrouves dans Dashboard > Ressources > Cartes d'attaque du plan.
>
> Cherche la carte liee a l'action concernee. C'est la que tu peux la consulter, la modifier ou l'imprimer.

**Trace courte**
- response_owner: `product_help`
- selected_handler: `product_help`
- operation: aucune

### Tour 8

**User**
> Et le contenu garde bien ouvrir le carnet puis noter une ligne ?

**Sophia**
> Oui 🙂 le contenu garde bien le “Mon premier geste : ouvrir le carnet, puis noter une ligne.” en mode premier pas, sans double phrase.
>
> Tu veux que je te la reformate encore plus courte (ex: 1 seule phrase + une instruction), ou ça te va comme ça ?

**Trace courte**
- response_owner: `product_help`
- selected_handler: `product_help`
- operation: aucune

### Tour 9

**User**
> Resume-la en une seule phrase, sans me proposer autre chose.

**Sophia**
> Je n’ai pas besoin de négocier : mon premier geste ce soir est d’ouvrir le carnet puis de noter une ligne. 🙂

**Trace courte**
- response_owner: `operation_flow`
- selected_handler: `adjust_plan_item`
- operation: aucune
- executed_tools: []

### Tour 10

**User**
> Stop, ne cree rien d'autre.

**Sophia**
> Ok, j'arrête là. Je ne crée rien d'autre.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- operation: aucune
- executed_tools: []

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia clarifie sans exiger le nom exact au tour 1.
- Les refus `pas zone`, `pas bilan`, `pas terrain` sont respectes.
- La correction de contenu est prise en compte sans creation prematuree.
- L'emplacement post-creation est clair et stable: `Dashboard > Ressources > Cartes d'attaque du plan`.
- Le stop final ne relance pas de question.

**Problemes**
- Tour 8: Sophia pose encore une proposition de reformattage alors que le user demande seulement une verification. Impact: petite friction conversationnelle. Severite: yellow.
- Tour 9: la reponse est bonne, mais le routage affiche `operation_flow/adjust_plan_item`, ce qui donne une trace confuse meme sans side effect. Severite: yellow.

**Fix propose**
- Ajouter une garde conversationnelle pour les demandes post-creation de type "resume/verifie le contenu" afin de rester en reponse simple ou product_help sans operation handler parasite.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tours 1-5: `prepare_attack_card` gere correctement cible, technique, pending update et confirmation.
- Tours 6-7: `product_help` repond avec la source de verite Ressources.
- Tour 10: `normal_reply` clot proprement.

**Skills / Operations / Tools**
- `prepare_attack_card` execute une seule fois, seulement apres confirmation.
- `pending_confirmation_updated` regenere le draft corrige et remplace l'ancien pending.
- Aucun tool ne s'execute apres creation.

**Memory / Effets durables**
- `user_plan_items.attack_card_id=6ea6d6a7-b875-4dcb-9080-d674cc5845ab`.
- Cible durable: `dd9f0b76-7571-4f1f-a8ca-b086e0e806d1` (`Faire le sas de déchargement`), `cards_status=ready`.

**Problemes**
- Tour 9: `selected_handler=adjust_plan_item` alors que l'intention etait un resume de carte. Aucun side effect, mais le router signale une mauvaise famille operationnelle. Severite: yellow.

**Fix propose**
- Filtrer les demandes de resume/lecture d'une carte deja creee hors `adjust_plan_item`, surtout quand l'historique recent contient une carte d'attaque creee.

## Verdict Global

- Verdict: yellow
- Raison principale: le workflow critique carte d'attaque est corrige, mais il reste un mauvais handler trace au tour 9 et une petite friction UX au tour 8.
- Follow-up prioritaire: corriger le routage post-creation "resume/verifie la carte" pour eviter `adjust_plan_item`.
