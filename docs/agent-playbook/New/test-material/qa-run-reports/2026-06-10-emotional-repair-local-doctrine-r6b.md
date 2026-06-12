# QA Run - emotional-repair-local-doctrine-r6b

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `emotional-repair-local-doctrine-r6b`
- Persona: connexion temporaire locale `qa-qa-skill-emotional-repair-emotional-repair-local-doctrine-r6b@example.com`, `is_test_persona=true`.
- Objectif: reverifier en conditions reelles le fix de persistance du flow actif `emotional_repair` apres un tour local `status=continue`, puis tester un changement clair vers une demande produit.
- Trajectoire: entree emotionnelle -> demande de phrase courte sans plan/question -> verification DB du flow actif -> changement clair vers une question produit sur les cartes d'attaque.
- Surfaces visees: `emotional_repair`, active flow state, dispatcher local actif, skip du global dispatcher, `exit_to_global_dispatcher`, `note_information`, `product_help`, state DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback `processMessage`, aucun runner staging/remote.
- Validite QA: valide. La connexion temporaire a ete creee, les trois tours ont retourne `200`, et le nettoyage cible a ete execute via `scripts/qa-cleanup-run-connection.sh`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai perdu mes moyens en réunion tout à l'heure, et depuis je le transforme en preuve que je ne suis pas à la hauteur. Aide-moi à remettre ça à sa place, doucement.

**Sophia**
> C'est un moment vraiment éprouvant, et je sens que tu es très dur avec toi-même. Ce qui s'est passé pendant cette réunion est un événement isolé, pas une définition de qui tu es ou de ce que tu vaux. On va prendre le temps de délier tout ça, très doucement.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- active_flow_arbitration: `no_active_flow`
- note_information: `source_flow_id=global_dispatcher`, `target_dispatcher=emotional_repair`, `handoff_reason=explicit_user_request_for_emotional_support`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui. Donne-moi juste une phrase courte à garder en tête, sans exercice, sans plan, et sans question.

**Sophia**
> Ce moment en réunion est un incident de parcours, pas le reflet de qui tu es.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- operation_flow_run: `mode=conversation_skill_local_flow`, `status=continue`, `flow_action=provide_concrete_phrase`, `visible_task=concrete_phrase`
- global_dispatcher_skipped: `true`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none
- verification DB apres T2: `user_chat_states.temp_memory.__active_skill_state.skill_id=emotional_repair`, `status=active`

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Active flow / interruption policy non respectee

**User**
> Je change de sujet : dans l'app Sophia, où est-ce que je retrouve mes cartes d'attaque déjà créées ?

**Sophia**
> Tu peux retrouver tes cartes d'attaque dans l'onglet **Ressources** de ton dashboard. Elles y sont rangées par niveau pour que tu puisses les consulter facilement.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- active_flow_arbitration: `decision=none`, `active_owner=none`, `reason_code=no_active_flow`
- note_information: `source_flow_id=global_dispatcher`, `target_dispatcher=product_help`, `handoff_reason=explicit_user_request`
- product_help diagnosis: `mode=standalone`, `active_flow_used=false`, `return_to_parent_flow=false`, `handoff_to_local_dispatcher=false`, `note_information=null`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none
- verification DB apres T3: `user_chat_states.temp_memory.__active_skill_state.skill_id=product_help`, `status=active`

**Analyse si yellow/red**
- Symptome: la reponse produit visible est correcte, mais le tour ne passe toujours pas par le dispatcher local `emotional_repair` actif.
- Source amont probable: le flow actif existe bien en DB apres T2, mais n'est pas recharge ou n'est pas pris en compte au debut de T3 avant l'arbitrage global.
- Owner runtime: active flow state loader / turn frame construction / route arbitration.
- Meilleure correction selon les guidelines: garantir que `__active_skill_state` lu depuis `user_chat_states.temp_memory` alimente `activeFlowStateForTurn.activeSkillState` avant tout dispatcher global; si le user change de sujet, `emotional_repair.local_dispatcher` doit produire `exit_to_global_dispatcher` avec `note_information`.
- Pourquoi ce n'est pas un patch local: le dispatcher local source n'a pas recu le T3. La preuve est `active_flow_arbitration.reason_code=no_active_flow` malgre la preuve DB post-T2.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia comprend correctement la detresse emotionnelle initiale.
- La contrainte utilisateur du T2 est respectee: reponse courte, pas de plan, pas d'exercice, pas de question.
- La reponse produit du T3 est utile et naturelle pour l'utilisateur.

**Problemes**
- Tour 3: la transition visible est acceptable, mais elle n'est pas doctrinale. Le flow sensible est contourne sans `exit_to_global_dispatcher` produit par `emotional_repair`. Famille: `BF-ROUTE-02`. Impact utilisateur direct faible sur ce tour, impact systeme eleve pour la fiabilite des handoffs locaux.

**Fix propose**
- Source amont: chargement et injection de l'active flow state au debut du tour, avant `active_flow_arbitrator` et avant tout dispatch global.
- Correction recommandee: ajouter une verification contractuelle au debut de `run.ts`: si `tempMemory.__active_skill_state.skill_id` existe et represente un local flow actif, `activeFlowStateForTurn.activeSkillState` ne peut pas etre `null`. En cas d'incoherence, tracer un warning bloquant pour QA et utiliser l'etat DB.
- Tests d'invariant attendus: integration `test-send-message` T1/T2/T3 avec assertion DB apres T2, puis assertion T3 `active_emotional_repair_local_dispatcher` et sortie `exit_to_global_dispatcher` avec `note_information` avant `product_help`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: entree `emotional_repair` correcte via global vers local, avec `note_information` d'activation.
- T2: le dispatcher local actif reprend bien le tour, `global_dispatcher_skipped=true`, et le flow reste en `status=continue`.
- T3: regression persistante. Le runtime voit `active_owner=none` et route directement vers `product_help` par `skill_entry_signal`, alors que la DB prouvait `__active_skill_state.skill_id=emotional_repair` apres T2.

**Skills / Operations / Tools**
- Aucun tool ni operation engageante n'est appele.
- `product_help` repond en standalone: `active_flow_used=false`, `return_to_parent_flow=false`.

**State / DB**
- Apres T2: `__active_skill_state.skill_id=emotional_repair`, `status=active`.
- Au T3: trace runtime `active_flow_arbitration.reason_code=no_active_flow`.
- Apres T3: `__active_skill_state.skill_id=product_help`, `status=active`.

**Memory**
- Pas de memoire route utilisee.
- Aucun leak de memoire brute observe dans la reponse visible.

**Side Effects**
- `direct_effects=[]`, `executed_tools=[]`, `tool_execution=none` sur les tours.
- Aucun effet durable non consenti observe.

**Fix concret**
- Le garde-fou avant persistance a fonctionne pour T2: la DB contient bien `emotional_repair` apres le tour local `continue`.
- La cause restante est en amont du dispatch du tour suivant: le loader/arbitrator ne consomme pas cet etat DB au T3, ou le scope/turn frame utilise une projection sans active state.
- Ajouter un test integration de chargement: DB seed `__active_skill_state.skill_id=emotional_repair` -> nouveau message produit -> attendu `active_flow_arbitration.active_owner=emotional_repair` et jamais `no_active_flow`.

## Verdict Global

`red` systeme.

Le reboot a permis de relancer un run valide. Le fix de persistance post-T2 est prouve par la DB, mais le changement de sujet echoue encore doctrinalement: T3 demarre avec `no_active_flow` et active `product_help` en standalone.
