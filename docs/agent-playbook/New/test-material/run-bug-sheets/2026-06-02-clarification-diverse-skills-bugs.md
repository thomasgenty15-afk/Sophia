# Bug Sheet — Clarification Diverse Skills

## R1-B01

- Tours: Tour 4 — `clarification-diverse-20260602-r4-demotivation`
- Famille: `BF-ROUTE-01` — Mauvais owner selectionne
- Domaine owner: `demotivation_repair` + active skill clarification arbitration
- Source amont: candidates/adapters de clarification interne pour `demotivation_repair`
- Symptome visible: Sophia pose une question pertinente dans le skill, mais sans passer par `orientation_clarification`.
- Preuve systeme: `response_owner=conversation_handler`, `selected_handler=demotivation_repair`, pas de `__clarification_state_v1`, aucun tool exécuté.
- Correction attendue: produire des candidats structurés perte de sens / fatigue / action trop grosse / plan mal calibré et déléguer à `runSkillClarification`.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/router/clarification_candidate_builder.ts`, `supabase/functions/sophia-brain/router/clarification_arbitrator.ts`
- Tests requis: unit candidate builder demotivation, run IA réel actif demotivation, invariant no executor/no durable effect.

## R1-B02

- Tours: Tour 5 — `clarification-diverse-20260602-r5-weekly`
- Famille: `BF-ROUTE-01` — Mauvais owner selectionne
- Domaine owner: `weekly_adaptive_review_v1` + active skill clarification arbitration
- Source amont: weekly active flow continue court-circuite l'adapter de clarification interne.
- Symptome visible: Sophia donne une réponse longue avec recommandation A/B au lieu d'une question de clarification courte.
- Preuve systeme: `response_owner=conversation_handler`, `selected_handler=weekly_adaptive_review_v1`, pas de `__clarification_state_v1`, aucun tool exécuté, aucun effet durable.
- Correction attendue: construire les candidats weekly recap / recommandation / adjust plan handoff et déléguer à `runSkillClarification`, sans patch de plan.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/router/clarification_candidate_builder.ts`, `supabase/functions/sophia-brain/router/clarification_arbitrator.ts`
- Tests requis: unit candidate builder weekly, run IA réel actif weekly, invariant no executor/no plan patch.
