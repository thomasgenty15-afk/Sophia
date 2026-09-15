# ÉTAPE ③ — PLUSIEURS BOUCHES, LES TROIS MODES DE CUISSON

**Agent 3A · 2026-08-19 · branche `ff-001-quotidien-du-coach`**
**Runs réels : 2026-08-19 01:50 → 02:25 UTC**, lane `generate-household-meal-v1`.
**10 runs, 8 plans écrits**, 3 modes + 1 delta d'un octet.

> ### ⚠️ LA RÉSERVE, EN TÊTE : AUCUN RUN N'A ÉTÉ SERVI PAR LE MODÈLE NOMINAL
> Le compte OpenAI est à sec. Sur **chacun** de mes runs, `gpt-5.4-mini` (le
> modèle de la lane, `GLOBAL_AI_MODEL`) rend **429 `credit_balance_exhausted`**
> en moins d'une seconde, `gpt-5.4-nano` aussi, et c'est
> **`gemini-3-flash-preview`** qui a produit chaque sortie — relevé run par run
> dans `llm_raw_response_events` (`<run>/model.txt`).
>
> **Tout jugement portant sur la SORTIE (§C) vaut pour le modèle de repli, pas
> pour le nominal.** En revanche §A, §D.1, §D.2 et §D.4 portent sur le **prompt**,
> le **moteur** et les **archives de plan** : du code déterministe, mêmes octets
> quel que soit le fournisseur.
>
> ⚠️ **`_shared/keel/household_safety.ts` était en cours de modification par un
> autre agent.** À l'heure de mes runs l'attribution était **déjà livrée** : mon
> prompt porte `- Solveig: sesame — allergy, severity=medical`, sous l'en-tête
> `THE HARD CONSTRAINTS OF THE MOUTHS AT THIS TABLE`. §C.2 vaut **pour cette
> version-là**.

---

## LE FOYER MONTÉ POUR LA MESURE

Fixture : `2026-08-19-0330-3a-fixture-foyer-modes.sql` — foyer **indépendant** de
ceux de 1V et de 06. Compte `qa3a.foyer@keeltest.dev`, foyer
`43102a0a-72b5-4478-bff8-e7d056501f26`, coach `Osric Thelwall` (doctrine publiée).

| | **Aurèle** | **Solveig** | **Marceline** | **Théodule** |
|---|---|---|---|---|
| `member_id` | `c278b5dc…` | `c9656ee5…` | `f5c81e2b…` | `1fea4f51…` |
| compte | **oui** (maître) | non | non | non |
| âge | adulte | adulte | adulte | **mineur, 9 ans** |
| corps saisi | 181 cm / **92 kg** / sedentary | 163 cm / **55 kg** / trains_hard | 170 cm / **74 kg** / on_feet | 134 cm / **29 kg** / on_feet |
| objectif | `fat_loss` | `muscle_gain` | `muscle_gain` | aucun |
| régime | omnivore | omnivore | omnivore | **végane** |
| sécurité | — | **allergie sésame, médicale** | **dégoût : fenouil** | — |
| rythme | déj. (medium), dîner (large) | déj. (large), dîner (medium) | déj. (medium), dîner (large) | déj., dîner (medium) |

Fenêtre : **1 jour** (mercredi 2026-08-19), 2 créneaux — choix de **poste**, pas
de cas : le modèle de repli expire à 60 s une fois sur deux sur cette lane, et
une fenêtre longue meurt en vol. Budget 115, 50 min/session, cuisine `wed`+`sat`
⇒ **100 min/semaine ≥ 90** : le plafond de temps **ne mord pas**, et les trois
modes sont donc comparés sur la seule variable du mode.

**La divergence est CALCULÉE, pas espérée** — archivée dans les **six** plans écrits
(`generated_from.household.cooking.diverging`) : **3 bouches sur 4** sortent de
la casserole commune.

- **Aurèle** par le service : `fat_loss` demande `vegetables:larger`, au-dessus du
  plafond de la table (`servingConflicts`, `household_merge.ts:545`).
- **Solveig** et **Marceline** par le régime : `muscle_gain` demande
  `protein:larger`, au-dessus du plafond `full` d'une casserole descendue au
  végane (`dietDiverges`, `household_diet.ts:259-272`).
- **Théodule** *porte* le régime le plus strict : le plat commun **est** son plat,
  donc il ne diverge pas. C'est écrit dans la prémisse ① de `dietDiverges`.

---

# §A — LES TROIS MODES NE FONT QUE **DEUX** CONSIGNES

## A.1 · `one_session` et `separate_sessions` envoient un prompt **byte-identique**

`sha256` des prompts réellement envoyés, **sur tous les runs vidés** :

```
run                        sha256(prompt-system)  sha256(prompt-user)
one_dish/run-1             78e49d8a39eb7317…      b79243618e392d22…
one_dish/run-2             78e49d8a39eb7317…      b79243618e392d22…
one_dish/run-3             78e49d8a39eb7317…      b79243618e392d22…
one_session/run-1          c42af2691130bdff…      c5e662b1890d21fb…
one_session/run-2          c42af2691130bdff…      c5e662b1890d21fb…
one_session/run-3 (part.)  c42af2691130bdff…      c5e662b1890d21fb…
separate_sessions/run-1    c42af2691130bdff…      c5e662b1890d21fb…   ← les mêmes
separate_sessions/run-2    c42af2691130bdff…      c5e662b1890d21fb…   ← les mêmes
```

**Huit runs vidés, DEUX prompts.** `diff one_session/run-1/dump/prompt-user.txt
separate_sessions/run-1/dump/prompt-user.txt` → **vide**, idem sur le prompt
système. **Pas un octet ne sépare « un peu personnalisé » de « très
personnalisé ».**

Ce n'est pas un tirage, c'est de l'arithmétique :

- en composition ordinaire, `computedShape` ne vaut que `one_dish` ou
  `one_session` — `separate_sessions` n'y est **jamais** calculé
  (`generate-household-meal-v1/index.ts:3090-3097` — « LE BARREAU DE LA
  COMPOSITION. `one_session` ou rien », et la note `:3038-3041` :
  « ③ n'a été mesuré que sur une fusion ») ;
- `capCookingShape` (`household_portions.ts:696-710`) sert `computed` dès que
  `wanted > found` ;
- `separate_sessions` a le **rang 2** ⇒ `wanted > found` **toujours**.

⇒ **Le barreau ③ est inatteignable hors fusion.** Archivé, deux runs sur deux :
`{"asked":"separate_sessions","computed":"one_session","served":"one_session","unused":true}`.

⛔ **Je ne « répare » pas le plafond** — ouvrir vraiment une seconde session est
un changement de nature, et il est à faire trancher par un humain. Mais ce qui se
mesure ici, et qui n'est pas le plafond : **un écran propose trois choix dont deux
sont le même**, et le troisième s'accompagne d'une phrase fausse (§A.3).

## A.2 · `one_dish` fait, lui, une vraie différence

Le plafond **mord** :
`{"asked":"one_dish","computed":"one_session","served":"one_dish","capped":true,"dish_bearing":[]}`.

Ce que ça retire du prompt, à l'octet (`diff one_dish ↔ one_session`) :

| | `one_dish` | `one_session` / `separate_sessions` |
|---|---|---|
| ligne de forme | `Cook ONE set of preparations for everyone. Do NOT propose separate dishes.` | `…SOME of the people below cannot be served from it…` (le **pluriel**, `ONE_SESSION_LINES_MANY`) |
| `== A DISH OF THEIR OWN ==` | absent | présent, **3 bouches nommées avec leur `member_id`** |
| `== WHOSE DISH IS IT ==` (système) | absent | présent, avec la table des 3 ids |
| « X cannot be served from that shared dish » | absent | présent |
| **budget de plats** | `at most 2 dishes` | `at most 4 dishes` |

**Verdict A** : sur **trois** modes demandés, **deux** consignes distinctes sont
servies, et le troisième mode est un synonyme silencieux du deuxième.

## A.3 · Le mode ③ fait dire au plan une phrase **fausse**

`plan_rationale.ts:410-412` :

> `You left room for separate dishes. Nobody at this table needs one this week: there is a single cook.`

Sortie sur **les deux runs `separate_sessions`** — pendant que, dans le **même
plan** :

- `cooking.diverging` nomme **trois** bouches ;
- `cookingShapeChoice.outsideSharedPot` en portait **trois** (`index.ts:4453-4459`) ;
- le prompt promettait un plat à chacune ;
- et le plan livré **contient effectivement le plat propre d'Aurèle**, aux deux
  créneaux.

Le code justifie le silence par « il n'y a personne à nommer »
(`plan_rationale.ts:682-685`). En composition, il y a **trois** personnes à
nommer. La branche `unused` a été écrite pour une **fusion**, où `unused` implique
bien « personne ne diverge » ; en composition elle est déclenchée par la seule
arithmétique de §A.1. Et **« there is a single cook » n'a aucune prémisse dans
l'entrée** : rien, dans cette requête, ne dit combien de personnes cuisinent.

---

# §B — LE TABLEAU **PAR BOUCHE ET PAR MODE**

⚠️ **Jamais une moyenne.** **Dix runs** — 8 plans écrits, 1 plan perdu
(`meal_unparseable`), 1 plan écrit hors dossier (§E) — une ligne par
(mode, run, bouche).
`—` = aucun plat à elle. Les grammes sont ceux des **boîtes**, écrits par le
moteur (`box_sizing.sized` = toutes les boîtes, `unchanged: 0`, sur chaque plan).

| mode | run | bouche | nommée | plat à elle | boîtes servies (g) |
|---|---|---|---|---|---|
| `one_dish` | 1 | Aurèle | ✅ | — | beans 291 · beans 291 · riz 175 |
| `one_dish` | 1 | Marceline | ✅ | — | beans 292 · beans 292 · riz 175 |
| `one_dish` | 1 | Solveig | ✅ | — | beans 313 · beans 313 · riz 188 |
| `one_dish` | 1 | Théodule | ✅ | — | beans 248 · beans 248 · riz 149 |
| `one_dish` | 2 | Aurèle | ✅ | — | stew 339 · stew 339 · riz 175 |
| `one_dish` | 2 | Marceline | ✅ | — | stew 340 · stew 340 · riz 175 |
| `one_dish` | 2 | Solveig | ✅ | — | stew 365 · stew 365 · riz 188 |
| `one_dish` | 2 | Théodule | ✅ | — | stew 289 · stew 289 · riz 149 |
| `one_dish` | 3 | Aurèle | ✅ | — | chilli 388 · chilli 388 · riz 242 · courgettes 170 |
| `one_dish` | 3 | Marceline | ✅ | — | chilli 389 · chilli 389 · riz 243 · courgettes 170 |
| `one_dish` | 3 | Solveig | ✅ | — | chilli 417 · chilli 417 · riz 261 · courgettes 183 |
| `one_dish` | 3 | Théodule | ✅ | — | chilli 331 · chilli 331 · riz 207 · courgettes 145 |
| `one_session` | 1 | Aurèle | ✅ | **wed/dîner** | base 242 · **bœuf 109** · patate 145 |
| `one_session` | 1 | Marceline | ✅ | **wed/dîner** | base 243 · **bœuf 109** · patate 146 |
| `one_session` | 1 | Solveig | ✅ | **wed/dîner** | base 261 · **bœuf 117** · patate 157 |
| `one_session` | 1 | **Théodule (végane)** | ✅ | — | base 207 · ⛔ **bœuf 93** · patate 124 |
| `one_session` | 2 | — | — | — | ⛔ **plan perdu** (`meal_unparseable`, §D.5) |
| `one_session` | 3 | — | — | — | ⛔ **abandonné au poste** (6 expirations à 60 s d'affilée) |
| `separate_sessions` | 1 | Aurèle | ✅ | **wed/déj. + wed/dîner** | base 485 · brocoli 145 · **poulet/tofu 126** |
| `separate_sessions` | 1 | Marceline | ✅ | ⛔ **—** (jeté par le plafond) | base 486 · brocoli 146 · **poulet/tofu 126** |
| `separate_sessions` | 1 | Solveig | ✅ | ⛔ **—** (jeté par le plafond) | base 522 · brocoli 157 · **poulet/tofu 136** |
| `separate_sessions` | 1 | **Théodule (végane)** | ✅ | — | base 413 · brocoli 124 · ⛔ **poulet/tofu 107** |
| `separate_sessions` | 2 | Aurèle | ✅ | **wed/déj. + wed/dîner** | **poulet 194** · haricots 194 · patate 194 · chou kale 97 |
| `separate_sessions` | 2 | Marceline | ✅ | ⛔ **—** (jeté par le plafond) | **poulet 194** · haricots 194 · patate 194 · kale 97 |
| `separate_sessions` | 2 | Solveig | ✅ | ⛔ **—** (jeté par le plafond) | **poulet 209** · haricots 209 · patate 209 · kale 104 |
| `separate_sessions` | 2 | **Théodule (végane)** | ✅ | — | ⛔ **poulet 165** · haricots 165 · patate 165 · kale 83 |

### Les deux runs du **delta** (§C.3bis) — dégoût de Marceline = `sweet potato`

| mode | run | bouche | nommée | plat à elle | boîtes servies (g) |
|---|---|---|---|---|---|
| `one_dish` | D1 | Aurèle | ✅ | — | haricots 194 · haricots 194 · légumes 145 · légumes 145 · riz 175 |
| `one_dish` | D1 | Marceline | ✅ | — | haricots 194 · haricots 194 · légumes 146 · légumes 146 · riz 175 |
| `one_dish` | D1 | Solveig | ✅ | — | haricots 209 · haricots 209 · légumes 157 · légumes 157 · riz 188 |
| `one_dish` | D1 | Théodule | ✅ | — | haricots 165 · haricots 165 · légumes 124 · légumes 124 · riz 149 |
| `one_session` | D1 | Aurèle | ✅ | **wed/déj. + wed/dîner** | bœuf 242 · haricots 242 · poulet 291 · pois chiches 242 · quinoa 145 |
| `one_session` | D1 | Marceline | ✅ | ⛔ **—** (jeté par le plafond) | bœuf 243 · haricots 243 · poulet 292 · pois chiches 243 · quinoa 146 |
| `one_session` | D1 | Solveig | ✅ | ⛔ **—** (jeté par le plafond) | bœuf 261 · haricots 261 · poulet 313 · pois chiches 261 · quinoa 157 |
| `one_session` | D1 | **Théodule (végane)** | ✅ | — | ⛔ **bœuf 207** · haricots 207 · ⛔ **poulet 248** · pois chiches 207 · quinoa 124 |

⚠️ `one_session`/run-D1 est le run le plus parlant du lot : le modèle a
**dédoublé chaque préparation** pour le régime (une version viande, une version
végétale), et le moteur a quand même collé **les deux lignes de viande** dans la
phrase de l'enfant végane.

### Les créneaux couverts, par mode

| mode | run 1 | run 2 | run 3 |
|---|---|---|---|
| `one_dish` | `wed/lunch` + `wed/dinner` ✅ | idem ✅ | idem ✅ |
| `one_session` | ⛔ **`wed/dinner` seulement** (`empty_slots: wed/lunch`) | ⛔ aucun (plan perdu) | ⛔ aucun (poste) |
| `separate_sessions` | `wed/lunch` + `wed/dinner` — mais **4 plats jetés** | idem, **4 plats jetés** | non lancé |

### Le facteur de part, par bouche — **identique sur les 8 plans et les 3 modes**

| bouche | 92 kg Aurèle | 74 kg Marceline | 55 kg Solveig | 29 kg Théodule (9 ans) |
|---|---|---|---|---|
| facteur mesuré | **1,000** (référence) | **1,003** | **1,077** | **0,852** |

Reproduit à trois décimales sur **les huit plans écrits** : `one_dish` run-1
(291/292/313/248), run-2 (339/340/365/289), run-3 (388/389/417/331), run-D1
(194/194/209/165 et 145/146/157/124) ; `one_session` run-1 (242/243/261/207),
run-D1 (242/243/261/207) ; `separate_sessions` run-1 (485/486/522/413) et run-2
(194/194/209/165). **Aucun run, aucun mode, aucune préparation ne s'en écarte.**

C'est **le moteur**, pas le modèle : `box_sizing.sized = 12` sur 12 boîtes,
`unchanged: 0`. Le facteur est la **maintenance estimée rapportée à la moyenne de
la table** (`household_portions.ts:2196-2226`), pas le poids.

---

# §C — LES CINQ QUESTIONS

## C.1 · Chaque bouche est-elle **nommée et servie** ? — **NOMMÉE : oui, 4/4, partout. SERVIE : non.**

**Nommée : 24 lignes sur 24** portent le bon prénom, dans les six plans.
`portion_missing:<id>` n'est **jamais** levé, `portions_without_a_roster_line` est
vide partout.

⚠️ **La cicatrice F5 (« une part au prénom vide disparaît en silence ») n'est pas
reproductible aujourd'hui, et je le dis avec le code plutôt qu'avec un run** :

- `index.ts:1577` : `displayName: String(r.first_name ?? "").trim() || "Member"` —
  un prénom vide devient `"Member"`, jamais `""` ;
- `household_portions.ts:3550` : `portions = members.map(…)` — la liste est
  construite **en parcourant le roster**, pas la réponse du modèle. Une bouche que
  le modèle oublie reçoit une ligne vide **et** l'issue `portion_missing:<id>`.

La porte qui reste ouverte est `index.ts:4457` (`.filter(Boolean)` sur
`outsideSharedPot`) : un prénom vide y ferait disparaître la personne **de la
phrase du plan** — mais `:1577` le rend inatteignable par le roster.

**Servie : NON.** Voir C.4 — sur `separate_sessions`, deux bouches sur trois
n'ont eu leur plat sur **aucun** des deux runs ; sur `one_session`, **tout le
monde** a perdu le déjeuner.

## C.2 · Une allergie d'UNE bouche protège-t-elle TOUTE la casserole ? — **OUI**

- Le prompt l'**attribue** : `- Solveig: sesame — allergy, severity=medical
  (declared by student)`, et le bloc qui suit dit explicitement que le nom ne
  restreint pas la portée (`ONE MOUTH'S HARD CONSTRAINT GOVERNS EVERYTHING`).
- Sur **les 8 plans écrits** : **aucun aliment de la famille sésame** n'est servi — ni
  graine, ni huile, ni tahini, ni pâte. Vérifié sur `preparations[].ingredients`,
  `dishes[].ingredients` et `shopping_list` des six sorties.
- Les mentions du mot sont **toutes des refus**, et elles sont **attribuées à la
  bonne bouche** :
  - `dishes[].why` = « A safe, smoky meal **for Solveig** that avoids sesame
    entirely » (`one_session`/run-1) ;
  - `member_portions[Solveig].portion_note` = « **Ensure no sesame is present.** »
    (`separate_sessions`/run-2), « **Absolutely no sesame products.** » (plan
    `43ee0fb2`).
- Aucune trace d'un « garde-le loin d'elle » — le contre-motif que 1V avait mesuré
  sur le pistachio (I-2). **L'attribution n'a pas restreint la portée** : c'était
  le risque du lot 06, il n'est pas réalisé sur mes runs.

⚠️ **DEUX PRÉCISIONS QUI CHANGENT LA LECTURE, ET QUE JE NE MASQUE PAS :**

1. **Le mot `sesame` EST bien dans deux plans, en INGRÉDIENT et en COURSES** —
   mais toujours dans une **négation écrite par le modèle** :
   `one_dish`/run-1 → `chipotle paste (sesame-free)`, `flour tortillas
   (sesame-free)`, et en courses `flour tortillas (check for sesame-free)` ;
   `one_dish`/run-2 → `sesame-free chipotle paste`. **Ces plans sont sortis en
   200** — le verrou médical **n'a pas mordu** sur ces libellés. C'est le bon
   comportement, et c'est **précisément la forme que ce dépôt a mesurée comme
   mordante ailleurs** (« négation après le terme »). Ici, elle ne mord pas :
   fait à consigner tel quel, dans les deux sens.
2. **La force de la réponse reste limitée par la scorie D-6 de 1B** : rien, dans
   ces menus, n'appelait *naturellement* du sésame — c'est même pour ça que
   §C.3 a exigé un delta.

## C.3 · Un dégoût impose-t-il son goût à tout le monde ? — **OUI, DANS LES DEUX MODES MESURÉS** (il a fallu un delta pour le voir)

Sur la fixture d'origine : `fennel` → **0 occurrence** dans les sorties. **Cette
absence n'apprend rien** — le fenouil n'était candidat dans aucun menu. C'est
exactement la scorie D-6 rejouée, et je refuse de la compter comme une case
cochée.

Deux faits réels s'en dégagent tout de même :

1. **La règle de maison est attribuée**, comme le dégoût doit l'être :
   `HOUSE RULES … - Marceline: never serve fennel`.
2. **Le modèle a voulu la commenter, et la garde a mordu.** Sortie brute de
   `one_session`/run-1 : *« This dish satisfies the smoky request without using
   fennel, respecting Marceline's house rule. »* → `issues` porte
   `house_rule_commented:…:fennel`, et le texte final ne contient plus le mot.
   La consigne « never explain them, never comment on them » est donc **désobéie
   par le modèle et rattrapée par le produit**.

**Le delta** (`2026-08-19-0410-3a-delta-degout.sql`) : le dégoût de Marceline
devient `sweet potato`. Le **dénominateur est mesuré, pas supposé** — avant le
delta, le modèle a mis de la patate douce **de lui-même dans 4 plans sur 6**
(`one_dish` run-2 et run-3, `one_session` run-1, `separate_sessions` run-2).
Une absence après le delta devient donc lisible. Le delta atteint bien le
prompt : `HOUSE RULES … - Marceline: never serve sweet potato`
(`one_dish/run-D1/dump/prompt-user.txt` l. 243).

Résultat : voir §C.3bis.


## C.3bis · LE DELTA — le dégoût porte enfin sur un aliment que le menu réclame

Fixture inchangée sauf **un octet** : le dégoût de Marceline passe de `fennel` à
`sweet potato`. Le dénominateur est mesuré (4 plans sur 6 en contenaient de
lui-même), et le delta atteint bien le prompt :
`HOUSE RULES … - Marceline: never serve sweet potato`.

| run | mode servi | `sweet potato` dans le plan | servi à |
|---|---|---|---|
| `one_dish/run-D1` | `one_dish` (plafonné) | **NON**, 0 occurrence | **personne** |
| `one_session/run-D1` | `one_session` | **NON**, 0 occurrence | **personne** |
| `separate_sessions/run-D1` | — | non lancé (poste) | — |

Vérifié sur `preparations[].ingredients`, `dishes[].ingredients`,
`dishes[].method`, les titres et la `shopping_list` des deux sorties.

**Ce que ça dit** — et c'est à lire mode par mode, parce que la réponse n'est pas
la même :

- **En `one_dish` : imposé, et c'est structurellement inévitable.** Il n'y a
  qu'une casserole, et une casserole ne peut pas à la fois contenir et ne pas
  contenir de la patate douce. Le modèle a **substitué** (courgette + poivrons),
  il n'a pas appauvri le plat, et le plan **annonce** le mécanisme : « You asked
  for one dish for everyone, and that is what was cooked. » Coût réel, mais
  honnête.
- ⛔ **En `one_session` : IMPOSÉ AUSSI, et là ça n'a rien d'inévitable.** C'est le
  mode où Marceline compte parmi les **trois** bouches à qui la consigne promet
  « a dish of their OWN ». La patate douce disparaît quand même de **toute** la
  table : cinq préparations, aucune n'en contient. Le modèle a composé un
  couple bœuf/haricots noirs et un couple poulet/pois chiches — il sait
  parfaitement dédoubler une préparation pour un régime, **il ne le fait pas pour
  un dégoût**.

**Réponse à la question ③ : le dégoût d'une bouche impose son goût à toute la
table, dans les deux modes mesurés.** Le prompt ne le demande pas — il dit
« Simply do not put these foods on **these people's** plates » — mais rien ne
distingue, côté sortie, « retiré de sa part » de « retiré de la casserole », et
**rien ne le compte** : aucune `issue`, aucun compteur. Un dégoût respecté à la
lettre et un dégoût sur-appliqué à toute la maison sont, pour l'instrumentation,
**le même plan**.

## C.4 · Le résultat est-il **équilibré entre les bouches** ? — **NON, et le déséquilibre est SYSTÉMATIQUE**

⚠️ Regardé **par bouche**, jamais en moyenne. Sur les **trois** runs qui ont
servi la consigne ② (`separate_sessions` run-1 et run-2, `one_session` run-D1) :

| bouche | plat à elle promis par le prompt | plat à elle **livré** |
|---|---|---|
| Aurèle | 2 (déj. + dîner) | **2 · 2 · 2** |
| Marceline | 2 | **0 · 0 · 0** |
| Solveig | 2 | **0 · 0 · 0** |

`dish_owners` archivé : `{"asked": 6, "declared": 2, "attributed": 2}` sur les
**trois** runs (et `{6, 2, 2}` aussi sur le plan orphelin `43ee0fb2`, §E — quatre
fois de suite). **Six plats promis, deux livrés, et toujours à la même
personne.**
C'est la définition de « une personne obtient systématiquement le plat des
autres », vue **par bouche** ; une moyenne (« 2 plats dédiés sur 4 mouths ») ne
l'aurait pas montrée.

Ce n'est pas un caprice du modèle : **le modèle a écrit les 8 plats**. C'est le
**plafond de plats** qui en a jeté 4 (§D.1). Et l'éviction n'est même pas
aveugle : `sacrificeFor` (`meal_generation.ts:3894-3901`) sacrifie le plat de
**rang le plus élevé**, ce qui protège d'abord la couverture des créneaux —
donc les plats de la table. Le résultat est que **les seuls plats sacrifiables
sont les plats dédiés**, et qu'ils tombent dans l'ordre où les bouches sont
nommées. Aurèle est nommé en premier dans le roster ; il gagne à chaque fois.

Sur `one_session`, le même plafond produit l'autre dommage : le modèle **retire
le déjeuner de tout le monde** pour tenir dans 4 plats
(`empty_slots: wed/lunch`).

Sur `one_dish`, l'équilibre est réel — mais parce qu'il n'y a **rien à
distribuer** : un seul plat pour tous, et le plan le dit honnêtement
(`shapeCappedMany`, §A.2).

## C.5 · Les trois modes produisent-ils **trois résultats distincts** ? — **NON. DEUX.**

Sur les **mêmes entrées** (même foyer, même fenêtre, même contexte) :

| | consigne servie | plafond de plats | plats dédiés promis | archivé |
|---|---|---|---|---|
| `one_dish` | `one_dish` | 2 | 0 | `capped: true` |
| `one_session` | `one_session` | 4 | 6 | rien à retenir |
| `separate_sessions` | `one_session` | 4 | 6 | `unused: true` |

Les deux derniers **partagent le même prompt à l'octet** (§A.1). La seule chose
qui les distingue est **la phrase du plan**, et c'est une phrase **fausse**
(§A.3). **Le critère de sortie du lot est donc atteint par le second terme :
l'écart est mesuré et nommé, avec les octets.**

---

# §D — CE QUI EST CASSÉ, NOMMÉ (je mesure, je ne corrige pas)

## D.1 · ⛔ Le budget de plats est plafonné, la consigne ne l'est pas — **contradiction dans le même prompt**

Deux lignes du **même message utilisateur** (`one_session/run-1/dump/prompt-user.txt`) :

```
l. 116 : how much: day (at most 4 dishes)
l. 225 : That is 6 extra dishes on top of the table's
         meals, and the dish budget above already has room for them.
```

Il en faudrait **8** (2 pour la table + 6 dédiés). Le calcul :

- `base = dishCapFor("day", [lunch,dinner], 1) = 2` ;
- `asked = dedicatedDishesFor(one_session, 3 bouches × 2 repas) = 6` ;
- `mergeDishBonus` (`household_portions.ts:936-971`) rend
  `min(max(shown, asked), ceiling)` avec **`ceiling = baseCap = 2`** ⇒ **2** ;
- `dishBudgetFor` = 2 + 2 = **4**.

**`mergeDishBonus` a été écrit pour une FUSION**, où l'on reprend **une** personne :
`asked` y vaut au plus ses repas, donc au plus `baseCap`, et le plafond ne mord
jamais. Depuis que le barreau ② est atteignable en **composition ordinaire**
(2026-08-14), `asked` vaut `N × baseCap` pour `N` divergents, et **le plafond mord
systématiquement dès `N ≥ 2`**.

⚠️ **C'est structurel, pas un effet de ma fenêtre d'un jour.** Le bonus est borné
par `baseCap`, donc le budget vaut **au plus `2 × baseCap`** ; la consigne, elle,
réclame `(1 + N) × baseCap`. À `N = 3` divergents et une fenêtre de 7 jours :
budget = 14 + 14 = **28**, demande = 14 + 42 = **56**. Le rapport est le même —
**la moitié**, à toute taille de fenêtre.

**Le coût, mesuré, exactement celui que le fichier prédit** (« le parseur jetterait
les DERNIERS plats de la liste… le dîner du dimanche du foyer, perdu en silence »,
`household_portions.ts:948-950`) :

- `separate_sessions` run-1 et run-2 : le modèle écrit **8 plats**, le parseur en
  **jette 4** (`dishes[6]`, `dishes[7]` *dropped* ; `dishes[4]`, `dishes[5]`
  *kept* en éjectant deux autres). **Marceline et Solveig perdent leur plat, deux
  fois sur deux.**
- `one_session` run-1 : le modèle **sacrifie le déjeuner de toute la table**
  (`empty_slots: wed/lunch`) pour tenir dans 4.

⚠️ La ligne l. 225 est de surcroît **fausse** : elle affirme « the dish budget
above already has room for them ». Il n'y en a pas.

## D.2 · ⛔ La ceinture de régime n'est **pas branchée** sur la lane foyer — et le mineur végane mange de la viande

`scanDietaryRegime` (`_shared/keel/dietary_regime.ts:453`) est le seul vérificateur
de régime **sur la sortie**. Ses appelants :

```
generate-meal-v1/index.ts:215, :2400   ← la lane SOLO, une occurrence
generate-household-meal-v1/index.ts    ← ZÉRO occurrence
```

Sur la lane foyer, `household_diet.ts` **écrit la consigne dans le prompt**
(`householdDietBlock`, `index.ts:3726`) et **rien ne relit la réponse**. La lane
qui n'a pas de ceinture est **la seule où plusieurs régimes se rencontrent autour
d'une casserole**.

**Le coût, mesuré, trois fois :**

| run | ce que Théodule (végane, 9 ans) a dans sa boîte et dans **la phrase lue à table** |
|---|---|
| `one_session` run-1 | `Slow-Simmered Smoky Beef` **93 g** |
| `separate_sessions` run-1 | `Roasted Chicken and Smoked Tofu` **107 g** |
| `separate_sessions` run-2 | `Smoky Roasted Chicken Thighs` **165 g** |
| `one_session` run-D1 | ⛔ **DEUX** : `Rich Smoky Beef Stew` **207 g** *et* `Smoky Roast Chicken & Cauliflower` **248 g** |
| plan orphelin `43ee0fb2` (§E) | `Smoky Pan-Seared Chicken Thighs` **165 g** |

**Cinq plans ② sur cinq.** Ce n'est pas un tirage : dès que le plat de la table
et le plat dédié coexistent, le modèle met la bouche végane dans **toutes** les
boîtes, et le moteur recolle **tous** les grammes. `one_session`/run-D1 est le cas
le plus net — le modèle avait pourtant **dédoublé chaque préparation** pour le
régime (`Rich Smoky Beef Stew` / `Smoky Black Bean Stew`,
`Smoky Roast Chicken & Cauliflower` / `Smoky Roast Chickpeas & Cauliflower`) :
la version végane existe, elle est cuisinée, et l'enfant reçoit quand même la
ligne de la viande.

Et sur `one_session` run-1, **le moteur contredit le modèle** : le modèle avait
donné à Théodule **2** `preparation_shares` (la base de haricots et la patate
douce — **pas** le bœuf) ; `attachSizedQuantities`
(`household_portions.ts:3805-3847`) parcourt **toutes** les préparations et
recolle un gramme dès que la bouche figure dans **une boîte**, sans jamais
consulter ni ses parts déclarées ni son régime. La phrase finale porte donc
**3** quantités, dont le bœuf.

⚠️ **Aucun compteur, aucune `issue`, aucun journal** ne signale ces trois
brèches. Un run vert et un run qui sert de la viande à un enfant végane sont, du
point de vue de l'instrumentation, **le même run**.

## D.3 · ⛔ `separate_sessions` fait dire au plan « personne n'en a besoin » à trois divergents

Voir §A.3. Deux runs sur deux. `plan_rationale.ts:410-412` et `:682-699`.

## D.4 · La part suit la **maintenance moyenne de la table**, pas le corps

Mesuré (§B) et **identique sur 5 plans / 3 modes** : 92 kg → 1,000 ;
74 kg → 1,003 ; 55 kg → 1,077 ; **29 kg et 9 ans → 0,852**.

Autrement dit : deux adultes séparés de **18 kg** sont servis à **0,3 %** l'un de
l'autre, et **un enfant de 29 kg reçoit 85 % de l'assiette d'un homme de 92 kg**.
Le mécanisme est explicite et assumé dans le code (`household_portions.ts:2213-2226` :
la référence est *la moyenne de la table*, pas un adulte de référence) — mais son
effet **par bouche** n'a, à ma connaissance, jamais été rendu. Je le nomme, je ne
le change pas : `household_portions.ts` est acquis pour ce lot.

## D.5 · Un guillemet parasite coûte le plan entier

`one_session`/run-2 : la réponse du modèle fait **18 664 caractères** et se
termine proprement, mais porte un `"` de trop à la position 9 406
(`"box_id": "box_rice_solveig"\n"`). Résultat : `meal_unparseable`, **aucun plan,
aucune seconde tentative de parsing, aucun message pour l'utilisateur** autre que
l'erreur brute. 1 run sur 7 aboutis.

## D.6 · Le modèle commente les règles de maison

`one_session`/run-1 : *« …respecting Marceline's house rule »* écrit dans un
`why`, alors que le prompt dit `never explain them, never comment on them`. La
garde `house_rule_commented` a mordu et le texte final est propre — **la garde
fonctionne sur le texte des PLATS**.

⛔ **Mais elle ne couvre pas la phrase de portion.** Plan `43ee0fb2` (§E) :
`member_portions[Marceline].portion_note` = « Serve the chicken and sweet
potatoes first, with the peppers on the side. **Ensure no fennel is used.** » —
le commentaire de la règle de maison passe, et il passe sur la surface **la plus
lue** (celle qu'on lit à voix haute à table). Même motif que §D.2 : la ceinture
est posée sur `dishes`, pas sur `member_portions`.

---

# §E — LE POSTE, ET CE QUE JE N'AI PAS PU MESURER

- **Modèle** : `gemini-3-flash-preview` sur **tous** les runs (voir la réserve en
  tête). `gpt-5.4-mini` et `gpt-5.4-nano` rendent 429 `credit_balance_exhausted`.
- **Timeouts** : le repli expire à **60 s** sur cette lane, environ **une fois sur
  deux** ; un run demande souvent 3 à 6 tentatives internes. C'est pour ça que la
  fenêtre est d'un jour.
- **502 Kong / `WORKER_LIMIT`** : rencontrés, jamais conclus — `retry-run.sh`
  relance et **change de `request_id` à chaque tentative** (rejouer le même id
  empile les événements et le vidage rend alors l'erreur d'un run qu'on n'a pas
  mesuré).
- **Chaque ligne a été prouvée existante avant lecture** (`select source, model,
  status … where request_id=…`, dans `<run>/model.txt`) et vidée avec `--source`
  explicite — un `request_id` foyer porte souvent deux appels.
- **Un run abandonné a quand même écrit son plan.** `one_session`/run-3 : j'ai
  arrêté le client après six expirations à 60 s ; **le serveur, lui, a fini** et a
  écrit le plan `43ee0fb2-f99e-4999-b0dc-c0b404db049b` à 02:13:42 UTC — qui a
  ensuite rendu `plan_overlaps_existing` au run suivant. Je ne le compte **pas
  comme une mesure** — `http-response.json` et `inputs.json` manquent, la règle
  des trois fichiers n'est pas tenue, et **je ne les recopie pas d'un autre run**
  (`one_session/run-3/NOTES.md` dit exactement ce qui existe). Le **vidage**, lui,
  a bien eu lieu : son prompt porte `c5e662b1890d21fb…`, **le même que
  `separate_sessions`** — huitième confirmation de §A.1. Son archive **corrobore**
  aussi §D.1 et §D.2 :
  `dish_owners {asked: 6, declared: 2, attributed: 2}`, et la phrase de Théodule
  (végane, 9 ans) porte **`Smoky Pan-Seared Chicken Thighs` 165 g** — la
  **quatrième** occurrence de viande dans l'assiette de l'enfant végane.
  Elle montre aussi une **seconde fuite de commentaire** que la garde
  `house_rule_commented` ne couvre pas : `member_portions[Marceline].portion_note`
  = « **Ensure no fennel is used.** » — la garde porte sur le texte des PLATS, pas
  sur la phrase de portion.
- ⚠️ **Un piège de poste que j'ai payé et que je consigne** : lancé **sous zsh**,
  `set -- $spec` ne découpe pas le mot (zsh ne fait pas de *word splitting* sur
  une expansion non quotée). Le mode partait alors comme
  `"one_dish 3a010001"` — un jeton hors liste, que `readCookingShape` rend `null`,
  c'est-à-dire **« rien n'a été demandé »**. Le run part, rend 200, et mesure le
  calcul seul : **un run muet qui ressemble exactement à un run**. Détecté sur le
  `request_id` tronqué en base, pas sur la sortie. Tous les scripts de ce lot
  portent donc `#!/usr/bin/env bash` et sont lancés par `./`.
- **Non mesuré** : le barreau ③ sur une **fusion** (le seul endroit où il est
  atteignable) ; un foyer où **toutes** les bouches ont un compte ; une fenêtre de
  7 jours ; le comportement sous le modèle nominal.

---

# §F — LES FICHIERS

```
03-foyer-modes/
  2026-08-19-0330-3a-fixture-foyer-modes.sql   la fixture (4 bouches, 3 divergentes)
  2026-08-19-0410-3a-delta-degout.sql          le delta du dégoût (§C.3bis)
  run.sh · retry-run.sh · batch.sh · delta2.sh  le harnais (⚠️ tous en BASH)
  analyse.py · tableau.py · degout_verdict.py   la lecture PAR BOUCHE
  TABLEAU.txt · ANALYSE.json                    leur sortie, figée
  one_dish/ one_session/ separate_sessions/
    inputs.json  prompt-system.txt  prompt-user.txt  output.json  plan.json
    run-1/ run-2/ run-3/ [run-D1/]   (run-D1 = le delta du dégoût)
      inputs.json          les entrées relues EN BASE au moment du run
      request-body.json    le corps POST, `cooking_shape` compris
      request-id.txt       l'id RÉELLEMENT servi (un par tentative)
      model.txt            QUEL MODÈLE a servi — la ligne de preuve d'existence
      dump/prompt-*.txt    le prompt envoyé (`--source` explicite)
      dump/output.json     le vidage de l'instrument
      http-response.json   la sortie
      plan-written.json    `generated_from.household.{cooking,box_sizing,dish_owners}`
```

**La règle des trois fichiers est tenue à chaque run** : les entrées, le prompt
envoyé, la sortie obtenue — plus l'archive de ce que le moteur a décidé. La seule
exception est `one_session/run-3`, dont le client a été tué ; elle porte un
`NOTES.md` qui dit exactement ce qui manque, et le RAPPORT ne la compte pas comme
une mesure.

---

# §G — ADDENDUM 03:00 UTC · UNE LANE VOISINE ÉCRIT DANS MON FOYER

**Constat, pas une plainte — et il borne ce rapport.**

À 02:57:43 UTC, un plan `617ab89c-…` a été écrit sur **mon** foyer
(`43102a0a-…`) par **mon** compte (`3a000000-…-001`), **une demi-heure après mon
dernier run et alors qu'aucun de mes processus ne tournait plus**
(`pgrep` à 0, vérifié). Les événements modèle voisins portent des `request_id`
en `7ce10002-…`, qui ne sont pas les miens (tous les miens sont en `3a0…`).

⇒ **Une autre lane compose sur `qa3a.foyer@keeltest.dev`.** C'est très
exactement la contamination que 06 avait mesurée sur le foyer de 1V, dans
l'autre sens.

**La borne, à retenir avant de relire ce dossier :**

- ✅ **Toutes mes mesures sont datées entre 01:50 et 02:26 UTC** et sont donc
  **antérieures** — elles ne sont pas affectées.
- ⛔ **Aucun plan de ce foyer postérieur à 02:26 UTC ne m'appartient.** Ne les
  lisez pas comme des runs de l'étape ③.
- ✅ **La fixture est intacte** (relue à 03:00) : les 4 bouches, les objectifs,
  le régime végane de Théodule, l'allergie sésame de Solveig, et le dégoût
  `sweet potato` de Marceline (mon delta) sont tous en place.

⚠️ **Et cette ligne étrangère confirme §D.1 une cinquième fois, sur un run que je
n'ai pas lancé** : `617ab89c` porte `cooking.asked = one_session` et
`dish_owners = {"asked": 6, "declared": 2, "attributed": 2}`. **Six plats promis,
deux livrés** — la même arithmétique, sur une lane qui n'est pas la mienne.

---

# CRITÈRE DE SORTIE

> *« Les trois modes produisent trois résultats distincts et conformes, ou l'écart
> est mesuré et nommé — avec les octets. »*

**Atteint par le second terme.** Les trois modes ne produisent **pas** trois
résultats distincts : ils produisent **deux prompts** (§A.1, huit vidages, deux
`sha256`), et le troisième mode est un synonyme silencieux du deuxième assorti
d'une phrase de plan **fausse** (§A.3). L'écart est mesuré, nommé, et rattaché à
sa cause dans le code — `capCookingShape` + `compositionShape`, ligne par ligne.

**Trois choses que je remonte en bloquant, et que je n'ai pas corrigées** :
①  le budget de plats qui promet 8 et n'en ouvre que 4 — **deux bouches sur trois
perdent leur plat, quatre fois sur quatre** (§D.1, §C.4) ;
②  la ceinture de régime absente de la lane foyer — **un enfant végane de 9 ans
reçoit de la viande dans sa phrase de table, cinq plans ② sur cinq**, sans un
compteur (§D.2) ;
③  la phrase « Nobody at this table needs one this week » servie à un foyer où
**trois** bouches divergent (§A.3, §D.3).
