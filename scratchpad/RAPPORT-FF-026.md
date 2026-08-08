# RAPPORT — FF-026 · La préférence captée

Branche `ff-001-quotidien-du-coach`. Base locale partagée, fixtures `ff026_*`
créées et nettoyées à chaque run.

---

## 1. État initial constaté — avec preuves

### 1.1 Ce qui existait

Le pont mémoire → générateurs existe et il est bon. Sa logique pure est dans
`supabase/functions/_shared/keel/food_preference_promotion.ts` (983 lignes,
sans I/O) et son branchement serveur dans
`supabase/functions/_shared/keel/food_preference_promotion_io.ts`.

| Maillon | Où | État initial |
|---|---|---|
| capture | `trigger-memorizer-daily`, cron `0 0 * * *` (`supabase/migrations/20260615133000_recreate_active_pg_cron_jobs.sql:151-155`) | **cassé pour les phrases courtes** — voir §1.2 |
| item | `memory_items`, INSERT unique en `_shared/memory/memorizer/persist.ts:284` | OK |
| proposition | `proposeFoodPreferences` (`food_preference_promotion.ts:237`) | OK |
| garde « Keep » | `frontend/src/keel/components/FoodPreferencesCard.tsx:252` | OK mais **exige un clic** — voir §1.3 |
| écriture | `student_goals.practical_constraints.food_preferences` | OK |
| réconciliation | `reconcileFoodPreferencesFor` (`food_preference_promotion_io.ts:53`) | OK sur 2 des 3 générateurs — voir §2.3 |
| consommation | `generate-week-plan-v1:337`, `generate-meal-v1:498`, `generate-household-meal-v1:436` | OK |

Deux runs réels antérieurs existaient déjà :
`docs/nutrition-pivot/qa-web/N1_food_memory_over_time.ts` (trois semaines
simulées) et `W2_memory_to_plan_real_run.ts` (mémoire → texte du prompt).
**Aucun des deux ne partait d'une phrase courte**, et c'est ce qui a caché le
défaut principal : les phrases de N1 font 16 à 22 mots.

### 1.2 LE DÉFAUT PRINCIPAL — la capture mourait au premier gué

`supabase/functions/_shared/memory/memorizer/batch_selector.ts` — `classifyAntiNoise`
(le test `wordCount < 15`, aujourd'hui ligne 151, ligne 100 **avant** mon
correctif) écarte tout message de **moins de 15 mots** qui ne porte
ni signal important ni entité connue — `smart_pre_filter`. Le message n'atteint
alors **jamais** le LLM d'extraction : il est marqué `skipped_noise` dans
`memory_message_processing` et le tour est perdu pour la mémoire.

Les deux échappatoires existantes ne reconnaissaient aucune préférence
alimentaire :

- `durableShortStatement` (`batch_selector.ts:78`) porte `je prefere` mais
  **aucun verbe de rejet** (`j'aime pas`, `je déteste`, `j'ai pas aimé`) ;
- elle est **intégralement française** — `signal_detection.ts` l'est aussi, sur
  ses dix détecteurs. Un anglophone n'avait littéralement aucune porte.

Mesure du 2026-08-08 sur les phrases **exactes de la fiche** (sonde
déterministe, `classifyAntiNoise` est une fonction pure) :

```
SKIP ❌ |   10 | smart_pre_filter | fiche §1 : « t'as mis du riz, mais j'aime pas ça »
SKIP ❌ |    5 | smart_pre_filter | fiche §8 : « I don't like mushrooms »
SKIP ❌ |    6 | smart_pre_filter | « j'ai pas aimé le curry »
SKIP ❌ |    5 | smart_pre_filter | « actually I like rice now »
SKIP ❌ |    4 | smart_pre_filter | « j'adore le risotto »
SKIP ❌ |    5 | smart_pre_filter | « mon fils déteste les épinards »
SKIP ❌ |    4 | smart_pre_filter | « my son hates spinach »
...
10/15 phrases JAMAIS vues par le LLM d'extraction.
```

**Les deux seules phrases de la fiche qui passaient le faisaient par accident
de vocabulaire** : « j'ai pas aimé le curry **d'hier** » par le signal
`dated_reference` (le mot « hier »), « **en fait** j'aime bien le riz » par le
signal `correction`. Retirez le mot de date, la capture meurt.

C'est le zéro de la boucle T6, à son premier maillon : pas d'item, donc pas de
proposition, donc rien dans le prompt du générateur — **pour la phrase même qui
motive la fonctionnalité**.

### 1.3 LE SECOND DÉFAUT — la boucle n'est pas fermée sans un clic

Vérifié par audit d'appelants : **aucun chemin serveur n'écrit
`practical_constraints.food_preferences`**. `applyFoodPreferenceDecision`
(`food_preference_promotion.ts:456`) n'a **aucun appelant runtime** dans
`supabase/functions/` — uniquement des tests et deux scripts QA. Le seul
écrivain de production est le front :
`frontend/src/keel/api/foodPreferences.ts:356` → `student_goals` en direct.

La seule écriture serveur est **soustractive** :
`food_preference_promotion_io.ts:149` ne fait que retirer ce que la mémoire a
démenti.

Conséquence, et elle n'est pas dans la fiche : la préférence n'atteint le plan
que si l'élève **ouvre `/app/plan`, ouvre la modale « About you », et clique
Keep** (`StudentWeekPlanPage.tsx:1598` — seule surface de rendu). S'il ne le
fait pas, l'item reste `candidate` et le cron d'entretien l'**archive à J+14**
(`_shared/memory/memorizer/promotion.ts:42`, `age >= 14 && source_count < 2`) :
la préférence meurt sans jamais avoir été proposable.

La fiche mentionne « Keep obligatoire » en §1 et §4, mais ses critères §8 n'en
parlent pas et décrivent une boucle automatique. Voir §3 (amendements
proposés).

---

## CE QUE FF-028 PEUT LIRE

> Section destinée à être recopiée telle quelle dans le prompt de FF-028.

### Le chargeur — il n'y en a qu'un, et il n'est pas branché sur la conversation

```ts
// supabase/functions/_shared/keel/food_preference_promotion.ts:861
export function foodPreferencesForPrompt(
  constraints: Record<string, unknown> | null | undefined,
): string[]
```

- **Entrée** : le jsonb `student_goals.practical_constraints` de l'élève, tel
  quel. Ce n'est pas une fonction d'I/O — c'est à l'appelant de faire le
  `select`.
- **Sortie** : des chaînes déjà formatées `"YYYY-MM-DD — texte"`, **la plus
  récente d'abord**, plafonnées à **20** (`MAX_PROMPT_PREFERENCES`, ligne 859).
  Les lignes sans date passent en dernier, sans préfixe.

À utiliser **avant** lui, sur tout chemin qui compose :

```ts
// supabase/functions/_shared/keel/food_preference_promotion_io.ts:53
export async function reconcileFoodPreferencesFor(args: {
  admin: { from: (table: string) => any };
  userId: string;
  constraints: Record<string, unknown> | null | undefined;
  source: string;                       // le nom de ta fonction, pour la trace
}): Promise<Record<string, unknown>>     // les contraintes À UTILISER
```

Il retire ce que la mémoire a démenti (`superseded` / `invalidated` /
`archived` / masqué) **et persiste la correction**. Il n'échoue jamais
bruyamment : en cas d'erreur il rend les contraintes reçues et journalise
`reconcile_failed`.

Pour servir un jsonb entier à un modèle, passer par
`constraintsForPrompt(pc)` (ligne 810) : il **retire**
`food_preferences_dismissed` (des UUID de comptabilité) et
`food_preferences_origin` (une table texte→UUID). Les servir au modèle est une
fuite de budget et de sens.

### Ce qui est disponible

- Les préférences que l'élève a **explicitement gardées** dans
  `student_goals.practical_constraints.food_preferences`.
- Les autres clés du même jsonb, lues nommément par `generate-meal-v1` :
  `eating_rhythm`, `away_days`, et les quatre de `readCookingCapacity`.

### Ce qui N'EST PAS disponible — à lire avant de concevoir

1. **La conversation ne voit RIEN de tout ça.** Vérifié par grep sur tout
   `supabase/functions/` : les seuls lecteurs de `practical_constraints` sont
   `generate-meal-v1`, `generate-week-plan-v1`, `generate-household-meal-v1` et
   l'export RGPD. **`sophia-brain` ne le lit nulle part.** Une recommandation
   quotidienne délivrée par la lane de conversation n'a, aujourd'hui, **aucun
   accès aux préférences alimentaires** — il faudra la brancher, et le pont
   `food_preferences` est le seul canal autorisé (R2).
2. **La préférence du jour même n'existe pas.** Le memorizer est un cron
   nocturne (`0 0 * * *` UTC). Rien de ce qui est dit aujourd'hui n'est
   lisible aujourd'hui.
3. **Et la nuit ne suffit pas non plus.** L'item écrit par le memorizer est
   `candidate` ou `active`, mais dans les deux cas il n'est qu'une
   **proposition**. Aucun chemin serveur ne l'écrit dans
   `practical_constraints` : `applyFoodPreferenceDecision` n'a **aucun appelant
   runtime** côté serveur. Il faut que l'élève ouvre `/app/plan` → modale
   « About you » → clique **Keep**.
4. **Et s'il ne clique pas, la préférence meurt.** Un `candidate` non réaffirmé
   est **archivé à J+14** (`_shared/memory/memorizer/promotion.ts:42`).

**La latence utile n'est donc pas « une nuit » : c'est « une nuit + une visite
de l'écran de plan », et elle est non bornée.** Une recommandation qui suppose
« ce que l'élève a dit hier » sera fausse pour tout élève qui n'ouvre pas la
carte.

### Si FF-028 veut lire la mémoire brute

Ne pas le faire sans arbitrage : **R2 — un seul pont**. `memory_items` est un
magasin probabiliste (`status`, `confidence`, ranking) et l'architecture
s'interdit de le brancher directement sur la composition. Le filtre de
promotion qui fait autorité est `proposeFoodPreferences`
(`food_preference_promotion.ts:237`) : `kind ∈ {fact, statement}`,
`status ∈ {active, candidate}`, `sensitivity_level === "normal"`,
`confidence ≥ 0.70`, et au moins une clé parmi `PROMOTABLE_DOMAIN_KEYS`
(`sante.alimentation`, `travail.charge`, `habitudes.environnement`,
`habitudes.planification`, `sante.activite_physique`).

---

## 2. Écarts fiche/code, et ce qui a été fait

### 2.1 Ce que j'ai corrigé (code aligné sur la fiche)

**E1 — la capture des phrases courtes.**
`supabase/functions/_shared/memory/memorizer/batch_selector.ts` — ajout de
`durableFoodStatement`, une échappatoire **bilingue** au `smart_pre_filter`,
placée à côté de `durableShortStatement` dont elle copie exactement le motif.
Écrite après `normalizeText` (accents retirés, apostrophe devenue espace).
Résultat mesuré : **10 phrases bloquées → 2**, et les 2 restantes sont les
allergies, exclues **exprès** (voir E2). Deux tests de régression ajoutés dans
`batch_selector_test.ts`, dont un qui tient la décision d'exclure les
allergies.

Permissive par choix, et le choix est motivé dans le code : ce filtre arbitre
un **coût**, pas une vérité — cinq filtres le suivent (extraction, `validate`
à 0,55, `MIN_CONFIDENCE` à 0,70, ligne médicale, et l'élève qui garde la
ligne). Une porte trop large coûte des tokens et se rattrape ; une porte trop
étroite perd la donnée en silence.

**E2 — l'allergie reste sur le chemin dur (R1).** `allergique` / `allergic`
sont **absents** de la nouvelle porte, délibérément et avec un test qui le
tient. Les faire entrer dans la mémoire souple nocturne serait la confusion
des deux couches que R1 interdit.

**E3 — le troisième chemin de génération ne réconciliait pas (R3).**
`supabase/functions/generate-household-meal-v1/index.ts` n'importait que le
module **pur** (`food_preference_promotion.ts`), jamais son module d'I/O. Il
servait donc `practical_constraints` **tel quel**. `generate-meal-v1` porte
pourtant la raison écrite : « Une garde qui ne couvre qu'un des deux chemins
d'un même jsonb est une garde qu'on croit posée. » Il y a trois chemins ; le
troisième était à découvert. Raccord posé, `deno check` vert.

### 2.2 Écarts où le CODE a raison — amendements PROPOSÉS, non appliqués

> L'humain tranche. Rien de ce qui suit n'a été écrit dans la fiche.

**A1 — §4 et §8 se contredisent sur le « Keep ».** Le circuit §4 mentionne
« LE PONT (unique, 5 clés, **« Keep » obligatoire**) », mais les critères §8
décrivent une boucle sans clic (« Quand le memorizer est passé et qu'une
nouvelle semaine est composée / Alors le plan ne contient pas de riz »). Le
code fait ce que dit §4. **Proposition** : réécrire les scénarios §8 pour
qu'ils portent le geste de l'élève, et ajouter en §5 la ligne manquante du
cycle de vie — **`candidate` non confirmé → archivé à J+14**
(`_shared/memory/memorizer/promotion.ts:42`), c'est-à-dire *la préférence meurt
si l'élève n'ouvre jamais `/app/plan`*.

**A2 — §7 sous-estime la fenêtre.** La fiche dit « Génération le jour même de
la capture → la préférence n'y est pas encore ». C'est vrai mais incomplet :
la latence réelle n'est pas « une nuit », c'est **« une nuit + une visite de
l'écran de plan »**, et elle est **non bornée**. **Proposition** : remplacer
la ligne §7 et la question ouverte §11 par la vraie chaîne, parce que la
question « write-through ou pas ? » ne se pose pas de la même façon selon
qu'on attend 8 heures ou indéfiniment.

**A3 — le README place la préférence parmi les planchers déterministes.** Le
circuit de `docs/fonctionnalites/conversation/README.md` liste
« préférence (8) » dans la boîte **LES PLANCHERS DÉTERMINISTES ← avant le
modèle, jamais après**. C'est faux dans le code : la capture est **entièrement
LLM et nocturne**, il n'existe aucun outil `always_on` de préférence
(les cinq sont `declare_deviation`, `declare_safety_constraint`,
`log_protocol_event`, `one_shot_reminder`, `track_progress_plan_item`).
Et la fiche FF-026 §9 **refuse explicitement** le write-through déterministe.
**Proposition** : retirer « préférence (8) » de la boîte des planchers du
README — c'est le README qui a tort, pas FF-026.

**A4 — R6 est tenue, mais par personne.** « Capture silencieuse, jamais un
formulaire » est respectée en pratique (aucune demande de confirmation
observée), mais **aucune garde ne la tient** : c'est une propriété émergente
du prompt. **Proposition** : la noter comme non gardée, ou lui donner une
ceinture.

### 2.3 Ce que je n'ai PAS fait, et pourquoi

- **`sophia-brain` ne lit aucune préférence** — la lane de conversation ne voit
  ni `practical_constraints` ni `food_preferences` (grep sur tout
  `supabase/functions/`). C'est ce qui produit **T-1** ici (§4, H1) : la
  réponse promet « I'll leave them out » sans pouvoir savoir si quoi que ce
  soit a été écrit. Le correctif est dans `agents/companion.ts`, **fichier
  réservé à l'autre agent** — dépendance bloquée, consignée, non ouverte.
- **Le write-through immédiat** (rabbit hole §9) : non ouvert. C'est le bon
  arbitrage tant que la fenêtre n'est pas mesurée en usage réel, et ma mesure
  dit qu'il faudrait d'abord régler A1 (le clic), pas la nuit.

### 2.4 DÉPENDANCE BLOQUÉE — la cause probable du rouge R5

`supabase/functions/_shared/keel/meal_generation.ts:1204-1209` sert les
préférences au modèle sous cet en-tête, et c'est **le seul** :

```ts
"what they have told you about their eating, in their own words:",
...args.foodPreferences.map((p) => `- ${p}`),
```

C'est un **témoignage**, pas une contrainte. Rien dans le prompt ne dit au
modèle qu'un « does not like rice » doit se traduire par « n'en mets pas ».
Comparé au double verrou des interdits de doctrine et à la table dédiée des
contraintes médicales, la préférence est la seule des trois servie sans verbe
d'obligation — et c'est exactement là que le run réel rate une fois sur trois
(§4, R5).

**Je n'ai pas fait le correctif.** Ce fichier porte des modifications **non
commitées de l'autre agent** (`git status` : ` M meal_generation.ts`, hunks sur
la logique rythme/occasion et la queue du prompt). Le stage est par fichier :
committer ma ligne emporterait leur travail en cours. Le correctif proposé,
une ligne, à appliquer par qui possède le fichier :

```ts
"what they have told you about their eating, in their own words. " +
  "Treat a stated dislike as an exclusion: do not put that food in the plan.",
```

Puis re-jouer `deno run -A docs/nutrition-pivot/qa-web/FF026_preference_capture.ts C 3`
et vérifier que R5 passe 3/3.

---

## 3. Hypothèses adversariales — **écrites avant leurs tests**

| # | Hypothèse | Sort |
|---|---|---|
| **H1** | L'accusé de réception promet un effet durable que rien n'a écrit (instance de **T-1**) : « I'll leave them out » alors que le memorizer passe la nuit ET que le pont exige un clic. | 🔴 **CONFIRMÉE** — §4.3. Instance de T-1, non corrigeable ici (`companion.ts` réservé). |
| **H2** | La préférence d'un **tiers** (« mon fils déteste les épinards ») devient une contrainte de composition de **l'élève**. | ⚪ **INFIRMÉE en fait, non garantie en droit** — 3/3 bloquée par `sensitivity=sensitive`, mais c'est un effet de bord LLM (§4.0). |
| **H3** | Le texte gardé est le `normalized_summary` du memorizer, **préfixé du prénom à la 3e personne** (« Alix dislikes rice. »). Servi au générateur, il peut ressortir tel quel dans le plan — une voix non humaine, famille de la cicatrice `defense_card`. | ✅ **INFIRMÉE** — 9/9 passages : ni la préférence mot pour mot ni le prénom ne ressortent dans le plan. |
| **H4** | **Sur-capture** : mon élargissement admet `i like` / `adore`, très bavards. Du bavardage court devient-il un souvenir promouvable ? | ✅ **INFIRMÉE** — 2/2 : 0 souvenir, 0 proposition sur 4 tours de bavardage (§4.1ter). |
| **H5** | La rétractation n'écrit rien et la réponse affirme le contraire (famille **T-8**). | 🔴 **CONFIRMÉE, mais autrement** — la rétractation ÉCRIT (contrairement à T-8) ; c'est le LIEN qui manque (§4.2). |
| **H6** | `generate-household-meal-v1` ne réconcilie pas : une préférence démentie y reste servie indéfiniment. | 🔴 **CONFIRMÉE et corrigée** — §2.1 E3. |
| **H7** | La fenêtre « invisible le jour même » de la fiche est en réalité **non bornée** : nuit + visite de l'écran + péremption à J+14. | 🔴 **CONFIRMÉE** — nuit + clic + péremption J+14 ; amendement A2 proposé. |
| **H8** | Le plafond de 20 ne vaut que pour le **prompt** ; la liste `kept` en base n'a aucun plafond et croît sans fin. | 🔴 **CONFIRMÉE, non corrigée** (faible gravité) — voir ci-dessous. |
| **H9** | Le zéro de **R5** : l'item est écrit, gardé, servi — et le générateur remet quand même l'aliment. | 🔴 **CONFIRMÉE** — R5 rate en run réel ; cause localisée §2.4, correctif bloqué. |
| **H10** | Le formulaire déguisé (**R6**) : la réponse demande confirmation avant d'enregistrer. | ✅ **INFIRMÉE** — R6 tenue, aucune formule de confirmation sur l'ensemble des tours (§4.0). |

### Les deux tranchées par lecture de code (pas de run nécessaire)

**H6 — CONFIRMÉE, et corrigée.** `generate-household-meal-v1/index.ts:20`
n'importait que le module pur. Aucun appel à `reconcileFoodPreferencesFor`.
Corrigé (§2.1 E3).

**H8 — CONFIRMÉE, non corrigée (faible gravité).**
`food_preference_promotion.ts:497` — `kept.push(text)` sans plafond.
`capDismissed` (ligne 538) ne borne que `dismissed` (200) et
`MAX_PROMPT_PREFERENCES` (ligne 859) ne borne que **la vue du prompt** (20).
La liste en base croît donc sans fin. Conséquence réelle mais douce : le
prompt est protégé (trié par récence, coupé à 20), mais la carte, l'export
RGPD et le jsonb enflent, et au-delà de 20 lignes une préférence ancienne
devient **invisible au modèle sans être visible comme périmée à l'élève**.
C'est exactement la contre-mesure §10 (« le nombre de préférences actives par
personne se surveille ») — qui n'est surveillée nulle part.

**H7 — CONFIRMÉE.** La chaîne est : memorizer nocturne (`0 0 * * *`) → item
`candidate` → **clic Keep obligatoire** → archivage à J+14 si pas de clic. La
fenêtre de la fiche §7 (« le jour même ») décrit le premier maillon seulement.
Voir A2.

---

## 4. Tableau des tests — runs réels, vrai modèle, base locale

Décor de chaque passage : coach avec doctrine publiée, élève KEEL
(`keel_role='student'`, `timezone`, `country`, **`locale` écrite**),
`coach_clients` actif, **`plan_versions` publié + `plan_commitments`**,
`student_goals` posé. Script :
`docs/nutrition-pivot/qa-web/FF026_preference_capture.ts`.

### Synthèse par phase

| Phase | Ce qu'elle éprouve | Passages | Résultat |
|---|---|---|---|
| **A** | capture FR/EN, R7, tiers, R6 | 3 | **12/12 ✅** |
| **B** | R1 allergie ≠ préférence, 2 langues | 2 × 2 élèves | **8/8 ✅** |
| **C** | la boucle jusqu'au plat, rétractation | 2 runs × 3 | **R5 et R3 : voir §4.1 / §4.2** |
| **E** | 8 préférences accumulées | 1 | voir §4.1quinquies |
| **F** | préférences contradictoires | 2 | **✅**, avec une réserve sur §7 |
| **G** | sur-capture (ma propre contre-mesure) | 2 | **2/2 ✅** |

Deux sondes ont dû être corrigées **parce qu'elles fabriquaient de faux
verdicts** — les deux sont documentées dans le script, et l'une d'elles avait
déjà produit un faux ROUGE (§4.1bis-note).

### 4.0 Phase A — la capture, dans les deux langues (3 passages) — **12/12 ✅**

| Niveau | Scénario | Verdict | Preuve (relue en base) |
|---|---|---|---|
| easy | FR courte, la phrase de la fiche §1 : « t'as mis du riz, mais j'aime pas ça » | **3/3 ✅** | `7a003083 statement candidate c=0.95 [sante.alimentation] « Alix dislikes rice. »` |
| medium | EN courte, la phrase de la fiche §8 : « I don't like mushrooms » | **3/3 ✅** | `b290aad2 statement candidate c=0.95 « Alix dislikes mushrooms. »` |
| medium | **R7** « j'ai pas aimé le curry » (sans mot de date) → LE PLAT | **3/3 ✅** | `« Disliked the curry. »` · `« Did not like curry. »` · `« Alix did not like curry. »` — **items décomposés en ingrédients : aucun**, sur les 3 passages |
| adversarial | **H10/R6** capture silencieuse, aucun formulaire | **3/3 ✅** | 4 tours par passage, aucune formule de confirmation |

**Sur R7 et T-3.** La consigne annonçait que la décomposition plat→ingrédients
(T-3, FF-009/FF-017) pourrait toucher ce test. **Elle ne s'est pas produite** :
zéro item « poulet », « lait de coco », « curcuma » sur 3 passages. La
pathologie de décomposition est donc **spécifique au chemin d'intake**
(`food_group_ref` inventés, refus en bloc) et **n'affecte pas le memorizer**,
qui écrit du texte libre sans taxonomie fermée à respecter. C'est la même
famille de symptôme, pas la même cause — et ici la contrainte lâche joue en
faveur de R7.

**§11 la préférence d'un tiers — observé, non tranché.** Les 3 passages sont
cohérents :

```
« mon fils déteste les épinards »
  → memory_items [relations.famille]                    « His son hates spinach. »
  → memory_items [relations.famille,sante.alimentation] « Son hates spinach. »
  → memory_items [relations.famille,sante.alimentation] « Alix's son dislikes spinach. »
proposé au plan de l'ÉLÈVE par le pont : non (sensitivity=sensitive) — 3/3
```

Le goût d'un tiers **n'atteint pas** le plan de l'élève, bloqué par la ligne
médicale (`sensitivity_level !== "normal"`). **Mais c'est un effet de bord** :
rien dans le code ne vise ce cas, et le classement `sensitive` est produit par
le LLM d'extraction — donc pas garanti. Je ne tranche pas ; je signale que la
protection existe et qu'elle est **accidentelle**.

### 4.1 Phase C — la boucle jusqu'au plat, et la rétractation (2 runs × 3 passages)

| Niveau | Scénario | Verdict | Preuve |
|---|---|---|---|
| easy | phrase courte FR → `memory_items` | **6/6 ✅** | ex. `a6ea8f16 statement candidate c=0.95 [sante.alimentation] « Does not like rice. »` |
| easy | la préférence gardée atteint `practical_constraints` | **6/6 ✅** | `student_goals.practical_constraints.food_preferences = ["Does not like rice."]` ; vue prompt : `["2026-08-08 — Does not like rice."]` |
| easy | **R5 — le repas suivant ne contient pas de riz** | **5/6 ✅, 1 🔴** | témoin AVANT : `« chicken stir-fry rice bowl »` ; APRÈS : plus de riz sur 5 passages. Le rouge : riz revenu alors que la préférence était servie |
| hard | §7 génération le jour même, avant memorizer | **6/6 ✅** | `food_preferences en base: []` — limite documentée, pas un défaut |
| hard | **R3 — la rétractation est honorée** | **RED, ~1/3** | voir §4.2 |
| adversarial | **H3** le résumé interne ne fuit pas en texte visible | **6/6 ✅** | aucune préférence retrouvée mot pour mot dans le plan ; prénom absent |

### 4.1bis Phase B — R1, l'allergie n'est pas une préférence (2 passages × 2 langues)

| Niveau | Scénario | Verdict | Preuve |
|---|---|---|---|
| hard | FR « je suis allergique aux noix » → contrainte de sécurité | **4/4 ✅** | `student_safety_constraints: 6cbc6ceb kind=allergy allergen_ref=nut sev=medical status=active` |
| hard | EN « I'm allergic to peanuts » → contrainte de sécurité | **4/4 ✅** | `f2fc415f kind=allergy allergen_ref=peanut sev=medical status=active` |
| hard | …et **aucune** préférence promouvable | **8/8 ✅** | `proposeFoodPreferences: 0 proposition(s) (items: aucun)` |

**R1 est la règle la mieux tenue de la fiche**, et pour une bonne raison
structurelle : la contrainte est écrite **au tour même**, par le chemin
déterministe `declare_safety_constraint`, sans passer par le memorizer. Elle ne
dépend ni de la nuit, ni d'un clic, ni du modèle d'extraction.

Note sur le **pourquoi** de « aucune préférence » : ce n'est pas la ligne
médicale de `proposeFoodPreferences` qui a filtré — c'est qu'**aucun souvenir
n'a été créé du tout**. La phrase d'allergie est courte et je l'ai laissée
exprès hors de la porte alimentaire (§2.1 E2). Les deux ceintures sont donc
là, l'une derrière l'autre.

### 4.1ter Phase G — H4, la contre-mesure de mon propre correctif (2 passages) — **2/2 ✅**

Ma porte élargie laisse désormais passer du bavardage : mesuré sur 14 phrases
sociales, **8 atteignent le LLM d'extraction** (`i like`, `adore`, `aime bien`,
`i love`, `prefer`) là où 6 étaient arrêtées avant. La question qui coûte
quelque chose n'est pas celle-là, c'est : **est-ce que ça devient une
préférence ?**

Quatre tours de bavardage pur (« I like that idea, thanks », « j'adore,
merci ! », « haha j'aime bien ta façon de dire ça », « sounds good, I love
it ») :

```
── memory_items ──
  (aucun souvenir)
proposeFoodPreferences rend 0 proposition(s)
```

**Zéro souvenir créé, zéro proposition, sur les deux passages.** La sur-capture
au pré-filtre ne coûte donc que des tokens, et les cinq filtres en aval font
exactement ce que le commentaire du module leur prête. C'est la justification
mesurée du choix « permissif ici, strict en aval ».

### 4.1quater Phase F — §7 les préférences contradictoires (2 passages)

| Niveau | Scénario | Verdict | Preuve |
|---|---|---|---|
| xhard | les deux préférences EXISTENT, pas de résolution silencieuse en amont | **✅** | `food_preferences = ["N'aime pas le riz.","Adore le risotto."]` (2 propositions) |
| xhard | le générateur compose malgré la contradiction | **✅** | `generate-meal-v1 200` ; ni riz ni risotto à l'assiette |

**La moitié de §7 qui n'est PAS tenue.** La fiche demande que le générateur
« arbitre **et dise** ce qu'il a arbitré — jamais de résolution silencieuse ».
Les deux lignes survivent bien jusqu'au prompt (c'est la première moitié), mais
le plan produit **ne dit rien** : il évite simplement les deux aliments. C'est
une résolution silencieuse, au sens strict de la fiche.

À noter, et c'est le contraste intéressant : **la conversation, elle, arbitre
explicitement** — « risotto isn't the same as plain rice, so if that works for
you, use it. » Le bon comportement existe donc dans le produit, mais pas sur la
surface que §7 désigne. Observation consignée, non corrigée : la rendre vraie
demande de toucher le prompt de composition (`meal_generation.ts`, §2.4 —
fichier de l'autre agent).

### 4.1quinquies Phase E — §10 l'accumulation (1 passage) — **1/1 ✅**

Huit préférences posées (`rice`, `mushrooms`, `spinach`, `porridge`, `fish`,
`eggs`, `lentils`, `yoghurt`), puis une fenêtre de 3 jours composée :

```
generate-meal-v1 200 ; taille réponse: 12929
aliments écartés qui réapparaissent: aucun
dishes: [{"title":"blueberry chia overnight oats", …}]
```

Le plan reste composable et **respecte les huit** — la contre-mesure §10 (« la
sur-capture appauvrit les plans ») ne se déclenche pas à ce volume. Elle reste
un risque à 20+, où le plafond du prompt commence à couper (H8).

### 4.2 Le RED de R3 — la rétractation non honorée

Passage rouge, lu en base :

```
memory_items après « en fait j'aime bien le riz » :
  23107175 statement active c=0.98 [sante.alimentation] Dislikes rice.
  f61feaf9 statement active c=0.96 [sante.alimentation] Likes rice.

food_preferences après réconciliation serveur = ["Dislikes rice."]
items retirés par la mémoire : AUCUN (statuts: active,active)
```

Les deux souvenirs sont `active`, **aucun `superseded_by_item_id`**. Le
memorizer n'a pas produit de `correction`, donc
`reconcileFoodPreferences` n'avait rien à retirer — et la préférence démentie
reste dans le plan **indéfiniment**, puisque plus rien ne reviendra la
contredire.

Sur les passages verts, le memorizer avait bien émis le lien
(`a6ea8f16 = superseded` → `ce9b5e26 Likes rice.`) et la réconciliation a fait
son travail : `food_preferences = []`, le riz revient dans le plat.

**C'est donc la même famille que T-8, mais pas le même défaut.** T-8 (FF-017)
dit : la rétractation n'écrit rien hors flow ouvert. Ici la rétractation
**écrit bien** (« Likes rice. », `active`, confiance 0,96) — ce qui manque est
le **lien** entre l'ancienne vérité et la nouvelle, et ce lien est produit par
un LLM, donc non déterministe. Le dépôt l'avait déjà mesuré et écrit
(`food_preference_promotion.ts:906-911` : « le même scénario a produit un
`superseded` en français et AUCUN lien en anglais »). Mon run le confirme **à
formulation et langue constantes** : la variance est intrinsèque, pas
linguistique.

La contre-mesure existe déjà — `preferencesWorthRechecking`
(`food_preference_promotion.ts:936`) signale à l'élève « tu es revenu sur ce
sujet » — mais elle n'est branchée que dans `FoodPreferencesCard.tsx:145`,
c'est-à-dire **dans l'écran que l'élève n'ouvre pas**. Côté serveur, rien.

### 4.3 H1 — instance de T-1 : la réponse promet ce que rien n'a écrit

Relevé mot pour mot dans les runs, **au moment où `food_preferences` vaut `[]`
et où aucun `memory_items` n'existe encore** (le memorizer n'est pas passé) :

| Ce que la réponse dit | Ce que la base porte à cet instant |
|---|---|
| « Understood — no mushrooms. **I'll leave them out.** » | `memory_items`: 0 · `food_preferences`: `[]` |
| « Understood — rice is out for you. **I'll stick to something else.** » | idem |
| « Understood — no spinach for your son. **I'll leave that out too.** » | idem — et cet item sera classé `sensitive`, donc **jamais** promouvable |
| « Got it — rice **is back in.** » (rétractation) | l'ancienne préférence est encore active en base |

C'est **T-1**, dans sa forme exacte : la lane de réponse ne sait ni ce que le
déterministe a écrit, ni ce qu'il a refusé. Ici c'est structurel et pas
seulement non câblé — **`sophia-brain` ne lit `practical_constraints` nulle
part** (grep sur tout `supabase/functions/`), donc le compagnon ne *peut pas*
savoir. Il promet une exclusion qui dépend de trois maillons futurs : le
memorizer de cette nuit, un clic de l'élève, et un générateur qui obéit.

La ligne sur le fils est la plus coûteuse : la promesse est **définitivement**
fausse, puisque la ligne médicale bloque la promotion.

Correctif dans `agents/companion.ts` — **réservé à l'autre agent**. Consigné
comme instance de T-1, non ouvert.

Ce qui est en revanche **tenu** : R6. Aucune formule de confirmation
(« veux-tu que j'enregistre… », « should I remember that… ») sur l'ensemble des
tours joués — la capture est bien silencieuse.

---

## 5. Ce qui reste ouvert

### RED-1 · La rétractation n'est honorée qu'une fois sur deux à trois

Mesuré §4.2. La cause est le `correction` du memorizer, produit par un LLM,
donc non déterministe. **Non corrigé** — le corriger demande soit un plancher
déterministe de rétractation (chantier à part, et le dépôt s'est déjà interdit
un second écrivain de la mémoire), soit une réconciliation serveur qui
n'attende pas le lien : par exemple brancher `preferencesWorthRechecking`
côté serveur pour au moins **signaler** la contradiction plutôt que la subir.
Décision produit, pas décision de code.

Le risque le plus cher n'est pas la ligne périmée en soi : c'est qu'elle est
**invisible**. La vue datée du prompt met la plus récente en tête, donc le
modèle peut s'en sortir ; mais si l'élève ne garde jamais la nouvelle ligne
(il faut un clic), le prompt ne contient QUE la périmée.

### RED-2 · R5 rate ~1 fois sur 6

Cause probable identifiée et localisée : la préférence est servie comme un
**témoignage** et non comme une contrainte (§2.4). Correctif d'une ligne
proposé, **non appliqué** — le fichier appartient à l'autre agent.

### Ouvert et NON tranché (je ne tranche pas)

- **§11 la préférence d'un tiers.** Observé : le memorizer produit bien un item
  (« Alix's son dislikes spinach. »), et il le classe `sensitivity=sensitive`
  avec `relations.famille` — ce qui le rend **non promouvable** par
  `proposeFoodPreferences` (ligne médicale, `sensitivity_level !== "normal"`).
  Le goût d'un tiers n'atteint donc pas le plan de l'élève. **C'est un effet de
  bord, pas une décision** : rien dans le code ne vise ce cas, et la
  classification `sensitive` est elle-même LLM-dépendante. À arbitrer.
- **A1 à A4** (§2.2) : amendements de fiche proposés, non appliqués.

### Non testable, et pourquoi

- **La langue de la RÉPONSE.** `_shared/keel/locale.ts:28` porte
  `PILOT_FORCED_LOCALE = "en-US"`, rendu avant toute lecture de
  `profiles.locale`. Toute copie française runtime est morte au rendu — **T-2**.
  Mes tests d'**entrée** bilingue (capture depuis une phrase FR ou EN) restent
  valides : ils mesurent ce qui est écrit en base, pas ce qui est rendu.
- **Le rendu de la carte `FoodPreferencesCard`.** Le geste « Keep » est joué
  par les fonctions pures + l'écriture `student_goals`, c'est-à-dire le même
  code que le front appelle. Ce qui n'est pas couvert est le **rendu**, pas la
  logique. Un run navigateur serait un chantier à part.
- **T-1 (l'accusé de faits inexistants).** Constaté (§4.3) mais non corrigeable
  ici : `sophia-brain/agents/companion.ts` est réservé à l'autre agent.

---

## 6. Commandes pour l'humain

Rien de ce chantier n'exige une commande à risque : aucune migration, aucun
secret, aucun déploiement. Tout est du code d'edge function et un script QA.

**Rejouer une phase** (le décor se crée et se nettoie tout seul) :

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
./scripts/local_extend_kong_functions_timeout.sh        # avant tout run long
docker restart supabase_edge_runtime_Sophia_2           # après tout code edge modifié

set -a; . supabase/functions/night_llm.env; set +a
deno run -A docs/nutrition-pivot/qa-web/FF026_preference_capture.ts C 3
#   phases: A capture · B allergie · C boucle+rétractation · E accumulation
#           F contradiction · G sur-capture      (2e argument = nb de passages)
```

**Les tests unitaires touchés** (environnement PURGÉ, sinon 114 faux rouges) :

```bash
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/memory/memorizer/ \
  supabase/functions/_shared/keel/food_preference_promotion_test.ts \
  supabase/functions/_shared/keel/food_preference_promotion_io_test.ts
```

**Déploiement** — à faire vous-même, je ne peux pas :

```bash
supabase functions deploy generate-household-meal-v1
# `batch_selector.ts` est un module _shared: il part avec toute fonction qui
# l'importe, donc au minimum:
supabase functions deploy trigger-memorizer-daily
```
