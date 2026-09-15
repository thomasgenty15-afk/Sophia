# QA prepare_attack_card - Runs A/B

## Run A - 1. Contexte Du Test

- Date: 2026-05-16
- Run: run-a-attack-plan-action-r5
- Persona: Alex
- Objectif: verifier qu'une carte d'attaque peut etre preparee pour une action officielle du plan sans basculer en carte de defense ni executer avant validation.
- Trajectoire: update naturel sur une action du plan, demande explicite de carte d'attaque, choix de technique, brouillon, deux ajustements, validation, verification DB, restauration DB.
- Surfaces visees: dispatcher v2, active flow arbitrator, `prepare_attack_card`, draft review, confirmation, insert `user_attack_cards`, update `user_plan_items.attack_card_id`.
- Cadre IA reel: Supabase local, persona locale Alex, endpoint local `test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas d'appel direct executor, pas de staging/remote.
- Validite QA: valide. Messages improvises tour par tour apres lecture reponse + trace courte. Run retenu apres corrections de routage.

## Run A - 2. Tours De Conversation

### Tour 1

**User**
> Ce soir je veux faire la zone de déchargement, mais je sens que je vais encore minimiser le truc : “c’est juste un carnet et un stylo, ça peut attendre”.

**Sophia**
> Ah je vois le coup venir… “c’est juste” c’est le piège classique. 😅
>
> Ce soir, on vise pas la perfection: on fait seulement une version courte et “laidement efficace”.  
> Micro-décision: tu ouvres le carnet, tu écris 10 lignes maximum (tout ce qui te vient), sans trier, même si c’est flou.
>
> Tu minimises plutôt parce que tu n’as pas envie (A) ou parce que tu as peur que ça prenne trop de temps (B) ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: execution_breakdown
- route_reason: skill_entry_signal
- operation_flow_status: null
- operation_id: null
- executed_tools: []
- pending_confirmation: false
- durable_effect: none

### Tour 2

**User**
> Je veux plutôt en faire une carte d’attaque pour l’action du plan “Préparer ta zone de déchargement”. L’objectif est de couper l’excuse “ça peut attendre”, et j’ai besoin que tu m’aides à choisir la bonne technique.

**Sophia**
> C'est noté pour l'action « Préparer ta zone de déchargement ». Pour contrer l'excuse « ça peut attendre », je te propose trois options. Laquelle te semble la plus efficace pour toi ?
>
> 1. **Preparer le terrain** : pour rendre le geste si simple qu'il n'y a plus de débat.
> 2. **Le texte magique** : un court texte à relire pour recadrer tes pensées quand tu commences à négocier.
> 3. **Mot de bascule** : un mot simple à m'envoyer dès que tu sens que tu vas repousser, pour que je t'aide à basculer.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_attack_card
- route_reason: explicit_tool_intent_supersedes_active_conversation_skill
- operation_flow_status: ask_question
- operation_id: null
- executed_tools: []
- pending_confirmation: false
- durable_effect: blocked

### Tour 3

**User**
> Le texte magique. Je veux qu’il soit très concret : pas “je me motive”, plutôt “je sors le carnet et le stylo maintenant, et je note une ligne”.

**Sophia**
> Voici ton brouillon :
> 🪄 *Le texte magique*
> "Je sors le carnet et le stylo maintenant, et je note une ligne."
> Mode d'emploi : Lis ce texte dès que tu hésites, puis sors ton matériel sans réfléchir.
> On valide la création de ta carte ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_attack_card
- route_reason: active_tool_skill_continue
- operation_flow_status: pending_confirmation
- operation_id: 1be4438d-9c4d-4bad-b599-b1d673c07f7e
- executed_tools: []
- pending_confirmation: false
- durable_effect: blocked

### Tour 4

**User**
> Oui pour le fond, mais enlève le côté emoji/magique. Titre simple : “Une ligne maintenant”. Et garde exactement la phrase du texte.

**Sophia**
> Voici ton brouillon pour "Une ligne maintenant" :
> Technique : Le texte de recadrage
> Texte : Je sors le carnet et le stylo maintenant, et je note une ligne.
> Mode d'emploi : Lis ou recopie ce texte au moment où tu sens la résistance monter, puis fais le premier geste.
> Est-ce que cela te convient pour créer ta carte ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: execution_breakdown
- route_reason: active_conversation_skill_continue
- operation_flow_status: pending_confirmation_updated
- operation_id: a0db9afe-8f52-4bf5-86d6-316100722c9f
- executed_tools: []
- pending_confirmation: false
- durable_effect: blocked

### Tour 5

**User**
> Dernier ajustement : dans le mode d’emploi, évite “résistance monter”. Dis plutôt “quand je commence à négocier”. Le reste me va.

**Sophia**
> Voici ton brouillon :
> Titre : Une ligne maintenant
> Technique : Le texte de recadrage
> Texte : Je sors le carnet et le stylo maintenant, et je note une ligne.
> Mode d'emploi : Lis ou recopie ce texte quand je commence à négocier, puis fais le premier geste.
> Est-ce que ça te convient pour créer la carte ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: execution_breakdown
- route_reason: active_flow_defers_tool_skill_opportunity
- operation_flow_status: pending_confirmation_updated
- operation_id: e30278bb-ccdc-4a11-a663-6ad41f039fa8
- executed_tools: []
- pending_confirmation: false
- durable_effect: blocked

### Tour 6

**User**
> Oui, crée cette carte d’attaque pour cette action du plan.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Une ligne maintenant
> Technique : Le texte de recadrage
> Je sors le carnet et le stylo maintenant, et je note une ligne.
>
> Mode d'emploi : Lis ou recopie ce texte quand je commence à négocier, puis fais le premier geste.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque du plan pour la relire et l'utiliser. Si c'est une carte Mot de bascule, le mot peut etre remplace depuis cette zone; pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_attack_card
- route_reason: explicit_tool_intent_supersedes_active_conversation_skill
- operation_flow_status: executed
- operation_id: e30278bb-ccdc-4a11-a663-6ad41f039fa8
- executed_tools: [prepare_attack_card]
- pending_confirmation: false
- durable_effect: success

**Verification DB**
- Avant cleanup, carte creee: `user_attack_cards.id=31ab2ee5-cfb9-4dd7-a4ba-e850f8cb012c`.
- `plan_item_id`: `a6da07a3-55f0-463c-8ed0-c1d5a7f7961e`.
- `metadata.target.kind`: `plan_item`.
- `metadata.target.title`: `Préparer ta zone de déchargement`.
- `scope_kind`: `transformation`.
- Plan item apres creation: `attack_card_id=31ab2ee5-cfb9-4dd7-a4ba-e850f8cb012c`, `cards_status=ready`.
- Cleanup: carte supprimee, plan item restaure vers `attack_card_id=aaca7b51-338a-4c74-809e-49df9a1e4ce9`, `cards_status=ready`, `cards_generated_at=2026-05-13T16:20:46.838+00:00`.
- Post-cleanup: `remaining_created_cards=[]`, `plan_items_still_pointing_to_created_cards=[]`.

## Run A - 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia part d'un tour naturel avant la demande de carte.
- Elle propose des techniques courtes et compréhensibles au tour 2.
- Elle accepte deux corrections successives sans executer.
- Le brouillon final est court, actionnable et conforme au besoin humain: couper "ca peut attendre" par un premier geste concret.

**Problemes**
- Tour 3: l'emoji et le wording "magique" etaient un peu trop marques. Impact: faible, corrige au tour 4. Severite: green.

**Fix propose**
- Aucun bloquant. Garder une preference de style plus sobre pour les brouillons de carte d'attaque.

## Run A - 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 2 route vers `prepare_attack_card` malgre le skill conversationnel actif, apres correction de l'arbitre.
- Tours 4 et 5 affichent encore `response_owner=conversation_handler`, mais `operation_flow_status=pending_confirmation_updated` et `operation_id` montrent que le draft review du tool skill reste bien actif. Warning de trace non bloquant pour ce run.

**Skills / Operations / Tools**
- `prepare_attack_card` collecte la cible, la technique, le contenu et demande confirmation.
- Execution uniquement au tour 6 apres validation explicite.
- `executed_tools=[prepare_attack_card]` uniquement au tour 6.

**Memory / Effets durables**
- Effet durable conforme: carte attachee a la bonne action du plan.
- Pas de rattachement invente.
- Etat DB restaure apres run.

**Problemes**
- Warning trace: `response_owner` route peut rester conversationnel pendant une revision, meme quand l'operation runtime gere bien le brouillon. Impact systeme: observabilite imparfaite, pas d'effet durable faux. Severite: green.

**Fix propose**
- Optionnel: enrichir la trace courte pour exposer clairement `operation_flow_run.selected_handler` comme source effective pendant les revisions.

## Run A - Verdict Global

- Verdict: green
- Raison principale: carte d'attaque creee apres confirmation, rattachee au bon `plan_item_id`, puis DB restauree.
- Follow-up prioritaire: ameliorer l'observabilite du `response_owner` pendant les revisions.

## Run B - 1. Contexte Du Test

- Date: 2026-05-16
- Run: run-b-attack-free-r2
- Persona: Nina
- Objectif: verifier qu'une carte d'attaque libre peut etre preparee pour une action utile au plan mais hors action officielle, sans rattachement DB force.
- Trajectoire: update naturel hors plan, demande explicite de carte d'attaque libre, choix de technique, brouillon, corrections, validation, verification DB, restauration DB.
- Surfaces visees: dispatcher v2, `prepare_attack_card`, target libre `personal_action`, confirmation, insert `user_attack_cards` sans update `user_plan_items`.
- Cadre IA reel: Supabase local, persona locale Nina, endpoint local `test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas d'appel direct executor, pas de staging/remote.
- Validite QA: valide. Run retenu apres correction du message de localisation des cartes libres.

## Run B - 2. Tours De Conversation

### Tour 1

**User**
> Je vois un petit levier qui n’est pas dans mon plan officiel : après le dîner, si je garde le téléphone avec moi en allant au canapé, je scrolle et l’envie de grignoter revient. Je pourrais le déposer dans l’entrée avant de m’asseoir.

**Sophia**
> Ah oui, je vois très bien le piège : téléphone + canapé = mode “grignotage automatique” 😅 Alors que déposer le tel dans l’entrée, c’est hyper concret et immédiat.
>
> Tu veux qu’on utilise la Carte de defense (surface “Carte de defense”) pour verrouiller ce moment après le dîner / canapé ?

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: normal_reply_default
- operation_flow_status: null
- operation_id: null
- executed_tools: []
- pending_confirmation: false
- durable_effect: none

### Tour 2

**User**
> Je préfère une carte d’attaque libre, justement. Pas rattachée au plan : l’idée est d’attaquer le décor avant le canapé, avec “téléphone posé dans l’entrée”.

**Sophia**
> C'est noté pour cette attaque libre : attaquer le décor avant de t'installer au canapé. Pour ton téléphone dans l'entrée, est-ce que tu veux partir sur la technique 'Preparer le terrain' ou préfères-tu une 'Ancre visuelle' ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_attack_card
- route_reason: tool_skill_intent_start
- operation_flow_status: ask_question
- operation_id: null
- executed_tools: []
- pending_confirmation: false
- durable_effect: blocked

### Tour 3

**User**
> Préparer le terrain. Le moment précis, c’est quand je quitte la cuisine après avoir débarrassé : si le téléphone est encore dans ma main à ce moment-là, je l’emmène au canapé.

**Sophia**
> Voici ton brouillon : *Le sas de la cuisine*
> Technique : Préparer le terrain
> Dès que la cuisine est propre, le téléphone reste loin du canapé.
> Pose ton téléphone hors de portée dès que tu quittes la cuisine, avant de t'installer.
> On valide cette carte ?

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: product_help_inline_resume_active_tool_skill
- operation_flow_status: pending_confirmation
- operation_id: a2be78d0-5e4c-4a21-9a3e-61bc19d4c86d
- executed_tools: []
- pending_confirmation: false
- durable_effect: blocked

### Tour 4

**User**
> Pas “cuisine propre”, ça met trop de condition. Remplace par : “quand je sors de la cuisine”. Et précise le vide-poche de l’entrée, près des clés, pas juste hors de portée.

**Sophia**
> Voici ton nouveau brouillon :
>
> *Attaquer le décor avant le canapé*
> Technique : Préparer le terrain
> Asset : Téléphone au vide-poche (entrée, près des clés) dès la sortie de cuisine.
> Dès que tu sors de la cuisine, dépose ton téléphone à l'endroit prévu avant d'aller vers le salon.
>
> Ça te convient pour créer la carte ?

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: skill_entry_signal
- operation_flow_status: pending_confirmation_updated
- operation_id: 3d4f8e62-419a-4937-8fae-710d9b6435a6
- executed_tools: []
- pending_confirmation: false
- durable_effect: blocked

### Tour 5

**User**
> Oui, le contenu est bon. Fais juste le titre plus court : “Téléphone au vide-poche”. Après ça je pourrai valider.

**Sophia**
> Titre : Téléphone au vide-poche
> Technique : Préparer le terrain
> Action : Téléphone au vide-poche de l’entrée, près des clés.
> Prépare le terrain en sortant de la cuisine, puis laisse l'environnement t'aider à démarrer.
> Est-ce que ça te convient pour créer ta carte ?

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: normal_reply_default
- operation_flow_status: pending_confirmation_updated
- operation_id: 4b33ddc5-fa76-445f-a01c-8c9b908d1bed
- executed_tools: []
- pending_confirmation: false
- durable_effect: blocked

### Tour 6

**User**
> Oui, crée cette carte d’attaque libre.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Téléphone au vide-poche
> Technique : Préparer le terrain
> Téléphone au vide-poche de l’entrée, près des clés.
>
> Mode d'emploi : Prépare le terrain en sortant de la cuisine, puis laisse l'environnement t'aider à démarrer.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Si c'est une carte Mot de bascule, le mot peut etre remplace depuis cette zone; pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_attack_card
- route_reason: tool_skill_intent_start
- operation_flow_status: executed
- operation_id: 4b33ddc5-fa76-445f-a01c-8c9b908d1bed
- executed_tools: [prepare_attack_card]
- pending_confirmation: false
- durable_effect: success

**Verification DB**
- Avant cleanup, carte creee: `user_attack_cards.id=02733893-6b0c-4dc9-be2e-a03ee1a63609`.
- `plan_item_id`: null.
- `metadata.target.kind`: `personal_action`.
- `metadata.target.title`: `Attaquer le décor avant le canapé`.
- `scope_kind`: `out_of_plan`.
- Aucun `user_plan_items.attack_card_id` modifie pendant le run.
- Cleanup: carte supprimee, aucun plan item a restaurer.
- Post-cleanup: `remaining_created_cards=[]`, `plan_items_still_pointing_to_created_cards=[]`.

## Run B - 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia accepte la correction "attaque libre, pas defense" au tour 2.
- Elle pose une question courte de technique au lieu de creer directement.
- Elle integre les corrections successives sur condition, lieu exact et titre.
- Le message final localise la carte libre dans `Ressources > Cartes d'attaque`, sans mention "du plan".

**Problemes**
- Tour 1: Sophia propose une carte de defense car le user decrit un risque de rechute. Impact faible: le user n'avait pas encore demande une attaque, et Sophia bascule correctement au tour 2. Severite: green.
- Tours 3-5: `response_owner` de trace indique parfois `product_help` ou `normal_reply` alors que l'operation runtime gere bien le brouillon. Impact utilisateur nul, impact observabilite faible. Severite: green.

**Fix propose**
- Aucun bloquant. Pour l'observabilite, exposer le owner effectif du runtime operation dans la trace courte.

## Run B - 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 2 demarre `prepare_attack_card` sur intention explicite.
- La mention "libre, pas rattachee au plan" est preservee jusqu'a l'effet durable.
- Les revisions restent dans l'operation runtime malgre un owner route parfois non-tool.

**Skills / Operations / Tools**
- `prepare_attack_card` collecte le contexte libre, la technique, le moment d'usage et le contenu.
- Execution uniquement apres confirmation explicite au tour 6.
- `executed_tools=[prepare_attack_card]` uniquement au tour 6.

**Memory / Effets durables**
- Effet durable conforme: carte libre `scope_kind=out_of_plan`, `plan_item_id=null`.
- Aucun faux rattachement DB a une action du plan.
- Etat DB restaure apres run.

**Problemes**
- Aucun probleme systeme bloquant observe sur le run retenu.

**Fix propose**
- Aucun correctif obligatoire restant.

## Run B - Verdict Global

- Verdict: green
- Raison principale: carte libre creee apres confirmation, sans `plan_item_id`, puis supprimee au cleanup.
- Follow-up prioritaire: aucun bloquant.

## Corrections Appliquees Avant Runs Retenus

- `supabase/functions/sophia-brain/routers/active_flow_arbitrator.ts`: l'intention tool explicite et non ambigue est maintenant traitee avant l'abandon d'un skill conversationnel actif. Cela corrigeait le cas ou le tour demandait clairement `prepare_attack_card` mais restait en `normal_reply`.
- `supabase/functions/sophia-brain/router/run.ts`: le message final de creation d'une carte d'attaque utilise maintenant `Ressources > Cartes d'attaque` pour les cibles libres et garde `Ressources > Cartes d'attaque du plan` pour les actions du plan.
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/executor.ts`: meme correction de libelle de localisation cote executor.
- Tests ajoutes/actualises dans `routers.test.ts` et `prepare_attack_card/tests.ts`.

## Verification Technique

- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts supabase/functions/sophia-brain/routers/routers.test.ts`: 20 passed.
- `deno check supabase/functions/sophia-brain/index.ts supabase/functions/test-send-message/index.ts`: passed.
- Runtime local redemarre apres corrections.

## Verdict Global

- Verdict: green
- Raison principale: les deux runs retenus respectent le flow `prepare_attack_card`, avec confirmation avant execution et effets DB exacts.
- Follow-up prioritaire: ameliorer la lisibilite de la trace courte pendant les revisions, sans impact fonctionnel observe.
