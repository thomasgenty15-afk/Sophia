# New

Ce dossier est l'entree canonique pour les nouveaux standards Sophia Brain.
Un agent qui modifie le code, corrige un run QA ou touche a l'architecture doit
partir d'ici avant de decider quoi changer.

Le but n'est pas d'ajouter de la documentation decorative. Le but est que
chaque agent sache rapidement :

- quel contrat runtime gouverne son perimetre;
- quelles limites architecturales il ne doit pas franchir;
- comment corriger un bug sans retomber dans le patching opportuniste;
- comment tester sans inventer de nouveaux criteres;
- quoi mettre a jour a la fin pour garder une trace exploitable.

## Carte Du Dossier

- `runtime-contracts/` : doctrine, pipeline global, contrats transverses et
  contrats par domaine. C'est la source de verite architecturale.
- `contract-prompts/` : blocs a coller dans les prompts agents, dont la charte
  anti-patching pour les corrections issues de QA.
- `test-material/` : consignes QA, structure de rapport, familles de bugs,
  feuilles de bugs par run et chantiers-log.

Les anciens fichiers racine quand ils existent ne sont que des pointeurs de
compatibilite. Pour les nouvelles missions, lire et modifier les fichiers dans
`docs/agent-playbook/New/`.

## Process Obligatoire Pour Un Changement De Code

Avant de toucher au code, l'agent doit lire dans cet ordre :

1. `runtime-contracts/README.md`
2. `runtime-contracts/00-architecture-doctrine.md`
3. le contrat runtime du perimetre touche
4. le contrat transverse touche, si applicable
5. `contract-prompts/README.md`
6. `contract-prompts/anti-patching-qa-charter.md` si la mission part d'un run
   rouge/jaune ou d'une correction QA
7. `test-material/familly-bugs.md` si un bug QA est implique
8. la feuille du run dans `test-material/run-bug-sheets/`, si elle existe
9. `test-material/15-chantiers-log.md`

Le contrat du perimetre peut etre :

- un tool : `runtime-contracts/tools/*`
- un conversation skill : `runtime-contracts/conversation-skills/*`
- un flow proactif : `runtime-contracts/proactive/*`
- un contrat transverse : `runtime-contracts/02-run-thin-orchestrator.md`,
  `03-user-turn-snapshot.md`, `04-confirmation-contract.md` ou
  `05-effect-ledger.md`
- un sujet de tests/legacy : `runtime-contracts/testing/*`

Si le code actuel contredit le contrat, l'agent ne doit pas trancher
silencieusement. Il doit documenter le conflit, choisir l'option la plus
conservatrice, ou demander arbitrage.

## Ce Que L'Agent Doit Comprendre Avant De Coder

Le systeme vise une architecture intelligente, pas une pile de rustines.
Une correction valable doit traiter la source amont et la famille de bugs, pas
seulement la phrase exacte qui a casse un run.

Standards a verifier :

- `run.ts` orchestre; il ne doit pas redevenir un cerveau metier.
- Un skill/tool possede son contrat, son intake, son reducer, ses effects et son
  renderer quand le domaine le demande.
- `UserTurnSnapshot` et `Agenda` representent ce que le tour demande.
- `Confirmation Contract` represente ce que l'utilisateur vient d'approuver,
  refuser ou modifier.
- `EffectLedger` represente ce qui a ete execute et ce qui peut etre revendique.
- Aucun "c'est fait" ne doit exister sans effet committe.
- Aucune operation engageante ne doit passer sans confirmation quand le contrat
  l'exige.
- Une regex ou un fallback semantique est une exception a justifier, tester et
  dater, pas une strategie par defaut.

## Comment Utiliser `runtime-contracts/`

`runtime-contracts/README.md` donne la table d'orientation.

Pour un changement local, l'agent doit ouvrir le fichier du domaine et verifier
au minimum :

- `Mental Model` : role exact du domaine.
- `Runtime Shape` : forme attendue du flux runtime.
- `File Ownership` : fichiers proprietaires et fichiers qui ne doivent pas
  reprendre la logique.
- `Inputs` / `Outputs` : donnees consommees et produites.
- `Invariants` : regles non negociables.
- `Integration Points` : liens avec router, agenda, confirmations, ledger, DB ou
  autres skills.
- `Allowed Changes` / `Forbidden Changes` : limites de modification.
- `Legacy Exceptions` : tolerances temporaires a ne pas etendre.
- `Required Tests` : tests minimaux attendus.

Si le changement modifie une responsabilite, un invariant, un fichier
proprietaire, une exception legacy ou un test attendu, le contrat runtime doit
etre mis a jour dans la meme mission.

## Comment Utiliser `contract-prompts/`

`contract-prompts/README.md` contient le prompt universel a coller dans les
missions qui modifient le code.

L'agent doit surtout retenir :

- lire le contrat avant de coder;
- corriger en amont, pas en aval;
- rattacher les corrections QA a une famille `BF-*`;
- ne pas ajouter de patch metier dans `run.ts`, L3 ou L4 quand le domaine doit
  le posseder;
- mettre a jour la documentation si le comportement ou l'architecture change;
- signaler les conflits au lieu de les masquer.

`contract-prompts/anti-patching-qa-charter.md` est obligatoire pour les
corrections issues de runs QA rouges ou jaunes. Il sert a eviter les fixes
specialises sur une phrase de test.

## Comment Utiliser `test-material/`

`test-material/14-qa-test-guidelines.md` definit les conditions de test :
chemin IA reel, pas de fallback deterministe pour fabriquer un succes, rapport
complet, verification trace/DB, et respect des contraintes de confirmation et
side effects.

`test-material/01-qa-run-report-structure.md` definit le format des rapports de
run. Apres un run QA, rendre ce rapport est obligatoire. Un test sans rapport
exploitable ne compte pas comme validation.

Dans ce rapport, chaque tour doit avoir un verdict `green`, `yellow` ou `red`.
Pour chaque tour `yellow` ou `red`, l'agent doit indiquer la famille `BF-*`
dans le deroule du tour et analyser la meilleure correction amont selon les
guidelines, la charte anti-patching, le contrat runtime du domaine et
`familly-bugs.md`.

`test-material/familly-bugs.md` definit les familles `BF-*`. Un agent ne doit
pas inventer une nouvelle famille si une famille existante couvre deja le bug.
S'il faut vraiment en ajouter une, il doit documenter pourquoi.

`test-material/run-bug-sheets/` contient une feuille par run. Pour un run
rouge/jaune, l'agent doit y suivre :

- bug observe;
- famille `BF-*`;
- owner runtime;
- source amont;
- fix;
- tests;
- statut.

`test-material/15-chantiers-log.md` est append-only. Il sert aux decisions
structurantes, fins de chantiers et exceptions legacy importantes. Il ne
remplace pas la feuille de bugs fine du run.

## Sortie Obligatoire Apres Un Changement

Dans sa reponse finale, l'agent doit indiquer :

- contrat runtime lu;
- famille `BF-*` traitee, si la mission vient d'un run QA;
- fichiers de code modifies;
- fichier runtime-contract mis a jour, ou raison precise si non necessaire;
- feuille de bugs mise a jour, si applicable;
- entree ajoutee dans `test-material/15-chantiers-log.md`, ou raison precise si
  non necessaire;
- tests/checks lances;
- conflit architectural rencontre, ou `aucun conflit identifie`.

## Quand Escalader

L'agent doit demander arbitrage ou documenter explicitement le conflit si :

- le fix naturel demande de modifier une frontiere entre deux skills/tools;
- un contrat runtime contredit le code actuel;
- une correction simple en L3/L4 parait plus rapide mais contourne l'owner du
  domaine;
- le bug revele une famille non couverte par `familly-bugs.md`;
- un fallback legacy semble necessaire pour eviter une regression immediate;
- le changement pourrait rendre un test vert en masquant une erreur amont.

## Suivi Des Decisions Architecturales

| Date | Decision | Statut | Reference |
| --- | --- | --- | --- |
| 2026-05-30 | Regrouper `contract-prompts`, `runtime-contracts` et `test-material` dans `docs/agent-playbook/New/`. | Active | J69 |
| 2026-05-30 | Faire du README racine `New` la porte d'entree operationnelle reliant contrats runtime, prompts agents et materiel QA. | Active | J71 |
| 2026-05-30 | Rendre le rapport post-test obligatoire et imposer une famille `BF-*` + analyse de correction amont pour chaque tour `yellow` ou `red`. | Active | J72 |
