# Campagne élargie — étape 3 du chantier densité/portions/Fast

> ## ⛔ 2026-09-10 · CINQ CHIFFRES DE CE RAPPORT SONT FAUX. Lire le § ⑥ d'abord.
>
> Le lot 8 de `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md` a fait réparer
> l'instrument, puis re-mesurer ces mêmes vingt runs hors ligne. Le banc corrigé
> vit dans **`../2026-09-10-LOT8-BANC/`** ; son rapport est
> **`../2026-09-10-LOT8-BANC/RAPPORT-LOT8.md`**.
>
> Les paragraphes ① à ⑤ ci-dessous sont **conservés tels qu'ils ont été
> publiés**. Ils ne sont pas corrigés en place : un rapport réécrit sans trace
> ne dit plus quel chiffre a circulé. Le § ⑥ dit, ligne par ligne, ce qui
> change et pourquoi.

**20 générations** (10 scénarios × 2), séquentielles, une requête de plan à la fois. `intent: "draft"` — aucune écriture chez un utilisateur réel.

## Le référentiel de mesure, figé et identifié

```
# RÉFÉRENTIEL FIGÉ — extrait le 2026-09-10T11:59:43Z
food_composition_refs  lignes=943  sha256=e8b838e73aa96c75f3a033b7292a04f6cb8ee50922e46d30d6a914b6d895719f
food_composition_aliases  lignes=2715  sha256=b39220eb9ea5c7cbb32d45517f226009c72934398ff86ea2850dbdf77fa57026
```

## ① Ce que chaque génération a donné

| cas | gén | HTTP | mur | appels | rattrapages | bornes | jours conformes | classes |
|---|---|---|---|---|---|---|---|---|
| S1 | 1 | 200 | 151.4 s | 3 | 1/2 | — | 50.0 | conf 1 · not_ 1 · resi 1 |
| S1 | 2 | 200 | 55.5 s | 2 | 0/2 | — | — | not_ 1 · unme 2 |
| S2 | 1 | 200 | 142.9 s | 2 | 1/2 | — | 0.0 | not_ 1 · resi 3 |
| S2 | 2 | 200 | 187.5 s | 3 | 2/2 | — | 0.0 | not_ 1 · resi 3 |
| S3 | 1 | 200 | 155.0 s | 4 | 2/2 | — | — | not_ 1 · unme 2 |
| S3 | 2 | 200 | 50.4 s | 2 | 0/2 | — | — | not_ 1 · unme 2 |
| S4 | 1 | 200 | 103.7 s | 3 | 1/2 | — | — | not_ 1 · unme 3 |
| S4 | 2 | 546 | 196.9 s | 3 | —/— | — | — |  |
| S5 | 1 | 200 | 65.3 s | 2 | 0/2 | — | — | unme 6 |
| S5 | 2 | 546 | 220.3 s | 2 | —/— | — | — |  |
| F1 | 1 | 200 | 107.5 s | 2 | 0/2 | 100.0 | — | not_ 4 · unme 4 |
| F1 | 2 | 200 | 98.3 s | 2 | 0/2 | 100.0 | — | not_ 4 · unme 4 |
| F2 | 1 | 546 | 180.7 s | 3 | —/— | — | — |  |
| F2 | 2 | 200 | 211.9 s | 2 | 1/2 | 87.5 | 0.0 | not_ 4 · resi 1 · unme 3 |
| F3 | 1 | 546 | 107.1 s | 1 | —/— | — | — |  |
| F3 | 2 | 546 | 55.6 s | — | —/— | — | — |  |
| F4 | 1 | 546 | 211.5 s | 1 | —/— | — | — |  |
| F4 | 2 | 546 | 244.4 s | 3 | —/— | — | — |  |
| F5 | 1 | 200 | 255.2 s | 3 | 1/2 | 100.0 | 100.0 | conf 2 · unme 6 |
| F5 | 2 | 546 | 136.0 s | 1 | —/— | — | — |  |

## ② L'acceptation, critère par critère

| critère | seuil | mesuré | |
|---|---|---|---|
| générations abouties | — | **12/20** | |
| jours-bouches conformes (±5 %) | ≥ 90 % | **27.3 %** (3/11) | ⛔ |
| assiettes dans les bornes (foyer) | repère 80 % | médiane **100.0 %** | |
| exclusion nouvelle sur le payload final | 0 | **0** | ✅ |
| classes attribuées | 100 % | 62 jours-bouches, tous classés | ✅ |

**Le détail des classes, sur toute la campagne :**

- `conformant` : **3**
- `residual_gap` : **8**
- `unmeasurable` : **32**
- `not_applicable` : **19**

## ③ Les durées

- solo : médiane **123.3 s**, maximum **187.5 s**
- foyer : médiane **159.7 s**, maximum **255.2 s**
- toutes : maximum **255.2 s**, sous l'échéance de 380 s : ✅

⚠️ Vingt points ne font pas un p95. On rapporte la médiane et le maximum.

---

## ④ Ce que la campagne a trouvé

### ⛔ La base mesurable est PETITE, et c'est le premier résultat

**32 jours-bouches sur 62 sont `unmeasurable`** — le référentiel figé ne sait pas
peser la journée. Les termes qui manquent sont nommés dans `mesures.json`, et ils
se ressemblent tous :

```
sweet peppers · mature cheddar · baking potato · almond butter · rocket leaves
wholemeal spaghetti · reduced salt soy sauce · certified gluten free oats · pecans
```

Ce sont des libellés de **produit** anglais que la table à slugs CIQUAL ne porte
pas. ⛔ **Ce n'est pas ce chantier qui les a créés** — c'est la profondeur du
référentiel, déjà nommée ailleurs. Mais ça plafonne ce que la campagne peut
prouver : le taux de conformité de **27,3 %** repose sur **onze** jours-bouches,
pas sur soixante-deux. C'est un signal, pas un verdict.

### ✅ Là où le moteur peut mesurer, il dimensionne exactement

`F5·1`, Maya (perte de poids, foyer de quatre, une seule session de cuisine) :

```
dimanche  servi 1935  cible 1934   +0,1 %
lundi     servi 1934  cible 1934    0,0 %
```

C'est la chaîne `portion_v1` — part par créneau, recette standard, facteur par
bouche — et elle atterrit **au kcal près** quand la mesure est possible.

### ⚠️ Le cas que le chantier visait s'est amélioré, une génération sur deux

`S2` est le déficit contraint : la campagne du 2026-09-09 le mesurait à **2 359
kcal de moyenne pour une bande plafonnant à 1 900** (+24 %), et le produit le
disait `above` sans que rien n'atteigne l'écran.

| | jour 1 | jour 2 | jour 3 | moyenne | verdict du produit |
|---|---|---|---|---|---|
| **gén. 1** | 1 763 (−10,9 %) | 2 131 (+7,7 %) | **3 148 (+59,1 %)** | 2 347 | `above` / protéine `under` |
| **gén. 2** | 2 158 (+9,1 %) | 1 688 (−14,7 %) | 1 861 (−5,9 %) | **1 902** | `within` / protéine `met` |

La génération 2 atterrit dans la bande (cible 1 978). La génération 1 ne le fait
pas, et elle porte un jour à 3 148. ⛔ **Deux tirs, deux réponses : la cause n'est
pas le moteur, c'est la dispersion de ce que le modèle compose.**

### ⛔ Le verdict du produit juge la MOYENNE, pas la dispersion — toujours vrai

`S1·1` sort `verdict_energy: "within"` avec un samedi à **+15,4 %**. Le défaut
n° 2 de la campagne du 2026-09-09 n'est pas refermé par ce chantier, et il ne
prétendait pas l'être : rien ne regarde l'écart **entre les jours**.

### ✅ La réserve de priorité du budget a mordu EN RÉEL

Sur `F5`, dans le journal du produit :

```
⚠️ rattrapage refusé: protein_anchor_retry — repair_reserved
```

C'est l'arbitrage A4/A5 vu en situation, pas seulement en test : la protéine
cède son tour aux deux classes réservées (sécurité, densité). Le budget a été
consommé jusqu'à **2/2** sur `S2·2` et `S3·1`, et jamais dépassé.

### ⛔ LE 546 EST UNE LIMITE CPU QUI NE SURVIT PAS À DEUX PLANS LOURDS D'AFFILÉE

**8 générations sur 20** ont fini en `546 WORKER_LIMIT`, malgré un réessai
chacune. Le motif est toujours le même, lu dans le journal du conteneur :

```
CPU time soft limit reached  →  CPU time hard limit reached
```

⚠️ **La distribution est parlante** : solo **8/10** abouties, foyer **4/10**. Et
l'échec grandit avec l'avancement de la campagne — `F1` passe en 107 s au début,
`F3` échoue en 55 s **sans un seul appel modèle** plus tard. Un worker qui meurt
avant d'appeler le modèle n'est pas un plan trop lent : c'est un budget CPU
d'isolat déjà consommé.

`policy = "per_worker"` (`supabase/config.toml`) **réutilise le worker** d'une
requête à l'autre. Deux plans de foyer à la suite partagent donc un budget prévu
pour un.

⛔ **On n'a PAS relevé la limite.** Ce que ça coûte, dit franchement : **les six
générations de `F3` et `F4` manquent**, c'est-à-dire les deux foyers les plus
durs (extrêmes + végétarienne + allergie). La validation edge de ces cas est
**bloquée**, pas réussie.

**Le rejeu propre, s'il est lancé** : redémarrer le runtime edge **avant chaque**
génération de foyer, ce qui donne à chacune un worker neuf. C'est une hygiène de
banc — ça ne change rien au produit — et c'est la seule façon de savoir si `F3`
et `F4` échouent parce qu'ils sont lourds ou parce qu'ils étaient les huitièmes.

---

## ⑤ ⛔ CORRECTION — « unmeasurable » était un défaut DU BANC, pas du produit

Le § ④ ci-dessus disait « 32 jours-bouches sur 62 sont `unmeasurable`, le
référentiel ne sait pas peser ». **C'est faux dit comme ça, et voici la mesure.**

Le produit possède un appel de secours : quand un terme n'est pas dans
`food_composition_refs`, `repairPlanComposition` demande sa composition
(`gpt-5.4-nano`) ou la dérive des bornes de son groupe, puis **augmente l'index
en vol** (`withFilledRefs`). Sur `S3·1`, le journal du produit dit :

```
keel.meal.composition_fill  unknowns 2 · requested 2 · answered 2 · kept 2
shares: table 98,8 % · group_bounds 1,2 % · model 0 %
```

Le plan a donc été pesé. **C'est mon banc qui rejouait sur la table SEULE**, sans
l'augmentation — donc plus sévère que le runtime.

Second passage, sur `ref-avec-sas/` (la table figée **plus** les 291 lignes du sas
mises à la forme d'une fiche, champ pour champ comme `refFor` les construit) :

| | table seule | table + sas (ce que le runtime a eu) |
|---|---|---|
| `unmeasurable` | 32 | **17** |
| base mesurable | 11 jours-bouches | **26** |
| conformité ±5 % | 27,3 % | **34,6 % (9/26)** |

⛔ **Le chiffre reste très sous le seuil de 90 %**, et il est maintenant sur une
base 2,4 fois plus grande. Ce n'est plus un artefact.

### Où sont les écarts, et c'est la ligne qui compte

Médiane des écarts absolus : **14,5 %** sur 17 jours-bouches ; **3 sur 17**
seulement tiennent dans ±10 %. Les huit plus gros :

```
S5·1 solo ven   3962 / 2159   +83,5 %
S2·1 solo dim   3148 / 1978   +59,1 %
S5·1 solo jeu   3358 / 2159   +55,5 %
S5·1 solo mer   3265 / 2159   +51,2 %
S5·1 solo mar   2540 / 2159   +17,6 %
S3·2 solo ven   3208 / 3810   −15,8 %
S1·2 solo sam   2928 / 2541   +15,2 %
S2·2 solo sam   1688 / 1978   −14,7 %
```

⛔ **LES HUIT SONT SUR LA LANE SOLO.** Et le foyer, quand il peut être mesuré,
atterrit : `F5·1` sort **4 jours-bouches conformes sur 4** (Maya à 0,0 % et
0,1 %).

C'est exactement ce que le chantier disait de lui-même et qui reste ouvert :
**le solo ne dimensionne pas.** `applySizing` (`portion_v1`) n'est câblé que sur
la lane du foyer ; le solo passe encore par `portion_scaling`, dont le
`MIN_SCALE = 0,75` ne peut retirer qu'un quart. Un plan composé à 3 962 kcal pour
une cible de 2 159 ne peut pas redescendre : le rabot bute à ×0,75.

### Et le sas ne remonte pas dans la table

Les valeurs remplies partent dans `food_composition_pending` — un **sas**, pas le
référentiel. La promotion existe (`promote_pending_food_compositions(p_min_sightings
= 3, …)`) mais **rien ne l'appelle** : la dernière migration du sas s'appelle
`le_sas_est_cure_a_la_main`. État aujourd'hui :

```
pending 252  ·  promoted 27  ·  rejected 7  ·  needs_review 5
dont 21 lignes PENDING avec sightings ≥ 3 — éligibles, jamais promues
maximum vu: 14 sightings ("galettes de ble complet")
```

Conséquence : chaque plan qui rencontre `mature cheddar` **repaie l'appel**, et
aucune journée n'est mesurable en rejeu tant que la ligne n'est pas promue.

---

## ⑥ ⛔ CORRECTION DE L'INSTRUMENT — lot 8, 2026-09-10

Le banc corrigé et la re-mesure vivent dans **`../2026-09-10-LOT8-BANC/`**
(`banc.py`, `20-mesure.py`, `21-mesure.ts`, `30-rapport.py`,
`RAPPORT-LOT8.md`). Aucune génération nouvelle, aucun appel modèle : les mêmes
vingt runs, re-lus par les fonctions de production.

### Les neuf défauts de l'instrument, et ce que chacun coûtait

| # | défaut | mesure du défaut |
|---|---|---|
| ① | **fenêtre de journal de deux heures.** `docker logs --since` reçoit une heure UTC sans `Z` ; la machine est en CEST, donc la fenêtre partait **deux heures trop tôt**. | `log-F5-…json` porte **13 identifiants de requête et 6 comptes** pour une génération. `20-mesure.py` lisait `tags[…][-1]`. |
| ② | **valeur absente rendue comme zéro.** | voir la ligne « exclusion » ci-dessous. |
| ③ | **couverture déduite des plats rendus.** Solo : « plats ≥ moments déclarés » ; foyer : « le meilleur jour de cette bouche dans ce plan » — une règle circulaire. | 19 jours-bouches classés `not_applicable`, donc retirés de la mesure. |
| ④ | **journée partielle = « non applicable ».** Un dîner seul le jour même sortait de la mesure au lieu d'être jugé contre son budget. | les 19 mêmes. |
| ⑤ | **bouche sans couvercle nominatif sans mesure interne.** `mouthDayEnergy` s'abstient sur un bac partagé, à raison ; le banc s'arrêtait là. | **F1 : 8 jours-bouches sur 8** illisibles, alors que le service collectif tombe au kcal près. |
| ⑥ | **médiane de taux au lieu du compte des occurrences.** | « médiane 100 % » sur **quatre** runs foyer ; la lane solo n'était pas contrôlée du tout. |
| ⑦ | **« zéro exclusion » dérivé d'un champ absent.** | `exclusion_belt` n'est dans `generated_from` sur **aucune** des deux lanes ; `final_bites` n'existe pas côté solo. `None` douze fois sur douze. |
| ⑧ | **index du run remplacé par le sas d'aujourd'hui.** `21-mesure-avec-sas.py` versait les 291 lignes actuelles dans tous les runs, recopiées à la main, sans passer par les ceintures de `withFilledRefs`. | un run de 12 h 00 « lisait » une ligne écrite à 13 h 13. |
| ⑨ | **546 compté comme un échec produit.** | 8 générations sur 20. |

### Chiffre publié → chiffre corrigé

| chiffre du § ② | publié | après correction | cause |
|---|---|---|---|
| générations abouties | **12/20** | **12 mesurées · 8 `non testé`** | ⑨ — le `546` est la limite CPU de l'isolat, hors périmètre (§ 10 du plan) |
| jours-bouches conformes (±5 %) | **27,3 %** (3/11), puis **34,6 %** (9/26) au § ⑤ | **63,4 %** (26/41) | ③④⑤⑧ — cible **couverte** au lieu de la cible du jour entier, mesure interne du service collectif, index du run |
| …dont assiette nominative | — | **34,8 %** (8/23) | axe nouveau |
| …dont service collectif | — | **100 %** (18/18) | ⑤ |
| assiettes dans les bornes (foyer) | médiane **100 %** | **74/124** repas-bouches, **15 violations listées**, **35 incontrôlables** | ⑥ — et la lane solo entre dans la mesure |
| exclusion nouvelle sur le payload final | **0** ✅ | **0 « zéro vérifié » · 4 « rien à contrôler » · 16 « sans trace »** | ⑦ |
| couverture | non mesurée | **162/164**, deux repas attendus absents | ③ |
| classes attribuées | 62 jours-bouches | 62 jours-bouches, mais **sur 12 générations**, pas 20 | ⑨ |

### ⛔ Ce qui devient FAUX, en toutes lettres

**① « La réserve de priorité du budget a mordu EN RÉEL » (§ ④) est faux tel
qu'attribué.** Aucune des vingt requêtes archivées ne porte de
`keel.plan.repair_refused`. Les quatre lignes
`protein_anchor_retry — repair_reserved` existent bien, mais elles appartiennent
à **quatre requêtes qui n'ont jamais émis leur `wall`** — des tentatives tuées
par la limite CPU, sur les comptes F2, F3 et F5. Le compteur du banc était
**cumulatif** (1 sur `F2·1`, 2 sur `F3·1`, 3 sur `F5·1`, 4 sur `F5·2`) : la même
ligne recomptée à chaque run par la fenêtre de deux heures. Ce qui reste vrai et
qui vient du brouillon, lui correctement portefeuillé : `plan_budget.repairs_used`
monte bien à 2/2 sur `S2·2` et `S3·1`.

**② « Exclusion nouvelle sur le payload final : 0 ✅ » est faux.** Le champ lu
(`generated_from.exclusion_belt.final_bites`) n'existe sur aucun des douze
brouillons. Ce qui existe est `keel.household_meal.box_counts.exclusion_belt`,
et il dit `mouths: 0, checked: 0` sur les quatre runs foyer : la ceinture n'a
**rien regardé**, parce qu'aucune fixture ne déclare d'exclusion. Un ✅ sur une
ceinture qui n'a rien examiné est un compliment adressé à un contrôle qui n'a
pas eu lieu. Côté solo, `generate-meal-v1:3096` ne journalise la ceinture que
si un terme est déclaré : l'absence de trace ne se distingue pas de « rien à
contrôler ».
⚠️ Ce qui a réellement mordu, sur `F5·1`, c'est la ceinture de **régime** :
`mouths: 1, bites: 4, separated: 4` — Maya, végétarienne. Le rapport publié ne
la lisait pas.

**③ Les huit plus gros écarts du § ⑤ ne tiennent plus.** Cinq d'entre eux
venaient de `S5·1`, mesuré sur un index que ce run n'a jamais eu :
`certified gluten free oats`, `pecans`, `mature cheddar` ne sont dans le sas
qu'en `group_bounds`, et `filledFromPendingRow` refuse ces lignes-là. Sur
l'index restauré, **les six journées de `S5·1` sortent `unmeasurable`** — pas
« +83,5 % ». Les écarts qui restent, tous solo :

```
S2·1  dim  3148 / 1918   +64,1 %
S2·2  jeu   845 /  671   +25,9 %
S1·1  sam  2933 / 2541   +15,4 %
S1·2  sam  2928 / 2541   +15,2 %
S4·1  ven  2573 / 2248   +14,5 %
```

**④ La cible solo publiée n'était pas celle du produit.** Le banc prenait
`(energy_low + energy_high) / 2`, le milieu de l'enveloppe. Le moteur poursuit
`keel.meal.day_target.kcal`. Sur `S2` : **1 978 publié contre 1 918 réels**,
3,1 % d'écart injecté par l'instrument avant toute mesure.

### Ce que la correction fait APPARAÎTRE, et que le rapport publié ne voyait pas

- **Les quinze violations de masse sont TOUTES sur la lane solo.** Zéro sur la
  lane foyer. Les bornes du banc sont, au gramme près, celles que le produit
  journalise lui-même (`keel.meal.day_target.grams`) : 250–700 « table »,
  250–671 « target », 80–300 pour une collation. `applied_to_grams: 0` dans le
  même journal — la lane solo **calcule ses bornes et ne les applique pas**.
- **Le service collectif atterrit.** Quinze bacs lisibles, écart absolu médian
  **0 %**, maximum **0,3 %** contre la somme des cibles de leurs mangeurs.
- **Deux repas attendus manquent** (`S3·1` et `S3·2`, `snack_am` du jeudi).
  `SLOT_PASSED_HOUR.snack_am` vaut `null` — une collation ne tombe jamais par
  l'horloge — donc le produit l'attendait à 14 h 09 et ne l'a pas composée.
- **Fast n'atteint pas les appels auxiliaires.** Sur les 63 transmissions de la
  fenêtre, **19** partent sans palier (`tier_sent: null`, `tier_echoed:
  "default"`) : `composition_fill` (18) et `dedicated_repair_fill` (1). La
  décision § 9 du plan demande Fast « aussi aux appels auxiliaires ».

### Ce que le banc corrigé ne sait toujours pas faire

- **La conformité protéique et la conformité de densité restent `inconnu`.**
  Les archives ne portent ni les objectifs protéiques résolus, ni le couloir de
  densité par recette. Un `conforme` par défaut serait un mensonge.
- **La part `group_bounds` d'un run n'est pas restaurable** — 1,2 % à 11,6 %
  selon les runs. Elle est nommée, et les journées qu'elle touche sortent
  `unmeasurable`.
- **Six générations sur les cas les plus durs (`F3`, `F4`) restent non
  testées.** Le 546 est hors périmètre ; rien ici ne le corrige.
