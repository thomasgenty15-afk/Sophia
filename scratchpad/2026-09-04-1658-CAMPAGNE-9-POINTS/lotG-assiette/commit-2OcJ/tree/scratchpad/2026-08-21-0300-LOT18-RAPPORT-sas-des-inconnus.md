# LOT 18 — rapport : l'ingrédient inconnu ne condamne plus la journée

Prompt : `scratchpad/2026-08-21-0040-PROMPT-AUTOREMPLISSAGE-REFERENTIEL.md`
Mesuré et livré le 2026-08-21, sur la base locale vivante (923 refs, 2 601 alias,
180 plans).

---

## 0. ⛔ CE QUE LA MESURE DIT AVANT TOUT LE RESTE — la prémisse est fausse à 3 endroits

Le prompt part de trois chiffres. Les trois ont été remesurés **avec le vrai
résolveur** (`food_composition.ts`, jamais une copie) sur les 180 plans en base :

| | prompt | mesuré 2026-08-21 |
|---|---|---|
| taux de résolution **par ingrédient** | ~86 % | **96,0 %** (15 206 ingrédients) |
| journées calculables **solo** | 2,9 % | **13,2 %** (318 journées) |
| journées calculables **foyer** | 11,7 % | **27,9 %** (319 journées) |

Et surtout : **`0,86^25` n'est pas le mécanisme.** À 96 % par ingrédient, une
journée de 25 ingrédients devrait sortir à 36 % ; elle sort à 20,6 %. L'écart
n'est pas dans les inconnus, il est ailleurs — et le voici, plat par plat :

```
pourquoi un plat s'abstient (1 821 plats)
    missing_quantity      533     <- résolu, mais aucune quantité convertible
    unknown_ingredient    444     <- CE QUE CE LOT RÉPARE
    no_ingredients        144
```

> **Le plafond de ce lot est donc de +5,1 points de journées calculables
> (20,6 % → 25,7 %), et pas de 2,9 % → « beaucoup ».** Le reste — ~74 % du trou —
> est `missing_quantity`, un autre lot. Ses vingt premiers termes sont des
> aliments que le référentiel connaît parfaitement et que le modèle écrit sans
> quantité structurée : `olive oil` ×242, `garlic` ×167, `pepper` ×149,
> `lemon` ×138, `onion` ×105.

Le lot a quand même été construit **en entier, comme demandé** : c'est un gain
réel, il est le seul des deux qui ne demande pas de toucher au prompt de
composition, et l'instrumentation qu'il installe (les quatre compteurs) est ce
qui permettra de piloter le lot suivant. Mais la direction attendue devait être
nommée d'avance, et la voici : **+5 points, pas un ordre de grandeur.**

---

## 1. La mesure avant / après — direction nommée d'avance, puis calculée

**Direction attendue, écrite avant de lancer :** le remplissage ne peut que
FAIRE MONTER le nombre de plats complets, jamais le faire baisser (il n'ajoute
que des entrées d'index, il n'en retire aucune) ; et il ne peut agir que sur la
colonne `unknown_ingredient`, jamais sur `missing_quantity`.

```
plans 180 · groupes bornés 24/30
compteur ④ inconnus/plan : médiane 1 · moyenne 1,57 · max 12 · plans à 0 : 76/180

scénario                                              plats  journées   solo   foyer
AVANT (référentiel seul)                              38,4 %   20,6 %  13,2 %  27,9 %
PLANCHER — l'appel de secours échoue toujours         38,4 %   20,6 %  13,2 %  27,9 %
PLAFOND — le modèle répond sur tout                   43,1 %   25,7 %  15,7 %  35,7 %
```

* **plats** 38,4 % → 43,1 % · **journées** 20,6 % → 25,7 % · **foyer** 27,9 % → 35,7 %
* `unknown_ingredient` : **444 → 27** plats. Les 27 restants sont les
  **alternatives** (« butter or olive oil », « green or brown lentils ») que le
  résolveur refuse par construction — voir §5.
* Le chiffre de tête **ne dépend pas des valeurs** que le modèle rendrait :
  `dishEnergy` s'abstient sur un terme *non résolu* ou *non pesé*, jamais sur une
  valeur improbable. Les deux variantes de classe de rendement testées
  (`neutral` / dominante du groupe) rendent le même chiffre.

### ⛔ Le PLANCHER ne bouge pas de zéro, et c'est le défaut à connaître

Le repli par bornes demande un `food_group_ref` **déclaré sur la ligne
d'ingrédient**. Mesuré : **0 ligne sur 6 661** en porte un. La consigne qui le
demande (`FOOD_GROUP_DECLARATION_BLOCK`) ne voyage qu'avec la ligne de régime, et
`dietary_regime.ts` écrit noir sur blanc pourquoi (« un élève sans régime reçoit
un prompt byte-identique », tenu par un test).

⇒ **Aujourd'hui, si l'appel de secours tombe, le lot ne répare rien** — il
s'abstient exactement comme avant, et le compteur `refused.no_group` (281 sur les
plans en base) le dit. Je n'ai pas rendu la consigne inconditionnelle : ce serait
renverser une décision documentée et tenue par un test. Voir §7.

---

## 2. Ce qui a été livré

| # | livrable | fichier |
|---|---|---|
| 1 | migration (sas + compteurs + `revoke` + RGPD) | `supabase/migrations/20260821030000_le_sas_des_aliments_inconnus.sql` |
| 1b | l'écriture du sas (RPC atomique) | `…/20260821031000_le_sas_compte_ses_observations.sql` |
| 1c | le plan porte ses compteurs | `…/20260821032000_le_plan_porte_ses_compteurs.sql` |
| 2 | module de résolution **pur** | `supabase/functions/_shared/keel/composition_fill.ts` |
| 2b | l'appel et le sas (impur) | `…/composition_fill_io.ts` |
| 3 | câblage des **deux** lanes | `generate-meal-v1`, `generate-household-meal-v1` |
| 4 | les quatre compteurs, écrits ET lus | colonnes + vue `composition_fill_weekly` |
| 5 | tests Deno (28) + SQL (11) + parité TS↔SQL | `composition_fill_test.ts`, `composition_pending_test.sql`, `composition_band_parity_test.ts` |
| 6 | la mesure ci-dessus | `§1` |

Les trois migrations sont **appliquées** (`docker exec psql`) et **enregistrées**
dans `supabase_migrations.schema_migrations`. Aucun `db reset`, aucun `db push`.

---

## 3. Les quatre règles, tenues

**1. Un seul appel par plan.** `fillRequestsFor` dédoublonne, plafonne à 24
(médiane mesurée : 1, max : 12) et `askCompositionFill` envoie la liste d'un
coup. Ce que le plafond coupe est **compté** (`over_cap`), jamais tronqué en
silence.

**2. Il ne peut jamais faire tomber le plan.** Timeout 12 s + course de secours
à 15 s. `askCompositionFill`, `parseCompositionFillAnswers`,
`recordPendingSightings` et `repairPlanComposition` n'ont **aucun chemin qui
lève** : erreur du fournisseur, timeout, sortie illisible et sas en panne rendent
tous une valeur. Les lanes ajoutent un `try` en troisième ceinture. Testé :
`MEGA_TEST_STUB`, JSON vide, `items` non-tableau, ligne sans `kcal_100g`.

**3. ⛔ Un aliment NEUF, jamais un alias.** Tenu **structurellement**, à deux
niveaux :
* `withFilledRefs` ne fait qu'un `bySlug.set` — `byAlias` est le **même objet**
  en sortie qu'en entrée (assertion d'identité dans le test) ;
* la migration ne contient **aucun `insert`/`update` sur `food_composition_aliases`** —
  la promotion pose `slug = terme.replace(' ','_')`, que `resolveIngredient`
  retrouve par égalité de slug. Vérifié par `grep`, et par un cas SQL.
* deux ceintures en plus : un terme qui résout **déjà** est refusé
  (`already_resolved`, testé sur un `lemon` forgé à 9 999 kcal) ; une entrée que
  le résolveur ne **retrouverait pas** est retirée (`unreachable`).

**4. Sas, pas écriture vivante.** `food_composition_pending`. Promotion par
`promote_pending_food_compositions()`, **hors chemin chaud**, conditionnée à :
`fill_source = 'model'` **et** `sightings >= 3` **et** valeurs dans la bande
**p05/p95 mesurée** du groupe (calculée depuis `food_composition_refs`, jamais
écrite à la main, et **excluant les lignes déjà promues** pour que la bande ne
s'élargisse pas toute seule). Hors bande ⇒ `needs_review`, jamais promue.

---

## 4. Les quatre compteurs — où ils sont écrits, où ils sont lus

Écrits sur **chaque plan persisté** (`student_generated_meals`), quel que soit
l'`intent` — délibérément **pas** dans `generated_from`, qui ne sort que hors
`draft` alors que toute vérification réelle se fait en `draft` :

* `composition_energy_sources` = `{table, promoted, model, group_bounds, kcal}` ①②③
* `composition_unknowns` = ④, mesuré **sur l'index de base**, avant tout
  remplissage (le mesurer après rendrait 0 à chaque plan : un lot réussi par
  construction — un test le tient).

Lus par la vue **`composition_fill_weekly`** (semaine × lane) :

```sql
select * from composition_fill_weekly order by week desc;
```

`unknowns_median` est le seul chiffre qui dise si le lot réussit. **S'il ne
baisse pas, la table ne se remplit pas et on paie un appel de plus pour rien.**

`group_bounds` est un **cinquième seau compté à part** de `model`, exprès : il ne
monte que quand l'appel de secours ne répond plus. Fondu dans `model`, un point
de rupture ressemblerait à un fonctionnement.

---

## 5. Quelle lane a été câblée

**Les deux.** Le point de branchement est l'**INDEX** — le seul objet que les
deux lanes partagent — donc `repairPlanComposition` s'y pose et aucune des deux
chaînes de « cible ÷ livré » n'a eu à changer.

* **`generate-household-meal-v1` est celle que le lot vise**, et la mesure le dit :
  sa chaîne (`mouthDayEnergy` → `anchorFactorFor`) porte une garde **binaire**,
  `day_incomplete`, qui se referme dès qu'UN plat du jour n'a pas rendu son
  énergie. Posé **après** la relance d'ancre protéique (donc sur le plan qu'on
  écrit) et **avant** `householdAnchors`.
* **`generate-meal-v1`** est câblée aussi, posée **avant** `measure` — donc avant
  `verdictFor`, `assessCoverage` et la boucle de correction. Sa chaîne rend une
  DIRECTION, qui survit à une marge : le gain y est plus faible (13,2 → 15,7 %).
* **`portion_scaling.ts` n'a PAS été touché : il n'a aucun appelant vivant.**
  `scaleFactorFor` / `scaleFactorsFor` ne sont importés que par leur propre
  fichier de test. Le prompt le désignait comme point de branchement ; le brancher
  aurait été livrer une couche que rien n'appelle.

---

## 6. Ce qui a été vérifié, et comment

* **28 cas Deno** purs — `deno test composition_fill_test.ts` → 28/28.
  Couvrent les cinq demandés (tout résolu · un inconnu · l'appel échoue · valeur
  hors bande · promotion à la 3e) plus la règle 3, l'alternative, l'inconnu sans
  groupe, le plafond de worklist, et les quatre parts.
* **11 cas SQL** en base réelle, dans une transaction `rollback` —
  `composition_pending_test.sql` → 11/11. Prouvent la 3e occurrence, le refus
  hors bande, `group_bounds` jamais promue, le délogement d'une convention par
  une réponse, le refus d'un terme déjà aliasé, le compteur figé après promotion,
  et **zéro alias écrit**.
* **Parité TS ↔ SQL de la bande** (`composition_band_parity_test.ts`) : la
  formule p05/p95 est écrite deux fois (module PUR d'un côté, vue de l'autre) et
  la duplication est structurelle. Ce test compare les 24 groupes bornés et
  **échoue à la divergence**. Passé sur la pile locale ; sauté sans pile.
* **Non-régression** : `deno test supabase/functions/_shared/keel/` →
  **3 984 passés, 0 échec**.
* **`scripts/agent-gate.sh`** : JWT ok, forbidden-pattern ok, compte de tests ok,
  suite keel ok, typecheck front ok, `deno check` entrypoints ok.
  ⚠️ Il finit **rouge sur `eslint`**, sur quatre fichiers `frontend/src/keel/pages/`
  (`SetupPage.tsx`, `StudentWeekPlanPage.tsx`, deux tests) **modifiés par une
  autre session**. Ce lot ne touche **aucun fichier du front**.
* **Chemin d'écriture de bout en bout** vérifié par sonde SQL : RPC
  `write_student_meal_plan` → colonnes → vue `composition_fill_weekly`.
* **Privilèges** : `has_table_privilege` sur `anon` et `authenticated` =
  `f/f/f/f` (select, insert, truncate) sur `food_composition_pending`.

---

## 7. ⛔ CE QUE JE N'AI PAS FAIT, ET POURQUOI

1. **Aucun appel réel au modèle.** La clé `OPENAI_API_KEY` est présente dans le
   runtime, mais un run réel sur les 182 termes inconnus **dépense de l'argent**
   et je ne l'ai pas engagé sans demande. Les deux scénarios de §1 sont un
   PLAFOND et un PLANCHER nommés, pas une extrapolation cachée. Le run réel est
   à une commande : redémarrer `functions serve` (cache `_shared` périmé), puis
   générer un plan avec un terme inconnu.

2. **Ce n'est pas Haiku 4.5.** Ce dépôt n'a **aucun chemin Anthropic** :
   `_shared/gemini.ts` route sur `gpt-*` (API OpenAI) et `gemini-*`, zéro
   occurrence de `anthropic`/`claude`. Le défaut est `gpt-5.4-nano` — le petit
   modèle que la pile utilise déjà comme repli léger — surchargeable par
   `KEEL_COMPOSITION_FILL_MODEL` sans redéploiement. Brancher Haiku demande un
   troisième fournisseur, une clé et une facturation : un chantier, pas une ligne.

3. **Je n'ai pas rendu la déclaration de groupe inconditionnelle.** C'est ce qui
   armerait le PLANCHER (§1). `dietary_regime.ts` écrit explicitement pourquoi le
   bloc ne vit pas dans le prompt partagé, et **un test tient la promesse d'un
   prompt byte-identique** pour la population sans régime. Renverser ça est une
   décision produit, pas un effet de bord de ce lot. **C'est le geste n°1 pour
   armer le repli.**

4. **`missing_quantity` n'est pas traité.** C'est 533 plats sur 1 821 avant, 866
   après (les plats débloqués côté « inconnu » retombent dessus). C'est le lot
   suivant, et il est plus gros que celui-ci.

5. **Les alternatives restent non calculables** (« butter or olive oil » ×5,
   « green or brown lentils » ×8, « butter or oil » ×4 — 20 termes, 27 plats).
   `resolveIngredient` refuse l'ambiguïté **avant** de chercher : une entrée
   écrite pour ce terme serait morte, et une entrée morte ressemble à une
   couverture. Elles sont refusées (`unreachable`) et comptées.

6. **Aucun cron ne lance la promotion.** `promote_pending_food_compositions()`
   est écrite, testée et hors chemin chaud, mais rien ne l'appelle
   automatiquement. Poser un cron demande `supabase secrets`/`config push`, que
   je ne peux pas exécuter. **À lancer à la main** :
   ```sql
   select * from promote_pending_food_compositions(3, true);  -- dry run
   select * from promote_pending_food_compositions(3, false); -- pour de vrai
   ```

7. **RGPD : la table n'est ni exportée ni purgée, et c'est la réclamation.**
   `food_composition_pending` ne porte **aucune personne par construction** —
   aucune colonne `user_id`/`household_id`/plan, aucune FK vers `profiles`,
   `sightings` compte des plans sans savoir lesquels, et une contrainte
   (`..._carries_no_person_check`) refuse un UUID ou un `@` dans le terme et le
   libellé. Elle est dans la même catégorie que `food_composition_refs` : un
   RÉFÉRENTIEL. L'exporter rendrait à chaque élève le catalogue d'aliments du
   produit ; la purger le viderait pour tout le monde au premier départ.
   Les **deux colonnes** ajoutées à `student_generated_meals`, elles, sont de la
   donnée d'élève — et cette table est **déjà** exportée en entier par
   `account-export-v1` et purgée par la cascade de `profiles`.

8. **La classe de rendement d'une ligne remplie peut coûter une abstention**, et
   c'est assumé : un terme rempli en `meat_shrinks` et écrit sans `state` reste
   non pesé. Choisir `neutral` partout ferait peser 100 g de poulet cuit comme
   100 g de cru — 30 %, toujours dans le sens qui gonfle.

9. **Ce que le verdict voit change.** La porte des 80 % de FF-039 lit désormais
   des lignes remplies par un modèle. C'est l'objet du lot ; la contrepartie est
   que `composition_energy_sources` dit, plan par plan, quelle part du chiffre
   vient d'où. Dit ici plutôt que découvert.
