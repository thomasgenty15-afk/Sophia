# Run Bug Sheet — Clarification Active Skills Real

## Metadata

- Date: 2026-06-01
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-01-clarification-active-skills-real.md`
- Run ids:
  - `clarification-active-skill-20260601-r1-execution`
  - `clarification-active-skill-20260601-r2-emotional`
  - `clarification-active-skill-20260601-r3-product`
- Persona / scenario: users QA temporaires avec `__active_skill_state` injecté.
- Verdict run: `red`
- Validite QA: valide, Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`.
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-ROUTE-01`
- Bug le plus bloquant: les clarifications internes à un flow actif sont encore démarrées avec `owner=dispatcher`.
- Fix architectural prioritaire: brancher `runSkillClarification` dans le runtime des conversation skills actifs avant que l'arbitrage dispatcher global ne possède la clarification.
- Rerun requis: oui, trois runs actifs `execution_breakdown`, `emotional_repair`, `product_help`.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CASR-20260601-B01` | R1 T1, R2 T1, R3 T1 | `BF-ROUTE-01` | active conversation skill runtime | Active skill clarification branch absent ou non prioritaire | Sophia pose une clarification, mais le skill actif ne possède pas l'ambiguïté | `__active_skill_state.skill_id` vaut `execution_breakdown` / `emotional_repair` / `product_help`, mais `__clarification_state_v1.owner=dispatcher` dans les trois runs | Ajouter une étape skill-interne qui construit les candidats du skill actif et appelle `runSkillClarification` avec `owner=<skill_id>`; garder `orientation_clarification` visible et aucun executor | `verified` | `clarification_candidate_builder.ts`, `clarification_arbitrator.ts`, `run.ts`; tests ciblés clarification; reruns `clarification-active-skill-fix2-20260601-*` | unit positif par skill actif + paraphrase + anti-FP single-signal; reruns réels avec `owner=<skill actif>` |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-01 | Classer rouge malgré questions visibles correctes | L'objectif demandé n'est pas seulement `orientation_clarification`; les skills doivent pouvoir appeler le tool quand l'ambiguïté est interne au flow | active conversation skill runtime | Rapport `2026-06-01-clarification-active-skills-real.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-01 | `CASR-20260601-B01` | 3 runs réels avec `__active_skill_state` injecté | `red`: `owner=dispatcher` dans les trois states | `clarification-active-skill-20260601-r1-execution`, `r2-emotional`, `r3-product` |
| 2026-06-01 | `CASR-20260601-B01` | 3 reruns réels après fix avec `__active_skill_state` injecté | `green` sur owner et side effects: owners `execution_breakdown`, `emotional_repair`, `product_help`; `tool_execution=none`; `executed_tools=[]`; `no_chat_mutation=true` | `clarification-active-skill-fix2-20260601-r1-execution`, `r2-emotional`, `r3-product` |
