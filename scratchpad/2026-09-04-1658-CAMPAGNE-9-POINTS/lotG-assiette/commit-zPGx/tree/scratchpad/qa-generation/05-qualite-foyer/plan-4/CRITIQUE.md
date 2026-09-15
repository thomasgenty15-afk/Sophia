# plan-4 — 2026-08-19 04:00 UTC · **mêmes entrées, à l'octet**

**Modèle qui a SERVI : `gemini-3-flash-preview`.** HTTP 200 en 121 s.

## ⛔ L'ENFANT DE 7 ANS REÇOIT EXACTEMENT L'ASSIETTE DE L'ADULTE — TROIS FOIS

```
box_lentils_shared : 150 g → Zoe, Lubna
box_quinoa_shared  : 130 g → Zoe, Lubna
box_veg_shared     : 100 g → Zoe, Lubna
```

`box_sizing.shared_mixed = 3`, `issues` × 3 : « shared by mouths whose targets
differ, **grams left as written** ».

Les phrases lues à table, mot pour mot :

```
Zoe   (7 ans, 23 kg) : … — Spiced Coconut Red Lentils 150 g · Steamed Herbed
                            Quinoa 130 g · Sautéed Rainbow Vegetables 100 g
Lubna (34 ans, 57 kg): … — Spiced Coconut Red Lentils 150 g · Steamed Herbed
                            Quinoa 130 g · Sautéed Rainbow Vegetables 100 g
```

**Les six nombres sont identiques.** Et le détail qui achève la démonstration :
Roxane, 61 kg, dont la boîte a bien été dimensionnée, reçoit **102 g de
quinoa** — soit **moins que l'enfant de 23 kg (130 g)**.

Ce n'est pas une régression du moteur : le facteur d'Ivar est encore
**1,835** (145/79 = 189/102 = 145/79), identique à trois décimales aux runs 1,
2 et 3. C'est la **porte de sortie** du correctif : quand le modèle écrit
**une** boîte pour deux bouches, `sizeBoxesFromTarget`
(`household_portions.ts:2470-2490`) **refuse de la couper en deux** — un choix
écrit et argumenté (« fabriquer un second identifiant laisserait
`dishes[].uses[].box_id` pointer sur une boîte qui n'a plus le bon contenu ») —
et laisse les grammes du modèle. Le prompt demande pourtant, en toutes lettres :
« EVERY preparation carries 4 boxes … Two names go on the same box only when
they take the same weight, **and here no two of them do** ».

⇒ **Le correctif « la part suit le corps » tient tant que le modèle obéit à une
consigne qu'il désobéit sur 2 runs sur 4.** Et le compteur qui le dit
(`shared_mixed`) est un nombre de boîtes, jamais un nombre de bouches : ici
« 3 » veut dire « **deux bouches sur quatre, sur la totalité de ce qu'elles
mangent** ».

## ⛔ IVAR : QUATRIÈME RUN, QUATRIÈME FOIS SANS PLAT

```
dishes[8]: over the 8-dish cap … the surplus dish "Chicken and quinoa bowl with
           sautéed greens" (wed/dinner) was dropped instead
dishes[9]: over the 8-dish cap for several_days, dropped
```

`dish_owners {asked: 6, declared: 4, attributed: 4}` — **les quatre à Roxane**.
Et sa phrase de table promet encore ce qu'aucun plat ne lui sert :
« Pan-Fried Thyme Chicken Strips **145 g** · Steamed Herbed Quinoa 189 g ».

## LE DIÉTÉTICIEN

⚠️ Protéine estimée par repas maison : Roxane 24 g, Zoe 19 g, Lubna 19 g,
**Ivar 9 g**. Ivar, 88 kg, `muscle_gain`, `trains_hard`, mange deux fois à la
maison sur la fenêtre — **≈ 19 g de protéine sur deux jours**, pendant que
900 g de cuisses de poulet sont achetées et cuites pour lui et Roxane.

✅ Les légumes existent enfin comme préparation à part pour tout le monde
(`Sautéed Rainbow Vegetables`, brocoli + poivrons + courgettes) — le seul des
quatre runs où c'est vrai des quatre bouches.

⚠️ `structured_quantity_missing: 4/10` — quatre ingrédients sur dix n'ont pas
de quantité structurée.

## L'UTILISATEUR LAMBDA

- ⛔ **Une seule combinaison de préparations par bouche, sur quatre repas.**
  Quatrième run, quatrième fois. Le foyer a demandé `varied`.
- ⚠️ Session de 50 min : deux casseroles + une poêle en parallèle, sur
  « one small hob ». Quatrième run, quatrième fois.
- ✅ Courses propres ce coup-ci : 1 ligne sur 13 non rattachée (contre 7/17 et
  6/12 aux runs 2 et 3).
- ✅ Ni four ni congélateur, 0 occurrence.

## LES COMPTEURS

```
box_sizing   boxes 9(→3 partagées) · sized 6 · shared_mixed 3
             mouths{minor 1, sized 1, no_pace 1, no_direction 1}
regime_belt  mouths 1 · checked 3 · kept 3 · refused 0
dish_owners  asked 6 · declared 4 · attributed 4
portion_quantities  notes 4 · engine 4 · model_quantity 0 · model_size_word 0
```
