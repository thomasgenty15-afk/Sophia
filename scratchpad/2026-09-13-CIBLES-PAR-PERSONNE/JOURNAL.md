# Journal du chantier « cibles par personne » — 2026-09-13

## État de départ, archivé avant toute modification

- `head-AVANT.txt` — `a14c6be1807e5454a57929b28f87eb4cff872a1b`
- `etat-depot-AVANT.txt` — 319 fichiers déjà modifiés par d'autres sessions
- `empreintes-AVANT.txt` — sha256 de 664 fichiers `.ts` du périmètre
- `diff-arbre-AVANT.stat.txt` — 116 fichiers, +23 086 / −7 737 par rapport au commit
- `diff-keel-AVANT.patch` — le diff complet du périmètre (842 ko)

⛔ Le commit de départ seul ne décrit pas cet arbre : il en manque 23 086 lignes.

## Les deux défauts P1, reproduits sur la requête réellement envoyée

Source : `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-h4n4-2026-09-11T12-30-45-131Z.prompts.txt`
Extrait lisible : `AVANT-h4n4-message-utilisateur-reparation.txt` (les 2 appels de réparation)

1. **Neuf cibles journalières anonymes** sur trois jours, plus les cibles de
   créneau : `fri/dinner` compare 947 kcal successivement à 639, 1338 et 861.
2. **`Return the full plan JSON with only these dishes added.`** dans le message
   utilisateur, alors que le message système demande un patch.

## Ce que la revue n'avait pas nommé, et que la lecture du code a trouvé

3. **`repairInstruction`** (`portion_sizing.ts`, chemin densité `c4DensityAsk`)
   portait la MÊME phrase : « Return the full plan JSON with only these dishes
   and the preparations they draw on changed. » La revue n'avait nommé que
   `dedicatedDishInstruction`.
4. **`preferenceSplitRetryInstruction`** et **`swapRetryInstruction`** portaient
   « Keep every dish, day and slot » — interdiction globale contradictoire avec
   un périmètre qui ouvre plusieurs unités.
5. **`unfedRetryInstruction`** portait « leave every other dish exactly as it is »
   et un SECOND schéma de sortie (`partial: true`).
6. **La troncature a jeté 41 lignes sur 65** — « … and 41 more of the same
   kind. » à la fin de la requête archivée. Deux bouches sur quatre
   disparaissaient du message.

## Ce qui a été livré au lot 1

- Adresse structurée par défaut : `member_id`, `date`, `day`, `slot`, `scope`,
  `dish`, `preparation`, `session_index`, `units=U…`, et la mesure avec son
  unité, sa valeur servie, sa cible ou ses bornes, sa tolérance.
- Regroupement par cause + journée : la phrase du geste est dite une fois, sans
  chiffre ; chaque contrat descend sur la ligne de son propriétaire.
- Les cinq consignes contradictoires retirées (points 2 à 5 ci-dessus).
- `REPAIR_MAX_LINES = 24` (lignes) → `REPAIR_MAX_BLOCKS = 40` (blocs) +
  `REPAIR_DEFECT_HARD_CHARS = 30 000`. ⚠️ **Un plafond a été relevé** : mesuré
  que la forme h4n4 rend 31 blocs / 245 lignes / 20 272 caractères, donc à
  24 blocs l'appel était refusé sur le cas NOMINAL d'un foyer de quatre.
- Un objectif individuel sans propriétaire, ou des blocs laissés dehors,
  rendent `contextIncomplete` et **arrêtent l'appel avant de consommer le
  budget** (`plan_repair_context_ownerless:N` / `plan_repair_context_truncated:N`).

Vérifié indépendamment : `deno check` du handler passe ; `deno test
supabase/functions/_shared/keel/` rend **7 088 passés / 0 échoué / 2 ignorés**
(référence d'avant le chantier : 7 055 / 0 / 2).

## Trouvailles annexes, non corrigées (hors périmètre)

- **`emptySlotsRetryInstruction`** (`retry_merge.ts:494`) porte encore « do NOT
  shorten the plan » et un schéma de sortie complet — mais elle n'a **aucun
  appelant, pas même un test**, dans tout le dépôt. Elle ne peut donc atteindre
  aucun prompt. Laissée en place : la supprimer est un autre lot.

## Corrections de documentation

- `scratchpad/2026-09-11-FIABILITE-RECETTES/NON-BRANCHE.md` § ⑩ décrivait la
  garde finale tombée comme un **fail-open**. C'est faux depuis le lot 4 :
  `generate-household-meal-v1/index.ts:18208` rend 422
  `plan_validation_unavailable` avant toute écriture et garde l'ancien plan.
  Note corrigée, avec la limite qui reste vraie : **aucun harnais ne sait
  provoquer ce refus**.

## ⚠️ À TRANCHER AVANT LE LOT 2 — l'instrument et le moteur ne disent pas la même chose

Relevé le 2026-09-13 en relançant `analyse-lot-F.ts` sur
`scratchpad/2026-09-11-CLOTURE/fixtures/perte-l3d04-2026-09-11T12-30-01-888Z-c0.json`
(le tir N=4 qui a produit le « 7/28 » du rapport précédent).

**Ce que l'instrument mesure :**

```
Paul   calorique 7/7 · complète 4/7 · incomplets 0
Lea    calorique 0/7 · complète 0/7 · incomplets 3
Nils   calorique 0/7 · complète 0/7 · incomplets 3
Iris   calorique 0/7 · complète 0/7 · incomplets 3
```

Et pour Lea, l'écart est de **+344 % sur les sept cases**, avec un facteur
presque constant :

```
2026-09-11 dinner      cible 639,10   mesuré 2840,75   +344,49 %
2026-09-12 breakfast   cible 456,50   mesuré 2027,59   +344,16 %
2026-09-12 lunch       cible 730,40   mesuré 3241,63   +343,82 %
…
```

Un écart de composition varie. Un facteur constant de 4,44 sur 21 cases et
trois bouches est une **division qui n'a pas eu lieu** : la bouche secondaire se
voit attribuer le plat entier au lieu de sa part.

**Ce que le moteur écrit, pour la même case, dans sa propre consigne archivée
(`perte-h4n4-…prompts.txt`) :**

```
- fri/dinner: the dinner dish carries 947 kcal in one serving …
```

**947 contre 2 840.** Les deux ne peuvent pas avoir raison.

**LA CAUSE, TROUVÉE.** `household_portions.ts:3011` :

```ts
export function weighedPortionMembers(members) {
  return members.filter((m) => m.goal === "fat_loss" || m.goal === "muscle_gain");
}
```

Seule une bouche portant un objectif de PERTE ou de PRISE reçoit une portion
pesée. Les autres partagent un **bac commun** dont le gramme décrit le
récipient, pas une personne — et c'est **voulu** : mémoire
`box-belongs-to-the-meal`, « la personne en maintenance ne reçoit aucun chiffre
qui la vise ».

Lecture du plan écrit, tir `l3d04`, chaque plat porte DEUX contenants :

```
box …aee24cd39341  member_ids=[Paul]                 total= 341 g   ← prescription
box …i_dinner_0_tub member_ids=[Iris, Lea, Nils]     total=1123 g   ← bac de GROUPE
```

Le banc pose un corps aux bouches secondaires, jamais un objectif. Les trois
partagent donc un seul bac, et l'instrument a comparé ce bac de trois personnes
à la cible individuelle de chacune — d'où le facteur constant.

**Ce que ça change :**

- « 7/28 » n'est pas une mesure du moteur. Sept cases jugées sur la bonne base,
  vingt-et-une jugées sur une base que le produit ne fabrique pas. Le rapport
  précédent a publié ce nombre sans le dire.
- « 24/24 conformes » à N=4 est **inatteignable par construction** si une seule
  bouche est en maintien. Ce n'est pas un défaut, c'est le modèle produit.
- L'instrument se contredit lui-même : il écrit « ❌ +344 % » ET « contrôle
  incomplet » sur la même case. Les deux ne peuvent pas être vrais.
- Le levier existe : `keel_household_set_member_goal(uuid, text)` accepte une
  bouche **sans compte** (`20260810120000_household_member_identity.sql:566`),
  et `household_members.goal` est une vraie colonne. Le banc ne l'appelle jamais.

⇒ Les trois foyers de référence porteront un objectif de perte ou de prise sur
CHAQUE bouche. Les cases d'une bouche en maintien se comptent « sans objet »,
jamais en échec.

## Lot 1 — clos et vérifié

`deno check` du handler : passe. `deno test supabase/functions/_shared/keel/` :
**7 099 passés / 0 échoué / 2 ignorés** (7 055 avant le chantier).

Ajout final : les contrats des consommateurs SAINS d'une casserole partagée
voyagent maintenant avec leurs propres chiffres — une ligne par bouche et par
repas, `energy_served_kcal`, `target_kcal`, et les bornes de masse/densité quand
le contrat en pose. La phrase de protection (« recomposer ce lot doit laisser
CETTE portion dans ses chiffres ») est posée **sur la ligne de chaque portion**,
jamais en interdiction globale. Message N=4 : 22 906 → 31 360 caractères,
sous les plafonds, aucun plafond augmenté pour ça.

Côté écran, l'écart résiduel était **déjà** correct : `PlanValidationDefect`
porte `memberId` et le bandeau ne nomme que la bonne personne. Ce qui manquait
était la COUVERTURE — le cas existant portait deux écarts pour deux bouches,
donc les deux noms étaient à l'écran de toute façon. Prouvé par mutation : un
rendu qui nomme tout le foyer sous chaque écart laissait l'ancien test vert et
ne fait rougir que le nouveau.

---

# LOT 2 — trois références qui passent sans réparation (2026-09-13)

## § 1 — QUI COMPTE QUOI : TRANCHÉ, ET LA PREUVE TIENT EN UNE DIVISION

**Le moteur compte l'ASSIETTE SERVIE (le bac divisé par le nombre de mangeurs).
L'instrument comptait le BAC ENTIER. L'instrument avait tort.**

Mesuré sur `perte-l3d04`, case `fri/dinner`, par `boxNutrition` (fonction de
production) :

```
fri/dinner   noms=1  [Paul]              341 g     862,52 kcal
fri/dinner   noms=3  [Iris+Lea+Nils]    1123 g    2840,75 kcal   ÷3 = 946,92
```

Et la consigne archivée du moteur, pour la MÊME case :

```
fri/dinner: the dinner dish carries 947 kcal in one serving and it must carry 639 kcal
```

**2 840,75 / 3 = 946,92.** C'est le 947 du moteur, au dixième près. Les deux
nombres sont exacts, sur deux bases différentes.

La convention de production est écrite et elle a un seul lieu :
`final_plan_audit.ts::cellNutritionTable` (l. 851-860) fait
`share = box.kcal / eaters`, `grams / eaters`, `proteinG / eaters`, et garde
`sharedWith` à côté — « une case à `sharedWith > 1` porte une estimation, pas
une pesée nominative ». `cellStateOf` juge ensuite cette PART contre la cible.
`boxNutrition`, elle, documente en toutes lettres qu'elle rend « le RÉCIPIENT,
jamais l'assiette » et « ne se divise pas par le nombre de mangeurs ».

`scripts/2026-09-11-mesure-grille.ts::croiser` indexait la sortie brute de
`boxNutrition` sans diviser : un bac de trois comparé à la cible d'une.
**+344 % sur 21 cases, facteur constant 4,44** — une division qui n'avait pas
lieu DANS L'INSTRUMENT.

### Correctif
- `PortionMesuree.partageAvec` (1 = pesée nominative, >1 = bac de groupe) ;
- `partDeLaBouche()` applique la convention de `cellNutritionTable`, et rien
  d'autre ;
- `croiser` divise à l'endroit — et au seul endroit — où l'on passe du
  récipient à la personne ;
- `Denominateurs.portionsPartagees` compte les cases jugées sur une PART, et le
  rendu le DIT ;
- la densité ne bouge pas (kcal/g est invariant par division) — c'est la
  contre-épreuve.

Effet sur `perte-l3d04` : `0/7 → 10/28` calorique, `5/28` complète. Les cases
qui restent en échec le sont maintenant pour une vraie raison : un seul bac
pour trois cibles (639, 1 338, 861) ne peut pas satisfaire les trois.

## § 2 — LES TROIS RÉFÉRENCES

Horloge commune : `2026-09-13T19:00:00+02:00` ⇒ fenêtre **2026-09-14 → 2026-09-15**
(`sun` retiré, `shopping_cutoff`), soit **6 cases par bouche**. Vérifié à chaque
tir : « la dérivation d'avant l'appel décrit bien la fenêtre servie ».

| référence | compte | plan écrit | calorique | complète | réparations |
|---|---|---|---:|---:|---:|
| N=1 | `lot2r1b` | `5cfc9f85` | **6/6** | **6/6** | 0 / 2 |
| N=2 | `lot2r2d` | `067b85a3` | **12/12** | **12/12** | 0 / 2 |
| N=4 | `lot2r4a` | `d9d5c1c8` | **24/24** | **24/24** | 0 / 2 |

Porte finale sur les trois : `ok=true · refus=0 · bloquants=0 · conforme`.
Transmissions fournisseur : 1 (le premier jet en conserve), zéro appel facturé.

⚠️ **Ce que ces nombres NE mesurent PAS.** Les trois références sont
CONSTRUITES : `batir-ref1/2/4.ts` composent les recettes contre les contrats que
`slot_nutrition_contract.ts` calcule, puis mesurent la densité servie avec
`dishEnergy` + `weighedReadyGrams`. La revue l'a autorisé — « une fixture
construite explicitement, validée avec les fonctions de production, est adaptée
à un test déterministe » — mais elles ne disent **rien** de la compétence
générative du modèle.

## § 2 bis — CE QUE LA COMPOSITION A APPRIS

- **La porte de composition mord sur un ingrédient de 24 g.**
  `tamari_sans_gluten` a `source = "sas"` ⇒ `a_verifier` ⇒ `isComposable` faux
  ⇒ `ref_refused` ⇒ le plat entier NON MESURABLE ⇒ `cell_without_portion` ⇒
  plan refusé. `refusNonComposables()` éprouve désormais cette porte AVANT
  d'écrire une référence.
- **Le plancher protéique est la contrainte qui mord, pas la densité.** Lea
  (58 kg, fat_loss, végane) demande 116 g sur 1 551 kcal, soit **30 % de
  l'énergie** ; Paul (88 kg, fat_loss) 176 g sur 2 454, soit 28,7 %. Toutes les
  recettes de N=2 et N=4 sont bâties autour du soja et des légumineuses pour
  cette seule raison.
- **Le déjeuner partagé de N=4 est la case la plus étroite de tout le lot** :
  bande commune `[235–250]` (quinze points) ET 28,7 % de protéines, en végan.
- **Un plat dédié porte `for_member_id`, donc un identifiant de CE foyer.**
  Servir la même référence sur un autre compte rend « for_member_id … is not a
  mouth that gets its own dish, dropped » : six plats jetés, 86 défauts, mesuré.
  `preparer-ref4.sh` rebâtit donc la référence contre le compte qui la reçoit.

## § 3 — LES DEUX VARIANTES

### Présences différentes selon le créneau — 22/22 et 22/22
`--rythmes-bouches=";;;lunch,dinner"` sur Iris. Dénominateur **22** (6+6+6+4) :
la somme des cases réellement demandées, jamais 4 × 6. Compte `lot2v2`, plan
`22e3429a`, 0 réparation.

### ⛔ DÉFAUT REPRODUIT ① — UNE BOUCHE QUI DÉCLARE SON RYTHME VIDAIT LA GRILLE
Maître silencieux, Paul/Lea/Nils silencieux, **Iris seule** déclare
`lunch, dinner`. L'union `pc.eating_rhythm ∪ ⋃ m.eatingSlots` valait donc
`{lunch, dinner}` : le calendrier envoyé au modèle ne portait plus que **4 cases
sur 6**, et les DEUX petits-déjeuners du foyer disparaissaient **pour les quatre
bouches**.

La prémisse écrite dans le code — « une bouche à `null` n'ajoute rien : elle
mange aux moments de la maison, ce qui est exactement ce que l'union contient
déjà » — est fausse quand la maison elle-même n'a rien déclaré : le repli
`DEFAULT_EATING_RHYTHM` ne s'appliquait que si l'union était VIDE.

**Corrigé** (`generate-household-meal-v1/index.ts`, `houseBaseSlots`) :
```
base  = ce que le MAÎTRE a déclaré, ou DEFAULT_EATING_RHYTHM s'il n'a rien dit
union = base ∪ ce que CHAQUE bouche a déclaré en plus
```
Un maître qui déclare `lunch, dinner` garde exactement ses deux moments.
Après correctif : 6 cases, `mon breakfast: 3 eat — Nils, Paul, Lea`,
`mon lunch: 4 eat`. Aucun test du dépôt ne pinglait l'ancien comportement.

### ⛔ DÉFAUT REPRODUIT ② — UNE BOUCHE D'ÂGE INCONNU NE PEUT PAS ÊTRE NOURRIE
Compte `lot2v1`, Iris sans date de naissance (`age_state = unknown`, qui n'est
PAS « adulte ») : `dayTargetFor` s'abstient, aucune cible, **aucun contenant**
(`tubs_authored: 0`), donc `mouth_unfed` cause `not_named` sur ses quatre cases
— et **le plan entier est refusé (422), pour les quatre bouches**.

La même variante avec `maintenance` à la place de l'âge inconnu passe en 200 et
rend 22/22. Le blocage tient donc à l'ABSENCE DE CIBLE, pas à l'absence de
portion pesée. **Non corrigé dans ce lot** : le chemin d'écriture des bacs vit
au cœur du handler et sa réparation n'est pas cadrée ici.

### Observation, mesurée, non corrigée
Sur ce chemin (`portion_standard_recipe`), **chaque mangeur reçoit un contenant
à UN nom, y compris la bouche en `maintenance`** : 22 boîtes, toutes à un nom,
`tubs_authored: 0`. La protection écrite dans `weighedPortionMembers` — « la
personne en maintenance ne reçoit aucun chiffre qui la vise » — n'est pas ce que
cette lane livre.

## § 2.3 — LES CAS DE DÉFAUT

| cas | compte | verdict | pourquoi |
|---|---|---|---|
| portion manquante `tue/dinner`, réparation fournie | `lot2d3` | **ADOPTÉE** — 200, plan `9bd5294c`, 24/24 et 24/24 | défauts 13 → 1 au tour 1 ; la case revient à la bonne personne/date/créneau |
| portion manquante, patch générique du banc | `lot2d2` | **REFUSÉ** — 422 | le patch recopie la projection, qui porte l'identité CASSÉE ⇒ `candidate_safety_regression` ×2 |
| session dangereuse puis réparée | `lot2d5` | **ADOPTÉE** — 200, plan `9a242880`, 24/24 et 24/24 | `output_lock_localized:1`, `by_kind {safety:1}` → 0 ; 12 plats et 2 casseroles intacts, zéro trace de l'aliment |
| session dangereuse persistante | `lot2d6` | **REFUSÉ** — 422 `output_lock:1` | aucune écriture en base, l'ancien plan préservé |
| lot partagé retouché seul | `lot2d4` | **REFUSÉ** — 422 | `candidate_no_improvement` (8 → 10 défauts) ; le moteur refuse une candidate qui dégrade |

⛔ **Ce qui N'EST PAS démontré** : « le patch crée une préparation dédiée →
candidate adoptée ». Le banc n'a aucune opération de patch qui FORKE une
casserole ; ce qui est démontré est le refus d'une retouche de lot qui
n'améliore pas. Et le cas **complément** (`complements_shared`) n'a pas été
exercé du tout.

## § 5 — LES DEUX CONTRE-EXEMPLES REJOUÉS

`relire-consigne-reparation.ts` ouvre le corps JSON **réellement transmis**
(capturé par `--prompts` pendant le tir), pas une réponse archivée.

| forme | fichier | lignes adressées | consignes contradictoires | troncature |
|---|---|---:|---|---|
| h4n4 (4 bouches) | `perte-lot2d2-…prompts.txt` | 13, dont 4 avec `member_id`, 9 avec `dish=` | **0 / 5** | aucune |
| h2n2 (2 bouches) | `gain-lot2h2-…prompts.txt` | 4, dont 2 avec `member_id` | **0 / 5** | aucune |

Aucun objectif orphelin : chaque ligne nomme soit sa bouche, soit son plat.

## § 6 — CORRECTIONS DE L'INSTRUMENT

- `croiser` divise un bac de groupe (§ 1) ;
- `analyse-lot-F.ts` publiait la porte finale du **premier** tour : sur le cas
  réparé, il imprimait « ok=false · refus=4 · not_deliverable » sous un plan
  livré en 200 dont la dernière porte dit « ok=true · conforme ». Il prend
  désormais la DERNIÈRE, et imprime le nombre de passages ;
- `couloirCommun` ne confond plus « sans objet » (bouche sans cible) et
  « intersection vide » (il faut un plat dédié).

## Vérifications

```
deno test --allow-all supabase/functions/_shared/keel/   → 7117 passés / 0 échoué / 2 ignorés
deno check supabase/functions/generate-household-meal-v1/index.ts → OK
```
(7099 au début de session ; 7117 avant ET après le correctif de l'union — les
18 tests de plus viennent d'une autre session qui travaille dans `_shared/keel`.)
