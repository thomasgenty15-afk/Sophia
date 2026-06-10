# global-run-A2 - Global Normal Conversation 15T - N3 Strict Codex R6

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A2_20260528_n3_strict_codex_r6`
- Persona: user QA temporaire local `bd494a24-9abc-42dd-82b7-dcd5e2ae7271`, email `qa-qa-skill-all-skills-global-run-a2-20260528-n3-strict-codex-r6@example.com`, cree via Auth local puis supprime en cleanup cible.
- Objectif: relancer apres corrections A2 pour verifier les fixes sur product help rappel, contexte durable carte, recap humain, preferences coach et garde anti-potion.
- Trajectoire: matin flou -> micro-action sans carte -> phrase + rappel -> product help rappel -> carte d'attaque explicite -> product help carte -> product help rappel -> memoire conversationnelle -> preference coach -> reparation emotionnelle -> recap/no-potion -> cloture emotionnelle sans potion.
- Surfaces visees: `execution_breakdown`, opportunite non executee `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, `prepare_attack_card`, memoire conversationnelle, `update_coach_preferences`, `emotional_repair`, `select_state_potion` en opportunite non executee.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `client_now_iso=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse Sophia et de la trace courte precedente. Tous les tours ont retourne HTTP 200. Les effets DB ont ete verifies avant cleanup.

## 2. Tours De Conversation

### Tour 1

**User**
> Matin flou: envoyer le reçu à Malo, payer le parcmètre, et vider deux assiettes. Pas de carte ni d'outil: donne-moi juste le premier geste maintenant.

**Sophia**
> Ok. Ton premier geste maintenant: prends ton téléphone, ouvre tes messages/app reçus, et écris juste “Je te l’envoie” à Malo. 📩
>
> Ensuite, tu fais quoi: tu trouves le reçu tout de suite ou tu dois d’abord le chercher ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 2

**User**
> J'ai trouvé le reçu mais je reviens au parcmètre dans ma tête. Toujours pas de carte: donne-moi seulement le geste suivant.

**Sophia**
> Parfait. Ton geste suivant : remets-toi en mode “parcmètre” et lance le paiement tout de suite sur ton appli/site, sans réfléchir plus. 🚗
>
> Le parcmètre, c’est plutôt via appli ou via site web ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 3

**User**
> Paiement ouvert, pas encore fait. Donne-moi une phrase courte pour Malo, et rappelle-moi à 11h50 de payer seulement le parcmètre.

**Sophia**
> C'est programmé pour jeudi 28 mai à 11:50 : Payer le parcmètre.
>
> Phrase courte pour Malo : "Je te confirme que je m'en occupe aujourd'hui, et je reviens vers toi dès que c'est fait." 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `normal_reply_default`
- tool_status: `executed`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: DB `scheduled_checkins` row `42b5510d-41f2-40b0-abd3-147c58098d1c`, `scheduled_for=2026-05-28T09:50:00+00:00`, `status=pending`, `event_context=one_shot_reminder:payer_le_parcmetre`, `reminder_instruction=Payer le parcmètre`

### Tour 4

**User**
> Pour le rappel de 11h50, si je veux le vérifier ou l'annuler dans l'app, je vais où ? Juste l'emplacement, ne change rien.

**Sophia**
> Je ne touche pas au plan : tu parles du rappel ponctuel. Je ne peux pas modifier ce rappel en douce ici ; si tu veux, je peux créer un nouveau rappel au nouvel horaire après confirmation explicite, et l'ancien restera actif tant que je ne confirme pas son annulation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `status_recap_request_blocks_tool_start`
- tool_status: `existing_reminder_modification_needs_explicit_reprogramming`
- executed_tools: []
- durable_effect: none

### Tour 5

**User**
> Autre sujet: crée-moi une carte d'attaque pour payer le parcmètre sans rouvrir l'appli. Cible: payer une fois puis fermer. Technique: ancre visuelle, avec le post-it 'payé puis fermé'.

**Sophia**
> Voici ton brouillon :
> *Parcmètre : Payé & Fermé* (Ancre visuelle)
> Texte : Payé puis fermé
> Place ce post-it en évidence dans ta voiture et utilise-le comme signal pour fermer l'appli dès le paiement fait.
> Est-ce que je crée cette carte ? 🙂

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
> Oui, crée-la exactement avec ce brouillon.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Parcmètre : Payé & Fermé
> Technique : Ancre visuelle
> Payé puis fermé
>
> Mode d'emploi : Place ce post-it en évidence dans ta voiture et utilise-le comme signal pour fermer l'appli dès le paiement fait.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `executed`
- executed_tools: [`prepare_attack_card`]
- durable_effect: DB `user_attack_cards` row `588cdb6a-8c1e-49c7-899e-de2cd5d3c768`, `status=active`, `scope_kind=out_of_plan`, title "Parcmètre : Payé & Fermé"

### Tour 7

**User**
> Où est-ce que je retrouve cette carte d'attaque dans l'app ? Juste l'emplacement.

**Sophia**
> Je te la situe exactement : Dashboard > Ressources. 📍
>
> Dans “Ressources”, tu vas vers la section Cartes d’attaque (celle liée à ton action “Parcmètre”). 🚗

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- executed_tools: []
- durable_effect: none

### Tour 8

**User**
> Et pour le rappel ponctuel de 11h50, juste l'emplacement où je peux le vérifier dans l'app, sans parler de le modifier.

**Sophia**
> Je ne touche pas au plan : tu parles du rappel ponctuel. Je ne peux pas modifier ce rappel en douce ici ; si tu veux, je peux créer un nouveau rappel au nouvel horaire après confirmation explicite, et l'ancien restera actif tant que je ne confirme pas son annulation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `one_shot_reminder_modification_not_adjust_plan`
- tool_status: `existing_reminder_modification_needs_explicit_reprogramming`
- executed_tools: []
- durable_effect: none

### Tour 9

**User**
> Ok. Résume ce que tu dois retenir de mon piège de ce matin, pas les statuts système: seulement ce qui sert pour la suite.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Parcmètre : Payé & Fermé).
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 11:50 (Payer le parcmètre).
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
> Je me sens un peu nul parce que l'histoire du rappel m'a encore embrouillé. Pas de danger, juste honteux. Réponds court.

**Sophia**
> Ah merde… la honte te fait croire que tu “es nul”, alors que t’es juste tombé sur un truc confus.
> L’important maintenant, c’est que tu repères le prochain petit geste: payer le parcmètre, puis “payé puis fermé”.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- executed_tools: []
- durable_effect: none

### Tour 13

**User**
> Ne lance rien maintenant, pas de potion, pas de nouveau rappel. Fais seulement le récap: fait, prévu, fragile, en trois lignes.

**Sophia**
> Ça marche, pas de potion. On fait le point sur ce qui est fait, prévu et fragile ?

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
> Oui. Trois lignes maintenant: fait, prévu, fragile. Pas de question, pas d'outil, heure en France.

**Sophia**
> Je te suis. Qu'est-ce qui te pèse le plus là-dedans ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `immediate_mode_request_not_state_potion`
- tool_status: `ask_question`
- executed_tools: []
- durable_effect: none

### Tour 15

**User**
> Dernier tour: réponds à mon émotion, pas au système et pas de potion. Une phrase courte sans emoji pour que je reparte sans honte.

**Sophia**
> T’as pas besoin d’avoir honte : tu as juste été embrouillé, et là tu reprends le contrôle pas à pas.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tours 1-2: le faux demarrage `prepare_attack_card` reste corrige.
- Tour 3: la composition phrase + rappel reste corrigee.
- Tours 5-7: `prepare_attack_card` et product help carte restent bons; la carte est creee puis retrouvable dans `Dashboard > Ressources > Cartes d'attaque`.
- Tour 11: la preference "court" est bien appliquee durablement.
- Tour 12: reparation emotionnelle courte, sans emoji, pertinente.
- Tour 15: correction partielle du r5: avec "pas de potion" explicite, Sophia ne lance plus `select_state_potion`.

**Problemes**
- Tours 4 et 8: product help rappel reste non corrige. Sophia repond sur la non-modification/reprogrammation au lieu de donner l'emplacement de verification/annulation. Impact: l'utilisateur ne sait toujours pas ou retrouver le rappel. Severite: red.
- Tour 9: la demande "ce que tu dois retenir de mon piege" retombe encore sur le status resolver, malgre "pas les statuts systeme". Impact: memoire conversationnelle ratee. Severite: red.
- Tours 13-14: le recap "fait / prévu / fragile" echoue deux fois. Sophia pose une question au lieu de fournir les trois lignes, meme apres confirmation explicite "pas de question". Impact: experience bloquee et non-respect direct de la consigne. Severite: red.
- Tour 15: la phrase emotionnelle est bonne, mais le routage reste `normal_reply` et pas `emotional_repair`; acceptable humainement, warning systeme. Severite: yellow.

**Fix propose**
- Prioriser `product_help` quand la demande contient "ou/verifier/annuler dans l'app" + entite `rappel ponctuel`, meme si les mots "annuler/modifier" sont presents.
- Bloquer le status resolver quand le user dit explicitement "pas les statuts systeme".
- Pour les recaps en trois lignes, supprimer la clarification si les champs attendus sont fournis par le user (`fait`, `prevu`, `fragile`).

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1-2: green. `attack_card_cancelled_to_conversation`, aucun outil execute.
- Tour 3: green. `create_one_shot_reminder` execute, DB correcte, reponse composee avec phrase.
- Tours 4 et 8: red. Les demandes product help rappel routent vers `status_recap_request_blocks_tool_start` / `one_shot_reminder_modification_not_adjust_plan` et `existing_reminder_modification_needs_explicit_reprogramming`.
- Tour 7: green. `product_help` carte fonctionne.
- Tour 9: red. `normal_reply_default` + `tool_status=answered` sert le status resolver au lieu du recap/memoire humain.
- Tours 13-14: red. `explicit_no_tool_request_blocks_tool_start` puis `immediate_mode_request_not_state_potion` bloquent les side effects mais ne produisent pas la reponse demandee.
- Tour 15: yellow. Garde anti-potion OK avec `explicit_no_tool_request_blocks_tool_start`, mais pas de `emotional_repair`.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: green. DB confirme 1 `scheduled_checkins` pending a `2026-05-28T09:50:00+00:00` (= 11:50 Europe/Paris), instruction "Payer le parcmètre".
- `prepare_attack_card`: green. DB confirme 1 carte active `Parcmètre : Payé & Fermé`, contenu conforme.
- `product_help` carte: green.
- `product_help` rappel: red. Aucun side effect incorrect, mais pas d'emplacement produit.
- `update_coach_preferences`: green cote DB. Les 4 preferences explicites sont presentes: `coach.emoji_policy=none`, `coach.response_max_lines=three`, `coach.final_question_policy=avoid_unnecessary`, `coach.question_tendency=low`.
- `select_state_potion`: yellow/green sur ce run strict. Le tour 15 ne lance plus la potion quand "pas de potion" est explicite; le tour 14 montre `immediate_mode_request_not_state_potion`.

**Memory / Effets durables**
- Avant cleanup:
  - `scheduled_checkins`: 1 ligne pending correcte, `event_context=one_shot_reminder:payer_le_parcmetre`.
  - `user_attack_cards`: 1 ligne active, `scope_kind=out_of_plan`, contenu conforme.
  - `user_profile_facts`: 12 lignes, dont 4 preferences explicites utilisateur pour la regle "court".
  - `conversation_turn_traces`: 15 lignes.
  - `chat_messages`: 30 lignes.
- Apres cleanup cible: `scheduled_checkins=0`, `user_attack_cards=0`, `user_profile_facts=0`, `user_chat_states=0`, `chat_messages=0`, `conversation_turn_traces=0`; user Auth supprime.

**Problemes**
- Tours 4/8: l'intention "emplacement rappel" est confondue avec "modifier/reprogrammer rappel". Impact systeme: mauvais handler/reponse malgre entite correcte. Severite: red.
- Tour 9: status resolver trop prioritaire sur memoire conversationnelle explicite. Severite: red.
- Tours 13-14: no-tool recap aboutit a `ask_question`; la garde anti-tool bloque l'effet mais pas la clarification inutile. Severite: red.

**Fix propose**
- Ajouter une garde `one_shot_reminder_product_location` avant toute logique de modification de rappel.
- Ajouter une sortie `human_memory_recap_request` avant status resolver quand le message contient "retenir", "piege", "pas les statuts systeme".
- Ajouter un renderer direct pour `fait/prevu/fragile` quand les trois labels sont presents et que `pas de question` est explicite.

## Verdict Global

- Verdict: red
- Raison principale: les effets durables principaux restent corriges et product help carte tient, mais product help rappel, memoire/recap humain et recap no-question restent rouges.
- Follow-up prioritaire: corriger l'arbitrage rappel-location vs rappel-modification, puis relancer un A2 codex-r7 centre sur "ou verifier/annuler le rappel" + "fait/prevu/fragile sans question".
