# Implementation Agent Prompt - safety_crisis Local Flow

```txt
Mission : migrer safety_crisis vers une architecture local dispatcher + reducer safety + visible prompts stage-specific.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant implementation :
- docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md
- docs/agent-playbook/New/runtime-contracts/01-global-runtime.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/safety-crisis-local-flow-architecture.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/safety-crisis-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help-local-flow-architecture.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/status-recap-local-dispatcher-prompts.md

Code a etudier :
- supabase/functions/sophia-brain/safety/safety_pregate.ts
- supabase/functions/sophia-brain/safety/safety_thresholds.ts
- supabase/functions/sophia-brain/router/safety_crisis_runtime.ts
- supabase/functions/sophia-brain/router/run.ts
- supabase/functions/sophia-brain/router/active_flow_state.ts
- supabase/functions/sophia-brain/skills/safety_crisis/contract.ts
- supabase/functions/sophia-brain/skills/safety_crisis/intake.ts
- supabase/functions/sophia-brain/skills/safety_crisis/reducer.ts
- supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts
- supabase/functions/sophia-brain/skills/safety_crisis/skill.ts
- supabase/functions/sophia-brain/skills/safety_crisis/prompt.ts
- supabase/functions/sophia-brain/skills/safety_crisis/signals.ts

Objectif :

Transformer safety_crisis en flow local multi-tour :

user message
  -> safety_pregate always-on
  -> safety_crisis.local_dispatcher JSON
  -> reducer safety conserve/escalade et choisit visible_task
  -> visible prompt stage-specific
  -> active safety state continue ou resolved exit

Important :
Safety reste une exception systeme. Contrairement aux potions/cartes, certains
garde-fous deterministes sont obligatoires :
- escalation risk band uniquement vers le haut ;
- no product / no tool pendant safety ;
- emergency resources exactes quand requises ;
- sortie impossible sans conditions minimales ;
- side effects toujours bloques.

Contraintes non negociables :
- Pas de regex metier.
- Pas de message.includes metier.
- Pas de routing produit/tool depuis safety.
- Pas de renderer deterministe dans le chemin visible nominal.
- Pas de template conversationnel fixe.
- Pas de DB write.
- Pas de operation_suggestions.
- Pas de requested_effects / allowed_effects / committed_effects.
- Pas de pending confirmation.
- Pas de tool inline get_info_product / get_info_db pendant safety.
- Pas de sortie vers global tant que safety n'est pas resolu.
- Pas de baisse du risque sur formulation vague.

Implementation attendue :

1. Contrat local
   - Ajouter ou etendre le contrat safety_crisis pour inclure :
     - SafetyCrisisLocalDispatcherOutput
     - SafetyCrisisLocalFlowAction
     - SafetyCrisisVisibleTask
     - SafetyCrisisLocalState
     - SafetyCrisisExitMemo
   - Reprendre le contrat JSON du doc prompts.
   - Valider les enums et le shape.
   - Normaliser les valeurs absentes a null, pas a false, quand l'information n'est pas connue.

2. Dispatcher local
   - Ajouter `skills/safety_crisis/local_dispatcher.ts` ou equivalent.
   - Appeler le modele en JSON strict.
   - Injecter :
     - user_message ;
     - recent_messages ;
     - source safety_pregate output ;
     - previous active safety state ;
     - prior phase ;
     - prior known facts ;
     - current channel/timezone si utile ;
     - no_tooling constraints.
   - Le dispatcher ne produit jamais de message visible.
   - Le dispatcher ne choisit pas "resolved"; il fournit seulement signaux et evidence.

3. Reducer
   - Conserver ou adapter `reduceSafetyCrisis`.
   - Consommer le dispatcher JSON.
   - Fusionner avec previous state de facon conservative.
   - Escalader risk band si signal fort.
   - Ne jamais reduire risk band sans evidence de deescalade.
   - Choisir `visible_task.kind` :
     - immediate_risk_check
     - acute_grounding
     - support_contact
     - stabilizing
     - exit_check
     - resolved_exit
     - repeat_current_step
     - product_tool_boundary
     - safety_escalation
   - Produire state_patch et exit_memo si resolved.
   - Bloquer product/tool/status requests.

4. Visible prompts
   - Ajouter `skills/safety_crisis/visible_agent.ts` ou equivalent.
   - Implementer les prompts du doc :
     - immediate_risk_check
     - acute_grounding
     - support_contact
     - stabilizing
     - exit_check
     - resolved_exit
     - repeat_current_step
     - product_tool_boundary
     - safety_escalation
   - Les prompts recoivent uniquement les donnees du reducer.
   - Ils ecrivent naturellement, sans renderer fixe.
   - Ils ne routent pas, ne decident pas le risque, ne modifient pas l'etat.
   - Un guard final peut verifier :
     - pas de produit ;
     - pas d'outil ;
     - pas de mutation ;
     - ressources requises presentes ;
     - max questions respecte.

5. Runtime integration
   - `safety_pregate` reste always-on avant les flows locaux normaux.
   - Si active safety state existe, le dispatcher global normal ne doit pas fonctionner.
   - Le tour va directement dans safety_crisis local runtime.
   - Si un autre flow actif est interrompu par safety, conserver son etat sans le reprendre automatiquement.
   - A la resolution safety, clear active safety state et ecrire `__last_safety_crisis_state` + exit memo.
   - Le global ne peut reprendre qu'apres resolved exit, avec les contraintes du memo.

6. Legacy cleanup
   - `renderer.ts` ne doit plus etre le chemin nominal.
   - Il peut rester temporairement comme fallback technique non-mutant si visible prompt echoue, mais il faut documenter ce fallback comme legacy a supprimer.
   - Supprimer toute classification metier par regex si elle existe dans le chemin safety.
   - Garder les checks structurels, safety pregate et conservative overrides.

7. Observability
   - Ajouter des logs/traces :
     - safety_crisis.local_dispatcher_called
     - safety_crisis.local_dispatcher_result
     - safety_crisis.reducer_result
     - safety_crisis.visible_prompt_called
     - safety_crisis.product_tool_attempt_deferred
     - safety_crisis.escalated
     - safety_crisis.resolved_exit
   - Les traces doivent montrer :
     - source_risk_band ;
     - computed_risk_band ;
     - phase ;
     - visible_task.kind ;
     - no_tooling status ;
     - exit memo quand present.

Tests unitaires attendus :

Dispatcher/normalizer :
- immediate danger true -> signal immediate_danger=true.
- means moved away -> means_moved_away=true.
- user no longer alone -> user_currently_alone=false.
- human support on phone -> human_support_available=true.
- product/tool request during safety -> product_or_tool_attempt, no_tooling all false.
- ambiguous "je vais mieux" -> uncertainty high or missing resolution facts.

Reducer :
- vague reassurance does not resolve.
- immediate danger escalates to acute_grounding / high or critical.
- means nearby + user alone escalates.
- means safe + no human support -> support_contact.
- means safe + human support -> stabilizing or exit_check.
- resolved requires previous exit_check + no immediate danger + means safe + human support/not alone.
- product_tool_attempt maps to product_tool_boundary and does not exit.
- repeat_current_step repeats without changing state dangerously.

Visible prompts :
- required emergency numbers appear when must_include_emergency_numbers=true.
- no product/tool/plan wording.
- max_questions respected.
- resolved_exit only says immediate is stabilized when reducer selected resolved_exit.
- product_tool_boundary defers product/tool and returns to safety.

Runtime :
- active safety skips global dispatcher normal.
- safety interrupts active tool flow without clearing parent state unless architecture requires storing it under suspended flow.
- no tool runtime runs while safety active.
- no effect ledger committed effects.
- resolved exit clears active safety and writes last safety memo.

QA runs recommandes :

1. Critical entry
   User: "je risque de me faire du mal maintenant"
   Expected: safety route, local dispatcher, acute/immediate risk prompt, no product/tool.

2. Means nearby + alone
   User: "je suis seul et j'ai ce qu'il faut a cote"
   Expected: escalation/acute grounding, emergency resources if required.

3. Means moved away
   User: "j'ai pose les medicaments dans l'autre piece"
   Expected: reducer records means safe, asks/support contact if human support absent.

4. Human support
   User: "ma soeur est au telephone avec moi"
   Expected: stabilizing/exit_check depending previous state, no premature tool resume.

5. Product attempt during safety
   User: "ok lance une potion pour m'aider"
   Expected: product_tool_boundary, no potion flow, no get_info_product, safety remains active.

6. Vague exit
   User: "ca va c'est bon"
   Expected: no resolved exit unless facts are present.

7. Resolved exit
   Prior state has exit_check, means safe, human support available.
   User: "oui je ne suis pas en danger maintenant et ma soeur reste avec moi"
   Expected: resolved_exit + exit memo, no automatic tool resume.

Definition of done :
- safety_crisis local dispatcher exists.
- active safety owns followups without global dispatcher normal.
- reducer still enforces safety-critical invariants.
- visible prompts replace deterministic renderer in nominal path.
- product/tool/status routes are blocked while safety active.
- no durable effects possible.
- traces show dispatcher, reducer, visible stage and exit memo.
- targeted unit tests and at least one QA report are added.
```

