# Global Normal Conversation 15T - N2 Strict R9

## 1. Contexte Du Test

- Date: 2026-05-22
- Run: `global15_20260522_n2_strict_r9`
- Persona: user QA temporaire local `05322977-6e96-4dc8-864a-878bfddafefa`, créé via Auth local.
- Objectif: simuler une conversation normale de 15 tours pour tester la coexistence dispatcher, mémoire, skills conversationnels, tool skills, rappels, product help, préférences coach et réactions émotionnelles.
- Trajectoire: fatigue du soir -> action minimale -> demande carte de défense -> incidents runtime/retry -> rappel ponctuel -> aide produit rappel -> repère mémoire conversationnelle -> préférence coach -> action immédiate -> réparation émotionnelle -> récap final.
- Surfaces visées: `execution_breakdown`, `prepare_defense_card`, `create_one_shot_reminder`, `product_help`, mémoire conversationnelle, `update_coach_preferences`, `emotional_repair`, arbitration dispatcher.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer déterministe, aucun fallback direct.
- Validité QA: run conduit tour par tour, non pré-scripté. Valide comme run QA red avec incidents techniques inclus: trois tours ont reçu HTTP 502 pendant des redémarrages du runtime local, puis la conversation a repris sans reconstruire les réponses.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia, journée longue. Je viens de rentrer et j'ai juste besoin de ne pas laisser ma soirée partir n'importe comment: ranger mon assiette, préparer mon sac pour demain, et arrêter de scroller. Aide-moi à commencer petit.

**Sophia**
> Ah ouais journée longue… normal que ton cerveau veuille juste scroller 😅🧠 On fait simple, petit et concret.
>
> 1) Assiette: tu la ranges dès maintenant (1 minute max).  
> 2) Sac: mets juste dedans ce qui est “indispensable” pour demain (au choix: clés + ce que tu portes).  
> 3) Scroll: pose un “frein” 5 minutes: lance une minuterie et quand ça sonne, tu redécides.
>
> Tu veux commencer par l’assiette ou par le sac ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: []
- operation: none
- executed_tools: []
- durable_effect: none

### Tour 2

**User**
> Je commence par l'assiette. Le vrai moment dangereux, c'est juste après: je me rassois, j'ai le téléphone en main, et je relance TikTok. Est-ce que tu peux me préparer une carte de défense pour ce moment-là ?

**Sophia**
> C'est le piège classique du "juste après", je vois exactement le moment dont tu parles. 
>
> Je peux t'aider à préparer ça. On va identifier ton geste de secours : au moment où tes fesses touchent le canapé ou la chaise avec le téléphone en main, quel micro-geste de moins de 30 secondes on pourrait décider ensemble pour casser la boucle ? 
>
> Une fois qu'on sera calés sur le contenu, tu pourras retrouver ta carte dans l'onglet Ressources de ton dashboard pour l'utiliser dès que le piège se présente. 📱

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `product_help`
- route_reason: `skill_handoff_requested`
- safety: `low`
- direct_effects: []
- operation: expected `prepare_defense_card`, got product-help flavored conversation
- executed_tools: []
- durable_effect: none

### Tour 3

**User**
> Le micro-geste: je verrouille l'écran et je pose le téléphone sur la commode de l'entrée avant de me rasseoir. Le piège c'est vraiment TikTok automatique.

**Sophia**
> Réponse vide.

**Trace courte**
- http_status: 502
- durable_effect: none observed
- incident: runtime local en redémarrage

### Tour 4

**User**
> Je retente: le micro-geste pour la carte, c'est verrouiller l'écran puis poser le téléphone sur la commode de l'entrée avant de me rasseoir. Le piège c'est TikTok automatique.

**Sophia**
> Réponse vide.

**Trace courte**
- http_status: 502
- durable_effect: none observed
- incident: retry échoué pendant redémarrage runtime

### Tour 5

**User**
> Je retente encore après l'erreur: pour la carte, le micro-geste c'est verrouiller l'écran puis poser le téléphone sur la commode de l'entrée avant de me rasseoir. Le piège, c'est TikTok automatique.

**Sophia**
> Réponse vide.

**Trace courte**
- http_status: 502
- durable_effect: none observed
- incident: troisième 502; reprise tentée après stabilisation

### Tour 6

**User**
> Je reprends après les erreurs techniques: le geste de défense, c'est téléphone verrouillé puis posé sur la commode de l'entrée avant que je me rassoie. Le piège, c'est TikTok automatique.

**Sophia**
> Je n'ai pas réussi à préparer cette carte techniquement. Je préfère m'arrêter plutôt que deviner à ta place. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- operation: `prepare_defense_card`
- executed_tools: [`prepare_defense_card`]
- tool_execution: `failed`
- durable_effect: no `user_defense_cards`

### Tour 7

**User**
> Ok, laisse tomber la carte pour l'instant. Demain à 7h40, rappelle-moi juste de prendre le sac préparé près de la porte.

**Sophia**
> C'est programmé pour samedi 23 mai à 07:40 : prendre le sac préparé près de la porte. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `active_skill_exit_requested`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: `scheduled_checkins.status=pending`, `scheduled_for=2026-05-23T05:40:00+00:00`

### Tour 8

**User**
> Si je veux modifier ce rappel demain matin, je dois chercher où dans Sophia ?

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple: "change le rappel de demain à 9h" ou "annule le rappel de demain". 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `product_help`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- operation: product help
- durable_effect: none

### Tour 9

**User**
> Retiens pour cette conversation que le moment fragile chez moi, c'est le retour du soir quand je suis fatigué et que le téléphone est déjà dans la main.

**Sophia**
> Je le garde comme repère dans cette conversation. Je garde bien ça en tête : le combo fatigue du soir + téléphone déjà en main, c'est ta zone rouge.
>
> On va surveiller ce moment-là ensemble. Tu as réussi à poser ton assiette du coup ? 🍽️

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `active_skill_exit_requested`
- safety: `low`
- opportunity: `coach_preferences` / `update_coach_preferences`
- executed_tools: []
- durable_effect: no `memory_items`, wording scoped to conversation

### Tour 10

**User**
> Oui, assiette rangée. Et pour la suite, garde comme préférence de coaching: quand je dis que je suis vidé, donne-moi une seule action concrète, pas un menu.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te proposerai une seule action concrète à la fois, avec moins de questions/options quand tu es vidé ou bloqué. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `coach_preference_request_overrides_active_flow`
- safety: `low`
- tool_skill_intents: [`update_coach_preferences`]
- executed_tools: [`update_coach_preferences`]
- tool_execution: `success`
- durable_effect: `user_profile_facts.coach.question_tendency=low`, `source_type=explicit_user`

### Tour 11

**User**
> Ok. Là je suis encore un peu tenté de scroller, mais je ne veux pas une nouvelle technique. Dis-moi juste une action maintenant.

**Sophia**
> J’ai besoin d’un horaire plus précis pour programmer ce rappel. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `immediate_mode_request_not_execution_breakdown`
- safety: `low`
- operation: none
- durable_effect: none
- issue: confusion rappel vs action immédiate

### Tour 12

**User**
> Non, je ne parle pas du rappel. Je parle de maintenant: une seule action pour éviter TikTok dans les deux prochaines minutes.

**Sophia**
> Je n'ai pas réussi à préparer cette carte techniquement. Je préfère m'arrêter plutôt que deviner à ta place. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- executed_tools: [`prepare_attack_card`]
- tool_execution: `failed`
- durable_effect: none
- issue: demande d'action immédiate rebasculée vers carte d'attaque

### Tour 13

**User**
> Laisse tomber les cartes. Je viens de poser le téléphone à l'entrée. Je me sens nul d'avoir besoin d'aide pour ça, donc réponds court et aide-moi à redescendre.

**Sophia**
> Ah merde… t’as fait le bon geste, là. Et le “je suis nul” c’est juste la fatigue qui te parle comme si tu devais mériter le repos. 😌
>
> Respire 3 fois plus lentement que d’habitude, puis bois une gorgée d’eau et reviens à ce que tu fais là, sans ajouter d’histoire. Tu peux juste rester sur l’atterrissage. ❤️

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- executed_tools: []
- durable_effect: none

### Tour 14

**User**
> Ok, ça va mieux. Pour vérifier: qu'est-ce qui est vraiment en place pour demain, sans me proposer autre chose ?

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple: "change le rappel de demain à 9h" ou "annule le rappel de demain". 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `product_help`
- route_reason: `skill_handoff_requested`
- safety: `low`
- durable_effect: none
- issue: demande de résumé final confondue avec aide produit

### Tour 15

**User**
> Je ne demandais pas comment modifier le rappel. Je veux juste le résumé final: ce qui est prévu demain et la préférence que tu as gardée.

**Sophia**
> Demain, côté rappel ponctuel: il est géré dans Initiatives, dans les rappels côté chat pour ce type-là. ✅
>
> Ta préférence gardée pour tes moments fragiles (retour du soir quand tu es vidé et que le téléphone est déjà en main) : quand tu me dis que tu es vidé, je te donne une seule action concrète, pas un menu. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `product_help_exit_to_conversation`
- safety: `low`
- executed_tools: []
- durable_effect: none
- issue: récupère partiellement, mais ne rappelle pas clairement l'heure/contenu exact du rappel

## 3. Analyse De Fluidité Humaine

**Verdict: red**

**Ce qui marche**
- Le tour 1 est une réponse de coaching plausible et exploitable.
- Le rappel ponctuel est formulé clairement au tour 7.
- L'aide produit du tour 8 est correcte.
- Le tour 13 fait une réparation émotionnelle correcte et relativement courte.
- La préférence “une seule action concrète, pas un menu” est bien restituée au tour 15.

**Problèmes**
- Tour 2: Sophia répond comme product help au lieu de vraiment préparer une carte de défense. Impact: l'utilisateur croit entrer dans un flow de carte, mais aucun pending n'est créé.
- Tours 3-5: trois erreurs HTTP 502 coupent la conversation. Impact: run très dégradé.
- Tour 6: Sophia échoue techniquement à préparer la carte malgré les slots fournis. Impact: fonctionnalité clé indisponible.
- Tour 11: Sophia demande un horaire de rappel alors que l'utilisateur demande une action immédiate. Impact: confusion forte, perte de confiance.
- Tour 12: Sophia relance une carte d'attaque alors que l'utilisateur demande explicitement “pas de carte, une action maintenant”. Impact: préférence nouvellement enregistrée non respectée.
- Tour 14: demande de résumé confondue avec aide produit. Impact: l'utilisateur doit corriger Sophia au tour 15.

**Fix proposé**
- Prioriser `prepare_defense_card` sur `product_help` quand l'utilisateur demande explicitement “préparer une carte de défense”.
- Quand l'utilisateur dit “une action maintenant / pas une technique / pas de carte”, bloquer `prepare_attack_card` et répondre en `normal_reply` ou `execution_breakdown` court.
- Éviter que le contexte d'un rappel ponctuel actif contamine les demandes immédiates non liées au rappel.
- Pour les demandes “qu'est-ce qui est en place”, produire un récap d'état, pas une fiche produit.

## 4. Analyse Système

**Verdict: red**

**Routage**
- `execution_breakdown` fonctionne au tour 1.
- `prepare_defense_card` ne démarre pas correctement au tour 2: `product_help` est sélectionné.
- Après retries, `prepare_defense_card` est sélectionné au tour 6 mais échoue (`tool_execution=failed`).
- `create_one_shot_reminder` fonctionne au tour 7.
- `product_help` fonctionne au tour 8 mais prend trop de place ensuite au tour 14.
- `update_coach_preferences` fonctionne au tour 10, avec effet DB confirmé.
- `prepare_attack_card` est sélectionné à tort au tour 12.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: green. DB confirmée: `scheduled_for=2026-05-23T05:40:00+00:00`, instruction `prendre le sac préparé près de la porte`.
- `product_help`: green au tour 8, red au tour 14 car mauvais contexte.
- `update_coach_preferences`: green côté DB au tour 10; effet durable confirmé dans `user_profile_facts`.
- `prepare_defense_card`: red. Aucun `user_defense_cards` créé.
- `prepare_attack_card`: red au tour 12, car déclenché contre la demande utilisateur.

**Memory / Effets durables**
- Rappel: 1 ligne `scheduled_checkins`, correcte.
- Préférence coach: `coach.question_tendency=low`, `source_type=explicit_user`, correcte.
- Mémoire conversationnelle: aucun `memory_items`, conforme au wording “repère dans cette conversation”.
- Carte de défense: aucune ligne, non conforme à l'intention initiale.

**Incidents techniques**
- Trois HTTP 502 aux tours 3-5, corrélés à des redémarrages de `supabase functions serve` après détection de modifications de fichiers pendant le run.
- Le run reste exploitable pour le diagnostic, mais pas green strict.

## Verdict Global

**Verdict: red exploitable.**

Le run respecte le cadre demandé: local, IA réelle, `force_full_ai=true`, 15 tours, non pré-scripté, rapport complet. Le système ne coexiste pas encore proprement sur cette conversation normale: la carte de défense échoue, le contexte rappel contamine des demandes non liées, une action immédiate part vers carte d'attaque, et le résumé final est mal compris avant correction utilisateur.
