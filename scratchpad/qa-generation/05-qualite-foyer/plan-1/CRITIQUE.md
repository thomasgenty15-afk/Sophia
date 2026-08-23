# plan-1 — 2026-08-19 03:38 UTC · fenêtre 2 jours (mer + jeu), déjeuner + dîner

**Modèle qui a SERVI : `gemini-3-flash-preview`** (repli). `gpt-5.4-mini`
(`GLOBAL_AI_MODEL`, le modèle nominal de la lane) rend `429` en 0,9 s.
HTTP 200 en 63 s, une seule tentative modèle. `cooking_shape` non demandé ⇒
calculé `one_session`, servi `one_session`, 2 bouches divergentes.

## LE PLAN, PAR BOUCHE (jamais en moyenne)

| bouche | mer/déj | mer/dîner | jeu/déj | jeu/dîner | combinaisons distinctes |
|---|---|---|---|---|---|
| **Roxane** 61 kg, `fat_loss` | poulet 59 g · riz 118 g · légumes 63 g | idem | idem | dahl 200 g | **2** |
| **Zoe** 7 ans, 23 kg | dahl 200 g | dahl 200 g | dahl 200 g | dahl 200 g | **1** |
| **Lubna** végane, cœliaque | dahl 200 g | dahl 200 g | dahl 200 g | dahl 200 g | **1** |
| **Ivar** 88 kg, `muscle_gain`, s'entraîne | **dehors** | poulet 109 g · riz 218 g · légumes 116 g | **dehors** | dahl 200 g | **2** |

Les quatre intitulés de dahl sont **quatre titres pour une seule casserole** :
« aux épinards », « à la coriandre », « aux tomates », « aux graines de
tournesol ». La monotonie ne se lit pas sur le titre.

## LE DIÉTÉTICIEN

⛔ **La protéine est concentrée sur un seul repas pour celui qui s'entraîne.**
Ivar (88 kg, `trains_hard`, `muscle_gain`) mange **deux fois** à la maison sur
la fenêtre : mercredi soir **≈ 31 g** (109 g de cuisse de poulet + riz +
légumes) et jeudi soir **≈ 10 g** (200 g de dahl). Estimation plancher à moi,
pas du plan (`proteine.py`) : **≈ 40 g sur deux jours à la maison, dont 77 %
sur un seul repas**.

⛔ **L'adulte végane est nourrie à la portion la plus faible du foyer, quatre
repas d'affilée.** 250 g de lentilles corail réparties en 8 parts ⇒ **≈ 10 g de
protéine par part**. Lubna (57 kg, végane, cœliaque) n'a **rien d'autre** :
**≈ 39 g sur deux jours**, soit ~20 g/jour sur ses deux repas. Le régime le plus
strict est aussi celui qui reçoit le moins — et Zoe, 7 ans, reçoit exactement
la même chose.

⚠️ **Les légumes n'existent qu'en garniture pour la moitié de la table.** La
doctrine du coach dit « one loud vegetable on every plate ». Roxane et Ivar ont
une vraie préparation de légumes (haricots verts + poivrons). Zoe et Lubna ont
la patate douce **fondue dans** le dahl, plus une garniture décorative (50 g
d'épinards, une pincée de coriandre, 60 g de tomates cerises, 1 c. à s. de
graines). `honours_belief_keys` réclame pourtant `one_loud_vegetable` sur trois
des quatre plats de dahl.

⚠️ **59 g de poulet cuit pour une femme de 61 kg** est en dessous de la « palm
of protein » que le prompt système nomme lui-même comme repère de plausibilité.
Le mécanisme est visible : le modèle a écrit une part ordinaire (~80 g) et le
moteur l'a multipliée par le facteur de Roxane (~0,74 — sa maintenance rapportée
à la **moyenne de la table**, tirée vers le haut par un homme de 88 kg). Le
plafond de plausibilité de la part n'est donc pas vérifié APRÈS le facteur.

✅ Aucune calorie, aucun macro, aucun chiffre de corps nulle part (0 occurrence
sur toutes les surfaces lues par un humain, `member_portions` comprises).
✅ Le champignon de Zoe : 0 occurrence.
✅ Le gluten de Lubna : 0 occurrence. Riz basmati, lentilles, patate douce —
la casserole commune est réellement sans gluten et végane.

## L'UTILISATEUR LAMBDA

⛔ **« Pourquoi Zoe ne mange-t-elle que des lentilles ? »** Elle est omnivore et
sans contrainte. Le prompt dit pourtant, noir sur blanc, que la seule bouche
autorisée à ne pas avoir de boîte sur un plat dédié est **Lubna** (la végane).
Le modèle a laissé Zoe dehors de **trois préparations sur quatre** — et le
produit le sait : six `issues` le disent, une par (bouche, préparation). Rien
n'atteint l'écran.

⛔ **La divergence n'est PAS lisible à table.** Elle est **visible** : deux
assiettes portent du poulet et du riz, deux portent des lentilles. Rien, dans
aucune phrase lue à voix haute, ne dit pourquoi, et l'enfant n'a aucune raison
que quiconque puisse lui donner. La seule phrase qui explique quelque chose est
adressée à Lubna — et elle sort son régime devant tout le monde : « Serve the
dahl mixed together, **ensuring no cross-contamination with non-vegan items**. »

✅ **La cuisine pauvre est respectée.** Ni four, ni congélateur déclarés ⇒
`== THIS KITCHEN ==` est bien dans le prompt, et **0 occurrence** de
`oven / roast / bake / grill / freeze` dans tout le plan. La session est « riz
d'abord, dahl dans la seconde casserole, poulet à la poêle ».

⚠️ **Une session de 50 min qui demande deux casseroles et une poêle en même
temps**, sur un foyer dont la situation écrite est « one small hob ». Le
run-through l'assume (« use the remaining hob space »), mais `stovetop` est un
jeton sans nombre de feux : rien dans la chaîne ne sait qu'il n'y en a qu'un.

⛔ **La casserole commune est sous-produite.** Demande calculée sur les boîtes
réellement citées : **10 parts de dahl**, `servings_made` = **8**. Deux personnes
n'ont rien jeudi soir. Le moteur vérifie que la somme des boîtes ne dépasse pas
la casserole (`sum_checked: 2`, `sum_over: 0`) — il ne vérifie pas combien de
fois chaque boîte est **reprise**.

⚠️ **« The shopping budget is 95. »** Sans devise. Le prompt dit « in the local
currency of their country » ; la phrase rendue, elle, ne le dit pas.

✅ **Manger dehors tient parfaitement.** Les deux midis d'Ivar dans la fenêtre :
aucun plat, aucune ligne de courses, aucune mention, aucune compensation sur un
autre repas. C'est exactement ce que le bloc `== A MEAL EATEN OUT IS NOT AN
ABSENCE ==` demande. Contrepartie assumée et documentée dans le code : sans
compte, il ne reçoit **rien du tout** pour ces trois midis (`eatingOutAdvice`
refuse en `other_mouth`).

## LES TROIS CORRECTIFS DE LA NUIT, JUGÉS EN L'ÉTAT

| | verdict sur ce run |
|---|---|
| part dimensionnée par le corps | **partiel** — 6 boîtes sur 7 dimensionnées (Ivar/Roxane = 109/59 = 218/118 = 1,847 à 3 décimales). La 7ᵉ est **la casserole commune**, laissée à 200 g pour tout le monde (`shared_mixed: 1`) : l'enfant de 23 kg et l'homme de 88 kg y reçoivent le même nombre. |
| contrainte dure attachée à sa bouche | ✅ `- Lubna: gluten — allergy, severity=medical (declared by student)`, sous le bloc qui dit que le nom ne restreint pas la portée. |
| ceinture de régime | ✅ armée, `checked: 1`, `kept: 1`, `refused: 0`, `silenced: 2` (« coconut milk » désamorcé). **Elle n'a pas eu à mordre** : le modèle n'a mis Lubna dans aucune boîte carnée. Aucune régression — et aucune preuve non plus, le dénominateur vaut 1. |

## LES COMPTEURS, TELS QU'ÉCRITS

```
box_sizing   boxes 7 · sized 6 · unchanged 0 · shared_mixed 1 · unverifiable 1
             mouths{minor 1, sized 1, no_pace 1, no_direction 1}
boxes        mouths 4 · mouth_slots 16 · mouths_unboxed 6 · mouths_double 0
regime_belt  mouths 1 · checked 1 · kept 1 · refused 0 · silenced 2
dish_owners  asked 6 · declared 4 · attributed 4 · refused 0
eating_out   cells 2 · mouths 1
kitchen      missing [oven, freezer, air_fryer, pressure_cooker]
portion_quantities  notes 4 · engine 4 · model_quantity 0 · model_size_word 0
```

`dish_owners {6, 4, 4}` : six plats propres promis par le prompt, **quatre
écrits**. Les deux manquants sont ceux de jeudi soir — Roxane et Ivar
retombent tous les deux sur la casserole commune. Le plafond annoncé au
modèle est `at most 8 dishes` ; la demande est 4 (table) + 6 (propres) = **10**.
