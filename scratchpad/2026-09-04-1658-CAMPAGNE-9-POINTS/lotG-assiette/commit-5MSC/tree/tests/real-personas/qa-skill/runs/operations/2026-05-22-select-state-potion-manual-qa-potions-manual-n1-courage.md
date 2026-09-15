## 1. Contexte Du Test

- Date: 2026-05-22
- Run: `qa-potions-manual-n1`
- Persona: `qa-skill`, connexion temporaire `manual_state_potion_qa-potions-manual-n1_courage`
- Objectif: evaluer le flow complet de la potion `courage` apres les derniers correctifs.
- Trajectoire: conversation pilotee tour par tour apres lecture de Sophia, jusqu'a collecte, draft, validation et verification DB.
- Surfaces visees: dispatcher, routing tool skill, sous-skill potion, generation, confirmation, executor, reminders/checkins.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: valide. Run local via `/functions/v1/test-send-message`, `force_full_ai=true`, sans renderer deterministe ni script ferme. Les messages user ont ete choisis tour par tour apres lecture de Sophia et de la trace courte.

## 2. Tours De Conversation

### Tour 1

**User**
> Je crois que j'ai besoin d'une potion de courage, mais je tourne en rond et je n'arrive pas a appuyer sur envoyer.

**Sophia**
> C'est souvent le geste le plus difficile. Qu'est-ce qui t'inquiète le plus si tu l'envoies maintenant ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

### Tour 2

**User**
> C'est un message a mon associe. J'ai peur qu'il me trouve lourd et que ca declenche un conflit; je veux juste reussir a envoyer une premiere phrase, pas refaire tout le plan.

**Sophia**
> C'est normal de craindre la réaction de l'autre quand on veut bien faire. On va rester sur cet objectif d'une seule phrase, pour ne pas transformer ce message en montagne. Je prévois un point chaque matin à 09h00 pour t'aider à traverser cette appréhension avec plus de douceur. Je te laisse me dire si on avance comme ça. 🙂

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
> Non, justement je ne veux pas un point chaque matin. C'est pour demain matin vers 08h15, juste avant d'envoyer le message. Un soutien ponctuel, pas un rappel toute la semaine.

**Sophia**
> C'est entendu, on laisse de côté le suivi sur la semaine. Je me cale sur ton timing pour demain à 08h15 : je t'enverrai un message juste avant que tu ne lances cette première phrase à ton associé, pour que tu ne sois pas seul face à cette appréhension. Je te laisse me dire si c'est ce que tu attends. 🙂

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

### Tour 4

**User**
> Oui, c'est ca. Active cette potion de courage pour demain a 08h15.

**Sophia**
> Respire un grand coup. On ne cherche pas à résoudre tout le conflit aujourd'hui, juste à laisser sortir cette première phrase vers ton associé. Tu as le droit de nommer les choses simplement, sans être "lourd". 🙂

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

- user_potion_sessions: 1; potion_type observe: `courage`; status: `completed`
- user_recurring_reminders: 1; source_kind: `potion_generated`; local_time_hhmm: `08:15`
- scheduled_checkins: 1; statuses: `pending`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Conversation conduite sans script ferme; les messages user ont ete choisis apres lecture de Sophia.
- Tour 1: entree naturelle dans le sous-skill courage, une seule question courte et pertinente sur le frein principal.
- Tour 3: Sophia accepte la correction utilisateur sans s'enteter et se recale sur le besoin ponctuel.

**Problemes**
- Tour 2: Sophia propose trop vite "un point chaque matin a 09h00" alors que le user n'a pas encore donne de date, d'heure, ni dit vouloir un suivi recurrent. Impact: impression de template et risque de faire deriver une potion d'action ponctuelle vers un rappel generique. Severite: yellow.
- Tour 2: la formulation "Je prevois..." sonne comme une decision produit avant validation claire. Impact: le user doit corriger le cadre au lieu de simplement completer l'info manquante. Severite: yellow.

**Fix propose**
- Pour les potions action-specifiques, si le user n'a pas donne de timing explicite, le sous-skill doit poser une question ouverte courte sur le moment utile au lieu d'inventer une frequence par defaut.
- Remplacer les tournures de pre-validation du type "je prevois..." par une proposition conditionnelle ou une collecte de slot, selon l'etat du draft.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Handler observe: select_state_potion -> select_state_potion -> select_state_potion -> select_state_potion.
- Le flow actif est conserve par le tool skill apres le tour 1 (`active_select_state_potion_kept_in_tool_skill`), sans reprise par le dispatcher ni par le reminder router.

**Skills / Operations / Tools**
- Executions observees: select_state_potion

**Memory / Effets durables**
- Effet durable final: 1 session(s), 1 reminder(s), 1 checkin(s).
- Effet durable final aligne apres correction user: potion `courage`, mode `single_before_event`, date locale `2026-05-23`, heure `08:15`, 1 seul check-in pending.

**Problemes**
- Tour 2: le generator/slot flow a produit un draft de suivi recurrent par defaut avant collecte du timing. Aucun side effect n'a ete execute a ce stade, donc l'erreur a ete rattrapable, mais la logique de collecte reste trop permissive. Severite: yellow.

**Fix propose**
- Ajouter un garde-fou de generation/validation: pour `courage` et `clarte` lies a une action, interdire les schedules par defaut tant que le user n'a pas donne ou confirme explicitement ponctuel vs recurrent et le timing associe.
- Garder le comportement observe au tour 4: execution uniquement apres confirmation, creation d'une seule occurrence quand le user precise un soutien ponctuel.

## Verdict Global

- Verdict: yellow
- Raison principale: le routage et la DB finale sont corrects, mais Sophia invente au tour 2 un rythme recurrent non fourni par le user.
- Follow-up prioritaire: renforcer la collecte temporelle avant draft pour les potions action-specifiques.
- Cleanup: effectue de facon ciblee apres le run; donnees QA supprimees par user/run id.
