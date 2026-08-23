# LOT 19 — Les lignes CIQUAL abîmées (mesuré le 2026-08-21, 923 lignes)

**692 lignes sur 923 portent au moins un défaut — mais 18 seulement hors
traçabilité.** Le gros du chiffre est une seule chose : l'import complet ne sait
plus d'où il vient.

Ce qui est **sain**, et mesuré : aucun mojibake (`Ã`, `Â`, `�`) · aucun libellé
en double · aucune macro `NULL` sur les 923 lignes · aucun alias orphelin ·
30 groupes tous représentés.

---

## G. 689 lignes se disent CIQUAL et ne portent aucun code — **invérifiables**

```
source = 'ciqual'  et  ciqual_code IS NULL  →  689 lignes
source = 'ciqual'  et  ciqual_code présent  →  192 lignes
source ≠ 'ciqual'                           →   42 lignes
```

Les 689 sont exactement l'apport de `20260812090000_ciqual_full_import.sql`
(222 → 911 lignes). Ni `ciqual_code`, ni `ciqual_name`.

**Conséquence directe, et c'est la plus lourde du lot :** l'instruction
« vérifier chaque alias contre la ligne CIQUAL réelle — `label`, `ciqual_name`,
`ciqual_code`, `food_group_ref` » **ne peut pas être suivie sur 75 % de la
table**. Il n'y a rien à joindre. La vérification s'y réduit au libellé, au
groupe et à l'énergie — c'est ce qui a été fait pour les 86 propositions, et
c'est un cran plus faible que ce qui était demandé.

**Le préalable de toute génération d'alias en masse est de reconstituer ces
codes**, en rejouant l'import sur la source ANSES CIQUAL 2020.

---

## A. 11 libellés tronqués à 78 caractères, coupés en plein mot

Le `CHECK` de la table plafonne à 80 ; l'import a coupé à 78, sans ellipse. Un
libellé tronqué **ne peut porter aucun alias correct, dans aucune langue** : on
ne sait pas ce qu'il nomme.

- `chinese_cabbageor_bok_choi`
  `Chinese cabbageor bok choï bredes, rods and leafs, steamed, from the island La`
- `colombo_papaya_mature_seeds`
  `Colombo Papaya (fruit), mature, seeds and peel removed, raw, from the island L`
- `custard_cream_eggs_refrigerated`
  `Custard cream with eggs (a small jar of chocolate or vanilla cream or other fl`
- `floating_island_refrigerated`
  `Floating island (meringue poached in milk and served in a light custard cream)`
- `mousse_topped_whipped_cream`
  `Mousse (chocolate, coffee, caramel or vanilla) topped with whipped cream, refr`
- `plant_based_dessert_flavoured`
  `Plant-based dessert (almond, oat, hemp, coconut, rice), flavoured, sweet, not `
- `plant_based_dessert_soybean`
  `Plant-based dessert without soybean (coconut, rice), with fruits, sweet, forti`
- `queen_vicoria_ananas_flesh`
  `Queen Vicoria ananas, flesh, raw, from the island La Réunion (Ananas comosus (`
- `spanish_style_tortilla_onions`
  `Spanish-style tortilla with onions (omelette with potatoes and onions), prepac`
- `veal_escalope_cordon_bleu`
  `Veal escalope cordon bleu (topped with a ham slice and Gruyere sauce), prepack`
- `vegetable_fat_spreadable_fat`
  `Vegetable fat (margarine type), spreadable, fat content unknown, light, unsalt`

Deux d'entre eux s'arrêtent sur un mot-outil, ce qui rend la coupe visible :
`…from the island La`, `…light, unsalt`.

---

## B. 1 mot collé, dans le libellé **et** dans le slug

```
slug   chinese_cabbageor_bok_choi
label  Chinese cabbageor bok choï bredes, rods and leafs, steamed, from the island La
```

La source disait « Chinese cabbage **or** bok choï ». L'espace a disparu à
l'import, et le slug a été dérivé du libellé cassé : **le défaut est recopié
dans la clé primaire**. Cette ligne cumule A et B.

---

## C. 2 fautes de frappe recopiées de la source

| slug | libellé | devrait lire |
|---|---|---|
| `brear_t55_t110_flour` | **Brear** (baguette or ball), made with type T55-T110 flour | Bread |
| `queen_vicoria_ananas_flesh` | Queen **Vicoria** ananas, flesh, raw… | Victoria |

Aucune des deux n'est atteignable par ce qu'un cuisinier écrirait.

---

## D. 1 valeur incohérente avec sa classe de rendement — **et elle coûte cher**

```
noodles              | Noodles              | grain_absorbs | 104 kcal
noodles_wholewheat   | Wholewheat noodles   | grain_absorbs | 350 kcal
```

104 kcal/100 g est une valeur de nouilles **CUITES**. La ligne la déclare CRUE
(c'est le contrat de `yield_class`) et absorbante. Un plat qui écrit
« 150 g de nouilles, cuites » se calcule donc :
`150 / 2,6 = 57,7 g` × 104 = **60 kcal**, au lieu de ~200. **×3,3 trop léger.**

C'est le seul cas de la table (`yield_class` absorbante avec une énergie
< 160 kcal) — donc réparable en une ligne, mais il **bloque** l'alias
`egg noodles` (11 occurrences réelles) : le pointer sur une ligne fausse
transformerait une abstention en un nombre faux.

---

## E. 1 doublon de fait

```
bulgur        | Bulgur       | 351 kcal
bulgur_wheat  | Bulgur wheat | 347 kcal
```

Le même aliment, deux lignes, 4 kcal d'écart. `bulgur_wheat` est l'une des 15
lignes sans alias. Tant que le doublon vit, tout alias français (`boulgour`)
doit choisir arbitrairement — et `boulgour` pointe aujourd'hui sur `bulgur`.

---

## F. 1 ligne non alimentaire

`paraffin_oil` — « Paraffin oil », 0 kcal, `energy_dense = false`. L'huile de
paraffine est un laxatif, pas un aliment. Elle n'a jamais été atteinte par le
corpus ; elle reste une ligne qu'un terme comme « huile » ne doit pas pouvoir
toucher.

---

## H. 2 faux amis **au niveau du slug** — donc irréparables par un alias

`resolveIngredient` consulte `bySlug` **avant** `byAlias`. Un slug anglais qui
est aussi un mot français courant capture ce mot pour toujours :

| slug | ce qu'il EST | le mot français qu'il capture | écart |
|---|---|---|---|
| `prune` | Prune — le fruit **SEC**, 229 kcal | *prune* = le fruit **FRAIS** (`plum`, 46 kcal) | **×5,0** |
| `pate` | Paté (average) — **charcuterie**, 325 kcal | *pâte* (à tarte, à pizza) | groupe `red_meat` |

**Aucun alias ne peut les corriger** — il ne se déclencherait jamais. Seul un
renommage de slug (`prune` → `dried_prune`, `pate` → `meat_pate`) répare, et
c'est une migration avec ses trois épreuves d'absence (code, `prosrc`, vues).

---

## Ce qui n'a pas été cherché

- **Les alias sémantiquement faux** n'ont pas été audités en masse : les neuf de
  `CORRECTIONS-ALIAS.tsv` sont tombés de l'épreuve de parité, pas d'une passe
  dédiée. Sur 2 601 alias, il y en a très probablement d'autres.
- **La justesse des valeurs nutritionnelles** des 689 lignes non traçables : sans
  code, aucune confrontation à la source n'est possible.
- **Les lignes que personne ne peut écrire** (`queen_vicoria_ananas_flesh`,
  `ananas victoria ou ananas queen victoria pulpe crue preleve a la reunion…`)
  n'ont pas été comptées : il faudrait décider ce que « atteignable » veut dire.
