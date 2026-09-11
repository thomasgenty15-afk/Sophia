# Socle — ce qu'on répète tout le temps

Quand un nombre est ici **et** dans le code, c'est le code qui fait foi.

## 1. Périmètre

Sophia est un produit **B2C direct** ; la partie coach est **abandonnée** — aucun travail n'en part, aucune copie ne la mentionne, aucun écran ne fait attendre (« ton coach prépare ton plan » est un bug). L'unité vendue est la session de cuisine, et l'entrée est à 1.

Abandonnée ≠ supprimée : le pro s'éteint par `VITE_B2C_ONLY` (`frontend/src/security/proSurface.ts:31`, `true` en local ; deux dérivations, `WORLDS` dans `PublicHeader.tsx` et `?role=coach` dans `Auth.tsx`), pas par un revert — ne supprime ni les huit écrans coach, ni `coach-signup-v1`, ni la doctrine. Ce drapeau est du code client : la vraie frontière reste RLS et les fonctions edge.

« KEEL » est un nom interne : jamais sur une surface lue par un utilisateur, **données injectées en contexte et prompts compris** — c'est par là que sont passées les dernières fuites, pas par le TSX.

## 2. L'énergie d'une journée

0. **Portes** (`energy_gate.ts`) : plancher TCA, mineur, âge inconnu, `count_calories`, `energy_display_enabled`, `energy_target_enabled` — lues **avant** le calcul, toutes clés sur `auth.users` (un foyer = une ceinture). L'entretien traverse le mineur et la position du coach ; l'écart non.
1. **Entretien** = l'équation du corps (Mifflin × facteur d'activité), avec **repli au poids** (`poids × kcal/kg` arrondi aux 50) quand la taille ou la bande d'âge manquent — et le repli se **nomme** (`basis: weight_shortcut`). ⟳ 2026-09-10 : **une seule fonction pour les trois consommateurs**, `dayEnergyFor` (`_shared/keel/meal_envelope.ts`), atteinte par l'écran (`meal_energy_shared.ts`), la lane solo (`envelopeCore`) et la lane du foyer ; et le **dénominateur du rythme** (`estimatedMaintenanceFor`) est le même que le numérateur de la cible — avant, une fiche sans taille recevait une cible et un écart `null`, donc son objectif était annulé sans motif. ⛔ **L'appétit n'entre plus dans l'entretien d'un adulte** : avoir bon appétit ne fait pas dépenser 10 % de plus, et sur une perte ces 10 % annulaient une part du déficit sans que rien ne le nomme. Il est passé sur les bornes de masse (§ 5) ; le chemin pédiatrique garde le sien. Barème du repli : 26-29 / 28-31 / 30-33 / 32-36 selon `profiles.activity_level`, **28-33** sans réponse ; poids depuis `student_body_measures`, bornes 25-400 kg ; un mineur passe par l'équation pédiatrique.
2. **Écart** = `student_goals.target_pace_kg_per_week × 7700 / 7` (défaut 0,25 kg/sem), raboté et **nommé** (`executedPaceFor().clampedBy`) : curseur `min(1 kg/sem ; 1 % du poids)`, A1 500 kcal/j, plancher 1500/1200/1350, mineur 10 % de son besoin ; grossesse et allaitement l'annulent entièrement. **Cible du jour = entretien ± écart.**
3. **Moments** = `ceil(cible / (8 g/kg × poids × 1,35 kcal/g))`, plafonné à 6 (`eatingStructureFor`) ; déclarés dans `student_goals.practical_constraints.eating_rhythm` — **clé jsonb, pas une colonne**.
4. **Dispersion** = `cible × poids[moment] / Σ poids déclarés − apports fixes prévus` (`slotPlanTargets`). `SLOT_DAY_WEIGHT` (0,25 / 0,10 / 0,40 / 0,10 / 0,35 / 0,10) somme **1,30**, donc on renormalise toujours. **Aucun retrait au nom d'un aliment que le plan ne compose pas** : les extras (pain / fromage / dessert pris à côté) et le plancher « le plat garde ≥ 30 % de son repas » ont été supprimés le 2026-09-10. L'apport fixe déclaré est retranché **une fois, en entier** ; s'il couvre la part du créneau, l'énergie à composer vaut `0` et le créneau est nommé dans `fixedCovered` (`0` = pile couvert, `> 0` = conflit) — jamais une portion minimale inventée.
5. **Grammages** = `part standard cuite × (cible du moment / kcal de la part standard)` (`sizeDishForMouth`, `portion_sizing.ts`), puis raboté par `clampToBounds` — **lane foyer uniquement** : le solo n'importe pas `portion_sizing.ts`, le modèle y écrit les grammes et `envelopeFor` ne fait que mesurer depuis le 2026-09-06. ⟳ 2026-09-10 — **les bornes d'une assiette forment un couloir, et l'appétit y vit** (`plateBoundsFor`) : `bmin = min(E/1,35 ; table.min)`, `bmax = min(E/ρ ; table.max)` avec ρ = 1,0 — **0,6 sur un moment marqué léger** ; `A` = 0,90 / 1,00 / 1,10 selon l'appétit, **jamais sur un mineur** ; `Gmax = min(A·bmax ; table.max)`, `Gmin = min(A·bmin ; Gmax)`, `Gpréf` au milieu de `b`, projeté dans `[Gmin, Gmax]`. `PLATE_MASS_BOUNDS_G` (adulte 250-700 g en repas, 80-300 g en collation ; âge inconnu ⇒ adulte) reste le **garde-fou de vraisemblance**, pas la source. La **densité demandée** en découle : `Dmin = 100·E/Gmax`, `Dmax = 100·E/Gmin`, `Dpréf = 100·E/Gpréf`, intersectée avec le plafond de demande de **250 kcal/100 g** — intersection vide ⇒ **incompatibilité nommée**, jamais un minimum tronqué en silence. `REPAIR_DENSITY_HEADROOM` ne pousse plus la cible : la marge est **intérieure** au couloir. Quand une borne mord, on compose **plus dense** — jamais plus volumineux.
6. **⟳ 2026-09-10 — les deux équations n'en font plus qu'une.** L'écran affichait `entretien × ENERGY_BANDS[goal]` — une fraction attachée au **jeton** d'objectif, que le rythme réglé n'atteignait jamais (sur `fat_loss`, −20 % de l'entretien quel que soit le cran) ; le moteur composait contre `entretien ± écart exécuté`. Mesuré le 2026-09-09 : 2 400-2 800 contre 3 036-3 180 sur le même corps. Les deux passent maintenant par `dayEnergyFor`, donc par le **cran de la personne**, A1 et le plancher d'énergie compris.

## 3. Le budget d'une génération

⟳ 2026-09-10. Une requête de plan a **une échéance** (`PLAN_REQUEST_BUDGET_MS = 380 s`, sous la coupure du worker edge à 400 s) et **deux rattrapages**, partagés par toutes les relances (`PLAN_MODEL_REPAIR_BUDGET`). Les trente dernières secondes (`PLAN_TAIL_RESERVE_MS`) sont réservées à ce qui vient après le dernier appel modèle — mesure finale, ceintures, verrou de maison, écriture : un plan réparé et non écrit ne vaut rien.

Deux classes sont **réservées par priorité** — **sécurité** (`exclusion_retry`) et **densité** (`density_repair`, `dedicated_repair`, et `composition_retry` côté solo) ; la **livraison** (`unfed_retry`, `empty_slots_retry`) passe en débordement ; la **qualité** ne part pas à budget 2. Sans cette réserve, l'ordre du code aurait donné les deux slots à la protéine et à l'exclusion, et la réparation de densité — celle que la mesure donne gagnante — ne serait jamais repartie.

Tout appel de plan passe par `planCallMeta` (`_shared/keel/plan_budget.ts`) : modèle `gpt-5.6-luna`, palier **`fast`**, `maxRetries: 1`, et un repli borné à `gpt-5.6-sol` — ⛔ **jamais `gpt-5.4-mini`**, le seul des cinq candidats mesuré à servir des aliments interdits, et qui occupait cet emplacement en silence.

⛔ **Livré ne veut pas dire conforme.** Un budget épuisé rend la dernière version *utilisable*, avec son motif (`repair_budget_exhausted`, `time_budget_exhausted`, `repair_reserved`) écrit sur la ligne (`generated_from.plan_budget`). Les contrôles déterministes tournent budget plein ou vide.

Détail, mesures et arbitrages : **[keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md](keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md)**.

## 4. Le chemin d'un plan — **ce qui est branché**, mesuré le 2026-09-11 sur six tirs réels

```
portes → références → budgets par case → bornes/couloirs → recette structurée → mesure
→ ajustement culinaire autorisé → recours modèle borné → quantités finales → contrôles
→ stockage et UI
```

Chaque maillon, avec sa fonction et la preuve qu'il tourne (`generate-household-meal-v1`,
lane du foyer, N ≥ 1) :

1. **Portes** — `energy_gate.ts` (§ 2.0) puis `resolveGenerationAdmission`. Un compte
   secondaire est refusé `403 not_owner`.
2. **Références** — `food_composition.ts::resolveCompositionLine`, **résolveur unique**. Le
   `ref` du modèle traverse parseur → mesure → conversion → ajustement → sérialisation →
   relecture (`plan_energy_read.ts::readIngredient` le transmet). Un identifiant refusé éteint
   le plat (`ref_refused`) : **aucun repli silencieux** vers le terme ni vers une moyenne de
   groupe. Mesuré : 238 lignes sur 239 résolues par identifiant, 0 estimation de groupe.
3. **Budgets par case** — `slot_nutrition_contract.ts::slotContractsFor`, clé
   `memberId + date locale + slot`, construite **avant le prompt** et relue par les deux sites
   de dimensionnement (`contractAt`). Une seule cible par case ; le journal publie la grille
   avec ses clés (`density.by_case`).
4. **Bornes et couloirs** — `plateBoundsFor` puis `densityCorridorFor` sur ce contrat. Le
   couloir transmis est **celui de la date**, jamais le repliement par nom de moment.
5. **Recette structurée** — le modèle déclare `components` (rôle, lignes, lien, permission) ;
   le moteur **valide** le contrat et applique la politique restrictive. Mesuré : 4 à 8 unités
   sous contrat par tir, 5 à 22 lignes verrouillées.
6. **Mesure** — `boxNutrition` / `boxEnergies` sur les items écrits, plus les prélèvements
   réels dans les préparations. La journée est la somme de ces mêmes portions.
7. **Ajustement culinaire autorisé** — `proportion_adjust.ts` sur les composants, pas sur les
   ingrédients isolés. Il **ferme** (`closed`), il **ne trouve pas** (`not_found_within_limits`)
   ou il **ne touche à rien** (`nothing_to_do`) — jamais « mathématiquement impossible ». Sur
   les tirs sans réparation, les rapports internes sont conservés à ≤ 0,2 point.
8. **Recours modèle borné** — `plan_budget.ts` : **deux** réparations, échéance 380 s, réserve
   de queue 30 s, transmissions comptées (`provider_attempts`). Aucun appel imbriqué ne
   contourne le budget.
9. **Quantités finales** — `quantity_render.ts::finalizeQuantityProse`, appelée **une seule
   fois**, **après** `applySizing` et après la reconstruction des courses. La donnée structurée
   fait autorité ; `quantity` est régénérée depuis elle. Le **même module** est importé par le
   navigateur (`frontend/src/keel/lib/ingredientQuantity.ts`).
10. **Contrôles** — `final_plan_audit.ts` (achats par **identité**, présence **et** suffisance ;
    table par personne / date / créneau ; plancher protéique au prorata du budget couvert) puis
    `final_plan_gate.ts`, qui rend `conforme` / `deliverable_with_gaps` / `not_deliverable` et
    trois listes qui **ne se fondent jamais** : `refusals`, `incomplete`, `unevaluated`.
11. **Stockage et UI** — `write_student_meal_plan`, puis `readDishes` / `readPreparations` /
    `readShopping` qui transportent `amount`, `unit`, `state`, `grams_raw`, `ref` jusqu'à
    l'écran, lequel **dérive** l'affichage au lieu de relire l'ancien texte.

> ⛔ **Trois maillons de cette phrase ne sont PAS branchés, et il faut le savoir avant de s'y
> fier.** ① `FINAL_GATE_POLICY_LOT_4` est écrite et non armée : la branche
> **422 `plan_not_deliverable`** existe, elle est **avant** l'écriture — et elle est
> **inatteignable**, donc aucun défaut ne bloque un plan aujourd'hui. ② **Aucun écran ne lit
> les écarts** : `issues[] = final_gate_delivery:*` et le corps 422 sont produits, personne ne
> les affiche. ③ **Les lignes de courses n'ont ni identité ni quantité structurée**
> (`mealShoppingPayload`) : le contrôle de suffisance rend « incomplet » là où il ne peut pas
> lire, et il le dit.
>
> Détail, preuves et chiffres :
> **[keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md](keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md)**
> et `scratchpad/2026-09-11-FIABILITE-RECETTES/RAPPORT-LOT-F-2026-09-11.md`.
