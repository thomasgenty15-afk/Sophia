# Bug Sheet - coachingrec-no-regex-20260619-r1

## R1-B01

- Bug id: R1-B01
- Tours: 3, 5
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: reducer local / transition active flow quand un nouveau `dispatcher_signal_context.coaching_type` arrive.
- Symptome visible: Sophia redemande un choix ternaire alors que le dispatcher global a deja identifie `no_plan_action` ou `emotional` avec haute confiance.
- Preuve systeme:
  - T3 signal global: `coaching_type=no_plan_action`, `confidence=0.87`, `needs_type_confirmation=false`; state local: `coaching_type=plan_action`, `pending_type_change.candidate_coaching_type=unclear`.
  - T5 signal global: `coaching_type=emotional`, `confidence=0.92`, `needs_type_confirmation=false`; state local: `coaching_type=no_plan_action`, `pending_type_change.candidate_coaching_type=unclear`.
- Correction attendue: le local reducer doit accepter les changements de type high confidence non ambigus, ou demander une confirmation ciblee avec `candidate_coaching_type` exact.
- Statut: fixed / partially verified
- Fix reference: `supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow.ts`; tests `coaching switches from plan action to clear no-plan action without stale action context`, `coaching switches from no-plan action to clear emotional coaching`, `coaching asks targeted confirmation when incoming type signal is weak`.
- Tests requis: plan_action -> no_plan_action high confidence; no_plan_action -> emotional high confidence; ambiguous -> question ternaire; stale active type ne doit pas bloquer le nouveau type clair.
- Verification: `coachingrec-type-switch-rerun-20260619-r1` T3 verifie plan_action -> no_plan_action sans clarification. Le passage no_plan_action -> emotional reste jaune en run reel car le skill sort vers global; voir `2026-06-19-coachingrec-type-switch-rerun-r1-bugs.md`.

## R1-B02

- Bug id: R1-B02
- Tours: 4
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: merge de `difficulty` / `action_context` lors du changement plan action -> no-plan.
- Symptome visible: pas visible au tour 4, mais etat interne pollue: `difficulty.action_title=Préparer le dossier mutuelle` alors que le sujet courant est le mail a Camille hors plan.
- Preuve systeme: apres T4, `coaching_type=no_plan_action`, `difficulty.target_kind=free_action`, mais `difficulty.action_title` reste l'action du plan precedente.
- Correction attendue: sur changement de type, invalider les champs incompatibles du type precedent et reconstruire la difficulty depuis le signal entrant ou le local dispatcher courant.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow.ts`; test `coaching switches from plan action to clear no-plan action without stale action context`.
- Tests requis: apres changement plan -> no-plan, `plan_item_id=null`, `action_source=free`, `action_title` ne doit pas reprendre le titre de l'ancien plan item.
- Verification: `coachingrec-type-switch-rerun-20260619-r1` T3 state local contient `coaching_type=no_plan_action` et `difficulty.action_title=ouvrir le brouillon du mail à Camille`.
