# RUN RÉEL — le grammage par personne, sur `iku@gmail.com`

**2026-08-20 01h00** · branche `ff-001-quotidien-du-coach` · **rien n'est commité**.
Dix générations réelles sur le foyer `5600347f`, connecté en `iku@gmail.com`.

## Le résultat

```
AVANT   thu/dinner   iku 420 g · Christèle 420 g      (identique partout)
APRÈS   thu/dinner   iku 1095 g · Christèle 1350 g
        jour entier  iku 2190 g · Christèle 1350 g
```

Les grammes **divergent par personne**, dérivés de leur corps, de leur objectif
et des moments qu'ils déclarent. Plus aucun nombre partagé.

## Les CINQ défauts trouvés, chacun invisible derrière le précédent

Le chantier des sept lots était juste et **n'atteignait pas l'assiette**. Il a
fallu dix runs pour dépiler la chaîne.

### ① Le runtime servait du code périmé
Il tournait depuis 22h02, le branchement datait de minuit. Connu, documenté,
et il fallait quand même commencer par là.

### ② Le produit compose en FRANÇAIS, le référentiel est anglais
**Le défaut le plus coûteux.** `cuisses de poulet désossées` ne résolvait pas —
alors que `cuisses de poulet` est un alias existant. C'est la protéine
principale: elle éteignait **sept plats sur neuf**, donc toute l'énergie, donc
tout l'ancrage.

La liste des modificateurs était bilingue et **asymétrique**, ce qui est pire
qu'unilingue: `boneless` y était, `desossees` non; `roasted` y était, `rotis`
non; `whole` y était, `complet` non. Réparé par symétrie (chaque entrée ajoutée
est la traduction d'une entrée anglaise déjà présente), plus un pluriel français
ÉTROIT et des alias écrits à la main.

⚠️ **Toute la couverture mesurée hier (55,4 %) l'a été sur une archive
majoritairement ANGLAISE.** Elle ne disait rien de ce que le produit génère.

### ③ Le prompt et le référentiel ne s'accordaient pas sur `state`
Le prompt exigeait `state` pour « rice, pasta, couscous, lentils, meat, fish ».
Le référentiel range `onion`, `spinach`, `courgette`, `bell_pepper`, `broccoli`
en `veg_shrinks` — donc `gramsRawOf` REFUSE de les peser sans `state`. Un
`180 g d'épinards` parfaitement quantifié n'était pas pesable. Deux contrats sur
le même champ, et celui qui décide n'était pas celui qui parlait au modèle.

### ④ ⛔ LE MOTEUR CALCULAIT JUSTE, ET L'ÉCRAN NE LE VOYAIT PAS
Le plus cher des cinq. `sizeBoxesFromTarget` écrit dans `meal.dishes`; la
réponse sert `dishes`, un **instantané pris ~500 lignes plus haut**
(`applyHouseRuleLock(mealDishesPayload(meal), …)`). Aucune référence partagée.

```
sonde moteur :  iku 544 g · Christèle 306 g
réponse HTTP :  iku 400 g · Christèle 400 g
```

Et `box_sizing` annonçait `sized: 12` **en toute bonne foi** — il compte ce que
le moteur produit, pas ce que la réponse porte. C'est la cicatrice du `current`
périmé, à l'envers: là-bas une lecture périmée écrasait une écriture; ici une
écriture n'atteignait jamais la copie servie.

### ⑤ Ma propre garde bloquait sur la mauvaise lacune
`no_box` (un plat cuisiné le jour même) faisait tomber la journée en
`day_incomplete`, donc pas d'ancrage — sur **six runs consécutifs**, c'est-à-dire
la population entière. Or un plat sans couvercle n'entre pas dans `day.slots`:
`dayCoverageOf` avait DÉJÀ retiré son moment de la cible. Les deux côtés du
rapport étaient réduits ensemble. Seules les lacunes de LECTURE bloquent
désormais.

## ⛔ ET LE DÉFAUT STRUCTUREL, RENCONTRÉ TROIS FOIS

**Un plafond COMMUN fusionne tout ce qui le dépasse.** Mesuré à chaque valeur:

```
MAX = 1,60  ->  iku 1,600 · Christèle 1,600   ->  400/400
MAX = 3,00  ->  iku 1315 g · Christèle 1302 g
```

Le plafond redevenait la valeur opérante, et **reproduisait le défaut d'origine
par sa propre ceinture**. Aucune valeur unique ne l'évite: la baisser rapproche
seulement le moment où tout le monde s'y colle.

**La borne doit dépendre de la bouche.** `PLAUSIBLE_DAILY_GRAMS_PER_KG = 30`
borne les GRAMMES d'une journée par kilo de corps — deux corps différents ont
deux plafonds différents et ne peuvent plus se rejoindre. Un test le garde,
avec le cas mesuré dedans.

## ⚠️ CE QUI RESTE, ET C'EST NUTRITIONNEL, PLUS INFORMATIQUE

```
              cible      livré (jour entier)   facteur BRUT demandé
iku           3 925      583 – 1 031 kcal      2,9 – 5,0
Christèle     1 029*     246 – 367 kcal        2,8 – 4,2      (*part dîner)
```

**Le plan compose entre un tiers et un cinquième de l'énergie nécessaire.** Même
en servant 2,19 kg d'aliment prêt — la limite physique d'un corps de 73 kg —
iku reste très en dessous de sa cible.

Ce n'est pas un défaut de grammage: c'est une **densité énergétique**. On ne
nourrit pas 3 900 kcal avec du poulet rôti et des légumes à ~1 kcal/g. Un
nutritionniste dirait la même phrase: *ce n'est pas la portion qu'il faut
changer, c'est ce qu'il y a dedans* — du riz, des pâtes, de l'huile, des
oléagineux.

⚠️ **Et c'est maintenant MESURÉ, pas supposé**: `anchor.clamped: 6` et le
résidu `raw` disent exactement de combien. C'est le prochain lot, et il est
côté composition.

⚠️ **Un effet de bord visible**: Christèle peut recevoir plus qu'iku AU DÎNER
(1350 vs 1095). Ce n'est pas une erreur — elle ne prend que ce repas du plan,
il porte donc une plus grosse part de sa journée, pendant que le plafond
physique retient iku. À trancher: est-ce lisible à table ?

## Un défaut de plan, trouvé en passant et NON corrigé

**Christèle déclare `lunch` + `dinner`; le plan ne lui compose que `dinner`.**
Son déjeuner n'existe nulle part — elle n'aurait rien à midi. C'est un défaut de
composition, pas de grammage, et il mérite son propre lot.

## Vérifications

- `_shared/keel` : **3 885 passés, 0 échec** (+9 tests du jour).
- Front : **1 745 passés**, 4 rouges antérieurs et étrangers.
- Diff d'appariement du corpus (605 termes, 2 587 alias, 923 slugs) :
  **0 perdu, 3 déplacés — tous des CORRECTIONS** (`tortillas`: white_bread ->
  tortilla_wrap), 4 gagnés.
- Trois migrations, lignée propre, `supabase migration up` uniquement.
- La sonde temporaire posée dans le générateur a été **retirée**; le recollage
  des parts, lui, est **compté** (`sized_shares_relinked`) — un recollage
  silencieux qui cesserait de fonctionner ressemblerait exactement au défaut
  qu'il répare.
