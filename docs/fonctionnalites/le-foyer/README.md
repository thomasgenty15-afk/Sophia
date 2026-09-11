# le-foyer

Plusieurs personnes, **une** cuisson. Appartenance, identité d'une bouche,
invitation, allergies et règles domestiques, portions qui bifurquent, prix.

`household*.ts` · `generate-household-meal-v1` · `HouseholdPage` ·
`JoinHouseholdPage` · autorités : [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md)
(⚠️ ses §7, §7.5, §8.1–§8.3 et son modèle d'invitation sont **périmés**) ·
[CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) (l'état réel,
lot par lot)

---

## La direction — arrêtée le 2026-08-10

> ### Une personne gouverne le menu. Une bouche n'a pas besoin d'un compte.
>
> Les deux moitiés se tiennent. Sans la première, le produit devient un arbitre
> public entre un parent et son enfant. Sans la seconde, il ne peut pas
> composer pour un enfant de huit ans — c'est-à-dire pour le cas nominal.

C'est la règle mère de ce domaine. Tout ce dossier en découle, et chaque fiche y
renvoie.

### Ce que le foyer est, et ce qu'il n'est pas

Le foyer **n'est pas un espace partagé**. C'est **une personne qui cuisine pour
plusieurs**, et un produit qui sait enfin qui sont ces plusieurs. La personne
qui tient la maison compose, achète, cuisine ; les autres sont des **bouches** —
elles ont un prénom, un âge, un objectif, des allergies et une part, et rien de
tout ça n'exige qu'elles ouvrent un compte.

Réclamer son profil (FF-048) n'est donc **pas** une entrée dans le produit :
c'est l'attachement d'un compte à une ligne qui existe déjà. Ça donne la lecture
du plan, son propre objectif, et une part qui tient compte de son corps. Ça ne
donne **jamais** le droit de composer, d'ajouter, de retirer ou de restreindre.

**Ce que ça coûte de se tromper.** Un produit qui exige un compte par bouche
demande à un parent d'inscrire ses enfants avant de pouvoir dîner : il ne
franchit jamais la première semaine. Un produit qui donne à chaque bouche le
droit de peser sur le menu met Sophia en arbitre d'un conflit familial — et le
premier arbitrage rendu contre un parent est le dernier repas composé.

### Le circuit d'ensemble

```
   LE COMPTE MAÎTRE                                  UNE BOUCHE
   (une seule personne)                              (compte optionnel)
          │                                                 │
          │ décrit son foyer  (FF-045)                      │
          ├────────────────────────────────────────────────►│
          │  prénom · date de naissance · objectif           member_id
          │  allergies (FF-046) · règles de maison           = son identité,
          │                                                  de bout en bout
          │ écrit l'envie de la semaine  (FF-050)           │
          │                                                 │
          │ invite, si elle veut donner un accès  (FF-048)  │
          ├────────────────────────────────────────────────►│
          │                                    user_id posé sur LA MÊME ligne
          │                                                 │
          ▼                                                 ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  generate-household-meal-v1 — UNE cuisson                     │
  │                                                               │
  │  ENTRÉE           allergies du foyer (union, fail-CLOSED)     │
  │                   règles de maison (verrou qui tait le motif) │
  │                   objectif + état d'âge par bouche  (FF-044)  │
  │                   corps, pour les bouches AVEC compte (FF-047)│
  │                                                               │
  │  SORTIE           un plat pour tout le monde                  │
  │                 + une consigne de SERVICE par personne,       │
  │                   passée par `sanitizePortionNote`            │
  └───────────────────────────┬──────────────────────────────────┘
                              ▼
                   lue À TABLE, à voix haute
```

**Le point qui gouverne le dessin** : *l'entrée gagne des faits, la sortie n'en
gagne aucun.* Tout ce qu'on ajoute au générateur augmente ce qu'il sait ; rien
n'augmente ce qu'il a le droit de dire.

### Les crans d'intake — la frontière est le CORPS, pas le compte

| Cran | Contenu | Compte requis |
|---|---|---|
| **0 — la bouche** | prénom, date de naissance, allergie | **non** |
| **1 — la direction** | un jeton d'objectif parmi **trois** (`fat_loss`, `maintenance`, `muscle_gain` — repli du 2026-08-18) ; **un seul, `maintenance`, pour un mineur** (2026-08-22), que l'écran libelle « Manger normalement » (2026-09-03) | **non** |
| **2 — le corps qui DIMENSIONNE** | taille, poids, sexe | **non** (depuis le 2026-08-12) |
| **3 — le corps qui se DIT** | taille, sexe, date exacte, **série de poids** | **oui** |

> ### ⚠️ Le cran 2 a été ouvert le 2026-08-12, et le cran 3 est ce qui reste derrière le compte.
>
> Décision de l'utilisateur, en connaissance de cause : *« il faut la taille le
> poids et l'âge et le gender **obligatoirement** (même quand ils ont pas de
> compte secondaire !) »*. Elle renverse la ligne qui suit, et
> [FF-047](FF-047-le-corps-dans-la-part-du-foyer.md) §3.

Le compte gardait le cran 2 pour une raison **technique**, pas commerciale :
`restriction_guard` — le plancher TCA — a besoin d'une **série** de poids pour
décider si l'on peut parler du corps de quelqu'un
(`_shared/keel/restriction_runtime.ts`, appelé par
`_shared/keel/household_bodies.ts:111`). Une bouche sans compte n'a pas de
série. Un corps sans série est une donnée qu'on **ne sait pas protéger** — et le
produit ne collecte pas ce qu'il ne sait pas protéger.

**Ce qui a rendu l'ouverture tenable**, et c'est structurel et non déclaratif :
le corps d'une fiche **n'achète qu'une maintenance**. Les deux fonctions qui le
consomment — `maintenanceEnvelopeFromBody`, `childEnvelopeFromBody` —
**n'acceptent aucun paramètre d'objectif**, donc aucune restriction ne peut être
exécutée par ce chemin. Il n'y a rien à protéger d'une bande qui ne retire rien.
Le cran **3**, lui, reste derrière le compte : c'est le seul qui fait **parler**
d'un corps (`householdBodyFacts`), et lui seul a besoin du plancher.

**Ce qui a été mesuré avant d'écrire la migration, et qui a changé le dessin :**
`authenticated` a `SELECT` sur `household_members`, et sa policy
(`household_members_member_read`) est **household-wide** — sondé, un non-maître
lit les trois autres lignes de son foyer. Une colonne `weight_kg` posée là aurait
été lisible par tout co-membre ayant un compte. Le corps vit donc dans une table
à part, **sans aucun grant à `authenticated`**.

### Les règles transverses

| # | Règle | Pourquoi |
|---|---|---|
| **F1** | **Une seule personne gouverne le menu** | c'est ce qui évite l'arbitrage entre un parent et son enfant. Aucun canal 1:1, aucune négociation, aucun vote |
| **F2** | **Une bouche n'a pas besoin d'un compte** | l'enfant de huit ans est le cas nominal. Une garde qui exige `user_id` est une garde qui exclut exactement les gens du produit |
| **F3** | `member_id` **est la clé**, `user_id` une propriété | une bouche = UNE ligne, de sa création à sa réclamation. Ses portions, ses contraintes et son historique lui restent attachés |
| **F4** | **Aucun repli d'une clé sur l'autre** | un lecteur qui accepte les deux fait du repli le chemin nominal le jour où l'un des deux cesse d'émettre la bonne. Ce dépôt l'a déjà payé |
| **F5** | **Le prénom vient de la ligne, pour tout le monde** | `household_turn_context.ts` filtre en silence toute portion au prénom vide : un prénom absent **fait disparaître la part**, sans erreur. Une source unique supprime la branche qui produit ce vide |
| **F6** | **L'âge a trois états** — mineur, majeur, **inconnu** — et `unknown` n'applique aucune direction | `coalesce(…, false)` rendait « majeur » pour une date absente. Ce n'était pas une indécision, c'était une décision fausse et muette (`keel_household_member_age`, migration `20260810120000:216`) |
| **F7** | **L'entrée gagne des faits, la sortie n'en gagne aucun** | les consignes de service sont lues **à voix haute, à table**. Ce qui entre dans le prompt sert à dimensionner ; rien ne sert à justifier |
| **F8** | **Une consigne de service est une instruction, jamais un diagnostic** | « une part plus généreuse de légumes » est une instruction ; « pour tes 84 kg » est un verdict sur un corps, prononcé devant la famille. `FORBIDDEN_PORTION_TERMS` (`household_portions.ts:278`) est la ceinture déterministe, **bilingue** |
| **F9** | **Une règle de maison n'est jamais un conseil de santé** | `household_restriction_lock.ts` **efface le pourquoi** du plat, exprès : Sophia ne porte pas une décision parentale comme une recommandation nutritionnelle. Corollaire dur : une **allergie** ne passe jamais par ce chemin — elle a sa propre table et sa propre ceinture (FF-046) |
| **F10** | **Toute garde est testée dans les deux langues** | le produit sort en français par défaut (`profiles.locale`), et une ceinture qui ne connaît que `weight` laisse passer `poids`. Cicatrice `guard-tested-in-one-language-only` |

### Hors périmètre — engageant

- ❌ **Aucun canal 1:1 dans le foyer.** Ni message d'un membre au maître, ni
  demande, ni notification « Léa aimerait des pâtes ». L'envie de la semaine
  (FF-050) est **une ligne, écrite par le maître**, et c'est tout.
  ⚠️ **Ce que ça n'interdit pas, dit depuis le 2026-09-03 (P8, A8.0, D8.1)** :
  le message du soir de **Sophia → un profil réclamé**, dans son propre
  `/app/chat`. C'est le produit qui parle à une personne de **ses** repas
  (③), jamais un membre qui parle à un autre ; le maître ne voit pas ce que le
  membre a répondu, et le membre ne reçoit ni les courses ni la cuisson.
- ❌ **Aucun arbitrage entre deux personnes du foyer.** Pas de vote, pas de
  moyenne, pas de « Sophia tranche ». Un désaccord se règle à table.
- ❌ **La colocation.** `households.kind` a été **supprimée** le 2026-08-10, pas
  gardée à une valeur : une colonne à valeur unique invite un lecteur, dans six
  mois, à réactiver un mode sans relire les policies.
- ❌ **Le consentement à se faire restreindre.** Il protégeait un adulte d'un
  autre adulte, dans un monde à plusieurs comptes. La contrepartie n'est pas un
  consentement, c'est la **transparence** : `created_by` reste affiché
  (`restrictionNotice`, rendue par `HouseholdPage`).
- ❌ **Plusieurs foyers par compte.** L'index `household_members_one_per_user`
  rend la résolution du foyer **scalaire** (`keel_household_of`), ce dont
  dépendent toutes les policies. Qui voudra deux foyers réécrira les policies
  d'abord.
- ❌ **Le corps d'un mineur, ou d'une bouche d'âge inconnu, dans le prompt.**
  Même avec un compte. Poser « 152 cm, 41 kg » à côté du prénom d'un enfant rend
  sa direction **dérivable** sans que personne l'ait demandée
  (`meal_body.ts:247`). ⚠️ **Toujours vrai après le 2026-08-12** : ce jour-là on
  a ouvert la **collecte** du corps d'un mineur, pas son **énonciation**. On
  calcule dans le moteur, on n'émet que des grammes d'aliment.
  ⚠️ **Elle est devenue la garde PRINCIPALE le 2026-08-18**, quand un mineur a
  porté les trois objectifs pendant quatre jours (voir juste en dessous) — et
  elle **le reste après le 2026-08-22** : le refus d'objectif ferme l'entrée,
  il ne nettoie pas le stock, et une ligne héritée à `fat_loss` existe encore.
- ⛔ **Un mineur ne porte AUCUN objectif de poids** — décision humaine du
  **2026-08-21** (« aucun objectif de poids sur un mineur »), migration
  **`20260822041500`** (lot S4), qui **renverse** celle du 2026-08-18
  (`20260818100000`, « un mineur porte les trois objectifs comme un majeur »),
  laquelle renversait celle du 2026-08-13. L'histoire, parce qu'elle se relit
  mal : refus posé le 13/08 sur deux portes ; **levé** le 18/08 avec trois
  raisons écrites (l'énergie fermée, le plafond du rythme, le corps jamais
  énoncé) ; **reposé** le 22/08 sur les **quatre** portes d'écriture après
  que les quatre ont été mesurées ouvertes en transaction `rollback` — les
  trois raisons du 18/08 sont renversées nommément dans l'en-tête de la
  migration, la plus courte étant que « le corps d'un enfant n'est jamais
  énoncé » (FF-047) **exige** ce refus au lieu de s'y opposer : une cible de
  poids EST un énoncé du corps. Ce que la base fait : `goal_not_for_minor` sur
  l'ajout, sur la direction **et sur la date** (« le détour temporel », la
  garde qui arme les trois autres : objectif d'abord, date ensuite) ;
  `target_not_for_minor` sur la cible chiffrée. `maintenance` et `null`
  **passent** — l'énergie d'un mineur EST une maintenance calculée sur son
  âge, et retirer un objectif est le remède que le refus désigne. Aucun
  `CHECK` de table ; les lignes existantes ne sont **pas** corrigées.
  **Depuis le 2026-09-03 (chantier P3, décisions D3.1-D3.3), l'écran suit la
  base** : `goalsForAge("minor")` ne rend que `maintenance`, libellée
  « Manger normalement » (registre éducatif, PIVOT-FOYER §8.4) ; un âge
  `unknown` voit les trois (« je ne sais pas » n'est pas « c'est un enfant ») ;
  une direction héritée est **pliée** à `maintenance` au rendu et à
  l'écriture (`goalForAge`, `foldMinorGoal`) **et dite** ; les écrivains
  posent la direction **avant** la date quand elle ne bouge pas
  (`persistMouth`, `saveMember`, `writeMouthBirthDate`). L'option vide « Aucune
  direction particulière » a disparu des cinq sélecteurs : `null` reste valide
  **en base** (part standard), l'écran ne peut plus le produire.
- ❌ **Les calories, dans le foyer comme ailleurs.**
  [CONTRACT.md](../../keel/CONTRACT.md) ne bouge pas, et le brief de portions le
  redit en toutes lettres (`household_portions.ts`, `BODY_FACTS_CAVEAT`).
- ❌ **Les surfaces.** Mode cuisine, liste de courses partageable sans compte,
  widget « ce soir », PDF du frigo. Ce sont des surfaces, pas le modèle ; les
  mêler ici fait un chantier qu'on ne finit pas.

---

## ⚠️ Les trous connus — au 2026-08-11

Ils ont été trouvés et nommés pendant les chantiers des 2026-08-10 et
2026-08-11. Aucun n'est un oubli ; tous sont écrits ici parce qu'un document
qui les tait serait pire qu'absent.

**Les numéros ne sont jamais réattribués**, et un trou refermé garde le sien :
les fiches renvoient à « le trou n°4 », et un lecteur doit pouvoir suivre le
renvoi jusqu'à la ligne qui dit *par quel commit* il s'est fermé. Ce tableau
raconte donc une histoire, pas seulement un état.

### Ce qui reste ouvert

| # | Le trou | Où | Fiche |
|---|---|---|---|
| 2 | **L'écho numérique nu n'est mordu par personne.** « pour tes 84 kg », « tu mesures 186 cm ». Le moteur apparie des **mots** ; il ne sait pas exprimer « un nombre suivi d'une unité, rattaché à une personne ». Les unités nues restent hors liste **exprès** (sinon « des morceaux de 3 cm » met quelqu'un en part standard). | `_shared/keel/household_portions.ts:270-277` | [FF-047](FF-047-le-corps-dans-la-part-du-foyer.md) §7 |
| 6 | **PARTIELLEMENT REFERMÉ — la garde existe, rien ne facture.** Le gel d'un foyer impayé est écrit, testé et branché : `keel_household_is_covered` (`20260811050000:163`) est la définition unique, `generate-household-meal-v1:279-285` rend **402 `household_frozen`**, et la reco du soir saute le foyer (`daily_recommendation_engine.ts:152`). Ce qui manque n'est plus du code : ce sont **les deux prix Stripe et les gestes humains** (chantiers 1 et 3). Tant qu'ils ne sont pas posés, `free_until IS NULL` vaut **couvert**, et le foyer reste **gratuit**. | `20260811030000` · `20260811050000` · `stripe-reconcile-households/` | [FF-049](FF-049-le-prix-du-foyer.md) §7 |
| 7 | **Le tap du soir et le bilan hebdo ne connaissent pas le gel.** `keel-daily-pulse-v1/index.ts` et `keel-weekly-flow-v1/index.ts` ne portent **aucune** occurrence de `household` : ils tournent à l'identique sur un foyer gelé. D4 nomme deux portes, et ce sont exactement les deux qui ont été fermées. Reste à trancher si le tap du soir et le bilan hebdo comptent comme **production**. | `keel-daily-pulse-v1/index.ts` · `keel-weekly-flow-v1/index.ts` | [FF-049](FF-049-le-prix-du-foyer.md) §7 |
| 8 | **Le skill `plan_question` recharge ses contraintes SANS l'union du foyer.** `loadPlanQuestionRuntime` (`run.ts:2099`) rappelle `loadStudentSafetyConstraints` seul (`run.ts:2155-2159`) et le passe au résolveur d'échange (`skills/plan_question/swap_resolver.ts:93,150`). Conséquence : le résolveur peut **approuver** un échange que la ceinture de sortie mange ensuite — la sécurité tient, la cohérence non. | `sophia-brain/router/run.ts:2155-2159` | [FF-046](FF-046-l-allergie-d-une-bouche-sans-compte.md) §7 |
| 9 | **`/start` ne lit pas le verrou pré-lancement.** La troisième porte le lit (`householdSignup.ts:161`, `JoinHouseholdPage.tsx:448`) ; `/start` (`frontend/src/App.tsx:329` → `StartPage.tsx`) ne porte **aucune** occurrence de `prelaunch`. Asymétrie relevée pendant le chantier 4, non corrigée : c'est une autre porte. | `frontend/src/App.tsx:329` · `keel/pages/StartPage.tsx` | [FF-048](FF-048-reclamer-son-profil.md) §7 |
| 10 | **PARTIELLEMENT REFERMÉ — les deux tables qui portent des données personnelles sont dans l'export ; les cinq autres, non.** Le trou d'origine : les six tables du foyer étaient absentes de l'archive (sept avec `household_billing_periods`, qui n'a pas de `user_id`), `grep -ci household account-export-v1/index.ts` rendait **0**. **`household_members`** y est entrée le 2026-08-12 (`392e4a87`), **`household_member_bodies`** le même jour — réclamée **dès sa migration**, pas après. Ce qui reste dehors : `households`, `household_invitations`, `household_food_restrictions`, `household_member_allergies`, `household_envy_submissions`, `household_billing_periods`. Les allergies sont la plus discutable des cinq — c'est une donnée de santé, et elle n'a pas de `user_id` (elle pend à `member_id`, comme le corps : le même chemin `fetchRowsByIdChunks` la ferait entrer). | `supabase/functions/account-export-v1/index.ts` | [FF-048](FF-048-reclamer-son-profil.md) §11 · [FF-047](FF-047-le-corps-dans-la-part-du-foyer.md) §11 |
| 12 | **Un titulaire avec un objectif et SANS pesée dégrade TOUTE la lane du foyer.** `envelopeFor` rend `per_portion` pour trois causes indiscernables — plancher TCA, corps absent, poids inconnu — et `householdLaneMode` traite n'importe quel `per_portion` comme le verrou de lane. Un adulte qui a un compte, a choisi un objectif et n'a jamais renseigné son poids fait donc perdre **tout** dimensionnement au foyer entier, en silence et sans que rien ne le dise. L'indiscernabilité est voulue (FF-043 R2) ; sa conséquence sur le foyer n'a jamais été décidée. Trouvé par le **run réel** du 2026-08-12, pas par un test. | `_shared/keel/household_composition.ts` (`householdLaneMode`) · `_shared/keel/meal_envelope.ts:307` | [FF-043](FF-043-la-resolution-foyer.md) §11 n°5 |
| 13 | **La résolution de date D18 s'arrête au roster.** `keel_household_member_age` résout `profiles.birth_date` puis la fiche du maître ; `student_body_io.ts:162` ne lit que `profiles.birth_date`. Un adulte daté **par son maître** est donc `adult` au roster — son objectif s'applique, sa direction de service est écrite — et porte `ageBand: null` dans son corps, donc **aucune bande d'énergie** : il ne pèse jamais dans le MIN et ne reçoit jamais d'add-on. Mesuré sur une bouche réelle pendant le run du 2026-08-12. | `_shared/keel/student_body_io.ts:162` | [FF-043](FF-043-la-resolution-foyer.md) §11 n°6 |
| 11 | **Les invitations expirées ne sont jamais purgées, et portent une adresse e-mail de tiers.** Aucun chemin ne supprime `household_invitations` sur `expires_at` — le seul `delete` du dépôt est le nettoyage **ponctuel** des orphelines (`20260810200000:118`). Question de **rétention**, pas de détachement ; nommée en tête de `20260811040000:92-94`. | `household_invitations` | [FF-048](FF-048-reclamer-son-profil.md) §11 |

### Ce qui a été refermé, et par quoi

| # | Refermé par | Ce qui a changé |
|---|---|---|
| ~~1~~ | ✅ **`5dfdddb2`** (chantier 5) | **Le chat connaît les allergies du foyer.** `run.ts` résout le foyer **une fois** pour ses deux lanes (`:1453`), charge l'union (`loadHouseholdTurnSafety`, `:1463`), pousse un **second** bloc de prompt (`:2349`) — jamais versé dans « THIS STUDENT'S HARD CONSTRAINTS », qui ferait dire qu'un parent est allergique — et **unit** les deux listes sur la ceinture de sortie (`:2694-2697`), là où l'attribution ne compte pas. Panne de lecture ⇒ on ne coupe pas le tour, **on coupe le verbe** : interdiction de proposer, nommer ou recommander un aliment (`household_safety.ts:381`, `HOUSEHOLD_SAFETY_UNREADABLE_BLOCK:513`). Et la note « le fil du générateur lui-même n'est pas commité » est **doublement périmée** : il l'est depuis `9cd01739` — `household_safety.ts` a désormais **deux** importeurs de production (`generate-household-meal-v1/index.ts:59`, `sophia-brain/router/run.ts:331`). |
| ~~3~~ | ✅ **`ac38a53a`** (chantier 4, D1) | **La troisième porte d'inscription, qui EXIGE le pays.** Sans pays bien formé, `handle_new_user()` **lève** et annule la transaction de signup (`20260811060000:397`) ; `keel_household_join(text)` est **droppée** (`:77`) et remplacée par `(p_token, p_country)` (`:79`), qui refuse `country_required` (`:157`). Deux gardes à deux moments, parce qu'une seule laisse le contournement « je crée un compte par une autre porte, puis je viens réclamer ». `/auth` **n'a pas rouvert** son inscription élève. Le palier posé est `household_member`, jamais `student`. |
| ~~4~~ | ✅ **`e2899897`** (chantier 2, D2) | **Le détachement existe.** `keel_household_detach_member(p_member uuid)` (`20260811040000:213`) remet `user_id` à NULL et **la ligne reste** : portions, allergies, historique, `member_id` inchangé. Compte maître seul, refus nommés. Câblé à l'écran (`frontend/src/keel/api/household.ts:403`). Deux gestes, deux libellés — « retirer l'accès » n'est plus confondu avec « retirer du foyer ». |
| ~~5~~ | ✅ **`e2899897`** (chantier 2, D3) | **Supprimer son compte ne supprime plus la bouche** — et ce n'était pas le pire. La FK est reposée en `ON DELETE SET NULL` (`20260811040000:120-124`), la ligne survit, sauf geste explicite `departs_with_account` (`:187`). **Voir juste en dessous : quatre AUTRES clés étrangères étaient en `NO ACTION`, et elles rendaient le droit à l'effacement littéralement inapplicable.** |

### La trouvaille la plus grave de la série

> **Le droit à l'effacement était INAPPLICABLE pour tout maître de foyer, depuis
> la fondation, en silence.**

On cherchait la cascade qui efface une bouche. On a trouvé, en sondant la base
avant d'écrire la migration, **quatre colonnes `created_by`/`invited_by` en
`NO ACTION` et `NOT NULL`** :

| Colonne | Déclarée en `references auth.users(id)` sans `on delete` |
|---|---|
| `households.created_by` | `20260808000000_household_foundation.sql:58` |
| `household_invitations.invited_by` | `20260808000000_household_foundation.sql:115` |
| `household_food_restrictions.created_by` | `20260808000000_household_foundation.sql:141` |
| `household_member_allergies.created_by` | `20260810170000_household_member_allergies.sql:114` |

La sonde, jouée en transaction annulée le 2026-08-11 et recopiée en tête de la
migration (`20260811040000:10-15`), rend :

```
PROBE A: purge du maître ÉCHOUE → 23503 violates households_created_by_fkey
```

Ce n'était pas une donnée mal supprimée : c'était **une suppression
impossible**. `purge-deleted-accounts` levait, journalisait, et **rejouait le
même échec chaque jour**, pour toujours — et l'échec est un log, pas une
alerte. Les cinq FK sont reposées en `SET NULL` (`20260811040000:120-156`) ;
`household_envy_submissions` reste en `CASCADE`, seule des sept dont la clé
était déjà juste, parce qu'une envie est une **phrase écrite par une personne**
et non un fait du foyer sur une bouche. Le lifecycle RGPD des tables est décidé
**table par table, en tête de la migration** (`:50-104`), et non seulement dans
un rapport.

### Les trois décisions produit non tranchées

Elles ne sont pas des trous d'ingénierie : personne n'a **décidé**, et les
trancher en silence dans le code serait la faute.

| # | La question | Ce que le code fait aujourd'hui |
|---|---|---|
| **A** | **Le foyer orphelin.** Le maître supprime son compte : sa ligne se détache, `created_by` passe à NULL, le foyer survit avec ses bouches et **personne ne le gouverne**. Il n'existe ni suppression de foyer ni transfert de propriété. | Le comportement le plus **étroit** : la case « retirer aussi ma place » est refusée au maître, et le cas est nommé dans la migration (`20260811040000:60-68`). |
| **B** | **La ceinture du foyer mord sur TOUT le tour**, pas seulement sur la casserole : dans un foyer où une allergie au lait est déclarée, Sophia cesse de nommer le lait même à propos de l'assiette du seul locuteur. | Sur-blocage **assumé** (doctrine maison : sur-bloquer escalade, sous-bloquer sert l'allergène), déjà le comportement du générateur — mais désormais **visible** dans la conversation (`run.ts:2683-2697`). |
| **C** | ~~**Le tunnel REFUSE pendant l'essai** (`409 household_in_trial`). L'alternative — ouvrir avec `subscription_data.trial_end` — fait dépendre la promesse d'une contrainte Stripe sur la date, et la viole en silence.~~ | ⟳ **RENVERSÉ le 2026-09-09** (FF-064, décision du propriétaire) : le tunnel accepte désormais un paiement anticipé, et `subscription_data[trial_end]` tombe le lendemain de `free_until` à 00:00 UTC. L'objection ci-contre était juste ; sa réponse est le repli à 49 h de `householdStripeTrialEnd`, qui ne peut que **dépasser** la promesse, jamais la raccourcir. Ne pas effacer le texte d'origine : on doit pouvoir lire pourquoi c'était l'inverse. Voir [FF-064](../abonnement-et-facturation/FF-064-le-mur-de-paiement-du-foyer.md). |

### Ce qu'aucun lot n'a eu

**Aucun run réel avec appel Gemini, et aucune vérification navigateur, sur
aucun des quinze lots** — les neuf de
[CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) ni les six de
[CHANTIER-FOYER-SUITE.md](../../keel/CHANTIER-FOYER-SUITE.md). Ce qui a été
prouvé l'a été par tests, par assertions SQL sur la base réelle, par mutation,
et par des runs HTTP/base **sans le modèle** (chantiers 1, 3 et 4). Le prompt
que ces lots construisent n'a **jamais** été soumis à un modèle, et aucun écran
n'a été ouvert dans un navigateur. C'est un choix, daté ; ce n'est pas un état
vérifié.

---

## Les fiches

| Fiche | Statut | En une phrase |
|---|---|---|
| [FF-043 · La résolution foyer](FF-043-la-resolution-foyer.md) | 🟠 En cours | Une cuisson, des assiettes qui divergent sans que la divergence soit lisible à table. Le tronc se dimensionne sur le MIN **de toutes les bouches** (2026-08-12), jamais sur le référent, et un seul membre sous plancher fait dégrader toute la lane. Le référent a enfin un écran ; les deltas, non. |
| [FF-044 · La bouche sans compte](FF-044-la-bouche-sans-compte.md) | 🟢 Livrée | `member_id` est la clé du foyer, le compte est optionnel, l'âge a trois états. L'objectif vit sur la ligne membre **pour une bouche sans compte** ; dès qu'elle en a un, il vit dans son « about you » (D1, 2026-08-11 — R6). |
| [FF-045 · Décrire son foyer](FF-045-decrire-son-foyer.md) | 🟢 Livrée | Le maître se décrit en premier, puis les bouches s'ajoutent d'affilée. Plafond de 8, en base et pas à l'écran. |
| [FF-046 · L'allergie d'une bouche sans compte](FF-046-l-allergie-d-une-bouche-sans-compte.md) | 🟢 Livrée | Une table à part, un slug dérivé à la lecture, la même union fail-closed. Le fil du générateur est commité (`9cd01739`), et **le chat la voit** (`5dfdddb2`) — deux blocs de prompt, une seule ceinture. |
| [FF-047 · Le corps dans la part du foyer](FF-047-le-corps-dans-la-part-du-foyer.md) | 🟢 Livrée | Réclamer son profil change vraiment l'assiette : le générateur du foyer lit enfin taille, âge, sexe et mesures — et la ceinture a été rearmée sur ce que ça rend dicible. |
| [FF-048 · Réclamer son profil](FF-048-reclamer-son-profil.md) | 🟢 Livrée | Rejoindre un foyer **attache** un compte à une ligne existante ; ça n'en crée pas une. Lecture du plan et son propre objectif, rien d'autre — l'objectif se réglant depuis son « about you » et non plus depuis sa ligne de foyer (D1, 2026-08-11 — R8). |
| [FF-049 · Le prix du foyer](FF-049-le-prix-du-foyer.md) | 🟠 En cours | Le job, la table de période, `free_until` et le **gel** existent et sont testés (`73ab25c9`, `a2d650b6`). Il ne manque que les **gestes humains Stripe** — deux prix, deux secrets, un deploy. |
| [FF-050 · L'envie de la semaine](FF-050-l-envie-de-la-semaine.md) | 🟢 Livrée | Une ligne de texte que le maître écrit pour tout le monde, ancrée au lundi ISO à l'écriture **et** à la lecture. Remplace la récolte par membre. Commit `9cd01739` (+ `461fd500` pour la carte). |

On écrit une fiche **quand on retouche** une fonctionnalité de ce domaine —
écrire des fiches rétroactives produirait des documents que personne n'a
vérifiés. Les fiches FF-044 à FF-050 ont été écrites **après** la livraison des
lots qu'elles décrivent, et chacune cite `fichier:ligne`.

## Identifiants réservés puis libérés

Un identifiant ne se réutilise **jamais**, y compris quand il n'a jamais porté
de fiche.

| ID | Sort |
|---|---|
| `FF-032` · `FF-033` · `FF-034` · `FF-035` · `FF-036` | **réservés le 2026-08-10** par [CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) pour les cinq fiches de ce chantier, puis **jamais attribués** : deux autres sessions écrivaient en parallèle et le chantier a livré sous `FF-044` → `FF-050`, avec un découpage différent (sept fiches, pas cinq). **Ne pas réattribuer.** |

## L'ordre de lecture

1. **FF-044** — le modèle. Tout le reste en dépend.
2. **FF-045** puis **FF-046** — la surface qui remplit le modèle, et la
   contrainte de sécurité qu'elle collecte.
3. **FF-047** puis **FF-048** — ce que le corps change, et le geste qui l'ouvre.
   Dans cet ordre : la réclamation ne vaut que par ce que FF-047 lui donne.
4. **FF-049** — ce qu'on facturera, quand on facturera.
5. **FF-050** et **FF-043** — indépendants du reste.
