# QA Run Report - Emotional Repair Local Doctrine r13clean

## 1. Contexte Du Test

- Date: 2026-06-12 Europe/Paris. Timestamps DB observes en UTC 2026-06-11 soir.
- Run: `emotional-repair-local-doctrine-r13clean`
- Persona: `qa-skill`, connexion temporaire `emotional_repair_emotional_repair_local_doctrine_r13clean`
- Objectif: verifier en conditions reelles que `emotional_repair` reste vert apres les corrections d'active flow et d'exit vers product_help.
- Trajectoire: entree emotional repair -> continuation locale -> changement de sujet produit.
- Surfaces visees: `global_dispatcher`, `emotional_repair.local_dispatcher`, active flow state, `exit_to_global_dispatcher`, `note_information`, second pass global, `product_help` inline, DB durable.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. Run final propre avec 3 tours, artefacts sans doublon. Tentatives invalides precedentes `r10`, `r11`, `r12` ecartees car artefacts pollues ou erreur gateway avant Sophia; elles ne servent pas au verdict.
- Artefacts:
  - Raw: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-12-emotional-repair-local-doctrine-r13clean.raw.json`
  - Summary: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-12-emotional-repair-local-doctrine-r13clean.summary.json`
  - Durable: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-12-emotional-repair-local-doctrine-r13clean.durable.json`
- Cleanup: connexion temporaire supprimee apres verification.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> J'ai eu un echange tres froid avec ma responsable et je me sens completement a cote. Je rumine que je suis trop fragile et que je vais finir par decevoir tout le monde.

**Sophia**
> C'est tout à fait compréhensible de se sentir bousculé après un échange aussi glacial. Ce moment a été difficile et désagréable, c'est un fait concret, mais cela ne définit pas ta valeur ni ta personnalité. Ressentir le contrecoup d'une interaction tendue ne signifie pas que tu es fragile, cela montre simplement que la qualité de tes relations au travail est importante pour toi.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- note_information: `source_flow_id=global_dispatcher`, `target_dispatcher=emotional_repair`
- active_flow_debug: `user_state_loaded`, `after_onboarding_and_reconcile`, `read_active_flow_state`, `after_pending_confirmation_reload`, `before_run_conversation_routers`, `after_run_conversation_routers`
- skill_status: `continue`
- skill_response_intent: `stabilize`
- memory_plan: `memory_mode=light`, targets estime de soi + travail/conflits
- executed_tools: `[]`
- durable_effect: aucun rappel/checkin/memory item

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, c'est exactement ca. Je ne veux pas de plan ni de potion pour l'instant ; j'ai juste besoin que cette honte perde un peu son poids.

**Sophia**
> C'est une sensation étouffante quand la honte prend toute la place et te donne l'impression que tu es le problème. Mais ce que tu ressens ou ce qui s'est passé au travail ne définit pas ta valeur en tant que personne. Je reste simplement là, à tes côtés, pour porter ce poids avec toi le temps qu'il s'allège.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- local runtime: `mode=conversation_skill_local_flow`, `status=continue`
- global_dispatcher_skipped: `true`
- source_dispatcher_local: `emotional_repair.local_dispatcher`
- flow_action: `answer_repair`
- visible_task: `de_shame`
- requested_effects / committed_effects: `[]`
- memory_plan: `memory_mode=none`, `context_need=minimal`
- durable_effect: aucun effet durable

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je change de sujet maintenant : dans Sophia, ou est-ce que je retrouve les cartes d'attaque que j'ai deja creees ?

**Sophia**
> Tu peux retrouver tes cartes d'attaque directement dans l'onglet **Ressources** de ton dashboard. Elles y sont classées par niveau.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- turn_frame.note_information: `source_flow_id=emotional_repair`, `target_dispatcher=global`, `handoff_reason=topic_change`, `confidence=high`
- local_flow_exit_handoff: `source_flow_id=emotional_repair`, `consumed_by=global_dispatcher_second_pass`, `response_owner=product_help`, `selected_handler=product_help`
- product_help diagnosis: `mode=inline`, `return_to_parent_flow=true`
- product_help parent: `emotional_repair`
- product target: `resources.attack_card`
- active_flow_debug: present
- executed_tools: `[]`
- durable_effect: aucun effet durable

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- T1 repond au besoin humain sans plan ni outil, en separant l'evenement de l'identite.
- T2 respecte explicitement la contrainte utilisateur: pas de plan, pas de potion, soutien court et present.
- T3 accepte le changement de sujet sans friction visible et repond directement a la question produit.
- La sortie d'un contexte emotionnel vers product_help est naturelle cote utilisateur: Sophia ne force pas a revenir au soutien emotionnel dans le meme message.

**Problemes**
- Aucun probleme conversationnel bloquant observe dans le run final.

**Fix propose**
- Source amont: n/a
- Correction recommandee: n/a
- Tests d'invariant attendus: conserver ce scenario comme invariant de non-regression `emotional_repair active -> explicit topic change -> product_help inline`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1: le global dispatcher active `emotional_repair` via `skill_entry_signal` avec `note_information` d'entree.
- T2: le flow actif est bien repris par `emotional_repair.local_dispatcher`; le dispatcher global est skippe dans le runtime local.
- T3: le signal d'exit est capte. Le flow local produit une sortie `topic_change` vers `global`, puis le second passage global route vers `product_help`.

**Skills / Operations / Tools**
- `emotional_repair` reste conversationnel et ne lance aucun tool.
- La contrainte utilisateur `pas de plan ni de potion` est respectee: pas de bridge potion, pas d'operation.
- `product_help` repond en `mode=inline` avec `parent_skill_id=emotional_repair`, ce qui prouve que le passage n'est pas une capture standalone silencieuse.

**Memory / Effets durables**
- T1 produit un `memory_plan` light, sans ecriture durable.
- T2 et T3 utilisent `memory_mode=none`, coherent avec continuation locale puis aide produit.
- DB durable apres run: `chat_messages=6`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`.
- `user_chat_states.temp_memory` ne conserve pas d'active skill `emotional_repair` apres le passage vers product_help; seulement des etats runtime transverses restent presents.

**Problemes**
- Aucun probleme systeme observe dans le run final.

**Fix propose**
- Source amont: n/a
- Correction recommandee: n/a
- Tests d'invariant attendus:
  - active emotional repair must skip global dispatcher on continuation.
  - `exit_to_global_dispatcher` must include `note_information`.
  - second pass global must preserve `local_flow_exit_handoff`.
  - `product_help` after local exit must run inline with parent context.
  - no durable side effect for emotional support or product help destination answer.

## Verdict Global

**green**

Le run final `r13clean` confirme que le flow `emotional_repair` est toujours vert sur le scenario critique: continuation locale correcte, exit explicite vers global, puis product_help inline avec provenance `emotional_repair` conservee dans la trace.
