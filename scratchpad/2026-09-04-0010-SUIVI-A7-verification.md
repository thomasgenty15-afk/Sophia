# Vérification du lot A7 — la page de suivi (lane SUIVI)

Vérificateur : agent de vérification, worktree `/Users/ahmedamara/Dev/Sophia-2-chantiers/VERIF`
détaché sur `23391bd3` (HEAD de l'arbre principal au moment du run).
Base d'antériorité : `31ee930f`. Périmètre : les onze commits A7, fusionnés en `cd262061`.

> Journal écrit au fil de l'eau. Les sections se complètent à mesure.

## 0. Le poste

- Worktree propre (`git status --short` vide), détaché sur `23391bd3`.
- `node_modules` et `frontend/node_modules` = liens vers l'arbre principal ; `frontend/.env.local` présent.
- Disque : 3,8 Go libres. Aucun worktree neuf ouvert.
- ⚠️ Deux lanes (CUISINE, MEMBRE) faisaient des runs réels : aucun appel edge, aucune migration,
  aucun restart de runtime n'a été lancé par cette vérification.

## 1. Les onze commits d'A7

| sha | sujet |
|---|---|
| `0f0f655a` | l'écran de progression mort quitte le dépôt (`ProgressPage.tsx`, −393) |
| `5b89cefd` | l'agrégat du suivi est un module pur (`tracking_window.ts` +749, test +602) |
| `de35fadf` | i18n SUIVI (catalog/en/fr) |
| `7d0c336b` | la garde du retrait — 36 clés (`trackingPage.int.test.ts` +193, journal) |
| `89667119` | i18n SUIVI — les mots de la page (catalog/en/fr + `energyBasis.int.test.ts`) |
| `fd47c04c` | la page de suivi (`tracking.ts`, `TrackingCards`, `TrackingDescribeDialog`, `WeightCurveCard`, `weightCurve`, `StudentProgressPage`) |
| `f315068c` | i18n SUIVI — « pas de total » n'est pas « rien à additionner » |
| `0390f633` | `keel-tracking-v1` (index, `tracking_window_io`, `tracking_describe_io`, `plan_energy_read`, `meal-energy-v1` allégé) |
| `c09d547a` | les trois renversements (FF-031, `mealPhoto.ts`, `mouth_anchor.ts`) |
| `0ae5ad03` | journal + fixtures QA (`40-tracking-a7.sql`) |
| `7c0a0d83` | le compteur de glissements tombe à zéro bruyamment |

## 2. Statique — PROUVÉ

**Périmètre du diff.** Union des 30 fichiers touchés par les onze commits (les
autres fichiers du `diff 31ee930f..7c0a0d83` viennent des deux fusions
`e39109cb` et `0a4415de`, donc d'autres lanes). Tous sont dans le mandat §5.11,
+ i18n, + journaux, + fixtures. **Aucun fichier hors mandat.**

Deux fichiers demandent une justification, elle tient :

- `supabase/functions/meal-energy-v1/index.ts` (−98) : les quatre lecteurs de
  payload y ont été **déplacés** vers `_shared/keel/plan_energy_read.ts`.
  **Mesuré, pas cru** : `readIngredient`, `readIngredients`, `readDishes`,
  `readPreparations` sont **byte-identiques** (comparaison de corps, espaces
  normalisés) entre `31ee930f:meal-energy-v1/index.ts` et le module neuf.
  Aucun arbitrage perdu.
- `frontend/src/edge/coverage-guard.int.test.ts` (+9) : c'est le geste que ce
  garde réclame pour toute fonction edge neuve. Deux fonctions **étrangères**
  y manquent encore ; le test reste rouge pour un motif qu'A7 n'a pas créé.

**Suites (rejouées dans le worktree VERIF, HEAD `23391bd3`)**

| suite | résultat |
|---|---|
| `frontend && npx tsc -b --force` | **exit 0** |
| `npx tsc -p tsconfig.test.json --noEmit` | 87 erreurs / 25 fichiers |
| `npx vitest run` | **2222 passés, 4 rouges** (140 fichiers) |
| `deno test` (9 fichiers du lot + voisins) | **211 passés / 0 rouge** |
| `deno check` (7 fichiers) | **exit 0** |

Les **4 rouges vitest** sont exactement les rouges attendus : `coverage-guard`
×2 et `household.int.test.ts › awayFrom` ×2. Aucun n'appartient à A7.
(Le journal du bâtisseur annonçait 5 ; le 5ᵉ — `mealBoxes` — a été réparé
depuis par une autre lane. L'écart joue **en faveur** de l'arbre.)

**`tsconfig.test.json`, lu PAR FICHIER contre `scripts/.tsc-test-red-baseline`
(la porte qui a manqué toute la journée) :**

- total mesuré **87**, baseline 93 ;
- **aucune hausse sur aucun fichier**, **aucun fichier hors liste** ;
- deux **baisses** : `api/onboarding.int.test.ts` 2 → 0 et
  `lib/planByPersonModel.int.test.ts` 6 → 2 (elles n'appartiennent pas à A7) ;
- **aucun fichier d'A7** (`trackingPage`, `weightCurve`, `energyBasis`,
  `tracking_window*`) ne porte la moindre erreur.

⇒ **PROUVÉ : le typage des tests n'a monté sur aucun fichier.**

## 3. i18n — PROUVÉ

- **48 clés ajoutées**, comptées dans le bloc délimité `chantier-0903/SUIVI` :
  `en.ts:8139-8234` → **48**, `fr.ts:7025-7091` → **48**, et les deux jeux de
  clés sont **identiques** (`diff` vide). Bloc présent dans les deux packs.
- **36 clés retirées.** Mesure d'antériorité : `git show 31ee930f:…/en.ts`
  portait **exactement 36** clés `^\s*"progress\.`, et `fr.ts` en portait
  **0** — le compte tombe juste, et la lane n'a pas « traduit puis retiré ».
- **Appelants vivants des 36 : aucun.** Recherche littérale sur `frontend/src`,
  `supabase`, `scripts`, `docs`, hors `en.ts`/`fr.ts`/`catalog.ts`/
  `trackingPage.int.test.ts` : les seules occurrences sont des **commentaires**
  de `catalog.ts` et des correspondances de **sous-chaîne** sur le namespace
  vivant `student_progress.*` (`progress.title` ⊂ `student_progress.title`).
  Recherche des constructions **dynamiques** (`t(\`progress.${…}\`)`) : aucune
  (la seule clé dynamique du dépôt est `moment.${…}` dans `mealRhythm.ts`).
  Le piège du type « `meals.loading` avait deux appelants » était ici la
  **frontière au namespace** : `WeekView` empruntait quatre clés à `progress.*`,
  ce qui donnait à `/coach/clients/:id` l'accès aux 36. Ces quatre-là avaient
  déjà été **rapatriées sous `week.*` avant A7** (lot 5) — vérifié dans
  `en.ts:1430-1452` et `catalog.ts:270-282`. A7 n'a retiré que des orphelines.
- **Mojibake** : scan `Ã` / `Â` / `â€™` / `U+FFFD` sur les 13 fichiers du lot
  (packs i18n compris) → **0**.
- Parité, `pageSeams`, `pageFrontier` : verts dans le run vitest ci-dessus.

## 4. Mutations rejouées — 13, dont 3 à moi

Chacune : `cp` d'une copie prise avant, mutation par motif exact, run, `cp` de
retour, `cmp` vert. Aucune n'est restée en place. Aucun `git checkout/restore`.

| # | mutation | attendu (journal) | **mesuré** |
|---|---|---|---|
| M1 | `weakestBasis` : `rank >` → `rank <` (prend la base la plus **forte**) | 4 rouges | **4 rouges** ✓ |
| M2 | retirer le `throw` sur `gate` absent | 1 rouge | **1 rouge** ✓ |
| M3 | `slotDayShare` rend `weight` au lieu de `weight / total` | 2 rouges | **2 rouges** ✓ |
| M3′ | M3 **+ le second cas retiré du test** | — | le test « arrondie aux 50 » **redevient VERT** ✓ |
| M4 | `if (floor)` → `if (false)` | 1 rouge | **1 rouge**, et c'est le test C5 ✓ |
| M5 | une lecture `weekly_reviews` revient dans la page | 1 rouge | **1 rouge** ✓ |
| M7 | une lecture `protocol_events` **avant** `loadEnergyGate` | 2 rouges | **1 rouge** (« la porte avant toute autre lecture ») ✓ |
| M8 | la requête des faits perd son `.eq("user_id")` | 1 rouge | **1 rouge** ✓ |
| M9 | le plan du foyer perd son `.eq("household_id")` | 2 rouges | **2 rouges** ✓ |
| M10 | **chez MEMBRE** : `accident_io.withShiftTrace` renomme `shifts` → `plan_shifts` | 1 rouge nommé | **1 rouge nommé**, pas un zéro ✓ |
| C5-M2a | la sortie sous plancher **retirée** de la page | — | **1 rouge** ✓ |
| C5-M2b *(mienne)* | la sortie sous plancher **neutralisée** (`report.floor && false`), le mot reste | — | **11/11 VERTS** — voir défaut ③ |
| V1b *(mienne)* | `leftoverBoxes: {known:true,count:3}` sous plancher | — | **29/29 VERTS**, et le rapport porte `count:3` — voir défaut ② |
| V2 *(mienne)* | un plat **silencieux** prend `plan_quantities` au lieu de `assumed` | — | **2 rouges** ✓ |
| V3 *(mienne)* | le préfixe `meal_tick:` renommé **à sa source** (`meal_tick.ts`) | — | **51/51 VERTS** — voir défaut ① |

**M3′ répond à l'aveu du bâtisseur** (« un test paramétré par son propre
hasard ») : sans le second cas `["lunch","dinner"]` (poids 0,75), le test
« arrondie aux 50 » reste **vert** sous M3, parce que
`breakfast+lunch+dinner` pèse exactement 1,00 et que la normalisation y est
l'identité. **Le second cas mord réellement** : c'est lui, et lui seul, qui fait
tomber ce test-là. Aveu vérifié, correctif vérifié.

**M10 / §8ter, vérifié dans le code** : `tracking_window_io_test.ts:13` importe
le **vrai** `withShiftTrace` depuis `accident_io.ts` (aucune fixture recopiée),
et un second test **relit la source** de `PlanShiftTrace` et la confronte à
`PLAN_SHIFT_TRACE_FIELDS`. `IO_CODE` est `stripComments(IO_SOURCE)` — les
épreuves de source ne comptent pas un commentaire pour du code.

## 5. C5 — l'invariant central du lot

**Prouvé, côté serveur :**

- `buildTrackingReport` **jette** si `gate` manque (M2 le prouve) ; `gate` n'est
  pas optionnel — « un paramètre de garde optionnel est une garde désarmée ».
- La sortie sous plancher est la **première branche après les assertions de
  date** (`tracking_window.ts:558-572`) : `permanent: null`, `objective: null`,
  `weight: null`. M4 la fait rouler.
- Côté assemblage, `loadEnergyGate` est la **première lecture**
  (`tracking_window_io.ts:397`) et l'épreuve de source le tient (M7).
- Identité : `keel-tracking-v1/index.ts:69-82` — le `user_id` vient du JWT
  (`userClient.auth.getUser()`), **jamais du corps**. `verify_jwt` reste `true`
  (aucune section `config.toml`), `deploy-manifest-check` rend **54 griefs**,
  identiques à la base, **aucun** ne nomme `keel-tracking-v1`.
- Aucun kcal n'est **stocké** : la seule écriture du lot est le fait
  `slot_meal:` de `tracking_describe_io.ts:154`, et elle ne porte **aucun**
  champ d'énergie (`energy: null` en dur dans le retour).
- Mifflin / `estimatedMaintenanceKcal` : **absents** du chemin du suivi.
- `weekly_reviews` / `risk_band` : plus une seule lecture (M5 le prouve ; les
  occurrences restantes sont des commentaires, et `IO_CODE`/`page` sont
  blanchis avant lecture par les tests).

**Prouvé au rendu réel, dans les deux langues.** J'ai monté une **sonde**
(`renderToStaticMarkup` + `createElement`, patron de
`memberWorkLunchCard.int.test.ts`, avec `location.pathname = "/app/progress"`
— sans ce stub le pack rend l'anglais, et j'ai failli le rapporter comme un
défaut : c'était un artefact de ma sonde), puis je l'ai **supprimée**
(`git status --short` vide après coup).

Capture fr, texte réel :

> Ton objectif, jour par jour · Aujourd'hui **2180 kcal, estimé — un repas ou
> plus n'a jamais été renseigné et tient sa place par une moyenne.** · Ces sept
> jours **15100 kcal, estimé — une partie est lue sur des photos, et une photo
> tire vers le bas.** · Ce plan **6300 kcal, estimé — les plats de ton plan dont
> tu n'as rien dit sont comptés comme mangés.** […] Rien de noté · Collation de
> l'après-midi **environ 250 kcal — une valeur de remplacement, et tu peux la
> changer dans la journée.** Décrire

- **Chaque chiffre porte sa base**, en français comme en anglais : 10 occurrences
  de `kcal` mesurées, 10 accompagnées de leur phrase de base. La base est **dans**
  la clé (`tracking.total.<base>`), donc il n'existe aucun chemin de rendu où le
  nombre sort sans elle.
- **Aucun `%`**, aucun « il te reste », aucune adhérence, aucun terme de corps
  ni d'objectif. Le temps économisé rend la phrase honnête : « Combien de
  minutes ça t'a fait gagner, personne ici ne l'a mesuré. Donc personne ici ne
  te le dit. »
- `FORBIDDEN_PORTION_TERMS` : **surface non touchée**. Cette liste garde une
  *consigne* lue à table (`sanitizePortionNote`), où « kcal » est justement
  interdit ; la page de suivi est la surface que `CALORIE_REVERSAL` autorise à
  porter un kcal **avec sa base**. A7 ne rend aucune note de portion.
- « Les boîtes restées ne sont pas encore comptées — et elles ne sont pas
  affichées à zéro pour autant » : le contrat §5.10 est tenu au mot.

**Non prouvé sous plancher, et c'est le défaut ② ci-dessous** : un champ
numérique non-kcal traverse la sortie.

## 6. Les trois arbitrages — motif vérifié ou démenti

### (a) `maintenanceRange` et jamais `directedRange` — **motif VÉRIFIÉ, illustration DÉMENTIE**

- **Écrit contre la formule**, comme demandé : `tracking_window.ts:481-503`
  (l'en-tête de `slotEstimate` lui-même) **et** `tracking_window_io.ts:496-514`
  (au point d'appel). Ce n'est pas seulement au journal. ✓
- **`directedRange` n'apparaît nulle part dans le chemin d'estimation** : les
  5 occurrences du dépôt sur ce chemin sont **toutes des commentaires**
  (`tracking_window.ts:233, 482, 502` ; `tracking_window_io.ts:497, 500`).
  Aucune invocation. ✓
- **Le motif est juste** : estimer un repas manquant depuis la cible est
  circulaire, et l'écart penche toujours du côté flatteur (l'estimation depuis
  la cible est systématiquement **plus basse**).
- **L'illustration chiffrée est fausse** — voir défaut ④.

### (b) Le plan de foyer s'abstient — **VÉRIFIÉ, et il ne rend pas zéro**

- `tracking_window_io.ts:340-350` : `dishKcal` reste `null` dès que
  `planKind === "household"` (le calcul n'est même pas tenté).
- `tracking_window.ts:788-800` : `abstained` se décide **avant** la somme, et
  `total: abstained ? null : sumEnergy(parts)`. La portée entière s'abstient
  (`totalOver` rend `{total: null}` dès qu'un jour s'abstient) — **jamais 0**.
- **Vu au rendu** : « Pas de total sur ce jour : un plat n'a pas pu être pesé,
  et une somme partielle tirerait vers le bas. » L'écran le **dit**, il ne rend
  pas une case vide. ✓ (mais voir défaut ⑤ sur le mot « jour »).

### (c) « Décrire » — **NON-LIVRAISON RÉELLE, et mal nommée du côté de la personne**

- **Aucun kcal écrit** : `describeMissedSlot` rend `energy: null` sur **tous**
  ses chemins, l'`insert` ne porte aucun champ d'énergie, et un test le tient. ✓
- **Le repère survit à la déclaration**, exprès : `missed[].estimate` est calculé
  indépendamment de `declared`, et `declared: true` ne retire que le bouton.
  Vu au rendu : « Au coucher — environ 200 kcal — une valeur de remplacement »,
  **sans** bouton « Décrire ». ✓ L'incitation perverse est bien fermée.
- **La phrase du total continue de dire `slot_estimate`** : mesuré, elle rend
  « un repas ou plus **n'a jamais été renseigné** et tient sa place par une
  moyenne » alors que la personne vient de le renseigner. **L'incohérence est
  réelle**, et elle est **du côté de la personne** : elle a écrit ses 200 g de
  riz, le chiffre du jour n'a pas bougé d'un kcal, et la phrase lui dit que
  personne n'a rien renseigné.
- **Le bouton n'est pas mort** : `onRecorded` incrémente `reload`, et l'effet de
  chargement en dépend (`StudentProgressPage.tsx:355, 1023`). L'écran se
  recharge, le créneau passe à « déclaré », le bouton disparaît. Vérifié dans la
  source, pas au navigateur.
- **Mais l'affirmation « Aucune copie ne prétend le contraire » est vraie par
  accident** — voir défaut ③.

## 7. Les trois renversements — écrits, pas effacés

| # | où | texte d'origine cité ? | ce qui n'est PAS renversé ? | verdict |
|---|---|---|---|---|
| **R2** | `FF-031` §3 (bloc `Hors périmètre`) **et** la ligne **R12** du tableau | **oui**, en `>` blockquote mot pour mot ; R12 est **amendée en place**, sa justification d'origine conservée | oui : « pas de moyenne mobile » (un test relit la source), `weight_readout` suspendu sous ceinture — **et déplacé du composant au serveur**, aucun IMC, aucune cible dérivée, aucune grandeur neuve | **ÉCRIT** |
| **R3** | `api/mealPhoto.ts:95-128` | **oui**, et l'ancien bloc a bien été **retiré** de sa place (vérifié au `git show` : les 3 lignes `-`) — pas de phrase contradictoire résiduelle | oui : `number` nu interdit, **courbe d'énergie interdite**, aucun total stocké ; les chiffres (−26,6 %, ×1,04, deltas 2,5×) sont réaffirmés vrais | **ÉCRIT** |
| **D7.8** | en-tête de `SLOT_DAY_WEIGHT`, `mouth_anchor.ts:471-503` | **oui** : « ce n'est pas une recommandation nutritionnelle… ça normalise, ça ne prescrit pas » est repris **mot pour mot** dans les deux sens | oui, et le piège est écrit : la table **n'est pas normalisée** (ça casserait `dayCoverageOf`), c'est le LECTEUR qui divise par la somme des poids déclarés | **ÉCRIT** |

⚠️ Limite mesurée sur R2 : « pas de moyenne mobile » est tenu par une
**liste-garde nommée** (`weightCurve.int.test.ts:117` : `rollingAverage`,
`movingAverage`, `smooth`, `ema`). Elle ne garde que ce qu'elle nomme — un
lissage écrit `avg7` ou `windowMean` passerait. Ce n'est pas un défaut du lot,
c'est la portée réelle de sa preuve.

## 8. Le contrat §5.10 — tel qu'A7 le consomme

| clause | mesure |
|---|---|
| `.eq("user_id", me)` **partout** en plus de RLS | ✓ épreuve de source sur **toutes** les `.from()` du module ; M8 la fait rouler. L'unique exception (plan `household` d'un membre) est gardée par le **couple** `.eq("plan_kind","household")` + `.eq("household_id")`, jamais par un retrait nu ; M9 → 2 rouges |
| préfixes de faits intacts | ⚠️ les valeurs sont justes, mais **recopiées** — voir défaut ① |
| `slot_meal:<date>:<slot>` | ✓ produit par `slotMealFactKey` **importé** de `slot_meal_io.ts` — une seule définition, celle du canal C1 |
| `plan_relation`, `disqualified_reason`, `recognized.energy_estimate` | ✓ lus, jamais complétés ; `plan_relation` ne prend **jamais** `as_planned` |
| plans du foyer avec `member_portions` | ✓ portée reprise de `resolvePlanScope` (A8.0) ; abstention assumée sur l'énergie (arbitrage b) |
| `meal_share_outcomes` absente ⇒ boîtes **inconnues, jamais zéro** | ✓ `{ known: false }` en dur aux deux points de sortie, et l'écran le dit |
| `generated_from.shifts[]` compté **bruyamment** | ✓ **trois chemins vérifiés** : le cas nominal reste muet ; un test de câblage importe le **vrai** `withShiftTrace` (`tracking_window_io_test.ts:13`, aucune fixture recopiée) ; un second **relit la source** de `PlanShiftTrace`. **M10 mesuré : renommer la clé chez MEMBRE rend 1 rouge NOMMÉ, pas un zéro.** |

## 9. Défauts

### ① `tracking_window.ts:369-370` — les préfixes de faits sont une **seconde copie**, et rien ne l'épingle

```ts
const MEAL_TICK_PREFIX = "meal_tick:";
const ACCIDENT_OFF_PLAN_PREFIX = "accident_off_plan:";
```

Le dépôt les exporte déjà : `_shared/keel/meal_tick.ts:62` — dont le
commentaire dit littéralement **« Une seule définition. »** — et
`_shared/keel/accident_io.ts:645`. `meal_tick.ts` est un module **pur**, déjà
importé par `evening_strip.ts` et `accident.ts` : rien n'empêchait de l'importer.

**Mesuré (mutation V3, la mienne)** : renommer le préfixe **à sa source**
(`mealTickKey` → `meal_tick_v2:` et la constante avec) laisse **51/51 tests
d'A7 verts** (40 Deno + 11 vitest). Ce que ça coûterait en production, en
silence : `plansDone` tombe à 0, chaque plat coché redevient `silent`, sa base
passe de `plan_quantities` à `assumed`, et le total du jour change de base sans
que rien ne le dise.

C'est **exactement** le mode de défaillance que §8ter a passé cent lignes à
fermer pour `shifts[]` — « un compteur qui épingle une copie de son arbitre le
fige dans le temps ». La leçon a été appliquée à un contrat et pas aux deux
autres.

**Geste** : importer `MEAL_TICK_PREFIX` (et de préférence `parseMealTickKey`)
depuis `meal_tick.ts` ; pour `accident_off_plan:`, sortir la constante dans un
module pur **ou** ajouter à `tracking_window_io_test.ts` une épreuve de source
du même patron que `PLAN_SHIFT_TRACE_FIELDS`.

### ② `tracking_window.ts:563-572` — sous plancher TCA, un champ **numérique** traverse la sortie

**Mesuré (sonde)**, `gate.reason = "restriction_floor"`, `leftoverBoxes:
{known:true, count:3}` :

```json
{"window":{…},"floor":true,"energy":{…},"permanent":null,"objective":null,
 "weight":null,"leftoverBoxes":{"known":true,"count":3}}
```

C5 dit « la page de suivi ne rend **aucun** chiffre ni courbe » ; `count: 3` est
un chiffre. **Mesuré (mutation V1b)** : le test
« sous plancher TCA, le rapport ne porte AUCUN chiffre ni courbe (C5) »
**reste vert** avec ce cas — parce que `energyLeaves` ne ramasse que les objets
portant une clé `kcal`.

Inoffensif **aujourd'hui** : l'`_io` écrit `{ known: false }` en dur
(`tracking_window_io.ts:415` et `:578`). **Latent et armé** : le contrat §5.10
prévoit qu'après A8.2 ce champ portera un `count`.

Et un défaut de commentaire qui l'accompagne : `tracking_window_test.ts:99-101`
affirme « Un `number` nu ailleurs que dans `weight` fait tomber le test ».
**C'est faux** — l'implémentation n'inspecte jamais un nombre nu.

**Geste** : forcer `leftoverBoxes: { known: false }` dans la branche
`if (floor)` ; et faire de `energyLeaves` (ou d'un second marcheur) une vraie
chasse aux nombres nus, ou corriger son commentaire.

### ③ `tracking.describe.done` — clé **orpheline**, dans les deux packs

Sur les 48 clés ajoutées, **une n'a aucun appelant**, ni littéral ni interpolé :
`TrackingDescribeDialog.tsx:63-65` fait `onRecorded(); onClose();` et n'affiche
jamais de confirmation. (Les 13 autres « sans appelant littéral » sont atteintes
par gabarit — `tracking.dish.${state}`, `tracking.scope.${scope}`,
`tracking.weight.period.${p}` — et **vues au rendu**.)

Deux conséquences, à dire ensemble :

- **La bonne** : la phrase morte est « Enregistré. **Ça compte dans ce jour,
  maintenant.** » / « Recorded. **It counts in that day now.** ». C'est
  exactement ce que la non-livraison (c) **ne fait pas**. Le journal du
  bâtisseur (§8bis) écrit « Aucune copie ne prétend le contraire » : c'est vrai
  **par accident**, parce que la copie qui le prétend n'est pas branchée — pas
  parce qu'elle n'a pas été écrite. **La non-livraison est donc MASQUÉE, pas
  bien nommée** : rien à l'écran ne dit à la personne que son texte n'entre pas
  dans le chiffre.
- **La mauvaise** : le lot dont le test phare compte 36 clés retirées faute
  d'appelant en ajoute une sans appelant, et `trackingPage.int.test.ts` n'a
  **aucune symétrie** (`REMOVED_KEYS` existe ; pas d'épreuve « aucune des clés
  ajoutées n'est orpheline »).

**Geste** : câbler une confirmation qui **ne promet pas un chiffre** (« C'est
noté. Le repère reste : ton chiffre du jour ne bouge pas. »), **ou** retirer la
clé des deux packs. Dans les deux cas, ajouter l'épreuve symétrique.

### ④ L'illustration chiffrée de l'arbitrage (a) est **démentie par la mesure**

`tracking_window.ts:495-498` **et** `tracking_window_io.ts:507-510` écrivent
tous deux : « Sur un déficit de 500 kcal et deux repas manquants, l'écart est
**de l'ordre du tiers de la journée** ».

**Mesuré en exécutant le vrai code** (`maintenanceRange` 75 kg / `trains_some`
→ 2250-2500 ; `directedRange` direction `down`, `dailyDeltaKcal: 500` →
1750-2000 ; `slotEstimate` sur déjeuner + dîner) :

| créneaux déclarés | entretien | cible | écart | % de la journée |
|---|---|---|---|---|
| les six | 1400 kcal | 1100 kcal | **300 kcal** | **12,6 %** |
| trois (le cas le plus favorable à l'affirmation) | 1800 kcal | 1400 kcal | **400 kcal** | **16,8 %** |

Le **motif** tient : la circularité est réelle, et l'écart penche **toujours**
du côté flatteur (l'estimation depuis la cible est systématiquement plus basse).
L'**ordre de grandeur** est surévalué d'un facteur **2 à 2,6**, aux paramètres
que la phrase nomme elle-même. **Geste** : remplacer « de l'ordre du tiers de la
journée » par « de l'ordre de 300 à 400 kcal, soit 13 à 17 % de la journée »,
aux **deux** endroits.

### ⑤ `TrackingCards.tsx:52-55` — la phrase d'abstention nomme un **jour** et sert **trois portées**

Capture de rendu, fr :

> Ces sept jours — Pas de total **sur ce jour** : un plat n'a pas pu être pesé…
> Ce plan — Pas de total **sur ce jour** : un plat n'a pas pu être pesé…

`totalText(total, abstained)` ne reçoit pas le `scope`, alors que `TotalRow`
l'a déjà (`t(\`tracking.scope.${scope}\`)` à la ligne 67). Même défaut pour
`tracking.total.empty` (« Nothing to add up on this day »). **Geste** : trois
clés, ou une clé paramétrée par la portée.

### ⑥ `tracking_window.ts:233` — le doc du champ **rouvre** la porte que l'arbitrage ferme

> `/** \`maintenanceRange\` ou \`directedRange\`, déjà calculé. */`

250 lignes plus bas, `slotEstimate` explique en vingt lignes que `directedRange`
ne doit **jamais** y arriver. Le doc du champ est ce qu'un futur appelant lit en
premier. **Geste** : y écrire « l'entretien, et jamais `directedRange` — voir
`slotEstimate` ».

### Limites de preuve (pas des défauts produit, mais à connaître)

- **La sortie sous plancher côté page n'est tenue que par une présence de
  chaîne.** Mutation C5-M2b (la mienne) : `if (report.floor && false)` — le mot
  `report.floor` reste, le comportement est neutralisé → **11/11 verts**.
  Retirer le bloc entier rougit (C5-M2a). La vraie ceinture est côté serveur
  (M4 la fait rouler) et le serveur rend `weight: null` sous plancher, donc la
  courbe ne peut pas se rendre — mais le test de la page ne le prouve pas.
- **`--no-verify`** : deux commits d'A7 le disent en clair (`0390f633`,
  `c09d547a`), gate de commit cassé à la base pour toutes les lanes. Non
  imputable à A7 ; rejoué ici à la main, et les suites sont vertes.

## 10. Non prouvé — ROUGE (geste humain requis)

Deux lanes (CUISINE, MEMBRE) faisaient des runs réels sur l'arbre principal
pendant cette vérification. **Aucun appel edge, aucune migration, aucun restart
de runtime, aucune écriture en base** n'a été lancé d'ici. Les sept ROUGE du
journal du bâtisseur sont **confirmés** — je n'en lève aucun, et j'en précise
les gestes.

| # | ce qui n'a pas été vu | geste humain exact |
|---|---|---|
| R1 | **La page connectée**, 320 px et 1280 px, deux langues | **Mesuré ici sans session** : `/app/progress?lang=fr` → 302 applicatif vers `/auth?redirect=%2Fapp%2Fprogress%3Flang%3Dfr`, `document.scrollWidth = clientWidth = 320`, `<html lang="fr">`. La surface d'A7 est **derrière la garde**. Geste : jouer `docs/keel/qa-fixtures/40-tracking-a7.sql`, puis `preview_start` sur 5209 et se connecter avec `qa0903s.goal@keeltest.dev` / `1234567`. **Aucun mot de passe n'a été saisi par cette vérification.** |
| R2 | La **réponse serveur** de `keel-tracking-v1` sur une personne à objectif | La fonction est **créée après le démarrage du runtime** : elle rend 404 tant que `docker restart supabase_edge_runtime_Sophia_2` n'a pas été fait — geste **réservé à l'orchestrateur**, et à ne pas faire pendant qu'une autre lane mesure. Puis fixture ①. |
| R3 | La réponse **sous plancher TCA** | fixture ② ; le grep qui le prouve sur le JSON brut : `"kcal"` absent **et** `"weight":null`. ⚠️ Ajouter `"leftoverBoxes"` au grep — voir défaut ②. |
| R4 | La courbe sur 12 mois, six fenêtres | fixture ③ (60 pesées) |
| R5 | Le membre réclamé voit **ses** stats et pas celles du maître | compte `qa0903m` de la lane MEMBRE ; et vérifier qu'il voit bien `tracking.total.abstained` sur les jours couverts par le plan du foyer (arbitrage b) |
| R6 | « Décrire » de bout en bout | fixture ① + l'`update` que la fiche donne ; **et mesurer explicitement que le total du jour ne bouge pas d'un kcal** — c'est la non-livraison, et c'est ce qu'il faut voir pour juger le défaut ③ |
| R7 | La porte ③ (doctrine) sur un élève **sans coach** | à mesurer **en premier** : si elle rend `doctrine_no_counting`, aucun chiffre ne sortira, et ce ne sera pas un défaut de la page |

**Sur l'échec fail-closed de la page** : `StudentProgressPage.tsx:268-271` écrit
que l'échec de `loadTracking` est un **échec de page**, pas une dégradation, et
c'est le bon choix — l'ancienne garde lisait `weekly_reviews.risk_band`, colonne
sans écrivain depuis le 2026-08-08. Je ne compte donc **pas** l'échec observé
sans session comme un défaut. **Ce qu'il faudrait pour le juger** : une session
+ un runtime qui sert la fonction, puis vérifier que l'écran d'erreur ne rend
**aucun** chiffre et porte une phrase du pack (pas un jeton nu).

## 11. Hors périmètre croisés, nommés et non touchés

- `meal-energy-v1` est sur le disque et **absente de `DEPLOY.md`**
  (`[undeclared-function]`). Antérieur à A7, laissé exprès.
- `coverage-guard` reste rouge pour **deux fonctions étrangères**
  (`household-merge-notices-v1`, `keel-plan-feedback-v1`). A7 a inscrit la
  sienne, ce que le garde réclame.
- `mealPhoto.ts:33` — `DisqualifiedReason` porte 3 valeurs, la base en accepte 6
  depuis `20260818170000`. Le type du front est périmé ; rien du lot n'en
  dépend (l'agrégat lit la colonne comme nulle/non-nulle).
- `awayFrom` ×2 et `coverage-guard` ×2 : rouges de base, antériorité admise par
  le mandat.

## 12. Verdict

**Prouvé** : le périmètre du diff ; le déplacement byte-identique des quatre
lecteurs ; `tsc` 0 ; le typage des tests **sans une seule hausse par fichier** ;
2222 vitest verts avec les **4** rouges attendus ; 211 Deno verts ; `deno check`
0 ; 48 clés ajoutées à parité et sans mojibake ; les 36 retirées **sans aucun
appelant vivant**, piège du namespace inclus ; C5 côté serveur (porte
obligatoire, sortie sous plancher, base la plus faible, abstention ≠ zéro) ;
C5 au **rendu réel**, dans les deux langues ; le contrat §5.10 clause par
clause ; les trois renversements **écrits** avec leur texte d'origine et ce
qu'ils ne renversent pas ; **13 mutations** rejouées, dont l'aveu du bâtisseur
sur le test paramétré par son propre hasard — vérifié vrai, et son correctif
vérifié efficace.

**Les trois arbitrages** : (a) motif **vérifié**, écrit contre la formule,
`directedRange` absent du chemin — mais son **illustration chiffrée est
démentie par la mesure** (défaut ④) ; (b) **vérifié**, le foyer s'abstient et ne
rend pas zéro, et l'écran le dit ; (c) la non-livraison est **réelle et
inoffensive en base** (aucun kcal écrit), mais **MASQUÉE du côté de la
personne** : rien à l'écran ne lui dit que son texte n'entre pas dans le
chiffre, et la seule copie qui parlait du sujet promettait le contraire — elle
n'est pas branchée (défaut ③).

**Six défauts** : ① la seconde copie des préfixes de faits, non épinglée
(prouvée par mutation : 51/51 verts alors que le contrat est cassé) ; ② un champ
numérique traverse le plancher TCA, et le test C5 ne le voit pas ; ③ une clé
orpheline qui masque la non-livraison ; ④ un motif d'arbitrage dont le chiffre
est faux d'un facteur 2 à 2,6 ; ⑤ la phrase d'abstention qui dit « ce jour » sur
la semaine et le plan ; ⑥ un doc de champ qui rouvre la porte de l'arbitrage (a).

Aucun de ces six n'est « session requise » ni « run réel ».

# ROUGE
