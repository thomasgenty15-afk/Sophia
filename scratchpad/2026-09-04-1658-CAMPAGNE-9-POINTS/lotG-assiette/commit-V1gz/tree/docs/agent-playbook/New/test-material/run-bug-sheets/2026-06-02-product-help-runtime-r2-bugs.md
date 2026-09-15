# Run Bug Sheet - product-help-runtime-r2

## Metadata

- Date: 2026-06-02
- Run report:
  `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-product-help-runtime-r2.md`
- Run id: `product-help-runtime-r2`
- Persona / scenario: `qa-skill`, connexion temporaire
  `product_help_product_help_runtime_r2_20260602`
- Verdict run: yellow
- Validite QA: valide, run IA reel local via `/functions/v1/test-send-message`
  avec `force_full_ai=true`
- Agent owner: Codex

## Synthese

- Famille dominante: `BF-INTAKE-03`
- Amelioration vs R1: plus aucun mauvais owner operationnel sur les cinq tours.
  `adjust_plan_item`, `prepare_attack_card` et `create_one_shot_reminder` ne
  capturent pas le run.
- Bug restant: `product_help` choisit parfois la mauvaise fiche catalogue
  (`plan.clarifications`, `plan.missions`) au lieu de la cible demandee.
- Fix architectural prioritaire: ameliorer l'intake structure `product_help`
  pour les questions de localisation, comparaison multi-feature et correction
  de cible.
- Rerun requis: oui, meme famille avec paraphrases et anti-FP operations reelles.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PH-R2-B01` | T1-T2 | `BF-INTAKE-03` | `product_help` structured intake | Cible Plan/semaine active mappee sur `plan.clarifications` | Sophia repond "Clarifications" au lieu de la vue semaine active | `response_owner=product_help`, `selected_handler=product_help`, `feature_id=plan.clarifications`, `effect_ledger.requested=0` | Mapper les questions "ou consulter la semaine active / elements prevus" vers `dashboard.plan` ou feature semaine active | `open` |  | positif semaine active + paraphrase + anti-FP vraie demande de modification plan |
| `PH-R2-B02` | T2, T5 | `BF-INTAKE-03` | `product_help` structured intake | Correction de cible utilisateur ignoree | Sophia repete la meme mauvaise fiche apres "pas les clarifications" ou "pas la mission" | `product_help_signal.detected=true`, mauvais `feature_id` conserve | Le message courant corrige la cible produit precedente dans le skill | `open` |  | test correction cible intra-product_help + anti-FP clarification legitime |
| `PH-R2-B03` | T3 | `BF-INTAKE-03` | `product_help` structured intake | Comparaison multi-feature reduite a `resources.defense_card` | Sophia explique surtout la defense, pas la distinction attaque vs defense | `feature_id=resources.defense_card`, aucun `prepare_attack_card` | Produire `intent=compare_features` avec `resources.attack_card` + `resources.defense_card` | `open` |  | compare cards no-create + paraphrase + anti-FP "prepare une carte" |
| `PH-R2-B04` | T4-T5 | `BF-INTAKE-03` | `product_help` structured intake | Objet principal "carte" remplace par contexte "mission" | Sophia explique Missions au lieu de localiser la carte deja generee | `feature_id=plan.missions`, `effect_ledger.requested=0` | Representer `object=card`, `relation=linked_to_mission`, `intent=where_is_it` | `open` |  | "ou retrouver une carte liee a une mission" + paraphrase + anti-FP "valider une mission" |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | Classer le run en yellow malgre plusieurs reponses incorrectes | Les faux routings operationnels et requested effects de R1 ne se reproduisent pas; le bug restant est dans le contenu/intake `product_help` | QA | Rapport `product-help-runtime-r2` |
| 2026-06-02 | Ne pas proposer de regex de correction | La charte anti-patching interdit le routing metier par regex; le fix appartient au contrat de sortie structuree `product_help` | Runtime owners | `anti-patching-qa-charter.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | Tous | Run IA reel local R2 | Reproduit / open | Rapport `product-help-runtime-r2` |
| 2026-06-02 | R1 regressions routing | Verification indirecte sur R2 | Ameliore: aucun `adjust_plan_item`, `prepare_attack_card`, `create_one_shot_reminder`, aucun ledger entry | Rapport `product-help-runtime-r2` |
