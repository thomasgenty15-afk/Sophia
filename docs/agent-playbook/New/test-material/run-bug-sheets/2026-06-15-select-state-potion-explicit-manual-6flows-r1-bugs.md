# Run Bug Sheet - select-state-potion-explicit-manual-6flows-r1

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-15-select-state-potion-explicit-manual-6flows-r1.md`
- Run id: `select-state-potion-explicit-manual-6flows-r1`
- Persona / scenario: `qa-skill`, six manual local full-AI runs, one explicit request per potion flow.
- Statut global: `open`

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | Rappel T2/T4, Apaisement T2/T4 | `BF-INTAKE-02` | `select_state_potion` local subskills | Intake / field merge / handoff state | Des details utiles fournis par le user ne reapparaissent pas dans les champs a copier: rappel perd `marcher` et `18h45`; apaisement perd `machoire serree` et `souffle court`. | Handlers corrects, `tool_execution=platform_handoff`, DB non-mutante, mais le texte de handoff ne conserve pas les details. | Faire conserver les contraintes concretes et signaux corporels utiles par l'intake/reducer local avant renderer; pas de patch de phrase ni regex. | `open` |  | Positif rappel multi-geste + horaire; positif apaisement avec signaux corporels; reprise "seulement les champs" conserve les details; anti-FP detail inutile ne surcharge pas le champ. |
| `R1-B02` | Guerison T1 | `BF-INTAKE-02` | Direct effects extractor / TurnFrame | Extraction globale trop large | La reponse visible est correcte, mais la trace ajoute un direct effect `track_progress_plan_item` alors que le user demande une potion de guerison. | T1 `selected_handler=select_state_potion.guerison`, `direct_effects=[track_progress_plan_item target_status=missing]`, `executed_tools=[]`, DB 0 effet. | Distinguer un ratage raconte comme contexte emotionnel d'une demande explicite de tracking progression; bloquer l'effet structurel parasite sans toucher au sous-skill visible. | `open` |  | Positif "je veux une potion de guerison, j'ai abandonne hier" sans direct effect executable; paraphrase honte/ratage; anti-FP vraie demande "note que j'ai rate mon action" garde le chemin tracking. |

## Decisions

| Date | Decision | Rationale | Reference |
| --- | --- | --- | --- |
| 2026-06-15 | Ne pas classer l'absence de session/reminder/checkin comme bug pour ces runs. | `select_state_potion` est documente comme `platform_handoff_skill` non-mutant dans `00-architecture-doctrine.md`. Le succes attendu est un handoff produit, pas une activation chat. | Rapport R1, section Analyse Systeme |
| 2026-06-15 | Ne pas corriger pendant le run. | `14-qa-test-guidelines.md` interdit les corrections de code pendant une demande de run. | Demande utilisateur |

## Verifications

| Date | Bug id | Verification | Resultat | Artefact |
| --- | --- | --- | --- | --- |
| 2026-06-15 | `R1-B01` | Run IA reel local manuel, six flows, `force_full_ai=true`. | Bug observe, non corrige pendant le run. | `2026-06-15-select-state-potion-explicit-manual-6flows-r1.md` |
| 2026-06-15 | `R1-B02` | Trace courte Guerison T1. | Warning observe, non execute, DB intacte. | `2026-06-15-select-state-potion-explicit-manual-6flows-r1.md` |
