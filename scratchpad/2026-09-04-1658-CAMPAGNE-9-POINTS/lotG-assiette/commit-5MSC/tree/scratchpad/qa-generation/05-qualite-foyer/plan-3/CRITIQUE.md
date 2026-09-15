# plan-3 — 2026-08-19 03:58 UTC · **mêmes entrées, à l'octet** (`ce2352d3…` / `e234dced…`)

**Modèle qui a SERVI : `gemini-3-flash-preview`.**
⚠️ **Premier essai perdu** : `546 WORKER_LIMIT` après 332 s et **4 expirations
à 60 s**. Relancé avec un `request_id` neuf ; abouti en 136 s.

## LE PLAN, PAR BOUCHE — **UN SEUL REPAS, QUATRE FOIS, POUR TOUT LE MONDE**

| bouche | mer/déj | mer/dîner | jeu/déj | jeu/dîner | intitulés distincts |
|---|---|---|---|---|---|
| Roxane | poulet+poivrons 157 g · riz 142 g | idem | idem | idem | **1** |
| Zoe 7 ans | dahl 206 g · riz 124 g | idem | idem | idem | **1** |
| Lubna | dahl 231 g · riz 138 g | idem | idem | idem | **1** |
| Ivar | **dehors** | dahl 435 g · riz 261 g | **dehors** | idem | **1** |

Le foyer a déclaré `variety: "varied"`. **Personne ne mange deux choses
différentes de toute la fenêtre.** C'est la cicatrice « sept petits-déjeuners
identiques » du dépôt, reprise sur le déjeuner et le dîner d'un foyer entier.

## ⛔ LA PHRASE DE TABLE PROMET DEUX PLATS QUI N'EXISTENT PAS

```
Zoe:  … — Sweet Potato and Red Lentil Dahl 206 g · Pan-Seared Chicken and
          Peppers 138 g · Steamed Basmati Rice 124 g
Ivar: … — Sweet Potato and Red Lentil Dahl 435 g · Pan-Seared Chicken and
          Peppers 290 g · Steamed Basmati Rice 261 g
```

Or **aucun plat du plan ne sert de poulet ni à Zoe ni à Ivar** : les quatre
plats de poulet sont ceux de Roxane, et les quatre repas de Zoe et d'Ivar sont
le dahl de la table. Les `issues` donnent la cause, mot pour mot :

```
dishes[8]: over the 8-dish cap for several_days -- kept, and the surplus dish
           "Pan-seared chicken and peppers with basmati rice" (wed/dinner)
           was dropped instead
dishes[9]: over the 8-dish cap for several_days, dropped
```

**Deuxième run consécutif où le plafond de plats jette exactement les plats
d'Ivar.** La boîte, elle, survit — elle vit sur la *préparation*, pas sur le
plat — et `attachSizedQuantities` (`household_portions.ts:3877-3918`) recolle
son gramme dans la phrase sans jamais regarder `dishes[]`.

⇒ Un foyer lit à voix haute, jeudi soir : « Ivar : dahl 435 g · poulet 290 g ·
riz 261 g », devant une casserole de dahl.

## ⛔ ROXANE PREND **QUATRE PLATS SUR QUATRE**, IVAR **ZÉRO**

`dish_owners {asked: 6, refused: 0, declared: 4, attributed: 4}` — les 4 sont
tous à Roxane. Cumul sur les trois runs de mêmes entrées :

| | plats propres demandés | livrés |
|---|---|---|
| **Roxane** (maîtresse, 1ʳᵉ du roster) | 4 + 4 + 4 = 12 | **3 + 4 + 4 = 11** |
| **Ivar** (2ᵉ du roster, celui qui s'entraîne) | 2 + 2 + 2 = 6 | **1 + 0 + 0 = 1** |

## LE DIÉTÉTICIEN

⚠️ **435 g de dahl dans une seule boîte.** Le dimensionnement par le corps
fonctionne (Zoe 206 / Lubna 231 / Roxane 236 / Ivar 435 — facteur Ivar/Roxane
= 1,843, le même qu'aux runs 1 et 2 à trois décimales), mais il **multiplie une
part que le modèle a déjà écrite large**. Rien ne vérifie qu'une part
dimensionnée reste une assiette plausible : 435 g de dahl + 261 g de riz =
**696 g dans une seule assiette**.

⚠️ **La protéine est correcte ce run-ci** (estimation plancher : Roxane 27 g,
Zoe 18 g, Lubna 20 g, Ivar 38 g par repas maison) — et c'est précisément le
problème : sur les **mêmes octets d'entrée**, elle valait 17/10/10/31 au run 1
et 24/18/20/8 au run 2. **Rien ne mesure cet écart, et rien ne le borne.**

⚠️ **Les légumes**, à nouveau : Zoe et Lubna n'ont que la patate douce fondue
dans le dahl et 200 g d'épinards remués dedans pour huit parts. La doctrine du
coach dit « one loud vegetable on every plate ».

⚠️ **Six lignes de courses sur douze n'appartiennent à aucun plat**
(`shopping_list_unattributed: 6/12`), dont deux pots d'épices et 1 kg de riz
pour deux jours.

## L'UTILISATEUR LAMBDA

- ⚠️ **« sans utiliser de four »** apparaît dans un `why` :
  « Warm and filling for a late Wednesday evening **without using an oven**. »
  Ce n'est pas une violation (c'est une négation, aucune cuisson au four n'est
  demandée), mais le plan commente une contrainte du foyer au lieu de
  simplement cuisiner avec ce qu'il a.
- ⚠️ **Une session de 50 min pour deux grandes casseroles et une grande poêle
  menées de front**, sur « one small hob ». Troisième run, troisième fois.
- ⛔ **Quatre fois le même repas.** Personne ne cuisinera cette semaine deux
  fois avec envie.

## LES COMPTEURS

```
box_sizing   boxes 11 · sized 11 · shared_mixed 0 · unverifiable 1
             mouths{minor 1, sized 1, no_pace 1, no_direction 1}
boxes        mouths 4 · mouth_slots 12 · mouths_unboxed 1 · mouths_double 0
regime_belt  mouths 1 · checked 2 · kept 2 · refused 0 · silenced 2
dish_owners  asked 6 · declared 4 · attributed 4 · refused 0
portion_quantities  notes 4 · engine 4 · model_quantity 0 · model_size_word 0
kitchen      missing [oven, freezer, air_fryer, pressure_cooker]
```

✅ La ceinture de régime : `checked 2`, `kept 2`, `refused 0`, et Lubna est bien
hors de la préparation de poulet (`mouths_unboxed: 1`, c'est elle). **Aucune
régression.**
