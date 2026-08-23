# Cas 02 — la même personne, avec tout le formulaire rempli

**Le cas 01 plus six données.** Même corps, même activité, toujours pas
d'objectif. Ce qui change, c'est que le formulaire est complet — et trois de ces
six données changent **la structure** du calcul, pas seulement ses valeurs.

Socle : `scratchpad/2026-08-21-CAS-01-SOLO-JOURNEE-3-REPAS.md`.
Design : `scratchpad/2026-08-20-1900-DESIGN-CALCUL-ET-COMPOSITION.md`, partie 5.

> ⚠️ **Ce déroulé suppose livrés, en plus des lots du cas 01** : **22** (les six
> moments pondérés), **23** (l'occasion estimée), **25** (le forfait), **21**
> (l'exigence positive sur les drapeaux), **20/9 bis** (les deux portes de
> composition). Avec le code d'aujourd'hui, **aucune** de ces six données n'est
> traitée comme ci-dessous.

---

## 1. Ce qui s'ajoute au cas 01

| donnée | valeur | ce que ça change |
|---|---|---|
| allergie | **arachide** | exclusion dure — une **valeur** |
| n'aime pas | **le poisson** | exclusion douce **+ un drapeau à re-porter** |
| apport fixe | **shaker, 15 g de protéines** *(~70 kcal)*, l'après-midi | **structure** — un quatrième moment |
| le soir | **pain** | instruction de composition |
| le soir | **fromage · dessert** | **structure** — un forfait, pas une composition |
| appétit | **mange plus que sa carrure** | une **valeur** — × 1,10 |
| déjeuner | **à l'extérieur** | **structure** — une occasion *estimée* |

**Trois changent la structure** : le shaker, le déjeuner dehors, le forfait du
soir. **Trois ne changent que des valeurs** : l'appétit, l'allergie, le dégoût.

---

## 2. Qui traite quoi — les trois étages

| | **MOTEUR — avant** | **LE MODÈLE** | **MOTEUR — après** |
|---|---|---|---|
| **allergie** | interdit dur dans le prompt | compose sans, **choisit lui-même** le remplaçant | **ceinture de sortie** sur les aliments nommés |
| **dégoût** | relève que le poisson portait `omega3_marine`, cherche **qui d'autre le porte**, pose une **exigence positive** | compose sans poisson **et avec** l'huile d'algue | **vérifie** que le drapeau est porté. Sinon : diverger, sinon inatteignable |
| **shaker** | moment **résolu** : 70 kcal retirés du reste à composer | *jamais vu* | ses **15 g** comptent dans le rapport du jour |
| **pain** | instruction de composition | le compose **dans** le dîner | compté comme le reste |
| **fromage · dessert** | **forfait** : 110 + 150 kcal retirés de la cible du dîner | *ne les compose pas* | leurs protéines comptent dans le rapport du jour |
| **appétit** | multiplie l'entretien | *jamais vu* | *rien* |
| **déjeuner dehors** | moment **estimé** : 1 122 kcal recommandés, retirés | *ne le compose pas* | le **scan** arrive → l'écart part au plan **suivant** |

⚠️ **Deux des sept lignes n'atteignent jamais le modèle.** L'appétit et le shaker
sont de l'arithmétique pure : ils déplacent des nombres **au numérateur**, et rien
ne franchit la frontière. C'est la règle du §2.6 qui se voit à l'œil nu.

⛔ **L'exigence positive est au bon étage, et c'est la correction du 2026-08-21.**
Le remplaçant du poisson ne se décide **pas** après coup : le moteur pose
l'exigence **avant**, et la porte de sortie **vérifie** au lieu de réparer. Une
réparation a posteriori coûte une régénération entière.

---

## 3. Moteur — avant : la journée et ses quatre moments

```
① métabolisme de base                                    1 758 kcal/j
② × 1,63   assis + 3-4 séances          [crossed]        2 865
③ × 1,10   appétit                                       3 152 kcal/j
④ objectif : aucun -> écart 0                            3 152 kcal/j

⑤ les moments déclarés
                          poids de base   ramenés à 1    état
   petit-déjeuner             0,22          0,244        composé
   déjeuner                   0,32          0,356        ESTIMÉ
   après-midi                 0,08          0,089        RÉSOLU
   dîner                      0,28          0,311        composé
                              ----
                              0,90

⑥ ce que les moments connus prennent
   déjeuner estimé   3 152 × 0,356                       1 122 kcal   (recommandation)
   shaker résolu     déclaré                                 70 kcal

⑦ reste à composer   3 152 − 1 122 − 70                  1 960 kcal
   petit-déjeuner    0,244 / (0,244+0,311) = 0,440         862 kcal
   dîner             0,560                               1 098 kcal

⑧ et DANS le dîner   1 098 − 110 (fromage) − 150 (dessert)  838 kcal à composer

⑨ plancher protéique  117 g ÷ 3 152 kcal      =   37 g de protéines / 1 000 kcal
```

⚠️ **Le petit-déjeuner grossit à cause du shaker.** Le poids de l'après-midi lui
donnerait 281 kcal ; le shaker n'en apporte que 70. Les 211 qui manquent retombent
sur les deux repas composés — d'où 862 kcal au lieu des 769 que son propre poids
donnerait. C'est juste : son besoin du jour ne baisse pas parce que son goûter est
petit. **Les poids de base ne décident que le partage de ce qui RESTE**, une fois
les moments connus servis.

---

## 4. Ce qui part dans le prompt

**Reçu par le modèle :**
- **interdit dur** — aucune arachide, sous aucune forme
- **exclusion douce** — pas de poisson
- ⛔ **exigence positive** — *« l'oméga-3 marin doit être porté ; candidats : huile
  d'algue, œufs enrichis »*
- **instruction de composition** — du pain au dîner
- deux repas à composer, structure par repas, densité visée, fréquences de la semaine

**Jamais reçu :**
- aucun gramme · aucune kcal · **pas même les cibles** de 862 et 838
- ni poids, ni taille, ni âge, ni sexe, ni appétit
- ni le shaker, ni le fromage, ni le dessert — **il ne les compose pas**

---

## 5. La génération

### Petit-déjeuner — cible 862 kcal, sans arachide

| | part ordinaire | après correction |
|---|---|---|
| flocons d'avoine | 50 g | **84 g** |
| lait demi-écrémé | 200 ml | **336 ml** |
| banane | 100 g | **168 g** |
| purée de tournesol | 10 g | **17 g** |
| œuf | 1 (55 g) | **1 (92 g)** |
| **livré** | 512 kcal | **861 kcal** |

`facteur = 862 ÷ 512 =` **1,68** · **697 g dans le bol** · **1,24 kcal/g** · **40 g de protéines**

⚠️ **La purée de tournesol est choisie par le MODÈLE**, pas par le moteur. Rien
dans le système ne désigne un remplaçant : le moteur envoie l'interdit, le modèle
compose, la ceinture de sortie vérifie. Une table de substituts serait 923
aliments × N allergènes maintenus à la main — le piège du matcher, déguisé.

### Dîner — 838 kcal composés, sans poisson, avec l'huile d'algue

| | part ordinaire *(cru)* | après correction *(cru)* | dans l'assiette |
|---|---|---|---|
| poulet | 120 g | **168 g** | 126 g |
| pommes de terre | 200 g | **280 g** | 269 g |
| légumes | 180 g | **252 g** | 214 g |
| huile d'olive | 8 g | **11 g** | 11 g |
| **huile d'algue** | 2 g | **3 g** | 3 g |
| pain complet | 40 g | **56 g** | 56 g |
| **livré** | 598 kcal | **838 kcal** | **679 g** |

`facteur = 838 ÷ 598 =` **1,40** · **1,23 kcal/g** · **54 g de protéines**

**Et par-dessus, non composés :** fromage **110 kcal · 7 g** · dessert
**150 kcal · 3 g**. Le dîner de la journée pèse donc 1 098 kcal, dont 838 sortent
d'une casserole.

---

## 6. Les portes de sortie — quatre, et trois portées différentes

| porte | portée | verdict |
|---|---|---|
| **densité** `>= 0,80 kcal/g` | **chaque repas** | 1,24 · 1,23 — passent |
| **ceinture allergènes** | **chaque plat** | aucune arachide parmi les aliments nommés |
| **drapeaux du référentiel** | **le plan** | `omega3_marine` porté par l'huile d'algue |
| **protéine** `>= 37 g / 1 000 kcal` | **la journée** | provisoire — voir ci-dessous |

⚠️ **La densité ne juge que ce qu'on SERT.** Le fromage et le dessert n'entrent pas
dans le `E ÷ M` du plat : ils ne sont pas dans l'assiette composée. Les y faire
entrer laisserait passer des plats trop dilués.

⛔ **Le drapeau est porté parce qu'on l'a DEMANDÉ, pas parce qu'on a corrigé.**
C'est la différence entre une porte qui vérifie et une porte qui répare.

---

## 7. Le bilan — et la marge est plus mince qu'elle n'en a l'air

```
petit-déjeuner        861     composé
déjeuner            1 122     ESTIMÉ
après-midi             70     résolu
dîner               1 098     838 composés + 110 fromage + 150 dessert
                    -----
                    3 151     cible 3 152
```

**Protéines, sur ce qu'on maîtrise** : `40 + 54 + 15 + 7 + 3 =` **119 g** pour
2 029 kcal, soit **59 g / 1 000 kcal**. Très large.

⛔ **Mais le verdict porte sur la JOURNÉE, et le déjeuner y met 1 122 kcal dont
la protéine est inconnue.** Au pire — un déjeuner sans aucune protéine :

```
119 g ÷ 3 152 kcal   =   37,8 g / 1 000 kcal        seuil : 37,1
```

**Ça passe de 1,9 %.** Le provisoire à 59 était trompeur : c'est le déjeuner qui
dilue. **Voilà pourquoi la porte protéique a deux moments** — un verdict
provisoire à la génération, un verdict définitif quand le scan referme l'occasion
estimée.

---

## 8. Ce qui s'affiche

**Il n'a pas d'objectif de poids.** Les 1 122 kcal recommandés pour son déjeuner
**existent et servent au calcul — ils ne sortent jamais à l'écran.** Il voit son
plat, ses ingrédients, ses bacs, et rien qui le vise.

Avec un objectif, le même nombre serait affiché. **Le calcul est identique dans
les deux cas ; seule la sortie change** — exactement la règle de la boîte pesée
v4, appliquée à une autre surface.

---

## 9. Ce que ce cas révèle, et qui n'est pas un défaut de lui

**La fenêtre de compensation du jour même est VIDE.** S'il mange 1 600 kcal au lieu
des 1 122 recommandés, il faudrait retirer 478 kcal au dîner — mais **le dîner est
déjà cuit et déjà en boîte**, préparé dimanche. Rien ne peut rétrécir, rien ne peut
grossir.

⇒ **Ce produit ne peut ajuster que le plan SUIVANT.** Une app de comptage ajuste
aujourd'hui ; ici les scans s'accumulent sur la fenêtre du plan et informent la
génération d'après. C'est un usage différent, et il faut l'écrire — sinon quelqu'un
construira un ajustement du soir qui ne peut pas s'appliquer.

*(Un levier existe : laisser délibérément une occasion **non préparée** — le
petit-déjeuner se fait sur le moment. Elle devient la variable d'ajustement du
lendemain. Mais ajuster un petit-déjeuner d'après le déjeuner de la veille est du
pilotage à la calorie : ça ne se justifie que pour une bouche **à objectif**.)*

---

## 10. Ce que ce cas ne teste PAS — la suite

| cas | ce que ça ajoute | ce que ça devrait faire bouger |
|---|---|---|
| **03** | un **objectif de poids** | l'écart, le plafond 500 kcal/j, la porte TCA, une **boîte pesée**, et **l'affichage du nombre** |
| **04** | un **aliment inconnu** dans un plat | l'abstention pesée et l'auto-remplissage *(lots 17-18)* |
| **05** | un **foyer** de plusieurs bouches | une casserole, N portions, l'union des interdits — **et la variante de plat** *(lot 26)* pour la bouche qui refuse le poisson |
| **06** | un **régime** *(végé, végane, pescatarien)* | la divergence R5, et le plat commun au régime le plus restrictif |
| **07** | un **mineur**, ou une **grossesse** | des portes qui **refusent**, pas des cibles qui bougent |
| **08** | **pas de congélateur**, four et plaque seulement | la conservation, le portionnement, la branche congélation |

---

## 11. Les identifiants du code

En plus de ceux du cas 01 :

| ce que ce cas ajoute | identifiant | fichier |
|---|---|---|
| l'appétit | facteur ±10 %, transitoire | `_shared/keel/meal_envelope.ts` |
| les apports fixes | `fixed_intakes.ts`, `household_fixed_intakes.ts` | `_shared/keel/` |
| ⚠️ le groupe forcé sur un apport déclaré | `augmentedIndexFor` force `lean_protein` | `fixed_intakes.ts` |
| les six moments | `EATING_OCCASIONS` *(six)* vs `SLOT_DAY_WEIGHT` *(trois)* | `household_habits.ts` · `mouth_anchor.ts` |
| les allergènes | `allergen_catalog.ts`, `allergen_surface_forms.ts`, `forbidden_matcher.ts` | `_shared/keel/` |
| la ceinture de sortie | `household_safety.ts` | idem |
| le régime par bouche | `dietary_regime.ts` · spec `SPEC-REGIME-PAR-BOUCHE-20260814.md` | ⚠️ importé par la lane **solo seulement** |
| les drapeaux nutritionnels | `omega3_marine`, `iron_source`, `calcium_source`, `iodine_source`, `zinc_source`, `b12_source`, `folate_source` | table `food_composition_refs` |
| le chemin d'estimation | `meal_declaration_floor.ts`, `photo_invitation_attach.ts` | ⚠️ **à mesurer** : rendent-ils une valeur énergétique, ou seulement un enregistrement ? |
| la forme qui bloque la variante | `SizableShare = {memberId, grams}` | `household_portions.ts` |
