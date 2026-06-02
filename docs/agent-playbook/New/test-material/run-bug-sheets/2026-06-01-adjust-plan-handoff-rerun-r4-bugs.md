# Bug Sheet — Adjust Plan Handoff R4

## Run

- Date: 2026-06-01
- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-01-adjust-plan-handoff-rerun-r4.md`
- Runs:
  - `adjust-plan-action-20260601-r4`
  - `adjust-plan-level-20260601-r4`
  - `adjust-plan-whole-20260601-r4`
- Verdict: yellow

## Bugs

### R4-B01 — Action scope sur-clarifie puis perd une cible claire

- Tours: action T2, T3
- Famille: `BF-INTAKE-01` — Slot fourni mais redemande
- Domaine owner: `adjust_plan_item`
- Source amont: intake/readiness gate `specific_plan_item`, state merge entre tours clarifying
- Symptome visible: apres cible + duree + frequence + contexte, Sophia redemande encore le type d'entree; au tour suivant, elle dit ne pas avoir une cible claire.
- Preuve systeme:
  - T2 `status=clarifying`, `missing_slots=["draft_generation_retry_needed"]`
  - T3 `status=clarifying`, `missing_slots=["specific_plan_item.action_request_category","specific_plan_item.reason"]`
  - `executed_tools=[]`, `committed_effects=[]`, `pending_confirmation=null`
- Correction attendue: passer en handoff quand la cible, le levier d'allegement et le changement concret sont presents; ne pas exiger des slots executables non necessaires a un handoff no-mutation.
- Statut: open
- Fix reference: a faire
- Tests requis:
  - action cible + duree + frequence -> handoff sans clarification supplementaire;
  - clarification action puis changement concret -> conserve `target_summary`;
  - anti-regression no executor/no writer/no confirmation.

### R4-B02 — Wording meta visible dans handoff niveau

- Tours: niveau T1
- Famille: `BF-INTAKE-03` — Contrainte/texte interne mal rendu
- Domaine owner: `adjust_plan_item`
- Source amont: `buildAdjustPlanHandoffDraftFromContext`, `coaching_guidance.recommendation`
- Symptome visible: Sophia dit `Le sous-skill doit proposer...`, ce qui expose une instruction interne au user.
- Preuve systeme:
  - T1 `status=handoff_delivered`, `reason_code=current_level_partial_scope_platform_handoff`
  - reponse visible contient `Le sous-skill doit`
  - `executed_tools=[]`, `committed_effects=[]`
- Correction attendue: transformer les formulations meta (`sous-skill`, `orienter la réponse`, `la prochaine réponse doit`) en recommandations utilisateur directes.
- Statut: open
- Fix reference: a faire
- Tests requis:
  - current-level handoff avec guidance meta -> pas de `sous-skill`;
  - whole-plan guidance meta -> pas de `Orienter la réponse`;
  - renderer conserve destination Plan et no-mutation.

### R4-B03 — Whole-plan clarification commence par un fragment

- Tours: whole-plan T1
- Famille: `BF-INTAKE-03`
- Domaine owner: `adjust_plan_item`
- Source amont: clarification content sanitizer / handoff clarification renderer
- Symptome visible: reponse commence par `avant de te montrer quoi que ce soit.`
- Preuve systeme:
  - T1 `status=clarifying`
  - `skill_result.reply` contient le fragment
  - no mutation intact
- Correction attendue: sanitizer toute clarification commencant par un fragment dependu d'une phrase supprimee; produire une question autonome.
- Statut: open
- Fix reference: a faire
- Tests requis:
  - clarification whole-plan avec phrase fragmentee -> sortie commence par `Peux-tu...` ou question autonome;
  - pas de suppression de clarifications valides.

### R4-B04 — Whole-plan garde une missing decision deja fournie

- Tours: whole-plan T2, T3
- Famille: `BF-INTAKE-01`
- Domaine owner: `adjust_plan_item`
- Source amont: handoff draft generation from coaching guidance, filtering `questions_to_clarify`
- Symptome visible: apres que le user donne les trois etapes actuelles et l'ordre cible, le handoff garde `Quelle est la liste complete des etapes actuelles...`.
- Preuve systeme:
  - T2 `status=handoff_delivered`, `readiness=draft_ready`
  - `handoff_draft.missing_decisions=["Quelle est la liste complète..."]`
  - T3 apply_attempt repete le meme point obsolete
- Correction attendue: si `readiness=draft_ready` et le message courant contient un ordre exploitable, ne pas recopier les `questions_to_clarify` obsoletes dans `missing_decisions`.
- Statut: open
- Fix reference: a faire
- Tests requis:
  - whole-plan reorder avec ordre actuel + ordre cible -> `missing_decisions=[]`;
  - whole-plan vraiment incomplet -> garde une clarification;
  - repeat/apply_attempt ne propagent pas de missing decision obsolete.

## Invariants Verifies

- 18 tours full AI locaux valides.
- `executed_tools=[]` sur tous les tours.
- `committed_effects=[]` sur tous les tours.
- `pending_confirmation=null` sur tous les tours.
- `ok applique` devient `apply_attempt`, sans execution.
- Les revisions R3 sont verifiees: plus de `avec cette contrainte : <message user>` dans action, niveau, whole-plan.
