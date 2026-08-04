# QA Run Report - WhatsApp Onboarding Local Flow R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `20260608_wa_onboarding_local_flow_r1`
- Persona: connexion temporaire locale `qa-wa-onboarding-local-flow-20260608_wa_onboarding_local_flow_r1@example.com`, user id `40121e1b-3c6c-4430-bd04-4043803f8e63`
- Objectif: verifier qu'un user deja `onboarding_completed=true`, avec un plan devenu actif apres discussion, reprend bien le flow WhatsApp d'onboarding/preferences au lieu de tomber dans `track_progress_plan_item`.
- Trajectoire: `awaiting_plan_finalization` + plan actif -> preferences coach -> feedback plan -> choix du sujet -> fin onboarding vers plan.
- Surfaces visees: `whatsapp-webhook`, handler onboarding, local flow onboarding, preference facts, state WhatsApp, prevention `track_progress_plan_item`.
- Cadre IA reel: Supabase local, entree reelle `/functions/v1/whatsapp-webhook`, transport loopback pour eviter l'envoi fournisseur externe. Pas de renderer ou fallback direct appele par le runner. Le endpoint `/test-send-message` n'a pas ete utilise car le bug vise le webhook WhatsApp et ses etats.
- Validite QA: valide. Le premier essai avant conversation a echoue dans le runner de QA sur une colonne inexistante (`user_plan_item_entries.status`) avant tout appel webhook; il a ete corrige et n'est pas compte comme tour Sophia.
- Cleanup: artefacts du run supprimes de facon ciblee. Verification finale: `profiles=0`, `chat_messages=0`, `user_chat_states=0`, `user_profile_facts=0`, `user_cycles=0`, `user_transformations=0`, `user_plans_v2=0`, `user_plan_items=0`, `user_plan_item_entries=0`, `whatsapp_outbound_messages=0`, `whatsapp_inbound_dedup=0`, Auth user `404`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> C'est bon, le plan est pret.

**Sophia**
> Genial, ton plan pour structurer tes premiers contacts est pret ! 🚀
>
> Derniere petite chose : pour nos echanges, tu preferes que je sois plutot douce, directe, ou un mix des deux ?

**Trace courte**
- http_status: 200
- response_owner: assistant WhatsApp
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_ready_resume_preferences`
- safety: none observed
- direct_effects: `profiles.whatsapp_state=onboarding_pref_tone`
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: `user_plan_item_entries=0`, `allow_track_progress_plan_item=false`

### Tour 2

**Verdict du tour:** green

**User**
> Un mix, mais plutot franc et concret.

**Sophia**
> C'est bien note pour le ton franc et concret, je m'adapte !
>
> Une derniere chose : quand tu decroches un peu, tu preferes que je te challenge comment ? Plutot leger, equilibre ou de maniere plus directe ?

**Trace courte**
- http_status: 200
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- direct_effects: `coach.tone=warm_direct`
- next_state: `onboarding_pref_challenge`
- durable_effect: `user_plan_item_entries=0`, `allow_track_progress_plan_item=false`

### Tour 3

**Verdict du tour:** green

**User**
> Equilibre, mais tu peux me recadrer clairement si je tourne autour du pot.

**Sophia**
> C'est bien note pour le challenge equilibre, je n'hesiterai pas a te recadrer si necessaire. 😉
>
> Derniere petite chose : tu preferes que je pose peu de questions, que je creuse un peu, ou que je te questionne franchement quand ca peut aider ?

**Trace courte**
- http_status: 200
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- direct_effects: `coach.challenge_level=balanced`
- next_state: `onboarding_pref_questions`
- durable_effect: `user_plan_item_entries=0`, `allow_track_progress_plan_item=false`

### Tour 4

**Verdict du tour:** green

**User**
> Creuse un peu, mais sans me noyer de questions.

**Sophia**
> C'est entendu, je trouverai le bon equilibre ! Ton plan pour structurer tes premiers contacts est pret. Comment s'est passee la creation pour toi et est-ce que le resultat te convient ?

**Trace courte**
- http_status: 200
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- direct_effects: `coach.question_tendency=normal`
- next_state: `onboarding_plan_creation_feedback`
- durable_effect: `user_plan_item_entries=0`, `allow_track_progress_plan_item=false`

### Tour 5

**Verdict du tour:** green

**User**
> Oui, le plan me convient. La creation etait un peu longue mais le resultat est clair.

**Sophia**
> Top, ravi que ca te plaise ! Est-ce qu'on commence par ton plan pour structurer tes contacts pro, ou tu as un autre sujet plus important en tete pour l'instant ?

**Trace courte**
- http_status: 200
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_feedback_received`
- direct_effects: `profiles.whatsapp_state=onboarding_topic_choice`
- operation: none
- durable_effect: `user_plan_item_entries=0`, `allow_track_progress_plan_item=false`

### Tour 6

**Verdict du tour:** green

**User**
> On commence par le plan, je veux avancer sur les contacts pro.

**Sophia**
> C'est parti ! Ton plan est pret : l'objectif est de structurer tes premiers contacts professionnels.
>
> Pour commencer, on va lister 5 contacts cles. Est-ce que tu as deja quelques noms en tete pour cette liste ?

**Trace courte**
- http_status: 200
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_complete_to_plan`
- direct_effects: `profiles.whatsapp_state=null`, `__whatsapp_onboarding_done.completed_at` ecrit
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: `user_plan_item_entries=0`, `allow_track_progress_plan_item=false`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La reprise apres "plan pret" est naturelle: Sophia ne traite pas la phrase comme un accomplissement d'action.
- Les questions de preferences sont comprehensibles, progressives, et gardent le contexte du plan.
- La sortie vers le plan au tour 6 est claire: Sophia propose de commencer par la premiere action sans declarer une progression deja faite.

**Problemes**
- Aucun probleme bloquant observe. Les formulations restent un peu "derniere petite chose" sur plusieurs tours, mais l'experience reste acceptable et non confuse.

**Fix propose**
- Aucun fix requis pour ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours restent sous `selected_handler=whatsapp_onboarding`.
- Le tour initial depuis `awaiting_plan_finalization` + plan actif passe vers `onboarding_pref_tone`, ce qui corrige la regression visee.
- Aucun tour n'a ete capture par `track_progress_plan_item`.

**Skills / Operations / Tools**
- Aucune operation engageante ni pending confirmation creee.
- Les preferences explicites sont bien ecrites dans `user_profile_facts`:
  - `coach.tone=warm_direct`
  - `coach.challenge_level=balanced`
  - `coach.question_tendency=normal`
- Les facts explicites portent `source_type=explicit_user` et une raison `whatsapp_onboarding_local_flow:*`.

**Effets Durables**
- `user_plan_item_entries=[]` pendant tout le run.
- `profiles.whatsapp_state` suit la sequence attendue puis revient a `null`.
- `user_chat_states.temp_memory.__whatsapp_onboarding_done.completed_at` est ecrit au dernier tour.
- `whatsapp_outbound_messages=6`, un outbound par tour, avec `wa_outbound_message_id=wamid_DISABLED` en loopback.

**Trace / Testabilite**
- La table `conversation_turn_traces` reste vide pour ce chemin webhook local; la trace courte exploitable vient des metadata de messages assistant et des projections DB. Ce n'est pas bloquant pour le verdict du bug teste, mais si on veut auditer finement les decisions IA du dispatcher local, il faudrait ajouter une trace DB explicite du local dispatcher dans le webhook.

**Verification Tests**
- `deno test --no-check supabase/functions/whatsapp-webhook/onboarding/local_flow_test.ts supabase/functions/whatsapp-webhook/wa_text_test.ts supabase/functions/whatsapp-webhook/handlers_onboarding_state_test.ts`
- Resultat: 11 passed, 0 failed.

## Verdict Global

**green** — Le run valide la correction principale: quand le plan est actif apres attente de finalisation, le user rentre dans le flow WhatsApp d'onboarding/preferences et aucun `track_progress_plan_item` n'est declenche.
