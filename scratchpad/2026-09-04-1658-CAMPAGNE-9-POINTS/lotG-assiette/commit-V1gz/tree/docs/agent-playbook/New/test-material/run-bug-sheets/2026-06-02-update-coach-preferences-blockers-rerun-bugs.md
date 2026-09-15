# Run Bug Sheet - Update Coach Preferences Blockers Rerun

## Metadata

- Date: 2026-06-02
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-update-coach-preferences-blockers-rerun.md`
- Run id: `qa-coach-pref-blockers-1780401830172`
- Persona / scenario: users QA temporaires locaux; attack / recurring / defense interrompus par preference coach puis repris
- Verdict run: yellow
- Validite QA: valide comme rerun cible de non-regression; limite: scenarios prepares pour blockers connus
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-STATE-01`
- Bug le plus bloquant: reprise du rappel recurrent encore trop prudente apres interruption par preference coach
- Fix architectural prioritaire: restaurer le handoff recurrent suspendu et rendre directement le `repeat_handoff` quand la reprise est non ambigue
- Rerun requis: oui, un rerun cible recurring apres correction

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BLOCKERS-RERUN-B01` | Recurring T3 | `BF-STATE-01` | active handoff state / `create_recurring_reminder` router | reprise d'un handoff recurrent suspendu apres interruption preference | "Reprends le rappel recurrent d'avant" demande si le user veut les details ou modifier, au lieu de redonner directement lundi 09:00 | `selected_handler=create_recurring_reminder`, `route_reason=create_recurring_reminder_interrupts_active_handoff`, `executed_tools=[]`, `committed_effects=[]` | Restaurer le draft/handoff recurrent suspendu et traiter la reprise explicite comme `repeat_handoff` quand le contexte est univoque | `open` |  | positif repeat apres preference; paraphrases "redis-moi le rappel du lundi"; anti-FP "modifie le rappel"; invariant no-mutation |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | Classer la reprise rappel en `BF-STATE-01` plutot qu'en route | Le bon owner est selectionne; le probleme restant est la transition/restitution du handoff precedent | Codex | report blockers rerun |
| 2026-06-02 | Garder le run en yellow malgre les corrections attack/defense | Un tour recurring reste frictionnel et demande une clarification inutile | Codex | Recurring T3 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | anciens blockers attack | Demande carte d'attaque -> preference coach -> reprise carte | verified green | report Attack T1-T3 |
| 2026-06-02 | ancien blocker status recurrent | Demande rappel recurrent initiale | verified green: `create_recurring_reminder`, no status recap | report Recurring T1 |
| 2026-06-02 | ancien blocker defense preference | Defense handoff -> preference coach -> reprise defense | verified green | report Defense T1-T3 |
| 2026-06-02 | invariant no-mutation | Tous les tours | verified green: `executed_tools=[]`, `committed_effects=[]`, `pending_confirmation=null` | report sections 2/4 |
