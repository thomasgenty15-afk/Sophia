# DOSSIER DE RETRAIT — lane `generate-week-plan-v1`

**2026-08-19** · dossier de preuves et de conséquences · **aucun fichier n'a été modifié, aucune
migration écrite, aucun appelant touché.** Ce document existe pour qu'un humain décide.

---

## VERDICT EN TROIS LIGNES

1. **Oui, la lane est inatteignable** — et plus profondément que ne le disait le brief : non
   seulement `generateWeekPlan` n'a aucun appelant, mais **`adoptWeekPlan` non plus**, donc
   *rien dans l'application ne peut écrire un plan ni le faire passer en `'adopted'`*. Les trois
   épreuves (code / base / configuration) sont passées et concordent.
2. **Les 246 plans sont de la QA, à l'unité près** : 245 appartiennent à des comptes de test
   (`@test.dev` ×240, `a13.lifecycle+…@example.com` ×5), le 246ᵉ au compte de développement du
   propriétaire du dépôt. **218 n'ont jamais vu le modèle** (`generated_from = '{}'`, insérés en
   SQL) ; **20 seulement** portent `prompt_version = week_plan.en.v2_doctrine`. **Zéro utilisateur réel.**
3. **NE PAS RETIRER. Laisser en place, et traiter le trou comme un défaut ouvert.** La lane est le
   **seul** producteur, dans tout le produit, d'un objet que rien d'autre ne fabrique — des *lignes
   de conduite tracées à une conviction du coach*, garanties par un CHECK en base — et **une page
   de vente publique vend précisément cette garantie** (`ProPage.tsx:212`). Ce qui me ferait changer
   d'avis : si la revendication B27 est retirée de `ProPage`/`CoachesPage`/`GymsLandingPage` **et**
   que `coach_synthesis` cesse de rendre `weekPlan` au coach, alors le retrait devient propre.

**Le fait qui a décidé** : `frontend/src/keel/pages/ProPage.tsx:212` affiche au public une promesse
adossée au CHECK `student_week_plans_doctrine_traceable_check` — « la SEMAINE seulement, les plats
ne citent pas, **délibérément** ». Le CHECK vit sur la table qu'on envisage de supprimer, et la lane
morte est le seul écrivain capable de le satisfaire. Supprimer la table transforme une promesse
publique documentée en affirmation sans objet.

---

## 1. LA PREUVE D'ABSENCE, EN TROIS ÉPREUVES

### 1.1 Épreuve « code »

⚠️ **Méthode, et un incident à connaître.** J'ai d'abord passé les fichiers par un
dé-commentateur maison. **Il a silencieusement échoué sur le TSX** : il a raté l'import
multi-lignes de `TodayPage.tsx:61`, et m'a fait conclure un instant que le module entier était
orphelin. J'ai rattrapé par un `grep` brut de contrôle. *Toute conclusion ci-dessous est croisée
par deux méthodes.* C'est exactement la classe de faute que la cicatrice « un grep naïf compte des
commentaires comme des lecteurs » vise — sauf qu'ici l'outil de précaution était lui-même le piège.

**Appels à la fonction edge.** Une seule invocation dans tout le dépôt hors tests :

| Site | Statut |
|---|---|
| `frontend/src/keel/api/weekPlan.ts:142` `supabase.functions.invoke("generate-week-plan-v1")` | **dans `generateWeekPlan`, qui n'a aucun appelant** |
| 6 fichiers de test + `docs/nutrition-pivot/qa-web/*.ts` + `scratchpad/ff027_*.ts` | harnais |
| `scripts/export_llm_prompt_dump.mjs:48` | ligne d'aide |

**Aucun nom construit dynamiquement.** Vérifié : aucun `"generate-" + …`, aucune table de noms de
fonctions, aucun `invoke(variable)` visant cette lane.

**L'état réel du module front `api/weekPlan.ts` — le point que le brief sous-estimait :**

| Export | Appelants vivants |
|---|---|
| `loadWeekPlan` (`:83`) | **1** — `TodayPage.tsx:61` (import) → `:948` (appel) |
| `generateWeekPlan` (`:137`) | **0** |
| `adoptWeekPlan` (`:177`) | **0** |

`adoptWeekPlan` sans appelant est la conséquence lourde : **`status='adopted'` est inatteignable
depuis l'application.** Le dépôt le sait déjà et l'a écrit — `coach_synthesis.ts:236` : *« la semaine
de méthode a été remplacée par le constructeur de repas (commit 99697610), donc `weekPlan.adopted`
est faux pour tout le monde. »*

**Lecteurs vivants de `student_week_plans` — il y en a SIX, pas cinq.** Le brief en listait cinq ; le
sixième est une lecture en ligne qui ne passe pas par le module d'API :

| # | Lecteur | Nature |
|---|---|---|
| 1 | `supabase/functions/_shared/keel/coach_synthesis_io.ts:343` | synthèse hebdo du coach |
| 2 | `supabase/functions/_shared/keel/hunger_signal_io.ts:200` | `countSatietyAdaptations` (FF-028) |
| 3 | `supabase/functions/_shared/keel/following_io.ts:193` | `resolveStudentFollowing`, 3ᵉ branche |
| 4 | `supabase/functions/account-export-v1/index.ts:806` | export RGPD |
| 5 | `frontend/src/keel/api/weekPlan.ts:85` (`loadWeekPlan`) | via `TodayPage.tsx:948` |
| 6 | **`frontend/src/keel/pages/StudentWeekPlanPage.tsx:1335`** | **lecture vestigiale — voir §4.6** |

**Dix fichiers que le `grep` brut désigne et qui ne sont QUE des commentaires** (vérifiés ligne à
ligne) : `TodayPage.tsx:103,182,939` · `api/household.ts:320` · `ProPage.tsx:212` ·
`i18n/en.ts:587,604` · `keel-weekly-flow-v1:205` · `coach-protocol-v1:40` · `keel-daily-pulse-v1:197`
· `_shared/keel/doctrine.ts:123` · `_shared/keel/solo_access.ts:72` · `_shared/keel/coach_note.ts:23`.

### 1.2 Épreuve « base »

Interrogée sur la pile locale (`supabase_db_Sophia_2`).

| Objet | Résultat |
|---|---|
| `pg_proc.prosrc` ILIKE `%student_week_plans%` | **2** : `keel_free_signup_available`, `keel_attach_student_to_coach` — les deux ne citent la table **que dans des commentaires SQL** |
| `pg_proc.prosrc` ILIKE `%generate-week-plan%` | 0 |
| `pg_views` / `pg_matviews` | **0** vue, 0 vue matérialisée |
| Déclencheurs sur la table | **1** : `student_week_plans_set_updated_at` (générique `tg_set_updated_at`) |
| Politiques RLS | **1** : `student_week_plans_owner_all`, `for all`, `user_id = auth.uid()`. **Aucune policy coach** |
| `cron.job` (23 tâches actives) | **0** cite la fonction edge ou la table |

Aucune tâche planifiée ne déclenche cette lane. Les crons KEEL qui *dépendaient* d'elle
(`keel-daily-pulse`, `keel-weekly-flow`) ont été rebranchés sur `following_io.ts` — voir §3.

### 1.3 Épreuve « configuration et infrastructure »

| Surface | Résultat |
|---|---|
| `supabase/functions/generate-week-plan-v1/config.toml` | `verify_jwt = false` — **conforme à la maison** (19 fonctions sur 30 le portent, dont `generate-meal-v1` ; la fonction vérifie le JWT elle-même). Pas une anomalie |
| `supabase/config.toml` | **aucune mention** |
| `.claude/` | **aucune mention** |
| `.github/` workflows | **aucune mention** (aucun workflow ne nomme d'edge function) |
| `scripts/deploy-changed-functions.mjs`, `scripts/ci/deploy-manifest-check.mjs` | **aucune mention nominale** — la découverte est faite par balayage de répertoire |
| `frontend/src/edge/coverage-guard.int.test.ts:130` | **liste `"generate-week-plan-v1"`** |

⚠️ Sur `coverage-guard` : il est **déjà rouge** pour une raison étrangère (55 fonctions sur disque
contre 52 déclarées). Un retrait le ferait bouger — il faudrait retirer la ligne 130 — mais
**ce test n'est pas une preuve de vie** : il compte des répertoires, pas des appelants.

**Les trois épreuves concordent : la lane est inatteignable.**

---

## 2. D'OÙ VIENNENT LES 246 PLANS

**246 plans · 231 élèves · du 2026-08-04 au 2026-08-18.**

### 2.1 Par domaine de compte — la ligne décisive

| Domaine | Plans | Élèves | Ce que c'est |
|---|---:|---:|---|
| `@test.dev` | **240** | 225 | cohortes de fixtures QA (`qa-student-<epoch>@test.dev`, `l4m-zoe-…`) |
| `@example.com` | **5** | 5 | `a13.lifecycle+<hex>@example.com` — le test d'isolation RLS `a13_isolation_rls_test.sql` |
| `@gmail.com` | **1** | 1 | `thomasgenty15@gmail.com` — **le compte de développement du propriétaire du dépôt** |

**Comptes de test : 245 / 246. Comptes qui n'en sont pas : 1**, et c'est le compte du développeur,
sur un essai à la main du 2026-08-05. **Aucun utilisateur final n'a jamais eu de plan de semaine.**

Le drapeau `is_test_persona` dans les métadonnées d'auth ne vaut rien ici : il n'est posé que sur
**3** des 231 comptes. Le domaine est le discriminant fiable, pas le drapeau.

### 2.2 Par provenance — la question « ces lignes sont-elles seulement passées par le modèle ? »

| Provenance | Plans | Élèves |
|---|---:|---:|
| `generated_from = '{}'` — **insertion SQL directe, jamais passée par la fonction edge** | **218** | 218 |
| `generated_from ? 'prompt_version'` | 28 | 13 |

Des 28 :

- **20** portent `week_plan.en.v2_doctrine` — **la seule sortie authentique du modèle**, 19 sur des
  comptes `@test.dev`, 1 sur le compte du développeur ;
- **8** portent `prompt_version = 'ffx'` — écrites à la main par un harnais de scratchpad
  (`scratchpad/ffx_asks.ts:183,192`), pas par la fonction edge.

**213 des 246 sont des coquilles vides** : `status = 'adopted'` avec `jsonb_array_length(items) = 0`.
Une fixture qui pose l'état « cet élève suit quelque chose » sans jamais fabriquer de contenu.

### 2.3 Ce que ça règle

Le pic du 2026-08-04 — 186 plans, 186 élèves distincts, un par compte — est une cohorte de fixtures
posée en une passe. **Il n'existe pas d'usage à protéger.** Les 3 lignes du 2026-08-18 sont le test
d'isolation RLS qui a tourné pendant ce chantier, pas un signe de vie.

---

## 3. QUI REPREND LE RÔLE — L'HYPOTHÈSE EST À MOITIÉ VRAIE, ET SA CONCLUSION EST FAUSSE

**La fenêtre de sept jours est réelle.** `MAX_WINDOW_DAYS = 7`
(`frontend/src/keel/api/mealWindow.ts:47`, miroir serveur
`supabase/functions/_shared/keel/meal_plan_window.ts:52`), bornée en base par
`check (duration_days between 1 and 7)`
(`supabase/migrations/20260807090000_meal_plan_window.sql:148`). La lane du repas **couvre donc bien
le même empan calendaire** qu'une semaine.

**Mais ce n'est pas le même objet.** Le dépôt écrit lui-même la distinction, dans l'en-tête du
module du repas — `supabase/functions/_shared/keel/meal_generation.ts:5-16` :

> « Le plan de la semaine produit des LIGNES DE MÉTHODE (« construis ton déjeuner autour d'une ancre
> protéique »). Chacune DOIT nommer la conviction qu'elle applique… Ce fichier-ci produit des PLATS. »

Relevé sur une vraie sortie du modèle en base (plan `week_plan.en.v2_doctrine`) :

```
{ "kind": "nutrition",
  "label": "Lunch: make it a proper meal, with protein first and a vegetable alongside…",
  "rationale": "A solid lunch helps you stay steady through an office day…",
  "days": ["mon","tue","wed","thu","fri"],
  "source_belief_key": "three_real_meals",
  "source_belief_claim": "Three real meals anchor the day. We build the plate before we take anything off it." }
```

Ce n'est pas un plat. C'est **une règle de conduite, datée sur des jours, et attachée à la phrase
exacte du coach.**

| | lane SEMAINE → `student_week_plans` | lane REPAS → `student_generated_meals` |
|---|---|---|
| Objet produit | lignes de conduite (`kind: nutrition\|action`) | plats, préparations, sessions de cuisine, liste de courses |
| Traçabilité doctrine | **`source_belief_key` obligatoire, imposé par un CHECK en base** (`student_week_plans_doctrine_traceable_check`) | `honours_belief_keys` — annoté `meal_generation.ts:575` : *« Informatif… Jamais exigé, jamais vérifié par un CHECK »* |
| Contrainte en base | 4 CHECK dont la traçabilité et le jeu de `kind` fermé | **aucun CHECK de doctrine** |
| Adoption | `draft` → `adopted` → `archived` | pas d'état d'adoption |

**Ce qui serait perdu au retrait :** le seul mécanisme du produit où *la conviction d'un coach
devient une consigne nommée, vérifiable, et refusée par la base si elle ne cite pas sa source.* La
lane du repas peut citer une conviction ; elle n'y est jamais obligée et personne ne le vérifie.
`ProPage.tsx:212-214` le formule pour le public : « Portée : la SEMAINE seulement, les plats ne
citent pas, **délibérément** ».

**Ce qui a déjà été repris, en revanche, l'a été proprement.** Le commit `99697610` a rebranché la
chaîne d'aval sur la lane du repas, et les commentaires le disent en toutes lettres :

- `keel-daily-pulse-v1:197` — la garde « rien à suivre, rien à demander » lisait
  `student_week_plans` en `'adopted'` ; *« LES DEUX CONDITIONS ÉTAIENT DEVENUES IMPOSSIBLES — donc ce
  tap ne partait plus pour personne, en silence, sans une seule erreur »* ;
- `keel-weekly-flow-v1:205` — même garde, même réparation ;
- les deux passent désormais par `resolveStudentFollowing` (`following_io.ts`), qui interroge
  **`student_generated_meals` en premier** et ne descend sur `adopted_week_plan` qu'en 3ᵉ recours ;
- `coach_synthesis.ts:488` — `planned` compte `weekPlan?.adopted || composedMeals > 0`, avec le
  commentaire : *« une seule des deux surfaces est encore alimentée. Compter la seule qui reste
  vivante affichait 0 pour toute cohorte. »*

**Donc : la lane de semaine a été supplantée dans son rôle de *signal* (« cet élève suit quelque
chose »), et pas du tout dans son rôle de *producteur d'objet* (« la méthode du coach, écrite en
consignes traçables »).** Le second rôle n'a aucun repreneur.

---

## 4. LES CONSÉQUENCES D'UN RETRAIT, LECTEUR PAR LECTEUR

Hypothèse de travail : plus aucune ligne n'est jamais écrite dans `student_week_plans`.
*Rappel : c'est déjà la situation réelle depuis le commit 99697610.*

### 4.1 `coach_synthesis_io.ts:343` — la synthèse hebdo du coach ⚠️ *surface visible par le coach*

**Comportement observable : aucun changement.** Le champ `weekPlan` du rapport passe de `null` à
`null`. Le compteur `planned` de l'en-tête de cohorte est déjà alimenté par `composedMeals`
(`coach_synthesis.ts:488`), et le champ voisin `composedMeals` lit `student_generated_meals`.

**Le coach ne perdrait rien qu'il voie encore aujourd'hui** — parce qu'il l'a déjà perdu. La perte
a eu lieu au commit 99697610 ; le rebranchement l'a rendue indolore. C'est le lecteur qui inquiétait
le plus, et c'est celui qui est le mieux couvert.

⚠️ **Réserve** : le *type* `weekPlan` (`coach_synthesis.ts:230,317`) reste dans le contrat de
synthèse. Un retrait qui l'ôte touche une structure sérialisée que d'autres surfaces peuvent lire.

### 4.2 `hunger_signal_io.ts:200` — `countSatietyAdaptations` 🔴 **DÉFAUT LIVE, INDÉPENDANT DU RETRAIT**

**C'est le trou que ce dossier a mis au jour, et il ne dépend pas de la décision.**

`countSatietyAdaptations` compte les plans dont
`generated_from.satiety_priority = true`, **en ne lisant que `student_week_plans`**.
Or la lane du repas écrit **exactement la même clé** dans `student_generated_meals.generated_from` :
mesuré en base, **62 lignes sur 138 la portent.** Personne ne les lit.

Conséquence observable, mesurée dans le code :
`daily_recommendation.ts:754` — `if (input.satietyAdaptations < SATIETY_ADAPTATIONS_BEFORE_STRUCTURE)
return silent("nothing_significant")`, avec le seuil à **2** (`:76`).
`adaptations` valant toujours **0**, cette branche se prend **toujours**.

> **Un élève dont la faim est récurrente malgré deux compositions rassasiantes ne recevra jamais la
> proposition de changement de STRUCTURE prévue par FF-028 §10.** Le moteur se tait, en journalisant
> `nothing_significant`, c'est-à-dire le motif du cas nominal — donc sans rien qui ressemble à une
> panne.

Retirer la lane de semaine **ne casse pas ce lecteur : il est déjà mort.** Mais le retrait
*fossiliserait* le défaut, alors que la réparation est à portée — faire lire les deux tables, ou
déplacer le compte sur `student_generated_meals` qui porte déjà la donnée.

### 4.3 `following_io.ts:193` — `resolveStudentFollowing`

**Comportement observable : aucun changement.** La branche `adopted_week_plan` est la troisième,
derrière `student_generated_meals` (personnel) et le foyer. Elle ne peut déjà plus être atteinte
puisque `adoptWeekPlan` n'a pas d'appelant. Son retrait ferait disparaître une valeur du type
`FollowingSource` — changement de type, pas de comportement.

### 4.4 `account-export-v1:806` — export RGPD

**Comportement observable : une clé disparaît de l'archive.** Aujourd'hui l'export rend un tableau
vide pour tout utilisateur réel. Après retrait, la clé `student_week_plans` n'existe plus.

Pour les 231 comptes de test qui portent des lignes, l'export cesserait de les rendre. Sans
utilisateur réel concerné, **le risque RGPD est nul** — mais la cicatrice du dépôt
« le lifecycle RGPD ne réclame pas les tables neuves » impose de vérifier que le retrait passe aussi
par `SCOPE.studentWeekPlans` et par `keel_gdpr_lifecycle_test.ts`, sans quoi le test tombe.

### 4.5 `weekPlan.ts:85` → `TodayPage.tsx:948` — l'écran du jour de l'élève

`TodayPage` lit la semaine et les repas **en parallèle** (`:947-955`), puis :

```
const adopted = ownWeek && ownWeek.status === "adopted" ? ownWeek : null;
…
if (adopted || composed) { setState({ kind: "own_week", plan: adopted, meals: composed, … }); }
```

`adopted` étant **structurellement toujours `null`** (aucun écrivain de `'adopted'`), l'écran est
déjà porté par `composed` seul. `<OwnDay plan={state.plan} meals={state.meals} …/>` (`:1186`) reçoit
déjà `plan={null}`.

**Comportement observable : aucun changement pour l'élève.** Gain marginal : un aller-retour réseau
économisé à chaque ouverture de la page du jour.

### 4.6 `StudentWeekPlanPage.tsx:1335` — **le lecteur que le brief avait manqué**

`/app/plan` lit `student_week_plans` en ligne, hors du module d'API. Vérifié : les **seules** deux
occurrences de `planRes` dans le fichier sont sa déclaration (`:1333`) et
`if (planRes.error) throw new Error(planRes.error.message)` (`:1381`).

**`planRes.data` n'est jamais utilisé.** C'est une **lecture vestigiale** : elle coûte un
aller-retour, elle peut faire tomber la page entière si elle échoue — et rien n'en est rendu.

Ironie utile au dossier : la page s'appelle `StudentWeekPlanPage`, elle est routée sur `/app/plan`
(`App.tsx:195-199`), et **elle héberge `MealBuilder`** (`:12` import, `:2401` rendu). L'écran nommé
d'après la semaine est devenu l'écran du repas.

**Comportement observable au retrait : aucun**, et une fragilité en moins.

### 4.7 Synthèse

| Lecteur | Effet observable du retrait |
|---|---|
| synthèse coach | **aucun** — déjà rebranché sur `composedMeals` |
| `countSatietyAdaptations` | **aucun** — 🔴 déjà mort, et le défaut est réparable sans retrait |
| `resolveStudentFollowing` | **aucun** — 3ᵉ branche déjà inatteignable |
| export RGPD | une clé en moins ; 0 utilisateur réel concerné |
| `TodayPage` | **aucun** — un aller-retour économisé |
| `StudentWeekPlanPage` | **aucun** — lecture vestigiale supprimée |

**Aucun des six lecteurs ne produit de régression observable.** Ce n'est pas un argument pour le
retrait : c'est la mesure de l'ampleur du trou. Le produit tourne déjà *sans* cette lane.

---

## 5. LE CONFLIT AVEC LES DOCUMENTS D'AUTORITÉ

### 5.1 Mon avis mesuré : c'est le CODE qui a un trou, pas les documents

Les deux documents décrivent une intention **cohérente et vendue**. Le code, lui, a perdu deux
boutons en route. Trois faits l'établissent :

1. **La chaîne décrite est coupée en un seul point, et pas à sa racine.** `student_goals` est vivant,
   la doctrine est vivante, la fonction edge est complète, testée, déployable, et sa sortie satisfait
   un CHECK exigeant. Il manque **un appelant d'écran**, plus `adoptWeekPlan`.
2. **Le dépôt a corrigé cette lane après l'avoir laissée injoignable.** Le correctif « régime
   alimentaire absent du prompt de semaine » y a été livré pendant ce chantier ; l'en-tête de
   `weekPlan.ts:99-113` raconte l'incident précédent et la chaîne qu'il cassait. On ne répare pas
   deux fois de suite un chemin qu'on a décidé d'abandonner.
3. **La promesse est publiée.** Trois pages de vente publiques citent cette lane par
   `fichier:ligne` — `ProPage.tsx:188,212` · `CoachesPage.tsx:221` · `GymsLandingPage.tsx:188` —
   dont la revendication B27 sur la traçabilité, adossée à un CHECK de la table visée.

Un document d'autorité qu'on modifie pour qu'il colle à un code amputé n'enregistre pas une
décision : **il efface la trace du défaut.** C'est précisément le geste contre lequel ce dépôt
s'est déjà doté d'une cicatrice.

### 5.2 Les formulations exactes, si le retrait était décidé malgré tout

**`CLAUDE.md:8`** — actuel :

> `(`student_goals` → `generate-week-plan-v1` → `student_week_plans`). Il n'existe **aucun canal`

Proposé :

> ```
> (`student_goals` → `generate-meal-v1` → `student_generated_meals`). Il n'existe **aucun canal
> 1:1** coach → élève.
>
> > ⚠️ La chaîne de la SEMAINE (`generate-week-plan-v1` → `student_week_plans`) a été retirée le
> > 2026-08-XX. Elle produisait des **lignes de conduite tracées à une conviction**, un objet que la
> > lane du repas ne fabrique pas : les plats peuvent citer une conviction, ils n'y sont jamais
> > obligés et aucun CHECK ne le vérifie. **La traçabilité par ligne n'existe plus dans le produit.**
> > Les pages de vente qui l'annonçaient (`ProPage.tsx:212`, `CoachesPage.tsx:221`,
> > `GymsLandingPage.tsx:188`) ont été corrigées dans le même lot.
> ```

**`docs/keel/MODEL.md:39`** — actuel :

> `doctrine du coach** à cette vie-là pour composer sa semaine : `generate-week-plan-v1` →`

Proposé :

> ```
> doctrine du coach** à cette vie-là pour composer ses repas : `generate-meal-v1` →
> `student_generated_meals`, sur une fenêtre de 1 à 7 jours (`MAX_WINDOW_DAYS`).
>
> **Ce que le retrait de la lane de semaine a coûté, écrit ici pour que personne ne le redécouvre :**
> le produit n'a plus d'objet où une consigne nomme la conviction qu'elle applique et où la base
> refuse la ligne qui ne la nomme pas. `student_generated_meals.generated_from.belief_keys` porte la
> provenance du PLAN entier, jamais celle d'une ligne.
> ```

⚠️ **Un retrait qui ne toucherait que ces deux lignes serait incomplet.** Trois pages de vente
publiques portent la revendication et devraient être corrigées **dans le même lot**, sans quoi le
produit annoncerait une garantie que la base ne peut plus rendre.

---

## 6. SI LE RETRAIT ÉTAIT DÉCIDÉ — LA LISTE ORDONNÉE

**Je ne le recommande pas** (§ verdict). Cette liste existe pour chiffrer le geste, et **aucun de
ces pas n'a été exécuté.**

**Préalables — avant toute ligne de code**

1. Décision humaine écrite : « la traçabilité par ligne quitte le produit ». Sans elle, le reste est
   une amputation non consentie.
2. Corriger les **trois pages de vente publiques** — `ProPage.tsx:188,212` ·
   `CoachesPage.tsx:221` · `GymsLandingPage.tsx:188`. **En premier** : une promesse publiée sans
   objet est le seul dommage irréversible de la liste.
3. Réparer d'abord `countSatietyAdaptations` (§4.2) — il doit lire `student_generated_meals`. **Ce
   pas est bon à prendre même si le retrait est refusé.**

**Code — dans cet ordre**

4. `frontend/src/keel/pages/TodayPage.tsx` — retirer l'import (`:61`), l'appel (`:948`), la variable
   `adopted` et le prop `plan` de `<OwnDay>` (`:1186`) ; adapter `OwnDay`.
5. `frontend/src/keel/pages/StudentWeekPlanPage.tsx` — retirer la lecture vestigiale (`:1333`,
   `:1381`). Envisager de renommer la page, qui n'héberge plus que `MealBuilder`.
6. `frontend/src/keel/api/weekPlan.ts` — **supprimer le fichier**, sauf `currentMonday` et
   `weekPlanDaySplit` si `TodayPage` les garde ; les déplacer plutôt que les tuer.
7. `supabase/functions/_shared/keel/following_io.ts:193` — retirer la 3ᵉ branche et la valeur
   `adopted_week_plan` du type `FollowingSource`.
8. `supabase/functions/_shared/keel/hunger_signal_io.ts:195-217` — retirer ou rebrancher (cf. pas 3).
9. `supabase/functions/_shared/keel/coach_synthesis_io.ts:343-358` et
   `coach_synthesis.ts:230,317,390,488` — retirer `weekPlan` du contrat de synthèse.
10. `supabase/functions/account-export-v1/index.ts:806` + `SCOPE.studentWeekPlans`.
11. **Supprimer** `supabase/functions/generate-week-plan-v1/` et
    `supabase/functions/_shared/keel/week_plan_generation.ts`.
    ⚠️ `docs/keel/RETRAIT-POINT-DU-DIMANCHE.md:294` prévient : `WEEKLY_AXIS_LABELS_EN` et le type
    `WeeklyAxis` sont importés par `week_plan_generation.ts:65`. **Les déplacer, pas les tuer.**

**Base**

12. Migration : `drop table public.student_week_plans` — emporte 4 CHECK, 1 déclencheur, 1 policy,
    2 index. **Vérifier d'abord `uniq -d` sur les versions de migration** (cicatrice « versions en
    double »), et comparer disque et registre (« migration hors ordre = sautée en silence »).
13. Nettoyer les commentaires SQL de `keel_free_signup_available` et `keel_attach_student_to_coach`
    qui citent la table.

**Tests — chacun tombe au rouge sans ce pas**

14. `frontend/src/edge/coverage-guard.int.test.ts:130` — retirer l'entrée.
15. `_shared/keel/` : `meal_plan_integrity_test.ts:728` · `solo_access_test.ts:196,226,243,256` ·
    `household_freeze_test.ts:367,419` · `household_voices_test.ts:804` ·
    `retained_items_wiring_test.ts:437` · `household_doctrine_test.ts:429` ·
    `dietary_regime_solo_lane_test.ts:292` · `draft_note_classify_wiring_test.ts:655` ·
    `following_io_test.ts` · `student_week_plan_test.sql` · `a13_isolation_rls_test.sql`.
16. `supabase/functions/keel_gdpr_lifecycle_test.ts` ·
    `sophia-brain/test_harness/keel_properties/no_calorie_to_student_property_test.ts:653`.
17. `scripts/export_llm_prompt_dump.mjs:48` — ligne d'aide.

**Documents**

18. `CLAUDE.md:8` et `docs/keel/MODEL.md:39` — formulations en §5.2.
19. `docs/fonctionnalites/README.md:85`.

⚠️ **Cicatrice à respecter** : « des références legacy doivent survivre — les retirer EST le bug ».
Les mentions dans les **rapports de QA datés**, les **journaux de chantier** et les
**migrations déjà appliquées** sont des archives. **Ne pas y toucher.**

---

## ANNEXE — comment les chiffres ont été obtenus (2026-08-19)

Pile locale, lectures seules, aucune écriture.

```sql
-- §2.1
select split_part(u.email,'@',2) as domain, count(*), count(distinct p.user_id)
from public.student_week_plans p join auth.users u on u.id=p.user_id group by 1 order by 2 desc;

-- §2.2
select case when generated_from='{}'::jsonb then 'EMPTY (seeded)'
            when generated_from ? 'prompt_version' then 'has prompt_version' end,
       count(*), count(distinct user_id)
from public.student_week_plans group by 1;

-- §4.2 — la clé que personne ne lit
select count(*) filter (where generated_from ? 'satiety_priority'), count(*)
from public.student_generated_meals;   -- => 62 / 138
```

Épreuve « base » : `pg_proc.prosrc`, `pg_views`, `pg_matviews`, `pg_trigger`, `pg_policy`,
`cron.job` (23 tâches). Épreuve « code » : `grep` brut **et** passe dé-commentée, croisés — voir
l'avertissement méthodologique en §1.1.
