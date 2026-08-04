# QA Run - Potion Amour Global R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `state-potion-amour-global-20260608-r1`
- Persona: user QA temporaire `qa-amour-direct-1780922903098@example.com`, supprime apres cleanup cible
- Objectif: verifier le parcours complet via dispatcher global, `select_state_potion`, clarification de potion, puis sous-skill Amour
- Trajectoire: demande de potion non nommee, clarification douceur/guerison, selection Amour, collecte detaillee, handoff, repeat, apply_attempt
- Surfaces visees: dispatcher global, `select_state_potion`, `select_state_potion.amour`, reducer local, visible agent, no-mutation
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe, aucun changement applicatif pendant le run
- Validite QA: valide

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'aimerais bien avoir une potion, mais je ne sais pas laquelle. En ce moment je suis surtout très dur avec moi après un échec.

**Sophia**
> C'est souvent dans ces moments-là qu'on est le plus dur avec soi-même. Pour t'aider à traverser cela, est-ce que tu aurais plutôt besoin de retrouver un peu de douceur et de bienveillance envers toi, ou est-ce que tu cherches surtout un soutien pour cicatriser après cet échec et réussir à avancer ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved_tool_skill`
- operation: `status=clarifying`, `reason_code=state_potion_handoff_clarifying`
- executed_tools: []
- committed_effects: []

### Tour 2

**Verdict du tour:** green

**User**
> Plutôt retrouver de la douceur et de la bienveillance envers moi.

**Sophia**
> C'est entendu, la Potion d'amour est justement là pour t'apporter cette douceur dont tu as besoin en ce moment. Pour mieux comprendre ce qui se joue, est-ce que cet échec qui te pèse est plutôt lié à ta vie pro, à une relation, ou à un défi personnel que tu t'étais lancé ? ❤️

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_select_state_potion_local_dispatcher`
- operation: `status=clarifying`, `reason_code=amour_field_missing`
- executed_tools: []
- committed_effects: []

### Tour 3

**Verdict du tour:** green

**User**
> C'est un défi perso : j'avais promis de finir un texte vendredi et j'ai tout lâché, depuis je me dis que je ne tiens jamais mes engagements.

**Sophia**
> C'est pesant de porter ce sentiment de ne pas avoir honoré un engagement envers soi-même, et c'est précisément pour t'aider à transformer cette sévérité en douceur que la Potion d'amour est tout indiquée. Elle est prête pour toi dans l'application, au chemin État / Potions. Voici les éléments que tu pourras y indiquer :
>
> Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?
> Défi perso : j'avais promis de finir un texte vendredi et j'ai tout lâché, avec le sentiment de ne jamais tenir mes engagements.
>
> Tu te sens surtout comment ?
> Dur avec moi 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=handoff_delivered`, `reason_code=amour_handoff_delivered`, `platform_handoff.draft != null`
- executed_tools: []
- committed_effects: []

### Tour 4

**Verdict du tour:** green

**User**
> Redis-moi juste quoi mettre dans la plateforme.

**Sophia**
> Pas de problème ! Pour configurer ta Potion d'amour dans la section État / Potions, voici les informations à saisir :
>
> Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?
> Défi perso : j'avais promis de finir un texte vendredi et j'ai tout lâché, avec le sentiment de ne jamais tenir mes engagements.
>
> Tu te sens surtout comment ?
> Dur avec moi 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=repeat_handoff`, `reason_code=amour_repeat_handoff`
- executed_tools: []
- committed_effects: []

### Tour 5

**Verdict du tour:** green

**User**
> Ok active-la.

**Sophia**
> Je ne peux malheureusement pas activer la potion directement depuis notre échange, c'est à toi de faire le dernier petit pas. 🌸
>
> Tu trouveras tout ce qu'il faut dans la section État / Potions en choisissant la Potion d'amour. Voici les précisions à y noter :
>
> Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?
> Défi perso : j'avais promis de finir un texte vendredi et j'ai tout lâché, avec le sentiment de ne jamais tenir mes engagements.
>
> Tu te sens surtout comment ?
> Dur avec moi

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=apply_attempt`, `reason_code=amour_apply_attempt_no_chat_execution`
- executed_tools: []
- committed_effects: []

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le dispatcher global capte la demande large de potion.
- `select_state_potion` clarifie proprement entre douceur/Amour et guérison.
- Le choix utilisateur fait entrer dans `select_state_potion.amour`.
- Le sous-skill creuse le contexte au lieu de finaliser trop vite.
- Le handoff donne les champs plateforme exploitables.
- `redis-moi` est une repetition courte.
- `ok active-la` refuse l'exécution chat.

**Problemes**
- Aucun probleme bloquant observe.

**Fix propose**
- Aucun fix requis pour ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1: `selected_handler=select_state_potion`.
- T2-T5: `selected_handler=select_state_potion.amour`.

**Skills / Operations / Tools**
- T1-T2: clarification/collecte.
- T3: `handoff_delivered` avec draft.
- T4: `repeat_handoff`.
- T5: `apply_attempt`.
- Tous les tours: `executed_tools=[]`, `committed_effects=[]`.

**Effets durables**
- `user_potion_sessions=[]`.
- `user_recurring_reminders=[]`.
- `scheduled_checkins=[]`.
- Cleanup cible effectue: messages, state, tables d'effets et user Auth temporaire supprimes.

## Verdict Global

Verdict global: green. Le flow complet via dispatcher global puis `select_state_potion` puis sous-skill Amour est conforme.
