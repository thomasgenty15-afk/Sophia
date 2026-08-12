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
| **D9** | Le maître **accède** à tous les plans, mais sa surface de cuisine n'affiche **que** le plan qu'il cuisine. Un plan validé non fusionné n'y apparaît pas : le but est de simplifier sa cuisine, pas de lui faire suivre N plans. Un secondaire voit le plan du foyer et le sien. | ⬜ à faire |
| **D10** | La fusion est **manuelle**, déclenchée par le maître, sur proposition : *« le plan de X a été validé, voulez-vous le fusionner ? »* | ✅ livré (L5) — le lecteur ; le bouton est L8 |
| **D11** | Plafond : `N + 3` fusions par foyer et par semaine ISO, N = comptes actifs. Compté en base, refus nommé `merge_quota_exhausted`. | ⬜ à faire |
| **D12** | Pas de reprise des plans produits par l'ancien chemin : ils seront régénérés. | ✅ acté |
| **D13** | **Le verrou de paiement est au niveau du FOYER.** Foyer impayé ⇒ plus personne ne génère, ni maître ni secondaire. Un compte **sans foyer** n'est pas concerné : les comptes individuels existent et ne demandent pas de foyer. | ✅ livré (L1) |
| **D14** | **La présence se déclare.** Le maître doit pouvoir marquer **qui est là, et quand**. Tout le monde présent est le cas simple ; une absence se marque, et elle change les parts sans supprimer la session de cuisson. | ✅ livré (L2) |
| **D15** | **La fusion opère sur l'INTERSECTION des fenêtres.** Un secondaire peut couvrir mercredi→dimanche quand le foyer couvre lundi→dimanche. Elle s'arrête d'elle-même là où les fenêtres divergent. | ✅ livré (L4) |
| **D16** | **Le pivot est le premier jour non encore consommé**, pas la date de courses. Une fusion ne touche que les jours à venir, et la proposition le dit : *« son plan couvre 5 jours, dont 2 déjà passés — je peux fusionner les 3 restants. »* | ✅ livré (L4) |
| **D17** | Un réglage **discret** permet au maître de ne plus se voir proposer la fusion pour une personne donnée. Assumé comme un peu brutal, donc caché. | ✅ livré (L5) |
| **D18** | La date de naissance : **sur la fiche de la bouche** pour qui n'a pas de compte, et dans **« about you »** pour le maître. Pas à l'inscription. | ⬜ à faire |

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
| **L7** | **Le plafond de fusions (D11)** — `N + 3` par semaine ISO, en base, `merge_quota_exhausted`. | L4 | |
| **L8** | **Les écrans (D9)** — plan du foyer, plan perso, la proposition, ce qui n'a pas fusionné et pourquoi. | L4, L5 | |
| **L9** | **La date de naissance (D18)** — sur la fiche de bouche (existe déjà) et dans « about you » pour le maître (à vérifier). | — | Sans elle l'objectif du maître est inactif par défaut |
| **L10** | **QA réelle** sur un foyer à objectifs divergents : la prise de main, la fusion, la défusion, le repli séparé, les fenêtres décalées. | tout | |

## L1, ce qui est prouvé — 2026-08-12

La garde est en `generate-meal-v1/index.ts:386-411` (résolution du foyer remontée
à `:350`, premier appel modèle `:841`) et inchangée en
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
| **O1** | Deux plans personnels **adjacents** qui couvrent ensemble toute la fenêtre ne prennent pas la main | `household_hand.ts:249` | **Laissé.** La direction d'erreur est sûre (une assiette de trop), mais le motif écrit du recouvrement total ne s'applique pas : la personne n'a aucun jour sans rien. **À trancher en L4**, qui travaille déjà par jour sur l'intersection — c'est là que l'union de couverture a sa place, pas ici |
| **O2** | **Aucune surface produit n'appelle `keel_validate_meal_plan`** — la prise de main est aujourd'hui inatteignable par un vrai utilisateur | ni front, ni edge | **Bloquant pour L5/L8.** Le mécanisme est juste, la gâchette manque. À ne pas laisser tomber entre deux lots |
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
| **O1 n'est pas tranché** | Il concerne la prise de main, pas la fusion | Deux plans adjacents ne prennent toujours pas la main |

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

### ⚠️ O5 — LE MODÈLE N'OBÉIT PAS AU BARREAU. Ouvert, et c'est un choix de produit

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
3. **La proposition ne prédit pas la présence.** `merge_member_away_all_window`
   se décide sur le rythme de repas et les absences résolus à la composition ; le
   refaire dans le lecteur demanderait une seconde résolution de présence sur une
   fenêtre qui n'est pas encore celle d'un plan. Une proposition peut donc être
   refusée au moment du geste — nommément, sans appel modèle. C'est le seul écart
   connu entre ce que la proposition annonce et ce que la fusion fait.
4. **`covers_window: false` est tracé, et rien n'agit dessus.** Une défusion peut
   sortir quelqu'un dont le plan personnel ne couvre pas tous les jours : il
   n'aura rien à manger ces jours-là. C'est le droit du maître (D8 : « refaire le
   plan du foyer SANS user X »), et le fait est écrit dans l'`issue`
   (`member_unmerged:<id>:uncovered`) et dans `generated_from.household.hand.unmerged`.
   Le dire à l'écran est L8.
5. **Le plafond de L7 n'est pas posé, et le lecteur ne le connaît pas.** Quand il
   le sera, la proposition devra le lire — sinon elle proposera une fusion que le
   quota refuse. Le point d'accroche est `buildMergeNotices`, qui rend déjà un
   `skipped` nommé par bouche.
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
6. **Le chemin d'écriture des préférences n'a AUCUNE concurrence optimiste, et
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

## Questions encore ouvertes

1. **Les comptes individuels sans foyer restent sans garde de paiement.** D13
   ferme la porte du foyer ; un compte solo continue de générer sans droit
   vérifié. Mesuré : 19 805 jetons. À trancher séparément.
2. **`generate-week-plan-v1` n'a jamais été testé** — troisième générateur, passé
   au crible par aucune campagne.
3. **Comment un secondaire sait-il qu'il PEUT prendre la main ?** L'écran doit le
   dire, sinon la posture par défaut est invisible et personne ne l'exerce.
