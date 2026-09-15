# CHECKLIST — lane INDIVIDUELLE : de l'écran au prompt, **cochée sur un prompt réel**

**Agent 1A · 2026-08-18 · deux runs réels, saisie par les écrans.**

> ⚠️ **CE DOCUMENT A CHANGÉ DE NATURE.** La version d'origine (agent 1A-inv) était une lecture de
> code : « le code qui construit le bloc X reçoit cette valeur ». Celle-ci est une **mesure** : la
> valeur saisie a été cherchée, caractère par caractère, dans le message utilisateur **réellement
> envoyé au modèle** et archivé en base. Chaque ligne cochée porte l'octet qui la prouve.

## Les deux runs

| | itération 01 | itération 02 (après correctifs) |
|---|---|---|
| `request_id` | `798c5cd6-acbf-43e3-8dcc-97128d3edd78` | `dc1326d5-a813-4c9e-9a17-266a99b35c30` |
| message utilisateur | 9 791 car. | **10 820 car.** |
| prompt système | 14 382 car. (aucune donnée d'élève — vérifié) | idem |
| troncature | `false` des deux côtés, `chars == written_chars` | idem |
| modèle | `gpt-5.6-sol`, 200 | `gpt-5.6-sol`, 200 |
| vidage | `iterations/01/dump/` | `iterations/02/dump/` = les 3 fichiers à la racine |

**Compte** : `qa1a.solo@keeltest.dev` (`1a000000-0000-4000-8000-000000000001`), fixture neuve
(`2026-08-18-2230-1a-fixture-solo.sql`), coach **MARC** (doctrine publiée, 5 convictions, 2 interdits).
Tout a été saisi **par les écrans** : `/app/setup` (4 étapes), `/app/health`, `/app/plan`,
`/app/progress`, `/app/chat`. Aucun `insert` de donnée d'élève.

---

# LE COMPTE

**Le tableau porte 51 lignes** (le document d'origine annonçait « 44 » — recompté ligne à ligne).

| | |
|---|---|
| ✅ **cochées sur le prompt réel** | **30** |
| ⚠️ présentes mais **amputées** | **1** (D6, le shaker sans ses protéines) |
| ❌ non cochées, **chacune avec sa raison et son coût** | **20** |

Sur les 20 non cochées : **8 n'ont aucune surface de saisie** (le champ ne peut pas être rempli par
un écran), **4 sont des exclusions écrites et argumentées dans le code**, **3 dépendent d'un écran
coach ou d'un memorizer** que ce lot n'a pas exercé, **3 sont hors lane individuelle par
conception**, et **2 attendent un arbitrage humain**.

**Quatre défauts ont été corrigés et re-mesurés** entre les deux runs (R1, R2, R5, R12), plus **R3**
sur la lane semaine et **R0** sur l'écran. Détail dans `iterations/02/RAPPORT.md`.

---

# LA TABLE, MESURÉE

**Preuve** : la chaîne exacte trouvée dans `prompt-user.txt` du run 02 (numéros de ligne du fichier).

## A. Le corps et l'identité

| # | Information | Saisie (écran) | État | Preuve / raison |
|---|---|---|---|---|
| A1 | **Prénom** | ⛔ jamais demandé en solo | ❌ | **Absence voulue et documentée** (`api/onboarding.ts:225`). Zéro occurrence de `Iris` dans le prompt. **Coût : nul** — rien ne le lit, la question n'est pas posée. |
| A2 | **Date de naissance** | `/app/setup` ét. 2 | ✅ | L64 `- age band: 30 to 44`. Jamais l'âge, la bande. |
| A3 | **Taille** | `/app/setup` ét. 2 | ✅ | L63 `- height: 173 cm` |
| A4 | **Sexe** | `/app/setup` ét. 2 | ✅ | L66 `- gender, as they picked it: female` |
| A5 | **Poids** | `/app/setup` ét. 2 | ✅ | L77 `- weight: 68.4 kg, measured week of 2026-08-17` |
| A6 | **Tour de taille** | `/app/plan`, modale §1 | ✅ | L78 `- waist: 79 cm, measured week of 2026-08-17`. ⚠️ **P1 est périmé** — voir plus bas. |
| A7 | **Niveau d'activité** | `/app/setup` ét. 2, 4 tuiles | ✅ **CORRIGÉ** | L67 `- how their days go: training four times a week or more, or a physical job`. **Absent du run 01** (R2). |
| A8 | **Séances d'activité** | `/app/progress` | ❌ | Séance saisie (`strength`, 75 min, `hard`) : **zéro occurrence** de `75` ou `strength` dans le prompt. Aucun des deux générateurs n'importe `activity_session.ts`. **Coût : un écran complet collecte une donnée qu'aucun prompt ne lit.** Non corrigé : le besoin de dimensionnement est couvert par A7, et une séance datée relève d'un lot « énergie » hors périmètre. |

## B. La direction

| # | Information | Saisie | État | Preuve / raison |
|---|---|---|---|---|
| B1 | **Direction** | `/app/setup` ét. 2 (`<select>`) | ✅ | L72 `goal: muscle_gain`. ⚠️ **R0 corrigé** : `/app/plan` ne propose plus que 3 fiches. |
| B2 | **Poids visé** (74) | `/app/setup` ét. 2 | ❌ | **Exclusion écrite et argumentée** : `meal_body.ts:63` « Ce qui N'Y EST PAS, et n'y entrera pas ». Un modèle qui lit « vise 74, en pèse 68,4 » raisonne en écart. **Coût assumé.** |
| B3 | **Rythme** (0,25 kg/sem) | `/app/setup` ét. 2, curseur | ❌ | Aucun lecteur sur les deux lanes de composition. **Aucun arbitrage trouvé**, colonne créée le 2026-08-18 même (`20260818190000`). **À trancher par l'humain** — non touché. |
| B4 | **Axe à faire monter** | ⛔ jamais rendu | ❌ | `indicatorFor(goal).axisObjective` est `false` sur les 3 objectifs survivants, et **chaque save du formulaire remet `focus_axis` à `null`**. Les deux prompts l'écrivent pourtant. **Coût : deux lecteurs sur une colonne que rien ne remplit.** Correctif = lot d'écran, hors périmètre. |
| B5 | **Aspiration** | `/app/plan`, modale §2 | ✅ **CORRIGÉ** | L73 `what they are actually after, in their words: Carry my own kayak down to the water by spring.` **Absente du run 01** (R5). ⚠️ **Présente, exploitabilité non observable** : aucune trace dans la sortie — c'est un critère de RANG, pas une consigne citable. |
| B6 | **Situation** | **aucune surface** | ❌ | L74 `their situation: not stated.` Le champ a été retiré du payload exprès (`StudentWeekPlanPage.tsx:1875`), commentaire assumant « les nouveaux n'en auront pas ». **Agent 1A ne peut pas le remplir par l'écran.** |

## C. Ce qu'on ne met pas dans l'assiette

| # | Information | Saisie | État | Preuve / raison |
|---|---|---|---|---|
| C1 | **Allergies** | `/app/setup` ét. 2 (modale) | ✅ | L3 `- sesame — allergy, severity=medical (declared by student)`, **en tête du message**. |
| C2 | **Intolérance / dégoût / médicament** | `/app/health` | ✅ | L4 `- dairy — intolerance, severity=strict`, L5 `- beetroot — dislike, severity=preference`, L6 `- levothyroxine — medical, severity=medical`. ⚠️ **DEUX RÉSERVES** : (a) **R15 confirmé** — un `dislike/preference` est servi sous « These are not preferences » ; (b) **le champ `notes` n'atteint AUCUN prompt** — « hard cheese in small amounts is fine », saisi sous une invite qui promet l'inverse (« e.g. traces are fine, cooked is fine »), zéro occurrence. Non corrigé : c'est la ceinture de sécurité, une note qui assouplit une contrainte médicale demande un arbitrage humain. |
| C3 | **Maladies déclarées** (`condition_ref`) | — | ❌ | **La checklist d'origine se trompait.** `/app/health` avec `kind='medical'` écrit `medication_class` (`StudentHealthPage.tsx:105`), **jamais `condition_ref`**. La section `=== DIAGNOSED CONDITIONS ===` ne peut donc pas être produite depuis un écran : zéro occurrence dans le prompt. Le seul écrivain de `condition_ref` est la conversation. |
| C4 | **Régime alimentaire** | `/app/setup` ét. 3, 4 chips | ✅ repas · **⚠️ semaine corrigée, non observée** | L17 `This student is PESCATARIAN: no meat and no poultry…`. **R3 confirmé puis corrigé** sur `generate-week-plan-v1` — mais **aucun run réel de semaine** : `generateWeekPlan` (`api/weekPlan.ts:142`) **n'a aucun appelant dans le front**, la lane n'est déclenchable par aucun écran élève. Tenu par un test de comportement + un test de source. |

## D. La forme de la journée et de la semaine

| # | Information | Saisie | État | Preuve / raison |
|---|---|---|---|---|
| D1 | **Moments de repas** | `/app/setup` ét. 3 | ✅ | L82-84 `- breakfast (small for them)` / `- lunch (large for them)` / `- dinner (medium for them)` |
| D2 | **Taille de chaque moment** | `/app/setup` ét. 3 | ✅ | idem — la taille est **dans** la ligne du moment. |
| D3 | **Absences** | `/app/plan` → « Pick the meals » | ✅ | L89 `- Wednesday: lunch`. **Exploité** : la sortie ne compose aucun déjeuner mercredi. |
| D4 | **Déjeuner dehors** | ⛔ jamais rendu en solo | ❌ | `workLunchIsAskable` exige un `memberId`. Et `parseAwayDays` ne lit pas `kind` : même s'il existait, il sortirait sous « they are NOT eating here ». **Coût : l'énergie d'un midi dehors n'est rattrapée nulle part.** Hors périmètre (surface foyer). |
| D5 | **Propriétés de jour** | **aucun écran nulle part** | ❌ | Lecteur vivant (`parseDayProperties`) et bloc écrit (`day_properties.ts:144`), **aucun écrivain**. Zéro occurrence de `WHAT THOSE DAYS ARE FOR` dans les deux runs. **C'est le seul champ que l'écran ne peut pas atteindre par conception.** |
| D6 | **Apports fixes (le shaker)** | `/app/setup` ét. 2 | ⚠️ **amputé** | L93 `- Vanilla whey shake (31 g), every day` — libellé, quantité, jours ✅. **Les 24 g de protéine et les 118 kcal : zéro occurrence** (R10 confirmé). L'écran **exige** les trois nombres. L'absence des kcal suit la règle du dépôt ; celle des **grammes de protéine** contredit `PROTEIN_ANCHOR_PROMPT_LINE`. **Arbitrage humain demandé avant correctif.** |

## E. Ce qu'il peut vraiment faire

| # | Information | Saisie | État | Preuve / raison |
|---|---|---|---|---|
| E1 | **Jours de cuisine** | `/app/plan` | ✅ | L97 `they usually cook on thu -- all of which fall after wed…` (branche « trop tard », exercée). |
| E2 | **Temps par session** | `/app/plan` | ✅ | L103 `time per cooking session: about 45 minutes.` |
| E3 | **Niveau de recette** | `/app/plan`, modale §4 | ✅ | L104 `recipe level they want: keen` |
| E4 | **Répétition acceptée** | `/app/plan`, modale §4 | ✅ | L105 `repetition they accept: varied` |
| E5 | **Budget** | `/app/plan` | ✅ | L106 `budget for this plan: 63, in the local currency…` + l'ordre de sacrifice. |
| E6 | **Moyens de cuisson** | `/app/setup` ét. 3 | ✅ **CORRIGÉ** | L98-102 `what their kitchen does NOT have …` / `- no oven: …` / `- no freezer: …`. **Absent du run 01**, où la sortie ouvrait par « Heat the oven ». **Exploité** : 0 occurrence de `oven` dans la sortie du run 02, tous les `roast` sont des `pan-roast`. |
| E7 | **Forme de cuisson** | ⛔ jamais en solo (`api/cookingShape.ts:107`, ≥2 bouches) | ❌ | Hors sujet solo, confirmé. Aucun coût. |

## F. Ce qu'il a dit, et ce qui n'est vrai que cette fois

| # | Information | Saisie | État | Preuve / raison |
|---|---|---|---|---|
| F1 | **Consignes écrites** | — | ❌ | **La checklist d'origine se trompait** : `FoodPreferencesCard.tsx:359` est le bouton « drop » d'une proposition, **il n'y a aucun champ de saisie libre** dans cette carte (relu en entier). Le seul chemin est la **conversation → memorizer** : un tour réel a été envoyé (« Please never put aubergine in my plan… And I always want oats at breakfast »), le tour a abouti (2 appels modèle, `success`), et **aucun `memory_items` ni `food_preferences` n'existait 90 s plus tard**. **Coût : la promesse « ce que tu me dis se retrouve dans ton plan » n'est vérifiable par aucun geste d'écran synchrone.** |
| F2 | **Goûts confirmés** | mêmes cartes | ❌ | Même chaîne que F1 : sans proposition du memorizer, il n'y a rien à confirmer. |
| F3 | **Rangement d'un souvenir** | `/app/about-you` | ❌ | Dépend de F1/F2 : aucun souvenir à ranger. La RPC `keel_write_retained_items` **existe bien en base** (signature à 7 arguments) — le doute de la checklist est levé. |
| F4 | **Envie du moment** | `/app/plan` | ✅ | L111 `what they feel like eating THIS TIME: smoky harissa flavours, and one proper roast`. **Exploité** : 2 plats « harissa », un « proper pan-roast salmon ». |
| F5 | **« Envie de la semaine »** | ⛔ jamais en solo | ❌ | Confirmé : `generate-meal-v1` ne lit pas `household_envy_submissions`. Aucun coût sur cette lane. |
| F6 | **Contexte du moment** | `/app/plan` | ✅ | L110 `what is going on for them RIGHT NOW: two late meetings, Thursday evening is chaotic`. **Exploité** mot pour mot dans `cooking_sessions[thu].run_through`. |
| F7 | **Garde-manger** | `/app/plan`, mode `from_pantry` | ✅ | L114-118, sous le **nouvel** en-tête `-- WHAT IS ALREADY IN THEIR CUPBOARDS --`. **Exploité** : aucun des 4 articles dans la liste de courses. |
| F8 | **Personnes à table** | `/app/plan` | ✅ | L112 `people at the table: 1` |
| F9 | **Note de remix** | `PlanDraftDialog` | ❌ **non mesuré** | Le dialogue de brouillon n'a pas été ouvert dans ces deux runs (il suit une composition depuis le tunnel). Ni confirmé ni infirmé — **c'est le seul champ que je laisse sans mesure**, et je le dis plutôt que de le cocher sur du code. |
| F10 | **Fenêtre du plan** | `/app/plan` | ✅ | `today is: tue` + `days to fill, in this order: wed, thu, fri` |
| F11 | **Mode** | `/app/plan` | ✅ | L127 `mode: from_pantry` |
| F12 | **Dégoûts (comme tels)** | ⛔ `MouthFormDialog` est foyer | ❌ | Le canal solo est `/app/health` `kind='dislike'` (couvert en C2). Confirmé. |
| F13 | **Habitudes** | ⛔ jamais en solo | ❌ | Aucune surface, aucun lecteur solo. Confirmé, aucun coût sur cette lane. |

## G. Le contexte implicite

| # | Information | État | Preuve / raison |
|---|---|---|---|
| G1 | **Pays** | ✅ | L122 `they shop in: GB (ISO-3166 country code)` |
| G2 | **Fuseau** | ✅ | L121 `today's date: 2026-08-18` + `today is: tue` (résolus depuis `Europe/London`) |
| G3 | **Langue** | ✅ | bloc de queue `Write the human-readable TEXT of your JSON in English (en-GB).` |
| G4 | **Doctrine du coach** | ✅ **+ CORRECTION** | L24-56. ⚠️ **La suspicion « seul `claim` est injecté » est FAUSSE sur cette lane** : les convictions portent `claim` **et** `rationale` (L25 `… (what predicts results is regularity, not perfection)`), et chaque interdit porte **`reason` ET `instead`** (L33-36, `INSTEAD, this coach says: …`). Le constat de l'étape zéro venait du prompt **foyer**. Portée par objectif respectée : la conviction `eat_before_you_train` (portée `fat_loss`) est absente pour un `muscle_gain`, et les 4 clés citables le reflètent. |
| G5 | **Mapping alimentaire du coach** | ❌ **non mesuré** | Marc n'a aucune ligne `coach_protocols` : le bloc 4 est vide, donc ni confirmé ni infirmé. ⚠️ **Observé au passage** : les `foods.discouraged` de sa doctrine (`energy drink`, `meal replacement shake`) **n'apparaissent nulle part** dans le prompt repas. À reprendre par un lot coach. |
| G6 | **Note 1:1 du coach** | ❌ **non mesuré** | Aucune note en base pour cet élève ; l'écrire demande une session coach (contamination du profil de navigateur partagé). Le bloc est câblé au call site (`coachNotePromptBlock(coachNote)`). |
| G7 | **`allergy_check` / `diet_asked`** | ❌ | Lane semaine seulement (R13, liste NOIRE), et aucun run semaine n'est déclenchable par un écran. Absents du prompt repas — normal, il lit des clés nommées. |

---

# LES RUPTURES : ce que la mesure a fait de chacune

| | statut après mesure |
|---|---|
| **R0** · `/app/plan` propose 6 directions, la base en accepte 3 | ✅ **CONFIRMÉ puis CORRIGÉ** (6 boutons radio comptés dans le DOM). L'écran itère désormais `GOAL_TOKENS`; le cast `as GoalToken` du site d'appel est retiré (exhaustivité réarmée); 3 tests neufs dans `bodyMeasures.int.test.ts`, **prouvés mordants par mutation** (liste locale ré-ajoutée ⇒ 3 rouges, les anciens tests restant verts). |
| **R1** · les moyens de cuisson ne parlent qu'au foyer | ✅ **CONFIRMÉ puis CORRIGÉ**. Preuve du coût : la sortie du run 01 ouvre par « Heat the oven » pour quelqu'un sans four. |
| **R2** · le niveau d'activité n'entre pas dans la consigne | ✅ **CONFIRMÉ puis CORRIGÉ**. |
| **R3** · le régime absent du prompt de semaine | ✅ **CONFIRMÉ puis CORRIGÉ** (code + tests). **Non observé sur un run réel** : la lane semaine n'a aucun déclencheur d'écran. |
| **R4** · poids visé et rythme dans aucun générateur | ✅ **CONFIRMÉ**. Poids visé = exclusion argumentée. Rythme = **à trancher par l'humain**. |
| **R5** · l'aspiration n'atteint pas le prompt repas | ✅ **CONFIRMÉ puis CORRIGÉ**. |
| **R6** · `focus_axis`, le seul écrivain l'efface | ✅ **CONFIRMÉ** (colonne `null` après chaque save du formulaire d'objectif). Non corrigé : lot d'écran. |
| **R7** · `situation`, deux lecteurs, plus aucun écrivain | ✅ **CONFIRMÉ** (`their situation: not stated.`). |
| **R8** · `day_properties`, lecteur vivant, aucun écrivain | ✅ **CONFIRMÉ** (bloc absent des deux prompts). |
| **R9** · double injection de la capacité de cuisine | ⚪ **NON EXERCÉ** — compte neuf, `retained_items` et `retained_next_plan` **absents** (vérifié en base avant chaque run). Le piège P3 était donc désarmé; la mécanique n'a pas été testée. |
| **R10** · le shaker sans ses protéines ni ses calories | ✅ **CONFIRMÉ**. Arbitrage demandé. |
| **R11** · déjeuner dehors inatteignable et écrasé | ✅ **CONFIRMÉ** côté écran (jamais rendu en solo). |
| **R12** · deux sections avec le MÊME en-tête | ✅ **CONFIRMÉ sur le cas exact** (shaker + `from_pantry` dans le même message) **puis CORRIGÉ**. |
| **R13** · la lane semaine sérialise tout | ⚪ **non observé** (aucun run semaine possible par écran). |
| **R14** · `content_locale` sélectionné et jamais utilisé | ⚪ non ré-examiné, sans effet mesurable sur le prompt. |
| **R15** · un dégoût servi comme une contrainte dure | ✅ **CONFIRMÉ** — `beetroot / dislike / preference` sous « These are not preferences ». Non corrigé (ceinture de sécurité). |
| **R16** · le prénom n'existe pas sur cette lane | ✅ **CONFIRMÉ**, et voulu. |

## Deux ruptures **neuves**, trouvées par la mesure

- **N1 · Le `notes` de `/app/health` n'atteint aucun prompt.** Le champ est stocké
  (`student_safety_constraints.notes`), l'invite promet un usage (« e.g. traces are fine, cooked is
  fine… »), et `safetyConstraintsPromptBlock` ne l'écrit pas. Un élève qui déclare « le fromage à
  pâte dure passe » reçoit un plan qui l'exclut comme s'il n'avait rien nuancé.
- **N2 · `kind='medical'` de `/app/health` n'écrit pas `condition_ref`.** Il écrit
  `medication_class` (`refFieldFor`). La section `=== DIAGNOSED CONDITIONS ===` est donc
  **inatteignable depuis un écran** ; seule la conversation peut la remplir. C3 de la version
  d'origine attribuait cette surface à tort.

---

# CORRECTIONS AU GUIDE « COMMENT REMPLIR CHAQUE CHAMP »

Ce qui **diffère** de ce que la version de lecture-de-code annonçait, parcouru dans un navigateur :

1. **`/app/setup` a bien 4 étapes en solo**, et l'étape 2 sauve tout au clic sur « Continue ».
   Le poids visé **et** le curseur de rythme apparaissent dès qu'une direction qui bouge est
   choisie, sans exiger d'avoir déjà rempli le corps (taille + poids étaient saisis avant, donc la
   borne haute du curseur était calculable — **la borne est `0.65`, pas une valeur libre**).
2. **La modale d'allergies s'ouvre sur « Fill in their food preferences »**, et le repli « What
   they already eat » est **déjà ouvert** sous `muscle_gain` (conforme). Le shaker demande
   **3 nombres**, pas 4 champs : libellé + grammes + protéines + kcal.
3. **`FoodPreferencesCard` n'a AUCUN champ de saisie libre** (F1 ci-dessus). Le guide envoyait
   vers une ligne qui est un bouton « drop ».
4. **`/app/health` : `kind='medical'` bascule en saisie libre et écrit `medication_class`** (N2).
5. **Le tour de taille de `/app/plan` écrit dans les DEUX tables** : `student_body_measures`
   (`source='plan_card'`) **et** `weekly_reviews.biofeedback`. **Le piège P1 est donc périmé** dans sa
   forme (« `/app/plan` n'écrit que dans `weekly_reviews` ») ; ce qui reste vrai est qu'il faut
   choisir une surface par run et le noter.
6. **`mergePracticalConstraints` (P4) ne m'a rien effacé** sur 5 écritures successives depuis 4
   cartes différentes (équipement, rythme, capacité, absences, capacité de cuisine). Le piège n'est
   pas infirmé — il demande deux cartes montées simultanément — mais il ne se déclenche pas sur un
   parcours normal.
7. **La lane semaine n'a aucun déclencheur d'écran** : `generateWeekPlan` est exportée et **jamais
   appelée** dans `frontend/src`. Toute mesure de cette lane demandera un appel HTTP direct.

## Le piège de poste qu'il faut connaître pour refaire ce lot

**Les clics `computer.left_click` du navigateur ne sont pas parvenus à la page** pendant la seconde
moitié de la session (mesuré : aucun `mousedown`/`click` reçu par un écouteur en capture posé sur
`document`, alors que `hover` et la frappe clavier arrivaient bien — deux agents partagent le même
panneau). La saisie a donc été faite avec `form_input` (qui passe par le setter natif + événement
React, comme un vrai geste) et, pour les boutons, `element.click()` sur le **vrai bouton de
l'écran** : le `onSubmit`/`onClick` de l'application, sa validation et son appel réseau s'exécutent
à l'identique. **Aucune donnée d'élève n'a été écrite en SQL.**

---

# CE QUI RESTE À TRANCHER (pour l'humain)

1. **Le rythme (`target_pace_kg_per_week`)** — colonne du 2026-08-18, `CHECK`, RPC, curseur borné,
   **aucun lecteur** sur les lanes de composition, **aucun commentaire d'exclusion**. Oubli ou lot en
   cours ? Non touché.
2. **Les grammes de protéine du shaker (R10)** — l'absence des kcal suit une règle écrite ; celle
   des protéines contredit l'ancre protéique demandée par le prompt système.
3. **Le `notes` des contraintes (N1)** — l'écran promet un usage ; l'injecter assouplirait une
   ceinture de sécurité. Décision produit.
4. **Un dégoût sous « These are not preferences » (R15)** — l'information est là, la consigne ne
   demande pas de distinguer.
5. **Les séances d'activité (A8)** — écran complet, table, module, **aucun lecteur de prompt**.
