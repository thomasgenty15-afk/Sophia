# Chantier A — le poids cesse d'être une donnée hebdomadaire

Repo : `/Users/ahmedamara/Dev/Sophia 2`. Docs d'autorité : `docs/keel/MODEL.md`,
`docs/keel/CONTRACT.md`. Ce brief est **vérifié dans le code le 2026-08-08** ;
ce qui est hypothèse est marqué comme tel.

---

## 1. La décision, et elle est prise

Le propriétaire du produit a tranché : **la granularité de stockage d'une mesure
corporelle n'est pas la semaine.** Un élève peut se peser tous les jours, et
c'est ce que le produit doit garder.

Ce chantier fait ça, et **rien d'autre**. La suppression du point du dimanche
est un second chantier, séparé et postérieur (voir §6).

---

## 2. Ce qui existe aujourd'hui — VÉRIFIÉ

### Le poids vit sur une ligne de semaine

`weekly_reviews`, une ligne par `(user_id, week_start_date)` — imposé par
`weekly_reviews_user_week_no_plan_uidx (user_id, week_start_date) WHERE
plan_version_id IS NULL`.

Le poids y est dans `biofeedback.weight_kg`, avec `biofeedback.source`
(`'chat'` ou le formulaire) et `biofeedback.measured_at`.

### Trois écrivains, tous vers la même ligne

| chemin | fichier | déclencheur |
|---|---|---|
| le point du dimanche | `_shared/keel/weekly_flow.ts` | flow WhatsApp/in-app |
| la carte des mesures | `/app/plan` → `saveMeasures` → jeton `buildMeasuresToken` | l'élève tape un poids |
| la déclaration en conversation | `_shared/keel/week_review_io.ts` → `writeDeclaredBodyMeasure`, appelé depuis `sophia-brain/router/run.ts:4297` | l'élève dit son poids en chat |

⚠️ **Le troisième est CÂBLÉ** même si `FF-008` est marquée « 🟡 Spécifiée ».
La fiche est en retard sur le code. Le vérifier avant d'écrire quoi que ce soit
dans la fiche.

### Et ils s'écrasent

`writeDeclaredBodyMeasure` porte le commentaire qui explique tout :

> La revue du dimanche n'a qu'UN poids par semaine. Deux lignes créeraient une
> variation fantôme, et `restriction_guard` JETTE sur une semaine dupliquée.
> La dernière déclaration gagne, quelle que soit sa source.

**C'est le défaut à corriger.** Lundi 98,5 · mercredi 98,1 · vendredi 97,9 →
seul vendredi survit, et l'écran affiche « week of 3 Aug » sur une mesure du
vendredi.

---

## 3. Le nœud, et c'est le seul risque réel du chantier

`restriction_guard` est le **plancher TCA**. Son contrat d'entrée :

- `weekly_outcomes[]`, **ascendant par `week_start_date`**, doublons interdits
  (« a duplicated day or a non-weekly series is a caller bug »)
- il calcule `rapid_weight_loss` sur `accelerated_loss_min_weekly_pct: 1.0`,
  c'est-à-dire **un pourcentage PAR SEMAINE**
- il lit `weight_7d_avg_kg` (`outcomes.weight_7d_avg`) quand il existe

👉 **Ne change pas son contrat.** Passer d'un stockage hebdo à un stockage par
mesure sans lui dériver une série hebdomadaire **désarme le plancher TCA** — la
ceinture la plus sensible du produit, et elle est marquée 🟢 Livrée (`FF-021`).

La forme sûre : une nouvelle table de mesures + une **fonction de dérivation**
qui rend exactement ce que `restriction_guard` attend aujourd'hui, testée contre
les mêmes cas.

---

## 4. Ce qu'il faut construire

1. **Une table de mesures** — `user_id`, `measured_at` (timestamptz), `kind`
   (`weight` | `waist`, liste fermée), `value_si` (numeric), `source`
   (`sunday_flow` | `plan_card` | `chat`, liste fermée). Bornes de plausibilité
   au CHECK, alignées sur `WEIGHT_KG_MIN/MAX` et `WAIST_CM_MIN/MAX` de
   `frontend/src/keel/api/bodyMeasures.ts`.
2. **Les trois écrivains y écrivent**, en plus de — ou à la place de —
   `biofeedback`. À arbitrer : double écriture transitoire, ou bascule sèche.
3. **La dérivation hebdomadaire** pour `restriction_guard`, avec ses tests.
4. **Les lecteurs** : `student_body_io`, `progressModel`, `weekModel`,
   `bodyMeasures.ts` (dont `datedMeasures`/`latest`), le tableau « Week by week »
   de `/app/plan`, `coach_synthesis`, `account-export-v1` (RGPD — une nouvelle
   table DOIT y entrer, voir la cicatrice « Lifecycle RGPD ne réclame pas les
   tables neuves »).
5. **La migration de l'existant** : les `biofeedback.weight_kg` déjà écrits
   deviennent des mesures datées au `measured_at` quand il existe, au lundi de
   la semaine sinon.

**Écrire la fiche AVANT de coder** — `docs/fonctionnalites/suivi-quotidien/`,
gabarit `docs/fonctionnalites/TEMPLATE.md`, onze sections obligatoires.
Prochain identifiant libre : **`FF-031`** (vérifier :
`grep -rho 'FF-[0-9]\{3\}' docs/ | sort -u`).

---

## 5. Ce que ce chantier NE fait pas

- ❌ **Il ne touche pas au point du dimanche.** Le flow continue d'exister et
  d'écrire. Il écrira simplement au nouvel endroit.
- ❌ **Il ne touche pas aux six axes de vivabilité** (`WEEKLY_AXES` : energy,
  hunger, sleep, digestion, mood, training). Ils restent sur `weekly_reviews`,
  ils ne sont pas des mesures corporelles, et ils alimentent `focus_axis`.
- ❌ **Il ne change pas le contrat de `restriction_guard`.** Voir §3.
- ❌ **Il n'affiche aucune nouvelle mesure d'énergie.** `CONTRACT.md` s'applique.

---

## 6. Le chantier B, pour information

La suppression du point du dimanche est décidée par le propriétaire mais
**instruite séparément** (`docs/keel/`, pas `docs/fonctionnalites/` — un retrait
n'est pas une fonctionnalité). Ce chantier-ci la rend beaucoup plus simple :
une fois le poids sorti de `weekly_reviews`, le point hebdo ne porte plus que
les six axes, et la question devient une question de vivabilité et non de
sécurité.

**Ne rien supprimer ici.**

---

## 7. Contraintes du dépôt — non négociables

1. **Commandes interdites sans validation humaine** : `supabase db push`,
   `db reset`, `functions deploy`, `secrets`, `link`. Hook bloquant. Donne la
   commande exacte à l'utilisateur, il l'exécute.
2. **Base locale partagée** — jamais de `db reset`. Migration par
   `docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres < f.sql`,
   puis enregistrer la version dans `supabase_migrations.schema_migrations`.
   ⚠️ **Vérifier les collisions de version avant de nommer le fichier** :
   `ls supabase/migrations/*.sql | sed 's|.*/||; s/_.*//' | sort | uniq -d`.
   Une autre session travaille en parallèle et en a déjà causé une.
3. **Tests Deno** :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
   ⚠️ `--no-check` masque les erreurs de type : lancer aussi `deno check` sur
   les fichiers touchés.
4. **Typecheck frontend** : `cd frontend && npx tsc -b`
   (`tsconfig.json` est un fichier de solution qui ne vérifie rien).
5. **Une autre session commite dans ce dépôt** avec `git add -A` et a déjà
   balayé du travail étranger dans ses commits. Commiter tôt, par chemins
   explicites.
6. **Deux tests rouges préexistants** : `src/edge/coverage-guard.int.test.ts`
   réclame `keel-daily-recommendation-v1` et le trigger
   `student_daily_recommendations_set_updated_at` dans sa liste connue. Ce n'est
   pas ton travail — ne pas le « corriger » au passage.

---

## 8. Par où commencer

1. Lire `restriction_guard.ts` en entier, et ses tests. C'est lui qui décide de
   la forme de la dérivation, pas l'inverse.
2. Écrire `FF-031` dans `suivi-quotidien/`, en particulier §6 (les invariants)
   et §7 (les modes de défaillance) — le mode qui compte est « le plancher TCA
   ne mord plus et personne ne le voit ».
3. Poser la table et la dérivation, avec les tests, **avant** de toucher un
   seul écrivain.
