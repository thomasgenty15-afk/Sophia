# Campagne « 9 points » — rapport

> 2026-09-04, 17 h → 21 h. Branche `ff-001-quotidien-du-coach`.
> **9 générations réelles** de plan de foyer + 1 solo, 4 foyers de test, **6 lots livrés**
> (A, B, D, G, H, I). Journal détaillé : `JOURNAL.md`.
> Aucun commit, aucune migration, rien de poussé.
>
> ⚠️ **Deux verdicts ont été corrigés en fin de soirée** (points 3 et 7), par
> relecture des compteurs sans générer. Les lignes du tableau portent la version
> corrigée ; le détail et la cause de l'erreur sont en bas du document.

---

## Les 9 points, un verdict chacun

| # | Ce qui était demandé | Verdict | Preuve |
|---|---|---|---|
| **1** | 1 course + 2 sessions ⇒ « à congeler » sur la liste | 🔴 **Le couplage est à l'envers, et la marque n'existe pas** | 9 plans, 9 fois zéro champ. `sessions ≤ courses` dans le code : une course donne UNE session, jamais deux |
| **2** | Le style et le nombre de courses dits dans le plan | ✅ | Dits au cas nominal ET sur chaque plafond, avec le motif. 6 plans sur 6 |
| **3** | Barquettes à 1 / 2 / 3+ personnes | ✅ **à 1, 2, 4 et 5** ⟳ verdict corrigé le soir même | **zéro boîte oubliée** sur 10 plans. Des 46 cases manquantes : 34 sont des retraits de ceinture, 12 un dénominateur qui surcompte. Mes ratios d'origine divisaient deux nombres non comparables |
| **4** | Session unique 7 j ⇒ dire quelles barquettes congeler | 🔴 → **LOT D LIVRÉ** | rien ne le disait ; un plan réel portait 12 boîtes concernées |
| **5** | kcal par repas, cohérentes, pour qui a un objectif | 🔴 **les deux moitiés** | solo : 1 379 kcal/j servis pour une cible 2 059–2 175. Foyer : 4 721 pour 8 618. **Aucune mesure par bouche n'est possible** |
| **6** | Allergies / dégoûts / régimes respectés | ✅ allergies · 🔴 dégoûts | œuf 0, arachide 0 sur tout un plan. Mais un plat SANS boîte échappe à la ceinture, et deux faux positifs → **LOT G LIVRÉ** |
| **7** | Une minorité de régime ne pénalise pas le foyer | 🔴 ⟳ **verdict durci le soir même** : le modèle écrit des ITEMS propres mais **ne sépare pas la casserole** | 1 foyer sur 5 sépare vraiment (12/12) ; les 4 autres à 0/10, 0/6, 1/13, 6/9. La ceinture retire, **et elle a raison** |
| **8** | Délai de courses le jour même | ✅ **LOT B LIVRÉ ET PROUVÉ EN RUN RÉEL** | à 12 h le déjeuner tombe, avec sa propre phrase ; le dîner reste |
| **9** | Explication IA de l'aperçu | ✅ **LIVRÉ ET PROUVÉ EN RUN RÉEL** | voir ci-dessous |

---

## Le point 9 — livré, et il marche

Décor monté exprès : le foyer demande des raviolis aux champignons, et Julie
n'aime pas les champignons. Ce que le plan affiche maintenant dans l'aperçu,
au-dessus des phrases fixes, sous le titre « Les choix de Sophia » :

> **La demande de raviolis aux champignons est gardée pour la table, avec des
> raviolis aux épinards dans l'autre boîte afin que chaque assiette reste
> compatible.**

C'est le modèle qui l'écrit, dans la langue du plan, sur l'arbitrage qu'il a
fait. Compteur du run : `asked: true · declared: 1 · kept: 1 · refused: null`.

**Ce qui le garde** — cinq portes, la première qui mord jette le bloc entier et
nomme le motif : jamais un kcal ni un gramme, jamais une phrase qui culpabilise,
jamais une règle de maison (**même niée** : la phrase qui a motivé le verrou
était « …SANS NUTELLA »), jamais un prénom collé à un nombre ou à un fait de
corps. Les phrases déterministes restent et sortent quoi qu'il arrive : elles
sont le plancher.

**Ce qui empêche les deux textes de se contredire** : le modèle reçoit, AVANT de
composer, les faits déjà tranchés (fenêtre, sessions, jours hors de portée,
ligne de régime, sens du plan) et la consigne de ne pas les redire. On donne le
fait avant la génération plutôt que de coller une phrase après.

⚠️ **Ce qui reste à régler** : il a écrit **une** ligne, pas huit, et la moitié
« éducation » que tu demandais n'y est pas. Le mécanisme est prouvé, la richesse
est un réglage de consigne. Les compteurs `declared`/`kept` sont là pour le
mesurer sur plusieurs tirages avant d'y toucher.

---

## La trouvaille la plus importante — le moteur défait ce que le modèle réussit

C'est le point 7, et je m'étais d'abord trompé.

**Ce que j'ai cru** : « le même foyer donne 12 séparations sur 12, puis 0 sur 10,
à quatre minutes d'écart — donc le modèle est instable ».

**Ce qui est vrai** : la ceinture **retire le nom de la bouche avant que la
réponse ne soit écrite**. Sur le plan rendu, une personne écartée n'apparaît sur
aucune boîte — et « le modèle n'a rien composé pour elle » devient indiscernable
de « le moteur le lui a retiré ». Je mesurais le moteur en croyant mesurer le
modèle.

En relisant la sortie brute du modèle :

| | ce que le modèle a écrit | ce que le moteur en a fait |
|---|---|---|
| foyer vegan (4) | **10 boîtes au tofu, zéro produit animal** | 10 retirées |
| foyer végétarien (5) | **13 boîtes propres** | 12 retirées |
| dégoût champignons (2) | **2 boîtes aux épinards** | 2 retirées |

**Le modèle réussit à chaque fois.** Ce qui varie, c'est comment il organise ses
casseroles : quand il cuit les deux protéines dans **une seule fiche** — une
plaque, le poulet d'un côté, le tofu de l'autre, ce que fait un vrai cuisinier —
la ceinture lit la fiche entière, y trouve « poulet », et retire la végane de sa
propre boîte au tofu.

⛔ **Et sur un des plans, le produit dit ensuite une chose fausse** : « Julie
garde sa part vendredi au dîner : c'était ça ou pas de repas. » C'est faux — un
autre repas était composé pour elle, dans une boîte que le moteur venait de
supprimer. Le produit affirme une impossibilité qu'il a lui-même fabriquée.

Une session voisine a mesuré exactement le même défaut sur un quatrième foyer
(60 boîtes propres sur 89). **Le lot correctif est chez elle**, et l'arbitrage a
été tranché : le prompt exigera une préparation à part, et la relance nommera le
lien fautif.

---

## Le second défaut majeur — le congélateur déclaré rend le plan pire

Même foyer, trois minutes d'écart :

| | sessions | jours servis |
|---|---|---|
| 1 course **avec** congélateur | 1 | **3 sur 7** — lundi à jeudi entièrement vides, 24 créneaux |
| 1 course **sans** congélateur | 2 | **7 sur 7** |

Le moteur accorde la session unique et l'annonce : « ce qui ne tiendrait pas au
frais part au congélateur ». Le modèle écrit la congélation **sept fois en
prose** (« congeler les portions de lundi à jeudi », « sortir la boîte la
veille ») — et met `"kept": "fridge"` sur les 30 liens. La garde de fraîcheur
lit la clé, pas la prose, et jette tout au-delà de trois jours.

**La personne lit la promesse du congélateur et le constat des quatre jours
vides, à trois lignes d'écart.**

---

## Ce qui a été livré et prouvé

| Lot | Ce que ça ferme | Épreuves |
|---|---|---|
| **A** — l'explication du modèle (point 9) | l'aperçu n'expliquait aucun arbitrage | 15 + 6 + 7 + 9 tests · 8 mutations rouges · **3 runs réels** |
| **B** — le délai de courses (point 8) | à 19 h le produit servait un dîner qu'aucun magasin ne pouvait fournir | 11 tests · 5 mutations rouges · **2 runs réels, dont un qui a trouvé un défaut** |
| **D** — le Boxing dit quoi congeler (point 4) | on demandait de sortir une part que personne n'avait rangée | 8 tests sur le rendu · 3 mutations rouges |
| **G** — l'homographe (point 6) | « remplir des moules » lu comme des coquillages ; « étaler la pâte » comme du pâté | 6 tests · 1 mutation à 4 rouges |

`./scripts/agent-gate.sh` : **pass** — **5 404 tests serveur**, 2 320 tests écran,
0 rouge, typecheck vert, eslint vert.

---

## Ce qui reste ouvert, avec sa cause

1. **La sous-alimentation** : 55 % à 67 % de la cible que le produit calcule
   lui-même. Le moteur le compte (`unmet_band`, `clamped`) et rien ne l'atteint.
3. **Le dégoût n'est vérifié que sur les repas mis en boîte** — 6 sur 30 sur un
   plan.
4. **Les barquettes manquent à partir de 4 bouches** : 42/48, 24/27, 6/24, 39/51.
5. **Dix à douze lignes de rationale identiques** quand une bouche manque
   plusieurs repas.
6. **`retried: false` ment** — une relance payée et rejetée se lit « aucune
   relance ». Corrigé par la session voisine.
7. **Le corps du titulaire** : 22 foyers sur 58 n'ont pas de fiche, et 15 sur 38
   en ont une que le chargeur ignore. Trou nommé, non réparé.

---

## Deux décisions qui t'attendent

1. **Point 1** — le couplage `sessions ≤ courses` est l'inverse de ta règle. Le
   corriger veut dire : les courses ne plafonnent plus les sessions, et le cru
   des sessions suivantes se marque « à congeler à l'achat ». C'est le lot le
   plus gros, il touche le moteur, la liste, le PDF et l'écran.
2. **Point 5** — tu as tranché que les kcal s'affichent dès qu'il y a un objectif,
   peu importe qui regarde. Aujourd'hui **aucune mesure par bouche n'est
   possible** : le calcul s'abstient sur tout plat sans boîte et sur tout bac
   commun. Il faut donc d'abord réparer les barquettes (point 3), sinon le lot
   d'affichage n'aura rien à afficher.

---

## Le point 8 — livré après le rapport initial, et le run a trouvé un défaut

Le produit servait un déjeuner à midi, un goûter à 16 h, et **un dîner à 19 h
alors que les magasins ferment à 18 h**. Il n'existait qu'une question — « ce
moment est-il derrière nous ? » — et personne ne posait la seconde : « reste-t-il
le temps d'aller acheter et de cuisiner avant ? »

Ce que le plan dit maintenant, à midi, sur un run réel :

> « Pour aujourd'hui, le petit-déjeuner n'est plus au plan : la journée est déjà
> entamée. »
> « Pour aujourd'hui, le déjeuner n'est pas au plan : **il faut le temps de faire
> les courses avant**. »

Deux causes, deux phrases : la première se subit, la seconde se contourne — qui
a déjà ses courses dans le coffre a raison contre elle.

⚠️ **Le premier tir a rendu la bonne phrase ET un déjeuner composé quand même.**
J'avais séparé les deux listes pour l'explication et laissé le PROMPT ne recevoir
que la première : le modèle n'a jamais su que le déjeuner était retenu. Aucun
test de valeur ne pouvait le voir — les deux listes étaient justes, la phrase
était juste, c'est leur jointure qui manquait. Corrigé, re-tiré, confirmé.

**Deux réglages que tu peux changer en une ligne** : le délai vaut 2 heures
(donc à 11 h un déjeuner de midi tombe), et une demande d'un seul jour
entièrement dépensé garde son refus actuel au lieu d'être décalée au lendemain.

---

## Un défaut trouvé par une session voisine, qui touche tout le foyer

Une note de cycle disait **« On mange végétarien le lundi soir »** — un dîner par
semaine. Le classifieur l'a rangée en régime, sans sujet et sans portée. Trois
couches ont fait le reste : pas de sujet veut dire « la personne qui écrit »,
un régime est **strict** par défaut, et le régime d'une bouche **gouverne tout ce
que le foyer cuisine, achète, met en boîte et sert**.

**Résultat : quatre omnivores ont mangé végétarien à tous les repas, et rien ne
le disait.**

⛔ Et le symptôme ressemblait à une amélioration : le plat devient commun partout,
et les refus « quelqu'un n'a rien à manger » s'arrêtent — parce qu'il n'y a plus
rien à échanger. Une courbe qui se redresse pour la pire raison possible.

**Mes fixtures sont propres**, vérifié et non supposé : zéro contrainte dure sur
mes quatre titulaires, aucune note envoyée par mon banc, aucun mot de régime dans
mes envies. Mes régimes passent par la porte par bouche, qui ne gouverne pas le
foyer. **Les verdicts des points 6 et 7 tiennent.**

⚠️ **Mais c'est une limite de mon banc, pas une qualité.** Ma campagne écrit
l'état directement, donc elle n'exerce jamais le chemin qui l'écrit d'ordinaire —
elle ne pouvait pas trouver ce défaut. Un banc qui écrit l'état est immunisé
contre les défauts de ce chemin, **et il l'est sans le savoir**. C'est un
argument pour garder les deux formes de banc.

**La cause de fond est corrigée** (lot H) : la consigne gagne la notion de
**portée**, au même endroit et de la même façon que le discriminant qui sépare
déjà le goût de la sécurité. Mesuré sur le chemin qui écrit, même compte, trois
minutes d'écart :

| note | contrainte écrite |
|---|---|
| « Je suis végétarienne, je ne mange pas de viande. » | **oui**, et c'est juste |
| « On mange végétarien le lundi soir. » | **aucune** |

⚠️ Deux réserves. La phrase de rythme n'est **gardée nulle part** — l'information
est perdue, ce qui est plus doux qu'une fausse contrainte mais reste un manque ;
la vraie sortie est de **demander** à la personne, et ce canal appartient à
l'autre chantier. Et une consigne de prompt régresse en réel : deux tirs ne font
pas un taux, il faudra la revoir sur une campagne.

---

## Lot I — un plan valide refusé parce que « pâtes » se lit « pâté »

Trouvé par la session voisine sur un tir réel, pas par relecture. Un plan
**valide** a été refusé (`422 mouth_unfed`) : « Pâtes aux légumes », préparation
végétarienne servie à une végétarienne, lue comme de la **charcuterie**.

**Deux pertes, toutes deux dans la ceinture, aucune dans le référentiel.** La
normalisation retire les accents ; et `tokenPattern` ajoute `(?:e?s)?` à chaque
jeton, si bien que le jeton `pate` mord aussi `pates`. C'est la seconde qu'on
oublie. Le référentiel, lui, est juste : `pâtes` → `white_pasta`,
`pâtes complètes` → `wholewheat_pasta` (mesuré).

**La réparation évidente ouvrait la faille.** Ajouter « pâtes » à la liste des
portées aurait éteint « pâtés » du même geste — c'est-à-dire réparer un faux
positif en rendant une végétarienne mangeable de pâté. Le sens de l'erreur n'est
pas symétrique, et cette ceinture existe pour ce sens-là.

**Ce qui tranche est l'accent**, et il est exact : seule la charcuterie porte un
É. Sans aucun accent, le mot reste ambigu et **la morsure reste**.

| ce qu'on écrit | avant | après |
|---|---|---|
| « Pâtes aux légumes » | mord | éteint ✅ |
| item nu « pâtes » | mord | éteint ✅ |
| « pâté de campagne » | mord | **mord** ✅ |
| « pâtés en croûte » | mord | **mord** ✅ |
| « pates » sans accent | mord | **mord** (repli fermé) ✅ |

**Et un sous-comptage préexistant, trouvé en câblant** : sur les branches
`plant_only` et `isPlantAnalogue`, le compteur d'extinction était **jeté**. Le
verdict ne changeait pas, mais toute lecture de `silenced_homograph` jusqu'ici
est fausse **vers le bas**.

Quatre mutations, quatre rouges. Celle qui compte est la troisième : elle
reproduit une garde qui marche pendant que son compteur reste à zéro — le seul
rouge qu'une relecture n'aurait pas donné.

### Contrôle d'intégrité : la campagne n'était pas contaminée

Zéro occurrence de « pâte* » dans les dix plans de la campagne. Le faux positif
du lot I **n'a touché aucun de mes verdicts** — il fallait le vérifier avant de
laisser les verdicts des points 6 et 7 en l'état.

En revanche, la relecture des compteurs de ceinture sur ces mêmes plans **durcit
le second constat de tête** (« la ceinture défait ce que le modèle réussit ») :

| plan | bouches | `refused` / `checked` |
|---|---|---|
| C03 | 4 | **0 / 18** |
| C04 | 4 | 3 / 9 |
| C05 | 4 | **10 / 10** |
| C06 | 5 | **6 / 6** |
| C07 | 5 | **12 / 13** |

⚠️ **C03 et C05 sont le MÊME foyer**, à la logistique près (C05 = une course,
sans congélateur). Zéro retrait d'un côté, cent pour cent de l'autre. Une
différence de courses ne peut pas changer le respect d'un régime : soit le
modèle compose autrement sous cette contrainte, soit le dénominateur ne compte
pas la même chose. **C'est la première question du prochain lot sur la
ceinture**, et elle se mesure sans générer, sur les plans déjà écrits.

### ⚠️ CORRECTION D'UN DE MES DEUX CONSTATS DE TÊTE

J'avais écrit **« la ceinture défait ce que le modèle réussit »**, sur la foi
d'un rejeu de la sortie brute. **C'était trop généreux pour le modèle.** Le rejeu
comptait les **items** de la boîte et pas la **préparation citée**.

Rejeu refait, sur les sorties brutes des trois plans où la séparation échoue :

| plan | bouche | item carné dans sa boîte | items propres, **préparation citée carnée** | tout propre |
|---|---|---|---|---|
| C05 | Nora, végane | 0 / 10 | **10** | 0 |
| C07 | Lea, végétarienne | 0 / 13 | **12** | 1 |
| C07 bis | Lea | 0 / 6 | **6** | 0 |

**Ce que le modèle fait, et ce qu'il ne fait pas.** Il n'écrit presque jamais un
aliment carné dans la boîte d'une bouche à régime — sa liste d'items est propre.
Mais il **ne sépare pas la casserole** : ces items propres sont puisés dans une
préparation qui contient de la viande. La ceinture mord sur la préparation, et
elle a **raison** de retirer la bouche.

**Le compteur qui discrimine est `group_excluded`**, et la règle est nette sur
mes cinq plans de foyer :

| `group_excluded` | séparation |
|---|---|
| 0 (C03, C04) | **réussit** — 12/12 et 6/9 |
| > 0 (C05, C06, C07) | **échoue toujours** — 0/10, 0/6, 1/13 |

`group_excluded > 0` veut dire « la préparation citée porte un ingrédient d'un
groupe animal », c'est-à-dire **le pot n'a pas été séparé**. C'est très
exactement ce que la version de prompt `v27_the_swap_cooks_apart` a été écrite
pour obtenir, et la session voisine mesure la même instabilité de son côté.

⛔ **La leçon d'instrument**, la troisième de la journée : lire les **items**
d'une boîte ne dit pas ce que la bouche mange. Il faut suivre la **citation de
préparation**. Une boîte aux items impeccables peut être servie depuis une
casserole au poulet.

---

## ⚠️ POINT 3 — LE ROUGE N'EN ÉTAIT PAS UN. Attribution complète des boîtes manquantes

J'avais écrit « les barquettes manquent à partir de 4 bouches » avec des ratios
(42/48, 24/27, 6/24, 39/51). **Ces ratios divisaient deux choses qui ne se
divisent pas** : `with_box` ne compte pas des bouches, et `expected` est une
**borne haute** que son propre en-tête décrit comme surcomptant la présence.

Le seul compteur qui dit le défaut est `mouths_unboxed`. Attribué :

| plan | bouches | sans boîte | ceinture régime | ceinture dégoût | inexpliqué |
|---|---|---|---|---|---|
| C02 | 2 | 0 | 0 | 0 | **0** |
| C03 | 4 | 12 | 0 | 0 | 12 |
| C04 | 4 | 3 | 3 | 0 | **0** |
| C05 | 4 | 10 | 10 | 0 | **0** |
| C06 | 5 | 6 | 6 | 0 | **0** |
| C07 | 5 | 13 | 12 | 1 | **0** |
| E1 | 2 | 2 | 0 | 2 | **0** |

**34 des 46 cases manquantes sont des retraits de ceinture** — c'est-à-dire la
casserole non séparée, la cause déjà connue du point 7, et pas un défaut de
composition de boîte.

### Et les 12 de C03 n'en sont pas non plus

Elles tombent **toutes sur `before_bed`**, et **toutes sur Paul et Claire**. Les
deux sont bien servis à `snack_am` et `snack_pm` — donc leurs moments à eux sont
ouverts et boîtés. `before_bed` a été ouvert pour Léo et Nora, pas pour eux.

C'est `eatingStructureFor` qui ouvre les moments **par bouche**, selon le besoin
du corps (`SLOT_OPENING_ORDER` : les trois repas, puis le goûter, puis la
collation du matin, puis l'avant-coucher). Le plat existe à ce moment-là parce
qu'une bouche en avait besoin ; les autres n'y sont pas nommées, et **c'est
juste**. Le compteur, lui, attend tout le monde à toutes les cases : son en-tête
le dit noir sur blanc, *« il surcompte la présence… C'est une borne HAUTE
nommée, pas un dénominateur inventé »*.

### Verdict corrigé

> **Point 3 : les barquettes fonctionnent à 1, 2, 4 et 5 bouches.** Aucune boîte
> n'est oubliée par le modèle sur les dix plans de la campagne. Ce qui manque
> vient de la ceinture, et la ceinture a raison de retirer.

⛔ **Quatrième piège d'instrument de la journée, et c'est le même à chaque
fois** : j'ai divisé par un dénominateur dont l'en-tête disait qu'il n'en était
pas un. Le geste qui répare : avant de publier un ratio, lire la définition des
DEUX nombres.

---

## Lot C — le point 1, livré et prouvé sur trois tirs réels

### Ce qui était à l'envers

`deriveCookingPlan` semait les sessions avec les courses : `sessions = min(runs, …)`.
Une réponse de LOGISTIQUE décidait donc combien de fois on CUISINE, et « une
seule course » forçait « une seule session » — une règle datée de la veille
(A2, 2026-09-03), qui raisonnait ainsi : acheter une fois, c'est tout cuire d'un
coup, sinon le cru ne tient pas.

⛔ **Ce raisonnement est juste SANS congélateur, et ce cas est déjà couvert** par
la poussée « une course en exige deux ». Avec un congélateur, la règle
**interdisait la configuration que ton point 1 décrit** : acheter le dimanche,
congeler ce dont mercredi aura besoin, cuisiner deux fois. Tant qu'elle tenait,
la marque « à congeler » n'avait aucun plan où se poser.

### Ce que ça fait maintenant

    avant   sessions = min(courses, plafond du style, jours)
    après   sessions = min(plafond du style, jours)
            courses  = min(demandées, sessions)        ← ton invariant

### Prouvé sur le vrai produit, trois tirs, même foyer à 4 bouches

| | avant le lot | tir réel après |
|---|---|---|
| 1 course déclarée | **1 session** | **3 sessions** (samedi, lundi, mercredi) |
| vagues de courses | 2 | **1** |
| lignes marquées « à congeler » | **le champ n'existait pas** | 1 à 2 selon le tirage |

### Deux défauts trouvés PAR les tirs, pas par la relecture

**① Le champ était calculé et jamais rendu.** Le premier tir : les `issues`
disaient `freeze_on_purchase: 1/30`, et les trente lignes de la charge n'avaient
pas la clé. `mealShoppingPayload` ne la recopiait pas. **C'est le compteur qui
l'a révélé** — sans le `1/30`, « champ absent » et « rien à congeler » rendaient
exactement la même charge. Même cicatrice que `buy_on` trois jours plus tôt, au
même endroit.

**② « Salade verte — à congeler ».** Le deuxième tir a rendu cette instruction.
Elle est fausse, et une instruction fausse est **pire qu'absente** : elle apprend
à ignorer les autres, y compris celle qui portait sur le poisson juste au-dessus.
Le repli n'absorbe donc plus ce qui ne se congèle pas ; la vague survit, la
personne devra y retourner, et le refus **se compte**. Mieux vaut une course de
plus qu'une salade congelée.

### Une vérification prouvablement morte, trouvée par sa mutation

J'avais écrit un contrôle de conservation dans le repli (« l'article tiendrait-il
quand même ? »). **Il est toujours vrai** : un article que le repli déplace vient
d'une vague dont la date EST sa limite, et cette date trie après toutes les dates
gardées. La mutation qui le retirait restait **verte**. Je l'ai remplacé par sa
démonstration, écrite dans le code.

### Ce qui reste du lot C

- la ligne de prompt qui dit la cadence au modèle (le nombre de courses ne
  l'atteint toujours pas) ;
- la phrase de rationale pour `runs_capped_by_sessions` ;
- le PDF du frigo et `DayGroceriesCard` ;
- la passe navigateur (il faut que tu ouvres une session).

**Gate vert.** Et la dette de types tolérée dans les tests front passe de **87 à
70** : quinze erreurs venaient d'un `slotBadge` requis que treize fixtures
n'écrivaient pas, dans le fichier même de mon lot D. La liste le tolérait, donc
personne ne le voyait.

---

## Commit `36871f48` — et ce que la matérialisation de HEAD a révélé

Les sept lots sont commités en un seul commit, depuis un **index privé** : le
lot « offre de courses » d'une troisième session, non commité depuis le 03/09 et
mêlé à deux de mes fichiers, en est **exclu hunk par hunk**. Ses cinq fichiers
restent dans l'arbre de travail, intacts. Personne n'était joignable pour dire
s'il est fini, et « passe le gate » n'est pas « fini ».

⛔ **Le hook gate l'ARBRE DE TRAVAIL, pas HEAD.** Un HEAD cassé passerait le hook
tant que l'arbre est cohérent. J'ai donc matérialisé l'arbre exact du commit
dans `/tmp` et joué dessus `deno check`, la suite keel, `tsc` et vitest avant
d'écrire quoi que ce soit.

### Ce que ça a montré : HEAD était DÉJÀ cassé, avant moi

| | HEAD nu | mon arbre |
|---|---|---|
| `tsc` app | ❌ `SetupPage.tsx` passe `style` à `GroceryRunsField`, qui ne l'a pas | ❌ la MÊME, pas une de plus |
| `tsc` tests | 88 erreurs | **71** |
| vitest | 3 rouges | les MÊMES 3 |
| suite keel | — | 5 435 / 0 |

La cause est le lot « offre de courses » lui-même : `SetupPage.tsx` a été commité
le 04/09 à 15:06 en appelant des props dont la définition vit dans le
`GroceryRunsField.tsx` **non commité**. L'appelant est parti sans l'appelé. Le
hook n'a rien vu, pour la raison ci-dessus. Les trois tests rouges
(`household.int.test.ts` ×2, `oneCookingSessionField.int.test.ts` ×1) sont du
même lot.

**Ce n'est ni à moi ni à la session voisine, et personne n'est joignable pour le
réparer ce soir.** Le remède est simple quand le propriétaire revient : commiter
`GroceryRunsField.tsx` et ses tests. Je l'ai laissé tel quel — le réparer à sa
place aurait été signer son travail.

---

## Lot F — le point 5 : le kcal d'une boîte à un nom, quel que soit le lecteur

Ta décision, mot pour mot : *« dès qu'il y a un objectif de perte ou gain de
poids c'est affiché, peu importe qui regarde »*.

**Ce que le code disait avant.** `canEmitMouthEnergy` répondait **non** à cette
question, avec trois raisons écrites : la ceinture (plancher, âge, doctrine,
interrupteurs) est clée sur le compte, pas sur la bouche ; une bouche sans
compte ne peut rien éteindre ; ce qui touche le corps est à soi.

**Ce que le lot fait.** Une porte à côté, `canEmitBoxEnergy`, qui répond aux
trois : la ceinture est celle **de la bouche** (son âge sur sa ligne de foyer,
son plancher si elle a un compte, la doctrine du foyer, sa direction depuis son
objectif) ; ce qui sort est une **quantité du plan**, les kcal du plat au prorata
des grammes de la boîte, jamais un corps ; et le conseil du midi garde l'ancienne
règle parce qu'un conseil est une consigne adressée.

**Où « peu importe qui regarde » s'arrête**, et je te le signale parce que c'est
un arbitrage à moi sur ta phrase :

| le lecteur… | ce qu'il voit des boîtes des autres |
|---|---|
| est fermé par le plancher TCA, l'âge ou son coach | **rien** — ces portes protègent la personne qui regarde |
| a **explicitement** coupé son chiffre | **rien** — R7, un interrupteur doit tout faire taire pour être un interrupteur |
| est en maintenance et n'a rien choisi | **les boîtes des bouches à objectif** — le cas exact de ta phrase |

**Un mineur du foyer n'a jamais de kcal sur sa boîte**, objectif ou pas. Une
bouche sans date de naissance non plus. Un bac partagé, jamais.

**Trois gardes m'ont attrapé en route, et c'est ce qu'elles sont là pour faire** :
la liste des appelants relus de la chaîne de sécurité, l'inventaire clos des clés
i18n qui écrivent un kcal, la parité FR/EN. Et en les lisant j'ai vu un trou à
moi : sur un lecteur fermé par défaut, le kcal de boîte se serait affiché **sans
sa note de base**. Réparé aux trois écrans avant de commiter.

**Pas encore prouvé sur le vrai produit** au moment où j'écris : le tir sur le
duo (Julie en maintenance, Marc en perte sans compte) suit le commit.

### Lot F — prouvé sur le vrai produit, sur ton scénario exact

Pas besoin d'une génération : le duo avait déjà un plan de foyer vivant, écrit
hier par mon banc. Un seul appel d'énergie, **comme Julie** (maîtresse, en
maintenance, n'ayant rien choisi), sur ce plan :

```
show=false   reason=student_off   switch_offerable=true      ← Julie n'a pas son chiffre
boîtes à un nom = 8 · rendues = 3 · illisibles = 2 · refusées = 3 (no_direction)
   → box_sat_lunch_marc     MARC   404 kcal   plan_quantities
   → box_sat_dinner_marc    MARC   385 kcal   plan_quantities
   → box_sun_lunch_marc     MARC   430 kcal   plan_quantities
```

**C'est ta phrase, mot pour mot** : la maîtresse est la femme, c'est le mari qui
veut perdre du poids, et ça affiche le nombre de calories sur le compte du
maître. Julie ne voit pas son propre chiffre (elle est en maintenance et n'a rien
demandé) ; elle voit ceux de Marc.

**Et les compteurs s'additionnent** : 3 rendues + 3 refusées + 2 illisibles = 8
boîtes à un nom. Les 3 refusées sont celles de Julie, motif `no_direction` — pas
d'objectif, rien à ouvrir. Les 2 illisibles sont un plat dont un ingrédient n'est
pas dans la table de composition : le manque de couverture déjà mesuré, pas un
refus de la porte.

**Point 5 : vert.** Le kcal est par boîte, par bouche à objectif, quel que soit
le lecteur, avec sa base, et jamais sur un bac partagé.

---

## Pas de recul — 2026-09-05, 00 h 30

### Ce qui a bougé

| | état |
|---|---|
| Sept lots de la campagne | commités, `36871f48` |
| Lot F (point 5) | commité, `fc1642f0`, **prouvé sur le plan vivant du duo** |
| HEAD | **construit de nouveau** : trois lanes vertes, keel 5 453 / 0 |
| Point 7 | le remède est posé par la session voisine (`f81ce212`, relance par parties) ; **ma mesure sur cinq foyers tourne** |

### Deux choses que HEAD a subies pendant la soirée, et qu'il faut que tu saches

**① Un commit voisin a rétrogradé deux de mes fichiers en HEAD.** `567585ae`
portait `cooking_plan.ts` et son test dans une version antérieure à mon commit,
sans les avoir touchés : un `git commit` de l'index partagé, qui tenait ces deux
chemins stagés à un blob périmé par une session inconnue. `CookingPlan` avait
perdu `runs` sous ses deux lecteurs ; HEAD ne construisait plus, la suite de
tests mourait au typecheck. **Le hook n'a rien vu**, parce qu'il gate l'arbre de
travail, où mon code vivait toujours. Réparé par la session voisine (`f673945f`)
au blob exact de mon commit, vérifié à l'octet. Leçon gravée en mémoire : après
tout commit de lane partagée, matérialiser HEAD nu et y jouer les gardes — c'est
le seul contrôle qui voit un fichier « à jour dans l'arbre, d'hier en HEAD ».

**② L'erreur de type qui reste en HEAD n'est ni à moi ni à la session voisine.**
Le lot « offre de courses » d'une troisième session, morte, a commité l'appelant
(`SetupPage.tsx` passe trois props à `GroceryRunsField`) sans l'appelé
(l'extension de `GroceryRunsField.tsx`, +181 lignes, non commitée avec
`api/cookingPlan.ts` et un test non suivi). Sur l'arbre de travail, tout compile.
En HEAD, non. **Personne ne peut joindre l'auteur.**

### La décision qui t'attend — je ne la prends pas seul, elle touche le travail d'un tiers

| option | ce que ça fait | ce que ça coûte |
|---|---|---|
| **A** · commiter les trois fichiers de l'offre ensemble (`GroceryRunsField.tsx`, `api/cookingPlan.ts`, `groceryRunsOffer.int.test.ts`) | HEAD construit ; le lot 3 de FF-060 est complet côté écran | on signe le travail d'un tiers sans savoir s'il le tenait pour fini ; il passe le gate et ses tests |
| **B** · retirer les trois props de `d33aae13` dans `SetupPage.tsx` | HEAD construit ; rien de tiers n'est signé | on désarme le lot 3 côté écran ; son auteur devra le reposer |

~~Ma recommandation : A.~~ **Corrigée une heure plus tard, sur des faits mesurés
par la session voisine, hors de l'arbre :**

- le lot orphelin n'est pas trois fichiers, il en fait **six** ;
- HEAD + les trois fichiers front : `tsc` passe de 1 à **6** erreurs, et le test
  de l'offre échoue 7 fois (il lui faut sa moitié serveur) ;
- HEAD + les six (dont la réécriture de `MealBuilder.tsx`, +413/−408) : `tsc` à
  zéro, mais **`householdEnvyWiring` rougit** — le composeur réécrit casse le
  câblage de l'envie de foyer.

**A est donc hors de question** : adopter ce lot, c'est signer quatre cents
lignes d'un composeur que personne n'a relues, avec un test rouge.

**B est posé par la session voisine**, dans l'index seul : les trois props que
`d33aae13` avait commitées sans leur destinataire sont retirées de
`SetupPage.tsx`. Ça ne décide rien du lot — ces trois props étaient **mortes en
HEAD** (le `GroceryRunsField` commité en a quatre et les ignore), l'arbre de
travail garde les six fichiers intacts pour qui voudra le finir, et c'est trois
lignes réversibles. HEAD recompile sans qu'un comportement livré change. Le
commentaire dit où vit le lot et pourquoi les props sont parties.

Si tu veux que l'offre de courses soit livrée, c'est un chantier à ouvrir : relire
le composeur réécrit, réparer le câblage de l'envie, et commiter les six fichiers
ensemble.

### Ce qui reste, dans l'ordre

1. la mesure du point 7 (en cours, cinq tirs, ~25 min) ;
2. ta décision A/B ci-dessus, que j'exécute dans l'heure ;
3. la passe navigateur des lots A, D et F — il faut que tu ouvres une session
   `qa-9pts-duo@keeltest.dev` (mot de passe des fixtures) ; je ne saisis jamais
   un mot de passe ;
4. les trois restes du lot C (ligne de prompt, phrase de rabotage, PDF) et le
   résidu du point 6 (un dégoût n'est jugé que sur un plat en boîte).
   ⟳ La carte des courses du jour porte maintenant la marque « à congeler »,
   comme la liste complète (commit à part, pendant les tirs du point 7).

---

## Point 7 — la mesure du remède, et ce qu'elle a vraiment trouvé

Cinq tirs, un tirage chacun, sur le remède posé par la session voisine
(`f81ce212`, relance acceptée par parties). Avant = mes plans d'hier.

| cas | foyer | hier | aujourd'hui | casseroles carnées | ce qui s'est passé |
|---|---|---|---|---|---|
| C03 | 4, Nora végane | 12/12 · 200 | 11/11 · 200 | 3 / 9 | **le design marche** : base végane, poulet dans les boîtes des autres |
| C04 | 4, une course | 6/9 · 200 | 546 | — | limite du runtime, rejoué |
| C05 | 4, sans congélateur | 0/10 · **422** | 13/13 · **200** | 3 / 4 | **réparé** — par la relance entière, pas par la fusion par parties (`merged_cells=0`) |
| C06 | 5, Lea végétarienne | 0/6 · **422** | 0 bites · **200** | **0 / 3** | **le foyer entier est végétarien** |
| C07 | 5, minimal | 1/13 · **422** | 0 bites · **200** | **0 / 5** | **le foyer entier est végétarien** |

### Le fait qui compte

Sur C06 et C07, cinq bouches dont quatre omnivores : **42 plats, zéro poulet,
zéro poisson, zéro viande**. Le 422 d'hier est devenu un 200 non parce que le
composant carné est apparu dans les boîtes des omnivores, mais parce qu'il a
disparu pour tout le monde. C'est l'interdit exact de ton point 7 — la minorité
ne doit pas pénaliser le foyer — et c'est la règle R5 de la lane elle-même :
*« un seul végane impose le végane à six personnes en silence »*.

**Et aucun compteur ne le voit.** `bites=0`, `refused=0`, `missing=0` : tout a
l'air parfait, parce qu'il n'y avait plus rien à mordre. Un zéro de ceinture n'a
de sens qu'avec son dénominateur — « y avait-il quelque chose à séparer ? ». Il
manque un compteur (`swap_absent` : des bouches divergentes existent et aucune
casserole ne porte un groupe que la ligne la plus stricte exclut). Sans lui, un
plan qui affame les omnivores et un plan parfait rendent le même journal.

**Point 7 : toujours rouge**, et mieux caractérisé. Hier le modèle ne séparait
pas la casserole ; aujourd'hui il n'a plus rien à séparer. Deux façons de rater
le même point, et la seconde est silencieuse. Le remède est en amont de la
relance : le compteur d'abord, puis une consigne ou une relance déclenchée par
lui. C'est la lane de la session voisine, qui a le fait et les fichiers.

---

## Pas de recul — 2026-09-05, 02 h

### Les commits de la nuit, à moi

| hash | quoi |
|---|---|
| `36871f48` | les sept lots de la campagne |
| `fc1642f0` | lot F : le kcal d'une boîte à un nom, sous la ceinture de sa bouche |
| `a58af9f6` | la carte des courses du jour marque aussi ce qui part au congélateur |
| `4575f94d` | la décision par boîte devient pure et mutée (relecture croisée) ; la phrase de rabotage des courses |

Chacun depuis un index privé reconstruit sur HEAD juste avant `write-tree`,
arbre matérialisé et testé à part avant d'être écrit, arbre commité vérifié
identique. Zéro `git add` sur l'index partagé.

### HEAD, à `a0f6af7d` puis `4575f94d`

**HEAD construit.** `deno check` vert sur les trois lanes, 5 481 tests keel à
zéro rouge, `tsc` app à **zéro** erreur (la session voisine a posé B : les trois
props orphelines retirées de `SetupPage.tsx`, les six fichiers du lot orphelin
laissés intacts dans l'arbre). Restent trois tests d'écran rouges en HEAD nu,
d'un lot tiers (`household.int.test` ×2, `oneCookingSessionField` ×1) — des
décisions humaines, pas des réparations en passant.

### Les 9 points, état de la nuit

| # | état |
|---|---|
| 1 | ✅ moteur, liste, carte du jour. Reste : la ligne de prompt, le PDF |
| 2 | ✅ |
| 3 | ✅ à 1, 2, 4, 5 bouches |
| 4 | ✅ |
| 5 | ✅ **prouvé sur le vrai produit**, commité, relu et durci |
| 6 | ✅ allergies, régimes. Reste : un dégoût n'est jugé que sur un plat en boîte |
| 7 | 🔴 **mieux caractérisé** : 3 foyers justes sur 5, et 2 « réussis » en mettant les omnivores au végétarien, sans qu'un compteur le voie. Remède dans la lane voisine (`swap` par cellule, v28, relance sur le cas flagrant) ; je le mesurerai |
| 8 | ✅ |
| 9 | ✅ |

### Ce qui t'attend, toi

- **La passe navigateur** des lots A, D et F : ouvre une session
  `qa-9pts-duo@keeltest.dev` (mot de passe des fixtures) sur `/app/plan` ; je
  vérifie par lecture de page, jamais en saisissant un mot de passe. C'est la
  seule chose de la nuit que personne n'a vue à l'écran.
- **Quatre décisions humaines** que ni moi ni la session voisine ne prenons :
  le lot orphelin « offre de courses » (six fichiers, un composeur réécrit non
  relu, un test rouge s'il est adopté) ; les deux tests d'écran d'un tiers
  rouges en HEAD ; `keel_properties/` qui ne typecheck plus et qui est hors du
  filet du gate ; et l'idée d'un contrôle après commit sur HEAD nu (≈ 2 s), qui
  aurait vu deux des pannes de la nuit.

### ⟳ Le lot orphelin, corrigé par la carte de l'audit (05/09, 17 h 35)

La troisième session a rendu sa carte fichier → propriétaire
(`scratchpad/2026-09-05-1735-CARTE-ARBRE-PROPRIETAIRES.md`), et elle corrige
deux de mes affirmations :

- **Le lot « offre de courses » fait onze fichiers, pas cinq**, et son auteur
  (session « Onboarding sessions de cuisine », morte) l'avait **déclaré fini**
  avec ses chiffres : « 28/28 Deno, front 0 rouge, tsc propre ». **Il n'a rien
  commité ni stagé.** Les trois props de `SetupPage.tsx` sont entrées dans HEAD
  par `d33aae13`, une AUTRE session, qui a commité ce fichier entier depuis
  l'arbre où le lot les avait déjà posées — le piège « `--` protège l'index, pas
  l'arbre », payé par un voisin. (Corrigé le 05/09 : j'avais écrit « à moitié
  commité », c'était faux.)
- **La réécriture de `MealBuilder.tsx` (+413/−408) n'est pas ce lot** : c'est un
  lot antérieur, du 03/09 au soir (l'entonnoir : retrait de « temps par
  session », « pour combien de personnes »…), dont le lot de l'offre dépend. Le
  test que la session voisine voyait rougir en adoptant le composeur est vert
  avec le test qui va avec ce lot.

**Les deux ensemble : tsc 0, 127/127 sur leurs six tests.** Le seul retour à un
blob périmé dans 90 commits est `567585ae`, réparé.

**Ma recommandation change une seconde fois, et je te le dis tel quel** : B a
rendu HEAD compilable sans rien signer, et c'était juste. Maintenant qu'on sait
le lot complet, vert et déclaré fini par son auteur, **l'adopter après une
relecture en lecture seule est raisonnable** — mais c'est huit cents lignes sur
le composeur et l'entonnoir, d'un auteur qui ne peut plus répondre. Ni
moi ni les deux autres sessions ne le signerons à ta place. La relecture est en
cours ; tu auras ses faits.

### Précision sur la troisième décision — `keel_properties/` qui ne typecheck plus

Les faits, pour que tu tranches sur du concret : la suite `keel_properties/`
(six fichiers de propriétés du harnais, **hors du filet du gate** alors que
`docs/keel/TESTING.md` l'annonce dedans) ne démarre plus sur l'arbre.
`no_food_solicitation_property_test.ts:351` passe un littéral de sept champs à
`PulseDecisionInput`, qui n'en a plus que deux (`localHour`, `answeredToday`).
Le test date du 08/08 ; le module a été réduit le 03/09 dans l'instantané
« avant les huit chantiers » (`fa422747`). Personne ne l'a vu parce que personne
ne lance ce dossier.

Ce que ça veut dire : la propriété « le chat ne réclame pas à manger » n'est
**plus vérifiée** depuis le 03/09. La réparation mécanique tient en cinq champs à
retirer du littéral — mais si ces champs ont disparu du module, c'est que la
décision qu'ils portaient a bougé, et c'est **ça** qu'un humain doit relire avant
de faire revenir le vert. Ni moi ni les deux autres sessions ne l'avons touché.
