# QA Operation Suggestion - Test 1.5 - Alex - 2026-05-13 - attack-card-hard-10t-r5

## 1. Contexte Du Test

- Date: 2026-05-13 Europe/Paris
- Run: `attack-card-hard-10t-r5`
- Persona: Alex
- Connexion: `tests/real-personas/alex/connection.json`, JWT via `bash scripts/get-jwt.sh alex`
- Objectif: relancer le scenario difficile 10 tours apres correction des bugs observes en `attack-card-hard-10t-r1`: negation cible, negation technique, correction de contenu, cleanup post-execution.
- Trajectoire: demande vague -> cible avec exclusions -> technique avec exclusion -> correction de draft -> confirmation -> aide produit post-creation -> stop.
- Surfaces visees: dispatcher `operation_intent`, `operation_flow`, handler `prepare_attack_card`, correction pending, confirmation, DB `user_attack_cards`, product_help post-creation.
- Cadre IA reel: Supabase local, endpoint local `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback `processMessage`, aucun staging/remote.
- Validite QA: valide. Les runs intermediaires `r2-r4` ont servi a attraper/corriger un bug post-creation; `r5` est la relance propre complete apres ces corrections.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-05-13-test1-attack-card-hard-10t-r5.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-05-13-test1-attack-card-hard-10t-r5.summary.json`
- Durable: `tests/real-personas/alex/runs/operations/2026-05-13-test1-attack-card-hard-10t-r5.durable.json`

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
- safety: `risk_band=none`
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
> 1. Preparer le terrain (recommandee): option simple pour faciliter le demarrage. Exemple pour "Faire le sas de déchargement": preparer l'environnement avant le moment critique.
> 2. Le texte magique: option utile si la resistance est surtout mentale. Exemple pour "Faire le sas de déchargement": un texte court a relire quand tu negocies avec toi-meme.
>
> Reponds avec le nom ou le numero.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=ask_question`, slot `technique`, target `Faire le sas de déchargement`
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 3

**User**
> Je sais pas moi. Pas un truc de terrain, le truc contre mes excuses et ma negociation. Tu choisis pas au hasard non plus.

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
- operation: `status=pending_confirmation`, `operation_id=4cdbd4b3-1938-4518-83b3-6465738649e7`, technique `texte_recadrage`
- pending_confirmation: draft visible, no execution
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**User**
> Bof. C'est trop vague. Ajoute que le premier geste c'est ouvrir le carnet et noter une ligne, pas ton blabla general.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance. Mon premier geste: ouvrir le carnet, puis noter une ligne.
>
> Mode d'emploi: Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `confirmation_correction_to_pending`
- safety: `risk_band=none`
- direct_effects: none
- operation: `status=pending_confirmation_updated`, `operation_id=4434b519-b10f-46de-9fb6-6054e844cc9b`
- pending_confirmation: target/technique conserves, contenu corrige visible
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 5

**User**
> Oui vas-y cree-la. Cette fois c'est la bonne.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Carte d'attaque - Faire le sas de déchargement
> Technique : Le texte magique
> Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance. Mon premier geste: ouvrir le carnet, puis noter une ligne.
>
> Mode d'emploi : Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque du plan pour la modifier ou l'imprimer.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes`
- safety: `risk_band=none`
- direct_effects: `prepare_attack_card=success`
- operation: `status=executed`, `operation_id=4434b519-b10f-46de-9fb6-6054e844cc9b`, `attack_card_id=2779360a-2ae0-4c8e-81f5-745848f56907`
- pending_confirmation: cleared
- memory_plan: not material to the turn
- executed_tools: `["prepare_attack_card"]`
- durable_effect: attack card written and linked to target plan item

Durable DB observe:

- `user_attack_cards.id=2779360a-2ae0-4c8e-81f5-745848f56907`
- `user_attack_cards.plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- `content.techniques[0].technique_key=texte_recadrage`
- `content.techniques[0].generated_result.generated_asset=Je n'ai pas besoin de negocier avec l'idee de faire le sas de déchargement, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance. Mon premier geste: ouvrir le carnet, puis noter une ligne.`
- `content.operation_draft.instruction=Version minuscule : ouvrir le carnet, puis noter une ligne.`
- `user_plan_items.id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- `user_plan_items.attack_card_id=2779360a-2ae0-4c8e-81f5-745848f56907`
- `user_plan_items.cards_status=ready`

### Tour 6

**User**
> Ok, et je la retrouve ou exactement ? Je vais pas chercher pendant dix minutes.

**Sophia**
> Dans le dashboard, tu vas à Dashboard > Plan. Ensuite, tu sélectionnes la transformation dans la colonne de gauche, puis tu ouvres l’onglet Plan pour voir le niveau actif, les semaines et ce qui est lié.
>
> Par contre, les bilans hebdos ne se saisissent pas dans le Plan: ils se font par message WhatsApp le dimanche.
>
> Tu parles de retrouver la carte d’attaque “sas de déchargement” dans Plan, ou tu cherches plutôt où saisir/modifier une action ?

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `risk_band=none`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 7

**User**
> Non, je parle de la carte d'attaque que tu viens de creer. Tu m'as dit Ressources, donc c'est ou ?

**Sophia**
> Ah ok, je vois le souci. Dans le dashboard, les cartes d’attaque, c’est plutôt dans les sections “Ressources” (pas dans “Plan”).
>
> Là où je te guide exactement :
> 1) Dashboard
> 2) Ressources
> 3) cherche “sas de déchargement” (ou “carte d’attaque” si y’a un filtre)
>
> Côté “Plan”, lui, c’est surtout pour voir le niveau actif/semaines/habitudes, et les bilans hebdo ne s’y ajoutent pas (ils se font par WhatsApp le dimanche).
>
> Tu me dis tu es déjà dans “Dashboard” et tu vois “Ressources” quelque part, oui ou non ?

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `risk_band=none`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 8

**User**
> Oui je vois Ressources. Elle contient bien ouvrir le carnet et noter une ligne ou tu l'as encore perdu ?

**Sophia**
> Oui, elle doit bien contenir ça : le texte magique + la consigne “Mon premier geste: ouvrir le carnet, puis noter une ligne”.
>
> Si tu ne la vois pas exactement, c’est juste que le nom peut varier (par ex. “sas de déchargement” vs “carte d’attaque”), mais le contenu doit être le même.
>
> Tu me confirmes ce que tu vois quand tu ouvres la carte (titre exact ou première ligne) ?

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `risk_band=none`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 9

**User**
> Bon resume-moi la carte en une phrase, pas un roman.

**Sophia**
> Je n’ai pas à négocier: je fais le premier geste maintenant, et mon premier geste c’est ouvrir le carnet et noter une ligne.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `risk_band=none`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 10

**User**
> Ok stop, c'est bon. Ne cree rien d'autre.

**Sophia**
> Ok, compris. Stop. J’arrête là.
>
> Tu veux juste que je valide que tu as déjà trouvé la carte “sas de déchargement” et son texte, oui ou non ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- route_reason: `normal_reply_default`
- safety: `risk_band=none`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: Sophia demande une cible au lieu de creer une carte vague; `Faire le sas de déchargement` arrive en premier.
- Tour 2: elle respecte `pas le bilan` et `pas la zone`; la cible est bien `Faire le sas de déchargement`.
- Tour 3: elle respecte `pas terrain` et choisit `Le texte magique` avec une formulation naturelle.
- Tour 4: elle conserve cible/technique pendant une correction de contenu et ajoute `ouvrir le carnet, puis noter une ligne` dans le draft visible.
- Tour 5: elle execute uniquement apres confirmation explicite et renvoie la carte avec l'emplacement Ressources.
- Tours 6-10: aucune nouvelle operation de carte n'est lancee apres execution.

**Problemes**
- Tour 6: Sophia donne d'abord `Dashboard > Plan`, alors que le bon chemin attendu juste apres la creation est `Ressources > Cartes d'attaque du plan`. Impact: friction produit, le user doit corriger. Severite: yellow.
- Tour 7: elle se corrige vers Ressources, mais ajoute des details inutiles sur les bilans hebdo. Impact: bruit conversationnel. Severite: yellow leger.
- Tour 10: apres `stop`, elle pose encore une question de validation. Impact: petite friction de cloture. Severite: yellow leger.

**Fix propose**
- Pour une question post-creation sur une carte d'attaque, repondre directement: `Dashboard > Ressources > Cartes d'attaque du plan`, sans repasser par l'aide Plan ni les bilans.
- Quand le user dit `stop` / `ne cree rien d'autre`, cloturer sans question supplementaire.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tours 1-4: `operation_flow/prepare_attack_card` garde le bon contexte et gere les corrections.
- Tour 5: `pending_confirmation/execute_confirmed` execute le tool apres oui explicite.
- Tours 6-9: le post-creation route en `product_help`, pas en nouvelle operation.
- Tour 10: retour en `normal_reply`, aucun side effect.

**Skills / Operations / Tools**
- `prepare_attack_card` respecte les negations cible et technique.
- La correction de draft conserve les slots `target` + `technique` et modifie seulement le contenu.
- `prepare_attack_card` execute une seule fois, au tour 5.

**Memory / Effets durables**
- Carte creee avec `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`.
- `user_plan_items.attack_card_id=2779360a-2ae0-4c8e-81f5-745848f56907`.
- L'asset durable contient bien `Mon premier geste: ouvrir le carnet, puis noter une ligne.`

**Problemes**
- Tour 6: `product_help` donne une aide produit initiale imprecise. Impact systeme: mauvais contenu d'aide, mais pas de side effect faux. Severite: yellow.

**Fix propose**
- Ajouter une intention/branche product_help specifique `attack_card_location` qui utilise la source de verite du flow d'execution: `Ressources > Cartes d'attaque du plan`.

## Verdict Global

- Verdict: yellow
- Raison principale: les bugs rouges du flow carte d'attaque sont corriges, mais l'aide produit post-creation reste imparfaite.
- Follow-up prioritaire: corriger la reponse product_help pour l'emplacement exact des cartes d'attaque et la cloture apres `stop`.
