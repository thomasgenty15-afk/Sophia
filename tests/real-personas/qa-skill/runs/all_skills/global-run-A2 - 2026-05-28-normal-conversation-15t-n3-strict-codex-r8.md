# global-run-A2 - Global Normal Conversation 15T - N3 Strict Codex R8

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A2_20260528_n3_strict_codex_r8`
- Persona: user QA temporaire local `3460e0f2-b667-4a40-b11e-e08478b03392`, email `qa-qa-skill-all-skills-global-run-a2-20260528-n3-strict-codex-r8@example.com`, cree via Auth local puis supprime en cleanup cible.
- Objectif: relancer apres corrections A2 pour verifier la synchronicite entre skills conversationnels et tool skills: blocage des outils quand demande conversationnelle, creation de rappel, aide produit, carte d'attaque, preference coach, reparation emotionnelle, recap et anti-potion.
- Trajectoire: journee brouillee -> micro-action sans outil -> phrase + rappel -> aide produit rappel -> carte d'attaque explicite -> abandon carte -> memoire conversationnelle -> preference coach -> reparation emotionnelle -> recap sans outil -> aide produit -> preference appliquee -> memoire courte -> cloture emotionnelle sans potion.
- Surfaces visees: `execution_breakdown`, opportunite `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, memoire conversationnelle, `update_coach_preferences`, `emotional_repair`, `select_state_potion` en opportunite non executee.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `client_now_iso=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse Sophia et de la trace courte precedente. Tous les tours ont retourne HTTP 200. Les effets DB ont ete verifies avant cleanup, puis les artefacts de ce run ont ete supprimes de facon ciblee.

## 2. Tours De Conversation

### Tour 1

**User**
> Matin brouille: envoyer un justificatif a Sarah, payer le parking, et ranger deux bols. Pas de carte ni d'outil: donne-moi juste le premier geste maintenant.

**Sophia**
> Ok. Pour Sarah: prends 30 secondes, ouvres le mail/la messagerie, mets "Objet : justificatif" et prepare l'envoi. 📎
>
> Tu l'envoies via mail ou WhatsApp ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- safety: `low`
- memory_plan: `light`
- executed_tools: []
- durable_effect: none

### Tour 2

**User**
> Mail ouvert, mais je repars vers le parking. Toujours pas de carte: donne-moi seulement le geste suivant.

**Sophia**
> Ok: fais le geste suivant tout de suite a 100% 🙂
>
> Copie-colle le texte dans le mail (ou WhatsApp) et mets le justificatif en piece jointe, puis garde juste "Objet : justificatif" et une minute pour verifier le destinataire. 📎
>
> Tu as le fichier pret a joindre (oui/non) ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `attack_card_cancelled_to_conversation`
- safety: `low`
- memory_plan: `light`
- executed_tools: []
- durable_effect: none

### Tour 3

**User**
> Fichier joint, pas encore envoye. Donne-moi une phrase courte pour Sarah, et rappelle-moi a 11h58 de payer seulement le parking.

**Sophia**
> C'est programme pour jeudi 28 mai a 11:58 : Payer seulement le parking.
>
> Phrase courte pour Sarah : "Je te confirme que je m'en occupe aujourd'hui, et je reviens vers toi des que c'est fait." 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- tool_status: `executed`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: DB `scheduled_checkins` row `2e719eb3-9e5c-4865-927c-06c63361e3ad`, `scheduled_for=2026-05-28T09:58:00+00:00`, `status=pending`, `event_context=one_shot_reminder:payer_seulement_le_parking`, `reminder_instruction=Payer seulement le parking`

### Tour 4

**User**
> Pour le rappel ponctuel de 11h58, ou est-ce que je peux le verifier ou l'annuler dans l'app ? Juste l'emplacement, sans modifier.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de defense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programme a 11:58 (Payer seulement le parking).
> - Preferences coach : oui, challenge equilibre, ton bienveillant ferme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `status_only_request_blocks_tool_start`
- tool_status: `answered`
- memory_plan: `none`
- executed_tools: []
- durable_effect: none

### Tour 5

**User**
> Autre sujet: cree-moi une carte d'attaque pour payer le parking sans rouvrir l'appli. Cible: payer une fois puis fermer. Technique: ancre visuelle, avec le post-it 'paye, je ferme'.

**Sophia**
> Petit rate technique de mon cote en preparant la carte - rien a voir avec ta demande. Redis-moi de la creer et je relance tout de suite. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `fallback_dashboard`
- executed_tools: [`prepare_attack_card`]
- durable_effect: DB later shows no attack card

### Tour 6

**User**
> Cree-la maintenant: ancre visuelle, post-it 'paye, je ferme', cible payer une fois puis fermer l'appli. Demande confirmation si necessaire.

**Sophia**
> Je n'ai pas pu preparer cette carte depuis le chat pour l'instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `none`
- tool_status: `draft_review_decision`
- executed_tools: [`prepare_attack_card`]
- durable_effect: DB later shows no attack card

### Tour 7

**User**
> Ok, laisse tomber la carte. Resume ce que tu dois retenir de mon piege de ce matin, pas les statuts systeme: seulement le piege utile pour la suite.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de defense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programme a 11:58 (Payer seulement le parking).
> - Preferences coach : oui, challenge equilibre, ton bienveillant ferme.
> - Piege / fragile : je le traite comme repere de conversation, pas comme ecriture durable. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `central_arbitrator_explicit_no_status_request`
- tool_status: `answered`
- memory_plan: `light`
- executed_tools: []
- durable_effect: none

### Tour 8

**User**
> Pour la suite, enregistre une preference durable: quand je dis 'court', zero emoji, trois lignes max, et pas de question finale inutile.

**Sophia**
> Bien recu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloque. quand tu demandes court, je repondrai en trois lignes maximum. quand tu demandes court, je n'utiliserai pas d'emoji. quand tu demandes court, je ne finirai pas par une question inutile. Si c'est bien ca, je le garde comme preference. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- tool_status: `pending_confirmation`
- operation: `2c74dda1-51f8-4d66-bcb4-ae294ac1ee73`
- executed_tools: []
- durable_effect: none yet

### Tour 9

**User**
> Oui, garde cette preference exactement comme ca.

**Sophia**
> C'est fait. J'ai applique cette preference : je te poserai moins de questions, plus courtes, surtout quand tu es bloque. quand tu demandes court, je repondrai en trois lignes maximum. quand tu demandes court, je n'utiliserai pas d'emoji. quand tu demandes court, je ne finirai pas par une question inutile. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- tool_status: `executed`
- operation: `2c74dda1-51f8-4d66-bcb4-ae294ac1ee73`
- executed_tools: [`update_coach_preferences`]
- durable_effect: DB `user_profile_facts` ajoute 4 preferences explicites: `coach.question_tendency=low`, `coach.emoji_policy=none`, `coach.response_max_lines=three`, `coach.final_question_policy=avoid_unnecessary`

### Tour 10

**User**
> Je me sens un peu nul parce que la carte a encore echoue. Pas de danger, juste honteux. Reponds court.

**Sophia**
> Oh mince... ca fait honte, meme si le risque est zero.
> La, la verite c'est juste: la carte a bugue, pas toi.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- executed_tools: []
- durable_effect: none

### Tour 11

**User**
> Ne lance rien maintenant, pas de potion, pas de nouveau rappel. Fais seulement le recap: fait, prevu, fragile, en trois lignes. Pas de question.

**Sophia**
> Fait : 5 preference(s) coach active(s).
> Prevu : 11:58 Payer seulement le parking.
> Fragile : ce qu'on a nomme reste un repere de conversation, pas une ecriture durable.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- tool_status: `answered`
- executed_tools: []
- durable_effect: none

### Tour 12

**User**
> Dans l'app, ou est-ce que je verifie ou j'annule le rappel de 11h58 ? Donne seulement le chemin UI, pas son statut.

**Sophia**
> Dashboard > Initiatives (ou Base de vie > Initiatives) > onglet/section Rappels ou Initiatives > trouver "Payer seulement le parking" > annuler. 📍

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- executed_tools: []
- durable_effect: none

### Tour 13

**User**
> Court: reformule ma regle durable pour quand je dis court.

**Sophia**
> Quand tu dis "court" : 3 lignes max, zero emoji, et je ne termine pas par une question inutile.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- memory_plan: `light`
- executed_tools: []
- durable_effect: none

### Tour 14

**User**
> Sans outil: si demain je dis 'piege parking', qu'est-ce que tu dois comprendre de cette matinee ? Une phrase.

**Sophia**
> Quand tu dis "piege parking" demain, je dois comprendre que cette matinee concernait un rappel lie au parking (paiement), qui a ete declenche/fragilise par un souci cote carte, sans que ca mette ta personne en tort. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- executed_tools: []
- durable_effect: none

### Tour 15

**User**
> Dernier tour: je veux repartir sans honte. Pas de potion, pas d'outil, pas de recap systeme. Court.

**Sophia**
> C'est note pour la honte, on va s'en occuper. Qu'est-ce qui t'a fait mal ou t'a fait retomber ces derniers temps ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- tool_status: `ask_question`
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tours 1-2: Sophia ne declenche pas de carte malgre les mots "parking" et "carte"; le passage reste conversationnel.
- Tour 3: la phrase + rappel est fluide et compréhensible; le rappel est formule correctement.
- Tour 10: la reparation emotionnelle est courte, humaine, et ne transforme pas la honte en action ou outil.
- Tour 13: la preference "court" est restituee proprement, sans emoji, sans question finale, en une ligne.

**Problemes**
- Tour 4: l'utilisateur demande un emplacement UI, Sophia repond par un statut systeme complet. Impact: l'aide produit est ratee au moment naturel ou le user veut savoir ou gerer le rappel. Severite: red.
- Tours 5-6: la carte d'attaque explicite echoue deux fois. La premiere reponse invite a relancer, la seconde s'arrete sans chemin de reparation utile. Impact: workflow central inutilisable dans ce run. Severite: red.
- Tour 7: l'utilisateur demande "pas les statuts systeme", Sophia donne precisement un bloc de statuts systeme. Impact: perte de confiance et impression que Sophia n'ecoute pas la contrainte explicite. Severite: red.
- Tour 11: le format trois lignes est respecte, mais "Fait" devient "5 preferences coach actives" au lieu de l'etat humain de la matinee. Impact: recap froid et faux par rapport au besoin utilisateur. Severite: red.
- Tour 14: la reponse est humainement acceptable, mais routee comme `product_help`, et ajoute un emoji alors que le contexte recent "court" tend vers zero emoji. Impact: synchronisation conversation/produit instable. Severite: yellow.
- Tour 15: avec "pas de potion, pas d'outil, pas de recap systeme, court", Sophia pose quand meme une question finale d'exploration. Impact: cloture emotionnelle non respectee et preference durable contredite. Severite: red.

**Fix propose**
- Distinguer strictement `product_help` "ou dans l'app" de `status_only_request`: si la demande contient "emplacement", "chemin UI", "ou verifier/annuler", repondre par navigation UI, sans inventaire des etats.
- Pour les demandes "pas les statuts systeme", bypasser les syntheses d'etat et produire un recap conversationnel fonde sur le dernier contexte humain.
- Ajouter un garde de cloture emotionnelle: si "court" + "pas de question" ou preference `final_question_policy=avoid_unnecessary`, ne pas finir par une question d'exploration sauf safety active.
- Rendre le fallback `prepare_attack_card` actionnable: soit produire un draft en pending confirmation, soit expliquer un chemin UI exact; ne pas demander juste de repeter la commande.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1-2: routage correct vers `normal_reply`, `route_reason=attack_card_cancelled_to_conversation`, aucun tool execute.
- Tour 3: routage correct vers `tool_skill` et `create_one_shot_reminder`; effet durable exact en DB.
- Tour 4: mauvais comportement systeme. Le routeur traite la demande produit comme `status_only_request_blocks_tool_start` et repond avec un statut global, pas avec `product_help`.
- Tours 5-6: le routeur choisit bien `prepare_attack_card`, mais le skill/tool ne finalise aucun draft durable ni confirmation utile.
- Tour 7: `route_reason=central_arbitrator_explicit_no_status_request`, mais la reponse reste un statut systeme. Le signal deterministe detecte la contrainte, puis la couche reponse la viole.
- Tour 10: `conversation_handler` + `emotional_repair` correct; aucun side effect.
- Tour 11: `explicit_no_tool_request_blocks_tool_start` bloque bien les outils et la potion, mais le contenu vient encore d'une logique de statut/preferences.
- Tour 12: `product_help` fonctionne enfin sur une formulation plus contrainte "chemin UI, pas son statut".
- Tour 14: mauvais owner (`product_help`) pour une question de memoire conversationnelle sans outil.
- Tour 15: blocage outil/potion correct, mais `tool_status=ask_question` produit une question inutile malgre la preference durable.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: green. 1 row `scheduled_checkins`, `scheduled_for=2026-05-28T09:58:00+00:00`, `status=pending`, instruction exacte "Payer seulement le parking".
- `prepare_attack_card`: red. Deux appels, aucun `user_attack_cards` durable. Tour 5 `fallback_dashboard`, tour 6 `draft_review_decision` avec message final "Je n'ai pas pu preparer cette carte".
- `update_coach_preferences`: green cote persistance. Confirmation priorisee correctement; 4 facts explicites ajoutes.
- `emotional_repair`: yellow. Tour 10 correct; tour 15 n'est pas route vers `emotional_repair` et finit en question.
- `product_help`: yellow/red. Tour 12 correct; tour 4 rate et tour 14 surclasse une demande memoire.

**Memory / Effets durables**
- Avant cleanup: `scheduled_checkins=1`, `user_attack_cards=0`, `user_profile_facts=12`, `user_chat_states=1`, `turn_traces=15`, `chat_messages=30`.
- Preferences explicites persistees: `coach.question_tendency=low`, `coach.emoji_policy=none`, `coach.response_max_lines=three`, `coach.final_question_policy=avoid_unnecessary`.
- Aucun side effect parasite observe sur les tours "sans outil"; le probleme principal est la reponse produite, pas une ecriture DB indue.
- Cleanup cible verifie apres run: `scheduled-checkins=0`, `attack-cards=0`, `profile-facts=0`, `chat-states=0`, `chat-messages=0`, `turn-traces=0` pour le persona/run.

**Problemes**
- Tour 4: demande d'aide produit mal routee comme status. Impact systeme: `product_help` n'est pas priorise si la phrase contient "verifier/annuler" avec un rappel existant. Severite: red.
- Tours 5-6: `prepare_attack_card` echoue sur une demande complete avec technique, cible et contenu. Impact systeme: tool skill central non fonctionnel sur ce chemin. Severite: red.
- Tour 7: la trace dit explicitement `central_arbitrator_explicit_no_status_request`, mais la reponse est status. Impact systeme: mismatch entre arbitrage et renderer final. Severite: red.
- Tour 11: blocage outil/potion OK, mais recap contamine par des compteurs/preferences. Impact systeme: la surface status reste trop dominante. Severite: red.
- Tour 14: `product_help` selectionne sur une demande "Sans outil" de memoire conversationnelle. Impact systeme: intent classifier trop sensible au mot "parking". Severite: yellow.
- Tour 15: `final_question_policy=avoid_unnecessary` n'est pas applique en cloture emotionnelle. Impact systeme: preference durable non respectee dans un owner `tool_skill` sans handler. Severite: red.

**Fix propose**
- Ajouter une regle de priorite: `explicit_no_status_request` doit forcer un renderer conversationnel court, jamais le template "Sans rien modifier".
- Corriger la decision `product_help` pour les demandes "ou verifier/annuler dans l'app": elles doivent router vers `product_help` des le premier essai.
- Instrumenter `prepare_attack_card` pour exposer la cause du `fallback_dashboard`/`draft_review_decision` et garantir un pending draft quand tous les slots requis sont fournis.
- Appliquer les preferences coach au post-traitement de reponse, pas seulement au handler conversationnel normal: `emoji_policy`, `response_max_lines`, `final_question_policy`.
- Pour `select_state_potion`: le non-declenchement est correct dans ce run, mais la reponse de cloture doit rester emotionnelle et non questionnante.

## Verdict Global

- Verdict: red
- Raison principale: les side effects sont globalement contenus, mais la synchronisation entre intents conversationnels, product help et tool skills reste instable; les demandes explicites "emplacement", "pas les statuts systeme", "court" et "pas de question" sont encore violees.
- Follow-up prioritaire: fixer le routage/rendering des demandes no-status/product-help et reparer `prepare_attack_card` sur une demande complete avant de relancer A2.
