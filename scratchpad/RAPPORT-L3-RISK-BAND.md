# L3 — `weekly_reviews.risk_band` : les épreuves, ce qu'on perd, et le diff

**Branche** `ff-001-quotidien-du-coach` · **commits** `2eaf39cd`, `6f6fe1ec`, `056376b5` · **aucun push**
**Verdict de la prémisse : VÉRIFIÉE.** La colonne n'a aucun écrivain.
**Verdict du périmètre : LA PRÉMISSE EST FAUSSE SUR CE POINT.** Ce n'était pas
4 lectures mais **2 SELECT backend alimentant 5 surfaces de décision**, plus
**3 lectures front** (dont 2 hors périmètre, laissées en place).

---

## LES ÉPREUVES D'ABSENCE

### Épreuve 1 — LE CODE : aucun écrivain

L'erreur du master venait d'un grep qui ne regardait qu'une ligne. La méthode
correcte : **énumérer les écritures sur la table**, puis **ouvrir chaque
payload**. `weekly_reviews` a exactement 3 fichiers écrivains (6 sites) :

```
$ grep -rn "weekly_reviews" --include=*.ts --include=*.tsx supabase/functions frontend/src
$ for f in week_review_io.ts weekly_flow_io.ts student_body_io.ts deterministic_buttons.ts; \
    do grep -n "\.insert(\|\.update(\|\.upsert(\|\.delete(" "$f"; done

_shared/keel/week_review_io.ts   391 update / 399 insert / 417 update
                                 472 update / 477 insert / 488 update
_shared/keel/weekly_flow_io.ts   101 update / 112 insert
_shared/keel/student_body_io.ts  188 insert   → table `contract_change_requests`, PAS weekly_reviews
_shared/chat/deterministic_buttons.ts  aucune écriture (commentaires seuls)
```

Contenu réel de chaque payload (lu, pas grepé) :

| site | clés écrites |
|---|---|
| `week_review_io.ts:391/417` | `biofeedback` |
| `week_review_io.ts:399` | `user_id`, `week_start_date`, `plan_version_id`, `biofeedback`, `content_locale` |
| `week_review_io.ts:472/488` | `payload` = `{ week_facts, week_facts_computed_at }` |
| `week_review_io.ts:477` | `user_id`, `week_start_date`, `plan_version_id`, `content_locale`, `...payload` |
| `weekly_flow_io.ts:101` | `biofeedback` |
| `weekly_flow_io.ts:112` | `user_id`, `week_start_date`, `plan_version_id`, `biofeedback`, `content_locale` |

**Aucun `risk_band`, ni en clé directe, ni via spread.** Le spread `...payload`
de la l. 477 a été suivi jusqu'à sa définition (l. 452-455) : deux clés.

Écritures **dynamiques** (`.from(<variable>)`) — la seconde façon de cacher une
écriture :

```
$ grep -rn "\.from(\s*[a-zA-Z_$]" --include=*.ts supabase/functions | grep -v _test | grep -v node_modules
```
→ `account-export-v1` (`fetchAllRows` / `fetchKeelRows`, **`.select()` seuls**),
plus `admin.storage.from(BUCKET)` — du stockage objet, pas de table.
**Aucune écriture dynamique sur une table.**

Migrations : `risk_band` n'apparaît qu'une fois dans tout `supabase/migrations/`,
à sa **définition** (`20260727090000_keel_p0_commitments.sql:560`) — jamais dans
un `insert`, un `update`, un `default` ni un `trigger`.

### Épreuve 2 — `prosrc` : aucune fonction, aucun trigger

```sql
select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname not in ('pg_catalog','information_schema','pg_toast')
  and p.prosrc ilike '%risk_band%';
-- (0 rows)

select t.tgname, p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid
where t.tgrelid='public.weekly_reviews'::regclass and not t.tgisinternal;
-- (0 rows)
```

### Épreuve 3 — LES VUES : aucune projection

```sql
select table_schema||'.'||table_name from information_schema.views
where table_schema not in ('pg_catalog','information_schema')
  and view_definition ilike '%risk_band%';
-- (0 rows)

select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
  and pg_get_viewdef(c.oid) ilike '%weekly_reviews%';
-- (0 rows)   ← aucune vue ne lit même la table

select table_schema||'.'||table_name||'.'||column_name from information_schema.columns
where column_name ilike '%risk_band%';
-- public.weekly_reviews.risk_band     ← une seule colonne de ce nom dans toute la base
```

### Épreuve 4 — LA BASE : d'où viennent les lignes non-NULL

```sql
select count(*) total, count(risk_band) non_null from public.weekly_reviews;
--  total | non_null
--    4   |    3
```

```sql
select wr.risk_band, wr.week_start_date, wr.created_at, p.email
from weekly_reviews wr left join profiles p on p.id = wr.user_id
where wr.risk_band is not null order by wr.created_at;

on_track         | 2026-07-27 | 2026-08-05 18:47 | qa0805.a4.s1@keeltest.dev
watch            | 2026-08-03 | 2026-08-05 18:47 | qa0805.a4.s1@keeltest.dev
restriction_flag | 2026-08-03 | 2026-08-08 10:14 | qa-student-1786184056841fe9018@test.dev
```

**Les trois sont des fixtures de QA** — `@keeltest.dev` (agent-4, 2026-08-05) et
`@test.dev` (FF-021, ce matin). **Zéro ligne de production.**

Corroboration de forme : sur les 4 lignes de la table, `student_narrative`,
`coach_draft_reply`, `lapse_context` et `top_failing_commitment_id` — les autres
colonnes de la weekly review 1:1 — sont **toutes NULL**. Le nouveau bilan écrit
`week_facts` ; l'ancien n'écrit plus rien.

**Quand l'écrivain est-il mort ?** Il n'a jamais existé sur cette branche.
`git log -S "risk_band"` remonte à `26af8ef7` (« WIP snapshot before nutrition
pivot night run »), le commit qui **crée** la migration et `evaluator.ts` en même
temps. La seule occurrence en forme d'écriture (`risk_band: line.riskBand`) est
dans `coach_synthesis.ts:702` : c'est la bande **calculée** par `classifyRisk`
pour l'artefact du coach, écrite dans `coach_syntheses.flagged_students`, jamais
dans `weekly_reviews`.

### ⚠️ Épreuve bonus, non demandée : L'INVENTAIRE DES LECTEURS était faux

Le lot annonçait **4 lectures**. La réalité :

| | |
|---|---|
| `weekly_flow.ts:529` | **n'est pas une lecture** — c'est le commentaire du paramètre `restrictionFlagged` d'un module **pur**. La vraie lecture du point hebdo était `keel-weekly-flow-v1/index.ts:237`. |
| `reengagement_io.ts:266` (`isRestrictionFlagged`) | **1 SELECT, 4 appelants** : `keel-reengage-v1`, `keel-weekly-flow-v1`, **`keel-daily-pulse-v1`**, **`daily_recommendation_engine.ts`**. Les deux derniers n'étaient dans aucun diagnostic. |
| `coach_synthesis_io.ts:152` (`loadRestrictionFlags`) | 1 SELECT, **seconde source d'un OU** dont la première est vivante. |
| `CoachStudentPage.tsx:432` | 1 SELECT front. |
| **`StudentProgressPage.tsx:186`** | **1 SELECT front, HORS PÉRIMÈTRE** — non listé. |
| **`StudentWeekPlanPage.tsx:1079`** | **1 SELECT front, HORS PÉRIMÈTRE** — non listé, et le fichier est en cours d'édition par l'autre agent. |

→ **2 SELECT backend → 5 surfaces de décision**, et **3 SELECT front**.

---

## CE QUE L'HUMAIN PERD

Contre-test réel, 3 rejeux, élève neuf à chaque rejeu (coach + `coach_clients`
actif + plan publié + `student_week_plans` adopted + `locale` écrite).
Sonde `scratchpad/l3_probe.ts`, sorties `scratchpad/L3-AVANT.txt` / `L3-APRES.txt`.
Trois états, tous mesurés en appelant **les vraies fonctions de production** sur
la base locale, plus un appel **HTTP réel** de `keel-reengage-v1` cadré sur
l'élève (`after_user_id` = prédécesseur, `limit: 1`, `dry_run`).

| état | ce qu'il représente |
|---|---|
| **S0** | `risk_band` absent — **l'état de 100 % des élèves réels** |
| **S1** | `risk_band='restriction_flag'` semé (forme de production : `plan_version_id is null`, `content_locale` non nul) |
| **S2** | **pas de `risk_band`**, mais une escalade **vivante** `contract_change_requests(restriction_signal, open)` écrite par le vrai `escalateRestrictionSignal` |

### Le chiffre, surface par surface (S0 → S1, AVANT le lot, 3/3)

| surface | S0 (élève réel) | S1 (bande renseignée) | ce que la bande faisait |
|---|---|---|---|
| **la relance** (module) | `send` / ton `gentle` | `skip` / `restriction_flag` | **la relance ne part pas** |
| **la relance** (HTTP réel) | `armed: 1`, `skipped_by_reason: {}` | `armed: 0`, `{restriction_flag: 1}` | **1 relance armée → 0** |
| **le point hebdo** | `send` | `skip` / `restriction_flagged` | **le formulaire de poids n'est pas envoyé** |
| **la recommandation du soir** | `silent` / `nothing_significant` | `silent` / `restriction_flag` | motif ; et sur un élève avec de la matière, **la reco part au lieu de se taire** |
| **les pratiques du soir** (FF-029) | 2 pratiques, mode `ask` | **1 pratique** (la chiffrée est écartée), mode `remind` | **la pratique CHIFFRÉE du coach est retirée, et on ne pose plus de question** |
| **la synthèse coach** | `disengaged` / `silent_5d` / sévérité 1 | `restriction_flag` / `restriction_signal` / **sévérité 0** | **remonte en tête de la triage du coach** |
| **la fiche élève du coach** | fourchettes kcal affichées | bannière « numbers are the wrong tool right now » | **les fourchettes kcal sont masquées** |

**Voilà le prix exact, et il porte sur 7 comportements, pas 4.**

### Le chiffre qui compte davantage (S2, 3/3)

| surface | S2 : escalade **vivante**, pas de `risk_band` |
|---|---|
| la synthèse coach | **`restriction_flag` / `restriction_signal` / sévérité 0** ✅ elle voit |
| la relance | `send` ❌ **elle ne voit pas** |
| le point hebdo | `send` ❌ **elle ne voit pas** |
| la recommandation | `nothing_significant` ❌ **elle ne voit pas** |
| les pratiques | 2 / `ask` ❌ **elles ne voient pas** |
| la fiche élève du coach | **pas de bannière** ❌ **elle ne voit pas** |

> **Ce que cette ligne dit, et qui change la nature de la décision :**
> le plancher durable était **déjà à 0 % d'efficacité** pour un élève réellement
> repéré. Les 5 surfaces lisaient la seule source **sans écrivain**
> (`weekly_reviews.risk_band`) et ignoraient la seule source **alimentée**
> (`contract_change_requests`, **9 escalades ouvertes** en base locale).
> L'humain ne perd donc pas « la détection dans la durée » : il perd
> **l'apparence** d'une détection dans la durée. Le seul consommateur qui
> protégeait vraiment — la synthèse coach — **ne perd rien**, prouvé 3/3.

### Ce que le lot NE coûte pas (S0, AVANT vs APRÈS, 3/3)

| | AVANT | APRÈS |
|---|---|---|
| relance | `send` / `armed: 1` | `send` / `armed: 1` |
| point hebdo | `send` | `send` |
| recommandation | `silent`/`nothing_significant` | `silent`/`nothing_significant` |
| pratiques | 2 / `ask` | 2 / `ask` |
| synthèse coach | `disengaged`/`silent_5d`/1 | `disengaged`/`silent_5d`/1 |

**Identique, ligne pour ligne, 3 rejeux sur 3.** Pour un élève réel, rien ne
change — ce qui est la définition d'une garde morte.

---

## LE DIFF, ET SA JUSTIFICATION

Trois commits séparés **exprès** : le n°2 est le seul qui coûte quelque chose,
et l'humain peut le `revert` seul.

### `2eaf39cd` — les deux lectures qui ne coûtent rien

* `_shared/keel/coach_synthesis_io.ts` — `loadRestrictionFlags` perd sa **seconde**
  source. La première (`contract_change_requests`) est vivante et suffit :
  **prouvé par S2**. Le paramètre `window` disparaît de la signature : il ne
  bornait que la lecture supprimée, et un paramètre ignoré ferait croire à un
  bornage qui n'existe plus.
* `frontend/src/keel/pages/CoachStudentPage.tsx` — la lecture et la branche
  « Restriction signals this week ». **Mesuré : la bannière ne s'affichait déjà
  pas** pour un élève réellement escaladé (S2). Le commentaire laissé en place
  dit comment la réarmer **correctement** (lire l'escalade vivante).
* Le test `« a restriction_flag risk band also reaches it »` est **inversé**, pas
  supprimé : la garde qui compte est désormais qu'une ligne semée à la main
  n'accuse plus personne. Sans témoin, on rebrancherait la colonne morte demain
  en croyant réparer.

### `6f6fe1ec` — `isRestrictionFlagged`, et le périmètre corrigé

`isRestrictionFlagged` est **supprimée**. Ses 4 appelants passent `restrictionFlag: false`,
chacun sous un commentaire qui dit **que c'est faux et pourquoi** :
`_shared/keel/reengagement_io.ts`, `keel-weekly-flow-v1`, `keel-daily-pulse-v1`,
`_shared/keel/daily_recommendation_engine.ts`.

Trois choix à justifier :

1. **Pourquoi supprimer la fonction plutôt que 2 de ses 4 usages.** Les deux
   surfaces nommées par l'humain (relance, point hebdo) et les deux non nommées
   (tap quotidien, recommandation) partagent **un seul SELECT**. En retirer deux
   aurait laissé la même requête morte tourner sur deux crons — l'exacte
   « ceinture armée sur coffre vide » que le lot existe pour fermer. **Je dépasse
   donc l'énumération qui m'a été donnée, en le disant, et le commit est isolé.**
2. **Pourquoi `false` en dur plutôt que retirer le paramètre.** Les décideurs
   (`decideReengagement`, `decideWeeklyFlow`, `decideDailyRecommendation`,
   `practicesFor`, `decidePracticeMode`) exigent `restrictionFlag` **requis** —
   c'est la contre-mesure du dépôt à « paramètre optionnel = garde désarmée ».
   Retirer le paramètre aurait détruit la règle en même temps que sa source.
   Ici la **règle survit**, seule la **source** disparaît. Un test neuf
   (`« le décideur, LUI, mord toujours »`) le prouve : dès qu'un appelant sait
   dire `true`, le `skip/restriction_flag` revient. Le jour du réarmement, une
   ligne suffit.
3. **Pourquoi ce n'est pas la cicatrice « commentaire qui ment ».** Le défaut
   historique était un `false` en dur **sous un commentaire affirmant que la
   garde mordait**. Ici chaque `false` porte l'inverse : « FAUX, ET DIT COMME
   TEL », avec la mesure et le chemin de réarmement.

`docs/nutrition-pivot/qa-web/FF029_practices.ts` porte un avertissement : son
contrôle C3 va passer **RED**, et **ce RED est attendu** — il mesure exactement
le coût du retrait. Le rendre vert exige de rebrancher la source vivante, pas de
remettre une ligne dans `weekly_reviews`.

### `056376b5` — la colonne RESTE, et porte sa raison

**Question tranchée : on retire les lectures, on garde la colonne.** Trois
raisons, dont une **décisive** que la recommandation par défaut ne connaissait
pas :

* **Deux écrans élève la sélectionnent encore** — `StudentProgressPage.tsx:186`
  et `StudentWeekPlanPage.tsx:1079`. Ils étaient **hors du périmètre décidé**.
  Un `drop column` ferait répondre **42703** à PostgREST : deux écrans *morts*
  deviendraient deux écrans *en panne*. Une colonne orpheline est inoffensive.
* La table est **écrite en ce moment** par le chantier du bilan hebdo.
* Cicatrice `renaming-a-table-needs-three-absence-proofs` : on prouve l'absence
  de **lecteurs** avant de toucher à la forme. Il en reste deux.

La migration `20260808200000_weekly_reviews_risk_band_orphaned.sql` ne change ni
donnée ni schéma : un `comment on column` seul, appliqué en local et enregistré
dans `supabase_migrations.schema_migrations`. Il porte les 4 épreuves, la raison
du maintien, et l'interdit : **ne pas la remplir**.

### Ce qui n'a PAS été touché, délibérément

| gardé | pourquoi |
|---|---|
| `__last_turn_risk_band` (`run.ts` → `safety_band_io.ts`) | mécanisme **différent**, vivant, testé. Hors lot, non touché. |
| `restriction_guard.ts` / `restriction_runtime.ts` | le module pur validé par FF-021, 4 déclencheurs vivants. Intact. |
| `escalateRestrictionSignal` + `contract_change_requests` | **la seule source alimentée**. Intacte, et c'est elle qui porte le réarmement. |
| `account-export-v1` l. 15, 339, 436 | **cicatrice `legacy-references-that-must-survive-removal`.** `risk_band` y est (a) nommé dans l'en-tête comme classification **non exportable**, (b) la justification écrite de son absence de `SCOPE.weeklyReviews`, (c) une note sur les données d'**autrui** dans `flagged_students`. Retirer ces mentions **retirerait la règle**, pas une référence morte. |
| `account_export_test.ts:233` | `"risk_band"` est dans la **liste de chaînes interdites** que le test cherche dans l'archive. Le retirer désarmerait le test. |
| `account-deletion-v1:475` (`safety_context_risk_band`) | rien à voir : c'est le contexte de sécurité du jeton de confirmation. |
| `StudentProgressPage.tsx`, `StudentWeekPlanPage.tsx` | **hors périmètre décidé**, et le second est en cours d'édition par l'autre agent. Signalés, non touchés. |
| `_shared/keel/week_review.ts`, `week_review_io.ts` | **fichiers réservés**. Lus pour la preuve, **jamais modifiés** — et la suppression propre n'en avait pas besoin. |

---

## LE TABLEAU DES TESTS

| # | test | méthode | verdict |
|---|---|---|---|
| 1 | Épreuve code — payloads d'écriture | lecture de 6 sites + recherche des écritures dynamiques | **GREEN** — 0 écrivain |
| 2 | Épreuve `prosrc` | `pg_proc` + `pg_trigger` | **GREEN** — 0 ligne |
| 3 | Épreuve vues | `information_schema.views` + `pg_get_viewdef` | **GREEN** — 0 vue |
| 4 | Épreuve base | `weekly_reviews` × `profiles` | **GREEN** — 3/3 lignes = fixtures QA |
| 5 | Contre-test S1, relance (module) | run réel × 3 | **GREEN** — `skip/restriction_flag` avant, `send` après |
| 6 | Contre-test S1, relance (HTTP réel) | `keel-reengage-v1` dry-run cadré × 3 | **GREEN** — `armed 0→1` |
| 7 | Contre-test S1, point hebdo | run réel × 3 | **GREEN** — `skip/restriction_flagged` → `send` |
| 8 | Contre-test S1, recommandation | run réel × 3 | **GREEN** — motif `restriction_flag` → `nothing_significant` |
| 9 | Contre-test S1, pratiques FF-029 | run réel × 3 | **GREEN** — 1/`remind` → 2/`ask` |
| 10 | Contre-test S1, synthèse coach | run réel × 3 | **GREEN** — sév. 0 → sév. 1 |
| 11 | **S2 — la source vivante suffit à la synthèse** | escalade réelle × 3 | **GREEN** — flaggé sans `risk_band` |
| 12 | **Ligne de base S0 avant vs après** | run réel × 3 | **GREEN** — **identique ligne pour ligne** |
| 13 | Suite Deno complète, env purgé | `deno test supabase/functions/` | **GREEN** — **3701 passed / 0 failed** / 67 ignored |
| 14 | Typecheck front | `npx tsc -b` (dans `frontend/`) | **GREEN** |
| 15 | RGPD — export de compte | `account_export_test.ts` sur stack live | **GREEN** — 1 passed |
| 16 | RGPD — cycle de vie complet | `keel_gdpr_lifecycle_test.ts` sur stack live | 🔴 **RED PRÉEXISTANT** (ci-dessous) |
| 17 | `agent-gate` (×3 commits) | typecheck + `deno check` + eslint | **GREEN** |

**Deux faux verts trouvés dans mes propres sondes** avant de conclure (T-15,
septième et huitième occurrences de la campagne) :

1. `practicesFor` rendait `[]` **dans les deux états** : ma fixture de pratiques
   n'avait pas de `status`, le parseur les dégradait en `needs_review` et elles
   étaient écartées **avant** le plancher. J'aurais conclu « cette garde ne fait
   rien ». Une ceinture dans la sonde refuse désormais de mesurer si
   `parseDailyPractices` remonte la moindre `issue`.
2. La ligne semée l'était sur le **lundi courant**, alors que
   `loadRestrictionFlags` borne sa lecture à la **dernière semaine complète**.
   `synthesisFlagged` serait sorti `false` en S1 — « la garde de la synthèse ne
   mord pas », alors que la fixture ne l'atteignait pas. Semée désormais sur
   `lastCompleteWeek().periodStart`, qui sert aussi `isRestrictionFlagged`.
3. (bonus) `escalateRestrictionSignal` **a refusé** mon objet fabriqué à la main
   (`guard_version undefined is not restriction_guard.v1`). La sonde passe
   maintenant par le vrai `evaluateRestrictionGuard`.

### Le RED préexistant, prouvé antérieur — non réparé

`keel_gdpr_lifecycle_test.ts` échoue sur
`seed recurring_meals: Could not find the table 'public.recurring_meals'`.

Preuve d'antériorité :
* `select to_regclass('public.recurring_meals')` → **NULL** : la table est
  droppée en base ;
* `git log -S "recurring_meals" -- supabase/migrations/` → **`0269bc30`**
  (« la cascade plan/transformation s'en va — 21 tables »), commit **antérieur** ;
* aucun de mes fichiers modifiés ne mentionne `recurring_meals` ;
* **`git stash` scopé sur mes 7 fichiers** → **même échec, même message**.

Non réparé (règle 9). Il touche l'**export** au sens du seeding du test, pas le
chemin RGPD lui-même — le test d'export réel (#15) passe.

---

## CE QUI RESTE OUVERT

1. 🔴 **Le vrai défaut est plus grave que celui qu'on a corrigé, et il est
   toujours là.** L'escalade `contract_change_requests(restriction_signal, open)`
   — **9 lignes ouvertes en base locale**, écrite par 2 appelants vivants — est
   lue par **la synthèse coach et personne d'autre**. Un élève réellement repéré
   par le plancher reçoit aujourd'hui sa relance, son point hebdo, sa
   recommandation du soir et ses pratiques chiffrées. **Mesuré 3/3 (S2), avant
   comme après ce lot.** Rebrancher les 4 crons dessus est un changement de
   ~5 lignes ; c'est un **changement de comportement** sur des élèves réels,
   donc à arbitrer, pas à glisser. **C'est le lot qui devrait suivre.**
2. **Deux lectures front subsistent**, hors périmètre :
   `StudentProgressPage.tsx:186` (masque tous les chiffres de `/app/progress`) et
   `StudentWeekPlanPage.tsx:1079` (masque une carte de `/app/plan`). Elles sont
   inertes pour les mêmes raisons. **Elles sont aussi la raison de garder la
   colonne.** `StudentWeekPlanPage.tsx` est en cours d'édition par l'autre agent :
   à traiter dans un lot séparé, une fois le fichier libre.
3. `docs/nutrition-pivot/qa-web/FF029_practices.ts` contrôle **C3** passera RED
   au prochain run. Avertissement posé dans le fichier ; c'est la mesure du coût,
   pas une régression à réparer sur place.
4. La colonne reste. Son `drop` deviendra sûr quand les deux écrans du point 2
   seront traités — et la migration de commentaire dit déjà pourquoi elle est là.

---

## LES COMMANDES POUR L'HUMAIN

Aucune n'est bloquante pour la branche : rien n'est poussé, rien n'est déployé.

**Déploiement.** La liste n'est pas devinée : c'est le résultat de
`grep -rln "coach_synthesis_io\|reengagement_io\|daily_recommendation_engine\|daily_recap_io" supabase/functions/*/index.ts`
— **7 fonctions edge** importent un des modules `_shared` modifiés.

```bash
supabase functions deploy keel-reengage-v1 keel-weekly-flow-v1 \
  keel-daily-pulse-v1 keel-daily-recommendation-v1 coach-synthesis-v1 \
  chat-inbound-v1 generate-week-plan-v1
```

> ⚠️ Ne pas raccourcir cette liste aux 4 crons « concernés ». `chat-inbound-v1`
> et `generate-week-plan-v1` importent les mêmes modules ; un déploiement
> partiel laisserait deux runtimes sur l'ancien code et rendrait un diagnostic
> incohérent — cicatrice `edge-runtime-serves-stale-shared-modules`.
> En local, `docker restart supabase_edge_runtime_Sophia_2` (déjà fait ici avant
> les mesures d'après).

**Migration** (commentaire seul, aucune donnée, aucun schéma) :

```bash
supabase db push
```

**Rejouer les mesures** (local uniquement) :

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY=$(npx supabase status -o env | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
export INTERNAL_FUNCTION_SECRET=$(grep -E "^INTERNAL_FUNCTION_SECRET=" supabase/.env | cut -d= -f2- | tr -d '"')
for i in 1 2 3; do deno run --allow-net --allow-env --allow-read --no-check scratchpad/l3_probe.ts $i; done
```

**Suite déterministe, environnement purgé** (sinon 114 faux rouges) :

```bash
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check supabase/functions/
```

**Fixtures** : les 30 comptes `L3 Coach*` / `L3 Student*` ont été supprimés
(`DELETE 30`, ceinture refusant tout compte hors motif QA). `weekly_reviews` est
revenue à son état d'avant : **4 lignes, 3 `risk_band` non-NULL — les fixtures
préexistantes des autres agents, intactes.**
