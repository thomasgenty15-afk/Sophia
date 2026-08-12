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
| **D6** | Échelle de fusion : ① même plat, ratios différents ② plats différents, même session de cuisson ③ sessions séparées. Renonce dès qu'un plat commun forcerait quelqu'un **hors de sa direction de service** — critère vérifiable, pas jugement de goût. | ⬜ à faire |
| **D7** | Qui n'a pas de plan **validé** au moment où le maître compose est automatiquement pris dans le plan du foyer. La composition n'attend jamais personne. | ✅ livré (L3) |
| **D8** | Validation **après** la fusion : le maître est averti, et il a trois sorties — refaire sans ce user (*défusion*), refusionner à partir de son plan, ou refuser. Dans tous les cas le user garde son plan. Consigne de défusion, mot pour mot : *rester au plus près du plan de base, sans user X*. | ⬜ à faire |
| **D9** | Le maître **accède** à tous les plans, mais sa surface de cuisine n'affiche **que** le plan qu'il cuisine. Un plan validé non fusionné n'y apparaît pas : le but est de simplifier sa cuisine, pas de lui faire suivre N plans. Un secondaire voit le plan du foyer et le sien. | ⬜ à faire |
| **D10** | La fusion est **manuelle**, déclenchée par le maître, sur proposition : *« le plan de X a été validé, voulez-vous le fusionner ? »* | ⬜ à faire |
| **D11** | Plafond : `N + 3` fusions par foyer et par semaine ISO, N = comptes actifs. Compté en base, refus nommé `merge_quota_exhausted`. | ⬜ à faire |
| **D12** | Pas de reprise des plans produits par l'ancien chemin : ils seront régénérés. | ✅ acté |
| **D13** | **Le verrou de paiement est au niveau du FOYER.** Foyer impayé ⇒ plus personne ne génère, ni maître ni secondaire. Un compte **sans foyer** n'est pas concerné : les comptes individuels existent et ne demandent pas de foyer. | ✅ livré (L1) |
| **D14** | **La présence se déclare.** Le maître doit pouvoir marquer **qui est là, et quand**. Tout le monde présent est le cas simple ; une absence se marque, et elle change les parts sans supprimer la session de cuisson. | ✅ livré (L2) |
| **D15** | **La fusion opère sur l'INTERSECTION des fenêtres.** Un secondaire peut couvrir mercredi→dimanche quand le foyer couvre lundi→dimanche. Elle s'arrête d'elle-même là où les fenêtres divergent. | ⬜ à faire |
| **D16** | **Le pivot est le premier jour non encore consommé**, pas la date de courses. Une fusion ne touche que les jours à venir, et la proposition le dit : *« son plan couvre 5 jours, dont 2 déjà passés — je peux fusionner les 3 restants. »* | ⬜ à faire |
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
| **L4** | **Le moteur de fusion (D6, D15, D16)** — lit les plans personnels validés, applique l'échelle, opère sur l'**intersection** des fenêtres, s'arrête au premier jour non consommé, écrit `merged_from`. | L3 | Le cœur |
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
| **O3** | La réponse HTTP ne porte pas `hand` — l'exclusion n'y est lisible que par un id opaque dans `issues` | `generate-household-meal-v1/index.ts:1466` | **L8** en aura besoin pour dire *pourquoi* on cuisine pour un de moins |
| **O4** | Un `reference_member_id` déclaré qui prend la main est écarté **en silence** | `household_composition.ts:110-119` | Mineur, reconstructible par `hand.taken`. Non exercé aujourd'hui (`reference_member_id` est NULL partout) |

**Ce qui n'est pas prouvé** : que les allergies ne suivent pas l'exclusion — c'est
lu dans le code (`accountIds` est calculé **avant** le split) et confirmé par un
log (`"members":4,"accounts":2` alors qu'une bouche a pris la main), mais aucun
allergène réel n'a été posé sur la personne exclue.

## Ce que L4 défait

`generate-household-meal-v1` **change de nature** : il compose aujourd'hui, il
devra composer **puis** fusionner. Ce qu'il garde : la garde de gel, l'union des
allergies du foyer, la résolution du foyer, le plafond de bouches, et le fait de
composer pour toutes les bouches sans compte.

## Questions encore ouvertes

1. **Les comptes individuels sans foyer restent sans garde de paiement.** D13
   ferme la porte du foyer ; un compte solo continue de générer sans droit
   vérifié. Mesuré : 19 805 jetons. À trancher séparément.
2. **`generate-week-plan-v1` n'a jamais été testé** — troisième générateur, passé
   au crible par aucune campagne.
3. **Comment un secondaire sait-il qu'il PEUT prendre la main ?** L'écran doit le
   dire, sinon la posture par défaut est invisible et personne ne l'exerce.
