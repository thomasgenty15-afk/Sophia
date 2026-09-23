# Protéines : plancher, plafond, et la borne de la table — 2026-09-20

> **Point de départ.** Le plan `911994f7` (3 bouches, 6 jours, budget 200 €)
> achetait 28,6 kg dont 6,7 kg de viande et de poisson et 4 kg de
> petits-suisses, pour 208 € à la grille du dépôt. Une femme de 58 kg en
> maintien recevait 134 g de protéines par jour (2,3 g/kg), l'homme en prise
> de masse 214 g (3,0 g/kg). Le budget n'y était pour rien.

## 1. Le mécanisme, mesuré

Trois faits qui s'enchaînent. Aucun n'est « le modèle qui gonfle ».

1. **Le moteur ne règle que l'énergie.** Le prompt dit « every dish is
   written for ONE » ; `portion_v1` multiplie la carte jusqu'à 100 % de la
   cible kcal de chaque bouche et ne rééquilibre jamais (densification coupée
   par décision). La composition d'un plat est donc celle que le modèle a
   écrite, à l'échelle près.
2. **Le plancher de la bouche la plus exigeante écrit la recette partagée.**
   Chaque carte porte « at least X g in the <slot> dish » (`plan_protein_brief`),
   X = plancher × part kcal du moment. Un plat partagé n'a qu'une recette ;
   le modèle l'écrit au chiffre le plus haut (36 g demandés, 37 g rendus).
   Chaque autre bouche hérite de cette **densité** à sa propre énergie :
   66 g pour 1 000 kcal × 3 386 kcal = 223 g/jour pour l'homme en prise de
   masse.
3. **Les planchers étaient des bornes hautes de sport, sans plafond.** 1,6 g/kg
   en maintien et prise de masse, 2,0 en perte ; la garde ne comptait que
   `protein_floor_short`. Le système ne savait pousser la protéine que vers
   le haut. Les bouches sans compte reçoivent l'enveloppe de MAINTIEN quelle
   que soit leur fiche (`maintenanceEnvelopeFromBody`, connu et documenté).

## 2. Ce que ce lot change

| Où | Avant | Après |
|---|---|---|
| `PROTEIN_FLOOR_G_PER_KG` (`meal_envelope.ts`) | perte 2,0 · maintien 1,6 · masse 1,6 | perte 1,4 · maintien 1,2 · masse 1,6 |
| `PROTEIN_CEILING_G_PER_KG` (nouveau) | aucun plafond nulle part | 2,0 g/kg de poids de référence (plafonné IMC 30), `proteinCeilingGFor` |
| `sharedProteinCaps` (nouveau, `plan_protein_brief.ts`) | la carte réclame son plancher | sur une case partagée, la densité réclamée ne dépasse pas la plus petite densité-plafond à table |
| La carte (`proteinFragment`) | « at least X g » | « X to Y g » ou « X g, not more » dès qu'une borne existe |
| `PROTEIN_CONSEQUENCE` | deux échappatoires nommées | la troisième : dépasser |
| Règle de recette (`household_meal_generation.ts`) | « a starch, a protein, a fat » | la graisse est un filet : 5 à 15 ml d'huile ou 15 à 30 g de fromage par part |
| `generated_from.household.protein_brief` | comptes du brief | + `ceiling_mouths`, `cells_shared`, `cells_constrained`, `capped_slots`, `capped_grams` |
| `generated_from.protein_ceiling` (nouveau) | — | `mouth_days`, `measured`, `over`, `worst_over_pct` |

Rien n'est bloquant : `protein_floor_short` reste un écart compté, et un plan
au-dessus du plafond est livré et compté.

## 3. Deux pièces de plus, le 2026-09-21

**La relâche de table** (`relaxSharedForTable`, `slot_nutrition_contract.ts`,
`SHARED_TABLE_MAX_ASK_PER_100G = 140`). Sur une case PARTAGÉE, la cible d'une
bouche ne dépasse pas ce que son assiette porte à 140 kcal pour 100 g ; le
surplus part vers les cases de la même journée où elle mange seule, au
prorata, dans la limite de leur assiette. La somme est conservée. Sans case
seule, rien ne bouge et le refus est nommé (`shared_relax_refused`). Les
cases partagées descendent de la grille (`householdGrid.cells`, `eaters`)
jusqu'au contrat (`ContractDay.sharedSlots`). Compté dans
`generated_from.household.shared_table_relax` (`shared_slots`, `relaxed_days`,
`moved_kcal`, `refused`). Sur ce foyer : 936 kcal déplacés sur 6 jours, le
déjeuner de Thomas passe de 1 129 à 980 kcal, ses deux collations de 282 à
360.

**L'énergie de la part écrite à côté des grammes** (`ProteinSlotAsk.
kcalPerServing`). Mesuré sur le plan `504f58a3` : pour « 33 to 41 g », le
modèle écrivait une part de 460 kcal à 48 g, et le moteur la doublait pour
atteindre les 980 kcal de la case — 86 g servis. La carte dit désormais
« 33 to 41 g of protein per 980 kcal in the lunch dish » ; le chiffre est une
densité, et l'énergie à côté est ce qui la rend lisible.

## 4. Mesure — cinq runs réels en local, même foyer, même fenêtre

| | `911994f7` avant | `836afa60` | `60c457cd` | `504f58a3` (+ relâche) | `run 4` (+ énergie sur la carte) |
|---|---|---|---|---|---|
| Viande + poisson achetés | 6,74 kg · 375 g/pers/j | 6,07 · 337 | 6,15 · 342 | 8,77 · 487 | **3,60 kg · 200 g/pers/j** |
| Huile achetée | 855 ml | 1 399 | 421 | 431 | 564 |
| Coût à la grille | 208 € | 230 | 200 | 280 | **163 €** |
| Protéines Thomas / Fabrice / Christèle (g/j) | 214 / 148 / 134 | 222 / 148 / 134 | 221 / 158 / 143 | 261 / 179 / 161 | **200 / 134 / 121** |
| `protein_ceiling.over` (sur 18) | — | 12 · pire +67 % | 16 · +99 % | 14 · +93 % | **10 · +45 %** |
| Une part de casserole, déjeuner | 200 g dinde + 80 g orge | 300 g bœuf + 100 g pâtes | 300 g bœuf + 100 g pâtes | 170 g poulet + 65 g couscous | **117 g poulet + 125 g riz** |
| Énergie servie / cible | 100 % | 100 % | 100 % | 100 % | 100 % |
| Masse servie | 30,3 kg | 32,1 | 30,6 | 31,0 | 32,9 |

Ce que les cinq runs disent, dans l'ordre : la borne des cartes seule ne
change pas la casserole (run 2) ; l'huile bornée, le modèle prend la viande
(run 3) ; la relâche de table sans l'énergie sur la carte laisse le modèle
écrire une petite part très dense que le moteur double (run 4) ; les deux
ensemble donnent des assiettes qui ressemblent à des assiettes (run 5).

## 5. Ce qui reste

- **La protéine dépasse encore le plafond sur 10 journées-bouche sur 18**,
  au pire de 45 %. Elle ne vient plus de la viande (200 g/pers/j, normal)
  mais des petits-suisses (4 kg), des lentilles, des pois chiches et du tofu
  : la doctrine maison dit « une protéine à chaque repas » et le modèle
  l'applique. La suite logique est une cause `protein_ceiling_over` dans la
  garde finale avec sa réparation, symétrique de `protein_floor_short` — un
  vocabulaire fermé, présent dans 36 fichiers, donc un lot à part.
- **La masse totale ne baisse pas** (32,9 kg servis) : elle est l'arithmétique
  de 45 000 kcal. Le seul levier est la cible de Thomas (0,45 kg/sem).
- **Le déjeuner de Thomas est plafonné à 980 kcal** par la relâche ; ses
  collations portent le reste. Si un jour il n'a pas de collation, la
  casserole redevient dense et `shared_relax_refused.no_own_slot` le compte.

## 6. Le budget, pour mémoire

Le montant (200) part au modèle **en prose** comme plafond, avec l'ordre
« NEVER cut the portions ». Le moteur réécrit ensuite tous les grammages depuis
les kcal. `budget_floor` ne vérifie qu'un plancher (2,65 €/bouche-jour sur un
panier à 2 000 kcal, pas indexé sur les corps) ; **rien ne mesure le coût du
plan livré** au runtime (`costOfPlan` n'a qu'un script pour appelant). Le
rationale « Pour y tenir… » est une phrase que personne ne vérifie.
