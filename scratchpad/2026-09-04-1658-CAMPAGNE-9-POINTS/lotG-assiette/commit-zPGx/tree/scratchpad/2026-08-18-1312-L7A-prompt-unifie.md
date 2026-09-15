# L7-A — le prompt unifié : la cuisine, le midi dehors, et le nom d'un plat

**Date** 2026-08-18 13:12 · **Branche** `ff-001-quotidien-du-coach` · aucun push, aucun merge
**Conception** [2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md](2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md) §2.1, §2.2, §4
**Contrats lus** [L2-A §3](2026-08-18-1055-L2A-moyens-de-cuisson.md) · [L2-B §2.2](2026-08-18-1153-L2B-verification-moyens-de-cuisson.md) ·
[L3-A §1](2026-08-18-1115-L3A-dejeuner-dehors.md) · [L3-B](2026-08-18-1201-L3B-verification-dejeuner-dehors.md) ·
[LOT 3C](2026-08-17-2015-LOT3C-attribution-des-plats-dedies.md) · [L4-B §C5](2026-08-18-1215-L4B-verification-garde-tca.md)

**Commit** `9a238658` — 8 chemins, `agent-gate: pass`, sans contournement.

---

## 0. En trois lignes

Trois blocs, **deux bumps** (un par axe), **23 mutations sur 23 qui mordent**, la
fuite TCA de `generate-household-meal-v1:1882` fermée. Le point tranché en
ouvrant le lot : **tout ce qui décide d'une interdiction d'équipement passe par
`missingKitchenTools()`**, jamais par `hasKitchenTool()`.

| Épreuve | Résultat |
|---|---|
| `deno test _shared/keel/` (avec typecheck) | **3322 passés, 0 rouge** |
| `deno check` mes 3 modules + les 2 générateurs | exit 0 |
| `cd frontend && npx tsc -b --force` | **exit 0** ⚠️ après convergence d'une lane voisine, §7.1 |
| vitest complet | **6 rouges, 4 fichiers, tous étrangers** (§7.2) |
| Mutations | **23/23 mordent**, toutes restaurées (SHA256 revérifié) |
| `agent-gate` | **pass** (motifs interdits, compte de tests, suite Deno, typecheck, eslint) |
| Run modèle | **AUCUN** — c'est le travail du vérificateur (§8) |

---

## 1. Les trois blocs, et **où chacun est ancré par rapport à sa promesse**

> ### La leçon de 3C, appliquée trois fois
> Un champ réclamé au modèle a été mesuré à **zéro déclaration sur 291 plats**
> parce que la **promesse** vivait dans le message utilisateur pendant que la
> **clé** vivait dans le prompt système, sans rien pour les relier. Rapproché de
> sa promesse, avec le **nombre** et **l'échappatoire nommée** : onze.
> Chacun des trois blocs ci-dessous est posé contre la phrase qu'il complète ou
> qu'il corrige, et chacun porte les deux leviers quand il a un champ à
> réclamer.

### ① `== THIS KITCHEN ==` — enveloppe foyer, **groupe des verrous, après l'envie**

```
== THIS KITCHEN ==
This household does not have: an oven, a freezer, an air fryer, a pressure cooker.
Cook with what is left. Never write a preparation, a cooking session or a
day-of gesture that needs one of these, and never suggest buying one.
No oven: nothing roasted, baked, or finished under a grill. The batch comes out of a pan or a pot.
No freezer: nothing is frozen, and nothing is cooked to be kept longer than a fridge keeps it.
No microwave: reheating means a pan, so write that gesture and count the minutes it really takes.
```

**Son ancrage : l'envie de la semaine, qu'il doit battre.** Il est placé
**après** `WHAT THIS HOUSEHOLD ASKED FOR` et **avant** le régime et les règles
de maison. Ce n'est pas une préférence, c'est une **impossibilité physique** :
elle doit survivre à « on a envie d'un gratin » écrit trois lignes plus haut.
Elle ne prend en revanche **ni la dernière place ni celle du régime** — un four
absent change *comment on cuit*, jamais *ce qu'on a le droit de servir à
quelqu'un*, et démoter les deux verrous alimentaires pour un appareil est
exactement ce que l'en-tête de ce fichier interdit depuis `restrictionBlock`.

**Trois outils ont une conséquence écrite** (four, congélateur, micro-ondes,
§2.1 de la conception), **les quatre autres sont seulement nommés** : une
conséquence par outil coûterait sept lignes de prompt sur une lane qui expire à
quatre minutes, pour interdire des gestes que le modèle propose rarement.

⚠️ **La ligne du micro-ondes nomme ce qui reste**, et ce qui reste dépend du
four : « a pan or the oven » servi à un foyer qui vient de déclarer ne pas avoir
de four serait une consigne qui se contredit trois lignes plus haut. Mutation
M15.

### ② `== A MEAL EATEN OUT IS NOT AN ABSENCE ==` — **collé au bloc de présence**

```
== A MEAL EATEN OUT IS NOT AN ABSENCE ==
These meals are eaten somewhere else, and they are already taken out of
the numbers above:
- Tom: Tuesday lunch
Compose NOTHING there: no dish, no preparation, no line of shopping.
But these people are not away. They eat, elsewhere, and they are back at
the next meal here. So do NOT make another meal bigger to make up for it,
do NOT move that meal to another day, and do NOT mention it -- not in a
title, not in a method, not in a serving note.
```

**Son ancrage est la moitié du lot.** `presence.block` vient d'écrire, pour
**exactement ces cases**, « Tom not eating here -- cook for 1 instead of 2 ».
Sans un mot juste après, un midi dehors et une semaine de vacances sont **le
même fait** pour le modèle. Le test de position mesure **sur les octets** :
`indexOf(bloc dehors) === indexOf(presence.block) + presence.block.length + 2`.
(Un `split("\n\n")` ne marche pas : le bloc de présence porte lui-même une ligne
vide.)

⛔ **Aucun chiffre, et c'est une frontière, pas un oubli.** « Vise autour de
700 » appartient à **L8** et aux cinq portes de `energy_gate.ts`. Un kcal écrit
ici traverserait le prompt sans qu'aucune porte n'ait tourné — la clause C5,
violée à l'instant où la ligne s'écrit. Un test assert **qu'aucun chiffre**
(`/\d/`) n'existe dans ce bloc ; mutation M20 (« but aim for around 700 ») le
fait rougir.

**Source** : `resolveWindowPresence(...).eatingOut`, jamais `away.eatingOut` —
c'est `presenceStateFor` qui porte l'arbitrage entre la déclaration de la
personne et la marque du maître (L3-A §1.2).

### ③ `dishes[].name` — **TRONC**, la consigne collée au schéma

```
== EVERY DISH HAS TWO LINES: A NAME, AND A TITLE ==
  "title" … Keep writing it exactly as you already do.
  "name"  … Short -- six words at most. Appetising.
Write BOTH, on every single dish: as many names as you have dishes. Count them
before you answer.
Do NOT make the title pretty instead. A title that becomes "Sunshine of
Marrakesh" no longer says what is on the plate, and nobody can cook a name. …

== OUTPUT JSON SCHEMA ==
{ "dishes": [ { "name": "…", "title": "…", …
```

Les trois leviers de 3C, tous les trois présents :

1. **Adjacence** — la consigne est le bloc **immédiatement** avant
   `== OUTPUT JSON SCHEMA ==`, et `"name"` est la **première clé** du plat. Un
   test compte les en-têtes `== ` entre les deux et exige **zéro** (mutation M6 :
   on glisse `== A WEDGE ==` → rouge).
2. **Le nombre**, et il est comptable par le modèle : *« as many names as you
   have dishes. Count them before you answer. »* (M7).
3. **L'échappatoire nommée** : le modèle qui ne veut pas d'un second champ rend
   le **titre** joli — c'est-à-dire précisément le geste que §4 interdit (M8).

`dishes[].name` rejoint **`MEAL_TRANSLATABLE_FIELDS`** et n'entre **pas** dans
`MEAL_TOKEN_FIELDS` : un nom d'usage anglais sous un titre français serait la
seule ligne visible de la grille dans la mauvaise langue.

**Deux refus, aucun jugement de goût** : plus long que `DISH_NAME_MAX_CHARS`
(60 — la largeur d'une case de grille ; le plafond est en **caractères** parce
qu'un mot n'est pas une unité comptable d'une langue à l'autre), ou **identique
au titre** (égalité de chaîne normalisée casse+espaces — pas une ressemblance :
un matcher sur ce champ est exactement ce que l'en-tête interdit).
⛔ **Un nom refusé ne rejette jamais le plat** (M11).

---

## 2. Les deux bumps, et leur **justification de population**

> La règle du dépôt : « quelle population voit une consigne différente ».
> Deux axes concernés ⇒ **un bump chacun**, jamais deux pour la même chose.

| Axe | Avant → après | Population qui voit une consigne différente | Population byte-identique, et son test |
|---|---|---|---|
| **Tronc** `MEAL_PROMPT_VERSION` | `meal.en.v11_weighed_or_counted` → **`meal.en.v12_a_dish_has_a_name`** | **les quatre** — lane individuelle, foyer ordinaire, fusion, secondaire. La section et la clé vivent dans `MEAL_SYSTEM_PROMPT`. | **aucune**, et c'est le cas de v10 et de v11 mot pour mot. |
| **Foyer** `HOUSEHOLD_PROMPT_VERSION` | `v15_one_box_each_and_a_number` → **`v16_this_kitchen_and_a_meal_out`** | ① les foyers qui ont **déclaré** ce qu'ils n'ont pas ; ② les foyers où **quelqu'un mange dehors**. | ① « jamais demandé » **et** « tout coché » rendent le **même** `userSuffix` **et** le même `systemSuffix` — test d'égalité de chaîne. ② personne dehors ⇒ pas de bloc. La lane individuelle ne monte jamais cette enveloppe. |

**Pourquoi l'équipement est sur l'axe FOYER et pas sur le tronc** : le bloc n'est
assemblé que par `buildHouseholdPromptBlocks`. Brancher la lane individuelle
demanderait d'écrire dans `generate-meal-v1/index.ts`, **hors de mon périmètre**
et **modifié en ce moment même par une lane voisine** (§7.3). Le jour où
quelqu'un la branche, c'est le **tronc** qu'il bumpera. **Le trou est réel et
nommé au §6.1.**

⚠️ **Le `systemSuffix` du foyer ne bouge pas d'un octet** : les deux blocs neufs
sont des **contraintes**, ils ne réclament aucun champ. C'est ce qui rend
l'égalité de chaîne vérifiable sur les deux moitiés.

---

## 3. Les compteurs, et **leurs requêtes SQL prêtes à jouer**

### 3.1 Deux formes, et elles ne disent pas la même chose

| | Forme | Pourquoi |
|---|---|---|
| ③ `name` | **compteur à TROIS nombres** `{dishes, declared, kept, refused}` | c'est un **champ que le modèle remplit**. Sans les trois, « il n'a rien écrit » et « il a écrit quelque chose qu'on a refusé » rendent le même zéro — la confusion exacte qui a coûté le diagnostic de `for_member_id` le 2026-08-17. `declared === kept + refused` est une **propriété testée**, jamais une définition. |
| ① `kitchen` / ② `eating_out` | **traces**, pas compteurs | ces blocs **ne demandent aucun champ** : rien n'est déclaré, donc rien n'est validable. Elles disent ce que le prompt a **interdit** et **nommé**. |

⛔ **Il n'y a délibérément pas de « respecté » sur ① et ②.** Le calculer
demanderait de lire les titres et les méthodes pour décider si un plat passe au
four — c'est-à-dire **un matcher**, et ce dépôt en a mesuré **12 faux positifs
sur 12**. Le contrat L2-A §3.3 demandait `{demandé, respecté}` : **je ne livre
que la première moitié, et je dis pourquoi.**

⚠️ **Les trois sont rendus sur l'APERÇU** (`intent: "draft"`), par la **même
expression** que sur la ligne écrite (`promptTrace`, `meal.name_counts`). Sans
ça, toute vérification par brouillon est aveugle — c'est la moitié que 3C a dû
ajouter après coup.

### 3.2 Les requêtes

**① Combien de foyers ont répondu — et le chiffre qui justifie toute la garde.**

```sql
select count(*) filter (where practical_constraints ? 'kitchen_equipment') as declared,
       count(*) as total
  from public.student_goals;
-- attendu au 2026-08-18, AVANT que L6 monte la carte:  0 | 175
```

**② Combien de bouches portent un « dehors » en base.**

```sql
select count(*) filter (where exists (
         select 1 from jsonb_array_elements(coalesce(away_days, '[]'::jsonb)) e
          where e->>'kind' = 'eating_out')) as mouths_eating_out,
       count(*) as mouths
  from public.household_members;
-- attendu aujourd'hui: 0 | 63  (aucun écran n'écrit encore ce jeton — L6)
```

**③ Le nom, sur les DEUX lanes, sans passer par `generated_from`.**
C'est la requête qui compte, parce que `dishes[].name` est écrit par le payload
partagé — donc lisible sur la lane individuelle aussi, qui n'archive pas encore
le compteur (§6.1).

```sql
select plan_kind,
       count(*)                                   as plans,
       sum(jsonb_array_length(dishes))            as dishes,
       sum((select count(*)
              from jsonb_array_elements(dishes) d
             where nullif(btrim(coalesce(d->>'name','')), '') is not null)) as with_name,
       round(100.0 * sum((select count(*)
              from jsonb_array_elements(dishes) d
             where nullif(btrim(coalesce(d->>'name','')), '') is not null))
             / nullif(sum(jsonb_array_length(dishes)), 0), 1) as pct
  from public.student_generated_meals
 where retired_at is null
   and generated_from->>'prompt_version' like 'meal.en.v12%'
 group by plan_kind;
```

**③ bis — les trois nombres, et les deux traces, sur la lane foyer.**

```sql
select left(id::text, 8)                            as plan,
       starts_on,
       generated_from->'names'                      as names,       -- {dishes, declared, kept, refused}
       generated_from->'household'->'kitchen'       as kitchen,     -- {declared, missing}
       generated_from->'household'->'eating_out'    as eating_out,  -- {mouths, cells}
       generated_from->>'prompt_version'            as version
  from public.student_generated_meals
 where plan_kind = 'household' and retired_at is null
 order by created_at desc
 limit 20;
```

**④ Ce que le modèle a réellement rendu, avant toute validation** (c'est
l'archive qui a renversé le diagnostic de 3C — à ouvrir **avant** de conclure
qu'un champ n'est jamais écrit) :

```sql
select created_at,
       (raw_response::jsonb->'dishes') is not null                       as parsed,
       (select count(*) from jsonb_array_elements(raw_response::jsonb->'dishes') d
         where nullif(btrim(coalesce(d->>'name','')), '') is not null)   as names_written,
       jsonb_array_length(raw_response::jsonb->'dishes')                 as dishes_written
  from public.llm_raw_response_events
 where function_name = 'generate-household-meal-v1'
 order by created_at desc
 limit 20;
```

**⑤ La fuite fermée — sur le LOG, pas en base** (elle n'a jamais eu de ligne) :

```bash
docker logs --tail 400 supabase_edge_runtime_Sophia_2 2>&1 \
  | grep keel.household_meal.composition | tail -3
# DOIT porter residual_gaps_count et residual_gaps_max_band
# NE DOIT PLUS JAMAIS porter residual_gaps
```

---

## 4. ⛔ Le point `hasKitchenTool` — tranché, et pourquoi

**Le fait, mesuré par L2-B** : `hasKitchenTool()` rend `true | false | null`,
mais `if (!hasKitchenTool(eq, "oven"))` **compile sans un mot** (`deno check`
exit 0, `deno lint` muet) et traite « jamais demandé » comme « pas de four ».
Combiné au **0 sur 175**, écrire la forme naturelle retirerait le batch cooking
et la congélation à **100 % du parc** au premier plan.

**Deux sorties étaient sur la table. J'ai pris la première.**

| Sortie | Décision | Motif |
|---|---|---|
| **Passer par `missingKitchenTools()`** | ✅ **RETENUE** | Elle rend `[]` tant que rien n'est déclaré : **aucune direction dangereuse**. Ni `!`, ni oubli du troisième cas ne peuvent en tirer une interdiction que personne n'a énoncée. Elle **existe déjà** et est exportée — rien à construire. Et ce fichier ne lit **jamais** un outil isolément : il énumère ce qui manque. |
| **Changer le type de retour** (`"has" \| "lacks" \| "unknown"`) | ⛔ écartée | C'est le **vrai** correctif — il rendrait `=== false` non compilable et le `!` inoffensif — mais il **casse le contrat §3.2** que L2-A a écrit et **commité**, il oblige à réécrire les tests d'un module d'un lot voisin déjà rendu, et **il ne rend rien de plus ici**. Le sujet reste ouvert pour qui voudra armer le compilateur ; il n'est **pas** un prérequis de la consigne. |

`hasKitchenTool` **n'est pas importé** par `generate-household-meal-v1` ni par
`household_meal_generation.ts` — c'est écrit dans les deux fichiers, à côté de
l'import, pour que le prochain lecteur ne le rattrape pas.

**La mutation qui le prouve : M13.** On remplace
`missingKitchenTools(equipment)` par
`KITCHEN_TOOLS.filter((t) => !(equipment ?? []).includes(t))` — la forme
naturelle, celle qu'on écrit sans y penser — et le test **« jamais demandé :
prompt BYTE-IDENTIQUE »** rougit.

---

## 5. ⛔ La fuite TCA — fermée

`generate-household-meal-v1/index.ts` journalisait :

```ts
residual_gaps: resolution.residualGaps.map((g) => g.gapKcalPerDay),
```

— un **kcal/jour par bouche**, dans l'ordre des membres, à côté de `user_id`
**et** de `household_id`, alors que **ni `canShowEnergy` ni `energySafetyGates`
n'ont d'appelant dans cette fonction**. La clause **C5** du contrat TCA (« ni
réponse HTTP, ni ligne de base, ni prompt, ni **log nominatif**, ni écran sans
que la porte ait dit oui **avant** que le nombre soit calculé ») était violée à
l'instant où la ligne s'écrivait. Trouvée par L4-B, sur une ligne antérieure
(`9cd01739`).

**Correctif : on agrège, on ne supprime pas.**

```ts
residual_gaps_count: resolution.residualGaps.length,
residual_gaps_max_band: … "none" | "lt_200" | "gte_200",
```

`residual_gaps` est **l'instrumentation d'A3** : sans elle, la décision d'armer
le slot de dressage se prendrait à l'aveugle. Ce qu'elle sert à décider est « y
a-t-il des écarts, et sont-ils gros ? » — deux questions auxquelles un **compte**
et une **bande** répondent, et qui **ne désignent personne**. Les bandes sont
grossières exprès : `lt_200` / `gte_200` sépare « un reste d'arrondi » de « une
bouche que la casserole ne sert pas », qui est la seule décision qu'on prend
là-dessus.

⚠️ La formulation de la règle C5 **reste juste** ; ne pas « réparer » en retirant
la phrase du contrat.

---

## 6. Les décisions prises seul, et ce qui est **nommé, pas fait**

### 6.1 🔴 L'équipement n'atteint **PAS** la lane individuelle — le trou, avec son correctif

`generate-meal-v1/index.ts` ne verra jamais `THIS KITCHEN` tant que personne ne
l'y branche. Concrètement : **un plan individuel continue de proposer un gratin à
quelqu'un qui vient de déclarer ne pas avoir de four**, alors que la donnée est
sur **sa** ligne `student_goals`.

**Pourquoi je ne l'ai pas fait** : le fichier n'est pas dans mon périmètre
(§« ⛔ Ton périmètre »), et il est **modifié en ce moment** par la lane FF-042
(régime sur la lane solo) — le prendre serait la collision que la règle
anti-collision n°2 existe pour empêcher.

**Le geste, pour qui le prendra** — et il coûte **un bump du tronc**, pas de
l'enveloppe :

1. sortir `kitchenBlock()` de `household_meal_generation.ts` vers
   `meal_generation.ts` (il n'importe rien de l'enveloppe) ;
2. ajouter `kitchenEquipment: readonly KitchenTool[] | null` **REQUIS** à
   `buildMealPrompt`, ce qui fait remonter les **deux** appelants au compilateur ;
3. `generate-meal-v1` passe `readKitchenEquipment(pc)` ; la lane foyer passe
   `null` (elle a déjà son bloc, par `userSuffix`) — **sinon deux blocs
   `THIS KITCHEN` dans le même prompt**, exactement le piège que FF-042 vient
   de nommer pour `dietBlock` ;
4. bumper `MEAL_PROMPT_VERSION` (la population devient « tout le monde »).

### 6.2 🔴 Le compteur `names` n'est archivé **que par la lane foyer**

`generate-meal-v1` archive `same_day` et **pas** `names` : son fichier n'est pas
à moi. C'est la situation que le commentaire de `same_day` met lui-même en
garde (« un chiffre calculé sur la moitié de la population est un chiffre
faux »). **L'atténuation est réelle et suffit à mesurer** : `dishes[].name` est
écrit **même à `null`** par `mealDishesPayload`, qui est **partagé** — la
requête ③ du §3.2 compte donc les deux lanes. Ce qui manque côté solo est
`refused`, et lui seul.
**Le geste : une ligne**, `names: meal.name_counts,` à côté de
`same_day: meal.same_day_counts,` (deux occurrences : lignes ~2392 et le second
chemin d'écriture).

### 6.3 🔴 Le **rendu** du nom n'existe pas — c'est le front, et il n'est pas à moi

§4 demande le **nom en tête de carte et dans la grille**, le **titre juste
dessous**. Aujourd'hui le champ arrive en base et **personne ne le lit**. Ce
n'est **pas** une régression (`title` est rendu comme hier), mais c'est la
moitié visible du lot. `DishCard.tsx`, `PlanGrid.tsx`, `PlanDayBlock.tsx`
appartiennent au front, où **L5 tourne en parallèle**. Le lecteur doit être
**tolérant** : `name ?? title`, jamais `name` seul.

### 6.4 ⛔ La gamelle (`work_lunch`, transportable / bon froid) — **hors de ce lot**

L3-A §7.2 la laisse à L7. **Je ne l'ai pas prise, et voici pourquoi.**

- Elle demande un **appel RPC neuf** dans le générateur
  (`keel_household_work_lunch_for`), que personne n'appelle aujourd'hui, plus un
  **quatrième bloc** — sur une lane dont 3C a mesuré qu'elle **expire à 4
  minutes**. Mon mandat nomme trois blocs et me demande d'être économe.
- La population est **vide et le restera jusqu'à L6** : `work_lunch` est
  `null` partout (aucun écran n'appelle `setMemberWorkLunch`), et la **seule**
  porte d'écriture est la RPC. Contrairement à l'équipement et au « dehors »,
  qui ont chacun une seconde porte (la grille du plan, la carte), la gamelle n'a
  **aucun** chemin par lequel une donnée pourrait arriver avant L6.
- Le geste, quand ce sera son tour : lire la RPC à côté de
  `keel_household_habits_for` (l. ~1045), `parseWorkLunch`, et **deux**
  contraintes — *transportable* toujours, *bon froid* **seulement** si
  `microwave === false` ; `microwave: null` ⇒ **on n'invente pas « non »**.
  ⚠️ Ce bloc-là **réclamera** quelque chose au modèle : il aura besoin de son
  compteur à trois nombres.

### 6.5 Les arbitrages plus petits, tranchés seul

| Décision | Option écartée, et pourquoi |
|---|---|
| **Pas de nouveau champ pour ②** — je lis `input.presence.eatingOut` | Ajouter `eatingOut` à `HouseholdPromptInput` : `presence` est **déjà requis** et **porte l'arbitrage** ; un second champ serait une seconde idée de « qui est dehors », et 43 sites d'appel à modifier pour rien. |
| **`kitchenEquipment` REQUIS et nullable** | Un `?:` : c'est la cicatrice `budgetBand`/`safetyBand`, mot pour mot — un appelant l'oublie, la ligne de consigne disparaît, rien n'échoue. Le compilateur a effectivement recensé **43 + 3 + 1** sites. |
| **La conversion « ce qui manque » se fait DANS le module qui écrit le bloc** | La faire chez l'appelant : la trace `kitchenMissing` viendrait d'un **second** appel à `missingKitchenTools`, et c'est celle qu'on regarde le moins qui garderait l'ancienne. Une expression, deux destinations — patron `dishOwnersTrace`. |
| **Le compteur ② compte les LIGNES ÉCRITES, pas la source** | Compter `presence.eatingOut.length` : une bouche qui mange dehors mais que `members` ne porte pas (prise de main, absence totale) n'est **pas nommée** par le bloc. Si la trace la comptait, « le modèle a ignoré la consigne » et « la consigne ne la nommait pas » se liraient pareil — le zéro ambigu de 3C. Mutation M22. |
| **Le refus « nom = titre » est une ÉGALITÉ de chaîne normalisée** | Une ressemblance (préfixe, distance) : ce serait un matcher sur le seul champ dont l'en-tête dit qu'aucune garde ne s'y accroche. |
| **Le plafond du nom est en CARACTÈRES (60)** | « six mots » en code : un mot n'est pas une unité comptable d'une langue à l'autre (« pomme de terre » = 3, `Kartoffelsalat` = 1). 60 est la largeur d'une case de grille de semaine, l'endroit le plus étroit où ce texte est rendu. Le prompt, lui, dit « six words at most » — c'est au modèle qu'on parle. |
| **`name` est ORDONNÉ dans le prompt, FACULTATIF au contrat** | Écrire « may carry » : mesuré comme une permission qu'on décline (zéro sur douze runs), et un test de ce fichier interdit désormais la tournure. Le facultatif vit dans le **parseur** et à l'**écran**, pas dans la consigne. |

---

## 7. Ce qui est rouge, et à qui ça appartient

### 7.1 `tsc -b --force` — vert **maintenant**, rouge il y a six minutes

À **13:03**, `frontend/src/keel/pages/HouseholdPage.tsx` rendait deux erreurs
(`mouthToPersist` introuvable, `activityLevel` en trop sur une signature) : la
lane **L5** écrivait dans le fichier à la seconde même (`mtime 13:03`). À
**13:09** elle avait convergé, `tsc -b --force` est passé **exit 0**, et le
commit est passé dans la foulée, **gate complet, sans contournement**.
**Aucune de ces erreurs n'était dans un chemin de ce lot**, et je n'ai rien
réparé. C'est très exactement la barrière du §2 bis de l'orchestration.

⚠️ **Et à 13:22, ROUGE À NOUVEAU**, toujours le même fichier :
`HouseholdPage.tsx(920)` — `MouthFormDialogProps` a gagné `openBlock` /
`onOpenBlock` du côté du composant, pas encore du côté de l'appelant. **L5
oscille**, et ce sera l'état que L7-B trouvera. **Ce n'est pas ce lot** : mes
deux commits sont passés `agent-gate` complet, `tsc -b --force` **exit 0** aux
deux instants où ils ont été faits, et **aucun fichier du front n'est touché
par L7-A**. Attendre la convergence de L5 avant d'accuser quoi que ce soit.

⚠️ **Toujours `--force`** : l'incrémental invente des erreurs entre lanes
concurrentes (mesuré par L2-B : une erreur pointée sur une accolade fermante).

### 7.2 vitest — **6 rouges, 4 fichiers, tous étrangers**

| Fichier | Rouges | Propriétaire |
|---|---|---|
| `src/edge/coverage-guard.int.test.ts` | 2 | **préexistant**, annoncé au passage de main |
| `src/keel/copy/planRefusals.int.test.ts` | 1 | **préexistant**, annoncé |
| `src/keel/i18n/parity.int.test.ts` | 2 | **L5** — `household.mouth.block_join` (espace de bord + recopie de l'anglais) |
| `src/keel/i18n/pageSeams.int.test.ts` | 1 | **L5** — même lane |

**Ce lot ne touche aucun fichier du frontend**, aucun pack i18n, aucune page.
Les trois rouges neufs sont apparus **pendant** mon lot, dans les clés du
pop-up « une bouche ». **Consignés, pas réparés.**

### 7.3 ⚠️ Mon commit emporte des hunks étrangers — dit plutôt que caché

`meal_generation.ts` (**+48**) et `generate-household-meal-v1/index.ts`
(**+18**) portaient déjà, **non commités**, le champ `dietBlock` d'une lane
**FF-042** en cours (le régime sur la lane individuelle). Un
`git commit -- <chemins>` prend **l'arbre de travail** : il n'existe aucun moyen
de commiter mes lignes sans les siennes sans `git add -p` (interactif, interdit
ici) ni `git stash` (interdit sur un dépôt partagé — cicatrice à 200+ fichiers).

- **Ce qui est commité** : les deux moitiés de FF-042 qui vivaient dans **mes**
  fichiers, sous mon message, qui les nomme.
- **Ce qui ne l'est PAS et reste sur le disque** : sa moitié visible,
  `supabase/functions/generate-meal-v1/index.ts` (+112 −12).
- **La copie** :
  `scratchpad/2026-08-18-1245-L7A-hunks-etrangers-FF042-diet.patch`.

⚠️ **Et un fichier NON SUIVI que j'ai dû modifier** :
`supabase/functions/_shared/keel/meal_pdf_locale_test.ts` est **untracked**
(fichier neuf d'une autre lane, jamais commité). Son constructeur de
`GeneratedDish` ne compilait plus sans `name: null` — je l'ai ajouté **sur le
disque** et je **ne l'ai pas commité** (commiter un fichier neuf étranger serait
pire). Qui commitera ce fichier commitera la ligne avec.

**Jamais `git add -A`, jamais `git stash`, jamais `git add` tout court, aucune
commande à risque, aucune réparation d'historique, aucune migration.**

---

## 8. Les mutations — **23 sur 23 mordent**

Harnais : **`scratchpad/mutate_l7a.py`**, commité **exprès** — les lots
précédents le laissaient hors dépôt et leurs vérificateurs ont dû le réécrire.
Chaque mutation restaure le fichier dans un `finally`, avec **SHA256 revérifié**
après restauration. `python3 scratchpad/mutate_l7a.py` rejoue les 23 ;
`python3 scratchpad/mutate_l7a.py M13 M19 M20` n'en rejoue que trois.

| # | Ce qu'on casse | Verdict |
|---|---|---|
| M1 | le refus « nom trop long » est retiré | mord |
| M2 | le refus « nom = titre » est retiré | mord |
| M3 | `declared` ne compte que les gardés | mord |
| M4 | `refused` cloué à zéro | mord |
| M5 | **le 7e tableau parallèle ne suit plus le `splice`** | mord ⚠️ voir ci-dessous |
| M6 | un bloc s'intercale entre la promesse et le schéma | mord |
| M7 | le **nombre** attendu disparaît de la consigne | mord |
| M8 | l'**échappatoire** n'est plus nommée | mord |
| M9 | `dishes[].name` sort de la liste traduisible | mord |
| M10 | le payload n'écrit le nom que s'il existe | mord |
| M11 | un nom refusé **jette** le plat | mord |
| M12 | le tronc ne bumpe pas | mord |
| **M13** | **`equipment ?? []` au lieu de `missingKitchenTools()`** | **mord** |
| M14 | l'ordre des outils suit la déclaration, pas la liste fermée | mord |
| M15 | la ligne du micro-ondes nomme un four absent | mord |
| M16 | la cuisine passe **en dernier**, après les règles de maison | mord |
| M17 | la trace `kitchenMissing` est rendue vide | mord |
| M18 | « dehors » retombe sur l'absence : le bloc n'est jamais servi | mord |
| M19 | le bloc « dehors » est **séparé** de la présence | mord |
| M20 | **un chiffre entre dans le bloc « dehors »** | mord |
| M21 | une bouche hors du prompt est nommée par son id | mord |
| M22 | le compteur ② compte la source, pas les lignes écrites | mord |
| M23 | l'enveloppe foyer ne bumpe pas | mord |

### ⚠️ M5 et M22 — deux gardes qui NE mordaient PAS, et ce qui les a durcies

**M5 — une ceinture armée sur un coffre vide.** Mon premier test posait le nom
sur un **troisième déjeuner**. Or un plat refusé par le plafond sort par **deux**
portes : le `continue` (quand **aucun** plat gardé n'est plus jetable que lui) et
le `splice` (quand un plat déjà gardé lui cède la place). **Seule la seconde
touche les tableaux parallèles.** Le troisième déjeuner est le plat le plus
jetable de tous : il sortait par le `continue`, le `splice` n'était jamais
exercé, et retirer `keptNameFacts.splice` laissait le test **vert**. Mesuré, puis
corrigé : le nom est maintenant sur le **second** déjeuner — gardé, puis évincé
par le dîner — et le test **exige** que le dîner soit présent, faute de quoi il
annonce lui-même qu'il ne mesure plus rien.
⚠️ **La même faiblesse existe probablement dans le test jumeau du LOT 3C**
(`un plat ÉVINCÉ par le plafond ne compte dans AUCUN des quatre`) : il utilise la
même mise en scène. **Signalé, pas touché** — ce n'est pas mon lot.

**M22 — un retour anticipé qui masquait le compteur.** Le test « une bouche que
le prompt ne nomme pas » sortait par `lines.length === 0`, donc n'atteignait
jamais l'expression du compteur. Durci par un **cas mixte** : une bouche nommée
**et** une bouche ignorée dans le même prompt.

---

## 9. Ce que le vérificateur (L7-B) devrait regarder en premier

1. **Un run réel sur la lane foyer**, avec les **trois** nombres du nom et les
   deux traces, lus **sur l'aperçu** (`intent: "draft"`, aucune écriture).
   ⚠️ **Redémarrer le runtime edge AVANT** (`docker restart
   supabase_edge_runtime_Sophia_2`) après avoir sondé qu'aucune autre lane ne
   génère : ce lot modifie des `_shared`, et le runtime sert des modules
   **périmés**. Et jouer `scripts/local_extend_kong_functions_timeout.sh`.
2. **Fabriquer les deux populations**, parce qu'elles sont **vides** :
   `update student_goals set practical_constraints = practical_constraints ||
   '{"kitchen_equipment":["stovetop","microwave"]}'::jsonb where user_id = …`,
   et `keel_household_set_member_work_lunch(<adulte>, '{"at_work":true,"mode":"outside"}')`
   pour poser cinq midis `eating_out`. **Sans ça, le run mesure le prompt de
   v15** — et un lot désarmé ressemble trait pour trait à un lot qui marche.
3. **Le taux de noms**, requête ③ du §3.2. Si le modèle rend **zéro**, la suite
   n'est PAS « resserrer au hasard » : ouvrir `llm_raw_response_events`
   (requête ④) pour savoir s'il n'écrit rien ou s'il écrit quelque chose qu'on
   refuse. **C'est la leçon entière de 3C.**
4. **Rejouer au moins 5 mutations**, dont **M13** (la forme naturelle de
   l'équipement), **M19** (le bloc décollé de la présence) et **M20** (le
   chiffre dans le bloc « dehors »).
5. **Vérifier la fuite fermée** sur le log réel (§3.2 ⑤) : le tag
   `keel.household_meal.composition` ne doit **plus jamais** porter
   `residual_gaps`.
6. **Le front** : rien n'est rendu (§6.3). Il n'y a **aucune régression** à
   chercher — le titre s'affiche comme hier — mais la moitié visible du ③
   n'existe pas. Ne pas la mesurer comme un défaut de ce lot ; la mesurer comme
   un lot qui reste.
