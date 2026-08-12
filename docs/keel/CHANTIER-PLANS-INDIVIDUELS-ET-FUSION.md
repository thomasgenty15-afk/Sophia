# Chantier — le plan du foyer, les plans individuels, et la fusion

> Registre des arbitrages. Ouvert le **2026-08-11**, **révisé en profondeur le
> 2026-08-12** après qu'une vérification de l'utilisateur a montré que le modèle
> du 11 était faux sur un point central.

## Ce qui a changé le 2026-08-12, et pourquoi

Le registre du 11 disait : *« chaque titulaire d'un compte — maître compris — a
son propre plan »*, produit par `generate-meal-v1`. **C'était faux.**
`generate-meal-v1` compose pour **une seule personne** : il ne lit pas le roster.
Le « plan individuel du maître » aurait donc été un plan pour lui seul.

Or une mère qui a renseigné ses deux enfants ne demande jamais un plan pour elle.
La question posée était : *« je voulais juste m'assurer que ça avait bien été
pris en compte »* — et la réponse est que le générateur de foyer le fait déjà
(`servings` vient du roster, pas du client), mais que **la conception du 11
l'aurait défait**.

Le modèle corrigé est plus simple :

- **Le plan du maître EST le plan du foyer.** Lui, plus toutes les bouches sans
  compte, plus tout compte secondaire qui n'a pas pris la main.
- **Un compte secondaire a deux postures.** Par défaut il ne fait rien et il est
  composé dans le plan du maître comme une bouche ordinaire. S'il veut la main,
  il génère son plan, et une **fusion est proposée au maître**.
- **Le repli est le refus.** Si le maître refuse, chacun garde son plan, et celui
  qui a pris la main assume sa cuisson et ses courses.

Conséquence : `generate-meal-v1` ne sert **que** les comptes secondaires qui
prennent la main, et les comptes individuels sans foyer.

## Les arbitrages

| # | Décision | État |
|---|---|---|
| **D1** | Pour une bouche avec compte, son « about you » (`student_goals`) fait autorité sur `household_members.goal`. Résolu une seule fois, dans `keel_household_roster_for`. | ✅ livré |
| **D2** | ~~Plans individuels pour tous les titulaires~~ → **le plan du maître est le plan du foyer**; seuls les secondaires qui prennent la main ont un plan personnel. | ✅ livré (L3) |
| **D3** | Les bouches sans compte n'ont pas de plan individuel. Elles n'existent que comme parts dans le plan du foyer. | ✅ tenu |
| **D4** | Préférences durables **et** mémoire de chaque titulaire entrent dans la composition, avec un plafond de tokens par membre et la garde de non-divulgation étendue. | ✅ livré (L6) |
| **D5** | Plats séparables en composants : servir `muscle_gain` et `fat_loss` d'une seule casserole n'est possible que si le plat se re-proportionne. Le répertoire se rétrécit, c'est le prix assumé. | ⬜ à faire |
| **D6** | Échelle de fusion : ① même plat, ratios différents ② plats différents, même session de cuisson ③ sessions séparées. Renonce dès qu'un plat commun forcerait quelqu'un **hors de sa direction de service** — critère vérifiable, pas jugement de goût. | ✅ livré (L4) |
| **D7** | Qui n'a pas de plan **validé** au moment où le maître compose est automatiquement pris dans le plan du foyer. La composition n'attend jamais personne. | ✅ livré (L3) |
| **D8** | Validation **après** la fusion : le maître est averti, et il a trois sorties — refaire sans ce user (*défusion*), refusionner à partir de son plan, ou refuser. Dans tous les cas le user garde son plan. Consigne de défusion, mot pour mot : *rester au plus près du plan de base, sans user X*. | ✅ livré (L5) |
| **D9** | Le maître **accède** à tous les plans, mais sa surface de cuisine n'affiche **que** le plan qu'il cuisine. Un plan validé non fusionné n'y apparaît pas : le but est de simplifier sa cuisine, pas de lui faire suivre N plans. Un secondaire voit le plan du foyer et le sien. | ✅ livré (L8) |
| **D10** | La fusion est **manuelle**, déclenchée par le maître, sur proposition : *« le plan de X a été validé, voulez-vous le fusionner ? »* | ✅ livré (L5) — le lecteur ; le bouton est L8 |
| **D11** | Plafond : `N + 3` fusions par foyer et par semaine ISO, N = comptes actifs. Compté en base, refus nommé `merge_quota_exhausted`. | ✅ livré (L7) |
| **D12** | Pas de reprise des plans produits par l'ancien chemin : ils seront régénérés. | ✅ acté |
| **D13** | **Le verrou de paiement est au niveau du FOYER.** Foyer impayé ⇒ plus personne ne génère, ni maître ni secondaire. Un compte **sans foyer** n'est pas concerné : les comptes individuels existent et ne demandent pas de foyer. | ✅ livré (L1) |
| **D14** | **La présence se déclare.** Le maître doit pouvoir marquer **qui est là, et quand**. Tout le monde présent est le cas simple ; une absence se marque, et elle change les parts sans supprimer la session de cuisson. | ✅ livré (L2) |
| **D15** | **La fusion REPREND l'INTERSECTION des fenêtres**, et elle s'arrête d'elle-même là où elles divergent — pour la TÊTE (les jours d'avant restent couverts par la ligne d'avant, tronquée). ⚠️ **Précisé le 2026-08-12 (L10 ①)** : ce qu'elle RECOMPOSE est la queue du plan du foyer, du pivot à son dernier jour. Une fenêtre plus courte que le plan du foyer laisserait des jours sans aucun plan — la base la refuse, ou pire l'accepte en silence. | ✅ livré (L4), précisé (L10) |
| **D16** | **Le pivot est le premier jour non encore consommé**, pas la date de courses. Une fusion ne touche que les jours à venir, et la proposition le dit : *« son plan couvre 5 jours, dont 2 déjà passés — je peux fusionner les 3 restants. »* | ✅ livré (L4) |
| **D17** | Un réglage **discret** permet au maître de ne plus se voir proposer la fusion pour une personne donnée. Assumé comme un peu brutal, donc caché. | ✅ livré (L5) |
| **D18** | La date de naissance : **sur la fiche de la bouche** pour qui n'a pas de compte, et dans **« about you »** pour le maître. Pas à l'inscription. | ✅ livré (L9) |

## L'état réel — ce qui est fait et prouvé

Campagne de test du 2026-08-11, 5 lanes en conditions réelles, ~80 vérifications,
6 générations modèle réelles. Chaque affirmation décisive re-vérifiée à la main.

**Livré et prouvé :**

- **D1** de bout en bout : une personne portant `muscle_gain` sur sa ligne de
  foyer et `health` dans son about-you a reçu la part `health`.
- **`health` a une direction à lui** (`generous vegetables, balanced protein and
  starch share`). Les deux neutres — aucun objectif, âge inconnu — rendent une
  consigne byte-identique dont `health` se détache. Test de distinction des six
  objectifs ajouté, mutation-testé.
- **`plan_kind`** (`personal` | `household`) et **`validated_at`**, avec la
  fenêtre scopée par nature dans les **trois** mécanismes (boucle de la RPC,
  index unique, contrainte d'exclusion).
  ⚠️ *Sa motivation d'origine — « le maître doit tenir deux plans la même
  semaine » — tombe avec la révision D2. La séparation reste juste et utile (elle
  distingue ce que la fusion consomme de ce qu'elle produit), mais elle n'est
  plus load-bearing.*
- **`keel_validate_meal_plan`**, idempotente **sous concurrence** : la garde est
  dans le prédicat. Mesuré 0 collision sur 6, date stable.
- **Aucune fuite** dans les consignes d'assiette, ceinture contre-testée.
- **Le portail JWT** dans les deux sens, le **gel 402** nommé/non destructif/
  réversible, les **11 refus nommés** de la RPC d'écriture.

**Corrections issues de la campagne, toutes prouvées :**

| Défaut | Correction |
|---|---|
| La validation redatait sous concurrence | garde portée dans le prédicat |
| Une fenêtre **englobée** perdait des jours en silence | `plan_overlaps_existing`, la troncature légitime passe toujours |
| `mode` était le seul paramètre sans refus nommé | `mode_required` · `unknown_mode` |
| `service_role` recevait un 200 qui ne faisait rien | `EXECUTE` révoqué |
| **Le modèle était payé avant tout refus** | 0,06 s et 0,33 s au lieu de 28,6 s et 225 s |
| `member_deltas` : clé morte dans le payload d'écriture | retirée ; les deltas restent dans la réponse HTTP |
| Commentaires affirmant le contraire de D1 | corrigés |

## Ce qui reste — les lots, dans l'ordre

| # | Lot | Dépend de | Pourquoi maintenant |
|---|---|---|---|
| ~~**L1**~~ | ~~**Le verrou de paiement (D13)**~~ | — | ✅ **livré le 2026-08-12** — voir §« L1, ce qui est prouvé » |
| ~~**L2**~~ | ~~**La présence (D14)**~~ | — | ✅ **livré le 2026-08-12** — voir §« L2, ce qui est prouvé » |
| ~~**L3**~~ | ~~**La prise de main (D7, D2)**~~ | L1 | ✅ **livré le 2026-08-12** — voir §« L3, ce qui est prouvé » |
| ~~**L4**~~ | ~~**Le moteur de fusion (D6, D15, D16)**~~ | L3 | ✅ **livré le 2026-08-12** — voir §« L4, ce qui est construit » |
| ~~**L5**~~ | ~~**La proposition et la défusion (D8, D10, D17)**~~ | L4 | ✅ **livré le 2026-08-12** — voir §« L5, ce qui est construit » |
| ~~**L6**~~ | ~~**Mémoire et préférences par titulaire (D4)**~~ | L4 | ✅ **livré le 2026-08-12** — voir §« L6, ce qui est construit » |
| ~~**L7**~~ | ~~**Le plafond de fusions (D11)**~~ | L4 | ✅ **livré le 2026-08-12** — voir §« L7, ce qui est construit » |
| ~~**L8**~~ | ~~**Les écrans (D9)**~~ | L4, L5 | ✅ **livré le 2026-08-12** — voir §« L8, ce qui est construit ». ⚠️ O2 est refermé côté écran ; un secondaire reste sans coach (voir point 1) |
| ~~**L9**~~ | ~~**La date de naissance (D18)**~~ | — | ✅ **livré le 2026-08-12** — voir §« L9, ce qui est construit » |
| **L10** | **QA réelle** sur un foyer à objectifs divergents : la prise de main, la fusion, la défusion, le repli séparé, les fenêtres décalées. | tout | |

## L1, ce qui est prouvé — 2026-08-12

La garde est en `generate-meal-v1/index.ts:390-415` (résolution du foyer remontée
à `:354`, premier appel modèle `:926` — lignes décalées de quatre par C1, la
position **relative** est inchangée) et inchangée en
`generate-household-meal-v1/index.ts:269-292`. Une seule lecture de foyer par
requête : le site d'écriture consomme la valeur au lieu de re-résoudre.

Mesuré en HTTP réel, trois comptes, mêmes corps de requête :

| Cas | Résultat |
|---|---|
| Maître d'un foyer **non couvert** | `402 household_frozen` |
| Le **même compte**, `free_until` basculé | `409 no_coach` — la garde est franchie |
| Compte **sans aucun foyer** | franchit la garde |
| Membre **non propriétaire** d'un foyer gelé | `402` par sa porte personnelle |
| `generate-household-meal-v1` sur le foyer gelé | `402`, non cassé |

**Le modèle n'est pas payé** : refus en 33–80 ms à chaud, contre ~180 s pour une
génération réelle ; `llm_usage_events` reste à **0 ligne** pour les trois comptes.
**Rien n'est écrit** : le plan préexistant est resté à l'octet près, `updated_at`
inchangé. **Fail-open vérifié en vivant** : `execute` révoqué deux secondes sur
`keel_household_is_covered` ⇒ le foyer gelé passe les deux portes, et l'échec est
journalisé dans `system_error_logs`.

**Deux défauts trouvés en chemin.**

1. *Corrigé.* `jsonResponse` écrit dans `system_error_logs` **tout** statut ≥ 400,
   au niveau `error` : 15 lignes d'incident pour des refus de paiement en une
   session de test. Les deux 402 portent désormais `skipErrorLog`, et la trace
   utile reste entière dans le `console.log` nommé. Test mutation-testé.
2. *Accepté tel quel.* `if (householdId && !householdLookupFailed)` — la seconde
   clause est morte par construction (`householdId` reste `null` quand la
   résolution lève). Gardée comme ceinture ; ne pas la lire comme le mécanisme du
   fail-open, qui tient au `null`.

**Ce qui n'est pas prouvé** : qu'un foyer couvert compose **de bout en bout**. Les
trois comptes de test s'arrêtent deux gardes plus loin sur `no_coach`, faute de
coach avec doctrine publiée. La position de la garde est prouvée par la source
(`indexOf` garde < `indexOf` modèle), pas par une génération complète.

**Reste ouvert, hors L1** : `frontend/src/keel/api/mealGeneration.ts` ne mappe pas
`household_frozen` — un secondaire de foyer gelé verra le jeton brut. À porter en
**L8**.

## L2, ce qui est prouvé — 2026-08-12

Migration `20260812130000_household_presence.sql` : colonne
`household_members.away_days`, RPC `keel_household_set_member_away`, résolution
dans `keel_household_roster_for`. Module `_shared/keel/household_presence.ts`.
Écran : `HouseholdPage.tsx` **réutilise** `MealPickerGrid`, pas de second
composant.

**Trois arbitrages pris seuls, et pourquoi.**

| Décision | Écarté | Pourquoi | Retour arrière |
|---|---|---|---|
| Colonne jsonb, même forme que `practical_constraints.away_days` | une table dédiée | une colonne se retire, une table se migre ; si la présence devient des dates exactes, on la promeut à ce moment-là | `drop column` |
| **Union** entre la déclaration du titulaire et la marque du maître | l'about-you gagne (comme D1) ; le maître gagne | un objectif est une **opinion**, dont il n'y a qu'un porteur légitime ; une absence est un **fait** que deux personnes peuvent connaître. Les deux sont des déclarations explicites : personne ne se déclare absent par accident | revert du roster |
| `servings` = le moment le **plus peuplé** | la moyenne ; `members.length` | une moyenne fait manquer de quoi manger le jour où tout le monde est là ; le maximum fait au pire un reste | une ligne |

**Mesuré en HTTP réel** — foyer de 4 (2 comptes, 2 bouches sans compte), vraies
RPC, vrais jetons :

- `not_your_line` quand un non-maître vise la ligne d'un autre ; `not_authenticated`
  sous `service_role` ; `bad_away` sur une forme illégale et au-delà de 42 entrées.
- `authenticated` **lit** `away_days` et ne peut pas l'écrire : `PATCH` direct
  sous le jeton du maître ⇒ `403 42501`, colonne inchangée avant et après.
- **L'union**, sur le roster : `[{"day":"mon","slots":["dinner"],"source":"self"},
  {"day":"fri","source":"household"}]`. Une `source` rangée par le client est
  **écrasée**. Sur le même jour, `self` + `household` fusionnent en journée entière.
- **`window_fully_away`** en 488 ms, **sans appel modèle** — et le cas qui passe,
  à un cheveu : une seule bouche présente au seul petit-déjeuner de mercredi
  compose en 20 s, `servings = 1`.
- **Le bloc entre dans le vrai prompt**, prouvé par mesure et non par lecture :
  `prompt_chars` passe de 3504 à 4131, soit exactement les 625 caractères du bloc
  reconstruit sur le roster réel plus son séparateur.
- **Non-régression** : foyer sans absence ⇒ `servings` identique et bloc **vide**,
  donc filtré du `join` — la consigne est byte-identique à celle d'avant le lot.

**Un changement de comportement assumé.** Avant, l'absence du **propriétaire**
valait pour tout le monde et vidait le créneau ; le parseur jetait alors les plats
et le plan sortait `empty_meal`. Désormais un foyer de 4 dont seul le maître est
absent **compose quand même**, pour 3. C'est FF-002 §9 mot pour mot.

**Deux défauts trouvés en chemin, tous deux corrigés.**

1. **Le prompt du foyer avait changé sans que sa version bouge.** Deux plans
   stampés `meal.en.v8…+household` portaient des consignes différentes. Un prompt
   n'a pas de compilateur : rien n'échouait. Un **second axe de version** est posé
   (`HOUSEHOLD_PROMPT_VERSION`, aujourd'hui `v2_presence`) plutôt que de bumper le
   tronc — bumper `MEAL_PROMPT_VERSION` aurait fait bouger la lane **individuelle**,
   dont pas une ligne n'avait changé. Un test tient la structure du prompt (nombre
   de blocs et ordre) et exige le bump ; mutation-testé sur un bloc retiré et sur
   un bloc déplacé.
2. **`member_portions` ignorait la présence** — la seconde moitié de FF-002 §9.
   Un plan cuisiné pour **une** personne portait **quatre** portions, et
   `reconcilePortions` **réattribuait** une portion standard à toute bouche que le
   modèle avait omise. Une bouche absente à **tous** les moments de la fenêtre
   n'entre plus ni dans la liste d'ids ni dans la réconciliation
   (`member_away_all_window:<id>`). Qui manque **un seul** repas garde son assiette.

**Ce qui n'est pas prouvé** : les écrans n'ont pas été pilotés dans un navigateur ;
seul leur lecteur de données a été lu. Et le message utilisateur envoyé au modèle
n'est **archivé nulle part** — `llm_raw_response_events` ne garde que le system
prompt et la réponse. La preuve du bloc est un écart de `prompt_chars`, pas une
relecture du texte.

**Reste ouvert, hors L2** : `generate-meal-v1` n'a toujours pas `window_fully_away` ;
le chat lit le roster mais **n'utilise pas** la présence — personne ne sait à table
que quelqu'un manque.

## L3, ce qui est prouvé — 2026-08-12

Migration `20260812150000_household_hand_taken.sql` : `keel_household_roster_for`
rend `own_plans`. Module pur `_shared/keel/household_hand.ts`. Split dans
`generate-household-meal-v1/index.ts:587`, et les trois consommateurs suivent —
`resolveHousehold`, `resolveWindowPresence`, `platedMembers`.

**Le recouvrement est TOTAL** — arbitrage pris seul. Un plan personnel n'exclut
son porteur que s'il couvre la fenêtre du foyer **en entier** ; mercredi→dimanche
face à lundi→dimanche ne prend pas la main.

- *Écarté* : le recouvrement partiel. Il **affame** — retirer quelqu'un du lundi
  parce qu'il a un plan à partir de mercredi, c'est cuisiner sans lui deux jours
  où il n'a rien. L'erreur inverse coûte un reste, le même arbitrage que L2 sur
  `servings`.
- *Ça ne préempte pas D15* : avec le total, un plan partiel reste un candidat de
  fusion ordinaire. Avec le partiel, L4 devrait **rajouter** une bouche pour les
  jours non couverts — une décision que D15 ne prend pas.
- *Retour arrière* : `planCoversWindow` → `plansOverlap`, une ligne.
- Le cas partiel n'est pas silencieux : `hand.partial`, motif
  `personal_plan_partial_window`. Sans quoi « plan partiel » et « pas de plan »
  laisseraient la même trace, et L4 ne saurait pas qu'il y a une intersection.

**Le maître n'est jamais exclu** (D2), même porteur d'un plan validé qui recouvre
— sinon il cuisinerait un repas qu'il ne mange pas. C'est aussi ce qui rend le
refus `all_members_have_own_plan` **structurellement inatteignable aujourd'hui** :
il tient l'invariant, pas le symptôme. Sans lui, le cas ne tomberait pas sur
`window_fully_away` mais bien plus bas — `resolveWindowPresence` rend un échec
**ouvert** sur une liste vide, donc la composition irait jusqu'à un appel modèle
payé pour un plan que personne ne mange.

**Mesuré en HTTP réel** — trois générations complètes sur un foyer de 4 :

| Cas | Résultat |
|---|---|
| Secondaire **sans** plan validé | composé : dans les ids, dans `member_portions`, `servings = 4` |
| Le **même**, plan personnel validé qui recouvre | `servings = 3`, absent de `member_portions`, **nommé** dans `hand.taken` avec son plan et sa date de validation |
| Plan validé **partiel** | **reste composé** *et* apparaît dans `hand.partial` — les deux sur la même ligne |
| Plan non validé · retiré · `plan_kind='household'` · foyer NULL | n'excluent personne, chacun mesuré séparément avec restauration entre deux |
| Le **maître** porteur d'un plan validé qui recouvre | composé, aucune trace le concernant |

**L1 et L2 tiennent** : `402 household_frozen` en **34 ms** contre 20 à 36 s pour
une génération — et le gel précède même la lecture de la fenêtre. La présence
marche toujours, et les deux filtres se composent : un même run porte une prise de
main partielle **et** une absence totale.

**Deux défauts trouvés, tous deux corrigés — et c'est le même.**

`household_id is not null` **ne veut pas dire « plan du foyer »**. Un plan
**personnel** le porte aussi : `generate-meal-v1` l'estampe exprès, pour que la
fusion le retrouve. Deux lecteurs indépendants avaient fait la même lecture
erronée du schéma :

1. `household_turn_context.ts` rendait au chat le plan personnel du membre le
   plus récent — chacun, le maître compris, s'entendait décrire les plats de
   quelqu'un d'autre comme le dîner de la maison.
2. `frontend/src/keel/api/household.ts` (`loadHouseholdMeal`) **vidait** la carte
   du foyer dès qu'un secondaire générait un plan commençant après celui du
   foyer : elle rendait sa ligne, qui n'a aucune `member_portions`.

Vérifié en base : sur la fixture, la ligne la plus récente du foyer **était** le
plan personnel du secondaire. L3 rend la collision **nominale** — prendre la main,
c'est précisément créer une ligne `personal` portant ce `household_id`. Un test
qui **scanne les lecteurs** garde les deux et attrapera le prochain
(`household_plan_kind_readers_test.ts`), avec son cas passant du côté de
l'écrivain.

**Quatre défauts laissés ouverts, nommément.**

| # | Défaut | Où | Décision |
|---|---|---|---|
| ~~**O1**~~ | ~~Deux plans personnels **adjacents** qui couvrent ensemble toute la fenêtre ne prennent pas la main~~ | `household_hand.ts` | ✅ **refermé par C3 ⑤ le 2026-08-12** — `plansCoveringWindow` demande jour par jour, motif distinct `personal_plans_cover_window`, une entrée de trace par plan et une `issue` par personne. La règle n'a pas bougé : aucun jour découvert |
| ~~**O2**~~ | ~~**Aucune surface produit n'appelle `keel_validate_meal_plan`**~~ | ni front, ni edge | ✅ **refermé par L8 le 2026-08-12** (`TakeTheHandCard` + `validateMealPlan`, et la route `/app/plan` élargie au foyer). ⚠️ Une DEUXIÈME porte reste fermée, hors L8: un secondaire n'a pas de coach, donc `generate-meal-v1` lui rend `no_coach` — voir §L8, « ce qui n'est pas prouvé » |
| **O3** | La réponse HTTP ne porte pas `hand` — l'exclusion n'y est lisible que par un id opaque dans `issues` | `generate-household-meal-v1/index.ts:1982` | **L8** en aura besoin pour dire *pourquoi* on cuisine pour un de moins. *L4 a rendu `merge` dans la réponse, pas `hand`: la fenêtre fusionnée et le barreau ne se déduisent de rien d'autre.* |
| **O4** | Un `reference_member_id` déclaré qui prend la main est écarté **en silence** | `household_composition.ts:110-119` | Mineur, reconstructible par `hand.taken`. Non exercé aujourd'hui (`reference_member_id` est NULL partout) |

**Ce qui n'est pas prouvé** : que les allergies ne suivent pas l'exclusion — c'est
lu dans le code (`accountIds` est calculé **avant** le split) et confirmé par un
log (`"members":4,"accounts":2` alors qu'une bouche a pris la main), mais aucun
allergène réel n'a été posé sur la personne exclue.

## L4, ce qui est construit — 2026-08-12

> ⚠️ **Rien n'a été exercé en conditions réelles.** Aucun appel HTTP, aucune
> génération modèle. Tout ce qui suit est prouvé par des tests purs, des tests de
> position sur la source, et 13 mutations. La campagne réelle est L10.

**Aucune migration.** Toute la provenance vit dans `generated_from`, qui est déjà
`jsonb`. C'est l'option la plus réversible : une clé jsonb se retire, une colonne
se migre. Vérifié en base : les six colonnes lues par la fusion existent toutes.

### L'architecture, et pourquoi

La fusion est une **opération de `generate-household-meal-v1`**
(`operation: "merge"`), pas une seconde fonction edge. Elle exige exactement les
mêmes préconditions que la composition — le gel 402 (L1), la résolution du foyer
et le droit du maître, l'union des allergies, le plafond de bouches, les deux
axes de version — et une seconde fonction aurait dupliqué cinq gardes. `compose`
reste le **défaut** : le front, qui n'envoie pas `operation`, est inchangé.

| Où | Quoi |
|---|---|
| `_shared/keel/household_merge.ts` | Le moteur PUR : intersection (D15), pivot (D16), échelle (D6), provenance, bloc de consigne |
| `_shared/keel/household_portions.ts:125` | `SERVING_DIRECTION` exporté, **lu** axe par axe (`readServingDemands`) et jamais recopié |
| `_shared/keel/household_portions.ts:415` | `buildPortionBrief(members, cooking)` — la ligne « combien de plats » devient une variable |
| `_shared/keel/household_hand.ts:275` | `resolveHandOff({…, reclaimed})` — la reprise passe par le **seul** endroit qui décide qui est à table |
| `generate-household-meal-v1/index.ts:267-514` | `RosterRow` + `resolveMergeRequest` — tous les refus, avant toute dépense |
| `generate-household-meal-v1/index.ts:1919` | `generated_from.household.merge.merged_from` |

### L'échelle (D6), et le critère qui la fait descendre

Le critère d'abandon est **vérifiable** : les six directions de service se lisent
en trois axes (protéine · féculent · légumes) et cinq niveaux
(`smaller` < `moderate` < `balanced` < `full` < `larger`). La règle tient en une
phrase — **une casserole déjà composée peut toujours en donner moins, jamais plus
qu'elle n'en contient** :

- une demande à `balanced` ou en dessous est **toujours** servable ;
- une demande au-dessus exige que quelqu'un **à cette table** la porte déjà.

Cas phare, et il tombe au barreau ② : père seul en `fat_loss`, fils en
`muscle_gain` qui revient. Le fils demande `larger` en protéine **et** en
féculent ; la table plafonne à `full` et `smaller`. Ce n'est **pas** le même
arbitrage qu'une composition où les deux sont là dès le départ — là, le plat est
dimensionné pour les deux. C'est toute la différence entre composer et fusionner.

② → ③ **n'est spécifié nulle part** dans ce registre. Le seul fait vérifiable
disponible dans les deux plans est leur **jour de cuisson** : deux plans qui ne
cuisinent jamais le même jour ne peuvent pas partager une session. Quand l'un des
deux ne cuisine pas du tout, on reste au barreau ② — descendre à ③ dirait au
modèle d'ouvrir une session qui n'existe nulle part.

### Ce que la fusion n'écrase jamais

Le plan **personnel** du secondaire. La fusion écrit une ligne neuve sur le
compte du **maître** (`plan_kind = 'household'`), et `write_student_meal_plan` ne
touche que les lignes de `p_user_id` **et** de la même nature : la ligne du
secondaire est hors de portée **par construction**, pas par condition. C'est ce
qui rend la défusion de D8 possible.

Le mécanisme de D16 est le même : quand la fusion commence **après** le plan du
foyer, l'intention devient `prepare_next`, et c'est la boucle de chevauchement de
la RPC qui **tronque** l'ancien plan. « Hors intersection, chacun garde ce qu'il
avait » n'est donc pas une intention, c'est un effet mécanique.

### Les versions de prompt — les deux axes bougent, chacun pour sa moitié

- **`MEAL_PROMPT_VERSION` → `meal.en.v9_cooking_shape`.** C'est le bump que v8
  annonçait comme dû. `buildPortionBrief` disait à toute composition de foyer,
  sans condition : *« Cook ONE set of preparations for everyone. Do NOT propose
  separate dishes. »* Les barreaux ② et ③ en ont besoin comme variable : c'est un
  changement de **contrat**, et il vit dans le tronc. La lane individuelle change
  de numéro sans changer de consigne — prix nommé d'avance.
- **`HOUSEHOLD_PROMPT_VERSION` → `v3_merge`.** Un bloc de plus, entre la présence
  et l'envie. Les règles de maison restent en **dernier**.
- **Une composition ordinaire rend le prompt de v2 à l'octet près**, et un test
  le tient.

### Les refus, tous décidables sans le modèle

`unknown_operation` · `merge_member_required` · `merge_member_not_in_household` ·
`merge_member_is_owner` · `merge_member_has_no_plan` · `merge_no_household_plan` ·
`merge_windows_disjoint` · `merge_window_all_past` · `merge_window_unreadable` ·
`merge_plan_vanished` · `merge_member_away_all_window`.

Un test de position les garde **par la source** : en HTTP, un refus tardif est
indiscernable d'un refus précoce — il est juste, et c'est ce qui le rend
invisible.

### Ce qui est réduit, et assumé

| Réduction | Pourquoi | Ce que ça coûte |
|---|---|---|
| **Une fusion reprend UN plan** par appel | Grouper déciderait à la place de D10 (« manuelle, sur proposition ») | Les autres plans qui mordent sont tracés (`merge_other_overlapping_plan:<id>`), jamais silencieux |
| **Le barreau se décide pour la table entière**, pas par créneau | D6 dit « forcerait **quelqu'un** hors de sa direction », pas « ce jour-là » | Un seul créneau incompatible fait descendre toute la fenêtre d'un barreau |
| **Le modèle exécute le barreau, il ne le choisit pas** | « Critère vérifiable, pas jugement de goût » | La séparabilité réelle du plat (D5) n'est pas vérifiée : le critère ne parle que des directions |
| ~~**O1 n'est pas tranché**~~ | Il concerne la prise de main, pas la fusion | ✅ **tranché par C3 ⑤ le 2026-08-12**, et à sa place — dans `household_hand.ts`, pas dans le moteur de fusion |

### Ce qui n'est pas prouvé, et ce qui est ouvert

1. **Aucun run réel.** Pas un appel HTTP, pas une génération. Le barreau ② et ③
   n'ont jamais été lus par un modèle : on ne sait pas s'il tient « deux plats,
   une session ».
2. ~~**La fusion n'est pas COLLANTE.**~~ **Refermé par L5 le 2026-08-12** —
   `merged_from` est relu sur le plan du foyer vivant, comparé à la
   `validated_at` d'aujourd'hui, et qui n'a pas revalidé depuis est re-repris à
   la composition. Prouvé par tests purs, tests de position et mutations —
   **pas par un run réel**.
3. **O2 tient toujours** : aucune surface produit n'appelle
   `keel_validate_meal_plan`, donc la prise de main — et donc la fusion — reste
   inatteignable par un vrai utilisateur.
4. **Un rouge PRÉEXISTANT réparé en passant** : 7 tests de
   `household_turn_context_test.ts` étaient rouges au HEAD. Le décor n'écrivait
   pas `plan_kind`, que le chargeur filtre depuis L3 — un décor qui ment sur la
   forme de la donnée **fabriquait** le défaut. Corrigé, 21/21 verts.
5. **Deux rouges préexistants NON touchés** : `chat/recent_history_test.ts` (2
   tests) et une erreur de typage dans `action_occurrences_test.ts`. Aucun des
   deux fichiers n'appartient à ce lot.

## L4, l'aval — ce que le premier run réel a trouvé (2026-08-12)

> Le moteur **décidait** juste : l'échelle D6, l'intersection D15, le pivot D16
> et `merged_from` sont tous prouvés en réel. C'est la **chaîne en aval** qui ne
> savait pas exécuter sa décision. Trois défauts, mesurés, tous corrigés ; deux
> défauts mécaniques ; une branche documentée.

| # | Ce qui était mesuré | Ce qui a changé |
|---|---|---|
| **1** | Le modèle a rendu `prep_zoe_tuna_pasta` avec `servings_made: 1`, **obéissant** aux barreaux ②/③ — le parseur l'a jeté, puis a jeté le lien du plat qui la citait. **En base, le plat de la personne fusionnée existait comme un titre nu**, rattaché à aucune préparation et à aucune session | La garde devient **conditionnelle** : une préparation d'une portion est le cas **nominal** aux barreaux ②/③, et reste jetée partout ailleurs (`meal_generation.ts`, garde de `servings_made`). Le paramètre est **REQUIS** (`merge: MergedEater \| null`) : les deux lanes ont dû choisir, le compilateur les a listées |
| **2** | Le prompt annonçait « au plus 15 plats » **et** « donne-lui un SECOND plat ». Le modèle en a rendu 16, le parseur a jeté le dernier — **le dîner du dimanche du foyer**, pas le plat en trop | Le plafond connaît la bouche reprise (`dishBudgetFor`). Le supplément se **lit** sur la consigne : ① → **0** (« Do NOT propose separate dishes »), ②/③ → le nombre de plats propres réellement **montrés** au modèle (`mergeMaterialShown`, plancher 1 pour le « SECOND dish », plafonné au budget de base). Prompt et parse passent par la **même** fonction |
| **3** | Barreau ③ demandé ; le modèle a rendu 15 plats, aucun second plat, aucune session dédiée, et a servi la personne depuis la casserole commune. **L'archive disait `separate_sessions`, le plan disait le contraire, dans la même ligne** | `observeMergeShape` **constate** après le parse : deux marques structurelles (préparation d'une portion ; deux plats au même jour+moment). Une `issue` nommée `merge_shape_not_honoured:<barreau>`, et `generated_from.household.merge.honoured` porte **demandé** et **obtenu** côte à côte. **On ne corrige pas** : refuser ou relancer serait un choix de produit que personne n'a pris |
| **4** | `merge_member_away_all_window` était le **seul** refus de fusion muet — trois `merge_refused` dans les logs du runtime, aucun pour lui | Aligné sur le même `tag` et la même forme que les dix autres |
| **5** | Un commentaire nommait `household_merge_position_test.ts`, **fichier qui n'a jamais existé** | Corrigé, et un test refuse désormais **tout** nom de fichier de test introuvable cité dans le générateur |
| **6** | — | `merge_window_unreadable` est **structurellement inatteignable** depuis une base valide (`starts_on NOT NULL`, `duration_days between 1 and 7`). Écrit à côté du refus : c'est une branche **défensive**, pas un refus qu'un appelant peut recevoir. Elle reste |

**Le constat, calibré sur les deux vraies lignes.** Les deux plans de fusion du
run réel sont en base (`+household.v3_merge`), et ils portent **15 plats
chacun** — exactement le plafond de base, jamais dépassé — avec un
`servings_made` **minimum de 3** : aucune préparation d'une portion n'a survécu.
Passés dans `observeMergeShape`, ils se séparent comme le run l'a décrit : le
plan ② porte **une** case jour+moment doublée (le plat dédié existait, en titre
nu — c'est le défaut 1), donc `dedicated_dish` ; le plan ③ n'en porte **aucune**
et aucune préparation solo, donc `common_pot` et
`merge_shape_not_honoured:separate_sessions`. Le constat ne dit ni oui à tout ni
non à tout.

**Les versions.** `HOUSEHOLD_PROMPT_VERSION` bump **v3_merge → v4_merge_budget** ;
`MEAL_PROMPT_VERSION` **ne bouge pas**. La règle appliquée est « quelle
population voit une consigne différente », pas « où vit le code » : la lane
individuelle et la composition de foyer ordinaire rendent un prompt
**byte-identique** (`merge: null` est l'identité, et deux tests le tiennent) ;
seule une **fusion** voit la ligne « at most N dishes » changer de nombre, et une
fusion n'existe que sur la lane foyer.

**Ce qui reste ouvert après ce lot :**

1. **Le constat ne distingue pas ② de ③.** Il répond à « cette personne a-t-elle
   quelque chose à elle, oui ou non ». Vérifier que la session dédiée de ③
   existe vraiment demanderait de rattacher chaque préparation à sa session et
   de comparer les jours — faisable, non fait.
   ⚠️ **C3 ⑥ a changé la QUESTION, pas cette réponse-là** : il répond désormais
   « **à combien de SES repas**, sur combien », et `observed` a trois états.
   Séparer ② de ③ reste ouvert.
2. **Le budget de SESSIONS ne suit pas le bonus de fusion**, exprès : ② promet
   « one session at the stove, two dishes out of it », et le gonfler
   contredirait la consigne dans le même message. ③ prend sa session dans un
   budget qui est un **plafond** et non une cible. Si un run montre que ③ manque
   de place, la réparation est une ligne (`batchSessionBudget(baseCap)`).
3. **Quand le modèle déborde quand même, le parseur jette les DERNIERS plats.**
   Noté en commentaire là où c'est pertinent : c'est ce qui a fait disparaître le
   dimanche plutôt que le plat en trop. Réparer vraiment demanderait de choisir
   quel plat sacrifier — décision de produit non prise.
4. **`CookingSessions.tsx` affiche « — {n} servings »** sans pluriel : une
   préparation d'une portion s'y lira « — 1 servings ». Cosmétique, et l'écran de
   fusion appartient à **L8**.

## L4, la contre-épreuve — 2026-08-12, après correction

Les deux défauts d'aval ont été re-mesurés par **rejeu des octets réels** du run
défaillant : la réponse exacte du modèle qui contenait `prep_zoe_tuna_pasta`
(`servings_made: 1`) a été repassée au parseur d'aujourd'hui.

| Chemin | Résultat |
|---|---|
| `merge: null` (l'ancien) | préparation **jetée**, `unknown preparation … dropped`, `over the 15-dish cap … dropped` ⇒ plat en **titre nu** et **dîner du dimanche absent** |
| `one_session` / `separate_sessions` | **16 plats sur 16**, **7 préparations sur 7**, **aucune** `issue` ; la préparation d'une portion est présente et **référencée**, le dimanche est de retour |

Les deux défauts se reproduisent d'un côté et disparaissent de l'autre, sur les
**mêmes octets**. Le plafond annoncé au modèle a bien bougé, reconstitué mot pour
mot par les modules purs avec les entrées réelles : `at most 15 dishes` en
composition et au barreau ①, **`at most 20`** au barreau ② avec cinq plats montrés
— le reste du message étant identique. Et la composition ordinaire est
**byte-identique** à celle d'avant le lot, vérifiée en comparant les modules de
`HEAD` à ceux de l'arbre de travail.

### ⚠️ O5 — LE MODÈLE N'OBÉIT PAS AU BARREAU
> **Repris par C1 le 2026-08-12 — par une QUATRIÈME sortie, absente du tableau
> ci-dessous : ancrer la consigne sur le plan du foyer.** Voir §« C1 ». Ce qui
> suit reste l'état mesuré qui l'a motivée.

**Deux fusions réelles sur deux ont ignoré la consigne** : barreau ② demandé,
`common_pot` obtenu. Sur l'une d'elles, le modèle a recopié **les quinze titres de
plats du secondaire pour toute la tablée** — un foyer en `fat_loss` s'est vu servir
un plan de prise de masse. C'est exactement ce que le critère d'abandon de D6
existe pour interdire.

`observeMergeShape` le **constate** (`merge.honoured`, une `issue` nommée, un log)
et le constat a son cas passant : sur les octets du run où le modèle avait obéi, il
rend `honoured: true`. **Mais ce n'est qu'un constat** — le plan est écrit et servi.

Trois sorties, **aucune prise** :

| Sortie | Ce que ça donne |
|---|---|
| *Laisser* (état actuel) | le mensonge est visible dans `generated_from`, et personne ne le lit |
| **Refuser** la fusion, garder le plan précédent | le repli de L3 fonctionne déjà, et c'est le sens de « le repli est le refus » — mais le maître qui a demandé la fusion n'obtient rien |
| *Relancer* le modèle une fois, consigne plus ferme | coût inconnu, efficacité non mesurée |

Ce n'est pas une décision de code. **Elle attend l'utilisateur.**

### O6 — un plat rejeté ne rebouche jamais sa case
> **Rendu LISIBLE et NON HÉRITABLE par C2 le 2026-08-12 — pas rebouché.** La
> case vide est comptée (`empty_slots`, dans les `issues` et dans
> `generated_from`) et nommée au modèle par les blocs de fusion et de défusion,
> qui recopiaient le trou comme une intention. **Recomposer la case reste une
> décision de produit que personne n'a prise.** Voir §« C2 ④ ».

Sur une fusion, **les cinq petits-déjeuners du foyer sont tombés d'un coup** : le
plan personnel citait « whey protein 90 g », que le verrou de cible numérique lit
comme une cible de macro et qui fait rejeter le **plat entier**
(`meal_generation.ts:2160`). Le foyer s'est retrouvé sans aucun petit-déjeuner,
avec une ligne d'`issues` pour seul signal.

Le verrou est antérieur au lot et il est juste. Ce que la fusion change, c'est
qu'il devient atteignable par la **matière d'un plan personnel** qu'un tiers a
écrite. Rien ne recompose la case vide.

## L5, ce qui est construit — 2026-08-12

> ⚠️ **Rien n'a été exercé en conditions réelles.** Aucun appel HTTP, aucune
> génération modèle, aucune RPC sous vrai jeton. Tout ce qui suit est prouvé par
> des tests purs, des tests de position sur la source, un bloc de contrôle SQL
> rejoué et annulé, deux épreuves de RLS en transaction, et **23 mutations**. La
> campagne réelle est L10.

**Une migration**, `20260812160000_household_merge_settings.sql`, inscrite au
registre à la main (`supabase_migrations.schema_migrations`) parce que plusieurs
migrations d'autres sessions sont en fichier et absentes du registre : un
`migration up` les aurait appliquées à sa place.

### L'architecture, et pourquoi

| Où | Quoi |
|---|---|
| `_shared/keel/household_merge_notice.ts` | Le module PUR : relire `merged_from`, comparer les deux `validated_at` (D8), décider ce qu'on propose (D10) et ce qu'on masque (D17), reporter les reprises |
| `_shared/keel/household_merge_notice_io.ts` | Les deux lectures partagées : le plan du foyer vivant, et les réglages |
| `_shared/keel/household_merge.ts:224` | `bestMergePair` — **extrait** de `resolveMergeRequest`, désormais appelé par la proposition ET par la fusion |
| `_shared/keel/household_merge.ts:264` | `resolveTailWindow` — la queue d'un plan, **déléguée** à `resolveMergeWindow` |
| `_shared/keel/household_merge.ts:630` | `buildUnmergeBlock` — la consigne de D8, mot pour mot |
| `_shared/keel/household_hand.ts:316` | `resolveHandOff({…, excluded})` — la défusion passe par le **seul** endroit qui décide qui est à table |
| `household-merge-notices-v1/index.ts` | Le lecteur : un jeton, un foyer, le droit du maître. Aucune écriture, aucun modèle |
| `generate-household-meal-v1/index.ts:514` | `resolveUnmergeRequest` — tous les refus, avant toute dépense |
| `generate-household-meal-v1/index.ts:1093` | La fusion devient **collante** : `merged_from` relu, comparé, re-repris |

**La proposition n'a pas sa propre arithmétique**, et c'est la moitié qui compte.
`bestMergePair` est le seul endroit qui choisit la paire (plan du foyer, plan
personnel) et la fenêtre fusionnable ; le lecteur et le générateur l'appellent
tous les deux. Un second calcul aurait promis des jours que la fusion ne prend
pas — et les deux nombres auraient été plausibles.

### Les trois sorties de D8, nommément

| Sortie | Point d'entrée | Ce que ça fait |
|---|---|---|
| **Défusion** | `generate-household-meal-v1`, `operation: "unmerge"` + `unmerge_member_id` | Recompose la **queue** du plan du foyer (D16) sans la personne, avec la consigne « rester au plus près du plan de base, sans user X » |
| **Refusionner** | `operation: "merge"` + `merge_member_id` — **existait déjà** | `bestMergePair` prend le plan validé le plus récent : aucune ligne de code neuve |
| **Refuser** | RPC `keel_household_dismiss_merge_notice(p_member, p_validated_at)` | Écarte **cette validation-là**. Une validation postérieure repose la question |

Dans les trois cas le plan personnel du secondaire est **hors de portée par
construction** : `write_student_meal_plan` ne touche que les lignes de
`p_user_id` (le maître) et de la même nature. Un test refuse plus d'un site
d'écriture dans le générateur.

### Sept arbitrages pris seuls, et pourquoi

| Décision | Écarté | Pourquoi | Retour arrière |
|---|---|---|---|
| **« Le plan de base » = le plan du foyer VIVANT** (donc, après une fusion, le plan fusionné) | le plan d'AVANT la fusion (`into_plan_id`, que L4 archive) | D8 dit que la défusion « préserve les courses déjà faites » ; les courses se font sur le plan que l'écran montre, et l'écran montre le plan vivant. Revenir au plan d'avant jetterait précisément ce que la phrase existe pour sauver. Le vivant est aussi **toujours lisible**, alors que `into_plan_id` manque sur tout plan écrit avant L4 | une lecture ; `generated_from.household.unmerge.base_plan_id` dit lequel a servi, ligne par ligne |
| **Le lecteur est une fonction edge à lui** | une `operation` de plus sur le générateur | On regroupe ce qui partage des **gardes**, pas ce qui partage un sujet. La fusion vit dans le générateur parce qu'elle exige ses cinq préconditions ; un lecteur n'en exige aucune, et l'y greffer ferait d'un générateur une porte qui parfois n'écrit pas | supprimer un répertoire |
| **`excluded` est REQUIS** sur `resolveHandOff` | un paramètre optionnel | Une défusion qui l'oublierait dépenserait un appel modèle pour rendre **exactement** le plan qu'elle voulait défaire. Le compilateur a listé les 15 appelants | une valeur par défaut |
| **« Refuser » est PERSISTÉ**, borné à un instant de validation | le prendre au mot (« ne rien faire ») | Sans borne, l'avertissement revient à chaque rechargement : « refuser » ne serait pas une sortie, ce serait un soupir. Avec une borne **par personne**, ce serait D17 déguisé, décidé sans que le maître l'ait demandé | `drop column` |
| **D17 ne coupe PAS l'avertissement de D8** | tout masquer | Une proposition parle du plan **d'un autre** — on peut ne plus vouloir l'entendre. Un avertissement parle du plan **du maître** : sa ligne vivante contient la reprise d'un plan que l'intéressé a remplacé. Le taire rendrait ce plan périmé invisible **et indéfaisable**, puisque la défusion se déclenche de là | une condition |
| **`merged_from` est REPORTÉ** sur chaque opération, et la clé `merge` s'écrit dès qu'un plan porte une reprise | ne l'écrire que sur une fusion | Le plan neuf remplace le vivant, donc sa provenance aussi : sans report, fusionner Zoé effacerait la reprise de Tom, et la composition d'après ré-excluerait Tom. Le **geste du jour** reste dans les clés qui suivent `merged_from`, absentes quand ce plan ne fait que reporter | une condition |
| **Le plan du foyer est filtré par `household_id`** en plus du propriétaire | le prédicat de L4 (propriétaire + `plan_kind`) | Un maître qui a changé de foyer aurait vu le plan vivant de l'**ancien** foyer proposé à la fusion du nouveau. Le resserrement va dans le sens sûr : au pire `merge_no_household_plan`, refus déjà nommé | une ligne |

**Une reprise vaut pour une FENÊTRE, pas pour toujours.** `merged_from` n'est
relu que sur les plans du foyer qui **mordent sur la fenêtre recomposée** :
composer la semaine suivante ne re-reprend personne, et le secondaire qui a un
plan à lui y est de nouveau exclu, comme le veut L3. C'est cohérent avec D10 —
le maître a dit oui pour **cette** semaine-là — et ça évite qu'un oui d'un jour
devienne un état permanent que personne ne se rappelle avoir posé.

### Le réglage (D17) — ce qu'il coupe, et ce qu'il ne peut pas couper

Table `household_merge_settings` (foyer, bouche) : `proposals_muted` et
`dismissed_validated_at`. **RLS active, `authenticated` n'a que `SELECT`**, et la
policy exige le rôle `owner` — un secondaire ne lit pas le réglage qui le vise.
Vérifié en base, en transaction annulée : le maître lit 1 ligne, un étranger 0,
**un secondaire du même foyer 0**. Les écritures passent par deux RPC gatées sur
`auth.uid()`, révoquées à `service_role` (une RPC gatée sur `auth.uid()` sous
`service_role` est un 200 qui n'écrit rien — mesuré sur `keel_validate_meal_plan`
le 2026-08-11).

**Le réglage ne peut pas bloquer la fusion**, et c'est tenu par un test de
source : le générateur ne nomme ni la table ni son chargeur, et le lecteur, lui,
DOIT les nommer — sans quoi la garde serait verte sur un produit où D17 n'existe
pas.

`keel_household_dismiss_merge_notice` **ne prend pas la date du client sur
parole** : elle la compare à la milliseconde à celle du plan vivant (lue par
`keel_household_roster_for`, la source unique) et refuse `notice_moved_on`
sinon. Un client qui pourrait écrire n'importe quelle date écrirait l'an 3000 et
obtiendrait D17 sans l'avoir choisi.

### Les versions de prompt

`HOUSEHOLD_PROMPT_VERSION` bump **v4_merge_budget → v5_unmerge** ;
`MEAL_PROMPT_VERSION` **ne bouge pas**. Règle de v4 appliquée telle quelle
(« quelle population voit une consigne différente ») : seule une **défusion** voit
le bloc neuf. La lane individuelle, la composition ordinaire **et la fusion**
rendent un prompt byte-identique à celui de v4, et trois tests le tiennent.

### Ce qui n'est pas prouvé, et ce qui reste ouvert

1. **Aucun run réel.** Le bloc de défusion n'a jamais été lu par un modèle. Et
   **O5 est un précédent qui concerne directement ce lot** : deux fusions réelles
   sur deux ont ignoré le barreau demandé. Rien ne dit que « reste au plus près du
   plan de base » sera mieux respecté que « cuisine deux plats » — et rien, ici,
   ne le **constate** : il n'y a pas d'équivalent d'`observeMergeShape` pour la
   défusion. C'est un choix : mesurer « ressemble au plan de base » demanderait un
   critère de ressemblance que personne n'a défini, et un mauvais critère salirait
   toutes les défusions.
2. **O2 TIENT TOUJOURS, et il ne peut PAS se refermer côté serveur.** Vérifié :
   aucune surface produit n'appelle `keel_validate_meal_plan` — ni le front, ni
   une fonction edge. Et la RPC est **révoquée à `service_role`** (migration
   20260811140000, exprès : `auth.uid()` y est NULL) : **aucune fonction edge ne
   peut la porter**. La gâchette est donc, structurellement, un appel PostgREST
   sous le jeton de l'élève — c'est-à-dire une ligne de L8. Tant qu'elle manque,
   rien n'est jamais proposé et ce lot entier est inatteignable par un vrai
   utilisateur.
3. ~~**La proposition ne prédit pas la présence.**~~ **Refermé par C3 ④ le
   2026-08-12.** L'objection écrite ici — « une fenêtre qui n'est pas encore
   celle d'un plan » — est tombée avec **L10 ①** : `bestMergePair` rend
   `recomposed`, la fenêtre que le geste **écrira**, et c'est celle-là même sur
   laquelle le générateur résout la présence
   (`daysToFill = windowDayOrder(recomposed)`). Le lecteur prédit donc par la
   **même** primitive (`memberMealCells`, extraite de `resolveWindowPresence`)
   et avec le **même** mot (`MERGE_MEMBER_AWAY_ALL_WINDOW`, constante partagée).
   Il coupe la **proposition** et jamais l'avertissement de D8 — même partage
   que D17 et que le plafond.
4. **`covers_window: false` est tracé, et rien n'agit dessus.** Une défusion peut
   sortir quelqu'un dont le plan personnel ne couvre pas tous les jours : il
   n'aura rien à manger ces jours-là. C'est le droit du maître (D8 : « refaire le
   plan du foyer SANS user X »), et le fait est écrit dans l'`issue`
   (`member_unmerged:<id>:uncovered`) et dans `generated_from.household.hand.unmerged`.
   Le dire à l'écran est L8.
5. ~~**Le plafond de L7 n'est pas posé, et le lecteur ne le connaît pas.**~~
   **Refermé par L7 le 2026-08-12** — `buildMergeNotices` prend un argument
   `quota` **requis**, une semaine pleine rend `skipped: merge_quota_exhausted`
   au lieu d'une proposition, et l'avertissement de D8 survit en perdant sa
   seule sortie `merge`.
6. **Deux rouges préexistants NON touchés**, comme à L4 : `chat/recent_history_test.ts`
   et une erreur de typage dans `action_occurrences_test.ts`. Aucun des deux
   fichiers n'appartient à ce lot. `deploy-manifest-check.mjs` était déjà rouge
   (53 violations, dont `generate-household-meal-v1` non déclaré) ; ce lot déclare
   sa propre fonction et le laisse à 52.

### Les 23 mutations — chacune cassée, vue rouge, restaurée

`excluded` désarmé · exclusion placée après la reprise · dates comparées en
chaînes · un revalidé qui tient quand même · le mute qui coupe l'avertissement ·
« refuser » rendu définitif · les jours reportés recopiés de l'ancien plan · la
consigne de défusion retirée · la queue réécrite à la main · `bestMergePair` qui
prend la plus courte · `excluded` retiré du générateur · report supprimé · sticky
vidé · le générateur qui lit les réglages · le lecteur qui écrit · `plan_kind`
retiré du lecteur partagé · le bloc de défusion jamais greffé · la défusion qui
demande un second plat · le refus de défusion déplacé après le modèle ·
la proposition retombée sur « le dernier validé » · `dismiss_validated_at`
confondu avec la date du plan montré · `INSERT` rendu à `authenticated`
(contrôle SQL) · la policy contournée par un tiers (RLS, deux sens).

**Un second défaut trouvé en RELECTURE, avant toute mutation.** La proposition
ne regardait que le plan **le plus récemment validé**, alors que la fusion
regarde **tous** les plans vivants de la personne. La contrainte d'exclusion
n'interdit que le chevauchement, pas l'adjacence: Zoé valide le 12 un plan pour
cette semaine, puis le 14 un plan pour la suivante, et la proposition
n'annonçait alors **rien du tout** pendant que la fusion aurait parfaitement
repris celui de cette semaine. Corrigé — même entrée des deux côtés — et deux
champs distincts en sortie, parce qu'ils ne portent pas la même date:
`plan.validated_at` (le plan qu'une fusion prendrait) et `dismiss_validated_at`
(ce que `keel_household_dismiss_merge_notice` exige). Les confondre ferait
refuser `notice_moved_on` en boucle sans que rien ne l'explique.

**Une mutation a trouvé un faux-vert, et il était PRÉEXISTANT.** Inverser le
critère de `bestMergePair` — prendre la fenêtre la plus **courte** — ne faisait
tomber aucun test : la règle vivait dans une boucle du générateur qu'aucun décor
n'exerçait à plus d'une paire. Depuis L5 elle est **partagée avec la
proposition**, ce qui aurait rendu l'erreur cohérente des deux côtés, donc
invisible, et pas moins fausse : le maître se serait vu proposer un jour au lieu
de cinq. Trois tests ont été ajoutés (`household_merge_test.ts`), et la mutation
est désormais rouge.

## L5, la contre-épreuve — 2026-08-12, quatre défauts mesurés en HTTP

> Quatre défauts, **une seule racine** : quand plusieurs lignes sont vivantes en
> même temps, le code prenait « la première » ou « la plus récente » au lieu de
> prendre **celle dont il parle**. C'est le piège que `bestMergePair` avait fermé
> du côté de la proposition, et qui était resté ouvert partout ailleurs.
>
> ⚠️ **Aucun run réel dans ce lot-ci non plus.** Tout ce qui suit est prouvé par
> des tests purs, des tests de position, et **11 mutations**. Suite keel :
> 2 439 verts.

### Le fait qui rend les quatre possibles

**Deux plans du foyer sont vivants en même temps par contrat** — le courant et le
suivant, ce que `prepare_next` produit, et rien ne retire un plan passé. Les deux
portent **la même** reprise, parce que le report la recopie d'un plan à l'autre
(`carryMergedFrom`). Et `loadLiveHouseholdPlans` trie `starts_on` **croissant** :
« le premier » est donc **le plus ancien**.

Symétriquement, **une bouche peut porter deux plans personnels vivants** : la
contrainte d'exclusion (`student_generated_meals_live_windows_dont_overlap`,
scopée `user_id + plan_kind`) n'interdit que le chevauchement, pas l'adjacence.
« Le plus récemment validé » n'est donc pas « celui qu'on a fusionné ».

### ① P0 — la fusion se défaisait seule, et l'alerte D8 criait au loup

`mergeStandings` comparait la date archivée dans `merged_from[].validated_at` à
la validation **la plus récente de tous les plans vivants** du membre. Mesuré :
fusion du plan validé à 04:29:47,614 ; Zoé porte aussi un plan validé à
04:29:48,755, **disjoint** du plan du foyer donc jamais fusionnable ; lecture
immédiate ⇒ `merged_plan_revalidated`, `held: []`, puis un `compose` ré-excluait
Zoé (`servings` 3 → 2). Deux dégâts, et il fallait les deux : la fusion cessait
d'être collante **et** l'alerte était fausse, donc indiscernable d'une vraie.

La comparaison porte désormais sur **le plan retrouvé par son id**
(`merged_from[].plan_id`), dans `household_merge_notice.ts:mergeStandings`.

**Le cas limite — le plan fusionné n'est plus vivant — a sa propre réponse, et
elle est double.** `write_student_meal_plan` **retire** la ligne d'avant et en
écrit une neuve : l'id change. « Le plan fusionné a disparu » est donc le cas
**canonique** de D8, pas une bizarrerie. Mais il ne suffit pas : le plan peut
avoir disparu sans que rien de neuf n'ait été validé.

| État | Quand | `warn` | `hold` |
|---|---|---|---|
| `still_merged` | le plan fusionné est là, même validation | non | **oui** |
| `revalidated_after_merge` | il est là, validation postérieure | **oui** | non |
| `merged_plan_replaced` | il a disparu **et** quelque chose de plus récent est validé | **oui** | non |
| `merged_plan_no_longer_live` | il a disparu, **rien** de plus récent | non | non |
| `no_live_personal_plan` | plus aucun plan à elle | non | non |
| `merge_date_unreadable` | archive sans date (inatteignable) | non | oui |

`merged_plan_no_longer_live` n'avertit pas parce que « elle a validé un nouveau
plan après votre fusion » serait **faux**, et c'est cette fausse alerte-là qui a
été mesurée. Ne pas tenir y est **sans conséquence** : la contrainte d'exclusion
interdit qu'un autre plan vivant couvre les jours du plan disparu, donc plus rien
ne retire cette bouche de la table — L3 la compose d'office.

`latestValidated` sert **encore, mais seulement quand le plan fusionné a
disparu** : c'est là, et seulement là, que « a-t-elle validé quelque chose
depuis ? » est la bonne question.

### ②③④ — un seul choix, fait à un seul endroit

`mergeCarriers` (`household_merge_notice.ts`) est désormais **le seul endroit qui
choisit** quel plan du foyer vivant parle pour une bouche. Trois appelants :
le lecteur (`buildMergeNotices`), la défusion (`resolveUnmergeRequest`), et la
composition ordinaire (`priorMergedFrom`).

| # | Où c'était | Ce que ça donnait |
|---|---|---|
| **②** | `generate-household-meal-v1/index.ts` — `.find()` sur la liste triée | `unmerge` rendait **409 `unmerge_window_all_past`** sur le plan périmé pendant que le lecteur offrait le bouton. Le maître n'avait **aucun** moyen de défaire la reprise sur son plan courant |
| **③** | `household-merge-notices-v1/index.ts` — dédoublonnage « premier arrivé » | `merged.validated_at` rendait `2026-08-05T10:00:00`, la date d'un plan périmé, au lieu du geste réel |
| **④** | `held` calculé sur **tous** les plans vivants | annoncé comme « ce que la prochaine composition re-reprendra », faux dès que la fenêtre visée ne recouvre pas le plan porteur |

**Le critère de `mergeCarriers` n'est PAS celui de `bestMergePair`, et c'est
délibéré.** Fusionner cherche le plus de jours à reprendre ; défusionner et
re-reprendre portent sur la table **d'aujourd'hui**. Un plan dont il reste des
jours (D16) gagne toujours sur un plan consommé ; entre deux vivants, celui dont
la **queue commence le plus tôt**. Prendre « la queue la plus longue » ferait agir
la défusion sur la semaine **prochaine** dès qu'elle est plus longue que ce qu'il
reste de la semaine en cours — le cas le plus courant du produit.

### Quatre décisions prises seules

| Décision | Écarté | Pourquoi | Retour arrière |
|---|---|---|---|
| **Deux états distincts** pour « le plan fusionné a disparu » (`replaced` / `no_longer_live`) | un seul état | Un seul état devait choisir un `warn`, et les deux sens étaient faux : avertir toujours fabrique la fausse alerte mesurée, n'avertir jamais tue le cas **canonique** de D8 (le plan remplacé). La date tranche, et elle est déjà là | fusionner les deux constantes, une ligne |
| **`buildMergeNotices` ne prend plus `mergedFrom`** : il prend les plans du foyer **avec leur `generated_from`** et choisit lui-même | garder l'argument | Tant que l'appelant aplatissait la liste, il refaisait le choix — et c'est exactement là que ③ vivait. Le rendre indérivable de l'extérieur est la seule façon de ne pas le voir revenir | remettre l'argument ; le type `MergeCarrierPlan` reste |
| **`held` porte sa portée** (`{member_id, plan_id, window}`) au lieu d'une liste d'ids | aligner les deux ensembles en amont | Le lecteur **ne connaît pas** la fenêtre que le maître composera ensuite ; l'inventer serait un second avis sur une fenêtre, ce que ce lot refuse partout ailleurs. On rend donc explicite ce que le générateur fait déjà : `plansOverlap(plan, fenêtre)` puis `readMergedFrom` | reprojeter en `member_id[]`, une ligne — aucun consommateur aujourd'hui (L8 n'existe pas) |
| **La sortie `unmerge` disparaît quand le porteur n'a plus de queue** | l'offrir quand même | C'est le bouton que le geste refusait. `dismiss` reste, et `merge` aussi quand il y a matière : la proposition ne promet plus rien qu'un 409 vienne démentir | une condition |

### Les versions de prompt — aucune ne bouge, et voici pourquoi

`MEAL_PROMPT_VERSION` et `HOUSEHOLD_PROMPT_VERSION` (`v5_unmerge`) sont
**inchangées**. La règle de v4 est « quelle population voit une consigne
différente » : **aucune**. Ces quatre défauts sont dans le **choix des lignes**
lues en base, pas dans le texte envoyé au modèle — `buildMergeBlock`,
`buildUnmergeBlock`, le brief de portions et l'échelle sont intouchés, au
caractère près. Bumper aurait invalidé le cache d'une population entière pour un
prompt byte-identique.

### Les 11 mutations — chacune cassée, vue rouge, restaurée

La comparaison D8 retombée sur « le plus récemment validé » (**4 rouges**) · le
plan disparu sans rien de neuf qui avertit quand même (1) · le plan **remplacé**
qui n'avertit plus (6) · plus rien qui **tient** — le cas qui passe (5) · le
porteur redevenu « le premier de la liste » (2) · le porteur choisi sur la queue
la plus **longue** (1) · la sortie `unmerge` offerte sans queue (1) · `held` privé
de sa portée (2) · `held` nommant la mauvaise ligne (3) · la défusion revenue au
`.find()` (1) · le report revenu à « la première entrée trouvée » (1).

**Le motif à ne pas répéter, et il était déjà là.** Le fixture `TWO_PLANS`
existait depuis L5 et n'avait **jamais** été passé dans `buildMergeNotices` avec
une reprise : la garde de D8 n'avait donc jamais été éprouvée sur le cas que son
propre fichier documente trente lignes plus haut. Le test manquant est écrit
(`P0 — un SECOND plan adjacent, plus récent, ne défait pas la fusion`), avec son
**cas qui passe** de l'autre côté (`revalider CE plan-là avertit bien`) — sans
lui, on remplacerait un faux positif par un faux négatif, et « la fusion tient
toujours » ressemblerait trait pour trait à une garde qui marche.

## L6, ce qui est construit — 2026-08-12

> ⚠️ **Rien n'a été exercé en conditions réelles.** Aucun appel HTTP, aucune
> génération modèle. Tout ce qui suit est prouvé par des tests purs, des tests
> de position sur la source, des `SELECT` de lecture sur le corpus local, et
> **16 mutations**. Suite keel : **2 467 verts**. La campagne réelle est L10.

**Aucune migration.** Ce lot ne crée aucune colonne : la donnée existait déjà,
elle n'était lue que pour une personne sur N.

### Le trou, en une phrase

`reconcileFoodPreferencesFor` est **paramétré par utilisateur depuis le premier
jour**, et `generate-household-meal-v1` ne l'appelait que pour le **maître**. Le
« about you » d'un conjoint, d'un colocataire, d'un enfant majeur — tout ce
qu'ils avaient confirmé sur leur propre écran — n'atteignait jamais la
casserole. Un siège payé dont les préférences n'arrivent pas dans l'assiette
n'achète rien.

### L'architecture, et pourquoi

| Où | Quoi |
|---|---|
| `_shared/keel/household_voices.ts` | Le module PUR : le plafond par membre, la garde de non-divulgation, le bloc |
| `_shared/keel/household_voices_io.ts` | La lecture par titulaire — **une seule** requête `student_goals`, scopée `.in("user_id", …)` sur les comptes du roster |
| `_shared/keel/household_meal_generation.ts` | `voices` (REQUIS, `[]` = personne), le bloc entre la tablée et l'envie, `voiceIssues` rendu |
| `generate-household-meal-v1/index.ts` | `voiceMembers` sur `platedMembers`, `foodPreferences: []` au tronc, `generated_from.household.voices` |

**Aucun second pont vers la mémoire, et c'est le piège nommé du lot.** Ce lot ne
lit ni `memory_items`, ni `memory_v2`, ni le recall : il fait passer le pont
existant (`food_preference_promotion`, « Keep » explicite, cinq clés de domaine)
par **toutes les bouches au lieu d'une seule**. Un test l'interdit nommément,
avec son cas passant du côté du chargeur.

**Une seule porte, et elle garde.** Les mots du **maître** quittent
`-- WHAT THEY HAVE TOLD ME --` du tronc (`foodPreferences: []` sur cette lane)
pour rejoindre le bloc des voix sous son prénom. C'est l'arbitrage central du
lot : laisser le maître passer par le tronc aurait fait deux chemins pour la
même donnée, **dont un seul gardé et plafonné**, et le jour où la garde bouge
rien n'échouerait. Une mutation le vérifie (rouvrir le chemin direct ⇒ rouge).

### Le plafond — 150 tokens par membre

Le nombre vient d'une **mesure**, pas d'une intuition (corpus local, 10 comptes,
36 lignes gardées) :

| | |
|---|---|
| ligne la plus longue | 120 car. · moyenne 52 · p90 77 |
| titulaire le plus bavard | 6 lignes, 361 car. ⇒ **~110 tokens** avec les préfixes de date |
| plafond retenu | **150 tokens** (≈ 36 % de marge au-dessus du pire cas réel) |

**Ce que ça pèse vraiment**, bloc reconstruit sur les vraies lignes : un foyer de
4 comptes (les 4 plus bavards du corpus) rend **1 897 car. ≈ 475 tokens, zéro
coupe** — contre un prompt mesuré en production à ~11 400 + ~3 300 car., soit
~3 700 tokens. Le pire cas **structurel** (8 bouches, le plafond de sièges en
base) est borné à ~1 260 tokens. Avant ce lot, rien ne le bornait.

**Il est PAR MEMBRE, et pas seulement global** — un plafond global se ferait
manger par la première personne du roster et les suivantes disparaîtraient en
silence : le siège payé d'un secondaire dépendrait de l'ordre des lignes en base.
La mutation « plafond rendu global » a trouvé un **faux-vert** dans le test qui
gardait précisément ça (le premier membre laissait 6 tokens de rab, la ligne
courte du second passait quand même) ; les nombres du décor ont été refaits pour
que le premier membre épuise le budget **exactement**.

**Ce qui est coupé est tracé** : `voice_line_withheld:<membre>:<catégorie>` et
`voice_over_cap:<membre>:<n>` dans les `issues` du plan, plus
`generated_from.household.voices` (`accounts_at_table` · `heard` · **`lines_in`
· `lines_used`** · `withheld` · `over_cap` · **`per_member`**). Sans lui, « son
about-you n'a servi à rien » et « il n'avait rien confirmé » laissent la même
trace. `lines_used` est le seul nombre qui dise **ce que le modèle a vu**.

Il coupe **par la queue**, donc par le plus ancien : la liste arrive triée du
plus récent au plus ancien (`foodPreferencesForPrompt`), et il **s'arrête** au
premier dépassement (`break`) — il ne repêche pas une ligne plus vieille parce
qu'elle est plus courte. Une ligne plus longue que le plafond tombe **entière**
et fait taire ce qui la suit — on ne tronque pas une préférence, une phrase
amputée peut inverser son sens (« ne mange pas de porc, sauf … »). Même posture
que `sanitizePortionNote`.

### La garde de non-divulgation, étendue à l'ENTRÉE

**La même liste que la sortie** (`FORBIDDEN_PORTION_TERMS`), le même moteur
(`forbidden_matcher.ts`), le même réglage absolu (`allowNegatedMentions: false`).
Aucune seconde liste : c'est le doublon que `forbidden_matcher.ts` documente en
tête de fichier comme sa raison d'être, et « jamais de matcher maison » vaut ici
aussi.

**Le bruit, mesuré AVANT d'écrire le code** : les 36 lignes réelles du corpus
passées dans la garde ⇒ **0 morsure**. Sur 12 lignes adverses écrites à la main,
5 mordent et doivent mordre (« repris son régime », « 1800 calories », « lose
weight », « perdre du poids », « objectif … prise de masse »).

| | |
|---|---|
| **Ce qui passe** | « il n'aime pas le poisson », « batch cooking le dimanche », « saute le petit-déjeuner », « travaille de nuit » — dans les **deux langues**, et c'est la moitié qui rend la garde discernable d'une garde qui coupe tout |
| **Ce qui est coupé** | tout ce qui dit **pourquoi** quelqu'un mange autrement : objectif, régime, calories, poids, corps |

Et le bloc **porte sa propre consigne**, en dernier (un modèle lit la contrainte
la plus proche de la fin comme la plus contraignante) : *ne cite jamais ces
lignes, ne dis jamais de qui vient quoi — ce plan est lu à voix haute par tout le
foyer*. C'est la même famille de risque que le `why` des plats, que L4 refuse
d'envoyer au prompt de fusion pour exactement cette raison.

> ⚠️ **Ce paragraphe a été corrigé le 2026-08-12 — voir « Les quatre défauts
> de bord » plus bas.** La liste des voix est désormais **dérivée** de celle des
> portions (`FORBIDDEN_VOICE_TERMS`) : `age` en moins, le registre TCA en plus.
> « Végétarien depuis 5 ans » **passe**, dans les deux langues.

**Un trou connu, hérité, non refermé** : l'écho numérique nu (« il fait 1m90 et
95 kg », « Zoe is 32 and eats late ») n'est mordu par personne — mesuré, ces
lignes passent. Ce n'est pas un défaut de ce lot (le commentaire de
`FORBIDDEN_PORTION_TERMS` le nomme déjà), et le corps de chaque membre est de
toute façon **déjà** donné au modèle par le brief de portions.

### Ce que ce lot NE lit pas, et pourquoi

`platedMembers`, pas `members` : après les filtres de L3 (prise de main) **et**
de L2 (présence). Qui n'est pas à cette table n'a pas à être lu — faire pencher
la casserole du foyer vers le goût de quelqu'un qui mange son propre plan est
exactement le défaut que L3 a fermé sur les portions. **Conséquence assumée** :
un maître absent toute la fenêtre n'a pas de voix dans ce plan-là, alors que son
rythme de repas et sa capacité de cuisine continuent, eux, de le gouverner.

Une **bouche sans compte** n'a rien à lire (D3) : pas de `student_goals`, pas de
mémoire. Ce n'est pas un manque.

### Les versions de prompt

`HOUSEHOLD_PROMPT_VERSION` bump **v5_unmerge → v6_voices** ;
`MEAL_PROMPT_VERSION` **ne bouge pas**. Règle de v4 appliquée telle quelle
(« quelle population voit une consigne différente ») :

- **lane individuelle** — inchangée à l'octet près. Elle n'a qu'un titulaire et
  son plan n'est lu par personne d'autre : ni le plafond par membre ni la garde
  de table n'y ont d'objet, et elle continue de passer `foodPreferences` au
  tronc. Deux tests le tiennent, dont un qui a été **renforcé après une mutation
  faux-verte** (`includes("foodPreferencesForPrompt")` restait vrai en vidant le
  corps de la fonction : la ligne d'import suffisait).
- **foyer, personne n'a rien confirmé** — prompt byte-identique à v5, et un test
  le tient. C'est le chemin majoritaire (« l'entrée du produit est à 1 »).
- **foyer, au moins une bouche a confirmé** — consigne changée. C'est le premier
  bump qui touche la composition **ordinaire**, et c'est la règle, pas une
  entorse.

### Les 16 mutations — chacune cassée, vue rouge, restaurée

Garde désarmée · coupe non tracée · plafond désarmé · plafond rendu **global** ·
plafond qui coupe par la **tête** · bloc des voix retiré du prompt · bloc placé
**après** les règles de maison · version non bumpée · voix lues sur tout le
roster · coupes non écrites dans les `issues` · échec de lecture non tracé · voix
chargées mais jamais passées au prompt · lecture **non scopée** des lignes
d'autrui · maître relu malgré ses contraintes en main · lane individuelle
débranchée (le cas qui passe) · chemin direct rouvert dans le générateur du
foyer.

**Deux faux-verts trouvés par ces mutations**, tous deux réparés et re-mutés :
le test du plafond par membre (décor trop lâche) et le test de la lane
individuelle (`includes` sur un nom encore présent dans un import mort).

### Ce qui n'est pas prouvé, et ce qui reste ouvert

1. **Aucun run réel.** Le bloc n'a jamais été lu par un modèle. **O5 est un
   précédent qui concerne directement ce lot** : deux fusions réelles sur deux
   ont ignoré la consigne qu'on leur donnait. Rien ne dit que « ne cite jamais
   ces lignes » sera mieux respecté — et rien, ici, ne le **constate** : il n'y a
   pas d'équivalent d'`observeMergeShape` pour la divulgation. Écrire un
   détecteur de fuite sur le `why` d'un plat demanderait de décider qu'une phrase
   « parle de quelqu'un », un jugement qu'on ferait mal.
2. **Le coût N'A PAS été mesuré en réel.** Ce lot fait passer la lecture de
   préférences de 1 à N par génération (1 `SELECT` groupé + jusqu'à 3 lectures
   par titulaire dans le pont). Le log `keel.household_meal.member_voices` le
   rend observable ; personne ne l'a encore vu tourner.
3. **La réconciliation d'un secondaire ÉCRIT sur sa ligne**, déclenchée par le
   geste du maître. C'est une **correction** (elle retire ce que le memorizer a
   démenti), jamais un ajout, et c'est la posture écrite du pont — mais c'est un
   effet de bord sur le compte d'un tiers, et il est nommé ici plutôt que
   découvert plus tard.
4. **Un maître absent toute la fenêtre perd sa voix** (voir ci-dessus). Direction
   d'erreur sûre, non tranchée par le registre.
5. **`deploy-manifest-check`** reste à **52** violations, comme après L5 : ce lot
   n'en ajoute aucune.
6. ⚠️ **Corrigé par C3 ② le 2026-08-12** (migration `20260812210000`,
   `keel_write_food_preferences`) : écriture CIBLÉE sur les deux seules clés de
   ce module, concurrence optimiste dans le PRÉDICAT de l'`update`. Ce qui
   suit reste l'état mesuré qui l'a motivée — et `updated_at` n'est
   volontairement **pas** préservé, voir §C3 ②.
   **Le chemin d'écriture des préférences n'a AUCUNE concurrence optimiste, et
   L6 le fait passer de 1 à N titulaires.** `food_preference_promotion_io.ts`
   écrase `practical_constraints` **en entier**, reconstruite à partir d'une
   copie lue ~10 ms plus tôt **dans la requête de quelqu'un d'autre** : ni
   `updated_at` comparé, ni version, ni écriture par clé jsonb. Si le titulaire
   concerné modifie son rythme de repas ou sa capacité de cuisine dans cet
   intervalle, sa modification est perdue sans un mot. Et `student_goals.
   updated_at` **du secondaire bouge quand le MAÎTRE compose** — un lecteur qui
   prend cette colonne pour « la dernière fois que cette personne s'est occupée
   de son alimentation » se trompe désormais de personne. **Aucun des deux n'est
   créé par L6** : ce qui change, c'est l'échelle, de « le maître écrit sur sa
   propre ligne » à « le maître écrit sur celle de tout le monde ». La
   correction demande une **migration** (jeton de version, ou écriture ciblée
   sur la seule clé `food_preferences`) et appartient à un autre lot ; la
   rustine « relire juste avant d'écrire » ne ferme pas la fenêtre, elle la
   rétrécit. Écrit aussi en tête de
   `_shared/keel/food_preference_promotion_io.ts`.

### Les quatre défauts de bord — corrigés le 2026-08-12

> Mesurés en **HTTP réel** sur L6. **Le point de sécurité a tenu** : aucune
> ligne divulgante n'a atteint le prompt ni le plan, au caractère près. Ce sont
> les **bords** qui cédaient. Correctifs prouvés par tests purs, `SELECT` de
> lecture et **6 mutations** ; aucun run modèle.

| | Défaut | Correctif |
|---|---|---|
| **F2** | Le plafond faisait `continue` là où son propre commentaire promettait de s'**arrêter**. Mesuré sur un plan réel : `08-11 ✓ 08-10 ✓ 08-09 ✓ 08-08 ✓ 08-07 ✗ 08-06 ✗ **08-05 ✓**` — la plus ancienne sauvée par sa brièveté. **Son test était faux-vert** : ses 8 lignes étaient de longueur **identique**, où `break` et `continue` sont indiscernables. | `break`. Décor du test refait avec des longueurs divergentes (`break` → 5 gardées / 3 tombées ; `continue` → 7 / 1). |
| **F1** | Les deux compteurs de `generated_from.household.voices` comptaient des **`issues`** : 1 ligne retenue ⇒ `withheld: 3` (3 formes de surface), 2 lignes tombées ⇒ `over_cap: 1` (une `issue` portant `:2`). Gonflé et dégonflé **en sens inverses**. Et **aucune trace ne disait combien de lignes le modèle avait vues**. | Les compteurs viennent du module, comptés là où les lignes passent. Ajout de `lines_in`, `lines_used` et `per_member`. Le log `member_voices` renomme `lines` → `lines_raw`, et un log `voices_used` part **avant** l'appel modèle (donc même sur un 422). |
| **F3** | `voice_line_withheld:<membre>:<motif>` nommait la **forme de surface** (`kcal`, `tour de taille`, `prise de masse`, `ans`) : vocabulaire **ouvert**, pendant que le commentaire promettait `:age`. | Table needle → **catégorie**, locale et pure : la trace nomme le `token` du terme (`calories`, `height`, `body_image`…). Vocabulaire **fermé**, et il divulgue moins — ces `issues` reviennent au maître dans la réponse HTTP. |
| **F4** | Garde **asymétrique** (« Végétarien depuis 5 ans » coupée, « Vegetarian for five years » passante) et **aveugle au registre TCA** : image du corps, compensation et pesée passaient intégralement. Banc adverse : **7 lignes sur 17**. | `FORBIDDEN_VOICE_TERMS` **dérivée** de `FORBIDDEN_PORTION_TERMS` : `age` en moins (voir ci-dessous), `VOICE_DISCLOSURE_TERMS` en plus. **La liste de sortie n'a pas bougé d'un caractère.** |

**Pourquoi `age` sort de la garde des ENTRÉES, et de celle-là seulement.** La
liste a été écrite pour la **sortie** — interdire à une consigne de portion,
écrite par le modèle et lue à table, d'énoncer un âge. La voix d'un titulaire
est une **entrée** : du texte libre, jamais rendu tel quel. Et l'âge n'y est pas
un secret : `household_members.birth_date` le porte et `householdBodyFacts` le
donne **déjà** au modèle. Symétriser vers le haut (ajouter `years`, `year`)
aurait **doublé** le faux positif au lieu de le retirer. C'est l'option la plus
réversible : remettre `"age"` dans `VOICE_GUARD_DROPPED_TOKENS` restaure
exactement le comportement d'avant, sans autre changement.

**Le banc adverse, avant → après** — une ligne par appel, **les deux langues** :

| | avant | après |
|---|---|---|
| à couper (17 : 9 fr / 8 en) | 9 coupées, **8 passaient** | **17 coupées** |
| à laisser passer (15 : 7 fr / 8 en) | 14 passaient, **1 coupée à tort** | **15 passent** |
| corpus réel (36 lignes) | 0 morsure | **0 morsure** |

Le cas passant mesuré est vital et il tient : « il n'aime pas le poisson », «
doesn't like fish », le batch cooking, le saut du petit-déjeuner, le travail de
nuit, les lentilles à midi — plus « Végétarien depuis 5 ans » et sa jumelle EN,
plus deux pièges du nouveau registre (« coupe les morceaux trop gros », « uses a
kitchen scale for bread dough »). **Une garde qui coupe tout rendrait D4
décoratif, ce qui est le défaut que ce lot répare.**

**`HOUSEHOLD_PROMPT_VERSION` ne bouge pas**, et c'est une décision écrite en
tête de `household_meal_generation.ts` : aucun bloc n'a changé — ni leur nombre,
ni leur ordre, ni leur **texte** ; ce qui change est le **filtre** appliqué à des
lignes que les membres écrivent eux-mêmes, ce qui est le cas de **L3** (une
seconde raison pour qu'une ligne n'apparaisse pas, relisible sur
`generated_from`, pas sur la version). Et `v6_voices` n'a stampé **aucune**
ligne (`student_generated_meals`, mesuré : 0) : bumper séparerait zéro plan de
zéro plan.

**Les 6 mutations** — chacune cassée, vue rouge, restaurée : plafond remis en
`continue` · décor du plafond remis à longueurs égales (le faux-vert d'origine)
· `age` remis dans la garde des voix · registre TCA retiré · trace remise sur
l'aiguille au lieu de la catégorie · compteurs redérivés des `issues`.

## L7, ce qui est construit — 2026-08-12

> ⚠️ **Aucune fusion réelle n'a été exercée.** Aucun appel HTTP, aucune
> génération modèle. Ce qui suit est prouvé par des tests purs, des tests de
> position sur la source, un bloc de contrôle SQL rejoué et annulé, **une course
> à deux connexions psql**, et **23 mutations**. La campagne réelle est L10.

**Une migration**, `20260812170000_household_merge_quota.sql`, inscrite au
registre à la main (`supabase_migrations.schema_migrations`) — plusieurs
migrations d'autres sessions sont en fichier et absentes du registre, et un
`migration up` les aurait appliquées à sa place.

### L'architecture, et pourquoi

| Où | Quoi |
|---|---|
| `20260812170000_household_merge_quota.sql` §5 | La table `household_merge_quota` (foyer, lundi ISO) et **la garde**, qui vit dans le prédicat d'un seul `insert … on conflict do update … where used < limit` |
| §1 `keel_iso_week_start(date)` | Le lundi ISO, **une** arithmétique, prouvée identique à celle qu'inline `keel_household_submit_envy` sur 14 jours consécutifs |
| §2 `keel_household_active_accounts(uuid)` | Le `N` de D11 |
| §3/§4 `…_merge_quota_slack()` / `…_merge_quota_limit()` | Le `+ 3` adressable, et `N + 3` — la définition unique |
| §6 `keel_household_merge_quota_state(uuid, date)` | La lecture seule, partagée par le refus rapide du générateur et par le lecteur |
| `_shared/keel/household_merge_quota.ts` | Le module PUR : le mot du refus, la relecture du verdict, la phrase |
| `generate-household-meal-v1/index.ts:917` | Le **refus rapide**, dans la branche `merge`, en millisecondes |
| `generate-household-meal-v1/index.ts:2141` | **La réclamation** — la dernière chose avant l'appel modèle |
| `_shared/keel/household_merge_notice.ts:752` | `buildMergeNotices({… , quota})`, **requis** |
| `household-merge-notices-v1/index.ts:225` | Le lecteur lit le **même** plafond, par la même fonction |

### « Compte actif », et d'où vient la définition

**`N` = les lignes de `household_members` de ce foyer qui portent un compte
(`user_id is not null`), maître compris.**

Le prédicat vient de la facturation, mot pour mot : `keel_household_billable_profiles`
(20260810260000 §3) écrit « RÉCLAMÉ = la ligne porte un compte. L'invitation ne
compte pas ». On le reprend tel quel. Ce qu'on ne reprend pas, c'est son
`role <> 'owner'`, dont le motif est écrit à côté — « son accès est dans les
12,99 € du foyer ». C'est un motif de **prix**, et un plafond de fusions n'a pas
de prix : le maître est un compte du foyer, et c'est même **le seul qui dépense
ce quota** (D10, la fusion est déclenchée par lui).

Écrire `billable_profiles(h) + 1` aurait été pire qu'une seconde définition : le
jour où la facturation exclut une population pour une raison de prix, le plafond
de fusions bougerait tout seul et personne ne ferait le lien. Le contrôle de la
migration vérifie donc que les deux nombres **se répondent aujourd'hui**
(`actifs = facturables + 1` sur un foyer dont le maître porte un compte) : si
l'une des deux dérive, le fichier le dit.

**« Actif » n'a pas besoin d'un drapeau**, et c'est structurel :
`household_members_user_id_fkey` est `on delete set null` depuis le détachement
(20260811040000). Un compte supprimé **détache** sa bouche — elle reste à table,
son `user_id` tombe à NULL, et elle cesse de compter sans qu'on écrive quoi que
ce soit. Une colonne `active` aurait été un second écrivain à ne jamais oublier.

### Ce qui compte comme une fusion, et ce qui ne compte pas

| Geste | Compté | Pourquoi |
|---|---|---|
| `operation: "merge"` qui atteint le modèle | **oui** | C'est le geste du maître, et c'est ce qui coûte 20 à 67 s |
| `operation: "unmerge"` (défusion) | **non** | Elle **répare** une fusion. D8 l'offre comme une sortie ; taxer la réparation ferait payer deux fois la même erreur, et enfermerait le maître avec un plan qu'il veut défaire |
| La **reprise collante** (une composition qui re-reprend d'office quelqu'un déjà fusionné, L5) | **non** | Ce n'est pas un geste du maître : la compter lui facturerait une décision qu'il n'a pas prise |
| Un refus **avant** le modèle (les onze de L4, le gel, le plafond lui-même) | **non** | Il n'a rien coûté. Vérifié en base : un refus n'incrémente pas le compteur |
| Un échec **après** le modèle (`meal_unparseable`, `empty_meal`, `house_rule_violated`) | **oui**, et c'est la décision inconfortable du lot | Voir ci-dessous |

Les trois « non » sont **structurels, pas conditionnels** : la réclamation vit
sous `if (merge !== null)`, et `compose` comme `unmerge` n'y entrent jamais. Un
test de source refuse de les laisser y entrer.

**L'échec après le modèle est compté, et il n'y a pas de remise.** Le plafond
borne un **coût**, et le coût est déjà payé quand ces refus tombent. Options
écartées : *(a)* réclamer au moment de l'**écriture** (ne compter que les
réussites) — rejetée parce que deux fusions concurrentes paieraient alors toutes
les deux un appel modèle avant qu'on en refuse une, et parce que le contrôle
d'avant deviendrait une lecture-puis-écriture, le défaut exact que ce dépôt a
payé sur `keel_validate_meal_plan` ; *(b)* réclamer puis **rembourser** sur
échec — rejetée parce que le remboursement devrait être répété sur **six** sites
de retour : un oubli facture, un doublon offre des fusions, et aucun test honnête
ne distingue les deux. **Retour arrière** : une RPC de relâche (`used = used - 1`
sous `used > 0`) et ces six sites ; une trentaine de lignes, aucune migration de
données.

### La concurrence — mesurée, pas raisonnée

La garde est le prédicat d'un **seul énoncé**. Mesuré à deux connexions psql, sur
un foyer à plafond 3 déjà à 2 : la session A réclame dans une transaction
ouverte et dort 4 s ; la session B réclame 1 s plus tard, **bloque 2,95 s** sur
le verrou de ligne, relit la version validée (`used = 3`) et rend
`merge_quota_exhausted`. Exactement une des deux passe. Une lecture suivie d'une
écriture les aurait laissées passer toutes les deux.

Le **refus rapide** placé plus haut dans le générateur n'est donc *pas* la garde,
et le code le dit en toutes lettres : c'est une politesse qui évite au foyer déjà
plein de traverser une doctrine, un roster et huit lectures pour finir sur le
même mot.

### Où tombe le refus, et pourquoi pas ailleurs

Le refus rapide est **après** les onze refus de L4 (« cette personne n'est pas
dans ce foyer » est plus précis que « le foyer a fini sa semaine »), et la
réclamation est la **dernière chose avant l'argent**. Entre la branche `merge` et
l'appel modèle il y a huit portes qui rendent encore (`no_coach`,
`local_day_unresolved`…) et **aucun** appel modèle : réclamer en haut ferait
consommer une fusion à un foyer qui n'a même pas de doctrine publiée. Un test
compte les sorties entre la réclamation et la dépense et **en exige exactement
une** — le refus du plafond lui-même, qui n'a rien réclamé.

Le refus est un **429** (`skipErrorLog: true`), sur le patron du **402
`household_frozen`** de L1 : un motif nommé, un statut qui dit de quoi il s'agit,
et une phrase qui dit **que rien n'est effacé** et **quand ça repart**. Un
plafond atteint n'est pas plus un incident qu'un impayé — L1 a mesuré 15 lignes
de `system_error_logs` au niveau `error` pour des refus de paiement en une seule
session de test.

### Le lecteur de propositions — le partage est celui de D17

Une **proposition** parle du plan d'un autre : si le geste va être refusé, la
proposer est une promesse qu'on ne tient pas, donc elle devient un `skipped`
nommé `merge_quota_exhausted`. Un **avertissement** (D8) parle du plan du
**maître** — sa ligne vivante porte la reprise d'un plan que l'intéressé a
remplacé. Le taire rendrait ce plan périmé invisible **et indéfaisable**. Il
survit donc, et perd la **seule** sortie que le plafond refuse : `merge`.
`unmerge` et `dismiss` restent, puisqu'ils ne coûtent rien.

Le motif **le plus précis gagne** : quand il n'y a rien à fusionner
(`merge_windows_disjoint`), c'est ce mot-là qui sort, pas le plafond — sinon le
maître attendrait lundi pour un plan qui ne fusionnera jamais.

`merge_quota` est rendu dans la réponse **même quand il reste de la place** :
une clé qui n'apparaît qu'au moment du refus ne se distingue pas d'un lot
débranché.

### Les générations individuelles ne sont pas au frais du foyer

Registre D11, mot pour mot. Prouvé par un test de source : `generate-meal-v1` ne
nomme **ni** `keel_household_claim_merge_quota`, **ni**
`keel_household_merge_quota_state`, **ni** `household_merge_quota`, **ni**
`merge_quota_exhausted` — et la lane du foyer, elle, DOIT les nommer, sans quoi
la garde serait verte sur un produit où le plafond n'existe pas.

### Les versions de prompt — aucune ne bouge, et voici pourquoi

`MEAL_PROMPT_VERSION` et `HOUSEHOLD_PROMPT_VERSION` sont **inchangés**. La règle
appliquée depuis v4 est « quelle population voit une consigne différente » : ici,
**aucune**. Un plafond ne change pas un mot de ce que le modèle lit — il décide
si le modèle est appelé. Bumper ferait croire à un changement de consigne et
séparerait en deux des plans rigoureusement identiques.

### Ce que le produit ne calcule pas, et un test le tient

Aucun fichier TypeScript ne connaît le `+ 3`, ni `N`, ni le lundi de la semaine :
la fonction edge passe **son jour local** et reçoit `limit`. Un test refuse
`limit = <nombre>`, `+ 3`, `keel_household_active_accounts` et
`keel_household_merge_quota_slack` dans les quatre fichiers concernés. C'est la
différence entre un plafond compté en base et un plafond récité en base.

`enforce_rate_limit` (20260707170000) existe, il est atomique, et il **ne peut
pas** porter D11 : sa fenêtre est alignée sur l'époque UTC (7 jours y commencent
un **jeudi**), son plafond est un paramètre de l'appelant, et il incrémente à
chaque appel — refus compris, donc un refus consommerait du quota.

### Ce qui n'est pas prouvé, et ce qui reste ouvert

1. **Aucun run réel.** Pas un appel HTTP. Le 429 n'a jamais atteint un client,
   et O2 tient toujours : sans surface qui appelle `keel_validate_meal_plan`,
   aucune fusion n'est atteignable par un vrai utilisateur.
2. **`frontend/src/keel/api/mealGeneration.ts` ne mappe pas
   `merge_quota_exhausted`**, exactement comme il ne mappe pas
   `household_frozen` (dette L1, déjà portée en L8). Un maître verrait le jeton
   brut. **À porter en L8**, avec la phrase et la date de reprise, qui sont déjà
   dans la réponse.
3. **Le plafond ne se voit nulle part avant d'être atteint.** `merge_quota` est
   rendu par `household-merge-notices-v1` ; aucun écran ne l'affiche. « 2 fusions
   restantes cette semaine » est une ligne de L8.
4. **Aucune purge.** `household_merge_quota` garde une ligne par (foyer, semaine)
   pour toujours. À 8 foyers c'est du bruit ; à 100 000, c'est 5 M de lignes par
   an. `rate_limit_counters` a son cron de purge ; celui-ci n'en a pas, faute
   d'`expires_at` — l'ajouter est un `alter table` et un `cron.schedule`.
5. **Le `+ 3` n'a aucun motif écrit.** D11 le pose sans le justifier, et ce lot
   ne l'invente pas. Il est adressable (`keel_household_merge_quota_slack()`)
   précisément pour que le premier foyer réel puisse le déplacer d'une ligne.
6. **Deux rouges préexistants NON touchés**, comme à L4, L5 et L6 :
   `chat/recent_history_test.ts` et une erreur de typage dans
   `action_occurrences_test.ts`.

### Un défaut trouvé par la mutation, dans le contrôle lui-même

En désarmant le prédicat de la garde, la 6e réclamation passait — et
l'assertion qui devait le dire **restait muette**. Elle comparait
`v_res ->> 'reason' <> 'merge_quota_exhausted'` : quand la réclamation
**réussit**, `reason` est NULL, et `NULL <> 'x'` vaut NULL, donc le `if` ne tire
pas. Le rouge venait d'une assertion suivante, avec un message faux (« un refus a
incrémenté le compteur »). Cinq comparaisons du bloc portaient le même trou ;
toutes passent désormais par `coalesce`. **Une garde a besoin d'un cas qui
échoue autant que d'un cas qui passe** — et celle-ci n'en avait jamais eu.

### Les 23 mutations — chacune cassée, vue rouge, restaurée

**En base (rejouées puis annulées) :** le `where used < v_limit` retiré (la 6e
passe) · le même `where` à `v_limit - 1` (**le cas qui passe** : la `N+3` est
refusée) · le `+ 3` mis à `+ 2` (le plafond n'est plus 5) · `keel_iso_week_start`
rendu à `date_trunc('day')` (le dimanche ne remonte plus au lundi) · le jour
local retombé sur `current_date` · `grant select` rendu à `authenticated` · la
lecture seule qui crée sa ligne.

**Dans le produit :** le refus rapide supprimé · une porte de sortie glissée
entre la réclamation et le modèle · la garde `merge !== null` désarmée · la
réclamation qui nomme quelqu'un d'autre · le 429 rendu en 409 · `skipErrorLog`
retiré · le lecteur qui ignore le plafond · le plafond qui coupe **aussi**
l'avertissement de D8 · le bouton `merge` qui survit au plafond · le plafond
placé **avant** le motif précis · le parseur qui invente `0` au lieu de refuser ·
la phrase qui ne dit plus que rien n'est effacé · la lane individuelle passée au
frais du foyer · le `+ 3` recopié en TypeScript · le lecteur qui **réclame** au
lieu de lire · le lecteur qui lit le plafond et ne le passe pas.

## L9, ce qui est construit — 2026-08-12

### Les deux moitiés du lot existaient déjà, et c'est la troisième qui manquait

Ce lot commence par un constat, pas par du code.

- **La bouche sans compte : rien à faire.** `household_members.birth_date`
  existe depuis 20260810120000, la RPC `keel_household_set_member_birth_date`
  est écrite, testée (§53→56 du test RLS) et branchée à l'écran
  (`MouthFields`, `frontend/src/keel/pages/HouseholdPage.tsx:539`). La phrase
  d'aide dit déjà les deux choses qui comptent — c'est facultatif, et sans elle
  la personne reçoit une part standard.
- **« About you » : rien à faire non plus.** L'écran `/app/plan` demande la date
  de naissance depuis toujours (`StudentWeekPlanPage.tsx:715`, cellule « Age »),
  la range dans `profiles.birth_date`, et affiche l'âge dérivé — jamais un âge
  stocké.
- **Ce qui manquait était le fil entre les deux.**
  `keel_household_member_age` ne lisait QUE la fiche de foyer. Un maître qui
  remplissait sa date là où le produit la lui demande restait `unknown` à sa
  propre table : `goalApplies` refuse `unknown`, donc **son objectif déclaré
  n'atteignait jamais son assiette**, sans un mot. C'est un champ qui a l'air de
  marcher et qui ne fait rien — le défaut que ce chantier passe son temps à
  réparer, cette fois entre deux écrans qui existaient tous les deux.

### La règle livrée, et pourquoi ce n'est pas l'autorité sèche de D1

`20260812180000_household_age_from_profile.sql` extrait la règle d'âge
(`keel_age_state(date)`, un seul exemplaire) et fait résoudre à
`keel_household_member_age` **deux** colonnes :

1. la bouche a un compte et son profil porte une date **utilisable** → c'est
   elle (**D18 : « about you » gouverne**) ;
2. sinon → la date de sa fiche de foyer, celle que le maître a saisie ;
3. ni l'une ni l'autre → `unknown`, part standard.

D1 écrit `case when hm.user_id is null then hm.goal else sg.goal end` : pour un
titulaire, la ligne membre ne compte plus du tout. **Le transposer tel quel ici
aurait éteint, le jour du déploiement, tout objectif de titulaire daté par son
maître et jamais repassé par « about you ».** Un lot dont la raison d'être est
« ce qui est déclaré doit atteindre l'assiette » ne peut pas commencer par en
débrancher. La résolution est donc **monotone : aucune bouche ne perd un âge
connu**. Cas limite assumé et testé : un profil **aberrant** (date future,
> 120 ans) ne gagne pas contre une fiche valide — `profiles.birth_date` n'a
aucun CHECK en base, et un doigt qui glisse sur le siècle ne doit pas
débrancher une direction qui marchait hier.

### Ce que l'écran du foyer fait maintenant de MA date

`birthDateDoor` (`frontend/src/keel/api/household.ts`) route la saisie : **ma**
ligne → `profiles.birth_date` (`setOwnBirthDate`) ; toute autre bouche → sa
fiche. Sans cette bascule, le champ de la carte « You eat here too » aurait
écrit dans la colonne devenue **repli** — donc n'aurait rien changé à l'assiette
dès que le profil porte une date. Bénéfice second, réel : la même saisie sert
désormais la **lane individuelle** (`student_body_io.ts` lit
`profiles.birth_date`), là où elle ne servait que le foyer.

La garde d'écriture n'est pas réécrite au navigateur : `assessBirthDate` +
`birthDateWritable` (`_shared/keel/student_age.ts`) sont importées telles
quelles. Une seconde arithmétique de bornes aurait divergé au premier
ajustement.

**Pas touché à l'inscription** — l'utilisateur l'a tranché.

### Le RGPD, vérifié plutôt que supposé

Aucune colonne n'est créée par ce lot, donc rien de neuf à réclamer. Ce qui a
été mesuré :

- `profiles.birth_date` **est exportée** (`account-export-v1` →
  `profil.json` → `date_de_naissance`) et **est supprimée**
  (`profiles_id_fkey` est `ON DELETE CASCADE`). La colonne devenue autorité est
  donc la mieux réclamée des deux.
- `household_members` **n'apparaît nulle part dans l'export** — zéro occurrence
  dans `account-export-v1`, et la liste `PIVOT_TABLES` de
  `keel_gdpr_lifecycle_test.ts` ne la nomme pas. À la purge, sa ligne est
  **détachée** (D3), donc `first_name` et `birth_date` **survivent** au compte.
  C'est la cicatrice « le lifecycle RGPD ne réclame pas les tables neuves »,
  antérieure à ce lot et non traitée ici. ✅ **Tranché par C3 ③ le 2026-08-12** :
  on GARDE (la date résout l'âge, donc les parts de TOUT le foyer — l'effacer
  dégraderait la composition d'un foyer que la personne quitte), et on le
  DÉCLARE — `household_members` entre dans l'export (`mon_foyer.json`, sa ligne
  seule), avec la phrase qui dit ce qui survit et comment l'effacer aussi.
- Les gardes de non-divulgation (`household_voices.ts`, `household_portions.ts`)
  ne bougent pas : le roster ne rend toujours que `minor | adult | unknown`,
  jamais une date.

### Les mutations — chacune cassée, vue rouge, restaurée

**En base** (contrôle de la migration, puis §57 du test RLS) : la fiche seule
(l'ancienne rédaction) → *cas 2* rouge · la **fiche** prioritaire sur le profil
→ *cas 3* rouge · `coalesce` sur les **dates** au lieu des états → *cas 4* rouge
· l'autorité **sèche** de D1 → *cas 4* rouge · et la même première mutation
rejouée sur le test RLS → *57a* rouge.

**Au navigateur** (`ownBirthDate.int.test.ts`, 12 cas) : la garde d'écriture
retirée → *2, 3, 4* rouges · l'écriture envoyée sur `household_members` → *1*
rouge · zéro ligne touchée traitée comme un succès → *7* rouge · la garde
étendue au **mineur** → *5* rouge.

### Ce qui n'est pas prouvé

- **Le branchement de `birthDateDoor` dans `HouseholdPage.tsx` n'a aucun test
  automatique** — l'écran n'est pas monté par la suite. La fonction et son
  effet sont testés, leur câblage ne l'est pas. À vérifier en L10.
- **Aucun run réel** : pas de HTTP, pas d'appel modèle. Le trajet
  `profil → roster → LoadedMember.ageState → goalApplies → part` est prouvé
  jusqu'au **roster** (assertion 57d, qui interroge
  `keel_household_roster_for`), et le reste du trajet est celui, déjà testé,
  que L4→L7 empruntent.
- **`keel_household_member_age` n'est toujours pas scopée au foyer de
  l'appelant** : elle est `grant execute … to authenticated` et rend l'état
  d'âge de n'importe quel `member_id`. C'était vrai avant ce lot, ça l'est
  après ; ce qui sort reste trois jetons, jamais une date. Non élargi, non
  refermé.

## L8, ce qui est construit — 2026-08-12

> ⚠️ **Rien n'a été exercé en conditions réelles.** Aucun appel HTTP, aucune
> génération modèle, aucun navigateur piloté. Ce qui suit est prouvé par des
> tests purs, des tests de position sur la source et **12 mutations**. Suite
> keel : 2 493 verts ; frontend keel : 570 verts. La campagne réelle est L10.

**Aucune migration.** Ce lot ne crée ni table ni colonne : tout ce qu'il
affiche existait déjà côté serveur et n'avait aucun lecteur.

### O2 est refermé — et il l'était par DEUX portes, pas une

La gâchette manquante est `frontend/src/keel/api/mealGeneration.ts`
(`validateMealPlan`), appelée par `components/TakeTheHandCard.tsx`, monté dans
`MealBuilder` sur `/app/plan`. Un appel PostgREST sous le jeton du titulaire,
comme le registre l'avait prédit — `EXECUTE` est révoqué à `service_role`,
aucune fonction edge ne peut la porter.

**Mais la ligne ne suffisait pas, et la seconde porte n'était nommée nulle
part.** `/app/plan` était derrière `KeelStudentRoute`, qui exige
`profiles.keel_role = 'student'` — et la réclamation d'un profil de foyer ne
l'écrit **pas** (20260811060000, en toutes lettres : « LE RÔLE N'EST PAS
ÉCRIT »). Un compte secondaire lisait donc « tu n'es pas un élève » sur le seul
écran où D2 lui demande d'agir. La route passe à `KeelHouseholdRoute` — la
**même** correction que le lot 6 avait faite pour `/app/household`, pour la
même population et la même raison. Un test de source la tient
(`routeGuards.int.test.ts`), avec son cas passant : `/app/today`, `/app/chat`
et `/app/progress` **restent** derrière la garde élève.

**Une troisième porte reste fermée, et elle n'est pas de ce lot** : voir
« ce qui n'est pas prouvé », point 1.

### D9, appliqué des deux côtés

| Surface | Ce qu'elle affiche |
|---|---|
| `/app/plan`, maître d'un foyer | **le plan du foyer, et lui seul** (`cookedPlans`). Son plan personnel, s'il en a un, n'y apparaît pas |
| `/app/plan`, secondaire ou compte individuel | ses plans personnels, plus la carte de prise de main |
| `/app/household`, secondaire | le plan du foyer (plats), la table, et ce qui n'a pas fusionné |
| `/app/household`, maître | les propositions, la table, et ce qui n'a pas fusionné |

**`cookedPlans` lit la RÈGLE SUR LES LIGNES, pas sur un rôle.** Seul un compte
maître porte des lignes `plan_kind = 'household'` : « j'ai un plan de foyer
vivant » **est** « je suis maître d'un foyer qui a composé », sans seconde
requête ni seconde définition. Ce n'est pas défensif : la contrainte
d'exclusion est scopée `(user_id, plan_kind)` **exprès**, donc les deux natures
peuvent couvrir les mêmes jours, et `selectMealPlans` — qui ne connaît que des
fenêtres — aurait tranché sur la date de début.

**Le maître ACCÈDE, sans que sa cuisine AFFICHE** : un dépliant sur la carte de
proposition (`loadMemberPersonalPlan`) montre les **titres** du plan d'un
secondaire, jamais son `why` ni ses ingrédients. Le lecteur est scopé
`user_id` **et** `plan_kind = 'personal'`, et le test des lecteurs le tient
nommément — RLS rend ici *toute* ligne du foyer, y compris le plan personnel
d'un autre secondaire.

### Ce qui n'a pas fusionné, dit sans coupable

`api/householdPlanTrace.ts` lit `generated_from.household` et rend des **lignes
nommées**, jamais des phrases : l'écran traduit, le catalogue tient la règle
d'écriture. Un FAIT (« son plan couvre les mêmes jours »), jamais une
défaillance (« son plan n'a pas pu être fusionné »), et la phrase de divergence
**avant** la liste des noms — lue après, la liste se serait déjà lue comme une
liste de fautes.

Sont dits : la reprise, la prise de main, le plan **partiel** (la seule ligne
qui explique pourquoi quelqu'un qui a un plan reste à cette table), la
défusion, et — première fois — **`covers_window: false`**, que L5 avait laissé
tracé et sans lecteur (« le dire à l'écran est L8 »). **O5 aussi** : quand
`merge.honoured.ok` est faux, l'écran le dit.

Ne sont **pas** dits, exprès : `voices` (remonterait à ce qu'une personne a
confié de son alimentation — la garde de non-divulgation de L6 existe pour que
ça n'atteigne pas la table) et `presence` (déjà en grille, marquée par le
maître lui-même).

### Les refus, soldés en une table fermée et testée

`copy/planRefusals.ts` mappe **tout** ce que les deux générateurs peuvent
rendre : le gel de L1, `window_fully_away` de L2, `all_members_have_own_plan`
de L3, les onze refus de fusion, les six de défusion, `merge_quota_exhausted`
de L7, plus les motifs de `keel_validate_meal_plan` et des deux RPC de réglage.
Un test de dérive **lit les sources** et exige la bijection dans les deux sens
— la moitié qui compte étant « n'invente aucun jeton », le défaut qui avait
laissé `restriction_flag` vivre des mois à côté du vrai `restriction_signal`.

Le scan a trouvé deux trous **dans sa première rédaction** : les refus rendus
par une CONSTANTE (`error: MERGE_QUOTA_EXHAUSTED` — c'est-à-dire précisément
celui de L7) et les deux refus de défusion rendus par un **ternaire**.

### Cinq décisions prises seules

| Décision | Écarté | Pourquoi | Retour arrière |
|---|---|---|---|
| **`/app/plan` passe à `KeelHouseholdRoute`** | laisser la garde élève et documenter le trou | Sans elle la gâchette est du code inatteignable, et tout le chantier avec. C'est la correction déjà prise au lot 6 pour la même population | une ligne, et son test |
| **Le maître ne compose plus depuis `/app/plan`** (formulaire et boutons masqués) | les laisser | `generate-meal-v1` lui écrirait un plan PERSONNEL que sa propre surface masque ensuite (D9) : trente secondes d'attente, un appel modèle payé, un `replaces` qui ne retire rien, et rien à l'écran. Un geste qui ne fait rien est indiscernable d'un geste qui a marché | une constante et ses trois usages |
| **La carte de divergence vit sur `/app/household`**, pas sur `/app/plan` | la mettre sur la surface de cuisine du maître | La trace ne porte que des `member_id` : les nommer demande le roster, que seule cette page-là lit. Et c'est là que la table est déjà décrite | déplacer un composant |
| **Le réglage de D17 est dans la fiche de la personne** | un bouton sur la carte de proposition | « Assumé comme un peu brutal, donc caché » : à côté de « fusionner », « ne plus me parler de lui » serait le geste le plus facile | déplacer un bouton |
| **Le plan d'un secondaire est lisible en TITRES seulement** | tout le plat, ou rien | « Accéder » n'est pas « afficher ». Le `why` est écrit pour la personne qu'il sert, et le plan du foyer se lit à voix haute | supprimer un dépliant |

### Les 12 mutations — chacune cassée, vue rouge, restaurée

`exitsOf` qui rajoute un bouton absent d'`exits` · `dismiss_validated_at`
confondu avec la date du plan montré · `remaining` recalculé côté navigateur ·
le trou « il n'a rien à manger ces jours-là » jamais dit · `covers_window`
absent lu comme « tout est couvert » · O5 jamais constaté · `cookedPlans`
désarmé (D9) · `cookedPlans` qui ne rend QUE le foyer (le cas qui passe) · une
étiquette de refus retirée · l'accès du maître non scopé par `user_id` · le
même sans `plan_kind` · la porte `/app/plan` refermée sur la garde élève.

**Un faux-vert trouvé par la mutation, et il était dans mon propre décor.** Le
test « on ne recalcule pas `remaining` » passait avec `used: 4, limit: 5,
remaining: 1` — où la soustraction rend exactement la même chose. Le décor a
été refait sur une réponse **réelle** du serveur (la branche de refus rend
`remaining: 0` avec `used > limit`), et la mutation devient rouge.

### Ce qui n'est pas prouvé, et ce qui reste ouvert

1. **⚠️ UN SECONDAIRE N'A PAS DE COACH, ET `generate-meal-v1` REFUSE
   `no_coach`.** Mesuré par la lecture : `keel_household_join` n'écrit ni
   `keel_role` ni ligne `coach_clients`, et `keel_signup_intent` vaut
   `household_member` — le trigger de signup ne rattache au coach maison que
   `student_free`. Le refus est désormais **nommé à l'écran**, mais la prise de
   main reste **hors d'atteinte** tant que ce rattachement n'est pas décidé :
   il crée un siège, donc il touche la facturation (le 4e siège, le paywall
   J+15). **C'est une décision de produit, pas de code.** Sans elle, L10 ne
   pourra pas exercer la chaîne complète.
2. **Aucun écran n'a été monté ni piloté.** La suite frontend tourne en
   environnement `node` et ne monte aucun composant : les décisions pures sont
   testées, leur câblage ne l'est pas. Même limite qu'à L9.
3. **`already: true` n'a pas été vu en vrai.** Le chemin est écrit et commenté,
   la RPC est prouvée idempotente côté base (2026-08-11), mais aucun
   double-clic réel n'a été mesuré à travers l'écran.
4. **La proposition peut encore être refusée au moment du geste**
   (`merge_member_away_all_window`, L5 §3). L'écran affiche le refus nommé et
   relit — il ne le prédit pas.
5. **Deux avertissements eslint PRÉEXISTANTS** dans `MealBuilder.tsx`
   (`react-hooks/exhaustive-deps` sur deux `useMemo`), vérifiés au `HEAD` avant
   ce lot. Non touchés.
6. **Le test `coverage-guard` du frontend était rouge AVANT ce lot** (2 cas :
   une fonction edge et un trigger non déclarés, tous deux d'un autre
   chantier). Vérifié en remisant les changements. Non touché.

## L10, l'aval — les trois défauts de la QA finale, corrigés le 2026-08-12

> Trois défauts mesurés en HTTP réel après L8. Aucun run réel n'a été refait :
> tout ce qui suit est prouvé par des tests purs, un banc de propriété, deux
> bancs de vocabulaire et **cinq mutations**.

### ① P0 — UNE FUSION NE RÉTRÉCIT PLUS LA COUVERTURE DU FOYER

**Ce qui était mesuré.** Le foyer couvre `08-10→08-16`, Zoé `08-12→08-14` — la
forme de fenêtre la plus banale du produit. La proposition annonçait « I can
merge all 3 of them », le geste rendait **409 `plan_not_written` /
`plan_overlaps_existing` après 16,1 s**, 7 335 jetons et **une unité du plafond
de L7** consommée pour rien.

**La règle de la base, relue plutôt que devinée.** `write_student_meal_plan`
(migration `20260811140000`) refuse deux formes et en tronque une troisième :

| Forme du plan vivant vs la fenêtre neuve | La RPC |
|---|---|
| commence **le même jour ou après** | refuse `plan_overlaps_existing` |
| commence avant **et finit après** (fenêtre *englobée*) | refuse — correctif du 2026-08-11 |
| commence avant et finit **dans** la fenêtre | **tronque**, légitimement (c'est D15) |

**Le choix : produire une fenêtre écrivable, pas refuser plus tôt.** Le refus
était l'option la plus étroite, et il a été écrit puis **abandonné** — parce
qu'il est incohérent avec sa propre moitié jumelle :

- refuser ne ferme que la branche `prepare_next`. L'autre branche **ne refusait
  pas** : quand la fusion démarrait le même jour que le plan du foyer,
  `replace_current` retirait la semaine entière pour la remplacer par trois
  jours, et **la fin de semaine disparaissait en silence** ;
- le remède qu'un refus aurait dû annoncer (« recompose ta semaine à partir de
  ce jour, puis reprends la personne ») **produit exactement ce silence-là** :
  la fusion suivante démarre alors le même jour et retombe dans la branche qui
  raccourcit ;
- l'exemple canonique de D16 lui-même — foyer 7 jours, plan personnel 5 jours,
  fusion des 3 restants — devenait **impossible**.

La règle livrée tient en une phrase : **une fusion recompose la QUEUE du plan du
foyer, du pivot jusqu'à son dernier jour, avec la personne à table.**

**Pourquoi ça ne peut régresser aucune fusion qui marche.** Quatre formes, deux
seulement changent, et les deux sont cassées aujourd'hui :

| Forme | Avant | Après |
|---|---|---|
| les deux fenêtres finissent ensemble (**le cas nominal** : deux plans « jusqu'à dimanche ») | s'écrit | **identique**, à l'octet près |
| son plan déborde par la fin | s'écrit | **identique** |
| son plan finit avant, fusion **à partir du même jour** | le foyer perd sa queue **en silence** | il la garde |
| son plan finit avant, fusion **plus tard** | 409 payé au prix d'une génération | s'écrit |

**Les jours ajoutés ne changent personne de place.** La prise de main de L3 est à
recouvrement **total** (`planCoversWindow`) : un plan personnel qui ne couvre pas
toute la fenêtre ne retire pas son porteur du plan du foyer. Ces jours-là, la
personne était **déjà** composée — la fusion les recompose avec elle.

**Où ça tombe, et pourquoi pas ailleurs.** Dans `resolveMergeWindow`, donc dans
`bestMergePair`, donc dans **le seul choisisseur** — celui que la PROPOSITION
(D10) et le GESTE partagent depuis L5. `MergeWindow` porte désormais deux
fenêtres nommées : `window` (les jours de **son** plan qui reviennent, ce que la
proposition annonce, ce qui choisit la paire) et `recomposed` (ce qui part à
`write_student_meal_plan`). Le générateur écrit `recomposed`, et un test de
source refuse `window`.

**La proposition dit le geste entier.** `proposalSentence` garde sa phrase de
D16 et lui ajoute, **seulement quand les deux fenêtres diffèrent** : *« Doing it
rebuilds the household's 5 remaining days, so the end of the week keeps a
plan. »* La carte porte la même ligne (`household.merge.window_rebuilt`), muette
dans le cas nominal. Le journal, l'archive `generated_from.household.merge` et
la réponse HTTP portent maintenant **les deux** fenêtres (`window` +
`merged`).

**Le plafond n'est pas consommé.** Il ne l'était déjà pas par un refus — les
onze refus de fusion tombent dans `resolveMergeRequest`, avant la lecture rapide
du quota (`keel_household_merge_quota_state`) et **très** avant la réclamation
(`keel_household_claim_merge_quota`, juste avant le modèle). Ce qui a changé,
c'est qu'il n'y a plus de fusion qui **paie** le plafond pour finir sur un 409 :
la fenêtre est écrivable **par construction**, et un banc de propriété de 400
formes le vérifie contre la règle de la RPC.

**⚠️ La règle SQL est recopiée en TypeScript, et le fil est tendu.**
`mergeWindowWritable` rejoue la boucle de chevauchement ; ce n'est pas une garde
(personne ne lit son `false`), c'est **la mesure** qui rend l'invariant
vérifiable. Un test relit la boucle **dans la migration** et tombe le jour où
l'original bouge.

### ② SÉCURITÉ — LES SIX OBJECTIFS MORDENT SUR LA LISTE DE SORTIE

L6 avait réparé l'asymétrie sur la liste des **entrées** ; elle a survécu intacte
sur la liste des **sorties**, celle du texte **lu à voix haute à table**. Mesuré
sur un banc de 17 phrases (les six objectifs, EN et FR) : **2 mordaient sur 17**.

Six termes ajoutés à `FORBIDDEN_PORTION_TERMS`, dont les `token` sont **les
valeurs de `MEMBER_GOALS` mot pour mot** — la trace parle donc le vocabulaire du
produit, et le test **boucle sur la constante réelle** plutôt que sur une copie.

| Banc | Avant | Après |
|---|---|---|
| adverse (6 objectifs × EN/FR, 17 lignes) | 2 mordent | **17 mordent** |
| passant — consignes de service (24 lignes) | 0 perdue | **0 perdue** |
| passant — voix libres (16 lignes) | 0 retenue | **2 retenues** |

**Ce que ça coûte, nommément.** « Il fait attention à sa santé » et « She is very
health conscious » sont désormais **retenues à l'entrée** : `health` et `santé`
mordent nus, parce que c'est **exactement** ainsi que cet objectif-là se rend
dans les deux langues (`household.goal.health` = « Health »). Laisser passer deux
objectifs sur six aurait reconduit l'asymétrie qu'on ferme. Le prix d'une morsure
est une ligne non montrée au modèle, tracée — jamais un repas perdu.

**Ce qui reste dehors, mesuré :** `fat` nu (« low-fat yogurt », « retire le gras
du jambon »), `graisse` nu (« graisse de canard »), `muscle` nu (« le muscle du
gîte »), `maintien` nu (« maintien au chaud »), et `healthy`. Ce qui mord est la
**séquence** (`fat loss`, `maintien du poids`), jamais le mot seul.

### ③ « REFUSER » NE TUE PLUS L'AVERTISSEMENT QUE LE MUTE ÉPARGNE

`dismiss` s'exécutait **avant** le calcul de `warns`, donc sans la garde que le
mute (D17) et le plafond (L7) portent tous les deux. Mesuré : plan du foyer
portant une reprise périmée + `dismiss` ⇒ `notices: []`, `skipped:
dismissed_by_owner` — la ligne vivante du maître gardait sa reprise obsolète et
la sortie `unmerge` devenait **hors d'atteinte**.

Les trois se lisent maintenant pareil, et c'est la seule ligne à retenir : **ce
qui parle du plan de quelqu'un d'autre se tait sur demande ; ce qui parle du plan
DU MAÎTRE ne se tait jamais.** `warns` est calculé **avant** les trois silences.
Le coût assumé : sur un avertissement, « refuser » ne fait plus disparaître la
carte — il pose la borne (la proposition ne reviendra pas à la validation
suivante), et le bouton reste offert.

### Les versions de prompt — aucune ne bouge, et voici pourquoi

La règle établie est « quelle **population** voit une **consigne** différente ».

- **`MEAL_PROMPT_VERSION` (tronc) : inchangée.** Rien de ce lot n'entre dans le
  tronc. La lane individuelle rend un prompt byte-identique.
- **`HOUSEHOLD_PROMPT_VERSION` (`v6_voices`) : inchangée.** ① change des
  **dates** — la fenêtre d'une fusion, comme toute fenêtre, est une donnée de la
  requête, et le gabarit de phrase (« from X to Y », « at most N dishes ») n'a
  pas bougé d'un caractère. ② ne touche **pas** le prompt du tout côté sortie
  (`sanitizePortionNote` est un filtre **après** génération) ; côté entrée, la
  garde des voix peut retenir une ligne de plus, mais une ligne de données
  retenue n'est pas une consigne différente — sinon tout changement de roster
  bumperait la version. ③ ne concerne que le lecteur de propositions, qui
  n'appelle aucun modèle.

### Les cinq mutations — chacune cassée, vue rouge, restaurée

| # | Ce qu'on casse | Ce qui rougit |
|---|---|---|
| 1 | `recomposed` redevient l'intersection coupée au pivot | les 3 tests D1 de fenêtre + le banc de propriété ; **les 3 tests du cas nominal restent verts** |
| 2 | le générateur écrit `merge.window.window` au lieu de `recomposed` | « LA FENÊTRE DE FUSION SE DÉDUIT » (test de source) |
| 3 | `dismiss` repasse avant `warns` | « D5 — REFUSER NE COUPE PAS L'AVERTISSEMENT » ; les deux autres tests de `dismiss` restent verts |
| 4 | le terme `fat_loss` est désarmé | le banc adverse des six objectifs ; **le banc passant reste vert** |
| 5 | le terme devient `fat` nu | le banc passant (`low-fat yogurt`) ; **le banc adverse reste vert** |

Les mutations 1/4/5 sont celles qui comptent : elles prouvent que le décor
**sépare** les deux moitiés au lieu de tout tenir d'un seul fil.

### Ce qui n'est pas prouvé, et ce qui reste ouvert

1. **Aucun run réel.** Pas un appel HTTP, pas une génération. Une fusion sur une
   fenêtre englobée n'a jamais été **écrite** en base.
2. ~~**La porte `compose` porte la même famille de défaut, et n'est pas
   touchée.**~~ **Refermée par C2 le 2026-08-12** — par la MÊME règle
   (`planOverlapVerdict` / `firstBlockingPlan`, dont `mergeWindowWritable` est
   devenu un appelant), sur les DEUX portes `compose`. ⚠️ La phrase « le chemin
   nominal ne l'atteint pas » était **fausse pour la lane individuelle** :
   `MealBuilder` envoie `{kind:"exact"}` avec deux dates que l'élève choisit.
   Voir §« C2 ③ ».
3. **`observeMergeShape` n'a pas été relu sur une fenêtre élargie.** Le constat
   travaille sur ce que le modèle rend, pas sur la fenêtre ; aucune raison de
   croire qu'il change, aucune mesure non plus.
4. **`merge_member_away_all_window` se prononce sur la fenêtre ÉLARGIE**, et
   c'est un effet de bord assumé : quelqu'un d'absent tous les jours de son
   propre plan mais présent sur la queue du foyer n'est plus refusé — il a bien
   une assiette, ce qui est la raison écrite de ce refus. Non mesuré.
5. **Le test `coverage-guard` du frontend était rouge AVANT ce lot** (2 cas :
   une fonction edge et un trigger non déclarés, d'un autre chantier). Vérifié
   en remisant les changements.

## ⚠️ O7 — LA DERNIÈRE PORTE FERMÉE, ET ELLE A DE L'ARGENT DERRIÈRE
> **Tranché et livré par C1 le 2026-08-12 — par une QUATRIÈME sortie, absente du
> tableau ci-dessous : la doctrine se résout PAR LE FOYER, et aucune ligne
> `coach_clients` n'est créée.** Voir §« C1 ». Ce qui suit reste l'état mesuré
> qui l'a motivée.

**Un compte secondaire ne peut pas prendre la main.** Mesuré en HTTP réel le
2026-08-12, sur le foyer de test :

```
POST /functions/v1/generate-meal-v1   (jeton du secondaire)
  → 409 no_coach   en 373 ms
select count(*) from coach_clients where student_user_id = <secondaire>  → 0
select count(*) from coach_clients where student_user_id = <maître>      → 1
```

L8 a refermé **deux** des trois verrous — la gâchette de validation, qui n'existait
nulle part, et la route `/app/plan`, qui exigeait `keel_role = 'student'` que la
réclamation d'un profil de foyer n'écrit pas. Le troisième reste :
`keel_household_join` **n'attache personne à un coach**, et `generate-meal-v1` exige
un coach à doctrine publiée.

Conséquence : **toute la chaîne « prendre la main → proposition → fusion » est
inatteignable en production pour un secondaire.** Les sept lots serveur sont justes,
prouvés, et personne ne peut les déclencher.

**Je ne tranche pas, et c'est délibéré.** Rattacher un membre de foyer au coach
maison à l'adhésion **crée un siège** — donc touche la facturation, le plafond du 4ᵉ
siège et le paywall J+15. Une décision qui crée des sièges facturables ne se prend pas
en passant, et elle n'est pas réversible de la même façon que le reste : les lignes
créées existeraient.

Trois sorties, à trancher :

| Sortie | Ce que ça donne |
|---|---|
| **Rattacher à l'adhésion** | la chaîne s'ouvre, et chaque membre qui rejoint devient un siège — vérifier ce que ça fait au plafond et au paywall |
| **Rattacher au premier geste** de prise de main | le siège n'existe que si la personne l'exerce vraiment ; plus étroit, plus tardif |
| **Laisser** | le repli et la fusion restent du code juste que personne ne déclenche |

## C1, ce qui est construit — 2026-08-12

> ⚠️ **Rien n'a été exercé en conditions réelles.** Aucun appel HTTP, aucune
> génération modèle. Ce qui suit est prouvé par des tests purs, des tests de
> position sur la source et **16 mutations**. Suite keel : **2 528 verts** ;
> frontend keel : 593 verts. **Aucune migration.**

Deux défauts, tous deux mesurés en HTTP réel : **O7** (personne ne peut prendre
la main) et **O5** (la fusion sert le plan de l'autre à tout le foyer).

### O7 — LA DOCTRINE SE RÉSOUT PAR LE FOYER, ET AUCUNE LIGNE N'EST CRÉÉE

| Où | Quoi |
|---|---|
| `_shared/keel/household_doctrine.ts` | `loadDoctrineForCaller` — la doctrine de l'appelant, **sinon** celle du maître de son foyer ; `resolveHouseholdOwnerUserId` |
| `generate-meal-v1/index.ts:491-538` | Le repli, exactement là où tombait `no_coach` (`:526` la résolution, `:537` le refus qui survit) |
| `generate-meal-v1/index.ts:568-585` | `loadPublishedProtocol` suit **le même compte** que la doctrine |
| `generate-meal-v1/index.ts:1281` | `generated_from.doctrine_via_household` + `doctrine_owner_user_id`, écrits **seulement** sur un repli |

**L'arbitrage (donné, non rejoué) : aucune ligne `coach_clients`.** Rattacher au
coach maison donnerait deux doctrines dans une même cuisine ; rattacher au coach
du maître créerait un siège facturable. La résolution par le foyer ne crée rien,
garde **une seule doctrine par cuisine**, et se défait en retirant une branche de
lecture.

**C'est un REPLI, jamais un remplacement.** `loadDoctrineForCaller` charge
d'abord la doctrine de l'appelant : un titulaire qui a son coach garde le sien
**et le foyer n'est même pas lu** — un test le tient sur la liste des requêtes,
pas sur le résultat. Le foyer n'est pas re-résolu : `householdId`, résolu une
seule fois pour tout le fichier depuis L1, est **consommé**.

**Les trois cas, chacun testé :**

| Cas | Résultat |
|---|---|
| Coach à lui | le sien, `viaHousehold: false`, zéro lecture de foyer |
| Pas de coach, membre d'un foyer dont le maître en a un | celui du **maître**, `subjectUserId` = maître |
| Ni l'un ni l'autre (pas de foyer · maître sans coach · maître détaché · le maître c'est moi · lecture en panne) | **`no_coach`**, jamais une exception |

**Quatre décisions prises seules.**

| Décision | Écarté | Pourquoi | Retour arrière |
|---|---|---|---|
| **La variante suit l'APPELANT** (`goalOverride` sur le repli, et seulement là) | laisser le chargeur lire `student_goals` du maître | Sans elle, un secondaire en `muscle_gain` recevrait la variante `fat_loss` de son maître : le coach vient du foyer, l'objectif vient de la personne qu'on nourrit. Sur le chemin nominal, aucune option n'est passée — le comportement est byte-identique | retirer une option |
| **Le MAPPING ALIMENTAIRE suit le même compte que la doctrine** | le lire sur l'appelant | Sinon: les convictions d'un coach et les aliments d'aucun — l'hybride que `doctrine_loader.ts` documente déjà sur la délégation. Le défaut serait muet: pas de mapping = pas de bloc | une ligne |
| **La NOTE 1:1 ne suit PAS** (`loadCoachNote(admin, userId)` inchangé) | l'aligner sur la doctrine | Une note écrite **sur le maître** parle du maître. L'injecter dans le plan d'un tiers est une divulgation, pas un repli. Seul ce qui est écrit pour toute la cohorte se transmet | — |
| **Fail-closed sur la lecture du maître** | fail-open | Une lecture en panne rend le refus qui existait déjà. L'inverse ferait composer sous la méthode de quelqu'un qu'on n'a pas su lire | une branche |

**Ce que ça n'ouvre pas.** Aucun chemin de génération gratuit : un membre de
foyer est **déjà** gardé par le gel 402 de L1, qui tombe ~140 lignes plus haut.
Un test de source refuse toute écriture dans le module de repli
(`.insert(` · `.update(` · `.upsert(` · `.delete(` · `.rpc(`) et toute mention
de `coach_clients` ou `keel_role` — avec son cas passant (le module DOIT nommer
`household_members` et `loadPublishedDoctrine`).

### O5 — LA FUSION ANCRE SUR LE PLAN DU FOYER

**Ce que la consigne dit maintenant**, et la seule chose à retenir : elle montre
**deux** listes là où elle n'en montrait qu'une, et l'ancre est **en dernier**.

```
== BRINGING SOMEONE BACK TO THIS TABLE ==
Zoe has been eating from their own plan. […] from 2026-08-12 to 2026-08-16.

Zoe cannot be served out of the common pot.
ADD ONE dish for them, and cook it in the SAME cooking session as the
household's — one session at the stove, two dishes out of it.
Everyone else keeps the household's dishes: what follows is material for
THEIR dish, never a menu for the table.

What Zoe was going to eat over these days, on their own:
- wed dinner: Chicken, rice and broccoli bowl        ← LA MATIÈRE, en premier

THE HOUSEHOLD'S PLAN IS THE PLAN, AND IT STAYS.
Stay as CLOSE AS POSSIBLE to the household's plan: keep the same dishes, the same
cooking sessions and the same shopping wherever they still work for the
people who were already at this table — only the amounts change. Do NOT
invent a different week, and never serve Zoe's dishes to the whole table.

The household's plan over these days:
- wed lunch: Chicken, tomato and cucumber pita       ← L'ANCRE, en dernier
```

**En quoi elle diffère de celle qui obéit 14/14 — et en quoi elle lui
ressemble.** `buildUnmergeBlock` montre **le plan de base** et dit d'en rester au
plus près ; le modèle a rendu 14 titres identiques sur 14. `buildMergeBlock` ne
montrait **aucune** liste du foyer : le seul menu écrit sous les yeux du modèle
était celui du plan personnel, et il l'a recopié — 15 créneaux sur 15, deux
fusions sur deux. Les deux blocs disent désormais la même chose dans le même
ordre : un plan qui fait autorité, montré, et l'instruction d'en rester au plus
près (`MERGE_ANCHOR_INSTRUCTION`, jumelle de `UNMERGE_CLOSENESS_INSTRUCTION`).
Ce qui les sépare est ce que la fusion **AJOUTE**, et c'est le barreau qui le
dit.

**L'ORDRE est la moitié du correctif.** La matière passe en premier, l'ancre en
dernier — la posture déjà écrite pour le bloc des voix (« un modèle lit la
contrainte la plus proche de la fin comme la plus contraignante »). Avant, la
liste à ne PAS recopier était le mot de la fin.

**Ce que L4 garde, et un test le tient.** Aux barreaux ② et ③ la consigne dit
toujours **ADD** — un plat dédié à la personne reprise — et `dishBudgetFor` ne
bouge pas d'un plat : `ownDishesShown` compte la seule matière du plan
personnel. Y ajouter l'ancre ferait compter la fenêtre du foyer deux fois dans
son propre plafond. Deux assertions de source le tiennent.

**Ce que j'attends du modèle, pour que le testeur puisse me démentir :**

| | Attendu |
|---|---|
| **Barreau ①** | les titres du plan du **foyer** survivent en majorité ; la matière du plan personnel n'apparaît que par inflexion (un accompagnement, une protéine), jamais comme un menu de remplacement |
| **Barreaux ②/③** | les titres du foyer survivent **pour les autres bouches** ; **au moins un plat dédié** à la personne reprise apparaît, avec une préparation d'une portion (② même jour de cuisson, ③ session à part) |
| **Le contraire, mesurable** | si `observeMergeShape` rend encore `common_pot` **et** qu'aucun titre du plan du foyer ne survit, l'ancre a échoué comme le barreau — c'est un **fait**, pas un échec du lot, et il faudra passer aux sorties du tableau d'O5 (refuser, ou relancer) |
| **Ce qui n'est pas mesurable ici** | rien ne **constate** la ressemblance au plan de base : il n'y a pas d'`observeMergeShape` pour l'ancrage, exactement comme il n'y en a pas pour la défusion (L5 §1). La comparaison des titres se fait à la main, plan contre plan |

### Les versions de prompt

- **`HOUSEHOLD_PROMPT_VERSION` bump `v6_voices` → `v7_merge_anchor`.** Règle de
  v4 appliquée telle quelle (« quelle **population** voit une consigne
  différente ») : les **fusions**, et elles seules. Le texte servi change — un
  bloc de plus dans le bloc, une instruction neuve, un ordre neuf. Un test
  refuse les cinq versions passées.
- **`MEAL_PROMPT_VERSION` : inchangée.** Rien de C1 n'entre dans le tronc. O7 ne
  change **aucun mot** de prompt : il change **quel coach** répond, ce qui se
  relit sur `generated_from.doctrine_via_household`, pas sur une version — même
  posture que L3 (une seconde raison qu'une ligne n'apparaisse pas). La lane
  individuelle, la composition ordinaire et la défusion rendent un prompt
  byte-identique à v6, et les tests d'octet de L4/L5/L6 le tiennent.

### Les 16 mutations — chacune cassée, vue rouge, restaurée

**O7 (8) :** `goalOverride` retiré du repli (2 rouges) · le repli devenu un
**remplacement** — le cas qui passe · la garde « le maître, c'est moi »
désarmée · la panne de lecture qui **lève** · `viaHousehold` vrai quand le
maître n'a pas de coach non plus · le mapping alimentaire relu sur l'appelant ·
le générateur qui rouvre le chemin direct vers `loadPublishedDoctrine` · une
**seconde** résolution du foyer ajoutée.

**O5 (8) :** la liste du plan du foyer retirée du bloc (4 rouges) · l'ancre
placée **avant** la matière · l'instruction d'ancrage retirée (4 rouges) · le
générateur qui passe **deux fois** la liste du plan personnel · l'ancre entrée
dans le budget de plats · la version **non bumpée** · « ADD » retiré des
barreaux ②/③ — **le cas qui passe** · l'ancre **non plafonnée**.

### Ce qui n'est pas prouvé, et ce qui reste ouvert

1. **Aucun run réel, des deux côtés.** Aucun secondaire n'a reçu un 200 de
   `generate-meal-v1` ; aucun modèle n'a lu la consigne ancrée. Les deux
   attendent la campagne.
2. ~~**`generate-week-plan-v1` n'a PAS le repli.**~~ **Refermé par C2 le
   2026-08-12** — par le MÊME module (`loadDoctrineForCaller`), et avec le gel
   402 de D13, qui manquait sur cette porte. Voir §« C2 ① ».
3. **La doctrine du foyer ne suit pas le CHAT ni le message du soir.** Un
   secondaire compose désormais sous la méthode du coach de son foyer, mais
   `sophia-brain` lui parle toujours sans doctrine. Écart connu, non refermé.
4. **`goalSource` vaut `override` sur un repli.** Le jeton est documenté comme
   « le coach en mode test » ; un troisième cas aurait demandé de toucher un
   type partagé par cinq lanes. La trace exacte existe ailleurs, nommément
   (`keel.doctrine.household_fallback`, `doctrine_via_household`).
5. **Le coût du repli n'est pas mesuré** : deux requêtes de plus (le maître, puis
   son `coach_clients`) sur la seule population qui n'a pas de coach.
6. **Deux rouges préexistants NON touchés**, comme à L4→L8 :
   `_shared/chat/recent_history_test.ts` (2 cas) et une erreur de typage dans
   `_shared/action_occurrences_test.ts`. Re-vérifiés rouges au moment de ce lot,
   sans y toucher.

## C2, ce qui est construit — 2026-08-12

> ⚠️ **Rien n'a été exercé en conditions réelles.** Aucun appel HTTP, aucune
> génération modèle. Ce qui suit est prouvé par des tests purs, des tests de
> position sur la source et **26 mutations**. Suite keel : **2 586 verts** ;
> frontend keel : 593 verts. **Aucune migration.**

Cinq défauts, tous mesurés en HTTP réel le 2026-08-12.

### ① O7 N'ÉTAIT FERMÉ QU'À MOITIÉ — `generate-week-plan-v1` N'AVAIT PAS LE REPLI

C1 a posé le repli de doctrine par le foyer dans `generate-meal-v1`. Le MÊME
compte secondaire, sur `generate-week-plan-v1`, recevait toujours `409 no_coach`
en 0,34 s — et c'est **le** chemin du modèle produit, celui que `CLAUDE.md`
nomme en toutes lettres (`student_goals` → `generate-week-plan-v1` →
`student_week_plans`). Un secondaire pouvait composer son dîner et toujours pas
sa semaine.

| Où | Quoi |
|---|---|
| `generate-week-plan-v1/index.ts:115-132` | `resolveHouseholdIdFor`, **une seule fois**, consommée deux fois |
| `generate-week-plan-v1/index.ts:134-181` | **Le gel 402 (L1/D13), neuf sur cette porte** |
| `generate-week-plan-v1/index.ts:262-279` | `loadDoctrineForCaller` — **le même module que la lane repas**, à la place du couple `coach_clients` + `loadPublishedDoctrine` |
| `generate-week-plan-v1/index.ts:~500` | `generated_from.doctrine_via_household` + `doctrine_owner_user_id`, écrits **seulement** sur un repli |

**La lecture directe de `coach_clients` a disparu, et ce n'est pas un
nettoyage.** Elle DOUBLAIT celle du chargeur (même prédicat, `status =
'active'`), donc elle refusait `no_coach` **avant** que le repli n'ait la
parole : le brancher sans la retirer aurait posé un repli inatteignable — le
mode d'échec n°1 de ce chantier. Le `coach_id` archivé vient désormais de la
doctrine servie, ce qui est la seule lecture juste sur un repli.

**Le gel 402 arrive AVEC le repli, et c'est une décision prise seule.** Sans
lui, ce lot ouvrait une porte de génération **gratuite** : un membre de foyer
gelé se voit refuser `generate-meal-v1` (402) et aurait obtenu ici une semaine
entière sous la doctrine empruntée à son maître — le contournement exact que L1
a mesuré et fermé par une porte voisine (19 805 jetons). D13 est écrit sans
nuance : « foyer impayé ⇒ plus personne ne génère, ni maître ni secondaire ».

| Décision | Écarté | Pourquoi | Retour arrière |
|---|---|---|---|
| **Le gel 402 sur la porte de la semaine** | livrer le repli seul et nommer le trou | Un repli qui ouvre une génération gratuite est un repli qui coûte de l'argent le jour où il marche. Effet de bord ASSUMÉ et neuf : le **maître** d'un foyer gelé ne génère plus sa semaine non plus — c'est D13 mot pour mot, et c'est déjà vrai de sa lane repas depuis L1 | retirer un bloc |

**Un changement de forme d'échec, nommé** : une panne de transport sur
`coach_clients` rendait un `500`; elle rend désormais `409 no_coach`
(`loadPublishedDoctrine` dégrade en `load_failed`, `coachId` reste nul). C'est
exactement le comportement de `generate-meal-v1` depuis C1, et la direction est
sûre — on ne compose pas sous une méthode qu'on n'a pas su lire.

### ② UNE FENÊTRE QUI COMMENCE APRÈS DIMANCHE EST REFUSÉE, AVANT LE MODÈLE

`starts_on = 2026-08-26` (un mardi) demandé un mercredi ⇒ le message portait
`today is: wed`, `days to fill, in this order: tue, wed` et `Do not start
earlier than today`. Le modèle a refusé **en toutes lettres**, `422 empty_meal /
lock: disarmed_empty_text`, **après 6,2 s facturées**. Ce n'est pas une
désobéissance : les jetons de jour n'ont pas de date, et il n'existait pas de
réponse juste.

**Le refus, pas la réécriture du prompt** — les deux options étaient ouvertes :

| Décision | Écarté | Pourquoi | Retour arrière |
|---|---|---|---|
| **Refuser `window_beyond_this_week`**, 400, avant tout | dater les jetons dans la consigne | Dater marche aussi, et fait bouger `MEAL_PROMPT_VERSION` — donc **toute** la population (lane individuelle, foyer, fusion, défusion) — pour une forme de fenêtre que l'écran n'a jamais proposée. Le refus est plus étroit : une porte, deux dates | retirer un bloc de garde |
| **La borne est DIMANCHE**, pas `today + 6` | `today + 6` | À six jours, « je prépare lundi prochain » demandé un mardi porte le jeton `mon`, qui **précède** `tue` : la contradiction mesurée, à six jours au lieu de quatorze. `startsOn <= dimanche` referme les DEUX moitiés — pas de retour en arrière d'un jeton, pas de jeton réutilisé (`today + 7` porte celui d'aujourd'hui) | une ligne |

Ce que ça **ne** ferme pas, écrit : la **queue** d'une fenêtre peut toujours
dépasser dimanche (sept jours démarrés vendredi vont jusqu'à jeudi). Les jetons
y restent distincts, la liste commence bien aujourd'hui, et ça n'a jamais été
mesuré comme contradictoire — le refuser retirerait `{kind:"days", count:7}`,
que l'écran propose depuis toujours.

Côté navigateur, le champ « from » gagne un `max` (le miroir
`lastNameableStart`) : le serveur reste l'autorité, l'écran cesse seulement de
**proposer** un geste qui ne marche pas.

### ③ LA PORTE `compose` NE PAIE PLUS LE 409 DE LA BASE

Le jumeau du P0 de L10 ①. Une fenêtre `exact` ou `days` strictement intérieure à
un plan vivant se payait encore `plan_overlaps_existing` **après** le modèle —
et elle est **atteignable par l'écran** : `MealBuilder` envoie
`{kind:"exact", starts_on, duration_days}` avec deux dates que l'élève choisit.

**La règle a déménagé plutôt que d'être réécrite.** `planOverlapVerdict` et
`firstBlockingPlan` vivent dans `meal_plan_window.ts` : ce n'est pas une notion
de fusion, c'est ce que la base fait de deux fenêtres du même compte et de la
même nature. `mergeWindowWritable` en est devenu un **appelant** — son banc de
propriété de 400 formes et son test de fil vers la migration 20260811140000 sont
intacts, et ce qui reste dans `household_merge.ts` est ce qui est propre à la
fusion (la ligne du foyer est celle qu'elle remplace quand les deux démarrent le
même jour).

Les deux portes `compose` lisent maintenant leurs plans vivants et refusent
`plan_overlaps_existing` — **le mot de la base**, déjà mappé à l'écran — avec
un `detail` qui distingue « ta fenêtre est à l'intérieur » de « tu as déjà un
plan qui démarre ce jour-là ou après ».

**Deux limites écrites.** *(a)* Ce n'est pas l'autorité : la base tranche
toujours, ce refus évite seulement de la payer. Une lecture en panne ne bloque
donc rien (`live_plan_windows_unreadable` dans les `issues`). *(b)* Sur la lane
foyer, on relit `householdPlans`, dont le prédicat est plus **étroit** que celui
de la RPC (il filtre en plus sur `household_id`, décision de L5) : un maître qui
aurait changé de foyer garderait un cas rare qui paie le modèle avant le 409. Un
second lecteur avec un troisième prédicat est la dette que ce chantier a payée
deux fois le 2026-08-12.

### ④ LE TROU EST LISIBLE, ET IL N'EST PLUS HÉRITABLE

Un plat dont un ingrédient porte une cible chiffrée est rejeté **entier** — le
verrou est **juste**, antérieur au lot, et il n'a pas bougé d'un caractère. Sur
une fusion, la matière du plan personnel citait « whey protein 90 g » et **les
cinq petits-déjeuners du foyer sont tombés d'un coup**. Puis la **défusion a
recopié le trou** : sa consigne montre le plan de base et demande d'en rester au
plus près, et le modèle obéit — 14 titres sur 14. Deux plans du foyer
consécutifs sans petit-déjeuner mercredi.

**Lisible** — `emptySlotsIn` (`meal_generation.ts`) compte les cases de la
fenêtre que personne ne remplit, avec **les mêmes entrées que la consigne**
(le rythme, les absences, les apports fixes). Le parseur pousse **une** `issue`
agrégée (`empty_slots: wed/breakfast, thu/breakfast`) et rend `empty_slots`,
écrit dans `generated_from` par les deux lanes. Sans lui, « ce plat a été
rejeté » et « il n'y a plus aucun petit-déjeuner cette semaine » laissaient la
même trace.

**Non héritable** — `buildMergeBlock` et `buildUnmergeBlock` prennent un
paramètre `gaps` **REQUIS** et nomment la case : *« These moments have NO dish
in the plan above: … That is a GAP, not a choice »*. En **dernier**, juste après
la liste qu'il corrige — « reste au plus près » vient d'être écrit, et sans
cette précision le trou en fait partie.

⚠️ **On ne rebouche rien.** Choisir quoi mettre dans la case est une décision de
produit que personne n'a prise. Le bloc **nomme** l'accident ; le modèle compose
cette case comme il compose toutes les autres — le tronc le lui demande déjà
(« a day missing one of those is a hole »), et ce lot ne fait que retirer la
contradiction entre cette phrase-là et « reste au plus près du plan de base ».

**`HOUSEHOLD_PROMPT_VERSION` bump `v7_merge_anchor` → `v8_plan_gaps`.** Règle de
v4 appliquée telle quelle : la population qui voit une consigne différente est
« fusion ou défusion dont le plan montré porte un trou ». Toutes les autres
rendent un prompt **byte-identique à v7** (`gaps: []` est l'identité), et deux
tests le tiennent. ⚠️ **L'ancre de C1 n'est pas touchée** — ni son texte, ni son
ordre, ni son exclusion du budget de plats ; les assertions de source de C1
tiennent à l'identique, et l'équilibrage ancre/matière reste à un autre lot.
`MEAL_PROMPT_VERSION` ne bouge pas : rien de C2 n'entre dans le tronc.

### ⑤ UN PLAT SANS JOUR NE PASSE PLUS EN SILENCE

`meal_generation.ts` nommait un jeton de jour **inconnu** et laissait passer un
jour **absent**. Mesuré : un plan portait **16 entrées `dishes` pour 3 jours**,
dont **7 sans `day` ni `slot`** — les **mêmes 7 titres que `preparations`**. Le
modèle avait rendu ses préparations deux fois, le plafond relevé par
`dishBudgetFor` avait laissé la place, et `issues` ne disait rien. Les autres
plans du run : **0 entrée sans jour sur 14-15**. Le cas n'apparaît qu'avec le
budget de fusion.

Sur une fenêtre de **plusieurs jours**, un plat qui finit sans jour utilisable
est désormais **nommé et jeté** : il n'est ni affichable dans la grille, ni
cochable, ni rapprochable d'une photo, il occupe une place du plafond — donc il
coûte un vrai repas de fin de fenêtre — et il gonfle la liste de courses de ce
que la préparation achète déjà. **Sur une fenêtre d'UN jour, on garde** : il n'y
a qu'un jour, le plat est situé, et `windowSplit` le range déjà dans la fenêtre.
C'est le cas qui passe, et il est testé.

### Les 26 mutations — chacune cassée, vue rouge, restaurée

**① (5)** : le repli retiré (retour au chargeur direct) · la lecture directe de
`coach_clients` remise devant le repli · le gel 402 retiré · une **seconde**
résolution du foyer · le repli débranché par un renommage.

**② (4)** : la borne ramenée à `today + 6` · la garde désarmée sur les deux
portes · la garde retirée.

**③ (9)** : la clause « englobe » désarmée · la clause « commence le même jour
ou après » désarmée · le chevauchement ignoré · `replacesId` ignoré (**le cas
qui passe**) · le raccourci `replace_current` de la fusion retiré · le refus
désarmé sur les deux portes · le refus rendu sans son mot.

**④ (8)** : l'absence comptée comme un trou · l'apport fixe compté comme un trou
· le plat sans moment qui ne couvre plus sa journée · la case vide non nommée ·
le constat débranché · le trou jamais dit au modèle · le trou dit **même quand
il n'y en a pas** · le trou placé **avant** la liste qu'il corrige · les trous
jamais passés aux deux blocs · la version non bumpée.

**⑤ (3)** : le plat sans jour plus jeté · jeté **aussi** sur une journée (le cas
qui passe) · la coupe non nommée.

**Trois faux-verts trouvés par ces mutations, tous dans mes propres tests de
position.** *(a)* `if (false && windowStartsBeyondDayTokens(…))` laissait le
marqueur au bon rang : le test cherchait un NOM, il cherche désormais la FORME
de la garde (le prédicat en tête de son `if`, et le refus dans son corps).
*(b)* `keel_household_is_coveredX` **contient** `keel_household_is_covered` — un
`includes` sur un nom reste vert sur un appel renommé. *(c)* `gaps: unmergeGaps`
remplacé par `gaps: []` laissait tout vert : le module pur, ses cas qui passent,
les blocs — pendant que la défusion recopiait le trou comme avant. C'est le mode
d'échec n°1 de ce chantier, et il n'avait pas de test de câblage.

### Ce qui n'est pas prouvé, et ce qui reste ouvert

1. **Aucun run réel.** Pas un appel HTTP, pas une génération. Aucun secondaire
   n'a reçu un 200 de `generate-week-plan-v1` ; aucun modèle n'a lu la ligne qui
   nomme un trou.
2. **`generate-week-plan-v1` n'a toujours été passé au crible par aucune
   campagne** (question ouverte n°2). Ce lot y ajoute deux gardes et en retire
   une lecture ; tout y est prouvé par la source et par des tests purs.
3. **Le trou n'est pas dit à l'ÉCRAN.** `empty_slots` vit dans `generated_from`
   et dans les `issues` ; `householdPlanTrace.ts` ne le lit pas. Un élève voit
   toujours une case vide sans phrase.
4. **La garde ② ne couvre pas la queue d'une fenêtre** (voir §②). Décidable,
   non mesuré, non fermé.
5. **Le refus ③ voit moins de lignes que la RPC sur la lane foyer** (voir §③).
6. **`window_beyond_this_week` et `plan_overlaps_existing` n'ont jamais atteint
   un client.** Les deux sont mappés dans `planRefusals.ts` et écrits dans
   `en.ts`, et le test de dérive exige la bijection dans les deux sens.
7. **Deux rouges préexistants NON touchés**, comme à L4→C1 :
   `_shared/chat/recent_history_test.ts` et une erreur de typage dans
   `_shared/action_occurrences_test.ts`.

## C3, ce qui est construit — 2026-08-12

> ⚠️ **Rien n'a été exercé en conditions réelles.** Aucun appel HTTP, aucune
> génération modèle. Ce qui suit est prouvé par des tests purs, des tests de
> position sur la source, **un bloc de contrôle SQL rejoué et annulé** et
> **23 mutations**. Suite keel : **2 630 verts** ; frontend keel : **597 verts**.
> **Une migration** (`20260812210000`), inscrite au registre à la main.

Six dettes nommées. **Deux sont des décisions de produit** (① et ③) : l'une se
solde par *ne rien fermer et rendre le trou mesurable*, l'autre par *garder, et
le déclarer*.

### ① LE COMPTE SANS FOYER — ON MESURE, ON NE FERME RIEN

**Décision : aucune garde neuve.** `_shared/keel/solo_access.ts` LIT les droits
qui existent (`has_app_write_access`, `keel_coach_is_solvent`), n'en applique
aucun, et écrit ce qu'il a lu — dans un log nommé (`keel.access.observed`, sur
les deux portes, même `tag`) **et sur la ligne du plan**
(`generated_from.access`, écrit **toujours**, cas nominal compris).

Le trou de la question ouverte n°1 cesse d'être une hypothèse :

```sql
select generated_from -> 'access' ->> 'state', count(*)
  from student_generated_meals group by 1;
```

| Option | Écartée parce que |
|---|---|
| Brancher `has_app_write_access` | **le piège nommé.** Elle PRÉCÈDE KEEL et lit `profiles.trial_end` + `subscriptions` **du compte lui-même** : elle couperait, dès le déploiement, le membre de foyer (dont le droit est celui du foyer) et l'élève dont le siège est payé par son coach. « Un refus qui coupe un client qui paie ne se répare par aucun nouvel essai » |
| Refuser sur « pas de coach » | redirait `no_coach` avec un autre mot |
| Inventer une règle | ce serait écrire un **prix**, un soir, sans l'utilisateur |

**Les cinq états, et pourquoi `unknown` existe.** `household` (D13/L1 a déjà
tranché) · `coach_seat` · `own_subscription_or_trial` · `none` · `unknown`.
« Je n'ai pas su lire » et « il n'a aucun droit » sont deux faits différents :
les confondre ferait grossir le compteur à chaque panne de base, et on
réparerait la mauvaise chose. Un compte **sans coach** n'est PAS `unknown` —
il n'y avait rien à interroger.

**Coût : zéro lecture pour un membre de foyer** (court-circuit, testé), deux
lectures pour un compte sans foyer. **Retour arrière** : retirer l'appel et la
clé. Aucune migration, aucun refus à défaire.

Un test de source tient l'**ABSENCE** du refus (`status: 402|403` interdit dans
les 1 200 caractères qui suivent la mesure), sa position **avant** le modèle, et
l'interdiction de recopier une règle de facturation en TypeScript.

### ② LA RÉCONCILIATION N'ÉCRASE PLUS LA COLONNE D'UN TIERS

Migration `20260812210000_food_preference_targeted_write.sql` :
`keel_write_food_preferences(p_user, p_expected, p_preferences, p_origins)`,
`service_role` seul.

- **Écriture ciblée** : `jsonb_set` sur les deux seules clés que le module
  possède. Le rythme de repas, la capacité de cuisine, les absences d'un
  titulaire survivent **par construction**, pas par condition.
- **Concurrence optimiste dans le PRÉDICAT** : `p_expected` comparé à la valeur
  live dans le `where` de l'`update`, en un seul énoncé. Une course sur la même
  clé rend `stale_snapshot`, **et on ne réessaie pas** — réessayer serait
  décider que notre copie gagne. `is not distinct from`, pas `=` : la clé peut
  être absente, et `null = null` vaut NULL (le trou exact que L7 avait trouvé
  dans son propre bloc de contrôle).

**Ce qu'on ne fait PAS, et c'est écrit dans la migration : `updated_at` n'est
pas préservé.** Le trigger `student_goals_set_updated_at` est inconditionnel et
sa fonction (`tg_set_updated_at`) est **partagée** ; le contourner demanderait
soit de la rendre conditionnelle pour tout le monde, soit un
`session_replication_role` qui désarmerait **en silence** tout trigger futur sur
cette table. Et ce n'est pas que le coût : la réconciliation n'écrit que si le
contenu change vraiment, donc `updated_at` dit une vérité sur **la ligne**. Ce
qu'il ne dit pas, c'est « cette personne a agi » — deux questions différentes.
**Vérifié le 2026-08-12 : aucun lecteur ne l'INTERPRÈTE** — ni edge, ni écran,
ni SQL, ni `order by`. Le seul consommateur est l'**export RGPD**, qui la dumpe
telle quelle ; un dump ne se trompe pas de personne, il rend l'octet de la
ligne. Le jour où un lecteur l'interprète, la réponse est de lui faire lire le
**geste**, pas de faire mentir l'horodatage d'une ligne.

Bloc de contrôle SQL, **4 cas**, rejoué puis annulé : la copie à jour passe · la
clé d'un tiers **survit** · une copie périmée rend `stale_snapshot` sans écrire ·
une forme illégale est nommée. Deux mutations en base (prédicat désarmé ⇒ la
copie périmée passe ; retour à l'écrasement ⇒ la clé du tiers disparaît), les
deux vues rouges.

### ③ LA DATE DE NAISSANCE SURVIT — ON GARDE, ET ON LE DÉCLARE

**Décision : on garde.** Le prénom répond à « pour qui je cuisine ». La date de
naissance résout l'âge (`keel_household_member_age`), donc la direction de
service, donc les **parts** — et pas seulement les siennes : retirer une bouche
datée change la casserole de **tout le foyer**. L'effacer dégraderait la
composition d'un foyer que la personne quitte, ce qui est le dégât exact que D3
existe pour empêcher.

**Ce qui manquait n'était donc pas l'effacement, c'était la déclaration.**
`household_members` entre dans `account-export-v1` — **sa ligne, et sa ligne
seule** (`user_id = <lui>` ; exporter le roster ferait de l'export RGPD de l'un
une divulgation sur les autres) — dans un fichier à part, `mon_foyer.json`, qui
porte la ligne **et** la phrase : ce qui survit, quels champs, pourquoi, et
comment l'effacer aussi (`departs_with_account`).

*Option écartée* : effacer `birth_date` à la purge. Coût — toutes les bouches
détachées repassent en `unknown`, donc en part standard, **en silence**, et le
foyer ne peut pas la ressaisir puisqu'il ne sait pas qu'elle a disparu.
*Retour arrière* : une ligne dans `keel_household_purge_user`, plus la ligne
d'export. Un test épingle les deux moitiés ensemble — si la purge se met à
effacer la date, l'assertion tombe **et** la phrase d'export devient fausse au
même instant.

⚠️ **`joined_at`, pas `created_at`** : cette table n'a pas de `created_at`, et
un tri sur une colonne inexistante ferait tomber la lecture dans le filet
`tables_indisponibles` — un export silencieusement **vide** sur la seule table
qui survit à la purge. Mutation-testé.

**Non traité, nommément** : `keel_gdpr_lifecycle_test.ts` (`PIVOT_TABLES`) exige
« 0 ligne après la purge », ce que cette table ne peut pas satisfaire **par
décision**. L'y ajouter demanderait une troisième catégorie (« détachée »), et
ce test est de toute façon gaté par une pile vivante.

### ④ LA PROPOSITION NE PROMET PLUS UN BOUTON QUE LE GESTE REFUSE

C'était le **seul** écart connu entre la proposition et le geste, écrit au
registre depuis L5 (§3, « la proposition ne prédit pas la présence »).

**Ce qui a changé depuis L5, et qui rend la prédiction honnête** : l'objection
d'alors était « une fenêtre qui n'est pas encore celle d'un plan ». Depuis
L10 ①, `bestMergePair` rend `recomposed` — la fenêtre que le geste **écrira**,
celle-là même sur laquelle le générateur résout la présence. Ce n'est donc plus
une seconde idée de la fenêtre : c'est la même.

| Où | Quoi |
|---|---|
| `_shared/keel/household_presence.ts` | `memberMealCells` — **extraite** de `resolveWindowPresence`, qui la lit désormais pour `absentAllWindow`. Une seule définition de « quels repas cette bouche prend ici », trois lecteurs |
| `_shared/keel/household_merge.ts` | `MERGE_MEMBER_AWAY_ALL_WINDOW` — le mot du refus, **extrait en constante** et partagé par le refus et la prédiction |
| `_shared/keel/household_merge_notice.ts` | la prédiction, **avant** le plafond (le motif le plus précis gagne : « il n'est pas là » ne se répare pas en attendant lundi) |
| `household-merge-notices-v1/index.ts` | `away_days` du roster (rendu et jamais lu) + le rythme du maître, **avec le même repli** que le générateur |

**Même partage que D17 et que le plafond** : ça coupe la **proposition**, jamais
l'**avertissement** de D8 — `unmerge` et `dismiss` ne dépendent de la présence
de personne. Et `rhythm` vide **ne prédit rien** : sans rythme la grille n'a
aucune case, et « aucune case » se lirait comme « absente partout » — un foyer
qui n'a rien déclaré perdrait **toutes** ses propositions, en silence.

**Le jeton n'entre PAS dans `MERGE_SKIP_KEYS`**, exprès : il a déjà ses mots
dans `EDGE_REFUSAL_KEYS`, et l'y ajouter ferait deux phrases pour un même mot —
le défaut que `mergeCardSkipKey` existe pour ne pas commettre. Le test de dérive
du front tient les deux moitiés.

### ⑤ DEUX PLANS ADJACENTS PRENNENT LA MAIN (O1, refermé)

`plansCoveringWindow` (`household_hand.ts`) demande, **jour par jour**, si un
plan à lui couvre — au lieu de chercher un plan unique qui couvre tout.

**La règle n'a pas bougé** : on n'exclut que quelqu'un dont **aucun jour** n'est
découvert. Le motif écrit du recouvrement total — « le retirer, c'est cuisiner
sans lui deux jours où il n'a rien » — ne s'applique tout simplement pas ici :
il a son plan tous les jours. Ce qui change est le **nombre de plans** autorisés
à satisfaire la règle, et pourquoi : la contrainte d'exclusion interdit le
chevauchement, **pas l'adjacence** — deux plans personnels vivants adjacents
sont un état **nominal**.

- **Motif distinct** : `personal_plans_cover_window`, **une entrée de trace par
  plan** (il n'y a pas « le » plan qui l'a retiré, il y en a deux). Le cas à un
  seul plan garde `personal_plan_covers_window`, **byte-identique**.
- **Une `issue` par PERSONNE, pas par plan** (générateur) et **une ligne d'écran
  par personne** (`householdPlanTrace.ts`) : sans ça, « Zoé a pris la main »
  s'écrivait deux fois, et tout décompte de `member_took_the_hand` comptait des
  plans en croyant compter des gens.
- `covers_window` d'une **défusion** suit l'union : le laisser sur « un seul
  plan couvre » ferait dire « il n'a rien à manger ces jours-là » d'une personne
  qui a son plan tous les jours — la seule phrase que ce champ porte (L5 §4).
- **Retour arrière** : retirer la branche `coveringTogether`, une condition.

### ⑥ LE CONSTAT DE FORME DIT CE QUI EST, REPAS PAR REPAS

`observed = marks.length > 0 ? "dedicated_dish" : "common_pot"` : **une** marque
suffisait. Un plat parallèle sur **neuf** créneaux rendait `ok: true` — donc un
plan où la personne reprise mange la casserole commune **huit fois sur neuf**,
malgré le conflit de direction de service qui avait fait descendre le barreau,
passait pour un succès.

**Ce n'est toujours qu'un CONSTAT** : aucune relance, aucun refus, aucun quota —
une `issue` nommée, un log, et `generated_from`. Ce qui change est sa fidélité :

- `observed` a **trois** états : `common_pot` · `some_meals_dedicated` ·
  `dedicated_dish` ;
- `meals: {atTable, dedicated, fromCommonPot}` — les **comptes bruts**, dans le
  log et dans l'archive. Même posture que `week_review.ts` : l'étiquette est un
  mot, et un mot se réécrit ; les nombres survivent ;
- `honoured` est faux dès qu'**un** de ses repas sort de la casserole commune.
  Pas de seuil inventé : le barreau ②/③ dit littéralement « X ne peut PAS être
  servie depuis la casserole commune », et D6 parle de direction de service, pas
  de fréquence.

**Le dénominateur est REQUIS et ce sont SES cases** (`eaterCells`, résolues par
`memberMealCells` — la même fonction que ④). Une bouche absente jeudi midi ne
« mange pas la casserole commune » ce midi-là : elle ne mange pas. Compter la
case ferait un faux négatif sur chaque absence partielle. `atTable === 0` rend
le constat **muet** plutôt que faux.

**Ce que ça coûte, assumé** : le constat dira « non » plus souvent. C'est le but,
et une fusion dont la fenêtre recomposée déborde le plan personnel (L10 ①) ne
peut pas être honorée à 100 % dans son budget de plats — c'est un **fait sur le
produit**, pas un défaut du constat.
**Retour arrière** : `observed !== "common_pot"`, une ligne ; les trois
compteurs restent.

### Les versions de prompt — aucune ne bouge, et voici pourquoi

`MEAL_PROMPT_VERSION` et `HOUSEHOLD_PROMPT_VERSION` (`v8_plan_gaps`) sont
**inchangées**. Règle de v4 appliquée telle quelle (« quelle **population** voit
une **consigne** différente ») : **aucune**. Rien de ce lot n'entre dans un
bloc de prompt — ni son texte, ni son ordre, ni leur nombre. ⑤ change **qui est
à table**, donc une DONNÉE (`servings`, la liste des bouches) : c'est le cas de
L3 mot pour mot, « une seconde raison qu'une ligne n'apparaisse pas, relisible
sur `generated_from`, pas sur la version ». ⑥ est un filtre **après**
génération. ①②③④ ne touchent aucun prompt. Bumper aurait invalidé le cache
d'une population entière pour un prompt byte-identique.

### Les 23 mutations — chacune cassée, vue rouge, restaurée

**En base (2)** : le prédicat de concurrence désarmé (la copie périmée passe) ·
l'écrasement de colonne rétabli (la clé du tiers disparaît).

**① (4)** : l'ordre de lecture inversé (siège de coach vs droit du compte) · la
panne de lecture comptée comme un trou · le court-circuit du foyer retiré ·
`access` rendu conditionnel dans `generated_from`.

**③ (4)** : le tri revenu sur `created_at` · la phrase de survie retirée ·
`birth_date` retirée de l'allowlist · la lecture scopée par `household_id` (donc
le roster entier dans l'export RGPD d'une seule personne).

**④ (4)** : la prédiction désarmée · la fenêtre jugée redevenue `window` au lieu
de `recomposed` · le bouton `merge` conservé malgré l'absence · l'absence qui
coupe **aussi** l'avertissement de D8.

**⑤ (5)** : l'union retirée · un jour manquant toléré (la garde coupe tout) · le
motif de l'union appliqué au cas nominal · `covers_window` rétréci au plan
unique · le dédoublonnage d'écran retiré (deux fois la même phrase sous le même
nom).

**⑥ (4)** : `observed` revenu à « une marque suffit » · `honoured` retombé sur
`observed !== "common_pot"` · le dénominateur pris sur les cases du **plan** au
lieu des siennes · `eaterCells` débranché dans le générateur.

**Un faux-vert trouvé par la mutation, dans mon propre décor.** Le test « le
siège de coach passe avant le droit du compte » posait `appWriteAccess: false` —
où les **deux** ordres de lecture rendent le même mot. La mutation « inverser
l'ordre » restait verte. Décor refait avec les deux vrais, et la mutation devient
rouge.

### Ce qui n'est pas prouvé, et ce qui reste ouvert

1. **Aucun run réel.** Pas un appel HTTP, pas une génération. `generated_from.
   access` n'a jamais été écrit par une vraie requête ; `mon_foyer.json` n'a
   jamais été zippé ; `keel_write_food_preferences` n'a jamais été appelée
   depuis une fonction edge (seulement depuis psql, dans son bloc de contrôle).
2. **La prédiction de ④ n'a jamais été confrontée à un vrai roster.** Elle est
   prouvée sur le module pur et par la source ; le fait que
   `keel_household_roster_for` rende bien `away_days` à ce lecteur-ci est lu
   dans la migration, pas mesuré en HTTP.
3. **⑤ change QUI est composé, et ça n'a été exercé que sur le module pur.**
   La direction est celle qui retire une assiette : si l'union se trompait, une
   personne perdrait des repas. Le cas « un jour découvert au milieu » est testé
   et mutation-testé, mais aucun plan réel n'a été composé avec deux plans
   adjacents en base.
4. **⑥ rendra `honoured: false` plus souvent, et personne ne l'a encore vu.**
   L'écran de L8 affiche une ligne dans ce cas : sa fréquence réelle est
   inconnue. Si elle devient permanente, c'est O5 qui appelle une décision
   (refuser, relancer), pas le constat qu'il faut rétrécir.
5. **② : la fenêtre reste ouverte sur les AUTRES clés.** Deux gestes qui
   touchent `eating_rhythm` en même temps s'écrasent toujours — ce chemin-là
   n'est pas passé par la nouvelle RPC, et il n'a jamais été mesuré.
6. **`deploy-manifest-check` reste à 52** violations, comme après C2 : ce lot
   n'en ajoute aucune.
7. **Deux rouges préexistants NON touchés**, comme à L4→C2 :
   `_shared/chat/recent_history_test.ts` et une erreur de typage dans
   `_shared/action_occurrences_test.ts`.

## Questions encore ouvertes

1. **Les comptes individuels sans foyer restent sans garde de paiement.** D13
   ferme la porte du foyer ; un compte solo continue de générer sans droit
   vérifié. Mesuré : 19 805 jetons. ⚠️ **C3 ① a tranché de NE RIEN FERMER** —
   aucune règle de facturation n'existe pour ce cas, et le seul candidat
   disponible (`has_app_write_access`) couperait des membres de foyer et des
   sièges de coach qui paient. Le trou est désormais **mesurable** : un état
   nommé sur chaque plan (`generated_from.access.state`, cinq valeurs, écrit
   toujours) et un log `keel.access.observed` sur les deux portes. **La
   décision de facturation reste à prendre, avec un chiffre en face.**
2. **`generate-week-plan-v1` n'a jamais été testé** — troisième générateur, passé
   au crible par aucune campagne. ⚠️ **C2 y a posé deux gardes** (le repli de
   doctrine par le foyer, et le gel 402 de D13) et en a retiré une lecture
   (`coach_clients`, qui doublait celle du chargeur). Tout y est prouvé par la
   source et par des tests purs ; **rien n'y a jamais reçu un 200**.
3. ~~**Comment un secondaire sait-il qu'il PEUT prendre la main ?**~~
   **Répondu par L8** : `/app/plan` porte une carte qui dit la posture par
   défaut — être composé dans le plan du foyer est le cas NORMAL, aucune phrase
   ne reproche de ne rien faire — puis ce que prendre la main coûte (sa cuisson
   et ses courses), puis le bouton. ⚠️ **Elle n'est pas encore atteignable** :
   la route est ouverte, mais un secondaire sans coach reçoit `no_coach` du
   générateur. Ce rattachement crée un siège, donc il touche la facturation, et
   il attend une décision.
