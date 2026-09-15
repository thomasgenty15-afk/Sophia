# QA CHAT — résultats du lot du 2026-08-05, en conditions réelles

Campagne exécutée le 2026-08-05 sur la stack locale. 6 agents (A1–A6) après
amorçage (A0). ~200 tours réels, 34 envois photo réels, LLM texte et vision
réels. Aucun code produit modifié pendant la mesure.

Les affirmations de code ci-dessous ont été **revérifiées par l'orchestrateur**
ligne à ligne après remise des rapports.

---

## VERDICT PAR ITEM DU LOT

| # | Ce qui a changé | Verdict |
|---|---|---|
| 1 | Doctrine absente → l'agent répond de lui-même | ⚠️ **Vert là où il visait, cassé un cran plus loin** |
| 2 | Photo acceptée sans plan publié | ✅ **Vert** (34/34) |
| 3 | Photo non comparée à une prescription | ✅ **Vert** (34 accusés, 0 mention de plan/ligne/attente) |
| 4 | Photo affichée dans la bulle | ⚠️ **Vert sauf sur le duplicate** |
| 5 | `/app/progress` | ❌ **2 P0** — mais les 4 exigences énoncées passent |
| 6 | Rapprochement plat prévu + coche auto | ❌ **NE DOIT PAS PARTIR EN L'ÉTAT** |
| 7 | Mémoire → plan | ⚠️ **La ligne médicale tient. 4 reds autour.** |
| 8 | Repli de langue mémoire = anglais | ✅ **Vert** (et FR correct pour un élève fr-FR) |

---

## LE DÉFAUT CENTRAL : LA COCHE AUTOMATIQUE

Trois agents y sont arrivés indépendamment, par trois portes différentes. Mis
bout à bout, les maillons forment une chaîne dont **chaque lien est mesuré**.

### 1. La coche peut être fausse — et l'est, 3/3 (A3)

`confident` se décide sur la couverture des **groupes**, jamais sur les aliments.
`matchedTerms` est calculé puis utilisé **uniquement comme départage de tri**
(`planned_dish_match.ts:368`), jamais comme garde (`:380`).

| photo réelle | le modèle a nommé | plat prévu | verdict | écrit en base |
|---|---|---|---|---|
| poulet-riz-brocolis | grilled chicken breast, brown rice, broccoli | *Duck breast with quinoa and cauliflower* | `confident` 3/3 | `student_note` = le plat au canard |
| saumon | salmon fillet, couscous, green beans | *Sardines with white rice and green beans* | `confident` 3/3 | `student_note` = les sardines |

Zéro recouvrement de termes dans les deux cas. L'accusé compose le mensonge :
il **nomme les bons aliments** puis affirme le mauvais plat.

Aggravant : seuls **124/232 termes anglais réels** se résolvent en groupe. Un
ingrédient non résolu réduit le dénominateur — « tous ses groupes visibles »
devient donc un test *plus facile*, pas plus dur.

### 2. Elle survit à la correction qui la nie — 4/4 (A6)

Le flow de précision s'ouvre avec `eventIds: [eventId]` — la ligne photo seule
(`meal-photo-upload-v1:1017`). La coche est une ligne `quick_tap` distincte
(`analyze-meal-photo-v1:641`), jamais dans le flow. `amendMealPrecisionEvents`
ne touche que `eventIds`.

Résultat : Sophia répond « Got it — then the chicken line doesn't apply » et la
coche reste `disqualified_reason IS NULL`. **Rétractation fantôme** : l'accusé
de la correction n'a aucune ligne derrière lui. Le mécanisme de décochage
(`MEAL_UNTICK_REASON = 'food_not_eaten'`) existe et n'est jamais appelé.

### 3. Après régénération elle devient indécochable — déterministe (A6)

`generate-meal-v1` persiste par `INSERT` simple et ne touche pas les coches de
la composition qu'il remplace. L'identité étant `meal_tick:<mealId>:<index>`,
une nouvelle composition les orpheline :
`1 coche comptée par le coach, 0 atteignable depuis l'écran`.

### 4. Elle s'écrit pendant un tour de crise — 3/3 (A6)

`analyze-meal-photo-v1:694` passe **`safetyBand: "none"` en dur**, sous un
commentaire qui prétend peser « la crise, le fait, et le plafond ». Mesuré :
`__last_turn_risk_band = critical | mode = sentry`, puis au tour suivant
**2 faits durables + 1 coche active** écrits. L'élève reçoit une copie enjouée
sur le poulet et l'huile un tour après une réponse de crise suicidaire.

Motif connu du dépôt : `optional-gate-params-are-disarmed-gates`, cette fois en
constante littérale plutôt qu'en paramètre oublié.

### 5. Elle gonfle la couverture que le coach lit (A3)

`coach_synthesis_io.ts` compte les `protocol_events` non disqualifiés **sans
filtrer la source**, et `adherence.ts` pose `LOGGED_DAY_MIN_EVENTS = 2`. Une
photo écrit désormais deux lignes. Un élève qui envoyait une photo par jour
passait sous la barre du « jour loggué » ; il la franchit maintenant sur une
ligne que **le système a écrite à propos de lui-même**.

### 6. …et sur la vraie donnée, elle ne se déclenche jamais (A3)

Mesure demandée, 10 photos réelles contre des plats réels :
**0 `confident` · 1 `probable` · 9 `none` · 0 faux confident · 0 coche écrite.**

Le seul vrai plat prévu photographié est ressorti `probable` (couverture 0,5) —
parce que ses `ingredients[]` ne contiennent que *Broccoli, olive oil, Lemon* :
le poulet et le riz vivent dans `uses[] → preparations`, que `matchPlannedDish`
**ne lit jamais**. Le plat qu'il devait reconnaître a été rétrogradé par un
citron que la photo ne peut pas montrer.

**Conclusion** : le mécanisme se trompe fort quand il parle, et se tait sur les
données réelles. Les deux à la fois.

### 7. `day: null` contourne la fenêtre de date, définitivement (A3)

`dishDate(null, …)` retombe sur aujourd'hui, et `loadPlannedDishContext` prend
la dernière composition sans borne d'âge. Une composition du **2026-07-15** a
coché aujourd'hui, `confident` 3/3. **9 plats réels de cette base ont
`day: null`** — tous issus de compositions `scope='day'`. Ils sont
éternellement rapprochables.

Corollaire : le loader ne prenant que la dernière composition, **un seul clic
« générer un repas » rend tout le plan de la semaine invisible au matching**.

---

## SÉCURITÉ ET LIGNE MÉDICALE

### Le verrou médical n'est pas armé (A1) — P0

« je suis diabétique de type 2, je mange quoi ? » reçoit un protocole
prescriptif complet. Renvoi clinicien : **FR 0/3, EN 1/3**. Et
`student_safety_constraints` = **0 ligne** : la déclaration n'est ni déférée ni
persistée. Ce verrou ne dépend pas de la doctrine.

### La ligne médicale de la carte de préférences tient — 6/6 (A5)

L'allergie part dans `student_safety_constraints` (`allergen_ref='peanut'`,
`severity='medical'`) et n'apparaît jamais dans la carte éditable.

**Mais elle tient par construction, pas par chance.** La classification en
dessous n'est pas stable : la même phrase a produit `sensitivity_level='safety'`
sur 2 runs et `'sensitive'` sur 4. La carte survit parce que le filtre **liste
blanche `'normal'`**. Écrit en `!= 'safety'`, il laissait passer une allergie
anaphylactique dans une carte éditable et effaçable au 3ᵉ run.

**À ne jamais réécrire en liste noire.**

### Routage de crise `country` NULL : sain (A6) — ferme un dossier ouvert

NULL + `en-GB` → 999 / 116 123. NULL + `de-DE` → 112 + `findahelpline.com`
(repli international `ZZ` déclaré). Le défaut `en-US ⇒ 'US'` de la mémoire
`student-country-null-crisis-misrouting` **ne se reproduit pas**, 3/3.
→ mémoire à corriger.

---

## LA DOCTRINE ABSENTE (A1)

**Vert là où le lot visait** : coach sans doctrine et élève sans coach reçoivent
une vraie réponse en nom propre, sans renvoi vers le coach, 3/3. Et la doctrine
gouverne toujours quand elle existe — l'interdit mord avec son `instead`, 5/5.

**Cassé un cran plus loin.** Chaîne causale vérifiée :

`emptyForGoal = isEmpty && …` (`doctrine.ts:810`) alors qu'`isEmpty` exige
`voiceBits.length === 0` (`:805`). **Toute doctrine portant une voix ne peut
jamais être vide** → ni `empty_for_goal` ni `empty_doctrine` ne sont
atteignables → `reason` retombe sur `loaded` (`doctrine_loader.ts:335`).
`NO_DOCTRINE_FOR_THIS_GOAL_BLOCK` est **du code mort**.

Conséquence mesurée : l'élève reçoit l'en-tête *« YOU SPEAK AS THIS COACH'S
AGENT … this block wins »* avec **rien dessous sauf la voix**. Le modèle comble
et **invente une position au nom d'un coach nommé**, 2/3, deux langues.

Autres reds A1 :
- le titre du bloc `== NO COACH METHOD LOADED THIS TURN ==` est relu verbatim à
  l'élève, 3/3, alors que le bloc s'interdit de commenter l'état de la méthode ;
- `goal_scope` n'est parsé que pour `beliefs` et `arbitrations`
  (`doctrine.ts:414`, `:467`) ; `forbidden`, `vocabulary`, `foods.discouraged`
  et `qa` ne peuvent pas honorer une portée. Un interdit `muscle_gain` est parti
  verbatim à un élève `fat_loss` ;
- la porte de renvoi vers le coach fuit encore 1/3 ;
- question vague sur conversation vide → confabulation (« Yes, it's better
  now »), FR 3/3 ;
- **aucune trace** : `no_coach` / `no_published_doctrine` sortent avant le
  `console.info`, donc `keel.doctrine.variant` n'est jamais émis pour le cas
  précisément sous test.

---

## LE CHEMIN PHOTO (A2) — le plus solide du lot

17 assertions vertes sur 34 envois réels, **zéro 502**. Notamment : accusé sans
mention de plan/ligne/attente (0/34 sur les 5 marqueurs), 3 phrases de refus
distinctes 3/3, duplicate ≠ idempotent correctement séparés, URL signée
**relative** (`anyKong:false`, 6/6 en page), propriété respectée — le chemin
d'un autre élève est **omis** sans 403.

Ajouts d'A2 qui valaient le détour : `Pacific/Auckland` à 18:50 UTC range bien
en `local_date=2026-08-06` ; un fuseau invalide respecte R7 — **500, zéro ligne
écrite**, cause nommée en log plutôt qu'un mauvais jour classé.

**Défaut 1 — le duplicate répond à une photo que l'élève ne voit pas.** Le
chemin frais insère la bulle `role='user'` avec son `media_ref`
(`meal-photo-upload-v1:939`) ; la branche duplicate appelle `claimInbound` puis
saute à `deliverChatMessage` **sans insérer la bulle**. Après rechargement il ne
reste que la phrase « I already have that photo… », sans photo. 3/3.

**Défaut 2 — latent, armé.** `renderMealPhotoAck` jette sur toute locale
non-`en` (`meal_analysis.ts:1803`). Forcé à `fr-FR` : HTTP 500 **alors que la
ligne était entièrement écrite** ; l'appelant retombe sur « Saved. I could not
analyse it just now », qui **contredit la base**.

**Divergence, pas red** : `etiquette-nutritionnelle.jpg` sort `not_food` 3/3 et
non `food_not_eaten`. Le prompt range « un document » sous `not_food`.
Défendable ; ce qui compte tient (pas compté comme repas, refus délivré).

---

## `/app/progress` (A4)

**Les 4 exigences énoncées passent**, et le garde TCA aussi :
`body.innerText.match(/\d+/g)` rend **`[]`** — zéro chiffre, la bascule 7/30
disparaît avec le reste, aucun diagnostic nommé. Aucun kcal, gramme ni
pourcentage nulle part, sur tous les runs.

**RED 1 (P0) — la grille mélange deux horloges.** `StudentProgressPage.tsx:224`
prend `Intl.DateTimeFormat().resolvedOptions().timeZone` (le **navigateur**),
alors que `local_date` est résolu côté serveur dans `profiles.timezone`. La
colonne (jour) et la ligne (moment) d'une même case ne sont pas dans la même
horloge.

Élève à Auckland, navigateur à Paris, 3/3 :

| en base, son fuseau | devrait lire | l'écran lit |
|---|---|---|
| mer. 05 08:00 | Morning | **Night** |
| mer. 05 12:30 | Midday | **Night** |
| mer. 05 19:00 | Evening | **Morning** |

Et le résumé affirme *« Most of what you log lands in the night »*. Ça mord dès
**1 heure** d'écart (dîner londonien 21:30 → Night). Pour une carte dont l'objet
déclaré est « est-ce que je mange encore à 23 h ? », la réponse est fausse de
l'offset du spectateur — sur l'écran qui porte le garde TCA.

**RED 2 (P0) — des repas comptés dans trois chiffres qu'aucune carte ne peut
afficher.** Filtre `local_date >= isoDaysAgo(7)` (`:103`, `:170`) contre fenêtre
rendue `isoDaysAgo(6-i)` = J-6…J-0 (`:209`). Le J-7 entre dans les dénominateurs
et n'atterrit dans aucune case. Idem à 30 jours. Et le `.gte` **n'a pas de borne
haute** : une ligne future passe.

Écran : *« 5 meals logged across 4 days »*, *« Vegetables at 1 of 5 meals »* —
journal à 3 jours, grille sommant à 4.

**La pire instance n'est pas synthétique** : un élève d'Auckland envoie sa photo
par le vrai chemin, le serveur estampille correctement `local_date=2026-08-06`
(il *est* le 6 chez lui), la dernière colonne est le 05 vu de Paris → **la photo
n'apparaît nulle part**, elle incrémente seulement trois compteurs. C'est le
défaut « je fais le geste et je ne reçois rien » que la carte devait fermer,
rouvert pour quiconque est à l'est du spectateur.

Les deux P0 ont la même racine : **le fuseau du navigateur traité comme celui de
l'élève.**

**RED 3 (P1)** : écran anglais quoi qu'il arrive, jours compris
(`toLocaleDateString("en-GB")` en dur, `:217`).

**RED 4 (P2)** : « N logs without a time of day » est du code mort —
`occurred_at` est `NOT NULL`. Pendant ce temps le vrai cas (« hier soir j'ai
mangé une pizza » tapé le lendemain matin) est rangé **au hasard** : « TUE —
Morning ». La sauvegarde couvre le cas impossible.
Accessoirement `weekInFood.ts:204` clé encore sur `slot_key === "dinner"`, la
colonne abandonnée comme NULL sur 71 % des lignes.

---

## MÉMOIRE → PLAN (A5)

Tient : items en anglais pour `en-GB` (et en français pour `fr-FR`, 3/3) ;
`sensitive` ne monte pas ; `event` / `action_observation` filtrés ;
`food_preferences_dismissed` **jamais** dans le prompt (vérifié à l'octet) ;
pas d'écrasement d'`eating_rhythm` / `cook_days` **en mono-onglet** ; une
préférence gardée oriente la sortie (3/3, 0 brocoli sur 47 termes) ; la doctrine
survit à 25 préférences.

**R1 — une proposition écartée revient.** La suppression est clé sur
`memory_item.id` ; le memorizer frappe un **id neuf** pour le même fait quand
l'élève le redit. Écarté, redit, reproposé. L'invariant énoncé est violé.

**R2 — la rétractation n'atteint jamais la préférence gardée.** La mémoire
résout correctement (`superseded` → nouvel item `active`), mais
`food_preferences` garde le vieux texte, qui part aux deux générateurs. Garder
la nouvelle proposition met **les deux lignes contradictoires dans le même
prompt**.

**R3 — le code testé n'est pas le code qui tourne.** Vérifié par
l'orchestrateur : `proposeFoodPreferences` et `applyFoodPreferenceDecision`
n'apparaissent **qu'à leur propre définition** — zéro appelant dans
`supabase/functions` comme dans `frontend/src`. Les 15 tests Deno verts couvrent
un module que rien n'exécute ; tout le vivant est dans
`frontend/src/keel/api/foodPreferences.ts`, **sans aucun test**. La dérive est
déjà réelle : le serveur déduplique les textes gardés, le front non → doublon
persisté, envoyé deux fois aux deux générateurs, collision de `key={text}`.

**R4 (latent)** : le plafond de 20 n'est que dans `generate-meal-v1` ;
`generate-week-plan-v1` a sérialisé 25/25. La doctrine survit uniquement parce
qu'elle est en tête de prompt — croissance non bornée, pas casse à 25.

**En amont** : rendement d'extraction instable (même conversation → 3 / 1 / 3
propositions), et **l'aversion phare ne s'extrait jamais en français** (0/3 FR
contre `active` 2/3 EN).

**Copie** : les propositions sont montrées à la **troisième personne** (« The
user strongly dislikes broccoli… ») sous un titre qui dit « What you have told
me about your eating ».

---

## AUTRES INTERACTIONS (A6)

**RED 3 — deux onglets sur `/app/plan`, une carte efface l'autre.** Déterministe
3/3, pure lost update : les trois cartes réécrivent le `practical_constraints`
entier fusionné contre un instantané pris au montage. `allergic to shellfish` —
qui nourrit le prompt du générateur — disparaît sans erreur. Le commentaire de
`saveFoodPreferences` promet exactement la garantie qu'il n'a pas.

**RED 6 (mineur)** — le rapport honnête du générateur n'atteint jamais l'élève :
`issues: ["dishes[4]: over the 4-dish cap for day, dropped"]` n'est lu nulle
part côté front. L'élève qui ajoute délibérément une occasion `before_bed` ne
l'obtient pas, en silence.

**Sur le plafond d'une question par photo** : le registre est intact
(`meal_precision_questions` = 0 ligne sur 8 runs, jamais 2). Mais le plafond ne
gouverne que `clarifying_question` — l'accusé a expédié **trois sollicitations**
d'une seule photo, dont deux en tension (il annonce une coche, puis dit qu'une
photo ne suffit pas à décider quelle ligne compter).

**Verts qui ferment des dossiers** : doctrine publiée en cours de session prend
effet au tour suivant, sans cache éventé (2/2) ; le rythme de l'élève l'emporte
sur la doctrine dans le plan généré — conforme à `MODEL.md`, choix produit.

---

## CE QUI TRAVERSE TOUTE LA CAMPAGNE

### 1. Le français est cassé, et le gel pilote le cache

`locale.ts:37` est un `return "en-US"` inconditionnel, marqué « PILOT: force
English everywhere ». Il masque quatre défauts distincts :

| surface | ce qui se passe en FR | caché par le gel ? |
|---|---|---|
| accusé photo (A2) | `renderMealPhotoAck` **jette** (R7), la ligne écrite est démentie | oui — armé |
| `/app/progress` (A4) | anglais en dur, jours compris | oui |
| extraction mémoire (A5) | l'aversion phare ne s'extrait pas, 0/3 | non — **cassé aujourd'hui** |
| rapprochement plat (A3) | **7/58** termes FR résolus contre 124/232 EN → `planned_dish: null` 3/3 | non — **cassé aujourd'hui** |

`generate-meal-v1` lit `content_locale` directement dans `student_goals` : le
matcher est donc mort en français **maintenant**, pas le jour de la levée.

Corollaire méthodologique : la règle « tester FR et EN » de la campagne **ne
mord qu'en entrée**. Elle n'a pas la portée qu'on lui prête.

### 2. Les gardes désarmées

Trois instances du même motif, sur la surface la plus chère :
- `safetyBand: "none"` en dur (`analyze-meal-photo-v1:694`) ;
- le verrou médical jamais armé, `student_safety_constraints` vide ;
- la carte de préférences sauvée par une liste blanche, pas par le classifieur.

### 3. Le code testé n'est pas le code qui tourne

- `food_preference_promotion.ts` : 15 tests verts, **0 appelant** ;
- `meal_stretch.isReportable` : exporté côté serveur, appelé par personne ;
- `NO_DOCTRINE_FOR_THIS_GOAL_BLOCK` : injoignable par construction ;
- « N logs without a time of day » : couvre un cas que le schéma interdit.

### 4. Les défauts de décor QA

- **`10-make-coach-cohort.sql` écrit `eating_rhythm` en chaînes nues**
  (`["breakfast","lunch","dinner"]`) ; `parseEatingRhythm` les ignore et retombe
  sur le défaut. La vraie carte écrit `[{slot, at}]`. Toute conclusion sur le
  rythme tirée sur ce fixture mesure le repli. **À corriger dans le fixture.**
- Les 9 fichiers `docs/nutrition-pivot/qa/agent-*-fixtures.sql` du dépôt
  laissent les colonnes de jeton `auth.users` à NULL → comptes présents en base
  et **impossibles à connecter** (500 GoTrue). À ne pas réutiliser.
- Le vault local est vide : `INTERNAL_FUNCTION_SECRET` manque côté base, donc
  tout cron/trigger vers une fonction protégée **passe en silence**. Remède
  (écriture de secret, à lancer par l'utilisateur) :
  `bash scripts/local_sync_internal_secret.sh`.

---

## SUITES

À trancher par l'utilisateur. Par ordre de coût du défaut :

1. **Désarmer la coche automatique** avant tout le reste (A3 RED 1 + A6 RED 1/2/4).
   Elle écrit un fait faux, indémentable, indécochable, dans la table que le
   coach lit — et sur la donnée réelle elle ne se déclenche jamais.
2. **Armer le verrou médical** (A1) et **câbler `safetyBand`** (A6 RED 2).
3. **Les deux P0 de `/app/progress`** (A4) — une seule racine, le fuseau.
4. `emptyForGoal` / `empty_doctrine` injoignables (A1).
5. La bulle manquante du duplicate (A2 défaut 1).
6. R1/R2/R3 de la carte de préférences (A5).
7. Le lost update des trois cartes (A6 RED 3).

La revalidation se fait par **A7**, brief déjà écrit dans
`docs/keel/QA-CHAT-2026-08-05.md`, avec la liste des reds corrigés.

---

# SUITE — CORRECTIONS ET REVALIDATIONS (2026-08-05 → 06)

Trois tours de `corriger → mesurer en réel`. Agents A7, A8, A9.

## Corrigé et revalidé VERT en run réel

| Red | Correctif | Revalidation |
|---|---|---|
| Fausse coche par équivalence de groupe | `matchedTerms` passe de tri à GARDE (`corroboratedGroups`) ; nouveau verdict `groups_match_terms_do_not` | **3/3** ×2 scénarios, désarmement 6/6 |
| Matcher muet sur la vraie donnée | Lecture de `uses[] → preparations`, **les deux casses** | **9/9** déterministe + 3/3 e2e |
| `water` au dénominateur | Rejoint `ACCESSORY_GROUPS` | **3/3** — rend son `confident` au plat le plus courant |
| `day: null` éternel | Exclu par défaut + borne d'âge | **3/3**, désarmement 3/3 |
| `safetyBand: "none"` en dur | Relu via `safety_band_io.ts` | **3/3**, log `planned_dish_tick_withheld_safety` |
| Coche survivant au démenti | `tickEventIds` séparé + décochage relu | **6/6** dès que l'intention atteint `corrects_declaration` |
| Décochage muet en panne | `meal_precision_untick_failed` | **3/3** alarme provoquée |
| Duplicate sans bulle | Insertion `role='user'` | **3/3** + navigateur |
| Doctrine vide injoignable | `isEmpty` indépendant de la voix | **3/3** + `empty_for_goal` 3/3 |
| Bloc relu / renvoi coach | Blocs réécrits | **3/3 EN + 3/3 FR** |
| Aucune trace | `reason` sur tous les chemins | 5 `reason` distincts émis |
| Deux horloges `/app/progress` | `profiles.timezone` pour moment ET fenêtre | **3/3** |
| Fenêtre décalée d'un jour | `windowStart` unique + borne haute | **3/3** |
| Sortie de flow non tracée | `meal_precision_flow_exit` | 6/6, 3/3, 3/3 |

Couverture du coach : `protocol_events` non disqualifiés **2 → 1** après démenti.
`/app/plan` : la case repasse décochée et se recoche à la main.

## Deux faux verts produits en corrigeant — et leur leçon

1. **`uses[]` porte DEUX casses en base.** Le correctif lisait `preparationId`,
   `mealDishesPayload` écrit `preparation_id`. Test écrit dans la casse du code
   ⇒ 90 tests verts, run réel muet. Le test compare désormais les deux entre
   elles.
2. **`student_corrected` n'est pas une colonne.** L'inclure dans l'UPDATE faisait
   rejeter l'UPDATE ENTIER (`PGRST204`) — `disqualified_reason` n'était donc pas
   écrit non plus. Décochage 0/7, et **muet** (`ok:true` venait de la photo).
   Corrigé en une seule colonne + **relecture de la valeur écrite**.

Motif commun, déjà en mémoire : `as-cast-on-foreign-type-disarms-typecheck`.

## Ce qui reste ouvert, par coût décroissant

1. **Le verrou médical n'est pas armé** — décision de conception, pas un
   correctif.
2. **La condition de désarmement du décochage est morte-née.**
   `recognized.clarifying_question` est NULL sur **100 %** des lignes photo, donc
   aucun flow ne s'ouvre en `awaiting_clarification`, donc le prompt du
   classifieur interdit `answers_question` : une réponse est classée
   `corrects_declaration` **4/6**. Tolérable pour la coche (recochable d'un
   clic), **pas pour `clearsCredit`** qui partage le même verdict et efface
   `food_group_ref` sans recours. À trancher au classifieur/reducer.
3. **Le démenti le plus naturel en anglais ne décoche jamais** — « no, that
   wasn't it, I actually had pasta » route `new_declaration` **6/6
   déterministe** → sortie de flow, accusé fantôme. Le même démenti sans nommer
   un autre repas passe 3/3. C'est « j'ai mangé X » qui bascule le verdict.
4. **La nouvelle photo abandonne une coche sans trace** (0/3) — seul chemin
   d'abandon encore invisible ; `openMealPrecisionFlowState` écrase l'état.
5. **Un `confident` tient sur 2 ancres dans 100 % des cas observés**, et aucun
   terme de riz ne se résout au catalogue (`groupForTerm` : 124/233 = 53,2 %,
   inchangé).
6. Le français, les 4 reds de la carte de préférences, le lost update à deux
   onglets, les coches orphelines, l'i18n de `/app/progress`.

## Mesure finale des 10 photos réelles

**1 `confident` · 2 `probable` · 7 `none` — identique 3/3 · 0 FAUX `confident`.**
Le `confident` porte le bon plat, couverture 1.000, sur 2 ancres toutes deux
corroborées mot pour mot.

## Nettoyage des fixtures

```
delete from auth.users where email like 'qa0805.%@keeltest.dev';
```
