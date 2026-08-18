# L1 — Vérification adversariale (agent de vérification, pas d'implémentation)

**Date** : 2026-08-18 · **Branche** : `ff-001-quotidien-du-coach` · **Rien n'est commité.**
**Serveur** : `frontend-a4b` (5196) · **Compte** : `qa0805.eva@keeltest.dev`

> Je n'ai **rien réparé**. Trois fichiers ont été **mutés puis restaurés** (md5 identiques,
> vérifiés ci-dessous). Deux lignes `protocol_events` ont été écrites par l'écran pendant les
> essais et **supprimées ensuite** (la fixture est revenue à `count = 0`, son état d'origine).

---

## Verdict d'ensemble

**Le lot fait ce qu'il dit** sur ses deux chemins, et les preuves rejouées concordent avec
celles de l'implémenteur, y compris au nombre près sur la mutation. **Trois écarts** méritent
une décision, dont **un défaut neuf** que le rapport ne mentionne pas.

| | Point | Verdict |
|---|---|---|
| B1 | check / test / tsc / eslint | ✅ concordant — sauf le **compte** de 60 erreurs tsc, non reproductible (voir §Écarts) |
| B2 | le trigger | ✅ 4 acceptés / 7 refusés / 11 identités bloquées, mesurés par moi |
| B3 | les trois copies du vocabulaire | ✅ 4 mutations, 4 rougissements |
| B4 | le chemin conversation | ✅ prouvé **par exécution** — mais **aucun test ne le tient** |
| N1 | motif choisi = motif en base | ✅ les 3 motifs vérifiés en SQL |
| N2 | même case sur les deux écrans | ✅ dans les deux sens |
| N3 | un plat = un formulaire | ✅ mesuré — mais le scénario invoqué **n'existe plus** |
| N4 | ignorer le formulaire | ✅ `food_not_eaten`, et **rien d'autre ne bouge** (diff de ligne entière) |
| N5 | recocher | ✅ `NULL`, rien d'autre |
| N6 | 320 px | ✅ aucun débordement, aucune troncature, EN **et** FR |
| N7 | i18n | ✅ aucune clé brute, EN et FR |
| N8 | console / réseau / 0 ligne | ⚠️ l'exception **jette bien** — mais le chemin **miroir** garde le défaut |

---

# VOLET 1 — BACKEND

## B1. Les vérifications rejouées

Shell propre : `env | grep -c '^SUPABASE'` → **0**.

### `deno check` — identique

```
$ cd supabase/functions && deno check _shared/keel/meal_tick.ts _shared/keel/evening_strip_io.ts \
                                      _shared/chat/accident_tap.ts _shared/chat/deterministic_buttons.ts
Check supabase/functions/_shared/keel/meal_tick.ts
Check supabase/functions/_shared/keel/evening_strip_io.ts
Check supabase/functions/_shared/chat/accident_tap.ts
Check supabase/functions/_shared/chat/deterministic_buttons.ts
```

### `deno test` — identique **au test près**

```
$ deno test --allow-all supabase/functions/_shared/keel/ supabase/functions/_shared/chat/
ok | 3432 passed | 0 failed | 17 ignored (21s)
```
Le rapport annonce `3432 passed | 0 failed | 17 ignored`. **Exactement le même triplet.**

### `eslint` — identique

```
$ npx eslint src/keel/{components/DishCard.tsx,lib/useMealTicks.ts,api/mealTicks.ts,api/mealTicks.int.test.ts}
(rien) — exit 0
```

### `npx tsc -p frontend/tsconfig.app.json --noEmit` — **le compte ne se reproduit pas**

```
src/keel/components/MouthFormDialog.tsx(687,25): error TS2345:
  Argument of type '"household.mouth.block_join"' is not assignable to parameter of type ...
```
**UNE seule erreur**, pas 58 ni 60. Voir §Écarts pour l'analyse de l'attribution.

### `npx vitest run` (suite frontend complète) — **moins d'échecs qu'annoncé**

```
Test Files  2 failed | 82 passed | 5 skipped (89)
     Tests  3 failed | 1324 passed | 20 skipped (1347)
```

| Fichier | Échec | Cause mesurée |
|---|---|---|
| `src/edge/coverage-guard.int.test.ts` (×2) | listes non déclarées | `household_member_bodies_touch`, `student_daily_recommendations_set_updated_at`, `household-merge-notices-v1`, `keel-daily-recommendation-v1` |
| `src/keel/copy/planRefusals.int.test.ts` (×1) | 7 clés `household.error.*` |

**Aucun des trois n'est de ce lot.** Et la vérification qui compte : dans le diff rendu par
`coverage-guard`, `protocol_events_quick_tap_untick_only` apparaît comme une ligne **inchangée**
(pas un `+`) — la migration de L1 **n'ajoute aucun trigger**, exactement comme annoncé.

`pageSeams.int.test.ts` et `parity.int.test.ts`, que le rapport listait en rouge, sont
**verts** maintenant. Les clés `meals.untick.*` ne les font pas rougir.

---

## B2. Le trigger — rejoué par moi, pas relu

Migration `20260818170000` **appliquée** (registre : `20260818170000` présent ;
CHECK en base : `not_food, unreadable, food_not_eaten, ordered, no_time, ate_other` ;
`allowed` du trigger : `food_not_eaten, ordered, no_time, ate_other`).

### (a) Les quatre motifs passent — `4/4`

```
NOTICE:  A OK  motif accepte: food_not_eaten
NOTICE:  A OK  motif accepte: ordered
NOTICE:  A OK  motif accepte: no_time
NOTICE:  A OK  motif accepte: ate_other
```

### (b) Ce qui n'est pas de la liste est REFUSÉ — `7/7`

J'ai ajouté trois cas que la migration ne teste pas : un mot arbitraire, une **casse
différente**, et un **espace en fin de chaîne**.

```
NOTICE:  B OK  refuse: not_food    -> protocol_events: a quick_tap may only toggle disqualified_re…
NOTICE:  B OK  refuse: unreadable  -> …
NOTICE:  B OK  refuse: not_hungry  -> …
NOTICE:  B OK  refuse: cheat_meal  -> …
NOTICE:  B OK  refuse: banane      -> …
NOTICE:  B OK  refuse: ATE_OTHER   -> …      ← casse
NOTICE:  B OK  refuse: 'ordered '  -> …      ← espace final
```

### (c) L'identité ne se réécrit jamais — `11/11`, dont le cas piégeux

```
C OK user_id bloque · local_date bloque · food_group_ref bloque · evidence_weight bloque
C OK slot_key bloque · source_message_id bloque · source bloque · occurred_at bloque
C OK quantity bloque · substance_ref bloque
C-bis OK combo bloque -> protocol_events: a quick_tap fact is ticked or unticked…
```

**C-bis est le test que la migration ne fait pas** : `set disqualified_reason='ordered',
local_date=current_date-2` dans le **MÊME** `update`. Un motif valide ne sert pas de cheval de
Troie à une réécriture d'identité. Refusé.

### (d) La ligne entière, et le retour à NULL

`to_jsonb` avant/après une décoche : `D OK aucune autre colonne n a bouge`.
`E OK recoche -> NULL`.

### (e) Le chemin RÉEL : `role authenticated`, RLS armée, `auth.uid()` = eva

Le trigger seul ne prouve rien si la policy ne laisse pas passer le geste.

```
set local role authenticated;
set local request.jwt.claims = '{"sub":"…011","role":"authenticated"}';
 current_user  |                 uid
---------------+--------------------------------------
 authenticated | 08050000-0000-4000-8000-000000000011

update … set disqualified_reason='ordered'  → UPDATE 1   ✅
update … set disqualified_reason='not_food' → ERROR: … may only toggle … (got not_food)  ✅
```

### ⚠️ Trou trouvé (PRÉEXISTANT, pas une régression L1)

**Le trigger est `before update` seulement.** Une ligne `source='quick_tap'` peut donc **naître**
avec un verdict de photo, et c'est atteignable par un élève sous RLS :

```
set local role authenticated;  -- uid = eva
insert into public.protocol_events (… source='quick_tap' …, disqualified_reason) values (…, 'unreadable');
INSERT 0 1
 I insere avec | unreadable
```

C'est **antérieur à L1** (`not_food`/`unreadable` étaient déjà dans la CHECK depuis
`20260804160000`) et L1 ne l'élargit pas. Mais l'en-tête de la migration écrit que
« le TRIGGER dit ce qu'une ligne `source='quick_tap'` **a le droit de devenir** » — c'est vrai
de l'`UPDATE` et **faux de l'`INSERT`**. Une phrase à corriger, ou une garde à ajouter.

---

## B3. Les trois copies — mutation, et ce qui est tombé

Sauvegarde md5 avant, restauration et re-vérification après. **Quatre mutations, une par copie**
(la migration en porte deux : la CHECK et la liste du trigger).

| # | Fichier muté | Mutation | Rouge |
|---|---|---|---|
| 1 | `frontend/src/keel/api/mealTicks.ts` | `"ate_other"` → `"ate_late"` (2 occurrences) | **4 tests / 11** |
| 2 | `_shared/keel/meal_tick.ts` | dernier élément de `MEAL_UNTICK_REASONS` | **1 / 11** (vitest) **+ 1 / 5** (`deno test meal_tick_test.ts`) |
| 3 | migration, **CHECK seule** | `'ate_other'` → `'ate_late'` | **1 / 11** |
| 4 | migration, **liste `allowed` du trigger seule** | idem | **1 / 11** |

Mutation 1, les quatre tests tombés :
```
FAIL > le front porte la MÊME liste, dans le MÊME ordre, que `meal_tick.ts`
FAIL > la CHECK de la table accepte exactement ces quatre motifs
FAIL > le TRIGGER accepte exactement ces quatre motifs, et pas les verdicts de photo
FAIL > trois motifs, pas quatre et pas deux
```
**« 4 tests sur 11 » — le chiffre du rapport, au test près.**

Restauration prouvée :
```
9b41689476122e3d4d295beb0ba50984 frontend/src/keel/api/mealTicks.ts
08fc7965c1c910783584992423fac4dd supabase/functions/_shared/keel/meal_tick.ts
28880d2985303058e0c99805827d4be3 supabase/migrations/20260818170000_la_decoche_dit_pourquoi.sql
```
(identiques aux md5 pris avant mutation) · `vitest run mealTicks.int.test.ts` → **11 passed**.

### Ce que la ceinture NE tient PAS — deux limites nommées

1. **Elle lit le FICHIER de migration, jamais la BASE.** Une migration ultérieure qui
   redéfinirait `protocol_events_quick_tap_untick_only` avec une autre liste **ne la ferait pas
   rougir**. Vérifié aujourd'hui : seules `20260804160000`, `20260805090500` et
   `20260818170000` touchent ce trigger ou cette CHECK — donc le risque est théorique **pour
   l'instant**. J'ai vérifié la base séparément (§B2), la ceinture ne le fait pas.
2. **`mealTicks.int.test.ts` n'est typecheké par AUCUN tsconfig** (`tsconfig.app.json` exclut
   `**/*.test.*` ; `--listFiles | grep -c mealTicks.int.test` → **0**). C'est la convention du
   dépôt pour tous les `*.int.test.ts`, pas un défaut propre à L1 — mais une faute de type dans
   la ceinture ne se voit qu'à l'exécution de vitest.

---

## B4. Le chemin conversation — prouvé par EXÉCUTION

### L'affirmation « `accident_tap.ts` jetait sa réponse » est VRAIE

```
$ git show HEAD:supabase/functions/_shared/keel/meal_tick.ts | grep MEAL_UNTICK_REASON
94:export const MEAL_UNTICK_REASON = "food_not_eaten" as const;

$ git show HEAD:supabase/functions/_shared/chat/accident_tap.ts | grep -A6 'applyStripTicks(admin'
212:  const ticks = await applyStripTicks(admin, {
216-    disqualified: MEAL_UNTICK_REASON,
```
Un seul site d'appel, en amont des trois branches. **Les trois boutons écrivaient bien
`food_not_eaten`.**

### Et il ne le fait plus — mesuré, pas lu

Sonde jetable (client Supabase bouchonné qui **enregistre** ce qui part en `insert`), lancée
sur le vrai `handleAccidentTap` :

```
bouton=ordered    handledAs=keel_accident_ordered
bouton=no_time    handledAs=keel_accident_no_time_nothing
bouton=ate_other  handledAs=keel_accident_ate_other

=== CE QUE LA LIGNE quick_tap PORTE ===
  bouton ordered    -> disqualified_reason = "ordered"
  bouton no_time    -> disqualified_reason = "no_time"
  bouton ate_other  -> disqualified_reason = "ate_other"

VERDICT: 3 motifs DISTINCTS
```
(sonde dans le scratchpad de session, hors dépôt).

### ⛔ DÉFAUT — ce chemin n'a AUCUN test, et le rapport le laisse croire

```
$ grep -rn "handleAccidentTap" --include="*.ts" . | grep -v node_modules
supabase/functions/_shared/chat/deterministic_buttons.ts:66,925
supabase/functions/_shared/chat/accident_tap.ts:104
```
**Aucun fichier de test n'appelle `handleAccidentTap`.** Il n'existe pas de
`accident_tap_test.ts`. Le rapport écrit « Les 79 tests de `accident_test.ts` passent » : c'est
exact, et ça ne dit **rien** de la ligne modifiée — ces 79 tests portent sur `accident.ts`,
l'arbre pur.

Conséquence : **la régression que ce lot répare peut être réintroduite sans qu'un seul test
rougisse.** Le rapport écrit que « renommer un côté fait rougir le compilateur » — c'est vrai
d'un *renommage*, et faux d'un *repli* : réécrire `disqualified: "food_not_eaten"` en dur
typecheck parfaitement, puisque c'est un `MealUntickReason` valide. La seule garde est le
type, et le type ne distingue pas les quatre valeurs entre elles.

---

# VOLET 2 — NAVIGATEUR

Fixture : plan `…0000e1`, 4 plats — 3 le mardi 18 (aujourd'hui), 1 le mercredi 19.
Le plat de mercredi **n'a pas de case** (futur non rapportable) : conforme.

## N1. Le motif choisi est bien celui écrit

Trois décoches sur `/app/today`, une tuile différente sur chacune, relecture SQL :

```
                source_message_id                 | slot_key  |  source   | plan_relation | disqualified_reason
--------------------------------------------------+-----------+-----------+---------------+---------------------
 meal_tick:…0000e1:0                              | breakfast | quick_tap | as_planned    | ordered
 meal_tick:…0000e1:1                              | lunch     | quick_tap | as_planned    | no_time
 meal_tick:…0000e1:2                              | dinner    | quick_tap | as_planned    | ate_other
```
Et **aucune ligne `plan_relation='off_plan'`** : le trou documenté (le fait FF-009 n'est pas
écrit depuis l'écran) est bien celui annoncé, ni plus ni moins.

## N2. La même case sur les deux écrans

- Écrit sur `/app/today` (3 décoches) → `/app/plan` rechargé : **3 cases vides**, identique à la base.
- Écrit sur `/app/plan` (recoche du plat 2, puis coche du plat 0) → `/app/today` rechargé :
  `[true, false, false]`, identique à la base (`0 → NULL`, `1 → no_time`, `2 → food_not_eaten`).

Les deux sens tiennent.

## N3. Un plat, un seul formulaire — mais l'argument invoqué est périmé

Mesuré : `(document.body.innerText.match(/That did not happen as planned\./g)||[]).length`
→ **1**, toujours, sur `/app/today` comme sur `/app/plan` (25+ cartes), y compris après avoir
décoché un deuxième plat (le premier formulaire se ferme).

⚠️ **Mais le scénario que `clé@date` existe pour empêcher n'est PAS atteignable dans cette
build.** `frontend/src/keel/lib/mealBuilderModel.ts :: groupByDay` place un plat sur **son**
jour et ne l'étale plus sur `covers_days` — son propre commentaire le dit : « UN PLAT EST PLACÉ
SUR SON JOUR, ET C'EST TOUT. L'expansion sur plusieurs jours venait du lot ». Et les deux sites
`ticks.bind(dish, todayDate)` de `TodayPage.tsx` portent sur des ensembles **disjoints**
(`dishes.today` / `dishes.anyDay`).

Donc : la clé `clé@date` est **correcte et sans coût**, mais aujourd'hui `clé` seule donnerait
le même résultat. La justification du rapport (« quatre cartes d'un coup ») décrit un
comportement qui n'existe plus. À savoir avant de s'en servir comme d'une preuve.

## N4. Ignorer le formulaire — et la preuve que rien d'autre ne bouge

Décoche nue → `food_not_eaten` (vérifié en base **avant** tout clic de tuile).
Puis tuile « Leave it » → formulaire fermé, et **diff de la ligne entière** (`to_jsonb`,
22 colonnes) avant/après :

```
23c23
<     "disqualified_reason": null,
---
>     "disqualified_reason": "food_not_eaten",
```
**Une ligne de diff sur 22 colonnes.** Rien d'autre n'a bougé.

## N5. Recocher

Coche sur `/app/plan` d'un plat portant `ate_other` → `disqualified_reason = null`,
et le snapshot `to_jsonb` complet montre tous les autres champs intacts (`occurred_at`,
`local_date`, `evidence_weight = 0.4`, `student_note`, `plan_relation = as_planned`…).

## N6. 320 px — mesuré, pas regardé

`resize_window 320×900`, formulaire ouvert, mesures DOM :

| | EN | FR |
|---|---|---|
| `documentElement.scrollWidth` vs `clientWidth` | 320 / 320 — **pas de débordement** | 320 / 320 |
| tuile 1 | « I ordered or ate out » — 133 px, `scrollWidth == clientWidth` | « J'ai commandé ou mangé dehors » — 202 px, non tronquée |
| tuile 2 | « No time to cook » — 113 px | « Pas eu le temps » — 110 px |
| tuile 3 | « I ate something else » — 138 px | « J'ai mangé autre chose » — 148 px |
| sortie | « Leave it » — 65 px | « On en reste là » — 97 px |
| dépassement du viewport | aucun (`right ≤ 320`) | aucun |

Les quatre libellés sont **distincts et complets** dans les deux langues — pas de répétition du
défaut « `Eating here` / `Eating out` rendus tous les deux `Eating` ». `flex-wrap` empile bien.

Deux remarques, **hors périmètre L1** :
- les boutons font **24 px de haut** — exactement le minimum WCAG 2.5.8 (24×24). C'est le
  `size="sm"` du dépôt, cohérent avec le reste, mais sans marge ;
- la **barre d'onglets mobile** tronque (« Aujourd'hu », « Conversat », « Progressio ») —
  préexistant, cicatrice `keel-mobile-shell`, rien à voir avec ce lot.

## N7. i18n

Balayage `body.innerText` sur `/\b[a-z_]+\.[a-z_]+\.[a-z_]+\b/` → **aucune clé brute**, en `en`
comme en `fr`.

| | rendu |
|---|---|
| `en` | « That did not happen as planned. » / « I ordered or ate out » / « No time to cook » / « I ate something else » / « Leave it » |
| `fr` | « Ça n'a pas eu lieu comme prévu. » / « J'ai commandé ou mangé dehors » / « Pas eu le temps » / « J'ai mangé autre chose » / « On en reste là » |

Sur l'écart de namespace assumé (`meals.untick.*` au lieu de `untick.*`) : je confirme la
conséquence mesurable — `pageSeams.int.test.ts` et `parity.int.test.ts` sont **verts**, et
`t()` ne jette pas en DEV sur les cinq routes. L'écart n'a **aucun effet observable**. C'est un
arbitrage à trancher, pas un défaut.

⚠️ Point de méthode : `navigator.languages` vaut `["fr","fr-FR"]` sur ce poste, et l'UI
s'ouvrait pourtant en **anglais** — `localStorage['sophia.ui_locale'] = 'en'` avait priorité
(ordre documenté dans `i18n/runtime.ts`). `?lang=fr` bascule correctement. **La langue de
l'écran ne dit rien du compte ni du navigateur** : il faut lire `sophia.ui_locale`.

## N8. Console, réseau, et le 204 muet

### L'exception sur zéro ligne JETTE bien — prouvé

Formulaire ouvert sur le plat 0, **puis suppression de sa ligne en SQL**, puis clic sur
« J'ai commandé ou mangé dehors » :

```
PATCH …/protocol_events?…&source_message_id=eq.meal_tick:…:0&select=id → 200 OK   (corps vide)
```
Résultat à l'écran :
```
redTexts: ["Ça n’a pas été enregistré. Retouche la case."]
formulaire toujours ouvert : true
```
La réponse HTTP est un **succès**, `untickMeal` compte `0` ligne, jette, l'erreur s'affiche, et
le formulaire **ne se ferme pas**. C'est exactement ce que le rapport revendique, et ça marche.

### ⛔ DÉFAUT NEUF — le même trou reste ouvert sur le chemin MIROIR

`frontend/src/keel/api/mealTicks.ts :: tickMeal`, branche `23505` (la **recoche**) :

```ts
const rearmed = await supabase
  .from(TABLE)
  .update({ disqualified_reason: null })
  .eq("user_id", args.userId)
  .eq("source_message_id", key);      // ⛔ ni .select("id"), ni compte de lignes
if (rearmed.error) { throw … }
return;                                // ⛔ « succès » sur 0 ligne touchée
```

Observé **en vrai**, sur chaque recoche, dans l'onglet réseau :
```
POST  …/protocol_events                                        → 409 Conflict
PATCH …/protocol_events?user_id=eq.…&source_message_id=eq.…    → 204 No Content   ← nu
PATCH …/protocol_events?…&select=id                            → 200 OK           ← untickMeal, durci
```
Les deux `PATCH` sont côte à côte dans la même trace : **l'un compte ses lignes, l'autre non.**
Le rapport présente le durcissement comme « le défaut exact que `20260805090500` avait été
écrite pour corriger » — il l'a fermé sur `untickMeal` et **laissé ouvert sur la fonction
jumelle, dans le même fichier, à quarante lignes de distance**.

Gravité : **moyenne-basse**. Le cas est aujourd'hui difficile à atteindre (si l'`insert` rend
409, la ligne existe, donc le `PATCH` touche 1 ligne). Mais c'est précisément le raisonnement
« ça ne peut pas arriver » que la cicatrice `rls-is-not-a-substitute-for-eq-user-id` dit de ne
pas tenir : un jour où la policy `UPDATE` se resserre, la recoche rendra un succès silencieux
et la case reviendra vide au rechargement.

### Console

Aucune erreur d'application. **Six `409 Conflict`**, tous des `POST /protocol_events` :
c'est le `23505` attendu de la recoche, capté et traité. Bruit **préexistant**, pas de ce lot.

---

# LES ÉCARTS ENTRE LE RAPPORT ET LA MESURE

## 1. Les 60 erreurs tsc — attribution CONFIRMÉE, compte NON REPRODUCTIBLE

Le rapport annonce « 58 erreurs, TOUTES dans `MouthFormDialog.tsx` (+2 dans `HouseholdPage.tsx`) ».

Je mesure **une seule erreur** :
```
src/keel/components/MouthFormDialog.tsx(687,25): error TS2345:
  Argument of type '"household.mouth.block_join"' is not assignable …
```

Ce que ça permet de dire, et ce que ça ne permet pas :

- ✅ **L'attribution tient.** L'erreur restante est une clé `household.mouth.*` dans un fichier
  du chantier foyer. La signature (`household.mouth.block_join`) est celle décrite par le
  rapport, et `mouthFormDialog.int.test.ts` (40 tests) est vert — la session parallèle a
  travaillé entre-temps.
- ✅ **Zéro erreur sur les fichiers de L1** : `mealTicks.ts`, `useMealTicks.ts`, `DishCard.tsx`
  sont bien inclus dans `tsconfig.app.json` (`include: ["src"]`) et n'en produisent aucune.
- ❌ **Le compte de 58+2 n'est pas vérifiable a posteriori.** La base bouge sous les pieds, et
  c'est aussi vrai pour moi que pour l'implémenteur. Une affirmation de ce genre n'est
  falsifiable que si elle nomme les fichiers **et** l'instant ; celle-ci nomme les fichiers,
  c'est ce qui a permis de la valider partiellement.

## 2. « `accident_tap.ts` jetait sa réponse » — VRAIE, et sous-documentée

L'affirmation est exacte (§B4, `git show HEAD`). Ce que le rapport ne dit pas : **le correctif
n'est tenu par aucun test**, et la phrase « renommer un côté fait rougir le compilateur » ne
couvre pas le mode de rechute réel (écrire `"food_not_eaten"` en dur, qui typecheck).

## 3. « le formulaire keyé sur `clé@date` » — correct, mais la raison invoquée est périmée

Le plat en lot rendu sur quatre cartes n'existe plus (`groupByDay`, §N3). La clé reste bonne ;
l'argument ne l'est plus.

---

# DÉFAUTS TROUVÉS, PAR GRAVITÉ

| # | Gravité | Défaut | Reproduction |
|---|---|---|---|
| **D1** | **Moyenne** | `tickMeal`, branche `23505` (recoche) : `update` **sans** `.select("id")` ni compte de lignes → succès silencieux sur 0 ligne. Le jumeau exact du défaut que ce lot revendique avoir fermé, dans le même fichier | recocher n'importe quel plat déjà décoché, onglet réseau : `PATCH … → 204 No Content`, sans `select=id`. Code : `frontend/src/keel/api/mealTicks.ts`, dans `tickMeal` |
| **D2** | **Moyenne** | `_shared/chat/accident_tap.ts` n'a **aucun test** — `handleAccidentTap` n'est appelé par aucun fichier de test. La régression réparée peut revenir en vert | `grep -rn "handleAccidentTap" --include="*.ts" .` → 3 occurrences, aucune dans un test |
| **D3** | **Basse** (préexistante) | Le trigger est `before update` : un élève peut **insérer** une ligne `quick_tap` née avec `not_food` / `unreadable`. L'en-tête de la migration affirme le contraire | §B2 (e), bloc `insert` sous `role authenticated` |
| **D4** | **Basse** | La ceinture des trois copies lit le **fichier** de migration, jamais la **base**. Une migration ultérieure redéfinissant le trigger ne la ferait pas rougir | par construction ; aucune migration ne le fait aujourd'hui |
| **D5** | **Informative** | `mealTicks.int.test.ts` n'est typecheké par aucun tsconfig (convention du dépôt pour tous les `*.int.test.ts`) | `npx tsc -p tsconfig.app.json --listFiles \| grep -c mealTicks.int.test` → `0` |

**Aucun défaut bloquant.** Ni D1 ni D2 n'empêchent le lot de fonctionner ; ce sont deux gardes
manquantes, pas deux bugs actifs.

---

# CE QUE J'AI MUTÉ, ET CE QUE J'AI TOUCHÉ

| Fichier | Mutation | Rouge | Restauré |
|---|---|---|---|
| `frontend/src/keel/api/mealTicks.ts` | `"ate_other"` → `"ate_late"` ×2 | 4/11 | ✅ md5 identique |
| `supabase/functions/_shared/keel/meal_tick.ts` | dernier élément de `MEAL_UNTICK_REASONS` | 1/11 + 1/5 deno | ✅ md5 identique |
| `supabase/migrations/20260818170000_…sql` | CHECK seule, puis liste `allowed` seule | 1/11 chacune | ✅ md5 identique |

Écritures de données : 3 lignes `protocol_events` créées par l'écran sur eva, **toutes
supprimées** (`count = 0`, l'état initial). Sondes SQL en `do $$` avec `delete` final ou
`rollback` ; `select count(*) … source_message_id like 'meal_tick:VERIF%'` → **0**.
`localStorage['sophia.ui_locale']` remis à `'en'`.

Aucun commit, aucun `git stash`, aucun fichier créé dans le dépôt hors ce rapport.

---

# NOTE DE HARNAIS (pour la prochaine session navigateur)

À mi-parcours, le Browser pane est passé en `document.visibilityState === "hidden"` et
**toute entrée synthétique a cessé d'arriver** : `computer{left_click}` renvoyait
« timed out after 30s / pane is currently hidden », et la page ne recevait aucun événement
(écouteur `click` en capture sur `document` → 0 hit). `navigate` et `javascript_tool`
continuaient de fonctionner. `tabs_select`, `preview_start` et un redimensionnement n'ont rien
changé.

La fin du volet a donc été pilotée par `element.click()` via `javascript_tool` — **équivalent
fidèle** : la preuve est qu'un `.click()` sur un `<a>` de React Router a bien changé de route,
et que les décoches ainsi déclenchées ont produit les mêmes requêtes PostgREST et les mêmes
lignes en base que les clics réels du début. Je le signale parce que c'est un écart de méthode,
pas parce qu'il change un verdict.

Deuxième piège, celui de la cicatrice `browser-pane-screenshot-only-repaints-at-scroll-0` :
un clic par `ref` **ne tombe pas juste quand `scrollY > 0`** — les coordonnées sont résolues
dans un repère à scroll 0. Le contournement qui marche est d'**agrandir le viewport**
(`resize_window` 1280×2600) pour que la cible soit visible à `scrollY = 0`, plutôt que de
scroller.
