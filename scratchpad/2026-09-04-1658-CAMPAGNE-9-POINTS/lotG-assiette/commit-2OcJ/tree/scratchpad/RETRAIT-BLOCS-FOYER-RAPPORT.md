# Rapport — trois blocs retirés, un geste rendu visible

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-14 · **Aucun `push`, aucun merge.**

| Lot | État | En une ligne |
|---|---|---|
| **A** — « Quelqu'un cuisine de son côté » | ✅ livré | La carte n'existe plus sans profil réclamé ; plus de nom reproché ; plafond muet tant qu'il est intact. |
| **B** — « Ce que tu cuisines » | ✅ livré | Le lien casserole → jours **n'était pas** dans les sessions. Porté d'abord, bloc retiré ensuite. |
| **C** — « À table » | ✅ carte retirée · ⛔ **question ouverte** | Le moteur fait son travail ; c'est l'affichage qui échouait. `household_portions.ts` **non touché**. |
| **D** — le geste du soir | ✅ livré | `dish.method` s'affiche sur les plats en lot, sous un libellé à lui. Pur affichage : la donnée existait. |

---

## 0. Ce qui n'a pas été fait, et pourquoi

- ⛔ **`household_portions.ts` n'est pas touché** (§3.4 du chantier). Constat rendu au §C, décision à l'humain.
- ⛔ **Le moteur de fusion côté serveur n'est pas touché** — ni `household_merge.ts`, ni `household_merge_quota`, ni les RPC. Vérifié : `git status` ne montre aucun fichier `supabase/` modifié par cette lane.
- ⛔ **Aucune commande à risque n'a été exécutée** : ni `db push`, ni `db reset`, ni `functions deploy`, ni `secrets`, ni `link`. Aucune n'était nécessaire — ce chantier ne touche ni migration, ni fonction edge.
- ⛔ **Aucune clé i18n supprimée** (voir §7).

---

## A. « Quelqu'un cuisine de son côté »

### La règle appliquée

Trois conséquences, dans l'ordre du chantier :

1. **Zéro profil réclamé ⇒ le bloc n'existe pas.** Nouvelle lecture `mergeCounterparts` dans `frontend/src/keel/api/household.ts` : les membres avec `user_id` **non nul**, **hors maître**. Faux ⇒ la carte ne rend rien **et ne lit rien** (la garde est avant `loadMergeNotices`, pas après : un appel edge par montage pour une réponse qu'on ne rendrait pas est un coût sans lecteur).
2. **Un membre sans plan à lui ne se nomme pas.** `no_validated_plan` rejoint `member_is_owner` dans le filtre de la liste « non proposés ». Les cinq autres motifs restent : `proposals_muted` est un réglage que le maître a posé et peut retirer, `merge_quota_exhausted` passe la semaine prochaine, les refus de fenêtre bougent avec les plans.
3. **Le plafond ne s'affiche qu'entamé** : `quota && quota.used > 0`. Et pas `remaining < limit` — ce fichier ne refait jamais l'arithmétique comptée en base.

### Ce que ça retire, en chiffres mesurés

```
foyers en base ........................................ 19
dont ZÉRO profil réclamé en plus du maître ............ 13   (68 %)
distribution (profils réclamés hors maître) ........... 0→13  1→4  2→1  4→1
```

**13 foyers sur 19** rendaient trois phrases pour dire qu'il ne se passe rien, un plafond que personne n'avait entamé, et le nom d'une bouche suivi d'un reproche pour une chose qu'elle ne peut pas faire. Ils n'affichent plus rien.

### Preuve — le bloc REVIENT dès qu'un profil est réclamé

Foyer `be3fab42` (Nora, Alex, Theo, Mia) : Alex porte un compte et n'est pas le maître ⇒ `mergeCounterparts = [Alex]` ⇒ **la carte se monte**. Capture prise à 1280 px et à 320 px, `/app/household`, scroll 0.

Texte rendu, tel quel :

> **SOMEONE IS COOKING ON THEIR OWN**
> Nobody in the household is cooking on their own right now. Everyone eats from the household plan.

…et **rien d'autre** : pas de ligne de plafond (`used = 0`), pas de liste « non proposés » (Theo et Mia portent `no_validated_plan`, désormais filtré). À comparer à l'écran du chantier, qui portait en plus « Il reste 4 fusions sur 4 cette semaine » et « **Non proposés** — Christèle · Cette personne n'a validé aucun plan à elle ».

`overflowX` mesuré à 320 px : **faux**. Aucune erreur console.

### ⚠️ La capture « 0 réclamé » n'a PAS pu être prise — et je le consigne rouge

Le dossier plafonne à **5 serveurs de dev**, et les cinq appartiennent à d'autres sessions ouvertes en ce moment ; `preview_start` refuse le sixième. Les origines IPv4 (`127.0.0.1`) ne répondent pas — Vite n'écoute qu'en `[::1]`, donc pas de seconde origine pour un second `localStorage`. La seule origine atteignable (`localhost:5191`) porte la session QA d'une autre lane (`ff060_house@example.com`) : m'y déconnecter pour y entrer avec `thomasgentydede30@gmail.com` aurait cassé un run en cours chez quelqu'un d'autre.

**Ce qui remplace la capture, et qui est plus fort qu'elle** — quatre tests unitaires + quatre tests de câblage, dans `frontend/src/keel/api/household.int.test.ts` :

- `mergeCounterparts` : le maître seul rend `[]` (le cas qui fait tout le test — un filtre qui oublierait `role !== "owner"` rendrait `true` pour n'importe quel foyer) ; une bouche sans compte ne compte pas ; un second adulte avec compte fait exister le bloc ; foyer `null` toléré.
- Câblage, **commentaires retirés** : l'écran lit `mergeCounterparts(household)` et le passe ; la carte porte `if (!hasCounterpart) return null;` **et** `if (!isOwner || !hasCounterpart) return;` ; le filtre `no_validated_plan` est là ; le plafond est gaté sur `used > 0`.

**Ces gardes ont été mutées pour prouver qu'elles mordent** : en retirant `if (!hasCounterpart) return null;` et en remettant `{quota` à la place de `{quota && quota.used > 0`, deux tests passent au rouge ; fichier restauré, 23/23 verts.

### Audit d'appelants (commentaires retirés)

| Symbole | Appelants vivants |
|---|---|
| `household.merge.skipped_title` | 1 — la liste survit, amputée de deux motifs |
| `household.merge.quota_left` / `quota_none` | 1 chacun — le plafond survit, gaté |
| `mergeCardSkipKey` | 1 — **volontairement gardé**, voir §7 |

---

## B. « Ce que tu cuisines »

### L'épreuve exigée : le lien casserole → jours N'ÉTAIT PAS dans les sessions

`CookingSessions` ne recevait **aucun plat**. Deux sites de montage vérifiés (`MealBuilder.tsx:1391`, `KitchenToday.tsx:281`) : `sessions`, `preparations`, `open`, `onClose`. Le lien « une casserole → trois jours » se dérive de `dish.uses` (`daysFedBy`) : sans les plats, il n'y était pas seulement invisible, **il y était impossible**.

C'est une preuve d'absence par construction, plus forte qu'une capture : aucun réglage de données n'aurait pu le faire apparaître.

### Donc : porté d'abord, retiré ensuite

1. `CookingSessions` reçoit `dishes` et rend, sous chaque préparation, la ligne `meals.kitchen.feeds` — **la clé du bloc supprimé**, qui déménage avec sa phrase au lieu de devenir orpheline.
2. Placée **hors** de la recette dépliée, avec les deux durées : c'est ce qu'on lit pour planifier, pas devant la casserole.
3. Muette quand aucun plat ne cite la préparation (`[]` ⇒ rien, pas un « couve » sans jour).
4. Puis `plan/KitchenBlock.tsx` supprimé, avec son import et son montage dans `PlanResult.tsx`.

### Preuve — capture `/app/plan`, fenêtre « Your cooking sessions »

```
Wednesday   about 60 min
  Roast chicken thighs  — 4 servings      15 min hands-on   50 min in all
  feeds Wednesday, Thursday
  Cooked rice           — 4 servings       5 min hands-on   25 min in all
  feeds Wednesday, Thursday
  Roast vegetables      — 4 servings      15 min hands-on   35 min in all
  feeds Wednesday, Thursday
Saturday    about 60 min
  Beef and bean chilli  — 4 servings      20 min hands-on   45 min in all
  feeds Friday
```

Captures à 1280 px et 320 px, scroll 0, `overflowX` faux.

### Audit d'appelants (commentaires retirés)

| Symbole | Appelants vivants |
|---|---|
| `KitchenBlock` | **0** dans le code · 1 dans `docs/…/FF-053-l-ecran-du-plan.md`, **mis à jour** (le point 3 de « Livré » porte maintenant le retrait et sa raison) |
| `KitchenBlockProps` | 0 |
| `meals.kitchen.title` / `meals.kitchen.cook_on` | 0 — orphelines, voir §7 |
| `meals.kitchen.feeds` | 1 — `CookingSessions.tsx:186` |

---

## C. « À table » — carte retirée, ⛔ QUESTION OUVERTE

### C.1 Les `portion_note` cités TEXTUELLEMENT, sur des plans réels

**Deux bouches** — foyer `b9a92acb`, plan `54123905`, 2026-08-13 :

| Bouche | Objectif lu | `portion_note` produit |
|---|---|---|
| Thomas (maître) | `muscle_gain` (`student_goals`) | « Au petit déjeuner, une portion **plus généreuse** de la préparation de base avec le même fruit ou yaourt que le reste de la table; au déjeuner et au dîner, **une part plus grande de protéine et d'amidon**, mêmes légumes. » |
| Christèle (sans compte) | `maintenance` (`household_members.goal`) | « Au petit déjeuner, une portion **équilibrée** de la préparation de base; au déjeuner et au dîner, **une part équilibrée** de protéine, d'amidon et de légumes. » |

Les `preparation_shares` suivent le même axe, plat par plat : « Une portion **plus grande** de poulet et de riz, mêmes légumes » contre « Une portion **normale** de poulet, de riz et de légumes ».

**Trois bouches** — foyer `4ba4c573`, plan `e1acfc4c`, 2026-08-12 :

| Bouche | Objectif lu | `portion_note` produit |
|---|---|---|
| Me (maître) | `fat_loss` (`student_goals`) | « Generous vegetables, full protein share, **smaller starch share**. » |
| Zoe (compte) | `muscle_gain` | « **Larger** protein and starch share, same vegetables. » |
| Kid (sans compte, né en 2016) | *(aucun)* | « **Child-size** share of the same dish. » |

### C.2 Le constat, une ligne par cas

- **Deux bouches** : `muscle_gain` contre `maintenance` ⇒ « plus grande » contre « normale ». **Vraie divergence. Le moteur fait son travail.**
- **Trois bouches** : `fat_loss` / `muscle_gain` / enfant ⇒ « moins d'amidon » / « plus de protéine et d'amidon » / « part d'enfant ». **Trois textes distincts pour trois objectifs distincts. Le moteur fait son travail.**

**Verdict : c'est l'AFFICHAGE qui échouait, pas le moteur.** L'entrée n'est pas en cause non plus : les objectifs sont là, lus, et différenciants.

### C.3 ⛔ CE QUE JE N'AI PAS FAIT, ET LA QUESTION QUI VOUS REVIENT

`supabase/functions/_shared/keel/household_portions.ts` est **intact**. `member_portions` est toujours écrit sur chaque plan de foyer.

**La question :** on garde la bifurcation des portions et on la montre autrement, ou on l'abandonne ?

Ce que je peux dire pour la trancher : elle **fonctionne**, elle est **lisible dans la donnée**, et c'est l'argument de différenciation n°1 nommé au §7.1 de `docs/keel/PIVOT-FOYER.md` (l'intersection vide cuisson × divergence nutritionnelle). Ce qui a échoué est une carte qui récitait la table entière à quelqu'un qui n'a rien à en faire. `MyShareCard`, juste au-dessus dans le même écran, dit déjà à **une** personne ce qu'elle mange — c'est peut-être là que le reste doit atterrir, et non dans une nouvelle carte.

### C.4 ⚠️ LE VRAI SUJET D'À CÔTÉ — les deux chiffres demandés

> « Ne pas respecter les habitudes alimentaires de quelqu'un est ce qui coûte le plus cher. »

**Chiffre 1 — combien de bouches ont un canal d'habitudes ?**

```
bouches en base .......................................... 56
  avec un user_id (donc une ligne student_goals possible) . 20   (36 %)
  sans .................................................... 36   (64 %)
bouches NON-MAÎTRES ...................................... 37
  avec un canal d'habitudes ............................... 10   (27 %)
  sans — allergies et rien d'autre ........................ 27   (73 %)
```

Confirmé côté lecture : `household_voices_io.ts:124-126` charge `student_goals` par `.in("user_id", …)`. **Une bouche sans compte n'a pas de ligne, donc aucune habitude nulle part.** Dans presque trois cas sur quatre, l'enfant qui déteste le poisson n'a aucun endroit où le dire.

**Chiffre 2 — les habitudes écrites du maître sont-elles honorées ? ⚠️ NON MESURABLE, et le pourquoi est un résultat**

Le journal `keel.meal.written_instructions` (`generate-meal-v1/index.ts:1876`) **n'a jamais pu se déclencher sur cette base** :

```
lignes student_goals ...................................... 171
  avec au moins une food_preference gardée ................  12
  avec une origine "written" ...............................   0
```

`practical_constraints.food_preferences_origin` vaut **`null` partout** (échantillon vérifié). Or `foodPreferencesByOrigin` classe `memory` toute ligne sans entrée d'origine : `writtenForCheck` est donc **toujours vide**, le bloc `if (writtenForCheck.length > 0)` n'est jamais entré, et ni le compte `declared`/`silent` ni les `issues` `written_instruction_unanswered` n'existent nulle part.

C'est le patron déjà nommé au registre : **une ceinture armée sur un coffre vide.** La garde du double verrou sur les consignes écrites est en place et n'a jamais eu une seule consigne à vérifier — au moins localement. Ce chiffre demande soit une base avec du trafic réel, soit une génération montée exprès avec une consigne écrite (un run modèle, non fait ici).

---

## D. Le geste du soir — pur affichage, comme prévu

### Ce qui a été vérifié AVANT d'écrire une ligne

`dish.method` de plats **`leftover`**, en base, sur des plans réels :

```
plats en lot (uses non vide) .............................. 476
  method vide ............................................    0
  longueur moyenne .......................................  111 caractères
  longueur maximale ......................................  247 caractères
```

Trois citées telles quelles :

> « Réchauffer les oeufs brouillés, griller le pain si besoin et servir avec le yaourt à côté. »
> « Réchauffer une portion de poulet, de riz et de légumes et servir chaud. »
> « Réchauffer une autre portion de la préparation et presser un peu de citron au moment de servir. »

**Ce sont des gestes courts.** Aucune recette recopiée, aucune quantité de lot répétée. Le modèle suit la consigne qui existe déjà dans `meal_generation.ts` (« a dish that draws on a preparation does NOT repeat its recipe. Its method is what you do at that meal »). ⇒ **lot d'AFFICHAGE, le prompt ne bouge pas.**

### Le travail

`DishCard.tsx` n'écarte plus `method` sur les plats en lot. Le drapeau `leftover` ne **masque** plus, il choisit un **libellé** :

- plat de zéro ⇒ `meals.result.method` (« How » / « Comment ») — inchangé ;
- plat en lot ⇒ `meals.result.assemble` (« Before serving » / « Au moment de servir »), clé neuve et distincte : sous « Comment », un assemblage se lirait comme la recette qu'on vient justement de ne pas répéter.

**Les deux gardes tiennent** : aucune durée n'est ajoutée (`active_minutes` reste aux préparations) ; un plat sans `uses` ne change pas ; rien ne s'affiche sans texte.

**« Dans le planning, pas seulement sur la carte du plat »** — `DishCard` est monté par `PlanResult` dans les sections jour-par-jour de `/app/plan` (là où on lit le jour) **et** par `TodayPage`. Le geste apparaît donc dans le planning lui-même.

### Preuve — capture `/app/plan`, mercredi

```
Chicken, rice and cucumber bowls      [Lunch]
  From Roast chicken thighs — cooked on Wednesday.
  From Cooked rice — cooked on Wednesday.
  From Roast vegetables — cooked on Wednesday.
  cucumber 2 cucumbers · mixed salad leaves 160 g · lemon 1 lemon
  Before serving: Reheat one portion of chicken and rice with roasted
                  vegetables, then add cucumber, salad leaves and a squeeze
                  of lemon.
```

…contre le plat de zéro juste au-dessus, inchangé :

```
Greek yogurt with berries and oats    [Breakfast]
  How: Stir the yogurt into four bowls. …
```

Avant ce lot, la ligne « Before serving » **n'existait nulle part dans le produit**.

---

## 5. Les preuves techniques

| Épreuve | Résultat |
|---|---|
| `cd frontend && npx tsc -b` | **exit 0** |
| `npx vitest --config vitest.config.ts run` | 917 verts · **4 rouges, tous antérieurs** (§6) |
| Suite Deno KEEL (`_shared/keel/`) | **3013 passed, 0 failed** |
| 320 px et 1280 px, `/app/household` et `/app/plan` | `document.scrollWidth === innerWidth`, **aucun débordement horizontal** |
| Console navigateur | **aucune erreur** |
| Mutation des gardes de câblage | rouge attendu, puis restauration ⇒ vert |

Captures prises à **scroll 0**, le corps décalé par `margin-top` négatif (le panneau du navigateur ne repeint pas ailleurs).

---

## 6. ⚠️ Les 4 rouges de vitest sont ANTÉRIEURS et ÉTRANGERS à cette lane

Aucun ne touche un fichier de ce chantier.

1. **`src/edge/coverage-guard.int.test.ts`** (2) — deux fonctions edge (`household-merge-notices-v1`, `keel-daily-recommendation-v1`) et un trigger (`household_member_bodies_touch`) absents des listes connues. Rien à voir avec un composant front.
2. **`src/keel/copy/planRefusals.int.test.ts:446`** — sept `household.error.*` écrits dans `en.ts` sont inatteignables depuis `HOUSEHOLD_REFUSAL_KEYS`. **`planRefusals.ts` ET `en.ts` sont modifiés par une AUTRE session** (`git status` le montre) ; cette lane n'a touché ni l'un ni l'autre.
3. **`src/keel/i18n/parity.int.test.ts:356`** — `meals.form.window_span` est identique en `fr` et en `en` (`"{from} → {to} · {days}"`, purement symbolique). `fr.ts` est **non suivi par git** : c'est le lot i18n d'une autre session.

La clé neuve `meals.result.assemble` **passe** la parité (« Before serving » ≠ « Au moment de servir »).

---

## 7. Les clés i18n laissées orphelines, et pourquoi

`frontend/src/keel/i18n/en.ts` est **tenu par une autre session** (modifié, non commité) et `fr.ts` n'est **pas suivi par git**. Le type `MessageKey` en dérive. **Je ne les commite pas.** J'ai retiré les **appelants** ; les clés restent, à balayer dans un lot i18n séparé.

| Clé | État | Raison |
|---|---|---|
| `meals.kitchen.title` | orpheline | Le bloc « ce que tu cuisines » est parti. |
| `meals.kitchen.cook_on` | orpheline | Le jour de cuisson est déjà le titre de la session. |
| `meals.kitchen.feeds` | **vivante** | Déménagée dans `CookingSessions` avec sa phrase. |
| `plan.table.title` | orpheline | Carte « à table » retirée. |
| `plan.table.standard` | orpheline | Idem — le repli « une part standard ». |
| `household.merge.skip.no_validated_plan` | **atteignable, jamais rendue** | Le motif est filtré à l'affichage. La clé et sa chaîne (`mergeCardSkipKey` → `MERGE_SKIP_KEYS`) sont **gardées exprès** : elles portent la bijection testée entre les `SKIP_*` du lecteur serveur et les mots du produit. La retirer casserait cette bijection pour un motif que le serveur émet toujours. |
| `meals.result.assemble` | **AJOUTÉE** sur disque, `en.ts` **et** `fr.ts` | Non commitée, comme le reste de la couche i18n. |

---

## 8. ⚠️ Fichiers touchés mais NON commités par cette lane

| Fichier | État | Ce que j'y ai mis |
|---|---|---|
| `frontend/src/keel/i18n/en.ts` | modifié par une autre session | la clé `meals.result.assemble` |
| `frontend/src/keel/i18n/fr.ts` | **non suivi** (autre session) | la clé `meals.result.assemble` |
| `frontend/src/keel/components/KitchenToday.tsx` | **non suivi** (autre session) | `dishes={meals.dishes ?? []}` sur `CookingSessions` |

⚠️ **`KitchenToday.tsx` est un composant neuf d'une autre lane.** Il monte `CookingSessions`, dont la signature a gagné un prop **obligatoire** (`dishes`). Sans la ligne ajoutée, sa lane ne compilera plus. Elle est sur le disque, elle n'est pas dans mon commit : **la lane qui possède ce fichier doit la garder en l'intégrant.**

---

## 9. Fichiers commités

```
frontend/src/keel/api/household.ts                     +32   mergeCounterparts
frontend/src/keel/api/household.int.test.ts           +111   8 tests (4 purs, 4 câblage)
frontend/src/keel/components/HouseholdMergeCard.tsx           garde + 2 filtres
frontend/src/keel/pages/HouseholdPage.tsx              +12   passe la garde
frontend/src/keel/components/CookingSessions.tsx       +54   prop dishes + ligne « feeds »
frontend/src/keel/components/MealBuilder.tsx            +1   passe dishes
frontend/src/keel/components/plan/PlanResult.tsx       +10   démonte KitchenBlock
frontend/src/keel/components/plan/KitchenBlock.tsx   SUPPRIMÉ
frontend/src/keel/components/plan/TableCard.tsx      SUPPRIMÉ
frontend/src/keel/pages/StudentWeekPlanPage.tsx        +20   démonte TableCard
frontend/src/keel/components/DishCard.tsx              +39   le geste du soir
docs/…/FF-053-l-ecran-du-plan.md                              acte le retrait de KitchenBlock
```

`git add -A` n'a **jamais** été utilisé : chaque commit liste ses chemins.
