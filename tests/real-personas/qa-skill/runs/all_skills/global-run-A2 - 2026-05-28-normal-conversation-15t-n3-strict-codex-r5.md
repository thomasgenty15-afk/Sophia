# global-run-A2 - Global Normal Conversation 15T - N3 Strict Codex R5

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A2_20260528_n3_strict_codex_r5`
- Persona: user QA temporaire local `06f31526-2b01-4ea4-898c-d5169c913f59`, email `qa-qa-skill-all-skills-global-run-a2-20260528-n3-strict-codex-r5@example.com`, cree via Auth local puis supprime en cleanup cible.
- Objectif: relancer apres corrections A2 pour verifier si les corrections post-r4 ont repare product help carte/rappel, contexte durable apres creation, recap humain, preference coach et non-execution potion.
- Trajectoire: matinee brouillee -> micro-action sans carte -> phrase + rappel -> product help rappel -> carte d'attaque explicite -> product help carte -> product help rappel -> memoire conversationnelle -> preference coach -> reparation emotionnelle -> recap/no-potion -> cloture emotionnelle.
- Surfaces visees: `execution_breakdown`, opportunite non executee `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, `prepare_attack_card`, memoire conversationnelle, `update_coach_preferences`, `emotional_repair`, `select_state_potion` en opportunite non executee.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `client_now_iso=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse Sophia et de la trace courte precedente. Tous les tours ont retourne HTTP 200. Les effets DB ont ete verifies avant cleanup.

## 2. Tours De Conversation

### Tour 1

**User**
> Matin brouillé: envoyer le devis à Nora, payer le stationnement, et remettre deux tasses en cuisine. Pas de carte, pas d'outil: choisis seulement le premier geste maintenant.

**Sophia**
> Ok. Premier geste maintenant: prends le devis et écris/renvoie-le à Nora. 1 minute, sans te poser de questions 😄
>
> Tu le trouves où, le devis (mail / fichier / papier) ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 2

**User**
> Je l'ai ouvert dans un fichier, mais je repars regarder le stationnement. Toujours pas de carte: juste le geste suivant.

**Sophia**
> Parfait, OK : prends le fichier et fais “Copier/écrire le contenu + envoyer/renvoyer à Nora” dans la foulée. 🎯
>
> Ensuite, pendant que tu regardes le stationnement, fais juste ça en mode automatique: une fois le message prêt, laisse-le en brouillon si besoin, mais ne lance pas une mini-cabane de réflexion. 😄
>
> Tu es censé l’envoyer par email, ou c’est un document à joindre ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 3

**User**
> Je l'ai envoyé à Nora, fait. Donne-moi une phrase courte de suivi pour elle, et rappelle-moi à 11h45 de payer seulement le stationnement.

**Sophia**
> C'est programmé pour jeudi 28 mai à 11:45 : Payer le stationnement.
>
> Phrase courte pour elle : "Je te confirme que je m'en occupe aujourd'hui, et je reviens vers toi dès que c'est fait." 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `normal_reply_default`
- tool_status: `executed`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: DB `scheduled_checkins` row `c3c7e280-dab4-446e-900e-1764f4ab7536`, `scheduled_for=2026-05-28T09:45:00+00:00`, `status=pending`, `event_context=one_shot_reminder:payer_le_stationnement`, `reminder_instruction=Payer le stationnement`

### Tour 4

**User**
> Si je veux vérifier ou annuler ce rappel dans l'app, je vais où ? Ne change rien.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 11:45 (Payer le stationnement).
> - Préférences coach : oui, challenge équilibré, ton bienveillant ferme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `status_only_request_blocks_tool_start`
- tool_status: `answered`
- executed_tools: []
- durable_effect: none

### Tour 5

**User**
> Autre sujet: crée-moi une carte d'attaque pour payer le stationnement sans rouvrir l'appli trois fois. Cible: payer une fois et fermer. Technique: ancre visuelle, avec le post-it 'payé = fermé'.

**Sophia**
> Voici ton brouillon :
> **Stationnement : Payé = Fermé**
> Technique : Ancre visuelle
> Post-it : 'Payé = Fermé'
> Place l'ancre dans ton environnement et utilise-la comme signal de depart.
> Je l'enregistre pour toi ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `pending_confirmation`
- executed_tools: []
- durable_effect: none yet

### Tour 6

**User**
> Oui, enregistre-la exactement comme ça.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Stationnement : Payé = Fermé
> Technique : Ancre visuelle
> Post-it : 'Payé = Fermé'
>
> Mode d'emploi : Place l'ancre dans ton environnement et utilise-la comme signal de depart.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `normal_reply_default`
- tool_status: `executed`
- executed_tools: [`prepare_attack_card`]
- durable_effect: DB `user_attack_cards` row `813465d4-d4b7-437f-9174-325e8129330b`, `status=active`, `scope_kind=out_of_plan`, title "Stationnement : Payé = Fermé"

### Tour 7

**User**
> Où est-ce que je retrouve cette carte d'attaque dans l'app ? Juste l'emplacement, pas d'action.

**Sophia**
> Tu la retrouves dans Dashboard > Ressources > Cartes d’attaque du plan. 🔎

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- executed_tools: []
- durable_effect: none

### Tour 8

**User**
> Et le rappel ponctuel de 11h45, je le vérifie ou je l'annule où ? Réponds juste l'emplacement, sans modifier.

**Sophia**
> Je ne touche pas au plan : tu parles du rappel ponctuel. Je ne peux pas modifier ce rappel en douce ici ; si tu veux, je peux créer un nouveau rappel au nouvel horaire après confirmation explicite, et l'ancien restera actif tant que je ne confirme pas son annulation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `status_only_request_blocks_tool_start`
- tool_status: `existing_reminder_modification_needs_explicit_reprogramming`
- executed_tools: []
- durable_effect: none

### Tour 9

**User**
> Ok. Résume ce que tu dois retenir de mon piège de ce matin, seulement ce qui sert pour la suite.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Stationnement : Payé = Fermé).
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 11:45 (Payer le stationnement).
> - Préférences coach : oui, challenge équilibré, ton bienveillant ferme.
> - Piège / fragile : je le traite comme repère de conversation, pas comme écriture durable. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `normal_reply_default`
- tool_status: `answered`
- executed_tools: []
- durable_effect: none

### Tour 10

**User**
> Pour la suite, enregistre une préférence durable: quand je dis 'court', zéro emoji, trois lignes max, et pas de question finale inutile.

**Sophia**
> Bien reçu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. quand tu demandes court, je répondrai en trois lignes maximum. quand tu demandes court, je n'utiliserai pas d'emoji. quand tu demandes court, je ne finirai pas par une question inutile. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- tool_status: `pending_confirmation`
- executed_tools: []
- durable_effect: none yet

### Tour 11

**User**
> Oui, garde cette préférence exactement comme ça.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. quand tu demandes court, je répondrai en trois lignes maximum. quand tu demandes court, je n'utiliserai pas d'emoji. quand tu demandes court, je ne finirai pas par une question inutile. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- tool_status: `executed`
- executed_tools: [`update_coach_preferences`]
- durable_effect: DB `user_profile_facts` ajoute `coach.emoji_policy=none`, `coach.response_max_lines=three`, `coach.final_question_policy=avoid_unnecessary`, `coach.question_tendency=low`

### Tour 12

**User**
> Je me sens un peu nul parce que je me suis encore fait embarquer par l'appli et les rappels. Pas de danger, juste honteux. Réponds court.

**Sophia**
> Ah merde… la honte, c’est vraiment une saleté. Mais là, “je me suis encore fait embarquer” ne veut pas dire “je suis nul” : ça veut dire que l’habitude de l’appli est plus forte que toi sur le moment.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: low
- executed_tools: []
- durable_effect: none

### Tour 13

**User**
> Ne lance rien maintenant, pas de potion, pas de nouveau rappel. Fais seulement le récap: fait, prévu, fragile, en trois lignes.

**Sophia**
> Ça marche, on laisse les potions de côté pour l'instant. On part sur ton récap ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- tool_status: `ask_question`
- executed_tools: []
- durable_effect: none

### Tour 14

**User**
> Oui, le récap maintenant. Trois lignes: fait, prévu, fragile. Pas de question, pas d'outil.

**Sophia**
> Fait : carte d’attaque “Stationnement : Payé = Fermé” en place.
> Prévu : rappel ponctuel “Payer le stationnement” à 09:45.
> Fragile : tu te fais facilement embarquer par l’appli/rappels (honte = normal, mais on resserre).

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `active_skill_exit_requested`
- executed_tools: []
- durable_effect: none

### Tour 15

**User**
> Dernier tour: réponds à mon émotion, pas au système. Une phrase courte sans emoji pour que je reparte sans honte.

**Sophia**
> Pour laisser cette honte de côté, tu préfères une potion de guérison pour réparer ou une potion d'amour pour la douceur ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
- tool_status: `ask_question`
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tours 1-2: le faux demarrage `prepare_attack_card` reste corrige. Sophia reste en conversation normale quand l'utilisateur refuse carte/outil.
- Tour 3: la composition phrase + rappel est toujours corrigee; les deux sous-demandes sont traitees.
- Tours 5-7: progression nette vs r4. La carte est creee, puis la question "ou retrouver cette carte" recoit enfin un emplacement carte, pas le rappel.
- Tour 11: la preference "court" est appliquee durablement en DB.
- Tour 12: `emotional_repair` respecte la preference sans emoji et reste court.
- Tour 14: quand l'utilisateur re-confirme le recap, Sophia produit enfin les trois lignes "fait / prévu / fragile".

**Problemes**
- Tour 4: la demande "ou verifier ou annuler ce rappel dans l'app" retombe encore sur un statut systeme, pas un emplacement produit. Impact: aide produit rappel non resolue. Severite: red.
- Tour 8: la demande explicite d'emplacement rappel n'obtient pas l'emplacement, seulement une explication de non-modification/reprogrammation. Impact: l'utilisateur ne sait toujours pas ou verifier ou annuler. Severite: yellow/red.
- Tour 9: la memoire conversationnelle demandee est remplacee par un status recap. Impact: Sophia ne resume pas le piege humain, elle affiche l'etat des objets. Severite: red.
- Tour 13: "pas de potion, pas de nouveau rappel, fais seulement le recap" provoque une question de confirmation au lieu du recap. Impact: friction inutile, non-respect de "pas de question". Severite: yellow.
- Tour 14: le recap est structurellement bon, mais affiche `09:45` au lieu de `11:45` en heure utilisateur. Impact: confusion horaire visible. Severite: red.
- Tour 15: demande explicite de reparation emotionnelle courte, mais Sophia lance une question `select_state_potion`. Impact: violation de l'intention conversationnelle et de la trajectoire no-potion. Severite: red.

**Fix propose**
- Distinguer "ou verifier/annuler un rappel" de "modifier un rappel" dans product help; fournir l'emplacement avant toute explication de modification.
- Faire passer les demandes "resume ce que tu dois retenir de mon piege" par un recap humain, pas le status resolver.
- Dans les recaps visibles, formater les heures en timezone utilisateur (`Europe/Paris`) et non en UTC.
- Bloquer `select_state_potion` quand le user demande explicitement "reponds a mon emotion, pas au systeme" ou "une phrase courte".

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1-2: green. `attack_card_cancelled_to_conversation`, aucun outil execute.
- Tour 3: green. `create_one_shot_reminder` execute, DB correcte, reponse composee avec phrase.
- Tour 4: red. `status_only_request_blocks_tool_start` capture encore une demande product help rappel.
- Tour 7: green. `product_help` cible bien la carte et repond avec un emplacement.
- Tour 8: yellow/red. Le router evite un side effect, mais `status_only_request_blocks_tool_start` devient une reponse de modification/reprogrammation au lieu d'aide produit.
- Tour 9: red. `normal_reply_default` + `tool_status=answered` ressort le status resolver pour une demande memoire/recap humain.
- Tour 15: red. `selected_handler=select_state_potion` sur une demande explicite de reparation emotionnelle courte.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: green. DB confirme 1 `scheduled_checkins` pending a `2026-05-28T09:45:00+00:00` (= 11:45 Europe/Paris), instruction "Payer le stationnement".
- `prepare_attack_card`: green. DB confirme 1 carte active `Stationnement : Payé = Fermé`, contenu conforme.
- `product_help` carte: green. Le tour 7 corrige le probleme r4 carte vs rappel.
- `product_help` rappel: red/yellow. Aucun side effect, mais pas d'emplacement produit.
- `update_coach_preferences`: green cote DB. Les 4 preferences explicites sont presentes: `coach.emoji_policy=none`, `coach.response_max_lines=three`, `coach.final_question_policy=avoid_unnecessary`, `coach.question_tendency=low`.
- `emotional_repair`: green au tour 12, red au tour 15 car supplanté par `select_state_potion`.
- `select_state_potion`: red. Aucune execution durable, mais proposition active au mauvais moment.

**Memory / Effets durables**
- Avant cleanup:
  - `scheduled_checkins`: 1 ligne pending correcte, `event_context=one_shot_reminder:payer_le_stationnement`.
  - `user_attack_cards`: 1 ligne active, `scope_kind=out_of_plan`, contenu conforme.
  - `user_profile_facts`: 12 lignes, dont 4 preferences explicites utilisateur pour la regle "court".
  - `conversation_turn_traces`: 15 lignes.
  - `chat_messages`: 30 lignes.
- Apres cleanup cible: `scheduled_checkins=0`, `user_attack_cards=0`, `user_profile_facts=0`, `user_chat_states=0`, `chat_messages=0`, `conversation_turn_traces=0`; user Auth supprime.

**Problemes**
- Tour 8: le tool/status path confond aide produit rappel et modification rappel. Impact systeme: la question "ou" n'est pas servie. Severite: yellow/red.
- Tour 9: status resolver trop prioritaire sur memoire conversationnelle. Impact systeme: mauvaise surface et recap humain rate. Severite: red.
- Tour 14: conversion timezone absente dans une reponse visible. Impact systeme: l'effet durable est correct en UTC, mais le rendu utilisateur est faux. Severite: red.
- Tour 15: `select_state_potion` reste actif alors que le user demande une phrase emotionnelle. Impact systeme: mauvaise arbitration entre tool skill et skill conversationnel. Severite: red.

**Fix propose**
- Ajouter une garde `product_help_location_request` avant `status_only_request_blocks_tool_start`, avec entite `one_shot_reminder` vs `attack_card`.
- Ajouter une garde `human_memory_recap_request` pour bloquer le status resolver quand le user demande "ce que tu dois retenir".
- Centraliser le rendu horaire user-facing via timezone du client, surtout dans les recaps.
- Ajouter une sortie explicite de `select_state_potion` si le dernier message contient "pas au système", "une phrase", "sans potion", ou demande une reparation emotionnelle directe.

## Verdict Global

- Verdict: red
- Raison principale: r5 confirme de vraies corrections (`prepare_attack_card`, product help carte, preference coach, phrase + rappel), mais les corrections ne suffisent pas encore: product help rappel, memoire/recap humain, timezone visible et `select_state_potion` restent bloquants.
- Follow-up prioritaire: corriger l'arbitrage product help/status pour les rappels et la garde anti-potion sur reparation emotionnelle, puis relancer un A2 codex-r6 centre sur rappel location + recap humain + no-potion final.
