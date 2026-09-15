# Run Bug Sheet - Rose Multi-Flow 2 R1

## Metadata

- Date: 2026-07-02
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-02-rose-multiflow2-r1.md`
- Run id: `2026-07-02-rose-multiflow2-r1`
- Persona / scenario: Rose, run global 15 tours, scope frais `qa-multiflow2-20260702-r1`
- Verdict run: yellow
- Validite QA: valide

## Synthese

- Familles dominantes: BF-TEST-01 (trace/EffectLedger), BF-INTAKE-04 (ambiguïté non reconnue)
- Bug le plus bloquant: aucun (pas de red) ; le plus notable est BF-TEST-01 car il casse la vérifiabilité QA du chemin track-progress.
- Fix architectural prioritaire: corriger le mapping `db_ref.table` de l'EffectLedger pour `track_progress_plan_item` (pointe vers une table inexistante `plan_item_progress_logs` au lieu de `user_plan_item_entries`).
- Rerun requis: non bloquant, mais un rerun ciblé sur l'ambiguïté référentielle (T11) et sur la formulation de lecture de plan (comparer avec `rose-multiflow-r1` T7) serait utile.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ROSE2-B01` | T2 | `BF-TEST-01` | EffectLedger / effect payload compiler | mapping tool→table non synchronisé pour `track_progress_plan_item` | Aucun visible côté user ; trace QA incohérente | `effect_ledger.entries[].db_ref.table = "plan_item_progress_logs"` (table absente du schéma) alors que l'écriture réelle est dans `user_plan_item_entries` (id `336ab5a0` confirmé en DB) | Corriger la constante de nom de table dans le compilateur EffectLedger pour ce tool | `fix_applied` | `effect_ledger_adapter.ts` : `plan_item_progress.track` → `user_plan_item_entries` (vestige `plan_item_progress_logs` supprimé) + fixture `effect_ledger.test.ts` alignée (et test `hasCommittedEffect` pré-cassé réparé au passage). | positif: `db_ref.table` correspond à une table réelle et à la bonne écriture ; paraphrase: reformuler la demande de tracking différemment, même vérification ; anti-FP: ne pas casser le `committed_id` déjà correct |
| `ROSE2-B02` | T11 | `BF-INTAKE-04` | Intake / résolveur de contexte conversationnel | Résolution de coréférence anaphorique priorise un sujet ancien (T5, mémoire) sur un sujet plus récent et saillant (T10, lapse) sans détection d'ambiguïté | « Tu peux me faire un truc pour ça ? » répond sur le déclencheur ex-partenaire (T5) au lieu du lapse fatigue (T10) | `memory_plan.response_intent=ambiguous_follow_up` mais aucune clarification demandée ; `effect_ledger` vide (pas d'effet, donc pas de red) | Sur ambiguïté référentielle réelle entre plusieurs sujets récents plausibles, poser une clarification courte avant de répondre | `fix_applied` (rerun requis) | Doctrine companion (CONTEXT_RULES) : follow-up ambigu entre plusieurs sujets récents ⇒ clarification d'une phrase au lieu de choisir ; sinon réponse directe (anti-faux-positif). Consomme le signal `ambiguous_follow_up` déjà émis par le dispatcher. Test « clarifies ambiguous follow-ups instead of guessing ». | positif: deux sujets récents plausibles ⇒ Sophia clarifie ; paraphrase: reformulation différente de la même ambiguïté ; anti-FP: référent unique et évident ⇒ pas de clarification superflue |
| `ROSE2-B03` | T6 | `a classifier` (proche `BF-STATE-03`) | product_help / vérification d'état avant réponse | Réponse à une question de localisation sans vérifier l'existence réelle de l'objet référencé (`cards_status`) | Confirme une navigation vers « la carte qu'on vient de faire » sans vérifier qu'elle existe (coïncidence: elle existait déjà pour un autre item, pas créée dans ce run) | Aucun tool `prepare_defense_card`/équivalent exécuté en T3/T4 (`executed_tools=[]`), donc aucune carte n'a été « faite » dans cette conversation ; réponse T6 ne corrige pas la présupposition | `product_help` doit vérifier l'état réel (`cards_status`) de l'objet référencé avant de répondre, et corriger la présupposition si l'objet n'existe pas encore | `open` | - | positif: objet référencé inexistant ⇒ Sophia corrige la présupposition ; paraphrase: autre objet produit (rappel, carte d'attaque) ; anti-FP: objet réellement existant ⇒ réponse directe sans friction |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-02 | Ne pas classer T5 (mémoire) comme bug malgré l'écart avec l'invariant documenté "pas d'écriture in-turn" | Le contenu capturé était factuellement correct et fidèle (memorizer async), aucun impact utilisateur négatif observé ; l'écart concerne la documentation/l'architecture attendue, pas un comportement visible cassé | QA | `2026-07-02-rose-multiflow2-r1.md` §4 |
| 2026-07-02 | Persona Nina/Paul écartés de ce run | Aucun plan actif en DB (0 lignes `user_plans_v2`), grounding impossible sans regénérer un plan complet (hors scope du run) | QA | `2026-07-02-rose-multiflow2-r1.md` §1 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-02 | `ROSE2-B01` | Query directe `user_plan_item_entries` par id committed | Confirmé : écriture réelle correcte, seule la trace `db_ref.table` est fausse | `2026-07-02-rose-multiflow2-r1.md` T2 |
| 2026-07-02 | `ROSE2-B03` | Query `user_plan_items` sur l'item lié à la carte mentionnée en T6/T14 | `cards_status=ready`, carte existait déjà avant ce run (pas créée par T3/T4) | `2026-07-02-rose-multiflow2-r1.md` T14 |
