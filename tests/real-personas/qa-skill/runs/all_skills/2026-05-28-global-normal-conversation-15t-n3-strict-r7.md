# QA Run Report - Global Normal Conversation 15T N3 Strict R7

## 1. Contexte Du Test

- Date: 2026-05-28, run executé localement entre 15:07 et 15:15 Europe/Paris.
- Run: `global15_20260528_n3_strict_r7`.
- Persona: utilisateur QA dédié `qa-normal-global15_20260528_n3_strict_r7-1779973658393@example.com`, user id `717b06d9-dfbe-49ae-acd7-6f40a798e55e`.
- Objectif: tester une conversation normale de 15 tours sur le système global Sophia: dispatcher, routing, skills, tool skills, mémoire, effets durables et aide produit.
- Trajectoire: utilisateur éparpillé -> Slack/Nora -> carte de défense -> rappel ponctuel -> aide produit rappel -> préférence coach -> carte d'attaque -> recap statut.
- Surfaces visées: `execution_breakdown`, `prepare_attack_card`, `prepare_defense_card`, `create_one_shot_reminder`, `product_help`, `update_coach_preferences`, `status_recap`, mémoire/préférences.
- Cadre IA réel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`, pas de fallback déterministe, pas de replay pré-scripté. Chaque message utilisateur a été choisi après lecture de la réponse précédente et de la trace courte.
- Validité QA: valide. Le run contient 15 tours complets, `http_status=200` partout, aucune réponse vide, aucun abort. Vérification DB: 30 `chat_messages` exactement pour 15 tours, donc pas de pollution du persona r7.
- Note environnement: les logs du serveur local ont montré des requêtes d'autres run ids pendant la fenêtre, mais elles ciblaient d'autres scopes/personas. Le transcript et les effets durables r7 restent isolés et vérifiés par `user_id`.

## 2. Tours De Conversation

### Tour 1

**User**
> Ce matin je suis un peu éparpillé. J'ai des mails en retard, un message Slack qui me stresse, et mon bureau est en bazar. Je veux juste trouver un point d'appui, pas un grand plan.

**Sophia**
> Ok, ça fait beaucoup à encaisser en même temps 😵‍💫 Le point d’appui maintenant, c’est juste de rendre “Gérer les mails, Slack et le bureau en bazar” plus simple à démarrer, sans réfléchir.
>
> Je te propose qu’on te fasse une Carte d’attaque dédiée “Gérer les mails, Slack et le bureau en bazar” pour lancer direct la première mini-action. Tu veux qu’on la fasse ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: opportunity `prepare_attack_card`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**User**
> Pas tout de suite pour une carte d'attaque globale. Le truc qui me crispe le plus c'est Slack : Nora m'a relancé sèchement sur le dossier budget et j'ai envie de répondre trop vite.

**Sophia**
> Pour ce blocage de demarrage, je te propose deux options: 'Le texte magique' pour recadrer le perfectionnisme, ou 'Ancre visuelle' pour avoir un signal concret de depart. Laquelle te semble la plus utile ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `prepare_attack_card`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 3

**User**
> Non, là ce n'est pas un blocage de démarrage. Je voudrais plutôt une carte de défense pour ne pas répondre sèchement à Nora sur Slack.

**Sophia**
> C'est noté, on prépare cette défense pour tes échanges avec Nora. Qu'est-ce qui se passe exactement au moment où tu sens que tu vas répondre sèchement, et qu'est-ce qui fait que tu perds patience ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_tool_intent_supersedes_active`
- safety: `low`
- operation: `prepare_defense_card`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 4

**User**
> Quand je lis son message, je me sens accusé d'avoir mal suivi le budget. Je perds patience parce que j'ai déjà passé la soirée dessus, et mon réflexe serait de lui envoyer une justification sèche.

**Sophia**
> Voici ta carte de défense :
> Le moment : En lisant un message de Nora sur le budget
> Le piège : Sentiment d'accusation et perte de patience
> Mon geste : Fermer Slack et respirer deux minutes.
> Plan B : Lui dire que je reviens vers elle demain
> On valide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_inline_resume_active_tool_skill`
- safety: `low`
- operation visible: brouillon `prepare_defense_card`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 5

**User**
> Presque. Dans Mon geste, remplace par : écrire un brouillon neutre puis attendre 10 minutes avant d'envoyer. Le plan B peut rester comme ça.

**Sophia**
> Voici ta carte de défense :
> Le moment : En lisant un message de Nora sur le budget
> Le piège : Sentiment d'accusation et perte de patience
> Mon geste : Écrire un brouillon neutre puis attendre 10 minutes avant d'envoyer
> Plan B : Lui dire que je reviens vers elle demain
> On valide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `pending_defense_card_revision_priority`
- safety: `low`
- operation: `prepare_defense_card`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 6

**User**
> Oui, valide cette carte de défense.

**Sophia**
> C'est fait. J'ai créé la carte de défense "Réponse à Nora" : Écrire un brouillon neutre puis attendre 10 minutes avant d'envoyer
>
> Tu peux la retrouver dans Ressources > Cartes de defense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, je peux aussi en preparer une nouvelle version apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `pending_defense_card_confirmation_priority`
- safety: `low`
- operation: `prepare_defense_card`
- executed_tools: `["prepare_defense_card"]`
- tool_execution: `success`
- durable_effect: 1 `user_defense_cards` créée, contenu conforme à la révision.

### Tour 7

**User**
> Mets-moi aussi un rappel demain à 9h10 pour vérifier si Nora a répondu et ne pas ruminer toute la matinée.

**Sophia**
> C'est programmé pour vendredi 29 mai à 09:10 : vérifier si Nora a répondu et ne pas ruminer toute la matinée. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `active_skill_exit_requested`
- safety: `low`
- direct_effects: `["create_one_shot_reminder"]`
- executed_tools: `["create_one_shot_reminder"]`
- tool_execution: `success`
- durable_effect: 1 rappel créé pour `2026-05-29T07:10:00+00:00`, soit 09:10 Europe/Paris.

### Tour 8

**User**
> Et si finalement je veux le déplacer ou le supprimer, je fais comment dans Sophia ?

**Sophia**
> Je peux te guider 👍🙂 Mais là, j’ai besoin d’un détail : tu parles de quoi exactement à déplacer/supprimer, un rendez-vous (un message programmé) ou une tâche/habitude (une action récurrente) ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `active_skill_exit_requested`
- safety: `low`
- skill_entry_ids: `["product_help"]`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 9

**User**
> Je parle du rappel ponctuel que tu viens de programmer pour demain à 9h10.

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple: "change le rappel de demain à 9h" ou "annule le rappel de demain". 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `["create_one_shot_reminder"]`
- tool_execution: `success`
- durable_effect: bug observé, un second rappel a été créé à `2026-05-29T07:10:00+00:00` avec `request_text` = "Je parle du rappel ponctuel que tu viens de programmer pour demain à 9h10."

### Tour 10

**User**
> Pour la suite, retiens une préférence : quand je suis éparpillé, pose-moi une seule question de tri à la fois, pas trois options.

**Sophia**
> Bien reçu. Pour la suite, je te poserai une seule question de tri à la fois, et je te proposerai une seule action concrète à la fois, quand tu es éparpillé ou brouillé. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- operation: `update_coach_preferences`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun, attente de confirmation.

### Tour 11

**User**
> Oui c'est exactement ça, garde cette préférence.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai une seule question de tri à la fois, et je te proposerai une seule action concrète à la fois, quand tu es éparpillé ou brouillé. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- operation: `update_coach_preferences`
- executed_tools: `["update_coach_preferences"]`
- tool_execution: `success`
- durable_effect: `user_profile_facts.coach.question_tendency` passé à `{ label: "Peu de questions", value: "low" }`, source `explicit_user`.

### Tour 12

**User**
> Ok, maintenant j'aimerais une carte d'attaque pour le premier mail budget à envoyer, mais je suis encore un peu éparpillé.

**Sophia**
> Je te propose Preparer le terrain: C'est idéal quand on se sent éparpillé : on simplifie le premier geste pour ne plus avoir à réfléchir.. On part là-dessus ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- operation: `prepare_attack_card`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 13

**User**
> Oui, pars sur Préparer le terrain.

**Sophia**
> Voici ton brouillon pour : Envoyer le premier mail budget.
> Technique : Préparer le terrain.
> Action : Ouvre ton brouillon de mail, saisis l'objet 'Budget' et éloigne ton téléphone.
> Prépare ce setup maintenant pour n'avoir plus qu'à rédiger le moment venu.
> Est-ce que je valide cette carte ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `low`
- operation: `prepare_attack_card`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun, attente de confirmation.

### Tour 14

**User**
> Oui valide la carte d'attaque.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Action : Mail Budget
> Technique : Préparer le terrain
> Ouvre ton brouillon de mail, saisis l'objet 'Budget' et éloigne ton téléphone.
>
> Mode d'emploi : Prépare ce setup maintenant pour n'avoir plus qu'à rédiger le moment venu.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- operation: `prepare_attack_card`
- executed_tools: `["prepare_attack_card"]`
- tool_execution: `success`
- durable_effect: 1 `user_attack_cards` créée, action `Mail Budget`, technique `preparer_terrain`.

### Tour 15

**User**
> Avant que je parte bosser : tu peux me résumer ce qui a vraiment été créé ou retenu, et ce qui était juste de la conversation ?

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Action : Mail Budget).
> - Carte de défense : oui, elle est en place (carte de défense).
> - Rappel de demain : oui, il est programmé (programmer pour demain à 9h10).
> - Préférence : oui, elle est gardée (une action concrète à la fois). 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `status_recap_request_blocks_tool_start`
- safety: `low`
- selected_handler interne DB: `status_recap`
- executed_tools: `[]`
- durable_effect: aucun nouveau side effect, mais le résumé masque qu'il y a en fait 2 rappels en base.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tours 3 à 6: une demande explicite de carte de défense est comprise, affinée puis validée avec un résultat utile.
- Tour 7: la création du rappel est claire pour l'utilisateur et la date locale est correcte.
- Tours 10 à 14: la préférence "une seule question / action" est prise en compte dans la carte d'attaque suivante: Sophia ne propose qu'une technique au lieu de trois.
- Tour 15: le format de recap est naturel et répond à une vraie demande de statut.

**Problemes**
- Tour 1: Sophia propose une carte d'attaque dès le premier message alors que l'utilisateur demande surtout un point d'appui léger, "pas un grand plan". Impact: le produit paraît proactif mais un peu mécanique. Sévérité: yellow.
- Tour 2: Sophia ignore "Pas tout de suite pour une carte d'attaque globale" et continue sur `prepare_attack_card` avec deux options. Impact: l'utilisateur doit corriger explicitement le système. Sévérité: red côté UX locale, mais récupéré au tour 3.
- Tour 8: après une question évidente sur le rappel tout juste créé, Sophia demande une précision inutile entre rendez-vous et tâche/habitude. Impact: friction conversationnelle, surtout parce que le contexte immédiat est disponible. Sévérité: yellow.
- Tour 12: wording perfectible: "Preparer" sans accent, double point avant explication, double point final. Impact: finition produit moyenne mais pas bloquante. Sévérité: green/yellow.
- Tour 15: Sophia dit "un rappel" alors qu'en base deux rappels existent. Impact invisible pour l'utilisateur à cet instant, mais le recap est factuellement incomplet. Sévérité: yellow humainement, red système.

**Fix propose**
- Bloquer `prepare_attack_card` quand l'utilisateur vient de refuser ou temporiser une carte d'attaque, surtout si le message suivant décrit une réaction impulsive.
- Dans `product_help` rappel, utiliser le contexte du dernier rappel créé avant de demander une clarification générique.
- Améliorer le rendu des noms de techniques générées (`Préparer le terrain`) et nettoyer la ponctuation.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1: `execution_breakdown` active une opportunité `prepare_attack_card` sur une demande large d'appui. Ce n'est pas forcément faux, mais c'est prématuré.
- Tour 2: mauvais routage exploitable. Le message utilisateur contient un refus explicite de carte globale et un contexte de réponse impulsive Slack, mais le système route vers `prepare_attack_card`.
- Tour 4: la réponse affichée est un brouillon de carte de défense, mais la trace courte indique `response_owner=product_help`, `selected_handler=product_help`, `route_reason=product_help_inline_resume_active_tool_skill`. La metadata DB contient bien `tool_skill_runtime.selected_handler=prepare_defense_card`; l'incohérence semble donc venir de la trace courte.
- Tour 5: la révision de carte de défense route correctement via `pending_defense_card_revision_priority`.
- Tour 11: la préférence est bien exécutée, mais `response_owner=normal_reply`, `selected_handler=null` alors que `executed_tools=["update_coach_preferences"]`. Cela fonctionne côté effet durable, mais l'observabilité reste incohérente.
- Tour 15: `status_recap_request_blocks_tool_start` empêche bien une mutation pendant le recap.

**Skills / Operations / Tools**
- `prepare_defense_card`: succès fonctionnel. Collecte des slots, révision, confirmation et création DB correctes.
- `create_one_shot_reminder`: succès au tour 7, mais déclenchement incorrect au tour 9 depuis une clarification de product help. C'est le bug bloquant du run.
- `product_help`: réponse de contenu correcte au tour 9, mais side effect interdit: création d'un second rappel non demandé.
- `update_coach_preferences`: préférence enregistrée correctement après confirmation.
- `prepare_attack_card`: après la préférence, le système ne propose qu'une technique au tour 12. Le correctif attendu "une seule question / pas trois options" semble tenir sur ce cas.

**Memory / Effets durables**
- `chat_messages`: 30 messages, cohérents avec 15 tours. Pas de pollution externe.
- `user_defense_cards`: 1 carte créée, conforme à la révision utilisateur.
- `scheduled_checkins`: 2 rappels créés alors que l'utilisateur n'en a demandé qu'un. Le second vient du tour 9, qui devait être une clarification product help.
- `user_profile_facts`: préférence `coach.question_tendency=low` enregistrée avec source `explicit_user`.
- `user_attack_cards`: 1 carte créée, conforme.
- `memory_items` et `user_topic_memories`: 0 entrée, acceptable pour ce run.

**Problemes**
- Tour 9: création d'un rappel non demandé pendant un tour de product help. Impact système: side effect durable faux, doublon à 09:10, statut final trompeur. Sévérité: red.
- Tour 2: route `prepare_attack_card` malgré refus utilisateur et intention défensive. Impact système: mauvais handler, mauvais slot filling, friction UX. Sévérité: red.
- Tour 4: trace courte incohérente `product_help` vs brouillon `prepare_defense_card`. Impact système: observabilité QA et debugging trompeurs. Sévérité: yellow.
- Tour 11: trace courte indique `normal_reply` malgré exécution de `update_coach_preferences`. Impact système: observabilité imparfaite sur side effect mémoire. Sévérité: yellow.
- Tour 15: status-only recap ne détecte pas le doublon de rappel et confirme "le rappel" au singulier. Impact système: l'état résumé ne reflète pas totalement la base. Sévérité: yellow/red.

**Fix propose**
- Ajouter une garde forte dans le direct effect `create_one_shot_reminder`: ne jamais créer de rappel quand `selected_handler=product_help`, `status_only`, ou quand l'intention utilisateur est une clarification du rappel existant ("le rappel que tu viens de programmer").
- Au moment de product help rappel, injecter le dernier rappel créé comme contexte consultable mais non mutable, et désactiver les direct effects de rappel sur ce tour.
- Dans le dispatcher, donner priorité au refus récent d'attaque card et aux signaux d'impulsion émotionnelle avant toute continuation/recommendation `prepare_attack_card`.
- Unifier la trace courte avec `router_decision_v2.tool_skill_runtime.selected_handler` pour éviter `product_help` affiché sur une réponse de défense et `normal_reply` sur une préférence exécutée.
- Dans `status_recap`, compter les objets durables et signaler les doublons évidents plutôt que de résumer uniquement par type.

## Verdict Global

- Verdict: red
- Raison principale: le run est valide, mais un side effect durable faux est observé au tour 9: une question de product help sur le rappel existant crée un second `scheduled_checkins`.
- Follow-up prioritaire: bloquer `create_one_shot_reminder` pendant les tours `product_help`/clarification/status-only, puis relancer un run strict 15 tours.
