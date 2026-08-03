# RAPPORT AGENT 11 — Synthèse hebdo coach & écran du lundi

**Verdict global : AMBER** (RED à l'entrée : 3 findings P1, dont une garde de
sécurité déclarée et jamais armée. Les 3 sont corrigés et prouvés ; il reste 2
arbitrages structurels qui appartiennent au produit.)

**Environnement**

| | |
|---|---|
| Base | Supabase local `supabase_db_Sophia_2` (Docker), migrations à jour |
| Edge | `supabase functions serve`, env `supabase/functions/night_llm.env` (`EMAIL_DELIVERY_ENABLED=0`) |
| LLM | **aucun** — c'est le point du domaine : `coach-synthesis-v1` n'appelle aucun modèle, tous les chiffres sont calculés (`MEGA_TEST_MODE` sans objet ici) |
| Horloge simulée | `now = 2026-08-03T21:00:00Z` (≥ horloge réelle), `as_of_local_date = 2026-08-03` → fenêtre **2026-07-27 → 2026-08-02** |
| Fixtures | [`agent-11-fixtures.sql`](agent-11-fixtures.sql) — 6 coachs, 15 élèves, UUID déterministes `b11.*@keeltest.dev` (mdp `1234567`) |
| Preuves rejouables | [`agent-11-proofs.sql`](agent-11-proofs.sql) (cloisonnement, livraison, cohortes) · [`agent-11-recompute.sql`](agent-11-recompute.sql) (chaque nombre refait à la main en SQL) |
| Écran | `/coach/weekly` réel, dev server dédié port 5178 (origine séparée : les sessions QA partagent l'auth sur une même origine) |

> ⚠️ **Interférence constatée pendant le run** : d'autres sessions QA tournaient
> sur la même base (redémarrage du conteneur `edge_runtime` avec un autre
> `--env-file` à 18h51, édition concurrente de `CoachWeeklyPage.tsx` et de
> `.claude/launch.json`, apparition/disparition de coachs entre deux balayages).
> Rien n'invalide les preuves ci-dessous — toutes portent sur les personas
> `b11.*` — mais les compteurs globaux du job (`coaches_scanned`) varient d'un
> run à l'autre pour cette raison.

---

## Tableau des scénarios

| # | Scénario | Attendu | Observé | Verdict | Preuve |
|---|---|---|---|---|---|
| 1 | Vivabilité ≥ 3 taps | Dara (2 taps) = `unknown`, jamais « en forme » | `unknown`; récit « 2 holding up » = Ada + Farah seulement | ✅ GREEN | recompute §2 ; `metrics.livability.unknown = 4` |
| 2 | Le récit ouvre sur la vivabilité | « How the week felt… » avant toute observance | Ligne 1 = contact, **ligne 2 = vivabilité**, adhérence en 4ᵉ | 🟡 AMBER (voir F-12) | narratif ALPHA |
| 3 | Bornes contact 48h / 120h | 47→responsive, 49→slipping, 119→slipping, 121→silent | exactement ça (coach CHARLIE : 1/2/1) | ✅ GREEN | recompute §1 |
| 4 | `no_evaluable_plan` ≠ `low_coverage` | jamais « nobody logged », jamais 0 % | evidence par élève : **juste** ; **phrase du récit : FAUSSE** | ❌ RED → corrigé | F-2, recompute §4bis |
| 5 | Chaque flag porte sa raison ; `restriction_flag` → « handle directly » | Farah signalée en priorité | **aucun `restriction_signal` possible** : le drapeau n'était jamais lu | ❌ RED → corrigé | F-1 |
| 6 | Deux cohortes → synthèses scopées | une synthèse par cohorte | **une seule ligne, `cohort_id` NULL, 7 élèves mélangés** ; scoping structurellement impossible | ❌ RED (non corrigé, arbitrage) | proofs §6 |
| 7 | Ordre de l'écran, aucun classement | prose → « worth a message » → chiffres | ordre respecté, aucun classement, aucun score | ✅ GREEN | capture + texte de page |
| 8 | `delivered_at` posé une fois | 3 réouvertures ne bougent pas la date | `2026-08-03 16:29:37.989051+00` identique après 3 rechargements ; RPC idempotente | ✅ GREEN | proofs §8 + relecture DB |
| 9 | Cloisonnement coach B | SELECT vide, RPC NULL, UPDATE 0 ligne | les trois, **plus** contre-test (ALPHA marque bien la sienne) | ✅ GREEN | proofs §9 |
| 10 | Zéro donnée | constat honnête, écran gère le vide | DELTA honnête ✅ ; **coach sans élève : synthèse « 0 students » écrite quand même** | ❌ RED → corrigé | F-4 |
| MUST | Chaque nombre recalculable | 3 calculs refaits à la main | 5 refaits : contact, vivabilité, portions, couverture, adhérence | ✅ GREEN | `agent-11-recompute.sql` |

---

## Findings par gravité

### P1 — F-1 · `restriction_signal` ne pouvait pas exister (garde désarmée)

`StudentWeekInput.restrictionFlag` existe, `classifyRisk` le fait passer **avant
tout**, `flagFor` en tire `restriction_signal` (sévérité 0, **exempt du plafond**
des 3), `describeFlag` écrit « this one is yours to handle »… et
`buildAndWriteCoachSynthesis` ne renseignait **jamais** le champ. Paramètre
optionnel ⇒ oubli silencieux : c'est la classe
[optional-gate-params-are-disarmed-gates] déjà payée sur `safetyBand`.

Observé sur Farah, marquée `weekly_reviews.risk_band='restriction_flag'` sur la
semaine couverte :

```
 reason_code       | risk_band | full_name
-------------------+-----------+--------------
 no_evaluable_plan | watch     | Farah Nasser     <-- avant fix
```

…puis **tronquée par le plafond des 3** : le seul élève de la cohorte porteur
d'un signal clinique était totalement absent de l'écran du coach.

**Corrigé.** `loadRestrictionFlags()` lit deux sources et fait un OU :
`contract_change_requests(reason_code='restriction_signal', status='open')` — la
source **vivante**, écrite par `escalateRestrictionSignal` (provision du jour +
routeur) — et `weekly_reviews.risk_band` sur la fenêtre. Après fix :

```
 reason_code        | risk_band        | full_name
--------------------+------------------+--------------
 restriction_signal | restriction_flag | Farah Nasser     <-- 1re de la liste
```

### P1 — F-2 · Le récit énonçait une raison FAUSSE

> « No adherence figure this week: 4 of 7 students have no published plan, and
> **the others logged fewer than 4 of 7 days**. »

Les « others » étaient déduits, jamais mesurés. `flagReason` porte une
**priorité** (silence > semaine dure > couverture), donc Bilal — **5 jours
loggés sur 7**, signalé `week_too_hard` — tombait dans « the others » et se
retrouvait décrit comme n'ayant quasiment rien loggé. C'est l'incident de la
raison fausse, deuxième moitié : le commentaire du module dit l'avoir corrigé,
il n'en avait corrigé qu'une forme.

Contre-exemple prouvé ligne à ligne (`agent-11-recompute.sql` §4bis) :

```
 full_name    | logged_days | reason_recomputed | verdict
--------------+-------------+-------------------+-------------------------------
 Bilal Haddad |           5 | week_too_hard     | <<< la phrase etait FAUSSE pour lui
```

**Corrigé.** Les deux causes sont désormais **comptées sur les faits**
(`kind='adherence' && evaluableDays===0` d'un côté, `kind='insufficient_data'`
de l'autre), et la phrase n'infère plus rien :

> « No adherence figure this week: 5 of 7 students have no published plan to log
> against, and 2 logged fewer than 4 of 7 days. »  (5 + 2 = 7, chacun vérifié)

### P1 — F-3 · L'écran et le moteur ne parlaient pas le même vocabulaire

`REASON_COPY` était clé sur `silent_contact`, `hard_week`, `low_coverage`,
`restriction_flag` ; le moteur émet `silent_5d`, `week_too_hard`,
`coverage_below_gate`, `restriction_signal`. **6 codes sur 8 tombaient en
jargon brut** — capture avant fix :

```
WORTH A MESSAGE
b1570000   silent_5d   silent   no number to show
```

Et surtout : la copie exigée par le prompt, « Restriction signals — handle
directly », existait, était rédigée, **et inatteignable** — rangée sous une clé
que le moteur ne produit jamais.

**Corrigé.** Vocabulaire déplacé dans `frontend/src/keel/copy/flagReasons.ts` et
recalé sur `FLAG_REASONS`, avec un test de dérive qui **lit le fichier moteur**
et exige la bijection dans les deux sens.

### P2 — F-4 · Une synthèse était écrite pour un coach sans élève

L'en-tête de `coach-synthesis-v1` promet le contraire (« on ne crée PAS une
synthèse vide : elle serait indiscernable d'une semaine où tout le monde s'est
tu »). L'écriture avait simplement lieu **avant** le test. Trois symptômes :

- le job annonçait `syntheses_written: 16` pour **19 lignes** réellement en base ;
- coach ECHO (0 élève) lisait sur `/coach/weekly` : « 0 students this week: 0 in
  touch, 0 slipping, 0 silent. / Nobody checked in enough this week to say how it
  felt. / No adherence figure this week: nobody logged at least 4 of 7 days. » —
  un constat d'échec sur des gens qui n'existent pas ;
- le vrai vide (« No weekly read yet ») était donc inatteignable.

**Corrigé** des deux côtés : sortie avant le write dans
`buildAndWriteCoachSynthesis` (`reason_code: "no_students"`) **et** garde de
rendu dans `renderSynthesisText`. Après fix, sur un balayage complet :
`syntheses_written: 18`, `coaches_without_students: 4`, **0 ligne à
`student_count = 0`**, 0 ligne pour ECHO.

### P2 — F-5 · Aucun scoping par cohorte (scénario 6) — **non corrigé**

Deux cohortes chez ALPHA (4 + 3 élèves) produisent **une** ligne, `cohort_id`
NULL, `student_count: 7`. Ce n'est pas un oubli d'appel : la clé d'unicité
`(coach_id, kind, period_start, period_end)` **exclut `cohort_id`**, donc une
seconde synthèse scopée de la même semaine est rejetée par la base :

```
PASS §6 impossible d'écrire une 2e synthèse scopée cohorte
     (rejected: duplicate key value violates unique constraint
      "coach_syntheses_coach_id_kind_period_start_period_end_key")
```

Corriger demande une **migration** (clé sur `(coach_id, kind, cohort_id,
period_start, period_end)` avec `cohort_id` NULL = « tous ») **et** un arbitrage
produit : le coach veut-il une lecture par cohorte, ou une seule lecture pour
tout le monde ? Hors mandat d'un agent QA : proposé, pas appliqué.

### P2 — F-6 · La vivabilité n'était pas dans la ligne, seulement dans la phrase

`metricsPayload` n'écrivait ni `livability` ni `planned`. Le chiffre de tête du
modèle 1:N (« 2 holding up, 1 having a hard time ») n'était donc **pas**
re-vérifiable depuis la ligne, ce que l'en-tête du module promet explicitement,
et l'écran ne pouvait pas l'afficher. **Corrigé** (additif, jsonb) :

```json
"livability": {"hard": 1, "unknown": 4, "strained": 0, "sustainable": 2}, "planned": 4
```

### P2 — F-7 · « Worth a message » n'affichait aucun nom

La liste montrait `b1570000` (8 caractères d'UUID) pendant que la prose
juste au-dessus nommait « Chen Wei ». Une section appelée *worth a message* dans
laquelle on ne peut identifier personne n'est pas actionnable. **Corrigé** : les
noms sont résolus via `coach_student_directory` (vue Tier B filtrée par
`coached_student_ids()`, donc strictement les élèves encore rattachés) ; repli
sur l'id court quand il n'y a pas de nom, et `deleted account` préservé.

### P2 — F-8 · Une régénération garde le « lu » et la date d'écriture de la version précédente — **non corrigé**

Après régénération avec un contenu **différent** (nouveau motif, nouvelle
phrase) :

```
 delivered_at                  | generated_at
-------------------------------+-------------------------------
 2026-08-03 16:29:37.989051+00 | 2026-08-03 16:25:25.072182+00   (contenu produit à 18:52)
```

L'écran affiche « Written 03/08/2026 18:25:25 · read » pour un texte que
personne n'a lu. La métrique « combien de temps avant que le coach lise »
devient fausse dès qu'une semaine est rejouée. Le fix propre (rafraîchir
`generated_at` et **remettre `delivered_at` à NULL quand, et seulement quand, le
contenu change**) touche la définition d'une métrique produit : proposé, pas
appliqué.

### P2 — F-9 · `no_evaluable_plan` conseille au coach une action que le pivot a supprimée — **non corrigé**

La migration `20260803200000` déprogramme l'évaluateur pour le 1:N, et
`evaluate-adherence-v1` est le **seul** écrivain de `commitment_evaluations`
(vérifié par grep). Conséquence mesurée sur la cohorte pivot-réaliste : **7
élèves sur 7 signalés**, 5 en `no_evaluable_plan`, `with_adherence: 0`,
`mean_core_adherence_pct: null`. Or la phrase du flag dit :

> « publish their plan and this becomes measurable »

Ce n'est vrai ni côté doctrine (dans la masterclasse, l'élève génère son plan,
le coach ne prescrit plus) ni côté machine (même publié, rien ne serait évalué :
le cron est débranché). Trois options, toutes des décisions produit : retirer la
branche adhérence du récit 1:N, réarmer l'évaluateur pour les cohortes, ou
reformuler le motif en constat neutre. À noter aussi : le plafond de 3 a été
conçu pour « les 3 élèves à rattraper » à un moment où être signalé était
l'exception ; il est maintenant la règle (`flagged_total_before_cap: 7`).

### P3 — F-10 · Bloc « The numbers » : JSON brut qui débordait sa colonne — corrigé

`{"large":7,"small":17,…}` sortait de sa cellule et **recouvrait** le chiffre
voisin (visible sur la capture avant fix). Rendu en mots, coupé, cellule
autorisée à rétrécir (`min-w-0`). Vérifié dans le navigateur : plus aucune
cellule en débordement (`scrollWidth > clientWidth` → liste vide).

### P3 — F-11 · `content_locale = 'en'` alors que KEEL écrit `'en-GB'` — non corrigé

`renderSynthesisText` lève une erreur R7 sur toute locale ≠ `en`… mais son
unique appelant code `locale: "en"` en dur : **la garde ne peut jamais mordre**.
Pour le pilote anglophone c'est juste par accident. Un coach francophone
recevrait de l'anglais en silence.

### P3 — F-12 · Le récit ouvre sur le contact, pas sur la vivabilité

Le prompt demande « le récit OUVRE sur la vivabilité ». Ligne 1 = contact,
ligne 2 = vivabilité. L'intention (« jamais sur l'observance ») est respectée —
l'adhérence n'arrive qu'en 4ᵉ — mais la lettre ne l'est pas. Échange d'une
ligne si le produit veut la conformité littérale ; pas touché sans arbitrage.

### P3 — F-13 · Deux élèves de même prénom sont indistinguables dans la prose

Révélé par la fixture (deux personas nommés « Delta ») : « - Delta: has never
replied since being added. » deux fois de suite. Dans une masterclasse de 30
élèves, deux « Sarah » sont une certitude. L'écran, lui, est désormais correct
(nom complet). Proposition : désambiguïser dans le récit (nom + initiale).

---

## Fixes appliqués

| Fichier | Changement | Test de non-régression |
|---|---|---|
| `_shared/keel/coach_synthesis_io.ts` | `loadRestrictionFlags()` (escalade ouverte **ou** `risk_band` de la semaine) + passage effectif à `loadStudentWeek` | `an OPEN restriction escalation reaches the synthesis (the live writer)` · `a restriction_flag risk band on the covered week also reaches it` · **prémisse fausse** : `no restriction anywhere: nobody is accused of one` |
| `_shared/keel/coach_synthesis_io.ts` | sortie avant écriture quand la cohorte est vide (`no_students`) | `a coach with no students writes NO row at all` |
| `_shared/keel/coach_synthesis.ts` | phrase du gate comptée sur les faits, plus d'inférence sur « the others » | `the gate sentence COUNTS both causes instead of deducing one from the other` · **désarmements** : `…does not mention coverage when coverage is not the cause` · `…still says 'nobody logged' when NOBODY logged` |
| `_shared/keel/coach_synthesis.ts` | garde de rendu « 0 élève » | `a coach with no students is not told his cohort went quiet` |
| `_shared/keel/coach_synthesis.ts` | `metrics.livability` + `metrics.planned` | `the row CARRIES the livability, it is not only in the sentence` |
| `frontend/src/keel/copy/flagReasons.ts` (neuf) | vocabulaire recalé sur `FLAG_REASONS`, repli brut R7 | `flagReasons.int.test.ts` — 4 tests, dont bijection **lue dans le fichier moteur** |
| `frontend/src/keel/pages/CoachWeeklyPage.tsx` | noms via `coach_student_directory`, copie partagée, `The numbers` lisible | vérifié dans le navigateur (voir ci-dessous) |

**Re-run vert :**

- `deno test supabase/functions/_shared/keel/` → **516 passed, 0 failed**
  (41 → 50 sur les deux fichiers de la synthèse : +9 tests).
- `npx vitest run src/keel/copy/flagReasons.int.test.ts` → **4 passed**.
- `npx tsc --noEmit -p tsconfig.app.json` → clean.
- **Le test de dérive mord** : en retirant `week_too_hard` de la copie →
  `× covers every reason code the engine can emit → expected [ 'week_too_hard' ] to deeply equal []`. Restauré.
- Job rejoué en réel : `{"ok":true,"coaches_scanned":22,"syntheses_written":18,"coaches_without_students":4,"failures":[]}`.

**Écran après fixes** (texte de page réel, `/coach/weekly`, coach ALPHA) :

```
WORTH A MESSAGE
Farah Nasser   Restriction signals — handle directly   responsive   no number to show
Chen Wei       Has not written in days                 silent       no number to show
Emeka Obi      Nothing to measure against yet          responsive   no number to show
Dara Quinn     Nothing to measure against yet          responsive   no number to show
THE NUMBERS
… livability  hard 1 · unknown 4 · strained 0 · sustainable 2   planned 4 …
```

## Fixes proposés NON appliqués

1. **F-5 scoping cohorte** — migration de la clé d'unicité + décision produit
   (une lecture par cohorte, ou une seule ?).
2. **F-8 régénération** — remettre `delivered_at` à NULL et rafraîchir
   `generated_at` **uniquement si le contenu change** : touche la définition de
   la métrique « temps avant lecture ».
3. **F-9 branche adhérence dans le modèle 1:N** — le plus important des trois :
   soit on retire l'adhérence du récit 1:N, soit on réarme l'évaluateur, soit on
   reformule `no_evaluable_plan`. Aujourd'hui le coach reçoit un conseil
   inexécutable, pour presque tous ses élèves.
4. **F-11 locale** — passer la locale de la cohorte à `renderSynthesisText`
   plutôt que `"en"` en dur, pour que la garde R7 puisse mordre.
5. **F-12 / F-13** — ordre des deux premières lignes, désambiguïsation des
   homonymes dans la prose.

## NOT_TESTABLE_LOCALLY

- **La livraison poussée** (WhatsApp / e-mail de la synthèse). `markSynthesisDelivered`
  n'a aucun appelant hors `in_app` : il n'existe pas de lot d'envoi. Le lundi,
  un coach qui n'ouvre pas l'app ne reçoit **rien** — alors que la promesse
  produit est « un coach qui n'ouvre jamais le dashboard mais lit sa synthèse ».
  Preuve en réel : template Meta approuvé + envoi observé côté Meta.
- **Le cron lui-même** (`keel-coach-synthesis`, `0 6 * * 1`). Planifié et
  vérifié dans `cron.job` ; son déclenchement à l'heure ne se prouve qu'en
  distant.
- **`weekly_reviews.risk_band='restriction_flag'`** : aucun écrivain trouvé dans
  le code (seulement des lecteurs — `keel-weekly-flow-v1`, et désormais la
  synthèse). La branche « escalade ouverte » du fix, elle, a des écrivains
  vivants. À croiser avec l'agent 12, qui a ce point dans son mandat.

## Reproduire

```bash
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres < docs/nutrition-pivot/qa/agent-11-fixtures.sql
```

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/coach-synthesis-v1 -H "Content-Type: application/json" -H "x-internal-secret: $(grep -E '^INTERNAL_FUNCTION_SECRET=' supabase/functions/night_llm.env | cut -d= -f2-)" -d '{"now":"2026-08-03T21:00:00Z","as_of_local_date":"2026-08-03"}'
```

```bash
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres < docs/nutrition-pivot/qa/agent-11-recompute.sql
```

```bash
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres < docs/nutrition-pivot/qa/agent-11-proofs.sql
```
