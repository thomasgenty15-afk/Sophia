# L'eau des lentilles : les lots B et D ne disent pas la même chose

Mesuré le 2026-09-11 à 07:0x par `eau-lentilles.ts` (lecture seule, aucun appel modèle), avec
le code des lots A et B tel qu'il est livré.

## Les six casseroles des deux plans, mesurées

```
plan PERTE 5fad22ce
  prep_poulet_quinoa            eau=  0 g  absorbed  readyG=1572  kcal=2182  d=138,8
  prep_saumon_pommes_de_terre   eau=  0 g  kept      readyG=1122  kcal=1505  d=134,1

plan GAIN a18f522e
  prep_chicken                  eau=  0 g  kept      readyG= 314  kcal= 645  d=205,4
  prep_quinoa                   eau=450 g  absorbed  readyG= 585  kcal= 805  d=137,6
  prep_lentil_ratatouille       eau=146 g  kept      readyG= 887  kcal=1242  d=140,0
  prep_salmon                   eau=  0 g  kept      readyG= 249  kcal= 611  d=245,6
  prep_couscous                 eau=286 g  absorbed  readyG= 628  kcal=1063  d=169,3
  prep_roasted_vegetables       eau=  0 g  kept      readyG= 298  kcal= 366  d=122,9
```

## Le désaccord, chiffré

Le lot **D** a mesuré que GAIN lentilles/pain/feta se ferme **si l'eau des lentilles est
absorbée**, et reste ouvert à 129,7 pour un minimum de 146 si elle est conservée. Le lot **B** a
décidé qu'elle est **conservée** : `legume_absorbs` n'est pas `grain_absorbs`, et l'enquête écrit
qu'on ne peut pas confondre l'eau absorbée et l'eau d'un bouillon.

Sur la casserole réelle, ça vaut :

| | readyG | densité |
|---|---:|---:|
| eau **conservée** (ce que le code fait aujourd'hui) | **887 g** | **140,0** |
| eau **absorbée** | 741 g | **167,6** |

**20 % d'écart sur la densité d'une casserole, décidés par un booléen.** Et c'est précisément
l'écart qui sépare « fermé sans appel modèle » de « il faut rappeler le modèle ».

## Ce que la recette dit vraiment, et qui tranche

`prep_lentil_ratatouille` déclare **240 g de lentilles vertes sèches** et **180 ml d'eau**
(146 g après mise à l'échelle). Or le rendement `legume_absorbs` fait passer ces lentilles de
194 g crus à ~479 g prêts : **elles ont donc déjà absorbé ~285 g d'eau dans le facteur de
rendement**. Compter en plus les 146 g déclarés porte l'eau totale de la casserole à ~431 g,
pour une recette qui n'en déclare que 146.

⛔ **C'est un double comptage de 146 g**, soit 16 % de la masse de la casserole. Et il est
physiquement impossible que ces 180 ml restent au fond : 240 g de lentilles sèches en
réclament 480 à 600 pour devenir tendres — la recette est déjà sous-hydratée telle qu'écrite.

## La règle que ça suggère, et pourquoi je ne l'ai PAS posée cette nuit

Ni la classe de rendement ni la prose ne peuvent trancher. **La capacité d'absorption, si.**

> Un ingrédient absorbant peut prendre `gramsCru × (rendement − 1)` grammes d'eau. L'eau
> déclarée **jusqu'à** cette capacité est déjà portée par le rendement : on ne la compte pas
> deux fois. L'eau déclarée **au-delà** est du bouillon : elle pèse.

Une seule règle, déterministe, sans matcher de prose, sans champ à faire déclarer par le
modèle. Elle rend le bon résultat sur les lentilles **et** sur une soupe (peu d'absorbant,
beaucoup d'eau ⇒ tout est conservé).

⛔ **Mais elle change aussi `prep_quinoa` (450 g d'eau) et `prep_couscous` (286 g)**, dont
l'eau est aujourd'hui entièrement écartée. Si leur eau déclarée dépasse la capacité, une partie
se remettrait à peser — et je n'ai aucun moyen de valider cette bascule cette nuit.

**Décision : ne rien changer maintenant.** La règle de B est défendable, documentée, et elle
reproduit les nombres de l'enquête. La règle de capacité est plus juste physiquement mais non
validée. Changer une règle de MESURE sur une intuition en fin de nuit est exactement ce que les
cicatrices de ce dépôt interdisent.

**Premier travail du matin**, avant toute campagne de génération : implémenter la règle de
capacité **avec ses tests**, mesurer son effet sur les six casseroles ci-dessus, et décider.
