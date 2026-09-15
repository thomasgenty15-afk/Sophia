# global-run-A9 - Edge Chains / Skills R3

## 1. Contexte Du Test

- Date: 2026-05-29
- Run: `global_run_A9_edgechains_r3`
- Persona: user QA temporaire local `74ca59e0-6fe1-40e8-92bc-bd027c116e5e`, cree via Auth local.
- Objectif: relancer le meme test A9 pour verifier les corrections sur technique forcee, rappel relatif, rappel passe/reprise, product help, status strict et recap.
- Trajectoire: surcharge -> decomposition -> carte avec technique forcee et douteuse -> alternative proposee -> echec carte -> sortie conversationnelle -> rappel relatif -> horaire passe -> reprise future -> product help chemins -> status strict -> recap final.
- Surfaces visees: `execution_breakdown`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, format ponctuel, status/recap, opportunite `select_state_potion`/`attack_card`, memory/preferences.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-29T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse et de la trace courte precedente.

## 2. Tours De Conversation

### Tour 1

**User**
> Je suis saturé : quatre onglets, un devis à vérifier, et je sens que je vais abandonner. Ne crée rien, ne programme rien. Aide-moi juste à redescendre et à choisir un premier geste.

**Sophia**
> On fait compact : choisis une seule zone visible et ouvre-la.
> Premier geste : écris juste le titre du mini-pas suivant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- safety: `low`
- skill_entry_ids: [`execution_breakdown`]
- opportunity: `attack_card`
- opportunity_operation: `prepare_attack_card`
- executed_tools: []
- durable_effect: aucun
- note: side effects bloques, mais opportunite `attack_card` surprenante alors que le user dit explicitement "ne crée rien"

### Tour 2

**User**
> Le mini-pas : vérifier le devis. Découpe-moi ça en trois gestes courts, sans carte.

**Sophia**
> Ok, on respire un coup 😮‍💨
>
> 1) Ouvre le devis (et zoom sur la partie “total / TVA / délais”).  
> 2) Repère 3 points à valider : prix, périmètre (ce qui est inclus), et date/conditions.  
> 3) Pour chacun, écris une question courte à envoyer/poser (même “Ok pour moi si…”).
>
> Tu préfères commencer par le prix (A) ou par le périmètre (B) ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- executed_tools: []
- durable_effect: aucun

### Tour 3

**User**
> Je commence par le prix. Prépare une carte d'attaque pour 'vérifier un devis en 6 minutes'. Je veux utiliser 'mot de bascule', même si je doute que ce soit vraiment adapté.

**Sophia**
> C'est noté pour la vérification du devis. Tu as un doute sur le 'Mot de bascule' et tu as raison : c'est surtout pour les moments où tu risques de craquer ou d'esquiver. Pour une tâche de 6 minutes, 'Le texte magique', 'Ancre visuelle' ou 'Preparer le terrain' seraient sans doute plus efficaces pour t'aider à te lancer. Laquelle préfères-tu ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: aucun
- note: correction confirmee vs r2: la technique forcee est challengee et Sophia propose des alternatives

### Tour 4

**User**
> Choisissons préparer le terrain. Setup : devis à gauche, note questions à droite. Montre le brouillon avant de créer.

**Sophia**
> Je n'ai pas pu préparer cette carte depuis le chat pour l'instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `none`
- executed_tools: [`prepare_attack_card`]
- tool_execution: `failed`
- durable_effect: aucun
- probleme: apres mediation correcte, le flow carte echoue au lieu de produire un brouillon

### Tour 5

**User**
> Ok, ne force pas la carte. Reste sans outil : donne-moi juste la version conversationnelle de ce setup en une phrase.

**Sophia**
> Respire, tu vas te fixer un “premier micro-mouvement” ultra simple: ouvrir le devis et ne vérifier que trois choses (prix, ce qui est inclus, et conditions/délais), puis préparer pour chacune une mini-question courte à envoyer. 🙂  
> Tu veux que je te la formule en mode “message prêt à copier” pour toi ou pour le contact ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `attack_card_cancelled_to_conversation`
- safety: `low`
- executed_tools: []
- durable_effect: aucun
- note: sortie du flow carte correcte, sans side effect

### Tour 6

**User**
> Programme un rappel dans 20 minutes : reprendre la vérification du devis si je n'ai pas envoyé mes questions.

**Sophia**
> C'est programmé pour vendredi 29 mai à 10:20 : reprendre la vérification du devis si je n'ai pas envoyé mes questions. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `explicit_one_shot_reminder_supersedes_tool_flow`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- durable_effect: rappel pending `2026-05-29T08:20:00+00:00`, local `10:20 Europe/Paris`, texte correct

### Tour 7

**User**
> Ajoute un rappel aujourd'hui à 09h55 : vérifier si le fournisseur a répondu.

**Sophia**
> Je n'ai pas encore programmé ce rappel : il me manque un moment futur clair. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: aucun
- note: past-time bloque correctement

### Tour 8

**User**
> Alors mets ce rappel aujourd'hui à 10h45 : vérifier si le fournisseur a répondu.

**Sophia**
> Je n’ai pas pu programmer ce rappel : je n’ai que l’info d’un rappel déjà en attente aujourd’hui à 10:20 (reprendre la vérification du devis). 🙂  
>
> Tu veux que je le reformule comme “vérifier si le fournisseur a répondu” pour quel moment exact : 10:45 ou tu confirmes 10:20 ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `none`
- executed_tools: []
- durable_effect: aucun
- probleme: le systeme voit le rappel 10:20 existant et ne traite pas directement la nouvelle heure future pourtant claire

### Tour 9

**User**
> Je confirme 10h45. Texte exact : vérifier si le fournisseur a répondu.

**Sophia**
> Ok, c’est noté: 10:45 + “vérifier si le fournisseur a répondu.” ✅🙂
>
> Petite question juste pour être sûr: tu veux que je te le rappelle aujourd’hui vendredi 29 mai ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_status_exact_priority`
- safety: `low`
- executed_tools: []
- durable_effect: aucun
- probleme: slots heure/texte conserves, mais demande encore une confirmation de date deja presente dans le fil

### Tour 10

**User**
> Oui, aujourd'hui vendredi 29 mai à 10h45.

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
- probleme: perte du texte apres confirmation de date; flow rappel toujours casse

### Tour 11

**User**
> Programme un rappel aujourd'hui à 10h45 : vérifier si le fournisseur a répondu.

**Sophia**
> C'est programmé pour vendredi 29 mai à 10:45 : vérifier si le fournisseur a répondu. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- durable_effect: rappel pending `2026-05-29T08:45:00+00:00`, local `10:45 Europe/Paris`, texte correct

### Tour 12

**User**
> Question produit : où retrouver dans l'app la carte d'attaque si elle existe, et les rappels programmés ? Donne les chemins, pas le statut.

**Sophia**
> Bonne question 🙂 Tu veux l’itinéraire dans l’app, donc voilà des chemins typiques :
>
> 1) Carte d’attaque (si elle existe)
> - Menu / Accueil
> - Puis Cartes (ou “Mes cartes”)
> - Choisir Carte d’attaque
>
> 2) Rappels programmés
> - Menu / Accueil
> - Puis Rappels (ou “Mes rappels” / “Rendez-vous” selon l’app)
> - Ensuite Calendrier ou Liste
>
> Dis-moi juste: tu es sur iPhone ou Android, et tu vois quel menu principal (Accuel/Profil/Menu) ? Je te donne le chemin exact pile pour ton écran. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_explicit_no_status_request`
- safety: `low`
- skill_entry_ids: [`product_help`]
- executed_tools: []
- durable_effect: aucun
- note: contenu product help utile, mais owner `normal_reply`; chemins restent generiques

### Tour 13

**User**
> Status strict, en 4 lignes maximum : carte active oui/non, rappels actifs avec heures locales, préférence coach nouvelle oui/non. Ne garde pas ce format comme préférence.

**Sophia**
> Carte d’attaque active : non  
> Carte de défense active : non  
> Rappels actifs : 10:20 + 10:45 (aujourd’hui, heure locale)  
> Préférence coach enregistrée : non 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_ponctual_response_format`
- safety: `low`
- executed_tools: []
- durable_effect: aucun
- note: status correct selon DB; format ponctuel non transforme en preference

### Tour 14

**User**
> Je me sens plus calme. Sans rien créer ni modifier, sépare ce qui est vérifié et ce qui reste non vérifiable depuis le chat.

**Sophia**
> Yes, carrément, respire 😌
>
> Vérifié depuis le chat (ce qui est certain) :
> - Il y a un rappel en attente aujourd’hui (vendredi 29 mai) à 10:20 : reprendre la vérification du devis si tu n’as pas envoyé tes questions.
> - Il y a un rappel en attente aujourd’hui à 10:45 : vérifier si le fournisseur a répondu.
>
> Reste non vérifiable depuis le chat (on ne peut pas le confirmer ici) :
> - Si tu as déjà envoyé tes questions (donc si tu dois vraiment relancer le “devis” à 10:20).
> - Si le fournisseur a répondu (on saura uniquement au moment du rappel à 10:45).

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `low`
- executed_tools: []
- durable_effect: aucun

### Tour 15

**User**
> Dernier tour : récap final en 5 lignes max, avec effets vérifiés et aucun conseil supplémentaire.

**Sophia**
> - Rappel vérifié: 29 mai 10:20 — reprendre la vérification du devis.  
> - Rappel vérifié: 29 mai 10:45 — vérifier si le fournisseur a répondu.  
> - Carte d’attaque active: aucune.  
> - Carte de défense active: aucune.  
> - Préférence coach enregistrée: aucune. ✅😌

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_recap_request_priority`
- safety: `none`
- executed_tools: []
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: side effects bien bloques malgre surcharge.
- Tour 2: decomposition claire et concrete.
- Tour 3: nette amelioration: Sophia challenge la technique `mot de bascule` et propose des alternatives plus adaptees.
- Tour 5: bonne sortie conversationnelle apres echec du flow carte.
- Tour 6: rappel relatif cree proprement.
- Tour 13: status strict correct, format ponctuel non memorise.
- Tour 15: recap final en 5 lignes respecte.

**Problemes**
- Tour 1: opportunite `attack_card` proposee en trace alors que le user dit "ne crée rien". Impact faible car non execute, mais signal opportuniste discutable. Severite: yellow.
- Tour 4: apres avoir choisi `préparer le terrain`, Sophia echoue a produire le brouillon. Impact: le flow carte devient inutilisable dans cette branche. Severite: red.
- Tours 8-10: reprise apres horaire passe reste confuse: nouvelle heure claire non executee, confirmation supplementaire inutile, puis perte du texte. Impact: repetition forcee. Severite: red.
- Tour 12: product help repond avec chemins generiques et owner `normal_reply`, pas le handler product help direct. Impact: aide utilisable mais moins fiable. Severite: yellow.

**Fix propose**
- Ne pas proposer `attack_card` comme opportunite quand le user interdit explicitement creation/tooling.
- Corriger le passage "technique alternative choisie -> brouillon" dans `prepare_attack_card`.
- Persister les slots rappel apres past-time: date, heure, texte, et intention de creation.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `explicit_no_tool_request_blocks_tool_start` fonctionne au tour 1.
- `execution_breakdown` fonctionne au tour 2.
- `prepare_attack_card` challenge correctement la technique au tour 3, mais echoue au tour 4 avec `executed_tools=["prepare_attack_card"]` et `tool_execution=failed`.
- `explicit_one_shot_reminder_supersedes_tool_flow` au tour 6 est bon: le rappel sort proprement du flow carte annule.
- Past-time bloque au tour 7, mais la reprise aux tours 8-10 reste mauvaise.
- Product help au tour 12 passe par `central_arbitrator_explicit_no_status_request`, avec `skill_entry_ids=["product_help"]`, mais owner `normal_reply`.
- `central_arbitrator_ponctual_response_format` au tour 13 reste correct.

**Skills / Operations / Tools**
- `prepare_attack_card`: mediation technique OK, execution alternative KO; aucune carte durable creee.
- `create_one_shot_reminder`: DB correcte pour les deux rappels finaux:
  - `10:20 Europe/Paris`: `reprendre la vérification du devis si je n'ai pas envoyé mes questions`
  - `10:45 Europe/Paris`: `vérifier si le fournisseur a répondu`
- `product_help`: contenu partiellement utile mais generique.
- `update_coach_preferences`: non declenche; aucune preference nouvelle.

**Memory / Effets durables**
- `scheduled_checkins`: 2 rappels `pending`, horaires et textes corrects.
- `user_attack_cards`: aucun record, coherent avec l'echec carte et les reponses finales.
- `user_profile_facts`: defaults seulement.
- `memory_items`: aucun.
- `user_topic_memories`: aucun.

**Problemes**
- Tour 4: `prepare_attack_card` execute puis echoue alors qu'un brouillon etait attendu. Impact systeme: flow de recuperation apres challenge casse. Severite: red.
- Tours 8-10: perte de slots rappel et routage status/default au lieu de creation. Impact systeme: side effect attendu retarde jusqu'a reformulation complete. Severite: red.
- Tour 12: product help sans owner product_help. Impact systeme: metadata/handler peu alignes. Severite: yellow.

**Fix propose**
- Ajouter un test de regression: user force technique douteuse -> Sophia propose alternative -> user choisit alternative + setup -> brouillon bloque, sans execution immediate.
- Corriger la machine d'etat du rappel apres `past-time`: si l'utilisateur donne une heure future, conserver texte et date courante.
- Harmoniser owner/handler pour product help quand `skill_entry_ids` contient `product_help` et l'intention est "où retrouver / chemins".

## Verdict Global

**yellow**

R3 confirme une correction importante: Sophia challenge enfin la technique `mot de bascule` quand le user exprime un doute. Les effets durables finaux sont corrects: deux rappels pending, aucune carte active, aucune preference nouvelle. Le run reste yellow car le flow carte alternatif echoue au moment du brouillon, et la reprise de rappel apres horaire passe reste fortement confuse avant reformulation complete.
