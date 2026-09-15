# QA AGENT 14 — Robustesse infra : crons, temps, doublons, chemins morts

**Date** : 2026-08-03 · **Environnement** : Supabase local (`supabase_db_Sophia_2`),
`WHATSAPP_DELIVERY_ENABLED=0` — aucun message réel n'est parti chez Meta.

**Flotte de test** : 250 élèves `dddd0014-…`, fuseau `Asia/Tokyo`, triés **après** toutes
les personas existantes (`d` > `2`, `f`) — donc en queue de balayage, exactement la
population qu'une pagination cassée perd. Supprimée en fin de run (cascade vérifiée : 0
profil, 0 plan, 0 checkin, 0 ligne de dédoublonnage restants).

> ⚠️ **Run concurrent.** D'autres agents QA travaillaient sur le même dépôt et la même base
> pendant ce run. Deux défauts que j'ai vérifiés en vrai ont été **corrigés par un autre
> agent pendant ma passe** (§A0), et six crons ont été désactivés vers 16:41 UTC pour
> isoler un autre run. Chaque verdict ci-dessous est daté et adossé à une preuve
> reproductible, jamais à une lecture de code seule.

---

## Verdict d'ensemble

| Famille | Verdict |
|---|---|
| **A. Crons** — inventaire, budget/pagination, auth interne | 🔴 **1 job fantôme** · ⚠️ contrat de curseur sans consommateur |
| **B. Temps** — frontière de jour, DST, ancrage UTC | 🟢 **14/14** |
| **C. Doublons & rejeu** — wamid, statuts, course d'écriture | 🟢 **3/3** |
| **D. Chemins morts** | 🔴 **4 tables mortes · 4 surfaces lues-jamais-écrites · 1 demi-branchement** |

Le **MUST « zéro job fantôme » n'est pas tenu** : `keel-weekly-flow` échoue à chaque tick
depuis sa création et n'a jamais atteint sa fonction. Le MUST « zéro traitement double »
est tenu. La liste des chemins morts est en §D, sourcée.

---

## §A0 — Ce qui a bougé pendant le run (traçabilité)

| Défaut | Vérifié par moi | État en fin de run |
|---|---|---|
| `keel-weekly-flow-v1` répond **500** — `profiles.content_locale` n'existe pas | ✅ HTTP 500, `{"error":"[object Object]"}` | **Corrigé par un autre agent** (`git diff` : colonne retirée + `errorText()` ajouté) |
| **Double envoi du tap du soir** (fenêtre 20h-22h × cron horaire) | ✅ `sent=253` à 20:10 **et** `sent=253` à 21:10, même jour, mêmes élèves | **Corrigé par un autre agent** (garde `already_asked_today` + `wasPulseAskedToday`) |
| **Commande cron de `keel-weekly-flow`** | ✅ run pg_cron réel `status=failed` | 🔴 **INTACT** — voir §A1 |

Les deux corrections sont réelles et bien câblées (`askedToday` est **requis**, pas
optionnel, et alimenté par `whatsapp_outbound_messages` avec le **même** `localDateFor`
que le calcul de `localDate` — pas une seconde implémentation du découpage des jours).

---

## §A1 — Inventaire des crons 🔴

Relevé à l'ouverture du run (20 jobs, tous `active`) :

**Les 4 jobs KEEL sont là, aux bons horaires, et nomment une fonction qui existe :**

| Job | Horaire | Cible | Réponse à un POST cron-identique |
|---|---|---|---|
| `keel-daily-pulse` | `10 * * * *` | `keel-daily-pulse-v1` | 🟢 HTTP 200 |
| `keel-reengage` | `25 * * * *` | `keel-reengage-v1` | 🟢 HTTP 200 |
| `keel-weekly-flow` | `40 * * * *` | `keel-weekly-flow-v1` | 🔴 **jamais atteinte** |
| `keel-coach-synthesis` | `0 6 * * 1` | `coach-synthesis-v1` | 🟢 HTTP 200 |

**Les 5 crons B2C sont bien absents** — `trigger-retention-emails`,
`process-whatsapp-optin-recovery`, `reseed-recurring-reminders`, `trigger-watcher-batch`,
`keel-arm-cards`. 🟢
**Les 3 crons évaluateur sont bien absents** — `keel-provision-day`, `keel-sweep-day`,
`keel-evaluate-adherence`. 🟢

### 🔴 R1 — `keel-weekly-flow` est un job fantôme : il échoue à chaque tick

`keel-weekly-flow` est le **seul** cron du dépôt qui n'utilise pas le helper commun
(`app_config` + `vault.decrypted_secrets`). Sa commande, posée par
[`20260803220000_pivot_weekly_flow.sql:80-94`](../../../supabase/migrations/20260803220000_pivot_weekly_flow.sql) :

```sql
url := current_setting('app.settings.functions_base_url', true) || '/keel-weekly-flow-v1',
'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
```

**Trois défauts indépendants, chacun suffisant :**

1. **Les deux GUC ne sont définies nulle part.** `pg_db_role_setting` ne porte que
   `app.settings.jwt_secret` / `jwt_exp` (posées par la stack Supabase). Un `grep` sur tout
   le dépôt ne trouve ces deux clés **que** dans cette migration. Donc
   `NULL || '/keel-weekly-flow-v1'` = `NULL`, et `net.http_post` **lève une erreur**.
2. **L'URL n'a pas le segment `/functions/v1/`** que tous les autres jobs incluent.
3. **L'auth est un `Bearer <service_role>`**, alors que `keel-weekly-flow-v1` est gardée par
   `ensureInternalRequest`, qui exige `x-internal-secret` → **403** (vérifié, §A3).

**Preuve (run pg_cron réel).** Sonde temporaire portant la commande **verbatim**,
planifiée `* * * * *`, observée, puis retirée :

```
 status |                    return_message                     |    t
--------+-------------------------------------------------------+----------
 failed | ERROR:  null value in column "url" of relation         | 16:43:00
        | "http_request_queue" violates not-null constraint      |
```

**Pourquoi ça a passé la garde de la migration.** La `GARDE` du fichier n'assert que
`select count(*) from cron.job where jobname='keel-weekly-flow'` = 1 : **l'existence, pas
l'atteignabilité**. Ses deux migrations sœurs (`…180000_pivot_daily_pulse_cron.sql`,
`…090000_pivot_nutrition_crons.sql`) assertent en plus que la commande **nomme** la bonne
fonction *et* qu'elle contient `decrypted_secrets` — précisément le défaut W7.5 qu'elles
documentent. Cette migration-ci a été écrite sans ces deux assertions.

**Conséquence produit** : le point hebdomadaire par WhatsApp Flow (chantier C4) **n'a
jamais été envoyé une seule fois**. La correction du 500 côté fonction (§A0) ne change
rien tant que la commande n'est pas réécrite sur le helper commun.

> Dérive de commentaire, au passage : la migration dit « Tous les quarts d'heure » ; le
> job est planifié `40 * * * *`, soit **une fois par heure**.

---

## §A2 — Budget & pagination ⚠️

**Couverture : 🟢.** Un tick a traité **toute** la flotte (294 élèves scannés — 250 à moi,
le reste aux runs concurrents), sur deux pages (200 + 94), avec `exhausted: true` et
`next_after_user_id: null`. Aucun oubli, aucun doublon : le curseur est un `.gt(id)` sur un
`order by id asc`, donc les deux ticks d'une reprise sont disjoints par construction.

**Budget : 🟢 à l'échelle pilote.** ~2,7 s pour 294 élèves à chaud (~100 élèves/s sur le
chemin de décision) contre un budget par défaut de 45 s → marge d'environ 4 500 élèves.
*Réserve honnête* : mesuré en `dry_run`, qui saute l'`admin.functions.invoke("whatsapp-send")`
par élève — le coût dominant en envoi réel. La marge réelle est plus courte, non mesurée
ici (elle exigerait 250 envois).

### ⚠️ R2 — Le contrat de reprise n'a aucun consommateur

`next_after_user_id` / `next_after_coach_id` sont émis par **5 fonctions**
(`keel-daily-pulse-v1`, `keel-weekly-flow-v1`, `keel-week-rollover-v1`,
`coach-synthesis-v1`, `keel-cards-v1`) et **lus par personne** : ni cron, ni script, ni
test, ni frontend. Les corps de tous les jobs sont un `{}` statique.

Tant que le budget suffit, c'est inoffensif. Le jour où un tick casse sur le budget, la
queue de flotte n'est **jamais** rattrapée : le tick suivant repart de `cursor = null` et
re-traite les mêmes élèves de tête. Le contrat existe, il est documenté
(`keel-week-rollover-v1:151` explique même comment le rejouer), et rien ne l'exécute.

### ⚠️ R3 — `keel-reengage-v1` ne peut pas être paginé du tout

Il **accepte** `after_user_id` (`index.ts:68`) mais **n'émet aucun curseur** : sa réponse
n'a ni `next_after_user_id` ni `exhausted`. Il plafonne à `limit` (200 par défaut). Au-delà
de 200 candidats simultanés, les élèves au-delà du 200ᵉ rang d'`id` ne sont pas seulement
retardés — rien dans le système ne peut les atteindre, puisque le cron poste `{}` et qu'il
n'existe aucun curseur à lui repasser.

---

## §A3 — Garde `ensureInternalRequest` 🟢

Neuf surfaces cron testées, trois requêtes chacune :

| Fonction | sans secret | mauvais secret | GET |
|---|---|---|---|
| `keel-daily-pulse-v1`, `keel-reengage-v1`, `keel-weekly-flow-v1`, `coach-synthesis-v1`, `keel-week-rollover-v1`, `process-checkins`, `schedule-whatsapp-v2-checkins`, `stripe-reconcile-seats`, `purge-deleted-accounts` | **403** | **403** | **405** |

`ensureInternalRequest` est la **première** instruction du handler dans les quatre
fonctions KEEL : aucun travail n'est engagé avant le refus. La garde répond 403 (et non
401) — l'exigence « jamais d'exécution » est tenue.

---

## §B — Temps 🟢 14/14

Suite exécutée contre les fonctions **réelles** (`weekStartOf`, `localHourFor` importées ;
les trois helpers privés des edge functions sont répliqués verbatim et marqués comme tels).

| # | Test | Verdict |
|---|---|---|
| B4a | Tokyo 23:55 vs Paris 16:55 → `local_date` juste des deux côtés ; +10 min, Tokyo bascule au 4, Paris reste au 3 | 🟢 |
| B4a | Minuit exact (`15:00:00Z`) et minuit −1 ms | 🟢 |
| B4a | Fuseaux extrêmes Kiritimati (+14) / Niue (−11), 26 h d'écart | 🟢 |
| B4b | `weekStartOf` rend le **LUNDI** pour les 7 jours, **dimanche compris** | 🟢 |
| B4b | Bascules de mois et d'année (2026-01-01 → 2025-12-29) | 🟢 |
| B5 | Pulse 20h-22h : **exactement 2 ticks**, 8 jours DST × 6 fuseaux | 🟢 |
| B5 | Weekly 18h-21h : **exactement 3 ticks**, mêmes jours DST | 🟢 |
| B5 | Contrôle sur un jour sans DST : mêmes comptes | 🟢 |
| B5 | Heure locale jamais ambiguë au *fall back* / heure sautée inexistante au *spring forward* | 🟢 |
| B6 | `weekStartOf` ancré en UTC (`T00:00:00Z`), insensible au TZ du process | 🟢 |
| B6 | `localDowFor` : 0 = dimanche, cohérent avec la fenêtre weekly | 🟢 |
| B6 | Dimanche **local** ≠ dimanche **UTC** (22:30Z dimanche = lundi à Tokyo) — le job filtre bien sur le DOW local | 🟢 |

Le piège `getUTCDay()` est correctement désarmé : `(d.getUTCDay() + 6) % 7` mappe
dimanche(0) → 6, donc le dimanche recule bien de 6 jours jusqu'à son lundi.

**Le design est DST-sûr par construction** : le code lit l'heure locale **d'un instant
UTC** (via `Intl`), jamais l'inverse. Il n'y a donc jamais d'heure locale ambiguë à
résoudre. Aucune fenêtre double, aucune fenêtre sautée sur les 8 dimanches de bascule
testés, y compris les cas tordus (Chili, bascule à minuit local ; Cuba, à 01h).

> Mon premier harnais comptait les ticks par **jour UTC** et non par **jour local** : il a
> « trouvé » 3 ticks à Santiago. C'était le test qui avait tort. Corrigé, puis 14/14.

---

## §C — Doublons & rejeu 🟢 3/3

Charges utiles **signées** en HMAC-SHA256 (`x-hub-signature-256`) — le chemin de
production, pas le bypass `loopback`.

**C7 — même `wamid` posté 3×** (réponse au tap, `KEEL_PULSE_HARD`) :

| | attendu | mesuré |
|---|---|---|
| `whatsapp_inbound_dedup` | 1 | **1** |
| `student_daily_checkins` | 1 | **1** (`hard/-`) |
| HTTP | 200 ×3 | 200 ×3 |

Preuve d'unicité du traitement : la ligne de dédoublonnage porte
`webhook_request_id = e186a633…`, soit le `request_id` du **post #1**. Les posts #2 et #3
ont buté sur la `unique_violation` (23505) et sont sortis en `continue`. L'idempotence est
**structurelle** : insertion d'abord, unique sur `wamid_in`, jamais un `select` puis un
`insert`.

**C9 — course d'écriture** : 3 `wamid` distincts postés **en parallèle**, même élève, même
jour local → **1 seule ligne** `student_daily_checkins` (et 3 lignes de dédoublonnage, ce
qui est correct : 3 messages entrants distincts). La clé `unique (user_id, local_date)` +
l'upsert tiennent sous concurrence réelle. 🟢

**C8 — statuts rejoués** : 6 posts (`delivered`/`read` × 3 rejeux) → **2 lignes** dans
`whatsapp_outbound_status_events` (clé `provider_message_id, status, status_timestamp`),
et **zéro effet de bord** : checkins et `chat_messages` inchangés. 🟢

### ⚠️ Observation — la trace de traitement n'avance jamais sur les chemins KEEL

Les réponses au tap et au Flow sortent en `continue` **avant** la ligne 1049 qui marque
`whatsapp_inbound_dedup.processed_at` et lie `chat_message_id`. Une ligne KEEL reste donc
`status='received'`, `processed_at = null`, **à vie**. Le dédoublonnage n'en souffre pas
(il ne dépend que de la contrainte unique), mais « reçu et traité » devient
indistinguable de « reçu puis planté en cours de traitement ». Angle mort d'observabilité,
pas un défaut de correction.

*(Note connexe : un tap ne laisse aucune ligne `chat_messages` — voulu, documenté §3.1.)*

---

## §D — Chemins morts

**Méthode** : `grep` des écrivains (`.insert/.upsert/.update/.delete`) et lecteurs
(`.select`) sur 26 tables KEEL, en séparant code applicatif / tests / fixtures QA ; puis
vérification individuelle de chaque table à 0 écrivain (RPC, policies RLS, seeds de
migration) — le comptage seul aurait classé des données de référence comme mortes.
**Rien n'a été câblé** : c'est un rapport.

### D.1 — Mortes de bout en bout (0 écrivain, 0 lecteur)

| Table | Écrivains | Lecteurs | Verdict |
|---|---|---|---|
| `student_facts` | aucun | aucun | 🔴 **morte**. Références uniquement : DDL (`…031000_pivot_nutrition_tables.sql:323`), le test SQL de contraintes, et les docs de plan. |
| `recurring_meals` | aucun | aucun | 🔴 **morte**. Idem (`…:261`). |
| `cohorts` | aucun | aucun | 🔴 **morte**. 2 lignes en base, **zéro** référence applicative, **zéro** policy RLS la citant. Seul le test SQL l'exerce. |
| `meal_events` | — | — | 🔴 **n'existe pas en base**. Citée dans `PLAN-NUIT.md` seulement. |

H5 est **confirmée et inchangée** : `student_facts` et `recurring_meals` ont bien zéro
écrivain et zéro lecteur.

### D.2 — Lues, jamais écrites (la classe dangereuse)

| Surface | Lecteurs (production) | Écrivains | Verdict |
|---|---|---|---|
| **`student_safety_constraints`** | **3** : `generate-week-plan-v1:158`, `sophia-brain/router/run.ts:1348` **et** `:1840` (sans cache — un test assert « every turn hits the table ») | **aucun**. Une policy RLS `…_owner_insert` existe, donc la *permission* est là ; mais aucun code applicatif, aucune UI, aucune edge function n'insère. Seuls les fixtures QA et le harnais de test écrivent. | 🔴 **à brancher — priorité 1** |
| `coach_student_events` | `CoachStudentPage.tsx:210` | aucun (0 ligne en base) | 🔴 timeline coach vide à vie |
| `upcoming_contexts` | `keel-cards-v1:416` (chemin d'armement, lui-même déplanifié) | aucun | 🔴 doublement mort |
| `student_goals.practical_constraints` | `generate-week-plan-v1:89` → injecté dans le prompt (`week_plan_generation.ts:373`) | **aucun côté app** : le seul écrivain, `StudentWeekPlanPage.saveGoal()`, upsert `user_id, goal, situation, content_locale` — la colonne est **absente du payload**, donc figée à `'{}'` | 🔴 prompt toujours « practical constraints: {} » |

**Pourquoi `student_safety_constraints` est le point le plus grave** : c'est la table
*désignée* pour les contraintes dures (allergie, intolérance, médication) — `student_facts`
les **refuse** par CHECK (`student_facts_no_hard_constraint_check`), précisément pour
empêcher qu'elles atterrissent dans la couche souple. Il y a donc une table, un validateur,
une policy d'écriture, et trois lecteurs en production sur les chemins chauds — et **aucun
moyen, pour un élève, d'y faire entrer quoi que ce soit**. La garde se lit comme
implémentée et ne peut structurellement jamais mordre.

### D.3 — Demi-branchement

**`cards` / `keel-cards-v1`** : 🔴 **lecteur vivant, écrivain déplanifié.**

- `CardsPage` est **routée** dans le produit (`App.tsx:32` + `:146`) et lit `card_armings`
  (`frontend/src/keel/api/cards.ts:164`).
- `card_armings` n'est écrite que par `writeArmings`, atteinte uniquement depuis l'action
  interne `arm_sweep`, dont **l'unique appelant** était le cron `keel-arm-cards` —
  déplanifié par `…030000_pivot_disable_b2c_crons.sql`.
- Le frontend n'appelle que `create_card`, `update_card`, `log_win` : jamais `arm_sweep`,
  jamais `due`.

→ Plus aucune carte ne sera jamais armée, et l'écran reste accessible et vide. Cohérent
avec la décision « cartes hors périmètre v1 », mais la **page n'a pas été retirée avec le
cron**.

### D.4 — Vérifiées vivantes (pas des chemins morts)

| Surface | Écrivain | Lecteur | Verdict |
|---|---|---|---|
| `coach_syntheses.delivered_at` | `coach_synthesis_io.ts:332` via la RPC `keel_mark_synthesis_delivered` (**présente en base**, vérifié) | `CoachWeeklyPage.tsx:117-128` + libellé « · read » | 🟢 **boucle fermée** |
| `card_templates` (16 lignes) | seed de migration | `keel-cards-v1` + frontend | 🟢 donnée de référence, lecture seule voulue |
| `crisis_resources` (23) | seed de migration | `_shared/keel/crisis_resources.ts:489` | 🟢 idem |
| `substance_interactions` (8) | seed de migration | `plan-template-v1:141,198` | 🟢 idem |

`card_armings.delivered_at` et `user_rendez_vous.delivered_at` : le premier suit le sort des
cartes (D.3), le second est du legacy B2C (`v2-rendez-vous.ts:301`), hors périmètre pivot.

### D.5 — `meal_photo_flow` : inchangé 🟢

`reduceMealPhotoFlow` est exporté (`_shared/keel/meal_photo_flow.ts:161`) et a **zéro
appelant** hors son propre fichier de test. **Toujours débranché volontairement, rien n'a
bougé** — c'est bien l'état connu.

---

## Ce que je n'ai pas pu faire

- **Observer l'échec du vrai job `keel-weekly-flow` dans `cron.job_run_details`** : un run
  concurrent a désactivé 6 crons (dont celui-ci) à 16:41 UTC, avant son tick de :40. La
  preuve donnée en §A1 est une **sonde portant la commande verbatim**, exécutée par le même
  pg_cron — équivalente, mais ce n'est pas la ligne du job lui-même.
- **Mesurer le budget en envoi réel** (§A2) : mesuré en `dry_run`, qui saute l'invocation
  HTTP `whatsapp-send` par élève.
- Les secrets du vault ne sont pas seedés sur cette base locale : les crons y sont des
  no-ops qui **réussissent** (`0 rows`, garde `where base_url <> ''`). C'est un artefact
  local, pas un défaut — et c'est exactement pourquoi `keel-weekly-flow`, qui n'a pas cette
  garde, échoue bruyamment là où les autres se taisent.
