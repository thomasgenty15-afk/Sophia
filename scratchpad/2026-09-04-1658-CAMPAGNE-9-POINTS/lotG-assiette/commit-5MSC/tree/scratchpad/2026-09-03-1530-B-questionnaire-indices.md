# Lot B — le questionnaire de fin de plan nourrit les indices et la porte ③

**Autorité** : `docs/keel/NOMENCLATURE-MEMOIRE.md` §2.1 ②, §2.4 (les quatre indices), §8.2 (les 14 cas) ·
**Prompt maître** §5 · **Arbitrages** C1 α (le style dérive à l'écriture), C3 (renversement écrit de
FF-054 §3.2 sur le champ libre), C4 (migration `20260903150000`).

## Ce que le lot ferme, en une phrase

Aujourd'hui le produit **devine** deux indices (« pas cuisiné » ⇒ −10 ou −15 minutes et une recette
plus simple) et **pose** une question dont personne ne lit la réponse (deux axes sur trois). Le lot B
**demande** ce qu'il veut savoir, et retire ce qui n'a pas de lecteur.

## B1 · `plan_feedback.ts` — le vocabulaire

| question | réponses | destination | posée à qui |
|---|---|---|---|
| `cooked` | `yes / partly / no` | **contexte seul** (une garde) | tout le monde |
| `portions` + `portions_subject` | 5 crans, inchangés | indice portion (`portion.adjust`) | tout le monde, hors plancher TCA |
| **`difficulty`** | `too_hard / fine / could_do_more` | indice capacité → champ `recipe_difficulty` | qui a cuisiné (`yes` ou `partly`) |
| **`speed`** | `too_long / fine / had_more_time` | indice rapidité → champ `cooking_time_min` | qui a cuisiné |
| `enough_variety` | `yes / sometimes / no` — **inchangées** | indice variété → champ `variety` | **tout le monde** (n'était posée qu'à `maintenance`) |
| `never_again` | des **aliments** du plan + `none`, avec sujet | préférence ① `food.exclude` | tout le monde |
| `make_again` | idem, en `food.prefer` | préférence ① | tout le monde |
| **`anything_else`** | **texte libre, facultatif, en dernier** | le classifieur du lot A | tout le monde |

**Ce qui disparaît** : `hunger_between_meals`, `could_finish`, tout le mécanisme d'axe
(`AXIS_QUESTION`, `axisQuestion`/`axisAnswer` dans `FeedbackAnswers`, `emphasisHint`,
`SATIETY_AXIS_QUESTION`). Motif écrit : `emphasisHint` n'a **aucun appelant** depuis le premier jour,
`plan_feedback.ts` l'avoue en toutes lettres, et la règle fondatrice du fichier interdit une question
sans lecteur. ⚠️ Les **colonnes** `axis_question`/`axis_answer` restent (15 lignes en base local) et
restent **lues** ; c'est le producteur qu'on retire, pas le passé — même geste que `canHold` vs
`canProduce`.

**Pourquoi `enough_variety` devient commune** : la variété est l'un des quatre indices (§2.4), son
champ (`variety`) est lu par les **deux** lanes pour **tout le monde**, et ne poser la question qu'à
`maintenance` rendait le cran inatteignable aux deux autres dynamiques — exactement le défaut que les
deux crans neufs de `portions` ont fermé le 2026-08-19. Conséquence heureuse :
**l'indiscernabilité sous plancher TCA devient structurelle** (plus aucune question ne dépend de la
dynamique, donc la sortie sous plancher est celle de tout le monde moins `portions`).

**⚠️ LA CHARGE AUGMENTE, ET C'EST NOMMÉ.** Avant : 5 à 6 bulles (`cooked`, `portions`, +« pour qui »,
`never_again`, `make_again`, l'axe). Après : 6 à 8 (`cooked`, `portions`, +« pour qui », `difficulty`,
`speed`, `enough_variety`, `never_again`, `make_again`, `anything_else` — les deux de cuisine sautées
quand `cooked = no`, `anything_else` facultative). FF-054 dit « au-delà de quatre gestes c'est un
formulaire ». ⏸ à nommer au rapport : soit on accepte, soit on scinde le questionnaire (les indices un
soir, les plats un autre), ce qui est un lot à part.

## B2 · `plan_feedback_retained.ts` — les effets

- `effectOf` perd `easeCookingBy`, `simplifyRecipes`, `emphasisHint` ; gagne
  `difficultyStep: "down" | "up" | null` et `speedStep: "down" | "up" | null`. `varietyPressure`
  devient `"more" | null` **sans** garde de jeton d'axe (la question est unique).
- Chaque mouvement écrit **une** ligne `field_changes` avec `quote` = la question telle que posée,
  puis la réponse cliquée (`QUESTION_LABELS` + `OPTION_LABELS`, langue du plan) — le patron existant.
- **Rapidité** : un cran = **un barreau** de `COOKING_SESSION_MINUTES = [30,45,60,90,120,180]`, pas
  un delta de minutes. `too_long` descend d'un barreau, `had_more_time` monte. Aux bornes : `atFloor`
  / `atCeiling`, **journal quand même** (§2.4). ⛔ Le delta de minutes disparaît : « −10 min » sur une
  valeur inconnue rendait `noBaseline`, et sur 45 min donnait 35, un cran qui n'existe pas à l'écran.
- **Capacité** : un cran de `RECIPE_DIFFICULTIES = [simple, normal, keen]`, dans les deux sens.
- **`never_again`/`make_again`** : chaque entrée devient `{food, subject}` → `food.exclude` /
  `food.prefer` durable, sujet porté. ⚠️ **Le lecteur lit les DEUX formes** : une ligne d'avant le lot
  porte des **titres de plats** (`["Poulet rôti"]`), une ligne neuve porte des objets. Un test sur une
  ligne ancienne **recopiée de la base locale** le tient.
- `refusedDishes`/`keptDishes` deviennent `refusedFoods`/`keptFoods`, et le pont
  `reconcileFoodPreferencesFor` (phrases plates) **n'est plus utilisé** : le lot C ferme ce magasin,
  et y verser des aliments structurés perdrait `kind`, `subject` et `at`.

## B3 · migration `20260903150000`

- `meal_plan_feedback` : `+ difficulty text`, `+ speed text`, `+ anything_else text`,
  `+ never_again_foods jsonb`, `+ make_again_foods jsonb`. ⛔ **Colonnes NEUVES pour les aliments**,
  jamais une réécriture de `never_again` : les 15 lignes en base portent des titres, et les remapper
  falsifierait des réponses réelles.
- CHECKs sur les trois nouveaux vocabulaires, `null` autorisé (`null` = pas posé).
- `keel_plan_feedback_submit` : cinq paramètres neufs, **tous nullable**. `answered` continue.
- **Bloc de contrôle** : pour chaque colonne à vocabulaire, comparer la liste du **CHECK réel**
  (`pg_get_constraintdef`) à celle que la RPC accepte — défaut ⑥ du 2026-09-01 (deux listes pour une
  règle, la moins lue vieillit).

## B4 · le chat

`plan_feedback_chat.ts` : les bulles neuves dans les deux langues, `anything_else` **en dernier** et
non bloquante (son absence ferme le questionnaire). `nextFeedbackStep` gagne les trois étapes.
`plan_feedback_tap.ts` route les nouveaux boutons. ⚠️ Vérifier le budget de tours de
`keel-proactive-v1` : le bilan part à 22h30 (FF-054, amendé), la bande du soir à 20h-22h — les deux
sortent le dernier soir, et c'est écrit.

**C3, le renversement écrit** : FF-054 §3.2 interdit tout champ libre, « parce qu'il inviterait à
raconter ce qui a été mangé ». `anything_else` est bornée : dernière, facultative, formulée
« quelque chose à retenir pour la suite ? » (jamais « comment ça s'est passé »), et ce qui raconte un
repas n'a **aucune destination** (`skipped.meal_story`, §8.2 cas N). À écrire **dans la fiche**.

## B5 · `anything_else` → le classifieur du lot A

⛔ **Le même classifieur, jamais un second.** `classifyAndPersistDraftNote` prend un
`DraftNoteVerdict` (garde d'entrée obligatoire) : le texte du bilan passe donc par `readDraftNote`
avant, exactement comme une note de brouillon. `targetWeek` = le `starts_on` du plan **suivant** s'il
existe, sinon celui du plan qu'on vient de clore (l'ancre n'est plus une règle de vie depuis le lot A,
elle ne sert qu'à l'affichage). Test de câblage par lecture de source.

## Ce que le lot B ne fait pas
- La carte (`KnownAboutYouCard`) : lot D.
- `cook_days`, `budget_amount` : hors des quatre indices, inchangés.
- Le style de cuisine (`cooking_style`) : lane CUISINE, arbitrage C1 α — mes champs restent l'unique
  vérité lue, son style les écrira par la même porte journalisée.
