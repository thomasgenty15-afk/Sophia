# MASTER PROMPT — La restitution du plan foyer : par jour, préparation du jour J, par personne, grammes en boîtes

**Date** 2026-08-17 · **Branche de départ** `ff-001-quotidien-du-coach` ·
**Autorité produit** [CLAUDE.md](../CLAUDE.md) · [docs/keel/MODEL.md](../docs/keel/MODEL.md) ·
[docs/fonctionnalites/le-foyer/README.md](../docs/fonctionnalites/le-foyer/README.md)

> Ce document est un **prompt maître** : il se découpe en prompts d'agents,
> chacun autonome. Il se lit dans l'ordre, et il s'exécute dans l'ordre.
> Chaque agent reçoit **ce document entier** plus son prompt propre (§LOT n).

---

## 0. La demande, dans l'ordre d'importance

Quatre exigences, formulées par l'utilisateur le 2026-08-17, classées par lui.
L'ordre d'importance est l'ordre ci-dessous ; l'ordre d'exécution le respecte.

### P1 — L'affichage du plan se fait PAR JOUR, en preview ET en validé

Aujourd'hui le plan est **une longue liste** — dans l'aperçu
(`PlanDraftDialog`) comme sur `/app/plan`. Il faut que la restitution soit
organisée **jour par jour**, et que chaque jour porte, ensemble :

- les **sessions de cuisine** de ce jour ;
- les **courses** de ce jour (la vague qui tombe ce jour-là) ;
- les **plats** de ce jour, par moment.

### P2 — Chaque plat porte un COMMENTAIRE DE PRÉPARATION du jour J, toujours

Avant chaque plat, **toujours** un commentaire de préparation, qui dit ce qu'il
y a à faire **le jour même** pour avoir le plat dans l'assiette :

- le **temps de préparation du jour J** — pas le temps de cuisson de la session
  de batch : le temps du geste du jour (assembler, cuire un accompagnement…) ;
- **ce qui est repris du déjà-cuisiné** (« utilise le poulet de vendredi ») ;
- le **réchauffage, dit explicitement** quand il n'y a que ça à faire ;
- et quand il n'y a **rien** à reprendre (œufs brouillés faits minute), le
  commentaire le dit aussi — un plat sans commentaire n'existe pas.

### P3 — Quand deux personnes ne mangent pas le même plat, la séparation est NETTE

Dans un foyer, quand deux bouches ont deux plats différents au même moment, la
restitution du jour sépare **clairement** ce qu'il y a à préparer pour chacun.
Lisible en un regard : « pour la table » / « pour Untel », chacun avec son
commentaire de préparation.

### P4 — Les portions redeviennent PRÉCISES : grammes par personne, et le protocole des boîtes

Décision produit, prise par l'utilisateur en connaissance de cause :

> « Prendre une poignée », « une grosse portion », ça ne veut rien dire.
> On revient à des **quantités précises par personne**.

Et la façon d'éviter que les gens pèsent à chaque repas est décidée aussi :
**tout se pèse UNE fois, à la session de cuisine**, au moment de la mise en
boîtes :

- la session de cuisine porte des **instructions de mise en tupperware** :
  si 3 personnes ont des objectifs différents → **3 boîtes, avec des grammes
  différents**, chacune nommée ;
- la préparation du jour J peut alors dire « **boîte Zoé — 75 g** » sans
  re-pesée ;
- le **complément du jour** s'exprime en grammes secs (« faire cuire 100 g de
  pâtes sèches ») ou en unités dénombrables (« un demi-citron », « 10 feuilles
  de basilic ») — jamais en « poignées ».

**La frontière qui rend P4 légal dans ce produit** (elle est déjà écrite,
FF-047) : on émet des **grammes d'ALIMENT**, jamais des chiffres sur un CORPS
et jamais des calories. « Boîte Zoé — 150 g de riz » est une instruction de
cuisine ; « 150 g parce que tu vises une perte » est un verdict, et il reste
interdit (F7/F8, `FORBIDDEN_PORTION_TERMS`). Aucun agent ne renégocie cette
frontière.

---

## 1. Comment ce chantier s'exécute

**Neuf agents, en série.** Quatre paires bâtisseur + vérificateur — une paire
par exigence — puis un agent de cohérence finale. Chaque vérificateur teste le
**backend**, le **frontend** (navigateur compris), et la **cohérence des
plans** (§2.4), et il rend un rapport séparé de celui du bâtisseur.

| Ordre | Agent | Rôle |
|---|---|---|
| 1 | **1A** | P1 — l'affichage par jour (front pur, aucune donnée neuve) |
| 2 | **1B** | vérifie P1 |
| 3 | **2A** | P2 — le commentaire de préparation du jour J (schéma + prompt + parseur + rendu) |
| 4 | **2B** | vérifie P2 |
| 5 | **3A** | P3 — la séparation par personne dans la vue jour |
| 6 | **3B** | vérifie P3 |
| 7 | **4A** | P4 — grammes par personne + protocole des boîtes (le lot le plus lourd) |
| 8 | **4B** | vérifie P4 |
| 9 | **E** | cohérence de bout en bout : un run réel, les compteurs SQL, le navigateur sur toute la chaîne |

**Pourquoi en série et pas en parallèle** : plusieurs lanes travaillent déjà
sur ce dépôt ; les quatre lots touchent des fichiers qui se recouvrent
(`PlanResult`, `DishCard`, `meal_generation.ts`) ; et chaque vérificateur doit
voir l'état laissé par SON bâtisseur, pas un mélange.

**Un vérificateur qui trouve un défaut** le consigne, le fait corriger par le
bâtisseur de sa paire (ou le corrige lui-même s'il est trivial et dans le
périmètre), et re-déroule ses épreuves. Il ne passe la main au lot suivant que
paire verte.

**Chaque agent écrit son rapport horodaté** dans
`scratchpad/2026-08-JJ-HHMM-LOT<n><A|B>-<sujet>.md` (dépôt partagé entre
sessions : l'horodatage évite les collisions). Le rapport dit ce qui est
prouvé, ce qui ne l'est pas, et par quoi.

---

## 2. Les règles transverses — elles s'appliquent à CHAQUE agent

### 2.1 Le produit, et ce qu'on ne renégocie pas

1. **Lire avant d'écrire** : `CLAUDE.md`, `docs/keel/MODEL.md`,
   `docs/fonctionnalites/le-foyer/README.md`,
   `scratchpad/PLAN-PAR-PERSONNE-RAPPORT.md` (2026-08-14),
   `scratchpad/PLAN-BATAILLE-RAPPORT.md` (2026-08-15). Ces deux rapports
   décrivent l'état exact des surfaces que ce chantier retouche.
2. **Aucune calorie, nulle part** (`docs/keel/CONTRACT.md`). Les grammes
   d'aliment sont permis et voulus (P4) ; les kcal, macros ciblées et chiffres
   corporels restent interdits.
3. **Une consigne de service est une instruction, jamais un diagnostic** (F8).
   La ceinture est `FORBIDDEN_PORTION_TERMS`
   (`_shared/keel/household_portions.ts:1112`, appliquée par
   `sanitizePortionNote:1308`), **bilingue**. Toute ceinture neuve est testée
   dans **les deux langues**, avec **un cas qui passe** (une garde sans cas
   passant bloque tout et ressemble à une garde qui marche).
4. **Jamais de matcher maison** sur du texte de plat/aliment (« laitue » ≠
   « lait », 12 faux positifs sur 12 mesurés). Toute attribution ou structure
   est **déclarée par le modèle et validée contre une liste fermée** — le
   patron `preparation_id` / `for_member_id`.
5. **Tout champ déclaré par le modèle a un COMPTEUR** archivé dans
   `generated_from` (patron `dish_owners = {asked, attributed}`). Sans
   compteur, un modèle qui ignore la consigne rend un lot désarmé
   indiscernable d'un lot qui marche.
6. **Versions de prompt** — la règle : *« quelle population voit une consigne
   différente »*. Tronc = `MEAL_PROMPT_VERSION` ; enveloppe foyer =
   `HOUSEHOLD_PROMPT_VERSION` (aujourd'hui **v12**). Tout changement de prompt
   = bump du bon axe + **test byte-identique** pour chaque lane qui ne doit
   pas bouger.
7. **Les gardes des vues restent** : la vue par personne est `isOwner`-only ;
   un secondaire ne voit **ni `ingredients` ni `why`** du plan du foyer
   (`HouseholdDishView`, `api/household.ts:1341-1387`) ; aucun champ
   `goal`/`kcal`/`weight` ne peut structurellement entrer dans une vue (tests
   sur source, commentaires retirés). On étend ces vues, on ne desserre pas
   leurs ceintures.
8. **Hors périmètre, à ne PAS réparer en passant** : la lane 1:1
   (`plan_versions`, `/coach/import`) est gardée exprès ; la bascule de langue
   explicite est `wont_fix` ; le générateur foyer qui saute
   `keelGenerationModel()` est un chantier à part (le nommer dans le rapport
   si on le croise, rien de plus).

### 2.2 Le poste de travail, et ses pièges mesurés

9. **Commandes à risque : jamais seul.** `supabase db push/reset`,
   `functions deploy`, `secrets`, `config push`, `link` sont bloquées par
   hook : donner la commande exacte à l'humain. Migrations locales :
   `supabase migration up` **seulement** ; vérifier qu'aucune version disque
   n'est antérieure au registre (une migration hors ordre est **sautée en
   silence**) ni dupliquée (`ls supabase/migrations | cut -d_ -f1 | uniq -d`).
   Précédent accepté sur ce poste : appliquer par `psql` puis inscrire la
   version à la main dans `supabase_migrations.schema_migrations` (la CLI
   `migration up` plante — `index out of range`).
10. **401 `Invalid JWT` local** : ne rien toucher —
    `./scripts/check-local-jwt-alg.sh` puis `docs/keel/JWT-HS256.md`.
    `supabase/signing_keys.local.json` reste `[]`.
11. **Avant tout run réel** : le runtime edge doit être **vivant et frais** —
    il sert des `_shared` **périmés** sinon (un fichier modifié n'est pas
    rechargé). Le redémarrage (`supabase stop && supabase start`, puis
    déconnexion/reconnexion dans l'app) **coupe les runs des lanes voisines** :
    c'est un geste à faire valider par l'humain. 500/503 partout avec
    PostgREST OK = runtime éteint (réparer par `functions serve`, pas par un
    restart réflexe). Lancer le **script Kong** avant un run long (502 = faux
    tours perdus).
12. **Navigateur** : harnais de session commité
    (`frontend/e2e/eating-rhythm.e2e.spec.ts`,
    `scratchpad/HARNAIS-SESSION-NAVIGATEUR-20260813.md`). Personas locaux :
    mot de passe `1234567` ; **jamais** viser un compte sans mot de passe
    connu ; ne pas faire avancer un compte QA partagé. La fixture doit porter
    un **plan publié**. Le pane ne repeint qu'à **scroll 0** : décaler le
    corps par marge négative, et **mesurer** (`document.scrollWidth`) plutôt
    que regarder. Vérifier à **320 px ET 1280 px**.
13. **Typecheck et suites** : front = `cd frontend && npx tsc -b` (le
    `tsconfig.json` racine ne vérifie **rien**, `files: []`) puis
    `npx vitest --config vitest.config.ts run` ; serveur = suite Deno de
    `_shared/keel/`. `agent-gate` tourne sur chaque commit (depuis un
    worktree : il faut le `node_modules` racine du dépôt principal). Rouges
    étrangers : ne pas toucher, prouver l'antériorité (worktree détaché sur le
    commit d'avant), les nommer.
14. **Git** : jamais `git add -A` ; chaque commit liste ses chemins, relus par
    `git diff` avant stage ; jamais `git stash` (dépôt partagé — il emporte le
    travail des autres lanes ; comparer par `git show HEAD~1:chemin`).
    Messages de commit : style du dépôt (minuscules, une phrase qui raconte).
15. **i18n** : la clé anglaise est la source du type (`en.ts`), `fr.ts` la
    suit ; namespaces par page (`i18n/catalog.ts` — `/app/plan` déclare déjà
    `plan`, `meals`…) ; jamais `const X = t(...)` au niveau module ; dates par
    `i18n/format.ts`, jamais `toLocaleDateString` direct. Convention des
    lanes : les packs `en.ts`/`fr.ts` se modifient sur le disque mais **ne se
    commitent pas** dans vos lots — lister les clés ajoutées dans le rapport.
16. **Écrans** : Tailwind v4 **sans** fichier de config (le thème vit dans
    `frontend/src/tokens.css`) ; figue = navigation/action seulement ; les
    couleurs d'état (émeraude/bleu/ambre/rouge) = états seulement ;
    « aujourd'hui » se dit par la **forme**, jamais par une couleur ; tout
    débordement défile **dans son conteneur**, jamais la page ;
    `break-words` sur tout texte venu du modèle ; cibles tactiles ≥ 24 px ;
    pas de primitive `Tabs`/`Accordion` neuve avant un troisième usage — les
    patrons existants sont listés en §3.2.

### 2.3 La preuve, et sa discipline

17. **Chaque garde neuve est MUTÉE** : on la casse, on voit le rouge, on
    restaure. Une garde qu'on n'a jamais vue mordre n'est pas une garde.
18. **Aucun test paramétré par sa propre constante** : muter la constante doit
    faire tomber le test.
19. Ce qui n'a pas été vu en run réel ou au navigateur est **consigné rouge**
    dans le rapport, jamais présenté comme prouvé. Les rapports voisins
    montrent le format.

### 2.4 « La cohérence des plans » — la définition commune aux vérificateurs

Un plan est cohérent quand **toutes** ces lignes tiennent. Chaque vérificateur
rejoue celles que son lot touche ; l'agent E les rejoue toutes sur un plan réel.

- **C1 — la fenêtre.** Chaque jour de `windowDayOrder(startsOn, durationDays)`
  apparaît exactement une fois, dans l'ordre du **plan** (pas du calendrier) ;
  le groupe `day: null` n'est jamais perdu.
- **C2 — la jointure cuisine.** Chaque `dish.uses[].preparation_id` résout
  vers une préparation existante ; chaque préparation citée par une session
  existe ; `sessionForDish` retrouve la session ; une préparation consommée un
  jour J a été cuisinée un jour ≤ J.
- **C3 — le jour J.** Chaque plat porte un commentaire de préparation non
  vide et un `same_day` valide (à partir du LOT 2) ; un plat `reheat_only` a
  des `uses` non vides.
- **C4 — les personnes.** Au moment M d'un jour, chaque bouche présente a
  soit le plat commun, soit son plat dédié — jamais zéro, jamais deux ; un
  plat `for_member_id` n'apparaît jamais dans l'assiette d'un autre ; les
  prénoms viennent de la ligne membre (F5).
- **C5 — les grammes** (à partir du LOT 4). La somme des grammes mis en
  boîtes d'une préparation ≤ ce qu'elle produit ; toute boîte citée par un
  plat existe et vient d'une session antérieure ou du jour même ; les
  compléments du jour sont en grammes ou en unités dénombrables.
- **C6 — les courses.** Chaque vague tombe un jour ≤ premier jour d'usage de
  ce qu'elle porte (`MAX_FRIDGE_DAYS = 3`, `_shared/keel/meal_generation.ts:780`).
- **C7 — les ceintures.** Aucune calorie, aucun terme de
  `FORBIDDEN_PORTION_TERMS`, aucun objectif/poids dans une vue — vérifié dans
  **les deux langues**.
- **C8 — les deux surfaces.** La preview et le validé rendent le **même**
  corps de plan (`PlanResult` monté deux fois — c'est verrouillé par
  `pages/setupDraftWiring.int.test.ts:148-156` ; ne pas le dé-verrouiller).

---

## 3. La carte du terrain — état mesuré au 2026-08-17

### 3.1 Le pipeline (serveur)

- **Un seul moteur** : `_shared/keel/meal_generation.ts` (3548 l.) —
  `MEAL_SYSTEM_PROMPT:1109-1340`, `buildMealPrompt:1448`,
  `parseGeneratedMeal:2314`, payloads de persistance `:3488-3548`. Le foyer
  n'est pas un second générateur — c'est une **enveloppe de prompt**
  (`_shared/keel/household_meal_generation.ts` —
  `buildHouseholdPromptBlocks:678`, `PORTION_SCHEMA_BLOCK:571-582`,
  `dishOwnerSchemaBlock:610-622`, `extractMemberPortions:773`).
- Fonctions edge : `generate-household-meal-v1` (lane foyer — maître d'un
  foyer ≥ 2 bouches ; opérations `compose`/`merge`/`unmerge`,
  `index.ts:858-962`) et `generate-meal-v1` (lane individuelle et
  secondaires). Routage client : `api/planRouting.ts:45-68`.
  ⚠️ `generate-week-plan-v1` est un AUTRE objet (lignes de conduite hebdo,
  table `student_week_plans`) — aucun plat ; ne pas le confondre.
- **Vocabulaire « validé »** : dans ce chantier, le plan « validé » est le
  plan **ÉCRIT** (adopté depuis l'aperçu, ou composé directement). La colonne
  `validated_at` est autre chose — la **prise de main** d'un secondaire
  (`keel_validate_meal_plan` refuse d'ailleurs tout plan `household` :
  `not_a_personal_plan`).
- L'aperçu est `intent: "draft"` (zéro écriture — « le SEUL saut est
  l'écriture », `generate-household-meal-v1/index.ts:3787-3811`) ;
  **« Adopter » RECOMPOSE** (`api/planDraft.ts:363-393`) — le plan écrit peut
  différer de l'aperçu, et l'écran le dit.
- Stockage : `student_generated_meals`
  (`20260804100000_meal_generation_and_doctrine_foods.sql:107`) — colonnes
  jsonb `dishes`, `preparations`, `cooking_sessions`, `shopping_list`,
  `member_portions`, `generated_from` ; `plan_kind`
  (`personal`/`household`), `starts_on`/`duration_days`/`ends_on`,
  `validated_at`, `retired_at`, `content_locale`. Écriture par la RPC
  `write_student_meal_plan` (appelée `index.ts:3819`). « Vivant » =
  `retired_at is null AND ends_on >= today` ; deux plans vivants (courant +
  suivant) sont le cas **nominal**.
- Clés d'un plat en base (`mealDishesPayload:3488`) : `title, slot, day,
  ingredients[], method, why, honours_belief_keys,
  uses[{preparation_id, servings}], member_id` — et `member_id` est **écrit
  même à `null`** (`:3501-3512` : « une clé absente ne se distingue pas d'un
  lot débranché ») ; ce patron s'applique à tout champ neuf.
  Ingrédients (`ingredientPayload`) : `{term, quantity, in_pantry, amount,
  unit (g|ml|unit|tbsp|tsp), state (raw|cooked), grams_raw}` — `in_pantry`
  et `grams_raw` sont **calculés par le parseur, jamais recopiés du modèle**.
  Préparations : `{id, title, servings_made, ingredients[] (le LOT entier),
  method, active_minutes, total_minutes, cook_on}`. Sessions : `{day,
  preparation_ids, run_through, total_minutes (au mur, PAS la somme)}`.
- **Deux systèmes de coordonnées** : plats (`day`), préparations (`cook_on`)
  et sessions (`day`) sont indexés par **jetons** `mon..sun` (jamais
  traduits) ; vagues de courses (`GroceryWave.buyOn`, `grocery_waves.ts:132`)
  et tables d'état (`cooking_session_states.cook_on`,
  `grocery_wave_states.buy_on`) par **dates** `YYYY-MM-DD`. Le **seul pont**
  est `windowDates` — source serveur `_shared/keel/meal_plan_window.ts:168`
  (avec `windowDayOrder:181`, `windowSplit:197`), accédée côté front par
  `api/mealWindow.ts`. Une fenêtre courte rend MOINS de sept entrées : un
  jeton hors fenêtre n'a pas de date. C'est le frein structurel à une vue
  « jour » : pas un manque de données, un manque d'axe commun — il n'existe
  **aucun objet-jour** côté serveur, chaque surface refait son regroupement.
- Les portions par personne aujourd'hui : `member_portions` = de la **prose**
  (`{member_id, display_name, portion_note, preparation_shares[
  {preparation_id, note}]}` — `memberPortionsPayload`,
  `household_portions.ts:1425`), voulue floue parce que lue à voix haute à
  table ; `reconcilePortions:1345` réattribue une part standard à toute
  bouche omise ; `sanitizePortionNote:1308` la ceinture. Elle n'est indexée
  **ni par jour ni par plat** : la seule jointure vers un plat passe par
  `preparation_shares[].preparation_id` — un plat sans `uses` ne peut
  structurellement porter aucune part.
- **Les grammes fiables existent au niveau du LOT** : `gramsRaw`, recalculé
  par le parseur depuis `amount`/`unit`/`state` + le référentiel
  (`food_composition_io.ts`), jamais lu d'un champ du modèle
  (`meal_generation.ts:447-459`) ; `null` compté en trois cas distincts. Et
  **`member_deltas` est le précédent exact d'un contrat « aliment + grammes
  par membre »** : `{memberId, foodRef, grams, moment, channel}`
  (`household_composition.ts:359-366`, catalogue fermé `:398-405`, payload
  `:533-546`), persisté dans `generated_from.household.member_deltas`
  (`index.ts:4059`), lu par `plan_energy.ts:232-264` — et écrit **même
  vide**.
- ⚠️ **Anomalie mesurée, chantier à part** : la lane foyer n'appelle PAS
  `keelGenerationModel()` — ses deux appels modèle (`index.ts:3299`, `:3419`)
  omettent `meta.model` et retombent sur `GLOBAL_AI_MODEL`. Toute mesure de
  qualité/latence d'une génération foyer se lit avec ça en tête. On ne le
  répare pas dans ce chantier ; on le nomme dans les rapports.

### 3.2 La restitution (front)

- **LE point d'insertion unique : `frontend/src/keel/components/plan/`**
  **`PlanResult.tsx:146-227`** — le seul rendu du plan long, monté exactement
  deux fois : `MealBuilder.tsx:1518` (validé, `/app/plan`) et
  `PlanDraftDialog.tsx:193` (preview). Une modification là change les deux
  surfaces. Au-dessus : `PlanGrid` (semaine en tableau moment × jour,
  `plan/PlanGrid.tsx:43-155`).
- Briques par-jour **déjà écrites** : `groupByDay`
  (`lib/mealBuilderModel.ts:57` — ordre du plan, groupe `day: null` en tête),
  `dishDate`, `dishDayLabel` (`api/mealLabels.ts:101`), `sessionForDish`
  (`lib/dishSession.ts`), `buildPlanGrid` + motifs de cases vides
  (`lib/planGridModel.ts:26,110`), `daysFedBy` (`:158`), vagues d'achat
  (`api/groceryWaves.ts`, réexport de `_shared/keel/grocery_waves.ts` — la
  **seule** définition, ne jamais recopier la règle côté écran).
- Sessions et courses ont déjà leurs surfaces (des **modales**) :
  `CookingSessions.tsx:128-263` (une carte par session : jour, `run_through`,
  préparations avec `servings_made`, `active_minutes`/`total_minutes`,
  recette dépliable) et `ShoppingListPanel.tsx:264-300` (une section par
  **vague**, puis par rayon).
- Vue par personne : `PlanByPerson.tsx` (`together`/`one`, owner-only,
  ≥ 2 bouches) + `lib/planByPersonModel.ts` (`buildPersonWeek:266`).
  `MyShareCard.tsx` (« ta part », secondaire) et `HouseholdPlanCard.tsx:76-92`
  (`/app/household`, secondaire) — **les deux listes plates littérales**.
- Types du plan côté front : `api/mealGeneration.ts:230-378`
  (`GeneratedMealResult`, `GeneratedDish`, `MealPreparation`
  — `active_minutes`/`total_minutes`/`cook_on` —, `CookingSession`,
  `ShoppingItem`, `PlanFixedIntake`, `PlanDayProperty`).
- Patrons UI à copier (pas de primitive neuve) : onglets = deux `Button`
  `aria-pressed` (`MealBuilder.tsx:1325-1345`) ; contrôle segmenté =
  `PlanByPerson.tsx:140-158` ; dépliant = `aria-expanded` + texte souligné
  (`DishCard.tsx:280-297`, `CookingSessions.tsx:174-191`) ; « fiche » à
  fronton = `ui/SetupSection.tsx:77-118`. Kit : `ui/Card`, `ui/Badge`,
  `ui/Modal` (rend `null` fermé **sans démonter** — l'état survit),
  `ui/Button`.
- Tests de structure qui verrouillent l'existant (à faire évoluer, pas à
  contourner) : `pages/setupDraftWiring.int.test.ts:87-156`,
  `lib/dishSession.int.test.ts:189-203` (assertions littérales sur la source
  de `PlanResult`/`DishCard` — dont l'interdit des **durées de session** sur
  la carte d'un plat), `lib/planByPersonModel.int.test.ts`,
  `lib/planGridModel.int.test.ts`.

---

# LOT 1 — L'affichage par jour (P1)

## Prompt de l'agent 1A — bâtisseur

Tu transformes la restitution du plan — preview **et** validé — d'une longue
liste en une lecture **par jour** : chaque jour montre ses sessions de
cuisine, sa vague de courses et ses plats. Front **pur** : aucune donnée
neuve, aucun appel serveur nouveau, aucune migration.

**Lis d'abord** les §0-§3 de ce document, puis les fichiers cités ici.

### Le dessin

1. **Extrais le bloc jour** de `PlanResult.tsx:150-226` en
   `plan/PlanDayBlock.tsx` (props : `group`, `date`, `today`,
   `preparations`, `cookingSessions`, `tick`, `energy`, `dayEnergy`). Zéro
   changement de comportement à cette étape — elle rend la suite additive.
2. **Enrichis le bloc jour** avec ce qui existe déjà ailleurs :
   - la **session de cuisine du jour** :
     `cookingSessions.filter(s => s.day === group.day)` — la donnée arrive
     déjà dans `PlanResult` et n'est utilisée que par `sessionForDish`.
     Rends-la en tête du jour (carte compacte : « Session de cuisine —
     {run_through résumé} », dépliable vers le détail, patron
     `CookingSessions.tsx:174-191`). La modale « tes sessions de cuisine »
     reste — c'est la vue d'ensemble ; le bloc jour en est la déclinaison.
   - la **vague de courses du jour** : `waveAssignments`
     (`api/groceryWaves.ts` — **pur réexport** du module serveur
     `_shared/keel/grocery_waves.ts`, `planGroceryWaves:173` ; y remettre
     une règle recréerait le jumeau supprimé) est indexée par **date** —
     joins par `windowDates` (jeton → date), jamais par un calcul maison. Si
     une vague tombe ce jour : « Courses aujourd'hui — N articles »,
     dépliable vers la liste de la vague (rayons comme
     `ShoppingListPanel.tsx:264-300`). La modale globale reste.
   - le **motif d'une case vide** : `buildPlanGrid` est déjà calculé dans
     `PlanResult.tsx:126-133` — lis `grid.rows[].cells[i]` à l'index du jour
     pour dire pourquoi un moment est vide (absence, apport fixe, restes…).
3. **Navigation par jour dans `PlanResult`** : état local
   `selectedDay: "all" | string`, défaut = le jour dont
   `dishDate(...) === props.today`, sinon le premier de `windowDayOrder`.
   - Desktop : rail segmenté (patron `PlanByPerson.tsx:140-158`), un bouton
     par jour = jour abrégé + quantième (le contenu des `<th>` de
     `PlanGrid.tsx:80-85`) + « Toute la semaine ».
   - `PlanGrid` devient le sélecteur naturel : ses `<th>` prennent un
     `onSelectDay` **optionnel** — vue semaine → clic sur un jour → le détail
     se filtre. Pas de second rail concurrent.
   - Mobile : le même rail en `overflow-x-auto` dans son conteneur (la
     contrainte qui gouverne est **320 px**, pas le breakpoint du shell).
   - « Aujourd'hui » se marque par la forme (encre pleine + graisse), jamais
     par une couleur (`PlanGrid.tsx:65-73`).
4. **Preview** : `PlanDraftDialog` passe déjà `today={draft.startsOn}` — le
   défaut tombe sur le premier jour du brouillon sans code. Ajoute
   `defaultView?: "week" | "day"` à `PlanResult` si tu veux ouvrir la preview
   en semaine complète et le validé en jour — une prop, pas un second rendu.
5. **Les deux listes plates** : extrais le `<ul>` par jour de
   `PlanByPerson.tsx:404-430` (rendu de `buildPersonWeek`) en
   `plan/DishListByDay.tsx` et monte-le dans `OnePerson`,
   `HouseholdPlanCard.tsx:76-92` et `MyShareCard.tsx:186-206`. **Sans**
   enrichir ces surfaces : un secondaire n'a ni `ingredients` ni `why` ni
   sessions — c'est une garde produit, pas un manque.

### Les interdits du lot

- Ne dérive **aucune seconde liste de jours** : tout part de `groups` +
  `windowDayOrder` (deux dérivations du même plan divergent —
  `PlanResult.tsx:122-125`).
- Ne trie jamais par calendrier : une semaine commencée mercredi affiche
  mercredi en tête.
- Le groupe `day: null` reste visible (bloc « sans jour » à part ou visible
  dans tous les jours) — le filtrer le ferait disparaître.
- Pas de primitive `Tabs` générique (`MealBuilder.tsx:1320-1324` refuse
  explicitement).
- Textes neufs : `en.ts` + `fr.ts` sous `plan.*` / `meals.*` (namespaces déjà
  déclarés pour `/app/plan` dans `catalog.ts:579`), packs non commités,
  clés listées au rapport.

### Livrables

`PlanDayBlock.tsx`, `DishListByDay.tsx`, `PlanResult` réorganisé, `PlanGrid`
cliquable, tests (câblage + modèles purs), rapport horodaté. Commits par
chemin, `agent-gate` vert, `npx tsc -b` exit 0.

## Prompt de l'agent 1B — vérificateur

Tu vérifies le LOT 1, backend compris (ici : que le front n'a **pas** touché
au serveur), navigateur compris, cohérence comprise. Tu ne crois aucun
rapport sur parole : tu rejoues.

1. **Statique** : `git diff` du lot — aucun fichier `_shared/` ni
   `supabase/` modifié ; `npx tsc -b` exit 0 ; vitest complet (rouges
   étrangers : prouve l'antériorité par worktree détaché) ; suite Deno
   inchangée verte.
2. **Structure** : les tests de câblage existants tiennent
   (`setupDraftWiring` exige toujours `<PlanResult` dans la preview) ;
   `PlanGrid` et le détail lisent la même source (`groups`) — mute
   `groupByDay` pour voir les DEUX vues bouger ensemble.
3. **Navigateur** (fixture avec plan publié, persona mdp `1234567`,
   320 px ET 1280 px, mesures `document.scrollWidth`, captures à scroll 0) :
   - `/app/plan` : la vue jour rend sessions + courses + plats du jour ;
     le clic sur un `<th>` de la grille filtre ; « Toute la semaine »
     restaure ; le jour « aujourd'hui » est marqué par la forme.
   - la preview : depuis `/app/plan` (carte « Voir un aperçu ») ou
     `/app/setup` — même corps de plan par jour, `today = startsOn`.
   - `/app/household` avec un persona **secondaire** : la liste plate est
     devenue par-jour, et ne montre toujours ni ingrédients ni pourquoi.
4. **Cohérence** (§2.4) : C1, C2, C6, C8 sur le plan de la fixture — en
   particulier : chaque session s'affiche sur SON jour ; chaque vague tombe
   sur SA date convertie par `windowDates` ; le groupe `day: null` visible ;
   une semaine commencée en milieu de semaine s'ordonne par le plan.
5. **i18n** : chaque clé neuve existe dans les deux packs ; aucune clé hors
   namespace de page (le DEV throw le dirait) ; pas de `t(...)` au niveau
   module.
6. **Mutations** : masque le rail de jours → un test tombe ; débranche la
   session du jour → un test tombe ; fais pointer la vague sur le mauvais
   jour (casse la jointure jeton→date) → un test tombe.

Rapport horodaté : prouvé / non prouvé / défauts trouvés et leur sort.

---

# LOT 2 — Le commentaire de préparation du jour J (P2)

## Prompt de l'agent 2A — bâtisseur

Chaque plat doit porter, **toujours**, un commentaire de préparation du jour
J : ce qu'on fait le jour même pour avoir l'assiette — reprise du
déjà-cuisiné, réchauffage dit explicitement, cuisine minute, ou « rien à
préparer » — et le **temps du jour J** en minutes. La matière existe à
moitié : `dish.method` porte déjà « Before serving: … » quand le plat vient
d'un lot, et `uses`/`sources` disent d'où il vient. Ce qui manque : la
**garantie** (toujours présent), la **structure** (un jeton fermé, pas du
texte à deviner), et le **temps du jour J** (aujourd'hui seuls
`active_minutes`/`total_minutes` existent, et ils appartiennent aux
préparations/sessions, PAS au plat).

### Le schéma — déclaré par le modèle, validé fermé, compté

Ajoute à chaque plat :

```
same_day: {
  kind: "none" | "reheat_only" | "assemble" | "cook_fresh",
  minutes: number   // entier ≥ 0, le temps du geste du jour J
}
```

- `kind` est un **jeton fermé** (patron `for_member_id` : déclaré par le
  modèle, validé contre la liste — le validateur existant est
  `meal_generation.ts:2958-2970` —, jamais déduit par matcher). C'est lui
  qui garantit que « réchauffer » est DIT : le front le rend en libellé, le
  texte libre de `method` reste la consigne détaillée.
- Un `same_day` invalide ou absent **ne rejette pas le plat** (posture
  `for_member_id`, `:2953`) : il est compté.
- **Compteur** dans `generated_from` :
  `same_day = { dishes: N, declared: M, invalid: K }`. C'est la première
  chose que E regardera au run réel.
- Où ça se code : boucle de parse des plats `meal_generation.ts:2615`, type
  `GeneratedDish:462-500`, payload `mealDishesPayload:3488` — et le champ
  s'écrit **même à `null`** (posture `member_id`, `:3501-3512`). Types front
  dans `api/mealGeneration.ts` (`GeneratedDish:258`).
- Le fait mesuré qui justifie le lot : **aucun temps n'existe au niveau du
  plat** — `active_minutes`/`total_minutes` appartiennent aux préparations
  (`:554-555`) et aux sessions (`:588`) ; un plat d'assemblage frais n'a
  aujourd'hui aucun temps nulle part.

### Le prompt

- Le contrat du `method` de plat existe déjà, mot pour mot
  (`meal_generation.ts:1182-1183` : *« its method is what you do at that
  meal: "reheat a portion, add the salad and the lemon" »*) et la section
  des temps aussi (`:1231-1245`). Ce lot AJOUTE : le schéma `same_day` dans
  le bloc `== OUTPUT JSON SCHEMA ==` (`:1298-1340`) et une consigne courte —
  `same_day.minutes` = le temps du geste du jour J, PAS celui de la session ;
  `kind` dit la nature du geste ; un plat sans reprise le dit.
- ⚠️ En touchant ce bloc, corrige le défaut mesuré : `"uses"` y est déclaré
  **deux fois** (`:1312` et `:1314`). C'est dans le périmètre — tu bumpes de
  toute façon.
- **Bump** `MEAL_PROMPT_VERSION` (aujourd'hui `meal.en.v9_cooking_shape`,
  `:751` — population : toutes les lanes voient la consigne, c'est le bon
  axe). `HOUSEHOLD_PROMPT_VERSION` (`v12_whose_dish_is_it`,
  `household_meal_generation.ts:317`) ne bouge pas si l'enveloppe foyer ne
  change pas d'un octet — test byte-identique. N'oublie pas
  `MEAL_TOKEN_FIELDS` (`:1377-1390`) : `same_day.kind` est un **jeton**,
  jamais traduit — la liste des champs traduisibles/jetons doit le dire.
- Cohérence douce, comptée jamais rejetée : `reheat_only` avec `uses` vide,
  ou `none` avec des `uses`, sont des `issues` nommées.

### Le rendu

- `DishCard` : le commentaire de préparation passe **en tête de carte**
  (avant les ingrédients) — libellé du jeton (« À réchauffer », « À
  assembler — 10 min », « Cuisine minute — 15 min », « Rien à préparer ») +
  le texte de `method`. Dans la vue jour du LOT 1, ce bandeau est ce qu'on
  lit en premier sous le titre du plat.
- ⚠️ **La garde des durées existe et a un sens** :
  `lib/dishSession.int.test.ts` interdit `active_minutes`/`total_minutes`
  sur la carte d'un plat (ce sont des temps de SESSION — ils ont leur
  surface). `same_day.minutes` est un temps du PLAT : nomme-le distinctement,
  et mets à jour l'en-tête de la règle recopiée dans les fichiers concernés
  pour que la distinction survive (la règle interdit toujours les temps de
  session sur la carte).
- i18n : `meals.same_day.*` dans les deux packs (non commités, listés).

### Interdits

Pas de matcher sur `method` pour deviner le réchauffage. Pas de rejet de plat
sur `same_day`. Pas de calorie ni de « pourquoi » corporel dans les libellés.
Migration : uniquement si le stockage l'exige vraiment (le plan est du jsonb —
a priori **aucune migration**).

### Livrables

Schéma + parseur + compteur + prompt (bumps + tests byte-identiques), rendu
`DishCard`/`PlanDayBlock`, tests Deno et vitest, mutations (garde de liste
fermée cassée → rouge ; compteur débranché → rouge), rapport horodaté avec la
requête SQL du compteur pour E.

## Prompt de l'agent 2B — vérificateur

1. **Backend** : suite Deno verte ; le parseur accepte les quatre jetons et
   compte l'invalide sans rejeter (mute : fais rejeter un plat sur
   `same_day` invalide → un test doit tomber) ; les compteurs s'archivent ;
   la lane individuelle et la lane foyer rendent le bloc (test des deux) ;
   les prompts non concernés sont byte-identiques ; les versions ont bougé du
   bon axe et d'un seul cran.
2. **Frontend** : `tsc -b`, vitest ; la carte rend les quatre états (fixture
   par état) ; la garde anti-durées-de-session tient TOUJOURS (mute : remonte
   `active_minutes` sur la carte → rouge) ; les deux langues rendent les
   libellés.
3. **Navigateur** : sur la fixture, chaque plat du jour porte son bandeau ;
   un plat `reheat_only` dit le réchauffage ; un plat de zéro dit la cuisine
   minute ; 320/1280 px sans débordement.
4. **Cohérence** : C3 en entier ; C2 inchangé ; C8 (preview = validé, le
   bandeau apparaît dans les deux).
5. **Run réel si le runtime est vivant** (sinon : consigné rouge + requête
   laissée à E) : une génération foyer ET une individuelle ; mesure
   `same_day.declared / dishes` ; si le modèle ignore la consigne, c'est un
   résultat, pas un échec du lot — consigne-le et propose le resserrage de
   prompt à 2A.

---

# LOT 3 — La séparation par personne dans la vue jour (P3)

## Prompt de l'agent 3A — bâtisseur

Quand, au même moment d'un même jour, la table et une bouche (ou deux
bouches) ont des plats **différents**, la vue jour doit séparer **nettement**
ce qu'il y a à préparer pour chacun. Les fondations existent :
`dish.member_id` (lot C du 15/08), `member_portions[].preparation_shares`,
`buildPersonWeek`/`buildPlanByPerson` qui savent déjà attribuer.

### Le dessin

1. Dans `PlanDayBlock` (LOT 1), groupe les plats du jour **par moment**
   (l'ordre des slots existe — `EATING_OCCASIONS`). Un moment rend :
   - le **plat commun** d'abord, sans étiquette de personne quand il n'y a
     qu'un plat (le cas majoritaire ne paie rien) ;
   - s'il y a un plat dédié : deux sous-blocs à séparation visible —
     « Pour la table » / « Pour {prénom} » — chacun avec son plat complet
     (bandeau jour J du LOT 2 compris). Le prénom vient de la ligne membre
     (F5) via les données déjà chargées (`portions` /
     `HouseholdMealView`) — jamais du titre du plat, jamais d'un matcher.
2. Les **parts** au plus près du geste : sous chaque plat commun, la ligne
   par bouche qui diffère (`preparation_shares` jointes par
   `preparation_id` — le travail de `PlanByPerson` ; réutilise
   `planByPersonModel`, n'invente pas une seconde jointure). Deux bouches
   sans divergence = pas de lignes (le silence est voulu — pas de « comme la
   table » répété).
3. **Gardes intactes** : la décomposition par personne complète reste
   `isOwner`-only et ≥ 2 bouches (`PlanByPerson`) ; `MyShareCard` reste la
   seule « part d'un autre » d'un secondaire ; aucun champ objectif/poids ne
   peut entrer dans les vues (les tests structurels sur source existent —
   étends-les à tes fichiers neufs, commentaires retirés).
4. `PlanByPerson` reste (la vue de comparaison) ; ce lot rapproche la
   séparation **du jour et du geste**, il ne remplace pas la grille.

### Interdits

Pas de matcher de titre. Pas de duplication de la jointure
`preparation_shares` (une seule source : `planByPersonModel`). Pas
d'individualisation affirmée quand le moteur n'en fait pas (un plat commun ne
se répète pas par bouche).

### Livrables

Rendu par moment avec sous-blocs, tests (dont : titres identiques sans prénom
dans les fixtures — si un matcher revenait, ils tombent), i18n deux packs,
rapport horodaté.

## Prompt de l'agent 3B — vérificateur

1. **Statique** : diff sans fichier serveur ; `tsc -b` ; vitest ; tests
   structurels anti-`goal`/`kcal` étendus et verts ; mutation : retire
   `isOwner` d'une vue → rouge ; fais lire le prénom depuis le titre → rouge.
2. **Navigateur** (foyer de la fixture avec un plat dédié — au besoin,
   fabrique le plan en base en respectant le schéma, c'est du jsonb ; nomme-le
   dans le rapport) : au moment concerné, deux sous-blocs nets ; le plat
   dédié absent de la semaine des autres (`buildPersonWeek`) ; un secondaire
   ne voit pas la décomposition complète ; 320/1280 px.
3. **Cohérence** : C4 en entier sur la fixture ; C8 (preview rend la même
   séparation) ; compteur `dish_owners = {asked, attributed}` mesuré si un
   run réel est possible, sinon consigné rouge pour E.
4. **Les deux langues** : libellés « Pour la table » / « Pour {prénom} »
   dans les deux packs, prénom jamais traduit.

---

# LOT 4 — Grammes par personne et protocole des boîtes (P4)

## Prompt de l'agent 4A — bâtisseur

Le lot le plus lourd, et le plus surveillé. Décision produit actée (§0-P4) :
quantités **précises par personne**, pesée **une seule fois** — à la session
de cuisine, au moment de la mise en boîtes — puis le jour J on cite la boîte.
La frontière de sécurité ne bouge pas : grammes d'**aliment** oui, chiffres
de **corps** et calories non, et la phrase reste une instruction (F8).

### Le schéma — trois ajouts, tous déclarés/validés/comptés

1. **Les boîtes, sur la préparation** :

```
preparations[].boxes: [{
  id: string,               // "box_<prep>_<n>", unique dans le plan
  member_ids: string[],     // ≥ 1 — une boîte partagée liste plusieurs bouches
  grams: number             // entier > 0, grammes d'aliment PRÊT (cuit)
}]
```

   - `member_ids` validés contre le roster (liste fermée donnée au prompt —
     le patron existe : le supplément foyer donne déjà les ids exacts pour
     `member_portions` (`PORTION_SCHEMA_BLOCK`,
     `household_meal_generation.ts:571-582`) et pour `for_member_id`
     (`dishOwnerSchemaBlock:610-622`)).
   - Quand les parts ne divergent pas, UNE boîte partagée est légitime
     (`member_ids` multiples) ; quand elles divergent, une boîte par bouche.
     C'est le modèle qui compose, la divergence vient de l'enveloppe de
     portions déjà calculée — la consigne le dit, le compteur le mesure.
   - **Somme vérifiée au parseur, avec la nuance cru/cuit** : les
     `ingredients` d'une préparation portent `gramsRaw` (du CRU, recalculé —
     `meal_generation.ts:447-459`) ; les boîtes sont en grammes de PRÊT.
     Vérifie Σ grams des boîtes ≤ production quand le référentiel sait
     convertir (`state` + `food_composition`), et compte `unverifiable`
     sinon — le patron des trois cas comptés séparément est exactement celui
     de `gramsRaw`. Dépassement = `issue` nommée + compteur, **jamais** un
     rejet du plan entier.
   - Persistance : `mealPreparationsPayload` (`:3516`) gagne `boxes`,
     écrit **même vide** (posture `member_id`/`member_deltas`) ; les ids de
     boîtes sont des jetons ASCII (à déclarer dans `MEAL_TOKEN_FIELDS`,
     `:1377-1390`, comme `preparations[].id`).
2. **La consommation, sur le plat** : `dish.uses[]` gagne
   `box_id: string | null` — « ce plat prend la boîte `box_…` ». Validé
   contre les boîtes existantes ; une boîte citée doit venir d'une session
   d'un jour ≤ le jour du plat (C5).
3. **Le complément du jour, sur l'ingrédient** : les `ingredients` des plats
   doivent être en **grammes** (« 100 g dried pasta ») ou en **unités
   dénombrables** (« 1/2 lemon », « 10 basil leaves »). Le schéma structuré
   existe DÉJÀ — `amount`/`unit`/`state`, section
   `== SAY THE SAME QUANTITY TWICE ==` (`meal_generation.ts:1253-1281`), qui
   exige même les gras toujours chiffrés (seuls sel, poivre, herbes ont
   droit au « pinch »). Le travail est donc : (a) resserrer la consigne pour
   que la prose `quantity` d'un PLAT soit elle aussi grammée ou dénombrable,
   (b) le **compteur déterministe** : nombre d'ingrédients de plat avec
   `amount == null` hors exception sel/poivre/herbes —
   `unquantified_dish_ingredients: N` dans `generated_from` (aucun matcher :
   le champ est déjà structuré), (c) une **ceinture de vocabulaire flou**
   sur les seules `portion_note`/`preparation_shares` (liste littérale
   fermée, bilingue, patron `FORBIDDEN_PORTION_TERMS` : « handful »,
   « poignée », « generous portion », « grosse portion »…) — qui **compte**,
   ne rejette pas. ⚠️ Cicatrices : liste de littéraux (un ternaire rend un
   motif orphelin en silence) ; l'ordre des mots piège les explications ; ce
   n'est PAS un matcher d'aliments — des termes de QUANTITÉ, comme
   `FORBIDDEN_PORTION_TERMS` porte des termes de corps.
   La frontière est déjà écrite dans le prompt (`:1247-1251`) : *« A
   quantity says how much to buy or use; a target claims a measurement of
   the person. »* — les grammes par personne de P4 sont des **quantities**.

### Les portions dites aux gens

- `member_portions[].portion_note` peut désormais citer la boîte et son
  grammage (« Your box: 150 g of the chicken ») — c'est une instruction.
  `sanitizePortionNote` (`household_portions.ts:1308`) continue de mordre
  les termes de corps ; les grammes d'aliment passent (la frontière est
  déclarée `:1096-1102` : les unités nues restent hors liste EXPRÈS — ne les
  y mets pas, tu mettrais « des morceaux de 3 cm » en part standard).
- **Aucun « pourquoi »** : ni objectif, ni direction, ni corps à côté d'un
  gramme. Les tests des deux langues le tiennent.

### Le prompt

- Bloc de **mise en boîtes** dans l'enveloppe foyer (les boîtes par personne
  n'ont de sujet qu'à ≥ 2 bouches) : à chaque session, dire quoi peser et
  dans quelle boîte ; nommer les boîtes par prénom ; grammes de produit cuit.
  **Bump `HOUSEHOLD_PROMPT_VERSION`** (population foyer).
  ⚠️ **Deux positions sont load-bearing** dans l'enveloppe : l'ordre du
  `userSuffix` est une consigne (`household_meal_generation.ts:674-740` —
  les règles de maison restent EN DERNIER), et les trois dernières lignes de
  `buildPortionBrief` (`household_portions.ts:1070-1075`, « NEVER state a
  reason, a goal, a calorie count… ») doivent **rester les dernières** du
  brief — ton bloc s'insère AVANT elles, jamais après.
- Bloc **quantités du jour** dans le tronc (toutes les lanes) : grammes secs
  ou unités dénombrables, jamais de vague. **Bump `MEAL_PROMPT_VERSION`**.
- Tests byte-identiques pour chaque population non concernée (individuel sans
  boîtes ; foyer à 1 bouche… — reprends la table des populations des bumps
  précédents).
- La lane individuelle a-t-elle des boîtes ? **Oui, sans `member_ids`
  multiples** (une personne, ses boîtes) — même schéma, `member_ids` = [la
  personne]. Un seul moteur, pas deux formes.

### Le rendu

- **`CookingSessions.tsx`** (et le bloc session du jour du LOT 1) : sous
  chaque préparation, la table de mise en boîtes — « Boîte {prénoms} —
  {grams} g » — c'est l'instruction de pesée unique. Corrige au passage le
  pluriel mort (« — 1 servings », défaut connu).
- **`DishCard`** : quand `uses[].box_id` existe, la ligne de reprise devient
  « Boîte {prénom} — {grams} g » (jointure par id, jamais par titre).
- **`MyShareCard` / vue par personne** : la part d'une bouche cite SA boîte.
- Qui voit les grammes des autres : le **maître** (il cuisine et remplit les
  boîtes) et la table (la note est déjà lue à voix haute — le produit
  l'assume, F7/F8 gardent le « pourquoi » muet). Aucun affichage nouveau côté
  secondaire au-delà de sa part + ce que `HouseholdDishView` montre déjà.

### Interdits

Pas de calories, jamais. Pas de conversion grammes→corps. Pas de matcher
d'aliments. Pas de rejet de plan sur une somme fausse (compter, nommer,
laisser E décider de durcir). Pas de seconde définition des vagues ou des
enveloppes. `signing_keys`, migrations, deploy : règles §2.2.

### Livrables

Schéma + parseur + sommes + ceinture + compteurs, prompts (2 bumps + tests),
rendu sessions/plats/parts, tests Deno + vitest + mutations (somme désarmée →
rouge ; `box_id` orphelin accepté → rouge ; ceinture unilingue → rouge),
rapport horodaté avec les requêtes SQL des compteurs.

## Prompt de l'agent 4B — vérificateur

1. **Backend** : suite Deno ; parseur — boîtes valides accueillies, boîte
   orpheline/`member_id` inconnu/somme > production **comptés** sans rejet ;
   mutations rejouées ; versions bumpées du bon axe ; prompts des populations
   non concernées byte-identiques (compare les modules de HEAD à l'arbre de
   travail, le patron existe).
2. **Cohérence** : C5 en entier sur un plan fabriqué qui VIOLE chaque règle
   une fois (somme dépassée, boîte future, quantité vague) — chaque violation
   doit laisser sa trace nommée ; puis sur un plan sain — zéro `issue`.
3. **Frontend** : `tsc -b`, vitest ; la session rend la table des boîtes ;
   le plat cite sa boîte par id (mute la jointure vers le titre → rouge) ;
   « 1 servings » corrigé ; deux langues ; 320/1280 px.
4. **Ceintures** : `FORBIDDEN_PORTION_TERMS` intact ; la ceinture de flou
   mord dans les deux langues ET a son cas passant (« 100 g » passe,
   « a handful » compte) ; aucun « pourquoi » à côté d'un gramme dans les
   notes des fixtures.
5. **Run réel si possible** (sinon consigné rouge pour E) : une génération
   foyer à objectifs divergents — mesure : boîtes déclarées / préparations,
   divergence des grammes entre bouches, `unquantified_dish_ingredients`,
   la ceinture de flou des notes, les sommes. Le modèle qui ignore la
   consigne est un RÉSULTAT à consigner avec les octets, pas à maquiller.

---

# LOT E — La cohérence de bout en bout

## Prompt de l'agent E

Tu es le dernier. Les quatre paires sont vertes ; ton travail est ce
qu'aucune n'a pu faire seule : **la chaîne entière, en réel, dans les deux
surfaces**.

1. **Prépare le poste** : vérifie le runtime edge (500/503 partout +
   PostgREST OK = éteint). S'il faut redémarrer la pile, c'est un geste
   humain (§2.2 n°11) : donne la commande, attends. Script Kong avant les
   runs. Déconnexion/reconnexion après restart.
2. **Deux runs réels** : (a) un foyer ≥ 3 bouches à objectifs divergents,
   avec un plat dédié attendu ; (b) un compte individuel. Garde les ids de
   plans.
3. **Les compteurs, en SQL** (les requêtes sont dans les rapports 2A/4A +
   `PLAN-BATAILLE-RAPPORT.md §7.2`) : `same_day`, `dish_owners`, boîtes,
   `unquantified_dish_ingredients`, la ceinture de flou, les sommes. Chaque
   compteur à zéro là où on attendait du signal est un défaut à remonter à
   la paire concernée — pas à toi de le réparer en silence.
4. **La grille C1→C8 entière** (§2.4) sur le plan foyer réel — en SQL et à
   l'écran.
5. **Le navigateur, le parcours entier** : inscription/setup → aperçu par
   jour → « Refaire avec ça » → adopter → `/app/plan` vue jour (sessions,
   courses, plats, bandeaux jour J, séparation par personne, boîtes) →
   `/app/household` en secondaire → mobile 320 px. Captures à scroll 0,
   mesures de débordement.
6. **Rapport final** : ce qui est prouvé, ce qui reste rouge, les trous
   nommés avec leur fichier:ligne, et les décisions produit qui restent à
   l'humain (il y en aura — par exemple : durcir ou non les sommes de boîtes
   en refus). Ne referme aucun trou en silence.

---

## Annexe — ce que ce chantier ne fait PAS

- Il ne touche pas à la fusion, à la prise de main, à la présence
  (`household_merge.ts`, `household_hand.ts`) — il les LIT.
- Il ne touche pas au paywall, à Stripe, au gel 402.
- Il ne branche pas `keelGenerationModel()` sur la lane foyer (chantier à
  part, nommé, connu).
- Il ne crée ni mode cuisine, ni PDF, ni liste de courses partageable — ce
  sont des surfaces, pas ce modèle-ci (README foyer, « Hors périmètre »).
- Il ne réécrit pas la stratégie de courses (FF-005 `single_run` reste une
  fiche spécifiée, pas ce lot).
