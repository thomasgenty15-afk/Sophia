# Méthode génération de plan solo

Décision produit du 2026-09-07. Ce document dit comment un plan se calcule pour
**une personne, une journée**. Il remplace le calcul actuel (le modèle écrit les
grammes de chaque boîte, le moteur mesure l'écart) par un calcul où **les
grammes ne se décident qu'à un seul endroit : l'algorithme**.

Le foyer est traité en fin de document, parce qu'il n'ajoute rien au calcul.

---

## Le principe en une phrase

Le modèle compose une **recette standard**. L'algorithme calcule ce que la
personne doit manger à ce moment-là, et **multiplie** la recette pour l'atteindre.
Les courses suivent. Aucun gramme par personne ne sort du modèle.

---

## Les quatre règles qui ne se discutent pas

1. **Pas de calories dans le prompt, pas de corps dans le prompt.** Le modèle ne
   reçoit ni la cible de la personne, ni sa taille, son poids, son âge. Il n'en a
   plus besoin : il ne fait plus de portion.
2. **L'algorithme n'ajoute jamais un aliment.** Ajouter du fromage à quelqu'un
   qui l'exclut, ou du pain à quelqu'un qui n'en veut pas, n'est pas au calcul de
   le décider. Seul le modèle, qui connaît les goûts et les interdits, peut
   modifier une recette. Le module actuel qui ajoute de l'huile ou des oléagineux
   (`box_densify`) sort du calcul.
3. **Un seul appel de réparation par plat, compté.** Si le compteur monte sur les
   runs réels, c'est le prompt qu'on corrige, pas l'algorithme.
4. **Tout ce qui est mangé compte.** Chaque plat de chaque créneau, cuit ou non,
   en boîte ou non, reçoit des grammes par personne et entre dans le total du
   jour. Le trou actuel « pas de boîte, pas compté » disparaît.

---

## Le calcul, étape par étape

### Avant d'appeler le modèle

**1. Besoin d'entretien.** Ce que le corps dépense dans une journée.
Entrées : taille, poids, sexe, âge, activité de la journée, sport, appétit
(petit / moyen / grand = ×0,90 / ×1,00 / ×1,10).
Sortie : un nombre de kcal. C'est une mesure, pas une décision.

**2. Cible du jour.** Entretien plus l'objectif.
Maintien : le nombre reste. Perte : on retire un déficit selon le rythme réglé.
Prise : on ajoute un surplus.
Les deux nombres restent séparés dans le code, parce que l'objectif est
**refusé** dans plusieurs cas où l'entretien reste valable : mineur, grossesse
(ferme le déficit seulement), coach qui ne compte pas, plancher TCA déclaré
(validé le 2026-09-07, voir étape 9). Dans ces cas, la cible du jour vaut
l'entretien tout court. **Personne n'est sans cible.**

**3. Poids des créneaux.** La personne a déclaré ses créneaux (petit-déjeuner,
collation du matin, déjeuner, goûter, dîner, avant le coucher). Chaque créneau a
un poids de base :

| Créneau | Poids de base |
|---|---|
| petit-déjeuner | 0,25 |
| collation matin | 0,10 |
| déjeuner | 0,40 |
| goûter | 0,10 |
| dîner | 0,35 |
| avant le coucher | 0,10 |

Un créneau marqué **« + repas léger »** (voir « Ce que l'onboarding demande »)
voit son poids réduit. Puis les poids des créneaux déclarés sont **ramenés à une
somme de 1**. Six créneaux cochés = six parts qui somment à 1.
Rien de déclaré = les trois repas de la maison.

**4. Cible par créneau.** Cible du jour × poids du créneau.

**5. Retrait des apports fixes prévus.** ⟳ 2026-09-10 — **un seul retrait, et
plus de plancher.**
- le **shaker** déclaré à un créneau sort de la cible de ce créneau, **une fois,
  en entier** ;
- le **pain, le fromage, le yaourt, le fruit, le dessert** pris à côté ne sortent
  plus de rien : le plan dimensionne les aliments qu'il prévoit et ne réserve
  plus d'énergie pour un accompagnement personnel hors plan.

Ce qui reste est **ce que le plat doit porter**. Le plancher « le plat garde au
moins 30 % du repas » (`COMPOSED_DISH_MIN_MEAL_SHARE`) est supprimé : il n'existait
que pour borner la somme de deux retraits. Quand l'apport fixe couvre la part du
créneau, l'énergie à composer vaut `0` et le créneau est **nommé** dans
`fixedCovered` (`0` = pile couvert, `> 0` = conflit) — on ne fabrique pas une
portion minimale.

**6. Brief au modèle.** Goûts, interdits, allergies, créneaux avec leur caractère
(« dîner léger » en mots), nombre de sessions de cuisine, temps, niveau, budget,
variété. **Et la règle du plat complet** :

> Chaque déjeuner et chaque dîner est un plat complet, dans une seule assiette :
> un féculent, une protéine, une matière grasse. Un plat normal apporte **au
> moins 100 kcal pour 100 g** tel qu'il est servi. Une soupe est possible, mais
> elle sort complète : soupe de poireaux avec croûtons, fromage râpé et œuf
> poché, ou avec du pain et du fromage à côté.
>
> Un créneau marqué léger appelle une recette légère. Une soupe de légumes y est
> possible, mais elle reste nourrissante : **au moins 60 kcal pour 100 g** tel
> que servi, par exemple avec une pomme de terre, un filet d'huile ou une
> cuillère de crème. En dessous, la quantité à manger devient énorme.

Il n'y a pas d'entrée : le plat est l'unité.

**D'où viennent les deux planchers.** Un dîner léger vaut environ 0,20 de la
journée, soit 400 kcal pour une cible de 2 000. Le plus gros repas qu'un adulte
mange pèse 600 à 700 g. 400 ÷ 650 ≈ 0,6 kcal par gramme : c'est le plancher du
plat léger. Un dîner normal vaut 0,35 de la journée, soit 700 kcal ; 700 ÷ 650
≈ 1,1, arrondi à 1,0 pour le plat normal. Une soupe de poireaux à l'eau fait
0,3 à 0,4 : sous le plancher, donc elle sort avec ce qui la remonte. Les deux
chiffres sont dits **pour 100 g**, parce que c'est l'unité des étiquettes, et
le modèle la lit sans se tromper.

### Le modèle

**7. Une recette standard par plat.** Ingrédients en grammes pour une portion
normale, méthode, quel jour on cuisine quoi. Pas de portion par personne, pas de
boîte nominative. Les féculents, légumineuses sèches, viandes et poissons sont
écrits **en cru, tels qu'on les achète** : c'est la forme naturelle d'une
recette, et ça rend les kcal indépendantes de la convention de rendement (voir
« Cru et cuit »).

### Après le modèle

**8. Mesure de chaque recette.** Le référentiel donne les kcal de chaque
ingrédient et le rendement cru → cuit. Sortie par recette : **kcal de la portion
standard** et **poids cuit de la portion standard**, donc sa densité en kcal par
gramme.

**9. Multiplication.** Pour chaque plat de la personne :

```
facteur                = cible du créneau ÷ kcal de la portion standard
grammes de la personne = grammes de la recette × facteur
```

Sur **tous** les plats, petit-déjeuner compris, cuit ou pas. Et pour **tout le
monde** : une recette standard n'est la portion de personne. Un homme de 2 m et
75 kg et une femme de 1,55 m et 45 kg ne mangent pas la même assiette, et la
seule façon de le savoir est de calculer leur besoin comme pour tout le monde.

Ce que ça impose à l'étape 2 : **tout le monde a une cible, et elle vaut au
moins l'entretien.** Les portes ne ferment que l'objectif :
- un mineur est dimensionné sur son entretien (formule pédiatrique), sans déficit ;
- une grossesse ferme le déficit, pas l'entretien ;
- un coach qui ne compte pas ferme l'écart, pas l'entretien ;
- un corps absent ne peut rien recevoir, mais l'entonnoir retient déjà nom,
  date, corps et objectif : ce cas ne doit plus exister pour une bouche nourrie.

**Le plancher TCA — VALIDÉ le 2026-09-07.** Jusqu'ici une restriction déclarée
fermait les deux nombres, et la personne recevait la portion du modèle,
c'est-à-dire une portion arbitraire au nom de sa protection. Décision :
l'entretien dimensionne toujours ; ce qui reste fermé est le déficit et
**l'affichage** des calories à cette personne, qui a déjà sa propre porte.
Dimensionner et montrer sont deux choses différentes. C'est un renversement
d'une décision de sécurité antérieure (voir `CALORIE_REVERSAL.md`), acté par le
propriétaire du produit.

**10. Comparaison aux bornes de repas de la personne.** Les grammes calculés
sont comparés à un **poids minimal** et un **poids maximal par repas**, propres
à la personne.
- Dedans : on garde.
- Au-dessus du maximum : la recette n'est pas assez dense. **Appel de
  réparation** au modèle : « ce plat fait 0,6 kcal par gramme, il doit en faire
  au moins 1,2 ; garde son identité et densifie ». Puis retour à l'étape 8 pour
  ce plat. Une seule fois.
- Sous le minimum : la recette est trop dense, l'assiette paraîtrait vide. Même
  appel, dans l'autre sens.

L'appel de réparation ne reçoit **que des faits sur le plat** (sa densité, la
densité visée), jamais la cible de la personne. La règle 1 tient.

Note : les étapes 9 et 10 sont le même nombre écrit deux fois. « Grammes de la
recette × (cible ÷ kcal) » et « cible ÷ densité » sont égaux. Il n'y a pas deux
calculs, il y en a un, suivi d'une comparaison.

**11. Dernier garde-fou.** Si le plat est encore hors bornes après réparation,
on le **borne** au poids maximal, on **écrit** les kcal qui manquent, et un
**compteur** dit combien de fois c'est arrivé. Ce compteur doit rester proche
de zéro. S'il monte, le défaut est à l'étape 6.

**12. Courses et casseroles.** Pour chaque ingrédient, somme des grammes de
toutes les portions de la fenêtre. La casserole vaut la somme des portions qui
la tirent. Les courses suivent la casserole.

---

## La densité requise, et qui a le droit de la faire bouger

*Décidé avec le propriétaire le 2026-09-08, après le tir sur `qa-genty-clone`.*

### Ce que le tir a montré

Un corps de 187 cm, 72 kg, 28 ans, en prise de masse. Cible 3 180 kcal ; le plan
en a servi **2 697**. Les 383 kcal manquantes ne sont perdues nulle part
d'obscur : le déjeuner du modèle faisait 142 kcal/100 g et le dîner 113. Pour
porter leurs cibles il aurait fallu servir **813 g** et **897 g** — au-delà du
plafond d'assiette (700 g). Le moteur a raboté, exactement comme l'étape 11 le
demande, et le compteur l'a dit.

La réparation de l'étape 10 est partie deux fois, a été acceptée deux fois, et
les deux plats sont **restés hors bornes**. Cause : le message de relance est le
prompt d'origine plus la consigne — **le modèle n'y relit nulle part le plan
qu'il vient d'écrire**. On lui nommait ses ingrédients (« poulet, riz, tomate »)
et on lui demandait d'en changer les proportions ; il re-proportionnait de
mémoire, dans le bon sens, et s'arrêtait à mi-chemin.

Deux corrections en découlent, plus une règle qui n'existait pas.

### 6 bis. La densité requise est dite AVANT la composition

Pour chaque bouche et chaque moment :

```
densité requise = cible du créneau ÷ plafond d'assiette × 1,10
```

C'est l'arithmétique de l'étape 10, dite avant au lieu d'après. Elle ne coûte pas
un appel. On ne garde que les moments qui dépassent le plancher de leur classe
(100 kcal/100 g, ou 60 pour un moment marqué léger) : répéter 69 en face d'un
goûter ajoute un nombre sans ajouter une contrainte, et un brief qui répète
cesse d'être lu.

⛔ **Et ce qu'on demande est plafonné à 250 kcal/100 g** — mesuré, pas supposé.
Le `max` sur les jours a exigé **389** au dîner : la veille de cuisine ne porte
qu'un moment pour cette bouche, qui pèse alors la journée entière. Aucun plat ne
tient 389 (un gratin fait 180, des lasagnes 150), et le modèle a **ignoré la
consigne** (126,7 rendus). Une consigne intenable est pire qu'une consigne
absente : elle apprend au modèle que ces nombres-là sont décoratifs, sur toute la
ligne. Le besoin, lui, n'est pas plafonné — il continue de sortir en `unmet`.

Elle se rend **sur la ligne de la personne, comme un fait sur le plat** :

```
- genty: … — eats at breakfast, lunch, snack_pm, dinner only
          — dishes served here: at least 126 kcal per 100 g at breakfast, 201 at
            lunch, 118 at snack_pm, 176 at dinner
```

⛔ **La formule est la garde.** « dishes served here » décrit une casserole ;
« genty needs 201 kcal » décrirait quelqu'un — et v33 a retiré le corps de tout
le monde exprès (règle 1). Un test lit le prompt entier et refuse tout `kcal`
qui ne soit pas suivi de `per 100 g`.

**Sous plancher TCA, rien n'est écrit en face du nom.** Mais l'exigence n'est pas
perdue : elle est fondue dans le plancher **commun** du bloc, où elle se confond
avec celle de tout le monde. Protéger quelqu'un d'un chiffre ne doit pas le
sous-nourrir. Les densités **nommées**, elles, ne font pas monter ce plancher :
la ligne est l'instrument précis, le plancher est l'instrument grossier, réservé
à qui ne peut pas être nommé.

### 10 bis. La réparation reçoit la recette, avec ses quantités

L'instruction porte désormais, pour chaque plat à réparer : ses ingrédients
frais **avec les quantités que le modèle a écrites**, puis chaque casserole qu'il
tire, avec les siennes. Le mot « proportions » disparaît — il se lit « sers-en
moins », ce qui laisse la personne avec la même assiette rabotée, par l'autre
bout. On demande une **réécriture de recette à masse d'assiette constante**.

### ⟳ 2026-09-08 — Le modèle voit tout, on ne lit que ce qu'on a autorisé

Décision du propriétaire, le soir même : « si c'est nous qui donnons les
instructions, pourquoi il change les plats si on sait d'avance ce qu'il peut
changer ? Ça devrait être envoyé comme contexte, pas comme quelque chose sur quoi
influer. »

C'est plus juste que ce qui était construit. La relance de réparation disait
« rends le plan JSON complet », le modèle rendait tout, et la lane **fusionnait
la case entière** — puis vérifiait après coup qu'il n'avait pas touché aux
casseroles gelées. Mesuré : quatre tirs sur quatre, il les réécrivait. Ce n'était
pas de la désobéissance ; on lui avait laissé la main sur ce qui ne devait pas
être à sa main.

Désormais (`spliceReworkableUnits`) : le modèle **voit** tout le plat — il en a
besoin pour écrire un frais qui atteigne la densité *en tenant compte* du riz
déjà dedans — mais on ne **lit** dans sa réponse que le frais et les casseroles
marquées réécrivables, par identifiant. Une casserole réécrite garde son `id` et
son `servingsMade` ; casseroles gelées, autres plats, sessions : la base, octet
pour octet. « Rien d'autre ne change » est garanti par construction, pas
demandé.

Ce que ça a rendu sans objet, et qui a été retiré de la machinerie (compteurs
gardés à zéro) : le défourchage (`pot_forked` / `pot_unforked`), le refus
« casserole gelée réécrite », la garde « plat dédié perdu », le refus
« casserole introuvable ». Ce qui reste, parce que ça porte sur le fond :
l'identité du plat réparé (sa nourriture survit) et la remesure (aveuglement,
dégradation). L'entrée de dernier recours suit le même principe depuis le tir
CATCH3 (`appendDedicatedDishes`).

### La règle des mangeurs

Une **unité** est le frais d'un plat **ou** une casserole. Ses **mangeurs** sont
l'union, sur les plats qui la tirent, de : le porteur si le plat est dédié, sinon
toute la table.

> Une unité est **réécrivable** dans la direction D si et seulement si **chacun**
> de ses mangeurs a besoin de D. Sinon elle est **gelée**, et on la nomme au
> modèle comme intouchable.

⛔ « Pas besoin » n'est pas « besoin du contraire ». Quelqu'un dans ses bornes n'a
besoin de rien : il compte comme dissident. Sans cela, la règle se réduirait à
« personne ne veut l'inverse », qui est presque toujours vrai — et on répare
quelqu'un en enrichissant l'assiette de son voisin, qui ne le saura jamais.

### Les cinq cas

| Situation | Ce qui se passe |
|---|---|
| **Solo** | Rien ne peut être gelé : une bouche ne contredit personne. Tout est réécrivable, et le plat dédié ne se déclenche jamais. |
| **Plat commun, tous dans le même sens** | La recette est réécrite pour tout le monde. Les facteurs de chacun suivent. |
| **Plat commun, sens opposés** | La casserole est gelée dans les **deux** sens. Aucune réécriture ne les sert tous les deux. |
| **Base commune + variable spécialisée** | On travaille la partie que la personne est seule à manger. Si son frais est partagé et que son voisin est dans ses bornes, ce frais est gelé aussi. |
| **Tout est gelé** | Le modèle ajoute **un plat à son nom** (`for_member_id`) à ce moment-là : dense (noix, fromage, huile, pain) si elle dépasse, volumineux (légumes, bouillon, salade) si elle est sous son plancher. |

⛔ **La symétrie n'est pas décorative.** « Trop maigre » n'est pas un cas
d'enfant : un plat riche servi à quelqu'un en perte de poids passe sous son
plancher d'assiette — sa part tient dans trois cuillères — et il lui faut du
volume, exactement comme l'autre avait besoin de densité.

### ⟳ 2026-09-08 — « Alléger » demande une bande, pas un plafond

Mesuré au tir SPLICE3 : un adulte en perte de gras **sous** son plancher
d'assiette au petit-déjeuner a reçu, en plat à son nom, « reste sous 145
kcal/100 g » — et un bouillon à 57,8 est revenu. Son assiette est passée de
trop petite à trop grosse. « Reste sous N » sans plancher laisse le modèle
diluer sans limite.

Toute demande « alléger » porte désormais un **plancher**
(`floorPer100G` = la densité sous laquelle l'assiette dépasse son plafond de
masse, `max_i(target_i ÷ maxMass_i)`) et la consigne dit une **bande** : « entre
F et A kcal/100 g ; en dessous de F, l'assiette devient énorme ». La direction
« densifier » n'en a pas besoin : son plafond de masse est déjà ce qui borne.

Deux compteurs de la même famille : `skipped_stuck` (un plat bloqué à la
demande n'est plus envoyé au modèle — il va directement à l'entrée de dernier
recours) et `missed_aim` (un plat dédié « accepté » n'a pas forcément atteint
sa cible ; accepté veut dire « n'a pas dégradé le plan »).

### La fourche de la casserole partagée

Trouvé en relisant les tirs, jamais compté jusque-là. Une réparation acceptée
**duplique** la casserole partagée : dans `plan-L6`, pour **une seule bouche**,
le plan portait `prep_rice` ET `prep_rice__r`, citées par deux plats différents
et **cuites toutes les deux** dans la même session. Deux poulets rôtis, deux
casseroles de riz, pour une personne.

La fusion a raison de renommer — un plat non repris cite encore l'ancienne
recette, l'écraser lui servirait un plat qu'on n'a pas relu. Le défaut est dans
ce que personne ne faisait **après** : une casserole **réécrivable** a par
définition tous ses mangeurs dans le même sens, donc sa version réécrite vaut
pour eux tous. Elle retrouve son nom, et une seule cuit. Une casserole **gelée**
qui revient modifiée reste fourchée **et se compte** (`pot_forked`) : à ce
moment-là, la consigne n'a pas été tenue, et c'est un fait à voir.

---

## Cru et cuit

Les calories ne changent pas à la cuisson : l'eau qui entre dans le riz ou qui
sort du poulet n'en porte aucune. Ce qui change, c'est le **poids**. 30 g de riz
cru et 78 g de riz cuit sont le même riz et les mêmes 105 kcal.

Le moteur tient donc **une seule unité de compte, le gramme cru**, et convertit
tout vers elle :

1. Le modèle écrit chaque ingrédient avec son nombre, son unité, et son **état**
   (`raw` / `cooked`). L'état est obligatoire pour tout ce qui prend ou perd de
   l'eau : riz, pâtes, semoule, légumineuses sèches, viande, poisson, légumes
   cuits. Sans état sur du riz, la ligne est **refusée**, jamais devinée : deviner
   « cru » compterait 260 g de riz cru là où la personne en mange 100 g cuits.
2. Une quantité déclarée cuite est ramenée au cru par un facteur de rendement
   par classe : céréales ×2,6, légumineuses sèches ×2,4, viande ×0,7, poisson
   ×0,8, légumes ×0,9, neutre ×1,0 (huile, laitages, fruits, conserves).
3. Le référentiel donne les kcal **pour 100 g crus**. Énergie de la recette =
   somme des kcal crus × grammes crus. C'est la même énergie que « kcal cuits ×
   grammes cuits », sans jamais compter l'eau.
4. Le **poids cuit** de la recette = somme des grammes crus × rendement. C'est
   lui qui sert à la densité (étape 8) et aux bornes de l'assiette (étape 10),
   parce que c'est ce que la personne voit dans son assiette.
5. Les **courses** sont en grammes crus, puisque c'est ce qu'on achète.

Dans ce calcul, le facteur de l'étape 9 s'applique aux grammes crus de la
recette ; le poids servi en découle par le rendement. Aucune quantité n'est
gonflée par la cuisson.

**Ce que le référentiel portait vraiment, et son état vivant** *(base relue le
2026-09-07 : 925 lignes · `fish_shrinks` 13 · `grain_absorbs` 13 ·
`legume_absorbs` 2 · `meat_shrinks` 289 · `neutral` 530 · `veg_shrinks` 78)*.
Les deux défauts que cette section annonçait le 2026-08-21 ont été **réparés ou
renversés** le 2026-08-22 par
`20260822133000_lc_les_lignes_cuites_cessent_detre_facturees_crues.sql` :

- ~~130 lignes sur 923 portent des valeurs cuites lues comme du cru.~~
  **La prémisse était renversée.** Une ligne à libellé cuit portant `neutral`
  est **juste** : `energy_kcal` y est la densité de l'assiette et `nutrientsOf`
  multiplie les grammes par elle — aucun rendement ne doit s'y appliquer. Lui
  poser `meat_shrinks` porterait 200 g de bœuf braisé de 480 à **686 kcal**,
  c'est-à-dire fabriquerait l'erreur qu'on croyait retirer. Le défaut réel était
  l'**image miroir** — une ligne **déjà cuite** portant une classe non neutre,
  où le rendement s'applique deux fois — et **57 lignes** ont été reclassées.
  État vivant : **141 lignes à libellé cuit, 141 en `neutral`, 0 non neutre**.
- ~~Les pains sont classés comme des céréales à ×2,6.~~ **Faux depuis le
  2026-08-22** : **46 des 57** lignes reclassées étaient précisément des pains,
  biscottes, croûtons et crackers. État vivant : **52 pains, 0 non neutre**.

**Les deux résidus réels, nommés et comptés, non réparés** — ils sont hors du
chantier `yield_factor`, et il faut le dire ici pour que personne n'attende de
la colonne qu'elle les ferme :

- **`L-C-a` — un `state:"raw"` sur une ligne dont la valeur est cuite.**
  `gramsRawOf` ne divise par le rendement que sur `state === "cooked"` ; sur
  `"raw"` il rend les grammes tels quels, facturés au tarif du cuit. **18 lignes
  du corpus** (`tomato paste` ×7, `toast` ×6, `noodles` ×2). ⛔ **Aucune valeur
  de `yield_factor` ni de `yield_class` ne change ce chiffre** : c'est la
  *résolution* qui est en cause, pas le rendement. La seule voie juste serait de
  re-baser `energy_kcal` en « pour 100 g crus », et elle est bloquée par `O9` :
  **185 des 206 lignes concernées n'ont pas de `ciqual_code`**, donc un facteur
  générique y serait un nombre inventé sur la grandeur que tout le produit lit.
- **`L-C-b` — la même règle jamais appliquée à deux classes.** **119 des 290
  `meat_shrinks`** ne disent pas « raw » au libellé (salami, rillettes, pâtés,
  mortadelle, coppa, jambons secs : un saucisson ne rétrécit pas dans
  l'assiette) et **37 des 84 `veg_shrinks`** non plus (laitue, concombre,
  tomate, avocat, chips, tomates séchées). Le coût principal n'est pas l'erreur
  de masse, c'est l'**abstention** : `stateMattersFor` refuse un `state` absent
  sur toute classe à facteur ≠ 1,0, et le corpus n'écrit pas de `state` sur
  3 903 lignes sur 10 453 — une salade de tomates sans état **éteint sa journée
  entière**. ⚠️ Et **4 lignes sont fausses dans l'autre sens** :
  `potato_flakes`, `potato_flakes_milk_cream`, `shiitake_mushroom`, `tapioca`
  sont en `veg_shrinks` (0,9) alors qu'elles **réhydratent** (> 1). ⛔ Elles ne
  se réparent **pas** par un `yield_factor` : le CHECK de la colonne exige
  `*_shrinks ⇒ facteur < 1`. Elles demandent d'abord un changement de **classe**,
  donc le lot `L-C-b`, pas celui-ci.

**Le rendement par aliment, décidé le 2026-09-07 : dès maintenant.**
Aujourd'hui le facteur est par classe, pas par aliment : riz, pâtes, semoule,
quinoa partagent 2,6 quand des pâtes font plutôt 2,2 ; tous les légumes font
0,9 quand des épinards ou des champignons perdent 30 à 40 % ; toutes les
viandes font 0,7 quand un blanc de poulet et un bœuf à braiser ne rendent pas
pareil. Cumulé sur tous les aliments d'une recette, l'écart sur le **poids
cuit** peut être important, et c'est ce poids que la personne pèse sur son
couvercle et que les bornes de l'assiette lisent. Décision : une colonne de
rendement **par aliment** dans le référentiel, obligatoire pour la nouvelle
méthode.

- **Où** : `food_composition_refs`, colonne `yield_factor` (cru → cuit, en
  grammes, nombre réel). `NULL` = repli sur le facteur de la classe, qui reste
  la table de secours et n'est pas supprimée.
- **Une seule lecture** : `gramsRawOf` et `weighedReadyGrams` lisent le facteur
  par aliment quand il existe, la classe sinon. Deux résolutions divergeraient.
- **Sources** : les tables de rendement publiées (USDA « cooking yields »,
  tables de rendement AFSSA/ANSES). Pas de valeur devinée ; une ligne sans
  source reste `NULL`.
- **Ordre de remplissage** : d'abord tout ce qui absorbe ou perd beaucoup
  d'eau, féculents un par un (riz blanc, riz complet, pâtes, couscous, quinoa,
  boulgour, polenta), légumineuses sèches une par une (lentilles, pois chiches,
  haricots), légumes à forte perte (épinards, champignons, courgettes, poireaux,
  chou), viandes par morceau (blanc de poulet, cuisse, bœuf haché, bœuf à
  braiser, porc), poissons. Le reste peut attendre.
- **Compteur** : à chaque run, le nombre de lignes résolues par aliment et par
  classe. Une classe qui sert encore sur un féculent est une ligne à remplir.

**Ce que la colonne corrige, et ce qu'elle ne corrige pas.** Elle corrige le
**poids cuit** — le couvercle que la personne pèse, la densité de l'étape 8, les
bornes de l'assiette de l'étape 10. Elle ne touche **pas** les calories tant que
les recettes sont écrites en cru (étape 7), à **une exception qu'il faut
nommer** : `nutrientsOf` calcule `cookedWeight = gramsRaw × rendement`
uniquement pour imputer 12 % d'huile de friture (`FRY_OIL_UPTAKE_RATIO`,
`food_composition.ts:1084`). Sur un plat **frit**, un rendement faux déplace
donc l'énergie sans passer par `gramsRawOf` — c'est le troisième chemin entre la
classe et l'énergie, et il est le seul. Les deux résidus `L-C-a` et `L-C-b`, eux,
faussent les calories par la voie ordinaire, et **ni la colonne ni la classe ne
les ferment** : ce sont des lots de résolution et de référentiel à part.

---

## Ce que l'onboarding demande en plus

Un seul ajout : **« + repas léger »**, un choix par créneau, posé au même endroit
que le pain, le fromage et le dessert dans les préférences alimentaires, pour le
petit-déjeuner, le déjeuner et le dîner.

Il travaille à trois endroits en même temps :
- **la répartition** (étape 3) : le créneau pèse moins, ses autres créneaux
  reprennent la différence, la somme reste 1 ;
- **le brief** (étape 6) : le modèle lit « dîner léger » en mots et compose
  léger à ce moment-là ;
- **la vérification** (étape 10) : la cible du créneau étant plus basse, une
  recette légère tient dans le poids maximal de repas sans rien faire de plus.

Il est **distinct de l'appétit**. L'appétit fait varier le total de la journée.
« Repas léger » fait varier la répartition dans la journée. Les deux se cumulent.

Règle de lecture : **pas demandé = répartition de base**, jamais une valeur
inventée. Un champ à `null` et un champ à « normal » ne se confondent pas.

---

## Ce qui n'existe plus

- Les faits de corps dans le prompt (`[height 168 cm; gender female; weight 58 kg]`).
- Les grammes par personne écrits par le modèle (`boxes[]`, `member_portions`).
- L'ancrage post-hoc (`anchorFactorFor`, `cible ÷ livré` sur des boîtes devinées),
  et le commit du 2026-09-07 qui l'avait passé en mesure pure : il devient un
  compteur de transition, plus une décision.
- La densification par le code (`box_densify`).
- La règle « un plat sans boîte ne compte pas » (`dishSlices` rend `[]` sans boîte).
- Tout glissement automatique de cible entre créneaux : « repas léger » explicite
  le remplace.

---

## Ce qui reste à calibrer, avec des runs réels

| Paramètre | Ce qu'on sait | Ce qu'il faut décider |
|---|---|---|
| Poids d'un créneau « léger » | rien encore | une réduction fixe (ex. dîner 0,35 → 0,20) ou un ratio |
| Poids min / max par repas | 8 g/kg mesuré faux sur une enfant de 36 kg (288 g) ; un plafond dérivé des kcal est circulaire | une convention **par tranche d'âge**, modulée par l'appétit ; une capacité d'estomac, pas un besoin |
| Planchers de densité du prompt | 100 kcal / 100 g (normal), 60 kcal / 100 g (léger), dérivés d'un repas de 650 g ; plats réels mesurés entre 1,13 et 1,56 kcal/g | à confirmer sur les premiers runs : si la réparation mord souvent, relever |
| Bande de densité visée par la réparation | même dérivation que les planchers | la bande à donner au modèle (ex. 1,0 à 1,8 pour un plat normal) |
| Extras non renseignés | aujourd'hui on retire 0 | garder 0, ou une convention nommée |
| Rendement par aliment | décidé ; colonne `yield_factor` portée par `20260907160000_le_rendement_par_aliment_entre_au_referentiel.sql` (voir « Cru et cuit ») | l'ordre de remplissage est écrit ; chaque valeur doit citer sa table source, et une ligne sans source reste `NULL` |

---

## Le foyer — ⟳ ÉCRIT APRÈS LES LOTS 9 À 13 (2026-09-08)

Rien ne change dans le **calcul**. Chaque personne a ses étapes 1 à 5 à elle, et
à l'étape 9 chacune a **son facteur sur la même recette**. Ce qui s'ajoute, ce
sont trois décisions que le moteur prend **avant** le prompt, et que le modèle
lit au lieu de les prendre.

### 6. Les cases, décidées par le moteur

Une case est un jour × un moment. Ses mangeurs sont les bouches présentes ce
jour-là qui ont déclaré ce moment. Une case sans mangeur n'a pas de plat, et le
calendrier le **dit** : « personne ne mange ici, n'écris pas de plat ». L'absence
de ligne n'est pas une consigne, et un modèle comble les silences.

Une case est **légère seulement si tous ses mangeurs** ont coché « repas léger »
à ce moment. Sinon la recette est normale et les personnes « léger » en
reçoivent moins par leur facteur : personne ne reçoit une recette allégée qu'il
n'a pas demandée.

### 7. Le plat à part : la minorité stricte a le sien

La casserole commune suit le régime **majoritaire** des mangeurs de la case
(égalité ⇒ le plus strict). Toute personne dont le régime est **plus strict**
reçoit un plat dédié à chaque case où elle mange.

⚠️ **C'est un renversement**, et il est mesuré. La règle d'avant faisait suivre
la table au plus strict : un foyer de quatre dont une personne est végane
mangeait végane toute la semaine. Sur `qa-9pts-quatre`, l'écart entre les deux
règles vaut exactement une bouche.

⛔ Une **allergie** ne dédie jamais : l'union de sécurité retire l'allergène de
la casserole, fail-closed, avant tout ceci. Et jamais pour une quantité : « il
lui en faut moins » est un facteur, pas un autre plat.

⛔ **Un plat dédié n'est pas une préférence d'effort.** Trois portes du moteur
lisaient la forme de cuisine (`one_dish` quand le foyer déclare peu de temps)
pour décider si un second plat a le droit d'exister, et les trois se refermaient
sur des plats que la consigne avait promis. Le budget du chemin foyer porte donc
`one_session` — le mot exact de ce que la consigne dit : « même session de
cuisine, mêmes courses, assiette différente ».

### 8. Le brief : cartes, calendrier, méthode, schéma

- **A — une carte par personne** : régime, allergies, ce qu'elle garde hors de
  son assiette, ses moments avec leur caractère, ses habitudes, ce qu'elle mange
  déjà à côté (« ne le compose pas »), ce qu'elle a dit. Aucun corps, aucun âge
  en chiffres.
- **B — le calendrier** : chaque case, ses mangeurs nommés, les plats à part
  commandés, les cases vides. En tête : « le nombre de mangeurs ne change jamais
  une recette : chaque plat s'écrit pour UNE personne ».
- **C — la méthode en six temps** : contraintes dures d'abord, puis les sessions
  de cuisine, puis composer chaque case (plat partagé puis plats dédiés), puis
  écrire les quantités comme une recette, puis la variété, puis se relire.
- **D — le schéma** : ni boîte, ni portion nommée.

### 11 à 14. Ce que le moteur fait de la réponse

Chaque mangeur reçoit **son facteur** sur la recette. Le **frais** d'un plat est
multiplié par la **somme** des facteurs de ses mangeurs (il doit contenir toutes
les parts) ; la **casserole** vaut la somme des parts de tous les plats qui la
tirent, divisée par le nombre de tirages.

Les **couvercles** suivent l'objectif : une personne avec un objectif de poids a
une boîte à son nom ; les autres partagent un bac dont le total est la **somme**
de leurs parts. ⛔ Un mangeur seul au bac reçoit une boîte à son nom, jamais un
bac d'un nom : un bac d'un mentirait sur ses propres grammes, et l'écran lit
« plusieurs noms » pour dire « partagé ».

La **réparation** d'un plat que plusieurs mangent densifie vers le mangeur **le
plus exigeant** — un seul dépassement suffit, parce que cette personne-là ne peut
pas manger sa part et que les autres n'y perdent rien. Alléger, à l'inverse,
coûte à tout le monde : il faut que **tous** soient sous leur plancher, et
**jamais** si un enfant est à table.

---

## Écart avec le code — ⟳ MIS À JOUR APRÈS LA BASCULE (2026-09-08)

⛔ **La méthode est celle que la population reçoit.** `sizingPathFor` ouvre
`portion_v1` jusqu'à `PORTION_SIZING_MAX_MOUTHS = 12`, c'est-à-dire le plafond
de la lane. Restent sur le chemin d'avant : une **fusion** ou une **défusion**
(elle reprend une personne et son échelle gouverne), un foyer au-dessus du
plafond, et un référentiel qui ne s'est pas chargé — chaque cas avec son motif
nommé dans le journal.

### Les chiffres de la bascule, sur deux foyers réels

| Critère | Seuil | `quatre` | `cinq` |
|---|---|---|---|
| journée de chaque bouche à ±5 % de sa cible | ≥ 90 % | 4/4 | 5/5 |
| assiettes dans les bornes de masse | ≥ 80 % | 12/12 | 12/15 |
| bac à un seul nom | 0 | 0 | 0 |
| mangeur non dimensionné | 0 | 0 | 0 |

⚠️ **C'est la réparation qui a fait la différence, pas la chance du jour.** Le
compteur `repair_effect` porte l'avant et l'après du MÊME plan : sur `quatre`,
onze assiettes dans les bornes avant, douze après ; sur `cinq`, **six avant,
douze après** sur quinze. Sans ce compteur, « douze sur douze » n'aurait pas été
distinguable d'un bon tirage.

> ### ⛔ CORRECTION DU MÊME JOUR — CETTE PHRASE ÉTAIT TROP CONFIANTE
>
> Le tableau ci-dessus est un tir, pas une propriété. Neuf tirs sur `quatre`
> depuis que la table dimensionne, même fixture, même fenêtre :
>
> | | L12 | L13 | L13W | **L14** | BASCULE | IDENTITE | **AVEUGLE2** | INVARIANT | DEDIE |
> |---|---|---|---|---|---|---|---|---|---|
> | bornes | 66 % | 75 % | 58 % | **100 %** | 50 % | 33 % | **100 %** | 62 % | 66 % |
> | journée | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 |
>
> ⛔ **Le seuil de 80 % est tenu par DEUX tirs sur neuf**, et la bascule a été
> prise sur ces deux-là. La médiane est à **66 %**. Écrire « la réparation a fait
> la différence, pas la chance du jour » sur la foi d'un tir à 100 % était
> exactement l'erreur que `repair_effect` devait empêcher.
>
> ⚠️ **Ce que ça ne renverse pas, et c'est la colonne qui compte** : la journée
> de chaque bouche est à ±5 % de sa cible dans les **neuf** tirs, sans exception.
> Le calcul du moteur — combien chaque personne doit manger — est juste et
> stable. Ce qui varie, c'est la capacité du **modèle** à écrire une recette
> assez dense pour que cette quantité tienne dans une assiette humaine.
>
> ⚠️ **Et la bascule reste le bon geste**, pour une raison absente du tableau :
> le chemin d'avant ne dimensionnait **rien** à deux bouches ou plus. Le comparer
> sur « assiettes dans les bornes » n'a pas de sens — il n'avait pas de bornes.
> Redescendre la constante ne ramènerait pas 100 %, elle ramènerait les grammes
> du modèle, mesurés systématiquement trop bas (7 boîtes sur 7 au lot 10).
>
> **Le chantier suivant est donc la DENSITÉ, et il se joue dans le prompt** :
> les planchers par créneau existent pour le solo (§ « 6 bis ») et n'ont jamais
> été portés sur les cartes v34.

⛔ **Le retour arrière est une ligne.** Remettre `PORTION_SIZING_MAX_MOUTHS` à
`1` referme tout — prompt v34, couvercles autorés, réparation par mangeur — et
rend à toute la population le chemin d'avant. Le chemin legacy n'a pas été
retiré : il est **précédé**, jamais remplacé.

| Étape | Avant les lots | Aujourd'hui |
|---|---|---|
| 1, 2 | fait | fait, + `dayTargetFor` : **le plancher TCA dimensionne à l'entretien** (lot 6) |
| 3 | « repas léger » n'existe pas | **fait** — `LIGHT_SLOT_WEIGHT`, collecté à l'écran (lot 7), renormalisé par `slotPlanTargets` |
| 4 | fait | fait |
| 5 | **le shaker n'est jamais retranché** | **fait** — `slot_fixed_kcal.ts`, par créneau et par jour mangé (lot 2) |
| 6 | le brief porte les faits de corps | **v33** : aucun corps, aucune boîte, règle du plat complet, deux planchers de densité (lot 3) |
| 7 | le modèle écrit les boîtes | **le modèle écrit UNE RECETTE STANDARD** ; `member_portions` ne lui est plus demandé (lot 8) |
| 8 | fait | fait, + rendement **par aliment** quand il existe (lot 1) |
| 9 | **n'existe pas** | **fait et APPLIQUÉ** — `applySizing` autore les boîtes, multiplie frais et casseroles (lot 4) |
| 10 | plafond dérivé des kcal | **bornes par tranche d'âge**, modulées par l'appétit ; réparation en un appel (lots 2 et 5) |
| 11 | `unmet`, `would_resize` | idem, + `verification` : le legacy relit nos boîtes en mesure pure (lot 4) |
| 12 | les courses suivent le modèle | **les courses suivent le plan multiplié** (lot 4) |

### ⛔ Ce que la bascule a révélé le 2026-09-08 — trois défauts de la réparation

Aucun n'était visible avant : le premier demande **deux plats dans une case**,
les deux autres demandent qu'une **réparation soit acceptée**, ce que le premier
empêchait. La bascule n'a pas créé ces défauts ; elle est le premier instrument
qui pouvait les voir.

1. **La case ne suffit pas à désigner un plat.** La garde d'identité de la
   réparation cherchait « le plat revenu dans cette case » par la case seule. À
   la table, une case porte le plat commun **et** le plat dédié, et leurs titres
   se ressemblent. Mesuré : 4 plats refusés `title_changed`, 0 accepté, 6
   assiettes sur 12 hors bornes. Les tirs précédents passaient **par chance**,
   selon l'ordre où le modèle rendait les deux plats. `for_member_id` fait donc
   partie de l'**identité** d'un plat, pas seulement de son attribution.

2. **Une réparation peut aveugler le moteur, tous compteurs au vert.** Une fois
   ① réparé : `over_max 3 → 0`, `still_out 0`, aucun refus, 2 acceptées sur 2
   demandées. Et le plan était pire — les trois assiettes qui dépassaient
   étaient devenues **immesurables**, donc servies au **facteur 1**, c'est-à-dire
   à la recette du modèle telle quelle : 1 121 g au déjeuner, 1 056 g au dîner,
   pour quatre personnes.
   ⚠️ **« Moins de dépassements » n'est pas le critère.** Le critère est : le
   moteur peut-il encore **peser** ce plat ? Une réparation qui fait monter
   `unmeasurable` est refusée en bloc, le plan d'avant revient (plats,
   casseroles, créneaux vides **et** texte source) et il est **remesuré**.

3. **Une casserole citée mais absente était sautée en silence.** C'était la cause
   de ②. Le plat était alors mesuré sur ce qui restait — son frais seul — et
   rendait une énergie **plausible** pour une assiette dont on ignorait le
   contenu principal. Deux corrections : le trou est nommé
   (`MISSING_PREPARATION_GAP`, et `UNNAMED_ENERGY_GAP` pour l'énergie absente
   sans motif — `unmeasurable_by` valait `{}` sur huit assiettes), et un
   **invariant d'intégrité** refuse la fusion d'un plan dont un plat cite une
   casserole introuvable. Il vit dans la machinerie partagée, donc il protège
   aussi le chemin d'une bouche, qui n'a aucune seconde mesure pour se rattraper.

Après ces trois corrections, `quatre` sort à **12 assiettes sur 12 dans les
bornes** et **4 bouches-jours sur 4** à ±5 % de leur cible.

### Ce qui reste ouvert, nommé

- **La réparation n'atterrit pas toujours.** Un seul appel, pas de boucle : le
  plat reste borné et `unmet` le dit. Mesuré : 1 accepté sur 4 demandés.
  ⟳ **2026-09-08, MESURÉ** — la cause était que la relance ne rendait pas au
  modèle sa propre recette. Corrigé et tiré quatre fois : `recipe_quantified ==
  recipe_terms` (33/33 puis 16/16), et la casserole partagée était **dupliquée à
  presque chaque réparation acceptée** (`pot_unforked` 2, 3, 0, 3) sans que rien
  ne le compte. Σ servi : 87,6 % → **100,0 %** et **99,9 %** sur les deux tirs
  avec plafond de densité. Détail : `scratchpad/2026-09-07-SOLO-BANC/JOURNAL.md`.
- **Le déjeuner déborde encore** (`over_max`) sur la fixture solo, ~200 kcal
  non servies. C'est le cas que la calibration des planchers de densité vise.
  ⟳ **2026-09-08, FERMÉ** — la densité requise est dite au modèle AVANT la
  composition. Tir 3 : `over_max: 0`, **aucune réparation demandée**, 3 080 kcal
  servies sur 3 080.
- **Le plat dédié de rattrapage n'est pas câblé.** Sa décision et son
  instruction sont écrites et testées (`dedicatedRepairFor`,
  `dedicatedDishInstruction`), mais elles ne se déclenchent jamais à une bouche :
  rien n'y est jamais gelé. Le câblage appartient à la lane du foyer — il demande
  que la bouche soit dans `dishBearerIds` et que la fusion ne perde pas le plat
  dédié de la case.
  ⟳ **2026-09-08, CÂBLÉ** (décision du propriétaire : « il faut permettre
  d'ajouter une entrée, carotte, huile d'olive, last resort »). Mesuré au tir
  FAST2 : le dîner commun tirait trois casseroles partagées avec deux adultes
  dans leurs bornes et n'avait aucun frais — on a demandé au modèle de le
  densifier « par son frais et ses casseroles réécrivables », il n'y avait ni
  l'un ni l'autre, et il a cassé le plat. C'est le cas 5 à la lettre.
  L'appelant vit dans la branche de la table, **après** la réparation de densité
  et **avant** de poser les grammes ; il ne sert que les **bloqués du plan
  final**, à **leur** densité (règle solo sur leur seule ligne) ; la liste
  fermée des porteurs est ouverte d'exactement les nommés pour cette relecture ;
  mêmes gardes que la réparation, instantané à six champs, budget de deux par
  plan (`DEDICATED_REPAIR_MAX_PER_PLAN` — **quatre depuis le 2026-09-09**, un
  seul appel modèle quel que soit le nombre, les « trop gros » d'abord), journal
  `dedicated_repair` toujours écrit. **Première acceptation réelle au tir CATCH5** : l'ado bloqué au
  déjeuner reçoit « Pain complet, beurre de cacahuète » à 224 kcal/100 g, dans
  ses bornes, journée à ±5 %. ⚠️ On n'importe que les plats AJOUTÉS
  (`appendDedicatedDishes`), jamais la case entière : au tir CATCH3 le modèle
  avait rendu la case sans le plat de la végane — « nothing else changes » est
  garanti par construction, pas demandé.
  ⟳ **2026-09-09, LE COMPLÉMENT** (décision du propriétaire : « dans le cas où
  tout est gelé, on diminue la portion et on ajoute de la calorie dans
  l'entrée »). Ce qui était codé jusque-là n'était pas ça, et ça se mesurait :
  (1) la table ne rabotait **jamais** (`served_over_max` compté, rien de fait) ;
  (2) le plat ajouté **remplaçait** la personne à la table (`mouthsFedByDish`
  la retirait du plat partagé de la case) ; (3) il était donc dimensionné à sa
  cible **entière** — « une petite entrée riche » de 700 kcal, ou un bouillon
  accepté parce qu'il ne dégradait rien. Maintenant : le plat ajouté porte
  `complements_shared: true` (un seul écrivain, `appendDedicatedDishes`) ; son
  porteur **reste** mangeur du plat partagé ; `splitPlateWithComplement`
  résout deux équations (masse totale = borne, énergie totale = cible) et
  réécrit les deux lignes — part partagée **à la borne**, complément **à la
  différence** — avant que casseroles, couvercles et journée ne les lisent.
  La densité demandée est celle d'un complément (`complementAskFor`, part
  d'assiette `COMPLEMENT_PLATE_SHARE = 0,2`), pas celle d'une assiette entière.
  Un complément qui ne résout pas (mauvais côté, impesable, personne déjà dans
  ses bornes) est **retiré** et compté (`rejected.unsolvable`), jamais servi à
  la cible entière. `clamped` compte enfin quelque chose à la table : les seules
  parts complétées. Le front garde le plat de la table dans la case de la
  personne et rend l'entrée en « + ».
- **La densité n'est rendue que par le prompt v33.** `cardFor`
  (`household_prompt_v34.ts`) ne la porte pas encore : le jour où N = 1 rejoindra
  v34 (lot 15 du plan foyer), il faudra la porter, sinon le solo régresse.
- **Sur la lane individuelle, la BOÎTE ne porte pas de chiffre.** Le plat et le
  jour, oui ; la boîte, non — et la cause est structurelle : ses `member_ids`
  sont **vides**, parce qu'il n'y a personne à nommer quand on est seul.
  `decideBoxEnergy` exige `memberIds.length === 1` (règle du LOT F : « le bac de
  la table n'a pas de kcal par personne »), et une boîte sans nom tombe dans le
  même `continue`. Or ici elle **est** la portion de l'unique personne. Ouvrir la
  garde à `length === 0 && plan_kind === 'personal'` la rendrait juste — c'est
  une modification d'une garde de sécurité, donc une décision, pas un correctif.
- ⛔ **UN COMPTE SEUL DANS SON FOYER N'ATTEINT JAMAIS LA LANE DU FOYER DEPUIS
  L'ÉCRAN.** Trouvé en vérifiant au navigateur le 2026-09-08 : `chooseGenerator`
  (`frontend/src/keel/api/planRouting.ts`) finit par
  `otherMouths >= 1 ? "household" : "personal"`. Une bouche ⇒ l'écran appelle
  **`generate-meal-v1`**, où rien de ce chantier n'est câblé — ni le
  dimensionnement, ni le magasin de brouillons, donc ni les kcal sur l'aperçu.
  ⟳ **Le magasin de brouillons, lui, est câblé sur les DEUX lanes depuis le
  2026-09-08 au soir** : un compte solo voit donc les kcal de son aperçu (par
  plat et par jour). Mais le **dimensionnement** (`portion_v1`) reste sur la
  seule lane du foyer, et `PORTION_SIZING_MAX_MOUTHS = 1` la ferme dès deux
  bouches : **`portion_v1` n'est aujourd'hui atteignable par aucun utilisateur
  réel** — seuls les appels directs du banc y passent. Ce n'est pas une
  régression — c'est le périmètre du chantier solo — mais il faut le savoir
  avant de lire « 100 % servi » comme une propriété du produit. La bascule est
  le lot 14 du plan foyer.
  ⟳ **2026-09-08, LA MOITIÉ DE CE PARAGRAPHE EST PÉRIMÉE.** La bascule est prise
  (`PORTION_SIZING_MAX_MOUTHS = 12`) : **un foyer de deux bouches ou plus atteint
  `portion_v1` depuis l'écran**, et les grammes qu'il sert sont ceux du moteur.
  Ce qui reste vrai, et qui est le trou : **le compte SEUL, lui, n'y va toujours
  pas** — `chooseGenerator` l'envoie sur `generate-meal-v1`, où rien de ce
  chantier n'est câblé. La lane du foyer sait dimensionner une bouche depuis le
  lot 4 ; c'est le ROUTAGE de l'écran qui ne l'y mène pas. Refermer ce trou est
  une décision de produit (quelle lane sert un solo), pas un correctif.
- **Un plat `unmeasurable` n'est ni redimensionné, ni compté.** Vu au tir 4 du
  2026-09-08 : le déjeuner est sorti sans densité (1 124 g servis), parce que le
  référentiel n'a pas su peser un de ses ingrédients. Il ne porte alors AUCUN
  `unmet` — donc « 99,9 % servi » portait en réalité sur trois plats sur quatre.
  Défaut antérieur à ce chantier (`counters.unmeasurable_by` existait déjà), mais
  il plafonne ce que la mesure peut prouver, et il faut le lire avec le taux.
- **`lines_unattributed` vaut 3 à 4 sur ~17 lignes**, et la cause est
  ANTÉRIEURE au chantier : « 1 pincée de sel » n'a aucune quantité pesable, et
  « 1 pêche » est une ligne *comptée* quand le plan l'écrit en grammes. Autorer
  la liste remplacerait la prose du modèle, ses rayons et son `buy_on` pour
  réparer un compteur — **non fait, et voici pourquoi**.
- **Aucun tir réel sous plancher TCA.** Le plancher se dérive de signaux
  comportementaux ; le lever demanderait de fabriquer un historique de trouble
  alimentaire sur une fixture. Couvert par huit tests unitaires à la place.

### Généraliser à plusieurs bouches — ce qu'il faudra faire

⛔ **Lever `PORTION_SIZING_MAX_MOUTHS` ne suffit pas.** `applySizing` prend déjà
des lignes par (plat, bouche), mais trois points sont à rouvrir :

1. **La casserole devient une somme sur les bouches.** `potFactorOf` fait la
   moyenne des tirages ; à plusieurs mangeurs, chaque plat tire une part
   *différente*, et la démonstration `R × (Σfᵢ) / n` reste vraie à condition que
   `fᵢ` soit le facteur de la (bouche, plat), pas du plat.
2. **La boîte cesse d'être une prescription.** Un seul `member_id` veut dire
   « le contenant EST ta portion » ; plusieurs font basculer la lecture vers
   « quantité de bac », et l'écran change de phrase (v4).
3. **`fixedIntakeLoad.intakes` doit être filtré par bouche.** Le raccourci
   actuel n'est vrai qu'à une bouche, et il est commenté comme tel.

Et **rien n'a été supprimé** : tout le legacy reste appelable, ses tests sont
intacts, et chaque coupe est d'un caractère (`PORTION_SIZING_MAX_MOUTHS = 0`,
`RESTRICTION_FLOOR_SIZES_MAINTENANCE = false`, `portionSizing.applied`).

---

## Écart avec le code au 2026-09-07 *(état d'AVANT les lots, gardé pour mémoire)*

Pour qu'une session qui reprend ne le redécouvre pas :

| Étape | Aujourd'hui |
|---|---|
| 1, 2 | fait (`mouthTargetKcal`, `estimatedMaintenanceKcal`, appétit inclus) |
| 3 | poids et normalisation faits (`slotPlanTargets`) ; « repas léger » n'existe pas |
| 4 | fait |
| 5 | ⟳ 2026-09-10 — extras **supprimés** ; le shaker est retranché une fois, en entier, sur le chemin `portion_v1` (`slotFixedKcal`) |
| 6 | le brief porte les faits de corps ; pas de règle du plat complet |
| 7 | le modèle écrit les boîtes par personne |
| 8 | fait (`dishEnergy`, `potDensities`) |
| 9 | **n'existe pas** : le facteur est calculé puis écrit comme mesure, jamais appliqué |
| 10 | un plafond de masse existe, dérivé des kcal ; pas d'appel de réparation |
| 11 | compteurs `unmet`, `would_resize` existent |
| 12 | les courses suivent les casseroles écrites par le modèle |
