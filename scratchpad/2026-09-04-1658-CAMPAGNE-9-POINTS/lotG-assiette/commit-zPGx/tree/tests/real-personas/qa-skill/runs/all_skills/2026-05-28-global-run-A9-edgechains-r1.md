# global-run-A9 - Edge Chains / Skills R1

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A9_edgechains_r1`
- Persona: user QA temporaire local `8da727e7-1d5f-4adf-bcd4-fdb2fc4cf101`, cree via Auth local.
- Objectif: tester d'autres enchainements et edge cases que A4: soutien emotionnel sans tool, opportunite `select_state_potion`, decomposition, carte avec technique possiblement inadaptee, confirmation de carte, rappel relatif, rappel dans le passe, reprise de rappel apres clarification, product help vs status, format ponctuel, recap final.
- Trajectoire: surcharge emotionnelle -> micro-action -> execution breakdown -> carte d'attaque avec `mot de bascule` -> rappel relatif -> rappel passe bloque -> reprise future difficile -> product help -> status strict -> recap honnete.
- Surfaces visees: `execution_breakdown`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, `status_exact`, `central_arbitrator_ponctual_response_format`, opportunite `select_state_potion` non executee, memory/preferences.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse et de la trace courte precedente.

## 2. Tours De Conversation

### Tour 1

**User**
> Je suis vraiment saturé là : j'ai trois onglets ouverts, une facture à vérifier, et je sens que je vais partir en vrille. Ne crée rien, ne programme rien. Aide-moi juste à redescendre et à choisir le premier geste.

**Sophia**
> On fait compact : choisis une seule zone visible et ouvre-la.
> Premier geste : écris juste le titre du mini-pas suivant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- safety: `low`
- skill_entry_ids: [`execution_breakdown`]
- opportunity: `state_potion`
- opportunity_operation: `select_state_potion`
- executed_tools: []
- durable_effect: aucun

### Tour 2

**User**
> Le mini-pas c'est 'vérifier la facture'. Donne-moi une décomposition en trois gestes très courts, sans carte.

**Sophia**
> Ok. Respire 2 secondes 😮‍💨
>
> 1) Ouvre l’onglet “facture” (celui qui est le plus clair).  
> 2) Cherche 1 info cible : “montant total” OU “référence” (choisis juste une).  
> 3) Note une seule décision : “OK” ou “à corriger” (et quoi, en 3 mots).  
>
> Tu veux commencer par “montant” ou par “référence” ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `none`
- executed_tools: []
- durable_effect: aucun

### Tour 3

**User**
> Je commence par le montant. Maintenant fais une carte d'attaque pour 'vérifier une facture en 6 minutes', mais utilise la technique 'mot de bascule' même si ce n'est peut-être pas la plus logique.

**Sophia**
> C'est entendu, on part sur le Mot de bascule pour vérifier ta facture (en commençant par le montant). Quel mot simple et percutant veux-tu m'envoyer pour déclencher l'action ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: aucun
- probleme: Sophia ne challenge pas la technique imposee alors que le user signale lui-meme qu'elle n'est peut-etre pas logique

### Tour 4

**User**
> Le mot sera : Go facture. Montre-moi le brouillon avant de créer la carte.

**Sophia**
> Titre : Vérifier la facture
> Technique : Mot de bascule
> Mot-clé : Go facture
> Envoie-moi ce mot dès que tu hésites à vérifier la facture pour déclencher l'action.
> Je crée la carte ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `low`
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: brouillon seulement

### Tour 5

**User**
> Oui, crée cette carte.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Vérifier la facture
> Technique : Mot de bascule
> Go facture
>
> Mode d'emploi : Envoie-moi ce mot dès que tu hésites à vérifier la facture pour déclencher l'action.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Le mot de cette carte peut etre remplace depuis cette zone; pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- executed_tools: [`prepare_attack_card`]
- tool_execution: `success`
- durable_effect: 1 `user_attack_cards` active `Vérifier la facture`, technique `pre_engagement`, keyword `Go facture`

### Tour 6

**User**
> Programme un rappel dans 20 minutes : reprendre la vérification de la facture si je n'ai pas terminé.

**Sophia**
> C'est programmé pour jeudi 28 mai à 10:20 : reprendre la vérification de la facture si je n'ai pas terminé. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- safety: `none`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- durable_effect: rappel pending `2026-05-28T08:20:00+00:00`, local `10:20 Europe/Paris`, texte correct
- note: effet correct mais owner conversationnel surprenant pour un side effect direct

### Tour 7

**User**
> Essaie aussi un rappel aujourd'hui à 09h50 : vérifier si le paiement est passé.

**Sophia**
> Je n'ai pas encore programmé ce rappel : il me manque un moment futur clair. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: aucun
- note: bon blocage d'une heure passee

### Tour 8

**User**
> Alors mets-le aujourd'hui à 10h45 : vérifier si le paiement est passé.

**Sophia**
> Ok 👍 je peux le planifier pour aujourd’hui à 10:45 (heure Paris).  
>
> Confirme juste un détail : tu veux que je te le rappelle “vérifier si le paiement est passé” uniquement, ou aussi “relancer si non” ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `active_skill_exit_requested`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: []
- tool_execution: `none`
- durable_effect: aucun
- probleme: demande de clarification supplementaire alors que le texte et le moment sont presents

### Tour 9

**User**
> Uniquement : vérifier si le paiement est passé.

**Sophia**
> Je préfère être clair : je n'ai pas encore programmé ce rappel. Dis-moi le moment exact (et le texte) et je le programme tout de suite. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: []
- tool_execution: `none`
- durable_effect: aucun
- probleme: perte du contexte `10h45`

### Tour 10

**User**
> Moment exact : aujourd'hui à 10h45. Texte exact : vérifier si le paiement est passé.

**Sophia**
> Je préfère être clair : je n'ai pas encore programmé ce rappel. Dis-moi le moment exact (et le texte) et je le programme tout de suite. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: []
- tool_execution: `none`
- durable_effect: aucun
- probleme: meme avec les deux slots complets, le flow ne repart pas

### Tour 11

**User**
> Programme un rappel aujourd'hui à 10h45 : vérifier si le paiement est passé.

**Sophia**
> C'est programmé pour jeudi 28 mai à 10:45 : vérifier si le paiement est passé. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- durable_effect: rappel pending `2026-05-28T08:45:00+00:00`, local `10:45 Europe/Paris`, texte correct

### Tour 12

**User**
> Question produit : où je retrouve la carte d'attaque créée et les deux rappels programmés ? Réponds aux deux, sans modifier quoi que ce soit.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Vérifier la facture).
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, j'en vois 2 en place : 10:20 reprendre la vérification de la facture si je n'ai pas terminé ; 10:45 vérifier si le paiement est passé.
> - Préférences coach : oui, challenge équilibré, ton bienveillant ferme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- safety: `low`
- executed_tools: []
- durable_effect: aucun
- probleme: owner product help, mais reponse status au lieu des chemins produit

### Tour 13

**User**
> Je ne demande pas le statut. Je demande les chemins dans l'app : où cliquer pour voir une carte d'attaque et où cliquer pour voir les rappels ponctuels ?

**Sophia**
> Ok 🙂 dans l’app, en général ça se passe comme ça :
>
> 1) Voir la carte d’attaque
> - Va dans Ressources
> - Puis Cartes d’attaque
>
> 2) Voir les rappels ponctuels
> - Va dans une zone “Rappels” (ou “Alarmes / Notifications”, selon l’interface)
> - Ensuite cherche “Rappels ponctuels” ou “Historique/à venir”
>
> Tu es sur quel écran/app exactement (iPhone, Android, web) ? Je te donne le chemin au mot près.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_explicit_no_status_request`
- safety: `low`
- skill_entry_ids: [`product_help`]
- executed_tools: []
- durable_effect: aucun
- note: reponse produit correcte apres relance, mais owner n'est plus `product_help`

### Tour 14

**User**
> Status strict, en 4 lignes maximum : carte active, rappels actifs avec heures locales, préférence coach nouvelle oui/non. Pas d'explication et ne garde pas cette forme comme préférence.

**Sophia**
> Carte d’attaque active : Vérifier la facture. ✅  
> Rappel actif : 10:20 — reprendre la vérification de la facture si je n’ai pas terminé. 📌  
> Rappel actif : 10:45 — vérifier si le paiement est passé. 📌  
> Préférence coach nouvelle : non 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_ponctual_response_format`
- safety: `low`
- executed_tools: []
- durable_effect: aucun
- note: contrainte de format ponctuelle respectee sans preference durable

### Tour 15

**User**
> Dernier tour : je me sens plus calme. Fais un récap honnête en séparant ce qui est vérifié de ce qui reste non vérifiable depuis le chat. Sans créer ni modifier.

**Sophia**
> Ok, je te fais un récap honnête, sans rien créer ni modifier. 🙂  
>
> Vérifié depuis le chat
> - Carte d’attaque active : “Vérifier la facture”.
> - Rappels ponctuels actifs :
>   - 10:20 — reprendre la vérification de la facture si je n’ai pas terminé.
>   - 10:45 — vérifier si le paiement est passé.
>
> Reste non vérifiable depuis le chat
> - Si la vérification a déjà été faite entre 10:20 et maintenant.
> - Si le paiement est passé (je n’ai pas l’état réel de la facture/paiement ici).
> - Si tu as terminé “reprendre la vérification” après 10:20.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_recap_request_priority`
- safety: `low`
- executed_tools: []
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: bonne reaction a la surcharge; aucun tool execute malgre opportunite `state_potion`.
- Tour 2: decomposition claire, courte, utile.
- Tours 4-5: flow carte propre une fois le slot fourni: brouillon puis confirmation puis creation.
- Tour 7: heure passee bloquee clairement.
- Tour 14: format strict respecte sans en faire une preference durable.
- Tour 15: recap honnête et utile, avec separation verifie/non verifiable.

**Problemes**
- Tour 3: Sophia accepte `mot de bascule` sans challenger alors que l'utilisateur signale que la technique n'est peut-etre pas logique. Impact: le user peut forcer une technique moins adaptee. Severite: yellow.
- Tours 8-10: reprise du rappel futur apres heure passee est confuse; Sophia demande une clarification inutile puis perd le contexte horaire. Impact: user doit repeter trois fois. Severite: red UX.
- Tour 12: question produit recoit un status, pas les chemins. Impact: user doit corriger explicitement. Severite: yellow.
- Tour 13: reponse produit correcte mais moins assuree ("en general", "selon l'interface"). Impact: aide produit utile mais pas totalement precise. Severite: yellow.

**Fix propose**
- Quand un user force une technique en disant qu'elle est peut-etre inadaptee, Sophia doit confirmer le doute et proposer l'alternative la plus proche avant de collecter les slots.
- Conserver les slots `time` + `text` lors d'une clarification sur un rappel bloque pour heure passee.
- Product help doit distinguer "où retrouver" de "statut courant" sans basculer vers status.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `explicit_no_tool_request_blocks_tool_start` au tour 1 est correct; `select_state_potion` reste opportunite non executee.
- `execution_breakdown` au tour 2 est correct.
- `prepare_attack_card` fonctionne techniquement: slot missing -> brouillon -> confirmation -> execution.
- `create_one_shot_reminder` cree correctement les rappels aux tours 6 et 11; il bloque correctement le past-time au tour 7.
- Le flow de reprise du rappel aux tours 8-10 est faible: `direct_effects` reste present, mais aucun tool n'est execute et le contexte est perdu.
- `product_help` est selectionne au tour 12 mais produit un status. Le tour 13 corrige le contenu via `central_arbitrator_explicit_no_status_request`.
- `central_arbitrator_ponctual_response_format` au tour 14 corrige bien le risque de faux `update_coach_preferences`.

**Skills / Operations / Tools**
- `prepare_attack_card`: effet durable correct. DB: 1 carte active `Vérifier la facture`, technique `pre_engagement`, keyword `Go facture`.
- `create_one_shot_reminder`: effets durables corrects:
  - `10:20 Europe/Paris`: `reprendre la vérification de la facture si je n'ai pas terminé`
  - `10:45 Europe/Paris`: `vérifier si le paiement est passé`
- `update_coach_preferences`: aucun effet durable; correct car aucune preference n'etait demandee dans ce scenario.
- `product_help`: coverage incomplet au premier essai.

**Memory / Effets durables**
- `scheduled_checkins`: 2 rappels `pending`, heures UTC `08:20` et `08:45`, timezone `Europe/Paris`, instructions correctes.
- `user_attack_cards`: 1 carte active conforme au brouillon confirme.
- `user_profile_facts`: uniquement defaults; pas de preference coach nouvelle.
- `memory_items`: aucun.
- `user_topic_memories`: aucun.

**Problemes**
- Tour 3: garde-fou de coherence technique faible. Impact systeme: le tool skill accepte une technique possiblement incoherente sans mediation. Severite: yellow.
- Tour 6: `response_owner=conversation_handler` alors qu'un tool reminder est execute. Impact systeme: metadata/ownership peu lisible. Severite: yellow.
- Tours 8-10: perte des slots dans le flow de rappel. Impact systeme: side effect attendu non execute avant repetition complete. Severite: red.
- Tour 12: `product_help` genere un status au lieu d'une aide produit. Impact systeme: mauvais contenu sous bon owner. Severite: yellow.

**Fix propose**
- Ajouter une verification d'adéquation technique dans `prepare_attack_card` quand le user exprime explicitement un doute sur la technique forcee.
- Corriger la persistance des slots dans le flow de rappel apres blocage past-time: l'heure future et le texte doivent survivre aux clarifications.
- Aligner `response_owner` avec les side effects directs ou exposer explicitement que le handler conversationnel a delegue a un always-on tool.
- Renforcer `product_help` pour les intents `où retrouver`, `où cliquer`, `dans l'app`.

## Verdict Global

**yellow**

Le run est exploitable et les effets durables finaux sont corrects: une carte active, deux rappels pending avec bons horaires/textes, aucune preference coach nouvelle. Les principaux problemes sont des enchainements: technique de carte non challengee, reprise de rappel apres horaire passe qui perd ses slots, et product help qui repond d'abord en status. Ce n'est pas green, mais contrairement aux derniers A4, les side effects durables verifies sont alignes avec les demandes finales.
