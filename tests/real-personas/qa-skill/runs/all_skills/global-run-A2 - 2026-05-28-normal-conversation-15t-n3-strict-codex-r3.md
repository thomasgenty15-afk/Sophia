# global-run-A2 - Global Normal Conversation 15T - N3 Strict Codex R3

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A2_20260528_n3_strict_codex_r3`
- Persona: user QA temporaire local `0923cf65-6b71-44e2-8d2f-7d3d85a8668e`, email `qa-qa-skill-all-skills-global-run-a2-20260528-n3-strict-codex-r3@example.com`, cree via Auth local puis supprime en cleanup cible.
- Objectif: relancer apres corrections A2 pour verifier si les corrections ont ameliore la synchronicite entre skills conversationnels, tools always-on et tool skills.
- Trajectoire: matinee brouillee -> micro-action -> phrase courte + rappel -> product help rappel -> carte d'attaque explicite -> memoire conversationnelle -> preference coach -> reparation emotionnelle -> recap/no-potion -> reparation finale.
- Surfaces visees: `execution_breakdown`, opportunite non executee `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, `prepare_attack_card`, memoire conversationnelle, `update_coach_preferences`, `emotional_repair`, non-execution `select_state_potion`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `client_now_iso=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse Sophia et de la trace courte precedente. Tous les tours ont retourne HTTP 200. Les effets DB ont ete verifies avant cleanup, puis les artefacts du user QA ont ete supprimes.

## 2. Tours De Conversation

### Tour 1

**User**
> J'ai une matinee brouillee: appeler le cabinet, repondre a Samir, et vider les papiers sur la table. Je ne veux pas de carte ni d'outil, juste le premier geste a faire maintenant.

**Sophia**
> Ok, on fait simple et rapide. 😄
>
> Premier geste maintenant: tu prends ton telephone et tu appelles le cabinet tout de suite. (Meme si tu n'as pas "tout" pret.)
>
> Tu as le numero sous la main, oui ou non ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 2

**User**
> Oui j'ai le numero, mais je relis la page du cabinet au lieu d'appeler. Pas de carte: donne-moi juste le geste suivant.

**Sophia**
> Ok. Le geste suivant: tu ouvres le telephone et tu lances l'appel au cabinet maintenant, meme si tu n'as pas tout sous les yeux. 📞
>
> Tu veux appeler tout de suite, ou tu as 1 seul truc a finir avant ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 3

**User**
> J'ai appele, c'est fait. Maintenant donne-moi une phrase courte pour Samir, et rappelle-moi a 11h40 de ranger seulement trois papiers.

**Sophia**
> C'est programme pour jeudi 28 mai a 11:40 : Ranger trois papiers. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `normal_reply_default`
- tool_status: `executed`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: DB `scheduled_checkins` row `90870289-9a76-43ab-bec9-fed70ffc17ed`, `scheduled_for=2026-05-28T09:40:00+00:00`, `status=pending`, `event_context=one_shot_reminder:ranger_trois_papiers`, `reminder_instruction=Ranger trois papiers`

### Tour 4

**User**
> Tu as oublie la phrase pour Samir. Fais-la maintenant, une seule phrase, pas de rappel.

**Sophia**
> Ah merde, j'ai zappe Samir dans l'elan de l'appel.
>
> Voici ta phrase : "Salut Samir, j'ai bien recu ton message, je regarde ca et je reviens vers toi rapidement." 💬

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 5

**User**
> Si je veux verifier ou annuler ce rappel dans l'app, je vais ou ? Ne change rien.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de defense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programme a 11:40 (Ranger trois papiers).
> - Preferences coach : oui, challenge equilibre, ton bienveillant ferme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `status_only_request_blocks_tool_start`
- tool_status: `answered`
- executed_tools: []
- durable_effect: none

### Tour 6

**User**
> Autre sujet: cree-moi une carte d'attaque pour les trois papiers. Cible: ranger seulement trois papiers. Technique: ancre visuelle, avec un post-it '3 et stop'.

**Sophia**
> Ok. Je te fais une carte d'attaque simple pour "Ranger seulement trois papiers". 🧾
>
> Carte d'attaque (3 papiers)
> - Cible: ranger seulement trois papiers.
> - Ancre visuelle: mets un post-it "3 et stop" sur la zone ou tu vois les papiers.
> - Regle: tu ne continues pas apres le 3e papier. Tu t'arretes net.
> - Action (30 secondes): tu prends le 1er papier, tu le ranges. Puis 2, puis 3. Stop.
>
> Tu veux que la carte soit orientee "pile de papiers a trier" ou "papiers qui doivent aller a un dossier precis" ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- executed_tools: []
- durable_effect: none

### Tour 7

**User**
> Pile de papiers a trier. Et oui, cree-la ensuite si le brouillon garde bien '3 et stop'.

**Sophia**
> Parfait, on y va. 🧾
>
> Ton "3 et stop" doit etre affiche pile en face de la pile :
> 1) Fais un post-it "3 et stop"
> 2) Colle-le sur le bord de la zone ou les papiers sont
> 3) Regle mentale : tu ne continues pas apres le 3e papier
>
> Maintenant, action directe (30 secondes) : tu prends le 1er papier, tu le ranges. Puis le 2e. Puis le 3e. Stop net.
>
> Quand tu me dis "c'est bon", je te fais la version carte propre a partir de ce brouillon. ✅ Est-ce que le post-it "3 et stop" est deja colle ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- executed_tools: []
- durable_effect: none

### Tour 8

**User**
> C'est bon, cree la carte maintenant avec ce brouillon. Je confirme.

**Sophia**
> Je n'ai pas pu preparer cette carte depuis le chat pour l'instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `draft_review_decision`
- executed_tools: [`prepare_attack_card`]
- durable_effect: DB `user_attack_cards=[]`

### Tour 9

**User**
> Ok, laisse tomber la carte. Resume ce que tu dois retenir de mon piege de ce matin, sans inventer plus large.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de defense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programme a 11:40 (Ranger trois papiers).
> - Preferences coach : oui, challenge equilibre, ton bienveillant ferme. 🙂

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
> Ce n'etait pas ma question. Pour la suite, enregistre une preference durable: quand je dis 'court', zero emoji, trois lignes max, pas de question finale inutile.

**Sophia**
> Bien recu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloque. quand tu demandes court, je repondrai en trois lignes maximum. quand tu demandes court, je n'utiliserai pas d'emoji. quand tu demandes court, je ne finirai pas par une question inutile. Si c'est bien ca, je le garde comme preference. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- tool_status: `pending_confirmation`
- executed_tools: []
- durable_effect: none yet

### Tour 11

**User**
> Oui, garde cette preference exactement comme ca.

**Sophia**
> Je n'ai pas reussi a appliquer cette preference techniquement. Je prefere ne pas te dire que c'est enregistre tant que la DB ne l'a pas confirme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `normal_reply_default`
- tool_status: `failed`
- executed_tools: [`update_coach_preferences`]
- durable_effect: DB `user_profile_facts` garde seulement les 9 preferences system_default; aucune preference utilisateur persistante.

### Tour 12

**User**
> Je me sens un peu nul parce que meme la carte a echoue et j'ai besoin d'etre recadre. Pas de danger, juste honteux. Reponds court.

**Sophia**
> Oh mince... c'est honteux, je vois bien. 😕  
> Mais "la carte a echoue" ne veut pas dire "t'es nul". Tu as juste un plan qui n'a pas tenu.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: null
- executed_tools: []
- durable_effect: none

### Tour 13

**User**
> Ne lance rien maintenant, pas de potion ni nouveau rappel. Fais seulement le recap: fait, prevu, fragile, en trois lignes.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de defense : je n'en vois pas en place. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- tool_status: `answered`
- executed_tools: []
- durable_effect: none; aucune `select_state_potion`, aucun nouveau rappel

### Tour 14

**User**
> Ce n'est pas le recap demande. Pas de statut systeme: seulement fait, prevu, fragile. Trois lignes, sans emoji.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de defense : je n'en vois pas en place. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- tool_status: `answered`
- executed_tools: []
- durable_effect: none

### Tour 15

**User**
> Dernier tour: reponds a mon emotion, pas au systeme. Une phrase de cloture courte, sans emoji, pour que je reparte sans honte.

**Sophia**
> Je te crois : c'est humiliant quand ca ne sort pas comme prevu, et ca ne dit rien de ta valeur; respire, et on repart propre.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_conversation_skill_continue`
- safety: null
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tours 1-2: bonne correction A2 sur le faux depart `prepare_attack_card`. Sophia reste en conversation simple quand l'utilisateur dit explicitement "pas de carte".
- Tour 3: le rappel ponctuel est annonce clairement et l'heure locale est correcte.
- Tour 11: Sophia ne ment plus sur la preference coach quand l'ecriture DB echoue; elle signale l'echec technique.
- Tour 15: la reparation emotionnelle finale est enfin courte, sans emoji, et recentree sur la honte.

**Problemes**
- Tour 3: Sophia execute le rappel mais oublie la phrase pour Samir dans la meme demande. Impact: composition post-tool incomplete; l'utilisateur doit reparer au tour suivant. Severite: yellow.
- Tour 5: la question produit "ou verifier ou annuler ce rappel dans l'app" recoit un statut systeme, pas un emplacement produit. Impact: product help non servi, experience confuse. Severite: red.
- Tours 6-8: la carte d'attaque explicite deraille. Sophia demande un slot supplementaire, transforme la creation en action terrain, puis echoue a creer la carte. Impact: l'utilisateur confirme trois fois et n'obtient pas l'objet demande. Severite: red.
- Tour 9: la demande de memoire conversationnelle est remplacee par un statut cartes/rappels/preferences. Impact: Sophia ne repond pas a "ce que tu dois retenir". Severite: red.
- Tours 13-14: le recap demande "fait, prevu, fragile" retombe deux fois sur le statut carte/defense et ajoute un emoji malgre "sans emoji". Impact: boucle mecanique et non-respect de la consigne. Severite: red.

**Fix propose**
- Isoler le rendu "status-only" pour qu'il ne capture pas les demandes de product help, memoire narrative ou recap humain.
- Ajouter un composer post-tool qui reprend les sous-demandes non-tool du tour apres execution d'un side effect.
- Pour `prepare_attack_card`, traiter une confirmation explicite comme creation de carte, pas comme consigne d'execution terrain.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1-2: amelioration confirmee. `route_reason=attack_card_cancelled_to_conversation`, aucun outil execute.
- Tour 5: mauvais owner utile. La trace bloque bien les side effects avec `status_only_request_blocks_tool_start`, mais le systeme choisit une reponse de statut au lieu de `product_help`.
- Tour 9: `normal_reply_default` avec `tool_status=answered` produit encore un statut systeme pour une demande de memoire conversationnelle.
- Tour 14: `selected_handler=update_coach_preferences` sur une correction de recap, avec `route_reason=explicit_tool_intent_supersedes_active_conversation_skill`. C'est un faux positif de tool skill.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: green cote execution. DB confirmee: 1 `scheduled_checkins` pending a `2026-05-28T09:40:00+00:00`, instruction "Ranger trois papiers".
- `prepare_attack_card`: red. La trace annonce `executed_tools=[prepare_attack_card]` au tour 8, mais `user_attack_cards=[]`. La reponse visible dit aussi que la carte n'a pas pu etre preparee.
- `update_coach_preferences`: yellow/red. Le tour 10 capture correctement les details en pending confirmation, mais le tour 11 echoue a appliquer. L'honnetete de la reponse est une amelioration, l'effet durable reste absent.
- `emotional_repair`: green/yellow. Bon owner aux tours 12 et 15; le tour 12 ignore encore "sans emoji/court" dans le style.
- `select_state_potion`: green sur ce run. Aucune potion ni nouveau rappel n'est execute aux tours 13-14 malgre une formulation de recap.

**Memory / Effets durables**
- Avant cleanup:
  - `scheduled_checkins`: 1 ligne pending correcte, `event_context=one_shot_reminder:ranger_trois_papiers`.
  - `user_attack_cards`: 0 ligne, alors que l'utilisateur a explicitement demande et confirme la creation.
  - `user_profile_facts`: 9 lignes `system_default`; aucune preference utilisateur persistante pour "court = zero emoji, trois lignes max, pas de question finale".
  - `conversation_turn_traces`: 15 lignes.
  - `chat_messages`: 30 lignes.
- Apres cleanup cible: `scheduled_checkins=0`, `user_attack_cards=0`, `user_profile_facts=0`, `user_chat_states=0`, `chat_messages=0`, `conversation_turn_traces=0`; user Auth supprime.

**Problemes**
- Tour 3: `tool_skill` execute le rappel mais la reponse visible ne compose pas la demande textuelle "phrase courte pour Samir". Impact systeme: side effect priorise au detriment du reste du tour. Severite: yellow.
- Tour 5: route status-only trop large et prend la place de `product_help`. Impact systeme: mauvaise surface pour une question produit sans side effect. Severite: red.
- Tour 8: `prepare_attack_card` signale un passage outil mais ne cree aucun durable effect. Impact systeme: confirmation/execution non fiable. Severite: red.
- Tour 14: faux positif `update_coach_preferences` sur "sans emoji" dans une correction locale de recap. Impact systeme: le router confond preference durable et contrainte de style immediate. Severite: yellow/red.

**Fix propose**
- Separateur d'intention pour `status_only_request_blocks_tool_start`: ne l'activer que sur demandes d'etat explicites, pas sur "ou dans l'app", "resume ce que tu retiens", "fait/prevu/fragile".
- Ajouter un test d'integration `prepare_attack_card` confirmation explicite avec contenu deja complet: `pending_confirmation -> executed -> user_attack_cards active`.
- Dans `update_coach_preferences`, distinguer "enregistre une preference durable" de contraintes locales comme "trois lignes, sans emoji" quand elles corrigent une reponse en cours.
- Faire echouer visiblement un tool skill si `executed_tools` est present mais que l'ecriture durable attendue est absente, avec trace d'erreur exploitable.

## Verdict Global

- Verdict: red
- Raison principale: les corrections A2 ont bien corrige le faux lancement de carte sur "pas de carte" et le rappel ponctuel fonctionne, mais la synchronicite reste rouge sur product help, memoire/recap et surtout `prepare_attack_card` explicite sans effet durable.
- Follow-up prioritaire: corriger `prepare_attack_card` confirmation/execution et le routeur status-only trop large, puis relancer un A2 codex-r4 centre sur carte explicite + product help + recap humain.
