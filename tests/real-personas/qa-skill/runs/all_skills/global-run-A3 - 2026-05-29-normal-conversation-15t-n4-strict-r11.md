# Global Run A3 - Normal Conversation 15T N4 Strict R11

## 1. Contexte Du Test

- Date: 2026-05-29
- Run: `global_run_A3_20260529_n4_strict_r11`
- Persona: `qa-normal-global_run_A3_20260529_n4_strict_r11-1780006638793@example.com`
- Objectif: rejouer les mêmes surfaces que r10 après corrections éventuelles: potion/mode d'état, sortie de mode, aide produit, rappel ambigu puis précis, préférence de formulation et non-mémorisation du nom client.
- Trajectoire: micro-pas post-appel, question produit sur potion, tentative Apaisement, formulation client avec non-mémorisation, product help potion, rappel ponctuel, préférence coach, application immédiate, vérification mémoire, product help rappel, récapitulatif.
- Surfaces visées: `execution_breakdown`, `product_help`, `select_state_potion`, `create_one_shot_reminder`, `update_coach_preferences`, memory/retrieval, status-only, effets durables DB.
- Cadre IA réel: Supabase local, endpoint local Sophia, `force_full_ai=true`, messages choisis tour par tour après lecture de la réponse précédente et de la trace courte, aucun fallback déterministe.
- Validité QA: valide techniquement. 15 tours complets, 30 messages en DB, aucun HTTP error, aucune réponse vide. DB vérifiée avant cleanup.
- Cleanup: terminé après rapport. Vérification post-cleanup à 0 ligne restante sur les tables QA ciblées existantes; `user_memories` n'existe pas dans le schema REST local; user Auth temporaire supprimé.

## 2. Tours De Conversation

### Tour 1

**User**
> Je sors d'un appel client tendu, j'ai Slack, un doc et mes mails ouverts, et je sens que je vais fuir dans du scrolling. Pas de carte ni d'outil : donne-moi un seul micro-pas pour revenir au travail.

**Sophia**
> Ok, micro-pas maintenant : ferme Slack ET le doc/mail pendant 2 minutes, puis écris juste une phrase “prochaine action” en haut de ton doc (verbe + quoi + pour quand) 🙂➡️ Ensuite tu fais cette première action, même minuscule.
>
> Tu vises quoi en “prochaine action” : répondre, rédiger, ou relancer ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `attack_card_cancelled_to_conversation`
- skill_entry_ids: `["execution_breakdown"]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**User**
> J'ai écrit la prochaine action, mais mon corps reste en tension. Est-ce que Sophia a une potion ou un mode pour redescendre ? Explique-moi juste, ne lance rien.

**Sophia**
> Pour relâcher cette tension, j'ai deux options : la potion d'Apaisement (pour redescendre et desserrer la pression) ou la potion d'Amour (si tu sens que tu es un peu dur avec toi-même). Laquelle te ferait le plus de bien ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- skill_entry_ids: `["product_help"]`
- opportunity: `state_potion`
- opportunity_operation: `select_state_potion`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 3

**User**
> Apaisement. Oui, lance-la maintenant, version courte. Je veux juste revenir dans un état assez stable pour écrire une phrase.

**Sophia**
> Ok, apaisement en version courte 😌
>
> 1) Inspire 4 secondes, bloque 1, expire 6 (x3).
> 2) Détends mâchoire + épaules, et relâche le ventre.
> 3) Bois 2 petites gorgées d’eau.
> 4) Réécris une seule phrase sur ta prochaine action, sans la rendre “parfaite”.
>
> C’est bon pour une phrase maintenant : tu choisis plutôt “verbe + quoi” ou “objectif + première étape” ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `immediate_mode_request_not_state_potion`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun

### Tour 4

**User**
> Objectif + première étape. La phrase concerne le client Vega : je dois lui dire où j'en suis avant 18h. Ne mémorise pas le nom Vega.

**Sophia**
> C'est cette échéance de 18h avec ton client qui crée la tension. Pour t'épauler, tu préfères la potion d'Apaisement (pour faire redescendre la pression) ou celle de Courage (si c'est le fait de le contacter qui t'intimide) ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 5

**User**
> Apaisement, je l'ai déjà dit. Mais ne programme rien et ne propose pas de suivi : écris juste la phrase maintenant.

**Sophia**
> Ok 😌 Inspire 4 secondes, bloque 1, expire 6 (x3).
>
> Je m’assure de te répondre sur l’état d’avancement (où j’en suis) avant 18h, avec la prochaine étape claire.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `immediate_mode_request_not_state_potion`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun

### Tour 6

**User**
> Stop sur la potion. Dans Sophia, où est-ce que je vois si une potion est active, et comment je l'arrête ? Réponds produit, pas conseils génériques.

**Sophia**
> Tu peux voir et arrêter tes potions actives directement dans l'onglet 'Potions' de ton menu. Est-ce que tu as besoin d'une nouvelle potion pour un état précis en ce moment ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- skill_entry_ids: `["product_help"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 7

**User**
> Non, pas de nouvelle potion. Mets-moi plutôt un rappel plus tard pour reprendre ce retour client, quand ce sera pertinent.

**Sophia**
> Ça marche pour le retour client. Tu sens que tu as plutôt tendance à le repousser ou c'est juste que ça sort de ta tête ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `state_potion_exit_to_conversation`
- route_reason: `explicit_state_potion_exit`
- direct_effects: `["create_one_shot_reminder"]`
- direct_effects_to_run: `[]`
- tool_execution: `blocked`
- durable_effect: aucun; clarification demandée

### Tour 8

**User**
> C'est surtout que ça sort de ma tête. Vendredi 29 mai 2026 à 17h35, rappelle-moi de finaliser la phrase de retour client avant l'envoi de 18h.

**Sophia**
> C'est programmé pour vendredi 29 mai à 17:35 : Finaliser la phrase de retour client. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- direct_effects: `["create_one_shot_reminder"]`
- executed_tools: `["create_one_shot_reminder"]`
- tool_execution: `success`
- durable_effect: rappel créé pour `2026-05-29T15:35:00+00:00`

### Tour 9

**User**
> Pour la suite, retiens une préférence : quand je demande une formulation, donne d'abord la phrase prête à envoyer, puis seulement ensuite l'explication ou le coaching.

**Sophia**
> Je ne peux pas encore modifier l'ordre de mes réponses. Par contre, je peux ajuster mon ton, mon niveau d'exigence ou la fréquence de mes questions. Qu'est-ce qui t'aiderait le plus ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- tool_skill_intents: `["update_coach_preferences"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 10

**User**
> Je comprends. Mets alors la préférence la plus proche : moins de coaching avant la réponse concrète, et moins de questions quand je demande une formulation.

**Sophia**
> Bien reçu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `coach_preference_request_overrides_active_flow`
- tool_skill_intents: `["update_coach_preferences"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: attente confirmation

### Tour 11

**User**
> Oui, garde cette préférence : moins de questions, plus direct quand je demande une formulation.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- executed_tools: `["update_coach_preferences"]`
- tool_execution: `success`
- durable_effect: préférence enregistrée comme `coach.question_tendency = low`

### Tour 12

**User**
> Maintenant applique cette préférence : donne-moi directement la phrase prête à envoyer au client, en une seule phrase, sans options.

**Sophia**
> Ok. Voici ta phrase prête à envoyer au client : “Merci pour ton retour ; je confirme qu’on a bien pris en compte tes points, et je reviens vers toi dès que j’ai la phrase finale prête.” 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `attack_card_cancelled_to_conversation`
- tool_skill_intents: `["update_coach_preferences"]`
- executed_tools: `[]`
- durable_effect: aucun nouveau side effect

### Tour 13

**User**
> Est-ce que le nom Vega a été retenu quelque part ? Réponds seulement avec ce que tu sais vraiment, pas ce que tu supposes.

**Sophia**
> D'après ce que je sais vraiment dans notre historique, non, le nom Vega n'a été retenu nulle part.
>
> Je n'ai aucune trace de ce nom dans ton plan actuel, tes rappels ou tes préférences enregistrées. 🧭

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- skill_entry_ids: `["product_help"]`
- durable_effect: aucun

### Tour 14

**User**
> Où je retrouve ou supprime le rappel de 17h35 dans Sophia ? Ne change rien.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 17:35 (Finaliser la phrase de retour client).
> - Préférences coach : oui, moins de questions, challenge équilibré. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- skill_entry_ids: `["product_help"]`
- durable_effect: aucun

### Tour 15

**User**
> Avant de fermer, récapitule exactement ce qui a vraiment été créé ou retenu : potion, rappel, préférence, mémoire du nom client, et ce qui était seulement conversation.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 17:35 (Finaliser la phrase de retour client).
> - Préférences coach : oui, moins de questions, challenge équilibré. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `status_recap_request_blocks_tool_start`
- executed_tools: `[]`
- durable_effect: aucun nouveau side effect

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tours 2-5: contrairement à r10, Sophia ne crée pas de potion session ni de follow-up parasite malgré l'ambiguïté du flow.
- Tour 6: product help potion est nettement plus spécifique à Sophia que r10: onglet `Potions` et arrêt depuis le menu.
- Tour 7: demande de rappel vague clarifiée au lieu d'être exécutée.
- Tour 8: rappel ponctuel créé à l'heure demandée.
- Tour 11: une préférence proche est réellement enregistrée.
- Tour 12: Sophia applique immédiatement le style "direct, sans options" et donne une phrase prête à envoyer.
- Tour 13 + DB: le nom `Vega` n'est pas enregistré en mémoire durable (`memory_items=0`, `user_topic_memories=0`).

**Problemes**
- Tour 1: la demande "un seul micro-pas" reçoit un micro-pas composite puis une question à choix. Impact: Sophia ajoute encore un peu de charge. Sévérité: yellow.
- Tours 3-5: Sophia simule une potion en conversation, mais ne lance pas `select_state_potion`; le statut réel est "aucune potion créée". Impact: UX ambiguë entre "exercice d'apaisement" et "potion produit". Sévérité: yellow.
- Tour 4: après avoir choisi Apaisement, Sophia redemande Apaisement/Courage. Impact: répétition et perte du slot déjà donné. Sévérité: yellow/red.
- Tour 5: la phrase générée est orientée "je m'assure de te répondre", donc pas vraiment prête à envoyer au client depuis le user. Impact: la demande de formulation n'est que partiellement satisfaite. Sévérité: yellow.
- Tour 8: le rappel DB perd une partie du libellé "avant l'envoi de 18h"; réponse visible et DB gardent seulement `Finaliser la phrase de retour client`. Sévérité: yellow.
- Tour 14: product help rappel retombe en statut global au lieu d'indiquer où retrouver/supprimer le rappel. Sévérité: red sur cette surface.
- Tour 15: le récap ne répond pas explicitement à potion/mémoire client/conversation; il sort le statut standard cartes/rappel/préférences. Sévérité: yellow/red.

**Fix propose**
- Clarifier côté UX la différence entre un exercice d'apaisement conversationnel et une vraie potion durable.
- Ne jamais redemander le type de potion après un choix explicite récent.
- Préserver l'instruction complète d'un rappel, surtout quand elle contient une contrainte temporelle métier.
- Restaurer la priorité product help "où retrouver/supprimer un rappel" au lieu du statut global.
- Étendre le récap status-only pour inclure potion session et mémoire client quand le user les demande explicitement.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1: `execution_breakdown` détecté, mais pas de tool lancé, ce qui est correct.
- Tour 2: la demande "explique, ne lance rien" bloque bien le tool avec `explicit_no_tool_request_blocks_tool_start`.
- Tours 3 et 5: `immediate_mode_request_not_state_potion` bloque l'exécution durable de la potion, malgré un "lance-la maintenant". Le système favorise un exercice conversationnel plutôt que le tool.
- Tour 4: `active_select_state_potion_kept_in_tool_skill` conserve un flow actif mais redemande le slot déjà donné.
- Tour 6: bon routage `product_help` pour question produit potion.
- Tour 7: bonne sortie `state_potion_exit_to_conversation`, pas de direct effect exécuté sur rappel vague.
- Tour 8: bon routage `create_one_shot_reminder`, side effect exécuté.
- Tour 9-11: `update_coach_preferences` fonctionne après recadrage vers une préférence supportée.
- Tour 14: mauvais contenu malgré `product_help`: la réponse est status-only, pas aide produit.
- Tour 15: status-only incomplet vis-à-vis de la demande explicite.

**Skills / Operations / Tools**
- `select_state_potion`: partiellement KO. Aucun effet durable parasite, amélioration nette vs r10, mais le tool n'exécute pas une vraie potion quand le user demande explicitement de la lancer.
- `product_help`: OK sur potion active; KO sur rappel 17h35.
- `create_one_shot_reminder`: OK sur création; partiel sur libellé, car `reminder_instruction` perd `avant l'envoi de 18h`.
- `update_coach_preferences`: techniquement OK pour `question_tendency=low`, mais sémantique encore trop générique par rapport à `plus direct quand je demande une formulation`.

**Memory / Effets durables**
- DB vérifiée avant cleanup: 30 `chat_messages`, 1 `scheduled_checkins`, 9 `user_profile_facts`, 0 `user_potion_sessions`, 0 `user_cycles`, 0 `memory_items`, 0 `user_topic_memories`.
- Rappel: `scheduled_for=2026-05-29T15:35:00+00:00`, `reminder_instruction="Finaliser la phrase de retour client"`.
- Préférence: `coach.question_tendency = low`, `source_type=explicit_user`, reason exact du tour 10.
- Non-mémorisation: `Vega` n'est pas présent en mémoire durable dédiée; il reste seulement dans le transcript, ce qui est attendu pour un run conversationnel.
- Potion: aucune session durable, contrairement à r10. Le récap final ne le dit pas explicitement.

**Problemes**
- Tours 3-5: incohérence produit entre "lance la potion" et absence d'effet durable. Impact système: l'utilisateur peut croire qu'une potion est active alors que DB dit non. Sévérité: yellow/red.
- Tour 8: rappel créé via `ai_fallback`, instruction tronquée. Impact système: perte d'information métier. Sévérité: yellow.
- Tour 14: product help rappel toujours masqué par un statut global. Impact système: correction r9 non stable sur variante. Sévérité: red.
- Tour 15: status-only ne couvre pas les entités explicitement demandées (potion, mémoire client, conversation). Impact système: récap non fiable. Sévérité: yellow/red.

**Fix propose**
- Dans `select_state_potion`, distinguer explicitement "exercice immédiat sans session" vs "potion lancée"; si le user dit `lance`, soit créer la session, soit dire clairement que ce n'est qu'un exercice.
- Ajouter un test sur rappel absolu avec clause métier `avant l'envoi de 18h` pour préserver l'instruction complète.
- Renforcer la garde product help rappel pour les formulations "où retrouver/supprimer le rappel".
- Étendre status-only aux potions et à la mémoire durable quand la question les mentionne.

## Verdict Global

- Verdict: yellow
- Raison principale: les régressions critiques de r10 sur follow-up/potion parasite sont améliorées, et le run ne crée pas d'effet durable non consenti. Mais le produit reste ambigu sur potion réellement lancée, product help rappel échoue encore, et le récap final est incomplet.
- Priorité suivante: stabiliser product help rappel, puis clarifier `select_state_potion` entre exercice conversationnel et vraie session durable.
