# Contract Prompts

Ce dossier contient des blocs courts à coller dans les prompts agents quand une
mission demande une modification de code.

But : forcer chaque agent à lire le contrat runtime du domaine avant de changer
le code, à respecter les frontières d'architecture, et à mettre à jour la
documentation quand son changement modifie une décision ou une responsabilité.

## Prompt Universel Pour Modification De Code

```md
Avant toute modification de code, lis la base d'architecture canonique :

1. `docs/agent-playbook/New/runtime-contracts/README.md`
2. `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`
3. `docs/agent-playbook/New/contract-prompts/anti-patching-qa-charter.md`
4. `docs/agent-playbook/New/test-material/familly-bugs.md` si la mission part d'un run QA rouge/jaune
5. la feuille de bugs du run dans `docs/agent-playbook/New/test-material/run-bug-sheets/`, si elle existe
6. le contrat runtime du domaine que tu modifies (`tools/*`, `conversation-skills/*`, `proactive/*` ou contrat transverse)
7. `docs/agent-playbook/New/test-material/15-chantiers-log.md`

Tu dois implémenter en respectant ce contrat. Si le code actuel semble contredire le contrat, ne tranche pas silencieusement : documente le conflit, choisis l'option la plus conservatrice, ou demande arbitrage.

Philosophie obligatoire : tu construis un système intelligent, pas une collection de rustines. Corrige la source amont et la famille de bugs, pas seulement le tour rouge.

Si la mission vient d'un run QA, rattache chaque correction a un code famille `BF-*` et mets a jour la ligne correspondante dans la feuille de bugs du run.

Interdit :
- ajouter un patch métier dans `run.ts`/L3/L4 si le contrat dit que le domaine doit le posséder ;
- ajouter une regex/fallback sémantique sans owner, test et condition de suppression ;
- dire ou rendre possible "c'est fait" sans effet committé ;
- modifier une frontière d'architecture sans mettre à jour la doc.

Si ton changement modifie le comportement, les responsabilités, les fichiers propriétaires, les invariants, les exceptions legacy ou les tests attendus, mets à jour le fichier `runtime-contracts` concerné, puis ajoute une entrée append-only dans `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Critère final : un autre agent doit pouvoir lire le contrat du domaine après ton passage et comprendre exactement pourquoi ton changement respecte l'architecture.

Dans ta réponse finale, indique obligatoirement :

- contrat runtime lu ;
- code famille `BF-*` traite, si la mission vient d'un run QA ;
- fichiers de code modifiés ;
- feuille de bugs mise a jour, si applicable ;
- fichier `runtime-contracts` mis à jour, ou raison précise si aucun changement doc n'était nécessaire ;
- entrée ajoutée dans `docs/agent-playbook/New/test-material/15-chantiers-log.md`, ou raison précise si non nécessaire ;
- tests/checks lancés ;
- conflit architectural rencontré, ou `aucun conflit identifié`.
```

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Créer un prompt universel court pour les agents qui modifient le code. | Active | Demande utilisateur |
| 2026-05-30 | Ajouter la charte anti-patching QA comme lecture obligatoire du prompt universel. | Active | `anti-patching-qa-charter.md` |
| 2026-05-30 | Ajouter `familly-bugs.md` et les feuilles de bugs par run au prompt universel pour les corrections issues de QA. | Active | J67 |
