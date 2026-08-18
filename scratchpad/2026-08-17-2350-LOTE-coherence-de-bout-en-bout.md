# LOT E — la cohérence de bout en bout

**Branche** `ff-001-quotidien-du-coach` · **2026-08-17, 23:50** · aucun `push`, aucun merge.
**Commit ajouté** `777a0c5c` (le correctif du slug de boîte), quatre chemins.
**Plans réels écrits ce soir** `1e653a47` (Auber, 08-17→19) et `124254f5` (Auber, 08-20→26, **adopté depuis l'aperçu au navigateur**).

> Ce rapport s'adresse à quelqu'un qui n'a rien vu du chantier. Il dit, dans
> l'ordre : ce que valent aujourd'hui les quatre choses demandées, ce qui est
> prouvé et par quoi, ce qui ne l'est pas, et les décisions qui restent.

---

## 1. LES QUATRE EXIGENCES, CHIFFRÉES

### P1 — le plan s'affiche par jour, en aperçu et en validé · ✅ **livré et vu**

| Ce qui est mesuré | Chiffre |
|---|---|
| L'aperçu rend les jours **dans l'ordre du plan** | **7 blocs**, `Thu 20 → Wed 26`, vus dans la modale |
| Le plan validé rend le jour choisi, avec sa session et ses courses | `Lundi · Session de cuisine environ 90 min · Les courses du jour — 43 articles` |
| Le rail de jours, à 320 px | défile **dans son conteneur** (474 px dans 288), la page reste à **320/320** |
| Les deux langues | **0 libellé resté en anglais** en interface française |

**Mais deux jours de cette semaine ne s'affichent nulle part**, et le cas est
arrivé sur mon propre run — c'est le premier point rouge, §3.1.

### P2 — chaque plat porte le geste du jour J · ✅ **le plus solide des quatre**

| Population | Déclaré | Taux |
|---|---|---|
| **Tous les plans écrits qui portent le compteur, après mes runs (5 plans)** | **80 / 80** | **100 %** |
| dont mon plan Auber `1e653a47` | 8 / 8 | 100 % |
| dont mon plan adopté `124254f5` | 21 / 21 | 100 % |
| Mon run individuel (Theo, aperçu) | 9 / 9 | 100 % |
| `invalid` / `minutes_missing`, toutes lanes | **0 / 0** | — |

À l'écran : `Cuisine minute — 25 min`, `À assembler — 15 min`, `Rien à préparer — 10 min`,
chacun **suivi du texte de la méthode**, au-dessus des ingrédients. Vu en anglais
et en français.

🔴 **Sauf que « Rien à préparer — 10 min » est une contradiction, et elle est
toujours à l'écran.** Cinq plats de deux plans vivants disent « rien à préparer »
en annonçant des minutes. Le LOT 2B a posé un **compteur** sur ce cas — il compte,
il n'empêche rien. Sur mon plan adopté de ce soir, « Rien à préparer — 10 min »
est suivi de « Spoon the yoghurt into six bowls, slice the peaches, halve the
strawberries and scatter the seeds ». Détail en §3.2.

### P3 — la séparation par personne est nette · 🟠 **livrée, vue, mais le modèle obéit une fois sur deux**

**Ce qui est prouvé pour la première fois de ce chantier :** la séparation a été
vue **à l'écran, sur un plat produit par le modèle** (les lots précédents ne
l'avaient vue que sur une fixture écrite à la main).

| | Mesure |
|---|---|
| Aperçu Auber au navigateur | **6 voies `FOR THE TABLE` / `FOR THEO`**, dont « Theo's fish and rice breakfast box », « Theo's tuna pasta box », « Theo's chicken and potato dinner box » |
| Mon run HTTP Auber (`one_session`, 4 j) | `dish_owners = {asked: 12, declared: 3, attributed: 3, refused: 0}` |
| Le plan écrit de 4C `483da69a` | `{asked: 12, declared: 5, attributed: 4, refused: 1}` — **4 plats dédiés en base, écrits par le modèle** |
| Mon plan adopté `124254f5` | `{asked: 21, declared: 0, attributed: 0}` — **zéro** |
| `refused` cumulé | **1 sur 12 déclarations** : quand le modèle écrit l'identifiant, il se trompe presque jamais |

🔴 **L'aperçu montrait trois plats pour Theo. Le plan adopté n'en a aucun.**
« Adopter » **recompose** (c'est écrit à l'écran : « it can come out a little
different from this preview ») — mais ici ce n'est pas une nuance, c'est une
fonctionnalité entière qui disparaît entre ce qu'on a validé et ce qu'on obtient.
Détail en §3.3.

🔴 **Et la séparation peut affamer les autres.** Sur mon run Auber en `one_session`,
**3 moments sur 12** portaient le plat dédié de Theo **et aucun plat de table** :
les cinq autres bouches n'avaient rien à manger ce midi-là. C'est la ligne C4
(« jamais zéro ») violée, et **rien ne la compte**. Détail en §3.4.

⚠️ **Un piège de réglage, à savoir** : avec `cooking_shape: "one_dish"`, le
budget de plats dédiés vaut **0** par construction (`household_portions.ts:757`,
`asksForASecondDish`). C'est correct, et c'est aussi pourquoi mon premier run a
rendu `asked: 0` : **un foyer qui demande « un seul plat » n'aura jamais de
séparation**, quelles que soient les divergences d'objectifs.

### P4 — les grammes par personne et les boîtes · 🟠 **la mécanique tient, la consigne au modèle ne tient pas**

**Ce qui marche, et qui est le cœur de la demande — vu à l'écran, sur mon propre run :**

```
LA PESÉE
  Boîte Paul — 450 g       Boîte Iris — 420 g      (fat_loss)
  Boîte Zoe  — 520 g       Boîte Marc — 450 g      (maintenance)
  Boîte Theo — 560 g       Boîte Lou  — 280 g      (enfant)
                           Theo = muscle_gain, Zoe = health
```

Six boîtes, une par bouche, **cinq grammages distincts sur six**, et l'ordre
suit les objectifs déclarés. C'est exactement ce que P4 demande, et c'est lisible
en français comme en anglais, à 1280 px comme à 320 px.

**La part de chaque bouche atteint l'écran, avec ses grammes**, sur le plan
adopté (12 lignes le jeudi) :

```
Paul — 150 g from each chicken box on the meal days it is used   150 g
Theo — 150 g from each chicken box on the meal days it is used   150 g
```

| Compteur | v14 (4B) | v15 (4C) | **ce soir (mes 2 plans écrits)** |
|---|---|---|---|
| notes de portion chiffrées | **0 / 93 = 0 %** | 35 / 117 = 29,9 % | **23 / 60 = 38,3 %** |
| dont le plan adopté seul | — | — | **23 / 24 = 95,8 %** ← le meilleur jamais mesuré |
| dont `1e653a47` seul | — | — | **0 / 36 = 0 %** ← le pire |
| parts orphelines | 18 / 18 | 0 / 11 | **0 / 48** |
| boîtes refusées | 0 | 0 | **24** ← nouveau, §3.5 |

🔴 **Trois défauts de P4, mesurés ce soir, détaillés en §3.5 → §3.7 :**
① 24 boîtes sur 30 jetées parce que le modèle réutilise le même nom de boîte
d'une casserole à l'autre ; ② `2000 g` affiché à cinq personnes — un nombre que
personne n'a écrit ; ③ « boîte partagée » : le contrat de `grams` se contredit
entre le prompt, le parseur et l'écran.

---

## 2. LE POSTE, ET LA FRAÎCHEUR — prouvée, pas supposée

- **Sondé avant tout geste** : `docker logs --tail 40 --timestamps
  supabase_edge_runtime_Sophia_2` — uniquement des crons réentrants
  (`process-llm-retry-jobs`, `trigger-topic-compaction`, `process-checkins`,
  `keel-coach-broadcast-v1`). Aucune lane voisine en génération.
- **`docker restart supabase_edge_runtime_Sophia_2`, et rien d'autre** (j'avais
  modifié `_shared/`). Debout prouvé par **401 sans auth** sur les deux fonctions,
  PostgREST à 200.
- `./scripts/check-local-jwt-alg.sh` → **alignement HS256 correct**.
  `./scripts/local_extend_kong_functions_timeout.sh` → `read_timeout=600000`.
- **Aucune commande à risque** : ni `supabase stop/start`, ni `db reset/push`, ni
  `functions deploy`, ni `secrets`, ni `config push`, ni `link`. **Aucune migration.**
- **Fraîcheur prouvée par la version sur le plan produit** :
  `meal.en.v11_weighed_or_counted+household.v15_one_box_each_and_a_number`,
  et par une clé que seul mon code de ce soir produit — `vague_portions.box_ids`,
  présente sur les deux plans écrits.
- Mots de passe `1234567` **vérifiés avant de viser**, sur chaque compte.
  ⛔ **`ff060_mouths@example.com` répond 400** : compte écarté, jamais visé.

---

## 3. CE QUI RESTE ROUGE — dix points, chacun avec son `fichier:ligne`

### 3.1 🔴 Le plan glisse d'un jour : aujourd'hui n'a rien à manger, et deux plats sont perdus

**Mesuré sur mon propre run réel `1e653a47`** (fenêtre `mon 08-17` / `tue 08-18` /
`wed 08-19`) : le modèle a posé ses plats sur **`tue`, `wed` et `thu`**.

- **Lundi — aujourd'hui — porte 0 plat**, alors qu'il porte une session de
  cuisine de **90 minutes** et **la totalité des 43 articles de courses**.
- **Les 2 plats du `thu` sont hors fenêtre.** `thu` n'a pas de date
  (`windowDates` ne rend que les jours du plan), donc ils ne peuvent pas
  s'afficher.

**Ce que ça donne aux trois écrans, mesuré :**

| Surface | Ce qui s'affiche |
|---|---|
| `/app/plan`, vue **jour**, lundi | session ✅, courses ✅, puis **« Petit-déjeuner — rien ici / Déjeuner — rien ici / Dîner — rien ici »** |
| `/app/plan`, vue **semaine** | **le bloc de lundi n'existe pas** — ni la session de 90 min, ni les 43 articles |
| `/app/household`, **secondaire** | les 2 plats du `thu` apparaissent **en tête, dans un groupe sans titre**, comme si c'était la première chose que la maison cuisine |

**Trois endroits, trois comportements différents pour le même plat :**
- `_shared/keel/meal_generation.ts:267` — le parseur valide `DAY_TOKENS.includes(day)`,
  c'est-à-dire « est-ce un jour de la semaine », **jamais « est-ce un jour de cette
  fenêtre »**. Rien n'est refusé, rien n'est compté.
- `frontend/src/keel/lib/mealBuilderModel.ts:115-119` — `groupByDay` n'émet un
  groupe que pour les jetons de `order` : un plat hors fenêtre est **jeté en
  silence**, il n'entre même pas dans le groupe « sans jour ».
- `frontend/src/keel/lib/dishListByDay.ts` — la liste plate du secondaire, elle,
  le **garde** et le met en tête sans titre.

**Et l'arbitrage laissé ouvert par 1B est devenu concret** :
`frontend/src/keel/lib/mealBuilderModel.ts:107-110` + `plan/PlanResult.tsx:191` —
un jour sans plat n'a pas de bloc en vue semaine. Ce n'était qu'un cas théorique
dans son rapport ; ce soir c'est **aujourd'hui**, avec 90 minutes de cuisine
invisibles.

### 3.2 🔴 « Rien à préparer — 10 min » se lit toujours à l'écran

`_shared/keel/meal_generation.ts` — le troisième constat du LOT 2B compte le cas
(`same_day says none but announces N minute(s)`) et **ne le corrige pas**, par
choix assumé (« un constat compté, jamais un rejet »).

Mesuré ce soir sur les plans **vivants** : **5 plats** dans ce cas
(`483da69a` ×3, `6620682c` ×2), et **1 de plus** sur le plan adopté `124254f5`.
Vu au navigateur, en français : `Rien à préparer — 10 min` suivi de « Spoon the
yoghurt into six bowls, slice the peaches, halve the strawberries… ».

Le resserrage de prompt proposé par 2B (`"none"` = 0 minute, sinon c'est
`assemble`) **n'a pas été appliqué**. C'est une ligne de brief à mesurer, pas une
évidence.

### 3.3 🔴 L'aperçu montre une séparation que le plan adopté n'a pas

**Vu de mes yeux, ce soir, dans cet ordre :**

```
aperçu (2ᵉ tour)  →  3 plats dédiés à Theo, 3 voies « FOR THEO » à l'écran
« Adopt this plan »
plan écrit 124254f5 →  dish_owners = { asked: 21, declared: 0, attributed: 0 }
```

C'est le comportement documenté (`api/planDraft.ts:415-428`, « Adopter
RECOMPOSE ») et l'écran le dit — mais la phrase « it can come out a little
different » ne prépare personne à perdre **toute** la séparation par personne.
C'est **la** décision produit la plus visible qui reste à l'humain (§4).

### 3.4 🔴 Un plat dédié peut laisser les autres bouches à zéro — C4, non compté

Mon run Auber en `one_session`, fenêtre de 4 jours :

```
thu lunch   table=0   dédiés=[Theo]   <<< 5 bouches sans rien
fri lunch   table=0   dédiés=[Theo]   <<< idem
sun lunch   table=0   dédiés=[Theo]   <<< idem
→ 3 violations sur 12 moments
```

Le modèle a **remplacé** le plat de la table au lieu d'en ajouter un. Aucune
`issue`, aucun compteur. Le symétrique (deux plats de table au même moment) est
présent lui aussi, sur deux plans vivants : `483da69a` `tue/breakfast` et
`6620682c` `fri/dinner` (déjà nommé par 3B, toujours là, toujours non compté).

### 3.5 🔴 24 boîtes sur 30 jetées : le modèle nomme ses boîtes par PERSONNE, pas par casserole

`1e653a47`, `box_counts = {preparations: 5, with_boxes: 1, boxes: 6, refused: 24}`.

Le modèle a écrit les **six mêmes identifiants** (`box_paul_balanced`,
`box_zoe_veg`, `box_theo_large`, `box_iris_light`, `box_marc_balanced`,
`box_lou_child`) sur **les cinq casseroles**. La porte d'unicité
(`_shared/keel/meal_generation.ts:3108-3113`) les jette à partir de la deuxième.
Résultat : **une casserole pesée sur cinq**, quatre casseroles sans aucune
instruction de pesée.

⚠️ La garde est juste — deux boîtes du même nom rendraient `box_id` ambigu. Le
défaut est dans la **consigne** : elle demande « une boîte par bouche et par
préparation » sans dire que le NOM doit être unique **dans tout le plan**.
Le compteur `refused` a fait exactement son travail : sans lui, ce plan
affichait « 100 % des préparations avec boîtes » en n'en pesant qu'une.

### 3.6 🔴 « Boîte Paul, Zoe, Iris, Marc, Lou — 2000 g » : un nombre que personne n'a écrit

Vu à l'écran dans l'aperçu, à 320 px comme à 1280 px, **trois fois de suite**.
`2000 g` est `BOX_MAX_GRAMS` (`_shared/keel/meal_generation.ts:722`) : le modèle
a demandé davantage, le parseur a **écrêté**, et l'écran présente le plafond
comme une instruction de service à cinq personnes. La ligne de part disait, elle,
« Take the family box share… **2000 g 2000 g** ».

4B avait décrit ce risque (§9.2) et 4C a posé le compteur `capped` — qui, ce
soir encore, **lit 0 sur mes deux plans écrits**. Il a mordu dans l'**aperçu**,
pas dans un plan persisté : le champ n'a toujours pas été vu à l'œuvre en base.

### 3.7 🔴 Sur une boîte partagée, `grams` veut dire trois choses différentes

| Où | Ce que `grams` y signifie |
|---|---|
| Le brief au modèle (v15, `_shared/keel/household_portions.ts`) | « what **ONE person** takes out, never the size of the tub » |
| Le parseur (`_shared/keel/meal_generation.ts:4314`) | `prep.boxes.reduce((sum, box) => sum + box.grams, 0)` — la somme compte la boîte **une fois**, donc `grams` = **le bac** |
| L'écran (`meals.boxes.line`) | `Boîte {prénoms} — {n} g` — un seul nombre à côté de N prénoms, **illisible dans les deux sens** |

Mesuré : `483da69a` porte `box_prep_chicken_roast_shared — 900 g` pour 4 bouches
(900 ÷ 4 = 225 g par personne, plausible ; 900 g par personne, non). Le plan
adopté de ce soir porte `box_chicken_lunch — 150 g` pour 6 bouches, et la note de
portion dit « Take 150 g » — là, `grams` est **par personne**. **Les deux
lectures coexistent en base.** Tant que le contrat n'est pas tranché, la somme du
plafond sous-compte d'un facteur égal au partage.

### 3.8 🔴 La divergence des grammages est intermittente, elle aussi

Sur les trois compositions Auber de ce soir :

| Composition | Divergence entre bouches |
|---|---|
| `1e653a47` (écrit) | ✅ **6 boîtes, 5 valeurs distinctes**, 280 → 560 g |
| aperçu, 1ᵉʳ tour | ❌ une boîte « famille » pour 5 bouches + une pour Theo |
| aperçu, 2ᵉ tour + plan adopté | ❌ **13 boîtes, toutes « Paul, Zoe, Theo, Iris, Marc, Lou »** — un seul poids pour six |

Le plan adopté exprime bien la divergence — mais **dans la prose** (« Take 150 g »
pour cinq, « Take 200 g » pour Theo), pas dans les boîtes. Les boîtes y servent à
découper la casserole **par repas** (`box_chicken_lunch`, `box_chicken_dinner`,
`box_chicken_saturday`, `box_chicken_sunday`), ce qui n'est pas le protocole
demandé et fait lire `mouths_double: 6` au compteur.

### 3.9 🔴 On ne peut PAS ouvrir l'aperçu quand la semaine est déjà couverte

**Diagnostiqué, pas contourné** — c'est le blocage que 2B et 3B ont rencontré.
Mesuré à la requête, sur le foyer Auber :

```
POST … intent:"draft", fenêtre 3 j depuis aujourd'hui  → 409 plan_overlaps_existing
POST … intent:"draft", fenêtre à partir du 24/08       → 400 window_beyond_this_week
```

La cause est structurelle, en trois lignes :
- `generate-household-meal-v1/index.ts:937-943` — **un aperçu ne peut pas nommer
  de `replaces`** (`intent=draft writes nothing, so it cannot name a replaces`) ;
- `:1386-1394` — la garde de chevauchement reçoit donc **toujours**
  `replacesId: null` pour un aperçu ;
- `:1353-1365` — et une fenêtre qui commence après dimanche est refusée.

**Conséquence** : un foyer dont les plans vivants couvrent aujourd'hui → dimanche
ne peut **jamais** prévisualiser. C'est l'état normal d'un foyer qui utilise le
produit. Le seul chemin restant est « Composer un autre plan » en
`replace_current`, qui **écrit** — c'est-à-dire précisément le geste que l'aperçu
existe pour éviter.

C'est comme ça que j'ai atteint la modale : j'ai d'abord écrit un plan **court**
(3 jours) sur Auber, ce qui a libéré `jeu → dim`. **Sans cette manœuvre, aucune
des quatre paires n'aurait pu voir l'aperçu, et aucun utilisateur non plus.**

### 3.10 🔴 Le secondaire n'a rien sur `/app/today`, et sa boîte n'existe nulle part

`frontend/src/keel/pages/TodayPage.tsx:921-931` — `loadMealPlans(userId, …)` lit
le plan **dont l'utilisateur est propriétaire**. Un secondaire de foyer n'en a
pas. Mesuré ce soir, connecté en Theo, alors que son foyer porte un plan vivant :

> « **You don't have a plan for this week yet** — Your coach teaches the method,
> the week itself is yours to build. » + bouton **« Build my week's plan »**

Le même écran, chez le maître, montre « You cook today — about 90 min » et les
43 articles. Et le bouton proposé à Theo l'enverrait sur la **lane individuelle**
(`api/planRouting.ts`, `!isOwner → personal`), donc vers un **second** plan à côté
de celui de sa maison.

S'y ajoute le trou décrit par 4B (§10 a) : **le secondaire ne voit sa boîte nulle
part.** Theo a une boîte de 560 g sur le plan de ce soir ; sur `/app/household` il
lit la liste des plats et **rien d'autre** — mesuré : 0 `[data-box-id]`, 0 part,
0 ingrédient, 0 méthode. Les gardes tiennent (c'est voulu), mais la personne qui
ouvre le frigo n'a pas son chiffre. Le correctif décrit par 4B est une RPC
`keel_household_meal_view` en `SECURITY DEFINER` rendant `myBoxes` filtré sur
`auth.uid()`. **Non appliqué : c'est une décision de produit.**

### 3.11 ⚠️ Ce que je n'ai pas prouvé

1. **Le chemin exact du défaut ① n'a toujours pas été rejoué.** Une relance
   d'ancre protéique a bien été **déclenchée** sur l'adoption de ce soir
   (`generate-household-meal-v1.protein_anchor_retry`, 40 s) — mais elle a été
   **refusée** (`protein_anchor_retry: false`). Le correctif `mealSourceText` de
   4C reste donc prouvé par la corrélation historique et par lecture du code,
   **jamais par un run où la relance est acceptée**. C'est le troisième soir
   consécutif où le cas ne se présente pas.
2. **`capped` n'a jamais mordu sur un plan écrit.** Il a mordu à l'aperçu (§3.6),
   ce qui est déjà mieux qu'hier, mais aucune ligne persistée ne le porte.
3. **La lane individuelle n'a pas de ligne écrite** portant les compteurs :
   mon run était un aperçu. Ce qu'il prouve quand même, et c'est le point que 4B
   laissait à E : **le modèle n'invente aucune boîte hors du foyer** —
   `boxes = {preparations: 3, with_boxes: 0, boxes: 0, refused: 0}`,
   `box_uses = {uses: 5, cited: 0}`. La lane individuelle est propre.
4. **Le compteur `same_day` n'est pas rendu sur un aperçu**, sur aucune des deux
   lanes (vérifié sur mes deux drafts). P2 n'est donc pas vérifiable par le
   compteur avant écriture — seulement plat par plat.
5. **`vague_portions.box_ids` lit 0 partout** : ma ceinture neuve est armée et
   n'a pas mordu en réel ce soir. C'est un compteur à zéro là où on n'attendait
   pas forcément du signal — le cas mesuré par 4C (run C) ne s'est pas reproduit.
   Prouvé par test et par mutation, pas par octets réels.
6. **Les 3 rouges vitest étrangers** sont inchangés, à l'identique
   (`src/edge/coverage-guard.int.test.ts` ×2, `src/keel/copy/planRefusals.int.test.ts`).
   Antériorité prouvée par 1B, reconfirmée par 2B, 3B, 4B, 4C et moi.
7. **La lane foyer saute toujours `keelGenerationModel()`**
   (`generate-household-meal-v1/index.ts:3299`, `:3419`). Toutes mes durées
   (38 s, 50 s, 65 s, 69 s, 71 s) sont celles de `gpt-5.4-mini`, lu dans les logs.
   ⚠️ **Et la mesure de 3C change la donne** : le modèle prévu (`gpt-5.6-sol`)
   **expire à 4 minutes** sur ce prompt et fait tomber la requête entière.
   Brancher le modèle de génération sur cette lane **ne marche pas en l'état** :
   il faut d'abord découper l'appel ou lever le mur du worker.

---

## 4. LES DÉCISIONS QUI APPARTIENNENT À L'UTILISATEUR

### D1 — L'aperçu inatteignable (§3.9) · **la plus urgente à mon sens**

| Option | Ce qu'elle coûte |
|---|---|
| Autoriser `replaces` sur un aperçu | Le plus direct. Coût : une garde à assouplir et un test qui dit aujourd'hui l'inverse (`intent=draft writes nothing, so it cannot name a replaces`). Sans écriture, le risque est faible. |
| Autoriser une fenêtre au-delà de dimanche | Rouvre le défaut que la garde ferme : le modèle refuse quand « today is: mon » côtoie « days to fill: mon (semaine prochaine) ». Coûteux. |
| Ne rien changer | L'aperçu reste une fonctionnalité que seul un foyer neuf peut voir. |

### D2 — Un plan adopté peut perdre la séparation de son aperçu (§3.3)

| Option | Ce qu'elle coûte |
|---|---|
| Écrire le payload déjà composé (« adopt this draft ») | C'est ce que `api/planDraft.ts:410-413` désigne comme le vrai correctif : un chemin serveur qui écrit un brouillon existant, avec ses propres gardes de sortie. Un lot backend à part entière. |
| Dire ce qui a changé après l'adoption | Bon marché, honnête, ne répare rien. |
| Accepter | On continue de valider quelque chose qu'on n'obtient pas. |

### D3 — L'obéissance intermittente du modèle · **trois symptômes, une seule cause**

| Symptôme | Taux mesuré |
|---|---|
| Attribution d'un plat dédié | **2 runs sur 4** (3C), confirmé ce soir : 3 attribués sur un run, 0 sur le suivant |
| Note de portion chiffrée | 29,9 % (4C) → **38,3 %** ce soir, mais **0 %** sur un plan et **95,8 %** sur l'autre |
| Grammages divergents par bouche | 1 composition sur 3 ce soir |

Trois sorties, et elles ne s'excluent pas :
1. **Resserrer encore** — piste concrète et bon marché pour §3.5 : dire que le
   NOM d'une boîte doit être unique dans tout le plan (« `box_<preparation>_<qui>` »).
   Elle vaut 24 boîtes récupérées sur 30 dans le cas mesuré.
2. **Changer de modèle sur cette lane** — ⛔ **ne marche pas en l'état** : 3C a
   mesuré `gpt-5.6-sol` à plus de 4 minutes sur ce prompt, coupé par le mur du
   worker. Prérequis inconnu jusqu'ici.
3. **Accepter** — et alors dire à l'écran ce que le plan porte et ce qu'il ne
   porte pas, plutôt que de rendre une séparation « parfois ».

### D4 — Que veut dire `grams` sur une boîte partagée (§3.7)

Trancher entre « par personne » (et alors la somme du parseur doit multiplier par
le nombre de bouches, `meal_generation.ts:4314`) et « le bac » (et alors le brief
v15 dit le contraire de ce que le code lit, et l'écran doit écrire
« Boîte Paul, Zoe — 900 g **pour 2** »). Aujourd'hui les deux lectures cohabitent
en base. **C'est un choix, pas un bug — mais il ne peut pas rester ouvert.**

### D5 — Le jour vide de la vue semaine (§3.1)

L'arbitrage laissé ouvert par 1B. Le geste minimal est de construire les blocs de
la vue semaine sur l'**union** des jours qui portent un plat, une session ou une
vague. En attendant, un utilisateur peut ne pas savoir qu'il doit cuisiner 90
minutes aujourd'hui.
À décider en même temps : **que fait-on d'un plat hors fenêtre** — le refuser au
parseur, le compter, ou le rendre dans le groupe sans titre comme le fait déjà la
liste plate du secondaire. Les trois surfaces ne peuvent pas continuer à répondre
différemment.

### D6 — La boîte du secondaire (§3.10)

Le refus de 4A/4B est juste (passer `preparations` au client d'un secondaire lui
enverrait les grammes de tout le monde). La sortie propre est une RPC
`SECURITY DEFINER` qui ne rend que **sa** ligne. C'est un petit lot backend, et
c'est la seule façon d'atteindre la personne qui ouvre le frigo.

---

## 5. LA DETTE i18n — une copie fraîche de cette branche NE COMPILE PAS

Convention des lanes : les packs `en.ts`/`fr.ts` se modifient sur le disque et ne
se commitent pas. Le chantier a ajouté **22 clés**, présentes dans les deux packs :

| Lot | Clés | Namespace |
|---|---|---|
| 1A | 10 · `meals.result.day_*` | `meals` |
| 2A | 5 · `meals.same_day.*` | `meals` |
| 3A | 2 · `meals.day_person.*` | `meals` |
| 4A | 5 · `meals.boxes.*` (4) + `meals.sessions.makes_one` | `meals` |
| 1B, 2B, 3B, 4B, 4C, **E** | **0** | — |

**Ce que ça implique, mesuré :**

- `frontend/src/keel/i18n/fr.ts` est **non suivi par git**, et il est importé par
  **11 fichiers commités** — dont **`frontend/src/keel/i18n/t.ts:8`**, qui est du
  code de production, pas un test.
- `frontend/src/keel/components/KitchenToday.tsx` est **non suivi**, et il est
  importé par `frontend/src/keel/pages/TodayPage.tsx:83`, commité.
- `frontend/src/keel/i18n/en.ts` est suivi mais porte **3412 insertions et 998
  suppressions** non commitées.

➡️ **Un `git clone` de `ff-001-quotidien-du-coach` sur une machine neuve ne
construit pas le front.** Ce n'est pas une dette de ce chantier — c'est celle de
la lane i18n — mais elle est maintenant **structurelle** : la couche de traduction
elle-même dépend d'un fichier absent du dépôt. C'est le seul point de ce rapport
qui bloque quelqu'un d'autre que nous.

---

## 6. LA GRILLE C1 → C8, REJOUÉE ENTIÈRE

| | Ligne | Verdict | Preuve |
|---|---|---|---|
| **C1** | la fenêtre, chaque jour une fois, ordre du plan | 🔴 | 7 plans : jours distincts = durée sur 6/7. **`1e653a47` : jetons `tue,wed,thu` pour une fenêtre `mon,tue,wed`** (§3.1). `483da69a` : 9 plats, **tous sur `tue`**, lundi vide. À l'écran : aperçu `Thu 20 → Wed 26`, ordre du plan ✅ |
| **C2** | la jointure cuisine | ✅ | **0 préparation orpheline** sur les 8 plans vivants (124 `uses`). `box_uses.refused = 0` sur les deux plans écrits : aucune boîte citée avant d'être remplie |
| **C3** | le jour J | 🟠 | `same_day` valide **80/80** sur les plans qui le portent ; `reheat_only` sans `uses` = **0** ; `none` avec `uses` = **0** ; **`none` qui annonce des minutes = 5** sur les plans vivants d'avant mes runs, **+1** sur le plan adopté (§3.2) |
| **C4** | les personnes | 🔴 | « jamais zéro » : ✅ sur tous les plans **écrits**, 🔴 **3 moments sur 12 en run réel** (§3.4). « jamais deux » : 🔴 **2 violations** sur 2 plans vivants, non comptées |
| **C5** | les grammes | 🟠 | Somme : `sum_over = 0` partout. Provenance : **0 boîte inexistante sur 44 citations**. Divergence réelle : ✅ sur `1e653a47` (5 valeurs / 6). 🔴 **24 boîtes refusées** (§3.5), 🔴 contrat de `grams` ambigu (§3.7) |
| **C6** | les courses | ✅ | Recalculé par le module **serveur** en Deno sur `1e653a47` : une vague, `buyOn = 2026-08-17`, 43 articles = premier jour de cuisson (`mon`). L'écran affiche 43 le lundi, rien mardi/mercredi. `MAX_FRIDGE_DAYS = 3` |
| **C7** | les ceintures | ✅ | Grep sur `dishes`, `preparations`, `member_portions`, `shopping_list` des **8 plans vivants** : `kcal\|calorie\|bmi\|imc\|body fat\|masse grasse\|weight loss\|perte de poids\|deficit` ⇒ **aucun**. Aucun slug de boîte dans aucune note (`~ 'box_[a-z0-9_]+'` ⇒ 0 ligne). Vérifié dans les deux langues à l'écran |
| **C8** | les deux surfaces | ✅ | **L'aperçu a été OUVERT** — premier de ce chantier. `PlanResult` y rend les mêmes briques : rail par jour, session, courses, `LA PESÉE`, bandeaux du jour J, `FOR THE TABLE` / `FOR THEO`, lignes de part. `pages/setupDraftWiring.int.test.ts:148-156` intact |

---

## 7. LES RUNS RÉELS

| # | Lane | Compte | Fenêtre | Intent | HTTP | Durée | Écrit |
|---|---|---|---|---|---|---|---|
| 1 | foyer (Auber, 6 bouches, 4 objectifs) | `laneb-master-…` | 08-17 + 3 j | `replace_current` | 200 | **38 s** | **`1e653a47`** |
| 2 | foyer (Auber), `one_session` | idem | 08-20 + 4 j | `draft` | 200 | **71 s** | non |
| 3 | **individuelle** (Theo, secondaire) | `laneb-theo-…` | 08-20 + 3 j | `draft` | 200 | **170 s** | non |
| 4 | foyer, **au navigateur** | idem | 08-20 + 7 j | `draft` | 200 | ~65 s modèle | non |
| 5 | foyer, **« Refaire avec ça »** au navigateur | idem | idem | `draft` + note | 200 | ~69 s modèle | non |
| 6 | foyer, **« Adopter »** au navigateur | idem | idem | `prepare_next` | 200 | 50 s + **40 s de relance** | **`124254f5`** |

⚠️ **Le run 1 a retiré `45bc8a52`** (le plan de 4B) : c'était le seul chemin
produit pour composer sur Auber, dont toute la semaine était couverte (§3.9).
**La ligne survit** (`retired_at` posé, `dishes`/`preparations`/`member_portions`/
`generated_from` intacts) : sa preuve — 18 parts orphelines sur 18 — se relit en
retirant `retired_at is null` du filtre, et je l'ai vérifiée après coup.

⚠️ **Le temps que met un aperçu au navigateur : environ 4 minutes** entre le clic
et la modale utilisable, dont 65 s de modèle. C'est mesuré, sur `gpt-5.4-mini`.

⚠️ La fixture fabriquée à la main par 3B (`2ab8a495`, `6620682c`) est **traitée
comme fabriquée** : je ne m'en sers pour aucune conclusion, et je l'ai laissée en
place. Ses sauvegardes sont dans `scratchpad/backup_dishes_*.json`.

---

## 8. LE CORRECTIF QUE J'AI APPLIQUÉ — `777a0c5c`

**Le défaut, mesuré par 4C au run C** : `« Use box_prep_chicken_shared. »` et
`« Shares box_chicken_me with the Kid. »` dans des notes de portion. L'écran
n'affiche jamais un id de boîte — `data-box-id` est un **attribut** — sauf quand
le modèle en glisse un dans une **phrase**, et là il se lit à voix haute à table.

**La ceinture** (`_shared/keel/household_portions.ts`) :

```
boxIdsInNote(note, ids de boîte de CE plan)
  → note mise à NULL, comme sanitizePortionNote
  → issue  portion_note_box_id:<membre>:<id>
           share_note_box_id:<membre>:<prep>:<id>
  → compteur  vague_portions.box_ids
```

- **Liste fermée, jamais une forme devinée** : les ids de boîte gardés par le
  parseur, passés par l'appelant (`generate-household-meal-v1/index.ts`,
  `meal.preparations.flatMap(p => p.boxes.map(b => b.id))`).
- **Paramètre REQUIS**, jamais `?` — patron `preparationIds` / `boxMemberIds` ;
  la mutation E7 le prouve (`TS2554 Expected 4 arguments, but got 3`).
- **Sur les DEUX champs**, note principale et note de part : la fuite mesurée
  vivait dans une note de **part**.
- **Avant les deux compteurs de note** : une note nullée ne gonfle pas le
  dénominateur du flou.
- **Le plancher est assumé et testé** : un id sans souligné (`zoe`) est un mot
  ordinaire — le faire mordre serait « laitue ≠ lait », 12 faux positifs sur 12
  mesurés dans ce dépôt. Ces ids-là sont ignorés, et c'est écrit.

| Épreuve | État |
|---|---|
| **7 tests neufs**, sur la **valeur rendue** (`portionNote`, `preparationShares`) | ✅ dont le **cas qui passe** écrit en premier |
| **Les deux langues** — un slug dans une phrase FR et dans une phrase EN | ✅ les deux tombent (un id n'est jamais traduit : `MEAL_TOKEN_FIELDS`) |
| **7 mutations** | ✅ **7 au rouge sur 7** |
| Suite Deno `_shared/keel/` | ✅ **3164 passés, 0 rouge** (3157 avant — **+7**) |
| `cd frontend && npx tsc -b` | ✅ exit 0 |
| vitest | ✅ **1121 passés**, les **3 rouges étrangers** connus, aucun quatrième |
| `agent-gate` (`AGENT_GATE_STAGED_ONLY=1`, puis au commit) | ✅ **pass** |

Les 7 mutations : la ceinture rend toujours `[]` (**3 ✗**) · la garde retirée des
notes de part (**1 ✗**) · le plancher du souligné retiré (**1 ✗**) · les bornes de
jeton retirées, `includes` nu (**1 ✗**) · `box_ids` non incrémenté (**3 ✗**) · on
compte sans nuller (**3 ✗**) · l'appelant ne passe plus la liste (**TS2554**).
Sauvegarde par copie, restauration vérifiée au SHA256 (`d4af47ddf3dd671e`,
`3e24b801ba0b8791`).

🔴 **Ce compteur lit 0 partout ce soir** — la ceinture est armée et n'a pas mordu
en réel. Dit franchement.

---

## 9. HYGIÈNE

- **Un commit**, `777a0c5c`, **quatre chemins**, tous relus par `git diff` avant
  stage. Aucun hunk étranger dans les quatre.
- **Jamais `git add -A`. Jamais `git stash`** (dépôt partagé, 388 fichiers d'autres
  lanes). **Aucun fichier étranger défait.**
- **Aucun pack i18n commité, aucune clé ajoutée par moi.**
- **Aucune migration.** **Aucune commande à risque.**
- Ajouté `frontend-e` (port **5198**) à `.claude/launch.json`, **non commité**,
  aucun port existant touché ; serveur arrêté à la fin.
- Navigateur : jeton injecté en `localStorage` (`sb-127-auth-token`, patron du
  harnais commité), **aucun formulaire rempli**, mots de passe vérifiés avant de
  viser. Mesures par `document.scrollWidth`, capture à scroll 0.
- **Écritures en base assumées** : `1e653a47`, `124254f5`, et le retrait de
  `45bc8a52` (§7). Les trois sont des gestes du produit, par ses propres portes.

---

## 10. LES REQUÊTES SQL — celles qui tournent

Toutes celles de §10 de 4C restent valables (les trois corrections de 4C sont les
bonnes : `household_members.member_id` et `first_name`, jamais `id` ni
`display_name`). J'y ajoute `box_ids` au tableau de bord et trois requêtes neuves.

```sql
-- LE TABLEAU DE BORD COMPLET, PAR VERSION DE PROMPT (10.5 de 4C + box_ids)
select generated_from->>'prompt_version' as version, count(*) as plans,
       sum((generated_from #>> '{household,boxes,preparations}')::int) as preps,
       sum((generated_from #>> '{household,boxes,with_boxes}')::int)   as with_bx,
       sum((generated_from #>> '{household,boxes,boxes}')::int)        as boxes,
       sum((generated_from #>> '{household,boxes,refused}')::int)      as refused,
       sum((generated_from #>> '{household,boxes,capped}')::int)       as capped,
       sum((generated_from #>> '{household,boxes,mouth_slots}')::int)  as slots,
       sum((generated_from #>> '{household,boxes,mouths_unboxed}')::int) as unbox,
       sum((generated_from #>> '{household,boxes,mouths_double}')::int)  as dbl,
       sum((generated_from #>> '{household,vague_portions,notes}')::int) as notes,
       sum((generated_from #>> '{household,vague_portions,quantified}')::int) as quant,
       sum((generated_from #>> '{household,vague_portions,box_ids}')::int) as box_ids,
       sum((generated_from #>> '{household,shares,shares}')::int) as shares,
       sum((generated_from #>> '{household,shares,unknown}')::int) as sh_unk
from student_generated_meals
where plan_kind='household' and generated_from #> '{household,boxes}' is not null
group by 1 order by 1 desc;
```

```sql
-- NEUVE — C1 : UN PLAT SUR UN JOUR QUI N'EST PAS DANS SA FENÊTRE (§3.1)
-- La requête qui aurait attrapé le glissement de `1e653a47` sans passer par l'écran.
with w as (
  select m.id, m.starts_on, m.duration_days,
         (array['mon','tue','wed','thu','fri','sat','sun'])[
           ((extract(isodow from m.starts_on)::int - 1 + g) % 7) + 1] as jeton
  from student_generated_meals m,
       generate_series(0, greatest(m.duration_days,1) - 1) g
  where m.retired_at is null and m.ends_on >= current_date
)
select left(m.id::text,8) as plan, m.starts_on, m.duration_days,
       d->>'day' as jeton_du_plat, count(*) as plats
from student_generated_meals m, lateral jsonb_array_elements(m.dishes) d
where m.retired_at is null and m.ends_on >= current_date
  and d->>'day' is not null
  and not exists (select 1 from w where w.id = m.id and w.jeton = d->>'day')
group by 1,2,3,4 order by 1;
-- sur 1e653a47 : thu | 2 plats  ← hors fenêtre, invisibles au maître
```

```sql
-- NEUVE — C4 « JAMAIS ZÉRO », côté moteur : un moment qui n'a QUE des plats dédiés
select left(m.id::text,8) as plan, d->>'day' as jour, d->>'slot' as moment,
       count(*) filter (where d->>'member_id' is not null) as dedies,
       count(*) filter (where d->>'member_id' is null)     as tablee
from student_generated_meals m, lateral jsonb_array_elements(m.dishes) d
where m.retired_at is null and m.ends_on >= current_date
group by 1,2,3
having count(*) filter (where d->>'member_id' is not null) > 0
   and count(*) filter (where d->>'member_id' is null) = 0;
```

```sql
-- NEUVE — C3 : « rien à préparer » qui annonce des minutes, tel que L'ÉCRAN l'affiche
select left(m.id::text,8) as plan, d->>'day' as jour, d->>'slot' as moment,
       d->>'title' as plat, d->'same_day'->>'minutes' as minutes
from student_generated_meals m, lateral jsonb_array_elements(m.dishes) d
where m.retired_at is null and m.ends_on >= current_date
  and d->'same_day'->>'kind'='none' and (d->'same_day'->>'minutes')::int > 0;
-- ce soir : 5 lignes sur 2 plans vivants
```

```sql
-- NEUVE — LE SLUG DE BOÎTE DANS UNE NOTE LUE À TABLE (la ceinture du LOT E)
select left(m.id::text,8) as plan, mp->>'display_name' as qui, mp->>'portion_note' as note
from student_generated_meals m, jsonb_array_elements(m.member_portions) mp
where m.plan_kind='household' and mp->>'portion_note' ~ 'box_[a-z0-9_]+'
union all
select left(m.id::text,8), mp->>'display_name', sh->>'note'
from student_generated_meals m, jsonb_array_elements(m.member_portions) mp,
     jsonb_array_elements(coalesce(mp->'preparation_shares','[]')) sh
where m.plan_kind='household' and sh->>'note' ~ 'box_[a-z0-9_]+';
-- ce soir : 0 ligne
```

---

## 11. LE VERDICT, EN UNE PAGE

**Les quatre choses demandées existent.** On les voit à l'écran, sur des données
produites par le modèle, dans les deux langues, à 320 px comme à 1280 px, en
aperçu comme en validé. Le plan se lit jour par jour. Chaque plat dit ce qu'il y
a à faire aujourd'hui. Quand quelqu'un mange autre chose, ça se voit. Et six
boîtes nommées portent six poids différents, pour six personnes qui ne visent pas
la même chose.

**Aucune n'est complète, et deux d'entre elles ne sont pas fiables.** Le modèle
attribue un plat dédié une fois sur deux, chiffre ses portions entre 0 % et 96 %
selon le run, et donne des grammages divergents une composition sur trois. Ce
n'est pas un défaut de câblage — tout le câblage est prouvé, testé, muté. C'est le
modèle qui obéit par intermittence, et **le seul progrès de ce chantier sur ce
point, c'est qu'on le sait maintenant chiffre en main.** Les compteurs sont là
pour que la prochaine rédaction se mesure au lieu de se croire.

**Trois choses cassent l'expérience aujourd'hui, et elles ne sont pas dans le
modèle :** on ne peut pas ouvrir l'aperçu quand la semaine est déjà couverte
(§3.9) ; un plan adopté peut perdre la séparation qu'on venait de valider
(§3.3) ; et le jour d'aujourd'hui peut n'afficher aucun repas tout en portant 90
minutes de cuisine — que la vue semaine, elle, ne montre pas du tout (§3.1).

**Et une chose bloque quelqu'un d'autre que nous** : `i18n/fr.ts` et
`KitchenToday.tsx` ne sont pas dans le dépôt, et du code commité les importe.
Une copie fraîche de cette branche ne construit pas.
