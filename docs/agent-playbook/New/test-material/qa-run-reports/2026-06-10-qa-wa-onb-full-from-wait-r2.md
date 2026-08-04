# QA Run Report - WhatsApp Onboarding From Plan Wait R2

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `qa-wa-onb-live-1781097449596`
- Persona: user QA temporaire `7ece9cd6-7c80-4fd0-acd1-3099160d6aa8`, email `qa-wa-onb-live-1781097449596@example.com`
- Objectif: verifier le flow complet WhatsApp onboarding depuis un etat initial ou le plan n'est pas encore valide, puis reprise automatique quand le plan devient actif, jusqu'a la fin de l'onboarding.
- Trajectoire: `awaiting_plan_finalization` sans plan actif -> plan actif injecte apres le tour 1 -> preferences coach -> feedback plan -> choix sujet -> sortie onboarding.
- Surfaces visees: `whatsapp-webhook`, local onboarding dispatcher/reducer, visible stages WhatsApp, persistence `profiles.whatsapp_state`, `user_profile_facts`, guard `allow_track_progress_plan_item`.
- Cadre IA reel: Supabase local, webhook WhatsApp local via transport loopback. Pas de renderer QA, pas de fallback `processMessage`, pas de staging. Messages choisis tour par tour apres lecture de la reponse precedente.
- Validite QA: valide. Le status outbound `skipped` est attendu en transport loopback: le message est produit par le runtime mais non envoye au fournisseur WhatsApp externe.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Ok je suis la, on peut reprendre ?

**Sophia**
> Super, je suis là aussi ! Je finalise encore les derniers détails de ton parcours pour que tout soit bien synchronisé. On se reparle dans quelques instants, dès que c'est prêt ?

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp_onboarding`
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_not_ready`
- safety: none
- direct_effects: none
- operation: `plan_wait`
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: none
- durable_effect: `profiles.whatsapp_state` reste `awaiting_plan_finalization`; `user_plan_item_entries=[]`; `allow_track_progress_plan_item=false`

### Tour 2

Plan QA actif injecte entre les tours 1 et 2: `planId=871f2a9d-d90a-4ccf-b9b7-187150911a5b`.

**Verdict du tour:** green

**User**
> Ok j'ai l'impression que le plan est pret maintenant, on continue.

**Sophia**
> C'est tout bon, ton plan est prêt ! 🙌
>
> Avant qu'on se lance, j'aimerais savoir comment tu préfères que je te parle : tu es plutôt team Sophia douce, directe, ou un mix des deux ?

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp_onboarding`
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_ready_resume_preferences`
- safety: none
- direct_effects: state update only
- operation: `plan_ready_resume_preferences`
- pending_confirmation: none
- memory_plan: active
- executed_tools: none
- durable_effect: `profiles.whatsapp_state=onboarding_pref_tone`; `user_plan_item_entries=[]`; `allow_track_progress_plan_item=false`

### Tour 3

**Verdict du tour:** green

**User**
> Un mix, mais garde un ton assez direct quand je tourne autour du pot.

**Sophia**
> C'est bien noté pour le mix ! Je saurai être directe si je sens que tu tournes un peu autour du pot. 😉
>
> D'ailleurs, quand tu décroches, comment tu préfères que je te challenge : léger, équilibré, ou plus direct ?

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp_onboarding`
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- safety: none
- direct_effects: preference write
- operation: `preference_saved_next_challenge`
- pending_confirmation: none
- memory_plan: active
- executed_tools: none
- durable_effect: `coach.tone=warm_direct` avec notes utilisateur; `profiles.whatsapp_state=onboarding_pref_challenge`; `user_plan_item_entries=[]`

### Tour 4

**Verdict du tour:** green

**User**
> Equilibre au debut, mais si j'esquive tu peux etre plus cash.

**Sophia**
> C'est bien noté pour le dosage : équilibré, mais je serai plus directe si je sens que tu esquives. 😉
>
> D'ailleurs, tu préfères que je pose peu de questions, que je creuse un peu, ou que je te questionne franchement quand ça peut aider ?

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp_onboarding`
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- safety: none
- direct_effects: preference write
- operation: `preference_saved_next_questions`
- pending_confirmation: none
- memory_plan: active
- executed_tools: none
- durable_effect: `coach.challenge_level=balanced` avec notes conditionnelles; `profiles.whatsapp_state=onboarding_pref_questions`; `user_plan_item_entries=[]`

### Tour 5

**Verdict du tour:** green

**User**
> Pose plutot peu de questions, sauf si c'est vraiment necessaire pour debloquer l'action.

**Sophia**
> C'est noté pour les questions. Voici ton plan "Routine contacts pro" pour relancer ton réseau. Est-ce que le résultat te convient ?

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp_onboarding`
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- safety: none
- direct_effects: preference write
- operation: `ask_plan_feedback`
- pending_confirmation: none
- memory_plan: active
- executed_tools: none
- durable_effect: `coach.question_tendency=low` avec notes utilisateur; `profiles.whatsapp_state=onboarding_plan_creation_feedback`; `user_plan_item_entries=[]`

### Tour 6

**Verdict du tour:** green

**User**
> Oui, ca me convient, c'est assez simple pour commencer.

**Sophia**
> Top, on reste sur cette base alors. Tu veux qu'on commence par ton plan ou il y a un autre sujet plus important pour toi en ce moment ?

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp_onboarding`
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_feedback_received`
- safety: none
- direct_effects: state update only
- operation: `ask_topic_choice`
- pending_confirmation: none
- memory_plan: active
- executed_tools: none
- durable_effect: `profiles.whatsapp_state=onboarding_topic_choice`; `user_plan_item_entries=[]`; `allow_track_progress_plan_item=false`

### Tour 7

**Verdict du tour:** green

**User**
> On commence par le plan, ca me va.

**Sophia**
> Super, on y va ! 🚀
>
> Ton programme est prêt : l'objectif est de reprendre tes contacts pro avec des actions très courtes pour ne pas te surcharger. On va commencer par lister 5 contacts prioritaires et envoyer un premier message simple.
>
> Est-ce que tu as déjà en tête les 5 personnes que tu aimerais recontacter en priorité ?

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp_onboarding`
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_complete_to_plan`
- safety: none
- direct_effects: state update only
- operation: `complete_to_plan`
- pending_confirmation: none
- memory_plan: active
- executed_tools: none
- durable_effect: `profiles.whatsapp_state=null`; `user_plan_item_entries=[]`; `allow_track_progress_plan_item=false`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia attend correctement quand le plan n'est pas disponible, sans inventer la suite.
- Des que le plan est actif, Sophia reprend naturellement l'onboarding par les preferences, au lieu de traiter le message comme une progression d'item.
- Les questions de preference sont courtes, se suivent logiquement, et la transition vers le plan est claire.
- La fin d'onboarding est fluide: Sophia propose de commencer le plan et reprend l'action utile suivante.

**Problemes**
- Aucun probleme bloquant observe. Les emojis apparaissent dans quelques reponses; c'est acceptable ici mais a surveiller si le ton WhatsApp souhaite rester plus sobre.

**Fix propose**
- Aucun fix requis pour ce scenario.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours sont restes sous `selected_handler=whatsapp_onboarding`.
- Aucun signal n'a declenche `track_progress_plan_item`.
- Le tour 2 valide le bug cible: quand le plan devient actif apres une attente, le flow reprend bien en `plan_ready_resume_preferences`.

**Skills / Operations / Tools**
- Aucun tool externe ou operation engageante n'a ete execute.
- `allow_track_progress_plan_item=false` sur tous les tours.
- `executed_tools=[]` observe indirectement via absence d'effet outil et metadata outbound.

**Effets durables**
- `profiles.whatsapp_state`: `awaiting_plan_finalization` -> `onboarding_pref_tone` -> `onboarding_pref_challenge` -> `onboarding_pref_questions` -> `onboarding_plan_creation_feedback` -> `onboarding_topic_choice` -> `null`.
- Preferences explicites persistees dans `user_profile_facts`: `coach.tone`, `coach.challenge_level`, `coach.question_tendency`.
- `user_plan_item_entries=[]` sur tout le run: aucune progression d'item creee par erreur.
- Cleanup cible du user QA termine avec `[]`.

**Limites de trace**
- `conversation_turn_traces` est vide pour ce chemin WhatsApp local; le rapport s'appuie donc sur les metadata runtime des `whatsapp_outbound_messages`, qui contiennent `selected_handler`, `flow_action`, `visible_task`, `next_whatsapp_state`, `reason_code` et `allow_track_progress_plan_item`.

## Verdict Global

Green. Le flow WhatsApp onboarding fonctionne depuis l'etat "plan pas encore valide" jusqu'a la fin de l'onboarding apres validation du plan. Le bug cible n'est pas reproduit: la reprise se fait bien dans le flow de preferences et aucune progression de plan n'est declenchee.
