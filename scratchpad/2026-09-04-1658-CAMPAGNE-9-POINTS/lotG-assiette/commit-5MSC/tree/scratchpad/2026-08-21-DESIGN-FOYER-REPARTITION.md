# Le foyer — qui tranche quoi, et le registre des conflits

**2026-08-21.** Troisième document du dossier, à côté de
`2026-08-20-1900-DESIGN-CALCUL-ET-COMPOSITION.md` (le calcul) et
`2026-08-21-DESIGN-MEMOIRE.md` (ce qu'on retient).

Celui-ci traite de **plusieurs bouches à une table** : ce que le moteur peut
trancher seul, ce que seul le modèle peut arbitrer, et ce qui relève d'une
décision produit.

> **C'est un document de TRAVAIL.** La partie 3 est un registre de **166 conflits**
> destiné à être traité ligne par ligne. Chaque entrée porte qui doit trancher, si
> ça existe aujourd'hui, et la règle à écrire.

**Méthode.** Six lectures parallèles du code — régimes, objectifs opposés,
sécurité, dégoûts et drapeaux, rythmes, contenu réel du prompt foyer — puis trois
énumérations sous des angles différents (sécurité, nutrition, logistique) et une
passe de complétude. 10 agents, 578 lectures de fichiers.

---
---

# PARTIE 1 — LES DÉCISIONS PRISES

## D1 ⛔ Le CURSEUR de cuisine arbitre les divergences

> **« Comment tu cuisines cette semaine » n'est pas une préférence de confort :
> c'est le BUDGET DE PRÉPARATIONS du foyer, et c'est lui qui décide si une seconde
> casserole s'ouvre.**

**Les quatre réponses de l'écran, et ce que chacune autorise :**

| la réponse | ce que ça autorise | ce que ça coûte |
|---|---|---|
| **Laisse le plan décider** *(le défaut)* | le **minimum** qui sert les impossibilités, et rien de plus | le moteur choisit — et **dit ce qu'il a choisi** |
| **Un seul plat pour tout le monde** | **1 préparation**, aucune divergence | la table descend au plus strict · un végane fait manger végane huit personnes |
| **Une cuisson, des plats un peu différents** | ⛔ **1 base + des variantes AU DRESSAGE** | quasi nul — une casserole, des gestes en plus au service |
| **Chacun le sien** | des **bases séparées**, autant que demandé | une cuisson par base — c'est là que le temps de session mord |

### ⛔ La troisième réponse n'est pas un intermédiaire mou

C'est une **distinction technique**, et elle reprend un constat déjà écrit au cas 06 :

> **Le coût d'une divergence dépend d'OÙ l'élément différent se trouve.**

| le porteur de la différence | coût | passe à l'échelle ? |
|---|---|---|
| **ajouté au dressage** — l'huile d'algue versée sur une portion, le fromage sur une seule assiette | quasi nul | ✅ **oui** — 8 bouches coûtent 8 gestes |
| **cuit dans la base** — remplacer la protéine | une vraie seconde préparation | ⛔ non — chaque base est une cuisson |

⇒ **« Une cuisson, des plats un peu différents » sert TOUTES les divergences qui
tiennent au dressage.** Le budget ne mord alors que sur les **bases**.

⇒ **Le même curseur répond à deux questions qui n'en font qu'une** : « une seconde
casserole s'ouvre-t-elle ? » et « un régime minoritaire descend-il toute la
table ? ». C'est un **budget**, et le foyer le déclare — pas le produit.

⚠️ **Il varie d'une semaine à l'autre, et c'est le point.** Une semaine chargée
resserre, une semaine calme ouvre. Une politique produit fixe n'aurait jamais pu
faire ça.

⚠️ **Il ne s'affiche qu'à partir de DEUX bouches.** Servi à quelqu'un qui vit seul,
il pose une question dont il est la seule réponse possible.

## D2 ⛔ Le curseur ne décide JAMAIS de la sécurité

```
SOUS le curseur    régime · objectif · goût · envie      ->  arbitrés par le budget
HORS du curseur    allergie · interdit médical · mineur  ->  servis TOUJOURS
```

Ce n'est pas une invention : le dépôt a pris cette décision le **2026-08-19**, en
retirant le temps de cuisine de l'arbitrage du plat dédié —

> *« Une préférence d'effort ne peut pas primer sur une impossibilité. »*

Le curseur hérite de cette ligne, mot pour mot.

## D3 La hiérarchie inter-bouches

L'analyse a trouvé que **passé la sécurité et le régime, rien ne dit aujourd'hui
quelle bouche prime.**

```
1  contrainte dure d'une bouche      hors budget, toujours servie
2  régime déclaré                    une ligne fermée, pas une préférence
3  impossibilité pratique            absence, habitude propre, gamelle
4  direction de service              un objectif que la mise à l'échelle ne sert pas
5  goût et envie                     le rang le plus bas

à rang égal : la bouche servie le MOINS souvent sur la fenêtre
```

⚠️ Ce rang doit être **lu par le modèle**, dans un bloc en position de récence —
et non seulement appliqué par le moteur.

## D4 ⛔ Aucun objectif de poids sur un enfant

**Le champ disparaît du front** pour une bouche mineure. Pas de poids visé, pas de
rythme, pas de direction.

⚠️ **Une réserve, à trancher séparément.** L'analyse a trouvé que
`keel_household_set_member_target` est **la seule des quatre surfaces du mineur
sans garde en base**. Retirer le champ ferme le geste ordinaire ; **un import, une
API ou un futur écran passeraient encore**. Un littéral de refus
(`target_not_for_minor`) coûte une ligne et ferme les quatre.

## ⟳ D5 Le maître génère ; les autres sont informés — ~~et peuvent régénérer~~

> ⛔ **CORRIGÉ LE 2026-08-23, ET LA CORRECTION EMPORTE LA JUSTIFICATION.**
> ~~« les autres … peuvent régénérer »~~ — **c'est FAUX, et ça l'a toujours été.**
> `supabase/functions/generate-household-meal-v1/index.ts:962` rend **403 `not_owner`**
> à tout membre dont le rôle n'est pas `owner`, avec sa raison écrite juste au-dessus :
> *« laisser n'importe quel membre la déclencher laisserait un colocataire effacer la
> semaine d'un autre »*. **Une seule personne peut générer : le maître.**
>
> ⚠️ **Décision produit du 2026-08-23** *(registre foyer n° 24)* : **on n'ouvre pas la
> porte pour l'instant.** Le porte-parole du foyer **EST** le maître, par construction —
> il n'y a pas de porte-parole à désigner, la porte de génération le désigne déjà.

⇒ ⛔ **LA RÈGLE CI-DESSOUS SURVIT, MAIS SA RAISON CHANGE.** Ce n'est pas
**qui appuie** qui fait diverger le plan — un seul le peut. C'est **qui a ÉCRIT** :
deux titulaires posent tous les deux une envie et des objectifs *(c'est le conflit
n° 25 du registre)*, et un seul appuie. **Le plan doit donc être indépendant de la
main sur le bouton parce que plusieurs mains ont écrit avant lui :**

> **Les items dont le sujet est le FOYER valent pour tous. Ceux dont le sujet est
> une BOUCHE ne valent que pour elle.**

Sans cette règle, le plan change selon **ce que chacun a écrit** — et **rien à
l'écran ne le montre**. Aujourd'hui, seul l'auteur qui appuie est entendu, et
comme **lui seul peut appuyer**, l'autre n'est jamais lu **ni averti de ne pas l'être**.

⚠️ **C'est la mesure d'attente signée avec le conflit n° 27** : tant que la portée
n'est pas construite, **l'écran montre au composeur ce que le plan N'A PAS appliqué**.

---
---

# PARTIE 2 — LE MÉCANISME

## 2.1 Ce que le moteur calcule, dans l'ordre

```
①  divergences DEMANDÉES     par les régimes, les objectifs, les dégoûts
②  divergences DUES          rang 1 — les impossibilités dures
③  budget du curseur         D1
④  servies                   dues + min(reste, budget)
⑤  tranchées                 par la hiérarchie D3
⑥  SACRIFIÉES                comptées, et NOMMÉES
```

⚠️ **L'étape ⑥ est ce qui rend le curseur honnête.** Le compromis vient d'un choix
que le foyer a fait lui-même — donc il se **dit**, il ne se subit pas :

> *« Cette semaine tu as choisi de cuisiner simplement. La table mange végétarien,
> et iku n'a pas de plat à lui. »*

C'est le **moteur** qui l'écrit : il a compté les divergences et connaît le budget.
Pas le modèle.

## 2.2 ⛔ Ce qui grandit avec N, et ce qui ne grandit pas

**La question qui décide si le design tient à 8 bouches** n'est pas « combien de
plats » — c'est **quel terme explose**.

| ce que le moteur calcule | la nature | à N bouches |
|---|---|---|
| **union des interdits** | une UNION, monotone | ⛔ **grandit et ne rétrécit jamais** — 8 bouches = jusqu'à 8 familles d'allergènes hors du pot |
| **régime du plat commun** | un MAXIMUM | ✅ **ne grandit pas** — un seul végane suffit, le neuvième ne change rien |
| **cibles énergétiques** | N calculs **indépendants** | linéaire, et **sans interaction** : la cible de l'un n'a aucun effet sur celle de l'autre |
| **contenants** | un GROUPAGE | ✅ **ne suit pas N** — `{chaque bouche à objectif, SEULE} ∪ {tout le reste, ENSEMBLE}`. 8 bouches dont 2 à objectif = **3 contenants** |
| **drapeaux perdus** | une SOUSTRACTION | ⛔ grandit — chaque exclusion peut faire tomber un drapeau pour **toute** la table |
| **grille des moments** | une UNION | ⛔ grandit — un goûter d'ado met `snack_pm` dans la grille de tout le monde |
| **divergences demandées** | ⛔ **COMBINATOIRE** | régimes × objectifs × dégoûts — **c'est le seul terme que le curseur existe pour borner** |
| **la hiérarchie D3** | 5 rangs | ✅ **ne grandit pas** — ce qui grandit, c'est le nombre de candidats à chaque rang |

### Ce qui casse en premier, par taille

| | 2 bouches | 4 bouches | 8 bouches |
|---|---|---|---|
| contenants | 1 ou 2 | 1 à 3 | **1 à 3** |
| familles d'interdits | ≤ 2 | ≤ 4 | **≤ 8** |
| divergences demandées | 0 à 2 | 0 à 6 | **15+** |
| le curseur | souvent inutile | il commence à mordre | **c'est lui qui tient tout** |
| ce qui casse | rien | l'espace alimentaire | **l'espace alimentaire** |

⛔ **La vraie limite d'un grand foyer n'est pas le nombre de plats — c'est
l'INTERSECTION.** Huit bouches, trois allergies, un végane et deux dégoûts peuvent
ne plus laisser **aucune ancre protéique servable**.

⇒ **C'est pourquoi `edibleGroupsAt` doit être calculé AVANT le prompt** (question
ouverte n°4). Aujourd'hui on dépense l'appel modèle et on découvre après.

## 2.3 Le partage moteur / modèle, en une règle

| | quand |
|---|---|
| **le moteur** | la règle se **dérive des données** — union des interdits, régime le plus strict, cibles, portes, budget, hiérarchie |
| **le modèle** | l'arbitrage est un **jugement de composition** qu'aucune formule ne rend |
| **une décision produit** | ni l'un ni l'autre ne peut trancher **légitimement** |
| **un refus** | le plan ne doit pas sortir |

**166 conflits, répartis ainsi : 109 · 14 · 31 · 12.**

⚠️ **Et 141 sur 166 n'existent pas aujourd'hui.** Un seul est correctement traité —
et l'analyse note qu'il l'est **par un autre chemin que celui que le commentaire du
code annonce**.

## 2.4 ⛔ Deux découvertes qui changent la lecture du code

### R5 ne s'arme que pour un végane en prise de masse

Le plat dédié — que `SPEC-REGIME-PAR-BOUCHE` présente comme la réponse générale à
la divergence de régime — ne se déclenche que si **le plus strict de la table est
VÉGANE** *et* que la bouche est en `muscle_gain`.

La raison est dérivable mais écrite nulle part : `ANIMAL_PROTEIN_ANCHORS` =
`PROTEIN_SOURCES` moins `[legumes, tofu_tempeh, lean_protein]` = **7 groupes, tous
exclus par `vegan` seul**. Le végétarien et le pescatarien **ne plafonnent aucun
axe**, puisqu'ils gardent les œufs, le yaourt et le fromage.

⇒ **Un omnivore en prise de masse à une table végétarienne mange végétarien toute
la semaine, et rien ne le signale.**

### Cette union n'a jamais tourné

Mesuré : **13 plans foyer** portent la ceinture de régime. **Tous avec une seule
bouche à table. Zéro refus.**

⇒ **L'union sur deux régimes déclarés n'a jamais été exercée en production.** Tout
ce document décrit du code **lu**, pas du comportement **observé**.

⚠️ **Conséquence de méthode** : rien de la chaîne de contenants ne doit être
considéré comme livré avant **un run réel persisté** qui l'exerce — un foyer de 4
bouches avec un végane, un mineur, une allergie médicale, deux objectifs opposés et
une absence partielle.

---
---

# PARTIE 3 — LE REGISTRE DES CONFLITS

**166 entrées, dédupliquées.** À traiter ligne par ligne.

**Colonnes** — *conflit* : le titre · *fam.* : la famille · *existe* : `—` rien,
`partiel`, `OUI` · *la règle* : ce qu'il faut écrire pour que ce soit traité sans
ambiguïté.

## 3.1 ⛔ LE PLAN DOIT REFUSER — 12

Un plan qui sort quand même est pire qu'un plan qui manque : il se cuisine, et l'erreur
arrive dans l'assiette.

### Refus  ·  12

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Le mineur avec un objectif sur sa fiche fait basculer TOUT le foyer hors de tout dimensionnement** | SÉCU | — | Deux verrous. ① `goalApplies` est appelé sur la lane foyer, au point où le roster est monté (index.ts:1615-1632) : un `goal` posé sur une bouche mineure ou d'âge inconnu est mis à `null` AVANT toute lecture d'enveloppe, et le fait est compté (`goal_dropped_minor`). ② La porte d'écriture refuse à… |
| 2 | **Le chat coupe par une phrase de prompt là où le générateur coupe par un 503** | SÉCU | — | Une même impossibilité doit produire le même refus dans les deux lanes. Quand l'union de sécurité du foyer est illisible, le tour de chat doit être coupé par un verrou déterministe de SORTIE (aucun nom d'aliment n'a le droit de sortir), pas par une consigne. Implémentation : passer… |
| 3 | **Un poids visé et un rythme peuvent être posés sur un enfant sans aucune garde d'âge** | SÉCU | — | `keel_household_set_member_target` doit refuser sur une bouche mineure avec un littéral nommé (`target_not_for_minor`), au même titre que `has_account` et `target_needs_direction`. C'est la seule des quatre surfaces du mineur qui ne relève PAS des trois gardes de calcul : un poids visé est une… |
| 4 | **Rien de la chaîne de contenants n'a jamais laissé de trace en base** | SÉCU | — | Aucune des règles ci-dessus ne doit être considérée comme livrée avant un run réel PERSISTÉ qui l'exerce. Poser une fixture obligatoire : un foyer de 4 bouches avec un végane, un mineur, une allergie médicale, deux objectifs opposés et une absence partielle ; composer en `intent: commit` (pas… |
| 5 | **Un mineur porte un objectif de poids posé par quelqu'un d'autre** | SÉCU | — | Appeler `goalApplies` là où le `goal` est lu (roster ou `members.map`), et refuser à l'écriture : la porte SQL qui pose un `goal` doit rendre `minor_goal_refused` quand `birth_date` fait un mineur. Un objectif de perte de poids posé par un tiers sur un enfant n'est pas une donnée à absorber, c'est… |
| 6 | **Une baisse de portion nommant explicitement un enfant** | SÉCU | — | Filtrer le sujet nommé aussi : sur `direction === 'down'`, un `member` dont `ageState` vaut `minor` ou `unknown` est EXCLU même nommé, avec `reason: 'minor'` dans `excluded`. Ne jamais dépendre d'un filet structurel qu'une autre porte peut contourner. |
| 7 | **La phrase de brouillon du maître gouverne la casserole de tout le monde** | SÉCU | — | Quand la note de brouillon touche les PORTIONS, elle doit passer le plancher TCA du FOYER (au moins une bouche `raised` ⇒ la note est ignorée sur son volet portions, avec un message neutre à l'auteur). Le plancher d'écriture reste celui de l'auteur pour tout le reste. Une phrase qui gouverne… |
| 8 | **L'union des interdits d'un foyer peut vider l'espace alimentaire, et rien ne le mesure avant de dépenser…** | SÉCU | — | Écrire `edibleGroupsAt(members, houseRules, index)` : l'intersection effective, calculée AVANT le prompt. Trois sorties : (a) au moins une ancre protéique servable ⇒ on compose et l'intersection part dans `generated_from.household.edible_groups` ; (b) aucune ancre servable pour la CASSEROLE mais… |
| 9 | **Une bouche retirée de tous les contenants d'un repas n'a rien à manger, et rien ne le dit** | RÉGI | — | Compter d'abord : un compteur `mouths_left_hungry` (bouche retirée de TOUS les contenants d'une case) qui ne soustrait rien nulle part. Puis trancher : si une bouche finit une case sans aucun contenant, relancer UNE fois en nommant la case et la personne ; si la relance échoue, refuser CE REPAS… |
| 10 | **Un seul jour de cuisine, sept jours de fenêtre, trois jours de frigo, pas de congélateur : l'arithmétique…** | LOGI | — | Une vérification de faisabilité AVANT le prompt : `coverableDays(cookDays, windowDays, MAX_FRIDGE_DAYS, hasFreezer)`. Si des jours ne sont couvrables par aucun chemin, ne pas composer un plan inexécutable : refuser avec `window_exceeds_cooking_capacity`, nommer les jours découverts, et offrir les… |
| 11 | **Un lot mangé avant d'être cuisiné** | LOGI | partiel | C'est la seule anomalie de logistique qui rend le plan INEXÉCUTABLE : elle doit déclencher une relance obligatoire, et en cas d'échec un refus explicite `plan_not_executable` nommant le jour et la préparation. Un plan qu'on ne peut pas cuisiner ne doit pas être servi avec une note de bas de page. |
| 12 | **Le quota de fusion épuisé refuse la semaine entière** | BUDG | partiel | Séparer les deux refus : le quota refuse LA FUSION (`merge_quota_exhausted`, à l'endroit du bouton, avec la date de réouverture du quota), jamais la composition. Le plan du foyer se compose sans Marc, exactement comme si personne n'avait cliqué. Un plafond commercial ne doit jamais retirer un… |

## 3.2 LE MODÈLE ARBITRE — 14

Aucune formule ne les rend. Chacun a besoin d'une **règle écrite dans le prompt**, en
position de récence, et d'un **compteur** à la sortie.

### Arbitrages de composition  ·  14

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Aucune règle de contamination croisée nulle part dans le dépôt** | SÉCU | — | Quand une bouche porte une contrainte `severity='medical'` ET qu'un plat dédié ou un contenant séparé existe dans le même repas, injecter un bloc dédié en position de récence : « Lubna ne peut pas partager la poêle, la planche ni l'eau de cuisson : compose SON plat en premier, ou dans un ustensile… |
| 2 | **Un plat de tradition qu'une bouche ne peut pas manger** | RÉGI | — | Écrire l'exception DANS le bloc des traditions, en une phrase que le modèle lit : « If a hard constraint or the strictest diet at this table forbids this meal, keep the DAY and the MOMENT, and cook the closest version this table can eat. Never move it, never leave the slot empty, never comment. »… |
| 3 | **Densité visée opposée : 1,3 kcal/g pour qui perd, 1,8 pour tout le monde, un seul plat** | NUTR | — | Un plafond de densité ne se sert pas en grammes, il se sert en COMPOSITION : quand au moins une bouche plate au repas a `densityCeiling = 1,3`, une ligne du brief le dit au modèle sous forme de contrainte de plat (« this meal is eaten by someone whose plate must stay light per gram: build volume… |
| 4 | **L'envie de la semaine contredit un interdit, et l'arbitrage annoncé est effacé** | GOÛT | — | Ouvrir un champ de sortie dédié à l'arbitrage (`trade_off`, une phrase, hors du `why`), demandé explicitement par le bloc d'envie et NON scanné par la passe « commentaire » du verrou des règles de maison — qui existe pour empêcher un plat de justifier son contenu par une règle, pas pour effacer… |
| 5 | **L'envie du foyer contre un interdit individuel, et l'arbitrage disparaît** | GOÛT | — | Donner à l'arbitrage un champ à lui, hors du `why` et hors de la portée du verrou de commentaire : `plan.tradeoff` (une phrase, pas d'aliment interdit nommé, pas de prénom porteur de contrainte), rendu en tête du plan. Compter `tradeoff_declared / tradeoff_missing` — un champ demandé au modèle… |
| 6 | **Deux voix de bouches différentes se contredisent, et rien ne tranche** | GOÛT | — | Ajouter au bloc des voix une règle de composition, pas un rang : « When two people at this table want opposite things, do not average them and do not pick a side: give each of them what they asked for at a DIFFERENT meal of the window, and say so in one sentence. » Puis compter la présence de… |
| 7 | **L'envie de la semaine contredit l'objectif d'une autre bouche, et le modèle tranche seul** | GOÛT | partiel | L'envie garde son rang 5 (le plus bas) et le PRECEDENCE_BLOCK doit le NOMMER pour le foyer — aujourd'hui il ne cite aucun objet du foyer (meal_generation.ts:1831-1851). Ajouter un rang explicite : « an energy target on one mouth outranks the week's craving, and the craving outranks nothing ». Et… |
| 8 | **Une table, deux services : le produit n'a pas d'heure, seulement des moments** | RYTH | — | Ne pas introduire d'horloge (elle contaminerait tout le moteur) : introduire un état par case, `split_service`, posé sur la grille du foyer quand deux groupes de bouches mangent la même case à deux moments. Il arme une consigne unique : « this meal is served twice, two to three hours apart: it… |
| 9 | **Une bouche déclare un moment que les autres ne prennent pas** | RYTH | partiel | Écrire la conséquence dans le brief, une fois, armée par la prémisse « au moins un moment de la grille n'est pas partagé par tout le monde » : « A moment in the grid is not a moment for everyone. Compose it ONLY for the people whose line names it, and give it no box for anyone else. » Puis… |
| 10 | **Un plat dédié coûte de l'argent que le budget ne connaît pas** | BUDG | — | Quand `divergingMembers` n'est pas vide et qu'un budget est déclaré, ajouter une phrase au bloc du budget : « this plan also cooks <n> dishes of their own for <prénoms> — those ingredients are inside the same ceiling; cut in the order above, never the portions. » L'arbitrage reste au modèle ; ce… |
| 11 | **Le budget est un chiffre d'un seul compte, et rien ne le vérifie** | BUDG | partiel | Garder la consigne (l'ordre de sacrifice est le bon lot) et fermer les deux trous d'honnêteté : (1) exiger du modèle une ligne `shopping_list.estimated_total` avec la mention explicite qu'elle est une ESTIMATION, et la compter (`declared / missing`) — un champ déclaré par le modèle a besoin d'un… |
| 12 | **Une tradition peut écraser un régime ou une allergie, et rien ne l'interdit** | SOCI | — | Le bloc des traditions doit porter sa propre exception, écrite dans le bloc et lue par le modèle : « Une tradition ne survit jamais à une contrainte dure ni au régime de la table. Si les deux se croisent, compose la tradition DANS le régime (un rôti végétal) et dis-le en une phrase. » Ne jamais… |
| 13 | **Deux voix opposées à la même table : aucun rang, aucune trace** | SOCI | — | Le bloc des voix doit porter la même exigence que le bloc d'envie : « Ces voix peuvent se contredire. Compose quand même UN plan, et dis en une phrase qui a été servi cette fois et qui le sera la prochaine. » Plus une règle d'alternance testable : sur une fenêtre de 7 jours, deux voix opposées sur… |
| 14 | **Aucun rang entre deux bouches passé la sécurité** | SOCI | — | Écrire une hiérarchie inter-bouches, courte et lue par le modèle, dans un bloc en position de récence : (1) contrainte dure d'une bouche, (2) régime déclaré, (3) impossibilité pratique (absence, habitude propre), (4) direction de service, (5) goût et envie. Et une règle de départage à rang égal :… |

## 3.3 UNE DÉCISION PRODUIT — 31

Ni le moteur ni le modèle ne peut trancher légitimement. Ce sont des **politiques**, elles
s'écrivent une fois. ⚠️ Cinq sont déjà tranchées en partie 1.

### Décisions  ·  31

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Une bouche sans compte n'a qu'un seul niveau : tout est 'medical'** | SÉCU | — | L'écran doit poser la question explicitement à la saisie : « allergie (danger) » ou « intolérance / à éviter ». La colonne s'ajoute avec DEUX valeurs réellement lues, et le comportement diverge : allergie ⇒ retrait de plat, intolérance ⇒ consigne de prompt + avertissement dans le plan, jamais 422.… |
| 2 | **Un adulte secondaire du foyer ne peut pas déclarer l'allergie de son enfant** | SÉCU | — | Tout adulte du foyer (rôle `owner` OU `adult` avec compte) peut AJOUTER une allergie sur n'importe quelle bouche ; seul l'`owner` peut en RETIRER une. Asymétrie voulue : ajouter ne peut que sur-bloquer, retirer peut tuer. Dans le chat, « mon fils / ma fille / mon conjoint est allergique à X » doit… |
| 3 | **Retirer une allergie est un DELETE définitif, sans confirmation ni trace** | SÉCU | — | Le retrait d'une allergie exige une confirmation nommée à l'écran (« retirer l'allergie à l'arachide de Lea ? cette bouche pourra recevoir de l'arachide dès le prochain plan »). Et la ligne passe en `retracted_at` plutôt qu'en `delete`, avec la lecture du générateur filtrée sur `retracted_at is… |
| 4 | **Un objectif de perte de poids est acceptable sur un enfant de 8 ans** | SÉCU | — | Poser `fat_loss` sur une bouche mineure doit rester possible en base (les trois gardes tiennent le CALCUL) mais doit exiger un passage humain à l'écran : une phrase non contournable qui dit que le plan ne fera jamais maigrir un enfant, qu'il servira une maintenance calculée sur son âge, et que… |
| 5 | **Une grossesse ou un allaitement est indéclarable pour une bouche sans compte** | SÉCU | — | Ouvrir un canal de condition médicale pour une bouche sans compte, sur le patron exact de `household_member_allergies` : une table `household_member_conditions(member_id, condition_ref, created_by)` avec le vocabulaire fermé déjà présent dans `MEDICAL_CONDITION_SURFACE_FORMS`. La lecture entre… |
| 6 | **Une condition médicale (diabète, cœliaque, hypertension) d'une bouche sans compte n'atteint aucune lane** | SÉCU | — | Même table que ci-dessus. Et dans le chat, étendre `detectDeclaredMedicalCondition` aux phrases visant une bouche NOMMÉE du foyer (« Tom est cœliaque »), avec le même vocabulaire fermé et la même déférence clinique — au lieu du désarmement actuel sur les tiers, qui est correct pour un inconnu mais… |
| 7 | **Un parent non-maître ne peut pas déclarer l'allergie de son enfant** | SÉCU | — | Ouvrir la porte aux adultes du foyer (role owner OU adulte avec compte) sur `keel_household_add_allergy`, avec notification à l'owner. Et dans le chat, ne pas rester muet : quand le plancher détecte « mon fils est allergique à X », répondre par un renvoi explicite vers la fiche de la bouche — ne… |
| 8 | **Une allergie ne se relit jamais : l'espace alimentaire du foyer ne fait que rétrécir, année après année** | SÉCU | — | Chaque ligne d'allergie porte `reviewed_at` (posé à la création) et l'écran du foyer, une fois par an et jamais plus souvent, affiche une relecture NON destructive : « <prénom> évite <allergène> depuis <date>. Toujours d'accord ? » avec deux boutons — « toujours » (repousse `reviewed_at`) et « en… |
| 9 | **Une allergie médicale gouverne le plan, pas la maison — et l'allergène entre par les repas hors plan** | SÉCU | — | Écrire une fois, à l'écran et au moment de la saisie d'une allergie `medical` sur une bouche du foyer, ce que le produit ne garantit PAS : « nous composons le plan sans arachide. Nous ne savons pas ce qui entre dans votre cuisine par ailleurs — les repas que chacun prend de son côté, les courses… |
| 10 | **Une bouche avec compte qui n'a jamais déclaré son régime fait servir de la viande à un végane** | RÉGI | — | Garder le refus `has_account` (le régime de quelqu'un lui appartient), mais rendre le trou visible et réparable : l'écran du foyer affiche « Sarah n'a pas dit ce qu'elle mange » avec un bouton qui lui envoie la question dans SON app, et le générateur écrit dans `generated_from.household` la liste… |
| 11 | **La bouche la plus stricte est absente toute la fenêtre, puis rentre plus tôt** | RÉGI | — | Écrire dans le plan rendu, à côté de la fenêtre, la ligne des bouches exclues et pourquoi (« Léa n'est pas comptée dans ce plan : absente du 12 au 18 »). C'est une information de FOYER, pas un calcul : la personne qui lit doit pouvoir décider elle-même de recomposer si le retour change. Aucun… |
| 12 | **Aucun régime religieux ou culturel n'existe : ils tombent tous dans le verrou tout-ou-rien des règles de…** | RÉGI | — | Décider produit, et l'écrire : soit les pratiques deviennent des RÉGIMES de première classe (jetons `no_pork`, `no_beef`, `halal`, `kosher`) avec leurs groupes exclus dans `excludedGroupsFor` — et alors elles ne sont plus ordonnables par `exclusionCount` (voir le conflit suivant) — soit elles… |
| 13 | **Un seul végane fait manger végane six personnes toute la semaine** | RÉGI | partiel | Descendre la table au plus strict reste la règle de SÉCURITÉ (une casserole peut donner moins, jamais plus). Mais quand `strictestRegime` est porté par une minorité stricte des bouches à table, le produit doit poser la question à l'écran AVANT de composer : « Sarah est végane. Le plat de la table… |
| 14 | **Le maître ne peut pas poser le régime d'une bouche qui a réclamé son compte** | RÉGI | partiel | Garder le refus (le régime d'un adulte lui appartient) et fermer le trou de silence : quand une bouche réclamée n'a AUCUN régime résolu, l'écrire sur sa ligne du brief (« Marc has not told us what he eats ») et l'afficher au maître, pour que « pas de régime » ne se confonde pas avec « omnivore ».… |
| 15 | **Un objectif posé sur une bouche sans corps : facteur 1, c'est-à-dire l'assiette du modèle** | OBJE | partiel | Un objectif déclaré sans corps est une question ouverte, pas un défaut de calcul : la porte d'écriture de l'objectif (`keel_household_set_member_target`) enchaîne sur la saisie du corps, et l'écran du foyer marque la bouche comme « objectif posé, taille de part non calculable ». Côté moteur, rien… |
| 16 | **Les sentinelles s'abstiennent sous 7 jours, et la fenêtre du produit va de 1 à 7** | NUTR | partiel | L'abstention sous 7 jours est CORRECTE et ne se répare pas en baissant le seuil (six faux trous mesurés sur un plan d'un jour). Ce qui manque est une mémoire : cumuler les groupes porteurs servis sur les fenêtres CONSÉCUTIVES d'un même foyer (`student_generated_meals` porte déjà les jours), et… |
| 17 | **L'assiette du plat suppose un pain, un fromage et un dessert que la fiche d'à côté n'a pas déclarés** | NUTR | partiel | Aucune formule ne peut deviner si quelqu'un prend du fromage. Le repli à 0,42 reste (il est neutre à l'octet près pour la base existante), mais il doit être VISIBLE : `structureState` est déjà rendu par `anchorFactorFor` — il faut le persister par bouche et le remonter à l'écran du foyer sous la… |
| 18 | **Le retour d'une seule bouche devient une règle permanente pour toute la table** | GOÛT | — | Poser la même question que pour les portions, qui la pose déjà (`portionsSubject`, plan_feedback_retained.ts:464) : « qui n'a pas aimé ? » — moi, ou toute la table. Sujet `member:<uuid>` ⇒ la bouche est retirée du contenant de ce plat, le plat reste ; sujet `household` ⇒ règle de maison. Et rendre… |
| 19 | **Les jours de cuisine, le temps par session et le budget viennent d'un seul compte** | LOGI | — | Décider une fois, produit : la capacité de cuisine est un fait du FOYER, pas d'un compte. La poser sur `households` (ou une table `household_kitchen`), écrite par l'owner, lue par le générateur, et non plus sur `student_goals` du composeur. Tant que ce n'est pas fait, l'écran doit dire à qui… |
| 20 | **Personne ne sait qui cuisine** | LOGI | — | Poser la question une fois, par jour de cuisine : « qui cuisine ce jour-là ? » (`household_cook_days.member_id`), puis (a) refuser de placer une session un jour où le cuisinier désigné est `away`, (b) écrire le prénom du cuisinier sur la session dans le plan rendu. Sans propriétaire, une session… |
| 21 | **Le shaker d'un enfant n'est saisissable nulle part** | LOGI | — | Brancher l'écrivain d'apports fixes par `member_id` sur la fiche de bouche de `/app/household` (même porte SQL que l'entonnoir, mêmes refus `has_account`/`not_owner`). Tant que ce n'est pas fait, ne pas afficher de section vide : un champ absent vaut mieux qu'un champ mort. |
| 22 | **Un invité à table n'existe nulle part dans le modèle** | LOGI | — | Ouvrir un état de présence supplémentaire par case, symétrique de l'absence : `guests: {day, slot, count}` posé par un titulaire, additionné à `presence.servings` de CETTE case seule, écrit dans le bloc de présence (« two more people eat here on Saturday evening: cook for 6 »), et jamais dans… |
| 23 | **La casserole n'a pas de taille et la maison n'a pas de place** | LOGI | — | Ajouter deux questions à l'écran de la cuisine, une fois : le plus grand récipient (petit / moyen / grand faitout) et la place de conservation (peu / normale / large), en trois valeurs et jamais en litres — personne ne connaît le volume de son faitout. Le générateur en tire deux bornes… |
| 24 | **Deux titulaires du foyer aux objectifs opposés : seul celui qui appuie sur le bouton est entendu** | SOCI | — | Le commentaire du fichier le dit déjà : « qui parle pour la maison quand deux titulaires demandent des choses opposées est une DÉCISION PRODUIT ». Elle doit être prise et écrite : soit un seul `speaker` par foyer, désigné et modifiable (et les autres voient que leur ligne n'est pas appliquée),… |
| 25 | **Deux titulaires : l'envie de l'un écrase celle de l'autre sans trace** | SOCI | — | Trancher explicitement « qui parle pour la maison ». Sortie proposée : l'envie devient additive (deux phrases concaténées avec leur auteur, plafond partagé), et l'écran montre à Roxane ce que Karim avait écrit avant qu'elle n'écrive. Pour les items retenus, `speaksFor` inclut tous les `owner` du… |
| 26 | **Une boîte à un seul nom, à côté d'un bac partagé, dit l'objectif par sa forme** | SOCI | — | Décider produit : soit la boîte individuelle est la norme pour TOUT LE MONDE (chaque bouche a son couvercle, et la forme ne dit plus rien de personne), soit elle reste réservée aux objectifs et le produit l'assume par écrit dans l'écran d'onboarding du foyer. Ce qu'il ne faut pas faire, c'est… |
| 27 | **Deux titulaires demandent des choses opposées** | SOCI | — | Trancher produit, en une phrase : les items dont le sujet est `household` appartiennent au foyer et sont lus quel que soit l'auteur ; les items dont le sujet est l'auteur lui-même ne s'appliquent qu'à SA part. En attendant la décision, afficher au composeur ce que le plan N'A PAS appliqué (« Sofia… |
| 28 | **Le plan parle une seule langue à une table qui en parle deux** | SOCI | — | Décider produit : le plan reste composé dans UNE langue (recomposer en deux langues doublerait l'appel modèle et ferait diverger deux plans), mais les surfaces OPÉRATOIRES d'une bouche sont rendues dans la langue de SON compte quand elle en a une — traduction à l'affichage, jamais à la… |
| 29 | **Tout le foyer mange sous le coach du maître, sans l'avoir choisi et sans le savoir** | SOCI | — | Rendre la méthode visible et attribuée : sur le plan du foyer, une ligne dit sous quelle méthode il a été composé et de qui elle vient (« composé selon la méthode de <coach>, suivie par Karim »). Un adulte du foyer qui a SON propre coach doit voir explicitement que le plan commun ne suit pas le… |
| 30 | **Trois bouches, deux avis : le produit n'a aucune notion de majorité, et n'en veut peut-être pas** | SOCI | — | Confirmer ou renverser le refus du 2026-08-10, par écrit, en le confrontant au cas à trois. Sortie proposée, cohérente avec lui : le produit continue de ne JAMAIS arbitrer publiquement, mais il cesse de prétendre que tout le monde a été servi — le plan porte une ligne factuelle, sans jugement et… |
| 31 | **Le maître ne peut pas corriger le rythme d'un conjoint qui a un compte** | SOCI | partiel | Assumer et DIRE le partage : sur la fiche d'une bouche réclamée, remplacer le champ grisé par une phrase (« Marc gère lui-même ses horaires de repas ») et un rappel que le maître peut poser les absences. Le refus doit être rendu à l'endroit du geste, jamais dans une bannière lointaine. |

## 3.4 LE MOTEUR TRANCHE — 109

La règle se dérive des données. Pas d'opinion, pas de contexte.

### SÉCURITÉ  ·  21

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Un plancher TCA levé chez une bouche retire la cible de tous les autres** | SÉCU | — | Garder l'arbitrage d'indiscernabilité côté SORTIE (rien ne s'énonce, aucun chiffre ne sort) et le lever côté TRACE :… |
| 2 | **Un allergène nommé une seule fois vide la semaine entière du foyer** | SÉCU | — | Le verrou de sortie des contraintes dures cesse d'être binaire à l'échelle du plan. Sur une morsure : retirer LE plat mordant… |
| 3 | **Trois surfaces d'aliments nommés échappent à la ceinture de sortie** | SÉCU | — | `rendered` doit être construit par UNE fonction unique `allNamedFoodSurfaces(meal)` qui énumère exhaustivement les champs… |
| 4 | **Les contraintes `severity='strict'` sont affichées au modèle et vérifiées par rien** | SÉCU | — | Deux sorties possibles, il faut en choisir une et l'écrire : soit `strict` arme la ceinture au même titre que `medical` (et… |
| 5 | **Retirer puis réajouter une bouche efface ses allergies en silence** | SÉCU | — | Le retrait d'une bouche qui porte au moins une allergie doit refuser tant que l'écran n'a pas montré la liste et fait confirmer… |
| 6 | **Un allergène surchargé par les formes de surface bloque tout le foyer** | SÉCU | — | Garder le sur-blocage (sous-bloquer sert l'allergène), mais l'écran doit MONTRER ce qui a été déduit au moment de la saisie : «… |
| 7 | **Le prompt promet à un enfant sa boîte pesée à lui** | SÉCU | — | `weighedPortionMembers` doit filtrer sur la même porte que `memberTargetFactor` : `goal ∈ {fat_loss, muscle_gain}` ET… |
| 8 | **Une baisse de portion nommément adressée à un enfant n'est filtrée par rien** | SÉCU | — | Un `portion.adjust` de direction `down` doit être refusé sur une bouche mineure ou d'âge inconnu, sujet explicite COMPRIS, avec… |
| 9 | **L'enveloppe pédiatrique est contournée par une porte ouverte, pas fermée** | SÉCU | — | Appeler `goalApplies({ageState, goal})` avant `envelopeFor` dans `generate-household-meal-v1`, et faire passer une bouche… |
| 10 | **La phrase de brouillon d'un titulaire gouverne la casserole d'une bouche sous plancher TCA** | SÉCU | — | La garde TCA de la phrase de brouillon doit lire l'union du foyer : si UNE bouche à table porte un plancher levé, toute phrase… |
| 11 | **Une bouche tenue hors de tout ne se compte nulle part** | SÉCU | — | Sortir une bouche du dénominateur d'un taux de couverture est interdit quand la raison de sa sortie est un REFUS. Ajouter… |
| 12 | **La phrase lue à table n'est scannée par rien** | SÉCU | — | Quand une bouche est retirée d'un contenant par la ceinture de régime ou par le verrou des règles de maison, sa `portion_note`… |
| 13 | **L'allergie d'un enfant est présentée au composeur comme la sienne** | SÉCU | — | L'attribution d'une contrainte dure à sa bouche ne dépend pas du nombre de bouches composées : dès qu'il existe PLUS D'UNE… |
| 14 | **Deux personnes qui partagent un prénom sont indiscernables dans sept blocs de décision** | SÉCU | — | Tout bloc qui porte une décision sur une personne écrit `<prénom> (<member_id>)`, pas `<prénom>`. Coût en tokens accepté : c'est… |
| 15 | **La règle d'arbitrage du message n'est plus en position de récence sur la lane foyer** | SÉCU | — | Le `PRECEDENCE_BLOCK` est réinjecté en DERNIÈRE position du message foyer assemblé, après le suffixe, et son rang n°1 cesse de… |
| 16 | **Riz et produits de la mer : la règle stricte est dans le prompt, la garde est grossière** | SÉCU | — | Deux seuils, pas un : `MAX_FRIDGE_DAYS = 3` par défaut, `MAX_FRIDGE_DAYS_TIGHT = 1` pour toute préparation dont un ingrédient… |
| 17 | **Le plancher des troubles alimentaires est armé sur une seule surface libre du foyer, sur quatre** | SÉCU | — | Le scan des voix devient une fonction unique appliquée à TOUT texte libre de foyer avant qu'il n'entre dans un prompt : envie de… |
| 18 | **Un mineur en prise et un adulte en prise : correctement traité, et par un autre chemin que celui que le…** | SÉCU | OUI | Réparer le COMMENTAIRE, pas le code : la garde tient, mais elle tient ailleurs. Écrire au-dessus d'index.ts:5320 quel prédicat… |
| 19 | **Un plancher TCA sur une bouche désarme le dimensionnement de toute la table, sans un mot** | SÉCU | partiel | Garder l'indiscernabilité (elle protège Sonia) mais rendre au composeur UNE phrase fixe, toujours la même, servie aussi dans des… |
| 20 | **Une seule mention d'allergène vide la semaine entière du foyer** | SÉCU | partiel | Garder le fail-closed (la sécurité ne se négocie pas) et lui donner une issue : relance obligatoire nommant l'aliment et le plat… |
| 21 | **Une bouche sous plancher TCA fait perdre le dimensionnement à toute la table** | SÉCU | partiel | Garder l'indiscernabilité VERS L'UTILISATEUR et la lever DANS LA TRACE : `generated_from.household.lane_mode_reason` avec une… |

### RÉGIME  ·  12

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Une bouche à qui la ceinture de régime retire son bac finit le repas à zéro, et rien ne le compte** | RÉGI | — | Un compteur d'abord, une réparation ensuite. ① `mouths_left_hungry` : une bouche tenue hors de TOUS les contenants d'un repas… |
| 2 | **La divergence de régime est éteinte sur tout chemin de fusion, sans qu'aucun commentaire ne le dise** | RÉGI | — | Soit l'arbitrage est voulu et il s'écrit au-dessus de la ligne (une fusion reprend UNE personne : elle a déjà son plat, en… |
| 3 | **La ceinture de régime retire la bouche et ne compose aucun remplacement** | RÉGI | — | Une bouche que la ceinture retire de TOUS les contenants d'un repas doit produire une conséquence visible et une réparation :… |
| 4 | **`lean_protein` est indécidable : un plat de viande maigre ne mord jamais** | RÉGI | — | Un groupe indécidable ne peut pas être traité comme un groupe propre. Trois sorties possibles, à choisir : (a) scinder… |
| 5 | **R5 n'est armé que sur le végane et que sur muscle_gain** | RÉGI | — | Écrire l'arbitrage tel qu'il est, ou l'élargir — mais pas laisser le lecteur le dériver de `ANIMAL_PROTEIN_ANCHORS`. Si… |
| 6 | **Deux ordres contradictoires dans le même prompt : `one_dish` + plat dédié de régime** | RÉGI | — | Quand une divergence de régime existe, la ligne de forme de cuisine ne peut plus dire « Do NOT propose separate dishes ».… |
| 7 | **Une fusion de foyers éteint tous les plats dédiés de régime, sans un mot** | RÉGI | — | Soit R5 vaut aussi sur un chemin de fusion (le régime est une impossibilité, pas une préférence, et une fusion ne change pas ce… |
| 8 | **La bouche la plus stricte absente toute la fenêtre : le plan n'est pas mangeable si elle rentre** | RÉGI | — | Nommer l'effet de bord dans le plan, pas seulement dans le code : quand une bouche absente toute la fenêtre porte un régime plus… |
| 9 | **« Un seul plat » demandé pendant qu'une divergence de régime existe** | RÉGI | — | Choisir, une fois, et l'écrire dans le prompt : l'impossibilité prime sur la préférence d'effort (c'est déjà la décision du… |
| 10 | **Un seul végétarien impose le végétarien à toute la table, sans plat dédié possible** | RÉGI | — | Écrire l'arbitrage à l'endroit où il se prend (`regimeCapsProtein`), en toutes lettres : « un régime ne plafonne la protéine que… |
| 11 | **Le classement des régimes n'a de sens que parce qu'ils sont emboîtés, et le produit n'a aucune règle pour…** | RÉGI | — | Remplacer « le plus strict » par « l'UNION des exclusions » : la casserole commune suit `union(excludedGroupsFor(d)) pour tout d… |
| 12 | **R5 n'ouvre un plat dédié que pour un végane en prise de masse — et pour personne d'autre** | RÉGI | partiel | Écrire l'arbitrage là où il se dérive : au-dessus de `regimeCapsProtein`, nommer en toutes lettres que le végétarien et le… |

### OBJECTIF  ·  19

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Deux objectifs opposés fondus dans un bac à plusieurs noms : les deux cibles disparaissent** | OBJE | — | Le nombre de contenants demandé au modèle se calcule sur les CIBLES, pas sur les corps : `weightGroupCount` doit prendre… |
| 2 | **Le facteur d'un seul JOUR gouverne toute la semaine, et c'est le jour le moins ambitieux qui gagne** | OBJE | — | `sizeBoxesFromTarget` descend au niveau du REPAS : `factors` devient `ReadonlyMap<'<memberId> <day>', number>` — la clé que… |
| 3 | **Deux échelles de facteur à la même table : absolue chez l'une, relative chez l'autre** | OBJE | — | Nommer l'échelle dans la trace et la borner : `generated_from.household.box_sizing.scale_by_member` porte `'absolute' /… |
| 4 | **Un foyer de corps très différents, tous en maintenance : personne ne reçoit de part chiffrée** | OBJE | — | Les deux interrupteurs doivent porter sur la MÊME population. Un bac nominatif s'ouvre dès que `sizingFactors` de cette bouche… |
| 5 | **Le brief promet à chacun ses grammes exacts, et la fonction qui les attachait n'existe plus** | OBJE | — | Un compteur `mouths_without_a_figure` : par repas, une bouche qui n'a ni bac nominatif chiffré ni part chiffrée sur un couvercle… |
| 6 | **L'ancrage lit `members` là où toute la cascade lit `platedMembers`** | OBJE | — | Une seule population par cascade : `householdAnchors(platedMembers, ...)`. La règle générale à écrire une fois, en tête du… |
| 7 | **Rien de tout le dimensionnement n'est vérifiable après coup : aucune trace persistée** | OBJE | — | `generated_from.household` porte un bloc `sizing` obligatoire, écrit AVANT tout `return` (le patron du journal `dietary_regime`,… |
| 8 | **Le levier amont existe, est calculé, et n'a aucun appelant** | OBJE | — | Brancher dans cet ordre, jamais l'inverse : ① `sizeBoxesFromTarget` remonte `potShrink` par bouche-jour dans `BoxSizingResult`… |
| 9 | **Deux objectifs opposés fondus dans un bac à deux noms** | OBJE | — | `weightGroupCount` doit compter sur le facteur COMPLET (corps × objectif), pas sur la part de fiche seule. Et après composition,… |
| 10 | **Le rabot de casserole descend l'assiette de celui qui perd pour l'arithmétique du gourmand** | OBJE | — | Faire remonter le rabot par bouche-jour hors de `sizeBoxesFromTarget` (aujourd'hui variable locale clée par `preparationId`,… |
| 11 | **Deux échelles de facteur multiplient la même casserole au même repas** | OBJE | — | Dimensionner la casserole avec `householdAppetite()` (qui existe, est journalisé, et porte `steering: false` en… |
| 12 | **Un foyer de corps différents tous en maintenance ne reçoit aucun chiffre nulle part** | OBJE | — | Les deux interrupteurs de l'uniformité doivent lire la MÊME population. Choisir `weighedPortionMembers` (les objectifs) comme… |
| 13 | **Une bouche qui a pris la main pèse encore sur le dimensionnement** | OBJE | — | Nourrir `householdAnchors` avec `platedMembers`, comme les cinq autres consommateurs de la cascade. Écrire un test de propriété… |
| 14 | **Deux objectifs opposés fondus dans un même bac** | OBJE | — | Compter les groupes de poids sur le facteur FINAL (corps × objectif, ou ancrage), pas sur la part de fiche. Et ajouter une garde… |
| 15 | **Le rabot du récipient descend l'assiette de celui qui perd, pour l'arithmétique du gourmand** | OBJE | — | Appliquer le levier AMONT d'abord : quand la demande dépasse le récipient, augmenter `readyGrams` de la préparation (c'est ce… |
| 16 | **Un foyer de corps différents mais tous en maintenance ne reçoit aucun chiffre** | OBJE | — | Faire porter l'uniformité par UN seul interrupteur (le même prédicat pour la phrase de table et pour les boîtes), retirer du… |
| 17 | **Un objectif atteint ne s'arrête jamais tout seul** | OBJE | — | À chaque composition, comparer le poids connu à `target_weight_kg` : atteint ou dépassé dans le sens de la direction ⇒ la… |
| 18 | **La casserole est dimensionnée au compte de têtes pendant que les assiettes sont dimensionnées aux corps** | OBJE | partiel | La production de la casserole est `Math.max(headcount_min, ceil(sum(sizingFactors) × servingsPerMouth))`, calculée sur les… |
| 19 | **Deux bornes opposées sur la même question : le facteur hors bornes est raboté ici, refusé là** | OBJE | partiel | Un seul arbitrage, écrit une fois : hors bornes ⇒ on rend `1` et on NOMME le motif. Le rabotage ne se garde que là où il est… |

### NUTRITION  ·  18

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Le facteur est un scalaire unique : la COMPOSITION visée (protéine / féculent / légume) ne bouge jamais** | NUTR | — | Le facteur devient un vecteur par AXE, pas un scalaire : `{protein, starch, vegetables}`, dérivé de… |
| 2 | **Planchers protéiques opposés par kilo, une seule casserole** | NUTR | — | Écrire `mouthVerdictFor(memberId)` : un verdict par BOUCHE sur la lane foyer, calculé sur ce que sa boîte lui donne réellement… |
| 3 | **Le plafond de récipient rabote la part de celle qui perd pour l'arithmétique de celui qui prend** | NUTR | — | Deux gestes, dans cet ordre. ① `BoxSizingResult` rend `potShrink: Map<'<memberId> <day>', number>` — le rabot vu par BOUCHE, pas… |
| 4 | **Un shaker chez l'un, rien chez l'autre : le shaker ne compte dans aucune énergie** | NUTR | — | `mouthDayEnergy` prend un paramètre REQUIS `fixedIntakeInputs: ReadonlyMap<memberId, CompositionInput[]>` (jamais optionnel — un… |
| 5 | **Le plafond de 8 apports fixes est partagé par tout le foyer** | NUTR | — | Le plafond de PROMPT ne doit pas décider de ce qui compte dans une CIBLE. Deux canaux : (a) le prompt garde `MAX_FIXED_INTAKES`… |
| 6 | **Un seul régime strict prive toute la table d'un nutriment, sans un mot** | NUTR | — | Le trou STRUCTUREL se calcule sur le régime SERVI, pas sur le régime déclaré :… |
| 7 | **L'exclusion d'un seul retire l'aliment de toute la table, y compris son drapeau nutritionnel** | NUTR | — | Écrire `sentinelsLostBy(labels, index)` : au moment où une règle de maison est chargée, on résout ses libellés contre l'index de… |
| 8 | **L'ancre protéique est vérifiée par PLAT, jamais par BOUCHE** | NUTR | — | L'ancre se vérifie sur le CONTENANT, pas sur le plat : pour chaque bac, résoudre ses `items[]` (le `preparation_id` donne… |
| 9 | **Une bouche qui ne déclare que des moments de poids nul reçoit une journée entière dans un goûter** | NUTR | — | `SLOT_DAY_WEIGHT` couvre les SIX `EATING_OCCASIONS` (meal_generation.ts:166-173) : breakfast 0,22 / snack_am 0,05 / lunch 0,35 /… |
| 10 | **Une collation composée EN PLUS des trois repas sous-dimensionne les repas principaux** | NUTR | — | Corollaire direct du point précédent : la même table de poids doit servir aux deux côtés du rapport. Tant que `SLOT_DAY_WEIGHT`… |
| 11 | **Une bouche qui ne déclare qu'un goûter reçoit une cible de journée entière** | NUTR | — | `SLOT_DAY_WEIGHT` doit couvrir les six `EATING_OCCASIONS` (poids proposés : breakfast 0,22 / snack_am 0,05 / lunch 0,34 /… |
| 12 | **Le shaker d'une bouche ne compte pas dans son énergie livrée** | NUTR | — | `mouthDayEnergy` doit sommer les apports fixes de la bouche pour le jour considéré avant de rendre `day.kcal`, sur la lane foyer… |
| 13 | **Une bouche qui ne déclare que des collations reçoit un facteur au plafond** | NUTR | — | Donner un poids aux six moments d'`EATING_OCCASIONS` (snack_am 0,05 / snack_pm 0,10 / before_bed 0,05, les trois repas… |
| 14 | **Le shaker d'une bouche n'entre ni dans le verdict, ni dans son énergie** | NUTR | — | Brancher `fixedIntakeInputsFor` sur la lane foyer, PAR BOUCHE, et additionner les kcal des apports fixes à… |
| 15 | **Le corps d'une bouche sans compte ne vieillit jamais et n'est jamais redemandé** | NUTR | — | Un corps a un âge, et il se lit : au-delà de `BODY_STALE_DAYS` (90 pour un adulte, 30 pour un mineur, qui grandit),… |
| 16 | **Le déjeuner à la cantine d'un enfant est traité comme un repas juste, cinq jours sur cinq** | NUTR | — | Nommer l'hypothèse et la borner : un repas hors maison est compté comme « une part de table ordinaire pour cette bouche », le… |
| 17 | **Le bilan de la semaine juge le plan d'une table comme s'il était le repas d'une personne** | NUTR | — | Le bilan hebdomadaire d'un compte qui compose pour un foyer doit lire SA ligne de `member_portions`, jamais le plan entier — la… |
| 18 | **Le plafond physique par repas mord avant tout le reste, sans se nommer** | NUTR | partiel | `AnchorFactor.reason` gagne `physical_max` comme motif à part entière, distinct de `clamped`. Et quand ce motif sort, la… |

### GOÛT  ·  5

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Un dégoût d'une bouche retire l'aliment de l'assiette de tout le monde — ou tue le plan** | GOÛT | — | Aligner la consigne et le verrou sur le même geste. Le plus sûr et le plus proche du modèle produit : le verrou devient PAR… |
| 2 | **Le verrou des règles de maison ne voit jamais les préparations** | GOÛT | — | `applyHouseRuleLock` doit recevoir, pour chaque plat, les ingrédients des préparations qu'il utilise… |
| 3 | **Un dégoût déclaré par le canal `dislike` est une consigne de prompt nue** | GOÛT | — | Un même dégoût ne peut pas avoir trois forces selon le canal de saisie (`household_food_restrictions` = verrou dur ;… |
| 4 | **Aucune mémoire d'un plan au suivant : la variété est un mot du prompt, jamais une mesure** | GOÛT | — | Lire, pour le foyer, les `dishes[].title` des N derniers plans vivants (la table les porte déjà, la lecture est un `select` de… |
| 5 | **Une règle de maison posée pour une personne retire l'aliment à toute la table, sans un mot** | GOÛT | partiel | Aligner le verrou sur le prompt, pas l'inverse : porter `applyHouseRuleLock` au niveau du CONTENANT, comme la ceinture de régime… |

### RYTHME  ·  7

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Un apport fixe ne peut jamais prendre un moment, donc il s'ajoute au repas au lieu de le remplacer** | RYTH | — | Séparer les deux questions. La case du MOMENT reste ouverte pour la table (comportement actuel, conservé). Mais la bouche dont… |
| 2 | **Une absence ne retire l'assiette que si elle dure toute la fenêtre** | RYTH | — | `member_portions[]` doit porter les cases absentes de la bouche (`absent_cells: [{day, slot, kind}]`), et l'écran doit les… |
| 3 | **La grille de présence du foyer monte le rythme du titulaire pour chaque bouche** | RYTH | — | Passer `member.eatingSlots ?? rhythm` à la grille de `/app/household`, comme `SetupPage` le fait déjà, et lui brancher… |
| 4 | **Le jour de batch du maître tombe un jour où la maison n'est pas là** | RYTH | — | La garde `batch_cook` doit croiser la présence : un jour de batch entièrement déserté est retiré de l'exigence, et la trace dit… |
| 5 | **Trois bouches sur quatre ont leur propre petit-déjeuner, on cuisine quand même pour quatre** | RYTH | — | `resolveWindowPresence` doit retirer d'une case (jour, moment) toute bouche marquée `own_usual` à ce moment-là, exactement comme… |
| 6 | **Toutes les bouches ont leur propre repas au même moment** | RYTH | — | Quand `ownMealSlots` couvre TOUTES les bouches composées d'une case, retirer la case du plat commun (aucun plat de table à ce… |
| 7 | **La grille de présence d'une bouche montée sur le rythme de quelqu'un d'autre** | RYTH | — | Passer `m.eatingSlots ?? rhythm` comme sur l'entonnoir, et brancher `onSaveMarks` pour rendre le troisième état. Rendre le… |

### LOGISTIQUE  ·  17

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **`cooking_shape: one_dish` demandé pendant qu'une divergence de régime existe : deux ordres contraires dans…** | LOGI | — | La forme demandée ne peut pas plafonner une IMPOSSIBILITÉ. Quand `capped === true` et que `divergingMembers.length > 0`, le… |
| 2 | **La tolérance de somme laisse servir 10 % de plus que ce que la casserole produit** | LOGI | — | La tolérance existe pour absorber l'imprécision du modèle sur `preparationReadyGrams`, pas pour ouvrir un crédit de nourriture.… |
| 3 | **Tout le monde a son propre repas à ce moment-là, et le moteur cuisine quand même pour la table** | LOGI | — | Quand `ownMealBearers` couvre TOUTES les bouches présentes sur une case, la case sort de la grille du plan comme un… |
| 4 | **L'écran promet une gamelle transportable et bonne froide, le prompt ne le sait pas** | LOGI | — | Faire lire `household_members.work_lunch` par le générateur et écrire, dans le bloc de présence, une consigne par bouche : « Le… |
| 5 | **Une tradition tombe sur une case que personne ne mange** | LOGI | — | `traditionsInWindow` doit prendre un troisième argument REQUIS (les cases désertées, telles que `resolveWindowPresence` les… |
| 6 | **Pas de congélateur, et un lot qui ne tient pas la fenêtre** | LOGI | — | La garde de conservation doit recevoir l'équipement. Sans congélateur, aucune issue « surplus au congélateur » n'est acceptable… |
| 7 | **La casserole est cuisinée pour le pic de la semaine, tous les jours** | LOGI | — | Garder le maximum comme dimensionnement (l'arbitrage est bon) et ajouter la moitié manquante : quand `presence.servings >… |
| 8 | **Une gamelle : l'écran promet, la consigne se tait** | LOGI | — | Brancher `parseWorkLunch` sur le générateur foyer et écrire deux lignes de consigne armées par la déclaration : « <prénom>… |
| 9 | **La règle d'arbitrage du message est enterrée sous quatorze blocs sur la lane foyer** | LOGI | — | Réinjecter le `PRECEDENCE_BLOCK` en DERNIÈRE position du message foyer assemblé (avant le seul bloc de langue), et y nommer les… |
| 10 | **Un plan personnel qui ne recouvre qu'une partie de la fenêtre fait cuisiner deux fois pour la même bouche** | LOGI | — | La prise de main devient une absence PAR CASE, pas par personne : les jours couverts par le plan personnel de Marc sortent de sa… |
| 11 | **Une recomposition en cours de fenêtre change le dîner des autres sans un mot** | LOGI | — | Toute composition qui REMPLACE un plan de foyer déjà vivant et déjà entamé (au moins un jour passé, ou une session de cuisine… |
| 12 | **Le jour de batch et le seuil serré du riz s'excluent l'un l'autre** | LOGI | — | La règle serrée porte sur la CONSOMMATION, pas sur la production : un batch de riz est licite si chaque plat qui y puise est… |
| 13 | **Nul ne dit dans quel ordre la casserole se vide, donc celui qui mange en dernier paie l'erreur** | LOGI | — | Le tirage se vérifie en CUMULÉ et dans l'ordre chronologique des cases : à chaque (jour, moment), le reste de la préparation est… |
| 14 | **Une bouche retirée du foyer garde son assiette dans le plan vivant, et une bouche ajoutée n'en a pas** | LOGI | — | Toute mutation du roster pendant qu'un plan du foyer est vivant écrit un avis sur le plan (le tuyau des avis de fusion existe) :… |
| 15 | **L'équipement absent n'est qu'une consigne de prompt** | LOGI | partiel | Ajouter une passe déterministe `applyKitchenLock` sur `preparations[].method`, `dishes[].method` et… |
| 16 | **Une session de cuisine déborde le temps que la personne a ce soir-là** | LOGI | partiel | Au-delà de `cookingTimeMin + 10`, ne pas se contenter d'une `issue` : relancer une fois avec la phrase « session on <day> was… |
| 17 | **Huit apports fixes pour tout le foyer** | LOGI | partiel | Faire du plafond une fonction du nombre de bouches composées (`min(16, 2 + 2 × bouches)`) et, surtout, rendre la coupe VISIBLE :… |

### BUDGET  ·  2

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **Le plafond de huit apports fixes est partagé par tout le foyer** | BUDG | — | Un plafond de prompt partagé doit être visible à la saisie : l'écran affiche « 2 lignes restantes pour ce foyer » et refuse la… |
| 2 | **Le prix existe depuis le 21 août, et l'ordre de sacrifice du budget mord d'abord la bouche qui a le plus…** | BUDG | — | Brancher la grille de prix comme un CONSTAT avant d'en faire une contrainte : coût estimé de la liste de courses, coût attribué… |

### SOCIAL  ·  8

| # | conflit | fam. | existe | la règle à écrire |
|---|---|---|---|---|
| 1 | **La part de chaque bouche est lisible par tout le foyer, la garde est à l'écran** | SOCI | — | Rendre la garde côté serveur : une RPC `keel_household_meal_for_me(meal_id)` qui rend les plats communs + la SEULE ligne de… |
| 2 | **`portion_note` ne filtre ni le régime, ni la contrainte médicale** | SOCI | — | Étendre la surface d'`applyKeelOutputLocks` à `portion_note` avec la tolérance de négation ARMÉE (sans elle, « keep the sesame… |
| 3 | **Un second maître écrase l'envie du premier, sans trace** | SOCI | — | Ne plus écraser : garder une ligne par (household_id, week_start, author_id) et concaténer les phrases dans le bloc d'envie,… |
| 4 | **Deux personnes, un seul prénom, sept blocs de décision** | SOCI | — | Désambiguïser à la source : quand deux bouches composées partagent un prénom (comparaison insensible à la casse et aux accents),… |
| 5 | **Celui qui a gagné l'arbitrage la semaine dernière le regagne cette semaine** | SOCI | — | Persister, par plan, quelle voix a été honorée : `generated_from.household.voices_served: [member_id]` (le modèle le déclare, un… |
| 6 | **Une fenêtre à cheval sur deux semaines ISO perd l'envie de la seconde** | SOCI | — | Lire TOUTES les lignes d'envie dont la semaine ISO intersecte la fenêtre (une ou deux), et les servir au modèle datées : « for… |
| 7 | **La tradition n'a pas été honorée et le foyer n'en sait rien** | SOCI | partiel | Ne rendre à l'écran QUE le verdict matcher-free : quand la case d'une tradition est vide, afficher « Vendredi soir n'a pas été… |
| 8 | **Le `why` d'un plat nomme un régime, et parfois épingle la mauvaise bouche** | SOCI | partiel | Ne rendre le `why` d'un plat qu'à la bouche qu'il sert (ou au maître), jamais dans une vue lue par toute la table — c'est déjà… |

---
---

# PARTIE 4 — CE QUI RESTE OUVERT

1. **Les seuils du curseur.** « 1 + 1 » et « autant que demandé » sont une
   proposition. Combien de préparations un foyer accepte-t-il réellement ? À
   mesurer, pas à décider.
2. **La garde en base du mineur** (D4) — le champ retiré du front suffit-il, ou
   ferme-t-on les quatre surfaces ?
3. **La contamination croisée.** Aucune règle n'existe nulle part dans le dépôt.
   Dès qu'un plat dédié coexiste avec une contrainte `severity='medical'`, il faut
   une consigne — *« ni la même poêle, ni la même planche, ni la même eau de
   cuisson »*.
4. **`edibleGroupsAt`** — l'intersection effective des interdits, calculée **avant**
   de dépenser l'appel modèle. Aujourd'hui rien ne mesure qu'une union puisse vider
   l'espace alimentaire.
5. **Le champ `tradeoff`** — l'arbitrage annoncé par le modèle est aujourd'hui
   effacé par la passe « commentaire ». Il lui faut un champ à lui, hors du `why`,
   avec son compteur.
6. **La fixture obligatoire** (§2.3) — sans elle, tout ce document reste une
   lecture.
