# FF-045 · Décrire son foyer

| | |
|---|---|
| **Identifiant** | `FF-045-decrire-son-foyer` |
| **Statut** | 🟢 Livrée — commits `26de20ab` (l'écran) et `f9efc488` (le plafond cité) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [le-foyer/README.md](README.md) (F1, F2, F5, F6) · [CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) lots 4 et 7 |
| **Dépend de** | [FF-044](FF-044-la-bouche-sans-compte.md) — sans `member_id`, il n'y a rien à saisir |
| **Effort estimé** | livré — 1 jour |

---

## 1. Le problème

Trois personnes à saisir, et une falaise à la fin.

L'écran du foyer demandait d'ajouter les bouches une par une, puis — **après**
l'effort — la composition refusait de démarrer : le compte maître n'avait pas de
ligne `student_goals`, donc `goal_required` (`generate-household-meal-v1`, HEAD
`:287`). Le mur arrivait exactement au moment où l'on venait de payer le prix de
l'effort, et il ne parlait de rien de ce qu'on venait de faire.

Pire : trois fonctions de l'API du foyer — `addHouseholdMember`,
`removeHouseholdMember`, `setMemberGoal` — **n'avaient aucun appelant** depuis
que [FF-044](FF-044-la-bouche-sans-compte.md) les avait rendues possibles. Le
modèle existait, la surface non. C'est le mode d'échec n°1 de ce dépôt : un
morceau construit, testé, dont personne n'a rebranché le fil.

**Ce que ça coûte de ne rien faire.** La complétude du foyer décide de la
douve : un foyer à une bouche est un produit individuel avec des étapes en plus.
Chaque frottement de cet écran est retranché directement de la rétention.

## 2. Job stories

> **Quand** je découvre le foyer, **je veux** décrire les cinq personnes de chez
> moi en une fois et sans réfléchir, **pour que** le premier plan soit déjà le
> bon.

> **Quand** je me suis trompé de prénom, **je veux** le corriger, **pour que**
> la consigne lue à table ne s'adresse pas à quelqu'un d'autre.

> **Quand** j'essaie d'ajouter une neuvième personne, **je veux** savoir
> pourquoi ça refuse, **pour ne pas** croire que le produit est cassé.

## 3. Périmètre

### Dans le périmètre
- **Le maître se décrit en premier.** Il est un convive, pas un administrateur.
- L'ajout **en rafale** : le formulaire se vide et garde le focus.
- Les champs d'une bouche : prénom (**obligatoire**), date de naissance
  (facultative), objectif (facultatif), allergies
  ([FF-046](FF-046-l-allergie-d-une-bouche-sans-compte.md)), règles de maison.
- La **correction** du prénom et de la date, chacune par sa propre RPC.
- Le **plafond de 8**, en base, avec un motif nommé rendu à l'écran.

### Hors périmètre — engageant
- ❌ **Aucun champ de corps sur cet écran.** Pas de taille, pas de poids. Ce
  serait un cran 2 sans son plancher TCA — voir les crans d'intake dans le
  [README](README.md).
- ❌ **Le plafond n'est pas une garde d'écran.** Un bouton grisé n'est pas une
  limite : la RPC est appelable directement.
- ❌ **Aucun import en masse, aucun lien partageable pour se décrire soi-même.**
  Une seule personne décrit le foyer (F1).
- ❌ **Aucune photo, aucun avatar, aucun surnom.** Le prénom part dans le
  prompt ; tout le reste est du décor sur un écran qu'on ouvre trois fois.

## 4. Le circuit

```
   /app/household
        │
        ├─ pas de foyer ────────────► CreateCard
        │
        ▼
   ┌────────────────────────────────────────────────────┐
   │ 1. MeCard — « toi d'abord »                        │
   │    prénom · date · objectif                        │
   │    ⚠️ écrit AUSSI student_goals SI elle manque      │
   │      (createOwnerGoalRow, `ignoreDuplicates`)      │
   │    → la falaise `goal_required` est levée ICI      │
   └────────────────────────┬───────────────────────────┘
                            ▼
   ┌────────────────────────────────────────────────────┐
   │ 2. AddMouthCard — en rafale (maître seulement)     │
   │    keel_household_add_member(prénom, date, but)    │
   │    refus nommés: bad_first_name · bad_goal ·       │
   │                  bad_birth_date · household_full   │
   │    → le formulaire se vide, le focus reste         │
   └────────────────────────┬───────────────────────────┘
                            ▼
   ┌────────────────────────────────────────────────────┐
   │ 3. MembersCard — corriger, restreindre, retirer    │
   │    set_member_name · set_member_birth_date         │
   │    add/removeAllergy · add/removeRestriction       │
   └────────────────────────┬───────────────────────────┘
                            ▼
                     ComposeCard, rendue seulement si
                     `ownerGoalRow === true`
```

**L'endroit où ça casse** est la carte 1. Tant que `hasOwnerGoalRow` n'a pas
répondu, l'état vaut `null` et **ni la carte ni le bouton de composition ne sont
rendus** : c'est la garde de montage qui évite d'afficher du vide non lu puis de
l'écraser au Save.

## 5. Modèle de données

Aucune colonne neuve pour cette fiche : elle est la **surface** du modèle de
[FF-044](FF-044-la-bouche-sans-compte.md).

| Écriture | RPC | Note |
|---|---|---|
| Ajouter une bouche | `keel_household_add_member(text, date, text)` (`20260810260000:126`) | Maître seul, plafond cité, valide prénom / objectif / date |
| Corriger le prénom | `keel_household_set_member_name(uuid, text)` (`20260810170000:292`) | Autorité identique à `set_member_goal`, **mot pour mot** |
| Corriger la date | `keel_household_set_member_birth_date(uuid, date)` (`20260810170000:352`) | RPC **séparée** — voir R4 |
| Poser son objectif | `keel_household_set_member_goal(uuid, text)` (`20260810120000:566`) | Maître, ou la personne sur **sa** ligne |
| Ligne du maître | `createOwnerGoalRow` (`frontend/src/keel/api/household.ts`) | `upsert … ignoreDuplicates: true` : n'écrase **jamais** une ligne existante |

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | **Le maître est la première bouche du flux** | Il est un convive, pas un administrateur. Effet de bord décisif : la falaise `goal_required` disparaît, parce que sa ligne `student_goals` est écrite au moment où il se décrit — et pas trois personnes plus tard. |
| R2 | **La promesse n'est faite qu'à qui peut la tenir** | « Ceci débloque la composition » est vrai pour le compte maître et **faux** pour un profil réclamé, qui ne compose pas. Sa ligne `student_goals` reste écrite (c'est la sienne), mais la carte ne lui raconte pas qu'elle ouvre une porte fermée. |
| R3 | **`createOwnerGoalRow` n'écrase jamais** | `student_goals` porte des `CHECK` croisés (`target_weight_kg` n'est légal que sur trois objectifs). Écraser `goal` depuis cet écran ferait échouer l'écriture chez exactement les gens qui ont déjà rempli une cible — et personne ne l'aurait demandé depuis cet écran. |
| R4 | **Deux RPC d'identité, jamais une** | Le roster ne rend **jamais** `birth_date`. Une RPC `set_identity(prénom, date)` recevrait donc `null` à chaque correction de prénom et **effacerait la date**. L'écran n'écrit jamais un champ qu'il n'a pas lu. |
| R5 | **Le prénom est obligatoire, borné à 40** | `CHECK` en base (`20260810120000:124-125`). Un prénom vide **efface la portion** sans erreur (F5) : la contrainte remplace un filtre silencieux. La borne d'affichage du prompt est plus courte (20, et elle **tronque**) ; on stocke plus large pour ne pas refuser un prénom composé réel. |
| R6 | **Le plafond de 8 vit en base**, et l'écran ne fait que le dire | Une limite d'UI n'est pas une limite : le plafond doit tenir face à un appel direct de la RPC. Il existe à cause du **coût LLM** — 8 bouches, ce sont 8 consignes de service à chaque génération. `keel_household_max_mouths()` (`20260810260000:101`) le nomme, `keel_household_add_member` le **cite** au lieu de le recopier. |
| R7 | **Tout refus porte un motif nommé, traduit par une liste fermée** | Afficher `household_full` à quelqu'un n'est pas une information ; afficher « une erreur est survenue » non plus. Un motif inconnu est rendu tel quel — le silence forcerait à tolérer l'étiquette manquante au lieu de l'ajouter. |
| R8 | **Le plafond compte les BOUCHES, pas les comptes** | Il n'a rien à voir avec ce qui est facturé. Les confondre ferait facturer des enfants — voir [FF-049](FF-049-le-prix-du-foyer.md) R1. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| `hasOwnerGoalRow` n'a pas encore répondu | `ownerGoalRow === null` : **ni** la carte du maître **ni** le bouton de composition ne sont rendus. Jamais un formulaire vide qu'on écraserait au Save. |
| Neuvième bouche | Refus `household_full`, phrase traduite, foyer inchangé. Vrai aussi sur un appel direct de la RPC. |
| Prénom vide ou > 40 caractères | Refus `bad_first_name`. La ligne n'entre pas. |
| Date de naissance dans le futur | Refus `bad_birth_date` à l'ajout ; et si une date aberrante existait déjà, `keel_household_member_age` la lit `unknown` (jamais `adult`). |
| Objectif hors des six jetons | Refus `bad_goal`. |
| Un non-maître ouvre l'écran | `AddMouthCard` n'est pas rendue. Et la RPC refuse `not_owner` de toute façon. |
| Le maître tente de se retirer | `cannot_remove_owner` — sans cette garde, un foyer se retrouve sans personne pour composer, et ses bouches sans compte n'ont par construction personne pour reprendre la main. |

## 8. Critères d'acceptation

```gherkin
Étant donné un compte maître qui vient de créer son foyer
Quand il enregistre son propre prénom et son objectif
Alors sa ligne student_goals est créée si elle n'existait pas
Et le bouton de composition devient disponible
```

```gherkin
Étant donné un foyer qui compte déjà huit bouches
Quand la RPC keel_household_add_member est appelée directement, hors écran
Alors elle rend ok=false et reason="household_full"
Et aucune ligne n'est insérée
```

```gherkin
Étant donné une bouche dont la date de naissance est renseignée
Quand le compte maître corrige seulement son prénom
Alors la date de naissance est inchangée
```

```gherkin
Étant donné un profil réclamé qui ouvre l'écran du foyer
Alors la carte d'ajout n'est pas rendue
Et sa propre carte ne lui promet pas de débloquer la composition
```

## 9. Rabbit holes

- **La RPC d'identité « pratique ».** Un seul `set_identity(prénom, date)`
  paraît plus propre et **efface la date** à chaque correction de prénom, parce
  que le roster ne rend pas `birth_date`. Le piège est dans l'asymétrie
  lecture/écriture, pas dans la RPC.
- **Le plafond à l'écran seulement.** C'est la version qu'on écrit en quinze
  minutes, et elle ne protège rien.
- **Le formulaire figé au montage.** Sans la garde `ownerGoalRow === null`, la
  carte affiche du vide non lu puis l'écrase au Save. Cicatrice
  `mount-snapshot-forms-need-a-loading-gate`.
- **Les clés i18n mortes.** 14 ont été retirées avec ce lot. Elles décrivaient
  un écran qui n'existait plus, et elles rendaient vert un test de couverture
  qui ne prouvait rien.

## 10. Ce qu'on mesure

- **La mesure :** temps médian entre la création du foyer et la **troisième**
  bouche saisie. La cible qui a donné son nom au lot est **90 secondes**.
- **La contre-mesure :** part des foyers restés à **une** bouche à J+7. Si elle
  ne baisse pas, l'écran n'est pas le frottement — c'est le modèle ou la
  promesse, et il faut arrêter de polir cette carte.

## 11. Questions ouvertes

1. **Aucune vérification navigateur.** Le rendu à 320 px est **raisonné et non
   mesuré** : la base locale ne portait ni foyer ni persona au moment de la
   livraison. `flex-1` ne rétrécit pas un input (cicatrice
   `flex-child-min-width-auto`), et cet écran en aligne plusieurs.
2. **Aucun run réel du générateur** depuis cet écran : `POST
   generate-household-meal-v1` rend 404 en local, reproduit sur la version
   commitée — le registre du routeur edge est figé au démarrage du CLI.
3. **Le retrait d'une bouche est destructif et sans confirmation dédiée.** Le
   trou n°4 du [README](README.md) est **refermé** (`e2899897`) : « retirer
   l'accès » existe désormais, distinct de « retirer du foyer », avec son propre
   libellé à l'écran. Ce qui reste ouvert ici est le geste **destructif**
   lui-même — il n'a toujours pas de confirmation dédiée.
