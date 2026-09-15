# Rapport — LOT A (le moteur), 2026-08-13/14

Branche `ff-001-quotidien-du-coach`. Contrat : `scratchpad/PLAN-ECRAN-DEMANDE-CONTRAT.md`.

**Convention de ce rapport.** Ce qui a été *mesuré* porte la commande ou le chiffre. Ce qui
n'a pas pu l'être est marqué **⚠️ NON VÉRIFIÉ**, et ne se lit pas comme un fait.

---

## 1 · Les commits

| SHA | Message | Fichiers |
|---|---|---|
| `03702e5d` | *le backend ne connaissait que la date, et le jour ajoute n'etait dit par personne* | `local_date.ts`, `plan_hours.ts` **(NEUF)**, `plan_rationale.ts` **(NEUF)**, `plan_rationale_test.ts` **(NEUF)**, `meal_generation.ts` |
| `e06139cd` | *FF-061 etait vert et sans appelant, et l'apercu n'existait pas* | `generate-meal-v1/index.ts`, `generate-household-meal-v1/index.ts` |
| `18fb714e` | *l'heure passee etait comptee deux fois, dont une comme une absence declaree* | `generate-meal-v1/index.ts` |

Le hook `agent-gate` a tourné **avant chacun des trois** et a rendu `pass`.
Aucun `git add -A`, aucun `git stash`, aucun `git checkout --`, aucune commande à risque,
**aucune migration**.

---

## 2 · Le signal S2 (§5.2 du contrat) — VERT

```
git grep -c 'export function explainPlanChoices' -- supabase/functions/_shared/keel/plan_rationale.ts   → 1
git grep -c '"draft"' -- supabase/functions/generate-meal-v1/index.ts \
                          supabase/functions/generate-household-meal-v1/index.ts                        → ≥ 2 (les deux)
```

**⚠️ S1 n'était PAS passé quand ce lot a démarré**, et il ne l'est toujours pas au sens strict :
`git grep -c '"plan.envy.title"' -- frontend/src/keel/i18n/` rend **0**. Lot D a en revanche déjà
landé `planRefusals.ts` (worktree, non commité) avec les deux jetons de §3.4. Lot A ne dépend
d'`en.ts`/`fr.ts` par aucun fichier ; le seul couplage est le jeton de refus, traité en §6.

---

## 3 · Livré

### ① L'heure locale — `_shared/keel/local_date.ts`

- `localMinuteInZone(timezone, now): number` — signature de **§4.2**, minutes depuis minuit,
  **jette** sur fuseau vide ou inconnu (jamais de repli UTC).
- `localHourInZone(timezone, now): number` — **dérivée** de la précédente
  (`Math.floor(min/60)`), pas un second `Intl`.
- `hourCycle: "h23"` et pas `hour12: false` : sur certaines ICU, `hour12: false` rend « 24 » à
  minuit, et « 24 » traverse `Number.isFinite` sans broncher.

**⚠️ La seconde horloge du dépôt n'a PAS été repliée.** `reengagement_io.ts::localHourFor`
(`:98`) fait le même calcul avec la posture **opposée et voulue** (`null` sur fuseau illisible,
« jamais de spam sur une donnée manquante »). `reengagement_io.ts` **n'est dans la colonne
d'aucun lot** (§2.2/§2.3) : je ne l'ai pas ouvert. Le raisonnement est écrit dans l'en-tête de
`localMinuteInZone` pour que la fusion soit faisable sans re-instruire le dossier.

### ② Les trois règles d'heure — `_shared/keel/plan_hours.ts` (NEUF)

**⚠️ FICHIER HORS DU TABLEAU §2.2 — création assumée, et voici pourquoi.** Le contrat ne
prévoyait pas de home pour les règles. `plan_rationale.ts` est déclaré « rend des phrases
finies » ; y mettre de l'arithmétique d'horloge aurait mélangé la décision et sa parole.
`meal_generation.ts` (3 300 l.) les aurait noyées et n'a pas de fichier de test propre dans ma
colonne. Le nom est neuf, il ne collide avec aucun lot (Lot C prend `plan_draft_note.ts`).

Constantes **nommées, changeables en une ligne** :

| Constante | Valeur | Ce qu'elle coupe |
|---|---|---|
| `SHOPPING_CUTOFF_HOUR` | `18` | courses **et** cuisine du jour |
| `SLOT_PASSED_HOUR.breakfast` | `10` | le petit-déjeuner d'aujourd'hui |
| `SLOT_PASSED_HOUR.lunch` | `14` | le déjeuner d'aujourd'hui |
| `SLOT_PASSED_HOUR.dinner` | `21` | le dîner d'aujourd'hui |
| `SLOT_PASSED_HOUR.snack_am / snack_pm / before_bed` | `null` | **ne tombent jamais par l'horloge** — aucune heure de référence n'existe pour eux dans ce dépôt, et en inventer une ferait tomber un grignotage sur une valeur que personne n'a choisie |

Fonctions, **`hourNow` REQUIS et nullable partout** (`assertHourNow` **jette** sur `undefined`,
sur un non-nombre et hors `[0,23]`) :

- `proposedWindowStart({todayLocalDate, hourNow})` → `{startsOn, shifted}`.
  ⚠️ **PROPOSITION D'ÉCRAN, jamais un refus serveur** : rendue dans `suggested_window`, et la
  requête qui arrive est acceptée telle quelle même à 23 h.
- `slotsPassedToday({hourNow, rhythm, declaredHours})` → les moments passés, **premier jour
  seulement** (l'appelant en est responsable, et les deux appelants ne l'appellent que si
  `startsOn === todayDate`).
- `cookingAskedToday({hourNow})` / `firstWindowDayIsCookable({windowStartsOn, todayLocalDate, hourNow})`.
- `rhythmClockFrom(raw)` → lit `eating_rhythm[].at` (`"HH:MM"`, clé legacy, plus écrite depuis
  le 2026-08-07) **quand elle est renseignée** ; sinon les replis ci-dessus. Un `at` illisible
  rend `hour: null` — jamais une heure devinée.
  ⚠️ Ce n'est **pas** une résurrection de `at` comme contrainte de composition :
  `parseEatingRhythm` continue de l'ignorer, et il a raison (« 20:00 » ne dit pas si le dîner
  est gros). Ici on lit une heure pour répondre à une question d'heure.

`hourNow === null` (« je n'ai pas su lire l'horloge ») rend **partout le produit d'hier** :
fenêtre inchangée, aucun créneau retiré, cuisine du jour demandée. Testé.

### ③ `plan_rationale.ts` (NEUF) — la parole de Sophia

Signature **exactement celle de §4.1**, plus **un champ** : `slotsDroppedToday: readonly string[]`.
Il n'était pas au contrat et il est nécessaire : sans lui, un créneau tombé par l'horloge
n'aurait pu se dire qu'à travers `awayInWindow`, c'est-à-dire en **attribuant à l'élève une
absence qu'il n'a pas déclarée**.

Huit familles de phrases, chacune **armée par une prémisse** (fenêtre · fenêtre raccourcie ·
jour de cuisine ajouté et pourquoi · créneaux tombés · absences comptées · bouches · budget et
ce qui a cédé dans l'ordre · main prise · fusion). Déterministe, aucun appel modèle. Porte
finale anti-culpabilisation identique à `gateRequestReport` (porte 4) : on coupe **tout** et on
trace.

**La ligne de fenêtre sort TOUJOURS** dès que la fenêtre est lisible — c'est la demande de
l'utilisateur, mot pour mot (« même si tout va bien, petit texte court »). `nothing_to_explain`
n'est donc **pas** le cas nominal : il ne sort que sur une fenêtre vide ou absurde.

**Un seul calcul du jour ajouté, deux lecteurs.** `addedCookDays()` est désormais **exporté par
`meal_generation.ts`** et appelé par (a) la consigne, (b) l'explication. Recalculer l'ajout côté
explication aurait fini par nommer un autre jour que la consigne — et c'est l'explication qui
aurait eu tort.

### ④ FF-061 câblé — `request_report.ts` / `request_report_gate.ts`

**Aucune ligne de logique changée**, câblage seul, dans **les deux** générateurs, après le parse
et **avant** l'écriture (pour être rendu aussi sur un aperçu).

| Porte | Lane individuelle | Lane foyer |
|---|---|---|
| 1 · plancher TCA | `restrictionFlag` déjà lu (`:1013-1019`), fail-closed | `composedMembers.find(m => m.userId === userId)?.body?.restrictionFlag ?? true` — fail-closed, même arbitrage que l'enveloppe du même fichier |
| 2 · règles de maison | `[]` — **il n'y en a pas sur cette lane**, et `[]` dit « aucune », pas « je n'ai pas su lire » | `householdSplit.houseRuleLabels`, la **même** liste que le verrou de sortie |
| 3 · doctrine | `doctrine.doctrine.forbidden` projeté en `ForbiddenTerm[]` | idem |
| 4 · anti-culpabilisation | dans le module | dans le module |

⚠️ **Deux recopies de trois lignes, assumées et nommées dans le code** :
`findDoctrineViolations` (`doctrine.ts:1088-1099`) et
`household_restriction_lock.ts::termsFrom` (`:68`) n'exportent pas leur projection en
`ForbiddenTerm`, et ni l'un ni l'autre n'est dans ma colonne.

⚠️ `previouslyReportedAbsent: []` — le **rappel d'un plan au suivant** (§2.5 de FF-061) n'est
pas câblé. `[]` est la valeur, pas un oubli ; l'appelant qui le fermera devra relire
`generated_from.request_report` de la ligne antérieure. **Non livré, et dit.**

### ⑤ `intent: "draft"` — les deux générateurs

Spécification §4.3.1 tenue :

- vocabulaire ouvert à `draft` dans les deux `index.ts` ;
- `replaces` **refusé** avec `draft` (`unknown_intent`, 400) — **mesuré en HTTP réel** ;
- `draft` réservé à `operation=compose` côté foyer (`merge`/`unmerge` déplacent des plans
  écrits, et le quota de fusion se prend dans le même chemin) ;
- **le seul saut est `write_student_meal_plan`** ; toutes les gardes amont sont conservées,
  ainsi que le verrou de règles de maison, la réconciliation de portions et le parse ;
- réponse : même charge utile + `draft: true` + `meal: null` ;
- aucun état de brouillon en base ⇒ la contrainte d'exclusion sur les fenêtres vivantes reste
  intacte, rien ne peut rester coincé ;
- `plan_kind: "household"` toujours présent dans le fichier (`household_plan_kind_readers_test.ts:112-125` vert).

### ⑥ La sortie

`rationale: { lines, refusal }` et `request_report: { lines, refusal }` **dans la réponse HTTP**
et dans **`generated_from`** des deux lanes. `suggested_window: { starts_on, shifted }` dans la
réponse seulement (c'est une proposition, pas un fait du plan). **Aucune migration** :
`generated_from` est déjà `jsonb`.

Écrits **même vides, avec leur motif** — une clé absente ne se distingue pas d'un lot débranché.

⚠️ **Les deux blocs ne peuvent pas coûter un dîner.** Ils **jettent** sur un champ manquant
(c'est leur garde, elle est juste), mais l'appel est enveloppé : l'échec pousse
`rationale_unavailable` / `request_report_unavailable` dans `issues` — donc **comptable en SQL
sur la ligne** — et journalise en `console.error`. Ce n'est pas une garde désarmée : la garde
est armée dans le module, et son déclenchement est visible à deux endroits.

---

## 4 · Mesuré

### Les tests

```
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env supabase/functions/_shared/keel/
→ ok | 2916 passed | 0 failed   (2910 avant ce lot, +38 dans plan_rationale_test.ts,
                                 le delta net venant d'ajouts d'une autre lane en vol)

deno check supabase/functions/generate-meal-v1/index.ts                 → Check, 0 erreur
deno check supabase/functions/generate-household-meal-v1/index.ts       → Check, 0 erreur
./scripts/agent-gate.sh (via le hook pre-commit, deux fois)             → pass
```

`plan_rationale_test.ts` : **38 cas**, dont un cas qui **PASSE** (lignes non vides) et
l'**idempotence** (`assertEquals(f(x), f(x))`), comme exigé.

### La preuve de non-régression du prompt — byte à byte contre `HEAD`

Script jetable (scratchpad hors dépôt) qui importe **`buildMealPrompt` de `HEAD`** et celui
d'aujourd'hui, et compare sur **6 formes de fenêtre**, dont le cas fondateur
(`cook_days = sun,wed`, fenêtre `thu→sun`) :

```
CAS 0: byte-identique     tard: DIFFÈRE
CAS 1: byte-identique     tard: identique
CAS 2: byte-identique     tard: identique
CAS 3: byte-identique     tard: identique
CAS 4: byte-identique     tard: identique
CAS 5: byte-identique     tard: DIFFÈRE
OK — aucune dérive à firstDayCookable:true
```

Lecture : **à `firstDayCookable: true` — c'est-à-dire pour tout le monde tant que l'heure ne
mord pas — la consigne est BYTE-IDENTIQUE à celle d'hier**, `systemPrompt` compris. Elle ne
diffère que sur les deux cas où la branche `tooLate` mord ET où la coupure courses est passée.
Le même invariant est épinglé dans `plan_rationale_test.ts` (« PROMPT — sans changement
d'heure, la consigne est byte-identique »), avec la phrase historique en dur.

### Les versions de prompt : **PAS de bump**, et c'est une décision

`MEAL_PROMPT_VERSION` et `HOUSEHOLD_PROMPT_VERSION` sont **inchangées**. Le gabarit n'a pas
bougé d'un octet — la mesure ci-dessus le prouve. Ce qui change est la **valeur** qui remplit
`${first}` (`thu` → `fri`) et l'apparition d'une ligne d'absence : des **données**, du même
rang que le budget, les jours de cuisine ou les absences, qui varient déjà par élève sans bump.
Bumper aurait réétiqueté **tous** les plans, y compris ceux dont la consigne n'a pas bougé.

⚠️ **C'est un arbitrage, pas un fait.** Il existe bien une population qui voit une consigne
différente (heure ≥ 18 h **et** branche `tooLate`). Ce qu'elle a vu est relisible autrement, et
mieux : `generated_from.rationale` **nomme le jour ajouté** sur chaque ligne. Si quelqu'un
préfère le bump, la ligne à changer est `meal_generation.ts::MEAL_PROMPT_VERSION`.

### Le run réel — les gardes, et le cas fondateur reproduit à 9 h

Pile locale, persona `qa0805.a11b.s1` (`1eda8697-…`), runtime edge redémarré, timeout Kong
étendu à 600 s. Le backend lit l'heure du **fuseau de l'élève** : on déplace donc le fuseau en
base plutôt que l'horloge de la machine.

#### Ce qui a été mesuré à **9 h 57 locales** (`Pacific/Noumea`, UTC 22:57)

Corps envoyé :
`{"mode":"to_shop","intent":"draft","window":{"kind":"until_sunday"},"preferences":"des burgers et du poisson"}`

```
ok=True  draft=True  meal=None
window            = {starts_on: 2026-08-14, duration_days: 3}
suggested_window  = {starts_on: 2026-08-14, shifted: null}
rationale.lines   = [
  "This plan covers 3 days, starting today.",
  "A session is set for Friday: you cook on Sunday and Wednesday, and nothing
   cooked then can feed the days before it. It is a day you did not ask for.",
  "The shopping budget is 90.",
  "To stay inside it, expensive proteins give first, then out-of-season produce,
   then variety — never the portions." ]
request_report    = [
  "You asked for burgers: it's on Friday, Saturday and Sunday.",
  "You asked for poisson: there isn't any this time." ]
cooking_sessions  = ['fri', 'sun']
```

**C'est exactement le défaut d'origine, reproduit et cette fois expliqué.** Jours déclarés
`sun, wed`, plan composé un **vendredi**, session posée le **vendredi** — un jour non coché. La
phrase le dit, nomme la raison, et **nomme le même jour que le plan** (`cooking_sessions`
commence par `fri`). C'est la garantie que `addedCookDays()` partagé achète.

`meal: null` et **`select count(*) from student_generated_meals where user_id=…` → `0`** : le
chemin `draft` n'a **rien écrit**, alors que tout le reste (doctrine, plancher, verrous de
sortie, parse, verdict) a tourné.

FF-061 rend son premier compte-rendu de production : « poisson » est cité **dans les mots de
l'élève**, non traduit — c'est sa demande qu'on lui répète, pas la nôtre.

#### Ce qui a été mesuré à **22 h locales** (`Atlantic/Cape_Verde`), corps de requête IDENTIQUE

```
ok=True  draft=True  meal=None
window            = {starts_on: 2026-08-13, duration_days: 4}      ← 9 h: 2026-08-14, 3 jours
suggested_window  = {starts_on: 2026-08-14, shifted: "shopping_cutoff"}   ← 9 h: shifted null
rationale.lines   = [
  "This plan covers 4 days, starting today.",
  "A session is set for Friday: you cook on Sunday and Wednesday, and nothing
   cooked then can feed the days before it. It is a day you did not ask for.",
  "For today, breakfast, lunch and dinner are off the plan: the day is already
   under way.",
  "The shopping budget is 90.",
  "To stay inside it, expensive proteins give first, …" ]
cooking_sessions  = ['fri', 'sun']
plats composés    = fri × 3, sat × 3, sun × 3     ← AUCUN plat le jeudi
```

**C'est la preuve demandée, et elle tient sur les quatre points.**

1. **Le même corps rend deux fenêtres différentes** : `2026-08-14 + 3 j` à 9 h,
   `2026-08-13 + 4 j` à 22 h. Rien d'autre n'a changé que le fuseau de l'élève.
2. **`plan_rationale` LE DIT** : *« For today, breakfast, lunch and dinner are off the plan:
   the day is already under way. »* Cette ligne n'existe pas dans le run de 9 h.
3. **La règle mord jusqu'au bout de la chaîne, pas seulement dans la phrase.** La fenêtre écrite
   couvre bien jeudi, et **il n'y a AUCUN plat le jeudi** dans le plan composé : les trois
   créneaux sont sortis par le mécanisme `AwayDay`, armé des deux côtés (consigne **et**
   parseur). Un test pur n'aurait pas pu montrer ça.
4. **La coupure courses vise le jour SUIVANT** : la session est posée **vendredi**
   (`window[1]`), pas jeudi. À 9 h le même calcul posait le premier jour de la fenêtre. Et la
   phrase nomme le même jour que `cooking_sessions`.

Et **rien n'est un refus** : la fenêtre demandée démarre aujourd'hui, à 22 h, et le serveur
l'accepte. `suggested_window` dit seulement ce qu'on aurait proposé, avec son motif nommé.

⚠️ **Le chemin a été instable, et il faut le savoir.** Plusieurs appels ont rendu
`502 « An invalid response was received from the upstream server »` avant d'aboutir.
`docker events` montre le conteneur `supabase_edge_runtime_Sophia_2` **tué en SIGKILL
(exitCode 137), détruit et recréé** pendant la requête, la fonction étant arrivée jusqu'à
`keel.doctrine.variant`. Le kill touche le **conteneur**, pas la fonction, et précède tout
appel à mon code. Cause probable : une **session parallèle qui redémarre le runtime edge** —
ce que le contrat demande à chaque lot (§6.11). **⚠️ NON VÉRIFIÉ** : l'origine du SIGKILL n'est
pas prouvée. Une boucle de 4 essais a suffi.

#### Ce qui a été mesuré sur les gardes, en HTTP réel

- `{}` → `400 mode_required` — la fonction **boote**, les gardes amont mordent ;
- `intent: "preview"` → `400 unknown_intent`, détail *« intent must be replace_current,
  prepare_next or draft »* — le vocabulaire est bien ouvert à trois ;
- `intent: "draft"` + `replaces` → `400 unknown_intent`, détail *« intent=draft writes nothing,
  so it cannot name a `replaces` »* — la garde de §4.3.1 mord.

Ce qui a **échoué**, et pourquoi : chaque appel qui atteint le modèle rend `502 « An invalid
response was received from the upstream server »` après ~13 s. Les logs montrent que la
fonction va jusqu'à `keel.doctrine.variant` (doctrine chargée) puis s'arrête.
`docker events` montre le conteneur `supabase_edge_runtime_Sophia_2` **tué en SIGKILL
(exitCode 137), détruit et recréé** pendant la requête. Le kill n'est pas déclenché par mon
code — il précède tout appel à `plan_rationale`, et il touche le conteneur, pas la fonction.
Cause probable : une **session parallèle qui redémarre le runtime edge** (le dépôt est partagé,
et le contrat exige ce redémarrage de chaque lot). **⚠️ NON VÉRIFIÉ** : je n'ai pas prouvé
l'origine du SIGKILL.

**La recette, pour la rejouer** — le backend lit l'heure du **fuseau de l'élève**, donc on la
déplace en base plutôt que de toucher l'horloge de la machine :

```bash
# 9 h locales (UTC ≈ 22:5x)          → rien ne tombe, fenêtre = aujourd'hui
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "
  update plan_versions set timezone='Pacific/Noumea' where student_id='1eda8697-d45f-0aa8-c347-38fa10ee3436';
  update profiles      set timezone='Pacific/Noumea' where id='1eda8697-d45f-0aa8-c347-38fa10ee3436';"

# 21 h locales                        → suggested_window = demain, petit-dej + dej + diner tombent
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "
  update plan_versions set timezone='Atlantic/Cape_Verde' where student_id='1eda8697-d45f-0aa8-c347-38fa10ee3436';
  update profiles      set timezone='Atlantic/Cape_Verde' where id='1eda8697-d45f-0aa8-c347-38fa10ee3436';"
```

✅ **Le fuseau d'origine (`Europe/London`) a été REMIS** en fin de session, et vérifié :
`select timezone from profiles where id='1eda8697-…'` → `Europe/London`.
`select count(*) from student_generated_meals where user_id='1eda8697-…'` → **0** : les deux
runs `draft` n'ont écrit aucune ligne.

⚠️ **Ce qui N'A PAS été remis** : `student_goals.practical_constraints` du même persona a reçu
`cook_days: ["sun","wed"]`, `budget_amount: 90`, `cooking_time_min: 45` (il n'en avait aucun).

⚠️ **Fenêtre non chevauchante** : le foyer de test `b9a92acb-…` porte un plan
`2026-08-13 + 7 j`. Toute demande sur ces jours rend `plan_overlaps_existing` — y compris en
`draft`, dont c'est le comportement voulu (les gardes amont sont conservées). La lane foyer se
teste donc sur un autre foyer, ou après le 2026-08-20.

---

## 5 · Resté fermé (et ce que j'ai vu en passant)

- **Aucun fichier frontend ouvert.** Un seul y a été **lu** :
  `frontend/src/keel/copy/planRefusals.ts`, pour comprendre un rouge — jamais écrit.
- `_shared/keel/household_portions.ts` : **pas touché** (Lot D, §2.1 arbitrage n°4).
- `_shared/keel/reengagement_io.ts` : **pas touché** (hors de toute colonne) — voir §3①.
- `_shared/keel/doctrine.ts`, `household_restriction_lock.ts` : **pas touchés** — d'où les deux
  recopies de projection nommées en §3④.
- `daysUntilSunday` / `daysFrom` (`local_date.ts:148`, `:117`) : **ni supprimés ni appelés**,
  conformément à §4.2. La résolution de fenêtre reste `meal_plan_window.ts:235-261`.
- `readWindowRequest` reste **dupliqué** dans les deux `index.ts` (§A.4). Je l'ai laissé, mais
  j'ai bien modifié **les deux** en touchant au vocabulaire d'`intent`.
- **Aucun jeton de refus inventé.** Les deux seuls jetons rendus par ce lot,
  `draft_not_composed` et `unknown_intent`, sont dans §3.4 / dans la liste existante.

---

## 6 · Les rouges — les miens, et ceux qui ne le sont pas

### 6.0 · `agent-gate` a été bloqué une fois par une AUTRE lane

Le troisième commit a d'abord échoué : `npx tsc -b` rendait
`MealBuilder.tsx(306,9): Cannot redeclare block-scoped variable 'composingForHousehold'` —
fichier de **Lot D**, en cours d'édition et non commité. Les 2 925 tests Deno passaient dans le
même run. J'ai **attendu** que la lane referme son édition plutôt que d'utiliser `--no-verify`,
et le commit est passé sans rien contourner. À savoir : sur ce dépôt partagé, le gate d'un lot
dépend de l'état non commité des autres.

### 6.1 · `frontend/src/keel/copy/planRefusals.int.test.ts` — 2 cas rouges

**Aucun des deux n'est apparu avec ce lot ; le premier est passé de 3 orphelins à 1.**

| Cas | État | À qui |
|---|---|---|
| *n'invente aucun jeton que le serveur ne rend pas* | orphelins **avant** ce lot : `draft_not_composed`, `note_unusable`, (+ `empty_meal` transitoirement pendant l'itération). **Après** : `note_unusable` seul | **Lot C** |
| *ne perd aucun motif au passage de `HouseholdPage` au module partagé* | 7 orphelins `household.error.*` | **pas ce lot** — aucun de ces jetons n'est rendu par mes deux `index.ts` |

`planRefusals.ts:90-105` documente lui-même le choix d'ordre de Lot D : *« ces deux-là sont
posés avant que le serveur ne les rende, et c'est un choix d'ordre, pas un oubli »*. J'ai fermé
`draft_not_composed` en le faisant émettre : sur le chemin `draft`, un plan à zéro plat rend
`draft_not_composed` au lieu d'`empty_meal` — la question de la personne n'est pas « pourquoi
zéro plat » mais « est-ce que ça a cassé mon plan ? », et la copie de §3.4 répond aux deux.

⚠️ **Piège trouvé en le faisant, et il n'était nulle part** :
`planRefusals.int.test.ts` scanne `jsonResponse(req, { error: "…" })` avec un **littéral**.
Écrire `error: isDraft ? "draft_not_composed" : "empty_meal"` a rendu **les deux** jetons
invisibles au scanner — donc `empty_meal`, un jeton vivant depuis des mois, est devenu orphelin
en silence. Corrigé en deux appels distincts, chacun avec sa chaîne littérale, et le motif est
écrit en commentaire aux deux endroits.

### 6.2 · `note_unusable` — pourquoi il reste ouvert, et où est le seam

`note_unusable` est le refus de la **phrase de reprise d'un aperçu** (« refaire avec ça »).
Elle part au modèle **dans le même message que la doctrine du coach et les règles de maison** :
elle a donc besoin de la garde d'entrée `plan_draft_note.ts::readDraftNote` — **module de
Lot C, qui n'existe pas encore**.

**⛔ Tant qu'il n'existe pas, `body.draft_note` n'est PAS lu.** Accepter le champ sans la garde
ferait exactement l'injection que la garde existe pour empêcher. Le seam est commenté dans les
deux `index.ts`, juste sous `const isDraft` : lire `body.draft_note`, appeler
`readDraftNote({ raw, doctrineForbidden })`, refuser `note_unusable` sur `verdict.refusal`,
concaténer `verdict.usable` à `preferences`. Dix lignes, dans **mes** fichiers — Lot C n'a pas
à les ouvrir.

### 6.3 · Fichiers de test que j'ai modifiés et **délibérément pas commités**

`buildMealPrompt` gagne un paramètre **REQUIS** `firstDayCookable: boolean` (§4.0 : `true` est
une affirmation, pas un repli ; un `?` aurait rendu l'oubli invisible au compilateur, et le
défaut aurait été une garde désarmée sur l'une des deux lanes). Le compilateur a donc réclamé
**11 fichiers de fixtures**, tous hors de ma colonne :

```
away_days_test.ts · day_properties_test.ts · eating_rhythm_test.ts · fixed_intakes_test.ts
household_merge_test.ts · meal_body_test.ts · meal_budget_test.ts · meal_generation_test.ts
seasonality_test.ts · week_bounds_test.ts · generation_locale_test.ts (UNTRACKED)
```

J'y ai ajouté **une ligne chacun** (`firstDayCookable: true`). **Je ne les ai pas commités** :
`git diff HEAD` montre qu'ils portent déjà du travail **non commité d'autres sessions**
(`eatingSlots: null` dans `household_merge_test.ts`, un test entier « le prompt EXIGE une
quantité sur les matières grasses » dans `meal_generation_test.ts`, et
`generation_locale_test.ts` qui n'est **même pas suivi par git**). Un `git commit --only` sur
ces chemins aurait embarqué leur travail sous mon message.

⚠️ **Conséquence à connaître : les deux commits de ce lot, relus SEULS, ne compilent pas les
tests.** Le worktree, lui, est vert (2916/0). C'est un choix entre deux maux, et j'ai pris
celui qui ne s'approprie pas le travail d'autrui.

### 6.4 · Rouges connus au départ, non touchés

`chat/recent_history_test.ts`, le typage d'`action_occurrences_test.ts`, `coverage-guard` côté
frontend, et les 8 `no-irregular-whitespace` d'`en.ts` (§3.5). Aucun n'a été rencontré :
`deno test` sur `_shared/keel/` est **entièrement vert**, et `agent-gate` n'a rien lancé sur le
frontend (« no modified frontend files for eslint » — je n'en ai modifié aucun).

---

## 7 · Ce que j'ai trouvé et qui n'était pas au contrat

1. **La branche `tooLate` était satisfaisable, mais pas toujours faisable.** Le contrat la
   décrit comme voulue — elle l'est. Ce qu'elle ne savait pas, c'est qu'à 21 h « cuisine
   aujourd'hui en plus » demande des courses dans un magasin fermé. La condition
   `Math.min(...) > 0` est devenue `> window.indexOf(first)`, ce qui la laisse **exactement
   identique** quand `first` est `window[0]` (prouvé byte à byte) et la fait viser `window[1]`
   sinon.

2. **`GeneratedDish` n'a pas d'identifiant.** `ReportableDish.id` de FF-061 en attend un. Les
   plats n'en portent qu'une fois en base. J'utilise l'index de plan (`dish_0`, `dish_1`…) :
   `dishIds` ne sert qu'à regrouper des faits **à l'intérieur d'un même rapport**, n'est jamais
   rendu à l'élève, et n'est écrit nulle part.

3. **Le scanner de refus ne voit que les littéraux** — §6.1. C'est le piège le plus coûteux
   trouvé pendant ce lot, parce qu'il rend un jeton **existant** orphelin sans qu'on ait touché
   à ce jeton.

4. **`slotsDroppedToday` devait être un champ à part.** Le contrat §4.1 ne l'avait pas. Le
   fondre dans `awayInWindow` aurait fait dire « tu avais marqué que tu n'étais pas là » à
   quelqu'un qui n'a rien marqué. Les deux listes ne se rejoignent qu'au moment du prompt, et
   la trace de présence du foyer (`generated_from.presence`) continue de ne porter **que** ce
   que des personnes ont déclaré.

5. **La lane foyer n'a pas de plancher TCA de foyer.** `restriction_flag` y est **par membre**
   (`m.body.restrictionFlag`). Pour la porte 1 de FF-061 j'ai pris celui du **compte qui
   compose** — c'est à lui que le bloc est rendu — en fail-closed. **⚠️ NON VÉRIFIÉ** : je n'ai
   pas cherché s'il existe ailleurs une définition « le foyer est sous plancher ».

6. **`until_sunday` ne peut pas être dit « raccourci ».** `requestedWindow` vaut `null` pour
   cette forme dans les deux lanes : elle ne demande pas une durée, elle demande « ce qu'il
   reste ». Dire « tu en avais demandé 7 » y serait faux.

---

## 8 · Ce que je n'ai pas fait, et qu'il reste à faire

- [x] ~~Le run réel 9 h / 21 h~~ — **fait**, les deux moitiés (§4). Le même corps rend deux
      fenêtres différentes et la phrase le dit.
- [x] ~~Remettre `Europe/London`~~ — **fait et vérifié**.
- [ ] **Nettoyer `student_goals.practical_constraints`** du persona `1eda8697-…` si les
      `cook_days`/`budget_amount`/`cooking_time_min` ajoutés gênent un autre lot.
- [ ] **`note_unusable`** : attend `plan_draft_note.ts` (Lot C). Seam commenté, dix lignes.
- [ ] **`previouslyReportedAbsent`** : le rappel d'un plan au suivant n'est pas câblé.
- [ ] **Commiter les 11 fixtures** (§6.3) — décision humaine, ou la session propriétaire les
      emportera avec ma ligne.
- [ ] **Replier `reengagement_io.ts::localHourFor`** sur `localMinuteInZone` — fichier sans
      propriétaire, à attribuer.
