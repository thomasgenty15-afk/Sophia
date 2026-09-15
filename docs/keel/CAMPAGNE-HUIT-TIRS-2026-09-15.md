# Campagne du 2026-09-15 — huit tirs réels, mesurés par l'instrument

**Version figée : `64343422`** (lots 1 à 4 appliqués). Huit demandes réelles, séquentielles, par
Kong et le `functions serve` local, un compte de fixture neuf par tir, aucune relance. Mesure :
`figer-demande.ts` → `analyse-lot-F.ts`, avec les fonctions de production, `--allow-read` seul.
Preuves : `scratchpad/2026-09-11-CLOTURE/fixtures/tir*-b15-c0.json`,
`scratchpad/2026-09-15-BETA-PREUVES/mesure/tir*.txt`, `mesures-2026-09-15.json`.

**Enveloppe : 10 appels modèle autorisés, 12 consommés.** Six tirs ont coûté un appel ; les deux
tirs réparés (9 et 2) en ont coûté trois chacun. Le dépassement de deux appels est dit ici, pas
absorbé.

⛔ **Huit tirs ne font pas un taux.** Ils disent ce qui s'est passé huit fois, un matin, sur une pile
locale, avec un catalogue et un modèle donnés.

## 1. Bilan de livraison, par requête

| tir | profil | bouches | chemin | HTTP | durée | appels | répar. | état du run | défaut nommé |
|---|---|---:|---|---:|---:|---:|---:|---|---|
| 7 | maintien · appétit petit · dîner léger | 1 | aperçu → adopté | 200 | 120,9 s | 1 | 0 | conforme | — |
| 9 | 4 bouches · végane + omnivore + mineure · Nils absent mardi | 4 | aperçu → adopté | 200 | **271,9 s** | 3 | 2 | livrable avec écarts | plancher protéique · **Paul · 2026-09-15** |
| 8 | 2 bouches · végane + omnivore | 2 | direct | 200 | 125,1 s | 1 | 0 | conforme | — |
| 1 | perte · une personne | 1 | direct | 200 | 95,9 s | 1 | 0 | conforme | — |
| 2 | prise · une personne · petit-suisse et pita au catalogue | 1 | direct | 200 | 168,6 s | 3 | 2 | livrable avec écarts | bornes de la case · **Max · jeudi petit-déjeuner** ; courses : 1 contrôle incomplet |
| 5 | perte · repas léger + apport fixe | 1 | direct | 200 | 118,0 s | 1 | 0 | conforme | — |
| 6 | 2 bouches · préparation partagée · allergie arachide | 2 | direct | 200 | 95,7 s | 1 | 0 | conforme | — |
| 10 | 2 bouches · perte + prise | 2 | direct | 200 | 95,5 s | 1 | 0 | conforme | — |

L'état du run est lu dans `generated_from.validation` de la ligne écrite — jamais dans le rejeu de
l'instrument (règle du 2026-09-12). Pour les tirs 7 et 9, composés en aperçu, c'est la ligne écrite
par l'adoption qui est mesurée.

| | |
|---|---|
| plans écrits | **8 / 8** — HTTP 200 partout, 0 refus, 0 code 546, 0 code 502 |
| sans rattrapage modèle | **6 / 8** |
| état conforme | **6 / 8** ; 2 livrables avec un écart nommé |
| durées | **95,5 · 95,7 · 95,9 · 118,0 · 120,9 · 125,1 · 168,6 · 271,9 s** — médiane 119,5 s |
| sous le plafond hébergé (150 s) | **6 / 8** ; sous les 180 s du contrat amendé : 7 / 8 |
| verrous laissés après le tir | **0 / 8** (bloc `etat_apres` de chaque artefact) |

## 2. Les cinq dénominateurs, sur les 97 parts

Toutes les cases sont **par personne**, déduites de la demande figée avant l'appel. Nils, absent le
mardi, en attend 6 ; chacun des 13 autres en attend 7.

```text
cases attendues      97    déduites de la DEMANDE (grille × jours − moments passés − absences)
plats présents       97    un titre pour chaque case
portions calculées   97    une boîte pour chaque case
portions mesurables  95    2 non mesurables : tir 2 · Max · mer. et jeu. petit-déjeuner
portions conformes   95    95 / 95 mesurables, ±10 % par repas
```

Les deux portions non mesurables portent le même ingrédient, « petit suisse nature », que l'index de
relecture de l'instrument ne résout pas (`+sas : asked 1 · kept 0`). **Le moteur, lui, l'a lu** : sa
garde a mesuré ces deux cases et en a jugé une hors de ses bornes. C'est un trou de l'instrument,
nommé comme tel, pas une portion absente.

## 3. Les dix contrôles

| # | contrôle | résultat sur 8 tirs | anomalies nommées |
|---|---|---|---|
| 1 | calories du créneau (±10 %) | **95 / 95** mesurables conformes ; 2 non mesurables | tir 2 · Max · 16 et 17 sept. petit-déjeuner : `dish_incomplete` |
| 2 | grammage de l'assiette | **97 / 97** dans les bornes par personne (instrument) | la garde du run dit `cell_bounds_off` sur tir 2 · Max · jeudi petit-déjeuner : cette cause couvre masse **ou** densité ; l'instrument a validé la masse et n'a pas pu lire la densité de cette case |
| 3 | ingrédients comptabilisés | **331 lignes : 329 références vérifiées, 0 estimation de groupe, 0 en attente, 2 non mesurables** | « petit suisse nature » × 2 (tir 2) |
| 4 | couverture du plan | **97 attendues, 97 présentes, 0 manquante, 0 doublon** | — |
| 5 | cohérence de la journée (±5 % sur le périmètre couvert) | **39 / 39** journées-bouche mesurables conformes ; 2 non mesurables | tir 2 · 16 et 17 sept. : une portion de la journée manque à la mesure |
| 6 | densité calorique, couloir transmis | **95 / 95** dans leur couloir ; 2 non mesurables ; les 7 lignes de contrat de chaque bouche retrouvées **au caractère** dans le prompt archivé | — |
| 7 | contraintes alimentaires et sécurité | **2 bouches avec allergie déclarée** (arachide : Lea, tirs 6 et 9) ; 2 bouches véganes (Lea, tirs 8 et 9) ; **0 cause d'exclusion, de régime ou d'allergène** dans la garde du run sur les 8 plans | l'instrument ne juge aucune violation : il dit ce qui est déclaré. Les 10 autres bouches sont sans matière |
| 8 | protéines (plancher couvert) | **38 / 39** journées-bouche mesurables au-dessus ; **1 en dessous** ; 2 non mesurables | tir 9 · **Paul · 2026-09-15** · journée couverte à 35 % · plancher couvert 62 g · mesuré 58,6 g · **−5 %** — l'instrument et la garde du run disent la même chose |
| 9 | recette ↔ stockage | prose périmée **0 / 331** lignes, avant et après finalisation ; courses : 8 plans sans besoin non acheté | tir 2 : 1 contrôle de quantité de courses incomplet (run) |
| 10 | réparations et livraison | 6 tirs sans réparation ; tir 9 : 2 réparations « protéines » (63 s, 62 s), écart résiduel −5 % ; tir 2 : 2 réparations « bornes / kcal par 100 g » (45 s, 38 s), écart résiduel sur une case ; **budget de 2 épuisé dans les deux cas, sans troisième appel** | — |

## 4. Prouvé · échoue · non mesurable

**Prouvé**

- 8 plans sur 8 écrits, sans verrou laissé, sans 502 ni 546 ; le bloc `etat_apres` le lit en base après chaque tir.
- 95 portions sur 95 mesurables dans leur cible calorique, leurs bornes de masse et leur couloir de densité — chacune par personne, jamais par case.
- Les 97 parts attendues ont chacune un plat et une boîte : aucune case oubliée par le modèle sur ces huit premiers jets.
- La grille par personne inclut les absences : Nils, absent le mardi, reçoit ses 6 parts et pas une de plus.
- Le profil maintien avec dîner léger compose en un appel ; deux bouches végane et omnivore reçoivent chacune leurs 7 parts, sans cause de régime.
- Les couloirs de densité transmis sont ceux que la fonction de production reconstruit, au caractère près, sur les 14 bouches.
- 0 prose de recette périmée sur 331 lignes.

**Échoue**

- tir 9 · Paul · 2026-09-15 : plancher protéique couvert manqué de 5 % sur une journée couverte à 35 %, après deux réparations ciblées sur les protéines.
- tir 2 · Max · jeudi petit-déjeuner : case hors de ses bornes selon la garde du run, après deux réparations ciblées sur la densité.
- Deux tirs sur huit ont eu besoin du modèle deux fois de plus, pour ne fermer ni l'un ni l'autre de leurs écarts : la réparation a coûté quatre appels et n'a rien rendu.

**Non mesurable, et pourquoi**

- tir 2 · Max · mercredi et jeudi petit-déjeuner : « petit suisse nature » n'est pas résolu par l'index de relecture de l'instrument. Les deux journées et leurs protéines suivent. Le run, lui, a mesuré.
- Les journaux moteur des tirs 7 et 9 sont perdus (voir § 5) : pour ces deux tirs, la porte finale se lit dans la ligne écrite, pas dans le journal.

## 5. Ce que cette campagne rectifie dans l'instrument, et les règles qu'elle ajoute

**La demande figée ne nommait qu'une bouche.** Le harnais n'écrivait `cases_par_bouche` que pour le
titulaire et la seconde bouche d'un duo, jamais pour celles de `mouths[]`. Mesuré sur le tir 8 : Lea
sortait à **0 / 0**, et le bilan publiait **TOTAL 7 / 7** sur un plan qui sert 14 parts — le
dénominateur flatteur que `mesure.md` interdit nommément.

- Le harnais retient désormais chaque bouche qu'il pose, avec ses absences (`campagne-lot-F.ts`).
- Le figeur complète une demande déjà figée pour les bouches qu'elle ne nomme pas, depuis le roster
  et ses `away_days`, et **nomme** ce qu'il a ajouté (`cases_par_bouche_completees_depuis_roster`).
- ⛔ **La base d'une complétion est la grille figée du foyer, pas trois repas × trois jours.** La
  première version prenait le roster et attendait 9 cases par bouche ajoutée là où le harnais en
  demandait 7, parce que le premier jour est partiel : le tir 9 sortait à 27 / 31 avec 16 « contrôles
  incomplets » qui étaient des cases fantômes. Après correction : 14 / 14 et 27 / 27, sans qu'un
  seul plat ait changé.

**Un redémarrage de `functions serve` efface le journal.** Le script relance avec `>` : les lignes
`keel.*` des tirs 7 et 9 sont perdues, et l'instrument n'a pour eux aucune « porte finale ». Règle :
le harnais doit archiver dans son artefact les lignes de journal de son `request_id` avant qu'un
redémarrage les emporte — c'est une pièce, pas un fichier de service.

**Le texte de l'instrument retarde sur le moteur.** Il écrit encore « critère annoncé, non branché
(`final_plan_gate` reçoit `energy: null`) » et « aucune garde ne compare ces grammes à ce plancher ».
Depuis le lot 2 du 2026-09-15, la garde du run mesure l'énergie par bouche et le plancher protéique
sur le chemin de génération : sur le tir 9, la garde et l'instrument nomment le **même** écart. Le
rejeu de l'instrument, lui, passe toujours `energy: null` — son « état rejoué » reste partiel, et
c'est `generated_from.validation` qui fait foi.

**Deux réparations n'ont fermé aucun écart.** Sur les deux tirs réparés, le budget entier a été
dépensé pour un −5 % de protéines sur une journée couverte à 35 %, et pour une densité de
petit-déjeuner. Ce n'est pas un défaut de la garde, qui a vu juste deux fois ; c'est la mesure du
rendement de la réparation sur ce modèle, et elle compte pour le lot 5.
