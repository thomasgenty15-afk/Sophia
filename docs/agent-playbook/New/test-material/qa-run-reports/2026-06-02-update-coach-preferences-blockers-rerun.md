# Update Coach Preferences Blockers Rerun

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `qa-coach-pref-blockers-1780401830172`
- Persona: users QA temporaires locaux, marques `is_test_persona=true`, supprimes apres run
- Objectif: verifier les corrections sur les blockers du dernier run cross-flow `update_coach_preferences`
- Trajectoire: carte d'attaque -> preference coach -> reprise; rappel recurrent -> preference coach -> reprise; carte de defense -> preference coach -> reprise
- Surfaces visees: dispatcher, central arbitrator, active handoff arbitration, suspended handoff state, `prepare_attack_card`, `create_recurring_reminder`, `prepare_defense_card`, `update_coach_preferences`
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct
- Validite QA: valide comme rerun cible de non-regression sur blockers. Limite: messages de scenario prepares pour couvrir les bugs connus, donc moins fort qu'un run conversationnel adaptatif complet.
- Artefacts bruts: `tmp/qa-coach-pref-blockers-1780401830172/raw.json`, `tmp/qa-coach-pref-blockers-1780401830172/summary.json`

## 2. Tours De Conversation

### Scenario Attack - Tour 1

**Verdict du tour:** green

**User**
> Prepare une carte d'attaque pour lancer mon dossier fiscal quand je repousse et que j'ouvre YouTube a la place.

**Sophia**
> Cible/action comprise : Prepare une carte d'attaque pour lancer mon dossier fiscal quand je repousse et que j'ouvre YouTube a la place.
>
> Obstacle ou piege identifie : quand je repousse et que j'ouvre YouTube a la place
>
> Technique recommandee : Le texte magique
> Pourquoi : Il court-circuite la negociation mentale en rappelant la realite de l'evitement.
>
> Brouillon de carte :
> Dossier Fiscal vs YouTube
> YouTube ne m'apportera rien de plus que du bruit. Mon dossier fiscal est ma priorite de l'instant. Je ferme cet onglet et j'ouvre le dossier maintenant.
>
> Destination plateforme : dans la section Cartes d'attaque.
>
> Je ne cree pas de carte depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_attack_card
- route_reason: central_arbitrator_explicit_attack_card_creation
- safety: none observed
- direct_effects: []
- operation: platform_handoff
- pending_confirmation: null
- memory_plan: not relevant
- executed_tools: []
- durable_effect: committed_effects=[]

### Scenario Attack - Tour 2

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
- http_status: 200
- response_owner: tool_skill
- selected_handler: update_coach_preferences
- route_reason: update_coach_preferences_interrupts_active_handoff
- safety: none observed
- direct_effects: []
- operation: platform_handoff
- pending_confirmation: null
- memory_plan: not relevant
- executed_tools: []
- durable_effect: committed_effects=[]

### Scenario Attack - Tour 3

**Verdict du tour:** green

**User**
> Ok, on reprend la carte d'attaque d'avant.

**Sophia**
> Cible/action comprise : Prepare une carte d'attaque pour lancer mon dossier fiscal quand je repousse et que j'ouvre YouTube a la place.
>
> Obstacle ou piege identifie : quand je repousse et que j'ouvre YouTube a la place
>
> Technique recommandee : Le texte magique
>
> Brouillon de carte : Dossier Fiscal vs YouTube.
>
> Destination plateforme : dans la section Cartes d'attaque.
>
> Je ne cree pas de carte depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_attack_card
- route_reason: prepare_attack_card_interrupts_active_handoff
- safety: none observed
- direct_effects: []
- operation: platform_handoff
- pending_confirmation: null
- memory_plan: not relevant
- executed_tools: []
- durable_effect: committed_effects=[]

### Scenario Recurring - Tour 1

**Verdict du tour:** green

**User**
> Je veux mettre en place un rappel recurrent tous les lundis a 9h pour preparer ma semaine.

**Sophia**
> Ok, je te prepare ca pour la section Rappels.
>
> Pour le rappel, garde le message "Preparer ma semaine". Il doit revenir chaque semaine, le lundi, a 09:00, Europe/Paris.
>
> Dans la plateforme, va dans la section Rappels, puis cree un rappel recurrent avec ces elements.
>
> Je ne cree pas de rappel recurrent depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: create_recurring_reminder
- route_reason: central_arbitrator_recurring_reminder_intent_priority
- safety: none observed
- direct_effects: []
- operation: platform_handoff
- pending_confirmation: null
- memory_plan: not relevant
- executed_tools: []
- durable_effect: committed_effects=[]

### Scenario Recurring - Tour 2

**Verdict du tour:** green

**User**
> Preference coach explicite : pour la suite, challenge-moi plus mais garde peu de questions.

**Sophia**
> Ce que je comprends : Preference coach explicite : pour la suite, challenge-moi plus mais garde peu de questions.
>
> Durable ou ponctuel : preference durable correspondant a un reglage supporte.
>
> Reglage supporte recommande :
> - Niveau de challenge : Eleve
> - Tendance a poser des questions : Peu de questions
>
> Destination plateforme : dans les Preferences coach.
>
> Je ne modifie pas tes preferences depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: update_coach_preferences
- route_reason: update_coach_preferences_interrupts_active_handoff
- safety: none observed
- direct_effects: []
- operation: platform_handoff
- pending_confirmation: null
- memory_plan: not relevant
- executed_tools: []
- durable_effect: committed_effects=[]

### Scenario Recurring - Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Reprends le rappel recurrent d'avant, celui du lundi matin.

**Sophia**
> Veux-tu que je te redonne les details de ce rappel ou veux-tu modifier un element ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: create_recurring_reminder
- route_reason: create_recurring_reminder_interrupts_active_handoff
- safety: none observed
- direct_effects: []
- operation: platform_handoff
- pending_confirmation: null
- memory_plan: not relevant
- executed_tools: []
- durable_effect: committed_effects=[]

**Analyse si yellow/red**
- Symptome: Sophia revient au bon skill, mais ne repete pas directement le handoff connu du lundi 09:00.
- Source amont probable: restauration partielle du handoff recurrent ou classification `repeat_handoff` trop prudente apres interruption preference.
- Owner runtime: active handoff state / `create_recurring_reminder` repeat handling.
- Meilleure correction selon les guidelines: restaurer le draft/handoff recurrent suspendu et traiter "reprends le rappel d'avant" comme repeat_handoff quand le contexte precedent est univoque.
- Pourquoi ce n'est pas un patch local: le probleme est une transition de state entre handoffs, pas une phrase exacte.

### Scenario Defense - Tour 1

**Verdict du tour:** green

**User**
> Prepare une carte de defense pour eviter de scroller le soir quand je suis fatigue, mais ne cree rien sans me demander.

**Sophia**
> Je ne cree pas la carte depuis le chat. Voici la version a reprendre dans la section Cartes de defense.
>
> Situation / action comprise : Sommeil
> Risque identifie : Le soir quand je suis fatigue (L'envie de scroller)
> Strategie de defense recommandee : Reponse preparee avant le moment de risque
>
> Destination plateforme : dans la section Cartes de defense.
>
> Je ne cree ni ne modifie aucune carte depuis ce chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: tool_skill_intent_start
- safety: none observed
- direct_effects: []
- operation: platform_handoff
- pending_confirmation: null
- memory_plan: not relevant
- executed_tools: []
- durable_effect: committed_effects=[]

### Scenario Defense - Tour 2

**Verdict du tour:** green

**User**
> Preference coach tres claire : pour la suite, parle-moi plus doucement et pose moins de questions.

**Sophia**
> Ce que je comprends : Preference coach tres claire : pour la suite, parle-moi plus doucement et pose moins de questions.
>
> Durable ou ponctuel : preference durable correspondant a un reglage supporte.
>
> Reglage supporte recommande :
> - Ton global : Doux
> - Tendance a poser des questions : Peu de questions
>
> Destination plateforme : dans les Preferences coach.
>
> Je ne modifie pas tes preferences depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: update_coach_preferences
- route_reason: update_coach_preferences_interrupts_active_handoff
- safety: none observed
- direct_effects: []
- operation: platform_handoff
- pending_confirmation: null
- memory_plan: not relevant
- executed_tools: []
- durable_effect: committed_effects=[]

### Scenario Defense - Tour 3

**Verdict du tour:** green

**User**
> Ok, maintenant reprends la carte de defense d'avant.

**Sophia**
> Je ne cree pas la carte depuis le chat. Voici la version a reprendre dans la section Cartes de defense.
>
> Situation / action comprise : scroller le soir
> Risque identifie : Le soir quand je suis fatigue (L'envie de scroller)
> Strategie de defense recommandee : Reponse preparee avant le moment de risque
>
> Destination plateforme : dans la section Cartes de defense.
>
> Je ne cree ni ne modifie aucune carte depuis ce chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: prepare_defense_card_interrupts_active_handoff
- safety: none observed
- direct_effects: []
- operation: platform_handoff
- pending_confirmation: null
- memory_plan: not relevant
- executed_tools: []
- durable_effect: committed_effects=[]

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les demandes de cartes et de rappel demarrent maintenant directement le bon skill.
- Les preferences coach explicites interrompent proprement les handoffs actifs.
- Les reponses de preference sont claires: durable/ponctuel, reglages supportes, destination plateforme, phrase no-mutation.
- La reprise de carte d'attaque et de carte de defense est fluide et restaure un contexte exploitable.

**Problemes**
- Scenario Recurring T3: Sophia revient au bon skill mais pose une question de clarification inutile au lieu de redonner le rappel "lundi 09:00 / Preparer ma semaine". Famille: BF-STATE-01. Impact: friction faible a moyenne; le user doit repondre alors que son intention est claire. Severite: yellow.

**Fix propose**
- Source amont: suspension/restauration du handoff recurrent + intent repeat dans `create_recurring_reminder`.
- Correction recommandee: quand un handoff recurrent suspendu est restaure et que le user dit "reprends le rappel d'avant / celui du lundi matin", rendre directement le handoff existant en `repeat_handoff`.
- Tests d'invariant attendus: recurring handoff -> preference handoff -> "reprends le rappel d'avant"; paraphrases "redis-moi le rappel du lundi"; anti-FP "modifie le rappel du lundi".

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Corrige: demande carte d'attaque explicite route `prepare_attack_card` avec `central_arbitrator_explicit_attack_card_creation`.
- Corrige: demande rappel recurrent explicite route `create_recurring_reminder` avec `central_arbitrator_recurring_reminder_intent_priority`.
- Corrige: preference coach explicite interrompt `prepare_attack_card`, `create_recurring_reminder` et `prepare_defense_card` via `update_coach_preferences_interrupts_active_handoff`.
- Corrige: reprise de carte d'attaque et carte de defense route vers le bon skill avec `*_interrupts_active_handoff`.
- Reste warning: reprise du rappel recurrent route vers le bon skill mais ne rend pas directement le handoff connu.

**Skills / Operations / Tools**
- Tous les tours observes sont en `tool_skill`.
- Les operations restent en handoff plateforme, pas en execution chat.
- `executed_tools=[]` sur tous les tours.
- `pending_confirmation=null` sur tous les tours.

**Memory / Effets durables**
- `committed_effects=[]` sur tous les tours.
- Cleanup cible OK: `chat_messages` 204, `user_profile_facts` 204, `auth_user` 200 pour chaque scenario.
- Aucune preference coach ni carte/rappel n'a ete cree depuis le chat.

**Problemes**
- Scenario Recurring T3: transition state/repeat incomplete. Famille: BF-STATE-01. Impact systeme: le bon owner est selectionne mais le reducer/renderer de reprise ne materialise pas le draft precedent. Severite: yellow.

**Fix propose**
- Source amont: active handoff state + create_recurring_reminder repeat handling.
- Correction recommandee: stocker/restaurer le handoff recurrent suspendu avec son draft complet, puis privilegier `repeat_handoff` sur reprise explicite non ambigue.
- Tests d'invariant attendus: positif repeat, revise explicite, apply_attempt no-mutation, anti-FP nouveau rappel concurrent.

Verdict global: yellow.
