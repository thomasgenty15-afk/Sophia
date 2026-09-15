# global-run-A3 - strict-r3

## 1. Contexte Du Test

- Date: 2026-05-28, run local exécuté entre 16:40 et 16:46 Europe/Paris.
- Run: `global_run_A3_20260528_strict_r3`.
- Persona: utilisateur QA dédié `qa-normal-global_run_A3_20260528_strict_r3-1779979241714@example.com`, user id `0532eeb8-9c34-483b-8699-8d5643f82192`.
- Objectif: vérifier si les corrections après A3 r2 ont corrigé le refus d'attaque card et stabilisé les effets durables.
- Trajectoire: surcharge légère -> refus attaque/A-B -> risque Slack/Nora -> carte de défense -> rappel ponctuel -> product help rappel -> préférence coach -> carte d'attaque -> soutien émotionnel -> recap statut.
- Surfaces visées: `execution_breakdown`, `prepare_defense_card`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, `update_coach_preferences`, `status_recap`, mémoire/préférences.
- Cadre IA réel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`, pas de fallback déterministe, pas de replay pré-scripté. Chaque message utilisateur a été choisi après lecture de la réponse Sophia et de la trace courte précédente.
- Validité QA: valide. 15 tours complets, `http_status=200` partout, aucune réponse vide, aucun abort. Vérification DB: 30 `chat_messages` pour 15 tours, scope/persona isolé.
- Note environnement: les logs serveur montrent des requêtes concurrentes d'autres run ids (`A2`, `A4`, `A5`) pendant la fenêtre. Elles n'ont pas écrit dans le `user_id` A3 r3 vérifié; le transcript et les effets durables A3 r3 restent isolés.

## 2. Tours De Conversation

### Tour 1

**User**
> Ce matin je suis un peu éparpillé. J'ai des mails à finir, un message Slack qui me met la pression, et je ne veux pas partir dans un grand plan. J'ai juste besoin d'un petit point d'appui.

**Sophia**
> Ah mince, tu cumules “à finir + pression externe”… normal que ton cerveau parte en vrille 😮‍💨
>
> Petit point d’appui (simple et efficace) :
> 1) Ouvre juste ton Slack et note en 1 phrase: “Je fais X d’ici Y” (même approximatif).
> 2) Ensuite, choisis 1 seul mail à finir : le plus court ou le plus bloquant.
> 3) 15 minutes timer, puis tu t’arrêtes même si c’est pas parfait.
>
> Tu préfères qu’on fasse l’ordre “Slack d’abord” ou “mail d’abord” (A/B) ? ✅

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- operation: opportunity `prepare_attack_card`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**User**
> Pas de carte d'attaque pour l'instant, et pas besoin d'un choix A/B. Le vrai risque, c'est Slack : Nora m'a relancé sèchement sur le budget et j'ai envie de répondre trop vite, presque pour me défendre.

**Sophia**
> Respirer un grand coup avant de taper quoi que ce soit, c'est la règle d'or quand on se sent attaqué. Si tu réponds sous le coup de l'émotion, tu vas juste nourrir le conflit et perdre du temps 😮‍💨
>
> Mon conseil : n'envoie rien maintenant. Écris ta réponse dans un brouillon ou sur un bloc-notes à part. Lâche tout ce que tu as sur le cœur, même les trucs pas diplomates. Une fois que c'est sorti du système, on pourra filtrer pour ne garder que le factuel et clore le sujet proprement.
>
> On fait ça ? Tu sors le "venin" dans un coin et tu me dis quand c'est fait.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `attack_card_cancelled_to_conversation`
- safety: `low`
- operation: aucune
- executed_tools: `[]`
- durable_effect: aucun

### Tour 3

**User**
> Oui, là je veux bien une carte de défense pour ce moment précis : ne pas répondre sèchement à Nora sur Slack.

**Sophia**
> C'est noté pour Nora. Qu'est-ce qui se passe exactement au moment où tu sens que tu vas craquer, et pourquoi ça t'embarque ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- safety: `low`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 4

**User**
> Quand je lis son message, je me sens accusé alors que j'ai bossé tard dessus. Ça m'embarque parce que j'ai envie de prouver immédiatement que je maîtrise le dossier.

**Sophia**
> Voici ta carte de défense :
> Le moment : Lecture du message de Nora sur Slack
> Le piège : Sentiment d'accusation et envie de prouver ma maitrise
> Mon geste : Fermer l'onglet Slack et respirer deux minutes
> Plan B : Ecrire ma reponse dans un brouillon sans l'envoyer
> On valide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `execution_breakdown_absorbed_by_active_tool_skill`
- safety: `low`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun, attente confirmation

### Tour 5

**User**
> Oui, valide cette carte de défense.

**Sophia**
> C'est fait. J'ai créé la carte de défense "Reponse a Nora" : Fermer l'onglet Slack et respirer deux minutes
>
> Tu peux la retrouver dans Ressources > Cartes de defense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, je peux aussi en preparer une nouvelle version apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- safety: `low`
- executed_tools: `["prepare_defense_card"]`
- tool_execution: `success`
- durable_effect: 1 `user_defense_cards` créée, schema `defense_card_draft_v1`.

### Tour 6

**User**
> Mets-moi un rappel demain à 9h10 pour vérifier la réponse de Nora sans ruminer.

**Sophia**
> C'est programmé pour vendredi 29 mai à 09:10 : Nora sans ruminer. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: `["create_one_shot_reminder"]`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: 1 rappel créé pour `2026-05-29T07:10:00+00:00`.

### Tour 7

**User**
> Si je veux déplacer ou supprimer ce rappel ponctuel, je fais comment ?

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
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun nouveau rappel.

### Tour 8

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
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun, attente confirmation

### Tour 9

**User**
> Oui, c'est exactement ça, garde cette préférence.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai une seule question de tri à la fois, et je te proposerai une seule action concrète à la fois, quand tu es éparpillé ou brouillé. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- executed_tools: `["update_coach_preferences"]`
- tool_execution: `success`
- durable_effect: `coach.question_tendency = low`, source `explicit_user`.

### Tour 10

**User**
> Ok, maintenant j'aimerais une carte d'attaque pour envoyer le premier mail budget. Je suis encore un peu éparpillé, donc guide-moi simplement.

**Sophia**
> Je te propose Ancre visuelle: C'est idéal quand on se sent éparpillé pour créer un point de focalisation immédiat.. On part là-dessus ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 11

**User**
> Oui, pars là-dessus, mais je veux que l'action soit vraiment le premier mail budget, pas un truc abstrait.

**Sophia**
> Voici ton Ancre visuelle : Le mail budget.
> L'objet : Un post-it bleu avec écrit 'Budget : 1er mail' collé sur ton écran.
> Mode d'emploi : Colle ce post-it sur ton écran et n'y touche pas tant que le mail n'est pas envoyé.
> Est-ce que je valide cette carte pour toi ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `none`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun, attente confirmation

### Tour 12

**User**
> Oui, valide cette carte d'attaque.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Le mail budget
> Technique : Ancre visuelle
> Un post-it bleu avec écrit 'Budget : 1er mail' collé sur ton écran.
>
> Mode d'emploi : Colle ce post-it sur ton écran et n'y touche pas tant que le mail n'est pas envoyé.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- executed_tools: `["prepare_attack_card"]`
- tool_execution: `success`
- durable_effect: 1 `user_attack_cards` créée, pas d'objet parasite.

### Tour 13

**User**
> Là je sens encore un peu la boule au ventre, parce que j'ai peur que Nora pense que je ne maîtrise pas le dossier.

**Sophia**
> Ah merde, je comprends... C'est ce sentiment d'imposteur qui pointe le bout de son nez.
>
> C'est souvent une interprétation qu'on se fait tout seul, alors qu'en face, elle attend probablement juste une info technique. Pour calmer cette sensation, je peux te proposer de préparer une Carte d'attaque. On pourrait l'utiliser pour transformer cette peur en une micro-action concrète qui prouve ta maîtrise, ça te dirait ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- opportunity: `state_potion`
- opportunity_operation: `select_state_potion`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 14

**User**
> Non, pas une nouvelle carte. Là j'ai juste besoin que tu restes simple : une phrase qui me remet au calme, pas plus.

**Sophia**
> Ok. Respire: “Je n’ai pas besoin de tout maîtriser, juste d’envoyer la prochaine info utile.” 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_flow_defers_tool_skill_opportunity`
- safety: `low`
- opportunity: `state_potion`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 15

**User**
> Avant que je parte bosser, résume-moi ce qui a vraiment été créé ou retenu, et ce qui était juste de la conversation.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Le mail budget).
> - Carte de défense : oui, elle est en place (carte de défense).
> - Rappels ponctuels : oui, il est programmé à 09:10 (Nora sans ruminer).
> - Préférences coach : oui, moins de questions, challenge équilibré. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `status_recap_request_blocks_tool_start`
- safety: `low`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun nouveau side effect.
- état DB résumé: 1 carte d'attaque, 1 carte de défense, 1 rappel, préférence active.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 2: nette amélioration vs r2. Le refus de carte d'attaque et de choix A/B est respecté; Sophia revient en conversation.
- Tours 3-5: le flow défense est fluide, clair et crée bien une carte de défense.
- Tour 7: product help rappel est direct et sans side effect.
- Tour 10: la préférence "pas trois options" est respectée; Sophia propose une seule technique.
- Tour 15: recap cohérent avec l'état réel.

**Problemes**
- Tour 1: Sophia donne encore 3 étapes + une question A/B alors que l'utilisateur demandait un petit point d'appui. Impact: un peu trop chargé. Sévérité: yellow.
- Tour 4-5: accents absents dans certains libellés ("maitrise", "Ecrire", "Reponse a Nora", "Cartes de defense"). Impact: finition produit. Sévérité: yellow.
- Tour 10: ponctuation encore imparfaite ("Ancre visuelle:" et double point final). Sévérité: green/yellow.
- Tour 13: Sophia propose encore une carte d'attaque sur une demande émotionnelle simple. Le refus est bien respecté ensuite, mais l'offre reste mécanique. Sévérité: yellow.

**Fix propose**
- Premier tour: si l'utilisateur demande "juste un petit point d'appui", limiter à une seule action et éviter A/B.
- Tour émotionnel: par défaut, répondre en soutien court; proposer une carte seulement si le user demande une structure durable.
- Normaliser l'accentuation et la ponctuation dans les rendus tool skills.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 2: correction validée. `route_reason=attack_card_cancelled_to_conversation`, `response_owner=normal_reply`, aucun outil.
- Tours 3-5: `explicit_defense_card_intent_overrides_attack_card` maintient correctement `prepare_defense_card` jusqu'à l'exécution.
- Tour 7: `product_help` répond sans activer `create_one_shot_reminder`.
- Tour 10-12: `prepare_attack_card` fonctionne correctement après préférence; une seule option visible.
- Tour 13: trace `opportunity=state_potion`, mais réponse visible propose une carte d'attaque. Désalignement encore présent.
- Tour 15: status-only sans mutation et état durable correctement résumé.

**Skills / Operations / Tools**
- `prepare_defense_card`: succès. 1 `user_defense_cards`, schema `defense_card_draft_v1`.
- `prepare_attack_card`: succès. 1 `user_attack_cards`, pas de confusion avec la défense.
- `create_one_shot_reminder`: succès. 1 seul rappel.
- `product_help`: succès. Aucun side effect indésirable.
- `update_coach_preferences`: succès. Préférence enregistrée en `user_profile_facts`.

**Memory / Effets durables**
- `chat_messages`: 30 lignes pour 15 tours.
- `user_defense_cards`: 1 carte, "Reponse a Nora".
- `user_attack_cards`: 1 carte, "Le mail budget".
- `scheduled_checkins`: 1 rappel, `2026-05-29T07:10:00+00:00`.
- `user_profile_facts`: `coach.question_tendency=low`, source `explicit_user`.
- `memory_items` / `user_topic_memories`: 0, non bloquant pour ce run.

**Problemes**
- Tour 13: opportunité interne `state_potion` mais réponse orientée carte d'attaque. Impact système: surface visible et opportunité désalignées. Sévérité: yellow.
- Tour 9: outil exécuté mais `response_owner=normal_reply`. Impact: observabilité encore imparfaite, même si l'effet durable est correct. Sévérité: yellow.
- Rendu texte tool skills: accents/ponctuation non normalisés dans plusieurs sorties. Sévérité: yellow.

**Fix propose**
- Aligner `opportunity=state_potion` avec une réponse de soutien/potion, ou supprimer l'opportunité quand le modèle verbalise une carte d'attaque.
- Continuer à unifier la trace courte quand un tool est exécuté depuis une réponse normale.
- Ajouter un post-processing léger sur titres/libellés générés par les opérations.

## Verdict Global

- Verdict: yellow
- Raison principale: les corrections tiennent sur les bugs bloquants; refus d'attaque card respecté, carte de défense créée comme défense, product help rappel sans doublon. Il reste des frictions UX/observabilité non bloquantes.
- Follow-up prioritaire: supprimer l'offre mécanique de carte d'attaque sur émotion simple et alléger le premier tour.
