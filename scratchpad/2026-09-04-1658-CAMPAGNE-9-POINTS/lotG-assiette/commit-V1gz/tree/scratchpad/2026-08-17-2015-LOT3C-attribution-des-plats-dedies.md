# Rapport LOT 3C — l'attribution des plats dédiés (`for_member_id`)

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-17, 20:15 · **Aucun `push`, aucun merge.**
**Master prompt** `scratchpad/2026-08-17-MASTER-PROMPT-PLAN-FOYER-PAR-JOUR.md`
**Rapports lus** `…-1825-LOT3A`, `…-1912-LOT3B`, `PLAN-BATAILLE-RAPPORT.md` §B/§C.
**Commit** `33d7b3d4` (7 chemins serveur, `agent-gate: pass`).

> ## Le verdict, en deux nombres
>
> **AVANT : `{asked: 21, declared: 0, attributed: 0}`.**
> **APRÈS : 11 plats attribués sur quatre runs — `0, 7, 4, 0` —, `refused: 0`.**
>
> Même foyer (Auber `42cf7a53`), même fenêtre (2026-08-17, 7 jours), même route
> (`intent: "draft"`, aucune écriture).
>
> ## Et le diagnostic renverse la conclusion de 3B
>
> 3B écrit : *« le modèle **n'écrit jamais** la clé — 0 `for_member_id` même
> refusé »*. **C'est faux, et je l'ai mesuré sur les octets.** L'archive
> `llm_raw_response_events` porte **93 réponses de génération foyer**, dont
> **douze servies sous v12** : **deux d'entre elles portent `for_member_id`** —
> une sur **huit plats** (2026-08-15, foyer à 2 bouches), une sur un plat
> (2026-08-17 16:42), cette dernière sur une bouche **hors liste fermée**, donc
> **refusée par le parseur**, à juste titre.
>
> Le compteur `{asked, attributed}` rendait **le même zéro** pour « jamais
> déclaré » et pour « déclaré puis refusé ». Ces deux faits appellent des
> corrections **opposées**. C'est ce trou-là qui a coûté le diagnostic.

| Épreuve | État |
|---|---|
| Hypothèses (a) → (e) départagées **par la mesure** | ✅ §2 |
| Prompt RÉEL des runs de 3B reconstruit et **lu** | ✅ §2.1 |
| Archive des 93 réponses brutes dépouillée | ✅ §2.2 |
| Correctif — enveloppe foyer v12 → **v13**, tronc inchangé | ✅ §3 |
| Compteur `dish_owners` = `{asked, declared, attributed, refused}` | ✅ §3.3 |
| Compteur **lisible sur un aperçu** (il ne l'était pas) | ✅ §3.3 |
| Suite Deno `_shared/keel/` | ✅ **3096 passés, 0 rouge** |
| `tsc -b` front · vitest | ✅ exit 0 · **1096 passés, 3 rouges étrangers connus** |
| Mutations sur les gardes neuves | ✅ **9/9 au rouge**, restaurées |
| `agent-gate` (`AGENT_GATE_STAGED_ONLY=1`) | ✅ **pass** |
| **RUN RÉEL avant / après**, même foyer, même fenêtre | ✅ **0 → 11** |
| Hypothèse (e) — le modèle de génération sur cette lane | 🔴 **mesuré : il TIMEOUT** (§2.6) |
| Ce qui reste rouge | 🔴 4 points, §5 |

---

## 1. Le poste, et ce que j'ai fait dessus

- Sondé avant chaque geste : `docker logs --tail 40 --timestamps
  supabase_edge_runtime_Sophia_2` ne montrait que des **crons réentrants**
  (`process-llm-retry-jobs`, `trigger-topic-compaction`, `process-checkins`,
  `keel-reengage-v1`, `keel-coach-broadcast-v1`) — aucune lane voisine en
  génération, à aucune des quatre sondes.
- **`docker restart supabase_edge_runtime_Sophia_2` — et rien d'autre.** Ce lot
  modifie `_shared/`, donc le redémarrage était **obligatoire** : mesurer sans
  lui aurait mesuré l'ancien prompt. Debout prouvé à chaque fois par un **401
  sans auth**. (Deux fois le conteneur s'est recréé tout seul avant mon
  `restart` — le watcher de `functions serve` réagit à l'écriture d'un fichier ;
  noté, sans conséquence, la sonde 401 tranche.)
- `./scripts/local_extend_kong_functions_timeout.sh` joué avant chaque salve
  (`read_timeout=600000`).
- **Aucune commande à risque** : ni `supabase stop/start`, ni `db reset/push`,
  ni `functions deploy`, ni `secrets`, ni `config push`, ni `link`.
- **Aucune écriture en base.** Les six runs modèle sont des `intent: "draft"` :
  branche `isDraft`, zéro `write_student_meal_plan`. La fixture fabriquée de 3B
  (`2ab8a495`, `6620682c`) est **laissée telle quelle** pour E.
- Comptes visés : `laneb-master-…@test.dev` (foyer Auber) et
  `laneb-owner-…@test.dev` (foyer Bramble), mot de passe `1234567`, **vérifié
  avant de viser**. Le foyer `c1d7d0a3` (Genty/Christèle) est le plus
  intéressant du dépôt (§2.3) et je **ne l'ai pas visé** : son compte est
  `tho@gmail.com`, dont je n'ai pas le mot de passe. Règle tenue.

---

## 2. LE DIAGNOSTIC — les cinq hypothèses, départagées

### 2.1 (a) « Le bloc n'atteint pas le prompt » — ⛔ RÉFUTÉE, en lisant les octets

J'ai reconstruit le **prompt réel** du run de 2B (foyer Vidal `4123e479`, Paul
porteur) en appelant `buildHouseholdPromptBlocks` avec les entrées réelles. Le
bloc y est, avec l'id exact :

```
== WHOSE DISH IS IT (household) ==
Every dish you return may carry one more key: "for_member_id".
Set it ONLY on a dish you cooked for one named person below, using their
EXACT member_id. …
  Paul = 30730edf-846c-4ea4-901d-39c9caaf7fee
```

Et **par construction** : `dish_owners.asked = 21 > 0` ⟹ `eaterBudget ≠ null`
⟹ (hors fusion) `compositionBudget ≠ null` ⟹ `dishBearingMembers.length > 0`
⟹ `dishBearers` non vide ⟹ le bloc est assemblé. Il n'y a pas de chemin où
`asked` soit non nul et le bloc absent.

⚠️ **Et la preuve empirique la plus forte** : le bloc **juste au-dessus** dans le
même `systemSuffix` (`PORTION_SCHEMA_BLOCK`, `member_portions`) est rempli avec
les **ids exacts**, sur **100 % des runs mesurés** (93/93). Le suffixe système
atteint le modèle, et le modèle en recopie les identifiants. Ce n'est pas un
problème de livraison.

### 2.2 ⛔ CE QUE L'ARCHIVE DIT, ET QUE PERSONNE N'AVAIT OUVERT

`llm_raw_response_events` archive **le texte brut** de chaque réponse. Dépouillé
en entier — 93 réponses de `generate-household-meal-v1`, dont **12 sous v12** :

| Date (UTC) | Foyer | Plats rendus | portant `for_member_id` |
|---|---|---|---|
| 2026-08-15 17:58 | — | 21 | 0 |
| **2026-08-15 18:16** | **c1d7d0a3** (Genty, Christèle) | **29** | **8** |
| 2026-08-15 18:17 (relance) | idem | 21 | 0 |
| 2026-08-17 14:04 / 14:11 / 15:13 | Vidal `4123e479` | 20 / 21 / 21 | 0 |
| 2026-08-17 15:21 (→ plan `6620682c`) | Vidal | 24 | 0 |
| 2026-08-17 15:22 (relance) | Vidal | 21 | 0 |
| 2026-08-17 16:39 (+ relance) | Auber `42cf7a53` | 21 / 21 | 0 |
| **2026-08-17 16:42** | **Bramble `80e9af4c`** | **7** | **1** |

**Le run du 2026-08-15 est la pièce à conviction.** Le modèle y a composé des
**paires** de plats, à huit repas :

```
sat lunch | Bols de poulet rôti, riz et salade croquante        → dd8b97e8 (Genty)
sat lunch | Poulet rôti, riz et salade pour deux                → (la table)
sun lunch | Salade de thon, pommes de terre et haricots verts   → dd8b97e8
sun lunch | Salade de thon, pommes de terre et haricots verts   → (la table)
…                                                              (8 paires)
```

C'est **exactement** ce que la ligne de forme demande, en français, avec l'id
exact. Ce plan n'a jamais été écrit (c'était un aperçu), donc aucun
`generated_from` ne le porte — et c'est pour ça qu'il était invisible.

Le run du **16:42** est l'autre moitié : le modèle a marqué le plat « Apple » du
petit-déjeuner avec `for_member_id = fb50c0f7` — **Lea**, la bouche qui porte
une **HABITUDE** (« une pomme au petit-déjeuner »), pas une divergence
d'objectif. Elle n'est **pas** dans `dishBearerIds` (les porteurs de ce foyer
sont Nina et Zoé). Le parseur l'a **refusé**, à juste titre, et a produit une
`issue` — que personne ne lisait.

> **Deux faits opposés, un seul zéro.** Le compteur ne pouvait pas les
> distinguer, et 3B a conclu « le modèle n'écrit jamais la clé » sur le compteur.

### 2.3 (b) « Le barreau ① interdit le plat séparé » — ⛔ RÉFUTÉE

`cooking.served` valait **`one_session`** sur **tous** les runs mesurés
(`generated_from.household.cooking` de `6620682c`, et le log
`keel.household_meal.cooking_shape` de mes propres runs). La ligne
« Do NOT propose separate dishes » du barreau ① **n'a jamais été servie**. La
contradiction supposée n'existait pas.

### 2.4 (c) « Le bloc est servi mais perdu dans l'ordre » — ✅ VRAIE, et c'est LE mécanisme

Le prompt réel, lu en entier, porte **deux moitiés qui ne se rejoignent nulle
part** :

| | où | ce qu'elle dit |
|---|---|---|
| la **promesse** | message **utilisateur**, dans `buildPortionBrief` | « at EVERY meal they eat here they get a dish of their OWN » |
| la **clé** | prompt **système**, `dishOwnerSchemaBlock` | « Every dish **may** carry one more key » |

Rien ne dit au modèle que **le plat promis par la ligne de forme EST celui qui
doit porter la clé**. Et la promesse est noyée : elle est cinq lignes au milieu
d'un brief dont **l'en-tête** dit `HOUSEHOLD SERVING PLAN — one cooking session,
portions that differ`, dont la suite réclame *« For each person below, give a
short serving instruction »*, et dont la sortie obligatoire est
`member_portions` — une ligne par personne.

⚠️ **Et la ligne de forme affirme une chose que le brief dément.** Elle dit :

```
ONE person below cannot be served from it (their line says so)
```

…et la ligne visée dit :

```
- Paul: larger protein and starch share, same vegetables
```

C'est une **instruction de service prise dans la casserole commune**. Aucune
ligne ne dit que quiconque ne peut pas en être servi. Le modèle lit les lignes,
n'y trouve pas le marqueur annoncé, et sert tout le monde du même plat.

**Ce que ça produit, mesuré :** sur les 12 runs v12, **onze n'ont composé qu'UN
SEUL plat par repas.** Le plan `6620682c` en est le portrait — 24 plats pour 21
créneaux, aucune paire, et la divergence de Paul entièrement dans son
`portion_note` : *« Serve a generous heap of vegetables, the full protein share
and a smaller starch share »*.

> **Le trou n'était donc PAS « le modèle oublie la clé ».** Il était : **le
> modèle ne compose pas le second plat**, et il n'y avait donc rien à marquer.

### 2.5 (d) « Le modèle voit, comprend, et n'obéit pas » — ✅ VRAIE, mais bien plus faible que craint

Ce n'est pas le refus dur du précédent **O5**. Le modèle obéit **par
intermittence** — 2 runs sur 12 avant, 2 runs sur 4 après (§4). Et j'ai capturé
**la preuve qu'il lit la nouvelle consigne** : au deuxième run d'après
correctif, la note de portion de Theo est devenue

```
"Do not serve from the shared dish. Serve a separate full plate for this
 member at every breakfast, lunch and dinner."
```

— c'est la consigne neuve, **renvoyée mot pour mot**… **dans le mauvais champ**.
Le modèle a exécuté l'ordre dans `member_portions` au lieu d'écrire le plat, ce
que le bloc lui interdit explicitement. C'est un défaut de **force de consigne**,
pas d'incompréhension.

### 2.6 (e) La lane foyer saute `keelGenerationModel()` — 🔴 MESURÉ, et le résultat est net

Jamais mesuré jusqu'ici. Je **n'ai rien réparé** : j'ai posé
`model: keelGenerationModel()` sur les deux appels, en arbre de travail, mesuré,
**puis retiré** (le fichier commité ne le porte pas — `grep -c
keelGenerationModel` sur `index.ts` = **0**).

```
17:52:14  gpt-5.6-sol   generate-household-meal-v1   attempt_start
17:56:14  gpt-5.6-sol   generate-household-meal-v1   timeout_or_abort   "Signal timed out."
17:56:14  gpt-5.4-mini  generate-household-meal-v1   attempt_start  (chain_index 1)
17:56:57  gpt-5.4-mini  generate-household-meal-v1   success        27034 octets
17:56:57  gpt-5.6-sol   .protein_anchor_retry        attempt_start
→ la requête entière rend HTTP 546 (le worker edge dépasse son mur), 6 min 40.
```

**Le modèle de génération met plus de 4 minutes sur ce prompt et se fait couper**,
la chaîne retombe sur `gpt-5.4-mini`, et la relance d'ancre protéique fait
exploser le mur du worker. Le modèle **existe** et répond localement ailleurs
(38 succès, dont la lane individuelle à 15:19).

> **L'information pour l'utilisateur :** brancher `keelGenerationModel()` sur la
> lane foyer **en l'état ne marche pas** — ce n'est pas un oubli de câblage, la
> composition foyer est trop longue pour le budget de temps actuel. Le chantier
> « lane foyer sur le modèle de génération » a donc un prérequis qu'on ne
> soupçonnait pas : découper l'appel, ou lever le mur du worker.

---

## 3. LE CORRECTIF — le périmètre le plus étroit qui répond à la cause

Tout tient dans l'**enveloppe foyer** (population : les foyers où au moins une
bouche reçoit un plat à elle — exactement celle de v12) plus **le compteur**.
`MEAL_PROMPT_VERSION` **ne bouge pas d'un octet** : aucun texte du tronc n'est
touché, et un test le tient.

### 3.1 L'ORDRE, collé à la promesse — `== A DISH OF THEIR OWN ==` (message utilisateur)

Placé **immédiatement après `buildPortionBrief`**, c'est-à-dire dans le même
souffle que la phrase qui promet le plat :

```
== A DISH OF THEIR OWN ==
These people cannot be fed from the shared pot. At EVERY meal they eat
here, write TWO dishes for that day and that slot: the table's dish, and a
dish of their own — same cooking session, same shopping, different plate.
  Theo = e36f4e0b-81ae-4c90-bbf0-4f68a8e7bb97
That is 21 extra dishes on top of the table's
meals, and the dish budget above already has room for them. Count them
before you answer: a window where these people have no dish of their own is
a window where they do not eat.
Each of those dishes carries "for_member_id" set to the exact id above. The
table's dish carries no such key.
A line in member_portions is NOT one of these dishes: it says how much of a
SHARED dish goes on a plate, and these people are not eating the shared
dish. Writing them a serving instruction instead of a dish leaves them
without a meal.
```

Trois choses y sont load-bearing, et chacune vient d'une mesure :

1. **Le patron est celui du champ qui MARCHE.** `member_portions` a une moitié
   schéma (prompt système) **et** une moitié ordre (message utilisateur, avec les
   ids) — et il est rempli 100 % du temps. `for_member_id` n'avait que la
   première. On lui donne la seconde, au même endroit, dans la même forme.
2. **Le NOMBRE.** C'est le levier déjà mesuré par **C6** le 2026-08-12 :
   remplacer « ADD ONE dish » par le nombre exact dans `buildMergeBlock`, après
   avoir vu un seul plat rendu pour neuf créneaux. Le nombre vient de
   `eaterBudget.dedicatedDishesAsked` — **le même** que celui qui ouvre le budget
   de plats et que celui qu'archive `dish_owners.asked`, jamais un second calcul
   (la contradiction que L4 a payée : 16 plats pour un plafond de 15, et le dîner
   du dimanche du foyer jeté).
3. **La dernière phrase nomme la sortie que le modèle prenait à la place.** Il
   écrivait la divergence dans `member_portions` et s'arrêtait là. Une consigne
   qui interdit sans nommer l'échappatoire est une consigne qu'on reprend — et
   §2.5 montre qu'il l'a reprise quand même une fois.

⚠️ **Le bloc ne passe PAS en dernier.** Les règles de maison gardent leur place :
c'est le seul invariant de position que ce fichier protège, et un test le tient.

### 3.2 Le schéma passe de la permission à l'ordre (prompt système)

`== WHOSE DISH IS IT ==` disait *« Every dish you return **may** carry one more
key »*. Il dit maintenant que **le serving plan nomme** ces gens, que **chacun de
ces plats DOIT** porter la clé, et ce que coûte son absence (« their dish
without that key is served to the whole household by mistake »). Le cas nominal
reste dit mot pour mot : *« a dish with no for_member_id is the table's dish, and
that is the normal case »* — sans quoi un modèle zélé marquerait tout et la vue
par personne retirerait le dîner à toute la table.

**`HOUSEHOLD_PROMPT_VERSION` v12 → `v13_dedicated_dish_is_ordered`.** Un foyer
sans porteur rend `dishBearers: []`, aucun des deux blocs n'est assemblé, et le
prompt est celui de v12 au caractère près — testé, et la ligne historique du
brief (`Cook ONE set of preparations for everyone. Do NOT propose separate
dishes.`) est vérifiée intacte.

⛔ **Aucun matcher, nulle part.** L'attribution reste **déclarée par le modèle**
et validée contre `dishBearerIds`. Un `for_member_id` refusé **ne rejette jamais
le plat** — les deux portes du parseur sont inchangées, et leurs tests aussi.

### 3.3 LE COMPTEUR — il ne savait pas dire ce qui s'était passé

`GeneratedMeal` gagne `dish_owner_counts`, sur le patron exact de
`same_day_counts` du LOT 2 :

```
{ dishes, declared, attributed, refused }
```

- **`declared`** : le modèle a écrit un `for_member_id` non vide, **avant** toute
  validation. C'est le nombre qui manquait.
- **`refused`** : compté **indépendamment**, jamais dérivé de
  `declared - attributed` — cicatrice `withheld`/`over_cap` des voix, où deux
  nombres du même objet se sont trouvés gonflé et dégonflé en sens inverses.
  L'égalité `declared === attributed + refused` est une **propriété testée**, pas
  une définition.
- **Même population que `dishes`** : cinquième tableau parallèle, qui suit les
  mêmes `splice` que les quatre autres. Un plat évincé par le plafond ne compte
  dans aucun des quatre — testé, et la mutation qui retire le `splice` mord.

`generated_from.household.dish_owners` porte donc désormais
`{asked, declared, attributed, refused}`.

⛔ **Et il est rendu sur l'APERÇU.** C'est la moitié du compteur qui manquait et
qui explique l'erreur de 3B : `generated_from` n'existe que sur une **ligne
écrite**, donc toute vérification faite par `intent: "draft"` était **aveugle** —
il fallait relire les plats un par un. La réponse d'un brouillon porte
maintenant `household.dish_owners`, par la **même expression** que le chemin
d'écriture (`dishOwnersTrace`), pour que la mesure d'un aperçu prédise celle d'un
plan.

**La requête pour E :**

```sql
select left(id::text,8) as plan, starts_on,
       generated_from->'household'->'dish_owners' as dish_owners,
       generated_from->'household'->'cooking'->>'served' as shape,
       generated_from->'household'->'cooking'->'dish_bearing' as bearers
from student_generated_meals
where plan_kind = 'household' and retired_at is null
order by created_at desc;
```

---

## 4. LA PREUVE — le run réel, avant / après

**Même foyer, même fenêtre, même route.** Foyer **Auber `42cf7a53`** (6 bouches :
Paul maître, Iris `fat_loss`, **Theo `muscle_gain`**, Marc `maintenance`, Lou,
Zoe `health`), fenêtre **2026-08-17 + 7 jours**, `intent: "draft"`.
Forme servie sur tous les runs : `one_session`, **un porteur : Theo**,
`asked = 21`.

### AVANT — `attributed: 0`

| Run | Plats rendus par le modèle | Plats gardés | **Attribués** | Repas à 2 plats |
|---|---|---|---|---|
| le mien, 19:33 | 15 | 13 | **0** | **0** |
| 3B, Auber (16:39 UTC) | 21 | 19 | **0** | 0 |

Et, sur l'ensemble de la population v12 (§2.2) : **12 runs, 291 plats rendus,
0 attribution retenue.**

### APRÈS — `attributed: 11` sur quatre runs

| Run | `dish_owners` | Plats gardés | **Attribués** | Repas à 2 plats |
|---|---|---|---|---|
| ① *(sans le compte)* | `{asked:21, declared:0, attributed:0, refused:0}` | 20 | **0** | 1 |
| ② | `{asked:21, declared:0, attributed:0, refused:0}` | 19 | **0** | 0 |
| ③ | `{asked:21, declared:7, attributed:7, refused:0}` | 26 | **7** | **7** |
| ④ | `{asked:21, declared:4, attributed:4, refused:0}` | 23 | **4** | 1 |
| ⑤ | `{asked:21, declared:0, attributed:0, refused:0}` | 19 | **0** | 0 |

**Configuration finale (runs ② à ⑤) : 87 plats gardés, 11 attribués, 0 refusé,
deux runs sur quatre non nuls.**

Le run ③, à l'écran de la donnée, c'est exactement ce que le LOT 3 attendait :

```
mon dinner   Theo's chicken, rice and vegetables      → e36f4e0b   + le plat de la table
tue lunch    Theo's chicken sandwich                  → e36f4e0b   + le plat de la table
wed dinner   Theo's chicken with extra rice           → e36f4e0b   + le plat de la table
thu dinner   Theo's lentil soup and bread             → e36f4e0b   + le plat de la table
fri lunch    Theo's chicken wrap                      → e36f4e0b   + le plat de la table
sat dinner   Theo's beef and rice noodles             → e36f4e0b   + le plat de la table
sun dinner   Theo's salmon and ratatouille            → e36f4e0b   + le plat de la table
```

**Sept moments séparés, sept plats de table en face — C4 « jamais zéro » tenue.**
Et `refused: 0` sur les quatre runs : **quand le modèle écrit la clé, il ne se
trompe jamais d'identifiant.**

---

## 5. CE QUI RESTE ROUGE

### 5.1 🔴 Le taux est de **deux runs sur quatre**, pas de quatre sur quatre

`0, 7, 4, 0`. Le modèle obéit par intermittence. Sur le run ② il a **renvoyé la
consigne** dans `member_portions` (« Do not serve from the shared dish. Serve a
separate full plate… ») au lieu d'écrire le plat — c'est-à-dire l'échappatoire
que le bloc nomme et interdit. **11 attributions sur 21 réclamées à chaque run,
sur quatre runs**, c'est un produit qui affiche la séparation **parfois**.

**C'est une décision qui appartient à l'utilisateur**, et il y a trois sorties :

1. **Resserrer encore** — la piste que je n'ai pas prise faute de budget de run :
   dire dans `PORTION_SCHEMA_BLOCK` ce que la ligne `member_portions` d'un
   **porteur** doit contenir (sa part de **son** plat), pour lui retirer le champ
   où il range la consigne. Une expérience à mesurer, pas une évidence.
2. **Changer de modèle sur cette lane** — et §2.6 dit que ce n'est pas gratuit :
   `gpt-5.6-sol` **dépasse le mur du worker** sur ce prompt.
3. **Renoncer à l'attribution déclarée** — et alors le LOT 3 n'a rien à afficher.
   ⛔ **Ce qu'il ne faut PAS faire, et je ne l'ai pas fait : déduire.** Un matcher
   de titre attribuerait « Theo's chicken sandwich » (et rien du tout en
   français), et se tromperait dès « Chicken for Zoe and Marc ». 12 faux positifs
   sur 12 mesurés. Le run ③ montre d'ailleurs des titres qui **portent** le
   prénom : c'est exactement le piège.

### 5.2 🔴 Le modèle peut empiler les plats dédiés sur une seule case — C4 « jamais deux »

Run ④ : les **quatre** plats de Theo sont posés sur `mon/dinner`. L'attribution
est juste, la répartition ne l'est pas — Theo a quatre dîners lundi et rien les
autres jours. **Rien ne le compte** aujourd'hui : ni `issue`, ni compteur. C'est
le symétrique de la violation côté table que 3B a trouvée sur `6620682c`
(`fri/dinner`, deux plats de table). **Pour E / la paire moteur : un constat
compté, jamais un rejet** — posture `same_day`.

### 5.3 🔴 La relance d'ancre protéique peut effacer les plats dédiés d'une composition ordinaire

`dedicatedMealsIn` (`index.ts`) rend **`null` quand `ladder === null`**,
c'est-à-dire **sur toute composition ordinaire**. La garde ② de la relance
(« elle ne retire aucun des repas servis à part ») est donc **désarmée hors
fusion** : une relance peut rendre un plan sans aucun plat dédié et être
acceptée, tant qu'elle ne raccourcit pas le plan et répare l'ancre.
**« Paramètre de garde optionnel = garde désarmée », une fois de plus.**
Ce n'est **pas** la cause du zéro mesuré (aucune relance n'a remplacé un plan
attribué : le run du 2026-08-15 a bien vu sa relance **refusée**, par la garde ①,
21 plats < 29). Mais la porte est ouverte. **Non corrigé** : c'est la boucle de
relance, hors du périmètre de ce lot, et le corriger demande de résoudre les
cases des divergents à un endroit où elles ne sont pas encore résolues.

### 5.4 ⚠️ Non prouvé, et pourquoi

1. **Rien n'a été vu au navigateur.** Ce lot est serveur ; l'écran est celui de
   3A/3B, prouvé par eux. Un run réel attribué existe désormais — **mais c'est un
   aperçu, il n'écrit rien**, donc aucun plan de la base ne porte encore une
   attribution produite par le modèle. La seule attribution en base reste la
   **fixture fabriquée** de 3B (§5 de son rapport), que je laisse en place.
2. **Le barreau ③ (`separate_sessions`) n'a pas été exercé** — réservé à la
   fusion, et une fusion consomme un quota et refuse `draft`.
3. **Le foyer à 2 bouches — celui qui attribuait déjà 8/29 — n'a pas été rejoué**
   sous v13 : son compte n'a pas de mot de passe connu (§1). C'est la mesure qui
   dirait si le taux dépend de la **taille du foyer** (2 bouches contre 6), et
   c'est mon hypothèse la plus probable pour l'intermittence.
4. **Les 3 rouges vitest étrangers** restent rouges, à l'identique
   (`src/edge/coverage-guard.int.test.ts` ×2, `src/keel/copy/planRefusals.int.test.ts`).
   Antériorité prouvée par 1B, reconfirmée par 2B et 3B. Mon diff ne touche aucun
   fichier front.
5. **Le foyer Bramble n'est pas mesurable par aperçu** : ses plans occupent la
   semaine, la seule fenêtre libre fait 2 jours, et le plafond de plats y vaut
   **6** pour 6 repas de table — il ne reste aucune place pour un plat dédié. Une
   mesure sur ce foyer mesurerait **le plafond**, pas la consigne. C'est la mise
   en garde de 3A, rencontrée pour de vrai.

---

## 6. Les mutations — 9, toutes au rouge, toutes restaurées

| # | Mutation | Cible | Résultat |
|---|---|---|---|
| M1 | le bloc d'ordre n'est plus assemblé dans le `userSuffix` | `household_meal_generation.ts` | **rouge** |
| M2 | le bloc est servi **même sans porteur** (prémisse désarmée) | idem | **rouge** |
| M3 | le bloc d'ordre repasse **en dernier** (avale les règles de maison) | idem | **rouge** |
| M4 | le schéma système redevient une **permission** (`may carry`) | idem | **rouge** |
| M5 | `refused` est cloué à 0 | `meal_generation.ts` | **rouge — 3 ✗** |
| M6 | `declared` ne compte que les **acceptés** | idem | **rouge — 3 ✗** |
| M7 | le tableau parallèle **ne suit plus le `splice`** du plafond | idem | **rouge** |
| M8 | le bloc ne dit plus **combien** de plats | `household_meal_generation.ts` | **rouge — 2 ✗** |
| M9 | le **plancher à 1** du compte tombe | idem | **rouge** |

Restaurations faites depuis une **copie de sauvegarde**, jamais par
`git checkout --` (cicatrice de 2B). SHA256 revérifié après chaque restauration.

**Tests neufs : 16** — 8 sur le compteur (`meal_generation_test.ts`), 8 sur les
blocs de prompt (`household_meal_generation_test.ts`). Chacun porte **son cas qui
passe** : rien de déclaré ⇒ les quatre nombres à zéro pour la bonne raison ; sans
porteur ⇒ la ligne historique du brief intacte ; le singulier « 1 extra dish »
existe (le défaut « 1 servings » du dépôt).
**Aucun test paramétré par sa propre constante** : le test du nombre appelle deux
fois avec **3** puis **21**, en littéral.

---

## 7. Ce que j'ai touché, et ce que je n'ai pas touché

**Un commit, `33d7b3d4`, sept chemins explicites** relus par `git diff` hunk par
hunk avant stage :

```
supabase/functions/_shared/keel/household_meal_generation.ts        (+164 −4)
supabase/functions/_shared/keel/household_meal_generation_test.ts   (+239 −28)
supabase/functions/_shared/keel/meal_generation.ts                  (+71  −0)
supabase/functions/_shared/keel/meal_generation_test.ts             (+139 −0)
supabase/functions/_shared/keel/household_merge_test.ts             (+29  −6)
supabase/functions/_shared/keel/meal_same_day_test.ts               (+7   −1)
supabase/functions/generate-household-meal-v1/index.ts              (+47  −5)
```

- **Jamais `git add -A`. Jamais `git stash`** (dépôt partagé, plus de 200 fichiers
  d'autres lanes dirty). Les sept fichiers ne portaient **aucun** hunk étranger.
- **`agent-gate` en `AGENT_GATE_STAGED_ONLY=1`** : nu, il fait tourner eslint sur
  les fichiers des autres lanes — même choix que 3A et 3B. **`pass`** (JWT, scan
  de motifs, compte de tests 6187, suite Deno 3096, typecheck front, `deno check`).
- **Aucune clé i18n, aucun pack touché.** Ce lot est serveur ; les libellés de
  l'écran sont ceux de 3A.
- **Aucun fichier étranger défait.** La sonde de mesure du §2.6
  (`model: keelGenerationModel()` sur les deux appels) a été posée **et
  retirée** : `grep -c keelGenerationModel supabase/functions/generate-household-meal-v1/index.ts`
  rend **0**. Le générateur foyer saute **toujours** `keelGenerationModel()` —
  nommé, mesuré (§2.6), **pas réparé**, comme le master prompt l'exige.
- **Aucune migration.** Aucun schéma ne change : `generated_from` est du jsonb.

---

## 8. Les décisions tranchées seul

| Décision | Option rejetée, et pourquoi |
|---|---|
| **Un bloc d'ORDRE dans le message utilisateur**, à côté de la promesse | Resserrer seulement le bloc système : c'est ce que v12 faisait déjà, et la mesure dit que la moitié système seule ne produit rien. Le champ qui MARCHE (`member_portions`) a les deux moitiés ; on copie le patron qui marche. |
| **Le NOMBRE de plats dans le bloc** | S'en tenir à « at EVERY meal » : c'est le texte que douze runs ont ignoré. C6 a mesuré, le 2026-08-12, que le nombre change le résultat sur la lane fusion. Même levier, même endroit du prompt. |
| **`dedicatedDishesAsked` REQUIS sur `HouseholdPromptInput`** | Un `?` : il n'aurait fait remonter aucun appelant au compilateur, et le bloc aurait dit « 1 extra dish » à tous les foyers. C'est la discipline écrite du fichier, appliquée telle quelle — et elle a effectivement cassé les 28 sites d'appel des tests, ce qui est le point. |
| **`refused` compté indépendamment**, pas dérivé | `declared - attributed` : ce dépôt a déjà payé deux nombres du même objet dont l'un dérive de l'autre (`withheld`/`over_cap`). L'égalité devient une **propriété testée** au lieu d'une tautologie. |
| **Le compteur rendu sur l'APERÇU** | Le laisser sous `generated_from` seulement : c'est précisément ce qui a rendu la vérification de 3B aveugle, et c'est de là que vient la conclusion fausse. Un compteur qu'on ne peut lire que sur le chemin qui consomme un plan n'est pas un compteur. |
| **`HOUSEHOLD_PROMPT_VERSION` seul** | Bumper aussi `MEAL_PROMPT_VERSION` : aucun octet du tronc ne change. Le compteur `dish_owner_counts` est une **mesure**, il ne se lit sur aucun prompt. La population qui voit une consigne différente est exactement celle de v12. |
| **Le bloc ne passe PAS en dernier** | Le mettre après les règles de maison, pour la récence : ce serait démoter la seule consigne qui doit survivre à tout. Le bloc nomme ses bouches et porte leurs ids — il n'a pas besoin de la place. |
| **Ne pas corriger `dedicatedMealsIn` (§5.3)** | Le réparer en passant : c'est la boucle de relance, elle a son propre sujet, et le correctif exige de résoudre les cases des divergents là où elles ne le sont pas encore. Il est **nommé**, avec son fichier, et il n'est pas la cause du zéro mesuré. |
| **Ne pas viser le foyer `c1d7d0a3`** | C'est le foyer le plus informatif du dépôt (8 attributions sur 29). Son compte est `tho@gmail.com`, mot de passe inconnu. « Ne jamais viser un compte sans mot de passe connu » n'a pas d'exception, même pour une bonne mesure. |
