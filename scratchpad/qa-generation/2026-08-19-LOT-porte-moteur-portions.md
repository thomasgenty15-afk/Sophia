# LOT « porte du moteur » — le corps de la fiche dimensionne enfin la part

**2026-08-19 · branche `ff-001-quotidien-du-coach` · foyer 1V à quatre bouches ·
6 runs réels (3 aboutis, 3 tués par des 502 Kong), 7 mutations de source.**

Fixture : celle de 1V, inchangée
(`01-injection/verification-1v/2026-08-19-0210-1v-foyer-4-bouches.sql`).
Les trois fichiers de chaque run :
`scratchpad/qa-generation/2026-08-19-lot-porte-moteur/runs/<RUN>/`
(`inputs.json`, `request-body.json`, `dump/prompt-system.txt`,
`dump/prompt-user.txt`, `dump/output.json`, `http-response.json`,
`plan-written.json`). Script : `…/run.sh`, boucle de relance `…/retry.sh`.

| run | `request_id` | HTTP | sys / user (car.) | plan écrit |
|---|---|---|---|---|
| **A1** | `a0100001-…-0001` | 200, 41 s | 15 486 / 13 891 | `b336cc50…` |
| **B1** | `a0200001-…-0001` | **502** | 15 486 / 14 524 | — |
| **B3** | `a0200003-…-0003` | **502** | 15 486 / 14 524 | — |
| **C1** | `c010000a-…-0003` | 200, 36 s | 15 486 / 15 700 | `54ca5396…` |
| **C2** | `c020000b-…-0001` | 200, 37 s | 15 486 / 15 700 | `8f6e2905…` |
| **C3** | `c030000c-…-0002` | 200, 106 s | 15 486 / 15 700 | `1c5c6c8e…` |

Chaque ligne prouvée existante avant lecture
(`select source, status, system_prompt_chars from llm_raw_response_events where request_id=…`)
et vidée avec `--source generate-household-meal-v1` explicite — la lane porte
bien deux appels par `request_id` (`.protein_anchor_retry`).

⚠️ **Trois runs sont morts en 502 Kong**, conteneur edge recréé en plein vol par
une session voisine. Un quatrième est mort sur
`SEVERITY_READING_BLOCK is not defined` — du code d'un **autre agent**, à
mi-écriture sur le disque, servi par le runtime. Aucune conclusion n'en est
tirée ; on relance.

---

## ① LE TABLEAU AVANT / APRÈS — les quatre mêmes bouches, les mêmes entrées

| | Odalric | Peregrine | Casimir | Wilfrid |
|---|---|---|---|---|
| compte | **oui** (maître) | **non** | non | non |
| âge | 38 ans | 34 ans | **16 ans** | **7 ans** |
| corps de la FICHE | 183 cm / 79 kg | 152 cm / 47 kg | 178 cm / 70 kg | **122 cm / 23 kg** |
| ce que le PROMPT dit de son corps | `[height 183 cm; age band 30 to 44; gender male]` | **rien** | **rien** | **rien** |

### AVANT — plan `1239047d…` (run F3 de 1V, code d'avant ce lot, relu par moi en base)

| | Odalric | Peregrine | Casimir | Wilfrid |
|---|---|---|---|---|
| boîte écrite au plan | 1800 g | **1800 g** | **1800 g** | **1800 g** |
| phrase lue à table (poulet, déjeuner) | 220 g | **220 g** | 140 g | **140 g** |
| facteur appliqué | 1 | 1 | 1 | 1 |
| motif au journal | `sized` (jamais appliqué) | **`restriction_floor`** | **`restriction_floor`** | **`restriction_floor`** |

```json
{"boxes":7,"sized":0,"unchanged":0,"shared_mixed":7,
 "mouths":{"sized":1,"restriction_floor":3,"minor":0,"no_body":0,"no_pace":0,
           "age_unknown":0,"no_direction":0,"implausible_factor":0,
           "doctrine_no_counting":0}}
```

### APRÈS — plan `54ca5396…` (run C1), préparation `prep_chicken_tray`

| | Odalric | Peregrine | Casimir | Wilfrid |
|---|---|---|---|---|
| grammes **écrits par le modèle** | 360 | **361** | 270 | **270** |
| **facteur appliqué** | **1,3658** | **0,6681** | **1,3559** | **0,7342** |
| · part de fiche (maintenance relative) | 1,2418 `sized` | 0,6681 `sized` | 1,3559 `sized` | 0,7342 `sized` |
| · chaîne d'objectif (perte/prise) | 1,0999 `sized` | 1,0000 `no_pace` | 1,0000 `minor` | 1,0000 `minor` |
| **boîte écrite au plan** | **492 g** | **241 g** | **366 g** | **198 g** |

```json
{"boxes":20,"sized":20,"unchanged":0,"shared_mixed":0,"capped_by_pot":0,
 "unverifiable":2,"share_clamped":0,
 "mouths":{"sized":1,"minor":2,"no_pace":1,"restriction_floor":0,
           "restriction_unknown":0,"no_body":0,"age_unknown":0,
           "no_direction":0,"implausible_factor":0,"doctrine_no_counting":0},
 "share":{"sized":4,"restriction_floor":0,"restriction_unknown":0,
          "doctrine_no_counting":0,"age_unknown":0,"no_body":0,"no_reference":0}}
```

**Lu ligne à ligne.**

- **Le modèle n'a toujours rien pour les distinguer, et ça se voit.** Il écrit
  **360 / 361** aux deux adultes (1 g d'écart pour 32 kg de différence) et
  **270 / 270** aux deux mineurs, au gramme près, pour 47 kg d'écart. C'est le
  défaut de 1V, reproduit à l'identique. La ligne « grammes écrits par le
  modèle » est reconstruite exactement — `sizeBoxesFromTarget` fait
  `round(grammes × facteur)` et aucun plafond de casserole n'a mordu
  (`capped_by_pot: 0`), donc `écrit / facteur` rend l'entrée.
- **C'est le MOTEUR qui sépare les quatre.** 492 / 241 / 366 / 198 : quatre
  nombres différents, et l'écart va dans le sens du corps.
- **L'ado de 70 kg cesse d'être servi comme l'enfant de 7 ans** : 366 contre
  198, soit ×1,85. Neuf comparaisons sur neuf les trouvaient identiques.
- **L'adulte de 47 kg cesse d'être servie comme l'homme de 79 kg** : 241 contre
  492.
- **`restriction_floor` est tombé de 3 à 0**, et les motifs rendus sont
  désormais les vrais : deux `minor` (la chaîne d'objectif refuse un déficit à
  un mineur — inchangé, et c'est le produit) et un `no_pace` (Peregrine a un
  objectif, personne n'a réglé son cran).

### Les deux autres runs, mêmes entrées

| run | boîtes | `sized` | `shared_mixed` | Odalric / Peregrine / Casimir / Wilfrid (une préparation) |
|---|---|---|---|---|
| **C1** | 20 | **20** | 0 | 492 / 241 / 366 / 198 (`prep_chicken_tray`) |
| **C2** | 12 | **12** | 0 | 710 / 347 / 475 / 257 (`prep_chicken_rice_tray`) |
| **C3** | 24 | **24** | 0 | 710 / 347 / 461 / 250 (`prep_traybake`) |

**Le facteur, lui, ne bouge pas d'un run à l'autre** — 1,3658 / 0,6681 / 1,3559 /
0,7342 aux trois runs, vérifié en divisant les grammes écrits. Ce qui varie est
le grammage **brut du modèle** (360 → 520 → 520 sur la même demande), et cette
variance-là est celle d'hier, pas une nouveauté du lot. **Le moteur est stable ;
le modèle ne l'est pas.**

---

## ② LES LIGNES CHANGÉES, ET POURQUOI

### La ligne du défaut — `_shared/keel/household_portions.ts`, `memberTargetFactor`

```diff
-    restrictionFlag: member.body?.restrictionFlag ?? true,
+    restrictionFlag: restrictionFlagOf(restriction),
```

`member.body` est un `MealBodyContext` : il n'existe **que pour un compte**. Le
corps de la **fiche** arrivait, lui, dans `args.body` — chargé depuis
`household_member_bodies` via `keel_household_bodies_for`, complet, et jeté par
une porte qui regardait ailleurs. Un `?? true` fail-closed transformait
« cette bouche n'a pas de compte » en « son plancher TCA est levé ».

`restriction` est un **état à quatre valeurs** (`MOUTH_RESTRICTION_STATES`),
calculé chez l'appelant parce que c'est l'appelant qui sait :

```ts
// generate-household-meal-v1/index.ts
const restrictionOf = (m: LoadedMember): MouthRestrictionState => {
  if (m.userId === null) return "no_account";
  if (m.body === null || m.body.restrictionFlag === null) return "unreadable";
  return m.body.restrictionFlag ? "raised" : "clear";
};
```

- `raised` → `restriction_floor`. **Inchangé, c'est le produit.**
- `unreadable` → **`restriction_unknown`**, motif NEUF. Le fail-closed reste
  entier ; il porte enfin son nom.
- `no_account` → il n'y a **rien à lire**, donc rien à craindre d'une lecture.
  La bouche est dimensionnée par le corps de sa fiche.
- `clear` → dimensionnée.

`PortionMember` n'a pas de `userId`, et c'est voulu (une bouche EST un
`member_id`) : le module pur ne peut pas distinguer les trois `null` de `body`.
D'où le paramètre, **requis** — c'est le compilateur qui a recensé les
appelants, et il en a trouvé deux.

### La deuxième moitié — la part de fiche (`bodyShareFactors`)

Corriger la porte ne suffisait pas : la chaîne qu'elle garde est celle de
l'**objectif** (perte/prise + cran de rythme). Elle refuse — à juste titre —
tout mineur (`minor`) et toute bouche sans cran (`no_pace`). Le corps d'un
enfant n'y entre par aucun chemin.

D'où une seconde chaîne, **de maintenance**, écrite à côté :

```
facteur_i = entretien_i / moyenne(entretiens de la table)
```

- **Aucun objectif n'y entre**, par construction : la fonction ne prend pas de
  `goal`. Même patron que `childEnvelopeFromBody` — la garde est l'absence d'un
  paramètre, pas un `if` qu'on peut oublier.
- **L'entretien vient de `estimatedMaintenanceFor`**, qui choisit l'équation sur
  `isMinor` : Schofield / FAO-WHO-UNU pour un mineur, Mifflin-St Jeor pour un
  adulte. C'est déjà la lecture que `mouthEnvelope` fait de `lineBodies` ; on
  n'a pas fabriqué une seconde lecture de corps.
- **La normalisation est la MOYENNE**, donc `Σ facteurs = nombre de bouches` :
  ce qui est retiré à un petit corps est exactement ce qui est ajouté à un
  grand. La casserole ne gonfle pas. Propriété testée.
- **Bornes `[0,55 ; 1,45]`, qui RABOTENT** au lieu de refuser — l'arbitrage
  **inverse** de `BOX_FACTOR_MIN`, et il est motivé : refuser rend `1`,
  c'est-à-dire **la boîte de l'adulte de 79 kg servie à l'enfant de 23 kg**, et
  ça mordrait d'abord sur le plus petit corps de la maison. Chaque rabotage est
  compté (`share_clamped`).
- **La porte ② (mineur) est évaluée puis dépassée, et elle seule.**
  `energySafetyGates` est appelée avec le VRAI verdict d'âge ; ① (plancher) et
  ③ (doctrine) survivent tels quels. La chaîne est **rejouée** avec un verdict
  de majeur quand le motif est `minor`, parce qu'elle ne rend que la PREMIÈRE
  porte fermée : sans ça, une doctrine « on ne compte pas » fermerait la part
  des adultes et laisserait celle des enfants ouverte.

### La troisième moitié — le prompt, et elle était nécessaire (mesurée)

Après le correctif moteur seul, **run A1** :

```json
{"boxes":3,"sized":0,"shared_mixed":3,"share":{"sized":4},"mouths":{"restriction_floor":0,...}}
```

Quatre facteurs distincts calculés, **zéro appliqué**. Le modèle écrivait une
boîte pour les quatre, ou une boîte par **classe** (les deux adultes ensemble,
les deux mineurs ensemble) — et `sizeBoxesFromTarget` refuse de couper une boîte
partagée dont les bouches divergent (`shared_mixed`), pour une raison qui reste
juste : fabriquer un identifiant de boîte laisserait `dishes[].uses[].box_id`
pointer sur un contenu qui n'existe pas.

La consigne d'origine (« when their shares differ they get one box each ») est
juste **et ne suffit pas** : le modèle n'a aucun moyen de savoir que les parts
diffèrent — les crochets de corps ne figurent que sur la ligne d'un compte. On
lui donne donc le **nombre attendu** et on **nomme l'échappatoire**, la recette
mesurée de ce dépôt :

```
"grams" is what ONE person takes out, never the size of the tub. This
table is served 4 different weights, so EVERY preparation carries
4 boxes. Two names go on the same box only when they take the same
weight, and here no two of them do. Every name above is in exactly ONE box
of each preparation -- never two, never none.
```

- **Quatre lignes remplacent quatre lignes. +61 caractères** sur le brief entier
  (2 138 → 2 199). La lane frôle le mur des 240 s ; les trois runs aboutis ont
  pris 36 s, 37 s et 106 s.
- **Le nombre est un nombre de BOÎTES, jamais un fait de corps.** Il ne nomme
  personne, ne dit ni âge ni poids, et rien ne s'en reconstruit.
- **Byte-identique pour tout le reste de la base** : `weightGroups <= 1` (un seul
  poids, ou aucun corps saisi) rend le texte d'avant, au caractère près. Testé.
- Le mot `json` n'a pas disparu du prompt (piège n° 3 de l'instrument, revérifié).
- ⚠️ **Le compte est calculé sur la part de FICHE seule** : le cran de rythme
  (`paceByMember`) n'est lu qu'après le modèle. Le nombre dit est donc un
  **plancher** — la chaîne d'objectif ne peut que séparer davantage. L'échappatoire
  nommée rend la phrase juste même quand le compte est bas d'une unité.

### Le compteur — deux histogrammes, jamais un

`generated_from.household.box_sizing` porte maintenant `mouths` (chaîne
d'objectif) **et** `share` (chaîne de maintenance), plus `share_clamped`. Deux
décisions ⇒ deux motifs. Vocabulaires **séparés et fermés**
(`BOX_SIZING_REASONS`, `BODY_SHARE_REASONS`) : les fondre ferait un compteur où
la moitié des valeurs seraient structurellement à zéro dans chaque colonne,
c'est-à-dire un compteur qu'on ne relit plus. Aucun `member_id` ni dans l'un ni
dans l'autre.

### Fichiers touchés

| fichier | quoi |
|---|---|
| `_shared/keel/household_portions.ts` | l'état à 4 valeurs, `restriction_unknown`, `bodyShareFactors`, `householdMouthFactors`, `weightGroupCount`, le bloc de boîtes du brief |
| `_shared/keel/household_meal_generation.ts` | `weightGroups` dans l'entrée du prompt |
| `generate-household-meal-v1/index.ts` | `restrictionOf`, `coachCounting` hissé avant le prompt, les deux compteurs |
| `_shared/keel/household_body_share_test.ts` | **neuf** — 18 tests |
| 6 fichiers de test | le paramètre requis, recensé par le compilateur |

⛔ **`_shared/keel/household_safety.ts` n'a pas été touché** — périmètre de
l'agent voisin.

---

## ③ LES TROIS GARDES QUE JE DEVAIS PRÉSERVER

### 1. Le vrai plancher TCA mord toujours

Une bouche qui **a un compte** et dont `restriction_flag` est réellement levé
sort `restriction_floor` sur **les deux** chaînes, facteur 1, aucun
dimensionnement. Prouvé de façon adversariale sur toutes les combinaisons
`ageState × coachCounting`, et sur le facteur **appliqué** (la composition des
deux chaînes ne le rattrape pas) :
`household_body_share_test.ts :: « LE VRAI PLANCHER TCA MORD TOUJOURS »`.

Le plancher reste évalué **en premier** dans les deux passes de la chaîne
(y compris la passe rejouée qui dépasse la porte mineur) : une ceinture levée
n'arrive jamais jusqu'au calcul.

Le fail-closed pour l'**inconnu** est intact — `unreadable` ferme, sous le nom
`restriction_unknown`.

⚠️ **Limite nommée** : la preuve du plancher est unitaire, pas end-to-end.
`restriction_flag` se dérive d'une trajectoire de poids
(`weekly_reviews` → `evaluateRestrictionForStudent`) ; le lever pour un run réel
demanderait de fabriquer une perte de poids dans la fixture d'un autre agent. La
chaîne appelée est la même, et les tests de source existants
(`energy_gate_mouth_test.ts`, `no_calorie_to_student_property_test.ts`) tiennent
son ordre — ils sont verts.

### 2. Le corps d'un mineur ne s'énonce jamais

Cherché sur les **trois prompts** (système + utilisateur) et les **trois plans
écrits** de C1/C2/C3 : `122`, `23 kg`, `178 cm`, `70 kg`, `47 kg`, `2010`,
`2019`, `BMI`, `kcal`, `calorie`.

| | prompts C1/C2/C3 | plans C1/C2/C3 |
|---|---|---|
| `122`, `23 kg`, `178 cm`, `70 kg`, `47 kg`, `2010`, `2019`, `kcal` | **0** | **0** (1 faux positif, voir ci-dessous) |
| `BMI` | 1 | **0** |
| `calorie` | 4 | **0** |

Les 5 occurrences au prompt sont **les phrases d'interdiction elles-mêmes**
(`no BMI, no category, no target`, `never a reason, a goal, a calorie count`) —
elles doivent y rester, et un test le tient. Le seul `122` d'une sortie est un
grammage (`box_prep_veg_casimir: 122 g`), pas une taille.

Un test dédié le tient sur le bloc neuf :
`« LE BRIEF DIT LE NOMBRE DE BOÎTES, ET AUCUN FAIT DE CORPS »` — il cherche les
**chiffres des quatre corps**, pas les mots `kcal`/`BMI` qui figurent
légitimement dans l'interdiction.

### 3. Aucune calorie dans le texte d'un plan

`0` occurrence de `kcal` / `calorie` dans les trois plans écrits. Ce qui traverse
la nouvelle chaîne est **sans unité** : `{factor, reason}` et rien d'autre,
asserté par égalité de clés (`« AUCUN kcal NE SORT DE LA PART »`). L'entretien en
kcal ne sort d'aucune fonction — il est un dénominateur interne.

**Aucun matcher maison** n'a été écrit. Le seul texte produit est le bloc de
boîtes, et il est déclaratif.

---

## ④ LES MUTATIONS — chaque garde a été vue mordre

`deno test household_body_share_test.ts target_grams_test.ts` — 53 tests verts
en état nominal. Chaque mutation appliquée seule, puis remise en état.

| # | mutation | rouge |
|---|---|---|
| **M1** | `restrictionFlagOf("no_account")` rend `true` — **le défaut d'origine, littéralement** | **12 tests** |
| **M2** | `namedFloorReason` rend toujours `restriction_floor` — le compteur qui ment | **4 tests** |
| **M3** | la porte **mineur** n'est plus dépassée par la part de fiche | **6 tests** |
| **M4** | les bornes **refusent** au lieu de raboter (l'arbitrage de la cible) | **1 test** |
| **M5** | le brief ne dit plus le nombre de boîtes — le lot débranché du prompt | **1 test** |
| **M6** | normalisation par le **max** au lieu de la moyenne — la casserole ne se conserve plus | **5 tests** |
| **M7** | les non-dimensionnées comptent chacune pour un groupe | **0 test — SURVÉCUE** |

⚠️ **M7 a survécu, et le code a changé à cause d'elle.** `weightGroupCount`
rangeait les bouches non dimensionnées dans un sac « unsized » séparé. Aucun
test ne pouvait distinguer la mutation — et pour cause : **toute bouche non
dimensionnée porte le facteur `1` exactement**, donc elle se range déjà avec les
autres `1`. La branche était une garde qui ne gardait rien. Elle est **partie**
plutôt que d'être « couverte » par un test fabriqué autour d'elle : ce qui reste
est la seule question qui compte pour une boîte — deux bouches prennent-elles le
**même poids** ?

---

## ⑤ CONTRÔLES

- `deno test supabase/functions/_shared/keel/ + no_calorie_to_student_property_test.ts`
  → **3 711 passés, 0 échec** au dernier passage (le total bouge d'un passage à
  l'autre : une session voisine ajoute des tests au même répertoire). Les tests
  de source de la chaîne TCA et l'allowlist d'appelants (`energy_gate_mouth_test.ts`,
  clause C3) sont verts.
- `deno test household_body_share_test.ts target_grams_test.ts` → **53 passés**.
- `deno check` sur `household_portions.ts`, `household_meal_generation.ts`,
  `generate-household-meal-v1/index.ts` → OK.
- **Front non touché** ⇒ pas de vitest, pas de `tsc`.
- ⚠️ **Un rouge étranger, laissé tel quel** :
  `sophia-brain/test_harness/keel_properties/no_food_solicitation_property_test.ts`
  ne passe pas `hasStrip` à `decideDailyPulse` (champ requis, `daily_pulse.ts`
  au HEAD). C'est le lot « bande du soir », pas celui-ci.
- Le runtime edge a été **redémarré** après chaque modification de `_shared/`, et
  la fraîcheur prouvée par **observation** : la ligne `table is served 4
  different weights` apparaît au prompt vidé (`runs/B1/dump/prompt-user.txt:163`).

---

## ⑥ CE QUE JE N'AFFIRME PAS

1. **Que le modèle écrira toujours une boîte par bouche.** Trois runs sur trois
   l'ont fait après le correctif de prompt ; A1 (sans ce correctif) ne l'a pas
   fait. Quand il ne le fait pas, `shared_mixed` le compte, et **le grammage ne
   bouge pas** — direction d'erreur sûre : le plan d'hier.
2. **Que la borne basse ne mord jamais.** Elle mord à partir d'un tout-petit
   (~2 ans, 12 kg) à une table de deux adultes : facteur brut 0,52, raboté à
   0,55, `share_clamped: 1`. Un rabotage est compté, jamais silencieux.
3. **Que la chaîne de doctrine soit le bon arbitrage pour une part de fiche.**
   J'ai **gardé** la porte ③ : une doctrine « on ne compte pas » (ou illisible)
   ferme aussi la part de fiche, et l'enfant retrouve alors la boîte de
   l'adulte. C'est conservateur et c'est compté (`share.doctrine_no_counting`),
   mais c'est une décision de produit que je n'ai pas prise seule — **à
   trancher**.
4. **Que le nombre dit au prompt soit exact au groupe près.** Il est calculé
   avant l'appel modèle, donc sans le cran de rythme : c'est un plancher.

---

# ⑦ REPRISE — LA SECONDE SURFACE : LA PHRASE LUE À TABLE

**Le coordinateur avait raison, et je l'ai reproduit sur mes trois plans avant
de toucher au code.** Les BOÎTES portaient le facteur ; `member_portions[].portion_note`
— la phrase qu'un humain exécute — ne le portait pas.

```
select p->>'display_name', left(p->>'portion_note',115)
from student_generated_meals m, jsonb_array_elements(m.member_portions) p
where m.id = '<plan>';
```

| plan (post-correctif moteur) | Odalric 79 kg | Peregrine 47 kg | Casimir 70 kg | Wilfrid 23 kg |
|---|---|---|---|---|
| `54ca5396` 23:27 | 240 g traybake | **240 g** | 180 g | **180 g** |
| `8f6e2905` 23:28 | 180 g chicken | **180 g** | 120 g | **120 g** |
| `1c5c6c8e` 23:31 | 150 g traybake | **150 g** | 100 g | **100 g** |

**Deux étages, pas quatre, trois plans sur trois.** Le défaut d'origine, intact,
sur la surface la plus exposée.

## Pourquoi ça ne se répare pas en réécrivant la phrase

⛔ Multiplier les nombres d'une prose de modèle demande de deviner lesquels sont
des parts : « le bidon de 500 g », « 2 tranches », « coupe en 3 cm ». C'est la
cicatrice « laitue ≠ lait » — 12 faux positifs sur 12 — sur un texte lu à voix
haute. **Je n'ai pas touché un caractère de la prose du modèle.**

La réparation est de retirer la **deuxième autorité sur le même nombre**.

## Les quatre gestes, chacun mesuré, chacun motivé par la mesure précédente

| # | geste | ce qui l'a motivé, mesuré |
|---|---|---|
| **1** | Le brief cesse de demander un poids au modèle ; `attachSizedQuantities` recolle à la phrase les grammes **des boîtes**, après dimensionnement | `1c5c6c8e` : boîtes à 4 étages, phrase à 2 |
| **2** | « Weigh every one of those boxes to the SAME ordinary share » | **D1/D2/D3** : le modèle écrivait 291/292 aux adultes et 175/174 aux mineurs — un découpage par CLASSE que le moteur multipliait par-dessus. L'ado de 70 kg, dont le corps demande **2,03×** la part de l'adulte de 47 kg, en recevait 1,22× → 1,16× → **1,02×** |
| **3** | L'échappatoire **littérale** : « The same figure in all 4 boxes -- the child's box carries the same number as the adult's » | **E1** : geste 2 seul ⇒ le découpage passe de 2,0:1 à **1,5:1** au lieu de disparaître. « Sois uniforme » sans nommer ce qu'on refuse se fait satisfaire par une paraphrase (leçon LOT 4C, rejouée) |
| **4** | La ligne du mineur cesse de dire sa TAILLE (`CHILD_DIRECTION` → `SAME_DISH_DIRECTION`), et le brief interdit toute comparaison de taille | **E3/F3** : « Serve a smaller child-sized share … 610 g » à côté de « a larger share … 301 g ». Le mot du modèle contredisait le nombre du moteur — et §8.4 : « expliquer à un enfant que sa part est plus petite est à une phrase d'un dégât réel » |

## LE TABLEAU FINAL — plan `cfd44e89`, 2026-08-19 00:35 UTC

`box_sizing: {boxes: 16, sized: 16, shared_mixed: 0, capped_by_pot: 0, share_clamped: 0}`
`portion_quantities: {notes: 4, engine: 4, model_quantity: 0}`

| préparation | Odalric (79 kg) | Peregrine (47 kg) | Casimir (16 a, 70 kg) | Wilfrid (7 a, 23 kg) |
|---|---|---|---|---|
| grammes **écrits par le modèle** (base) | 200 | 201 | 200 | 200 |
| Herb Roasted Chicken Thighs | **273 g** | **134 g** | **271 g** | **147 g** |
| Steamed Basmati Rice | **341 g** | **167 g** | **339 g** | **184 g** |
| Garlic Roasted Broccoli | **205 g** | **100 g** | **203 g** | **110 g** |
| Simmered Berry Compote | **102 g** | **50 g** | **102 g** | **55 g** |

Casimir / Peregrine servi = **2,02** ; le rapport des corps dit **2,03**.

**Les phrases, telles qu'elles sont lues à table :**

```
Odalric   Serve a larger share of the chicken and rice with the standard broccoli
          portion. For breakfast, add a spoonful of blackcurrant jam to the
          sourdough toast. — Herb Roasted Chicken Thighs 273 g · Steamed Basmati
          Rice 341 g · Garlic Roasted Broccoli 205 g · Simmered Berry Compote 102 g
Peregrine Serve a larger share of chicken and rice. Ensure no orange-coloured
          vegetables or fennel-containing herbs are added to the plate.
          — Herb Roasted Chicken Thighs 134 g · Steamed Basmati Rice 167 g · …
Casimir   Serve the standard share of all components. Provide hot sauce on the
          side for every meal. — Herb Roasted Chicken Thighs 271 g · …
Wilfrid   Serve the standard share of all components. Ensure all bread crusts are
          removed before serving. — Herb Roasted Chicken Thighs 147 g · …
```

Le geste 4 se lit à l'octet : `child-size share` → **0 occurrence** au prompt de
`G1` comme dans les quatre phrases. Les mineurs lisent « the standard share of
all components », et leur grammage réel suit. La consigne qualitative du modèle
survit entière (« no orange-coloured vegetables », « bread crusts removed »,
« hot sauce on the side »).

## Les règles dures, revérifiées sur la seconde surface

| | prompts D/E/F/G | phrases écrites |
|---|---|---|
| `kcal`, `calorie`, `BMI` | seulement les phrases d'INTERDICTION | **0** |
| `23 kg`, `70 kg`, `47 kg`, `79 kg`, `122 cm`, `178 cm`, `152 cm`, `2010`, `2019` | **0** | **0** |
| comparaison de taille sur un mineur | **0** (geste 4) | **0** |

⛔ **La clause du moteur ne peut pas porter un fait de corps : elle est construite
à partir de DEUX choses**, un titre de préparation et un entier de grammes. Garde
par construction, pas par filtre — et un test le rejoue sur la population du défaut.

⛔ **Aucun mot de moteur dans la phrase.** `MemberPortion.portionNote` documente
pourquoi `null` n'est pas remplacé par une phrase par défaut : « une phrase écrite
ici serait dans UNE langue ». La clause n'a donc ni verbe, ni étiquette : titres du
plan + nombres + `g`. Un test retire les titres et les nombres et exige qu'il ne
reste aucune lettre.

⚠️ **La somme reste celle de la casserole.** La phrase cite la boîte APRÈS
`sizeBoxesFromTarget`, plafond de récipient compris (`capped_by_pot: 2` au run D1,
et la phrase a cité les grammes rabotés). Un second calcul ici divergerait au
premier plafond qui mord ; propriété testée.

## ⑦bis — LES MUTATIONS DE LA SECONDE SURFACE

| # | mutation | rouge |
|---|---|---|
| **M8** | `attachSizedQuantities` n'ajoute plus rien — le lot débranché de la 2ᵉ surface | **6 tests** |
| **M9** | la phrase cite la PREMIÈRE boîte au lieu de celle de la personne | **3 tests** |
| **M10** | `model_quantity` ne compte plus la désobéissance | **1 test** |
| **M11** | la prose du modèle est ÉCRASÉE au lieu d'être préfixée | **1 test** |
| **M12** | le brief redemande les grammes au modèle quand le moteur dimensionne | **1 test** |
| **M13** | la ligne du mineur redit sa TAILLE malgré le moteur | **1 test** |

`deno test household_body_share_test.ts` → **25 passés** en état nominal.
`deno test supabase/functions/_shared/keel/` → **3 714 passés, 0 échec**.

## ⑦ter — CE QUE JE N'AI PAS PU PROUVER, ET COMMENT L'OBTENIR

⚠️ **LES RUNS D/E/F/G ONT ÉTÉ SERVIS PAR LE MODÈLE DE REPLI, PAS PAR
`GLOBAL_AI_MODEL`.** Le compte OpenAI s'est vidé pendant le lot ; relevé en base
(`llm_raw_response_events`) : `d010000a…` à 23:49 → `breaker_skip gpt-5.4-mini`
puis `success gemini-3-flash-preview`. Idem pour E/F/G.

Conséquence, dite sans arrondi :

- **Ce qui est prouvé indépendamment du modèle** : le moteur calcule quatre
  facteurs distincts, les applique aux boîtes, et **écrit lui-même** les grammes
  dans la phrase. Ce chemin est déterministe et couvert par 25 tests unitaires et
  13 mutations.
- **Ce qui n'est mesuré QUE sur le modèle de repli** : l'obéissance du modèle aux
  trois consignes neuves (base uniforme dans les boîtes, aucun poids dans la
  phrase, aucun mot de taille). `model_quantity: 0` sur **6 runs sur 6**, et base
  uniforme sur E2/E3/F3/G1 — mais avec `gemini-3-flash-preview`.
- **NON MESURÉ, CRÉDIT ÉPUISÉ** : le même run sous `gpt-5.4-mini`. Rien ne dit
  qu'il obéit à l'identique — le LOT 4C a mesuré 93 notes sans un gramme sur ce
  modèle-là.

**La commande exacte à rejouer, dès que le crédit est rétabli :**

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
docker restart supabase_edge_runtime_Sophia_2 && sleep 5
./scratchpad/qa-generation/2026-08-19-lot-porte-moteur/retry.sh h010000a \
  scratchpad/qa-generation/2026-08-19-lot-porte-moteur/runs/H1 6
# puis, sur le plan neuf que le script annonce :
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c \
  "select p->>'display_name', left(p->>'portion_note',160) \
   from student_generated_meals m, jsonb_array_elements(m.member_portions) p \
   where m.id='<plan>';"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c \
  "select generated_from->'household'->'portion_quantities' \
   from student_generated_meals where id='<plan>';"
# vérifier AUSSI le modèle réellement servi, sinon la mesure ne dit pas de qui
# elle parle :
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c \
  "select status, model from llm_raw_response_events \
   where request_id='h010000a-0000-4000-8000-000000000001' \
     and source='generate-household-meal-v1' order by created_at;"
```

**Ce qu'il faut y lire** : `portion_quantities.model_quantity` doit valoir `0`
(le modèle n'a écrit aucun poids), les grammes bruts des boîtes doivent être
**uniformes** entre les quatre bouches, et `child-size` doit valoir 0 occurrence.

Autres non-mesurés, nommés :

1. **Un foyer sans corps saisi** n'a pas été rejoué après ce lot. Le chemin est
   gardé par byte-identité et testé unitairement (`weightGroups <= 1` ⇒ brief
   d'hier ; `sized === 0` ⇒ phrase d'hier), pas par un run.
2. **Une langue autre que `en-GB`.** La clause du moteur est sans mot, donc
   structurellement neutre, mais aucun run `fr-FR` n'a été fait.
3. **Le vrai plancher TCA de bout en bout** — voir §③, inchangé.

---

# ⑧ REPRISE 2 — LA COMPARAISON GÉNÉRIQUE, ET LA CONTRADICTION DANS LA LIGNE

**Le coordinateur avait raison une seconde fois.** `child-size` était bien mort
(0 occurrence, vérifié) ; la comparaison **générique** avait survécu, et elle
venait d'une source que le geste 4 n'avait pas touchée : `SERVING_DIRECTION`.

## Le défaut, sur mon propre plan `cfd44e89`

| | mot lu à table | grammes reçus | |
|---|---|---|---|
| Odalric (79 kg) | « Serve a **larger** share… » | 273 g | ✅ |
| Peregrine (47 kg) | « Serve a **larger** share… » | **134 g** | ❌ **la plus petite de la table** |
| Casimir (16 a, 70 kg) | « Serve the **standard** share… » | **271 g** | ❌ **presque la plus grande** |
| Wilfrid (7 a, 23 kg) | « Serve the **standard** share… » | 147 g | ✅ |

Le modèle décrit par **classe** — adultes « larger », mineurs « standard » —
pendant que le moteur chiffre par **corps**. **Deux bouches sur quatre lisaient
l'inverse de ce qu'elles recevaient**, et c'est pire que le défaut d'origine sur
un point précis : avant, la phrase était fausse mais **cohérente**. Là elle se
contredit **dans sa propre ligne**, et quelqu'un qui la suit ne sait pas quoi faire.

⚠️ Et ça touche une promesse publique : `FamiliesPage` affirme « Their share
follows their age ». Le nombre la tenait ; les mots la démentaient.

## Le geste — une seule autorité sur la taille, sans exception

Le moteur possède le nombre ⇒ **le modèle ne décrit plus aucune taille**. Sa
phrase porte ce que lui seul sait : la manière, l'ordre, les substitutions, les
précautions.

1. **La source est tarie.** `sizeFreeDirectionFor` remplace, **dans le brief et
   seulement quand le moteur dimensionne**, les cinq chaînes de direction par
   des équivalents sans magnitude :

   | dit hier | dit quand le moteur pèse |
   |---|---|
   | `generous vegetables, full protein share, smaller starch share` | `vegetables first on the plate, then the protein, then the starch` |
   | `larger protein and starch share, same vegetables` | `protein and starch first on the plate, then the vegetables` |
   | `balanced share of every component` | `all the components together on the plate` |
   | `child-size share of the same dish` | `all the components together on the plate` |

   ⚠️ **`SERVING_DIRECTION` n'est PAS modifiée.** `servingDemandsFor` /
   `readServingDemands` — la fusion et l'arbitrage — lisent exactement ce qu'ils
   lisaient hier. Et l'ordre des trois cas reste écrit **une seule fois**, dans
   `servingDirectionFor` : ce qui s'ajoute est une **traduction** clée sur ce
   qu'elle rend, et un test exige qu'elle couvre **toute** sortie possible —
   ajouter un objectif casse le banc avant d'atteindre une assiette.

   ⚠️ **Ce qui se perd, nommé** : la MAGNITUDE de la composition (« smaller
   starch share ») sort du texte de l'assiette ; il n'en reste que l'ORDRE. Un
   mot de composition que le modèle rend comme une comparaison entre **deux
   personnes** est pire qu'aucun mot.

   ⚠️ `SAME_DISH_DIRECTION` (« the same dish as the rest of the table »), livrée
   au geste 4, a été **supprimée** : « the same as » est très exactement ce que
   la nouvelle interdiction refuse, et la table la couvre désormais.

2. **Le vocabulaire est nommé LITTÉRALEMENT** dans le brief — la première
   rédaction disait « bigger, smaller or child-sized », et le modèle a écrit
   « a larger share » puis « the standard share », deux tournures qu'elle ne
   nommait pas :

   ```
   Never describe the size of anyone's share: not bigger, not smaller, not
   larger, not standard, not normal, not child-sized, not the same as
   someone else's. How much each person takes is settled by this plan. Say
   the manner, the order, the swaps and the care -- what only you know.
   ```

3. **Le comptage** — `SIZE_WORD_TERMS`, **liste fermée**, passée au moteur du
   dépôt (`findForbiddenMatches`, `allowNegatedMentions: false`), exactement
   comme `VAGUE_PORTION_TERMS`. ⛔ **Aucun matcher maison** : aucune forme
   devinée, aucun savoir sur les aliments. ⛔ **On compte, on ne réécrit pas** —
   nuller la note ferait tomber avec elle « retirer les croûtes », « sauce
   piquante à part », « pas de fenouil », c'est-à-dire ce que le modèle est le
   seul à savoir. Rendu dans `portion_quantities.model_size_word`.

## LA PREUVE PAR UN NOMBRE

Compteur passé sur les phrases **réellement écrites en base**, avant et après :

| lot | plans | phrases avec un mot de taille | tournures relevées |
|---|---|---|---|
| **AVANT** (D→G, 8 plans) | `3cd53bad` `66294c84` `f07527ef` `9ca91495` `d862cd47` `01cf7c40` `ff8f5c6e` `cfd44e89` | **25 / 32** | `larger share`, `larger portion`, `standard share`, `child-size share`, `child-size portion`, `child-sized share` |
| **APRÈS** (H, 2 plans) | `b0503767` `fcf07003` | **0 / 8** | — |

`portion_quantities` des deux plans H :
`{"notes": 4, "engine": 4, "model_quantity": 0, "model_size_word": 0}`.

### Les phrases après, telles qu'elles sont lues à table (`fcf07003`, 01:04 UTC)

```
Odalric   Serve protein and starch first, then vegetables. Add a spoonful of his
          own jam to his toast at breakfast.
          — Roast chicken thighs 200 g · Large pot of fluffy rice 341 g · …
Peregrine Serve protein and starch first, then vegetables. Ensure no orange or
          red items are on the plate.
          — Roast chicken thighs 98 g · Large pot of fluffy rice 167 g · …
Casimir   Serve all components together. Provide hot sauce for every meal.
          — Roast chicken thighs 198 g · Large pot of fluffy rice 339 g · …
Wilfrid   Serve all components together. Ensure all bread crusts are removed
          before serving toast.
          — Roast chicken thighs 108 g · Large pot of fluffy rice 184 g · …
```

Plus un seul mot de taille ; la manière, l'ordre et les précautions survivent
entières ; et le nombre ne contredit plus rien.

| run | `sized` | `shared_mixed` | base brute du modèle | Casimir / Peregrine servi | le corps dit |
|---|---|---|---|---|---|
| **H1** `b0503767` 01:00 | 16/16 | 0 | 300 / 299 / 300 / 300 | **2,04** | 2,03 |
| **H2** `fcf07003` 01:04 | 15/16 | 0 | 146 / 147 / 147 / 146 | **2,02**–**2,03** | 2,03 |

Fuites revérifiées sur les deux plans H : `kcal`, `calorie`, `BMI`, `23 kg`,
`70 kg`, `47 kg`, `79 kg`, `122 cm`, `178 cm`, `2010`, `2019`, `child` →
**0 occurrence** partout.

## ⑧bis — LES MUTATIONS DE CE GESTE

| # | mutation | rouge |
|---|---|---|
| **M14** | le brief garde les directions AVEC leur mot de taille | **2 tests** |
| **M15** | seule la ligne du MINEUR est traduite — le correctif à moitié posé, c'est-à-dire le défaut exact que le coordinateur a mesuré | **1 test** |
| **M16** | `model_size_word` est aveugle | **1 test** |
| **M17** | le brief ne nomme plus le vocabulaire refusé (résumé au lieu d'énuméré) | **1 test** |

`deno test household_body_share_test.ts` → **29 passés**.
`deno test _shared/keel/ + no_calorie_to_student_property_test.ts` → **3 735 passés, 0 échec**.

## ⑧ter — QUEL MODÈLE A SERVI CHAQUE RUN

Relevé en base (`llm_raw_response_events`, `source='generate-household-meal-v1'`) :

| run | chaîne réelle | modèle qui a produit |
|---|---|---|
| A1 · C1 · C2 · C3 | `gpt-5.4-mini` direct | **`gpt-5.4-mini`** |
| D1 · D2 · D3 | `breaker_skip gpt-5.4-mini` → repli | `gemini-3-flash-preview` |
| E1 · E2 · E3 · F3 · G1 | idem | `gemini-3-flash-preview` |
| **H1** | `breaker_skip gpt-5.4-mini` → `gpt-5.4-nano` → repli | **`gemini-3-flash-preview`** |
| **H2** | `attempt_start gpt-5.4-mini` → repli | **`gemini-3-flash-preview`** |

⚠️ Donc : **la mesure « 0 mot de taille sur 8 » porte sur le modèle de repli.**
Ce qui reste vrai quel que soit le modèle, parce que c'est du code déterministe :
la source du mot est tarie **dans le brief** (`sizeFreeDirectionFor`, 29 tests,
4 mutations) — aucun modèle ne peut recopier une chaîne qu'on ne lui donne plus.
Ce qui n'est mesuré que sur le repli : qu'il n'en **invente** pas d'autre de son
côté. La commande de rejeu sous `gpt-5.4-mini` est au §⑦ter, et
`portion_quantities.model_size_word` est le nombre à y lire.
