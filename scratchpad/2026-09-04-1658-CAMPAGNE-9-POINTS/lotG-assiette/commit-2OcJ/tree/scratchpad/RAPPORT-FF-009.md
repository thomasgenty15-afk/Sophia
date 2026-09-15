# RAPPORT FF-009 — Le repas hors plan

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-08 · **Stack** locale,
vrai modèle (`gpt-5.4-mini`), vraie base, élèves provisionnés avec plan publié.

> **Verdict d'ensemble.** FF-009 était **déjà construite** (commit `7aa9d683`) et
> **jamais éprouvée en run réel** : la colonne `plan_relation` portait **0 ligne**
> en base au démarrage. Le run réel a trouvé **quatre défauts**, tous mesurés et
> reproductibles, tous corrigés et re-mesurés. Deux écarts restants sont
> consignés sans être corrigés — l'un parce que le code a raison contre la
> fiche, l'autre parce que le correctif tombe hors de mon périmètre.

---

## 1. État initial constaté — avec preuves

FF-009 n'était pas « à construire » comme le supposait le bloc de mission. Elle
était **livrée à 90 %** par une session antérieure et **non testée en réel**.

| Élément | Fichier / preuve | État constaté |
|---|---|---|
| Migration | `supabase/migrations/20260808050000_protocol_event_plan_relation.sql` | **appliquée** — `supabase_migrations.schema_migrations` porte `20260808050000` |
| Colonne | `protocol_events.plan_relation text NULL` | présente, `CHECK (null or in ('as_planned','off_plan'))`, index partiel `protocol_events_plan_relation_idx` |
| Vue coach | `coach_student_events` | expose `plan_relation`, filtre `disqualified_reason is null`, `reloptions = {security_invoker=off}` **conservé** |
| Plancher | `_shared/keel/meal_declaration_floor.ts:410` `detectOffPlanMarker` | bilingue, marqueurs auto-suffisants + marqueurs de lieu |
| Routeur | `sophia-brain/router/run.ts:3853-3960` | plancher + attachement de `plan_relation` à l'effet du dispatcher |
| Intake / exécuteur | `tools/always_on/log_protocol_event/{intake,executor,db,contract}.ts` | `plan_relation` parsée, écrite, **relue** (`readback_mismatch` sur divergence) |
| Restitution jour | `_shared/keel/daily_recap{,_io}.ts` | `offPlanCount` séparé, et le prompt **interdit explicitement la somme** |
| Restitution semaine | `_shared/keel/week_review{,_io}.ts` | `evidence.{asPlanned,offPlan,photo}` |
| Écrans | `frontend/src/keel/lib/weekInFood.ts:245-247`, `CoachStudentPage.tsx:505`, `StudentProgressPage.tsx:517` | trois comptes affichés séparément |
| Tests | `meal_declaration_floor_test.ts` | 14 tests FF-009, **tous verts** |

**La preuve que rien n'avait jamais tourné en réel :**

```
select count(*) filter (where plan_relation is null)   -> 307
     , count(*) filter (where plan_relation='off_plan')->   0
     , count(*) filter (where plan_relation='as_planned') -> 0
  from public.protocol_events;
```

307 lignes, zéro relation. Les tests unitaires étaient verts et la
fonctionnalité n'avait **jamais écrit une seule ligne**.

### `planned_deviations` — vérification demandée, pas un doublon

| | `planned_deviations` | `protocol_events.plan_relation` |
|---|---|---|
| Temps | **à l'avance** (`declare_deviation`, « jeudi je serai au resto ») | **au passé** (« hier j'ai commandé ») |
| Nature | un créneau **retiré du dénominateur** d'adhérence | un repas **mangé**, avec sa relation au plan |
| Attache | `plan_version_id NOT NULL` → chaîne de prescription **1:1** | l'élève, sans plan_version |
| Usage | `evaluator.ts:1144` (flex déclarée) | les trois comptes |

Ce sont deux axes orthogonaux : on peut annoncer un restaurant **et** ne pas y
aller, ou y aller sans l'avoir annoncé. Aucun arbitrage à demander.

---

## 2. Écarts fiche ↔ code, et ce qui a été fait

### 🔴 D1 — Le plancher s'effaçait devant une demande **refusée** *(corrigé)*

**Mesuré**, `« j'ai commandé une pizza margherita »`, 1 tour sur 10 :

```
frame   → log_protocol_event { food_group_ref: "pizza_margherita" }   ← slug inventé
intake  → reason_code: "unknown_token"  (R7 refuse le payload ENTIER)
base    → 0 ligne
réponse → « A margherita pizza is mostly fine as a meal… »
```

Le plancher s'était effacé (`mealAlreadyRequested`) et rien ne rattrapait le
refus. **R2 était morte** au moment exact où le message portait le hors-plan le
plus clairement. C'est l'accusé fantôme sur la donnée centrale du produit.

**Fait** : `mealFloorNetArms` + rejeu du payload déterministe
(`run.ts`, `mealDeclarationFloorEffect`). Le filet ne s'arme **que** sur les
quatre refus de FORME (`unknown_token`, `unknown_commitment`,
`too_many_components`, `empty_payload`) ; `future_intent`,
`components_already_logged`, l'idempotence et « une ligne déjà écrite » le
désarment. Commit `b0058ee8`, 14 tests.

**Preuve après** — run réel, log edge :
`status=needs_clarify+floor_net:logged committed=1 blocked=1`, 3 déclenchements
sur 18 tours, **0 tour perdu sur 30**.

### 🔴 D2 — « on a commandé pour les enfants » écrivait un fait *(corrigé)*

**Mesuré** 1 tour sur 3. §7 dit **rien**. Ligne écrite : `NULL | - | - | chat`,
réponse « You ordered food for the children. […] What was in it? ».
Le plancher désarmait bien — mais **désarmer le plancher n'est pas un veto sur
le dispatcher**.

**Fait** : ceinture `isMealForSomeoneElse`, même forme et même place que
`isTrackProgressFutureIntent`. Condition de désarmement : un « j'ai mangé » au
passé première personne la retire (message mixte). Commit `33acc546`, 3 tests.
**Après : 4/4 sur les deux formulations, FR et EN.**

### 🔴 D3 — une clause au futur effaçait un acte passé *(corrigé)*

**Mesuré** `« hier j'ai commandé et demain je cuisine »` → **0/3**. Le désarme
d'intention future était vérifié sur le message **entier**.

**Fait** : `DISARM_FUTURE_INTENT` sort de la liste absolue et porte sa condition
de retrait — un marqueur hors-plan **auto-suffisant**. Un marqueur de **lieu**
ne suffit pas, ce qui garde `« I'm going to order takeout tonight »` muet.
Commit `f055c2fa`, 3 tests. **Après : 3/3.**

### 🔴 D4 — la job story de la fiche ne marchait pas en français *(corrigé)*

**Mesuré**, 2/2 dans chaque langue :

```
« j'étais à un mariage samedi, j'ai mangé de tout »  → NULL
« I was at a wedding on Saturday, I ate everything » → off_plan
```

Le motif FR ne portait que la forme contractée (`au mariage`). C'est la
cicatrice `guard-tested-in-one-language-only` **à l'endroit exact où §2 donne
son exemple** : « quand j'étais à un mariage, je veux que ça compte comme un
repas de ma vie ». Même asymétrie *à l'intérieur* de l'anglais : `at a wedding`
mordait, `at the wedding` non. Et `chez` était une **liste de sept proches** là
où l'en-tête du fichier annonçait qu'une liste déborderait — `« j'étais chez ma
sœur hier soir, on a mangé une raclette »` → NULL.

**Fait** : `à un/une/l'/la` + `au`, `at (a|the|my|his|her|their)`, et `chez` par
**exclusion** (`chez moi|nous|soi`). Commits `f862528f`, `61d5d591`, 2 tests
+ contre-épreuves. **Après : 16/16 hors-plan étiquetés (avant 14/16).**

En relisant la garde à l'envers juste après l'avoir posée : `« chez soi »`
rendait `off_plan` sur un repas fait à la maison, sur les **deux** motifs.
Corrigé et épinglé (`61d5d591`).

---

## 3. Tableau des tests réels

Chaque cas sur un **élève neuf** (plan publié + engagements), rejoué 3 fois.
⚠️ Un élève réutilisé fait classer le 2ᵉ envoi identique comme *réponse* à la
question de précision du 1ᵉʳ (`meal_precision_amended … kind=answer`) → 0 ligne.
Le harnais provisionne donc un élève par (cas × répétition).

| Niveau | Scénario | Verdict | Preuve (ligne relue en base) |
|---|---|---|---|
| easy | « j'ai commandé une pizza ce soir » | 🟢 3/3 | `off_plan \| fried_food \| chat \| evw=0.8 \| dq=-` |
| easy | « j'ai commandé » (R2, marqueur seul) | 🟢 3/3 | `off_plan \| - \| chat` — 1 ligne, **aucun aliment** |
| medium | « on a mangé au resto hier » | 🟢 3/3 | `off_plan \| -` |
| medium | « I ordered takeout last night » | 🟢 3/3 rel. · 🟠 1/3 R3 | `off_plan \| other_added_fat` une fois → **§4** |
| medium | « j'ai commandé une pizza margherita » | 🟢 3/3 | `off_plan \| sauce_dressing` (avant fix : 1/3) |
| medium | « j'ai commandé du poulet et du riz » | 🟢 3/3 | `off_plan \| poultry` ;; `off_plan \| refined_grain` |
| medium | « j'ai mangé chez ma mère hier soir » | 🟢 3/3 | `off_plan \| -` — le désarme « tiers » ne mord pas |
| medium | « we ate out at a restaurant yesterday » | 🟢 3/3 | `off_plan \| -` |
| medium | « on s'est fait livrer » | 🟢 3/3 | `off_plan \| -` |
| medium | « I had a takeaway last night » | 🟢 3/3 | `off_plan \| -` |
| hard | « je vais commander ce soir » | 🟢 3/3 | 0 ligne |
| hard | « on a commandé pour les enfants » | 🟢 4/4 | 0 ligne (avant fix : 2/3) |
| hard | « I'm going to order takeout tonight » | 🟢 3/3 | 0 ligne |
| hard | « we ordered for the kids » | 🟢 4/4 | 0 ligne |
| hard | « j'ai mangé du poulet et du riz complet à midi » | 🟢 3/3 | `NULL \| poultry` ;; `NULL \| whole_grain` — **jamais** `off_plan` |
| hard | « hier soir j'ai mangé chez moi, du saumon… » | 🟢 3/3 | `NULL \| fatty_fish` ;; `NULL \| cruciferous_veg` |
| hard | « I had grilled salmon with quinoa at home… » | 🟢 3/3 | `NULL \| fatty_fish` ;; `NULL \| whole_grain` |
| hard | coach **sans** position `off_plan_meals` | 🟢 24/24 | 0 jugement, 0 taux sur 24 réponses (§4 A2/A3) |
| hard | « hier j'ai commandé et demain je cuisine » | 🟢 3/3 | `off_plan \| -` (avant fix : 0/3) |
| extra | X1 hors-plan **+** décoche le même soir | 🟢 | `off_plan/-/chat` **et** `as_planned/food_not_eaten/quick_tap` cohabitent |
| extra | X1b vue coach : mangé passe, décoché filtré | 🟢 | 1 ligne, `off_plan=true`, `quick_tap` décoché **absent** |
| extra | X2 doctrine `no_cheat_meal`, 4 provocations × 2 langues | 🟠 2/4 | voir §4 — carve-out **documenté** du matcher |
| extra | X3 semaine mixte (4 prévus / 2 hors plan / 1 photo / 1 décoché) | 🟢 | base `as_planned×4 ;; photo×1 ;; off_plan×2` ; écran coach `4/2/1`, total lu 7 |
| extra | X3c aucune somme n'est affichée | 🟢 | `4+2=6 ≠ meals=7` — la photo n'est ni l'un ni l'autre |
| extra | X4 deux hors-plan **consécutifs** | 🟢 3/3 | tour 2 ajoute bien +1 ligne |
| extra | X6 vue coach expose `plan_relation` | 🟢 | `information_schema.columns` |
| extra | X6b vue coach garde `disqualified_reason is null` | 🟢 | `pg_get_viewdef` le porte |
| extra | X6c `security_invoker` survit au `create or replace` | 🟢 | `reloptions = {security_invoker=off}` |

**Unitaires** : `meal_declaration_floor_test.ts` **34 verts** (14 → 34) ·
`meal_floor_net_test.ts` **11 verts** (neuf) ·
`meal_floor_net_chain_test.ts` **3 verts** (neuf) ·
`_shared/keel/` **1516 verts** · suite complète `supabase/functions/` **3457
verts, 1 rouge pré-existant** (voir §6).

**Volume réel** : ≈ 260 tours de chat, ~90 élèves neufs provisionnés, tous
nettoyés (vérifié : `ff009_%` → 0 profil, 0 coach, 0 événement ; la base est
revenue à ses 307 lignes de départ).

---

## 4. Hypothèses adversariales — écrites avant d'être testées

| # | Hypothèse | Sort |
|---|---|---|
| **A1** | *Le glissement d'étiquette* : des repas cuisinés requalifiés `off_plan` sans que le total bouge. | 🟢 **Réfutée.** 0/8 repas cuisinés requalifiés (FR+EN, 2 passes). Les 8 messages cuisinés rendent `NULL` sur 20 lignes. |
| **A1b** | Le chat écrit `as_planned` (violation R5). | 🟢 **Réfutée.** `select count(*) from protocol_events where source='chat' and plan_relation='as_planned'` → **0** sur toute la base. Le seul écrivain est `mealTicks.tickMeal`. |
| **A2** | *Le jugement qui fuit* : « écart », « craquage », « rattraper », « cheat », « guilt »… | 🟢 **Réfutée** hors doctrine : **0/24** réponses, 16 motifs FR+EN. ⚠️ Une occurrence isolée avant correctifs (`make up for it`, coach sans doctrine) — non reproduite en 24 tours. |
| **A3** | *La tentation du taux* : un « 71 % conforme » quelque part. | 🟢 **Réfutée** dans le code **et** dans les réponses. Aucune somme ni ratio des trois comptes n'existe (`grep` sur `asPlannedMeals\|offPlanMeals\|photoMeals` → uniquement 3 nombres séparés par `·`). 0/24 réponses portent `%`, `x sur y`, `adherence`, `score`, `streak`. Le prompt de `daily_recap.ts:308` **interdit la somme au modèle explicitement**. |
| **A4** | La vue coach expose `plan_relation` **mais perd** le filtre `disqualified_reason`. | 🟢 **Réfutée.** `pg_get_viewdef` porte le filtre, `reloptions` a gardé `security_invoker=off`, et X1b le prouve **par le geste** (décoche invisible au coach). |
| **A5** | Le hors-plan et la décoche se confondent le même soir. | 🟢 **Réfutée** (X1) : les deux colonnes cohabitent, `off_plan` reste visible au coach, `food_not_eaten` disparaît. |
| **A6** | Deux hors-plan consécutifs : la lane de précision avale le second. | 🟢 **Réfutée** (X4, 3/3). Le cas où ça arrive est un message **rigoureusement identique** rejoué — artefact de harnais, pas de produit. Consigné. |
| **A7** | Le verrou de doctrine ne mord pas sur les six formes. | 🟠 **Partiellement confirmée — le code a raison.** Voir ci-dessous. |
| **A8** | Le plancher s'efface devant un dispatcher qui échoue. | 🔴 **Confirmée** → D1, corrigée. |
| **A9** | Une garde ne mord que dans une langue. | 🔴 **Confirmée** → D4, corrigée. |
| **A10** | Le modèle invente des groupes alimentaires sur un plat composé. | 🔴 **Confirmée, non corrigée** — voir §5. |

### A7 en détail — le verrou mord, et son carve-out est délibéré

Épreuve directe de `findForbiddenMatches` avec les six formes de
`no_cheat_meal` :

```
MORD  "That was your cheat meal, so tomorrow we get back on track."
MORD  "Enjoy your treat meal on Saturday."
MORD  "You can make up for it tomorrow."
MORD  "There is nothing to make up for it."
PASSE "There's no cheat meal here. You had a meal off plan."
```

Le verrou **est armé et mord**. Il laisse passer la mention **niée** parce que
`no` est dans `NEGATION_WORD` — un carve-out documenté, testé, et posé après un
défaut mesuré : la lecture absolue rejetait *« your coach doesn't do six small
meals »*, remplaçait le message entier par le `instead`, et « un validateur
qu'on éteint ne protège personne ».

**→ Écart fiche/code, et c'est la FICHE qui doit bouger.** §7 (« le verrou la
réécrit, **comme aujourd'hui** — l'ajout ne desserre rien ») est **satisfait**.
§8 est plus strict que le module :

> **Amendement proposé à §8 — NON APPLIQUÉ, à trancher par l'humain.**
> Remplacer
> `Alors sa réponse ne contient aucune des formes interdites`
> par
> `Alors sa réponse ne contient aucune des formes interdites AFFIRMÉE`
> `Et une mention NIÉE (« there's no cheat meal here ») reste autorisée — c'est`
> `le carve-out documenté de forbidden_matcher.ts, et le supprimer ferait`
> `rejeter « your coach doesn't do six small meals »`.

L'alternative — passer `allowNegatedMentions: false` sur la lane de doctrine —
ressusciterait un défaut déjà payé. Je ne l'ai pas fait.

---

## 5. Ce qui reste ouvert

### 🟠 O1 — Le modèle décompose les plats composés (hors périmètre FF-009)

`« j'ai commandé une pizza margherita »` produit, d'un tour à l'autre :
`sauce_dressing` · `other_fruit` · `sugar_sweets` · `fried_food` ·
`refined_grain + dairy_cheese` · `other_added_fat` · et une fois le slug inventé
`pizza_margherita`. `« I ordered takeout last night »` — qui ne nomme **aucun**
aliment — a produit `other_added_fat`. §3 dit « ❌ aucune inférence d'aliments ».

**Ce n'est pas un défaut FF-009.** Contre-épreuve mesurée : le même message
**sans** marqueur hors-plan se fait décomposer à l'identique.

```
« j'ai mangé des lasagnes hier soir »    → NULL|-  · NULL|-  · 0 ligne · NULL|refined_grain+dairy_cheese+lean_protein
« j'ai commandé des lasagnes hier soir » → off_plan|refined_grain+dairy_cheese+red_meat · off_plan|- · off_plan|other_fruit · off_plan|-
```

Le plancher, lui, respecte R3 : il ne décompose jamais (`R7 — un plat hors de la
table fermée ne produit AUCUN fait`, test existant). Corriger relève de FF-017 /
FF-018 et coûterait cher des deux côtés : un garde-fou déterministe
(« pas de `food_group_ref` si le lexique n'en trouve aucun ») supprimerait aussi
les reconnaissances **légitimes** que le lexique fermé n'a pas (`edamame`…), ce
qui contredit l'asymétrie que le plancher documente en tête de fichier
(sur-déclarer est rattrapable, sous-déclarer est silencieux). **Chantier à part.**

### 🟠 O2 — Message mixte passé + futur quand la ceinture partagée mord aussi

`« j'ai craqué hier soir, on a commandé, je vais compenser demain »` → **0/3**.
D3 a corrigé le plancher, mais `isTrackProgressFutureIntent` rend `true` sur ce
message et **la lane bloque l'effet avant l'écriture**. Le correctif est une
condition de désarmement dans `track_progress_plan_item/intake.ts`, partagée
avec FF-017 et le suivi de plan — **hors de mon périmètre**, non tenté.

### 🟠 O3 — Le plancher TCA préempte un hors-plan réel

`« we ate out yesterday — I'll burn it off at the gym, right? »` → réponse de
soutien (« progress figures paused… I can connect you with a human coach »),
**0 ligne**, 2/2. T7 dit que les planchers de sécurité priment sur tout, donc
c'est le comportement voulu ; mais le repas hors plan disparaît avec.
**Observation, pas correctif** : toucher au plancher TCA est hors sujet et
dangereux.

### 🟠 O4 — La langue de la réponse ignore la langue de l'élève

Élèves `locale='fr-FR'` avec `voice.language='fr'` → réponses **en anglais**,
systématiquement. Cicatrice connue `reply-language-ignores-voice-language`,
indépendante de FF-009. Consignée, non traitée.

### 🟠 O5 — T-1, la lane de réponse ignore ce que le plancher a écrit

Observé sur mon périmètre (ex. « Noted: you went to a restaurant tonight »
quand la ligne existe, mais aussi des accusés sur des tours à 0 ligne avant D1).
Correctif dans `companion.ts`, **fichier réservé**. Consigné comme instance de
T-1, non débogué.

### 🟠 O6 — Message identique rejoué : le second tour est lu comme une réponse

Deux envois **rigoureusement identiques** au même élève : le 2ᵉ est classé
`meal_precision_amended … kind=answer`, `components_already_logged`, **0 ligne**.
Artefact de harnais avant tout ; le cas produit (deux hors-plan **différents**)
est vert 3/3 (X4). Le filet ne s'arme pas dessus **par construction** —
`components_already_logged` est un refus juste.

---

## 6. Rouge pré-existant — prouvé antérieur, non réparé

`supabase/functions/sophia-brain/router/run_keel_conversation_loop_test.ts:251`
— *« (a) a reported fact writes ONE protocol_events row… »* :

```
- Recorded for 2026-07-27 (breakfast): Glycinate de magnésium.
+ Recorded for 2026-07-27 (breakfast): Magnesium glycinate.
```

**Preuve d'antériorité** : rejoué dans un worktree jeté sur `131a7370` (le
commit **précédant tout mon travail**) → `FAILED | 10 passed | 1 failed`.
C'est un libellé i18n, sans rapport avec `plan_relation`. Non touché.

**Note d'environnement** : l'`agent-gate` a échoué une fois sur le typecheck de
`frontend/src/keel/components/MealBuilder.tsx`, fichier en cours d'édition par
une autre session sur la même branche. Attendu et re-tenté ; aucun de mes cinq
commits ne touche un fichier frontend.

---

## 7. Commits (aucun push)

| SHA | Sujet |
|---|---|
| `b0058ee8` | le plancher de repas ne s'efface plus devant une demande qui est refusée |
| `33acc546` | « on a commandé pour les enfants » cesse d'écrire que l'élève a mangé |
| `f055c2fa` | « hier j'ai commandé et demain je cuisine » cesse de perdre la soirée d'hier |
| `f862528f` | « j'étais à un mariage » compte en français comme il comptait en anglais |
| `61d5d591` | « chez soi » cesse d'être un repas hors plan |

Fichiers touchés (aucun fichier réservé) :
`supabase/functions/_shared/keel/meal_declaration_floor.ts` ·
`…/meal_declaration_floor_test.ts` ·
`supabase/functions/sophia-brain/router/run.ts` ·
`…/router/meal_floor_net_test.ts` (neuf) ·
`…/router/meal_floor_net_chain_test.ts` (neuf).

---

## 8. Commandes pour l'humain

**Aucune migration à pousser** : `20260808050000` était déjà appliquée en local
et n'a pas été modifiée. Les cinq commits sont **du code edge uniquement**.

```bash
# 1. Rejouer les tests unitaires (environnement PURGÉ, sinon 114 faux rouges)
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/meal_declaration_floor_test.ts \
  supabase/functions/sophia-brain/router/meal_floor_net_test.ts \
  supabase/functions/sophia-brain/router/meal_floor_net_chain_test.ts

# 2. Rejouer le run réel (stack locale démarrée + Kong allongé)
./scripts/local_extend_kong_functions_timeout.sh
docker restart supabase_edge_runtime_Sophia_2   # OBLIGATOIRE: le runtime sert des _shared périmés
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=$(npx supabase status -o env | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p') \
SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p') \
  deno run -A scratchpad/ff009_run.ts all 3
# puis: scratchpad/ff009_extra.ts all   et   scratchpad/ff009_adv.ts 2

# 3. Déploiement — À LANCER PAR TOI, je ne peux pas
supabase functions deploy sophia-brain
```

**Trois décisions à trancher :**

1. **§8 de la fiche** — appliquer ou refuser l'amendement du §4 (mention niée
   autorisée). Tant qu'il n'est pas tranché, FF-009 §8 et
   `forbidden_matcher.ts` se contredisent.
2. **O1** — ouvrir (ou non) un chantier « le modèle ne décompose pas un plat
   composé », qui concerne FF-017 et FF-018 autant que FF-009.
3. **O2** — autoriser (ou non) une condition de désarmement dans
   `track_progress_plan_item/intake.ts`, fichier partagé.
