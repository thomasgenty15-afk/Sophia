# JOURNAL DU BANC SOLO — méthode de génération de plan solo

Chantier : `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`.
Foyer : `qa-solo-hh@keeltest.dev` — **une bouche**, entretien, 170 cm / 70 kg /
homme / né 1990-03-15 / `trains_some`, rythme `breakfast, lunch, snack_pm,
dinner` **sans taille**, dîner **léger** avec du **pain** à côté, shaker de
120 kcal / 24 g au `snack_pm`.

Une ligne par tir. `codeprint` est l'empreinte du code au moment de la mesure —
d'autres sessions écrivent sous `supabase/functions/`.

| date | lot | empreinte | fuseau · heure | http · s | fenêtre demandée | fenêtre rendue | timing | plats | verdicts |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-07 18:03 | **0 · BASE** | `6659cef7547a` | `America/Sao_Paulo` 13:03 | 200 · 90,1 s | `exact` 2026-09-08 × 1 j | `2026-09-07` × **2 j** | `day_before`, veille = 2026-09-07 | **4**, tous `tue` (= demain) | `15-verif` **vert** · `lead_day` non nul · plats sur demain seulement ✓ |

Fichiers : `plan-BASE-20260907-180319.json`, `log-BASE-20260907-180319.txt`,
`prompt-BASE-20260907-180319.json`, `energie-BASE-20260907-180319.json`.

---

## Ce que le tir BASE établit, et qui n'était pas dans le plan

### ① Le modèle ne livre AUCUNE boîte, et rien ne lui en demande

`box_counts.boxes = {meals: 2, with_box: 0, boxes: 0, expected: 2, delivery:
"none_delivered"}`. Et le bloc de schéma des boîtes n'atteint le modèle **ni par
le message système, ni par le message utilisateur** (`ONE BOX PER GROUP` /
`THE MEMBER IDS` : absents des deux, vérifié sur l'archive).

⛔ **Conséquence pour le plan, à corriger dans deux checkpoints** :

- Lot 2 attend « journal `box_sizing` **identique** au tir BASE ». Au BASE ce
  journal est **entièrement à zéro** (`boxes 0 · sized 0 · anchor.anchored 0 ·
  unmet.none 0 · densify.mouth_days 0`). Deux tableaux de zéros sont identiques
  sans rien prouver : **cette comparaison ne vaut rien telle quelle**. Ce qui
  vaut, au Lot 2, c'est que le tag `portion_sizing` apparaisse avec
  `applied:false` et des `rows` lisibles — pas l'immobilité d'un journal vide.
- Lot 4 comptait sur le legacy comme « instrument de vérification gratuit »
  (`anchor.raw ≈ 1`, `would_resize.boxes = 0`, `pot_growth.short_after = 0`,
  `unmet.none = journées`). ⚠️ **Cet instrument est muet tant qu'il n'y a pas de
  boîtes.** Il ne devient parlant qu'**au Lot 4 lui-même**, quand le moteur les
  autore — il ne peut donc pas servir de témoin *avant/après* sur cette fixture.
  Il reste un contrôle interne au Lot 4, pas une ligne de base.

### ② Le moteur attend deux repas AUJOURD'HUI que le plan ne prévoyait pas

Demandé : `exact`, `starts_on = demain`, `duration_days = 1`. Rendu :
`window = {starts_on: 2026-09-07, duration_days: 2}`.

`meals_delivered = {mouths: 1, expected: 6, fed: 4, missing: 2, by_cause:
{no_dish: 2}}` et `rehomed.not_rehomed = ["mon/snack_pm:no_dish", "mon/dinner:
no_dish"]`. Le tir est parti à 13:03 locales : les créneaux **restants
d'aujourd'hui** (`snack_pm`, `dinner`) sont comptés comme des repas **attendus**,
pas comme une veille de cuisine.

⚠️ Le plan écrit « veille = aujourd'hui (`cookOnlyDay`) […] repas demain
seulement ». C'est vrai des plats **livrés** (4/4 sur demain, ✓) et **faux de ce
que le moteur attend** (6 cellules, dont 2 aujourd'hui). Deux `missing` par tir
sont donc le **régime normal** de ce banc, pas un défaut à réparer — sauf à
lancer après 18 h, ce que la garde du banc interdit pour une autre raison.

### ③ La moitié des plats n'a pas de kcal lisible

2 plats sur 4 rendent `standard_kcal = null` (`dishEnergy` s'abstient :
`unknown_ingredient`). `dishEnergy` rend `null` plutôt qu'une somme amputée, et
c'est la bonne règle — mais ça veut dire qu'au BASE **le déjeuner et le dîner,
les deux seuls plats à casseroles, ne portent aucune énergie**. Les deux plats
lisibles sont le petit-déjeuner (618 kcal / 460 g / 134 kcal·100 g⁻¹) et la
collation (158 kcal / 170 g / 93 kcal·100 g⁻¹).

⚠️ À surveiller au Lot 2 : `measured / dishes ≥ 0,8` (checkpoint du Lot 3) est
**hors de portée** si la résolution du référentiel reste à ce niveau sur ce
foyer. `unmeasurable_by` devra le ventiler.

### ④ `shopping_list` est vide (0 ligne) au BASE

Rien à comparer pour le Lot 4 (« Σ courses = Σ crus ±2 % ») tant que la liste
ne sort pas. `pot_shrink.lines_unattributed = 0` mais aussi
`lines_scaled = 0` — le dénominateur est nul.

### ⑤ `prompt_version` n'est pas dans l'archive du prompt

Il est écrit dans `generated_from` (`index.ts:10243`), donc **uniquement sur un
tir `--write`**. Le checkpoint du Lot 3 (« `prompt_version` finit par
`household.v33_…` ») demande donc un `--write`, ou se lit sur le **texte** du
prompt. Le lecteur le dit maintenant au lieu d'imprimer `None`.

### ⑥ La ligne de corps du brief, telle qu'elle est aujourd'hui

Message **utilisateur**, cible exacte du Lot 3 :

    — eats at breakfast, lunch, snack_pm, dinner only [height 170 cm; age band
      30 to 44; gender male; weight 70 kg, measured week of …]

Sous `portion_v1` elle doit devenir `— eats at breakfast, lunch, snack_pm,
dinner (light) only`, sans crochet.

⚠️ La première sonde du lecteur (`\bweight \b`) attrapait **trois phrases de
prose du système** (« that weight moves to the protein food ») et annonçait une
fuite de corps qui n'existait pas. Elle est resserrée sur la signature réelle
(`\[height \d+ cm`, `age band \d`, `weight \d+ kg`). Douzième cas de la règle
« jamais de matcher maison ».

---

## Ligne de base des contrôles de prompt (lot 3)

| contrôle | attendu au lot 3 | **au BASE** |
|---|---|---|
| « ONE standard recipe » | présent | ⛔ absent |
| plancher `100 kcal per 100 g` | présent | ⛔ absent |
| créneau `(light)` | présent | ⛔ absent |
| faits de corps `[height … kg]` | absent | ⛔ **présent** (message utilisateur) |
| `ONE BOX PER GROUP` / `THE MEMBER IDS` | absent | ✓ absent (déjà, à une bouche) |
| kcal hors les deux planchers | 0 | ✓ 0 |
| le shaker dit au modèle | présent | ✓ présent |

Les quatre premiers rouges **sont** la ligne de base : c'est ce que le Lot 3
fait basculer.

---

# LOT 1 — le rendement par aliment entre au référentiel (2026-09-07)

Migration `20260907160000`. Colonnes `yield_factor` + `yield_factor_source`,
trois CHECK, cinq lecteurs rerouté sur `yieldFactorOf`, **six** lignes seedées.

| | |
|---|---|
| tests Deno | **5 795 passés / 0 échec** (5 778 avant le lot ⇒ **+17**) |
| vitest | **2 350 / 0 rouge** |
| gate | vert sauf eslint, **sur un fichier qui n'est pas le mien** (voir ⑤) |
| gardes de la base | **6 refus sur 6**, + contre-épreuve qui passe |
| garde de source | prouvée par mutation (rouge sur `box_densify.ts`, restaurée par `cp`) |

## ⛔ ① SIX LIGNES SUR VINGT-HUIT, ET C'EST LA RÈGLE DU PLAN QUI L'A DÉCIDÉ

Le plan nommait 28 slugs et posait : « *chaque valeur transcrite d'une table
nommée […] ; source introuvable ⇒ la ligne reste NULL* ».

- **6 viandes transcrites** de l'**USDA Table of Cooking Yields for Meat and
  Poultry, Release 2** (ARS/USDA, sept. 2014), fichier `.xlsx` officiel,
  175 lignes, colonne « Cooking Yield % ». Chaque valeur cite **son NDB et sa
  méthode** : `chicken_breast` 0,72 (5060), `chicken_thigh` 0,69 (5094),
  `beef_mince` 0,73 (23563, bande *low fat* — le libellé du référentiel dit
  « 5 % »), `beef_braising` 0,71 (13373, *chuck arm pot roast*),
  `pork_loin` 0,77 (10039), `pork_chop` 0,76 (10179).
- **2 poissons NULL** : cette table couvre « meat and poultry » et porte
  **0 ligne de poisson sur 175** (vérifié, pas supposé).
- **20 céréales / légumineuses / légumes NULL** : leur source désignée est
  l'**USDA Agriculture Handbook 102** (éd. 1975), qui n'existe qu'en fac-similé
  numérisé — aucune version lisible par machine. ⛔ **Et c'est la population où
  l'écart de classe est le plus grossier** (le doc le dit : pâtes 2,2 vs 2,6,
  épinards −30 à −40 % contre 0,9). Ce lot livre donc la **mécanique entière**
  et **la plus petite part de la matière**. Le reste demande la table, pas une
  session de plus.

## ⛔ ② LE CHECK REFUSE LES QUATRE LIGNES QUI RÉHYDRATENT — c'est voulu

`potato_flakes`, `potato_flakes_milk_cream`, `shiitake_mushroom`, `tapioca`
sont en `veg_shrinks` et **gagnent** de l'eau. `_agrees_with_class_check`
(`*_shrinks ⇒ < 1`) leur refuse un facteur > 1. Ce n'est pas un trou : elles
demandent d'abord un changement de **classe**, c'est-à-dire la fiche `L-C-b`.
Écrit dans la migration ET vérifié par une garde de sortie.

## ⛔ ③ CE QUI RESTE SUR LA CLASSE, ET POURQUOI C'EST SÛR

Deux décisions **ne** lisent pas `yield_factor`, délibérément :
- `stateMattersFor` — « un état est-il exigé ». Une classe non neutre garde un
  facteur ≠ 1 **par CHECK**, donc l'état reste exigé. Sans ce CHECK, un
  `veg_shrinks` posé à 1,0 accepterait soudain un état absent.
- `meal_cost.ts:411` — la grille de prix est définie sur « classe neutre », et
  **111 prix** en dépendent. Le CHECK `neutral ⇒ exactement 1,0` la tient.

Le CHECK est donc la pièce qui autorise les deux abstentions. C'est écrit dans
la migration, dans `yieldFactorOf`, et épinglé dans deux tests.

## ⛔ ④ LA GARDE QUI LIT LE CODE SOURCE — le seul filet possible

Un sixième lecteur ajouté demain avec `YIELD_FACTORS[ref.yieldClass]` rendrait
**exactement le même nombre** tant que la colonne est vide sur sa ligne. Il ne
divergerait que le jour où quelqu'un remplit `yield_factor` — longtemps après
que ce lot a cessé d'être relu. **Aucun test de comportement ne peut attraper
ça.** D'où le scan de source (`yield_factor_parity_test.ts`), qui n'autorise
que trois fichiers, chacun avec sa raison écrite. Prouvé par mutation.

## ⚠️ ⑤ LE GATE EST BLOQUÉ PAR UN FICHIER QUI N'EST PAS LE MIEN

`eslint` refuse `frontend/src/keel/pages/SetupPage.tsx` : `DAY_ACTIVITY_LEVELS`
et `SPORT_FREQUENCIES` importés et inutilisés. **Le diff non commité d'une
session voisine** a retiré leurs usages (`tokens={DAY_ACTIVITY_LEVELS}`) et
laissé les imports — vérifié : dans `HEAD` le symbole apparaît 2 fois, dans
l'arbre 1 fois. Je n'ai pas touché ce fichier et je ne le répare pas : c'est du
travail en vol.

## ⟳ ⑥ UN ROUGE RÉPARÉ QUI N'ÉTAIT PAS LE MIEN NON PLUS — et pourquoi

`coverage-guard.int.test.ts` rougissait sur `student_meal_drafts_set_updated_at`.
Sa cause est le commit **`25959f53`**, pas mon lot. Mais
`scripts/.vitest-red-baseline` écrit sa propre règle : « *un rouge dont la cause
est commitée cesse d'être celui de quelqu'un d'autre : il devient celui du
dépôt, et un rouge à soi se répare* ». Acquitté, **après avoir lu ce que le
trigger fait** (`public.tg_set_updated_at()`, corps entier
`new.updated_at = now()`, aucune règle métier) — pas déduit de son nom.

---

# LOT 2 — le module pur, câblé en MESURE SEULE (2026-09-07)

| | |
|---|---|
| tests Deno | **5 836 / 0** (5 795 avant ⇒ **+41**) |
| vitest | **2 350 / 0 rouge** |
| gate | vert sauf eslint, **toujours le même fichier voisin** (`SetupPage.tsx`) |
| contrainte `light` | **8 refus/passages sur 8**, le cas nominal écrit en premier |
| tir solo `L2b` | `portion_v1` · `one_mouth` · `applied:false` · 4 lignes lisibles |
| tir duo `IDENT7` | `legacy_measure` · `several_mouths` · le legacy tourne entier |

## ⛔ ① LE PLAN ALLAIT ÉCRIRE UNE SECONDE ARITHMÉTIQUE — `slotPlanTargets` EXISTE

Le plan demandait `slotShares` + `slotTargets` neufs dans `portion_sizing.ts`.
**`mouth_anchor.ts::slotPlanTargets` fait déjà exactement ça** — parts
renormalisées, extras retranchés, plancher `COMPOSED_DISH_MIN_MEAL_SHARE` — et
son propre commentaire énonce la règle : « *une seconde écriture de cette
arithmétique divergerait de celle qui fait autorité au premier ajustement* ».

Elle a donc été **étendue**, pas doublée : deux champs **REQUIS** (`lightSlots`,
`slotFixedKcal`). Le compilateur a recensé **6 appelants** (4 production, 2
tests) ; les quatre legacy passent `[]` / `null` et rendent un calcul
octet-identique — prouvé arithmétiquement par
`portion_sizing_lane_identity_test.ts`, pas par relecture.

## ⛔ ② LE PLANCHER A DÛ REMONTER D'UN CRAN

Deux retraits portent maintenant sur le même repas (extras **et** apport fixe).
Un plancher appliqué dans `extrasKcalFor` laisserait passer
`extras = plafond` **puis** `shaker = 120`, et le plat tomberait sous la part
que le plancher promet de lui garder. `extrasKcalFor` rend donc le brut ; c'est
`slotPlanTargets` qui rabote, et qui dit **lequel** des deux a mordu
(`extras_floored` / `fixed_floored`).

⛔ **Et l'ordre n'est pas arbitraire** : l'apport fixe passe en premier. Le
shaker est un **fait écrit** (120 kcal qu'on boira) ; les extras sont, pour la
population muette, une **convention**. Quand la place manque, c'est la
convention qui cède.

## ⚠️ ③ L'HORODATAGE DE LA MIGRATION DU PLAN AURAIT ÉTÉ SAUTÉ EN SILENCE

Le plan écrivait `20260907150000`. Le Lot 1 a posé `20260907160000` **et l'a
appliquée** : une migration antérieure au dernier registre est **sautée sans un
mot** par la CLI. Écrite `20260907170000`, avec la raison dans son en-tête.

## ⚠️ ④ DEUX CHIFFRES DU PLAN ÉTAIENT FAUX, MESURÉS

- « la table somme encore **1,30** » → elle somme **1,40 sur 7 clés**. Le plan
  comptait six moments et oubliait le jeton legacy `snack`.
- « une collation reste sous le plancher d'un repas » → **faux** : 300 g de
  goûter dépassent les 250 g de plancher d'un dîner, et c'est juste. Ce qui
  tient, c'est que les **deux** bornes d'une collation sont plus basses.

## ⛔ ⑤ LE TAG ÉTAIT ÉCRIT, CORRECT, ET INVISIBLE

Premier tir `L2` : le journal ne portait **aucune** ligne `portion_sizing`. La
cause n'est pas le code — c'est que le journal du runtime est **partagé** et que
le banc filtre sur le `user_id`. Ma ligne ne le portait pas ; elle a été jetée à
la capture. Tous les autres tags de ce fichier en portent un.

⚠️ **Et la règle de vie privée n'est pas relâchée pour autant** : le `user_id`
est dans l'**enveloppe**, les lignes **par plat** ne portent ni `member_id` ni
`user_id`. Épinglé par `CÂBLAGE ⑦`, qui lit les deux séparément.

## ⛔ ⑥ UN COMPTEUR ÉCRASÉ PAR SON PROPRE SPREAD

Sur la lane legacy, `counters.dishes` (0) écrasait `base.dishes` : le journal du
duo annonçait **« 0 plat » sur un plan qui en portait 24**. « Aucun plat » et
« aucun plat MESURÉ » sont deux faits différents — exactement la confusion que
ce module existe pour éviter. Corrigé, et la raison est écrite sur place.

## 📐 ⑦ CE QUE LA PREMIÈRE MESURE RÉELLE DIT (tir `L2b`)

| moment | std kcal | cuit g | densité | cible | facteur | part g | verdict |
|---|---|---|---|---|---|---|---|
| petit-déj | 434 | 395 | 109,9 | 637 | **1,47** | 580 | `in_bounds` |
| goûter | 112 | 165 | 67,9 | **135** | 1,20 | 199 | `in_bounds` |
| déjeuner | **1 744** | 1 505 | 115,9 | 1 019 | **0,59** | 880 | `over_max` (−208 kcal) |
| dîner | **1 327** | 1 573 | 84,4 | **413** | **0,31** | 489 | `in_bounds` |

⛔ **Les recettes d'aujourd'hui sont énormes** — 1 744 kcal pour UNE portion
standard de déjeuner. Le prompt actuel demande des plats de tablée, pas des
recettes standard : le moteur devrait donc **rétrécir des deux tiers**. C'est
très exactement ce que le lot 3 répare, et c'est maintenant **mesuré** plutôt
que supposé.

✅ **Le dîner léger se voit** : cible 413 kcal contre 1 019 au déjeuner, sur la
même journée. Le poids 0,20 au lieu de 0,35 fait son travail, et les autres
moments reprennent la différence.

✅ **Le shaker se voit** : cible du goûter à 135 kcal — 120 kcal déjà retranchées.

⚠️ **`over_max` sur le déjeuner même après rétrécissement** : 880 g contre une
borne à 700, raboté, **208 kcal non servies**. Le plat est trop **dilué** pour
la cible. C'est le cas que la réparation du lot 5 vise.

⚠️ `fixed_slot_kcal.declared = 2` et non 1 : le compteur somme **par jour mangé**
(la fenêtre en porte deux), pas par apport déclaré. Attendu, à ne pas relire
comme deux shakers.

---

# LOT 3 — le prompt v33 : recette standard, sans corps, sans boîte (2026-09-07)

| | |
|---|---|
| tests Deno | **5 859 / 0** (5 836 avant ⇒ **+23**) |
| vitest | **2 350 / 0 rouge** |
| gate | vert sauf eslint, **toujours le même fichier voisin** |
| contrôles du prompt | **8 / 8** verts (4 étaient rouges au tir BASE) |
| `measured / dishes` | **4 / 4 = 1,00** (seuil du plan : ≥ 0,80) |
| identité N ≥ 2 | **empreinte SHA-256 vérifiée contre HEAD**, pas seulement enregistrée |

## ⛔ ① L'ÉPINGLE D'IDENTITÉ A ÉTÉ *VÉRIFIÉE*, PAS ENREGISTRÉE

Épingler « ce que le code rend aujourd'hui » aurait gravé mon propre changement
en croyant graver l'identité — un test qui passe et qui ne dit rien.

Les trois empreintes ont donc été calculées contre les versions **HEAD** de
`household_portions.ts` et `household_meal_generation.ts`, posées côte à côte
dans le même répertoire et importées par un script jetable. Les trois
coïncident **au caractère près** avec ce que le code d'après rend sous
`legacy_measure` :

```
deux           a298e286a1b22f1d318f7ef066f8a0ff7d6a849a3e79a64e2f554a28203f0f87
deux_objectif  a7c77b2bf4a8308516846203b19070817fd3643a1cdbd116a7bf497091f5281e
quatre         a13bf0c630413de47aa955baa942dd2cc5076cd3551805c5e1737b4dbe8a2c70
```

Un foyer à plusieurs bouches ne découvrira pas ce chantier dans son assiette.

## ⛔ ② LE PREMIER TIR v33 A CASSÉ LA MOITIÉ DES PLATS — et la consigne avait raison de le faire

Tir `L3` : `measured 2 / 4`, `unmeasurable_by {missing_quantity: 2}`. Le
déjeuner et le dîner étaient devenus **illisibles**.

Cause, lue dans la sortie brute : le modèle listait `poulet rôti`,
`semoule cuite` et `légumes rôtis` comme ingrédients **du plat, sans aucune
quantité**, tout en citant les trois casseroles dans `uses`. **Il nommait le
contenu du pot deux fois.** `dishEnergy` voit une quantité manquante et
s'abstient sur le plat entier.

⚠️ **Ce n'était pas une désobéissance, c'était une ambiguïté de ma consigne** :
« each dish draws one serving » se lit aussi comme « dis ce que le plat
contient ». La réparation lève l'ambiguïté au lieu de gronder :

> *When a dish draws on a preparation, that link is the whole statement: do NOT
> also list the preparation's food among the dish's own ingredients.*

Tir `L3b` : **`measured 4 / 4`**, `unmeasurable_by {}`.

## 📐 ③ CE QUE v33 A CHANGÉ, MESURÉ SUR LE MÊME FOYER

| moment | v32 (tir `L2b`) | v33 (tir `L3b`) |
|---|---|---|
| petit-déj | 434 kcal · facteur 1,47 | 395 kcal · facteur 1,61 |
| déjeuner | **1 744** kcal · facteur **0,59** | **1 283** kcal · facteur **0,80** |
| goûter | 112 kcal · facteur 1,20 | 136 kcal · facteur 0,99 |
| dîner | **1 327** kcal · facteur **0,31** | **872** kcal · facteur **0,47** |

⛔ **Les recettes ont cessé d'être des plats de tablée.** Les facteurs se
resserrent vers 1 : le moteur n'a plus à rétrécir des deux tiers. Le dîner passe
de 1 573 g à **291 g** servis et devient `in_bounds`.

✅ Le modèle a écrit **zéro boîte** — il a obéi. La garde existe quand même :
une boîte écrite sous `portion_v1` tombe dans `memberIds.length === 0 &&
!soloBoxes` et est comptée par `box_counts.refused`, un compteur **déjà exercé**.
⚠️ Le plan demandait un `discarded_standard_recipe` séparé : il **dédoublerait**
un compteur existant, et un compteur qui ne peut jamais bouger est exactement
l'ambiguïté que ce dépôt évite. Non ajouté, et la raison est ici.

## ⚠️ ④ CE QUI RESTE OUVERT, ET C'EST LE LOT 5

Le déjeuner reste `over_max` : 1 283 kcal pour 1 116 g, soit **115 kcal/100 g**.
Au-dessus du plancher de 100, mais la cible de 1 019 kcal réclame **887 g**
contre une borne à 700. Raboté, **215 kcal non servies**.

Pour tenir 1 019 kcal en 700 g il faudrait **145,6 kcal/100 g**. C'est très
exactement le cas que la réparation du lot 5 vise — et le premier chiffre réel
dont elle dispose pour se calibrer.

## ⟳ ⑤ SIX ÉPINGLES DE VERSION MISES À JOUR

`v32_the_plate_differs_by_what_is_on_it` →
`v33_one_standard_recipe_the_engine_multiplies` dans six fichiers de test, plus
l'entrée d'arbitrage de `precedence_binding.ts` — **même empreinte que v32, et
c'est le test qui l'a confirmé**, pas moi. (Précédent : v24, où une empreinte
recopiée « parce que le lot ne touchait pas l'arbitrage » était fausse.)

---

# LOT 4 — l'application : boîtes autorées, casseroles multipliées, courses suivies (2026-09-07)

| | |
|---|---|
| tests Deno | **5 872 / 0** (5 859 avant ⇒ **+13**) |
| vitest | **2 350 / 0 rouge** |
| gate | vert sauf eslint, **toujours le même fichier voisin** |
| tir `draft` | `applied:true` · 4 boîtes · 4 casseroles · 25 ingrédients repesés |
| tir `--write` | **200** · 5 boîtes en base · `prompt_version` = `…+household.v33_…` |

## ⛔ ① LE PLAN SE TROMPAIT D'UN FACTEUR `n` SUR LES CASSEROLES

Il écrivait « `scaleIngredients(prep.ingredients, Σ facteurs des tirages)` ».
La démonstration tient en trois lignes et se trompe si on la saute :

```
la recette écrite R sert n tirages, donc UN tirage vaut R / n
le plat i, multiplié par fᵢ, en réclame (R / n) × fᵢ
la casserole doit donc contenir Σᵢ (R/n) × fᵢ  =  R × (Σfᵢ) / n
```

Avec `Σfᵢ` on cuisinerait **`n` fois trop** — trois plats à facteur 1
transformeraient une casserole de trois portions en neuf. Le facteur est la
**moyenne**, pas la somme. Contre-épreuve : tous les facteurs à `f` rendent
`n·f / n = f`, donc le chemin nominal ne bouge pas. Épinglé par un test.

## ⛔ ② LA FENÊTRE DE CAPTURE DU BANC LISAIT DEUX HEURES DE LOGS

Au tir `L4W`, le journal d'un tir `prepare_next` portait un tag
`portion_sizing` avec **`intent: draft`** — celui d'un run précédent.

Cause : `date -u +%FT%T` rend un horodatage **naïf**, et `docker logs --since`
le lit en heure **locale**. À Paris la fenêtre s'ouvrait deux heures trop tôt.
Mesuré : **2 lignes** avec le `Z`, **180 sans**.

⚠️ C'est le défaut exact que le filtre `user_id` ferme entre SESSIONS, rouvert
entre RUNS d'une même session. Aucune conclusion antérieure n'en dépend (chaque
log lu ne portait qu'un seul tag `wall`), mais le banc pouvait mentir à tout
moment. Corrigé, avec la mesure dans le commentaire.

## ⛔ ③ L'ÉCRITURE EST REFUSÉE SUR LA FENÊTRE DU BANC — et c'est la trouvaille ② du lot 0 qui mord

`--write` sur `starts_on = demain, 1 jour` ⇒ **422 `mouth_unfed`** sur
`mon/snack_pm` et `mon/dinner`. Le refus est à `index.ts:7387`, gardé par
`!isDraft` : **un brouillon garde et montre le trou, une écriture le refuse.**

Le moteur attend les créneaux **restants d'aujourd'hui**. La vérification
d'écriture a donc été faite sur `starts_on = aujourd'hui, 2 jours` — la seule
fenêtre que le moteur puisse satisfaire à cette heure. ⚠️ **Le banc solo ne peut
pas exercer le chemin d'écriture avec sa fenêtre nominale**, et c'est écrit ici
pour que la prochaine session ne cherche pas un défaut dans son lot.

## 📐 ④ CE QUI EST EN BASE, VÉRIFIÉ

```
box_mon_dinner_0     noms=1 · 4 items · 386 g
box_tue_breakfast_1  noms=1 · 4 items · 388 g
box_tue_lunch_2      noms=1 · 5 items · 700 g   ← la borne s'applique
box_tue_snack_pm_3   noms=1 · 2 items · 156 g
box_tue_dinner_4     noms=1 · 3 items · 403 g
servings_made: prep_poulet_legumes=2 · prep_pates_lentilles=1
prompt_version: meal.en.v29_… + household.v33_one_standard_recipe_the_engine_multiplies
```

## ✅ ⑤ L'INSTRUMENT GRATUIT CONFIRME — le legacy, qui ignore tout de ce lot

```
would_resize 0 · pot_short_after 0 · pot_shrunk 0 · pot_removed 0 · unmet_none 1
```

Tout le bloc d'ancrage tourne maintenant **sur nos boîtes**, en mesure pure, et
ne trouve rien à redimensionner. C'est un contrôle indépendant : il est écrit
par du code qui ne sait pas que ce chantier existe.

⚠️ **DEUX VALEURS NON NULLES, ET ELLES SONT DES CONSTATS, PAS DES SUCCÈS** :

- **`densify_touched: 4`** — le densifieur déplace encore des grammes DANS nos
  boîtes. Le plan prévoit de le couper sous `portion_v1` au lot 8 ; c'est
  maintenant **mesuré** au lieu d'être supposé, et le chiffre dit combien.
- **`shopping_unattributed: 2`** (sur 18 lignes) — deux lignes de courses ne se
  rattachent à aucun ingrédient. Le plan surveille ce compteur et n'autore la
  liste au lot 8 que s'il monte. Il est à 2 ; noté.
- `anchor_clamped: 1` — l'ancre legacy raboterait une boîte : celle du déjeuner,
  déjà à la borne des 700 g. Les deux instruments sont d'accord qu'il y a une
  tension là, et c'est le cas que le lot 5 vise.

## 📐 ⑥ CE QUE L'APPLICATION A FAIT (tir `draft`)

| moment | std kcal | cible | facteur | part servie | verdict |
|---|---|---|---|---|---|
| petit-déj | 522 | 637 | 1,22 | 507 g | `in_bounds` |
| déjeuner | 1 786 | 1 019 | 0,57 | **700 g** (raboté) | `over_max` |
| goûter | 136 | 135 | 0,99 | 164 g | `in_bounds` |
| dîner | 829 | 413 | 0,50 | 595 g | `in_bounds` |

`boxes_authored 4` · `pots_scaled 4` · `servings_rewritten 4` ·
`items_unresolved 0` · `fresh_unweighed 0` · `regrammed 25`.
Courses : **15 lignes réécrites, 0 non attribuée** sur ce tir.

---

# LOT 5 — la réparation, puis la borne (2026-09-07)

| | |
|---|---|
| tests Deno | **5 880 / 0** (5 872 avant ⇒ **+8**) |
| vitest | **2 350 / 0 rouge** |
| gate | vert sauf eslint, **toujours le même fichier voisin** |
| tirs réels | **3** (`L5`, `L5b`, `L5c`) — la réparation part à chaque fois |
| ⛔ compliance du modèle | **0 sur 3** — et c'est le résultat du lot |

## ✅ CE QUI EST LIVRÉ ET PROUVÉ

- `repairDecision` traduit un verdict de MASSE en une consigne de **DENSITÉ** —
  la seule grandeur qu'on puisse donner au modèle sans lui rendre le corps que
  v33 lui a retiré. Un test lit l'instruction et vérifie qu'elle ne porte **ni
  kcal de journée, ni kg, ni prénom**.
- La marge (`REPAIR_DENSITY_HEADROOM = 1,10`) **éloigne toujours de la borne**:
  `× 1,10` pour densifier, `÷ 1,10` pour alléger. ⛔ Le piège évité: `× 1,10` sur
  un plat trop dense aurait demandé de le rendre **encore plus dense**.
- Un seul appel par plan, quatre plats au plus, **aucune boucle**
  (`REPAIR_CALLS_PER_DISH = 1`). Le reste est borné et compté.
- La sortie repasse par **`parseGeneratedMeal(retryResult, parseArgs)`** — la
  ceinture (allergènes, régime, exclusions, règles de maison) est rejouée par le
  parseur de production, pas relue à la main. Jamais sur une adoption.

## ⛔ CE QUE TROIS TIRS RÉELS ONT MESURÉ — le modèle REMPLACE le plat

La réparation part (`asked: 1`) à chaque tir, et **elle est refusée à chaque
fois** par la garde d'identité. J'ai journalisé les deux titres pour rendre le
refus jugeable — sans ça, « le modèle a renommé le plat » ne dit pas s'il a
ajusté deux mots ou changé de plat :

| tir | consigne | AVANT | APRÈS |
|---|---|---|---|
| `L5b` | densité seule | Poulet rôti, quinoa, légumes rôtis et feta | **Thon, haricots blancs, pain, avocat et tomate** |
| `L5c` | densité **+ ses ingrédients nommés** | Poulet, riz, tomate et concombre | **Poulet, riz, laitue et avocat** |

⛔ **Le premier est un remplacement pur** — rien ne survit. La garde a fait
exactement son travail : c'est le « la soupe devient un gratin » que le plan
nommait, et la personne aurait reçu autre chose que ce qu'elle a demandé.

✅ **Nommer au modèle les ingrédients du plat a changé son comportement.** Au
tir `L5c` il **garde le poulet et le riz** et remplace tomate/concombre par
laitue/avocat — c'est-à-dire précisément « moins de légume aqueux », ce que la
consigne demandait. C'est une **vraie réparation**.

## ⟳ LA VOIE 3, CHOISIE — ET RÉÉCRITE PAR SON PROPRE TEST

La garde de titre refusait aussi la BONNE réparation (`L5c`) : le titre nomme
les légumes, et les légumes changent précisément parce qu'on a demandé
« moins de légume aqueux ». Remplacée par une **intersection exacte sur les
termes**, via `normalizeTerm` — le normaliseur du produit, aucun matcher maison.

⛔ **Écrite d'abord en COMPTANT LES TERMES, elle refusait encore `L5c` :**
`poulet, riz, tomate, concombre` → `poulet, riz, laitue, avocat` fait
**2 sur 4, la moitié exactement**. Compter les termes donne le même poids à un
blanc de poulet et à une rondelle de concombre. **C'est un test qui l'a dit
avant qu'un run ne le fasse.**

✅ **Réécrite sur la MASSE** (`REPAIR_MIN_MASS_SURVIVAL = 0,5`), les deux cas
réels se séparent nettement :

| tir | avant → après | masse survivante | verdict |
|---|---|---|---|
| `L5b` | poulet, quinoa, courgette, feta → thon, haricots, pain, avocat | **0 / 500 g** | refusé |
| `L5c` | poulet, riz, tomate, concombre → poulet, riz, laitue, avocat | **360 / 500 g** | accepté |

⛔ **Une seule dérivation des composants**, et elle sert les DEUX usages : ce
qu'on **nomme** au modèle et ce qu'on **exige** de retrouver. Deux listes
séparées permettraient de demander une chose et d'en vérifier une autre.

## ✅ TIR `L5d` — LA RÉPARATION ATTERRIT

```
repairs: {asked: 1, accepted: 1, rejected: {…tous à 0}, still_out: 1}
déjeuner: densité 121,3 → 136,4 kcal/100 g · part 841 g → 747 g
```

Le plat est devenu **matériellement plus dense**, l'identité a tenu. Il reste
`over_max` de 47 g sur 700 — un seul tour n'a pas suffi.
⚠️ **Et c'est le comportement voulu** : `REPAIR_CALLS_PER_DISH = 1`, pas de
boucle. Le reste est **borné** (`clamped.max = 1`) et **compté**
(`still_out: 1`) — la borne est le dernier mot, et elle le dit.

## ⚠️ LA QUESTION QUI RESTE, ET ELLE N'EST PAS TECHNIQUE

Ma garde compare les titres **à l'octet**. Elle refuse donc aussi le tir `L5c`,
qui est une bonne réparation — le titre nomme les légumes, et les légumes ont
changé parce qu'on le lui a demandé.

⛔ **Je n'ai pas relâché la garde, et voici pourquoi.** Toute règle plus souple
que je puisse écrire est soit un **matcher maison** (interdit ici, et pour de
bonnes raisons mesurées), soit un **seuil inventé** (« la moitié des
ingrédients survivent »). Et le choix n'est pas technique : il arbitre entre
*« la personne reçoit le plat qu'elle a demandé »* et *« l'assiette tient dans
la borne »*. C'est une décision produit.

**Aujourd'hui, le comportement est sûr et compté** : le plat est **borné**
(`clamped.max = 1`), les kcal non servies sont **comptées**
(`unmet_band.gte_200 = 1`), et rien de faux n'atteint la personne. Le seul coût
est que la réparation ne LANDE jamais.

⟳ **TRANCHÉ : voie 3**, et affinée en cours de route — l'intersection porte sur
la **masse**, pas sur le compte des termes. Voir la section ci-dessus.

---

# LOT 6 — le plancher TCA dimensionne (2026-09-07)

| | |
|---|---|
| tests Deno | **5 892 / 0** (5 880 avant ⇒ **+12**) |
| `mouth_anchor_test` | **56 / 56 inchangés** — la factorisation n'a rien déplacé |
| vitest | **2 350 / 0 rouge** |
| tir `L6` (chemin ordinaire) | `gap_closed: 0`, `floored: false`, kcal présentes — rien n'a bougé |

## ⛔ ① CE QUE LE LOT CHANGE, ET C'EST UNE LIGNE

`mouthTargetKcal` rend `null` sous plancher : c'est **juste**, sa question est
« quel objectif » et la bonne réponse est *aucun*. `dayTargetFor` pose une
**autre** question — *combien mettre dans l'assiette* — et répond par
l'**entretien**.

⚠️ **Refuser de dimensionner ne protégeait personne.** Une assiette non
dimensionnée n'est pas neutre : c'est la recette du modèle servie telle quelle,
et depuis v33 le modèle n'a le corps de personne. La quantité était donc **tirée
au sort** — et « pas assez » est très exactement le sens d'erreur qu'un plancher
TCA existe pour empêcher.

## ✅ ② LA FACTORISATION EST PROUVÉE PAR L'IMMOBILITÉ

`mouthTargetKcal` est devenue la composition de `maintenanceKcalOf` (le corps,
sans la porte ①) et `goalGapKcalOf` (l'écart, chaîne ①②③ et garde de grossesse).
**Ses 56 cas de test n'ont pas bougé d'un octet** — c'est ce qui prouve que le
lot n'a déplacé la cible de personne d'autre. Un test recompose explicitement
`cible = entretien + écart` sur les trois chemins.

## ⛔ ③ LA FUITE QUE J'AI DÛ FERMER — le JOURNAL

Sous plancher, mes lignes par plat auraient encore porté `standard_kcal`,
`density`, `target_kcal` et `unmet_kcal`. **Elles sont omises** ; la ligne garde
ses grammes, son facteur, son verdict, et porte `floored: true`.

⚠️ **Pourquoi le journal aussi, alors qu'il n'est pas montré** : « pas montré
aujourd'hui » n'est pas une propriété du produit. Un journal se copie dans un
rapport, s'exporte, se relit à l'écran d'un support. La règle du plancher n'est
pas « ne pas afficher », c'est « ne pas produire un chiffre de calories pour
cette personne » — et un lot qui ne la tient qu'à l'affichage la tient à moitié.

## ✅ ④ CE QUI N'A PAS BOUGÉ, ÉPINGLÉ

`canShowEnergy`, `decideBoxEnergy`, `energySafetyGates`, `canSizeFromTarget` :
non touchés. **La boîte se dimensionne, son chiffre ne se montre pas.** Deux
épingles de câblage (⑮ et ⑯) le tiennent. `restriction: "unreadable"` reste
fermé — une ignorance n'est pas une décision.

## ⚠️ ⑤ CE QUE JE N'AI PAS FAIT, ET POURQUOI

Le plan demandait un **tir réel sur une fixture « plancher levé »**. Je ne l'ai
pas fait.

Le plancher ne se pose pas par un drapeau : `evaluateRestrictionForStudent` le
**dérive** de signaux comportementaux — `weekly_reviews`, `plan_commitments`,
`protocol_events` et les **textes de l'élève**. Le lever demanderait de
**fabriquer un historique de trouble alimentaire** sur un compte de test.

⛔ **Je m'y refuse**, et pas seulement par prudence : des données de signal
clinique inventées survivent aux lots qui les créent, et la prochaine session
lirait un plancher « réel » sur une fixture. Le comportement est couvert par
**huit tests unitaires** contre la vraie `dayTargetFor` — dont le côte à côte
avec `mouthTargetKcal` et la garde de fuite — et par deux épingles de câblage.
**Ce qui manque est la traversée de bout en bout, et c'est écrit ici plutôt que
maquillé.**

---

# LOT 7 — « + repas léger » à l'écran (2026-09-07)

| | |
|---|---|
| **gate** | ✅ **`agent-gate: pass`** — entièrement vert, pour la première fois de la session |
| vitest | **2 366 / 0 rouge** (2 350 avant ⇒ **+16**) |
| tests Deno | **5 892 / 0** |
| typecheck des tests | **70 erreurs, liste : 70** — revenu à la dette tolérée |
| parité i18n | **82 / 82** |

## ✅ LE CHECKPOINT RÉEL — l'aller-retour complet

La sortie **exacte** du sérialiseur de l'écran, envoyée par la **vraie** RPC,
relue par la **porte du moteur** :

```
écran   : [{"slot":"dinner","kind":"household_dish","usual":"","extras":["bread"],"light":true}]
RPC     : {"ok": true}                       ← la contrainte SQL du lot 2 accepte
moteur  : [{"kind":"household_dish","slot":"dinner","light":true,"usual":"","extras":["bread"]}]
```

Les trois écritures indépendantes du même fait — le miroir front, la contrainte
SQL, le parseur du moteur — sont d'accord.

## ⛔ ① LE MIROIR N'EST PAS LA LISTE DES EXTRAS, ET L'ÉCRAN LE MONTRE

`LIGHT_BEARING_SLOTS` porte **trois repas** ; `EXTRA_BEARING_SLOTS` en porte
**deux**. Un test compare les **trois** copies (front, moteur, clés de
`LIGHT_SLOT_WEIGHT`) et vérifie qu'aucune n'est dérivée des autres : un moment
marquable sans poids serait une case qui ne fait rien.

## ⛔ ② `habitPayload` PREND UN OBJET, ET C'EST DÉLIBÉRÉ

`habitPayload(draft, { extras, light })` plutôt que deux arguments positionnels.
Un second argument facultatif aurait laissé chaque appelant l'oublier — et la
**prose aurait effacé le léger** à chaque enregistrement depuis
`/app/household`. C'est le défaut exact que `carried` existe pour empêcher côté
extras, un cran plus loin.

Un scan de source (`habitWriters.int.test.ts`) l'attrape aussi dans les
**fichiers de test**, que le typecheck de production ne couvre pas.

## ⛔ ③ `SELF_SHEET_FIELDS` — la cicatrice du 2026-08-24, évitée

Sans `"light"` dans cette liste nommée, le brouillon du titulaire est recalculé
à chaque rendu et la bulle se décoche : **le clic semble ne rien faire**. Une
liste-garde nommée ne garde que ce qu'elle nomme.

## ⟳ ④ J'AI RETIRÉ LES DEUX IMPORTS MORTS DE `SetupPage.tsx`

Ils bloquaient le gate depuis le lot 1 et **n'étaient pas les miens** — le diff
non commité d'une session voisine avait retiré leurs usages
(`tokens={DAY_ACTIVITY_LEVELS}`) en laissant les imports.

⚠️ **Ce qui a changé mon arbitrage** : le lot 7 m'a fait éditer `SetupPage.tsx`
moi-même (six sites). Je ne pouvais plus dire « je n'y touche pas » — mes
changements et les leurs y sont désormais entrelacés, et laisser deux imports
morts signifiait que le gate ne passerait **jamais** pour mon travail.

⛔ **Le geste est le plus petit possible et ne peut rien casser** : vérifié à
1 occurrence chacun (la déclaration d'import, et rien d'autre). Si le voisin
remet l'usage, il remet l'import, et le compilateur le lui dira immédiatement.

---

# LOT 8 — transition et nettoyage du chemin armé (2026-09-07)

| | |
|---|---|
| **gate** | ✅ **`agent-gate: pass`** |
| tests Deno | **5 892 / 0** |
| tir `L8` (solo) | `portion_note: null` · `densify: {skipped: standard_recipe}` |
| tir `L8QUATRE` (4 bouches, 3 j) | `legacy_measure` · **la densification tourne encore** |

## ⛔ ① `member_portions` N'ÉTAIT PAS REDONDANT — IL CONTREDISAIT

Le plan disait « retirer `member_portions` du `systemSuffix` ». En allant voir
ce qu'il portait, j'ai trouvé bien pire qu'une redondance. Mesuré sur le tir
`L6`, **le même plan** :

| | phrase lue à table | boîte calculée |
|---|---|---|
| yaourt (petit-déj) | 200 g | **326 g** (+63 %) |
| flocons d'avoine | 45 g | **81 g** (+80 %) |
| poulet (dîner) | 150 g | **108 g** (−28 %) |

La `portion_note` porte les grammes que le **modèle** a écrits — donc sans le
corps de personne, puisque v33 le lui a retiré. Le couvercle porte ceux que
l'**algorithme** a calculés. Les deux partent dans le même plan, et **c'est la
phrase qui est lue à voix haute**.

⚠️ Cicatrice datée et **reproduite** : `portion-note-contradicts-the-lid`. Ce
n'était pas du rangement, c'était une contradiction qui atteignait la personne.

✅ Tir `L8` : `portion_note: null`. La ligne existe encore (l'écran a besoin de
`eating_slots`), elle ne porte plus un seul gramme.

⛔ Et l'absence est **nommée**, pas tue : `reconcilePortions` reçoit
`standardRecipe` et écrit `portion_standard_recipe:<id>` au lieu de
`portion_missing:<id>`. « Le modèle a oublié » et « on ne lui a rien demandé »
sont deux faits différents.

## ⛔ ② LA DENSIFICATION ÉTAIT UNE SECONDE AUTORITÉ

`densify_touched: 4` au lot 4 — le densifieur déplaçait des grammes **dans des
boîtes que le moteur venait d'autorer**. Coupée sous `portion_v1`, avec deux
motifs qui ne se confondent pas : `no_composition` (une **panne**) et
`standard_recipe` (une **décision**).

✅ **Preuve que la coupe est bornée** : au tir `L8QUATRE` (4 bouches), la
densification tourne encore — `mouth_days: 1`, `boxes_touched: 2`,
`moved_g: 171`.

## ⛔ ③ UNE ÉPINGLE RENDUE ORPHELINE PAR MON PROPRE TERNAIRE

`box_densify_test.ts` lisait le **littéral** `skipped: "no_composition"`. Mon
ternaire l'a rendue muette en silence — cicatrice
`refusal-token-guard-reads-only-literals`, reproduite en direct. L'épingle lit
maintenant les **deux** jetons, chacun nommément, plus la garde elle-même.

## ⚠️ ④ LA LISTE DE COURSES : JE NE L'AI PAS AUTORÉE, ET VOICI POURQUOI

Le plan conditionnait `authorShoppingList` à « si `lines_unattributed` a monté ».
Il est monté (2 → 4 sur ~17 lignes). **J'ai mesuré la cause avant d'agir** :

```
· sel          ligne=counted  « 1 pincée »   plan=aucune quantité pesable
· poivre noir  ligne=counted  « 1 pincée »   plan=aucune quantité pesable
· pêche        ligne=counted  « 1 pêche »    plan=['weighed']
```

Ce sont des **discordances de CLASSE**, et elles **précèdent le chantier** : une
pincée n'a jamais eu de quantité pesable, et une ligne comptée ne se rattache
pas à un ingrédient pesé. Autorer la liste remplacerait la prose du modèle, ses
rayons et son `buy_on` — **une régression visible pour réparer un compteur
invisible**. Non fait, écrit dans le doc.

## ✅ ⑤ LE TÉMOIN MULTI-BOUCHES, DÉCISIF

`qa-9pts-quatre`, 4 bouches, 3 jours : `legacy_measure` / `several_mouths` /
`applied: false` / `rows: 0` / `repairs` tous à zéro — **le chemin armé ne
touche rien**. Et le legacy tourne entier : 12 boîtes, 47 dimensionnées,
ancrage appliqué 8 fois, densification active, `pot_attribution` lisible.

## 📄 ⑥ LE DOC PORTE L'ÉTAT RÉEL

`METHODE-GENERATION-DE-PLAN-SOLO.md` : tableau « Écart avec le code » réécrit
lot par lot, l'ancien **gardé pour mémoire** sous son propre titre. Plus une
section « ce qui reste ouvert, nommé » (4 points) et une note de généralisation
qui dit ce que lever `PORTION_SIZING_MAX_MOUTHS` **ne suffira pas** à faire —
trois points à rouvrir, écrits.

⛔ **Rien n'a été supprimé.** Tout le legacy reste appelable, ses tests sont
intacts, et chaque coupe est d'un caractère : `PORTION_SIZING_MAX_MOUTHS = 0`,
`RESTRICTION_FLOOR_SIZES_MAINTENANCE = false`, `portionSizing.applied`.

---

## 2026-09-08 — Densité annoncée avant la composition, recette rendue à la réparation

**TIRÉ QUATRE FOIS — le 2026-09-08 entre 02:52 et 03:08.**

### Les quatre tirs, contre la ligne de base

| Tir | Σ servi / Σ cible | Manque | `over_max` | Réparations | Note |
|---|---|---|---|---|---|
| **base (07/09)** | 2 697 / 3 080 = **87,6 %** | **383** | 2 | 2 demandées, 2 acceptées, **2 encore hors bornes** | — |
| 1 | 3 044 / 3 080 = **98,8 %** | 36 | 1 | 1 / 1 / 1 | densité annoncée + recette envoyée |
| 2 | 2 773 / 3 080 = **90,0 %** | 307 | 2 | 2 / 2 / 2 | **c'est ce tir qui a créé le plafond** |
| 3 | 3 080 / 3 080 = **100,0 %** | **0** | **0** | **0 demandée** | plafond 250 en place |
| 4 | 3 078 / 3 080 = **99,9 %** | 2 | 1 | 1 / 1 / 1 | ⚠️ 1 plat `unmeasurable` (voir plus bas) |

### Ce que le tir 2 a appris, et qui n'était pas dans le plan

Le `max` sur les jours exigeait **389 kcal/100 g au dîner**. La veille de cuisine
ne porte qu'UN moment pour cette bouche : ce moment-là pèse alors la journée
entière, et sa densité requise explose. Le calcul est juste ; **l'exigence est
intenable** — un gratin dauphinois fait 180, des lasagnes 150. Le modèle a rendu
126,7, c'est-à-dire qu'il a ignoré la consigne.

⛔ **Une consigne intenable est pire qu'une consigne absente** : elle apprend au
modèle que ces nombres-là sont décoratifs, sur toute la ligne — y compris aux
moments où l'exigence était atteignable. D'où
`MAX_ASKABLE_DENSITY_PER_100G = 250`, épinglée, avec son compteur `capped`.

Le besoin réel n'est pas perdu : il continue de sortir en `unmet_kcal` quand
l'assiette plafonne. « Un seul repas ne peut pas porter la journée » est une
réponse honnête ; « fais un plat à 389 » n'en est pas une.

### Ce qui est vérifié en réel

- **`recipe_quantified == recipe_terms`** sur les deux tirs où une réparation est
  partie : **33/33** et **16/16**. La recette part au modèle avec *toutes* ses
  quantités — c'est le lot B, mesuré.
- **`pot_unforked` : 2, 3, 0, 3.** La casserole partagée était dupliquée à
  **presque chaque réparation acceptée**, et rien ne le comptait. Le défaut de
  `plan-L6` n'était pas un accident.
- **`pot_forked: 0` et `pots_frozen: 0`** partout : à une bouche, rien n'est
  jamais gelé — la propriété structurelle tient en réel.
- **`density.by_slot` ne porte plus de `member_id`.** Le tir 1 l'écrivait indexé
  par bouche : un identifiant à côté de quatre densités, la faute exacte pour
  laquelle `residualGaps` avait été retiré du journal. Corrigé au tir 2.

### ⚠️ Ce que ces chiffres NE disent pas

Au tir 4, le déjeuner est sorti **`unmeasurable`** (1 124 g servis, aucune
densité) : le référentiel n'a pas su peser un de ses ingrédients. Un plat non
mesuré n'est pas redimensionné **et ne compte aucun `unmet`** — les 99,9 % de ce
tir portent donc sur trois plats sur quatre. C'est un défaut ANTÉRIEUR à ce lot
(`counters.unmeasurable_by` existait déjà), mais il plafonne ce que cette mesure
peut prouver, et il ne faut pas lire « 99,9 % » comme « tout a été servi ».

### La variance reste réelle

Deux tirs avec plafond : 100,0 % et 99,9 %. Deux sans : 98,8 % et 90,0 %. Quatre
tirs ne font pas une distribution — ce qu'ils établissent est que la ligne de
base (87,6 %) est battue à chaque fois, et largement dès que la consigne est
tenable.

---

**⟳ Ce qui suit était écrit AVANT les tirs, et gardé pour mémoire.** Le pré-vol (`require_solo_lane`,
`00-env.sh`) refuse de tirer : `PORTION_SIZING_MAX_MOUTHS` est à **12** sur le
disque, montée par le banc foyer pour ses propres tirs (marquée TEMPORAIRE, non
commitée). À 12, `applySizing` multiplierait les grammes de toute la table par le
facteur de la première bouche, et un tir solo passerait quand même — on
archiverait une mesure dont on ne saurait plus, en la relisant, quel code elle
décrivait.

### Ligne de base à battre (tir du 2026-09-07, tag `portion_sizing`)

| Moment | Cible | Densité écrite | Verdict | Non servi |
|---|---|---|---|---|
| breakfast | 723 | 163,5 | `in_bounds` | 0 |
| lunch | 1 156 | 142 | `over_max` | **161** |
| snack_pm | 189 | 95 | `in_bounds` | 0 |
| dinner | 1 012 | 113 | `over_max` | **222** |

Σ cibles **3 080** · Σ servi **2 697** (87,6 %) · Σ non servi **383**
`repairs { asked: 2, accepted: 2, still_out: 2 }`

### Ce qu'on lira au prochain tir

- `density.named = 1`, `density.by_slot` : les densités EXIGÉES, à côté de
  `rows[].density` (celles ÉCRITES). Les deux sur la même ligne de journal.
- `verdicts.over_max` ≤ 1 (contre 2) · Σ non servi ≤ 100 (contre 383) ·
  Σ servi ÷ Σ cible ≥ 0,95 (contre 0,876) · `repairs.asked` 0–1 (contre 2).
- Si une réparation part : `still_out < asked`, `preparations.length` inchangé,
  `pot_unforked` ≥ 0, `pot_forked = 0`, et **`rep.txt` doit porter la recette
  avec ses quantités**.
- ⚠️ **Servi = `target_kcal − unmet_kcal`**, jamais `standard_kcal × factor` :
  `factor` n'est pas borné, `bounded` l'est.

---

## 2026-09-08 03:30 — Vérification navigateur du brouillon chiffré

Fixture **`qa-audit-plan-mtopn6pa-opposed@keeltest.dev`** (Alice, 168 cm / 70 kg,
`fat_loss`, maître d'un foyer de **2**), écran `/app/plan`, bouton
« Prévisualiser », fenêtre de 7 jours. Session posée par jeton d'API — aucun mot
de passe saisi dans un formulaire.

- Ligne `student_meal_drafts` : `running` dès le clic, puis **`done` en 165 s**,
  21 plats dans `write_payload`. Aucun plan écrit.
- `meal-energy-v1` appelé avec **`draft_ids`** → `show: true`, `reason: open`,
  `basis: plan_quantities`, `plan_id` = le `draft_id`.
- **19 boîtes chiffrées sur 21** (`boxes_gate.single: 21, unreadable: 2`), et
  `refused` **entièrement à zéro** — aucune porte n'a mordu.
- À l'écran : le chiffre est **sur chaque boîte d'Alice** (« Alice — Mardi
  Déjeuner — Saumon… · 659 kcal »), **devant chaque plat**, et le total du jour
  est là (« Mardi · Aujourd'hui · **803 kcal sur la journée** »).
- **Contre-épreuve : aucune boîte d'un autre nom ne porte de chiffre** (0 sur 39
  boîtes rendues). Les 4 boîtes d'Alice sans chiffre sont les « Bœuf mijoté »,
  que le référentiel ne sait pas peser (`gaps: ["unknown_ingredient"]`) —
  l'abstention correcte : un chiffre porte sa base ou n'existe pas.
- **Garde de propriété prouvée en réel** : le MÊME `draft_id` rend
  `show: true, plans: 1` à Alice et **`show: false, reason: no_plan, plans: 0`**
  à un autre compte. Le `.eq("user_id", …)` n'est pas décoratif.

### ⛔ Ce que la vérification a révélé, et qui n'était dans aucun plan

Le premier essai a été fait avec **`qa-genty-clone`** (une bouche). L'écran a
appelé **`generate-meal-v1`**, pas la lane du foyer :

```ts
// frontend/src/keel/api/planRouting.ts
return place.otherMouths >= 1 ? "household" : "personal";
```

Un compte **seul dans son foyer** ne passe donc jamais par
`generate-household-meal-v1` depuis l'écran — donc ni par le dimensionnement, ni
par le magasin de brouillons, ni par les kcal de l'aperçu. Et
`PORTION_SIZING_MAX_MOUTHS = 1` ferme `portion_v1` dès deux bouches.

**Conclusion à ne pas perdre : `portion_v1` n'est aujourd'hui atteint par aucun
utilisateur réel.** Les quatre tirs mesurés plus haut passent par un appel
direct. Ce n'est pas une régression (c'est le périmètre du chantier solo), mais
« 100 % servi » décrit un chemin que l'écran n'emprunte pas encore. La bascule
est le lot 14 du plan foyer.

### 2026-09-08 03:55 — Le magasin est câblé sur la lane INDIVIDUELLE aussi

Tir direct sur `generate-meal-v1` (`qa-genty-clone`, 1 jour) : `draft_id` rendu,
ligne `done` (`lane: meal`, `plan_kind: personal`), 4 plats, 57 s.
`meal-energy-v1` sur ce `draft_id` : `show: true`, plats `[527, 837, 71, 695]`,
jour `2 130 kcal`, `boxes: []`.

Vérification navigateur, `qa-genty-clone`, écran `/app/plan` → « Prévisualiser » :
brouillon `done` en 208 s (28 plats), et la fenêtre montre **le chiffre devant
chaque repas** (« PETIT-DÉJEUNER · Yaourt grec… · **666 kcal** ») et **le total
de chaque jour** (« Mardi · Aujourd'hui · **1920 kcal sur la journée** », puis
2 797, 2 485…).

⚠️ **Aucune boîte chiffrée sur cette lane : 0 sur 24.** Cause lue dans le
`write_payload` : `"member_ids": []`. `decideBoxEnergy` exige
`memberIds.length === 1` — la règle du LOT F, écrite pour refuser le chiffre sur
le **bac de la table**. Une boîte sans nom y tombe pareil, alors qu'ici elle
**est** la portion de l'unique personne. Ouvrir la garde à
`length === 0 && plan_kind === 'personal'` demande un `planKind` REQUIS chez
`decideBoxEnergy` : c'est une modification d'une garde de sécurité, **laissée à
l'arbitrage du propriétaire**.
