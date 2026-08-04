# Run Bug Sheet - product_help_canonical_20260620_r1

## Metadata

- Date: 2026-06-20
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-20-product-help-canonical-r1.md`
- Run id: `product_help_canonical_20260620_r1`
- Persona / scenario: Product Help canonical local run
- Verdict run: red
- Validite QA: valide
- Agent owner: Sophia Brain local dispatchers / active skill runtime

## Synthese

- Familles dominantes: `BF-ROUTE-02`, `BF-ROUTE-03`, `BF-STATE-01`, `BF-TEST-01`
- Bug le plus bloquant: `coaching_recommendation` reste active et capture des questions Product Help explicites apres des sorties declarees.
- Fix architectural prioritaire: aligner `skill_run.status=exit` / `stop` avec la mutation persistante de `__active_skill_state`, et verifier l'arbitrage Product Help vs coaching recommendation sur les follow-ups produit.
- Rerun requis: oui.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PH-CANON-R1-B01` | T2 | `BF-ROUTE-03` | global dispatcher / product vs coaching arbitration | Product Help / coaching recommendation priority | Une suite produit "lequel ?" ouvre une clarification coaching. | `response_owner=coaching_recommendation`, `reason_code=coaching_recommendation_signal`, alors que T1 etait `product_help`. | Garder les follow-ups produit dans Product Help ou produire une recommandation produit sans ouvrir un flow durable si l'intention est comparative. | `open` |  | positif + paraphrase "sans modifier mon plan", anti-FP vraie demande coaching. |
| `PH-CANON-R1-B02` | T3-T6 | `BF-ROUTE-02` | active flow policy / local flow runtime | Active ownership stale apres exit | Des questions "Question produit" restent interceptees par `coaching_recommendation`. | T3/T4/T5: `skill_run.status=exit`, `exit_target=global`; T6: `reason_code=active_coaching_recommendation`. DB apres T6: `__active_skill_state.status=active`, `skill_id=coaching_recommendation`. | Quand un local flow sort ou stoppe, le reducer/runtime doit clear/suspendre l'active state selon la transition. Le prochain tour produit doit etre re-arbitre normalement. | `open` |  | test integration: exit local puis question product_help; stop explicite puis question product_help; anti-FP continuation coaching conserve ownership. |
| `PH-CANON-R1-B03` | T5-T6 | `BF-STATE-01` | `coaching_recommendation` reducer / active skill persistence | Mutation de state non appliquee ou non preservee correctement | "Stop, revenir a zero" semble accepte mais l'ancien flow reste actif. | Snapshot DB: `temp_memory.__active_skill_state.status=active`, `skill_id=coaching_recommendation` apres T6. | Le stop local doit clear le pending/active local state ou le marquer clos. La correction naturelle du user doit rester possible sans capture. | `open` |  | test unitaire reducer stop; test runtime user_chat_states apres stop; ancien state compatible. |
| `PH-CANON-R1-B04` | Post-run | `BF-TEST-01` | observability / trace persistence | `conversation_turn_traces` local | Les traces endpoint existent mais ne sont pas recuperables via table REST pour ce user. | REST `conversation_turn_traces?...limit=6` retourne `[]`; select `effect_ledger` retourne `400 column conversation_turn_traces.effect_ledger does not exist`. | Documenter la source canonique des traces locales ou restaurer la persistence interrogeable par `user_id` / `turn_id`; exposer les champs courts utiles sans JSON brut. | `open` |  | smoke local: un tour IA reel -> trace endpoint + trace persistable ou doc officielle du remplacement. |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-20 | Classer le run red malgre T1 green. | Le probleme principal est cross-turn: Product Help devient inaccessible apres capture par un flow actif stale. | Sophia Brain runtime | `2026-06-20-product-help-canonical-r1.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-20 | `PH-CANON-R1-B01` | Run local T2 | Failed / open | Raw `product_help_canonical_20260620_r1.t02.raw.json` |
| 2026-06-20 | `PH-CANON-R1-B02` | Run local T3-T6 + DB snapshot | Failed / open | `product_help_canonical_20260620_r1.db_after_t06.json` |
| 2026-06-20 | `PH-CANON-R1-B03` | Stop T5 + question produit T6 | Failed / open | Raw T5/T6 |
| 2026-06-20 | `PH-CANON-R1-B04` | REST trace lookup | Failed / open | `product_help_canonical_20260620_r1.traces_after_t06.json` |
