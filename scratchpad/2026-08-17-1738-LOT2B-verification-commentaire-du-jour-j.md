# Rapport LOT 2B — vérification du commentaire de préparation du jour J (P2)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 17:38 · **Aucun `push`, aucun merge.**
**Master prompt** `scratchpad/2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md`, §LOT 2 / agent 2B.
**Rapport vérifié** `scratchpad/2026-08-17-1656-LOT2A-commentaire-du-jour-j.md`.
**Commits vérifiés** `bccf6291` (moteur) + `f3d4009c` (écran). Le LOT 1 s'arrête à `7542812a`.
**Commits ajoutés par cette vérification** `540de504` (défaut trouvé au run réel, §6)
et `a5f0305d` (le texte de `method` remonté dans le bandeau, §9 — demandé par le
coordinateur après lecture de §5-(c)).

> **Verdict : LOT 2 vert, après DEUX correctifs.**
> Le rapport de 2A est exact sur tout ce que j'ai rejoué — les 8 mutations que j'ai
> reprises mordent, les versions ont bougé du bon axe, l'enveloppe foyer est
> byte-identique au SHA près. **Et le chiffre qui n'existait pas existe maintenant :
> le taux `declared/dishes` vaut CENT POUR CENT sur les trois runs réels — soixante-six
> plats sur soixante-six.** Le lot n'est pas désarmé.
> Deux défauts corrigés : « Rien à préparer — 5 min » (§6), et **le commentaire de
> préparation qui n'était qu'une étiquette** (§9) — le texte qui dit quoi faire restait
> sous les ingrédients, donc P2 n'était tenu qu'à moitié.

| Épreuve | État |
|---|---|
| Suites (Deno 3080, vitest 1047, `tsc -b --force`) | ✅ rejouées |
| Sonde de parseur **indépendante** (mes fixtures, pas celles de 2A) | ✅ 5/5 |
| Mutations — 8 des 22, les plus porteuses, + 6 des miennes | ✅ 14/14 au rouge, restaurées |
| Versions : tronc bumpé d'un cran, foyer immobile, enveloppe byte-identique | ✅ prouvé au SHA256 |
| Garde anti-durées-de-session | ✅ **mord toujours** (mutation rejouée) |
| **RUN RÉEL — les deux lanes** | ✅ **100,0 % · 66/66 plats** |
| Compteur archivé à la racine de `generated_from`, en base | ✅ prouvé sur une ligne réelle |
| Navigateur : 4 états, 2 langues, 320 px **et** 1280 px | ✅ prouvé sur données réelles |
| C3 en entier · C2 inchangé | ✅ prouvé en SQL sur le plan réel |
| C8 | 🟠 prouvé **à la valeur** sur octets réels ; modale non atteinte (§7.1) |
| **Défauts trouvés et corrigés** | 🟠 2 — §6 (`none` + durée) et §9 (le texte du commentaire) |
| Écarts de 2A au master prompt, évalués | 2 servent l'exigence, **1 corrigé** (§5-c → §9) |

---

## 1. Le socle, rejoué et pas cru

| Épreuve | Avant mon correctif | Après |
|---|---|---|
| `deno test --allow-read --allow-env supabase/functions/_shared/keel/` | **3078 passés, 0 rouge** | **3080 passés, 0 rouge** |
| `cd frontend && npx tsc -b --force` | **exit 0** | **exit 0** |
| `npx vitest --config vitest.config.ts run` | **1041 passés, 3 rouges** | **1041 passés, 3 rouges** |
| `agent-gate` sur mon commit | — | **pass** |

**Les 3 rouges vitest sont étrangers et antérieurs**, et je les ai identifiés
nominativement plutôt que de reprendre l'affirmation de 2A :
`src/edge/coverage-guard.int.test.ts` (×2) et `src/keel/copy/planRefusals.int.test.ts`
(×1, `household.error.*` non atteignables). Aucun n'est dans le diff du lot ; aucun ne
lit un fichier que le lot touche ; mon correctif ne change pas leur compte.

### 1.1 Les versions — prouvées au SHA256, pas à la lecture

```
MEAL_PROMPT_VERSION       7542812a: meal.en.v9_cooking_shape
                          HEAD    : meal.en.v10_same_day          ← un seul cran
HOUSEHOLD_PROMPT_VERSION  7542812a: v12_whose_dish_is_it
                          HEAD    : v12_whose_dish_is_it          ← immobile
```

**L'enveloppe foyer est byte-identique, et c'est un hash, pas une affirmation :**

```
household_meal_generation.ts   7542812a = HEAD = disque = 85f1b2cf…b2ef773a
household_portions.ts          7542812a = HEAD = disque = c68f1c40…1d117164
```

Et le mot `same_day` n'apparaît **0 fois** dans ces deux fichiers.

⚠️ **Le bump du tronc atteint bien la population foyer**, et je l'ai vérifié parce que
« l'enveloppe ne bouge pas » aurait pu vouloir dire « le cache foyer ne tombe pas » :
la lane foyer écrit `` `${MEAL_PROMPT_VERSION}+household.${HOUSEHOLD_PROMPT_VERSION}` ``
(`generate-household-meal-v1/index.ts:3872`). Mesuré sur la ligne réellement écrite :
`meal.en.v10_same_day+household.v12_whose_dish_is_it`. Le cache foyer tombe bien.

### 1.2 Une sonde de parseur INDÉPENDANTE

Les tests de 2A prouvent le contrat de 2A. J'ai écrit ma propre sonde, mes fixtures, mes
assertions (fichier temporaire, **supprimé après**, jamais commité) — **5/5 verts** :

- les quatre jetons accueillis tels quels, `minutes: 0` lu comme **un nombre**, pas comme une absence ;
- `warm_up` jeté, `REHEAT_ONLY` normalisé, `assemble` sans minutes gardé — **trois plats entrent, trois plats sortent** ;
- un plat sans clé du tout : ni `declared` ni `invalid` — c'est l'écart que le run doit mesurer ;
- `mealDishesPayload` écrit la clé **même à `null`**, identiquement sur les **deux** lanes ;
- le plafond : 999 → 120 écrêté et nommé, **119 passe intact** (le cas qui passe).

⚠️ **Un piège que ma sonde a rencontré et que je consigne** : le plafond de plats vaut
**3** pour `scope: "day"` (`over the 3-dish cap for day, dropped`). Mes deux premières
fixtures mesuraient le plafond en croyant mesurer `same_day`. C'est la même cicatrice que
2A décrit sur sa fixture de `splice`.

---

## 2. Les mutations — 8 des 22 reprises, choisies pour ce qu'elles portent

Chacune appliquée sur un arbre propre, test lancé, restaurée, arbre revérifié.

| # | Mutation | Cible | Résultat |
|---|---|---|---|
| M1 | un `same_day` invalide **rejette** le plat (`continue`) | `meal_generation.ts` | **rouge — 2 ✗** |
| M2 | le compteur est débranché (`dishes: 0`) | `meal_generation.ts` | **rouge — 5 ✗** |
| M3 | la lane **individuelle** n'archive plus le compteur | `generate-meal-v1` | **rouge — 1 ✗** |
| M4 | le compteur **foyer** glisse sous `household` | `generate-household-meal-v1` | **rouge — 1 ✗** |
| M5 | une durée de **session** remonte sur la carte | `DishCard.tsx` | **rouge — 1 ✗** |
| M6 | le tronc ne bumpe plus (retour à v9) | `meal_generation.ts` | **rouge — 2 ✗** |
| M7 | l'enveloppe foyer parle de `same_day` sans bumper | `household_meal_generation.ts` | **rouge — 1 ✗** |
| M8 | la liste fermée du front diverge du moteur (`warm_up`) | `api/mealGeneration.ts` | **rouge — 2 ✗** |
| M11 | `same_day` entre dans la liste plate du secondaire | `DishListByDay.tsx` | **rouge — 1 ✗** |

**M1 est celle que le master prompt demandait nommément**, et elle tombe sur le test qui
porte exactement la promesse : *« un jeton hors liste NE REJETTE PAS le plat »*.

**M5 est l'autre demande nommée** : la garde anti-durées-de-session **mord toujours**.
J'ai remonté `session.total_minutes` sur la carte → le test des trois littéraux interdits
tombe. La règle s'est précisée sans se desserrer.

⚠️ **M11 n'a pas mordu du premier coup, et je le consigne plutôt que de le taire.**
Ma première version écrivait la mutation dans un **commentaire** — et le `code()` du test
retire les commentaires avant de chercher. Verte, donc, et pour rien. Rejouée en **vrai
code** (`const _M11 = (d: {same_day?: unknown}) => d.same_day ?? null;`) : **rouge**.
C'est la cicatrice `caller-audit-must-strip-comments` prise dans l'autre sens — un
audit qui retire les commentaires rend aussi les mutations en commentaire invisibles.

---

## 3. LE RUN RÉEL — le chiffre qui n'existait pas

### 3.1 Le poste, et pourquoi je n'ai RIEN redémarré

L'autorisation encadrée m'était donnée. **Je ne m'en suis pas servi, parce que la
condition qui la motivait n'était plus vraie.** Sondé avant d'agir :

```
2026-08-17T15:09:43Z  Serving functions on http://127.0.0.1:54321/functions/v1/<function-name>
```

Le runtime edge **s'était redémarré 48 secondes plus tôt** — donc **après** mes deux
commits (14:41 / 14:53 UTC) et **après** ma dernière restauration de mutation (≈15:06
UTC). Il servait déjà des `_shared` frais. Un `docker restart` de plus n'aurait rien
rafraîchi et aurait risqué de couper le travail de la lane qui venait de le relancer.
**Vérifié empiriquement plutôt que supposé** : les plans rendus portent
`meal.en.v10_same_day` et le champ `same_day` — ce que seul le code de HEAD produit.

Runtime vivant (401 sur les deux fonctions sans auth, PostgREST 200).
`./scripts/local_extend_kong_functions_timeout.sh` joué avant les runs (`read_timeout=600000`).
Les deux personas visés répondent `OK` à `signInWithPassword` avec `1234567` — **mesuré
avant de viser quoi que ce soit**, jamais un compte dont j'ignore le mot de passe.

### 3.2 Les trois runs, et leurs octets

| Run | Lane | Compte | Fenêtre | HTTP | Durée |
|---|---|---|---|---|---|
| ① brouillon | **foyer** (`generate-household-meal-v1`) | `l2p-owner` (Vidal, 4 bouches) | 2026-08-20 + 7 j | 200 | 65,7 s |
| ② brouillon | **individuelle** (`generate-meal-v1`) | `l2p-nina` (secondaire ⇒ lane perso) | 2026-08-20 + 7 j | 200 | 321,4 s |
| ③ **écrit** | **foyer**, `intent: prepare_next` | `l2p-owner` | 2026-08-20 + 7 j | 200 | 91,6 s |

Le choix de `l2p-nina` pour la lane individuelle n'est pas un pis-aller : `chooseGenerator`
(`api/planRouting.ts`) renvoie `personal` dès `!isOwner`. **Un secondaire EST la lane
individuelle**, et c'est le chemin que le master prompt nomme (« lane individuelle et
secondaires »).

### 3.3 LE TAUX — en toutes lettres

> **Cent pour cent.** Soixante-six plats rendus, soixante-six portent leur geste du
> jour. Zéro jeton refusé, zéro durée manquante, zéro silence.

| Run | Plats | `same_day` déclaré | **Taux** | `invalid` | `minutes_missing` | silence (`null`) |
|---|---|---|---|---|---|---|
| ① foyer | 21 | 21 | **100,0 %** | 0 | 0 | 0 |
| ② individuelle | 21 | 21 | **100,0 %** | 0 | 0 | 0 |
| ③ foyer écrit | 24 | 24 | **100,0 %** | 0 | 0 | 0 |
| **total** | **66** | **66** | **100,0 %** | **0** | **0** | **0** |

**Les quatre jetons sont tous exercés**, et par des lanes différentes :

| jeton | ① foyer | ② individuelle | ③ foyer écrit |
|---|---|---|---|
| `reheat_only` | 12 | 6 | 3 |
| `cook_fresh` | 8 | 0 | 11 |
| `assemble` | 0 | 15 | 8 |
| `none` | 1 | 0 | 2 |

Durées réelles : 3 à 40 min, moyenne 26,8 (`cook_fresh`), 11,9 (`assemble`),
10,7 (`reheat_only`). **Aucun écrêtage à 120 min** — le plafond de 2A n'a jamais mordu
en réel, ce qui répond à sa réserve §6.5 : il est confortable, pas serré.

### 3.4 Le compteur ATTEINT la base — sur une ligne réelle

Les sept requêtes de `scratchpad/same_day_counters.sql` jouées **telles quelles** sur le
plan écrit `6620682c-6a64-454c-a668-a5c3f45d253c` :

```
① prompt_version = meal.en.v10_same_day+household.v12_whose_dish_is_it
   dishes 24 | declared 24 | invalid 0 | minutes_missing 0     ← à la RACINE de generated_from
② pct_declared = 100.0
③ CONTRE-ÉPREUVE (le compteur peut mentir, les plats non):
   dishes_in_jsonb 24 | key_written 24 | key_written_null 0 | with_gesture 24
                                                             | gesture_without_minutes 0
④ cook_fresh 11 (26,8 min) · assemble 8 (11,9) · reheat_only 3 (10,7) · none 2 (5,0)
⑤ C3 cohérence douce ......... 0 ligne
⑥ C3 silence du modèle ....... 0 ligne
⑦ issues `same_day` .......... 0 ligne
```

**③ est la requête qui compte** : le compteur annoncé et les plats comptés à la main
disent le même nombre. Un compteur qui mentirait se verrait ici, et il ne ment pas.

---

## 4. La cohérence et l'écran

### 4.1 C3 — en entier, en SQL, sur le plan réel

| Ligne de C3 | Mesure |
|---|---|
| chaque plat porte un `same_day` **valide** | **24 / 24** |
| chaque plat porte un commentaire **non vide** (`method`) | **24 / 24** |
| un plat `reheat_only` a des `uses` **non vides** | **0 violation** |
| `none` sur un plat qui puise dans un lot | **0 violation** |
| `none` qui annonce une durée | **2 violations → §6, corrigé** |

### 4.2 C2 — inchangé

Sur le plan neuf : **9 jointures `uses[].preparation_id`, 0 orpheline, 0 préparation
cuite après usage.**

⚠️ **Ma première mesure disait « 4 cuites après usage », et c'était MON erreur, pas un
défaut du lot.** J'avais classé les jetons par ordre **calendaire** (`mon..sun`) alors
que la fenêtre commence un **jeudi**. C1 dit « l'ordre du PLAN, pas du calendrier », et
je venais de tomber dans le piège que le master prompt nomme. Rejoué en dérivant le rang
depuis `starts_on` : **0**.

### 4.3 Le navigateur — sur des données réelles, pas des fixtures

Persona `l2p-owner`, jeton injecté en `localStorage` (patron du harnais commité, aucun
formulaire rempli), serveur `frontend-a24` / 5194 lancé par `preview_start`.

**Sur `/app/plan`, onglet « Suivant » (le plan v10 que je viens d'écrire), vue semaine :**

```
bandeaux rendus ............ 24   pour 24 plats
lignes à filet (p.border-l-2) 24
bandeaux sans durée ......... 0
```

Et la ventilation à l'écran est **exactement** celle de la base :
`Nothing to prepare 2 · Just reheat 3 · Assemble on the plate 8 · Cook it fresh 11`.
**Les quatre états sont donc rendus — non par une fixture par état, mais par un plan
réel qui les porte tous les quatre.**

**Les deux langues** (`?lang=fr`, `document.documentElement.lang = "fr"`) :
`Rien à préparer 2 · À réchauffer 3 · À assembler 8 · Cuisine minute 11` = **24**, et
**zéro** libellé resté en anglais. Exemples relevés : « À assembler — 10 min »,
« À réchauffer — 10 min ».

**Les débordements, mesurés et non regardés :**

| Surface | largeur | `document.scrollWidth` | verdict |
|---|---|---|---|
| `/app/plan` vue semaine, 24 bandeaux | 1280 | 1280 | pas de débordement |
| idem | **320** | **320** | pas de débordement |
| les 24 lignes de bandeau elles-mêmes | 320 | `scrollWidth === clientWidth` sur **24/24** | aucune ne déborde |

`break-words` est bien posé sur la ligne (classe relevée dans le DOM).
**Capture à scroll 0**, corps décalé par marge négative (le pane ne repeint qu'à scroll 0) :
le bandeau se lit sous le titre et le badge de moment, **avant** le pourquoi et **avant**
les ingrédients — la position que le test de source assère est celle qu'on voit.

**Console** : `read_console_messages(onlyErrors)` → **aucun message**. En DEV une clé
i18n absente **lève** ; aucune ne l'est.

**Le plan v8 courant, lui, n'affiche aucun bandeau** — mesuré : 0. C'est le comportement
attendu (la clé n'existe pas sur ces lignes) et c'est le sujet de §5-(b).

**Le secondaire** (`l2p-nina`, `/app/household`) : la lecture par jour est là (9 moments),
et **0 bandeau, 0 ligne à filet, 0 mention de durée**. La garde tient — étayée par M11,
puisque le plan affiché là est un v8 qui ne pouvait de toute façon rien porter.

---

## 5. Les écarts de 2A au master prompt — évalués, pas entérinés

### (a) `minutes: number | null` au lieu du `number` demandé — **SERT l'exigence** ✅

La question n'est pas « 2A a-t-il eu le droit », c'est « qu'est-ce que le `number` strict
aurait acheté ». Réponse mesurée : **rien, et il aurait coûté**.

- Avec `number` strict, une durée illisible rendrait tout le `same_day` invalide — on
  perdrait **le jeton**, c'est-à-dire la moitié qui manquait au produit (« à
  réchauffer », dit explicitement, que P2 réclame nommément), pour sauver la moitié qui
  ne fait qu'aider.
- `0` par défaut est exclu par un précédent du dépôt même (`MealPreparation.activeMinutes` :
  *« pas de zéro par défaut, qui se lirait c'est instantané »*).
- Le cas est **compté** (`minutes_missing`), donc jamais maquillé.
- **Et le run réel tranche** : `minutes_missing = 0` sur les trois runs. Le `null` n'a
  jamais servi. C'est une soupape, pas un relâchement.

**Verdict : à garder.** Strictement plus robuste que le `number` demandé, sans perte mesurable.

### (b) Aucun bandeau quand `same_day` est `null` — **SERT l'exigence** ✅, avec une exposition bornée

C'était l'écart le plus lourd de soupçon, et le run réel le désamorce.

- Rendre « Rien à préparer » par défaut affirmerait un fait que le moteur n'a pas écrit,
  sur la surface exacte où ce dépôt a déjà payé « faits faux indémentables » (la coche
  automatique). `null` ≠ `none`, et `none` est une **affirmation du moteur**.
- La crainte formulée — « aucun plan actuel n'affiche de commentaire » — **était vraie
  et ne l'est plus** : dès qu'un plan traverse v10, le taux est de **100 %**. La promesse
  P2 est tenue par le prompt et **mesurée** par le compteur, exactement comme 2A l'écrit.
- **L'exposition résiduelle est bornée et je l'ai chiffrée** : 158 plans en base, 1 avec
  la clé. Mais sur les plans **vivants** : **6 vivants, 1 avec la clé**, et les 5 autres
  expirent entre le **2026-08-19 et le 2026-08-26**. Le trou se referme tout seul en
  moins d'une semaine, sans migration.

**Verdict : à garder.** La réparation « afficher un libellé par défaut » serait un
recul — elle échangerait un silence honnête contre une affirmation fausse.

### (c) ⚠️ UN TROISIÈME ÉCART, **NON DÉCLARÉ** par 2A — le texte de `method` n'a pas rejoint le bandeau

Le master prompt écrit, §LOT 2 / Le rendu :

> « le commentaire de préparation passe **en tête de carte** (avant les ingrédients) —
> libellé du jeton (…) **+ le texte de `method`** »

**Livré** : le libellé du jeton et la durée sont en tête de carte ; **`method` est resté
où il était depuis le 2026-08-14**, c'est-à-dire **sous la liste des ingrédients**, sous
son libellé « Comment : » / « How: ». Vérifié à la source **et** à l'écran (capture) :

```
Greek yoghurt, berries and oats          ← titre
[Breakfast]                              ← moment
│ Assemble on the plate — 10 min         ← le bandeau du LOT 2
Fast breakfast with a protein anchor…    ← le pourquoi
Greek yoghurt 800 g · rolled oats 200 g… ← les ingrédients
How: Spoon the yoghurt into four bowls…  ← `method`, RESTÉ ICI
```

Le rapport de 2A ne mentionne pas cet écart — ni dans son §7 « décisions tranchées seul »,
ni ailleurs. C'est le seul point où son rapport est **incomplet** plutôt qu'inexact.

**Mon évaluation initiale — l'écart est défendable — a été RENVERSÉE par le
coordinateur, et il avait raison.** J'avais pesé le coût du déplacement (dupliquer un
bloc, déranger une décision du 14/08) sans peser ce que l'écart coûte au **lecteur** :
un bandeau qui annonce « À assembler — 10 min » pendant que le comment reste sous les
ingrédients ne sert que la moitié de P2 — l'exigence dit « un **commentaire** de
préparation », et un commentaire est un **texte** qui dit quoi faire, pas une étiquette.
Devant une casserole, on ne doit pas redescendre chercher son geste.
**Corrigé en §9.**

---

## 6. 🟠 LE DÉFAUT TROUVÉ AU RUN RÉEL, ET CORRIGÉ — `540de504`

**Trouvé en lisant les octets, pas le code.** Sur le plan écrit, deux plats portaient :

```
thu  Apple and peanut butter     {"kind": "none", "minutes": 5}   uses: 0
thu  Hummus and carrot sticks    {"kind": "none", "minutes": 5}   uses: 0
```

L'écran compose le libellé du jeton avec la durée et rend — je l'ai lu dans le DOM en
français — **« Rien à préparer — 5 min »**. La ligne se contredit elle-même.

**La cause** : le modèle lit `none` comme « rien à **cuire** » là où le prompt dit « rien
à **faire** ». Couper une pomme prend cinq minutes ; le geste réel de ces deux plats est
`assemble`.

**Pourquoi rien ne l'a vu** : les deux constats de cohérence douce existants regardent
`uses`, jamais la durée. `reheat_only` + `uses` vide, `none` + `uses` non vide — ni l'un
ni l'autre ne mord ici (`uses` vaut 0, ce qui est cohérent avec `none`). La contradiction
traversait donc **entière** jusqu'à l'écran **sans laisser une seule trace en base**.

**Le correctif** — un **troisième** constat, même posture que les deux autres : compté,
nommé, **jamais rejeté**. On ne sait pas laquelle des deux moitiés a tort (la durée peut
être juste et le jeton faux), donc ce n'est pas un refus : c'est ce qui rend le
resserrage du prompt **mesurable**. La requête ⑦ de 2A le remonte déjà sans changer d'un
octet.

**Deux tests, et il en fallait deux** : celui qui voit le constat **mordre**, et **le cas
qui passe** — `none` + `0` et `none` sans durée sont les deux formes justes ; un constat
qui mordrait sur tous les `none` bloquerait la lecture en ayant l'air de marcher.

**Mutations rejouées sur ma propre garde :**

| # | Mutation | Résultat |
|---|---|---|
| M9 | le seuil monte à 9999 — le constat ne se déclenche plus | **rouge — le test « nommé » tombe** |
| M10 | le constat mord sur **tous** les `none` | **rouge — le cas qui passe tombe** |

⚠️ **Une erreur de ma part, consignée** : en restaurant M9 par `git checkout --`, j'ai
effacé **mon propre correctif** en même temps que la mutation. Rattrapé, réappliqué, et
les restaurations suivantes se sont faites depuis une **copie de sauvegarde**, jamais
depuis git. C'est la raison exacte pour laquelle 2A avait fait de même sur ses fichiers
d'écran.

### Le resserrage de prompt que je propose à 2A (non appliqué — hors de mon périmètre)

La section `== WHAT TODAY ACTUALLY TAKES ==` définit `none` par
`"none" - nothing to prepare. Fruit, a yogurt, a plate already made.`
Deux des trois exemples (**un fruit**, **un yaourt**) demandent en vrai un geste — les
sortir, les couper. Le modèle suit l'exemple, pas la définition. Proposition :

> `"none"` — the plate is already the dish: nothing is opened, cut, plated or heated.
> If any hand touches the food, it is `"assemble"`, however short. `none` therefore
> takes **0 minutes**; if you wrote any other number, the answer was `assemble`.

Le constat neuf mesurera le gain, plan par plan.

---

## 7. Ce qui reste rouge, ou non prouvé

1. 🟠 **7.1 — C8 : la modale d'aperçu n'a PAS été atteinte au navigateur.**
   Les trois clics sur « Prévisualiser » ont rendu **400 `window_beyond_this_week`**
   (*« A plan is written in day names (mon, tue…), and those only reach as far as this
   Sunday »*) — une règle produit **antérieure au lot**, que **mon propre plan écrit a
   aggravée** : `prepare_next` a consommé la fenêtre 08-20/08-26, donc l'écran propose
   désormais une fenêtre qui déborde dimanche. Je n'ai pas forcé le passage par
   `/app/setup` : le parcours y modifie le foyer de la fixture.
   **Ce que j'ai prouvé à la place, et qui ferme précisément le trou trouvé par 1B** :
   `readDraftPlan` appelle `readDishes(payload.dishes)` — **le même lecteur** que le plan
   écrit, aucune valeur en dur (le défaut 1B était un `shoppingList: []` littéral sous un
   câblage vert). Et je l'ai vérifié **à la valeur, sur les octets réels des deux
   brouillons** : les 21 + 21 plats ressortent du lecteur avec leur `same_day` valide,
   et le cas qui passe (pas de clé ⇒ `null`, jamais une invention) tient.
   **Reste pour E : voir la modale à l'écran** une fois la fenêtre 08-20 entamée.
2. ⚠️ **Aucune fixture « un état par carte ».** Le master prompt demandait une fixture
   par état ; 2A n'en a pas construit, et les tests d'écran sont **de source**, pas de
   rendu. Je considère l'exigence **satisfaite autrement et mieux** — les quatre états
   sont rendus simultanément par un plan réel, dans les deux langues — mais la
   différence est nommée, pas gommée.
3. ⚠️ **La lane foyer saute toujours `keelGenerationModel()`**
   (`generate-household-meal-v1/index.ts:3299`, `:3419`) : ses deux appels omettent
   `meta.model` et retombent sur `GLOBAL_AI_MODEL`. **Nommé, pas réparé** (§3.1 du master
   prompt). Conséquence directe sur mes chiffres : **les 65,7 s et 91,6 s des runs foyer
   ne sont pas une latence du modèle KEEL**, et le 100 % de la lane foyer est le taux
   d'un modèle qui n'est pas celui que la lane croit appeler. Le 100 % de la lane
   **individuelle**, lui, est mesuré sur le bon modèle.
4. ⚠️ **Les 3 rouges vitest étrangers** restent rouges (§1).
5. ⚠️ **`SAME_DAY_MAX_MINUTES = 120` n'a jamais mordu en réel** (max observé : 40 min).
   La réserve de 2A s'inverse : le plafond est large, pas serré. Rien à faire.
6. ⚠️ **`meal_pdf_locale_test.ts`** reste un fichier **non suivi** d'une autre lane,
   modifié sur le disque par 2A (4 lignes `sameDay: null`), **dans aucun commit** — ni
   les siens ni le mien. Je ne l'ai pas touché.

---

## 8. Ce que j'ai touché, et ce que je n'ai pas touché

- **Un commit ajouté** : `540de504`, **deux chemins explicites**
  (`_shared/keel/meal_generation.ts`, `_shared/keel/meal_same_day_test.ts`), vérifiés par
  `git diff --cached --name-only` avant de valider. **`agent-gate: pass`**
  (JWT, scan de motifs, compte de tests 6116, suite Deno, typecheck front, `deno check`).
- **Jamais `git add -A`, jamais `git stash`.** Les deux fichiers étaient **propres** avant.
- **Aucun pack i18n commité** — et **aucune clé i18n ajoutée** par ma vérification.
  Les 5 clés `meals.same_day.*` de 2A sont bien présentes **5 dans `en.ts` et 5 dans
  `fr.ts`** (comptées sur le disque).
- **Aucun fichier étranger défait.** Toutes mes sondes temporaires (`zz_2b_probe_test.ts`,
  `zz2b.c8.int.test.ts`, deux `.json` de payload) ont été **supprimées** ; arbre revérifié.
- **Aucune commande à risque** : ni `db push/reset`, ni `functions deploy`, ni `secrets`,
  ni `config push`, ni `link`. **Aucun `supabase stop/start`.** **Aucun `docker restart`** —
  l'autorisation existait, la condition ne s'est pas présentée (§3.1).
- **Une écriture en base, assumée et nommée** : le plan `6620682c` (`intent: prepare_next`,
  foyer `l2p-owner`, 08-20 → 08-26). C'est le **cas nominal** (« deux plans vivants,
  courant + suivant », §3.1 du master prompt), c'est ce qui a permis de prouver que le
  compteur atteint la ligne, et c'est **le premier et le seul plan de la base qui porte
  `same_day`** — donc la fixture dont E aura besoin. Son effet de bord est en §7.1.
- **Serveur de dev** `frontend-a24` / 5194, lancé par `preview_start`, jamais par Bash.

---

## 9. 🟠 LE TROISIÈME ÉCART, CORRIGÉ — `a5f0305d`

**Demandé par le coordinateur après lecture de §5-(c)**, et il a renversé mon
arbitrage. Ce que j'avais nommé « défendable » ne l'était pas : je pesais le coût du
déplacement, pas ce que l'écart coûte au lecteur.

### Ce qui était livré, et ce qui l'est maintenant

```
AVANT                                  APRÈS
Greek yoghurt, berries and oats        Greek yoghurt, berries and oats
[Breakfast]                            [Breakfast]
│ Assemble on the plate — 10 min       │ Assemble on the plate — 10 min
Fast breakfast with a protein…         │ Spoon the yoghurt into four bowls.
Greek yoghurt 800 g                    │ Top with oats, strawberries and
rolled oats 200 g                      │ blueberries, then finish with honey.
…                                      Fast breakfast with a protein…
How: Spoon the yoghurt into four       Greek yoghurt 800 g
bowls. Top with oats…                  rolled oats 200 g
                          ▲                                     ▲
        le geste, tout en bas            le geste entier, en tête, une seule fois
```

### Les trois décisions

**① `method` monte dans le bandeau, et ne se rend PLUS en bas.** Le bloc du bas devient
`{!dish.same_day && dish.method && …}`. Relire la même phrase deux fois sur une carte est
exactement le bruit que le paragraphe du 14/08 refuse déjà — il fallait déplacer, pas
ajouter. **Mesuré après coup à l'écran : 0 occurrence résiduelle de « How: » sur 24 plats.**

**② Le libellé du jeton REMPLACE le couple « Comment » / « Au moment de servir », il ne
s'y ajoute pas.** C'est la question que le coordinateur a posée, et la réponse est que ce
couple était un **substitut** : faute de savoir ce que le plat demandait, la carte
**devinait** d'après `leftover` (« ce plat puise-t-il dans un lot ? ») pour ne pas titrer
« Comment » au-dessus d'un simple assemblage. `same_day.kind` est cette réponse
**déclarée au lieu d'être déduite**, et **plus fine** — elle sépare le réchauffage de
l'assemblage, ce que `leftover` ne pouvait pas faire (les deux puisent dans un lot).
Empiler les deux donnerait « À réchauffer — 8 min » puis « Au moment de servir : » :
deux en-têtes pour une phrase. **Le couple reste vivant sur le chemin de repli**, et
c'est la troisième décision.

**③ Le chemin de repli reste, et il n'est pas mort.** `same_day` est `null` sur tout plan
antérieur au 2026-08-17 — 157 en base, **5 encore vivants**. Leur retirer leur méthode
pour un bandeau qui n'existe pas les rendrait **moins lisibles qu'avant le lot**. La
règle du silence de 2A est donc conservée telle quelle, et elle a maintenant un cas de
test qui la tient.

### Le test — sur la VALEUR, comme demandé

`frontend/src/keel/components/dishCardSameDay.int.test.ts` (**neuf, 6 tests**) **monte
vraiment la carte** et lit le HTML : `renderToStaticMarkup` de `react-dom/server`, sans
DOM. C'est le piège que j'avais moi-même relevé sur le LOT 1 —
`shoppingList={draft.shoppingList}` restait **vert** avec un `[]` en dur.

⚠️ **Deux pièges rencontrés en l'écrivant, tous deux consignés :**
- Écrit d'abord en `.tsx` : **jamais collecté**. `vitest.config.ts` n'inclut que
  `src/**/*.int.test.ts` — « No test files found », un test vert qui ne tourne pas.
  Réécrit en `.ts` avec `createElement`, plutôt que de toucher une config partagée.
- `renderToStaticMarkup` **échappe l'apostrophe** en `&#x27;` : une méthode réaliste
  (« Take Friday's chicken out ») ne se trouve jamais telle quelle dans le HTML. Sans
  décodage, le test aurait échoué sur l'échappement en faisant croire à une méthode
  absente.

**Les deux cas qui passent** : sans `same_day`, la méthode garde sa place d'avant sous
« How: » et aucun bandeau n'est inventé ; une méthode vide ne laisse aucun paragraphe vide.

**Mutations — 3, toutes au rouge, restaurées depuis une copie de sauvegarde :**

| # | Mutation | Résultat |
|---|---|---|
| N1 | la méthode redevient inconditionnelle (**rendue deux fois**) | **rouge — 2 ✗** |
| N2 | le bandeau reperd son texte (l'étiquette seule) | **rouge — 3 ✗** |
| N3 | `break-words` retiré du paragraphe du modèle | **rouge — 1 ✗** |

### Une garde existante qui a dû être corrigée, et pourquoi

`dishSession.int.test.ts` recopiait le JSX **au caractère près** :

```ts
expect(card).toContain("{dish.same_day && <SameDayLine sameDay={dish.same_day} />}");
```

Elle est tombée sur un **ajout de prop qui ne retirait rien**. Un test qui casse quand on
**ajoute** fait relire le test au lieu du changement. Elle assère désormais le **montage**
(`"{dish.same_day && <SameDayLine"`), ce qu'elle voulait dire ; les trois littéraux
interdits (`active_minutes`, `total_minutes`, `totalMinutes`) **n'ont pas bougé d'un octet**.

### Les preuves, rejouées

| Épreuve | Résultat |
|---|---|
| `npx tsc -b --force` | **exit 0** |
| vitest complet | **1047 passés** (+6), **mêmes 3 rouges étrangers** |
| suite Deno | **3080 passés, 0 rouge** |
| `agent-gate` sur `a5f0305d` | **pass** (eslint compris) |

**Navigateur, plan réel `6620682c` (24 plats), les deux largeurs :**

| Mesure | 320 px | 1280 px |
|---|---|---|
| blocs de bandeau | 24 | 24 |
| **blocs portant le TEXTE de la méthode** | **24 / 24** | **24 / 24** |
| blocs qui débordent leur conteneur | **0** | **0** |
| `document.scrollWidth` vs `innerWidth` | 320 / 320 | 1280 / 1280 |
| « How: » résiduel | **0** | **0** |

**Les deux langues** : `Rien à préparer 2 · À réchauffer 3 · À assembler 8 · Cuisine
minute 11` = 24, **24 avec leur texte**, et **0** « Comment : » / « Au moment de
servir : » résiduel. Console : aucun message d'erreur, aucun throw i18n.
⚠️ Le **texte** de la méthode reste en anglais en interface française : il vient du
modèle (`content_locale` du plan), pas du pack. C'est le comportement attendu — seul le
**libellé** est traduit.

**Capture à scroll 0, 320 px** : le commentaire de préparation complet — libellé, durée,
et le geste en toutes lettres — se lit sous le titre, **avant** le pourquoi et **avant**
les ingrédients, dans un seul bloc à filet.

**Aucune clé i18n ajoutée** par ce correctif : le libellé du jeton sert d'en-tête, donc
aucun texte neuf n'était nécessaire. Les packs restent non commités et inchangés.
