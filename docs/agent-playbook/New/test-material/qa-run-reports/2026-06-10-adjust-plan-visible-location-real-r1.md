# QA Run Report - adjust_plan_item visible location R1 - 2026-06-10

## 1. Contexte Du Test

- Date: 2026-06-10.
- Run: `adjust-plan-visible-location-r1`.
- Persona: `rose`, connexion locale existante, scope dedie `qa-rose-2026-06-10-adjust-plan-whole-plan-taxonomy-visible_location_r1`.
- Objectif: verifier en conditions reelles que `adjust_plan_item` explique mieux pourquoi ajuster, quoi ajuster, ou saisir la proposition dans l'interface, et que le stop local ne renvoie plus vers Plan.
- Trajectoire: demande d'allegement d'une routine -> revision precise avec contrainte -> demande d'application depuis le chat -> stop local.
- Surfaces visees: dispatcher global d'entree, dispatcher local `adjust_plan_item`, reducer local, visible agent stage-specific, EffectLedger/no-chat-mutation, cleanup DB cible.
- Cadre IA reel: valide. Supabase local hors sandbox, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. Messages choisis tour par tour apres lecture de la reponse precedente. Cleanup cible effectue apres run.
- Artefacts: `tests/real-personas/rose/runs/operations/2026-06-10-adjust-plan-whole-plan-taxonomy-visible_location_r1.summary.json`, `tests/real-personas/rose/runs/operations/2026-06-10-adjust-plan-whole-plan-taxonomy-visible_location_r1.raw.json`, `tests/real-personas/rose/runs/operations/2026-06-10-adjust-plan-whole-plan-taxonomy-visible_location_r1.cleanup.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je veux ajuster mon plan : cette semaine ma routine du soir me prend trop d'énergie. Je veux la réduire à une version 5 minutes, sans supprimer le rituel.

**Sophia**
> C'est tout à fait compréhensible de vouloir alléger votre routine si elle vous demande trop d'énergie en ce moment. Pour cette semaine, l'idée est de passer à une version de 5 minutes pour votre sas de décompression afin de préserver votre rituel sans vous épuiser. Pour reprendre cette proposition, rendez-vous sur la plateforme dans l'onglet Plan : sous votre niveau actif, vous trouverez l'option « Ajuster mon plan » où vous pourrez saisir « 5 minutes ».

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- visible_task: `plan_handoff_ready`
- safety: none
- direct_effects: []
- operation: `tool_skill_run.status=draft_delivered`
- pending_confirmation: false
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: `committed_effects=0`

### Tour 2

**Verdict du tour:** green

**User**
> Oui, précise plutôt : garder le déclencheur après le dîner, faire trois respirations, puis écrire une seule ligne dans le carnet. Et je veux éviter toute nouvelle règle autour du téléphone.

**Sophia**
> Pour que ton sas de décompression soit plus précis et sans contrainte sur le téléphone, voici la nouvelle version à reprendre : "Après le dîner, faire trois respirations puis écrire une seule ligne dans le carnet, sans ajouter de nouvelle règle autour du téléphone." Tu peux effectuer ce changement dans ton Plan, sous le niveau actif, en choisissant "Ajuster mon plan". Est-ce que cela te convient ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- visible_task: `revise_plan_handoff`
- safety: none
- direct_effects: []
- operation: `tool_skill_run.status=draft_delivered`
- pending_confirmation: false
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: `committed_effects=0`

### Tour 3

**Verdict du tour:** green

**User**
> Oui, fais-le directement dans mon plan maintenant.

**Sophia**
> Je ne peux pas modifier ton plan directement depuis notre discussion, mais tu peux le faire très facilement sur la plateforme. Pour rendre ton habitude plus précise et éviter d'ajouter une contrainte sur l'usage du téléphone, rends-toi dans l'onglet Plan. Sous ton niveau actif "Casser l'automatisme du soir", tu trouveras l'option Ajuster mon plan. C'est là que tu pourras indiquer la nouvelle consigne : après le dîner, faire trois respirations puis écrire une seule ligne dans le carnet.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- visible_task: `apply_attempt`
- safety: none
- direct_effects: []
- operation: `tool_skill_run.status=apply_attempt`
- pending_confirmation: false
- blocked_effects: `chat_plan_mutation_disabled_platform_handoff`
- executed_tools: []
- durable_effect: `committed_effects=0`

### Tour 4

**Verdict du tour:** green

**User**
> Non stop, laisse tomber l'ajustement pour maintenant.

**Sophia**
> C'est entendu, on laisse tomber l'ajustement pour le moment.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- visible_task: `cancel_close`
- safety: none
- direct_effects: []
- operation: `tool_skill_run.status=cancelled`
- pending_confirmation: false
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: `committed_effects=0`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia explique le pourquoi de l'ajustement avant la proposition: routine trop couteuse en energie cette semaine, besoin d'une version mini.
- Sophia dit clairement quoi ajuster et donne une formulation concrete a reprendre.
- La destination produit est beaucoup plus precise: plateforme, Plan, sous le niveau actif, `Ajuster mon plan`.
- Le stop local est fluide et ne contient plus de contradiction du type "retourner a ton plan".

**Problemes**
- Aucun probleme bloquant observe. Tour 3 pourrait encore etre un peu plus complet en repetant toute la contrainte telephone dans la consigne finale, mais la contrainte est mentionnee dans la phrase precedente et le handoff complet avait deja ete donne au tour 2.

**Fix propose**
- Source amont: aucun fix bloquant requis.
- Correction recommandee: conserver l'invariant visible ajoute sur `cancel_close`; renforcer seulement si besoin futur l'exhaustivite de la phrase a saisir en `apply_attempt`.
- Tests d'invariant attendus: garder le test visible-agent `cancel_close` sans Plan, et un run reel `apply_attempt` qui mentionne plateforme/Plan/niveau actif/Ajuster mon plan.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 demarre correctement sur `adjust_plan_item` via `tool_skill_intent_start`.
- T2-T4 restent dans le dispatcher local actif avec `route_reason=active_adjust_plan_item_local_dispatcher`.
- Le dispatcher global normal ne reprend pas pendant le flow actif.

**Skills / Operations / Tools**
- Les stages visibles sont stage-specific: `plan_handoff_ready`, `revise_plan_handoff`, `apply_attempt`, `cancel_close`.
- `apply_attempt` bloque l'effet chat avec `chat_plan_mutation_disabled_platform_handoff`.
- Aucun outil ni executor n'est appele.

**Memory / Effets durables**
- Aucun effet durable engageant: `committed_effects=0` sur tous les tours.
- Snapshot initial: 1 plan, 5 items, 0 entries.
- Cleanup cible: `remaining_scope_messages=0`, aucun plan/item cree restant, 6 lignes restaurees.
- L'export REST supplementaire de `conversation_turn_traces` dans l'artefact durable a retourne 400, mais chaque tour contient une trace inline exploitable renvoyee par `/functions/v1/test-send-message`; le run reste valide.

**Fix propose**
- Source amont: aucun fix systeme requis.
- Correction recommandee: aucune.
- Tests d'invariant attendus: conserver les tests unitaires du visible agent et ce scenario reel comme preuve de correction conversationnelle.

## Verdict Global

- Verdict: green
- Raison principale: les modifications fonctionnent en conditions reelles. Le handoff donne le pourquoi, le quoi et le chemin produit precis, `apply_attempt` reste non-mutant, et `cancel_close` ferme localement sans redirection vers Plan.
