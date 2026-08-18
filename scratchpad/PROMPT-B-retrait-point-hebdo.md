# Chantier B — instruire le retrait du point du dimanche

Repo : `/Users/ahmedamara/Dev/Sophia 2`. Docs d'autorité : `docs/keel/MODEL.md`,
`docs/keel/CONTRACT.md`. Ce brief est **vérifié dans le code le 2026-08-08** ;
ce qui est hypothèse est marqué comme tel.

---

## 1. La décision, et ce qu'on te demande

Le propriétaire du produit a tranché : **le point du dimanche doit être
supprimé.**

⚠️ **Ta mission n'est PAS de le supprimer. Elle est de l'instruire.** Le dépôt
a une règle écrite pour ça, et elle a été payée : *vérification adversariale
avant toute suppression legacy*. Ce que tu produis est un **document de
retrait** dans `docs/keel/` (un retrait n'est pas une fonctionnalité : il n'a
ni job story durable ni métrique de succès au-delà de zéro, et les chantiers de
suppression ne vivent pas dans `docs/fonctionnalites/`).

Tu ne supprimes une ligne que si le document est validé par un humain.

---

## 2. Ce que le point du dimanche est aujourd'hui — VÉRIFIÉ

`keel-weekly-flow-v1`, déclenché par un cron `keel-weekly-flow`
(`supabase/migrations/20260803220000_pivot_weekly_flow.sql`). Le flow vit dans
`_shared/keel/weekly_flow.ts`.

**Deux écrans, et le second seulement est optionnel :**

1. **Six axes de vivabilité**, `WEEKLY_AXES` = `energy`, `hunger`, `sleep`,
   `digestion`, `mood`, `training`. Notés 1-5. **Obligatoires.**
2. **Poids et tour de taille.** Entièrement facultatifs.

Le commentaire du code est explicite, et c'est le cœur du sujet :

> Un élève qui ne se pèse pas — ou qui ne le souhaite pas, ce que ce produit
> respecte — termine quand même le point, et ses six axes sont enregistrés.
> **La mesure de vivabilité ne doit jamais être l'otage d'une balance.**

👉 **« Supprimer le point hebdo » supprimerait donc aussi les six axes**, qui
n'ont rien à voir avec le poids et qui sont le seul signal de **vivabilité** du
produit. C'est la première question à poser, et elle n'est pas tranchée.

---

## 3. Trois gardes qui vont mordre

**a. Une garde SQL qui lève une exception.**
`20260803220000_pivot_weekly_flow.sql` contient :

```sql
raise exception 'C4 guard: cron keel-weekly-flow absent (trouve %)', v_cron;
```

Retirer le cron sans traiter cette garde casse la migration.

**b. `focus_axis` dépend des six axes.**
`/app/plan` propose « The one thing I want to see improve » avec exactement
`FOCUS_AXES`, et affiche la tendance via `axisReading(reviews, axis)`. Deux des
six dynamiques d'objectif (`performance`, `health`) **n'ont aucune cible
chiffrée** et reposent uniquement sur cet axe. Les supprimer laisserait ces deux
objectifs sans aucun indicateur.

**c. `restriction_guard`, le plancher TCA (`FF-021`, 🟢 Livrée).**
Il consomme `weekly_outcomes[]` ascendant par `week_start_date`, doublons
interdits, et calcule `rapid_weight_loss` sur `accelerated_loss_min_weekly_pct:
1.0`. Il lit aussi `self_rated_adherence` et les jours loggés.

⚠️ **Le chantier A traite déjà le poids** (voir §5). Ce qui reste ici est le
reste : adhérence, axes, `risk_band`.

---

## 4. Le rayon d'explosion — 22 fichiers lisent `weekly_reviews`

```
_shared/chat/deterministic_buttons.ts     _shared/keel/coach_synthesis.ts
_shared/keel/coach_synthesis_io.ts        _shared/keel/daily_recap_io.ts
_shared/keel/daily_recommendation_engine.ts
_shared/keel/medical_condition_floor.ts   _shared/keel/reengagement_io.ts
_shared/keel/restriction_guard.ts         _shared/keel/restriction_runtime.ts
_shared/keel/student_body_io.ts           _shared/keel/week_review.ts
_shared/keel/week_review_io.ts            _shared/keel/weekly_flow.ts
_shared/keel/weekly_flow_io.ts            account-export-v1
generate-week-plan-v1                     keel-daily-pulse-v1
keel-weekly-flow-v1
frontend: bodyMeasures.ts · keelClient.ts · progressModel.ts · weekModel.ts
```

⚠️ **Distinguer trois choses**, et le document doit le faire explicitement :

| | ce que c'est | à supprimer ? |
|---|---|---|
| le **flow** | `keel-weekly-flow-v1` + son cron : le rituel du dimanche | c'est la demande |
| la **table** `weekly_reviews` | le stockage | ❓ 22 lecteurs |
| les **six axes** | le signal de vivabilité | ❓ jamais discuté |

Les confondre est la façon dont ce retrait casserait le plancher TCA sans que
personne ne le voie.

---

## 5. Ordre imposé : le chantier A d'abord

Un chantier A est en cours (ou fait) : **le poids sort de `weekly_reviews` vers
une table de mesures datées**, avec une dérivation hebdomadaire qui préserve le
contrat de `restriction_guard`. Brief :
`scratchpad/PROMPT-A-mesures-par-mesure.md`.

**Ne commence pas avant qu'il soit livré.** Après lui, le point du dimanche ne
porte plus que les six axes et l'adhérence — et la question « on le supprime ? »
devient une question de vivabilité, plus une question de sécurité. Le retrait
devient beaucoup plus petit et beaucoup moins risqué.

Si A n'est pas fait : **écris quand même le document**, en le disant.

---

## 6. Ce que le document doit contenir

1. **L'inventaire des lecteurs**, un par un, avec ce que chacun perd.
2. **Le sort des six axes** — la question à trancher par un humain. Trois
   options au moins : ils disparaissent · ils migrent dans le message du soir ·
   ils deviennent une carte à part.
3. **Le sort de `focus_axis`** et des deux dynamiques d'objectif qui n'ont que
   lui.
4. **Ce que `restriction_guard` perd** après le chantier A, et si ça le désarme.
5. **Les preuves d'absence** avant toute suppression — le dépôt exige trois
   épreuves pour renommer une table, et un audit d'appelants qui **retire les
   commentaires** avant de grep (un grep naïf compte des faux vivants).
6. **Ce qui est gardé exprès**, s'il y a lieu, avec la raison.
7. **RGPD** : `weekly_reviews` est dans `account-export-v1`. Toute suppression
   ou migration doit garder l'export cohérent.

---

## 7. Contraintes du dépôt — non négociables

1. **Commandes interdites sans validation humaine** : `supabase db push`,
   `db reset`, `functions deploy`, `secrets`, `link`. Hook bloquant.
2. **Base locale partagée** — jamais de `db reset`. Migration par
   `docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres < f.sql`,
   puis enregistrer la version. **Vérifier les collisions de version** :
   `ls supabase/migrations/*.sql | sed 's|.*/||; s/_.*//' | sort | uniq -d`.
3. **Tests Deno** :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
   plus `deno check` sur les fichiers touchés (`--no-check` masque les types).
4. **Typecheck frontend** : `cd frontend && npx tsc -b`.
5. **Une autre session commite dans ce dépôt** avec `git add -A`. Commiter tôt,
   par chemins explicites.
6. **Deux tests rouges préexistants** dans `src/edge/coverage-guard.int.test.ts`
   (`keel-daily-recommendation-v1`, `student_daily_recommendations_set_updated_at`).
   Pas ton travail.

---

## 8. Par où commencer

1. Lire `weekly_flow.ts` en entier — surtout ce que les six axes deviennent en
   aval (`biofeedbackAxes`, `axisReading`, `coach_synthesis`).
2. Faire l'audit d'appelants **commentaires retirés**, et le poser dans le
   document tel quel : c'est lui qui donnera sa taille au chantier.
3. Poser les trois questions ouvertes (§6 n°2, 3, 4) au propriétaire **avant**
   d'écrire une recommandation. Un retrait dont on n'a pas tranché ce qu'on
   garde est un retrait qui emporte ce qu'il ne fallait pas.
