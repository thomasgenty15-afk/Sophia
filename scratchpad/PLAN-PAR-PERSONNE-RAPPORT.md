# Rapport — un plan par personne, et le geste relié à sa session

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-14 · **Aucun `push`, aucun merge.**

| Lot | État | En une ligne |
|---|---|---|
| **1** — retrait du membre de référence | ✅ livré | La carte n'existe plus ; la colonne, la RPC et la cascade sont intactes, et le repli sur le composeur est prouvé par test. |
| **2** — un plan par personne | ✅ livré | Deux vues, `isOwner`-only. Les notes divergent vraiment : trois lignes distinctes, pas des jumelles. |
| **3** — la préparation reliée à sa session | ✅ livré | Un dépliant sous le geste du soir. `cookingSessions` était une prop **morte** ; elle sert de nouveau. |
| ⛔ **Trou mesuré** | **non réparable ici** | Un plat DÉDIÉ n'est attribuable à personne : `dishes[]` ne porte aucun `member_id`. Voir §5. |

**Trois commits** : `8662b2f3`, `ff0b1f59`, `7fd32455`.
`git add -A` n'a **jamais** été utilisé ; chaque commit liste ses chemins, et
chaque chemin a été relu par `git diff` avant d'être stagé.

---

## 0. Ce qui n'a pas été fait, et pourquoi

- ⛔ **`household_portions.ts` n'est pas touché.** Hors périmètre, et la question
  « on garde la bifurcation ou on l'abandonne » appartient à l'humain — c'est la
  question ouverte du chantier voisin, et ce lot y répond de fait par
  l'affirmative *côté affichage* seulement.
- ⛔ **Le moteur de référence n'est pas touché** : ni la colonne
  `households.reference_member_id`, ni la RPC
  `keel_household_set_reference_member`, ni `referenceMemberId()`, ni la cascade.
- ⛔ **Aucune migration, aucune fonction edge, aucun déploiement.** Aucun appel
  modèle non plus, sur aucun chemin des trois lots : tout est du rendu de
  données déjà calculées.
- ⛔ **Aucune commande à risque n'exécutée** — ni `db push`, ni `db reset`, ni
  `functions deploy`, ni `secrets`, ni `link`. **Aucune n'est nécessaire pour
  livrer ce chantier**, et il n'y en a donc aucune à faire exécuter par un
  humain.
- ⛔ **`en.ts` / `fr.ts` ne sont pas commités** (voir §7).
- ⛔ **`api/servingDivergence.ts` n'est pas supprimé** alors qu'il est devenu
  orphelin — décision documentée au §6.

---

## 1. Lot 1 — le membre de référence

### Ce qui est parti

`frontend/src/keel/components/plan/ReferenceMemberCard.tsx` (supprimé), son
import et son montage dans `StudentWeekPlanPage.tsx`, l'état `referenceBusy`
devenu mort, et le wrapper client `setReferenceMember` dans `api/household.ts`.

La plainte, et le fond qui lui donne raison : la carte faisait arbitrer entre
deux méthodes en annonçant que ça changeait « ce qu'on cuisine », **sans jamais
montrer l'autre version**. Personne ne peut choisir entre deux plans dont un
seul existe.

### L'audit d'appelants — commentaires retirés

| Symbole | Appelants vivants AVANT | APRÈS |
|---|---|---|
| `ReferenceMemberCard` | 2 (`StudentWeekPlanPage`: import + montage) · 0 dans `HouseholdPage` (commentaire seul) · 1 dans `docs/…/FF-043` | **0** dans le code |
| `setReferenceMember` | 1 définition + 2 (`StudentWeekPlanPage`: import + appel) | **0** |
| `distinctServingDirections` (front) | 2 (`ReferenceMemberCard`) | **0** — orphelin gardé, §6 |
| `servingDirectionsDiverge` | **0 déjà avant ce lot** | 0 |

⚠️ Le comptage a été fait **commentaires retirés** (`/* */`, `{/* */}`, `//`) :
`HouseholdPage.tsx` cite `ReferenceMemberCard` en commentaire, et un grep naïf
l'aurait compté vivant.

### La preuve — un foyer sans référent compose comme avant

`frontend/src/keel/api/householdReference.int.test.ts`, **8 tests**, qui
importent `referenceMemberId` **depuis le module serveur** au lieu d'en recopier
la règle (patron de `api/servingDivergence.ts` et `lib/groceryWaves.ts`).

```
sans référent déclaré, le composeur gouverne — le défaut, pas un vide      ✓
un référent DÉJÀ déclaré continue de gouverner — le retrait n'efface rien  ✓
un mineur ne gouverne ni par déclaration ni par défaut                     ✓
ni référent ni composeur ⇒ null                                            ✓
`api/household.ts` n'appelle plus la RPC d'écriture                        ✓
l'écran du plan ne monte plus la carte et n'importe plus l'écrivain        ✓
la RPC et la colonne, elles, sont toujours là                             ✓
le moteur lit toujours la colonne et la passe à la cascade                ✓
```

**Muté pour montrer que ça mord** : en réintroduisant la chaîne
`ReferenceMemberCard` dans `StudentWeekPlanPage.tsx`, le test de câblage passe
au rouge (1 failed / 7 passed) ; fichier restauré, 8/8 verts.

**Ce que la base dit du risque** : sur **20 foyers**, **1 seul** porte un
`reference_member_id` non nul. Ce foyer-là continue de composer avec son
référent — le retrait enlève l'ÉCRIVAIN, jamais la donnée écrite. Les 19 autres
étaient déjà à `NULL`, donc déjà sur le composeur : pour eux, **rien ne change
du tout**.

**Vérifié au navigateur** : après rechargement complet, `/app/plan` ne contient
plus la phrase « way of eating the shared dish ».

---

## 2. Lot 2 — un plan par personne

### ⚠️ Le §3 lu AVANT de dessiner, et ce qu'il a décidé

Le chantier voisin avait mesuré que les `portion_note` portent une **vraie
divergence**. J'ai remesuré au niveau qui compte réellement pour une grille — la
**part par PRÉPARATION**, pas la note générale — sur le plan `3cc7915d` (foyer
`3d779534`, deux bouches, objectifs divergents), cité tel quel :

| Bouche | `preparation_id` | note |
|---|---|---|
| ILi | `prep_chicken_bowls` | « Take a bigger portion of chicken, rice, and vegetables. » |
| Christèle | `prep_chicken_bowls` | « Take a balanced bowl of chicken, rice, and vegetables. » |

Et sur le plan `de4309ba` (foyer `4ba4c573`, trois bouches), celui utilisé pour
les captures :

| Bouche | `prep_chicken` | `prep_rice` |
|---|---|---|
| Me | « 1 portion of chicken with plenty of roasted vegetables » | « small scoop of rice » |
| Zoe | « 2 portions of chicken with roasted vegetables » | « full scoop of rice » |
| Kid | « 1 small portion of chicken with vegetables » | « small scoop of rice » |

➡️ **Les lignes ne sont pas jumelles.** La vue a de la valeur, et elle en a
parce que la jointure passe par `preparation_id` : afficher la note GÉNÉRALE
dans chaque case aurait rendu la même phrase vingt-six fois, c'est-à-dire
exactement les jumelles que le §3 redoutait.

### La forme, et le fait qui la décide

**Le plat commun n'est rendu QU'UNE FOIS par moment**, puis **une ligne par
bouche** porte ce qui diffère. Deux bouches sans profil réclamé mangent le même
plat ; répéter l'intitulé sous chaque ligne affirmerait une individualisation
du plat qui n'existe pas dans le moteur.

```
The dish  │ Fri 14                    │ Sat 15                    │ Sun 16
──────────┼───────────────────────────┼───────────────────────────┼──────────
Breakfast │ Greek yogurt bowls with…  │ Peach yogurt and almonds  │ Egg and…
   Me     │                           │                           │
   Zoe    │                           │                           │
   Kid    │                           │                           │
Lunch     │ Tuna, white bean and…     │ Chicken and hummus wraps  │ Chickpea…
   Me     │                           │ 1 portion of chicken with plenty of…
   Zoe    │                           │ 2 portions of chicken with roasted…
   Kid    │                           │ 1 small portion of chicken with…
Dinner    │ Chicken, courgette and…   │ Salmon, new potato and…   │ Herby…
   Me     │ 1 portion of chicken with plenty of roasted vegetables │
   Zoe    │ 2 portions of chicken with roasted vegetables          │
   Kid    │ 1 small portion of chicken with vegetables             │
```

**Une case vide est un silence voulu** : le plat ne puise dans aucun lot dont
cette bouche ait une part (petit-déjeuner fait de zéro). Aucune phrase de repli
n'est fabriquée — « comme la table » répété vingt fois est du bruit, et le dire
au nom du moteur serait lui faire dire une chose qu'il n'a pas dite. La clé
correspondante a été **écrite puis retirée** pour cette raison.

### 2.3 — La décision de défaut, et les options rejetées

> **Défaut = « côte à côte ». L'individuel est à un clic.**

**Pourquoi.** La question qui a produit ce lot — « on sait pas qui mange quoi » —
est une question de **comparaison**, et une comparaison a besoin des deux côtés.
Ouvrir sur « une personne » obligerait à choisir un nom **avant** de voir quoi
que ce soit : répondre à la question avant de l'avoir posée.

**Option rejetée n°1 — individuel d'abord, avec un bouton « comparer ».**
Rejetée parce qu'elle force un choix de nom sur un écran qui est justement là
pour dire qu'il y a plusieurs personnes, et parce qu'un titulaire a **déjà**
`MyShareCard` juste au-dessus pour « ma part à moi » : l'individuel de cette
carte-ci sert surtout à lire la semaine de quelqu'un **qui n'a pas de compte**,
ce qui est un geste délibéré, pas un défaut.

**Option rejetée n°2 — N grilles empilées, une par bouche.**
Rejetée parce que les N grilles porteraient **les mêmes intitulés de plat**
(cf. §3 du cahier des charges) : N copies du même tableau, dont seule une
colonne de notes changerait. C'est le dessin qui rend la vue « inutile alors
qu'elle est correcte ».

**Option rejetée n°3 — répéter le plat sur chaque ligne de bouche.**
Rejetée : c'est une affirmation d'individualisation que le moteur ne fait pas.

### Les gardes — et elles sont testées

| Garde | Comment elle tient |
|---|---|
| Aucun objectif, poids, calorie, « pourquoi » | **Structurelle.** Les deux seuls types d'entrée sont `MemberPortionView` et `HouseholdDishView` : **aucun champ** ne peut porter un objectif. Un test interdit en plus les mots `goal`/`kcal`/`calorie`/`weightKg`/`heightCm`/`energy` dans la vue et son modèle, **commentaires retirés**. |
| Un mineur n'a jamais d'objectif affiché | Corollaire de la précédente : il n'y a **nulle part où en mettre un**. Vérifié à l'écran sur « Kid ». |
| ⛔ `isOwner`-only | La vue rend la part de **tout le monde**. `MyShareCard` interdit explicitement « la part d'un autre » à un secondaire ; cette vue en serait le contournement. `isOwner` est **requis** (pas de `?`, pas de défaut) et ferme le rendu. |
| Sous deux bouches, silence | « Qui mange quoi » n'a pas de sujet à une seule bouche, et la composition à 1 est le chemin majoritaire du produit. |

⚠️ **La règle des gardes d'affichage a été RECOPIÉE** dans l'en-tête de
`PlanByPerson.tsx` et de `planByPersonModel.ts`, depuis `TableCard.tsx` que le
chantier voisin a supprimé. Une règle dont le seul porteur disparaît est une
règle qu'on redécouvrira par un incident.

### Le lien avec le chantier voisin — un déplacement, pas une perte

« À table » a été retirée le 2026-08-14 parce qu'elle listait des parts **loin
du plat**. **Cette vue est ce qui la remplace** : les mêmes `portion_note` et
les mêmes `preparation_shares`, dans la grille, **à côté du plat qu'elles
servent**. Elle est montée exactement à l'emplacement de l'ancienne carte
(`StudentWeekPlanPage`, section « 9bis », juste sous le commentaire qui acte le
retrait de « à table »).

---

## 3. Lot 3 — la préparation reliée à sa session

### Le chemin existait en entier, et n'était nulle part

```
dish.uses[].preparation_id  →  cooking_sessions[].preparation_ids
```

« Tes sessions de cuisine » porte les grosses cuissons **sans dire quel plat en
sort** ; la carte du plat dit d'où vient son lot (`sources`) **sans dire dans
quelle session il a été fait**. Le lien manquait des deux côtés.

⚠️ **`cookingSessions` était une prop MORTE de `PlanResult`** : déclarée, passée
par ses deux appelants (`MealBuilder`, `PlanDraftDialog`), et **plus lue par
personne** depuis le retrait de `KitchenBlock` par le chantier voisin. Une prop
qu'on transporte sans la rendre se lit comme une fonctionnalité livrée. Elle
sert de nouveau, et à ce pour quoi elle était le mieux placée.

### « Ouvre les deux ensemble » — comment c'est tenu

Le bouton est posé **juste sous le geste du soir**, et son dépliant s'ouvre
directement dessous : les deux se lisent d'un seul regard.

**Le geste n'est PAS recopié dans le dépliant.** C'est une décision : le lot D
du chantier voisin l'a rendu **inline et en permanence** sur ces plats-là, et
l'écrire une seconde fois sur la même carte ferait relire la même phrase à dix
lignes d'écart. L'affichage de `dish.method` est par ailleurs explicitement
**hors périmètre** de ce chantier.

### La preuve — le bouton ouvert sur un plat `leftover`

`/app/plan`, foyer `4ba4c573`, plan `de4309ba`, vendredi :

```
Chicken, courgette and pepper rice bowls                        [Dinner]
  From Roast chicken thighs — cooked on Friday.
  From Cooked rice — cooked on Friday.
  roast chicken thighs 3 portions · cooked rice about 600 g · …
  Before serving: Reheat a portion of the chicken and rice. Stir-fry the
                  courgettes and peppers in olive oil, then toss with sliced
                  spring onions and lime. Divide into bowls and top with the
                  chicken.
  Hide the session                          ← le petit bouton, ouvert
  ┌───────────────────────────────────────────────────────────────────────┐
  │ Friday                                                                │
  │ Made in the same session: Roast chicken thighs, Cooked rice           │
  │ Start the oven for the chicken tray with the vegetables. While it     │
  │ roasts, rinse and cook the rice on the hob. Cool the rice quickly,    │
  │ rest the chicken, then portion both into boxes for Friday dinner and  │
  │ Saturday lunch.                                                       │
  └───────────────────────────────────────────────────────────────────────┘
```

**Le `preparation_id` qui a fait le lien** — lu dans le DOM :

```
document.querySelector("[data-preparation-id]").getAttribute("data-preparation-id")
  → "prep_chicken"
```

⚠️ Il **ne s'affiche pas** — un slug de lot ne veut rien dire à table — mais il
est posé en attribut : la jointure est **auditable dans le DOM** sans relire le
code. Une jointure invisible est une jointure qu'on ne sait pas prouver juste.

Le plat de zéro juste en dessous (« Greek yogurt bowls … for Zoe ») porte
« How: … » et **aucun bouton** : un plat sans `uses` ne change pas.

### Les deux gardes

- **Aucune durée.** `active_minutes` vit sur les préparations, `total_minutes`
  sur la session ; ni l'un ni l'autre n'atteint la carte d'un plat. Un test
  l'interdit sur la source **commentaires retirés**. Les deux temps ont déjà
  leur surface (« tes sessions de cuisine »), et c'est là qu'ils se lisent.
- **La préparation est attachée AU PLAT, jamais à la personne.** Ceinture
  **structurelle** : le résolveur `sessionForDish` n'a aucune entrée où une
  personne pourrait passer, et un test interdit `member`/`portion`/`person`/
  `household` dans sa source.

---

## 4. Les preuves techniques

| Épreuve | Résultat |
|---|---|
| `cd frontend && npx tsc -b` | **exit 0** |
| `npx vitest --config vitest.config.ts run` | **958 passés**, 20 skipped · **3 rouges, tous étrangers** (§4.1) |
| Suite Deno KEEL (`_shared/keel/`) | **3028 passed, 0 failed** |
| `agent-gate` sur chaque commit | **pass** (il relance la suite Deno + eslint) |
| Mes tests neufs | **36** — 8 (référence) + 17 (par personne) + 11 (session) |
| Mutation des gardes | **5/5 passent au rouge**, puis 28/28 verts après restauration (§4.2) |
| 320 px et 1280 px, `/app/plan` | `document.scrollWidth === innerWidth === 320` — **aucun débordement de page** |
| Console navigateur | aucune erreur applicative (§4.3) |

Captures prises à **scroll 0**, le corps décalé par `margin-top` négatif — le
panneau du navigateur ne repeint pas ailleurs.

### 4.1 Les 3 rouges de vitest sont ANTÉRIEURS et ÉTRANGERS

Prouvé, pas affirmé : un **worktree détaché sur `bdbcbc66`** (le commit qui
précède tout mon travail) rend exactement les mêmes familles rouges.

1. **`src/edge/coverage-guard.int.test.ts`** (2) — des fonctions edge et un
   trigger absents des listes connues. Je n'ai ajouté ni fonction edge ni
   trigger.
2. **`src/keel/copy/planRefusals.int.test.ts`** — sept `household.error.*`
   écrits dans `en.ts` inatteignables depuis `HOUSEHOLD_REFUSAL_KEYS`.
   `planRefusals.ts` **et** `en.ts` sont modifiés par une **autre session**.

⚠️ Un quatrième rouge est apparu puis reparti pendant la session
(`pageSeams.int.test.ts` : « `/app/plan` atteint `allergen.*` »). Il n'est pas
de moi et c'est démontrable : le fichier de test est **non suivi par git**
(travail d'une autre lane), il nommait **trois** pages dont deux que je n'ai
jamais ouvertes, et le chemin vers `allergens.ts` passe par
`api/planRouting.ts` que `StudentWeekPlanPage` importait **déjà**. Aucun de mes
fichiers neufs n'atteint `allergens.ts`.

### 4.2 Les gardes ont été mutées, une par une

| Mutation | Résultat |
|---|---|
| retirer `if (!props.isOwner) return null;` | **rouge** |
| faire entrer un `goal` dans la vue | **rouge** |
| retirer `if (props.portions.length < 2) return null;` | **rouge** |
| retirer `data-preparation-id` du DOM | **rouge** |
| remonter une durée de session sur la carte du plat | **rouge** |
| *après restauration* | **28/28 verts** |

Une garde qu'on n'a jamais vue mordre n'est pas une garde.

### 4.3 Les erreurs de console, et pourquoi elles ne comptent pas

Deux entrées subsistent dans le tampon du panneau (`404` +
`[vite] Failed to reload /src/…/ReferenceMemberCard.tsx`). Ce sont des
**messages HMR** émis au moment où j'ai supprimé le fichier, en cours de
session. Vérifié : elles survivent à un **redémarrage complet du serveur de dev
et à une navigation neuve** (donc le tampon n'est pas vidé par l'outil), et
`read_network_requests` sur le motif `ReferenceMember` ne rend **aucune requête**.
Il n'y a pas de 404 vivant.

### 4.4 Le harnais de session

Aucun mot de passe n'a été tapé dans un formulaire. Patron commité du dépôt
(`frontend/e2e/eating-rhythm.e2e.spec.ts`, documenté dans
`scratchpad/HARNAIS-SESSION-NAVIGATEUR-20260813.md`) : session ouverte par
l'API Supabase depuis Node sur une **fixture locale**, jeton injecté dans
`localStorage`. Compte utilisé : `l4m-owner-1786500297@test.dev`
(foyer `4ba4c573`). **Port 5174**, pris seul, pour ne pas écraser la session
d'une autre lane (le navigateur partage son profil).

⚠️ `il@gmail.com` (foyer `3d779534`, celui d'ILi et Christèle) **ne répond pas**
au mot de passe de fixture `1234567` : c'est un compte réel, pas une fixture. Ce
foyer n'a donc servi qu'aux mesures en base, jamais au navigateur.

---

## 5. ⛔ LE TROU MESURÉ — un plat dédié n'est attribuable à personne

**À lire, parce que ça borne ce que les deux vues peuvent promettre.**

Sur le plan `de4309ba`, la vue individuelle de **Kid** affiche, au vendredi :

```
Breakfast — Greek yogurt bowls with peaches, granola and seeds
Breakfast — Greek yogurt bowls with peaches, granola and seeds for Zoe   ← à Zoe
```

Le second plat est **dédié à Zoe** (produit par l'échelle de fusion :
`generated_from.household.merge.honoured.marks = ["parallel_dishes:fri/breakfast"]`,
`observed: "dedicated_dish"`), et il apparaît quand même dans la semaine de Kid.

**Pourquoi je ne le corrige pas.** Les clés d'un plat, relevées sur **tous** les
plans de foyer en base :

```
honours_belief_keys · title · ingredients · why · uses · servings_made
preparation_id · id · slot · day · method
```

**Aucun `member_id`, aucune attribution.** Le seul marqueur que ce plat est
celui de Zoe est le texte libre « for Zoe » **dans le titre**, écrit par le
modèle. Et `generated_from.household.merge` ne dit que « il y a des plats
parallèles à `fri/breakfast` » : avec deux plats sur le même créneau, il reste à
deviner lequel est à qui.

⛔ **Je n'écris pas de matcher sur le titre.** C'est une cicatrice explicite du
dépôt (« jamais de matcher maison » : 12 faux positifs sur 12 mesurés), et ici
il attribuerait de travers dès « Chicken for Zoe and Marc », et rien du tout dès
que le plan sort en français.

➡️ **La réparation est côté moteur** : `household_merge.ts` sait pour qui il
compose un plat dédié, et devrait poser un `member_id` (ou un
`for_member_ids[]`) sur le plat. C'est **une colonne de JSONB, donc un lot
serveur**, hors du périmètre de ce chantier, et la décision appartient à
l'humain. Tant qu'elle n'est pas prise, les deux vues montrent les plats
**communs et dédiés** à tout le monde, ce qui est le comportement actuel du
reste du produit (le planning jour-par-jour fait déjà exactement ça).

---

## 6. Les décisions tranchées seul

| Décision | Option rejetée, et pourquoi |
|---|---|
| **Défaut « côte à côte »** | Individuel d'abord : ferait choisir un nom avant de voir quoi que ce soit. Détail au §2.3. |
| **`isOwner`-only** sur la vue par personne | La rendre à tout le foyer : elle montre la part de chacun, et `MyShareCard` interdit déjà « la part d'un autre » à un secondaire. La lui rendre ici serait le contournement de sa propre règle. |
| **Jointure par `preparation_id`**, et non la note générale | La note générale dans chaque case : la même phrase 26 fois — les jumelles que le §3 redoutait. A exigé d'ajouter `uses` à `HouseholdDishView` (des `id`, aucun texte : l'exception à « ni `why` ni `ingredients` » est documentée sur place). |
| **Case vide** quand il n'y a pas de part | Une phrase de repli « comme la table » : ferait dire au moteur une chose qu'il n'a pas dite, et remplirait la grille de bruit. La clé i18n correspondante a été écrite puis **retirée**. |
| **Le geste du soir n'est pas recopié** dans le dépliant de session | Le recopier : deux fois la même phrase sur une carte. `dish.method` est de toute façon hors périmètre (lot D du chantier voisin). |
| **Aucune durée** dans le dépliant | Afficher `total_minutes` de la session : lisible comme le temps du PLAT, alors que c'est le temps de la CUISSON. La garde est littérale. |
| **`min-width` calculée** sur le nombre de jours | Un minimum fixe : mesuré à 1280 px, il coupait la dernière colonne d'un plan de 3 jours (conteneur 702, table 736) alors qu'il restait de la place. |
| **La part n'est jamais tronquée**, le titre si | Tronquer les deux : un titre coupé se retrouve en entier sur la carte du plat, plus haut sur la même page ; une instruction de service coupée ne se retrouve **nulle part**, et le repli « texte entier au survol » **n'existe pas sur un téléphone**. |
| **`api/servingDivergence.ts` gardé** alors qu'il est orphelin | Le supprimer : la liste de retrait du cahier des charges est explicite et fermée, le module est un **pont documenté** vers le serveur, et le retirer inviterait quelqu'un à recoder un jumeau de la règle plus tard. Consigné ici, pas caché. |

---

## 7. Les clés i18n — sur le disque, NON commitées

`frontend/src/keel/i18n/en.ts` est **tenu par une autre session** (modifié, non
commité) et `fr.ts` n'est **pas suivi par git**. Le type `MessageKey` en dérive,
donc toute clé neuve doit y passer pour que ça compile. **Je les ai posées sur
le disque et je ne les commite pas.**

| Clé | en | fr |
|---|---|---|
| `plan.person.title` | Who eats what | Qui mange quoi |
| `plan.person.hint` | One dish for the table, one line per person… | Un plat pour la table, une ligne par personne… |
| `plan.person.mode_together` | Side by side | Côte à côte |
| `plan.person.mode_one` | One person | Une personne |
| `plan.person.dish_row` | The dish | Le plat |
| `plan.person.standard` | A standard serving | Une part standard |
| `plan.person.pick` | Read the week of | Lire la semaine de |
| `meals.result.session_open` | The cooking session | La session de cuisine |
| `meals.result.session_hide` | Hide the session | Masquer la session |
| `meals.result.session_also` | Made in the same session: {titles} | Fait dans la même session : {titles} |

**10 clés, en `en.ts` ET en `fr.ts`** — `plan` et `meals` sont des namespaces
**traduits** (`TRANSLATED_NAMESPACES`), donc une clé anglaise seule aurait fait
tomber la ceinture de parité. Elle passe : les dix paires diffèrent.

### Clés devenues orphelines par le lot 1

`plan.reference.title`, `plan.reference.title_pair`, `plan.reference.hint`,
`plan.reference.default`, `plan.reference.saved`. Retirées de nulle part : je
n'ai supprimé que leurs **appelants**. À balayer dans un lot i18n séparé.

---

## 8. Ce que je n'ai PAS pu vérifier — consigné rouge

1. ⛔ **Les captures « dans les deux langues » n'existent pas, et c'est une
   FRONTIÈRE, pas un oubli.** `/app/plan` n'est **pas** dans `PAGE_NAMESPACES` :
   `uiLocaleForPath` rend `DEFAULT_UI_LOCALE` pour toute l'app connectée
   (`catalog.ts` le dit mot pour mot : « Tout le reste de l'app connectée
   (`/app/today`, `/app/chat`, `/app/plan`…) »). **La page se rend en anglais
   quel que soit le choix du visiteur**, par décision de produit. Basculer la
   locale pour faire la capture aurait mis en scène un écran qui n'existe pas.
   Ce qui remplace la capture : les dix clés françaises sont écrites et passent
   la ceinture de parité — le jour où `/app/plan` entrera dans le périmètre
   traduit, cette vue suivra sans un mot d'anglais.

2. ⚠️ **La capture « foyer de DEUX bouches » est en fait un foyer de TROIS.**
   Les foyers à deux bouches en base ont des maîtres dont je n'ai pas les
   identifiants de fixture (`il@gmail.com`, `ff060_body@example.com`) ; y entrer
   aurait demandé de deviner un mot de passe, ou d'écraser la session d'une
   autre lane. Le foyer à trois (`4ba4c573`) est un **sur-ensemble** : il porte
   une bouche sans compte (Kid), trois notes divergentes, et un plat dédié. La
   forme à deux lignes est couverte par les tests (`planByPersonModel`), pas par
   une capture.

3. ⚠️ **Le cas `isOwner === false` n'a pas été vu à l'écran.** Il aurait fallu
   une seconde session navigateur sur une seconde origine, et le profil du
   navigateur est partagé — m'y connecter en secondaire aurait écrasé la session
   du maître. La garde est prouvée par test (mutée, rouge), pas par capture.
   Une garde qu'on n'a vue que dire « oui » n'est vérifiée qu'à moitié : ici
   c'est le « non » qui manque à l'écran, et le test le porte.

4. ⚠️ **La vue est muette sur 1 plan de foyer vivant sur 10** (une seule bouche
   dans `member_portions`). C'est le comportement voulu, mais ça veut dire que
   9 plans sur 10 la rendent : ce n'est pas un cas marginal.

---

## 9. Un défaut trouvé en passant, hors périmètre

**`line-clamp-2 block` est une troncature INERTE.** `line-clamp` n'agit que sur
un `display: -webkit-box` ; la classe `block` gagne dans la feuille et annule
tout. Mesuré au navigateur à 320 px : `display: block`,
`-webkit-line-clamp: 2`, **77 px de haut pour quatre lignes rendues**. Le
`block` retiré : **38,5 px, exactement deux lignes**.

La paire vit aussi dans **`frontend/src/keel/components/plan/PlanGrid.tsx:109`**,
où le commentaire juste au-dessus explique que la troncature existe pour que
« la grille [ne] devienne [pas] aussi haute que la liste qu'elle résume » —
ce qui arrive donc quand même aujourd'hui. **Corrigé dans mon composant, signalé
pour `PlanGrid` (tâche de fond `task_0beec508`), pas corrigé chez lui** : c'est
un fichier que je n'avais aucune raison d'ouvrir.

---

## 10. Fichiers commités

```
8662b2f3 — le membre de référence
  frontend/src/keel/components/plan/ReferenceMemberCard.tsx      SUPPRIMÉ
  frontend/src/keel/pages/StudentWeekPlanPage.tsx           −27   démonte la carte
  frontend/src/keel/api/household.ts                        −20   retire l'écrivain
  frontend/src/keel/api/householdReference.int.test.ts     +130   8 tests

ff0b1f59 — un plan par personne
  frontend/src/keel/lib/planByPersonModel.ts               +230   modèle pur
  frontend/src/keel/lib/planByPersonModel.int.test.ts      +260   17 tests
  frontend/src/keel/components/plan/PlanByPerson.tsx       +330   les deux vues
  frontend/src/keel/pages/StudentWeekPlanPage.tsx           +47   le montage, gardé
  frontend/src/keel/api/household.ts                        +30   `uses` sur les plats

7fd32455 — la préparation reliée à sa session
  frontend/src/keel/lib/dishSession.ts                     +105   résolveur pur
  frontend/src/keel/lib/dishSession.int.test.ts            +185   11 tests
  frontend/src/keel/components/DishCard.tsx                +111   le dépliant
  frontend/src/keel/components/plan/PlanResult.tsx          +14   ranime `cookingSessions`
```

**Non commités, exprès** : `frontend/src/keel/i18n/en.ts` et
`frontend/src/keel/i18n/fr.ts` (§7). Aucun autre fichier du dépôt n'a été
touché ; les fichiers d'autres sessions ont été **lus** (`api/mealLabels.ts`,
`i18n/catalog.ts`) et jamais modifiés.
