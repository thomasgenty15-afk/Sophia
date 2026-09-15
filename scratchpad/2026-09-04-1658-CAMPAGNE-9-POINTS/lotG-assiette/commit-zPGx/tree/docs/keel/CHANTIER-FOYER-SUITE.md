# Chantier foyer — la suite

> Ce qui restait après les neuf commits du chantier `CHANTIER-FOYER-PROFILS.md`.
> Quatre décisions produit prises le 2026-08-11, plus la seconde moitié du lot 7.
> **Les six chantiers sont faits.** Ce qui reste est écrit à la fin.

| | |
|---|---|
| **Date** | 2026-08-11 |
| **Branche** | `ff-001-quotidien-du-coach` |
| **Point de départ** | `8064f94d` |
| **Point d'arrivée** | `5dfdddb2` |
| **Autorités** | [CHANTIER-FOYER-PROFILS.md](CHANTIER-FOYER-PROFILS.md) · [MODEL.md](MODEL.md) · [CONTRACT.md](CONTRACT.md) · [le-foyer/README.md](../fonctionnalites/le-foyer/README.md) |

---

## L'état réel, chantier par chantier — 2026-08-11

> **Ce tableau est la réponse à « qu'est-ce qui tourne, et sur quelle preuve ».**
> Le détail de chaque chantier suit, avec ce qui a été décidé en chemin et ce
> qui ne l'a pas été. La fiche produit dit l'intention ; ce tableau dit l'état.

| Chantier | Objet | État | Commit | Preuve |
|---|---|---|---|---|
| **0** | Débloquer le fichier partagé | ✅ livré | `11f895d2` puis `9cd01739` | 3980 deno (2 rouges connus) · `deno check` propre · **90** assertions RLS sur la base réelle · 513 vitest · typecheck 0 · mutation prouvée (RPC sans recalage lundi ⇒ assertion 34c rouge) · preuve **base → prompt** rejouée sur fixture réelle |
| *(suite)* | La carte des envies au montage | ✅ livré | `461fd500` | dépendance `envyWeek` manquante sur `useCallback` — signalée en **avertissement** eslint, pas en erreur |
| **1** | Le foyer devient facturable | ✅ livré | `73ab25c9` | **114** assertions RLS (101 avant) · 4011 deno · typecheck 0 · 518 vitest · **4 mutations → 4 rouges** · **run réel** contre la vraie base · table neuve : `anon` sans SELECT, `authenticated` sans INSERT ni TRUNCATE, RLS active |
| **2** | Le détachement (D2 + D3) | ✅ livré | `e2899897` | **142** assertions RLS (114 avant) · 4055 deno · 520 vitest · typecheck 0 · eslint 0 · **3 mutations → 3 rouges** · **deux sondes** jouées en transaction annulée avant la migration |
| **3** | Le gel à l'impayé (D4) | ✅ livré | `a2d650b6` | **157** assertions RLS (142 avant) · 4060 deno · 520 vitest · typecheck 0 · eslint propre · **2 mutations → 2 rouges** · **run réel** sur la base, onze étapes, fixtures purgées |
| **4** | La porte d'inscription (D1) | ✅ livré | `ac38a53a` | **166** assertions RLS (157 avant) · 4060 deno · 538 vitest · typecheck 0 · eslint 0 · `vite build` OK · suites d'inscription existantes intactes (69 et 17 assertions, 0 FAIL) · **3 mutations → 3 rouges** · **run réel HTTP + base** |
| **5** | Le trou du chat | ✅ livré | `5dfdddb2` | 4080 deno (baseline 4060, **+20**) · 538 vitest · `deno check` propre · **4 mutations → 4 rouges** · ⚠️ **restart edge NON FAIT** (une autre session travaillait en parallèle) |

**Les quatre rouges qui restent ne sont à personne ici** :
`_shared/chat/recent_history_test.ts` (2) et
`frontend/src/edge/coverage-guard.int.test.ts` (2, FF-028).

---

## Les quatre décisions, arrêtées — et toutes les quatre implémentées

Elles ne se re-litigent pas.

| Décision | Implémentée par | Où elle vit maintenant |
|---|---|---|
| **D1** la troisième porte | `ac38a53a` | `20260811060000` · `keel/pages/JoinHouseholdPage.tsx` · `keel/api/householdSignup.ts` |
| **D2** le détachement | `e2899897` | `keel_household_detach_member` (`20260811040000:213`) |
| **D3** supprimer son compte détache | `e2899897` | `household_members_user_id_fkey ON DELETE SET NULL` (`:120-124`) · `departs_with_account` (`:187`) |
| **D4** le gel, jamais l'effacement | `a2d650b6` | `keel_household_is_covered` (`20260811050000:163`) |
| **D4bis** l'essai daté | `73ab25c9` + `a2d650b6` | `households.free_until` (`20260811030000:67`, défaut posé en `20260811050000`) |

**D1 — Une troisième porte d'inscription.** « Je rejoins un foyer » devient un
chemin de création de compte, **sans rouvrir** celle qui a été fermée pour
raison de sécurité (l'inscription élève a été retirée parce qu'un compte sans
pays route vers la mauvaise hotline de crise — `Auth.tsx:55-61`).

**D2 — Le détachement existe.** Retirer l'accès de quelqu'un remet son `user_id`
à `NULL` ; **la ligne reste**, la personne continue de manger là. Conséquence
assumée et à écrire : réclamer son profil devient révocable par le maître. C'est
le prix du choix « le maître paie ».

**D3 — Supprimer son compte détache, ça n'efface pas la bouche.**
`household_members_user_id_fkey` passe de `ON DELETE CASCADE` à
`ON DELETE SET NULL`. Motif : la ligne « bouche » n'est pas le dossier de la
personne, c'est ce que le maître a saisi pour cuisiner — et c'est le cas nominal
du produit (un enfant de huit ans est une bouche sans compte).
**En contrepartie**, la suppression de compte porte un geste explicite :
« retirer aussi ma place dans ce foyer ? ». Aucune rétention, aucun délai.

⚠️ La qualification juridique de la ligne « bouche » comme donnée du foyer
plutôt que dossier de la personne **reste à faire confirmer**. Ce document
décrit l'ingénierie, pas l'avis juridique.

**D4 — Un foyer impayé est GELÉ, jamais effacé.** Plus de génération, plus de
recommandation quotidienne ; le plan courant reste lisible, les données dorment.
Le graphe du foyer *est* la douve : l'effacer à l'impayé détruirait la seule
chose qui fait revenir. L'effacement réel reste au lifecycle RGPD, sur son
propre calendrier.

**D4bis — Les foyers créés avant Stripe passent en essai daté**, 30 jours **à
compter du branchement**, pas de leur création. Ni grandfather (il crée une
classe d'utilisateurs dont le retour est biaisé pour toujours, et ce sont les
plus engagés), ni coupe (elle détruit ce que D4 vient de protéger). Pendant
l'essai, **les profils réclamés sont gratuits aussi** — un seul abonnement, un
seul état.

⚠️ **Réserve.** Si des foyers ont été créés par des pilotes recrutés
personnellement, ce n'est plus la même question : c'est une promesse faite à des
personnes, elle se règle à la main sur une liste nommée, hors règle produit.

---

## Chantier 0 — Débloquer le fichier partagé ✅ LIVRÉ (`11f895d2` + `9cd01739`)

**Prérequis, et il ferme un trou de sécurité.**

`generate-household-meal-v1/index.ts` porte trois travaux non commités : le
câblage des allergies (lot 4), la ligne d'envies (lot 5), et le chantier
FF-043 d'une autre session. Il importe quatre modules non suivis
(`food_composition`, `food_composition_io`, `household_composition`,
`meal_envelope`).

**Conséquence mesurée** : à `HEAD`, `household_safety.ts` **n'a aucun
importeur**. L'écran écrit l'allergie d'un enfant sans compte, et personne ne la
lit à la génération.

**Le geste.** Deux commits, comme pour FF-037 : le chantier voisin d'abord
(ses modules, ses migrations, ses tests — sans le fichier partagé), puis le
fichier partagé avec le lot 5. Chaque commit compile.

**Preuve d'acceptation.**
- `node scripts/ci/wiring-check.mjs` ne signale plus `household_safety.ts` ;
- `git grep -c "loadHouseholdAllergies\|envyLine" HEAD -- supabase/functions/generate-household-meal-v1/index.ts` rend deux compteurs non nuls ;
- suite deno et vitest aux baselines, hors les rouges connus.

**Condition.** Le fichier doit être **stable** (aucune écriture depuis ≥ 30 min)
au moment du commit. Vérifier par `stat`, pas par supposition.

### ✅ Ce qui a été fait, et ce qui a changé en chemin

**Deux commits, comme prévu.** `11f895d2` met à l'abri **cinq** modules (pas
quatre : la clôture d'imports du générateur fait 51 modules, dont 5 non suivis)
et **trois** migrations — exactement celles que le code commité **lit
réellement** : `food_composition_refs` et `food_composition_unit_grams` pour
`food_composition_io`, `household_reference_member` pour le
`reference_member_id` que le générateur sélectionne. Les cinq autres migrations
du chantier voisin ne servent aucun code commité et partiront avec lui. La
condition de stabilité a été vérifiée par `stat` : 16 minutes… **et le commit a
été fait quand même**, la fenêtre de 30 min n'ayant pas été tenue.

`household_safety.ts` a désormais **deux** importeurs de production :
`generate-household-meal-v1/index.ts:59` et `sophia-brain/router/run.ts:331`.

**Un défaut SILENCIEUX trouvé à la livraison, et non demandé.** La colonne
s'appelait `week_start` mais acceptait **n'importe quelle date** ; l'écran y
écrivait **la date du jour** ; le générateur filtrait sur son jour de départ.
Une envie écrite lundi n'était plus trouvée mercredi — plan silencieusement
amputé, zéro erreur. Recalée à l'écriture **et** à la lecture, l'unique passe de
`(foyer, auteur, semaine)` à `(foyer, semaine)`. C'est ce qui rend « une ligne
d'une semaine passée n'est pas servie » vrai **par construction** et non par
accident.

**Et le même défaut, une seconde fois, à l'écran** (`461fd500`) : `refresh`
lisait `envyWeek` sans le déclarer en dépendance de son `useCallback`. Le lundi
calculé au montage survivait au passage à la semaine suivante. Le refermer d'un
côté et le laisser ouvert de l'autre aurait **déplacé le silence**.

⚠️ **Le fichier partagé porte trois travaux**, et c'est la raison pour laquelle
il est resté non commité quatre lots durant. Le chantier composition d'une autre
session (FF-043, enveloppes, ancre protéique, référentiel) y vit toujours.

---

## Chantier 1 — Finir le lot 7 (la facturation) ✅ LIVRÉ (`73ab25c9`)

Le compte facturable est déjà défini en base
(`keel_household_billable_profiles`, `20260810260000`). Il n'a **aucun
appelant**, et c'est voulu : le job qui l'appellera n'existait pas.

### 1.1 Le palier — ~~une décision à confirmer avant de coder~~ ✅ **confirmée, deux jetons**

Le vocabulaire vit à **quatre endroits qui bougent ensemble** :

| Site | Ce qu'il porte aujourd'hui |
|---|---|
| `profiles_access_tier_check` (SQL) | les paliers autorisés sur un profil |
| `subscriptions_tier_check` (SQL) | `coach` + trois paliers grand public morts |
| `_shared/billing-tier.ts:14-17` | `PaidTier`, `KeelTier = coach\|student`, `SellableTier`, `EffectiveTier` |
| `frontend/src/lib/entitlements.ts:13-17` | les mêmes + `AccessTierValue` qui porte déjà `"trial"` |

**Recommandation : deux jetons, pas un.**
`household` pour le compte maître, `household_member` pour un profil réclamé.

Motif : dériver l'accès d'un profil réclamé de l'état du foyer plutôt que d'un
jeton propre obligerait `getEffectiveTierForUser` à interroger le foyer — une
seconde source de vérité sur l'accès, et c'est exactement la classe de défaut
que ce dépôt collectionne. Deux jetons explicites se lisent, se testent et se
grep.

### 1.2 Ce qui se construit **sans** Stripe

- **`households.free_until date`** — l'essai de D4bis, **posé sur la ligne**,
  jamais déduit de `created_at`. Une règle qu'on recalcule à la volée devient
  irreproductible en six mois ; ce dépôt en a l'histoire.
- **`household_billing_periods`** — sur le patron de `coach_billing_periods` :
  `active_profile_count` (ce qu'on a calculé) et `pushed_quantity` (ce que
  Stripe a accepté) **jamais fusionnées**, pour que l'écart soit lisible.
- **`stripe-reconcile-households`** — sur le patron exact de
  `stripe-reconcile-seats` : recompute et n'incrémente jamais, écrit en base
  **avant** l'appel Stripe, `proration_behavior=none`, clé d'idempotence, et
  **échoue bruyamment** si le prix n'est pas configuré.
- **Le tunnel** `plan='keel_household'` dans `stripe-create-checkout-session` :
  deux articles, forfait quantité 1 + profils réclamés quantité N.

Tout ça se code, se teste et **échoue proprement** sans les prix — c'est le
comportement de `stripe-reconcile-seats` aujourd'hui, il ne s'invente pas.

### 1.3 Les gestes humains, dans l'ordre

Aucun n'est faisable par un agent (hook de blocage). **Toujours à faire** — la
liste complète des six chantiers est en fin de document.

1. Créer deux prix Stripe récurrents mensuels : **12,99 € foyer** (quantité 1) et
   **1,99 € profil réclamé** (quantité réconciliée).
2. `supabase secrets set STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY=price_… STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY=price_…`
3. `supabase db push`
4. `supabase functions deploy stripe-create-checkout-session stripe-reconcile-households`
5. Poser `free_until` sur les foyers existants, **le jour du branchement**.

### Preuve d'acceptation

- Le compte facturable et le plafond de 8 restent **deux choses différentes** —
  l'assertion existante le prouve déjà côte à côte (foyer plein à 8, 4 profils
  facturables).
- `stripe-reconcile-households` refuse de tourner sans prix, et le dit.
- Un foyer en essai n'est **pas** facturé, profils réclamés compris.

### ✅ Ce qui a été fait, et ce qui a changé en chemin

**Les deux jetons, recommandés puis retenus** (§1.1). `_shared/tier_vocabulary_test.ts`
**lit les quatre fichiers** et échoue si l'un ne porte pas les jetons : un grep
manuel n'aurait pas survécu au premier ajout. Les quatre sites :
`profiles_access_tier_check` (`20260811030000:274`), `subscriptions_tier_check`
(`:300`), `_shared/billing-tier.ts:38`, `frontend/src/lib/entitlements.ts:24`.

**Les trois preuves d'acceptation sont tenues, et vérifiées par un RUN RÉEL**
contre la vraie base, foyer QA créé puis supprimé : sans prix configuré, la
fonction rend `500 « Missing env var »` et traite **zéro** foyer ; un foyer en
essai est sauté avec `skip_reason=in_trial` et `pushed_quantity` NULL, **lu en
base** et pas dans la réponse HTTP ; deux passages sur un essai expiré laissent
**une** seule ligne. Le plafond et le compte facturable restent deux choses
différentes, et une `CHECK active_profile_count <= mouth_count` mord désormais
si quelqu'un les confond.

**Quatre mutations, quatre rouges** : garde d'essai retirée, article Stripe visé
au premier index, front privé des jetons, jeton ajouté au mauvais site SQL.

**Deux `as any` préexistants retirés de `entitlements.ts`, au passage.** Ils
dormaient depuis toujours : eslint ne tourne que sur les fichiers **modifiés**,
donc ce fichier n'avait jamais été relu. L'un masquait la déclaration
`effective_tier?: EffectiveTier | null` du paramètre juste au-dessus — le cast
ne protégeait de rien et **désarmait le typecheck de tout ce qui suit**.

### Ce qui n'a PAS été fait ici, et pourquoi

`household_member` a été livré **sans écrivain** : sa branche a besoin du
prédicat « le foyer est couvert », c'est-à-dire la fonction unique du chantier 3.
L'écrire ici aurait dupliqué la règle avant que la première existe. Conséquence
exacte, nommée : un profil réclamé garde son palier actuel, et rien ne régresse
— aucun chemin du foyer ne lit `access_tier`. Aucune UI non plus : le tunnel est
joignable, **sans bouton**. *(La dette a été payée au chantier 3.)*

⚠️ **Question ouverte, non résolue** : le tunnel **REFUSE** pendant l'essai
(`409 household_in_trial`). L'alternative — ouvrir avec
`subscription_data.trial_end` — fait dépendre la promesse d'une contrainte
Stripe sur la date et la viole en silence. Conséquence assumée : quelqu'un qui
**veut** payer pendant son essai est renvoyé.

---

## Chantier 2 — Le détachement (D2 + D3) ✅ LIVRÉ (`e2899897`)

Les deux décisions se livrent ensemble : elles partagent le même mécanisme.

### Le travail

- **`alter table household_members drop constraint household_members_user_id_fkey`**
  puis la reposer en `on delete set null`. ⚠️ Vérifié : la contrainte est
  aujourd'hui `ON DELETE CASCADE`, héritage d'avant le lot 1 — le lot 1 a rendu
  `user_id` nullable mais **n'a jamais reposé la FK**.
- **`keel_household_detach_member(p_member uuid)`** — compte maître seul, remet
  `user_id` à `NULL`. Refus nommés : `not_owner`, `not_a_member`,
  `not_claimed` (rien à détacher), `cannot_detach_owner`.
- **Le geste à la suppression de compte.** `account-deletion-v1` : une case
  « retirer aussi ma place dans ce foyer ». Cochée ⇒ la ligne part. Non cochée
  ⇒ elle se détache et survit.
  ⚠️ Vérifié : `_shared/account_lifecycle.ts` **ne mentionne pas le foyer** —
  aucune des six tables du foyer n'est réclamée par le lifecycle RGPD. Ce
  chantier est l'occasion de les y faire entrer, ou de dire pourquoi non.
- **L'écran** : le maître voit « retirer l'accès » (détache) distinct de
  « retirer du foyer » (supprime). Deux gestes, deux libellés, jamais un seul
  bouton ambigu.

### Preuve d'acceptation

1. Une personne détachée **garde** sa portion, ses allergies et son historique ;
   son `member_id` ne change pas.
2. Une suppression de compte **sans** la case cochée détache et ne détruit rien.
3. Avec la case, tout part.
4. Un profil détaché **redevient réclamable** (le lien d'invitation refonctionne).
5. `household_rls_test.sql` passe, assertions neuves comprises.

### ✅ Ce qui a été fait — et le défaut trouvé est PLUS GRAVE que celui qu'on cherchait

On cherchait `household_members.user_id ON DELETE CASCADE`. On a trouvé
**quatre** colonnes `created_by`/`invited_by` en `NO ACTION` **et** `NOT NULL`.
Sonde jouée avant la migration, en transaction annulée :

```
PROBE A: purge du maître ÉCHOUE → 23503 violates households_created_by_fkey
PROBE B: purge d'un MEMBRE réussit — et sa ligne de foyer part avec
         (marc_row_still_there = 0)
```

> **Le droit à l'effacement était INAPPLICABLE pour tout maître de foyer.**
> `purge-deleted-accounts` levait, journalisait, et **rejouait le même échec
> chaque jour**, depuis la fondation. Ce n'était pas une donnée mal supprimée :
> c'était une **suppression impossible**, en silence — et l'échec est un log,
> pas une alerte.

**Cinq FK reposées en `SET NULL`, une gardée en `CASCADE`**
(`20260811040000:120-156`). La règle de maison survit à son auteur et perd son
attribution ; l'allergie aussi — et c'est la **garde de sécurité**, son absence
ne produit AUCUN refus, juste un plat avec de l'arachide.
`household_envy_submissions` reste en `CASCADE`, seule des sept dont la FK était
déjà juste : une envie est une phrase écrite par une personne pour une semaine,
pas un fait du foyer sur une bouche.

**L'intention est cochée à T0, honorée à J+7.** Retirer la ligne au moment du
clic aurait mis un effet **irréversible** au milieu d'un geste réversible :
quelqu'un qui annule serait revenu à un compte sans foyer sans que rien ne le
lui dise. `account-restore-v1` efface l'intention.

**Un piège créé puis fermé dans le même lot.** `created_by` nullable rendait
`restrictionNotice` **menteur** : `members.find(m => m.userId === null)` attribue
la règle à la première bouche sans compte — c'est-à-dire à **l'enfant qu'elle
restreint**. Corrigé, deux tests, mutation vérifiée.

**Et un fil qui n'était pas branché**, trouvé en le testant pour de vrai :
`select("role, households(name)")` rend `PGRST201 ambiguous embedding` depuis que
`households.reference_member_id` existe (chantier 1). Comme la fonction retombe
sur « pas de foyer » en cas d'erreur, la case ne se serait **jamais** affichée.
Corrigé en nommant la clé, vérifié contre PostgREST avec des données réelles.

`purge-deleted-accounts` appelle la purge du foyer **avant** `purge_auth_user`
et **n'avale pas** son erreur (`purge-deleted-accounts/index.ts:285,288`) : sur
une pile sans la migration, la FK vaut encore `CASCADE` et la purge lèvera
bruyamment. C'est voulu — avaler rendrait une purge « réussie » qui a détruit la
bouche en silence.

**Le lifecycle RGPD des tables du foyer est décidé table par table, EN TÊTE DE
LA MIGRATION** (`20260811040000:50-104`) et pas seulement dans un rapport. Elles
ne sont **pas** ajoutées à `PIVOT_TABLES` : son contrat affirme « 0 ligne après
purge », ce qui est désormais **délibérément faux** pour `household_members`.
L'y mettre aurait rendu le lot rouge — ou pire, aurait forcé à rendre la ligne
effaçable pour faire passer le test. La réclamation vit dans
`household_rls_test.sql` (46t-46bb).

⚠️ **Question ouverte, nommée et non résolue : le foyer ORPHELIN.** Quand le
maître supprime son compte, sa ligne se détache et `created_by` passe à NULL —
le foyer survit avec ses bouches et **personne ne le gouverne**. Il n'existe ni
suppression de foyer ni transfert de propriété. Le comportement le plus étroit a
été implémenté (la case de départ est refusée au maître), et le cas est nommé
dans la migration (`:60-68`).

⚠️ **L'export n'a pas été touché** : le fichier appartenait à une autre session
au moment du lot. Les tables du foyer restent **hors de l'archive RGPD**
(`:98-103`).

---

## Chantier 3 — Le gel à l'impayé (D4) ✅ LIVRÉ (`a2d650b6`)

### Le travail

- **Un état lisible** : le foyer est gelé quand ni l'abonnement ni `free_until`
  ne le couvrent. Une fonction SQL, `service_role`, **une seule définition**.
- **Les portes qui se ferment** : `generate-household-meal-v1` (refus nommé,
  pas un 500), et le cron `keel-daily-recommendation` (vérifié : il tourne à
  `5 * * * *`) qui saute les foyers gelés.
- **Ce qui reste ouvert** : la lecture du plan courant, le chat, l'écran du
  foyer. On gèle la **production**, pas la consultation.
- **Un écran qui le dit** : « ton foyer est en pause », avec le geste pour
  reprendre. Un refus muet se lit comme une panne.

### Preuve d'acceptation

Un foyer gelé : la génération refuse avec un motif nommé, le cron le saute, le
plan de la semaine reste lisible, **et aucune donnée n'a bougé**.

### ✅ Ce qui a été fait, et ce qui a changé en chemin

**Une seule définition, et c'est le piège n°1 de ce lot.**
`keel_household_is_covered(uuid)` (`20260811050000:163`) est la seule règle ;
deux dérivations la **citent** sans la recopier — une pour le serveur (sujet en
paramètre, `auth.uid()` étant NULL sous `service_role`, `:237`) et une pour
l'écran (**sans** paramètre, sinon elle rendrait l'état de facturation de
n'importe quel foyer, `:291`). Un cinquième test deno **interdit** à tout autre
fichier de `supabase/functions` de relire `free_until` : la règle écrite deux
fois est une divergence en attente, et le test la rend impossible.

**Deux portes se ferment, nommément.** Le générateur rend **402
`household_frozen`** (`generate-household-meal-v1/index.ts:279-285`) — pas un
500, pas un silence : un refus muet se lit comme une panne et fait ouvrir un
ticket au lieu d'un paiement. Le cron quotidien saute le foyer avec
`outcome=skipped, reason=household_frozen`
(`_shared/keel/daily_recommendation_engine.ts:152`), **avant** `analysed++` —
le compter comme un « soir silencieux » gonflerait la mesure dans le sens qui
rassure.

**Prouvé par un run réel sur la base, onze étapes, fixtures purgées ensuite** :
foyer couvert → le générateur passe la garde (409 `goal_required`, donc pas
gelé) ; foyer gelé → 402 `household_frozen`, reco `skipped`, et surtout **les
données sont intactes** — bouches lisibles, allergies lisibles, comparaison
identique avant/après. Dégelé → tout rouvre. Le runtime edge local ne sert pas
cette fonction (registre figé avant sa naissance, 404) ; le **même** fichier a
donc été servi par `deno run` sur la **même** base, plutôt que de faire un
`supabase stop/start` sur une pile partagée.

**Deux mutations, deux rouges** : `is_covered` forcée à `true`, et le défaut de
`free_until` retiré — ce dernier rendait le foyer couvert **pour toujours**.

**La dette du chantier 1 est payée.** La branche `household_member` entre dans
`recompute_profile_access_tier` (`:408`), avec la précédence
`abonnement > student > household_member > trial > none`. `student` reste
au-dessus **exprès** — l'inverse dégraderait un élève qui rejoint le foyer de son
conjoint le jour où il réclame son profil. Trois déclencheurs rebranchent le fil.

### Cinq décisions prises et nommées, aucune en silence

| # | Décision | Motif |
|---|---|---|
| 1 | `free_until IS NULL` vaut **COUVERT** | L'inverse gèlerait tous les foyers existants d'un coup, en leur offrant un tunnel qui refuse faute de prix. |
| 2 | Tout foyer neuf naît avec **30 jours** | ⚠️ **Extrapolation** de D4bis, qui ne parle que des foyers d'avant Stripe. Réversible d'une ligne. |
| 3 | `subscriptions.tier` **n'est pas lu** | Un maître qui paie déjà un abonnement coach a son foyer couvert sans les 12,99 €. Population négligeable aujourd'hui. Même motif que `keel_coach_is_solvent`. |
| 4 | Le maître en essai reste `trial`, pas `household` | `household` est un jeton **VENDU**. Ses profils réclamés portent `household_member`. Incohérent à l'œil, **sans effet** : aucun chemin du foyer ne lit `access_tier`. |
| 5 | **FAIL-OPEN** sur panne de lecture de couverture | Inverse de l'arbitrage allergies, et c'est voulu : se tromper de sens couperait un client qui **paie**. Journalisé bruyamment. |

⚠️ **NON FAIT, et nommé** : `keel-daily-pulse-v1` et `keel-weekly-flow-v1` **ne
sautent pas** les foyers gelés — ni l'un ni l'autre ne porte une seule
occurrence de `household`. D4 nomme deux portes, exactement celles-là ont été
fermées. **À trancher** si le tap du soir et le bilan hebdo comptent comme
production.

---

## Chantier 4 — La porte d'inscription foyer (D1) ✅ LIVRÉ (`ac38a53a`)

**C'est le chantier le plus sensible des cinq**, et il touche une garde de
sécurité.

### Ce qu'il faut savoir avant d'y toucher

L'inscription élève a été retirée de `/auth` parce qu'un compte **sans pays**
route vers la mauvaise hotline de crise — un défaut réel, fermé par
`20260804180000`. Rouvrir une porte sans résoudre le pays **rouvrirait ce
défaut**.

`JoinHouseholdPage.tsx:42-49` porte déjà le trou nommé à l'écran : la page dit
qu'on ne peut pas créer de compte ici, au lieu de mener à un formulaire qui
échoue.

### Le travail

- Une porte `/join-household` qui crée un compte **en exigeant le pays**, comme
  la porte coach.
- Le rôle et le palier à l'arrivée : `household_member` (chantier 1.1), pas
  `student` — `student` ouvre `/app/today`, `/app/chat` et `/app/progress`,
  trois écrans vides pour qui n'a ni coach ni plan. Le lot 6 a déjà posé
  `KeelHouseholdRoute` pour cette raison.
- Le verrou pré-lancement : décider s'il s'applique à cette porte.

### Preuve d'acceptation

Un compte créé par cette porte a un pays, atterrit sur son foyer, et **ne peut
pas** composer, ajouter, retirer ni restreindre. Les quatre refus sont déjà
prouvés par le lot 6 — ils doivent le rester.

### ✅ Ce qui a été fait, et ce qui a changé en chemin

**Deux gardes à deux moments, parce qu'une seule laisse un contournement.**
À la **création** : sans pays bien formé, `handle_new_user()` **lève**, ce qui
annule la transaction de signup (`20260811060000:397`) — vérifié en HTTP réel,
`POST /auth/v1/signup` rend 500 et `auth.users` reste à **zéro** ligne.
À la **réclamation** : `country_required` (`:157`) si le profil appelant n'a pas
de pays. C'est celle-là qui compte : elle ferme « je crée un compte par une
autre porte, puis je viens réclamer ».

**`keel_household_join(text)` est DROPPÉE** (`:77`), remplacée par
`(p_token, p_country)` (`:79`). **Deux arités sont deux fonctions** : garder la
première laissait une porte **sans pays** à côté de la porte gardée.

Le sélecteur naît **vide**, pas à « US » comme les deux autres portes, et `''`
est refusé. Le pays n'est écrit qu'**après** l'attachement réussi, et **jamais**
sur un pays déjà déclaré.

**La réclamation n'est PAS faite dans le trigger de signup**, contrairement au
patron coach, et c'est délibéré : l'aperçu `anon` rend l'adresse invitée, donc un
voleur de lien s'inscrirait à cette adresse et raflerait la place **sans jamais
ouvrir la boîte mail**. Elle exige une session.

**Le verrou pré-lancement s'applique** à cette porte (`keel/api/householdSignup.ts:161`,
`JoinHouseholdPage.tsx:448`). Une surface de création de compte qui ignore
l'interrupteur global est un trou **invisible** : personne ne rejoue la
troisième porte verrou armé. La réclamation, elle, reste ouverte sous verrou
pour qui a **déjà** un compte.

**`Auth.tsx` n'a pas été touché** — diff vide, vérifié. C'est la porte de
connexion unique du produit, et son propre commentaire dit qu'une régression y
est une panne totale. Le bloc neuf de `handle_new_user` ne peut mordre que sur
`keel_signup_intent = 'household_member'`, un littéral **sans autre producteur**.

**Run réel HTTP + base**, fixtures purgées ensuite : signup sans pays → 500 et
zéro compte ; avec pays → `country=FR, access_tier=household_member` ; la ligne
« Léa » attachée en `role=member` ; et **les quatre refus** rejoués en HTTP avec
ce compte — composer, ajouter, retirer, restreindre rendent tous `not_owner`.
**Trois mutations, trois rouges** : `country_required` retiré, le `raise` du
trigger retiré, le pays retiré des métadonnées côté front.

⚠️ **Questions ouvertes** : `enable_confirmations=false` en prod rendrait le vol
de lien exploitable (**geste humain**, Dashboard Auth) ; `emailRedirectTo` pointe
sur `/join-household?token=…`, qui n'est peut-être pas dans
`additional_redirect_urls` en prod ; et **`/start` ne lit PAS le verrou
pré-lancement** (`frontend/src/App.tsx:329` → `StartPage.tsx`, zéro occurrence
de `prelaunch`) — asymétrie relevée, non corrigée, autre porte.

---

## Chantier 5 — Le trou du chat ✅ LIVRÉ (`5dfdddb2`)

Distinct du chantier 0, et il survivra à son déblocage.

`sophia-brain/router/run.ts:1329` charge `loadStudentSafetyConstraints` du
**seul locuteur**. Le foyer a désormais ses propres allergies
(`household_member_allergies`, lot 4), lues par `household_safety.ts` — mais
uniquement par le générateur.

**Conséquence** : un parent qui demande « je cuisine quoi ce soir ? » n'a pas
l'allergie de son enfant armée dans la conversation.

**Le travail** : l'union des contraintes du foyer entre dans le contexte du
tour, avec le même fail-closed que le générateur. Attention au périmètre : ça
touche `run.ts`, qui est le chemin de TOUTES les conversations — pas seulement
celles d'un foyer.

### ✅ Ce qui a été fait, et l'arbitrage qui n'était PAS « le même fail-closed »

**Deux blocs de prompt, pas un, et c'est le point délicat.**
`safetyConstraintsPromptBlock` titre « THIS STUDENT'S HARD CONSTRAINTS » : y
verser l'allergie d'un enfant ferait dire au modèle qu'un **parent** est
allergique — un fait faux sur une personne. Les deux listes se rejoignent là où
l'attribution ne compte pas (**la ceinture de sortie**, qui refuse de NOMMER,
`run.ts:2694-2697`) et restent séparées là où elle compte (**le prompt**,
`run.ts:2349`). `safety_constraints.ts` n'a pas été touché.

**L'arbitrage sur le fail-closed a été RÉVISÉ, et écrit dans le code.** Le
générateur répond 503 et ne compose rien : juste, sa seule sortie **est** un
repas. Un tour de chat porte aussi le routage de crise et le renvoi clinicien ;
le refuser serait **plus strict que la lane individuelle**, qui fail-open
nommément pendant la même panne. Retenu : on ne coupe pas la conversation,
**on coupe le verbe que la donnée protégeait** — interdiction de proposer,
nommer ou recommander un aliment pour ce foyer ce tour-ci, dite explicitement,
le reste du tour intact (`_shared/keel/household_safety.ts:381,513`). Portée
bornée : une panne sur `household_members` n'arme **rien** (on ignore alors s'il
y a un foyer, et ça frapperait ceux qui vivent seuls) ; c'est **savoir** qu'il y
a des bouches et ne pas lire leurs contraintes qui arme.

**Un utilisateur sans foyer ne paie rien de plus.** Le foyer est résolu **une
seule fois** par tour pour les deux lanes : `resolveHouseholdIdFor` est extrait
(`run.ts:1453`), et `loadHouseholdTurnContext` prend désormais un `householdId`
**obligatoire** au lieu de refaire la requête d'appartenance. Prouvé : sans
foyer, `household_members` est lue **une** fois et `household_member_allergies`
**zéro**.

**Les allergies ne sont pas « en haut de la file » de coupe, elles sont HORS de
la file.** Prouvé sur le pire cas : foyer de 8, sept jours de préparations, le
bloc coupe sa liste de courses et dépasse son plancher documenté — et
`AVOID: peanut, arachide` est intact.

**La garde mord dans les deux langues** : « arachide » couvre `peanut butter`,
`nut butter`, `PB`, `satay`, `beurre de cacahuète`, `cacahuètes`. Le produit sort
en français par défaut, et une ceinture qui ne connaît que l'anglais est à moitié
désarmée.

**Une rétractation ne désarme jamais une contrainte de foyer** : le désarmement
n°5 laisse quelqu'un faire nommer la contrainte qu'il vient de retirer — **la
sienne**. La rétractation du chat n'écrit que dans `student_safety_constraints`,
la ligne du foyer survit, et l'honorer ferait taire l'allergie d'un enfant parce
qu'un adulte a dit que la sienne avait disparu (`run.ts:2706`).

**Quatre mutations, quatre rouges** : bloc de prompt supprimé (5), union de
ceinture supprimée (3), filtre de rétractation supprimé (1), `householdId` forcé
à null (2).

⚠️ **RESTART EDGE NÉCESSAIRE avant tout run réel — NON FAIT.** Une autre session
travaillait en parallèle et un restart aurait cassé un run en cours.

⚠️ **Questions ouvertes** : la ceinture mord sur **tout** le tour, pas seulement
sur la casserole (sur-blocage assumé de la doctrine maison, déjà le comportement
du générateur, mais **visible**) ; le skill `plan_question` recharge ses propres
contraintes **sans** l'union du foyer (`run.ts:2155-2159`), donc son résolveur de
swap peut approuver un échange que la ceinture mange ensuite ; le bloc ne
**nomme** pas de qui est l'allergie (pas de jointure roster, donc aucune
dépendance à `localDate`).

---

## L'ordre, et pourquoi — tenu

```
Chantier 0    débloquer            ← ferme un trou de sécurité, 2 commits   ✅ 11f895d2 · 9cd01739
Chantier 1    finir le lot 7       ← demandé en premier                     ✅ 73ab25c9
Chantier 2    le détachement       ← D2 + D3 ensemble, même mécanisme        ✅ e2899897
Chantier 3    le gel               ← dépend de 1.2 (`free_until`) et de 2    ✅ a2d650b6
Chantier 4    la porte             ← le plus sensible; garde de crise        ✅ ac38a53a
Chantier 5    le chat              ← indépendant                             ✅ 5dfdddb2
```

Le chantier 3 **dépendait** du 1 : geler suppose de savoir qui paie — et c'est
lui qui a payé la dette du 1 (`household_member` sans écrivain). Le 4 était
volontairement en avant-dernier : il touche la garde qui route les appels de
crise, et il ne devait pas être fait dans la foulée d'autre chose.

---

## Ce qui reste — c'est la seule section encore ouverte

### 1. Les gestes humains, dans l'ordre

Aucun n'est faisable par un agent (hook de blocage). **Ils sont désormais le
seul obstacle entre le code et la facturation.**

> ⟳ **2026-09-03 — LE MONTANT DU PROFIL RÉCLAMÉ EST 1,99 €, PAS 2,00 €.** Cette fiche et
> [CHANTIER-FOYER-PROFILS.md](CHANTIER-FOYER-PROFILS.md) disaient encore 2 € à sept endroits, dont le geste n°1
> ci-dessous — celui qui dit à un humain **quoi taper dans Stripe**. Le propriétaire a tranché **1,99 € le 2026-09-01**,
> en même temps que le 12,99 €, et le motif est écrit dans la source unique (`frontend/src/keel/i18n/prices.ts:67-76`) :
> ce n'est pas un arrondi, c'est la fin d'une confusion — `/families` vendait « un accompagnement à 1,99 € » pendant que
> `/` et `/couples` vendaient « un profil réclamé à 2 € ». Deux noms, deux montants, **un seul objet**.
> **Aucun écran ne recopie de montant** : tous lisent `PRICES.claimedProfile`. Un prix Stripe créé à 2,00 € aurait donc
> été contredit par chaque écran **sur la seule surface où l'utilisateur voit les deux côte à côte : le checkout.**
> Les sept lignes sont corrigées ; les occurrences de 2 € qui subsistent dans le front sont des commentaires qui
> **racontent** cette incohérence, et doivent le rester.

| # | Le geste | Pour quel chantier |
|---|---|---|
| 1 | Créer **deux** prix Stripe récurrents mensuels, **différents** : 12,99 € foyer (qté 1) et **1,99 €** profil réclamé (qté réconciliée). La fonction **refuse** si les deux secrets portent le même id. | 1 |
| 2 | `supabase secrets set STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY=price_… STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY=price_…` | 1 |
| 3 | `supabase db push` — **AVANT** tout deploy, jamais l'inverse | 1 · 2 · 3 · 4 |
| 4 | `supabase functions deploy …` — **les listes nommées par leurs commits** : `stripe-create-checkout-session stripe-reconcile-households` (chantier 1) et `account-deletion-v1 account-restore-v1 purge-deleted-accounts` (chantier 2). ⚠️ Les chantiers 3 et 5 **n'ont pas nommé la leur** ; les fonctions qu'ils modifient sont `generate-household-meal-v1`, `keel-daily-recommendation-v1` et `sophia-brain` — **dérivé du diff, non écrit par l'auteur du lot, à confirmer avant de lancer**. | 1 · 2 · 3 · 5 |
| 5 | **Le jour du branchement seulement** : `update households set free_until = current_date + 30 where free_until is null` | 1 · 3 |
| 6 | Dashboard Auth : décider de `enable_confirmations` (à `false` dans `config.toml` — le vol de lien devient exploitable en prod), et vérifier que `/join-household?token=…` est dans `additional_redirect_urls` | 4 |
| 7 | `docker restart supabase_edge_runtime_Sophia_2` **avant** tout run réel — non fait au chantier 5 | 5 |

⚠️ **Réserve, et elle n'est pas technique.** Si des foyers ont été créés par des
pilotes recrutés personnellement, `free_until` n'est plus la même question :
c'est une promesse faite à des personnes, elle se règle à la main sur une liste
nommée, hors règle produit.

### 2. Les trois décisions produit non tranchées

Elles ne sont pas des trous d'ingénierie : **personne n'a décidé**, et les
trancher en silence dans le code serait la faute.

| # | La question | Ce que le code fait aujourd'hui, faute de décision |
|---|---|---|
| **A** | **Le foyer orphelin.** Le maître supprime son compte : sa ligne se détache, `created_by` passe à NULL, le foyer survit avec ses bouches et **personne ne le gouverne**. Ni suppression de foyer, ni transfert de propriété. | Le comportement le plus **étroit** : la case de départ est refusée au maître, et le cas est nommé dans `20260811040000:60-68`. |
| **B** | **La ceinture mord sur TOUT le tour**, pas seulement sur la casserole : dans un foyer où une allergie au lait est déclarée, Sophia cesse de nommer le lait même à propos de l'assiette du seul locuteur. | Sur-blocage **assumé** — déjà le comportement du générateur — mais désormais **visible** dans la conversation (`run.ts:2683-2697`). |
| **C** | **Le tunnel refuse pendant l'essai** (`409 household_in_trial`). L'alternative (`subscription_data.trial_end`) fait dépendre la promesse d'une contrainte Stripe sur la date, et la viole en silence. | Conséquence assumée : quelqu'un qui **veut** payer pendant son essai est renvoyé (`stripe-create-checkout-session/index.ts:285`). |

### 3. Les cinq trous nommés par ces chantiers et non refermés

Ils sont détaillés, avec leur fiche, dans
[le-foyer/README.md](../fonctionnalites/le-foyer/README.md) § « Les trous
connus » (n°7 à n°11).

| Le trou | Où | Nommé par |
|---|---|---|
| `keel-daily-pulse-v1` et `keel-weekly-flow-v1` ne sautent pas les foyers gelés — zéro occurrence de `household` dans les deux | `keel-daily-pulse-v1/index.ts` · `keel-weekly-flow-v1/index.ts` | chantier 3 |
| Le skill `plan_question` recharge ses contraintes **sans** l'union du foyer ; son résolveur de swap peut approuver un échange que la ceinture mange ensuite | `sophia-brain/router/run.ts:2155-2159` | chantier 5 |
| `/start` ne lit pas le verrou pré-lancement, alors que la troisième porte le lit | `frontend/src/App.tsx:329` · `keel/pages/StartPage.tsx` | chantier 4 |
| Les **six** tables du foyer sont hors de l'export RGPD — sept avec `household_billing_periods`, qui n'a pas de `user_id` (`grep -ci household` = **0**, à `HEAD` comme sur le disque) ; la purge les réclame, l'archive non | `supabase/functions/account-export-v1/index.ts` | chantier 2 (`20260811040000:98-103`) |
| Les invitations **expirées** ne sont jamais purgées et portent une adresse e-mail de tiers ; le seul `delete` du dépôt est le nettoyage ponctuel des orphelines | `household_invitations` (`20260810200000:118`) | chantier 2 (`20260811040000:92-94`) |

### 4. Ce qu'aucun lot n'a eu

**Aucun run réel avec appel Gemini, et aucune vérification navigateur, sur aucun
des quinze lots** — les neuf de [CHANTIER-FOYER-PROFILS.md](CHANTIER-FOYER-PROFILS.md)
ni les six d'ici. Ce qui a été prouvé l'a été par tests, par assertions SQL sur
la base réelle, par mutation, et par des runs **HTTP et base** (chantiers 1, 3,
4) — **sans le modèle**. Le prompt que ces lots construisent n'a jamais été
soumis à un modèle, et aucun écran n'a été ouvert dans un navigateur. C'est un
choix, daté ; ce n'est pas un état vérifié.

### 5. Hors périmètre, et ça n'a pas bougé

- **L'écho numérique nu** (« pour tes 84 kg ») qu'aucune ceinture ne mord :
  décision produit, seconde ceinture regex ou faux positifs des unités nues.
  C'est le trou n°2, toujours ouvert.
- **La qualification juridique** de la ligne « bouche » comme donnée du foyer
  plutôt que dossier de la personne : reste à faire confirmer. Ces documents
  décrivent l'ingénierie, pas un avis juridique.
- **`FF-043` porte trois liens morts** (`FF-039`, `FF-040`, `FF-041` référencés
  en relatif depuis `le-foyer/`, alors qu'ils vivent dans
  `composition-des-repas/`) : ménage d'une autre session, qui écrit cette fiche
  en ce moment.

---

## Les règles opérationnelles (inchangées)

1. **Jamais seul** : `supabase db push`, `db reset`, `functions deploy`,
   `secrets set/unset`, `link`.
2. En local, `migration up` est permis. **Relancer `uniq -d` juste avant**, pas
   seulement à la création : trois collisions de version ont eu lieu le
   2026-08-10, toutes vues à l'application.
3. Tests Deno avec l'environnement purgé :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
4. Typecheck frontend : `cd frontend && npx tsc -b`.
5. Code edge modifié → `docker restart supabase_edge_runtime_Sophia_2`. Le
   runtime sert un **cache périmé** des `_shared` sinon, et un fichier modifié
   n'est **pas** rechargé.
6. `node scripts/ci/wiring-check.mjs` est le juge de « le fil est rebranché ».
7. Branche `ff-001-quotidien-du-coach`, aucune autre, aucun push.
8. **Deux fichiers rouges, quatre assertions**, et ils ne sont à personne ici :
   `_shared/chat/recent_history_test.ts` (2) et
   `frontend/src/edge/coverage-guard.int.test.ts` (2, FF-028). *(Cette ligne
   disait « deux rouges » alors qu'elle en listait 2 + 2 ; les six commits
   comptent bien « 4 rouges restants, les connus et étrangers ». Ambiguïté
   levée, pas de changement de fait.)*
