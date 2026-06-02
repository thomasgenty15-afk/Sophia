# Update Coach Preferences Cross-Flow QA

## 1. Contexte Du Test

- Date: 2026-06-01
- Run: `qa-coach-pref-crossflow-1780348629248` + complement `qa-coach-pref-crossflow-focus-1780348860768`
- Persona: users QA temporaires locaux marques `is_test_persona=true`, supprimes apres run
- Objectif: verifier comment une demande explicite `update_coach_preferences` se comporte pendant d'autres flows actifs, puis comment le user peut reprendre le flow precedent
- Trajectoire: tentative carte d'attaque, tentative rappel recurrent, carte de defense active, interruption preference coach, reprise du flow precedent
- Surfaces visees: dispatcher, active handoff arbitration, orientation clarification, `update_coach_preferences`, `prepare_defense_card`, recurring reminder routing, EffectLedger
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct
- Validite QA: valide pour les tours executes via endpoint reel. Les tours attack/recurring n'ont pas cree le flow actif attendu; ils sont conserves comme bugs de precondition/routage, pas comme preuve cross-flow principale.

## 2. Tours De Conversation

### Tour 1 - Tentative Carte D'attaque

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> Prepare une carte d'attaque pour lancer mon dossier fiscal quand je repousse et que j'ouvre YouTube a la place.

**Sophia**
> Je ne l'ai pas modifie.

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: execution_breakdown
- route_reason: skill_entry_signal
- direct_effects: []
- operation: none
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: la demande explicite de carte d'attaque ne demarre pas `prepare_attack_card`.
- Source amont probable: dispatcher / central arbitrator.
- Owner runtime: routing tool skill.
- Meilleure correction selon les guidelines: renforcer la priorite tool_skill quand la demande contient une creation/preparation explicite de carte d'attaque, sans capter les questions produit.

### Tour 2 - Preference Coach Apres Tentative Carte

**Verdict du tour:** green

**User**
> Preference coach tres claire : pour la suite, sois plus direct et pose moins de questions.

**Sophia**
> Ce que je comprends : Preference coach tres claire : pour la suite, sois plus direct et pose moins de questions.
>
> Durable ou ponctuel : preference durable correspondant a un reglage supporte.
>
> Reglage supporte recommande :
> - Ton global : Tres direct
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

### Tour 3 - Reprise Carte Apres Preference

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok, on reprend la carte d'attaque d'avant.

**Sophia**
> D'accord, je suis prete. C'etait pour quelle action ou quel objectif deja ?

**Trace courte**
- response_owner: tool_skill
- selected_handler: prepare_attack_card
- route_reason: explicit_tool_intent_supersedes_active_conversation_skill
- operation: ask_question
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: Sophia ne reprend pas le contexte "dossier fiscal / YouTube" donne au tour 1.
- Source amont probable: le flow carte n'avait pas ete instancie au tour 1, donc aucun draft a restaurer.
- Owner runtime: prepare_attack_card routing/state.
- Meilleure correction: d'abord corriger le routage du tour 1; ensuite verifier que l'ancien handoff reste restaurable apres interruption preference.

### Tour 4 - Tentative Rappel Recurrent

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
- Symptome: une creation explicite de rappel recurrent est traitee comme statut/read-only.
- Source amont probable: status_only guard trop agressif devant create_recurring_reminder.
- Owner runtime: central arbitration / status guard.
- Meilleure correction: laisser les intentions explicites `create_recurring_reminder` battre le statut quand le message est une commande de creation.

### Tour 5 - Preference Coach Apres Tentative Rappel

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

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Reprends le rappel recurrent d'avant, celui du lundi matin.

**Sophia**
> Petit rate technique de mon cote en preparant cette preference. Je ne modifie rien depuis le chat; redis-moi ce que tu veux changer et je reprends le handoff.

**Trace courte**
- response_owner: tool_skill
- selected_handler: update_coach_preferences
- route_reason: active_handoff_revise_handoff
- turn_frame.tool_skill_intents: create_recurring_reminder explicit/high/none
- operation: update_coach_preferences / blocked
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: le user demande explicitement de reprendre le rappel, mais le handoff preference actif capture le message et bloque.
- Source amont probable: active handoff arbitration ne laisse pas sortir `update_coach_preferences` vers un tool_skill explicite concurrent.
- Owner runtime: active handoff arbitration / update_coach_preferences follow-up policy.
- Meilleure correction: quand un handoff preference est actif, une intention tool explicite concurrente non ambigue doit interrompre le handoff preference.

### Tour 7 - Carte De Defense Active

**Verdict du tour:** green

**User**
> Prepare une carte de defense pour eviter de scroller le soir quand je suis fatigue, mais ne cree rien sans me demander.

**Sophia**
> Je ne cree pas la carte depuis le chat. Voici la version a reprendre dans la section Cartes de defense.
>
> Situation / action comprise : Telephone
> Risque identifie : Le soir quand je suis fatigue (Envie de scroller)
> Strategie de defense recommandee : Reponse preparee avant le moment de risque
>
> Destination plateforme : dans la section Cartes de defense
>
> Je ne cree ni ne modifie aucune carte depuis ce chat.

**Trace courte**
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: tool_skill_intent_start
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
- operation: none
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: la demande etait explicite, mais Sophia demande une orientation au lieu de lancer le handoff preference.
- Source amont probable: active handoff arbitration trop conservatrice avec handoff defense actif.
- Owner runtime: active handoff arbitration / clarification arbitration.
- Meilleure correction: une demande `Preference coach ... pour la suite ...` explicite doit interrompre un handoff plateforme actif, sauf signal concurrent clair de continuer ce flow.

### Tour 9 - User Choisit Explicitement Les Preferences

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Je choisis les preferences coach : pour la suite, plus doux et moins de questions.

**Sophia**
> Je ne cree pas la carte depuis le chat. Voici la version a reprendre dans la section Cartes de defense.

**Trace courte**
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: active_handoff_repeat_handoff
- operation: prepare_defense_card / repeat_handoff
- pending_confirmation: null
- executed_tools: []
- committed_effects: []

**Analyse si yellow/red**
- Symptome: apres clarification, le choix explicite "preferences coach" est ignore et l'ancien handoff defense reprend.
- Source amont probable: resolution de clarification / active handoff state ne promeut pas update_coach_preferences.
- Owner runtime: orientation clarification arbitration + active handoff arbitration.
- Meilleure correction: la reponse de clarification doit router vers `update_coach_preferences` et suspendre/clear le handoff defense sans mutation.

### Tour 10 - Reprendre La Carte De Defense

**Verdict du tour:** green

**User**
> Ok, maintenant reprends la carte de defense d'avant.

**Sophia**
> Je ne cree pas la carte depuis le chat. Voici la version a reprendre dans la section Cartes de defense.

**Trace courte**
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: active_handoff_revise_handoff
- operation: prepare_defense_card / revise_handoff
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: prepare_defense_card, no_chat_mutation=true

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- `update_coach_preferences` fonctionne bien quand aucun autre flow actif ne le capture.
- La carte de defense active peut etre repetee/reprise correctement quand l'utilisateur demande clairement de reprendre la carte.
- Aucun tour n'a ecrit de preference coach depuis le chat.

**Problemes**
- Tour 8: une demande de preference coach explicite pendant une carte de defense active declenche une clarification inutile. Famille: BF-ROUTE-02. Impact: le user doit se repeter.
- Tour 9: quand le user repond explicitement qu'il choisit les preferences coach, Sophia reprend quand meme la carte de defense. Famille: BF-ROUTE-02. Impact: interruption impossible depuis ce flow.
- Tour 6: apres un handoff preference actif, une reprise explicite du rappel recurrent est avalee par `update_coach_preferences` et finit en erreur. Famille: BF-ROUTE-02. Impact: le user ne peut pas revenir au flow precedent.
- Tours 1 et 4: les preconditions attack/recurring n'ont pas demarre le bon flow, ce qui limite leur valeur comme tests cross-flow.

**Fix propose**
- Source amont: active handoff arbitration + clarification arbitration.
- Correction recommandee: declarer `update_coach_preferences` comme interruption explicite autorisee des handoffs plateforme quand le message contient une intention durable explicite; declarer les intentions tool explicites concurrentes comme sorties autorisees d'un handoff preference actif.
- Tests d'invariant attendus: defense handoff + preference explicite -> update_coach_preferences; clarification "je choisis les preferences" -> update_coach_preferences; coach preference handoff + "reprends le rappel/la carte" -> tool_skill cible, no blocked.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Bon: preference coach hors flow actif route vers `update_coach_preferences`.
- Mauvais: defense handoff actif route une preference explicite vers `orientation_clarification`.
- Mauvais: la reponse a cette clarification route vers `prepare_defense_card` au lieu de `update_coach_preferences`.
- Mauvais: handoff preference actif capture une reprise explicite de rappel recurrent.

**Skills / Operations / Tools**
- `update_coach_preferences` reste non-mutant quand il est atteint.
- `prepare_defense_card` reste non-mutant et conserve son handoff.
- Aucun executor DB n'a ete appele dans les runs observes.

**DB / Effets Durables**
- Attack run: `user_profile_facts` 9 -> 9, `scheduled_checkins` 0 -> 0, cards 0 -> 0.
- Recurring run: `user_profile_facts` 9 -> 9, `scheduled_checkins` 0 -> 0, cards 0 -> 0.
- Defense run: `user_profile_facts` 9 -> 9, `user_defense_cards` 0 -> 0.
- Complement defense: `user_profile_facts` 9 -> 9, `user_defense_cards` 0 -> 0.

Verdict global: red.
