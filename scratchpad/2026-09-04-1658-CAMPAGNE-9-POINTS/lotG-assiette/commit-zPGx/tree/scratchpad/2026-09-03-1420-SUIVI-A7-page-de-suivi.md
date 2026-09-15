# SUIVI · A7 — la page de suivi

Lane **SUIVI**, worktree `/Users/ahmedamara/Dev/Sophia-2-chantiers/SUIVI`, branche
`chantier-0903/SUIVI`, base `31ee930f`. Journal écrit au fil de l'eau (§2.25).

> Le gate de commit est **cassé à la base, pour tout le monde** :
> `deno test --no-run _shared/keel/` compte 18 erreurs TS dans dix fichiers de test à
> `bfecdc28`. Tous les commits de cette lane partent en `--no-verify`, avec ce motif
> écrit dans le message, et la lane lance elle-même `tsc -b --force`, `vitest run`
> et ses tests Deno ciblés.

---

## 0. Ce que la lane a mesuré avant d'écrire

### 0.1 Les clés `progress.*` — comptées clé par clé, appelant par appelant

Le mandat dit « 32 clés ». **Mesuré : 36** dans `en.ts`, et **aucune** n'a d'appelant
vivant hors `pages/ProgressPage.tsx` :

```
grep -o '"progress\.[a-z_0-9.]*"' frontend/src/keel/i18n/en.ts | sort -u   → 36
```

Pour chacune des 36, recherche du littéral `"progress.<clé>"` dans tout `frontend/src`
en excluant `en.ts`, `fr.ts`, `catalog.ts` et `ProgressPage.tsx` : **0 fichier**.

Les seuls résultats en recherche *par sous-chaîne* sont
`student_progress.error`, `student_progress.loading`, `student_progress.title`
(`ActivitySessionsCard.tsx:183,189`, `StudentProgressPage.tsx:441-472`) — un préfixe
différent, vérifié ligne par ligne. C'est exactement le piège « `meals.loading` avait
deux appelants vivants » retourné : ici il n'y en a aucun.

Répartition :

- **29** sont lues par `ProgressPage.tsx` (`grep -o` sur le fichier) ;
- **7** ne sont lues nulle part, pas même par lui :
  `progress.adherence_core`, `progress.adherence_overall`, `progress.adherence_title`,
  `progress.empty`, `progress.insufficient_data`, `progress.insufficient_data_gate`,
  `progress.insufficient_data_review`.

Aucune construction dynamique (`` `progress.${…}` ``) dans le dépôt.
`progress` n'est **pas** un namespace de `catalog.ts` (il en a été retiré ; seul
`student_progress` y est).

⇒ **les 36 partent avec la page**, pas 32. Écrit ici pour que le décompte du rapport
ne se lise pas comme une divergence silencieuse.

### 0.2 Le point de départ de l'écran

- `/app/progress` = `frontend/src/keel/pages/StudentProgressPage.tsx` (957 l.),
  monté dans `App.tsx:229-237` sous `KeelStudentRoute` + `KeelOnboardingGate`.
- La garde TCA **morte** est bien là : `StudentProgressPage.tsx` lit
  `weekly_reviews.risk_band` (`select("risk_band, week_start_date")`) et bascule en
  `state.kind === "restricted"` — colonne sans écrivain depuis le 2026-08-08.
- Nav : `KeelAppShell.tsx:118` (`/app/progress` → `app.nav.progress`) et `:124`
  (`/app/health` → `app.nav.health`).
- `frontend/src/keel/pages/ProgressPage.tsx` (393 l.) n'est importé par **aucun**
  fichier du dépôt (vérifié).

### 0.3 Un fait de poste utile

`frontend/src/**` **importe déjà** des modules de `supabase/functions/_shared/keel/`
(`MouthFormDialog.tsx:47`, `HouseholdTraditionsCard.tsx:15`). Le module pur de
l'agrégat vit donc **une seule fois**, côté serveur, et les deux lecteurs (la fonction
edge et la page) partagent ses types — pas de type recopié.

---

## 1. Commits

| sha | lot |
|---|---|
| `0f0f655a` | l'écran de progression mort quitte le dépôt (`ProgressPage.tsx`, 393 l.) |
| `de35fadf` | **i18n chantier-0903/SUIVI (A7)** — 36 retraits, 3 valeurs changées |
| `7d0c336b` | la garde du retrait (`trackingPage.int.test.ts`) + ce journal |
| `e39109cb` | **fusion de A8.0** (`31148a5a`) — voir §9 |
| `5b89cefd` | l'agrégat du suivi, module pur + 24 tests Deno |
| `89667119` | **i18n chantier-0903/SUIVI (A7)** — 47 clés, + `tracking` au catalogue |
| `fd47c04c` | la page : bloc permanent, objectif jour par jour, courbe, « Décrire » |
| `f315068c` | **i18n** — `tracking.total.abstained` (48e clé) |
| `0390f633` | `keel-tracking-v1` + `_io` + `tracking_describe_io` + `plan_energy_read` |
| `c09d547a` | les trois renversements écrits |
| _(à venir)_ | la fixture QA `40-tracking-a7.sql` + ce journal |

Tous en `--no-verify`, motif écrit dans chaque message : le gate de commit est
cassé à la base pour toutes les lanes (18 erreurs TS dans dix fichiers de test
`_shared/keel/` à `bfecdc28`, aucun touché ici).

## 2. Suites

- `cd frontend && npx tsc -b --force` → **0**, à chaque étape.
- `npx vitest run` → base : 2047 passés / 5 rouges ; à la fin :
  **2065 passés / 5 rouges**, les mêmes cinq (+18 tests de cette lane).
- `npm run build` (vite) → **✓ 2 091 modules**. Prouve accessoirement que le
  front ne tire PAS le graphe serveur dans son bundle (le miroir de types de
  `api/tracking.ts` est justifié par ça).
- `deno test` sur les modules de ce lot → **37 passés / 0** (29 + 8) ;
  **143 / 0** en ajoutant les voisins (`pulse_audience`, `member_plan_scope`,
  `household_plan_kind_readers`, `energy_gate`, `energy_target`,
  `body_measure_series`, `mouth_anchor`).
- `deno check` → **0** sur `keel-tracking-v1/index.ts`, `tracking_window.ts`,
  `tracking_window_io.ts`, `tracking_describe_io.ts`, `plan_energy_read.ts`,
  `meal-energy-v1/index.ts`, `mouth_anchor.ts`.
- `node scripts/ci/deploy-manifest-check.mjs` → **54 griefs avant, 54 après**
  (base mesurée sur un worktree détaché à `31ee930f`), et **aucun** ne nomme
  `keel-tracking-v1`.
- `node scripts/ci/i18n-lint.mjs` → **83 violations avant comme après**
  (mesurées sur un worktree détaché à `31ee930f`), aucune ne nomme un fichier
  de cette lane. Rouge étranger, antériorité prouvée.

## 3. Mutations

| # | commande | rouge vu | restauration |
|---|---|---|---|
| i18n-1 | réintroduire `"progress.title"` dans `en.ts` | `trackingPage` : « les 36 clés ont quitté les DEUX packs » | `cp` + `cmp` OK |
| i18n-2 | `"app.nav.progress": "Progression"` dans `fr.ts` | `trackingPage` : les libellés | `cp` + `cmp` OK |
| M1 | `weakestBasis` : `rank > ` → `rank < ` | 4 rouges Deno | `cp` + `cmp` OK |
| M2 | retirer le `throw` sur `gate` absent | 1 rouge Deno | `cp` + `cmp` OK |
| M3 | `slotDayShare` rend `weight` au lieu de `weight / total` | 2 rouges Deno | `cp` + `cmp` OK |
| M4 | `if (floor)` → `if (false)` | 1 rouge Deno | `cp` + `cmp` OK |
| M5 | remettre un `.from("weekly_reviews")` dans la page | `trackingPage` : « la page ne lit plus `risk_band` » | `cp` + `cmp` OK |
| M6 | renommer `tracking.total.assumed` dans `fr.ts` | `trackingPage` : « les cinq bases portent un total » | `cp` + `cmp` OK |
| M7 | une lecture de plans AVANT `loadEnergyGate` | 2 rouges Deno (ordre + sortie sous plancher) | `cp` + `cmp` OK |
| M8 | la requête des faits perd son `.eq("user_id")` | 1 rouge Deno | `cp` + `cmp` OK |
| M9 | le plan du foyer perd son `.eq("household_id")` | 2 rouges Deno | `cp` + `cmp` OK |
| M10 | **l'écrivain de MEMBRE** renomme `shifts` → `plan_shifts` (`accident_io.ts`) | 1 rouge Deno : le test de câblage, pas un zéro | `cp` + `cmp` OK |
| M11 | **l'écrivain de MEMBRE** retire `moved_dish_indexes` de `PlanShiftTrace` | rouge de **compilation**, qui NOMME le champ, dans mon propre fichier de test | `cp` + `cmp` OK |
| M12 | `MEAL_TICK_PREFIX` renommé **à sa source** (`meal_tick.ts:62`) | **8 rouges** Deno (c'était 0 avant ① : 51/51 verts pendant que `plansDone` tombait à 0) | `cp` + `cmp` OK |
| M13 | `ACCIDENT_OFF_PLAN_PREFIX` renommé **à sa source** (`accident_io.ts:645`) | 2 rouges Deno | `cp` + `cmp` OK |
| M14 | une clé `tracking.*` orpheline ajoutée aux deux packs | 1 rouge : « chaque clé a un appelant vivant » | `cp` + `cmp` OK |
| M15 | la phrase d'abstention renomme une portée (« sur ce jour ») | 1 rouge : « ne nomme AUCUNE portée » | `cp` + `cmp` OK |
| M16 | l'accusé de « Décrire » cesse d'être rendu | 1 rouge : « l'accusé est rendu » | `cp` + `cmp` OK |

> ⚠️ M3 n'a d'abord mordu qu'UN test : le jeu de fixture
> (`breakfast + lunch + dinner`) pèse exactement 1,00, donc la normalisation y
> est l'identité — un test paramétré par son propre hasard. Un second cas
> (`lunch + dinner`, poids 0,75) a été ajouté avant de rejouer la mutation.

## 4. i18n

**Retraits** (36 clés `progress.*`, `en.ts` seul — elles n'ont jamais été
traduites, `fr.ts` n'en portait aucune) : la liste exacte est dans le message
de `de35fadf` et dans `REMOVED_KEYS` de `trackingPage.int.test.ts`.

**Valeurs changées** (D7.1, les deux packs) :

| clé | avant (en / fr) | après |
|---|---|---|
| `app.nav.progress` | Progress / Progression | **Tracking / Suivi** |
| `app.nav.health` | Health / Santé | **Safety / Sécurité** |
| `health.title` | What you cannot eat / Ce que tu ne peux pas manger | **Safety / Sécurité** |

**Ajouts** (48 clés, bloc délimité `// ── chantier-0903/SUIVI — début/fin ──`
en fin des DEUX packs, après celui de RAPIDE) :

- `tracking.permanent.*` (10) · `tracking.objective.label` ·
  `tracking.scope.{day,week,plan}` · `tracking.total.*` (7, dont les **cinq
  nommées par leur base** + `empty` + `abstained`) ·
  `tracking.day.*` (3) · `tracking.dish.*` (4) ·
  `tracking.energy.slot_estimate` · `tracking.missed.no_estimate` ·
  `tracking.describe` · `tracking.weight.*` (9) · `tracking.describe.*` (8).
- `catalog.ts` : `tracking` entre dans `TRANSLATED_NAMESPACES` et dans
  `/app/progress` ; **six atomes** entrent avec lui (`slot`, `common`, `when`,
  `amount`, `sentence`, `question`) parce que `TrackingCards.tsx` nomme un
  créneau par `slotLabel()` au lieu de recopier les six occasions — c'est
  `pageSeams` qui l'a dit, pas une relecture.
- `energyBasis.int.test.ts` : **six** clés du suivi entrent dans l'inventaire
  CLOS `ENERGY_KEYS_WITH_A_BASIS` (`tracking.total.{plan_quantities,
  declared_quantities, photo_estimate, slot_estimate, assumed}` +
  `tracking.energy.slot_estimate`). `tracking.total.abstained` n'y entre PAS :
  elle n'écrit aucun chiffre, donc elle n'a pas de base à porter.

⚠️ `energyBasis.int.test.ts` porte un **inventaire CLOS**
(`ENERGY_KEYS_WITH_A_BASIS`) de toutes les clés des deux packs qui écrivent un
kcal. Toute clé neuve du suivi qui porte un chiffre devra y être inscrite AVEC
sa base — c'est le point d'extension prévu, pas un rouge à contourner.

## 5. Renversements écrits

| # | fichier | ce qui est renversé | ce qui NE l'est PAS |
|---|---|---|---|
| **R2** | `docs/fonctionnalites/suivi-quotidien/FF-031-*.md` §3 (bloc « Hors périmètre ») et §6 **R12** | « ❌ Aucune nouvelle surface d'affichage. Pas de graphe quotidien. » ⇒ une **courbe** de poids, six fenêtres | « pas de moyenne mobile » **reste vrai** (un test relit la source de `weightCurve.ts`) ; `weight_readout` reste suspendu sous ceinture — et la suspension est passée du composant au SERVEUR (`weight: null` avant toute lecture de pesée) ; ni IMC, ni cible dérivée, ni grandeur neuve |
| **R3** | `frontend/src/keel/api/mealPhoto.ts` (l'ancien bloc `:92-96`, devenu `:95-126`) | « ⛔ ET IL NE SE SOMME PAS » ⇒ il se somme, **sous deux conditions structurelles** : le total porte la base la plus FAIBLE de ses parts, et cette base est DANS la clé i18n | les chiffres (−26,6 %, ×1,04 en cumul, deltas 2,5× pires) restent vrais ; un `number` nu reste interdit ; une **courbe** d'énergie reste interdite ; aucun total ne se stocke |
| **D7.8** | `supabase/functions/_shared/keel/mouth_anchor.ts`, en-tête de `SLOT_DAY_WEIGHT` | extension de sens : la table servait à **dimensionner**, elle sert aussi à **reconstituer** | « ce n'est pas une recommandation nutritionnelle » vaut mot pour mot dans les deux sens ; et ⛔ on ne « normalise » PAS la table (ça casserait `dayCoverageOf`) — c'est le LECTEUR qui divise par la somme des poids déclarés |

Le texte d'origine est **cité** dans chacun des trois, pour qu'on lise ce qui a
changé sans aller chercher dans git.

## 6. Rouges étrangers (base `31ee930f`, non touchés)

- vitest `src/edge/coverage-guard.int.test.ts` ×2
- vitest `src/keel/api/household.int.test.ts` › `awayFrom` ×2
- vitest `src/keel/components/mealBoxes.int.test.ts` › « un contenant sans bouche… »
- `scripts/ci/i18n-lint.mjs` : 83 violations (SetupPage, onboarding, Household*,
  MouthFormDialog…), identiques à `31ee930f`.

## 7. ROUGE — ce qui n'a PAS été vu en run réel ou au navigateur

**Rien de ce lot n'a été vu tourner.** Aucune fenêtre de run réel n'a été
ouverte pour cette lane (son tour est le dernier), et `keel-tracking-v1`
n'existe pour le runtime edge qu'après fusion **et** relance — une fonction
créée après le démarrage rend 404.

Ce qui est **prouvé** (tests) :

- l'agrégat pur : 29 tests Deno, dont la porte obligatoire, la sortie sous
  plancher sans un seul champ numérique, la base la plus faible, la
  normalisation des parts de créneau, l'abstention, et une **propriété** qui
  descend le rapport entier pour vérifier qu'aucun kcal n'y voyage sans base ;
- l'assemblage : 8 tests, dont l'ordre des lectures, le filtre de propriétaire
  sur chaque requête, le couple de garde du plan de foyer, et les refus de
  fenêtre qui ne touchent pas la base (le faux client EXPLOSE s'il est
  sollicité) ;
- le front : 11 tests de la page + 11 de la courbe ; `npm run build` passe
  (2 091 modules) — ce qui prouve accessoirement que le front ne tire PAS le
  graphe serveur dans son bundle.

Ce qui est **ROUGE** :

| # | Ce qui n'a pas été vu | Geste humain exact |
|---|---|---|
| 1 | La page à l'écran, à 320 px et 1280 px, dans les deux langues | fusionner A7, `docker restart supabase_edge_runtime_Sophia_2`, puis `TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh`, `preview_start({name: "frontend-suivi"})` (port 5208), se connecter avec `qa0903s.goal@keeltest.dev` |
| 2 | La réponse de `keel-tracking-v1` sur une personne à objectif | jouer la fixture ① ci-dessous, puis un tour réel |
| 3 | La réponse **sous plancher TCA** (ni kcal ni courbe) | fixture ② ; le grep qui le prouve sur le JSON brut : `"kcal"` absent et `"weight":null` |
| 4 | La courbe sur 12 mois, six fenêtres | fixture ③ |
| 5 | Le membre réclamé qui voit SES stats et pas celles du maître | compte `qa0903m` de la lane MEMBRE |
| 6 | Le chemin « Décrire » de bout en bout | fixture ①, décocher un plat, cliquer « Décrire » |
| 7 | La porte ③ (doctrine) sur un élève **sans coach** | c'est la PREMIÈRE chose à mesurer : si elle rend `doctrine_no_counting`, aucun chiffre ne sortira, et ce ne sera pas un défaut de la page |

### Les trois fixtures, prêtes à jouer

`docs/keel/qa-fixtures/40-tracking-a7.sql`, tag `qa0903s`, mot de passe
`1234567`, colonnes de jeton `''`, patron de `00-base.sql`, transaction unique
avec neutralisation de l'envoi de mail. **Elle n'a pas été jouée** — le premier
qui la lance lit le rapport de chaque `insert` avant d'en conclure quoi que ce
soit.

```
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
  < docs/keel/qa-fixtures/40-tracking-a7.sql
```

1. **`qa0903s.goal`** — objectif `fat_loss`, plan de 3 jours à quantités
   structurées, une coche (`plan_quantities`), une photo (`photo_estimate`),
   une photo corrigée (`declared_quantities`), un plat silencieux (`assumed`).
   ⇒ trois bases distinctes sur le même jour, total à la plus faible.
   La note du fichier donne l'`update` d'une ligne qui fait apparaître le
   créneau loupé, son repère `slot_estimate` et le bouton « Décrire ».
2. **`qa0903s.floor`** — série `student_body_measures` à **−1,5 %/semaine sur
   14 jours**. ⇒ la réponse ne doit porter ni kcal ni série de poids.
3. **`qa0903s.curve`** — **60 pesées sur 12 mois**, une tous les six jours, avec
   du bruit. ⇒ la courbe sur les six fenêtres.

## 8. Hors-périmètre croisés

- `meal-energy-v1` est **sur le disque et absent de `docs/keel/DEPLOY.md`** :
  `deploy-manifest-check.mjs` le compte en `undeclared-function`. Ce n'est pas
  cette lane qui l'a mis là ; l'orchestrateur a confirmé par écrit qu'il ne faut
  **pas** l'inscrire en passant — l'inscrire reviendrait à déclarer déployable
  quelque chose qu'on n'a pas éprouvé. Nommé, non touché.
- `coverage-guard.int.test.ts` liste deux fonctions étrangères manquantes,
  `household-merge-notices-v1` et `keel-plan-feedback-v1`. Cette lane a ajouté
  **la sienne** à la liste (le geste que ce garde réclame) et n'a pas touché aux
  deux autres : le test reste rouge, pour un motif qu'elle n'a pas créé.
- `frontend/src/keel/api/mealPhoto.ts:33` — `DisqualifiedReason` porte **trois**
  valeurs (`not_food`, `food_not_eaten`, `unreadable`) alors que la base en
  accepte **six** depuis `20260818170000` (`ordered`, `no_time`, `ate_other`).
  Le type du front est périmé. Rien de ce lot n'en dépend (l'agrégat lit la
  colonne comme « non nulle ou nulle », jamais sa valeur), donc on ne le répare
  pas en passant — on le nomme.
- `student_generated_meals.dishes` n'a **aucun CHECK** sur son contenu : le
  parseur TypeScript est la seule frontière. C'est une observation, pas une
  demande de migration.

## 8bis. Ce que cette lane a décidé CONTRE son mandat, et pourquoi

Trois arbitrages s'écartent de la lettre de §5.11. Ils sont écrits ici pour
qu'ils ne se lisent pas comme des oublis.

1. **L'estimation d'un créneau emploie `maintenanceRange`, jamais
   `directedRange`.** Le mandat proposait « ou `directedRange` si direction ».
   Estimer ce qu'on a mangé à partir de sa CIBLE est circulaire : le repas
   manquant reviendrait pile au niveau du déficit, et le total montrerait à la
   personne qu'elle a tenu son objectif — parce qu'on l'aurait supposé. Sur un
   déficit de 500 kcal et deux repas manquants, l'écart est de l'ordre du tiers
   de la journée, toujours dans le sens flatteur. La base `slot_estimate` dit
   déjà que c'est une convention ; elle ne doit pas en plus être une convention
   qui donne raison. Écrit dans `tracking_window_io.ts`.
2. **Le plan de FOYER s'abstient sur l'énergie.** Reconstituer la part d'un
   lecteur dans une casserole partagée demande `member_deltas` et l'arbitrage
   de présence que `meal-energy-v1` porte avec son `viewerMemberId` ; le refaire
   ici en aurait fait une seconde implémentation, et celle-ci se trompe TOUJOURS
   vers le bas. C'est le comportement que `meal-energy-v1` choisit lui-même
   quand la trace lui manque (`HOUSEHOLD_ABSTENTION`). Conséquence assumée : un
   membre réclamé voit son bloc permanent, son jour par jour et sa courbe, mais
   pas de total d'énergie sur les jours couverts par le plan du foyer — et
   l'écran le DIT (`tracking.total.abstained`), il ne rend pas une case vide.
3. **« Décrire » n'écrit aucun kcal dans ce lot.** ⚠️ **L'orchestrateur a
   requalifié ce point : ce n'est PAS un arbitrage, c'est une NON-LIVRAISON**,
   et elle est portée au rapport final du chantier comme trou connu. La raison
   technique reste bonne (voir plus bas) ; ce qui suit est ce que ça coûte **du
   côté de la personne**, qui est le seul côté qui compte pour juger un trou.

   ### Ce que « Décrire » NE fait PAS aujourd'hui, dit à la personne

   Elle voit un créneau marqué « Rien de noté », avec un repère chiffré
   (« environ 850 kcal — une valeur de remplacement, et tu peux la changer dans
   la journée ») et un bouton « Décrire ». Elle clique, elle écrit « une salade
   de riz au thon, à peu près 200 g de riz », elle valide.

   **Ce qui se passe :** le repas cesse d'être « rien de noté », ses mots sont
   enregistrés, le bouton disparaît.

   **Ce qui NE se passe PAS, et qu'elle a toutes les raisons d'attendre :**
   le chiffre du jour **ne bouge pas d'un kcal**. Les 200 g de riz qu'elle a
   pris la peine d'écrire ne comptent nulle part. Le repère de répartition
   reste exactement ce qu'il était avant qu'elle écrive — c'est-à-dire une
   moyenne, pas son repas. La promesse implicite du bouton (« dis-moi ce que
   tu as mangé et je le compterai ») n'est tenue qu'à moitié : on prend la
   déclaration, on ne prend pas la mesure.

   **Le seul endroit où ça se voit à l'écran** est que la phrase du total
   continue de dire `slot_estimate` (« un repas ou plus n'a jamais été
   renseigné et tient sa place par une moyenne ») alors qu'elle vient
   justement de le renseigner. C'est cohérent avec le calcul et **incohérent
   avec son geste**. Aucune copie ne prétend le contraire, mais aucune ne
   l'explique non plus : c'est le trou, et il est là.

   **Ce que ça ne fait pas, et c'est ce qui rend le trou acceptable en
   attendant :** ça ne fabrique aucun chiffre faux, ça ne fait baisser aucun
   total, et ça n'écrit rien qu'il faudrait défaire. La déclaration est un fait
   vrai, gardé ; il lui manque son chiffre, pas sa véracité.

   **Ce qu'il faut pour le refermer :** le chemin TEXTE de
   `analyze-meal-photo-v1` (le modèle lit la description, rend des composants et
   une estimation), puis `quantity_from_prose` sur les quantités que la
   personne a écrites — ce qui fait passer la base de `photo_estimate` à
   `declared_quantities`. Un lot à part, qui ne se prouve pas sans run réel.

   ### La raison technique de ne pas l'avoir inventé ici Le mandat prévoit
   `declared_quantities` « si la personne a écrit des quantités ». Le dépôt n'a
   pas de fonction qui trouve une quantité DANS une phrase :
   `readQuantityFromProse` lit une chaîne ANCRÉE des deux bouts (`^\s*150 g\s*$`),
   pas un texte libre. Produire le chiffre demande donc le chemin modèle de
   `analyze-meal-photo-v1`, qui ne se prouve pas sans run réel. Ce lot écrit
   donc le FAIT (les mots de la personne, le groupe alimentaire reconnu par le
   plancher déterministe du dépôt), et le repère `slot_estimate` tient sa place.
   ⛔ Et le repère SURVIT à la déclaration, exprès : s'il disparaissait, décrire
   son repas ferait BAISSER le total du jour, et le produit apprendrait à ses
   utilisateurs à se taire. Un test le verrouille.

## 8ter. Le contrat `generated_from.shifts[]`, rendu bruyant

L'orchestrateur a demandé de relire ce lecteur contre le test de forme de
MEMBRE (`member_cascade_and_shift_trace_test.ts`), pour que le compte tombe à
zéro **bruyamment**. Il tombait en silence : `Array.isArray(gf.shifts) ?
gf.shifts.length : 0`, et zéro est une valeur parfaitement plausible sur
« plans modifiés ».

`countShiftTraces` (`tracking_window_io.ts`) le remplace, et la rupture se voit
maintenant par **trois** chemins, parce qu'aucun ne suffit seul :

1. **L'absence de la clé ne peut PAS être bruyante, et c'est écrit.** Un plan
   qui n'a jamais glissé n'a légitimement pas de `shifts` : c'est le cas
   nominal, il est majoritaire, et le journaliser noierait le signal. Un test
   vérifie que ce cas reste **muet**.
2. **Un test de câblage qui passe par le VRAI écrivain.** Il importe
   `withShiftTrace` de `accident_io.ts` — aucune fixture recopiée, parce qu'un
   compteur qui épingle une *copie* de son arbitre le fige dans le temps et
   finit par prouver le mensonge d'hier. Mutation **M10** : renommer la clé chez
   MEMBRE ⇒ 1 rouge nommé, pas un zéro.
3. **Les cinq champs, comparés à la source de l'écrivain.** Le test relit
   l'interface `PlanShiftTrace` dans `accident_io.ts` et la confronte à
   `PLAN_SHIFT_TRACE_FIELDS`. Mutation **M11** : retirer `moved_dish_indexes`
   ⇒ rouge de **compilation**, qui nomme le champ, dans mon propre fichier de
   test.

Et une entrée mal formée dans un tableau présent est comptée zéro **et**
journalisée (`keel.tracking.shift_trace_shape_changed`, avec le compte et les
champs attendus) : c'est le seul cas où la donnée existe, est illisible, et où
le silence coûterait plus cher que le bruit.

## 8quater. Les six défauts du vérificateur, et ce qu'ils m'apprennent

Rapport : `scratchpad/2026-09-04-0010-SUIVI-A7-verification.md`. Les six sont
corrigés dans le worktree. Deux d'entre eux me corrigent sur le fond.

| # | Défaut | Correction | Garde neuve |
|---|---|---|---|
| ① | `MEAL_TICK_PREFIX` et `ACCIDENT_OFF_PLAN_PREFIX` **recopiés** en littéraux | importés de `meal_tick.ts:62` et `accident_io.ts:645` | 3 tests qui passent par les **vrais constructeurs** (`mealTickKey`, `accidentOffPlanKey`) ; M12/M13 |
| ② | `leftoverBoxes` **traversait** la sortie sous plancher | `{ known: false }` en dur dans la branche `floor` | le test sérialise le rapport et refuse **le moindre nombre** |
| ③ | `tracking.describe.done` **orpheline** et disant l'inverse du produit | réécrite **et rendue** | « chaque clé `tracking.*` a un appelant vivant » ; M14/M16 |
| ④ | « de l'ordre du tiers de la journée » — **faux** | `écart = déficit × part manquante` ⇒ **300–400 kcal, 12,6–16,8 %** | recalculé à la main avant d'être écrit |
| ⑤ | « Pas de total **sur ce jour** » sous « Ces sept jours » | la phrase ne nomme plus aucune portée | « la phrase d'abstention ne nomme AUCUNE portée » ; M15 |
| ⑥ | le doc du champ `target` **rouvrait** `directedRange` | réécrit, et renvoie à `slotEstimate` | — |

### Ce que ① m'apprend, et c'est le plus dur à avaler

J'ai **fermé ce mode de défaillance moi-même**, pour `generated_from.shifts[]`,
en important le vrai écrivain — et j'ai écrit un pavé de vingt lignes pour
expliquer pourquoi un lecteur qui recopie son contrat tombe à zéro en silence.
Puis j'ai laissé **deux autres contrats** ouverts dans le même fichier, à
soixante lignes de là. La mesure du vérificateur est sans appel : renommer le
préfixe à sa source laissait **51/51 de mes tests verts** pendant que
`plansDone` tombait à 0.

La leçon n'est pas « importer ses constantes ». C'est qu'**une leçon apprise sur
un cas ne se propage pas toute seule aux cas voisins** : il faut chercher les
voisins explicitement. J'avais l'outil, le motif écrit, et l'exemple sous les
yeux, et je ne les ai pas cherchés.

### Ce que ③ m'apprend

Mon journal disait « aucune copie ne prétend le contraire ». C'était **vrai par
accident** : la phrase qui prétendait le contraire existait bel et bien dans les
deux packs — elle n'était simplement pas rendue. Une non-livraison **masquée par
un hasard** se lit exactement comme une non-livraison **nommée**, jusqu'au jour
où le hasard change. La garde « chaque clé a un appelant vivant » ferme la
famille entière, pas ce cas.

### Ce que ④ m'apprend

Un bon arbitrage adossé à un faux chiffre se fait renverser par le premier qui
mesure. J'avais raison sur le fond (estimer depuis la cible est circulaire quelle
que soit l'amplitude) et faux d'un **facteur 2,0 à 2,6** sur l'amplitude, dans un
commentaire écrit pour convaincre. Le chiffre est maintenant une **loi exacte**
qu'on rejoue en une ligne, pas un ordre de grandeur : `écart = déficit × part
manquante`.

## 9. La fusion de A8.0

`git merge 31148a5a` dans le worktree → commit de fusion **`e39109cb`**,
**aucun conflit** (les deux lanes ne partagent aucun fichier : A8.0 touche
`App.tsx`, `KeelHouseholdRoute.tsx`, `routeGuards.int.test.ts`, quatre modules
`_shared/keel/` et `keel-daily-pulse-v1` ; A7 avait touché les packs i18n et
`pages/`).

Relancé après fusion : `tsc -b --force` → 0 ; `vitest run` → 2053 passés,
5 rouges (les cinq étrangers de la base, inchangés).

### Seconde fusion — `45ec7868` (correctif A8.0 + A8.1 + A8.2)

`git merge 45ec7868` → **deux conflits**, tous deux dans les packs i18n
(`en.ts`, `fr.ts`), et tous deux de la même nature : les deux côtés ont ajouté
leur bloc délimité **au même endroit**, la fin du pack. Résolus en gardant les
**deux** moitiés, la mienne **en dernier** — c'est l'ordre que §5.12 donne
(RAPIDE, FOYER, CUISINE, MEMBRE, SUIVI). Aucune ligne de logique d'une autre
lane n'a été réécrite ; vérifié après coup : les quatre blocs délimités sont
présents dans les deux packs, et mes 48 clés `tracking.*` y sont toujours.

Ce que la fusion rend réel pour A7 :

- `/app/progress` est **déjà** sous `KeelHouseholdRoute` (`App.tsx`) — A7 pose
  sa page derrière cette garde et ne touche ni `routeGuards.int.test.ts`, ni
  `KeelHouseholdRoute.tsx`, ni la garde dans `App.tsx`.
- `resolvePlanScope` (`planned_dish_io.ts:103`) donne la forme exacte de la
  portée d'un membre : `{ kind: "own" }` ou
  `{ kind: "household_member", householdId }`. L'`_io` du suivi la reprend, en
  ajoutant **toujours** `.eq("user_id", me)`.
- `generated_from.shifts[]` existe : `withShiftTrace` /
  `PlanShiftTrace { cook_on, delta, new_cook_on, moved_dish_indexes, applied_on }`
  (`accident_io.ts:96-114`). C'est la source de « plans modifiés » (D7.3), et
  l'agrégat la lit par son **compte**.
