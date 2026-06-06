# Run Bug Sheet - clarte-real-r2

## Metadata

- Date: 2026-06-05
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-clarte-real-r2.md`
- Run id: `clarte-real-r2`
- Persona / scenario: temporary local QA auth user / select_state_potion clarté real IA
- Verdict run: red
- Validite QA: valid real IA local run, `/functions/v1/test-send-message`, `force_full_ai=true`
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-ROUTE-01`, `BF-LEDGER-01`, `BF-STATE-01`
- Bug le plus bloquant: une reponse au champ clarté actif peut etre capturee par `orientation_clarification`, ce qui casse la stabilisation naturelle.
- Fix architectural prioritaire: corriger la priorite active flow continuation, puis durcir le guard visible no-mutation selon l'EffectLedger.
- Rerun requis: yes, meme matrice N1/N2/N3 apres fix.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R2-B01` | N2 T2 | `BF-ROUTE-01` | Global dispatcher / active handoff arbitration | Active flow continuation policy for field answer | Sophia repond "Tu veux modifier la recommandation en cours, ou passer à une nouvelle demande ?" alors que le user repond a la question clarté. | `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `operation=null`, `tool_execution=none`, `route_reason=active_handoff_turn_unclear`, previous turn `tool_status=clarifying`. | Quand un active handoff vient de poser le champ clarté, une reponse semantiquement liee au plan/actions/sens doit rester chez `select_state_potion` et alimenter le reducer local. | `open` |  | Positif: apres question clarté, "je coche des cases..." reste `response_owner=tool_skill`. Paraphrase: reponse sans nommer potion reste dans le flow. Anti-FP: vrai changement de sujet sort vers dispatcher global. Integration: N2 stabilise en deux tours sans phrase "je reponds a la question". |
| `R2-B02` | N1 T2, N3 T2 | `BF-LEDGER-01` | Visible agent / final response guard | No-mutation lexical contract tied to EffectLedger | Sophia dit "sera enregistré" ou "sera déjà rempli" alors qu'aucun commit n'existe et que le chat ne peut pas remplir la plateforme. | `committed=0`, `executed_tools=[]`, N1 T2 `blocked=1`, N3 T2 `tool_execution=platform_handoff`, visible contains persistence/pre-fill claim. | Le visible handoff doit utiliser seulement des formulations de saisie manuelle quand `committed=0`: "tu peux mettre", "il faudra renseigner", "a recopier". Les claims passifs de sauvegarde/pre-remplissage doivent etre rejetes par le guard. | `open` |  | Positif: handoff stable sans commit utilise "tu peux mettre". Paraphrase: plusieurs sorties IA naturelles acceptables. Anti-FP: un vrai commit d'une autre operation peut dire "c'est enregistré" seulement si ledger commit existe. Integration: N1/N3 sans "sera enregistré/deja rempli". |
| `R2-B03` | N2 T4 | `BF-STATE-01` | Visible agent destination stage | Destination followup stage contract | Sophia donne le chemin puis ajoute "Tu la vois déjà dans la liste, oui ou non ?", ce qui cree un nouveau mini-flow non demande. | `route_reason=active_handoff_platform_destination_followup`, `operation=null`, `tool_execution=none`, `tool_status=null`, `committed=0`, visible asks extra yes/no. | Le stage `platform_destination_followup` doit etre court et terminal: chemin plateforme + eventuellement champ/valeur, sans nouvelle question ni confirmation. | `open` |  | Positif: "ou je la lance ?" renvoie seulement `État / Potions` + Potion de clarté. Paraphrase: "je la trouve ou ?" meme comportement. Anti-FP: si le user demande explicitement de l'aide pas a pas, Sophia peut proposer une question de navigation. Integration: N2 T4 destination short. |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | Classer le run global en red. | Un invariant structurant echoue: active field answer peut changer d'owner; le visible suggere aussi une persistance inexistante. | QA | `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-clarte-real-r2.md` |
| 2026-06-05 | Reclasser N1 T1 en green. | La demande initiale clarté est explicite, mais la raison reste assez large pour qu'une question de precision soit acceptable avant handoff. | QA / Product | Same report |
| 2026-06-05 | Classer les claims "sera enregistré/deja rempli" en `BF-LEDGER-01`. | Le ledger montre `committed=0`; le visible ne doit pas suggerer une persistance ou un pre-remplissage sans effet durable. | QA / runtime visible agent | Same report |
| 2026-06-05 | Ne pas classer N3 T1 comme bug. | Le user dit explicitement ne pas savoir quelle potion choisir; le router general peut clarifier entre besoins possibles avant `selected_potion=clarte`. | QA | Same report |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | all | Run IA reel local via `test-send-message`, user Auth temporaire verifie, `force_full_ai=true`, nettoyage cible en fin de run. | Red: N1 clarification initiale acceptable puis handoff avec claim de persistance; N2 demande une phrase meta pour recuperer le flow; N3 stabilise en 2 tours apres clarification router avec claim de pre-remplissage. | `tests/real-personas/qa-skill/runs/state_potion/2026-06-05-clarte-real-r2.summary.json` |
