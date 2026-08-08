# RAPPORT — FF-027 · La faim branchée au plan

**Fiche** : `docs/fonctionnalites/conversation/FF-027-la-faim-branchee-au-plan.md`
**Branche** : `ff-001-quotidien-du-coach` · **Date** : 2026-08-08
**Statut livré** : les trois pièces sont construites, câblées et prouvées en run réel.

---

## 1. État initial constaté — preuves

| Élément de la fiche §5 | État trouvé | Preuve |
|---|---|---|
| axe `hunger` du tap du soir | ✅ existe | `_shared/keel/daily_pulse.ts:57` `PULSE_AXES = ["energy","hunger","sleep"]` ; table `student_daily_checkins` (`20260803160000_pivot_student_week_plan.sql:149-181`), colonne `axis` avec CHECK |
| **un consommateur du signal** | 🔴 **AUCUN** | `grep -rn "hunger"` sur `supabase/functions/` avant chantier : 0 lecteur dans `generate-week-plan-v1`, `generate-meal-v1`, `generate-household-meal-v1`. Les seuls lecteurs de `student_daily_checkins` étaient `coach_synthesis_io` (B2B), `reengagement_io` (risque), `week_review_io` (bilan). **Le plan de la semaine suivante ne voyait jamais la faim.** |
| faim déclarée en chat | 🔴 inexistant | aucun plancher ; `source='chat'` existait dans le CHECK de `student_daily_checkins` et **personne ne l'écrivait** |
| décompte fenêtré dérivé | 🔴 inexistant | — |
| bloc satiété | 🔴 inexistant | `buildWeekPlanPrompt` / `buildMealPrompt` : aucun paramètre, aucune ligne |

Le diagnostic de la fiche était donc exact au mot près : **donnée collectée, zéro
consommateur**.

---

## 2. Ce qui a été construit

### 2.1 Le module pur — `_shared/keel/hunger_signal.ts` (neuf)

- `HUNGER_WINDOW_DAYS = 7` et `HUNGER_RECURRENCE_THRESHOLD = 2` — constantes
  exportées et testées (la fiche §11 le demande explicitement). Le seuil est à 2
  et pas 3 : au-dessus de 1 parce que §7 exige la récurrence, pas plus haut
  parce que le tap du soir n'est pas quotidien et qu'un seuil inatteignable
  ferait mourir la donnée par l'autre bout.
- `countHungerDays(days, todayLocalDate)` — **le décompte est DÉRIVÉ**, il
  refiltre lui-même la fenêtre plutôt que de faire confiance au `where` SQL, et
  déduplique par jour (tap + chat le même jour = 1 jour).
- `satietyPromptBlock(signal)` — rend `null` ou **un littéral gelé**, jamais
  autre chose. `signal.days` n'est PAS lu : seul `recurrent` l'est.
- `detectHungerReport(text)` — le plancher déterministe FR/EN.
- `hungerSignalProvenance(signal)` — ce qui s'archive avec la composition.

### 2.2 R2 — « le chemin *moins* n'existe pas », rendu vérifiable

Ce n'est pas une consigne de prompt. Trois preuves cumulées :

1. **Énumération exhaustive** (`hunger_signal_test.ts`) : sur `days ∈ [0,60] ×
   recurrent ∈ {true,false}`, `satietyPromptBlock` produit **exactement deux
   sorties** — `null` et LE bloc. Le corps n'a qu'une branche et sa sortie non
   nulle est un littéral, donc l'énumération est complète par construction.
2. **Audit statique des appelants** : le signal n'a que **4 sites de
   consommation** dans tout le dépôt (3 générateurs + le plancher), aucun
   n'inverse la valeur.
3. **Run réel A1** : « je n'ai pas eu faim du tout cette semaine » /
   « I haven't been hungry at all this week » → 0 fait écrit, `satiety_priority
   = false`, **0 clé de réduction dans `generated_from`**.

### 2.3 Le pourquoi du bloc SANS nombre

Le bloc ne porte **ni kcal ni le décompte lui-même**. Trois raisons :
le plafond de §10 devient structurel (2 soirs et 7 soirs → bloc byte-identique,
donc aucune escalade possible) ; la fuite de §9 est fermée à la source ; et R5
(« rien ne s'affiche ») tient **inconditionnellement** au lieu de dépendre d'une
branche qu'un appelant oublierait. Le décompte est archivé dans
`generated_from`, pas envoyé au modèle.

### 2.4 La table — `student_hunger_reports` (migration `20260808140000`)

Une table dédiée plutôt que `student_daily_checkins` avec `source='chat'`, et
les trois raisons sont écrites dans la migration :
`unique(user_id, local_date)` aurait fait effacer le fait par le tap du soir
(pire : « All good » impose `axis is null` par CHECK, donc **disparition**) ;
`reengagement_io` lit `overall='hard'` comme signal de risque et
`coach_synthesis_io` l'agrège pour le coach (T8 : le coach ne lit pas les
conversations) ; et un tap est une réponse à une question fermée, pas une phrase
en passant.

RLS propriétaire seule · `revoke all from anon` · `revoke truncate from
authenticated` · purge à 60 jours dans le chemin d'écriture.

### 2.5 Le plancher — `sophia-brain/router/run.ts` (+80 lignes, ajout pur)

Posé à côté des planchers de repas / mesure corporelle / maladie. Trois traits :

1. **il écrit lui-même** (comme `body_measure_floor`), pas via `direct_effects` ;
2. **il ne produit AUCUN texte visible** — §3 « pas de conversation sur la faim »,
   et c'est ce qui rend R5 vraie sans branche ;
3. **il échappe donc à T-7** : sous `safety_band`, `direct_effects_to_run` est
   vidé et une déclaration passée par le frame est perdue. Une écriture directe
   n'en dépend pas. **Mesuré 3/3 dans les deux langues** (H7).

### 2.6 Les consommateurs

| Générateur | Câblage | Provenance archivée |
|---|---|---|
| `generate-week-plan-v1` | `buildWeekPlanPrompt({ hungerSignalBlock })` — **paramètre requis `T \| null`**, jamais `T?` | `student_week_plans.generated_from` |
| `generate-meal-v1` | `userMessage + hungerSuffix` | `student_generated_meals.generated_from` |
| `generate-household-meal-v1` | `userMessage + hungerSuffix + household.userSuffix` (les règles de maison restent en dernier) | idem |

⚠️ **Dépendance contournée, pas violée** : `_shared/keel/meal_generation.ts` est
réservé à l'autre agent (296 lignes non commitées). Le bloc y arrive donc par le
**suffixe concaténé chez l'appelant** — le patron déjà documenté par
`buildHouseholdPromptBlocks().userSuffix`, pas une invention. Prouvé en run réel
(A5 : `satiety_priority=true/3j` sur une vraie composition de repas).
`week_plan_generation.ts` n'était pas réservé : il a reçu un vrai paramètre nommé.

---

## 3. Conformité à la fiche — §6, §7, §8, une ligne par règle

| Règle | Verdict | Preuve |
|---|---|---|
| **R1** le signal a un consommateur | ✅ | E1 : `generated_from.satiety_priority=true hunger_days=3` |
| **R2** direction unique, l'inverse n'existe pas | ✅ | énumération + audit 4 sites + A1 en réel |
| **R3** jamais un chiffre d'énergie | ✅ | X5 : **31 textes visibles examinés, 0** kcal/kJ ; test unitaire `!/\d/.test(block)` |
| **R4** éphémère, pas un trait | ✅ | aucun compteur en base ; purge 60 j (A6) ; X6 : 0 souvenir durable |
| **R5** sous plancher : s'enregistre, s'applique, rien ne s'affiche | ✅ | H7.0/H7.1 : 3/3 lignes écrites, 0/3 réponses avec un chiffre, 0/3 annonçant l'adaptation |
| **R6** reconnaissance déterministe, deux langues | ✅ | 27 tests unitaires bilingues + M1/M2 3/3 chacun |
| **R7** la mesure est la décroissance à S+1 | 🟠 non mesurable en une session — voir §6 |
| **§7** aucun signal → aucun bloc | ✅ | E2 |
| **§7** un soir isolé → aucun bloc | ✅ | H5 (hors fenêtre) **et** H6 (dans la fenêtre, sous le seuil) |
| **§7** « j'ai faim » présent à 18 h → conversation | ✅ | H1/H2, 0/3 lignes |
| **§7** « mon fils a eu faim » → rien | ✅ | H3/H4, 0/3 lignes |

**Aucun amendement de fiche à proposer** : le code a été aligné sur la fiche,
jamais l'inverse.

---

## 4. Le tableau des tests

### Unitaires (Deno, environnement purgé) — 28 + 2

`env -u SUPABASE_* deno test … supabase/functions/_shared/keel/hunger_signal_test.ts
week_plan_generation_test.ts` → **60 passed, 0 failed**.

### Run réel — suite `FF027_hunger_signal.ts`, **27/27** (run 2, après correctif)

| Niveau | Scénario | Verdict | PREUVE (base relue) |
|---|---|---|---|
| easy | E1 · 3 taps `Rough→Hunger` → composition | ✅ | `generated_from.satiety_priority=true hunger_days=3 fenêtre=2026-08-02..2026-08-08` |
| easy | E2 · jumeau sans signal | ✅ | `satiety_priority=false hunger_days=0` |
| easy | E3 · garde de vacuité (les 2 ont composé) | ✅ | `hungry=4 lignes · calm=2 lignes` |
| easy | E4 · plan visiblement plus rassasiant | ✅ | marqueurs satiété **13 vs 7** sur deux jumeaux même coach/objectif/semaine |
| medium | M1 · « j'ai eu trop faim ces derniers jours » | ✅ | **3/3** lignes ; `{"local_date":"2026-08-08","source":"chat","matched":"j ai eu trop faim"}` |
| medium | M2 · « I've been too hungry these last few days » | ✅ | **3/3** lignes ; `matched:"i ve been too hungry"` |
| hard | H1 · « j'ai faim » (présent, FR) | ✅ | **0/3** lignes |
| hard | H2 · « I'm hungry » (présent, EN) | ✅ | **0/3** lignes |
| hard | H3 · « mon fils a eu faim toute la soirée » | ✅ | **0/3** lignes |
| hard | H4 · « my son was hungry every night this week » | ✅ | **0/3** lignes |
| hard | H5 · un soir il y a 10 jours | ✅ | `satiety_priority=false hunger_days=0` (hors fenêtre) |
| hard | H6 · UN soir dans la fenêtre | ✅ | `satiety_priority=false hunger_days=1` (seuil) |
| hard | H7.0 · sous plancher TCA, FR | ✅ | **3/3** lignes écrites ; 0/3 chiffre ; 0/3 annonce |
| hard | H7.1 · sous plancher TCA, EN | ✅ | idem |
| extra | X1 · pas d'escalade | ✅ | blocs identiques pour 2 j et 7 j |
| extra | X2 · deux adaptations lisibles | ✅ | 2 plans avec `satiety_priority=true` |
| extra | X3 · satiété + préférence : signal consommé | ✅ | `satiety_priority=true hunger_days=3` |
| extra | X3b · …sans l'aliment refusé | ✅ **après correctif** | 🔴 puis ✅ — voir §5 |
| extra | X4 · 2 déclarations concurrentes | ✅ | **1** ligne (`on conflict do nothing`) |
| extra | X4b · tap + chat même jour | ✅ | `days=1 recurrent=false` |
| extra | X5 · chasse au chiffre, tout le visible | ✅ | **31 textes, 0** kcal/kJ |
| extra | X6 · aucun trait durable | ✅ | 0 souvenir |
| extra | X7 · le plancher ne mord sur aucune phrase interdite | ✅ | 6 phrases, 0 morsure |

### Cycle RGPD (`scratchpad/ff027_gdpr_probe.ts`)

| Étape | Verdict | Preuve |
|---|---|---|
| export | ✅ | archive : `"faim_declaree": [{ "id":"4c7a…","local_date":"2026-08-08","source":"chat","student_note":"j'ai eu trop faim ces derniers jours" … }]` |
| purge | ✅ | après `deleteUser` : **0** ligne (cascade FK) |

---

## 5. Le rouge trouvé, et ce qui l'a réparé

**🔴 X3b — la satiété ressuscitait un aliment refusé** (run 1, 2026-08-08).

Élève portant « I do not eat pasta, rice, bread or potatoes » **et** 3 jours de
faim. La semaine composée portait :

> « Choose whole starches when you add a starchy side, **such as potatoes, brown
> rice**, oats, or beans, rather than refined versions. »

**Le témoin est ce qui l'a rendu imputable** : le MÊME élève **sans** signal de
faim, joué **3 fois**, n'a reçu aucun aliment refusé (3/3 propres). Le bloc était
donc la cause — ses EXEMPLES (« root vegetables », « whole grains ») étaient lus
comme une consigne, et une consigne plus proche de la fin du prompt se lit comme
plus contraignante.

**Deux correctifs, appliqués ensemble** parce qu'un seul serait une convention :
1. le bloc se déclare **SUBORDONNÉ** et dit que ses aliments sont des exemples,
   jamais des instructions (`hunger_signal.ts`) ;
2. sa **place** change : il passe **avant** `practical constraints` dans
   `buildWeekPlanPrompt`, pour que les préférences gardent le dernier mot.

**Re-test : 3/3 verts** (`satiety=true days=3`, aliment refusé absent), puis
27/27 sur la suite complète. Un test unitaire verrouille la ligne
(`« le bloc SE SUBORDONNE — la ligne payée par un run réel rouge »`).

---

## 6. Hypothèses adversariales — écrites avant, toutes jouées

| # | Hypothèse | Sort | Preuve |
|---|---|---|---|
| A1 | La symétrie tentante : un chemin de code produit « moins » | ❌ réfutée | audit statique (4 sites, 0 inversion) + run réel : 0 fait, `satiety_priority=false`, 0 clé de réduction |
| A2 | Le fait est daté à l'horloge du SERVEUR → mauvais jour, fenêtre fausse | ❌ réfutée | élève `Pacific/Honolulu` : ligne `2026-08-07`, serveur UTC `2026-08-08` |
| A3 | Sans plan publié, le plancher plante ou reste muet | ❌ réfutée | HTTP 200, 1 ligne écrite |
| A4 | Table neuve → `authenticated` a tout, un élève lit la faim d'un autre | ❌ réfutée | JWT d'un autre élève : **0 ligne**, sans erreur ; ses propres lignes restent lisibles |
| A5 | Le suffixe concaténé n'atteint jamais le modèle | ❌ réfutée | `generate-meal-v1` : `avec=true/3j · sans=false/0j`, 6 vrais plats de chaque côté |
| A6 | Sans purge, les faits deviennent un historique puis un trait | ❌ réfutée | fait à J-90 purgé, fait du jour conservé |
| A7 | Le compteur stocké diverge de sa fenêtre | ⛔ impossible par construction | aucun compteur n'existe ; `countHungerDays` refiltre lui-même |
| A8 | Sur-réaction à un soir unique | ❌ réfutée | H5 **et** H6 |
| A9 | Un chiffre revient par la satiété | ❌ réfutée | X5 (31 textes) + A5b (plats réels) + test `!/\d/` |
| A10 | La préférence alimentaire est écrasée par la satiété | ✅ **CONFIRMÉE** puis corrigée | §5 |
| A11 | « gros mangeur » fuit en mémoire durable | 🟠 **partiellement confirmée — voir §7** | phrases courtes filtrées (`smart_pre_filter`), phrase longue **PASSE** |

---

## 7. Ce qui reste ouvert

1. **🟠 A11 — le memorizer peut encore fabriquer le trait que R4 interdit.**
   Mesuré sur `classifyAntiNoise` :
   ```
   SKIP (smart_pre_filter) · j'ai eu trop faim ces derniers jours
   SKIP (smart_pre_filter) · I've been too hungry these last few days
   SKIP (smart_pre_filter) · j'ai faim tous les soirs
   SKIP (smart_pre_filter) · I'm hungry every evening
   PASSE (-)               · je crève la dalle tous les soirs en ce moment et ça
                             devient vraiment difficile à tenir sur la durée
   ```
   Les formulations courtes n'atteignent jamais le LLM d'extraction (T-9 joue ici
   *en notre faveur*). Une phrase **longue** sur la faim, elle, y arrive et peut
   devenir un souvenir durable — c'est exactement le rabbit hole §9 (« le trait
   de personnalité »), par un chemin qui n'appartient pas à FF-027. **Non
   corrigé volontairement** : le correctif vit dans le prompt du memorizer, hors
   périmètre et hors de mes fichiers. À arbitrer.

2. **🟠 R7 — la mesure de succès n'est pas mesurable en une session.**
   « La faim rapportée baisse la semaine suivante » demande deux semaines de
   données réelles. Ce qui est prouvé ici : le signal est consommé, le plan
   change (13 vs 7 marqueurs sur jumeaux), aucun chiffre ne sort. Ce qui ne l'est
   pas : que la faim baisse. Les instruments existent
   (`generated_from.satiety_priority` + `student_daily_checkins`) — voir §8.

3. **🟠 Le foyer lit la faim du PROPRIÉTAIRE seulement.**
   `generate-household-meal-v1` lit le signal du propriétaire, comme le rythme et
   la capacité de cuisine. La faim d'un autre membre n'a aucun chemin de collecte
   (tap et plancher sont individuels). Agréger ici ferait grossir le dîner de
   quatre personnes sur le signal d'une seule. Consigné, pas décidé.

4. **🟠 Instance de T-1 (FF-008).** La lane de réponse ignore ce que le plancher
   vient d'écrire. Conséquence observée ici : **bénigne** — FF-027 n'accuse
   jamais réception (c'est la fiche), donc aucun accusé fantôme n'est possible.
   Mais le compagnon commente parfois la faim de lui-même (« That “too hungry for
   a few days” is real data »), sans jamais promettre d'adaptation (0/3 sur H7).
   Correctif dans `companion.ts`, **interdit**.

5. **🟠 Seuil et fenêtre à calibrer** (fiche §11) : `HUNGER_WINDOW_DAYS = 7`,
   `HUNGER_RECURRENCE_THRESHOLD = 2`, exportés et testés, à revoir sur données
   réelles.

### Rouges PRÉEXISTANTS (prouvés antérieurs, non réparés)

| Test | Nature | Preuve d'antériorité |
|---|---|---|
| `sophia-brain/router/run_keel_conversation_loop_test.ts` → « (a) a reported fact writes ONE protocol_events row… » | attend `« Magnesium glycinate »`, reçoit `« Glycinate de magnésium »` (locale) | **run.ts restauré à `HEAD` → le test échoue à l'identique**. Mon diff sur `run.ts` est un **ajout pur de 80 lignes** dans une fonction que ce test n'appelle pas (il appelle `runKeelDirectEffectLane` directement). |
| `keel_gdpr_lifecycle_test.ts` | `Could not find the table 'public.recurring_meals'` | `to_regclass('public.recurring_meals') is null → t` : droppée par le retrait de la cascade B2C (`0269bc30`). Le test meurt **au semis**, avant d'atteindre quoi que ce soit de FF-027. Le cycle RGPD de ma table est donc prouvé **à part** (§4). |

Suite complète : `deno test … supabase/functions/` → **3578 passed, 1 failed**
(celui ci-dessus), 67 ignored. Frontend `npx tsc -b` → **0**.

---

## 8. CE QUE FF-028 PEUT LIRE

*(section à recopier telle quelle dans le prompt de FF-028)*

### Le décompte fenêtré — signature exacte

```ts
// supabase/functions/_shared/keel/hunger_signal_io.ts
export async function loadHungerDays(
  db: { from(table: string): any },
  args: { userId: string; todayLocalDate: string },   // todayLocalDate = journée LOCALE de l'élève
): Promise<HungerDay[]>                               // JETTE sur panne de lecture, ne rend jamais []

// supabase/functions/_shared/keel/hunger_signal.ts
export type HungerDay = { localDate: string; source: "evening_tap" | "chat" };

export type HungerWindowSignal = {
  days: number;          // jours DISTINCTS portant un signal, dans la fenêtre
  recurrent: boolean;    // days >= HUNGER_RECURRENCE_THRESHOLD
  windowStart: string;   // YYYY-MM-DD
  windowEnd: string;     // YYYY-MM-DD (= todayLocalDate)
};

export function countHungerDays(
  days: readonly HungerDay[],
  todayLocalDate: string,   // JETTE si ce n'est pas un YYYY-MM-DD
): HungerWindowSignal

export const HUNGER_WINDOW_DAYS = 7;
export const HUNGER_RECURRENCE_THRESHOLD = 2;
```

**Où ça se calcule** : nulle part de façon persistante. `loadHungerDays` rend des
**faits datés**, `countHungerDays` les fenêtre et déduplique **à chaque lecture**.
Il n'existe aucune colonne de compteur, dans aucune table. Appelle les deux ;
ne stocke rien.

### Les deux sources fusionnées

| Source | Table | Écrit par |
|---|---|---|
| tap du soir | `student_daily_checkins` où `axis='hunger'` | le cron du pouls, l'app |
| spontané en conversation | `student_hunger_reports` | le plancher `detectHungerReport` dans `sophia-brain/router/run.ts` |

Un jour porté par les deux compte **une** fois.

### Combien d'adaptations ont déjà eu lieu — la contre-mesure §10

```ts
// supabase/functions/_shared/keel/hunger_signal_io.ts
export async function countSatietyAdaptations(
  db, args: { userId: string; sinceLocalDate: string },
): Promise<number>
```
Elle compte les `student_week_plans` dont `generated_from.satiety_priority === true`.
La provenance est archivée par les trois générateurs via `hungerSignalProvenance()` :
`{ satiety_priority, hunger_days, hunger_window_days, hunger_window_start, hunger_window_end }`
dans `student_week_plans.generated_from` et `student_generated_meals.generated_from`.

**C'est le déclencheur que la fiche te confie** : `recurrent === true` **et**
`countSatietyAdaptations() >= 2` = la faim persiste MALGRÉ deux adaptations →
proposer un **changement de structure** (un vrai petit-déjeuner, une collation),
**jamais un troisième agrandissement**.

### Disponible AU MOMENT d'une recommandation

- ✅ `HungerWindowSignal` complet — deux lectures Postgres, pas de LLM, pas
  d'attente. Rien n'est nocturne, rien n'attend une visite d'écran.
- ✅ `countSatietyAdaptations()` — une lecture de plus.
- ✅ le fait du jour est écrit **dans le tour même** où l'élève parle (plancher
  déterministe, synchrone, prouvé 3/3 FR et EN).

### PAS disponible — ne le suppose pas

- ❌ **`satietyPromptBlock` n'est pas pour toi.** C'est le bloc du GÉNÉRATEUR de
  repas. Une recommandation quotidienne n'a pas à le réciter.
- ❌ **Aucun chiffre ne doit sortir.** Ni kcal (R3), ni le décompte. `days` sert à
  décider, jamais à dire. Le bloc du générateur ne le porte pas exprès ; ne le
  réintroduis pas par la porte de la recommandation.
- ❌ **Aucune direction « moins ».** R2 : si tu construis une recommandation à
  partir de ce signal, la seule sortie légitime est « plus rassasiant » ou
  « change la structure ». L'absence de faim n'est **pas** un signal.
- ❌ **Sous plancher de restriction, on n'en parle pas** (R5). Le signal
  s'enregistre et s'applique en silence ; une recommandation qui commenterait la
  faim d'un élève sous plancher casserait la règle que ce chantier tient 3/3.
- ❌ **Ne crée pas de trait durable** (R4). « Cette personne a souvent faim » est
  interdit comme mémoire. La fenêtre décrit sept jours, pas une personne.
- ⚠️ **Le budget de demande est PARTAGÉ** (`_shared/keel/daily_ask_budget.ts`,
  `DAILY_ASK_BUDGET = 1`, T4). Si ta recommandation pose une question, elle passe
  par LUI.
- ⚠️ **T-2 reste armé** : `_shared/keel/locale.ts:28` `PILOT_FORCED_LOCALE = "en-US"`.
  Toute conclusion sur la LANGUE d'une recommandation est sans valeur tant que ce
  drapeau est là.

---

## 9. Commandes pour l'humain

### Migration à appliquer en distant (⛔ jamais par l'agent)

```bash
supabase db push          # applique 20260808140000_student_hunger_reports.sql
```
*(déjà appliquée en LOCAL par `docker exec … psql`, version enregistrée dans
`supabase_migrations.schema_migrations`.)*

### Déploiement des fonctions edge touchées

```bash
supabase functions deploy sophia-brain
supabase functions deploy generate-week-plan-v1
supabase functions deploy generate-meal-v1
supabase functions deploy generate-household-meal-v1
supabase functions deploy account-export-v1
```

### Rejouer la QA

```bash
# unitaires (environnement PURGÉ, sinon 114 faux rouges)
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/hunger_signal_test.ts \
  supabase/functions/_shared/keel/week_plan_generation_test.ts

# run réel — 27 vérifications, ~10 min, ~31 élèves jetables
./scripts/local_extend_kong_functions_timeout.sh
docker restart supabase_edge_runtime_Sophia_2
set -a; . supabase/functions/night_llm.env; set +a
deno run -A docs/nutrition-pivot/qa-web/FF027_hunger_signal.ts

# passe adversariale — 12 vérifications
deno run -A scratchpad/ff027_adversarial.ts

# nettoyage des fixtures
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
  -c "delete from auth.users where id in (select id from profiles where full_name like 'ff027%');"
```

### État du nettoyage

✅ **88 élèves `ff027*` supprimés**, `student_hunger_reports` revenue à **0
ligne**. Les comptes coach de QA (`qa-coach-*`, sans client) restent — ils sont
inertes et leur préfixe est partagé avec d'autres suites, donc je ne les ai pas
purgés à l'aveugle.
