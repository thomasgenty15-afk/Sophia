# Campagne « à-côtés » — 2026-09-23

Plan exécuté : assiettes normales, à-côtés par objectif, plat ≤ 550 g, recette de
référence (plan approuvé le 2026-09-23, audit `AUDIT-DOSAGES-2026-09-23.md`).
Tout est **en local, rien n'est commité, rien n'est déployé**.

## 1. Ce qui a changé dans le produit

| Sujet | Avant | Maintenant |
|---|---|---|
| Le repas | un plat porte 100 % du repas | plat + à-côté (entrée, fromage, dessert, pain) au déjeuner et au dîner, selon l'objectif et le réglage de la personne |
| Plat adulte, borne haute | 700 g (ado 650 g) | 550 g ; 700 g seulement en repli, quand la personne refuse tout et n'a pas de collation |
| Visée de densité d'une table | la personne la plus exigeante (140 kcal/100 g) | l'assiette de la personne du milieu ; seuil de table 115, recette de référence 125 kcal/100 g |
| Forme de l'assiette | la même pour tous, seule la quantité change | le féculent suit l'objectif (perte : ≤ 30 % de l'énergie du plat), aussi pour une personne seule (v38) |
| Recette dans la consigne | « more starch », « the energy comes from the starch » | recette de référence : 110–130 g de protéine, 180–200 g de légumes, 60–70 g de céréale sèche, petit-déjeuner type ; phrases pro-féculent retirées |
| Protéines en perte | 1,4 g/kg | 1,2 g/kg ; une personne sans compte reçoit le plancher de SON objectif |
| Âge | milieu de la tranche | âge exact (la consigne imprime toujours la tranche) |
| `day_kcal` | calculé avant le rabotage (affichait 100 %) | recalculé sur les boîtes finales + à-côtés, après les bornes |
| Contrôle des exclusions et du régime | lisait les boîtes du modèle (0 contrôle sur les plans v4) | lit les boîtes construites par le moteur (`judgeDishEaters`), par personne |
| Réparation | ne voyait ni les fiches ni la recette | reçoit fiches, notes, recette de référence et à-côtés |
| Réglage | — | « Entrée, fromage, dessert, pain » : Oui / Non / Selon l'objectif, sur la fiche de chaque personne ; la mémoire peut le changer (« il ne prend jamais de dessert ») |

Données : 13 fromages ajoutés au référentiel (CIQUAL 2025, dont comté, emmental,
camembert, brie), `goat_cheese` corrigé (c'était de la viande de chevreau),
poids d'un pot pour yaourt nature (125 g), skyr (150 g) et fromage blanc (100 g).

## 2. La campagne : 17 vraies générations

États : **A** ton foyer (ihu), **B** clone du foyer avec refus (Thomas et
Christèle refusent tout, Fabrice entrée seulement), **C** clone avec deux notes
mémoire, **D** une personne seule en perte (corps de Fabrice), **E** famille
(Claire allergique au lait, Hugo végétarien sans compte en prise, Léo 8 ans),
**N** 7 notes passées au classifieur sans génération.

### Avant / après, ton foyer (état A, 3 tirages v37)

| | Avant (audit) | Maintenant |
|---|---|---|
| Plat médian Thomas / Christèle / Fabrice | 700 / 543 / 500 g | 550 / 466–486 / 472–478 g |
| Plat max | 700 g | 550 g |
| Céréale sèche médiane | 166 / 114 / 82 g | 86–116 / 65–70 / 44–51 g |
| Part d'énergie du féculent, Fabrice | 0,39 | 0,27–0,31 |
| Légumes au repas, Fabrice (plat + entrée) | — | 343–370 g |
| Énergie servie / cible (boîtes finales) | 89–100 % (rabotage caché) | 97,6–101,6 % |
| Âge exact | — | cibles 3 354 / 1 920 / 1 754 kcal, justes |

### Tableau complet

| Tir | Personne | Plat méd./max (g) | Repas méd. (g) | Part à-côté | Céréale sèche méd. (g) | Part féculent | Légumes repas (g) | Fruits/j (g) | Jours < plancher prot. | Énergie % | Petit-déj max (g) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Thomas (prise) | 550/550 | 885 | 0,33 | 86 | 0,48 | 199 | 887 | 0 | 98–100 | 444 |
| A1 | Fabrice (perte) | 472/524 | 738 | 0,14 | 51 | 0,31 | 370 | 238 | 0 | 100 | 308 |
| A1 | Christèle (maintien) | 476/539 | 636 | 0,18 | 70 | 0,42 | 192 | 388 | 0 | 100 | 337 |
| A2 | Thomas | 550/550 | 862 | 0,30 | 116 | 0,55 | 169 | 771 | 0 | 98–99 | 499 |
| A2 | Fabrice | 478/503 | 722 | 0,14 | 44 | 0,27 | 343 | 251 | 1 | 100–101 | 345 |
| A2 | Christèle | 486/550 | 647 | 0,16 | 65 | 0,39 | 183 | 371 | 0 | 100–102 | 378 |
| A3 | Thomas | 550/550 | 885 | 0,33 | 89 | 0,49 | 187 | 721 | 0 | 99–100 | 545 |
| A3 | Fabrice | 472/535 | 718 | 0,14 | 47 | 0,27 | 356 | 156 | 1 | 100–101 | 376 |
| A3 | Christèle | 466/550 | 656 | 0,18 | 70 | 0,40 | 185 | 300 | 0 | 100–101 | 413 |
| B1 | Thomas (refuse tout) | 535/553 | 535 | 0 | 84 | 0,46 | 234 | 214 | 0 | 100 | 469 |
| B1 | Fabrice (entrée seule) | 488/550 | 652 | 0,08 | 33 | 0,27 | 424 | 76 | 4 | 100 | 323 |
| B1 | Christèle (refuse tout) | 555/652 | 555 | 0 | 87 | 0,44 | 250 | 83 | 0 | 100 | 354 |
| B2 | Thomas | 522/581 | 522 | 0 | 77 | 0,44 | 215 | 188 | 0 | 100 | 552 |
| B2 | Fabrice | 496/550 | 636 | 0,09 | 48 | 0,33 | 354 | 57 | 0 | 100 | 380 |
| B2 | Christèle | 588/659 | 588 | 0 | 85 | 0,43 | 228 | 62 | 0 | 100 | 416 |
| C1 | Thomas | 550/550 | 724 | 0,30 | 99 | 0,56 | 179 | 412 | 0 | 96–100 | 486 |
| C1 | Fabrice | 458/511 | 712 | 0,14 | 50 | 0,30 | 314 | 210 | 0 | 100 | 336 |
| C1 | Christèle | 479/535 | 512 | 0,17 | 71 | 0,42 | 172 | 65 | 0 | 100 | 369 |
| D1 | Fabrice seul (v37) | 497/531 | 712 | 0,12 | 69 | 0,35* | 322 | 245 | 0 | 99–100 | 401 |
| D2 | Fabrice seul (v37) | 470/548 | 733 | 0,13 | 50 | — | 297 | 210 | 0 | 100 | 374 |
| **D3** | **Fabrice seul (v38)** | 496/533 | 740 | 0,13 | **51** | **0,30** | 381 | 250 | 0 | 100 | 416 |
| E2 | Claire (maintien, allergie lait) | 449/548 | 708 | 0,21 | — | — | 170 | 557 | 1 | 93–99† | — |
| E2 | Hugo (prise, végétarien, 3 repas) | 594/700 | 938 | 0,30 | 106 | 0,52 | 192 | 617 | 0 | 97–100 | 677 |
| E2 | Léo (8 ans) | 448/450 | 595 | 0,12 | — | — | 207 | 478 | 0 | 102–107† | — |
| E3–E5 | Hugo | 655–688/700 | 888–936 | 0,17–0,26 | 95–162 | 0,44–0,67 | 143–148 | 439–586 | 0 | 94–101 | 609–693 |

\* D1 : aucun plat à deux casseroles, mesuré sur tout le plat. † Bac commun Claire + Léo, voir § 4.

Durées : médiane 178 s en v37 et 165 s en v38 (163 s en v36). Sortie du modèle
5 à 10 % plus longue (les à-côtés), sans effet visible sur la durée.

### Ce que la campagne prouve

- **La chaîne des à-côtés tient** : sur chaque génération, tout à-côté demandé est
  soit rendu par le modèle, soit fourni par le moteur à partir de sa liste de
  secours (G05 vert partout) ; tous sont rattachés à la bonne boîte (0 sans hôte) ;
  les types suivent l'objectif (G04 vert partout).
- **Les réglages sont respectés** : B (refus total, entrée seule), C (mémoire).
- **La mémoire change le réglage** (état N, 7 notes sur 7 bien rangées) :
  « Christèle ne prend jamais de dessert », « pas d'entrée le soir pour
  Fabrice », « Christèle adore finir par un fromage », « pas de pain à table pour
  Thomas », « Thomas ne veut pas de dessert le midi », « Thomas aime bien
  commencer par une soupe » → réglage ; « pas de fromage le soir pour Fabrice » →
  exclusion d'aliment. En C, le plan qui suit n'a aucun dessert pour Christèle et
  aucun fromage pour Fabrice.
- **L'allergie tient** : Claire (lait) n'a reçu que des fruits et des crudités.
- **Le contrôle des exclusions lit enfin les boîtes** : `checked` de 15 à 25 par
  personne (il était à 0).
- **À l'écran** (vérifié au navigateur, compte de test « mémoire C ») : la ligne
  « À CÔTÉ » sous chaque boîte, les courses, le réglage sur la fiche ; et un
  enregistrement d'une autre habitude n'efface pas le réglage (vérifié en SQL).
- **Non-régression** : `meal-energy-v1` rend les mêmes kcal par boîte sur les
  anciens plans (`cc012345`, `e0325544`), écart ≤ 0,5 kcal.

## 3. Défauts trouvés pendant la campagne, et corrigés

1. **Le 202 attendait le classifieur de note** (jusqu'à 25–50 s) : les à-côtés se
   planifient maintenant sur la mémoire seule ; la note fraîche agit après le
   modèle (le juge refuse l'aliment, le secours tourne, les kcal perdus reviennent
   au plat).
2. **Personne seule : le féculent n'était jamais à part** (la consigne disait
   « un repas mangé seul est un plat unique ») → consigne v38 : chaque déjeuner et
   dîner met son féculent dans sa propre casserole. D3 : céréale 51 g, part 0,30.
3. **Arrondi d'un à-côté au-dessus du plafond de son type** (2 tranches de pain =
   210 kcal > 200 → aliment refusé) → l'arrondi redescend d'une unité ou de 5 g.
   E4 et E5 : 0 refus.
4. **Bac commun partagé à parts égales** : l'adulte lue à 92–97 %, l'enfant à
   103–108 % → la part suit l'énergie prévue de chacun (écart réduit à 96 % /
   104–105 % ; le reste vient d'une pondération à la journée).
5. Écran : conflit de fusion avec une autre session sur `mealBoxes.ts` (son
   `scope` de session + nos à-côtés), résolu en gardant les deux.

## 4. Ce qui reste (à trancher ou à surveiller)

1. **Le seuil que je m'étais fixé pour le plat médian (≤ 470 g) est manqué de peu** pour Fabrice et
   Christèle (458–497 g). C'est l'énergie qui l'impose : 1 754 kcal sur 3 repas.
   Baisser encore demande soit des à-côtés plus denses (contraire à la perte),
   soit une collation. Le plat max, lui, tient à 550 g partout.
2. **Légumes pour la prise et le maintien** : 170–199 g par repas pour 200 visés.
   La recette dit 180–200 g ; monter à 200–250 g baisserait la densité, donc
   grossirait le plat de Thomas, déjà à 550 g. Non changé.
3. **Grosses assiettes pour la prise avec peu de repas** : Hugo (3 repas, pas de
   collation) est au repli de 700 g à chaque repas et à 610–690 g au
   petit-déjeuner ; Thomas à 545–552 g au petit-déjeuner. L'énergie est tenue ;
   la seule vraie parade est une collation.
4. **Laitages frais de Thomas** : 276–454 g/j (visé ≤ 250). Le moteur ne tient
   qu'« un dessert laitier par jour » ; il ne voit pas les laitages des plats.
5. **Protéines de Fabrice** : 1 jour sur 5 sous le plancher en A2/A3 (90–106 g
   pour 108), 4 jours en B1 (sans dessert). Le moteur le compte déjà
   (`protein_floor_short`, écart compté, non bloquant).
6. **La note « tofu, poissons au petit déjeuné » n'est toujours pas respectée** :
   du tofu tous les matins (2,4 kg de courses dans C1). Elle est rangée en une
   seule chaîne, qu'aucun contrôle ne reconnaît. C'était hors du plan, mais c'est
   visible : il suffit de la réécrire en deux exclusions (« tofu », « poisson »,
   au petit-déjeuner).
7. **Charge CPU** : trois générations lancées ensemble dans le même processus
   local ont dépassé le budget CPU partagé (1 s souple, 2 s dur) et l'une a été
   tuée. La campagne a donc été faite une génération à la fois. En production,
   la limite affichée par Supabase est la même (2 s de CPU) : chaque composition
   coûte un peu plus qu'avant, à mesurer avant d'ouvrir à plus de monde.
8. **Deux refus du modèle, pas du code** : E1 bloqué par le verrou final des
   textes (1 morsure, journaux perdus au redémarrage, non reproduit en E3–E5) ;
   A4 : appel au modèle sans réponse en 400 s, puis relance incomplète (37 repas
   manquants) refusée faute de temps pour réparer.
9. **Libellé** : « 1 × pain complet » veut dire une tranche de 40 g.
10. **Le verrou final des textes** (`collectOutputSurfaces`) n'a pas de surface
    « à-côté » : l'aliment n'y passe que par la liste de courses.
11. **Tests d'écran d'autres sessions** : la porte (`agent-gate`) échoue sur le
    typage de tests en cours d'écriture par d'autres sessions (champ `ml`,
    `moments`, `retainedItems`, `planDaySlots`, `foldSection`, `targetDetail`).
    Deno (8 282) et vitest (2 rouges tolérés) sont verts.

## 5. État

- Migrations appliquées en local : `20260923110000_le_referentiel_des_a_cotes.sql`,
  `20260923120000_les_a_cotes_se_choisissent.sql` (+ `supabase/tests/keel/side_courses_habits_test.sql` vert).
- Jeton de consigne : `v38_every_plate_splits_its_starch` (v34 : `v34_every_plate_splits_its_starch`).
- Rien n'est commité. Harnais et rapports par génération :
  `scratchpad/campagne-a-cotes/` (hors dépôt).
- Pour la production, à lancer par le propriétaire : `supabase db push`, puis
  `supabase functions deploy` (toutes les fonctions : `meal_envelope.ts` et
  `meal_energy_shared.ts` sont importés par plusieurs d'entre elles).
