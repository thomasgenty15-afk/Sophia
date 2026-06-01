# Architecture Doctrine

## Mental Model

Ce document est la doctrine canonique de Sophia Brain. Il fixe les frontières
entre le runtime global, les contrats transverses, les conversation skills, les
tool skills, les flows proactifs et les tests d'architecture.

Les contrats de domaine dans ce dossier sont la source opérationnelle. Ce
document ne remplace pas les fiches `tools/*`, `conversation-skills/*` ou
`proactive/*`; il explique comment elles doivent être lues et comment elles
s'imbriquent.

Principe central :

```txt
Le runtime orchestre.
Le dispatcher comprend globalement.
Le skill comprend son domaine.
Le reducer avance l'état.
L'executor écrit.
L'EffectLedger prouve.
Le renderer parle.
```

Si une couche fait le travail d'une autre, l'architecture commence à produire
des RED difficiles à stabiliser.

## Read Order

Un agent qui modifie Sophia Brain doit lire dans cet ordre :

1. `runtime-contracts/README.md`;
2. ce fichier;
3. `01-global-runtime.md`;
4. le contrat transverse touché, si applicable;
5. le contrat du domaine modifié;
6. `../test-material/15-chantiers-log.md`.

Un changement qui contredit un contrat doit soit modifier explicitement le
contrat, soit documenter une exception legacy temporaire avec condition de
suppression. Il ne doit jamais être glissé comme patch local silencieux.

## Canonical Runtime Shape

```txt
user message
  -> load context / tempMemory / DB projections
  -> dispatcher L1 produces TurnFrame
  -> routers/arbitrators choose an owner
  -> UserTurnSnapshot captures current turn state
  -> TurnAgenda represents reply/effect/status/memory/repair tasks
  -> Confirmation Contract classifies approve/reject/revise/explain/status
  -> owner runtime runs one domain contract
  -> owner prepares requested/allowed/blocked effects
  -> executor commits only allowed durable effects
  -> EffectLedger records requested/allowed/blocked/committed/failed
  -> renderer/final guards produce visible reply
  -> trace + persistence
```

Le runtime peut avoir plusieurs intentions dans un même tour, mais il ne doit
pas avoir plusieurs propriétaires pour le même effet durable. Chaque effet
durable a un owner local.

## Contract Shape

La forme cible pour un tool skill est :

```txt
contract -> structured intake -> reducer -> draft/confirmation
         -> effect plan -> executor -> committed effects -> renderer
```

La forme cible pour un conversation skill est :

```txt
contract -> structured intake -> reducer/policy -> renderer
```

Un conversation skill peut proposer un bridge ou une suggestion consentie, mais
il ne doit pas exécuter d'effet durable. L'exécution appartient au tool skill
propriétaire.

La forme cible pour un flow proactif est :

```txt
projection -> evidence -> reducer -> patch/confirmation
           -> effects -> renderer
```

`status_recap` est une exception documentée : il est read-only et DB-grounded.
Sa forme actuelle est :

```txt
contract -> DB/effect projection -> deterministic reducer -> renderer
```

Cette exception ne justifie pas d'ajouter des regex métier ailleurs.

## AI Boundary

La compréhension sémantique vit dans deux endroits :

- dispatcher L1 : compréhension globale du tour;
- skill actif L5 : compréhension structurée dans le domaine.

Il ne doit pas y avoir un troisième classifier global qui relit le message brut
pour décider un slot, une confirmation, un target, un blocker ou un tool.

Règles :

- pas de regex pour remplir des slots métier;
- pas de fallback regex si l'appel IA de compréhension échoue;
- pas de mini-classification parallèle dans `run.ts`;
- pas de phrase user-facing métier codée dans le runtime global;
- pas de confirmation globale qui applique un brouillon local;
- pas de "c'est fait" sans effet committé.

Les fallbacks techniques sont autorisés seulement s'ils sont non-mutants,
conservateurs et documentés. Ils ne doivent pas inventer une décision métier.

## Runtime Ownership

`run.ts` possède :

- l'IO du tour;
- la construction du contexte;
- l'appel aux pipelines;
- la persistance et l'observabilité;
- les guards globaux non sémantiques.

`run.ts` ne possède pas :

- les slots internes d'un tool;
- la validation d'un brouillon métier;
- les règles de draft-only/create/cancel;
- le rendu status DB-grounded;
- les phrases métier visibles;
- les extracteurs de payload;
- les transitions internes d'un skill.

Le dispatcher possède :

- le premier `TurnFrame`;
- les signaux globaux;
- les opportunités tool/conversation;
- les contraintes explicites détectées globalement.

Le dispatcher ne possède pas :

- les slots complets;
- le draft final;
- la confirmation locale;
- l'exécution DB.

Chaque skill possède :

- son contrat;
- son intake structuré;
- son reducer ou policy;
- ses invariants;
- ses effets proposés, bloqués ou committés;
- son renderer ou son contrat de réponse.

## Durable Effects

Une action durable suit toujours cette chaîne :

```txt
requested -> allowed / blocked -> committed / failed
```

Règles :

- `requested` signifie "le système a compris une demande", pas "l'action est
  faite";
- `allowed` signifie "le contrat local autorise l'exécution", pas "la DB est
  écrite";
- `committed` signifie "l'executor a réellement écrit ou observé le succès";
- `failed` et `blocked` doivent être rendus comme tels;
- la réponse visible ne doit pas transformer `requested`, `allowed`, `failed`
  ou `blocked` en succès.

La DB métier est la vérité d'état actuel. L'EffectLedger est la vérité
d'exécution observée.

## Confirmation Ownership

Le Confirmation Contract global classe la forme du tour :

```txt
approve | reject | revise | explain | preview | status | unrelated | ambiguous
```

Il ne possède aucun brouillon métier et n'exécute rien. Il ne peut autoriser
l'exécution qu'en combinaison avec le contrat local du pending flow.

Un "ok" court ne valide rien si :

- il y a plusieurs cibles possibles;
- le pending est expiré ou incompatible;
- le user demande une preview, une explication ou un status;
- le user corrige une partie du draft;
- une nouvelle intention explicite interrompt le flow.

## Interruption Ownership

Une nouvelle intention explicite peut suspendre ou interrompre un ancien flow.
Cette décision appartient à `UserTurnSnapshot + TurnAgenda` et aux policies
globales d'interruption, pas à un vieux pending qui capturerait tout.

Exemples :

- une demande de rappel explicite ne doit pas être avalée par une carte active;
- "pas de potion" doit suspendre les suggestions potion;
- un status/recap ne doit pas confirmer ou annuler un tool;
- safety préempte tout.

## Renderer Ownership

Le renderer parle uniquement depuis :

- l'état local validé;
- la projection DB;
- les effets committés;
- les contraintes de réponse.

Il ne doit pas :

- inventer un objet;
- masquer un échec;
- dire "c'est fait" sans commit;
- contredire la DB;
- proposer un tool interdit;
- transformer un recap humain en panneau status;
- faire une explication produit dans un skill status.

## Legacy Policy

Une exception legacy doit avoir :

- un owner clair;
- une raison;
- un test de protection;
- une condition de suppression;
- une limite documentée dans le contrat concerné.

Les guards legacy peuvent rester s'ils réduisent le risque sans exécuter
d'effet. Ils ne doivent pas croître silencieusement.

## Required Architecture Tests

Les familles de tests obligatoires sont :

- no tool without consent;
- no done-language without committed effect;
- no status claim without DB or ledger source;
- explicit tool command is not captured by status/product help;
- safety blocks all product/tool/proactive effects;
- pending confirmation only applies to compatible pending;
- old flow can be interrupted by explicit new intent;
- conversation skills do not execute durable effects;
- tool skills expose requested/allowed/blocked/committed/failed effects;
- runtime global does not gain new semantic ownership.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Déplacer la doctrine globale depuis `runtime-contracts/00-architecture-doctrine.md` vers `runtime-contracts/00-architecture-doctrine.md`. | Active | J59 |
| 2026-05-30 | Faire de `runtime-contracts/` la source canonique unique pour doctrine + contrats opérationnels. | Active | J59 |
