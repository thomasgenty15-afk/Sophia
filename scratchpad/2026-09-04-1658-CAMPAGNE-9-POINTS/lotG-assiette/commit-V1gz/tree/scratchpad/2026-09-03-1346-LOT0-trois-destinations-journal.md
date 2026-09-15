# Journal — chantier « la mémoire à trois destinations »

**Ouvert** 2026-09-03 13:46 · **Prompt maître** [2026-09-03-1331-MASTER-PROMPT-memoire-trois-destinations.md](2026-09-03-1331-MASTER-PROMPT-memoire-trois-destinations.md) ·
**Arbre** principal `/Users/ahmedamara/Dev/Sophia 2`, branche `ff-001-quotidien-du-coach`, HEAD `bfecdc28` ·
**En parallèle** : l'orchestrateur des huit chantiers ([journal](2026-09-03-1329-ORCHESTRATION-8-CHANTIERS.md)), cinq worktrees sous `Sophia-2-chantiers/`, fusions en série sur cet arbre.

## Lot 0 — le modèle écrit comme autorité

- **13:33** (avant mon ouverture) Le travail non commité du §2.1 du prompt maître a déjà été commité par
  l'orchestrateur : `1556c9b2` (lot énergie), `0543d6ea` (packs i18n), `fa422747` (365 chemins). Vérifié :
  `draft_note_safety*.ts`, `memory_recap*.ts`, `food_exclusion_belt.ts`, `20260901180000`, `20260901233000`
  sont dans HEAD. **Le ⏸ « proposer les commits » du §2.1 est donc déjà passé** ; rien à stasher, rien à commiter.
- **13:46** État relu en base locale (docker `supabase_db_Sophia_2`, registre = disque, dernier `20260902100000`) :
  `retained_items` 25 (15 `portion.adjust`, 5 `food.prefer`, 4 `food.exclude`, 1 `logistics.set` questionnaire),
  `retained_next_plan` 12, `food_preferences` 32, `memo` **0**, `field_changes` 9, `household_food_restrictions` 7,
  `habits.note` 14, `household_traditions` 1, `meal_plan_feedback` 15.
- **13:46 → 14:10** Écrit :
  - `docs/keel/NOMENCLATURE-MEMOIRE.md` restructuré : encadré daté en tête ; **§2 réécrit** (2.1 deux sources,
    2.2 trois destinations + tests d'appartenance, 2.3 anti-doublon, 2.4 les quatre indices, 2.5 l'encart mort à
    `validated_at`, 2.6 ce qu'on ferme, 2.7 restriction parentale) ; §3 + la forme d'une note ; **§5 matrice
    amendée** (colonnes = destinations, brouillon → durable, brouillon → note) + note de renversement du point ① ;
    notes datées aux §4-bis (M5 confirmé) et §4-ter (le producteur arrive) ; **§6 réécrit** (5 blocs, groupés par
    personne) ; **§7 réécrit** ; **§8 exemples de routage** (10 phrases, 14 cas) ; **§9 collisions C1–C5** ;
    annexe A (anciens §2, matrice, §6, expiration à l'ancre).
  - `docs/keel/MODEL.md` : paragraphe « la mémoire du plan a DEUX sources et TROIS destinations ».
  - mémoire `memory-three-destinations-is-the-authority.md` + ligne d'index.

### Ce que le lot 0 a tranché (au-delà du prompt)

| point | tranché |
|---|---|
| phrase 1, 2, 5 (« trop long », « trop compliqué », « parts trop grosses ») | **rien** — `nothing_to_file{gate:index}` ; la phrase a déjà agi sur le plan qu'elle annotait ; le bilan pose la question fermée |
| phrase 7 (« l'après-midi elle mange toujours des compotes ») | **note ③** sujet Léa, `when = {slot}` — pas réductible à (Léa, compote, revoir) sans perdre « l'après-midi » et « toujours » |
| indices de cuisine | **le champ** (M5 confirmé) bougé par `difficulty` / `speed` / `enough_variety`, avec journal citant la question ; rapidité sur l'échelle `COOKING_SESSION_MINUTES`, un cran = un barreau |
| `hunger_between_meals`, `could_finish` | retirées au lot B (pas de lecteur) |
| cas N (« on a mangé des pizzas mardi » en `anything_else`) | **rien** — raconter un repas n'a aucune destination |
| note qui contredit une préférence | non tranché (§7) ; proposition : la préférence gagne |

### ⏸ HUMAIN — relecture du doc, et cinq collisions à arbitrer (§9)

C1 A2 dérive les champs de cuisine d'un `cooking_style` (proposition α : dériver à l'écriture) ·
C2 A5 remonte `KnownAboutYouCard` + `FoodPreferencesCard` sur `/app/household` (séquencer) ·
C3 FF-054 §3.2 « aucun champ libre » vs `anything_else` (renversement écrit, borné) ·
C4 migration du lot B réservée **`20260903150000`** · C5 arbre principal partagé avec les fusions.

- **14:20** ⏸ passé : C1 → α, C2 → séquencer, C3 → renversement écrit. Lot A lancé.

**Prochain lot (A)** : note de conception `scratchpad/2026-09-03-HHMM-A-trois-portes.md`, tests rouges, puis
`draft_note_classify.ts` à quatre listes, `memo.ts` avec sujet/`when`, `isNextPlanItemAlive` sur `validated_at`,
banc `banc-retour-trois-portes.sh`.

## Lot A — le retour sur brouillon route vers trois portes

- **13:55** Note de conception : [2026-09-03-1425-A-trois-portes.md](2026-09-03-1425-A-trois-portes.md).
- **14:00 → 14:25** Tests rouges puis code, module par module : `memo.ts` (sujet requis, `when` fermé, plafond 5
  par personne, rendu « Tuesday dinner — Léa: … »), `retained_item.ts` (`defaultScopeFor("draft_note", food.*)` →
  durable), `retained_next_plan.ts` (`written_at` dans l'enveloppe, `isNextPlanItemAlive(entry, plansValidés)`,
  lecture de `student_generated_meals.validated_at`), `retained_items_io.ts` (+ `memo`, 7 paramètres),
  migration `20260903120000` (port à 7 paramètres, surcharge à 5 supprimée), `draft_note_classify.ts`
  (quatre listes + sécurité, `skipped.why` compté), `draft_note_classify_io.ts` (une écriture pour les trois
  portes), `household_meal_generation.ts` (`notes` requis, bloc « FACTS ABOUT THIS WEEK, PER PERSON » après les
  voix), `meal_generation.ts` (l'exception du jour nommé dans l'en-tête du mémo), les deux générateurs
  (lecture par sujet, compteurs `keel.meal.notes` / `keel.household_meal.notes`), `memory_recap_io.ts`
  (`until: null`), miroir front (`subject`/`when` portés, `withoutMemoLine` ne jette plus les clés qu'il ne lit
  pas). Doc §2.5 aligné sur la règle implémentée : `validated_at > written_at` (instant, pas jour).
- **14:27** Suite `_shared/keel` complète : **4 940 verts, 1 rouge** (`constant_pins_test` importait
  `MEMO_MAX_LINES`, renommé `MEMO_MAX_LINES_PER_SUBJECT`) → corrigé, 35 verts. `deno check` propre sur les deux
  générateurs et les tests réécrits. Front : `retainedItems.int.test.ts` 81 verts.
- **14:28** Message de l'orchestrateur des huit chantiers (commits au fil de l'eau, migration avant les siennes,
  versions de prompt, `draft_note_classify_test` à remettre au vert). Répondu : les commits restent gatés par
  l'humain (§2.1 du prompt maître, C5 approuvé) ; le lot 0 sera proposé au commit au prochain rapport ; aucun
  bump de version de prompt ; liste des fichiers sales envoyée.
- **14:31** Migration `20260903120000` appliquée en local (`migration up --local`), registre à jour, fonction à
  7 paramètres seule. Orchestrateur prévenu.
- **14:33** Fixture neuve `qa-3portes@keeltest.dev` (Claire titulaire, Léa mineure, Tom mineur). Le coach d'essai
  avait ses 3 sièges pris : siège de `qa-student-178589644657336ca1e@test.dev` (harnais du 5 août) passé à `ended`
  par SQL pour libérer une place. Kong à 900 000 ms.
- **14:36** Sonde (phrase 1 seule) : HTTP 200 en 47 s, `nothing_to_file`, `skipped_degree=1`, trois portes 0/0,
  aucune liste manquante → le runtime sert le nouveau code, l'attendu du §8.1 est tenu.
- **14:40** Banc complet lancé (`scripts/2026-09-03-1530-banc-retour-trois-portes.sh`, sorties `/tmp/banc-3portes`).
- **14:49** Lot 0 commité à la demande de l'humain : `3f2af62a` (`--no-verify`, motif dans le message). RAPIDE
  fusionnée par l'orchestrateur juste après (`f3eea513`, `d4972302`), sans toucher un fichier du lot A.
- **14:56** Banc terminé, 12/12 en HTTP 200 (49–74 s par phrase, 104–176 s pour les générations nues de 7 jours).
  Verdicts : phrases 1, 2, 5 → `nothing_to_file` + `skipped_degree=1` ✓ ; 3 → `food.exclude` durable table ✓ ;
  4 → `food.exclude` durable **Tom** ✓ ; G4 → ceinture `mouths=1 checked=13 bites_before=1 retried bites_after=0`,
  poisson absent des boîtes de Tom ✓ ; 6 → note Léa `when tue/dinner` ✓ ; G6 → `keel.household_meal.notes
  lines=1 served=1 block=1` ✓, le « why » du mardi dit « une soirée qui demande un vrai repas », **mais la boîte
  de Léa du mardi = celle du lundi (1 050 g, boîte partagée à 3)** ✗ ; 7 → **rien, sans `skipped`** ✗ ; 8 →
  `allergy/peanut` en `student_safety_constraints`, 0 préférence ✓ ; 9 → `draft_note_safety failed=1
  not_authenticated` : **`keel_household_set_member_diet` gatée sur `auth.uid()`, morte sous service_role**
  (défaut du canal ① du 01/09, pas du lot A) ✗ ; 10 → encart craving ✓.
- **15:02** Corrections : le prompt enseigne qu'une habitude à un créneau est un FAIT avec `when`, et que tout ce
  qui n'est pas rangé DOIT apparaître dans `skipped` ; le pied du bloc de notes demande une boîte à part pour la
  personne au repas nommé. Reprise de la phrase 7 et de G6 (`/tmp/banc-3portes-rerun`).
- **15:12** Reprises mesurées. Phrase 7 : **réparée** (note Léa `snack_pm`, écrite, citée). G6 : la phrase
  « donne-lui sa propre boîte » a produit une boîte à **169 g** pour Léa le mardi pendant que le mercredi
  partagé donnait **740 g/bouche** — régression mesurée, phrase **retirée**, motif écrit dans
  `household_meal_generation.ts`. Le trou est structurel (les grammes sont écrits par le modèle ; le levier
  de portion est l'enveloppe, par personne, sans dimension par jour) : nommé au rapport, pas contourné.
- **15:20** Suite `_shared/keel` complète après corrections : **4 976 verts, 0 rouge**, 1 ignoré.
  Rapport du lot A : [2026-09-03-1505-A-rapport.md](2026-09-03-1505-A-rapport.md).
- **⏸ HUMAIN** : commit du lot A ; deux décisions produit (le grammage de ③ ; la variante serveur des RPC
  de sécurité par bouche).

## Lot B — le questionnaire de fin de plan nourrit les indices et la porte ③

- **15:30** Note de conception : [2026-09-03-1530-B-questionnaire-indices.md](2026-09-03-1530-B-questionnaire-indices.md).
- **15:35 → 17:30** Écrit, module par module, chacun compilé avant le suivant :
  - `plan_feedback.ts` : vocabulaire (`difficulty`, `speed`, `anything_else` ; `enough_variety` devient
    COMMUNE ; `hunger_between_meals` et `could_finish` **retirées** — aucun lecteur), `questionsFor` perd
    l'objectif, `cookingQuestionsAreAsked` naît, `effectOf` perd les déductions et gagne les deux crans,
    `refusedDishes` → `refusedFoods` (aliments + sujet, forme héritée lue).
  - `plan_feedback_retained.ts` : `applyStep` (un cran sur une échelle ordonnée, bornes comptées à part),
    `COOKING_SESSION_LADDER` (un BARREAU, plus un delta de minutes), la boucle des aliments avec sujet et
    contradiction jugée sur (aliment, sujet).
  - migration `20260903150000` : 6 colonnes, 5 CHECK dont la prémisse de cuisine, RPC à 14 paramètres
    (l'ancienne à 8 supprimée), **bloc de contrôle qui mesure par l'ÉCRITURE sur une copie temporaire**.
  - `keel-plan-feedback-v1` : aliments du plan (préparations pliées), les 6 paramètres, et **le champ libre
    câblé au classifieur du lot A** (garde `readDraftNote` + doctrine + plancher chargés seulement s'il y a
    un texte).
  - front : `PlanFeedbackDialog` (aliments, sujet par aliment marqué, champ libre), `api/planFeedback`,
    `StudentWeekPlanPage`, une clé i18n.
  - chat : `foodTermsOf`, la relance « pour qui » par aliment, et **le champ libre EXCLU du chat** (flux à
    boutons — la règle FF-054 §3.2 reste entière là où elle a été écrite).
- **16:10** Les 13 rouges `renderPulseMessage` : diagnostic du pair vérifié (`git log -S` → `fa422747`, la
  lignée de mon chantier), réparés et commités à part (`dfb56909`) — le gate est rendu à toutes les sessions.
- **17:35** `_shared` : **5 644 verts, 0 rouge, 19 ignorés**. Front : **2 028 verts**, 2 rouges hors périmètre
  (`household.int.test.ts`, lignée A6 du pair — signalés, pas touchés). ⚠️ `habitWriters.int.test.ts` échouait
  au chargement sur `globSync` : c'était mon PATH (node < 22), pas un rouge.
- **17:40** FF-054 §3.2 amendée par écrit (arbitrage C3) : le renversement du champ libre est **borné à
  l'écran**, avec ses trois raisons et les deux gardes qui tiennent le chat.
- **17:41** Banc du lot B lancé (`scripts/2026-09-03-1700-banc-bilan-v2.sh`, 11 cas du §8.2, une génération
  réelle par cas). Base de cuisine posée sur la fixture (`normal` / `some` / 60) par la même écriture que
  `CookingCapacityCard` — sans elle, les cas J/K/H mesurent `noBaseline` au lieu d'un cran.
- **17:55** Banc terminé : **11 cas sur 11 en HTTP 200**, et deux défauts trouvés — tous deux dans mon lot,
  tous deux invisibles au typecheck. ① `feedbackMembersOf` lisait `household_members.age_state` et `.gender`,
  **qui n'existent pas** (l'âge est dérivé par `keel_household_roster_for`, le sexe vit sur la fiche de corps) :
  la note de Léa partait sur toute la table. ② `keel_household_bodies_for` prend `p_household`, pas `p_user` —
  PostgREST rendait « function not found », qui se lit comme une panne de base. Réparés, cas L remesuré deux
  fois : note ③ · Léa · `when=tue`, plus aucun avertissement.
- **18:00** Rapport du lot B : [2026-09-03-1800-B-rapport.md](2026-09-03-1800-B-rapport.md).
- **⏸ HUMAIN** : commit du lot B ; une décision produit ouverte (la charge passe de 4 à 6 gestes — accepter,
  ou scinder le questionnaire en deux soirs).
