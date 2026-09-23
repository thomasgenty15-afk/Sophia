# Chantier « le féculent à côté » — riz fantôme, curseur, plafond protéique, casserole séparée

Tu travailles dans le dépôt Sophia 2 (lis CLAUDE.md et AGENTS.md d'abord). Quatre lots, à livrer
dans cet ordre, le plus vite possible : A1 et A2 en PARALLÈLE par deux sous-agents (fichiers
disjoints), puis B, puis C (B et C touchent tous deux `generate-household-meal-v1/index.ts`, ne les
lance pas en même temps). Ne commite rien sans qu'on te le demande. Jamais `git stash` ni
`git checkout`. Les commandes à risque sont bloquées par un hook, ne les contourne pas.

## Le contexte, en six faits mesurés le 2026-09-22

Foyer de test : compte `ihu@gmail.com`. Thomas est le titulaire (72 kg, 187 cm, 28 ans, assis,
3-4 séances, prise de masse, rythme choisi 0,45 kg/sem, membre `6f591eaf-4bdc-49c6-b312-73fb7ca1b2b3`),
Fabrice (93 kg, 173 cm, perte, 0,45 choisi, 80 kg visés, membre `b90ec30c-d411-44d6-bf6f-47603a8e2583`),
Christèle (58 kg, maintien, membre `8b8b51bf-9392-4fa3-a76d-e5cd4f97b63c`). Dernier brouillon
réel : `student_meal_drafts` id `6e4e5548-e518-475f-abe2-338652f4e1dc`.

1. Une casserole partagée n'a qu'une composition : les 699 g d'orge au poulet de Thomas ont la même
   protéine au gramme que les 539 g de Christèle. La densité de la table est celle du PLANCHER le
   plus exigeant (`sharedProteinCaps`, `plan_protein_brief.ts`, « le plancher gagne »). Résultat sur
   le brouillon : `protein_brief.floor_wins_cells` 15/15, `ceiling_yielded_slots` 15,
   `protein_ceiling.over` 9 jours-bouche sur 15, pire +46 %. Thomas mange 2,5 à 2,9 g/kg.
2. Le dimensionnement (`sizeDishForMouth`, `portion_sizing.ts`) applique UN facteur par boîte et
   ignore les rôles culinaires. Sur le thon aux pitas, tomate et laitue sont déclarées
   `separable_side` et sont réduites de 12 % comme le thon.
3. Le vocabulaire existe déjà : `CULINARY_ROLES` / `FREE_ROLES` dans `culinary_structure.ts`, et la
   consigne au modèle dans `meal_generation.ts` (~3797-3822) définit `separable_side` comme « plain
   rice beside a chicken in sauce, its amount can move on its own ». Personne ne s'en sert.
4. La règle de recette de `household_meal_generation.ts` (~854) dit « Every lunch and dinner is a
   complete plate in ONE dish: a starch, a protein, a fat ». C'est elle qui fait mélanger l'orge,
   cuite à part, dans la casserole du poulet au moment des boîtes.
5. Le canal FF-043 `more_of_the_same` calcule 390 g de riz par jour pour Thomas
   (`generated_from.household.member_deltas`) et `plan_energy.ts` l'AJOUTE au total du jour du
   lecteur (`entry.kcal += addon.kcal`). Ce riz n'est nulle part : ni boîte, ni ligne de courses, ni
   carte. La page du plan affiche 3 800 à 3 900 kcal/jour à Thomas alors que ses boîtes font 3 266
   à 3 292 et que la fourchette dit 3 204-3 348. Chiffre faux sur une surface utilisateur.
6. La fiche « Informations personnelles » d'un membre existant (`HouseholdPage.tsx`, cadre
   `household.member.frame_identity`) n'a ni poids visé ni curseur de rythme. Fabrice est figé à
   0,45 alors que la borne est passée à 0,8 (A1 = 880 kcal/j). Thomas a choisi 0,45 et le moteur
   exécute 0,35 depuis le plafond de 0,5 %/sem en prise (`MAX_WEEKLY_BODY_FRACTION_UP`), sans rien
   montrer.

## Lot A1 — retirer le riz fantôme du total du jour (petit, urgent)

Pourquoi : un total faux sur la page du plan, pour tout lecteur de foyer.

- `supabase/functions/_shared/keel/plan_energy.ts` : supprimer le chemin des add-ons
  (`MemberAddon`, `memberAddonEnergy`, le paramètre `addons`, `addonKcal`, la ligne
  `entry.kcal += addon.kcal`). Le total du jour d'un lecteur = ses boîtes, rien d'autre.
- `supabase/functions/_shared/keel/meal_energy_shared.ts` : `readViewerAddons` part avec.
- `supabase/functions/meal-energy-v1/index.ts` (~928-951) : plus d'add-ons passés.
- `frontend/src/keel/api/mealEnergy.ts` : `addonKcal` (l. 108 et 477) part avec.
- Le générateur continue d'écrire `member_deltas` dans `generated_from` (historique) ; ajoute dans
  `docs/fonctionnalites/le-foyer/FF-043-la-resolution-foyer.md` une note datée : canal retiré du
  lecteur le 2026-09-22, remplacé par le lot C.
- Preuve : appel `meal-energy-v1` (`{ "draft_ids": ["6e4e5548-..."] }`) en tant que
  `ihu@gmail.com` → pour chaque jour, `days[].kcal` de Thomas = somme de ses `boxes[].kcal`
  (3 266 à 3 292), et `addon_kcal` n'existe plus dans la réponse.

## Lot A2 — le rythme sur la fiche d'un membre existant (front seul)

Pourquoi : personne ne peut passer Fabrice à 0,8, et Thomas ne voit pas que 0,45 est exécuté 0,35.

- Le curseur existant vit dans `frontend/src/keel/components/MouthFormDialog.tsx` (« Ajouter une
  personne » et l'entonnoir). Le porter dans le cadre `household.member.frame_identity` de
  `frontend/src/keel/pages/HouseholdPage.tsx` avec le poids visé.
- Lecture/écriture : `loadMemberTargets` et `setOwnTarget` dans `frontend/src/keel/api/mouthProfile.ts`
  pour le titulaire (`student_goals`) ; pour une bouche sans compte, colonnes
  `household_members.target_weight_kg` / `target_pace_kg_per_week`, réutilise l'écrivain de l'ajout.
- Borne du curseur : `paceCeilingFor` (`supabase/functions/_shared/keel/weight_pace.ts`, déjà
  importé côté front par `frontend/src/keel/lib/mouthForm.ts`).
- Sous le curseur, quand `executedPaceFor(...).clampedBy` diffère du rythme choisi : « choisi 0,45,
  exécuté 0,35 ». Clés i18n fr/en, parité (`pageSeams.int.test.ts`).
- Preuve UI (navigateur intégré, session par lien magique) : Fabrice réglable jusqu'à
  « 0,80 kg par semaine » ; Thomas montre max 0,35 et la ligne choisi/exécuté.

## Lot B — passe arithmétique sur le plafond protéique, plats mangés seul

Pourquoi : le petit-déjeuner et les deux collations de Thomas sont à lui (environ 1 370 kcal/jour
depuis la relâche de table), le modèle les remplit de yaourt et de petits-suisses, et
`protein_ceiling_over` est compté sans jamais être poursuivi. C'est de l'arithmétique, pas un
appel modèle : l'ajusteur de proportions existant (`proportion_adjust.ts`) ne poursuit que la
densité d'énergie.

- Nouveau module pur `supabase/functions/_shared/keel/protein_ceiling_adjust.ts`, calqué sur
  `proportion_adjust.ts` (mesure injectée, `ratioBoundsFor`, `PROTEIN_GROUPS`, `MOVE_COOKED_G`) :
  pour chaque bouche dont la journée mesurée dépasse `proteinCeilingGFor` (`meal_envelope.ts`)
  au-delà de `PROTEIN_CEILING_TOLERANCE`, sur ses plats mangés seul (cases de `householdGrid.cells`
  avec un seul `eater`), déplacer des grammes des lignes protéiques vers le féculent et le gras à
  kcal constantes, jusqu'au plafond ou jusqu'aux bornes. Jamais d'ajout, de suppression ni de
  remplacement d'ingrédient. Jamais un plat partagé.
- Appelant : `generate-household-meal-v1/index.ts`, après le dimensionnement et avant la garde
  finale, au même endroit que le trace `keel.household_meal.proportion_adjust` (~9710) ; rejouer le
  dimensionnement des plats touchés ; prose périmée traitée comme `proportion_adjust_prose_stale`.
- Compteurs dans `generated_from.protein_ceiling` : `adjusted_mouth_days`, `moved_g`,
  `residual_over`. Un champ sans compteur est un lot désarmé qui ressemble à un lot qui marche.
- Tests : nombres en dur, un cas qui mord, un cas qui passe à côté, un test de câblage qui lit
  `index.ts`. Pas de réparation modèle pour le plafond : 65 à 114 s par appel, mesuré inefficace.

## Lot C — le féculent à côté sur les cases partagées

Pourquoi : c'est le seul levier par personne sur une casserole partagée sans changer la recette, et
la cuisine cuit déjà le féculent à part.

- C1, prompt : dans `household_meal_generation.ts` (~854), remplacer la règle « ONE dish » par :
  sur une case partagée, le déjeuner ou dîner est UNE préparation principale (protéine, légumes,
  sauce) ET le féculent en préparation à part, rôle `separable_side`, sa propre casserole ; le plat
  `uses` les deux. « Never a per-person figure » reste. Ne touche pas aux cases mangées seul.
- C2, dimensionnement : `sizeDishForMouth` (`portion_sizing.ts` ~925) : pour un plat qui tire deux
  préparations, la ligne principale se règle sur le couloir protéique de la bouche
  (`ProteinSlotAsk` de `plan_protein_brief.ts`, plancher et plafond × part kcal du moment) et la
  ligne féculent porte le reste des kcal de la case. La relâche de table (`relaxSharedForTable`,
  `slot_nutrition_contract.ts`) et les couloirs de densité restent. Compteurs
  `portion_sizing.two_pot_cells`, `starch_carried_kcal`.
- C3, affichage : `frontend/src/keel/components/plan/BoxTable.tsx` rend une boîte à deux lignes
  (casserole, féculent) ; le `run_through` des sessions (`cooking_plan.ts`) dit d'assembler les
  deux. Les courses portent le féculent.
- Preuve run réel sur le foyer de test : sur un déjeuner partagé, Thomas et Fabrice ont la même
  densité de casserole principale et des grammes de féculent différents ; `protein_ceiling.over`
  ≤ 2/15 ; `protein_brief.ceiling_yielded_slots` proche de 0 ; le féculent est dans les courses.

## Comment faire un run réel en local

- Pile locale : `supabase functions serve --env-file supabase/.env` sous `nohup`, log dans ton
  scratchpad. Le watcher REDÉMARRE le runtime à toute écriture sous `supabase/functions/` et tue
  la composition en cours : n'écris rien pendant un run. Redémarre serve après toute édition de
  `_shared` (cache périmé). Un 401 « Invalid JWT » avec un jeton frais : lis CLAUDE.md § 🔒.
- Session : POST `/auth/v1/otp` pour `ihu@gmail.com` (apikey anon de `supabase status -o env`),
  lien dans Mailpit `http://127.0.0.1:54324/api/v1/messages`, suivre le lien `verify`, le
  fragment de redirection porte `access_token`.
- Génération : front à `localhost:5173` (`preview_start`), « Ce que ça donnerait » sur `/app/plan`.
  La lane répond 202 et compose en arrière-plan, 1 à 7 minutes selon le modèle ; relis
  `student_meal_drafts` (`stage`, `write_payload->'generated_from'`).
- Lecture d'énergie : POST `/functions/v1/meal-energy-v1` avec `{ "plan_ids": [], "draft_ids": [] }`.

## Culture de test à respecter

Nombres en dur, jamais dérivés de la constante testée ; vocabulaires fermés ; paramètres de garde
requis, jamais optionnels ; tests de câblage qui lisent la source ; parité fr/en. Suite deno de
`supabase/functions/_shared/keel` verte, suite vitest du front verte sauf deux rouges connus
(`energyBasis.int.test.ts`, `mouthProfileReaders.int.test.ts`), `tsc -b --force` vert, gate du
dépôt (`agent-gate`) vert. Documente chaque lot dans `docs/keel/QUALITE-NUTRITIONNELLE-2026-09-21.md`
(nouvelles sections datées) et une mémoire par découverte non triviale.

## Rapport attendu

Par lot : fichiers touchés, compteurs avant/après sur un run réel, preuve UI en capture, ce qui
reste. Dis ce qui a échoué avec la sortie, sans arrondir.
