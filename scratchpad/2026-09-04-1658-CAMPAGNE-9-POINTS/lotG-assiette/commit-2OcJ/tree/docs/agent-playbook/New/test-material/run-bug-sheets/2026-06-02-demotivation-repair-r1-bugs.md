# Run Bug Sheet - demotivation_repair_20260602_r1

## Metadata

- Date: 2026-06-02
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-demotivation-repair-r1.md`
- Run id: `demotivation_repair_20260602_r1`
- Persona / scenario: `qa-skill` / `demotivation_repair`
- Verdict run: red
- Validite QA: valide, IA reelle locale, `/functions/v1/test-send-message`, `force_full_ai=true`
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-AGENDA-02`, `BF-INTAKE-01`, `BF-INTAKE-03`
- Bug le plus bloquant: `no_potion` / `no_tool` ne bloque pas la capture visible par `select_state_potion`.
- Fix architectural prioritaire: propager les contraintes explicites de `demotivation_repair` dans TurnAgenda / orientation clarification / tool skill arbitration.
- Rerun requis: oui, run IA reel local avec paraphrases de refus potion/outil et demande de micro-tache.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DR-R1-B01` | T2, T5 | `BF-AGENDA-02` | TurnAgenda / orientation clarification / tool skill arbitration | Hard negatives `no_potion` / `no_tool` non restaures en owner conversationnel | Sophia parle de potion alors que l'utilisateur l'exclut explicitement et demande une reponse conversationnelle ou une micro-tache | T2 et T5: `response_owner=tool_skill`, `selected_handler=select_state_potion`, `tool_execution=blocked`, `executed_tools=[]` | Faire de `no_potion` et `no_tool` des contraintes cross-owner persistantes pendant le flow; restaurer `demotivation_repair` ou handoff `execution_breakdown`, jamais `select_state_potion` | `open` |  | positif: refus explicite potion; paraphrase: "pas de mode/pas de plateforme"; anti-FP: demande explicite de potion doit rester possible; integration: run IA reel |
| `DR-R1-B02` | T3 | `BF-INTAKE-01` | `demotivation_repair` context/intake ou state recovery | Slot "c'est l'ensemble" perdu apres interruption tool skill | Sophia repete presque exactement T1 et redemande si c'est une tache precise ou l'ensemble | T3: `selected_handler=demotivation_repair`, `reason_code=active_conversation_skill_continue`, reponse identique a T1 malgre T2 | Conserver les slots et contraintes deja fournis apres correction d'une interruption; adapter la reponse au contexte recent | `open` |  | positif: correction "pas potion" puis suite demotivation; paraphrase: "je viens de te dire"; anti-FP: vraie ambiguite nouvelle peut clarifier |
| `DR-R1-B03` | T4 | `BF-INTAKE-03` | orientation clarification / TurnAgenda | Contrainte explicite `no_questions` / `concrete_before_question` perdue | Sophia demande de choisir entre deux options alors que l'utilisateur demande un seul geste sans nouvelle question | T4: `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `reason_code=clarification_required` | Quand le user demande "choisis pour moi / sans question", rendre un micro-geste conservateur au lieu d'ouvrir une clarification binaire | `open` |  | positif: demande de plus petit geste sans question; paraphrase: "decide pour moi"; anti-FP: clarification autorisee quand aucun geste possible |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | Classer le probleme principal en `BF-AGENDA-02` plutot qu'en simple bug renderer | Le renderer affiche une reponse coherentement potion, mais le mauvais owner a pris la main malgre une interruption explicite | TurnAgenda / arbitration | `2026-06-02-demotivation-repair-r1.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | `DR-R1-B01` | Run IA reel local, T2/T5 | fail observe | `tmp/demotivation_repair_20260602_r1/turn-02.json`, `turn-05.json` |
| 2026-06-02 | `DR-R1-B02` | Run IA reel local, T3 | fail observe | `tmp/demotivation_repair_20260602_r1/turn-03.json` |
| 2026-06-02 | `DR-R1-B03` | Run IA reel local, T4 | fail observe | `tmp/demotivation_repair_20260602_r1/turn-04.json` |
