# QA Run Report - adjust_plan_item triptych real R2 - 2026-06-10

## 1. Contexte Du Test

- Date: 2026-06-10.
- Run: `adjust-plan-triptych-r2`.
- Persona: `rose`, scope dedie `qa-rose-2026-06-10-adjust-plan-whole-plan-taxonomy-triptych_r2`.
- Objectif: verifier en conditions reelles que `adjust_plan_item` ne livre pas un handoff Plan tant que le triptyque n'est pas clair : quoi modifier, pourquoi, nature de modification.
- Trajectoire: demande incomplete -> clarification -> reduction explicite -> apply attempt non-mutant -> stop local.
- Surfaces visees: dispatcher local `adjust_plan_item`, reducer local, visible agent stage-specific, no-chat-mutation, cleanup DB cible.
- Cadre IA reel: valide. Supabase local hors sandbox, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. Messages choisis tour par tour apres lecture des reponses/traces. Cleanup cible effectue.
- Artefacts: `tests/real-personas/rose/runs/operations/2026-06-10-adjust-plan-whole-plan-taxonomy-triptych_r2.summary.json`, `tests/real-personas/rose/runs/operations/2026-06-10-adjust-plan-whole-plan-taxonomy-triptych_r2.raw.json`, `tests/real-personas/rose/runs/operations/2026-06-10-adjust-plan-whole-plan-taxonomy-triptych_r2.cleanup.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je veux ajuster mon plan : ma routine du soir me prend trop d'énergie cette semaine, et je veux garder le rituel.

**Sophia**
> Je comprends, il faut que ta routine du soir reste gérable cette semaine. Pour garder ton rituel tout en économisant ton énergie, qu'est-ce que tu aimerais simplifier ou raccourcir concrètement ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- visible_task: `clarify_adjustment_need`
- safety: none
- direct_effects: []
- operation: `tool_skill_run.status=clarifying`
- pending_confirmation: false
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: `committed_effects=0`

### Tour 2

**Verdict du tour:** green

**User**
> Je veux réduire la routine du soir : garder seulement le déclencheur après le dîner, faire trois respirations, puis écrire une seule ligne dans le carnet. Rien autour du téléphone.

**Sophia**
> Comme ta routine du soir te demande trop d'énergie en ce moment, on va l'alléger pour ne garder que l'essentiel dans ton niveau 'Casser l'automatisme du soir'.
>
> Pour faire ce changement, va dans l'onglet Plan sur la plateforme. Juste sous ton niveau actif, utilise le bouton Ajuster mon plan et saisis cette proposition :
>
> Réduire la routine du soir cette semaine : après le dîner, faire 3 respirations et écrire une ligne dans le carnet. Retirer les éléments liés au téléphone.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- visible_task: `plan_handoff_ready`
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
> Ok fais-le directement dans mon plan maintenant.

**Sophia**
> Je ne peux pas modifier ton plan directement depuis notre discussion. Comme ta routine du soir te demande trop d'énergie en ce moment, l'idée est de l'alléger pour cette semaine en retirant ce qui touche au téléphone. Pour valider ça, va dans ton Plan : juste sous ton niveau actuel, tu trouveras 'Ajuster mon plan'. Tu n'auras qu'à saisir : Réduire la routine du soir cette semaine : après le dîner, faire 3 respirations et écrire une ligne dans le carnet. Retirer les éléments liés au téléphone.

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
> Entendu, on s'arrête là pour le moment.

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
- Tour 1: Sophia ne saute plus trop vite vers `Ajuster mon plan`; elle demande ce qui doit etre simplifie ou raccourci.
- Tour 2: la reponse visible contient les trois pieces attendues: quoi modifier (`routine du soir` / niveau actif), pourquoi (`trop d'energie`), nature (`alleger` / `reduire` / retirer les elements telephone).
- Tour 3: l'apply attempt est clair sans pretendre modifier le plan.
- Tour 4: le stop local ferme courtement sans renvoyer vers Plan.

**Problemes**
- Aucun probleme bloquant observe.

**Fix propose**
- Source amont: aucun fix requis.
- Correction recommandee: conserver l'invariant `triptyque obligatoire avant handoff`.
- Tests d'invariant attendus: garder les tests unitaires `change_kind` manquant -> clarification, et le run reel `triptych_r2` comme preuve conversationnelle.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 demarre dans `adjust_plan_item`.
- T2-T4 restent dans le dispatcher local actif avec `active_adjust_plan_item_local_dispatcher`.
- Le dispatcher global normal ne reprend pas pendant le flow actif.

**Skills / Operations / Tools**
- Stages visibles observes: `clarify_adjustment_need`, `plan_handoff_ready`, `apply_attempt`, `cancel_close`.
- Aucun outil ni executor n'est appele.
- `apply_attempt` bloque explicitement la mutation chat via `chat_plan_mutation_disabled_platform_handoff`.

**Memory / Effets durables**
- Aucun effet durable engageant: `committed_effects=0` sur tous les tours.
- Snapshot initial: 1 plan, 5 items, 0 entries.
- Cleanup cible: `remaining_scope_messages=0`, aucun plan/item cree restant, 6 lignes restaurees.

**Fix propose**
- Source amont: aucun fix systeme requis.
- Correction recommandee: aucune.
- Tests d'invariant attendus: conserver la couverture reducer + visible agent + QA reel.

## Verdict Global

- Verdict: green
- Raison principale: le nouveau contrat fonctionne en conditions reelles. Le flow clarifie quand la nature du changement manque, puis produit un handoff lisible avec quoi modifier, pourquoi, nature de modification et chemin `Ajuster mon plan`.
