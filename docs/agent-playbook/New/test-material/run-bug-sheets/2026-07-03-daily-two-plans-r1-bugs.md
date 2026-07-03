# Run Bug Sheet - daily-2plans-20260703-r2

## Metadata

- Date: 2026-07-03
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-daily-two-plans-r1.md`
- Run id: `daily-2plans-20260703-r2`
- Persona / scenario: `qa-skill` (user temporaire cree de toutes pieces) / daily action review, 2 actions sur 2 plans distincts
- Verdict run: red
- Validite QA: valide (pending genere par le systeme, opening IA reelle, loopback WhatsApp reel, aucun ID/action/message hardcode)
- Agent owner: QA (Claude)

## Synthese

- Familles dominantes: BF-INTAKE-04 (ambiguite non reconnue), BF-EFFECT-01 (effet durable non consenti)
- Bug le plus bloquant: `R2-B01` — au tour de continuation post-daily, un enonce affectif est classe `track_progress` explicite `missed` et committe sans confirmation sur une action **deja `completed`** le meme jour (evidence durable contradictoire).
- Fix architectural prioritaire: durcir le seuil d'explicitness/confidence du direct-effect `track_progress` (no-op/clarification sur enonce de regret) + guard de contradiction/idempotence par `plan_item_id`+`local_date` dans l'effect admission gate.
- Rerun requis: oui apres fix (rejouer un tour de regret post-daily et verifier 0 effet + absence d'entry contradictoire).

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R2-B01` | T2 | `BF-INTAKE-04` (primaire) + `BF-EFFECT-01` | dispatcher direct-effect intake + `track_progress_plan_item` (`router_parallel_tracking_v2`) + effect admission gate / EffectLedger | Le classifieur direct-effect surcote `explicitness=explicit`/`confidence=high` sur "j'aurais bien voulu tenir les deux" (regret, pas report), selectionne la mauvaise cible (item matin), et l'effect gate admet l'ecriture sans confirmation ni verif d'evidence contradictoire | Aucun symptome dans le texte visible (reponse companion correcte); effet durable silencieux | `direct_effects: track_progress_plan_item status_hint=missed target=2b76667e(matin)`; ledger `requested/allowed/committed=1`; `user_plan_item_entries a035b9f9 skip/missed source=router_parallel_tracking_v2` sur item deja `completed` (entry `checkin/completed` daily meme jour, occurrence `done`) | (1) enonce affectif/regret sans action factuelle du jour -> pas de `track_progress` explicite (no-op/clarification); (2) guard: refuser un `track_progress` non confirme si une evidence opposee du meme `plan_item_id`+`local_date` est deja committee | `fixed` (rerun QA reel requis) | Prompt dispatcher regles 3g/3h (`dispatcher.prompts.ts`) + `payload_hint.correction` lu par l'intake (`intake.ts is_correction`) + guard deterministe `contradicts_same_day_evidence` (`router.ts`, check injecte `createTrackProgressSameDayEvidenceCheck` dans `db.ts`, cable dans `operation_runtime_pipeline.ts`), clarification `renderTrackProgressContradictionClarification` | positif (report reel -> effet) + paraphrase (regret -> 0 effet, contract test 3g) + anti-FP (correction explicite -> commit; missed bloque si completed meme item/jour) — verts dans `track_progress_plan_item_tool_test.ts` et `dispatcher_prompt_contract_test.ts` |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-03 | Ne pas corriger le code pendant le run (regle guidelines) ; bug documente pour fix amont | Interdiction de patch pendant la demande de run ; correction attendue au niveau contrat direct-effect/effect-gate, pas patch de phrase | QA | 14-qa-test-guidelines.md |
| 2026-07-03 | Coeur daily juge green (2 plans, opening IA, commit, ledger) ; red porte par l'effet parasite du tour de continuation | Separer la validite du domaine daily de la faille dispatcher/direct-effect surfacee ensuite | QA | daily-review.md |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-03 | R2-B01 | Snapshot DB post-tour 2: entries + occurrences + ledger | Confirme: 3e entry `missed` `router_parallel_tracking_v2` sur item matin deja `completed`; ledger `committed=1` sans `asked/blocked` | Rapport section 2 (Tour 2) |
| 2026-07-03 | R2-B01 | Tests d'invariant post-fix: `deno test track_progress_plan_item_tool_test.ts dispatcher_prompt_contract_test.ts` | 31 passed / 0 failed: contradiction -> `needs_clarify contradicts_same_day_evidence` + 0 write; correction explicite -> commit; regles 3g/3h presentes au prompt | Suites du tool + contract dispatcher |
| 2026-07-03 | R2-B01 | Rerun QA conversationnel reel (variante D-2plans.2, run `daily-2plans-20260703-r3`, chemin loopback WhatsApp, edge hot-reload) | VERT. T3 regret ("j'aurais aime reussir les deux"): `direct_effects=[]`, ledger vide, `entries_count` reste 2, aucune `router_parallel_tracking_v2` — fix corrige a la source (regle 3g). T4 correction explicite ("corrige, je l'ai pas faite"): dispatcher emet `payload_hint.correction=true`, guard bypasse, commit `missed` (ledger allowed=1/committed=1/blocked=0) — anti-FP OK. DB verifiee, cleanup complet. | Resolu (verifie en conditions reelles) |
