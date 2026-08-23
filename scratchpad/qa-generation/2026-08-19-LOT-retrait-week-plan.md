# LOT — RETRAIT DE LA LANE `generate-week-plan-v1`

**2026-08-19** · exécution de la décision prise après le
[dossier de retrait](2026-08-19-DOSSIER-RETRAIT-week-plan.md).
Périmètre tenu : **le producteur part, la table reste.**

---

## RÉSULTAT EN CINQ LIGNES

1. **La fonction edge est supprimée**, avec ses deux enveloppes front mortes, la lecture
   vestigiale de `/app/plan`, et **7 tests deno** qui n'existaient que pour elle.
2. **La table `student_week_plans` n'a pas été touchée** : 246 lignes, 4 CHECK, 1 trigger,
   1 policy, 3 index, tous intacts et vérifiés en base après coup. La migration de retrait
   est **écrite et non appliquée**, hors de `supabase/migrations/`.
3. **Suite de tests : identique à la référence.** `4 échecs / 1639 passés / 20 ignorés`
   avant, **`4 échecs / 1639 passés / 20 ignorés` après**. Les 4 rouges sont les mêmes,
   préexistants et étrangers. Deno `_shared/keel/` : **0 échec**.
4. **Deux lecteurs vérifiés en base**, dont celui que le coach voit : ils rendent exactement
   les mêmes nombres qu'avant.
5. **Une correction au dossier** : sur `student_generated_meals`, 69 lignes portent bien
   `satiety_priority` — mais **aucune ne vaut `true`**. Le détail est en §6, il change ce
   que la tâche `countSatietyAdaptations` doit attendre.

---

## 1. CE QUI EST PARTI, FICHIER PAR FICHIER, AVEC SON ÉPREUVE D'ABSENCE

> **Méthode.** Chaque symbole a été passé au `grep` **brut** sur tout le dépôt (`-w`, tous
> types de fichiers), puis les résultats relus **ligne à ligne** pour séparer les appels des
> commentaires. Le dossier signalait qu'un dé-commentateur maison avait **silencieusement
> échoué sur le TSX** ; je ne m'en suis donc pas servi. Les deux méthodes croisées sont le
> `grep` brut et la relecture du site d'appel.

### 1.1 `supabase/functions/generate-week-plan-v1/` — **dossier supprimé**

| Épreuve | Résultat |
|---|---|
| `invoke("generate-week-plan-v1")` dans le dépôt | **1 seul site**, `api/weekPlan.ts:142`, dans `generateWeekPlan` — elle-même sans appelant |
| Nom construit dynamiquement | **aucun** (`"generate-" + …`, table de noms, `invoke(variable)`) |
| Vues, vues matérialisées, `pg_proc.prosrc` | **0** (les 2 hits `prosrc` sont des commentaires SQL) |
| `cron.job` | **0** sur 23 tâches |
| `supabase/config.toml`, `.github/`, `.claude/` | **aucune mention** |
| Lecture de son `index.ts` par un test | 9 fichiers — traités en §2 |

⚠️ **Ce que la suppression a emporté, et qu'il faut savoir :** le fichier portait **27 lignes
non commitées** — le correctif « régime alimentaire absent du prompt de semaine » de l'agent
1A, livré pendant ce chantier sur cette lane inatteignable. Il n'existait nulle part ailleurs.
**Je l'ai archivé avant de supprimer**, il est récupérable :
`scratchpad/qa-generation/retrait-week-plan-archive/2026-08-19-generate-week-plan-v1-index.ts.txt`
(+ le `config.toml`). Le paramètre `dietBlock` qu'il utilisait **reste** dans
`week_plan_generation.ts`, avec son test de moteur : c'est le câblage qui a disparu, pas le
moteur.

### 1.2 `frontend/src/keel/api/weekPlan.ts` — deux exports retirés, trois **gardés**

| Symbole | Appelants vivants | Verdict |
|---|---|---|
| `generateWeekPlan` (:137) | **0** — seule sa déclaration, plus des `.md` de scratchpad | ❌ **retiré** |
| `adoptWeekPlan` (:177) | **0** | ❌ **retiré** |
| `readInvokeError` (import) | utilisé **uniquement** par `generateWeekPlan` dans ce fichier | ❌ **import retiré** (le module `keelClient` garde ses autres appelants) |
| `loadWeekPlan` (:83) | **1** — `TodayPage.tsx:61` (import) → `:948` (appel) | ✅ **gardé** |
| `currentMonday` (:62) | **1** — `TodayPage.tsx:60` → `:946`. ⚠️ `StudentWeekPlanPage:278` a **sa propre** `currentMonday` locale, homonyme et sans rapport | ✅ **gardé** |
| `weekPlanDaySplit` (:206) | **1** — `TodayPage.tsx:62` → `:228` | ✅ **gardé** |
| `WeekPlanRow`, `WeekPlanItem` | `TodayPage.tsx:63,64,222,413,869` | ✅ **gardés** |
| `COLUMNS` (:51) | encore lu par `loadWeekPlan` | ✅ **gardé** |

Le module devient **lecture seule** et le dit dans son en-tête, avec la raison du retrait et
l'interdiction de rebrancher un écrivain par symétrie.

### 1.3 `frontend/src/keel/pages/StudentWeekPlanPage.tsx` — la lecture vestigiale

`planRes` n'avait que **deux** occurrences dans le fichier : sa déclaration (`:1333`) et
`if (planRes.error) throw …` (`:1381`). **`planRes.data` n'était jamais lu.** La requête est
retirée du `Promise.all`, avec son test d'erreur. Le commentaire voisin disait « deux de ces
**trois** tables portent une policy coach » — corrigé, elles sont deux sur deux.

⚠️ **Ce fichier appartient aussi à une autre session.** Mes hunks sont les trois ci-dessus,
rien d'autre. Un `export function goalOptions` ajouté par cette autre session y provoque une
erreur eslint `react-refresh/only-export-components` (ligne 248) : **elle n'est pas de moi**
(le symbole est absent de `HEAD`), et je ne l'ai pas touchée.

### 1.4 Documents d'autorité

- **`CLAUDE.md`** — la chaîne devient `student_goals → generate-meal-v1 →
  student_generated_meals`, sur une fenêtre de 1 à 7 jours. ⚠️ **Chaîne vérifiée moi-même
  avant écriture**, maillon par maillon : `MealBuilder.tsx:788` → `generateMeal`
  (`api/mealGeneration.ts:615`) → `invoke("generate-meal-v1")` (`:618`) → écriture
  `student_generated_meals` (`generate-meal-v1:1091`, RPC `write_student_meal_plan:2660`) ;
  `student_goals` lu 6 fois dans cette lane ; `MAX_WINDOW_DAYS = 7`
  (`api/mealWindow.ts:47`). Un bloc d'avertissement nomme ce que le retrait coûte, et
  interdit de rebrancher un écrivain sans décision produit.
- **`docs/keel/MODEL.md`** — même correction, plus une section
  « ⚠️ CE QUE LE RETRAIT DE LA LANE DE SEMAINE A COÛTÉ » qui **conserve la description de
  l'objet perdu** (lignes de conduite, `source_belief_key`, CHECK en base) au lieu de
  l'effacer. C'était l'objection centrale du dossier : un document qu'on aligne sur un code
  amputé efface la trace du défaut. Ici la trace est écrite noir sur blanc.

### 1.5 Pages de vente — la ligne 05 et **quatre équivalents que le dossier ne listait pas**

**`ProPage.tsx` ligne 05 (B27)** — la ligne est **retirée**, pas reformulée, avec ses trois
clés i18n (`pro.line.cite.pain|title|body`, en + fr). La ligne 06 devient 05. Un commentaire
en place **interdit explicitement** de la remplacer par une promesse équivalente sur les
plats, et dit pourquoi : `generated_from.belief_keys` porte la provenance du **plan**, pas
d'une **ligne**, et c'est annoté « jamais exigé, jamais vérifié par un CHECK ».

En traitant celle-là j'ai trouvé **quatre autres surfaces publiques** qui portaient la lane
autrement. Le prompt demandait de le dire et de les traiter pareil :

| Surface | Ce qu'elle disait | Traitement |
|---|---|---|
| `pro.line.daily.body` (en+fr) | « It reaches **four** places: the chat, **the week they build**, … » | comptage corrigé à **trois**, membre mort retiré |
| `gyms.day.body` (en+fr) | « in the chat, **in the week they compose**, and in every meal » | membre mort retiré |
| `coaches.lock.scope` (en+fr) | « into the chat, **into every week** and into every meal » | membre mort retiré |
| `coaches.fig.method.out2` + `MethodFigure` (SVG) | figure à **4 sorties**, la 2ᵉ étant « the week they build » | clé supprimée, out3→out2, out4→out3, **et la géométrie refaite à 3 boîtes** (bus recentré sur y=136, pas de 48 inchangé) |

⚠️ **Les trois points d'injection restants sont vérifiés, pas recopiés** :
`run.ts:2448` · `generate-meal-v1:1729` · `generate-household-meal-v1:3569`, les trois
`doctrineBlockFor(doctrine)`. Les numéros des commentaires `fact: B10` étaient **déjà
périmés** (2414 / 1122 / 2338) ; ils sont corrigés au passage.

**`FamiliesPage` — le cas le plus sérieux, et c'est un jugement que je signale.**
`families.age.body` disait au public : *« une semaine qui viserait un enfant est **refusée là
où elle se fabrique**, pas filtrée à l'écran »*. Ce refus était le `409 minor_student` de
`generate-week-plan-v1:435-457` — **seul producteur de cette phrase dans tout le produit** :
vérifié, ni `generate-meal-v1` ni `generate-household-meal-v1` ne portent de garde
`minor_student`. La promesse serait devenue sans objet, exactement comme la ligne 05.

Je ne l'ai **pas** supprimée en entier parce que la protection, elle, existe toujours — et je
l'ai vérifiée avant d'écrire : `weekPlanAgeGate` (`student_age.ts:199`) est appelée par
`energy_gate.ts:275` (porte ②, un mineur **ferme** la porte) et par `household_portions.ts`
pour la part du foyer ; une porte fermée ne rend **aucun** chiffre, et c'est asserté par
`no_calorie_to_student_property_test.ts` (« a closed gate sends no number at all »). La copie
nomme donc désormais **la porte qui existe** :

> « A minor is never a nutritional target: **the number is closed where it is computed**, not
> filtered on the screen. Their share follows their age. »

Le commentaire de provenance explique le changement et **interdit** de réécrire vers un refus
de lane.

### 1.6 `scripts/export_llm_prompt_dump.mjs:48`

La ligne d'aide listait `generate-week-plan-v1` comme valeur de `--source`. Corrigée — et
l'avertissement du briefing est écrit sur place : **`--source` sans correspondance vide
silencieusement une AUTRE lane, code de sortie 0.** Passer une lane morte y menait tout droit.

---

## 2. LES TESTS — 7 RETIRÉS, ET CE QUE J'AI **GARDÉ EXPRÈS**

> La cicatrice du dépôt s'applique ici mot pour mot : **« des références legacy doivent
> survivre — les retirer EST le bug ».** J'ai donc séparé deux populations.

### 2.1 Retirés — ils n'existaient **que** pour cette lane (7 tests deno)

| Fichier | Test | Pourquoi il meurt avec elle |
|---|---|---|
| `draft_note_classify_wiring_test.ts` | « LANE WEEK-PLAN — elle ne lit AUCUNE note de brouillon » | c'était un **constat** sur le source du fichier supprimé |
| `household_doctrine_test.ts` | « O7 — LE PLAN DE LA SEMAINE PASSE PAR LA MÊME PORTE (C2 ①) » | lisait `index.ts` de bout en bout |
| `dietary_regime_solo_lane_test.ts` | « la lane semaine PASSE la consigne, depuis le moteur » | test de **câblage** ; il n'y a plus de câblage |
| `household_freeze_test.ts` | « C5 ⑦ … — generate-week-plan-v1/index.ts » | test généré par lane |
| `meal_plan_integrity_test.ts` | « C6 ② … — generate-week-plan-v1 » | test généré par lane |
| `retained_items_wiring_test.ts` | « LANE WEEK-PLAN — LE CÂBLAGE EST LÀ » **et** « … ET L'ÉPINGLE ROUGIT QUAND ON LE RETIRE » | objet `Lane` entier |

⚠️ **Aucune propriété n'a été abandonnée, et je l'ai vérifié plutôt que supposé.** Le cas le
plus tendu était `household_doctrine_test.ts` : avant d'écrire dans le fichier que les gardes
survivent, j'ai été les lire. Elles sont nommées une par une dans le commentaire laissé en
place — repli par le foyer / `loadPublishedDoctrine` fermé / `coach_clients` et `keel_role`
absents / foyer résolu une fois → test « O7 — LE GÉNÉRATEUR PASSE PAR LA PORTE » juste
au-dessus, sur `generate-meal-v1` ; gel 402 avant le premier appel modèle, motif nommé,
`skipErrorLog` → `household_freeze_test.ts`, sur les **deux** lanes restantes.

### 2.2 Gardés — ils vérifient **une autre propriété** en citant la lane au passage

| Fichier | Ce qu'il garde vraiment | Geste |
|---|---|---|
| `solo_access_test.ts` (4 boucles) | aucun refus 402/403 sur le droit d'accès ; mesure écrite sur la ligne ; mesure **avant** l'appel modèle ; tag partagé | entrée retirée de la liste, **boucles conservées à un élément** — la propriété est « sur CHAQUE porte solo » |
| `household_freeze_test.ts` (2ᵉ boucle) | aucun générateur ne rend `[object Object]` | entrée retirée |
| `household_voices_test.ts` | `actor: "row_owner"` sur les générateurs | entrée retirée |
| `meal_plan_integrity_test.ts` | la correction de goût s'écrit **après** le plan | entrée retirée |
| `no_calorie_to_student_property_test.ts` | la cible n'atteint un générateur que par la porte | entrée retirée |
| `retained_items_wiring_test.ts` (assertions communes) | les deux magasins, `speaksFor` non vide, ordre, pas de trace de canal | `LANES` passe à 2, helpers **tous encore utilisés** (vérifié un par un) |
| **`dietary_regime_solo_lane_test.ts` — test de MOTEUR** | « la consigne de régime entre dans le message de SEMAINE » (`buildWeekPlanPrompt`) | ✅ **gardé**, et c'est délibéré : le moteur vit dans `week_plan_generation.ts`, qui reste chargé |
| **`week_plan_generation_test.ts` (entier)** | le moteur de semaine | ✅ **gardé intégralement** |
| `student_week_plan_test.sql`, `a13_isolation_rls_test.sql` | la table et sa RLS | ✅ **gardés** — la table reste |
| `keel_gdpr_lifecycle_test.ts` | l'export RGPD | ✅ **gardé** — je n'ai pas touché `account-export-v1` |

⚠️ **J'ai renommé deux tests de `solo_access_test.ts`** dont le titre était devenu faux
(« AUCUNE DES DEUX PORTES », « LES DEUX PORTES »). Un test dont le nom ment sur ce qu'il
couvre est pire qu'un test absent.

### 2.3 `coverage-guard.int.test.ts` — la question posée, et la réponse mesurée

L'entrée `"generate-week-plan-v1"` est **retirée** : elle déclarait un répertoire qui n'existe
plus. Le commentaire laissé en place dit ce que ce test **n'est pas** — *il compte des
dossiers, jamais des appelants* — puisqu'il a servi d'argument de vie pour une lane morte.

**Le test reste rouge, et exactement de la même façon** (mesuré des deux côtés) :

| | fonctions sur disque | déclarées | écart |
|---|---:|---:|---:|
| avant | **56** | 53 | **3** |
| après | **55** | 52 | **3** |

Les 3 non déclarées sont, avant comme après : `household-merge-notices-v1`,
`keel-daily-recommendation-v1`, `keel-plan-feedback-v1`. **Étrangères à ce lot, non touchées.**
Note au passage : le briefing annonçait 55→54, c'était **56→55** ; l'écart de 3, lui, était juste.

---

## 3. CE QUE JE N'AI PAS TOUCHÉ — ET LA PREUVE QUE ÇA TIENT

### 3.1 La table

```
246 lignes · 221 en 'adopted' · 46 items au total
4 CHECK : ..._doctrine_traceable_check · ..._kind_closed_check · ..._status_check · ..._check
1 policy : student_week_plans_owner_all       1 trigger : ..._set_updated_at
3 index  : _pkey · _user_id_week_start_key · _user_week_idx
```

Relevé **après** le retrait. Aucun `drop`, aucune migration appliquée, aucune écriture.

### 3.2 Les lecteurs — deux vérifiés en base, dont la surface du coach

Le prompt demandait d'en vérifier au moins deux, dont `coach_synthesis_io.ts:343`. J'ai
**rejoué leurs requêtes exactes** sur la pile locale :

| Lecteur | Requête rejouée | Résultat |
|---|---|---|
| **`coach_synthesis_io.ts:343`** ⚠️ *vue par le coach* | `select items, status … where user_id = ? and week_start = ?` | **246 lisibles, 221 adoptées, 46 items** — inchangé |
| `following_io.ts:193` | `select id … where user_id = ? and status = 'adopted'` | **221** — inchangé |

Ni l'un ni l'autre n'importe quoi que ce soit de supprimé : les deux interrogent PostgREST
directement. Et sur la surface du coach, `planned` est calculé
`weekPlan?.adopted || composedMeals > 0` (`coach_synthesis.ts:488`) — `composedMeals` lit
`student_generated_meals`, la moitié vivante depuis le commit `99697610`. **Le coach ne perd
rien qu'il voie.**

Les trois autres (`hunger_signal_io.ts:200`, `account-export-v1:806`,
`api/weekPlan.ts` → `TodayPage`) sont intacts, aucune ligne modifiée.

### 3.3 Les trois modules des sessions parallèles

`_shared/keel/meal_generation.ts`, `household_portions.ts`, `household_safety.ts` :
**aucune modification de ma part.** Ils apparaissent modifiés dans `git status` — c'est le
travail des autres agents. Mes seuls fichiers dans `_shared/keel/` sont les **8 fichiers de
test** listés en §2.

---

## 4. MODULES ET SYMBOLES DEVENUS ORPHELINS — **listés, non supprimés**

Conformément à la consigne : un autre lot les traitera au calme.

### 4.1 Orphelin complet — plus **aucun** appelant, ni test

| Symbole | Fichier | État |
|---|---|---|
| `escalateMinorStudent` | `_shared/keel/student_body_io.ts:447` | **0 appelant, 0 test.** La lane retirée était son unique consommateur (`index.ts:556`) |

### 4.2 `_shared/keel/week_plan_generation.ts` — **le module RESTE, il est porteur**

⚠️ **À ne surtout pas supprimer** : la lane du repas en dépend. Deux exports ont encore des
lecteurs de production —
`findNumericTarget` (→ `meal_generation.ts:53`, `plan_draft_note.ts:72`) et le type
`StudentGoal` (→ `activity_floor.ts:48`, `plan_feedback.ts:36`, `student_body.ts:47`).

Deviennent **orphelins de production** (toujours couverts par des tests) :
`buildWeekPlanPrompt` · `parseWeekPlan` · `weekPlanItemsPayload` ·
`WEEK_PLAN_PROMPT_VERSION` · `WEEK_PLAN_SYSTEM_PROMPT` (transitif) · `CoachPrinciple`.

📌 **`focusFor`, `STUDENT_GOALS`, `ALLOWED_ACTION_KINDS`, `GeneratedWeekPlan`,
`StudentSituation`, `WeekPlanItem` étaient DÉJÀ sans lecteur de production avant moi** — la
lane ne les importait pas. Ce n'est pas mon retrait qui les orpheline, et le dire évite de
me les attribuer.

⚠️ Rappel de `docs/keel/RETRAIT-POINT-DU-DIMANCHE.md:294` : `WEEKLY_AXIS_LABELS_EN` et le
type `WeeklyAxis` sont importés **par** ce module. Le supprimer les emporterait.

---

## 5. ÉTAT DE LA SUITE — AVANT / APRÈS

| Suite | Avant | Après | Verdict |
|---|---|---|---|
| **vitest** (`frontend`) | `4 échecs / 1639 passés / 20 ignorés` | **`4 échecs / 1639 passés / 20 ignorés`** | ✅ **identique** |
| **deno** `_shared/keel/` | — | **0 échec** (3704 passés) | ✅ |
| `no_calorie_to_student_property_test.ts` | — | **0 échec** (14 passés) | ✅ |
| `tsc -p frontend/tsconfig.app.json --noEmit` | — | **0** | ✅ |
| `deno check` (4 entrypoints edge restants) | — | **0** | ✅ |
| eslint (mes fichiers) | — | 1 erreur, **étrangère** (§1.3) | ⚠️ pas de moi |

**Le compte de passés vitest est inchangé, et c'est cohérent** : les 7 tests retirés sont des
tests **deno**, que vitest ne lance pas. Côté vitest je n'ai retiré aucun test — seulement
une **entrée** dans le tableau `expected` de `coverage-guard`.

⚠️ Le total deno absolu (3697 puis 3704 entre deux passes) **bouge sous moi** : les sessions
parallèles ajoutent des tests dans le même répertoire. L'invariant que je tiens est
**0 échec**, pas un nombre.

Les 4 rouges vitest, inchangés et non touchés :
`coverage-guard.int.test.ts` (×2 — 3 fonctions non déclarées, 1 groupe de triggers) et
`household.int.test.ts:300,323` (une clé `kind: "away"` en trop).

---

## 6. 🔴 `countSatietyAdaptations` — NON CORRIGÉ, ET UNE CORRECTION AU DOSSIER

Le défaut a sa propre tâche. Je ne l'ai pas touché. **Vérification demandée : mon retrait
l'aggrave-t-il ?**

**Comportement observable : strictement inchangé.** La fonction
(`hunger_signal_io.ts:195-217`) lit `student_week_plans`, table intacte, avec ses 246 lignes.
Son unique appelant (`daily_recommendation_engine.ts:227`) est intact. Pour un utilisateur
réel elle rendait 0 avant — la lane était injoignable — et rend 0 après.

**Ce qui change, et il faut le dire :** la lane retirée écrivait `satiety_priority` dans
`generated_from` (via `hungerSignalProvenance`, `index.ts:924`). Elle était donc le **seul
écrivain possible** de la clé là où le lecteur regarde. Le retrait ne casse rien — il **ferme
une porte de réparation théorique** : « rebrancher la lane » n'est plus une option, et il ne
reste que la bonne, celle que le dossier recommande (faire lire `student_generated_meals`).

### ⚠️ La mesure qui corrige le dossier

Le dossier annonce *« 62 lignes sur 138 portent la même clé. Personne ne les lit. »* Mesuré
le 2026-08-19 :

| Table | portent la clé | **valent `true`** | total |
|---|---:|---:|---:|
| `student_week_plans` (lue) | 9 | **8** | 246 |
| `student_generated_meals` (**non lue**) | 69 | **0** | 145 |

**Porter la clé n'est pas valoir `true`**, et la fonction ne compte que `=== true`. Cause :
`satiety_priority: signal.recurrent` (`hunger_signal.ts:307`) — aucune persona QA n'a de faim
récurrente.

> **Conséquence pour qui prendra la tâche :** rebrancher le lecteur sur
> `student_generated_meals` rendra **quand même 0** tant qu'un décor ne produit pas de faim
> récurrente. Sans ce décor, le correctif ressemblera trait pour trait à un correctif qui ne
> marche pas — et c'est le mode d'échec que ce dépôt paie en boucle.

---

## 7. LA MIGRATION — ÉCRITE, **NON APPLIQUÉE**, HORS DE `supabase/migrations/`

📄 [`2026-08-19-MIGRATION-drop-student-week-plans.sql`](2026-08-19-MIGRATION-drop-student-week-plans.sql)

Elle contient : les 4 vérifications préalables (versions en double, ordre disque/registre,
lecteurs partis, `migration up` seulement) ; la liste des **5 lecteurs à retirer d'abord** ;
l'inventaire exact de ce que le `drop` emporte, relevé en base ; le `drop table` lui-même ;
et le nettoyage d'après.

Deux choix à connaître :
- **Un filet `do $$ … raise exception`** s'arrête si des lignes appartiennent à des comptes
  qui ne sont ni des fixtures ni le compte de développement. « Zéro utilisateur réel » a été
  mesuré **un jour donné, sur une base donnée** ; une migration s'applique ailleurs. La
  requête du filet a été **exécutée seule, en lecture** : elle parse et rend `0`.
- **Pas de `cascade`, volontairement.** Aucune clé étrangère n'entre dans la table
  aujourd'hui. Si le `drop` échoue un jour faute de `cascade`, c'est qu'une dépendance est
  **apparue** — et il faut la lire, pas l'emporter en silence.

---

## 8. CE QUI RESTE POUR DEMAIN

1. **La table `student_week_plans`** et ses 5 lecteurs. La migration est prête ; l'appliquer
   demande d'abord de retirer les 5 lecteurs (§1 du fichier SQL). **C'est le seul geste
   irréversible, et il n'a pas été fait.**
2. **`countSatietyAdaptations`** — tâche à part, avec la mesure corrigée du §6 : le décor de
   faim récurrente est aussi nécessaire que le correctif.
3. **`escalateMinorStudent`** — orphelin complet à retirer dans un lot de ménage.
4. **Les 6 exports orphelinés de `week_plan_generation.ts`** (§4.2) — ⛔ **ne pas supprimer
   le module**, il porte la lane du repas.
5. **Les 3 fonctions edge non déclarées** dans `coverage-guard` — préexistant, étranger.

---

## DISCIPLINE DE DÉPÔT — CE QUE J'AI FAIT DE L'INDEX

Aucun `git add -A`, aucun `git stash`, **aucun commit**. Tout est en **modification de
l'arbre de travail**, non indexée, comme le reste du chantier.

⚠️ **Un incident, corrigé :** pour supprimer le dossier de la fonction edge j'ai lancé
`git rm -r --cached`, qui a **indexé la suppression dans l'index partagé**. Je l'ai
immédiatement annulé par `git reset -q -- supabase/functions/generate-week-plan-v1`. État
final vérifié : ` D` (supprimé dans l'arbre, non indexé). **L'index partagé est intact.**

**Mes fichiers, et eux seuls :**

```
CLAUDE.md
docs/keel/MODEL.md
scripts/export_llm_prompt_dump.mjs
frontend/src/edge/coverage-guard.int.test.ts
frontend/src/keel/api/weekPlan.ts
frontend/src/keel/i18n/en.ts · fr.ts
frontend/src/keel/pages/ProPage.tsx · CoachesPage.tsx · GymsLandingPage.tsx
frontend/src/keel/pages/FamiliesPage.tsx · StudentWeekPlanPage.tsx
supabase/functions/generate-week-plan-v1/            (SUPPRIMÉ)
supabase/functions/_shared/keel/  → 8 fichiers de TEST seulement :
    dietary_regime_solo_lane_test.ts · draft_note_classify_wiring_test.ts
    household_doctrine_test.ts · household_freeze_test.ts · household_voices_test.ts
    meal_plan_integrity_test.ts · retained_items_wiring_test.ts · solo_access_test.ts
supabase/functions/sophia-brain/test_harness/keel_properties/no_calorie_to_student_property_test.ts
scratchpad/qa-generation/  (ce rapport, la migration, l'archive de la fonction)
```

Tous les autres fichiers modifiés de `_shared/keel/` appartiennent aux sessions parallèles.
