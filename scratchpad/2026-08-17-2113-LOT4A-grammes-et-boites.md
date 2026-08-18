# Rapport LOT 4A — les grammes par personne et le protocole des boîtes (P4)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 21:13 · **Aucun `push`, aucun merge.**
**Master prompt** `scratchpad/2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md` (§0-P4, §2, §3.1)
**Rapports lus** `…-2015-LOT3C` (en priorité), `…-1656-LOT2A`, `…-1738-LOT2B`, `…-1825-LOT3A`, `…-1912-LOT3B`
**Commits** `968a9744` (serveur), `e0c3e01a` (durcissement de deux fixtures), `e5314d55` (écran).

> ## Ce que le lot livre, en une phrase
>
> On pèse **une fois**, à la session de cuisine, dans des **boîtes nommées**, et
> le jour J le plat **cite sa boîte** (« Box Zoé — 120 g ») au lieu de faire
> ressortir la balance. Les grammes sont des grammes d'**aliment**; aucun chiffre
> de corps, aucune calorie, et l'interdit du « pourquoi » reste **la dernière
> chose lue** du brief de portions.

| Épreuve | État |
|---|---|
| Schéma : `preparations[].boxes`, `uses[].box_id`, quantités du jour | ✅ §2 |
| La leçon de 3C appliquée : ordre **collé à la promesse**, **nombre**, échappatoire **nommée** | ✅ §3 |
| Compteurs à **plus de deux nombres**, et **rendus sur l'aperçu** | ✅ §4 |
| Somme des boîtes : cru→prêt, trois sorts comptés séparément | ✅ §5 |
| Ceinture du flou, **bilingue, avec cas passant**, qui **compte** | ✅ §6 |
| Deux bumps, deux populations, tests byte-identiques | ✅ §7 |
| Rendu : table de pesée ×2 surfaces, ligne de boîte, part par bouche, « 1 servings » | ✅ §8 |
| Suite Deno `_shared/keel/` | ✅ **3140 passés, 0 rouge** (3096 avant le lot) |
| `cd frontend && npx tsc -b` · vitest | ✅ exit 0 · **1119 passés**, 3 rouges **étrangers connus** |
| Mutations sur les gardes neuves | ✅ **12/12 au rouge**, restaurées, SHA256 revérifié |
| `agent-gate` (`AGENT_GATE_STAGED_ONLY=1`) sur chaque commit | ✅ **pass** ×3 |
| Migration | ✅ **aucune** — `dishes`/`preparations`/`generated_from` sont du `jsonb` |
| Run réel | 🔴 **non fait, et c'est volontaire** — §10.1 |
| Navigateur | 🔴 **non fait** — §10.2 |
| Ce qui reste rouge | 🔴 **6 points**, §10 |

---

## 1. Le poste, et ce que je n'ai pas fait dessus

- **Aucun redémarrage, aucun run modèle.** Ce lot modifie `_shared/` : le runtime
  edge sert des `_shared` **périmés**, donc toute mesure faite sans redémarrage
  mesurerait l'ancien prompt. Le redémarrage coupe les lanes voisines, et **le
  run de mesure appartient à 4B**. Je n'ai touché à rien.
- **Aucune commande à risque** : ni `db push/reset`, ni `functions deploy`, ni
  `secrets`, ni `config push`, ni `link`, ni `supabase stop/start`.
- **Aucune écriture en base**, aucun compte visé, aucune fixture modifiée.
- **Jamais `git add -A`, jamais `git stash`.** Le dépôt porte 385 fichiers dirty
  d'autres lanes ; §9 dit exactement comment j'ai isolé mes hunks.

---

## 2. LE SCHÉMA — trois ajouts, tous déclarés / validés / comptés

### 2.1 Les boîtes, sur la préparation

```ts
preparations[].boxes: [{ id: string, memberIds: string[], grams: number }]
```

Trois portes au parseur (`meal_generation.ts`, boucle des préparations), et
**aucune ne jette la préparation** — posture `for_member_id`/`same_day` :

| Porte | Refus | Compté |
|---|---|---|
| ① `id` non vide **et pas déjà pris dans le plan** | la boîte tombe | `refused` |
| ② ≥ 1 bouche du **roster** (`boxMemberIds`) | un id inconnu est retiré de la boîte ; **zéro** id connu ⇒ la boîte tombe | `refused` seulement au second cas |
| ③ `grams` entier > 0 | la boîte tombe ; au-delà de `BOX_MAX_GRAMS = 2000` elle est **écrêtée et nommée**, pas jetée | `refused` |

⚠️ **La porte ② ne jette pas une boîte partagée pour un nom fantôme.** Une boîte
qui liste Zoé et un id disparu reste lisible amputée du fantôme ; la jeter
retirerait sa part à une bouche réelle pour l'erreur d'une autre.

⛔ **`boxMemberIds` est le ROSTER ENTIER, pas `dishBearerIds`.** Tout le monde a
une part donc une boîte ; seuls quelques-uns ont un plat à eux. Passer les
porteurs aurait retiré sa boîte à toute la tablée, en silence.

### 2.2 La consommation, sur le plat

`dishes[].uses[].box_id`, validé **après** la réconciliation des jours de
cuisson :

- ① la boîte doit **exister** ;
- ② elle doit être remplie un jour **≤** celui du repas (C5).

⚠️ **La validation ne peut PAS vivre dans la boucle des plats**, et c'est une
contrainte d'ordre, pas un choix : le jour de cuisson vient de la **session**
(réconciliée ~120 lignes plus bas), et le `cook_on` du modèle est inégal.
Valider plus tôt refuserait des boîtes justes sur un champ que le parseur
s'apprête à réécrire. Le brut voyage donc dans un **sixième tableau parallèle**
qui suit les mêmes `splice` que les cinq autres.

⚠️ **Un plat SANS JOUR n'est pas vérifié, et il est compté `resolved`.** Il vaut
pour toute la portée, aucun ordre ne se pose. Le compter « refusé » serait le
zéro à deux sens que le LOT 3C a payé d'un diagnostic entier.

⚠️ La comparaison de jours réutilise **la fonction qui existait déjà** : j'ai
extrait `cookedAfterEating` de la règle « un lot mangé avant d'être cuisiné » —
deux copies de cette comparaison auraient divergé sur la fenêtre courte.

### 2.3 Le complément du jour

- **Consigne** (tronc, toutes les lanes) : section
  `== WHAT A DISH ADDS ON THE DAY IS WEIGHED OR COUNTED, NEVER VAGUE ==`, six
  lignes, qui nomme les deux formes acceptées (grammes / dénombrable) et
  l'exception qui reste ouverte (sel, poivre, herbes).
- **Compteur déterministe, aucun matcher** :
  `unquantified_dish_ingredients = { ingredients, unquantified }` — lu sur
  `amount === null`, sur les **plats gardés seulement**, et sur les ingrédients
  de **plat** uniquement (ceux d'une préparation ont déjà
  `structured_quantity_missing`).

---

## 3. LA LEÇON DE 3C, APPLIQUÉE MOT POUR MOT

3C a mesuré **zéro déclaration sur 291 plats** parce que la **promesse** de la
matière vivait dans le message utilisateur et la **clé** du schéma dans le
prompt système, sans rien pour les relier. Ce lot ne refait pas la faute :

| Moitié | Où | Fichier |
|---|---|---|
| **SCHÉMA** — la clé existe et voici sa forme | prompt **système** | `boxSchemaBlock`, `household_meal_generation.ts` |
| **ORDRE** — pèse, combien, et ce qui n'est pas une boîte | **DANS** le brief de portions, message utilisateur | `boxingOrderLines`, `household_portions.ts` |

Le bloc d'ordre est **à l'intérieur de `buildPortionBrief`**, entre les lignes
par personne et les trois lignes de fin — c'est-à-dire dans le même souffle que
la phrase qui promet « portions that differ ». Trois choses y sont
load-bearing :

1. **LE NOMBRE.** `That is 3 people to weigh out on EVERY preparation: Zoé,
   Nina, Marc.` Il vient de `members.length` — **la même liste** qui écrit les
   lignes juste au-dessus et que `boxMemberIds` valide au parseur. Le levier est
   celui que C6 (2026-08-12) puis 3C ont mesuré deux fois.
2. **L'ÉCHAPPATOIRE, NOMMÉE.** `A line in member_portions is NOT a box.` Le
   modèle a déjà un champ où ranger « qui mange combien », et il lui est
   **demandé** : sans cette phrase, il satisfait la consigne dans l'autre champ
   — c'est exactement ce que 3C a capturé, la consigne renvoyée mot pour mot au
   mauvais endroit.
3. **LA BOÎTE PARTAGÉE EST LÉGITIME.** Sans cette phrase, un modèle obéissant
   écrirait quatre boîtes identiques et la table deviendrait illisible — après
   quoi quelqu'un désarmerait la consigne.

⛔ **L'interdit du « pourquoi » reste les TROIS DERNIÈRES LIGNES du brief**, et
un test l'assère par `lines.slice(-3)`. C'est précisément quand le brief se met
à porter des **nombres par personne** que cette phrase doit survivre.

⛔ **`may carry` est banni de tout le suffixe système.** Ma première rédaction du
bloc de schéma disait « each entry of its "uses" **may carry** "box_id" » — le
test de 3C l'a attrapée, à juste titre. C'est devenu « **then carries** ».

---

## 4. LES COMPTEURS — plus de deux nombres, et lisibles sur un APERÇU

`GeneratedMeal` gagne trois objets, chacun avec **son propre dénominateur** :

```
box_counts     { preparations, with_boxes, boxes, refused,
                 sum_checked, sum_over, sum_unverifiable }   ← population: préparations gardées
box_use_counts { uses, cited, resolved, refused }            ← population: reprises des plats gardés
unquantified_dish_ingredients { ingredients, unquantified }  ← population: ingrédients des plats gardés
```

**Pourquoi trois objets et pas un.** « Un compteur dont le numérateur et le
dénominateur ne comptent pas les mêmes lignes est un compteur qui ment » est
écrit trois fois dans `meal_generation.ts`, chaque fois après l'avoir payé. Les
préparations, les reprises de plat et les ingrédients sont **trois populations**.

**Deux propriétés testées, pas deux définitions** :
- `sum_checked + sum_unverifiable === with_boxes`
- `cited === resolved + refused` (et `refused` compté **indépendamment**, jamais
  par soustraction — cicatrice `withheld`/`over_cap`).

**Rendus sur l'aperçu.** `generated_from` n'existe que sur une **ligne écrite** :
c'est ce qui a rendu la vérification de 3B aveugle. Les trois compteurs sortent
donc aussi sur `intent: "draft"`, par **la même expression** (`boxTrace`) que le
chemin d'écriture — sur les **deux lanes**. ⚠️ La lane individuelle ne rendait
**aucun** compteur sur son brouillon avant ce lot : c'est réparé au passage.

---

## 5. LA SOMME DES BOÎTES — cru contre prêt

`preparationReadyGrams(ingredients, composition)` reconstruit ce que produit une
casserole **en grammes de PRÊT** : `gramsRaw × YIELD_FACTORS[yieldClass]`.

⛔ **La nuance est toute la fonction.** Les ingrédients portent du **CRU**, les
boîtes du **PRÊT**. Comparer directement dirait qu'une casserole de 200 g de riz
cru ne peut pas remplir deux boîtes de 250 g — alors qu'elle en remplit trois
(facteur 2,6). Le sens de l'erreur serait **toujours le même** : accuser des
plans justes.

⛔ **`null` dès qu'UN ingrédient manque à l'appel.** Une production reconstruite
sur la moitié des lignes est systématiquement trop basse, donc toute somme la
dépasserait : on fabriquerait une `issue` nommée sur chaque plan dont un
ingrédient n'est pas au référentiel. Patron des trois cas de `gramsRaw`.

**Tolérance `BOX_SUM_TOLERANCE_RATIO = 1.1`, et ce n'est pas une faveur** :
`food_composition.ts` déclare lui-même « ±10-15 % table + cuisson » et dit que
ses rendements sont « des ordres de grandeur assumés, pas des mesures ». 10 % est
le **bas** de sa propre bande d'incertitude. Le test l'épingle en littéral puis
mesure les deux côtés du seuil (760 g passe, 780 g mord, sur 700 g produits).

**Un dépassement est une `issue` nommée + `sum_over`, JAMAIS un rejet.** Choisir
quelle boîte sacrifier reviendrait à retirer sa part à quelqu'un sur une
arithmétique dont ce module documente lui-même la bande d'erreur.

---

## 6. LA CEINTURE DU FLOU — elle compte, elle ne retire rien

`VAGUE_PORTION_TERMS` (`household_portions.ts`), **quatre familles**, bilingue,
et elle **ne fait pas le métier de `FORBIDDEN_PORTION_TERMS`** :

| | ce qu'elle porte | ce qu'elle fait |
|---|---|---|
| `FORBIDDEN_PORTION_TERMS` | des termes de **CORPS** | **mord** : la note part à `null` |
| `VAGUE_PORTION_TERMS` | des termes de **QUANTITÉ** | **compte** : la note sort intacte |

Retirer une note floue laisserait la bouche **sans aucune consigne**, ce qui est
pire que la consigne floue. On mesure, et c'est la mesure qui dira si la consigne
resserrée du prompt a porté.

**Les quatre familles** : `handful` (+ `poignee`) · `generous portion` (+ 8
formes dont `grosse portion`, `belle part`, `large portion`) · `as much as you
like` (+ `a volonte`, `a discretion`) · `a good amount` (+ `plenty of`, `une
bonne quantite`, `une bonne dose`).

**La frontière, et ce qui reste DEHORS** (documenté dans le fichier) : `un peu` /
`a little` (« un peu de sel » est juste — le sel a droit à la pincée depuis
FF-038), `cuillère` / `spoonful` (`tbsp`/`tsp` **sont** des unités de
`COMPOSITION_UNITS`), `louche`. « Une ceinture qui mord sur tout se fait
désarmer dans la semaine. »

**Le cas qui passe, testé dans les deux langues** :
`Your box: 150 g of the chicken` → `[]` · `Ta boîte Zoé : 150 g de poulet` →
`[]` · `Coupe les carottes en morceaux de 3 cm` → `[]` (les unités nues restent
hors liste **exprès**, je ne les y ai pas mises).

**Le compteur** : `reconcilePortions` rend `vagueCounts = { notes, vague }`, mesuré
**après** la ceinture de corps et **seulement sur ce qui sort** — une note mise à
`null` n'est plus une consigne, et la ranger dans « chiffrée » ou « floue »
raconterait dans les deux cas une chose fausse sur un texte que personne ne lira.
Trace nommée : `portion_note_vague:<membre>:<forme>` et
`share_note_vague:<membre>:<prep>:<forme>`.

⚠️ **La trace porte la FORME qui a mordu**, pas le jeton de tête : c'est le
contrat de `findForbiddenMatches`, et c'est plus utile — E veut savoir quelle
tournure le modèle a écrite.

---

## 7. LES DEUX BUMPS, ET POURQUOI CE N'EST PAS UN DOUBLON

| Axe | Avant → après | Population qui voit une consigne différente |
|---|---|---|
| `MEAL_PROMPT_VERSION` | `meal.en.v10_same_day` → **`meal.en.v11_weighed_or_counted`** | **les quatre** (individuel, foyer ordinaire, fusion, secondaire) : la section des quantités du jour + les deux jetons d'id de boîte dans `MEAL_TOKEN_FIELDS`, rendus dans le bloc de langue des deux lanes |
| `HOUSEHOLD_PROMPT_VERSION` | `v13_dedicated_dish_is_ordered` → **`v14_weigh_once_into_boxes`** | **les foyers d'au moins DEUX bouches** : `boxSchemaBlock` + `boxingOrderLines` + la phrase des ids |

**Byte-identique, testé** : un foyer d'**une seule bouche** rend les deux blocs
vides — brief sans `WEIGH IT ONCE`, `systemSuffix` sans `BOXES, ON EVERY
PREPARATION`, et la phrase des ids reste `Exact ids to use in member_portions:`
au caractère près. La lane individuelle ne monte jamais l'enveloppe foyer.

**Décision : les boîtes sont household-only.** Le master dit à la fois « la lane
individuelle a des boîtes » et « bloc de mise en boîtes dans l'enveloppe foyer ».
J'ai tranché pour le **partage exact de `for_member_id`** : le CHAMP vit dans le
contrat du tronc et le parseur partagé le lit (un seul moteur, une seule forme,
une seule persistance) ; la CONSIGNE vit dans l'enveloppe qui connaît le roster.
La lane individuelle passe `boxMemberIds: []` et n'a donc aucune boîte, comme
elle n'a jamais de `memberId`. **Option rejetée** : servir un bloc de boîtes au
tronc avec le `userId` comme pseudo-membre — il faudrait inventer un vocabulaire
d'ids pour une lane qui n'en a aucun, alourdir un prompt sur une lane où le
champ n'apporte rien (une personne seule n'a pas deux bouches à départager), et
3C a mesuré que la chaîne foyer **frôle déjà le mur de temps du worker**.

Les tests de version qui existaient et qui **devaient** tomber sont tombés, et
je les ai mis à jour en écrivant pourquoi : `meal_same_day_test.ts:498`,
`household_merge_test.ts:2654` (les deux axes), `household_meal_generation_test
.ts` (compte de blocs 15→16 et 16→17, marqueur `WEIGH IT ONCE` ajouté à
`SECTIONS_NO_MERGE`), `household_habits_test.ts:378` (le brief byte-identique
gagne le protocole des boîtes, ses deux lignes de membres inchangées).

---

## 8. LE RENDU

| Surface | Ce qui s'y affiche |
|---|---|
| `CookingSessions` (fenêtre) | table de pesée sous chaque préparation, **recette fermée** |
| `PlanDayBlock` → `DaySessionCard` | la même table, **toujours visible**, avec la session du jour |
| `DishCard` | `Box {prénoms} — {n} g` sous la provenance, quand `uses[].box_id` résout |
| `DayPersonSplit` (part par bouche) | les grammes de SA boîte, après sa note |

- **Un seul composant `plan/BoxTable.tsx`** pour les deux surfaces de session :
  deux rendus du même objet finissent par diverger, et ici la divergence se
  paierait en grammes.
- **Une seule jointure, `lib/preparationBoxes.ts`**, et elle est **par ID** dans
  les deux sens (boîte→prénoms par `member_id` contre `member_portions` ;
  plat→boîte par `uses[].box_id`). Aucun titre n'est lu nulle part ; un test de
  source interdit `.title.includes` & co. et exige `b.id === use.box_id`.
- **L'ordre des prénoms suit le ROSTER**, jamais celui du modèle : deux boîtes de
  la même casserole liraient sinon « Zoé, Nina » puis « Nina, Zoé ».
- **Un id de boîte ne s'affiche JAMAIS.** Il sort en `data-box-id`, pour que la
  jointure soit auditable dans le DOM — patron `data-preparation-id`.
- **« — 1 servings » est mort.** `plural()` + `meals.sessions.makes_one`. C'était
  le cas **nominal** aux barreaux ② et ③ de la fusion, c'est-à-dire précisément
  sur le plat dédié que ce chantier vient de rendre visible.
- **`SessionPreparation` est exportée**, et pour une seule raison : `ui/Modal`
  rend par `createPortal` vers `document.body`, et ce dépôt teste en
  environnement `node`. Sans l'extraction, la table de pesée et le pluriel
  n'auraient été vérifiables que par des littéraux de source — et deux
  vérificateurs de ce chantier ont trouvé cette semaine des tests de source
  **verts sur du code mort**.

### Les clés i18n ajoutées (packs **sur le disque, NON commités**)

| Clé | `en.ts` | `fr.ts` |
|---|---|---|
| `meals.boxes.title` | `Weigh it out` | `La pesée` |
| `meals.boxes.line` | `Box {names} — {n} g` | `Boîte {names} — {n} g` |
| `meals.boxes.line_unnamed` | `One box — {n} g` | `Une boîte — {n} g` |
| `meals.boxes.grams` | `{n} g` | `{n} g` |
| `meals.sessions.makes_one` | `— {n} serving` | `— {n} portion` |

`meals.boxes.grams` est identique dans les deux langues (« g » est le symbole
international du gramme) : son **exception est commitée** dans
`i18n/parity.int.test.ts`, à côté de `meals.same_day.minutes` — patron 2A.

---

## 9. CE QUE J'AI TOUCHÉ, ET COMMENT J'AI ISOLÉ MES HUNKS

**Trois commits, chemins explicites, relus par `git diff` avant stage.**

`968a9744` — serveur (22 chemins) :
```
_shared/keel/meal_generation.ts            (+619 −13)   schéma, parseur, sommes, compteurs, prompt tronc, v11
_shared/keel/household_portions.ts         (+231  −6)   boxingOrderLines, VAGUE_PORTION_TERMS, vagueCounts
_shared/keel/household_meal_generation.ts  (+86   −2)   boxSchemaBlock, phrase des ids, v14
_shared/keel/meal_boxes_test.ts            (+999)       43 tests neufs
generate-household-meal-v1/index.ts        (+67   −1)   boxMemberIds, boxTrace (aperçu + generated_from)
generate-meal-v1/index.ts                  (+44)        boxMemberIds: [], boxTrace
+ 5 fichiers de tests mis à jour (versions, compte de blocs, brief)
+ 11 fichiers de tests ayant reçu `boxMemberIds: []`
```

⚠️ **NEUF de ces fichiers de tests portaient des hunks D'AUTRES LANES** (`away_days_test`,
`day_properties_test`, `eating_rhythm_test`, `food_composition_test`,
`meal_body_test`, `meal_plan_integrity_test`, `meal_same_day_test`,
`meal_verdict_test`, `week_bounds_test` — jusqu'à **191 insertions étrangères**
sur un seul). Je n'ai **pas** commité leur travail : j'ai généré un patch `-U0`,
**filtré les hunks dont les seules lignes ajoutées sont `boxMemberIds: [],`**, et
appliqué à l'index par `git apply --cached --unidiff-zero`. Vérifié après
staging : `git diff --cached` ne portait que ces trois formes de la même ligne.

⚠️ **Un accident, réparé.** Une passe automatique de nettoyage a supprimé 17
lignes de `household_merge_test.ts`. Le fichier a été restauré depuis `HEAD`
(`git show HEAD:… > …`) **après avoir vérifié que son diff entier était le mien**
— aucun hunk étranger ne pouvait donc être perdu. Puis `boxMemberIds` a été
ajouté proprement à son `PARSE_BASE`.

`e0c3e01a` — durcissement de deux fixtures (§10.5).
`e5314d55` — écran (13 chemins), **hors packs i18n** (convention des lanes).

- **Aucun fichier étranger défait**, aucun fichier d'une autre lane commité.
- **Aucune migration.**
- `agent-gate` en `AGENT_GATE_STAGED_ONLY=1` sur les trois commits — nu, il fait
  tourner eslint sur les fichiers des autres lanes (même choix que 3A, 3B, 3C).

---

## 10. CE QUI RESTE ROUGE

### 10.1 🔴 Aucun run réel — et c'est le rouge principal

Le lot modifie `_shared/` : sans redémarrage du runtime edge, un run mesurerait
l'**ancien** prompt. Le redémarrage coupe les lanes voisines, et **le run
appartient à 4B**. Donc : **`boxes.declared` n'a jamais été mesuré sur un modèle
réel.** Tout ce que je peux dire est que le champ est demandé aux deux moitiés,
au bon endroit, avec le nombre et l'échappatoire — c'est-à-dire la configuration
que 3C a mesurée à `0 → 11`. **Rien ne garantit que le modèle obéira**, et 3C a
mesuré une obéissance **intermittente** (2 runs sur 4). Les requêtes du §11 sont
faites pour trancher ça en une salve.

**Avant tout run** : `docker restart supabase_edge_runtime_Sophia_2` (sonder
`docker logs` d'abord — 3C l'a fait quatre fois), puis
`./scripts/local_extend_kong_functions_timeout.sh`.

### 10.2 🔴 Rien n'a été vu au navigateur

L'écran est prouvé **par la valeur rendue** (23 tests `react-dom/server` qui
comptent les occurrences dans le HTML), pas par un œil. Non vérifié : le rendu à
**320 px** et **1280 px**, `document.scrollWidth`, et le fait qu'aucun plan en
base ne porte encore de boîte — donc **aucune fixture visuelle n'existe**. 4B
devra soit fabriquer un plan (le `jsonb` accepte `boxes` et `box_id` sans
migration), soit faire un run réel écrit.

### 10.3 🔴 `MyShareCard` / `/app/household` ne cite pas de boîte — **décidé, pas oublié**

Le master demande « la part d'une bouche cite SA boîte » et je l'ai livré **dans
la vue jour** (`DayPersonSplit`, propriétaire). Je ne l'ai **pas** livré dans
`MyShareCard` (le secondaire), et voici pourquoi : cette carte ne reçoit pas les
préparations du plan. Les lui passer ferait traverser
`preparations[].boxes` — qui liste **les grammes de TOUT LE MONDE** — jusqu'à un
secondaire. C'est un **élargissement de la garde `HouseholdDishView`**, et le
master dit expressément « aucun affichage nouveau côté secondaire ». La sortie
propre serait un champ **filtré sur sa seule bouche**, calculé côté serveur dans
la vue du foyer. **C'est une décision de produit, elle n'est pas prise ici.**

### 10.4 ⚠️ « 120 g » s'affiche deux fois sur une case à part

Quand un plat cite une boîte ET que la bouche a une note de part, l'écran rend
« Box Zoé — 120 g » (sous le plat) puis « Zoé — ta part de poulet **120 g** »
(sous la même carte). Les deux surfaces répondent à deux questions — « quelle
boîte je sors » et « ce que Zoé prend ici » — et c'est bien le **même nombre**,
ce qu'un test vérifie. **C'est une redondance cosmétique**, pas une
contradiction ; à 4B/E d'arbitrer si l'une des deux doit se taire.

### 10.5 ⚠️ Deux mutations sont passées AU VERT au premier essai

Consigné parce que la règle l'exige :

- **M5** (retirer l'incrément de `refused` sur la porte « boîte sans id ») :
  **vert**. Aucun test ne couvrait cette porte-là. Fixture ajoutée, mutation
  rejouée → **rouge**.
- **M12** (retirer le `splice` du sixième tableau parallèle) : **vert**. Ma
  fixture avait deux plats **qui citaient la même boîte** — un décalage d'un cran
  rendait donc le même compte. Refaite : le plat évincé cite une boîte, le plat
  gardé n'en cite aucune, et le plat évincé est de **rang 2** (sans moment) pour
  forcer un vrai `splice` d'un plat **déjà gardé**. Rejouée → **rouge**.
  ⚠️ Une fixture où le plat surnuméraire est simplement **refusé à l'entrée**
  n'exerce PAS le `splice` : c'est le piège, et il vaut pour les cinq autres
  tableaux parallèles.

### 10.6 ⚠️ Trois constats hors périmètre, nommés et non réparés

1. **`request_report_gate_test.ts:21` fait `as never`** sur ses arguments de
   parseur. Le cast a laissé passer la compilation puis explosé **à l'exécution**
   (`Cannot read properties of undefined`) quand `boxMemberIds` est devenu
   requis. C'est la cicatrice « `as` sur un type étranger désarme le typecheck »,
   dans un fichier de test. J'ai ajouté le champ à la main et **nommé le cast** ;
   je ne l'ai pas retiré, il n'appartient pas à ce lot.
2. **`frontend/tsconfig.app.json` exclut `**/*.test.*`** : les fichiers
   `*.int.test.ts` ne sont **jamais typecheckés** par `npx tsc -b`. Un argument
   requis manquant dans un test front ne fait donc rouge qu'à l'exécution — et
   seulement si le chemin est atteint. Constat, pas correctif.
3. **La lane foyer saute toujours `keelGenerationModel()`**
   (`generate-household-meal-v1/index.ts:3299`, `:3419`). Nommé par 2A, 2B, 3A,
   3B, 3C ; mesuré par 3C (`gpt-5.6-sol` **timeout à 4 min** sur ce prompt, repli
   `gpt-5.4-mini`). **Toute mesure de latence d'une génération foyer se lit avec
   ça en tête**, et c'est la raison pour laquelle j'ai gardé mes deux blocs
   courts.

Et les **3 rouges vitest étrangers** restent à l'identique :
`src/edge/coverage-guard.int.test.ts` ×2, `src/keel/copy/planRefusals.int.test.ts`.
Antériorité prouvée par 1B, reconfirmée par 2B/3B/3C. Mon diff ne les touche pas.

---

## 11. LES REQUÊTES SQL — prêtes à jouer pour 4B et E

### 11.1 Où vivent les compteurs

| Compteur | Lane foyer | Lane individuelle | Sur l'aperçu (`intent: "draft"`) |
|---|---|---|---|
| `boxes` | `generated_from->'household'->'boxes'` | `generated_from->'boxes'` | `household.boxes` / racine |
| `box_uses` | `generated_from->'household'->'box_uses'` | `generated_from->'box_uses'` | idem |
| `unquantified_dish_ingredients` | `generated_from->'household'->…` | `generated_from->…` | idem |
| `vague_portions` | `generated_from->'household'->'vague_portions'` | — (pas de parts) | `household.vague_portions` |

⚠️ **Le chemin diffère entre les deux lanes**, et c'est assumé : un compteur se
range où vit la consigne qui le produit (règle posée par le LOT 2). Les boîtes
sont réclamées par l'enveloppe foyer, donc elles se rangent avec `dish_owners`.
`unquantified_dish_ingredients` voyage avec elles côté foyer et vit à la racine
côté individuel ; la **même expression** écrit les deux, donc la forme ne peut
pas diverger.

### 11.2 Le tableau de bord des boîtes, par plan

```sql
select left(id::text, 8) as plan,
       plan_kind, starts_on, duration_days,
       generated_from->>'prompt_version'                        as prompt_version,
       coalesce(generated_from->'household'->'boxes',
                generated_from->'boxes')                        as boxes,
       coalesce(generated_from->'household'->'box_uses',
                generated_from->'box_uses')                     as box_uses,
       coalesce(generated_from->'household'->'unquantified_dish_ingredients',
                generated_from->'unquantified_dish_ingredients') as day_quantities,
       generated_from->'household'->'vague_portions'            as vague_portions,
       generated_from->'household'->'dish_owners'               as dish_owners
from student_generated_meals
where retired_at is null
order by created_at desc
limit 20;
```

### 11.3 Le taux de service, par version de prompt

```sql
select generated_from->>'prompt_version'                                  as prompt_version,
       count(*)                                                           as plans,
       sum((generated_from #>> '{household,boxes,preparations}')::int)    as preps,
       sum((generated_from #>> '{household,boxes,with_boxes}')::int)      as preps_boxed,
       sum((generated_from #>> '{household,boxes,boxes}')::int)           as boxes,
       sum((generated_from #>> '{household,boxes,refused}')::int)         as boxes_refused,
       round(100.0 * sum((generated_from #>> '{household,boxes,with_boxes}')::int)
                   / nullif(sum((generated_from #>> '{household,boxes,preparations}')::int), 0), 1)
                                                                          as pct_preps_boxed
from student_generated_meals
where plan_kind = 'household'
  and generated_from #> '{household,boxes}' is not null
group by 1
order by 1 desc;
```

### 11.4 ⛔ LA CONTRE-PREUVE — le compteur peut mentir, le `jsonb` non

C'est la requête ③ de 2A, transposée. **À jouer systématiquement à côté de
11.3.**

```sql
with p as (
  select id, plan_kind, jsonb_array_elements(preparations) as prep
  from student_generated_meals
  where retired_at is null and jsonb_typeof(preparations) = 'array'
)
select left(id::text, 8)                                              as plan,
       plan_kind,
       count(*)                                                       as preps_in_jsonb,
       count(*) filter (where prep ? 'boxes')                         as key_written,
       count(*) filter (where jsonb_array_length(coalesce(prep->'boxes','[]')) = 0)
                                                                      as key_written_empty,
       sum(jsonb_array_length(coalesce(prep->'boxes','[]')))          as boxes_total
from p
group by 1, 2
order by 1;
```

Et côté plats — la clé `box_id` est écrite **même à `null`**, donc « absente »
distingue un plan d'avant le lot :

```sql
with u as (
  select id,
         jsonb_array_elements(
           coalesce(jsonb_array_elements(dishes)->'uses', '[]'::jsonb)
         ) as use
  from student_generated_meals
  where retired_at is null and jsonb_typeof(dishes) = 'array'
)
select left(id::text, 8)                              as plan,
       count(*)                                       as uses,
       count(*) filter (where use ? 'box_id')         as key_written,
       count(*) filter (where use->>'box_id' is not null) as cited
from u
group by 1
order by 1;
```

### 11.5 Les grammes réellement écrits, par bouche

La question de P4 : **est-ce que trois objectifs différents donnent trois
grammages différents ?**

```sql
with b as (
  select m.id,
         prep->>'title'                          as preparation,
         box->>'id'                              as box_id,
         (box->>'grams')::int                    as grams,
         jsonb_array_elements_text(box->'member_ids') as member_id
  from student_generated_meals m,
       jsonb_array_elements(m.preparations) prep,
       jsonb_array_elements(coalesce(prep->'boxes','[]')) box
  where m.retired_at is null and m.plan_kind = 'household'
)
select left(b.id::text, 8) as plan, b.preparation, b.box_id, b.grams,
       hm.display_name, hm.goal
from b
left join household_members hm on hm.id = b.member_id::uuid
order by plan, preparation, grams desc;
```

**Divergence par préparation** (zéro écart ⇒ le modèle a écrit la même part pour
tout le monde, ce qui est un **résultat**, pas une panne) :

```sql
select left(m.id::text, 8)                       as plan,
       prep->>'title'                            as preparation,
       count(*)                                  as boxes,
       min((box->>'grams')::int)                 as min_g,
       max((box->>'grams')::int)                 as max_g,
       max((box->>'grams')::int) - min((box->>'grams')::int) as spread_g
from student_generated_meals m,
     jsonb_array_elements(m.preparations) prep,
     jsonb_array_elements(coalesce(prep->'boxes','[]')) box
where m.retired_at is null and m.plan_kind = 'household'
group by 1, 2
order by spread_g desc;
```

### 11.6 Les `issues` de ce lot, par famille

```sql
select case
         when i like '%boxes cannot all be filled%'   then 'sum_over'
         when i like '%is not a mouth of this plan%'  then 'member_unknown'
         when i like '%already%used in this plan%'    then 'box_id_duplicate'
         when i like '%does not exist, dropped%'      then 'box_cited_orphan'
         when i like '%after the meal, dropped%'      then 'box_cited_too_early'
         when i like '%gram ceiling%'                 then 'box_capped'
         when i like '%has no id%'                    then 'box_no_id'
         when i like '%no known mouth%'               then 'box_no_mouth'
         else 'other'
       end                              as family,
       count(*)                         as n
from student_generated_meals m,
     jsonb_array_elements_text(coalesce(m.generated_from->'issues','[]')) i
where m.retired_at is null
group by 1
order by n desc;
```

⚠️ Les `issues` ne sont pas toujours dans `generated_from` selon la lane —
au besoin, lire la réponse HTTP de l'aperçu (`issues[]`), qui les porte toutes.

### 11.7 La ceinture du flou, et le vocabulaire qui a mordu

```sql
select left(m.id::text, 8)                                     as plan,
       m.generated_from #> '{household,vague_portions}'        as counts,
       array_agg(i) filter (where i like 'portion_note_vague:%'
                              or i like 'share_note_vague:%')  as vague_issues
from student_generated_meals m
left join lateral jsonb_array_elements_text(
       coalesce(m.generated_from->'issues','[]')) i on true
where m.plan_kind = 'household' and m.retired_at is null
group by 1, 2
order by 1;
```

### 11.8 Le run d'aperçu (aucune écriture) — ce que 4B lira dans la réponse

```
POST /functions/v1/generate-household-meal-v1   { "intent": "draft", ... }
→ household.boxes        { preparations, with_boxes, boxes, refused,
                           sum_checked, sum_over, sum_unverifiable, mouths }
→ household.box_uses     { uses, cited, resolved, refused }
→ household.unquantified_dish_ingredients { ingredients, unquantified }
→ household.vague_portions { notes, vague }
→ household.dish_owners  { asked, declared, attributed, refused }
→ preparations[].boxes[] { id, member_ids, grams }
→ dishes[].uses[].box_id
```

`mouths` est ajouté **au trace seulement** (pas au parseur) : c'est le nombre que
la consigne annonce, donc `boxes / (preparations × mouths)` est le taux de
service brut, lisible sur un aperçu.

---

## 12. Les décisions tranchées seul

| Décision | Option rejetée, et pourquoi |
|---|---|
| **Les boîtes sont réclamées par l'enveloppe FOYER seulement** (le champ, le parseur et la persistance restent au tronc) | Un bloc au tronc avec `userId` en pseudo-membre : il faudrait inventer un vocabulaire d'ids pour une lane qui n'en a aucun, sur une chaîne dont 3C a mesuré qu'elle frôle le mur de temps du worker, pour un champ qui n'apporte rien à une personne seule. Le partage retenu est celui de `for_member_id`, mot pour mot. |
| **L'ordre de peser est DANS `buildPortionBrief`**, avant les trois lignes de fin | Un bloc voisin dans `parts[]` (comme `dedicatedDishBlock`) : ç'aurait été **après** l'interdit du « pourquoi », que le master demande de laisser dernier, et un cran plus loin de la promesse — la moitié exacte que 3C a payée. |
| **La somme est une `issue` + un compteur, jamais un rejet** | Retirer une boîte : ce serait choisir à qui retirer sa part, sur une arithmétique dont le module documente lui-même la bande d'erreur. |
| **Tolérance 1,1 sur la somme** | Comparer au gramme : `food_composition.ts` déclare ±10-15 % ; on fabriquerait une `issue` nommée sur des plans qui ont raison, et la garde serait désarmée dans la semaine. |
| **`null` dès qu'un ingrédient n'est pas convertible** | Sommer ce qu'on sait : la production serait systématiquement trop basse, donc **toujours** dépassée. Le patron des trois cas de `gramsRaw`, un cran plus haut. |
| **Le compteur de flou COMPTE et ne retire rien** | Mettre la note à `null` comme `sanitizePortionNote` : « une bonne portion » n'est pas dangereux, c'est inutile — et le retirer laisserait la bouche **sans aucune consigne**, ce qui est pire. |
| **`unquantified_dish_ingredients` ne fait AUCUNE exception sel/poivre/herbes** | Une liste littérale d'aliments « à pincée » : ce serait un matcher maison sur du texte alimentaire, exactement l'interdit du dépôt. Conséquence assumée et documentée : un plan sain n'est jamais à zéro, ce nombre est un **taux à surveiller**, pas un verdict — d'où le dénominateur. |
| **Trois objets de compteurs, pas un** | Un seul objet : préparations, reprises et ingrédients sont trois **populations**, et ce fichier a déjà payé trois fois « un compteur dont le numérateur et le dénominateur ne comptent pas les mêmes lignes ». |
| **`boxMemberIds` REQUIS** | Un `?` : aucun appelant ne serait remonté au compilateur, la liste fermée serait vide sur les deux lanes, chaque boîte serait refusée — lot construit, branché, désarmé. Il a effectivement cassé les deux lanes et 49 sites de test, **ce qui est le point**. |
| **`preparations` REQUIS sur `groupDayBySlot`** | Idem : sans lui, aucune part n'aurait jamais montré ses grammes, sans un seul rouge. |
| **`SessionPreparation` exportée** | Un test de source sur `CookingSessions.tsx` : `ui/Modal` rend par `createPortal` et le dépôt teste en `node`, donc la table de pesée n'aurait été prouvée que par un littéral — et deux tests de source ont menti cette semaine. |
| **Rien de neuf côté secondaire (§10.3)** | Passer les préparations à `MyShareCard` : `boxes` porte les grammes de **tout le monde**, et le master interdit d'élargir la garde de `HouseholdDishView`. La sortie propre est un champ filtré côté serveur — décision de produit, pas prise ici. |
| **Ne pas toucher au `as never` de `request_report_gate_test.ts`** | Le retirer en passant : il n'appartient pas à ce lot ; il est **nommé** dans le fichier et ici. |
