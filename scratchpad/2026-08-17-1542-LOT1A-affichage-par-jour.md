# Rapport LOT 1A — l'affichage du plan par jour (P1)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 15:42 · **Aucun `push`, aucun merge.**
**Master prompt** `scratchpad/2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md`, §LOT 1 / agent 1A.

| Livrable | État | En une ligne |
|---|---|---|
| `PlanDayBlock.tsx` (extraction) | ✅ livré | Le bloc jour sort de `PlanResult`, à comportement identique, pour être rendu deux fois par le même parent. |
| Navigation par jour | ✅ livré | Rail segmenté + `<th>` de `PlanGrid` cliquables, un seul état (`selectedDay`), aperçu en semaine / validé en jour. |
| Enrichissement du jour | ✅ livré | Chaque jour porte SA session de cuisine, SA vague de courses (jointure par date via `windowDates`) et le motif de ses moments vides. |
| `DishListByDay.tsx` (les deux listes plates) | ✅ livré | `OnePerson`, `HouseholdPlanCard` et `MyShareCard` rendent la même liste par jour, sans rien gagner d'autre. |
| Vérification navigateur | ⛔ non faite ici | Appartient à l'agent 1B, par consigne du master prompt. |

**Quatre commits** : `32cc10f4`, `5929c63b`, `c1fec3c4`, `6a4563cf`.
`git add -A` n'a **jamais** été utilisé ; chaque commit liste ses chemins ;
`agent-gate` a tourné et passé sur chacun (suite Deno + eslint).
**Aucun fichier `supabase/` ni `_shared/` modifié** — prouvé :
`git diff --name-only 22b16bce..HEAD | grep -c supabase/` → **0**.

---

## 1. Ce qui a été fait, commit par commit

### `32cc10f4` — l'extraction (zéro changement de comportement)

`PlanResult.tsx:154-228` (l'en-tête de jour, le marqueur « aujourd'hui » par la
forme, la somme d'énergie du jour, les `DishCard` avec `sources` et
`sessionForDish`) devient `plan/PlanDayBlock.tsx`. `PlanResult` le monte dans la
même boucle `groups.map`. Le test `lib/dishSession.int.test.ts:189` a **suivi le
code** (pas contourné) : il exige maintenant le littéral `sessionForDish(dish,
props.cookingSessions, props.preparations)` dans `PlanDayBlock.tsx` **et**
`cookingSessions={props.cookingSessions}` dans `PlanResult.tsx` — la prop qui a
déjà été morte une fois ne peut le redevenir sans rouge.

### `5929c63b` — la navigation

- `lib/planDayView.ts` : `defaultSelectedDay` / `effectiveSelectedDay` (purs).
  Défaut vue jour = le jeton dont `windowDates[jeton] === today`, sinon le
  **premier jour du plan** — jamais le calendrier. La preview passe déjà
  `today={draft.startsOn}` : le défaut tombe sur le premier jour du brouillon
  sans code dédié (testé tel quel).
- `PlanResult` : état `selectedDay: "all" | jeton`, rendu via
  `effectiveSelectedDay` (une sélection périmée après un changement d'onglet
  courant/suivant retombe sur le défaut, jamais sur du vide). Rail segmenté
  (patron `PlanByPerson.tsx:140-158`, `aria-pressed`, pas de primitive `Tabs`),
  dans un `overflow-x-auto` — il défile dans son conteneur à 320 px.
  « Aujourd'hui » marqué par la forme (encre pleine + graisse), pas de couleur.
- `PlanGrid` : prop **optionnelle** `onSelectDay` ; le contenu du `<th>` devient
  un bouton (`min-h-6` = plancher tactile 24 px) — la grille est le sélecteur
  naturel, branchée sur **le même** état que le rail.
- `PlanResult.defaultView?: "week" | "day"` (défaut `"day"`).
  `PlanDraftDialog` passe `defaultView="week"` : l'aperçu se juge en entier
  avant adoption ; le validé ouvre sur le jour.
- Vue jour : `[groupe sans jour (si présent), le jour choisi]` — le groupe
  `day: null` n'est **jamais** perdu, et le jour choisi se rend **même sans
  plat** (il peut porter session, courses, moments).

### `c1fec3c4` — l'enrichissement du bloc jour

- **Session du jour** : `cookingSessions.filter(s => s.day === group.day)` —
  jeton contre jeton, aucune conversion. Carte compacte en tête du jour :
  « Session de cuisine · about {n} min » + titres des préparations (ids
  inconnus écartés, patron `sessionForDish`), dépliable vers le `run_through`
  (patron `aria-expanded` + texte souligné de `CookingSessions.tsx:174-191`).
  La modale « tes sessions de cuisine » **reste** — le bloc en est la
  déclinaison au jour.
- **Vague de courses du jour** : `PlanResult` calcule
  `waveAssignments(...)` via `api/groceryWaves` (**pur réexport serveur —
  aucune règle recodée**, et un test l'interdit : ni `MAX_FRIDGE_DAYS` ni
  `PERISHABLE` dans les fichiers du lot). Jointure par **date** :
  `waveForDate(waves, dayDates[group.day])` — le seul pont jeton→date est
  `windowDates`. Carte « Les courses du jour — {n} articles », dépliable vers
  la liste de la vague par rayons (`groupByAisle` sur les **index** d'origine,
  même découpe que `ShoppingListPanel.tsx:264-300`). **Aucune case à cocher**
  ici : les ratures vivent dans la fenêtre de courses, un second jeu
  divergerait (décision, voir §5).
- **Motif des moments vides** : `dayMoments(grid, day)` lit **la grille déjà
  construite** (`buildPlanGrid` — la source unique des quatre silences), et le
  bloc rend les moments sans plat : absence / apport fixe (son libellé) /
  restes / « nothing here » en ambre (le seul défaut). Rendu **en vue jour
  seulement** : en semaine, la grille au-dessus porte déjà ces silences case
  par case (décision, voir §5).
- **Nouvelle prop REQUISE `PlanResult.shoppingList`** (pas de `?` — un
  optionnel ferait du bloc courses une prop morte chez l'appelant qui
  oublie). `MealBuilder` passe `result?.shoppingList ?? []`, `PlanDraftDialog`
  passe `draft.shoppingList` — **même corps de plan sur les deux surfaces**
  (C8), et un test le tient.

### `6a4563cf` — les deux listes plates

- `lib/dishListByDay.ts` : `groupDishListByDay({order, dishes})` — pur.
  Groupes dans l'ordre du **plan** (`order` = `windowDayOrder`, jamais le
  calendrier) ; plat sans jour **ou d'un jeton hors fenêtre** → groupe sans
  titre, en tête, **rien ne se perd** (compte vérifié par test) ; tri stable
  par moment (`EATING_OCCASIONS`, inconnus en queue). Aucune lecture de titre.
- `plan/DishListByDay.tsx` : le rendu par jour extrait de
  `PlanByPerson.OnePerson` (jour en petites capitales, `moment — titre`, part
  éventuelle en dessous, `break-words`).
- Montages : `OnePerson` (`groups={week}`, `buildPersonWeek` reste la seule
  découpe de cette vue — le filtrage par personne lui appartient) ;
  `HouseholdPlanCard` (ordre = `windowDayOrder(meal.startsOn,
  meal.durationDays)`) ; `MyShareCard` (nouvelle prop **requise**
  `dishDayOrder`, passée par `StudentWeekPlanPage` depuis la fenêtre du plan
  du foyer — `[]` sans plan vivant, et alors la liste est vide aussi).
- **Sans enrichissement**, et c'est armé : un test interdit
  `ingredient|why|method|session|uses` dans la source de la liste (comments
  retirés), et la ceinture lexicale de `planByPersonModel.int.test.ts`
  (`goal|kcal|calorie|weightKg|heightCm|energy`) est **étendue** aux deux
  fichiers neufs.

## 2. Les preuves

| Épreuve | Résultat |
|---|---|
| `cd frontend && npx tsc -b` | **exit 0** (rejoué après chaque commit et chaque restauration) |
| `npx vitest --config vitest.config.ts run` (complet) | **1029 passés**, 20 skipped · **3 rouges, tous antérieurs et étrangers** (§3) |
| Suite i18n (`src/keel/i18n`, parité + coutures comprises) | **68 passés** — les 10 clés neuves passent la parité |
| `agent-gate` sur chacun des 4 commits | **pass** (suite Deno + eslint) |
| Mes tests neufs | **37** — 25 (`planDayView.int.test.ts`) + 12 (`dishListByDay.int.test.ts`), plus 2 tests existants étendus |
| Mutations | **10/10 au rouge**, restaurées, tout vert ensuite (§4) |
| Fichiers serveur touchés | **0** (`git diff --name-only 22b16bce..HEAD`) |

### 3. Les 3 rouges de vitest sont ANTÉRIEURS et ÉTRANGERS — prouvé

Worktree **détaché sur `22b16bce`** (le commit qui précède tout mon travail,
`node_modules` du dépôt principal lié) : les **mêmes familles** y sont rouges,
plus une :

1. `src/edge/coverage-guard.int.test.ts` (2) — fonctions edge et triggers
   absents des listes connues. Je n'ai ajouté ni fonction edge ni trigger.
2. `src/keel/copy/planRefusals.int.test.ts` — sept `household.error.*`
   inatteignables depuis `HOUSEHOLD_REFUSAL_KEYS`. `en.ts` est tenu par la
   lane i18n, non commité.
3. (au commit d'avant seulement) « couvre chaque jeton que les deux
   générateurs peuvent rendre » — **rouge à `22b16bce`, vert aujourd'hui** :
   les packs non commités de la lane i18n l'ont réparé depuis. Preuve
   supplémentaire que ces rouges vivent dans la lane des packs, pas dans ce
   lot.

### 4. Les mutations, une par une

| # | Mutation | Résultat |
|---|---|---|
| 1 | `defaultSelectedDay` ignore aujourd'hui (toujours le 1er jour) | **rouge** (2 ✗) |
| 2 | `effectiveSelectedDay` rend la sélection brute (jeton périmé accepté) | **rouge** (1 ✗) |
| 3 | le rail est masqué (bouton « toute la semaine » retiré) | **rouge** (1 ✗) |
| 4 | la grille est débranchée de la sélection (`onSelectDay` coupé) | **rouge** (1 ✗) |
| 5 | le groupe `day: null` est filtré par la vue jour | **rouge** (1 ✗) |
| A | la jointure de vague ne compare plus la date (1re vague pour tous) | **rouge** (2 ✗) |
| B | `dayMoments` lit toujours la première colonne | **rouge** (1 ✗) |
| C | la session du jour est débranchée (`sessions = []`) | **rouge** (1 ✗) |
| D | le validé cesse de passer `shoppingList` | **rouge** (1 ✗) |
| E | l'ordre des listes plates redevient le calendrier | **rouge** (1 ✗) — ⚠️ voir ci-dessous |
| F | le groupe sans jour des listes plates est jeté | **rouge** (2 ✗) |
| G | `OnePerson` cesse de rendre la liste extraite | **rouge** (1 ✗) |
| H | le mot `ingredients` entre dans `DishListByDay` | **rouge** (1 ✗) |
| I | le mot `goal` entre dans `dishListByDay.ts` (ceinture étendue) | **rouge** (1 ✗) |

⚠️ **La mutation E n'a PAS mordu du premier coup**, et c'est consigné dans le
test lui-même : ma première fixture (`wed` + `fri`) rendait le même ordre en
plan et en calendrier. La fixture porte maintenant un plat du `mon` de la
semaine suivante — mutation rejouée, rouge cette fois. Une garde qu'on n'a
jamais vue mordre n'est pas une garde ; celle-ci ne mordait pas.

## 5. Les décisions tranchées seul

| Décision | Option rejetée, et pourquoi |
|---|---|
| **Aperçu en semaine, validé en jour** (`defaultView="week"` dans `PlanDraftDialog`) | Les deux en vue jour : on juge un brouillon en ENTIER avant de l'adopter ; le rail garde chaque jour à un clic. Le master prompt offrait la prop, le choix de la valeur est le mien. |
| **Les motifs des moments vides ne se rendent qu'en vue jour** | Les rendre aussi en semaine : la grille au-dessus porte déjà ces silences case par case, et jusqu'à 21 lignes de motifs sous les jours seraient du bruit. Le parent passe `moments={[]}` en semaine, avec le commentaire sur place. |
| **Aucune case à cocher sur les courses du jour** | Cocher ici aussi : les ratures vivent en mémoire dans `ShoppingListPanel` ; un second jeu de coches serait une seconde mémoire pour la même liste, et c'est celle qu'on ne regarde pas qui gagnerait. La liste du jour se lit, la fenêtre se coche. |
| **Pas de phrase `servesCookOn` sur la carte courses du jour** | L'afficher exigeait `formatWeekday` de `i18n/format.ts`, un fichier NON SUIVI d'une autre lane — un import commité vers un fichier hors git aggraverait la dette §10 du rapport du 15/08. La fenêtre de courses complète, elle, la dit déjà. |
| **La vague s'accroche par `dayDates[group.day]`, pas par `dishDate(...)`** | `dishDate` replie un groupe sans jour sur « aujourd'hui » : une vague tombant aujourd'hui se serait accrochée au bloc SANS jour. Le repli est bon pour les coches, faux pour les courses. |
| **Le jour choisi se rend même sans plat** | Le taire : un jour peut porter une session, des courses et des moments déclarés ; disparaître se lirait comme un plan troué. S'il n'y a VRAIMENT rien, une ligne le dit (`meals.result.day_nothing`). |
| **`shoppingList` et `dishDayOrder` REQUISES** | Optionnelles : « paramètre de garde optionnel = garde désarmée » — un appelant qui oublie rendrait un bloc courses mort ou un ordre d'aucun plan, sans un rouge. |
| **`sessions` filtrées dans le bloc, `wave`/`moments` résolus par le parent** | Tout résoudre dans le bloc : la vague exige la jointure jeton→date (`windowDates`) et les moments exigent la grille — les refaire dans le bloc serait la « seconde dérivation » que le lot interdit. La session, elle, se filtre jeton contre jeton, sans conversion. |
| **`dishSession.int.test.ts` et `planByPersonModel.int.test.ts` étendus, pas contournés** | Les laisser : le premier serait devenu rouge (le littéral a déménagé avec le code), le second aurait laissé les fichiers neufs hors ceinture. « À faire évoluer, pas à contourner » (§3.2). |

## 6. Les clés i18n — sur le disque, NON commitées

`en.ts` (suivi, tenu par la lane i18n) et `fr.ts` (non suivi) sont modifiés sur
le disque et **absents de mes commits**, par la convention des lanes (§2.15).
**10 clés, dans les deux packs**, parité verte (68/68) :

| Clé | en | fr |
|---|---|---|
| `meals.result.day_all` | The whole week | Toute la semaine |
| `meals.result.day_rail` | Read one day | Lire un jour |
| `meals.result.day_session` | Cooking session | Session de cuisine |
| `meals.result.day_session_show` | See the run-through | Voir le déroulé |
| `meals.result.day_session_hide` | Hide the run-through | Masquer le déroulé |
| `meals.result.day_groceries_one` | Groceries for this day — 1 item | Les courses du jour — 1 article |
| `meals.result.day_groceries_many` | Groceries for this day — {n} items | Les courses du jour — {n} articles |
| `meals.result.day_groceries_show` | See the list | Voir la liste |
| `meals.result.day_groceries_hide` | Hide the list | Masquer la liste |
| `meals.result.day_nothing` | Nothing to cook or buy this day. | Rien à cuisiner ni à acheter ce jour-là. |

Réutilisées sans en créer : `meals.sessions.session_time`, `meals.grid.away` /
`.leftovers` / `.empty` / `.empty_hint`, `meals.day.*`, `meals.slot.*`,
`meals.aisle.*`.

⚠️ Conséquence connue et assumée de la convention : mes commits référencent des
clés qui ne vivent que dans les packs du disque — comme les lots des 14 et
15/08. Une copie fraîche sans le lot i18n ne compile pas ; la dette est celle
de la lane i18n, nommée dans `i18n-layer-is-uncommitted-foreign-work`.

## 7. Fichiers étrangers rencontrés — rien défait

- `pages/setupDraftWiring.int.test.ts`, `api/mealLabels.ts`, `i18n/*` :
  modifiés/non suivis par la lane i18n. **Lus, jamais réécrits** (mes clés
  s'ajoutent aux packs par-dessus leur travail).
- `pages/SetupPage.tsx` : modifié par une autre lane — **pas touché** (aucun
  besoin : `PlanDraftDialog` porte seul le `defaultView`).
- `pages/StudentWeekPlanPage.tsx` et `components/MealBuilder.tsx` : propres au
  départ, modifiés par moi seul.

## 8. Ce qui reste rouge / à l'agent 1B

1. ⛔ **Aucune vérification navigateur** — par consigne : 320 px ET 1280 px,
   `document.scrollWidth`, la vue jour réelle (sessions + courses + plats), le
   clic sur un `<th>`, la preview depuis `/app/plan` et `/app/setup`,
   `/app/household` en secondaire. Rien de tout ça n'est « prouvé » ici.
2. ⛔ **Aucun run modèle** — front pur, aucun appel ; l'état du runtime edge
   n'a même pas été sondé.
3. ⚠️ Les 3 rouges vitest étrangers (§3) restent rouges — ils appartiennent à
   la lane i18n / coverage-guard, pas à ce lot.
4. ⚠️ Le pluriel des libellés courses est fait par deux clés (`_one`/`_many`)
   choisies en code, pas par `i18n/plural.ts` — ce module est NON SUIVI (autre
   lane) et un import commité vers lui aurait aggravé la dette. À unifier le
   jour où le lot i18n se commite.
5. ⚠️ Hors périmètre, croisés et nommés sans y toucher : la lane foyer qui
   saute `keelGenerationModel()` (§3.1 du master prompt) ; la troncature
   inerte `line-clamp-2 block` de `PlanGrid.tsx` (défaut connu, tâche
   `task_0beec508` d'un lot voisin).
