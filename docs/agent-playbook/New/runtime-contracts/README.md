# Runtime Contracts

Ce dossier est la base de vérité canonique de Sophia Brain. Il contient à la
fois la doctrine globale, les contrats transverses, les contrats par skill et
les documents de tests d'architecture.

Un agent qui modifie un domaine doit lire :

1. `00-architecture-doctrine.md`
2. `01-global-runtime.md`
3. le contrat transverse touché, si applicable
4. le contrat du domaine touché
5. `../test-material/15-chantiers-log.md`

Si un changement contredit un contrat, l'agent ne doit pas l'implémenter
silencieusement. Il doit soit proposer une évolution du contrat, soit documenter
une exception legacy temporaire dans `../test-material/15-chantiers-log.md`.

## Par Type De Changement

- doctrine globale : `00-architecture-doctrine.md`
- pipeline global : `01-global-runtime.md`
- `run.ts` orchestration : `02-run-thin-orchestrator.md`
- intentions concurrentes : `03-user-turn-snapshot-agenda.md`
- confirmations : `04-confirmation-contract.md`
- effets, claims, "c'est fait" : `05-effect-ledger.md`
- diagrammes système : `06-sophia-brain-runtime-diagram.md`
- continuité des handoffs actifs : `07-active-handoff-arbitration.md`
- destinations plateforme : `08-product-surface-registry.md`
- clarification transverse : `clarification-tool.md`
- guards legacy ou `*ForTest` : `testing/legacy-guards.md`
- suite centrale de tests : `testing/central-test-suite.md`

## Domaines

### Tools

- `tools/one-shot-reminder.md`
- `tools/create-recurring-reminder.md`
- `tools/prepare-attack-card.md`
- `tools/prepare-defense-card.md`
- `tools/adjust-plan-item.md`
- `tools/select-state-potion.md`
- `tools/update-coach-preferences.md`
- `tools/track-progress-plan-item.md`
- `tools/clarification-tool.md`
- `tools/select-state-potion-clarte-subflow.md`

### Conversation Skills

- `conversation-skills/emotional-repair.md`
- `conversation-skills/demotivation-repair.md`
- `conversation-skills/execution-breakdown.md`
- `conversation-skills/product-help.md`
- `conversation-skills/safety-crisis.md`
- `conversation-skills/status-recap.md`
- `conversation-skills/flow-opportunity-verification-prompts.md`
- `conversation-skills/flow-opportunity-verification-implementation-agent-prompt.md`

### Proactif

- `proactive/daily-review.md`
- `proactive/weekly-review.md`

## Template Obligatoire

Chaque contrat de domaine doit garder ces sections :

- Mental Model
- Runtime Shape
- File Ownership
- Inputs
- Outputs
- Invariants
- Integration Points
- Allowed Changes
- Forbidden Changes
- Legacy Exceptions
- Required Tests
- Suivi Des Décisions Architecturales

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Création du dossier `runtime-contracts` comme base de vérité opérationnelle. | Active | À reporter dans `../test-material/15-chantiers-log.md` |
| 2026-05-30 | Intégrer la doctrine globale dans `00-architecture-doctrine.md` et garder `../13-architecture-skills` comme stub de compatibilité. | Active | J59 |
| 2026-05-30 | Renuméroter les contrats transverses pour réserver `00` à la doctrine et `06` au diagramme runtime. | Active | J59 |
| 2026-06-01 | Ajouter `clarification-tool.md` comme contrat transverse pour l'intégration dispatcher et conversation skills. | Active | J73 |
| 2026-06-01 | `platform_handoff` devient une catégorie runtime canonique distincte des effets durables bloqués ou échoués. | Active | J74 |
| 2026-06-01 | Ajouter `07-active-handoff-arbitration.md` pour protéger la continuité des handoffs sans relancer l'exécution. | Active | Architecture handoff V1 |
| 2026-06-01 | Ajouter `08-product-surface-registry.md` comme source canonique des destinations plateforme. | Active | Architecture handoff V1 |
