# Bug Sheet — demotivation_repair local doctrine R1

## R1-B01

- Bug id: R1-B01
- Tours: Tour 2
- Famille: BF-STATE-01 — Mauvaise transition de flow
- Domaine owner: `demotivation_repair`
- Source amont: local reducer / visible_task conversation_context
- Symptome visible: Sophia propose `Potion de clarté` et demande consentement.
- Preuve systeme: raw T2 `flow_action=potion_bridge_offer`, `reason_code=demotivation_repair_potion_bridge_blocked`, blocked effect `select_state_potion/bridge_not_mature`, `last_potion_bridge_offer=null`, `conversation_context.selected_candidate.potion=null`.
- Correction attendue: une offre visible de potion doit etre persistable et confirmable. Si le bridge est bloque, le visible doit rester en repair/clarification sans demander consentement.
- Statut: fixed, pending real-QA verification
- Fix reference: `supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts` blocks non-persistable `potion_bridge_offer` from visible consent and clears visible selected potion; unit test `demotivation_repair candidate potion is not a visible consent offer`.
- Tests requis:
  - reducer unit: `bridge_not_mature` never emits a consent visible task;
  - visible contract: `potion_bridge_offer` requires non-null selected candidate;
  - real QA: T2 visible offer implies `last_potion_bridge_offer.selected_potion`.

## R1-B02

- Bug id: R1-B02
- Tours: Tour 3
- Famille: BF-STATE-02 — Pending confirmation cible perdue
- Domaine owner: `demotivation_repair` local state / handoff bridge
- Source amont: missing persisted bridge offer after T2
- Symptome visible: user confirms the visible potion offer, but T3 is routed by `orientation_clarification_resolved_tool_skill` to `select_state_potion.clarte`, not by a demotivation local handoff.
- Preuve systeme: T3 `response_owner=tool_skill`, `selected_handler=select_state_potion.clarte`, `tool_execution=platform_handoff`; raw shows note information from orientation/select_state_potion path, while T2 state had `demotivation_repair_potion_handoff=null`.
- Correction attendue: confirmation must be consumed by active `demotivation_repair` local dispatcher when it follows a demotivation offer; target dispatcher receives demotivation-origin `note_information` and candidates.
- Statut: fixed, pending real-QA verification
- Fix reference: `supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts` now requires a matching `previous.last_potion_bridge_offer` before `confirm_potion_bridge` can hand off; unit test `demotivation_repair confirmation without persisted offer does not handoff`.
- Tests requis:
  - real QA confirmation after offer routes through active local flow;
  - trace contains demotivation-origin note_information;
  - no global/orientation supersede for the confirmation turn.

## R1-B03

- Bug id: R1-B03
- Tours: Tour 3
- Famille: BF-INTAKE-01 — Slot fourni mais redemande
- Domaine owner: `select_state_potion` bridge consumption, fed by `demotivation_repair`
- Source amont: missing/weak candidate handoff from demotivation flow
- Symptome visible: after user provides the anchor "recuperer de la marge et arreter de subir", `select_state_potion.clarte` asks why the link broke again.
- Preuve systeme: T3 visible asks for `plan_meaning_loss_reason`; operation flow status `clarifying`, field status `missing`, collected fields `{}`.
- Correction attendue: demotivation handoff should pass the provided meaning anchor as candidate/proposed field so target flow does not re-ask the same information.
- Statut: fixed, pending real-QA verification
- Fix reference: `supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts` dispatcher prompt now requires confirmation anchors to be copied into potion-targeted `prefill_candidates`; existing bridge tests verify candidate propagation to `select_state_potion`.
- Tests requis:
  - bridge context includes `plan_meaning_loss_reason` candidate from confirmation text;
  - target clarté subskill proposes/locks candidate instead of asking from scratch.

## R1-B04

- Bug id: R1-B04
- Tours: verification DB post-run
- Famille: BF-TEST-01 — Trace/test incoherent ou suite malsaine
- Domaine owner: QA runner
- Source amont: `tmp/qa-demotivation-repair-persona-turn.mjs` durable snapshot
- Symptome visible: snapshot durable partiel avec 400 sur `memory_items_recent`, `scheduled_checkins_recent`, `turn_summary_logs`.
- Preuve systeme: colonnes inexistantes dans les requetes QA: `memory_items.content`, `scheduled_checkins.type`, `turn_summary_logs.summary_type`.
- Correction attendue: aligner les projections DB du helper QA sur le schema local courant, sans modifier le runtime Sophia.
- Statut: fixed, pending real-QA verification
- Fix reference: `tmp/qa-demotivation-repair-persona-turn.mjs` durable snapshot projections now use current-schema `select=*` reads for the affected tables.
- Tests requis: rerun du helper sur un tour QA et durable snapshot sans 400.
