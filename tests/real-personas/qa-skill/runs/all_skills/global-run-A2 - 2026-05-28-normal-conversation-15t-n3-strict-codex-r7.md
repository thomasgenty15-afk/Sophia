# global-run-A2 - Global Normal Conversation 15T - N3 Strict Codex R7

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A2_20260528_n3_strict_codex_r7`
- Persona: user QA temporaire local `2d05183d-f662-4997-899a-d3c2d09de93b`, email `qa-qa-skill-all-skills-global-run-a2-20260528-n3-strict-codex-r7@example.com`, cree via Auth local puis supprime en cleanup cible.
- Objectif: relancer apres corrections A2 pour verifier les fixes sur product help rappel, recap humain, recap `fait / prévu / fragile`, carte explicite et garde anti-potion.
- Trajectoire: matin melange -> micro-action sans carte -> phrase + rappel -> product help rappel -> carte d'attaque explicite -> product help carte -> memoire conversationnelle -> preference coach -> reparation emotionnelle -> recap/no-potion -> cloture emotionnelle.
- Surfaces visees: `execution_breakdown`, opportunite non executee `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, `prepare_attack_card`, memoire conversationnelle, `update_coach_preferences`, `emotional_repair`, `select_state_potion` en opportunite non executee.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `client_now_iso=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse Sophia et de la trace courte precedente. Tous les tours ont retourne HTTP 200. Les effets DB ont ete verifies avant cleanup.

## 2. Tours De Conversation

### Tour 1

**User**
> Matin mélangé: envoyer la photo à Inès, payer le parking, et ranger deux verres. Pas de carte ni d'outil: donne-moi juste le premier geste maintenant.

**Sophia**
> Ok. Premier geste maintenant : prends 10 secondes et envoie la photo à Inès. 📸
>
> Tu veux le faire via WhatsApp ou par SMS ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 2

**User**
> Photo ouverte, mais je repars vérifier le parking. Toujours pas de carte: donne-moi seulement le geste suivant.

**Sophia**
> Ok. Fais juste ça maintenant : vérifie le parking 2 minutes, sans te disperser. 🚗
>
> Après, tu reviens ici et on enchaîne sur l’envoi à Inès. Oui ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 3

**User**
> Parking vérifié. Donne-moi une phrase courte pour Inès, et rappelle-moi à 11h55 de payer seulement le parking.

**Sophia**
> C'est programmé pour jeudi 28 mai à 11:55 : Payer seulement le parking.
>
> Phrase courte pour Inès : "Je te confirme que je m'en occupe aujourd'hui, et je reviens vers toi dès que c'est fait." 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- tool_status: `executed`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: DB `scheduled_checkins` row `f3349bcd-10bf-47f1-9257-9e6a5035cc0d`, `scheduled_for=2026-05-28T09:55:00+00:00`, `status=pending`, `event_context=one_shot_reminder:payer_seulement_le_parking`, `reminder_instruction=Payer seulement le parking`

### Tour 4

**User**
> Pour ce rappel ponctuel de 11h55, où est-ce que je peux le vérifier ou l'annuler dans l'app ? Juste l'emplacement, sans modifier.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 11:55 (Payer seulement le parking).
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
> Autre sujet: crée-moi une carte d'attaque pour payer le parking sans rouvrir l'appli. Cible: payer une fois puis fermer. Technique: ancre visuelle, avec le post-it 'payé et fermé'.

**Sophia**
> Je n'ai pas réussi à préparer cette carte techniquement. Je préfère m'arrêter plutôt que deviner à ta place. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `fallback_dashboard`
- executed_tools: [`prepare_attack_card`]
- durable_effect: DB later shows no card from this turn

### Tour 6

**User**
> Cible claire: payer le parking une fois puis fermer l'appli. Garde 'payé et fermé'. Réessaie de préparer la carte, puis demande-moi confirmation si besoin.

**Sophia**
> Voici ta carte 'Parking & Focus' (Mot de bascule).
> Ton mot-clé : payé et fermé
> Envoie-le moi dès que tu as payé pour sceller l'action et fermer l'appli.
> Est-ce que je crée cette carte pour toi ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `pending_confirmation`
- executed_tools: []
- durable_effect: none yet

### Tour 7

**User**
> Oui, crée cette carte.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Parking & Focus
> Technique : Mot de bascule
> payé et fermé
>
> Mode d'emploi : Envoie seulement ce mot quand tu sens que tu peux craquer; je reprendrai le contexte.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Le mot de cette carte peut etre remplace depuis cette zone; pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `executed`
- executed_tools: [`prepare_attack_card`]
- durable_effect: DB `user_attack_cards` row `5b6ea229-25bf-47b0-9e8d-be038b85efe7`, `status=active`, but technique `pre_engagement` / "Mot de bascule" instead of requested `ancre_visuelle`

### Tour 8

**User**
> Où est-ce que je retrouve cette carte d'attaque dans l'app ? Juste l'emplacement.

**Sophia**
> Tu la retrouves dans Dashboard > Ressources > Cartes d’attaque du plan. ⚡🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- executed_tools: []
- durable_effect: none

### Tour 9

**User**
> Résume ce que tu dois retenir de mon piège de ce matin, pas les statuts système: seulement le piège utile pour la suite.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Parking & Focus).
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 11:55 (Payer seulement le parking).
> - Préférences coach : oui, challenge équilibré, ton bienveillant ferme.
> - Piège / fragile : je le traite comme repère de conversation, pas comme écriture durable. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `central_arbitrator_explicit_no_status_request`
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
> Je me sens nul parce que même la carte a changé de technique et le rappel est flou. Pas de danger, juste honteux. Réponds court.

**Sophia**
> Ah merde… la honte te fait croire que “si ça change, c’est toi le problème”. Mais non : une carte qui évolue et un rappel pas clair, c’est juste de l’imperfection, pas de ta valeur.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- executed_tools: []
- durable_effect: none

### Tour 13

**User**
> Ne lance rien maintenant, pas de potion, pas de nouveau rappel. Fais seulement le récap: fait, prévu, fragile, en trois lignes. Pas de question.

**Sophia**
> C'est entendu, pas de potion ni de rappel. Je m'occupe de ton récap en trois lignes.

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
> Fais-le maintenant: trois lignes seulement, fait / prévu / fragile, heure France, pas de question.

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
> Ok… la honte, c’est juste ton cerveau qui confond “ça a dérapé” avec “tu vaux moins”. Tu peux réparer sans te détester.

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
- Tour 3: phrase + rappel reste corrige; le rappel est cree et la phrase est fournie.
- Tour 8: product help carte reste corrige.
- Tour 11: preference coach durable reste corrigee en DB.
- Tour 12: reparation emotionnelle courte et pertinente.
- Tour 15: pas de `select_state_potion` quand "pas de potion" est explicite.

**Problemes**
- Tour 4: product help rappel reste non corrige. La question "ou verifier/annuler dans l'app" recoit un status systeme, pas un emplacement. Severite: red.
- Tours 5-7: regression `prepare_attack_card`. Le premier essai echoue en `fallback_dashboard`, puis le retry change la technique demandee `ancre visuelle` en `Mot de bascule`. Impact: objet durable cree mais non conforme. Severite: red.
- Tour 9: la demande "pas les statuts systeme" route bien avec `central_arbitrator_explicit_no_status_request`, mais la reponse affiche quand meme le status resolver. Impact: correction de route insuffisante. Severite: red.
- Tours 13-14: recap `fait / prévu / fragile` toujours casse. Sophia promet de le faire puis pose une question, malgre "pas de question". Severite: red.
- Tour 15: contenu humain correct, mais owner `normal_reply`, pas `emotional_repair`; warning systeme. Severite: yellow.

**Fix propose**
- Pour `prepare_attack_card`, respecter strictement la technique utilisateur si elle est coherente, ou demander confirmation avant tout changement de technique.
- Brancher `central_arbitrator_explicit_no_status_request` sur un renderer recap humain, pas sur le status resolver.
- Ajouter un renderer direct `fait/prevu/fragile` qui ne pose jamais de question si l'utilisateur a donne les trois labels.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1-2: green. `attack_card_cancelled_to_conversation`, aucun outil execute.
- Tour 3: green. `create_one_shot_reminder` execute, DB correcte.
- Tour 4: red. `status_only_request_blocks_tool_start` capture encore une demande product help rappel.
- Tour 5: red. `prepare_attack_card` retourne `fallback_dashboard` avec `executed_tools=[prepare_attack_card]` mais aucun durable effect.
- Tour 9: red. `central_arbitrator_explicit_no_status_request` existe, mais le rendu visible reste status.
- Tours 13-14: red. `explicit_no_tool_request_blocks_tool_start` puis `immediate_mode_request_not_state_potion` bloquent les side effects mais produisent `ask_question`.
- Tour 15: yellow. Anti-potion OK, mais pas de `emotional_repair`.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: green. DB confirme 1 `scheduled_checkins` pending a `2026-05-28T09:55:00+00:00` (= 11:55 Europe/Paris), instruction "Payer seulement le parking".
- `prepare_attack_card`: red. DB confirme 1 carte active, mais technique `pre_engagement` / "Mot de bascule" au lieu de `ancre_visuelle` demandee.
- `product_help` carte: green.
- `product_help` rappel: red.
- `update_coach_preferences`: green cote DB. Les 4 preferences explicites sont presentes.
- `select_state_potion`: green/yellow. Ne se lance pas quand "pas de potion" est explicite.

**Memory / Effets durables**
- Avant cleanup:
  - `scheduled_checkins`: 1 ligne pending correcte, `event_context=one_shot_reminder:payer_seulement_le_parking`.
  - `user_attack_cards`: 1 ligne active, mais technique non conforme (`pre_engagement` au lieu de `ancre_visuelle`).
  - `user_profile_facts`: 12 lignes, dont 4 preferences explicites utilisateur pour la regle "court".
  - `conversation_turn_traces`: 15 lignes.
  - `chat_messages`: 30 lignes.
- Apres cleanup cible: `scheduled_checkins=0`, `user_attack_cards=0`, `user_profile_facts=0`, `user_chat_states=0`, `chat_messages=0`, `conversation_turn_traces=0`; user Auth supprime.

**Problemes**
- Tour 4: rappel-location toujours capture par status-only. Severite: red.
- Tours 5-7: tool skill attack card cree un effet durable non conforme a la technique utilisateur. Severite: red.
- Tour 9: le nouveau route reason `central_arbitrator_explicit_no_status_request` ne suffit pas si le renderer reste status. Severite: red.
- Tours 13-14: no-tool recap aboutit a `ask_question`, non a une reponse. Severite: red.

**Fix propose**
- Ajouter un test `prepare_attack_card` qui verifie la preservation de `ancre_visuelle` quand l'utilisateur la demande explicitement.
- Deconnecter `central_arbitrator_explicit_no_status_request` du status renderer.
- Forcer un `normal_reply` direct sur les demandes recap labellisees `fait/prevu/fragile`.

## Verdict Global

- Verdict: red
- Raison principale: r7 garde les corrections rappel/phrase, preference coach, product help carte et anti-potion explicite, mais product help rappel reste faux et `prepare_attack_card` regresse avec une carte durable non conforme.
- Follow-up prioritaire: corriger `prepare_attack_card` preservation de technique et renderer de recap no-status, puis relancer un A2 codex-r8 plus court centre sur ces deux points.
