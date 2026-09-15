# ÉTAPE ⑤ — LE PLAN PRODUIT EST-IL BON **POUR TOUT LE MONDE** ?

**Agent 5A · 2026-08-19 · branche `ff-001-quotidien-du-coach`**
**Runs réels : 2026-08-19 03:38 → 04:4x UTC**, lane `generate-household-meal-v1`.
Foyer `qa5a.foyer@keeltest.dev` — 4 bouches, un enfant de 7 ans, un adulte qui
s'entraîne, une végane cœliaque, et quelqu'un qui déjeune dehors trois midis.

> ## ⚠️ LA RÉSERVE, EN TÊTE — ET C'EST LA LIMITE PRINCIPALE DE CE LOT
>
> **Aucun run n'a été servi par le modèle nominal.** Le compte OpenAI est à sec :
> sur **chacun** de mes runs, `gpt-5.4-mini` (`GLOBAL_AI_MODEL`, le modèle de la
> lane foyer) rend `429 credit_balance_exhausted` en moins d'une seconde,
> `gpt-5.4-nano` aussi, et c'est **`gemini-3-flash-preview`** qui a produit
> chaque plan — relevé run par run dans `llm_raw_response_events`
> (`plan-N/model.txt`).
>
> **UN JUGEMENT DE QUALITÉ RENDU SUR LE MODÈLE DE REPLI NE VAUT PAS POUR LE
> MODÈLE NOMINAL.** Tout ce qui suit et qui porte sur *ce que le modèle a
> écrit* — la monotonie, le choix des aliments, les quantités écrites, la prose
> des phrases de table — est un jugement **sur `gemini-3-flash-preview`**.
>
> Ce qui, en revanche, ne dépend pas du fournisseur, parce que c'est du code
> déterministe appliqué **après** le parseur ou **avant** l'appel :
> le **prompt et son plafond de plats** (§0), le **dimensionnement des boîtes**
> (§4.1), le **recollage des grammes dans la phrase de table** (§2.1), la
> **ceinture de régime** (§4.3), la **doctrine filtrée sur l'objectif du
> titulaire** (§1.6) et la **phrase de justification** (§2.2, byte-identique
> 4/4). Ces six-là sont mesurés sur les octets et tiennent quel que soit le
> modèle.

---

## LE FOYER MONTÉ POUR LA MESURE

Fixture : `2026-08-19-0340-5a-fixture-foyer-qualite.sql`. Foyer
`9e90b53d-2ed5-4d25-8682-4cdd5532d07e`, propriétaire
`5a000000-…-001`, coach `1e000000-…-c1` (doctrine publiée, en-GB).
**Indépendant** des foyers de 1V, 03, 06 et 07.

| | **Roxane** | **Ivar** | **Lubna** | **Zoe** |
|---|---|---|---|---|
| rôle | maîtresse, **avec compte** | sans compte | sans compte | sans compte |
| âge | 38 | 40 | 34 | **7 ans (mineure)** |
| corps | 166 / **61 kg** / `on_feet` | 186 / **88 kg** / **`trains_hard`** | 160 / **57 kg** / `sedentary` | 122 / **23 kg** / `on_feet` |
| objectif | `fat_loss` (cible 57 kg, 0,3/sem) | **`muscle_gain`** (aucune cible saisie) | aucun | aucun |
| régime | omnivore | omnivore | **végane** | omnivore |
| sécurité | — | — | **allergie gluten, médicale** | dégoût : champignon |
| présence | à table | **dehors mer/jeu/ven midi** | à table | à table |

Cuisine déclarée : **stovetop, micro-ondes, mixeur — NI FOUR NI CONGÉLATEUR.**
Budget 95, `variety: varied`, `recipe_difficulty: simple`, 2 jours de cuisine
× 50 min = 100 min/sem (> le seuil de 90 : le temps ne plafonne pas tout seul).

Divergence **calculée**, archivée dans les 4 plans
(`cooking.diverging`) : **Roxane** (fat_loss ⇒ `vegetables:larger` au-dessus du
plafond de la table) et **Ivar** (muscle_gain ⇒ `protein:larger` au-dessus du
plafond d'une casserole descendue au végane). Lubna porte le régime le plus
strict — la casserole commune **est** son plat. Zoe suit `CHILD_DIRECTION`.

**Fenêtre : 2 jours (mer 19 + jeu 20), déjeuner et dîner.** Choix de poste, pas
de cas : voir §6.

**Quatre runs sur des entrées BYTE-IDENTIQUES.** `sha256` des prompts
réellement envoyés, sur les quatre : `ce2352d337eebfa0…` (système) et
`e234dced31305dc7…` (utilisateur). Tout écart entre les plans vient donc du
modèle, jamais de l'entrée.

---

# §0 — CE QUE LE PROMPT DEMANDE, ET QU'IL SE CONTREDIT DANS LE MÊME MESSAGE

Deux passages du **même** message utilisateur (`plan-1/dump/prompt-user.txt`) :

```
l. 116 : how much: several_days (at most 8 dishes)
l. 249 : That is 6 extra dishes on top of the table's
         meals, and the dish budget above already has room for them.
         Count them before you answer: a window where these people have
         no dish of their own is a window where they do not eat.
```

Les repas de la table valent **4** (2 jours × 2 créneaux). 4 + 6 = **10**.
Le budget en ouvre **8**. « the dish budget above already has room for them »
est **faux**, et la phrase qui suit nomme elle-même le prix : *a window where
these people have no dish of their own is a window where they do not eat.*

C'est l'arithmétique de `mergeDishBonus` (`household_portions.ts:936-971`),
plafonnée par `baseCap` : budget ≤ 2 × baseCap, demande = (1 + N) × baseCap.
À N = 2 divergents, il manque **un tiers du budget**, à toute taille de fenêtre.
C'est le défaut D.1 de l'étape ③, reproduit ici sur un autre foyer, un autre N
et une autre fenêtre.

**Ce qui se mesure derrière, sur mes quatre runs :**

| | plats propres **demandés** | plats propres **livrés** |
|---|---|---|
| **Roxane** (maîtresse, 1ʳᵉ du roster) | 4 + 4 + 4 + 4 = **16** | 3 + 4 + 4 + 4 = **15** |
| **Ivar** (2ᵉ du roster, celui qui s'entraîne) | 2 + 2 + 2 + 2 = **8** | 1 + 0 + 0 + 0 = **1** |

`dish_owners = {"asked": 6, "declared": 4, "attributed": 4}` — **le même
triplet sur les quatre runs.** Et sur trois runs (2, 3, 4) les `issues` nomment
le geste :

```
dishes[8]: over the 8-dish cap for several_days -- kept, and the surplus dish
           "<le plat d'Ivar>" (wed/dinner) was dropped instead
dishes[9]: over the 8-dish cap for several_days, dropped
```

⇒ **Ce n'est pas un tirage : c'est de l'arithmétique de plafond, et la même
bouche paie à chaque fois.**

---

# §1 — LE DIÉTÉTICIEN

## 1.1 · ⛔ La protéine est concentrée, et elle manque à celui qui s'entraîne

Estimation plancher (`proteine.py`, table déclarée, termes non appariés
imprimés et comptés zéro — ce n'est **pas** une sortie du produit) :

| bouche | plan-1 | plan-2 | plan-3 | plan-4 |
|---|---|---|---|---|
| Roxane 61 kg | 60 g / 2 j | 73 | 110 | 96 |
| Zoe 23 kg | 39 | 53 | 71 | 78 |
| Lubna 57 kg végane | 39 | 59 | 80 | 78 |
| **Ivar 88 kg, `trains_hard`, `muscle_gain`** | **40** | **16** | 75 | **19** |

Ivar mange **deux fois** à la maison sur la fenêtre (il déjeune dehors). Le
détail par repas, et non la moyenne :

| | mer/dîner | jeu/dîner |
|---|---|---|
| plan-1 | 31 g | 10 g |
| plan-2 | **8 g** | **8 g** |
| plan-3 | 38 g | 38 g |
| plan-4 | **9 g** | **9 g** |

Deux runs sur quatre lui servent **moins de 10 g de protéine par repas** —
pendant que **750 à 900 g de cuisses de poulet** sont achetées, cuites, et
pesées **à son nom** dans des boîtes dont le plafond a jeté les plats (§0, §2.1).

**Rapporté au besoin, le plan sur-sert l'enfant et sous-sert l'athlète.** Zoe
(23 kg, besoin ≈ 20 g/j) reçoit 20 à 39 g/jour sur deux repas ; Ivar (88 kg en
prise de muscle, besoin ≈ 140 g/j) reçoit 8 à 38 g/jour à la maison.

## 1.2 · ⛔ La variance sur entrées identiques est de facteur 2 à 4,7

Mêmes octets, quatre plans : Roxane 60 → 110 g (×1,8), **Ivar 16 → 75 g
(×4,7)**. Aucun compteur ne mesure cet écart, aucune borne ne le contient.
Pour un diététicien, cela veut dire que **le contenu nutritionnel du plan n'est
pas une propriété du foyer, c'est un tirage.**

## 1.3 · ⛔ La monotonie est totale, sur un foyer qui a demandé `varied`

Nombre de **combinaisons de préparations distinctes** par bouche sur les
4 repas de la fenêtre :

| | plan-1 | plan-2 | plan-3 | plan-4 |
|---|---|---|---|---|
| Roxane | 2 | **1** | **1** | **1** |
| Zoe | **1** | **1** | **1** | **1** |
| Lubna | **1** | **1** | **1** | **1** |
| Ivar | 2 | **1** | **1** | **1** |

⚠️ **L'intitulé ment sur la monotonie** : plan-1 sert à Zoe « dahl aux
épinards », « dahl à la coriandre », « dahl aux tomates », « dahl aux graines de
tournesol » — **quatre titres, une casserole, une garniture de 50 g qui
change**. Un compteur d'intitulés distincts rendrait 4/4 et raterait tout ;
c'est pour ça que ce lot compte les **préparations**.

Et la répétition ne s'arrête pas au run : sur les quatre plans, le squelette est
**toujours le même** — un dahl de lentilles corail (végane, sans gluten) + des
cuisses de poulet poêlées + un féculent. Le foyer recevrait la même semaine
chaque semaine.

## 1.4 · ⚠️ Les légumes n'existent qu'en garniture pour la moitié de la table

La doctrine du coach dit « **one loud vegetable on every plate**, and it is the
first thing in the basket », et les plats la revendiquent
(`honours_belief_keys: ["one_loud_vegetable"]`). Dans les faits :

- **plan-1, plan-2, plan-3** : Roxane et Ivar ont une préparation de légumes ;
  Zoe et Lubna ont la patate douce **fondue dans** le dahl plus une garniture
  décorative (50 g d'épinards, 60 g de tomates cerises, une pincée de
  coriandre).
- **plan-4** : le seul run où les quatre bouches ont une vraie préparation de
  légumes (`Sautéed Rainbow Vegetables`).

## 1.5 · ⚠️ Le plan ne sait pas qui s'entraîne — et il ne peut pas le savoir

Trois faits mesurés, tous vérifiables sur le prompt archivé :

1. **`activity_level` n'apparaît nulle part dans le prompt.** Le seul indice que
   le modèle possède est la ligne d'habitude qu'un humain a tapée
   (« lifts on Wednesday and Saturday evenings »).
2. **Aucun fait corporel pour les bouches sans compte.** Seule Roxane porte
   `[height 166 cm; age band 30 to 44; gender female]` ; Ivar, Lubna et Zoe
   n'ont **rien**. La porte est `householdBodyFacts` (`meal_body.ts:304-310`) :
   `if (!body) return []` pour une bouche sans compte, `ageState !== "adult"`
   pour un mineur. C'est la **même forme** que le défaut moteur corrigé cette
   nuit (`memberTargetFactor` fermait sur le corps du compte) — corrigé côté
   moteur, toujours là côté prompt.
3. **`box_sizing.mouths` rend `{minor: 1, sized: 1, no_pace: 1, no_direction: 1}`
   sur les quatre runs** : une seule bouche sur quatre est dimensionnée sur une
   **direction**. Ivar sort `no_pace` — il a déclaré `muscle_gain`, mais
   personne n'a jamais appelé `keel_household_set_member_target` pour lui, donc
   `memberTargetFactor` (`household_portions.ts:1804-1839`) refuse la direction
   et le dimensionne sur son seul **entretien**.
   ⇒ **Dire « je prends du muscle » ne change strictement rien à la taille de
   l'assiette** tant qu'un poids visé et une allure n'ont pas été saisis pour
   cette bouche-là. (Delta mesuré : §E.)

## 1.6 · ⚠️ La croyance du coach écrite POUR le membre qui s'entraîne est filtrée

La doctrine publiée porte **trois** croyances. La troisième —
`starch_follows_the_session` : « On a muscle gain stretch the starch goes where
the training is », `goal_scope: ["muscle_gain"]` — **n'est pas dans le prompt** :

```
== THE CONVICTION KEYS YOU MAY NAME ==
["name_the_plate_out_loud","one_loud_vegetable"]
```

`loadPublishedDoctrine(admin, userId)` (`doctrine_loader.ts:302-320`) lit
`student_goals.goal` **du titulaire du compte** — `fat_loss` — et filtre par
cette portée. Dans un foyer, la doctrine est donc compilée pour **une seule**
bouche. La ligne que le coach a écrite exprès pour la prise de muscle
n'atteindra jamais le plan d'un foyer où quelqu'un prend du muscle, sauf si
c'est le titulaire du compte.

## 1.7 · ⚠️ Ce que la casserole produit n'est pas vérifié contre ce qu'on en tire

`plan-1` : la demande réelle de dahl est **10 parts** (recomptée sur les boîtes
citées, absences déduites) ; `servings_made` vaut **8**. Deux personnes n'ont
rien jeudi soir. Le moteur vérifie que la **somme des boîtes** ne dépasse pas ce
que la casserole produit (`sum_checked`, `sum_over: 0`) ; il ne vérifie pas
combien de fois chaque boîte est **reprise** par un plat.

Et sur 2 runs, la vérification est **désarmée** de toute façon :
`sum_unverifiable: 2` — la production n'est pas reconstructible parce que
`grams_raw` est `null` sur la ligne la plus lourde du plan. Cause exacte :
`readStructuredQuantity` (`meal_generation.ts:3336-3365`) ne remplit `gramsRaw`
que si le **terme** se résout dans le référentiel de composition.
« boneless chicken thighs » s'y résout ; « **chicken thighs, boneless/skinless** »
non. Résultat, plan-2 : une ligne qui porte `"quantity": "750 g"` sort avec
`grams_raw: null`, et **750 g de poulet sont invisibles** à tout ce qui lit ce
champ.

---

# §2 — L'UTILISATEUR LAMBDA

## 2.1 · ⛔ La phrase lue à table promet des plats que le plan ne sert pas

C'est le défaut le plus grave que ce lot mesure, et il est **structurel**.

| run | bouche | ce que la phrase promet | ce que le plan sert |
|---|---|---|---|
| plan-2 | **Ivar** | `Pan-Seared Thyme Chicken Thighs 174 g` | le dahl végane de la table |
| plan-3 | **Zoe** | `Pan-Seared Chicken and Peppers 138 g` | le dahl végane de la table |
| plan-3 | **Ivar** | `Pan-Seared Chicken and Peppers 290 g` | le dahl végane de la table |
| plan-3 | Roxane | `Sweet Potato and Red Lentil Dahl 236 g` | son poulet à elle, 4 fois |
| plan-4 | **Ivar** | `Pan-Fried Thyme Chicken Strips 145 g` | la casserole végane |

**Trois runs sur quatre, cinq bouches-instances.** Le mécanisme est
déterministe et se lit en douze lignes :

> `attachSizedQuantities` (`household_portions.ts:3877-3918`) parcourt **toutes
> les préparations** et recolle un gramme pour **toute boîte portant le nom de
> la bouche**. Elle ne consulte **jamais** `dishes[]`.

Une boîte vit sur la **préparation** ; un plat jeté par le plafond emporte le
plat, pas la boîte. Donc : le plafond jette le plat d'Ivar → sa boîte de poulet
reste → sa phrase de table nomme 290 g de poulet → et le plan lui sert du dahl.

⚠️ C'est le **jumeau** de la brèche D.2 de l'étape ③ (l'enfant végane qui
recevait du bœuf dans sa phrase). Là, le gramme suivait une boîte **fausse** ;
ici, il suit une boîte **juste dont le plat a été supprimé**. La ceinture de
régime livrée cette nuit ferme le premier cas et **ne peut rien** au second :
elle regarde le régime, pas l'existence du plat.

## 2.2 · ⛔ La contrainte médicale de Lubna est annoncée à table

**Quatre runs sur quatre**, le régime ou la contrainte médicale sortent en clair
sur une surface lue par un humain. `dishes[].why` est rendu
(`frontend/src/keel/components/DishCard.tsx:211`), `portion_note` aussi
(`MyShareCard.tsx:201`, `PlanByPerson.tsx:402`).

```
plan-1  portion_note[Lubna] … ensuring no cross-contamination with NON-VEGAN items.
plan-1  dishes[].why        A NON-VEGAN plate for Roxane … separate from the shared VEGAN pot.
plan-2  portion_note[Lubna] … safe from THE FOODS ON YOUR MEDICAL LIST.
plan-2  dishes[].why        … avoids the shared VEGAN pot as requested.
plan-3  dishes[].why        … naturally free from ONE OF THE FOODS ON YOUR MEDICAL LIST.
plan-3  portion_note[Lubna] … ensuring no CROSS-CONTAMINATION with other preparations.
plan-4  dishes[].why        A high-protein, GLUTEN-FREE meal … for Roxane's midday energy needs.
plan-4  dishes[].why        … that avoids GLUTEN … / … entirely GLUTEN-FREE.
```

⚠️ **En plan-2 ET en plan-3, le modèle recopie l'échappatoire du prompt
elle-même** — « one of the foods on your medical list » — dans un champ lu par
tout le foyer. Le prompt la lui donne pour *ne pas nommer l'allergène* ; il
n'est écrit nulle part qu'elle ne doit pas non plus finir sur la table.

Le prompt interdit pourtant exactement ça, dans le bloc des consignes de
service : « NEVER state a reason, a goal, a calorie count or anything about a
person's body in these instructions. **They are read aloud at the table by the
whole household.** »

La ceinture médicale n'a pas mordu — elle cherche le **nom** de l'aliment, et il
n'y est pas. Le produit sort donc un plan parfaitement valide qui annonce la
maladie cœliaque d'une adulte au dîner, devant l'enfant.

Et le plan lui-même l'écrit, **à l'identique sur les quatre runs**, dans sa
propre justification :

> « The shared dish is vegan: that is what **Lubna** eats. »

⚠️ **Et une garantie écrite dans le front n'est pas tenue.**
`frontend/src/keel/components/plan/PlanByPerson.tsx:33-35` affirme :

> « `portion_note` est une INSTRUCTION DE SERVICE, **garantie sans motif** ni
> vocabulaire de corps par `sanitizePortionNote` côté serveur — c'est
> précisément ce qui permet de l'afficher devant toute la table. »

Or `sanitizePortionNote` (`household_portions.ts:3374-3385`) ne connaît que
`FORBIDDEN_PORTION_TERMS` — un vocabulaire de **CORPS** (poids, calories,
taille, âge, `regime`/`objectif`/`goal`). Ni `vegan`, ni `medical`, ni
`allergy`, ni `recovery` n'y figurent. La ceinture fait exactement ce que sa
propre documentation dit ; c'est **le commentaire du front qui promet plus
large** que ce qui est armé, et c'est cette promesse-là qui est fausse devant
la table. Trois motifs sont passés sur quatre runs.

## 2.3 · ⛔ Un mot de taille est passé, et le compteur dit zéro

`plan-2`, `member_portions[Ivar]` :

> « Serve the chicken and rice first; on Wednesday evening, take an **extra
> portion** of rice from the pot if needed **for recovery**. »

`portion_quantities.model_size_word` = **0**. Ce n'est pas un bug de matcher :
`SIZE_WORD_TERMS` (`household_portions.ts:3158-3232`) est une liste fermée qui
**écrit elle-même** qu'elle est un plancher (« une comparaison sans aucun de ces
mots lui échappe »). C'est ce plancher, franchi sur un run réel. Formes qui
manquent, mesurées ici : `extra portion` (note gardée) et `double portion`
(titre du plat jeté du même run).

Et la phrase fait deux choses de plus que le prompt interdit : elle **envoie
chercher au pot**, ce qui défait la raison d'être des boîtes (« nobody weighs
anything at mealtime »), et elle **donne une raison** (« for recovery »).

## 2.4 · ⚠️ « 200 g » — de quoi, et combien de fois ?

La phrase de table est `<prose du modèle> — <titre> <grammes> g`. Rien n'y dit
si le nombre est **une part** ou **la totalité de la fenêtre**. Zoe, plan-1 :
« Red Lentil and Sweet Potato Dahl 200 g » — et elle mange ce dahl **quatre
fois**. En plan-2 le modèle a écrit trois boîtes de 172 g pour elle et la phrase
n'en cite qu'**une** (`attachSizedQuantities` fait `break` après la première
boîte d'une préparation). Dans les deux sens, le lecteur ne peut pas savoir.

✅ En revanche, aucun identifiant de boîte ne fuit dans les phrases
(`vague_portions.box_ids: 0`, 4 runs sur 4) : la question « *Boîte Zoé — 520 g*
a-t-il un sens ? » ne se pose pas, parce que le produit ne montre jamais l'id.

## 2.5 · ⚠️ Est-ce cuisinable en 50 minutes ?

| run | session annoncée | Σ `total_minutes` des préparations | Σ `active_minutes` | préparations |
|---|---|---|---|---|
| plan-1 | 50 min | 90 | 35 | 4 |
| plan-2 | 45 min | 85 | 25 | 3 |
| plan-3 | 50 min | 85 | 35 | 3 |
| plan-4 | 50 min | 95 | 40 | 4 |

La promesse de 50 minutes n'est tenable qu'en menant **trois à quatre feux en
parallèle** — les `run_through` le disent (« use the **second** hob ring », « use
the remaining hob space »). Or la situation écrite par le foyer est **« one
small hob »**, et `kitchen_equipment` ne collecte qu'un booléen `stovetop` :
**rien dans la chaîne ne sait combien de feux existent**, donc rien ne peut
vérifier la promesse.

## 2.6 · ⚠️ Les courses

| run | lignes | non rattachées à un plat | pièces à la fenêtre de 2 jours |
|---|---|---|---|
| plan-1 | 12 | 1/12 | — |
| plan-2 | 17 | **7/17** | 1 kg de riz, 250 ml d'huile, 2 pots d'épices |
| plan-3 | 12 | **6/12** | 1 kg de riz, 2 pots d'épices |
| plan-4 | 13 | 1/13 | 600 g de quinoa, 3 pots d'épices |

`shopping_list_unattributed` est **compté et rendu** — l'instrument est honnête.
Mais côté acheteur : sur deux runs, **la moitié du panier ne correspond à aucun
plat du plan**, et le budget annoncé est « The shopping budget is 95. » — **sans
devise**, alors que le prompt dit « in the local currency of their country ».

## 2.7 · ✅ Ce qui marche, et il faut le dire

- **La cuisine pauvre est respectée.** Ni four ni congélateur déclarés ⇒ le bloc
  `== THIS KITCHEN ==` est bien dans le prompt de la lane foyer
  (`household_meal_generation.ts:1213`), et **0 occurrence** de
  `oven / roast / bake / grill / freeze` en cuisson sur les quatre plans. La
  seule occurrence du mot est une **négation** (plan-3 : « … without using an
  oven »), qui n'est pas une violation mais un commentaire inutile.
  ⚠️ Scorie de documentation : `kitchen_equipment.ts:26-28` affirme encore que
  la ligne « n'est PAS branchée sur la lane foyer ». C'est vrai de
  `kitchenEquipmentPromptLines` (la fonction solo) et **faux** du bloc foyer.
- **Le dégoût de l'enfant est tenu** : `mushroom`, **0 occurrence**, 4/4.
- **L'allergie médicale est tenue en ALIMENT** : ni gluten, ni blé, ni pain, ni
  pâtes, ni couscous, ni orge — **0 occurrence** sur les quatre plans, et la
  casserole commune est réellement sans gluten (lentilles, riz, quinoa, patate
  douce).
  ⚠️ **Mais le MOT sort trois fois en clair, en plan-4**, dans `dishes[].why` :
  « A high-protein, **gluten-free** meal designed specifically for Roxane's
  midday energy needs », « … that **avoids gluten** … », « … entirely
  **gluten-free** ». Le prompt menace pourtant, en majuscules : « A
  severity=medical name written in a dish — its title, its method, its `why`,
  its ingredients — … **empties the WHOLE week** ». **Le plan est sorti en 200.**
  Le verrou tolère la mention niée — même comportement que
  `sesame-free` mesuré par l'étape ③, et c'est le bon comportement. Il faut
  seulement le dire dans les deux sens : la menace écrite au modèle est fausse
  pour cette forme-là, et le nom de la maladie du foyer se retrouve **en clair
  sur une quatrième surface lue par tout le monde**.
- **Aucune calorie, aucun macro, aucun chiffre de corps**, sur aucune surface
  lue par un humain, 4/4.
- **Aucun mot de taille dans les phrases**, 4 runs sur 4 sauf le cas §2.3.
- **Les deux lignes rouges du coach sont tenues.** `plain_salad_dinners` :
  aucun dîner froid sur les quatre plans (la seule salade est un **déjeuner**,
  plan-2). `weekend_batch_marathon` : **une** session de 45-50 min le mercredi,
  4/4 — jamais un dimanche de huit heures.

---

# §3 — CE QUI N'EXISTE QU'AU FOYER

## 3.1 · ✅ « Manger dehors » est le point le mieux traité du lot

Le prompt porte deux blocs distincts et cohérents :

```
WHO IS NOT AT THE TABLE …
- Wednesday, lunch: Ivar not eating here -- cook for 3 instead of 4.
- Thursday,  lunch: Ivar not eating here -- cook for 3 instead of 4.

== A MEAL EATEN OUT IS NOT AN ABSENCE ==
- Ivar: Wednesday lunch, Thursday lunch
Compose NOTHING there: no dish, no preparation, no line of shopping.
… do NOT make another meal bigger to make up for it, do NOT move that meal
to another day, and do NOT mention it.
```

**Obéi 4 runs sur 4** : aucun plat, aucune ligne de courses, aucune mention,
aucune compensation. `eating_out: {cells: 2, mouths: 1}` archivé.
**Réponse à la question « le plan tient-il si une personne mange dehors trois
midis ? » : oui, structurellement.**

⚠️ La contrepartie est assumée et écrite dans le code : une bouche **sans
compte** ne reçoit **rien** pour ces midis — `eatingOutAdvice`
(`household_portions.ts:2708-2760`) refuse en `other_mouth`, « lui adresser un
chiffre serait un tracker qu'elle ne peut pas éteindre ». Ivar, qui déjeune
dehors trois fois par semaine, est simplement absent du produit à ces
moments-là.

⚠️ Et la phrase de justification, **identique sur les 4 runs**, dit
« **Quantities are made for 4 people.** » alors que le prompt a demandé de
cuisiner pour 3 à deux repas sur quatre.

## 3.2 · ⛔ La divergence n'est ni lisible ni digne

- **Elle est visible** : deux assiettes portent du poulet et du riz, deux
  portent des lentilles, aux mêmes repas.
- **Elle n'est jamais expliquée** à ceux qui la subissent : rien, dans aucune
  phrase, ne dit à Zoe pourquoi son assiette n'a pas de poulet.
- **La seule explication écrite est celle qui sort le dossier médical de
  Lubna** (§2.2), sur la surface la plus lue du plan.

## 3.3 · ✅/⛔ L'enfant : le silence tient, l'assiette pas toujours

**Le silence sur le corps tient parfaitement** : `householdBodyFacts` ne donne
aucun fait corporel pour un mineur, aucune surface du plan ne porte un chiffre
de corps, aucun mot de taille n'est adressé à Zoe. **4 runs sur 4.**

**L'assiette d'enfant, elle, tient une fois sur deux** — voir §D.1.

---

# §4 — LES TROIS CORRECTIFS DE LA NUIT, JUGÉS EN L'ÉTAT

## 4.1 · La part dimensionnée par le corps — **le moteur tient, la porte de sortie est ouverte**

✅ **Le facteur est stable, reproductible, et c'est bien le moteur.** Relevé sur
**onze préparations** de quatre plans différents, en prenant Roxane pour
référence (les petits écarts sont l'arrondi à l'entier des grammes) :

```
plan-1 prep_chicken   Roxane=59 (1,000)  Ivar=109 (1,847)
plan-1 prep_rice      Roxane=118(1,000)  Ivar=218 (1,847)
plan-2 prep_rice      Roxane=118(1,000)  Ivar=218 (1,847)  Zoe=103(0,873)  Lubna=115(0,975)
plan-3 prep_dahl      Roxane=236(1,000)  Ivar=435 (1,843)  Zoe=206(0,873)  Lubna=231(0,979)
plan-3 prep_rice      Roxane=142(1,000)  Ivar=261 (1,838)  Zoe=124(0,873)  Lubna=138(0,972)
plan-4 prep_quinoa    Roxane=102(1,000)  Ivar=189 (1,853)
```

⇒ **Roxane 1,000 · Ivar ≈ 1,847 · Lubna ≈ 0,975 · Zoe ≈ 0,875.**
`box_sizing.share.sized = 4` sur les quatre runs : le corps des **quatre**
bouches est lu, comptes ou pas. **Aucune régression.**

⚠️ **Ce que le nombre dit, et qu'il faut poser devant un humain** : une enfant
de **7 ans et 23 kg** reçoit **87,5 % de l'assiette d'une femme de 38 ans et
61 kg**, et **47 % de celle d'un homme de 88 kg**. Le mécanisme est explicite et
assumé (`household_portions.ts:2213-2226` : la référence est **la maintenance
moyenne de la table**, pas un adulte de référence). Je le nomme, je ne le change
pas — c'est un arbitrage, pas un bug.

⛔ **Mais il suffit que le modèle mette deux bouches dans une seule boîte pour
que tout le correctif soit contourné**, et il le fait **2 runs sur 4** :

| run | boîte partagée | grammes | bouches |
|---|---|---|---|
| plan-1 | `box_dahl_standard` | 200 g | **Zoe, Lubna, Roxane, Ivar** |
| plan-4 | `box_lentils_shared` | 150 g | **Zoe, Lubna** |
| plan-4 | `box_quinoa_shared` | 130 g | **Zoe, Lubna** |
| plan-4 | `box_veg_shared` | 100 g | **Zoe, Lubna** |

`sizeBoxesFromTarget` (`household_portions.ts:2470-2486`) **refuse de couper une
boîte en deux** — le choix est écrit et argumenté (« fabriquer un second
identifiant laisserait `dishes[].uses[].box_id` pointer sur une boîte qui n'a
plus le bon contenu ») — et laisse les grammes du modèle, en comptant
`shared_mixed`.

**Le coût, par bouche :** sur plan-1 et plan-4, **100 % de ce que Zoe mange
sort d'une boîte non dimensionnée.** En plan-4, l'enfant de 23 kg reçoit
**130 g de quinoa** quand l'adulte de 61 kg, dont la boîte a été dimensionnée,
en reçoit **102 g**.

⚠️ **Et le compteur ne dit pas ça.** `shared_mixed` compte des **boîtes**
(1 sur 7, puis 3 sur 9) — jamais des **bouches**. « 3 sur 9 » se lit comme un
tiers ; la vérité est « deux bouches sur quatre, sur la totalité de ce qu'elles
mangent ».

## 4.2 · La contrainte dure attachée à sa bouche — **✅ tient, 4 runs sur 4**

```
=== THE HARD CONSTRAINTS OF THE MOUTHS AT THIS TABLE ===
- Lubna: gluten — allergy, severity=medical (declared by student)
```

Suivi du bloc qui dit que le nom **ne restreint pas** la portée
(`ONE MOUTH'S HARD CONSTRAINT GOVERNS EVERYTHING`). Résultat : **0 occurrence**
de gluten, blé, pain ou pâtes sur les quatre plans, et la casserole commune est
réellement sans gluten. **Aucune régression.**

## 4.3 · La ceinture de régime — **✅ armée, aucune régression, dénominateur faible**

`regime_belt` sur les quatre runs :

| run | `mouths` | `checked` | `kept` | `refused` | `silenced` |
|---|---|---|---|---|---|
| plan-1 | 1 | 1 | 1 | **0** | 2 |
| plan-2 | 1 | 6 | 6 | **0** | 6 |
| plan-3 | 1 | 2 | 2 | **0** | 2 |
| plan-4 | 1 | 3 | 3 | **0** | 3 |

`mouths > 0` et `checked > 0` sur les quatre : **la ceinture est branchée et
lit vraiment quelque chose** — c'est très exactement le zéro ambigu que le lot
07 a supprimé. `refused: 0` partout parce que **le modèle n'a mis Lubna dans
aucune boîte carnée** ; le seul `mouths_unboxed` qui la concerne est celui de la
préparation de poulet, c'est-à-dire le comportement voulu.

⚠️ **Ce que ça ne prouve pas** : la ceinture n'a jamais eu à mordre sur mes
runs. Elle est *armée* et *non régressée* ; qu'elle *morde* correctement reste
la mesure du lot 07, pas la mienne.

## 4.4 · ⚠️ Le produit SAIT tout ça, et il ne le dit qu'à lui-même

**39 `issues` sur quatre runs** (9 · 15 · 4 · 11), et aucune n'atteint le foyer.
Elles nomment exactement les défauts de ce rapport, avec les identifiants :

```
preparations[prep_lentils].boxes[box_lentils_shared]: shared by mouths whose
    targets differ, grams left as written
dishes[8]: over the 8-dish cap … the surplus dish "<le plat d'Ivar>" was dropped
preparations[1]: "<id de Zoe>" has no box on "Pan-Seared Lemon Chicken"
shopping_list_unattributed: 7/17 lines match no kept and no dropped ingredient
```

L'instrumentation de cette lane est, honnêtement, **excellente** : elle compte
en trois nombres, elle nomme la bouche par id, elle distingue « jamais déclaré »
de « déclaré puis refusé ». Ce qui manque n'est pas la mesure, c'est **la
conséquence** : un plan dont deux bouches sur quatre mangent une part non
dimensionnée, et dont un divergent n'a aucun plat, sort en `200 ok: true`
exactement comme un plan sans défaut.

---

# §5 — SYSTÉMATIQUE **ou** TIRAGE : la séparation

## Systématique — vu sur **tous** les runs, ou expliqué par du code déterministe

| | preuve |
|---|---|
| ⛔ **Le budget de plats promet 10 et en ouvre 8** | arithmétique (`mergeDishBonus` bornée par `baseCap`), contradiction **dans le même prompt**, 4/4 |
| ⛔ **Une seule bouche prend les plats propres, et c'est la 1ʳᵉ du roster** | `dish_owners {6,4,4}` **4/4** ; Roxane 15/16, Ivar **1/8** |
| ⛔ **La phrase de table peut promettre un plat que le plan ne sert pas** | `attachSizedQuantities` ne consulte jamais `dishes[]` — code, pas tirage. Réalisé **3 runs / 4**, 5 bouches-instances |
| ⛔ **La monotonie** | 1 seule combinaison de préparations par bouche sur **14 des 16** (run × bouche), foyer en `varied` |
| ⛔ **Le régime / la contrainte médicale sortent en clair devant la table** | **4/4** sur `dishes[].why` et/ou `portion_note` ; plus la ligne **byte-identique** 4/4 de la justification : « The shared dish is vegan: that is what Lubna eats. » |
| ⛔ **`muscle_gain` sans cible saisie ne change rien à la part** | `box_sizing.mouths.no_pace: 1` **4/4** ; `memberTargetFactor` refuse la direction |
| ⛔ **La croyance de doctrine `muscle_gain` n'atteint jamais le prompt** | doctrine compilée sur `student_goals.goal` du **titulaire** — 2 clés sur 3, 4/4 |
| ⛔ **La session de 50 min suppose 3–4 feux** | Σ `total_minutes` = 85–95 min, 4/4 ; `stovetop` est un booléen |
| ✅ **« Manger dehors » : rien composé, rien compensé, rien mentionné** | 4/4 |
| ✅ **Allergie médicale, dégoût, zéro calorie, zéro chiffre de corps** | 4/4 |
| ✅ **Le facteur de part est le même à 3 décimales** | Ivar/Roxane 1,847 / 1,847 / 1,843 / 1,835 — et **1,841** sur le plan `one_dish` corroborant (§E). Zoe/Roxane **0,873** partout. |

## Tirage — vu sur certains runs seulement

| | où |
|---|---|
| **Boîte partagée non dimensionnée** (l'enfant reçoit l'assiette d'un adulte) | plan-1 et plan-4 ; absent de plan-2 et plan-3 → **2/4** |
| **Un mot de taille dans une phrase de table** (`extra portion`) | plan-2 seul → **1/4** |
| **Le modèle écrit une boîte par repas** (`mouths_double: 8`) | plan-2 seul |
| **Un déjeuner entièrement non pesé** (salades froides sans boîte) | plan-2 seul |
| **La moitié du panier non rattachée** | plan-2 (7/17) et plan-3 (6/12) ; 1/12 et 1/13 ailleurs |
| **Le mot « oven » écrit (en négation)** | plan-3 seul |
| **La quantité de protéine par repas** | 8 g à 38 g pour la même bouche, mêmes octets |

---

# §E — LES DEUX SCÉNARIOS EN PLUS (lancés à 04:13 UTC)

Deux scénarios ont été enchaînés derrière les quatre replicats
(`suite.sh`, journal `suite.log`) :

① **`cooking_shape: one_dish`, 2 runs** — le mode « une seule casserole », où
tout le monde mange le plat végane et sans gluten de Lubna, y compris l'homme
de 88 kg en prise de muscle. C'est le mode où la question « bon pour tout le
monde ? » se pose le plus crûment.

② **Le delta de cible d'Ivar** (`2026-08-19-0400-5a-delta-cible-ivar.sql`,
`keel_household_set_member_target(Ivar, 92, 0,25)`), puis 2 runs. Un seul octet
de la fixture bouge — assez pour faire passer Ivar de `no_pace` à `sized` dans
`box_sizing.mouths`, si l'hypothèse de §1.5 est juste.

**État à la clôture : ① a produit UN plan, ② n'a JAMAIS été lancé, et j'ai
arrêté la suite volontairement.**

`onedish-1` a rendu `546 WORKER_LIMIT` à sa première tentative
(`onedish-1/FAILED-546.json` ; son `plan-payload.json` a été **supprimé** pour
la même raison que celui de `plan-5` — il portait le plan de `plan-4`). J'ai
arrêté le client pendant la relance, à 04:21:20, pour geler la fixture —
**et le serveur, lui, a fini** : `success` à 04:21:30, plan
`adbdb2f1-…` écrit à 04:21:30.919891+00. Même motif qu'à l'étape ③ (« un run
abandonné a quand même écrit son plan »).

Je l'ai donc capturé **après coup** — prompt vidé depuis
`llm_raw_response_events`, plan relu en base — et je le compte comme une
**CORROBORATION, pas comme une cinquième mesure** : `http-response.json`
manque, donc les `issues` de ce run n'existent nulle part, et je ne les invente
pas. `onedish-1/CRITIQUE.md` dit exactement ce qui manque.

### Ce que `one_dish` corrobore, et ce qu'il ajoute

✅ **Le facteur de part, cinquième relevé, identique à trois décimales** :
Roxane 252 g · Zoe 220 g · Lubna 246 g · Ivar 464 g ⇒ **1,000 · 0,873 · 0,976 ·
1,841**. `sized: 11/11`, `shared_mixed: 0`.

✅ **Le défaut n°1 de ce rapport DISPARAÎT en `one_dish`** :
`dish_owners {asked: 0, declared: 0, attributed: 0}`. Le mode ne promet aucun
plat propre, donc le plafond n'en jette aucun, donc **aucune phrase de table ne
promet un plat inexistant**. C'est la preuve par l'absence que le défaut vient
de la **contradiction du prompt en mode ②**, et non du modèle.

⛔ **Le prix tombe sur la même bouche.** L'homme de 88 kg en prise de muscle
mange **464 g de dahl de lentilles, deux fois, et rien d'autre** (il déjeune
dehors les deux midis, donc il rate le quinoa) — ≈ 29 g de protéine par repas.
Et sa phrase de table nomme trois composants pour une assiette qui n'en a
qu'un : « Serve the **protein and starch** first on the plate, then the
**vegetables**. — Velvety Sweet Potato & Lentil Dahl 464 g ».

⛔ **Le régime sort encore sur une surface lue** : `dishes[].why` = « … meets
the **vegan and gluten-free** needs of the whole house … » ⇒ **cinq plans sur
cinq**.

✅ **Conséquence voulue : le delta n'a JAMAIS été appliqué, et la fixture est
exactement celle que ce rapport décrit.** Relu après l'arrêt :
`Ivar / Lubna / Roxane / Zoe` portent tous `target_weight_kg = NULL` et
`target_pace_kg_per_week = NULL`. Les quatre mesures sont donc **rejouables
telles quelles**, sans réappliquer la fixture.

⚠️ **Lisez `suite.log` et les dossiers `onedish-*/` / `plandelta-*/` avec cette
règle : un dossier qui ne porte pas les trois fichiers est un run NON ABOUTI et
ne compte pas.** Les conclusions de ce rapport reposent sur `plan-1` à
`plan-4`, et sur rien d'autre.

⚠️ **SI QUELQU'UN LANCE ② UN JOUR : LA FIXTURE EST MODIFIÉE ET NE REVIENT PAS
EN ARRIÈRE.** Tout plan de ce foyer écrit **après** l'application du delta
porterait une cible pour Ivar et ne serait **pas** comparable aux quatre mesures
de ce rapport (écrites entre **03:39 et 04:00 UTC**).

⚠️ Le point de §1.5 ne dépend **pas** du delta : il est déjà établi par le
compteur (`no_pace: 1` sur 4 runs sur 4) et par le code
(`memberTargetFactor` refuse la direction sans allure). Le delta ne ferait que
mesurer **de combien** l'assiette bouge, pas **si** elle bouge.

---

# §6 — LE POSTE, ET CE QUE JE N'AI PAS PU MESURER

- **Modèle** : `gemini-3-flash-preview` sur **tous** les runs (réserve en tête).
- **Le repli expire à 60 s sur cette lane** (`gemini.ts:825` :
  `Math.min(GEMINI_HTTP_TIMEOUT_MS, 60_000)`, non contournable par
  l'environnement, sauf `meta.httpTimeoutMs` que la lane ne passe pas). Sur une
  fenêtre de **2 jours**, le taux mesuré est de **4 plans écrits sur
  7 tentatives** :

  | run | 1ʳᵉ tentative | relance |
  |---|---|---|
  | plan-1 | **200** en 63 s | — |
  | plan-2 | `546 WORKER_LIMIT` en 400 s (5 expirations) | **200** en 64 s |
  | plan-3 | `546` en 332 s (4 expirations) | **200** en 136 s |
  | plan-4 | **200** en 121 s | — |
  | plan-5 | `546` en 400 s | ⛔ `546` en 400 s — **abandonné** |

  `plan-5` porte un `NOTES.md` qui dit exactement ce qui existe et ce qui
  manque, et **ne compte pas comme une mesure**. Son `plan-payload.json` a été
  **supprimé** : la requête « dernier plan du foyer » y rendait le plan de
  plan-4 — c'est le piège qu'un run non abouti tend, et un `plan_id` en double
  est le seul moyen de le voir (garde ajoutée à `analyse.py`).
- ⛔ **Une fenêtre de plus de 2 jours n'est pas mesurable sur le modèle de
  repli.** Un plan de 2 jours × 2 créneaux × 4 bouches est déjà à la limite des
  60 s. La cohérence sur **une semaine** — et la monotonie du petit-déjeuner,
  la cicatrice « sept petits-déjeuners identiques » — reste donc **non
  mesurée**. C'est une limite de poste, pas un résultat.
- **Trois fichiers par run, tenus** : `inputs.json` (roster relu EN BASE au
  moment du run), `dump/prompt-system.txt` + `dump/prompt-user.txt` (vidés avec
  `--source generate-household-meal-v1` explicite — un `request_id` foyer porte
  souvent deux appels), `http-response.json`, `plan-payload.json` (le plan tel
  qu'il est en base) et `plan-written.json` (ce que le moteur a décidé).
- **Chaque ligne prouvée existante avant lecture** (`model.txt` porte
  `source | model | status | chars` pour chaque tentative). Aucun vidage n'a été
  lu comme une preuve d'absence.
- **Chaque lecture de base corroborée par une seconde requête de forme
  différente.** Exemple, les plans écrits : liste (`id, created_at, user_id`) et
  agrégat (`count(*), min, max, count(distinct user_id)`) rendent le même
  résultat. Idem sur le roster (RPC `keel_household_roster_for` **et** lecture
  directe de `household_members`) — et c'est cette contre-épreuve qui a montré
  que `household_members.diet` et `.goal` sont NULL pour la titulaire du compte
  alors que le roster rend `omnivore`/`fat_loss` : **la table n'est pas
  l'autorité, la RPC l'est.**
- **Aucune contamination** : à la clôture, tous les plans du foyer
  `9e90b53d-…` portent mon `user_id` et mes horodatages.
- **Non mesuré** : le modèle nominal ; une fenêtre de 7 jours ; le
  petit-déjeuner ; un foyer où toutes les bouches ont un compte ; le mode
  le delta de cible (§E — jamais lancé). Le mode `one_dish` a été mesuré à
  moitié : un plan capturé après coup, sans sa réponse HTTP (§E).

---

# §7 — VERDICT, PAR CASQUETTE

## Le diététicien signe-t-il ? — **NON.**

Trois raisons, toutes systématiques :

1. **La personne qui s'entraîne est celle qui mange le moins.** Elle est la
   deuxième du roster, donc c'est son plat que le plafond jette : **1 plat
   propre livré sur 8 demandés**, et **moins de 10 g de protéine par repas
   maison sur deux runs sur quatre** — pendant que son poulet est acheté, cuit
   et pesé à son nom.
2. **Rien ne borne la variance.** Sur des octets d'entrée identiques, la
   protéine d'une même bouche va de 16 g à 75 g sur deux jours. Un plan
   nutritionnel dont le contenu est un tirage n'est pas un plan.
3. **La monotonie est totale** : 14 couples (run, bouche) sur 16 ne mangent
   qu'une seule combinaison de préparations sur toute la fenêtre, dans un foyer
   qui a coché `varied`. Et le squelette est le même d'un run à l'autre.

Ce qu'il signe volontiers, en revanche : la sécurité (allergie médicale et
dégoût tenus 4/4), le silence sur les corps (4/4), et le refus de tout chiffre
de nutriment dans le texte.

## L'utilisateur lambda a-t-il envie de cuisiner ça ? — **NON.**

1. **Il ne peut pas exécuter le plan tel qu'il est lu.** Trois runs sur quatre,
   au moins une phrase de table nomme un plat que le plan ne sert pas. Le foyer
   lit « Ivar : poulet 290 g » devant une casserole de dahl.
2. **Il mangerait la même chose quatre fois de suite**, et son enfant aussi.
3. **La divergence est visible et jamais expliquée**, sauf par la phrase qui
   annonce l'allergie d'une adulte à voix haute.
4. **La promesse de 50 minutes suppose trois feux** qu'il a écrit ne pas avoir.

Ce qu'il apprécierait : que ses trois déjeuners dehors soient traités
proprement — rien de composé, rien de compensé, rien de dit — et que sa cuisine
sans four soit réellement respectée.

---

# §8 — LES FICHIERS

```
05-qualite-foyer/
  2026-08-19-0340-5a-fixture-foyer-qualite.sql   la fixture (4 bouches, 2 divergentes)
  2026-08-19-0400-5a-delta-cible-ivar.sql        le delta d'un octet (§E)
  run.sh · batch.sh · batch-shape.sh · suite.sh  le harnais (⚠️ tous en BASH, lancés par ./)
  analyse.py · tableau.py · proteine.py          la lecture PAR BOUCHE
  TABLEAU.txt · PROTEINE.txt                     leur sortie, figée
  batch-2to5.log · suite.log                     les journaux de run
  plan-1/ … plan-4/          LES QUATRE MESURES
    inputs.json              les entrées relues EN BASE au moment du run
    request-body.json        le corps POST
    prompt-system.txt        \ le prompt réellement envoyé
    prompt-user.txt          / (copies de dump/, vidage `--source` explicite)
    output.json              le plan tel qu'il est en base (= plan-payload.json)
    http-response.json       la réponse HTTP complète, `issues` comprises
    plan-written.json        ce que le MOTEUR a décidé (`generated_from.household`)
    model.txt                QUEL MODÈLE a servi — la preuve d'existence de la ligne
    CRITIQUE.md              la critique du plan, deux casquettes
  plan-5/                    ⛔ PAS UNE MESURE — deux 546, `NOTES.md` dit ce qui manque
  onedish-1/                 §E — CORROBORATION (plan capturé après coup,
                             `http-response.json` manquant, `CRITIQUE.md` le dit)
  onedish-2/                 ⛔ JAMAIS LANCÉ — `NOTES.md` le dit
  RAPPORT.md                 ce document
```

**La règle des trois fichiers est tenue sur les quatre mesures** : les entrées,
le prompt envoyé, la sortie obtenue — plus l'archive de ce que le moteur a
décidé. La seule exception est `plan-5`, qui porte un `NOTES.md` disant
exactement ce qui existe, et dont le plan a été **supprimé** plutôt que
recopié d'un autre run.

## Les deux gestes d'instrument que je consigne

1. **Un faux positif de mon propre scanner.** Ma première liste de mots
   cherchait `cal ` et a compté « medi**cal l**ist » comme une calorie.
   Corrigé, et écrit dans `analyse.py` : c'est exactement la cicatrice
   « jamais de matcher maison » (« laitue » ≠ « lait »), et elle a visé
   l'instrument, pas le produit.
2. **La garde du `plan_id`.** Un run non abouti laisse la requête « dernier plan
   du foyer » rendre le plan du run **précédent** — un plan complet, plausible,
   et faux. `analyse.py` imprime donc le `plan_id` et `tableau.py` refuse deux
   runs qui portent le même. C'est ce qui a démasqué `plan-5`.
