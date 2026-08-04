# Bug Sheet — Execution Breakdown Real R1

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-execution-breakdown-real-r1.md`
- Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`
- Persona / scenario: user QA temporaire `qa-skill`, action trop grosse a decouper
- Validite QA: valide, 4 tours HTTP 200, trace courte et DB inspectees

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `EXEC-BREAKDOWN-R1-B01` | T2-T3 | `BF-ROUTE-01` | dispatcher / active flow / `execution_breakdown` | resolution `orientation_clarification` vers conversation skill | Sophia aide au decoupage, mais le flow n'est pas possede par `execution_breakdown` | T2/T3 `response_owner=normal_reply`, `reason_code=orientation_clarification_resolved`, `skill_signals={}`, `agenda.owner=normal_reply`; `__clarification_state_v1.owner=dispatcher` | Quand le user choisit explicitement le candidat `execution_breakdown`, installer/reprendre l'etat actif du skill et router la suite vers cet owner | `verified` | `supabase/functions/sophia-brain/router/run.ts` ajoute le bridge `orientation_clarification_resolved_conversation_skill`; test `orientation clarification resolved to conversation skill resumes skill handler`; R2 reel verifie `response_owner=conversation_handler`, `selected_handler=execution_breakdown` | Positif: ambiguite `execution_breakdown` vs `adjust_plan_item`, choix "decouper" -> owner `execution_breakdown`; paraphrases "le rendre plus petit", "premiere micro-etape"; anti-FP: choix "changer mon planning" -> `adjust_plan_item`; integration locale `/test-send-message force_full_ai=true` passee pour le cas positif |
| `EXEC-BREAKDOWN-R1-B02` | T4 | `BF-LEDGER-01` | EffectLedger / final response pipeline / active flow state | guard `uncommitted_progress_track_claim` apres pseudo-confirmation non representee | Sophia repond "Je ne l'ai pas note." au lieu de poursuivre le decoupage apres "oui" | T4 `response_owner=normal_reply`; `skill_signals.lifecycle.execution_breakdown.detected=true`; `effect_ledger.blocked=1`, reason `uncommitted_progress_track_claim`; `pending_confirmation=null`; aucun commit DB | Si aucun commit n'existe, la reponse finale doit eviter tout claim "noté" et poursuivre sans effet durable; la continuation "oui" doit rester dans `execution_breakdown` | `open` | none | Positif: apres micro-etape, "oui" + risque de dispersion -> prochaine consigne sans claim durable; anti-FP: vraie demande "note-le" sans commit ne doit pas promettre; integration locale avec ledger inspecte |

## Verification Runs

| Date | Scope | Preuve | Verdict | Notes |
| --- | --- | --- | --- | --- |
| 2026-06-02 | R1 | `tmp/qa-execution-breakdown-20260602-r1/*.raw.json`, DB REST read on `chat_messages`, `scheduled_checkins`, `user_chat_states` | `red` | Aucun side effect durable; rupture conversationnelle au T4 |
| 2026-06-02 | R2 | `tmp/qa-execution-breakdown-20260602-r2/*.raw.json`, report `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-execution-breakdown-real-r2.md` | `red` | `EXEC-BREAKDOWN-R1-B01` verifie corrige; probleme restant de final response guard `uncommitted_plan_adjust_claim` |
