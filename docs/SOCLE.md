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

⟳ 2026-09-12 — **IL N'Y A PLUS QU'UN SEUL SITE DE RAPPEL, ET PLUS AUCUNE RÉSERVE.** Les sept rattrapages d'amont (`protein_anchor_retry`, `exclusion_retry`, `swap_retry`, `preference_split_retry`, `unfed_retry`, `density_repair`, `dedicated_repair`) ne rappellent plus le modèle : ils **déposent leur constat**, recalculé sur le plan courant, et une **seule** décision part après la garde finale (`planRepairDecision`). La lane du foyer compte donc **deux** appels `generateWithGemini` — la composition, et la réparation unique — là où elle en portait neuf.

La table de réserve par priorité (`planRepairGranted`, `pendingDefectKinds`) a été **supprimée** avec eux : une réserve n'a de sens qu'entre demandeurs simultanés, et il n'en reste qu'un. Ce que la réserve protégeait — « la densité ne doit pas perdre son slot au profit de la protéine » — est tenu autrement, et mieux : tous les défauts d'un même plan sont mesurés AVANT la décision, et partent dans **une** instruction.

⟳ 2026-09-15 — **AUCUN APPEL DE RÉPARATION SANS DÉFAUT BLOQUANT.** La décision unique (`planRepairDecision`) ne rappelle le modèle que si au moins un défaut est une cause de la garde finale en sévérité `refuse` **dans ce run** (`collectPlanDefects().blocking`) ; un écart compté (`protein_floor_short`, `cell_bounds_off`, `mouth_energy_short`…) part **nommé à l'écran**, sans appel. Motif `no_blocking_defect`, noté `plan_repair_skipped:no_blocking_defect:<n>` dans `generated_from.issues`. Mesuré le 2026-09-15 sur huit tirs : les deux seuls réparés l'étaient sur des écarts comptés — quatre appels, ~100 s chacun, zéro écart fermé.

⟳ 2026-09-12 — **ET LA RÉPARATION REND UN PATCH, PAS UN PLAN.** `{"repair":{"base_version","units":[{"unit_id",…}]}}` : le jour, le moment et le propriétaire d'une unité viennent de la table des unités (`plan_repair_unit.ts`), pas de la réponse — un patch ne peut plus déplacer un repas. L'application est atomique : une unité hors périmètre rejette la réponse entière. Détail : **[keel/FERMETURE-TROIS-LOTS-2026-09-12.md](keel/FERMETURE-TROIS-LOTS-2026-09-12.md)**.

⟳ 2026-09-13 — **L'APPEL DE RÉPARATION NE PORTE PLUS QU'UN SEUL SCHÉMA, ET LE PATCH SAIT CORRIGER UN DÉROULÉ.** Trois choses ont changé, et chacune fermait un défaut reproduit :

- **Le message système de réparation est le sien.** Il transmettait `MEAL_SYSTEM_PROMPT` — donc un `OUTPUT JSON SCHEMA` de plan complet et l'ordre de couvrir tous les jours — pendant que le contexte exigeait un patch. `MEAL_SYSTEM_PROMPT` est maintenant la concaténation de **21 sections nommées** (`MEAL_PROMPT_SECTIONS`, chaîne identique au caractère près) ; `plan_repair_prompt.ts` en garde 13 et en écarte 8, **chacune avec la raison de son absence écrite**. Les limites dures (allergies, règles de maison) voyagent avec lui, rendues par les mêmes fonctions que la composition.
- **`sessions` est une opération du patch** (contrat `repair.v2`) : le modèle remplace le DÉROULÉ d'une session sous une adresse que le serveur lui donne (`S1`, `buildRepairSessions`) — jamais son jour, ses casseroles, ses durées, ni son existence. Une session seule en défaut ouvre un périmètre, et les recettes ne bougent pas.
- **Le jour de cuisson d'une casserole est REMIS par le serveur.** Mesuré sur le premier appel de réparation payant du 2026-09-13 : le modèle a rendu un patch parfaitement conforme *sans* `cook_on` — le schéma ne le nommait pas — la casserole a perdu sa session, et la candidate entière est tombée. Le schéma le nomme maintenant (pour une casserole NEUVE) et le serveur remet le jour d'une casserole déjà au plan (`patchPreparationPayloads`), comme il remet le jour, le moment et le propriétaire d'une unité.
- **Une opération explicitement invalide rejette le patch ENTIER.** Elle était appliquée dès qu'une autre unité valide survivait. Omettre un tableau reste gratuit (`empty` le dit) ; rendre du vide ou de l'illisible, non. Et l'écho de `base_version` est **exigé** quand le serveur en annonce une.

⟳ 2026-09-13 — **LE VERROU DE SORTIE LIT `cooking_sessions[].run_through`.** Il ne le lisait pas : la même phrase dangereuse bloquait dans une recette et passait dans un déroulé. Les surfaces visibles sont recensées **une fois** (`output_surfaces.ts` : plats — nom d'usage compris —, casseroles, sessions, notes de part, contenants, courses, **et la prose d'`explanation`**, qui est écrite par le modèle, rendue à l'écran, et que `gatePlanExplanation` ne savait pas juger — elle ne reçoit aucune contrainte de sécurité), et le texte concaténé du verrou comme la localisation en descendent. Le contrôle tourne deux fois : dans la boucle pour adresser la réparation, et **sur l'état final avec les parts réellement écrites** avant livraison. Une erreur de relevé bloque (`plan_validation_unavailable`), elle ne vaut pas « rien trouvé ». Détail, tirs et écarts : **[keel/RAPPORT-FERMETURE-REPARATIONS-FOYER-2026-09-13.md](keel/RAPPORT-FERMETURE-REPARATIONS-FOYER-2026-09-13.md)**.

Tout appel de plan passe par `planCallMeta` (`_shared/keel/plan_budget.ts`) : modèle `gpt-5.6-luna`, palier **`fast`**, `maxRetries: 1`, et un repli borné à `gpt-5.6-sol` — ⛔ **jamais `gpt-5.4-mini`**, le seul des cinq candidats mesuré à servir des aliments interdits, et qui occupait cet emplacement en silence.

⟳ 2026-09-13 — **CHAQUE OBJECTIF PORTE SON PROPRIÉTAIRE, ET LE `ref` PRIME SUR LE GROUPE DÉCLARÉ.**
- **La consigne de réparation nomme la personne.** Elle envoyait « ce jour-là les assiettes portent 2 702 kcal et doivent en porter 1 826 », puis 3 824, puis 2 459 — trois cibles, aucune identité. Chaque ligne porte maintenant `member_id`, la date, le créneau, les unités et sa mesure avec ses bornes ; les contrats des consommateurs **sains** d'une casserole partagée voyagent avec, chacun avec ses propres chiffres. Un objectif individuel sans propriétaire **arrête l'appel** avant de consommer le budget, au lieu de partir anonyme. Et la troncature ne ment plus : elle jetait 41 lignes sur 65 derrière « … and 41 more of the same kind », c'est-à-dire deux bouches sur quatre.
- **Il n'y a plus qu'un format de réponse demandé.** Cinq consignes d'amont réintroduisaient « Return the full plan JSON » ou « Keep every dish, day and slot » dans un message dont le système exigeait un patch. L'interdiction **locale** de toucher une casserole gelée reste.
- **Le `ref` d'un ingrédient prime sur le `group` que le modèle déclare à côté.** Mesuré sur un appel réel : le modèle a écrit `ref: "soy_yogurt"` (juste) et `group: "dairy_yogurt"` (faux) ; le groupe n'était validé que contre le vocabulaire fermé, jamais contre la référence, et le plan **entier d'un foyer de quatre** a été refusé pour une bouche végane. Le référentiel tranche désormais, avec un compteur de conflits.
- **La grille du foyer part de la maison, pas de la première bouche qui parle.** Une bouche secondaire qui déclarait `lunch, dinner` retirait les deux petits-déjeuners **à tout le monde**. Règle extraite et testée : `householdGridSlots` (`meal_generation.ts`).
- **Une bouche sans objectif de perte ou de prise ne reçoit pas de portion pesée** (`weighedPortionMembers`) : elle partage un bac de groupe dont le gramme décrit le récipient. Une mesure « par personne » qui compare ce bac à une cible individuelle est fausse — c'est ce qui avait produit « 7/28 ». ⚠️ Sur le chemin mesuré, chaque mangeur reçoit pourtant un contenant nominatif, maintien compris : à vérifier avant de s'appuyer sur cette protection.

Ce qui est mesuré, ce qui ne l'est pas, et les trois cas non exercés : **[keel/RAPPORT-CIBLES-ET-VALIDATION-FOYER-2026-09-13.md](keel/RAPPORT-CIBLES-ET-VALIDATION-FOYER-2026-09-13.md)**.

⟳ 2026-09-13 (soir) — **UNE BOUCHE SANS CIBLE EST NOURRIE, ET UN CONTRÔLE SANS OBJET N'EST PAS UN ÉCHEC.**
- **Le moteur sert une PART DE RECETTE quand il ne peut pas calculer de cible** (âge inconnu, corps absent, protection). Avant, la bouche n'entrait dans aucun contenant — **alors que le plat était déjà multiplié pour elle** (`UNMEASURABLE_PORTION_FACTOR = 1`) : la nourriture était achetée, cuisinée, rendue à personne, et le foyer **entier** refusé. Le motif est typé (`recipe_shares_by`), aucune cible n'est inventée, aucune porte d'affichage n'est ouverte. ⚠️ Le chemin SOLO garde ce trou (`portion_sizing.ts:1750`).
- **Trois questions séparées** : cette personne est-elle attendue à ce repas · peut-on calculer sa cible · quels chiffres peut-on lui montrer. Une case sans cible sort des familles numériques (`not_applicable: cell_energy_no_target`) ; sa **présence** reste jugée.
- **Le lecteur d'items de boîte accepte la forme d'ingrédient** (`amount`/`unit` → grammes **par le référentiel**). Il n'acceptait que `grams`, une clé nommée dans un bloc que le prompt retire sous `portion_v1` : 8 items sur 8 jetés en silence sur un tir réel, avec l'ancre protéique de quatre repas. ⚠️ Sous ce chemin les boîtes du moteur **écrasent** celles du modèle : le partage de régime n'a toujours pas de canal, et l'écart est **compté** (`dish_bearing_promised_not_taught`).
- **Une bouche sans compte a enfin son enveloppe.** `latestWeight` est `null` sur une fiche par décision (« une fiche n'est pas une série ») ; l'appelant ne fabrique plus d'enveloppe de compte pour elle, et `mouthEnvelope` retombe sur l'entretien. Elle n'achète aucun objectif : le plancher est celui du **maintien**.
- **On ne renvoie pas à une section qu'on n'envoie pas** : le bloc de régime pointait « see A DISH OF THEIR OWN » dans un message où ni la section ni `for_member_id` n'existaient.
- **La publication est un bloc isolé** (`plan_publication.ts`) dont la validation est un **paramètre requis** : la panne se provoque en passant une autre fonction, jamais un drapeau. Une panne de **journal** ne refuse plus le plan — elle a son propre motif.

Ce qui est mesuré, ce qui ne l'est pas, et les deux dernières réparations réelles : **[keel/RAPPORT-RESTE-A-FERMER-FOYER-2026-09-13.md](keel/RAPPORT-RESTE-A-FERMER-FOYER-2026-09-13.md)**.

⟳ 2026-09-14 — **UN `for_member_id` REFUSÉ NE FAIT PLUS TOMBER LE PLAN.** Le commentaire promettait « jamais une raison de retirer un dîner à quelqu'un » ; l'effet était l'inverse. L'attribution tombait, le plat restait — mais la case portait **déjà** le plat de la table, donc le plat dédié devenait un **second plat de table**, chaque bouche était nourrie deux fois, et la porte refusait `mouth_unfed / double` : **le plan entier en 422**. Six tirs sur treize. Un seul `for_member_id` erroné du modèle suffisait. Désormais le plat **tombe** quand la case porte déjà un plat de table (il n'est le dîner de personne, ce qui disparaît est le doublon), et il **devient** ce plat de table quand la case est vide. ⚠️ Et `box_counts.meals_delivered` mentait : il relisait un souvenir figé avant que les contenants ne soient autorés, et rendait `fed 24/24 · double 0` pendant que le refus listait 16 doublons du même run.

⟳ 2026-09-14 — **LA VARIANTE DE RÉGIME ARRIVE DANS L'ASSIETTE, ET UN PLAT TROP DENSE SE RECOMPOSE.**
- **Une seule décision de qui reçoit quel plat**, et elle vit dans la grille (`household_cells.ts`) : le plat partagé suit la ligne de la table (`strictestRegimeAt`, R4) ; une bouche reçoit un plat à elle **seulement si cette base ne peut pas la nourrir** (`dietDiverges`) ou si elle a déclaré son propre repas. `dishBearingMembers` en est la projection ; `promptDishBearers` est écrit une fois et lu par les quatre bouts. Avant, trois listes divergeaient : à N=4 le prompt enseignait la clé pour **Lea** pendant que le bloc de régime déclarait **Nils et Iris** divergentes ; à N=2 il n'enseignait rien et **toute la table mangeait végane**. Mesuré après : jambon 150 g chez l'omnivore (37,1 g de protéines), tofu 150 g chez la végane (29,6 g), zéro jambon dans sa boîte, et la casserole commune retombe de 300 à 150 g.
- ⛔ **Le partage PAR BOÎTE d'un plat partagé reste inutilisable sous `portion_v1`** : le composant écrit seulement dans `boxes[].items` disparaît (le moteur réécrit les contenants depuis les ingrédients du plat) ; écrit aussi dans `dish.ingredients`, il atterrit dans **toutes** les boîtes. La ceinture de sortie l'attrape (422), donc aucune assiette fausse n'est servie — mais le canal ne fonctionne pas.
- **Un plat trop dense se recompose au lieu d'exiger un complément.** `dejaDemande` déclarait tout plat hors bornes irréparable **avant qu'on ait rien demandé** — depuis la fermeture C4, ce site ne rappelle plus le modèle et sa comptabilité n'avait pas suivi. Un complément n'est désormais réservé que si plus rien n'est réécrivable **ou** si les couloirs de densité des mangeurs n'ont **aucune intersection**.
- **Les bornes d'assiette portent sur le repas ENTIER** (part commune + complément), remesuré **après arrondi**. La remontée artificielle de la part rabotée a disparu.
- **`applySizing` sert une part de recette** à une bouche sans cible, sur la lane d'UNE personne comme sur celle du foyer. Une recette illisible reste refusée.

Ce qui est prouvé, ce qui ne l'est pas, et les six défauts nommés non corrigés : **[keel/RAPPORT-FERMETURE-DEFAUTS-FOYER-2026-09-14.md](keel/RAPPORT-FERMETURE-DEFAUTS-FOYER-2026-09-14.md)**.

⛔ **Livré ne veut pas dire conforme.** Un budget épuisé rend la dernière version *utilisable*, avec son motif (`repair_budget_exhausted`, `time_budget_exhausted`, `repair_reserved`) écrit sur la ligne (`generated_from.plan_budget`). Les contrôles déterministes tournent budget plein ou vide.

Détail, mesures et arbitrages : **[keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md](keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md)**.

## 4. Le chemin d'un plan — **ce qui est branché**, mesuré le 2026-09-12 sur six tirs réels

```
portes → références → budgets par case → bornes/couloirs → recette structurée → mesure
→ ajustement culinaire autorisé → recours modèle borné → quantités finales → contrôles
→ stockage et UI
```

**Ce chemin est celui qui tourne**, de bout en bout, sur `generate-household-meal-v1` (lane du
foyer). Chaque maillon, avec sa fonction et la preuve qu'il tourne :

1. **Portes** — `energy_gate.ts` (§ 2.0) puis `resolveGenerationAdmission`. Un compte secondaire
   est refusé **`403 not_owner`**, mesuré sur un foyer réel de deux bouches.
2. **Références** — `food_composition.ts::resolveCompositionLine`, **résolveur unique**. Le `ref`
   du modèle traverse parseur → mesure → conversion → ajustement → sérialisation → relecture. Un
   identifiant refusé éteint la **pesée**, jamais le plat, et se compte. Mesuré sur six tirs :
   **271 lignes pesées, 0 identifiant absent, 0 refusé, dès le premier jet.**
   ⚠️ Une ligne de COURSES porte aussi un `ref`, mais **résolu depuis son libellé** : ce n'est pas
   une déclaration du modèle, et aucun lecteur ne doit le traiter comme telle.
3. **Budgets par case** — `slot_nutrition_contract.ts::slotContractsFor`, clé
   `memberId + date locale + slot`, construite **avant le prompt** et relue par les deux sites de
   dimensionnement et par la mesure finale. La consigne de densité reconstruite est présente
   **caractère pour caractère** dans le prompt archivé de chaque tir.
4. **Bornes et couloirs** — `plateBoundsFor` puis `densityCorridorFor` sur ce contrat, **avec
   l'appétit réel de la personne** : petit-déjeuner 225/389/552 et [112–250] pour un petit
   appétit, 250/432/614 et [100–245] pour un moyen, 275/475/675 et [91–223] pour un grand.
5. **Recette structurée** — le modèle déclare `components` ; le moteur **valide** le contrat de
   sortie (`ref` + `amount`/`unit` sur chaque ligne pesée) et applique la politique restrictive.
6. **Mesure** — `boxNutrition` / `boxEnergies` sur les items écrits, plus les prélèvements réels
   dans les préparations. La journée est la somme de ces mêmes portions.
7. **Ajustement culinaire autorisé** — `proportion_adjust.ts` sur les composants. Il **ferme**,
   il **ne trouve pas**, ou il **ne touche à rien** — jamais « impossible ».
8. **Recours modèle borné** — `plan_budget.ts` : **deux** réparations pour le plan entier, échéance
   380 s, réserve de queue 30 s. Tous les défauts réparables y entrent par
   `plan_defect_pass.ts::collectPlanDefects`, et `judgeCandidate` **jette** une candidate qui
   ajoute une violation — mesuré deux fois sur des candidates réelles. Une troisième demande est
   refusée et tracée (`repair_budget_exhausted`) : **aucun rappel caché.**
9. **Quantités finales** — `quantity_render.ts::finalizeQuantityProse`, appelée **une seule fois**,
   après l'arrondi au plus proche et après la reconstruction des courses. Mesuré sur les plans
   livrés : **211 lignes persistées, 0 quantité fractionnaire**, et « une pincée » conservée. Le
   **même module** est importé par le navigateur.
10. **Contrôles** — `final_plan_audit.ts` (achats par **identité**, présence **et** suffisance ;
    table par personne / date / créneau ; plancher protéique au prorata du budget couvert) puis
    `final_plan_gate.ts` sous **`FINAL_GATE_POLICY_LOT_4`**, qui rend `conforme` /
    `deliverable_with_gaps` / `not_deliverable` et trois listes qui ne se fondent jamais.
    **La branche 422 est atteinte, elle est AVANT l'écriture, et elle a refusé 2 plans réels sur
    6 sans laisser une ligne en base.**
11. **Stockage et UI** — `write_student_meal_plan`, puis `readDishes` / `readPreparations` /
    `readShopping` qui transportent `amount`, `unit`, `state`, `grams_raw`, `ref` jusqu'à l'écran.
    Le verdict structuré vit dans `generated_from.validation` (`version: 1`, quatre listes
    séparées), il est lu par **un seul** lecteur (`frontend/src/keel/api/planValidation.ts`) sur
    les trois chemins, et rendu par `PlanValidationNotice` sur `/app/plan` et l'aperçu.

> ⛔ **Branché ne veut pas dire sans écart.** Sur la campagne du 2026-09-12 : 45 **parts**
> calorifiquement conformes sur 45 (36 cases demandées, le tir 6 en portant 2 par case),
> **41 complètes** (4 densités sous leur plancher), une masse à
> **631 g pour 630** après arrondi, et **5 tirs sur 6 au-dessus des 150 000 ms** de la cible de
> déploiement — la fiabilité de livraison en hébergé reste **ouverte**.
>
> Ce qui reste non branché, nommé et chiffré :
> **[keel/CLOTURE-C6-2026-09-12.md](keel/CLOTURE-C6-2026-09-12.md)** § 10 et
> `scratchpad/2026-09-11-FIABILITE-RECETTES/NON-BRANCHE.md`.
