# Run Bug Sheet - 2026-06-12-safety-crisis-local-r3

## Metadata

- Date: 2026-06-12
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-safety-crisis-local-r3-reminder-rerun.md`
- Run id: `2026-06-12-safety-crisis-local-r3`
- Persona / scenario: `qa-skill` / safety crisis local + explicit one-shot reminder
- Verdict run: `yellow`
- Validite QA: valide avec incident runtime documente
- Agent owner: Codex
- Cleanup: execute sans erreur apres verification DB

## Synthese

- Familles dominantes: `BF-EFFECT-04`, `BF-LEDGER-02`, `BF-SAFETY-01`
- Bug le plus bloquant: T4 HTTP 502 sur premiere demande explicite de rappel depuis safety.
- Fix architectural prioritaire: stabiliser le chemin `safety_crisis` -> direct effect `create_one_shot_reminder` -> operation runtime -> final response, avec trace d'erreur exploitable.
- Rerun requis: oui, rerun conversationnel reel sans retry attendu.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R3-B01` | T4 | `BF-EFFECT-04` | `create_one_shot_reminder` / operation runtime | Direct effect execution or final response pipeline from `safety_crisis_create_one_shot_reminder_direct_effect` | Gateway 502 au moment exact ou le user demande un rappel dans 30 minutes | `http_status=502`, trace null, no selected_handler, no executed_tools, DB `scheduled_checkins` empty before retry | Identifier l'exception runtime, la rendre observable dans trace/logs, et stabiliser le chemin direct effect sans fallback visible | `open` |  | positif safety+reminder sans retry + paraphrase + anti-FP no explicit reminder |
| `R3-B02` | T5 | `BF-LEDGER-02` | one-shot reminder response handler / effect ledger projection | Post-commit final response and QA trace projection | Rappel cree mais reponse trop operationnelle pour un contexte safety, et `durable_effect=[]` malgre commit DB | `executed_tools=["create_one_shot_reminder"]`; DB row `971355bb-e84f-486a-a010-9ccac938f7d3` pending; short trace durable empty | Rendre le succes de rappel avec contexte parent safety minimal et exposer le commit dans la trace/effect ledger | `open` |  | integration DB row + trace contains durable effect or ledger reference + continuation safety |
| `R3-B03` | T3 | `BF-SAFETY-01` | `safety_crisis` visible stage | Safety visible prompt quality constraints | Faute visible "anti-pani que" dans une consigne sensible | Assistant T3 contient "Respiration anti-pani que" | Renforcer les contraintes de generation du stage safety sans renderer deterministe ni correction par regex | `open` |  | prompt-stage smoke with short safety grounding, no malformed key terms |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-12 | Garder le verdict global en `yellow` malgre le succes DB apres retry | Le chemin produit l'effet attendu, mais un 502 sur la premiere demande explicite n'est pas acceptable en crise | QA | run report |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-12 | `R3-B02` | Lecture REST locale `scheduled_checkins` limitee au user QA | Commit DB confirme, trace durable incomplete | run report T5 |
