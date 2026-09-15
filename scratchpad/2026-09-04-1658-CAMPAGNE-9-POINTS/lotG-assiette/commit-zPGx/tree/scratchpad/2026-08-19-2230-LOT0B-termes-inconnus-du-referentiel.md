# LOT 0-B — LES 112 TERMES INCONNUS DU RÉFÉRENTIEL

**Date** 2026-08-19 22h30 · **Branche** `ff-001-quotidien-du-coach`
**Master prompt** `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md` §0-B
**Périmètre** : la base seule. Aucun fichier de code touché, aucun commit.

---

## 1. LE CHIFFRE

Deux dénominateurs, parce que le master prompt en demande deux et qu'ils ne
disent pas la même chose.

### 1.1 Par plat, sans pliage — le compteur du §0-B

```
                          AVANT      APRÈS
plats de foyer             1204       1204
CALCULABLES                 455        603     37,8 % → 50,1 %      +148
termes inconnus distincts   112         56
plats portant ≥1 inconnu    304        120
```

### 1.2 Après `foldPreparationsIntoDishes` — le chiffre de recette du LOT 0

```
                          AVANT      APRÈS
plats pliés                1204       1204
CALCULABLES                 344        485     28,6 % → 40,3 %      +141
termes inconnus distincts   163         83
```

> ### ⚠️ LE PLIAGE FAIT DESCENDRE LE TAUX, IL NE LE FAIT PAS MONTER
>
> Le master prompt demandait d'établir ce point et laissait les deux issues
> ouvertes. **C'est la baisse.** Le vrai point de départ du LOT 0 est **28,6 %**,
> pas 37,8 %. Les 193 plats de reprise récupèrent bien une énergie (140 restent
> sans ingrédient au lieu de 193), mais les casseroles apportent **51 termes
> inconnus de plus** (163 contre 112) et éteignent plus de plats qu'elles n'en
> rallument.
>
> Conséquence pour le pilotage du chantier : la cible **≥ 85 %** est beaucoup
> plus loin qu'elle n'en avait l'air, et 0-B seul ne peut pas y mener.

**Scripts** (mon scratchpad de session, tous rejouables) :

| fichier | rôle |
|---|---|
| `…-LOT0B-refresh.sh` | ré-export de l'index VIVANT depuis la base — à relancer après toute migration |
| `…-LOT0B-mesure.ts` | taux par plat + liste complète des termes inconnus, avec « seul-obstacle » |
| `…-LOT0B-mesure-pliee.ts` | le même, après `foldPreparationsIntoDishes` ; construit l'index AVANT en retirant ce que les migrations ont posé |
| `…-LOT0B-formes.ts` | pour chaque terme inconnu, les `(amount, unit, state)` réellement écrits |
| `…-LOT0B-contre-epreuve.ts` | les quatre épreuves du §4 |

⚠️ **Aucune mesure ne passe par `grams_raw`.** Comme la correction de 22h30 le
disait, cette colonne est figée à la génération. Tout est rejoué par
`resolveIngredients` sur l'index relu en base.

---

## 2. LES TROIS FAMILLES, COMPTÉES SÉPARÉMENT

| famille | compte | ce que ça a coûté |
|---|---|---|
| ① **alias vers une ligne existante** | **79 clés** | zéro nombre créé |
| ② **lignes réellement manquantes** | **12 lignes** | 12 compositions, 5 poids de pièce |
| ③ **composés du produit, ÉCARTÉS** | **26 termes** | rien — ils vont au LOT 1 |
| — **poids de pièce remplis sur des lignes existantes** | **2 colonnes** | 2 conventions écrites comme telles |

Trois migrations, toutes appliquées par `supabase migration up` et rien d'autre :

```
20260819223000_les_termes_que_le_generateur_ecrit_vraiment.sql   +10 lignes, 50 alias, 2 unit_grams
20260819224000_le_pluriel_en_es_ne_se_reduit_pas.sql                        4 alias
20260819230000_les_termes_que_les_casseroles_ecrivent.sql          +2 lignes, 25 alias
```

Lignée vérifiée avant écriture : `ls supabase/migrations | sed 's/_.*//' | uniq -d`
rend vide (aucune version en double), et le disque et
`supabase_migrations.schema_migrations` étaient à jour l'un sur l'autre
(`20260819180000` des deux côtés) avant comme après.

### ② Les 12 lignes neuves, chacune avec son compte

| slug | terme écrit | plats | pourquoi une LIGNE et pas un alias |
|---|---|---|---|
| `plum` | `plums` | 18 | **le piège du lot.** `prune` existe, à **229 kcal**, aliasé « pruneau sec » : c'est le pruneau SÉCHÉ. Y renvoyer `plums` mettait un **facteur 5** sur un fruit frais |
| `lemon_wedge` | `lemon wedge(s)` | 16 | `lemon` porte déjà 60 g — le citron ENTIER. Un quartier n'est pas un citron |
| `hot_sauce` | `hot sauce` | 9 | rien entre `salsa` (36) et `ketchup` (99) ne le couvre |
| `mixed_seeds` | `mixed seeds` | 9 | les 4 graines du mélange sont au référentiel, le mélange non |
| `corn_cake` | `corn cakes` | 8 | ⚠️ `yield_class` **doit** être `neutral` : les 8 plats l'écrivent sans `state`, et `gramsRawOf` refuse un `state` absent dès que le rendement ≠ 1,0 |
| `coconut_yogurt` | `coconut yoghurt` | 4 | entre `plain_yogurt` (59) et `coconut_milk` (188) |
| `sunflower_seed_butter` | `sunflower seed butter` | 3 | purée de graines : `atwater_discount` 1,0 comme `peanut_butter`, pas 0,72 |
| `poppy_seeds` | `poppy seeds` | 2 | famille `nuts_seeds` |
| `turmeric` | `turmeric` | 15 (plié) | famille des épices, dont 6 plats où il est le seul obstacle |
| `herbs_bay_leaf` | `bay leaf/leaves` | 26 (plié) | écrit « n unit » : sans poids de pièce, l'alias ne débloque rien |
| `herbs_dill` | `dill` | 13 | ⚠️ **0 plat aujourd'hui** — voir ci-dessous |
| `herbs_chives` | `chives` | 8 | ⚠️ **0 plat aujourd'hui** — voir ci-dessous |

**L'honnêteté du compte sur `dill` et `chives`.** Le générateur les écrit
**sans quantité** (12 fois sur 13 pour l'aneth). Une fois résolus, ils passent
d'« inconnu » à « non pesé » et le plat **reste bloqué**. Elles sont là comme
**précondition du lot 0-C** : une classe de condiments à masse conventionnelle
ne peut pas s'appliquer à un terme que le référentiel ne reconnaît pas. Ce sont
aussi les deux derniers membres manquants d'une famille déjà fermée (basilic,
coriandre, menthe, persil, thym).

**Toutes en `source = 'manual'`, comme les 30 lignes manuelles déjà en place.**
Écrire `'ciqual'` sans pouvoir citer un `alim_code` vérifié ferait passer un
ordre de grandeur pour une entrée de table officielle.

### Les 5 poids de pièce, écrits comme des CONVENTIONS

| ligne | `unit_grams` | dérivation |
|---|---|---|
| `corn_tortilla_wrap_be` | 30 | tortilla de maïs 15 cm ; les tortillas de BLÉ du référentiel portent déjà 60 g et sont nettement plus grandes |
| `apricot_pitted` | 50 | abricot moyen ~55 g entier, ~50 g dénoyauté ; famille figue 50 · kiwi 80 · clémentine 80 |
| `plum` | 60 | même famille (citron 60 · kiwi 80) |
| `lemon_wedge` | 10 | 1/6 du citron de 60 g **déjà au référentiel** |
| `corn_cake` / `herbs_bay_leaf` | 10 / 0,2 | `crispbread_rye` porte déjà 10 g pour la même forme ; `herbs_thyme` porte déjà 1 g pour un brin |

Les deux `update` sont écrits `where unit_grams is null` : cette migration
**remplit un vide**, elle ne réécrit jamais une valeur posée.

### ③ Les 26 composés du produit, écartés — ils appartiennent au LOT 1

Ce sont des **plats de reprise**, pas des aliments : leur énergie vit dans leurs
casseroles et se récupère par `foldPreparationsIntoDishes`. Une ligne
« braised beef » ferait **double emploi** avec la casserole qu'elle recopie.

```
braised beef (11)            roasted vegetables (8)      lentil tomato sauce (4)
cooked chicken thigh meat(4) fruit salad (2)             chicken bowl portion (2)
tuna pasta (2)               salmon tray portion (2)     shakshuka base (2)
lentil soup (2)              bean filling (2)            mixed roast vegetables (2)
roast vegetables (2)         aubergine lentil stew (2)
chicken courgettes peppers and rice (2)   gluten free ready tomato lentil soup (2)
cooked chicken thighs from the sheet pan (1)   turkey chili (1)   egg muffins (1)
chickpea salad (1)           turkey meatballs (1)        pre cooked rice (1)
cooked beef mince tomato sauce (1)         yogurt dressing (1)
chicken lettuce tomato and yoghurt wraps (1)   chicken beans cucumber and herbs (1)
```

---

## 3. CE QUI RESTE BLOQUÉ EXPRÈS, ET POURQUOI

### `pepper` — tranché, et la décision est **de ne pas trancher**

Poivre (330 kcal/100 g) ou poivron (26) : **facteur 13**, et le terme ne le
lève pas. La mesure, faite des deux côtés :

```
vue par plat : 16 plats, dont  0 où il est le SEUL obstacle
vue pliée    : 93 plats, dont  5 où il est le SEUL obstacle
```

Un alias faux rapporterait **5 plats** et mettrait un facteur 13 sur 88 autres.
**Laissé bloqué.** C'est de très loin le premier terme inconnu du produit une
fois les casseroles pliées, et il appartient au **LOT 0-A** : la consigne doit
faire écrire `black pepper`, que le référentiel connaît déjà.

> Note utile pour 0-A : quand le générateur lève lui-même l'ambiguïté, ça marche.
> `green peppers` est aliasé vers `sweet_pepper_green` dans ce lot sans le
> moindre doute.

### `sourdough bread` — signalé au lot 0-A, comme demandé

Écrit « 1 unit » deux fois et « 8 unit » deux fois **dans les mêmes plans**.
Une tranche pèse 35 g, une miche 800 g : **facteur 20** sur un aliment à
278 kcal/100 g, c'est-à-dire pire que l'abstention qu'il remplacerait.
10 plats, dont 6 où il est le seul obstacle. **Le prompt doit exiger un gramme.**

### Les autres refus, chacun avec sa raison

| terme | plats | pourquoi non |
|---|---|---|
| `cheese`, `hard cheese`, `grated cheese` | 4 | un « fromage » générique couvre 98 (cottage) à 406 (parmesan) ; le référentiel porte **exprès** cheddar, feta, parmesan, mozzarella, chèvre et halloumi séparément |
| `greens`, `seasonal berries` | 4 | trop générique ; aucun aliment désigné |
| `muffin cases` | 1 | **pas un aliment** (des caissettes en papier) |
| `comte or emmental cheese`, `green or brown lentils` | 8 (plié) | l'**alternative disqualifie** — comportement voulu de `AMBIGUITY_MARKERS`, il doit survivre à ce lot |
| `smoked mackerel` | 1 | maquereau fumé ~305 contre cru 194 : **35 % d'écart**, et aucune ligne fumée au référentiel |
| `egg noodles` | 3 | la ligne `noodles` est à **104 kcal** (donnée cuite), les plats l'écrivent « raw » : l'alias sous-compterait d'un facteur 3,4 |
| `sea bass fillets`, `trout fillets` | 2 | écrits « n unit » et aucune de ces lignes ne porte un poids de filet honnête |
| `pain complet grille` | 7 | écrit **sans quantité** dans les 7 plats — un alias n'y changerait rien ; c'est du 0-A |
| `beef strips`, `beef stew meat`, `lamb mince`, `pork mince` | 9 | aucun découpe générique du bœuf/agneau ne couvre la bande 111–201 kcal sans se tromper |
| `baguettes`, `crusty bread`, `burger buns` | 5 | même ambiguïté de pièce que le pain au levain |

---

## 4. LA CONTRE-ÉPREUVE

Sortie complète dans `…-LOT0B-contre-epreuve.txt`. L'index « AVANT » y est
**reconstruit en retirant de l'index vivant exactement ce que les trois
migrations ont posé** — jamais relu d'un export périmé.

```
① MASQUAGE — 430 termes distincts examinés
   null → slug (le gain)         : 61
   slug → null (perte)           : 0   ✓
   slug → AUTRE slug (masquage)  : 0   ✓

② PLATS
   calculables AVANT : 455   APRÈS : 603   gagnés +148   PERDUS : 0  ✓

③ CE QUI DOIT RESTER INCONNU — 16 termes vérifiés, 0 fuite  ✓
   pepper · sourdough bread · comte or emmental cheese · muffin cases · greens
   cheese · seasonal berries · smoked mackerel · sea bass fillets · egg noodles
   braised beef · roasted vegetables · shakshuka base · lentil tomato sauce
   chicken bowl portion · butter or olive oil

④ L'ABSTENTION LÉGITIME MORD ENCORE
   3 plats portent un aliment DENSE sans quantité — les 3 s'abstiennent,
   `unweighedEnergyDense = true` sur les 3.
```

**La garde a un cas qui passe ET un cas qui mord** (une garde cassée bloque tout
et ressemble à une garde qui marche) :

```
tortillas pesées + huile PESÉE       → corn_tortilla=60 g · olive_oil=15 g   CALCULÉ
mêmes tortillas + huile SANS QUANTITÉ → non pesés: [olive oil]  denseNonPesé: true  ABSTENU
plums 4 unit                          → plum=240 g                            CALCULÉ
sourdough bread 4 unit                → inconnus: [sourdough bread]            ABSTENU
```

**Aucun `energy_dense` existant n'a été modifié.** Les 12 lignes neuves posent
le leur en suivant la convention observée du référentiel : `true` pour les
graines et purées de graines (les 4 lignes de graines déjà là le portent),
`false` pour **toutes** les épices — cumin 427, poivre noir 330, paprika 319,
thym 285 le portent toutes à `false`, parce que ce qui sépare le poivre du riz
n'est pas la densité mais la **masse plausible**.

`deno test` sur `food_composition`, `food_composition_io`, `meal_verdict`,
`plan_energy` : **110 passed, 0 failed**.

---

## 5. DEUX DÉFAUTS DE CODE TROUVÉS, NON CORRIGÉS, NOMMÉS

Ni l'un ni l'autre n'a été réparé : `candidateForms` et `normalizeTerm` sont
partagés par les 923 lignes du référentiel, et changer leur règle depuis un lot
de DONNÉES ferait bouger des appariements que personne n'a mesurés. Les deux
sont contournés par des alias écrits en clair.

### 5.1 Le pluriel anglais en « -es » ne se réduit pas

`candidateForms` réduit le pluriel par `replace(/e?s$/, "")` sur le dernier mot.
Le `e?` est optionnel **mais gourmand** :

```
aubergines → aubergin      cherries → cherri       nectarines → nectarin
cakes      → cak           wedges   → wedg         prunes     → prun
```

La réduction est donc **muette sur tout singulier terminé par « e »** — soit une
grosse part du référentiel. J'ai nommé le piège dans la première migration et
j'y suis tombé sur mes deux propres slugs (`corn_cake`, `lemon_wedge`), d'où la
migration `20260819224000`. `prunes` → `prune` ne marche pas non plus
aujourd'hui, et personne ne le sait.

### 5.2 L'apostrophe typographique casse la résolution

```
huile d'olive   (U+0027)  → olive_oil   ✓
huile d’olive   (U+2019)  → INCONNU     ✗
```

`normalizeTerm` déplie les ligatures et remplace `.,;:()-–—` par une espace,
mais laisse l'apostrophe courbe intacte : les deux formes sont deux clés
différentes. **21 plats pliés** portent la forme courbe, et c'est une **HUILE** —
le premier poste de perte d'énergie du produit d'après le master prompt.
Contourné par un alias ; le correctif de fond est une ligne dans `normalizeTerm`.

---

## 6. CE QUI RESTE OUVERT

1. **La cible ≥ 85 % du LOT 0 est hors de portée de 0-B.** Après ce lot,
   **40,3 %** en vue pliée. Le reste est dominé par 0-A (le terme sans
   quantité) et par une longue traîne : dans la vue pliée, le terme le plus
   coûteux après `pepper` ne bloque **que 6 plats à lui seul**. Il n'y a plus de
   gros lot à prendre côté référentiel.

2. **La worklist pliée, pour la suite du LOT 0** (top « seul-obstacle » restants) :
   `turmeric` (traité), `pepper` 5, `sourdough bread` 5, `mild curry powder` 4
   (traité), `chicken mini fillets` 4 (traité), `giant couscous` 3 (traité),
   `chipotle paste` 2, `harissa paste` 2, `beef strips` 2, `wholewheat fusilli` 2
   (traité). Les pâtes de piment (`chipotle`, `harissa`) n'ont **aucune cible
   honnête** au référentiel et sont le prochain candidat sérieux.

3. **`apricot_pitted` porte deux alias contradictoires**, antérieurs à ce lot :
   « abricot denoyaute cru » et « abricot denoyaute **sec** » pointent tous deux
   dessus, alors que `dried_apricot` (241 kcal) existe à côté. Le `unit_grams`
   de 50 g que je pose s'applique donc aussi à la forme sèche. Écart réel faible,
   mais **c'est une erreur préexistante que je n'ai pas corrigée** parce qu'elle
   n'est pas dans mon lot.

4. **Le commentaire de `fixed_intakes_test.ts:649`** cite « 911 références,
   2508 alias » comme un état de base mesuré le 2026-08-13. C'est désormais
   923 / 2586. Sa conclusion de fond (« zéro protéine en poudre au référentiel »)
   reste vraie — je n'ai ajouté aucune. Fichier d'un autre lot, non touché.

5. **Le taux de résolution n'est pas le taux d'exactitude.** Les 12 lignes neuves
   sont des ordres de grandeur assumés, à ±10-15 %, dans la bande que le design
   accepte. La seule où l'enjeu est réel est `mixed_seeds` (580 kcal, énergie
   dense) : elle est calée sur la moyenne de ses quatre composants déjà présents.
