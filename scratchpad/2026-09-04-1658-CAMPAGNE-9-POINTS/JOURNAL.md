# Campagne « 9 points » — journal

> Ouvert le 2026-09-04 17:00. Branche `ff-001-quotidien-du-coach`.
> Plan : `~/.claude/plans/ok-alors-j-aimerais-que-federated-kernighan.md`.
> ⛔ Écrit au fil de l'eau. Un attendu se pose AVANT le tir, jamais après.

## Phase 0 — le socle, sans un seul appel modèle

### Les quatre fixtures (`10-fixtures.sh`, contrôlées par `15-verif-fixtures.sh`)

| compte | bouches | ce qu'il porte |
|---|---|---|
| `qa-9pts-solo` | 1 | homme 82 kg, `fat_loss` 0,5 kg/sem, balanced, 2 courses, congélateur |
| `qa-9pts-duo` | 2 | Julie (maintenance) + Marc (fat_loss 0,5) ; **goût** « champignons » sur Julie ; envie « raviolis aux champignons » |
| `qa-9pts-quatre` | 4 | Paul (fat_loss) + Claire + Léo (12 ans) + **Nora vegan** |
| `qa-9pts-cinq` | 5 | Sonia (fat_loss) + Marc (muscle_gain) + **Léa végé** + **Tom allergie œuf** + **Zoé allergie arachide** ; goûts champignons/lentilles sur Marc ; envie raviolis + pizza vendredi |

### ⛔ Deux pièges de fixture payés, et ils sont des faits de produit

**① La bouche du titulaire refuse DEUX portes sur trois, pas trois.**
`keel_household_set_member_goal` et `set_member_diet` rendent `has_account` — sa
direction vit sur `student_goals`. Mais **`set_member_body` l'ACCEPTE**, et il le
FAUT : `mouthTargetKcal` est nourrie par `lineBodies`, c'est-à-dire
`keel_household_bodies_for(p_household)`, clavée sur `member_id`. `profiles` +
`student_body_measures` ne servent QUE le brief du modèle
(`loadHouseholdMemberBodies`, clavée sur `user_id`).

⇒ **Un titulaire sans ligne dans `household_member_bodies` est un titulaire sans
CIBLE** : `structure.reason = no_body`, aucune boîte pesée pour lui, et la mesure
du point 5 aurait été fausse pour une raison qui n'est pas le produit. J'avais
retiré l'appel par sur-correction après le refus sur l'objectif ; rétabli.

⚠️ **Et ce n'est pas qu'un artefact de banc** : en base, **36 titulaires sur 58**
portent une ligne de corps. Les 22 autres composent sans cible pour eux-mêmes.
Trou nommé, hors périmètre de cette campagne.

**② Le dégoût n'est pas une règle de maison.** `keel_household_add_restriction`
écrit dans `household_food_restrictions`, le VERROU domestique qui refuse le plat
et censure le « pourquoi ». Un goût est un `food.exclude` de `retained_items`,
écrit par `keel_write_retained_items` **avec le jeton de la personne** (la RPC lit
`auth.uid()` et est morte sous `service_role`). Les deux fixtures à goût passent
par là, comme `addWrittenFoodExclusions` côté écran.

### Point 8 — TRANCHÉ SANS UN APPEL MODÈLE (`50-simule-T.ts`)

Les fonctions pures du produit, rejouées (jamais recopiées) sur
`heure × rythme`. `SHOPPING_CUTOFF_HOUR = 18` ; passés : petit-déj 10, déjeuner
14, dîner 21, **goûters jamais**.

| heure | rythme | servi aujourd'hui | fenêtre 3 j | verdict |
|---|---|---|---|---|
| 11–13 h | b/l/d | **déjeuner + dîner** | intacte | 🔴 T1 — le déjeuner est servi alors qu'il faut faire les courses |
| 14–17 h | b/l/goûter/d | **goûter + dîner** | intacte | 🔴 T2 — le goûter n'a aucune heure, il ne tombe jamais |
| 18–20 h | b/l/d | **dîner** | intacte | 🔴 T3 — le plus grave : `cookingAskedToday = false`, le produit SAIT que les courses sont fermées, et sert quand même un dîner du jour |
| 21 h+, 3 j | b/l/d | aucun | **retirée → 2 j** | ✅ T4 (déjà prouvé le 04/09) |
| 21 h+, 1 j | b/l/d | aucun | `single_day` | ⚠️ T5 — refus `422 day_already_spent` là où la demande est « décale au lendemain » |
| 14 h+, b/l sans dîner | — | aucun | retirée → 2 j | ✅ le retrait mord dès que le rythme n'a pas de repas tardif |
| `null` (horloge illisible) | — | tout | intacte | ✅ produit d'hier, nommé |

⇒ **Le lot B est confirmé nécessaire avant d'avoir dépensé une génération.** Deux
tirs réels suffiront à le prouver en conditions réelles : un à 12 h (T1) et un à
19 h (T3). T0 ne vaut pas un tir : à 7–9 h rien n'est passé, et c'est juste.

## Phase 1 — la série C (en cours)

Sept tirs `intent: draft`, un après l'autre. Attendus posés dans le plan §3.

---

## C01 — solo, 7 jours, `fat_loss` 0,5 kg/sem, 82 kg (HTTP 200, 77 s)

### ✅ Point 3 (barquettes, lane solo)

18 plats, **6 puisent dans un lot, 6 portent une boîte, zéro manquante**.
`member_ids: []` sur les six — la boîte solo ne porte aucun prénom, comme voulu.
Une boîte, telle quelle : `box_fri_dinner` · poulet rôti 150 g · légumes rôtis
200 g · couscous cuit 225 g. Aucune case (jour × moment) ne porte deux plats.

### ✅ Point 2 (le style et les courses sont DITS) — au cas nominal

Contre l'attendu du plan, qui craignait un silence hors plafond, les deux faits
sortent sans qu'aucun plafond ne morde :

> « Le plan pose 2 sessions de cuisine : vendredi et lundi. »
> « Les courses se font en 2 fois : vendredi et samedi. »

⚠️ Ce qui n'est PAS dit, c'est le STYLE lui-même (« un juste milieu ») — seul son
effet l'est. À trancher à l'écran : est-ce que la personne a besoin de relire sa
réponse, ou seulement sa conséquence ?

### 🔴 Point 5 (les calories sont-elles COHÉRENTES) — non, et le produit le dit

Enveloppe calculée par le produit pour ce corps : **2 059–2 175 kcal/j**,
plancher protéine **164 g**. Servi :

| | |
|---|---|
| jours complets (5) | **1 379 kcal/j** en moyenne = **67 %** de la borne basse |
| hors 1er jour tronqué (4) | 1 532 kcal/j = **74 %** |
| protéine | **93 g/j** = **57 %** du plancher |
| dispersion | 770 → 1 879 kcal, soit **144 %** d'écart entre deux jours |
| verdict du produit | `energy: below` · `protein: under` · `density: within` |
| résolution | 136/138 termes (2 inconnus, aucun dense) — ce n'est PAS un artefact de mesure |

C'est la cicatrice `plans-underfeed-their-own-envelope`, **toujours ouverte, et
mesurée après FF-060**. Le produit connaît sa cible, la calcule, juge son propre
plan `below`, et ne le dit à personne : `issues` n'a aucun lecteur d'écran.

⚠️ **Une faute d'instrument payée en passant, et elle vaut d'être écrite** : mon
premier fichier de corps portait des clés `snake_case` (`weight_kg`, `height_cm`)
là où `envelopeFor` lit du `camelCase`. Résultat : `!weightKg` ⇒
`DEGRADED_ENVELOPE` (`mode: per_portion`), donc **aucune énergie, aucune
maintenance, `energy: not_computable`** — et ça se lit comme un produit qui
s'abstient alors que c'est l'instrument qui n'a rien passé. La forme attendue
était lisible dans `body-S1.json`, à côté.

### ⚠️ Ce que C01 ne peut PAS dire

Le point 5 a deux moitiés. Celle-ci est la COHÉRENCE. **L'AFFICHAGE** demande un
plan ÉCRIT (`meal-energy-v1` lit `student_generated_meals`, un brouillon n'y est
pas) — il passera à la phase écran.

## C02 et C03 — perdus, et pour deux raisons différentes

| | |
|---|---|
| **C02** (duo) | 546 `WORKER_LIMIT` après 217 s, `llm_usage delta=4` — collision avec la campagne d'une session voisine sur la même pile. Le modèle a été payé, la réponse est perdue. |
| **C03** (quatre) | 546 aussi, **puis mon script est mort en vol** : `NOW: unbound variable`. J'ai édité `20-run.sh` PENDANT qu'il tournait. Bash relit le fichier par OFFSET — l'édition a décalé les lignes sous le processus. |

⛔ **La leçon est arrivée dix minutes après qu'une session voisine me l'a
écrite**, mot pour mot : *« ne jamais éditer le script de banc pendant qu'il
tourne »*. Elle l'avait payée treize minutes d'appels modèle ; je l'ai payée un
tir. On exécute une **copie figée** (`25-serie-fige.sh`), et on n'édite que
l'original.

---

## LOT D livré — le Boxing dit ce qui part au congélateur (point 4)

Livré **pendant** que la pile générait : `functions serve` ne surveille que
`supabase/functions/`, le front ne réveille pas son watcher.

### Le défaut, tel qu'il était

`uses[].kept === "freezer"` existe depuis le 2026-09-01, la garde de fenêtre le
lit, et un plan à session unique sur sept jours n'est composable QUE par lui.
Mais à l'écran, la seule mention du congélateur était `DishCard` — **quatre
jours plus tard**, au moment de SORTIR la part (« sors-la du congélateur la
veille »). Devant l'évier, en remplissant six bacs, rien ne disait lesquels y
vont. **On demandait de sortir une part que personne n'avait rangée.**

### Ce qui est livré

| | |
|---|---|
| `lib/mealBoxes.ts` | `BoxLine.frozen`, dérivé de `uses[].kept` **par `preparation_id`**, jamais de la prose `method` |
| `plan/BoxTable.tsx` | « · à congeler » sur le couvercle (les DEUX surfaces) + « · dont {n} au congélateur » en tête du Boxing (session seulement) |
| `i18n fr/en` | `meals.boxes.freeze`, `meals.boxes.freeze_count` |

Quatre décisions, chacune avec son motif dans le code :
- **`some`, pas `every`** — un bac qui mélange une part congelée et une fraîche part au congélateur : c'est le geste le plus contraignant qui décide.
- **`frozenPreparations` REQUIS, jamais `?`** — un paramètre optionnel rendrait `frozen: false` chez l'appelant qui l'oublie, c'est-à-dire un marqueur éteint indiscernable d'un plan sans congélation.
- **Muet à zéro** — « 0 au congélateur » apprendrait à ne plus lire cette place.
- **Un plan v2 relu ne se voit inventer aucune congélation** — aucun `item`, donc aucune jointure, donc `false`. La bonne direction : personne n'a rien mis au congélateur en 2026-08.

### Les épreuves — 8 neuves, et la contre-épreuve d'abord

Un cas qui MARQUE **et** un cas qui NE MARQUE PAS ; la jointure par casserole
(deux casseroles, une seule congelée ⇒ un seul bac marqué) ; l'ajout frais du
jour (`preparation_id: null`) ; le plan v2 ; le rendu ; **le rendu muet** ; les
deux surfaces.

| Mutation | Rouges |
|---|---|
| `frozen: true` inconditionnel | **5** — dont « LE RENDU MUET » |
| jointure par plat (`frozenPreparations.size > 0`) | **3** — dont l'ajout frais et le plan v2 |
| compte en tête débranché | **1** |

Restaurations par `cp`, **prouvées par `cmp`**. `tsc -p tsconfig.app.json` : rc=0.
53/53 sur `mealBoxes.int.test.ts`, parité i18n verte.

---

## C02 — duo, 7 jours (HTTP 200, 180 s) · Julie `maintenance` + Marc `fat_loss`

Décor : envie « des raviolis aux champignons cette semaine », **et Julie n'aime
pas les champignons**. C'est l'exemple exact du point 9, monté exprès.

### ✅✅ Points 6 et 7 — le modèle compose la boîte d'échange LUI-MÊME

> **fri/dinner — « Raviolis aux champignons, poulet, courgettes et salade »**
> BOÎTE [Julie] : poulet rôti 66 g · courgettes et poivrons rôtis 90 g · **raviolis aux épinards 108 g**
> BOÎTE [Marc]  : poulet rôti 78 g · courgettes et poivrons rôtis 108 g · **raviolis aux champignons 108 g**

L'envie est servie, la personne qui n'aime pas les champignons n'en reçoit pas,
et **la ceinture n'a rien eu à retirer** :
`exclusion_belt {mouths:1, checked:9, bites:1, separated:1, not_separated:0, refused:0}`.
Contrôle indépendant depuis l'assiette : **0 violation**.

⚠️ **C'est mieux que ce que la demande craignait.** L'attendu écrit était « il y
en a forcément, donc il faut l'expliquer ». Le produit fait un cran de plus : il
ÉVITE le compromis en composant deux boîtes. La question du point 9 se déplace —
ce qu'il faut expliquer n'est pas « tu vas manger des champignons », c'est
« l'envie est servie ET ta boîte n'en a pas ».

### ✅ Point 3 — deux bouches, deux groupes, compte exact

`boxes: 18 / expected: 18` · `refused: 0` · `names_refused: 0` ·
`mouths_unboxed: 0` · `mouths_double: 0` · `meals_delivered {expected:42, fed:42, missing:0}`.

9 repas puisent dans un lot × 2 groupes = 18 contenants. Les 12 autres cases sont
des plats cuisinés le jour même — **aucune boîte, et c'est la spec** (v4 : un plat
sans `uses` n'en porte pas).

### ✅ Point 5 (moitié moteur) — le tri-état fonctionne à l'échelle de la bouche

`box_sizing.mouths {sized: 1, no_direction: 1}` — Marc (`fat_loss`) est **pesé**,
Julie (`maintenance`) ne l'est pas. C'est la règle, pas un défaut.
Grammes servis sur la semaine : **Marc 3 943 g contre Julie 3 238 g** — la
direction et le corps déplacent bien la part.

### 🔴 Point 9 — `explanation` ABSENT de la réponse, confirmé sur un plan réel

Et la matière existe : le modèle a écrit son arbitrage **dans `dishes[].why`** —
« Les raviolis aux champignons restent au menu, avec une variante de raviolis aux
épinards et du poulet pour compléter le plat. » Une phrase juste, enterrée sous
un plat, que l'aperçu ne montre pas. **Le lot A n'a pas à inventer une capacité :
il a à lui donner une clé et une place.**

### ✅ Point 2 — les deux réponses sont dites au cas nominal

> « Le plan pose 2 sessions de cuisine : vendredi et lundi. »
> « Les courses se font en 2 fois : vendredi et samedi. »

Plus, sans qu'on l'ait demandé : « Les quantités sont faites pour 2 bouches. »,
« Chaque personne a chacun de ses repas. »

### ⛔ Point 1 et 4 — le constat, sur un plan à deux sessions

`uses[].kept: {fridge: 19}` · `uses_kept_freezer: 0/19` · **aucun champ « à
congeler » sur les 44 lignes de courses**. Rien à congeler ici, et c'est juste :
deux sessions, tout tient au frigo. Le cas qui mord est C04.

---

## C03 — quatre bouches, Nora **vegan**, 2 sessions (HTTP 200, 131 s)

### ✅✅ Point 7 — la base commune diverge par un COMPOSANT, exactement comme demandé

> « Poulet **ou tofu**, pommes de terre et légumes rôtis »
> NORA : tofu rôti 112 g · légumes 151 g · pommes de terre 134 g
> Paul : poulet rôti 159 g · légumes 214 g · pommes de terre 189 g
> Claire+Léo : poulet rôti 190 g · légumes 256 g · pommes de terre 225 g

`regime_belt {mouths:1, checked:18, bites:12, separated:12, not_separated:0, refused:0}`
— le modèle a séparé **12 fois sur 12**, la ceinture n'a rien eu à retirer.
**18 boîtes de Nora, 0 produit animal** (contrôle indépendant).
`meals_delivered {expected:119, fed:119, missing:0}` — personne n'est privé.

Et la phrase le dit : « La base du plat commun est végane : c'est la ligne de
Nora, qui a sa boîte. Le reste de la table garde la sienne. »

### 🔴 Point 3 — 42 contenants rendus pour **48 attendus**

`boxes: 42 / expected: 48`, `mouths_unboxed: 12`. Six contenants manquent. Aucun
refus du parseur (`refused: 0`) : le modèle ne les a simplement pas écrits.

### 🔴 Point 5 — la table reçoit **55 %** de ce que le produit calcule pour elle

| bouche | cible du produit | |
|---|---|---|
| Paul (`fat_loss`) | 2 565–2 835 kcal · 131 g prot. | |
| Claire | 1 887–2 085 · 96 g | |
| Léo (mineur) | 2 336–2 582 · 38 g | |
| Nora (vegan) | 1 830–2 022 · 93 g | |
| **somme des planchers** | **8 618 kcal · 358 g** | |
| **servi par le plan** | **4 721 kcal/j · 320 g** | **55 % · 89 %** |

⚠️ **Et aucune mesure PAR BOUCHE n'est possible** : `mouthDayEnergy` s'abstient
sur les quatre bouches, tous les jours (`gaps: no_box, common_pot`). Le produit
ne peut donc pas dire à Paul s'il est nourri — ni le lui montrer.

Le moteur SAIT et le compte : `anchor {anchored:3, clamped:7}`,
`unmet_band {lt_200:1, gte_200:4}` sur C02, et sur C03 deux plafonds de fournée
nommés dans `issues` (« the sized meals would take 8 664 g but the batch makes
about 6 375 g »). **Rien de tout ça n'atteint l'écran.**

⚠️ **Une faute d'instrument, attrapée avant de conclure faux.** Ma première
version résolvait les `items[].term` d'une boîte. « poulet rôti » n'existe pas au
référentiel (42 alias portent « poulet », aucun n'est celui-là), donc les boîtes
carnées sortaient SANS leur viande : **4 g de protéine pour Paul contre 20 pour
la végane**, la conclusion inverse de la vérité. Le produit, lui, PRORATE depuis
les ingrédients du PLAT (`mouth_energy.dishSlices` : « le dénominateur est le
plat entier, pas un couvercle »). Instrument réaligné sur le produit.

---

## C04 — quatre bouches, **UNE seule course** + congélateur (HTTP 200, 148 s)

# 🔴🔴 LA TROUVAILLE DE LA CAMPAGNE : le plan promet le congélateur et sert 3 jours sur 7

Le moteur accorde la session unique (`one_cooking_session: 1/1`) et l'annonce :

> « Tout est cuisiné vendredi, en une seule fois : ce qui ne tiendrait pas au
> frais jusqu'au repas **part au congélateur**. »

**Et il n'y a pas une seule portion congelée.** `uses[].kept: {fridge: 30}`,
`uses_kept_freezer: **0/30**`.

Le modèle a pourtant COMPRIS le geste — il l'écrit **sept fois, en prose** :

> « Refroidir puis portionner dans les boîtes ; **congeler les portions de lundi
> à jeudi**. » · « Sortir la boîte du congélateur la veille. » · « Un dîner
> pratique qui marque la transition vers les portions congelées. »

Il écrit la congélation dans la MÉTHODE et `"kept": "fridge"` dans la CLÉ. La
garde de fenêtre lit la clé, jette tout ce qui dépasse trois jours, et le plan
rend :

    plats par jour : fri 6 · sat 6 · sun 6   —   lun, mar, mer, jeu : ZÉRO
    empty_slots    : 24 créneaux

**Quatre jours sur sept entièrement vides**, sous une phrase qui promet le
congélateur. La personne lit les deux, à trois lignes d'écart.

⛔ **C'est la cicatrice du 2026-09-01 §8.1, revenue par l'autre bout.** À
l'époque : « le modèle a pris cette liberté, trois fois, en toutes lettres. Le
parseur l'a jetée — il n'existe AUCUNE clé pour la lire. » Le lot `uses[].kept`
a créé la clé et mesuré **21 plats sur 21**. Aujourd'hui la clé existe, le modèle
écrit toujours la prose, et **il n'écrit plus la clé**.

⚠️ Ce qui a changé entre les deux mesures : **FF-060 dérive six moments par
jour** au lieu de trois. 42 plats à composer au lieu de 21, et la clé tombe.
Hypothèse à éprouver, pas une conclusion.

Autres constats du même tir :
- `cooking session on fri runs 220 min, but they said they have about 120` — le débordement est **dit** (« prendra plutôt 3 h 40 min que 2 h »). ✅
- `shopping_waves: 1` sur 22 lignes, toutes datées. ✅
- **Aucun champ « à congeler » sur une ligne de courses**, confirmé une troisième fois.

# 🔴 Et un FAUX POSITIF de la ceinture végane, trouvé par le même tir

    dishes[0].boxes["box_fri_breakfast_nora"]:
      … is vegan and "Muffins aux œufs ou au tofu…" breaks that line (moules)
      -- mouth dropped from the box

Le terme qui mord est **`moules`**. Il vient de la méthode de la préparation
**faite pour elle** :

> `prep_tofu_breakfast` — « Émietter le tofu, le mélanger aux légumes coupés et à
> l'huile, **remplir des moules** et cuire à 190 °C. »

Ce sont des moules à muffins. La ceinture y lit le coquillage, retire Nora de sa
propre boîte au tofu **trois fois** (`held_off_regime: 3`,
`meals_delivered.missing: 3`), et le plan le lui dit trois fois :

> « Nora : 9 repas sur 12. Il manque vendredi au petit-déjeuner — le plat ne suit
> pas la ligne déclarée. »

**On annonce à une végane que son muffin au tofu ne respecte pas son régime,
parce que la recette dit de remplir des moules.**

Cause : `dishScanSources` (`meal_generation.ts:5045`) met `prep.method` dans la
surface scannée — légitime (« ajouter du beurre » compte) — et `moules` est un
homographe parfait de l'ustensile en français. C'est
`never-hand-roll-a-matcher-here` sous une forme neuve : ce n'est pas un préfixe
qui mord (« laitue » / « lait »), c'est un mot **entier** qui a deux sens.

---

## C05 — quatre bouches, une course, **SANS congélateur** (HTTP 200, 356 s)

### ✅ Point 2 — le refus est nommé, et le plan se pose lui-même

> « Une seule session de cuisine demande un congélateur, et il n'y en a pas de
> déclaré : le plan pose lui-même ses sessions. »

2 sessions, **7 jours servis sur 7**, 6 moments par jour. Sans l'illusion du
congélateur, le plan est complet. À comparer à C04, même foyer, **3 jours sur 7**
*parce que* le congélateur était déclaré.

⛔ **Le congélateur déclaré rend le plan PIRE que son absence.** C'est le
renversement le plus contre-intuitif de la campagne, et il est mesuré sur le
même foyer à trois minutes d'écart.

### 🔴🔴 Point 7 — même foyer, même végane, **0 séparation sur 10**

    C03 (2 courses)   bites 12  separated 12  not_separated  0  missing  0
    C05 (1 course)    bites 10  separated  0  not_separated 10  missing 10

Le modèle a nommé Nora **sur le bac commun au poulet** (`box_fri_lunch_claire_leo_nora`),
dix fois. La ceinture l'a retirée dix fois, elle se retrouve sans boîte, et le
plan lui compte **10 repas manquants sur 28**.

Ce n'est **pas** un faux positif : les termes qui mordent sont `poulet` (6) et
`dinde` (4). Le plat s'appelle « Poulet, quinoa et légumes rôtis ».

⇒ **La séparation par boîte d'échange est une capacité RÉELLE du modèle et une
capacité INSTABLE.** Même décor, deux tirages, 12/12 puis 0/10. Aucun de ces deux
chiffres ne se généralise, et un lot jugé sur un seul tir se croirait livré.

### 🔴 Ce que la personne lit : **dix fois la même phrase**

Dix lignes de rationale quasi identiques, une par repas manquant :
« Nora : 18 repas sur 28. Il manque vendredi au déjeuner… », « …vendredi au
dîner… », « …samedi au déjeuner… ». Sur 19 lignes de rationale, dix disent la
même chose. Angle utilisateur : illisible.

### 🔴 `retried: false` MENT — la relance a bien tourné, et elle a été rejetée

`meals_delivered {missing: 10, missing_before: 10, retried: false}`. On lirait
« aucune relance ». La table des appels modèle dit l'inverse :

    15:37:19  generate-household-meal-v1                 gpt-5.6-luna  success
    15:39:17  generate-household-meal-v1.protein_anchor_retry  gpt-5.6-luna  success
    15:41:13  generate-household-meal-v1.unfed_retry           gpt-5.6-luna  success

**Une relance a été payée, elle a réussi côté modèle, et son résultat a été
refusé** par la condition d'acceptation (`retried.dishes.length >= … && after.missing < …`).
`retried: false` confond donc « pas tentée » et « tentée puis rejetée » —
exactement la cicatrice `{demandé, obtenu}` qui rend le même zéro pour deux
causes opposées. Il manque un `attempted`.

⚠️ **Et une note qui périme une fiche de mémoire** : le modèle servi est
**`gpt-5.6-luna`**, pas `gpt-5.4-mini`. La fiche
`household-generator-skips-keel-generation-model` est à amender.

---

## C06 — cinq bouches, `keen`, 3 courses (HTTP 200, 365 s)

Décor : Léa végétarienne · Tom **allergie œuf** (médicale) · Zoé **allergie
arachide** · Marc dégoûts champignons + lentilles · envie « raviolis aux
champignons, et une pizza vendredi soir ».

### ✅✅ Point 6 — les allergies MÉDICALES sont parfaitement tenues

Recherche sur **tous** les plats, préparations, méthodes ET lignes de courses :

| | |
|---|---|
| œuf / egg / omelette / mayonnaise | **0 occurrence** |
| arachide / cacahuète / peanut | **0 occurrence** |
| champignon (dégoût) | **0 occurrence** |

La ceinture d'allergie mord, et elle mord en amont : le menu entier est composé
sans ces aliments, ils n'apparaissent même pas sur la liste de courses.

### 🔴 Point 6 — mais le DÉGOÛT passe, parce que le plat n'a pas de boîte

    tue/lunch « Lentilles, feta, tomate et concombre »   uses=0   boxes=0

Marc n'aime pas les lentilles. Le plat est composé, il est sur la liste de
courses, et `exclusion_belt {checked: 6, bites: 0}` — **la ceinture ne l'a jamais
regardé.** Elle est `box_scoped: 6` : elle ne juge que les six contenants du
plan, et un plat cuisiné le jour même n'en porte aucun.

⛔ **L'invariant « personne sans repas » est satisfait et il ne dit rien du
goût.** `BOITES-PAR-REPAS.md` l'écrit : « Un plat de table sans aucune boîte ⇒
Nourrie (rien n'a été pesé, tout le monde mange) ». Vrai pour la faim, faux pour
la personne : Marc a un déjeuner de lentilles et **rien ne le signale**.

Trou nommé : **la ceinture de dégoût ne couvre que les repas mis en boîte.** Sur
ce plan, 6 repas sur 30.

### 🔴🔴 Point 3 — 6 contenants pour 24 attendus, un seul composant chacun

`boxes: 6 / expected: 24` · `refused: 6` · `capped: 6` · `items: 6` — **un item
par boîte**. Les six sont des bacs à quatre noms (Léa exclue). Le protocole v4
demande un contenant par groupe présent ; le modèle en a rendu un quart, et
chacun ne décrit qu'un aliment.

Et trois sessions ne portent **qu'une préparation chacune** (`fri 75min (1 prep)`,
`sun 80min (1 prep)`, `tue 55min (1 prep)`) : trois casseroles pour cinq bouches
sur sept jours.

### 🔴 Deux jours entièrement vides

« Sur mercredi et jeudi, le petit-déjeuner, la collation du matin, le déjeuner,
le goûter, le dîner et la collation du soir n'ont pas été composés. » — 12
créneaux. C'est **dit**, et c'est tout ce qu'on peut en dire de bien.

### 🔴 L'envie n'est pas servie, et personne ne le dit — LE CAS DU POINT 9

Ni pizza ni raviolis dans le plan. La ligne existe en base pour la **bonne
semaine** (`week_start = 2026-08-31`, et `weekStartOf('2026-09-04')` rend
exactement cette date — vérifié), et le canal fonctionne : C02 a servi ses
raviolis.

L'arbitrage est même **plausible** : les raviolis demandés sont aux champignons,
et Marc les déteste — le modèle a probablement préféré ne pas les composer. Mais
`request_report: 0 ligne` et `explanation: absent`. La personne demande une pizza
pour vendredi soir, n'en a pas, et **aucune ligne du plan ne parle de sa
demande**.

⇒ **C'est le cas d'usage du point 9 dans sa forme la plus pure** : un arbitrage
réel, défendable, invisible.

### ⚠️ Sur le pari des deux sessions voisines (largeur vs nombre de contraintes)

    C03  vegan seul, 2 sessions   separated 12/12   missing 0
    C04  vegan seul, 1 session    separated  6/9    missing 3   (+ faux positif « moules »)
    C05  vegan seul, 1 session    separated  0/10   missing 10
    C06  4 porteurs, 3 sessions   separated  0/6    missing 6

Ni la largeur de la ligne ni le nombre de porteurs ne prédisent le résultat :
**le même foyer vegan donne 12/12 et 0/10 à quatre minutes d'écart.** Ce qui
domine est la **variance du modèle**, pas le décor. Un lot jugé sur un tirage se
croirait livré.

---

## C07 — cinq bouches, `minimal`, 3 courses (HTTP 200 au 2e essai, 384 s)

⚠️ **Un 502 au premier essai, et il n'était de personne** : le conteneur edge a
été **recréé à 15:49:27** pendant le tir, alors qu'**aucun fichier n'a été écrit
sous `supabase/functions/` dans les six minutes** (vérifié) et que
`functions serve` tournait depuis 14:44. `llm_usage delta = 0` — rien n'a été
dépensé, le rejeu a mordu. Le watcher n'est donc pas la seule cause de
recréation ; il y en a au moins une autre, non identifiée.

### ✅ Point 2 — la phrase du plafond de style sort mot pour mot

> « Tu as choisi de cuisiner le moins possible : **2 sessions suffisent, même avec
> 3 courses**. La dernière ne sert qu'au frais du jour. »
> « Avec 1 h par semaine en cuisine, tout le monde mange le même plat — c'est ce
> que le temps permet. »

### ✅✅ Points 1 et 4 — LE CAS OÙ LE CONGÉLATEUR FONCTIONNE

`uses[].kept: {fridge: 9, **freezer: 4**}` — le modèle a écrit la clé. Et
**12 contenants portent un item qui vient d'un lot congelé**. Le plan couvre ses
7 jours.

⇒ **La population du lot D existe et elle est large** : 12 boîtes sur 39, sur un
plan ordinaire. Le marqueur « à congeler » du Boxing aurait quelque chose à dire
ici, et il ne disait rien avant ce lot.

⇒ Et ça **confirme le diagnostic de C04 par contraste** : le modèle SAIT écrire
`kept: "freezer"`. En C04 il ne l'a pas fait, et quatre jours sont tombés.

### ✅✅ Point 6 — le dernier recours tire, et il le DIT

> « Marc : 39 repas sur 40. Il manque vendredi au dîner — le plat contient un
> aliment noté comme évité. »
> « **Marc garde sa part vendredi au dîner : le plat contient un aliment noté
> comme évité, et c'était ça ou pas de repas.** »

Les raviolis aux champignons de l'envie sont composés (8 occurrences), Marc les
déteste, la ceinture l'a retiré, **et le dernier recours l'a remis avec la phrase
honnête**. C'est exactement la doctrine : on annule le geste du moteur pour un
DÉGOÛT, jamais pour un régime.

⇒ **L'exemple du point 9 dans l'énoncé est DÉJÀ traité par le produit**, et de
façon déterministe. Ce que le point 9 ajoute n'est pas cette phrase-là ; c'est
l'arbitrage que le modèle a fait AVANT elle (composer les raviolis quand même) et
que personne ne raconte.

### 🔴 Léa manque 12 repas sur 33, terme mordu `Poulet` ×12, `separated: 0`

Et **douze lignes de rationale identiques** sur les vingt-cinq du bloc.

### 🔴 Point 3 — 39 contenants pour 51 attendus

---

# BILAN DE LA PHASE 1 — sept tirs, ce qui est prouvé et ce qui ne l'est pas

| # | Point | Verdict | Preuve |
|---|---|---|---|
| 1 | congélation sur la liste de courses | 🔴 **inexistant** | 7 tirs, 7 fois `aucun champ`. Et le couplage est à l'envers : `sessions ≤ courses` |
| 2 | style + courses dits dans le plan | ✅ | C01, C02, C03, C05, C07 — au cas nominal ET sur chaque plafond, avec le motif |
| 3 | barquettes à 1 / 2 / 3+ | ✅ à 1 et 2 · 🔴 à 4 et 5 | solo 6/6 · duo **18/18** · quatre 42/48 · quatre 24/27 · cinq **6/24** · cinq 39/51 |
| 4 | congélation dite dans le Boxing | 🔴 → **lot D livré** | C07 : 12 boîtes concernées, zéro marque avant le lot |
| 5 | kcal par repas, cohérentes | 🔴 **les deux moitiés** | solo 1 379 kcal/j pour une cible 2 059–2 175 · foyer 4 721 pour 8 618 · **aucune mesure par bouche possible** (`no_box`, `common_pot`) |
| 6 | allergies / dégoûts / régimes | ✅ allergies · 🔴 dégoûts | œuf 0, arachide 0, champignon 0 quand déclaré · mais un plat SANS boîte échappe à la ceinture (lentilles de Marc) |
| 7 | minorité de régime | ✅ **la capacité existe** · 🔴 **elle est instable** | C03 12/12 séparations · C05 0/10 · même foyer, 4 min d'écart |
| 8 | délai de courses le jour même | 🔴 **tranché en pur** | 12 h sert le déjeuner · 16 h le goûter · 19 h le dîner sans course possible |
| 9 | explication IA de l'aperçu | 🔴 **absent des 7 réponses** | et la matière existe : le modèle écrit ses arbitrages dans `dishes[].why` |

## Ce que la phase 1 a trouvé et que personne n'avait demandé

1. **Le congélateur déclaré rend le plan PIRE que son absence** (C04 3 j/7 contre C05 7 j/7, même foyer).
2. **« remplir des moules » est lu comme des coquillages** et retire une végane de sa propre boîte au tofu.
3. **`retried: false` ment** : une relance payée et rejetée se lit « aucune relance ».
4. **La ceinture de dégoût ne voit que les repas mis en boîte** — 6 sur 30 en C06.
5. **Dix à douze lignes de rationale identiques** quand une bouche manque plusieurs repas.
6. Le modèle servi est **`gpt-5.6-luna`**, pas `gpt-5.4-mini` : une fiche de mémoire est périmée.

---

## LOT G livré — le mot qui en nomme un autre (point 6)

### Ce qui est corrigé

Une liste **fermée**, `HOMOGRAPH_PHRASES` (`_shared/keel/dietary_regime.ts`), dont
la portée éteint une morsure prise dedans — **le mécanisme qui existait déjà**
pour les analogues végétaux (« lait » dans « lait d'avoine »), pas un matcher
neuf.

Deux familles, chacune mesurée et non devinée :

| | éteint | mord toujours |
|---|---|---|
| le récipient | « remplir des moules », « moules à muffins », « démouler », « muffin tins » | « moules marinières », « des moules et des frites » |
| la pâte | « la pâte », « pâte à tarte », « étaler la pâte », « des pâtes » | « du pâté de campagne », « une tranche de pâté » |

⛔ **Le discriminant du français est l'ARTICLE**, et c'est ce qui rend la liste
sûre : « la pâte » est de la pâte, « le pâté » est du pâté. `du pate` et
`le pate` ne sont **pas** dans la liste — ce sont les formes qui doivent mordre,
et une contre-épreuve les tient.

⛔ **`prep.method` reste dans la surface scannée.** C'est la réparation qui vient
à l'esprit et elle désarmerait une vraie garde : « ajouter une noix de beurre »
n'est écrit nulle part ailleurs.

### La seconde trouvaille, faite EN écrivant l'épreuve du premier

Mon cas de portée attendait une morsure (le beurre) et en a rendu deux :

    « Étaler la pâte à tarte. » → [{"token":"pate","matchedText":"pâte"}]

`normalizeForMatch` retire les diacritiques : `pâte` et `pâté` sont **le même
mot** pour le moteur. Une végane perd son repas dès qu'une recette dit d'étaler
la pâte — et une pâte à tarte est plus fréquente dans une cuisine qu'un moule à
muffins. La mémoire du dépôt le nommait « irréparable par alias » : il l'est par
alias, **pas par portée**.

### Le compteur, et pourquoi il est séparé

`silencedByHomograph` (scan) → `silencedHomograph` (agrégat) →
`silenced_homograph` (ceinture foyer) / `homograph_silenced` (journal solo).

⛔ **Jamais fondu dans `silenced`.** Un analogue végétal éteint un aliment
présent sous forme végétale ; un homographe éteint un mot qui ne nomme pas cet
aliment. Le jour où l'extinction mord de travers sur un vrai coquillage, ce
compteur est le seul endroit où ça se verra.

### Un défaut de câblage attrapé par l'épreuve, pas par la relecture

Le premier run des tests a rendu `breaches: []` (l'extinction MARCHAIT) et
`silencedByHomograph: []` (son compteur restait à zéro) : `scanDietaryRegime`
fusionnait **deux** des trois listes de `scanProse` et pas la troisième. Une
garde qui se désarme sans rien dire — c'est exactement ce qu'un test de compteur
existe pour attraper, et la relecture ne l'avait pas vu. Corrigé sur les deux
voies (`prose` et `items`).

### Portes

`deno test _shared/keel/` en entier : **5 351 passés, 0 échec**. `deno check`
vert sur les quatre fonctions. Mutation « portée retirée » ⇒ **4 rouges** ;
restauration par `cp`, prouvée par `cmp`.

---

# 🔴🔴 CORRECTION DU BILAN — « la variance du modèle domine » ÉTAIT FAUX

J'ai écrit au bilan de phase 1 : *« Ni la largeur de la ligne ni le nombre de
porteurs ne prédisent le résultat : le même foyer vegan donne 12/12 et 0/10 à
quatre minutes d'écart. Ce qui domine est la variance du modèle. »*

**C'est faux, et je l'ai cru parce que je lisais la mauvaise surface.**

## Ce que je lisais, et pourquoi ça ne pouvait rien dire

La ceinture **RETIRE le nom de la bouche** avant que la réponse ne soit
sérialisée. Lue sur le plan rendu, une bouche écartée n'apparaît sur **aucune**
boîte — et « le modèle n'a rien composé pour elle » devient indiscernable de
« le moteur le lui a retiré ». Mes 42 lectures portaient sur `dishes[].boxes`
d'après-ceinture.

`llm_raw_response_events` garde ce que le modèle a **réellement écrit**.
(Chemin donné par une session voisine, qui avait mesuré la même chose sur son
propre foyer.)

## Ce que le modèle a réellement écrit

    C05 · Nora VEGAN, tir principal
      10 boîtes à son nom, TOUTES seules
      ⛔ item animal dans sa boîte              :  0
      ⚠️ items propres, PRÉPARATION citée carnée : 10
      exemple: items ["tofu rôti","quinoa cuit","légumes rôtis"]
               cite  « Poulet, tofu, quinoa et légumes rôtis » (prep_roast)

    C07 · Léa VÉGÉTARIENNE, tir principal
      13 boîtes à son nom, TOUTES seules
      ⛔ item animal dans sa boîte              :  0
      ⚠️ items propres, PRÉPARATION citée carnée : 12
      ✅ items propres, préparation propre        :  1

⇒ **Le modèle compose la boîte d'échange correctement et de façon FIABLE :
10 fois sur 10, 13 fois sur 13, 12 fois sur 12 (C03).** Il n'y a pas de variance
sur ce geste.

## La vraie cause, et elle est dans la ceinture

`dishScanSources` (`meal_generation.ts:5045`) juge une boîte sur **la
préparation qu'elle cite**, titre et ingrédients compris. Quand le modèle cuit
les deux protéines dans **une seule fiche** — « Poulet, tofu, quinoa et légumes
rôtis », une plaque, le poulet d'un côté, le tofu de l'autre, ce que fait un vrai
cuisinier — la fiche porte « poulet », et la ceinture retire la bouche de sa
boîte de **tofu**.

    C03  le modèle fait DEUX préparations (poulet / tofu)  →  12/12 séparées, 0 manquant
    C05  le modèle fait UNE préparation (les deux dedans)  →   0/10, 10 manquants
    C07  idem                                              →   1/13, 12 manquants

**Ce qui varie n'est pas la séparation des BOÎTES, c'est l'organisation des
CASSEROLES.** Et le produit punit celle qui est la plus juste en cuisine.

⚠️ **Confirmé indépendamment sur un quatrième foyer** par une session voisine :
60 boîtes sur 89 propres mais citant une préparation carnée, dont 40 où la fiche
citée fait aussi le tofu. Deux bancs, deux foyers, deux fenêtres, même cause.

## Ce que ça change

| | avant correction | après |
|---|---|---|
| point 7 | « capacité réelle mais instable » | **capacité réelle et FIABLE ; c'est la ceinture qui la casse** |
| cause | variance du modèle | surface de scan de la ceinture |
| remède | prompt | **le scan d'une boîte qui déclare des `items` propres ne doit pas retomber sur une fiche partagée** — ou la consigne doit exiger deux préparations |

⛔ **Et la leçon de méthode est la plus chère de la campagne** : *une garde qui
retire une donnée avant la sérialisation rend son propre effet invisible dans ce
qu'on relit.* J'ai mesuré la sortie du moteur en croyant mesurer celle du modèle,
et j'en ai tiré une conclusion sur le modèle. Il fallait `llm_raw_response_events`.

Instrument : `45-ceinture.py` (rejeu sur la sortie brute, 40 lignes).

---

## LOT A livré — l'explication du modèle (point 9)

`agent-gate.sh` : **exit 0** · 5 381 Deno / 0 échec · vitest 2 320 / 0 rouge /
0 hors liste · typecheck des tests 87 pour une liste de 87 · `deno check` vert.

### Ce qui est livré, et qui parle

| | |
|---|---|
| `_shared/keel/plan_explanation.ts` | module PUR : la garde en cinq portes, `extractExplanation` |
| `household_meal_generation.ts` | `EXPLANATION_SCHEMA_BLOCK` (système) + `DECIDED BEFORE YOU` (utilisateur) + `DecidedBeforeYou` |
| `generate-household-meal-v1/index.ts` | les faits hissés, la garde, trois sorties, un journal |
| `precedence_binding.ts` | l'empreinte d'arbitrage de v26 (vérifiée identique à v25, pas recopiée) |
| front | `planDraft.ts`, `PlanDraftDialog`, deux écrans, deux clés i18n |

**`HOUSEHOLD_PROMPT_VERSION` : v25 → `v26_the_plan_says_what_it_weighed`.**
Le TRONC ne bouge pas d'un octet — la clé n'existe que sur la lane foyer, et la
demander au solo serait une consigne sur du vide.

### Les cinq portes de la garde, dans l'ordre

`unreadable` → `too_many_lines` (8) → `line_too_long` (220) → `energy_number` →
`guilt_tripping` → `house_rule_mentioned` → `number_targets_person` /
`discloses_person`. La première qui mord nomme le refus et **le bloc entier
tombe** : ce qui reste a été écrit en supposant ce qu'on retirerait.

⛔ **`[]` n'est pas un refus** — c'est l'échappatoire nommée, et sans elle le
modèle invente une tension pour remplir la clé.
⛔ **La règle de maison est refusée MÊME NIÉE** (`allowNegatedMentions: false`),
contre le réglage de la substance : la phrase mesurée qui a motivé le verrou
était précisément une négation (« …SANS NUTELLA »).
⛔ **Le chiffre d'énergie est fail-closed sans condition** : la porte d'énergie
n'a aucun appelant dans ce générateur, et faire dépendre la garde d'une porte à
câbler la rendrait désarmée le jour de sa livraison.
⛔ **Le bloc rend une DIRECTION, jamais un objectif** : donner « fat_loss » au
modèle serait lui donner le mot que la garde lui interdit de répéter.

### Ce qui a été hissé, et pourquoi

`rationaleCookDays`, `rationaleSingleSessionDay` et `daysOutOfBatchReach` étaient
calculés **après** l'appel modèle. Ils sont remontés au-dessus : **un seul
calcul, deux lecteurs** (la consigne et l'explication). Les recalculer aurait
fait dire au modèle autre chose que ce que le plan fait — la faute que ce fichier
documente déjà trois fois (`usableCookDays`, `addedCookDays`, la veille).

### Les épreuves

15 sur la garde (un cas qui PASSE et un qui REFUSE par porte, l'ordre des
portes, la pureté) · 6 sur le prompt (adjacence promesse/clé mesurée en
caractères, échappatoire nommée, « qui porte quoi », **`userSuffix`
byte-identique sans les faits**, direction sans objectif) · 7 de câblage sur la
source de la lane · 9 côté écran.

| Mutation | Rouge |
|---|---|
| clé lue sur `result` au lieu de `mealSourceText` | ✓ |
| garde de culpabilisation retirée | ✓ |
| `decided` non passé au prompt (lot désarmé) | ✓ |
| sortie `generated_from` retirée | ✓ |
| plafond 8 → 9 | ✓ (2) |
| clé du schéma renommée `explanations` | ✓ |
| ordre des deux cartes inversé (écran) | ✓ |
| un écran cesse de passer le champ | ✓ |

Restaurations par `cp`, prouvées par `cmp`.

### 🔴 CE QUI N'EST PAS ENCORE PROUVÉ — le run réel

Deux tirs perdus en 502 : le conteneur edge avait **9 secondes d'existence** à
l'inspection. Une session voisine écrivait sous `supabase/functions/` pendant
mon tir, et `functions serve` recrée le conteneur à chaque écriture. Coût : un
appel modèle, aucune réponse.

⚠️ **Le discriminant est posé AVANT le run**, et il sépare les deux causes
possibles :
- journal `keel.household_meal.plan_explanation` **présent** + `explanation`
  vide ⇒ le code neuf a tourné, c'est le MODÈLE qui n'écrit pas la clé ;
- journal **absent** ⇒ le runtime sert de l'ancien code.

Le compteur sort **inconditionnellement** du point d'entrée : son absence est un
fait sur le code chargé, pas sur le modèle. C'est ce que « faire sortir le
compteur même à zéro » achète.

---

# ✅ LE POINT 9 EST PROUVÉ EN RUN RÉEL — E1, foyer duo (HTTP 200, 283 s)

Décor : envie « des raviolis aux champignons », **et Julie n'aime pas les
champignons**. Le décor du point 9, monté exprès.

## Ce que le modèle a écrit

> **La demande de raviolis aux champignons est gardée pour la table, avec des
> raviolis aux épinards dans l'autre boîte afin que chaque assiette reste
> compatible.**

Compteur : `asked: true · declared: 1 · kept: 1 · refused: null`.

C'est **l'arbitrage**, dans la langue du plan, dans l'aperçu. Il ne redit pas le
calendrier (le bloc `DECIDED BEFORE YOU` a porté), il ne colle aucun nombre à un
prénom, il ne cite aucune règle de maison, il ne culpabilise pas.

⚠️ **Et il n'y a qu'UNE ligne, pas huit.** La moitié « éducation » que la demande
réclame n'y est pas. Le mécanisme est prouvé ; la richesse est un réglage de
consigne, pas un défaut de câblage. À mesurer sur plusieurs tirages avant de
toucher au prompt — `declared` et `kept` sont là pour ça.

## La preuve que c'est bien le code NEUF qui a tourné

Le discriminant posé avant le run a tranché tout seul : la ligne
`keel.household_meal.plan_explanation` est **présente** au journal, avec
`asked: true`. Ce compteur n'existe que dans le code de ce lot, et il sort
**inconditionnellement**. Empreinte du code identique avant/après.

## L'écran lit la charge RÉELLE

`readDraftEnvelope` rejoué sur la réponse du run (sonde temporaire, retirée
après) : `explanation.length === 1`, la phrase arrive entière, `refusal: null`,
et les 11 lignes déterministes voisines sont intactes.

# 🔴 ET LE MÊME RUN DONNE LA TROISIÈME PREUVE DU DÉFAUT DE CEINTURE

Les deux textes se contredisent, et c'est instructif :

> **modèle** : « …avec des raviolis aux épinards dans l'autre boîte »
> **phrase fixe** : « Julie garde sa part vendredi au dîner : le plat contient un
> aliment noté comme évité, et c'était ça ou pas de repas. »

Le plan, en clair :

    plat  « Raviolis, sauce tomate et salade »
    fiche  prep_ravioli « Raviolis aux champignons ET AUX ÉPINARDS »
           ingrédients: raviolis aux champignons, raviolis aux épinards,
                        coulis de tomate, champignons de Paris, oignon, huile
    boîte box_fri_dinner_marc   → raviolis aux champignons
    boîte box_fri_dinner_julie  → RETIRÉE par la ceinture

    issue: box_fri_dinner_julie: … asked to avoid "champignons" and
           "Raviolis, sauce tomate et salade" contains champignons
           -- mouth dropped from the box

⇒ **Le modèle a fait exactement ce qu'on lui demande**, et la ceinture a retiré
Julie de **sa propre boîte aux épinards** parce que la fiche partagée porte des
champignons. Le dernier recours l'a ensuite remise sur le bac commun avec la
phrase « c'était ça ou pas de repas » — **une phrase fausse** : un autre repas
était composé pour elle, dans une boîte que le moteur venait de supprimer.

⇒ **C'est la troisième mesure du même défaut, et la première sur un DÉGOÛT** :
`exclusion_belt` et `regime_belt` partagent `dishScanSources`, donc les deux
jugent une boîte sur la fiche qu'elle cite.

    C05  régime  vegan          10 boîtes propres → 10 retirées
    C07  régime  végétarienne   13 boîtes propres → 12 retirées
    E1   dégoût  champignons     2 boîtes propres →  2 retirées

⚠️ **Arbitrage tranché par le propriétaire** (via une session voisine, qui porte
le lot) : la sortie retenue est **la consigne qui exige une préparation à part**
plus **une relance qui nomme le lien fautif**, et NON un assouplissement de la
ceinture — parce que du tofu cuit dans la fiche du poulet ne convient pas à un
végétarien strict. C'est une raison de cuisine, et elle bat mon argument de
doctrine sur la surface de scan.

---

## LOT B livré et PROUVÉ EN RUN RÉEL — le délai de courses (point 8)

`agent-gate.sh` : **pass** · 5 404 Deno / 0 échec · vitest 2 320 / 0 rouge.

### Ce qui est livré

`plan_hours.ts` gagne `SLOT_USUAL_HOUR` (petit-déj 8, goûter du matin 10,
déjeuner 12, goûter 16, dîner 19, avant-coucher 22) et
`SHOPPING_AND_COOKING_LEAD_HOURS = 2`, plus `slotsUnservableToday` qui **APPELLE**
`slotsPassedToday` au lieu de le recopier et rend **deux listes** :

| | |
|---|---|
| `passed` | ce qui est derrière nous — la règle d'avant, inchangée |
| `heldForShopping` | ce qu'on n'a plus le temps d'acheter ET de cuisiner, **ou tout ce qui reste passé 18 h** |

⛔ **`SLOT_PASSED_HOUR` n'a pas bougé** : il a trois lecteurs qui n'ont rien à
voir avec un plan (`photo_slot_inference`, `slot_meal_ask`,
`meal-photo-upload-v1`) — un dîner reste photographiable à 22 h. Fondre les deux
tables aurait déplacé l'inférence de créneau d'une photo pour une raison de
courses.

⛔ **Deux listes, deux phrases** : « la journée est déjà entamée » se subit,
« il faut le temps de faire les courses avant » se contourne (quelqu'un qui a
déjà ses courses a raison contre elle). Les fondre rendrait la phrase fausse une
fois sur deux.

`withoutSpentFirstDay` gagne `heldSlots` et `shoppingCutoffReached` (**REQUIS,
ils lèvent**) et rend une `cause` à trois valeurs, portée jusqu'à `issues`.

### 🔴 UN DÉFAUT INTRODUIT PAR CE LOT, TROUVÉ PAR LE RUN RÉEL

Attendu écrit **avant** le tir (`T1.attendu.md`), fuseau `America/Chicago`, 12 h.
Ce que le premier tir a rendu :

    rationale  « Pour aujourd'hui, le déjeuner n'est pas au plan : il faut
                 le temps de faire les courses avant. »          ✅
    plats      fri: ['dinner', 'lunch']                          ⛔

**La phrase était juste et le plan la démentait trois lignes plus bas.** Cause :
en séparant les deux listes pour que l'explication distingue les causes, j'avais
laissé la fusion des absences (`awayDays`, ce qui atteint le PROMPT) sur la
seule liste des moments **passés**. Le modèle n'a jamais su que le déjeuner
était retenu.

⛔ **Aucun test de valeur ne pouvait le voir** : les deux listes étaient
correctes, la phrase était correcte, et c'est leur **jointure au prompt** qui
manquait. Il fallait un plan rendu.

La règle, écrite dans le code : **le prompt reçoit l'UNION, l'explication reçoit
les deux listes.** Un moment retenu ne se compose pas plus qu'un moment passé.
Une garde de câblage sur la source des deux lanes le tient, et sa mutation
rougit.

### La confirmation, même décor, trois minutes plus tard

    fenêtre    3 jours, inchangée                    ✅
    plats      fri: ['dinner'] SEULEMENT             ✅
    phrases    les DEUX, chacune avec sa cause       ✅

### Les mutations

| Mutation | Rouge |
|---|---|
| délai 2 h → 0 h | ✓ (3) |
| borne `<` → `<=` (17 h retire un dîner de 19 h) | ✓ |
| branche de coupure retirée | ✓ **après correction du test** |
| cause figée sur `slots_passed` | ✓ (2) |
| la fusion retombe sur la seule liste des passés | ✓ |

⚠️ **UNE MUTATION QUI N'A PAS ROUGI, ET CE QU'ELLE A APPRIS.** Neutraliser la
coupure laissait la suite verte : à 19 h, le délai de deux heures retenait
**déjà** le dîner (19 < 21), donc mon cas ne pouvait pas séparer les deux règles.
Le cas qui les sépare est un moment tardif — une collation de 22 h à 18 h, hors
de portée du délai, que seule la coupure retient. *Une mutation qui ne rougit pas
doit être suspectée avant le test qu'elle prétend éprouver.*

### ⚠️ Deux arbitrages posés par défaut, et nommés

1. **Le délai vaut 2 heures.** Conséquence assumée : à 11 h, un déjeuner de midi
   tombe. Se change en une ligne (`SHOPPING_AND_COOKING_LEAD_HOURS`).
2. **Une fenêtre d'UN jour entièrement dépensée garde son refus
   `day_already_spent`** au lieu d'être décalée : ce refus a déjà une phrase qui
   dit la cause ET la sortie (« demande un plan à partir de demain »).

## ⭐ Et le lot A a été reconfirmé deux fois de plus

Sur T1 et T1bis, le modèle a écrit son arbitrage à chaque tir :

> « Les raviolis aux champignons restent au menu, avec une version à la
> courgette dans la boîte correspondante afin de garder un plat commun et une
> assiette complète. »

**Trois runs, trois explications, zéro refus de la garde.**

---

# ⭐ UN AVANT/APRÈS NON CHERCHÉ — le correctif de la ceinture, mesuré

Trouvé après coup, par accident de calendrier : les fichiers du lot voisin ont
été écrits à **18:53**, et mes trois derniers tirs sont à **18:36, 19:02, 19:08**.
Le premier est donc en **v26**, les deux autres en **v27** — **même fixture, même
envie, même dégoût**.

## Le modèle cuit le composant échangé à part

    v26  E1     « Raviolis aux champignons ET AUX ÉPINARDS »   ← UNE fiche, les deux
    v27  T1     « Raviolis au poulet et champignons » + « Raviolis au poulet et courgette »
    v27  T1bis  « Raviolis aux champignons »          + « Raviolis à la courgette »

## Et la ceinture ne mord plus

| | separated | not_separated | refused | missing |
|---|---|---|---|---|
| v26 · E1 | 0 | 2 | 2 | **2** |
| v27 · T1 | **2** | 0 | 0 | **0** |
| v27 · T1bis | **2** | 0 | 0 | **0** |

Zéro morsure dans `issues` sur les deux tirs v27. Et **la phrase fausse
« c'était ça ou pas de repas » a disparu** — elle sortait deux fois en v26.

## ⚠️ Ce que ça ne prouve PAS

- Ma fenêtre v26 fait **7 jours**, mes fenêtres v27 en font **3** : les
  dénominateurs diffèrent, seul le RAPPORT se compare.
- **Deux tirs ne font pas une fréquence**, et la variance du modèle est
  précisément ce que cette campagne a mesuré.
- C'est un **dégoût**, pas un régime. Le cas dur — la végétarienne dont le tofu
  cuisait dans la fiche du poulet — reste à mesurer, et il est plus exigeant :
  un dégoût tolère le dernier recours, un régime jamais.

**Ce qui EST solide** : le mécanisme, visible dans la liste des préparations. La
scission est structurelle, pas statistique.

---

# ⚠️ VÉRIFICATION DEMANDÉE PAR UNE SESSION VOISINE — mes fixtures sont propres

Elle a trouvé qu'une note de cycle — **« On mange végétarien le lundi soir »** —
devient un régime **STRICT** du titulaire, et qu'un régime du titulaire
**gouverne tout le foyer à tous les repas**. Ses deux derniers plans étaient
entièrement végétariens pour quatre omnivores, sans qu'un mot le dise.

**Vérifié sur mes quatre fixtures, et l'absence est CHERCHÉE, pas supposée :**

| contrôle | résultat |
|---|---|
| `student_safety_constraints` sur mes titulaires (tous statuts) | **0 ligne** |
| `draft_note` envoyé par mon banc | **0 occurrence** dans `20-run.sh` |
| mots de régime dans mes envies | aucun (« raviolis aux champignons », « pizza vendredi soir ») |
| régimes de bouche | `Lea vegetarian`, `Nora vegan` — sur `household_members`, par `keel_household_set_member_diet` |
| allergies | `Tom/oeuf`, `Zoe/arachide` — par `keel_household_add_allergy` |

⇒ **Les verdicts des points 6 et 7 tiennent.** Mes régimes passent par la porte
PAR BOUCHE, qui ne gouverne pas le foyer ; aucune contrainte dure de titulaire
n'a jamais existé sur mes comptes.

## ⛔ ET C'EST UNE LIMITE DE MON BANC, PAS UNE QUALITÉ

**Ma campagne ne POUVAIT PAS trouver ce défaut.** Elle écrit l'état directement
par RPC et SQL, et n'exerce jamais le canal des notes — donc jamais le
classifieur, jamais `member_id: null`, jamais `DEFAULT_SEVERITY`. Un banc qui
écrit l'état est immunisé contre les défauts du chemin qui l'écrit d'ordinaire,
**et il l'est sans le savoir**.

Sa campagne d'accumulation, qui parle au produit pendant des mois simulés, l'a
trouvé au bout de trois cycles. Deux formes de banc, deux angles morts
complémentaires — et c'est un argument pour garder les deux.

---

## LOT H livré — la PORTÉE manquait à la déclaration de sécurité

`agent-gate` : **pass** · 5 408 Deno / 0 échec · vitest 2 320 / 0 rouge.

### Ce qui est corrigé, et où

Le bloc de déclaration séparait déjà le GOÛT de la SÉCURITÉ **sur la ligne de la
clé `kind`**, avec un exemple travaillé, et un test vérifie que l'exemple n'a pas
quitté la ligne. Le second discriminant — la **PORTÉE** — est posé au même
endroit, de la même façon :

> « we eat vegetarian on Monday nights » is a RHYTHM, not a diet — it holds on
> ONE occasion, so it belongs in `items` and NEVER here

plus la règle générale, sur sa propre ligne, avec ses marqueurs :

> A line here holds at EVERY meal, for good. If the note ties it to a day, a
> moment or a frequency — « on Mondays », « at dinner », « twice a week »,
> « during Lent » — it is not a safety fact whatever words it uses. **A diet
> that holds one evening a week is not a diet: it is a rhythm.**

⛔ **On ne touche NI au sujet vide NI à la sévérité par défaut.** Le `null` est
juste (« je suis végétarienne » n'a pas de sujet) ; le défaut `strict` est juste
et son commentaire dit pourquoi (plus bas ⇒ contrainte **inerte**, la pire des
trois issues) ; la gouvernance par le foyer est la doctrine.

⛔ **Et AUCUN matcher de refus sur le texte.** Chercher « le lundi » et jeter
l'entrée jetterait un jour une vraie allergie (« allergique aux arachides depuis
lundi ») — fail-**open** sur la sécurité, la seule direction interdite. Un test
tient cette absence : une déclaration bien formée traverse, quelle que soit sa
phrase. **La sortie dure est la CLARIFICATION**, nommée dans le code comme la
voie non prise, avec sa raison — elle appartient à la chaîne de mémoire.

### 🔴 LA MESURE, ET LES DEUX DÉFAUTS D'INSTRUMENT QU'ELLE A COÛTÉS

**Une consigne de prompt régresse en réel** — un test vert ne prouve rien ici.

**① Mon banc mesurait un silence de chemin.** Premier jet en `intent: draft` :
« aucune contrainte écrite » sur les DEUX cas. Motif : sur un brouillon, la
fonction **rend** (l. 8569) avant le site d'appel du classifieur (l. 9243). La
note est lue, rien n'est jamais rangé.

⛔ **C'est la CONTRE-ÉPREUVE qui l'a dit, pas la relecture.** Sans le cas
légitime, mon « ✅ aucune contrainte » partait au rapport comme une preuve.
*Une garde a besoin d'un cas qui passe.*

**② Le journal du conteneur a menti.** `docker logs --since` a laissé passer les
lignes de tirs précédents : j'ai lu `draft_note_safety written: 1` sur un run qui
n'avait **rien** écrit. **La base est l'autorité**, le journal est indicatif —
noté dans le banc.

### Le couple, sur le chemin qui ÉCRIT (`prepare_next`), même fixture, 3 min d'écart

| note | contrainte dure écrite |
|---|---|
| « Je suis végétarienne, je ne mange pas de viande. » | **diet / vegetarian / strict / active** ✅ |
| « On mange végétarien le lundi soir. » | **AUCUNE** ✅ |

C'est la phrase exacte qui a fait manger végétarien à quatre omnivores. Elle
n'écrit plus rien.

⚠️ **ET ELLE N'ATTERRIT NULLE PART NON PLUS.** `retained_items` est inchangé, la
consigne dit pourtant « it belongs in `items` ». L'information est **perdue** —
c'est un échec plus doux qu'une fausse contrainte de foyer, mais c'en est un.
Deux tirs ne font pas un taux ; ce qui est solide est le COUPLE, pas la
fréquence.

### Les mutations

| Mutation | Rouge |
|---|---|
| l'exemple du rythme quitte la ligne de la clé | ✓ (2) |
| la règle générale de portée retirée | ✓ |
| le second discriminant chasse le premier | ✓ (2) |

---

## Lot I — « pâtes » lu comme « pâté » : l'accent est le discriminant

**Trouvé en réel par la session voisine, pas par relecture.** Un plan VALIDE a
été refusé (`422 mouth_unfed`) : la préparation « Pâtes aux légumes » —
végétarienne, servie à une végétarienne — a été lue comme de la CHARCUTERIE.

### Ce que ma liste de PORTÉES du lot G ne pouvait pas faire

Elle couvrait « des pâtes », « les pâtes », « pâtes complètes ». Elle ne pouvait
rien pour le mot **NU**, et c'est la forme d'un nom d'ingrédient : un item de
boîte s'appelle « pâtes », jamais « des pâtes ».

### La voie proposée par la session voisine, et pourquoi je l'ai refusée

Ajouter le pluriel à `HOMOGRAPH_PHRASES` aurait éteint **« pâtés »** du même
geste — le pluriel de la charcuterie se normalise exactement comme celui des
pasta. C'est-à-dire réparer un faux positif en rendant une végétarienne
mangeable de pâté. Le sens de l'erreur n'est pas symétrique et cette ceinture
existe pour ce sens-là.

### Ce qui tranche vraiment, mesuré

`normalizeForMatch` fait NFD puis retire les diacritiques : les quatre mots
deviennent le même. **Écrits, non** — et seule la charcuterie porte un É.

| mot | accents | ce que c'est |
|---|---|---|
| pâtes | â | les pasta |
| pâte | â | la pâte à tarte |
| pâté | â **et é** | la charcuterie |
| pâtés | â **et é** | la charcuterie |

**Et `matchedText` rend le texte BRUT**, accents compris, même quand la chaîne
en porte d'autres AVANT la morsure (`Purée de céleri, crème et pâtes` →
`pâtes`). Vérifié exprès : NFD **raccourcit** la chaîne, donc un offset rejoué
contre le brut aurait dérivé. L'accent est lisible à l'endroit de la morsure,
sans aucun offset.

**Sans aucun accent, le mot reste ambigu et la morsure RESTE.** Repli fermé,
acceptable parce que la surface scannée est écrite par le modèle, qui accentue
le français — mesuré : il a écrit « pâtes ».

### Le troisième compteur, et le sous-comptage réparé au passage

`silencedBySpelling` à côté de `silencedByHomograph` : **deux preuves
différentes du même verdict** (un voisinage / une orthographe). Les fusionner
rendrait muet le jour où l'une des deux se trompe — c'est la règle que le
fichier énonce lui-même.

⚠️ **Défaut préexistant trouvé en câblant** : sur les branches `plant_only` et
`isPlantAnalogue`, `silencedByHomograph` était **jeté**. Le verdict ne changeait
pas (tout est éteint sur ces branches) mais le compteur **sous-comptait en
silence**. Tout `silenced_homograph` lu jusqu'ici était faux vers le bas.

### Les mutations

| Mutation | Rouge |
|---|---|
| M1 · l'accent é ne disqualifie plus → « pâté » serait éteint | ✓ |
| M2 · l'accent â n'est plus exigé → « pates » nu serait éteint | ✓ |
| M3 · la branche `plant_only` ne remonte plus le silence | ✓ |
| M4 · le discriminant retiré de la boucle → le cas réel remord | ✓ |

**M3 est celle qui compte** : elle reproduit le défaut que ce module a DÉJÀ payé
une fois — une garde qui marche pendant que son compteur reste à zéro. C'est le
seul rouge qu'une relecture n'aurait pas donné.

### Deux pièges d'outil payés dans ce lot

**① `grep` est MUET sur `forbidden_matcher.ts`.** Le fichier contient un octet
NUL délibéré (séparateur de clé de map, ligne 471), donc grep le classe binaire
et ne rend **rien** — pas une erreur, un silence. J'ai cru le fichier vide
d'exports. Il faut `grep -a`.

**② J'ai tué le tir de la session voisine.** Mon écriture à 20:27:11 a recréé le
conteneur à 20:27:18 ; leur DENS-2 est mort en 502 après 17 s. Leur message
annonçant le tir m'est arrivé APRÈS mon écriture. Un tir perdu chacun dans la
journée : la fenêtre s'annonce AVANT d'écrire, pas avant de générer.

---

## Correction d'un verdict à moi, et l'instrument bon marché qui l'aurait évité

En relisant les compteurs de ceinture des plans **déjà écrits** — sans générer —
un écart saute aux yeux : **C03 et C05 sont le MÊME foyer**, à la logistique
près, et rendent `refused 0/18` contre `refused 10/10`.

`group_excluded` explique tout, sans exception sur les cinq foyers :

| `group_excluded` | séparation | plans |
|---|---|---|
| 0 | **réussit** | C03 12/12, C04 6/9 |
| > 0 | **échoue toujours** | C05 0/10, C06 0/6, C07 1/13 |

Il compte les morsures venues du **groupe déclaré** d'un ingrédient, donc de la
**préparation citée**. Non nul = le pot n'a pas été séparé. **Et il se lit dans
la réponse**, sans toucher `llm_raw_response_events`.

### Ce que le rejeu confirme, et ce que j'avais mal lu

| plan | bouche | item carné dans sa boîte | items propres, **préparation carnée** | tout propre |
|---|---|---|---|---|
| C05 | Nora, végane | 0 / 10 | **10** | 0 |
| C07 | Lea, végétarienne | 0 / 13 | **12** | 1 |
| C07 bis | Lea | 0 / 6 | **6** | 0 |

J'avais publié « la ceinture défait ce que le modèle réussit ». **C'est trop
généreux.** Le modèle réussit sa LISTE D'ITEMS ; il ne sépare pas la CASSEROLE.
Les items propres sont puisés dans un pot au poulet, et la ceinture a **raison**
de retirer la bouche.

⛔ **Troisième piège d'instrument de la journée, et le plus cher** : lire les
items d'une boîte ne dit pas ce que la bouche mange. Il faut suivre la citation
de préparation. Mon script rendait bien les trois colonnes — je lisais la
mauvaise.

**Taux réel de `v27_the_swap_cooks_apart` : un foyer sur cinq sépare vraiment.**
La session voisine compte deux tirs sur quatre. La consigne marche parfois ; elle
n'est pas tenue.

### Le mécanisme, confirmé dans le code et pas seulement par corrélation

`boxScanSurface` rend `{ terms, prepIds }` : elle collecte les
`preparation_id` des items de la boîte. **La surface d'une boîte SUIT les
citations de préparation.** Donc `group_excluded > 0` n'est pas une corrélation
observée sur cinq plans — c'est le chemin par lequel un ingrédient de la
casserole atteint la bouche.

⚠️ Le trou résiduel est nommé dans l'en-tête du module : un item
`{term: "stew"}` **sans** `preparation_id`, sous une méthode au poulet, ne mord
pas. `box_scoped` dit sur quelle population la garde s'exerce — sur mes plans il
égale `checked`, donc la garde couvrait tout ce qu'elle jugeait.

**Et le trou est CHIFFRÉ, pour la première fois.** L'en-tête le nommait sans le
mesurer. Sur les dix plans de la campagne, **384 items de boîte**, dont **6 sans
`preparation_id`** — soit **1,6 %**, tous sur un seul plan (T1). La garde couvre
donc 98,4 % de la surface qu'elle prétend juger. C'est petit, et c'est
maintenant un nombre plutôt qu'une inquiétude.

### Le gate ne touche rien sous `supabase/functions/` — mesuré, mon carnet avait tort

Empreinte des **3 873 fichiers** avant et après `./scripts/agent-gate.sh` :
**identique**. Le cache de `deno test` vit dans `DENO_DIR`, pas dans le dépôt.
**J'ai suspendu mon gate une demi-heure pour rien.**

⛔ Ce qui recrée le conteneur, c'est l'**écriture** — y compris celle d'un
fichier de TEST. Vérifié la même minute : écrire `household_regime_belt_test.ts`
a recréé `supabase_edge_runtime_Sophia_2`, alors que le runtime ne sert jamais un
`_test.ts`.

### Et un test étranger a attrapé mon compteur, comme il était écrit pour le faire

`household_regime_belt_test.ts` fait un `assertEquals` sur l'objet **entier** des
compteurs, et son commentaire dit pourquoi : « elle oblige tout compteur ajouté
un jour à passer par ce test, au lieu d'apparaître en base sans que personne ne
l'ait décidé ». Mon `silenced_spelling` l'a cassé, exactement comme prévu. Je ne
l'avais pas vu parce que j'avais lancé `deno test` **sur mon module seulement** —
« 31 tests verts » ne dit rien des autres fichiers. C'est la session voisine qui
l'a trouvé, en passant le gate pour son propre commit.

### Retirer un régime d'une fixture change la FORME du plan, pas seulement la ceinture

Trouvé en relisant l'isolation d'une session voisine, avant qu'elle ne lise son
tir. Le chemin :

    dishBearingMembers = [...divergingMembers, ...ownMealBearers]

`divergingMembers` est filtré par `dietDiverges`, et son commentaire dit « LE
RÉGIME, ET DÉSORMAIS LUI SEUL ». `ownMealBearers` ne rattrape qu'une bouche
ayant un `own_usual` **non vide**.

Donc mettre `diet = null` sur la seule bouche à régime d'un foyer :
1. la retire des porteurs de plat, sauf habitude déclarée — la table
   `household_member_habits` de cette fixture est **vide** ;
2. vide `divergingMembers`, ce qui bascule `compositionShape` de `one_session` à
   `one_dish` — un champ qui gouverne « sessions, longueur des recettes, budget
   de plats de la TABLE ».

⛔ **Ce n'est plus le même plan**, et la bouche peut se retrouver dans un bac
COMMUN. Un module qui saute les boîtes partagées rendrait alors zéro déplacement
— indiscernable de « rien à faire ».

**L'isolation qui garde le sujet** : donner un `own_usual` non vide, ce qui remet
la bouche dans `ownMealBearers` par l'autre porte, sans régime donc sans morsure.
Changement de fixture, pas de code.

### Une pincée de sel éteignait une densité — et la réparation évidente rouvrait le trou n°1

Défaut trouvé par la session voisine sur son propre lot : `preparationReadyGrams`
rend `null` dès qu'UN ingrédient n'a pas de grammes, ce qui est juste pour une
MASSE et faux pour une DENSITÉ. Toute casserole ayant une pincée de sel devenait
sans densité — c'est-à-dire toutes.

⛔ **La réparation qui venait à l'esprit** — « écarter les non pesés » — rouvrait
le premier poste de perte d'énergie du produit. Une huile non pesée écartée fait
paraître la casserole moins dense qu'elle n'est, donc croire l'écart plus grand,
donc **déplacer trop de grammes**. Sans arrêt compté : invisible.

**Le levier existait déjà** : `condimentMassFor` rend une masse conventionnelle
pour une pincée et refuse **toute ligne `energyDense`**, exactement pour que
l'huile continue d'éteindre son plat. Sel, poivre et herbes passent ; l'huile
non. Une règle avec ses tests et sa contre-épreuve, plutôt qu'une seconde règle
à côté.

**Et l'équivalence se prouve, elle ne se juge pas.** La mutation qui retirait la
garde `complete` restait VERTE. Vérifié dans le code plutôt que débattu :
`dishEnergy` sort par `emptyDish("missing_quantity")` dès qu'UN terme est non
pesé (`plan_energy.ts:472`), et `emptyDish` pose `kcal: null` (`:389`). La garde
n'ajoutait donc rien — équivalence établie.

**Le vrai énoncé du défaut**, trouvé en cherchant cette preuve :
`resolveIngredients` applique **déjà** `condimentMassFor` (`food_composition.ts:1366`),
après la prose et avant de compter l'ingrédient comme perdu. Le NUMÉRATEUR pesait
donc les condiments par convention pendant que le DÉNOMINATEUR les refusait.
**Deux règles d'admission pour un seul quotient** — c'est ça, le défaut, et pas
« la pincée casse tout ».

---

## Lot F — le point 5, livré et prouvé sans générer

Le duo avait un plan vivant (`8cd2c3db…`, écrit le 04/09 à 18:03 par le banc du
lot H). Un appel `meal-energy-v1` comme Julie a suffi : `show=false`
(`student_off` par `no_direction`), et la réponse fermée porte les trois boîtes
de Marc chiffrées (404 / 385 / 430 kcal, `plan_quantities`). Compteur
`boxes_gate` : 8 = 3 + 3 + 2. Aucune bouche inconnue.

**Ce que la preuve ne dit pas** : l'écran. La chaîne front est écrite et testée
(rendu de `BoxTable` avec et sans énergie, lecteur `readBox` tout-ou-rien, note
de base sur les trois écrans), mais personne n'a ouvert `/app/plan` comme Julie
ce soir. La passe navigateur demande que l'utilisateur ouvre une session.

---

## Point 7 — cinq tirs sur `f81ce212`, et le piège du zéro

Résultats dans `point7-relance/`. C03 et C05 : le design (base sur la ligne la
plus stricte + composant carné par boîte) fonctionne, séparation 100 %. C05
passe de 422 à 200 par la **relance entière** (`retry_accepted=1`), pas par la
fusion par parties (`merged_cells=0`) — la fusion n'a donc pas encore été
exercée en réel. C04 : 546 WORKER_LIMIT, rejoué à part.

**C06 et C07 : zéro casserole carnée sur 3 et 5**, zéro boîte citant de la
viande, pour cinq bouches dont quatre omnivores. `bites=0` — et c'est le piège :
mon premier comptage sur les PLATS disait « 29 plats au yaourt », le second sur
les PRÉPARATIONS et les citations des boîtes a confirmé qu'aucune viande n'existe
nulle part dans le plan. Un zéro de ceinture ne se lit qu'avec « y avait-il
quelque chose à mordre ? ».

**Sixième instrument défaillant de la campagne, même famille que les cinq
autres** : un compteur juste, lu sans son dénominateur. La différence est qu'ici
le dénominateur n'existe pas encore dans le produit — il faut l'écrire
(`swap_absent`).

---

## 2026-09-05 18:10 — LOT G : pourquoi les plans sous-nourrissent (et c'est le prompt, pas le moteur)

Mesure sur le C03 relancé (`point7-relance/C03-170452.json`, quatre bouches, 7 j), avec
`40-boites.ts` (référentiel `2026-08-23-EVAL-QUALITE/ref`) et `41-cibles-quatre.ts`
(`estimatedMaintenanceFor` + `executedPaceFor`, les fonctions de production) :

| | cible (produit) | servi (plan) | |
|---|---|---|---|
| table, par jour | **8 571 kcal** | **3 192 kcal** | 37 % |
| Paul (82 kg, `fat_loss`), déjeuner | 880 kcal ≈ 652 g à 1,35 kcal/g | **652 g → 386 kcal** | 0,59 kcal/g |
| Claire+Léo / Nora, déjeuner | 794 / 770 kcal | 325 / 307 kcal | — |
| protéine table, par jour | — | 211 g (≈ 53 g/bouche) | — |

**Lecture.** La boîte de Paul pèse EXACTEMENT le plafond de masse de l'ancre
(`mealMassCapGrams` = 880 / 1,35) : l'ancre a monté la boîte jusqu'à sa borne, puis a
rendu `clamped`, `unmet gte_200` (12/12). Le densifieur a déplacé 2 684 g et fermé
2 954 kcal, 11/12 journées restent ≥ 200 kcal sous la cible. La masse de la casserole
est à peu près juste (2,27 kg pour 2,54 attendus) ; **c'est la densité qui est fausse :
0,55–0,60 kcal/g contre 1,35 supposé** (« quinoa, poulet, tofu, courgettes et salade » :
les courgettes et la salade font la masse).

**La cause est dans le tronc du prompt système** (`meal_generation.ts`, section
`A PORTION IS ONE PERSON'S PLATE`) :

> « one adult portion is roughly a palm of protein, a fist of starch, and vegetables on
> top. Scale from there. »

Une paume de protéine (~100 g) + un poing de féculent (~150 g cuit) + légumes ≈ 400 kcal :
c'est une assiette de régime, un tiers du déjeuner d'un adulte à 2 200–2 700 kcal/j
(40 % de la journée = 880–1 080 kcal). Le prompt ne dit rien d'autre de la taille, et
promet même au modèle (bloc budget) que « the servings are computed from bodies and
directions » — rien ne les calcule. Les deux lanes partagent cette phrase : le solo C01
sert 67 % de son enveloppe pour la même raison (`plans-underfeed-their-own-envelope`).

**Ce qu'aucun étage aval ne peut réparer** : l'ancre est bornée ×3 ET par la masse
(voir en-tête de `mouth_anchor.ts` : « la réparation reste de composer plus dense ») ; le
densifieur garde 70 % des légumes et ne peut tirer sur une casserole déjà vide
(`pot_exhausted`) ; la relance de correction solo est adoptée 1/7. Le levier est amont.

**Lot G** (`lotG-assiette/apply-G.py`, à poser dès la fenêtre libre) : la phrase devient
une taille de repas en grammes — 600–750 g cuits par adulte, dont 200–250 g de
féculents/légumineuses, 120–180 g de l'aliment protéique, un gras, légumes PAR-DESSUS
jamais À LA PLACE ; petit-déj aux deux tiers ; « si la méthode retire le féculent, le
poids se déplace, il ne disparaît pas » (doctrine low-carb) ; jamais un kcal (clause C5).
`MEAL_PROMPT_VERSION` → `v27_a_plate_weighs_what_it_feeds` (8 littéraux de test), test
d'épingle + mutation (remettre la paume rougit, un kcal dans la section rougit). Mesure
après : `93-mesure-lotG.sh` (C03 + C01, un tirage chacun — on lit l'ordre de grandeur).

### 2026-09-05 19:05 — Lot G posé et mesuré (commit 0533adfa ; le paragraphe lui-même est parti dans f489cb17, qui a emporté l'arbre de travail)

Un tirage chacun, `intent: draft`, empreintes inchangées pendant le tir (`93-mesure-lotG.sh`) :

| | avant | après v27 |
|---|---|---|
| **C01 solo** jours complets | 1 379 kcal/j = 67 % de la borne basse · protéine 93 g (57 %) | **1 816 kcal/j = 88 %** · protéine **125 g (76 %)** · verdict encore `below/under` |
| **C03 foyer** table | 3 192 kcal/j (37 % de 8 571) | 3 335 kcal/j — inchangé |
| C03 ancre | anchored 0 · clamped 12 · unmet ≥200 12/12 | anchored 3 · clamped 6 · unmet ≥200 6 · common_pot_day 15 |
| C03 boîtes de Paul | 1 184 g → 740 kcal/j (0,62 kcal/g) | 881 g → 706 kcal/j (0,80 kcal/g) |

**Lecture foyer.** Le prompt a densifié les plats (0,62 → 0,80 kcal/g) et grossi les
casseroles (3,4 kg de cuisses de poulet pour 9 parts) ; mais les 25 boîtes sont toutes
réécrites par le moteur (`box_factor_source {anchor 14, pot 11, relative 0}`), le plafond
de masse suppose 1,35 kcal/g, les bouches sans objectif ne sont jamais ancrées en absolu
(`no_direction`), et 15/24 journées-bouche sont « bac commun seul ». Les boîtes de Paul
après : « tofu brouillé 652 g » au petit-déj (= le plafond appliqué au petit-déjeuner),
« poulet rôti 391 g » au déjeuner — la boîte ne cite que la casserole, jamais les items
frais du plat. **Chantier de dimensionnement, décision produit à poser.**

**Défaut trouvé en passant** : `grams_raw` null sur 13/16 lignes de préparations du
foyer — `scaleIngredients` (pot growth, index.ts ≈ 8102) remet `gramsRaw` à null par
contrat et personne ne regramme après (le `regramMeal` de 6709 tourne AVANT). Confié à
8a (regram après la boucle), à mesurer sur `pot_growth.unrewritable` et le plafond de pot.

### 2026-09-05 19:20 — C03 sur a75cfd5a (regram des casseroles) : le plafond de pot devient visible

Un tirage (274 s, empreinte inchangée, `lotG-assiette/apres-regram-C03.json`) :
`grams_raw` préparations 0 null/33 (avant 13/16) ; `pot_growth {scaled 3, regrammed 5, unrewritable 2}` ;
`pot {pot_sized 0, pot_clamped 11}` ; `anchor {anchored 0, clamped 12}` ; `unmet {both: 12}` (avant
`factor_clamped 6, both 0`) ; densify `pot_exhausted 9`. Boîtes : Paul 706 → 502 kcal/j, Claire/Léo 586 → 398.

**Lecture.** Le vide des grammes crus masquait le plafond de pot : maintenant que la masse des
casseroles se lit, le moteur borne chaque boîte à ce que la casserole rend, et les casseroles du
modèle sont trop petites pour les cibles (« pot_exhausted »). La sous-nutrition du foyer a donc
DEUX étages : la densité des plats (prompt, v27 : 0,62 → 0,80 kcal/g) et la **taille des casseroles**
(parts × masse par part, écrite par le modèle, jamais ancrée sur la somme des besoins de la table —
`householdAppetite` est mesuré, `steering: false`). C'est là que le prochain lot doit porter.

### 2026-09-05 19:35 — C03 sur ec3645e6 (la casserole grossit depuis sa masse réelle, 8a) : le sens prédit

Un tirage (`plan-C03-20260905-190609.json`), kcal par bouche et par jour dans les boîtes (`40-boites.ts`) :

| bouche | v27 seul | + regram (a75cfd5a) | + masse du pot (ec3645e6) |
|---|---|---|---|
| Paul (perte, cible 2 200) | 706 | 502 | **1 172** |
| Claire / Léo | 586 | 398 | **985** |
| Nora (végane) | 572 | 467 | 359 (4 boîtes seulement : la ceinture a refusé 5 boîtes citant saumon/dinde) |
| table, moyenne/jour | 3 335 | 2 931 | **4 848** (pour 8 571) |

Compteurs : `unmet {both 12 → 2, factor_clamped 3}`, `anchor.clamped 12 → 5`, `densify` 640 g déplacés,
470 kcal fermés, `pot_exhausted 9 → 1`, `remaining_gte_200 12 → 5`. **Trois lots empilés en une
soirée — le prompt (densité), le regram (lisibilité), la masse du pot (croissance) — et la table passe
de 37 % à 57 % du besoin.** Un tirage chacun. Reste : le plafond de masse à 1,35 kcal/g, les bouches
sans objectif jamais ancrées en absolu, et la ceinture de Nora (8a étend la réparation au TERME).

### 2026-09-05 19:50 — C03 sur 54a1114a (dernier tir de la soirée, 8a)
`unmet {both 0}`, `anchor {anchored 8, clamped 4}`, `densify remaining_gte_200 0` (843 kcal fermés), `pot_exhausted 0` :
de 12/12 journées-bouche à ≥ 200 kcal sous le besoin ce matin à 0/12 ce soir, sur ce foyer, un tirage. Ceinture :
missing 0 mais deux relances et six cellules fusionnées (Nora posée sur des pots d'œufs/poulet, aucun pot orphelin).
Relu dans le JSON : kcal/jour dans les boîtes Paul **1 702**, Nora 1 680, Claire/Léo 1 409 ; table **7 623 kcal/j = 89 %** de 8 571
(matin : 37 %). Précision : `remaining_gte_200 0` est le compte APRÈS densification ; avant elle, `unmet_band {lt_200 1, gte_200 7}`
et `unmet {none 4, factor_clamped 4, pot_ceiling 4}` — le plafond de masse (1,35 kcal/g) et le plafond de pot mordent encore chacun 4 fois.

### 2026-09-05 23:50 — À reprendre demain (lane cuisine), signalé par 8a sur la campagne de mesure
- **M13 (duo, `cook_days = [dimanche]` déclaré)** : trois sessions posées (dim/mar/jeu) sans le dire —
  `resolveCookingCapacity` remplace les jours déclarés par ceux que style + courses dérivent. A8 tient à
  l'envers ; A4 (barquettes au congélateur pour une session unique) non observable tant que ça tient.
  À vérifier dans `cooking_plan.ts`/`deriveCookingPlan` : un jour de cuisine déclaré doit borner les
  sessions (et être NOMMÉ s'il est écarté), comme la case « une seule session ».
- **LOT 0 avant l'arbitrage 1** (consigné par 8a) : énergie d'une boîte par grammes tirés, compteur
  Σ tiré / Σ attribué par plan (`lecture-74-lot1.md` §2).
Précision (lecture du code, 23:58) : `resolveCookingCapacity` (`cooking_plan.ts` ≈ 700-730) remplace `cookDays`
déclarés par `plan.cookDays` dérivés — décision D2.4, justifiée par « l'écran écrit `[]` ». Or `cook_days` est
encore porté par `CookingCapacityCard.tsx`, `onboarding.ts`, `setupDraftCache.ts`, `fieldChanges.ts` et la copie
« Les jours où vous cuisinez » (`setup.missing.cook_days`) : la cause de D2.4 est à revérifier (mémoire
`documented-constraints-outlive-their-cause`). Si un écran écrit encore des jours, la règle juste est : jours
déclarés ⇒ ils bornent/placent les sessions, et tout écart est NOMMÉ dans la rationale — jamais remplacés en silence.

---

## 2026-09-06 — « Fais tout » : lots 0, 1, 3

### Lot 0 — l'énergie d'une boîte suit ses grammes tirés (092b2bba)
`mouth_energy.ts` : `potDensities` (kcal / grammes prêts par casserole, même masse que le
densifieur : `weighedReadyGrams`), `boxKcalByItems` (item citant une casserole = grammes ×
densité ; item frais = part du frais du plat au prorata des grammes frais ; casserole
illisible = `dish_incomplete`, jamais zéro ; aucun `preparationId` = pliage legacy),
`potAttributionGap` (Σ tiré / Σ attribué par `uses.servings`, compteur `pot_attribution`
dans `box_sizing`). L'écran (`boxEnergies`, `meal-energy-v1`) lit la même règle ; le lecteur
du plan persisté porte la clé telle qu'écrite (`undefined` ≠ `null`). Six tests ; mutation
« retour au pliage » = 3 rouges. L'instrument `40-boites.ts` suit la même règle.

### Arbitrage 1 — plafond de masse par densité mesurée (a9de04dc)
`mealMassCapFor` : plafond du plus gros repas = kcal / densité RETENUE, densité mesurée
(`day.kcal / day.grams`) bornée entre `MEAL_KCAL_PER_G_FLOOR` = 1,0 et 1,35. Moins dense ⇒
plus de grammes (la décision), jusqu'au plancher ; sous le plancher, c'est le plancher
(`density_floor`, la réparation est de densifier) ; plus dense que 1,35 n'est jamais borné
plus serré qu'hier ; sans grammes lisibles, 1,35 et ça se nomme. **Pas de retour au kilo**
(les deux tests du 04/09 tiennent, réécrits sur la règle ; j'avais d'abord remis 8 g/kg —
« une enfant de 36 kg » a rougi, et c'est ce test qui avait raison). `capBit` sur
`AnchorFactor`/`PotFactor`, histogrammes `anchor_cap`/`pot_cap`. Le bac (`pot_demand`) suit
la même fonction. Mutation « 1,35 fixe » = 7 rouges. Suite keel entière verte (5 552).

⚠️ Contrôle sur arbre matérialisé : archiver TOUT l'arbre (`git archive TREE`), pas
seulement `supabase/` — 6 tests keel lisent `frontend/src/...` et rougissent sinon
(faux rouges vus sur a9de04dc, verts dans l'arbre réel).

### Mesure après lots 0 + 1 : `94-mesure-lot01.sh` (quatre + duo, un tirage chacun) — en cours

### Lot 3 — les jours de cuisine déclarés placent les sessions (3d00d6e2)
`deriveCookingPlan({ declaredCookDays })` : déclarés dans la fenêtre ⇒ ils placent et comptent
les sessions (bornés à 3 et aux jours mangés, note `cook_days_declared`) ; hors fenêtre ⇒ nommés
(`cook_days_out_of_window`), dérivation inchangée ; sans déclaration ⇒ octet pour octet comme
hier. Rationale FR/EN. Mutation « ignorer » = 5 rouges. Blobs construits sur HEAD (le lot
« offre » non commité de `cooking_plan*.ts` n'est pas emporté).

### Mesure après lots 0 + 1 (`94-mesure-lot01.sh`, un tirage chacun, a9de04dc)
| | duo D01 | quatre C03 |
|---|---|---|
| `anchor` | anchored 10 · day_incomplete 2 · **clamped 0** (hier 10/10 clamped) | anchored 7 · **clamped 0** · common_pot_day 14 |
| `anchor_cap` | none 14/14 | none 21/21 |
| `unmet_band ≥ 200` | **0** (hier M11 : 10/10) | 7 (`pot_ceiling` 7 — la casserole, plus l'assiette) |
| `pot_attribution` | ×1,4 | ×0,99 |
| régime | — | ⛔ bites 14, separated 0, **refused 14**, missing 17 : Nora sur les pots carnés (cas M07 côté quatre, v29) — 8a prévenu |

Le plafond de masse ne mord plus (0/35 journées-bouche, contre 12/12 hier matin) ; sur le duo,
aucune journée-bouche sous le besoin. Le quatre est pollué par l'échec de régime (17 repas
manquants) — la lecture énergie n'y vaut rien ce tir.

⚠️ Effet de bord du lot 0 à traiter : un ingrédient FRAIS du plat non résolu (« raviolis
frais », « poulet », « vinaigrette au citron ») rend l'énergie propre incomplète, donc la boîte
entière `dish_incomplete` (188–342 g/jour « sans énergie lisible » ; `day_incomplete 2` sur le
duo). Hier, le même terme se diluait dans le pliage casserole comprise (tolérance sur la masse
totale). À regarder : juger la tolérance de l'énergie propre contre la masse de la BOÎTE
(casserole + frais), pas contre le frais seul.

### Lot 0 bis — la tolérance se juge sur la boîte (fa224681)
`boxKcalByItems` lit le frais à tolérance pleine (bandes de groupe) et applique les 5 % à
casserole + frais de chaque boîte. Une garniture inconnue de 4 g passe à côté de 600 g de
casserole ; 200 g de « poulet » sans pièce restent illisibles (bande large, exprès).
Index partagé : quatre chemins désindexés (blobs d'avant lot 3 fuités par un `update-index`
zsh) — leçon : tout `update-index` se fait dans un script bash avec `GIT_INDEX_FILE` posé
AVANT toute commande git, jamais en ligne zsh.

### Mesure finale du 2026-09-06, 02:20 (`95-mesure-finale.sh`, HEAD fa224681 + e8709708, un tirage chacun)
| | solo C01 | duo D01 | quatre C03 |
|---|---|---|---|
| énergie | jours complets **2 361 kcal/j = 115 %** de la borne basse (hier matin 67 %, v27 88 %) · protéine **189 g = 115 %** du plancher (57 % hier) · verdict `within` | Julie 1 454 · Marc 1 592 kcal/j en boîtes (cibles 2 007 / 2 179, ≈ 72 %) + 136–141 g/j illisibles (raviolis frais) | 859–971 kcal/j par bouche, table 4 488 = 52 % (37 % hier matin) |
| ancre | — | anchored 9 · clamped 5 (`density` 5) · unmet ≥200 **3**, <200 7 · `pot_ceiling` 5 | anchored 8 · clamped 2 · day_incomplete 4 · common_pot_day **14/21** · unmet ≥200 6 · `pot_ceiling` 4 |
| attribution | — | ×1,35 | ×1,13 |
| régime / repas | 3 jours pleins sur 7 (trous : lot « plan incomplet » non posé) | — | Nora séparée 14/16, refused 2, **missing 0** |
| explication IA | présente (lane solo câblée par 8a, e8709708) | présente, nomme les raviolis | présente, générique |

**Ce qui reste, dans l'ordre où ça pèse** : (1) `pot_ceiling` — les casseroles restent trop
petites pour les boîtes dimensionnées (croissance bornée), sur duo et quatre ; (2) sur quatre,
14 journées-bouche sur 21 sont « bac commun seul », donc dimensionnées par le bac (`pot_clamped`)
et pas par le besoin de chacun ; (3) le plan incomplet accepté (solo : 4 jours troués sur 7) ;
(4) termes non résolus récurrents (raviolis frais, galette complète, curry en poudre).

### Bacs communs du quatre (demande de l'utilisateur, 2026-09-06 02:30) — ea641803
Lecture (`42-bacs.ts`, plan 02:10) : 16 bacs communs, tous à DEUX bouches, portant la seule
casserole protéique (« saumon cuit 499 g ») + la part du frais ; 300–700 kcal par bouche et par
repas ; `pot_sized 14, pot_clamped 0` → la règle du bac fait sa somme, puis la casserole borne
(`capped_by_pot 5`, lot pot_ceiling de 8a). Deux bacs `dish_incomplete` : « galettes complètes »
irrésolu → casserole sans densité → `pot_incomplete 2`.
Livré : migration `20260906030000` (11 alias vérifiés : galette complète → tortilla_wholemeal,
curry en poudre, moutarde de dijon, jus de citron vert, vinaigre, poulet nu ; raviolis frais n'a
pas de ligne) — les deux bacs se lisent ; `unmetDemand(…, tubServed)` + cause `tub_estimate` :
la journée « bac commun seul » (14/21 sur le quatre) devient mesurable par un servi estimé
(Σ kcal des bacs / mangeurs), compteur seulement. Reste : brancher `perBox → tubServed` dans
l'index foyer après le « fini » de 8a.
- e7ea4911 : `perBox` relu APRÈS dimensionnement → `tubServed` → `unmetDemand` (cause `tub_estimate`).
  À lire sur le prochain quatre : `unmet.tub_estimate` (attendu ≈ 14/21) et `unmet_band` qui couvre enfin
  toutes les journées-bouche. Piège vu : `git reset -- chemin` après un commit privé échoue si un pair
  tient `index.lock` (son `git commit -- chemins`) → entrée périmée dans l'index partagé ; le script
  attend maintenant le verrou.
- Tir quatre 13:53 sur e112c1e0 : `unmet {none 1, factor_clamped 2, pot_ceiling 10, tub_estimate 11, not_anchored 0}` —
  **toutes les journées-bouche sont comptées** (hier 14/21 invisibles) ; `unmet_band ≥200 : 17/24`. Les bacs à
  deux bouches portent désormais féculent + protéine (v30) mais 429–660 kcal par bouche et par repas : le
  `pot_ceiling` (10/24) domine — lot de 8a. « orge perlé » irrésolu rend 3 bacs illisibles.

### Le moment perdu d'une bouche est compté (7a561f2f) — suite du banc « un retour et les calories » de 0f
FB3 : « Nora n'aime pas le yaourt de soja » → le modèle obéit, sa cible suit ses moments restants
(`ownSlots`), 44 % du besoin sans qu'aucun compteur ne la distingue. `lostSlotEnergy` (pur,
pot_demand.ts) : moments que la table sert ce jour-là et que la bouche n'a pas, valorisés sur sa
cible pleine ; histogramme `lost_slots` dans box_sizing. Un moment que personne ne sert n'est pas
perdu (plat mangé à table) — rend 0. Aucun dimensionnement changé : 0f prend le correctif (3)
(cible non réduite sur un moment perdu PAR EXCLUSION, unmet + densifieur) sur ce compteur ; (1) la
ceinture d'exclusion de table et (2) `restoreHeldOff` qui remet une végane sur de la dinde sont
dans sa fenêtre aussi. Je ne tiens plus rien sous `supabase/functions/`.
- 0f a rejoué son banc après ses trois correctifs (rapport §6) : plus d'aliment exclu servi, plus de repli sur ce
  qu'une bouche évite, la part d'un moment perdu revient dans la cible (`lost_by_line`, `lostLineKcal`,
  `anchorFactorFor(…, lostLineKcal = 0)`). Sur FC4, l'écart retrouvé (16 633 kcal / 12 journées-bouche) sort en
  `unmet {pot_ceiling 9, both 1}` et le densifieur n'a rien déplacé : ce sont les CASSEROLES (lot de 8a), pas le
  plafond de masse, qui bornent maintenant — lecture cohérente avec le quatre de 13:53.
- 4badedc6 (0f) vérifié dans ma lane : `lostLineKcal` ne fait que s'ajouter à `effectiveTarget` (0 par défaut),
  `mouthTargetKcal` reste la seule source, `lostSlotEnergy` n'est appelé que sur les cases `held_off_*` ;
  mouth_anchor / pot_demand / mouth_energy : 95 tests verts sur HEAD. Fin de ma journée sur les bacs communs.
- ⚠️ e9000a60 est un commit VIDE (même arbre que e7ea4911) : mon second essai de `commit-private.sh`, lancé
  parce que le premier avait échoué sur `git reset` (verrou d'un pair) alors que son `update-ref` avait réussi.
  La branche est partagée et des commits sont posés dessus : on ne réécrit pas. Le script refuse désormais un
  arbre identique à HEAD.

### Rétrécissement symétrique des casseroles et des courses (a3c6af19) — FC4 rejoué 16:06
0 fuite, 0 repas manquant, `lost_by_line 0` (la ceinture de 0f sépare au lieu de retirer), aucune ligne
poulet/saumon/thon en courses ; `pot_shrink {pots 5, removed 0, lines_scaled 10, lines_dropped 0,
lines_unattributed 5, lines_unrewritable 6}` ; table **6 359 kcal/j = 74 %** (record sur cette fixture).
⚠️ Mais `capped_by_pot 3` : le rétrécissement comparait les tirages BRUTS (avant dimensionnement) à la
masse que la croissance venait d'agrandir pour les boîtes dimensionnées — il défaisait la croissance.
Corrigé : tirages × facteur résolu de la boîte, même base que `neededPotFactor`. À rejouer.
- 9cca3de1 (tirages × facteur) — FC4 rejoué 16:20 : `pot_shrink {removed 3 (saumon, poulet, dinde du mardi : plus aucune
  boîte ne les tire), pots 1, lines_dropped 3, lines_scaled 4, unattributed 10}`, missing 0 ; MAIS `capped_by_pot 4`
  encore et `fuites 10` (terme exclu dans une boîte d'une bouche exclue — ceinture de table, lane 0f), table 4 461 kcal/j
  (variance modèle : 6 359 au tir d'avant). Le plafond de casserole qui mord alors que `short_after 0` : à confronter
  à `sumToleranceRatio` (croissance ×1,05 vs tolérance de somme du §③).

### La croissance des casseroles suit ce que chaque boîte tire de chacune (5a40c48b) — FC4 rejoué 16:40
Cause du `capped_by_pot` malgré `short_after 0` : chaque plat FC4 cite DEUX casseroles (dinde 1 / tofu 1 dans
`uses`), les boîtes des omnivores ne tirent que la dinde, celle de Nora que le tofu ; `neededPotFactor`
recevait la boîte entière répartie à parts égales sur les `uses` du plat (même artefact que le lot 0).
Désormais un tirage par (boîte, casserole) sur les items (`potDrawsByItems`). Rejeu : **capped_by_pot 0,
unmet {none 10, pot_ceiling 0, factor_clamped 0, tub_estimate 18}**, missing 0, fuites 0, pot_shrink
removed 1. Le plafond de casserole ne mord plus ; tout ce qui reste sous le besoin (18/24 journées-bouche)
est « bac commun seul » — la règle du bac (somme des besoins des mangeurs → `pot_sized`) livre un bac que
l'estimation par mangeur dit court : prochain sujet, avec ≥ 3 témoins.
En vol : courses comptées (deux classes par terme) pour `lines_unattributed`.
- 74f5054e : la demande par terme porte deux classes (pesé g/ml ; compté pièces/cuillères), la ligne de courses
  choisit la sienne — FC4 : `lines_unattributed 11 → 2`, `lines_dropped 7`, `removed 3`, capped_by_pot 0, fuites 0
  (tirage faible du modèle : 4 manquants après 2 relances, table 3 471 — variance, pas structure).
  Fin de ma part du « reste à trois » : (1) le pot grossit selon ce que chaque boîte lui tire ; (2) casseroles et
  courses rétrécissent après un retrait, avec compteurs. Index rendu à 8a.

### Les bacs communs, relus contre les moments qu'ils couvrent (FC4 16:50)
Par bouche-jour « bac commun seul » : les bacs (déjeuner + dîner) sont à **85–92 %** du besoin de ces deux
moments (ven/jeu/sam : 1 060 kcal pour 1 111–1 146 chez Claire/Nora), à 50 % le mardi (`factor_clamped` :
bac du modèle sous le tiers, ANCHOR_FACTOR_MAX ×3). Ce qui manque à la JOURNÉE, ce sont les moments servis à
table sans boîte pour personne (petit-déjeuner, collations, coucher : ~45 % de la journée), que personne ne
compte — `tub_estimate` comparé à la journée entière disait 18/18 sous le besoin. Correctif prêt
(`apply-tub-wanted.py`) : `wantedKcal` du bac = part de la cible sur les moments couverts. Reste ouvert :
le bac que le modèle écrit trop petit (×3 ne suffit pas) — prompt du bac (« N × un repas complet »).
- ff51ccb5 : `tub_estimate` compare au besoin des moments COUVERTS par les bacs (`slotPlanTargets` sur la cible
  d'entretien, comme la règle du bac) ; les moments servis à table sans boîte pour personne restent hors compteur,
  exprès. À relire sur le prochain quatre : `unmet_band` des journées en bac seul devrait tomber (85–92 % mesurés
  à la main sur FC4 16:50), sauf le cas ×3 (bac du modèle sous le tiers).
- 0ae22b5a (arbitrage 3, par le bac) : `PotEater.noteBoost` entre dans la somme du bac (`potFactorFor`), l'index le
  nourrit depuis `noteBoostByKey` hissée, compteur `note_boost.applied_pot`. Cause : sur N3 (8a) le cran côté ancre
  était inerte pour Claire qui mange en bac (`common_pot_day` 14/28). 8a rejoue N3.

### « Léa n'aime pas les asperges, Marc adore » — point 2 (5fa06ef6)
Rapport 0f §10 : au plan suivant les deux lignes sont servies et le modèle évite l'asperge pour toute la
table. Livré : bloc « ONE PERSON WANTS WHAT ANOTHER REFUSES » (v31, armé par les paires prefer@X /
exclude@Y depuis les deux magasins, jamais une exclusion de table), compteur `preference_split {pairs,
wanters, composed, refuser_clean, refuser_bitten}` après ceinture avec `dishBitesExclusion` (le texte de la
préférence tokenisé comme une exclusion). Même commit : le plafond du bac voit le cran de la note datée
(`mealKcal × (1 + boost)`, N3d : 3 bacs bornés `density` reprenaient le cran). Empreinte v31 = v30 (le bloc
d'arbitrage ne bouge pas). Reste : lire aussi les items de la NOTE FRAÎCHE dans les paires (variable de 0f).
Tir ASP4 sur quatre en cours (exclude@Claire, prefer@Paul).
- Tir ASP4 (quatre, exclude asperges@Claire + prefer@Paul, 5fa06ef6) : `preference_split {pairs 1, wanters 1,
  composed 0, refuser_clean 1}` — le bloc a été servi (paire construite), le modèle ÉCRIT dans son explication
  « les asperges restent un ajout séparé dans les boîtes de Paul » et n'en met dans aucune boîte (0 casserole,
  0 item, 0 titre). Un tirage. Le bloc seul ne suffit pas : c'est un cas de RELANCE (« la boîte de Paul doit
  citer les asperges à ≥ 2 déjeuners/dîners »), lane des relances (8a) ; en attendant, l'écart est dit dans
  `issues` (l'explication ne peut plus le masquer sans que l'archive le contredise).
- 45375a74 : les paires du COMPTEUR `preference_split` lisent aussi la note fraîche (`noteBelt`, 22ab729c de 0f) —
  `splitsFrom` une seule écriture ; `pairs_from_stores` / `pairs_fresh`. Mesuré par 0f à trois lanes : ASP1r (plan
  annoté) Léa 6 → 0 asperges par ceinture + relance ; ASP2r (plan suivant) `preference_split {pairs 1, composed 1,
  refuser_clean 1}`, casserole « Asperges rôties » citée par la seule boîte de Marc à 2 repas, explication vraie
  boîte par boîte. Le point 2 tient sur ce cas (un tirage). 8a pose la relance « préférence contre exclusion »
  par parties et remplace mon IIFE par une mesure partagée — prévenu de rebaser sur 45375a74.
- ASP5/ASP6 (8a, 769856a2) : la relance « préférence contre exclusion » par parties est PROUVÉE en réel — ASP6 :
  0 asperge composée → relance, 3 cellules fusionnées, `prep_asparagus` importée ; plan final : asperges dans la boîte
  de Paul à 3 repas, 0 chez Claire, 0 fuite, 102/102 nourris. Le point 2 est fermé (bloc + compteur + relance).
  Reste vu par 8a : l'explication du plan de base contredit le plan fusionné — il la fait suivre la fusion.
