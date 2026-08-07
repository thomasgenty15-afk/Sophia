# Journal — chantier CHAT (FF-008 → FF-013 + FF-010)

Branche : `ff-001-quotidien-du-coach`. Tout reste **local** : aucun `db push`,
aucun `functions deploy`, aucun push git.

Convention : chaque lot consigne **début**, **fin**, **verdict des
vérifications**, et **tout écart**. Un échec ne se masque pas.

---

## Lot 0 — lecture et repérage

**Début** : 2026-08-07.

### Ce qui a été lu avant d'écrire

Les sept fiches en entier (`FF-007` gouverne, `FF-008`…`FF-013`), puis le code
qu'elles nomment : `meal_declaration_floor.ts`, `medical_condition_floor.ts`,
`week_review_io.ts`, `restriction_guard.ts`, `student_body_io.ts`,
`daily_recap.ts`, `daily_pulse.ts` + `daily_pulse_io.ts`, `meal_precision.ts`,
`meal_precision_cap.ts`, `household.ts`, `household_portions.ts`,
`sophia-brain/router/run.ts` (planchers ~l. 3569-3746), la chaîne
`tools/always_on/log_protocol_event/` et `declare_deviation/`.

### Écarts constatés entre les fiches et le code — arbitrages

1. **`memberVisibility` (FF-010) n'existe pas.** `_shared/keel/household.ts`
   porte `goalVisibility(kind, viewer, viewed) → 'full' | 'own_only'`, pas
   `memberVisibility(...) → 'full' | 'presence_only'`. La fiche interdit
   d'écrire un `if (kind === 'shared')` local dans le chargeur du chat ;
   l'esprit est donc de s'appuyer sur le module pur existant.
   **Décision** : `memberVisibility` est ajouté à `household.ts` comme la
   primitive, et `goalVisibility` devient un mince adaptateur au-dessus d'elle
   (`presence_only` → `own_only`) — une seule règle, deux noms, aucune seconde
   vérité. Consigné parce que ça touche un module partagé.

2. **Tension `household.ts` ↔ FF-010 R3 sur les portions.** L'en-tête de
   `household.ts` dit que « les consignes de portion restent visibles de tout
   le foyer dans les deux modes » (une consigne de service n'est pas un
   diagnostic). FF-010 R3 et son critère d'acceptation n°4 disent l'inverse
   **pour le chat** : en `shared`, la portion nommée d'autrui n'entre pas dans
   le contexte. **Décision** : FF-010 gouverne le chat (surface distincte de
   l'écran), l'écran n'est pas touché. Le commentaire de `household.ts` est
   complété pour que la divergence soit lisible et non accidentelle.

3. **`planned_deviations` — vérification demandée par FF-009 avant de
   commencer.** La table existe (`20260727090000_keel_p0_commitments.sql`
   l. 450+) et l'en-tête de `tools/always_on/declare_deviation/contract.ts` est
   sans ambiguïté : « FLEX IS DECLARED IN ADVANCE ». Elle retire un jour/créneau
   du **dénominateur** d'adhérence (l'évaluateur émet `not_applicable`), et une
   déclaration rétroactive sur un jour résolu est **refusée**
   (`retroactive_on_resolved_day`).
   FF-009 vise l'inverse : un repas **déjà mangé**, déclaré **après coup**, qui
   ne retire rien d'aucun dénominateur et n'annule aucune coche (R7 de FF-009).
   **Verdict : ce n'est pas un doublon**, et `plan_relation` sur
   `protocol_events` est bien le bon endroit. Aucun arbitrage humain requis.

4. **FF-009 §3 mentionne `unknown` comme troisième valeur** de la relation au
   plan ; §5 dit `as_planned · off_plan · null (inconnu)`. **Décision** : la
   colonne porte `as_planned | off_plan | null`, comme §5 et le modèle de
   `disqualified_reason`. `null` **est** l'inconnu ; pas de jeton `'unknown'`
   en base (il faudrait alors distinguer « inconnu » de « pas encore
   renseigné », distinction qu'aucun lecteur ne sait faire).

**Fin lot 0** : repérage terminé, aucun code écrit.

---
## Lot 1 — FF-008 · Le poids annoncé

**Début** : 2026-08-07 · **Fin** : 2026-08-08 · **Verdict : RÉUSSI.**

### Ce qui a été écrit

| Fichier | Nature |
|---|---|
| `_shared/keel/body_measure_floor.ts` | **neuf** — `detectDeclaredBodyMeasure`, pur |
| `_shared/keel/body_measure_floor_test.ts` | **neuf** — 27 tests, chaque frontière en FR **et** EN |
| `_shared/keel/body_measure_arms_restriction_guard_test.ts` | **neuf** — la preuve bout-à-bout |
| `_shared/keel/week_review_io.ts` | `writeDeclaredBodyMeasure` + `weekStartOfLocalDate` |
| `_shared/keel/restriction_runtime.ts` | le chargeur lit enfin le poids que le pivot écrit |
| `sophia-brain/router/run.ts` | branchement du plancher, à côté de `detectDeclaredMeal` |

### 🔴 LE DÉFAUT TROUVÉ EN CHEMIN — la ceinture était armée sur un coffre vide

FF-008 §1 pose que « le poids est l'entrée n°1 de `restriction_guard.ts` ».
**C'était faux dans le modèle pivot, et pas d'un peu.**

`restriction_runtime.loadWeeklyOutcomeSamples` ne lisait que
`weekly_reviews.outcomes.weight_7d_avg`. Or **personne n'écrit cette clé** dans
le modèle 1:N — le dépôt le documente déjà à trois endroits
(`student_body_io.readMeasure`, `frontend/.../studentProgressWeight.ts`,
l'en-tête de `weekly_flow.weeklyBiofeedbackPayload`), et tous les écrivains
existants alimentent `biofeedback.weight_kg` : le point du dimanche, la carte
des mesures de `/app/plan`. Conséquence : `rapid_weight_loss` — le déclencheur
qui détecte une perte > 1,2 %/semaine sur 14 jours — **ne voyait jamais aucun
poids d'un élève du pivot**, quelle qu'en soit la source.

Brancher seulement le chat sur `outcomes` aurait donné une ceinture qui voit les
poids dits en conversation et pas ceux saisis le dimanche : l'inverse exact de
R7 (« exactement comme s'il venait du dimanche »). Le chargeur lit donc
maintenant `biofeedback.weight_kg` **d'abord**, `outcomes.weight_7d_avg` en
repli — le même ordre de préférence que les trois autres lecteurs du dépôt. Une
seule règle, quatre lecteurs.

**Effet de bord assumé et à surveiller** : des élèves dont les poids du dimanche
étaient jusqu'ici invisibles à la ceinture peuvent désormais lever le plancher.
C'est le comportement voulu, et c'est un changement de volume réel au premier
déploiement.

### Trois écarts par rapport à la lettre du brief, chacun motivé

1. **Le plancher ÉCRIT lui-même, il ne pose pas d'effet sur le frame.** La
   mesure ne va pas dans `protocol_events` mais sur la ligne de semaine ; il n'y
   a donc aucun `effect_type` à demander, et en inventer un forkerait le schéma
   pour une écriture qui a déjà son chemin. R9 (« ne rien faire si le frame
   porte déjà l'effet ») est **vide par construction** : aucun effet du
   dispatcher n'écrit une mesure corporelle. La *place* prescrite est
   respectée — juste après `detectDeclaredMeal`.

2. **Le plancher ré-évalue la ceinture sur le tour.** `loadKeelTurnContext`
   évalue le plancher TCA avant que la mesure n'existe. Sans re-lecture, la
   ceinture ne verrait le poids qu'au tour **suivant** — soit exactement le tour
   où l'élève annonce une perte de 3 %/semaine et reçoit une réponse normale.
   C'est ce que dessine FF-008 §4. La ré-évaluation ne coûte une requête que sur
   les tours qui ont réellement écrit, et elle arrive avant
   `keelRoutingInputs()`.

3. **Une bande d'ambiguïté sur un poids SANS unité** (`IMPLICIT_WEIGHT_ACCEPTED`).
   R6 dit « 165 est 165 lb ou 165 cm, jamais 165 kg ». Le défaut du profil donne
   l'unité mais ne lève pas cette ambiguïté-là : en métrique, « je suis à 172 »
   est bien plus souvent une stature. Au-dessus de 140 (métrique) ou en dessous
   de 90 lb (impérial), un poids **sans unité écrite** est refusé. C'est un
   refus, pas une écriture approximative — l'élève qui pèse 145 kg écrit
   « 145 kg » et est enregistré.

### Vérifications

1. **Unitaires du lot — VERT.** 27 tests `body_measure_floor_test.ts` +
   6 tests `body_measure_arms_restriction_guard_test.ts`. Chaque frontière de
   §7/§8 est jouée **en français et en anglais** : cible, tiers, variation,
   plage, deux nombres, question, négation, hypothèse, passé lointain, bornes,
   unité contradictoire, séparateur décimal.
   La preuve du lot est `BOUT-À-BOUT — un poids annoncé DANS LE CHAT lève le
   plancher` : plancher réel → écriture réelle → chargeur réel → ceinture
   réelle. Seul PostgREST est remplacé, par une table en mémoire **qui applique
   vraiment ses filtres**.

2. **Suite Deno complète `_shared/keel/` + `sophia-brain/`** :
   `2600 passed | 1 failed | 16 ignored`.
   **Le rouge est PRÉEXISTANT, prouvé et non affirmé** :
   `run_keel_conversation_loop_test.ts:166` — « (a) a reported fact writes ONE
   protocol_events row… » attend « Magnesium glycinate » et reçoit « Glycinate
   de magnésium ». C'est un défaut de langue de rendu, sans rapport avec ce lot.
   `mtime` du fichier : **2026-08-06 17:13:04**, antérieur au chantier.
   Rejoué avec mes modifications remisées (`git stash -u`) : **il échoue à
   l'identique**, `10 passed | 1 failed`.

3. **Typecheck** : `deno check sophia-brain/router/run.ts` depuis
   `supabase/functions/` — vert. (Depuis la racine, `deno check` échoue sur
   `npm:@supabase/realtime-js` : il faut le `nodeModulesDir: auto` du
   `deno.json` de `supabase/functions/`.) Aucun changement frontend dans ce lot.

4. **Longueur du contexte assemblé — INCHANGÉE, et c'est vérifiable par
   construction** : ce lot n'ajoute **aucun** bloc de prompt. Il écrit une ligne
   et relit une ceinture. `COMPANION_PROMPT_MAX_TOKENS` n'est pas approché d'un
   token de plus qu'avant. La mesure avant/après devient utile aux lots 3, 4 et
   FF-010, qui poussent eux de la matière.

5. **Fixtures `chat_`** : aucune créée — les tests sont en mémoire.

### ⚠️ Incident d'outillage à ne pas reproduire

`git stash -u` (preuve du rouge préexistant) a **remisé aussi le travail en
cours d'une autre session** sur ce dépôt : `eating_rhythm_*`,
`frontend/e2e/eating-rhythm.e2e.spec.ts`,
`supabase/migrations/20260808040000_eating_rhythm_size.sql`. Le `pop` a tout
rendu proprement, rien n'est perdu — mais la fenêtre était réelle.
**Pour les lots suivants, la preuve d'antériorité se fait sans toucher à l'index
global** : mise de côté des seuls fichiers du lot, jamais un `stash -u` nu.
Corollaire pour les commits : `git add` **explicite, fichier par fichier**,
jamais `git add -A`.

### Observation reportée, hors périmètre

`weekly_flow_io.hasAnsweredWeek` teste `bio.source === "whatsapp_flow"` alors
que le seul écrivain écrit `in_app_weekly_form` / `in_app_measures_card`. La
garde « a-t-il déjà répondu cette semaine ? » est donc toujours fausse. Sans
rapport avec ce chantier, non corrigé, **signalé**. (Le `source: 'chat'` de
FF-008 ne l'aggrave pas : une mesure dite en conversation n'est légitimement pas
un formulaire rempli.)

---
## Lot 2 — FF-009 · Le repas hors plan

**Début** : 2026-08-08 · **Fin** : 2026-08-08 · **Verdict : RÉUSSI.**

### Arbitrage préalable demandé par la fiche — `planned_deviations`

Fait, et le verdict est **ce n'est pas un doublon**. Détail au lot 0 §3 :
`planned_deviations` est un flex déclaré **à l'avance** qui retire un
jour/créneau du **dénominateur** d'adhérence, et son écriture rétroactive sur un
jour résolu est refusée par contrat (`retroactive_on_resolved_day`). FF-009 vise
un repas **déjà mangé**, déclaré **après coup**, qui ne retire rien et n'annule
aucune coche. Aucun arbitrage humain requis.

### Ce qui a été écrit

| Fichier | Nature |
|---|---|
| `migrations/20260808050000_protocol_event_plan_relation.sql` | **neuf** — colonne + index partiel + vue coach + 3 contrôles rejoués |
| `_shared/keel/meal_declaration_floor.ts` | `detectOffPlanMarker`, la 3ᵉ porte, 2 corrections de désarme |
| `_shared/keel/meal_declaration_floor_test.ts` | +11 tests FF-009, chacun FR **et** EN |
| `log_protocol_event/{contract,intake,db,executor}.ts` | `plan_relation` de bout en bout, relu et vérifié |
| `sophia-brain/router/run.ts` | le plancher passe la relation |
| `_shared/keel/daily_recap.ts` + `daily_recap_io.ts` | `offPlanCount` — le 3ᵉ compte de la journée |
| `_shared/keel/week_review.ts` + `week_review_io.ts` | `WeekEvidenceSplit` — les 3 comptes de la semaine |
| `frontend/src/keel/lib/weekInFood.ts` + 2 pages | les 3 comptes affichés séparément |
| `frontend/src/keel/api/mealTicks.ts` | la coche écrit `as_planned` |

### Décisions de fond, et pourquoi

1. **`as_planned` n'est JAMAIS écrit par le chat.** Le schéma de FF-009 §4
   annote la branche « composants seuls » d'un `as_planned (comportement
   actuel)`. Appliqué à la lettre, chaque « j'ai mangé du poulet » deviendrait
   un repas *conforme au plan* — alors que la phrase ne dit rien du plan. C'est
   fabriquer de l'adhérence à partir d'un silence : interdit globalement par
   FF-007 (« aucune coche automatique, rien n'est jamais inféré d'un silence »)
   et nommément par R5 de FF-009 pour cette colonne.
   La parenthèse « (comportement actuel) » se lit donc comme « cette branche ne
   change pas », et c'est ce qui est livré : le chat n'écrit que `off_plan`.
   **`as_planned` a un écrivain honnête et un seul** — la coche d'un plat prévu
   (`tickMeal`), où l'élève DÉSIGNE la ligne. Rien n'y est déduit.

2. **`null` reste `null` en base**, pas de jeton `'unknown'` (lot 0 §4).

3. **Aucun bump de `WEEK_REVIEW_FACTS_VERSION`.** Le bloc `evidence` est
   purement additif ; une version neuve rendrait illisibles **tous** les gels
   existants et la conversation perdrait une semaine entière de chiffres
   citables. Le parseur rend `null` — pas des zéros — quand le bloc est absent :
   un gel d'avant la fiche dit « je ne sais pas comment cette semaine se
   répartissait », et aucune surface n'imprime un zéro qu'elle n'a pas compté.

### 🔴 Deux désarmes préexistants corrigés — les deux mordaient à tort

1. **`chez ma mère` était traité comme un tiers.** Le désarme « quelqu'un
   d'autre » (`/(mon|ma|mes) (…|mere|…)/`) attrapait « j'ai mangé chez ma mère
   hier soir » — alors que c'est l'élève qui a mangé, et que sa mère est
   l'adresse. C'est très exactement le hors-plan le plus courant de la fiche.
   Corrigé par une négation en tête (`(?<!chez )` en FR, `(?<!at )` en EN) : la
   distinction est structurelle, pas heuristique — après « chez »/« at », un
   proche est un **lieu**. La contre-épreuve est testée : « ma mère a mangé du
   poulet » désarme toujours, dans les deux langues.

2. **`chez` était un marqueur hors-plan trop large.** Première écriture du
   marqueur : `(j ai|on a) (mange|…) (au|a la|chez|dehors)`. Il mordait sur
   « j'ai mangé **chez moi** » — le contraire d'un hors-plan, et la frontière
   que la fiche nomme explicitement. Remplacé par une exclusion
   (`chez (?!moi\b|nous\b)`) plutôt qu'une liste de proches : une liste se
   serait fait déborder au premier « chez ma tante ».

**Ces deux-là ne sont pas des détails de lexique** : le premier existait avant
ce lot et rendait un hors-plan sur deux invisible ; le second, non corrigé,
aurait marqué hors-plan des repas cuisinés à la maison — soit l'exact
contre-mesure de §10 (« déplacer une étiquette au lieu de capter de la vie »).

### Vérifications

1. **Unitaires du lot — VERT.** `meal_declaration_floor_test.ts` : 25 tests,
   dont 11 neufs FF-009, **tous joués FR et EN** — marqueur seul sans aliment,
   marqueur + aliments, absence de marqueur (`null`, jamais `as_planned`),
   intention future, commande pour les enfants, `chez ma mère` vs `chez moi`,
   `on est sortis` ambigu, marqueur de lieu seul, question, marqueur journalisé,
   et les deux contre-épreuves des désarmes corrigés.
   `log_protocol_event/` : 52 tests verts.
   `daily_recap` + `week_review` : 79 verts.

2. **Migration appliquée LOCALEMENT** par
   `docker exec supabase_db_Sophia_2 psql`, version enregistrée dans
   `supabase_migrations.schema_migrations`. **Aucun `db reset`, aucun
   `db push`.** Les trois contrôles finaux **rejouent le geste** et sont passés :
   le CHECK refuse `'cheat_meal'`, une ligne neuve porte bien `NULL`, et
   `coach_student_events` a **gardé** `security_invoker=off` après le
   `create or replace view` — vérifié dans `pg_class.reloptions`, pas dans le
   texte de la vue. Les lignes de contrôle sont annulées (relu : 0 ligne).

3. **Suite Deno complète** : `2613 passed | 1 failed | 16 ignored`.
   Le rouge est **le même qu'au lot 1**, préexistant et déjà prouvé par
   remisage (`run_keel_conversation_loop_test.ts:166`, langue de rendu).
   **Zéro rouge nouveau** ; +13 tests par rapport au lot 1.

4. **Frontend** : `npx tsc -b` (depuis `frontend/`, c'est `tsconfig.app.json`
   qui travaille) — vert. `npx vitest run` : **508 passed | 20 skipped**, zéro
   échec.

5. **Longueur du contexte assemblé** : +2 lignes dans `describeDayFacts`, qui
   n'alimente **que** le prompt du **message du soir**
   (`buildRecapSystemPrompt`), pas le compagnon. Mesuré : le bloc de faits passe
   de 4 à 6 lignes, **≈ +43 tokens**, sur un prompt du soir dont le plafond
   n'est pas `COMPANION_PROMPT_MAX_TOKENS`. **Le prompt du compagnon est
   inchangé, à l'octet près** — ce lot n'y ajoute rien.

6. **Fixtures `chat_`** : aucune. Les contrôles SQL sont annulés dans leur
   sous-transaction, vérifié par relecture.

### Deux fixtures de test corrigées, et pourquoi c'était nécessaire

`daily_recap_test.ts :: facts()` ne renseignait pas `offPlanCount` : sous
`--no-check`, `allowedNumbers` recevait donc `undefined` et le mettait dans
l'ensemble des nombres autorisés — une ceinture qui accepte `undefined` accepte
ensuite n'importe quoi. La fixture décrit maintenant une journée **complète**, et
les deux assertions `new Set([2, 4, 1])` deviennent `new Set([2, 4, 1, 0])` : le
`0` est celui du hors-plan, et zéro est un fait de la journée comme un autre.

---
## Lot 3 — FF-013 · Lire au lieu de redemander

**Début** : 2026-08-08 · **Fin** : 2026-08-08 · **Verdict : RÉUSSI.**

### Ce que le repérage a changé au périmètre

Les **six axes du dimanche étaient déjà dans le prompt**. `loadKeelTurnContext`
charge `loadLatestWeekReview`, qui rend `biofeedback`, et
`weekReviewPromptBlock(reading, biofeedback)` l'écrit
(« WHAT THEY RATED THEMSELVES, 1 to 5: … »). La moitié manquante était donc
plus étroite que la fiche ne le laisse croire : **le tap du soir**
(`student_daily_checkins`), qui n'était lu nulle part dans `sophia-brain`, **et
l'interdiction de demander**, qui n'existait pas du tout.

### Ce qui a été écrit

| Fichier | Nature |
|---|---|
| `_shared/keel/daily_pulse_io.ts` | `loadLatestPulse` + `PULSE_CITABLE_LOOKBACK_DAYS` |
| `_shared/keel/daily_pulse.ts` | `pulseContextBlock` — la matière **puis** l'interdiction |
| `_shared/keel/daily_pulse_context_test.ts` | **neuf** — 16 tests, les deux moitiés |
| `sophia-brain/router/run.ts` | `daily_pulse` sur le contexte de tour + injection |

### Décisions

1. **L'ordre est le sujet, et il est respecté dans le code.** Le bloc écrit
   d'abord ce qu'on SAIT, ensuite l'interdiction. §4 de la fiche : « un agent
   qui ignore une donnée la redemandera, quelle que soit la consigne ».

2. **Le bloc est poussé même SANS tap.** Sans matière, sa moitié utile est
   l'interdiction — précisément ce qui compte le plus quand l'agent ne sait
   rien. Il ne dit jamais « il n'a rien tapé » : il dit qu'on ne sait pas, et
   qu'un silence n'est pas une bonne journée. (La leçon de
   `NO_COACH_METHOD_BLOCK`, dont le titre ressortait mot pour mot.)

3. **Fenêtre de fraîcheur : 7 jours** — la question ouverte de §11, tranchée et
   écrite. Le tap est un geste quotidien : au-delà d'une semaine il ne décrit
   plus la période dont l'élève parle, et le citer donnerait à l'agent l'air de
   **mal lire** plutôt que de ne pas savoir — la contre-mesure nommée en §10.
   En deçà, il est citable **toujours avec sa date** (R3), sans exception.

4. **Le filtre de restriction est au CHARGEMENT**, pas à la rédaction : sous
   plancher levé, `daily_pulse` vaut `null` et le bloc ne porte que son
   interdiction. Il n'y a rien à ne pas dire, parce que rien n'est là.
   `restriction === null` (lecture en panne) ne ferme pas la porte — même
   arbitrage fail-open **nommé** que le plancher lui-même.

5. **Placé après le bilan hebdo**, exprès : le bloc renvoie vers les six notes
   du dimanche (« elles sont plus haut »), donc il doit les suivre ; et c'est
   le moins cher des six à perdre par la queue — son absence rouvre une
   question de trop, pas une assiette.

### Vérifications

1. **Unitaires du lot — VERT.** 16 tests, les deux directions à chaque fois :
   ce qui doit être là (niveau, axe, **date toujours**) et ce qui ne doit jamais
   l'être (moyenne, tendance, série, « il n'a rien tapé », un axe inventé sur un
   tap sans axe). Le chargeur est testé sur le tap le plus récent, la fenêtre
   bornée, la panne (`null`, jamais une journée calme), un niveau hors
   vocabulaire (refusé, jamais coercé) et l'absence de date locale.

2. **Suite Deno complète** : `2629 passed | 1 failed | 16 ignored`.
   Même rouge préexistant qu'aux lots 1 et 2, déjà prouvé par remisage.
   **Zéro rouge nouveau** ; +16 tests.

3. **Frontend** : non touché par ce lot.

4. **📏 LONGUEUR DU CONTEXTE ASSEMBLÉ — mesurée, avant/après.**

   | | chars | ≈ tokens | part du budget compagnon |
   |---|---|---|---|
   | avant ce lot | — | — | 0 |
   | bloc avec tap + renvoi aux axes (pire cas) | **1 160** | **290** | **3,62 %** |
   | bloc sans aucune matière | 936 | 234 | 2,93 % |

   `COMPANION_PROMPT_MAX_TOKENS = 8000`, soit 32 000 caractères, et la
   troncature coupe **par la queue**. Le bloc est **borné par construction** —
   un seul tap cité, jamais une liste — et un test le pinne sous 1 400
   caractères. Le bloc doctrine reste très loin de la queue.
   **Cumul à surveiller au lot 4 et à FF-010** : les trois poussent dans le
   même budget.

5. **Fixtures `chat_`** : aucune. Tests en mémoire.

### Observation reportée, hors périmètre

`weekReviewPromptBlock` est injecté **sans filtre de restriction** : sous
plancher levé, le bloc du bilan hebdo entre quand même dans le prompt avec ses
comptes de repas, ses assiettes et sa vivabilité. Le tour route certes vers
`disordered_eating_guard`, qui porte sa propre ceinture anti-chiffres — donc le
risque est couvert en aval, pas à la source. FF-013 exige le filtre au
chargement pour **sa** matière, ce qui est fait ; étendre la règle au bilan
hebdo est un changement de comportement d'un autre lot. **Signalé, non corrigé.**

---
## Lot 4 — FF-011 · Le soutien groundé

**Début** : 2026-08-08 · **Fin** : 2026-08-08 · **Verdict : RÉUSSI.**

### Ce qui a été écrit

| Fichier | Nature |
|---|---|
| `_shared/keel/grounded_support.ts` | **neuf** — détection, matière, ceinture |
| `_shared/keel/grounded_support_test.ts` | **neuf** — 20 tests, FR **et** EN, deux directions |
| `sophia-brain/router/run.ts` | `day_facts` + `support_ground` sur le tour, bloc injecté, ceinture dans `finalVisibleText` |

### Aucune seconde liste de motifs — c'est le no-go n°1 de la fiche

`VERDICT_PATTERNS`, `findQualifyingVerdict`, `allowedNumbers`, `numberValue`,
`NUMBER_WORDS` et `allowedWeekNumbers` sont **importés**, jamais recopiés. Le
soir, l'hebdo et le chat partagent une seule règle produit. Un test le prouve
par le comportement le plus fin de la liste partagée : « a good source of
protein » **passe** (c'est de la nutrition, pas un bulletin), alors que
« well done » mord — la condition de désarmement voyage avec les motifs.

Et le test que la cicatrice du dépôt exige : **« Bien joué, » avec la virgule
mord**. En JS, `\b` se calcule sur l'ASCII et « é » n'en est pas ; le motif
existait, n'était testé nulle part, et laissait passer la formule la plus
courante.

### Décisions

1. **La ceinture ne s'arme que sur un tour de découragement**, reconnu
   déterministiquement par une liste fermée FR+EN. §3 de la fiche le demande
   (« sur les tours de détresse ou de découragement »), et mordre partout
   refuserait des réponses correctes : le repli deviendrait le cas nominal en
   silence — « un composeur mort déguisé en composeur prudent ». La
   contre-épreuve est testée : sept tours ordinaires FR/EN n'arment rien.

2. **Elle réécrit PHRASE PAR PHRASE** (R8). Refuser le tour entier sur une
   formule de trop remplacerait une réponse utile par un repli. On retire la
   phrase fautive, on garde la partie groundée — testé : « You ticked 2 dishes
   today. Well done! » devient « You ticked 2 dishes today. »

3. **Quand tout est retiré, un texte déterministe sort**, jamais un silence :
   « Je préfère ne rien affirmer que je ne puisse pas appuyer sur un fait. » /
   « I'd rather not claim anything I can't back with a fact. » Sec par
   construction : pas de consolation, pas de question, pas de chiffre.

4. **Les nombres du bilan hebdo sont autorisés.** Ils sont **dans le prompt** :
   les refuser ferait replier une réponse parfaitement exacte, et la voix du
   coach disparaîtrait sans qu'une seule erreur n'apparaisse nulle part — le
   piège exact que `tickedForPlanCount` documente dans `allowedNumbers`.
   Réunion de `allowedNumbers(dayFacts, null)` et `allowedWeekNumbers(reading)`,
   les deux fonctions existantes.

5. **`day_facts = null` ≠ journée vide.** `null` (« je n'ai pas lu »)
   n'autorise **aucun** nombre de journée : on ne justifie pas un chiffre avec
   des faits qu'on n'a pas lus. Une journée vide autorise ses zéros, qui sont
   des faits. Les deux sont testés.

6. **La crise n'est pas traversée.** La ceinture vit dans le
   `if (!isSafetyRoute(routeDecision))` de `finalVisibleText`, et le
   `disordered_eating_guard` est exclu par le même test que la ceinture
   d'accusé fantôme trois lignes plus haut. `safety_crisis` et le plancher TCA
   gardent leurs chemins, leurs ressources par pays et leurs gardes.

7. **Une seule trace, en observabilité** (§5) : le motif et le passage, jamais
   le contenu du tour — R9 de FF-007, le coach ne lit jamais les conversations,
   et §10 doit rester mesurable sans ça.

### Vérifications

1. **Unitaires du lot — VERT.** 20 tests. Découragement FR (7 formes) et EN
   (7 formes) ; sept tours ordinaires qui n'arment rien ; `supportGround` dans
   ses trois états ; le bloc sans matière qui exige court et sobre ; le bloc
   avec matière qui interdit la somme ; les quatre formules FR interdites et les
   quatre EN ; le chiffre inventé refusé **et** sa condition de désarmement ;
   les nombres du bilan autorisés ; `null` ≠ journée vide ; le repli
   déterministe dans les deux langues ; un aliment qualifiable ; un texte propre
   intact à l'octet près.

2. **Suite Deno complète** : `2649 passed | 1 failed | 16 ignored`.
   Même rouge préexistant, déjà prouvé. **Zéro rouge nouveau** ; +20 tests.

3. **Frontend** : non touché.

4. **📏 LONGUEUR DU CONTEXTE ASSEMBLÉ — mesurée.**

   | bloc | chars | ≈ tokens | part du budget |
   |---|---|---|---|
   | FF-011 avec matière | 967 | 242 | 3,02 % |
   | FF-011 sans matière | 882 | 221 | 2,76 % |

   **Cumul des deux lots qui poussent dans le prompt du compagnon** :
   FF-013 (290 tokens, pire cas) + FF-011 (242) = **532 tokens, soit 6,6 %** des
   8 000. Le bloc doctrine reste très loin de la queue.
   FF-011 est poussé **en dernier**, donc premier à sauter par troncature — et
   c'est le bon rang : sa perte prive l'agent de la matière du jour, mais **la
   ceinture, elle, est déterministe et vit dans `finalVisibleText`**. Elle ne
   dépend d'aucun bloc de prompt. Perdre le bloc dégrade la réponse ; ça ne
   rouvre pas la porte à l'encouragement creux.

5. **Fixtures `chat_`** : aucune.

---
## Lot 5 — FF-012 · La fin de la sollicitation

**Début** : 2026-08-08 · **Fin** : 2026-08-08 · **Verdict : RÉUSSI.**
**En dernier**, comme la fiche l'exige : FF-008 et FF-009 construisent l'accueil
de ce qui est donné spontanément, et ils sont livrés (lots 1 et 2). Retirer la
demande avant eux, c'était perdre la donnée deux fois.

### Ce qui a été écrit

| Fichier | Nature |
|---|---|
| `_shared/keel/meal_precision.ts` | `MEAL_PRECISION_DAILY_CAP` **2 → 1** |
| `sophia-brain/agents/companion.ts` | `ask_now` retiré du vocabulaire, `askAfter` retiré avec lui, bloc réécrit |
| `_shared/keel/daily_pulse.ts` | l'interdiction de **réclamer un repas** |
| `test_harness/keel_properties/no_food_solicitation_property_test.ts` | **neuf** — 7 propriétés |
| deux fichiers de tests existants | mis à jour (voir plus bas) |

### 🔴 CE QUE LE LOT A DÉCOUVERT — le prompt FR du compagnon était à **13
caractères** de son plafond

`companion_prompt_contract_test.ts` pin le corps du prompt système à
**< 13 000 caractères**. Mesuré avant ce lot : **fr-FR = 12 987**, en-GB = 11 141.
La toute première ligne ajoutée l'a fait tomber (13 381).

Ce n'est pas un détail d'outillage : c'est un prompt partagé qui n'a plus de
marge, et le prochain lot qui y ajoutera une règle la découvrira de la même
façon. **Consigné comme trouvaille, pas comme obstacle.**

Ça a changé la conception, et pour le mieux :

- **L'interdiction alimentaire (« ne demande jamais ce qu'il a mangé ») ne vit
  PAS dans le prompt du compagnon.** Ce prompt est **partagé avec la branche
  legacy grand public**, qui n'a pas de repas ; une règle KEEL n'y a rien à
  faire. Elle vit dans le bloc KEEL de FF-013 (`pulseContextBlock`), qui est
  déjà « ce que cette conversation ne demande jamais » et n'est injecté que pour
  un élève.
- **Le bloc de rythme sort plus COURT qu'il n'est entré** — ce qu'un retrait
  devrait toujours faire. Après le lot : **fr-FR = 12 983** (−4), **en-GB =
  11 124** (−17).

### Décisions

1. **`ask_now` disparaît du vocabulaire** (R5). C'est lui qui poussait à poser
   une question *parce qu'on n'en avait pas posé depuis N tours* — la définition
   de la sollicitation, héritée d'un produit d'engagement. `askAfter` est retiré
   avec lui : un seuil laissé sans lecteur est une invitation à le rebrancher.

2. **La RETENUE, elle, survit — et c'est délibéré.** `avoid_now` plafonne
   toujours le nombre de questions dans la fenêtre. Retirer le plafond en même
   temps que la poussée rendrait l'agent **plus** libre de demander : l'inverse
   exact de la fiche. Le compteur ne dit plus « il est temps de demander », il
   dit « tu en as déjà assez demandé ». Un test le pinne dans les deux sens.

3. **La préférence du coach (`question_tendency`) reste lue**, mais s'exprime en
   **plafond** et non plus en cible : « environ 1 question tous les 3 tours »
   était un quota à atteindre ; « max 2 questions / 6 tours » est une retenue.
   Trois tests de contrat protégeaient ce réglage — ils sont mis à jour, pas
   supprimés.

4. **La question de précision n'est PAS supprimée**, elle est plafonnée. Un test
   de propriété le vérifie explicitement : prouver « zéro question jamais »
   prouverait qu'on a supprimé la mauvaise chose.

5. **Effet de bord voulu du plafond 1** : il rend visible le bug de fuseau que
   le plafond 2 masquait (`meal_precision_cap.ts`, motif `missing_local_date`).
   Une deuxième question dans la même journée est désormais le **symptôme** d'un
   fuseau mal résolu.

### Vérifications

1. **LA PREUVE QUI FAIT LE LOT — le test de propriété, VERT.** 7 propriétés,
   pas une relecture :
   - 20 tours ordinaires consécutifs (FR et EN alternés) → **0 demande**, et le
     seul motif rendu est `no_committed_fact` ;
   - 20 tours consécutifs **après** un fait, compteur persistant → **exactement
     1** question sur la journée ;
   - les refus existants (`safety_band`, `future_intent`) tiennent sur les 20 ;
   - pour **chaque** valeur de « tours depuis la dernière question » de 0 à 20,
     dans **les deux langues** : ni le jeton `ask_now`, ni « Ideally ask 1
     useful question », ni « Pose idealement 1 question », ni aucune cible
     chiffrée ;
   - la retenue survit (`avoid_now` atteignable) ;
   - l'interdiction alimentaire est présente **avec et sans matière** ;
   - la question de précision existe toujours.

2. **Suite Deno complète** : `2658 passed | 1 failed | 16 ignored`.
   Même rouge préexistant. **Zéro rouge nouveau** ; +9 tests.

3. **Frontend** : non touché.

4. **📏 LONGUEURS — mesurées, avant/après.**

   | surface | avant | après | Δ |
   |---|---|---|---|
   | prompt système compagnon, corps **fr-FR** | 12 987 | **12 983** | **−4** |
   | prompt système compagnon, corps **en-GB** | 11 141 | **11 124** | **−17** |
   | bloc KEEL `pulseContextBlock` | 1 160 | **1 500** (375 tokens, 4,7 %) | +340 |

   Le prompt **partagé** rétrécit ; la règle KEEL migre dans un bloc KEEL. Cumul
   des blocs de contexte ajoutés par le chantier : FF-013+FF-012 (375 tokens) +
   FF-011 (242) = **617 tokens, 7,7 %** du budget compagnon de 8 000.

5. **Fixtures `chat_`** : aucune.

### Trois tests existants mis à jour, et pourquoi

- `meal_precision_test.ts` : le pin `MEAL_PRECISION_DAILY_CAP === 2` devient
  `=== 1`, et un test neuf couvre le critère textuel de la fiche (« une seconde
  déclaration vague le même jour n'en déclenche aucune »).
- `companion_prompt_contract_test.ts` (×3) : la **cible** devient un **plafond**.
  Le réglage du coach reste lu — c'est ce que ces tests protègent — et une
  assertion neuve vérifie que la formulation « environ 1 question » a bien
  disparu.
- `daily_pulse_context_test.ts` : borne du bloc 1 400 → 1 700, parce que
  l'interdiction alimentaire l'a rejoint. Le pin reste un pin.

---
