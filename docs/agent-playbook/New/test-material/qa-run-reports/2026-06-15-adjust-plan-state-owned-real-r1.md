## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `state-owned-r1`
- Persona: Rose, connexion locale existante
- Objectif: verifier en IA reelle que le flow local `adjust_plan_item` reste robuste apres ajout du merge server-owned, de l'audit de mutation et du reader legacy.
- Trajectoire: demande d'ajustement vague mais naturelle -> clarification -> handoff Plan -> revision -> question frontiere d'effet -> demande d'application depuis chat -> changement de sujet rappel.
- Surfaces visees: `/functions/v1/test-send-message`, dispatcher global, flow local `adjust_plan_item`, reducer stateful, active handoff, traces `toolSkillRun.diagnosis`, EffectLedger/no mutation, sortie vers `create_one_shot_reminder`.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct, messages choisis tour par tour apres lecture des reponses et traces.
- Validite QA: valide. Snapshot avant run effectue; cleanup cible effectue apres run.

Artefacts:
- Summary: `tests/real-personas/rose/runs/operations/2026-06-15-adjust-plan-whole-plan-taxonomy-state-owned-r1.summary.json`
- Raw: `tests/real-personas/rose/runs/operations/2026-06-15-adjust-plan-whole-plan-taxonomy-state-owned-r1.raw.json`
- Durable: `tests/real-personas/rose/runs/operations/2026-06-15-adjust-plan-whole-plan-taxonomy-state-owned-r1.durable.json`
- Cleanup: `tests/real-personas/rose/runs/operations/2026-06-15-adjust-plan-whole-plan-taxonomy-state-owned-r1.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Mon plan est trop charge cette semaine, surtout l'action du soir. Je voudrais la rendre plus legere sans abandonner l'objectif, mais je ne sais pas quoi mettre dans Ajuster mon plan.

**Sophia**
> Je comprends, tu veux garder ton sas de décompression tout en l'allégeant pour cette semaine chargée. Pour que ce soit plus simple à gérer, préfères-tu réduire la durée de tes séances ou plutôt diminuer leur fréquence ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation: `adjust_plan_item`, status `clarifying`, reason `adjust_plan_item_local_clarify_adjustment_need`
- flow_action: `clarify_adjustment_need`
- visible_task: `clarify_adjustment_need`
- selected_target: `Faire un sas de décompression (sans fumer)`
- pending_state_present: false
- state_mutation_audit: `platform_handoff` restored/rejected because not allowed during clarification
- direct_effects: []
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Plutot reduire la duree: cette semaine je veux passer sur une version 5 minutes, en gardant le meme signal de pause et sans ajouter de nouvelle action.

**Sophia**
> Je suis prête à t'aider pour cet ajustement. Comme ta semaine est très chargée, l'idée est de réduire la durée de ton action « Faire un sas de décompression (sans fumer) » pour la passer à 5 minutes seulement, sans rien changer d'autre à ton organisation.
>
> Pour finaliser cela, rends-toi dans ton Plan sur la plateforme. Sous ton niveau actif, tu trouveras l'option Ajuster mon plan où tu pourras saisir cette proposition :
>
> « Réduire la durée du sas de décompression à 5 minutes pour cette semaine, en gardant le signal de pause et sans ajouter d'autre action. »

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- operation: `adjust_plan_item`, status `draft_delivered`, reason `adjust_plan_item_local_plan_handoff_ready`
- flow_action: `prepare_plan_handoff`
- visible_task: `plan_handoff_ready`
- selected_target: `Faire un sas de décompression (sans fumer)`
- pending_state_present: true
- stabilization: `has_core_triptych=true`, missing `[]`
- state_mutation_audit: `scope`, `adjustment_need`, `platform_handoff` applied; no rejected changes
- direct_effects: []
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Finalement mets plutot 3 minutes, et precise que c'est seulement pour cette semaine. Le reste garde pareil.

**Sophia**
> C'est entendu, je prends en compte les 3 minutes pour ton sas de décompression afin d'alléger ta semaine. Voici la formulation corrigée que tu peux maintenant saisir dans 'Ajuster mon plan', dans l'onglet Plan sous ton niveau actif : "Réduire la durée du sas de décompression à 3 minutes pour cette semaine uniquement, en gardant le signal de pause et sans ajouter d'autre action."

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- operation: `adjust_plan_item`, status `draft_delivered`, reason `adjust_plan_item_local_revise_plan_handoff`
- flow_action: `revise_plan_handoff`
- visible_task: `revise_plan_handoff`
- selected_target: `Faire un sas de décompression (sans fumer)`
- pending_state_present: true
- constraints: `cette semaine`, `seulement cette semaine`
- state_mutation_audit: `platform_handoff` applied; no rejected changes
- direct_effects: []
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Ok, mais du coup tu l'as deja modifie dans mon plan ou je dois encore le faire moi-meme ?

**Sophia**
> Je ne peux pas modifier ton plan directement d'ici, je t'aide simplement à préparer l'ajustement. Comme ta semaine est très chargée, nous avons convenu de réduire la durée de ton sas de décompression à 3 minutes pour que ce soit plus léger, tout en gardant ton signal de pause. Pour valider cela, rends-toi dans ton Plan : tu trouveras l'option 'Ajuster mon plan' juste sous ton niveau actuel pour y saisir cette modification.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- operation: `adjust_plan_item`, status `draft_delivered`, reason `adjust_plan_item_local_explain_handoff`
- flow_action: `explain_handoff`
- visible_task: `explain_handoff`
- pending_state_present: true
- state_mutation_audit: `scope`, `adjustment_need`, `platform_handoff` restored; rejected `modify_not_allowed_for_transition`
- blocked_effects: []
- direct_effects: []
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** green

**User**
> Vas-y applique-le quand meme depuis le chat, je valide.

**Sophia**
> Je ne peux pas appliquer cette modification directement depuis notre échange. Comme ton plan est trop chargé cette semaine, l'idée est de réduire la durée de ton sas de décompression à 3 minutes pour l'alléger un peu. Pour que ce soit effectif, tu dois le faire toi-même sur la plateforme : va dans ton Plan, et sous ton niveau actif, utilise l'outil Ajuster mon plan en saisissant : 'Réduire la durée du sas de décompression à 3 minutes pour cette semaine uniquement, en gardant le signal de pause et sans ajouter d'autre action'.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- operation: `adjust_plan_item`, status `apply_attempt`, reason `adjust_plan_item_apply_attempt_not_executable_from_chat`
- flow_action: `apply_attempt`
- visible_task: `apply_attempt`
- pending_state_present: true
- blocked_effects: `chat_plan_mutation_disabled_platform_handoff`
- state_mutation_audit: `scope`, `adjustment_need`, `platform_handoff` restored; rejected `modify_not_allowed_for_transition`
- pending_confirmation: false
- direct_effects: []
- executed_tools: []
- durable_effect: none

### Tour 6

**Verdict du tour:** green

**User**
> Ok laisse tomber l'ajustement pour l'instant. A la place, rappelle-moi demain matin de regarder mon plan.

**Sophia**
> Il me manque le moment exact pour programmer ce rappel.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- operation: `create_one_shot_reminder`, status `needs_clarify`, reason `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects: one-shot reminder intent identified, missing time
- blocked_effects: `missing_time`
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia clarifie naturellement le vrai point ambigu au tour 1: durée ou fréquence.
- Le handoff Plan est compréhensible, situé sur la plateforme et sous le niveau actif.
- La révision au tour 3 est fluide: elle conserve la cible et ajuste seulement la durée.
- La frontière d'effet est claire aux tours 4-5: Sophia ne prétend pas avoir modifié le plan et explique quoi faire.
- Le changement de sujet au tour 6 sort proprement vers un rappel sans capturer la nouvelle intention dans `adjust_plan_item`.

**Problemes**
- Aucun problème bloquant ou friction notable observé.

**Fix propose**
- Aucun fix requis pour ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tours 1-5: `response_owner=tool_skill`, `selected_handler=adjust_plan_item`, conforme au flow actif.
- Tour 6: sortie vers `create_one_shot_reminder`, conforme au changement de sujet explicite.

**Skills / Operations / Tools**
- `adjust_plan_item` produit clarification, handoff, revision, explain et apply_attempt sans mutation.
- Aucun executor Plan n'est appelé.
- Aucun pending confirmation créé par `adjust_plan_item`.
- Le rappel au tour 6 reste en clarification `missing_time`, sans execution durable.

**State / Server-Owned Fields**
- Le diagnostic expose `pending_state_present=true` après le handoff.
- Tours 4-5: le reducer restaure `scope`, `adjustment_need` et `platform_handoff` quand le dispatcher tente de les modifier sur une transition non autorisée. C'est le comportement attendu du merge server-owned.
- Le handoff reste disponible pour expliquer, refuser l'application directe et reformuler.

**Effets durables**
- Plans/items avant cleanup: aucun nouveau plan/item créé.
- Cleanup: `remaining_scope_messages=0`, `remaining_created_plan_ids=[]`, `remaining_created_item_ids=[]`.
- Durable effect observé: aucun commit Plan, aucun tool exécuté.

**Observabilite**
- Trace utile disponible: `flow_action`, `visible_task`, `selected_target`, `pending_state_present`, `stabilization`, `blocked_effects`, `state_mutation_audit`.
- Les refus d'effet durable sont explicites via `chat_plan_mutation_disabled_platform_handoff`.

## Verdict Global

`green`

Le flow `adjust_plan_item` reste robuste en IA réelle après les changements server-owned: continuation, handoff, révision, frontière d'effet, apply_attempt et changement de sujet sont alignés. Aucun effet durable faux n'a été observé, et les traces permettent de comprendre les restaurations/refus du reducer.
