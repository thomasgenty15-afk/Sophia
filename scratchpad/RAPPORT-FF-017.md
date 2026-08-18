# RAPPORT — FF-017 · Le repas déclaré

**Fiche** : `docs/fonctionnalites/conversation/FF-017-le-repas-declare.md`
**Branche** : `ff-001-quotidien-du-coach` · **Date** : 2026-08-08
**Commit** : `cde3b0cd` — *le lexique cesse d'écrire du thé sur « the », et la
négation devient un veto*

**Méthode** : vrai modèle, base locale, élèves neufs provisionnés (profil
`keel_role='student'` + `locale` explicite + `coach_clients` actif + **plan
publié** avec `plan_commitments` + `student_week_plans` adopted), 3 répétitions
par cas, **un élève neuf par (cas × répétition)**. Chaque verdict cite la ligne
en base, jamais la réponse HTTP.

Harnais : `scratchpad/ff017_run.ts` au-dessus de
`docs/nutrition-pivot/qa-web/harness.ts`.
Journaux bruts, **avant** correctifs : `scratchpad/ff017_{medium,hard,extra,adv}.log`.
**Après** : `ff017_{easy2,medium2,hard2,extra2,extra3,adv2}.log`
(`extra3` = rejeu de `extra` une fois l'assertion de rétractation ajoutée).
Les `.json` ne portent que le DERNIER run de chaque groupe.
Fixtures `ff017_*` : **169 élèves + 57 coachs supprimés** en fin de run
(`protocol_events` et ledger orphelins : 0).
**168 exécutions réelles** (84 avant correctifs, 84 après) sur **138 élèves**
jetables.

---

## 1. État initial constaté — avec preuves

### Ce qui existait et tient

| Élément | Où | Constat mesuré |
|---|---|---|
| Plancher déterministe | `_shared/keel/meal_declaration_floor.ts` | livré ; lexique fermé, terme le plus long d'abord, sans chevauchement |
| Branchement | `router/run.ts:3996-4076` | s'ajoute **seulement** si le frame ne porte pas déjà `log_protocol_event` (R3) — vérifié en base : jamais de doublon de groupe sur 84 tours |
| Filet de refus | `run.ts:4726-4793` (`mealFloorNetArms`) | armé sur les 4 refus de FORME seulement |
| Question d'approfondissement | `meal_precision.ts` + `router/keel_meal_precision_lane.ts:346` | gabarits fermés FR+EN, gate déterministe, armé **après** l'écriture |
| **Plafond 1** | `meal_precision.ts:534` | `MEAL_PRECISION_DAILY_CAP = 1` — **déjà livré**. La dépendance qui tenait la fiche en 🟠 est satisfaite. |
| **Budget partagé** | `_shared/keel/daily_ask_budget.ts` ; `meal_precision_cap.ts` délègue | **un seul compteur**, prouvé en run réel (X5) |

**Le défaut de §1 est fermé.** Les deux phrases mesurées `[0,3,3,0]` et
`[0,0,0,0]` le 2026-08-04 écrivent maintenant 3 faits, 3 fois sur 3, dans les
deux langues, et c'est le PLANCHER qui écrit :

```
M1 « Poulet grillé, riz complet et brocolis à midi »
   base : whole_grain|slot=lunch ;; cruciferous_veg|slot=lunch ;; poultry|slot=lunch
   ecrit: FLOOR [{"food_group_ref":"whole_grain"},{"food_group_ref":"cruciferous_veg"},{"food_group_ref":"poultry"}]
M2 « Grilled salmon with quinoa and green beans for dinner »
   base : non_starchy_veg|slot=dinner ;; fatty_fish|slot=dinner ;; whole_grain|slot=dinner
```

**Le budget est UN (T4 / R9).** Cas X5, 3/3 : le tour 1 (« I ordered a pizza
tonight ») consomme la place avec une `photo_invitation` ; le tour 2
(« I had chicken », déclaration vague par ailleurs éligible) n'obtient **aucune**
question. Ledger du jour = **1** ligne :

```
photo_invitation | chat | - | 2026-08-08 | If you have a photo of it, send it over: …
```

### Audit du filtre `disqualified_reason is null` chez TOUS les lecteurs qui comptent

| Lecteur | Filtre | Verdict |
|---|---|---|
| `coach_synthesis_io.ts:260` | `.is("disqualified_reason", null)` | ✅ |
| `daily_recap_io.ts:89` | idem | ✅ |
| `week_review_io.ts:162` | idem | ✅ |
| `evaluate-adherence-v1/index.ts:163` | idem | ✅ |
| vue `public.coach_student_events` | `… AND disqualified_reason IS NULL` (relue en base) | ✅ |
| `photo_invitation_attach.ts:193` | filtre en mémoire | ✅ |
| `restriction_runtime.ts:316` | **aucun**, commenté « délibéré » | ✅ assumé — la ceinture TCA lit du texte, pas une comptabilité |
| `public.keel_student_interaction_count` (fonction SQL, facturation) | **aucun** | ⚠️ défendable (une rétractation reste une interaction) mais **non documenté** — voir §5 |

---

## 2. Écarts fiche / code, et ce qui a été fait

### 2.1 — CORRIGÉS (le code est aligné sur la fiche)

| # | Écart | Règle violée | Correctif |
|---|---|---|---|
| **É1** | Quatre mots-outils lus comme des aliments : `the` (article EN → thé), `mais` (conjonction FR → maïs), `pain` (douleur EN → pain), `bar` (barre EN → poisson), `mure` (adjectif → baie) | **R2** « seul ce que le message nomme EXPLICITEMENT devient un fait » · **§9** « un terme trop générique fabrique des faits » | `AMBIGUOUS_TERMS` : chaque terme ambigu porte une liste **fermée** de contextes (l'accent, ou un déterminant français), évaluée sur une seconde normalisation qui **garde les accents** |
| **É2** | `\bi (was\|we were) (eating\|having)\b` — « we were » était collé derrière un `i` obligatoire, donc **inatteignable** | **R4** (sous-déclarer est le côté non récupérable) | motif corrigé en `\b(i was\|we were) …` |
| **É3** | « I've had » → `i ve had` après normalisation : aucune porte | **R4** · **R6** | porte `\bi ve (had\|eaten\|…)\b` |
| **É4** | Les verbes de repas FR manquaient : « j'ai dîné d'une salade », « j'ai déjeuné », « j'ai goûté », « je viens de manger », « j'ai bu » → NULL | **§3** « verbe au passé » · **R6** | portes ajoutées |
| **É5** | « je n'ai rien mangé » et « ma fille a mangé des pâtes » : le plancher désarmait, **le dispatcher écrivait** (1 à 2 tours sur 3, dans les deux langues) | **§7** modes 1 et 2 | deux ceintures de veto (`isNoMealDeclared`, `SOMEONE_ELSE_ATE`) à la place exacte de celle de FF-009, avec la même condition de désarmement |
| **É6** | « à midi » n'était dans aucune des deux listes de créneaux : la déclaration passait la porte **grâce à lui** et s'écrivait **sans lui**, pendant que « for dinner » résolvait | **R6** / **T9** — la cicatrice `guard-tested-in-one-language-only` à l'intérieur d'une seule fonctionnalité | `slot_from_message.ts` : `à midi/ce midi/le midi/hier midi/ce soir/hier soir/tonight/this evening/lunchtime/midday`. « ce matin » et « this morning » restent **dehors**, symétriquement |

### 2.2 — ÉCARTS CONSIGNÉS, non corrigés (l'humain tranche)

| # | Écart | Pourquoi je ne l'ai pas corrigé |
|---|---|---|
| **É7** | **Aucun effet n'est exécuté sous `safety_band ≠ none`** : la déclaration est perdue. Trace : `band=medium`, `turn_frame.direct_effects` = 1 (le plancher l'a bien posé), `route_decision.direct_effects_to_run = []`, 3/3 | La consigne du bloc dit « déclaration écrite, AUCUNE question » ; **T7** dit « les planchers de sécurité priment sur tout », et le dépôt porte une **décision antérieure explicite** (`v5-arbitrations` : safety + effet = *explicit only*). C'est une contradiction fiche↔arbitrage, pas un oubli. **Amendement proposé, non appliqué** (§5) |
| **É8** | **La rétractation n'a aucun effet en base** quand aucun flow de précision n'est ouvert. §5 dit « une ligne décochée survit et porte `'food_not_eaten'` » : elle survit, mais `disqualified_reason` reste NULL et `food_group_ref` intact | Écrire une rétraction rétroactive dans une table append-only demande de résoudre *quelles* lignes (« de tout ça »), et le chemin voisin (`meal_precision_amend.ts`) porte une arbitrage documenté. C'est un lot, pas un correctif |
| **É9** | Le dispatcher **invente** des aliments que le message ne nomme pas : `other_added_fat` sur « une salade » (2/3), une ligne complète sur « le poulet c'est cher en ce moment » (1/3) | Famille **T-3**, prouvée non spécifique à cette fiche ; un chantier dédié est en attente d'arbitrage humain. Un veto général contredirait **R3** (« le plancher ne remplace pas le dispatcher ») et casserait la réponse à une question de précision (« with rice », sans passé ni créneau) |
| **É10** | `keel_student_interaction_count` compte `protocol_events` sans filtrer `disqualified_reason` | Compteur de **facturation** (activité), pas de faits. Défendable — mais §5 dit « tout lecteur qui compte filtre », donc soit la fonction filtre, soit la fiche exclut nommément la facturation |

---

## 3. Tableau des tests

Légende : **avant** = baseline mesurée avant tout correctif ; **après** = même
scénario après le commit `cde3b0cd` + `docker restart supabase_edge_runtime`.

### 3.1 — Run réel (3 répétitions chacun, élève neuf à chaque fois)

| Niv. | Cas | Scénario | Avant | Après | PREUVE (ligne en base) |
|---|---|---|---|---|---|
| easy | E1 | « j'ai mangé du poulet » | 3/3 fait écrit | **3/3** | `poultry \| slot=NULL \| src=chat \| evw=0.8 \| loc=fr-FR` |
| med. | M1 | « Poulet grillé, riz complet et brocolis à midi » → 3 faits | 3/3 faits, **0/3 créneau** | **3/3** | `whole_grain\|slot=lunch ;; cruciferous_veg\|slot=lunch ;; poultry\|slot=lunch` — `ecrit: FLOOR` |
| med. | M2 | « Grilled salmon with quinoa and green beans for dinner » | 3/3 | **3/3** | `non_starchy_veg\|slot=dinner ;; fatty_fish\|slot=dinner ;; whole_grain\|slot=dinner` |
| med. | M3 | déclaration vague → au plus 1 question, gabarit fermé, sans mot de quantité | 3/3 | **3/3** | ledger : `meal_precision_question \| text \| accompaniment \| And what did you have with it?` |
| med. | M4 | « j'ai pris des oeufs et du pain complet au petit déjeuner » | 3/3 | **3/3** | `eggs\|slot=breakfast ;; whole_grain\|slot=breakfast` |
| hard | H1 | « je n'ai rien mangé aujourd'hui » → RIEN | **2/3** 🔴 | **3/3** ✅ | base vide ; ledger vide |
| hard | H1b | « I didn't eat anything today » → RIEN | **2/3** 🔴 | **3/3** ✅ | base vide |
| hard | H2 | « ma fille a mangé des pâtes à midi » → RIEN | **1/3** 🔴 | **3/3** ✅ | base vide |
| hard | H2b | « my daughter had pasta for lunch » → RIEN | 3/3 | **3/3** | base vide |
| hard | H3 | « si je mange du riz ce soir » → RIEN | 3/3 | **3/3** | base vide |
| hard | H3b | « if I have rice tonight » → RIEN | 3/3 | **3/3** | base vide |
| hard | H4 | message > 600 caractères → RIEN | 3/3 | **3/3** | base vide |
| hard | H5 | l'élève IGNORE la question (2 tours de plus) → aucune relance | 3/3 | **3/3** | ledger : 1 seule ligne, jamais 2 |
| hard | **H6** | `safety_band` → déclaration écrite, aucune question | **0/3** 🔴 | **0/3** 🔴 | `band=medium`, `direct_effects_to_run=[]`, `turn_frame.direct_effects=1` — **É7** |
| extra | X1 | déclaration + rétractation (1 fait, question posée donc flow ouvert) | n/m | **2/3** 🔴 | le tour où un flow était ouvert amende ; l'autre laisse `poultry\|slot=lunch\|dq=NULL` **compter** — **É8** |
| extra | X1b | déclaration COMPLÈTE (3 aliments, donc aucune question, donc aucun flow) + « en fait non, je n'ai rien mangé de tout ça » | n/m | **0/3** 🔴 | 3 lignes `dq=NULL`, `food_group_ref` intacts, **aucun** `amendments` — **É8** |
| extra | X2 | déclaration NEUVE pendant qu'un flow de précision est ouvert | 3/3 | **3/3** | 1 ligne au tour 1, la 2ᵉ déclaration n'est pas absorbée en amendement ; 1 seule question |
| extra | X3 | deux déclarations vagues le même jour → UNE question | 3/3 | **3/3** | ledger = 1 ligne `meal_precision_question` |
| extra | X5 | invitation photo (FF-025) déjà partie → AUCUNE question | 3/3* | **3/3** | ledger = 1 ligne, `ask_kind=photo_invitation` (*faux rouge du 1er run : mon script comptait les 3 genres*) |
| adv | A1 | « le poulet c'est cher en ce moment » → RIEN | 3/3 | **2/3** 🔴 | 1 ligne écrite par le DISPATCHER — **É9** |
| adv | A1b | « chicken is expensive these days » → RIEN | 3/3 | **3/3** | base vide |
| adv | A2 | 22-23 h locales, aucun créneau nommé → `slot_key` NULL | 3/3 | **3/3** | `America/Chicago@23h` → `lean_protein \| slot=NULL` — **R5 tenue** |
| adv | A3 | « I had the chicken for lunch » → pas de thé | 3/3 (par chance : le dispatcher parlait) | **3/3** | `poultry` seul |
| adv | A3b | « I had the usual for lunch » (« the » = seul composant) | — | **3/3** | base vide — le plancher n'ouvre plus rien |
| adv | A4 | « hier soir j'ai mangé une salade mais bon » → pas de maïs | 3/3 | **2/3** 🔴 | `leafy_greens` ✅ mais `other_added_fat` ajouté par le dispatcher — **É9** |
| adv | A4b | « j'ai mangé au resto hier, c'était bon mais cher » | — | **3/3** | `NULL \| rel=off_plan` — aucun maïs |
| adv | A5 | « I had a protein bar for breakfast » → pas de poisson | 3/3 | **3/3** | aucun `white_fish` |
| adv | **A6** | « I had pain in my stomach after lunch » → RIEN | **0/3** 🔴 | **3/3** ✅ | avant : `refined_grain \| slot=lunch`, `ecrit: FLOOR [{"food_group_ref":"refined_grain"}]` |

### 3.2 — Tests unitaires ajoutés (env purgé)

```
deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/meal_declaration_floor_test.ts   → 42 passed
  supabase/functions/_shared/keel/slot_from_message_test.ts        → 11 passed
```

8 tests neufs sur le plancher (`the`/`mais`/`pain`/`bar`/`mure`, les portes de
passé, les deux ceintures de veto) et 3 sur les créneaux — chacun avec sa
**contre-épreuve** (le thé reste un thé, le maïs reste du maïs, un message mixte
garde le repas de l'élève).

Sweep de non-régression :
`_shared/keel/` + `sophia-brain/router/` + `log_protocol_event/` →
**1826 passed, 1 failed**.

**Le rouge est ANTÉRIEUR**, prouvé par `git stash push -- <mes 5 fichiers>` puis
re-run : `run_keel_conversation_loop_test.ts:251` —
`Recorded for 2026-07-27 (breakfast): Glycinate de magnésium` attendu
`Magnesium glycinate`. Étiquette de langue, sans rapport avec FF-017. **Non
réparé en passant.**

---

## 4. Hypothèses adversariales et leur sort

Chaque hypothèse a été **écrite avant** d'être jouée.

| # | Hypothèse | Sort |
|---|---|---|
| **A-1** | *« Un terme du lexique mord dans un mot plus long. »* | ❌ réfutée : les frontières `(^\|\s)…(\s\|$)` tiennent (« tartelette » ne donne pas « tarte ») |
| **A-2** | *« Un terme du lexique est un mot-outil de l'autre langue — l'accent a été jeté par la normalisation. »* | ✅ **CONFIRMÉE, 4 fois.** `the`/`mais`/`pain`/`bar`. Prouvée en run réel 3/3 sur `pain` : une ligne `refined_grain` écrite sur un message de douleur d'estomac. **Corrigée** (É1) |
| **A-3** | *« Le créneau est déduit de l'horloge. »* | ❌ réfutée : à 23 h locales sans créneau nommé, `slot_key = NULL`, 3/3. **R5 tenue.** En cherchant, j'ai trouvé le symétrique : un créneau **nommé** était perdu (É6) |
| **A-4** | *« La réponse confirme un repas qui n'est pas en base (accusé fantôme, T-1). »* | ⚠️ **Non retrouvée dans ce sens** : sur 84 tours, aucun cas où la base est vide et la réponse accuse. **Mais l'inverse existe et il est pire** — voir A-8 |
| **A-5** | *« Une phrase qui MENTIONNE un aliment sans déclarer un repas écrit un fait. »* | ✅ confirmée côté **dispatcher** (1/3 sur « le poulet c'est cher »), ❌ réfutée côté plancher (null, 3/3). Consignée É9 |
| **A-6** | *« Deux surfaces se partagent mal le budget et l'élève reçoit deux demandes. »* | ❌ réfutée : X5 3/3, ledger = 1 ligne/jour tous genres confondus. Assertion T4 ajoutée au harnais (`> 1 demande le même jour` = rouge) |
| **A-7** | *« Le plancher double l'effet du dispatcher. »* | ❌ réfutée : garde « même groupe deux fois » ajoutée au harnais, 0 doublon sur 84 tours |
| **A-8** | *« La rétractation est un accusé fantôme À L'ENVERS : la réponse dit que rien n'a été écrit alors que la base porte tout. »* | ✅ **CONFIRMÉE, 3/3.** Réponse : « *Got it — then that lunch report doesn't apply. **Nothing was written from it**, so we treat it as unreported for now.* » Base au même instant : 3 lignes `lean_protein/whole_grain/cruciferous_veg`, `slot=lunch`, `dq=NULL`. **É8** |
| **A-9** | *« Un désarme du plancher n'est pas un veto : le dispatcher écrit quand même. »* | ✅ **CONFIRMÉE** sur négation (1/3, deux langues) et tiers (2/3). **Corrigée** (É5) |
| **A-10** | *« Une porte de passé est écrite mais inatteignable. »* | ✅ **CONFIRMÉE** : `we were eating` ne pouvait pas matcher. **Corrigée** (É2) |
| **A-11** | *« La question de précision demande une quantité ou sort du gabarit. »* | ❌ réfutée : 100 % des questions sorties sont des constantes du pack (`And what did you have with it?`, `What was in it?`), 0 mot du lexique de quantité FR+EN |
| **A-12** | *« La question revient si l'élève l'ignore. »* | ❌ réfutée : H5, 3 tours, 1 seule ligne au ledger, 3/3 |
| **A-13** | *« La langue de la réponse est fausse pour un élève francophone. »* | ⚠️ **non testable ici** : `_shared/keel/locale.ts:28` `PILOT_FORCED_LOCALE = "en-US"` (**T-2**). Observé (élève `fr-FR` répondu en anglais) mais **sans valeur** tant que le drapeau est armé. Les tests bilingues **d'entrée** (lexique, désarmes, portes) restent valides et sont verts |

---

## 5. Ce qui reste ouvert

### 🔴 RED 1 — la déclaration est perdue sous `safety_band` (É7, H6, 3/3)

Trace : `turn_frame.direct_effects` porte bien l'effet du plancher, et
`route_decision.direct_effects_to_run` vaut `[]`. Le fait n'est jamais écrit.

Deux lectures, et c'est un **arbitrage humain**, pas un bug à réparer :
- *le code a raison* — T7 (« les planchers de sécurité priment sur tout ») et la
  décision `v5-arbitrations` (« safety + effet = explicit only »). Alors **la
  fiche doit le dire** : ajouter à §7 la ligne *« élève sous bande de sécurité →
  aucun effet durable, la déclaration est perdue »*, et retirer la consigne
  contraire du prompt de chantier.
- *la fiche a raison* — §7 dit « le modèle tombe après le plancher → **le fait
  est écrit**, on perd la formulation jamais la donnée », et un élève en détresse
  qui déclare son dîner est exactement celui dont on veut garder la trace. Alors
  il faut **une exception nommée** pour `log_protocol_event` d'origine plancher.

**Je n'ai pas tranché et je n'ai pas touché la lane de sécurité.**

### 🔴 RED 2 — la rétractation n'écrit rien (É8, X1 + X1b, 3/3 chacun)

Le chemin de rétractation d'un repas **déclaré en texte** passe uniquement par
`meal_precision_flow` (ouvert seulement si une question a été posée) puis
`meal_precision_amend.ts`, qui écrit `recognized.amendments` et remet
`food_group_ref` à `null` — **jamais** `disqualified_reason`.

Quand la déclaration est complète (donc pas de question, donc pas de flow), la
rétractation ne rencontre **aucun** mécanisme : les lignes restent entières et
comptent chez les cinq lecteurs, pendant que la réponse affirme le contraire.

**La mesure sépare exactement les deux cas** : X1 (déclaration vague → question
posée → flow ouvert) amende **2 fois sur 3** ; X1b (déclaration complète → aucune
question → aucun flow) amende **0 fois sur 3**. Autrement dit *plus la
déclaration est bonne, moins elle est rétractable* — l'élève le plus soigneux
est celui qu'on ne peut pas corriger.

Deux remèdes possibles, à trancher :
1. un **plancher de rétractation** déterministe symétrique du plancher de
   déclaration (le vocabulaire existe déjà : `isNoMealDeclared` reconnaît
   « je n'ai rien mangé de tout ça ») qui pose `disqualified_reason` sur les
   lignes `source='chat'` du jour ;
2. accepter le mécanisme actuel et **amender §5** pour dire que la rétractation
   d'un repas de chat passe par `food_group_ref = null` — mais alors §7 doit
   aussi dire que ça **ne marche que si une question a été posée**, ce qui est
   difficile à défendre.

### ⚠️ Résiduels consignés, non ouverts

- **É9 / T-3** — le dispatcher invente (`other_added_fat` sur « une salade »,
  2/3 ; un fait complet sur « le poulet c'est cher », 1/3). Chantier dédié en
  attente d'arbitrage humain, prouvé non spécifique à cette fiche.
- **É10** — `keel_student_interaction_count` ne filtre pas
  `disqualified_reason`.
- **T-2** — `PILOT_FORCED_LOCALE = "en-US"` : toute copie française runtime est
  morte au rendu, y compris les gabarits FR de la question de précision (qui
  existent, sont testés, et ne sortent jamais).
- **Homographes restants, mesurés et laissés** : `sole` (EN adjectif),
  `pêche` (« aller à la pêche »), `squash` (le sport), `mash`. Fréquence jugée
  négligeable devant le coût d'une garde de plus ; documentés dans l'en-tête de
  `AMBIGUOUS_TERMS`.
- **Le désarme `/\?/`** rend `null` toute déclaration contenant un « ? »
  (« j'ai mangé du poulet, c'était bien ? »). C'est le dessin de §3, pas un
  défaut — mais c'est une perte silencieuse à connaître.
- **« hier soir »** ouvre la porte et résout `dinner`, mais la ligne est écrite
  sur la date **du jour** : le créneau est juste, la date ne l'est pas. Défaut
  antérieur à ce lot, hors périmètre FF-017.

### Statut de la fiche

La condition qui la tenait en 🟠 (« la question d'approfondissement doit passer
au plafond 1 et au budget partagé ») est **satisfaite et prouvée en run réel**.
Les deux RED ci-dessus sont des **écarts §5/§7**, pas la dépendance annoncée.
Le passage en 🟢 est un appel humain.

---

## 6. Commandes pour l'humain

Aucune commande à risque n'a été nécessaire : aucune migration, aucun secret,
aucun déploiement. Le commit est local, **non poussé**.

```bash
# 1. Relire le lot
git show cde3b0cd --stat
git show cde3b0cd -- supabase/functions/_shared/keel/meal_declaration_floor.ts

# 2. Rejouer les tests unitaires (environnement PURGÉ, sinon 114 faux rouges)
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/meal_declaration_floor_test.ts \
  supabase/functions/_shared/keel/slot_from_message_test.ts

# 3. Rejouer un groupe en réel (adapter le groupe: easy|medium|hard|extra|adv)
./scripts/local_extend_kong_functions_timeout.sh
docker restart supabase_edge_runtime_Sophia_2
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<publishable> SUPABASE_SERVICE_ROLE_KEY=<secret> \
  deno run -A scratchpad/ff017_run.ts hard 3

# 4. Revoir la preuve des deux RED
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c \
  "select p.full_name, t.turn_frame->'safety'->>'risk_band' band,
          t.route_decision->>'direct_effects_to_run' dtr,
          jsonb_array_length(t.turn_frame->'direct_effects') nfx
     from conversation_turn_traces t join profiles p on p.id=t.user_id
    where p.full_name='ff017_H6' order by t.ts desc limit 3;"
```

**Déploiement** (jamais seul — à lancer par l'humain) :

```bash
supabase functions deploy sophia-brain
```

`meal_declaration_floor.ts` et `slot_from_message.ts` sont des modules
`_shared` : ils partent avec `sophia-brain`. Vérifier aussi les fonctions qui
importent `slot_from_message.ts` avant de déployer partiellement.
