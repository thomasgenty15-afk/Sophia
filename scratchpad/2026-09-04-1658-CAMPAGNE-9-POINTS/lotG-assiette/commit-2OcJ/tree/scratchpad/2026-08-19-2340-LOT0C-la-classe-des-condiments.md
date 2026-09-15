# LOT 0-C — UN CONDIMENT SANS QUANTITÉ SE PÈSE, IL NE S'IGNORE PAS

**Date** 2026-08-19 23h40 · **Branche** `ff-001-quotidien-du-coach` · **rien n'est commité**
**Master prompt** `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md` §0-C
**Périmètre** `food_composition.ts` + le référentiel. ⛔ `plan_energy.ts` et le générateur
foyer n'ont pas été touchés (lot parallèle).

---

## 1. LE CHIFFRE DE RECETTE

Taux de réponse de `dishEnergy` **après `foldPreparationsIntoDishes`**, sur les
1 204 plats de foyer en base. Tout est **rejoué par `resolveIngredients` sur
l'index vivant** ; rien n'est lu dans `grams_raw`.

```
                              AVANT        APRÈS
plats pliés                    1204         1204
CALCULABLES                     485          667      40,3 % → 55,4 %   +182
  sans aucun ingrédient         140          140
  terme INCONNU                 241          241      ← 0-B, hors de ce lot
  terme connu NON PESÉ          338          156      −182
     dont un DENSE non pesé       5            5      ← l'abstention n'a pas bougé
```

> ### ⚠️ LA CIBLE ≥ 60 % N'EST PAS ATTEINTE : 55,4 %, soit +15,1 points
>
> La simulation qui annonçait 60,7 % (`plie_sim0c.ts`) faisait passer **`pepper`
> et `garlic`** dans sa liste indicative. Les deux sont **refusés ici**, chacun
> par une règle écrite, et le master prompt demandait explicitement de les
> trancher. Chiffré, sur les mêmes 1 204 plats :
>
> ```
> livré (classe telle qu'admise)                    667 / 1204   55,4 %
> + si l'ail entrait à 5 g (UNE GOUSSE, honnête)    667 / 1204   55,4 %  ← refusé
> + si l'ail entrait à 3 g (< une gousse, FAUX)     691 / 1204   57,4 %
> + si « pepper » était aliasé vers black_pepper    722 / 1204   60,0 %  ← §5.1
> + les deux                                        746 / 1204   62,0 %
> ```
>
> **La totalité de l'écart à la cible tient dans ces deux refus.** Le second est
> une décision du lot 0-B que je ne renverse pas seul — voir §5.1, où je rends la
> mesure qui la contredit.

**AVANT est l'index VIVANT dont on retire la colonne du lot** (`--sans-0c`),
jamais un export périmé : la comparaison porte donc sur ce lot seul.

| script (mon scratchpad de session, tous rejouables) | rôle |
|---|---|
| `…-LOT0C-refresh.sh` | ré-export de l'index vivant + des 136 plans de foyer |
| `…-LOT0C-mesure-pliee.ts` | **le chiffre de recette**, `--sans-0c` pour l'avant |
| `…-LOT0C-diff-normalisation.ts` | le diff d'appariement terme par terme (§3) |
| `…-LOT0C-contrefactuels.ts` | ce que coûtent les deux refus |
| `…-LOT0C-diag.ts` | bloqueurs séparés inconnu / non pesé, avec slug et énergie |
| `…-LOT0C-calibrage.ts` | la distribution d'énergie qui dérive le plafond |
| `…-LOT0C-mutations.py` | les 12 mutations (§4) |
| `…-LOT0C-contre-epreuve-base.sh` | la garde SQL, cas qui mordent + cas qui passe |

---

## 2. LA CLASSE — fermée, dérivée, bilingue, et vérifiée par la base

### 2.1 Où elle vit, et pourquoi pas ailleurs

L'appartenance est une **colonne du référentiel** (`food_composition_refs.condiment_grams`),
donc une propriété du **slug**, atteinte par le **résolveur partagé**.

- ⛔ **aucun matcher maison.** Le dépôt a mesuré 12 faux positifs sur 12 avec un
  matcher artisanal (« lait » se trouve dans « laitue »). Le code ne compare
  aucune chaîne : il lit la colonne de la ligne que `resolveIngredient` a rendue.
- ⛔ **`food_group_ref` ne la donne pas**, comme le master prompt le disait : le
  sel et le poivre sont en `sauce_dressing` avec la vinaigrette, la mayonnaise et
  le ketchup ; les herbes fraîches sont en `leafy_greens` avec la laitue.
- ✅ **bilingue sans une ligne de plus**, et c'est la conséquence directe du point
  précédent. `sel`, `poivre`, `ail` sont **déjà** des alias : ils traversent le
  même résolveur et arrivent sur la même ligne. Mesuré sur le corpus réel :
  `sel` ×21 et `poivre` ×21 sont **effectivement pesés par convention**, à côté de
  `salt` ×217 et `black pepper` ×103. Un test dédié compare les deux langues.

### 2.2 La règle d'admission — trois bornes, écrites en SQL *et* en TypeScript

```
① condiment_grams > 0 et <= 5 g       CONDIMENT_MAX_GRAMS
② energy_dense = false                aucune matière grasse, JAMAIS
③ à 3× la masse conventionnelle, <= 10 kcal
                                      CONDIMENT_PLAUSIBLE_MULTIPLE / CONDIMENT_MAX_KCAL
```

**La dérivation du plafond, sur les données.** Sur les 485 plats aujourd'hui
calculables (mesure pliée), la distribution d'énergie est :

```
min 71 · p05 269 · p10 389 · médiane 1086 · p75 1630 · max 8556 kcal
```

10 kcal y valent **3,7 %** au 5e centile et **0,9 %** à la médiane — donc, dans le
pire cas, **moins de la moitié de la bande d'erreur de ±10-15 %** que le
référentiel assume déjà pour lui-même (commentaire de `ML_TO_G`). Un condiment
pesé par convention ne peut pas sortir un plat d'une tolérance déjà supposée.

**Pourquoi la règle est écrite deux fois.** Le CHECK SQL est la bonne place pour
la règle ; mais une ligne écrite AVANT un CHECK survit au CHECK (le dépôt le dit
déjà pour `yield_class` dans `food_composition_io`), et l'index se construit aussi
dans les tests et les rejeux hors base. **Ce qui protège au moment du calcul est
le prédicat `condimentMassFor`**, et la mutation ⑤ le prouve.

### 2.3 Les 17 lignes, et la dérivation de chaque masse

| famille | masse | dérivation |
|---|---|---|
| **la pincée** — `salt`, `black_pepper`, `cumin`, `paprika`, `turmeric`, `cinnamon`, `chilli_powder`, `dried_herbs` | **0,5 g** | une pincée = 1/8 de cuillère à café ; la c. à café du module fait 5 ml (`TSP_ML`), soit 0,625 ml ≈ 0,6 g à `ML_TO_G = 1,0`. Arrondi à 0,5 — le même ordre que les deux conventions **déjà** au référentiel (thym 1 g le brin, laurier 0,2 g la feuille) |
| **la feuille séchée** — `herbs_thyme`, `herbs_bay_leaf` | **leur propre `unit_grams`** (1 g · 0,2 g) | ces lignes portent déjà le poids d'« une ». On ne pose pas un nombre à côté d'un nombre |
| **la petite poignée** — `herbs_parsley`, `herbs_mint`, `herbs_basil`, `herbs_coriander`, `herbs_dill`, `herbs_chives` | **5 g** | garniture d'herbe fraîche ; quelques brins de 1 g. 5 g est aussi `CONDIMENT_MAX_GRAMS` : le condiment le plus lourd qu'on admette |
| **l'eau** | **1 g** | 0 kcal à toute masse. Le petit nombre est **délibéré** : toute masse résolue entre dans le poids cuit qui impute l'huile de friture (12 %, 9 kcal/g). Une convention « une tasse » ferait ~108 kcal d'huile fantôme sur un plat frit |

Les deux familles sont **complètes** : ce sont les 7 assaisonnements secs moulus
de `sauce_dressing` plus le sel, et les 6 herbes fraîches en feuille du
référentiel — dont `herbs_dill` et `herbs_chives`, que le lot 0-B a ajoutées
**exprès** comme précondition de celui-ci. En admettre cinq sur six aurait été le
geste arbitraire.

Pire membre au plafond : la **menthe**, 8,64 kcal à 15 g. Sous les 10.

### 2.4 ⛔ Aucun aliment dans la classe — les refus, chacun avec sa raison

| refusé | plats bloqués | par quelle borne |
|---|---|---|
| **`garlic`** — **le cas limite du lot** | **46** (21 seul obstacle) | ③. Une gousse pèse 5 g, et la ligne **porte déjà `unit_grams = 5`** : elle passe ①. Trois gousses — une recette de foyer ordinaire — font 15 g = **16,6 kcal**. **Le seul moyen d'admettre l'ail est de lui écrire une masse plus petite qu'une gousse, c'est-à-dire une convention fausse.** L'ail est un aliment qu'on mange, pas un assaisonnement qu'on saupoudre. **Refusé par la règle, pas par le goût.** |
| `lemon` (+ `lemon juice`, `lemon zest`) | 36 | ① et ③. `unit_grams` = 60 g : un fruit entier |
| `lettuce`, `celery`, `red onion`, `cucumber`, `courgettes` | 51 | des légumes. ① |
| `stock_cube` (10 g), `vinegar` (15 ml), `soy_sauce`, `mustard`, `ketchup`, `hot_sauce`, `curry_paste` | 0 | ① ou ③ — des sauces qu'on sert à la cuillère, pas qu'on pince. **`vinegar` est un condiment et reste dehors** : sa masse plausible n'est pas une masse d'assaisonnement |
| `olive_oil` et toute la classe dense | — | ② — voir la contre-épreuve |
| `cooked_rice`, `chickpeas`, `tuna`, `pain complet` | 21 | exactement les aliments que le master prompt nomme (38 plats) comme ce qu'une abstention relâchée laisserait tomber |

**Après ce lot, il ne reste PAS UN SEUL condiment dans la liste des termes non
pesés.** Les 156 plats encore bloqués par un terme connu le sont tous par un
**aliment** : ail, citron, cuisses de poulet, laitue, céleri, oignon rouge,
couscous, pain, courgettes, viande hachée, riz, thon, haricots. C'est l'argument
de clôture le plus fort de la classe : elle est **complète pour ce corpus**.

---

## 3. LE DIFF D'APPARIEMENT DES DEUX CORRECTIFS DE NORMALISATION

Deux index construits sur les **mêmes** 923 lignes et 2 587 alias, et **chaque
terme résolu des deux côtés** : les 605 termes distincts du corpus (plats +
préparations), les 2 587 clés d'alias, les 923 slugs.

### 3.1 L'apostrophe typographique — **retenue**, diff nul

```
① LES TERMES DU CORPUS — 605 examinés
   gagnés 0 · PERDUS 0 · DÉPLACÉS 0 · inchangés 605
② LES CLÉS D'ALIAS — 2587 examinés   → 0 / 0 / 0
③ LES SLUGS — 923 examinés           → 0 / 0 / 0
✓ AUCUNE SURPRISE
```

`normalizeTerm` replie U+2018 et U+2019 sur U+0027. **Le gain mesuré est nul, et
c'est normal** : le lot 0-B avait déjà contourné l'unique occurrence
(`huile d’olive`, ×7) par un alias écrit en clair. Le correctif de fond reste
juste — il ferme la porte pour tous les termes à venir, sur une **huile**, le
premier poste de perte d'énergie du produit.

**Une collision de clés est apparue et elle est bénigne** : `huile d'olive` et
`huile d’olive` se replient sur la même clé, **vers le même slug**. (L'autre
collision affichée, `chou fleur` / `chou-fleur`, **préexiste** — c'est la règle du
tiret.) L'alias de contournement du lot 0-B devient redondant ; je ne l'ai pas
retiré, il ne coûte rien.

⚠️ **U+02BC et U+00B4 ne sont PAS dans la liste, et ce n'est pas un oubli** :
`normalizeForMatch` les retire **en amont** comme diacritiques (`d´olive` →
`dolive`). Les y mettre aurait fait une branche morte qui aurait l'air d'une
couverture. C'est un comportement du matcher partagé, hors de ce lot ; un test
l'épingle tel quel.

### 3.2 Le pluriel en « -es » — **mesuré, puis REFUSÉ**

> ### ⛔ LE DIFF CONTENAIT DES SURPRISES. J'ARRÊTE ET JE RAPPORTE.

Le correctif a été écrit (ajouter `-s` seul et `-ies → -y` **après** la forme
existante, donc strictement additif) et mesuré. Résultat : **0 perdu, 0 déplacé,
5 gagnés — dont 4 FAUX.**

| terme | ∅ → | pourquoi c'est faux |
|---|---|---|
| `roasted vegetables` ×8 · `roast vegetables` ×2 · `mixed roast vegetables` ×2 | `vegetable` (moyenne « Vegetable, cooked ») | **DOUBLE COMPTAGE.** 10 de ces 12 lignes portent aussi un `uses` vers la casserole de légumes du **même plat**, et j'ai vérifié que `foldPreparationsIntoDishes` **ajoute** les ingrédients de la casserole aux siens (`meal_verdict.ts:319-336`, aucune déduplication). Le plat passerait d'une **abstention** à un **nombre faux** — l'inverse exact de l'arbitrage de ce module |
| `baguettes` ×1 | `white_bread`, `unit_grams = 35 g` | 35 g est **une tranche**. « 2 unit » pèserait 70 g au lieu de ~500 g : le facteur 7 que le lot 0-B avait explicitement refusé sur le pain |
| `pork sausages` ×1 | `sausage` | le seul gain honnête des cinq |

**Ce que ça dit du référentiel, et c'est le vrai enseignement** : il porte des
**lignes de moyenne** (`vegetable`, `white_bread`) qu'aucune forme fidèle
n'atteint et que **seule une réduction** peut atteindre. Élargir la réduction les
ouvre donc aux **composés du produit** (« roasted vegetables » est un plat de
reprise, pas un aliment).

**Le code a été remis à la règle gourmande d'origine**, avec la mesure écrite
dedans pour que personne ne refasse le tour. La réparation légitime est le double
comptage, là où il vit — dans le pliage —, pas ici.

---

## 4. LES MUTATIONS — 12 tirées, 12 rouges, 0 survivante

`…-LOT0C-mutations.py`, rejouable. Chaque ligne casse **une** chose ; la colonne
de droite nomme le test qui rougit (le plus significatif).

| # | mutation | test rougi |
|---|---|---|
| ① | la classe n'est plus consultée | 6 rouges, dont « un terme SANS quantité est PESÉ » |
| ② | la masse conventionnelle rend 1 g pour tout le monde | « … est PESÉ, pas ignoré » |
| ③ | le plafond d'énergie disparaît (**l'ail entrerait**) | « le plafond refuse l'AIL à sa masse honnête » |
| ④ | la borne des grammes disparaît (**le citron entrerait**) | « les trois bornes … en littéral » |
| ⑤ | **la garde de densité disparaît (l'HUILE entrerait)** | **« CONTRE-ÉPREUVE — une huile sans quantité s'abstient TOUJOURS »** |
| ⑥ | le plafond passe de 10 à 20 kcal | « le plafond refuse l'AIL … » |
| ⑦ | la borne passe de 5 à 60 g | « les trois bornes … » |
| ⑧ | la main généreuse passe de 3× à 1× | « le plafond refuse l'AIL … » |
| ⑨ | la convention écrase la quantité écrite | « une quantité ÉCRITE gagne contre la convention » |
| ⑩ | le compteur `conventionalTerms` n'est plus alimenté | 4 rouges |
| ⑪ | l'apostrophe n'est plus repliée | « l'apostrophe TYPOGRAPHIQUE est la même apostrophe » |
| ⑫ | l'apostrophe est repliée sur une **espace** | idem |

⚠️ **Les seuils sont écrits en LITTÉRAL dans les assertions**, jamais par la
constante importée : ⑥ ⑦ ⑧ sont exactement les mutations qu'un test paramétré par
sa propre constante laisserait passer.

---

## 5. LA CONTRE-ÉPREUVE

### 5.1 L'huile — elle mord, dans le code, en base, et sur le corpus

```
① CODE — resolveIngredients([riz 200 g, salt, olive oil])
     conventionalTerms = ["salt"]          ← la pincée passe
     unweighedTerms    = ["olive oil"]     ← l'huile bloque
     unweighedEnergyDense = true           ← le drapeau se lève
   et c'est STRUCTUREL: condimentMassFor(olive_oil, 0,1 g) = null
                        condimentMassFor(olive_oil,   5 g) = null

② BASE — chaque refus lève la contrainte, chacun par sa borne
     l'AIL à 5 g (une gousse, sa propre unit_grams)          REFUSÉ
     l'HUILE D'OLIVE à 0,1 g                                  REFUSÉ
     le CITRON à 60 g                                         REFUSÉ
     le RIZ CUIT à 5 g                                        REFUSÉ
     une masse nulle ou négative                              REFUSÉ
   et la garde a un cas qui PASSE — une garde cassée bloque tout et
   ressemble à une garde qui marche:
     le paprika à 0,5 g                                       ACCEPTÉ

③ CORPUS — les 1 204 plats
     plats portant un DENSE non pesé:  5 AVANT  →  5 APRÈS   inchangé
```

**Aucune abstention n'est relâchée.** Le nombre de plats bloqués par un terme
inconnu ne bouge pas non plus (241 → 241) : ce lot ne touche que la branche
« résolu mais non pesé ».

### 5.2 Le troisième compteur

`ResolutionResult.conventionalTerms` — le patron est celui de
`unresolvedTerms` / `unweighedTerms`, **étendu**, pas un second jeu de compteurs.
Sans lui, une masse conventionnelle et une masse mesurée sont indiscernables dans
`resolved`, et la classe devient invisible : personne ne peut voir qu'elle a mordu
ni sur quoi. Sur le corpus, il rend :

```
×217 salt · ×103 black pepper · ×68 parsley · ×29 water · ×25 mint
×23 fresh parsley · ×21 basil · ×21 sel · ×21 poivre · ×20 fresh coriander
×16 dill · ×8 flat leaf parsley · ×8 fresh basil · ×7 chives · ×4 dried oregano
```

Pas un aliment dans la liste.

---

## 6. CE QUI A ÉTÉ TOUCHÉ

| fichier | quoi |
|---|---|
| `supabase/migrations/20260819234000_un_condiment_sans_quantite_se_pese.sql` | **neuf** — colonne, CHECK, 17 lignes |
| `_shared/keel/food_composition.ts` | `condimentGrams` sur `CompositionRef` (**requis**, pas `?`), les 3 constantes, `condimentMassFor`, le branchement dans `resolveIngredients`, `conventionalTerms`, l'apostrophe dans `normalizeTerm`, la mesure du pluriel écrite en commentaire |
| `_shared/keel/food_composition_io.ts` | la colonne dans le `select` et dans `toRef` |
| `_shared/keel/food_composition_test.ts` | **+12 tests** (54 au total) |
| `_shared/keel/fixed_intakes.ts` | `condimentGrams: null` sur la ligne synthétique d'un apport déclaré, avec le pourquoi |
| 7 fichiers de tests (`fixed_intakes`, `meal_boxes`, `meal_coverage`, `meal_verdict`, `mouth_energy`, `plan_energy`, `food_composition`) | `condimentGrams: null` dans le constructeur de fixture |

**Le champ est REQUIS et non optionnel** : c'est ce qui a fait remonter au
compilateur les 8 sites de construction. Un `?` n'en aurait montré aucun —
cicatrice répétée du dépôt.

### Lignée et poste

```
ls supabase/migrations | sed 's/_.*//' | sort | uniq -d   →  vide
disque == supabase_migrations.schema_migrations           →  identiques
supabase migration up, et rien d'autre.
PostgREST sert bien la colonne (vérifié par curl: pas de cache de schéma périmé).
Aucune variable SUPABASE_* exportée dans le shell.
```

### Tests

```
deno test --allow-all supabase/functions/_shared/keel/     3 877 passés · 1 rouge
```

⚠️ **Le rouge n'est pas le mien.** `energy_gate_mouth_test.ts` (« les trois portes
neuves n'ont QUE les appelants qu'on a relus ») refuse `keel/mouth_anchor.ts` —
un fichier **non suivi par git, créé à 23h26**, dont l'en-tête dit
« LOT 2 — L'ANCRAGE ABSOLU ». C'est la session parallèle. Aucun de mes fichiers
n'appelle `energySafetyGates`.

---

## 7. CE QUI RESTE OUVERT

### 7.1 ⚠️ `pepper` — une mesure qui CONTREDIT l'arbitrage du lot 0-B. Je ne le renverse pas seul.

C'est **le premier bloqueur du produit** (93 plats pliés) et, après ce lot,
**+4,6 points à lui seul** (667 → 722, soit la cible atteinte). Le lot 0-B l'a
laissé bloqué **exprès** : poivre (330 kcal) ou poivron (26), facteur 13.

**Ce que j'ai mesuré et qu'il n'avait pas** — les formes réellement écrites, et
le voisinage :

```
formes de « pepper » (70 lignes)
   sans aucune quantité               65
   1 tsp                               5     ← une cuillère à CAFÉ : une épice
cooccurrence avec « salt » dans le MÊME plat
   70 / 70                                   ← « salt and pepper »
```

**Sur ce corpus, `pepper` veut dire poivre noir, à 70/70.** Personne n'écrit
« salt » à côté d'un poivron, et personne ne dose un poivron à la cuillère à café.

**Je n'agis pas** : c'est une décision explicite d'un autre lot, sur un terme que
le lot 0-B a nommément renvoyé au lot 0-A (« la consigne doit faire écrire
`black pepper` »). Un alias est global et permanent, et il s'appliquerait aussi
aux plans à venir. Je rends la mesure ; l'arbitrage appartient à l'humain ou au
vérificateur.

### 7.2 La cible ≥ 60 % du LOT 0 reste hors de portée

55,4 % livré. Ce qui reste est dominé par **241 plats à terme inconnu** (0-B a
déjà conclu qu'il n'y a plus de gros lot à prendre côté référentiel : après
`pepper`, le terme le plus coûteux ne bloque que 6 plats à lui seul) et par
**156 plats à aliment non pesé** — `roast chicken thighs` ×26, `garlic` ×46,
`lemon` ×36 —, c'est-à-dire **le lot 0-A**, dont l'effet n'a pas encore été
mesuré sur une génération réelle. La cible ≥ 85 % du LOT 0 demandera les deux.

### 7.3 La masse conventionnelle entre dans l'imputation d'huile de friture

`nutrientsOf` impute 12 % du **poids cuit** en huile sur une méthode frite. Les
masses conventionnelles y entrent comme les autres : 5 g de persil sur un plat
frit ajoutent 0,6 g d'huile, soit ~5 kcal. **34 plats sur 1 204** portent une
méthode de friture. C'est un effet du second ordre, dans la bande d'erreur, et je
ne l'ai **pas** traité : le faire demanderait de distinguer deux sortes de masse
dans `nutrientsOf`, qui est partagé avec la lane du verdict. C'est pour ça que
l'eau est à 1 g et pas à 100 (§2.3).

### 7.4 Trois autres limites, nommées

1. **`lemon zest` (4 plats) se résout sur `lemon`**, le fruit entier. Le zeste
   *est* un condiment (une cuillère ≈ 2 g) ; la réparation honnête est une ligne
   `lemon_zest` au référentiel, pas une masse conventionnelle sur le citron. Non
   fait : 4 plats, et ça relève de la curation du lot 0-B.
2. **La règle est écrite deux fois** (CHECK SQL + `condimentMassFor`). C'est
   délibéré et argumenté (§2.2), mais deux copies d'une même règle peuvent
   diverger. Celle qui gouverne le calcul est celle du code.
3. **Aucun run réel.** Le lot est prouvé sur les tests et sur l'archive rejouée,
   pas sur une génération. ⚠️ Avant tout run réel : `docker restart
   supabase_edge_runtime_Sophia_2` — le runtime sert des `_shared` périmés et un
   fichier modifié n'est **pas** rechargé.
