# CUISINE — A2 · style de cuisine et nombre de courses (P2 + D6.1 + D6.2)

**Worktree** `/Users/ahmedamara/Dev/Sophia-2-chantiers/CUISINE` · branche `chantier-0903/CUISINE`
· **migration réservée** `20260903171000` (renumérotée : `…141000` était passée sous la tête du
registre) · tag QA `qa0903c` · **Mandat** MASTER §5.6 · ANALYSE §2 entier + §6.3 (D6.1, D6.2).

> Journal écrit **au fil de l'eau**. A1 est prêt à prouver (`2b57bfa9`) ; A2 démarre dessus.

---

## 0. Ce qui vient de A1 et que A2 utilise

- La **veille** est le rang 0 de la fenêtre quand elle existe (`lead_days = 1`). La première
  session de cuisine de A2 tombe **dessus** — c'est le geste que P1 a rendu automatique.
- `timing` est sur la ligne et dans la réponse ; `plan_rationale` porte déjà les phrases de la
  veille. A2 ajoute les siennes **à côté**, jamais à la place.

## 1. Commits

| # | sha | Contenu |
|---|---|---|
| 1 | `3615fc54` | `_shared/keel/cooking_plan.ts` (module pur) + 15 tests + réexport front |
| 2 | `f89f760f` | migration `20260903171000` + `WRITABLE_FIELDS` des deux côtés + le test de liste fermée réparé |
| 3 | `755f498f` | les deux lanes dérivent leurs sessions ; deux phrases de rationale |
| 4 | `341e0f76` | D6.1 (le roster atteint la lane solo) + D6.2 (la gamelle a une consigne) + les deux bumps |
| 5 | `e1976df5` | D2.4 (le style plafonne la forme) + D2.5 (« pas eu le temps » descend le style) |
| 6 | `ecd2154b` | l'entonnoir pose les deux questions ; `cooking_time_min` passe `better` |
| 7 | `f6900424` | i18n chantier-0903/CUISINE (A2) |

*(Deux commits d'A1 se sont glissés entre-temps et sont sortis de cette liste :
`7863c897` — les sept épinglages du millésime — et `82d49b60` — les fixtures de
`meal_plan_integrity_test`.)*

### Suites

- `cd frontend && npx tsc -b --force` → **exit 0**.
- `npx vitest run` → **2 050 / 2 075**, 5 rouges **étrangers et antérieurs** :
  `coverage-guard` ×2, `awayFrom` ×2 (baseline confirmée par l'orchestrateur),
  `mealBoxes.int.test.ts › un contenant sans bouche…`.
- **Deno, tout `_shared/keel/` POUR DE VRAI** (pas `--no-run`) : **4 876 passés, 0 échec**, sur
  239 fichiers moins les **cinq** rouges au type-check à ma base `31ee930f`
  (`daily_pulse`, `daily_pulse_locale`, `draft_note_classify`, `pot_demand`,
  `written_instruction_check`). `deno check` vert sur `generate-meal-v1`,
  `generate-household-meal-v1`, `keel-plan-feedback-v1`, `meal-document-v1`.

### Mutations (A2)

| Mutation | Rouge attendu | Vu |
|---|---|---|
| `readCookingStyle` : clé absente ⇒ `"minimal"` | la cicatrice « clé absente ≠ réponse » | `A2 — clé absente = JAMAIS DEMANDÉ…` **+ 3 cas de D2.5** FAILED |
| plafonds retirés (`if (wanted > 99)`) | 3 sessions sous « le moins possible » | `A2 — « le moins possible » PLAFONNE…` FAILED |
| D6.1 débranché (`...rosterAway` retiré) | la lane solo ignore le roster | `D6.1 — la lane SOLO lit…` FAILED |
| liste fermée SQL sans `grocery_runs` | le port refuse le champ | `forbidden_field` (contrôle de la migration) |

Restaurées par `cp` depuis des copies de scratch, `cmp` vert sur chacune, suites re-vertes
(4 876/4 876). **Jamais `git checkout`, jamais `git stash`.**

### Versions de prompt

| Constante | Avant | Après | Population qui voit une consigne différente |
|---|---|---|---|
| `MEAL_PROMPT_VERSION` | `…v25_the_day_before_is_derived` | `…v26_the_cooking_style_sets_the_sessions` | qui a répondu aux **DEUX** questions de P2 |
| `HOUSEHOLD_PROMPT_VERSION` | `v22_precedence_in_tail` | `v23_the_lunchbox_travels` | les foyers où au moins une bouche emporte sa gamelle |

**Onze épinglages suivis**, chacun avec sa ligne de journal `⚠️ vNN (date) — …`, selon la
convention lisible dans les blocs eux-mêmes. L'empreinte d'arbitrage de v23 est **celle de v22,
recopiée et non éditée** : le bloc de précédence n'a pas bougé d'un octet, et c'est ce que
l'entrée affirme (`HOUSEHOLD_ARBITRATION_BY_VERSION`).

### La migration `20260903171000`

Validée **en transaction annulée**, sur une **copie de scratch dont le `begin;` et le `commit;`
ont été retirés** — voir §5, c'est le piège du chantier. **Contrôle 4/4** : ① le style passe le
port et ARRIVE en base · ② les courses aussi · ③ une clé hors liste est refusée par son nom ·
④ les droits (`service_role` seul) n'ont pas bougé.

**Trois faux verts attrapés en écrivant ce contrôle**, tous de la même famille — un contrôle qui
se **saute** dans son propre `exception` en annonçant « fixture impossible » pendant que la
migration s'applique, VERTE : `goal` et `content_locale` sont `not null` sans défaut ; `goal`
porte un CHECK à trois valeurs dont `health` ne fait pas partie ; et le témoin de concurrence du
port veut `{"grocery_runs": null}` et pas `{}` — le port agrège sur les clés du **patch**, donc
une clé absente donne `null`, pas rien. C'est le piège exact d'un appelant qui pose une clé pour
la première fois.

### Clés i18n (A2)

**Ajoutées** : `plan.cooking.style_label`, `style_hint`, `style_unset`, `style_minimal`,
`style_balanced`, `style_keen`, `runs_label`, `runs_hint`, `runs_unset`, `runs_one`, `runs_two`,
`runs_three`, `setup.missing.cooking_style`, `setup.missing.grocery_runs`.
**Retirées** : aucune. `setup.plan.time` et ses trois voisines RESTENT — `cookingTimeParts` et
`COOKING_SESSION_MINUTES` vivent encore dans `api/planBudget.ts` et `cooking_time_min` est lue par
cinq lecteurs ; les retirer sans vérifier appelant par appelant est le geste que ce dépôt a payé
sur `meals.loading`.

### Déviations assumées de §5.6, et leurs motifs

1. ~~**`recipe_difficulty` et `variety` ne sont PAS dérivés du style.**~~ 🔴 **RETIRÉE LE
   2026-09-03 : L'AFFIRMATION ÉTAIT FAUSSE.** Voir §9 ① — les deux ont un lecteur
   (`buildMealPrompt`, nourri par `...capacity`), et elles sont maintenant dérivées. Le texte
   d'origine est laissé barré exprès : une déviation retirée en silence se relit comme une
   déviation qui n'a jamais existé, et c'est celle-ci qui porte la leçon la plus chère du lot.
2. **`cooking_style` et `grocery_runs` entrent dans `WRITABLE_FIELDS`, pas dans
   `LOGISTICS_FIELDS`.** Cette liste-là est celle que `parseLogisticsSetValue` sait lire d'une
   note de brouillon et que `draft_note_classify` **énumère au modèle** : y ranger le style
   apprendrait au modèle à poser un réglage durable depuis une phrase libre.
3. **`HouseholdPromptInput.workLunch` est OPTIONNEL** — 65 littéraux construisent ce type et un
   lot en vol y ajoute déjà un champ requis. La cicatrice « paramètre optionnel = garde
   désarmée » est compensée **deux fois** : un compteur sort avec le bloc, et un test de câblage
   lit la source de la lane privée de ses commentaires.

   > ### ⚠️ LA RÉSERVE, ÉCRITE PARCE QUE JE VIENS DE PAYER LE DÉFAUT INVERSE
   >
   > **Un champ REQUIS rougit tout de suite ; un champ OPTIONNEL ne rougit jamais.** C'est
   > exactement la différence entre ce champ-ci et `LivePlanSpan.leadDays` d'A1 : celui-là était
   > requis, donc l'oubli est tombé **chez moi**, au type-check, sur trois fixtures de
   > `meal_plan_integrity_test.ts` que mon mandat ne nommait même pas. Ici, l'oubli ne tomberait
   > **nulle part**.
   >
   > **Ce qui tomberait en silence si un appelant oubliait `workLunch` :**
   >
   > | Ce qui se passerait | Ce qu'on verrait |
   > |---|---|
   > | `input.workLunch ?? []` rend `[]` | `workLunchBlock` rend `{block: "", mouths: 0, cold: 0}` |
   > | aucun bloc n'entre dans le `userSuffix` | **le prompt de v22, au caractère près** |
   > | le plan sort, complet, plausible | **rien** — pas d'erreur, pas de `issues`, pas de 500 |
   > | `HOUSEHOLD_PROMPT_VERSION` dit quand même `v23_the_lunchbox_travels` | une ligne étiquetée « la gamelle a une consigne » sur un plan qui n'en a pas reçu |
   >
   > La dernière ligne est le vrai coût : la **version de prompt mentirait**. On mesurerait une
   > population « v23 » dont une partie n'a jamais vu le bloc, et la comparaison v22/v23 — c'est-à-dire
   > la seule chose que le millésime existe pour permettre — deviendrait fausse **sans rien casser**.
   >
   > **Ce que le compteur montre alors, et c'est ce qui le sauve :**
   > `generated_from.household.work_lunch = {mouths: 0, cold: 0}` est écrit **sur chaque ligne**,
   > y compris au cas nominal. Un lot débranché se lit donc en une requête :
   >
   > ```sql
   > -- des foyers en v23 où le bloc n'a JAMAIS nommé personne = le câblage est parti
   > select count(*) filter (where (generated_from->'household'->'work_lunch'->>'mouths')::int > 0)
   >          as vus,
   >        count(*) as total
   >   from public.student_generated_meals
   >  where plan_kind = 'household'
   >    and generated_from->>'prompt_version' like '%v26%';
   > ```
   >
   > `vus = 0` sur une population entière n'est **pas** une preuve de débranchement (un foyer où
   > personne n'emporte de gamelle rend légitimement zéro) — mais `vus = 0` sur **toute** la
   > population alors que `household_members.work_lunch` porte des `lunchbox` en base l'est. La
   > requête de contrôle est donc **le compteur croisé avec la colonne**, pas le compteur seul.
   >
   > **Quand rendre le champ requis :** dès que le lot voisin qui ajoute `notes` a fusionné, il
   > n'y a plus de raison de garder le `?`. C'est un geste de dix minutes (65 littéraux, tous des
   > fixtures) et il remplace deux compensations par une garantie de compilation. **À faire dans
   > le lot de nettoyage E**, et c'est écrit ici pour que ce ne soit pas moi qui doive m'en
   > souvenir.
4. **Les absences ne resserrent pas la cadence de cuisine.** `daysToEat` est la fenêtre mangée,
   pas la présence : quelqu'un qui déjeune dehors le mardi est chez lui le lundi soir. Les
   soustraire poserait une session sur une raison qui n'en est pas une.

### Découvertes

- **Le test « la liste fermée du SQL est celle du TypeScript » lisait un nom de fichier de
  migration EN DUR.** Il serait resté **vert** en comparant le TypeScript d'aujourd'hui à la
  liste d'avant-hier, sur une garde qui ne ferme plus. Il cherche maintenant la **dernière**
  migration qui porte la boucle.
- **`readCookingCapacity` est recopiée dans les deux `index.ts`** sans qu'aucun test ne les ait
  jamais comparées. Un test le fait maintenant, et il refuse aussi qu'un `index.ts` recopie le
  plafond du style.


## 2. Décisions D2.x / D6.x appliquées

- **D2.1** durable (`practical_constraints`), éditable avant chaque composition ·
  **D2.2** les trois libellés de l'ANALYSE · **D2.3** le style plafonne les **sessions**, jamais
  les courses (la course en trop se **compte** et la rationale le dit) · **D2.4**
  `weeklyCookingMinutes` réveillé et **dit** · **D2.5** l'effet FF-054 `cooked: no` descend le
  **style** d'un cran (`oneStyleLower`), plus `cooking_time_min` · **D2.6** fait de **maison**
  (ligne du maître) · **D6.1** `generate-meal-v1` lit `household_members.away_days` en union ·
  **D6.2** bloc de prompt « transportable / bon froid » à côté de `eatingOutBlock` · **D6.3**
  namespace `setup.work_lunch.*` gardé.

## 3. Ce que le module pur tient, et ce qu'il refuse

`sessions = min(runs, 3, cap(style), joursMangés)`. Trois notes fermées, chacune adossée à une
phrase de rationale : `runs_1_needs_freezer`, `style_caps_sessions`, `days_cap_sessions`.

⛔ **Il PLAFONNE, il ne pousse pas.** Une session de plus est une vague de courses de plus, donc
un déplacement de plus (`plan_feasibility.ts:27-40`). « Le moins possible » + 3 courses rend
**2 sessions** et laisse la 3ᵉ course disponible pour du frais du jour ; `unusedGroceryRuns` la
compte pour que la rationale puisse le dire, au lieu de laisser deux vagues sous une réponse
« trois » se lire comme une option ignorée.

⛔ **Clé absente ≠ `minimal`.** Cicatrice `20260818110000:48-51`, déjà payée sur
`kitchen_equipment`. `readCookingStyle`/`readGroceryRuns` rendent `null` = *jamais demandé*, et les
lecteurs retombent alors sur `cooking_time_min` tel quel — le comportement d'hier, à l'octet près.

⛔ **`freezer: null` refuse comme `false`.** « On ne sait pas s'il en a un » n'est pas une raison
de promettre une semaine au congélateur.

## 4. ROUGE — ce qui n'a PAS été vu

**Aucun run réel, aucune vérification navigateur.** La fenêtre appartient à l'orchestrateur, et
le runtime edge sert l'arbre principal. Ce qui reste donc NON PROUVÉ, nommément :

| # | Ce qui n'a pas été vu | Ce qui le prouverait |
|---|---|---|
| R1 | « le moins possible » + 1 course + congélateur ⇒ **1 session au rang 0**, `uses_kept_freezer > 0`, **une** vague | run (a) ci-dessous |
| R2 | « un juste milieu » + 2 ⇒ 2 sessions, 2 vagues | run (b) |
| R3 | « j'aime cuisiner » + 3 sur 7 jours ⇒ 3 sessions, 3 vagues | run (c) |
| R4 | 1 course **sans** congélateur ⇒ refus nommé, 2 sessions, la rationale le dit | run (d) |
| R5 | un solo « je déjeune dehors » ⇒ les cinq midis **absents** de son plan (D6.1 vu en train de mordre) | run (e) |
| R6 | la consigne de la gamelle **dans le prompt réel** d'un foyer (D6.2) | run (f) |
| R7 | les deux champs à **320 px** et **1280 px**, dans les **deux langues** | navigateur |
| R8 | le `migration up` réel des deux migrations (le contrôle n'a tourné qu'en transaction **annulée**) | fenêtre |

### Le script de fenêtre, prêt à jouer

```bash
# 0. Ordre: A1 puis A2. Relire la tête du registre AVANT (un numéro ne réserve pas l'avenir).
docker exec supabase_db_Sophia_2 psql -U postgres -At \
  -c "select version from supabase_migrations.schema_migrations order by 1 desc limit 3;"
supabase migration up            # 20260903170000 puis 20260903171000
# Les deux blocs `do $$` doivent dire: [A1] contrôle: 6/6 · [A2] contrôle: 4/4

# 1. La fixture (SQL SEULEMENT, jamais le parcours: EMAIL_DELIVERY_ENABLED=1)
#    Patron: docs/keel/qa-fixtures/*.sql — mot de passe 1234567 par crypt,
#    colonnes de jeton '' jamais NULL, tag qa0903c.
#    Puis les deux réponses de P2, par SQL:
docker exec supabase_db_Sophia_2 psql -U postgres -c "
  update public.student_goals
     set practical_constraints = coalesce(practical_constraints,'{}'::jsonb)
       || jsonb_build_object('cooking_style','minimal','grocery_runs',1,
                             'kitchen_equipment', jsonb_build_array('oven','stovetop','freezer'))
   where user_id = '<QA_USER>';"

# 2. Les quatre appels `intent: "draft"` (a)…(d) + (e) solo dehors + (f) foyer gamelle.
#    Par le banc du dépôt, qui ouvre lui-même la session:
./scripts/2026-09-01-banc-generation.sh --since "<horodatage>"
#    ⚠️ Relancer le runtime edge AVANT (l'orchestrateur seul), sinon les `_shared`
#    modifiés ne sont pas rechargés. Et étendre le timeout Kong:
#    TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh

# 3. Les compteurs, en SQL, sur les lignes écrites
docker exec supabase_db_Sophia_2 psql -U postgres -c "
  select id, starts_on, duration_days, lead_days,
         generated_from->'timing'              as timing,
         jsonb_array_length(cooking_sessions)  as sessions,
         (select count(distinct s->>'buy_on') from jsonb_array_elements(shopping_list) s)
                                               as vagues,
         generated_from->>'prompt_version'     as version
    from public.student_generated_meals
   where user_id = '<QA_USER>' and retired_at is null
   order by created_at desc limit 6;"

# 4. Et le compteur de la gamelle (D6.2), sur la ligne du foyer
docker exec supabase_db_Sophia_2 psql -U postgres -c "
  select generated_from->'household'->'work_lunch' from public.student_generated_meals
   where plan_kind='household' and user_id='<QA_MAITRE>' order by created_at desc limit 1;"
```

⚠️ **Attendus, écrits AVANT le run** : (a) `sessions = 1`, `vagues = 1`, `lead_days = 1`, le jour
de cuisine = le rang 0 · (b) 2 / 2 · (c) 3 / 3 · (d) `sessions = 2` **et** une ligne de rationale
qui nomme le congélateur, **une seule** · (e) les cinq midis absents des plats · (f) `work_lunch`
non nul avec `mouths ≥ 1`.

---

## 5. ⛔ LE PIÈGE DE LA « TRANSACTION ANNULÉE » — écrit pour tout le chantier

L'orchestrateur avait donné la consigne `begin; \i <migration>; rollback;`. **Elle est
dangereuse** : les fichiers de migration de ce dépôt portent **leur propre `begin;` et
`commit;`**. Le `commit;` interne ferme la transaction, le `rollback;` qui suit ne défait **rien**
— et le bloc `do $$` de contrôle tourne quand même. Une migration ainsi « validée » peut donc à
la fois **s'appliquer pour de bon** ET **passer son contrôle**, ce qui la rend doublement
crédible. Sur une base **partagée par deux sessions**, c'est la forme la plus coûteuse de fausse
preuve. La lane MEMBRE l'a payée : sa migration a été réellement appliquée, hors registre.

**La méthode que j'ai utilisée dès A1**, et qui est la bonne : écrire une **copie de scratch**
dont le `begin;` et le `commit;` sont retirés, envelopper *celle-là*, **et vérifier en base après
coup**. Vérifié à l'instant, une seule requête : `lead_days` absent · le CHECK de durée est
toujours `>= 1 AND <= 7` · `eaten_days_check` absent · `one_live_eaten_start_idx` absent · le port
`keel_write_field_changes_for` ne contient pas `grocery_runs` · le commentaire de
`practical_constraints` ne mentionne pas `cooking_style` · zéro ligne de fixture · zéro
`auth.users` de contrôle · tête du registre toujours `20260903150000`.

---

## 6. Leçons portées aux deux journaux

1. **Un champ requis ajouté à un type PARTAGÉ casse des fichiers que le mandat ne nomme pas.**
   La liste nominative d'un mandat n'est pas une couverture (`LivePlanSpan.leadDays` →
   `meal_plan_integrity_test.ts`).
2. **`--no-run` vérifie la compilation, pas ce que les tests affirment.** Le bump v24 → v25 a
   laissé sept épinglages littéraux rouges qu'aucun type-check ne pouvait voir. Porte adoptée :
   `deno test` **pour de vrai**, sur tout le répertoire, avant chaque annonce.
3. **Un test qui lit un nom de fichier en dur devient faux en silence** le jour où l'autorité
   déménage.
4. **Un contrôle qui se saute dans son propre `exception` est un contrôle mort**, et il annonce
   « fixture impossible » d'une voix parfaitement calme.

---

## 7. Hors périmètre croisé, nommé et non réparé

- `household_merge_notice_io.ts` (région fusion) : touché **au minimum** en A1
  (`LiveHouseholdPlan.leadDays` + `lead_days` au `select`). **Signalé aussi ici pour la lane
  FOYER**, qui croisera ce fichier.
- `plan_feedback_retained.ts` : mon effet D2.5 est **minimal et localisé** (un champ requis sur
  `PlanFeedbackRow`, une branche dans `easeCookingBy`, rien de réorganisé). Il est écrit contre
  l'état de ma base et **doit être replacé sur le lot B** de la session voisine, qui réécrit ce
  module. Je ne dépends d'aucune des deux questions retirées (`hunger_between_meals`,
  `could_finish`) ni du paramètre `goal` de `questionsFor`.
- `HouseholdPromptInput.notes` : je n'ajoute **aucun** appelant de
  `buildHouseholdPromptBlocks` — le bloc de la gamelle vit **dans** le constructeur.
- `recipe_difficulty` / `variety` sans lecteur dans les deux générateurs : **constaté, nommé, non
  réparé** (ce n'est pas mon lot).
- `HouseholdMergeCard.tsx:45` (`toLocaleDateString`), `TableStepPlanning.tsx`,
  `HouseholdPage.tsx` : jamais ouverts.

---

## 8. LE REBASE SUR `b146b1ee` — et ce qu'il a mis au jour

L'orchestrateur a annulé la fusion d'A2 : mon D2.5 visait `easeCookingBy`, que le lot C de la
session voisine a supprimé. Rebase demandé, fait, **7 commits rejoués** (`7863c897` correctement
détecté comme déjà appliqué), deux conflits.

### 8.1 ⛔ LE VRAI PROBLÈME N'ÉTAIT PAS D2.5 : quatre fichiers avaient disparu d'un commit *présent*

En résolvant le second conflit, j'ai vu que `field_change.ts` ne contenait plus `cooking_style`.
Vérification : **`f89f760f` est un ANCÊTRE de `b146b1ee`** (`git merge-base --is-ancestor` dit
oui) **et pourtant ses quatre fichiers y sont revenus à leur état d'avant** :

| Fichier | Ce qui était perdu |
|---|---|
| `field_change.ts` | `cooking_style` / `grocery_runs` hors de `WRITABLE_FIELDS` |
| `field_change_test.ts` | le test de liste fermée relisait de nouveau un **nom de fichier de migration en dur** |
| `plan_rationale_test.ts` | le test « le rouge de sept jours dit la même chose aux trois endroits » |
| `20260903171000_…sql` | **la migration entière, 325 lignes** |

**C'est le pire des deux mondes.** `--is-ancestor` répond « oui », donc `git rebase` **saute** le
commit (« skipped previously applied commit ») et personne ne le revoit. Sans cette relecture, A2
repartait avec une migration inexistante et un port qui refuse `cooking_style` — **D2.5 mort à
l'arrivée pour la deuxième fois**, et cette fois sans erreur de compilation pour le dire.

**La leçon, générale :** *« le commit est dans l'histoire » ne prouve pas « son contenu est dans
l'arbre »*. Après toute fusion faite par quelqu'un d'autre, la vérification n'est pas
`--is-ancestor` mais **le contenu** : `git diff <mon-commit>^ <HEAD> -- <ses fichiers>`. Ici ça
rendait vide sur `field_change.ts` — la voisine n'y avait pas touché — ce qui a permis de
restaurer le patch d'origine tel quel, sans arbitrage.

### 8.2 La migration renumérotée une seconde fois — `171000` → `190000`

La tête du registre est passée à `20260903180000` pendant que ma branche attendait. `171000`
aurait été **sautée en silence** : le piège exact que A1 a déjà payé, et la règle tient toujours —
**un numéro n'est valide que s'il est supérieur à la tête du registre AU MOMENT OÙ IL S'APPLIQUE,
pas au moment où on le réserve.** Re-validée en transaction annulée (copie strippée), contrôle
**4/4**, base re-vérifiée intacte après coup. Le port extrait a été **re-comparé à la fonction
vivante** : identique hors mes deux clés, et aucune autre migration que `20260901180000` ne le
définit — ma migration ne réverte le travail de personne.

### 8.3 D2.5, réécrit — et ce que j'abandonne

**Ce qui meurt, et c'est juste.** D2.5 était accroché à `cooked: no` (« pas eu le temps ») parce
que l'ancien modèle en **déduisait** deux corrections. `cookingQuestionsAreAsked` n'ouvre les deux
questions que sur `yes`/`partly` : on ne demande pas si c'était trop long à quelqu'un qui n'a pas
cuisiné. Le style ne bouge plus que sur une réponse **explicite**, et un test tient ce deuil
(`D2.5 — cooked: no ne déplace RIEN, style ou pas`).

**Ce qui survit est le motif, renforcé.** Le lot C a cessé d'écrire « 35 minutes », un nombre que
l'écran ne propose pas. P2 va un cran plus loin : l'écran ne propose plus **aucun** nombre de
minutes, `recipe_difficulty` n'a aucun lecteur dans les deux générateurs, et `cooking_time_min`
est **écrasé** à la composition par la dérivation du style.

**La réponse à la question de l'orchestrateur — lequel des deux axes porte l'effet : les DEUX.**
`cooking_style` est **un** cadran qui porte les minutes ET la difficulté
(`COOKING_STYLE_PROFILE`) : les deux questions pointent le même réglage. D'accord ⇒ **un** cran,
jamais deux. En sens opposés ⇒ le cadran ne sait pas l'écrire, on ne bouge rien, et
`bothPolarities` le compte — le prix mesurable d'avoir fondu deux axes en une question.

Et le lot C m'a rendu le code meilleur : `applyStep` est un marcheur d'échelle générique, et
`COOKING_STYLES` **est** une échelle ordonnée. D2.5 n'est plus une branche à part, c'est un
**troisième `applyStep`**. Plancher, plafond, base illisible et citation viennent de son helper —
mon exigence « le plancher est un plancher » est désormais tenue par lui, pas par moi.

### 8.4 Suites au nouveau socle

Le lot C a réparé les **cinq** fichiers qui étaient rouges au type-check à mon ancienne base.
Pour la première fois, la suite Deno tourne **en entier, sans exclusion** :

- `deno test _shared/keel/` → **5 048 passés, 0 échec**.
- `deno check` vert sur `generate-meal-v1`, `generate-household-meal-v1`,
  `keel-plan-feedback-v1`, `meal-document-v1`.
- `tsc -b --force` → **0**.
- `vitest run` → **2 146 / 2 170**, **quatre** rouges étrangers : `coverage-guard` ×2,
  `awayFrom` ×2. (`mealBoxes › un contenant sans bouche` a été réparé par le lot C — il sort de
  ma liste.)

### 8.5 Une dette assumée

`cd2bff2a` (ex-`e1976df5`) porte encore le message « D2.4 + D2.5 » alors qu'il ne contient plus
que D2.4 : je ne peux pas réécrire un message en cours de rebase sans `git rebase -i`, indisponible
sur ce poste. Le message de `b28926aa` le dit en tête. **À corriger par E** s'il fait un
`rebase -i` de nettoyage, sinon à laisser avec cette note.

---

## 9. LE RAPPORT DU VÉRIFICATEUR — quatre défauts, quatre correctifs

Rapport : `scratchpad/2026-09-03-2140-CUISINE-A2-verification.md`, mesuré sur `7b8b8a49` (avant
mon rebase). Les quatre portent sur le contenu du lot, qui survit au rebase ; relus contre
`840995b5`, les quatre étaient encore là. Corrigés par `fdf29f25`.

### ① 🔴 Ma déviation (a) était DÉMENTIE par la mesure

**Ce que j'avais écrit :** « `recipe_difficulty` et `variety` n'ont aucun lecteur dans les deux
générateurs ». **C'est faux.** `buildMealPrompt` les émet (`meal_generation.ts:4073-4076` :
« recipe level they want: … », « repetition they accept: … ») et **les deux lanes le nourrissent
par `...capacity`** (solo `:2241`, foyer `:4410`). Le vérificateur l'a prouvé par une sonde sur
l'appel réel : **+60 octets de consigne**.

> ### ⚠️ LA LEÇON, ET ELLE EST MÉCANIQUE
> **Un `...spread` rend un champ INVISIBLE à `grep`.** J'avais cherché `recipeDifficulty` dans les
> deux `index.ts` : zéro occurrence, donc zéro lecteur. Mais le champ n'y apparaît pas — il voyage
> **dans un objet**. Chercher le NOM d'un champ ne prouve rien ; il faut **suivre l'OBJET**.
> Une affirmation d'absence n'est valide que si la recherche pouvait, en principe, trouver la
> chose. Ici elle ne le pouvait pas.

**Coût produit** : qui répondait « J'aime cuisiner » obtenait bien 120 minutes, et un prompt
**muet** sur le niveau de recette et la répétition — le style à moitié branché.

**Correctif** : `resolveCookingCapacity` dérive les trois leviers. Deux tests neufs comparent la
capacité **servie** au profil (avec des valeurs déclarées qui *contredisent* le style, pour qu'une
égalité par hasard ne passe pas), et la contre-épreuve sans style.

### ② La première des deux compensations du champ optionnel n'existait pas

`household.workLunch` était calculé (`household_meal_generation.ts:2113`) puis **jeté** :
`promptTrace` portait `eating_out` et pas lui. Donc `generated_from.household.work_lunch` n'était
sur **aucune** ligne — et **la requête de contrôle que j'avais écrite dans ma propre réserve
(§ déviation 3) aurait rendu `NULL` pour toujours.** Muté en `{0,0}` : les 4 876 tests restaient
verts, parce que mon test n'assérait que des chaînes d'**entrée**.

C'est le motif de la journée dans sa forme la plus fine : **j'avais nommé le risque, écrit la
compensation, et la compensation n'atteignait rien.** Un champ optionnel dont la compensation est
elle-même débranchée est un champ optionnel nu.

**Correctif** : `work_lunch: household.workLunch` dans `promptTrace`, et le test lit la **sortie**
— plus sa position dans `promptTrace`, qui est ce qui le fait atterrir à la fois sur la ligne
écrite et dans la réponse de l'aperçu.

### ③ L'explication attribuait à la personne des jours qu'elle n'avait pas choisis

Les `cookDays` **dérivés** partaient sous `declaredCookDays` — fait documenté « les jours que
l'élève a **COCHÉS** », gabarit « **Tu cuisines lundi et jeudi, et c'est ce qui a été gardé.** »
Sonde sur le cas nominal (« juste milieu », 2 courses, 7 jours) : elle n'avait coché ni lundi ni
jeudi. **Et le nombre de sessions n'était jamais dit** au cas nominal : mes deux phrases ne
s'allument que sur un plafond.

**Correctif** : les **trois** faits du mécanisme « jours cochés » (`declaredCookDays`,
`usableCookDays`, `addedCookDays`) se taisent **ensemble** quand les jours sont dérivés — n'en
vider qu'un ferait dire au plan qu'il a ajouté un jour à une liste vide. La dérivation parle avec
ses propres mots : « Le plan pose 2 sessions de cuisine : lundi et jeudi. » — « **le plan pose** »,
jamais « tu cuisines ».

⚠️ **Un piège évité de justesse en corrigeant** : mon `sed` de correction a d'abord touché AUSSI
les deux `...usableCookDays({` / `...addedCookDays({` de `rationaleCookDays`, qui ne sont pas des
faits de rationale mais **les jours SERVIS**, utilisés pour nommer le jour de la session unique.
Les vider aurait fait nommer une journée que le modèle n'a pas reçue — le défaut du run
`af04fd89-…`, réintroduit par un correctif. Rattrapé en relisant chaque site avant de committer :
**5 occurrences par lane, dont 2 à ne PAS toucher.**

### ④ « Équipement avant style » n'était ni tenu sur `/app/plan`, ni mesuré

`MealBuilder.tsx` : style → courses → **congélateur 178 lignes plus bas**. On acceptait « 1
course » avant de savoir s'il y a un congélateur, alors que « 1 course » ne tient QUE par lui.

**Correctif** : le bloc de l'inventaire remonte au-dessus du style. Le test **reste une lecture de
source, et il le dit** — monter `MealBuilder` demande un client Supabase vivant, et le patron
`renderToStaticMarkup` du dépôt ne s'applique qu'aux composants qui n'en ont pas besoin. Ce qui
rend la source suffisante ici est une **prémisse** (les trois blocs sont des frères du même parent,
sans condition entre eux, donc l'ordre du fichier EST l'ordre du DOM), et un second cas la
**vérifie** au lieu de la supposer.

### Mutations (4/4 rouges) — et une mutation qui a menti

| Mutation | Rouge |
|---|---|
| dérivation difficulté/variété retirée | `les TROIS leviers … atteignent la capacité SERVIE` |
| `work_lunch` retiré de `promptTrace` | `la lane FOYER passe le champ, et compte ce qu'il a donné` |
| phrase des sessions muette | `le nombre de sessions se DIT au cas nominal` |
| inventaire redescendu sous la session | 2 rouges, dont la prémisse |

⚠️ **La quatrième est arrivée VERTE au premier essai.** J'avais muté `<KitchenEquipmentCard` en
`<KitchenEquipmentCardMUTE` — que `indexOf` retrouve **par préfixe**. La mutation ne mutait rien.
**Une mutation qui ne rougit pas doit être suspectée avant le test qu'elle prétend éprouver.**

### ⛔ Une corruption que je me suis infligée, en corrigeant

Mes deux sauvegardes de scratch s'appelaient **toutes deux `index.ts.v2`** — `basename` est
identique pour les deux lanes. La seconde a écrasé la première, et le `cp` de restauration a copié
la lane **solo** par-dessus la lane **foyer** : 8 160 lignes remplacées par 4 490, **73 rouges**.

Réparée par `git show HEAD:<path>` (le fichier était commité), les quatre correctifs du foyer
ré-appliqués un par un, et le diff relu ligne à ligne pour vérifier qu'il ne contient QUE les cinq
changements voulus. C'est la cicatrice « horodater les fichiers d'une lane avant d'y écrire »,
dans sa version **basename** : deux lanes, deux `index.ts`.

### Suites après correctifs

- Deno `_shared/keel/` **en entier, sans exclusion** : **5 053 passés, 0 échec**.
- `deno check` vert sur les quatre fonctions · `tsc -b --force` **0**.
- vitest **2 149 / 2 173**, **quatre** rouges étrangers (coverage-guard ×2, awayFrom ×2).
