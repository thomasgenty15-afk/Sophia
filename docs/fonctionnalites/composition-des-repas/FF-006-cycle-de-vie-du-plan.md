# FF-006 · Refaire sa semaine sans perdre celle d'avant

| | |
|---|---|
| **Identifiant** | `FF-006-cycle-de-vie-du-plan` |
| **Statut** | 🔵 Idée — revue d'usage, pas de refonte |
| **Date** | 2026-08-07 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) (l'élève compose sa semaine) |
| **Dépend de** | `meal_plan_window.ts` · RPC `write_student_meal_plan` · `MealBuilder` |
| **Effort estimé** | 1 à 2 jours — **d'observation d'abord**, de code ensuite |

---

## 1. Le problème

La mécanique est **construite, transactionnelle et testée** : deux intentions
(`replace_current`, `prepare_next`), un verrou consultatif par élève, la
troncature du plan qui chevauche, un refus nommé `plan_overlaps_existing`, un
index UNIQUE qui garantit une seule composition vivante par jour de départ.

> ⚠️ **Mise à jour du 2026-08-11 — « une seule » est tenu par TROIS mécanismes,
> et la fiche n'en nommait qu'un.** À la boucle de chevauchement de la RPC
> s'ajoutent un **index unique** et une **contrainte d'exclusion**, toutes deux
> sur la table. Les deux couches physiques refusent la ligne *avant* que la
> fonction ait son mot à dire : l'appelant reçoit alors une violation de
> contrainte Postgres, pas le refus nommé que cette fiche décrit. Qui touche à
> la règle doit les déplacer **ensemble** — elles n'ont été trouvées qu'en
> exécutant un test, l'une après l'autre, la première masquant la seconde.
>
> **Mais trois mécanismes ne font que DEUX garanties distinctes.** Mesuré le
> 2026-08-11 : `duration_days` est borné `>= 1`
> (`student_generated_meals_duration_days_check`), donc deux lignes vivantes de
> même `(user_id, plan_kind, starts_on)` ont **toujours** des `daterange` qui se
> chevauchent. La contrainte d'exclusion refuse donc déjà tout ce que l'index
> unique refuse : l'index ne change que **le nom de l'erreur**, jamais
> l'ensemble des lignes admises. Ne pas le prendre pour une défense
> indépendante.
>
> Depuis la même date, la clé porte aussi **`plan_kind`** (`personal` |
> `household`) : le maître d'un foyer doit pouvoir tenir son plan personnel
> **et** le plan commun sur la même semaine. L'unicité est donc « un seul plan
> vivant par personne, par **nature**, et par jour de départ ». Détail et motif :
> [CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md](../../keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md).
Elle a même déjà encaissé une correction réelle : le 2026-08-07, l'intention se
**déduisait** de l'occupation de l'onglet, et « préparer la suite » retirait le
plan en cours — l'élève perdait la semaine pour laquelle il avait fait ses
courses. C'est corrigé : une intention se stocke, elle ne se devine pas.

Ce qui reste n'est donc pas un défaut de mécanique. C'est qu'**on ne sait pas si
les gens comprennent ce qu'ils font** quand ils appuient. « Remplacer » et
« préparer la suite » sont deux gestes dont l'un est destructeur, et le produit
n'a aujourd'hui aucune mesure de la fréquence à laquelle le mauvais est choisi.

**Ce que ça coûte.** Inconnu, et c'est précisément le problème. Un geste
destructeur dont on ne mesure pas les regrets est un geste qui coûte peut-être
cher depuis des mois. Le défaut de l'intention déduite n'a été trouvé qu'en
relisant le code — pas par un signal.

## 2. Job stories

> **Quand** ma semaine ne me va plus au bout de deux jours, **je veux** la
> refaire sans perdre ce que j'ai déjà cuisiné, **pour que** le dimanche que
> j'ai passé en cuisine ne soit pas perdu.

> **Quand** je prépare la semaine prochaine, **je veux** être certain que celle
> en cours ne bouge pas, **pour que** je n'aie pas peur d'appuyer.

## 3. Périmètre

### Dans le périmètre
- **Observer avant de coder** : instrumenter les deux gestes et mesurer.
- La **lisibilité de ce qui va se passer** avant confirmation : quel plan est
  touché, quels jours disparaissent, ce qui est déjà coché et sera perdu.
- Le sort des **repas déjà cochés** dans la fenêtre remplacée — aujourd'hui la
  question n'est pas posée à l'élève.
- Une **sortie de secours** après un remplacement regretté, si et seulement si
  la mesure montre que le regret existe.

### Hors périmètre — engageant
- ❌ **On ne touche pas à la RPC `write_student_meal_plan`.** Verrou, troncature,
  refus nommé, index UNIQUE : c'est la partie solide, testée, et elle est la
  raison pour laquelle aucune de ces manipulations n'a jamais corrompu de
  données. Une revue d'usage ne descend pas dans la transaction.
- ❌ **On ne remet pas l'intention en déduction.** Elle a déjà coûté une semaine
  à quelqu'un. Elle se stocke, point.
- ❌ **Pas de corbeille, pas d'historique de versions de plan.** Tant que la
  §10 n'a pas montré que le regret est fréquent, construire une restauration
  serait construire pour une hypothèse.
- ❌ **Pas de régénération automatique** quand une contrainte change après coup
  (absence déclarée tard, stratégie de courses basculée). Un plan qui se réécrit
  tout seul est un plan sur lequel on ne peut plus compter — voir
  [FF-005](FF-005-strategie-de-courses.md) R3.

## 4. Le circuit

```
  MealBuilder — deux onglets : « en cours » | « suivant »
      │
      ├─ « Refaire ce plan »      → formIntent = replace_current
      │                             replaces = <id du plan regardé>
      │
      └─ « Préparer la suite »    → formIntent = prepare_next
                                    replaces = null
      ↓
  resolveRequestedWindow — la fenêtre demandée
      ↓
  generate-meal-v1 → RPC write_student_meal_plan
      │
      ├─ verrou consultatif par élève
      ├─ le plan qui chevauche est TRONQUÉ (pas supprimé)
      ├─ chevauchement irréductible → `plan_overlaps_existing`
      ├─ index UNIQUE (user_id, plan_kind, starts_on) where retired_at is null
      └─ contrainte d'EXCLUSION (user_id, plan_kind, daterange) idem
      ↓
  ┌────────────────────────────────────────────────────┐
  │  LE TROU DE CETTE FICHE — il est ICI, en amont     │
  │  Ce que l'élève LIT avant de confirmer :           │
  │  · quels jours vont disparaître ?                  │
  │  · combien de repas déjà cochés ?                  │
  │  · que devient ce que j'ai déjà cuisiné ?          │
  └────────────────────────────────────────────────────┘
```

Tout ce qui est sous la RPC est bon. Tout ce qui est au-dessus n'a jamais été
observé.

## 5. Modèle de données

**Néant de neuf.** Tout existe : `starts_on`, `duration_days`, `ends_on`
(générée), `retired_at`, l'index UNIQUE.

La seule addition envisagée est de **journalisation**, pas de produit : un
événement par geste (`intent`, jours écrasés, repas cochés perdus) pour rendre
la §10 mesurable. Il ne se lit dans aucun écran.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | L'intention vient du **geste**, jamais de l'état de l'onglet | Défaut mesuré le 2026-08-07 : la déduction a retiré un plan en cours à quelqu'un qui préparait le suivant. |
| R2 | Un remplacement **tronque**, il ne supprime pas | Déjà tenu par la RPC. Écrit ici pour que personne ne « simplifie » la troncature en suppression. |
| R3 | Ce qui va disparaître est **nommé avant** confirmation, pas après | Un geste destructeur sans aperçu est un geste qu'on regrette. |
| R4 | Les repas **déjà cochés** ne sont jamais silencieusement perdus | Une coche est un fait que l'élève a posé. L'effacer sans le dire réécrit son histoire — le dépôt tient déjà cette règle ailleurs. |
| R5 | Aucune régénération n'est déclenchée par un changement de contrainte | Un plan stable est ce qui permet de faire ses courses. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Deux générations concurrentes pour le même élève | Le verrou consultatif tranche ; la seconde attend. **Déjà tenu.** |
| Chevauchement irréductible | `plan_overlaps_existing`, refus nommé, plan existant intact. **Déjà tenu.** |
| Remplacement d'une fenêtre contenant des repas cochés | **Trou actuel.** Attendu : l'élève lit combien, et confirme. |
| L'élève regrette immédiatement | **Trou actuel.** Attendu : à instruire seulement si la §10 montre que le cas existe. |
| Fenêtre demandée entièrement dans le passé | À vérifier — `planWindowState` connaît `elapsed`, mais rien ne dit ce que l'écran en fait au moment de composer. |

## 8. Critères d'acceptation

```gherkin
Étant donné un plan en cours contenant trois repas cochés
Quand l'élève demande à le refaire
Alors l'écran nomme les jours qui vont changer
Et indique que trois repas cochés seront perdus
Et rien n'est écrit avant confirmation
```

```gherkin
Étant donné un plan en cours et un plan suivant
Quand l'élève appuie sur « préparer la suite »
Alors le plan en cours n'est ni tronqué, ni retiré
Et ce, quel que soit l'onglet qu'il regardait
```

```gherkin
Étant donné deux générations lancées en même temps pour le même élève
Quand elles atteignent la RPC
Alors une seule écrit
Et l'autre attend le verrou, sans échouer
```

## 9. Rabbit holes

- **La tentation de refondre ce qui marche.** C'est le risque principal de cette
  fiche. La mécanique transactionnelle est la partie la plus solide de tout le
  domaine ; l'ouvrir pour améliorer un libellé serait un très mauvais échange.
  Le périmètre est **au-dessus** de la RPC, et il y reste.
- **« Perdu » n'est pas « supprimé ».** Un plan tronqué existe encore ; ses
  repas cochés aussi. Avant d'écrire à l'élève que quelque chose est perdu, il
  faut vérifier ce que la troncature laisse réellement — sinon on lui annonce
  une perte qui n'a pas lieu, ce qui est une autre façon de mentir.
- **Mesurer sans instrumenter est impossible**, et instrumenter est déjà du
  code. L'ordre proposé (observer, puis coder) suppose donc une première
  livraison qui n'est que de la journalisation. Ne pas la sauter au prétexte
  qu'elle ne se voit pas.

## 10. Ce qu'on mesure

- **La mesure :** part des remplacements suivis d'une **nouvelle génération dans
  l'heure** — le signal le plus direct d'un geste regretté. Et part des
  remplacements qui écrasent au moins un repas coché.
- **La contre-mesure :** part des élèves qui **cessent de régénérer** après
  qu'un avertissement a été ajouté. Un aperçu qui fait peur au point qu'on
  n'ose plus refaire sa semaine a transformé un outil en piège — et il vaut
  alors mieux le libellé d'avant.

## 11. Questions ouvertes

1. **Que deviennent les repas cochés d'une fenêtre remplacée ?** Conservés comme
   trace de ce qui a été mangé, ou retirés avec le plan ? Ce sont deux vérités
   différentes, et la réponse touche le suivi, pas seulement la composition.
2. **Le regret existe-t-il vraiment ?** Toute la §3 en dépend. Sans la mesure, la
   sortie de secours est une supposition.
3. **`elapsed` au moment de composer** — que propose l'écran quand la fenêtre
   demandée est déjà passée ? À vérifier avant de décider s'il y a un trou.
