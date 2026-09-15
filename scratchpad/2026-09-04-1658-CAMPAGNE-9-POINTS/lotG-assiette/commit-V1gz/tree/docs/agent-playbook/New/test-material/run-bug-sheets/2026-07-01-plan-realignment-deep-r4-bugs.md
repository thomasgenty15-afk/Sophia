# Run Bug Sheet - plan_realignment_deep_r4

## Metadata

- Date: 2026-07-01
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-01-plan-realignment-deep-r4.md`
- Run id: `plan_realignment_deep_r4`
- Persona / scenario: `qa-skill` / temporary connection `plan_realign_planrealign_r4_deep`
- Verdict run: `yellow`
- Validite QA: valide, IA reelle locale via `/functions/v1/test-send-message`, `force_full_ai=true`
- Agent owner: runtime trace / `plan_realignment`

## Synthese

- Familles dominantes: `BF-TEST-01`, `BF-STATE-01`
- Bug le plus bloquant: aucun cote UX; le plus important systemiquement est l'incoherence ledger du direct effect.
- Fix architectural prioritaire: rendre la trace canonique des direct effects transversaux fiable.
- Rerun requis: oui, rerun multi-intent rappel + plan_realignment apres correction.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PRD-R4-B01` | T1 | `BF-TEST-01` | runtime trace / effect ledger | final response trace + direct effect ledger adapter | Aucun symptome user; rappel confirme et cree. | `executed_tools=[create_one_shot_reminder]`, DB `scheduled_checkins.status=pending`, mais `effect_ledger.counts.committed=0`. | La trace canonique doit refleter le commit durable du rappel, ou exposer un champ canonique clair distinct du ledger. | `open` | a creer | test integration multi-intent direct effect + flow local; assertion DB row + ledger coherent |
| `PRD-R4-B02` | T3 | `BF-STATE-01` | `plan_realignment` / active flow runtime | active flow retention ou route trace | Aucun symptome user; reponse correcte. | T2/T4/T5: `active_plan_realignment`; T3: `plan_realignment_signal` avec `skill_signals.plan_realignment.detected=true` sur follow-up in-scope apres un `continue`. | Un follow-up in-scope apres `status=continue` doit rester route par `active_plan_realignment`; si le signal est injecte sans global LLM, la trace doit le distinguer clairement. | `open` | a creer | test runtime: plan_realignment continue -> follow-up emotionnel in-scope -> active owner conserve |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-01 | Garder le verdict UX green mais global yellow. | Les reponses Sophia sont bonnes; les problemes sont observabilite/transition runtime. | QA | `2026-07-01-plan-realignment-deep-r4.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-01 | `PRD-R4-B01` | Run reel local deep | `open` | `tmp/planrealign_r4deep_trace.json` |
| 2026-07-01 | `PRD-R4-B02` | Run reel local deep | `open` | `tmp/planrealign_r4deep_trace.json` |
