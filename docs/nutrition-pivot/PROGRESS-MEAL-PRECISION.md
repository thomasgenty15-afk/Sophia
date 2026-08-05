# JOURNAL — précision de repas (texte + photo)

> Append-only. Chaque entrée porte sa preuve ou dit qu'elle n'en a pas.

---

## 2026-08-04 — P0. Orientation, et un écart de branche à dire tout de suite

### La branche demandée n'est plus la branche de travail

Le prompt dit « branche `dewhatsapp` ». Vérifié :

```
dewhatsapp: 03d3551d579b6bc7bdbecc4a58011a328c8782e7
main:       9b4b34690fc57213057717fc29056bcd6f272269
git log main..dewhatsapp  →  vide
```

`dewhatsapp` est entièrement contenue dans `main` : le commit de tête de `main`
s'appelle littéralement « main reprend la lignee KEEL: le contenu de dewhatsapp
devient l'etat courant ». Travailler sur `dewhatsapp` produirait une branche en
retard d'un commit sur l'état courant, qu'il faudrait re-merger.

**Décision : le travail se fait sur `main`.** C'est la branche qui porte la
lignée que le prompt désigne. Noté ici parce qu'une consigne écrite qu'on
n'applique pas à la lettre doit être visible, pas silencieuse.

### Ce que la lecture du §2 a confirmé, et ce qu'elle a corrigé

Confirmé (rien à reconstruire) :

| Brique | Fichier | État |
|---|---|---|
| Signal « c'est un repas » | `dispatcher.v2.ts` → `direct_effects[]` | existe, écrit |
| Décomposition en composants | `log_protocol_event/intake.ts` | existe, dédupe par identité |
| `needs_clarify` | `log_protocol_event/router.ts` | existe, mais token-only |
| Question photo + filtre de mise | `meal_analysis.ts:996-1028` | existe, déterministe |
| Réponse photo câblée | `meal_photo_{flow,intent,amend,flow_state}.ts` + `keel_meal_photo_lane.ts` | existe |

Corrigé par la lecture (le prompt ne pouvait pas le savoir) — **le chemin de
rendu n'est pas celui qu'on croit** :

`mergeDirectEffectRuntimeIntoVisibleRuntime` (`operation_runtime_pipeline.ts:399`)
pose `content: visibleContent` : **la reply du renderer `log_protocol_event` est
JETÉE dès qu'un runtime visible existe**. C'est le composeur qui écrit au repas
déclaré. Conséquence directe sur la conception : une question rendue par le
renderer du tool ne sortirait pas de façon fiable, et une question laissée au
composeur peut demander une quantité — exactement la ligne rouge du §3.

Le dépôt a déjà le patron de la réponse : `stripKeelAckWithoutCommittedEffect` et
`ensureClarifyQuestionVisible` sont des **ceintures de rendu** appliquées dans
`finalVisibleText`, et `keel: KeelTurnContext` y est un paramètre **obligatoire**
précisément pour qu'aucun chemin de sortie ne puisse l'oublier (commentaire
`run.ts:2076-2085`). La question de précision voyagera donc sur `keelTurn` et
sera posée par une ceinture déterministe. Texte en gabarit fermé : le seul moyen
structurel de garantir qu'aucune question de quantité ne sort jamais.

### Snapshot

Commit snapshot posé avant toute modification de code.

---

## 2026-08-04 — P1. L'évaluation de complétude

Module pur `_shared/keel/meal_precision.ts`. Quatre axes fermés
(`composition` / `accompaniment` / `preparation` / `slot`), pas de score.

**La règle de mise, rendue déterministe.** Un axe ne compte comme manquant que
si une ligne **encore ouverte** (`status = 'unknown'`) du protocole du JOUR en
dépend. Trois filtres, et chacun retire une question inutile :
`food_group_ref` non nul (une ligne « 8 000 pas » ne se précise pas en disant ce
qu'il y avait dans l'assiette), `status = unknown` (une ligne déjà `met` a sa
réponse — la précision arriverait trop tard), polarité `do`/`avoid`
(`capture` n'attend aucune conformité).

`planLines` est `today`, **pas** `today + week` : une ligne hebdomadaire est
ouverte tous les jours de la semaine, donc elle n'est jamais une raison de
questionner CE repas-là.

**Ce qu'un test a corrigé dans le produit.** Le premier jet laissait une ligne
`olive_oil` motiver l'axe `accompaniment` — c'est-à-dire « et avec quoi ? » à
quelqu'un dont le protocole parle de matière grasse. Personne ne répond « de
l'huile d'olive » à cette question. Les groupes sensibles à la préparation sont
donc exclus de la poche accompagnement, et la ligne motive l'axe qui sait la
poser. Le test a mordu avant l'écriture d'une ligne de production.

**La ligne rouge, structurellement.** Le texte des questions est en gabarits
FERMÉS, pas en génération. Un test passe chaque gabarit rendu au crible d'un
lexique de quantité FR+EN (`how much`, `combien`, `portion`, `grammes`…),
vérifie qu'il finit par `?` et qu'il n'en porte **qu'un**. Une garde sur ses
propres constantes est exacte par construction ; un prompt ne l'est jamais.

```
deno test _shared/keel/meal_precision_test.ts → 33 passed | 0 failed
```

---

## 2026-08-04 — P2. Le plafond

Table `meal_precision_questions` (migration `20260804170000`), une ligne par
question RÉELLEMENT posée. Deux usages : le plafond du jour (`count(*)` par
`user_id` + `local_date`, max 2, **photo et texte confondus**) et la trace
d'audit du texte posé.

**Une table, pas un compteur.** Une mémoire de tour repart de zéro à chaque
message : elle ne plafonne rien. Une colonne `questions_asked_today` demanderait
une remise à zéro à minuit — un cron, un fuseau, et la famille de bugs nocturnes
déjà payée ici. Une ligne portant sa `local_date` n'a rien à remettre à zéro.

**Fail-closed à la lecture.** Lecture en échec ⇒ plafond ATTEINT. Le pire cas
d'un fail-closed est une question qu'on ne pose pas ; le pire cas de l'inverse
est un élève à huit questions par jour parce que Postgres bégayait.

**La migration vérifie ses propres gardes**, en rejouant le geste :
`has_table_privilege('anon', …)` (les default privileges Supabase accordent à
`anon` **directement**, pas via `public` — un `revoke from public` seul ne prouve
rien), puis un vrai INSERT en double annulé ensuite pour prouver que
l'idempotence mord.

```
$ docker exec … psql -f 20260804170000_meal_precision_questions.sql
NOTICE:  meal_precision_questions: RLS et idempotence vérifiées par de vrais gestes
deno test _shared/keel/meal_precision_cap_test.ts → 9 passed | 0 failed
```

FK vérifiées en base : `user_id` → `cascade` (une suppression de compte emporte
les lignes), `protocol_event_id` → `set null` (purger un repas ne rend pas ses
questions à l'élève).

---

## 2026-08-04 — P3/P4. Un mécanisme, deux entrées

`meal_photo_*` → `meal_precision_*` (git mv, historique préservé). La machine à
états est la même ; seule la SOURCE de l'incertitude change.

Ce que la généralisation a apporté, concrètement :

- **`eventIds` au pluriel.** Une déclaration textuelle écrit une ligne par
  composant. Un flow qui n'en retenait qu'une amendait la moitié du repas.
- **`componentKeys`.** Les identités déjà écrites sont **interdites à l'intake**
  quand l'élève répond. C'est le seul point où ce doublon-là peut encore être
  évité : la clé d'idempotence est `<message>#<identité>`, et le message de
  RÉPONSE n'est pas celui de la DÉCLARATION — l'index unique ne peut rien voir.
- **`allowsNewComponents`.** Une RÉPONSE peut ajouter (« avec du riz » est un
  fait que le coach doit compter, l'enfouir dans un jsonb le rendrait invisible à
  l'évaluateur) ; une CORRECTION ne le peut pas (elle remplace).
- **`precision_answer_to`** dans `recognized` : le lien vers le repas d'origine,
  lisible, plutôt que déduit d'une proximité d'horodatage.
- **`protocolEventComponentKey` déplacée dans `_shared`** : la photo en a besoin
  et une fonction edge ne peut importer que `_shared`. Deux copies de cette règle
  auraient divergé en silence — ni erreur ni log, juste un doublon de temps en
  temps.

**Où la question sort.** Pas par le renderer du tool : `mergeDirectEffectRuntimeIntoVisibleRuntime`
pose `content: visibleContent`, donc cette reply est JETÉE dès qu'un runtime
visible existe. Pas par le composeur non plus : une question générée peut
demander une quantité. Elle sort par une **ceinture de rendu** dans
`finalVisibleText`, qui reçoit `keel` en paramètre OBLIGATOIRE sur les six
chemins de sortie — le compilateur refuse d'en oublier un.

**Anti-interrogatoire, et il fail-safe :** si le composeur a déjà posé une
question, la nôtre est ABANDONNÉE. On perd une précision ; on ne perd pas
l'élève.

```
deno test _shared/ sophia-brain/ → 2821 passed | 0 failed
```

---

## 2026-08-04 — Le test de doctrine, contre une vraie base

« Une réponse à une question de précision n'écrit jamais un repas en double. »
`select count(*) from protocol_events` avant/après, sur le même repas.

```
deno test sophia-brain/router/meal_precision_int_test.ts → 3 passed | 0 failed
  · déclaration « poulet »          → +1 ligne
  · réponse « poulet + riz »        → +1 ligne  (le riz seul ; PAS un 2e poulet)
  · la ligne ajoutée porte recognized.precision_answer_to = <ligne d'origine>
  · une réponse qui ne dit rien de neuf → status ignored, reply null, 0 écriture,
    et le ledger porte quand même `components_already_logged`
  · plafond partagé photo+texte, et le rejeu refusé par le schéma (23505)
```

---

## 2026-08-04 — ÉPREUVE DE RÉEL : deux clobbers que 2821 tests ne voyaient pas

Run contre la stack locale et un vrai modèle. Le premier run a trouvé ce qu'aucun
test unitaire ne pouvait voir.

**RED 1 — le flow ouvert disparaissait.** La question partait, la place du
plafond était consommée, et `temp_memory` ne portait AUCUN flow au tour suivant.
Cause : `tempMemory = cleanupLegacyRuntimeState(agentOut.tempMemory ?? tempMemory)`
— le companion RECONSTRUIT `temp_memory` depuis l'état PRÉ-routing. Tout ce que
le tour pose est effacé à la persistance. Classe `p1-session-style-commitments`.

**RED 2 — le flow fermé réapparaissait ouvert**, `turns` figé à 0. Même cause,
sens inverse : c'est l'EFFACEMENT qui était annulé. Conséquence : le flow ne
pouvait plus jamais atteindre son max-tours et ne se fermait qu'au timeout de
30 minutes, pendant lesquelles chaque phrase de l'élève devenait un amendement.
**Ce défaut-là précède ce chantier** — la lane photo l'avait déjà, sans que rien
ne le montre.

Remède : le remède idiomatique du dépôt — mémoriser, RÉ-APPLIQUER après
génération, au même endroit que `installSessionStyleCommitment`.

Run réel après correctif :

```
T1 « I had chicken for lunch »
   → « Noted: protein at lunch is covered.
       And what did you have with it? »
   → protocol_events: 1 ligne  poultry | slot=lunch
   → meal_precision_questions: 1 ligne  [text/accompaniment]
   → flow persisté, eventIds=[…], componentKeys=["food_group:poultry"]

T2 « with rice »
   → recognized = {"amendments":[{"kind":"answer","student_text":"with rice"}],
                   "student_amended":true}
   → protocol_events: TOUJOURS 1 ligne
   → flow: undefined  (fermé)
```

**FR, même chaîne, même résultat** : « j'ai mangé du poulet à midi » → question
posée ; « avec du riz » → amendement, toujours 1 ligne, flow fermé.

**CONTRE-FACTUEL** (protocole du jour SANS ligne légume, donc rien ne dépend de
la réponse) — 3 essais :

```
essai 1 : protocol_events 1 ligne | meal_precision_questions 0   ← la garde mord
essai 2 : protocol_events 0 ligne | meal_precision_questions 0
essai 3 : protocol_events 1 ligne | meal_precision_questions 0   ← la garde mord
```

Même message, même code, protocole différent ⇒ décision différente. C'est la
règle de mise, éprouvée hors du test qui l'a écrite.

**Bruit mesuré, et il est à dire :** le dispatcher est stochastique. Sur 5 runs
du même message, 3 ont émis l'effet `log_protocol_event` et 2 n'ont rien émis.
Les runs sans effet ne prouvent rien sur ce chantier (le gate rend
`no_committed_fact`, ce qui est correct) ; ils disent juste que la mesure demande
plusieurs essais. Aucun run n'a produit de doublon.

---

## 2026-08-05 — LE CHANTIER A CHANGÉ D'OBJET : le plan de repas

Ce qui suit ne relève plus de la précision de repas. C'est consigné ici parce
que c'est la suite directe de la même conversation, et qu'un journal qui
s'arrête au milieu d'une nuit ne sert à personne.

### La découverte qui a tout réorienté

`generate-meal-v1` **existait, complet, avec ZÉRO appelant**. Modes
`from_pantry` / `to_shop`, portées `day` / `several_days`, les quatre créneaux,
le garde-manger, la doctrine publiée, les contraintes de sécurité, la liste de
courses par rayon, le PDF. Écrit, testé, déployable, et rien dans le produit ne
le déclenchait :

```
=== qui APPELLE generate-meal-v1 ? (commentaires retirés) ===
1  frontend/src/edge/coverage-guard.int.test.ts     ← une liste de noms
1  supabase/functions/generate-meal-v1/index.ts     ← lui-même
```

Exactement ce que notait la mémoire du 3 août : « 5 moteurs testés non câblés ».

Pendant ce temps `/app/plan` affichait des LIGNES DE MÉTHODE avec la conviction
du coach citée en italique et un badge « From your coach's method ». Deux
défauts : ce n'est pas ce que l'élève vient chercher, et **la doctrine du coach
était affichée** alors qu'elle doit servir à composer sans être montrée.

### Les écrans ont été échangés

| | avant | après |
|---|---|---|
| `/app/plan` | lignes de méthode + citations de doctrine | **la génération** : plats, ingrédients, jour par jour |
| `/app/meals` | (rien d'atteignable) | **« Meal ideas »** : la bibliothèque du coach |

Vérifié dans le DOM : aucune conviction, aucune clé, aucun badge de méthode sur
les plats. Les convictions restent dans `generated_from.belief_keys` en base
pour l'audit, et le client `api/mealGeneration.ts` **ne recopie même pas**
`honours_belief_keys` — aucun rendu ne peut l'afficher par accident.

### Les défauts mesurés, et ce qui les causait

**Portions énormes.** `people at the table: 1` était dans le prompt, mais rien
ne liait les quantités à ce nombre. Mesuré : « salmon 2 fillets, potatoes 500 g »
pour une personne. Après : « yogurt 200 g, oats 50 g, rice 75 g ».

**Semaine trouée.** `dishCapFor("several_days")` valait 8. L'ancien commentaire
le justifiait — « une semaine de vingt plats est une semaine qu'on abandonne le
mercredi » — et c'était vrai TANT QU'UN PLAT COÛTAIT UNE SESSION DE CUISINE.

**Le plan partait de lundi.** `buildMealPrompt` n'avait aucune notion de date.
Un plan généré le mercredi rendait trois jours déjà passés. Le jour vient
maintenant du fuseau de l'élève, et les jours à remplir sont énumérés.

### Le modèle : préparations, sessions, plats

Le lot était un attribut du PLAT, ce qui forçait les jours couverts à manger le
MÊME plat — quatre bowls poulet-riz-brocoli identiques. Techniquement du batch
cooking, humainement une punition.

Ce qu'on cuisine une fois n'est pas un plat, c'est une **préparation** :

```
PRÉPARATION   ingrédients du lot entier + méthode + portions
SESSION       le jour + le DÉROULÉ (l'ordre des gestes ENTRE les préparations)
PLAT          uses[] → une référence, + ce qu'on ajoute au moment de manger
```

Run réel, contraintes serrées (cuisine mer/dim, 30 min, simple, budget serré) :

```
plats=21  preparations=4  sessions=2
  WED — Turkey chilli + Batch rice
     « Start the rice first, then get the chilli going while the rice cooks… »
  SUN — Roast chicken thighs + Roast vegetables
  Roast chicken → 4 repas DIFFÉRENTS (bowl, wrap, stir-fry, bowl aux légumes)
```

L'ancien modèle `batch` a été retiré : 0 occurrence dans les 21 plats stockés.

### Trois bugs trouvés en mesurant, pas en relisant

1. **La réponse HTTP renvoyait `servingsMade` quand la base stocke
   `servings_made`.** Le lot n'atteignait jamais l'écran. Deux formes pour une
   donnée : aucune erreur, aucun log, juste un champ vide chez le lecteur.
2. **La consigne de batch se perdait dans le prompt système** — deux runs à zéro
   lot. Déplacée près de la demande avec un budget CHIFFRÉ : 0 → 5 lots.
   « Peu de sessions » se négocie, « au plus sept » non.
3. **Les quantités du lot étaient répétées sur chaque jour couvert.**
   `chicken thighs 1,200 g` quatre fois — 4,8 kg à l'œil. Un plat qui puise dans
   une préparation n'affiche plus ni recette ni quantités.

### Les coches, et le mensonge silencieux qu'elles ont révélé

Cocher un repas écrit un FAIT (`protocol_events`, `source='quick_tap'`, poids
0.4). Aucun `food_group_ref`, aucun `substance_ref` : la coche compte pour la
COUVERTURE et ne crédite aucune ligne du plan.

Premier run :

```
decocher: ok — lignes restantes=1, motif=null
```

Succès rapporté, **rien changé**. `protocol_events` n'avait aucune policy
UPDATE, et PostgREST rend 204 sur zéro ligne touchée. La case se serait
décochée à l'écran pendant que le fait continuait de compter chez le coach.

Corrigé par une policy ET un trigger — une policy porte sur des lignes, pas sur
des colonnes : sans le trigger, l'UPDATE ouvrait la réécriture de
`food_group_ref` et `local_date`, c'est-à-dire la fabrication de faits.
Décocher ne supprime pas : `disqualified_reason='food_not_eaten'`.

### Ce que l'élève peut vraiment faire

`CookingCapacityCard` : `cook_days`, `cooking_time_min`, `recipe_difficulty`,
`variety`, `budget_band`. Les deux premières existaient dans
`practical_constraints` **depuis le premier jour du pivot — lues par le
générateur, remplies par personne**.

Lecture défensive : une valeur hors liste est ignorée, pas transmise. Un élève
qui n'a rien rempli reçoit exactement la semaine d'avant.
