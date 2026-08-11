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
| **D2** | ~~Plans individuels pour tous les titulaires~~ → **le plan du maître est le plan du foyer**; seuls les secondaires qui prennent la main ont un plan personnel. | 🔴 **révisé le 12** |
| **D3** | Les bouches sans compte n'ont pas de plan individuel. Elles n'existent que comme parts dans le plan du foyer. | ✅ tenu |
| **D4** | Préférences durables **et** mémoire de chaque titulaire entrent dans la composition, avec un plafond de tokens par membre et la garde de non-divulgation étendue. | ⬜ à faire |
| **D5** | Plats séparables en composants : servir `muscle_gain` et `fat_loss` d'une seule casserole n'est possible que si le plat se re-proportionne. Le répertoire se rétrécit, c'est le prix assumé. | ⬜ à faire |
| **D6** | Échelle de fusion : ① même plat, ratios différents ② plats différents, même session de cuisson ③ sessions séparées. Renonce dès qu'un plat commun forcerait quelqu'un **hors de sa direction de service** — critère vérifiable, pas jugement de goût. | ⬜ à faire |
| **D7** | Qui n'a pas de plan **validé** au moment où le maître compose est automatiquement pris dans le plan du foyer. La composition n'attend jamais personne. | ⬜ à faire |
| **D8** | Validation **après** la fusion : le maître est averti, et il a trois sorties — refaire sans ce user (*défusion*), refusionner à partir de son plan, ou refuser. Dans tous les cas le user garde son plan. Consigne de défusion, mot pour mot : *rester au plus près du plan de base, sans user X*. | ⬜ à faire |
| **D9** | Le maître **accède** à tous les plans, mais sa surface de cuisine n'affiche **que** le plan qu'il cuisine. Un plan validé non fusionné n'y apparaît pas : le but est de simplifier sa cuisine, pas de lui faire suivre N plans. Un secondaire voit le plan du foyer et le sien. | ⬜ à faire |
| **D10** | La fusion est **manuelle**, déclenchée par le maître, sur proposition : *« le plan de X a été validé, voulez-vous le fusionner ? »* | ⬜ à faire |
| **D11** | Plafond : `N + 3` fusions par foyer et par semaine ISO, N = comptes actifs. Compté en base, refus nommé `merge_quota_exhausted`. | ⬜ à faire |
| **D12** | Pas de reprise des plans produits par l'ancien chemin : ils seront régénérés. | ✅ acté |
| **D13** | **Le verrou de paiement est au niveau du FOYER.** Foyer impayé ⇒ plus personne ne génère, ni maître ni secondaire. Un compte **sans foyer** n'est pas concerné : les comptes individuels existent et ne demandent pas de foyer. | ✅ livré (L1) |
| **D14** | **La présence se déclare.** Le maître doit pouvoir marquer **qui est là, et quand**. Tout le monde présent est le cas simple ; une absence se marque, et elle change les parts sans supprimer la session de cuisson. | ⬜ à faire |
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
| **L2** | **La présence (D14)** — marquer qui est là et quand. Aujourd'hui `away_days` est lu sur la ligne du **propriétaire** seul ; l'absence individuelle d'un membre est un trou nommé dans FF-002 §9. | — | Le maître compose pour tout le monde : sans ça il cuisine pour des absents |
| **L3** | **La prise de main (D7, D2)** — un secondaire génère son plan ; sinon il est composé dans celui du maître. Le générateur de foyer doit **exclure** les membres qui ont un plan personnel validé sur la fenêtre. | L1 | C'est la bascule du modèle révisé |
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
