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
