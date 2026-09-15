# LOT 19 — Le référentiel marche-t-il aussi bien en français qu'en anglais ?

**Mesuré le 2026-08-21 sur la base locale, avec le résolveur de production**
(`supabase/functions/_shared/keel/food_composition.ts`, importé — aucune
réimplémentation). Scripts et sorties brutes :
`scratchpad/2026-08-21-0111-LOT19-mesure/`.

---

## 0. Les définitions, avant tout chiffre

> **RÉSOLU** = `resolveIngredient(index, terme)` rend une ligne de
> `food_composition_refs`. Rien d'autre. Ni « à peu près », ni « la bonne
> ligne » — le résolveur n'a aucun moyen de savoir s'il s'est trompé de ligne,
> et **ce chiffre-là ne le sait pas non plus** (§3.4 chiffre ce qu'il ignore).
>
> **DÉNOMINATEUR** = toute chaîne non vide écrite par le modèle en
> `dishes[].ingredients[].term` ou `preparations[].ingredients[].term`, sur les
> **180 plans** de `student_generated_meals` (102 foyer, 78 solo), **sans
> pliage** — plier recopierait les ingrédients d'une casserole dans chaque plat
> qui y touche et gonflerait le pondéré sans rien apprendre.
>
> **= 9 795 lignes d'ingrédient, 716 chaînes normalisées uniques.**
>
> **RÉSOLU ET PESÉ** = résolu, *et* `gramsRawOf` rend un nombre (ou la
> convention des condiments s'applique). C'est ce que la porte du JOUR exige
> réellement — voir §2.
>
> **LA LANGUE EST CELLE DE LA CHAÎNE, décidée à la main.** Les 716 chaînes ont
> été lues une par une ; les françaises et les *neutres* (même suite de lettres
> dans les deux langues : `couscous`, `feta`, `paprika`, `courgette`,
> `aubergine`, `steak`…) sont énumérées en clair dans
> `2026-08-21-0111-LOT19-mesure/lang.ts`. Tout le reste est anglais. Aucune
> fiche n'a servi : `content_locale` dit `fr-US` sur le seul plan français, et
> deux plans marqués `en` / `en-GB` portent chacun un terme français.

---

## 1. Le taux de résolution par ingrédient, FR et EN séparément

### Corpus entier — 180 plans, deux lanes

| langue | occurrences | résolues | **taux pondéré** | uniques | résolues | **taux unique** |
|---|---:|---:|---:|---:|---:|---:|
| **anglais** | 9 075 | 8 628 | **95,1 %** | 638 | 461 | **72,3 %** |
| **français** | 77 | 75 | **97,4 %** | 37 | 35 | **94,6 %** |
| neutre | 641 | 632 | 98,6 % | 39 | 34 | 87,2 % |
| mixte | 2 | 1 | 50,0 % | 2 | 1 | 50,0 % |
| **TOTAL** | **9 795** | **9 336** | **95,3 %** | **716** | **531** | **74,2 %** |

Par lane : solo **93,4 %** pondéré / 71,4 % unique · foyer **96,5 %** / 85,1 %.

### ⛔ Ce tableau ne répond PAS à la question, et il faut le dire tout de suite

**Tout le français du corpus vivant tient dans UN plan.** Sur 151 plans porteurs
d'ingrédients, **un seul** compose en français (`54123905`, foyer, 2026-08-13) :
75 de ses 83 lignes, 43 chaînes uniques. Les deux autres « plans français »
portent un terme chacun (`herbes de provence`).

Un taux français de 97,4 % sur 77 occurrences n'est pas un taux, c'est **une
observation sur une génération**. Et son vocabulaire est le noyau de cuisine
(`sel`, `poivre`, `citron`, `oignon`, `ail`, `carottes`) — exactement la part
que les alias français de l'import CIQUAL couvrent le mieux.

Le taux **unique** anglais (72,3 %) est bas pour une raison qui n'a rien à voir
avec le vocabulaire : les chaînes anglaises longues (`cooked chicken thigh and
pepper batch`, `wholemeal bread with allergy label checked`) sont des **défauts
d'écriture**, pas des trous de référentiel. Voir §4.

**⇒ Pour répondre à la question, il a fallu une seconde mesure. Elle est en §3.**

---

## 2. La journée, et le taux recalculé

### Le nombre médian d'ingrédients par journée (après pliage des préparations)

| | journées | **médiane** | moyenne | min | max |
|---|---:|---:|---:|---:|---:|
| solo, tous plans | 248 | **21,5** | 20,8 | 2 | 49 |
| foyer, tous plans | 303 | **29** | 33,1 | 4 | 155 |
| solo, plans vivants | 53 | 26 | 27,0 | 6 | 49 |
| foyer, plans vivants | 77 | **29** | 35,5 | 12 | 138 |

### Le recalcul `p^n` — et pourquoi il ne retombe pas

⚠️ **La porte du jour n'est pas à 80 %.** `dishEnergy` exige **zéro** terme non
résolu **et zéro** terme non pesé (`plan_energy.ts:233-238`), et un jour n'est
complet que si **tous** ses plats le sont. C'est donc `p^n` sur *résolu **et**
pesé*, pas sur *résolu*.

Plans vivants (dénominateur foyer identique à celui de
`DESIGN-CALCUL-ET-COMPOSITION` §3.1 : **77 journées**) :

| lane | p(résolu) | p^n | p(résolu **et pesé**) | p^n | **journées complètes observées** |
|---|---:|---:|---:|---:|---:|
| foyer | 96,1 % | 31,7 % | 90,5 % | **5,5 %** | **18/77 = 23,4 %** |
| solo | 91,9 % | 11,0 % | 52,0 % | 0,0 % | **5/53 = 9,4 %** |

**`p^n` sous-estime d'un facteur 4.** Ce n'est pas un défaut de la mesure, c'est
la démonstration que **les échecs ne sont pas indépendants** — ils se groupent
par PLAN :

```
lane solo   — part des lignes PESÉES, par plan (54 plans)
   0-20 % : 27      20-40 % : 7    40-60 % : 0   60-80 % : 3   80-100 % : 17
lane foyer  — part des lignes PESÉES, par plan (97 plans)
   0-20 % :  0      20-40 % : 0    40-60 % : 0   60-80 % : 3   80-100 % : 94
```

Le solo est **bimodal** : un plan écrit des quantités partout, ou nulle part.
La cause est datée : `meal.en.v1_doctrine`, `v2_batch` et `v3_preparations`
écrivent **100 % de leurs ingrédients sans `amount` ni `unit`** (2 491 lignes).
Les versions récentes tombent à 0-9 %. **Ce n'est pas un défaut vivant du
produit, c'est un corpus qui traîne trois générations mortes.** Sur les plans du
2026-08-12 ou après, la journée solo complète passe à **42/72 = 58,3 %**.

### La réconciliation avec les 11,7 % / 2,9 % du design

Ces chiffres se reproduisent exactement **en désarmant la convention des
condiments** (lot 0-C) : **7/77 = 9,1 %** en foyer, **1/53 = 1,9 %** en solo.
La mesure du design est donc *antérieure* au lot 0-C.

> **⇒ Le chiffre du design est périmé. La classe des condiments a doublé le taux
> journée** (9,1 → 23,4 % en foyer). Il reste très bas, mais **ce qui l'écrase
> n'est pas le référentiel** : à 96,1 % de résolution, ce sont les **2 689
> lignes résolues et non pesées** (27,5 % du corpus) qui décident — l'huile
> d'olive ×172, le citron ×126, le yaourt grec ×103, l'ail ×90.

---

## 3. La réponse : **oui, le français est désavantagé — de 17,3 points**

### 3.1 Pourquoi il a fallu construire la mesure

Le corpus ne porte qu'un plan français. Une comparaison honnête demandait donc
**la même règle de construction des deux côtés** :

> Pour chacun des **150 aliments que les plans RÉELS atteignent le plus
> souvent**, on écrit **le nom nu** — celui qu'on met sur une liste de courses —
> **une fois en anglais, une fois en français**, les deux colonnes écrites en
> même temps, aliment par aliment. Pas de qualificatif, pas de forme de rayon.
> Puis on passe les 300 chaînes au vrai résolveur.

Le tableau complet des 150 paires est dans
`2026-08-21-0111-LOT19-mesure/nom-nu.txt` : il est **contradictoire ligne à
ligne**, ce qui est le seul garde-fou contre une colonne écrite plus gentiment
que l'autre.

### 3.2 Le résultat

| langue | **bon aliment** | AUTRE aliment | RIEN |
|---|---:|---:|---:|
| **anglais** | **150 / 150 = 100 %** | 0 | 0 |
| **français** | **124 / 150 = 82,7 %** | **9 = 6,0 %** | **17 = 11,3 %** |

**Écart : 26 aliments, 17,3 points.**

Et l'anglais ne doit pas ce 100 % à un effet de sélection : **14 des 150 formes
anglaises n'apparaissent nulle part dans le corpus** (`chicken thigh`, `tortilla
wrap`, `cod`, `jam`, `apricot`, `coffee`, `sausage`, `radish`…) — **14 sur 14
résolvent quand même.**

### 3.3 Pourquoi « 2,8 formulations par aliment » ne dit rien de l'égalité

Les 709 alias « français » et 692 « anglais » ne jouent pas le même rôle :

- **L'anglais a DEUX portes.** `resolveIngredient` essaie `bySlug` *avant*
  `byAlias`, et **les slugs sont anglais** (`chicken_thigh`, `olive_oil`). Les
  923 lignes ont donc, par construction, un nom anglais atteignable sans aucun
  alias. **Le français n'a que la porte des alias.**
- **Les alias français de l'import sont ADMINISTRATIFS, pas culinaires.** Ils
  viennent de la colonne FR de CIQUAL : `agneau cote decouverte crue`, `agneau
  gigot roti cuit au four`, `abricot denoyaute sec moelleux`. Trois « formulations »
  du gigot d'agneau — et aucune ne s'écrit `gigot d'agneau`.
- La médiane est **2 alias par ligne**, pas 2,8 (moyenne tirée par une queue à
  32). **618 lignes sur 923 (67 %) en ont deux ou moins.**

### 3.4 Le pire cas n'est pas l'absence, c'est **la mauvaise ligne**

9 des 150 noms français atteignent **un autre aliment**, en silence. Trois
familles, toutes vérifiées :

**① `complet` est un modificateur, et il change l'aliment.** La liste FERMÉE de
`PREPARATION_MODIFIERS` contient `complet/complete/complets/completes`, ajoutés
le 2026-08-20 « par symétrie » avec `whole`. Mais `whole` est protégé en
anglais : `wholemeal`, `wholegrain`, `wholewheat` sont **un seul mot**. En
français, `complet` est un mot séparé — donc il **tombe**, et la forme réduite
atterrit sur la version RAFFINÉE :

| écrit par le modèle | atteint | devrait atteindre |
|---|---|---|
| `pain complet grillé` (**7 occurrences réelles**) | `white_bread` (refined, 278) | `wholemeal_bread` (whole, 262) |
| `tortilla complète` | `white_bread` | `tortilla_wholemeal` (whole, 290) |
| `pain pita complet` | `pita_bread` (refined) | `pita_wholemeal` (whole) |
| `semoule complète` | `couscous` (refined) | `couscous_wholemeal` (whole) |

**Le groupe bascule `whole_grain` → `refined_grain` sans que rien ne le dise.**
`pain complet` seul s'en sort parce qu'il est écrit en alias ; **il suffit d'un
mot de plus pour que la garde saute**.

Épreuvé sur toute la table : **38 réductions latentes changent l'aliment**
(`dried apricot`→abricot frais ×5,3 kcal · `tomato dried in oil`→tomate ×9,7 ·
`lentilles cuites`→lentilles sèches ×3,2 · `raisin frais`→raisin sec ×4,7 ·
`ground beef`→bœuf braisé ×1,8). Détail : `07-modificateurs.ts`.

**② Un faux ami au niveau du SLUG, donc irréparable par un alias.**
`prune` **est un slug** (« Prune », 229 kcal — le fruit SEC). `bySlug` gagne
toujours : **aucun alias `prune → plum` ne pourra jamais se déclencher.** Le mot
français de la prune fraîche (46 kcal) est occupé par l'anglais du pruneau.
**×5 d'énergie, et seul un renommage de slug peut le réparer.** Même piège en
germe sur `pate` (le slug est le PÂTÉ de viande, 325 kcal).

**③ Des alias existants pointent sur la mauvaise ligne.** Neuf cas vérifiés,
dont : `wrap` → `white_bread` (**20 occurrences réelles** ; `white_bread` porte
`unit_grams` = **35 g, UNE TRANCHE**, donc « 2 wraps » pèse 70 g au lieu de
120 g), `pitta` → `white_bread`, `toast` → `white_bread`, `oignon rouge` →
`onion` alors que le **pluriel** `oignons rouges` pointe correctement sur
`red_onion`, `semoule complete` → `couscous` raffiné. Fichier :
**`2026-08-21-0111-LOT19-CORRECTIONS-ALIAS.tsv`**.

### 3.5 Et les 15 lignes « sans aucun alias » ?

**« Sans alias » ne veut pas dire « inatteignable ». Ça veut dire « atteignable
en anglais seulement ».** Éprouvé une par une :

- **Les 15 se résolvent en anglais** par leur seul slug (`bagel`, `bread`,
  `bresaola`, `bulgur wheat`, `coppa`, `galantine`, `hot sauce`, `mixed seeds`,
  `naan bread`, `pate`, `plum`, `poppy seeds`, `salami`, `sunflower seed
  butter`, `turmeric`).
- **En français, 9 des 15 sont hors d'atteinte ou fausses** : `curcuma` ∅,
  `graines de pavot` ∅, `sauce piquante` ∅, `graines mélangées` ∅, `pain naan` ∅,
  `purée de graines de tournesol` ∅, `pain` → *pain blanc*, `prune` → *pruneau*,
  `boulgour` → l'autre moitié du doublon `bulgur` / `bulgur_wheat`.

---

## 4. Le top 30 des chaînes qui ratent, avec leur langue

**459 occurrences non résolues (4,7 %), 185 chaînes uniques.** Elles se
répartissent en **cinq classes**, et une seule appelle des alias :

| classe | occ. | uniques | quoi faire |
|---|---:|---:|---|
| aliment absent du référentiel ou mal nommé | **317** | 116 | alias, ou nouvelle ligne CIQUAL |
| plat composé, pas un aliment | 50 | 27 | ⛔ ne rien faire |
| **consigne du prompt recopiée dans le terme** | **41** | 19 | ⛔ défaut de PROMPT |
| renvoi à une préparation (déjà plié par `uses`) | 27 | 11 | ⛔ un alias DOUBLERAIT le comptage |
| alternative (« X or Y ») | 24 | 12 | ⛔ refus par conception |

| occ. | langue | chaîne | verdict |
|---:|---|---|---|
| 98 | en | `pepper` | ⛔ **AMBIGU** — poivre (330 kcal) ou poivron (26) ? À trancher au prompt, pas ici. **21 % de tous les ratés tiennent sur ce seul mot.** |
| 11 | en | `egg noodles` | ⚠️ bloqué : la ligne `noodles` est fausse (§6-D) |
| 11 | en | `braised beef` | ✅ alias → `beef_braising` |
| 10 | en | `sourdough bread` | ⚠️ aucune ligne de pain au levain |
| 10 | en | `roasted vegetables` | ⛔ plat de reprise ; 10 des 12 lignes portent aussi un `uses` |
| 10 | en | `cooked chicken thigh meat` | ✅ alias → `chicken_thigh` |
| 7 | en | `plain greek yogurt with allergy label checked` | ⛔ **prompt** |
| 5 | en | `butter or olive oil` | ⛔ alternative |
| 5 | en | `tuna tins` | ✅ alias → `tuna_tinned` |
| 5 | en | `turkey chilli` | ⛔ plat composé |
| 4 | en | `sesame free chipotle paste` | ⚠️ aucune ligne de chipotle |
| 4 | en | `green or brown lentils` | ⛔ alternative |
| 4 | en | `cooked chicken thigh and pepper batch` | ⛔ renvoi à une préparation |
| 4 | en | `butter or oil` | ⛔ alternative |
| 4 | en | `grated cheese` | ⚠️ aucune ligne « fromage (moyenne) » |
| 4 | en | `greens` | ⛔ ambigu (laitue ? chou ? kale ?) |
| 4 | en | `roast vegetables` | ⛔ plat de reprise |
| 4 | en | `lamb mince` | ✅ alias → `lamb` |
| 4 | en | `cooked chicken thighs from preparation` | ⛔ renvoi |
| 4 | en | `wholemeal bread with allergy label checked` | ⛔ **prompt** |
| 4 | en | `lentil tomato sauce` | ⛔ plat composé |
| 3 | en | `beef strips` | ⛔ coupe indéterminée |
| 3 | en | `wholemeal bread confirmed safe for your allergy` | ⛔ **prompt** |
| 3 | en | `wholegrain crackers` | ⚠️ seule ligne : `wheat_crackers`, RAFFINÉE |
| 3 | neutre | `tzatziki` | ⚠️ absent du référentiel |
| 3 | en | `wholemeal bread without added sweetener` | ⛔ **prompt** |
| 3 | en | `turkey chili from batch` | ⛔ renvoi |
| 3 | en | `fajita seasoning` | ⚠️ absent |
| 3 | en | `marinara sauce` | ⛔ ≠ passata (l'huile) |
| 3 | neutre | `farro` | ⚠️ absent |

> **Aucun terme français n'entre dans ce top 30.** Les deux seuls ratés
> français du corpus sont `pommes de terre nouvelles` (1) — proposé — et
> `pâte brisée` (1) — aucune ligne de pâte brisée au référentiel.

---

## 5. Le fichier de propositions

**`2026-08-21-0111-LOT19-PROPOSITIONS-ALIAS.tsv` — 86 alias, vérifiés un par
un.** Chaque ligne porte : l'alias, le slug visé, **le libellé CIQUAL réel**, le
`ciqual_code`, le groupe, l'énergie, **ce que la chaîne atteint aujourd'hui**, et
la raison.

Chacun passe cinq épreuves automatiques (`09-verifier-propositions.ts`) : la
ligne visée existe · l'alias n'existe pas déjà · il n'est pas **mort** (une forme
qui est aussi un slug ne se déclencherait jamais, `bySlug` gagne) · on sait ce
qu'il déplace · après ajout il atteint bien la ligne visée. **3 propositions ont
été écartées par ces épreuves** — et deux d'entre elles ont révélé un alias
existant FAUX (`oignon rouge`).

Priorité 1 → les 15 lignes sans alias (18) · Priorité 2 → ce qui rate dans les
plans réels (15) · Priorité 3 → le nom français des aliments réellement cuisinés
(45) · Priorité 3bis → formes anglaises manquantes ou fausses (8).

**⛔ Rien n'a été appliqué.** La migration s'écrit après revue. Aucune valeur de
composition n'est proposée : **86 noms, zéro kcal.**

### La cible de 8 formulations par aliment — ce que j'en fais, et ce que je refuse

Passer 923 lignes de 2,8 à 8 formulations demande **+4 800 alias**. Je n'en
livre pas 4 800, et c'est un choix, pas un abandon : le prompt le dit lui-même —
*« un alias plausible qui n'a pas été vérifié est un alias faux qui n'a pas
encore été découvert »*. Les 86 livrés sont vérifiés ; 4 800 ne pourraient pas
l'être dans cette passe.

**Et un obstacle dur s'y oppose aujourd'hui** : **689 des 923 lignes se
déclarent `source = 'ciqual'` sans porter ni `ciqual_code` ni `ciqual_name`**
(§6-G). Pour ces lignes, « vérifier contre la ligne CIQUAL réelle » est
**impossible** — il n'y a rien à joindre. Reconstituer les codes de l'import
est le préalable de toute génération d'alias en masse.

---

## 6. Les lignes CIQUAL abîmées

Détail complet : **`2026-08-21-0111-LOT19-CIQUAL-LIGNES-ABIMEES.md`**. En
résumé, **692 lignes sur 923 portent au moins un défaut** — mais **18
seulement** hors traçabilité :

| | classe | lignes |
|---|---|---:|
| **A** | libellé **tronqué** à 78 caractères, coupé en plein mot | **11** |
| **B** | mot **collé** dans le libellé *et* dans le slug (`cabbageor`) | **1** |
| **C** | **faute de frappe** venue de la source (`Brear`, `Vicoria`) | **2** |
| **D** | **valeur incohérente avec la classe de rendement** : `noodles` = 104 kcal (valeur CUITE) en `grain_absorbs` → une portion de nouilles se compte **3,3× trop légère** | **1** |
| **E** | **doublon** de fait : `bulgur` (351) et `bulgur_wheat` (347) | **2** |
| **F** | ligne **non alimentaire** : `paraffin_oil`, 0 kcal | **1** |
| **G** | **`source='ciqual'` sans `ciqual_code` ni `ciqual_name`** — invérifiable contre la source | **689** |
| **H** | **faux amis au niveau du SLUG** : `prune` occupe le mot français du fruit frais ; `pate` occupe celui de la pâte | **2** |

Bonne nouvelle mesurée : **aucun mojibake**, **aucun libellé en double**,
**aucune macro NULL**, **aucun alias orphelin**.

---

## 7. Ce que je n'ai pas pu mesurer, et pourquoi

1. **Le vrai taux de résolution du français sur des données observées.** Il
   n'existe qu'**un** plan français en base. Les 17,3 points d'écart de §3
   viennent d'une épreuve **construite** (assumée, et contradictoire des deux
   côtés) — pas d'une observation. **La mesure qui trancherait est un run
   réel : dix générations en `fr-FR`, foyer et solo.** Rien d'autre ne la
   remplace.
2. **La justesse des résolutions.** 95,3 % dit « une ligne a été trouvée », pas
   « la bonne ». §3.4 montre que le taux d'erreur silencieuse n'est pas nul
   (6,0 % des noms français tombent sur un autre aliment). **La même mesure du
   côté anglais n'a pas été faite** : il faudrait relire à la main les 531
   chaînes résolues du corpus, ce que cette passe n'a pas fait.
3. **La couverture française des 923 lignes.** Elle n'a été éprouvée que sur les
   **150 aliments les plus fréquents** (sur 198 atteints par le corpus, sur 923
   au total). Rien ne dit que le reste se comporte pareil — mais le mécanisme
   décrit en §3.3 (une porte contre deux) vaut pour toute la table.
4. **La qualité nutritionnelle des 689 lignes non traçables** (§6-G). Sans
   `ciqual_code`, aucune valeur ne peut être confrontée à sa source.
5. **La part des ratés qui viendrait d'un défaut de PROMPT plutôt que de
   référentiel** est chiffrée (142 occurrences sur 459, classes ⛔ du §4), mais
   je n'ai pas mesuré **ce que le prompt gagnerait à être corrigé** : il faut un
   run, et je n'en ai lancé aucun.
6. **`pepper` (98 occurrences, 21 % des ratés)** n'est pas mesurable, c'est un
   arbitrage : poivre ou poivron. Je le laisse ouvert — le résoudre à l'un des
   deux serait très exactement la devinette que `resolveIngredient` interdit.

---

## Ce que je referais en premier, si un seul geste était possible

Ni les alias ni le prompt : **`complet`**. Retirer les quatre formes
`complet/complete/complets/completes` de `PREPARATION_MODIFIERS` — et écrire à
la place les alias `pain complet grillé`, `tortilla complète`, `pita complet`,
`semoule complète`. Elles sont entrées le 2026-08-20 pour une symétrie qui
n'existe pas (l'anglais dit `wholemeal` en un mot), et **elles font basculer le
groupe `whole_grain` → `refined_grain` en silence, dans la seule langue où le
mot se sépare.** C'est la seule des trois familles du §3.4 qui soit à la fois
systématique, française, et réparable dans un fichier.
