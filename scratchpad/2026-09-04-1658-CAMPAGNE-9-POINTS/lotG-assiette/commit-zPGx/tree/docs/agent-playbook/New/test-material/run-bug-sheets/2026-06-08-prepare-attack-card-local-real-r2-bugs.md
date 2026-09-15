# Bug Sheet — prepare_attack_card local real R2

## Run

- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-prepare-attack-card-local-real-r2.md`
- Runs: `prepare-attack-card-local-real-r2`, `prepare-attack-card-local-real-r2b`
- Persona: `qa-skill`
- Date: 2026-06-08

## R2-B01 — Exit local tombait dans local_runtime_null

- Status: fixed during run, verified in R2b
- Severity: red before fix
- Family: BF-ROUTE-02 — ancien flow capture une nouvelle intention
- Tours: R2-5 red, R2b-3 green
- Owner: `router/run.ts`
- Symptom: après un signal local `prepare_attack_card_local_exit_to_global_dispatcher`, le routeur mettait à jour la mémoire puis exécutait quand même le fallback `active_prepare_attack_card_local_runtime_null`.
- Root cause: absence de garde de contrôle de flux après les branches exit locales.
- Fix applied:
  - `continueToGlobalAfterLocalExit` ajouté aux branches actives `prepare_attack_card`, `prepare_defense_card`, `select_state_potion`.
  - `last_local_flow_exit` injecté dans `flow_state_context`.
  - mémo de sortie consommé en one-shot et supprimé de `temp_memory`.
  - raison `none` normalisée en `topic_change`.
- Verification:
  - R2b-3: `response_owner=normal_reply`, `selected_handler=null`, `tool_execution=none`.
  - R2b-4 DB: `has_active_attack=false`, `has_last_exit=false`.
  - `deno check` passe sur les fichiers runtime touchés.

## R2-B02 — Stage visible initial incohérent avec état locked

- Status: fixed, verified in R3
- Severity: yellow
- Family: BF-UX-01 — stage visible incohérent avec état structuré
- Tours: R2-1, R2b-1; fixed by R3-1
- Owner: `prepare_attack_card.local_dispatcher` / visible stage contract
- Symptom: le dispatcher local verrouille target et blocker, mais la tâche visible reste `ask_target`, ce qui fait redemander une cible déjà comprise.
- Root cause probable: le prompt/contrat local ne contraint pas assez le mapping état -> stage visible.
- Fix applied:
  - Invariant reducer: si `target_state.status=locked` et `blocker_state.status=locked`, `visible_task.kind=ask_target` est normalisé vers le stage cohérent.
  - Prompt local renforcé avec le mapping état -> stage.
- Verification:
  - Unit tests: target+blocker locked + technique non locked => `ask_or_confirm_technique`; target+blocker+technique locked + missing field => `ask_platform_field`.
  - R3-1: dispatcher decision `ask_target`, reducer reduced `ask_or_confirm_technique`, visible stage `ask_or_confirm_technique`; Sophia confirme la technique sans redemander la cible.

## R2-B03 — `apply_attempt` visible guard

- Status: fixed, verified
- Severity before fix: red in R1, green in R2
- Family: BF-STATE-01 — garde visible trop strict / contrat visible rejeté
- Tour: R2-4
- Owner: `prepare_attack_card.visible_agent`
- Symptom R1: le visible agent avait généré une réponse de non-création mais le garde exigeait une formulation trop spécifique.
- Fix applied: le garde accepte des variantes équivalentes à une frontière de chat/non-création, sans autoriser les claims de création.
- Verification:
  - R2-4: `visible_agent accepted=true`, `reason_code=apply_attempt_no_chat_mutation`, `blocked_effects=create_attack_card/chat_creation_disabled_platform_handoff`, `executed_tools=[]`, `committed_effects=[]`.
