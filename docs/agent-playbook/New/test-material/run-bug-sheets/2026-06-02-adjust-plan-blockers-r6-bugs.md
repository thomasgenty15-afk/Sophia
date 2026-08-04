# Bug Sheet — Adjust Plan Blockers R6

## Run

- Date: 2026-06-02
- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-adjust-plan-blockers-r6.md`
- Runs:
  - `adjust-plan-blockers-action-20260602-r6`
  - `adjust-plan-blockers-level-20260602-r6`
  - `adjust-plan-blockers-whole-20260602-r6`
- Verdict: red

## Bugs

### R6-B01 — Action concrete encore sur-clarifiee

- Tours: action T2
- Famille: `BF-INTAKE-01` — Slot fourni mais redemande
- Domaine owner: `adjust_plan_item`
- Source amont: action intake/readiness, coach guidance questions, legacy executable slots
- Symptome visible: apres cible + levier + duree + frequence + contexte, Sophia redemande quel aspect simplifier.
- Preuve systeme:
  - `status=clarifying`
  - `missing_slots=["specific_plan_item.action_request_category","specific_plan_item.reason"]`
  - `executed_tools=[]`, `committed_effects=[]`, `pending_confirmation=null`
- Correction attendue: pour handoff no-mutation, accepter une version concrete comme suffisante; ne pas exiger `action_request_category/reason` si la reco peut etre formulee.
- Statut: fixed-local, pending real QA rerun
- Fix reference:
  - `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts`
  - test: `adjust_plan action guidance can hand off when no clarification remains`
- Tests requis:
  - full AI local: `version deux minutes, une seule fois les jours charges` -> handoff au tour courant;
  - unit: action guidance avec concrete change + question obsolète -> handoff ou filtre question;
  - anti-regression: action vraiment vague -> clarification.

### R6-B02 — Clarification action fragmentee

- Tours: action T1
- Famille: `BF-INTAKE-03` — Contrainte/qualite de draft degradee
- Domaine owner: `adjust_plan_item`
- Source amont: clarification sanitizer
- Symptome visible: reponse commence par `avant de te le montrer.`
- Preuve systeme:
  - `status=clarifying`
  - `skill_result.reply` contient le fragment
  - no mutation intact
- Correction attendue: sanitizer les fragments `avant de te le montrer`, `avant de te montrer`, et equivalents.
- Statut: fixed-local, pending real QA rerun
- Fix reference:
  - `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts`
  - test: `adjust_plan clarification sanitizer removes invisible draft wording`
- Tests requis:
  - clarification contenant fragment -> question autonome;
  - pas de suppression des questions valides.

### R6-B03 — Sanitizer meta produit une grammaire incorrecte

- Tours: niveau T1, whole-plan T1/T2/T3, action T3
- Famille: `BF-INTAKE-03`
- Domaine owner: `adjust_plan_item`
- Source amont: `userFacingRecommendation`, `userFacingList`
- Symptome visible:
  - `Je te conseille de une baisse...`
  - `Je te conseille de un travail...`
  - `Éviter de Je te conseille de traiter...`
- Preuve systeme:
  - no `sous-skill` visible, mais transformation grammaticale incorrecte;
  - no mutation intact.
- Correction attendue: transformer `Orienter la réponse vers une/un X` -> `Je te conseille une/un X`; transformer `Ne pas traiter cela comme X` -> `Éviter de traiter cela comme X`.
- Statut: fixed-local, pending real QA rerun
- Fix reference:
  - `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/handoff.ts`
  - `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/renderer.ts`
  - test: `adjust_plan handoff sanitizer produces grammatical coaching text`
- Tests requis:
  - no `Je te conseille de une`;
  - no `Je te conseille de un`;
  - no `Éviter de Je te conseille`;
  - preserve/avoid action restent riches.

### R6-B04 — Whole-plan ordre concret traite comme repeat au lieu de revision

- Tours: whole-plan T2
- Famille: `BF-INTAKE-05` — Semantique composite aplatie
- Domaine owner: `adjust_plan_item`
- Source amont: active handoff intent classifier / revise_handoff
- Symptome visible: le user donne ordre actuel et ordre cible, mais Sophia repete le handoff generique sans reprendre `clarification du cap -> routine énergie -> chantier créatif`.
- Preuve systeme:
  - `status=repeat_handoff`
  - `reason_code=active_handoff_continue`
  - `missing_slots=[]`
  - no mutation intact
- Correction attendue: classifier un message actif contenant `ordre est`, `je veux tester`, liste actuelle/cible comme `revise_handoff`, puis regenerer le `recommended_change` avec l'ordre cible.
- Statut: fixed-local, pending real QA rerun
- Fix reference:
  - `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts`
  - `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/handoff.ts`
  - test: `adjust_plan active whole-plan inline order becomes revision`
- Tests requis:
  - active whole-plan handoff + inline order -> `revise_handoff`;
  - response contains target order;
  - `ok applique` after revision -> `apply_attempt`, no mutation.

### R6-B05 — Cloture handoff trop technique et froide

- Tours: action/level/whole, renderer handoff
- Famille: `BF-RENDER-01` — Message utilisateur trop contractuel
- Domaine owner: `adjust_plan_item`
- Source amont: `renderAdjustPlanHandoffDraft`
- Symptome visible: cloture `Je ne modifie pas ton plan depuis le chat.` isolee, correcte juridiquement mais peu aidante pour un handoff plateforme.
- Correction attendue: garder le no-mutation dans le contrat et les traces, mais rendre le message visible actionnable et chaleureux: ouvrir Plan, reprendre la version recommandee la-bas, sans inventer de lien si le registry produit n'en expose pas.
- Statut: fixed-local, pending real QA rerun
- Fix reference:
  - `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/renderer.ts`
  - `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/executor.ts`
  - tests: `adjust_plan handoff renderer contains full platform content`, `adjust_plan handoff renderer redirects to Plan without done language`, `adjust_plan handoff sanitizer produces grammatical coaching text`
- Tests requis:
  - no phrase froide `Je ne modifie pas ton plan depuis le chat` dans le renderer handoff;
  - contient `Il ne te reste plus qu'a ouvrir Plan...`;
  - conserve une destination Plan explicite.

## Invariants Verifies

- 9 tours full AI locaux valides.
- `executed_tools=[]` sur 9/9.
- `committed_effects=[]` sur 9/9.
- `pending_confirmation=null` sur 9/9.
- `operation_id=null` sur 9/9.
- `ok vas-y applique` reste `apply_attempt` sur niveau et whole-plan.
