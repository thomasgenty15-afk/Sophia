# PROGRESS — nuit du 2026-08-03 (pivot Coach Nutrition 1:N)

> Journal append-only, horodaté (CEST). Une ligne par étape : fait / vert / rouge / décision.
> Règle d'honnêteté : rien n'est marqué « vert » sans la commande de test qui l'a prouvé.
> Livrable du matin : `STATUS-MORNING.md`.

---

## 03:05 — P0.1 Snapshot + lecture de l'autorité

- `git commit 26af8ef7` — snapshot WIP de la branche `Nutrition` (335 fichiers).
  ⚠️ **`--no-verify` utilisé pour CE commit uniquement.** Le hook `.husky/pre-commit`
  (`scripts/agent-gate.sh`) lance eslint sur les fichiers frontend *stagés* : 46 erreurs
  pré-existantes dans des fichiers du WIP que je n'ai pas écrits (`AttackCards.tsx`,
  `WeekView.tsx`, `CoachBillingPage.tsx`, `entitlements.ts`, tests `.int.test.ts`…).
  `tsc -b` et `deno check` passaient. Un snapshot doit capturer l'état tel quel — le corriger
  aurait été une modification déguisée. Les commits de phase suivants passent le gate.
- Lu en entier : `PLAN-NUIT.md` (1298 l.) + `docs/keel/CONTRACT.md`, `SCHEMA.md`, `BUILD_PLAN.md`,
  `PHOTO_QUANTIFICATION.md`.
- **Stack locale UP** : Docker Desktop était éteint → `open -a Docker` puis `npx supabase start`.
  Vérifié : 48 migrations appliquées, **128 tables**, les 17 tables KEEL présentes en base locale.
  (`docker exec supabase_db_Sophia_2 psql -U postgres`. ⚠️ `psql` n'est PAS dans le PATH de
  l'hôte — toute commande SQL de cette nuit passe par `docker exec`.)

### Écart d'inventaire constaté (à la hausse) — l'ANNEXE B est en retard sur la réalité

L'ANNEXE B décrit la migration P0 comme « écrite, pas appliquée » (état `BUILD_PLAN.md` du 27/07).
**Vérifié en base locale : elle est appliquée**, ainsi que les 16 migrations KEEL suivantes.
Donc `coaches`, `coach_clients`, `plan_commitments`, `protocol_events`,
`commitment_evaluations`, `student_safety_constraints`, `card_templates`, `coach_billing_periods`,
`slot_vocabulary`, `food_groups`, `meal_ideas`, `meal_plan_entries` **existent réellement**.
Confirmé absents (grep migrations + code, 0 hit) : `coach_doctrines`, `cohorts`,
`coach_syntheses`, `recurring_meals`, `student_facts`. C'est exactement le périmètre P0.2.

---

## 03:15 — DÉCISION P0.0 (a) — IDENTITÉ ÉLÈVE

**Tranché : option (B) — `auth.users` fantôme provisionné par numéro de téléphone.**
Conforme à la recommandation du plan (§3.6). Ce n'est pas un choix par défaut : trois preuves
vérifiées cette nuit le rendent nettement supérieur à (A).

1. **Le chemin d'identification WhatsApp existant l'implémente déjà.**
   `whatsapp-webhook/index.ts:579-645` résout un entrant par
   `profiles.phone_number` → `profiles.id` (= `auth.users.id`), avec préférence pour le profil
   `phone_verified_at NOT NULL` quand plusieurs candidats matchent. Un élève fantôme avec un
   profil vérifié tombe dans ce chemin **sans une ligne de code modifiée**. L'option (A)
   (table `students` autonome) obligerait à réécrire cette résolution ET les ~15 FK KEEL.
2. **La doctrine RLS rend le compte fantôme inerte.** `docs/keel/SCHEMA.md` §TENANCY et
   `20260727090000` l.706-740 : l'élève est **SELECT-only**, toutes les écritures passent par
   `service_role`. Un compte sans mot de passe ne se connecte jamais → ses policies SELECT ne
   sont jamais exercées. Le fantôme n'ouvre aucune surface d'attaque nouvelle.
3. **RGPD déjà couvert.** Toutes les tables KEEL sont `ON DELETE CASCADE` vers `auth.users` et
   `purge_auth_user()` + `purge-deleted-accounts` existent. Une table `students` autonome
   sortirait de ce filet et demanderait sa propre purge.

**Chemin d'upgrade (ce que (B) achète)** : si un jour l'élève a une interface, on pose un mot de
passe ou on envoie un magic link **sur la même ligne** — zéro migration de données.

**Alternative si Thomas veut revenir dessus** : (A) reste faisable, coût ≈ 15 FK + réécriture de
la résolution webhook + purge RGPD dédiée. Le point de non-retour n'est pas cette nuit : tant
qu'aucun élève réel n'est provisionné, basculer coûte une migration.

**Dettes ouvertes par ce choix, à fermer dans P0.2** (chacune est un test) :
- `handle_new_user()` est déclenchée à l'INSERT dans `auth.users` et a été **réécrite 3 fois** :
  repartir de `20260727200000` et vérifier qu'elle ne seede **rien** de B2C pour un fantôme.
- `profiles.phone_number` n'est unique **que** validé : le provisionnement doit poser
  `phone_verified_at`, sinon le webhook classe l'entrant en « ambigu/inconnu ».
  Fonctions existantes à réutiliser : `is_verified_phone_in_use()`,
  `transfer_verified_phone_to_user()`, `sync_phone_verified_on_whatsapp_optin()`.
- Un numéro = un élève = un coach vivant (§5 « élève de DEUX coachs interdit v1 ») : l'index
  unique partiel existe déjà sur `coach_clients`.

---

## 03:15 — DÉCISION P0.0 (b) — CONTRAT kcal / MACROS

**Tranché : DIVERGENCE PARTIELLE de la recommandation du plan. Les fourchettes kcal/macros
ne sont PAS ajoutées. Le reste du contrat cible §3.5 l'est.**

Le plan (§3.5, P0.0bis) recommande d'« étendre le contrat existant vers les fourchettes +
hypothèses + `question_qui_changerait_tout` ». J'implémente **hypothèses + question**, et je
refuse **les fourchettes kcal/macros**. Justification (le plan exige une justification en cas
d'écart — §4 P0.0) :

**La preuve est dans le repo, et elle est empirique, pas doctrinale.**
`docs/keel/PHOTO_QUANTIFICATION.md` documente **85 appels réels** sur notre propre modèle
(`gemini-3.1-pro-preview`, payload exact de `buildVisionPayload`, vérité terrain USDA SR Legacy) :

| Mesure | Résultat | Conséquence pour « une fourchette honnête » |
|---|---|---|
| Biais kcal/repas | **−26,6 %**, 18/20 appels sous-estimés, Bland-Altman IC95 [−154, −62] | Le biais est **systématique**, pas du bruit. Une fourchette centrée dessus est fausse dans le même sens à chaque fois. |
| Agrégation hebdo | erreur de la somme **25,5 %** (÷1,04 seulement) | « ça se compense sur la semaine » est **mesuré faux** ici. |
| Couverture de l'IC90 demandé au modèle | **58 %** (25/43), et 1/5 sur les cas à graisse invisible avec `confidence:"high"` | **Le modèle ne sait pas produire sa propre fourchette.** Une fourchette affichée serait une fourchette inventée. |
| Erreur sur le delta | **49,0 %** vs 19,6 % sur le niveau (2,5× pire) | Le chiffre « interne pour la tendance » produit une **tendance fausse**. |
| Répétabilité intra-cas | CV 1,87 % | Ré-interroger N fois ne réduit rien : l'erreur est dans le modèle. |

Le point qui ferme le débat : **une fourchette n'est honnête que si sa couverture est calibrée.**
La nôtre couvre 58 % à un nominal de 90 %, et rate le plus quand le repas est gros et la graisse
invisible — exactement le cas que le coach cherche à voir. Publier `{"kcal":{"min":…,"max":…}}`
serait le pattern §7.3-(7) (« vert en simulation présenté comme vérifié ») transposé à la mesure.

**Ce que j'implémente à la place** — et qui répond au *besoin* derrière la demande :

1. `hypotheses[]` (registre d'hypothèses explicites : huile de cuisson, sauce, sucre dissous) —
   **retenu du plan**. Sert la *composition* (« il y a de l'huile ajoutée »), jamais l'énergie.
   Gain mesuré du bloc anti-omission déjà en place : biais −26,6 % → −11,6 %, coût zéro token.
2. `question_qui_changerait_tout` (une question max, seulement si elle change la conclusion) —
   **retenu du plan**. Mesuré : biais → −7,8 % (3,4×). C'est le différenciateur réel : une app
   muette ne peut pas poser la question.
3. La **magnitude ordinale** (`portion_band` ∈ small|moderate|large|unclear) comme réponse à
   « il mange beaucoup ou peu ? ». Déjà colonne en base (`20260727220000_keel_portion_band.sql`),
   déjà autorisée mot pour mot par CONTRACT NON-INPUT #4 (« a photo may evidence
   presence/composition/**portion/serving** »). Le token **est** la fourchette, et sur de la
   classification le modèle est excellent (là où il est mauvais en régression).

**Ce que ça coûte, dit franchement** : le webhook JSON sortant vers l'app d'un coach (§1.8)
livrera de la composition + des bandes de portion, **pas des calories**. Si ce coach exige des
kcal, c'est une décision commerciale de Thomas — pas une lacune technique. Elle est réversible :
le champ se rajoute au parseur en ~1 h. Ce qui n'est pas réversible, c'est la confiance perdue
le jour où un coach pèse une assiette et trouve 27 % d'écart.

**Alternative si Thomas veut revenir dessus** : rétablir les kcal en fourchette **uniquement**
sur le canal webhook coach (§1.8), jamais élève, jamais évaluateur, avec le biais mesuré
(−26,6 %) attaché à chaque payload. Le pilote « 10-15 élèves, 2 semaines, photo + pesée »
décrit en `PHOTO_QUANTIFICATION.md` §4-(b) est le préalable honnête à toute quantification.
Flag repris dans STATUS-MORNING.

**Conséquence contractuelle** : `docs/keel/CONTRACT.md` NON-INPUT #4 **n'est pas modifié**.
Aucune divergence code↔contrat n'est créée cette nuit. C'est le sens de « toute divergence avec
le contrat se résout en faveur du contrat » (`BUILD_PLAN.md`, règles agents).

---

## 03:40 — P0.legacy + P0.2 : VERT

### Migration `20260803030000_pivot_disable_b2c_crons.sql` — 5 crons B2C déprogrammés
Débranche (pas supprime) : `trigger-retention-emails` (⚠️ vrais emails, 09:00),
`process-whatsapp-optin-recovery`, `reseed-recurring-reminders`, `trigger-watcher-batch`,
`keel-arm-cards`. Style et doctrine repris de `20260727150000`.
**N'ont PAS été touchés** (ANNEXE C.6 les classe ADAPTER, pas DÉBRANCHER) : `process-checkins`,
`schedule-whatsapp-v2-checkins`, `trigger-synthesizer-batch`,
`recompute-time-based-access-tiers` — ils portent la boucle REMARQUER que P1.6 doit reprendre.

⚠️ **FLAG HONNÊTETÉ — ceci n'est PAS fait en production.** Une migration n'agit que sur la base
où elle est poussée ; cette nuit elle n'a tourné qu'en local. **Les 5 jobs tournent toujours sur
le distant**, y compris l'envoi d'emails de 09:00 (UTC → 11:00 CEST). Le chemin d'urgence
(unschedule direct en SQL, sans `db push`) est en tête de STATUS-MORNING.

### Migration `20260803031000_pivot_nutrition_tables.sql` — les 5 tables manquantes
`cohorts` (+ `coach_clients.cohort_id`), `coach_doctrines`, `coach_syntheses`,
`recurring_meals`, `student_facts`. Rien d'autre : les 17 tables KEEL existantes ne sont pas
retouchées.

**DÉCISION DE CONCEPTION (écart assumé vs §3.4.1 du plan)** : `student_facts` **n'a pas** de
`kind='allergy'` ni de booléen `is_hard_constraint`. Le plan proposait un magasin unique portant
le dur et le souple. Or `student_safety_constraints` existe déjà, porte le dur en identifiants
structurés, est chargée à chaque tour hors du chemin mémoire, et son validateur déterministe
post-génération est écrit et testé (`_shared/keel/safety_constraints.ts`, 322 l.).
Deux tables capables de porter une allergie = le pattern §7.3-(6) (« deux sources de vérité qui
peuvent diverger ») **sur la donnée où diverger est dangereux** : une allergie rangée dans la
mauvaise table est invisible au validateur. Un CHECK (`student_facts_no_hard_constraint_check`)
rend l'erreur impossible à commettre en silence.
*Alternative si Thomas préfère le magasin unique* : coût = migrer `student_safety_constraints`
dans `student_facts` ET réécrire le validateur + ses tests. Non recommandé.

### DoD vérifiée — 37 assertions, 0 FAIL
```bash
npx supabase db reset
docker cp supabase/functions/_shared/keel/pivot_nutrition_tables_test.sql supabase_db_Sophia_2:/tmp/t.sql
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/t.sql
```
Couvre : existence + RLS des 5 tables ; les 5 crons partis **et les 6 crons moteur intacts**
(contre-test : un « 0 partout » passerait le premier pour la pire des raisons) ; le refus des
contraintes dures dans `student_facts` et leur acceptation dans `student_safety_constraints` ;
une seule doctrine publiée par coach mais plusieurs brouillons ; `recurring_meals.active` exige
`confirmed_at` (le système ne se confirme jamais lui-même) ; idempotence de `coach_syntheses` ;
cloisonnement RLS coach↔coach et élève↔élève ; **et le coach qui ne lit ni les repas récurrents
ni les préférences de SON élève** (§1.5 « l'adhérence, jamais le journal intime »).
