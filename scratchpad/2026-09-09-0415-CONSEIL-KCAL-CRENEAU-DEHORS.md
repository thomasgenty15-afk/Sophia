# Le conseil chiffré d'un créneau déclaré que le plan ne compose pas

2026-09-09, 04:00–04:20. Question posée : *quand une personne déclare qu'elle
mange à un moment que le plan ne compose pas (déjeuner au bureau), reçoit-elle
une recommandation calorique pour ce moment ?*

## Ce qui existait

Tout, **sauf pour un plan personnel** :

| pièce | où | état |
|---|---|---|
| le calcul + ses 8 refus nommés | `_shared/keel/household_portions.ts::eatingOutAdvice` | ✅ |
| la phrase FR/EN | `eatingOutAdviceSentence` | ✅ |
| l'émission | `meal-energy-v1`, champ `eating_out_advice` | ✅ |
| la lecture | `frontend/src/keel/api/mealEnergy.ts::attachEatingOutAdvice` | ✅ |
| le rendu | `plan/EnergyReadout.tsx::DayEnergyLine` (`/app/plan` + `/app/today`) | ✅ |

**Le trou** : `meal-energy-v1::readViewerAway` lisait la présence du lecteur
**uniquement** dans `generated_from.household.presence.members[]` — une trace que
seule `generate-household-meal-v1` écrit. Un plan personnel n'en porte pas, donc
`null`, donc `return []`.

Or `chooseGenerator` (`api/planRouting.ts`) envoie sur la lane personnelle
**tout le monde sauf un maître de foyer d'au moins deux bouches**. C'est-à-dire
exactement la personne visée par la question : un solo qui déjeune dehors.

Mesuré (contrefactuel, même plan, une seule ligne changée) :

    avant  eating_out_advice: []
    après  eating_out_advice: [{day:"wed", slot:"lunch", kcal:700}]

## Ce qui a été livré

1. **`_shared/keel/self_presence.ts`** (neuf, pur, 6 tests) — la présence du
   titulaire depuis ses **deux** colonnes vivantes, par le parseur du foyer
   (`parseMemberAway`) : `student_goals.practical_constraints.away_days` (sa
   grille) ++ `household_members.away_days` de sa ligne (les cinq midis que pose
   la porte « déjeuner au bureau »). Ce sont les deux sources que
   `generate-meal-v1` unit déjà (D6.1) pour décider ce qu'il compose.
2. **`meal-energy-v1`** — repli sur cette lecture quand la trace manque, **fermé
   aux plans de foyer** (un plat composé au déjeuner peut être celui d'une autre
   bouche), plus une ceinture : *une case que le plan A COMPOSÉE ne reçoit
   jamais de conseil*, quoi que dise la colonne. Les colonnes bougent après la
   composition ; l'assiette, non.

## Le défaut trouvé EN MESURANT, et corrigé

Premier run réel : **« au déjeuner, vise autour de 900 »** sous une fourchette
**1 950 – 2 200 kcal/j**. 900 × 3 = 2 700, soit 500 kcal au-dessus de la borne
haute imprimée trois centimètres plus haut.

Deux entretiens différents sur le même écran :

    fourchette affichée   maintenanceRange   82 kg × kcal/kg    2 450–2 700 → −500 → 1 950–2 200
    journée du conseil    estimatedMaintenanceFor (MB × activité)  3 177     → −500 → 2 677 → /3 → 900

`ExecutedPace.maintenanceKcal` porte son propre interdit à sa déclaration
(`weight_pace.ts`) : « ELLE NE REND AUCUN NOMBRE DESTINÉ À ÊTRE LU ». Et
`energy_target_test.ts` **refuse** cette formule pour l'affichage.

⇒ `eatingOutAdvice` prend désormais **`dayKcal`**, le milieu de la fourchette que
l'écran imprime (`directedRange` — déficit, plancher d'énergie et annulation de
condition compris). Une garde de source, **prouvée par mutation**, interdit au
module de se refaire une seconde journée.

    après correction   700 × 3 = 2 100   ← plein milieu de 1 950–2 200

## Les quatre vérifications en condition réelle

Fixture `qa-midi-dehors@keeltest.dev` (mdp `1234567`) — homme 82 kg, 180 cm,
36 ans, `trains_some`, `fat_loss` 0,5 kg/sem, rythme petit-déj / déjeuner /
dîner, déjeuner dehors les 7 jours (5 par le roster, 2 par sa grille).

1. **Génération réelle** `generate-meal-v1`, fenêtre 1 jour, HTTP 200 en 73 s →
   **2 plats : `wed/breakfast` et `wed/dinner`**. Le déjeuner n'est pas composé.
2. **Le conseil sort** : `{wed, lunch, 700}`, cohérent avec la fourchette.
3. **Les jours hors plan ne reçoivent rien** : la fixture déclare 7 midis
   dehors, le plan ne couvre que mercredi → **une seule ligne**. Structurel :
   `adviceForPlan` n'itère que sur les jours que le plan a produits.
4. **Pas d'objectif de poids ⇒ pas de chiffre du tout** : passé en
   `maintenance`, la réponse rend `show:false / student_off` et ne porte aucun
   champ de conseil.
5. **La ceinture mord** : un `wed/dinner` marqué « dehors » APRÈS la composition
   ne reçoit aucun conseil (le plan a composé ce dîner) ; seul le déjeuner en
   reçoit un.

## Ce qui n'a PAS été mesuré, et c'est nommé

- La lane **foyer** hérite de la correction de `dayKcal` par la même ligne, mais
  n'a **pas** été rejouée en run réel (il faudrait une seconde fixture de foyer
  et un appel modèle de plus). Le chemin est identique ; la mesure manque.
- **Un jour entièrement dehors n'a aucun bloc à l'écran**, donc aucun conseil :
  `adviceForPlan` s'indexe sur les jours que le plan a produits. Trou connu,
  déjà nommé dans `meal-energy-v1` avant ce lot.

## Gate

`deno check` vert sur les trois entrées, 6 201 tests keel verts,
`tsc -b --force` front vert, `mealEnergy` + `energyReadout` verts.

⚠️ **Deux rouges NON IMPUTABLES à ce lot**, présents à l'arrivée (fichiers
modifiés à 00:37, avant cette session) :
`cooking_style_brief_test.ts` (`maxFridgeDays` requis, `cooking_plan.ts` modifié)
et `household_merge_quota_test.ts` (5 sorties au lieu d'1,
`generate-household-meal-v1/index.ts` modifié). Aucun des deux n'importe les
modules touchés ici.


---

# ⟳ 04:20–04:45 — LA VÉRIFICATION DANS L'ÉCRAN QUI TOURNE

La charge utile ne suffisait pas. Plan RÉEL écrit (`intent: prepare_next`,
`54aafc8a…`), dev server sur 5215, connexion réelle du compte de fixture,
`/app/plan`.

## ① Ça s'affiche — et c'est bien là

    Mercredi  Aujourd'hui        2385 kcal sur les 2 repas que j'ai composés (1 repas dehors)
                                 Au déjeuner, vise autour de 700.

La grille de la semaine porte `Déjeuner — rien ici`. Vérifié aussi en 375 px :
le texte passe à la ligne, aucun débordement horizontal.

## ② UN DÉFAUT QUE SEUL L'ÉCRAN MONTRAIT — corrigé, même cause

Au premier passage la ligne disait **« 2385 kcal sur la journée »**, juste
au-dessus de « au déjeuner, vise autour de 700 ». La première phrase revendique
la journée entière ; la seconde annonce un repas qui n'y est pas.

`PlanEnergyDay.subject` existe très exactement pour ça (« ta journée : 1 400 est
FAUX dès qu'un repas sur trois est pris dehors »). Il bascule sur `mealsOut`, et
`mealsOut` venait de `readViewerMealsOut` — **qui a le même défaut que
`readViewerAway` : il ne lit que la trace de la lane foyer.** Deux lecteurs, un
seul défaut, découvert par deux surfaces différentes.

⇒ `selfMealsOutByDay` (même module, même ceinture des cases composées, 5 tests).
Calculé **hors des portes** : c'est un compte de repas, pas un nombre sur un
corps — quelqu'un qui a éteint les calories doit quand même lire « sur les 2
repas que j'ai composés ».

## ③ CE QUE JE N'AI PAS TOUCHÉ, ET QUI EST PLUS GROS QUE CE LOT

**Le produit porte DEUX journées différentes, et l'écart est de ~500 kcal/j.**
Mesuré sur la même personne, dans la même minute :

    ce contre quoi le PLAN est composé et jugé   envelopeFor (per_kg)      2 677 – 2 700 kcal/j
      (journalisé : `keel.meal.envelope`, run du 2026-09-09 04:39)
    ce que l'ÉCRAN annonce sous les plats        maintenanceRange − 500    1 950 – 2 200 kcal/j

2 677 = 3 177 − 500, c'est-à-dire **`estimatedMaintenanceFor` (métabolisme de
base × activité) moins le déficit** — la formule que `energy_target_test.ts`
refuse pour l'affichage. Le conseil du midi descendait de CELLE-LÀ (2 677/3 =
900) ; il descend maintenant de celle que l'écran imprime (2 100/3 = 700).

⚠️ **Donc la correction du § précédent aligne le conseil sur l'écran, pas sur le
moteur.** C'était le bon choix — un chiffre affiché doit s'accorder avec le
chiffre affiché à côté de lui, et `weight_pace.ts` interdit d'afficher le sien —
mais **le désaccord entre le moteur et l'écran reste entier, et il n'est pas à
moi de le trancher.**

**Et il y a un second étage.** Le plan a servi **2 385 kcal en deux repas** un
jour où le déjeuner est dehors. Sa couverture réelle vaut 0,6 jour
(`dayCoverageOf` : 0,25 + 0,35 sur 1,00), mais `meal_verdict.ts` fait
`const days = Math.max(1, daysCovered)` — un plancher **documenté et gardé
exprès**, dont le commentaire dit : *« une fenêtre d'UN jour qui ne porte qu'un
dîner a une couverture de 0,35, et ce max la ramène à 1 […] NE LE RETIRE PAS
SANS MESURE. Le corpus du 2026-09-04 ne porte aucun plan d'un seul jour. »*

Ce run **est** cette mesure manquante : le verdict a lu 2 385 kcal comme une
journée pleine, l'a jugée `below` contre 2 677, et a servi `raise_energy`. Le
plan a donc mis une journée entière dans deux repas, et le conseil du midi
s'ajoute par-dessus.

    servi par le plan      2 385
    conseil du midi        +  700
    journée impliquée      3 085   contre une fourchette affichée de 1 950–2 200

⇒ **Trois décisions produit à prendre, aucune prise ici** :
   a. le moteur et l'écran doivent-ils partager une seule estimation d'entretien
      — et laquelle ?
   b. un jour dont un repas est dehors doit-il recevoir 0,6 journée de
      nourriture (et non une journée pleine) ?
   c. le plancher `Math.max(1, daysCovered)` tombe-t-il, maintenant qu'un plan
      d'un jour l'a exercé ?


---

# ⟳ 12:30–14:45 — « LE MOTEUR DOIT SUIVRE L'ÉCRAN : 1950-2200 PARTOUT »

Décision du propriétaire, 2026-09-09. Appliquée, mesurée en run réel, vérifiée
à l'écran.

## Une seule journée, deux lecteurs

`energy_target.ts` porte désormais **`plannedEnergyBand()`** (la bande) et
**`maintenanceMidKcal()`** (le point) — c'est-à-dire `maintenanceRange` puis
`directedRange`, sans un nombre de plus. Les deux moteurs les lisent :

| | avant | après |
|---|---|---|
| `envelopeCore` (bande de composition, les 2 lanes) | `estimatedMaintenanceKcal` × `ENERGY_BANDS[goal]`, écrêté A1 | `plannedEnergyBand` |
| `maintenanceKcalOf` (journée d'une bouche de foyer) | `estimatedMaintenanceFor` | `maintenanceMidKcal` (adulte) |

**Le curseur atteint enfin l'enveloppe.** La bande descendait d'une fraction
attachée au JETON `goal` : deux `fat_loss` de rythmes opposés recevaient la même
enveloppe pendant que l'écran leur affichait deux fourchettes. Elle descend
maintenant de l'écart EXÉCUTÉ (`envelopeDirectionFor`, nouveau, dans
`weight_pace.ts` — une seule écriture de « curseur réglé, ou défaut »).
`envelopeFor` prend un 10ᵉ paramètre requis ; un appelant qui l'oublie ne
compile pas, et le test de câblage refuse la direction neutre dans une lane de
génération.

## Ce que la décision coûte, nommé dans le code

- **L'appétit (±10 %) et les deux axes d'activité ne déplacent plus l'énergie
  d'un adulte.** La bande affichée ne lit que le poids et le cran d'activité.
  Ils restent collectés sur la fiche d'une bouche de foyer et n'ont plus de
  lecteur : moitié débranchée, écrite en toutes lettres dans `energy_target.ts`
  et `mouth_anchor.ts`. La sortie cohérente est de les faire entrer dans
  `ACTIVITY_KCAL_PER_KG` — donc de les faire VOIR — jamais de les rebrancher sur
  un second calcul.
- **La taille ne décide plus de l'énergie**, seulement de la protéine.
  Quelqu'un sans taille au dossier reçoit désormais une bande au lieu d'aucune.
- **Les mineurs gardent leur équation pédiatrique** : `ACTIVITY_KCAL_PER_KG` est
  une échelle d'adulte (26→36 kcal/kg), et `ageBand` ne porte que des bandes
  d'adultes.
- **A1 (500 kcal/j de déficit maximum) survit, écrit autrement** : il est
  exécuté en amont par `executedPaceFor`, et ce qui reste dans `envelopeCore`
  garde ce qu'un `portion.adjust` à la baisse peut encore creuser. Une bande
  déjà à son plancher ne rend plus rien — ni en bas, ni en haut.

## Le défaut attrapé par son propre compteur, au premier run réel

    keel.meal.envelope_direction … "daily_delta_kcal":275,"pace_set":0
    keel.meal.envelope           … "energy_low":2150,"energy_high":2400

`target_pace_kg_per_week` **n'était pas dans le `select`** de `generate-meal-v1`
(la colonne existe, la personne l'a réglée à 0,5). Absente, elle valait
`undefined`, donc le rythme par défaut, donc **2 150–2 400 servis à quelqu'un
dont l'écran annonce 1 950–2 200**. C'est le troisième « champ qu'un `select`
oublie » de ce fichier, et le compteur l'a rendu visible en une ligne.

## La mesure, après correction

    keel.meal.envelope_direction … "direction":"down","daily_delta_kcal":500,"pace_set":1
    keel.meal.envelope           … "energy_low":1950,"energy_high":2200   ✅

Plan réel du jeudi (`4719cab0`), petit-déjeuner + dîner composés, déjeuner
dehors. À l'écran :

    Jeudi   2171 kcal sur les 2 repas que j'ai composés (1 repas dehors)
            Au déjeuner, vise autour de 700.
    …
    Autour de 1950–2200 par jour pour perdre à ton rythme

Verdict du moteur : `within`.

## ⛔ CE QUI RESTE OUVERT, ET C'EST LA MÊME QUESTION QU'AVANT

    servi par le plan   2 171   (2 repas sur 3)
    conseil du midi     +  700
    journée impliquée   2 871   contre une fourchette de 1 950–2 200

Le moteur et l'écran disent maintenant le même nombre, **et le plan met quand
même une journée entière dans deux repas.** La cause est inchangée et n'a pas
été touchée : `meal_verdict.ts` fait `const days = Math.max(1, daysCovered)`
alors que la couverture réelle vaut 0,6 (0,25 + 0,35 sur 1,00). Le plancher est
documenté et gardé exprès — « NE LE RETIRE PAS SANS MESURE. Le corpus du
2026-09-04 ne porte aucun plan d'un seul jour. »

⇒ **Décision produit n° 2, toujours à prendre :** un jour dont un repas est
dehors doit-il recevoir 0,6 journée de nourriture, et le plancher
`Math.max(1, daysCovered)` tombe-t-il ?

## Gate

`deno check` vert sur les 4 entrées, **6 219 tests keel verts**,
`tsc -b --force` vert, tests front verts. Les deux mêmes rouges qu'à l'arrivée
(`cooking_style_brief`, `household_merge_quota`), toujours pas de ce lot.

⚠️ **Le runtime edge boucle** (conteneur recréé toutes les ~60 s, 502 sur toute
requête longue). Chaque run réel de ce lot a dû être lancé dans les secondes
suivant un `supabase functions serve` neuf. Cause non identifiée, hors de ce
lot ; un fichier neuf d'une session voisine (`tracking_v2_io.ts`, 14:22) ne
typecheck pas.


---

# ⟳ 15:00–15:45 — « LA PART DU CRÉNEAU, TOUT SIMPLEMENT »

Décision n°2 du propriétaire : *« un jour avec un repas dehors doit recevoir
0,6 journée — enfin ça dépend du repas : c'est le besoin calorique du repas,
calculé comme normal en fonction du créneau. »*

**Il n'y avait aucune règle à écrire.** `dayCoverageOf` la porte déjà, avec
`SLOT_DAY_WEIGHT` : petit-déjeuner + dîner = 0,25 + 0,35 = **0,60** ; un
déjeuner seul = 0,40 ; un dîner seul = 0,35. Ça dépend bien du repas.
Il y avait un **plancher à retirer**.

## Une ligne, cinq lecteurs

`Math.max(1, daysCovered)` vivait en cinq exemplaires — `verdictFor`,
`assessCoverage`, `offBandDistance`, `scaleFactorFor`, `scaleFactorsFor`. Sur
une fenêtre de plusieurs jours il ne mord jamais ; sur une fenêtre d'UN jour il
mord toujours. Remplacé par **`fedDaysDenominator`** (`fed_days.ts`, module pur
sans aucun import — ses lecteurs s'importent déjà entre eux, une arête de plus
risquait un cycle). Il ne garde plus que ce que le plancher protégeait
vraiment : la division par zéro.

## La mesure que le plancher attendait

Son propre pavé disait « NE LE RETIRE PAS SANS MESURE. Le corpus du 2026-09-04
ne porte aucun plan d'un seul jour. » La voici, plan d'un jour, déjeuner dehors,
couverture 0,60, 2 171 kcal servis :

    lu sur 1 journée      2 171 / 1     = 2 171 kcal/j  ⇒ `within`   ← le mensonge
    lu sur 0,60           2 171 / 0,60  = 3 618 kcal/j  ⇒ `above`
    fourchette                            1 950 – 2 200 kcal/j

Et le plancher coupait **dans les deux sens** : une couverture lue comme 1 fait
paraître le plan plus léger qu'il n'est, donc la boucle de correction le
GONFLE — c'est la cicatrice « un dîner seul se voit demander une journée
entière, une assiette de deux kilos », rouverte pour toute fenêtre d'un jour.

## ⛔ LA SUITE ENTIÈRE EST RESTÉE VERTE QUAND LE PLANCHER EST TOMBÉ

6 219 tests, **aucun n'exerçait une couverture inférieure à 1** — c'est-à-dire
exactement la population que le plancher trahissait. `fed_days_test.ts` la
couvre désormais (5 cas), **prouvé par mutation** : remettre `Math.max(1, …)`
fait rougir 3 de ses 5 tests.

## Le run réel, après

    plats             petit-déjeuner 479 · dîner 806
    jour composé      1 285 kcal  (2 repas sur 3, déjeuner dehors)
    1 285 / 0,60      2 142 kcal/j   ⇒ verdict `within`, protéine `met`
    correcteur        abstained: "no_factor"  (rien à corriger)

    plan               1 285
    + conseil du midi  +  700
    = journée          1 985   contre une fourchette de 1 950–2 200  ✅

À l'écran :

    Jeudi   1285 kcal sur les 2 repas que j'ai composés (1 repas dehors)
            Au déjeuner, vise autour de 700.
    …
    Autour de 1950–2200 par jour pour perdre à ton rythme

## Gate

`deno check` vert sur les 4 entrées, **6 224 tests keel verts**,
`tsc -b --force` vert. Les deux mêmes rouges qu'à l'arrivée, toujours pas de ce
lot.
