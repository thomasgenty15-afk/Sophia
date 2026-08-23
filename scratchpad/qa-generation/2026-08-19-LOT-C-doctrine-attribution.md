# LOT C — LA DOCTRINE, L'ATTRIBUTION, ET LE BUDGET

**2026-08-19 · branche `ff-001-quotidien-du-coach` · lane `generate-household-meal-v1`**
**Runs réels consommés : 2 sur 2 autorisés.**

> ## EN UNE PAGE
>
> | | défaut | état | preuve |
> |---|---|---|---|
> | **①** | la doctrine était compilée sur l'objectif du **titulaire**, pas de la bouche | **corrigé** | run réel : la croyance `muscle_gain` est dans le prompt, **nommée à Ivar**, et son plat la **cite** |
> | **②** | la prose attribuait la règle d'une bouche à une autre | **corrigé au prompt + compteur à 3 nombres** | run réel : **0 `why` sur 5** nomme une règle (avant : 4 runs sur 4 en nommaient une, 3 `why` sur 8 de travers) |
> | **③** | `at most 8 dishes` et « 6 extra dishes … room for them » dans le même message | **corrigé** | run réel : `at most 10 dishes` / 6 extra ; puis 5 plats demandés, **5 livrés, 0 évincé** |
>
> **8 mutations, 8 morsures.** Aucune garde n'est laissée sans son cas qui tombe.
> **3791 tests deno verts**, `tsc -b --force` à 0, front à **5 rouges dont 5 étrangers**.

---

# ⚠️ CE QUI LIMITE CE RAPPORT, EN TÊTE

1. **Le modèle nominal n'a pas servi.** Les deux runs sont partis sur
   `gpt-5.6-luna` (relevé dans `llm_raw_response_events`, `run-*/model.txt`) et
   non sur le `gpt-5.4-mini` que le briefing donne pour `GLOBAL_AI_MODEL`. Tout
   jugement portant sur **ce que le modèle a écrit** (②, la prose) vaut pour ce
   modèle-là, pas pour un autre. Ce qui ne dépend pas du fournisseur — **le
   prompt (①②③) et le plafond de plats (③)** — est du code déterministe appliqué
   avant l'appel, et tient quel que soit le modèle.
2. **② repose sur UN run modèle.** `declared: 0` sur 5 plats est un bon signe,
   pas une loi. Le compteur existe précisément pour que le prochain run le dise
   au lieu de se taire.
3. **Le poste est partagé.** Le conteneur edge a été recréé **deux fois pendant
   ma fenêtre de travail** par une session voisine (`Up 21 seconds` relevé deux
   fois de suite), et c'est ce qui a tué le run 1 en 502. `meal_generation.ts` et
   `household_meal_generation.ts` ont été modifiés **par une autre session à
   11:41 et 11:49**, entre deux de mes lectures : les nombres de `git diff` sur
   ces deux fichiers mélangent mon lot et le leur.

---

# ① LA DOCTRINE DU COACH ÉTAIT COMPILÉE SUR LA MAUVAISE PERSONNE

> **Décision de l'utilisateur :** « quand il y a une doctrine de coach autre que
> Sophia, il faut la prendre en compte dans les faits. »

## Ce qui était vrai avant

`generate-household-meal-v1/index.ts` appelait `loadPublishedDoctrine(admin, userId)`.
Ce chargeur lit `student_goals.goal` **du compte passé en argument** — le
titulaire — et `compileDoctrineBlock(doctrine, goal)` filtre les croyances et
les arbitrages sur cette seule portée. **Un foyer entier recevait la variante
d'une seule bouche.**

Mesuré sur le foyer de l'étape ⑤ (titulaire `fat_loss`, athlète `muscle_gain`
à table), 6 prompts sur 6 :

```
== THE CONVICTION KEYS YOU MAY NAME ==
["name_the_plate_out_loud","one_loud_vegetable"]
```

La troisième croyance du coach — `starch_follows_the_session`,
`goal_scope: ["muscle_gain"]` — n'entrait nulle part. **Ce n'était pas un
branchement mort** (`goalScopeApplies` est vivant, 84 occurrences) : c'était une
**portée prise sur la mauvaise personne**.

## Ce qui a été fait

**La méthode ne bouge pas. Le filtre suit la bouche.**

- `doctrine_loader.ts` — `DoctrineLoadOptions.tableGoals?: DoctrineTableMouth[]`
  (`{goal, who}`), et une fonction pure exportée **`tableScopeSection()`** qui
  rend trois choses : le bloc, ses croyances, et les bouches retenues.
- Les entrées **déjà gardées par la variante du titulaire n'y entrent jamais** :
  pas de doublon, donc pas de répétition que le modèle lirait comme une
  insistance.
- Le bloc **NOMME la bouche**, il ne fond pas la ligne dans
  `WHAT THIS COACH BELIEVES`. Servie nue dans un prompt qui annonce
  `goal: fat_loss` quinze lignes plus haut, la ligne s'appliquerait à la
  casserole commune. Servie `- Ivar (muscle_gain): …`, elle a un destinataire,
  et le prompt nomme déjà Ivar quatre fois ailleurs avec le même prénom.
- Le bloc **porte son propre interdit de sortie** (« Never write the goal, the
  reason, or the fact that a line is theirs in anything read at the table »).
  Tout ce qui nomme une personne ET une raison a été mesuré, 4 runs sur 4,
  recopié dans un champ lu à voix haute.
- **`doctrineBeliefsFor` autorise ces clés à la citation.** Sans ça, le modèle
  recevait la ligne et le parseur refusait qu'il la cite : le plan porterait la
  conviction sans pouvoir la tracer, et le CHECK `..._doctrine_traceable_check`
  la jetterait. On aurait payé le bloc sans le recevoir.
- **`empty_for_goal` → `loaded`** quand le bloc de table existe. Une doctrine
  entièrement écrite pour `muscle_gain`, lue pour un titulaire `fat_loss`,
  rendait « ton coach n'a rien écrit sur ce sujet » — donc le lot aurait été
  branché puis annulé par la ligne d'à côté. La règle vit maintenant dans **une
  seule** fonction (`doctrineReasonFor`), lue par le journal et par le retour.
- `household_doctrine.ts` — **`loadHouseholdDoctrine()`**, dont `tableGoals` est
  **REQUIS**. L'option est facultative sur le chargeur générique (onze appelants
  sans table doivent garder le comportement d'avant sans y penser) ; il fallait
  donc un endroit où l'oubli casse à la compilation. C'est celui-là.
- La lane passe `composedMembers` — les bouches que **cette** composition
  couvre, après prises de main et défusions — **adultes seulement**, et sans le
  titulaire.

### ⛔ Les mineurs sont exclus, et c'est une décision

`goalApplies` ouvre bien la direction de service d'un mineur depuis le
2026-08-14. Mais ce bloc-ci écrirait, dans le prompt, **le prénom d'un enfant à
côté d'un jeton d'objectif** (« Zoe (fat_loss) ») — et le prompt est la seule
chose qu'on a mesurée recopiée dans un champ lu à table. « Le corps d'un mineur
ne s'énonce jamais » couvre aussi la direction qu'on lui prête. Un enfant reçoit
la variante du titulaire, comme avant.

## La preuve, sur un run réel

`08-lot-c/run-1/dump/prompt-user.txt` — le prompt réellement envoyé :

```
l. 80  -- WHAT THIS COACH WROTE FOR SOME OF THESE MOUTHS ONLY --
l. 81  This is the SAME coach and the SAME method as above. Each line below is
       written for one goal, and only the people named in front of it carry
       that goal at this table.
l. 82  Apply it to THEIR share and to their own dish. Never to the table's dish,
       and never to anyone else — the people not named do not follow it.
l. 83  Never write the goal, the reason, or the fact that a line is theirs in
       anything read at the table.
l. 84  - Ivar (muscle_gain): On a muscle gain stretch the starch goes where the
       training is. (an unfuelled session is a session paid for twice)

l. 86  == THE CONVICTION KEYS YOU MAY NAME ==
l. 87  ["name_the_plate_out_loud","one_loud_vegetable","starch_follows_the_session"]
```

Et **la boucle se ferme dans le plan écrit** (`run-2/plan-payload.json`) :

| plat | `member_id` | `honours_belief_keys` |
|---|---|---|
| table, midi | — | `name_the_plate_out_loud`, `one_loud_vegetable` |
| Roxane, midi | `5ba01540…` | `one_loud_vegetable` |
| table, soir | — | `name_the_plate_out_loud`, `one_loud_vegetable` |
| Roxane, soir | `5ba01540…` | `one_loud_vegetable` |
| **Ivar, soir** | `12362957…` | **`starch_follows_the_session`**, `one_loud_vegetable` |

La ligne que le coach avait écrite pour la prise de muscle est injectée, nommée
à Ivar, **citée sur son plat à lui et sur aucun autre**, et traçable.

---

# ② LA PROSE DU MODÈLE SE TROMPAIT DE PERSONNE

> **Décision de l'utilisateur :** « faut s'assurer que ce soit plus un problème. »
> Et : « si un régime n'est pas respecté pour une personne, c'est relou. »

## Ce qui était vrai avant

Sur `05-qualite-foyer/plan-4`, **trois `dishes[].why` sur huit** attribuent
l'évitement du gluten à **Roxane**, qui n'a aucune contrainte — c'est **Lubna**
qui l'a, et le prompt l'attribue correctement
(`- Lubna: gluten — allergy, severity=medical`) :

```
"A high-protein, gluten-free meal designed specifically for Roxane's midday energy needs."
"A quick, warm lunch for Roxane that avoids gluten and fits her portioning needs."
"A warm, comforting dinner for Roxane that is entirely gluten-free."
```

Et sur les **quatre** runs, le régime ou la contrainte médicale sortent en clair
dans un champ rendu à l'écran sous le plat (`DishCard.tsx:211`) — deux runs
recopiant l'échappatoire du prompt elle-même (« one of the foods on your medical
list »), donnée pour **ne pas** nommer l'allergène, et dont rien ne disait
qu'elle ne devait pas finir sur la table non plus.

## Ce qui a été fait — deux moitiés, et il faut les deux

**① Le `why` ne porte aucune règle.** Bloc neuf dans le message utilisateur
(`== WHAT A "why" IS ALLOWED TO SAY ==`), placé **après** le régime et les règles
de maison : il ne dit pas ce que la casserole a le droit de contenir — les deux
au-dessus le disent et gardent leur rang — il dit ce qu'on a le droit d'**écrire**
à propos d'eux. Il nomme le défaut mesuré en toutes lettres, sans nommer
personne.

**② Si une règle passe quand même, elle est déclarée et attribuée.** Clé
`why_rule_of` dans la moitié schéma (prompt système), avec **la liste fermée des
bouches qui portent vraiment une règle**. Le patron est exactement celui de
`for_member_id` — qui **marche** en production (4 déclarés, 4 attribués sur le
plan mesuré) : la clé et sa liste fermée dans le schéma, l'ordre dans le message
utilisateur.

**⛔ Aucun matcher.** Chercher « gluten » ou « vegan » dans une prose rendue en
anglais, en français ou en néerlandais, avec ou sans négation, est le geste que
ce dépôt a payé 12 faux positifs sur 12.

### La liste fermée a trois provenances, et il faut les trois

Une contrainte dure (`student_safety_constraints` + `household_member_allergies`),
un régime déclaré, une règle de maison. N'en prendre que deux ferait **refuser
une attribution juste** : une bouche omnivore dont la seule règle est « jamais de
champignon » sortirait de la liste, et le compteur crierait faux. Un compteur qui
crie faux est un compteur qu'on cesse de lire.

Vérifié sur le prompt réel (`run-1/dump/prompt-system.txt:333-342`) — **Zoe**
(règle de maison) et **Lubna** (végane + gluten) y sont, **Roxane et Ivar n'y
sont pas**. C'est cette absence-là qui rend le refus possible : si tout le monde
y était, aucune attribution ne serait jamais refusable.

### Le compteur, et pourquoi trois nombres

`generated_from.household.why_rule` et la ligne `keel.household_meal.why_rule` :

| | |
|---|---|
| `holders` | à combien de bouches le prompt a **ouvert** la clé. **Le dénominateur.** |
| `declared` | plats portant un `why_rule_of` non vide, avant validation |
| `valid` | l'id est une bouche qui porte **vraiment** une règle |
| **`refused`** | **l'id n'en est pas une — c'est le nombre du défaut** |

`{holders: 0, declared: 0}` veut dire « on n'a rien demandé ».
`{holders: 2, declared: 0}` veut dire « on a demandé, et rien n'est venu ».
Sans le premier nombre, les deux se lisent pareil — le zéro ambigu que ce dépôt
a déjà payé deux fois (`dish_owners`, `same_day`).
`declared === valid + refused` est une **propriété qu'un test vérifie**, jamais
une soustraction : c'est la cicatrice `withheld`/`over_cap`.

## La mesure, sur le run réel

```json
"why_rule": {"holders": 2, "dishes": 5, "declared": 0, "valid": 0, "refused": 0}
```

**Et les cinq `why` du plan ne nomment aucune règle, aucun régime, aucune
personne :**

```
"This trades separate fresh plates for one warm pot that reheats well at work."
"This gives the same warm, comforting pot a fresh green finish."
"This is a warm, filling dinner that keeps the cooking to one evening session."
"This turns the reheatable chilli and rice into a cooler, fresh-tasting supper."
"The warm bean-and-rice bowl puts the starch directly into the evening meal after a long day."
```

Aucun `portion_note` non plus. **Avant : 4 runs sur 4 y écrivaient le régime ou
la contrainte médicale.** `declared: 0` se lit donc ici « aucun `why` n'a nommé
de règle », pas « le modèle ignore la clé ».

## ⚠️ CE QUE CE LOT NE FERME PAS, ET IL FAUT LE DIRE

Un modèle qui écrirait « gluten-free for Roxane » **et** omettrait la clé laisse
`declared: 0` — invisible. Le seul instrument qui verrait ça est un matcher sur
la prose, explicitement interdit, et à raison. Le compteur ne prouve donc pas
l'absence : il **sépare** « rien de nommé » de « nommé, et sur qui ». Le premier
nombre à surveiller au prochain run est `refused`.

Et le compteur compte les plats de **la réponse du modèle**, pas du plan gardé.
`dish_owner_counts` compte les survivants parce que sa clé traverse le parseur ;
`why_rule_of` n'y entre pas — le parseur est le **tronc**, partagé avec la lane
individuelle, et lui ajouter un paramètre requis toucherait quinze fichiers de
tests appartenant à quatre lots parallèles. Les quatre nombres sont comptés sur
la **même** liste, ce qui est la seule propriété qui empêche un compteur de
mentir.

---

# ③ LE BUDGET DE PLATS SE CONTREDISAIT DANS LE MÊME PROMPT

> **Décision de l'utilisateur :** « si ça demande 8 sur 3 jours et que ça produit
> que 4, il y a un gros problème. »

## Ce qui était vrai avant

Deux passages du **même** message (`05-qualite-foyer/plan-4/dump/prompt-user.txt`) :

```
l. 116  how much: several_days (at most 8 dishes)
l. 249  That is 6 extra dishes on top of the table's meals, and the dish
        budget above already has room for them.
```

Les repas de la table valent **4** (2 jours × 2 créneaux). 4 + 6 = **10**, et le
budget en ouvrait **8**. « the dish budget already has room for them » était
**faux**, et la phrase suivante nommait elle-même le prix : *a window where these
people have no dish of their own is a window where they do not eat.*
Mesuré : Ivar, **1 plat propre livré sur 8 demandés**, sur quatre runs à entrées
byte-identiques.

## La cause, et pourquoi le correctif n'est pas dans `household_portions.ts`

`mergeDishBonus` borne le supplément par `baseCap`, et sa raison est écrite dans
le fichier : *« Une bouche de plus mange au plus ce qu'une bouche mange :
créneaux × jours. »* Elle est **juste — pour UNE bouche**. Une fusion n'en
reprend jamais deux, donc la borne y était exacte. Une composition **ordinaire**
de foyer passe par le même canal avec **N** bouches divergentes, et le plafond
d'une seule les bornait toutes : à N=2 il manque un tiers du budget, à N=3 la
moitié, **à toute taille de fenêtre**.

Le correctif est donc **au point d'appel**, dans `dishBudgetFor`
(`meal_generation.ts`), et pas dans le module interdit : la borne est « ce que
les bouches de plus peuvent manger », et avec N bouches c'est `N × (créneaux ×
jours)`. **C'est la même phrase, lue avec le bon N.** Le nombre de bouches n'est
pas deviné : c'est `dishBearerIds`, la liste **fermée** que la consigne nomme une
par une et que le parseur utilise déjà pour valider `for_member_id`.

**Trois populations ne bougent pas d'un plat**, et c'est vérifiable sans run :
la lane individuelle (`merge === null`, on sort avant) ; **toute fusion** (elle
reprend UNE personne, donc `base × 1 = baseCap`, octet pour octet) ; tout foyer à
une seule bouche divergente.

⛔ **Ce n'est pas l'éviction.** Quel plat est sacrifié quand le plafond mord vit
ailleurs (`dedicatedCells`, la garde de surplus) et appartient à un autre agent.
Ici on ouvre la place que la consigne réclame ; on ne touche pas à l'ordre du
sacrifice.

## La preuve, sur les deux runs réels

| | fenêtre | `at most N dishes` | « extra dishes » | cohérent ? |
|---|---|---|---|---|
| **avant** (plan-4) | 2 j × 2 créneaux | **8** | 6 sur 4 repas de table | ❌ il manque 2 |
| **run-1** | 2 j × 2 créneaux | **10** | 6 sur 4 repas de table | ✅ 4 + 6 = 10 |
| **run-2** | 1 j × 2 créneaux | **5** | 3 sur 2 repas de table | ✅ 2 + 3 = 5 |

Et ce que ça change dans le plan écrit (`run-2`) :

```json
"dish_owners": {"asked": 3, "declared": 3, "attributed": 3, "refused": 0}
```

**5 plats demandés, 5 livrés, aucune `issue` de plafond, aucune éviction.** Ivar
a son dîner à lui. Sous l'ancien budget la même réponse valait 5 plats pour un
plafond de 4, et le parseur en jetait un — mesuré comme étant **toujours le
sien**.

---

# LES MUTATIONS — 8 SUR 8 MORDENT

Chaque garde a ici **un cas qui passe** et **un cas qui tombe**. Une garde qu'on
n'a pas vue tomber n'est pas une garde ; une garde qui coupe tout ressemble trait
pour trait à une garde qui marche.

| # | ce qu'on casse | fichier | effet |
|---|---|---|---|
| M1 | la garde « bouche du **même** objectif que le titulaire » | `doctrine_loader.ts` | **1 rouge** — `table_goals` compterait 3 pour un foyer sans aucun objectif divergent |
| M2 | le filtre « déjà gardé par la variante du titulaire » | `doctrine_loader.ts` | **3 rouges** — la croyance commune paraît deux fois dans le même prompt |
| M3 | `doctrineBlockFor` n'ajoute plus le bloc de table | `doctrine_loader.ts` | **1 rouge** — le bloc est calculé et jamais servi |
| M4 | `doctrineBeliefsFor` n'autorise plus ses clés | `doctrine_loader.ts` | **1 rouge** — la ligne est servie et sa citation refusée |
| M5 | le compteur ② ne valide plus contre la liste fermée | `household_meal_generation.ts` | **3 rouges** — `refused` reste à zéro sur la mauvaise attribution |
| M6 | le bloc consigne ② quitte le message utilisateur | `household_meal_generation.ts` | **2 rouges** |
| M7 | la moitié schéma ② quitte le prompt système | `household_meal_generation.ts` | **1 rouge** — la clé n'est jamais déclarée au modèle |
| M8 | ③ le plafond du supplément revient à **une** bouche | `meal_generation.ts` | **2 rouges** — retour à `at most 8` |

**M1 mérite une note d'honnêteté.** Sa première rédaction **ne mordait pas** : le
bloc serait vide de toute façon, parce que le filtre des croyances écarte déjà
tout ce que la variante du titulaire garde. Plutôt que d'écrire un test fabriqué
autour d'une branche inutile, j'ai **nommé ce que la garde achète réellement** —
le **nombre tracé** `table_goals`, qui doit dire « combien d'objectifs AUTRES que
celui du titulaire cette table porte » — et le test assère ce nombre. Sans elle,
un foyer de quatre personnes toutes en `fat_loss` journaliserait `table_goals: 3`,
et la première question qu'on pose à ce nombre recevrait la mauvaise réponse pour
toujours.

---

# CE QUI A ÉTÉ TOUCHÉ

| fichier | pour |
|---|---|
| `supabase/functions/_shared/keel/doctrine_loader.ts` | ① `tableGoals`, `tableScopeSection`, `doctrineReasonFor`, jonction et clés citables |
| `supabase/functions/_shared/keel/household_doctrine.ts` | ① `loadHouseholdDoctrine`, paramètre **requis** |
| `supabase/functions/generate-household-meal-v1/index.ts` | ① le branchement de la table · ② la liste fermée + le compteur + la trace |
| `supabase/functions/_shared/keel/household_meal_generation.ts` | ② les deux blocs de prompt + `countWhyRuleAttributions` + **bump v18 → v19** |
| `supabase/functions/_shared/keel/meal_generation.ts` | ③ **`dishBudgetFor` uniquement** (`baseCap: base * extraMouths`) |
| `supabase/functions/_shared/keel/table_scope_test.ts` | **neuf** — 21 tests, les trois défauts |
| `household_meal_generation_test.ts`, `meal_boxes_test.ts`, `meal_same_day_test.ts`, `household_merge_test.ts` | `ruleHolders: []` sur les appelants + le littéral de version |

## Le bump de version, et ce qu'il promet

`HOUSEHOLD_PROMPT_VERSION` : `v18_what_they_feel_like_this_time` →
**`v19_a_why_names_no_ones_rule`**.

- **`MEAL_PROMPT_VERSION` ne bouge pas.** Pas un octet du tronc ne change : le
  champ `why` est défini dans le schéma du tronc et n'y gagne pas une ligne, et
  la question ne se pose pas pour un plan individuel — une seule bouche, aucune
  règle à attribuer de travers.
- **Byte-identité prouvée pour la population non concernée.** `ruleHolders: []`
  ⇒ les deux blocs tombent du `filter` et le prompt est byte-identique à v18.
  Tenu par un test d'égalité de chaîne, et vérifié en plus par mesure : les
  suffixes « avec » **contiennent** les suffixes « sans », deltas `+1194` octets
  côté utilisateur et `+460` côté système, **aucun retrait**.
- **Le mot « json » reste présent dans les deux moitiés.** Vérifié sur le prompt
  réellement envoyé (`run-1/dump`) : **4 occurrences** côté système, **3** côté
  utilisateur. L'instrument ne se met pas à mentir de 25 caractères
  (`gemini.ts:549-567`).
- ① ne touche pas la version du foyer : il change ce que **le chargeur de
  doctrine** met dans un paramètre du tronc, comme v17 et v18 avant lui — mais
  il arrive dans le même lot que ②, donc sous le même cran.

## Contrôles

| | |
|---|---|
| `deno test supabase/functions/_shared/keel/` | **3791 passés, 0 échec** |
| `deno check` des 4 fichiers du lot | **0 erreur** |
| `npx tsc -b --force tsconfig.app.json` | **exit 0** |
| front `vitest run` | **5 rouges / 1669 verts — les 5 sont étrangers** |

Les 5 rouges front : `coverage-guard` ×2 et `household.int.test.ts` ×2 (les
quatre que le briefing déclare étrangers), plus `allergens.int.test.ts`, qui est
le lot **allergènes** d'un agent voisin en vol — la même assertion
(`cafe_au_lait` vs `caf_au_lait`) était rouge côté deno à 12:12 et verte à 12:20.
**Je n'ai touché aucun fichier du front.**

---

# LES DEUX RUNS, ET CE QU'ILS ONT COÛTÉ

| run | fenêtre | HTTP | modèle | ce qu'il prouve |
|---|---|---|---|---|
| **run-1** | 2 j | **502** en 68 s | `gpt-5.6-luna`, `attempt_start` | le **prompt** est capturé et complet : ①②③ vérifiés sur les octets réellement envoyés |
| **run-2** | 1 j | **200** en 46 s | `gpt-5.6-luna`, `success` | le **plan** : `why_rule` à zéro, 5/5 plats livrés, `starch_follows_the_session` cité par Ivar |

Le 502 du run 1 est le piège documenté du poste partagé — le conteneur edge a
été recréé en plein vol. **Il n'a rien coûté à la mesure** : la ligne
`llm_raw_response_events` existe, `system_prompt_chars = 16669`,
`user_message_chars = 21873`, et le vidage a produit les deux moitiés. La règle
des trois fichiers est tenue pour les deux runs
(`inputs.json`, `dump/prompt-*.txt`, `plan-payload.json`).

Artefacts : `scratchpad/qa-generation/08-lot-c/run-1/`, `.../run-2/`.

---

# CE QUI RESTE OUVERT, ET QUI N'EST PAS À MOI

1. **La documentation de `mergeDishBonus` est désormais incomplète.** Elle écrit
   « le plafond du bonus est le plafond de base », ce qui n'est plus vrai vu du
   point d'appel. Le correctif est chez l'appelant et documenté là-bas en
   détail ; `household_portions.ts` est le périmètre d'un autre agent et je n'y
   ai pas touché. **Une phrase y manque.**
2. **② tient à un seul run modèle**, et sur un modèle qui n'est pas le nominal.
   `refused` est le nombre à relire au prochain run réel.
3. **Les arbitrages entrent dans le bloc de table au même titre que les
   croyances.** Le défaut mesuré ne portait que sur une croyance ; la symétrie
   est délibérée — laisser les arbitrages derrière recréerait le même trou une
   lane plus loin — mais elle n'a **jamais été exercée sur un run réel** : la
   doctrine du foyer de test n'a pas d'arbitrage ciblé.
4. **La lane individuelle d'un membre de foyer ne reçoit pas de bloc de table**,
   et c'est voulu : un plan personnel n'a qu'une bouche. `loadDoctrineForCaller`
   n'a pas bougé.

---

# UNE LEÇON DE MÉTHODE, PAYÉE DANS CE LOT

**`perl -0pi` sur un fichier UTF-8 le double-encode en silence.** Une passe de
substitution sur `household_meal_generation_test.ts` a transformé tous les
accents du fichier en mojibake — `« » é è` → `Â« Â» Ã© Ã¨` — sans un message
d'erreur exploitable, et le `git diff` ressemblait alors à une réécriture de
558 lignes.

**Et le réflexe évident aurait détruit le travail d'une autre session.** Restaurer
depuis l'index (`git show :fichier`) aurait paru sûr ; la comparaison a montré
que la copie de travail portait **33 lignes non indexées d'un lot voisin**
(`weightGroups`). La réparation correcte a été de **décoder l'erreur** (UTF-8 →
latin-1) plutôt que de reprendre une version « propre ». Toutes les substitutions
suivantes sont passées par Python en UTF-8 explicite.

Une seconde scorie du même geste : **un octet NUL** s'était glissé dans
`doctrine_loader.ts` (dans un littéral de gabarit), ce qui rendait le fichier
« binaire » pour `grep` — qui répondait alors **silencieusement rien** à toutes
mes recherches. Détecté en constatant qu'un `grep` sur du code que je venais
d'écrire ne rendait aucune ligne. Les sept fichiers touchés ont été audités :
**0 NUL, UTF-8 valide partout**.
