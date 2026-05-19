# QA Operation Suggestion - Test 1.4 - Alex - 2026-05-13 - attack-card-hard-10t-r1

## 1. Contexte Du Test

- Date: 2026-05-13 Europe/Paris
- Run: `attack-card-hard-10t-r1`
- Persona: Alex
- Connexion: `tests/real-personas/alex/connection.json`, JWT via `bash scripts/get-jwt.sh alex`
- Objectif: tester une demande difficile de carte d'attaque sur 10 tours, avec un user vague, impatient, peu cooperatif, qui parle d'une "attaque" pour "une action" sans donner les slots proprement.
- Trajectoire: demande tres vague -> clarification cible -> mauvaise resolution cible -> corrections/rejets -> mauvaise technique -> correction technique -> correction de contenu ignoree -> confirmation -> creation DB.
- Surfaces visees: dispatcher `operation_intent`, `operation_flow`, handler `prepare_attack_card`, resolution cible, selection technique, correction de pending draft, confirmation, tool `prepare_attack_card`, DB `user_attack_cards`.
- Cadre IA reel: Supabase local, endpoint local `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback `processMessage`, aucun staging/remote.
- Validite QA: valide. Une premiere invocation locale a echoue avant conversation avec `EPERM 127.0.0.1:54321` sous sandbox; le tour 1 a ete relance avec autorisation locale. Les 10 tours valides ont ensuite ete menes tour par tour apres lecture de la reponse precedente.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-05-13-test1-attack-card-hard-10t-r1.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-05-13-test1-attack-card-hard-10t-r1.summary.json`
- Durable: `tests/real-personas/alex/runs/operations/2026-05-13-test1-attack-card-hard-10t-r1.durable.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Bon fais-moi une attaque pour l'action la, le truc du soir. Je sais pas, debrouille-toi, j'ai pas envie d'expliquer.

**Sophia**
> Il me manque l'action exacte à viser. Je peux viser "Faire le sas de déchargement" / "Préparer ta zone de déchargement" / "Repérer les pièges de l'hypervigilance", ou une autre action si ce n'est pas ça.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `operation_intent_start`
- safety: `risk_band=none`, side effects autorises mais aucun effet lance
- direct_effects: none
- operation: `status=ask_question`, slot `target`
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**User**
> Mais je viens de te le dire, l'action active du soir quoi. Le sas, pas le bilan ni ton truc de zone. Fais l'attaque la-dessus.

**Sophia**
> Quelle technique d'attaque tu veux utiliser ?
>
> 1. Preparer le terrain (recommandee): option simple pour faciliter le demarrage. Exemple pour "Bilan et ajustement du sas": preparer l'environnement avant le moment critique.
> 2. Le texte magique: option utile si la resistance est surtout mentale. Exemple pour "Bilan et ajustement du sas": un texte court a relire quand tu negocies avec toi-meme.
>
> Reponds avec le nom ou le numero.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=ask_question`, slot `technique`
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 3

**User**
> Non mais tu lis ? PAS bilan. Je parle de Faire le sas de dechargement. Et le probleme c'est que je negocie avec moi-meme et je me raconte des excuses.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire "Bilan et ajustement du sas", ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.
>
> Mode d'emploi: Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=pending_confirmation`, `operation_id=d1e37060-6d5b-46cb-b435-e0ab2ae962e6`
- pending_confirmation: draft cible `Bilan et ajustement du sas`
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**User**
> Non. Surtout pas. T'as encore mis Bilan. Je veux Faire le sas de dechargement, l'action active, celle ou je prends le carnet le soir.

**Sophia**
> Quelle technique d'attaque tu veux utiliser ?
>
> 1. Preparer le terrain (recommandee): retire la friction avant le moment d'action. Exemple pour "Faire le sas de déchargement": preparer l'environnement avant le moment critique.
> 2. Le texte magique: option utile si la resistance est surtout mentale. Exemple pour "Faire le sas de déchargement": un texte court a relire quand tu negocies avec toi-meme.
>
> Reponds avec le nom ou le numero.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `confirmation_correction_to_pending`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=ask_question`, target corrige vers `Faire le sas de déchargement`
- pending_confirmation: previous draft rejected, no execution
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 5

**User**
> Je sais pas moi. Pas un truc de terrain, le truc contre mes excuses et ma negociation. Tu choisis pas au hasard non plus.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Preparer le terrain
> Prepare l'environnement de "Faire le sas de déchargement" pendant 2 minutes, sans obligation d'aller plus loin.
>
> Mode d'emploi: Prepare le terrain avant le moment vise, puis laisse l'environnement t'aider a demarrer.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=pending_confirmation`, `operation_id=b0c34267-c2e3-4742-945f-91320af04c51`
- pending_confirmation: draft technique `preparer_terrain`
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 6

**User**
> Non, encore non. Je viens de dire pas terrain. Mets le texte magique, celui pour arreter de negocier avec l'idee de faire le sas.

**Sophia**
> J'hésite entre "Faire le sas de déchargement" / "Bilan et ajustement du sas". Dis-moi laquelle viser.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `confirmation_correction_to_pending`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=ask_question`, slot target re-ouvert
- pending_confirmation: previous draft rejected, no execution
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 7

**User**
> La premiere. Faire le sas. Et garde le texte magique, pas autre chose.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.
>
> Mode d'emploi: Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=pending_confirmation`, `operation_id=27cc68d7-40a2-4a14-8e7e-530283fcd496`
- pending_confirmation: draft cible `Faire le sas de déchargement`, technique `texte_recadrage`
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 8

**User**
> Bof. C'est trop vague. Ajoute que le premier geste c'est ouvrir le carnet et noter une ligne, pas ton blabla general.

**Sophia**
> Il me manque l'action exacte à viser. Je peux viser "Faire le sas de déchargement" / "Préparer ta zone de déchargement" / "Bilan et ajustement du sas", ou une autre action si ce n'est pas ça.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `confirmation_correction_to_pending`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=ask_question`, target perdu pendant une correction de contenu
- pending_confirmation: previous draft rejected, no execution
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 9

**User**
> Mais c'est fou, c'est toujours la meme action : Faire le sas de dechargement. Texte magique. Premier geste : ouvrir le carnet et noter une ligne.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.
>
> Mode d'emploi: Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=pending_confirmation`, `operation_id=e2fbbe8f-d388-4806-86fd-9429307ff7e3`
- pending_confirmation: draft cible et technique correctes, mais contenu demande `ouvrir le carnet et noter une ligne` non visible dans la reponse
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 10

**User**
> Oui vas-y cree-la, tant pis. Mais franchement elle aurait du garder ouvrir le carnet.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Carte d'attaque - Faire le sas de déchargement
> Technique : Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.
>
> Mode d'emploi : Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque du plan pour la modifier ou l'imprimer.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes_with_adjustment`
- safety: `risk_band=none`
- direct_effects: `prepare_attack_card=success`
- operation: `status=executed`, `operation_id=e2fbbe8f-d388-4806-86fd-9429307ff7e3`, `attack_card_id=9c5f3a62-a401-457b-b1b6-555ae4d20d7f`
- pending_confirmation: cleared
- memory_plan: not material to the turn
- executed_tools: `["prepare_attack_card"]`
- durable_effect: attack card written and linked to plan item

Durable DB observe:

- `user_attack_cards.id=9c5f3a62-a401-457b-b1b6-555ae4d20d7f`
- `user_attack_cards.plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- `content.techniques[0].technique_key=texte_recadrage`
- `content.techniques[0].generated_result.generated_asset=Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.`
- `content.operation_draft.instruction=Version minuscule : ouvrir le carnet, puis Faire le sas de dechargement. Texte magique. Premier geste : ouvrir le carnet, puis noter une ligne.`
- `user_plan_items.id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- `user_plan_items.attack_card_id=9c5f3a62-a401-457b-b1b6-555ae4d20d7f`
- `user_plan_items.cards_status=ready`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 1: Sophia ne force pas la creation quand la cible est vague et propose les candidats du plan dans un ordre initial pertinent.
- Tours 4, 7 et 10: Sophia sait recuperer apres certains refus, ne cree pas sans confirmation, et indique bien l'emplacement `Ressources > Cartes d'attaque du plan`.
- Tours 7-10: la formulation `texte_recadrage` corrigee est nettement meilleure que l'ancien `negocier X`.

**Problemes**
- Tour 2: Sophia choisit `Bilan et ajustement du sas` alors que le user dit `pas le bilan`. Impact: experience frustrante et perte de confiance. Severite: red.
- Tour 3: elle propose un draft sur la mauvaise cible apres une correction explicite `PAS bilan`. Impact: risque de creation d'une mauvaise carte si le user confirme par fatigue. Severite: red.
- Tour 5: elle choisit `Preparer le terrain` alors que le user dit `Pas un truc de terrain` et parle d'excuses/negociation. Impact: la proposition de technique semble sourde au message. Severite: red.
- Tour 8: une demande de modification de contenu fait perdre la cible deja resolue. Impact: le user doit re-re-repreciser la meme action. Severite: red.
- Tour 9: le draft final ne montre pas la contrainte demandee (`ouvrir le carnet et noter une ligne`), meme si elle apparait ensuite dans `operation_draft.instruction` en DB. Impact: la confirmation visible ne correspond pas au detail attendu. Severite: yellow.

**Fix propose**
- Quand un message contient une negation cible (`pas le bilan`, `pas terrain`), propager explicitement cette contrainte dans la resolution cible/technique et invalider le draft precedent.
- Pendant une correction de pending draft, conserver les slots deja confirmes sauf si le user les contredit clairement.
- Distinguer correction de `target`, correction de `technique`, et correction de `asset/content`; une correction de contenu ne doit pas repasser en `target_missing`.
- Faire apparaitre les contraintes de premier geste dans le `generated_asset` visible, pas seulement dans `operation_draft.instruction`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le routing global reste sur le bon owner: `operation_flow/prepare_attack_card` jusqu'a la confirmation, puis `pending_confirmation/execute_confirmed` au tour 10.
- Aucun side effect n'est lance avant confirmation explicite.
- Le probleme n'est pas le dispatcher principal, mais la gestion de slots/corrections dans le flow actif.

**Skills / Operations / Tools**
- `prepare_attack_card` est selectionne correctement.
- Les corrections de pending sont reconnues (`confirmation_correction_to_pending`) mais l'etat reconstruit est instable: mauvaise cible au tour 2-3, mauvaise technique au tour 5, perte de cible au tour 8.
- Le tool `prepare_attack_card` s'execute une seule fois au tour 10, apres oui explicite.

**Memory / Effets durables**
- Effet durable final techniquement correct pour la cible: carte active rattachee a `dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`.
- Le contenu durable garde la technique `texte_recadrage` et la nouvelle formulation.
- Warning: le champ `operation_draft.instruction` contient la contrainte `ouvrir le carnet`, mais le `generated_asset` durable et la reponse utilisateur ne l'exposent pas.

**Problemes**
- Tours 2-3: violation de negation cible. Impact systeme: le flow peut produire un pending draft faux malgre correction explicite. Severite: red.
- Tour 5: violation de negation technique. Impact systeme: le resolver choisit une option interdite par le user. Severite: red.
- Tour 8: correction de contenu traitee comme perte de target. Impact systeme: etat operationnel trop fragile sur multi-tour. Severite: red.
- Tour 10: `confirmation_yes_with_adjustment` cree la carte malgre une phrase de reserve (`tant pis`, `elle aurait du garder ouvrir le carnet`). Impact systeme: acceptable seulement parce que `Oui vas-y cree-la` est explicite; il faut garder ce cas surveille. Severite: yellow.

**Fix propose**
- Ajouter une couche de `negative constraints` dans l'intake operationnel: tokens negatifs de cible et de technique doivent exclure les candidats correspondants.
- Stocker et fusionner proprement les slots connus dans les corrections: `target`, `technique`, `content_constraints`.
- Regenerer le draft depuis le dernier etat fusionne, puis verifier que la reponse visible contient les contraintes essentielles avant confirmation.

## Verdict Global

- Verdict: red
- Raison principale: le flow reussit l'execution finale, mais il ignore plusieurs corrections explicites et peut proposer/confirmer des drafts sur mauvaise cible ou mauvaise technique.
- Follow-up prioritaire: corriger la gestion multi-tour des corrections/negations dans `prepare_attack_card`, surtout `pas le bilan`, `pas terrain`, et les corrections de contenu qui ne doivent pas effacer la cible.
