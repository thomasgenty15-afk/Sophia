# Cas 03 — la même journée, avec l'équipement de cuisine et un plat de tradition

**Le cas 02, moins le déjeuner dehors, plus deux données.** Le déjeuner revient
dans le plan et porte un **plat de tradition** ; le foyer déclare son
**équipement**. Toujours une seule journée, trois repas.

Socle : `2026-08-21-CAS-01-SOLO-JOURNEE-3-REPAS.md` et
`2026-08-21-CAS-02-SOLO-CONTRAINTES-COMPLETES.md`.
Design : `2026-08-20-1900-DESIGN-CALCUL-ET-COMPOSITION.md`, partie 5.

> ⚠️ **En plus des lots des cas 01 et 02, ce déroulé suppose le lot 27** — la
> porte de capacité, la seule qui tourne **après** le facteur. Rien de ce qui
> suit sur l'air fryer n'existe aujourd'hui.

---

## 1. Ce qui change

| donnée | effet |
|---|---|
| **le déjeuner revient dans le plan** | plus d'occasion estimée — les trois repas sont composés, et **le verdict protéique se ferme tout de suite** |
| **plat de tradition** — poulet rôti, pommes dauphine, le midi | la composition du déjeuner est **imposée** ; elle sort du choix du modèle |
| **plaques + air fryer**, pas de four | contraint le **comment** : le rôti devient des cuisses à l'air fryer |
| **congélateur** | ⚠️ **inerte sur une journée** — il n'agit qu'à partir de la fenêtre multi-jours |

Tout le reste du cas 02 est conservé : allergie à l'arachide, dégoût du poisson,
shaker de 15 g l'après-midi, pain composé le soir, fromage et dessert en forfait,
appétit × 1,10.

⚠️ **Le congélateur est volontairement laissé inerte.** Une journée isole la
mécanique ; la fenêtre de conservation et le nombre de sessions de cuisine sont
un cas à part, et ils appartiennent à un niveau supérieur — **le plan**.

---

## 2. Qui traite quoi — les deux données nouvelles

| | **MOTEUR — avant** | **LE MODÈLE** | **MOTEUR — après** |
|---|---|---|---|
| **plat de tradition** | **impose** la composition du déjeuner | ne le choisit pas — il le **reçoit**, et adapte les deux autres repas autour | le **dimensionne** comme les autres. Sécurité : mord. Nutrition : n'en refuse rien |
| **équipement** | liste ce qui existe, exclut ce qui manque, entre comme **contrainte de méthode** | **adapte le comment** — cuisses à l'air fryer au lieu d'un rôti au four | vérifie qu'aucune étape ne réclame l'absent, **et que le volume tient** |

---

## 3. Moteur — avant

```
① métabolisme de base                                  1 758 kcal/j
② × 1,63   assis + 3-4 séances       [crossed]         2 865
③ × 1,10   appétit                                     3 152 kcal/j
④ objectif : aucun -> écart 0                          3 152 kcal/j

⑤ les moments déclarés
                        poids de base   ramenés à 1     état
   petit-déjeuner           0,22           0,244        composé
   déjeuner                 0,32           0,356        composé   <- TRADITION imposée
   après-midi               0,08           0,089        résolu    -> 70 kcal (shaker)
   dîner                    0,28           0,311        composé
                            ----
                            0,90

⑥ 3 152 − 70 (shaker)  =  3 082  à répartir sur les trois repas composés
      petit-déjeuner    0,268    ->    826 kcal
      déjeuner          0,391    ->  1 205 kcal
      dîner             0,341    ->  1 051 kcal
                  dans le dîner : 1 051 − 110 (fromage) − 150 (dessert)  ->  791 kcal

⑦ plancher protéique   117 g ÷ 3 152   =   37 g de protéines / 1 000 kcal
```

---

## 4. Ce qui part dans le prompt

**Reçu par le modèle**, en plus du cas 02 :
- ⛔ **une composition imposée** pour le déjeuner — poulet rôti, pommes dauphine
- ⛔ **les équipements disponibles** — plaques, air fryer, réfrigérateur, congélateur
- ⛔ **et l'absence de four et de micro-ondes**, nommée

**Toujours jamais reçu :** aucun gramme, aucune kcal, aucun fait de corps.

---

## 5. Les trois repas

### Petit-déjeuner — 826 kcal · *plaque*

| | ordinaire | après correction |
|---|---|---|
| flocons d'avoine | 50 g | **81 g** |
| lait demi-écrémé | 200 ml | **322 ml** |
| banane | 100 g | **161 g** |
| purée de tournesol | 10 g | **16 g** |
| œuf | 1 | **1** |
| **livré** | 512 kcal | **825 kcal** |

`× 1,61` · **669 g** · **1,23 kcal/g** · **38 g de protéines**

### Déjeuner — 1 205 kcal · la tradition · *air fryer*

| | ordinaire *(cru)* | après correction | prêt |
|---|---|---|---|
| cuisses de poulet | 200 g | **278 g** | 195 g |
| pommes dauphine | 150 g | **209 g** | 199 g |
| haricots verts | 150 g | **209 g** | 188 g |
| huile | 5 g | **7 g** | — |
| **livré** | 865 kcal | **1 205 kcal** | **582 g** |

`× 1,39` · **2,07 kcal/g** · **62 g de protéines**

⚠️ **« Poulet rôti » sans four.** Le plat n'est pas refusé et n'est pas remplacé :
ce sont **des cuisses à l'air fryer**. La tradition dit *quoi*, l'équipement dit
*comment*, et c'est toujours le **comment** qui plie.

### Dîner — 791 kcal composés · *plaque*

| | ordinaire *(cru)* | après correction | prêt |
|---|---|---|---|
| lentilles | 70 g | **84 g** | 202 g |
| riz | 50 g | **60 g** | 156 g |
| légumes | 200 g | **240 g** | 204 g |
| huile d'olive | 8 g | **10 g** | — |
| **huile d'algue** | 2 g | **2,4 g** | — |
| pain complet | 40 g | **48 g** | 48 g |
| **livré** | 659 kcal | **795 kcal** | **622 g** |

`× 1,20` · **1,28 kcal/g** · **35 g de protéines**

**Et par-dessus, non composés :** fromage 110 kcal · 7 g · dessert 150 kcal · 3 g.

⚠️ **Le poulet n'est pas répété.** Le déjeuner en porte déjà ; le dîner passe aux
lentilles, qui apportent en plus `iron_source` et `folate_source`. La variété est
**dirigée**, pas décorative.

---

## 6. Les portes

| porte | portée | verdict |
|---|---|---|
| **densité** `>= 0,80 kcal/g` | chaque repas | 1,23 · **2,07** · 1,28 — passent |
| **protéine** `>= 37 g / 1 000 kcal` | la journée | **51** — passe, et **se ferme** |
| **ceinture allergènes** | chaque plat | aucune arachide |
| **les sept drapeaux** | le **plan** | tous portés |
| **équipement** | chaque étape | aucune ne réclame l'absent |
| ⛔ **capacité** | **après le facteur** | **échoue — deux passages** |

**Les sept drapeaux, un par un :** `omega3_marine` huile d'algue · `iron` et
`folate` lentilles · `calcium` et `iodine` lait · `b12` œuf et poulet · `zinc`
poulet et lentilles.

⚠️ **La densité de 2,07 au déjeuner ne déclenche rien**, et c'est voulu : le
plancher est un **plancher**. Les pommes dauphine sont frites, le plat est dense,
et rien dans le design ne s'y oppose — le plafond de masse a été retiré au
lot 9 bis, précisément pour ne pas punir un plat légitime.

⚠️ **Le verdict protéique se ferme immédiatement**, pour la première fois de la
série. Aucune occasion estimée ⇒ pas de verdict provisoire, pas d'attente de scan.
C'est le contraste utile avec le cas 02, où le déjeuner dehors diluait la journée
et faisait frôler le seuil à 37,8 contre 37,1.

---

## 7. ⛔ Ce que ce cas révèle — le moteur casse ce que le modèle avait résolu

La part ordinaire tient dans le panier : `200 + 150 =` **350 g**, une couche, un
passage. Le modèle le sait — il compose des plats faisables.

Après le facteur : `278 + 209 =` **487 g**. **Ça ne tient plus.**

Personne ne le voit :
- le modèle a vérifié la faisabilité — **mais sur 350 g, avant la multiplication** ;
- le moteur ne vérifie que l'énergie. Il ne sait pas ce qu'est un panier.

⇒ **La recette annonce « air fryer, 20 min ». La vraie cuisson en demande 40.**
Sur un produit qui vend du **temps gagné**, annoncer la moitié du temps réel est
un mensonge sur exactement ce qu'on vend.

### La réparation, et elle est petite

**Un seul contrôle, tout à la fin, après la multiplication.** Il ne refuse rien —
il **réécrit les étapes et le temps** :

> *« deux passages à l'air fryer : les cuisses d'abord, les pommes dauphine
> ensuite — 40 min au total »*

### Et ça complète la carte des portes

| contrainte | invariante d'échelle ? | jugée |
|---|---|---|
| densité `E/M` | **oui** | **avant** le facteur, sur la composition |
| protéine `P/E` | **oui** | **avant** le facteur, sur la composition |
| **capacité** | ⛔ **non** — grammes réels | ⛔ **après** le facteur |

C'est la **seule** porte du produit qui doit tourner après le dimensionnement.
Posée avant, elle ne verrait jamais le problème.

⚠️ **Ce qu'elle réclame et qui n'existe pas** : une **capacité par appareil** et
une estimation du **volume** d'un plat. Le référentiel porte des grammes, pas des
litres. À trancher : une masse par cuisson suffit-elle ?

---

## 8. Le bilan

```
petit-déjeuner        825     composé
déjeuner            1 205     composé — tradition
après-midi             70     résolu
dîner               1 051     795 composés + 110 fromage + 150 dessert
                    -----
                    3 151     cible 3 152
```

**Protéines** : `38 + 62 + 15 + 35 + 7 + 3 =` **160 g** pour 3 151 kcal, soit
**51 g / 1 000 kcal**. Seuil 37,1 — large, et **définitif**.

---

## 9. Ce qui s'affiche

Pas d'objectif de poids ⇒ **aucun chiffre ne le vise**. Il voit ses trois plats,
leurs ingrédients, ses bacs — et, nouveauté de ce cas, **un temps de cuisine qui
dit la vérité** : deux passages, 40 minutes.

---

## 10. Ce que ce cas ne teste PAS — la suite

| cas | ce que ça ajoute | ce que ça devrait faire bouger |
|---|---|---|
| **04** | le **congélateur sur plusieurs jours** | la **fenêtre du plan** et le **nombre de sessions** — le niveau *plan*, encore jamais exercé |
| **05** | un **objectif de poids** | l'écart, le plafond 500 kcal/j, la porte TCA, la **boîte pesée**, l'**affichage du nombre** |
| **06** | un **aliment inconnu** | l'abstention pesée et l'auto-remplissage *(lots 17-18)* |
| **07** | un **foyer** de plusieurs bouches | une casserole, N portions, l'union des interdits, **la variante de plat** *(lot 26)*, **et la capacité du panier × N** |
| **08** | un **mineur**, ou une **grossesse** | des portes qui **refusent**, pas des cibles qui bougent |

⚠️ **Le cas 07 rend la capacité bien plus mordante** : un panier de 4 litres pour
quatre bouches, ce n'est plus deux passages, c'est cinq. **La capacité est la
contrainte qui explose avec la taille du foyer**, et aucune autre ne le fait.

---

## 11. Les identifiants du code

En plus de ceux des cas 01 et 02 :

| ce que ce cas ajoute | où |
|---|---|
| l'équipement déclaré | `KitchenEquipmentCard.tsx` · `kitchenEquipment.int.test.ts` *(front)* |
| la forme de cuisson | `cookingShape.int.test.ts` · `SPEC-HABITUDES-ET-FORME-DE-CUISSON-20260814.md` |
| les sessions de cuisine | `CookingSessions.tsx` *(front)* · `MAX_FRIDGE_DAYS = 3` |
| la borne basse du facteur | `ANCHOR_FACTOR_MIN = 0,60` | `mouth_anchor.ts` |
| ⛔ la capacité d'un appareil | **n'existe nulle part** — lot 27 |
| ⛔ le volume d'un plat | **n'existe nulle part** — le référentiel porte des grammes |
