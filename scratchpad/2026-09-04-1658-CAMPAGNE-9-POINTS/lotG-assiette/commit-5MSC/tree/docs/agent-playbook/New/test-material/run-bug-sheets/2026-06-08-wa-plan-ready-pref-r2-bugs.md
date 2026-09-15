# Run Bug Sheet - wa-plan-ready-pref-r2

## Metadata

- Date: 2026-06-08
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-wa-plan-ready-pref-r2.md`
- Run id: `20260608_wa_plan_ready_pref_r2`
- Persona / scenario: temporary local WhatsApp QA user / plan active after onboarding-completed profile, `awaiting_plan_finalization`, missing WhatsApp preference marker
- Verdict run: red
- Validite QA: valide pour WhatsApp webhook local loopback, IA reelle Sophia, tour par tour, no deterministic fallback
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-ROUTE-01`, `BF-EFFECT-01`, `BF-STATE-01`, `BF-LEDGER-02`
- Point positif verifie: le state reprend bien le flow WhatsApp preferences (`awaiting_plan_finalization` -> `onboarding_pref_tone`) et finit par poser `__whatsapp_onboarding_done`.
- Bug le plus bloquant: T2 accepted HTTP 200 but no assistant response, no trace, no state transition.
- Fix architectural prioritaire: make WhatsApp onboarding states exclusive and observable; one accepted inbound in an onboarding state must produce exactly one assistant response or an explicit error trace.
- Rerun requis: same scenario with paraphrase "j'ai fini le plan" then tone answer; verify no plan progress commit, no silent turn, final marker set.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R2-B01` | T1 | `BF-ROUTE-01` + `BF-EFFECT-01` | `whatsapp-webhook` + tool skill arbitration | `awaiting_plan_finalization` resume admission before global tool skills | Sophia dit "Note pour Lister 5 contacts professionnels: fait" alors que le user confirme la creation du plan | Trace T1: `response_owner=tool_skill`, `selected_handler=track_progress_plan_item`, `direct_effects_to_run=["track_progress_plan_item"]`; temp memory contains committed progress id | Le tour de finalisation plan doit etre consomme par l'onboarding WhatsApp; bloquer `track_progress_plan_item` et autres tool skills generaux sur ce message | `open` |  | positif: `"C'est fait"` resumes preferences; anti-FP: `"j'ai fait l'action X"` hors onboarding continue de logger progress; integration: no progress log on plan-finalization resume |
| `R2-B02` | T2 | `BF-STATE-01` | `whatsapp-webhook` state reducer / reply orchestration | `onboarding_pref_tone` next-turn handling | Le user repond au ton, HTTP 200, mais aucune reponse Sophia visible | DB after T2: new user message inserted; no assistant, no new `conversation_turn_traces`, `whatsapp_state=onboarding_pref_tone` | Garantir une transition atomique `onboarding_pref_tone` -> assistant response -> `onboarding_pref_challenge`; ecrire une trace d'erreur si le handler ne repond pas | `open` |  | positif: tone answer creates assistant and state transition; retry/paraphrase; anti-FP: duplicate inbound remains deduped with explicit trace |
| `R2-B03` | T3, T5 | `BF-LEDGER-02` | WhatsApp preference onboarding renderer | merge of `update_coach_preferences` platform handoff into onboarding response | Sophia dit d'aller dans les Preferences coach alors que le fact durable est deja persiste | T3 persists `coach.tone=warm_direct`; T5 persists `coach.question_tendency=low`; visible response says "Il ne manque plus qu'a aller..." | En contexte onboarding WhatsApp, render "c'est note" from the actual commit and suppress platform handoff copy when persistence succeeds | `open` |  | positif: persisted preference rendered as committed; anti-FP: standalone unsupported preference request can still route to platform handoff |
| `R2-B04` | T4 | `BF-INTAKE-05` | `update_coach_preferences` intake / canonical mapping | composite preference mapping | "Plutôt normal, direct seulement si je décroche vraiment" becomes `coach.challenge_level=high` | Durable fact T4: `coach.challenge_level=high`; reason says "je te challengerai davantage..." | Preserve primary value `normal` and conditional nuance, or ask clarification instead of flattening conditional directness to high challenge | `open` |  | positif: normal-with-condition maps to balanced/normal; paraphrase: "normal sauf quand je fuis"; anti-FP: explicit "challenge-moi fort" maps high |
| `R2-B05` | T7 | `BF-STATUS-01` | plan status renderer / normal reply context | plan item projection rendering | Sophia expose `(missions; task; one_shot_mission; status=active)` dans le message utilisateur | Visible T7 contains internal fields while onboarding marker is done | Render active plan item as user-facing sentence without internal metadata | `open` |  | positif: topic choice -> clean plan summary; anti-FP: debug metadata remains available only in traces/raw reports |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-08 | Marquer le run red malgre la cloture finale du flow | L'objectif state est atteint, mais T1 cree un effet durable non consenti et T2 reste sans reponse | `whatsapp-webhook` | Report T1/T2/T7 |
| 2026-06-08 | Classer le wording platform handoff en `BF-LEDGER-02` | Le probleme n'est pas seulement une phrase: le rendu contredit l'effet durable reel | preference onboarding renderer | Report T3/T5 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-08 | regression initiale | Real local WhatsApp webhook run reaches `onboarding_pref_tone`, then `__whatsapp_onboarding_done=true` by T7 | partially verified; state resumes and completes | `20260608_wa_plan_ready_pref_r2` |
| 2026-06-08 | `R2-B01`..`R2-B05` | Real local WhatsApp webhook run | open; reproduced in QA | Run report |
| 2026-06-08 | cleanup | REST read-only counts after targeted cleanup | all checked app tables count 0, including transformation by exact `cycle_id` | local verification after run |
