# QA Run Report - select_state_potion handoff rerun

## 1. Contexte Du Test

- Date: 2026-06-01
- Runs:
  - `qa-potion-handoff-rerun-r1`
  - `qa-potion-handoff-rerun-r2`
  - `qa-potion-handoff-rerun-r3`
- Persona: users Auth QA temporaires locaux, marques `is_test_persona`, supprimes apres chaque run.
- Objectif: verifier apres correction que `select_state_potion` reste un handoff plateforme non-mutant, que `repeat_handoff` repond a la destination pendant la clarification, que `apply_attempt` n'execute rien, et que `no_potion` sort proprement.
- Trajectoire: clarification potion -> repeat destination; handoff complet -> apply attempt; refus potion -> phrase courte.
- Surfaces visees: dispatcher, active handoff arbitration, `select_state_potion` handoff skill, renderer handoff, effect ledger/no mutation, DB potion/reminder/checkin.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, Auth locale verifiee, aucun renderer deterministe comme resultat QA, aucun fallback `processMessage`.
- Validite QA: valide. Les messages utilisateur ont ete choisis tour par tour apres lecture des reponses Sophia et traces courtes.

## 2. Tours De Conversation

### Run 1 - Tour 1

**Verdict du tour:** green

**User**
> Je sens que je monte en pression et je voudrais un reset court, mais sans me mettre de suivi derriere.

**Sophia**
> Je comprends, on va s'occuper de cette pression. Tu preferes une potion d'Apaisement pour redescendre tout de suite, ou une potion de Clarte si c'est surtout que tu as trop de choses en tete ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

### Run 1 - Tour 2

**Verdict du tour:** green

**User**
> Apaisement, clairement. Je veux juste redescendre maintenant, toujours sans suivi.

**Sophia**
> On va s'occuper de faire redescendre cette pression. Qu'est-ce qui te pese le plus la tout de suite ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

### Run 1 - Tour 3

**Verdict du tour:** green

**User**
> Attends, redis-moi juste ou je dois la lancer dans la plateforme.

**Sophia**
> Je n'ai pas encore une recommandation complete a repeter.
> Pour la lancer ensuite, reprends le choix dans la plateforme, dans la section Etat / Potions.
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_repeat_handoff`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Verification DB run 1**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`
- Cleanup cible: `auth.users` supprime, `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` nettoyes pour ce user. `user_memories` retourne 404 dans cet environnement local.

### Run 2 - Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `a classifier` - renderer handoff destination dupliquee.

**User**
> J'ai une reunion dans dix minutes, je tremble un peu. Je veux choisir une potion d'apaisement courte, pas de rappel et pas de suivi.

**Sophia**
> Ce que je comprends : J'ai une reunion dans dix minutes, je tremble un peu
>
> Je te conseille de choisir une potion d'apaisement court. Le shift recommande est de redescendre la pression avant de reprendre.
>
> Pourquoi cette potion : Elle est parfaitement adaptee pour calmer les manifestations physiques du stress comme les tremblements juste avant un evenement precis.
> Pas immediat : Respire. Ce tremblement, c'est juste de l'energie qui cherche a sortir face a l'enjeu. On va l'aider a se poser pour que tu puisses entrer dans cette reunion avec un peu plus d'espace interieur.
>
> A preserver : rester sur une action simple, garder le format court, garder ca ponctuel, sans suivi.
> A eviter : en faire un gros rituel, programmer un suivi si tu voulais seulement te poser maintenant.
>
> Dans la plateforme, dans la section Etat / Potions, puis ouvre la section Etat / Potions, choisis la potion recommandee, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le handoff est complet et non-mutant, mais la destination est rendue deux fois dans la meme phrase.
- Source amont probable: composition `platform_destination` + `platform_steps` dans le renderer de handoff potion.
- Owner runtime: `select_state_potion` renderer / product surface registry wording.
- Meilleure correction selon les guidelines: dedupliquer la destination et les steps au niveau renderer/registry, pas via patch de phrase utilisateur.
- Pourquoi ce n'est pas un patch local: la duplication vient de la structure destination + steps, elle peut se reproduire pour toute potion complete.

### Run 2 - Tour 2

**Verdict du tour:** green

**User**
> Ok vas-y, active-la pour moi.

**Sophia**
> Je ne l'active pas depuis le chat.
> Reprends cette recommandation dans la plateforme, dans la section Etat / Potions. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_apply_attempt`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Verification DB run 2**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`
- Cleanup cible: `auth.users` supprime, `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` nettoyes pour ce user. `user_memories` retourne 404 dans cet environnement local.

### Run 3 - Tour 1

**Verdict du tour:** green

**User**
> Finalement je ne veux pas de potion. Donne-moi seulement une phrase courte pour me poser.

**Sophia**
> Phrase de reparation : "Je reviens au prochain geste, pas a toute la montagne."
> Micro-action : ferme ce qui attire ton attention, rouvre seulement la tache utile, et fais 90 secondes dessus. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- safety: `low`
- direct_effects: `[]`
- operation: `blocked`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Verification DB run 3**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`
- Cleanup cible: `auth.users` supprime, `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` nettoyes pour ce user. `user_memories` retourne 404 dans cet environnement local.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Run 1: Sophia reste dans le flow potion actif et repond a la demande de destination au lieu de basculer vers `product_help`.
- Run 1: la clarification n'est plus remplacee par le guard generique "Je ne confirme aucun changement durable...".
- Run 2: le handoff complet contient comprehension, recommandation, raison, preserve/avoid, destination et phrase no-mutation.
- Run 2: "active-la" est recadre clairement sans execution.
- Run 3: "pas de potion" donne une reponse conversationnelle utile sans forcer un handoff.

**Problemes**
- Run 2 Tour 1: destination plateforme repetee dans une phrase. Famille: `a classifier` - renderer handoff destination dupliquee. Impact: friction visible, mais le sens et la securite restent corrects. Severite: yellow leger.

**Fix propose**
- Source amont: renderer handoff `select_state_potion` et/ou surface registry `state_potions`.
- Correction recommandee: ne pas concatener une destination qui contient deja "section Etat / Potions" avec un step qui demande d'ouvrir la meme section; rendre les steps comme actions apres arrivee dans la section.
- Tests d'invariant attendus: handoff complet ne contient pas deux occurrences proches de "section Etat / Potions"; apply_attempt et repeat_handoff conservent une destination claire; no-mutation closing line reste presente.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Les trois runs routent vers `select_state_potion` quand le sujet potion est actif.
- La demande "ou je dois la lancer" pendant handoff actif reste au skill avec `route_reason=active_handoff_repeat_handoff`, malgre un signal `product_help` detecte.
- La demande "active-la" reste au handoff avec `route_reason=active_handoff_apply_attempt`.
- Le refus "pas de potion" bloque le depart outil avec `route_reason=explicit_no_tool_request_blocks_tool_start`.

**Skills / Operations / Tools**
- `tool_execution=platform_handoff` pour les handoffs et continuations.
- `tool_execution=blocked` pour le refus explicite de potion.
- `executed_tools=[]` sur tous les tours.
- Aucun pending confirmation executable observe.

**Effets durables**
- Run 1: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.
- Run 2: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.
- Run 3: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.
- Aucun insert potion/follow-up/checkin n'a ete observe.

**Memory / Retrieval**
- Pas de besoin memoire dans ces runs.
- Cleanup cible effectue sur les users QA temporaires. La table `user_memories` repond 404 dans cet environnement local, sans impact sur le verdict potion.

**Fix propose**
- Aucun fix systeme critique requis sur routing/execution.
- Warning UX a traiter cote renderer/registry pour dedupliquer la destination.

## Verdict Global

**yellow leger.**

La correction du bug identifie est verifiee en QA reelle: `repeat_handoff` pendant clarification repond maintenant avec la destination plateforme, et `apply_attempt` n'execute jamais. Les invariants no-mutation sont verts sur les 3 runs. Reste une friction de wording sur le handoff complet: la destination plateforme est dupliquee dans Run 2 Tour 1.
