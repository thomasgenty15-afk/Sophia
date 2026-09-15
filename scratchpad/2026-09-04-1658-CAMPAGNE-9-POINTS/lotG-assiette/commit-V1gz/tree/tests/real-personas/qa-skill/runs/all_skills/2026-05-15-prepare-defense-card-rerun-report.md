# prepare_defense_card - QA rerun local - 2026-05-15

## Run A - Action du plan

## 1. Contexte Du Test

- Date: 2026-05-15
- Run: `run-a-plan-action-r4`
- Persona: Alex
- Objectif: creer une carte de defense rattachee a l'action du plan `Faire le sas de dechargement`.
- Trajectoire: conversation normale, demande explicite de carte, clarification du moment/piege, revisions, confirmation, verification DB.
- Surfaces visees: dispatcher, `prepare_defense_card`, pending confirmation, execution, `user_defense_cards`, `user_plan_items`.
- Cadre IA reel: Supabase local, `test-send-message`, `force_full_ai=true`, JWT non affiche, pas de renderer deterministe, pas d'appel direct executor.
- Validite QA: valide.

## 2. Tours De Conversation

### Tour 1

**User**
> Ce soir je prépare le sas de déchargement, et je vois déjà le point fragile : la minute juste après le carnet. Je voulais juste t’en parler avant de le faire.

**Sophia**
> Oui, je vois exactement le genre de piège… la “minute après” quand le mental retombe d’un coup 😅
>
> Pour que ça reste solide ce soir, fais simple :
> 1) juste après le carnet, tu te donnes un micro-mouvement (eau, étirement 30 sec, ouvrir la fenêtre)
> 2) puis tu notes une seule phrase “ce que je lâche maintenant” (pas plus)
> 3) et tu clôtures par un repère concret (“je m’arrête là, prochaine étape demain”)
>
> Tu veux que ton sas soit plutôt calme/respiration, ou plutôt “tri + rangement” ? 🌙

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: execution_breakdown
- route_reason: skill_entry_signal
- operation_flow_status: null
- operation_id: null
- executed_tools: []
- pending_confirmation: null
- durable_effect: none

### Tour 2

**User**
> Je veux plutôt une carte de défense pour l’action du sas de déchargement. Je veux protéger cette minute-là, mais construisons-la proprement.

**Sophia**
> D'accord pour le sas de déchargement. Pour bien construire cette carte, dis-moi : qu'est-ce qui se passe exactement à ce moment-là qui risque de te faire déraper ou de te faire zapper l'exercice ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: explicit_tool_intent_supersedes_active_conversation_skill
- operation_flow_status: ask_question
- operation_id: null
- executed_tools: []
- pending_confirmation: null
- durable_effect: none

### Tour 3

**User**
> Ce n’est pas au démarrage. C’est vraiment à la fin : je ferme le carnet, je le pose, et là ma main part presque toute seule vers le téléphone sur la table basse.

**Sophia**
> Voici ta carte de défense :
> Le moment : Quand je ferme mon carnet et que je le pose sur la table basse
> Le piège : Ma main part toute seule vers le téléphone
> Mon geste : Je laisse mon téléphone dans une autre pièce avant de commencer
> Plan B : Je fais 3 respirations profondes les mains à plat sur la table
> On valide ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: active_tool_skill_continue
- operation_flow_status: pending_confirmation
- operation_id: 9cb78095-585a-4667-b580-20a51b7836a7
- executed_tools: []
- pending_confirmation: draft awaiting user validation
- durable_effect: none

### Tour 4

**User**
> Le moment est bon, mais je ne veux pas “avant de commencer” ni respirations. Le piège précis, c’est la pensée : si je ne regarde pas maintenant, je vais oublier un truc important. Mon geste doit être une ligne max dans le carnet, puis téléphone dans l’entrée.

**Sophia**
> Voici ta carte de défense :
> Le moment : Fin du sas de déchargement
> Le piège : Si je ne regarde pas maintenant, je vais oublier un truc important
> Mon geste : Noter l'idée en une ligne max dans le carnet, puis poser le téléphone dans l'entrée
> Plan B : Laisser le téléphone dans l'entrée et s'éloigner
> On valide ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: explicit_tool_intent_supersedes_active_conversation_skill
- operation_flow_status: pending_confirmation_updated
- operation_id: 543356aa-e8ba-4690-b72b-c3568647ff92
- executed_tools: []
- pending_confirmation: updated draft awaiting user validation
- durable_effect: none

### Tour 5

**User**
> Plan B, je le veux plus réaliste : si j’ai déjà le téléphone en main, je le pose dans l’entrée sans ouvrir d’appli, puis je reviens fermer le carnet. Tu peux garder le reste.

**Sophia**
> Voici ta carte de défense :
> Le moment : Fin du sas de déchargement
> Le piège : Si je ne regarde pas maintenant, je vais oublier un truc important
> Mon geste : Fermer le carnet et s'éloigner du téléphone
> Plan B : Si téléphone en main : le poser dans l'entrée sans ouvrir d'appli, puis revenir fermer le carnet.
> On valide ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: explicit_tool_intent_supersedes_active_conversation_skill
- operation_flow_status: pending_confirmation_updated
- operation_id: 58d629f0-075a-4ed8-a1c0-2fd66718c35f
- executed_tools: []
- pending_confirmation: updated draft awaiting user validation
- durable_effect: none

### Tour 6

**User**
> Pas encore : “s’éloigner du téléphone” est trop vague. Mon geste doit rester : j’écris une ligne max dans le carnet, puis je pose le téléphone dans l’entrée. Ensuite oui, on pourra valider.

**Sophia**
> Voici ta carte de défense :
> Le moment : Fin du sas de dechargement
> Le piège : Si je ne regarde pas maintenant, je vais oublier un truc important
> Mon geste : Ecrire une ligne max dans le carnet puis poser le telephone dans l entree
> Plan B : Mettre le telephone dans une autre piece
> On valide ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: tool_skill_intent_start
- operation_flow_status: pending_confirmation_updated
- operation_id: 81b3bdd0-ea18-47a0-82f4-90f97381952b
- executed_tools: []
- pending_confirmation: updated draft awaiting user validation
- durable_effect: none

### Tour 7

**User**
> Garde ce geste, mais remets le Plan B exact : si j’ai déjà le téléphone en main, je le pose dans l’entrée sans ouvrir d’appli, puis je reviens fermer le carnet. Après ça je valide.

**Sophia**
> Voici ta carte de défense :
> Le moment : Fin du sas de déchargement
> Le piège : Si je ne regarde pas maintenant, je vais oublier un truc important
> Mon geste : Ecrire une ligne max dans le carnet, puis poser le telephone dans l'entree.
> Plan B : Si telephone en main, le poser dans l'entree sans ouvrir d'appli, puis fermer le carnet.
> On valide ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: tool_skill_intent_start
- operation_flow_status: pending_confirmation_updated
- operation_id: 66c5f624-f71f-4235-9836-9ab6c8124e0b
- executed_tools: []
- pending_confirmation: updated draft awaiting user validation
- durable_effect: none

### Tour 8

**User**
> Oui, valide et crée cette carte de défense.

**Sophia**
> C'est fait. J'ai créé la carte de défense "Faire le sas de déchargement" : Ecrire une ligne max dans le carnet, puis poser le telephone dans l'entree.
>
> Tu peux la retrouver dans Ressources > Cartes de defense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, je peux aussi en preparer une nouvelle version apres confirmation.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: tool_skill_intent_start
- operation_flow_status: executed
- operation_id: 66c5f624-f71f-4235-9836-9ab6c8124e0b
- executed_tools: [prepare_defense_card]
- pending_confirmation: null
- durable_effect: `user_defense_cards.id=4d8c29cb-d246-4eac-8818-1e7b99142edf`

**Verification DB**
- Carte creee: `4d8c29cb-d246-4eac-8818-1e7b99142edf`
- `plan_item_id`: `dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- Action: `Faire le sas de déchargement`
- `user_plan_items.defense_card_id`: `4d8c29cb-d246-4eac-8818-1e7b99142edf`
- Format durable: situation/signal/defense_response/plan_b correspondent au draft final.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La conversation demarre naturellement avant la demande de carte.
- Sophia pose une question utile au tour 2.
- Les corrections utilisateur sont acceptees sans execution prematuree.
- La localisation Ressources est correcte et Sophia ne promet pas de modifier la carte depuis le chat.

**Problemes**
- Tours 3, 5, 6: Sophia infere parfois un geste ou un Plan B non demande. Impact: l'utilisateur doit corriger plusieurs fois. Severite: yellow, non bloquant car aucune creation n'a lieu avant confirmation.

**Fix propose**
- Contraindre le generateur a conserver plus strictement les champs utilisateur deja corriges lors des revisions.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- `prepare_defense_card` est selectionne des la demande explicite et reste actif.
- Pas de bascule vers `prepare_attack_card`.

**Skills / Operations / Tools**
- Collecte des slots par sortie structuree IA.
- Brouillon au format plateforme.
- Execution uniquement apres confirmation explicite.

**Memory / Effets durables**
- Effet DB correct.
- Carte rattachee au bon `plan_item_id`.

**Problemes**
- Aucun probleme bloquant sur le run final.

**Fix propose**
- Ajouter un test de regression sur la conservation du Plan B pendant une revision de brouillon.

## Verdict Global

- Verdict: green
- Raison principale: creation reelle locale apres confirmation, avec rattachement DB exact a l'action du plan.
- Follow-up prioritaire: durcir la stabilite des champs corriges entre deux brouillons.

---

## Run B - Contexte libre hors plan

## 1. Contexte Du Test

- Date: 2026-05-15
- Run final tente: `run-b-free-context-alex-r1`
- Persona: Alex
- Objectif: creer une carte de defense libre, sans rattachement a une action officielle du plan.
- Trajectoire: conversation normale, demande explicite de carte libre, clarification demandee par Sophia.
- Surfaces visees: recommendation operation, `prepare_defense_card`, active intake, execution DB libre.
- Cadre IA reel: Supabase local, `test-send-message`, `force_full_ai=true`, pas de fallback deterministe.
- Validite QA: invalide pour verdict green, blocage technique local au tour 3.

## 2. Tours De Conversation

### Tour 1

**User**
> À côté du sas du soir, je remarque un truc : si je garde le téléphone sur le canapé après le dîner, je repars facilement dans les vidéos. Après ça je grignote un peu sans y penser. Je voulais juste te le poser comme observation.

**Sophia**
> C'est une super observation. Le combo téléphone sur le canapé après le dîner, c'est un vrai toboggan vers le grignotage sans fin, bien vu de l'avoir capté en direct 🎯
>
> Puisque tu as identifié ce piège précis pour ton sas du soir, est-ce que tu veux qu'on se prépare une Carte de défense pour t'aider à casser ce réflexe ?

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: normal_reply_default
- operation_flow_status: null
- operation_id: null
- executed_tools: []
- pending_confirmation: null
- durable_effect: none

### Tour 2

**User**
> Oui, je veux une carte de défense, mais pas rattachée au sas du plan. C’est un contexte libre : canapé après dîner, téléphone, vidéos, grignotage.

**Sophia**
> Ok, je note ce contexte libre. Qu'est-ce qui te pousse exactement à prendre le téléphone et à regarder des vidéos dans ce moment-là ? Et quel est ton objectif principal avec cette carte de défense ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: tool_skill_intent_start
- operation_flow_status: ask_question
- operation_id: null
- executed_tools: []
- pending_confirmation: null
- durable_effect: none

### Tour 3

**User**
> Le moment exact, c’est après le dîner quand je m’assois “juste cinq minutes”. Le piège, c’est que je me dis que je peux regarder une vidéo courte, puis l’algorithme m’embarque et je vais chercher un truc à grignoter.

**Sophia**
> Reponse non recue.

**Trace courte**
- http_status: none
- response_owner: null
- selected_handler: null
- route_reason: null
- operation_flow_status: null
- operation_id: null
- executed_tools: []
- pending_confirmation: unknown
- durable_effect: none observed
- incident: `TypeError: fetch failed`, socket closed by local Edge runtime before response.

**Tentatives precedentes et corrections**
- `run-b-free-context-r2/r3/r4`: le routage affichait `prepare_defense_card` mais aucun `operation_flow_run`; le companion fabriquait une carte hors format.
- Correction appliquee: une recommandation defense avec continuation structuree ne retombe plus en companion.
- `run-b-free-context-r5`: carte creee mais mauvais `plan_item_id` rattache a `Faire le choix du brut`.
- Correction appliquee: conservation de l'attachement libre pendant revision et insertion DB defensive, seul `kind=plan_item` peut ecrire `plan_item_id`.
- `run-b-free-context-r7`: apres `ask_question`, le tour suivant retombait en `product_help`.
- Correction appliquee: persistance de `__active_tool_skill_intake` depuis la branche recommandation defense.
- `run-b-free-context-r10/r11`: incidents HTTP 502/socket close pendant relance.

**Verification DB**
- Aucun effet durable valide pour le Run B final.
- Le dernier run exploitable partiel (`run-b-free-context-alex-r1`) a bien identifie un `attachment.kind=free_risk_context` avec `plan_item_id=null` au tour 2, mais le runtime a bloque avant creation.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 1: demarrage conversationnel normal.
- Tour 2: Sophia comprend la demande libre hors plan et pose une question courte et utile.

**Problemes**
- Tour 3: aucune reponse recue a cause du runtime local. Impact: conversation interrompue, run incomplet. Severite: red.

**Fix propose**
- Stabiliser le runtime local Edge avant nouvelle relance; reprendre avec un nouveau scope propre pour obtenir 6+ tours visibles.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 2 correct: `prepare_defense_card`, `ask_question`, `attachment.kind=free_risk_context`, `plan_item_id=null`.

**Skills / Operations / Tools**
- Le flow ne va pas jusqu'au brouillon final ni a l'execution sur le run final a cause du crash local.

**Memory / Effets durables**
- Pas de creation DB valide pour Run B final.

**Problemes**
- Tour 3: socket fermee par le runtime Edge local; les containers Supabase hors DB disparaissent par moments. Impact systeme: impossible de produire un run conversationnel complet et verifiable. Severite: red.

**Fix propose**
- Redemarrer/stabiliser Supabase local puis relancer Run B depuis un scope neuf.
- Ajouter test de regression sur la branche recommandation defense: `ask_question` doit persister l'intake actif.
- Ajouter test de regression DB: attachment libre doit rester `plan_item_id=null` apres revisions.

## Verdict Global

- Verdict: red
- Raison principale: Run B non finalisable a cause d'un blocage technique local recurrent avant 6 tours et avant verification DB.
- Follow-up prioritaire: stabiliser le runtime Edge local, puis relancer Run B complet; Run A est deja green.
