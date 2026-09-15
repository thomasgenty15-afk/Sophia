# L0 — VÉRIFICATION ADVERSARIALE

**Date** : 2026-08-18 · **Branche** : `ff-001-quotidien-du-coach` · **Rien n'est commité, rien n'est réparé.**
Agent de vérification. Compte utilisé : `qa0805.kai@keeltest.dev` (fixture du dépôt,
`docs/keel/qa-fixtures/00-base.sql:16`). **Aucun compte créé.** Serveur `frontend-a3b` (5195).

---

## VERDICT D'ENSEMBLE

Le lot fait ce qu'il dit. **11 des 11 points sont verts en mesure réelle.** L'écriture existe,
elle est bilatérale, elle ne bloque rien, elle n'efface rien, et elle survit au second appelant.

**Un défaut sérieux, et il est dans les TESTS, pas dans le code** : *la suite reste
intégralement verte quand on supprime l'écriture qui est la raison d'être du lot* (§Mutation 3, D1).

Et **une fuite de données personnelles à un appelant non authentifié** (taille, poids, sexe, âge,
et désormais activité, de tout un foyer) — **elle n'est pas de ce lot**, elle vient de la migration
du matin, mais ce lot **ajoute un attribut de plus à ce qui fuit**. Correctif d'une ligne, à faire
par quelqu'un d'autre : §D0.

---

## VOLET 1 — BACKEND

### B1. Les vérifications de l'implémenteur, rejouées

| Contrôle | Sa sortie | **Ma sortie** | Écart |
|---|---|---|---|
| `npx tsc -p frontend/tsconfig.app.json --noEmit` | `TSC_EXIT=0` | **`TSC_EXIT=0`, 0 ligne** | aucun |
| `deno check {energy_target,meal_envelope,tokens}.ts` | EXIT=0 | **EXIT=0** | aucun |
| `deno test energy_target_test + meal_envelope_test` | 41 passed / 0 failed | **41 passed / 0 failed** | aucun |
| `vitest run onboarding.int.test.ts` | 76 passed | **76 passed** | aucun |
| parité i18n `setup.activity.*` | en 14 / fr 14, 0 écart | **en 14 / fr 14** (`grep -c` des deux fichiers) | aucun |
| suite frontend complète | **6** rouges / 4 fichiers | **3** rouges / 2 fichiers (**puis 2**, voir D2) | ⬇ voir E1 |

**E1 — écart réel, et il est en sa faveur.** Trois des six rouges qu'il attribuait à d'autres
sessions ont disparu pendant l'après-midi (`parity ×2`, `mouthForm › below_energy_floor`) :
l'autre session a posé ses clés. Les **3 restants** ne nomment toujours aucun symbole de L0, et
j'ai vérifié l'attribution moi-même plutôt que de la croire :

- `coverage-guard ×2` — les extras mesurés sont `household-merge-notices-v1`,
  `keel-daily-recommendation-v1` (dossiers non suivis) et le trigger
  `household_member_bodies_touch`, défini dans `20260812220000_household_member_body_and_reference.sql`,
  **`??` untracked**. Contre-preuve directe : `grep -ci "create trigger"` sur la migration de L0 → **0**.
- `planRefusals › ne perd aucun motif` — `frontend/src/keel/copy/planRefusals.ts` est **modifié sur
  le disque par une autre session** (`git status` → ` M` ; 14 clés `household.error` à HEAD, **23**
  sur le disque). Rouge indépendant de L0. *Mais voir D2 : ce test ne peut pas attraper le trou
  que L0 vient d'ouvrir, parce qu'il regarde dans l'autre sens.*

### B2. La non-régression `activityLevel: null` — **VÉRIFIÉE, pas lue**

Je ne me suis pas contenté de l'assertion. J'ai muté la source (§Mutation 2) : le test **rougit**
sur `expected 1.6 to be 1.5`. Les trois nombres du contrat sont donc réellement lus depuis le
moteur :

- `ACTIVITY_FACTOR === 1.5`, et `Object.values(ACTIVITY_FACTORS)` ne le contient pas ;
- `estimatedMaintenanceKcal({…, activityLevel: null}) === Math.round(bmr * 1.5)` ;
- `maintenanceRange({weightKg: 70, activityLevel: null}).range === {low: 1950, high: 2300}`
  (= 28–33 kcal/kg).

Confirmé en plus côté Deno : `sans réponse, RIEN ne bouge: le facteur d'hypothèse est toujours
1,5` et `sans réponse, la fourchette est EXACTEMENT 28-33, comme avant` sont verts, et ces deux
fichiers de test sont **identiques à HEAD** (donc antérieurs au lot — ils gardent le moteur, pas
l'écriture).

Et la mesure vivante, celle qui compte : **toute la base est restée `null`** partout où personne
n'a coché, y compris après un « Enregistrer » complet (§N4).

### B3. MUTATIONS — ce que j'ai cassé, et ce qui a rougi

| # | Mutation | Fichier | Résultat |
|---|---|---|---|
| **1** | `.toEqual({low: 1950, high: 2300})` → `2301` | `onboarding.int.test.ts` | 🔴 **ROUGE** — `1 failed | 75 passed`, `expected {1950,2300} to deeply equal {1950,2301}` |
| **2** | `export const ACTIVITY_FACTOR = 1.5` → **`1.6`** | `_shared/keel/meal_envelope.ts` (**source**) | 🔴 **ROUGE** — `AssertionError: expected 1.6 to be 1.5` |
| **3** | **suppression de `patch.activity_level = args.activityLevel`** dans `saveOwnProfile` | `api/onboarding.ts` (**source**) | 🟢 **VERT — 76/76, et `tsc` à 0.** ⛔ **C'EST LE DÉFAUT.** |
| **4** | ajout de `own_activity_level` à `canGenerateMisses` | `api/onboarding.ts` (**source**) | 🔴 **ROUGE — 5 tests** (`expected ['own_activity_level'] to deeply equal []`) |
| **5** | suppression de `"setup.activity.trains_hard"` de `fr.ts` | `i18n/fr.ts` | 🔴 **ROUGE**, la clé nommée en clair dans le diff |

**Tous les fichiers ont été restaurés octet pour octet** depuis des copies prises avant mutation
(`diff -q` vide sur les 4 ; `git diff --stat meal_envelope.ts` vide ; `grep -rn MUTANT` → aucune
trace). Aucun `git stash`, aucun commit.

### B4. Le CHECK des deux colonnes refuse un jeton inconnu — **OUI**

`docker exec … psql`, dans une transaction `rollback` :

```
--- profiles: 'lightly_active' (vocabulaire d'activity_floor.ts) ---
ERROR:  new row for relation "profiles" violates check constraint "profiles_activity_level_check"
--- profiles: 'trains_hard' --> UPDATE 1
--- household_member_bodies: 'very_active' ---
ERROR:  ... violates check constraint "household_member_bodies_activity_level_check"
--- household_member_bodies: 'on_feet' --> UPDATE 1
```

Les deux CHECK portent exactement `sedentary / on_feet / trains_some / trains_hard`, `NULL` toléré.
**Et les deux jetons refusés sont précisément ceux d'`activity_floor.ts`** — la divergence de
vocabulaire du §5 de son rapport a donc bien un mur en base, et je l'ai franchi dans les deux sens.

Bonus non demandé, mesuré **via PostgREST avec la session réelle de Kai** : la RPC rend le refus
NOMMÉ, pas une violation de contrainte brute —

```
p_activity_level: "lightly_active" → {"ok": false, "reason": "bad_activity_level"}
p_activity_level: "very_active"    → {"ok": false, "reason": "bad_activity_level"}
p_activity_level: "nonsense"       → {"ok": false, "reason": "bad_activity_level"}
```

État de la base (déjà appliquée, non rejouée) : signature **unique** à 5 arguments,
`keel_household_member_bodies()` rend bien `activity_level`, et
`has_function_privilege('anon', …)` = **`f`** sur les deux fonctions de L0. Conforme.

---

## VOLET 2 — NAVIGATEUR

> ⚠️ Méthode. Le screenshot du volet ne repeint qu'à `scrollY = 0` (cicatrice connue) : j'ai
> décalé `document.body.marginTop` pour amener la cible en haut, et **jugé sur des mesures**
> (`getBoundingClientRect`, `aria-pressed`, `scrollWidth`), le screenshot ne servant qu'à illustrer.
> Les clics par `ref` ne portent pas de façon fiable hors du premier écran : j'ai cliqué en
> coordonnées d'image après recalage. **Aucun « ça ne marche pas » de mon outillage n'est reporté
> ici comme un défaut du produit** — j'ai instrumenté un `addEventListener` pour prouver, dans le
> seul cas douteux, que le clic n'atteignait pas le bouton.

### N1 — `/app/setup`, étape `people` : 4 tuiles, aucun nombre, pas de 5ᵉ ✅

`STEP 2 OF 4`. Les tuiles sont rendues **entre « Poids (kg) » et « Sexe »** — à côté de
taille/genre, comme demandé. Trois grilles montées :

```
setup-self-activity-{sedentary,on_feet,trains_some,trains_hard}          (moi)
setup-mouth-activity-{…}                                                 (fiche d'ajout)
setup-row-<memberId>-activity-{…}                                        (bouche en base)
```

- **exactement 4 boutons par grille**, aucun 5ᵉ jeton, aucune tuile « je ne sais pas » ;
- **aucun champ numérique d'activité** : l'inventaire complet des `input/select` de l'étape ne
  contient que `first-name, birth-date, height, weight, gender, goal, allergy-other` (+ leurs
  jumeaux `mouth`). Rien pour un PAL ni pour des heures de sport ;
- `aria-pressed` porte l'état, pas seulement la couleur.

### N2 — Choisir un cran écrit le bon jeton **EN BASE** ✅

Clic sur « Du sport intensif » → `aria-pressed=true` → « Enregistrer ». Puis, en SQL :

```
profiles                | 175 | male   | trains_hard
household_member_bodies | Kai | 175.0 | 70.0 | male | trains_hard
```

**La double écriture du rapport est réelle**, et je l'ai vue aux deux endroits d'un seul geste.
Réponses réseau (pas un 204 muet) :

```
POST /rest/v1/rpc/keel_household_set_member_body → 200  {"ok": true, "member_id": "c63bba9e-…"}
PATCH /rest/v1/profiles?…&select=id             → 200  [{"id":"08050000-…-000000000031"}]
```

### N3 — Le chemin foyer, et le tout-ou-rien ✅ (trois épreuves, toutes passées)

1. **Ajout d'une bouche neuve** (Mira, 164 / 58 / female / *Debout, en mouvement*) →
   `164.0 | 58.0 | female | on_feet`. Les quatre colonnes écrites du même geste.
2. **Écrire l'activité n'efface pas le corps.** Sur la ligne d'une bouche déjà décrite, la tuile
   écrit immédiatement (pas de bouton) : clic sur *Du sport régulier* →
   `164.0 | 58.0 | female | **trains_some**`. **Taille, poids et sexe intacts.**
3. **Une bouche décrite AVANT ce lot a un endroit où répondre.** J'ai fabriqué l'état
   (`update … set activity_level = null`), rechargé : les 4 tuiles sont là, **toutes à
   `aria-pressed=false`**, et le clic écrit `sedentary` en conservant `164.0 | 58.0 | female`.

**Et la ceinture de l'autre côté, celle qui protège le 2ᵉ appelant** — je l'ai testée aux deux
niveaux, ce que le rapport ne pouvait pas faire :

- **écran** : `/app/household` → carte de Mira → poids 58 → 59 → « Save ». Résultat :
  `164.0 | **59.0** | female | trains_hard`. Le cran **survit** à un enregistrement de corps fait
  depuis un écran qui ne pose pas la question. C'est exactement la cicatrice « `current` périmé
  efface l'écriture d'avant », et elle ne mord pas.
- **base** : appel direct de la RPC avec `p_activity_level: null`, **avec la session réelle de
  Kai** (aucun JWT forgé) → `{"ok": true}`, et en base `164.0 | **60.0** | female | trains_hard`.
  Le `coalesce(excluded…, b…)` fait ce que son commentaire annonce.

### N4 — Ne pas répondre reste possible ✅ **(l'arbitrage central, mesuré)**

- Fiche « moi » entièrement remplie **sans toucher une seule tuile** → « Enregistrer » accepté,
  et en base : `profiles.activity_level` = `NULL`, `household_member_bodies.activity_level` =
  `NULL`. Aucune erreur, aucun blocage.
- **12 tuiles vierges** à l'écran, et la liste « BEFORE MOVING ON » ne dit que ceci :
  > *A date of birth for everyone at the table. / A direction for each adult at the table.*
  
  **L'activité n'y figure pas.** Une fois ces deux-là répondues — tuiles toujours vierges —
  l'entonnoir est passé à **`STEP 3 OF 4`**.
- Et la garde qui empêche qu'on « répare » ça un jour est **armée** : la rendre bloquante fait
  rougir **5 tests** (§Mutation 4).

> Réserve honnête : je n'ai pas atteint le bouton final de l'étape 4 (l'étape 3 réclame régime et
> moments pour deux personnes, et mes clics automatisés y ont dérapé sur le décalage de
> coordonnées décrit plus haut). Ce qui est prouvé : l'entonnoir **avance** sans réponse, et
> `canGenerateMisses` **n'émet pas** ces deux motifs — vérifié par mutation, pas par lecture.

### N5 — 320 px ✅

`resize_window(320)`, mesures et non coup d'œil :

```
innerWidth = 320   document.documentElement.scrollWidth = 320   → AUCUN débordement horizontal
```

Les **12** tuiles (3 grilles) passent en une colonne, largeur 254 px (moi) / 220 px (bouches),
`right` max = 287 px < 320. Pour chacune, libellé **et** aide :
`scrollWidth <= clientWidth` et `scrollHeight <= clientHeight` → **aucune troncature**.
Les 4 libellés restent distincts dans les deux langues — c'est le contrôle que ce dépôt a déjà
raté deux fois :

| | FR | EN |
|---|---|---|
| `sedentary` | Surtout assis | Mostly sitting |
| `on_feet` | Debout, en mouvement | Up and about |
| `trains_some` | Du sport régulier | Training some |
| `trains_hard` | Du sport intensif | Training hard |

### N6 — Les deux langues ✅

Je n'ai rien conclu du compte : j'ai forcé la langue par `?lang=en` (priorité 1 de
`initUiLocale`) et lu l'écran dans les deux.

- **14 clés** `setup.activity.*` dans `en.ts` **et** dans `fr.ts` (`grep -c`), même liste.
- Les **12 tuiles rendent leur texte dans les deux langues**, libellé + aide, plus les 3 en-têtes
  (`How active are your days?` / `How active are their days?` ×2).
- `document.body.innerText.match(/setup\.activity\.[a-z_]+/g)` → **`[]`**. Aucune clé brute.
- La garde est armée : retirer une clé de `fr.ts` fait rougir `parity.int.test.ts` en la nommant
  (§Mutation 5). *Rappel : `fr.ts` est `??` untracked — ce travail vit sur le disque, jamais en commit.*

### N7 — Console et réseau ✅

`read_console_messages({onlyErrors: true})` → **« No console logs. »** sur toute la session
(entonnoir complet, foyer, 320 px, deux langues).
Réseau : **aucun 4xx/5xx**. Les deux écritures rendent un corps réel, pas un 204 sur zéro ligne
(payloads cités en N2).

---

## DÉFAUTS

### 🔴 D1 — **La suite ne tient pas l'écrivain.** *(le plus important)*

**Reproduction exacte :**

```bash
# retirer la seule ligne qui écrit la colonne du titulaire
#   frontend/src/keel/api/onboarding.ts, dans saveOwnProfile :
#   -  if (args.activityLevel !== null) patch.activity_level = args.activityLevel;
cd frontend
npx tsc -p tsconfig.app.json --noEmit          # → TSC_EXIT=0
npx vitest run src/keel/api/onboarding.int.test.ts   # → Tests  76 passed (76)
```

**Rien ne rougit.** Le lot dont la raison d'être est « fermer un lecteur sans écrivain » a un
écrivain que **rien ne garde**. Ses 6 tests neufs prouvent trois choses réelles — la table de
facteurs du moteur, le catalogue de l'entonnoir, et le refus de bloquer — mais **aucun ne touche
`saveOwnProfile`, `saveMouthBody` ni `setMemberBody`**. `onboarding.int.test.ts` est un test pur
(76 tests en 16 ms, aucun accès base).

Le paramètre requis d'`setMemberBody` recense les **appelants** ; il ne dit rien de ce que le
**corps** de la fonction fait du paramètre. C'est le même motif d'un cran plus haut : le lot
ressemble à un lot qui marche.

*Ce que ça n'invalide pas* : l'écriture **fonctionne aujourd'hui**, je l'ai mesurée en base six
fois. Ce qui manque est la garde qui la fera survivre au prochain refactor.

*Piste, non appliquée* : un test qui `vi.mock` le client Supabase et assert la forme du patch
`profiles` et des 5 arguments de la RPC — ou un test d'intégration réel, comme `weeklyCheckIn.int.test.ts`.

### 🟢 D2 — `bad_activity_level` était un refus nommé **sans phrase** — ⚠️ **FERMÉ PENDANT MA VÉRIFICATION, par une autre session**

> **Mise à jour, 13:39.** Entre mon constat (13:33) et la rédaction de ce rapport, la session
> **L5-B** a posé les trois pièces manquantes : `household.error.bad_activity_level` dans
> `en.ts:3885` **et** `fr.ts:1738`, plus le mapping `planRefusals.ts:284`. J'ai rejoué :
> `planRefusals.int.test.ts` **21/21 vert**, `parity.int.test.ts` **6/6 vert** — les deux étaient
> rouges une demi-heure plus tôt.
>
> **Le constat est donc résolu, mais il compte quand même** : L0 a introduit un motif de refus
> atteignable sans ses mots, et **aucun test de ce dépôt ne l'aurait dit** (raison ci-dessous).
> Il a été réparé par hasard, parce qu'une session voisine travaillait dans le même fichier.
> Le trou de garde, lui, est toujours là.

**Le constat d'origine, tel que mesuré à 13:33 :**

La RPC rend `{"ok": false, "reason": "bad_activity_level"}` (mesuré, §B4). Ses cinq frères ont
tous leur littéral (`"household.error.bad_gender": "That is not one of the options."`,
`en.ts:3881` + `fr.ts:1736`). Celui-ci :

```bash
grep -rn "bad_activity_level" frontend/src
# → 2 hits, tous deux dans un COMMENTAIRE de JSDoc. Zéro clé i18n.
```

Or `saveMouthBody` fait `throw new Error(String(result.reason))` : si le motif était atteint, la
personne lirait le **jeton nu** `bad_activity_level` dans son entonnoir d'accueil.

**Pourquoi aucun test ne l'attrape** : `planRefusals.int.test.ts:446` vérifie *« aucune clé écrite
qui ne soit atteignable »*. C'est la **direction inverse** de ce trou (*un motif atteignable sans
clé*). Le test est d'ailleurs rouge pour une autre raison, ce qui masque encore mieux.

**Gravité réelle : basse.** Injoignable depuis l'écran — `ActivityTiles` ne peut émettre que les 4
jetons de `ACTIVITY_LEVELS`, typés. Mais c'est exactement la règle que ce dépôt s'est écrite, et
elle est violée en connaissance de cause zéro (le rapport liste `bad_activity_level` parmi les
« refus nommés » sans remarquer qu'il n'a pas de mots).

**Ce qui reste ouvert après la réparation de L5-B** : `planRefusals.int.test.ts` ne garde toujours
qu'**une seule direction** (clé écrite ⇒ atteignable). Le prochain refus nommé sans phrase passera
exactement de la même façon. La garde symétrique — *chaque `reason` que rend une RPC a sa clé* —
n'existe pas.

### 🔴 D0 — **Fuite de corps du foyer à un appelant NON AUTHENTIFIÉ.** *(pas ce lot — mais ce lot l'élargit)*

Découvert en vérifiant les grants. **Attribution : `20260818100000_three_directions_and_a_collected_activity.sql:472`, pas L0.**

```bash
ANON=$(grep '^VITE_SUPABASE_ANON_KEY=' frontend/.env.local | cut -d= -f2-)
curl -s -X POST "http://127.0.0.1:54321/rest/v1/rpc/keel_household_bodies_for" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_household":"58abb20a-1cca-4a3a-95d1-e6a4e65ea66b"}'
```

```json
[{"member_id":"c63bba9e-…","height_cm":175.0,"weight_kg":70.0,"gender":"male","age_years":36,"activity_level":null},
 {"member_id":"7cf691e8-…","height_cm":164.0,"weight_kg":60.0,"gender":"female","age_years":34,"activity_level":"trains_hard"}]
```

`keel_household_bodies_for` est `security definer`, **ne contient aucune garde d'identité** (elle
filtre sur `p_household`, un paramètre de l'appelant), et `has_function_privilege('anon', …)` =
**`t`**. La migration de ce matin fait `revoke all … from public;` — ce qui, d'après la cicatrice
écrite dans ce dépôt même, **ne retire pas `anon`**. Il faut un UUID de foyer.

**L'ironie mérite d'être dite** : l'en-tête de la migration de L0 nomme ce piège mot pour mot et
fait correctement `from public, anon` sur ses **deux** fonctions. Personne n'est allé appliquer la
même ligne à celle dont elle dépend. Et L0 **ajoute un attribut personnel de plus** à ce qui fuit :
`activity_level` sortait `null` ce matin, il sort une réponse ce soir.

**Correctif, une ligne, à faire par quelqu'un d'autre** :
`revoke all on function public.keel_household_bodies_for(uuid) from anon;`

### 🟡 D3 — Un secondaire peut répondre, et sa réponse n'atteint jamais le foyer

Mesuré dans le code, pas seulement déclaré : `SetupPage.saveSelf` gate la seconde écriture sur
`facts.isOwner`. Un membre **avec compte mais non maître** voit la tuile (`own_activity_level` est
`scope: "self"`, toutes branches), l'écran la coche, et elle n'atterrit que dans `profiles` — que
`generate-household-meal-v1` **ne lit pas**. Sa part du foyer reste sur l'hypothèse 1,5.

Le rapport le nomme en §7 et le renvoie à L8. **Je confirme le fait**, et je note qu'à l'écran
rien ne le dit : c'est une case cochable dont l'effet est nul pour cette personne-là.
(La RPC étant maître-seul, il n'y a pas de correctif d'écran — c'est bien un lot à part.)

---

## ÉCARTS ENTRE LE RAPPORT ET MA MESURE

| Ce qu'il revendique | Ce que je mesure | Verdict |
|---|---|---|
| `tsc` 0, `deno check` 0, 41 tests moteur, 76 tests entonnoir, parité 14/14 | **identique, à la ligne près** | ✅ exact |
| « un test qui rougit si le lien se casse » | **vrai pour le MOTEUR et le CATALOGUE ; faux pour l'ÉCRITURE** — mutation 3 verte | ⚠️ **surestimé** (D1) |
| « migration **pas appliquée** », « l'enregistrement du corps d'une bouche est CASSÉ en local » | **appliquée** (posée par l'humain avant moi) ; signature unique à 5 args ; le chemin foyer marche de bout en bout | ℹ️ périmé, pas faux |
| « aucune vérification au navigateur » | **faite** : 7 points, écritures confirmées en base | ✅ comblé |
| suite : **6** rouges / 4 fichiers | **3** rouges / 2 fichiers | ⬇ 3 rouges d'autres sessions résorbés depuis |
| « aucun des rouges n'est de ce lot » | **confirmé indépendamment** (trigger `20260812220000` untracked ; `planRefusals.ts` modifié par autrui ; 0 `create trigger` dans sa migration) | ✅ exact |
| « refus nommés : …, `bad_activity_level` » | motif atteignable, **sans phrase i18n** — fermé par L5-B pendant ma passe | ⚠️ trou non vu (D2) |
| §5 « la divergence de vocabulaire est toujours là » | **confirmée et quantifiée** : `lightly_active` et `very_active` sont refusés par le CHECK **et** par la RPC | ✅ exact |
| §7 « un secondaire n'atteindra le foyer que… » | **confirmé** par la garde `facts.isOwner` | ✅ exact |
| — (non mentionné) | **fuite anon sur `keel_household_bodies_for`** | 🔴 **D0**, hors périmètre mais aggravé par ce lot |

---

## ÉTAT LAISSÉ DERRIÈRE MOI

**Code** : rien de modifié. 5 mutations, 5 restaurations vérifiées par `diff -q` et
`git diff --stat`. Aucun commit, aucun `git stash`.

**Fixture `qa0805.kai@keeltest.dev`** — modifiée par la traversée, et je la déclare plutôt que de
la « réparer » :

| | |
|---|---|
| `profiles` | `full_name = "KaiKai"` (artefact de saisie automatisée), `birth_date = 1990-05-14`, `height_cm = 175`, `gender = male`, `activity_level = **NULL**` |
| foyer | créé, branche `family` ; bouches **Kai** (175/70/male, activity `NULL`) et **Mira** (164/60/female, activity `trains_hard`, née 1992-03-08, `maintenance`) |

Kai avait **zéro** foyer avant moi. Un vérificateur suivant qui attend une fixture vierge doit le
savoir.

---

## CE QUE JE N'AI PAS PU FAIRE

- **Le bouton final de l'étape 4**, non atteint (voir la réserve de N4). Ce qui manque est le
  clic, pas la preuve : l'entonnoir avance sans réponse, et la garde anti-blocage est armée.
- **Le cas d'un mineur** (`childActivityFactor` : un cran bas ne doit jamais faire descendre le
  besoin) n'a pas été exercé au navigateur ; il l'est côté Deno
  (`⚠️ chez un enfant, un cran bas ne fait JAMAIS descendre le besoin`, vert).
- **Aucun run de génération réel** : je n'ai pas mesuré qu'un plan composé avec `trains_hard`
  diffère d'un plan composé à `null`. Le moteur est prouvé par ses tests ; la **jointure
  écriture → génération** ne l'est par personne, dans aucun des deux rapports.
