# Update Coach Preferences Postfix Smoke

## 1. Contexte Du Test

- Date: 2026-06-01
- Run: `qa-coach-pref-retry-1780347022435` puis `qa-coach-pref-real-1780347070024`
- Persona: users QA temporaires locaux marques `is_test_persona=true`, supprimes apres run
- Objectif: verifier les corrections post-bugs sur `update_coach_preferences` et `product_help`
- Trajectoire: product_help reglages coach, handoff preference durable, question d'explication en handoff actif, apply_attempt, repeat_handoff destination
- Surfaces visees: dispatcher, product_help, update_coach_preferences, handoff_flow_arbitration, operation runtime, DB invariants
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct
- Validite QA: valide. Un premier smoke complet a rencontre un 502 gateway local transitoire avant toute conversation exploitable; relance reussie ensuite via endpoint reel.

## 2. Tours De Conversation

### Tour 1 - Product Help Reglages Coach

**Verdict du tour:** green

**User**
> Dans les Preferences coach, ca fait quoi exactement ton global, challenge et tendance a poser des questions ?

**Sophia**
> Preferences coach: Les preferences coach reglent ma maniere d'accompagner. Ton global ajuste la couleur relationnelle de mes reponses, par exemple plus douce, bienveillante-ferme ou tres directe. Niveau de challenge ajuste l'exigence et la confrontation constructive: plus leger, equilibre ou plus eleve. Tendance a poser des questions ajuste la frequence des questions et demandes de precision: peu de questions, equilibre ou tres questionnant. Elles ne reglent pas les formats fins comme exactement trois lignes, zero emoji ou jamais de question finale.
>
> Comment l'utiliser: Ouvre Preferences depuis le dashboard, va dans Preferences coach, modifie les options visibles puis sauvegarde depuis la plateforme.
>
> Ce que ca apporte:
> - Rend l'accompagnement plus adapte au user.
> - Clarifie si je dois etre plus douce, plus directe, plus challengeante ou plus sobre en questions.

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: product_help entry signal
- safety: low
- direct_effects: []
- operation: none
- pending_confirmation: null
- executed_tools: []
- durable_effect: none

### Tour 2 - Handoff Durable Composite

**Verdict du tour:** green

**User**
> Pour la suite, sois plus direct et pose moins de questions.

**Sophia**
> Ce que je comprends : Pour la suite, sois plus direct et pose moins de questions.
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
- route_reason: central_arbitrator_coach_preference_priority
- operation: update_coach_preferences / handoff_delivered
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: update_coach_preferences, no_chat_mutation=true
- durable_effect: none

### Tour 3 - Explication Dans Handoff Actif

**Verdict du tour:** green

**User**
> Ca change quoi exactement challenge equilibre par rapport au ton direct ?

**Sophia**
> Les Preferences coach reglent seulement trois dimensions visibles.
> - Ton global : change la couleur relationnelle de mes reponses, par exemple plus doux, bienveillant-ferme ou tres direct.
> - Niveau de challenge : change le niveau d'exigence et de confrontation constructive, de plus leger a plus eleve.
> - Tendance a poser des questions : change la frequence des questions et demandes de precision, de peu de questions a tres questionnant.
> Ca ne regle pas les formats fins comme exactement trois lignes, zero emoji ou jamais de question finale.
>
> Dans ta recommandation actuelle : Ton global -> Tres direct; Tendance a poser des questions -> Peu de questions.
> Tu peux reprendre ce reglage dans les Preferences coach.
> Je ne modifie pas tes preferences depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: update_coach_preferences
- route_reason: skill_entry_signal
- operation: update_coach_preferences / explained
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: update_coach_preferences, no_chat_mutation=true
- durable_effect: none

### Tour 4 - Apply Attempt Non Mutant

**Verdict du tour:** green

**User**
> Ok applique.

**Sophia**
> Je ne modifie pas tes preferences depuis le chat. Reglages a reprendre : Ton global sur Tres direct; Tendance a poser des questions sur Peu de questions. Tu peux reprendre ces reglages dans les Preferences coach.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: update_coach_preferences
- route_reason: confirmation_yes_is_handoff_apply_attempt
- operation: update_coach_preferences / apply_attempt
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: update_coach_preferences, no_chat_mutation=true
- durable_effect: none

### Tour 5 - Repeat Destination

**Verdict du tour:** green

**User**
> Pour la suite, challenge-moi plus mais pose moins de questions.

**Sophia**
> Ce que je comprends : Pour la suite, challenge-moi plus mais pose moins de questions.
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
- route_reason: central_arbitrator_coach_preference_priority
- operation: update_coach_preferences / handoff_delivered
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: update_coach_preferences, no_chat_mutation=true
- durable_effect: none

### Tour 6 - Ou Faire Ca

**Verdict du tour:** green

**User**
> Ou est-ce que je fais ca ?

**Sophia**
> Ce que je comprends : Pour la suite, challenge-moi plus mais pose moins de questions.
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
- route_reason: active_handoff_repeat_handoff
- operation: update_coach_preferences / repeat_handoff
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- platform_handoff: update_coach_preferences, no_chat_mutation=true
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia distingue correctement explication produit, preference durable supportee, question d'explication pendant le handoff, tentative d'application et demande de destination.
- La reponse `apply_attempt` est claire: elle ne pretend pas appliquer depuis le chat et redonne les reglages a reprendre.
- La question "Ou est-ce que je fais ca ?" reste naturellement dans le flow actif.

**Problemes**
- Aucun probleme bloquant observe sur les runs valides.
- Incident technique hors conversation: un premier smoke complet a recu un 502 gateway local transitoire; retry minimal puis runs reels OK.

**Fix propose**
- Source amont: deja corrige dans router skill, handoff arbitration, product_help knowledge et turn intent arbitrator.
- Correction recommandee: conserver les invariants ajoutes.
- Tests d'invariant attendus: garder les tests unitaires sur `explained`, `repeat_handoff`, `apply_attempt`, product_help des trois reglages et absence de mutation.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Question produit sur les reglages: `product_help`.
- Preference durable: `tool_skill/update_coach_preferences`.
- Explication en handoff actif: `update_coach_preferences`, status `explained`.
- "Ok applique": `apply_attempt`, non mutant.
- "Ou est-ce que je fais ca ?": `repeat_handoff`, non product_help/status recap.

**Skills / Operations / Tools**
- `update_coach_preferences` reste en `platform_handoff`.
- `executed_tools=[]` sur tous les tours operationnels.
- `pending_confirmation=null`.
- `committed_effects=[]`.
- `platform_handoff.operation_type=update_coach_preferences`, `no_chat_mutation=true`.

**DB / Effets Durables**
- Run `explain`: `user_profile_facts` 9 -> 9, `scheduled_checkins` 0 -> 0.
- Run `destination`: `user_profile_facts` 9 -> 9, `scheduled_checkins` 0 -> 0.
- Aucun write observe sur les preferences depuis le chat.

Verdict global: green.
