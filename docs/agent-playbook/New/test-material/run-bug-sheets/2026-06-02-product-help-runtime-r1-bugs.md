# Run Bug Sheet - product-help-runtime-r1

## Metadata

- Date: 2026-06-02
- Run report:
  `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-product-help-runtime-r1.md`
- Run id: `product-help-runtime-r1`
- Persona / scenario: `qa-skill`, connexion temporaire
  `product_help_product_help_20260602_r1`
- Verdict run: red
- Validite QA: valide, run IA reel local via `/functions/v1/test-send-message`
  avec `force_full_ai=true`
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-ROUTE-03`, `BF-ROUTE-02`, `BF-INTAKE-03`
- Bug le plus bloquant: les questions Product Help non-mutantes sont admises
  comme handoffs/tool skills (`adjust_plan_item`, `prepare_attack_card`,
  `one_shot_reminder`)
- Fix architectural prioritaire: renforcer arbitration product/tool et guards
  d'admission tool selon le contrat `product_help`
- Rerun requis: oui, meme trajectoire avec paraphrases Plan, cartes et "ou
  retrouver"

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PH-R1-B01` | T1 | `BF-ROUTE-03` | TurnAgenda / route arbitration + `adjust_plan_item` | Product/tool priority sur demandes "ou/comment dans l'app" | Sophia demande une clarification d'ajustement au lieu d'expliquer ou consulter le Plan | `response_owner=tool_skill`, `selected_handler=adjust_plan_item`, platform handoff delivered, `executed_tools=[]` | Router les questions de destination UI vers `product_help`, sauf commande explicite de modification | `open` |  | positif Plan navigation + paraphrase "ou modifier dans l'app" + anti-FP vraie demande d'ajustement |
| `PH-R1-B02` | T2 | `BF-ROUTE-02` | Active flow arbitration / interruption policy | Ancien flow `adjust_plan_item` capture la correction "pas modifier" | Sophia redemande un nom de vue au lieu de repondre a la consultation | `route_reason=product_help_inline_resume_active_tool_skill`, `selected_handler=adjust_plan_item` | Une negation/correction produit doit interrompre le handoff actif et rerouter vers `product_help` | `open` |  | test active handoff: "pas modifier, juste consulter" sort du flow; anti-FP "ok modifie cette mission" reste tool |
| `PH-R1-B03` | T4 | `BF-INTAKE-03` | `prepare_attack_card` intake + product/tool arbitration | Contrainte "sans en creer une" ignoree sur question comparative cartes | Sophia produit un brouillon de carte d'attaque et une destination plateforme | `response_owner=tool_skill`, `selected_handler=prepare_attack_card`, `route_reason=prepare_attack_card_interrupts_active_handoff`, platform handoff delivered | Classer "distinguer carte attaque/defense sans creer" en `product_help.compare_features`; tool seulement pour demande de preparation explicite | `open` |  | positif compare cards no-create + paraphrase + anti-FP vraie demande "prepare-moi une carte" |
| `PH-R1-B04` | T5 | `BF-ROUTE-03` | Product/tool arbitration + `one_shot_reminder` route guards | "retrouve une carte" capture par reminder | Sophia demande le moment exact pour programmer un rappel | `selected_handler=create_one_shot_reminder`, `route_reason=skill_entry_signal`, ledger `one_shot_reminder.create` requested then blocked `missing_time` | Exclure reminder quand le message demande ou retrouver un objet carte et ne contient aucune intention temporelle | `open` |  | positif "ou retrouver une carte" + paraphrase; anti-FP "rappelle-moi de regarder ma carte demain" |
| `PH-R1-B05` | T5 | `BF-EFFECT-01` | Effect admission / `one_shot_reminder` executor gate | Effet durable demande par mauvais domaine avant blocage | Le ledger demande `one_shot_reminder.create` alors que le user demande une localisation produit | ledger `requested=1`, `blocked=1`, `source=executor`, `reason_code=missing_time` | Ne pas construire de requested durable effect tant que l'admission tool n'a pas prouve une intention de rappel | `open` |  | EffectLedger invariant: question Product Help ne cree aucun requested/allowed effect |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | Classer le run en red malgre absence de commit DB | Les mauvais owners et requested effect suffisent a invalider l'experience Product Help | QA | Rapport `product-help-runtime-r1` |
| 2026-06-02 | Ne pas proposer de patch de wording | Le contrat `product_help` impose une correction en amont sur arbitration/intake/effect admission | Runtime owners | `product-help.md`, charte anti-patching |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | Tous | Run initial IA reel local | Reproduit / open | Rapport `product-help-runtime-r1` |
