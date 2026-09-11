# Banc foyer — journal des tirs

Phase 2 de `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md` : la méthode à
plusieurs bouches. Fixtures empruntées à la campagne 9 POINTS (`duo`, `quatre`,
`cinq`), jamais recréées ici.

Chaque tir : fenêtre **1 jour**, `starts_on = demain`, `intent: draft`, fuseau
choisi pour que l'horloge du foyer soit entre 8 h et 16 h (sans quoi
`leadDayFor` rend `same_morning` et la journée part vide).

---

## Lot 9 — la grille des cases, calculée avant le prompt (mesure seule)

Code mesuré : empreinte `dd6c142f6c42`, inchangée avant/après les deux tirs.
`sizing_path: legacy_measure` sur les deux : **rien n'est appliqué**, le lot ne
déplace aucun gramme.

### `duo` — le cas qui passe · 2026-09-07 22:50 · 56 s · http 200

| Compteur | Valeur | Lecture |
|---|---|---|
| `cells` / `non_empty` / `empty` | 6 / 4 / 2 | 2 jours × 3 moments ; la veille perd son petit-déjeuner et son déjeuner (tir à 16 h 50) |
| `eaters_hist` | `{2: 4}` | les deux bouches à chaque case pleine |
| `dedicated_cells` | **0** | aucun régime déclaré : personne n'a de plat à part |
| `light` / `light_mixed` | 0 / 0 | aucun « repas léger » sur cette fixture |
| `cook_day_cells` | 3 | la veille garde ses cases — comportement d'avant, conservé exprès |
| `spent_cells` | 4 | 2 moments passés × 2 bouches |
| **`dish_bearing_delta`** | **0** | les deux règles du plat à part nomment les mêmes gens : personne |

Témoin de projection : `meals_delivered.expected = 8` = 4 cases pleines × 2
bouches. La livraison lit donc bien la grille, et pas une seconde construction.

### `quatre` — la table qui sépare les deux règles · 22:51 · 104 s · http 200

Roster : Paul (sans objectif), Claire (maintien), Léo (mineur, maintien),
**Nora (végane, maintien)**.

| Compteur | Valeur | Lecture |
|---|---|---|
| `eaters_hist` | `{4_plus: 4}` | les quatre bouches à chaque case pleine |
| `regime_by_cell` | `{none: 4}` | **la casserole suit la majorité omnivore** (3 sur 4) |
| `dedicated_cells` / `dedicated_mouths` | **4 / 4**, motif `regime` | Nora a son plat à chacune de ses quatre cases |
| **`dish_bearing_delta`** | **1** (`only_cells: 1`) | la grille nomme une bouche que la lane ne nomme pas |

Et la lane, au même tir : `cooking_shape.dish_bearing = []`, `diverging = []`.

**C'est la décision produit en chiffres, sur un foyer réel, avant qu'un seul
gramme ne bouge.** Aujourd'hui la table de quatre mange végane toute la semaine
et personne n'a de plat à part ; avec la règle décidée le 2026-09-07, la
casserole reste omnivore et Nora reçoit le sien. L'écart vaut exactement une
bouche, et c'est celle qu'on attendait.

Témoin de projection : `meals_delivered.expected = 16` = 4 cases × 4 bouches.

### Ce que les deux tirs disent d'autre, et qui ne vient pas de ce lot

`missing: 2` (duo) et `missing: 4` (quatre), tous `mon/dinner:no_dish` : le
modèle n'a composé aucun dîner pour le seul jour mangé. Une relance a été
tentée (`retry_attempts: 1`) et n'a rien rendu. C'est un défaut de composition,
antérieur et indépendant de la grille — à regarder, mais pas ici.

---

## Lot 10 — le dimensionnement par mangeur, en OMBRE

Code mesuré : empreinte `500d1ed1d021`, inchangée avant/après. `sizing_path:
legacy_measure` et `applied: false` sur les deux tirs : **rien n'est posé**, les
grammes servis restent ceux du modèle. L'ombre calcule le contrefactuel dans le
MÊME run, sans variance de modèle entre les deux chiffres.

| Compteur | `duo` (2 bouches) | `quatre` (4 bouches) |
|---|---|---|
| plats mesurés | 3/3 | 3/3 |
| lignes mangeur | 6 | 12 |
| bouche sans cible | 0 | 0 |
| journée à ±5 % de la cible | **2/2** | **4/4** |
| verdicts dans les bornes | 4/6 | 7/12 |
| couvercles : boîte / bac / bac d'un | 6 / 0 / **0** | 3 / 3 / **0** |
| le moteur servirait PLUS que le modèle | **4/4** | **3/3** |
| écart > 25 % sur ces boîtes | 1/4 | **3/3** |

### Ce que ça dit, et qu'on ne savait pas

**Le calcul converge.** Chaque bouche, chaque jour, atterrit à moins de 5 % de sa
cible : 6 bouches-jours sur 6. L'arithmétique par mangeur tient sur une vraie
table.

**Le modèle sous-sert, et toujours dans le même sens.** Sur les sept boîtes
comparables des deux foyers, le moteur servirait **plus** sept fois sur sept, et
jamais moins. Sur `quatre`, l'écart dépasse 25 % sur les trois. C'est la
cicatrice « les plans sous-nourrissent leur propre enveloppe », mesurée cette
fois par personne.

**Le bac d'un nom n'existe pas.** Sur `duo`, Julie est seule à ne pas avoir
d'objectif de poids : la règle lui donne une boîte à son nom, pas un bac d'une
personne. `tub_of_one: 0` sur les deux tirs.

**Le modèle ne groupe pas les couvercles comme le moteur** (`lid_shape_mismatch`
2 et 3). Sur `quatre`, il donne déjà sa boîte à Nora la végane — parce qu'il
compose « poulet **ou** tofu » en UN plat — quand la règle décidée lui donne un
PLAT à elle. Les deux plans ne se comparent donc pas bac à bac tant que le
calendrier ne commande pas ce plat-là. **C'est l'argument du lot 11.**

### ⚠️ Ce que les FACTEURS ne disent pas encore

Ils sortent entre 0,13 et 0,65, très loin de 1. Ce n'est pas une anomalie : le
modèle écrit encore des casseroles **pour toute la table**, et `standardPortionOf`
lit une casserole tirée par un seul plat comme « une portion standard ». Le
facteur corrige donc aussi cette échelle. Les **grammes** sont, eux, lisibles
tels quels (619 à 766 g médians) et c'est sur eux que portent les verdicts.
Les facteurs ne deviendront comparables au chemin solo qu'avec le prompt v34,
qui demande une recette pour UNE portion.

### Instrumentation corrigée en cours de lot

Premier tir (`L10`) : `minor_rows: 0` sur un foyer qui porte un enfant de douze
ans. Le compteur ne regardait que les boîtes à un nom — or un mineur n'a presque
jamais d'objectif de poids, donc il est presque toujours au bac. Le critère
« le modèle sous-sert les enfants » ne pouvait pas se déclencher. Corrigé au tir
`L10b` : `minor_rows: 3`, `minor_in_tub: 3` — le compteur nomme maintenant sa
propre limite au lieu d'afficher un faux zéro.

### Verdict de bascule

**Pas encore.** Trois critères sur quatre sont verts ; « verdicts dans les
bornes ≥ 80 % » ne l'est pas (7/12 et 4/6), et c'est attendu : sans la règle du
plat complet du prompt v34, les plats ne sont pas assez denses et l'assiette
dépasse le plafond. La réparation du lot 13 existe pour ça.

---

## Lot 11 — le brief en quatre temps (cartes, calendrier, méthode, schéma)

Nouveau module `household_prompt_v34.ts`, jeton `v34_one_card_per_person_the_engine_weighs`,
servi quand le chemin est armé ET qu'il y a au moins deux bouches. Le
constructeur v33 n'est pas modifié — ses quinze épreuves d'identité et les trois
gardes qui lisent son fichier comme du texte restent vraies par construction.

### Ce que le modèle a reçu, vérifié dans l'archive

Quatre sections dans l'ordre, une carte par personne, les cases vides nommées
(« nobody eats — write NO dish »), le plat à part commandé nommément. **Aucun
fait de corps**, **aucun schéma de boîte**, **aucune portion nommée**. Les seuls
kcal du brief sont les deux planchers de densité, qui portent sur un PLAT.

### Le résultat, après quatre corrections

| Tir | Ce qui bloquait | Plats de Nora |
|---|---|---|
| L11 | `dishBearers` venait de l'ancienne règle : ni la consigne ni la clé `for_member_id` n'étaient servies | 0 |
| L11b | la consigne annonçait « 1 extra dish » pour 3 cases, et le budget entier était `null` : le parseur aurait refusé un id juste | 0 |
| L11c | le parseur refusait chaque plat (`no dedicated dish was asked`) — la forme de cuisine du foyer est `one_dish` | 0 (le modèle les avait pourtant écrits) |
| L11d | le plafond de 3 plats par jour les jetait, et sacrifiait un petit-déjeuner de la table | 0 |
| **L11e / L11f** | — | **3 sur 3** |

Le plan final : trois plats de table, trois plats pour Nora, chacun tagué, aucun
coupé.

### ⛔ LA CORRECTION QUI COMPTE, ET LA FAUSSE PISTE QU'ELLE A COÛTÉE

Trois portes lisaient la **forme de cuisine** pour décider si un plat dédié a le
droit d'exister : la porte d'attribution du parseur, le plafond de plats, et le
bonus de budget. Ce foyer déclare 60 minutes de cuisine par semaine, donc sa
forme est `one_dish`, donc les trois se refermaient — sur des plats que la
consigne avait promis nommément.

**Première tentative : forcer les trois portes.** Elle a fait rougir trois
épreuves du barreau ① d'une fusion, là où le prompt dit littéralement « Do NOT
propose separate dishes » et où ouvrir un budget interdit fait « déborder
poliment pour le remplir ». Les trois portes avaient raison ; je les ai remises
à l'identique.

**Ce qui était faux, c'était la forme qu'on leur donnait.** Un plat dédié de v34
ne vient pas d'une préférence d'effort, il vient d'une **impossibilité** : la
grille a établi que cette bouche ne peut pas manger la casserole de sa case. Le
budget v34 porte donc `one_session`, qui est le mot exact de ce que la consigne
promet — « same cooking session, same shopping, different plate ». Ce champ
n'atteint jamais le modèle : il ne gouverne que le plafond et la porte
d'attribution, et la préférence d'effort du foyer reste intacte partout ailleurs.

### Le banc se restaure seul

`20-tir-foyer.sh` lève `PORTION_SIZING_MAX_MOUTHS` à 12 pour le tir et la remet
à 1 par un `trap`, y compris sur Ctrl-C. ⚠️ Les deux restaurations vivent dans
UNE fonction : un second `trap … EXIT` remplace le premier au lieu de s'y
ajouter, et c'est la borne qui serait restée levée.

### Une garde morte, trouvée et réparée

L'épreuve « les verrous restent en queue » lisait `indexOf` sur les en-têtes —
et trouvait leur **mention dans la méthode**, jamais les blocs. Intervertir deux
verrous la laissait verte. Corrigée en `lastIndexOf`, avec une seconde assertion
qui distingue le bloc de sa mention. Les deux mutations rougissent maintenant.

---

## Lot 12 — l'application à plusieurs : les couvercles autorés

`applySizingForEaters` remplace le modèle comme autorité sur les grammes de toute
la table. Le chemin armé à plusieurs bouches **applique** : `applied: true`.

### Les neuf couvercles du tir `L12` (foyer `quatre`)

| Moment | Plat | Couvercle | Contenu |
|---|---|---|---|
| breakfast | table | Paul | 418 g |
| breakfast | table | Leo + Claire | 845 g |
| lunch | table | Paul | 741 g |
| lunch | table | Leo + Claire | 1497 g |
| dinner | table | Paul | 630 g |
| dinner | table | Leo + Claire | 1271 g |
| breakfast | dédié Nora | Nora | 345 g |
| lunch | dédié Nora | Nora | 735 g |
| dinner | dédié Nora | Nora | 619 g |

Paul a un objectif de poids, donc une boîte à son nom. Claire et Léo sont en
maintien, donc un bac dont le total est la **somme** de leurs deux parts. Nora
mange ses propres plats, donc ses grammes sont une prescription.

`day_kcal: 4/4 à ±5 %` de la cible, `eaters_unsized: 0`, `items_unresolved: 0`,
`tub_of_one: 0`.

### Les trois arithmétiques, et pourquoi elles diffèrent

- **une part** = recette × SON facteur ;
- **le frais d'un plat** = recette × **Σ** des facteurs de ses mangeurs (le plat
  doit contenir toutes les parts ; le multiplier par une moyenne rendrait une
  casserole pour une personne et trois assiettes vides) ;
- **la casserole** = Σ sur les plats de (Σ sur leurs mangeurs) ÷ tirages.

Les trois sont épinglées par mutation : moyenner l'une quelconque fait rougir.

### Une seconde garde morte, du même genre que la première

L'épreuve de câblage cherchait `applyHouseRuleLock(` par `indexOf` — et trouvait
un **commentaire**, mille lignes plus haut, qui explique justement cette
contrainte d'ordre. La garde se comparait à sa propre documentation. Corrigée sur
le vrai site d'appel. **Deuxième fois que ce piège se referme sur ce chantier** :
un `indexOf` sur un symbole trouve d'abord ce qui en parle.

---

## Lot 13 — la réparation entre mangeurs

`repairDecisionForDish` est écrite, éprouvée et branchée **en mesure**. L'appel
modèle qui la sert n'est branché que sur le chemin d'une bouche : la boucle de
réparation solo fait deux cent trente lignes avec relecture par le parseur et
fusion par cellule, et la dupliquer sans pouvoir la vérifier aurait été le genre
de raccourci que ce dépôt paie. Le journal compte donc ce qu'une réparation
demanderait, plat par plat, dans quel sens et pourquoi.

### Les deux règles, et leur dissymétrie assumée

- **On densifie sur UN seul dépassement.** Cette personne-là ne peut pas manger
  sa part ; les autres n'y perdent rien, leur facteur baisse d'autant. La cible
  est celle du mangeur **le plus exigeant** — prendre la moyenne laisserait le
  plus contraint au-dessus de sa borne, c'est-à-dire non nourri.
- **On n'allège qu'à l'unanimité, et jamais avec un enfant à table.** Alléger
  coûte à tout le monde : un seul mangeur sous son plancher veut dire que le plat
  convient aux autres. Et tirer un plat partagé vers le bas pour un enfant
  servirait aux adultes une recette plus diluée, donc des assiettes plus grosses,
  pour corriger une portion que son facteur suffit à corriger.
- **Plafond ET plancher sur le même plat** ⇒ on densifie, et on le compte
  (`conflict`). Quelqu'un qui n'est pas nourri est plus grave qu'une assiette qui
  paraît petite.

### Le tir `L13` (foyer `quatre`), avec les compteurs de tête réparés

| Compteur | Valeur |
|---|---|
| plats mesurés | 6 / 6 |
| couvercles autorés | 9 (6 boîtes + 3 bacs) |
| mangeurs non dimensionnés | 0 |
| items non résolus | 0 |
| journée à ±5 % de la cible | **4 / 4** |
| assiettes dans les bornes | **9 / 12** |
| réparations qui seraient demandées | 2, toutes en densification |
| mangeurs que la borne raboterait | 3 |

---

## Lot 14 — la bascule : ⛔ PAS PRISE, ET VOICI LE CHIFFRE

Le plan fixe quatre critères avant de faire passer toute la population sur le
chemin neuf. Trois sont verts ; **le quatrième ne l'est pas** :

| Critère | Seuil | Mesuré |
|---|---|---|
| journée à ±5 % de la cible | ≥ 90 % | **100 %** ✓ |
| aucun bac d'un seul nom | 0 | **0** ✓ |
| aucun mangeur non dimensionné | 0 | **0** ✓ |
| **assiettes dans les bornes** | **≥ 80 %** | **75 %** ⛔ |

Trois assiettes sur douze dépassent le plafond de masse de leur mangeur. Les
deux plats en cause demandent une **densification**, et l'appel modèle qui la
sert n'est branché que sur le chemin d'une bouche (voir lot 13). Basculer
maintenant servirait ces trois assiettes rabotées, avec leur manque écrit — ce
qui est exactement le défaut que ce chantier existe pour retirer.

⚠️ **La bascule tient en une constante**, et elle est déjà en place :
`PORTION_SIZING_MAX_MOUTHS`, à 1 dans le dépôt. La monter à
`HOUSEHOLD_MAX_MOUTHS` arme tout le chemin ; la redescendre le referme en un
commit. Le banc la lève pour ses tirs et la remet par un `trap`.

**Ce qui reste avant de basculer**, dans l'ordre :
1. brancher l'appel de réparation sur la table (la décision est écrite et
   éprouvée, il manque la boucle : instruction → modèle → `parseGeneratedMeal`
   → `mergeRetryCells` → re-mesure) ;
2. rejouer `quatre` et `cinq` : le critère des bornes doit passer 80 % ;
3. adapter les textes de relance qui citent encore `boxes` et `member_portions`,
   et sauter la relance d'échange (sans objet quand la table suit la majorité).

---

## Lot 13 (suite) — la réparation branchée sur la table

La boucle n'a pas été dupliquée. Sur ses deux cent cinquante lignes, **deux**
supposaient qu'il n'y avait qu'un mangeur — celles qui disent à
`potRepairability` qui mange le plat et quel verdict chacun y porte. Tout le
reste (extraction de recette, garde d'identité du plat, appel modèle, fusion par
cellule, dé-forkage des casseroles) était déjà générique.

Elle est devenue `runDensityRepair(outOfBounds, verdictsOf)`, hissée au-dessus
des deux chemins. Le solo fournit sa bouche unique ; la table fournit, pour
chaque plat, l'ensemble de ses mangeurs et leur verdict — c'est ce que la règle
des casseroles lit pour savoir si un pot peut être retravaillé ou s'il est
**gelé** par un autre plat qui va bien.

⛔ **La table répare AVANT d'appliquer.** Poser les grammes du plan d'avant
ferait servir une assiette et en mesurer une autre. Après fusion, elle remesure
par une seconde passe de `shadowSizing` — la machinerie partagée ne remesure
pas, parce que les deux chemins n'ont pas la même arithmétique et qu'une
troisième les départagerait mal.

### Un test qui avait prédit le jour

`CÂBLAGE ㉓` épinglait le littéral `eaters: new Set([mouth.memberId])` en
écrivant, dans son propre commentaire : « le jour où `platedMembers` en portera
plusieurs, le changement doit être une ENTRÉE (`eaters`) et pas du code. Un lot
qu'on branchera plus tard ne se branche jamais. » Ce jour est arrivé. Le test
s'est retourné vers la nouvelle forme et vérifie maintenant qu'il y a **une**
machinerie et **deux** appelants.

---

## Lot 14 — les relances parlent la langue du chemin

Trois relances demandaient encore au modèle des couvercles ou des parts nommées,
que le moteur écrit désormais lui-même. Un modèle à qui on jette la moitié de sa
sortie finit par mal écrire l'autre.

- **Bouches non nourries** : un paramètre `wording` REQUIS, deux valeurs nommées
  — jamais un booléen. `boxes` est le texte d'origine, **byte-identique**, servi
  à toute la population qui n'est pas sur le chemin neuf ; une épreuve le tient
  mot pour mot. `standard_recipe` demande « écris UNE recette standard », dit
  que l'app calcule les grammes, et remplace « nomme-la sur une boîte » par
  « donne-lui un plat à elle (`for_member_id`) ».
- **Désaccord de préférence** : « une boîte à eux » devient « un plat à eux ».
- **Échange de composant** : **sautée**. Elle existait pour un cas qui a disparu
  avec la règle des cases — la table entière poussée sur le régime le plus
  strict, et les mangeurs libres servis contre leur ligne. La casserole suit
  maintenant la majorité. La mesure reste ; un flagrant qui persisterait voudrait
  dire que le calendrier n'a pas commandé le plat qu'il devait.

⚠️ **Un `?` sur `wording` aurait été une garde désarmée** : le chemin neuf aurait
reçu en silence le texte de l'ancien. Requis, le compilateur a recensé les
appelants — y compris une vingtaine dans les tests.

### Deux compteurs qui mentaient, trouvés par le premier tir réparé

- `still_out` restait à **zéro** sur la table : la machinerie partagée ne
  remesure pas, donc elle ne pouvait pas le remplir. Il annonçait « plus rien ne
  dépasse » sur un plan où cinq assiettes dépassaient encore.
- `title_changed` est sorti à **−1**. Il soustrayait des PLATS à des CASES : sur
  le chemin d'une bouche il y a un plat par case et le compte tombait juste ;
  à la table, une case porte le plat commun **et** le plat dédié.

Et une troisième pièce ajoutée pour pouvoir décider : les verdicts d'**avant**
la réparation sont gardés (`repair_effect`). Sans eux, « 7 assiettes sur 12 dans
les bornes » ne dit pas si la réparation a aidé — elle pourrait avoir amélioré un
plan qui en avait 4, ou abîmé un plan qui en avait 9.

### Le tir `L14` (foyer `quatre`) — tout est vert

| Critère | Seuil | Mesuré |
|---|---|---|
| journée à ±5 % de la cible | ≥ 90 % | **4/4 = 100 %** ✓ |
| assiettes dans les bornes | ≥ 80 % | **12/12 = 100 %** ✓ |
| aucun bac d'un seul nom | 0 | **0** ✓ |
| aucun mangeur non dimensionné | 0 | **0** ✓ |

Et l'effet de la réparation se lit enfin, parce qu'on garde les verdicts d'avant :

```
avant : { in_bounds: 11, under_min: 1 }
après : { in_bounds: 12, under_min: 0 }
```

Une demande, une acceptée, aucun refus, `still_out: 0`. **C'est la première fois
que la table sort sans une seule assiette hors bornes.**

---

## 2026-09-08 — LA BASCULE PRISE, PUIS TROIS DÉFAUTS QU'ELLE SEULE POUVAIT MONTRER

`PORTION_SIZING_MAX_MOUTHS` est passée de 1 à 12. Le banc ne lève plus la borne :
il **refuse de tirer si elle a été redescendue**, parce qu'un banc qui mesurerait
en silence le chemin d'avant rendrait des chiffres qu'on lirait comme ceux du
chemin neuf.

Le tir de contrôle `BASCULE quatre` devait être une formalité. Il ne l'a pas été.

### ① La case ne suffit plus à désigner un plat

```
repairs : asked 2 · accepted 0 · rejected { title_changed: 4, no_cell: 1 }
verdicts: in_bounds 6 · over_max 6      repair_effect: ran false
```

La garde d'identité cherchait « le plat revenu dans cette case » par la **case
seule**. Sur le chemin d'une bouche il n'y a qu'un plat par case et le `find`
tombait juste. À la table, une case porte le plat **commun** *et* le plat
**dédié**, et leurs titres se ressemblent (« Ragoût de lentilles, riz, citron » /
« … riz, tofu ») : on comparait les composants de l'un à ceux de l'autre.

⚠️ **Les tirs précédents passaient par chance**, selon l'ordre où le modèle
rendait les deux plats d'une case. `for_member_id` fait partie de l'**identité**
d'un plat, pas seulement de son attribution.

### ② Une réparation peut aveugler le moteur, tous compteurs au vert

Une fois ① réparé, le tir `IDENTITE quatre` rend **quatre compteurs au vert** :

```
repairs : asked 2 · accepted 2 · rejected tout à 0 · still_out 0
```

Et le plan est **pire** :

| | avant | après |
|---|---|---|
| dans les bornes | 9 | **4** |
| dépassements | 3 | 0 |
| **immesurables** | **0** | **8** |

Les trois assiettes qui dépassaient n'ont pas été corrigées : elles sont devenues
**immesurables**. Une assiette immesurable part au **facteur 1** — la recette du
modèle telle quelle. Mesuré : **1 121 g au déjeuner, 1 056 g au dîner**, pour
quatre personnes. Le dépassement qu'on voulait corriger a *empiré*, et tous les
compteurs disaient le contraire.

⚠️ **« Moins de dépassements » n'est donc pas le critère.** Le critère est : le
moteur peut-il encore **peser** ce plat ? La réparation qui fait monter
`unmeasurable` est refusée **en bloc**, le plan d'avant revient (plats,
casseroles, `empty_slots` **et** texte source), et le plan restauré est
**remesuré** — sans quoi on servirait le plan d'avant en journalisant celui
d'après.

### ③ Une casserole citée mais absente était sautée en silence

La cause de ② : `if (!prep) continue;` dans `standardPortionOf`. Le plat était
mesuré sur ce qui restait — son frais seul —, et rendait une **énergie
plausible** pour une assiette dont on ignorait le contenu principal. Après une
réparation acceptée, `mergeRetryCells` renomme les casseroles réécrites
(`prep_rice__r`) et `unforkReworkedPots` a rendu `forked: 2, unforked: 0` : des
plats citaient un identifiant disparu.

Et le compteur qui sert précisément à dire pourquoi, `unmeasurable_by`, était
**`{}`** sur huit assiettes — un trou sans nom se relit comme un trou qu'on n'a
pas cherché. Deux constantes nomment désormais les deux cas :
`MISSING_PREPARATION_GAP` et `UNNAMED_ENERGY_GAP`.

### Ce que ces trois défauts ont en commun

Aucun n'était visible avant la bascule. ① demande **deux plats dans une case**,
② et ③ demandent qu'une **réparation soit acceptée** — ce que ① empêchait. La
bascule n'a pas créé ces défauts : elle est le premier instrument qui pouvait les
voir.

### Le tir `AVEUGLE2` (foyer `quatre`) — la table sort sans une assiette hors bornes

Une fois ① ② ③ réparés :

| Critère | Seuil | Mesuré |
|---|---|---|
| journée à ±5 % de la cible | ≥ 90 % | **4/4 = 100 %** ✓ |
| assiettes dans les bornes | ≥ 80 % | **12/12 = 100 %** ✓ |
| aucun bac d'un seul nom | 0 | **0** ✓ |
| aucun mangeur non dimensionné | 0 | **0** ✓ |

```
repair_effect : avant { in_bounds: 10, over_max: 2 } → après { in_bounds: 12, over_max: 0 }
repairs       : asked 2 · accepted 2 · rejected tout à 0 · still_out 0
apply         : dishes_unsized 0 · eaters_unsized 0 · items_unresolved 0
```

⚠️ **Le refus d'aveuglement n'a PAS eu à se déclencher sur ce tir** (`rejected.unmeasurable: 0`).
Il est vérifié par mutation, pas par un run réel : son déclenchement dépend de ce
que le modèle rend. Ne pas lire « 0 » comme « la garde marche » — le lire comme
« ce plan-là n'en avait pas besoin ».

`pot_forked: 3, pot_unforked: 0` persiste : le modèle réécrit des casseroles
qu'on lui a nommées intouchables. C'est **compté**, les deux versions sont
gardées, et cette fois aucune n'est devenue orpheline. C'est ce que l'invariant
d'intégrité surveille désormais à la source.

### Deux pièges de banc, notés pour la prochaine session

- **Après `supabase functions serve`, attendre.** Deux tirs lancés 15 s après le
  redémarrage ont rendu `{"message":"name resolution failed"}` — le conteneur
  n'a pas encore son DNS. Le banc relance tout seul, mais chaque essai coûte une
  minute. 45 s d'attente suffisent.
- **Un tir dure plus longtemps depuis que la réparation atterrit** : 2 à 5 min
  au lieu de 2, parce qu'un second appel modèle a lieu et qu'on remesure après.

### Le tir `INVARIANT` (foyer `quatre`) — ④ LA RÉPARATION FAISAIT PERDRE SON PLAT À LA VÉGANE

10 assiettes sur **16**, `over_max: 6`. Et le nombre de lignes par mangeur avait
changé entre les deux mesures : **12 avant, 16 après**. C'est ce chiffre qui
trahit le défaut.

Les cinq plats du plan réparé revenaient avec `for_member_id: null` :

```
· breakfast | Flocons d'avoine, pomme, chia et yaourt | for: None
· breakfast | Flocons d'avoine, pomme, chia et yaourt | for: None   ← en double
· dinner    | Couscous, légumes rôtis, citron          | for: None
· lunch     | Couscous, légumes rôtis, lentilles       | for: None
· dinner    | Couscous, légumes rôtis, tomates, olives | for: None
```

**Nora, végane, avait perdu son plat à part.** Quatre personnes se partageaient
des plats qui étaient dédiés — d'où 16 lignes au lieu de 12 — et le
petit-déjeuner revenait en double, sans porteur.

⚠️ **La cause est structurelle** : l'identité est jugée **plat par plat**, mais
`mergeRetryCells` fusionne la **case entière**. Une case dont le plat de table
passait l'identité entrait en bloc, en emportant ce que la relance avait fait des
autres plats. `title_changed: 1` était le seul signe, et il n'empêchait rien.

Le lot 13 du plan l'avait pourtant nommé — « rejet `dedicated_lost` si la case
revient sans son plat dédié » — et il n'avait jamais été écrit.

⛔ **Ce n'est pas un défaut de comptage.** Le plat dédié existe parce que le
régime de la personne le rend nécessaire ; le lui retirer la remet à la table
qu'on avait décidé qu'elle ne pouvait pas manger. La ceinture de régime mordrait
ensuite — mais réparer une densité ne doit pas produire un plan qu'une ceinture
doit sauver.

**Et l'épreuve de cette garde a d'abord été écrite trop faible** : elle
n'assertait que les *effets* (le retrait de la case, le compteur), et la mutation
qui neutralisait la condition la laissait **verte**. Resserrée sur la comparaison
elle-même, elle rougit.

---

## ⛔ 2026-09-08 — LA BASCULE A ÉTÉ PRISE SUR DEUX TIRS CHANCEUX. LE CHIFFRE, EN ENTIER.

Neuf tirs sur `quatre` depuis que la table dimensionne (lot 12), même fixture,
même fenêtre d'un jour :

| Tir | assiettes dans les bornes | journée à ±5 % |
|---|---|---|
| L12 | 8/12 — 66 % | 4/4 |
| L13 | 9/12 — 75 % | 4/4 |
| L13W | 7/12 — 58 % | 4/4 |
| **L14** | **12/12 — 100 %** | 4/4 |
| BASCULE | 6/12 — 50 % | 4/4 |
| IDENTITE | 4/12 — 33 % *(aveuglé)* | 4/4 |
| **AVEUGLE2** | **12/12 — 100 %** | 4/4 |
| INVARIANT | 10/16 — 62 % *(dédiés perdus)* | 4/4 |
| DEDIE | 8/12 — 66 % | 4/4 |

⛔ **Le critère « assiettes dans les bornes ≥ 80 % » est tenu par DEUX tirs sur
neuf.** La bascule a été prise le soir du 2026-09-08 sur `L14` et confirmée sur
`AVEUGLE2` — les deux à 100 %. Ce sont les deux meilleurs de la série. La médiane
est à **66 %**.

⚠️ **Ce que ça ne renverse pas** : la colonne de droite. **La journée est à ±5 %
de la cible sur 4 bouches-jours sur 4, dans les NEUF tirs, sans exception.** Ce
que le moteur calcule — combien chaque personne doit manger sur la journée — est
juste et stable. Ce qui varie, c'est la capacité du MODÈLE à écrire une recette
assez dense pour que cette quantité tienne dans une assiette de taille humaine.

⚠️ **Et la bascule reste le bon geste malgré ça**, pour une raison qui n'est pas
dans ce tableau : le chemin d'avant ne dimensionnait **rien** à deux bouches ou
plus. Le comparer sur « assiettes dans les bornes » n'a pas de sens — il n'avait
pas de bornes. Redescendre la constante ne ramènerait pas 100 %, elle ramènerait
les grammes du modèle, mesurés systématiquement trop bas (7 boîtes sur 7 au lot
10).

**Ce qu'il faut lire de ce tableau, donc** : le dimensionnement est acquis, la
DENSITÉ des recettes ne l'est pas. C'est le chantier suivant, et il se joue dans
le prompt (planchers de densité par créneau, déjà écrits pour le solo au lot
« 6 bis », **jamais portés sur les cartes v34** — noté dans
`household_prompt_v34.ts`), pas dans le moteur.

---

## 2026-09-08 — AUDIT « EST-CE FAIT COMME EN SOLO ? » : TROIS ÉCARTS SUR SEPT

Question du propriétaire, en relisant sa propre règle des mangeurs. Vérifié
point par point dans le code, pas de mémoire.

| Sa règle | État trouvé |
|---|---|
| la densité requise est dite AVANT la composition | ⛔ **absente du foyer** (v33 seul la portait) |
| frais et casserole sont deux unités traitées pareil | ⛔ le frais **toujours** `reworkable`, en dur |
| unité gelée si un mangeur ne veut pas la direction | ✅ casseroles · ⛔ frais |
| solo : rien ne peut être gelé | ✅ |
| tout gelé ⇒ plat dédié à son nom | ⛔ **écrit, testé, aucun appelant** |
| symétrie densifier / alléger | ✅ |
| unité gelée nommée avec son contenu, intouchable | ✅ |

### ⑤ La densité requise n'atteignait jamais les cartes du foyer

Elle était **calculée** dans la lane (`requiredDensityByMember`, trente lignes
avant la construction du prompt) et servie au seul brief v33. Le foyer ne
recevait que les **deux planchers génériques** : 100 kcal/100 g en normal, 60 en
léger.

Or l'ado du foyer `quatre` a besoin de 984 kcal au déjeuner dans 650 g au plus,
soit **151 kcal/100 g**. Le modèle a écrit **116** : au-dessus du plancher qu'on
lui donnait, très en dessous de ce qu'il fallait. **850 g dans l'assiette, pour
des calories pourtant justes.**

Les cartes portent maintenant la ligne, par personne et par créneau, avec la
**même fonction de rendu** que v33 (`densityFragment`, exportée sans toucher un
mot). Le plancher commun monte avec `densityFloorsOf`, comme en v33.

### ⑥ Le frais d'un plat partagé était réécrivable en dur

`freshRepairability: "reworkable" as const`. Sur un plat partagé, le frais est
mangé par toute la table : le densifier pour celui qui dépasse **enrichit
l'assiette de celui qui était dans ses bornes**, et celui-là ne le saura jamais.
C'est très exactement le défaut que la règle des mangeurs existe pour empêcher,
et il n'était gardé que sur les casseroles.

La construction d'unité est extraite (`absorbDishInto`, `freshUnitOf`) pour que
les deux sortes la partagent. Le frais a pour mangeurs ceux de **son** plat, la
casserole l'**union** des plats qui la tirent. Compté : `fresh_frozen`.

### ⑦ Une réparation peut dégrader sans rien aveugler

Tir `MAXDENSITE` : `avant { in_bounds: 10 } → après { in_bounds: 9 }`, aucun
aveuglement, aucun refus, `accepted: 2`. La garde du 2026-09-08 ne surveillait
que `unmeasurable`. Elle refuse désormais aussi la **dégradation**, comparée en
**parts** et non en comptes (le nombre de lignes change quand la relance
redistribue les plats : 12 avant, 16 après au tir `INVARIANT`).

### L'effet mesuré, sur le foyer de quatre

| | avant les cartes | après |
|---|---|---|
| tirs | 8/12, 10/16, 8/12, 6/12, 4/12 | **10/12, 9/12, 10/12** |
| médiane | ~62 % | **~83 %** |
| densité écrite au déjeuner | ~116 | 130 à 136 |
| plus grande assiette | **850 g** | **757 g** |
| journée à ±5 % | 4/4 | 4/4 |

⚠️ **Ce qui est mesuré et ce qui ne l'est pas.** Les cartes qui portent la
densité : trois tirs, tous meilleurs que les cinq précédents — c'est solide. La
phrase « un plat partagé prend la PLUS HAUTE densité de ses mangeurs, jamais la
moyenne » : **un seul tir, et il était moins bon**. Elle est logiquement juste et
sans risque, elle est gardée, mais elle n'est **pas prouvée**.

### Ce qui reste, et c'est nommé

**Le plat dédié de rattrapage (cas 5) n'a toujours aucun appelant.**
`dedicatedRepairFor` et `dedicatedDishInstruction` sont écrits et testés. Quand
tout est gelé pour quelqu'un — ce qui arrive maintenant que le frais peut l'être
(`fresh_frozen: 2` au dernier tir) — **rien ne se passe**. C'est le lot suivant.

### Tir `CAS5` — le plat dédié sauverait 2 assiettes sur 6, pas 6

Deux compteurs neufs, parce que la question « le cas 5 se produit-il ? » et la
question « les assiettes qui RESTENT en relèvent-elles ? » ne sont pas la même,
et seule la seconde décide.

```
residual_eaters 6   ← assiettes encore hors bornes après réparation
residual_stuck  2   ← dont « rien ne pouvait être réécrit » (cas 5)
stuck_dishes    0   ← aucun plat bloqué AU MOMENT de la demande
would_ask 3 · asked 3 · accepted 3 · skipped_budget 0
```

⛔ **Le budget n'est pas en cause** : les trois plats qui demandaient une
réparation l'ont eue, et toutes ont été acceptées. Le plan est passé de 3 à 6
assiettes dans les bornes. Et il reste six assiettes dehors.

⚠️ **La vraie cause se lit dans les densités finales** :

```
petit-déjeuner  190 kcal/100 g   ← largement au-dessus
déjeuner        117 kcal/100 g
dîner            97 kcal/100 g   ← SOUS le plancher générique de 100
```

Le dîner est revenu **sous le plancher que le prompt énonce sans condition**,
après une réparation demandée, acceptée et comptée comme réussie. Rien ne
vérifie que le plat rendu atteint la densité qu'on lui a demandée : la garde
d'identité contrôle la masse qui survit, les gardes du 2026-09-08 contrôlent
l'aveuglement et la dégradation, **aucune ne contrôle la cible**.

**Classement des leviers, par assiettes récupérables sur ce tir :**

| Levier | Assiettes |
|---|---|
| faire atteindre la densité demandée (2ᵉ passe, ou refus si la cible est ratée) | **4 sur 6** |
| le plat dédié de rattrapage (cas 5) | **2 sur 6** |

Le plat dédié vaut d'être branché — il est la seule sortie pour ces deux-là —
mais il n'est pas ce qui débloque le foyer.

---

## 2026-09-08 — POURQUOI LE FOYER N'A PAS LES TAUX DU SOLO : LE PROMPT EST UN FICHIER À PART

⛔ **Correction d'abord.** J'avais comparé le foyer aux tirs solo du **7 sept
20 h 19 – 21 h 47**, c'est-à-dire aux archives d'un chantier en cours, pas à
l'état d'aujourd'hui. Entre les deux : le plafond de densité, la correction de la
veille, la phrase contradictoire retirée, la relance déplacée. Et j'avais écrit
que le solo « perd les calories en silence » : faux, `unmet_kcal` écrit
exactement ce qui est raboté, et le pourcentage servi en découle.

### Les quatre gains du solo : trois sont partagés, un ne l'est pas

| Gain | Où il vit | Le foyer l'a ? |
|---|---|---|
| plafond de densité (250) | `requiredDensityFor` | ✅ partagé |
| correction de la veille | `requiredDensityFor` | ✅ partagé |
| relance déplacée | `runDensityRepair` | ✅ partagé |
| **la densité dite dans le prompt** | `household_portions.ts` (v33) | ⛔ **v34 est un autre fichier** |

**Le foyer a son propre prompt**, `household_prompt_v34.ts`, écrit à neuf. Il a
donc silencieusement perdu les corrections accumulées de v33. Concrètement, la
densité requise était **calculée dans la lane** et servie au seul v33 : le foyer
ne recevait que le plancher générique de 100 kcal/100 g.

### Et il manquait aussi ce que chaque fait INTERDIT

v34 avait repris tous les FAITS de v33 sur ses cartes — rythme, habitude,
densité — et **aucune** des phrases de conséquence. C'est le principe que
`household_portions.ts` énonce trois fois dans ses propres commentaires : « une
contrainte qu'on énonce sans dire ce qu'elle INTERDIT est une contrainte
décorative. »

Les deux lignes qui manquaient le plus :

```
A density on someone's line is a fact about the DISH served at that moment,
as served, not a fact about them: write that recipe at least that dense.
[…] Do not reach it by serving a smaller plate: the plate stays a plate.
```

### Mesuré, tir `CONSEQUENCE`

| | avant | après |
|---|---|---|
| densité du dîner | 97 kcal/100 g | **151** |
| assiettes du dîner dans les bornes | 1/4 | **4/4** |

⚠️ Et un effet inverse apparaît : le petit-déjeuner monte à 203-222 et **deux
assiettes passent sous leur plancher**. Le modèle sur-corrige là où on ne lui
demandait rien.

### Vérification exhaustive sur les prompts RÉELS

144 lignes de consigne côté foyer contre 115 côté solo. Les **sept** lignes que
le solo a et que le foyer n'a pas sont toutes des consignes `member_portions` et
« une seule série de préparations », que v34 ne demande volontairement pas.
**Le prompt du foyer ne manque plus de rien.**

### Ce qui reste structurellement plus dur à table, et qui n'est pas un défaut

1. **Une recette, plusieurs exigences.** Au déjeuner, les quatre cartes
   demandent 105, 122, 139 et **167** kcal/100 g. Le modèle écrit UN nombre, et
   il atterrit vers le milieu. Le solo n'a jamais qu'une exigence.
2. **Des morceaux gelés.** À table, la réparation ne peut pas toucher ce que
   mange quelqu'un qui va bien. En solo, rien n'est jamais gelé.
3. **L'erreur est multipliée.** Un déjeuner trop maigre fait une ligne mauvaise
   sur quatre en solo, et jusqu'à quatre sur douze à table.

---

## 2026-09-08 — SÉRIE APRÈS LA DENSITÉ NOMINATIVE

### Foyer de quatre — cinq tirs

| Tir | Assiettes | Journée | Densités | Réparation |
|---|---|---|---|---|
| E0 | **11/12 = 91 %** | 4/4 | 78–141 | 1 dem. / 0 acc. |
| E1 | 9/12 = 75 % | 4/4 | 105–139 | 2 / 2 |
| E2 | **11/12 = 91 %** | 4/4 | 99–179 | 1 dem. / 0 acc. |
| E3 | 10/12 = 83 % | 4/4 | 125–159 | 2 / 2 |
| E4 | 8/12 = 66 % | 4/4 | 94–151 | 2 dem. / 0 acc. |

**Médiane 83 %** (contre ~62 % avant que la densité n'atteigne les cartes).
**20 bouches-jours sur 20 à ±5 %.** Aucune assiette immesurable.

Les trois « 0 acceptée » sont la garde de dégradation qui refuse une relance
rendant le plan moins bon. Sur E0 et E2 c'était juste : ils finissent à 91 %.

### ⛔ Foyer de cinq — cinq tirs sur six tués par une cause EXTERNE

`An invalid response was received from the upstream server`, et le runtime dit
`request has been cancelled by supervisor`. La cause est dans le log :

```
File change detected: …/_shared/keel/draft_note_classify.ts (WRITE)
```

Une autre session écrit sous `_shared/` ; `functions serve` recharge à chaud et
**annule la requête en vol**. Les tirs `cinq` sont les plus longs : ils sont tués
à chaque fois. `supabase functions serve` n'a aucun drapeau pour désarmer la
surveillance. **Une mesure sur `cinq` demande une fenêtre calme.**

### Le seul tir `cinq` passé : 5/15, et une cause nouvelle

`unmeasurable: 10` sur 15. `unmeasurable_by: {missing_quantity: 4}`.

⛔ **Ce n'était PAS le sel**, malgré les apparences (six casseroles portent « 1
pincée de sel » sans quantité). Le sel et le poivre ont `condiment_grams = 0,5`
dans le référentiel et passent la convention `condimentMassFor`.

La vraie cause est que **le plat déclare DEUX FOIS sa casserole** :

```
uses: [prep_rice]                                   ← la citation, correcte
ingredients: [{ term: "riz cuit",
                quantity: "1 portion de riz cuit",
                amount: 1, unit: "unit", state: "cooked" }]   ← en trop
```

`unit: "unit"` sans `unitGrams` ⇒ `gramsRawOf` rend `null` ⇒ non pesé ⇒
**le plat ENTIER devient immesurable**.

⚠️ **Et la consigne qui l'interdit EST dans le prompt**, vérifié sur les trois
lanes : « When a dish draws on a preparation, that link is the whole statement:
do NOT … ». Le modèle l'a ignorée.

### ⛔ Le vrai défaut est en aval, et il est plus grave que la cause

Un plat immesurable est servi **au facteur 1**, c'est-à-dire à la recette brute
du modèle : **1 960 à 2 251 g dans l'assiette**. Le moteur ne s'abstient pas, il
s'abstient de MESURER puis sert quand même. C'est le pire repli possible, et il
transforme une ligne d'ingrédient en trop en un plat de deux kilos.

## 2026-09-08 · 18:00 — une phrase déplace l'appétit (session retours/bilan)

Scripts: `21-tir-note.sh` (tir avec `draft_note`, photo/restauration des
appétits, `FORCE_APPETITE=` pour le contrefactuel), `31-lire-note.py`.

| tir | fixture | intent | note | http | s | ce qu'on lit |
|---|---|---|---|---|---|---|
| N1 | quatre | prepare_next | « Leo n'aime pas le poisson, et Claire ne mange pas autant que ça » | 200 | 237 | modèle : `preferences=[food.exclude, Leo]`, `portions=[down, Claire]`, `skipped=[]`, `clarify=[]`, 6 listes présentes. Journal : `portions_asked 1 / moved 1 / at_edge 0 / failed 0 / unapplied 0`, `durable_written 1`. Claire `average → small`, `appetite_asked_at` posé. Accusé lu dans `chat_messages` : « Claire : Appétit : de moyen à petit ». |
| N2 | quatre | draft | — (`FORCE_APPETITE=Claire=small`) | 409 puis 200 | 167 | 409 = `plan_overlaps_existing` : le plan de N1 (`starts=08, ends=09` — `starts_on` est la VEILLE de cuisine) occupait la fenêtre, même pour un `draft`. Après retrait par id : cibles par ligne (`facteur × kcal standard`, indépendant du modèle) : Claire **1988 → 1788 kcal = 0,899** sur les trois moments ; Nora 1926 → 1926, Paul 2200 → 2200, Leo 2460 → 2458. |

Témoin d'avant pour le lot 6 : à 15:56:07 le prompt du COMPOSEUR (23 833 car.)
contient « ne mange pas autant » dans `user_message` — la phrase brute
atteint encore le composeur.

Deux pièges de banc, corrigés dans `21-tir-note.sh` :
- `psqlq` (`docker exec -i`) LIT stdin dans une boucle `while read` et avale
  les lignes suivantes : seul le premier membre était restauré (N1). Correctif :
  `</dev/null` sur chaque appel.
- `student_generated_meals.starts_on` porte la veille de cuisine, pas le jour
  demandé : viser l'`id` ou `ends_on` pour retirer un plan.

Fixture rendue telle que trouvée : appétits, fuseau, exclusion de test de Leo
retirée du magasin, message d'accusé retiré du chat, plan de N1 retiré.

### Effort de réflexion `high` — deux tirs survivants, tous deux à 100 %

| Tir | Assiettes | Journée | Réparation | Densités |
|---|---|---|---|---|
| H1 | **12/12 = 100 %** | 4/4 | **0 demandée** | 105–171 |
| H2 | tué (502, rechargement externe) | | | |
| H3 | tué (502, rechargement externe) | | | |
| H4 | **12/12 = 100 %** | 4/4 | **0 demandée** | 135–188 |

Contre la série `medium` du même soir : 91, 75, 91, 83, 66 %. **Aucun tir
`medium` n'atteint 100 % ; les deux tirs `high` y sont, sans réparation.**

⚠️ Deux tirs ne font pas une distribution. Ce qu'ils disent : à `high`, le modèle
tient les compromis entre personnes du premier coup et n'appelle pas la
réparation — ce qui rattrape une partie du surcoût (un appel de 244–281 s au lieu
de 66–108 s, mais sans les 36–96 s de relance derrière).

Effort remis à `medium` sur le disque (restauration automatique, vérifiée).

### Décision : la composition du foyer part à `high`, les relances restent à `medium`

`PLAN_COMPOSITION_REASONING_EFFORT = "high"` et `PLAN_COMPOSITION_HTTP_TIMEOUT_MS =
380_000`, lus au seul site de composition ; `PLAN_REASONING_EFFORT = "medium"` reste
sur les cinq relances. Épinglés, câblage tenu par un test qui rougit si une relance
prend l'effort de composition (vérifié par mutation).

⚠️ Le timeout devait suivre : 300 s laissait vingt secondes de marge à un appel
mesuré à 281. 380 s reste sous la coupure du worker (400 s).

Sur « fast » : le code n'envoie **aucun** champ de niveau de service à l'API
(`service_tier` absent de la charge). À câbler derrière une variable
d'environnement une fois le nom du palier confirmé chez le fournisseur.

### Tir `HIGH1` (composition à `high`, timeout 380 s) — trois essais morts à 36 s, zéro appel modèle

Ce n'est pas la signature du rechargement qui tuait les tirs `cinq` (mort après
plusieurs minutes, un appel modèle facturé). Ici : `http=502 · 36 s · essais=3 ·
llm_usage delta=0`. Les trois requêtes ont atteint `cells` puis `precedence`
— c'est-à-dire la **construction du prompt**, juste avant l'appel — et se sont
éteintes sans exception JS. 36 rechargements externes dans la fenêtre
(`draft_note_classify*`, autre session).

⚠️ Mes deux constantes sont des **imports** (`PLAN_COMPOSITION_REASONING_EFFORT`,
`PLAN_COMPOSITION_HTTP_TIMEOUT_MS`) : hissées, donc aucune zone morte possible,
à la différence du défaut de 16 h 32. Le tir `HIGH2` est bracketé par un compte
de rechargements pour que le résultat se lise sans ambiguïté.

### Porte : la régression du typecheck front n'est pas de ce chantier

`72 erreurs, liste 70`. Aucun fichier listé n'a vu son compte monter ; **un seul**
fichier en erreur est absent de la liste : `src/keel/lib/rhythmPrefill.int.test.ts`,
deux erreurs (`{slot,size:null}[]` non assignable à `readonly EatingOccasionSlot[]`,
lignes 89 et 116). Le fichier et son module sont **non suivis** (`??`), écrits à
15 h 44 – 15 h 45 par l'autre session. Aucune écriture front de ce chantier ce soir.
Non corrigé exprès : fichier en cours chez quelqu'un d'autre.

### Tir `HIGH2` — la composition à `high` tient de bout en bout

`http=200 · 223 s · 1 essai · 0 rechargement externe` (bracketé, compté).
**12/12 = 100 %**, journée 4/4, une réparation demandée et acceptée, densités
142–173. Le `HIGH1` mort à 36 s ×3 sans appel modèle était bien le rechargement
externe : même code, fenêtre calme, tout passe.

### `service_tier` câblé, absent par défaut, inscrit au registre

`KEEL_OPENAI_SERVICE_TIER` ∈ {auto, default, flex, fast, priority, ultrafast}.
Absent ⇒ charge octet pour octet comme avant. Hors liste ⇒ non envoyé **et
nommé** (`service_tier_rejected`). Le registre porte `service_tier_sent` et
`service_tier_echoed` sur les **quatre** sites qui écrivent une ligne — le
premier patch n'en avait pris qu'un, l'épingle l'a dit (1/4) avant qu'un tir ne
le fasse dire au registre. Tests : 7/7 dont le fil (stub de la charge) et une
mutation rouge sur le `if` qui pose le champ.

### Tir `FAST1` — `high` + `service_tier=fast` : même qualité, moitié du temps

`http=200 · 89 s · 1 essai · 0 rechargement`. Registre : `service_tier_sent=fast`,
**`service_tier_echoed=priority`** (exactement ce que la doc annonce), rien de rejeté.

| appel de composition (`high`) | tokens rendus | latence |
|---|---|---|
| sans palier (HIGH2, 16:48) | 18 123 | **209 s** |
| sans palier (HIGH2 bis, 16:48) | 15 562 | **176 s** |
| **avec `fast`** (FAST1, 16:55) | 17 265 | **86 s** |

Plan : **12/12 = 100 %**, journée 4/4, **aucune réparation**, densités 101–168.
`.env` scrubbé par le trap, runtime relancé sans la variable. Un tir : c'est une
mesure, pas une distribution — mais le rapport 2× sur un même volume de tokens
n'est pas du bruit.

## 2026-09-08 · 19:00 — une phrase déplace un RÉGLAGE (lot réglages)

| tir | note | style forcé | http | s | ce qu'on lit |
|---|---|---|---|---|---|
| N3 | « C'est trop long à cuisiner » | `balanced` | 502 ×3 | — | Modèle : `settings=[{time,down}]` **3/3**, 7 listes présentes. Aucune écriture : le runtime a été recréé 3 fois PENDANT le tir par les éditions d'une autre session sous `supabase/functions/` (18:36:34 `index.ts`, `generation_model.ts`). Journal vide (conteneur remplacé). 8 appels modèle perdus. |
| N3b | idem | `balanced` | 200 (essai 2) | 279 | `cooking_style: balanced → minimal`, `field_changes: 1`, `settings_moved 1`. **Mais** `event: not_written`, `notice_reason: not_attempted` : l'accusé était sous `if (write.ok)` de la porte des items retenus, qui rend `nothing_to_write` sur une note sans goût. Corrigé (annonces hors du `if`, verdict `written` si l'un des 3 canaux a écrit) + test rouge→vert. |
| N3c | idem | `balanced` | 200 (essai 3) | 181 | `balanced → minimal`, `field_changes 1`, `event: written`, `notice_delivered: true`. Chat : « J'ai ajusté un réglage : · Style de cuisine : de équilibré à minimal ». Élision corrigée ensuite (« d'équilibré »). |

Prouvé sans runtime (faux admin, 6 cas) : style déclaré ⇒ le style descend ;
sans style ⇒ le temps descend d'un barreau (60 → 45, un NOMBRE) ; plancher ⇒
rien et la porte n'est pas appelée ; deux axes contraires ⇒ rien
(`bothPolarities`) ; « pas assez varié » sans base ⇒ `varied` (règle du bilan,
réutilisée) ; une note qui ne contient qu'un réglage ANNONCE le réglage.

Piège de code : `effectOf` ne dérive `speedStep`/`difficultyStep` que si
`cookingQuestionsAreAsked(cooked)` — la ligne synthétique porte `cooked:
"partly"` (une phrase volontaire est une réponse ; la garde interdit de
DEMANDER, pas d'écouter).

Coût mesuré du plan à 4 bouches : 180–280 s par génération, Kong coupe à 150 s
⇒ 2 à 3 essais par tir, 9 à 12 appels modèle. C'est l'argument du lot 6 (deux
appels), chiffré.

Fixture rendue telle que trouvée (style `minimal`, plans et messages retirés).

### Tir `FAST2` — le contre-exemple qui empêche de sur-vendre `high`

`high` + `fast` : 134 s pour 19 685 tokens (FAST1 : 86 s pour 17 265 ; sans
`fast` : 176–209 s). Le gain de `fast` est réel mais pas un facteur fixe.
Qualité : **8/12 = 66 %**, deux réparations demandées, **zéro acceptée**.

Bilan `high` sur la même fixture, cinq tirs : H1 100, H4 100, HIGH2 100,
FAST1 100, FAST2 66. **Quatre sur cinq à 100 %, médiane 100 %, minimum 66 %.**
Contre `medium` le même soir : 91, 75, 91, 83, 66 (aucun à 100 %). `high` est
nettement meilleur ; ce n'est pas une garantie.

### Le coût de `fast` : 2× documenté, et INVISIBLE dans notre registre

Doc fournisseur (`developers.openai.com/api/docs/guides/fast-mode`) : « Fast mode
costs twice the corresponding Standard rate » (GPT-5.6), « up to 2.5× faster ».
La page nomme `gpt-5.6-sol` ; `gpt-5.6-luna` a accepté `fast` et renvoyé
`priority`, donc supporté et, par la règle énoncée, facturé 2×.

⛔ **Notre registre ne le voit pas.** `llm_pricing` est clé par
`(provider, model)` sans dimension de palier ; `llm-usage.ts` calcule `cost_usd`
depuis ces deux colonnes et ne lit jamais `metadata.service_tier_sent`, pourtant
en portée à l'écriture (ligne 240). Les deux tirs `fast` sont facturés au tarif
standard : `0,0229 $` et `0,0249 $` — la vraie note est `0,046 $` et `0,050 $`.

Mesuré, composition à `high`, tarif standard : 0,020–0,022 $ par composition.
À 2× : +0,02 $ par plan environ. Rendre le registre honnête = une colonne ou un
multiplicateur de palier dans `llm_pricing` + une lecture de
`service_tier_sent` dans le calcul. Non fait : décision de comptabilité.

### FAST2, relu sur la BONNE course (`request_id dca069e7…`) — c'est le cas 5, exactement

⛔ Correction : ma première lecture apparié à FAST2 la consigne quinoa/saumon de
16 h 59, qui appartient à un autre tir (`149fe147…`). La consigne de FAST2 est
celle de 16 h 59 22 s, réponse à 17 h 00 11 s.

**Un seul plat dans la consigne** : le dîner commun « Polenta, légumes cuits et
garniture protéinée », 123 → 146 kcal/100 g. Les **trois** casseroles qu'il tire
(`prep_polenta`, `prep_chicken`, `prep_lentils`) sont GELÉES — deux adultes dans
leurs bornes les partagent. Et le plat **n'a aucun frais** (`ingredients: []`) :
il est fait de casseroles seules. La consigne dit donc « atteins 146 par ton
frais et tes casseroles réécrivables », et **il n'y a ni l'un ni l'autre**.

**Ce que le modèle a fait** : il a rendu les trois casseroles octet pour octet
(FROZEN respecté), puis il a fait la seule chose possible — il a **retiré
`prep_lentils` des `uses` du dîner** et **inventé du frais** (100 g pois chiches,
30 g tahini, citron, persil). Il a aussi rendu un déjeuner qu'on ne lui avait pas
demandé (« Fix only these » ignoré). La fusion a forké deux casseroles
(`pot_forked: 2`), le dîner a perdu ses lentilles, le plan est passé de 8 à 7
assiettes dans les bornes, et la garde de dégradation a refusé. **La garde a eu
raison ; la demande était insatisfaisable par construction.**

⛔ Et `stuck_dishes: 0` sur un plat sans frais ni casserole réécrivable : le
compteur du cas 5 n'a pas vu le cas 5. À élucider (objet journalisé ≠ objet
incrémenté, ou boucle hors du chemin de la table).

## 2026-09-08 · 20:40 — lot 3 : la phrase quitte le composeur

Nouvelle fonction `keel-read-note-v1` (à part du générateur : 13 000 lignes
qu'une autre session édite en continu, et dont chaque édition recrée le
runtime). Le front l'appelle AVANT de composer, puis compose SANS `draft_note`
(`planDraft.ts` ne l'envoie plus). Le composeur relit le magasin, qui porte
déjà l'effet — c'est la recomposition immédiate.

| tir | note | http | s | ce qu'on lit |
|---|---|---|---|---|
| R1 | « Leo n'aime pas le poisson, Claire ne mange pas autant que ça, et c'est trop long à cuisiner » (style forcé `balanced`) | 200 | **4,4** | `ok: true`, `reason: written`, 3 proposées / 3 gardées. Écrit : `retained_items` +1 (Leo, `food.exclude`), Claire `average → small`, `cooking_style balanced → minimal` (`field_changes 1`). Réponse : « Leo : n'aime pas le poisson » · « Claire : Appétit : de moyen à petit » · « Style de cuisine : d'équilibré à minimal ». |

Contre 180–280 s et 2–3 essais quand la phrase voyageait dans la composition.
L'effet sur l'assiette au second appel est celui déjà mesuré (N2 : appétit ⇒
cible ×0,899 ; N3c : style écrit avant composition).

Rendu côté écran (`PlanDraftDialog`, sous le champ) : les lignes dites ; ou
« rien trouvé à changer » ; ou « je n'ai pas compris de qui tu parles ».

Fixture rendue telle que trouvée (script `23-tir-read-note.sh` : photo,
restauration, message d'accusé retiré).

### Le retour arrière d'une réparation refusée oublie deux champs

Audit statique de tout ce que `mergeRetryCells` + `unforkReworkedPots` mutent sur
le plan, face à ce que le revert (2026-09-08) restaure :

| muté par la fusion | restauré par le revert |
|---|---|
| `dishes`, `preparations`, `empty_slots`, texte source | ✅ |
| **`cooking_sessions`** (push/filter, ids dédoublonnés) | ⛔ non |
| **`shopping_list`** (push/filter sur les termes réclamés) | ⛔ non |

Après un refus (`degraded`, `unmeasurable`), le plan servi a donc les plats et
casseroles d'AVANT avec les **sessions de cuisine et la liste de courses de la
relance jetée**. Ni l'un ni l'autre n'entre dans `standardPortionOf` — ce n'est
pas ce qui explique « serves 123 » ≠ 132 — mais c'est un plan incohérent qui a
l'air cohérent. À restaurer avec les autres, dans le même `before`.

### Tir `STUCK1` — l'instrument par plat fonctionne, et isole le chemin du revert

```
ASK « Riz, légumes rôtis et protéine » densify → 167 · frais gelé · casseroles 0/3 · stuck=true
ASK « Riz, légumes rôtis et tofu »     densify → 122 · frais libre · casseroles 0/2 · stuck=false
stuck_dishes = 1 · 10/12 · 1 réparation demandée, 1 acceptée
```

Le cas 5 se voit désormais **au moment de la demande**, plat par plat, avec la
raison. Et la comparaison qui manquait : sur ce tir **sans** retour arrière, la
consigne dit « serves 125 » et la remesure 124,8 — identiques. Sur FAST2
**avec** retour arrière : 123 contre 132. Le désaccord est propre au revert.
Une ligne `density_repair_reverted` imprime maintenant les deux nombres côte à
côte à la prochaine réparation refusée ; le revert restaure aussi
`cooking_sessions` et `shopping_list` (épinglé).

⚠️ `stuck_dishes: 0` sur FAST2 reste **inexpliqué** : sur STUCK1 le compteur
monte exactement où il doit. Ne pas inventer une cause ; la ligne par plat la
montrera si ça se reproduit.

### Deux sortes de « refus » d'une réparation — et seule la seconde a besoin d'un revert

Ordre réel dans `runDensityRepair` puis chez l'appelant :

1. `title_changed`, `dedicated_lost`, `missing_pot` — décidés **AVANT** la fusion.
   Le plan n'a jamais bougé : rien à restaurer, les courses et sessions sont
   celles d'origine.
2. `mergeRetryCells` → `unforkReworkedPots` → `meal = unfork.meal` →
   `accepted = n` → retour `true` → l'appelant **remesure** → `degraded` /
   `unmeasurable` — décidés **APRÈS** la fusion. Le plan EST déjà celui de la
   relance ; « refuser » veut dire *défaire*. Le revert défaisait plats,
   casseroles, créneaux vides et texte source — pas les sessions ni les courses,
   réécrites par la fusion. Corrigé le 2026-09-08.

### L'entrée de dernier recours a un appelant (cas 5)

Décision du propriétaire : « il faut permettre d'ajouter une entrée, carotte,
huile d'olive, last resort ». Elle était écrite (`dedicatedRepairFor`,
`dedicatedDishInstruction` : « nuts, cheese, oil, bread — small and rich » si la
personne dépasse ; « vegetables, a broth, a salad — bulky and light » si elle est
sous son plancher). Il ne manquait que l'appelant.

Câblé dans la branche de la table, **après** la réparation de densité (acceptée,
refusée ou absente), **avant** de poser les grammes :

- population : les **bloqués du plan final** (`residualStuck`, nommés — plus un
  compte) ; un plat à leur nom est la seule sortie ;
- densité demandée : **la leur** (`repairDecisionForDish` sur leur seule ligne),
  pas celle de la table ;
- relecture : la liste fermée des porteurs est ouverte d'exactement les nommés,
  `dedicatedDishesAsked` suit — sinon le parseur refuserait le `for_member_id` ;
- gardes : chaque case revient avec ses porteurs d'avant **et** le nouveau
  (`bearer_missing`), aucune casserole orpheline (`missing_pot`), puis la même
  remesure que la réparation (`unmeasurable`, `degraded`) avec un instantané
  **à six champs** et un revert complet ;
- budget : `DEDICATED_REPAIR_MAX_PER_PLAN = 2`, épinglé, `skipped_budget` ;
- journal : `dedicated_repair` toujours écrit, zéros compris.

Épreuve de câblage ㉞ (mutation rouge : les bloqués non listés). L'épreuve ㉘
« un seul appelant de `householdRepairMessage` » retournée vers sa propriété
réelle : tout message de réparation passe par le même assembleur.

### Tir `CATCH1` — la réparation « acceptée » avait remplacé toutes les casseroles gelées

```
ASK  « Riz, poulet, légumes rôtis et herbes »  frais gelé · casseroles 0/4 · stuck=true
ASK  « Pommes de terre, poulet, courgette »     frais gelé · casseroles 0/4 · stuck=true
repairs : asked 2 · accepted 2 · pot_forked 5 · pot_unforked 0 · pots_frozen 11
repair_effect : 8/12 → 8/12   ·   residual_stuck 0   ·   dedicated_repair.asked 0
plan final : prep_rice__r, prep_roasted_veg__r, prep_chicken__r, prep_tofu__r, prep_potatoes__r
```

Le modèle a réécrit les **cinq** casseroles nommées FROZEN ; « garder les deux
versions » les a toutes remplacées — plus aucune casserole d'origine dans le
plan servi. Les deux adultes dans leurs bornes mangeaient des casseroles
promises intouchables, pour zéro gain. Et l'entrée de dernier recours n'est pas
partie : à la lettre, le frais des deux plats restait « réécrivable » — il
l'avait déjà été une fois, sans effet.

Deux gardes, épinglées, mutations rouges :

- **une casserole gelée réécrite fait refuser la fusion** (`frozen_rewritten`) :
  la règle dit « intouchable », un gel rompu est un contrat rompu ;
- **« bloqué » inclut le plat déjà réparé une fois** (`dejaDemande`) : une
  personne qu'aucun geste restant ne peut servir est bloquée, et c'est elle que
  l'entrée de dernier recours doit servir.

### Tir `CATCH2` — la chaîne entière tourne ; la relecture perd les plats rendus

```
ASK  « Couscous, courgette, poivron et poulet »   frais gelé · casseroles 0/2 · stuck=true
FROZEN_REWRITTEN pots=4 cells=2 → réparation REFUSÉE, plan intact (8/12 → 8/12 avant, ici 7/12 = 7/12)
residual_stuck 5 · dedicated_repair : asked 2 · skipped_budget 3 · rejected bearer_missing 2
registre : dedicated_repair · 48 s · 5 407 tokens
```

**Le modèle a fait exactement ce qu'on lui demandait** : deux plats
« Pain complet et purée de cacahuètes », chacun au nom de la personne bloquée,
sans casserole, au déjeuner demandé. Et pourtant `bearer_missing: 2`. Ce n'est
donc pas le modèle : c'est la relecture ou la comparaison. Le parseur valide
`for_member_id` contre `merge.dishBearerIds`, que j'élargis ; le plafond par
case est `base × max(1, porteurs)`. Une ligne `dedicated_repair_cell` imprime
désormais, par case, les porteurs attendus et ceux revenus après relecture.

⚠️ Le modèle a aussi rendu les dix plats du plan, tous recomposés (couscous →
pommes de terre), malgré « nothing else changes » — la même désobéissance que
« Fix only these » à la réparation. Sans ceinture, c'est une consigne.

### Tir `CATCH3` — le diagnostic « plafond / rang » était FAUX ; c'est le modèle qui perd le plat de Nora

```
DEDICATED_REPAIR_PARSE  dishes_returned 7 · declared 4 · attributed 4 · refused 0
DEDICATED_REPAIR_CELL   wed/lunch · attendus [Nora] · rendus [49375b46, b60378e6] · 3 plats · ok=false
```

La relecture a gardé tous les porteurs. Le modèle a bien ajouté les deux plats
demandés, au bon nom — et a **rendu la case sans le plat de Nora**, malgré
« nothing else changes ». `bearer_missing` a donc refusé pour la bonne raison :
fusionner la case entière aurait retiré son plat à la végane.

⛔ Correction de ma lecture précédente : j'avais accusé `dishRank`
(« tout troisième plat d'une case est de rang 2 »). Les lignes de journal
écrites pour ne pas deviner ont montré que ce n'était pas ça.

**Le vrai défaut de conception** : `mergeRetryCells` importe la CASE ENTIÈRE.
Pour une entrée de dernier recours, c'est le mauvais outil — on ne veut que les
plats AJOUTÉS, jamais la table ni les dédiés existants. « Nothing else changes »
doit être garanti par construction, pas demandé au modèle.

### `appendDedicatedDishes` — « rien d'autre ne change », garanti par construction

Nouvelle fonction pure (`retry_merge.ts`) : de la relance, on ne prend que les
plats dont le porteur est un porteur AJOUTÉ, dans une case demandée ; la table
et les dédiés existants sont ceux de la base, octet pour octet. Un plat ajouté
qui cite une casserole est refusé (`citing_pot`) sans bloquer les autres ; un
porteur non rendu est nommé `missing`. L'entrée de dernier recours l'utilise à
la place de `mergeRetryCells`. Trois tests purs, épreuve ㉞ étendue.

Épreuve renforcée : la relance rend aussi une version REFAITE du plat de Nora
dans la case demandée ; il doit être ignoré au profit de celui de la base. Sans
ce cas, la mutation « porteur non filtré » restait verte — une garde dont on ne
vérifie que les effets sur des entrées qui ne l'exercent pas. Les deux
mutations (casserole citée, porteur non filtré) sont rouges.

## 2026-09-08 · lot 4 — la question de clarification (Q1)

**Ce qu'on mesurait.** « Ma mère ne mange pas autant que ça » sans prénom
reconnaissable. Avant : le tiroir 4 refuse le foyer, et une question `who`
avec `kind: portion.adjust` tombait en `forbidden_kind` (le tiroir 7 n'avait
pas de porte « portions ») — comptée, jamais posée, rien d'écrit, rien de dit.

**Tir Q1** (`24-tir-question.sh Q1 quatre … Claire`, fixture restaurée ✓) :

| appel | temps | effet |
|---|---|---|
| ① lecture | 3,6 s | `nothing_to_file`, **rien d'écrit**, une question : « Ma mère ne mange pas autant que ça » · down · options **Claire, Nora** |
| ② réponse `{answer:{kind:portion, member_id:Claire, direction:down}}` | 76 ms | `moved`, Claire `average → small`, ligne « Claire : Appétit : de moyen à petit », bulle chat |

Aucun appel modèle au second tour : la phrase avait déjà été lue, il ne
manquait que la bouche. Sans table ni plafond : la question vit dans la
réponse de `keel-read-note-v1` et dans l'état du dialogue.

**Bug de lot 3 trouvé et réparé en chemin.** `writeFromDraft` relisait la
phrase à l'adoption (« la phrase part AVEC l'adoption », vrai quand le
composeur la recevait, faux depuis que la LIRE c'est l'APPLIQUER) : un cran
d'appétit aurait été appliqué DEUX fois — reprise puis adoption. `note` est
sorti de `ComposeDraftInput` ; la phrase ne voyage plus que par
`readNote`/`answerNote`, depuis le dialogue. Non mesuré sur un run (le tir
aurait coûté deux compositions de 4 min) ; établi par lecture des deux pages.

### Tir `CATCH4` — composition juste du premier coup, le chemin « plats ajoutés » n'a pas eu à partir

12/12, journée 4/4, aucune réparation demandée, personne de bloqué. Ne prouve
rien sur `appendDedicatedDishes` (jamais exercé) ; ajoute un tir `high` à 100 %.
Bilan `high` sur `quatre` : H1, H4, HIGH2, FAST1, CATCH4 à 100 % ; FAST2 66,
CATCH1 66, CATCH2 58, CATCH3 50. **5 sur 9 à 100 %, médiane 100 %, min 50 %.**
Un tir de plus est nécessaire pour voir l'entrée de dernier recours ACCEPTÉE.

### Tir `CATCH5` — la première entrée de dernier recours ACCEPTÉE et SERVIE

```
ASK  « Quinoa, courgettes, tomates et poulet »  frais gelé · casseroles 0/3 · stuck=true
FROZEN_REWRITTEN pots=3 → réparation refusée · residual_stuck 3
DEDICATED_REPAIR_PARSE  dishes_returned 7 · declared 4 · attributed 4 · refused 0
DEDICATED_REPAIR_APPEND added 1 · citing_pot 2
dedicated_repair : asked 2 · accepted 1 · registre 58 s
   lunch  minor_12_17  « Pain complet, beurre de cacahuète »  → 224 kcal/100 g  in_bounds
```

L'ado, bloqué au déjeuner (casseroles gelées par deux adultes dans leurs
bornes), reçoit **son** plat : pain complet et beurre de cacahuète, à sa densité,
dans ses bornes. Il sort du plat commun (l'ombre le réattribue), sa journée
reste à ±5 %. Plan 10/12. Deux plats ajoutés citaient une casserole : refusés
par construction (`citing_pot`), sans bloquer le troisième.

⚠️ `missing: 3` pour `asked: 2` : le compteur faisait le produit cartésien
porteurs × cases. Corrigé : `asks` en paires (case, porteur), `missing` ne
compte que les paires demandées ; un porteur rendu dans une case non demandée
n'entre pas. Test ajouté.

### La réparation de densité n'ÉPISSE plus que les unités autorisées

Décision du propriétaire : le modèle voit tout le plat, on ne lit dans sa
réponse que ce qu'on lui a autorisé à réécrire. `spliceReworkableUnits`
(`retry_merge.ts`) : pour chaque plat demandé (apparié par case ET porteur), le
frais est remplacé s'il était réécrivable ; chaque casserole autorisée est
remplacée par ses seuls ingrédients, **id et `servingsMade` gardés** ; casseroles
gelées, autres plats, sessions : la base, octet pour octet. Courses : mêmes
règles que la fusion, restreintes aux unités lues.

Retirés de la machinerie, parce que sans objet : `mergeRetryCells` sur ce
chemin, `unforkReworkedPots`, le refus `frozen_rewritten`, la garde
`dedicated_lost`, le refus `missing_pot`. Leurs compteurs restent écrits à zéro.
Quatre épreuves de câblage **retournées** (㉔ ㉙ ㉚ ㉟), trois tests purs, deux
mutations rouges (une casserole gelée lue ; le porteur non apparié).

### Suite Deno bloquée par l'autre session (2026-09-08, soir)

`memory_clarification_io.ts` a gagné un champ obligatoire (`safety`) et son test
n'a pas suivi : cinq erreurs de type, aucune dans les fichiers de ce chantier.
Le verdict de la suite entière est indisponible tant que ces deux fichiers,
modifiés par l'autre session, ne sont pas cohérents. Verdict de ce chantier pris
en ignorant ce seul fichier de test.
Second fichier externe rouge : `memory_recap_test.ts:511` (« un nombre et une
absence traversent inchangés »), même famille `memory_*`, modifiée par l'autre
session ce soir. Verdict de ce chantier pris en ignorant les deux.

## 2026-09-08 · banc de 20 phrases « à la place des gens » (`25-banc-phrases.sh`)

Chaque phrase lue par `keel-read-note-v1` sur la fixture à quatre bouches
(Paul, Claire, Leo 12, Nora — deux adultes femmes), fixture restaurée à chaque
tir. Fichier : `banc-phrases-*.md`.

**Juste du premier coup (13/20)** : goût par bouche (P01), variété (P02),
« les enfants adorent » → Leo seul car Nora est adulte (P05), « encore faim
après le dîner » → note datée et pas une part (P06, règle du créneau), « mon
fils » → Leo `small` (P08), « les enfants mangent moins » → Leo (P09), encart
week-end (P11), merci → rien (P15), « dehors le vendredi soir » → note (P16),
« moins le midi » → note (P18), « Paul et Claire » → deux crans (P19), « ma
mère … et Leo veut plus de poulet » → question + goût (P20).

**Trois défauts, réparés le soir même :**

| phrase | avant | après |
|---|---|---|
| « Claire est végétarienne », « pas de porc » (P03, P13) | régime **écrit** en sécurité, réponse « rien trouvé à changer » | ligne `safety` annoncée (« Claire : un régime : vegetarian »), et la bulle de chat porte le bloc « si je me suis trompée… » — `notifyMemoryWrite` avait `safety: []` en dur |
| « trop compliqué » sur style déjà `minimal` (P10) | `not_written`, « rien à changer » | compteur `at_edge`, copie « c'est déjà au bout de l'échelle » |
| « un peu de variété » sans base (P02) | « Variété : de rien à variée » | « Variété : variée » |

Et « pas le temps le soir », « trop de restes », « perdre du poids » (P04,
P07, P12, P17) : `skipped` par conception, mais la copie disait « rien à
changer » → « ça, je ne sais pas encore le régler d'ici ».

**Un manque, PAS réparé — lot 5 :** « Ma femme est allergique aux noix »
(P14, 4 tirs) : 2 fois écrite pour Claire, 2 fois **tombée sans rien** (ni
sécurité, ni question, ni `skipped`). Claire ET Nora sont adultes femmes ; la
règle « si deux personnes correspondent, ne range pas » s'applique, et la
sécurité n'a aucune porte `clarify` (seule `scope` existe). L'écriture la plus
grave du produit est celle qui n'a pas de question « pour qui ? ». À
construire : porte `safety` du tiroir 7 + `answer.kind: "safety"` qui écrit la
déclaration pour la bouche choisie.

Réseau : trois tirs perdus (« invalid response from upstream ») — le runtime
edge était recréé par une édition voisine ; aucun n'est un verdict.

### Tir `SPLICE1` (quatre) — 500 en 2,8 s : la fixture porte depuis 21 h 19 une allergie « nuts » que le catalogue ne connaît pas

Pas mon code : `[keel/household_safety] a household allergy resolves to no
catalogued allergen (nuts)` — la ceinture fail-closed refuse de composer.
`household_member_allergies` : ligne `nuts` pour **Claire**, créée à
**21:19:43**, entre CATCH5 (20:52, passé) et SPLICE1 (21:29, refusé). Le banc
n'écrit jamais d'allergie ; le catalogue (`allergen_catalog.ts`,
`allergen_surface_forms.ts`) n'a pas bougé et ne contient pas `nuts`. La
fenêtre coïncide avec les événements `keel.memory_clarification` de l'autre
session (21:13–21:15) — son chantier `memory_*` en cours.

⛔ La ligne n'est **pas** supprimée : donnée d'une autre session, sur une
fixture partagée. La ceinture a raison de refuser un allergène non catalogué ;
« nuts » sans forme de surface ne protégerait que le mot tapé. Tir de contrôle
reporté sur `duo`.

**Écrivain identifié** : `draft_note_safety_io.ts:186` → RPC
`keel_household_add_allergy_for` (une note de brouillon promue en allergie de
membre). La RPC valide la LONGUEUR du libellé (1–120), jamais son appartenance
au catalogue. Une note « allergique aux noix » devient un libellé `nuts` que la
ceinture ne sait pas cataloguer, et **toute composition du foyer est refusée**
(fail-closed, à raison). À porter à l'autre session : valider le libellé contre
`allergen_catalog` avant l'insert, ou le résoudre en référence cataloguée.

### Tir `SPLICE2` (duo) — composition juste du premier coup, l'épissage n'a pas eu à partir

6/6, journée 2/2, aucune réparation demandée : `splice` écrit à zéro, comme
`pot_forked` / `pot_unforked` / `frozen_rewritten` / `dedicated_lost` /
`missing_pot`, tous gardés au journal. Ne prouve rien sur l'épissage : il faut
un tir qui DEMANDE une réparation. `quatre` (l'ado déclenche presque toujours)
est bloqué par la ligne `nuts` de l'autre session ; `cinq` (trois mineurs)
déclenche à coup sûr mais meurt sous les rechargements externes.

### Tir `SPLICE3` (cinq, 0 rechargement) — trois enseignements

```
ASK ×2 : frais gelé · casseroles 0/3 · stuck=true          → density_repair 78 s → no_cell
DEDICATED_REPAIR_APPEND added 2 · missing 0 · citing_pot 0  → accepted 2
final 12/15 · journée 5/5 · still_out 3
   breakfast  adult_fat_loss  « Bouillon de légumes, haricots blancs »   57,8 kcal/100 g  over_max
   lunch      adult_gain      « Pain complet, fromage frais, avocat »    167              over_max
```

1. **On a demandé au modèle deux plats qu'on savait bloqués** : 78 s pour
   `no_cell`. Désormais un bloqué à la demande n'est pas envoyé
   (`skipped_stuck`) ; il va directement à l'entrée de dernier recours.
2. **« Alléger » sans plancher** : l'adulte en perte de gras était SOUS son
   plancher au petit-déjeuner ; le plat à son nom, « reste sous 145 », est
   revenu à 57,8 — et l'assiette est passée de trop petite à trop grosse.
   `floorPer100G` = densité sous laquelle l'assiette dépasse son plafond de
   masse ; la consigne dit une BANDE.
3. **« Accepté » ≠ « atteint »** : deux plats acceptés (ils n'ont pas dégradé
   le plan), deux hors bornes. `missed_aim` le compte.

L'épissage lui-même n'a toujours pas été exercé (rien d'autorisé à lire) ; la
paire (case, porteur) de l'entrée de dernier recours, elle, a fonctionné :
`added 2, missing 0`.
Troisième fichier externe rouge : `household_diet_test.ts:27` (« les quatre
réponses ») — `household_diet.ts` modifié par l'autre session à 23 h 44, régime
`gluten_free` ajouté, test non suivi. Ignoré pour le verdict de ce chantier.

Trois corrections issues de SPLICE3, vérifiées : `skipped_stuck` (un bloqué à
la demande n'est plus envoyé au modèle ; mutation rouge), `floorPer100G` sur
toute demande « alléger » et bande rendue dans la consigne (mutation rouge),
`missed_aim` sur les plats dédiés acceptés. Suite de ce chantier : 6089, zéro
rouge, hors `memory_clarification_io_test`, `memory_recap_test`,
`household_diet_test` (fichiers de l'autre session en cours).

### Tir `SPLICE4` (cinq, 0 rechargement) — les trois corrections tiennent en direct

```
skipped_stuck 2  → AUCUN appel density_repair (registre : composition, fill, dedicated_repair)
dedicated_repair : asked 2 · accepted 2 · added 2 · missing 0 · missed_aim 2
13/15 (SPLICE3 : 12/15) · journée 5/5 · still_out 1
   breakfast  adult_gain  « Pain complet, fromage frais et avocat »  214 kcal/100 g  in_bounds
   lunch      adult_gain  « Pain complet, avocat, feta et tomate »   178              over_max
```

Les deux plats bloqués ne sont plus envoyés à la réparation (78 s économisées
à chaque fois) ; les deux personnes vont directement au dernier recours, qui
les sert. `missed_aim: 2` dit honnêtement que les deux plats ajoutés n'ont pas
atteint le chiffre demandé — l'un tombe quand même dans les bornes.
Meilleur résultat mesuré sur `cinq`. L'épissage proprement dit reste à
exercer : ici tout était bloqué, donc rien n'était autorisé à lire.

### SPLICE4 — le dîner de Nora immesurable pour « 10 feuilles d'herbes fraîches »

`unmeasurable_by: {missing_quantity: 1}`. Le terme « herbes fraîches » n'a
**aucun alias** au référentiel (les seuls `herb*` sont `dried_herbs` et des
plats composés) ; « 10 feuilles » est une unité sans `unit_grams`. Une garniture
à ~35 kcal/100 g a rendu un plat entier impesable, donc sans portion pour Nora.
Même famille que le cas du sel du 2026-09-08 : la convention `condimentMassFor`
sait peser ça (les `herbs_*` portent `condiment_grams = 5`), il manque l'alias.

Proposition (référentiel, migration locale, décision de curation) : alias
`herbes fraîches` / `herbes fraiches` / `fines herbes fraîches` → un slug
`herbs_*` à densité basse avec `condiment_grams`. Non appliqué : c'est la lane
du référentiel, et le slug cible est un choix.

### Tir `SPLICE5` (duo) — l'épissage exercé en direct, et il répare

```
ASK « Dinde, lentilles, pommes de terre et tomates » densify → 120 · frais libre · casseroles 1/1
density_repair 40 s → SPLICE fresh 1 · pots 1 · missing 0 · courses +4 −3 → accepté 1/1
repair_effect : 4/6 → 6/6 · journée 2/2
```

Le dîner dépassait pour les deux adultes (ils avaient donc besoin de la même
direction : frais ET casserole réécrivables). Le modèle a réécrit ce qu'on lui a
autorisé ; on n'a lu que ça ; la casserole a gardé son id ; les deux assiettes
sont rentrées dans leurs bornes. Première réparation de densité acceptée depuis
que la fusion de case a été retirée — et la première qui n'ait rien eu à
refuser, à défourcher ni à restaurer.

### 2026-09-09 00:35 — trois `409` : CORRECTION, ce n'était pas un verrou orphelin

Première lecture (fausse) : brouillon `running` de 22:22 jamais terminé,
balayage sans appelant. Vérifié ensuite : le balayage EST appelé
(`openDraft` → `sweepStuckDrafts`, 7 min), et la ligne est passée `done` à
22:25:33 **heure base** — l'horloge de la base est ~2 h derrière l'hôte
(UTC/CEST). Au moment des trois tirs, une requête `duo` d'un AUTRE processus
(`12219578…`, pas du banc) était réellement en vol ; le conflit était juste.
Ma mise à jour manuelle n'a touché aucune ligne (pas 7 min d'âge) : aucune
donnée modifiée.

Reste à comprendre pourquoi les tirs `cinq` ont conflicté sur le compte `duo`
(`91cf3cb5` = qa-9pts-duo) : mapping du banc ou jeton réutilisé.

**Cause réelle des trois `409` : mon veilleur.** `for t in "R1 cinq" …; set -- $t`
sous zsh ne découpe pas `$t` : le banc a reçu `CAS="R1 cinq"`, fixture vide, donc
`duo` par défaut — et `duo` était occupé par un autre processus (brouillon
`running` légitime). Aucun tir n'a été fait sur `cinq`. Le mapping et le jeton du
banc sont justes. Veilleur réécrit avec des paires explicites.

## 2026-09-09 · localité d'une reprise (`26-localite.sh`, duo, 2 jours)

**Question.** Une phrase qui vise UNE case change-t-elle cette case, ou tout le plan ?

**Protocole.** A = composer (brouillon, rien d'autre) ; C = composer à l'identique
(le bruit du modèle) ; ① lire une phrase visant le dîner du dernier jour ; B =
composer (sans phrase). Fixture restaurée. Trois coupures de passerelle
(runtime recréé par une session voisine), chacune rejouée.

| comparaison | cases | même plat | mêmes ingrédients |
|---|---|---|---|
| A → C (rien changé) | 6 | **0** | 2 |
| A → B (après la phrase) | 6 | **0** | 3 |

**Verdict.** Il n'existe aucun mode localisé : la recomposition réécrit les six
cases, phrase ou pas. Le bruit seul (A→C) vaut déjà 100 % au niveau du plat.
Un « change seulement le vendredi soir » ne peut donc pas être tenu par une
recomposition, quelle que soit la façon de ranger la phrase.

Défaut du banc : la phrase construite avait un ingrédient vide (« pas de  —
plutôt du poulet ») parce que le premier `term` du dîner de A est vide ; lue
comme une envie « du poulet » (encart) — et B n'a PAS mis de poulet le
vendredi soir. L'encart non plus n'est pas localisé à un créneau.

### 2026-09-09 — trois tirs de vérification demandés par le propriétaire (cinq)

**T1 — PROPRE, complet.** `http=200 · 222 s · 0 rechargement`. Aucune réparation
de densité demandée ; entrée de dernier recours 2/2 pour la même personne
(petit-déjeuner et dîner), **rien d'autre touché** (chaque plat et casserole de
la composition identique en termes et en citations), **15/15 assiettes dans les
bornes, 5/5 bouches-jours à ±5 %**, aucune immesurable.

**T2, T3 — tués avant la lane.** `500` en 0,8 s et 0,2 s, zéro appel modèle,
aucun `request_id` journalisé ; **3 puis 2 rechargements externes** pendant les
tirs : l'autre session a repris ses écritures sous `_shared` à la fin de ma
fenêtre de calme. Rien de ce chantier. À rejouer dans une nouvelle fenêtre.

**T2/T3, cause exacte** : `[keel/cooking_plan] maxFridgeDays est REQUIS et >= 1:
undefined`. Entre T1 et T2 l'autre session a réécrit `cooking_plan.ts`,
`meal_generation.ts`, `grocery_waves.ts`, `raw_keeping.ts` **et les deux
entrées de lane** (`generate-household-meal-v1/index.ts`,
`generate-meal-v1/index.ts`). Les deux lanes ne compilent plus (`TS2345` sur
l'argument de composition) et le runtime fait `500` sur toute composition.
Mes dix marqueurs (épissage, bloqués non demandés, `missed_aim`, dernier
recours, journal, effort, revert six champs…) sont **tous présents** dans le
fichier qu'ils ont écrit : les écritures ont fusionné sur le disque.
Instantanés `*.T1-ok*.bak` pris dans le scratchpad pour restaurer par `cp`
si un marqueur disparaissait. Deux tirs restent à faire, dès que leur
refonte a atterri (compilation + sonde sans `500`).

## 2026-09-09 · chirurgie locale, pièces 1 et 2 (`operation: "edit_cells"`)

**Construit.** Module pur `cell_edit.ts` (lecture des cases, consigne au
modèle avec le plan entier, fusion par `mergeRetryCells` : seules les cases
demandées sont prises, le reste est le départ octet pour octet ; refus dits
`cell_not_rendered` / `cell_unknown`). Générateur : `edit_cells` = une
composition à tous égards (gardes, prompt, parseur, magasin) sauf trois
endroits : le message au modèle (plan de départ + cases), la fusion après
parseur, les relances d'amélioration coupées (`improvementRetries`, comme sur
l'adoption). Le magasin de brouillons garde `source_text` (le texte du
modèle) ET `source_meal` (le plan final).

**Premier tir (`28-tir-edit.sh`, duo, 2 jours) — la fusion est juste, la
base ne l'était pas.** A : 272 s, 13 plats. B (`edit_cells`, vendredi soir,
« plutôt du poulet ») : 90 s, `taken: fri/dinner`, `untouched: 11`. Mais B
n'avait AUCUN plat commun avec la réponse de A… et il en avait 11 avec le
TEXTE SOURCE de A. La réponse rendue de A ne correspond pas à son propre
texte modèle : une relance modifie `meal` EN PLACE (`meal.dishes.length = 0;
push(...)`) et `mealSourceText` ne suit pas toujours — défaut du générateur,
préexistant, hors de ce lot. Conséquence de conception : la base de fusion
est désormais le PLAN FINAL rangé (`source_meal`), le texte n'est que le
contexte donné au modèle.

Piège rejoué en chemin : une migration voisine `120000` appliquée entre
temps a fait sauter ma `113000` en silence (« hors ordre ») ; renommée
`123000`, appliquée.

### Les trois tirs de vérification demandés — verdicts (cinq, base = dernier plan entier avant rattrapages)

| Tir | Rattrapages | Rien d'autre touché | Cibles (±5 %) | Assiettes |
|---|---|---|---|---|
| T1 | dernier recours 2/2 (même personne, 2 cases) | ✓ | **5/5** | **15/15** |
| T4 | épissage 2/2 (frais seul) · 3 bloqués non demandés · dernier recours 2/0 | ✓ | **5/5** | 9/15 |
| T5 | 1 bloqué non demandé · dernier recours 2/0 (34 rechargements externes) | ✓ | **5/5** | 13/15 |

⚠️ Leçon de lecteur : la base de comparaison est le **dernier plan entier avant
les rattrapages**, pas le premier jet — une relance de ceinture
(`exclusion_retry`, T4) remplace le plan en amont et renomme ses casseroles ;
comparée au premier jet, elle fait lire « tout a bougé ». Ces relances ne sont
pas des rattrapages de densité.

### Dernier recours : le refus devient plat par plat (T4, T5)

Deux fois de suite, deux plats ajoutés au nom de deux personnes, l'un impesable,
et le refus « en bloc » jetait aussi celui qui était bon (`accepted 0` alors que
`added 2`). Le bloc avait un sens pour une case fusionnée ; des plats ajoutés
sont indépendants. Désormais : le seul impesable est retiré, le plan remesuré,
le reste jugé (`dedicated_repair_partial`). Épreuve ㊳, mutation rouge.

### 2026-09-09 01:4x — rouges de la suite après la refonte de l'autre session, attribués

- `constant_pinning_gate_test:906` — constante non épinglée `CELL_EDIT_MAX`
  (`cell_edit.ts`) : **leur** fichier.
- `cooking_style_brief_test:70` — `M`, 00:37, refonte `cooking_plan` : **leur**.
- `swap_presence_test:144` — épingle le littéral `&& !adoptingDraft &&` que
  **leur** refonte de `index.ts` a remplacé par `improvementRetries`
  (= `!adoptingDraft && !editing`) ; la propriété tient, le littéral non.
  Fichier à eux, non retourné ici.
- `portion_sizing_wiring_test ⑬` — même cause ; **mon** fichier, retourné vers
  la définition du drapeau.
Le garde d'adoption n'a pas disparu : il a été renforcé (`!editing` en plus).

**Second tir, base = plan final (`30-tir-edit-seul.sh`, même brouillon A, 72 s).**
`taken: fri/dinner`, `untouched: 10/12`, une casserole importée, une élaguée.

| hors case visée | identiques |
|---|---|
| plat + quantités écrites (« 80 g », « 1 tbsp ») | **10 / 10** |
| grammes calculés (`grams_raw`, boîtes) | re-dérivés : ± 0,5 g de facteur d'assiette partout ; une re-répartition réelle (`prep_salmon` : le dîner remplacé ne s'y sert plus, le déjeuner en reçoit plus) |

**Verdict.** La chirurgie locale tient à l'échelle de ce que la personne
lit : la case visée change, les dix autres gardent leur plat et leurs
quantités. Les grammes calculés bougent parce que les ceintures rejouent sur
TOUT le plan — et c'est voulu : elles tiennent Σ portions = casserole, et une
casserole partagée avec la case remplacée doit être re-répartie. Figer les
grammes des cases intactes casserait cet invariant. À trancher si l'on veut
la promesse « octet pour octet » jusqu'aux grammes : elle exige une casserole
par case, pas une répartition.

### T6 — tué par 23 rechargements externes ; la preuve vivante de ㊳ attendra

La porte (6 min de calme + compilation) s'est ouverte, puis l'autre session a
repris ses écritures pendant le tir : `502` ×3, zéro appel modèle. Les trois
tests demandés sont livrés (T1, T4, T5 : rattrapages propres, cibles 5/5 à chaque
fois). Le refus plat par plat du dernier recours (㊳) est épinglé et muté rouge ;
sa preuve en direct demande une fenêtre que cette nuit n'offre plus. Marqueurs
de ce chantier : 10/10 après leurs écritures.

### T7 (cinq, 0 rechargement) — quatrième tir vérifié, et l'indépendance des plats ajoutés se voit en direct

```
skipped_stuck 2 · dernier recours : asked 2 · append added 1 · citing_pot 1 · accepted 1
   wed/lunch  « Pain complet, comté, avocat et huile d'olive »  ajouté au nom de 398f89f0
12/15 · journée 5/5 · rien d'autre touché · missed_aim 1
```

Deux plats demandés : l'un citait une casserole, refusé **par construction** et
compté ; l'autre est entré. Avant ce soir, le refus était « en bloc » : les deux
seraient tombés. La branche « impesable → retrait du seul plat » (㊳) n'a pas eu à
se déclencher ; sa preuve reste l'épreuve et la mutation rouge.

**Bilan des tirs de vérification demandés** : T1 15/15 · T4 9/15 · T5 13/15 ·
T7 12/15 — **rattrapages propres 4/4, cibles à ±5 % 20/20 bouches-jours.**

## 2026-09-09 · chirurgie locale, pièce 3 — le tiroir « cette case-là »

Tiroir 8 `cells` du classifieur : jour ET moment nommés, sinon rien (« le
soir » sans jour = note ; « jeudi » sans moment = passé). Lu par le lecteur
du générateur (`readCellEdits`), rendu par `keel-read-note-v1` dans
`cells[]`, **écrit nulle part**. Trois tirs réels (quatre, lecture seule) :

| phrase | rendu |
|---|---|
| « Vendredi soir, plutôt du poulet et quelque chose de plus léger » | `cells: [fri/dinner]`, rien d'écrit |
| « Le soir je mange moins » | note (sans jour), `cells: []` |
| « Jeudi midi c'était trop lourd, et Leo n'aime pas les brocolis » | `cells: [thu/lunch « c'était trop lourd »]` + goût de Leo |

Reste : pièce 4 (le front appelle `edit_cells` quand une case revient et
qu'un brouillon est ouvert), pièce 5 (banc de bout en bout).

## 2026-09-09 · chirurgie locale, pièce 4 — le front

Quatrième geste du dialogue : `onEditCells(draftId, cells)`. Après la lecture
(et la réponse à une éventuelle question), si la phrase désigne une case ET
qu'un brouillon est rangé, le dialogue appelle `editCells` (`operation:
"edit_cells"`) au lieu de recomposer ; sinon il compose. Un tour dans les
deux cas. Sous le champ : « J'ai refait vendredi soir ; le reste est identique
(N plats gardés tels quels) » — depuis `envelope.edit.taken`, jamais depuis la
demande. Refus (`cell_not_rendered`, `cell_unknown`, `draft_has_no_source`,
`draft_mismatch`) en rouge sous le champ, l'aperçu courant reste. Lane
individuelle : recomposition, `edit` reste `null`.

Deux pièges rejoués, réparés : la garde des refus ne lit que les littéraux
(un ternaire sur `error:` et une fabrique `refuse()` rendaient six jetons
invisibles au front) ; le test de câblage de l'adoption épinglait
`!adoptingDraft` sur les deux lanes (la lane foyer nomme désormais la coupure
`improvementRetries`).

Vérifié par typecheck et tests de câblage (pas de rendu navigateur : il
faudrait saisir un mot de passe de fixture). Reste : pièce 5, le banc de bout
en bout — phrase → case → `edit_cells` → aperçu.

## 2026-09-09 · chirurgie locale, pièce 5 — le banc de bout en bout (`31-bout-en-bout.sh`)

Le chemin exact du front, sans case écrite en dur : la phrase est lue par le
classifieur. Foyer duo, deux jours, fixture restaurée.

| étape | temps | résultat |
|---|---|---|
| A · composer (draft) | 313 s | 14 plats, `draft_id` |
| ① · « vendredi soir, plutôt du poulet et quelque chose de plus léger. » | 4,6 s | `cells: [fri/dinner]`, rien d'écrit |
| B · `edit_cells` | 91 s | `taken: fri/dinner`, `untouched: 12`, 1 casserole importée, 3 lignes de courses ajoutées |

Diff A/B hors case visée : **11 / 11 identiques** (plat + quantités écrites).
Case visée : table « Saumon, sarrasin, aubergine » → « Poulet, quinoa,
courgette, tomates », bouche dédiée « Lentilles, sarrasin » → « Poulet,
quinoa, courgette, concombre ». Le lot tient de bout en bout.

## 2026-09-09 · le complément — raboter la part gelée, l'entrée porte le reste

Décision du propriétaire : « dans le cas où tout est gelé, on diminue la
portion et on ajoute de la calorie dans l'entrée ». Ce n'était pas ce qui était
codé, sur trois points : la table ne rabotait jamais (`factor: r.factor` nu,
`served_over_max` compté), le plat ajouté RETIRAIT la personne du plat partagé
(`mouthsFedByDish`, sémantique du végane), et il portait donc la cible entière.
Livré : `complements_shared` (un écrivain, `appendDedicatedDishes`, qui reprend
aussi les courses de l'entrée), `complementAskFor` (densité d'un complément,
part d'assiette 0,2), `splitPlateWithComplement` (masse = borne, énergie =
cible), passage ③ bis de `shadowSizing` avant casseroles et couvercles,
retrait d'un complément insoluble, front : la case garde la table et rend
l'entrée en « + ». Suite Deno : 6180 verts, 2 rouges de l'autre session
(`cooking_style_brief_test`, `household_merge_quota_test` — cinq
`return jsonResponse(` ajoutés entre la réclamation et le modèle par leurs
refus `edit_cells`, pas par ce chantier). Front : 37 verts sur les deux
fichiers touchés, `tsc -b tsconfig.app.json` propre.

### Tir `COMP1` (cinq, 261 s, delta registre 2 + 1 dedicated) — le pain-comté jeté sans raison dite

```
verdicts 12/15 · journée 5/5 · residual_stuck 3 · dedicated asked 2 (budget 2 sur 3)
append : added 1 (« Pain complet, comté et huile d'olive », ~340 kcal/100 g, pour l'adulte en prise) · citing_pot 1 · shopping_added 2
dedicated_repair_unsolvable : dropped 1, kept 0  →  accepted 0, complement.solved 0
```

Par le calcul il aurait dû résoudre (ρs 244, ρc ~340 > 244, cible 1 910 <
700 × 3,4). Le journal ne disait pas POURQUOI : ajouté
`keel.household_meal.complement_unsolvable` avec la raison nommée
(`no_shared_dish`, `owner_not_on_shared`, `complement_unmeasurable:<gaps>`,
`wrong_side_or_whole_plate`, …) et `complement.unsolvable_by`. Tir COMP2 ensuite.

### Tir `COMP2` (cinq, essai 1 coupé à 402 s par le worker, essai 2 en 305 s) — les deux compléments RÉSOLVENT

```
verdicts 14/15 (COMP1 : 12/15) · clamped {max 0, min 2} · served_over_max 2
dedicated : asked 2 · accepted 2 · added 2 · unsolvable 0 · shopping_added 3
complement : solved 2 · moved_kcal 56
   breakfast adult_fat_loss  table 140 g + « Concombre, tomates et yaourt » 109 g = 249 g (borne 250) · 369 + 43 = 412 kcal = cible
   breakfast minor_12_17     table 216 g + même entrée 33 g = 249 g · bac [deux ados] 370 g = 154 + 216 ✓
```

Le rabotage et l'entrée dimensionnée à la différence tiennent en direct, sur
deux personnes, dans la même case, avec un bac partagé qui reste la somme des
parts. Trois défauts vus et corrigés avant COMP3 : (1) la journée comptait la
CIBLE deux fois pour une personne complétée (3/5 au lieu de 5/5, artefact de
journal : `servedByMouthDay`) ; (2) `missed_aim 2` lu sur le plat PARTAGÉ, pas
sur l'entrée ; (3) le budget de 2 servait les deux « trop petit » du
petit-déjeuner (ordre des plats) et laissait 1 021 g et 879 g à l'adulte en
prise — bloqués triés « trop gros » d'abord, budget porté à 4 (un seul appel
modèle quel que soit le nombre). `WORKER_LIMIT` à l'essai 1 : composition à
`high` au-delà des 400 s du worker, sans lien avec ce chantier.

### Tir `COMP3` (cinq) — INVALIDE : 502 × 3 sans appel modèle, le code a changé sous la mesure

`empreinte APRÈS ≠ AVANT`, `llm_usage delta 0`. L'autre session écrivait
`composition_fill.ts`, `composition_fill_io.ts` et `meal-energy-v1/index.ts`
(03:47–03:49) ; `functions serve` recharge à chaud sur chaque écriture et annule
la requête en vol. Rien à réparer côté chantier ; tir COMP4 gardé par le
silence (aucune écriture sous `supabase/functions` depuis 3 min).

### Tir `COMP4` (cinq, après 3 min de silence) — INVALIDE aussi : écritures de l'autre session à 03:57 et 04:01

`composition_fill_io.ts`, `composition_reading_index_test.ts`, `self_presence.ts`
pendant les essais ; 502 × 3, un seul appel modèle facturé pour rien. Les
trois correctifs d'après COMP2 (cible comptée une fois, `missed_aim` sur le
plat ajouté, budget 4 avec « trop gros » d'abord) sont couverts par ㊵ et les
épingles ; leur preuve en direct attend une fenêtre sans écriture.

### Tir `COMP5` (cinq, après 5 min de silence) — INVALIDE : `household_portions.ts`, `meal-energy-v1`, `target_grams_test.ts` écrits à 04:09–04:10

502 × 3, delta registre 0. Garde suivante : 8 min de silence (COMP6, en attente).

### Tir `COMP6` (cinq, 206 s, après 8 min de silence) — budget 4 et « trop gros » d'abord tiennent ; deux entrées sur trois IMPESABLES

```
verdicts 14/15 · journée 5/5 (cible comptée une fois ✓) · missed_aim 0 ✓ · clamped {max 0, min 1}
dedicated : asked 3 (trois bloqués, budget 4) · added 3 · shopping_added 5 · unsolvable 2 · accepted 1
complement : solved 1 — lunch adult_fat_loss : table 223 g + « Concombre, tomate, yaourt, huile » 27 g = 250 g, moved 11 kcal
complement_unsolvable : breakfast over_max (« Pain complet, comté, huile ») et dinner under_min (« Chou, carotte, yaourt, huile »)
                        → complement_unmeasurable:unknown_ingredient  (« comté » absent du référentiel, « chou blanc » sans alias cru/cuit)
```

Le sas de remplissage de composition (`composition_fill`) tourne sur le plan
composé, AVANT que l'entrée n'existe : un terme inconnu de l'entrée n'est
jamais réparé. Correctif : les ingrédients des plats ajoutés passent par le
même sas (`fillPlanComposition` / `repairPlanComposition`, source
`dedicated_repair_fill`), l'index réparé est ABSORBÉ en place
(`absorbIndexInto` — réassigner `composition` ferait perdre son rétrécissement
aux fermetures, le compilateur le refuse), l'entrée est repesée, puis mesurée.
Câblage ㊶, `fill_unknowns` et `fill_absorbed` dans `dedicated_repair`. Coût :
un appel de remplissage de plus, seulement quand une entrée est ajoutée.
Tir COMP7 gardé par 8 min de silence.

### Tir `COMP7` (cinq, après 8 min de silence) — INVALIDE : l'autre session tire (`generate-meal-v1` 04:31–04:40) et écrit (`self_presence`, `meal-energy-v1`, `tracking_v2`, 04:36–04:41)

502 × 3 ; l'essai 3 a facturé 4 appels (composition, fill, dédié, fill de
l'entrée) avant d'être coupé par un rechargement. Garde suivante : 15 min.

### Tir `COMP8` (cinq, 250 s, après 15 min de silence) — 17/17 DANS LES BORNES, journée 5/5, still_out 0

```
residual_stuck 2 (deux « trop petit » de l'adulte en perte, petit-déjeuner et dîner)
dedicated : asked 2 · added 2 · accepted 2 · unsolvable 0 · missed_aim 0 · shopping_added 3
complement : solved 2 · clamped_min 2 · moved_kcal 9
   breakfast adult_fat_loss  table 235 g + « Tomate, concombre, laitue et citron » 15 g = 250 g
   dinner    adult_fat_loss  table 237 g + « Courgette, tomate, roquette et haricots blancs » 13 g = 250 g
verdicts {in_bounds 17, over_max 0, under_min 0} · served_over_max 0 · day_kcal 5/5
```

Premier tir du foyer où toutes les assiettes sont dans les bornes et toutes
les journées à ±5 %. Le sas de remplissage de l'entrée n'a rien eu à réparer
ici (termes connus) ; sa preuve sur un terme inconnu reste à voir.

### 2026-09-09 · ligne `nuts` de Claire (`quatre`) retirée sur décision du propriétaire

`delete from household_member_allergies where label='nuts' and member_id='620d929d-…'`
(posée par l'autre session le 2026-09-08 à 21:19:42, hors catalogue, bloquait
toute composition de `quatre`). Tir Q1 gardé par 15 min de silence.

### Tir `Q1` (quatre, 14:05) — INVALIDE : l'autre session a repris à 14:05 (`energy_target`, `household_portions`, `weight_pace`, `meal_envelope` en deux minutes), 502 × 3 sans appel modèle

Garde réarmée (15 min de silence), tir Q2.

### Tir `Q2` (quatre, 180 s, après 15 min de silence) — 12/12 dans les bornes, 4/4 journées, aucun rattrapage demandé

```
verdicts {in_bounds 12, over_max 0, under_min 0} · served_over_max 0 · clamped {0,0}
repairs asked 0 · residual_stuck 0 · dedicated asked 0 · complement solved 0
day_kcal 4/4 · les 5 critères de bascule verts
```

Premier tir de `quatre` depuis le retrait de la ligne `nuts` (fixture débloquée).
Trois cases, un plat de table par case + deux plats de régime (Claire œufs/
lentilles, Nora tofu/pois chiches) : la règle du plat à part joue, le
complément ne se déclenche pas — il n'y avait aucun bloqué. Le chemin nominal
n'est donc pas touché par le lot : `dedicated` et `complement` restent à zéro,
et les douze assiettes tiennent sans rien raboter. Avec COMP8 (cinq, 17/17,
2 compléments résolus), les deux fixtures sont vertes.

### 2026-09-09 · le pourcentage par bouche et par jour, ÉCRIT (`day_kcal.per_mouth`)

Demande du propriétaire : « je veux le % par rapport aux cibles caloriques sur
chaque journée ». Le journal ne portait que l'agrégat (`within_5pct / rows`) :
lire 5/5 ne dit pas si c'est 100 % ou 96 %. Ajouté une ligne par bouche-jour
(`day`, `eater_bucket`, rang `n`, `served`, `target`, `pct`), sans `member_id` —
deux personnes du même seau se distinguent par le rang. Câblage ㊷, lecteur
`45-lire-complement.py` mis à jour.

Reconstruit sur les archives (kcal servis par personne, un jour) :

| tir | bouche | plat de la table | son plat / son entrée | total |
|---|---|---|---|---|
| COMP8 `cinq` | Marc (prise) | 4 774 | — | 4 774 |
| | Sonia (perte) | 1 637 | entrée 9 | 1 646 |
| | ado (table) | 2 323 | — | 2 323 |
| | ado (végé) | — | 2 419 | 2 419 |
| | enfant | 1 620 | — | 1 620 |
| Q2 `quatre` | Léo (12 ans) | 2 459 | — | 2 459 |
| | Paul (perte) | 1 924 | — | 1 924 |
| | Claire (végétarienne) | — | 1 900 | 1 900 |
| | Nora (végane) | — | 1 824 | 1 824 |

Marc à 4 775 kcal n'est pas une dérive : 183 cm, 84 kg, `trains_hard`,
`physical_job`, 5 séances et plus, gros appétit, en prise. La fixture est
extrême exprès.
