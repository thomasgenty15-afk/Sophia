# L4-B — Vérification du lot « garde TCA ». Ce qui tient, ce qui ne tenait pas.

**2026-08-18 · branche `ff-001-quotidien-du-coach` · aucun push, aucun merge**
Rapport vérifié : [`2026-08-18-1100-L4A-garde-tca.md`](2026-08-18-1100-L4A-garde-tca.md)
Cadre : [`docs/keel/CALORIE_REVERSAL.md`](../docs/keel/CALORIE_REVERSAL.md) §0

> **Levinson 2017 — 73 % des patients TCA déclarent qu'un tracker de calories a
> contribué à leur trouble.** (Le « 83 % » de la revue 2025 est une erreur de
> citation, non propagée ici.)

**Verdict : lot VERT, avec deux défauts trouvés et corrigés, un défaut décrit,
et une mesure du rapport A qui est FAUSSE — celle-là même qui justifiait
l'architecture. Le contrat pour L8 est solide sur C1–C7 ; C8 est amendé et
complété par un C9 neuf (§7).**

Mes commits : `cba41ad5` · `d8697554`. **Les deux sont passés par le gate, pas
en `--no-verify`** (§6).

---

## 1. LE TABLEAU DE BORD

| Épreuve | Rapport A | **Remesuré par moi** |
|---|---|---|
| suite `_shared/keel/` | 3130 / 57 rouges (base instable) | **3251 passed · 0 failed** |
| `agent-gate` nu | ÉCHOUE | **échoue encore — 25 erreurs eslint, 6 fichiers, TOUS étrangers** |
| `agent-gate` staged-only | « ne suffit pas » | **PASS, exit 0** (§6) |
| `tsc -b` | annoncé exit 0 par l'orchestrateur | **exit 2 en incrémental, `--force` exit 0** — piège de L2-B confirmé |
| vitest | 14 rouges | **3 rouges** : `coverage-guard` ×2, `planRefusals` ×1 — les 3 connus, **aucun 4e** |
| mutations rejouées | 12 annoncées rouges | **7 rejouées : 6 rouges, 1 SURVIVANTE** (§3) |
| navigateur | — | **/app/plan + /app/today × 320 px + 1280 px × EN + FR** (§5) |

---

## 2. LES TROIS RÉPONSES, ÉPROUVÉES

### ① La règle structurelle — TIENT SUR QUATRE SORTIES SUR CINQ

La règle : *un kcal peut vivre dans la pile d'appel d'un module pur ; il ne peut
traverser ni réponse HTTP, ni ligne de base, ni prompt, ni log nominatif, ni
écran sans que la porte ait dit oui **avant** qu'il soit calculé.*

| Sortie | Mesure | Verdict |
|---|---|---|
| **réponse HTTP** | `canShowEnergy` est appelé l. 367 de `meal-energy-v1`, `loadCompositionIndex` l. 434 : la porte parle **67 lignes avant** la première lecture d'aliment. Une porte fermée rend `closed()` — aucun nombre, aucun tableau. **Un seul appelant dans tout le dépôt** (mesuré). | ✅ |
| **ligne de base** | `memberDeltasPayload` ne rend que `member_id · food_ref · grams · moment · channel`. Aucun kcal dans `generated_from`. | ✅ |
| **prompt** | `FORBIDDEN_PORTION_TERMS` bannit `kcal` des notes de portion ; `household_voices` retire une ligne qui en porte ; `ENERGY_UNIT_RE` interdit une unité d'énergie dans une quantité d'achat. | ✅ |
| **écran** | Deux surfaces, et deux seulement (`useMealEnergy` n'est monté que par `MealBuilder` et `TodayPage`). Sondé au navigateur, **interrupteur ALLUMÉ**, sur `/app/meals`, `/app/progress`, `/app/health`, `/app/household`, `/app/setup`, `/app/chat` : **zéro kcal**. `PlanDraftDialog` ne passe pas la prop `energy`. Pas de troisième écran. | ✅ |
| **log nominatif** | ⛔ **FUITE.** Voir ci-dessous. | ❌ |

#### ⛔ Le chemin trouvé : un kcal par bouche dans un log nominatif, sans porte

`generate-household-meal-v1/index.ts:1882` :

```ts
console.log(JSON.stringify({
  tag: "keel.household_meal.composition",
  user_id: userId,
  household_id: householdId,
  ...
  residual_gaps: resolution.residualGaps.map((g) => g.gapKcalPerDay),
}));
```

`gapKcalPerDay` est un **kcal/jour par bouche** (`household_composition.ts:372`).
Il part dans un log qui porte `user_id` **et** `household_id`, dans l'ordre des
membres — et **aucune** des cinq portes n'a tourné dans cette fonction (mesuré :
`canShowEnergy` / `energySafetyGates` n'y ont aucun appelant).

C'est la clause **C5 du contrat de L4-A, violée à l'instant où elle est
écrite** — elle nomme « ni dans un log nominatif » — par une ligne antérieure
(`9cd01739`) que le rapport A n'a pas mesurée.

**Portée réelle : opérateur seulement.** Le nombre n'atteint aucun élève, et
`residual_gaps` est l'instrumentation d'A3, donc le supprimer coûte une décision
produit. **Correctif proposé, et il n'est pas à moi** (`generate-household-meal-v1`
appartient à la lane du prompt/de la cible) : agréger avant de journaliser —
`residual_gaps_count` et `residual_gaps_max_band` (`0` / `<200` / `≥200`) — ce
qui garde la décision d'armer le slot de dressage et retire la valeur par
bouche. Ou déplacer la ligne derrière `canEmitMouthEnergy`, ce qui la fermerait
toujours (le log n'a pas de « lecteur »).

⚠️ **La formulation de la règle ① reste juste ; c'est le dépôt qui ne la
respecte pas encore.** Ne pas « réparer » en retirant la phrase du contrat.

### ② L'état est-il vraiment REQUIS ? — OUI, et la ceinture est à deux couches

C'est la cicatrice `safetyBand: null`. J'ai éprouvé le **compilateur**, pas
seulement les tests, avec un fichier sonde à quatre `@ts-expect-error` :

```
canSizeFromTarget({})                                            → erreur TS ✅
canEmitMouthEnergy({ reader })            (mouthIsReader absent) → erreur TS ✅
energySafetyGates({ restrictionFlag, ageVerdict })               → erreur TS ✅
disorderedEatingDeterministicMessage("holding", [])              → erreur TS ✅
```

`deno check` exit 0 avec les quatre directives **consommées** : les quatre
appels incomplets sont bien refusés à la compilation.

**Contre-épreuve — la mutation demandée.** J'ai rendu `safety?:` optionnel :

```
TS2578 [ERROR]: Unused '@ts-expect-error' directive.
```

c'est-à-dire que `canSizeFromTarget({})` **compile** désormais. Le compilateur
cesse de mordre **exactement** quand on rend l'entrée optionnelle — et c'est là
que le test de source prend le relais (rouge, §3 M5). Les deux couches se
doublent, elles ne se remplacent pas. **Réponse ② confirmée.**

### ③ L'extinction — le correctif E1 tient, et il reste un trou de PORTÉE

Vérifié au navigateur (§5) : sur `/app/today`, « Hide calories » /
« Masquer les calories » est présent, unique, et l'extinction se propage à
`/app/plan` — la promesse « it goes quiet everywhere » est vraie de l'effet
**et** désormais de la portée, pour la porte ④.

⚠️ **Mais pas pour la porte ⑤.** `/app/today` **rend** la fourchette de
maintenance (`EnergyTargetNote`, le niveau C) et n'offre que
`energy.toggle(false)`. La bascule de la cible
(`meals.energy.target_switch_off`) vit **toujours uniquement sur `/app/plan`** —
mesuré : sur `/app/today` la seule bascule est « Masquer les calories », alors
que `/app/plan` en porte deux.

C'est le **même défaut de portée que E1, sur la porte suivante**, et sur le
chiffre qui ressemble le plus à un tracker (le seul qui parle du corps).
Atténuation : éteindre ④ éteint tout, donc aucun chiffre n'est *impossible* à
faire taire. **Décrit, non corrigé** — ajouter une seconde bascule sur l'écran
quotidien est la même décision produit que la question §9 n°4 de L4-A, et elle
n'est pas à moi.

---

## 3. LES MUTATIONS REJOUÉES — 7, dont une SURVIVANTE

Banc : `energy_gate_test.ts` + `energy_gate_mouth_test.ts` +
`no_calorie_to_student_property_test.ts` = **46 verts** à l'état sain.
Restauration par `git show HEAD:<chemin>` — **jamais `git stash`**.

| # | Mutation | Attendu (rapport A) | **Mesuré** |
|---|---|---|---|
| M1 | ① le plancher ne mord plus | rouge | **ROUGE** → restauré 46 verts |
| M2 | **ordre des portes inversé** — ④ remontée au-dessus de ①②③ | rouge | **ROUGE** → 46 verts |
| M3 | `other_mouth` écrase le motif du lecteur (ordre inversé) | rouge | **ROUGE (1)** → 46 verts |
| M4 | **la porte ④ « manquante » ajoutée au dimensionnement** | rouge | ⛔ **VERTE — la mutation SURVIT** |
| M4bis | le dimensionnement lit la sortie de `canShowEnergy` | — | **ROUGE** (erreur de compilation : nouveau paramètre requis) |
| M5 | l'entrée du dimensionnement devient `safety?:` | rouge | **ROUGE (1)** → 46 verts |
| M6a | la clé de pack retombe TOUJOURS sur l'anglais | rouge | **ROUGE (3)** → 33 verts |
| M6b | **le pack `fr` devient une COPIE littérale de l'anglais** | rouge | **ROUGE (2)** → 33 verts |

### ⛔ M4 — la garde de C4 ne lisait pas le corps de la fonction

Le test « le dimensionnement ne lit NI ④ NI ⑤, et la source le prouve »
appelait `bodyAfter("export function canSizeFromTarget(args: {")`. Le closer par
défaut est `"\n}"`, et la première accolade en colonne 0 après la signature est
celle qui ferme l'objet d'**arguments** (`\n}): { size... }`). Le fragment
inspecté valait donc, **en entier** — je l'ai imprimé :

```
"export function canSizeFromTarget(args: {\n  \n  safety: EnergySafetyResult;"
```

Trois lignes, et pas une du corps. Les quatre `assert` cherchaient
`studentSwitch` / `targetSwitch` / `energy_display_enabled` /
`energy_target_enabled` dans un endroit où aucun des quatre ne pouvait être.
Un `const studentSwitch = true;` posé **dans le corps**, suivi de la porte ④
qu'il « manquait », passait **vert**.

C'est la forme la plus coûteuse du défaut : *la garde ne bloquait rien et
ressemblait trait pour trait à une garde qui marche.* Et c'est la garde que la
clause **C4** du contrat de L8 invoque.

**Ce que le rapport A affirme, et qui est faux :** « un test de source refuse
`studentSwitch` / `targetSwitch` / `energy_*_enabled` **dans le corps** de cette
fonction ». Il les refusait dans la **signature**. La mutation de L4-A a donc
mordu par accident (ajouter `studentSwitch: boolean` aux arguments met le mot
dans la liste inspectée) — pas par la propriété annoncée.

**Corrigé (`d8697554`)** : `functionSource()` prend la fonction entière (closer
`"\n}\n"`, qui saute `"\n}): "`), et **la garde vérifie sa propre prémisse avant
de mordre** — le fragment doit contenir `args.safety.open` et le retour ouvert.
Sans ça, un extracteur cassé rend `""`, les quatre `assert` passent, et on
réintroduit le défaut par la correction. Les deux mutations mordent désormais :
M4 → ROUGE, extracteur remis à `bodyAfter` → ROUGE, source intacte → 46 verts.

### Le cas qui PASSE, dans les deux langues

* chaîne de sécurité : **5 lignes ouvrent sur 24**, assertées au nombre près ;
* dimensionnement : le foyer ordinaire dimensionne (`{ size:true }`) ;
* émission : sa propre bouche, aux deux niveaux ;
* garde clinique : **7 formes de tour × 2 langues × 4 pays** passent leur propre
  validateur (33 verts). Le repli bilingue est réel, `responseLocale` est requis
  et positionnel, et « le français est une copie de l'anglais » rougit (M6b).

---

## 4. ⛔ LA MESURE DU RAPPORT A QUI EST FAUSSE — et c'est celle qui décidait de tout

> **Rapport A §1 ②, fait n°1 :** « Les cinq états sont clés sur `auth.users`.
> **PAS UN SEUL** n'est clé sur `member_id`. ⇒ Un foyer de quatre bouches n'a
> qu'UNE ceinture, et elle appartient au compte maître. »

C'est cette phrase qui justifie de n'avoir créé **aucun état neuf**, et c'est
elle qu'on retrouve dans `CALORIE_REVERSAL.md` §0 et dans la clause **C8**.
**Elle est fausse pour l'état ②.** Mesuré en base :

```
keel_household_member_age(p_member uuid) -> text     -- 'minor' | 'adult' | 'unknown'
  select public.keel_age_state(public.keel_household_member_birth_date(p_member))
  from public.household_members hm where hm.member_id = p_member;
```

* `household_members` porte une colonne **`birth_date`** — mesuré, elle existe ;
* `keel_household_member_birth_date` résout **`profiles.birth_date` puis
  `household_members.birth_date`** (D18, migration `20260812180000`) ;
* la règle a un jumeau TypeScript nommé (`ageStateFromVerdict`, `household.ts`) ;
* et elle est **déjà lue par le moteur** : `mouthEnvelope` prend `ageYears` par
  bouche et applique `pediatricBandOf` — une maintenance pédiatrique par mouth.

**Donc : la minorité de CHAQUE bouche est connue, par `member_id`, et le moteur
s'en sert déjà. Ce qui ne s'en sert pas, c'est la chaîne de portes.**

Ce qui reste vrai du rapport A, et que j'ai reprouvé colonne par colonne :

| État | Clé | Vérifié |
|---|---|---|
| ① plancher (`student_body_measures`, `weekly_reviews`, `plan_commitments`, `commitment_evaluations`, `protocol_events`) | **`user_id`** sur les cinq tables | ✅ dump des colonnes |
| ② âge | `profiles.birth_date` **ET `household_members.birth_date` par `member_id`** | ⛔ **corrigé** |
| ③ doctrine | `auth.users` (du coach) | ✅ |
| ④ `energy_display_enabled` | `profiles`, `not null default false` | ✅ |
| ⑤ `energy_target_enabled` | `profiles`, `not null default false` | ✅ |

Et : `household_members` ne porte **aucune** colonne `energy_*`, `household_member_bodies`
non plus — les seules colonnes `energy_*` du schéma sont les deux de `profiles` et
les deux de `food_composition_refs`. Sur ce point-là, le rapport A est exact.

**Conséquence sur la décision de n'écrire aucun état neuf : elle reste bonne.**
Aucune colonne neuve n'est nécessaire — mais pas pour la raison écrite. Ce n'est
pas « il n'y a pas de ceinture par bouche » ; c'est « **la ceinture par bouche
existe déjà, et la porte ne la lit pas** ». La différence n'est pas
rhétorique : la première formulation dit à L8 qu'il n'y a rien à faire, la
seconde lui dit exactement quoi brancher.

---

## 5. LE NAVIGATEUR — deux écrans × deux largeurs × deux langues

Port dédié **5190** (`frontend-a20`) — le port initial a été arrêté par une
session parallèle en cours de route. Persona `laneb-owner-17865234810164f22eb@test.dev`
(mdp `1234567`, plan foyer `483da69a`, 9 plats, couvre le 18/08, `member_deltas`
présent donc calculable). Captures à **scroll 0** (corps décalé par
`margin-top` négatif, cicatrice `browser-pane-screenshot-only-repaints-at-scroll-0`).
Ses deux drapeaux ont été **restaurés à `false`** après la session.

| Écran | Largeur | Langue | Bascule | `scrollWidth` | Chiffres |
|---|---|---|---|---|---|
| `/app/plan` | 320 | EN | « Show/Hide calories » + hint | **320** | 204 / 115 / 18 / 71 kcal |
| `/app/today` | 320 | EN | **« Hide calories »**, 1 seule | **320** | idem |
| `/app/today` | 1280 | EN | **« Hide calories »**, 1 seule | **1280** | idem |
| `/app/today` | 1280 | FR | **« Masquer les calories »** | **1280** | idem |
| `/app/today` | 320 | FR | **« Masquer les calories »** (137 px, `right`=153) | **320** | idem |
| `/app/plan` | 320 | FR | « Afficher les calories » + « ça se tait partout » | **320** | — |

**Aucun débordement horizontal à 320 px sur aucune des six mesures.**

**L'extinction, mesurée dans les deux sens et dans les deux langues :** clic sur
`/app/today` ⇒ **0 kcal** sur `/app/today`, **et 0 kcal sur `/app/plan`** au
chargement suivant, avec « Show/Afficher les calories » réoffert là-bas. Le
défaut E1 est bien fermé, et il l'est *de la portée*, pas seulement de l'effet.

⚠️ Pour changer la langue il a fallu poser `sophia.ui_locale` **et** le jeton de
décision `sophia.ui_locale_decided_for` : `?lang=fr` seul est **écrasé** par la
réconciliation d'`AuthProvider` sur `profiles.locale`. Cicatrice
`ui-language-is-not-evidence-about-the-account`, confirmée une fois de plus.

### ⛔ Le défaut trouvé à l'écran, et corrigé : « Autour de 0–0 par jour pour ton poids »

Réponse réelle de `meal-energy-v1`, capturée sur le fil :

```json
"target": { "low": null, "high": null, "basis": "weight_range",
            "gap": "no_weight", "weight_week_start": null }
```

C'est l'abstention **exacte** décidée par le serveur pour une personne sans
pesée. Ce que l'écran rendait, aux deux largeurs et dans les deux langues :

> **« Autour de 0–0 par jour pour ton poids »**
> « À peu près ce qu'un corps de ta taille dépense en une journée. »

Cause, en une identité : **`Number(null) === 0`, et `Number.isFinite(0) === true`.**
Le garde tout-ou-rien de `api/mealEnergy.ts` était écrit
`Number.isFinite(Number(x))` — il validait donc deux `null` et rendait deux
zéros.

Pourquoi c'est ce lot-ci qui le paie :

1. C'était un chiffre de **niveau C** — le seul du produit qui parle du CORPS et
   pas de la nourriture — **fabriqué par l'écran** pour quelqu'un dont la chaîne
   de gardes s'était tue. La garde avait dit non ; le parseur a dit oui à sa
   place. C'est très exactement la classe de défaut que l'étape 0 existe pour
   empêcher.
2. Le motif `no_weight` voyageait et personne ne le lisait : la copie
   « ajoute une pesée » (`meals.energy.target_no_weight`) était **inatteignable**.
   L'abstention emportait sa propre réparation.
3. Le même piège vit sur le total d'un **jour** : `plan_energy.ts` laisse `kcal`
   à `null` quand aucun plat n'est lisible et `DayEnergyLine` teste
   `kcal === null` pour dire « journée illisible » — le parseur rendait `0`,
   donc ce garde-là ne se déclenchait **jamais** et l'écran disait « 0 kcal »,
   le sens exactement inverse. (Latent : non déclenché sur ma fixture.)

**Corrigé (`cba41ad5`)** : `finiteEnergyNumber` ferme les trois chemins
(`target.low/high`, `day.kcal`, `dish.kcal`). Banc neuf
`frontend/src/keel/api/mealEnergy.int.test.ts` — **12 tests, sur la VALEUR
RENDUE** et non sur l'existence du garde (un test sur le garde serait resté vert
tout le temps où il laissait passer deux zéros). Chaque groupe porte son cas qui
passe. **Mutation** : retour à `Number.isFinite(Number(x))` ⇒ **6 rouges sur 12**,
et les 6 verts sont les cas qui passent.

**Revérifié au navigateur après correctif**, sur le même écran :
FR → « Ajoute une pesée et ceci devient une fourchette à ta taille. » ·
EN → « Add a weigh-in and this becomes a range for your size. » ·
`0–0` absent des deux.

---

## 6. LE GATE — il passe, et voici à quelles conditions

`bash scripts/agent-gate.sh` **nu : ÉCHOUE**, sur `check_lint`, **25 erreurs
eslint réparties sur 6 fichiers, tous étrangers et tous en vol** :
`WeekView.tsx` (refs pendant le rendu), `i18n/en.ts` (8 espaces irrégulières),
`JoinHouseholdPage.tsx`, `TemplatesPage.tsx`, `lib/localization.ts`, `Auth.tsx`.
**Aucun des miens.** Les étapes d'avant passent toutes, y compris la suite
(3251/0) et le typecheck.

`AGENT_GATE_STAGED_ONLY=1` **suffit maintenant**, contrairement à ce que dit le
rapport A — parce que la base est verte : `check_tests` lance bien toute la
suite `_shared/keel/`, et elle est à **0 rouge**. Le seul filtre qui comptait
était `check_lint`, qui lit `git diff --cached`.

```
agent-gate: alignement JWT local ok
agent-gate: forbidden pattern scan ok
agent-gate: test count ok (6450 >= 5111)
agent-gate: running keel test suite   → ok | 3251 passed | 0 failed
agent-gate: running frontend typecheck
agent-gate: running deno check on core entrypoints
agent-gate: running eslint on modified frontend files
agent-gate: pass                                            ← exit 0
```

**Mes deux commits sont passés par ce gate**, pas en `--no-verify`.

**Anti-collision, tenu :** index vérifié **vide avant** et **vide après** ;
`git commit -F <msg> -- <chemins>` sur les deux ; aucun `git add -A`, aucun
`git stash` ; restaurations de mutation par `git show HEAD:<chemin>`. Les
fichiers d'autres lanes que j'ai mutés temporairement (`household_portions.ts`,
`energy_gate.ts`, `visible_agent.ts`) sont **tous propres** en fin de session.

**Autre rouge, à consigner et non de moi :** `deno test` sur
`sophia-brain/test_harness/keel_properties/` **ne compile plus** —
`no_food_solicitation_property_test.ts:351` appelle `decideDailyPulse` sans
`hasStrip`, devenu requis par une modification **non commitée** de
`_shared/keel/daily_pulse.ts`. Étranger, en vol, et hors du périmètre du gate
(qui ne lance que `_shared/keel/`).

**Piège de typecheck confirmé** (signalé par L2-B) : `npx tsc -b` incrémental
rend **8 erreurs** qui accusent un `Record<"health"|...>` que `tokens.ts` ne
déclare plus ; `npx tsc -b --force` rend **exit 0**. C'est du `.tsbuildinfo`
périmé, pas du code cassé. **Ne pas conclure sans `--force`.**

---

## 7. LE CONTRAT POUR L8 — est-il solide ?

**Oui pour C1 à C7. C8 est FAUX dans sa justification, et il manquait une
clause.** Voici l'état après vérification.

| | Clause | Verdict |
|---|---|---|
| **C1** | une seule porte vers le dimensionnement | ✅ `canSizeFromTarget` n'a aucun autre argument d'entrée ; un résultat forgé est refusé à l'exécution (11 formes testées, dont `{open:true, reason:"student_off"}`) |
| **C2** | l'état se lit AVANT le calcul | ✅ vérifié sur `meal-energy-v1` (porte l. 367, aliments l. 434) |
| **C3** | inscription **manuelle** dans l'allowlist | ✅ **exécutable, prouvé** : j'ai planté un appelant dans `_shared/keel/household_portions.ts` (le fichier de L8) → `AssertionError: appelant non relu de canSizeFromTarget( — inscris-le dans ALLOWED`. ⚠️ Angle mort : le scan ne descend qu'à **un niveau** sous `_shared/keel/` et sous `supabase/functions/` — `sophia-brain/skills/**` n'est pas couvert. Les deux fichiers de L8 le sont. |
| **C4** | ne lit NI ④ NI ⑤ | ⚠️ **la garde était DÉSARMÉE — corrigée par moi** (§3 M4). Elle mord maintenant sur le corps de la fonction, et sur sa propre prémisse. |
| **C5** | aucun kcal par bouche sur les 5 sorties | ⚠️ **déjà violé par le log nominatif** de `generate-household-meal-v1:1882` (§2). La clause reste juste ; le dépôt ne la respecte pas encore. |
| **C6** | `no_calorie_to_student_property_test.ts` R6 se **retourne**, ne se supprime pas | ✅ **exécutable** : R6 interdit `energy_target`, `maintenanceRange`, `canShowTarget` dans les trois générateurs — dont `generate-household-meal-v1/index.ts`, que L8 doit toucher. Le test rougira, il se nomme, et `CALORIE_REVERSAL.md` §5 dit comment le retourner. |
| **C7** | la cible n'a pas d'objectif | ✅ banc de `energy_target.ts` refuse `fat_loss`, `muscle_gain`, `deficit`, `remaining` ; `maintenanceRange` n'a **qu'un** appelant, et il est après la porte ⑤ |
| **C8** | *« la seule ceinture qui existe est celle du compte maître »* | ⛔ **FAUX pour la porte ②** — voir §4, et **remplacé ci-dessous** |
| **C9** | — | ⚠️ **MANQUANT — ajouté ci-dessous** |

### C8 — RÉÉCRIT

> **C8 — La chaîne ne lit AUJOURD'HUI que la ceinture du compte maître, et ce
> n'est pas parce que c'est la seule qui existe.**
>
> Ce que L8 hérite, mesuré :
>
> * le plancher ① ne mord en B2C que par **deux** de ses quatre déclencheurs
>   (`rapid_weight_loss` et `compensatory_language` ; les deux autres exigent des
>   artefacts B2B) — et il n'est **clé que sur `auth.users`** ;
> * `household_bodies.ts:128` rend `body: null` **sans aucune évaluation** dès
>   que `member.userId` est absent : une bouche sans compte n'est jamais évaluée
>   pour ① ;
> * **MAIS l'âge de chaque bouche EST connu par `member_id`** —
>   `keel_household_member_age(member_id)` (`profiles.birth_date` puis
>   `household_members.birth_date`), jumelé côté TypeScript par
>   `ageStateFromVerdict`, et **déjà lu** par `mouthEnvelope` pour servir une
>   maintenance pédiatrique.
>
> ⇒ **La porte ② est la seule des cinq qui pourrait se fermer par bouche
> aujourd'hui, et elle ne le fait pas.** `canSizeFromTarget` se ferme au niveau
> du foyer sur le verdict du **maître** : une cible qui dimensionne les
> grammages d'un enfant de douze ans traverse la porte ② parce que son parent
> est adulte.
>
> **Ce que L8 doit faire, et pourquoi ça vaut un paramètre de plus :** si la
> cible dimensionne **par bouche**, la porte ② doit être évaluée **par bouche**,
> depuis `keel_household_member_age` — pas depuis `profiles.birth_date` du
> maître. Le paramètre neuf doit être **requis et positionnel** (le compilateur
> recensera les appelants ; c'est la seule forme de garde que ce dépôt accepte),
> et il ne doit **pas** être ajouté avant d'avoir un lecteur — une entrée
> optionnelle serait la cicatrice `safetyBand: null` reposée sur la porte la
> plus sensible du produit.

### C9 — NEUF : tout état qui déclenchera un conseil chiffré entre par la porte

> **C9 — La porte est traversée par ce qui PRODUIT le nombre, pas seulement par
> ce qui l'affiche. L'état de présence « dehors » en est une entrée.**
>
> Origine : mesure de L3-B sur le lot « déjeuner dehors ». La grille de présence
> gagne un troisième état (`à table` / `dehors` / `absent`), et une fois L8 posé,
> `dehors` est l'état qui **déclenchera un conseil chiffré** (« au déjeuner, vise
> autour de 700 »). Deux trous mesurés :
>
> 1. le vocabulaire est fermé côté maître et **ouvert côté personne** — un
>    `.update()` PostgREST direct passe sans contrainte ;
> 2. `keel_household_set_member_away` **n'a aucune vérification d'âge** —
>    reconfirmé par moi sur `prosrc` : elle valide le rôle de l'appelant et les
>    *kinds* de l'entrée, et ne consulte **jamais** `keel_household_member_age`.
>    « dehors » est donc posable sur un **mineur** et sur un **âge inconnu**.
>
> **Ce que ça ouvre, et que C1–C8 ne fermait pas :** C1 garde le
> *dimensionnement*, C5 garde l'*émission par bouche*. Aucune des deux ne dit
> qu'un **état d'entrée** doit être valide avant de produire un nombre. Un
> conseil chiffré déclenché par une case de grille posée sur un mineur atteint
> quelqu'un que la porte ② existe précisément pour protéger, **sans jamais
> passer devant elle**.
>
> **Ce que L8 doit tenir :**
>
> * **C9.a** — avant de produire le moindre conseil chiffré attaché à un
>   `member_id`, L8 évalue `energySafetyGates` **avec le verdict d'âge de CETTE
>   bouche** (C8 réécrit). `dehors` sur un mineur ou sur un âge `unknown` ⇒
>   **pas de chiffre**, et le motif (`minor`) est journalisé tel quel. La part
>   reste dimensionnée sur les enveloppes de maintenance, comme aujourd'hui.
> * **C9.b** — L8 **ne fait pas confiance au vocabulaire** de
>   `household_presence`. Un état hors liste fermée vaut « on ne sait pas », donc
>   **pas de chiffre** — jamais un repli sur `à table`. C'est la même règle que
>   `parseGoalToken`, qui lève plutôt que de deviner.
> * **C9.c** — la règle générale, à écrire une fois : **tout état qui décide
>   qu'un nombre sera produit est une entrée de la porte, au même titre que les
>   cinq états d'origine.** Le rapport A a énuméré les états qui *autorisent* le
>   nombre ; il n'a pas énuméré ceux qui le *déclenchent*. `dehors` est le
>   premier, et il ne sera pas le dernier.
>
> ⛔ **Le correctif du vocabulaire n'est PAS à L8 et n'est pas à moi.**
> `household_presence.ts` et la migration `20260818120000` appartiennent à L3 :
> à eux d'ajouter la contrainte de liste fermée côté base (un `CHECK` ou un
> `keel_presence_kinds_ok`, jumeau de `keel_away_kinds_ok`) et de faire consulter
> `keel_household_member_age` par `keel_household_set_member_away`. Tant que ce
> n'est pas fait, **C9.a est la seule barrière**, et elle doit donc être écrite
> avant la première ligne de L8, pas après.

---

## 8. CE QUI RESTE ROUGE, ET DE QUI

| Rouge | À qui | Note |
|---|---|---|
| eslint : 25 erreurs, 6 fichiers frontend | lanes en vol (i18n, `WeekView`, `Auth`, …) | bloque `agent-gate` **nu** ; contourné proprement par `AGENT_GATE_STAGED_ONLY=1` |
| vitest : `coverage-guard` ×2, `planRefusals` ×1 | connus, étrangers | **aucun 4e rouge** — j'ai cherché |
| `keel_properties` ne compile plus (`hasStrip`) | lane de `daily_pulse.ts`, **non commitée** | hors du périmètre du gate |
| `tsc -b` incrémental : 8 erreurs fantômes | aucune — artefact `.tsbuildinfo` | `--force` ⇒ exit 0 |

---

## 9. CE QUE J'AI CHANGÉ

| Commit | Fichier | Ce que c'est |
|---|---|---|
| `cba41ad5` | `frontend/src/keel/api/mealEnergy.ts` · `mealEnergy.int.test.ts` (neuf, 12 tests) | `finiteEnergyNumber` : l'absence d'un chiffre cesse d'être le chiffre zéro |
| `d8697554` | `supabase/functions/_shared/keel/energy_gate_mouth_test.ts` | la garde de C4 lit enfin le corps de la fonction, et vérifie sa prémisse |

**Rien d'autre.** `energy_gate.ts`, `disordered_eating_guard/*`, `TodayPage.tsx`,
`household_portions.ts` sont **inchangés** — mutés puis restaurés depuis `HEAD`,
vérifiés propres.

---

## 10. LES QUESTIONS QUE JE LAISSE À L'HUMAIN

1. **`residual_gaps` dans le log nominatif** — agréger (`count` + bande), ou
   déplacer derrière une porte ? C'est une décision produit (l'instrumentation
   d'A3 en dépend), et le fichier n'est à personne dans cette vague.
2. **`/app/today` doit-il porter la bascule de la CIBLE ?** L4-A a livré
   l'extinction de ④ là-bas ; ⑤ reste sur `/app/plan` seul. Même famille de
   défaut, porte suivante.
3. **Faut-il fermer ② par bouche dès maintenant**, ou attendre L8 ? Le fermer
   aujourd'hui sans lecteur poserait une garde sans appelant ; l'oublier
   laisserait C9.a non armée le jour où la cible dimensionne.
