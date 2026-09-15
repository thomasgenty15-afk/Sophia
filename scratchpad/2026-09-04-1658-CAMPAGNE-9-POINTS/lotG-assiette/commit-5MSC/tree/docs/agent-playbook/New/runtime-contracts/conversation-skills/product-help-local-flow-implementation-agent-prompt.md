# Implementation Agent Prompt - product_help Local Flow

```txt
Mission : migrer product_help vers une architecture local dispatcher + reducer + visible prompts, avec support standalone et inline dans un flow actif.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant implementation :
- docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md
- docs/agent-playbook/New/runtime-contracts/01-global-runtime.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help-local-flow-architecture.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/status-recap-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/tools/adjust-plan-item-local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/flow-opportunity-verification-prompts.md

Code a etudier :
- supabase/functions/sophia-brain/skills/product_help/contract.ts
- supabase/functions/sophia-brain/skills/product_help/intake.ts
- supabase/functions/sophia-brain/skills/product_help/reducer.ts
- supabase/functions/sophia-brain/skills/product_help/renderer.ts
- supabase/functions/sophia-brain/skills/product_help/skill.ts
- supabase/functions/sophia-brain/skills/product_help/context_loader.ts
- supabase/functions/sophia-brain/skills/product_help/retrieval.ts
- supabase/functions/sophia-brain/skills/product_help/knowledge.ts
- supabase/functions/sophia-brain/router/run.ts
- supabase/functions/sophia-brain/router/active_flow_state.ts
- supabase/functions/sophia-brain/skills/status_recap/local_flow.ts
- supabase/functions/sophia-brain/skills/flow_opportunity_verification/runtime.ts

Objectif architecture :

1. Product help standalone
   - Quand product_help est owner global du tour, il peut ouvrir un mini-flow actif.
   - Sur followup product_help actif, le dispatcher global ne doit pas fonctionner.
   - Le tour passe par product_help.local_dispatcher, reducer, visible prompt.
   - Le flow se ferme rapidement si la question est repondue ou apres max_turns.

2. Product help inline
   - Quand un autre flow est actif, le dispatcher local du parent garde la priorite.
   - Si le parent detecte une question produit inline, il appelle product_help en mode inline.
   - Product help repond a la question produit puis retourne au parent.
   - Le parent flow reste actif.
   - Product help inline ne devient jamais owner durable.

3. Exit global
   - Le dispatcher global ne fonctionne pas pendant product_help actif.
   - Il ne peut reprendre que si product_help.local_dispatcher retourne exit_to_global_dispatcher.
   - L'exit_memo doit expliquer la question produit precedente, le mode standalone/inline, le parent eventuel, et l'intention probable.

Contraintes non negociables :
- Pas de regex metier.
- Pas de message.includes metier.
- Pas de renderer visible deterministe dans le chemin nominal.
- Pas de template fixe.
- Pas de second decideur cache.
- Pas de DB write.
- Pas de operation_suggestions.
- Pas de requested_effects / allowed_effects / committed_effects.
- Pas de pending confirmation executable.
- Pas de token de confirmation.
- Pas de lancement d'un autre flow depuis product_help.
- Pas de status recap rendu par product_help.
- Pas de claim objet reel sans grounding.

Implementation attendue :

1. Contrat local
   - Ajouter un contrat JSON product_help.local_dispatcher proche du doc prompts.
   - Inclure flow_action, confidence, risk_score, mode, product_help_intent, target, grounding, bridge, state_updates, visible_task, return_to_parent, exit_memo, evidence.
   - Valider les enums et les invariants non-mutants.

2. Dispatcher local
   - Ajouter product_help/local_dispatcher.ts ou equivalent.
   - Appeler le modele IA en JSON strict.
   - Injecter : user_message, history, product_help_state, parent_flow_context, catalog_candidates, product_surface_registry, recent_committed_effects, DB sources deja chargees, active_flow_context.
   - Ne pas utiliser de regex metier.
   - Fallback technique conservateur uniquement : reponse prudente, no mutation, pas de bridge invente.

3. Reducer
   - Consommer uniquement le JSON dispatcher.
   - Produire la transition non-mutante.
   - Maintenir state standalone leger si necessaire.
   - En mode inline, ne pas creer d'active product_help state ; ajouter seulement une trace subskill sur le parent si l'architecture locale le prevoit.
   - Bloquer operation_suggestions, requested_effects, allowed_effects, committed_effects.
   - Valider parent flow preservation.

4. Visible prompts
   - Ajouter visible_agent.ts ou equivalent.
   - Implementer les prompts :
     - answer_product_question
     - clarify_product_question
     - answer_destination
     - compare_features
     - explain_limit
     - bridge_explanation_only
     - repeat_answer
     - apply_attempt
     - close_product_help
     - safety
   - Les prompts ecrivent naturellement depuis les donnees structurees.
   - Aucun renderer deterministe nominal.
   - Un guard final peut rester pour neutraliser done-language sans commit.

5. Runtime integration
   - Quand __active_skill_state.skill_id="product_help", court-circuiter le dispatcher global et appeler product_help.local_dispatcher.
   - Ajouter logs :
     - product_help.local_dispatcher_called
     - product_help.local_dispatcher_result
     - product_help.visible_prompt_called
     - product_help.inline_called_from_parent
     - product_help.returned_to_parent_flow
     - product_help.exit_to_global_dispatcher
     - product_help.apply_attempt_no_mutation
   - En mode inline, permettre aux flows parents d'appeler product_help sans perdre leur etat.
   - Ne pas remplacer le parent owner par product_help.

6. Runtime cleanup
   - Le visible agent product_help est le chemin nominal.
   - Aucun chemin legacy ne doit rester exporte ou appele.
   - Aucun nouveau fallback lexical.

Tests unitaires attendus :
- product_help local dispatcher classifie answer_product_question.
- product_help local dispatcher classifie answer_destination.
- product_help local dispatcher classifie compare_features.
- product_help local dispatcher classifie explain_limit.
- product_help local dispatcher classifie bridge_explanation_only sans operation_suggestions.
- product_help local dispatcher classifie apply_attempt sans mutation.
- standalone active product_help skip global dispatcher.
- inline product_help called from parent returns to parent.
- inline product_help does not mutate parent fields.
- exit_to_global_dispatcher requires exit_memo.
- real object status without grounding is blocked/prudent.
- visible prompts do not require template labels.
- no renderer deterministic in nominal path.
- no regex business classifier.

Runs QA reels recommandes :

1. Standalone followup
   User: "c'est quoi une carte d'attaque ?"
   Sophia repond produit.
   User: "et c'est ou dans l'app ?"
   Attendu : product_help local dispatcher, pas global, destination courte.

2. Inline inside adjust_plan_item
   Flow adjust_plan_item actif.
   User: "c'est ou dans l'app deja ?"
   Attendu : parent local dispatcher appelle product_help inline, reponse courte, retour parent.

3. Product apply attempt
   User: "ok cree-la"
   Attendu : apply_attempt non-mutant, pas de tool, pas de confirmation token.

4. Bridge explanation then explicit flow request
   User: "comment je fais une potion ?"
   Sophia explique destination.
   User: "ok je veux preparer une potion de clarte"
   Attendu : product_help exit_to_global_dispatcher avec exit_memo, global peut router apres exit.

5. Real object status
   User: "mon rappel est bien programme ?"
   Sans source : reponse prudente, pas d'affirmation.
   Avec recent committed effect : reponse grounded.

6. Product help vs status recap
   User: "ou voir mon statut ?"
   Attendu : product_help destination.
   User: "fais-moi mon statut"
   Attendu : exit_to_global_dispatcher vers status_recap.

Definition of done :
- Les docs product_help local flow sont respectees.
- Active product_help ne lance pas le dispatcher global.
- Inline product_help retourne au parent.
- Aucun effet durable n'est possible.
- Les traces montrent clairement owner, mode, return_to_parent ou exit.
- Tests unitaires passent.
- Un rapport QA court documente les runs et les traces.
```
