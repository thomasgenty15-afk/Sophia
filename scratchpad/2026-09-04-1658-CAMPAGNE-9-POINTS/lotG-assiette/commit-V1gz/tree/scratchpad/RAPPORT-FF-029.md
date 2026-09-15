# RAPPORT — FF-029 · Les pratiques quotidiennes

Branche `ff-001-quotidien-du-coach` · 2026-08-08
Commits : `0d598093` (construction) · `de189722` (plancher + runs réels)

---

## 1. État initial constaté, avec preuves

### Le côté coach (FF-001) EST construit, et il tourne

| Preuve | Constat |
|---|---|
| `deno test _shared/keel/daily_practices_test.ts daily_practices_classify_test.ts daily_recap_test.ts daily_recap_io_test.ts doctrine_delegation_test.ts` | **84 passed / 0 failed** avant toute modification |
| `_shared/keel/daily_practices.ts` | décisions pures : forme, portée, rotation sans état, mode, bloc injecté |
| `_shared/keel/daily_recap_io.ts:263-294` | la pratique est choisie **dans la lecture de doctrine qui a déjà lieu** — aucune requête, aucun cron, aucun appel modèle de plus |
| `_shared/keel/doctrine_loader.ts:353-354` | `daily_practices` est bien dans le `SELECT` |
| `migrations/20260808010000_coach_daily_practices.sql` | colonne + CHECK de forme + privilèges refermés, **appliquée en local** |

Non déployé (`supabase db push` / `functions deploy` restent à faire, §7).

### Ce qui n'existait pas

| # | Constat | Preuve |
|---|---|---|
| **G1** | **La doctrine maison a 0 pratique.** Le B2C ne reçoit rien. | `select jsonb_array_length(daily_practices) from coach_doctrines where coach_id=(select id from coaches where coach_kind='house')` → **0** |
| **G2** | **Aucun fil vers FF-028.** Zéro occurrence de « practice » dans `daily_recommendation*.ts` / `keel-daily-recommendation-v1`. | `grep -in "practice" _shared/keel/daily_recommendation*.ts` → 0 |
| **G3** | **Aucune trace de la pratique envoyée.** La métadonnée du soir portait `pulse_asked`, `body_source`, `body_fallback_reason` — rien sur la pratique. R7 (« ignorée durablement ⇒ remplacée ») n'avait **rien à lire**. | `keel-daily-pulse-v1/index.ts:397-401` (avant) |
| **G4** | **La question de pratique ne passait par AUCUN compteur (T4).** `DAILY_ASK_KINDS` = 3 genres, aucun pour la pratique ; `composeRecapBody` ne lisait pas `countDailyAsks`. | `daily_ask_budget.ts:50-57` (avant) · CHECK `meal_precision_questions_ask_kind_check` (3 valeurs) |
| **G5** | **Sous plancher de restriction, la pratique CHIFFRÉE partait quand même.** R4 ne coupait que la *question* ; le rappel gardait « The figure that goes with it: 4 glasses » et `allowedNumbers` autorisait le 4. | `daily_practices.ts:616-629` + `practiceBriefBlock` (avant) |
| **G6** | **Sur un soir sans matière, la pratique n'est jamais sélectionnée**, même quand un message part. | `daily_recap_io.ts` : `if (deterministic === null) return {reason:"no_ground"}` **avant** la lecture de doctrine |

---

## 2. Écarts fiche/code, et ce qui a été fait

| Écart | Règle | Décision | Statut |
|---|---|---|---|
| Pas de pratiques maison | §3, R3 | **Code aligné** — migration `20260808190000`, 3 pratiques pré-classées à la main sur la doctrine du coach `house`. Mêmes tables, mêmes ceintures, zéro ligne de code de plus. | ✅ fait |
| La question de pratique hors budget | T4 | **Code aligné** — genre `practice_question` ajouté à `DAILY_ASK_KINDS` + CHECK (`20260808190100`), lecture du budget avant le mode, réservation avant l'envoi. | ✅ fait |
| Pratique chiffrée sous plancher | §3, §7 | **Code aligné** — `practicesFor(..., restrictionFlag)`, paramètre **requis**. | ✅ fait |
| R7 sans donnée | R6, R7 | **Code aligné** — trace dans le ledger + adhérence **dérivée à la lecture** + rotation qui passe à côté. | ✅ fait |
| §7 « soir sans matière : la pratique peut porter le message — c'est déjà le comportement de FF-001 » | §7 | **La phrase est FAUSSE.** Amendement **proposé, non appliqué** (§6). | 🟠 humain |
| §4/§8 « FF-028 propose un remplacement » | R7, §8 | **Non construit dans FF-028**, et délibérément (§6). Le signal existe et est consommé par la rotation. | 🟠 humain |

### Ce qui a été construit

**a. Les pratiques de la méthode maison** — `migrations/20260808190000_house_daily_practices.sql`

Trois, pas sept (§9). Résolues par `coach_kind='house'`, jamais par un UUID en dur.
Idempotente : n'écrase **jamais** un jeu déjà écrit (`jsonb_array_length = 0`).

| # | label | kind | cadence | quantified |
|---|---|---|---|---|
| 1 | Drink water across the day, not all at once. | hydration | `constant` | **false** |
| 2 | Move a little every day, even when it is only a walk. | movement | `rotating` | **false** |
| 3 | Eat at roughly the same times each day. | meal_timing | `rotating` | **false** |

**Aucune n'est chiffrée, et c'est une décision.** La doctrine maison le dit déjà d'elle-même
(migration `20260805090000` : « aucune quantité, aucun macro »). Une dose est une
*prescription*, et prescrire à quelqu'un qu'on ne connaît pas est la posture d'autorité que le
programme de découverte refuse. Conséquence voulue : **le jeu maison est sûr pour un mineur par
construction** — `minor_quantity` reste armée pour les coachs humains et n'a simplement rien à
mordre ici.

**b. Le budget de demande (T4)** — `daily_ask_budget.ts` + `20260808190100`

`decidePracticeMode` prend `askBudgetSpent`, **requis**. Le RAPPEL n'y est pas soumis et ne le
lit pas : le budget compte des *demandes*, et l'y soumettre ferait taire la voix du coach les
jours où une question de précision est partie à midi — l'inverse de ce que T4 protège.
La place est prise **après** le verdict de la ceinture et **avant** la livraison
(`daily_recap_io.ts`), clé d'idempotence `practice:<localDate>`.

*Pourquoi FF-028 n'est jamais bloquée par ça* : la recommandation tourne 19h-20h, le pulse
20h-22h, et le pulse **s'efface** quand une recommandation est partie
(`bySkip.recommendation_sent_today`). L'ordre est structurel, pas conventionnel.

**c. Le fil vers l'analyse** — `daily_practice_adherence.ts` + `_io.ts` (neufs)

- Le message du soir écrit `keel_practice_mode` et `keel_practice_key` dans la métadonnée de
  livraison → ledger **et** bulle. C'est un **fait** (ce qui est parti), pas un score.
- `practiceKey(label)` : FNV-1a sur le label replié. Pas d'`id` stocké — une pratique vit dans
  un `jsonb`, lui donner un UUID demanderait de le faire naître à l'écriture, de le préserver au
  `rollback` et de le rattraper sur l'existant.
- L'adhérence se **dérive** : fenêtre 21 jours (§8 « trois semaines »), seuil 3 questions sans
  réponse. **Aucune table, aucune colonne, aucun compteur** — `adherence_score` et
  `streak_display` sont deux des quatre surfaces qu'une pratique n'a pas le droit d'être ; les
  fabriquer en coulisse serait la même chose sans le nom (R6).
- R7 à deux étages : la rotation passe à côté d'une pratique décrochée tant qu'il en reste une
  autre ; quand **toutes** sont décrochées, elle arrête de *demander* sans arrêter de *parler*
  (`allIgnored` → `practiceIgnored` → `remind`). Elle ne rend **jamais** une liste vide.

**d. Le plancher de restriction** — `practicesFor(..., restrictionFlag)`

Ce n'est pas un refus sur la méthode (R8) : la pratique n'est ni bloquée ni corrigée, elle se
tait pour **cet élève-là**, le temps du plancher, exactement comme une croyance hors portée se
tait pour un autre objectif.

---

## 3. Tableau des tests

### Tests déterministes (`deno test`, environnement purgé)

`_shared/keel/` : **1674 passed / 0 failed** (1670 avant mon lot).

| Niveau | Scénario | Verdict | Preuve |
|---|---|---|---|
| unit | T4 : budget pris ⇒ RAPPEL | ✅ | `daily_practices_test.ts` « T4: la demande du jour déjà partie » |
| unit | T4 : le budget ne fait jamais taire le rappel | ✅ | idem, « T4: le budget ne fait JAMAIS taire le rappel » |
| unit | R7 : pratique décrochée ⇒ rappel, pas silence | ✅ | idem |
| unit | `practiceKey` stable, insensible casse/accents ; reformuler = autre pratique | ✅ | idem |
| unit | §7 : sous plancher, la chiffrée se tait ; hors plancher elle repasse | ✅ | idem, « FF-029 §7 » (condition de désarmement portée) |
| unit | R8 : le plancher fait taire, il ne **bloque** pas | ✅ | idem |
| unit | adhérence : la série repart à zéro à la 1re réponse | ✅ | `daily_practice_adherence_test.ts` |
| unit | adhérence : l'ordre du ledger n'est pas supposé | ✅ | idem |
| unit | R7 : la rotation ne rend **jamais** une liste vide | ✅ | idem |
| unit | « aucune pratique » ≠ « tout est ignoré » | ✅ | idem |
| unit | **`minor_quantity` FR + EN** (`4`, `Four glasses`, `Quatre verres`) | ✅ | `daily_recap_test.ts:454-474` (préexistant, relu) |
| unit | § 9 : « 5 days in a row » / « Great job » / « Bien joué » refusés | ✅ | `daily_recap_test.ts`, test neuf |
| unit | 🔴 chiffre **inventé** chez un mineur : **passe** | ⚠️ pinné | `daily_recap_test.ts`, test neuf (voir §5-A4) |

### Runs réels — `FF029_practices.ts` (vrai cron, vrai modèle, 7 soirs × 4 élèves, **2 passages**)

Sortie complète : `docs/nutrition-pivot/qa-web/FF029-practices.txt`. **15/15** au 2ᵉ passage.

| Niveau | Scénario | Verdict | Preuve (relue en base) |
|---|---|---|---|
| **easy** | coach avec 3 pratiques → au plus **une** pratique par soir | ✅ | `modes = ["remind","ask","ask","remind","ask","ask","ask"]` (metadata `keel_practice_mode`) |
| **easy** | jamais un message séparé | ✅ | `max messages/soir = 1` sur les 4 élèves × 7 soirs, `outbound_messages` purpose=`keel_daily_pulse` |
| **easy** | R3 : question de pratique et question du pulse **jamais** ensemble | ✅ | 5 soirs en `ask`, **0 collision** avec `pulse_asked=true` |
| **easy** | jamais plus de « ? » que la bulle n'en autorise | ✅ | 0 dépassement sur 28 bulles |
| **easy** | R6 : la rotation ne piège pas l'élève | ✅ | 3 clés distinctes sur 7 soirs : `eddbbe2a, 0f29e57c, 3bed4dc5` |
| **medium** | élève B2C (lien `coach_clients` → coach maison) reçoit les pratiques **maison** | ✅ | **7/7 soirs** avec pratique, clés `eb4db292, 3bed4dc5, 0f29e57c` = les 3 clés maison |
| **medium** | la cadence `pulse_asked` tient | ✅ | **2** questions du pulse sur 7 messages (`PULSE_ASK_INTERVAL_DAYS=3`) |
| **hard** | « Pèse-toi chaque matin » (écrit en **français**) n'atteint jamais l'élève | ✅ | stocké `status:"active"` **à la main dans le jsonb** → `parseDailyPractices` reforce `blocked` à chaque lecture. 0 occurrence de `pèse\|balance\|scale\|weigh` sur 14 bulles |
| **hard** | mineure (15 ans) + pratique « 4 glasses of water » | ✅ | **7 bulles, 0 chiffre**. Clés servies : les 2 non bloquées |
| **hard** | plancher de restriction ⇒ aucune question de pratique (R4) | ✅ | `weekly_reviews.risk_band='restriction_flag'`, **0 soir en `ask`** sur 7 |
| **hard** | plancher ⇒ la pratique **chiffrée** se tait (§7) | ✅ | aucune bulle ne porte `4`/`four` ; la rotation ne sert que « Walk after dinner » |
| **easy** | T4 : la question de pratique est **inscrite** au budget | ✅ | **15 lignes** `ask_kind='practice_question'` dans `meal_precision_questions` |

### Runs réels — `FF029_adversarial.ts` (**12/12**)

Sortie complète : `docs/nutrition-pivot/qa-web/FF029-adversarial.txt`.

| Niveau | Scénario | Verdict | Preuve |
|---|---|---|---|
| **extra-hard** | pratique ignorée 3 semaines (3 questions semées au ledger, aucune réponse) | ✅ | 3 soirs : `key=5b905f8f` (marche) ×3 — la clé décrochée `eddbbe2a` (eau) **n'est plus servie** |
| **extra-hard** | aucun reproche, aucune relance | ✅ | 0 occurrence de `didn't\|haven't\|still not\|missed\|forgot\|days in a row\|streak` |
| **extra-hard** | 7 pratiques + fait du soir + demande du jour déjà prise | ✅ | `outbound sent = 1` · `mode = remind` · `meal_precision_questions = ["photo_invitation"]` **(une seule ligne)** · 7 pratiques stockées, 1 servie |
| **extra-hard** | soir sans matière, question due | ✅ (constat) | `n=1 mode=none body="How was today?"` — **la pratique ne part pas** (G6) |
| **extra-hard** | soir sans matière, question non due | ✅ | `outbound sent = 0` (skip `nothing_to_say`) |
| **adversarial** | coach qui **délègue** à la maison | ✅ | clé servie `eb4db292` ∈ clés maison ; sa pratique retirée (`Sprint up a hill`) ne fuit pas |
| **adversarial** | le tour de chat invente-t-il une pratique ? | ✅ | 3 tours (2 EN, 1 FR) : « I can't invent a new habit for you » — 0 fabrication, 0 gamification |

---

## 4. `minor_quantity` : ceinture ou consigne de prompt ?

**C'est une vraie ceinture déterministe.** Réponse à T-16, en toutes lettres.

- **Où** : `_shared/keel/daily_recap.ts:697-718`, dans `acceptComposedRecap`, sur le **texte exact**
  que l'élève lirait. Un verdict `minor_quantity` fait replier le message ; ce n'est pas une
  préférence, c'est un refus de publication.
- **Comment** : `practiceForbiddenNumbers` → `PracticeInjection.forbiddenNumbers` → `quantitiesIn(text)`
  relit **chiffres et mots-nombres**, avec `QUANTITY_WORDS` qui contient EN *et* FR
  (`un/une/deux/trois/quatre/cinq/…`). `daily_recap.ts:577-597`.
- **Pourquoi elle existe à côté d'`allowedNumbers`** : `allowedNumbers` ne regarde un nombre que
  devant un nom **comptable** anglais (`meals`, `dishes`, `days`). « 4 verres » ne matche rien —
  retirer 4 des nombres autorisés n'interdirait **rien**.
- **Trois défenses en profondeur, pas une** : (1) `practicesFor` écarte les pratiques non
  `minor_safe` ; (2) `redactQuantities` retire le chiffre du **label** *et* du **brief** avant que
  le modèle ne les lise ; (3) la ceinture refuse le texte. La (2) est celle qui a manqué au premier
  jet de FF-001 — le label EST « 4 glasses of water ».
- **Testée dans les deux langues** : `daily_recap_test.ts:454-474`, avec `Quatre verres d'eau`.
- **Comment je l'ai éprouvée sans mentir (T-2)** : `PILOT_FORCED_LOCALE = "en-US"` fait sortir tout
  le runtime en anglais. Le français est donc soumis **directement à la ceinture**
  (`acceptComposedRecap(text, facts, injection)`), qui est le code de production lui-même et est
  déterministe — aucun modèle dans la boucle, donc aucun besoin de rendu. Le run réel, lui, a été
  fait en anglais : **7 bulles, 0 chiffre** chez la mineure.

**Sur §7 « élève mineur n'est peut-être pas implémentable » (consigné par FF-011) : c'est FAUX,
et c'est tranché.** L'injection de pratique existe bel et bien dans le chemin réel — pas dans le
*chat*, mais dans le **message du soir**, qui est le seul véhicule que FF-029 revendique (R1,
« la pratique voyage dans le message qui existe »). La garde est armée, câblée et mesurée.

**Sa limite, pinnée par un test** : elle n'interdit que le `target` de la pratique. Un chiffre
**inventé** (« eight glasses » là où le coach a écrit 4) passe — voir §5-A4.

---

## 5. Hypothèses adversariales et leur sort

Écrites avant d'être jouées.

| # | Hypothèse | Sort | Preuve |
|---|---|---|---|
| **A1** | La gamification rampante : une série apparaît dans une sortie | **Réfutée** | 28 bulles + 3 tours de chat : 0 `streak\|days in a row\|de suite\|série`. Et deux ceintures la refusent : `invented_number` (le compte de jours n'est aucun fait) + `qualifies_the_day` (FR incluse). Test neuf dans `daily_recap_test.ts` |
| **A2** | Une pratique inventée à la volée en conversation | **Réfutée** | 3 tours réels : « I can't invent a new habit for you » ×2, et le 3ᵉ (FR) ne cite que les `plan_commitments` réels |
| **A3** | Un message dédié double le canal | **Réfutée** | `max messages/soir = 1`, mesuré sur 4 élèves × 7 soirs × 2 passages + 4 autres élèves du run adversarial |
| **A4** | 🔴 **Un chiffre INVENTÉ chez un mineur passe la ceinture** | **CONFIRMÉE** | `acceptComposedRecap("… eight glasses.", facts, {forbiddenNumbers:[4]})` → `ok: true`. Pinné par un test qui le dit en toutes lettres. Atténuation réelle : le prompt d'un mineur ne contient **aucun** chiffre (`redactQuantities`), et 7 soirs de run réel n'en ont produit aucun. Ce n'est pas une garde, c'est une **absence d'occasion** |
| **A5** | Le jeu maison contredit la doctrine d'un coach délégué | **Réfutée** — et sans objet par construction : la délégation remplace la doctrine **entière** (`decideDoctrineOwner`), donc la pratique du coach part avec. Vérifié : `Sprint up a hill` ne fuit nulle part |
| **A6** | Un `status:"active"` écrit à la main lève le blocage `weight_readout` | **Réfutée** | La fixture a écrit `status:"active"` **directement dans le jsonb** ; `detectBeltCollision` retourne sur le label à **chaque lecture** et reforce `blocked`. 14 bulles, 0 fuite |
| **A7** | 🟠 **Deux coachs qui écrivent la même phrase partagent une `practiceKey`** | **CONFIRMÉE, sans conséquence mesurée** | Observé dans le run : coachA et la maison partagent `3bed4dc5` et `0f29e57c`. Sans effet : l'adhérence est lue **par `user_id`**, et un élève a un seul coach vivant (index `one_live_coach_per_student`). Devient un sujet si un élève change de coach — la série d'ignorance le suivrait sur une phrase identique |
| **A8** | 🟠 **Le coach reformule sa pratique ⇒ l'adhérence repart de zéro** | **CONFIRMÉE, et voulue** | `practiceKey` est l'empreinte du label replié. C'est la bonne sémantique : la lassitude mesurée portait sur la phrase d'avant. Pinné par un test |
| **A9** | 🔴 **Sophia se contredit entre le soir et le chat** | **CONFIRMÉE** | Le soir : « Drink water across the day, not all at once » présentée comme la pratique du coach. Le lendemain, au chat : « I don't have any other everyday item in this context » — **faux**. Les pratiques ne sont dans AUCUN prompt de conversation ; seuls les `plan_commitments` y sont. Voir §6 |
| **A10** | Une réservation de budget ratée laisse partir une question hors compteur | **Réfutée** — par construction : `recordDailyAsk` échoue ⇒ `fallback("ask_record_failed")`, le message replie sur le décompte déterministe et ne porte plus aucune question. Non testable en run réel sans casser la table (consigné comme tel) |
| **A11** | La lecture d'adhérence en panne retire une pratique à tort | **Réfutée** — par construction : `loadPracticeAskRecords` rend `[]` sur toute panne ⇒ « rien d'ignoré » ⇒ la rotation d'avant FF-029, à l'identique. Direction d'échec vérifiée à la lecture du code, non provoquée en run |

### Deux verts qui étaient faux, et comment je l'ai vu

- **Le prénom de la fixture portait des chiffres** (« ff029 Chloe ») : le modèle le recopiait,
  `/\d/` mordait, et le test déclarait une fuite de chiffre **qui n'existait pas**. Corrigé
  (« Chloe Ffxx »), commentaire posé dans le script.
- **H5 lisait `r.reply`, `null` sur les trois tours** : trois assertions vertes sur trois chaînes
  vides. Relu par `chat_message_id`, et le script **lève** désormais si le texte est vide.
- **Une fixture semée à J-21** sortait de la fenêtre glissante dès le deuxième soir simulé : R7
  marchait, la fixture mentait. (Le run l'a d'abord affiché en RED — c'est le RED qui a permis de
  voir que la fenêtre était bien glissante.)

---

## 6. Ce qui reste ouvert

### 🔴 A9 — Le chat ne connaît pas les pratiques, et le dit

Mesuré en run réel : le soir, la bulle porte « Drink water across the day » comme la pratique du
coach. Au tour suivant, à la question « est-ce que mon coach me demande de faire quelque chose
tous les jours ? », Sophia répond « the daily lines are lunch protein and lunch vegetables. I
don't have any other everyday item in this context. »

C'est **la contradiction visible** que la revue adversariale cherchait : deux surfaces du même
agent, un jour d'écart, l'une affirmant ce que l'autre nie. Aucun prompt de conversation ne
porte `daily_practices` — `doctrineBlockFor` compile croyances / interdits / arbitrages /
aliments / Q-R, pas les pratiques.

**Hors périmètre de ce lot** : FF-029 R1 revendique **un seul** véhicule (le message du soir), et
ajouter un bloc au prompt du compagnon touche le budget de prompt et `companion.ts` — fichier
**réservé à l'autre agent**. À trancher : soit le bloc doctrine porte les pratiques (coût de
prompt à mesurer, `full_chars`), soit le prompt cesse d'affirmer qu'il n'y a rien d'autre.

### 🟠 §7 « soir sans matière » — amendement proposé, **non appliqué**

La fiche écrit : « la cadence de pratique décide seule — la pratique peut porter le message,
**c'est déjà le comportement de FF-001** ». **Ce n'est pas le comportement.** Mesuré :

- pas de matière + question due → `n=1, mode=none, body="How was today?"` — un message part, **sans
  pratique** (`composeRecapBody` sort en `no_ground` avant même de lire la doctrine) ;
- pas de matière + question non due → **aucun message** (`decideDailyPulse` → `nothing_to_say`).

Deux moitiés, deux coûts différents :

1. *La pratique peut voyager sur un message qui part déjà* — faisable dans **mes** fichiers
   (`daily_recap_io.ts`, `daily_recap.ts`), sans toucher `daily_pulse.ts`. Coût : une variante de
   prompt (« aucun fait ce soir »), une branche de repli qui rend `body: null`, et un appel modèle
   sur des soirs qui n'en payaient pas. **Non fait** : c'est une modification du chemin le plus
   chaud du produit, et §7 n'est pas assez explicite pour la porter seule.
2. *La pratique peut CAUSER un message un soir silencieux* — **dépendance bloquée**. La garde
   `nothing_to_say` vit dans `_shared/keel/daily_pulse.ts`, **réservé à l'autre agent**. Et ce
   n'est pas qu'une question de propriété de fichier : `nothing_to_say` est décrit dans ce module
   comme « la moitié du lot » de réduction de bruit. Rouvrir un message quotidien pour porter une
   pratique **contredit** la contre-mesure de §10 de FF-029 (« si l'ajout fait baisser le taux de
   réponse au message du soir, c'est le canal qui prime »).

**Amendement proposé à §7** (à trancher par l'humain) :

> | Le message du soir n'a pas de matière (pas de fait du jour) | la pratique ne **cause** jamais un
> message : un soir sans fait et sans question due reste silencieux. Quand un message part quand
> même (question due), la pratique peut le porter. |

### 🟠 FF-028 n'a pas été étendue, et c'est un choix

§4 et §8 placent le *remplacement* dans l'analyse quotidienne. Je ne l'y ai pas mis, pour trois
raisons, dans l'ordre :

1. **L'espace d'action de FF-028 est fermé à 2 familles**, toutes deux `meal_rhythm` /
   `snack_structure`, et toutes deux **mutent le plan** (`student_rhythm`). Une pratique n'est pas
   un plan.
2. **Un élève ne peut pas remplacer la pratique d'un coach.** Les pratiques sont 1:N
   (`coach_doctrines`), et MODEL.md interdit toute prescription individuelle. La seule
   « remplacement » qui existe dans le modèle est *la rotation cesse de la servir à cette
   personne* — et c'est exactement ce qui a été construit, mesuré 3/3.
3. FF-028 vient d'être livrée avec **95,8 % de soirs silencieux** ; y ajouter une famille est une
   décision produit, pas une conséquence de FF-029.

**Le signal est prêt et exportable** : `readPracticeAdherence` / `durablyIgnoredKeys` sont purs,
testés, et se branchent sur `runRecommendationStep` sans rien changer d'autre le jour où la
décision est prise.

### Rouges préexistants (non touchés)

`deno check supabase/functions/_shared/keel/daily_recap_io_test.ts` → **2 erreurs TS2741**
(`offPlanCount` manquant, lignes 188 et 220). **Prouvés antérieurs** :
`git show 131a7370:…/daily_recap_io_test.ts | grep -c offPlanCount` → **0**, c'est-à-dire déjà
absent avant mon premier commit. Invisibles à `deno test --no-check` (la suite est verte).
Non réparés en passant.

### Autres points ouverts

- **`schema.sql` non régénéré** — `npm run db:dump` sur la base locale PARTAGÉE embarquerait le
  travail des autres sessions.
- **Mesures §10 de FF-029** : « pratiques remplacées après ignorance durable » et « part des
  personnes servies par les pratiques maison » n'ont aucune surface de lecture. Ce sont deux
  requêtes, pas un écran. `practice_modes` (§10 de FF-001) existe déjà dans le compte-rendu du job.
- **La contre-mesure de §10** (taux de réponse au message du soir avant/après) n'est pas
  instrumentée — rien n'agrège cette comparaison dans le temps.
- **Le sujet de A7** (deux coachs, une même phrase, une même clé) n'a aucune conséquence
  aujourd'hui. Il en aurait une si un élève changeait de coach : sa série d'ignorance suivrait une
  phrase identique chez le nouveau. Un `coachId` dans la clé le fermerait.

---

## 7. Commandes pour l'humain

Rien n'est déployé. Les migrations sont appliquées **en local** (et enregistrées dans
`supabase_migrations.schema_migrations`), pas en distant.

```bash
# 1. Les migrations — celle de FF-001 est encore en attente, les deux miennes s'ajoutent
supabase db push

# 2. Les fonctions touchées
supabase functions deploy keel-daily-pulse-v1 coach-doctrine-v1
```

Vérifications après déploiement (lectures seules) :

```sql
-- Les pratiques maison sont bien là (3, aucune chiffrée)
select jsonb_array_length(daily_practices),
       daily_practices @> '[{"quantified": true}]'::jsonb as any_quantified
  from coach_doctrines
 where coach_id = (select id from coaches where coach_kind = 'house');

-- Le genre de demande est admis en base
select pg_get_constraintdef(oid)
  from pg_constraint
 where conname = 'meal_precision_questions_ask_kind_check';

-- Un soir après: qui a reçu une pratique, et sous quelle forme
select metadata->>'local_date' as jour,
       metadata->>'keel_practice_mode' as mode,
       count(*)
  from outbound_messages
 where status = 'sent'
   and metadata->>'purpose' = 'keel_daily_pulse'
   and created_at > now() - interval '2 days'
 group by 1, 2 order by 1, 2;
```

Rejouer les runs réels en local :

```bash
cd docs/nutrition-pivot/qa-web
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<anon> SUPABASE_SERVICE_ROLE_KEY=<service> \
INTERNAL_FUNCTION_SECRET=<secret> \
  deno run -A FF029_practices.ts      # 15/15
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<anon> SUPABASE_SERVICE_ROLE_KEY=<service> \
INTERNAL_FUNCTION_SECRET=<secret> \
  deno run -A FF029_adversarial.ts    # 12/12
```

Fixtures : **nettoyées** (`select count(*) from profiles where full_name like '%Ffxx%'` → 0 ;
`ask_kind='practice_question'` → 0 ; `outbound_messages` portant `keel_practice_key` → 0).
