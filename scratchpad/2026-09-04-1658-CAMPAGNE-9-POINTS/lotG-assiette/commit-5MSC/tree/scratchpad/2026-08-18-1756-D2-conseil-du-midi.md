# D2 — Le conseil du midi, le chiffre partiel, la saturation, le compteur

Branche `ff-001-quotidien-du-coach`, aucun push, aucun merge.
Quatre dettes, toutes autour du chiffre d'énergie. Les quatre sont soldées.

| # | Sujet | Sort | Commit |
|---|-------|------|--------|
| ① | Le conseil du midi | livré, mesuré de bout en bout | `cd93d73d` |
| ② | Le chiffre change de sujet | livré | `2572a93c` |
| ③ | Le curseur sature, et il le dit | livré | `fad8056b` |
| ④ | Compteur de noms, lane individuelle | livré, **moitié en `.patch`** | `62ed7942` |

---

## ① Le conseil du midi — la garde existait, la phrase n'atteignait personne

`eatingOutAdvice` (`_shared/keel/household_portions.ts:1992`) était écrit, gardé,
testé — **aucun appelant**. L'écrivain et le lecteur sont livrés.

**Mesuré** (`scratchpad/2026-08-18-D2-01-mesure-conseil-du-midi.ts`, rejoue le
montage exact de `adviceForPlan` hors HTTP) — adulte 78 kg, `on_feet`,
petit-déj / déjeuner / dîner, midi dehors le mardi :

```
maintenance        Au déjeuner, vise autour de 950.  / At lunch, aim for around 950.
perte 0,45 kg/sem  →  800
prise 0,30 kg/sem  → 1050
```

et le silence, motif par motif : `mouth_minor`, `mouth_age_unknown`,
`restriction_floor`, `target_off`, `other_mouth`, `no_body`, `unknown_state`.
Petit-déjeuner et dîner ne reçoivent rien (`not_eating_out`) : c'est
`presenceStateFor` qui arbitre, jamais un littéral `"eating_out"` écrit au call
site.

### C5 tenue par la forme, pas par un filtre

Aucun kcal par bouche n'est persisté. Le conseil naît **à la lecture**, dans une
fonction qui ne fait aucune écriture (R5), vit le temps d'une réponse et meurt
avec elle — c'est le patron du reste du module : *on décide, on n'archive pas la
valeur par personne.* Et il n'est calculé **que derrière la porte ⑤** : porte
fermée, aucun chiffre produit, donc rien à filtrer en aval (décision ① du
2026-08-18, « la garde ne produit jamais le chiffre »).

⛔ Aucun solde. Le conseil se calcule sur la journée **déclarée**, pas sur ce que
le plan a composé : « vise 700 au déjeuner » est vrai que la personne ait pris
son petit-déjeuner ou non. Il survit donc aussi à une journée illisible — et
c'est le jour où l'écran n'a rien d'autre à offrir.

### Deux choses ont dû bouger, sinon le lot naissait désarmé

- **`estimatedMaintenanceFor`** (`weight_pace.ts`) extrait le choix « équation
  adulte ou pédiatrique », qui vivait en deux exemplaires (`paceCeilingFor`,
  `executedPaceFor`) et allait en avoir un troisième. La branche se choisit sur
  `isMinor`, jamais sur `ageYears`.
- **`maintenancePaceFor`** rend l'entretien nu, écart zéro. `eatingOutAdvice`
  accepte `direction: null` (« la cible EST l'entretien ») mais exige un
  `ExecutedPace`, que `executedPaceFor` ne peut pas produire sans direction ni
  cran. Sans lui, le conseil n'aurait parlé qu'aux gens ayant un objectif **et**
  un rythme réglé : la majorité de la base n'aurait jamais rien reçu, et le lot
  aurait ressemblé trait pour trait à un lot qui marche.

### Trou connu, structurel, laissé ouvert exprès

Un jour dont le plan n'a composé **aucun** plat n'a pas d'entrée de conseil —
parce qu'il n'a pas non plus de bloc à l'écran où la poser (`PlanDayBlock` groupe
par plats). Ça se refermera avec l'écran d'une journée entièrement dehors.

---

## ② Le chiffre partiel — le nombre change de sujet

`meals_out` et `subject` voyageaient depuis L8 ③ et **personne ne les lisait** :
`readDay` ne les copiait pas, `DayEnergyView` ne les portait pas. L'écran
annonçait « 1 400 kcal sur la journée » un jour où le plan n'avait composé que
deux repas.

    1 400 kcal sur les 2 repas que j'ai composés (1 repas dehors)

Trois arbitrages :

- **L'incise REMPLACE « sur la journée » et s'AJOUTE aux deux autres variantes.**
  `day_partial` et `day_with_addon` ne revendiquent pas la journée ; `day`, si.
  Lui accoler l'incise donnerait une ligne qui se contredit dans sa longueur.
- **Les deux incomplétudes se disent.** « Je n'ai pas su lire tous les plats »
  (référentiel) et « il manquait des plats à lire » (la vie de quelqu'un) ne se
  réparent pas au même endroit ; n'en dire qu'une proposerait de curer une table
  de composition pour un déjeuner au restaurant.
- La phrase vit à côté de la règle qui l'autorise (`api/mealEnergy.ts`), même
  raison que `PACE_WARNING_LABELS`.

### Le piège du 0–0 ne se rejoue pas

Sa forme symétrique ici serait un `subject` présent **sans son compte** :
« sur les 2 repas que j'ai composés (0 repas dehors) » — une phrase qui restreint
le sujet du nombre en avouant qu'il n'y a aucune raison de le restreindre, **et
qui remplacerait « sur la journée », lequel était vrai.**

`readDay` exige donc les trois : jeton dans le vocabulaire fermé, `meals_out`
strictement positif lu par `finiteEnergyNumber` (**jamais `Number()`**), au moins
un repas composé. Repli = comportement d'hier. Le rendu revérifie les trois :
deux ceintures aux deux bouts du fil, comme `readDish`.

---

## ③ Le curseur de prise sature, et rien ne le disait

Confirmé et chiffré. Femme 60 kg / 165 cm / sédentaire, en prise, curseur jusqu'à
**0,60** :

```
0,15 →  165 kcal/j  (chosen)
0,20 →  196 kcal/j  (surplus_band)
0,40 →  196 kcal/j
0,60 →  196 kcal/j
```

Les deux tiers de la course ne changent pas un gramme. Homme 110 kg qui
s'entraîne dur : saturation dès **0,40** pour un curseur qui monte à 1,0.

Ce n'est pas un bug : l'écart entre `paceCeilingFor` (borne dure) et
`executedPaceFor` (+10 %, Helms 2023) est assumé et daté, et son propre
commentaire annonçait qu'il restait à le **dire**. Aucune borne n'a bougé.

- `paceSaturation()` **interroge `executedPaceFor`** au lieu de recopier son
  plafond : il n'y a pas de seuil en kg/semaine à figer, le point de saturation
  dépend du corps (0,178 sur elle, 0,341 sur lui).
- **Jeton et phrase séparés de `paceWarning`** : au-delà de 0,5 kg/sem sur un
  grand corps les deux sont vraies en même temps, et un champ unique en tairait
  une — celle qui parle du corps.
- La phrase **ne cite aucun kcal et ne porte aucun chiffre** (C5 : ce curseur est
  réglé par le compte maître pour quelqu'un d'autre). Elle dit un fait, jamais
  une consigne. Ton neutre, pas ambre : ce n'est pas un risque.
- Une **perte** et un **mineur** ne saturent jamais — mesuré sur toute la course.
  Ce n'est pas de la dormance : `paceCeilingFor` y borne le curseur exactement là
  où `executedPaceFor` plafonne.

---

## ④ Le compteur à deux lignes — et ce qui n'a pas pu être commité

`parseGeneratedMeal` calcule `name_counts` (déclaré / gardé / refusé) pour **les
deux** lanes depuis L7 ③ ; seule la lane foyer l'archivait. Côté individuel, un
nom refusé et un nom jamais écrit tombaient tous deux sur `null`.

Deux lignes ajoutées, au même nom et à la même place que sur la lane foyer
(racine du `generated_from`, plus l'aperçu).

> ⚠️ **`generate-meal-v1/index.ts` n'est PAS commité.** Une lane étrangère
> (FF-042) y a 6 hunks en cours. Mes 2 hunks sont extraits dans
> **`scratchpad/2026-08-18-D2-04-generate-meal-v1-name-counts.patch`**, vérifié
> `git apply --check` **propre sur la version HEAD du fichier**. Ils sont
> appliqués dans l'arbre de travail (`deno check` vert).
> Ce qui est commité est le commentaire de la lane foyer, qui affirmait que ce
> compteur n'existait que d'un côté — une contrainte documentée qui a survécu à
> sa cause.

Conséquence : **aucun test de source n'a été ajouté sur ce point**. Il aurait été
rouge à HEAD tant que le `.patch` n'est pas appliqué.

---

## Preuves

- **Deno `_shared/keel/`** : 3 414 verts, 0 rouge (7 tests neufs : entretien nu,
  arbitrage pédiatrique, saturation × 4).
- **vitest complet** : 1 461 verts. Rouges **étrangers uniquement** :
  `coverage-guard` × 2 et `household.int.test.ts` × 2 (`kind:"away"` ajouté sans
  mise à jour du test). Inchangés avant/après.
- **`npx tsc -b --force`** : vert. **`deno check`** sur les deux fonctions edge
  touchées : vert.
- **`vite build`** : vert. L'import de `household_portions.ts` par le front se
  tree-shake — `aim for around` est dans le bundle, `portion.body`
  (`FORBIDDEN_PORTION_TERMS`) n'y est pas.
- **Rendu éprouvé sur la VALEUR RENDUE** (`react-dom/server`) :
  `energyReadout.int.test.ts`, 13 cas, deux langues.

### Mutations — douze, toutes mordantes

| Mutation | Rouges |
|---|---|
| ③ `paceSaturation` toujours `null` | 2 |
| ③ `paceSaturation` toujours vraie | 2 |
| ③ traduction FR recopiée de l'EN | 1 |
| ③ le `<p>` du dialogue débranché | 3 |
| ② `subject` ignoré par `readDay` | 5 |
| ② garde tout-ou-rien désarmée (`mealsOut > 0` retiré) | 3 |
| ② incise ajoutée au lieu de remplacer « sur la journée » | 2 |
| ② traduction FR recopiée de l'EN | 2 |
| ① rendu du conseil débranché | 3 |
| ① `kcal` relu par `Number()` — le « vise autour de 0 » | 1 |
| ① vocabulaire des moments désarmé | 1 |
| ① conseil rangé sur tous les jours | 1 |

## Fichiers non touchés, comme demandé

`SetupPage.tsx`, `api/onboarding.ts`, `api/household.ts`, `MealPickerGrid`,
`WorkLunchCard`, `KitchenEquipmentCard`, `PlanResult`, `PlanGrid`,
`PlanDayBlock`, `api/mouthProfile.ts`, `household_meal_generation.ts`,
`household_fixed_intakes.ts`. Aucun `git add -A`, aucun `git stash`, aucune
commande à risque.

## Reste à faire (non fait, volontairement)

1. Appliquer le `.patch` de ④ une fois la lane FF-042 posée.
2. `meal-energy-v1` fait toujours **une requête `profiles` de trop** :
   `loadStudentBody` rend déjà `activityLevel`, et le bloc de la cible relit la
   colonne juste après. Non touché — ce n'était pas ce lot.
3. Une journée **entièrement** dehors n'a nulle part où poser son conseil
   (voir ①). Demande un écran, pas un correctif.
