# LOT — LA CEINTURE DE RÉGIME SUR LA LANE FOYER

**2026-08-19 · branche `ff-001-quotidien-du-coach` · lane `generate-household-meal-v1`**

> ### LE DÉFAUT, EN UNE PHRASE
> Un enfant **végane de 9 ans** recevait `Rich Smoky Beef Stew 207 g` et
> `Smoky Roast Chicken & Cauliflower 248 g` dans `member_portions[].portion_note`
> — **la phrase lue à voix haute à table**. Cinq plans ② sur cinq. Aucune
> `issue`, aucun compteur : un run vert et un run qui sert de la viande à un
> enfant végane étaient, pour l'instrumentation, **le même run**.

> ### ⚠️ LA RÉSERVE, EN TÊTE — AUCUN RUN N'A ÉTÉ SERVI PAR LE MODÈLE NOMINAL
> Le compte OpenAI est à sec. Sur **chacun** de mes runs, `gpt-5.4-mini`
> (`GLOBAL_AI_MODEL`, le modèle de la lane) et `gpt-5.4-nano` rendent
> **429 `credit_balance_exhausted`** en moins d'une seconde, et c'est
> **`gemini-3-flash-preview`** qui a produit chaque sortie. Relevé run par run
> dans `llm_raw_response_events` (`<run>/model.txt`).
>
> **Ce que ça limite, et ce que ça ne limite pas.** Le jugement de SORTIE (« le
> modèle a-t-il écrit une boîte de bœuf au nom de l'enfant ? ») vaut pour le
> **repli**, pas pour le nominal. En revanche la ceinture elle-même est du code
> **déterministe** appliqué APRÈS le parseur : elle rend les mêmes octets quel
> que soit le fournisseur, et c'est ce que les épreuves de mutation prouvent
> hors modèle.

---

# §1 — OÙ LA GARDE VIT, ET POURQUOI LÀ

## La question posée : à l'entrée des boîtes, à la validation du plan, ou aux deux ?

**Réponse : à l'affectation des boîtes, DANS LE PARSEUR PARTAGÉ — et à un
second endroit qui n'est pas un refus de plan mais la SECONDE surface de la
même affectation.**

### ① La porte principale — `parseGeneratedMeal`, la boucle des boîtes

`supabase/functions/_shared/keel/meal_generation.ts`, porte **②bis**, juste
après la porte ② (« ce `member_id` n'est pas une bouche de ce plan »).

Trois raisons, dans l'ordre de ce qu'elles coûtent :

1. **C'est là que l'appartenance fausse se crée.** `attachSizedQuantities`
   (`household_portions.ts:3816`) filtre DÉJÀ par appartenance
   (`box.memberIds.includes(p.memberId)`) : elle rapportait fidèlement une
   affectation de boîte déjà fausse. Poser la garde sur la phrase aurait été un
   rattrapage cosmétique — la donnée fausse serait restée en base, dans
   `preparations[].boxes[].member_ids`, lisible par tout ce qui viendra après.
2. **Une garde qu'un appelant doit penser à appliquer est une garde que le
   prochain appelant oubliera.** Cicatrice écrite du dépôt (FF-030 R5), et
   c'est exactement ce qui a produit ce défaut : `scanDietaryRegime` existait,
   était juste, était testé — et n'avait **zéro appelant** sur la lane foyer.
   Dans le parseur, la garde n'est pas un geste que la lane fait : c'est un
   passage obligé. Le paramètre est **REQUIS** (`boxMemberDiets`), donc la
   casse de compilation recense les appelants au lieu d'un `?` qui naît
   désarmé.
3. **Une seule garde couvre les deux surfaces mesurées.** La phrase lue à table
   est CONSTRUITE depuis les boîtes ; corriger la boîte corrige la phrase, par
   construction et pas par un second filtre qui pourrait diverger.

### ② La seconde surface — `reconcilePortions` / `parseShares`

`member_portions[].preparation_shares[]` est une **seconde affectation** de la
même préparation à la même bouche, rendue sous le plat à l'écran, et elle ne
passe pas par les boîtes. Mesuré : `separate_sessions`/run-1 attachait à
Théodule une part de `Roasted Chicken and Smoked Tofu`.

⚠️ **Le scan n'est pas refait.** Le parseur rend `meal.regime_refusals` ; la
seconde surface le **lit**. Deux lectures d'une même liste fermée divergeraient
au premier aliment ajouté — c'est la cicatrice « garde posée sur un seul des
deux champs », déjà payée sur les ids de boîte qui fuyaient dans les notes.

### ③ Le PROMPT — parce que le modèle n'avait pas désobéi, il avait OBÉI

`household_diet.ts`, `householdDietBlock`. Le brief des boîtes ordonne, en
toutes lettres (`boxingOrderLines`) :

```
That is 4 people to weigh out on EVERY preparation: Aurele, Marceline, Solveig, Theodule.
Every name above is in exactly ONE box of each preparation -- never two, never none.
```

Dès que le barreau ② ouvre un plat **dédié** — donc non borné par la ligne
stricte — cette consigne **exige** une boîte au nom du végane sur la casserole
de bœuf. Deux ordres contradictoires dans un seul prompt, et c'est toujours
celui qu'on ne relit pas qui gagne. Trois lignes nomment l'exception, et
**seulement sous la divergence** (sans plat dédié, toute préparation suit la
ligne stricte : il n'y a rien à excepter, et le prompt reste byte-identique).

### Ce que la garde n'est PAS

⛔ **Elle ne réécrit aucune prose.** Aucun titre, aucune méthode, aucun `why`,
aucune `portion_note`, aucune note de part. Elle **refuse une déclaration** —
exactement comme la porte ② refuse un `member_id` étranger au foyer, trois
lignes plus haut, et pour la même raison : le modèle a nommé quelqu'un qui n'a
rien à faire dans cette boîte.

---

# §2 — QUE FAIT-ON D'UN PLAN DÉJÀ FAUTIF ? — LE COÛT DES DEUX OPTIONS, MESURÉ

| | **refus franc du plan** | **retrait de l'appartenance** ✅ |
|---|---|---|
| taux de déclenchement mesuré | **5 plans ② sur 5** ⇒ **100 %** | idem |
| ce que l'utilisateur reçoit | `422 empty_meal`, **semaine vide** | un plan complet |
| qui paie | **le foyer où un végane mange** — et lui seul | personne |
| les autres bouches | **plus rien** | servies, intactes |
| la bouche protégée | **rien** | la casserole végétale du **même** plan |
| ce qu'on perd | tout | la seule ligne fausse |

**Choix : le retrait.** Trois appuis :

1. **Le refus fait payer son régime en semaines vides à la seule population que
   la ceinture existe pour protéger.** C'est l'arbitrage déjà écrit, mot pour
   mot, dans `generate-meal-v1` : « refuser ici viderait la semaine entière
   pour un lardon dans un seul plat ».
2. **La bonne casserole EXISTE dans le même plan.** `one_session`/run-D1 est le
   cas le plus net : le modèle avait **dédoublé** chaque préparation pour le
   régime (`Rich Smoky Beef Stew` / `Smoky Black Bean Stew`,
   `Smoky Roast Chicken & Cauliflower` / `Smoky Roast Chickpeas & Cauliflower`).
   La version végane est cuisinée. Refuser le plan aurait jeté **les deux**.
3. **Le retrait est le geste que le parseur fait déjà** pour un id étranger,
   des grammes illisibles ou une préparation à cible chiffrée. Ce n'est pas un
   geste neuf, c'est la même porte avec une prémisse de plus.

⚠️ **Et le refus n'est pas supprimé, il est déplacé.** Une boîte dont **toutes**
les bouches sont tenues dehors **tombe** — avec son propre motif, jamais celui
de « aucune bouche connue ». Deux causes opposées (un modèle qui invente des
noms / le produit qui protège quelqu'un) ne partagent pas un message.

---

# §3 — LE COMPTEUR : CINQ NOMBRES, DONT TROIS OBLIGATOIRES

`generated_from.household.regime_belt`, **et** sur l'aperçu (`intent: draft`),
**et** dans le journal (`keel.household_meal.dietary_regime`) — parce que
`generated_from` n'existe que sur une ligne **écrite** : quand un plan meurt en
422 ou en `meal_unparseable`, le journal est la seule trace qui reste.

| clé | ce qu'elle dit | le zéro qu'elle désambiguïse |
|---|---|---|
| `mouths` | bouches du roster portant un régime **déclaré** | `0` ⇒ **jamais déclaré** |
| `checked` | appartenances (bouche × boîte) réellement **lues** | `mouths>0 && checked=0` ⇒ aucune boîte écrite pour elles |
| `kept` | celles laissées passer | — |
| `refused` | celles retirées ⇒ **déclaré puis refusé** | — |
| `silenced` | morsures désamorcées par un analogue végétal | `0` ⇒ le désamorçage n'a rien fait / a tout blanchi |
| `unknown_mouth` | dérive entre les deux listes de roster | `>0` ⇒ la ceinture lit un roster qui n'est pas celui des boîtes |

**Propriété testée : `checked === kept + refused`.**

⛔ **Aucun `member_id` dans le compteur** : c'est un histogramme. `generated_from`
est lu par tout le foyer et n'a pas à y désigner un enfant. Les `issues`, elles,
nomment la bouche par id — comme partout ailleurs dans ce parseur.

Le compteur de parts est à trois nombres pour la même raison :
`shares` / `unknown` / **`regime_refused`**. Une part refusée par le régime
n'est **pas** une part orpheline : l'une dit « le modèle a cité une préparation
qui n'existe pas », l'autre « le modèle a servi du bœuf à une végane ».

---

# §4 — LE AVANT / APRÈS SUR LA PHRASE DE L'ENFANT



## AVANT — les cinq plans ②, archivés par l'agent 3A

| run | `request_id` | modèle servi | `member_portions[Theodule].portion_note` |
|---|---|---|---|
| `one_session`/run-1 | `3a020001-0000-4000-8000-000000000002` | `gemini-3-flash-preview` | `… — Smoky Three-Bean and Pepper Base 207 g · ⛔ Slow-Simmered Smoky Beef 93 g · Roasted Sweet Potato Cubes 124 g` |
| `one_session`/run-D1 | `3a020001-0000-4000-8000-000000F00001` | `gemini-3-flash-preview` | `… — Rich Smoky Beef Stew 207 g · Smoky Black Bean Stew 207 g · ⛔ Smoky Roast Chicken & Cauliflower 248 g · Smoky Roast Chickpeas & Cauliflower 207 g · Basic Cooked Quinoa 124 g` |
| `separate_sessions`/run-1 | `3a030001-0000-4000-8000-000000000001` | `gemini-3-flash-preview` | `… — Smoky Three-Bean and Tomato Base 413 g · Charred Smoked Paprika Broccoli 124 g · ⛔ Roasted Chicken and Smoked Tofu 107 g` |
| `separate_sessions`/run-2 | `3a030001-0000-4000-8000-000000020001` | `gemini-3-flash-preview` | `… — ⛔ Smoky Roasted Chicken Thighs 165 g · Slow-Simmered Smoky Black Beans 165 g · Roasted Sweet Potatoes and Peppers 165 g · Sautéed Kale with Garlic 83 g` |
| plan orphelin `43ee0fb2` | *(client tué, serveur fini)* | `gemini-3-flash-preview` | `… — ⛔ Smoky Pan-Seared Chicken Thighs 165 g` |

**`regime_belt` sur ces cinq plans : le champ n'existait pas.** `issues` :
aucune ligne de régime. C'est ça, le défaut, plus encore que les grammes.

⚠️ Et la donnée fausse n'est pas seulement dans la phrase : elle est en base.
`one_session`/run-D1, `preparations[prep_beef_stew].boxes` :
`box_beef_stew_theodule`, `member_ids: ["1fea4f51-…"]`, `grams: 207`. Le modèle
avait écrit une boîte de bœuf **au nom de l'enfant**.

---

# §5 — APRÈS : LE REJEU DÉTERMINISTE SUR LES OCTETS RÉELS

> ⚠️ **Ce n'est pas un run, et c'est plus fort qu'un run.** Aucun appel modèle :
> on relit la sortie **archivée** par l'agent 3A (`dump/output.json`,
> `result.output_text` — les octets exacts qui ont servi du bœuf à l'enfant) et
> on la donne **deux fois** au parseur : une fois avec `boxMemberDiets: []` (le
> comportement d'AVANT ce lot, à l'octet), une fois avec le roster réel. **Le
> modèle ne varie pas**, donc l'écart mesuré est celui du LOT et de rien
> d'autre. Script : `07-ceinture-regime/replay.ts`.

| plan archivé | Théodule (végane, 9 ans) **AVANT** | **APRÈS** | `regime_belt` après |
|---|---|---|---|
| `one_session`/run-1 | 3 préparations, dont ⛔ **Slow-Simmered Smoky Beef** | **2** — Smoky Three-Bean and Pepper Base · Roasted Sweet Potato Cubes | `mouths 1 · checked 3 · kept 2 · refused 1` |
| `one_session`/run-D1 | 5, dont ⛔ **Rich Smoky Beef Stew** et ⛔ **Smoky Roast Chicken & Cauliflower** | **3** — Smoky Black Bean Stew · Smoky Roast Chickpeas & Cauliflower · Basic Cooked Quinoa | `mouths 1 · checked 5 · kept 3 · refused 2` |
| `separate_sessions`/run-1 | 3, dont ⛔ **Roasted Chicken and Smoked Tofu** | **2** — Smoky Three-Bean and Tomato Base · Charred Smoked Paprika Broccoli | `mouths 1 · checked 3 · kept 2 · refused 1` |
| `separate_sessions`/run-2 | 4, dont ⛔ **Smoky Roasted Chicken Thighs** et ⛔ **Roasted Sweet Potatoes and Peppers** | **2** — Slow-Simmered Smoky Black Beans · Sautéed Kale with Garlic | `mouths 1 · checked 4 · kept 2 · refused 2` |

**Quatre plans sur quatre, la viande sort de la part de l'enfant.**
`regime_belt` **avant** : `{mouths 0, checked 0, kept 0, refused 0}` sur les
quatre — le zéro de « jamais déclaré », c'est-à-dire exactement l'aveuglement
qu'on répare.

### ⛔ ET LES TROIS ADULTES NE PERDENT RIEN

Sur les quatre plans, `Aurele`, `Solveig` et `Marceline` gardent **toutes** leurs
préparations, au titre près. La ligne est vide dans la colonne « après » parce
qu'il **n'y a pas de delta** : une garde qui vide la table de tout le monde
n'est pas une garde, c'est une panne.

### 🔎 LA PRISE QUE JE N'ATTENDAIS PAS — ET QUI JUSTIFIE LA PROSE

`separate_sessions`/run-2, `prep_roasted_veg` = **Roasted Sweet Potatoes and
Peppers**. Ses ingrédients sont : patate douce, poivrons, huile d'olive.
**Rien d'animal.** Et la ceinture la refuse quand même — sur sa **méthode**,
écrite par le modèle :

> *« Toss sweet potatoes with oil and roast **on the other half of the chicken
> tray**. »*

`scanDietaryRegime` rend `{token: "chicken", matchedText: "chicken"}` sur la
prose. C'est un **contact croisé déclaré par le modèle lui-même**, invisible à
toute lecture d'ingrédients. C'est la mesure qui justifie d'avoir mis `method`
dans `prose` et pas seulement le titre — et c'est la mutation **M2** qui le
prouve en négatif : sans la prose, cette prise disparaît.

---

# §6 — LES RUNS RÉELS, APRÈS LE LOT

Fixture : celle de l'agent 3A, **inchangée** —
`03-foyer-modes/2026-08-19-0330-3a-fixture-foyer-modes.sql` + le delta du
dégoût. Foyer `43102a0a-72b5-4478-bff8-e7d056501f26`, compte
`qa3a.foyer@keeltest.dev`. Roster relu en base au moment de chaque run
(`<run>/inputs.json`) : Aurèle, Marceline, Solveig **omnivores**, Théodule
**végane, 9 ans**.

**Cinq runs lancés, deux plans écrits, un refus de produit, deux morts au
poste.** Détail sans maquillage :

| run | mode demandé | `request_id` | modèle servi | issue |
|---|---|---|---|---|
| **run-1** | `one_session` | `7ce10001-0000-4000-8000-000000000001` | `gemini-3-flash-preview` (5 tentatives) | ✅ **plan écrit** `617ab89c-…` |
| run-2 | `one_session` | `7ce10002-…0002` | — | ⛔ **502 Kong** — conteneur recréé par la session voisine |
| run-3 | `separate_sessions` | `7ce30002-…0002` | — | ⛔ **`WORKER_LIMIT`** — 5 expirations à 60 s dépassent le mur d'horloge du worker |
| **run-4** | `one_dish` | `7ce40002-…0002` | `gemini-3-flash-preview` | ⚠️ **`422 empty_meal`, `blocked_medical_constraint`** — le verrou SÉSAME de Solveig a mordu (§15) |
| **run-5** | `one_dish` | `7ce50003-0000-4000-8000-000000000003` | `gemini-3-flash-preview` | ✅ **plan écrit** |

⛔ **Aucune conclusion tirée d'un 502 ni d'un `WORKER_LIMIT`** : ce sont des
faits de POSTE. Les deux runs concernés sont relancés avec un **nouveau
`request_id`** et comptés comme non-mesures.

## run-1 · `one_session` — le mode où la brèche vivait

```
regime_belt : { mouths: 1, checked: 3, kept: 3, refused: 0, silenced: 0, unknown_mouth: 0 }
```

| bouche | `portion_note` |
|---|---|
| Aurèle | `… — Smoky Harissa Chicken Thighs 242 g · Herby Fluffy Quinoa 218 g · Charred Courgettes and Sweetcorn 388 g` |
| Marceline | `… — Smoky Harissa Chicken Thighs 243 g · …` |
| Solveig | `… — Smoky Harissa Chicken Thighs 261 g · …` |
| **Théodule (végane, 9 ans)** | ✅ `Mix the smoky chickpeas, quinoa, and charred vegetables together on the plate. — **Slow-Simmered BBQ Chickpeas 413 g** · Herby Fluffy Quinoa 186 g · Charred Courgettes and Sweetcorn 331 g` |

⚠️ **`refused: 0`, et ce n'est PAS la ceinture qui n'a rien fait — c'est le
PROMPT qui a tenu.** Le modèle n'a écrit **aucune** boîte au nom de Théodule sur
`prep_chicken` (3 boîtes, pas 4). `mouths: 1` prouve que la ceinture était
**armée** ; `checked: 3` qu'elle a **lu** ses trois appartenances ; `kept: 3`
qu'elle les a toutes trouvées licites. Les trois adultes gardent leur poulet.

## run-5 · `one_dish` — le contrôle, et il compte autant

```
regime_belt : { mouths: 1, checked: 4, kept: 4, refused: 0, silenced: 0, unknown_mouth: 0 }
lock        : clean     dishes : 2
```

En `one_dish`, **R4** descend la casserole commune au régime le plus strict :
tout est végétal (chilli trois haricots, riz brun, légumes rôtis), donc **il n'y
a rien à refuser**, et c'est le résultat attendu. Les **quatre** bouches sont
servies sur les **quatre** préparations, avec leurs facteurs de part
(242 / 243 / 261 / **207** pour l'enfant).

⛔ **C'est le cas qui prouve que la garde ne mord pas sur tout.** Une ceinture
qui aurait retiré quoi que ce soit ici serait une panne déguisée en protection.

---

# §7 — LES MUTATIONS : CHAQUE GARDE VUE MORDRE

Protocole, six fois : **rouge → remise en état → vert**. Fichiers sauvegardés
avant, comparés `cmp` après (les quatre rendent `OK`).

Épreuve : `deno test --allow-read --allow-env supabase/functions/_shared/keel/household_regime_belt_test.ts`
(**15 tests**).

| # | mutation | fichier | résultat |
|---|---|---|---|
| **M1** | `if (scan.breaches.length > 0)` → `if (false)` — la porte de boîte désarmée | `meal_generation.ts` | 🔴 **4 échecs / 11 passés** → remis → 🟢 **15/15** |
| **M2** | `prose: [title, method]…` → `prose: []` — le titre ne mord plus | `meal_generation.ts` | 🔴 **1 échec / 14 passés** → remis → 🟢 **15/15** |
| **M3** | ligne `if (heldOff?.has(memberId)) continue;` supprimée — le compteur voisin repollué | `meal_generation.ts` | 🔴 **2 échecs / 13 passés** → remis → 🟢 **15/15** |
| **M4** | `if (regimeHeldOff.get(…)?.has(…))` → `if (false)` — la porte des PARTS désarmée | `household_portions.ts` | 🔴 **1 échec / 14 passés** → remis → 🟢 **15/15** |
| **M5** | les 3 lignes d'exception retirées du prompt | `household_diet.ts` | 🔴 **1 échec / 14 passés** → remis → 🟢 **15/15** |
| **M6** | `boxMemberDiets: members.map(…)` → `boxMemberDiets: []` — **le branchement** désarmé | `generate-household-meal-v1/index.ts` | 🔴 **1 échec / 14 passés** → remis → 🟢 **15/15** |

**M6 est la mutation qui compte le plus**, et c'est pour elle que le test
`BRANCHEMENT` lit la SOURCE de la lane. Le typage force à passer *quelque
chose* ; il ne peut pas empêcher de passer `[]`, qui compile, se teste vert
partout, et désarme la ceinture entière **en silence**. C'est très exactement
le mode d'échec d'origine : `scanDietaryRegime` écrit, juste, testé — et sans
un seul appelant sur la lane où il manquait.

⚠️ **M3 mérite une note.** Sans la sortie de dénominateur, `mouths_unboxed`
compterait la bouche végane sur la casserole de bœuf : le compteur grossirait
**exactement quand la ceinture protège le mieux**. Une garde qui pollue le
compteur voisin fabrique un faux défaut ; le test symétrique (« la garde
"exactement une boîte" mord TOUJOURS ailleurs ») empêche de fermer le trou en
avalant aussi les vrais oublis.

## Le cas qui PASSE, écrit avant les cas qui mordent

⛔ **Une garde a besoin d'un cas qui passe** : cassée, elle bloque tout et
ressemble trait pour trait à une garde qui marche. Deux tests l'arment :

- **personne n'a déclaré** ⇒ zéro boîte touchée, `regime_belt` tout à zéro avec
  `mouths: 0` — le désarmement, prouvé par égalité stricte ;
- **le garde-manger végane courant passe** — `soy yoghurt`, `oat milk`,
  `peanut butter` : `refused: 0`, `kept: 1`, **`silenced > 0`**. C'est le
  défaut mesuré par 2V sur la lane solo (le garde-manger végane compté en
  brèches) ; une ceinture qui mord là viderait les plans des végans, c'est-à-dire
  des seuls qu'elle existe pour protéger.

---

# §8 — LE PROMPT, MESURÉ À L'OCTET

`sha256` du prompt réellement envoyé, comparé à celui de l'agent 3A sur la
**même fixture, le même mode, la même fenêtre** :

```
prompt-système  3A/one_session/run-D1  c42af2691130bdff…
prompt-système  ce lot/run-1           c42af2691130bdff…   ← IDENTIQUE, pas un octet
prompt-user     3A/one_session/run-D1  80c163bb4dce489d…
prompt-user     ce lot/run-1           d950d9211eb9a3c0…
```

`diff` du message utilisateur — **trois lignes ajoutées, rien d'autre** :

```
261a262,264
> Theodule take no box and no share of those own dishes: on a
> preparation that breaks the line above they are left out on purpose,
> and the other names still get theirs -- the one exception to "never none".
```

`system_prompt_chars` **16 183 → 16 183**, `user_message_chars`
**17 574 → 17 784** (+210). La lane frôle le mur de temps du worker : ce lot
ajoute 210 caractères, et **seulement quand un plat dédié existe**.

⚠️ **Le piège n°3 du briefing vérifié après réécriture** : le mot `json` figure
toujours dans les deux prompts (3 occurrences côté système, 2 côté utilisateur).
Le mode JSON ne réécrit donc rien après la capture, et l'instrument ne se met
pas à mentir en silence.

---

# §9 — LES CONTRÔLES

| contrôle | résultat |
|---|---|
| `deno test --allow-read --allow-env supabase/functions/_shared/keel/` | **3740 passés / 0 échec** |
| `deno test` sur les six suites directement touchées | **333 passés / 0 échec** |
| `deno check` sur les deux lanes + les trois modules `_shared` | ✅ |
| `deno check supabase/functions/_shared/keel/*_test.ts` | ✅ |
| `npx tsc -b --force` (dans `frontend/`) | ✅, 8,6 s |
| `npx vitest run` (front) | **4 échecs / 1639 passés / 20 ignorés** — **la référence, à l'unité près** |

⚠️ Les quatre rouges du front sont ceux du briefing (`coverage-guard`,
`household.int.test.ts:323`), **étrangers à ce lot** : ils étaient là avant et
ils sont là après, avec les mêmes messages.

⚠️ `deno test` sans `--allow-env` rend **2 faux rouges** dans
`draft_note_classify_test.ts` (il lit `KEEL_GENERATION_MODEL`). Avec le drapeau,
zéro. Ce n'est pas une régression de ce lot — c'est le drapeau qui manquait.

⚠️ **Aucun export `SUPABASE_*` dans le shell** de la suite (`env -u SUPABASE_URL
-u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY`) : la cicatrice des 114 faux
rouges.

---

# §10 — LE POSTE

- **Modèle** : `gemini-3-flash-preview` sur **tous** les runs. `gpt-5.4-mini` et
  `gpt-5.4-nano` rendent **429** en < 1 s (compte OpenAI à sec), relevé dans
  `<run>/model.txt`. Un run demande **4 à 6 tentatives internes** : le repli
  expire à **60 s** sur cette lane, environ une fois sur deux.
- **Fraîcheur du runtime prouvée par une OBSERVATION, pas par la confiance** :
  après `docker restart supabase_edge_runtime_Sophia_2`, la ligne de journal
  `keel.household_meal.dietary_regime` — qui **n'existait pas** avant ce lot —
  apparaît sur le premier run. C'est le tag lui-même qui est la preuve.
- **502 Kong rencontrés, aucun conclu.** Le conteneur edge est recréé toutes les
  2–3 min par le `functions serve` d'une session voisine ; deux runs sont morts
  en vol (`An invalid response was received from the upstream server`) et ont
  été **relancés avec un nouveau `request_id`** (`retry-run.sh` : rejouer le même
  id empile les événements et le vidage rend alors l'erreur d'un run qu'on n'a
  pas mesuré). `scripts/local_extend_kong_functions_timeout.sh` lancé avant la
  campagne (`read_timeout: 600000`).
- **Chaque ligne prouvée existante avant lecture** (`select source, model,
  status, system_prompt_chars … where request_id=…`, dans `<run>/model.txt`), et
  vidée avec **`--source` explicite** — un `request_id` foyer porte souvent deux
  appels.
- **La règle des trois fichiers** est tenue à chaque run gardé : `inputs.json`
  (les entrées relues EN BASE au moment du run), `dump/prompt-*.txt` (le prompt
  envoyé), `http-response.json` (la sortie), plus `plan-written.json`
  (`generated_from`) et `model.txt`.
- **Fenêtre d'un jour** (`wed 2026-08-19`, déjeuner + dîner) — choix de POSTE,
  repris de l'agent 3A : une fenêtre longue meurt en vol sur le repli.

---

# §11 — CE QUE JE REMONTE SANS LE TRANCHER

### ① ⛔ La ceinture peut laisser une bouche **sans rien**, et rien ne le compte

Si **toutes** les préparations d'un créneau rompent la ligne d'une bouche, la
ceinture la retire de toutes ses boîtes — et elle sort du plan **sans un
gramme**. Ce n'est pas théorique : `separate_sessions`/run-1 avait UNE seule
préparation protéique, `Roasted Chicken and Smoked Tofu` — une casserole
**mixte**. La ceinture la refuse en entier (on ne peut pas garantir que la
moitié végétale n'a pas touché l'autre, et une garantie fausse est pire
qu'aucune garantie), et l'enfant y perdrait sa protéine.

Servir **rien** vaut mieux que servir **du bœuf**, donc le comportement est le
bon ; ce qui manque est le **nombre**. Il faudrait un `left_empty` dans
`regime_belt` : les bouches que la ceinture a touchées et qui finissent le plan
sans aucune boîte.

⛔ **Je ne l'ai PAS ajouté, et le motif est de méthode** : le coder m'aurait
obligé à redémarrer le runtime edge au milieu de la campagne, donc à mesurer
mes runs sur **deux builds**. Un compteur de plus ne vaut pas une mesure faite
sur deux versions. C'est un lot d'une quinzaine de lignes, l'emplacement est
nommé (après la boucle des préparations, à côté de `boxMouthSlots`).

### ② Le PLAFOND DE PLATS reste la cause d'à côté — et il n'est pas à moi

`mergeDishBonus` promet 8 plats et n'en ouvre que 4 (§D.1 du rapport 3A) :
**deux bouches sur trois perdent leur plat dédié, quatre fois sur quatre**.
La ceinture rend ce défaut **plus visible**, pas plus grave : moins il y a de
plats dédiés, plus la casserole carnée est la seule, et plus la bouche végane
risque le cas ① ci-dessus. Les deux lots se touchent ; celui-ci n'y a pas
touché.

### ③ Le résidu d'homonymie de `scanDietaryRegime` — hors périmètre, et je l'ai laissé

`butter beans` → `butter`, `Vegan sausage` → `sausage`. Documenté, connu,
**explicitement hors de mon périmètre**, et je n'ai tenté **aucune astuce
d'appariement** pour le fermer. Conséquence honnête sur cette lane : une
préparation de haricots beurre serait refusée à une bouche végane. Le coût est
**du côté sûr** (on retire, on ne sert pas), et il se lit dans `refused` —
mais il se lit comme une vraie morsure, pas comme un homonyme.

### ④ Le régime d'une bouche qui DIVERGE n'est pas nommé dans le prompt

Le bloc dit « their OWN dish is not bound by the sentence above, and may use
what the shared dish leaves out ». C'est vrai pour un omnivore ; c'est **faux**
pour un végétarien qui diverge d'une table végane — son plat à elle reste borné
par SA ligne. La ceinture le rattrape (elle lit la ligne de **chaque** bouche,
pas la plus stricte de la table) et le compte, donc le produit est sûr. Ce qui
reste ouvert est la **consigne** : elle promet au modèle une liberté qu'il n'a
pas, et le rattrapage se paie en `refused` au lieu de se payer en zéro.
Le corriger demande de faire descendre le régime de chaque divergent dans le
bloc — c'est-à-dire d'allonger le prompt d'une lane qui expire déjà une fois
sur deux. **Arbitrage de produit, pas de code.**

### ⑤ `mouths_unboxed` compte les plats DÉDIÉS comme des oublis

Constaté sur run-1 : `mouths_unboxed: 4` alors que le plan est parfait — les
trois adultes n'ont pas de boîte sur la casserole de pois chiches, et l'enfant
n'en a pas sur celle de poulet. C'est **antérieur à ce lot** (une préparation
dédiée laisse forcément des bouches dehors) et ce lot ne l'aggrave pas : il en
sort au contraire les refus de régime. Je le nomme parce qu'il rend
`mouths_unboxed` difficile à lire sur un plan en mode ②, et que quelqu'un
finira par le prendre pour un défaut.

---

# §12 — ⛔ DÉFAUT DISTINCT, REMONTÉ ET NON CORRIGÉ : LA PHRASE DE TABLE N'EST GARDÉE PAR PERSONNE

> Soulevé par le coordinateur pendant ce lot. **Vérifié, mesuré, et il ne
> change pas ma décision — il la confirme.** Je ne l'ai pas corrigé : étendre le
> verrou médical à une surface neuve change ce qui passe et ce qui ne passe pas,
> et ça appartient à un humain.

## ① Ce que le verrou de sortie lit VRAIMENT — mesuré, pas lu dans le code

`meal_generation.ts:4885-4890` construit le foin donné à
`applyKeelOutputLocks` :

```ts
const rendered = [
  ...dishes.map((d) => `${d.title}. ${d.method} ${d.why} ${d.ingredients…}`),
  ...finalShopping.map((s) => s.term),
].join("\n");
```

Reconstruit à l'identique sur `separate_sessions`/run-2
(`07-ceinture-regime/lock-surface-probe.ts`) :

```
foin du verrou (dishes + courses)            : 1307 caractères
titres de préparation présents dans le foin  : 0/4
portion_note présentes dans le foin          : 0/4
```

**Trois surfaces hors du verrou de sécurité** : les **titres et méthodes de
préparation**, les **`portion_note`**, les **notes de part**. Et
`keel_output_locks.ts` ne contient **0** occurrence de `portion_note`,
`portionNote` ou `member_portions` — confirmé.

`applyHouseRuleLock` (`household_restriction_lock.ts:98`) ne prend, lui, que
`dishes`. Sa docstring **justifie explicitement** l'exclusion des parts :

> *« La portion par membre est le seul endroit où la personne compte, et elle ne
> nomme jamais d'aliment interdit puisqu'il n'est pas dans la casserole. »*

⚠️ **Cette justification est vraie pour la SUBSTANCE et fausse pour le
COMMENTAIRE.** L'aliment n'est effectivement pas dans la casserole — mais le
modèle en **parle** dans la phrase de table, ce que 3A a mesuré
(`member_portions[Marceline].portion_note` = « **Ensure no fennel is used.** »
sur le plan `43ee0fb2`). La moitié « substance » du raisonnement tient ; la
moitié « commentaire » n'a jamais été vérifiée sur cette surface.

## ② La prise concrète que ça laisse passer — sur un plan réel

`separate_sessions`/run-2, `prep_roasted_veg` = **Roasted Sweet Potatoes and
Peppers**. Ingrédients : patate douce, poivrons, huile d'olive. Méthode, écrite
par le modèle :

> *« Toss sweet potatoes with oil and roast **on the other half of the chicken
> tray**. »*

```
foin du verrou contient « chicken tray » ?  false
texte des préparations contient-il ?        true
```

C'est un **contact croisé déclaré**, dans une surface qu'**aucun verrou ne
lit**. Ici c'est du poulet et la victime est une végane. **Si c'était une
plaque à sésame et Solveig — allergie MÉDICALE — rien ne l'aurait vu.**
Le défaut déborde donc largement le régime : il vaut pour **toutes** les
contraintes, allergènes compris.

## ③ Pourquoi ça CONFIRME l'emplacement de ma ceinture — mesuré sur 4 plans

`07-ceinture-regime/portion-prose-probe.ts` découpe la `portion_note` de la
bouche végane en ses deux moitiés (la prose du modèle, puis la clause du moteur
après le ` — `) et passe chacune à `scanDietaryRegime` :

| surface de la phrase de table | morsures sur 4 plans réels |
|---|---|
| **prose du MODÈLE** (avant le `—`) | **0** |
| **clause du MOTEUR** (après le `—`, bâtie sur les BOÎTES) | ⛔ **5** |
| **notes de part** | **0** |

**Cinq morsures sur cinq passent par la clause du moteur**, c'est-à-dire par
l'appartenance aux boîtes. Une ceinture de régime posée sur `dishes` — là où
vivent les verrous existants — en aurait attrapé **zéro**. C'est la mesure qui
tranche §1.

⚠️ **Et le `0` des notes de part n'est PAS une raison de retirer la seconde
porte.** `separate_sessions`/run-1 attache à Théodule une note *« one portion of
smoked tofu »* — texte parfaitement propre — **sous une préparation intitulée
`Roasted Chicken and Smoked Tofu`**. Le défaut n'est pas dans les mots, il est
dans l'**affectation**. C'est pour ça que ma seconde porte est indexée sur la
**préparation**, jamais sur le texte de la note : lire la prose ne l'aurait pas
vu.

## ④ Une nuance du coordinateur, corrigée par la mesure

> « Dans `portion_note`, un allergène cité en négation est le bon comportement —
> "Ensure no sesame is present". Ne casse pas ça. »

**La conclusion est juste, la cause ne l'est pas** : ce n'est pas que le verrou
*tolère* la négation sur cette surface, c'est qu'il **ne la lit pas du tout**
(0/4 `portion_note` dans le foin). Le bon comportement est aujourd'hui **un
accident**, pas une règle. Quiconque étendra le verrou à cette surface devra
donc porter la tolérance de négation **explicitement**, sinon
« Ensure no sesame is present » deviendra un `422` — et ce serait une
régression de sécurité déguisée en durcissement.

**Ce lot ne touche à rien de tout ça.** Ma ceinture n'ajoute aucun terme au
verrou de sortie, ne change aucune de ses surfaces, et ne modifie pas une ligne
de `keel_output_locks.ts` ni de `household_restriction_lock.ts`.

---

# §13 — LES FICHIERS TOUCHÉS

| fichier | ce que ce lot y met |
|---|---|
| `supabase/functions/_shared/keel/meal_generation.ts` | la porte **②bis** dans la boucle des boîtes ; la table `mouthRegimes` ; `regimeRefusedByPreparation` ; le compteur `regime_belt` ; la sortie de dénominateur de `mouth_slots` / `mouths_unboxed` ; les champs `regime_belt` et `regime_refusals` sur `GeneratedMeal` ; le paramètre **REQUIS** `boxMemberDiets` |
| `supabase/functions/_shared/keel/household_portions.ts` | le paramètre **REQUIS** `regimeRefusals` sur `reconcilePortions`, la porte dans `parseShares`, le troisième nombre `regime_refused` |
| `supabase/functions/_shared/keel/household_diet.ts` | les **3 lignes** d'exception dans `householdDietBlock`, sous divergence uniquement |
| `supabase/functions/generate-household-meal-v1/index.ts` | le branchement (`boxMemberDiets`, `meal.regime_refusals`), `regime_belt` dans la trace (aperçu **et** ligne écrite), et le journal `keel.household_meal.dietary_regime` **posé avant le premier `return`** (§15) |
| `supabase/functions/generate-meal-v1/index.ts` | `boxMemberDiets: []` — une **affirmation**, pas un oubli : cette lane n'a aucune boîte et porte déjà sa propre lecture de régime sur les plats |
| `supabase/functions/_shared/keel/household_regime_belt_test.ts` | **NOUVEAU** — 15 épreuves, dont le cas qui passe, les six mutations et la lecture de source du branchement |
| 19 fichiers `*_test.ts` | le nouveau paramètre requis, `[]` partout : **la casse de compilation est le recensement des appelants** |
| `scratchpad/qa-generation/07-ceinture-regime/` | le harnais et les mesures : `run.sh`, `retry-run.sh`, `replay.ts` (le rejeu déterministe), `portion-prose-probe.ts`, `lock-surface-probe.ts`, `mutate-prompt.sh`, et `run-1/` … `run-5/` |

⚠️ **Rien n'est commité.** Le dépôt porte 550+ fichiers modifiés par d'autres
sessions ; ce lot vit sur le disque, comme les autres lots de la nuit. Aucun
`git add -A`, aucun `git stash`.

---

# §14 — LES TROIS BORNES DU BRIEF, TENUES

| borne | ce qui a été fait |
|---|---|
| ⛔ **aucun matcher maison** | zéro expression régulière neuve, zéro liste d'aliments neuve. Tout passe par `scanDietaryRegime` (liste **fermée** EN+FR, `findForbiddenMatches`, `isPlantAnalogue`). La seule chose que ce lot ajoute est un **appelant**. |
| ⛔ **ne pas réécrire la sortie du modèle** | aucun caractère de prose touché : ni titre, ni méthode, ni `why`, ni `portion_note`, ni note de part. Ce qui est retiré est une **appartenance déclarée** — le geste que les portes ①②③ du parseur font déjà. |
| ⚠️ **ne desserrer aucune ceinture existante** | allergènes, plancher TCA, verrou médical, `house_rule_lock`, ceinture de corps, `sanitizePortionNote` : **aucun** touché. La suite complète (`3740 passés / 0 échec`) le tient, et la seule signature modifiée l'a été en **ajout requis**, jamais en assouplissement. |
| ⚠️ **compteur à trois nombres** | `mouths` / `checked` / `kept` / `refused` / `silenced` (+`unknown_mouth`), et `shares` / `unknown` / `regime_refused`. « Jamais déclaré » = `mouths: 0` ; « déclaré puis refusé » = `refused > 0`. Somme testée. |
| ⚠️ **résidu d'homonymie hors périmètre** | non touché, et **aucune** astuce d'appariement tentée. Voir §11 ③. |

---

# §15 — UN DÉFAUT DE MON PROPRE LOT, TROUVÉ PAR UN RUN RÉEL ET CORRIGÉ

**Le run `one_dish` `7ce40002-…0002` a rendu `422 empty_meal`,
`lock: blocked_medical_constraint`.** Le modèle avait mis du sésame dans le
plan, et le **verrou médical existant a mordu** — sur l'allergie médicale de
Solveig, en run réel, après mon lot. C'est la borne ⚠️ « ne desserre aucune
ceinture existante » prouvée **en vol**, pas seulement par la suite de tests.

⛔ **Et ce refus a révélé que MON compteur était muet exactement là.**
Le journal `keel.household_meal.dietary_regime` était écrit à côté de la trace
`generated_from` — **ligne 4762**, alors que le `return` du refus est **ligne
4278**. Sur ce run, la ceinture de régime n'a **rien** dit :

```
grep dietary_regime  →  (aucune ligne)
```

C'est-à-dire le défaut que ce lot corrige, **rejoué sur le lot lui-même** : un
compteur qui se tait précisément le jour où on le consulte. `generated_from`
n'existe que sur une ligne **écrite** ; sur un plan refusé, sur un aperçu, sur
un `meal_unparseable`, le journal est la **seule** trace.

**Correctif** : le journal part désormais **avant le premier `return`**, et il
porte en plus `lock` et `dishes` — parce que « la ceinture n'a rien retiré » et
« le plan est mort avant » sont deux lectures différentes du même zéro. Le
nombre `shares_refused` reste dans la trace (`boxTrace.shares.regime_refused`),
car `reconcilePortions` tourne cent lignes plus bas et un plan vide n'a de toute
façon aucune part.

⚠️ **Je n'ai pas touché au verrou médical**, ni à ce qu'il refuse, ni au mot
rendu. Seule la **position d'un `console.log`** a bougé.

---

# §16 — CRITÈRE DE SORTIE

> *« Sur un foyer comportant une bouche végane et des bouches omnivores,
> plusieurs runs : aucune préparation carnée n'apparaît dans la part de la
> bouche végane, ni dans sa phrase, ni dans ses boîtes ; le compteur nomme ce
> qui a été écarté et pourquoi, en trois nombres ; les autres bouches sont
> toujours servies ; chaque garde est vue mordre par mutation. »*

| exigence | état | preuve |
|---|---|---|
| aucune préparation carnée dans la part de la bouche végane — **phrase** | ✅ | 2 runs réels (§6) + 4 rejeux déterministes sur les octets réels (§5). 5 morsures sur 5 supprimées. |
| … ni dans ses **boîtes** | ✅ | `regime_refusals` archivé ; `beef.boxes` passe de 4 à 3 sur run-D1 rejoué ; `box_beef_stew_theodule` n'existe plus. |
| **trois nombres** | ✅ | `mouths` / `checked` / `kept` / `refused` / `silenced` (+`unknown_mouth`) ; `shares` / `unknown` / `regime_refused`. Somme testée. |
| les autres bouches **toujours servies** | ✅ | 4 rejeux : les trois adultes gardent **toutes** leurs préparations. run-5 : 4 bouches × 4 préparations. |
| **chaque garde vue mordre par mutation** | ✅ | 6 mutations, rouge → remise en état → vert (§7). |
| `deno test` sur les modules touchés | ✅ | 3740 passés / 0 échec |
| `npx tsc -b --force` | ✅ | |
| front à **4 échecs / 1639 passés / 20 ignorés** | ✅ | à l'unité près, les 4 rouges étrangers du briefing |

**Atteint.**

⚠️ **Ce qui reste non mesuré, et je ne le maquille pas :**

1. **Le modèle nominal.** Zéro run sur `gpt-5.4-mini` — compte à sec. Tout
   jugement de SORTIE vaut pour `gemini-3-flash-preview`. La ceinture, elle,
   est déterministe et post-parseur : mêmes octets quel que soit le fournisseur,
   ce que les 4 rejeux prouvent hors modèle.
2. **Aucun run réel où la ceinture MORD.** Sur les deux plans écrits après le
   lot, le modèle a obéi au prompt (`refused: 0`). La morsure est prouvée sur
   **4 plans réels rejoués** et par **6 mutations** — mais pas sur un appel
   modèle vivant. Ce n'est pas un échec, c'est l'ordre des choses : le prompt
   passe devant, la ceinture est le filet. Il faudrait retirer les 3 lignes de
   prompt et relancer pour le voir en vol ; le rejeu déterministe donne la même
   réponse **sans variance de modèle**, sur 4 plans au lieu d'un.
3. **`separate_sessions` en run réel après le lot** : deux tentatives mortes au
   poste (502, `WORKER_LIMIT`). Il est couvert par 2 rejeux déterministes.
4. **Un foyer à PLUSIEURS régimes différents** (un végane ET un végétarien, ou
   deux lignes non emboîtées). La ceinture lit la ligne de **chaque** bouche —
   c'est testé unitairement — mais aucune fixture réelle ne le porte.
5. **Une fenêtre de 7 jours**, et **un foyer où toutes les bouches ont un
   compte**.
6. **Le résidu d'homonymie** (`butter beans` → `butter`) n'a pas été rejoué :
   aucun des plans mesurés n'en contenait. Le coût est du côté sûr, mais son
   TAUX est inconnu.
