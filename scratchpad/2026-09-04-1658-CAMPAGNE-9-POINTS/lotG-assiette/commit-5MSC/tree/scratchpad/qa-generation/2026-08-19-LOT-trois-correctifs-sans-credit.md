# LOT — TROIS CORRECTIFS SANS CRÉDIT MODÈLE (2026-08-19)

Suite du `VERIFICATION.md` de l'agent 2V. Aucun appel modèle, aucun run réel,
aucune écriture en base, aucun `git add -A`, aucun `git stash`.

**Les trois fichiers réservés à d'autres agents sont ressortis au même octet :**

```
7b8abaad…  supabase/functions/_shared/keel/household_portions.ts
6c18d2d9…  supabase/functions/_shared/keel/household_safety.ts
71ded1bb999a3193013d3b92622c4839853b3a9158239eaf4d141d521f279815
           supabase/functions/_shared/keel/meal_generation.ts   ← identique au sha de 2V
```

## Contrôles

| contrôle | résultat |
|---|---|
| `deno test _shared/keel/` | **3 725 passés, 0 échec** |
| `deno test sophia-brain/skills/` | **226 passés, 0 échec** |
| `deno check generate-meal-v1/index.ts` | ✅ |
| `deno check` du harnais `build_scenarios.ts` | ✅ (il était **rouge avant ce lot**, voir défaut 3) |
| `deno lint generate-meal-v1/index.ts` | inchangé — 4 erreurs, **les mêmes qu'avant** (jsr:, un `error` inutilisé préexistant) |
| `npx tsc -b --force` (frontend) | ✅ rc=0 |
| `npx vitest run` (frontend) | **4 échecs / 1 639 passés / 20 ignorés** — la référence exacte, et les 4 sont les rouges étrangers connus (`coverage-guard` ×2, `household.int.test.ts` ×2) |

⚠️ `_shared/` a été modifié : **quiconque fait un run réel après ce lot doit
`docker restart supabase_edge_runtime_Sophia_2` avant**, sinon le runtime sert
la version périmée — le piège qui a mordu à l'intérieur du lot v15.

---

# DÉFAUT 1 — 🔴 la ceinture désarmée qui annonçait un contrôle RÉUSSI

## La ligne fautive

`supabase/functions/sophia-brain/skills/_shared/keel_output_locks.ts:285-290`

```ts
if (
  constraints.length === 0 && forbidden.length === 0 &&
  discouragedFoods.length === 0
) {
  return { text, reason: "disarmed_no_constraints", tokens: [] };
}
```

La condition exige **les trois** listes vides. Pour un coach **qui a des lignes
rouges** — le cas normal du produit et celui de la fixture — `forbidden` n'est
pas vide, donc un `safetyConstraints = null` **traversait tout** et ressortait
**`clean`** : une affirmation positive de contrôle posée sur un texte que la
moitié médicale n'avait confronté à rien.

**Source du `null`, citée et NON corrigée** (hors périmètre, fichier tenu par un
autre agent) : `generate-meal-v1:886-891`

```ts
let constraints = null;
try {
  constraints = await loadStudentSafetyConstraints(admin as never, userId);
} catch (error) {
  console.warn(`[${FN_NAME}] safety constraints unavailable`, error);
}
```

Le `null` est **volontairement porté par le type** (`readonly
StudentSafetyConstraint[] | null`) et **volontairement préservé** par
`router/run.ts:2874`, qui écrit noir sur blanc qu'un `[]` de complaisance « le
ferait passer pour une lecture réussie sans contrainte ». L'information existait
d'un bout à l'autre de la chaîne ; **c'est la ceinture qui la jetait**, au
premier `?? []`.

## Ce que j'ai changé

1. **Un troisième verdict**, `disarmed_constraints_unreadable`, ajouté à
   `OUTPUT_LOCK_REASONS` et à la doctrine P9 en tête de fichier (condition 2bis).
2. `constraintsUnreadable = input.safetyConstraints === null || undefined`,
   calculé sur l'**entrée brute** (pas sur la liste post-filtrage de la
   rétractation n°5 — sinon un tour de rétractation se serait déclaré illisible).
3. Les **deux** portes de sortie qui mentaient rendent le nouveau verdict :
   - la condition de désarmement n°2 (`disarmed_no_constraints` → distingue
     désormais « la table dit qu'il n'y a rien » de « je n'ai pas pu la lire ») ;
   - le `return … "clean"` final.
4. Un `console.error("keel.output_lock.constraints_unreadable", …)` : l'incident
   devient **bruyant**, y compris sur un tour que la doctrine bloque par ailleurs.

### Ce que ça NE change pas — et c'est tenu par un test

Le verdict commence par `disarmed` **exprès**. Les trois appelants de production
décident avec `reason === "clean" || reason.startsWith("disarmed")`
(`meal_generation.ts:4676`, `week_plan_generation.ts:841`, `router/run.ts` qui
rend `locked.text`). Un préfixe neuf aurait **vidé le plan** d'un élève dont la
table est injoignable — c'est-à-dire un durcissement de comportement produit
glissé dans un lot d'observabilité. Le texte sort **intact**, `tokens` reste
vide, le sort du plan est identique au caractère près.

## Les mutations

| mutation | rouge obtenu |
|---|---|
| **M1** — `return { … reason: "clean" }` en fin de fonction (le verdict retiré du chemin nominal) | **3 rouges** : « trois verdicts, une seule variable », « un élève à coach À LIGNES ROUGES … ne ressort PLUS `clean` », « le champ ABSENT vaut le champ `null` » |
| **M2** — `reason: "disarmed_no_constraints"` en dur dans la condition n°2 | **1 rouge** : « SANS doctrine non plus, “rien à vérifier” et “rien pu lire” divergent » |

Remis en état : **29 passés, 0 échec** (22 avant le lot, +7).

Les tests couvrent **les trois verdicts** dans un seul cas où la **seule**
variable qui bouge est `safetyConstraints` (`[constraint]` → `clean`, `[]` →
`disarmed_no_constraints`, `null` → `disarmed_constraints_unreadable`), plus la
contre-épreuve qui compte le plus : **table injoignable + texte qui viole un
interdit du coach ⇒ toujours `blocked_coach_interdit`**. Sans elle, un verdict
« je n'ai pas pu contrôler » pourrait masquer un lot qui a cessé de contrôler.

## ⛔ Ce que j'ai REFUSÉ de faire, et laissé à un humain

**Bloquer un texte non vérifié.** C'est la question qui reste ouverte, et elle
est réelle : aujourd'hui, un élève anaphylactique dont la table est injoignable
reçoit un plan que **rien** n'a confronté à son allergène — le prompt ne la
connaît pas non plus (`safetyConstraintsPromptBlock(null)` rend `null`), donc
les **deux** moitiés du double verrou sont tombées par le même `catch`. Ce lot
rend la panne **visible** ; il ne la referme pas. Trois options pour l'arbitrage,
aucune implémentée :

- **fail-closed** — `disarmed_constraints_unreadable` vide le plan, comme
  `restrictionFlag` le fait déjà en cas de lecture en échec (« FF-030 R6 »).
  Cohérent avec la doctrine du dépôt, et coûte un plan vide à chaque hoquet
  de base ;
- **relire avant de rendre** — un retry sur `loadStudentSafetyConstraints`
  plutôt qu'un verdict ;
- **statu quo assumé** — on livre, et on lit le compteur.

Deux points connexes, **relevés et non tranchés** :

1. `router/run.ts:2875-2876` **écrase le `null`** dès qu'une allergie de FOYER
   existe (`[...(keel.safety_constraints ?? []), ...household]`). Le tour est
   alors gardé sur les allergies du foyer et **muet sur celles du locuteur**,
   sans que rien ne le dise. Le commentaire juste au-dessus ne promet la
   préservation du `null` que « quand il n'y a rien à ajouter » — c'est exact,
   et c'est un trou.
2. Le verdict est **un seul champ**. Un tour qui bloque sur la doctrine
   (`blocked_coach_interdit`) alors que la table est illisible ne dit plus, dans
   `reason`, que la moitié médicale était aveugle — seul le `console.error` le
   porte. Un booléen `medicalCheckArmed` sur `OutputLockResult` le dirait ;
   je ne l'ai pas ajouté, parce qu'un champ sans lecteur est le mode d'échec
   n°1 de ce dépôt.

---

# DÉFAUT 2 — le compteur de régime accusait un plan végane correct

## La vraie mécanique — 2A avait raison, et ce n'est aucun des deux suspects

`generate-meal-v1:2373-2407` (avant ce lot) et `_shared/keel/dietary_regime.ts`.

**Ce n'est PAS un matcher maison** : `findForbiddenMatches` est le moteur du
dépôt, dix consommateurs, frontières de mot correctes. **Ce n'est PAS
« laitue ≠ lait »** : `yoghurt` est un **mot entier** de « Soy yoghurt ».
**Ce n'est PAS non plus la liste d'exclusion** : `milk`, `butter` et `yoghurt`
**doivent** rester dans `excludedSurfaceFormsFor("vegan")`, sinon un vrai
laitage passe.

**La mécanique est celle-ci, et elle a un nom dans ce dépôt :**

> `isPlantAnalogue` — la liste **fermée, écrite à la main, testée**, dont le
> commentaire nomme le run réel du **2026-08-11** qui a produit exactement ce
> défaut (« le modèle a composé trois plats au *unsweetened soy yogurt* … la
> garde a mordu dessus ») — **n'avait AUCUN lecteur en production.**

```
$ grep -rn "isPlantAnalogue" supabase frontend scripts docs
supabase/functions/_shared/keel/dietary_regime.ts:286:  export function isPlantAnalogue(...)
supabase/functions/_shared/keel/dietary_regime_test.ts:7, :195, :218
```

Sa propre définition, et son test. Rien d'autre. Et le seul consommateur de
`excludedSurfaceFormsFor` en production — `generate-meal-v1:2374` — construisait
ses aiguilles et appelait le matcher **sans jamais passer par lui**.

C'est la cicatrice « un champ collecté sans lecteur ressemble exactement à un
champ ignoré », appliquée à une **garde** : écrite, juste, datée du run qui l'a
motivée, et **morte**.

## Ce que j'ai changé

**Dans `dietary_regime.ts`** — le lecteur qui manquait, `scanDietaryRegime`,
avec deux entrées **parce que ce ne sont pas deux proses** :

- `terms` = **un aliment par chaîne** (les ingrédients). C'est le contrat exact
  d'`isPlantAnalogue(term)`, et la seule forme où un marqueur sans ambiguïté
  (« vegan », « tofu », « végétal ») peut valoir pour la chaîne entière ;
- `prose` = titre et `why`, **plusieurs aliments**. On y calcule les **portées**
  des analogues (avec le même moteur, aiguilles = la liste fermée) et on ne
  retire **que les morsures contenues dedans** — exactement le mécanisme de
  « mention imbriquée » que `forbidden_matcher.ts` applique déjà.

Trois entrées ajoutées à la liste fermée : les orthographes **apostrophées**
françaises (`lait d'avoine`, `purée d'amande`, …). `isPlantAnalogue` passe par
`canonical()`, qui aplatit l'apostrophe ; le lecteur de prose travaille sur les
**offsets** et passe par `tokenPattern`, qui découpe sur `[_\s-]` et **ne
franchit pas une apostrophe**. Écrites à la main, une par une — générer la
variante aurait été le matcher maison qu'on refuse.

**Dans `generate-meal-v1/index.ts`** — le haystack concaténé
(`[title, why, ...ingredients].join(" · ")`) est remplacé par l'appel au
lecteur, et le journal passe de **trois à quatre nombres** :

```
{ tag: "keel.meal.dietary_regime", dishes, forms, breaches, analogues_silenced }
```

`analogues_silenced` est le nombre de ce lot : sans lui, un désamorçage qui
blanchirait tout demain afficherait `breaches: 0`, c'est-à-dire **l'image d'un
régime parfaitement tenu**.

## Ce que ça change, mesuré

Sonde `scratchpad/2026-08-19-lot3-regime-probe.ts` — mécanique d'avant contre mécanique d'après,
sur les chaînes de 2V remises en plats, plus une contre-épreuve de **vraies**
brèches.

| jeu | avant | après | désamorcées |
|---|---|---|---|
| 5 plats véganes **corrects** | **18 morsures** | **3** | 15 |
| 3 plats en **vraie brèche** | 14 morsures | **11** | 3 (toutes fausses) |

Les cinq faux positifs nommés par 2V (`Soy yoghurt`, `plain unsweetened soy
yoghurt`, `oat milk`, `coconut milk`, `peanut butter`) tombent **à zéro**.
**Aucune vraie morsure n'est perdue** : les 18 retirées sont fausses, une par
une. « Soy yoghurt bowl with chicken stock » garde ses trois `chicken stock` et
perd son `yoghurt` — c'est le test qui tient le lot.

`dietary_regime_breach` alimente `issues`, qui est **diagnostique** : aucun
statut HTTP, aucun rejet de plat n'en dépend. Ce correctif change une **mesure**,
pas un comportement produit.

## Les mutations

| mutation | rouge obtenu |
|---|---|
| **M3** — `const covered = false` (la portée d'analogue ne couvre plus rien, côté prose) | 3 rouges : « les cinq faux positifs … à zéro », « ne blanchit QUE la morsure », « la prose FRANÇAISE … apostrophe comprise » |
| **M4** — `if (false && isPlantAnalogue(text))` (l'ingrédient analogue n'est plus court-circuité) | 1 rouge : « un marqueur SANS AMBIGUÏTÉ vaut pour un ingrédient » |
| **M5** — `const covered = spans.length > 0` (désamorçage **trop large** : toute la prose blanchie) | 1 rouge : « ne blanchit QUE la morsure, jamais la phrase » |
| **M6** — `analogues_silenced` retiré du journal | 1 rouge : « la lane solo APPELLE le lecteur » |
| **M7** — l'appel `scanDietaryRegime(declaredRegime, {` déplacé | 1 rouge : le même |

M5 est celle qui compte autant que les autres : elle prouve que la **correction
du faux positif n'a pas ouvert de trou**.

Remis en état : `dietary_regime_solo_lane_test.ts` **18 passés** (11 avant),
suite `_shared/keel/` **3 725 passés, 0 échec**.

## ⛔ Ce que j'ai REFUSÉ de faire, et laissé à un humain

**Je n'ai pas désarmé le compteur** — l'option que le brief autorisait. 18 → 3
faux sur le jeu mesuré, et le quatrième nombre rend le désamorçage lui-même
observable : un compteur muet aurait coûté la seule mesure qui existe sur le
régime.

**Mais il reste faux, et voici exactement où** — les 3 résidus, tous dans le même
plat de la sonde (`Vegan sausage and bean stew`), et **aucun** que la liste
fermée des analogues ne peut fermer :

1. **`butter beans`** → `butter` mord. Ce n'est pas un analogue végétal, c'est un
   **homonyme**. L'ajouter à `PLANT_ANALOGUE_PHRASES` serait faux (un haricot
   beurre n'est l'analogue de rien) et ouvrirait une liste sans fin.
2. **Un marqueur sans ambiguïté dans un TITRE** — « Vegan sausage and bean stew »
   → `sausage` mord. Le désamorcer demanderait une règle de **position**
   (marqueur adjacent au terme), c'est-à-dire un mécanisme du même genre que
   `NEGATION_BEFORE` — et donc une décision de moteur, pas un ajout de liste.
   Un test l'**épingle** nommément et doit rougir le jour où c'est traité.
3. **`meat` employé en comparaison** — « the soy sausage does the work of the
   meat here ».

La correction honnête de cette classe n'est pas une liste plus longue : c'est
que **le modèle DÉCLARE** le groupe alimentaire de chaque ingrédient
(`FoodGroupRef`, liste déjà fermée dans `tokens.ts`), et que le compteur lise le
champ déclaré au lieu de deviner sur la prose. C'est la règle du dépôt
(« tout est déclaré et validé contre une liste fermée »), c'est un changement de
schéma de sortie et de prompt, et **ça ne se décide pas dans un lot
d'observabilité**.

Deux limites déjà écrites dans le dépôt, que je n'ai **pas** touchées :

- `dietary_regime_solo_lane_test.ts` — « **LIMITE MESURÉE : « sans A ni B » ne
  désarme que A** ». « ni » n'est pas dans `NEGATION_WORD`. Le test dit
  explicitement pourquoi ce n'est pas corrigé (le même matcher arme la ceinture
  **allergène**, qui REJETTE) ; je l'ai laissé tel quel, y compris son
  avertissement.
- La lane **foyer** (`household_diet.ts`) n'appelle pas
  `excludedSurfaceFormsFor` ; elle n'a donc ni ce compteur ni ce défaut.

---

# DÉFAUT 3 — l'instrument de référence portait trois `undefined`

## La ligne fautive

`scratchpad/qa-generation/02-ponderation-solo/harness/build_scenarios.ts:78-86`

```ts
const FULL_BODY: MealBodyContext = {
  ageBand: "30 to 44",                                   // la PROSE
  latestWeight: { valueSi: 61.4, localDate: "2026-08-17" },
  latestWaist:  { valueSi: 74,   localDate: "2026-08-17" },
  …
} as unknown as MealBodyContext;                          // ⛔ la garde retirée
```

Mesuré **avant** correction, sur le prompt de référence lui-même :

```
70:- age band: undefined
82:- weight: undefined kg, measured week of undefined
83:- waist: undefined cm, measured week of undefined
```

`MEAL_AGE_BAND_PROSE` est indexé par la **clé** `AgeBand` (`"30_44"`) et rend la
prose ; on lui donnait la prose, il rendait `undefined`. Et `DatedMeasure` est
`{ weekStart, value }`, pas `{ localDate, valueSi }`.

## Pourquoi la garde de type ne l'a pas attrapé — **deux casts, pas un**

1. `} as unknown as MealBodyContext;` — le double transtypage n'affaiblit pas la
   vérification, il la **supprime** (cicatrice « `as` sur un type étranger
   désarme le typecheck »).
2. `buildMealPrompt(args as any)`, avec son `deno-lint-ignore no-explicit-any` —
   **tout** le jeu d'arguments passait sans contrôle, pas seulement le corps.

Et une **troisième** raison, qui est la vraie : **`deno check` sur ce fichier
était rouge**, indépendamment des casts — 5 erreurs `TS2322` dues à `base()`
(`mode: "to_shop" as const` que le scénario 1 passe à `from_pantry`,
`kitchenEquipment: null` que 4 scénarios passent en tableau). **Un fichier qu'on
ne peut pas vérifier est un fichier que personne ne vérifie.** Une garde a
besoin d'un cas qui passe.

## Ce que j'ai changé

- `ageBand: "30_44"` — la clé ;
- `latestWeight` / `latestWaist` : `{ weekStart, value }` (2026-08-17 **est** le
  lundi de la semaine du `today` du harnais, 2026-08-19) ;
- **les deux casts retirés** : `FULL_BODY` est un littéral typé, et l'appel est
  `buildMealPrompt(args)`, sans `any` ;
- les 5 erreurs préexistantes fermées : `mode: … as MealMode`,
  `kitchenEquipment: null as readonly KitchenTool[] | null`, plus les types
  réels sur `eatingRhythm`, `awayDays`, `fixedIntakes`, `dayProperties`,
  `merge`, `focusAxis`, `slot` ;
- `placement: "loose"` écrit sur le `fixedIntakes` du scénario 1 — l'union
  discriminée de `FixedIntake` l'exigeait, et l'objet n'en portait **aucun**.
  ⚠️ **Zéro octet de changement au prompt** : `fixed_intakes.ts:608`/`:627`
  faisaient déjà tomber un `placement` absent dans la branche `loose`. On a
  écrit la valeur dans laquelle il tombait déjà — prouvé par diff.

`deno check` sur le harnais : **rc=0**.

## L'effet, au caractère près

```
scenario-1  12722 → 12711        scenario-4   9283 →  9272
scenario-2   6469 →  6469        scenario-5  11842 → 11831
scenario-3  11785 → 11774
```

`diff` des cinq `prompt-user.txt` : **rien d'autre que les trois lignes**, dans
les quatre scénarios qui portent `FULL_BODY`. Scénario 2 (sans corps) inchangé.
Les cinq `prompt-system.txt` sont **byte-identiques**. Le mot `json` est présent
dans les deux moitiés des cinq prompts (piège n°3 du briefing, revérifié).

📌 Les nombres d'AVANT (12722 / 6469 / 11785 / 9283 / 11842) sont **exactement**
la colonne v15 du tableau de 2V — le harnais sur disque est bien l'état v15, et
la mesure d'avant est fidèle.
⚠️ **Conséquence pour 2A** : les longueurs publiées dans
`02-ponderation-solo/iterations/README.md` et dans `RAPPORT.md` sont désormais
périmées de 11 caractères sur quatre scénarios. Je n'ai pas édité ces documents —
ils appartiennent à un autre agent.

## La mutation

Remise de `ageBand: "30 to 44"` et de `latestWeight: { valueSi, localDate }` :

```
TS2322 [ERROR]: Type '"30 to 44"' is not assignable to type 'AgeBand | null'.
TS2561 [ERROR]: Object literal may only specify known properties, but 'valueSi'
                does not exist in type 'DatedMeasure'. Did you mean 'value'?
Found 2 errors.
```

La garde **mord**, et elle nomme le défaut mot pour mot. Restauré : rc=0.

## Y a-t-il d'AUTRES endroits où une prose passe pour une clé ?

**Non — un seul, celui-ci.** Balayage sur tout le dépôt (hors `node_modules`) des
quatre proses de bande d'âge :

```
$ grep -rn "30 to 44|18 to 29|45 to 59|60 or older" --include=*.ts --include=*.tsx .
supabase/functions/_shared/keel/meal_body.ts:53-57   ← la table elle-même
…_test.ts ×4, household_portions_test.ts ×2          ← des ASSERTIONS sur la sortie (correct)
student_body.ts:136                                  ← une phrase de prompt (correct)
scratchpad/qa_real_generation_20260811.ts:470        ← /30 to 44|30_44/ — une regex de VÉRIF, tolérante aux deux (correct)
scratchpad/…/build_scenarios.ts:80                   ← LE SEUL défaut
```

Et le balayage des casts désarmants sur `scratchpad/qa-generation/` ne rendait
qu'une occurrence : celle-ci. **Elle est fermée.**

## ⛔ Ce que j'ai REFUSÉ de faire

**Je n'ai pas régénéré les itérations archivées** (`iterations/00-baseline/`,
`02-silence-and-naming/`, …) avec le harnais corrigé. Ce sont les **octets
mesurés** d'une trajectoire ; les réécrire effacerait ce qui a été réellement
observé, et notamment la divergence n°1 que 2V a établie (le v15 archivé est un
brouillon à 72 octets près). Le harnais est réparé **pour la suite** ; l'archive
reste ce qu'elle est, avec le présent document pour la dater.

**Je n'ai pas touché aux divergences 4 et 6 de 2V** (le harnais exerce une
branche différente du runtime sur la capacité de la cuisine — `they can only
cook on: thu` contre `they usually cook on thu … Cook on wed as well`). C'est un
écart de **branche de code**, pas de fixture : le réparer demande de savoir
laquelle des deux le produit doit exercer, et cette question demande un run.

---

# CE QUE JE REMONTE SANS LE TRANCHER — récapitulatif

1. **Faut-il BLOQUER un texte que la ceinture n'a pas pu vérifier ?** (défaut 1).
   Aujourd'hui la panne est visible et le plan part quand même. Les deux moitiés
   du double verrou tombent par le même `catch` muet.
2. **`router/run.ts:2875` écrase le `null`** dès qu'une allergie de foyer existe :
   le tour est muet sur les contraintes du locuteur, sans le dire.
3. **Le `catch` muet de `generate-meal-v1:886-891`** — la source, hors périmètre,
   tenue par un autre agent.
4. **Le compteur de régime reste faux sur une classe résiduelle** (homonymes type
   `butter beans`, marqueur végétal dans un titre). La correction honnête est un
   **groupe alimentaire déclaré par le modèle**, pas une liste plus longue.
5. **La limite « sans A ni B »** de `forbidden_matcher.ts` (le « ni » français),
   déjà épinglée par un test, non corrigée parce que le même moteur arme la
   ceinture allergène qui, elle, REJETTE.
6. **Les longueurs de prompt publiées par 2A** sont périmées de 11 caractères sur
   quatre scénarios depuis la réparation du harnais.
7. **Observation de poste** : un premier passage de
   `deno test keel_output_locks_test.ts` a rendu `19 passés / 9 échecs`, puis
   trois passages consécutifs ont rendu `28 passés / 0 échec` sur des octets
   identiques (`cksum` des trois journaux). Dépôt partagé, écriture concurrente
   probable sur un `_shared` importé. **Ne conclure d'aucun rouge isolé sans le
   rejouer** — même famille que le 502 Kong du briefing.
