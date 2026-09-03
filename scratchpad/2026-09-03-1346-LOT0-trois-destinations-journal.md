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

- **14:25** Note de conception : [2026-09-03-1425-A-trois-portes.md](2026-09-03-1425-A-trois-portes.md).
- **14:30 → 15:15** Tests rouges puis code, module par module : `memo.ts` (sujet requis, `when` fermé, plafond 5
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
- **15:20** Suite `_shared/keel` complète : **4 940 verts, 1 rouge** (`constant_pins_test` importait
  `MEMO_MAX_LINES`, renommé `MEMO_MAX_LINES_PER_SUBJECT`) → corrigé, 35 verts. `deno check` propre sur les deux
  générateurs et les tests réécrits. Front : `retainedItems.int.test.ts` 81 verts.
- **15:25** Message de l'orchestrateur des huit chantiers (commits au fil de l'eau, migration avant les siennes,
  versions de prompt, `draft_note_classify_test` à remettre au vert). Répondu : les commits restent gatés par
  l'humain (§2.1 du prompt maître, C5 approuvé) ; le lot 0 sera proposé au commit au prochain rapport ; aucun
  bump de version de prompt ; liste des fichiers sales envoyée.
- **15:30** Migration `20260903120000` appliquée en local (`migration up --local`), registre à jour, fonction à
  7 paramètres seule. Orchestrateur prévenu.
- **15:32** Fixture neuve `qa-3portes@keeltest.dev` (Claire titulaire, Léa mineure, Tom mineur). Le coach d'essai
  avait ses 3 sièges pris : siège de `qa-student-178589644657336ca1e@test.dev` (harnais du 5 août) passé à `ended`
  par SQL pour libérer une place. Kong à 900 000 ms.
- **15:38** Sonde (phrase 1 seule) : HTTP 200 en 47 s, `nothing_to_file`, `skipped_degree=1`, trois portes 0/0,
  aucune liste manquante → le runtime sert le nouveau code, l'attendu du §8.1 est tenu.
- **15:40** Banc complet lancé (`scripts/2026-09-03-1530-banc-retour-trois-portes.sh`, sorties `/tmp/banc-3portes`).
