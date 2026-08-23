# plan-2 — 2026-08-19 03:50 UTC · **mêmes entrées que plan-1, à l'octet**

`sha256(prompt-system)` et `sha256(prompt-user)` **identiques à plan-1**
(`ce2352d3…` / `e234dced…`). Tout écart avec plan-1 vient donc du modèle, pas
de l'entrée.

**Modèle qui a SERVI : `gemini-3-flash-preview`** (repli).
⚠️ **Premier essai perdu** : `546 WORKER_LIMIT` après **5 expirations à 60 s**
d'affilée (`FAILED-546-first-attempt.json`). Relancé avec un `request_id` neuf.
Le poste est consigné, rien n'en est conclu sur le produit.

## LE PLAN, PAR BOUCHE

| bouche | mer/déj | mer/dîner | jeu/déj | jeu/dîner |
|---|---|---|---|---|
| **Roxane** | thon + avocat (**sans boîte**) | poulet 94 g · riz 118 g | idem | idem |
| **Zoe** 7 ans | pois chiches + avocat (**sans boîte**) | dahl 172 g · riz 103 g | idem | idem |
| **Lubna** végane | pois chiches + avocat (**sans boîte**) | dahl 192 g · riz 115 g | idem | idem |
| **Ivar** 88 kg, s'entraîne | **dehors** | ⛔ **le dahl végane de la table** | **dehors** | ⛔ **le dahl végane** |

Chaque bouche a **une seule combinaison de préparations** sur les trois repas
cuisinés. Le déjeuner de mercredi est une salade froide, non pesée.

## ⛔ LE DÉFAUT CENTRAL DE CE RUN — LA PHRASE PROMET UN PLAT QUI N'EXISTE PAS

`member_portions[Ivar].portion_note` :

> « Serve the chicken and rice first; on Wednesday evening, take an **extra
> portion** of rice from the pot if needed for **recovery**. — Pan-Seared Thyme
> Chicken Thighs **174 g** · Brown Rice with Wilted Spinach **218 g** »

Or **Ivar n'a AUCUN plat dans ce plan**. Ses deux repas à la maison sont le
**dahl végane de la table**. La chaîne complète, lue dans les `issues` :

```
dishes[8]: over the 8-dish cap for several_days -- kept, and the surplus dish
           "Seared thyme chicken with a double portion of spinach rice"
           (wed/dinner) was dropped instead
dishes[9]: over the 8-dish cap for several_days, dropped
```

Le modèle a écrit **10 plats** ; le plafond en ouvre **8** ; les **2 jetés sont
ceux d'Ivar**. Ses **boîtes**, elles, survivent (`box_chicken_ivar_1/2` à 174 g,
`box_rice_ivar_1/2` à 218 g) — parce que les boîtes vivent sur la
*préparation*, pas sur le plat. `attachSizedQuantities` parcourt ensuite toutes
les préparations et recolle chaque gramme portant son nom.

⇒ **Le poulet est acheté, cuisiné, pesé, écrit dans la phrase lue à voix haute
— et servi à aucun repas du plan.** C'est le même mécanisme que la brèche D.2
de l'étape ③ (l'enfant végane qui recevait du bœuf), pris par l'autre bout :
là le gramme suivait une boîte fausse, ici il suit une boîte **juste** dont le
plat a été **jeté**.

`dish_owners {asked: 6, declared: 4, attributed: 4}` — et **les 4 plats propres
sont ceux de Roxane**. La maîtresse du foyer, nommée en premier dans le roster,
prend tout ; le divergent nommé en second n'a rien. Même motif qu'à l'étape ③,
sur un autre foyer.

## ⛔ LE MOT DE TAILLE EST PASSÉ, ET LE COMPTEUR DIT ZÉRO

`portion_quantities.model_size_word` = **0** alors que la note d'Ivar porte
« take an **extra portion** of rice from the pot ».

Ce n'est pas un défaut de matcher — `SIZE_WORD_TERMS` est une liste fermée qui
**écrit elle-même** qu'elle est un plancher (« une comparaison sans aucun de ces
mots lui échappe »). C'est ce plancher, franchi sur un run réel. Les formes qui
manquent, mesurées ici : `extra portion` (dans la note gardée) et
`double portion` (dans le titre du plat jeté).

Et la phrase fait pire qu'un mot de taille : elle **envoie chercher au pot**, ce
qui défait la raison d'être des boîtes (« nobody weighs anything at mealtime »),
et elle **donne une raison** (« for recovery ») que le prompt interdit
explicitement dans une phrase lue à table.

## ⛔ LA CONTRAINTE MÉDICALE DE LUBNA EST ANNONCÉE À TABLE

`member_portions[Lubna].portion_note` :

> « All components served together; ensure use of the dahl and rice which are
> safe from **the foods on your medical list**. »

Le modèle a recopié dans une phrase de table l'**échappatoire** que le prompt
lui donne pour ne pas nommer l'allergène. Le prompt dit pourtant, dix lignes
plus haut : « NEVER state a reason … They are read aloud at the table by the
whole household. » La ceinture médicale n'a pas mordu (elle cherche le **nom**
de l'aliment, et il n'y est pas) — le produit sort donc un plan valide qui
annonce la maladie cœliaque de Lubna au dîner, devant l'enfant.

⚠️ **Note de méthode** : mon premier scan a compté ici une occurrence de
« calorie » — faux positif, `cal ` appariait « medi**cal l**ist ». Corrigé, et
consigné : c'est très exactement « jamais de matcher maison ».

## LE DIÉTÉTICIEN

⛔ **Le seul membre qui s'entraîne, sur un objectif de prise de muscle, ne
reçoit que du dahl végane à ses deux repas maison** — parce que ses deux plats
ont été jetés par un plafond. Sa protéine réelle sur la fenêtre ≈ 2 × 10 g,
pendant que 750 g de cuisses de poulet sont achetées et cuites.

⚠️ **Un déjeuner sans aucun poids.** Les deux salades de mercredi midi n'ont ni
boîte ni `uses` : trois bouches sur quatre déjeunent sans qu'aucune quantité ne
soit écrite nulle part. Légitime dans le contrat (« assemblies … made fresh »),
mais c'est le seul repas de la fenêtre où le foyer doit décider tout seul.

✅ **La part suit le corps sur les 22 boîtes** (`sized: 22`, `shared_mixed: 0`).
Facteurs relus : riz Roxane 118 / Ivar 218 / Zoe 103 / Lubna 115 ⇒ **1,000 /
1,847 / 0,873 / 0,975**. `1,847` est *identique à trois décimales* à celui de
plan-1 : c'est bien le moteur, pas le modèle.
⚠️ Ce que ça donne pour l'enfant : **Zoe, 7 ans, 23 kg, reçoit 87 % de
l'assiette de Roxane, 38 ans, 61 kg** — la référence est la moyenne de la
table, pas un adulte de référence.

⚠️ **Sept lignes de courses sur dix-sept n'appartiennent à aucun plat**
(`shopping_list_unattributed: 7/17`) : huile d'olive 250 ml, deux pots
d'épices, oignons, ail… pour deux jours et 95 de budget.

✅ Aucune calorie, aucun chiffre de corps, aucun champignon, aucun gluten.
✅ Ni four ni congélateur : 0 occurrence.

## L'UTILISATEUR LAMBDA

- **Est-ce que je sais quoi faire ?** Non pour Ivar : sa phrase lui donne du
  poulet, la grille lui donne un dahl. Deux surfaces du même plan se
  contredisent.
- **Est-ce que ça tient dans le temps annoncé ?** Session de 45 min pour trois
  préparations (riz brun 30 min, dahl 35 min, poulet 20 min) menées en
  parallèle sur « one small hob » — le run-through dit lui-même « use the
  **second** hob ring ».
- **Les courses sont-elles raisonnables ?** 1 kg de riz brun, 250 ml d'huile,
  2 pots d'épices pour **deux jours**. Ce sont des achats de fond de placard
  facturés à une fenêtre de deux jours.
- **La divergence est-elle lisible sans humilier ?** Non : la seule explication
  écrite est celle qui sort la liste médicale de Lubna à voix haute.

## LES COMPTEURS

```
box_sizing   boxes 22 · sized 22 · shared_mixed 0 · unverifiable 2
boxes        mouths 4 · mouth_slots 12 · mouths_unboxed 4 · mouths_double 8
regime_belt  mouths 1 · checked 6 · kept 6 · refused 0 · silenced 6
dish_owners  asked 6 · declared 4 · attributed 4 · refused 0
box_uses     uses 12 · cited 12 · resolved 12 · refused 0
portion_quantities  notes 4 · engine 4 · model_quantity 0 · model_size_word 0  ⛔ (voir plus haut)
```

`mouths_double: 8` — le modèle a écrit **une boîte par repas et par bouche**
(`box_dahl_zoe_1/2/3`), ce que le prompt interdit (« never two »). Le moteur les
compte, les dimensionne toutes, et ne refuse rien. Conséquence utile pour ce
lot : c'est ce run-là qui rend les facteurs de **toutes** les bouches lisibles.
