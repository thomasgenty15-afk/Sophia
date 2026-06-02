# Bug Sheet — Clarification Skills 3 Runs

Cadre: Supabase local, `/functions/v1/test-send-message`,
`force_full_ai=true`, users QA temporaires, cleanup ciblé effectué.

Rapport:
`docs/agent-playbook/New/test-material/qa-run-reports/2026-06-01-clarification-skills-3runs.md`

## CSR3-20260601-B01 — 502 Initial Sans Trace Exploitable

- Bug id: `CSR3-20260601-B01`
- Tours: `clarification-skills-3runs-20260601-r1-product-action` Tour 1.
- Famille: `BF-TEST-01` — trace/test incohérent ou suite malsaine.
- Domaine owner: testability / Edge runtime.
- Source amont: runtime Edge ou appel IA upstream.
- Symptome visible: réponse vide, HTTP 502.
- Preuve systeme:
  - `http_status=502`
  - raw error `An invalid response was received from the upstream server`
  - pas de `response_owner`, pas de `selected_handler`, pas de trace métier.
- Correction attendue: exposer une erreur locale exploitable ou stabiliser le
  runtime Edge; ne pas compter la tentative comme run QA valide.
- Statut: `open`.
- Fix reference: aucun.
- Tests requis: rerun local avec trace d'erreur exploitable ou HTTP 200. Le
  retry R1b a validé le scénario produit, mais pas la cause du 502.

## CSR3-20260601-B02 — Découpage Action Vs Ajustement Plan Non Clarifié

- Bug id: `CSR3-20260601-B02`
- Tours: `clarification-skills-3runs-20260601-r2-execution-adjust` Tour 1.
- Famille: `BF-INTAKE-04` — ambiguïté non reconnue.
- Domaine owner: dispatcher L1 + clarification arbitration.
- Source amont: `TurnFrame` marque `adjust_plan_item` confidence high et
  `ambiguity=none` malgré un signal concurrent `execution_breakdown`.
- Symptome visible: Sophia demande une clarification de scope d'ajustement
  après avoir déjà engagé `adjust_plan_item`, au lieu de demander découpage vs
  changement de plan.
- Preuve systeme:
  - `response_owner=tool_skill`
  - `selected_handler=adjust_plan_item`
  - `route_reason=tool_skill_intent_start`
  - `skill_signals.execution_breakdown.detected=true`
  - `tool_skill_intents[0].operation_type=adjust_plan_item`
  - `tool_execution=platform_handoff`
  - `__clarification_state_v1` absent.
- Correction attendue: produire des candidats concurrents
  `execution_breakdown` et `adjust_plan_handoff` depuis le `TurnFrame`, puis
  router vers `orientation_clarification` avec `tool_skill_router` bloqué.
- Statut: `verified`.
- Fix reference:
  - `clarification_candidate_builder.ts`: clarification sur signaux concurrents
    `execution_breakdown` + `adjust_plan_item`.
  - `operation_runtime_pipeline.ts`: garde bloquant tout runtime tool quand
    `clarification_required` est présent.
  - Tests unitaires:
    `clarification_candidate_builder: execution_breakdown + adjust_plan_item demande clarification`,
    `operation_runtime_pipeline blocks tool runtime when clarification is required`.
  - Run réel vérifié:
    `clarification-skills-fix-20260601-r2c-execution-adjust`.
- Tests requis:
  - unit builder: signal `execution_breakdown` + intent `adjust_plan_item` ->
    candidats de clarification. Fait.
  - unit arbitrator: output ask -> owner `orientation_clarification`, aucun
    tool skill. Couvert par arbitrator générique.
  - run réel: phrase paraphrasée "découper ou changer le plan" ->
    clarification state présent, aucun `platform_handoff`. Fait.

### Vérification

- `response_owner=orientation_clarification`
- `selected_handler=orientation_clarification`
- `route_reason=clarification_required`
- candidats `adjust_plan_item`, `execution_breakdown`
- `tool_execution=none`
- `no_chat_mutation=true`

## CSR3-20260601-B03 — Émotion/Potion/Micro-Action Aplatie En Tool Skill

- Bug id: `CSR3-20260601-B03`
- Tours: `clarification-skills-3runs-20260601-r3-emotion-potion-action`
  Tour 1.
- Famille: `BF-INTAKE-04` — ambiguïté non reconnue.
- Domaine owner: dispatcher L1 + tool skill arbitration + clarification
  candidate builder.
- Source amont: intention composite avec trois options concurrentes aplatie vers
  tool skill; incohérence trace entre `selected_handler=select_state_potion` et
  `tool_skill_intents=adjust_plan_item`.
- Symptome visible: Sophia ignore "être écouté" et pose une question interne à
  la potion.
- Preuve systeme:
  - `response_owner=tool_skill`
  - `selected_handler=select_state_potion`
  - `route_reason=tool_skill_intent_start`
  - `skill_signals.execution_breakdown.detected=true`
  - `tool_skill_intents[0].operation_type=adjust_plan_item`
  - `tool_execution=platform_handoff`
  - `__clarification_state_v1` absent.
- Correction attendue: construire des candidats `emotional_repair`,
  `state_potion_handoff`, `execution_breakdown` et demander clarification avant
  tout démarrage de `select_state_potion`.
- Statut: `fixed`.
- Fix reference:
  - `clarification_candidate_builder.ts`: familles candidates
    `emotional_repair` / `execution_breakdown` / `select_state_potion`.
  - `operation_runtime_pipeline.ts`: garde bloquant le handoff potion si la
    route est déjà en clarification.
  - `dispatcher.prompts.ts`: consignes explicites pour ne pas aplatir
    "être écouté / potion / petite action" en potion ou adjust plan.
  - Tests unitaires:
    `clarification_candidate_builder: emotional_repair + state potion + execution demande clarification`,
    `operation_runtime_pipeline blocks tool runtime when clarification is required`.
  - Runs réels:
    `clarification-skills-fix-20260601-r3b-emotion-potion-action`,
    `clarification-skills-fix-20260601-r3c-emotion-potion-action`,
    `clarification-skills-fix-20260601-r3d-emotion-potion-action`.
- Tests requis:
  - unit builder: émotion + potion + micro-action -> candidates clarification.
    Fait.
  - unit arbitrator: tool skills bloqués quand clarification demandée.
    Couvert par arbitrator + pipeline.
  - run réel: paraphrase émotion/potion/action -> question unique entre les
    options, state clarification présent, aucun `platform_handoff`. Partiel:
    aucun `platform_handoff` et state clarification présent sont vérifiés; le
    modèle expose encore parfois `adjust_plan_item` au lieu de
    `select_state_potion`, donc le wording reste à surveiller.

### Vérification

- `response_owner=orientation_clarification`
- `selected_handler=orientation_clarification`
- `route_reason=clarification_required`
- `tool_execution=none`
- `no_chat_mutation=true`
- Warning restant: le dernier run R3d pose une question utilisable entre
  apaisement et petite action, mais le state ne contient pas encore
  `select_state_potion`; il contient `emotional_repair`,
  `execution_breakdown`, `adjust_plan_item`.
