# RAPPORT FF-018 — La photo de repas

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-08 · **Stack** locale,
**vrai modèle de vision** (`gemini-3.1-pro-preview`, `MEGA_TEST_MODE=0` vérifié
dans le conteneur), vraie base, élèves provisionnés avec plan publié.

> **Verdict d'ensemble.** FF-018 **est livrée et elle tient**. Les trois filtres,
> la dédup, le filtre de sujet, la survie de l'upload à une panne d'analyse, le
> rattachement FF-025 et la garde du plat prévu passent tous en run réel.
>
> **Un seul défaut trouvé dans le périmètre de la fiche, et il touche l'élève** :
> une valeur d'énergie **écrite en toutes lettres** (« about four hundred
> calories », « environ deux cents calories ») traversait le FILTRE 1 **jusqu'à
> l'accusé rendu à l'élève**, et le lexique macro français (`32 g de protéines`)
> n'était pas couvert du tout. **Corrigé**, 4 tests neufs, 1678 tests verts.
> ⚠️ **Aucun filtre n'a été desserré** : le renversement calories reste fermé,
> `CALORIE_REVERSAL.md` étape 0 intacte.
>
> **T-17 (double écriture) n'existe PAS sur le chemin photo** — mesuré 1→1 sur la
> correction, 1 ligne sur trois formes de course.
>
> **Un RED ouvert, hors de mon périmètre d'écriture** : l'ouverture du flow de
> précision côté photo **écrase** un flow texte déjà ouvert (clé unique de
> `temp_memory`), et la réponse de l'élève amende alors la mauvaise ligne.
> Matière pour FF-023, comme le demandait mon bloc.

---

## 0. Le piège nommé — ce que je n'ai PAS touché

L'écart « aucune énergie » (code) vs « aucune énergie **nue** » (contrat amendé
2026-08-06) est **intact**. `MEAL_ANALYSIS_PROMPT_VERSION` n'a pas bougé
(`meal_analysis.en.v3`), aucun champ `energy_estimate` n'a été ajouté, aucun
motif n'a été retiré, `no_calorie_to_student_property_test.ts` n'a pas été
touché (44 tests verts).

La correction du §3 **ajoute** de la couverture. `CALORIE_REVERSAL.md` §2 dit
mot pour mot que `MEASUREMENT_PROSE_PATTERNS` est « **inchangé, et c'est le cœur
de la garde** », et que « le chiffre en prose libre reste interdit et reste
supprimé » — avant comme après le renversement. Une énergie en lettres est un
chiffre en prose libre. Le corriger va donc dans le sens du chantier, jamais
contre lui ; le bloc de commentaire ajouté au-dessus des motifs le dit
explicitement pour le prochain lecteur.

---

## 1. État initial constaté — avec preuves

### La chaîne existe, entière

| Étage | Fichier | Ce qu'il FAIT (vérifié) |
|---|---|---|
| Entrée web | `supabase/functions/meal-photo-upload-v1/index.ts` | JSON base64 nu (pas de multipart, `UPLOAD_SCHEMA` l. 156-202) ; JWT élève, jamais un `user_id` du corps (l. 388-405) ; mime par **octets magiques** (l. 481-496) ; date locale **serveur** (l. 567) ; upload → relecture de l'objet → insert → relecture de la ligne (l. 769-904) |
| Analyse | `supabase/functions/analyze-meal-photo-v1/index.ts` | idempotente sur une **ligne relue** (l. 321-332) ; `force: true` réanalyse ; write-through **quadruple** vérifié (`analysis_version`, `food_group_ref`, `portion_band`, `disqualified_reason` — l. 553-601) |
| Décision pure | `supabase/functions/_shared/keel/meal_analysis.ts` | 3 filtres + `mealDisqualification` + `resolveFoodGroupCredit` + `renderMealPhotoAck` ; aucun I/O |
| Rattachement | `supabase/functions/_shared/keel/photo_invitation_attach.ts` | FF-025 R4, fenêtre 30 min, **après** l'analyse |

### Les invariants de la fiche §5, relus en base

Ligne réelle du run A (`8460c31a-c193-49ec-bbf9-8596bf696624`) :

```
src=photo disq=null subject=eaten_meal fgr=null band=moderate
qty=null/null subst=null weight=1 analyzed=2026-08-08T10:34:40.92+00:00
foods=[grilled chicken breast, brown rice, broccoli]
food_groups_present=["poultry","whole_grain","cruciferous_veg"]
media_path=24efdf98-…/2026-08-08/0043a362-….png
```

`source='photo'` ✅ · `evidence_weight=1.0` ✅ · `quantity`/`unit`/`substance_ref`
NULL ✅ · `media_path` non vide ✅ · `portion_band` dans le vocabulaire fermé ✅.

### Idempotence par `client_upload_id`

Confirmée sur les **trois** chemins :
`objectPath()` dérive la clé du bucket de `client_upload_id` (l. 317-329) ;
`source_message_id = web_photo:<path>` (l. 632) ; l'index partiel
`protocol_events_media_dedup_idx` sur `(user_id, local_date, media_sha256)` est
l'arbitre réel, et le `SELECT` de l'étape 5bis n'est qu'une optimisation
(commentaire l. 634-641 — exact). Le client web le passe bien
(`frontend/src/keel/api/mealPhoto.ts:231`, `ChatPage.tsx:490`,
`TodayPage.tsx:966`).

### Baseline de tests, avant toute modification

`env -u SUPABASE_* deno test … meal_analysis_test.ts photo_invitation_attach_test.ts`
→ **113 passed / 0 failed**. Aucun rouge préexistant sur mon périmètre.

### Deux points que FF-025 avait payés — RE-VÉRIFIÉS, pas re-découverts

| Point | Preuve du run |
|---|---|
| `analyzed_at` présent dans `EVENT_COLUMNS` de l'upload | `meal-photo-upload-v1/index.ts:360` ; et D6 rend `attached_to_declared_meal=true` avec **1 seule ligne** en base |
| Le rattachement se fait **APRÈS** l'analyse | D7 : photo de menu après invitation → **2 lignes**, le repas déclaré garde `disqualified_reason=null` et **n'a pas** reçu la photo. Rattaché avant, il aurait disparu de la vue du coach |

---

## 2. Écarts fiche / code

### 2.1 CORRIGÉ — une énergie en toutes lettres atteignait l'élève

**La fiche** : R3 « Aucune énergie, aucun macro, aucun micro » ; §8 « **AUCUNE**
valeur d'énergie, de macro ou de micronutriment n'apparaît » ; §10 « Valeurs
d'énergie ayant franchi le filtre : **zéro** ».

**Le code, avant** : les 4 motifs de prose exigeaient un **chiffre arabe**
adjacent au mot d'énergie. Mesuré (sonde pure, `docs/nutrition-pivot/qa-web/FF018-filter-probe.txt`) :

```
🔴 EN LETTRES + calories   | intact | « This is about four hundred calories. »
🔴 EN LETTRES + kcal       | intact | « roughly two hundred kcal »
🔴 FR LETTRES + calories   | intact | « Environ deux cents calories. »
🔴 FR chiffre + protéines  | intact | « Il y a 32 g de protéines. »
🔴 FR grammes de glucides  | intact | « 45 grammes de glucides. »
```

Et ce n'est pas théorique : la sonde a poussé une sortie modèle hostile jusqu'au
bout, et l'**accusé rendu à l'élève** disait

> « I see grilled chicken (about [removed]), brown rice, **roughly two hundred
> calories**. Was that about **two hundred calories** of rice, or more? »

Le `[removed]` prouve que la garde mordait sur le chiffre arabe **dans la même
phrase** — donc la garde était là, et elle laissait passer la même affirmation
sous une autre orthographe.

**Ce que j'ai écrit** (`_shared/keel/meal_analysis.ts`, `MEASUREMENT_PROSE_PATTERNS`) :
trois motifs de plus — un nombre écrit en lettres (FR+EN) à portée d'un mot
d'énergie, et le lexique macro français dans les deux ordres. **Condition de
désarmement re-énoncée** : chaque motif exige une quantité adjacente ; « a
protein-rich plate », « high in fiber », « une assiette riche en protéines »,
« Two plates on the table, no calorie counting here » et « Deux tranches de pain
complet » sont **intacts** (test dédié).

**Après** : 14/14 sur la sonde, `hundred calories` absent de l'accusé.

**Non-régression en run RÉEL, et c'est le point qui compte** : les phases E et F
(9 uploads, vrai modèle) ont tourné **après** la correction, avec
`docker restart supabase_edge_runtime_Sophia_2` entre les deux — le runtime sert
des `_shared` périmés sinon. Les hypothèses du modèle sortent **intactes** :
« The chicken may have been lightly oiled before grilling to prevent
sticking. », « A small amount of oil may have been used on the grill… ». Aucun
`[removed]` parasite : la garde ne mord pas sur la prose qualitative.

**Chronologie du run, pour qui relit les sorties** : A/B/C/D ont tourné **avant**
la correction (aucune énergie n'apparaît dans leurs 21 uploads, donc rien à
re-mesurer), E/F **après**.

### 2.2 Amendements de fiche PROPOSÉS — non appliqués, l'humain tranche

| # | Ce que la fiche dit | Ce que le code fait, et pourquoi il a raison |
|---|---|---|
| **A-1** | §7 « Photo qui n'est pas un repas → **aucun fait** » ; §8 « Alors **aucun fait n'est enregistré** » | Le code écrit **une ligne**, avec `disqualified_reason` non nul (`not_food` / `food_not_eaten` / `unreadable`). C'est meilleur : les six lecteurs filtrent une colonne au lieu de ré-implémenter la règle, la trace reste auditable, et « cet élève envoie des photos illisibles » est un signal que son coach peut lire — l'en-tête de `mealDisqualification` (l. 1169-1194) porte déjà cet arbitrage. **Reformuler §7/§8 en « aucun fait COMPTÉ »**, pas « aucun fait ». |
| **A-2** | §11 « Une photo envoyée après coup doit dire à quel repas elle se rattache. **Le rattachement n'est pas décidé.** » | Il l'est **partiellement** depuis FF-025 : `photo_invitation_attach.ts` rattache une photo à un hors-plan invité, **≤ 30 min, même jour local, `plan_relation='off_plan'`, fait non disqualifié, ligne photo fraîche**. Ce qui reste ouvert est le rattachement **différé** (photo du lendemain). **Réécrire le bullet** pour dire ce qui est décidé et ce qui ne l'est pas. |
| **A-3** | §4 nomme « FILTRE 3 · la question de précision » | Le code a **quatre** étages : le filtre de mise sur la question, **et** le filtre de sujet (`subject_kind`), tous deux commentés « FILTER 3 » dans le fichier (l. 1054 et l. 1088). Le filtre de sujet est celui qui a le plus de valeur mesurée (la capture d'app de livraison qui créditait six groupes). **Ajouter le filtre de sujet au schéma du §4** et renuméroter. |
| **A-4** | §10 « Valeurs d'énergie ayant franchi le filtre : zéro », mesuré par `dropped_measurement_fields` | Une clé d'énergie **hors vocabulaire anglais** (`energie`, `apport_calorique`, `calories_estimees`) survit au filtre de clés **sans être comptée**. Le coût réel est nul (`buildRecognizedPayload` ne recopie que des champs typés, donc rien n'atteint la base ni l'élève — vérifié sonde §2), mais **la métrique du §10 peut lire « zéro » alors que le modèle a émis de l'énergie**. À arbitrer : élargir les clés, ou dire dans §10 que la métrique porte sur les clés connues. |

---

## 3. Tableau des tests

Tous les runs : vrai modèle, base locale, élève KEEL complet (`keel_role`,
`timezone`, `country`, **`locale` écrite explicitement**, `coach_clients` actif
avec consentement, `student_week_plans` adopted, et `plan_versions` publié +
`plan_commitments` sauf mention contraire). Un coach jetable **par élève**
(plafond de 3 sièges).

### easy — `docs/nutrition-pivot/qa-web/FF018-A-nominal.txt`

| Scénario | Verdict | Preuve |
|---|---|---|
| Assiette poulet-riz-brocolis, **run 1/3** | 🟢 | `8460c31a` : `foods=[grilled chicken breast, brown rice, broccoli]`, `food_groups_present=["poultry","whole_grain","cruciferous_veg"]`, `band=moderate`, `qty/unit/subst=null`, `weight=1`, 14/14 assertions |
| **run 2/3** | 🟢 | `7ebb8f70`, mêmes trois aliments, `band=moderate`, 14/14 |
| **run 3/3** | 🟢 | `d27fc46f`, `[…, broccoli florets]`, `band=moderate`, 14/14 |
| Zéro kcal / macro / % dans l'accusé **et** dans tout le jsonb `recognized` | 🟢 3/3 | lexiques `ENERGY_NUMERIC` + `ENERGY_SPELLED` appliqués aux deux surfaces : `[]` |

Note : `food_group_ref=null` sur ce cas est **correct**, pas un défaut — trois
groupes détectés dont deux atteignent le plan (`several_groups_in_plan`), et
`resolveFoodGroupCredit` refuse de trancher (`meal_analysis.ts` l. 1587-1595).

### medium — `FF018-B-subjects.txt`

| Scénario | Verdict | Preuve (`subject_kind` / `disqualified_reason` / bande) |
|---|---|---|
| assiette nominale | 🟢 compte | `eaten_meal` / null / `moderate` |
| assiette qui cache (sauce luisante) | 🟢 compte | `eaten_meal` / null / `moderate`, `fgr=non_starchy_veg`, accusé « Counted toward "Vegetables at lunch" » |
| assiette pomme entière | 🟢 compte | `eaten_meal` / null / `small`, `fgr=other_fruit` |
| menu de restaurant | 🟢 refuse | `food_not_eaten` / `food_not_eaten` / `unclear`, `detected_foods=0` |
| capture d'app de livraison | 🟢 refuse | `food_not_eaten` / `food_not_eaten` / `unclear`, `detected_foods=0` |
| rayon de supermarché | 🟢 refuse | `food_not_eaten` / `food_not_eaten` / `unclear`, `detected_foods=0` |
| selfie | 🟢 refuse | `not_food` / `not_food` / `unclear` |
| paysage | 🟢 refuse | `not_food` / `not_food` / `unclear` |
| étiquette nutritionnelle | 🟢 refuse | `not_food` / `not_food` / `unclear` — et **aucun** chiffre de l'étiquette sur la ligne |
| photo trop sombre, **3 passes** | 🟢 refuse, **STABLE** | `eaten_meal` / `unreadable` / `unclear` ×3. **C'était le seul instable du run L4 antérieur** (`unreadable` puis `not_food`) ; il ne l'est plus |
| dédup — même clé, même image | 🟢 | `idempotent=true duplicate=false`, events 1→1 |
| dédup — **autre clé**, même image | 🟢 | `idempotent=false duplicate=true`, events 1→1 (index sha) |
| deux images différentes | 🟢 | events 1→2 (pas de faux positif) |
| la bulle sur un doublon | 🟢 | ligne `role:'user'` **et** accusé « I already have that photo… » — le défaut mesuré 3/3 le 2026-08-05 ne revient pas |

### hard — `FF018-C-failures.txt`

| Scénario | Verdict | Preuve |
|---|---|---|
| Photo illisible → `unclear` assumé, aucun aliment inventé | 🟢 | `disq=unreadable`, `band=unclear`, `detected_foods=0`, accusé « I could not read that photo well enough… » |
| **L'analyse échoue** → l'upload survit | 🟢 | en-tête PNG valide + 4 Ko de bruit : HTTP 200, **1 ligne**, `analysis.status="failed"` (`Vision error: Unable to process input image`), `recognized=null`, `analyzed_at=null`, `food_group_ref=null`, `portion_band=null`, et l'échec est **dit** : « Saved. I could not analyse it just now — it is on file either way. » |
| Non-image déguisée en jpeg | 🟢 | HTTP 400 « The uploaded bytes are not a JPEG, PNG or WebP image », **0 ligne** |
| PNG **déclaré** jpeg (désaccord = signal) | 🟢 | HTTP 400 « Declared type image/jpeg does not match the actual image type image/png », 0 ligne |
| Charge > plafond du schéma | 🟢 | HTTP 400 (zod, 12 000 000 car.), 0 ligne |
| **Élève sans plan publié** (le cas normal du modèle KEEL) | 🟢 | HTTP 200, 1 ligne comptée, et l'accusé **ne parle pas d'un plan** : « I see brown rice, broccoli, grilled chicken breast. The chicken was likely grilled using some cooking fat or oil. Tell me if that is wrong. » Le 409 « No published plan » du run L4 antérieur a bien disparu |

### extra-hard — `FF018-D-crossings.txt`, `FF018-E-adversarial.txt`, `FF018-F-wrongdish.txt`

| Scénario | Verdict | Preuve |
|---|---|---|
| **Deux uploads simultanés**, même clé, même image | 🟢 | `Promise.all` → 200/200, `idempotent=false/true`, **1 ligne photo** |
| Deux uploads simultanés, **clés différentes**, même image | 🟢 | 200/200, **1 ligne** (l'index `media_sha256` tranche, et le rattrapage de violation d'unicité relit la ligne au lieu de rendre une 500) |
| Deux uploads simultanés, images **différentes** | 🟢 | 200/200, **2 lignes** — l'anti-faux-positif tient |
| Photo + note portant des **quantités déclarées** (`180 g of chicken, 200 g of rice…`) | 🟢 | `quantity=null`, `unit=null` ; la note est conservée **verbatim** dans `student_note` et **nulle part ailleurs** ; l'accusé n'en reprend **aucun** chiffre |
| Photo **pendant** une conversation, puis correction texte immédiate (départ propre, E1) | 🟢 | 0 → 1 → **1** ligne. « actually that was turkey, not chicken » → « Got it — turkey, not chicken. I'll treat that as the protein in the photo. » **Aucune seconde ligne** |
| Course **photo ‖ texte**, 3 passes (E3) | 🟢 3/3 | 200/200 chaque fois, **1 ligne photo**, flow photo **présent** après la course |
| `temp_memory` avant/après l'écriture photo (D5) | 🟢 | aucune clé perdue : `["__conversation_risk_scores","__keel_meal_photo_flow_state","__last_turn_risk_band","conversation_locale"]` identique avant/après |
| **Photo après invitation** → le fait est enrichi (FF-025 R4, D6) | 🟢 | `attached_to_declared_meal=true`, **1 ligne** : `aff6934e` porte `src=photo`, `plan_relation=off_plan`, `media_path`, `analyzed`, `weight=0.8` (le poids du déclaré est conservé) |
| **Photo de MENU** après invitation (D7) | 🟢 | `attached_to_declared_meal=false`, **2 lignes** : le déclaré garde `disq=null` et **aucun** `media_path` ; la photo est son propre fait `food_not_eaten` |
| Un flow **texte** ouvert, puis une photo (E2) | 🔴 | voir §4, hypothèse H-2 |
| **Deux plats jumeaux** poulet/canard le même jour (F1) | 🟢 | `planned_dish.verdict=probable`, `reason=several_plausible`, **0 coche** |
| Un seul plat, au **canard**, contre une assiette de poulet (F2) | 🟢 | `verdict=probable`, `reason=groups_match_terms_do_not`, `coverage=1`, **0 coche** — la garde sur les termes mord exactement là où il faut |
| Un seul plat, au **poulet** (F3, le cas nominal) | 🟢 | `verdict=confident`, `reason=single_full_cover`, **1 coche** `quick_tap` (`weight=0.4`, note « Chicken, brown rice and broccoli bowl »), nommée dans l'accusé avec sa porte de correction |

### unitaire (pur) — `docs/nutrition-pivot/qa-web/FF018-filter-probe.txt` + 4 tests neufs

| Cible | Avant | Après |
|---|---|---|
| Prose FR+EN, 14 cas | 5 écarts | **0** |
| Clés, 10 cas | 0 surprise | 0 surprise |
| Accusé de bout en bout, sortie modèle hostile | `two hundred calories` ×2 | **0** |

Suites : `meal_analysis_test.ts` **104 passed** · `_shared/keel/` complet
**1678 passed / 0 failed** · `keel_properties/` **44 passed** ·
`deno check` OK · `npx tsc -b` (frontend) **exit 0**.

---

## 4. Hypothèses adversariales — écrites avant d'être testées

| # | Hypothèse | Sort |
|---|---|---|
| **H-1** | Un chiffre d'énergie franchit le filtre **sous forme détournée** — en toutes lettres, FR et EN | ✅ **CONFIRMÉE, corrigée.** Voir §2.1. Testée **directement sur le filtre**, sans passer par un rendu réel : `PILOT_FORCED_LOCALE="en-US"` (`_shared/keel/locale.ts:28`) force la locale de tout artefact, donc **aucune prose française ne peut sortir d'un run réel** — conclure « la forme française ne se présente jamais » aurait été un faux vert (T-2). Même méthode que FF-029 et FF-011. |
| **H-2** | L'ouverture du flow photo **écrase** un flow texte déjà ouvert (`temp_memory`, clé unique, lecture-modification-écriture complète) | ✅ **CONFIRMÉE, non corrigée** (hors périmètre, voir §5). E2, déterministe : « I had a chicken sandwich for lunch » → 1 ligne `src=chat fgr=lean_protein` + flow `{source:"text", eventIds:["72ab969f…"]}` + question ouverte « And what did you have with it? ». La photo qui suit rend `{source:"photo", eventIds:["c00b666e…"]}`. **La cible du flow texte a disparu** : la réponse de l'élève à la question texte amendera la PHOTO. |
| **H-3** | La **bande** est convertie en nombre par un lecteur aval (`small→0.5`) | ❌ **RÉFUTÉE** par audit exhaustif des 9 consommateurs (`evaluator.ts`, `adherence.ts`, `coach_synthesis*.ts`, `week_review*.ts`, `evaluate-adherence-v1/*`, `frontend/src/keel/lib/mealRhythm.ts`). Le seul rang numérique, `PORTION_BAND_RANK` (`evaluator.ts:126`), sert **uniquement** à décider l'appartenance au compte `decidable` — il n'est jamais multiplié ni sommé. `portionBandGate` est **dégradant seulement, borne haute seulement, `large` seulement** et énonce ses 5 conditions de désarmement. Aucune traduction en portions nulle part. |
| **H-4** | L'accusé de photo **qualifie la journée**, et les ceintures du soir ne couvrent pas ce chemin | ⚠️ **PARTIELLEMENT confirmée, et DÉJÀ DOCUMENTÉE comme arbitrage ouvert.** L'accusé est livré par `deliverChatMessage` **directement** depuis `meal-photo-upload-v1` : il ne traverse ni doctrine, ni `finalVisibleText`, ni `ack_guard` — audité, `delivery.ts` n'applique **aucune** ceinture de contenu. Ce qu'il ne fait **pas** : aucune phrase de `renderMealPhotoAck` ne parle de la journée, du cumul ni d'une série (fonction pure, jeu de phrases fermé) → « qualifier la journée » : **non**. Ce qu'il fait quand même : deux chaînes **écrites par le modèle** l'atteignent (`clarifying_question`, `assumptions[].assumption`) avec le FILTRE 1 pour seule ceinture de contenu — c'est très exactement la famille T-16. |
| **H-5** | Sous **band de sécurité**, l'accusé part quand même, avec une sollicitation | ✅ **CONFIRMÉE, et documentée comme telle.** E4, `__last_turn_risk_band=critical` : les effets durables sont bien gatés (**0 coche**, **0 question inscrite**, flow **non ouvert**), mais l'accusé est livré et contient « — tell me which one to count. », et un **crédit** `fgr=non_starchy_veg` est écrit. `safety_band_io.ts` l. 19-21 nomme déjà exactement ces deux-là comme « ce qui reste NON gaté en crise, et qui relève d'un arbitrage produit ». Je ne l'ai pas « réparé » : la cicatrice `documented-constraints-outlive-their-cause` dit d'aller lire les commentaires — c'est fait, et ils disent que c'est un arbitrage en attente. |
| **H-6** | Une photo se rattache au **MAUVAIS repas planifié** | ❌ **RÉFUTÉE**, 3 cas (F1/F2/F3). La garde qui tient est `corroboratedGroups` : couvrir tous les groupes ne suffit pas, il faut que le modèle ait **nommé mot pour mot** un aliment de chaque groupe d'ancre. Une assiette de poulet contre un plat au canard rend `groups_match_terms_do_not` → **probable**, pas de coche. Et la condition de désarmement tient : le cas nominal coche (F3). |
| **H-7** | Une photo de menu arrivée après une invitation fait **disparaître** le repas déclaré de la vue du coach (le défaut nommé par FF-025) | ❌ **RÉFUTÉE** en run réel (D7). L'ordre « analyse d'abord, rattache ensuite » tient : `attached_to_declared_meal=false`, le déclaré garde `disq=null`. |
| **H-8** | Une **quantité déclarée** par l'élève est promue en `quantity`/`unit` | ❌ **RÉFUTÉE** (D4). Aucun chemin n'écrit ces colonnes sur le chemin photo — ni l'insert (l. 807-809), ni l'`UPDATE` de l'analyse (absentes du patch, l. 529-542). La déclaration reste dans `student_note`, verbatim. |
| **H-9** | La bande peut **remonter** une note (« l'assiette était grosse donc c'est met ») | ❌ **RÉFUTÉE** par lecture : `portionBandGate` ne fait que `met → partial`, seulement sur `target_op === "<="`, seulement sur `large`. Le sens plancher est **structurellement** exclu (PROPERTY TEST 1 : « logger un repas non conforme ne baisse jamais le score du jour » — sinon envoyer la photo coûterait des points que cacher l'assiette ne coûte pas). |
| **H-10** | Un élève en locale **française** fait planter le rendu de l'accusé (`renderMealPhotoAck` jette sur toute locale hors famille `en`, l. 1822) | ⚠️ **NON DÉCLENCHABLE aujourd'hui, latente demain.** `resolveArtifactLocale` rend `PILOT_FORCED_LOCALE="en-US"` **avant** toute chaîne de priorité (`locale.ts:113`), donc `content_locale` vaut `en-US` pour tout le monde et le garde ne peut pas mordre. Le jour où l'épingle pilote tombe, un élève `fr-FR` ferait **jeter `analyze-meal-photo-v1`** → `analysis.status:"failed"` → photo enregistrée **sans verdict** et accusé de repli, silencieusement. Consigné, non corrigé : le corriger demande de décider si l'accusé se traduit, ce qui est le chantier de l'épingle, pas celui-ci. |
| **H-11** | T-3 (le modèle décompose les plats composés et invente des `food_group_ref`) mord sur le chemin photo | ❌ **NON OBSERVÉ** sur 30 uploads réels. `issues=[]` et `dropped=[]` partout, aucun slug rejeté. La différence structurelle avec le chemin texte : ici le vocabulaire fermé est **imprimé dans le prompt** (`FOOD_GROUP_REFS.join(" | ")`, l. 675) **et** `parseFoodGroupRef` jette par slug au parsing, sans faire tomber la lecture entière. Cité, chantier non ouvert. |
| **H-12** | L'accusé empile plusieurs demandes dans un seul message (anti-interrogatoire §3.3bis, T4) | ⚠️ **CONFIRMÉE en mode 1:1 seulement.** F3 : « … — I have ticked it off. **Tell me if that was not it.** … **tell me which one to count** and I will log it. … **Tell me if that is wrong.** » — trois sollicitations. `uncertaintyLines` en choisit bien **une**, mais les phrases de coche et de crédit ajoutent les leurs. En modèle KEEL réel (`hasPrescription=false`) il n'en reste que **deux** (coche + incertitude). Observation produit, hors §6 de la fiche : je ne l'ai pas modifiée. |

---

## 5. Ce qui reste ouvert

### RED-1 — le flow photo écrase le flow texte (H-2)

**Où** : `meal-photo-upload-v1/index.ts` l. 1246-1281 appelle
`openMealPrecisionFlowState`, qui fait une **lecture-modification-écriture
complète** de `user_chat_states.temp_memory` sur la clé unique
`__keel_meal_precision_flow_state` (`meal_precision_flow_state.ts` l. 174-205).
Ce n'est même pas une course : c'est un **remplacement déterministe**.

**Le coût mesuré** : la question texte « And what did you have with it? » reste
posée à l'écran, et la réponse de l'élève amende la **photo**. Famille
`verify-turn-destructive-cancel` / `paul-hard21-track-target-pollution`.

**Pourquoi je ne l'ai pas corrigé** : fusionner les deux flows change `source`,
`componentKeys` et `targetAmbiguous` — donc la sémantique de **toute** correction,
y compris le cas nominal E1 qui est vert. C'est un arbitrage de FF-023 (`meal_precision.ts`
est réservé à un autre agent), et mon bloc demande explicitement de **documenter**
cette course plutôt que de l'ouvrir. **Matière pour FF-023.**

**Ce que ça coûte MAINTENANT vs avant FF-023** : la continuité de conversation ne
dépend plus seulement de `temp_memory` — `_shared/chat/recent_history.ts`
(20 msg / 1 200 car. / 12 h) porte le fil, et E1 montre que la correction
fonctionne. Le seul dégât résiduel est le **ciblage** d'une correction quand
les deux surfaces sont en jeu dans le même quart d'heure.

### Arbitrages produit ouverts, déjà nommés dans le code

1. **L'accusé et le crédit ne sont pas gatés par la safety** (H-5) —
   `safety_band_io.ts` l. 19-21 le dit et attend une décision produit.
2. **`clarifying_question` et `assumption` sont de la prose LLM sans ceinture de
   réponse** (H-4, T-16). Le FILTRE 1 est la seule garde de contenu ; ni la
   doctrine du coach ni ses termes interdits ne sont consultés sur ce chemin.
3. **L'épingle pilote de locale masque un `throw`** (H-10).
4. Les 4 amendements de fiche du §2.2.

### Hors périmètre, observé en passant (à ne pas me créditer)

- **Une question sur un repas FUTUR a écrit un fait durable.** Run D5, tour 1 :
  « Hey, quick one before dinner: is rice ok tonight? » → 1 ligne
  `src=chat fgr=refined_grain weight=0.8` **et** un flow de précision ouvert.
  L'élève n'a rien mangé. Famille `status-question-silent-create` / FF-017
  `futureIntent`. **Non testé plus loin, non corrigé** — c'est FF-017.
- 291 comptes `qa-coach-*@test.dev` traînent dans `auth.users` : résidu des runs
  de la nuit, **tous agents confondus**. Je n'y touche pas (base partagée, purge
  par motif interdite).

### Faux rouge de ma propre sonde — consigné exprès

Deux fois, mes probes ont menti, dans les deux sens :

1. **D5 a rendu un faux RED** (« la correction a écrit un second repas ») : je
   n'avais pas photographié l'état **avant** la photo, et la ligne comptée en
   trop avait été écrite par le tour d'AVANT. Repris proprement en E1 → vert.
2. **F a rendu trois faux verts et un faux rouge** : ma fixture écrivait
   `day: "saturday"` là où la production écrit `sat`
   (`local_date.ts:78`). `dishesForDate` ne résolvait aucun jeton, `planned_dish`
   sortait `null` partout — et le cas nominal, qui devait cocher, sortait
   « aucune coche » sans que rien n'échoue. **C'est T-15 mot pour mot**, et le
   commentaire du correctif le dit dans `FF018_F_wrongdish.ts` pour le prochain.

---

## 6. Commandes pour l'humain

**Rien de risqué n'est requis.** Aucune migration, aucun secret, aucun déploiement.

Rejouer les six phases (chacune est indépendante et nettoie ses fixtures) :

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
./scripts/local_extend_kong_functions_timeout.sh          # avant tout run long
docker restart supabase_edge_runtime_Sophia_2 && sleep 6   # code _shared modifié

eval "$(supabase status -o env | sed 's/^/export /')"
for phase in A_nominal B_subjects C_failures D_crossings E_adversarial F_wrongdish; do
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_ANON_KEY="$ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    deno run -A "docs/nutrition-pivot/qa-web/FF018_${phase}.ts"
done
```

Les suites, environnement **purgé** (sinon 114 faux rouges) :

```bash
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
    supabase/functions/_shared/keel/ \
    supabase/functions/sophia-brain/test_harness/keel_properties/
cd frontend && npx tsc -b
```

Déploiement, **si et seulement si** l'humain décide de livrer le durcissement du
FILTRE 1 (une seule fonction porte du code modifié via `_shared`, deux la lisent) :

```bash
supabase functions deploy analyze-meal-photo-v1
supabase functions deploy meal-photo-upload-v1
supabase functions deploy sophia-brain
```

---

## 7. Fichiers touchés

| Fichier | Nature |
|---|---|
| `supabase/functions/_shared/keel/meal_analysis.ts` | +3 motifs de prose (FILTRE 1), + le bloc de commentaire qui dit ce qui n'est PAS ouvert |
| `supabase/functions/_shared/keel/meal_analysis_test.ts` | +4 tests (lettres EN, lettres FR, macros FR, condition de désarmement bilingue) |
| `docs/nutrition-pivot/qa-web/FF018_lib.ts` | harnais FF-018 (élève, upload, relecture, lexiques, nettoyage par id exact) |
| `docs/nutrition-pivot/qa-web/FF018_{A,B,C,D,E,F}_*.ts` | les six phases rejouables |
| `docs/nutrition-pivot/qa-web/FF018-{A,B,C,D,E,F}-*.txt` | les sorties mesurées |
| `docs/nutrition-pivot/qa-web/FF018_filter_probe.ts` | la sonde pure du FILTRE 1, rejouable sans base ni modèle |
| `docs/nutrition-pivot/qa-web/FF018-filter-probe.txt` | sa sortie, après correction |
| `scratchpad/RAPPORT-FF-018.md` | ce rapport |

**Aucun** fichier réservé à l'autre agent n'a été modifié (`meal_precision.ts`,
`companion.ts`, `daily_pulse.ts`, `WeeklyCheckInDialog.tsx`, `week_review.ts`,
`week_review_io.ts`, `meal_generation.ts` — lus et appelés, jamais écrits).
