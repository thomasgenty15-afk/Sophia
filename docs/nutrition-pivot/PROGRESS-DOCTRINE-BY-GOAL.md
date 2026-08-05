# Journal — une doctrine écrite, N doctrines servies

Prompt: `PROMPT-DOCTRINE-BY-GOAL.md`. Branche `dewhatsapp`.
Livrable: [`STATUS-DOCTRINE-BY-GOAL.md`](STATUS-DOCTRINE-BY-GOAL.md).

---

## En arrivant — un dépôt partagé

`git status` portait le travail non committé d'une autre session (`App.tsx`,
`TodayPage.tsx`, `CoachMealsPage.tsx`, `account-export-v1`, …). Rien de ce lot
ne les touche, et **aucun commit d'ici n'emporte un fichier d'autrui**: chaque
commit stage des chemins explicites, jamais `git add -A`. C'est la même
discipline que le lot voisin a documentée avant moi.

Conséquence assumée: pas de commit « snapshot » d'ouverture, parce qu'un
snapshot aurait committé leur travail en cours.

---

## Les décisions, dans l'ordre où elles se sont posées

### 1. Le vocabulaire d'objectifs vit dans `tokens.ts`

Le lot voisin (`protocol_compiler.ts`) portait déjà les cinq jetons et le
prédicat « portée vide = tout le monde ». Deux copies d'un vocabulaire fermé
finissent par diverger, et le jour où elles divergent une croyance visant un
sixième objectif atteint tout le monde d'un côté et personne de l'autre.

`GOAL_TOKENS` / `goalScopeApplies` sont donc dans `tokens.ts`;
`protocol_compiler.ts` re-exporte le type et délègue son `ruleAppliesTo`. Un
test compare les deux sur le produit cartésien complet, pour que la divergence
soit impossible à expédier.

### 2. `compileDoctrineBlock(doctrine, goal)` — l'objectif est OBLIGATOIRE

Un paramètre de portée facultatif serait une portée désarmée: l'appelant qui
l'oublie servirait la `default` à un élève `fat_loss`, silencieusement.
Cicatrice `optional-gate-params-are-disarmed-gates`. Ne pas savoir se dit
`null`, explicitement.

### 3. Le bloc ne nomme JAMAIS l'objectif, et n'étiquette jamais une entrée

C'est la décision qui porte deux propriétés à la fois:

* **rétrocompatibilité** — une doctrine sans portée compile **octet pour octet
  à l'identique** pour les six variantes, donc un coach existant ne voit rien
  changer;
* **cache** — ces six variantes identiques ont le même hash de contenu, donc
  **une seule** entrée de cache.

Injecter « objectif: perte de gras » dans l'en-tête aurait fragmenté le cache
par six pour tous les coachs, y compris ceux qui n'ont rien ciblé.

### 4. Le hash n'est PAS salé avec l'objectif — et §3.2.1 est tenu quand même

L'exigence est qu'une variante ne reçoive jamais la clé d'une autre. Un hash de
**contenu** la tient par construction: deux textes différents ⇒ deux clés.
Saler ferait strictement pire (six clés pour six textes identiques). L'identité
de la variante voyage dans `CompiledDoctrine.goal` et dans la trace, qui est là
qu'on répond à « laquelle a servi ». Détaillé dans le STATUS.

### 5. La lecture de l'objectif est DANS le chargeur

Un objectif passé en argument est un objectif qu'un quatrième consommateur
oubliera — le dépôt a déjà payé « la doctrine ne gouvernait qu'une lane sur
trois ». `loadPublishedDoctrine` lit `student_goals` lui-même. L'option
`goalOverride` existe pour le mode test, et **son omission donne le
comportement correct**, pas un repli.

### 6. 🔴 Le trou trouvé en chemin: la portée fuyait dans le PLAN

`generate-week-plan-v1` et `generate-meal-v1` ne lisent pas le bloc: ils lisent
la **liste** de convictions, pour tracer chaque ligne produite
(`..._doctrine_traceable_check`). Non filtrée, elle construisait le plan d'un
élève `health` sur une conviction écrite pour `fat_loss` — la portée tenait
dans la conversation et fuyait dans le plan. `doctrineBeliefsFor(loaded)` rend
exactement ce que le bloc contient, et les deux générateurs passent par elle.

### 7. Trois erreurs de ma part, corrigées en cours de route

| Ce que j'ai cru | Ce qui était vrai |
|---|---|
| `distinctHashes = 4` pour la doctrine de test | **3** — les objectifs qu'aucune portée ne vise retombent sur la `default`, ils ne créent pas d'entrée. La fragmentation suit le nombre de **portées distinctes écrites**, pas le nombre d'objectifs. |
| La passe FR pouvait s'asserter sur de la prose française | Le modèle répond en **anglais** à une question française (la locale de l'élève l'emporte sur `voice.language`). Marqueurs rendus bilingues, et la preuve principale déplacée sur le **bloc servi**, qui est déterministe. |
| Un harnais peut fabriquer 4 élèves pour un coach | Non: **3 sièges** en essai (`keel_trial_seat_limit_reached`). C'est une garde du produit, pas un obstacle à contourner — le script utilise deux coachs. |

### 8. Hors périmètre, corrigé et déclaré

`rollback` recopiait `beliefs`/`forbidden`/`vocabulary`/`arbitrations`/`voice`
et **perdait `foods` et `qa`**. Un « retour en un clic » retirait donc au coach
deux sections entières, sans rien lui dire. Deux lignes, dans une fonction que
ce lot modifiait déjà. Corrigé, et dit ici plutôt que glissé.

---

## Le virage d'UX, demandé en cours de route

La première version portait un **marqueur de portée** sur chaque entrée du
compte rendu (divulgation progressive, §5 du prompt). Retour de l'auteur du
lot, en substance:

> « la doctrine courante devrait être inscrite dans les cases déjà prévues à cet
> effet, pas en dessous, comme ça le coach peut modifier sur la base de la
> dernière doctrine […] une partie doctrine globale, une spécifique et puis
> basta, ni plus ni moins »

Deux lectures étaient possibles pour la première moitié, et elles ne coûtaient
pas le même travail (pré-remplir l'interview depuis les données stockées est
**lossy**: les trois cas durs ne se réattribuent pas de façon fiable à leur
question d'origine). Question posée, réponses:

* **l'édition** → un formulaire éditable direct, pas d'interview pré-remplie;
* **le spécifique** → des champs structurés directs, sans IA.

Ce qui est livré:

* la doctrine remplit **ses propres cases**, et ces cases sont la source — ce
  que le coach tape est ce qui est stocké;
* l'interview passe **sous** l'édition, et redevient le chemin du premier jour;
* une partie **globale** (croyances et cas durs sans portée + voix, mots,
  interdits, aliments, Q/R) et une partie **spécifique par dynamique** qui
  n'ajoute que des croyances et des cas durs;
* le marqueur de portée par entrée est **supprimé**: la portée est celle de la
  partie dans laquelle le coach écrit. « Ni plus ni moins. »

`pruneDraft` s'ajoute avec le formulaire: un écran à boutons « + » produit
forcément des lignes ouvertes et non remplies, et sans nettoyage elles partent
en base, reviennent en avertissements à chaque relecture, et se recopient de
version en version.

---

## Les épreuves, dans l'ordre où elles ont été jouées

| Épreuve | Fichier | Résultat |
|---|---|---|
| Unitaires du compilateur | `_shared/keel/doctrine_by_goal_test.ts` | 20/20 |
| Unitaires du chargeur | `_shared/keel/doctrine_loader_test.ts` | 15/15 |
| Suites Deno complètes | `_shared/`, `sophia-brain/` | **2940 passed, 0 failed** |
| Suite front | `frontend` | **276 passed** |
| Gardes de schéma, base réelle | `scratchpad/guards.sql` | G0–G9, toutes mordent |
| **Épreuve de réel** | `qa-web/D1_doctrine_by_goal.ts` | **7/7** |
| **Passe adversariale** | `qa-web/D2_doctrine_by_goal_adversarial.ts` | **12/12** |
| **Aller-retour de l'écran** | `qa-web/D3_doctrine_roundtrip.ts` | **13/13** |

Transcriptions: `qa-web/D1-doctrine-by-goal.txt`,
`qa-web/D2-doctrine-by-goal-adversarial.txt`.

---

## Ce que je n'ai PAS fait

**L'écran n'a pas été ouvert dans un navigateur.** Cinq serveurs de dev tournent
dans ce dossier, tous appartenant à d'autres sessions, et le plafond par dossier
est de cinq. Se connecter sur le serveur d'une autre session partagerait le
profil du navigateur et écraserait son état d'authentification
(`qa-browser-shared-profile-contamination`) — j'ai préféré ne pas piétiner le
travail d'un autre agent pour une vérification visuelle. Ce qui est prouvé à la
place: `tsc` vert, `vite build` vert (le module Deno se bundle), 17 tests sur la
logique pure de l'écran, et l'aller-retour complet contre la vraie fonction
edge (D3).
