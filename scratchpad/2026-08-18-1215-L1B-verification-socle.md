# L1-B — VÉRIFICATION DU LOT SOCLE

**Date** 2026-08-18 12:15 · Branche `ff-001-quotidien-du-coach`
**Rapport vérifié** `scratchpad/2026-08-18-1129-L1A-socle-objectifs-et-activite.md`
**Méthode** : rien n'est repris du rapport. Chaque chiffre ci-dessous est remesuré.

---

## 0. Verdict

**Le lot socle est JUSTE côté moteur et côté base — et il était livré à moitié
côté front.** Le repli des six objectifs vers trois s'est arrêté à la frontière
du navigateur : `frontend/src/keel/api/household.ts` gardait **six** jetons, et
c'est cette liste-là que `/app/household` et `/app/setup` déroulent. Mesuré au
navigateur : **sept `<option>`, dont trois que la base refuse**.

| # | Défaut | Gravité | Sort |
|---|---|---|---|
| **D4** | Le front propose 3 objectifs que la base refuse (`bad_goal`, et une violation de CHECK sur `setup-goal`) | **P0** | **CORRIGÉ** + test qui mord |
| **D5** | `saveOwnGoal` efface `target_waist_cm` et `focus_axis` à chaque enregistrement | **P1** | **CORRIGÉ** |
| **D1** | `absolute_cap` (le plafond de 1 kg) ne peut **structurellement jamais** mordre — et L1-A a nommé la mauvaise paire comme dormante | constat | **consigné**, §4 |
| **D2** | Côté prise, le slider **interdit** ce que la spec dit de seulement **dire** (0,5 kg/sem inatteignable sous ~180 kg) | arbitrage | **à trancher**, §4 |
| **D3** | `paceCeilingFor` rend `maxKgPerWeek: 0` — un curseur sans cran — non documenté pour L5 | contrat | **consigné**, §4 |

Tout le reste de ce que L1-A annonce est **vrai et remesuré**.

---

## 1. ⚠️ LE POINT SIGNALÉ PAR L3-B — c'était ma propre fenêtre de réparation

L3-B a mesuré, pendant que je travaillais : **10 échecs dans
`onboarding.int.test.ts` + 7 erreurs `tsc`**, attribués au passage des six
objectifs à trois. **L'attribution était juste ; la cause ne l'était pas.**

Trois points de mesure, tous dans mes journaux :

| Instant | `Tests` | dont `onboarding.int.test.ts` | `tsc -b` |
|---|---|---|---|
| **avant** ma correction (11 h 5x) | 3 échecs / **1187** passés | **0** | exit 0 |
| **pendant** — `MEMBER_GOALS` réduit, décor pas encore repris | **13** échecs / 1180 passés | **10** | **7 erreurs** |
| **après** (maintenant) | 3 échecs / **1190** passés | **0** | **exit 0** (`--force`) |

Les deux nombres de L3-B — **10** et **7** — sont exactement ceux de la ligne du
milieu. C'est la fenêtre pendant laquelle j'avais rétréci `MemberGoal` à trois
valeurs sans avoir encore repris les branches que le compilateur venait de
dénoncer. **Les deux sont résorbés**, et le poste est revenu à `tsc -b --force`
exit 0 (le piège incrémental signalé par L2-B a été écarté : `--force` rend le
même exit 0).

> **Ce qu'il faut en retenir, et ce n'est pas « fausse alerte » :** le défaut
> était réel, il était bien dans le lot socle, et c'est **le fait de le corriger**
> qui a fait apparaître les 7 erreurs — le compilateur recensant enfin les
> lecteurs des trois jetons disparus. Voir §6.

---

## 2. La migration des données — remesurée en base, sur TOUT le schéma

Je n'ai pas vérifié les tables que L1-A nomme : j'ai balayé **toutes** les
colonnes de `public`.

### Ce qui est stocké aujourd'hui

| Source | Valeurs mesurées |
|---|---|
| `student_goals.goal` | 82 `fat_loss` · **52 `maintenance`** · 41 `muscle_gain` |
| `household_members.goal` | 3 `fat_loss` · **10 `maintenance`** · 5 `muscle_gain` · 45 `null` |
| `coach_doctrines.beliefs[].goal_scope` | 40 `fat_loss` · **6 `maintenance`** · 5 `muscle_gain` · 19 `[]` · 414 absent |
| `coach_doctrines.arbitrations[].goal_scope` | 5 `fat_loss` · **1 `maintenance`** · 1 `muscle_gain` · 10 `[]` · 77 absent |
| `coach_doctrine_compilations` | **0 ligne** — purgé |
| `coach_food_rules.goal_scope` | 4 `fat_loss` |
| `coach_timing_rules.goal_scope` | 0 |
| `student_weight_divergence_episodes.goal_direction` | 1 `down` (autre vocabulaire, intact) |

Les chiffres de L1-A sont **confirmés** (52 · 10 · 6 · 1 · 0).

### La preuve d'absence d'orpheline, et son étendue

Requête générée sur `information_schema`, appliquée à **toutes** les colonnes
`text`/`varchar` de `public` :

```
colonnes texte valant exactement 'recomposition', 'performance' ou 'health'  →  0
```

Puis sur **les 109 colonnes `jsonb`** de `public`, à la recherche d'une clé
d'objectif portant un jeton retiré :

```
"goal"|"goal_scope"|"goalScope"|"objective" : "recomposition|performance|health"
```

### ⚠️ Deux survivances que L1-A ne nomme pas — et les laisser est JUSTE

| Colonne | Lignes | Ce que c'est |
|---|---|---|
| `student_generated_meals.generated_from.goal` | **18** `"health"` | provenance |
| `student_week_plans.generated_from.goal` | **1** `"health"` | provenance |
| `llm_raw_response_events.raw_response` | 14 | journal de modèle brut |

**Aucun lecteur ne les reparse en jeton.** Vérifié sur tous les appelants :
`householdPlanTrace.ts` lit `generated_from.household`, `mealGeneration.ts` lit
`fixed_intakes` et `day_properties`, `household.ts:1478` passe par
`readHouseholdPlanTrace`. Aucun ne touche `.goal`.

Et les réécrire serait le bug : ce plan **a réellement** été composé sous
`health`, par un compilateur qui connaissait six portées. Une provenance
réécrite ment sur l'histoire — c'est le raisonnement que L1-A applique lui-même
au cache de doctrine, et il vaut ici. **Le seul reproche est de ne pas les avoir
nommées** : la prochaine session qui balaie le schéma les retrouvera et croira à
une migration incomplète.

### Les CHECK — lus sur la base, pas sur le fichier

Les dix contraintes qui mentionnent un jeton portent **les trois**, sans
exception. Les deux que L1-A dit avoir sauvées de l'inécrivabilité sont bien
réécrites :

```
student_goals_focus_axis_goal_check   CHECK (focus_axis   IS NULL OR goal = 'maintenance')
student_goals_target_waist_goal_check CHECK (target_waist_cm IS NULL OR goal = 'maintenance')
```

---

## 3. ⚠️ La purge-list garde ses six jetons — vérifié DEUX FOIS

**Par le diff** : `git diff e253fc19~1 e253fc19 -- household_portions.ts` retire
47 lignes, dont **zéro** contenant `ruleId: "portion.goal"`. Les neuf jetons de
la liste sont tous présents dans le fichier actuel (`calories`, `cutting`,
`diet`, `fat_loss`, `health`, `maintenance`, `muscle_gain`, `performance`,
`recomposition`).

**Par la valeur rendue** — `findForbiddenMatches` sur la liste réelle,
`allowNegatedMentions: false` :

```
MORD   "recomp is the plan for her"                  -> recomp
MORD   "body recomposition"                          -> recomposition
MORD   "a performance oriented plate"                -> performance
MORD   "Il fait attention a sa sante"                -> sante
MORD   "health conscious portions"                   -> health
MORD   "a smaller starch share for fat loss"         -> fat_loss
MORD   "extra rice for muscle gain"                  -> muscle_gain
passe  "grilled chicken with rice and broccoli"      -> []
```

**Et c'est la bonne décision.** Une purge-list n'est pas un vocabulaire : c'est
un classifieur **à la lecture**, et il doit continuer de reconnaître ce que le
produit a pu écrire hier — les 19 lignes de provenance du §2 en sont la preuve
matérielle. Les retirer serait le bug (`legacy-references-that-must-survive-removal`).

---

## 4. Le slider — 72 320 corps balayés

`paceCeilingFor` sur poids 25→250 kg × 4 tailles × 4 genres × 5 crans
d'activité × 2 directions × {adulte, mineur}.

```
                    n       max     min   crans à 0   absolute_cap  body_fraction  energy_floor
down  adulte     18 080    0,45      0        77            0           1 138        16 942
down  mineur     18 080    0,90    0,15        0            0               0        18 080
up    adulte     18 080    0,60    0,10        0            0               0        18 080
up    mineur     18 080    0,90    0,15        0            0               0        18 080
```

**Le maximum ne dépasse jamais 1 kg : 0 dépassement sur 72 320.** L'invariant du
design tient.

### D1 — `absolute_cap` ne peut JAMAIS mordre, et ce n'est pas de la dormance

L1-A écrit que « les deux premières bornes sont dormantes pour un adulte
aujourd'hui ». **Les deux moitiés de cette phrase sont fausses.**

- **`body_fraction` n'est pas dormante** : elle gagne **1 138 fois**, sur les
  adultes de 25 à 45 kg en perte. Elle a un cas réel, aujourd'hui.
- **`absolute_cap` n'est pas dormante, elle est INATTEIGNABLE** — par l'algèbre,
  pas par le hasard du balayage :

| Branche | Écart quotidien plafonné par | kg/semaine maximum | 1 kg atteignable ? |
|---|---|---|---|
| perte, adulte | A1 = 500 kcal/j | 500 × 7 / 7 700 = **0,4545** | non |
| perte, mineur | 10 % du besoin | idem forme | non |
| prise (tous) | `MAX_SURPLUS_FRACTION` = **0,10** × entretien | il faudrait un entretien > **11 000 kcal/j** | non |

La branche « prise » ne dépend **pas** de A1 : même si A1 bougeait demain,
`absolute_cap` resterait inatteignable de ce côté-là.

**Ce que ça coûte, concrètement.** `paceCeilingFor` rend `bound`, et L1-A le
livre à L5 comme « **laquelle des trois bornes a mordu** », c'est-à-dire comme
une phrase à montrer. L5 écrira donc une copie — et sa traduction dans les deux
langues — pour un cas qui **ne se produira jamais**. Il faut le lui dire.

`ceilingFromBounds` sur nombres nus se comporte comme documenté : chacune des
trois a un cas gagnant, et à égalité c'est la plus protectrice qui est nommée
(`energy_floor` d'abord, `body_fraction` ensuite) — vérifié sur les trois
égalités, dont l'égalité triple.

`roundPace` arrondit bien vers le bas : `0,4750 → 0,45`, `0,999 → 0,95`.

Le cas du design est tenu : **60 kg, femme, 165 cm → 0,45 kg/sem, borne
`energy_floor`, 495 kcal/j d'écart.** Jamais 600 kcal/jour de cible.

### D2 — côté prise, le slider INTERDIT ce que la spec dit de DIRE

La conception, §Bloc 2, mot pour mot : « Côté prise, au-delà d'environ
**0,5 kg/semaine** le surplus part surtout en gras : le slider le **dit**, il ne
l'interdit pas. »

Mesuré (homme, 185 cm, `trains_hard`) :

```
 50 kg -> 0,25 kg/sem      120 kg -> 0,35 kg/sem
 70 kg -> 0,30 kg/sem      180 kg -> 0,50 kg/sem
 90 kg -> 0,30 kg/sem      250 kg -> 0,60 kg/sem
```

**Un adulte ordinaire ne peut pas atteindre 0,35 kg/semaine en prise**, et
0,5 kg est hors de portée sous ~180 kg. Le slider ne « dit » pas la limite : il
la pose. Ce n'est pas un bug de code — `MAX_SURPLUS_FRACTION` est bien **dérivé**
de `ENERGY_BANDS.muscle_gain.high` (vérifié : `Math.round((1.10 - 1) × 1000)/1000`
= 0,10, et M11 mord si on le fige) — c'est un **écart à la spec écrite**, et il
appartient à l'utilisateur de trancher : soit la spec change, soit la borne de
prise se desserre.

### D3 — un curseur sans cran, non documenté

77 cas rendent `{ maxKgPerWeek: 0 }` (petits corps sédentaires, en perte).
`paceCeilingFor` ne rend **pas** `null` là : il rend un objet dont le maximum est
zéro. Le tableau de passation de L1-A vers L5 ne documente que `null`
(« demander le corps, ne pas afficher de curseur »). **Un `0` non documenté
donnera un slider de 0,05 à 0 — un contrôle mort.** À ajouter au contrat de L5.

---

## 5. Le niveau d'activité — les quatre crans vont jusqu'au bout

**Ils arrivent au calcul** (70 kg, 175 cm, homme, 35 ans) :

```
null         entretien 2421   ← l'hypothèse, inchangée
sedentary    entretien 2340
on_feet      entretien 2663
trains_some  entretien 2905
trains_hard  entretien 3228     → 5 valeurs DISTINCTES
```

**Et jusqu'à l'enveloppe** — `envelopeFor(..., activityLevel)` rend **5 bandes
distinctes** sur un corps réel (`fat_loss` : 2012-2135 → 2965-2965 ;
`muscle_gain` : 2638-2763 → 3638-3812). Le 6ᵉ paramètre n'est pas décoratif.

> ⚠️ Piège de sonde, à consigner : appeler `envelopeFor` avec un corps qui n'est
> pas un vrai `MealBodyContext` rend `DEGRADED_ENVELOPE` **pour les cinq crans**,
> et donne l'illusion d'un paramètre ignoré. Il faut un `latestWeight`.

**`null` ne bouge pas d'un caractère.** Prouvé par diff, pas par raisonnement :

```
diff  estimatedMaintenanceKcal (e253fc19~1)  vs  (aujourd'hui)
> 5a6
>   activityLevel: ActivityLevel | null;
```

**Une seule ligne d'écart : le champ de type.** Le corps est identique, et
`ACTIVITY_FACTOR` vaut toujours 1,5 sur la branche `null`. Il n'est par ailleurs
**égal à aucun des quatre crans** (1,45 / 1,65 / 1,80 / 2,00), donc « ne pas
répondre » reste distinguable de toute réponse.

**Chez un enfant, le cran ne peut que monter** — 0 descente sur les cinq
valeurs :

```
null         facteur 1,6   1876 kcal
sedentary    facteur 1,6   1876 kcal   ← plancher, ne descend PAS à 1,45
on_feet      facteur 1,65  1935 kcal
trains_some  facteur 1,80  2111 kcal
trains_hard  facteur 2,00  2345 kcal
```

**Le câblage en base est réel** : `profiles.activity_level` et
`household_member_bodies.activity_level` existent, `text`, nullables, avec un
CHECK sur les quatre crans des deux côtés ; et `keel_household_bodies_for` rend
bien la colonne (sinon elle serait décorative).

---

## 6. Le renversement du mineur — prouvé de bout en bout

### Les deux portes RPC, appelées POUR DE VRAI

Dans une transaction annulée, sous `role authenticated` avec le `sub` du maître
du foyer, sur un vrai mineur (`Kid`, né en 2016) :

```
PORTE 1  set_member_goal(mineur, 'fat_loss')       -> {"ok": true}
PORTE 1  set_member_goal(mineur, 'muscle_gain')    -> {"ok": true}
PORTE 1  set_member_goal(mineur, 'recomposition')  -> {"ok": false, "reason": "bad_goal"}
PORTE 2  add_member(mineur 2015, 'fat_loss')       -> {"ok": true, "member_id": …}
PORTE 2  add_member(mineur 2015, 'health')         -> {"ok": false, "reason": "bad_goal"}
```

**Les deux portes sont ouvertes, et les deux refusent le vocabulaire retiré.**
Aucune n'est restée fermée.

### Les DEUX chemins de la direction, sondés séparément

16 combinaisons (4 états d'âge × 4 objectifs), `servingDirectionFor` **et**
`servingDemandsFor` lus indépendamment :

```
minor  fat_loss     -> generous vegetables, full protein share, smaller starch share
                       demands {protein:"full", starch:"smaller", vegetables:"larger"}
minor  muscle_gain  -> larger protein and starch share, same vegetables
minor  maintenance  -> <NEUTRAL>
minor  null         -> <CHILD>          ← le repli, et seulement le repli
unknown (tous)      -> <NEUTRAL>        ← « je ne sais pas » ≠ « c'est un enfant »

mineurs écrasés : 0
```

Le doublon est bien refermé : `servingDemandsFor` **délègue** à
`servingDirectionFor` (une décision, jamais deux). Aucune divergence sur les 16.

---

## 7. Les mutations — 8 rejouées, dont les deux moitiés de M9

Je n'ai pas relu le tableau de L1-A : j'ai réappliqué les mutations sur une copie
horodatée, mesuré, et restauré par `cp` (empreinte `shasum` vérifiée après
chaque). **Aucun fichier n'a été laissé muté.**

| # | Mutation | Attendu | Mesuré |
|---|---|---|---|
| M1 | `servingDirectionFor` : rétablir l'écrasement du mineur | mord | **1 échec** — « un mineur en `fat_loss` doit recevoir sa direction depuis le 2026-08-18 » |
| M3 | `childActivityFactor` : retirer le plancher `Math.max` | mord | **1 échec** |
| M4 | `estimatedMaintenanceKcal` : ignorer le cran déclaré | mord | **2 échecs** |
| M6 | `paceCeilingFor` : borner un mineur comme un adulte | mord | **3 échecs** — « 495 kcal/j dépasse 10 % de 2350 » |
| M7 | `ceilingFromBounds` : nommer le plafond absolu à égalité | mord | **1 échec** |
| M13 | `GOAL_TOKENS` : réintroduire `health` | mord | **8 échecs** |
| **M9a** | `targetWeightRefusal` : **retirer** la sortie explicite du mineur | **ne mord pas** | **3251 passés / 0 échec** ✅ conforme |
| **M9b** | `ageBandOf` : rendre une bande adulte à un mineur | mord | **3 échecs** — « ageBandOf(2) doit rendre null — c'est la seconde ceinture » |

### Ce que M9a + M9b établissent, et que M9 seule ne pouvait pas

La ceinture est bien **double**, et les deux moitiés n'ont **pas** le même
statut :

- **Ceinture 2** (`ageBandOf` rend `null` sous 18 ans) : **testée**, et le test
  la nomme. M9b le prouve.
- **Ceinture 1** (`if (subject.isMinor) return null;`) : **non testable
  aujourd'hui**, parce que la ceinture 2 la rend inatteignable. M9a le prouve.

Le test neuf `⚠️ le plancher ADULTE est INATTEIGNABLE pour un mineur — deux
ceintures` **documente exactement cela** et n'affirme que ce qu'il peut prouver
(les cinq assertions portent sur `ageBandOf`). Il ne prétend pas protéger la
première sortie. **C'est la bonne forme** : la seule façon de rendre la ceinture 1
testable serait d'élargir `AgeBand` aux tranches pédiatriques, ce que le dépôt a
déjà envisagé et écarté. Le correctif de L1-A (sortir le mineur **avant** le
calcul, au lieu de calculer puis jeter) tient : le code mort a disparu, et ce qui
reste est une intention explicite, pas une branche qui ne décide rien.

---

## 8. D4 — LE DÉFAUT PRINCIPAL : le front parlait encore six jetons

### Ce qui a été mesuré, au navigateur

`http://localhost:5194`, persona `ff060_house@example.com`, foyer avec un mineur.

`/app/household`, **avant** correction — les `<option>` réellement rendues :

```
""             = No particular direction
fat_loss       = Losing fat
muscle_gain    = Building muscle
recomposition  = Recomposition        ← la base refuse : bad_goal
performance    = Performance          ← la base refuse : bad_goal
health         = Health               ← la base refuse : bad_goal
maintenance    = Staying where they are
```

`/app/setup` en rendait **quatre sélecteurs** de la même forme, dont celui d'une
bouche mineure (correct depuis le renversement) — et surtout `setup-goal`, celui
du titulaire, qui écrit `student_goals` **en direct**. Or
`student_goals_goal_check` n'accepte plus que les trois. Le pire des deux cas
n'est donc pas un bouton mort : c'est **une violation de contrainte PostgreSQL
rendue dans un entonnoir d'accueil** — exactement ce que l'en-tête de
`saveOwnGoal` dit exister pour empêcher.

### Pourquoi rien ne l'a dit

Le seul test qui regardait cette liste :

```ts
expect([...goalsForAge("adult")]).toEqual([...MEMBER_GOALS]);
```

**Il est paramétré par sa propre constante.** Il reste vert quoi que contienne
`MEMBER_GOALS` — cicatrice `test-parameterized-by-its-own-constant`.

Et le test de parité i18n (`servingDirections.int.test.ts`) avait été **détourné
de cette liste** dans le même lot, avec ce commentaire : « `MEMBER_GOALS` […] le
repli des six vers trois l'a rendue dérivée (`export const MEMBER_GOALS =
GOAL_TOKENS;`) ». C'est vrai du `MEMBER_GOALS` de **`_shared`**. Ça ne l'est pas
du `MEMBER_GOALS` **du front**, qui porte le même nom et six littéraux. **Les
deux constantes homonymes ont été confondues, et le seul témoin a été débranché.**

### Le correctif

1. `frontend/src/keel/api/household.ts` — `MEMBER_GOALS` réduit aux trois jetons,
   dans l'ordre `fat_loss` · `maintenance` · `muscle_gain`.
2. `frontend/src/keel/api/household.int.test.ts` — **deux tests neufs** confrontés
   à **deux sources étrangères**, jamais à eux-mêmes :
   - la liste, littéralement, contre les trois jetons attendus (et `goalsForAge`
     des deux côtés, littéralement aussi — pas « la même que l'adulte », qui
     resterait vrai si les deux devenaient fausses ensemble) ;
   - **chaque option contre le CHECK lu sur le disque**, dans la migration qui l'a
     posé, dans les deux sens : rien de proposé que la base refuse, rien
     d'accepté que l'écran ne propose.

**La mutation qui mord** — remettre `recomposition` dans la liste :

```
× MEMBER_GOALS est EXACTEMENT `GOAL_TOKENS`, ordre compris
× aucune option proposée n'est refusée par le CHECK de la base
  → « recomposition » est proposé à l'écran mais refusé par la base
Tests  2 failed | 23 passed
```

### Ce que le compilateur a dénoncé une fois `MemberGoal` rétréci

**Sept erreurs, et c'est le lot socle qui les avait laissées** — chacune est une
branche que rien ne pouvait plus atteindre :

| Fichier | Ce qui était mort |
|---|---|
| `pages/HouseholdPage.tsx` 162-166 | 3 `case` du `switch` de `goalLabel` |
| `pages/SetupPage.tsx` 240 | 3 clés du `Record<MemberGoal, MessageKey>` |
| `api/onboarding.ts` 1799-1800 | **D5**, ci-dessous |

Les trois sont reprises. Les clés i18n des jetons retirés **restent sur le
disque** : la parité en/fr n'est pas rompue par des clés inutilisées, et leur
retrait appartient à L5 avec l'écran.

---

## 9. D5 — deux colonnes effacées en silence à chaque enregistrement

`frontend/src/keel/api/onboarding.ts`, `saveOwnGoal` :

```ts
const keepsWaist = goal === "recomposition";                       // toujours FAUX
const keepsFocus = goal === "health" || goal === "performance";    // toujours FAUX
```

Les trois jetons ayant disparu, les deux booléens sont **définitivement faux** —
donc `target_waist_cm` et `focus_axis` étaient remis à `null` **à chaque**
enregistrement d'objectif. Or la migration a précisément réécrit leurs CHECK sur
`maintenance` pour que les colonnes restent **écrivables** :

```
student_goals_target_waist_goal_check  CHECK (target_waist_cm IS NULL OR goal = 'maintenance')
student_goals_focus_axis_goal_check    CHECK (focus_axis      IS NULL OR goal = 'maintenance')
```

Le front effaçait donc, sans un mot, une donnée que la base venait d'autoriser.
Ça ne plantait pas — c'est ce qui le rend cher : **du code mort qui ressemble à
une garde**, et que seul le rétrécissement du type a fait apparaître.

**Corrigé** : les deux lisent `goal === "maintenance"`, miroir exact des CHECK.

> ⚠️ `onboarding.ts` appartient à **L6** et porte du travail non commité d'une
> autre lane. L'édition est **chirurgicale** (deux lignes + commentaire), hors des
> hunks étrangers (aux lignes 47, 62, 1227, 1345). Elle n'est pas cosmétique :
> laisser ces deux lignes, c'était garder la perte de donnée.

### Et le décor du test qui parlait encore six jetons

`onboarding.int.test.ts` déclarait `goal: "health"` dans l'état dit **COMPLET**.
`canGenerate` valide l'objectif contre `MEMBER_GOALS` : la fixture réclamait donc
`own_goal` sur un état qu'elle affirme complet, et **dix cas en dépendaient**.
C'est la cicatrice que ce fichier nomme lui-même vingt lignes plus bas — « une
fixture qui parle une forme que la base ne porte pas ». Repris en `maintenance`,
le repli de la migration elle-même. Fichier vierge de travail étranger.

---

## 10. Le navigateur — la matrice complète, APRÈS correction

Port dédié **5194** (`frontend-a24`, aucune entrée ajoutée à `launch.json`, qui
est partagé). Captures à scroll 0.

| Écran | Largeur | Langue | `scrollWidth` | Débordement | Jeton brut | Libellé vide | Options d'objectif |
|---|---|---|---|---|---|---|---|
| `/app/household` | 1280 | en | 1280 | non | 0 | 0 | 3 |
| `/app/household` | 1280 | **fr** | 1280 | non | 0 | 0 | 3 |
| `/app/household` | **320** | fr | 320 | non | 0 | 0 | 3 |
| `/app/setup` | 1280 | en | 1280 | non | 0 | 0 | 3 × 4 sélecteurs |
| `/app/setup` | **320** | fr | 320 | non | 0 | 0 | 3 × 4 sélecteurs |
| `/app/plan` | 1280 | en | 1280 | non | 0 | 0 | — |
| `/app/plan` | **320** | fr | 320 | non | 0 | 0 | — |

Rendu français vérifié sur la valeur : `Perte de masse grasse` · `Maintien` ·
`Prise de muscle` · `Aucune direction particulière`. Anglais :
`Losing fat` · `Staying where they are` · `Building muscle`.

`/app/plan` affiche l'objectif replié sans accroc : **« Goal — Hold what I
have »** pour un compte qui portait `health` avant la migration. Aucune clé i18n
non résolue, aucun jeton brut, aucun cran d'activité affiché (aucun écran ne le
collecte encore — c'est L5).

### ⚠️ Défaut ÉTRANGER trouvé en chemin, non corrigé

Le questionnaire de fin de plan rend ses **questions et ses boutons en anglais
au milieu d'un écran français** : « DID YOU GET TO COOK THIS PLAN? », « ENOUGH
VARIETY IN IT FOR YOU? », « Too much / About right » à côté de « Ce plan est
fini » et « Les plats qu'il portait ».

Cause : `components/plan/PlanFeedbackDialog.tsx:156` et `:179` écrivent
`QUESTION_LABELS[q].en` et `OPTION_LABELS[opt]?.en` **en dur**. Le français
existe pourtant, écrit et jamais lu, dans `_shared/keel/plan_feedback.ts`
(`enough_variety.fr = "Assez de variété à ton goût ?"`), et `fr.ts` porte même le
commentaire « les libellés des QUESTIONS […] vivent dans `plan_feedback.ts`,
**dans les deux langues** ».

**Pré-existant** (commit `052975ec`), **hors du lot socle** : L1-A n'a pas touché
ce fichier. Mais le repli l'aggrave — `maintenance` reçoit désormais
`enough_variety`, et `maintenance` a absorbé `health`, de loin la plus peuplée
des trois positions retirées. Une tâche est ouverte.

---

## 11. L'état des suites

| Suite | Avant mon passage | Maintenant |
|---|---|---|
| Deno `_shared/keel` | 3249 / 0 | **3251 passés / 0 échec** |
| vitest | 3 échecs / 1187 passés | **3 échecs / 1190 passés** |
| `tsc -b --force` | exit 0 | **exit 0** |
| `tsc -p tsconfig.app.json` | exit 0 | **exit 0** |

**Les trois rouges sont exactement ceux du mandat, et ils sont étrangers :**

| Rouge | À qui |
|---|---|
| `src/edge/coverage-guard.int.test.ts` (2 cas) | autre lane — décompte de fonctions edge / triggers |
| `src/keel/copy/planRefusals.int.test.ts` (1 cas) | autre lane — `planRefusals.ts` modifié dans l'arbre |

**Aucun quatrième rouge.** Les 10 échecs `onboarding` signalés par L3-B étaient
ma fenêtre de réparation (§1) et sont résorbés.

---

## 12. Ce qui reste à trancher, et par qui

| # | Question | À qui |
|---|---|---|
| **D1** | `bound` ne rendra jamais `absolute_cap`. L5 doit-il quand même écrire la phrase ? | **L5** — le dire dans la passation |
| **D2** | Le slider de **prise** interdit 0,5 kg/sem à un corps ordinaire, là où la spec dit de seulement le **dire** | **utilisateur** — la spec ou la borne |
| **D3** | `paceCeilingFor` peut rendre `maxKgPerWeek: 0`. Que montre L5 ? | **L5** — contrat à compléter |
| — | Un accord explicite du maître pour poser « perdre du poids » sur un enfant | **utilisateur** — laissée ouverte par L1-A, à raison |
| — | Écart disque/registre : 7 migrations plus anciennes absentes du registre | **humain** — préexiste, fera trébucher le prochain `migration up` |

---

## 13. Procédure

- Mutations appliquées par script sur copie horodatée, **restaurées par `cp`**,
  empreinte `shasum` comparée après chacune. Les cinq fichiers touchés
  (`household_portions`, `meal_envelope`, `weight_pace`, `tokens`, `student_age`)
  sont bit à bit identiques à leur état d'avant.
- **Jamais `git add -A`, jamais `git stash`.** Commit par `git commit -F <msg> -- <chemins>`.
- Aucune commande à risque. Les migrations étaient déjà appliquées ; je n'ai rien
  appliqué. Les appels RPC de test sont dans une transaction **annulée**.
- `launch.json` **non modifié** : réutilisation d'une entrée libre existante.
- Sondes de session (`scratchpad/l1b_*.ts`) : fichiers de travail, non commités.
