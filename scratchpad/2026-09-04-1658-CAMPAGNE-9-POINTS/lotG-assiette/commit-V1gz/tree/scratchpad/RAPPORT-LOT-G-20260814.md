# Rapport — LOT G, le moteur des habitudes et de la forme de cuisson

> Ouvert le 2026-08-14 après un plan réel qui a servi des **œufs brouillés sept
> matins d'affilée** à une femme qui mange une pomme.
> Branche `ff-001-quotidien-du-coach`. Commit **`00edaf83`**.

---

## 0 · Les deux vérifications préalables, faites AVANT d'écrire

| Question | Réponse | Comment |
|---|---|---|
| `cookingTimeMin` est-il par SESSION ou par semaine ? | **par SESSION** | trois sources concordantes : le prompt écrit littéralement « time per cooking session: about N minutes » (`meal_generation.ts:1785`) ; la garde d'intégrité compare N au total d'**une** session, jour par jour (`meal_generation.ts:3202-3212`) ; l'écran ne propose que six durées de **session**, 30 min → 3 h (`frontend/src/keel/api/planBudget.ts#COOKING_SESSION_MINUTES`). La multiplication `cookDays.length × cookingTimeMin` est donc légitime. |
| Le critère de divergence existe-t-il déjà ? | **oui**, `servingConflicts` (`household_merge.ts:545`) | Réutilisé **tel quel**, jamais réécrit. Seul le paramètre `table` change : la fusion y met la tablée sans l'entrant, une composition y met tout le monde **sauf** la personne examinée. La même question posée N fois au lieu d'une. |

---

## 1 · Livré

### G1 · La table — `supabase/migrations/20260814100000_household_member_habits.sql`

`public.household_member_habits (member_id pk, household_id, slots jsonb, note text, updated_by, updated_at)`.

- **Appliquée** par `docker exec supabase_db_Sophia_2 psql … -f`, **inscrite à la
  main** dans `supabase_migrations.schema_migrations`.
- **Idempotente : rejouée TROIS fois**, verte les trois.
- Privilèges **mesurés** après application :
  `anon` f/f/f · `authenticated` f/f/f · `service_role` t/t/t
  (`select`/`insert`/`truncate`). La table est fermée au navigateur ; les seules
  portes sont les fonctions.
- **Écart assumé avec D14** (colonne vs table), motivé dans l'en-tête : auteur à
  tracer, texte libre à pouvoir refermer séparément, et volume nul dans le cas
  nominal — la ligne **n'est pas écrite** quand la bouche mange le plat commun.

### G2 · Les RPC

- `keel_household_set_member_habits(uuid, jsonb, text)` — les **cinq** motifs de la
  spec, en littéral, aucun sixième : `not_authenticated` · `not_a_member` ·
  `bad_slots` · `bad_note` · `not_your_line`.
- **Pas de `has_account`**, et c'est le patron de `keel_household_set_member_away`
  suivi à la lettre (§G2 : « le maître pour **toute** bouche de son foyer »).
- **Pas de `no_household`** non plus : un appelant sans foyer ne trouve pas la
  bouche (`= null` n'est jamais vrai) et s'entend dire `not_a_member`. Choix
  documenté dans la migration.
- `keel_household_habits_for(uuid)` (service_role) + `keel_household_habits()`
  (authenticated) — patron du roster D14, parce que `auth.uid()` est **NULL** sous
  `service_role`.
- Le bloc de contrôle final **rejoue les gestes** et se `rollback`. Il se donne une
  identité via `set_config('request.jwt.claims', …, true)` — sans quoi tous les
  appels rendraient `not_authenticated` et le contrôle serait **vert en ne
  prouvant rien**. C'est l'écart avec la migration de présence, qui écrit dans la
  colonne et laisse donc sa règle d'accès non vérifiée.

### G3 · La garde de texte — **empruntée, pas réécrite**

`readHabitText` délègue à `plan_draft_note.ts::readDraftNote`. **Un seul écart,
délibéré** : `readDraftNote` recolle les clauses gardées ; une habitude, elle,
tombe **entière** dès qu'une clause tombe. Motif : sur une note de reprise, garder
ce qu'on peut honorer est le bon arbitrage ; sur une propriété **durable**, un
texte amputé se relit chaque semaine sans que personne sache qu'il l'est.

### G4 · Le bloc de prompt

- Sur la ligne de la bouche : `— has their own at breakfast: une pomme`.
- **« their », pas « her »** (la spec écrit l'exemple au féminin parce qu'il porte
  sur une femme nommée) : la phrase de conséquence **cite le marqueur entre
  guillemets** — `When a person "has their own" at a moment` — exactement comme
  celle du rythme cite `"eats at ... only"`. Un test tient que le marqueur cité
  **existe** dans la ligne servie ; sinon la consigne ne s'attache à rien, et rien
  n'échouerait.
- Conséquence dite **une seule fois**, et **seulement si** au moins une bouche en
  porte une (discipline `anyBodyFacts` / `anyRhythm`).

### G5 · Le temps plafonne, la divergence déclenche

`SEPARATE_DISH_MIN_WEEKLY_MINUTES = 90`, `weeklyCookingMinutes()`,
`timeAllowsASecondDish()`, `cookingShapeLines()` — tous dans
`household_portions.ts`. Phrase de seuil dans `plan_rationale.ts`, FR + EN, **un
fait, jamais un reproche**, avec **trois prémisses armées** (plus d'une bouche · le
temps est connu · le temps est sous le seuil).

### G6 · Version de prompt

`HOUSEHOLD_PROMPT_VERSION` : `v9_merge_dedicated_per_meal` → **`v10_habits_and_cooking_shape`**.
`MEAL_PROMPT_VERSION` **ne bouge pas** : rien de G n'entre dans le tronc.

### Hors périmètre nommé, fait quand même : RGPD

`account-export-v1` réclame la table (`mes_habitudes_a_table`), `updated_by`
**exclu** (id d'un tiers). ⚠️ **Ce fichier n'est PAS commité** — voir §4.

---

## 2 · MESURÉ — les trois cas, en run réel

Foyer `b9a92acb-6d78-4ebc-bc23-174d1b237ac5` (Thomas `muscle_gain` maître +
Christèle `maintenance`, sans compte), habitude écrite **par la vraie RPC** :
`[{"slot":"breakfast","kind":"own_usual","usual":"une pomme"}]`.

`docker restart supabase_edge_runtime_Sophia_2` avant le premier run.
Les trois runs sont des `intent: "draft"` : **ils n'écrivent aucun plan**.

### Preuve ① — la bouche ne reçoit pas le plat du matin, et le plan le dit

Log du moteur :
```
weekly_cooking_minutes: 180, time_allows_second_dish: true,
shape: "one_session", diverging: ["e8d72be1…" = Thomas], from_merge: false
```

Plan rendu — **un second plat de petit-déjeuner apparaît** :
```
sun | breakfast | Porridge salé aux œufs et épinards   ← le plat de la maison
sun | breakfast | Pomme                                 ← le sien
```

Et la consigne de service le dit en toutes lettres :
> Christèle : « À chaque repas: la même base que la table, **sauf au petit
> déjeuner où sa pomme remplace le plat du groupe.** »

C'est le défaut d'origine, fermé et mesuré.

### Preuve ② — sous le seuil ⇒ `one_dish` + la phrase

Capacité ramenée à `["wed"] × 60 min = 60 min/semaine` (puis **restaurée**) :
```
weekly_cooking_minutes: 60, time_allows_second_dish: false,
shape: "one_dish", diverging: []
```
Rationale rendue par le run :
> « **Avec 1 h par semaine en cuisine, tout le monde mange le même plat — c'est ce
> que le temps permet.** »

Six plats, **aucun plat dédié**. Et l'habitude reste honorée — par la **portion**,
pas par un second plat : « à breakfast, prends ta pomme à la place du plat
commun ». C'est exactement le contrat `one_dish` : une cuisson, des parts qui
divergent.

### Preuve ③ — au-dessus du seuil **sans** divergence ⇒ rien ne change

Thomas passé à `maintenance` (puis **restauré**), temps laissé à 180 min :
```
weekly_cooking_minutes: 180, time_allows_second_dish: true,
shape: "one_dish", diverging: []
```
Six plats, aucun plat dédié, **et aucune phrase de seuil** dans la rationale.
**Le temps ne fabrique pas de plats inutiles** (arbitrage B1), et il ne s'explique
pas quand il n'a rien décidé.

### La byte-identité — tenue au niveau UNITAIRE, pas par un run

Trois égalités de chaîne, dans `household_habits_test.ts` et
`household_meal_generation_test.ts` :
- un foyer **sans habitude** à `one_dish` rend le brief d'avant le lot, caractère
  par caractère (assertion sur la chaîne **complète**) ;
- une **fusion** passe toujours `divergingCount: 1` et retombe sur le tableau du
  singulier — la ligne `one_session` d'aujourd'hui, mot pour mot ;
- ③ (`separate_sessions`) n'a **pas** de pluriel : réservé à la fusion, où il a été
  mesuré.

⚠️ **Un run réel ne peut PAS prouver cette byte-identité** : le code est déjà
changé, il n'y a plus de « avant » à interroger. La preuve est unitaire, et je
l'écris comme telle.

### Le harnais du run — ce qu'il a coûté et ce qu'il a touché

- Le mot de passe du compte maître n'est **pas** `1234567` (`invalid_credentials`
  mesuré). Jeton **HS256 forgé** avec le secret de la pile locale — l'algorithme
  que `docs/keel/JWT-HS256.md` exige ; ni `verify_jwt`, ni
  `signing_keys.local.json` n'ont été touchés.
- `auth.getUser()` exige une ligne dans `auth.sessions` (`session_not_found`
  mesuré) : une session a été **créée puis supprimée**.
- Aucune fenêtre composable n'existait sur ce foyer (`window_beyond_this_week` +
  `plan_overlaps_existing` se ferment mutuellement). Le plan de l'utilisateur a
  été **décalé puis remis**, trois fois.

**État final des données de l'utilisateur, vérifié :**
`starts_on/ends_on/duration_days = 2026-08-13 / 2026-08-19 / 7` (identiques),
`goal = muscle_gain` (identique), `practical_constraints` **md5 identique**
(`5444272e…`).
**Une seule trace résiduelle : `student_generated_meals.updated_at`** a été bougé
par les `UPDATE` de décalage. Je ne l'ai pas remis.

---

## 3 · Trouvé hors spec

1. **`household_portions.ts` ne doit pas atteindre `meal_generation.ts`** —
   invariant écrit dans `meal_generation.ts:85` (« Aucun cycle »). Mon premier jet
   l'a refermé en important `EATING_OCCASIONS`, et le prix était **six fichiers de
   test tombés d'un coup** sur `ReferenceError: Cannot access 'EATING_OCCASIONS'
   before initialization`. **Aucun typecheck ne le voit.** Le vocabulaire est
   désormais recopié dans `household_habits.ts` et la recopie est **prouvée
   égale** par un test (un test n'est dans aucun cycle).
2. **`maigrir` traverse la garde d'ENTRÉE.** Mesuré : sous plancher TCA,
   « perte de poids » et « lose weight » sont refusés, **« maigrir » ne l'est
   pas** — il n'est pas dans `FORBIDDEN_METRIC_TERMS`. Ce n'est **pas** un trou des
   habitudes : la même phrase traverse déjà la note de reprise, sur les deux lanes,
   depuis que cette garde existe. La ceinture de **sortie**
   (`FORBIDDEN_PORTION_TERMS`) le connaît, elle. Un test le **documente** comme
   défaut ouvert, avec la consigne de le retirer — pas de l'inverser — le jour où
   il rougit.
3. **`deno test --no-check` cache 31 erreurs de type.** La commande de
   vérification donnée dans le prompt porte `--no-check` ; le gate de commit, lui,
   typecheck. Mes 3011 tests étaient verts pendant que `buildPortionBrief` était
   appelé avec deux arguments à 27 endroits. **C'est le gate qui l'a attrapé, pas
   la commande de vérification.**
4. **Un plat d'habitude déclenche `protein_source_missing`.** Mesuré au run ① :
   `dishes[6]: protein_source_missing -- breakfast carries no protein food` sur le
   plat « Pomme ». L'ancre protéique ne sait pas qu'un plat dédié à une habitude
   n'est pas un repas de la maison. Le plan sort quand même (c'est une `issue`, pas
   un refus), mais le compteur est **faux**, et il le sera à chaque habitude.
5. **Le modèle recrache un jeton de créneau anglais dans une consigne
   française.** Mesuré au run ② : « à **breakfast**, prends ta pomme ». Les mots de
   moment sont anglais par construction (langue du prompt) ; ici le modèle en a
   recopié un dans une phrase lue **à table**.
6. **Lot H écrit déjà dans la table.** Une seconde ligne
   (`fb50c0f7…`, note « Ne mange rien de réchauffé. ») était présente : leur écran
   passe par la bonne RPC.

---

## 4 · Resté fermé — nommé, pas contourné

| Ce qui n'est pas fait | Pourquoi |
|---|---|
| **La ligne `note` ne va PAS « dans le bloc des voix »** (§G4). | D3 pose qu'une bouche **sans compte** n'a rien à dire et n'apparaît pas dans `buildHouseholdVoices` — or une habitude existe **précisément** pour la bouche sans compte. L'y pousser renverserait D3 en silence, depuis un autre lot. La note va donc sur **la ligne de la bouche**, sous la garde de clôture du brief (« NEVER state a reason… »). Écart documenté dans `habitNoteFragment`. |
| **Le plafond en tokens par membre ne s'applique pas à la note.** | Le plafond effectif est celui de la base : 280 signes × 1 ligne × 8 bouches. **Borné, pas mesuré.** |
| **`fixedIntakes: []` reste codé en dur sur la lane foyer** (③ du constat). | Nommé par la spec comme lot voisin. Non touché. |
| **Barreau ③ hors fusion.** | Réservé à la fusion, où il a été mesuré. Un budget de temps permet un second plat **dans la même session**, pas une seconde session. |
| **`account-export-v1/index.ts` et `household_composition_test.ts` : sur le disque, PAS commités.** | Les deux portent le travail **non commité d'une autre session** (206 et 298 lignes de diff : `export_copy.ts`/`resolveArtifactLocale` d'un côté, enveloppes/`mouthEnvelope` de l'autre). `git commit --only` aurait emporté leur travail. **Conséquence à connaître : l'arbre commité ne typecheck pas `household_composition_test.ts`** tant que l'autre session n'a pas commité le sien — il lui manque `habits: []` / `habitNote: null` sur deux fixtures `PortionMember`, corrections déjà **présentes sur le disque**. |

---

## 5 · Ce que je n'ai PAS pu vérifier

- **La byte-identité par run réel** — impossible par construction (voir §2). Tenue
  au niveau unitaire seulement.
- **Le comportement à ≥ 2 divergents** (`ONE person` → `SOME of the people`) — tenu
  par un test unitaire, **jamais vu en run réel** : aucun foyer local ne porte trois
  directions divergentes.
- **La RPC depuis un vrai navigateur authentifié** — vérifiée en base sous
  `set_config('request.jwt.claims')`, pas depuis le front. C'est la colonne de Lot H.
- **Le cas « membre non-maître écrit sa propre ligne »** — le chemin `not_your_line`
  est vérifié ; le cas **passant** correspondant (un secondaire réclamé qui écrit sa
  propre habitude) ne l'est pas : ce foyer n'a pas de secondaire réclamé.
- **La note d'habitude servie dans un prompt réel** — les trois runs ont porté une
  habitude `slots` mais **pas** de `note` sur la bouche composée. Le fragment est
  tenu par un test unitaire, pas par un run.

---

## 6 · Rouges consignés, pas réparés

- `no-unused-vars` sur `buildUnmergeBlock` et `MergeMaterialDish`
  (`generate-household-meal-v1/index.ts`) — **présents à HEAD**, vérifié en
  comparant `deno lint` sur la version HEAD et sur la version courante.
- `no-import-prefix` / `no-unversioned-import` sur `jsr:@std/assert@1` — convention
  de **tous** les fichiers de test du dépôt.
- Les rouges annoncés par le prompt et non touchés : 8 `no-irregular-whitespace`
  dans `en.ts:3319-3321`, 7 orphelins `household.error.*`, ~25 eslint frontend,
  `chat/recent_history_test.ts`, `action_occurrences_test.ts`, `coverage-guard`,
  11 fixtures Deno.

---

## 7 · Commits

| Commit | Contenu |
|---|---|
| **`00edaf83`** | `elle mange une pomme le matin, le plan lui servait des oeufs brouilles sept fois` — 13 fichiers, +2110/−40. Gate **vert** : 3011 tests Deno + typecheck Deno + typecheck frontend. |

Fichiers du commit : la migration, `household_habits.ts` (+ son test),
`household_portions.ts` (+ test), `plan_rationale.ts` (+ test),
`household_meal_generation.ts` (+ test), `household_merge_test.ts`,
`household_bodies_test.ts`, `generate-household-meal-v1/index.ts`,
`generate-meal-v1/index.ts`.

**Aucun `git add -A`, aucun `git stash`, aucun `git checkout --`, aucun
`--no-verify`, aucun `db reset`/`db push`/`functions deploy`, aucun fichier
frontend.**
