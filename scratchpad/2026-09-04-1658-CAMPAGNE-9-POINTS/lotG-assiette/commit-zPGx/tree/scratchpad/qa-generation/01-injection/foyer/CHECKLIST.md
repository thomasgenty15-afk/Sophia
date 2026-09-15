# Lane FOYER — inventaire d'injection, **COCHÉ SUR PROMPT RÉEL** (agent 1B)

**Date** : 2026-08-18 · **Branche** : `ff-001-quotidien-du-coach` · **Racine** : `/Users/ahmedamara/Dev/Sophia 2`

> ✅ **CE DOCUMENT EST MAINTENANT UN VERDICT** pour la partie §0 ci-dessous. L'inventaire
> d'origine (§1 à §7) est **conservé tel quel** — c'est la lecture de code qui a servi de
> plan de mesure. Chaque ligne est reprise en §0 avec **la preuve tirée du prompt
> réellement envoyé**, jamais de la lecture de code.
>
> ⚠️ **Correction au préambule d'origine** : la lane foyer **ne replie aucun modèle**.
> `keelGenerationModel()` n'est pas appelé par `generate-household-meal-v1` ; les cinq runs
> de ce lot sont tous partis sur `gpt-5.4-mini` **directement** — le modèle du chat.
> Aucune bascule, aucune expiration à 4 min. Le prompt foyer est donc bâti pour une
> composition et servi au modèle de conversation ; ce n'est pas mon chantier de le changer,
> mais c'est écrit ici pour que personne ne relise ces latences autrement.

---

## §0. LE VERDICT — 46 lignes, mesurées

**Run de référence** : `ac79471a-0ac9-4bfc-85eb-bc34ce99997b` (itération 03, après
correctifs) · `generate-household-meal-v1` · `gpt-5.4-mini` · HTTP 200 en 36 s ·
système 15 486 car. / utilisateur 15 105 car. · `*_truncated = false` ·
`written_chars == chars == compteur indépendant de gemini.ts`, vérifié à la main des deux
côtés. Runs antérieurs : `35463ae7…` (it. 01, `one_session`, prompt seul),
`ebeb0828…` (it. 02, première sortie).
Les trois fichiers de chaque run sont dans `iterations/01..03/`.

**Le foyer mesuré** — trois bouches volontairement divergentes, montées **entièrement par
les écrans** (`/app/setup` §1→§4, `/app/plan`), jamais par SQL :

| | Sacha (maître, compte) | Livia (bouche nue, adulte) | Tino (bouche nue, **mineur, 10 ans**) |
|---|---|---|---|
| direction | `fat_loss` | `muscle_gain` | aucune |
| corps saisi | 178/88/male/sedentary | 165/54/female/trains_hard | 138/33/male/on_feet |
| sécurité | **allergie arachide** | dégoût **champignons** + **pescatarian** | — |
| habitude / note | petit-déj + note | goûter + note | note seule |

**Compte : 26 cochées ✅ · 4 partielles ⚠️ · 12 absentes motivées ❌ · 4 non exerçables ⛔ = 46.**

Détail : ✅ = 1, 2, 7, 10, 11, 12, 14, 15, 16, 19, 21, 25, 28, 29, 30, 31, 32, 33, 34, 35,
37, 38, 40, 44, 45, 46 · ⚠️ = 3, 4, 5, 13 · ❌ = 6, 8, 9, 17, 18, 20, 23, 26, 27, 36, 39,
43 · ⛔ = 22, 24, 41, 42.

**Deux de ces 26 n'étaient PAS cochées à l'arrivée** — #1 (prénom du maître) et #19 (repas
pris dehors) — et le sont après les correctifs **D-1** et **D-2**. **Aucune case n'est
cochée sur la présence d'un mot** : chaque ligne porte la valeur que j'ai tapée à l'écran.

### 0.1 — Par bouche (24 lignes)

| # | Ligne | Verdict | La preuve, dans le prompt réel |
|---|---|---|---|
| 1 | Prénom | ✅ **après correctif** | `- Sacha = 5e61b4af…` / `- Livia = b9415944…` / `- Tino = 0c3e9590…`, puis chaque ligne du brief. **Avant correctif : ❌ pour le maître** — « Sacha » tapé, `Student` servi, 6 fois. Voir **D-1**. |
| 2 | Date de naissance → minorité | ✅ conséquence attachée, date jamais dite | `1986`/`1994`/`2016` → **0 occurrence**. Seule la conséquence est écrite, sur SA ligne : Tino porte `child-size share of the same dish` et **aucun crochet de corps** ; Sacha porte `age band 30 to 44`. |
| 3 | Taille (cm) | ⚠️ **compte seulement** | `[height 178 cm; …]` sur la ligne de Sacha. Livia (165 cm **saisis à l'écran**) : rien. Motivé, voir **D-3**. |
| 4 | Poids (kg) | ⚠️ **compte seulement** | `weight 88 kg, measured week of 2026-08-17`, ligne de Sacha. Livia (54 kg saisis) : rien. |
| 5 | Sexe | ⚠️ **compte seulement** | `gender male`, ligne de Sacha. Livia (female saisi) : rien. |
| 6 | Niveau d'activité | ❌ motivé | `sedentary` / `trains_hard` / `on_feet` → **0**. Moteur d'énergie uniquement (`EDGE:1874-1879`). Conforme à l'inventaire. |
| 7 | Direction (objectif) | ✅ attachée, traduite | `- Sacha: generous vegetables, full protein share, smaller starch share` · `- Livia: larger protein and starch share, same vegetables` · `- Tino: child-size share of the same dish`. Aucun jeton `fat_loss` sur une ligne de bouche. |
| 8 | **Poids visé** | ❌ **R-2 CONFIRMÉE** | `80` n'apparaît qu'une fois, dans l'exemple figé `80 g of dry pasta`. Aucun lecteur. Coût : voir **D-5**. |
| 9 | **Rythme (kg/sem)** | ❌ confirmé, par conception | `0.3` → **0**. Agit sur les grammes des boîtes **après** la réponse (`EDGE:4409-4410`), jamais dans le prompt. |
| 10 | Moments + taille | ✅ attachés | `eats at breakfast (small for them), lunch (medium for them), dinner (large for them) only` (Sacha) · `lunch (large for them), snack_pm, dinner (medium for them)` (Livia) · `breakfast, lunch, snack_pm, dinner` (Tino). |
| 11 | Habitude par créneau | ✅ attachée | `has their own at breakfast: black coffee and two boiled eggs` (Sacha) · `has their own at the afternoon snack: a bowl of skyr with walnuts` (Livia). |
| 12 | Note libre durable | ✅ attachée | `usually: eats standing up on Tuesdays` · `usually: will not touch coriander, ever` · `usually: only eats vegetables when they are not touching each other`. ⚠️ Non isolable : Tino n'a QUE la note, mais la phrase de conséquence des habitudes est levée par Sacha et Livia — l'avertissement `HP:1093-1097` reste **non infirmé**, pas confirmé. |
| 13 | **Allergies** | ⚠️ valeur ✅ / **bouche ❌ — R-6 CONFIRMÉE** | `- peanut — allergy, severity=medical (declared by student)` sous `=== THIS STUDENT'S HARD CONSTRAINTS ===`, **au singulier pour une tablée de trois**, sans `member_id`. Mesure de sortie en **D-6**. |
| 14 | Régime alimentaire | ✅ partiel, comme documenté | `This student is PESCATARIAN: … This is the line of: Livia.` puis `Sacha, Livia cannot be served from that shared dish`. L'`omnivore` déclaré de Sacha n'est **jamais nommé** — exactement la limite annoncée. |
| 15 | Dégoûts | ✅ attaché | `HOUSE RULES … - Livia: never serve mushrooms`. |
| 16 | Apport fixe | ✅ attaché, préfixé | `- Sacha: the evening tub (32 g), every day`. ⚠️ impossible pour une bouche nue (**R-8**, vérifié à l'écran : le bloc est masqué). |
| 17 | `work_lunch.at_work` | ❌ | Aucun bloc. N'atteint le prompt qu'indirectement, par #19. |
| 18 | **`work_lunch.mode`** | ❌ **R-3 CONFIRMÉE** pour `lunchbox` | Foyer d'it. 01/02 : Livia en **gamelle sans micro-ondes** ⇒ **rien** dans le prompt. Pas un mot sur un repas transportable ou bon froid. `outside` n'agit que par #19. Et il n'était **pas écrivable** avant **D-2**. |
| 19 | Repas pris dehors | ✅ **après correctif D-2** | `== A MEAL EATEN OUT IS NOT AN ABSENCE == … - Livia: Tuesday lunch, Wednesday lunch, Thursday lunch, Friday lunch, Monday lunch`. **Avant : ligne sans aucun écrivain vivant** (la porte refusait, la grille 3 états est morte — R-10). |
| 20 | **Micro-ondes au bureau** | ❌ **R-3 CONFIRMÉE** | Les deux seules occurrences de `microwave` viennent de la cuisine de la maison (`This household does not have: a microwave…`). Le micro-ondes du bureau, répondu à l'écran, n'atteint rien. |
| 21 | Absences | ✅ attachée | `- Saturday, dinner: Tino not eating here -- cook for 2 instead of 3.` |
| 22 | Préférences durables (voix) | ⛔ non exerçable | Produites par le memorizer depuis la conversation d'un titulaire ; aucune de mes bouches n'en a. Le bloc est conditionnel (`HMG:1273`) et absent. **Non infirmé.** |
| 23 | Rôle | ❌ par conception | Aucun bloc, conforme. |
| 24 | Plan personnel vivant | ⛔ non exerçable | Demande un secondaire AVEC compte et un plan à lui. Mes deux secondaires sont des bouches nues. |

### 0.2 — Au niveau du foyer (22 lignes)

| # | Ligne | Verdict | La preuve |
|---|---|---|---|
| 25 | Composition | ✅ | `== THE HOUSEHOLD == / Exact ids to use…` puis les 3 lignes nominatives. |
| 26 | Nom du foyer | ❌ | `Home` → 0. Aucun bloc, conforme. |
| 27 | Membre référent | ❌ **R-9 CONFIRMÉE** | `households.reference_member_id` est `null` sur un foyer neuf monté par les écrans, et aucun écran ne l'écrit. Aucun bloc. |
| 28 | Mode de cuisson | ✅ | it. 03 (`one_dish`) : `Cook ONE set of preparations for everyone. Do NOT propose separate dishes.` · it. 01 (`one_session`, 2 divergents) : `SOME of the people below cannot be served from it …` + `== A DISH OF THEIR OWN ==` + `== WHOSE DISH IS IT ==`. Le plafond **mord** (it. 02/03) et **ne fabrique rien**. |
| 29 | Budget | ✅ | `budget for this plan: 137, in the local currency of their country.` |
| 30 | Temps / session | ✅ | `time per cooking session: about 60 minutes.` |
| 31 | Jours de cuisine | ✅ | `they can only cook on: mon, wed, sat.` |
| 32 | Moyens de cuisson | ✅ | `== THIS KITCHEN == / This household does not have: a microwave, an air fryer, a pressure cooker, a blender or food processor.` — le bloc conditionnel de R-13 **se déclenche bien** dès qu'un outil est décoché. |
| 33 | Difficulté de recette | ✅ | `recipe level they want: keen`. (Absent en it. 01-02 parce que non saisi, pas parce que rompu.) |
| 34 | Variété acceptée | ✅ | `repetition they accept: varied`. |
| 35 | Moments de la maison | ✅ union vérifiée | `every day of the stretch needs breakfast, lunch, an afternoon bite and dinner` — l'`afternoon bite` ne vient QUE de Livia et Tino ; le maître ne l'a pas coché. L'union `EDGE:2474-2501` est prouvée. |
| 36 | **Propriétés de jour** | ❌ **R-5 CONFIRMÉE** | `batch_cook` / `leftovers` → 0. Ni écran, ni lecteur (`EDGE:3410` en dur). |
| 37 | Envie de la semaine | ✅ (anonyme par conception) | `WHAT THIS HOUSEHOLD ASKED FOR THIS WEEK … "the house is craving something with aubergine on Saturday"`. Sortie it. 02 : 15 occurrences d'`aubergine`. |
| 38 | Contraintes libres de la semaine | ✅ (anonyme) | `what is going on for them RIGHT NOW: Livia is on a late shift on Wednesday and nobody is home before nine`. Sortie : `late shift` cité. |
| 39 | **« Ce dont ils ont envie »** | ❌ **R-1 CONFIRMÉE** | `brussels` → **0**, `dahl` → **0**, dans le prompt **et** dans la sortie, sur trois runs. Le bloc `-- THIS TIME --` existe mais ne porte que le contexte : `what they feel like eating THIS TIME:` n'est **jamais** servi. ⚠️ **Arbitrage produit, remonté, non corrigé** — voir **D-4**. |
| 40 | Fenêtre du plan | ✅ | `days to fill, in this order: tue, wed, thu, fri, sat, sun, mon`. |
| 41 | Note de reprise d'aperçu | ⛔ non exercée | Aucun aperçu (`intent: draft`) dans ce lot. |
| 42 | Demande sur ma part | ⛔ non exerçable | `MyShareCard` demande un secondaire AVEC compte. **R-7 non infirmée.** |
| 43 | Garde-manger | ❌ assumé | `pantry: []` en dur ; le foyer est `to_shop`. |
| 44 | Objectif + situation du maître | ✅ (anonyme, « la doctrine du repas ») | `goal: fat_loss` + `their situation, in their words: QA fixture cohort f1b`. |
| 45 | Fuseau / pays / langue | ✅ | `today's date: 2026-08-18` · `they shop in: GB` · `CONTENT_LANGUAGE: … English (en-GB)`. |
| 46 | Nombre de parts | ✅ | `people at the table: 3`. |

### 0.3 — Les décisions et les coûts

**D-1 · Le prénom du maître n'atteignait pas le prompt — CORRIGÉ.**
`/app/setup` §2 rend un champ « FIRST NAME — *How the plan names your serving* » qui
écrivait `profiles.full_name`, alors que le roster (`keel_household_roster_for`) ne rend
que `household_members.first_name`. `keel_household_create` n'y recopie le premier mot du
`full_name` **qu'une fois** — arbitrage écrit dans la RPC : « s'il renomme son profil plus
tard, son prénom au foyer ne suit pas ; il le change au foyer ». La porte
(`keel_household_set_member_name`) existait et n'était appelée que par `/app/household`.
Correctif : `SetupPage.tsx` `saveSelf()` l'appelle. Preuve : `Student` ×6 → `Sacha` ×4
dans le prompt, ×21 dans la sortie.

**D-2 · « Elle mange dehors le midi » n'était écrivable par aucun écran — CORRIGÉ.**
`workLunchPayload` émettait `microwave: null` ; la RPC refuse tout `microwave` dont le
`jsonb_typeof` n'est pas `boolean`, et celui d'un `null` JSON vaut `'null'`. Trois branches
sur quatre rendaient `bad_work_lunch`, dont **`mode='outside'`, le seul mode qui produise
un effet**. Correctif : ne pas émettre la clé. Le test qui figeait l'ancienne forme est
corrigé et doublé d'un test sur la **présence des clés** + un cas passant.

**D-3 · Le corps d'une bouche SANS COMPTE n'entre pas dans le brief — NON CORRIGÉ, motivé.**
Ce n'est pas seulement le mineur : Livia, adulte, 165 cm / 54 kg / female **saisis par
l'écran**, n'a aucun crochet. `EDGE:1828-1838` sépare explicitement `bodies` (comptes →
le brief, ce que le modèle LIT) de `lineBodies` (tout le monde → le moteur d'énergie).
`HP:983-990` en donne la raison, et elle tient : « une bouche sans compte, une lecture
ratée, un compte sous plancher TCA et un compte qui n'a rien saisi produisent TOUS la même
ligne … un membre marqué "on ne vous dira rien de lui" est un membre désigné ». Donner son
corps à Livia ferait de l'absence de crochets **la signature du mineur**.
**Coût mesuré, à assumer sciemment** : sur trois bouches, le modèle dimensionne **deux
assiettes sur trois à l'aveugle**, sous un prompt qui lui dit que ces faits sont là « for
ONE thing: the SIZE of a portion ». Dans un foyer réel, les bouches nues sont la majorité.
**Arbitrage humain, pas QA.**

**D-4 · R-1 est un arbitrage produit — REMONTÉ, NON CORRIGÉ.**
Le textarea `meals-preferences` est bien rendu sans garde de lane (`MealBuilder.tsx:1223`,
contre `composingForHousehold` sur le champ d'envie juste en dessous) et le maître le
remplit ; la branche foyer du submit ne le passe pas ; `EDGE:3442` lit `body.preferences`
et reçoit toujours `null`. Mais `planDraft.ts:461-465` écrit noir sur blanc : « **LE CORPS
DE LA LANE FOYER EST PLUS ÉTROIT, et c'est le contrat de la fonction** … Lui envoyer les
champs de la lane individuelle ne les ferait pas lire, mais laisserait croire ici qu'ils
comptent. » Deux réparations opposées existent — **retirer le champ de l'écran** (respecte
le contrat) ou **le transmettre** (le serveur sait déjà le lire) — et le choix est un
choix de produit. ⚠️ Une seule remarque factuelle : la justification écrite du contrat
(« ne les ferait pas lire ») est **fausse**, `EDGE:3442` les lirait.

**D-5 · Poids visé, rythme, gamelle, micro-ondes, propriétés de jour : collectés, sans
lecteur — NON CORRIGÉS.** Leur réparation n'est pas un branchement mais l'ajout d'un
lecteur dans le générateur, c'est-à-dire une décision de composition. Coût : cinq champs
qu'un utilisateur remplit et qui ne changent rien à son plan, dont **un curseur de rythme
borné sur un poids visé que rien ne lit**.

**D-6 · L'allergie détachée — MESURÉE, REMONTÉE, NON TRANCHÉE.**
Sortie de l'itération 02 : `peanut` → 0, `allerg` → 0, et **aucun aliment de la famille
arachide** dans les 27 lignes de courses. Le modèle **n'a ni commenté ni justifié** —
il a exclu pour tout le foyer. La direction sûre tient, mais **par sur-application**, et
rien dans la sortie ne prouve que la garde a mordu plutôt qu'un plat de poisson qui n'en
contenait de toute façon pas. Le fichier documente l'anonymisation comme un choix
(`household_safety.ts:155-160`) ; contraste dans le même prompt : `- Livia: never serve
mushrooms`.

**D-7 · Le corps d'un mineur ne s'énonce jamais — ✅ TENU, prompt ET sortie.**
Ligne de Tino sans crochets. Sortie : `138` → 0, `cm` → 0, `weight` → 0, `BMI` → 0,
`kcal` → 0, `calorie` → 0 ; les seuls `kg` sont `1.5 kg` de poisson, une quantité
d'aliment. **Rien à remonter en bloquant.**

**D-8 · Hors périmètre, à faire suivre.**
① `MealBuilder` **casse toute la page** (ErrorBoundary, « Une erreur est survenue ») dès
que le champ de date de fin est vidé une fraction de seconde — `[keel/dates] expected a
yyyy-mm-dd local date, got ""` levé pendant le rendu. La fenêtre du plan est donc
**inéditable au clavier**. `MealBuilder.tsx` est **partagé avec la lane solo** ⇒ appartient
à l'agent 1A. ② `member_portions` sans grammes en itération 03 alors que le prompt l'exige
deux fois : désobéissance du modèle, pas défaut d'injection — étapes ④/⑤.

**D-9 · Le poste.** Trois runs `one_session` sont morts en **502 Kong** avec
`attempt_start` seul en base : le conteneur `supabase_edge_runtime_Sophia_2` est **recréé
toutes les 2-3 min** par le `functions serve` d'une session voisine qui surveille
`supabase/functions/`. Ni le produit, ni le timeout Kong (patché à 600 s, revérifié).
Discriminant : `attempt_start` sans autre événement + 502 au navigateur.
Et : **un `request_id` foyer peut porter deux appels modèle**
(`generate-household-meal-v1.protein_anchor_retry`) — le vidage exige `--source`.

---

> Ce qui suit est l'inventaire d'origine (lecture de code), conservé intact comme plan de
> mesure. Ses « ruptures suspectées » sont désormais tranchées en §0.

---

Chemins **relatifs à la racine ci-dessus**. Abréviations :

| Sigle | Chemin |
|---|---|
| `EDGE` | `supabase/functions/generate-household-meal-v1/index.ts` (5 331 l.) |
| `HMG` | `supabase/functions/_shared/keel/household_meal_generation.ts` (1 356 l.) |
| `HP` | `supabase/functions/_shared/keel/household_portions.ts` (2 894 l.) |
| `MG` | `supabase/functions/_shared/keel/meal_generation.ts` (le TRONC, partagé avec la lane solo) |
| `S` / `U` | bloc du prompt **S**ystème / message **U**tilisateur |

Point de départ du prompt : `EDGE:3367` `buildMealPrompt(...)` (tronc) + `EDGE:3517`
`buildHouseholdPromptBlocks(...)` (enveloppe foyer), concaténés puis envoyés par
`generateWithGemini(...)` — `EDGE:3822`, `supabase/functions/_shared/gemini.ts:146`.

---

## 1. LA TABLE — 46 lignes

### 1.1 Ce qui est **PAR BOUCHE** (24 lignes)

| # | Information | Saisi — URL · fichier:ligne | Stocké — table.colonne | Lecteur vivant — fichier:ligne | Bloc de prompt (S/U) | Le prompt dit-il **de qui** ? |
|---|---|---|---|---|---|---|
| 1 | **Prénom** | `/app/setup` §2 `SetupPage.tsx:2918` (nouvelle bouche), `:2588` (maître) · `/app/household` `MouthFormDialog.tsx:407`, `HouseholdPage.tsx:875` | `household_members.first_name` (NOT NULL, 1–40 car., `20260810120000:123-126`) | `EDGE:1570` `displayName: String(r.first_name…) \|\| "Member"` | **U** — `== THE HOUSEHOLD ==` `HMG:1203` (`- Prénom = <member_id>`) puis chaque ligne du brief `HP:1099-1101` | ✅ **OUI** — c'est LA clé d'attache de toute la lane |
| 2 | **Date de naissance** → minorité | `/app/setup` `SetupPage.tsx:2942` / `:2605` / `:3255` · `/app/household` `MouthFormDialog.tsx:424` | `household_members.birth_date` **ou** `profiles.birth_date` (compte) | RPC `keel_household_member_age` (`20260812180000:119-142`, profil ⟶ fiche) → `roster.age_state` → `EDGE:1559` | **U, indirect uniquement** : gouverne `CHILD_DIRECTION` (`HP:447`) et le SILENCE du corps (`meal_body.ts:247`) | ⚠️ la date elle-même n'est **jamais** écrite ; seule sa conséquence l'est, sur la ligne de la bouche |
| 3 | **Taille (cm)** | `SetupPage.tsx:2958` / `:2619` / `:3319` · `MouthFormDialog.tsx:460` | `household_member_bodies.height_cm` (+ `profiles.height_cm` pour le maître) | ① `loadHouseholdMemberBodies` (`household_bodies.ts:111`, comptes seulement) ② `keel_household_bodies_for` → `EDGE:1850` `lineBodies` | **U** — `[height 178 cm; …]` entre crochets, `HP:1101` · ② **jamais dans le prompt** (moteur d'énergie seul, `EDGE:2358`) | ✅ OUI, entre crochets sur SA ligne — **et seulement pour un adulte** |
| 4 | **Poids (kg)** | idem #3 (`:2970` / `:2640` / `:3330`, `MouthFormDialog.tsx:472`) | `student_body_measures` (compte) · `household_member_bodies.weight_kg` (fiche) | idem #3 | **U** — `weight 78 kg, measured week of …` `meal_body.ts:260-264` | ✅ OUI, sur SA ligne |
| 5 | **Sexe** | `SetupPage.tsx:2983` / `:2669` / `:3342` · `MouthFormDialog.tsx:485` | `household_member_bodies.gender` / `profiles` | idem #3 | **U** — `gender male` `meal_body.ts:255` | ✅ OUI |
| 6 | **Niveau d'activité** | `SetupPage.tsx:3005` / `:2659` / `:3360` / `:3393` · `MouthFormDialog.tsx:548` | `household_member_bodies.activity_level` (+ `profiles.activity_level`) | `EDGE:1874-1879` → `EDGE:2336` `envelopeFor(...)` | ⛔ **AUCUN BLOC.** Purement moteur d'énergie | ❌ le prompt ne le voit jamais |
| 7 | **Direction (objectif)** | `SetupPage.tsx:3040` / `:2685` / `:3292` · `MouthFormDialog.tsx:582` | `household_members.goal` (sans compte) **ou** `student_goals.goal` (compte) — tranché en base, `20260814110000:218-224` | `EDGE:1556` → `servingDirectionFor` `HP:443-448` | **U** — la direction de service, sur SA ligne : `- Théo: larger protein and starch share, same vegetables` `HP:1041,1099` | ✅ OUI — mais **traduite en instruction de service**, jamais nommée « fat_loss » |
| 8 | **Poids visé (kg)** | `SetupPage.tsx:3068` / `:2723` · `MouthFormDialog.tsx:934` | `household_members.target_weight_kg` (`20260818100000:496`) · `student_goals.target_weight_kg` | ⛔ **AUCUN LECTEUR DANS LA GÉNÉRATION** (grep `target_weight_kg` sur `supabase/functions/` ⟶ `account-export-v1` + un commentaire d'exclusion `meal_body.ts:63`) | ⛔ **AUCUN** | ❌ **R-2** |
| 9 | **Rythme (kg/semaine)** | `MouthFormDialog.tsx:975` (slider) · `SetupPage.tsx:3068` / `:2723` | `household_members.target_pace_kg_per_week` · `student_goals.target_pace_kg_per_week` (`20260818190000`) | `EDGE:4430-4463` → `memberTargetFactor` `EDGE:4489` → `sizeBoxesFromTarget` `EDGE:4507` | ⛔ **AUCUN BLOC.** Change les **grammes des boîtes APRÈS la réponse du modèle** (`EDGE:4409-4410` : « Aucune ligne de prompt n'est ajoutée ») | ❌ le prompt ne le voit jamais |
| 10 | **Moments de repas (+ taille)** | `/app/setup` §3 `SetupPage.tsx:3913` (case) + `:3933` (pastilles) · `EatingRhythmCard.tsx:251,283` | `household_members.eating_rhythm` (sans compte) **ou** `student_goals.practical_constraints.eating_rhythm` (compte) — tranché `20260814110000:243-249` | `EDGE:1597-1599` `parseEatingRhythm` → `HP:1072-1078` | **U** — `— eats at breakfast (large for them) only`, + la conséquence dite UNE fois `HP:1141-1146` | ✅ OUI, sur SA ligne |
| 11 | **Habitude par créneau** (« ce qu'elle mange à la place ») | `/app/household` `HouseholdHabitsCard.tsx:229,251` · `MouthFormDialog.tsx:732` | `household_member_habits.slots` (`20260814100000`) | RPC `keel_household_habits_for` → `EDGE:1116-1127` → garde `gateMemberHabits` `EDGE:3534` → `HP:1091` | **U** — `— has their own at breakfast: une pomme` + `HABIT_CONSEQUENCE` `HP:1153` | ✅ OUI, sur SA ligne |
| 12 | **Note libre durable de la bouche** | `HouseholdHabitsCard.tsx:274` · `/app/setup` §3 `SetupPage.tsx:4059` | `household_member_habits.note` | `EDGE:1122-1126` → `EDGE:3536` → `habitNoteFragment` `HP:1098` | **U** — fragment sur SA ligne | ✅ OUI — ⚠️ **ne lève pas** `anyHabit` (`HP:1093-1097`), donc aucune phrase de conséquence |
| 13 | **Allergies** | `/app/household` `HouseholdPage.tsx:1902` (kind) + `:1914` (label) · `MouthFormDialog.tsx:770` | `household_member_allergies` (sans compte) **et** `student_safety_constraints` (compte) | `EDGE:2040-2058` (comptes, **fail-closed 503**) + `EDGE:2072-2088` `loadHouseholdAllergies` (bouches nues, **fail-closed 503**) | **U** — `=== THIS STUDENT'S HARD CONSTRAINTS ===` `safety_constraints.ts:313` | ❌ **NON** — `userId: ""`, aucun `member_id`, en-tête au **singulier** (`household_safety.ts:172-176`). Voir **R-6** |
| 14 | **Régime alimentaire** | `/app/setup` §3 `SetupPage.tsx:3863` · `/app/household` `HouseholdPage.tsx:1710` · `MouthFormDialog.tsx:846` | `household_members.diet` (sans compte) **ou** `student_safety_constraints.diet_ref` / `practical_constraints.diet_asked` (compte) — tranché `20260814110000:262-283` | `EDGE:1613` `memberRegime` → `strictestRegimeAt` → `EDGE:3586` `householdDietBlock` | **U** — `== WHAT THE SHARED DISH MUST RESPECT ==` `household_diet.ts:311-323` | ✅ **partiellement** — nomme qui porte la ligne la **plus stricte** (`heldBy`) et qui **diverge**. Un régime moins strict n'est **jamais nommé** |
| 15 | **Dégoûts / aliments refusés** | `/app/household` `HouseholdPage.tsx:1914` (kind=house rule) · `MouthFormDialog.tsx:1202` | `household_food_restrictions(member_id,label)` | `EDGE:1892-1905` (filtré sur `nameOf`, `EDGE:1900`) | **U, EN DERNIER** — `HOUSE RULES` `HMG:751-772,1302` | ✅ **OUI** — `- Léa: never serve Nutella` |
| 16 | **Apport fixe (« shaker »)** | `MouthFormDialog.tsx:1107-1139` (libellé, g/portion, protéines, kcal, créneau) | `student_goals.practical_constraints.fixed_intakes` — **clé sur `user_id`** | `EDGE:2722` `loadHouseholdFixedIntakes` → `EDGE:3386` `fixedIntakes` | **U** — `WHAT THEY ALREADY HAVE` (tronc, FF-051), libellé préfixé du prénom `household_fixed_intakes.ts:122-127` | ✅ OUI (préfixe prénom) — ⚠️ **impossible pour une bouche sans compte**. Voir **R-8** |
| 17 | **Déjeuner dehors — `at_work`** | `/app/setup` §3 `WorkLunchCard.tsx:220` | `household_members.work_lunch.at_work` | ⛔ aucun lecteur serveur direct | indirect, via #19 | — |
| 18 | **Déjeuner dehors — `mode`** | `WorkLunchCard.tsx:232` | `household_members.work_lunch.mode` | ⛔ **aucun lecteur serveur** (`parseWorkLunch` `household_presence.ts:701` n'a **aucun appelant** dans `supabase/functions/`) | `outside` ⟶ **U** via le pré-remplissage `away_days`; `lunchbox` ⟶ **RIEN**. Voir **R-3** | ⚠️ |
| 19 | **Repas pris dehors (grille)** | pré-rempli par la porte SQL `keel_household_set_member_work_lunch` (`20260818120000` §3) — pas d'écran direct, voir **R-4** | `household_members.away_days[].kind = "eating_out"` | `parseMemberAway` `EDGE:1581` → `resolveWindowPresence` `EDGE:2538` → `eatingOutBlock` `HMG:1068-1106` | **U** — `== A MEAL EATEN OUT IS NOT AN ABSENCE ==`, collé au bloc de présence `HMG:1250` | ✅ **OUI** — `- Nina: Tuesday lunch` |
| 20 | **Micro-ondes au bureau** | `WorkLunchCard.tsx:247` | `household_members.work_lunch.microwave` | ⛔ **aucun lecteur** | ⛔ **AUCUN** | ❌ **R-3** |
| 21 | **Absences (jour × créneau)** | `/app/setup` §4 `SetupPage.tsx:4380` · `/app/household` `HouseholdPage.tsx:1801` · `/app/plan` `MealBuilder.tsx:1066` (`MealPickerGrid.tsx:433`) | `household_members.away_days` (maître : + `student_goals.practical_constraints.away_days`, union en base `20260814110000:227-229`) | `EDGE:1581` → `EDGE:2538` `resolveWindowPresence` | **U** — bloc de présence `HMG:1241`, `household_presence.ts:521` (`absentBySlot` porte les prénoms) | ✅ **OUI** |
| 22 | **Préférences durables (« voix »)** | pas de champ direct : produit par le **memorizer** depuis la conversation de CHAQUE titulaire | `student_goals.practical_constraints.food_preferences` | `loadHouseholdVoices` `household_voices_io.ts:104` → `EDGE:3672` → `buildHouseholdVoices` `HMG:1191` | **U** — bloc des voix `HMG:1273`, `household_voices.ts:711` (`Prénom:` puis ses lignes) | ✅ **OUI** — ⚠️ **comptes uniquement** (D3), plafond par membre + garde de non-divulgation |
| 23 | **Rôle (maître / membre)** | implicite (`keel_household_create` pose `owner`) | `household_members.role` | `EDGE:855-865` (403 `not_owner`), `EDGE:1577` `isOwner` | ⛔ aucun bloc | ❌ |
| 24 | **Plan personnel vivant (prise de main)** | `/app/plan` d'un secondaire | `student_generated_meals(plan_kind='personal')` via `roster.own_plans` | `parseOwnPlans` `EDGE:1585` → `resolveHandOff` (`household_hand.ts`) | ⛔ **retire** la bouche de `composedMembers` → elle disparaît de la liste d'ids | ❌ par construction (elle n'a pas d'assiette ici) |

### 1.2 Ce qui est **AU NIVEAU DU FOYER** (22 lignes)

| # | Information | Saisi — URL · fichier:ligne | Stocké — table.colonne | Lecteur vivant — fichier:ligne | Bloc de prompt (S/U) | De qui ? |
|---|---|---|---|---|---|---|
| 25 | **Composition** (créer le foyer) | `/app/setup` §1 tuiles `SetupPage.tsx:2357-2423` → `chooseSize` `:950` · `/app/household` `HouseholdPage.tsx:818` | `households`, `household_members` | RPC `keel_household_roster_for` `EDGE:1082` | **U** — la liste d'ids `HMG:1203-1216` | ✅ liste nominative |
| 26 | **Nom du foyer** | `/app/household` `HouseholdPage.tsx:818` | `households.name` | — | ⛔ aucun bloc | ❌ |
| 27 | **Membre référent** | ⛔ **AUCUN ÉCRAN** (`ReferenceMemberCard` / `setReferenceMember` supprimés — `frontend/src/keel/api/household.ts:778-786`) | `households.reference_member_id` | `EDGE:1821-1825` → `EDGE:2361` `declaredReferenceMemberId` | ⛔ aucun bloc (décide la doctrine + le tronc d'énergie) | ❌ **R-9** |
| 28 | **Mode de cuisson** | `/app/setup` §4 `SetupPage.tsx:4330` · `/app/plan` `MealBuilder.tsx:1187` (`CookingShapeField.tsx:86`) | ⛔ **NULLE PART** — voyage avec la requête (`cooking_shape`), `household.ts:1418` | `readCookingShape(body.cooking_shape)` `EDGE:1061` → `capCookingShape` `HP:618` | **U** — `COOKING_SHAPE_LINES` `HP:640-675`, en tête du brief `HP:1105` | s.o. (fait du foyer) — voir **§4** |
| 29 | **Budget** | `/app/setup` §4 `SetupPage.tsx:4291` · `/app/plan` `MealBuilder.tsx:1162` | `student_goals.practical_constraints.budget_amount` **du maître** | `readCookingCapacity` `EDGE:442` → `EDGE:3465` `...capacity` | **U** — `budget for this plan: N` `MG:2490-2500` | s.o. |
| 30 | **Temps de cuisine / session** | `SetupPage.tsx:4248` · `MealBuilder.tsx:1119` | `practical_constraints.cooking_time_min` | `EDGE:430` → `...capacity` | **U** — `time per cooking session: about N minutes` `MG:2470-2474` | s.o. — sert **aussi** de plafond au 2ᵉ plat (`HP:764,799`) |
| 31 | **Jours de cuisine** | `SetupPage.tsx:4219` · `MealBuilder.tsx:1096` | `practical_constraints.cook_days` | `EDGE:427` → `...capacity` | **U** — `they can only cook on: …` `MG:2411-2465` | s.o. |
| 32 | **Moyens de cuisson (7 outils)** | `/app/setup` §3 `KitchenEquipmentCard.tsx:147-163` | `practical_constraints.kitchen_equipment` (`20260818110000`) | `readKitchenEquipment(pc)` `EDGE:3612` → `kitchenBlock` `HMG:996-1038` | **U** — `== THIS KITCHEN ==` `HMG:1287` | s.o. — ⚠️ **0 ligne sur 175** au 2026-08-18 (`HMG:961-963`) |
| 33 | **Difficulté de recette** | `/app/plan` `CookingCapacityCard.tsx:127` | `practical_constraints.recipe_difficulty` | `EDGE:431` → `...capacity` | **U** — `recipe level they want: …` `MG:2476` | s.o. |
| 34 | **Variété acceptée** | `CookingCapacityCard.tsx:140` | `practical_constraints.variety` | `EDGE:432` | **U** — `repetition they accept: …` `MG:2479` | s.o. |
| 35 | **Moments de repas de la maison** | `/app/setup` §3 `SetupPage.tsx:3913` (ligne du maître) | `practical_constraints.eating_rhythm` du maître | `EDGE:2474-2501` — **UNION** maître + toutes les bouches | **U** — la grille du plan (tronc) | s.o. — les moments **individuels** repartent en #10 |
| 36 | **Propriétés de jour** (`batch_cook`, `leftovers`) | ⛔ **AUCUN ÉCRAN NULLE PART** (grep `day_properties` sur `frontend/src` ⟶ **lecteurs de sortie uniquement**) | `practical_constraints.day_properties` (jamais écrit) | ⛔ `EDGE:3410` **`dayProperties: []` EN DUR** | ⛔ **AUCUN** | ❌ **R-5** |
| 37 | **Envie de la semaine** | `/app/plan` `MealBuilder.tsx:1256` (500 car.) · `PlanFeedbackDialog.tsx:352` | `household_envy_submissions.body` (ancré lundi ISO) | `EDGE:1916-1927` → `EDGE:3623` → `buildEnvyBlock` | **U** — bloc d'envies `HMG:1274` | ❌ anonyme par conception (lot 5 : une ligne pour tout le monde) |
| 38 | **Contraintes libres de la semaine** | `/app/plan` `MealBuilder.tsx:1281` (`meals-context`) | non persisté (payload) | `EDGE:3441` `body.context` | **U** — `what is going on for them RIGHT NOW:` `MG:2680-2681` | ❌ anonyme |
| 39 | **« Ce dont ils ont envie pour ces repas »** | `/app/plan` `MealBuilder.tsx:1229` (`meals-preferences`) — **rendu SANS garde de lane** | ⛔ jamais envoyé sur cette lane | `EDGE:3442` lit `body.preferences` → **toujours `null`** | ⛔ `-- THIS TIME --` `MG:2683-2684` **jamais servi au foyer** | ❌ **R-1 (le plus grave)** |
| 40 | **Fenêtre du plan** | `/app/setup` §4 `SetupPage.tsx:4194,4207` · `/app/plan` `MealBuilder.tsx:915,947` | payload | `readWindowRequest` `EDGE:401` | **U** — les jours de la fenêtre (tronc) | s.o. |
| 41 | **Note de reprise d'un aperçu** | `/app/plan` `PlanDraftDialog` → `planDraft.ts:496` `draft_note` | payload | `EDGE:1980-2010` `readDraftNote` (garde d'entrée, 400 `note_unusable`) | **U**, en queue `EDGE:2005` | ❌ anonyme (c'est le maître qui écrit) |
| 42 | **Demande de changement sur ma part** | `/app/plan` `MyShareCard.tsx:314` | payload `draft_note` | idem #41 | idem | ❌ **la bouche qui demande n'est pas nommée** |
| 43 | **Garde-manger** | `MealBuilder.tsx:1207` (masqué hors `from_pantry`) | payload | `EDGE:3458` **`pantry: []` EN DUR** | ⛔ AUCUN | ❌ (assumé : le foyer est `to_shop`) |
| 44 | **Objectif + situation du maître** | `/app/about-you`, `/app/setup` §2 | `student_goals.goal` / `.situation` | `EDGE:1502-1506` → `EDGE:3439-3440` | **U** — `goal: <token>` `MG:2562` + la situation | ❌ anonyme (« la doctrine du repas ») |
| 45 | **Fuseau / pays / langue** | `/app/setup`, `/account` | `profiles.timezone`, `.country`, `.locale` du **maître** | `EDGE:1133-1180` | **U** — `today`, `country`, bloc de langue (tronc) | s.o. |
| 46 | **Nombre de parts (`servings`)** | ⛔ **non saisissable au foyer** (`MealBuilder.tsx:992` masqué) | dérivé | `EDGE:3457` `presence.servings` (le moment le plus peuplé) | **U** — `people at the table` (tronc) | s.o. |

---

## 2. PAR PERSONNE OU PAR FOYER — et « de qui ? »

**Récapitulatif de la colonne d'attache**, la question propre à cette lane :

| Le prompt nomme la bouche | # |
|---|---|
| ✅ **Oui, explicitement** | 1 (prénom+id), 3-5 (corps entre crochets), 7 (direction de service), 10 (moments), 11-12 (habitude, note), 14 (le plus strict + les divergents), 15 (règles de maison), 16 (apport fixe préfixé), 19 (dehors), 21 (absences), 22 (voix), 25 (liste d'ids) |
| ⚠️ **Attaché mais partiel** | 2 (la date n'est jamais dite, seule sa conséquence l'est) · 14 (un régime **non** le plus strict et **non** divergent est invisible) |
| ❌ **Présent mais DÉTACHÉ de sa bouche** | **13 (allergies)** — voir **R-6** · **42 (demande sur ma part)** — voir **R-7** |
| ❌ **Absent du prompt** | 6 (activité), 8 (poids visé), 9 (rythme), 20 (micro-ondes), 23, 24, 26, 27, 36, 39, 43 |

**Le mécanisme d'attache**, en trois maillons, à vérifier dans cet ordre par 1B :

1. `EDGE:1554-1615` — le roster devient `LoadedMember`, `memberId` (jamais `user_id`) est l'identité.
2. Deux filtres **en cascade** (jamais croisés) : `composedMembers` (retire qui a pris la main, `EDGE:1617+`) puis `platedMembers` (retire qui est absent toute la fenêtre, `EDGE:2691-2695`).
3. `EDGE:3533` `platedMembers.map(...)` → `HMG:1203` liste d'ids → `HP:1035-1102` une ligne par bouche.

Toute information qui n'emprunte pas ce chemin **arrive détachée**.

---

## 3. RUPTURES SUSPECTÉES — classées par gravité

> Chacune est une **hypothèse de lecture**. Aucune n'a été mesurée sur un prompt réel.

### 🔴 P0 — collecté à l'écran, jamais envoyé

**R-1 · Le champ « ce dont ils ont envie pour ces repas » n'est jamais transmis sur la lane foyer.**

> ✅ **CONFIRMÉE** sur trois prompts réels (`brussels` → 0, `dahl` → 0). ⚠️ Mais c'est un **arbitrage produit**, pas un bug à réparer : voir **D-4** en §0.3.

- Le textarea `meals-preferences` est rendu **sans garde de lane** : `frontend/src/keel/components/MealBuilder.tsx:1223-1238`. Un maître de foyer le voit et le remplit.
- La branche foyer du submit ne le passe pas : `MealBuilder.tsx:735-750` appelle `generateHouseholdMeal({window, intent, replaces, context, cookingShape})` — **pas de `preferences`**.
- La signature ne l'accepte même pas : `frontend/src/keel/api/household.ts:1360-1398`, et le corps envoyé `:1399-1419` n'a pas la clé.
- L'autre appelant l'exclut **exprès** : `frontend/src/keel/api/planDraft.ts:463-481` (« LE CORPS DE LA LANE FOYER EST PLUS ÉTROIT »).
- Le serveur lit quand même : `EDGE:3442` `preferences: String(body.preferences ?? "")…` ⟶ toujours `null`.
- **Conséquence 1** : le bloc `-- THIS TIME --` / `what they feel like eating THIS TIME:` (`MG:2679-2684`) n'est **jamais** servi à un foyer.
- **Conséquence 2** : `EDGE:4332-4337` `reportOnRequest({preferences: ""})` — le rapport « ce que j'ai demandé » est structurellement vide sur cette lane.
- ⚠️ Le champ **envie de la semaine** (`MealBuilder.tsx:1256`) part bien, par une **autre** porte (`submitEnvy`, `MealBuilder.tsx:735`). Les deux champs sont côte à côte à l'écran ; **un seul arrive**.

### 🟠 P1 — stocké, aucun lecteur vivant

**R-2 · `target_weight_kg` (poids visé) n'a aucun lecteur dans la génération.**

> ✅ **CONFIRMÉE** — `80` n'apparaît que dans l'exemple figé `80 g of dry pasta`.
- Écrit par deux portes livrées le 2026-08-18 : `frontend/src/keel/api/mouthProfile.ts:76` (`keel_household_set_member_target`) et `:101` (`student_goals` en direct).
- Grep `target_weight_kg|targetWeightKg` sur `supabase/functions/` (hors tests) ⟶ **2 occurrences seulement** : `account-export-v1/index.ts:392` (export RGPD) et `_shared/keel/meal_body.ts:63`, qui est un commentaire d'**exclusion délibérée**.
- L'écran de la bouche (`MouthFormDialog.tsx:934`) le demande, et un slider de rythme est **borné sur lui** — mais rien ne l'utilise pour composer.

**R-3 · `work_lunch.mode='lunchbox'` et `work_lunch.microwave` n'ont aucun lecteur serveur.**

> ✅ **CONFIRMÉE**, et **pire que suspecté** : `mode='outside'` n'était **écrivable par aucun écran** (`bad_work_lunch`). Corrigé — voir **D-2**. La gamelle et le micro-ondes restent sans lecteur.
- La colonne, sa contrainte et sa porte existent : `supabase/migrations/20260818120000_lunch_out_is_not_absence.sql` §2, §4.
- La sémantique promise est écrite noir sur blanc : `household_presence.ts:654-658` — « le repas doit être **transportable**, et **bon froid** s'il n'y a pas de micro-ondes ».
- `parseWorkLunch` (`household_presence.ts:701`) n'a **aucun appelant** dans `supabase/functions/` (seul appelant : `frontend/src/keel/api/workLunch.ts:53`).
- `EDGE` n'appelle jamais `keel_household_work_lunch_for`. Grep `work_lunch|parseWorkLunch` sur `supabase/functions/` ⟶ **uniquement** la définition dans `household_presence.ts`.
- ⟹ Seul le chemin `mode='outside'` produit un effet, **par ricochet** (pré-remplissage `away_days` à l'écriture, migration §3). Une gamelle sans micro-ondes est **collectée et perdue**.

**R-5 · `day_properties` : ni écran de saisie, ni lecteur foyer.**

> ✅ **CONFIRMÉE** — `batch_cook` / `leftovers` → 0 dans le prompt.
- Le module existe et est complet : `_shared/keel/day_properties.ts` (2 propriétés, `batch_cook` / `leftovers`).
- `EDGE:3410` `dayProperties: []` **en dur**, avec le motif écrit (`EDGE:3405-3409`, FF-052 §11 Q3).
- Et **aucun écrivain non plus** : grep `day_properties` sur `frontend/src` ⟶ **lecteurs de sortie de plan uniquement** (`api/planDraft.ts:298`, `api/mealGeneration.ts:677,1036`, `lib/planGridModel.ts:265`). Aucun champ de saisie.

### 🟡 P2 — attaché à la mauvaise bouche, ou détaché

**R-6 · Une allergie arrive dans le prompt SANS sa bouche, et sous un en-tête au singulier.**

> ✅ **CONFIRMÉE**, et la sortie mesurée : le modèle **ne commente ni ne justifie** (0 `peanut`, 0 `allerg`, aucun aliment de la famille dans les courses). Non tranché — voir **D-6**.
- `household_safety.ts:166-191` `householdAllergyConstraints` pose `userId: ""` — et le commentaire `:155-160` explique pourquoi (`member_id` dans un champ de compte serait une fixture qui ment).
- Le bloc rendu : `safety_constraints.ts:313` `=== THIS STUDENT'S HARD CONSTRAINTS ===` — **« THIS STUDENT »**, pour une tablée de quatre.
- ⟹ Le modèle sait qu'on ne sert **rien** de tel à personne (direction sûre), mais il ne peut **pas** savoir de qui vient la contrainte. Contraste net avec #15 (dégoûts), qui écrit `- Léa: never serve X`.
- ⚠️ **À ne pas « réparer » en passant** : le fichier documente que cette anonymisation est un choix. Ce qui est à **mesurer** par 1B : est-ce que le modèle commente ou justifie l'allergie faute de savoir à qui elle est ?

**R-7 · La demande de changement d'une bouche sur SA part ne dit pas qui la formule.**

> ⛔ **NON EXERÇABLE** avec ce foyer : `MyShareCard` demande un secondaire AVEC compte. Ni confirmée ni infirmée.
- `frontend/src/keel/components/plan/MyShareCard.tsx:314` : la bouche écrit une demande sur **sa** part.
- Elle repart en `draft_note` — un canal **anonyme** — lu par `EDGE:1980-2010` et injecté en queue de message (`EDGE:2005` `draftNoteInstruction(note.usable)`).
- Le `restrictionFlag` appliqué à la garde est celui du **compte qui compose** (`EDGE:1984-1986`), pas celui de la bouche concernée — l'écart est documenté à `EDGE:3527-3532`, mais **dans l'autre sens** (les habitudes, elles, utilisent le plancher de la bouche).

**R-8 · Une bouche sans compte ne peut porter ni apport fixe, ni voix.**

> ✅ **CONFIRMÉE à l'écran** : le bloc « shake ou collation mesurée » est masqué pour une bouche nue ; seul Sacha a pu déclarer le sien.
- Apports fixes : `household_fixed_intakes.ts:196-200` — `fixed_intakes` est clé sur `user_id`, une bouche nue « n'a nulle part où en porter ». `MouthFormDialog.tsx:753` masque le champ. `mouthProfile.ts:665-673` **lève** si un shaker est déclaré sans porte.
- Voix : `household_voices_io.ts:130-132` filtre sur `userId` non vide (D3).
- ⟹ Un enfant de 8 ans qui prend un goûter fixe **ne peut pas** le déclarer. C'est cohérent et documenté, mais c'est un **trou d'inventaire** que 1B doit connaître avant d'écrire ses fixtures.

**R-9 · Le membre référent n'a aucun écran.**

> ✅ **CONFIRMÉE** : `reference_member_id` est resté `null` sur un foyer monté entièrement par les écrans.
- `households.reference_member_id` est lu par `EDGE:1821-1825` et gouverne la doctrine + le tronc d'énergie (`EDGE:2361`).
- Côté front : lu (`api/household.ts:444,491`) mais **jamais écrit** — `ReferenceMemberCard` et `setReferenceMember` ont été supprimés (`api/household.ts:778-786`, `HouseholdPage.tsx:685`).
- ⟹ La valeur est toujours `null` sur un foyer neuf, et la résolution retombe sur la cascade serveur.

### 🔵 P3 — résidus et angles morts

**R-10 · Grille de présence à 3 états : UI morte.**

> ✅ **CONFIRMÉE**, et c'est ce qui rendait **R-3 bloquante** : sans écran pour poser « dehors » à la main, la porte du déjeuner au bureau était le seul chemin — et elle refusait.
`MealPickerGrid.tsx:410` rend le sélecteur `at_table` / `eating_out` / `away` **uniquement** si `onSaveMarks` est passé (`:120`, `:258`). Les trois montages de production (`SetupPage.tsx:4380`, `HouseholdPage.tsx:1801`, `MealBuilder.tsx:1066`) ne passent que `onSave`. ⟹ « dehors » (#19) n'est **atteignable que** par la question du déjeuner au travail.

**R-11 · Repli d'objectif périmé.**

> ✅ **INJOIGNABLE**, comme annoncé : `goal: fat_loss` sort de la colonne, jamais du repli.
`EDGE:3439` `goal: String(goalRow.goal ?? "health")`. Le jeton `health` a été retiré le 2026-08-18 (`_shared/keel/tokens.ts:630-634` : `fat_loss | maintenance | muscle_gain`), et `EDGE:2312-2316` documente déjà ce repli **corrigé en `maintenance`** à 1 100 lignes de là. **Injoignable aujourd'hui** (`student_goals.goal` est `NOT NULL` + CHECK — `schema.sql:9254`, `20260818100000:285-287`), donc à classer « résidu », pas « rupture ». À signaler, pas à corriger dans un lot QA.

**R-12 · Un prénom vide efface l'attribution (garde en base, pas en code).**

> ⛔ non testée (la contrainte en base interdit d'y arriver par un écran). ⚠️ Mais **D-1** montre un défaut voisin et RÉEL : ce n'est pas un prénom vide qui cassait l'attribution du maître, c'est un prénom **juste, écrit dans la mauvaise colonne**.
- La cicatrice est nommée dans `20260810120000_household_member_identity.sql:95-97` : « un prénom vide **efface la portion sans bruit** ».
- Ce qui la tient aujourd'hui : `first_name NOT NULL` + `check (char_length(btrim(first_name)) between 1 and 40)` (`:123-126`).
- Ce qui la tiendrait si la base cédait : `EDGE:1570` `|| "Member"`, `household_voices.ts:692` `|| "Member"`, `EDGE:3660` `|| "Member"`.
- Ce qui **ne la tient pas** : `household_fixed_intakes.ts:120-127` `attributedIntake` — prénom vide ⟹ **libellé nu**, « mon shaker » sans nom, c.-à-d. lu par la table entière. Et `frontend/src/keel/api/mealGeneration.ts:423-442` `readMemberPortions` ne filtre **que** sur `memberId` (`:442`) : une part au `display_name` vide **survit** et s'affiche sans nom.
- ⚠️ **Troncature à 20 caractères** : `HOUSEHOLD_MAX_NAME_CHARS = 20` (`household_turn_context.ts:229`) tronque les prénoms côté **chat**, pendant que la base en accepte 40. Deux prénoms composés partageant leurs 20 premiers caractères deviendraient **indiscernables** dans le contexte de tour. (Ce plafond n'est **pas** appliqué par `EDGE`, qui prend le prénom entier.)

**R-13 · Injections conditionnelles à vérifier — une garde qui ne se déclenche jamais est un trou déguisé.**

> Mesuré : `== THIS KITCHEN ==` **se déclenche** dès qu'un outil est décoché (le « 0/175 » est une population, pas une garde morte) · `== A DISH OF THEIR OWN ==` et `WHOSE DISH IS IT` **présents** en `one_session` (it. 01), **absents** en `one_dish` (it. 02/03) · bloc de régime **présent** · conséquence du rythme **présente** · bloc des voix **absent** (aucun titulaire avec préférences) · bloc d'envies **présent**, ancré sur le lundi ISO.

| Bloc | Condition | Où | Population au 2026-08-18 |
|---|---|---|---|
| `== THIS KITCHEN ==` | `missingKitchenTools(...) ≠ []` | `HMG:996-1003` | **0 / 175 comptes** portent la clé (`HMG:961-963`) |
| `== A DISH OF THEIR OWN ==` | `dishBearers ≠ []` | `HMG:925` | ⟵ dépend de `divergingCount` **et** du seuil de 90 min/sem (`HP:764`) |
| `WHOSE DISH IS IT` (S) | idem | `HMG:883` | idem |
| `== WHAT THE SHARED DISH MUST RESPECT ==` | `strictest ≠ null` | `household_diet.ts:305` | un foyer sans régime déclaré ⟹ bloc absent |
| `BODY_FACTS_CAVEAT` | `anyBodyFacts` | `HP:1157` | absent si personne n'a de corps **lisible et adulte** |
| conséquence du rythme | `anyRhythm` | `HP:1141` | absent si personne n'a de moments propres |
| conséquence des habitudes | `anyHabit` | `HP:1153` | ⚠️ la **note libre** (#12) ne le lève pas (`HP:1093-1097`) |
| boîtes (`boxSchemaBlock`, `boxingOrderLines`) | `members.length ≥ 2` | `HMG:820`, `HP:1220` | muets à une bouche |
| bloc des voix | ≥ 1 titulaire avec préférences | `HMG:1273` | comptes seulement |
| bloc d'envies | `envyLine ≠ null` | `HMG:1190` | ancré sur le **lundi ISO** de `startsOn` (`EDGE:1916`) |

**R-14 · Double injection : aucune trouvée, et c'est activement défendu.**

> ✅ **AUCUNE DOUBLE INJECTION MESURÉE** : une seule phrase de régime, un seul bloc de mots du maître, les corps uniquement par bouche. Le §7 Q5 (allergie déclarée des deux côtés) n'a pas été exercé : la bouche allergique est le maître, donc une seule source.
Trois endroits refusent explicitement d'écrire deux fois la même chose, et 1B doit les connaître pour ne pas les prendre pour des trous :
- `EDGE:3404` `dietBlock: ""` au tronc — le régime passe **uniquement** par `householdDietBlock` (motif : `EDGE:3387-3403`, sinon deux phrases de régime dans le même prompt, dont une qui n'est pas la plus stricte).
- `EDGE:3483` `foodPreferences: []` et `EDGE:3489` `writtenInstructions: []` — les mots du maître passent **uniquement** par le bloc des voix (motif : `EDGE:3466-3488`, une seule porte gardée).
- `EDGE:3431` `body: null` au tronc — les corps entrent **uniquement** par bouche, dans le brief (`EDGE:3412-3430`).

---

## 4. LES TROIS MODES DE CUISSON — le plafond, avec ses lignes

### Où c'est saisi
- `/app/setup` §4 — `frontend/src/keel/pages/SetupPage.tsx:4330` (id `setup-cooking-shape`)
- `/app/plan` — `frontend/src/keel/components/MealBuilder.tsx:1187` (id `meals-cooking-shape`)
- Composant : `frontend/src/keel/components/CookingShapeField.tsx:86` (un `<select>`) · jetons : `frontend/src/keel/api/cookingShape.ts:47` · gate d'affichage : `cookingShapeApplies(mouths)` `cookingShape.ts:107`

### Où c'est stocké
**Nulle part.** Le choix voyage **avec la demande** :
- envoi : `frontend/src/keel/api/household.ts:1418` `cooking_shape: args.cookingShape ?? null` · aussi `frontend/src/keel/api/planDraft.ts:480`
- lecture : `EDGE:1061` `const askedCookingShape = readCookingShape(body.cooking_shape)`
- motif écrit : `EDGE:1040-1060` — « un réglage de profil s'écrit une fois et s'applique en silence à toutes les semaines suivantes, y compris celle où on reçoit du monde »
- il est **archivé** dans `generated_from` mais **jamais relu** d'un plan précédent (`EDGE:1057-1060`)

### ⛔ C'EST UN PLAFOND : il peut restreindre, il ne fabrique jamais un second plat

**La preuve, en cinq lignes de code :**

1. **La déclaration d'intention** — `HP:531-559`, en particulier `HP:546-548` :
   > « Le choix BORNE donc, dans un seul sens : il peut refuser un second plat, **il ne peut pas en fabriquer un**. "Chacun le sien" n'ouvre qu'une possibilité — c'est la divergence qui la lève. »

2. **L'implémentation** — `HP:618-633` `capCookingShape(computed, asked)` :
   - `HP:622` — `asked === null` ⟹ le calcul gouverne seul (sortie byte-identique à avant le lot)
   - `HP:625-628` — `wanted < found` ⟹ **le plafond mord** : on sert `asked`, `capped: true`
   - `HP:629-632` — `wanted > found` ⟹ **on sert `computed`**, et on note `unused: true`. **C'est ici que « chacun le sien » est refusé** quand rien ne diverge.

3. **Ce qui lève réellement le barreau ②** — deux sources de divergence, jamais le choix :
   - `servingConflicts` (directions de service opposées) — `household_merge.ts`
   - `dietDiverges` — `household_diet.ts:259-272`
   - et **le temps plafonne par-dessus** : `HP:729-741`, `HP:764` `SEPARATE_DISH_MIN_WEEKLY_MINUTES = 90`, `HP:799-802` `timeAllowsASecondDish`

4. **Le barreau ③ est réservé à la fusion** — `HP:692-694` : « Il n'y a **pas** de pluriel pour ③ … le barreau ③ reste RÉSERVÉ À LA FUSION ».

5. **Et quand le plafond mord, le plan le dit** — `HP:550-553`, câblé à `EDGE:4313-4319` (`cookingShapeChoice: {capped, unused, outsideSharedPot}`) → `plan_rationale.ts`.

### Ce que chaque barreau change dans le prompt

| Barreau | Texte servi | Où |
|---|---|---|
| ① `one_dish` | `Cook ONE set of preparations for everyone. Do NOT propose separate dishes.` | `HP:641-643` |
| ② `one_session` (1 divergent) | `… ONE person below cannot be served from it (their line says so): at EVERY meal … a dish of their OWN, cooked in the SAME cooking session …` | `HP:662-668` |
| ② `one_session` (≥2 divergents) | `… SOME of the people below cannot be served from it …` | `HP:696-703` (`ONE_SESSION_LINES_MANY`) |
| ③ `separate_sessions` | `… cooked in their OWN session, on their own day.` | `HP:669-674` |

Ces lignes sont servies par `cookingShapeLines(cooking, divergingCount)` `HP:719-726`, injectées **en tête du brief de portions** `HP:1105`.

**Deux blocs supplémentaires n'existent qu'au-dessus de ①**, et c'est délibéré (`HMG:860-865` : servir une consigne d'attribution sous un prompt qui dit « Do NOT propose separate dishes » **inviterait** le modèle à marquer un plat) :
- **U** `== A DISH OF THEIR OWN ==` — `HMG:921-950`, monté à `HMG:1236`
- **S** `== WHOSE DISH IS IT (household) ==` — `HMG:880-896`, monté à `HMG:1318`

⛔ **Ne pas « réparer » ce plafond.** Le faire fabriquer un second plat est un **changement de nature**, à décider par un humain — `HP:540-548` porte le raisonnement (un choix qui remplacerait le calcul ferait promettre un plat là où rien ne diverge, ou servirait une assiette qui ment).

---

## 5. COMMENT REMPLIR CHAQUE CHAMP DANS L'ÉCRAN — feuille de route 1B

### 5.0 Prérequis
Compte réel, **connecté**, **avec un coach publié** (sinon `EDGE:1934` rend `409 no_coach`), `profiles.timezone` non vide (sinon `409 local_day_unresolved`), et une couverture/essai vivante (sinon `402 household_frozen`, `EDGE:918`).

### 5.1 Créer le foyer, puis y ajouter une deuxième bouche

| # | Geste | Où |
|---|---|---|
| 1 | Aller sur **`/app/setup`** | routeur `frontend/src/App.tsx:291-298` |
| 2 | Étape 1 « qui mange ici » : cliquer la tuile **« deux »** ou **« trois et plus »** — c'est **ce clic** qui crée le foyer | `SetupPage.tsx:2357-2423` → `chooseSize` `:950` → `createHousehold` (`api/household.ts:516`, RPC `keel_household_create`) |
| 3 | Étape 2 « moi » : remplir prénom, date de naissance, taille, poids, activité, sexe, direction, poids visé + rythme | `SetupPage.tsx:2588 / 2605 / 2619 / 2640 / 2659 / 2669 / 2685 / 2723` |
| 4 | Étape 2, bloc « les autres bouches » : **formulaire d'ajout** → prénom, naissance, taille, poids, sexe, activité, direction, poids visé + rythme → **Ajouter** | `SetupPage.tsx:2918 / 2942 / 2958 / 2970 / 2983 / 3005 / 3040 / 3068` → `addMouth()` `:1133` |
| 5 | Répéter #4 pour la 2ᵉ bouche | — |

**Variante `/app/household`** (si le foyer existe déjà) : carte « Ajouter une bouche » `HouseholdPage.tsx:1145`, champs `:1188`, écrit par `persistMouth` (`api/mouthProfile.ts:579`) — **une seule** soumission écrit tout (corps, cible, habitudes, allergies, dégoûts, régime).

⚠️ **Plafond de bouches** : `HOUSEHOLD_MAX_MEMBERS` (`HouseholdPage.tsx:1165`), refus serveur `household_full`.
⚠️ **Mémoire du dépôt** : le harnais QA a déjà buté sur un **plafond de 3 sièges d'essai** — le 4ᵉ élève plante le run. Rester à **2 bouches** pour ce lot.

### 5.2 Les deux profils volontairement différents (ce que 1B doit poser)

| | **Bouche A** (le maître) | **Bouche B** (2ᵉ bouche, sans compte) |
|---|---|---|
| Direction | `fat_loss` | `muscle_gain` |
| Effet attendu au prompt | `generous vegetables, full protein share, smaller starch share` (`HP:233-234`) | `larger protein and starch share, same vegetables` (`HP:253-254`) |
| Allergie | **oui** — ex. `arachide` | non |
| Dégoût | non | **oui** — ex. `champignons` |
| Date de naissance | adulte | adulte (⚠️ un mineur **supprime** ses faits corporels — voir §6) |

**Poser l'allergie de A** : `/app/household` → carte des contraintes → sélecteur `kind` = **allergie** (`HouseholdPage.tsx:1902`) + libellé (`:1914`) → `keel_household_add_allergy`.
Ou via la fiche : `MouthFormDialog.tsx:770` (puces d'allergènes) / `:796` (« rien »).

**Poser le dégoût de B** : même carte, `kind` = **règle de maison** (`HouseholdPage.tsx:1914`) → `keel_household_add_restriction` → `household_food_restrictions`.
Ou via la fiche : `MouthFormDialog.tsx:1202` (`DislikeFields`).

⚠️ **Les deux portes sont `add_*`, pas « poser la liste »** (`mouthProfile.ts:681-690`) : re-soumettre le formulaire **ajoute** une seconde ligne. Le retrait se fait à la main (`HouseholdPage.tsx:1944` / `:1959`).

### 5.3 Le reste, champ par champ

| Information | Chemin exact |
|---|---|
| Régime d'une bouche | `/app/setup` §3 `SetupPage.tsx:3863` · ou `/app/household` `HouseholdPage.tsx:1710` (4 boutons, re-clic = efface) · ou `MouthFormDialog.tsx:846`. ⚠️ **masqué si la bouche a un compte** — elle le déclare alors dans son propre « about you » |
| Moments de repas d'une bouche (+ taille) | `/app/setup` §3, carte de la personne : case du moment `SetupPage.tsx:3913`, pastilles de taille `:3933` |
| Habitude par créneau | `/app/household` `HouseholdHabitsCard.tsx:229` (radio « plat de la maison / son habitude ») + `:251` (texte, 120 car.) → **Enregistrer** `:286`. ⚠️ la porte **remplace** toute la ligne |
| Note libre durable de la bouche | `HouseholdHabitsCard.tsx:274` (textarea) · ou `/app/setup` §3 `SetupPage.tsx:4059` |
| Apport fixe (« shaker ») | `MouthFormDialog.tsx:1107` (libellé), `:1117` (g/portion), `:1129` (protéines), `:1139` (kcal) + créneau. ⚠️ **visible seulement pour une bouche AVEC compte** (`:753`) |
| Déjeuner dehors | `/app/setup` §3 `WorkLunchCard.tsx:220` (au bureau ?) → `:232` (gamelle / dehors) → `:247` (micro-ondes ?). ⚠️ **majeurs uniquement** (refus `not_adult`) |
| Absences | `/app/setup` §4 `SetupPage.tsx:4380` · `/app/household` `HouseholdPage.tsx:1801` · `/app/plan` `MealBuilder.tsx:1066` — grille jour × créneau, `MealPickerGrid.tsx:433` |
| Inviter une bouche (lui donner un compte) | `/app/household` `HouseholdPage.tsx:2081` + sélecteur « qui » `:2061` → lien `/join-household?token=…` `:2124`. Réclamation : `JoinHouseholdPage.tsx:545` (nom), `:561` (mdp), `:573` (langue), `:583` (mentions légales) |
| **Mode de cuisson** | `/app/setup` §4 `SetupPage.tsx:4330` · **ou** `/app/plan` `MealBuilder.tsx:1187`. ⚠️ **il ne se persiste pas** : il faut le re-choisir **à chaque composition** |
| Budget | `/app/setup` §4 `SetupPage.tsx:4291` · `/app/plan` `MealBuilder.tsx:1162` |
| Temps de cuisine / session | `SetupPage.tsx:4248` · `MealBuilder.tsx:1119`. ⚠️ **≥ 90 min/semaine** (jours × minutes) pour qu'un 2ᵉ plat soit seulement **possible** (`HP:764`) |
| Jours de cuisine | `SetupPage.tsx:4219` · `MealBuilder.tsx:1096` |
| Moyens de cuisson | `/app/setup` §3 `KitchenEquipmentCard.tsx:147-163` (7 puces). ⚠️ **décocher** au moins un outil, sinon le bloc `THIS KITCHEN` reste muet |
| Difficulté / variété | `/app/plan` `CookingCapacityCard.tsx:127` / `:140` |
| Envie de la semaine | `/app/plan`, dans le formulaire de composition `MealBuilder.tsx:1256` (500 car.). ⚠️ **s'écrit sur le lundi de la semaine de DÉPART choisie** (`MealBuilder.tsx:734`) |
| Contraintes libres de la semaine | `/app/plan` `MealBuilder.tsx:1281` (`meals-context`) — **c'est CE champ qui arrive**, pas `meals-preferences` (**R-1**) |
| Fenêtre du plan | `/app/plan` `MealBuilder.tsx:915` / `:947` (max 7 jours) |
| **Lancer la composition** | `/app/plan`, bouton de soumission `MealBuilder.tsx:1297` |

### 5.4 Ce qui n'est atteignable par AUCUN écran
Membre référent (**R-9**) · propriétés de jour (**R-5**) · état « dehors » posé à la main dans la grille (**R-10**) · apport fixe d'une bouche sans compte (**R-8**).

---

## 6. LES DEUX POINTS À DOCUMENTER SANS LES JUGER

### 6.1 Le corps d'un mineur ne s'énonce jamais

**Où la règle est tenue, et par quel code :**

| Garde | Fichier:ligne | Ce qu'elle fait |
|---|---|---|
| **La garde principale** | `_shared/keel/meal_body.ts:247` — `if (ageState !== "adult") return [];` | Un mineur **et** un âge `unknown` ne reçoivent **aucun** fait corporel dans le brief. Paramètre **positionnel et requis** (`:234-236`), pour que le compilateur liste les appelants |
| Son unique appelant | `HP:1047` `householdBodyFacts(m.body, m.ageState)` | Les deux gardes (plancher TCA + mineur) sont appliquées **là**, pas chez l'appelant (`HP:1042-1046`) |
| Plus strict que la lane solo | `meal_body.ts:196-215` | Sous plancher TCA, `mealBodyBlocks` laisse passer bande d'âge et sexe ; **ici rien ne passe** |
| L'indiscernabilité, volontaire | `HP:983-990` | Bouche sans compte · lecture ratée · sous plancher TCA · rien saisi ⟹ **la même ligne**. « un membre marqué "on ne vous dira rien de lui" est un membre désigné » |
| La direction, à part | `HP:443-448` `servingDirectionFor` | Depuis le 2026-08-18 un mineur porte les **trois** directions ; `CHILD_DIRECTION` est le repli d'un mineur **sans** direction. `HP:422-437` nomme les trois choses qui tiennent la règle à la place : l'énergie (`childEnvelopeFromBody` n'a **pas** de paramètre `goal`), le rythme (`weight_pace.ts` borne sur son besoin), et **le silence** |
| Le contournement fermé | `meal_body.ts:217-232` | « on ne contourne pas `goalApplies` en passant par le corps » — un modèle qui lit « 128 cm, 41 kg » compose l'assiette de `fat_loss` sans qu'on le lui demande |
| L'histogramme sans nom | `EDGE:4578-4580` | `box_sizing.mouths` est un **histogramme de motifs**, jamais `member_id: minor` — « désignerait un enfant dans une colonne lisible par tout le foyer » |
| On CALCULE avec | `EDGE:1828-1838`, `EDGE:2358` | `lineBodies` (mineurs compris) sert le **moteur** d'énergie ; `bodies` sert le **brief**. « C'est la ligne de partage du lot : on CALCULE avec, on n'ÉNONCE jamais » |

### 6.2 Le mode de cuisson est un plafond
Voir **§4** — code, lignes, et les cinq preuves. Rappel : **ne pas le réparer**.

---

## 7. CE QUE JE N'AI PAS PU TRANCHER

1. **R-1 : est-ce un oubli ou une décision ?** `planDraft.ts:463-465` dit « LE CORPS DE LA LANE FOYER EST PLUS ÉTROIT, et c'est le contrat ». Mais alors le textarea `meals-preferences` **ne devrait pas être rendu** au maître d'un foyer (`MealBuilder.tsx:1223`, sans garde `composingForHousehold`, contrairement au champ d'envie à `:1252`). Je n'ai pas trouvé de note qui tranche. **À faire trancher par un humain**, pas par 1B.

2. **Le rythme (#9) atteint-il vraiment les grammes aujourd'hui ?** `EDGE:4425-4428` affirme « LA POPULATION EST VIDE AU 2026-08-18 : aucun écran n'écrit encore ce curseur ». Or `mouthProfile.ts:76-101` **écrit** les deux portes, et `MouthFormDialog.tsx:975` rend le slider. Le commentaire semble **périmé du jour même**. Non vérifiable sans une base réelle : à confirmer par `generated_from.box_sizing.mouths` (attendre autre chose que `no_pace`).

3. **Le seuil de 90 min est-il franchi par les fixtures de 1B ?** `weeklyCookingMinutes` = jours × minutes (`HP:778-787`) — `null` si l'un des deux manque, et `null` ⟹ `true` (`HP:799-801`). Je ne sais pas ce que l'écran pose **par défaut** ; si un défaut existe et tombe sous 90, le barreau ② est cloué à ① sans qu'on le voie.

4. **Le pré-remplissage `eating_out` survit-il à une modification de la grille ?** La migration (`20260818120000` §3) dit qu'il ne retire jamais une absence posée à la main et qu'il n'est **jamais re-dérivé** à la lecture. Je n'ai pas relu le corps complet de `keel_household_set_member_work_lunch` — à vérifier si 1B doit poser un « dehors ».

5. **Les allergies d'une bouche AVEC compte passent-elles deux fois ?** `EDGE:2041-2043` boucle sur `accountIds` (`student_safety_constraints`) **et** `EDGE:2074` lit `household_member_allergies`. Si le même allergène est déclaré des deux côtés pour la même personne, il devrait produire **deux lignes** dans `safetyConstraintsPromptBlock`. Inoffensif pour la sécurité, mais c'est peut-être la seule **double injection** de la lane. Non vérifié.

6. **Le plafond de 20 caractères sur les prénoms** (`household_turn_context.ts:229`) s'applique au **chat**, et `EDGE` ne l'applique pas. Je n'ai pas cherché s'il existe un troisième lecteur qui, lui, tronquerait avant le prompt de génération.

7. **`reportOnRequest` avec `preferences: ""`** (`EDGE:4337`) : je n'ai pas lu `request_report.ts` en entier — je ne sais pas si un rapport vide est simplement muet, ou s'il produit une ligne dégradée.

8. **La cascade de résolution du référent** quand `reference_member_id` est `null` (**R-9**) vit dans `household_composition.ts`, que je n'ai pas lu en entier. Je ne sais pas **qui** gagne par défaut.

---

## 8. RÉPONSES DE 1B AUX HUIT POINTS DE §7 (mesurées)

1. **R-1, oubli ou décision ?** → **Décision, mal justifiée.** `planDraft.ts:461-465` dit que
   le corps étroit « est le contrat ». La justification donnée (« ne les ferait pas lire »)
   est **fausse** : `EDGE:3442` lit `body.preferences`. Deux réparations opposées existent.
   **Arbitrage humain — remonté, non corrigé (D-4).**
2. **Le rythme atteint-il vraiment les grammes ?** → **OUI.** Le commentaire `EDGE:4425-4428`
   (« la population est vide au 2026-08-18 ») était **périmé du jour même**.
   `generated_from.household.box_sizing.mouths` du run mesuré :
   `{"sized": 1, "no_pace": 0, "restriction_floor": 2, …}` — le curseur de Sacha
   (0,30 kg/sem) a bien dimensionné ses boîtes ; Livia et Tino, sans cible, retombent sur
   le plancher. ⚠️ Rappel : **il n'entre toujours dans aucun prompt** (ligne #9).
3. **Le seuil des 90 min est-il franchi ?** → **OUI, largement** : 3 jours × 60 min = 180
   min/sem. Le barreau ② n'était donc pas cloué par le temps — le `one_session` calculé
   en itération 01 le prouve (deux divergents servis).
4. **Le pré-remplissage `eating_out` survit-il à la grille ?** → Mesuré une fois : la porte
   a posé cinq midis (`kind: "eating_out"`) **sans toucher** au samedi soir de Tino
   (`kind: "away"`), déjà posé à la main. Les deux coexistent dans `away_days`. La
   modification manuelle **après** pré-remplissage n'a pas été testée.
5. **Les allergies d'une bouche AVEC compte passent-elles deux fois ?** → **Non exercé** :
   la bouche allergique est le maître, donc une seule source (`student_safety_constraints`).
   Une seule ligne dans le bloc. Le cas « même allergène des deux côtés » reste ouvert.
6. **Le plafond de 20 caractères sur les prénoms** → **Non exercé** (Sacha/Livia/Tino font
   moins de 20 caractères). `EDGE` prend bien le prénom entier.
7. **`reportOnRequest` avec `preferences: ""`** → **Muet, pas dégradé.**
   `generated_from.request_report` = `{"lines": [], "refusal": null}`. Le rapport « ce que
   j'ai demandé » est donc **structurellement vide** sur cette lane, sans produire de ligne
   fausse. C'est la conséquence 2 de R-1, confirmée.
8. **Qui gagne quand `reference_member_id` est `null` ?** → Non tranché ici : la valeur est
   restée `null` (R-9 confirmée) et la cascade serveur n'a pas été isolée. Ce qui EST
   mesuré : la sortie est cohérente sans référent déclaré.

**Bonus, non demandé mais utile :** `generated_from.household.voices` =
`{"heard": 0, "accounts_at_table": 1, …}` — confirme que la ligne #22 (voix) est
**non exerçable** avec un foyer à un seul compte, et que son silence n'est pas une rupture.
