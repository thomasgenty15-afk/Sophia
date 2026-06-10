# Global Normal Conversation 15T - N3 Strict R1

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global15_20260528_n3_strict_r1`
- Persona: user QA temporaire local `6dc27971-4553-4dce-b268-adbfb7aedf39`, créé via Auth local.
- Objectif: simuler une conversation normale de 15 tours pour tester la coexistence globale du dispatcher, mémoire, skills conversationnels, tool skills, rappels, product help, préférences coach et soutien émotionnel.
- Trajectoire: journée brouillée -> micro-action -> tri mails/rangement -> carte d'attaque -> rappel ponctuel -> aide produit rappel -> repère mémoire conversationnelle -> préférence coach -> réparation émotionnelle -> récap.
- Surfaces visées: `execution_breakdown`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, mémoire conversationnelle, `update_coach_preferences`, `emotional_repair`, `select_state_potion` en opportunité non exécutée.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-28T10:00:00.000+02:00`, aucun fallback déterministe.
- Validité QA: valide. Les 15 messages ont été choisis tour par tour après lecture de la réponse et de la trace courte précédente. Aucun message fixe pré-scripté n'a été rejoué.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia, j'ai une journée un peu brouillée: mails en retard, cuisine en bazar, et je sens que je vais me disperser. Je veux juste récupérer un peu de contrôle sans faire un grand plan.

**Sophia**
> Ah je vois le tableau… journée brouillonne + cerveau en mode “brouillon”, ça fatigue 😮‍💨  
> Ok: on reprend juste du contrôle, sans plan géant. Fais 1 micro-action maintenant: vider ton espace cuisine de 5 objets max (juste les plus visibles), puis tu reviens.
>
> Tu veux qu’on utilise la Potion d’état (Potion d’état) pour te remettre un peu de calme/clarité avant qu’on parle du reste ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- opportunity: `select_state_potion`
- executed_tools: []
- durable_effect: none

### Tour 2

**User**
> Pas de potion pour l'instant. Je vais juste enlever 5 objets de la cuisine. Après ça, aide-moi à choisir entre mails et rangement sans me faire une liste énorme.

**Sophia**
> Parfait. On y va: enlève 5 objets de la cuisine, juste ceux qui te sautent aux yeux. (Sans discuter, 5 minutes chrono si tu peux) 😮‍💨
>
> Pour choisir entre mails et rangement, règle simple: si tu as une seule “charge” qui te bloque la paix mentale, fais-la en premier; sinon, fais le plus facile là tout de suite.  
> Là, maintenant: tu sens que les mails te rongent plus, ou c’est le rangement qui te rend dingue ? 👇

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_flow_defers_tool_skill_opportunity`
- opportunity: `adjust_plan_item`
- executed_tools: []
- durable_effect: none

### Tour 3

**User**
> Les mails me rongent plus. Mais le piège c'est que dès que j'ouvre la boîte, je pars lire des trucs au hasard. Je veux juste répondre au mail de Clara, pas nettoyer toute ma boîte.

**Sophia**
> Ok parfait, donc le vrai problème c’est “ouvrir = partir en exploration” 🙃
>
> On fait simple : mets-toi une barrière ultra petite.
> 1) Tu ouvres juste le mail de Clara (recherche par nom “Clara” et tu cliques uniquement celui-là).
> 2) Tu réponds en 3 lignes max, puis tu fermes la boîte.
> 3) Tu te notes un seul prochain pas si besoin (“à faire: X”) et basta.
>
> Tu es plutôt en mode “tu réponds tout de suite au contenu” ou “tu dois demander/clarifier un truc” pour Clara ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- opportunity: `prepare_attack_card`
- executed_tools: []
- durable_effect: none

### Tour 4

**User**
> Avant de répondre, prépare-moi une carte d'attaque simple pour ce moment: ouvrir uniquement le mail de Clara, répondre en 3 lignes, fermer la boîte.

**Sophia**
> C'est noté pour le mail de Clara. Pour t'aider à rester focus et éviter de te perdre dans ta boîte mail, quelle approche te tente le plus ?
>
> 1. **Le texte magique** : un court texte à relire pour couper court aux hésitations.
> 2. **Ancre visuelle** : un signal physique dans ton environnement pour déclencher l'action.
> 3. **Preparer le terrain** : un micro-setup pour rendre le geste immédiat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: none

### Tour 5

**User**
> Préparer le terrain me paraît le mieux. Je veux un truc très concret: rechercher Clara, ouvrir le mail, écrire trois lignes, puis fermer.

**Sophia**
> Voici ton plan : Réponse éclair à Clara (Préparer le terrain).
> Ton protocole : Rechercher 'Clara', ouvrir le mail, écrire 3 lignes, fermer l'onglet.
> Prépare ton environnement avec ces étapes précises, puis exécute sans réfléchir.
> Est-ce que je valide ce brouillon pour toi ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: draft pending

### Tour 6

**User**
> Oui, valide ce brouillon.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Réponse éclair à Clara
> Technique : Préparer le terrain
> Rechercher 'Clara', ouvrir le mail, écrire 3 lignes, fermer l'onglet.
>
> Mode d'emploi : Prépare ton environnement avec ces étapes précises, puis exécute sans réfléchir.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- executed_tools: [`prepare_attack_card`]
- tool_execution: `success`
- durable_effect: `user_attack_cards` active, titre `Réponse éclair à Clara`

### Tour 7

**User**
> Ok, mail envoyé. Maintenant je veux juste éviter d'oublier: demain matin à 8h20, rappelle-moi de vérifier si Clara a répondu.

**Sophia**
> C'est programmé pour vendredi 29 mai à 08:20 : vérifier si Clara a répondu. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `active_skill_exit_requested`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: `scheduled_checkins.status=pending`, `scheduled_for=2026-05-29T06:20:00+00:00`

### Tour 8

**User**
> Et si demain je veux modifier ce rappel, je le fais où ? Je peux te le demander ici ou il faut aller dans l'app ?

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple : "change le rappel de demain à 09:00" ou "annule le rappel de demain". 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- skill_entry_ids: [`product_help`]
- executed_tools: []
- durable_effect: none

### Tour 9

**User**
> Retiens pour cette conversation que quand je dis que ma journée est brouillée, ça veut souvent dire que je dois choisir une seule zone, pas tout remettre en ordre.

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple: "change le rappel de demain à 9h" ou "annule le rappel de demain". 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- executed_tools: []
- durable_effect: none
- issue: product help reste collé au rappel et ignore la demande mémoire conversationnelle

### Tour 10

**User**
> Non, je ne parle plus du rappel. Je veux dire: garde comme repère dans cette conversation que 'journée brouillée' = choisir une seule zone.

**Sophia**
> Est-ce que tu aimerais que j'ajuste mon ton, mon niveau d'exigence ou ma tendance à te poser des questions ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: none
- issue: repère conversationnel routé à tort vers préférence coach

### Tour 11

**User**
> Pour une vraie préférence de coaching cette fois: quand je suis dispersé, pose-moi une seule question de tri à la fois, pas trois options.

**Sophia**
> Bien reçu. Pour la suite, je te proposerai une seule action concrète à la fois, avec moins de questions/options quand tu es vidé ou bloqué. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `coach_preference_request_overrides_active_flow`
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: pending confirmation
- issue: résumé ne respecte pas le scope demandé (`dispersé`)

### Tour 12

**User**
> Presque: confirme mais formule-le pour quand je suis dispersé ou brouillé, pas seulement vidé ou bloqué.

**Sophia**
> Bien reçu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: pending still ambiguous
- issue: correction utilisateur partiellement perdue

### Tour 13

**User**
> Oui, garde la préférence: quand je suis dispersé ou brouillé, une seule question courte de tri à la fois.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- executed_tools: [`update_coach_preferences`]
- tool_execution: `success`
- durable_effect: `user_profile_facts.coach.question_tendency=low`, `source_type=explicit_user`
- issue: DB effet correct au niveau clé, mais wording/scope visible reste “bloqué”

### Tour 14

**User**
> Ok. Là je culpabilise un peu parce que je n'ai fait qu'un mail et cinq objets, alors que la cuisine et la boîte mail sont encore en bazar. Réponds court, aide-moi à redescendre.

**Sophia**
> Oh merde… t’es en mode “pas assez”, mais en vrai tu as déjà avancé. 😮‍💨 Un mail + 5 objets, c’est pas “rien”, c’est un départ concret, et le bazar ne disparaît pas en une seule session.
>
> Là, on vise juste à te sortir de la culpabilité, pas à “rattraper” tout le monde. Option simple : tu fais encore 5 minutes de micro-nettoyage, et tu t’arrêtes quand la minuterie sonne. Tu veux qu’on choisisse une Potion d’état “apaisement” avant de continuer ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- opportunity: `select_state_potion`
- executed_tools: []
- durable_effect: none
- issue: pas assez court, propose encore une potion malgré demande de redescendre court

### Tour 15

**User**
> Pas de potion. Termine juste avec un récap de ce qui est en place: carte créée, rappel, et préférence éventuelle. Sans nouvelle proposition.

**Sophia**
> Sans rien modifier :
> - Carte de défense : je n'en vois pas en place.
> - Rappel de demain : oui, il est programmé (vérifier si Clara a répondu).
> - Préférence : oui, elle est gardée (Peu de questions). 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `status_recap_request_blocks_tool_start`
- executed_tools: []
- durable_effect: none
- issue: récap dit “Carte de défense” absente alors que la carte créée est une carte d'attaque

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- Le début de conversation est naturel: Sophia aide à réduire le chaos sans imposer un grand plan.
- Le flow carte d'attaque est compréhensible: demande explicite, choix de technique, brouillon, confirmation, création.
- Le rappel ponctuel est clair et daté correctement: vendredi 29 mai à 08:20.
- L'aide produit du rappel au tour 8 donne une réponse utile et conforme.
- Sophia accepte le refus de potion au tour 2 et ne l'exécute pas sans accord.

**Problèmes**
- Tour 1: proposition de potion trop précoce et wording dupliqué “Potion d’état (Potion d’état)”. Impact: friction produit légère.
- Tour 9: Sophia reste bloquée sur le sujet product help rappel alors que l'utilisateur demande un repère conversationnel. Impact: rupture de conversation.
- Tour 10: la correction “je ne parle plus du rappel” part vers `update_coach_preferences` au lieu d'un simple repère conversationnel. Impact: l'utilisateur doit clarifier encore.
- Tours 11-13: la préférence est globalement appliquée, mais Sophia transforme “dispersé/brouillé” en “vidé/bloqué”. Impact: personnalisation moins fidèle.
- Tour 14: réponse émotionnelle utile mais trop longue et relance une potion malgré “réponds court”.
- Tour 15: récap final confond le type de carte: il dit qu'il n'y a pas de carte de défense, mais ne mentionne pas la carte d'attaque créée.

**Fix proposé**
- Bloquer `product_help` dès que le user sort explicitement du sujet rappel (“je ne parle plus du rappel”, “retiens pour cette conversation”).
- Distinguer “repère dans cette conversation” de `update_coach_preferences`.
- Pour `update_coach_preferences`, conserver le scope user dans le résumé visible ou dire explicitement que la clé DB est plus générale.
- En récap statut, lister séparément cartes d'attaque et cartes de défense.
- Si le user demande “réponds court” + refuse potion, ne pas proposer une nouvelle potion dans le même tour.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `execution_breakdown`: correct aux tours 1-3.
- `prepare_attack_card`: correct aux tours 4-6, avec effet durable confirmé.
- `create_one_shot_reminder`: correct au tour 7, avec effet durable confirmé.
- `product_help`: correct au tour 8, mais reste collé au rappel au tour 9.
- `update_coach_preferences`: se déclenche à tort au tour 10 sur un repère conversationnel; fonctionne ensuite sur la vraie préférence mais perd le scope précis.
- `emotional_repair`: correctement sélectionné au tour 14, mais génère une proposition produit non demandée.
- `status_recap_request_blocks_tool_start`: protège bien le tour 15 contre un nouveau tool, mais le récap est incomplet/inexact côté type de carte.

**Skills / Operations / Tools**
- `prepare_attack_card`: green. DB confirmée: 1 `user_attack_cards` active, titre `Réponse éclair à Clara`, technique `Préparer le terrain`.
- `create_one_shot_reminder`: green. DB confirmée: 1 `scheduled_checkins` pending, `scheduled_for=2026-05-29T06:20:00+00:00`, instruction `vérifier si Clara a répondu`.
- `product_help`: yellow/red. Bon contenu au tour 8, mauvais maintien au tour 9.
- `update_coach_preferences`: yellow. DB confirmée: `coach.question_tendency=low`, `source_type=explicit_user`; wording visible perd “dispersé/brouillé”.
- `select_state_potion`: non exécuté, seulement proposé. Proposition trop insistante au tour 14.

**Memory / Effets durables**
- `memory_items`: vide, donc aucun durable memory écrit.
- Le repère conversationnel demandé au tour 9 n'est pas correctement repris; il est d'abord ignoré par `product_help`, puis confondu avec une préférence coach.
- Préférence coach durable écrite, mais la raison DB est le message de correction du tour 12, tandis que la réponse finale parle surtout de “bloqué”.

**Problèmes**
- Tour 9: mauvais owner `product_help`. Impact système: product help pollue la conversation hors sujet.
- Tour 10: mauvais owner `tool_skill/update_coach_preferences`. Impact système: repère conversationnel traité comme préférence durable.
- Tour 13: effet durable correct au niveau clé, mais perte de scope visible. Impact: la personnalisation affichée ne correspond pas exactement à la demande.
- Tour 15: récap statut ne lit pas la bonne catégorie de carte. Impact: Sophia nie indirectement une carte d'attaque créée plus tôt.

**Fix proposé**
- Ajouter une règle d'arbitrage: `retiens/garde comme repère dans cette conversation` ne doit jamais lancer `update_coach_preferences` sans mention explicite de préférence/style/coaching.
- Ajouter un exit fort de `product_help` sur “je ne parle plus de X”, “pour cette conversation”, “récap”, “repère”.
- Étendre le récap d'état aux `user_attack_cards` et `user_defense_cards`.
- Ajouter une contrainte de style pour `emotional_repair`: si “réponds court” est présent, limiter à 1-2 phrases et aucune offre produit.

## Verdict Global

**Verdict: red exploitable.**

Le run est valide et couvre bien plusieurs surfaces du produit. Les opérations carte d'attaque, rappel ponctuel et préférence coach écrivent en DB. En revanche, la coexistence globale n'est pas encore propre: `product_help` reste collé au rappel, un repère conversationnel déclenche une préférence coach, la préférence perd le scope demandé, et le récap final oublie la carte d'attaque créée.
