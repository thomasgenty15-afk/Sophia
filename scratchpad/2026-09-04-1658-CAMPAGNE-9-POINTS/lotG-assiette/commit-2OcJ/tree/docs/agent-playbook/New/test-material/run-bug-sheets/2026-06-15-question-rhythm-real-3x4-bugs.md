# 2026-06-15 - Question Rhythm Real 3x4 Bugs

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-15-question-rhythm-real-3x4.md`

## Metadata

- Date: 2026-06-15
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-15-question-rhythm-real-3x4.md`
- Run id: `question-rhythm-real-20260615-r1`, `question-rhythm-real-20260615-r2`, `question-rhythm-real-20260615-r3`
- Persona / scenario: users temporaires locaux; preference `coach.question_tendency` low/high puis normal reply
- Verdict run: yellow
- Validite QA: valide; Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-STATE-02`, `BF-PREF-01`
- Bug le plus bloquant: `BF-PREF-01`, car il touche l'impact reel de la preference en conversation normale.
- Fix architectural prioritaire: renforcer le contrat runtime `companion_question_rhythm` pour appliquer strictement le budget `low`, puis corriger la consommation de confirmation cible dans `update_coach_preferences`.
- Rerun requis: oui, rejouer au moins R1/R2/R3 avec 4 tours chacun.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `QUESTION-RHYTHM-3X4-B01` | R1.2 | `BF-STATE-02` | `update_coach_preferences` | Confirmation Contract + reducer local du flow actif | Le user dit "Oui, confirme : fréquence de questions réduite", Sophia redemande la meme confirmation | `response_owner=tool_skill`, `route_reason=active_update_coach_preferences_local_dispatcher`, `executed_tools=[]`, write DB seulement au tour suivant | Une confirmation explicite qui contient l'accord et la valeur cible du pending doit consommer le pending et executer le write sans redemander | `open` |  | Positif: "Oui, confirme le niveau reduit"; paraphrase: "vas-y, mets-le en questions reduites"; anti-FP: "oui mais pas maintenant" ne commit pas; integration: pending actif -> single write |
| `QUESTION-RHYTHM-3X4-B02` | R2.3 | `BF-PREF-01` | `companion` normal reply | Preference runtime policy / guide `QUESTION RHYTHM` | Sous `question_tendency=low`, Sophia pose une question illustrative et une question finale dans le meme tour normal | DB `coach.question_tendency=low`; `response_owner=normal_reply`; temp_memory final `preference=low`, `recent_turns=[0,1,0]`; reponse R2.3 contient 2 points d'interrogation | Le mode `low` doit preferer des formulations declaratives, interdire les questions finales non necessaires et compter les questions imbriquees/exemples dans le budget | `open` |  | Positif: 4 tours normal reply low avec <=1 question utile; paraphrase: preference low issue de DB et runtime block; anti-FP: `high` continue a poser une question utile; integration: temp_memory recent_turns coherent |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-15 | Classer R1.2 en `BF-STATE-02` plutot que `BF-INTAKE-01` | Le slot etait connu et le probleme observe est la consommation du pending actif, pas l'extraction initiale | `update_coach_preferences` | R1.2 |
| 2026-06-15 | Classer R2.3 en `BF-PREF-01` | DB et routage sont corrects; l'ecart vient de l'application de la preference dans la reponse visible | `companion` | R2.3 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-15 | `QUESTION-RHYTHM-3X4-B01` | Run reel local R1 | `open`: confirmation non consommee a R1.2, consommee seulement a R1.3 | `2026-06-15-question-rhythm-real-3x4.md` |
| 2026-06-15 | `QUESTION-RHYTHM-3X4-B02` | Run reel local R2 | `open`: preference low active mais R2.3 contient 2 questions | `2026-06-15-question-rhythm-real-3x4.md` |
