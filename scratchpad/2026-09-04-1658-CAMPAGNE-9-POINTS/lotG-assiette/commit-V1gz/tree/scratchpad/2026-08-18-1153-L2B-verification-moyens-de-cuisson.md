# L2-B — vérification du lot « moyens de cuisson »

**Date** 2026-08-18 · **Branche** `ff-001-quotidien-du-coach` · aucun push, aucun merge
**Lot vérifié** [2026-08-18-1055-L2A-moyens-de-cuisson.md](2026-08-18-1055-L2A-moyens-de-cuisson.md) · commit `d9ac75cb`
**Périmètre jugé** `kitchen_equipment*`, `KitchenEquipmentCard`, `api/kitchenEquipment*`,
migration `20260818110000`. Les chemins `presence`, `workLunch`, `presenceMarks`,
`MealPickerGrid`, `planGridModel` du même commit appartiennent à **L3** et à son
vérificateur — non jugés ici.

---

## 0. Verdict

**Lot VERT**, avec **une affirmation centrale renversée** et **deux gardes
réparées** (par moi, dans le périmètre). Rien n'est à refaire ; le lot fait ce
qu'il annonce, sauf sur un point qu'il annonçait plus fort qu'il ne le tenait.

| Ce qui a été remesuré | Résultat |
|---|---|
| La garde du lot (`null` ≠ `[]`), lecture à trois valeurs | ✅ tenue des deux côtés, 8 mutations le prouvent |
| « **le type force à écrire `=== false` et jamais `!`** » | ❌ **FAUX — mesuré** (§2) |
| La cicatrice de la photo au montage (relecture, lecture ratée qui lève) | ✅ tenue, 5 mutations |
| Périmètre : zéro ligne de prompt | ✅ `meal_generation.ts` et `household_meal_generation.ts` intouchés |
| Migration `20260818110000` | ✅ appliquée, inscrite, et la base porte le texte annoncé |
| Rejeu des mutations | **20/21 mordent** ; la 21ᵉ, neuve, était muette → durcie (§4) |
| Frontend : sept cases, trois états, deux langues, 320 px et 1280 px | ✅ mesuré au navigateur (§5) |
| L'état coché se lit **sans la couleur** (point ouvert du §9.3 de L2-A) | ✅ **9,98:1 en luminance**, fermé (§5.3) |

**Suites, après mes corrections** : `deno test _shared/keel/` **3251/3251** ·
`vitest` **1187 verts / 3 rouges** (les 3 étrangers connus : `coverage-guard` ×2,
`planRefusals` ×1 — **aucun quatrième**) · `tsc -b` **exit 0** · `eslint` exit 0.

---

## 1. Ce que j'ai corrigé, et pourquoi c'était dans mon périmètre

Trois fichiers, tous propriété du lot L2 :

| Fichier | Geste |
|---|---|
| `supabase/functions/_shared/keel/kitchen_equipment.ts` | le pavé de `hasKitchenTool` disait une chose fausse sur le compilateur ; il dit maintenant ce qui a été **mesuré**, et nomme le chemin sans piège |
| `supabase/functions/_shared/keel/kitchen_equipment_test.ts` | le test « force le troisième cas à être nommé » est scindé en **trois** : le patron `=== false`, la **mesure** que `!` ne mord pas, et le chemin sûr |
| `frontend/src/keel/api/kitchenEquipment.int.test.ts` | la garde « un seul écrivain » n'inspectait que la **première** requête ; elle les inspecte toutes, et épingle qu'il n'y en a qu'une |

**Aucune ligne de comportement n'a bougé.** Les trois lecteurs, l'écrivain et la
carte sont exactement ceux que L2-A a livrés.

---

## 2. ⛔ LA GARDE DU LOT — ce qui tient, et la moitié qui ne tenait pas

### 2.1 Ce qui tient, et c'est l'essentiel

La lecture à trois valeurs est **réelle et typée**. `readKitchenEquipment` rend
`readonly KitchenTool[] | null`, et le `null` traverse : un appelant ne peut pas
faire `equipment.includes(...)` sans que le compilateur l'arrête. Les cinq
entrées du tableau du §2 de L2-A ont été rejouées une à une, des **deux** côtés
(un test vitest importe le module Deno et compare les deux lecteurs sur huit
entrées) :

| En base | Rendu | Vérifié |
|---|---|---|
| clé absente | `null` | ✅ M1 mord |
| `["oven","freezer"]` | `["oven","freezer"]` | ✅ |
| `[]` | `null` | ✅ M2 mord |
| `["fourneau"]` | `null` | ✅ |
| `["oven","fourneau"]` | `["oven"]` | ✅ |
| ordre de stockage inversé | ordre de la **liste** | ✅ M3 mord |

`[]` est refusé **à l'écriture** (`planKitchenEquipmentWrite` → `{ok:false,
reason:"empty"}`, M8 mord) **et à la lecture** (M2 mord). Les deux bouts de la
règle sont armés.

### 2.2 ❌ « Le type force à nommer le troisième cas » — FAUX, et mesuré

C'est écrit dans le pavé du module, dans le message de commit, et dans le §3.2
du rapport — le contrat que **L7 va lire**. J'ai monté le lecteur que L7
écrirait :

```ts
// supabase/functions/_shared/keel/__l2b_probe.ts (sonde jetable, supprimée)
const eq = readKitchenEquipment(pc);
if (!hasKitchenTool(eq, "oven")) lines.push("no oven");   // ⛔ le patron interdit
if (hasKitchenTool(eq, "freezer") === false) lines.push("no freezer");
```

| Mesure | Résultat |
|---|---|
| `deno check __l2b_probe.ts` | **exit 0** — pas un mot |
| `deno lint __l2b_probe.ts` | **Checked 1 file**, zéro problème |
| exécution, `pc = {}` (compte jamais interrogé) | **`["no oven"]`** |
| exécution, `pc = {kitchen_equipment:["oven"]}` | `["no freezer"]` |

**TypeScript autorise `!` sur `boolean | null`**, et il n'existe aucune règle de
lint armée ici pour l'interdire (`strict-boolean-expressions` est une règle
typescript-eslint, et ce module est Deno). Le test de L2-A le prouvait déjà
sans le dire : sa dernière ligne était `assert(!hasKitchenTool(unknown,
"oven"))` — il **compile et passe**, sous un titre qui affirme le contraire.

**Ce que ça coûterait si personne ne le voyait** : la ligne ci-dessus rend « pas
de four » à **tous les comptes créés avant ce lot**. C'est mot pour mot la
dégradation silencieuse que le lot entier existe pour empêcher, et elle
rentrerait par la porte que le lot croyait fermée à clé.

**Ce que j'ai fait, et ce que je n'ai pas fait.**

- ✅ Le pavé dit maintenant la mesure, pas le souhait, et nomme le chemin sans
  piège : **`missingKitchenTools()`**, qui rend `[]` quand rien n'est déclaré et
  n'a donc **aucune direction dangereuse** — ni `!`, ni l'oubli du troisième cas
  ne peuvent en tirer une interdiction que personne n'a énoncée. Cette fonction
  **existait déjà** et est déjà exportée : il n'y a rien à construire.
- ✅ Trois tests Deno remplacent le test au titre trompeur, dont un qui
  **épingle la mesure** (`⛔ `!` NE MORD PAS`) pour que personne ne réécrive
  l'affirmation rassurante.
- ⛔ **Je n'ai PAS changé le type de retour.** Le faire (`"has" | "lacks" |
  "unknown"`) rendrait `=== false` non compilable et le `!` inoffensif — c'est
  le vrai correctif —, mais ça **casse le contrat du §3.2 que L7 va lire**, et
  L7 n'est pas encore écrit. C'est une décision de conception à prendre en
  ouvrant L7, pas en passant.

> ### ⚠️ POUR L7, EN UNE PHRASE
> **Ce qui décide d'une INTERDICTION passe par `missingKitchenTools()`.**
> `hasKitchenTool()` sert à distinguer les trois cas (afficher, compter,
> journaliser) et rien d'autre — le compilateur ne protège personne dessus.

---

## 3. La cicatrice de la photo au montage — tenue, et mieux que ça

Les trois gestes annoncés au §2 bis sont réellement en place, et chacun a une
mutation qui mord :

| Geste | Mutation | Verdict |
|---|---|---|
| `saveKitchenEquipment` **n'accepte pas** de `current` | M16 (on rajoute `current?:` et on s'en sert) | **mord** ×2 tests |
| Il **relit** la colonne avant de fusionner | M16, et l'ordre relecture→fusion est épinglé | **mord** |
| La relecture est **scopée** `.eq("user_id", …)` | M18 (on retire), M22★ (on le déplace en commentaire) | **mordent** |
| Une lecture ratée **lève**, jamais `{}` | M17 | **mord** |
| Le décideur pur est **câblé** sur le réseau | M20 | **mord** |
| La carte ne repasse pas sa photo | M19 | **mord** |

M22★ est à moi : la garde lit le source **commentaires retirés**, donc déplacer
`.eq("user_id", …)` dans un commentaire ne la trompe pas. La cicatrice
`caller-audit-must-strip-comments` est bien payée ici.

### 3.1 Le point hors périmètre : `mergePracticalConstraints`

L2-A signale, sans le faire, que la vraie place de la règle « relire au lieu de
fusionner une photo » est `mergePracticalConstraints` (cinq appelants).
**Je confirme l'analyse, et je confirme aussi qu'il ne fallait pas le faire ici.**

- La fonction reçoit `current` de son appelant et écrit `{...current, ...patch}`.
  Déplacer la relecture dedans **change le comportement des cinq surfaces**,
  dont `SetupPage` (deux appels, ceux de la cicatrice du 15/08) et
  `onboarding.ts` — c'est-à-dire le périmètre de **L6**, en cours d'écriture.
- Le geste correct est de **retirer `current` de la signature** et de relire à
  l'intérieur, scopé — pas d'ajouter une option, « un paramètre qu'on s'engage à
  ignorer est un paramètre qu'on finit par honorer » (et ce raisonnement est
  juste).
- **Lot à part, après L6**, sinon deux lanes réécrivent la même signature.

---

## 4. Le rejeu des mutations — 20/21, et la 21ᵉ était muette

Harnais : `scratchpad/mutate_l2b.py` (dans le scratchpad de session, hors
dépôt). Chaque mutation restaure le fichier dans un `finally`.

| # | Ce qu'on casse | Verdict |
|---|---|---|
| M1 | l'absence de clé se lit `[]` (serveur) | mord |
| M2 | un tableau illisible rend `[]` (serveur) | mord |
| M3 | l'ordre suit le stockage | mord |
| M4 | `missingKitchenTools` interdit tout sur un foyer jamais interrogé | mord |
| M5 | `hasKitchenTool` rend un booléen | mord |
| M6 | le module se met à parler au modèle | mord |
| M7 | un jeton d'écran diverge (`stovetop`→`hob`) | mord (12 tests) |
| M8 | la sélection vide n'est plus refusée | mord (3 tests) |
| M9 | l'écran lit « rien demandé » comme « rien » | mord |
| M10 | la carte pré-coche four + plaques | mord (2 tests) |
| M11 | la porte de lecture tombe | mord (2 tests) |
| M12 | les cases perdent `aria-pressed` | mord (4 tests) |
| M13 | le bouton devient gris quand rien n'est coché | mord |
| M14 | l'écriture court-circuite `mergePracticalConstraints`, **import laissé en place** | **mord** — le durcissement tient |
| M16 | l'écrivain refusionne sur la photo du montage | mord |
| M17 | une lecture ratée rend `{}` | mord |
| M18 | la relecture n'est plus scopée | mord |
| M19 | la carte repasse sa photo | mord |
| M20 | la lecture réseau contourne le décideur pur | **mord** — la ceinture n'est pas sur un coffre vide |
| M21★ | **un SECOND écrivain maison, ajouté APRÈS la fusion** | ⚠️ **VERTE** → durcie, mord |
| M22★ | `.eq("user_id")` déplacé dans un commentaire | mord |

### 4.1 Les deux durcissements de L2-A tiennent — vérifié, pas cru

- **M14** : j'ai remplacé l'appel par un `update()` maison **en laissant
  l'import** — exactement la mutation qui restait verte avant durcissement. Le
  test rougit sur `/await\s+mergePracticalConstraints\(\{/`. ✅
- **M20** : j'ai fait avaler l'erreur à `readFreshConstraints` en recopiant la
  logique de `constraintsFromRow` à la main. Le test de câblage rougit. ✅

### 4.2 ⚠️ M21★ — la garde qui ne regardait que la première requête

La garde découpait le source depuis `src.indexOf('from("student_goals")')`
jusqu'au premier `;` : elle n'inspectait donc **que la première requête du
fichier**. J'ai ajouté un second écrivain maison **plus bas**, après la fusion :

```ts
  await supabase.from("student_goals")
    .update({ practical_constraints: { [KITCHEN_EQUIPMENT_KEY]: [] } })
    .eq("user_id", args.userId);
  return plan;
```

**Suite entièrement verte.** Le comptage « il y a plus d'un écrivain » ne compte
que les appels à `mergePracticalConstraints` — il ne voit pas une requête écrite
à la main. C'est très exactement la mutation qui efface la déclaration qu'on
vient d'enregistrer.

**Durci** : on épingle d'abord qu'il n'existe **qu'une seule** requête vers
`student_goals` dans ce module, puis on juge chacune (lecture seule, scopée,
aucun verbe d'écriture). Rejouée : **mord**.

---

## 5. Le frontend, au navigateur

⚠️ **La carte n'est montée sur aucun écran** (l'étape planning est le lot L6),
donc elle n'est **pas atteignable par navigation**. Je l'ai montée sur une
**entrée Vite jetable** (`frontend/l2b-probe.html` + `src/l2b-probe.tsx`) qui
rend les cinq états côte à côte avec la vraie CSS — **supprimée après mesure,
jamais commitée**, et qui ne touche aucun fichier partagé (ni `App.tsx`, ni
`SetupPage`, ni `launch.json` au-delà d'une entrée qui existait déjà).

Serveur : **port 5198** (`frontend-e`), arrêté après coup. Captures à
**scroll 0** (`scrollY: 0` mesuré, pas supposé).

### 5.1 Les sept cases, les trois états, les deux langues

| Mesure | 320 px | 1280 px |
|---|---|---|
| `document.documentElement.scrollWidth` | **320** = `innerWidth` | **1280** = `innerWidth` |
| `document.body.scrollWidth` | **320** | 1280 |
| Rangées de pastilles | **4** (repli `flex-wrap`, aucun débordement) | **1** |
| Élément plus large que le viewport | **aucun** | aucun |

**Les trois états, rendus et distincts :**

| État (prop) | Ce qui est rendu |
|---|---|
| `practicalConstraints: null` — pas encore lu | **0 pastille**, « Reading what you already told us… », bouton **désactivé** |
| `{cooking_time_min:30}` — lu et vide | 7 pastilles, **toutes `aria-pressed="false"`**, bouton **actif** |
| `{kitchen_equipment:["freezer","oven"]}` | Four et Congélateur `aria-pressed="true"`, les 5 autres `false` |
| `hasGoal:false` | la phrase d'impossibilité + bouton **désactivé** |
| `embedded` | **ni cadre ni titre**, les 7 pastilles présentes |

**Les deux langues, à 320 px et à 1280 px :**

- EN : `Oven · Hob · Microwave · Freezer · Air fryer · Pressure cooker ·
  Blender or food processor` — 7 libellés, dans l'ordre de la liste.
- FR : `Four · Plaques · Micro-ondes · Congélateur · Air fryer · Autocuiseur ·
  Blender ou robot` — **zéro fuite anglaise** mesurée (recherche des 8 chaînes
  EN dans le `innerText` de la page : 0 trouvée), `document.documentElement.lang
  === "fr"`, bouton « Enregistrer ».
- « Air fryer » reste tel quel : c'est l'exception assumée du §4.3, inscrite en
  diff dans `parity.int.test.ts`.

### 5.2 Le refus, mesuré près du geste

Clic sur « Save » avec **zéro case cochée**, sur la carte lue-et-vide :

- **aucun appel réseau** (le refus part de `planKitchenEquipmentWrite`, avant) ;
- le texte de refus apparaît en `red-700` (`oklch(0.505 …)`) ;
- **position mesurée : `top: 802` pour le refus, `top: 898` pour le bouton.**

⚠️ **Nuance de vocabulaire** : le rapport et le commentaire du code disent « le
refus est rendu **SOUS** le bouton qui l'a déclenché ». Il est en réalité rendu
**juste au-dessus** (96 px). La substance de la cicatrice est tenue — le refus
est **adjacent au geste**, et le bouton n'est pas grisé — mais la phrase est
inexacte. Nit de doc, pas un défaut.

### 5.3 ✅ L'état coché se lit SANS la couleur — le point que L2-A n'avait pas su prouver

Mesuré sur les styles calculés d'une pastille cochée et d'une décochée :

| | cochée | décochée |
|---|---|---|
| fond | `rgb(99,44,76)` (aplat figue) | `rgb(251,248,250)` (papier) |
| texte | `rgb(251,248,250)` | `rgb(35,25,31)` |
| bordure | aucune | `1px solid rgb(142,120,134)` |

- **Contraste de luminance entre les deux fonds : 9,98:1.** La différence n'est
  pas une teinte, c'est un **noir contre un blanc** en niveaux de gris : l'état
  reste lisible sans percevoir la couleur.
- Texte sur son fond : **9,98:1** (cochée) et **16,18:1** (décochée) — très
  au-dessus de 4,5:1.
- Et `aria-pressed` porte l'état pour un lecteur d'écran (M12 mord si on le
  retire).

**Point §9.3 de L2-A : fermé, avec un nombre.**

### 5.4 Les écrans existants n'ont pas régressé

| Écran | 320 px | 1280 px | Console |
|---|---|---|---|
| `/app/setup` (étape 2 sur 4, session déjà ouverte dans le navigateur) | `scrollWidth` **320**, rendu complet | `scrollWidth` **1280** | **0 erreur** |
| `/app/household` | atteint, `scrollWidth` **320** après repli | `scrollWidth` **1280** | **0 erreur** |
| `/app/plan` (traversé) | `scrollWidth` **320** — la table de 480 px scrolle **dans son conteneur**, la page non | — | 0 erreur |
| `/auth` | `scrollWidth` **320** | — | 0 erreur |

C'est cohérent avec le diff : **ce lot ne touche aucun fichier de page**. Aucune
route, aucun composant monté, aucun module d'API existant n'est modifié — les
seuls fichiers non neufs du lot sont `parity.int.test.ts` (+8 lignes) et les
packs i18n (non commités).

⚠️ **Non prouvé, et je le consigne rouge plutôt que de l'inventer** :

1. **La carte dans son écran réel.** Elle n'est montée nulle part : je l'ai
   mesurée **isolée**. L'interaction avec le « Continuer » de l'étape `table`
   (qui écrit dans la même colonne à la seconde d'à côté) **ne peut pas être
   observée** avant L6. Le raisonnement dit qu'elle est protégée — la relecture
   est réelle, M16 le prouve —, mais **la scène à deux écrivains n'a pas été
   jouée**.
2. **Aucune écriture réelle en base.** Je n'ai pas enregistré de sélection : cela
   aurait écrit dans `student_goals` d'un compte de travail partagé avec les
   autres lanes. Le chemin `saveKitchenEquipment → mergePracticalConstraints`
   est prouvé par mutation, **pas par un aller-retour PostgREST**.
3. **Je ne me suis pas authentifié.** La session présente dans le navigateur
   était déjà ouverte ; je n'ai saisi aucun mot de passe. Les écrans ci-dessus
   ont donc été observés tels qu'ils se présentaient, sans changer de compte.

---

## 6. Le périmètre — tenu

`git show d9ac75cb --stat`, chemins de **mon** lot uniquement :

```
supabase/migrations/20260818110000_kitchen_equipment.sql       102 +
supabase/functions/_shared/keel/kitchen_equipment.ts           170 +
supabase/functions/_shared/keel/kitchen_equipment_test.ts      200 +
frontend/src/keel/api/kitchenEquipment.ts                      283 +
frontend/src/keel/api/kitchenEquipment.int.test.ts             333 +
frontend/src/keel/components/KitchenEquipmentCard.tsx          203 +
frontend/src/keel/components/kitchenEquipmentCard.int.test.ts  283 +
frontend/src/keel/i18n/parity.int.test.ts                        8 +
```

- **Zéro ligne de prompt.** `meal_generation.ts` et
  `household_meal_generation.ts` **n'apparaissent pas dans le commit**, et deux
  tests tiennent la frontière dans les deux sens (M6 mord côté serveur ; le test
  vitest « ⛔ ce lot ne parle pas au modèle » lit `meal_generation.ts` et exige
  l'absence de `kitchen_equipment`).
- Le seul fichier non neuf hors du lot est `parity.int.test.ts`, +8 lignes,
  l'exception `tool_air_fryer` — visible en diff, comme annoncé.
- Le jeton **ne voyage pas** dans le corps des requêtes de génération : test sur
  `household.ts`, `planDraft.ts`, `mealGeneration.ts`.

Les dix autres fichiers du commit sont ceux de **L3** (§7.0 de L2-A). Non jugés,
non touchés.

---

## 7. La migration — appliquée, inscrite, et conforme

```
$ psql -Atc "select version from supabase_migrations.schema_migrations
             where version >= '20260818000000' order by version;"
20260818100000      (L1)
20260818110000      (L2)  ← la mienne
20260818120000      (L3)
```

Les trois sont là, **dans l'ordre** : la crainte du §6.1 de L2-A (une migration
hors ordre sautée en silence) ne s'est pas réalisée.

Le fichier ne fait qu'un `comment on column` dans une transaction : **aucune
DDL, aucune donnée touchée, aucun `check`**. La base porte bien le texte :

- `kitchen_equipment[]` est **dans la liste des clés connues**, à sa place, dans
  le commentaire de `public.student_goals.practical_constraints` ;
- le paragraphe ajouté porte les sept jetons, la garde « absence ≠ liste vide »,
  les trois jetons qui changent un plan, le lecteur unique, et la mention que la
  clé est **collectée et pas encore lue** ;
- le texte existant (rythme, budget) est **repris mot pour mot** — comparé au
  commentaire en base : aucune phrase antérieure n'a bougé.

### 7.1 La colonne accepte bien la clé, et **175 comptes sur 175 sont dans le cas gardé**

```
practical_constraints | jsonb | NOT NULL
```

Les huit `CHECK` de la table portent sur `goal`, `focus_axis`, `target_weight`,
`target_waist` — et **un seul** touche au jsonb : `eating_rhythm` doit être un
tableau. **Rien ne contraint `kitchen_equipment`**, conformément au motif écrit
dans la migration (le parseur borne, une contrainte SQL ferait échouer une
écriture que le lecteur sait réparer). Un seul trigger, `set_updated_at`.

```sql
select count(*) filter (where practical_constraints ? 'kitchen_equipment'), count(*)
  from public.student_goals;
→ 0 | 175
```

**Zéro ligne sur 175 porte la clé.** Autrement dit : *tous* les comptes de cette
base sont dans le cas « jamais demandé ». Si l'absence se lisait `[]`, le
prochain plan retirerait le four et le congélateur à **175 comptes sur 175** —
la garde du §2 n'est pas une précaution théorique, c'est le cas nominal.

La clé se range donc **au bon endroit** : `student_goals.practical_constraints`,
au niveau du foyer, à côté de `cook_days` et `eating_rhythm`. Cohérent avec le
§2.1 de la conception (niveau FOYER) et avec le §4.6 (le micro-ondes du bureau
appartient à la personne et n'est **pas** ici — vérifié : le jeton n'existe pas
dans `household_presence.ts`).

---

## 8. Ce qui reste ouvert (pour d'autres, pas pour ce lot)

1. **Le type de `hasKitchenTool`** (§2.2) — à trancher **en ouvrant L7**, pas
   avant. Si on le change, le §3.2 du rapport de L2-A doit changer avec.
2. **`mergePracticalConstraints`** (§3.1) — lot à part, **après L6**.
3. **« sous le bouton »** (§5.2) — le refus est au-dessus ; corriger la phrase
   dans le pavé de `api/kitchenEquipment.ts` et dans le §4.2 du rapport L2-A.
4. **Une guillemet française dans une chaîne anglaise** : la ligne d'aide EN
   contient `what « reheat it » means`. Les packs i18n ne sont pas commités,
   c'est un nit de copie pour qui les reprendra.
4 bis. **Le §8 de L2-A annonce « 15 clés × 2 » ; il y en a 17 × 2** (10 de
   chrome + 7 outils), et le §8 les liste toutes les 17. Les deux packs sont
   symétriques (17 = 17), `parity` est vert : c'est un compte faux dans le
   rapport, pas une clé manquante.
5. **`tsc -b` incrémental ment entre lanes concurrentes** — voir §9.

---

## 9. ⚠️ POUR LES TROIS AUTRES VÉRIFICATEURS — deux pièges de `tsc` mesurés

### 9.1 L'incrémental a **inventé** un rouge chez un voisin

À 11:47, `npx tsc -b` a rendu **exit 2** :

```
../supabase/functions/_shared/keel/household_portions.ts(426,10):
error TS2367: … types '"unknown" | "adult"' and '"minor"' have no overlap.
```

**La ligne 426 de ce fichier est une accolade fermante.** L'erreur ne pointait
sur rien. `npx tsc -b --force` juste après : **exit 0**, et l'incrémental
suivant aussi. Artefact du `.tsbuildinfo`, produit parce que la lane
propriétaire de `household_portions.ts` (L1) a réécrit le fichier pendant qu'un
`tsc` en gardait une version en cache.

**Avant d'accuser un voisin, relancer `tsc -b --force`.**

### 9.2 Et à 12:00, un rouge **réel** et étranger est apparu

Entre 11:53 (`tsc -b` **exit 0**, mesuré) et 11:58, une lane a repris la
migration « six objectifs → trois » **côté écran**. `tsc -b` rend depuis :

```
src/keel/api/onboarding.ts(1799,22)  TS2367  '"recomposition"' n'a plus d'overlap
src/keel/api/onboarding.ts(1800,22)  TS2367  '"health"'
src/keel/api/onboarding.ts(1800,43)  TS2367  '"performance"'
src/keel/pages/HouseholdPage.tsx(162|164|166,10)  TS2678
src/keel/pages/SetupPage.tsx(240,3)  TS2353
```

`tokens.ts` a été réécrit à **11:49:46**, `HouseholdPage.tsx` à **11:56:01** :
le serveur a convergé, l'écran pas encore. **Aucun de ces fichiers n'appartient
à L2**, et aucun n'est touché par ce lot. C'est très exactement la situation que
la barrière du §2 bis de l'orchestration décrit — et elle n'est pas la mienne à
réparer. La lane a convergé toute seule : `tsc -b` est repassé **exit 0 à
11:59:48**, sans que j'y touche.

**Ce que ça a coûté ici** : `agent-gate` fait tourner `check_typecheck` sur tout
le dépôt, donc **mon commit a été refusé par le gate sur le travail en cours
d'un voisin** (§10). Le gate a raison ; je n'ai pas contourné.

**Ce n'est donc PAS un quatrième rouge de mon lot** : côté vitest, les trois
rouges connus (`coverage-guard` ×2, `planRefusals` ×1) restent les seuls, et
`deno test _shared/keel/` est à **3251/3251**.

---

## 10. L'état du commit

Message et chemins prêts, **forme à pathspec** — celle qui ignore ce qu'une
session voisine a pu stager dans l'index partagé entre le `add` et le `commit` :

```bash
git commit -F <message> -- \
  supabase/functions/_shared/keel/kitchen_equipment.ts \
  supabase/functions/_shared/keel/kitchen_equipment_test.ts \
  frontend/src/keel/api/kitchenEquipment.int.test.ts \
  scratchpad/2026-08-18-1153-L2B-verification-moyens-de-cuisson.md
```

⚠️ **Premier essai (11:58) refusé par `agent-gate`** sur `check_typecheck`, à
cause des sept erreurs étrangères du §9.2. `check_forbidden_patterns`,
`check_test_count` et `check_tests` (**3251 verts**) étaient passés. **Aucun
contournement** : pas de `--no-verify`, qui demande un humain. J'ai attendu que
la lane voisine converge (**11:59:48**, `tsc -b` exit 0) et rejoué le commit,
gate complet, sans rien contourner.

Jamais `git add -A`, jamais `git stash`, aucune commande à risque, aucune
migration appliquée (elles l'étaient déjà).
