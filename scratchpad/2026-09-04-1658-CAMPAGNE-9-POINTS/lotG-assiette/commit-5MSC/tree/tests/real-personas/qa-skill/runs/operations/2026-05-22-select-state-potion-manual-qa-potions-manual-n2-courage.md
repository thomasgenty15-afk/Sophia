## 1. Contexte Du Test

- Date: 2026-05-22
- Run: `qa-potions-manual-n2`
- Persona: `qa-skill`, connexion temporaire `manual_state_potion_qa-potions-manual-n2_courage`
- Objectif: evaluer le flow complet de la potion `courage` apres les derniers correctifs.
- Trajectoire: conversation pilotee tour par tour apres lecture de Sophia, jusqu'a collecte, draft, validation et verification DB.
- Surfaces visees: dispatcher, routing tool skill, sous-skill potion, generation, confirmation, executor, reminders/checkins.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: valide pour diagnostic. Run local IA reel, conversation pilotee tour par tour, sans fallback. Verdict final red car l'effet durable ne correspond pas a la potion demandee.

## 2. Tours De Conversation

### Tour 1

**User**
> J'aimerais une potion de courage. Je dois envoyer un message delicat et je bloque, je fais semblant de verifier autre chose depuis vingt minutes.

**Sophia**
> Je comprends, ce message semble peser lourd. Qu'est-ce qui te fait le plus hésiter au moment de cliquer sur envoyer ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

### Tour 2

**User**
> Ce qui me bloque, c'est surtout la peur que la personne le prenne mal. Mais je veux vraiment activer une potion de courage pour ce message, pas juste en parler.

**Sophia**
> C'est noté, on va s'assurer que ce message parte avec la bonne intention. Tu prévois de l'envoyer quand exactement, pour que je puisse t'épauler au bon moment ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

### Tour 3

**User**
> Demain a 08h15, juste avant que je l'ecrive. Je veux seulement ce rappel-la, pas un suivi sur plusieurs jours.

**Sophia**
> C'est noté pour demain 08h15. Et quand tu décroches de l'écriture, ça se passe comment ? Tu as plutôt tendance à repousser le moment ou à laisser filer ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: none
- route_reason: `explicit_one_shot_reminder_supersedes_tool_flow`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

### Tour 4

**User**
> Je me suis mal exprime: je parle bien de la potion de courage. Elle doit juste me soutenir demain a 08h15 avant ce message, une seule fois.

**Sophia**
> Pas de souci, c'est noté pour demain 08h15. Et pour ce message, tu décroches comment d'habitude ? Tu as tendance à repousser ou à laisser filer ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

### Tour 5

**User**
> Je repousse surtout parce que j'ai peur du conflit. Mais la potion que je veux, c'est vraiment courage, pour oser envoyer la premiere phrase demain a 08h15.

**Sophia**
> Demain à 08:15, tu veux un appui juste avant d'envoyer cette première phrase. Le rappel sera court, doux et centré sur le geste, pas sur la pression. Je garde ça comme ça ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

### Tour 6

**User**
> Oui, garde ca comme ca et active la potion de courage.

**Sophia**
> Tu n'as pas besoin de te forcer maintenant. On garde juste le geste le plus simple en vue, sans ajouter de pression. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
- direct_effects: `[object Object]`
- operation: none
- pending_confirmation: none
- executed_tools: `select_state_potion`
- durable_effect: 1 session(s), 1 reminder(s), 1 checkin(s)

DB observe:

- user_potion_sessions: 1; potion_type observe: `rappel`; status: `completed`
- user_recurring_reminders: 1; source_kind: `potion_generated`; local_time_hhmm: `08:15`
- scheduled_checkins: 1; statuses: `pending`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Conversation conduite sans script ferme; les messages user ont ete choisis apres lecture de Sophia.
- Tour 2: Sophia demande bien le timing au lieu d'inventer un rythme par defaut.

**Problemes**
- Tour 3-4: apres "rappel-la", Sophia demande une question de type decrochage ("repousser ou laisser filer") alors que le user parle d'une potion de courage. Impact: le user doit corriger deux fois le type de potion. Severite: yellow.

**Fix propose**
- Pendant une potion courage active, traiter "rappel" comme le rappel de la potion, pas comme un changement de potion.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Handler observe: execution_breakdown -> select_state_potion -> none -> select_state_potion -> select_state_potion -> select_state_potion
- Tour 3: `explicit_one_shot_reminder_supersedes_tool_flow` a interrompu le flow potion actif alors que le user precisait seulement le timing de la potion.

**Skills / Operations / Tools**
- Executions observees: select_state_potion

**Memory / Effets durables**
- Effet durable final: 1 session(s), 1 reminder(s), 1 checkin(s).
- Effet durable incorrect: `user_potion_sessions.potion_type = rappel` alors que le user a demande et confirme une potion `courage`.

**Problemes**
- Tour 3: le routeur one-shot a pris le dessus sur un flow `select_state_potion` actif. Impact systeme: perte du contexte de potion. Severite: red.
- Tour 6: mutation de la potion selectionnee vers `rappel`. Impact systeme: mauvaise session potion durable, malgre un timing/check-in correct. Severite: red.

**Fix propose**
- Ne jamais laisser le one-shot reminder vider un flow `select_state_potion` actif.
- Verrouiller la potion deja selectionnee dans l'intake, sauf changement explicite gere par le skill.

## Verdict Global

- Verdict: red
- Raison principale: la DB finale cree une potion `rappel` alors que la demande et la confirmation portent sur `courage`.
- Follow-up prioritaire: garde-fous de routing active-flow et verrouillage de potion selectionnee, puis rerun.
- Cleanup: effectue de facon ciblee apres le run; donnees QA supprimees par user/run id.
