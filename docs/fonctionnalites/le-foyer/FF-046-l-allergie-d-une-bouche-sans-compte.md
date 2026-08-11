# FF-046 · L'allergie d'une bouche sans compte

| | |
|---|---|
| **Identifiant** | `FF-046-l-allergie-d-une-bouche-sans-compte` |
| **Statut** | 🟢 **Livrée** — la table, le module et l'écran (`26de20ab`) ; **le fil du générateur** (`9cd01739`) ; **le chat** (`5dfdddb2`). Un trou résiduel nommé en §7 : `plan_question` |
| **Date** | 2026-08-11 |
| **Autorité produit** | [CONTRACT.md](../../keel/CONTRACT.md) · [le-foyer/README.md](README.md) (F9, F10) · [FF-021](../conversation/FF-021-le-plancher-de-restriction-alimentaire.md) pour la famille de ceintures |
| **Dépend de** | [FF-044](FF-044-la-bouche-sans-compte.md) — la table est clée `member_id` · [FF-045](FF-045-decrire-son-foyer.md) — l'écran qui la remplit |
| **Effort estimé** | livrée — 1,5 jour |

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
(`_shared/keel/household_safety.ts:201`). La séparation y est décidée **une
fois** ; la calculer aux deux points d'appel remettrait la question « et si on
mélangeait ? » à chaque lecture.

### La seconde lane — le chat (`5dfdddb2`)

```
   sophia-brain/router/run.ts   ← le chemin de TOUTES les conversations
        │
        │ resolveHouseholdIdFor(supabase, userId)        (run.ts:1453)
        │   UNE SEULE résolution, partagée par les deux lanes du foyer
        │   pas de foyer → la constante NO_HOUSEHOLD_SAFETY, ZÉRO requête
        ▼
   loadHouseholdTurnSafety({householdId, contentLocale})  (run.ts:1463)
        │   ne lève JAMAIS. Deux états, jamais confondus:
        │     constraints: [...]         unreadableReason: null
        │     constraints: []            unreadableReason: "<panne>"
        ▼
   ┌──────────────────────────┐        ┌──────────────────────────────┐
   │ LE PROMPT — DEUX BLOCS   │        │ LA CEINTURE — UNE SEULE      │
   │ householdAllergyPrompt   │        │ beltConstraints =            │
   │   Block()   (run.ts:2349)│        │   locuteur ∪ foyer           │
   │                          │        │             (run.ts:2694-97) │
   │ « THIS STUDENT'S HARD    │        │ + les refs du foyer sont     │
   │   CONSTRAINTS » reste    │        │   RETIRÉES du désarmement    │
   │   au locuteur SEUL       │        │   par rétractation (:2706)   │
   └──────────────────────────┘        └──────────────────────────────┘
```

**Le point qui gouverne ce second dessin** : *les deux listes se rejoignent là
où l'attribution ne compte pas, et restent séparées là où elle compte.* Verser
l'allergie d'un enfant dans le bloc titré « THIS STUDENT'S HARD CONSTRAINTS »
ferait dire au modèle qu'un **parent** est allergique — un fait faux sur une
personne. `safety_constraints.ts` n'a pas été touché.

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
| R9 | **Deux blocs de prompt, une seule ceinture** | Le prompt ATTRIBUE (il dit « tes contraintes »), la ceinture NOMME (elle refuse un mot). Mélanger les listes là où le prompt attribue produit un **fait faux sur une personne** ; les séparer là où la ceinture refuse produirait une allergie non armée. `householdAllergyPromptBlock` (`household_safety.ts:469`) est le second bloc ; `beltConstraints` (`run.ts:2694-2697`) est l'union. |
| R10 | **Une rétractation ne désarme JAMAIS une contrainte du foyer** | Le désarmement n°5 de la ceinture existe pour qu'on puisse s'entendre nommer **sa propre** contrainte quand on vient de la retirer. Une allergie de foyer n'est pas la sienne : la rétractation du chat n'écrit que dans `student_safety_constraints`, la ligne du foyer **survit**, et l'honorer ferait taire l'allergie d'un enfant parce qu'un adulte a dit que la sienne avait disparu. `householdConstraintRefs` (`household_safety.ts:420`) filtre le désarmement (`run.ts:2706`). |
| R11 | **Panne de lecture dans le chat : on ne coupe pas le tour, on coupe LE VERBE** | Le générateur répond 503 et ne compose rien — juste, sa seule sortie **est** un repas. Un tour de chat porte aussi le routage de crise et le renvoi clinicien ; refuser le tour serait **plus strict que la lane individuelle**, qui fail-open nommément pendant la même panne. Retenu : interdiction de proposer, nommer ou recommander un aliment pour ce foyer ce tour-ci, dite explicitement (`HOUSEHOLD_SAFETY_UNREADABLE_BLOCK`, `household_safety.ts:513`), le reste du tour intact. |
| R12 | **La portée de la dégradation s'arrête à ce qu'on SAIT** | Une panne sur `household_members` (la résolution) n'arme **rien** : on ignore alors s'il y a un foyer, et la dégradation frapperait aussi ceux qui vivent seuls. Ce qui arme, c'est de savoir qu'il y a des bouches et de ne pas pouvoir lire leurs contraintes — le mode de panne réaliste d'une table jeune (grant, RLS, migration en vol). |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| La lecture des allergies du foyer échoue | **La génération s'arrête** (`safety_constraints_unreadable`). Aucun repli, aucun plat servi sans ceinture. |
| Un libellé inconnu de la table des formes | Le cran 3 le slugifie : la couverture est celle du mot écrit, jamais zéro. |
| Un libellé vide | La ligne n'entre pas (`CHECK` en base) ; et `householdAllergenRefs("")` rend `[]`. |
| La même allergie saisie deux fois sur la même bouche | Refusée par l'unique `(member_id, label)`. |
| Une allergie écrite **aussi** en règle de maison | La règle de maison passe par le verrou qui tait le pourquoi ; l'allergie par l'union de sécurité. Les deux chemins coexistent, et une assertion de `household_rls_test.sql` rougit si les deux tables portent la même chose. |
| La lecture du foyer échoue **dans le chat** | La conversation continue. Le tour porte l'interdiction explicite de **proposer, nommer ou recommander un aliment** pour ce foyer (R11), et `unreadableReason` + un `console.warn` bruyant rendent la panne lisible. Jamais « ce foyer n'a pas d'allergie » : c'est toute la raison d'être des deux états. |
| Le locuteur **rétracte** une allergie dans le chat | Sa ligne à lui se retire de `student_safety_constraints` ; **les refs du foyer restent armées** (R10). Retirer une allergie de foyer se fait sur l'écran du foyer, là où elle a été écrite. |
| ~~**⚠️ Le chat** — « je cuisine quoi ce soir ? »~~ | ✅ **TROU n°1 — REFERMÉ (`5dfdddb2`, chantier 5).** `run.ts` résout le foyer une fois (`:1453`), charge son union (`:1463`), pousse un second bloc de prompt (`:2349`) et unit les deux listes sur la ceinture de sortie (`:2694-2697`). Un parent qui demande « je cuisine quoi ce soir ? » a désormais l'allergie de son enfant armée. Prouvé sur le pire cas : foyer de 8, sept jours de préparations, le bloc coupe sa liste de courses et dépasse son plancher documenté — `AVOID: peanut, arachide` est intact. La garde mord dans les **deux langues** : « arachide » couvre `peanut butter`, `nut butter`, `PB`, `satay`, `beurre de cacahuète`, `cacahuètes`. |
| ~~**⚠️ À ce jour, le générateur lui-même**~~ | ✅ **REFERMÉ (`9cd01739`).** Le câblage est commité, dans le commit qui portait aussi la ligne d'envies : lecture des allergies de foyer sous le **même** fail-closed 503, `householdHardConstraints`, et `applyHouseRuleLock` alimenté par les **seules** règles de maison — un allergène ne doit jamais passer par le verrou qui **tait** le pourquoi du plat. `household_safety.ts` a désormais deux importeurs de production : `generate-household-meal-v1/index.ts:59` et `sophia-brain/router/run.ts:331`. |
| **⚠️ Le skill `plan_question`** — « je peux remplacer le poulet par quoi ? » | **TROU CONNU n°8, NON REFERMÉ.** `loadPlanQuestionRuntime` (`run.ts:2099`) **recharge** les contraintes par `loadStudentSafetyConstraints` seul (`run.ts:2155-2159`) — sans l'union du foyer — et les passe au résolveur d'échange (`skills/plan_question/swap_resolver.ts:93,150`). Conséquence exacte : le résolveur peut **approuver** un échange que la ceinture de sortie mange ensuite. La sécurité tient (la ceinture, elle, connaît le foyer) ; la **cohérence** non — l'élève lit une proposition amputée sans savoir pourquoi. |

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

```gherkin
Étant donné un parent dont l'enfant SANS COMPTE est allergique à l'arachide
Quand il demande « je cuisine quoi ce soir ? » DANS LE CHAT
Alors la ceinture de sortie porte le ref `peanut`
Et le bloc de prompt du foyer ne dit pas que le PARENT est allergique
```

```gherkin
Étant donné un utilisateur SANS foyer
Quand il envoie un message
Alors `household_members` est lue UNE fois
Et `household_member_allergies` est lue ZÉRO fois
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
- **Croire qu'une ceinture est armée parce qu'elle existe.** C'était le trou
  n°1 : elle l'était, sur les contraintes du **locuteur** seul. C'est le motif
  « une garantie écrite comme globale, implémentée sur 1 chemin sur N » que
  `keel_output_locks.ts` documente dans son propre en-tête — et le trou n°8
  (`plan_question`) est **le même motif, un cran plus bas** : la ceinture de
  sortie connaît le foyer, le résolveur qui décide **avant elle** ne le connaît
  pas. Refermer une lane ne referme pas la famille.
- **Verser les deux listes dans le même bloc de prompt.** Le raccourci coûte un
  fait faux sur une personne : « tu es allergique à l'arachide » dit à un parent
  qui ne l'est pas. Voir R9.

## 10. Ce qu'on mesure

- **La mesure :** part des foyers de deux bouches ou plus qui portent **au moins
  une** allergie déclarée. Si elle est nulle, la table est un réservoir vide et
  la ceinture est armée sur du néant (cicatrice
  `safety-constraints-armed-belt-empty-vault`).
- **La contre-mesure :** nombre de générations refusées pour
  `safety_constraints_unreadable`. Un fail-closed qui refuse des dîners
  quotidiennement n'est pas une ceinture, c'est une panne.

## 11. Questions ouvertes

1. ✅ **Le chat — TRANCHÉ (`5dfdddb2`).** La question était : charger les
   allergies du foyer arme la ceinture pour la bonne conversation, et fait
   aussi apparaître, dans un message, une allergie que le locuteur n'a pas
   déclarée lui-même. **Arbitrage retenu** : on charge le foyer, et le bloc
   **ne NOMME pas** de qui est l'allergie — pas de jointure roster, donc aucune
   dépendance à `localDate` non plus. La vie privée intra-familiale est
   protégée par l'**anonymat de la contrainte**, pas par son absence.
2. **La ceinture mord sur TOUT le tour, pas seulement sur la casserole.**
   Décision produit non tranchée (n°B du [README](README.md)) : dans un foyer
   où une allergie au lait est déclarée, Sophia cesse de nommer le lait même à
   propos de l'assiette du seul locuteur. Sur-blocage assumé — c'est déjà le
   comportement du générateur — mais désormais **visible** dans la
   conversation.
3. **`plan_question` (trou n°8).** Refermer demande de décider où l'union
   entre : dans `loadPlanQuestionRuntime`, ou en amont pour tous les skills.
   Le second est le bon geste et le plus large ; personne ne l'a tranché.
4. **Aucun run réel du générateur** n'a validé cette lane : `POST
   generate-household-meal-v1` rend 404 en local (registre du routeur edge figé
   au démarrage du CLI), et la version commitée reproduit le symptôme. Le
   chantier 5 n'a **pas** eu de run réel non plus — un restart du runtime edge
   était nécessaire et n'a pas été fait, une autre session travaillant en
   parallèle.
5. **La table des formes de surface est-elle assez large en français ?** Elle a
   été écrite pour le chemin individuel, où l'intake passe par le modèle. Ici
   c'est un parent qui tape à la main, et personne n'a mesuré la couverture
   réelle des mots qu'un parent français écrit spontanément.
