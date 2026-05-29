# Global Run A3 - Normal Conversation 15T N3 Strict R9

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A3_20260528_strict_r9`
- Persona: `qa-normal-global_run_A3_20260528_strict_r9-1779999417357@example.com`
- Objectif: vérifier si les corrections post-r8 ont résolu product help rappel, carte de défense, confusion révision carte/plan, préférence `une seule proposition`, carte d'attaque et sortie émotion courte.
- Trajectoire: appui minimal, rappel ponctuel, aide produit rappel, carte de défense, tentative d'ajustement de carte, préférence coach, carte d'attaque, apaisement court, récapitulatif.
- Surfaces visées: dispatcher, product_help, `create_one_shot_reminder`, `prepare_defense_card`, `adjust_plan_item`, `update_coach_preferences`, `prepare_attack_card`, emotional repair, status-only, effets durables DB.
- Cadre IA réel: Supabase local, endpoint local Sophia, `force_full_ai=true`, messages choisis tour par tour après lecture de la réponse précédente et de la trace courte, aucun fallback déterministe.
- Validité QA: valide techniquement. 15 tours complets, 30 messages en DB, aucun HTTP error, aucune réponse vide.
- Note temporelle: le helper QA local utilise `client_now_iso=2026-05-22T10:00:00.000+02:00`; le rappel `demain` est donc vérifié au samedi 23 mai 2026.
- Cleanup: terminé après rapport. Vérification post-cleanup à 0 ligne restante sur les tables QA ciblées existantes; `user_memories` n'existe pas dans le schema REST local; user Auth temporaire supprimé.

## 2. Tours De Conversation

### Tour 1

**User**
> Je démarre l'après-midi avec trop de choses ouvertes : devis à finaliser, relance de Karim, et notes de frais. Pas d'outil ni de carte maintenant : donne-moi juste le premier geste utile, sans me poser de question.

**Sophia**
> Ok. Le premier geste utile: ouvre ton doc “à finaliser” et mets 3 lignes, une par sujet (Devis / Relance Karim / Notes de frais), puis fais immédiatement 1 micro-action sur le Devis (ex: compléter la dernière case manquante ou renvoyer la version à jour). 🚀🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `immediate_mode_request_not_execution_breakdown`
- safety: `low`
- skill_entry_ids: `["execution_breakdown"]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**User**
> Ok, j'ai ouvert le devis. Programme-moi un rappel demain à 8h15 : reprendre le devis client, relire les montants et envoyer la version propre avant le point.

**Sophia**
> C'est programmé pour samedi 23 mai à 08:15 : reprendre le devis client, relire les montants et envoyer la version propre avant le point. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- direct_effects: `["create_one_shot_reminder"]`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: rappel créé pour `2026-05-23T06:15:00+00:00`

### Tour 3

**User**
> Je veux juste savoir où je peux retrouver ce rappel pour le modifier ou le supprimer dans l'app. Ne le touche pas.

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple: "change le rappel de demain à 9h" ou "annule le rappel de demain". 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- skill_entry_ids: `["product_help"]`
- durable_effect: aucun

### Tour 4

**User**
> La relance de Karim me pique encore. S'il m'écrit 'tu as enfin fini ?', je sens que je vais répondre sec juste pour reprendre le dessus.

**Sophia**
> C'est la réaction typique quand on se sent acculé, l'envie de mordre pour ne plus subir. C'est humain, mais ça risque juste de nourrir une tension dont tu n'as pas besoin aujourd'hui.
>
> Je vois un risque récurrent pour "Gérer la relance de Karim sans agressivité". Si tu veux, on peut préparer une Carte de defense pour ce moment précis. On y mettrait une réponse prête à l'emploi qui te permet de rester pro sans te laisser marcher dessus. Ça te dirait ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- opportunity: `defense_card`
- opportunity_operation: `prepare_defense_card`
- durable_effect: aucun

### Tour 5

**User**
> Oui, prépare la carte de défense. Moment : quand Karim écrit 'tu as enfin fini ?'. Piège : je me sens contrôlé et je veux répondre sèchement. Geste : écrire d'abord 'je te confirme l'envoi demain matin' en brouillon, respirer, puis relire avant d'envoyer.

**Sophia**
> Voici ta carte de défense :
> Le moment : Quand Karim écrit 'tu as enfin fini ?'
> Le piège : Je me sens contrôlé
> Mon geste : Écrire 'je te confirme l'envoi demain matin' en brouillon, respirer, puis relire avant d'envoyer
> Plan B : Poser le téléphone et attendre 10 minutes
> On valide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- tool_skill_intents: `["prepare_defense_card"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: brouillon en attente de confirmation

### Tour 6

**User**
> Oui, valide cette carte de défense telle quelle.

**Sophia**
> C'est fait. J'ai créé la carte de défense "Gérer les messages de Karim" : Écrire 'je te confirme l'envoi demain matin' en brouillon, respirer, puis relire avant d'envoyer
>
> Tu peux la retrouver dans Ressources > Cartes de defense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, je peux aussi en preparer une nouvelle version apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- executed_tools: `["prepare_defense_card"]`
- tool_execution: `success`
- durable_effect: 1 carte de défense créée

### Tour 7

**User**
> Ajuste juste le Plan B de cette carte : au lieu d'attendre 10 minutes, mets 'envoyer seulement après une relecture à froid'.

**Sophia**
> Je te propose de remplacer le délai de 10 minutes du Plan B par une consigne plus précise et plus simple à exécuter : "envoyer seulement après une relecture à froid". Ça garde l’intention de retenue et de protection avant envoi, tout en supprimant le blocage lié à l’attente fixe. Je ne touche pas au reste du plan, ni à l’objectif global, ni aux autres actions. Si tu valides, je le formalise comme ça. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- tool_skill_intents: `["adjust_plan_item"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 8

**User**
> Non, n'applique pas cet ajustement : je parlais bien de la carte de défense, pas d'un plan ou d'une action. On laisse la carte comme elle est.

**Sophia**
> Ok, je n'applique pas cet ajustement. On garde ton plan tel quel pour l'instant; observe encore une journée, et si le besoin d'alléger se confirme, on reprendra proprement. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `coach_preference_request_overrides_active_flow`
- tool_skill_intents: `["prepare_defense_card","update_coach_preferences"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 9

**User**
> Nouvelle préférence coach à retenir : quand j'écris 'une seule proposition', tu choisis toi-même une option et tu ne listes pas plusieurs choix.

**Sophia**
> Bien reçu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- tool_skill_intents: `["update_coach_preferences"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: attente confirmation

### Tour 10

**User**
> Oui, mais garde-la exactement comme ça : une seule proposition, tu choisis toi-même, pas plusieurs options.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `coach_preference_request_overrides_active_flow`
- executed_tools: `["update_coach_preferences"]`
- tool_execution: `success`
- durable_effect: préférence enregistrée comme `coach.question_tendency = low`

### Tour 11

**User**
> Crée-moi une carte d'attaque pour traiter les notes de frais sans repartir sur autre chose. Une seule proposition : choisis la technique et fais-moi le brouillon.

**Sophia**
> Ok 👍 Je te propose 1 carte d’attaque axée “notes de frais” avec une seule technique, pour éviter tout dérapage ailleurs.
>
> Technique choisie: “Blocage + Liste en 3 vérifs”
> Objectif: traiter tout le lot de notes de frais, sans partir sur d’autres sujets.
>
> Carte d’attaque (brouillon)
> Titre: Notes de frais — tri express sans dispersion
> Mot de bascule: “3 vérifs”
> Déclencheur (quand je commence): Quand j’ouvre le dossier “notes de frais” et que je sens que ça me fait tourner en rond.
>
> Étapes (dans l’ordre, 10-25 min)
> 1) Je bloque tout le reste: je ferme les autres onglets / je ne réponds à aucun message.
> 2) Je fais la passe 1: je vérifie “preuves OK ?”
> 3) Je fais la passe 2: je vérifie “catégorie OK ?”
> 4) Je fais la passe 3: je vérifie “montant + règles OK ?”
>
> Je la mettrais dans la section “Carte d’attaque” depuis Dashboard > Ressources, mais ici je te confirme surtout le brouillon. Tu veux que la carte soit plutôt “très courte (10 min)” ou “confort (25-30 min)” ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- skill_entry_ids: `["product_help"]`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun

### Tour 12

**User**
> Je ne demandais pas l'emplacement dans l'app. Je veux vraiment que tu prépares la carte d'attaque maintenant. Version courte 10 minutes : titre, technique choisie, contenu, puis demande-moi seulement de valider.

**Sophia**
> Ok ✅ Je prépare la carte d’attaque (version courte). 😄
>
> Titre : Relances de devis, sans s’éparpiller (10 min)
> Technique choisie : “1 phrase + 1 action + 1 échéance”
> Contenu :
> 1) Phrase d’ouverture (1 ligne) : “Bonjour Karim, je reviens vers toi pour le devis.”
> 2) Clarté (1 ligne) : “J’ai besoin de ta validation pour qu’on avance sur la prochaine étape.”
> 3) Action (1 ligne) : “Tu peux me confirmer avant X ?”
> 4) Échéance (1 ligne) : “Idéalement ce vendredi 18h.”
> 5) Backup poli (optionnel, 1 ligne) : “Sinon dis-moi une date/heure où tu peux t’y mettre.”
>
> Tu valides cette version ? (Oui/Non) 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun

### Tour 13

**User**
> Non, mauvais sujet. Carte d'attaque notes de frais uniquement : action concrète ouvrir l'outil, importer un seul reçu, fermer. Technique : ancre visuelle. Prépare cette carte et demande validation.

**Sophia**
> Petit raté technique de mon côté en préparant la carte — rien à voir avec ta demande. Redis-moi de la créer et je relance tout de suite. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- skill_entry_ids: `["execution_breakdown"]`
- tool_skill_intents: `["prepare_attack_card"]`
- executed_tools: `["prepare_attack_card"]`
- tool_execution: `failed`
- durable_effect: aucun

### Tour 14

**User**
> Stop pour la carte d'attaque. Là je sens surtout la pression monter et je ne veux pas repartir en boucle. Donne-moi une seule phrase pour redescendre, sans question.

**Sophia**
> Respire une fois profondément, allège juste d’un cran la pression, et reviens au “prochain micro-pas seulement”, pas à la boucle. 😮‍💨

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `attack_card_cancelled_to_conversation`
- safety: `low`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 15

**User**
> Avant de fermer, fais le récap uniquement de ce qui a vraiment été créé ou retenu durablement, et sépare ce qui n'était que de la conversation.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de défense : oui, elle est en place (carte de défense).
> - Rappels ponctuels : oui, il est programmé à 08:15 (reprendre le devis client, relire les montants et envoyer la version propre avant le point).
> - Préférences coach : oui, moins de questions, challenge équilibré. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `status_only_request_blocks_tool_start`
- executed_tools: `[]`
- durable_effect: aucun nouveau side effect

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 1: la demande minimale est respectée sur le fond: pas d'outil, pas de carte, pas de question.
- Tour 2: le rappel ponctuel est clair et conserve le libellé complet.
- Tour 3: l'aide produit rappel est corrigée par rapport au run r8: Sophia indique Initiatives / rappels côté chat et ne répond plus par un statut global.
- Tours 5-6: le flow carte de défense est beaucoup plus fluide: brouillon structuré, confirmation, création.
- Tour 14: la demande d'apaisement court est respectée: une phrase, pas de question, pas de relance outil.
- Tour 15: le récap final est honnête: Sophia ne prétend pas qu'une carte d'attaque a été créée.

**Problemes**
- Tour 7: l'utilisateur demande d'ajuster le Plan B de la carte de défense, mais Sophia parle du "plan" et la trace part sur `adjust_plan_item`. Impact: confusion forte entre carte de défense et plan/action. Sévérité: red.
- Tour 8: quand le user annule cette confusion, Sophia répond encore "on garde ton plan tel quel" et la trace sélectionne `update_coach_preferences`. Impact: la clarification n'est pas comprise et le mode interne reste incohérent. Sévérité: red.
- Tours 9-10: la préférence `une seule proposition, tu choisis` est reformulée en `moins de questions`. Impact: le user n'obtient pas la préférence demandée, seulement une approximation. Sévérité: yellow/red.
- Tour 11: la demande d'une seule proposition n'est pas respectée: Sophia produit une longue carte, propose encore deux options de durée, et ne demande pas une validation simple. Sévérité: red.
- Tour 12: Sophia change de sujet, des notes de frais vers relances de devis/Karim. Impact: perte de contexte produit très visible. Sévérité: red.
- Tour 13: après recadrage explicite, Sophia échoue techniquement et demande au user de redemander. Impact: expérience produit cassée sur une opération centrale. Sévérité: red.
- Wording persistant: `Carte de defense`, `Cartes de defense`, `preparer`, `apres` sans accents. Impact: finition produit. Sévérité: green/yellow.

**Fix propose**
- Verrouiller l'intention `defense_card.plan_b` pour qu'elle reste dans le domaine carte de défense et ne déclenche jamais `adjust_plan_item`.
- Stocker et restituer explicitement une préférence de type `single_proposal_auto_choose`, au lieu de la convertir seulement en `question_tendency=low`.
- Corriger le déclenchement parasite de `product_help` sur les brouillons de carte d'attaque contenant des mots comme `Dashboard`, `Ressources` ou `Carte d'attaque`.
- Empêcher `prepare_attack_card` de produire un mauvais sujet après recadrage; le tool doit conserver le slot `notes de frais` ou demander une clarification ciblée.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1: routage acceptable en `normal_reply`; `execution_breakdown` est détecté sans prendre la main.
- Tour 2: bon arbitrage `central_arbitrator_one_shot_reminder_priority`, side effect exécuté.
- Tour 3: correction effective: `product_help` est owner et handler.
- Tour 5: `prepare_defense_card` démarre correctement avec les slots fournis.
- Tour 6: `prepare_defense_card` exécute correctement et crée une row DB.
- Tour 7: mauvais routage: une révision de carte de défense est interprétée comme `adjust_plan_item`.
- Tour 8: routage incohérent: une annulation de l'ajustement carte/plan est interprétée comme `update_coach_preferences`.
- Tours 11-12: mauvais owner `product_help` sur une intention explicite `prepare_attack_card`.
- Tour 13: `prepare_attack_card` est enfin sélectionné, mais `tool_execution=failed`.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: OK. Rappel créé pour `2026-05-23T06:15:00+00:00` avec `reminder_instruction` complet.
- `product_help`: OK sur la question "où modifier/supprimer ce rappel". KO ensuite car il capture à tort la carte d'attaque.
- `prepare_defense_card`: OK pour création initiale. KO pour ajustement de Plan B, qui bascule vers `adjust_plan_item`.
- `adjust_plan_item`: déclenché à tort au tour 7.
- `update_coach_preferences`: exécute au tour 10, mais stocke une sémantique trop générique.
- `prepare_attack_card`: KO. Non sélectionné aux tours 11-12, puis échec technique au tour 13.

**Memory / Effets durables**
- DB vérifiée avant cleanup: 30 `chat_messages`, 1 `scheduled_checkins`, 1 `user_defense_cards`, 0 `user_attack_cards`, 9 `user_profile_facts`, 0 `memory_items`, 0 `user_topic_memories`.
- Rappel: `scheduled_for=2026-05-23T06:15:00+00:00`; `message_payload.reminder_instruction="reprendre le devis client, relire les montants et envoyer la version propre avant le point"`.
- Carte défense: créée avec `title="Gérer les messages de Karim"`, `situation="Quand Karim écrit 'tu as enfin fini ?'"`, `defense_response="Écrire 'je te confirme l'envoi demain matin' en brouillon, respirer, puis relire avant d'envoyer"`.
- Préférence: `coach.question_tendency = low`, reason exact du tour 9. La préférence exacte `une seule proposition, tu choisis toi-même` n'a pas de clé dédiée visible.
- Carte attaque: aucune row créée, conforme au récap final mais non conforme à l'intention utilisateur.

**Problemes**
- Tour 7: confusion domaine carte de défense / plan item. Impact système: mauvais handler, risque de modifier une action au lieu d'une carte. Sévérité: red.
- Tour 8: annulation/clarification mal routée vers préférence coach. Impact système: état conversationnel incohérent après correction utilisateur. Sévérité: red.
- Tours 11-12: capture abusive par `product_help`. Impact système: l'opération demandée n'est pas lancée et le contenu généré sort du domaine attendu. Sévérité: red.
- Tour 13: `prepare_attack_card` échoue avec réponse 200. Impact système: effet durable attendu absent et diagnostic peu exploitable côté user. Sévérité: red.
- Tour 10: préférence durable trop générique. Impact système: impossible de garantir le comportement `une seule proposition` dans les prochains tools. Sévérité: yellow/red.

**Fix propose**
- Ajouter un test de routage: message contenant `Plan B de cette carte` après création défense doit rester `prepare_defense_card` ou répondre "je ne peux pas modifier directement", jamais `adjust_plan_item`.
- Ajouter une garde `product_help`: les mentions de `Ressources`, `Dashboard`, `Carte d'attaque` dans une réponse ou une demande de préparation ne doivent pas reclassifier une intention tool explicite.
- Ajouter une clé durable dédiée pour la préférence: `coach.proposal_policy = single_auto_choose` ou équivalent.
- Corriger l'erreur interne `prepare_attack_card` sur demande explicitement slotée avec technique `ancre visuelle`.

## Verdict Global

- Verdict: red
- Raison principale: les corrections ont amélioré `product_help` rappel et la création initiale de carte de défense, mais la révision de carte reste routée vers `adjust_plan_item`, la préférence est trop générique, et la carte d'attaque échoue encore.
- Priorité suivante: corriger le routage carte défense vs plan item, puis le déclenchement `prepare_attack_card` face à `product_help` et son échec technique.
