# FF-010 · La lecture du foyer

| | |
|---|---|
| **Identifiant** | `FF-010-la-lecture-du-foyer` |
| **Statut** | 🟡 Spécifiée |
| **Date** | 2026-08-07 |
| **Autorité produit** | [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) §7.5, §8 · la direction du domaine ([README](README.md)) |
| **Dépend de** | `keel_household_roster()` · `student_generated_meals.household_id` + `member_portions` · `_shared/keel/household.ts` (`memberVisibility`) · `_shared/keel/household_portions.ts` |
| **Effort estimé** | 2 jours |

---

## 1. Le problème

« On mange quoi ce soir ? » est la question la plus évidente qu'on puisse poser
à cette app. **Le chat ne peut pas y répondre.**

Ce n'est pas une lacune du modèle, c'est une absence de lecteur, et elle est
vérifiable : `sophia-brain` ne contient **aucune** requête sur
`student_generated_meals` ni sur les tables du foyer. Le seul contexte de plan
qu'il charge est `keel_plan_context.ts`, qui lit `plan_versions`,
`plan_commitments` et `commitment_evaluations` — **les engagements du coach,
pas les plats composés**. Le plat du soir, les préparations, les portions par
membre : rien de tout ça n'entre dans le prompt.

Conséquence, aujourd'hui : soit l'agent botte en touche, soit il **invente** un
plat — ce que ce dépôt a déjà mesuré ailleurs sous le nom de confabulation de
récap, et qui est ici bien pire, parce que la personne va cuisiner ce qu'on lui
a dit.

**Ce que ça coûte.** Le pivot foyer a construit la génération multi-personnes
(`generate-household-meal-v1`, `member_portions`, vagues de courses), et la
conversation ne la voit pas. C'est le mode d'échec le plus cher de ce dépôt :
un morceau construit, testé, déployé, **dont personne n'a rebranché le fil**.

## 2. Job stories

> **Quand** je rentre à 19 h et que je ne me souviens plus de ce qui était
> prévu, **je veux** le demander en une phrase, **pour que** je n'aie pas à
> ouvrir un écran et à faire défiler la semaine.

> **Quand** je cuisine pour quatre dont un ado et un enfant, **je veux** qu'on
> me dise les portions à leur nom, **pour que** je n'aie pas à faire le calcul.

> **Quand** je partage un appartement, **je veux** que l'agent ne raconte pas ma
> vie à mes colocataires, **pour que** partager une cuisine ne veuille pas dire
> partager un dossier.

## 3. Périmètre

### Dans le périmètre

- Le chat **lit** le foyer de la personne : composition (via
  `keel_household_roster()`), plat du jour, préparations à faire, portions à son
  nom, vague de courses en cours.
- La lecture respecte `memberVisibility(kind, viewer, viewed)` : `full` en
  `family`, `presence_only` en `shared`.
- Répondre « on mange quoi ce soir ? », « je dois cuisiner quoi aujourd'hui ? »,
  « il faut acheter quoi ? », « c'est quoi ma part ? ».
- Quand il n'y a **rien** : le dire, et porter la sortie vers la composition —
  jamais « ton coach prépare ton plan » (interdit par MODEL.md).

### Hors périmètre — engageant

- ❌ **Lecture seule.** Le chat ne compose pas, ne modifie pas le plan, ne pose
  pas de restriction, n'ajoute pas d'envie. Toutes ces écritures ont un écran,
  un propriétaire et une RPC gatée.
- ❌ **Le chat ne porte pas la voix du parent.** Une restriction domestique se
  restitue « pas disponible dans ce foyer — choisi par X » (PIVOT-FOYER §7.5
  règle 4). Sophia ne justifie pas, n'argumente pas, ne plaide pas pour le
  parent, et ne déguise **jamais** une décision domestique en conseil de santé.
- ❌ **Aucune fuite entre membres en `shared`.** Un colocataire ne voit ni
  objectif, ni mesure, ni portion nommée d'un autre. La visibilité est déjà
  décidée par un module pur ; le chat s'y soumet, il ne la re-décide pas.
- ❌ **Aucune inférence de repas depuis le plan.** Que le plat soit prévu ne
  prouve pas qu'il ait été mangé. Rien n'est coché (interdit global du domaine, [README](README.md)).
- ❌ **Aucun objectif nutritionnel pour un mineur.** Un mineur est un mangeur —
  allergies, goûts, portions adaptées — jamais une cible. `weekPlanAgeGate` mord
  déjà ; le chat ne crée pas une porte latérale.

## 4. Le circuit

```
  « on mange quoi ce soir ? »
             │
             ▼
  ┌───────────────────────────┐
  │ keel_household_of(uid)    │  aucun foyer ──► on répond comme aujourd'hui,
  └───────────────────────────┘                  aucune mention de foyer
             │ un foyer
             ▼
  ┌────────────────────────────────────────────────────┐
  │ loadHouseholdTurnContext            ← NOUVEAU      │
  │  · keel_household_roster()   (prénom, mineur, rôle)│
  │  · student_generated_meals    household_id, fenêtre│
  │      courante → plat du jour, préparations         │
  │  · member_portions            → MA part, nommée    │
  │  · vagues de courses          (grocery_waves.ts)   │
  │  · restrictions qui ME visent → « choisi par X »   │
  └────────────────────────────────────────────────────┘
             │
             ▼
  ┌────────────────────────────────────────────────────┐
  │ memberVisibility(kind, viewer, viewed)             │
  │  family → full   ·   shared → presence_only        │
  │  Le filtre s'applique AVANT la mise en prompt.     │
  │  Ce qui n'entre pas dans le prompt ne peut pas     │
  │  fuir dans la réponse.                             │
  └────────────────────────────────────────────────────┘
             │
             ▼
   bloc de contexte foyer  ──►  le tour normal
   (rien d'autre ne change)     (verrou de doctrine inchangé)
```

**Le point qui gouverne le dessin** : le filtre de visibilité s'applique au
**chargement**, pas à la rédaction. Un prompt qui porte la donnée et une
consigne de ne pas la dire est un prompt qui la dira.

## 5. Modèle de données

**Néant en écriture.** Cette fiche ne persiste rien. Elle lit :

| Source | Ce qu'on en prend | Gardée par |
|---|---|---|
| `keel_household_roster()` | prénom, `is_minor` (**dérivé**, jamais la date), rôle | la RPC ne rend que le foyer de l'appelant |
| `student_generated_meals` | plat du jour, `preparations`, `cooking_sessions`, `shopping_list` | policy `household_id` non nul + lecteur membre |
| `student_generated_meals.member_portions` | **ma** consigne de service | filtrée sur mon `user_id` en `shared` |
| `household_food_restrictions` | celles qui **me** visent, avec l'auteur | policy « on voit qu'on est restreint, et par qui » |

Le fait que la RPC roster existe **est** la garde : une policy RLS ne restreint
pas les colonnes, et ouvrir `profiles` aux co-membres livrerait téléphone,
e-mail et identifiant Stripe pour afficher un prénom
(`20260808002000_household_roster.sql`).

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Ce que l'agent dit du plan vient **d'une ligne lue**, jamais de sa mémoire | la personne va cuisiner ce qui est dit. Un plat inventé est une confabulation qu'on met dans une casserole |
| **R2** | La visibilité filtre au **chargement** | un prompt qui porte la donnée finira par la dire ; c'est la seule garde qui tient |
| **R3** | En `shared`, aucune portion nommée d'autrui, aucun objectif, aucune mesure | partager une cuisine n'est pas partager un dossier |
| **R4** | Une restriction domestique se restitue **attribuée** et **non justifiée** | §7.5 règle 4. Sophia qui plaide pour le parent, c'est le produit qui prend parti dans une famille |
| **R5** | Un mineur n'a pas d'objectif, et le chat ne lui en projette aucun | `weekPlanAgeGate` mord déjà. Une porte latérale par le chat serait une régression de sécurité |
| **R6** | Sans plan composé : on le **dit**, et on porte vers la composition | MODEL.md : « ton coach prépare ton plan » est faux, il n'existe aucun canal 1:1 |
| **R7** | Lecture seule, sans exception | chaque écriture du foyer a une RPC gatée et un écran propriétaire. Un second chemin d'écriture, c'est deux vérités |
| **R8** | Le bloc foyer **n'entre pas** si la personne n'a pas de foyer | pas de « ton foyer n'a rien prévu » à quelqu'un qui vit seul |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Aucun foyer | le chat répond comme aujourd'hui, **aucune** mention |
| Foyer sans plan composé | l'agent le dit et porte vers `/app/plan`, là où l'on compose (la fiche disait `/app/meals` — les idées du coach, retirées le 2026-09-03, P4 ; la règle R6 n'a jamais été implémentée avec cette cible). Jamais d'attente d'un tiers |
| Le chargement du foyer échoue | le tour continue **sans** bloc foyer, et l'agent ne prétend pas connaître le plan. Un chargeur qui avale son erreur ferait dire « rien de prévu » à quelqu'un dont le plan existe — donc l'échec est journalisé, et l'agent reste muet sur le plan plutôt que faux |
| Plan périmé (fenêtre finie hier) | traité comme absent. Un plat d'hier servi ce soir est une erreur silencieuse |
| Colocataire qui demande la portion d'un autre | l'agent dit qu'il ne la connaît pas — parce qu'il ne l'a **pas** dans son contexte |
| Enfant qui demande pourquoi il n'a pas de Nutella | « ce n'est pas disponible dans ce foyer, c'est un choix de X ». Aucune raison de santé, aucun argument |
| Deux membres posent la même question | deux réponses, chacune avec **sa** portion |

## 8. Critères d'acceptation

```gherkin
Étant donné un membre d'un foyer avec un plan composé pour aujourd'hui
Quand il demande « on mange quoi ce soir ? »
Alors l'agent cite le plat du foyer
Et la portion à son nom

Étant donné un membre d'un foyer SANS plan composé
Quand il demande « on mange quoi ce soir ? »
Alors l'agent dit qu'il n'y a rien de composé
Et il porte vers l'écran de composition
Et sa réponse ne contient AUCUNE attente d'un tiers

Étant donné une personne sans foyer
Quand elle discute normalement
Alors aucune mention de foyer n'apparaît jamais

Étant donné un foyer de type « shared »
Quand un membre demande la part d'un autre
Alors l'agent ne la donne pas
Et la donnée n'était pas dans son contexte

Étant donné un enfant visé par une restriction posée par un parent
Quand il demande pourquoi cet aliment n'est pas là
Alors la réponse l'attribue au parent
Et ne contient aucune justification nutritionnelle

Étant donné un plan dont la fenêtre s'est terminée hier
Quand un membre demande le repas du jour
Alors l'agent le traite comme absent, pas comme celui d'hier

Étant donné que le chargement du contexte foyer échoue
Quand l'agent répond
Alors il ne dit rien du plan
Et l'échec est journalisé
```

## 9. Rabbit holes

- **Le budget de prompt.** Un foyer de six avec sept jours de préparations et une
  liste de courses complète dépasse largement ce que le prompt tolère
  (`COMPANION_PROMPT_MAX_TOKENS = 8000`, et la troncature coupe **par la
  queue**). Le bloc foyer est **borné** et **ordonné** : jour courant d'abord.
  Le dépôt a déjà payé un bloc mémoire tué par la troncature.
- **Deux blocs de plan dans un prompt.** `keel_plan_context.ts` dit déjà
  pourquoi c'est interdit : « two plan blocks in one prompt is how a model gets
  to pick the more flattering one ». Les engagements du coach et les plats du
  foyer sont deux couches différentes — elles se **nomment** distinctement, elles
  ne fusionnent pas.
- **La visibilité re-décidée.** `memberVisibility` existe et est testée. La
  tentation d'écrire un `if (kind === 'shared')` dans le chargeur du chat crée
  une seconde vérité qui divergera.
- **« Un foyer par personne ».** Contrainte V1 (`household_members_one_household_per_user`)
  posée pour la résolution unique. Le chat s'appuie dessus ; si elle tombe, ce
  chargeur est le premier à casser.

## 10. Ce qu'on mesure

- Part des questions « repas du jour » répondues **avec** une ligne lue
- Portions citées par leur prénom
- Fuites de visibilité en `shared` — **la seule métrique dont la cible est zéro,
  et qui se teste, pas qui s'observe**

**Contre-mesure.** La longueur moyenne du prompt et le taux de troncature. Si
brancher le foyer fait tomber le bloc mémoire ou le bloc doctrine par la queue,
on a gagné une réponse et perdu la voix du coach.

## 11. Questions ouvertes

- « On mange quoi ce soir ? » posée par un membre **qui n'est pas celui qui
  cuisine** : la réponse mentionne-t-elle qui cuisine ?
- Le chat doit-il connaître les **vagues de courses** au même titre que les
  plats, ou est-ce une surface d'écran uniquement ? Le pousser dans le prompt
  coûte du budget pour une question rare.
- Un membre en `shared` peut-il demander « qui cuisine ce soir ? » — c'est de la
  **présence**, donc autorisé par `presence_only`, mais la frontière avec « pour
  qui » est mince.
