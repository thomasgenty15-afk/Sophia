# Rapport LOT 3B — vérification de la séparation par personne (P3)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 19:12 · **Aucun `push`, aucun merge.**
**Master prompt** `scratchpad/2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md`, §LOT 3 / agent 3B.
**Rapport vérifié** `scratchpad/2026-08-17-1825-LOT3A-separation-par-personne.md`.
**Commits vérifiés** `64f48e6a`, `6b08bb7f`, `33b28320`. Le LOT 2 s'arrête à `a5f0305d`.
**Commit ajouté par cette vérification** `8dc1e4c7` (défaut trouvé **à l'écran**, §6).

> **Verdict : LOT 3 vert, après un correctif.**
> Le rapport de 3A est exact sur tout ce que j'ai rejoué — les 10 mutations que j'ai
> reprises mordent, le diff ne touche aucun fichier serveur, et **ses trois défauts
> structurels sont réels** : je les ai chacun prouvés en remettant le code d'avant et en
> voyant le rouge, deux d'entre eux **à l'écran** et pas seulement au test.
>
> **Le plat dédié : le modèle n'en fabrique aucun.** Trois runs réels, 44 plats, deux
> populations de prompt (le singulier et le pluriel), **zéro attribution, zéro
> `for_member_id` même refusé** — le modèle n'écrit jamais la clé. Le compteur
> `dish_owners = {asked: 21, attributed: 0}` existait déjà en base et personne ne l'avait
> lu. La séparation est donc prouvée à l'écran sur une **fixture fabriquée**, dite comme
> telle, et le trou est côté **prompt**, pas côté lot.
>
> **Le défaut que j'ai trouvé n'était visible que sur un vrai plat dédié** : au moment
> séparé, les DEUX voies récitaient les MÊMES bouches — « pour la table » nommait Paul qui
> mange son plat deux centimètres plus bas, et « pour Paul » nommait Lea, Tom et Nina qui
> n'y touchent pas. Le moment demandait de servir chacun **deux fois**, sur la seule case
> que ce lot existe pour rendre lisible. C'est la ligne C4, dans le lot qui l'a corrigée
> ailleurs.

| Épreuve | État |
|---|---|
| Statique — diff, `tsc -b --force`, vitest complet, rouges étrangers | ✅ rejoué |
| Les **3 défauts structurels** de 3A, chacun par une épreuve qui échoue sans le correctif | ✅ prouvés (2 aussi à l'écran) |
| Mutations — 10 des 16, dont les 5 demandées nommément | ✅ 10/10 au rouge, restaurées |
| **RUN RÉEL** — 3 runs, 2 foyers, les deux lignes de forme | ✅ fait · **attribution 0/44** |
| `dish_owners = {asked, attributed}` mesuré | ✅ **{21, 0}** en base + 0/19 et 0/4 en brouillon |
| Navigateur — deux voies, bandeaux jour J, 320 **et** 1280 px, deux langues | ✅ sur fixture fabriquée |
| Navigateur — secondaire : pas de décomposition | ✅ prouvé (0 voie, 0 part, 0 segmenté) |
| C4 — en SQL **et** à l'écran | ✅ prouvé · **2 violations trouvées, hors lot** (§7) |
| C8 — l'aperçu rend la même séparation | ✅ prouvé **sur les octets réels** d'un brouillon serveur |
| **Défaut trouvé et corrigé** | 🟠 1 — chaque bouche servie deux fois (§6) |
| **Défauts trouvés et CONSIGNÉS, non corrigés** | 🔴 2 — les listes plates du secondaire, la grille de semaine (§7) |

---

## 1. Statique — rejoué, pas cru

### 1.1 Aucun fichier serveur

```
$ git diff --name-only a5f0305d..33b28320 | grep -c '_shared/'    → 0
$ git diff --name-only a5f0305d..33b28320 | grep -c '^supabase/'  → 0
```

**15 chemins**, tous sous `frontend/src/keel/`. (3A écrit « 16 » : c'est 16 *entrées* de
commit, `planByPersonModel.int.test.ts` figurant dans deux d'entre eux. Aucun écart réel.)
La suite Deno est donc inchangée **par construction** ; `agent-gate` la fait tourner à
chaque commit — **3080 passés, 0 rouge** sur le mien.

### 1.2 Typecheck et suite

| Épreuve | Avant mon correctif | Après |
|---|---|---|
| `cd frontend && npx tsc -b --force` | **exit 0** | **exit 0** |
| `npx vitest --config vitest.config.ts run` | **1091 passés**, 20 skipped, **3 rouges** | **1096 passés** (+5), **mêmes 3 rouges** |
| `agent-gate` (`AGENT_GATE_STAGED_ONLY=1`) sur `8dc1e4c7` | — | **pass** |

**Les 3 rouges sont exactement les étrangers connus**, nommés et comptés — pas de
quatrième : `src/edge/coverage-guard.int.test.ts` (×2 : liste des edge functions, liste
des triggers) et `src/keel/copy/planRefusals.int.test.ts` (×1 : 7 clés
`household.error.*` non atteignables). Antériorité déjà prouvée par 1B (§1.4, par
reconstruction « le disque d'aujourd'hui moins le lot ») et reconfirmée par 2B ; le
compte de 3A (1091) est exact au test près.

### 1.3 Les fichiers du lot étaient propres, et le sont restés

Vérifié avant les mutations, après chacune, et à la fin : `git status --porcelain` vide
sur les 15 chemins. Les restaurations se sont toutes faites depuis une **copie de
sauvegarde**, jamais par `git checkout --` (cicatrice de 2B, qui avait effacé son propre
correctif avec la mutation). Contrôle au SHA256 sur les 8 fichiers touchés : identiques.

---

## 2. Les mutations — 10 rejouées, dont les 5 demandées nommément

Chacune appliquée sur l'arbre propre, suite du lot lancée (6 fichiers, 104 tests),
restaurée depuis la copie.

| # | Mutation | Cible | Résultat |
|---|---|---|---|
| **A** | `readDishes` jette `member_id` | `api/mealGeneration.ts` | **rouge — 4 ✗** |
| **B** | `groupByDay` identifie un plat sans son attribution | `lib/mealBuilderModel.ts` | **rouge — 2 ✗** |
| **C** | `readDraftPlan` jette les parts du brouillon | `api/planDraft.ts` | **rouge — 1 ✗** |
| **N8** | `MealBuilder` perd la garde `isOwner` | `components/MealBuilder.tsx` | **rouge — 1 ✗** |
| **N13** | le mot `goal` entre dans la vue | `lib/planDaySlots.ts` | **rouge — 1 ✗** |
| **N6** | le prénom est lu dans le **TITRE** (matcher maison) | `lib/planDaySlots.ts` | **rouge — 10 ✗** |
| **N7** | le maillon `PlanResult → PlanDayBlock` (`portions={[]}`) | `plan/PlanResult.tsx` | **rouge — 1 ✗** |
| **S** | la jointure `shareFor` est désarmée (`uses: []`) | `lib/planDaySlots.ts` | **rouge — 5 ✗** |
| **D** | C4 : le plat de la table reste dans son assiette | `lib/planByPersonModel.ts` | **rouge — 2 ✗** |
| **E** | C4 mord sur **tous** les moments | `lib/planByPersonModel.ts` | **rouge — 1 ✗** (le cas passant) |

**N7 est celle que 3A dit n'avoir pas mordu du premier coup**, et son correctif tient :
c'est bien le test qui monte `PlanResult` (et non `PlanDayBlock`) qui tombe.
**N6 tombe sur dix tests** parce que la fixture du fichier d'écran porte deux titres
**identiques** dont aucun ne contient de prénom : un matcher n'y trouve rien et perd la
voie entière. La garde anti-matcher est réelle des deux côtés.
**D et E vont par paire** et c'est ce qui compte : D casse la règle, E casse **le cas qui
passe** (le plat de la table reste le sien aux moments où elle n'a rien à elle).

---

## 3. ⛔ LES TROIS DÉFAUTS STRUCTURELS DE 3A — chacun prouvé par une épreuve qui échoue sans le correctif

C'était la demande explicite. Aucun n'est cru sur parole : pour chacun j'ai **remis le
code d'avant** et mesuré ce qui se casse.

### 3.1 `readDishes` jetait `member_id` — la famille « écrit en base, jeté à la lecture »

Le moteur écrit `member_id` sur **chaque** plat, **même à `null`**
(`meal_generation.ts:3812`) ; le lecteur du front ne le relisait pas. **Mutation A**
(`member_id: null` en dur) ⇒ **4 tests rouges**, dont « ⛔ `member_id` est LU — le champ
existait en base et se perdait » et « ⛔ le titre ne décide de RIEN ». C'est bien la
famille du `shoppingList: []` de 1B : serveur correct, lecteur muet, câblage vert.

### 3.2 `groupByDay` jetait le plat dédié homonyme — **prouvé À L'ÉCRAN**

La déduplication des plats de lot identifiait un plat par `titre|moment`. Deux plats de
**même titre** au même moment n'en faisaient qu'un — c'est-à-dire le cas naturel d'un plat
dédié, puisque la divergence est dans la **part**, pas dans le nom.

**Mutation B au test** ⇒ 2 rouges. **Et mutation B au navigateur**, sur la fixture qui
porte un plat dédié au titre identique à celui de la table (jeudi, dîner) :

| | voies `data-member-id` | « FOR PAUL » | cartes portant le titre partagé |
|---|---|---|---|
| avec le correctif | **2** | **2** | **2** (une par voie) |
| identité d'avant le lot | **1** | **1** | **1** — *le plat de Paul a disparu de l'écran* |

Le foyer perdait une assiette sur la seule case où deux bouches ne mangent pas la même
chose. Restauré, remesuré : 2/2/2.

### 3.3 `readDraftPlan` jetait les `member_portions` — C8

Le serveur **rend** `member_portions` sur `intent: "draft"` alors qu'il n'en **écrit**
aucune ; le lecteur du brouillon ne la lisait pas. **Mutation C** (`memberPortions: []`)
⇒ **1 rouge**, et c'est le test qui porte exactement la promesse (« l'APERÇU porte ses
parts et ses attributions »). Preuve complémentaire sur octets réels en §5.3.

---

## 4. 🔴 LE PLAT DÉDIÉ — TROIS RUNS RÉELS, ZÉRO ATTRIBUTION

### 4.1 Le poste, et pourquoi je n'ai RIEN redémarré

Sondé avant d'agir : `docker logs --tail 40 --timestamps supabase_edge_runtime_Sophia_2`
ne montrait que des **crons réentrants** (`process-llm-retry-jobs`,
`trigger-topic-compaction`, `process-checkins`, `trigger-synthesizer-batch`) — aucune
lane voisine en génération. Et **ce lot n'a modifié aucun `_shared/`** : un redémarrage
n'aurait rien rafraîchi. L'autorisation existait, la condition ne s'est pas présentée.
Runtime vivant (200 sur les runs, PostgREST OK).
`./scripts/local_extend_kong_functions_timeout.sh` joué avant les runs
(`read_timeout=600000`). Les quatre comptes visés répondent `OK` à `signInWithPassword`
avec `1234567` — **mesuré avant de viser quoi que ce soit**.

### 4.2 Le fait mesuré par 3A, reconfirmé

```sql
select count(*) from student_generated_meals m,
  lateral jsonb_array_elements(coalesce(m.dishes,'[]'::jsonb)) d
where d->>'member_id' is not null;              -- → 0, sur TOUS les plans
```

Exact. Sur les **six plans vivants**, un seul (`6620682c`) écrit la clé — 24 plats, tous
à `null`.

### 4.3 ⚠️ LE COMPTEUR EXISTAIT DÉJÀ, ET 3A NE L'AVAIT PAS LU

3A écrit : *« `dish_owners` n'a pas été mesuré […] aucun plan de la base n'a
d'attribution, donc le compteur n'a rien à dire »*. **C'est faux, et c'est le chiffre le
plus important du lot.** Il est archivé sur le plan réel écrit par 2B :

```
6620682c → generated_from.household.dish_owners = {"asked": 21, "attributed": 0}
           cooking = {served: one_session, computed: one_session, capped: false,
                      diverging: [30730edf…], dish_bearing: [30730edf…]}
```

Le prompt a bien servi le bloc `for_member_id` en nommant Paul, il réclamait jusqu'à
**21** plats dédiés, et le modèle en a rendu **zéro**. Le compteur a fait exactement ce
pour quoi il a été écrit ; il fallait le regarder.

### 4.4 Les trois runs, et leurs octets

| Run | Foyer | Ligne de forme servie | Porteurs | Plats | **Attribués** | `for_member_id` refusés |
|---|---|---|---|---|---|---|
| ① écrit (2B, relu) | Vidal `4123e479` | `one_session` singulier | 1 (Paul) | 21 (budget) / 24 | **0** | 0 |
| ② brouillon (moi) | **Auber** `42cf7a53` | `one_session` singulier | 1 (Theo) | 19 | **0** | 0 |
| ③ brouillon (moi) | **Bramble** `80e9af4c` | `one_session` **PLURIEL** | **2** (Nina, Zoe) | 4 | **0** | 0 |

Trace serveur du run ② (`keel.household_meal.cooking_shape`), lue dans les logs :

```
shape=one_session  computed=one_session  asked_shape=null  capped=false
time_allows_second_dish=true  diverging=[e36f4e0b]  dish_bearing=[e36f4e0b]   ← Theo
```

**Total : 44 plats, 0 attribué, 0 refusé.** Le zéro « refusé » est le fait décisif : le
modèle ne se trompe pas d'identifiant, **il n'écrit jamais la clé**. Les deux formulations
(le singulier `dishOwnerSchemaBlock` et le pluriel `ONE_SESSION_LINES_MANY`) donnent le
même résultat.

**Les deux runs de brouillon n'ont RIEN écrit** (`intent: "draft"`, branche `isDraft`,
`index.ts:3792-3811`). Aucun compte QA n'a été avancé.

⚠️ **Un refus rencontré et consigné** : un `draft` sur Bramble en fenêtre
`until_sunday` rend **409 `plan_overlaps_existing`**. Un aperçu n'écrit rien mais se fait
quand même refuser sur le chevauchement de fenêtre — comportement antérieur au lot, à
savoir pour E qui devra choisir ses fenêtres.

⚠️ **La lane foyer saute toujours `keelGenerationModel()`** (`index.ts:3299`, `:3419`) :
mes deux brouillons foyer sont composés par `GLOBAL_AI_MODEL`. **Le 0/44 se lit avec ça en
tête** — nommé, pas touché.

### 4.5 Ce que ça veut dire, et à qui c'est

Le LOT 3 est **armé et vérifié**, et il n'a **rien à afficher en production** tant que le
prompt ne fait pas écrire `for_member_id`. C'est le symétrique exact de `same_day`, qui a
mesuré 100 % : ici la consigne est servie et **ignorée**. Le trou est côté prompt
(`dishOwnerSchemaBlock`, `household_meal_generation.ts:610-622`), c'est-à-dire dans
l'enveloppe foyer, hors du périmètre front de ce lot.

**Piste, non appliquée** (elle demanderait un bump de `HOUSEHOLD_PROMPT_VERSION`, donc un
lot serveur) : le bloc dit *« Set it ONLY on a dish you cooked for one named person »* —
une permission (« may carry one more key »), là où la ligne de forme, elle, **promet** un
plat (« at EVERY meal they eat here they get a dish of their OWN »). Les deux ne se
rejoignent nulle part : rien ne dit au modèle que le plat promis par la ligne de forme
**est** celui qui doit porter la clé. Le même défaut que `none`/`assemble` de 2B — la
définition est juste, le lien manque.

---

## 5. LA FIXTURE — **FABRIQUÉE, PAS UN RUN.** Dit franchement.

Le modèle n'attribuant rien, la séparation ne pouvait être vue nulle part. J'ai donc
**écrit l'attribution à la main, en jsonb**, comme le master prompt l'autorise et demande
de le nommer.

### 5.1 Ce que j'ai écrit, exactement

| Plan | Foyer / compte | Jour · moment | Titre du plat ajouté | `member_id` |
|---|---|---|---|---|
| `2ab8a495` (**courant**, 08-17→08-19) | Vidal / `l2p-owner` | `mon` · lunch | « Chicken and extra greens plate » (distinct) | Paul `30730edf` |
| `6620682c` (**suivant**, 08-20→08-26) | Vidal / `l2p-owner` | `tue` · lunch | « Grilled chicken with extra greens » (distinct) | Paul `30730edf` |
| `6620682c` | idem | `thu` · dinner | **titre IDENTIQUE à celui de la table** | Paul `30730edf` |

- **Paul est le porteur que le prompt a réellement nommé** sur ce plan (`dish_bearing`),
  pas un choix de confort.
- Chaque plat ajouté respecte `mealDishesPayload` clé pour clé (`day, slot, title,
  method, why, ingredients[{term,unit,state,amount,quantity,grams_raw,in_pantry}],
  uses[{preparation_id,servings}], honours_belief_keys, same_day, member_id`) ; sur
  `6620682c` ils portent un `same_day` valide, donc **le taux `declared/dishes` de 2B
  reste 100 %** (26/26).
- **Aucune calorie, aucun chiffre de corps** : `why` et `method` sont de la cuisine.
- Le troisième est délibérément **homonyme du plat de la table** : c'est le piège que
  `groupByDay` jetait (§3.2), et c'est ce qui a permis de le prouver à l'écran.

Comptes après écriture : `2ab8a495` 9 → **10 plats, 1 attribué** ; `6620682c` 24 → **26
plats, 2 attribués**.

**Retour en arrière** : les colonnes `dishes` d'origine sont sauvegardées telles quelles
dans `scratchpad/backup_dishes_2ab8a495.json` et
`scratchpad/backup_dishes_6620682c.json` — un `update … set dishes = '<contenu>'::jsonb
where id = …` les remet à l'octet près. **Je les laisse en place pour E** : c'est la seule
fixture de la base qui porte une attribution, et il en aura besoin.

### 5.2 C4 en SQL sur la fixture

```sql
-- « JAMAIS DEUX » : deux plats au même (jour, moment) pour la MÊME bouche
select left(m.id::text,8), d->>'day', d->>'slot',
       coalesce(d->>'member_id','(table)') as mouth, count(*)
from student_generated_meals m, lateral jsonb_array_elements(m.dishes) d
where m.retired_at is null and m.ends_on >= current_date
group by 1,2,3,4 having count(*) > 1;
→ 6620682c | fri | dinner | (table) | 2      ← ANTÉRIEUR, voir §7.3

-- « JAMAIS ZÉRO » : un moment qui porte un plat dédié SANS plat de table
select left(m.id::text,8), d->>'day', d->>'slot',
       count(*) filter (where d->>'member_id' is not null) as dedies,
       count(*) filter (where d->>'member_id' is null)     as tablee
from student_generated_meals m, lateral jsonb_array_elements(m.dishes) d
where m.retired_at is null and m.ends_on >= current_date
group by 1,2,3 having count(*) filter (where d->>'member_id' is not null) > 0;
→ 2ab8a495|mon|lunch  1|1     6620682c|thu|dinner 1|1     6620682c|tue|lunch 1|1
```

Les **trois** moments séparés ont leur plat de table à côté : aucune bouche ne se retrouve
à zéro. ✅

### 5.3 C8 — l'aperçu, sur les **octets réels** d'un brouillon serveur

Le modèle n'attribuant rien, aucun aperçu réel ne peut montrer la séparation. J'ai donc
pris le **payload brut** rendu par `generate-household-meal-v1` sur mon run ② (Auber, 6
bouches), posé l'attribution sur le porteur que le prompt nomme, et fait traverser la
**vraie chaîne** — sonde temporaire, supprimée après mesure, jamais commitée :

```
readDraftPlan(payload)  →  6 bouches, 1 plat attribué   (le lecteur ne jette rien)
renderToStaticMarkup(<PlanResult …>)  →  contient « For Theo » ET « For the table »
```

`PlanResult` est **exactement** ce que `PlanDraftDialog` monte. C8 tient à la **valeur**,
sur des octets serveur, pas sur un littéral de source.

---

## 6. 🟠 LE DÉFAUT TROUVÉ À L'ÉCRAN, ET CORRIGÉ — `8dc1e4c7`

### Ce que j'ai vu

Sur la fixture, au dîner du jeudi (la case séparée), les **deux** sous-blocs listaient les
**mêmes quatre bouches** :

```
POUR LA TABLE
  Chicken, courgette and pepper tray bake with couscous
  Paul — Take one full portion with extra vegetables and less couscous.   ← Paul mange
  Lea  — …                                                                  son plat
  Tom  — …                                                                  juste
  Nina — …                                                                  dessous
POUR PAUL
  Chicken, courgette and pepper tray bake with couscous
  Paul — …
  Lea  — Take a small portion…        ← Lea ne touche pas ce plat
  Tom  — …
  Nina — …
```

Devant la casserole, le moment demandait de **servir chacun deux fois**. C'est la ligne C4
mot pour mot — *« au moment M, chaque bouche a soit le plat commun, soit son plat dédié,
jamais zéro, jamais deux »* — exprimée dans les **lignes de part** au lieu des cartes.

### Pourquoi rien ne l'avait vu

- `groupDayBySlot` calculait les parts sur **toutes** les bouches, pour **tous** les
  plats. La question « Paul mange-t-il le plat de la table ce soir ? » ne lui était jamais
  posée.
- **Le lot avait pourtant tranché cette question**, dans son troisième commit
  (`33b28320`) : `buildPersonWeek` répond « son plat REMPLACE celui de la table ».
  **Deux fonctions du même lot répondaient donc différemment à la même question** — ce que
  3A donne lui-même comme raison de corriger `buildPersonWeek`.
- Et surtout : **le défaut n'est visible que sur un plan qui porte un plat dédié**. Aucun
  n'existait, ni en base ni dans les fixtures de test — la fixture des tests de parts
  n'avait **pas** de plat de table en face du plat dédié.

### Le correctif

`lib/planDaySlots.ts` : la part suit l'assiette.

```ts
const eatsHere = (memberId, dish, ownersHere) =>
  dish.member_id === null ? !ownersHere.has(memberId) : dish.member_id === memberId;
```

`ownersHere` est calculé **une fois par moment** (pas par plat) : deux plats du même moment
ne peuvent pas répondre différemment. Conséquence qui tombe toute seule et qui est juste :
un plat dédié à une bouche que le plan **ne nomme plus** ne porte aucune ligne — aucune
bouche nommée ne le mange, et lui prêter les parts de la table dirait de lui une chose
fausse.

### Un test existant qui disait le contraire, **corrigé et pas contourné**

`planDaySlots.int.test.ts` exigeait « un plat DÉDIÉ porte aussi les parts du lot qu'il
prélève » ⇒ `["Zoé", "Kid"]` sous le plat de Zoé. Il avait tort, exactement comme le test
de `buildPersonWeek` que 3A a dû corriger dans le même lot. Il dit maintenant ce qu'il
voulait dire : le plat dédié porte la part de **sa** bouche.

### Les tests neufs — **5**, sur la valeur rendue

`components/planDaySeparation.int.test.ts` (`.int.test.ts`, `react-dom/server` — un `.tsx`
ne serait **jamais collecté**) et `lib/planDaySlots.int.test.ts` :

- ⛔ chaque bouche n'est servie qu'**une** fois au moment séparé, et sa ligne est sous
  **son** plat (position mesurée dans le HTML) ;
- ⚠️ **le cas qui passe** — sans plat dédié, la table garde **toutes** ses parts (le chemin
  majoritaire, et sans lui une règle qui couperait tout ressemblerait à une règle juste) ;
- ⚠️ un plat dédié à une bouche que le plan ne nomme plus ne porte **aucune** part.

### Les mutations sur ma propre garde

| # | Mutation | Résultat |
|---|---|---|
| DÉSARMÉE (`eatsHere → true`) | toutes les bouches partout, comme avant | **rouge — 4 ✗**, dont les deux tests C4 |
| MORD-TOUT (`eatsHere → false`) | plus aucune part nulle part | **rouge — 8 ✗**, dont **les trois cas qui passent** |

Restaurée : 40/40 vertes.

### Remesuré au navigateur, après correctif

```
POUR LA TABLE   Lea — Serve a smaller piece of chicken…      (Paul retiré)
                Nina — Serve a full protein portion.
POUR PAUL       Paul — Take one adult serving of chicken…    (Lea, Tom, Nina retirés)
```

`agent-gate` sur `8dc1e4c7` : **pass** (JWT, scan de motifs, compte de tests 6171, suite
Deno 3080, typecheck front, `deno check`, eslint).

---

## 7. Ce qui reste rouge, ou consigné non corrigé

### 7.1 🔴 Le plat dédié d'un autre entre dans la lecture d'un secondaire (les deux listes plates)

**Mesuré**, persona secondaire `l2p-nina`, sur les **deux** surfaces :

```
/app/plan  →  « WHAT THE HOUSE IS COOKING »        /app/household → HouseholdPlanCard
MONDAY
  Lunch — Chicken, tomato and cucumber couscous bowls     ← le plat de la table
  Lunch — Chicken and extra greens plate                  ← LE PLAT DE PAUL
```

Deux déjeuners au même moment, **et rien ne dit lequel est le sien**. C4 dit « un plat
`for_member_id` n'apparaît jamais dans l'assiette d'un autre » ; ici il apparaît dans la
seule lecture de semaine qu'un secondaire possède.

**Pourquoi je ne l'ai pas corrigé** : `DishListByDay` / `lib/dishListByDay.ts`
appartiennent au **LOT 1**, la surface du secondaire est celle que le LOT 3 a reçu
consigne de **ne pas enrichir**, et le choix est un **arbitrage produit** — « ce que la
maison cuisine » peut légitimement tout lister. Le corriger en passant, c'est décider à la
place de l'humain.

**Le correctif attendu**, pour E ou pour une paire suivante : `dishListByDay` prend un
`readerMemberId` **requis** (jamais optionnel : « paramètre de garde optionnel = garde
désarmée ») et applique la règle de `buildPersonWeek` — le plat d'une autre bouche sort,
et au moment où le lecteur a le sien, celui de la table sort aussi. Un test : un plan avec
un plat dédié à X ⇒ la liste de Y ne le contient pas et ne porte qu'un déjeuner.

### 7.2 🔴 La grille de semaine ignore le plat dédié

`PlanGrid` rend **une** case par (moment, jour) : au lundi/déjeuner elle affiche « Chicken,
tomato and cucumber couscous bowls » et **le plat de Paul n'existe pas** dans la grille.
Comportement **antérieur** au lot (`buildPlanGrid`, LOT 1) — le LOT 3 n'a pas touché
`PlanGrid`, et son dessin ne visait que `PlanDayBlock`. Mais la conséquence est réelle :
la vue d'ensemble affirme un seul plat là où il y en a deux. À nommer pour E ; un badge
(« +1 pour Paul ») serait le geste minimal.

### 7.3 🔴 Un plan réel porte DEUX plats de table au même moment — C4, côté moteur

`6620682c`, `fri`/`dinner` : « Prawn and tomato rice bowls » **et** « Tomato lentil soup
with bread », tous deux `member_id: null`. **Antérieur à ma fixture** (vérifié sur la
sauvegarde) : c'est le modèle qui l'a écrit, au run réel de 2B. Chaque bouche a donc deux
dîners ce soir-là — « jamais deux », côté table cette fois.
**Rien ne le compte** : aucun `issue`, aucun compteur. L'écran ne ment pas (les deux
cartes se rendent à plat, sans étiquette, `separated: false`), mais personne ne sait que
c'est arrivé. Pour E / la paire moteur : un constat compté, jamais un rejet — posture
`same_day`.

### 7.4 ⚠️ Non prouvé, et pourquoi

1. **La séparation n'a JAMAIS été vue sur un plat produit par le modèle.** Tout ce qui est
   à l'écran vient de la fixture fabriquée de §5. C'est le rouge principal du lot, et il
   n'est pas réparable côté front.
2. **La modale d'aperçu n'a pas été atteinte au navigateur** — même limite que 2B (§7.1 de
   son rapport) : un brouillon exigerait un plat dédié que le modèle ne produit pas. C8
   est prouvé **à la valeur sur octets réels** (§5.3), pas au clic.
3. **Le barreau ③ (`separate_sessions`) n'a pas été exercé** : il est réservé à la fusion,
   et une fusion consomme un quota et refuse `draft`. Hors périmètre.
4. **Les 3 rouges vitest étrangers** restent rouges (§1.2).
5. **`keelGenerationModel()`** toujours sauté par la lane foyer — nommé, pas touché.
6. **Le plafond de plats de `scope: "day"` vaut 3** (cicatrice de 2A/2B) : je ne l'ai pas
   rencontré (mes fenêtres font 2 à 7 jours), mais la mise en garde de 3A tient.

---

## 8. Les autres vérifications demandées

### 8.1 Navigateur — ce qui a été mesuré, pas regardé

**Poste** : serveur de dev `frontend-a3b` / port **5195** (entrée ajoutée à
`.claude/launch.json`, fichier déjà modifié par d'autres lanes), lancé par
`preview_start`, **jamais par Bash**, arrêté à la fin. Sessions injectées en
`localStorage` (`sb-127-auth-token`, patron du harnais commité) — **aucun formulaire
rempli**. Captures **à scroll 0**, corps décalé par marge négative.

| Épreuve | Mesure |
|---|---|
| deux voies nettes au moment concerné | `FOR THE TABLE` / `FOR PAUL`, une fois chacune |
| chacune avec **son** bandeau du jour J | table « Just reheat — 10 min » + son texte ; Paul « Just reheat — 10 min » + le sien ; au tue/lunch : 12 min vs **8 min** |
| un moment **sans** plat dédié rendu comme avant | petit-déjeuner : aucun en-tête, aucun filet, le plat est là |
| le plat dédié **absent** de la semaine des autres | Lea et Nina : « Chicken, tomato and cucumber couscous bowls » ; Paul : « Chicken and extra greens plate ». Chacune **un** déjeuner |
| la jointure auditable, le slug invisible | `data-member-id="30730edf-…"` dans le DOM, **absent** du texte lu |
| **320 px** | `document.scrollWidth` = 320 = `innerWidth` ; bloc 288/288 ; **0** descendant qui déborde ; **0** ligne de part qui déborde |
| **1280 px** | `scrollWidth` = 1280 = `innerWidth` |
| `break-words` sur l'en-tête | classe relevée dans le DOM, prénom qui passe à la ligne |
| **les deux langues** | `?lang=fr` ⇒ `POUR LA TABLE` / `POUR PAUL`, **0** libellé resté en anglais ; **le prénom « Paul » est identique dans les deux** |
| console | **aucune erreur** sur un onglet neuf |

⚠️ Les **notes de part** restent en anglais en interface française : elles viennent du
modèle (`content_locale` du plan), pas du pack. Même comportement que `method` chez 2B.

### 8.2 Le secondaire ne voit pas la décomposition

`l2p-nina` sur `/app/plan` et `/app/household` :

| ce qu'on a cherché | présent ? |
|---|---|
| voies `data-member-id` | **0** |
| lignes de part `data-share-member-id` | **0** |
| « For the table » / « For Paul » | **0** |
| contrôle segmenté « Side by side » / « One person » | **absent** |
| ingrédients, `why`, méthode, bandeau jour J, cases à cocher | **0** (gardes LOT 1/2 intactes) |

La garde `isOwner` tient à l'écran, et la mutation N8 prouve qu'elle est **écrite**, pas
laissée au hasard d'une requête.

### 8.3 i18n

**2 clés, dans les DEUX packs**, aux mêmes noms, avec le trou `{name}` des deux côtés :

| Clé | en | fr |
|---|---|---|
| `meals.day_person.table` | For the table | Pour la table |
| `meals.day_person.member` | For {name} | Pour {name} |

Namespace `meals.*`, déjà déclaré pour `/app/plan`, `/app/household` et `/app/setup`.
**Aucun throw DEV** sur les surfaces visitées. Packs **non commités** (convention des
lanes : `en.ts` modifié, `fr.ts` non suivi). **Mon correctif n'ajoute aucune clé.**

---

## 9. Ce que j'ai touché, et ce que je n'ai pas touché

- **Un commit ajouté** : `8dc1e4c7`, **trois chemins explicites** relus par `git diff`
  avant stage (`lib/planDaySlots.ts`, `lib/planDaySlots.int.test.ts`,
  `components/planDaySeparation.int.test.ts`). **`agent-gate: pass`.**
- **Jamais `git add -A`, jamais `git stash`.** Les trois fichiers étaient propres avant.
- **Aucun pack i18n commité, aucune clé ajoutée.**
- **Aucun fichier étranger défait.** `pages/SetupPage.tsx` (travail d'une autre lane) et
  `pages/StudentWeekPlanPage.tsx` n'ont **pas** été ouverts en écriture. Le seul fichier
  étranger modifié est `.claude/launch.json` (+1 entrée `frontend-a3b`, fichier déjà
  modifié par d'autres lanes) — même geste que 1B et 2B.
- **Toutes mes sondes temporaires supprimées** (`zz3b.c8.int.test.ts`, `zz3b_draft.json`) ;
  arbre revérifié propre sur les 15 fichiers du lot après les 12 mutations.
- **Écritures en base, assumées et nommées** : les **trois plats fabriqués** de §5, et
  rien d'autre. Sauvegardes des colonnes d'origine dans `scratchpad/backup_dishes_*.json`.
  Les deux runs de modèle sont des `draft` : **zéro écriture**.
- **Aucune commande à risque** : ni `db push/reset`, ni `functions deploy`, ni `secrets`,
  ni `config push`, ni `link`. **Aucun `supabase stop/start`. Aucun `docker restart`** —
  l'autorisation existait, la condition ne s'est pas présentée (§4.1).
