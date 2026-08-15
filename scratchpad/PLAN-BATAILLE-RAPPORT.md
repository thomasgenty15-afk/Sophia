# Rapport — rendre atteignable ce que le moteur fait déjà

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-15 · **Aucun `push`, aucun merge.**

| Lot | État | En une ligne |
|---|---|---|
| **A** — l'aperçu depuis l'inscription | ✅ livré · ⚠️ non vu en run réel | Branchement pur. `compose()` demande un aperçu au lieu d'écrire. Le runtime edge est ÉTEINT sur ce poste : le parcours de bout en bout n'a pas pu être joué (§7.1). |
| **B** — le mode de cuisson à la composition | ✅ livré | Un plafond, jamais un ordre. Le calcul reste le calcul ; quand le plafond mord, le plan le dit. Champ vu au navigateur à 1280 et 320 px. |
| **C** — `member_id` sur un plat dédié | ✅ livré · ⚠️ non mesuré en run réel | Posé à la création, déclaré par le modèle, validé contre une liste fermée. Aucun matcher. L'écart demandé/attribué est ARCHIVÉ — c'est ce qui rendra le lot mesurable au premier run (§7.2). |
| **D** — l'écran de fin de plan | ✅ livré · **prouvé en réel** | Questionnaire posé, répondu et LU EN BASE dans le navigateur. Les deux polarités et l'envie de la suite y sont, l'envie part dans le canal existant sur le lundi SUIVANT. |

**Quatre commits** : `bd8738a1` (B), `bc339a69` (A), `0fe99c12` (C), `052975ec` (D).
`git add -A` n'a **jamais** été utilisé ; chaque commit liste ses chemins, et
chaque chemin a été relu par `git diff --numstat` avant d'être stagé.

---

## 0. Ce qui n'a pas été fait, et pourquoi

- ⛔ **`household_portions.ts` — la bifurcation n'est pas arbitrée.** Hors
  périmètre, la question appartient à l'humain. Le fichier est modifié par ce
  chantier (lot B y ajoute `capCookingShape`), mais **aucune ligne de la
  bifurcation des portions n'a bougé**.
- ⛔ **Le résidu `user_id` sur `household_envy_submissions` n'est pas retiré.**
  Hors périmètre, explicitement.
- ⛔ **Aucune commande à risque exécutée** — ni `db push`, ni `db reset`, ni
  `functions deploy`, ni `secrets`, ni `link`. Voir §8 pour la seule qui reste à
  faire exécuter par un humain.
- ⛔ **`en.ts` / `fr.ts` ne sont pas commités** (§6).
- ⛔ **Aucun appel modèle n'a été passé.** Le runtime edge n'est pas démarré sur
  ce poste, et le redémarrer aurait cassé les runs des lanes voisines (§7.1).

---

## A. L'aperçu et le constat, depuis l'inscription

### Ce qui existait, et où il n'était pas

`PlanDraftDialog` est livré depuis le 2026-08-13 : `intent: "draft"`, zéro
écriture, et il **rend déjà le constat** (`rationale`, en-tête `plan.rationale.
title`). Il n'était monté **que** sur `/app/plan` (`StudentWeekPlanPage:2474`).

`SetupPage.compose()` appelait `generateMeal` / `generateHouseholdMeal` en
`intent: "prepare_next"` — il **écrivait**. Le tout premier plan de quelqu'un,
celui qui fait la première impression et le seul moment où il décide de rester,
arrivait sans qu'il l'ait vu, sans le constat, et sans aucun geste pour dire
« pas comme ça ».

### Ce qui a été fait — un branchement, rien de plus

| Geste | Avant | Après |
|---|---|---|
| bouton de fin | `compose()` → écriture | `askForDraft()` → `composeDraft`, puis la fenêtre |
| reprise | n'existait pas | `composeDraft(draftInput(facts, note))` |
| adoption | n'existait pas | `writeFromDraft(…, "prepare_next", null)` → `/app/plan` |
| fermeture | — | on reste dans l'entonnoir (aucun plan n'a été écrit) |

**Rien n'est recréé.** `PlanDraftDialog` monte `PlanResult` (le rendu unique,
extrait exprès pour être monté deux fois) ; `composeDraft`/`writeFromDraft` sont
les mêmes appels que `/app/plan`. `draftInput` est la **source unique** des
entrées des trois gestes : deux corps écrits séparément divergeraient, et
l'adoption composerait pour une vie que la personne n'a pas.

### Le constat arrive-t-il non vide sur ce chemin ? — ⚠️ prouvé par lecture, pas par run

`explainPlanChoices` est appelé **avant l'écriture**, sur les deux lanes, avec le
commentaire qui le dit mot pour mot : *« Calculés AVANT l'écriture pour être
rendus aussi sur un aperçu, qui n'écrit rien »*
(`generate-household-meal-v1:3504`). Sa ligne ① (la fenêtre) **sort toujours**
dès que `window.startsOn` est lisible — et l'entonnoir passe une fenêtre `exact`
choisie à l'écran. Le `rationale` ne peut donc pas être vide sur ce chemin.

⛔ **Ce n'est pas une mesure.** Voir §7.1 : le run réel n'a pas pu être joué.

### Les preuves

- 8 tests de câblage (`pages/setupDraftWiring.int.test.ts`), dont la garde
  inverse : « l'entonnoir a toujours une sortie, et elle mène au plan ».
- **Muté** : `rationale={draft?.envelope.rationale ?? []}` → `rationale={[]}`
  ⇒ **rouge** (le défaut `mine={null}` d'un lot voisin, rejoué). Restauré ⇒ 8/8.
- **Muté** : `guard(askForDraft)` → un symbole inexistant ⇒ **rouge**.
- `/app/setup` s'ouvre et **reprend à l'étape où le compte s'est arrêté**
  (« STEP 2 OF 4 » sur la fixture), donc le couloir est bien atteignable et
  rejouable — ce que le chantier demandait pour le questionnaire.

---

## B. Le mode de cuisson, déclaré à la composition

### Le fait de départ

`CookingShape` est **calculé** (`mergeLadder` ; depuis le 2026-08-14 la
divergence en composition ordinaire), il **change la consigne** du modèle
(`cookingShapeLines`), et **personne ne le choisit ni ne le voit**.

### Le choix est un PLAFOND, et c'est le cœur du lot

`capCookingShape` (`household_portions.ts`) est le **seul** endroit qui compare
le choix au calcul, et il rend **trois** faits :

| Cas | Servi | `capped` | `unused` |
|---|---|---|---|
| rien demandé | le calcul | `false` | `false` |
| « un seul plat » sur une table qui diverge | `one_dish` | **`true`** | `false` |
| « chacun le sien » et personne ne diverge | `one_dish` | `false` | **`true`** |
| choix = calcul | le calcul | `false` | `false` |

⛔ **Le choix ne FABRIQUE jamais un second plat.** C'est le test qui porte tout
le lot : un module qui rendrait `asked` quand il est non nul ferait cuire une
seconde casserole pour rien.

⚠️ **`capped` et `unused` ne sont pas l'inverse l'un de l'autre.** Les fondre en
un booléen ferait dire « on n'a pas pu tenir ton choix » à quelqu'un dont le
choix a été tenu à la lettre.

### Le plan le DIT quand le plafond mord

Deux phrases dans `plan_rationale.ts` (⑤ter), chacune armée par sa prémisse, dans
les deux langues :

> « Tu as demandé un seul plat pour tout le monde, et c'est ce qui a été composé.
> La part de Zoé ne sort pas du plat commun : elle est servie au plus près, sans
> plat à part. »

> « Tu as ouvert la possibilité de plats séparés. Personne à cette table n'en a
> besoin cette semaine : il n'y a qu'une cuisson. »

⛔ **Aucune des deux ne dit POURQUOI** quelqu'un ne sort pas de la casserole :
nommer la raison dirait son objectif à toute la table. Un test lexical l'interdit
(`objectif`, `goal`, `kcal`, `calorie`, `poids`).

### Les trois bouts qui promettent un plat lisent la forme SERVIE

C'est la moitié qui se perd le plus vite. Un seul qui garde le barreau brut, et
le prompt porte **deux ordres contradictoires** :

| Bout | Avant | Après |
|---|---|---|
| budget de plats | `ladder.shape` | `cookingShape` |
| bloc de régime (`divergingNames`) | `divergingMembers` | `dishBearingMembers` |
| bloc de fusion (`buildMergeBlock`) | `ladder.shape` | `cookingShape` |

`divergingMembers` **reste le calcul** — c'est lui qui nomme, au constat, qui ne
sort pas de la casserole. `dishBearingMembers` est ce que la **consigne** promet.

### L'archive, et son absence de lecteur

`generated_from.household.cooking` = `{asked, computed, served, capped, unused,
diverging, dish_bearing}`. Écrit **même quand rien n'a été demandé**.

⛔ **Aucun lecteur, et c'est le point.** Le relire d'un plan précédent en ferait
un réglage de profil — exactement ce que ce lot a refusé d'écrire, pour le motif
du budget déplacé le 2026-08-13 : *« un réglage de profil s'écrit une fois et
s'applique en silence à toutes les semaines suivantes, y compris celle où on
reçoit du monde »*. Un test l'épingle.

### Où le champ est posé, et où il ne l'est pas

| Écran | Champ | Pourquoi |
|---|---|---|
| `MealBuilder` (`/app/plan`) | ✅ à côté du budget et des jours de cuisine | c'est l'écran qui compose |
| l'entonnoir, étape 4 | ✅ même composant | c'est l'écran qui compose |
| la carte d'aperçu de `/app/plan` | ⛔ `cookingShape: null`, **exprès** | c'est un bouton sans formulaire ; y glisser un défaut en dur rejouerait `mine={null}` |
| lane individuelle | ⛔ jamais | une bouche n'a pas la question, et la lane refuse le champ |

**Vu au navigateur** (`/app/plan`, foyer `4ba4c573`, 3 bouches) :

```
HOW YOU COOK THIS WEEK
[ Let the plan decide            ▾ ]     ← le défaut, et c'est `null`
A ceiling, not an order: nobody gets a dish of their own unless what they
eat cannot come out of the shared pot. Asked every time.
```

Les quatre options lues dans le DOM : `""` / `one_dish` / `one_session` /
`separate_sessions`. `document.scrollWidth === innerWidth` à **1280** (1280) et à
**320** (320) — **aucun débordement**. Captures prises à scroll 0, corps décalé
par `margin-top` négatif.

---

## C. `member_id` sur un plat dédié

### Le trou, et pourquoi le calcul ne pouvait pas le fermer

Les clés d'un plat en base : `title, why, uses, method, slot, day, ingredients,
honours_belief_keys` — **aucune attribution**. Le seul marqueur qu'un plat était
celui de Zoé était **« for Zoe » dans le titre**.

⛔ **Pas de matcher** : cicatrice mesurée (12 faux positifs sur 12), et ici il se
tromperait dès « Chicken for Zoe and Marc » et ne trouverait **rien** dès que le
plan sort en français.

⚠️ **Et le calcul ne tranche pas non plus.** Sur une case dédiée il y a **deux**
plats — celui de la table et le sien — et lequel est lequel n'est pas décidable
de l'extérieur : c'est le modèle qui vient de composer les deux.

### Donc : posé à la CRÉATION, déclaré par le modèle, validé contre une liste fermée

C'est le patron **exact** de `preparation_id` (inventé par le modèle, vérifié
contre `preparations[].id`) — et surtout, le prompt donne **déjà** ces mêmes ids
au modèle, à la ligne 612 de `household_meal_generation.ts` :

```
Exact ids to use in member_portions:
- Zoe = 8f2c…
```

`member_portions[].member_id` fonctionne en production sur chaque plan de foyer
depuis le pivot. Ce n'est donc pas un pari : c'est le même geste, une clé plus
loin.

### Les deux portes du parseur

1. **La consigne doit avoir réclamé un plat dédié.** Au barreau ① le prompt dit
   « Do NOT propose separate dishes » : un `for_member_id` qui arriverait quand
   même attribuerait le plat de la **table** à une personne, et la vue par
   personne le retirerait à tous les autres. Un faux plus cher que l'absence.
2. **L'id doit être dans `dishBearerIds`** — les bouches à qui la consigne promet
   vraiment un plat (la liste **plafonnée**, pas le calcul brut).

Un `for_member_id` refusé **ne rejette jamais le plat** : l'attribution est une
lecture EN PLUS. Même posture que `honours_belief_keys`.

### Le bloc de prompt n'existe QUE quand un plat dédié est réclamé

Servi à un foyer au barreau ①, il apprendrait au modèle qu'un plat peut
appartenir à quelqu'un, et l'inviterait à en marquer un. `HOUSEHOLD_PROMPT_VERSION`
passe **v11 → v12** ; un foyer sans porteur rend un prompt **byte-identique à
v11**, et un test le tient.

### Ce que la vue par personne fait maintenant

- `buildPersonWeek` : un plat attribué à quelqu'un d'autre **sort de sa semaine**.
  C'est le défaut cité tel quel dans le rapport voisin (le petit-déjeuner de Zoé
  dans la semaine de Kid).
- `buildPlanByPerson` : deux tables au lieu d'une. Un plat attribué **ne concourt
  plus** pour la case « le plat » — sinon le plat d'une bouche pouvait devenir
  celui de toute la table, au hasard de l'ordre du modèle.

Les tests utilisent volontairement des **titres identiques** sans prénom : si un
matcher revenait un jour, ils tomberaient au lieu de passer pour la mauvaise
raison.

### ⛔ L'écart demandé / attribué est ARCHIVÉ, et c'est ce qui sauve le lot

```
generated_from.household.dish_owners = { asked: N, attributed: M }
```

Le champ est **déclaré par le modèle** : on ne peut pas savoir d'avance à quelle
fréquence il le remplit, seulement le mesurer. Sans ces deux nombres, un modèle
qui ignorerait la consigne rendrait `member_id: null` partout — et le lot
ressemblerait **trait pour trait** à un lot qui marche (la vue montrerait les
mêmes plats à tout le monde, c'est-à-dire le comportement d'avant).

⚠️ **Ce nombre n'a pas encore été mesuré** (§7.1). C'est la première chose à
regarder au premier run réel, et la requête est au §7.2.

---

## D. L'écran de fin de plan — **prouvé de bout en bout**

### Ce qui existait, et ce qui manquait

`plan_feedback.ts` : sept questions, options fermées, libellés dans les deux
langues, plancher TCA, effet de chaque réponse. `meal_plan_feedback` : les
colonnes, chacune avec **son lecteur nommé**. **Zéro clé i18n, zéro écran, zéro
écrivain** — `revoke all … from authenticated` est juste, et aucun chemin
`service_role` ne posait de ligne.

### ① L'inverse de `never_again`

`make_again` verse au **même canal** que son jumeau
(`practical_constraints.food_preferences`), polarité inverse : **aucun lecteur
neuf n'a eu à exister**. C'est le bloc que le prompt sert à chaque composition,
donc il réoriente la suivante.

⚠️ **Le plafond « jamais plus de quatre gestes » tient toujours.** Les deux
polarités portent sur **la même liste** — les plats du plan — et l'écran les rend
en **un seul bloc**, une ligne par plat, deux marques. La personne répond à
quatre choses, pas à cinq. Le test a été révisé de `<= 4` à `<= 5` **jetons**
avec cette justification écrite sur place, et il exige en plus que les deux
polarités aillent **ensemble** (une seule serait un questionnaire qui n'apprend
qu'à éviter, ou qu'à viser).

### ② Les envies apparues en cours de plan — ⛔ aucun second canal

Elles partent dans `keel_household_submit_envy`, la ligne que `buildEnvyBlock`
lit **déjà** à chaque composition. Une colonne `new_envy` aurait été un second
écrivain pour la même intention.

Conséquence directe et assumée : **la question n'est posée qu'au maître d'un
foyer** — le seul compte qui puisse l'écrire (`not_owner` pour les autres). Une
question sans lecteur ne se pose pas ; la poser quand même refabriquerait le
point du dimanche avec le même mécanisme.

Et elle vise la **semaine suivante** : le générateur ne lit que la ligne de la
fenêtre qu'il compose.

### La preuve — un run réel, dans le navigateur, lu en base

Fixture `l4m-owner-1786500297@test.dev` (foyer `4ba4c573`, objectif `fat_loss`),
session ouverte par l'API Supabase et jeton injecté dans `localStorage`
(patron commité `frontend/e2e/eating-rhythm.e2e.spec.ts`). **Aucun mot de passe
tapé dans un formulaire.**

L'écran s'est ouvert **de lui-même** au chargement de `/app/plan` :

```
This plan is over                                            Not now
A few things about the plan itself — what it asked of you, not what
you did with it. Nothing here is required.

DID YOU GET TO COOK THIS PLAN?            Yes · [Partly] · No
THE PORTIONS IN IT WERE:                  Too much · [About right] · Not enough
DID THIS PLAN LEAVE YOU HUNGRY BETWEEN MEALS?   Often · [Sometimes] · No
THE DISHES IN IT
  Greek yogurt bowl with peaches, oats and walnuts   [Again]  Not again
  Chicken, tomato and cucumber salad with bread       Again  [Not again]
  … (13 titres, dédoublonnés)
ANYTHING YOU FANCY NEXT
  [ Envie de poisson mardi, et moins de couscous ]
                                                              [Send]
```

Quatre questions — la quatrième est bien celle de l'**axe** de `fat_loss`. Puis,
lu en base après l'envoi :

```
cooked   portions  axis_question          axis_answer  never_again / make_again
partly   right     hunger_between_meals   sometimes    ["Chicken, tomato and
                                                        cucumber salad with bread"]
                                                       ["Greek yogurt bowl with
                                                        peaches, oats and walnuts"]
```

Et l'envie, dans **le canal existant**, sur le **lundi suivant** :

```
household_envy_submissions
  week_start  2026-08-17     ← lundi qui suit le samedi 2026-08-15
  body        "Envie de poisson mardi, et moins de couscous"
```

**La boucle se referme** : rechargement de `/app/plan` ⇒ le questionnaire **ne
revient pas** (`This plan is over` absent du DOM). Un plan déjà répondu — ou
refusé — ne se repropose plus.

### La migration

`20260815100000_plan_feedback_make_again_and_writer.sql` : la colonne
`make_again` (avec son lecteur en commentaire), et les deux portes d'écriture
`security definer` qui **vérifient la propriété du plan** (`p_meal_id` vient du
client). Son bloc `do $$` de preuve passe : `make_again` vaut `[]` par défaut,
`authenticated` n'écrit **toujours pas** en direct, `anon` ne lit rien et
n'appelle aucune des deux portes.

**Appliquée localement** — mais **pas par `supabase migration up`** : la CLI
échoue sur ce poste avec `runtime error: index out of range [0] with length 0`,
et l'erreur est antérieure et étrangère à ce fichier. Appliquée par
`psql -v ON_ERROR_STOP=1`, puis la version a été inscrite à la main dans
`supabase_migrations.schema_migrations`. **À signaler**, parce qu'une pile locale
dont la CLI ne sait plus jouer les migrations le redira au prochain lot.

---

## 5. Les preuves techniques

| Épreuve | Résultat |
|---|---|
| `cd frontend && npx tsc -b` | **exit 0** |
| `npx vitest --config vitest.config.ts run` | **992 passés**, 20 skipped · **3 rouges, tous antérieurs** (§5.1) |
| Suite Deno KEEL (`_shared/keel/`) | **3059 passed, 0 failed** |
| `agent-gate` sur chaque commit | **pass** (il relance la suite Deno + eslint) |
| Mes tests neufs | **68** — 8 (A) + 18 (B) + 22 (C) + 20 (D) |
| **Mutation des gardes** | **8/8 passent au rouge**, puis tout vert après restauration (§5.2) |
| Navigateur, `/app/plan`, 1280 px et 320 px | `scrollWidth === innerWidth` — **aucun débordement de page** |
| Écriture réelle en base (lot D) | **vérifiée**, deux tables (§D) |

### 5.1 Les 3 rouges de vitest sont ANTÉRIEURS et ÉTRANGERS

**Prouvé, pas affirmé** : un worktree détaché sur `b99e171d` — le commit qui
précède tout mon travail — rend **les mêmes familles rouges** (4 y sont rouges,
dont les 3 d'aujourd'hui).

1. `src/edge/coverage-guard.int.test.ts` (2) — des fonctions edge et un trigger
   absents des listes connues. **Je n'ai ajouté ni fonction edge ni trigger.**
2. `src/keel/copy/planRefusals.int.test.ts` — sept `household.error.*` écrits
   dans `en.ts` inatteignables depuis `HOUSEHOLD_REFUSAL_KEYS`. `planRefusals.ts`
   **et** `en.ts` sont modifiés par une **autre session**.

### 5.2 Les huit gardes ont été mutées, une par une

| Mutation | Résultat |
|---|---|
| le choix de cuisson FABRIQUE un second plat | **rouge** (58 ✓ / 1 ✗) |
| le plafond cesse de mordre (`if (false)`) | **rouge** (57 ✓ / 2 ✗) |
| la phrase du plafond est retirée du constat | **rouge** (43 ✓ / 1 ✗) |
| la porte du barreau ① sur l'attribution est retirée | **rouge** (29 ✓ / 1 ✗) |
| la liste fermée des porteurs est désarmée | **rouge** (29 ✓ / 1 ✗) |
| le plat d'un autre revient dans sa semaine | **rouge** (2 ✗) |
| le plat dédié redevient « le plat » de la table | **rouge** (2 ✗) |
| fermer cesse d'écrire le refus | **rouge** (1 ✗) |
| le bouton de fin ne demande plus l'aperçu | **rouge** (1 ✗) |
| *après restauration* | **tout vert** (149 Deno, 51 vitest sur les fichiers touchés) |

Une garde qu'on n'a jamais vue mordre n'est pas une garde.

---

## 6. Les clés i18n — sur le disque, NON commitées

`frontend/src/keel/i18n/en.ts` est **tenu par une autre session** (modifié, non
commité, +3277 lignes) et `fr.ts` n'est **pas suivi par git**. Le type
`MessageKey` en dérive, donc toute clé neuve doit y passer pour que ça compile.
**Je les ai posées sur le disque et je ne les commite pas.**

| Clé | en | fr |
|---|---|---|
| `plan.cooking.shape_label` | How you cook this week | Comment tu cuisines cette semaine |
| `plan.cooking.shape_hint` | A ceiling, not an order… | Un plafond, pas un ordre… |
| `plan.cooking.shape_engine` | Let the plan decide | Laisse le plan décider |
| `plan.cooking.shape_one_dish` | One dish for everyone | Un seul plat pour tout le monde |
| `plan.cooking.shape_one_session` | One cook, slightly different plates | Une cuisson, des plats un peu différents |
| `plan.cooking.shape_separate` | Each their own | Chacun le sien |
| `plan.feedback.title` | This plan is over | Ce plan est fini |
| `plan.feedback.intro` | A few things about the plan itself… | Deux ou trois choses sur le plan lui-même… |
| `plan.feedback.dishes_title` | The dishes in it | Les plats qu'il portait |
| `plan.feedback.dishes_hint` | Mark the ones worth having again… | Marque ceux qui valent le coup… |
| `plan.feedback.again` | Again | Encore |
| `plan.feedback.not_again` | Not again | Sans moi |
| `plan.feedback.envy_title` | Anything you fancy next | Une envie pour la suite |
| `plan.feedback.envy_hint` | One line, for the whole table… | Une ligne, pour toute la table… |
| `plan.feedback.envy_placeholder` | Léa wants pasta… | Léa veut des pâtes… |
| `plan.feedback.send` / `sending` / `dismiss` | Send / Sending… / Not now | Envoyer / Envoi… / Pas maintenant |

**22 clés, en `en.ts` ET en `fr.ts`** — `plan` est un namespace **traduit**
(`TRANSLATED_NAMESPACES`), donc une clé anglaise seule aurait fait tomber la
ceinture de parité. Elle passe.

⚠️ **Un piège mesuré en passant.** Les clés de libellé du champ de cuisson
vivaient d'abord dans `api/cookingShape.ts` — module atteint par
`api/household.ts`, donc par **`/join-household`**, une page qui ne déclare pas
le namespace `plan.*`. `pageSeams.int.test.ts` est passé au rouge. Elles ont été
déplacées dans le **composant** : les jetons voyagent, les mots restent avec le
champ qui les affiche. C'est écrit sur place.

### Fichier d'une autre lane, modifié sur le disque et NON commité

| Fichier | État | Ce que j'y ai mis, et pourquoi |
|---|---|---|
| `supabase/functions/_shared/keel/meal_pdf_locale_test.ts` | **non suivi** (autre lane) | `memberId: null` sur sa fixture de plat. Sans cette ligne, **sa lane ne compilera plus** : `GeneratedDish` a gagné un champ requis. Elle est sur le disque, elle n'est pas dans mon commit — **la lane qui possède ce fichier doit la garder en l'intégrant.** |

---

## 7. ⛔ CE QUE JE N'AI PAS PU VÉRIFIER — consigné rouge

### 7.1 Aucun run modèle : le runtime edge est ÉTEINT sur ce poste

Mesuré, pas supposé :

```
docker ps  →  9 conteneurs supabase, AUCUN edge-runtime
POST /functions/v1/generate-household-meal-v1  →  500
POST /functions/v1/meal-energy-v1              →  500 (vu dans la console)
```

PostgREST répond normalement (200) : ce n'est donc **pas** le piège JWT HS256,
et `check-local-jwt-alg.sh` n'avait pas lieu d'être joué.

**Pourquoi je n'ai pas redémarré la pile.** `supabase stop && supabase start`
est autorisé, mais **cinq lanes travaillent sur ce dépôt en ce moment** et deux
rapports voisins décrivent des runs en cours sur cette base. Redémarrer aurait
cassé le travail de quelqu'un d'autre, sur une infrastructure partagée, sans que
personne me l'ait demandé. **Le geste appartient à l'humain** (§8).

**Ce qui reste donc non mesuré :**

1. ⛔ **Le parcours réel de l'entonnoir** (lot A) — inscription → étapes →
   aperçu → constat → adoption. C'est « le test qui vaut les autres », et il
   n'est pas joué. Le bouton de fin appellerait `composeDraft`, qui 500.
2. ⛔ **`select count(*) from student_generated_meals` inchangé après trois
   « refaire »** — la mesure existe déjà, faite par le lot qui a livré
   `intent: "draft"` le 2026-08-13 (citée dans l'en-tête de `PlanDraftDialog`),
   mais **je ne l'ai pas rejouée**.
3. ⛔ **`member_id` présent en base sur un plat dédié** (lot C) — il faut une
   composition de foyer au barreau ②, donc un appel modèle.
4. ⛔ **Le plan qui NOMME l'arbitrage** quand le plafond mord (lot B) — même
   raison. La phrase est prouvée par test unitaire, pas par un plan réel.

### 7.2 La première chose à regarder au premier run réel

```sql
-- LOT C — le modèle remplit-il `for_member_id`, et à quelle fréquence ?
select
  generated_from->'household'->'cooking'->>'served'        as forme,
  generated_from->'household'->'dish_owners'->>'asked'     as reclames,
  generated_from->'household'->'dish_owners'->>'attributed' as attribues,
  (select count(*) from jsonb_array_elements(dishes) d
    where d->>'member_id' is not null)                     as en_base
from student_generated_meals
where plan_kind = 'household'
  and generated_from->'household'->'dish_owners' is not null
order by created_at desc limit 20;
```

`attribues = 0` alors que `reclames > 0` veut dire que le modèle ignore la
consigne — et **c'est exactement le cas que le lot C ne peut pas distinguer d'un
succès sans ce compteur.**

```sql
-- LOT B — le choix est-il vraiment lu, et mord-il ?
select generated_from->'household'->'cooking' as choix
from student_generated_meals
where plan_kind='household' and generated_from->'household'->'cooking' is not null
order by created_at desc limit 20;
```

### 7.3 Deux autres angles morts, plus petits

5. ⚠️ **L'étape 4 de l'entonnoir n'a pas été vue à l'écran.** La fixture est
   retenue à l'étape 2 par un profil incomplet, et la faire avancer aurait
   **écrit dans un compte QA partagé**. Le champ et la fenêtre y sont prouvés par
   les tests de câblage (mutés, rouges), pas par une capture.
6. ⚠️ **Le cas « foyer sans porteur de plat » du prompt** (lot C) est prouvé par
   égalité de chaîne (`byte-identique à v11`), pas par un run.

---

## 8. ⚠️ Ce qui reste à faire exécuter par un humain

**Aucune commande à risque n'est nécessaire pour que ce chantier tienne.** Les
quatre lots sont commités, la migration est appliquée localement, et rien n'est
déployé.

Deux gestes, tous deux facultatifs, et tous deux à faire par vous :

```bash
supabase stop && supabase start
```

Le runtime edge n'est pas démarré : sans lui, aucune fonction edge ne répond, et
**aucun run modèle n'est possible** — ni pour finir de vérifier ce chantier, ni
pour les lanes voisines. ⚠️ **Ça coupera les runs en cours des autres sessions**,
d'où le fait que je ne l'aie pas fait. Après redémarrage : se **déconnecter /
reconnecter** dans l'app, un rechargement ne renouvelle pas le jeton déjà en
`localStorage`. Et le runtime sert des `_shared` périmés — le redémarrage est de
toute façon requis avant tout run réel.

```bash
npx supabase migration repair --status applied 20260815100000
```

Optionnel, et seulement si `supabase migration up` se remet à fonctionner : la
version a déjà été inscrite à la main dans `supabase_migrations.schema_migrations`
après application par `psql`, parce que la CLI échoue sur ce poste
(`runtime error: index out of range [0] with length 0`, antérieur et étranger à
ce chantier).

⛔ **Aucun `db push`, aucun `functions deploy`, aucun `secrets`, aucun `link`
n'est nécessaire.** Le déploiement est hors périmètre.

---

## 9. Les décisions tranchées seul

| Décision | Option rejetée, et pourquoi |
|---|---|
| **Le mode de cuisson est un `null` par défaut** (« laisse décider ») | Pré-cocher `one_dish` : ça clouerait au barreau ① tous les foyers qui n'ouvrent jamais la question — changer le comportement de gens à qui on n'a rien demandé. |
| **Le choix ne se pré-remplit PAS** avec la dernière réponse | Le pré-remplir comme le budget : le budget et les jours de cuisine sont des FAITS de la vie de quelqu'un ; « cette fois, un seul plat » est un ARBITRAGE de la semaine, et le rejouer en silence est le réglage de profil qu'on refuse d'écrire. |
| **`for_member_id` demandé au MODÈLE** | Une attribution déduite : sur une case dédiée il y a deux plats, et lequel est lequel n'est pas décidable de l'extérieur. Un matcher de titre est interdit. Le modèle copie déjà ces mêmes ids pour `member_portions`, en production. |
| **`make_again` est un 5e JETON, pas un 5e geste** | Le fondre dans `never_again` avec un signe : chaque lecteur devrait connaître la convention, et le premier qui l'oublie ferait éviter à vie un plat qu'on avait aimé. Le plafond « quatre gestes » tient par le RENDU (un bloc, une ligne par plat). |
| **Aucune colonne `new_envy`** | Une colonne sur `meal_plan_feedback` : deuxième écrivain pour la même intention. Conséquence assumée — la question n'est posée qu'au maître. |
| **L'envie vise le lundi SUIVANT** | La semaine écoulée : le générateur ne lit que la ligne de la fenêtre qu'il compose. Elle serait recueillie, rangée, et jamais servie. |
| **Le lot D emporte un socle NON SUIVI** | Ne commiter que mes fichiers : ils importent `plan_feedback.ts` et la migration `20260811090000`, tous deux **hors de git**. Le commit n'aurait compilé sur aucune copie fraîche. Détail au §10. |
| **La carte d'aperçu de `/app/plan` passe `cookingShape: null`** | Y mettre un défaut : c'est un bouton sans formulaire, la question n'y a pas de sujet, et un défaut en dur rejouerait `mine={null}`. |
| **Le test `<= 4` révisé en `<= 5`** | Retirer `make_again` : le chantier le demande explicitement, et c'est le signal qui ORIENTE au lieu de borner. La règle produit est réécrite sur place, pas contournée. |
| **Ne pas redémarrer la pile Supabase** | La redémarrer pour finir la vérification : cinq lanes travaillent dessus en ce moment, et deux rapports voisins décrivent des runs en cours. |

---

## 10. ⚠️ LE COMMIT DU LOT D EMPORTE DU CODE QUI N'ÉTAIT PAS DANS GIT

À lire, parce que c'est le geste le plus discutable de ce chantier.

Trois fichiers du socle de fin de plan étaient **non suivis** :

```
supabase/functions/_shared/keel/plan_feedback.ts
supabase/functions/_shared/keel/plan_feedback_test.ts
supabase/migrations/20260811090000_meal_plan_feedback.sql
```

Le cahier des charges les décrit comme existants (« Le module est fait ; il
manque l'écran »), et ils portent une date du 2026-08-11 : ce n'est pas du
travail en cours, c'est du travail qui n'a jamais été commité.

**Je les ai commités avec le lot D.** Sans eux, le lot n'aurait compilé sur
aucune copie fraîche : mon `api/planFeedback.ts` réexporte `plan_feedback.ts`, et
ma migration fait `alter table meal_plan_feedback` sur une table dont la création
n'existait pas dans l'historique.

**L'option rejetée** — ne commiter que mes fichiers — laissait un import vers un
fichier absent et un `alter table` sur une table inconnue. Une moitié d'écran
sans son module est pire qu'un lot repoussé.

⚠️ **Ce que ça n'est pas** : rien n'a été écrasé ni perdu. Si la lane qui possède
ces fichiers les édite encore, sa copie de travail est intacte et son commit se
posera par-dessus. J'ai ajouté à `plan_feedback.ts` la question `make_again`, son
lecteur, et `newEnvyIsAsked` — c'est signalé dans le message de commit.

---

## 11. Fichiers commités

```
bd8738a1 — le mode de cuisson, déclaré à la composition
  _shared/keel/household_portions.ts               +104   capCookingShape, readCookingShape
  _shared/keel/household_portions_test.ts          +126   6 tests
  _shared/keel/plan_rationale.ts                   +104   la phrase du plafond, ⑤ter
  _shared/keel/plan_rationale_test.ts              +136   6 tests
  _shared/keel/household_merge_test.ts              +99   3 tests de câblage
  generate-household-meal-v1/index.ts              +206   le plafond, les 3 bouts, l'archive
  generate-meal-v1/index.ts                          +5   `cookingShapeChoice: null`
  frontend/…/api/cookingShape.ts                    NEUF  les jetons, sans les mots
  frontend/…/api/cookingShape.int.test.ts           NEUF  9 tests
  frontend/…/components/CookingShapeField.tsx       NEUF  le champ, un seul pour deux écrans
  frontend/…/components/MealBuilder.tsx             +47   le champ + le jeton dans la demande
  frontend/…/api/household.ts                       +22   `cooking_shape` au corps
  frontend/…/api/planDraft.ts                       +26   idem, sur les 3 gestes
  frontend/…/pages/StudentWeekPlanPage.tsx          +12   `cookingShape: null`, exprès

bc339a69 — le premier plan s'écrivait sans qu'on l'ait vu
  frontend/…/pages/SetupPage.tsx                   +274/-72  askForDraft + la fenêtre
  frontend/…/pages/setupDraftWiring.int.test.ts     NEUF     8 tests

0fe99c12 — un plat dédié n'était attribuable à personne
  _shared/keel/meal_generation.ts                  +115   `memberId`, les 2 portes, le payload
  _shared/keel/meal_generation_test.ts             +161   6 tests
  _shared/keel/household_meal_generation.ts         +82   le bloc `WHOSE DISH IS IT`, v12
  _shared/keel/household_meal_generation_test.ts    +89   2 tests + 27 sites
  _shared/keel/household_merge_test.ts              +76   3 tests de câblage
  generate-household-meal-v1/index.ts               +56   les porteurs + `dish_owners`
  frontend/…/api/household.ts                       +31   lecture défensive de `member_id`
  frontend/…/lib/planByPersonModel.ts               +67   deux tables, et le filtre
  frontend/…/lib/planByPersonModel.int.test.ts     +117   5 tests
  frontend/…/components/plan/PlanByPerson.tsx       +25   `ownDish` dans la case

052975ec — le questionnaire de fin de plan
  _shared/keel/plan_feedback.ts                    SOCLE  + make_again, newEnvyIsAsked
  _shared/keel/plan_feedback_test.ts               SOCLE  + 4 tests
  migrations/20260811090000_meal_plan_feedback.sql SOCLE  (voir §10)
  migrations/20260815100000_…_make_again_and_writer.sql  NEUF  colonne + 2 RPC
  frontend/…/api/planFeedback.ts                    NEUF  le pont, sans garde recopiée
  frontend/…/api/planFeedback.int.test.ts           NEUF  12 tests
  frontend/…/components/plan/PlanFeedbackDialog.tsx NEUF  l'écran
  frontend/…/pages/StudentWeekPlanPage.tsx          +134  le montage + le refus qui s'écrit
```

**Non commités, exprès** : `frontend/src/keel/i18n/en.ts`,
`frontend/src/keel/i18n/fr.ts` (§6), et
`supabase/functions/_shared/keel/meal_pdf_locale_test.ts` (§6, fichier d'une
autre lane). Aucun autre fichier du dépôt n'a été touché.
