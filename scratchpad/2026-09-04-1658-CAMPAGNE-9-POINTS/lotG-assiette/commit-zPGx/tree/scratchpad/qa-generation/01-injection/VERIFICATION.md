# ÉTAPE ① — VÉRIFICATION INDÉPENDANTE (agent 1V)

**2026-08-19 · branche `ff-001-quotidien-du-coach` · 5 runs réels, valeurs à moi,
aucune valeur reprise de 1A ni de 1B.**

Fixtures : `verification-1v/2026-08-19-0100-1v-fixture.sql`,
`…-0110-1v-foyer.sql`, `…-0210-1v-foyer-4-bouches.sql`,
`…-0240-1v-foyer-F3-delta.sql`, `…-0300-1v-solo-S2-delta.sql`.
Les trois fichiers de chaque run : `verification-1v/runs/<RUN>/`
(`inputs.json`, `request-body.json`, `dump/prompt-system.txt`,
`dump/prompt-user.txt`, `dump/output.json`, `http-response.json`, et
`plan-written.json` quand un plan a été écrit).

| run | lane | `request_id` | HTTP | sys / user (car.) |
|---|---|---|---|---|
| **F1** | foyer | `f0100001-0000-4000-8000-000000000001` | 422 `empty_meal` | 15 486 / 12 853 |
| **F2** | foyer | `f0100002-0000-4000-8000-000000000002` | 422 `empty_meal` | 15 486 / 12 744 |
| **F3** | foyer | `f0100003-0000-4000-8000-000000000003` | **200**, plan `1239047d…` | 15 486 / 12 745 |
| **S1** | solo | `50100001-0000-4000-8000-000000000001` | **200**, plan `f4f3f9dd…` | 14 382 / 9 443 |
| **S2** | solo | `50100002-0000-4000-8000-000000000002` | **200**, plan `3faf8d9f…` | 14 382 / 9 868 |

Chaque ligne a été prouvée existante avant lecture
(`select source, status, system_prompt_chars from llm_raw_response_events where request_id=…`)
et vidée avec `--source` explicite. Aucun 502 sur ce lot ; Kong déjà à 600 000 ms.

⚠️ **Hors périmètre par décision humaine du 2026-08-19** : la lane
`generate-week-plan-v1` (aucun appelant vivant). Les lignes de checklist qui ne
concernent qu'elle sont marquées **hors périmètre**, pas « non vérifiées » : C4
(moitié semaine), R3, R13, G7.

---

# ① LA QUESTION DU CORPS PAR BOUCHE — le tableau, et le verdict

## Le foyer monté pour la mesure

Quatre bouches, construites pour qu'un écart n'ait **qu'une** cause. Les deux
adultes portent le **même objectif** et le **même rythme, tailles comprises** ;
les deux mineurs aussi. Vérifié à l'octet dans le prompt (`F3/dump/prompt-user.txt`
l. 123-126) : les quatre lignes de brief sont identiques au prénom, à la note
libre et aux crochets de corps près.

| | Odalric | Peregrine | Casimir | Wilfrid |
|---|---|---|---|---|
| compte | **oui** (maître) | **non** | non | non |
| âge | 38 ans | 34 ans | **16 ans** | **7 ans** |
| corps saisi (fiche) | 183 cm / 79 kg | **152 cm / 47 kg** | **178 cm / 70 kg** | **122 cm / 23 kg** |
| objectif | muscle_gain | muscle_gain | aucun | aucun |
| ce que le PROMPT dit de son corps | `[height 183 cm; age band 30 to 44; gender male]` | **rien** | **rien** | **rien** |

## Les grammes réellement servis

Trois runs. **F1** et **F2** : grammes déclarés par le modèle dans les boîtes.
**F3** : le plan **écrit en base**, après passage du moteur.

| préparation | Odalric (adulte, compte, 79 kg) | Peregrine (adulte, SANS compte, 47 kg) | Casimir (16 ans, 70 kg) | Wilfrid (7 ans, 23 kg) |
|---|---|---|---|---|
| F1 · egg bakes | 220 g | **220 g** | 160 g | **160 g** |
| F1 · chicken quinoa | 400 g | **400 g** | 250 g | **250 g** |
| F1 · lentil traybake | 360 g | **360 g** | 230 g | **230 g** |
| F2 · chicken tray | 430 g | **430 g** | 300 g | **300 g** |
| F2 · rice pilaf | 350 g | **350 g** | 240 g | **240 g** |
| F2 · couscous pilaf | 300 g | **300 g** | 210 g | **210 g** |
| F2 · lemon traybake | 120 g | **120 g** | 90 g | **90 g** |
| **F3 · boîtes écrites** (7 boîtes) | 1800 / 1800 / 960 / 1800 / 360 / 800 / 800 g | **mêmes boîtes** | **mêmes boîtes** | **mêmes boîtes** |
| **F3 · la phrase lue à table**, déjeuner | 220 g poulet, 260 g riz, 180 g légumes, 30 g sauce | **220 / 260 / 180 / 30** | 140 / 180 / 140 / 20 | **140 / 180 / 140 / 20** |
| **F3 · la phrase lue à table**, dîner | 180 / 220 / 180 / 30 | **180 / 220 / 180 / 30** | 120 / 150 / 140 / 20 | **120 / 150 / 140 / 20** |

**Neuf comparaisons, trois runs, zéro écart.**

### Réponses, une par une

1. **L'enfant reçoit-il une part réellement plus petite ?** *Sur deux runs sur
   trois, oui* — 160 contre 220, 250 contre 400, 140 contre 220. Sur **F3**, le
   seul run **écrit en base**, le modèle a mis les quatre bouches dans **une
   seule boîte par préparation** : l'enfant de 7 ans porte alors la **même
   boîte de 1800 g** que l'adulte de 79 kg. Le plus petit corps de la maison
   reçoit la même étiquette de poids que le plus grand, dans le plan livré.
   La part plus petite existe donc **seulement dans la phrase**
   (`member_portions`), et **seulement quand le modèle veut bien** écrire une
   boîte par bouche. C'est un tirage, pas une garantie.
2. **L'ado a-t-il une part distincte de celle de l'enfant ?** **Non. Jamais.**
   9 comparaisons sur 9, un garçon de 16 ans de 178 cm / 70 kg reçoit au gramme
   près la part d'un enfant de 7 ans de 122 cm / 23 kg. La cause est au prompt :
   leurs deux lignes de brief sont **identiques** — même chaîne
   `child-size share of the same dish`, aucun crochet, aucun âge. Le modèle n'a
   littéralement **rien** pour les distinguer.
3. **Plus grande que celle d'un adulte ?** Non, et c'est l'écart le plus visible :
   Casimir (178 cm / 70 kg) reçoit **140 g** de poulet là où Peregrine
   (152 cm / 47 kg) en reçoit **220 g**. Le plus grand corps de la table après
   le maître est servi comme un enfant de sept ans, et le plus petit corps
   adulte est servi comme un homme de 79 kg.
4. **Deux adultes de corpulences différentes ?** **Parts identiques**, 9 fois
   sur 9, alors que l'un pèse 79 kg et l'autre 47 kg (32 kg d'écart).
5. **L'adulte sans compte est-il servi comme quelqu'un dont on ne sait rien ?**
   Il est servi **exactement comme celui dont on sait tout**. Autrement dit :
   ce n'est pas seulement la bouche sans compte qui est dimensionnée à
   l'aveugle — **les crochets de corps de la bouche AVEC compte n'ont, eux non
   plus, produit aucun effet mesurable**.

## VERDICT sur « à l'aveugle » : **VRAI**, et par les DEUX chemins

1B avait raison sur le constat et se trompait en le limitant. Corrigé sur mes
mesures : **trois assiettes sur quatre** partent sans un fait de corps, et la
quatrième part avec des faits **inertes**.

**Ce n'est pas rattrapé par le moteur, et c'est mesuré, pas déduit.** Le seul
levier de grammes par bouche après le modèle est `sizeBoxesFromTarget`
(`household_portions.ts`), appelé à `generate-household-meal-v1/index.ts:4515`.
Compteur du plan écrit F3
(`generated_from.household.box_sizing`, `runs/F3/plan-written.json`) :

```json
{"boxes": 7, "sized": 0, "unchanged": 0, "shared_mixed": 7,
 "capped_by_pot": 0, "unverifiable": 0,
 "mouths": {"sized": 1, "restriction_floor": 3, "minor": 0, "no_body": 0,
            "no_pace": 0, "age_unknown": 0, "no_direction": 0,
            "implausible_factor": 0, "doctrine_no_counting": 0}}
```

Lu ligne à ligne :

- **`sized: 0` sur 7 boîtes.** Le moteur n'a **pas bougé un seul gramme**.
- **`restriction_floor: 3`** — et c'est **structurel, pas accidentel**.
  `memberTargetFactor` (`household_portions.ts:1585`) évalue
  `energySafetyGates({restrictionFlag: member.body?.restrictionFlag ?? true, …})`.
  `member.body` est un `MealBodyContext`, qui **n'existe que pour un compte**.
  Une bouche sans compte vaut donc `true` en fail-closed, **toujours**, et sort
  `restriction_floor` avant tout calcul. **La porte du moteur se ferme
  exactement sur la population que le prompt ne voit pas déjà** : les deux
  mécanismes couvrent le même monde et ratent le même.
- **`mouths.sized: 1`** — un facteur a bien été calculé, pour Odalric (le seul
  compte, seul à porter un curseur de rythme). Il n'a pas pu s'appliquer :
  `shared_mixed: 7`, « boîte partagée par des bouches dont les cibles diffèrent,
  grammes laissés tels quels ». Le lot est donc armé pour **une** personne, et
  désarmé par la forme de boîte que le modèle a choisie.
- Le second chemin, celui de `mouthEnvelope`/`lineBodies`, n'a rien produit non
  plus. Journal du run F3 :
  `{"tag":"keel.household_meal.composition","mode":"per_portion","deltas":0,"family_service":true,"residual_gaps_count":0,"residual_gaps_max_band":"none"}`.
  `per_portion` = aucune enveloppe par kg, `deltas: 0` = aucun add-on. Rien de
  ce que `lineBodies` alimente n'a touché une assiette.

**Le résumé du code — « on CALCULE avec, on n'ÉNONCE jamais » — n'est vrai que
dans sa seconde moitié.** Sur un foyer ordinaire (un compte, trois bouches
nues), on **n'énonce pas**, et on **ne calcule pas non plus** : le corps saisi
pour Peregrine, Casimir et Wilfrid n'a, mesurablement, changé **aucun gramme**
dans le plan livré. Ce n'est pas l'arbitrage écrit : c'est la moitié de
l'arbitrage.

⚠️ **Ce que je n'affirme pas** : que le moteur soit incapable de dimensionner.
Il l'est pour un compte dont le curseur de rythme est réglé et dont la boîte
n'est pas partagée — cas mesuré à **1 bouche sur 4, appliqué 0 fois sur 7
boîtes**. Un foyer où toutes les bouches ont un compte n'a pas été mesuré.

## Le corps d'un mineur est-il ÉNONCÉ ? **Non — tenu, prompt ET sortie**

Cherché sur les trois prompts foyer et les trois sorties : `122`, `23 kg`,
`178 cm`, `70 kg`, `2010`, `2019`, `BMI`, `kcal`, `calorie` → **0 occurrence**
partout. Les seuls `BMI`/`calorie` du prompt sont la phrase d'interdiction
elle-même. Les lignes de Wilfrid et de Casimir ne portent **aucun crochet**.
Idem côté solo (`102.7`, `104`, `191` → 0 dans les sorties S1 et S2).
**Rien à remonter en bloquant.** D-7 de 1B confirmé sur mes valeurs.

---

# ② LANE FOYER — ce que je confirme, ce que j'infirme

## Confirmé sur mes valeurs

| # | ligne | preuve (mes octets) |
|---|---|---|
| 1 | **Prénom du maître** | `profiles.full_name = 'Quenneville'`, `household_members.first_name = 'Odalric'`. Prompt : `Odalric` ×4, **`Quenneville` ×0**. Le correctif D-1 tient, et la source du prénom est bien la ligne de roster. |
| 2 | date de naissance → conséquence seule | `2010`/`2019` → 0. Seul `age band 30 to 44` (le maître) et `child-size…` (les mineurs). |
| 6 | niveau d'activité absent | `on_feet`/`sedentary` → **0** au prompt. |
| 7 | direction traduite | `- Odalric: larger protein and starch share, same vegetables` ; aucun jeton `muscle_gain` sur une ligne de bouche. |
| 8 | poids visé | `86` → **0**. |
| 9 | rythme kg/sem | `0.35` → **0** au prompt (il agit après, et n'a rien pu appliquer, cf. §①). |
| 10-12 | moments, tailles, note libre | les 4 lignes de brief, à l'octet (`F3` l. 123-126). |
| 15 | dégoût **attaché** | `HOUSE RULES … - Peregrine: never serve fennel` — et **exploité** : `member_portions` de Peregrine porte « keep fennel off the plate » ×3. |
| 26/27 | nom du foyer, membre référent | `Thelwall Cottage` → 0 ; `reference_member_id` `null`, aucun bloc. |
| 29-34 | budget / temps / jours / équipement / difficulté / variété | `budget for this plan: 152` · `about 60 → 55 minutes` · `they can only cook on: tue` · `This household does not have: a microwave, a pressure cooker.` · `keen` · `varied`. |
| 36 | propriétés de jour | 0. |
| 37/38 | envie de la semaine + contexte | mes deux phrases, mot pour mot. |
| 44/45/46 | objectif+situation du maître, fuseau/pays/langue, parts | `goal: muscle_gain` · `I share this kitchen with a lodger on Thursdays` · `2026-08-18` / `GB` / `en-GB` · `people at the table: 4`. |

## Infirmé — avec les octets

### I-1 · « Le prompt foyer n'injecte que `claim` » — **FAUX**

C'est le constat de l'étape zéro, repris par 1A (G4 : « le constat venait du
prompt **foyer** »). Mesuré sur `F3/dump/prompt-user.txt` :

```
- Every week starts with a plate you can name out loud, never with a number. (a plate you can picture is a plate you will actually cook)
- plain_salad_dinners (also phrased: salad only dinner; …) — a plate with nothing warm on it is a plate you leave hungry at ten
  INSTEAD, this coach says: EVERY dinner carries one warm element, even in July: a broth, a roasted root, or a pan-warmed grain.
```

`rationale`, `reason` **et** `INSTEAD` sont dans le prompt foyer, et la portée
par objectif y mord aussi : la conviction `starch_follows_the_session`
(portée `muscle_gain`) est **présente** pour un maître `muscle_gain` et
**absente** du prompt solo d'un élève `fat_loss`, où
`THE CONVICTION KEYS YOU MAY NAME` ne liste que 2 clés au lieu de 3.
`request_id` : `f0100003-0000-4000-8000-000000000003`.

### I-2 · « Sur-application de l'allergie détachée » — **INFIRMÉ. C'est une MAUVAISE application, et elle coûte le plan entier.**

Le cas demandé a été construit : **l'allergène d'une bouche est l'aliment
préféré d'une autre**. Peregrine déclare une allergie **médicale au pistachio**;
l'habitude déclarée du maître est *« a spoonful of pistachio butter on toast »*;
l'envie de la maison est *« a pistachio and lemon traybake »*.

Ce que le prompt sert (`F1` et `F2`, l. 1-6) — **en-tête au singulier pour une
tablée de quatre, aucune bouche nommée**, et `celeriac` **deux fois** :

```
=== THIS STUDENT'S HARD CONSTRAINTS (source: student_safety_constraints) ===
These are not preferences. They are loaded fresh every turn.
- celeriac — allergy, severity=medical (declared by student)
- celeriac — allergy, severity=medical (declared by student)
- tree_nut — allergy, severity=medical (declared by student)
- pistachio — allergy, severity=medical (declared by student)
```

Ce que le modèle en fait — **deux runs, deux erreurs opposées, aucune
sur-application** :

- **F1** — il rattache l'allergène à la mauvaise bouche mais dans le bon sens :
  `dishes[12].method` = *« Toast the bread and spread on the pistachio butter.
  Keep it away from the rest of the table and serve it only to Odalric. »*
- **F2** — il **inverse** : il compose une préparation partagée
  `Lemon and pistachio traybake`, en met **120 g dans la boîte de Peregrine**
  (l'allergique), et écrit l'avertissement **à l'autre** :
  `member_portions[0]` (Odalric) → *« Take the lemon traybake portion, with no
  pistachio on the plate. »* ; `member_portions[2]` (Peregrine) → *« Take the
  lemon traybake portion, with no fennel. »* — **pas un mot sur le pistachio.**

**Le coût, mesuré :** le verrou de sortie est **binaire** (`meal_generation.ts:4354`,
« un seul plat qui touche l'allergène vide la semaine entière »). Résultat :
`lock: "blocked_medical_constraint"` et **HTTP 422 `empty_meal`** sur F1 **et**
F2. Le foyer n'a **aucun plan**, deux fois de suite, sans qu'aucun message ne
dise pourquoi. La ceinture a tenu — mais la garde a **désarmé le produit**, pas
la sur-application.

**La cause est dans le prompt, et elle est structurelle** : le brief ORDONNE de
servir l'habitude (`When a person "has their own" at a moment, … count their own
thing in the shopping list`) pendant que le bloc de sécurité INTERDIT l'aliment
qu'elle nomme. Deux consignes contradictoires dans le même message, et rien
pour dire à qui appartient l'interdit. Contraste dans le même prompt :
`- Peregrine: never serve fennel` est **attachée**, et le modèle l'a appliquée
correctement **quatre fois sur quatre**.

Preuve que le pistachio était bien le seul verrou : **F3**, identique à F2 au
détail près (habitude → `blackcurrant jam`, envie → `lemon and poppy seed`),
**HTTP 200**, plan écrit, `pistachio` → 0 en sortie.

### I-3 · « Taille / poids / sexe : compte seulement » (⚠️ de 1B) — **plus étroit que ça**

Odalric **a** un compte, et son prompt porte
`[height 183 cm; age band 30 to 44; gender male]` — **sans poids**, alors que sa
fiche de foyer dit 79 kg. La ligne du poids ne vient pas du compte, elle vient
d'une **série de pesées** (`student_body_measures`), vide ici. La formule juste
n'est pas « compte seulement » mais « **compte AVEC une série de pesées
seulement** » — et le poids du maître existe pourtant en base, dans l'autre
magasin (cf. §⑤).

## Non rejoué sur la lane foyer, avec la raison

| # | ligne | raison |
|---|---|---|
| 13 (partiel), 17, 18, 20 | déjeuner dehors, gamelle, micro-ondes du bureau | `work_lunch` non exercé : le correctif D-2 de 1B est un correctif d'**écran**, et je n'ai pas ouvert d'écran. Ni confirmé ni infirmé. |
| 19 | repas pris dehors | idem. |
| 21 | absences | déclarée (Wilfrid, samedi/dîner) mais **hors fenêtre** des trois runs (mer→ven). Non observable. |
| 22 | préférences durables (voix) | `accounts_at_table: 1`, `lines_in: 0` — aucun memorizer exercé. |
| 24, 41, 42 | plan personnel, note de reprise, demande sur ma part | demandent un secondaire **avec compte** / un aperçu. Non exerçables sur ce foyer. |
| 14 | régime alimentaire | aucune bouche n'a déclaré de régime dans ce foyer : le bloc est absent **parce qu'il n'y a rien**, pas parce qu'il est rompu. |
| 23, 43 | rôle, garde-manger | conformes à l'inventaire, rien à mesurer. |

## Neuf sur la lane foyer : **l'aspiration n'atteint pas le prompt foyer**

`student_goals.aspiration` du maître = *« Get back on the tandem with my
father »* → **0 occurrence** dans les trois prompts foyer, alors que la
**même colonne**, sur la **même page**, atteint le prompt solo mot pour mot
(`what they are actually after, in their words: …`, S1/S2). Le bloc
`-- WHAT THEY ARE AFTER --` du foyer ne porte que `goal` + `situation`.
Cette ligne **n'est dans aucune des 46 lignes de 1B**.

---

# ③ LANE SOLO — ce que je confirme, ce que j'infirme

Élève : `qa1v.solo@keeltest.dev`, coach **Osric Thelwall**, `fat_loss`,
**végétarien**, allergie **celeriac**, intolérance **fructose**, dégoût
**okra**, médicament **warfarin**.

## Confirmé sur mes valeurs

| # | ligne | preuve |
|---|---|---|
| A1 | prénom jamais demandé | `Zephyrine` → **0**. |
| A2-A4, A7 | bande d'âge, taille, sexe, activité | `- age band: 45 to 59` · `- height: 191 cm` · `- gender, as they picked it: male` · `- how their days go: sitting most of the day, not much walking`. |
| **A5-A6** | poids, tour de taille | `- weight: 102.7 kg, measured week of 2026-08-17` · `- waist: 104 cm, measured week of 2026-08-17` (**S2**). ⚠️ **absents de S1** : ma pesée était datée du **2026-08-19**, c'est-à-dire APRÈS `untilLocalDate` (`body_measure_io.ts:232`, `.lte("local_date", …)`). Comportement correct, piège de poste — voir §⑥. |
| A8 | séances d'activité | `cardio`, `97` → **0** au prompt. Écran + table + module, aucun lecteur. Confirmé. |
| B1, B5, B6 | objectif, aspiration, situation | `goal: fat_loss` · `Carry a full rucksack up Pen y Fan without stopping` · `I drive a night-shift lorry three nights a week`. **B6 confirmé comme REMPLISSABLE** : 1A ne pouvait pas l'écrire par l'écran, mais le lecteur est vivant. |
| B2, B3 | poids visé, rythme | `88 kg` → 0, `0.55` → 0. |
| C1, C2 | allergies, intolérance, médicament, dégoût | les 4 lignes en tête. **R15 confirmé** : `- okra — dislike, severity=preference` sous « These are not preferences ». |
| **N1** | le `notes` de `/app/health` | `cooked apple is fine, raw apple is not` → **0** au prompt **et** `apple` → 0 en sortie. Confirmé. |
| C4 | régime (lane repas) | `This student is VEGETARIAN: …` — **exploité** : 0 viande, 0 poisson sur les 8 plats de S1 comme de S2 ; journal `{"tag":"keel.meal.dietary_regime","regime":"vegetarian","forms":124,"breaches":0}`. |
| D1-D3 | moments, tailles, absences | `breakfast (large for them)` / `lunch (small)` / `dinner (medium)` · `- Friday: dinner`. **Exploité** : aucun dîner du vendredi dans S1 ni S2. |
| **D6** | apport fixe | `- Barleycup malt drink (44 g), Monday, Wednesday, Friday`. Les **7 g de protéine** et les **152 kcal** : **0 occurrence**. R10 confirmé sur mes valeurs. |
| E1-E5 | jours de cuisine, temps, niveau, répétition, budget | `they usually cook on fri -- all of which fall after wed…` (branche « trop tard ») · `about 25 minutes` · `simple` · `repeat` · `budget for this plan: 88`. |
| F4, F6, F8, F10, F11 | envie du moment, contexte, couverts, fenêtre, mode | `smoked paprika and something with a proper crust` (**26 occurrences de `paprika` en sortie**) · le contexte mot pour mot · `people at the table: 1` · `days to fill … wed, thu, fri` · `mode: to_shop`. |
| G1-G3 | pays, date, langue | `GB` · `2026-08-18` / `today is: tue` · `en-GB`. |
| G4 | doctrine | voir affirmation phare n°2 ci-dessous. |

## Infirmé / précisé

Rien d'**infirmé** sur la lane solo : les 30 cases de 1A que j'ai pu rejouer se
rejouent. Deux **précisions** :

- **B6 (`situation`)** est classée ❌ « aucune surface » par 1A. Le lecteur est
  vivant et la colonne se remplit : ma valeur atteint le prompt. Le défaut est
  **d'écran** (le payload ne l'envoie plus), pas d'injection.
- **A5-A6** ne sont vraies que si la mesure est datée `<= today`. Une pesée
  datée du lendemain est invisible sans un mot. Ce n'est pas un défaut, c'est
  une condition que la case ne dit pas.

## Non rejoué / hors périmètre (lane solo)

| # | ligne | raison |
|---|---|---|
| B4 (`focus_axis`), D4, D5, E7, F5, F12, F13 | — | aucune surface / hors lane, conformes à l'inventaire de 1A. Rien à mesurer. |
| C3 (`condition_ref`) | — | seul écrivain = la conversation. Non exercé. |
| F1, F2, F3 | consignes écrites, goûts confirmés, rangement | dépendent du **memorizer** ; aucun tour de conversation dans ce lot. |
| F9 | note de remix | `PlanDraftDialog` non ouvert. |
| G5, G6 | mapping alimentaire du coach, note 1:1 | Osric n'a aucun `coach_protocols`, aucune note. |
| R9 | double injection de la capacité de cuisine | `retained_items: 0` sur les deux runs — le piège reste désarmé. |
| **C4 (semaine), R3, R13, G7** | — | **hors périmètre** (lane `generate-week-plan-v1` retirée du chantier le 2026-08-19). |

---

# ④ COCHÉES À TORT

**Aucune case de 1A ni de 1B n'a été trouvée cochée sur un mot présent pour une
autre raison.** J'ai cherché **mes** valeurs, jamais les noms de champs, et
j'ai piégé les cas les plus exposés :

- `86` (poids visé du maître) → **0**, y compris dans l'exemple figé du brief,
  qui dit `80 g of dry pasta`. La prudence de 1B sur sa ligne #8 était fondée.
- `0.35` / `0.55` (rythme) → 0.
- `on_feet` / `sedentary` → 0 au foyer ; le cran d'activité de l'élève solo est
  bien rendu en **prose** (`sitting most of the day…`), pas en jeton.
- `Quenneville` → 0, `Zephyrine` → 0.

**Une correction de niveau, pas une case fausse** : le ⚠️ « compte seulement »
de 1B (#3-#5) est trop généreux — c'est « **compte + série de pesées** » (I-3).

---

# ⑤ PRÉSENTES MAIS INEXPLOITABLES

1. **🔴 Les crochets de corps du foyer.** `[height 183 cm; age band 30 to 44;
   gender male]` est dans le prompt, sous une consigne qui dit que ces faits
   sont là *« for ONE thing: the SIZE of a portion »*. Mesuré : **9 comparaisons
   sur 9, la bouche qui les porte reçoit exactement la même part que la bouche
   qui n'en porte aucun**, à 32 kg d'écart. Présent, lu, sans effet.
2. **🔴 L'habitude de bouche, quand elle nomme un allergène du foyer.** Le brief
   ordonne de la servir, le bloc de sécurité l'interdit, et le verrou binaire
   rend 422. Pire qu'inexploitable : **destructeur** (I-2).
3. **Le dégoût sous « These are not preferences »** (R15) — l'information est là,
   la consigne ne demande pas de la distinguer d'une contrainte médicale.
4. **L'aspiration** (solo) : injectée, `Pen y Fan` / `rucksack` → **0** en
   sortie sur S1 comme sur S2. Critère de rang, non observable — conforme à ce
   que 1A disait, et toujours invérifiable.
5. **Le poids / tour de taille solo** : injectés (S2), aucun contre-factuel
   possible sans un second run apparié. **Non observable**, je ne le coche pas
   comme exploité.

---

# ⑥ INJECTÉES DEUX FOIS

1. **`celeriac`, deux fois, même valeur, deux lignes consécutives** —
   `runs/F1/dump/prompt-user.txt` l. 3-4 et `runs/F2` idem. Déclaré des deux
   côtés (`student_safety_constraints` du compte **et**
   `household_member_allergies` de sa fiche) ; l'union ne dédoublonne pas.
   Sans danger ici (valeurs identiques), mais deux déclarations divergentes
   sortiraient toutes les deux, côte à côte, sans arbitrage.
2. **Le rythme du maître, deux fois** — `F3/dump/prompt-user.txt` l. 60-62
   (`-- HOW THEIR DAY RUNS --`) puis l. 123 (sa ligne de brief,
   `eats at breakfast (medium for them), lunch (large for them)…`). Mêmes
   valeurs, deux formulations.
3. **🔴 Le corps du maître vit dans DEUX magasins, et ils ne disent pas la même
   chose.** `profiles` + `student_body_measures` (→ **le prompt** : 183 cm,
   **aucun poids**) et `household_member_bodies` (→ **le moteur** : 183 cm,
   **79 kg**). Deux écrans écrivent, rien ne réconcilie. Aujourd'hui le poids
   existe d'un côté et pas de l'autre ; demain ils divergeront sur une valeur,
   et **le prompt et le moteur travailleront sur deux corps différents pour la
   même personne, sans un signal**.

---

# ⑦ LES AFFIRMATIONS PHARES, UNE PAR UNE

| affirmation | verdict |
|---|---|
| **solo — les moyens de cuisson changent la sortie** | ✅ **CONFIRMÉ, et ce n'est pas un coup de dé.** Deux runs, deux équipements manquants **opposés**. **S1, sans plaque** : prompt `- no hob: nothing simmered, boiled, fried or sauteed on a ring.` → sortie **0** `simmer`, **0** `boil`, **0** `fry`, **0** `saut`, 0 casserole (les 5 « pan » sont tous le mot `pantry`), 4 `oven`, 8 `microwave`, et un `why` qui le dit : *« …provides a proper dinner without using a hob »*. **S2, sans four** (plaque rendue) : prompt `- no oven: nothing roasted, baked or gratinated…` → sortie **0** `oven`, **0** `roast`, **0** `bake`, **0** `gratin`, et 9 `pan`, 2 `simmer`, 4 `fry`. L'effet s'inverse avec la cause. |
| **solo — `reason` et `instead` sont injectés** | ✅ **CONFIRMÉ**, et **la sortie s'y conforme**. Prompt : `— a plate with nothing warm on it is a plate you leave hungry at ten` / `INSTEAD, this coach says: EVERY dinner carries one warm element…`. Sortie S1 : les deux dîners sont `Paprika-crusted tofu…` et `Warm tofu…` ; S2 : `Warm smoked-paprika lentils…` ×2. Aucun dîner-salade sur 16 plats. Le second interdit tient aussi : sessions le **mer** et le **ven**, jamais un marathon du dimanche. Bonus : le vocabulaire du coach est repris (`a loud vegetable`, 1 occurrence). |
| **foyer — le prénom du maître atteint le prompt** | ✅ **CONFIRMÉ sur ma valeur**, avec le piège armé : `profiles.full_name = 'Quenneville'`, roster `'Odalric'` → prompt `Odalric` ×4, `Quenneville` ×0. |
| **foyer — l'allergie détachée / sur-application** | ❌ **INFIRMÉ, et tranché dans l'autre sens.** Ce n'est pas de la sur-application, c'est de la **mauvaise attribution** : F1 la rattache à la mauvaise bouche, F2 sert 120 g de l'allergène **à l'allergique** et met l'avertissement sur l'assiette du voisin. Les deux runs finissent en **422 `empty_meal`**, plan détruit par le verrou binaire. Le foyer paie sa sécurité en semaines vides (I-2). |
| **les deux — le corps d'un mineur ne doit jamais être ÉNONCÉ** | ✅ **TENU**, prompt et sortie, sur les trois runs foyer. Aucun chiffre, aucun commentaire, aucune cible. **Rien à remonter en bloquant.** |

---

# ⑧ POSTE — ce qu'il faut savoir pour refaire ce lot

- **Aucun navigateur.** Le panneau étant partagé, tout est passé par les mêmes
  portes que les écrans : saisie du foyer par les **RPC `keel_household_*`**
  sous le rôle `authenticated` avec les claims JWT du maître (mêmes gardes,
  mêmes refus — trois de mes appels ont d'ailleurs été **refusés**
  `bad_slots`), et génération par un **POST HTTP** sur la fonction edge avec un
  JWT obtenu par **mot de passe** (`1234567`), c'est-à-dire l'appel exact que
  `supabase.functions.invoke` fait depuis `MealBuilder`. Trois écritures faites
  en SQL direct, et je les nomme : `household_members.birth_date` (aucune RPC
  d'écran ne re-date une bouche déjà créée), `student_goals`,
  `student_safety_constraints`, `student_body_measures` — que les écrans
  écrivent de toute façon en PostgREST direct.
- ⚠️ **Un run lancé après la dernière heure de repas tue le jour 1**, et
  peut tuer le run entier. `slotsPassedToday` a écrit
  `- Tuesday: breakfast, lunch, dinner` dans `-- WHEN THEY ARE NOT HERE --`
  (comportement correct, il était 23 h 26 locales) ; le modèle a composé
  mardi quand même ; le **plafond de 12 plats** a gardé les 12 premiers, qui
  étaient tous les 12 de mardi ; la présence les a tous jetés → `empty_meal`.
  **Commencer la fenêtre le lendemain** (`{"kind":"exact","starts_on":…}`).
- ⚠️ **Une pesée datée du lendemain est invisible, sans un mot**
  (`body_measure_io.ts:232`). Elle m'a coûté A5/A6 sur S1.
- ⚠️ `keel_household_set_member_habits` exige un **tableau** :
  `'{}'::jsonb` rend `{"ok":false,"reason":"bad_slots"}` — un refus **rendu, pas
  levé**. Une fixture qui ne lit pas la valeur de retour croit avoir écrit.
- `intent: "replace_current"` exige `replaces` (400 `replaces_required`), et un
  second plan sur la même fenêtre rend 409 `plan_overlaps_existing`.
- Aucun 502, aucun repli de modèle observé. Latences : foyer 34-40 s
  (`gpt-5.4-mini`), solo 149-153 s (`gpt-5.6-sol`).
- **Rien n'a été corrigé, rien n'a été commité, rien n'a été défait** des
  modifications non commitées des autres agents.

---

# ⑨ L'ÉTAPE ① PEUT-ELLE ÊTRE DÉCLARÉE CLOSE ?

## Non — mais il ne reste pas grand-chose, et ce qui reste est nommé.

**Ce qui est acquis et ne demande pas d'être refait :** l'inventaire de 1A et de
1B est **fidèle**. Sur mes propres valeurs, dans deux foyers différents et avec
un coach différent, je n'ai trouvé **aucune case cochée à tort**, et les quatre
correctifs livrés (prénom du maître, moyens de cuisson solo, niveau d'activité,
aspiration) **tiennent**. La question « telle valeur atteint-elle le prompt ? »
est répondue.

**Ce qui empêche la clôture — trois choses, dont deux neuves :**

1. **🔴 Le corps par bouche : la question de l'étape ① n'est pas répondue, elle
   est renversée.** « Tout ce qu'un humain saisit est-il pris en compte ? » —
   pour le corps d'un foyer, la réponse mesurée est **non, ni par le prompt ni
   par le moteur**. Trois adultes et enfants sur quatre sont dimensionnés sans
   un fait ; le quatrième porte des faits **inertes** ; le seul levier de
   grammes du moteur a rendu `sized: 0 / 7`, et sa porte se ferme
   **structurellement** sur les bouches sans compte. Un ado de 70 kg mange la
   part d'un enfant de 23 kg. **C'est un arbitrage humain, pas une correction
   QA** — mais il doit être pris en sachant que la moitié « on CALCULE avec »
   n'est pas vraie aujourd'hui.
2. **🔴 L'allergie détachée détruit des plans.** Deux runs sur trois rendus
   422 `empty_meal` par la seule présence d'une habitude qui nomme l'allergène
   d'une autre bouche. La direction sûre est tenue par le verrou, mais le prix
   est **le plan entier, sans explication**. Tant que la contrainte n'est pas
   attachée à sa bouche — comme `HOUSE RULES` l'est déjà, dans le même
   prompt — ce cas se rejouera.
3. **Le périmètre non exercé reste réel** : le memorizer (F1-F3 solo), le
   `work_lunch` (foyer #17-#20), les voix (#22), les plans personnels (#24), la
   note d'aperçu (#41-#42), le mapping et la note du coach (G5-G6), le
   `condition_ref` (C3), la note de remix (F9), l'absence hors fenêtre (#21).
   **Seize lignes sur 97** restent **ni confirmées ni infirmées**, et aucune ne
   l'est par paresse : chacune demande une surface que ce lot n'a pas ouverte.

**Ma recommandation :** clore l'étape ① **sur la question qu'elle posait**
(« la valeur atteint-elle le prompt ? » — oui, l'inventaire est juste), et
**ouvrir immédiatement** la question qu'elle a fait apparaître et qui n'est plus
une question d'injection : **« la valeur, une fois arrivée, change-t-elle un
gramme ? »** Les deux points 🔴 ci-dessus appartiennent à celle-là, et ils sont
tous les deux **mesurés, reproduits, et chiffrés**.
