# Decision Log

Append-only. Le decision log sert uniquement aux decisions qui doivent survivre
au contexte d'une conversation agent.

Ne pas l'utiliser comme bug tracker QA ordinaire.

Ajouter une entry seulement pour :

- decision produit durable ;
- decision architecture durable ;
- exception volontaire a une boundary ;
- changement de contrat public ou schema ;
- regression critique qui change une regle de methode.

Ne pas ajouter d'entry pour :

- chaque run QA ;
- chaque bug ordinaire trouve dans un rapport ;
- chaque fix valide dans la conversation ;
- les follow-ups stylistiques ou les petites ameliorations.

Les bugs et follow-ups QA restent dans le rapport de run, section
`Follow-ups`, avec severite et prochaine action recommandee.

## Format

```markdown
## YYYY-MM-DD - <titre court>

- **Contexte** : <probleme>
- **Decision** : <ce qui a ete fait>
- **Raison** : <pourquoi cette option>
- **Reversibility** : facile | moyen | dur
- **Test ajoute** : <lien si applicable>
```

## 2026-05-04 - Bootstrap methodology MVP

- **Contexte** : Le repo a besoin d'un dispositif minimal pour limiter le vision drift, les regressions silencieuses et la charge cognitive solo.
- **Decision** : Ajouter le playbook agent MVP, les scripts CLI, le gate local, le hook pre-commit, le scaffolding real-personas et l'Edge Function test-only.
- **Raison** : Couvrir les garde-fous de base sans attendre le dispositif long-terme complet.
- **Reversibility** : facile
- **Test ajoute** : `scripts/agent-gate.sh`
