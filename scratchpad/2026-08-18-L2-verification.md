# LOT L2 — VÉRIFICATION ADVERSARIALE

**Date** : 2026-08-18 · **Branche** : `ff-001-quotidien-du-coach` · **Rôle** : mesurer, pas réparer.
**Rien n'est commité. Aucun `git stash`. Aucun fichier du lot n'a été modifié durablement**
(les 4 fichiers mutés sont restaurés à leur empreinte `shasum` d'origine, vérifiée).

---

## Verdict d'ensemble

| # | Point | Verdict |
|---|---|---|
| 1 | Le consommateur est atteint par un appelant vivant | 🔴 **FAUX** — l'appelant est un job fantôme |
| 2 | Privilèges + isolation RLS | 🟢 **CONFIRMÉ**, et plus fort que revendiqué |
| 3 | RGPD export + purge | 🟢 **CONFIRMÉ** sur pile vivante · 🔴 le contrat des 15 tables est pire que dit |
| 4 | Aucune énergie, ceinture avec cas passant | 🟢 **CONFIRMÉ**, prouvé dans les deux sens |
| 5 | Mutation des tests neufs | 🟡 **4 rouges sur 5** — une constante source est non gardée |

---

## 1. 🔴 Le consommateur : **MORT, et il a l'air vivant**

### La réponse en une phrase

> **Le consommateur est mort** : sa chaîne de code est juste et sa sélection retient 258 élèves,
> mais son unique appelant — le cron `keel-weekly-flow` — a **270 exécutions et 270 échecs, zéro
> succès**, parce qu'il est le seul des 20 jobs du dépôt à ne pas utiliser le helper commun ; le
> défaut précède le lot de deux semaines et **était déjà écrit dans le dépôt**, non corrigé.

### Ce qui est vrai dans la revendication

**La chaîne de code est juste.** Rejouée par moi, indépendamment, sur la base vivante
(`scratchpad/2026-08-18-L2-verif-consommateur.ts`, fixture Kai, 5 séances semées dont une hors
fenêtre et une chez un AUTRE élève) :

```
outcome : computed
activity (en mémoire) : {"sessions":3,"days":2,"minutes":65,"minutesFrom":2,
                         "byIntensity":{"easy":1,"moderate":0,"hard":1,"undeclared":1}}
activity GELÉ en base  : {"days":2,"minutes":65,"sessions":3,
                         "byIntensity":{"easy":1,"hard":1,"moderate":0,"undeclared":1},"minutesFrom":2}
« kcal/energy » dans le gel : ABSENT ✅
```

La séance hors fenêtre et celle de l'autre élève sont bien écartées — le `.eq('user_id')` de
`loadWeekFacts` et le filtre de fenêtre mordent tous les deux. Relu **depuis
`weekly_reviews.week_facts`**, pas depuis l'objet rendu.

**La sélection retient du monde** — c'est le point que l'implémenteur n'a pas rejoué, et il n'est
PAS le défaut. Rejouée par moi sur les 648 profils `keel_role='student'`, avec le code exact du
cron (`decideWeeklyFlow`, `resolveStudentFollowing`, `hasAnsweredWeek`, `hasAskedWeek`,
`localHourFor`), sur les **24 passages horaires** d'un dimanche
(`scratchpad/2026-08-18-L2-verif-selection.ts`) :

```
profiles keel_role=student : 648
sans timezone (jamais dans la fenêtre)      : 27
atteignent la fenêtre dimanche 18-21 local  : 609
décision SEND (⇒ computeAndStoreWeekReview) : 258
skips : { no_active_plan: 1017, opted_out: 36 }
```

Confirmé par la fonction elle-même en `dry_run` sur un seul passage (19:30Z) :
`scanned: 648, sent: 188`. **La sélection n'est pas le problème.**

### 🔴 Ce qui est faux : « le cron du dimanche, seul appelant, **et il est vivant** »

Le mot qui ne tient pas est **vivant**.

```
$ select j.jobname, d.status, count(*) from cron.job_run_details d join cron.job j …
 keel-weekly-flow | failed | 270          ← le SEUL job en échec des 20
 (les 19 autres)  | succeeded | …
```

Zéro succès depuis sa création. **Trois défauts indépendants, chacun suffisant** — je les ai
mesurés séparément :

**(a) L'URL est NULL, donc aucune requête HTTP n'est même tentée.**

```
$ select return_message from cron.job_run_details … order by start_time desc limit 1
 ERROR:  null value in column "url" of relation "http_request_queue" violates not-null constraint
 DETAIL: Failing row contains (3545, POST, null, {"Authorization": null}, \x7b7d, 120000).

$ select current_setting('app.settings.functions_base_url', true),
         current_setting('app.settings.service_role_key', true);
  (vide) | (vide)
```

Les deux GUC ne sont posées nulle part : `grep` sur tout le dépôt ne les trouve QUE dans
`supabase/migrations/20260803220000_pivot_weekly_flow.sql:85-88`. Les 19 autres crons utilisent
`app_config` + `vault.decrypted_secrets` (vérifié sur `keel-daily-pulse`, qui succède 273 fois).

**(b) Même URL réparée, la garde interne refuserait.** Le cron envoie
`Authorization: Bearer <service_role>` et **aucun** `x-internal-secret`. Mesuré en appelant la
fonction des deux façons :

```
(a) tel que le CRON l'appelle (Bearer service_role, sans x-internal-secret)
    → HTTP 403  {"error":"Forbidden"}

(b) avec x-internal-secret (comme les 19 autres crons)
    → HTTP 200  {"ok":true,"dry_run":true,"scanned":648,"sent":188,…}
```

**(c) L'URL n'a pas le segment `/functions/v1/`** que tous les autres jobs incluent.

### Et le dépôt le savait déjà

`docs/nutrition-pivot/qa/AGENT-14-INFRA-REPORT.md` (**daté 2026-08-03**, soit 15 jours avant ce
lot) porte le titre **« 🔴 R1 — `keel-weekly-flow` est un job fantôme : il échoue à chaque tick »**,
avec les **mêmes trois défauts**, la même preuve (sonde pg_cron temporaire), et cette conclusion :

> « Le **MUST "zéro job fantôme" n'est pas tenu** : `keel-weekly-flow` échoue à chaque tick depuis
> sa création et n'a jamais atteint sa fonction. »

Le rapport nomme aussi pourquoi la garde de la migration n'a rien vu : elle n'assert que
`count(*) from cron.job where jobname='keel-weekly-flow' = 1` — **l'existence, pas
l'atteignabilité**. C'est la cicatrice « une garde à moitié livrée ressemble à une garde qui
marche », appliquée au cron qui porte tout ce lot.

### Ce que ça implique pour L2

Ce défaut **n'est pas de L2** — il précède le lot et appartient à `20260803220000`. Mais il vide
la revendication centrale du lot. Le plan lui-même écrit : *« Le consommateur, et c'est la
condition d'existence »* (règle mère : on ne collecte une donnée que si quelque chose en aval la
consomme). Aujourd'hui, **rien en aval ne la consomme jamais**, parce que le seul déclencheur
n'a jamais tiré une fois. La table est correcte, son lecteur est correct, et le lecteur n'est
jamais appelé.

**Ce n'est PAS un consommateur mort par sélection vide** (258 élèves seraient retenus) : c'est un
consommateur mort par **plomberie de cron**, en amont de la sélection.

---

## 2. 🟢 Les privilèges et l'isolation RLS — confirmés, et au-delà

Rejoués par moi via `docker exec … psql`. `anon` est **absent des 7 verbes**, pas seulement des 5 :

```
 anon          | SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER = f (7/7)
 authenticated | SELECT=t INSERT=t DELETE=t | UPDATE=f TRUNCATE=f REFERENCES=f TRIGGER=f
 service_role  | les 7 = t
```

`relrowsecurity = t`, 3 policies propriétaire-seul (`select`/`insert`/`delete`, `to authenticated`,
`user_id = auth.uid()`), migration `20260818180000` **inscrite au registre**.

**L'isolation rejouée sous le rôle `authenticated`** (pas inspectée dans `pg_policies`), avec ses
cas passants, sur fixtures existantes (Eva propriétaire, Kai intrus), le tout dans une transaction
**rollbackée** :

```
 proprietaire_voit  | 1     ← CAS PASSANT: sans lui, « 0 » ne prouverait qu'une table illisible
 proprietaire_ecrit | 2     ← CAS PASSANT: il peut loguer
 intrus_voit        | 0
 intrus_supprime    | 0     ← 0 ligne supprimée, pas une erreur
```

Aucun écart avec ce qui est revendiqué.

---

## 3. RGPD — la table est réclamée 🟢, mais le contrat global est pire que décrit 🔴

### Le lot lui-même : prouvé des deux côtés, sur la pile vivante

**Export** (`scratchpad/2026-08-18-L2-verif-rgpd-export.ts`, fixture Kai, **aucun compte créé**) :

```
account-export-v1 → 200
tables_indisponibles : []
seances_dactivite    : [{"id":"89e525aa-…","local_date":"2026-08-04","kind":"mobility",
                         "duration_min":41,"intensity":"easy","source":"app","created_at":"…"}]
clés d'énergie       : AUCUNE ✅
« kcal » dans mon_plan.json : ABSENT ✅
```

**Purge** (compte-sonde créé en SQL direct — aucun `signUp`, donc aucun e-mail) :

```
purge-deleted-accounts → 200  {"ok":true,"purged":1,"errors":[]}
seances APRES purge    | 0
profil APRES purge     | 0
auth.users APRES purge | 0
```

Le `delete()` explicite s'exécute bien **AVANT** le `deleteUser` d'auth (lu dans `purgeOneUser`) :
c'est une suppression réelle, pas un ornement derrière une cascade déjà passée.

### 🔴 `keel_gdpr_lifecycle_test.ts` — l'affirmation est **CONFIRMÉE**, et le vrai état est pire

**Confirmé qu'il est rouge, et qu'il l'était avant le lot.** J'ai extrait la version de HEAD
(`git show HEAD:…`, jamais `git stash`) et je l'ai lancée telle quelle sur la pile vivante :

```
# version du lot          → FAILED | 0 passed | 1 failed
#   seed recurring_meals: Could not find the table 'public.recurring_meals'
# version de HEAD, intacte → FAILED | 0 passed | 1 failed   (même ligne, même cause)

$ select to_regclass('public.recurring_meals'), to_regclass('public.student_facts');
  (null) | (null)
```

**Ce que l'implémenteur n'a pas dit, et qui est plus grave :** sans variables `SUPABASE_*`, le test
**ne rougit pas — il est `ignored`** :

```
$ deno test --allow-all keel_gdpr_lifecycle_test.ts       # run normal, sans env
[skip] … needs a live Supabase stack — missing env: SUPABASE_URL, …
ok | 0 passed | 0 failed | 1 ignored
```

Or le run normal du dépôt **doit** être sans `SUPABASE_*` (« l'env QA empoisonne la suite », 114
faux rouges). Donc le contrat RGPD ne se contente pas d'être cassé : **il rend `ok` vert dans le
seul mode où on le lance**. Un filet rouge finit par être lu ; un filet qui saute ne l'est jamais.

**Le contrat porte 15 tables, pas 17** (compté : `grep -c 'table: "'` dans le bloc `PIVOT_TABLES`).
Deux sont absentes de la base, la fixture meurt sur la première (`recurring_meals`, 6ᵉ position) :
**13 tables réelles ont leur contrat export+purge vérifié par personne**, dont `chat_messages`,
`student_body_measures` et `student_safety_constraints`.

**Le test fuit des comptes à chaque run.** Il meurt dans `seedFullStudent` après avoir semé les
5 premières tables, sans nettoyage :

```
$ select count(*), min(created_at), max(created_at) from auth.users where email like 'a13.lifecycle+%';
 5 | 2026-08-08 15:40 | 2026-08-18 11:15
```

Cinq comptes orphelins depuis le 2026-08-08 — ce qui **date indépendamment la panne à ≥ 10 jours**.
Deux portent des lignes `student_activity_sessions` (donc issus de la version du lot : une de mes
passes de vérification, une d'une passe antérieure). Je ne les ai pas supprimés : « vérifier avant
de supprimer ». À purger d'un coup par un humain.

---

## 4. 🟢 Aucune énergie — prouvé, pas lu, et dans les deux sens

**Structurellement** : 8 colonnes, aucune d'énergie.

```
id · user_id · local_date · kind · duration_min · intensity · source · created_at
```

**La ceinture `energy_number` est réelle, et elle ferme un vrai trou.** Comparaison directe entre
le module du lot et **celui de HEAD** (`scratchpad/2026-08-18-L2-verif-ceinture.ts`) :

| Texte composé | AVANT (HEAD) | APRÈS (lot) |
|---|---|---|
| « …those 3 sessions cost you about 450 kcal » | **ACCEPTÉ** | REFUS `energy_number` |
| « you burned roughly 300 calories training » | **ACCEPTÉ** | REFUS `energy_number` |
| « about 1800 kilojoules of energy burned » | **ACCEPTÉ** | REFUS `energy_number` |
| « Around 500 Kcals went out this week » | **ACCEPTÉ** | REFUS `energy_number` |

**Le cas passant existe et il passe** — c'est la vérification qui comptait :

```
« You also logged 3 training sessions across 2 days. »                          → OK (accepté)
« …across 2 days, 65 minutes on 2 of them. »                                    → OK (accepté)
```

La ceinture ne bloque donc pas tout : elle laisse sortir le rendu nominal exact du lot.

**`COUNTABLE` : aveugle avant, voyante après — avec un contrôle.** Textes ne portant qu'UN seul
nombre, pour qu'aucun autre motif ne morde (`scratchpad/2026-08-18-L2-verif-countable.ts`) :

```
« You also logged 5 sessions. »   AVANT=ACCEPTÉ (aveugle)     APRÈS=REFUS invented_number
« You also logged 9 workouts. »   AVANT=ACCEPTÉ (aveugle)     APRÈS=REFUS invented_number
« You trained for 300 minutes. »  AVANT=ACCEPTÉ (aveugle)     APRÈS=REFUS invented_number
« You also logged 5 meals. »      AVANT=REFUS invented_number APRÈS=REFUS invented_number  ← CONTRÔLE
```

Le contrôle est ce qui donne sa valeur au tableau : `meals` était déjà dans la liste et refusait
déjà. Le changement est **spécifique aux trois noms ajoutés**, ce n'est pas un durcissement
global qui refuserait tout.

---

## 5. 🟡 Mutations — 4 rouges, **1 verte** (défaut trouvé)

Fichiers sauvegardés puis restaurés ; empreintes `shasum` identiques après restauration.

| # | Mutation | Résultat | Verdict |
|---|---|---|---|
| M1 | **attendu de test** : `assertEquals(summary.days, 2)` → `3` | `FAILED \| 16 passed \| 1 failed` | 🟢 rougit |
| M2 | **constante source** : `ACTIVITY_SESSION_MAX_MINUTES` `600` → `6000` | `ok \| 3322 passed \| 0 failed` | 🔴 **RESTE VERT** |
| M3 | **source** : retrait de `sessions?\|workouts?\|minutes?` de `COUNTABLE` | `FAILED \| 58 passed \| 1 failed` | 🟢 rougit |
| M4 | **source** : ceinture désarmée (`"energy_unit"` → `"__never_matches__"`) | `FAILED \| 58 passed \| 1 failed` | 🟢 rougit |
| M5 | **source** : `renderWeekActivityFact(…)` → `""` | `FAILED \| 57 passed \| 2 failed` | 🟢 rougit |

### 🔴 M2 — un test paramétré par sa propre constante, et une couture non signalée

`activity_session_test.ts:135` écrit son cas ainsi :

```ts
session(WEEK[0], { durationMin: ACTIVITY_SESSION_MAX_MINUTES + 1 }),
```

Il teste donc « borne + 1 », **quelle que soit la borne**. Porter la constante de `600` à `6000`
laisse **les 3322 tests verts**. C'est exactement la cicatrice « Test paramétré par sa propre
constante : reste vert quand on change la constante ».

Ce n'est pas cosmétique, parce que la borne existe **en double** :

- SQL : `check (duration_min >= 1 and duration_min <= 600)` — littéral figé en base ;
- TS : `ACTIVITY_SESSION_MIN/MAX_MINUTES` — **non figé par un test**.

La migration revendique pourtant l'invariant, mot pour mot :

> « Les mêmes deux nombres vivent dans `activity_session.ts` (ACTIVITY_SESSION_MIN/MAX_MINUTES) :
> un écran qui accepterait ce que la base refuse ferait saisir dans le vide. »

Rien ne tient cette phrase. Un écran construit sur la constante TS acceptera 1000 minutes et la
base rendra un `23514` — le mode d'échec que le commentaire dit prévenir.

**Écart avec le rapport** : l'implémenteur signale honnêtement la couture non gardée sur `kind`
(liste SQL vs `ACTIVITY_SESSION_KINDS`). Il **ne signale pas** celle des minutes — et c'est la
plus faible des deux : `kind` est figé **littéralement des deux côtés** (le test assert la liste
en dur, donc une divergence rougit), alors que les minutes ne sont figées **d'aucun côté** côté TS.

---

## Vérifications de routine

```
$ deno check  (9 modules touchés)                 → aucune erreur
$ deno test --allow-all _shared/keel/             → ok | 3322 passed | 0 failed (18s)
```

**Le chiffre correspond exactement à celui du rapport** (`3322 passed, 0 failed`). Aucune variable
`SUPABASE_*` exportée dans le shell ; les runs vivants passent par `env VAR=… ` en ligne.

Les 7 migrations d'autres lanes sont **toujours en attente** (vérifié une à une) — l'avertissement
🔴 du rapport reste ouvert et reste une décision humaine.

---

## Les écarts entre revendiqué et mesuré

| # | Revendiqué | Mesuré |
|---|---|---|
| 1 | « le cron du dimanche, seul appelant, **et il est vivant** » | 🔴 **270/270 échecs, 0 succès.** Job fantôme, seul en échec sur 20. Déjà documenté §R1 le 2026-08-03, non corrigé. Appelé comme le cron l'appelle → **403**. |
| 2 | La *sélection* du cron « n'a pas été rejouée » | 🟢 Rejouée par moi : **258 élèves retenus** sur 648. La sélection est saine — ce n'est **pas** elle qui tue le consommateur. |
| 3 | « le contrat RGPD des **17 tables** » | **15 tables**, dont 2 absentes ⇒ 13 réelles non vérifiées. |
| 4 | `keel_gdpr_lifecycle_test.ts` « est rouge » | Rouge **seulement si on lui donne l'env**. Dans le mode de run normal du dépôt il est **`ignored`, et la suite rend `ok`**. Il fuit en prime **5 comptes orphelins** depuis le 2026-08-08. |
| 5 | Couture non gardée : la liste `kind` | Vraie, mais **la plus solide des deux**. La couture réellement non gardée est **`MIN/MAX_MINUTES`** : mutée 600→6000, les 3322 tests restent verts. Non signalée. |
| 6 | `anon` absent des **5** verbes | Absent des **7** (REFERENCES et TRIGGER aussi). Revendication en-deçà du réel. |
| 7 | Preuves écrites avec `anon.auth.signUp(…@example.com)` | Les deux scripts de preuve **créent des comptes**. Aucun résidu (`l2.*@example.com` : 0 ligne) — ils se purgent. Mais le geste est contraire à la consigne « ne crée aucun compte » ; mes propres preuves passent par les fixtures `qa0805.*` et un compte-sonde en SQL direct. |

---

## Ce que je n'ai pas pu mesurer

- **Le comportement en production.** Tout est mesuré sur la pile locale. Pour `keel-weekly-flow`,
  la commande du job est celle que la migration **livre** et rien dans le dépôt ne pose
  `app.settings.functions_base_url` : le défaut est donc structurel, pas un artefact local — mais
  je ne peux pas le prouver sur la base de prod.
- **Un run réel du cron de bout en bout** : il exigerait de réécrire la commande du job, hors
  périmètre d'une vérification.
- Le premier appel à `account-export-v1` sur la fixture Eva a rendu **546 `WORKER_LIMIT`**, puis
  **429** (quota d'export consommé, `retry_after ≈ 12 h`). Preuve refaite sur la fixture Kai, 200.
  Le 546 n'est pas expliqué (fixture pourtant légère : 1 message) et n'est pas de ce lot.

## Nettoyage

Base rendue à son état d'entrée pour tout ce qui me revient : lignes `student_activity_sessions`
de fixtures supprimées, compte-sonde de purge supprimé, transaction RLS rollbackée, 4 fichiers du
lot restaurés à l'empreinte d'origine, copies HEAD temporaires effacées. **Restent** les 5 comptes
`a13.lifecycle+…` fuités par le test RGPD cassé (dont 1 de mes passes) : laissés en place, à purger
par un humain avec la réparation de la fixture.
