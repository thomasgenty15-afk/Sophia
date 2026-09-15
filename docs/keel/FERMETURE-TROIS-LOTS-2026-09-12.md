# Fermer les défauts restants — ce qui a été fait, et ce qui reste

Travail du 2026-09-12, sur le plan « Fermer les défauts restants — plan détaillé
en trois lots » et la [revue des trois lots](REVUE-TROIS-LOTS-2026-09-12.md).
Aucun déploiement, aucune migration appliquée, aucune suppression de données.

**Verdict : les trois défauts ciblés de la revue sont fermés, et deux
régressions nées de ce chantier ont été trouvées et réparées avant la
livraison. Trois demandes réelles livrent 24 portions sur 24 conformes, sans un
seul rappel du modèle. La réparation par le modèle, elle, n'a été éprouvée qu'au
transport contrôlé : aucune des trois demandes payantes n'a eu de défaut à
réparer.**

---

## 1. Ce que la revue demandait, et où ça en est

| Défaut de la revue | État | Preuve |
|---|---|---|
| ① un défaut journalier n'ouvre aucun périmètre réparable | **fermé** | `plan_repair_context_test.ts` § ④ — un `protein_floor_short` daté ouvre les 3 repas de cette bouche ce jour-là, et 0 de la journée d'un autre |
| ② le prompt autorise une nouvelle préparation que la fusion refuse | **fermé** | `plan_repair_patch_test.ts` § ③ — la casserole neuve est acceptée, le lot des autres convives reste, l'orpheline est retirée |
| ③ une règle de conservation a été assouplie | **fermé** | `perishable_bought_too_early` est repassée en `refuse` ; le faux positif est mort à sa source (`food_keeping.ts`) |
| des réparations amont consomment le budget avant la collecte des défauts | **fermé** | 9 → **2** appels `generateWithGemini` dans la lane ; `planRepairGranted` supprimé |
| le verrou médical rend tout le plan indisponible pour une unité | **fermé** | `unsafe_candidate` localisé + adoption interne + refus de livraison |
| stock déduit par la reconstruction, pas par l'audit | **fermé** | `pantryCoveredG` traverse ; `shopping_c3_test.ts` § stock |
| la projection demande encore le plan entier | **fermé** | contrat de patch ; `Return the full plan JSON` a disparu |

---

## 2. Lot 1 — une réparation adressée, partielle et cohérente

### 2.1 L'unité de réparation

`_shared/keel/plan_repair_unit.ts` — **nouveau**. Une table d'unités (`U1`,
`U2`…) construite à chaque tour depuis les plats **et la grille attendue**.
Chaque unité porte date, jeton de jour, créneau, propriétaire, convives,
casseroles, et son index dans `dishes` — `null` quand la portion est **attendue
et absente**.

Trois propriétés, et chacune répond à un défaut mesuré :

* le jeton ne vient **pas du titre** (il change au premier repas réparé) ;
* il ne vient **pas de l'index du tableau** (la finalisation réordonne) ;
* il est **reconstruit à chaque tour sur les mêmes clés** — tant que date,
  créneau et propriétaire ne bougent pas, le même jeton désigne la même chose.
  Et ces trois-là sont très exactement l'identité qu'une réparation n'a pas le
  droit de changer.

### 2.2 Le périmètre, défaut par défaut

`repairScopeOf` part désormais des **unités**, plus des cases `jour/moment` :

| Défaut | Ce qui s'ouvre |
|---|---|
| préparation nommée | cette préparation ; ses consommateurs en dépendance — et **modifiables** si le défaut est de sécurité (un lot contaminé contamine ses portions) |
| portion attendue et absente | l'unité **réservée** correspondante |
| adresse `jour/moment` | les unités de cette case, réduites à la bouche puis au titre |
| journée (date, sans créneau) | les repas couverts de **cette** bouche **ce** jour-là |
| rien de tout ça | `unresolved`, avec sa raison (`no_unit`, `ambiguous`, `no_address`) |

### 2.3 Le contrat de réparation : un patch, pas un plan

`_shared/keel/plan_repair_patch.ts` — **nouveau**. Le modèle rend
`{"repair":{"base_version","units":[{"unit_id",…}],"preparations":[…]}}`.

Trois choses qu'il ne décide plus, et c'est la moitié de la garde :

* **le jour, le moment et le propriétaire** viennent de la table des unités —
  un patch ne peut plus *déplacer* un repas ;
* **la liste de courses** n'est plus demandée (elle est reconstruite) ;
* **un tableau absent veut dire « inchangé »**, jamais « supprime » — et c'est
  écrit dans la consigne, parce qu'une échappatoire non nommée se fait prendre.

L'application est **atomique** : une opération invalide rejette le patch entier
et la version précédente reste. Onze motifs de rejet nommés
(`out_of_scope_unit`, `uses_out_of_scope`, `preparation_id_collision`,
`base_version_stale`…).

⛔ **Le garde-fou `shorter_plan` a été retiré**, parce qu'il rejetait très
exactement une réparation locale valide. Ce qui le remplace est plus strict :
une unité hors périmètre jette la réponse entière.

### 2.4 Une seule décision de rappel

Les **sept sites d'amont** — `protein_anchor_retry`, `exclusion_retry`,
`swap_retry`, `preference_split_retry`, `unfed_retry`, `density_repair`,
`dedicated_repair` — ne rappellent plus le modèle. Ils **déposent leur constat**,
recalculé sur le plan courant au point de décision (`c4UpstreamDefects`), et
une seule décision part après la garde finale.

* `generateWithGemini` : **9 → 2** sites (la composition, et la réparation).
* `planRepairGranted` et `pendingDefectKinds` : **supprimés** — une réserve n'a
  de sens qu'entre demandeurs simultanés, il n'en reste qu'un.
* Tous les diagnostics sont conservés : réparabilité par composant, composants
  gelés, part de complément, mots que la table évite, bouches non nourries.

### 2.5 Le plan, les portions et la prose sont la même version

`fusedSourceText` reconstruit le texte source du plan **fusionné** : on part du
texte du meilleur plan et on y remplace chirurgicalement les objets que le patch
a posés. Les parts des bouches touchées tombent (une phrase lue à table au-dessus
d'un plat remplacé contredit le couvercle) ; l'explication du plan **retire** les
lignes qui nomment un plat disparu (`reconcileExplanationAfterMerge`).

---

## 3. Lot 2 — sécurité locale et calendrier d'achat

### 3.1 Une seule lecture de conservation

`_shared/keel/food_keeping.ts` — **nouveau**. Quatre natures qui ne se
confondent pas : `stable`, `refrigerated` (avec sa fenêtre), `frozen`,
`unknown`. **La datation et la garde finale l'appellent toutes les deux.**

C'était le défaut : la datation lisait le **rayon**, la garde lisait le
**groupe**. Le thon en conserve partait au rayon `pantry` (daté comme stable) et
gardait le groupe `white_fish` (refusé avec la fenêtre du poisson frais, un
jour). Deux lectures d'un même fait, et celle qu'on regardait le moins gardait
l'ancienne.

⚠️ Le repli historique est **gardé et nommé** : une ligne sans identité au rayon
frais garde `MAX_FRIDGE_DAYS`. « Inconnu » ne vaut pas « stable ».

### 3.2 Chaque usage est vérifié, pas seulement le premier

`_shared/keel/shopping_purchases.ts` — **nouveau**. Un besoin porte maintenant
ses **usages datés** (`ShoppingNeed.uses`). Quand un seul achat ne couvre pas
tous les usages, la ligne est **scindée** : deux courses, deux dates, et la somme
des quantités égale le besoin net.

Un saumon cuisiné lundi **et** vendredi était acheté dimanche : la datation
regarde la cuisson la plus tôt, la garde le besoin le plus tôt, et le filet du
vendredi avait cinq jours. Personne ne posait l'autre question.

### 3.3 La prose se recompose

Le recalcul des dates ne se fait plus **que** si `synthesized > 0`. Il tourne
toujours, et quand il change un jour de courses, `describeWrittenWaves`, les
gestes de congélation et **l'explication du plan** sont recomposés dessus.
`shopping_day_added_after_prose` a disparu : garder une prose périmée et poser un
compteur à côté est ce que le plan interdisait.

### 3.4 Une candidate non livrable, localisée

`parseGeneratedMeal` rend désormais `unsafe_candidate` : le plan que le verrou
vient de vider, **plus l'endroit exact où il a mordu** (plat, préparation, note
de portion, ligne de courses, groupe déclaré — ou `unlocalized`, qui est une
réponse et pas une absence).

* Les quatre tableaux **publics** restent vides : aucun appelant existant ne voit
  une candidate dangereuse.
* La lane du foyer l'adopte **en interne** pour pouvoir la réparer.
* `localizeOutputLockBites` rejoue le **même** verrou surface par surface, à
  chaque tour.
* Et **la livraison est refusée** si une morsure survit — c'est la contrepartie
  sans laquelle l'adoption serait une ouverture.

### 3.5 Le refus de conservation est réarmé

`perishable_bought_too_early` : `count` → **`refuse`**. Ce qui a changé est la
**cause** du faux positif, pas la sévérité.

---

## 4. Deux régressions nées de ce chantier, trouvées avant la livraison

Elles sont écrites ici parce qu'elles ont failli passer, et que c'est le banc qui
les a trouvées — pas une relecture.

### 4.1 Le refus « bouche sans repas » sortait avant la réparation

Le `return 422 mouth_unfed` vivait **2 500 lignes au-dessus** de la boucle. Tant
que `unfed_retry` rappelait le modèle pour son compte, une portion manquante
avait une chance ; une fois ce site désarmé, **plus rien ne la réparait** et le
plan partait en 422 sans qu'un seul appel soit parti. Mesuré au banc.

Le refus vit maintenant **après** la boucle, sur le plan final, avec la même
règle et le même corps. Résultat mesuré sur la même fixture : `422` → `200`, les
trois cases manquantes remplies par le patch.

### 4.2 Le plafond de plats du parseur amputait un patch

`parseGeneratedMeal` applique un plafond dérivé du rythme de la semaine. Donné
huit unités d'un coup, il en jetait **deux** — les dernières, c'est-à-dire très
exactement les unités **réservées** qu'on venait de demander au modèle de
remplir (`plan_repair_rejected:unit_without_content`).

Une unité, une lecture. Le plafond vaut alors « un plat », qu'aucune unité ne
dépasse — et c'est toujours le **même** parseur, avec les mêmes ceintures.

---

## 5. Ce qui a été mesuré

### 5.1 Trois demandes réelles (appels modèle payants)

Lancées séquentiellement par Kong et le `functions serve` local, après
redémarrage du runtime (le cache des `_shared` ne recharge pas un fichier
modifié).

| Demande | Ce qu'elle éprouve | Statut | Durée | Réparations | Portions conformes |
|---|---|---:|---:|---:|---|
| n° 1 (tir 5) | une personne, plancher protéique applicable, **apport fixe** déclaré, repas léger | **200** | 110,9 s | 0 | **6/6** |
| n° 2 (tir 6) | **deux bouches** aux besoins différents, préparation partagée, **allergie réelle** | **200** | 112,0 s | 0 | **12/12** |
| n° 3 (tir 3) | plusieurs dates de cuisson, produits stables et frais | **200** | 118,2 s | 0 | **6/6** |

**24 portions sur 24** conformes sur les trois dimensions (calories, bornes de
masse, couloir de densité). Trois sur trois sous le plafond hébergé de 150 s.
**Zéro alerte de courses** sur la règle courante (l'instrument rejoue aussi
l'ancienne règle de libellés, qui en produit une — c'est sa disparition qu'on
mesure). Identités d'achat : 22, 18 et 20, toutes couvertes ou présentes.

⚠️ **Et ces trois demandes ne prouvent RIEN de la réparation.** Aucune n'a eu de
défaut à réparer. La preuve de la réparation est au banc contrôlé, ci-dessous —
c'est ce que le plan exige : « si le modèle ne produit aucun défaut, publier
"aucune réparation nécessaire" ; cela ne prouve pas la réparation ».

### 5.2 Le transport contrôlé (zéro dépense)

Le banc sait désormais **répondre par un patch** : il lit la consigne envoyée,
y prend les `unit_id` autorisés, leur titre, leurs casseroles et leurs
ingrédients chiffrés, applique la mutation demandée et rend l'enveloppe. C'est
ce que le modèle fait, avec le même format.

| Cas | Ce qu'on observe |
|---|---|
| patch nominal | 8 unités appliquées, 3 **créées** (les repas manquants), texte source fusionné (5 remplacés, 3 ajoutés), `deliverable_with_gaps`, **200** |
| patch qui n'améliore rien | `candidate_no_improvement`, meilleur plan restauré, second appel autorisé |
| patch qui dégrade | `candidate_safety_regression`, restauration, `calls_exhausted` — **jamais un troisième appel** |
| allergène introduit **par la réparation** | `patch_unit_unsafe` sur les unités mordues, patch rejeté, **aucun plan écrit** |
| allergène dans le **premier jet** | `unsafe_candidate_adopted` (5 plats, 2 violations **situées** : `dish:sat/dinner`, `shopping`), `output_lock_localized`, réparation tentée deux fois, **aucun plan écrit** |

### 5.3 Rejeu des six archives `lot3c` — la non-régression

Les six sorties de la campagne précédente (2026-09-12, 05 h 17 et 14 h 19 → 14 h 28),
mesurées **une par une** par l'instrument de production `analyse-lot-F.ts` :

| Tir | Bouches | Portions | Conformes (kcal + masse + densité) | Réparations du modèle | Alertes de courses |
|---|---:|---:|---|---:|---:|
| 1 | 1 | 8 | **8/8** | 0 | 0 |
| 2 | 1 | 7 | **7/7** | 2 (`composition_fill`, `final_repair`) | 0 |
| 3 | 1 | 7 | **7/7** | 0 | 0 |
| 4 | 1 | 7 | **7/7** | 0 | 0 |
| 5 | 1 | 7 | **7/7** | 0 | 0 |
| 6 | **2** | **14** | **14/14** | 0 | 0 |

**Total : 50 portions, 50/50 conformes.** ⛔ **Cinquante, pas quarante-trois.**
Le rapport du 2026-09-12 publiait 43 — le nombre de CASES — sous le nom des
portions, alors que le foyer de deux en porte deux par case. La revue l'avait
nommé ; le dénominateur est corrigé ici.

Aucune régression : les six archives rendent exactement ce que la revue avait
mesuré, sur un moteur dont la boucle de réparation, la lecture de conservation
et la reconstruction des achats ont toutes changé entre-temps.

### 5.4 Vérifications

* **6 971 tests Deno**, 0 échec (dont 69 neufs sur les quatre modules créés).
* `deno check` sur les quatre points d'entrée : 0.
* **2 597 tests front**, 2 rouges tolérés et nommés (appartenant à une autre
  session), 0 hors liste.
* Typecheck des tests front : 67 erreurs (liste : 68) — trois fichiers ramenés à
  zéro au passage.
* `tsc -b --force` front : 0. Build : vert. `agent-gate.sh` : **pass**.
* Relecture écran sur les **trois plans réels** (fixture regénérée) : 9 tests.

---

## 6. Ce qui reste ouvert, et qui n'est pas fermé par ce chantier

1. **La réparation par le modèle n'a pas été éprouvée en réel.** Les trois
   demandes payantes n'ont produit aucun défaut. Le chemin est prouvé au banc,
   avec des réponses fabriquées ; la compétence du modèle à écrire un patch
   utile reste à mesurer.
2. **Le goût.** Aucun plat n'a été cuisiné. Rien de ce rapport n'en parle.
3. **Le matcher français d'allergène.** Mesuré en passant : une contrainte
   `allergen_ref='peanut'` ne mord pas sur « beurre de cacahuète » dans le
   verrou de sortie ; elle mord sur « peanut butter ». Ce n'est pas un défaut de
   ce chantier — c'est la couverture française du matcher, et elle est nommée
   plutôt que contournée.
4. **Deux migrations en attente de `db push`** (humain seul) :
   `20260911040000_…` et `20260912090000_…`.
5. **Le découpage du handler** (17 800 lignes) reste entier. Il n'était pas
   demandé, et l'ordre d'exécution qu'il compliquait est corrigé sans lui.
6. **`retry_merge.ts` a perdu la moitié de ses appelants de production**
   (`mergeRetryCells`, `mergeRetryByCell`, `spliceReworkableUnits`,
   `appendDedicatedDishes`) : ils supposaient tous une réponse entière du
   modèle. `mergeCellEdit` (la chirurgie locale) reste vivant. Les modules sont
   gardés, testés, et leur absence d'appelant est **nommée** dans les tests de
   câblage plutôt que laissée à découvrir.

---

## 7. Fichiers

**Créés** — `plan_repair_unit.ts`, `plan_repair_patch.ts`, `food_keeping.ts`,
`shopping_purchases.ts`, et leurs quatre fichiers de test.

**Réécrits** — `plan_repair_context.ts` (périmètre par unité, projection à
plafond souple et plafond dur).

**Modifiés** — `plan_repair_loop.ts` (adresse structurée sur `RepairDefect`),
`plan_defect_pass.ts` (quatrième source, contrat de patch), `meal_generation.ts`
(`unsafe_candidate`, `localizeOutputLockBites`, `decodeModelJson`),
`final_plan_gate.ts` (lecture de conservation, refus réarmé, compteur),
`final_plan_audit.ts` (besoin net), `grocery_waves.ts` (`WaveItem.ref`),
`shopping_rebuild.ts` (usages datés, stock rendu), `plan_validation.ts` +
`frontend/src/keel/api/planValidation.ts` (`cell_bounds_off` protégé des deux
côtés), `generate-household-meal-v1/index.ts` (−1 100 lignes de rappels, +600 de
décision unique), le banc et le transport contrôlé.
