# Run Bug Sheet - demotivation_repair_20260602_r2

## Metadata

- Date: 2026-06-02
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-demotivation-repair-r2.md`
- Run id: `demotivation_repair_20260602_r2`
- Persona / scenario: `qa-skill` / `demotivation_repair`
- Verdict run: yellow/red
- Validite QA: valide, IA reelle locale, `/functions/v1/test-send-message`, `force_full_ai=true`
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-INTAKE-01`, `BF-LEDGER-01`
- Bug le plus bloquant: T4 remplace une demande de micro-action par une phrase de non-modification hors contexte.
- Fix architectural prioritaire: corriger le pipeline de clarification/final response sans ajouter de routing regex.
- Rerun requis: oui, apres correction, rejouer demande de micro-action non mutante + clarification resolue.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DR-R2-B01` | T2 | `BF-INTAKE-01` | clarification state / `demotivation_repair` context recovery | Slot de clarification resolu non consomme dans la reponse suivante | Sophia repose "premier geste ou apres quelques jours ?" juste apres la reponse "apres deux ou trois jours" | T2: `selected_handler=demotivation_repair`, `route_reason=orientation_clarification_resolved_conversation_skill`, `tool_skill_opportunity=none` | La clarification resolue doit alimenter le contexte du skill et bloquer la repetition de la meme question | `open` |  | positif: slot resolu; paraphrase: "je viens de repondre"; anti-FP: vraie nouvelle ambiguite peut clarifier |
| `DR-R2-B02` | T4 | `BF-LEDGER-01` | final response pipeline / EffectLedger guard | Guard de non-modification applique hors contexte non mutant | Sophia repond "Je ne l'ai pas modifié" au lieu du geste de 90 secondes demande | T4: `selected_handler=execution_breakdown`, `direct_effects=[]`, `executed_tools=[]`, reponse visible hors sujet | Le guard ledger/no-mutation ne doit pas remplacer la reponse conversationnelle si aucune mutation n'est demandee ou annoncee | `open` |  | positif: micro-action non mutante; paraphrase: "sans rien modifier"; anti-FP: vraie demande de mutation doit garder guard ledger |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | Ne pas classer R2 comme bug de dispatcher | Les traces montrent les bonnes intents high confidence; les erreurs sont post-dispatcher | QA | `2026-06-02-demotivation-repair-r2.md` |
| 2026-06-02 | Ne pas proposer de regex | La charte anti-patching interdit le routing metier par regex; les fixs attendus sont contrats/pipeline | QA | anti-patching QA charter |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | `DR-R2-B01` | Run IA reel local, T2 | fail observe | `tmp/demotivation_repair_20260602_r2/turn-02.json` |
| 2026-06-02 | `DR-R2-B02` | Run IA reel local, T4 | fail observe | `tmp/demotivation_repair_20260602_r2/turn-04.json` |
