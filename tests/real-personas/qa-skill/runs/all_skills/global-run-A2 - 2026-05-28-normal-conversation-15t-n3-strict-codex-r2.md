# global-run-A2 - Global Normal Conversation 15T - N3 Strict Codex R2

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A2_20260528_n3_strict_r2`
- Persona: user QA temporaire local `2dde2955-c38d-4ec2-a299-9eb66b3f2be5`, email `qa-qa-skill-all-skills-global-run-a2-20260528-n3-strict-r2@example.com`, créé via Auth local puis supprimé en cleanup ciblé.
- Objectif: relancer après corrections A2 pour vérifier la synchronicité entre skills conversationnels, tools always-on et tool skills.
- Trajectoire: matinée saturée -> choix micro-action -> annulation carte non désirée -> phrase à Camille -> rappel ponctuel -> product help -> carte d'attaque explicite -> mémoire conversationnelle -> préférence coach -> réparation émotionnelle -> no-potion/récap -> vérification préférence.
- Surfaces visées: `execution_breakdown`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, mémoire conversationnelle, `update_coach_preferences`, `emotional_repair`, non-exécution `select_state_potion`.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `client_now_iso=2026-05-28T10:00:00.000+02:00`, aucun fallback déterministe.
- Validité QA: valide. Les 15 messages ont été choisis tour par tour après lecture de la réponse et de la trace courte précédente. Tous les tours ont retourné HTTP 200. Les effets DB ont été vérifiés avant cleanup.

## 2. Tours De Conversation

### Tour 1

**User**
> Ce matin j'ai trois trucs qui tirent dans tous les sens: payer une cotisation, répondre à Camille, et dégager mon bureau. Je veux juste le premier geste, pas une méthode complète.

**Sophia**
> Je vois que tu as trois priorités ce matin. Sur laquelle de ces trois tâches veux-tu qu'on se concentre pour déclencher ce premier geste : la cotisation, Camille ou ton bureau ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `ask_question`
- executed_tools: []
- durable_effect: none

### Tour 2

**User**
> Pas une carte. Je veux juste que tu me dises quoi faire maintenant. Choisis pour moi entre les trois.

**Sophia**
> D'accord, je choisis pour toi : on s'occupe de **répondre à Camille**. Pour t'aider à faire ce premier pas, tu préfères l'**Ancre visuelle** ou **Preparer le terrain** ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- tool_status: `ask_question`
- executed_tools: []
- durable_effect: none

### Tour 3

**User**
> Stop carte. Donne-moi juste une phrase de début pour Camille, une seule phrase.

**Sophia**
> Ok : “Camille, tu as 2 minutes aujourd’hui pour que je te réponde clairement à propos de X ?” 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: null
- executed_tools: []
- durable_effect: none

### Tour 4

**User**
> J'ai envoyé une version courte à Camille. Maintenant rappelle-moi à 11h05 de payer la cotisation, et ajoute juste une mini-consigne pour ne pas repartir dans le bureau.

**Sophia**
> C'est programmé pour jeudi 28 mai à 11:05 : Payer la cotisation (ne pas repartir dans le bureau). 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `explicit_one_shot_reminder_supersedes_tool_flow`
- tool_status: `executed`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: DB `scheduled_checkins` row `416aed4e-7b9c-4db0-85a4-4d34fee77c98`, `scheduled_for=2026-05-28T09:05:00+00:00`, `status=pending`, `origin=rendez_vous`, `reminder_kind=one_shot`

### Tour 5

**User**
> Si je veux vérifier ce rappel plus tard, je le vois où dans l'app ? Ne le modifie pas.

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

### Tour 6

**User**
> Maintenant autre sujet: fais-moi une carte d'attaque pour la cotisation. Cible: payer sans vérifier dix fois. Technique: ancre visuelle.

**Sophia**
> Titre : Cotisation : Un clic suffit
> Technique : Ancre visuelle
> Post-it : 'Vérifié une fois, payé pour de bon.'
> Place ce message sur ton écran avant de payer pour bloquer le réflexe de vérification.
> Je te prépare cette carte ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `pending_confirmation`
- executed_tools: []
- durable_effect: none

### Tour 7

**User**
> Oui, prépare-la comme ça.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Cotisation : Un clic suffit
> Technique : Ancre visuelle
> Post-it : 'Vérifié une fois, payé pour de bon.'
>
> Mode d'emploi : Place ce message sur ton écran avant de payer pour bloquer le réflexe de vérification.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_status: `executed`
- executed_tools: [`prepare_attack_card`]
- durable_effect: DB `user_attack_cards` row `429d705a-5507-42bf-96f8-3c6d9456b294`, `status=active`, `scope_kind=out_of_plan`, target "Payer la cotisation sans vérifier dix fois", technique `ancre_visuelle`

### Tour 8

**User**
> Récapitule ce que tu as compris de mon piège de ce matin, uniquement ce qui est utile pour la suite.

**Sophia**
> Ok, voilà l’essentiel que j’ai compris de ton “piège” de ce matin, juste ce qui sert pour la suite 😅
>
> 1) Tu étais bloqué par trop de sujets en même temps (cotisation, Camille, bureau), donc tu voulais “le premier geste” plutôt qu’un plan complet.
> 2) Ton risque principal, c’est la vérification en boucle pour la cotisation (tu voulais payer sans repasser 10 fois par le même contrôle).
> 3) Tu n’as pas besoin d’une méthode longue: tu as besoin d’un déclencheur ultra simple + une règle “ne pars pas dans le bureau”.
> 4) Tu as validé que pour avancer, tu préfères une phrase/une consigne courte et actionnable (puis ensuite tu agis).
>
> Si tu veux, je peux transformer ça en une seule règle de 1 ligne pour ta prochaine session “je décide et j’exécute”. ✅

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- executed_tools: []
- durable_effect: none

### Tour 9

**User**
> Oui, et enregistre une préférence durable: quand je demande 'court', réponds en 3 lignes max, sans emoji, et ne finis pas par une question si ce n'est pas nécessaire.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- tool_status: `executed`
- executed_tools: [`update_coach_preferences`]
- durable_effect: DB later shows `coach.question_tendency=low`; no durable key for "sans emoji" observed.

### Tour 10

**User**
> Je suis frustré d'avoir eu besoin de tout ce cadrage. Pas en danger, juste honteux. Réponds court.

**Sophia**
> Pfff… ouais, c’est frustrant, et la honte c’est un vrai poison. 😕
> Mais le fait d’avoir eu besoin de cadrage ne dit pas “t’es nul” : ça dit “tu avais besoin d’un rail pour agir sans te perdre”.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: null
- executed_tools: []
- durable_effect: none

### Tour 11

**User**
> Ne lance rien maintenant, pas de potion. Fais seulement un récap en 5 lignes max: fait, prévu, fragile.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Cotisation : Un clic suffit).
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé (Payer la cotisation (ne pas repartir dans le bureau)).
> - Préférences coach : oui, moins de questions, challenge équilibré, ton bienveillant ferme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- tool_status: `answered`
- executed_tools: []
- durable_effect: none

### Tour 12

**User**
> Où est-ce que je retrouve la carte d'attaque que tu viens de créer ? Juste l'emplacement, pas d'action.

**Sophia**
> Tu la retrouves dans Ressources > Cartes d’attaque. 📌

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `active_skill_exit_requested`
- executed_tools: []
- durable_effect: none

### Tour 13

**User**
> La préférence n'est pas encore respectée sur les emojis. Enregistre plus strictement: si je dis court, zéro emoji, trois lignes max, pas de question finale inutile.

**Sophia**
> Bien reçu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- tool_status: `pending_confirmation`
- executed_tools: []
- durable_effect: none yet

### Tour 14

**User**
> Oui, garde-la, mais seulement si ça inclut vraiment zéro emoji quand je demande court.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- tool_status: `executed`
- executed_tools: [`update_coach_preferences`]
- durable_effect: DB `coach.question_tendency=low`, but no durable representation of "zéro emoji"

### Tour 15

**User**
> Court: fais le bilan final de ce run en trois lignes, sans emoji, sans question.

**Sophia**
> Fait : carte d'attaque créée et rappel ponctuel programmé pour la cotisation.
> Prévu : passage à l'action immédiat sans nouvelle vérification inutile.
> Fragile : la honte ressentie face au besoin de cadrage, à surveiller pour la suite. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- executed_tools: []
- durable_effect: none
- note: respecte 3 lignes et pas de question, mais viole "sans emoji".

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tours 4-5: rappel ponctuel créé et product help répond sans modifier le rappel.
- Tours 6-7: la demande explicite de carte d'attaque après product help est bien routée; pas de répétition stale du rappel comme en A2 R1.
- Tour 8: mémoire conversationnelle immédiate correcte.
- Tour 11: correction visible du bug "pas de potion": Sophia ne propose plus Guérison/Amour et fournit un récap.
- Tour 12: emplacement carte d'attaque correct et sans action.

**Problemes**
- Tours 1-2: faux départ `prepare_attack_card` dès une demande de premier geste, puis persistance après "Pas une carte". Impact: l'utilisateur doit contrer le système pour obtenir une simple aide d'exécution. Sévérité: red.
- Tour 3: le contenu répond enfin à la demande, mais la trace reste `tool_skill/prepare_attack_card`; l'annulation n'est pas propre. Sévérité: yellow.
- Tours 9, 13-15: Sophia annonce une préférence "sans emoji", mais ses réponses contiennent encore des emojis, et la DB ne reflète que "moins de questions". Impact: promesse de personnalisation non tenue. Sévérité: red.
- Tour 11: récap utile, mais il ajoute "carte de défense" non demandée et un emoji malgré la préférence annoncée. Sévérité: yellow.

**Fix propose**
- Prioriser une sortie de tool skill nette sur "pas une carte", "stop carte", "juste une phrase".
- Ne pas démarrer `prepare_attack_card` sur une demande de premier geste sans demande explicite de carte, attaque, outil ou support durable.
- Pour `update_coach_preferences`, ne pas accepter ou annoncer des préférences non supportées ("sans emoji") comme durables; soit mapper réellement vers un champ supporté, soit dire que cette granularité n'est pas encore enregistrable.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Régression persistante: Tour 1 route en `tool_skill/prepare_attack_card` alors que l'intention est `execution_breakdown` ou `normal_reply` micro-action.
- Annulation partielle: Tour 2 reste en `active_tool_skill_continue` malgré "Pas une carte". Tour 3 répond correctement en surface, mais garde `response_owner=tool_skill`.
- Correction confirmée: Tour 6 ne subit plus le `product_help` stale après un rappel; il route bien vers `prepare_attack_card`.
- Correction confirmée: Tour 11 bloque le tool start et ne propose pas de potion malgré "pas de potion".
- Préférence coach: Tours 9 et 14 exécutent `update_coach_preferences`, mais le contenu et l'effet durable ne couvrent pas toute l'intention.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: pass. DB: rappel à `2026-05-28T09:05:00+00:00`, soit 11:05 Europe/Paris, status `pending`.
- `prepare_attack_card`: mixed. Faux positif en entrée, mais succès correct en demande explicite; DB: une carte active `429d705a-5507-42bf-96f8-3c6d9456b294`.
- `product_help`: pass sur rappel; plus de stale product help quand le user demande ensuite une carte.
- `update_coach_preferences`: partial/fail. DB: `coach.question_tendency=low`, `source_type=explicit_user`, `last_confirmed_at` présent. Les contraintes "zéro emoji" et "3 lignes max" ne sont pas représentées comme demandé, et le comportement ne les respecte pas.
- `emotional_repair`: pass système au tour 10, sans side effect.
- `select_state_potion`: pass au tour 11 côté non-exécution et contenu.

**Memory / Effets durables**
- Mémoire conversationnelle immédiate: pass au tour 8.
- DB vérifiée avant cleanup:
  - `user_attack_cards`: 1 carte active, cible et technique correctes.
  - `scheduled_checkins`: 1 rappel ponctuel pending, horaire correct.
  - `user_profile_facts`: `coach.question_tendency=low` seulement pour la préférence explicit_user; pas de champ durable couvrant "sans emoji".
- Cleanup: compte Auth temporaire supprimé via endpoint admin local; fichier de connexion temporaire supprimé; fichiers contenant tokens/clés supprimés.

**Problemes**
- Tour 1: mauvais owner/handler initial. Impact système: red, car mauvais router sur l'entrée conversationnelle principale.
- Tours 2-3: annulation tool skill incomplète. Impact système: yellow/red.
- Tour 14: `response_owner=product_help`, `selected_handler=product_help`, mais `executed_tools=["update_coach_preferences"]`. Impact observabilité: incohérent. Sévérité: yellow.
- Tours 9/14/15: durable effect partiel et comportement non aligné sur la préférence "sans emoji". Impact système: red.

**Fix propose**
- Durcir la détection `prepare_attack_card`: ne pas inférer un tool skill depuis "premier geste" ou "déclencher" sans demande durable explicite.
- Ajouter une route prioritaire `cancel_tool_skill_to_conversation` pour "pas une carte", "stop carte", "juste une phrase".
- Normaliser la trace d'exécution `update_coach_preferences` pour éviter `product_help` comme owner quand un tool s'exécute.
- Clarifier le modèle de préférences supportées: refuser ou reformuler les granularités non persistables au lieu de les annoncer comme appliquées.

## Verdict Global

- Verdict: red
- Raison principale: corrections partielles visibles (`product_help` stale corrigé, no-potion corrigé, carte explicite OK), mais le faux départ `prepare_attack_card` et la préférence coach partiellement/faussement appliquée restent bloquants.
- Follow-up prioritaire: corriger la priorité d'entrée/sortie de `prepare_attack_card`, puis traiter explicitement la granularité non supportée des préférences de style comme "sans emoji".
