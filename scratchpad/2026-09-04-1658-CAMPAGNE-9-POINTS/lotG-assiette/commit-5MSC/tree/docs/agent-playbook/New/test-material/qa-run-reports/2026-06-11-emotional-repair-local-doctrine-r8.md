# QA Run - emotional-repair-local-doctrine-r8

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `emotional-repair-local-doctrine-r8`
- Persona: connexion temporaire locale `qa-qa-skill-emotional-repair-emotional-repair-local-doctrine-r8@example.com`, `is_test_persona=true`.
- Objectif: verifier en conditions reelles le fix de propagation `local flow exit -> second pass global -> product_help`.
- Trajectoire: entree emotionnelle -> phrase courte sans plan/question -> verification DB active `emotional_repair` -> changement clair vers une question produit sur les cartes d'attaque.
- Surfaces visees: `emotional_repair`, active flow state, local exit memo, `note_information`, second pass global, `product_help`, trace finale.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback `processMessage`, aucun staging/remote.
- Validite QA: valide. Trois tours HTTP `200`, verification DB apres T2, cleanup cible execute via `scripts/qa-cleanup-run-connection.sh`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je me suis figé pendant un point d'équipe et depuis je me raconte que ça prouve que je ne suis pas fiable. Aide-moi à remettre ce moment à sa juste place, doucement.

**Sophia**
> C'est vraiment éprouvant de se sentir figé devant tout le monde. Mais attention à ce raccourci : avoir eu un moment de blocage ne signifie pas que tu es "non fiable". C'est un événement ponctuel, pas une vérité sur qui tu es. Est-ce que tu sens à quel point ce verdict est sévère par rapport à ce qui s'est réellement passé ?

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- note_information: `source_flow_id=global_dispatcher`, `target_dispatcher=emotional_repair`
- direct_effects: `[]`
- operation: `none`
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui, il est trop sévère. Donne-moi juste une phrase courte à garder, sans exercice, sans plan, et sans question.

**Sophia**
> Tu as fait une erreur, mais tu n'es pas cette erreur.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- operation_flow_run: `mode=conversation_skill_local_flow`, `status=continue`
- global_dispatcher_skipped: `true`
- verification DB apres T2: `__active_skill_state.skill_id=emotional_repair`, `status=active`
- direct_effects: `[]`
- executed_tools: `[]`

### Tour 3

**Verdict du tour:** green

**User**
> Je change de sujet : où est-ce que je retrouve dans Sophia les cartes d'attaque que j'ai déjà créées ?

**Sophia**
> Tu trouveras tes cartes d'attaque déjà créées dans l'onglet **Ressources** de ton Dashboard. Elles sont aussi accessibles directement depuis ton **Plan**, sur la mission ou l'habitude correspondante.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- active_flow_arbitration: `no_active_flow` apres sortie locale consommee
- turn_note_source: `emotional_repair`
- turn_note_target: `global`
- local_exit_source: `emotional_repair`
- local_exit_consumed_by: `global_dispatcher_second_pass`
- local_exit_response_owner: `product_help`
- product_help diagnosis: `mode=inline`, `return_to_parent_flow=true`
- direct_effects: `[]`
- operation: `none`
- executed_tools: `[]`
- durable_effect: none

**Trace active_flow_debug**
- `user_state_loaded`: raw `__active_skill_state.skill_id=emotional_repair`
- `read_active_flow_state`: `active_skill_state.skill_id=emotional_repair`
- `before_run_conversation_routers`: active skill absent apres sortie locale
- `after_run_conversation_routers`: `route_reason=skill_entry_signal`, `route_active_flow_reason_code=no_active_flow`
- Difference vs r7: la trace finale conserve maintenant `local_flow_exit_handoff` et `turnFrame.note_information.source_flow_id=emotional_repair`.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le soutien emotionnel reste naturel.
- La contrainte courte sans plan/question est respectee.
- Le changement de sujet produit obtient une reponse directe et utile.
- La transition systeme est maintenant auditée sans exposer de mecanique a l'utilisateur.

**Problemes**
- Aucun probleme bloquant observe sur ce scenario.

**Fix propose**
- Aucun fix supplementaire requis pour le bug r7 sur ce scenario.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T2 prouve que `emotional_repair` est actif et persiste en DB.
- T3 prouve que l'etat actif est lu, puis que la sortie locale est conservee dans la trace finale.
- `product_help` n'est plus audite comme standalone pur: `mode=inline`, `return_to_parent_flow=true`, `local_exit_source=emotional_repair`.

**Skills / Operations / Tools**
- `emotional_repair` gere le flow actif avant sortie.
- `product_help` reprend le contenu produit apres second passage global.
- Aucun tool ni operation engageante appele.

**State / DB**
- Apres T2: `__active_skill_state.skill_id=emotional_repair`.
- Apres T3: `product_help` peut devenir le flow actif, mais la trace du tour conserve la provenance locale source.

**Memory**
- Pas de memoire route utilisee.
- Aucun leak de memoire brute observe.

**Side Effects**
- `direct_effects=[]`, `executed_tools=[]`.
- Aucun effet durable non consenti.

## Verdict Global

`green`.

Le run valide le correctif: le changement de sujet ne ressemble plus a une capture standalone silencieuse par `product_help`. Le second passage global conserve la note locale source `emotional_repair` et la transmet comme contexte inline au dispatcher produit.
