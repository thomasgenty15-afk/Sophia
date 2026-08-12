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
| **D4** | Préférences durables **et** mémoire de chaque titulaire entrent dans la composition, avec un plafond de tokens par membre et la garde de non-divulgation étendue. | ⬜ à faire |
| **D5** | Plats séparables en composants : servir `muscle_gain` et `fat_loss` d'une seule casserole n'est possible que si le plat se re-proportionne. Le répertoire se rétrécit, c'est le prix assumé. | ⬜ à faire |
| **D6** | Échelle de fusion : ① même plat, ratios différents ② plats différents, même session de cuisson ③ sessions séparées. Renonce dès qu'un plat commun forcerait quelqu'un **hors de sa direction de service** — critère vérifiable, pas jugement de goût. | ✅ livré (L4) |
| **D7** | Qui n'a pas de plan **validé** au moment où le maître compose est automatiquement pris dans le plan du foyer. La composition n'attend jamais personne. | ✅ livré (L3) |
| **D8** | Validation **après** la fusion : le maître est averti, et il a trois sorties — refaire sans ce user (*défusion*), refusionner à partir de son plan, ou refuser. Dans tous les cas le user garde son plan. Consigne de défusion, mot pour mot : *rester au plus près du plan de base, sans user X*. | ⬜ à faire |
| **D9** | Le maître **accède** à tous les plans, mais sa surface de cuisine n'affiche **que** le plan qu'il cuisine. Un plan validé non fusionné n'y apparaît pas : le but est de simplifier sa cuisine, pas de lui faire suivre N plans. Un secondaire voit le plan du foyer et le sien. | ⬜ à faire |
| **D10** | La fusion est **manuelle**, déclenchée par le maître, sur proposition : *« le plan de X a été validé, voulez-vous le fusionner ? »* | ⬜ à faire |
| **D11** | Plafond : `N + 3` fusions par foyer et par semaine ISO, N = comptes actifs. Compté en base, refus nommé `merge_quota_exhausted`. | ⬜ à faire |
| **D12** | Pas de reprise des plans produits par l'ancien chemin : ils seront régénérés. | ✅ acté |
| **D13** | **Le verrou de paiement est au niveau du FOYER.** Foyer impayé ⇒ plus personne ne génère, ni maître ni secondaire. Un compte **sans foyer** n'est pas concerné : les comptes individuels existent et ne demandent pas de foyer. | ✅ livré (L1) |
| **D14** | **La présence se déclare.** Le maître doit pouvoir marquer **qui est là, et quand**. Tout le monde présent est le cas simple ; une absence se marque, et elle change les parts sans supprimer la session de cuisson. | ✅ livré (L2) |
| **D15** | **La fusion opère sur l'INTERSECTION des fenêtres.** Un secondaire peut couvrir mercredi→dimanche quand le foyer couvre lundi→dimanche. Elle s'arrête d'elle-même là où les fenêtres divergent. | ✅ livré (L4) |
| **D16** | **Le pivot est le premier jour non encore consommé**, pas la date de courses. Une fusion ne touche que les jours à venir, et la proposition le dit : *« son plan couvre 5 jours, dont 2 déjà passés — je peux fusionner les 3 restants. »* | ✅ livré (L4) |
| **D17** | Un réglage **discret** permet au maître de ne plus se voir proposer la fusion pour une personne donnée. Assumé comme un peu brutal, donc caché. | ⬜ à faire |
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
| **L5** | **La proposition et la défusion (D8, D10, D17)** — l'avertissement au maître, les trois sorties, le réglage discret. | L4 | |
| **L6** | **Mémoire et préférences par titulaire (D4)** — plafond de tokens par membre, garde de non-divulgation étendue à la composition. | L4 | |
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
2. **La fusion n'est pas COLLANTE.** Recomposer la même fenêtre en `compose`
   ré-exclut la personne : son plan personnel couvre toujours la fenêtre, et
   `resolveHandOff` refait son travail. C'est cohérent avec D10 (chaque
   composition est une décision), et c'est exactement la machinerie que **L5**
   doit poser — relire `merged_from` sur le plan vivant et re-reprendre qui n'a
   pas revalidé depuis. **À ne pas laisser tomber entre deux lots.**
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

## Questions encore ouvertes

1. **Les comptes individuels sans foyer restent sans garde de paiement.** D13
   ferme la porte du foyer ; un compte solo continue de générer sans droit
   vérifié. Mesuré : 19 805 jetons. À trancher séparément.
2. **`generate-week-plan-v1` n'a jamais été testé** — troisième générateur, passé
   au crible par aucune campagne.
3. **Comment un secondaire sait-il qu'il PEUT prendre la main ?** L'écran doit le
   dire, sinon la posture par défaut est invisible et personne ne l'exerce.
