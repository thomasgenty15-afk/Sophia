# Reprise — le moteur passe en boîtes v4

> Colle ce fichier entier comme premier message d'une session neuve, à la racine
> du dépôt. Il est écrit pour être exécuté sans rien re-dériver.

---

## 1. Ce que tu reprends, en dix lignes

Le produit compose les repas d'un **foyer**. À la session de cuisine, on remplit
des **contenants** ; le jour J, on en sort un et on le réchauffe. **Personne ne
pèse à table.**

Le modèle de contenant est passé en **v4 le 2026-08-20**, et l'autorité est
**`docs/keel/BOITES-PAR-REPAS.md`** — lis-le en entier avant de toucher une
ligne, il porte les décisions et ce qu'elles interdisent.

> Un repas produit **N contenants**, un par **groupe de mangeurs** :
> ```
> groupes(repas) = { chaque bouche à objectif présente, SEULE }
>                ∪ partition( le reste présent, par LIGNE ALIMENTAIRE que CE plat mord )
> ```

**La condition qui tient tout le modèle**, et le premier réflexe à ne pas
avoir : sur le contenant à **un seul nom**, le gramme est une **prescription** ;
sur le bac à **plusieurs noms**, c'est une **quantité de récipient**. Écrire une
part par personne dans un bac partagé ressuscite le modèle v2 et remet la
balance à table. Le **nombre de noms** est le seul marqueur — pas de booléen
`is_common`, jamais.

---

## 2. L'état exact du dépôt

**Le front est fait, vert et vérifié à l'écran.** Ne le refais pas, ne le
« corrige » pas vers l'ancien modèle.

- `frontend/src/keel/api/mealGeneration.ts` — `MealBox` = `{id, member_ids[],
  items[], legacy_total_grams}`, `GeneratedDish.boxes: MealBox[]`, et un lecteur
  `readBoxes()` qui lit **les deux formes** (v4, sinon `box` v2 replié en un bac
  commun).
- `frontend/src/keel/lib/mealBoxes.ts` — `boxLinesForDish()` au pluriel,
  `boxLidLabel()` **constructeur unique** du couvercle.
- `frontend/src/keel/components/plan/BoxTable.tsx` — le **Boxing** en contexte
  `session` ; **aucun gramme** en contexte `dish`.
- `PlanDayBlock.tsx` (courses au-dessus de la session), `DishCard.tsx`,
  `TodayPage.tsx`, `planDaySlots.ts`, `DayPersonSplit.tsx`, les deux packs i18n.
- 40 tests dans `frontend/src/keel/components/mealBoxes.int.test.ts`.

**Le moteur est intact, en v2.** C'est tout ton travail.

**Deux rouges front préexistants qui NE SONT PAS À TOI** : `coverage-guard.int.test.ts`
et `household.int.test.ts`. Ils viennent d'autres lanes non commitées (203 lignes
ajoutées à `api/household.ts`) et n'importent rien lié aux boîtes. Ne les
répare pas, ne les compte pas comme une régression.

**Une fixture QA est posée** sur `qa0805.f1b.s1@keeltest.dev` :
`docs/keel/qa-fixtures/30-plan-boxes-v4.sql`. Elle a mis en retraite le vrai
plan de ce persona. Son ROLLBACK est en bas du fichier — **l'ordre compte**,
l'inverse lève.

---

## 3. Les quatre étapes, dans cet ordre

### ⛔ LE GESTE QUI DÉ-RISQUE TOUT, À FAIRE EN PREMIER

**Le parseur lit les DEUX formes**, exactement comme le front. `boxes[]` si elle
est là, sinon `box.shares[]` replié en **un** bac commun (les `member_id` des
parts deviennent le groupe, leur somme devient la quantité du bac — c'est bien
une quantité de bac, et c'est la seule chose vraie qu'on puisse tirer de v2 ; ne
fabrique **aucun** `items[]` inventé, un `term` que personne n'a écrit est un
mensonge).

Sans ça, aucune étape n'est livrable seule.

---

### ① Type, parseur, compteurs — `supabase/functions/_shared/keel/meal_generation.ts`

Ancres (vérifiées le 2026-08-20) :

| ligne | quoi |
|---|---|
| `811` | `export interface MealBox { id; shares: BoxShare[] }` |
| `832` | `export interface BoxShare { memberId; grams }` |
| `854` | `BOX_MAX_GRAMS = 2000` |
| `870` | `BOX_SUM_TOLERANCE_RATIO = 1.1` |
| `1150` | le champ de compteur `with_box` |
| `4909` | `let box: MealBox | null = null;` — **le bloc du parseur** |
| `6063` / `6079` | le calcul de `with_box` |
| `6209` | `mealDishesPayload` : ce qui part en base |

**À faire :**

- `MealBox` → `{ id, memberIds: string[], items: BoxItem[], legacyTotalGrams: number | null }`,
  avec `BoxItem = { preparationId: string | null, term: string, grams: number }`.
  `preparationId: null` = ajouté frais le jour même, hors contrôle de fournée.
- Le parseur valide : `memberIds` **contre le roster** (jamais un prénom),
  `grams` entiers `> 0`, `preparationId` contre les préparations du plan,
  **unicité des `id`** dans le plan, plafond `BOX_MAX_GRAMS` **par item**.
- Un contenant **sans bouche** ou **sans item** est jeté et compté : « sers-toi »
  se dit par l'ABSENCE de contenant, jamais par un contenant vide.
- Un contenant sur un plat qui ne prélève sur **aucune** préparation est jeté —
  la garde existe déjà, garde-la.
- **Le compteur principal** : `rendues / attendues`, l'attendu étant **dérivable
  sans le modèle** (`Σ repas boxés × groupes présents`). Sans lui, zéro contenant
  est indiscernable de « personne n'a d'objectif ».

**⚠️ LA CEINTURE DE RÉGIME CHANGE DE STATUT, ET C'EST LE POINT DÉLICAT.**
Aujourd'hui elle retire une bouche des `shares` quand le plat casse sa ligne
(`scanMealForRegime`). Sous v4, **la séparation par régime est une décision de
composition qui appartient au modèle** (étape ③) : si le plat porte de la viande
et que Tino ne la mange pas, il doit avoir **son** contenant, pas se faire
retirer d'un bac.

La ceinture reste donc **armée, comme filet**, et elle **se compte** :
- le modèle n'a pas séparé ⇒ on retire la bouche de `memberIds`,
- on **ne touche pas** aux grammes — ce parseur écrit lui-même sa posture :
  *« ce n'est pas une réécriture de la sortie du modèle, on REFUSE UNE
  DÉCLARATION »*,
- le contenant tombe entièrement si `memberIds` se vide,
- **nouveau compteur** : `bacs séparés par une ligne / morsures détectées`. Sans
  lui, un modèle qui ne sépare **jamais** ressemble à un foyer sans régime.

⛔ **Le parseur ne fabrique pas le contenant de Tino.** Retirer « la viande » de
ses `items` demande de savoir ce qui est la viande, et de décider si ce qui reste
est un repas ou une assiette de riz. Il **valide**, il n'invente pas.

**Tests à reprendre :** `meal_boxes_test.ts` (**1 700 lignes**, le gros du
travail), `household_regime_belt_test.ts` (622 l.), `meal_generation_test.ts`.

---

### ② Le silence nommé de l'énergie

`supabase/functions/_shared/keel/mouth_energy.ts`, `dishSlices()` **ligne 177** :

```ts
if (dish.box === null || dish.box.shares.length === 0) return [];
…
const share = g / total;
return { memberId: s.memberId, kcal: energy.kcal * share, gap: null };
```

Il **divise** les kcal d'un plat entre les bouches au prorata de leurs parts —
c'est-à-dire exactement la division que v4 supprime.

**À faire :**

- un kcal par bouche **uniquement** pour un contenant à **un seul nom** ;
- bac commun ⇒ **`gap: "common_pot"`**, à ajouter à `MOUTH_ENERGY_GAPS`
  (l. ~77). Un silence **nommé**, pas un `null` de plus : on doit pouvoir
  distinguer « on ne sait pas » de « il n'y a rien à savoir ».
- répercuter dans `mouth_anchor.ts` et `pot_demand.ts` (`PotDraw.shares` est un
  type **local** — il se réalimente au niveau du bac, il ne dépend pas de
  `BoxShare`).

⚠️ **Régression assumée, déjà écrite dans la spec** : une bouche en
`maintenance` **perd sa lecture calorique**. C'est cohérent (elle n'a demandé
aucun chiffre) mais c'est visible. Ne la « répare » pas en divisant.

**Tests :** `mouth_energy_test.ts` (365 l.), `pot_demand_test.ts` (200 l.).

---

### ③ Le prompt — **EN DERNIER**

⛔ **Pourquoi en dernier** : tant que le parseur ne lit pas v4, un modèle qui
obéit se fait **tout refuser**, et on lit « le modèle n'obéit pas ». On aurait
corrigé la mauvaise moitié.

**`household_meal_generation.ts:1011` — `boxSchemaBlock`**
`box` singulier → `boxes[]`, chaque entrée `member_ids[]` + `items[]`.
⛔ La phrase v3 à **remplacer**, mot pour mot :
> *« Nobody else does. Everyone else eats from the shared dish, and their
> servings are never weighed, never named and never written down — leaving them
> out is the answer, not an omission. »*

Elle doit céder la place à la règle de groupement : un contenant par bouche à
objectif, **plus** un par ligne alimentaire que **ce plat-là** mord, plus un pour
tout le reste ensemble.

**`household_portions.ts:1432` — `boxingOrderLines`**
⛔ **Retirer** les quatre lignes qui commencent par :
> *« Give every share of a meal the SAME ordinary figure -- one plate's worth of
> that meal. »*

Elles ordonnaient le même chiffre pour tout le monde et n'ont plus d'objet.
Ajouter : la distinction des **deux grammes** (prescription contre quantité de
bac), et nommer les bouches à objectif.

⚠️ **LE BLOC NE S'ALLONGE PAS.** La lane foyer frôle le mur de temps du worker
(4 min mesurées, `generation-model-times-out-on-household-prompt`). Ce qui entre
**remplace**.

⚠️ `weighedPortionMembers` (`household_portions.ts:2324`) et
`sizeBoxesFromTarget` (`:2756`) **existent déjà et sont justes** — la moitié
« garde » de v3 est construite. Le prompt s'**élargit**, il ne se réécrit pas.

---

### ④ Run réel, puis retrait de la fixture

⚠️ **Redémarrer `functions serve` AVANT.** Le runtime edge sert des `_shared`
**périmés** : un fichier modifié n'est pas rechargé, et tu mesurerais l'ancien
code (`edge-runtime-serves-stale-shared-modules`).

Puis un run sur la lane foyer, et lecture de `generated_from.boxes` :
`rendues == attendues`, plus le compteur de morsures non séparées.

⚠️ Cette lane a déjà **dépassé 4 min**. Un run qui échoue au temps ne dit rien
sur le reste — ne conclus pas.

Une fois vert, dérouler le ROLLBACK de `docs/keel/qa-fixtures/30-plan-boxes-v4.sql`.
⛔ **L'ordre est : retenir l'uuid, supprimer la fixture, PUIS réveiller.**
L'inverse lève sur `student_generated_meals_one_live_start_idx` — il y a **deux**
gardes sur cette table, pas une (l'exclusion sur les fenêtres qui se recouvrent
**et** cet index unique sur les lignes vivantes). C'est mesuré.

---

## 4. Décisions déjà prises — ne les rouvre pas

1. **v4 renverse v3**, décidé par l'utilisateur le 2026-08-20. Les non-objectifs
   ont un contenant nommé. Ce n'est pas un oubli à corriger.
2. **Le régime GROUPE, il ne retire pas.** La séparation se joue à l'assemblage.
   Le retrait est le filet, pas le modèle.
3. **Aucun gramme sur la carte d'un repas.** Le contenant EST la portion.
4. **Le nombre de noms est le seul marqueur.** Pas de `is_common`.
5. **« Boxing » n'est pas traduit** — même mot dans les deux packs, déclaré dans
   `legitimatelyIdentical` de `i18n/parity.int.test.ts`.
6. **Le couvercle est `prénoms — jour moment — plat`**, identique au caractère
   près dans le Boxing et sur la carte du repas, prénoms jusqu'à 4 puis un compte.

---

## 5. Les pièges mesurés de ce dépôt

- ⛔ **Jamais de matcher maison.** Retrouver une bouche en cherchant son prénom
  dans un titre : 12 faux positifs sur 12 mesurés. Tout se joint par **id**.
- ⛔ **Un paramètre de garde optionnel est une garde désarmée.** Pas de `T?` sur
  une prop qui porte une ceinture.
- ⛔ **Un champ déclaré par le modèle exige un compteur.** Sinon un lot désarmé
  ressemble à un lot qui marche.
- ⚠️ **`NULL in (…)` vaut `NULL`, pas `false`.** `coalesce(goal, '')` — ce piège
  a déjà mordu sur ce chantier, dans la fixture.
- ⚠️ **`as` sur un type étranger désarme le typecheck.** Il a produit un écran
  blanc sur six fixtures front pendant ce lot.
- ⚠️ **Les grammes crus et prêts ne se comparent pas.** Les ingrédients d'une
  préparation sont du **cru** pour la fournée ; les boîtes sont du **prêt** par
  contenant. `BOX_SUM_TOLERANCE_RATIO` existe pour ça.
- ⚠️ **Sessions parallèles sur ce dépôt.** L'arbre porte des dizaines de fichiers
  modifiés par d'autres lanes. **Jamais `git stash`** — il emporte leur travail.
  Utilise `git show HEAD:<path>` pour comparer.

---

## 6. Vérification

```bash
cd supabase/functions && deno test --allow-env --allow-read --allow-net
```

```bash
cd frontend && npx vitest run && npx tsc -b --force
```

⚠️ `tsc -b --force` et pas l'incrémental (il invente des erreurs). **N'exporte
aucun `SUPABASE_*`** dans le shell qui lance vitest : l'env QA empoisonne la
suite (114 faux rouges mesurés). `agent-gate` **ne lance pas vitest**.

**Et mute pour prouver que tes gardes mordent.** Une garde verte qui ne peut pas
rougir ressemble à une garde qui marche : casse-la volontairement, vérifie que le
test rougit, remets. C'est ce qui a validé les trois ceintures du front.

---

## 7. Ce que tu ne fais pas

- ⛔ Tu ne touches pas au front (il est fait et vérifié).
- ⛔ Tu ne « répares » pas `coverage-guard` ni `household.int.test` — pas à toi.
- ⛔ Tu ne lances **seul** aucune commande à risque : `supabase db reset`,
  `db push`, `functions deploy`, `secrets set`, `link`. Elles sont bloquées par
  un hook et exigent que l'utilisateur les lance. Donne-lui la commande exacte.
- ⛔ Si une fonction edge rend **401 « Invalid JWT »** en local, **ne touche à
  rien** : lance `./scripts/check-local-jwt-alg.sh` et lis
  `docs/keel/JWT-HS256.md`. `supabase/signing_keys.local.json` doit rester `[]`.
  Ce piège a déjà coûté plusieurs journées.
- ⛔ Tu ne divises pas un bac commun par le nombre de mangeurs, nulle part —
  ni dans le parseur, ni dans l'énergie, ni à l'écran.
