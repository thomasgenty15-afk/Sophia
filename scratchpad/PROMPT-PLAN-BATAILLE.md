# Chantier — rendre atteignable ce que le moteur fait déjà

> **Tu es un agent autonome.** Ce document est ton cahier des charges complet :
> il porte le constat mesuré, quatre lots, ce qui est DÉJÀ FAIT et ne doit pas
> être reconstruit, les preuves à produire et le format du rapport.
>
> **Le fil qui doit guider chacun de tes arbitrages :** ce dépôt calcule
> beaucoup plus qu'il n'affiche. Avant d'écrire un module, cherche celui qui
> existe déjà — sur les sept points passés en revue, **six existaient**. Si tu
> te retrouves à créer un moteur, tu t'es probablement trompé de lot.
>
> **Ordre : A → B → C → D.** Chacun est livrable et commitable seul ; si le
> chantier s'arrête au milieu, ce qui est commité tient debout.
>
> ⚠️ **D'autres agents travaillent dans ce dépôt en ce moment**, dont un sur
> les mêmes écrans (`PROMPT-RETRAIT-BLOCS-FOYER.md`, `PROMPT-PLAN-PAR-
> PERSONNE.md`). Lis-les pour savoir ce que tu ne dois pas refaire.

## Context

Le propriétaire a passé en revue sept points du produit foyer le 2026-08-14.
**Six sur sept existent déjà en code, écrits, testés et commentés.** Ce qui
manque n'est presque jamais le mécanisme : c'est le moment où quelqu'un le
rencontre.

Trois exemples, vérifiés :

- L'**échelle de cuisson** existe sous le nom `CookingShape`
  (`one_dish` | `one_session` | `separate_sessions`, dans
  `_shared/keel/household_portions.ts`). Elle est **calculée** par
  `mergeLadder` (`household_merge.ts:596-620`), consommée par
  `generate-household-meal-v1:2564`, et elle **change la consigne** du modèle
  (`meal_generation.ts:912`). Personne ne la choisit, personne ne la voit — le
  même foyer bascule d'un barreau à l'autre sans un mot.
- L'**aperçu avant écriture** existe (`PlanDraftDialog.tsx`, `intent: "draft"`,
  zéro écriture — *« `select count(*)` INCHANGÉ après trois tours »*), et il
  **contient déjà le texte de constat** (`plan_rationale.ts`, rendu en
  `PlanDraftDialog:165-170`). Il n'est monté que sur `/app/plan`
  (`StudentWeekPlanPage:2474`) : **en venant de l'inscription, on ne le
  rencontre jamais.**
- Le **retour de fin de plan** existe (`plan_feedback.ts`, sept questions,
  chacune nommant son lecteur dans `QUESTION_READERS`, avec la règle *« ON
  ÉVALUE LE PLAN, JAMAIS LA PERSONNE »*). **Zéro clé i18n** : aucune surface ne
  le pose. Le seul chemin est un détecteur de chat (`run.ts:670`).

Et un trou structurel bloque le reste : **un plat dédié n'est attribuable à
personne.** Les clés d'un plat en base sont `title, why, uses, method, slot,
day, ingredients, servings_made, preparation_id, id, honours_belief_keys` —
**aucun `member_id`**. Dès que les plats divergent, « qui mange quoi » n'est
devinable que par du texte libre dans le titre.

**Deux décisions prises par le propriétaire, à appliquer telles quelles :**

1. Le mode de cuisson se choisit **à chaque composition**, pas dans un réglage
   de foyer. Précédent du dépôt : le budget a été **déplacé** du profil vers la
   composition le 2026-08-13, avec le motif écrit dans `CookingCapacityCard` —
   *« un réglage de profil s'écrit une fois et s'applique en silence à toutes
   les semaines suivantes, y compris celle où on reçoit du monde »*.
2. La correction `member_id` **est dans le périmètre**.

---

## Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`.** Pas de push, pas de merge.
2. **`git add -A` INTERDIT.** Plusieurs sessions écrivent en parallèle. Avant
   de stager : `git diff -- <chemin>` et vérifier que le diff ne contient QUE
   ton travail. Détruire du travail non commité est irréversible.
3. ⚠️ **`frontend/src/keel/i18n/en.ts` peut être tenu** (refactor non commité).
   Vérifier avant d'écrire. S'il est tenu : poser les clés sur le disque pour
   que ça compile, **ne pas les commiter**, le dire au rapport.
4. **Typecheck** `cd frontend && npx tsc -b` (`tsconfig.json` a `files: []` et
   ne vérifie rien) · **vitest** `npx vitest --config vitest.config.ts run` ·
   **Deno** `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
5. **Commandes à risque jamais seul** (`db push`, `db reset`,
   `functions deploy`, `secrets`, `link`) : les écrire dans le rapport.
6. **Le runtime edge sert des `_shared` périmés** : redémarrer la pile avant
   tout run réel.

---

## Lot A — L'aperçu et le constat, depuis l'inscription

**Le plus rentable des quatre : c'est un branchement, et il frappe au seul
moment où quelqu'un décide de rester.**

- La sortie de l'entonnoir (`frontend/src/keel/api/onboarding.ts`, écran
  `/app/setup`) génère aujourd'hui **directement**. Elle doit passer par
  `PlanDraftDialog` : voir, lire le constat, refaire, puis adopter.
- **Ne rien recréer.** `PlanDraftDialog` monte `PlanResult`, extrait exprès
  pour être monté deux fois — *« un second rendu divergerait au premier
  correctif »*. `intent: "draft"` garde toutes les gardes amont (gel, objectif
  requis, méthode publiée, fenêtre, plancher TCA, doctrine, règles de maison).
- Le constat (`rationale`) est déjà rendu par le dialogue. Vérifier qu'il
  **arrive non vide** sur le chemin de l'entonnoir, et pas seulement sur
  `/app/plan`.

**Preuve** : compte neuf → entonnoir complet → l'aperçu s'ouvre, le constat est
lisible, « refaire » ne crée aucune ligne (`select count(*) from
student_generated_meals` inchangé), « adopter » en crée exactement une.

## Lot B — Le mode de cuisson, déclaré à la composition

- Trois choix sur l'écran qui compose (`MealBuilder`, l'entonnoir, le foyer),
  **jamais un réglage de profil** — décision du propriétaire, et précédent du
  budget.
- Les libellés portent la conséquence, pas le jargon : « un seul plat pour tout
  le monde » / « une cuisson, des plats un peu différents » / « chacun le
  sien ». Ils correspondent un pour un à `one_dish` / `one_session` /
  `separate_sessions`.
- **Le choix est un plafond, pas un ordre.** `mergeLadder` continue de
  calculer. Quand le calcul ne peut pas tenir le choix (deux objectifs opposés
  ne partagent pas honnêtement un plat unique), **le plan doit le dire** — la
  phrase va dans `rationale`, qui existe pour exactement ça. Un choix
  silencieusement ignoré est pire que pas de choix.
- Archiver le choix dans `generated_from`, comme le budget. **Jamais réutilisé
  en silence à la génération suivante.**

**Preuve** : deux membres à objectifs opposés + choix « un seul plat » ⇒ le plan
sort ET le constat nomme l'arbitrage. Le même foyer avec « chacun le sien » ⇒
forme différente. Test sur `mergeLadder` prouvant que le choix borne sans
remplacer le calcul.

## Lot C — `member_id` sur un plat dédié

**Le déblocage structurel. Sans lui, « qui mange quoi » reste indevinable.**

- Poser l'identifiant **au moment où le plat dédié est créé**, côté
  `_shared/keel/household_merge.ts` et charge utile de génération
  (`asksForASecondDish`, `dedicatedCells`, `dedicatedDishesAsked`).
- ⛔ **Aucun matcher de texte.** Cicatrice du dépôt : « laitue » ≠ « lait »,
  12 faux positifs sur 12 mesurés. Si l'identifiant ne peut pas être posé à la
  création, **s'arrêter et le dire** — ne pas deviner depuis le titre.
- `PlanByPerson.tsx` / `planByPersonModel.ts` (livrés le 2026-08-14) lisent
  ensuite l'attribution au lieu de l'ignorer.

**Preuve** : un foyer avec un plat dédié → `member_id` présent en base → la vue
par personne l'attribue à la bonne bouche. Contre-épreuve : un plat commun n'en
porte pas.

## Lot D — L'écran de fin de plan

- Poser les questions de `plan_feedback.ts` sur une surface. Le module est
  fait ; **il manque l'écran**. Patron voisin : `WeeklyCheckInDialog.tsx`.
- **Deux manques à combler, et ce sont des demandes explicites :**
  1. **L'inverse de `never_again`** — « j'en veux un qui ressemble la
     prochaine fois ». C'est un booléen, et c'est le signal le plus précieux du
     lot : il réoriente toute la génération suivante.
  2. **Les envies apparues en cours de plan**, qui alimentent le plan suivant.
     Écrire dans le canal existant (`household_envies.ts` côté foyer, la phrase
     du maître) — **ne pas ouvrir un second canal d'envies.**
- ⛔ **Chaque question neuve nomme son lecteur** dans `QUESTION_READERS`. La
  règle existe parce que le point du dimanche collectait pour un lecteur
  inexistant et a été supprimé pour ça. Une question sans lecteur ne se pose
  pas.
- ⛔ **On évalue le plan, jamais la personne.** Aucune question sur ce qui a
  été mangé ni sur ce qui a été fait.

**Preuve** : fin de fenêtre → l'écran se pose → les réponses sont en base →
`QUESTION_READERS` cite un lecteur réel pour chaque question, vérifié par test.

---

## Ce qui est DÉJÀ FAIT — ne pas reconstruire

- **Les envies de la maison** : `household_envies.ts` a **retiré la récolte par
  membre le 2026-08-10**, pour les raisons exactes que le propriétaire a
  redonnées. Ce qui reste — une phrase du maître pour tout le monde — est la
  bonne forme. **Seule tâche : vérifier que la case est visible.**
  *Résidu à signaler, pas à corriger ici :* `household_envy_submissions` garde
  `user_id` et une clé unique par membre, forme de la version abandonnée.
- **Le questionnaire** : l'entonnoir (`onboarding.ts`) déclare ~28 étapes dont
  `own_diet`, `medical_constraints`, `house_rules`, `variety`,
  `member_eating_rhythm`. **Il existe et il est complet.** Il ne se déclenche
  pas pour un compte qui a déjà une ligne `student_goals` — d'où « je ne l'ai
  jamais vu ». **Seule tâche : le rendre atteignable et donner un chemin pour
  le rejouer.**
- **Le clic sur un plat** : `dishSession.ts` fait déjà
  `dish.uses[].preparation_id → cooking_sessions[].preparation_ids`.
  **Seul ajout demandé : les portions par personne dans ce même dépliant** —
  d'où vient le lot, ce qu'on fait maintenant, combien pour chacun, au même
  endroit.

## Hors périmètre

- ❌ `household_portions.ts` : l'arbitrage sur la bifurcation appartient à
  l'humain, en attente du constat du chantier voisin.
- ❌ Retrait du résidu `user_id` sur `household_envy_submissions`.
- ❌ Toute migration non exigée par le lot C ; tout déploiement.

---

## Verification

1. **Parcours réel, compte neuf** : inscription → entonnoir → aperçu → constat
   → adoption. C'est le test qui vaut les autres.
2. **Navigateur à 320 px et 1280 px**, screenshot à `scroll 0` (le panneau ne
   repeint pas ailleurs). `flex-1` ne rétrécit pas un élément (`min-width:
   auto`).
3. **Base** : `student_generated_meals` inchangé après trois « refaire » ;
   `member_id` présent sur un plat dédié et absent d'un plat commun ; réponses
   de fin de plan écrites.
4. **Suites** : `npx tsc -b` exit 0 · vitest vert · Deno vert (environnement
   purgé).
5. **Mutation** : chaque garde neuve doit passer au rouge quand on la casse —
   une garde qu'on ne sait pas faire échouer n'est pas prouvée.
6. **Fixtures nettoyées**, cascade vérifiée et non supposée.

## Rapport

`scratchpad/PLAN-BATAILLE-RAPPORT.md` : lot par lot, livré / partiel / échoué
avec la preuve ; les décisions tranchées seul avec les options rejetées ; les
clés i18n laissées non commitées ; les commandes à risque à faire exécuter par
un humain. **Un échec ne se masque pas.**
