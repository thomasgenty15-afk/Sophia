# FF-046 · L'allergie d'une bouche sans compte

| | |
|---|---|
| **Identifiant** | `FF-046-l-allergie-d-une-bouche-sans-compte` |
| **Statut** | 🟠 **En cours** — la table, le module et l'écran sont livrés (`26de20ab`) ; **le fil du générateur n'est pas commité**, et le chat ne voit rien (§7) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [CONTRACT.md](../../keel/CONTRACT.md) · [le-foyer/README.md](README.md) (F9, F10) · [FF-021](../conversation/FF-021-le-plancher-de-restriction-alimentaire.md) pour la famille de ceintures |
| **Dépend de** | [FF-044](FF-044-la-bouche-sans-compte.md) — la table est clée `member_id` · [FF-045](FF-045-decrire-son-foyer.md) — l'écran qui la remplit |
| **Effort estimé** | livré à ~⅔ ; le reste = un commit + une ceinture de chat |

---

## 1. Le problème

L'écran d'ajout du foyer réclamait une allergie **qui n'avait nulle part où
aller**.

Les allergies vivent dans `student_safety_constraints`, clée sur `user_id`
(`20260727090000`). Le générateur du foyer en fait l'union qui arme le prompt —
*une allergie d'un seul membre gouverne TOUTE la casserole* — et si la lecture
échoue, **toute la génération s'arrête** (`safety_constraints_unreadable`).
Depuis [FF-044](FF-044-la-bouche-sans-compte.md), une bouche peut exister **sans
compte** : un enfant de huit ans, le cas nominal du produit. Son allergie
n'entrait donc dans aucune union.

Et elle ne pouvait pas atterrir dans `household_food_restrictions` : cette table
est celle du **pouvoir domestique**, sans colonne de raison, délibérément — et
son verrou (`_shared/keel/household_restriction_lock.ts`) **efface le
« pourquoi » du plat**, pour que Sophia ne porte pas une décision parentale comme
un conseil de santé. Y mettre une allergie tairait sa raison médicale et
classerait un allergène au rang d'un Nutella interdit.

**Ce que ça coûte de ne rien faire.** Le produit promet ce qu'il ne tient pas :
il demande l'allergie, l'affiche, et cuisine sans elle. Ce n'est pas un manque
de confort, c'est un trou de sécurité que l'interface **rend invisible**.

## 2. Job stories

> **Quand** j'ajoute mon fils de huit ans allergique à l'arachide, **je veux**
> déclarer son allergie sans lui créer un compte, **pour que** le plat de ce
> soir en tienne compte.

> **Quand** j'écris « arachide » parce que je parle français, **je veux** que ça
> couvre aussi bien « satay » ou « nut butter », **pour ne pas** découvrir que
> la garde ne connaissait que le mot anglais.

> **Quand** j'interdis le Nutella à ma fille sans raison médicale, **je veux**
> que ce ne soit pas traité comme une allergie, **pour que** le produit ne
> présente pas ma décision comme un avis de santé.

## 3. Périmètre

### Dans le périmètre
- Une table à part, `household_member_allergies`, clée sur `member_id`.
- La **dérivation du slug à la lecture**, contre `ALLERGEN_SURFACE_FORMS`.
- La projection vers la forme que le générateur unit déjà
  (`StudentSafetyConstraint`), avec le **même fail-closed**.
- La séparation allergie / règle de maison décidée **une fois**, dans une
  fonction qui rend les deux sorties.
- Les deux RPC d'écriture, et la carte d'écran qui les appelle.

### Hors périmètre — engageant
- ❌ **Aucune colonne `kind` sur `household_food_restrictions`.** Le générateur
  lit déjà cette table **sans clause de `kind`** : une colonne y ferait entrer
  les allergies dans le verrou domestique, celui qui efface le pourquoi. Une
  allergie tue de sa raison médicale est exactement l'inverse de ce qu'il faut.
- ❌ **Aucune colonne `severity`, aucune colonne `kind` sur la table neuve.**
  Toute ligne d'ici vaut `kind='allergy'`, `severity='medical'`. Une colonne à
  valeur unique invite un lecteur, dans six mois, à en réactiver une seconde
  sans relire ce qui en dépend — même raison qui a fait **supprimer**
  `households.kind`.
- ❌ **Le slug n'est pas stocké.** Voir R2 : le stocker figerait la couverture au
  jour de la saisie.
- ❌ **Aucune résolution en SQL.** Elle serait une seconde copie de la table des
  formes de surface, à côté de celle qui vit en TypeScript avec le matcher.
- ❌ **Aucune intolérance, aucune aversion dans cette table.** Trois natures,
  trois traitements : allergie → union de sécurité ; règle de maison → verrou
  qui tait le pourquoi ; aversion → préférence.

## 4. Le circuit

```
   ÉCRAN (compte maître)
     « arachide »
        │  keel_household_add_allergy(member_id, label)
        ▼
   household_member_allergies      ← le MOT de la personne, dans sa langue
     (member_id, label, created_by)   jamais un slug
        │
        │  loadHouseholdAllergies(db, householdId)   ← LÈVE sur toute panne
        ▼
   householdAllergenRefs("arachide")
        1. le libellé NOMME un slug connu ?
        2. sinon: une FORME DE SURFACE ?     → `peanut`
        3. et TOUJOURS le mot slugifié       → `arachide`
        │
        ▼
   householdHardConstraints({allergies, houseRules, contentLocale})
        │                                   │
        ▼                                   ▼
   safetyConstraints[]                 houseRuleLabels[]
   severity='medical'                  → applyHouseRuleLock
   → union avec student_safety_            (efface le « pourquoi »)
     constraints des comptes du foyer
        │
        ▼
   le prompt du générateur + la ceinture de sortie
```

**L'endroit où deux chemins se rejoignent** est `householdHardConstraints`
(`_shared/keel/household_safety.ts:200`). La séparation y est décidée **une
fois** ; la calculer aux deux points d'appel remettrait la question « et si on
mélangeait ? » à chaque lecture.

## 5. Modèle de données

| Champ | Où | Origine | Note |
|---|---|---|---|
| `member_id` | `household_member_allergies` | FK vers `household_members` | **Clé sur la bouche, jamais sur un compte.** C'est tout l'objet de la fiche. |
| `label` | idem | **saisi**, à la main, dans la langue de la personne | `CHECK` 1..120 caractères. |
| `created_by` | idem | `auth.uid()` | Rien n'est secret dans ce foyer. Une allergie posée par erreur sur la mauvaise bouche doit pouvoir être remontée à quelqu'un. |
| `allergenRef` | *dérivé* | `householdAllergenRefs(label)` (`household_safety.ts`) | **Jamais stocké.** Voir R2. |
| `severity`, `kind`, `declaredBy` | *en dur* | `medical`, `allergy`, `student` | Voir §3, hors périmètre. `declaredBy='student'` parce que le vocabulaire fermé ne distingue que « le coach » de « la personne qui mange », et le compte maître est du second côté. |
| `userId` de la contrainte projetée | *vide* | — | Une bouche sans compte n'a pas d'identifiant de compte. Y mettre son `member_id` ferait **une fixture qui ment** — un identifiant de membre rangé dans un champ de compte. Vérifié : aucun consommateur de cette lane ne lit ce champ. |

Unique sur `(member_id, label)` — et **pas** sur `(household_id, member_id,
label)` : depuis FF-044, `member_id` détermine le foyer à lui tout seul, et l'y
remettre donnerait une clé qui a l'air composite sans l'être.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | **Une allergie devient un IDENTIFIANT ; une règle de maison reste un libellé** | C'est la ligne de partage de toute la fiche. Un identifiant arme une ceinture déterministe ; un libellé ne fait qu'entrer dans un verrou de texte. |
| R2 | **Le slug est dérivé à la lecture, jamais stocké** | Deux conséquences voulues : la table des formes de surface grandit ⇒ les lignes **déjà écrites** gagnent la couverture, sans migration de données ; et « arachide » retrouve `peanut`, donc ses formes (« satay », « nut butter », « PB »). Sans ça, une allergie saisie en français ne mordrait que sur le mot français — la faute `guard-tested-in-one-language-only`, et le produit sort en français par défaut. |
| R3 | **Trois crans, et le dernier garde toujours le mot slugifié** | La couverture ne peut pas **rétrécir** : le pire cas d'un mot inconnu de la table est exactement ce qu'on aurait eu sans les crans 1 et 2. |
| R4 | **Une ambiguïté rend PLUSIEURS slugs, elle n'en choisit pas un** | « nut butter » est une forme de surface de `peanut` **et** de `tree_nut`. En garder un seul déciderait, à la place d'un parent, laquelle des deux allergies compte. Sur-bloquer escalade ; sous-bloquer sert l'allergène ; seul le premier est récupérable. |
| R5 | **La lecture LÈVE, elle ne rend jamais « aucune allergie »** | Une liste vide et une requête ratée sont indiscernables pour un appelant qui avale l'erreur, et la différence est **médicale**. Ici la conséquence est pire d'un cran que sur le chemin individuel : le repas est servi à plusieurs personnes, dont des enfants qui n'ont pas déclaré eux-mêmes. |
| R6 | **Fail-closed au sens FORT** — lecture impossible ⇒ **aucune composition** | À ne pas confondre avec le corps ([FF-047](FF-047-le-corps-dans-la-part-du-foyer.md)), qui est best-effort : une portion mal dimensionnée est le produit d'hier ; un dîner sans verrou d'allergène est un danger. |
| R7 | **La prose n'est jamais matchée** | Le `notes` garde le libellé pour qu'un journal de violation soit lisible par un humain, **pas** pour mordre. Ce qui mord est l'identifiant. |
| R8 | **Une allergie d'une seule bouche gouverne toute la casserole** | Le produit vend **une** cuisson. Un plat « sans arachide sauf pour les autres » n'existe pas dans une seule casserole. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| La lecture des allergies du foyer échoue | **La génération s'arrête** (`safety_constraints_unreadable`). Aucun repli, aucun plat servi sans ceinture. |
| Un libellé inconnu de la table des formes | Le cran 3 le slugifie : la couverture est celle du mot écrit, jamais zéro. |
| Un libellé vide | La ligne n'entre pas (`CHECK` en base) ; et `householdAllergenRefs("")` rend `[]`. |
| La même allergie saisie deux fois sur la même bouche | Refusée par l'unique `(member_id, label)`. |
| Une allergie écrite **aussi** en règle de maison | La règle de maison passe par le verrou qui tait le pourquoi ; l'allergie par l'union de sécurité. Les deux chemins coexistent, et une assertion de `household_rls_test.sql` rougit si les deux tables portent la même chose. |
| **⚠️ Le chat** — « je cuisine quoi ce soir ? » | **TROU CONNU, NON REFERMÉ (n°1 du [README](README.md)).** `sophia-brain/router/run.ts:1329` charge `student_safety_constraints` du **seul locuteur** ; le seul lecteur serveur de `household_member_allergies` est `_shared/keel/household_safety.ts:273`, appelé uniquement par `generate-household-meal-v1`. Un parent qui pose la question dans le chat **n'a pas l'allergie de son enfant armée**. La ceinture de sortie du chat (`applyKeelOutputLocks`) n'a donc rien à comparer. |
| **⚠️ À ce jour, le générateur lui-même** | Le câblage (`loadHouseholdAllergies`, `householdHardConstraints`, `applyHouseRuleLock` alimenté par les seules règles de maison) est **sur le disque et non commité** : `generate-household-meal-v1/index.ts` importe aussi des modules d'une autre session en vol. Tant que ce commit n'est pas fait, `household_member_allergies` est écrite par l'écran et lue par **personne** côté serveur. C'est la raison du statut 🟠. |

## 8. Critères d'acceptation

```gherkin
Étant donné une bouche SANS COMPTE portant l'allergie « arachide »
Quand le foyer génère un repas
Alors l'union de sécurité contient le ref `peanut`
Et elle contient aussi le ref littéral `arachide`
```

```gherkin
Étant donné un foyer dont la table des allergies est illisible
Quand la génération est demandée
Alors elle échoue avec un motif nommé
Et aucun plat n'est écrit
```

```gherkin
Étant donné une règle de maison « nutella » posée sur un enfant
Quand un plat est composé
Alors le « pourquoi » du plat ne mentionne pas la règle
Et cette règle n'apparaît dans aucune contrainte de sévérité médicale
```

```gherkin
Étant donné une allergie déclarée « nut butter »
Quand les identifiants sont résolus
Alors `peanut` ET `tree_nut` sont tous les deux rendus
```

## 9. Rabbit holes

- **La colonne `kind` qui paraît économe.** Une colonne sur
  `household_food_restrictions` évite une table — et fait entrer les allergies
  dans le verrou domestique, parce que le générateur lit cette table **sans
  clause de `kind`**. Le coût d'une table est trivial ; le coût de cette
  confusion est un enfant.
- **Stocker le slug « pour aller plus vite ».** La couverture serait figée au
  jour de la saisie, et enrichir la table des formes de surface n'améliorerait
  plus rien pour les lignes existantes.
- **Choisir un slug quand le libellé est ambigu.** C'est un arbitrage médical
  déguisé en détail d'implémentation.
- **Croire que la ceinture du chat est armée parce qu'elle existe.** Elle l'est
  — sur les contraintes du locuteur. C'est le trou n°1, et c'est exactement le
  motif « une garantie écrite comme globale, implémentée sur 1 chemin sur N »
  que `keel_output_locks.ts` documente dans son propre en-tête.

## 10. Ce qu'on mesure

- **La mesure :** part des foyers de deux bouches ou plus qui portent **au moins
  une** allergie déclarée. Si elle est nulle, la table est un réservoir vide et
  la ceinture est armée sur du néant (cicatrice
  `safety-constraints-armed-belt-empty-vault`).
- **La contre-mesure :** nombre de générations refusées pour
  `safety_constraints_unreadable`. Un fail-closed qui refuse des dîners
  quotidiennement n'est pas une ceinture, c'est une panne.

## 11. Questions ouvertes

1. **Le chat.** Refermer le trou n°1 demande de décider **quoi** charger : les
   allergies du foyer du locuteur, ou seulement les siennes ? Charger le foyer
   arme la ceinture pour la bonne conversation, et fait aussi apparaître, dans
   un message, une allergie que le locuteur n'a pas déclarée lui-même. Ce n'est
   pas une ligne de code, c'est un arbitrage de vie privée intra-familiale.
2. **Aucun run réel du générateur** n'a validé cette lane : `POST
   generate-household-meal-v1` rend 404 en local (registre du routeur edge figé
   au démarrage du CLI), et la version commitée reproduit le symptôme.
3. **La table des formes de surface est-elle assez large en français ?** Elle a
   été écrite pour le chemin individuel, où l'intake passe par le modèle. Ici
   c'est un parent qui tape à la main, et personne n'a mesuré la couverture
   réelle des mots qu'un parent français écrit spontanément.
