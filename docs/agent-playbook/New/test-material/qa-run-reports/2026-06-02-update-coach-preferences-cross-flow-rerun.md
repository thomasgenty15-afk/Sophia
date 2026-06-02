# Update Coach Preferences Cross-Flow Rerun

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `qa-coach-pref-crossflow-rerun-1780351752682` + focus `qa-coach-pref-recurring-focus-1780352120862`
- Persona: users QA temporaires locaux marques `is_test_persona=true`, supprimes apres run
- Objectif: verifier apres correction comment `update_coach_preferences` interrompt ou cede la main pendant d'autres flows actifs
- Trajectoire: carte d'attaque, rappel recurrent, carte de defense, preference coach explicite, reprise de l'ancien flow
- Surfaces visees: dispatcher, orientation clarification, active handoff arbitration, `update_coach_preferences`, `prepare_attack_card`, `prepare_defense_card`, `create_recurring_reminder`
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct
- Validite QA: valide. Le run principal a ete lent dans un environnement local charge; la partie rappel recurrent a ete completee par un mini-rerun reel focalise.

## 2. Tours De Conversation

### Tour 1 - Carte D'attaque Demandee

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> Prepare une carte d'attaque pour lancer mon dossier fiscal quand je repousse et que j'ouvre YouTube a la place.

**Sophia**
> Veux-tu preparer cette carte d'attaque pour ton demarrage, decouper cette action ou as-tu besoin d'une explication ?

**Trace courte**
- http_status: 200
- response_owner: orientation_clarification
- selected_handler: orientation_clarification
- route_reason: clarification_required
- direct_effects: []
- operation: none
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: la demande explicite ne demarre pas directement `prepare_attack_card`.
- Source amont probable: dispatcher / clarification arbitration priorise une clarification alors que la demande est assez claire.
- Owner runtime: routing + clarification arbitration.
- Meilleure correction selon les guidelines: l'intention explicite `prepare_attack_card` doit etre candidate forte et battre `execution_breakdown/product_help` quand le user demande "prepare une carte d'attaque".

### Tour 2 - Preference Coach Pendant Clarification Carte

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Preference coach tres claire : pour la suite, sois plus direct et pose moins de questions.

**Sophia**
> Je ne l'ai pas note.

**Trace courte**
- response_owner: normal_reply
- selected_handler: null
- route_reason: orientation_clarification_topic_change
- operation: none
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: une preference coach explicite pendant une clarification active n'est pas routee vers `update_coach_preferences`.
- Source amont probable: resolution de clarification active classe le tour comme topic_change sans relancer l'arbitrage tool_skill.
- Owner runtime: orientation clarification arbitration.
- Meilleure correction: une reponse qui quitte la clarification vers une preference coach explicite doit router vers `update_coach_preferences`, pas `normal_reply`.

### Tour 3 - Reprise Carte D'attaque

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok, on reprend la carte d'attaque d'avant.

**Sophia**
> D'accord, je suis prete. Pour quelle action ou quel moment precis veux-tu qu'on prepare cette carte ?

**Trace courte**
- response_owner: tool_skill
- selected_handler: prepare_attack_card
- route_reason: orientation_clarification_resolved_tool_skill
- operation: ask_question
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: le contexte donne au tour 1 n'est pas repris.
- Source amont probable: aucune carte n'avait ete instanciee au tour 1.
- Owner runtime: prepare_attack_card state / orientation clarification.
- Meilleure correction: corriger d'abord le tour 1; ensuite verifier la restauration du draft apres interruption.

### Tour 4 - Rappel Recurrent Demande

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-03 - Product/status/tool mal priorises

**User**
> Je veux mettre en place un rappel recurrent tous les lundis a 9h pour preparer ma semaine.

**Sophia**
> Je ne l'ai pas enregistre.

**Trace courte**
- response_owner: tool_skill
- selected_handler: status_recap
- route_reason: status_only_request_blocks_tool_start
- operation: status_recap / answered
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: une creation explicite de rappel recurrent est traitee comme statut.
- Source amont probable: status guard trop agressif avant create_recurring_reminder.
- Owner runtime: central arbitration / status guard.
- Meilleure correction: l'intention explicite de creation recurrente doit battre le status guard.

### Tour 5 - Preference Coach Apres Rappel Rate

**Verdict du tour:** green

**User**
> Preference coach explicite : pour la suite, challenge-moi plus mais garde peu de questions.

**Sophia**
> Ce que je comprends : Preference coach explicite : pour la suite, challenge-moi plus mais garde peu de questions.
>
> Reglage supporte recommande :
> - Niveau de challenge : Eleve
> - Tendance a poser des questions : Peu de questions
>
> Destination plateforme : dans les Preferences coach.
>
> Je ne modifie pas tes preferences depuis le chat.

**Trace courte**
- response_owner: tool_skill
- selected_handler: update_coach_preferences
- route_reason: central_arbitrator_coach_preference_priority
- operation: handoff_delivered
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: update_coach_preferences, no_chat_mutation=true

### Tour 6 - Reprise Rappel Apres Preference

**Verdict du tour:** green

**User**
> Reprends le rappel recurrent d'avant, celui du lundi matin.

**Sophia**
> Ok, je te prepare ca pour la section Rappels.
>
> Pour le rappel, garde le message "Preparer ma semaine". Il doit revenir chaque semaine, le lundi, a 09:00, Europe/Paris.
>
> Dans la plateforme, va dans la section Rappels, puis cree un rappel recurrent avec ces elements.
>
> Je ne cree pas de rappel recurrent depuis le chat.

**Trace courte**
- response_owner: tool_skill
- selected_handler: create_recurring_reminder
- route_reason: create_recurring_reminder_interrupts_active_handoff
- operation: handoff_delivered
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: create_recurring_reminder, no_chat_mutation=true

### Tour 7 - Carte De Defense Active

**Verdict du tour:** green

**User**
> Prepare une carte de defense pour eviter de scroller le soir quand je suis fatigue, mais ne cree rien sans me demander.

**Sophia**
> Je ne cree pas la carte depuis le chat. Voici la version a reprendre dans la section Cartes de defense.

**Trace courte**
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- operation: handoff_ready
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: prepare_defense_card, no_chat_mutation=true

### Tour 8 - Preference Coach Pendant Carte De Defense

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Preference coach tres claire : pour la suite, parle-moi plus doucement et pose moins de questions.

**Sophia**
> Est-ce que tu veux modifier tes preferences ou continuer sur la carte de defense ?

**Trace courte**
- response_owner: orientation_clarification
- selected_handler: orientation_clarification
- route_reason: clarification_required
- tool_skill_intents: update_coach_preferences explicit/high
- operation: none
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: la preference coach explicite ne prend pas directement le dessus, meme si elle est reconnue comme candidate.
- Source amont probable: active handoff arbitration / clarification arbitration reste trop conservatrice.
- Owner runtime: active handoff arbitration.
- Meilleure correction: une intention `update_coach_preferences` explicite/high doit interrompre un handoff plateforme non-preference, sauf instruction claire de rester dans ce flow.

### Tour 9 - Choix Explicite Des Preferences

**Verdict du tour:** green

**User**
> Je choisis les preferences coach : pour la suite, plus doux et moins de questions.

**Sophia**
> Ce que je comprends : Je choisis les preferences coach : pour la suite, plus doux et moins de questions.
>
> Reglage supporte recommande :
> - Ton global : Doux
> - Tendance a poser des questions : Peu de questions
>
> Destination plateforme : dans les Preferences coach.
>
> Je ne modifie pas tes preferences depuis le chat.

**Trace courte**
- response_owner: tool_skill
- selected_handler: update_coach_preferences
- route_reason: update_coach_preferences_interrupts_active_handoff
- operation: handoff_delivered
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: update_coach_preferences, no_chat_mutation=true

### Tour 10 - Reprise Carte De Defense Apres Preference

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok, maintenant reprends la carte de defense d'avant.

**Sophia**
> Je n'ai pas le detail de cette carte en tete. Tu peux me rappeler quel etait le risque ou l'action qu'on voulait proteger ?

**Trace courte**
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: prepare_defense_card_interrupts_active_handoff
- operation: ask_question
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: Sophia revient au bon tool, mais ne restaure pas le brouillon defense precedent.
- Source amont probable: clear/suspension du handoff defense lors de l'interruption preference sans mecanisme de reprise contextuelle.
- Owner runtime: active handoff state / suspended flow restoration.
- Meilleure correction: conserver un snapshot suspendu du handoff precedent quand `update_coach_preferences` interrompt un handoff plateforme, puis le restaurer sur "reprends la carte".

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- `update_coach_preferences` reste no-mutation quand il est atteint.
- La reprise du rappel recurrent depuis un handoff preference fonctionne maintenant.
- Le choix explicite "je choisis les preferences coach" apres clarification defense route maintenant vers `update_coach_preferences`.

**Problemes**
- Tour 1: carte d'attaque explicite demande encore une clarification. Famille: BF-ROUTE-01. Impact: friction forte.
- Tour 2: preference coach pendant clarification carte part en normal_reply "pas note". Famille: BF-ROUTE-02. Impact: intention claire perdue.
- Tour 4: rappel recurrent explicite reste capture par status. Famille: BF-ROUTE-03. Impact: creation handoff impossible au premier tour.
- Tour 8: preference coach explicite pendant defense demande encore une clarification. Famille: BF-ROUTE-02. Impact: friction mais recuperable.
- Tour 10: reprise carte defense revient au bon tool mais perd le draft. Famille: BF-STATE-01. Impact: le user doit repeter.

**Fix propose**
- Source amont: dispatcher/clarification arbitration, active handoff arbitration, suspended handoff restoration.
- Correction recommandee: prioriser les tool intents explicites, puis gerer la suspension/restauration d'un handoff precedent quand un handoff preference l'interrompt.
- Tests d'invariant attendus: attack explicit sans clarification inutile; recurring create bat status; preference coach pendant clarification active route vers update; reprise carte restaure le draft.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Corrige: `update_coach_preferences` peut interrompre un handoff defense apres choix explicite.
- Corrige: `create_recurring_reminder` peut interrompre un handoff preference actif.
- Encore problematique: status guard bat creation recurrente initiale.
- Encore problematique: orientation clarification peut absorber une preference coach explicite.

**Skills / Operations / Tools**
- `executed_tools=[]` sur les tours observes.
- `committed_effects=[]`.
- `pending_confirmation=null`.
- Les handoffs restent `no_chat_mutation=true` quand presents.

**DB / Effets Durables**
- Run principal: compteurs visibles inchanges (`user_profile_facts` 9 -> 9; reminders/cards 0 -> 0).
- Mini-run recurrent: traces sans executed tools ni committed effects.

Verdict global: yellow.
