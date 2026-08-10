# Retrait du point du dimanche

> **Ceci n'est pas une fiche de fonctionnalité** — voir l'encadré de
> [RETRAIT-CARTE-DE-DEFENSE.md](RETRAIT-CARTE-DE-DEFENSE.md), même raison. Un
> retrait n'a ni job story durable ni métrique de succès au-delà de « zéro ».
> **Aucun identifiant `FF-` ne lui est attribué**, ni maintenant ni plus tard.

| | |
|---|---|
| **État** | 🔵 **instruit, rien de supprimé.** Aucune ligne de code n'a été touchée par ce document |
| **Date** | 2026-08-10 |
| **Vérifié au commit** | `82bd5048` — le dépôt bouge sous ce document, voir §11 |
| **Autorité** | [MODEL.md](MODEL.md), [CONTRACT.md](CONTRACT.md) |
| **Décision produit** | prise. Le point du dimanche est supprimé |
| **Arbitrages rendus le 2026-08-10** | les six axes partent · `focus_axis` reste sans indicateur · le bilan hebdo part aussi (§3) |
| **Bloqué par** | [FF-031](../fonctionnalites/suivi-quotidien/FF-031-mesures-corporelles-datees.md) 🟠 **en cours** — voir §9 |
| **Prochaine action** | validation humaine de ce document, puis lot 1 |

---

## 1. Ce que ce document a trouvé, et qui n'était pas dans la commande

Quatre choses. Elles changent la taille du chantier dans les deux sens.

**a. Le rayon d'explosion est trois fois plus petit qu'annoncé — et il n'est pas
au bon endroit.** Le brief comptait 22 fichiers lecteurs de `weekly_reviews`.
Commentaires retirés, **9 fichiers de production touchent la table**, et
**19 des 28 que `grep` renvoie ne la nomment que dans des commentaires**
(§2). Les chantiers L1/L2/L3 des 8 et 10 août ont déjà débranché la plupart des
lecteurs — mais ils ont laissé les pavés qui les expliquent, ce que le dépôt
demande explicitement.

**b. Le même `grep` en oublie le plus gros consommateur.**
`sophia-brain/router/run.ts` **ne contient pas une seule fois** la chaîne
`weekly_reviews` — mesuré, zéro occurrence. Il passe par `loadLatestWeekReview`.
C'est pourtant lui qui pousse le contenu du dimanche dans le prompt **à chaque
tour de chat, toute la semaine suivante**. Un audit d'appelants par nom de table
sur-compte les morts *et* rate les vivants ; celui de §2 fait donc les deux
colonnes.

**c. Le cron du dimanche ne fait pas qu'envoyer un formulaire — il gèle le bilan
hebdomadaire alimentaire.** `keel-weekly-flow-v1` est **le seul appelant** de
`computeAndStoreWeekReview`, qui écrit `weekly_reviews.week_facts`. Le
propriétaire a tranché : le bilan part avec le reste (§3.c). Il faut le savoir
avant de couper le cron, parce que la perte n'est pas le dimanche — c'est un
bloc de prompt injecté sept jours sur sept.

**d. La justification écrite des six axes ne tient pas.** Le code affirme à
quatre endroits — `week_review_io.ts`, `weeklyCheckIn.ts`, `week_review.ts`, la
migration `20260808110000` — que « leur seul consommateur est la synthèse de
cohorte du coach ». **`coach_synthesis_io.ts` n'a jamais lu `biofeedback`** :
`git log -S'biofeedback'` sur ce fichier rend **zéro commit**. Sa vivabilité
vient de `student_daily_checkins` (le tap du soir). La seule lecture qu'il ait
jamais faite de `weekly_reviews` était `risk_band`, retirée le 2026-08-08
(`2eaf39cd`).

Autrement dit : la porte `my_biofeedback_has_reader()` collecte les six axes
**pour un lecteur qui n'existe pas**. Ça ne change pas la décision — ça la rend
moins coûteuse qu'elle n'en avait l'air.

---

## 2. L'audit d'appelants, commentaires retirés

Méthode : les commentaires TS/JS (`//`, `/* */`) et SQL (`--`, `/* */`) sont
retirés **en tenant compte des chaînes et des littéraux gabarits**, puis on
grep. Tests, migrations, `docs/` et `supabase/tests/` exclus du décompte de
production. Script rejouable :
`scratchpad/audit-appelants-commentaires-retires.py`.

```
grep naïf sur `weekly_reviews`, production ............ 28 fichiers
dont touchent réellement la table .....................  9
dont commentaire seul (FAUX VIVANTS) .................. 19
plus, invisibles au grep, via un helper ............... 9 fichiers (colonne 2)
```

### 2.a — Les 9 qui touchent la table

| Fichier | Ce qu'il lit / écrit | Ce qu'il perd au retrait |
|---|---|---|
| `_shared/keel/weekly_flow_io.ts` | **écrit** `biofeedback` (axes + poids + `source`) ; lit pour fusionner ; `hasAskedWeek`, `hasAnsweredWeek` | l'écriture des axes. **L'écriture du poids reste** : la carte des mesures de `/app/plan` passe par le même code (jeton `KEEL_MEASURES_`) |
| `_shared/keel/week_review_io.ts` | **écrit** `week_facts`, `week_facts_computed_at`, `content_locale` ; **écrit** `biofeedback.weight_kg` (FF-008, chat) ; lit pour `readWeekReview` / `loadLatestWeekReview` | tout le bilan hebdo (décision §3.c). **`writeDeclaredBodyMeasure` survit** — c'est FF-008, un écrivain de poids, périmètre FF-031 |
| `_shared/keel/restriction_runtime.ts` | lit `biofeedback.weight_kg`, `outcomes.weight_7d_avg`, `self_rated_adherence`, `logging_coverage` | **rien de vivant** — voir §4, c'est le point le plus important du dossier |
| `_shared/keel/student_body_io.ts` | lit `biofeedback.weight_kg` / `waist_cm` sur 8 semaines | rien tant que FF-031 n'a pas basculé la source ; ensuite, plus rien |
| `account-export-v1/index.ts` | exporte la table (RGPD) | rien, mais §8 |
| `frontend/.../keelClient.ts` | `loadProgressSnapshot` — `REVIEW_COLUMNS` (adhérence, `outcomes`) | rien de vivant : ces colonnes n'ont pas d'écrivain (§4) |
| `frontend/.../StudentProgressPage.tsx` | ① `risk_band` comme **garde TCA d'écran** ② `week_start_date, outcomes, biofeedback` | la courbe de poids suit FF-031. ⚠️ **La garde ① est déjà morte** : `risk_band` n'a aucun écrivain (migration `20260808200000`). `/app/progress` ne masque plus rien à personne — antérieur à ce retrait, à traiter à part |
| `frontend/.../StudentWeekPlanPage.tsx` | `week_start_date, biofeedback, outcomes, risk_band` → tendance de `focus_axis` + garde TCA | la tendance de l'axe (décision §3.b). Même garde morte que ci-dessus |
| `frontend/.../CoachStudentPage.tsx` | `REVIEW_COLUMNS` + `biofeedback.weight_kg` sur 8 semaines | le poids suit FF-031 ; les axes, il ne les lit pas |

### 2.b — Les 9 invisibles au grep, vivants par un helper

| Fichier | Par quoi | Ce qu'il perd |
|---|---|---|
| `sophia-brain/router/run.ts` | `loadLatestWeekReview` → `weekReviewPromptBlock` (l. 2369) | **le bloc `THE STUDENT'S LAST REVIEWED WEEK`, à chaque tour** : jours logués, méthode du coach ligne par ligne, assiettes vues, question déjà posée, et la ligne des six axes. Le plus gros poste du retrait |
| `keel-weekly-flow-v1/index.ts` | `decideWeeklyFlow`, `hasAskedWeek`, `hasAnsweredWeek`, `computeAndStoreWeekReview`, `deliverChatMessage` | il **est** le sujet : supprimé en entier |
| `_shared/chat/deterministic_buttons.ts` | `parseWeeklyFlowToken`, `writeWeeklyFlowReply`, `renderWeeklyFlowAck`, `readWeekReview`, `composeWeekReviewBody` | la branche `KEEL_WEEKLY_`. ⚠️ **La branche `KEEL_MEASURES_` du même bloc reste** |
| `_shared/keel/daily_pulse.ts` | `pulseContextBlock(pulse, hasWeeklyAxes)` | le second paramètre devient constamment `false`. Requis et non optionnel **exprès** : ne pas le rendre optionnel en le retirant, retirer la branche |
| `_shared/keel/week_plan_generation.ts` | importe `WEEKLY_AXIS_LABELS_EN` de `weekly_flow.ts` | rien — **c'est un gardé exprès**, §7 |
| `generate-week-plan-v1/index.ts` | `loadStudentBody` + type `WeeklyAxis` | rien, même raison |
| `frontend/.../bodyMeasures.ts` | `axisReading`, `FOCUS_AXES`, `FOCUS_AXIS_LABELS` | `axisReading` perd son unique appelant (§3.b) |
| `frontend/.../ChatPage.tsx` | `isWeeklyCheckInToken` → monte `WeeklyCheckInDialog` | le dialogue devient injoignable : c'est son **seul** point de montage |
| `frontend/.../weeklyCheckIn.ts` | `buildWeeklySubmission`, `loadBiofeedbackHasReader` | tout, sauf ce que la carte des mesures réutilise |

### 2.c — Les 19 faux vivants

`bodyMeasures.ts`* · `progressModel.ts` · `weekModel.ts` · `ProgressPage.tsx` ·
`deterministic_buttons.ts`* · `body_measure_io.ts` · `body_measure_series.ts` ·
`coach_synthesis.ts` · `coach_synthesis_io.ts` · `daily_recap_io.ts` ·
`daily_recommendation_engine.ts` · `medical_condition_floor.ts` ·
`reengagement_io.ts` · `restriction_guard.ts` · `week_review.ts` ·
`weekly_flow.ts` · `generate-week-plan-v1`* · `keel-daily-pulse-v1` ·
`keel-weekly-flow-v1`*

*(\* vivants par helper, colonne 2b — ils sont faux vivants **pour la table**,
pas pour le concept.)*

**Ces commentaires ne se suppriment pas.** Le dépôt porte la cicatrice
« références legacy qui doivent survivre » : ce sont les gardes survivantes qui
expliquent pourquoi elles n'interrogent plus la table. `restriction_guard.ts`,
`reengagement_io.ts` et `medical_condition_floor.ts` portent le pavé L3 qui dit
comment **réarmer** le plancher durable sans rebrancher une colonne morte. Les
retirer, c'est perdre l'instruction et rouvrir le défaut.

---

## 3. Les trois arbitrages, rendus le 2026-08-10

### 3.a — Les six axes : **ils partent avec le dimanche**

Le tap du soir (`student_daily_checkins` : `good`/`mixed`/`hard` + un axe parmi
`energy`, `hunger`, `sleep`) devient le seul signal de vivabilité. C'est déjà
lui qui alimente la synthèse de cohorte du coach, la seule chose qui prétendait
lire les six.

**Ce qu'on perd, nommément :** la granularité 1-5 ; `digestion`, `mood` et
`training`, que le tap ne demande pas et ne doit pas demander (« on ne demande
pas à quelqu'un tous les soirs comment va sa digestion » —
`weekly_flow.ts:44`) ; et la ligne `WHAT THEY RATED THEMSELVES, 1 to 5` du bloc
de contexte de chat.

**Ce qui part avec eux :** `WEEKLY_AXES`, `WEEKLY_SCALE_*`, `readScale`, la
moitié axes de `parseWeeklyFlowResponse`, `biofeedbackAxes`,
`my_biofeedback_has_reader()` (migration `20260808110000`) et sa porte
`showAxes` côté front.

### 3.b — `focus_axis` : **gardé, sans indicateur**

L'élève désigne toujours ce qu'il veut voir monter ; l'app ne lui montre plus
aucune tendance. `health` et `performance` restent des dynamiques sans cible
chiffrée, et **c'est assumé et écrit** — l'objectif est une intention affichée,
plus une mesure.

**Ce que ça impose concrètement :**

- `student_goals.focus_axis` **reste**, avec ses deux CHECK
  (`student_goals_focus_axis_check` sur le vocabulaire des six,
  `student_goals_focus_axis_goal_check` sur `health`/`performance`). Le
  vocabulaire fermé survit **comme liste d'étiquettes**, plus comme liste de
  choses mesurées.
- Le commentaire de colonne (`20260805141000`) dit aujourd'hui « L'axe du point
  du dimanche que l'élève veut voir monter ». Il **ment** dès le lot 1 : il faut
  une migration de commentaire, comme `20260808200000` l'a fait pour
  `risk_band`.
- `FOCUS_AXES` / `FOCUS_AXIS_LABELS` **restent** dans `bodyMeasures.ts`.
  `axisReading` et `AXIS_NOISE` partent : plus de série à lire.
- Le sous-titre de l'écran — « One of the six you rate on Sunday — nothing extra
  to fill in » — et la phrase « Nothing rated yet — you set this at Sunday's
  check-in » **doivent être réécrits**. Une copie qui renvoie l'élève à un
  rituel supprimé est le défaut n°1 de ce genre de retrait.

### 3.c — Le bilan hebdo alimentaire : **il part aussi**

Décision du propriétaire, prise en connaissance de ce qu'elle emporte. Ce
document l'instruit sans la rediscuter.

**Ce qui disparaît :** `week_facts`, `week_facts_computed_at`, le bloc
`THE STUDENT'S LAST REVIEWED WEEK` de chaque tour de chat, la réponse composée
après le formulaire (`composeWeekReviewBody`, `weeklyReplyBody`), et la question
unique que le bilan posait.

**Surface concernée :** `week_review.ts` (1308 l.), `week_review_io.ts`
(774 l.) sauf sa partie FF-008, `week_review_test.ts`,
`20260806210000_keel_week_review_facts.sql`, et le harnais
`docs/nutrition-pivot/qa-web/W1_week_review_real_run.ts`.

⚠️ **Ce qui ne part pas avec lui, et qu'il faut découper à la main :**
`week_review_io.ts` porte aussi **FF-008 — la mesure annoncée en conversation**
(`writeDeclaredBodyMeasure`, `weekStartOfLocalDate`), appelée par
`sophia-brain/router/run.ts:4297`. C'est un **écrivain de poids**, périmètre
FF-031, et il doit survivre. Le fichier ne se supprime pas ; il se scinde.

---

## 4. Ce que `restriction_guard` perd — la réponse est : rien de vivant

C'est le point qui décidait si ce retrait était dangereux. Il ne l'est pas.

`loadWeeklyOutcomeSamples` (`restriction_runtime.ts:191`) lit quatre choses sur
`weekly_reviews`. **Trois n'ont aucun écrivain**, épreuves faites au commit
`82bd5048` :

| Entrée du plancher | Écrivain | Preuve |
|---|---|---|
| `biofeedback.weight_kg` | **oui** — 3 gestes : dimanche, carte `/app/plan`, chat | c'est le sujet de FF-031 |
| `outcomes.weight_7d_avg` | **non** — chemin 1:1 uniquement | déjà tranché le 2026-08-03, redit dans `restriction_runtime.ts:157` |
| `self_rated_adherence` | **non** | audit commentaires retirés : lu par `restriction_runtime.ts` + exporté RGPD, **écrit nulle part** |
| `logging_coverage` | **non** | idem — 0 écrivain |

Donc, **après FF-031, le retrait du point du dimanche coûte au plancher TCA
exactement zéro entrée** : la seule qu'il consomme vraiment est le poids, et le
poids est déjà en train de déménager vers `student_body_measures`.

**Deux réserves, et elles comptent :**

1. **Avant FF-031, le dimanche est l'un des trois écrivains du poids.** Couper
   le cron d'abord retirerait un écrivain de la seule entrée vivante du
   plancher. D'où l'ordre imposé de §9.
2. **`deriveWeeklyOutcomeSamples` (commit `82bd5048`) est une UNION** : le poids
   vient de la nouvelle table, l'adhérence et la couverture restent lues sur
   `weekly_reviews`. C'est correct et prudent — mais ces deux-là valent `null`
   pour tout le monde. Ce n'est pas un défaut de FF-031 ; c'est la même famille
   que `risk_band`, et **ça mérite son propre commentaire de colonne** plutôt
   qu'un `drop` : le chemin 1:1 est gardé exprès.

**Le plancher durable est déjà à 0 %** de toute façon — c'est la conclusion de
L3 (`71fb0206`), et le signal restrictif vivant est
`contract_change_requests(reason_code='restriction_signal', status='open')`,
écrit par `escalateRestrictionSignal`. Rien de ce retrait ne le touche.

---

## 5. Deux gardes déjà mortes, à ne pas prendre pour des ceintures

Elles sont dans le périmètre, elles ont l'air armées, elles ne le sont pas. Les
supprimer sans le dire ferait croire que le retrait les a cassées.

**a. `hasAnsweredWeek` rend toujours `false`.** Elle teste
`bio.source === "whatsapp_flow"` (`weekly_flow_io.ts:321`). Le seul écrivain,
`weeklyBiofeedbackPayload`, écrit `in_app_weekly_form` ou
`in_app_measures_card` depuis le de-whatsapp ; le chat écrit `"chat"`. **Aucun
code n'écrit `whatsapp_flow`** — unique occurrence dans tout le dépôt hors une
fixture de test. La garde `already_answered_this_week` est donc désarmée depuis
le de-whatsapp ; seule `already_asked_this_week` empêche encore le doublon du
dimanche.

**b. La garde TCA de `/app/progress` et de `/app/plan` est morte.** Les deux
écrans sélectionnent `risk_band` et masquent leurs chiffres dessus. La colonne
n'a aucun écrivain (`20260808200000`). Antérieur à ce retrait, **hors
périmètre**, et à traiter : c'est un masquage clinique qui ne masque plus rien.

**c. Déjà morts, à emporter sans cérémonie.** `weeklyFlowJson()`,
`WEEKLY_TEMPLATE_NAME_DEFAULT`, `WEEKLY_TEMPLATE_LANG_DEFAULT`,
`weeklyTemplateFlowComponents()`, `WEEKLY_LABEL_MAX_CHARS`,
`WEEKLY_FLOW_CTA_EN` : reliquats du Flow Meta, **aucun appelant hors test**
depuis le de-whatsapp. Le point du dimanche n'est plus un Flow WhatsApp mais un
message in-app avec un bouton (`deliverChatMessage`, purpose
`keel_weekly_flow`) — le brief de commande décrit ici un état périmé.

---

## 6. La garde SQL de la migration `20260803220000`

```sql
raise exception 'C4 guard: cron keel-weekly-flow absent (trouve %)', v_cron;
```

**Ne pas la modifier, ne pas la retirer.** Une migration passée est un fait
historique, et la réécrire fait diverger l'historique appliqué de l'historique
du dépôt.

La forme correcte est celle qu'a prise `20260808070000_drop_keel_cards.sql` :
une **nouvelle** migration qui fait `cron.unschedule('keel-weekly-flow')` avec
sa propre garde d'absence. La garde de `20260803220000` ne se rejoue que sur une
base neuve, où l'ordre des migrations la satisfait avant que la suivante ne
débranche le cron.

⚠️ **Le juge de paix des crons actifs est la base, pas la migration.** Avant et
après :

```bash
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -c "select jobname, schedule, active from cron.job order by jobname;"
```

---

## 7. Ce qui est gardé exprès

| Gardé | Pourquoi |
|---|---|
| `weekly_reviews`, **la table** | Elle porte encore le poids (`biofeedback.weight_kg`) jusqu'à la bascule FF-031, tout le chemin 1:1 (`plan_version_id` non nul, `outcomes`, `student_narrative`, `lapse_context`) — **gardé exprès, c'est le mode 1:1** — et 8 semaines d'historique de mesures. **Aucun `drop table` dans ce chantier.** |
| `risk_band`, `self_rated_adherence`, `logging_coverage` | Colonnes orphelines, lecteurs vivants. `20260808200000` a déjà tranché pour `risk_band` : commentaire, pas `drop`. Les deux autres méritent le même traitement. |
| `WEEKLY_AXIS_LABELS_EN` + le type `WeeklyAxis` | `week_plan_generation.ts:65` les importe pour nommer l'axe de l'élève **dans le prompt du générateur de semaine**. Supprimer `weekly_flow.ts` en bloc casse `generate-week-plan-v1`. Les déplacer, pas les tuer. |
| `FOCUS_AXES`, `FOCUS_AXIS_LABELS`, `student_goals.focus_axis` | Décision §3.b. |
| `MEASURES_TOKEN_PREFIX`, `buildMeasuresToken`, `parseMeasuresToken`, `writeMeasures` | La carte des mesures de `/app/plan` — un geste **distinct** du dimanche, qui survit. Elle partage `writeWeeklyFlowReply` et `parseWeeklyFlowResponse` : les deux fonctions restent, amputées de leur moitié axes. |
| `BodyMeasureSource = "sunday_flow" \| ...` | Liste fermée de `body_measure_io.ts`, et des lignes historiques la porteront. **Retirer la valeur casserait la relecture du passé.** Elle devient un vestige légitime, à commenter comme tel. |
| Les pavés de commentaire L1/L2/L3 | §2.c. |
| `writeDeclaredBodyMeasure` + `weekStartOfLocalDate` | FF-008, écrivain de poids. §3.c. |

---

## 8. RGPD

`weekly_reviews` est exportée par `account-export-v1`
(`SCOPE.weeklyReviews`, fichier `protocole_bilans.json`) et réclamée à la
suppression (`keel_gdpr_lifecycle_test.ts:145`). **La table survit** au retrait,
donc l'export reste cohérent sans rien faire.

Trois trous, mesurés, dont deux préexistent à ce chantier :

1. **`week_facts` n'est pas exportée.** `SCOPE.weeklyReviews` ne la nomme pas —
   `grep -c week_facts account-export-v1/index.ts` → **0**. Une colonne ajoutée
   le 2026-08-06, jamais réclamée par l'export. Le retrait §3.c la fait
   disparaître, ce qui **ferme le trou par accident**. À ne pas présenter comme
   une correction.
2. **`student_body_measures` n'est ni exportée ni réclamée** — 0 occurrence dans
   les deux fichiers. C'est le périmètre de **FF-031**, et c'est exactement la
   cicatrice « le lifecycle RGPD ne réclame pas les tables neuves ». À vérifier
   avant que FF-031 ne se déclare livrée, pas ici.
3. Si un lot supprime un jour des colonnes de `weekly_reviews`, `SCOPE`
   **doit** être mis à jour dans le même commit : PostgREST rend 400 sur une
   colonne inconnue, et l'export entier tombe.

---

## 9. Les preuves d'absence, avant la moindre suppression

Le dépôt exige **trois épreuves** pour toucher à la forme d'une table, et
`20260808200000` en a fait quatre. Aucune suppression ne part sans elles.

### 9.a — Ordre imposé

**FF-031 d'abord.** Elle est 🟠 **en cours** — la table `student_body_measures`
(`20260810090000`) et la dérivation (`body_measure_series.ts`,
`body_measure_io.ts`) sont posées ; **les écrivains et les lecteurs ne sont pas
basculés**. Tant que ce n'est pas fini, couper le dimanche retire un des trois
écrivains du poids, c'est-à-dire la seule entrée vivante du plancher TCA (§4).

**Condition de départ du lot 1, vérifiable :** FF-031 🟢 livrée, et
`restriction_runtime` lit son poids par `deriveWeeklyOutcomeSamples`.

### 9.b — Les quatre épreuves, pour chaque symbole retiré

1. **CODE** — audit **commentaires retirés**, jamais un `grep` nu (§2 : il
   sur-compte de 19 et sous-compte de 1). **Ouvrir chaque payload
   d'`insert`/`update`** : un `grep` sur la même ligne ne voit pas une écriture
   qui passe par un objet `payload`. C'est l'erreur qui avait faussé le premier
   diagnostic de `risk_band`.
2. **PROSRC** — `select proname from pg_proc where prosrc ilike '%<symbole>%';`
   plus les triggers de la table.
3. **VUES** — `pg_views` / `pg_matviews`. Rappel :
   `create or replace view` perd `security_invoker`.
4. **BASE** — compter les lignes réelles, et distinguer QA de production :

```bash
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -c "select count(*) as lignes, count(*) filter (where biofeedback ?| array['energy','hunger','sleep','digestion','mood','training']) as avec_axes, count(*) filter (where biofeedback ? 'weight_kg') as avec_poids, count(*) filter (where week_facts is not null) as avec_week_facts, count(*) filter (where self_rated_adherence is not null) as adherence, count(*) filter (where logging_coverage is not null) as coverage, count(*) filter (where plan_version_id is not null) as chemin_1a1 from public.weekly_reviews;"
```

⚠️ **Cette épreuve n'a PAS été faite** : Docker était arrêté au moment de
l'audit. Les chiffres de §4 sont des preuves de **code**, pas de base. Un lot
qui supprime part avec cette requête, ou il ne part pas.

### 9.c — Les lots, dans l'ordre

| # | Lot | Ce qu'il fait | Ce qui le prouve |
|---|---|---|---|
| **0** | *(bloquant)* | FF-031 livrée | `restriction_guard` vert sur la dérivation |
| **1** | Débrancher | `cron.unschedule('keel-weekly-flow')` dans une migration neuve. **Rien d'autre.** | `cron.job` : plus de ligne. Aucun `keel_weekly_flow` neuf dans `outbound_messages` le dimanche suivant |
| **2** | La copie | Réécrire les textes qui renvoient au dimanche : `/app/plan` (§3.b), `pulseContextBlock`. **Aucun écran ne doit citer un rituel supprimé** | grep « Sunday », « dimanche », « check-in » dans le front et les prompts |
| **3** | Le job et le formulaire | `keel-weekly-flow-v1/`, `WeeklyCheckInDialog.tsx`, `weeklyCheckIn.ts`, la branche `KEEL_WEEKLY_` de `deterministic_buttons.ts`, la branche token de `ChatPage.tsx`. ⚠️ `coverage-guard.int.test.ts:156` nomme la fonction | tests verts, `npx tsc -b` |
| **4** | Les axes | `WEEKLY_AXES`, `readScale`, `biofeedbackAxes`, la porte `showAxes`, `my_biofeedback_has_reader()` (migration). **Garder `WEEKLY_AXIS_LABELS_EN`** (§7) | `deno check` sur `week_plan_generation.ts` |
| **5** | Le bilan hebdo | §3.c — **scinder `week_review_io.ts` d'abord**, FF-008 doit survivre | `sophia-brain` répond sans le bloc ; run réel |
| **6** | Les commentaires | Migration de commentaire sur `focus_axis`, `self_rated_adherence`, `logging_coverage` — la raison de rester, comme `20260808200000` | `\d+ weekly_reviews` |

Un lot = un commit, par chemins explicites (une autre session commite avec
`git add -A`). Avant de nommer une migration :

```bash
ls supabase/migrations/*.sql | sed 's|.*/||; s/_.*//' | sort | uniq -d
```

---

## 10. Ce que ce document n'a pas vérifié

Dit ici plutôt que passé sous silence.

- **Aucune épreuve de base** (§9.b n°4) : Docker était arrêté. Tout §4 repose
  sur des preuves de code.
- **Aucun run réel.** L'effet du retrait sur un tour de chat privé du bloc
  `THE STUDENT'S LAST REVIEWED WEEK` n'est pas mesuré. Il doit l'être au lot 5,
  et le dépôt a une cicatrice pour ça : « prompt-only régresse en réel ».
- **`supabase/functions/_shared/keel/weekly_flow_schema_test.sql`** — test de
  dérive de schéma, non lu en détail. Il tombera aux lots 4 et 5.
- **Le dépôt bouge.** FF-031 a livré deux commits pendant la rédaction. Tout
  chiffre ici est daté du commit `82bd5048` et se recompte avec le script de
  §2 avant chaque lot.
