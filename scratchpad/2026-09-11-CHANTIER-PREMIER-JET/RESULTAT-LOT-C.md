# Lot C — rendre la première composition vérifiable · LIVRÉ

`composition_contract.ts` (neuf) + 2 fichiers de test neufs. `meal_generation.ts`,
`household_meal_generation.ts`, `household_portions.ts`, `household_prompt_v34.ts` modifiés.
Suite : **6 520 verts · 3 rouges**. +111 tests depuis la référence.

## Le coût en caractères, mesuré (pas estimé)

| | avant | après | delta |
|---|---:|---:|---:|
| `MEAL_SYSTEM_PROMPT` | 16 692 | **17 490** | +798 |
| `STANDARD_RECIPE_BLOCK` | 2 220 | **2 768** | +548 |
| couloirs par case, 7 j × 3 moments × 3 bouches | 0 | **838** | 30 car./case |
| **catalogue — pas encore servi** | — | **4 714** (121 lignes sur 943) | 30,7 car./ligne |

Une fois le catalogue câblé : **≈ +6 900 caractères** sur un prompt foyer qui pèse ~35 800 →
**+19 %**. Mesuré sur le vrai référentiel (943 lignes, 2 729 alias) avec la vraie porte du
lot A.

## Les arbitrages du lot C

| Question | Décision | Raison |
|---|---|---|
| Le catalogue tient-il dans le budget ? | **Oui : 121 lignes, 4 714 car.** | Le libellé ne sort **que quand il dit autre chose que l'identifiant** (mesuré : 304 libellés = le slug, 200 n'ajoutent que « raw »). Et les plafonds suivent le **rôle dans le calcul de densité**, pas la taille du groupe (`red_meat` : 290 lignes, plafond 6) |
| Comment classer dans un groupe ? | **Par nombre d'alias décroissant** | « Le slug le plus court » a été essayé et est **faux ici** : il classe `duck_meat`, `capon_meat`, `goose_meat` devant `chicken_meat` — un catalogue de volaille **sans poulet** à un plafond de 6 |
| Un `ref` valide mais hors catalogue : refusé ? | **Accepté** | Le plafond est une contrainte de **budget**, pas une règle alimentaire. Le refuser ferait du catalogue un garde-manger |
| Que veut dire « refuser » un `ref` faux ? | **La ligne survit, la pesée s'abstient**, et l'abstention est comptée | Perdre un dîner parce qu'un modèle a mal recopié un slug échangerait le repas contre le confort du parseur. **Aucun repli sur le terme** : c'est le chemin qui a servi du raisin sec pour du raisin frais |
| Repli des plans déjà écrits ? | **`ref` absent = clé jamais écrite ⇒ pesée par le terme**, aucune migration | Mesuré pendant l'écriture : un test strict `!== null` a fait rougir 8 tests d'un coup en cessant de peser tout l'historique |
| Retirer « 600 to 750 g » : sur quel fondement ? | **Parce qu'elle est FAUSSE**, pas parce qu'on aurait mesuré son coût | `PLATE_MASS_BOUNDS_G` donne 250-700 adulte, **150-450 enfant** : la consigne annonçait 600 g minimum pour une portion d'enfant bornée à 450, et un plafond au-dessus du maximum moteur. L'enquête dit que sa contribution chiffrée n'est pas démontrée — c'est écrit dans le test |
| Que garder de la phrase ? | **La forme, en parts d'assiette**, sans aucun nombre | Le défaut mesuré (« une paume de poulet sur un lit de courgettes », 3 192 kcal servis pour 8 571) est un défaut de **forme**. Une part ne fixe aucune masse, donc ne contredit aucune borne par bouche |
| Lever « portion pour N » vs « recette pour UN » ? | En **citant l'en-tête exact** `WRITE ONE STANDARD RECIPE PER DISH` | Un « ci-dessous » ne traverse pas la frontière système↔utilisateur — 0 % de conformité mesuré |
| Le couloir par case sur toutes les cases ? | **Seulement à 2 mangeurs et plus** (ou conflit) | À un seul mangeur, l'intersection **est** son couloir, déjà sur sa carte : 20 répétitions pour zéro information |
| Seuil de divergence `Dpréf` | **1,15** | Ce dépôt assume déjà ±10-15 % d'erreur de table et de cuisson : en dessous, c'est du bruit |

## Ce qui n'est pas prouvé, et le lot le dit

**Tout l'effet des consignes.** Aucun appel modèle. Ce qui est prouvé : la consigne contient ce
qu'elle doit contenir, ne contient plus ce qu'elle ne doit plus contenir, est déterministe, et
coûte N caractères. **Rien sur une densité rendue.**

**Le catalogue n'est servi à personne** tant que le lot E ne l'injecte pas : `ref_absent`
rapporterait 100 %.

## Ce qui n'a pas été fait

Aucune dépendance créneau → groupe alimentaire dans la sélection : le lot n'en a trouvé aucune
de défendable sur ce référentiel (les 30 groupes servent tous les créneaux). **Dit plutôt que
simulé.**
