# onedish-1 — `cooking_shape: one_dish`, 2 jours · **CORROBORATION, PAS UNE MESURE**

## ⚠️ CE QUI MANQUE, ET POURQUOI JE LE DIS AVANT LE RESTE

**Première tentative : `546 WORKER_LIMIT`** (`FAILED-546.json`). La relance
(`request_id 2cb017f5-…`) a été lancée à 04:20:34 ; **j'ai arrêté le client à
04:21:20**, avant sa réponse, pour geler la fixture — et **le serveur, lui, a
fini** : `success` à 04:21:30, plan `adbdb2f1-4ce8-4e80-94e0-5a3718a74eef`
écrit à 04:21:30.919891+00.

Ce dossier porte donc :
- ✅ `inputs.json` (les entrées relues en base au moment du run) ;
- ✅ `prompt-system.txt` / `prompt-user.txt` (le prompt **réellement envoyé**,
  vidé APRÈS coup depuis `llm_raw_response_events`, `--source` explicite) ;
- ✅ `output.json` / `plan-payload.json` (le plan tel qu'il est en base) et
  `plan-written.json` (ce que le moteur a décidé) ;
- ⛔ **PAS de `http-response.json`** — le client était mort. Les `issues` de ce
  run n'existent donc nulle part, et je ne les invente pas.

⇒ **La règle des trois fichiers n'est pas tenue au sens strict** (la réponse
HTTP manque). Ce run **corrobore** les quatre mesures ; il n'en est pas une
cinquième. Aucune conclusion du RAPPORT n'en dépend.

## CE QU'IL CORROBORE

**① Le facteur de part, cinquième relevé, identique.** Sur la casserole unique :
Roxane 252 g · Zoe 220 g · Lubna 246 g · **Ivar 464 g**
⇒ **1,000 · 0,873 · 0,976 · 1,841**. Les mêmes trois décimales que plan-1 à
plan-4. `box_sizing.sized = 11` sur 11, `shared_mixed = 0`.

**② `box_sizing.mouths = {minor 1, sized 1, no_pace 1, no_direction 1}`** —
cinquième fois. Une bouche sur quatre dimensionnée sur une direction.

**③ La ceinture de régime** : `mouths 1 · checked 3 · kept 3 · refused 0 ·
silenced 4`. Armée, lit vraiment, ne mord pas parce qu'il n'y a rien à mordre.

**④ Le régime sort encore sur une surface lue** : `dishes[].why` =
« A comforting, warm plate that meets the **vegan and gluten-free** needs of the
whole house on a single hob. » ⇒ **cinq plans sur cinq**.

## CE QU'IL AJOUTE — LE MODE « UNE SEULE CASSEROLE », VU PAR BOUCHE

| bouche | mer/déj | mer/dîner | jeu/déj | jeu/dîner |
|---|---|---|---|---|
| Roxane | salade froide (**sans boîte**) | dahl 252 g | quinoa 441 g | dahl 252 g |
| Zoe 7 ans | salade froide (**sans boîte**) | dahl 220 g | quinoa 385 g | dahl 220 g |
| Lubna | salade froide (**sans boîte**) | dahl 246 g | quinoa 431 g | dahl 246 g |
| **Ivar** 88 kg, s'entraîne | **dehors** | **dahl 464 g** | **dehors** | **dahl 464 g** |

✅ **Le défaut n°1 du RAPPORT DISPARAÎT ici** : `dish_owners {asked: 0,
declared: 0, attributed: 0}`. `one_dish` ne promet aucun plat propre, donc le
plafond n'en jette aucun, donc **personne ne perd son plat et aucune phrase ne
promet un plat inexistant**. C'est la confirmation que le défaut vient bien de
la **contradiction du prompt en mode ②**, pas du modèle.

⛔ **Le prix est entier, et il tombe sur la même personne.** L'homme de 88 kg en
prise de muscle mange **464 g de dahl de lentilles, deux fois, et rien d'autre**
(il déjeune dehors les deux midis, donc il rate le quinoa). Protéine estimée
(plancher) : **≈ 29 g par repas**. La casserole est végane et sans gluten parce
que la ligne la plus stricte de la table gouverne — c'est le modèle produit, et
il est assumé ; mais pour cette bouche-là, le mode « simple » revient à deux
assiettes de lentilles.

⛔ **Et sa phrase de table nomme trois composants pour une assiette qui n'en a
qu'un** : « Serve the **protein and starch** first on the plate, then the
**vegetables**. — Velvety Sweet Potato & Lentil Dahl 464 g ». Il n'a **aucune**
boîte de quinoa (`mouths_unboxed: 1`, c'est lui).

⚠️ **Un déjeuner entier sans aucun poids** : la salade de mercredi midi n'a ni
boîte ni `uses` — trois bouches déjeunent sans qu'aucune quantité n'existe.

✅ **Ni four ni congélateur** : 0 occurrence, et la session (45 min, deux
casseroles + une poêle) se termine par « then **weigh** everything into the
named boxes ».
⚠️ **Faux positif de MON scanner**, consigné : mon terme `weigh ` a compté cette
phrase comme un « mot de corps ». C'est une pesée d'**aliment**. Corrigé à la
lecture, pas dans la liste — un scanner à relire à l'œil est la posture, pas un
matcher plus malin.
