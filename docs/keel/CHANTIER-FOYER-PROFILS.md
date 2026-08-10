# Chantier — Les bouches sans compte

> **Ce que ce chantier fait, en une phrase :** faire passer le foyer d'un graphe
> clé sur `auth.users` à un graphe clé sur **une bouche**, dont le compte devient
> optionnel — et retourner les gardes qui ont été écrites pour l'ancien modèle.

| | |
|---|---|
| **Date** | 2026-08-10 |
| **Branche** | `ff-001-quotidien-du-coach` |
| **Autorités produit** | [MODEL.md](MODEL.md) · [CONTRACT.md](CONTRACT.md) · [PIVOT-FOYER.md](PIVOT-FOYER.md) (⚠️ ses §7, §7.5, §8.1–§8.3 et son modèle d'invitation sont **périmés** par les décisions des 2026-08-08 et 2026-08-10) |
| **État du dépôt** | **rien de déployé** ; base locale à jour ; lignée de migrations saine |
| **Direction du domaine** | [docs/fonctionnalites/le-foyer/README.md](../fonctionnalites/le-foyer/README.md) — la règle mère, les crans d'intake, F1–F10, les six trous |

---

## L'état réel, lot par lot — 2026-08-10

> **Ce tableau est la réponse à « qu'est-ce qui tourne, qu'est-ce qui attend, et
> pourquoi ».** Le détail de chaque lot suit ; la fiche produit dit l'intention,
> ce tableau dit l'état.

| Lot | Objet | État | Commit | Preuve |
|---|---|---|---|---|
| **0** | La lignée des migrations | ✅ livré | `73115206` | 0 fichier non appliqué, 0 ligne de ledger sans fichier, 0 doublon de version |
| **1+2+3** | `member_id`, gardes retournées, objectif sur la ligne | ✅ livré | `9dc442d2` | 1750 deno · 514 vitest · typecheck 0 · **36** assertions `household_rls_test.sql` sur la base réelle |
| *(voisin)* | FF-037 → FF-040, mis à l'abri | ✅ livré | `6259fcab` | 1798 deno · `deno check` propre sur deux fonctions |
| **3B** | Le corps dans la bifurcation des portions | ✅ livré | `c95706ee` | 1798 deno · **6 mutations → 6 rouges** · coût mesuré : 7 lectures/bouche avec compte, 0 sans |
| **4** | L'ajout en 90 s + l'allergie d'une bouche sans compte | ⚠️ **livré à ⅔** | `26de20ab` | 1880 deno · **56** assertions RLS · 2 mutations vérifiées — **mais le câblage du générateur reste sur le disque** |
| **6** | Réclamer son profil = ATTACHER un compte | ✅ livré | `193e228a` | **76** assertions RLS · 1880 deno · mutation vérifiée (assertion 67) |
| **7** | Le compte facturable + le plafond cité | ⚠️ **définition seule** | `f9efc488` | **101** assertions RLS (+11) · privilèges vérifiés · 2 mutations → 2 rouges — **rien ne facture** |
| **8** | Une seule définition des vagues de courses | ✅ livré | `476a4acb` | 3961 deno · 513 vitest · mutation avec **contrefactuel** (16/16 verts avec l'ancien jumeau) · `wiring-check` 3 orphelins → 2 |
| **5** | L'envie de la semaine, version maître | 🟠 **NON COMMITÉ** | — | terminé et vert sur le disque ; voir « Pourquoi le lot 5 attend » ci-dessous |
| **9** | Les documents | ✅ livré | *(ce commit)* | 7 fiches `FF-044` → `FF-050`, la direction du domaine, FF-005 corrigée |

### Pourquoi le lot 5 attend, et pourquoi c'est le bon choix

Le lot 5 change l'interface du prompt : `envies: EnvySubmission[]` devient
`envyLine: string | null`, et `spoken`/`silent` deviennent `envyLineUsed`. Un
commit qui porte ce changement **doit** emporter `generate-household-meal-v1/index.ts`,
sinon l'arbre ne compile pas.

Or ce fichier importe aussi `food_composition.ts` et `food_composition_io.ts`,
**non suivis**, d'une session qui écrit en ce moment. Les deux issues sont
mauvaises : committer sans le fichier edge produit un arbre cassé ; committer
avec lui emporte le chantier en vol de quelqu'un d'autre. On attend.

**Conséquence à savoir** : tant que ce commit n'est pas fait, `HEAD` porte
encore `mergeEnvies` et la récolte par membre — c'est-à-dire le comportement que
[FF-050](../fonctionnalites/le-foyer/FF-050-l-envie-de-la-semaine.md) décrit
comme mort.

### Le même piège, une deuxième fois : le lot 4

Le câblage du générateur pour les allergies de foyer
(`loadHouseholdAllergies`, `householdHardConstraints`, `applyHouseRuleLock`
alimenté par les seules règles de maison) est resté **sur le disque** pour
exactement la même raison. Vérifié au 2026-08-10 : à `HEAD`,
`_shared/keel/household_safety.ts` n'a **aucun importeur** — la table
`household_member_allergies` est écrite par l'écran
(`frontend/src/keel/api/household.ts:414`) et lue par **personne côté serveur**.

C'est le mode d'échec n°1 de ce dépôt, et il est ici **connu, daté et attendu** —
ce qui n'est pas la même chose qu'oublié. Le premier commit qui touche
`generate-household-meal-v1/index.ts` doit emporter les deux moitiés.

---

## 0. Les décisions déjà prises

Elles ne se re-litigent pas. Elles sont ici pour qu'un lecteur dans six mois
sache que le chantier avait un modèle et pas une humeur.

**Le modèle.** Un compte, un foyer. La personne qui cuisine crée son foyer, y
ajoute des bouches, et **gouverne seule le menu**. 12,99 €/mois, foyer entier.
Un adulte qui veut son propre accès **réclame son profil** à 2 €/mois. La
colocation sort du produit.

**L'identité.** Une seule table. `member_id` en clé, `user_id` optionnel — vide
tant que la personne n'a pas de compte, rempli le jour où elle réclame son
profil. Prénom et date de naissance sur la ligne membre, **pour tout le monde**.

**Les gardes.** Le consentement à se faire restreindre disparaît ; en
contrepartie, qui a posé la contrainte reste affiché. `households.kind`
supprimée.

**L'objectif.** Une colonne sur la ligne membre, vocabulaire fermé aux six
jetons. Une personne qui réclame son profil reprend la main sur **son seul
objectif**, pas sur le menu. Sans âge, aucun objectif n'est appliqué.

**Le corps.** Il est branché sur le générateur du foyer — décision du
2026-08-10. C'est ce qui rend la réclamation de profil réelle : elle change
l'assiette, pas seulement l'accès.

**Les crans d'intake.** La frontière n'est **pas** le compte, c'est le corps :

| Cran | Contenu | Compte requis |
|---|---|---|
| **0 — la bouche** | prénom, âge, allergie | non |
| **1 — la direction** | un jeton d'objectif | non |
| **2 — le corps** | taille, sexe, date exacte, série de poids | **oui** |

Le compte est la porte du cran 2 pour une raison technique, pas commerciale :
`restriction_guard` (le plancher TCA) a besoin d'une **série de poids**, et une
bouche sans compte n'en a pas. Le corps sans série est une donnée qu'on ne sait
pas protéger.

---

## Lot 0 — La lignée des migrations ✅ FAIT (2026-08-10)

Le doublon `20260808060000` est résolu : `household_roster_for_server` est passée
à `20260808061000`, `retrait_residus_raisons_de_conservation` garde sa place —
elle documente 18 tables dont **17 sont droppées par les quatre migrations
suivantes**, et son bloc *fail loud* lève si l'une manque. La renuméroter en
avant la ferait échouer.

Cinq migrations manquaient au ledger local. Trois étaient **déjà appliquées sans
être enregistrées** (vérifié par leurs effets, premier ET dernier artefact) :
ligne de ledger insérée, **rien rejoué** — leurs `update` sur `coaches`,
`auth.users` et `student_generated_meals` ne devaient pas repasser. Les deux
autres appliquées par `migration up --include-all`.

**Contrôle final :** 0 fichier non appliqué, 0 ligne de ledger sans fichier,
0 doublon de version.

**Deux migrations non commitées, emmenées dans le même commit.** Ce n'était pas
une préférence pour l'une des deux : `profile_height` ajoute `profiles.height_cm`,
et du code **déjà commité** la lit (`student_body_io.ts:51,77`,
`meal_body.ts:69`) jusqu'à relire sa contrainte `profiles_height_cm_range_check`.
Un clone frais du dépôt produisait une base où ce code casse. `eating_rhythm_size`
n'est qu'un `comment on column` — aucun code n'en dépend, elle suit par confort.

---

## Lot 1 — L'identité d'une bouche ✅ LIVRÉ (`9dc442d2`)

> Fiche produit : [FF-044 · La bouche sans compte](../fonctionnalites/le-foyer/FF-044-la-bouche-sans-compte.md).
> Les lots 1, 2 et 3 sont partis **d'un seul geste** : le lot 3 a besoin de la
> clé du lot 1, et le lot 2 est la raison pour laquelle le lot 3 est dangereux.

**Objet.** `member_id` devient la clé du graphe du foyer. `user_id` devient une
propriété optionnelle de la ligne, pas son identité.

### Le rayon d'explosion, vérifié

| # | Point | Ce qui change |
|---|---|---|
| 1 | `foundation.sql:77-88` | PK → `member_id` ; `user_id` nullable ; `first_name` et date de naissance sur la ligne |
| 2 | `foundation.sql:103` | L'index `one_per_user` **reste tel quel** — Postgres tolère plusieurs NULL, l'invariant « un compte = un foyer » survit sans retouche |
| 3 | `foundation.sql:134,145` | `member_user_id` → `member_id`, FK vers `household_members` au lieu d'`auth.users` ; l'unique `(household_id, membre, label)` suit |
| 4 | `household_roster.sql:43-58` | La jointure sur `profiles` disparaît ; prénom et minorité viennent de la ligne |
| 5 | `keel_household_is_minor` | Lit la ligne membre, plus `profiles` — et passe à **trois états** (voir lot 3) |
| 6 | `add_restriction`, `remove_restriction`, `roster_for` | `p_member uuid` cesse d'être un identifiant de compte |
| 7 | `household_meal_generation.ts:101,105,141` | « using their EXACT user_id » → `member_id` dans le contrat du prompt |
| 8 | `household_portions.ts:326` | `memberPortionsPayload` écrit `member_id` |
| 9 | `household_turn_context.ts:445-461` | `visibleById` clé sur `member_id` ; `isMe` devient « ma ligne membre » |
| 10 | `keel_household_of` | **Inchangé, et sûr** : `where hm.user_id = p_user` n'appariera jamais une ligne à NULL |
| 11 | Front | `api/household.ts` (roster, interdits, portions) + `HouseholdPage` |

### Ce qui est tranché

- **Pas de repli sur l'ancienne clé.** Le lecteur ne connaît que `member_id`.
  Les lignes `member_portions` écrites en local deviennent illisibles : assumé,
  il n'y a aucun utilisateur réel. Un repli deviendrait le chemin nominal sans
  qu'on le voie — ce dépôt l'a déjà payé.
- **Le prénom vient de la ligne, pour tout le monde.** Motif dur :
  `household_turn_context.ts:461` filtre en silence toute portion dont le prénom
  est vide. Un prénom absent **fait disparaître la part**, sans erreur.

- **La ligne du maître est recopiée une fois** depuis son `profiles` à la
  création du foyer, puis elle est indépendante. Le roster n'a donc **aucune
  branche conditionnelle** : une seule source pour tout le monde. Conséquence
  assumée : s'il renomme son profil plus tard, son prénom au foyer ne suit pas —
  il le change au foyer. Un repli « profil si la ligne est vide » rouvrirait
  exactement le bug du prénom vide qui efface une portion.

### Preuve d'acceptation

Un run réel : un foyer de trois dont **deux sans compte**, une génération, et le
chat qui rend la portion nommée de chacun. Pas un test unitaire — le défaut
FF-010 était vert sur une fixture qui mentait (`cookOn` ≠ `cook_on`).

---

## Lot 2 — Les gardes retournées ✅ LIVRÉ (`9dc442d2`)

**Objet.** Les gardes du foyer ont été écrites pour protéger un adulte d'un
autre adulte, dans un monde à plusieurs comptes. Elles pointent maintenant dans
la mauvaise direction.

### Le fait qui commande

`keel_household_is_minor` fait `coalesce(…, false)` : profil absent ⇒ **traité
comme majeur**. Combiné à `add_restriction` (`if not is_minor and consent is
null → adult_without_consent`), **toute bouche sans compte — enfant de six ans
compris — serait refusée à la restriction, avec le motif « adulte sans
consentement »**. Ce n'est pas une indécision, c'est une décision fausse rendue
en silence.

### Ce qui est tranché

- **Le consentement disparaît** : `restriction_consent_at`, `grant_consent`,
  `revoke_consent`, et la branche `adult_without_consent`.
- **En contrepartie, `created_by` reste affiché** — et c'est déjà le cas :
  `restrictionNotice` (`api/household.ts:116`) est rendue à
  `HouseholdPage.tsx:344`. Rien à construire, la colonne cesse d'être
  facultative dans l'esprit.
- **`households.kind` supprimée**, avec `HOUSEHOLD_KINDS` et la branche
  `not_a_family`.
- **Quatre fonctions retirées, avec leurs tests** : `canRestrict`, `canInvite`,
  `memberVisibility`, `canSeeGoalOf`.

### Ce qu'il faut savoir avant de retirer

- `canRestrict` et `canInvite` n'ont **jamais eu d'appelant** : la règle a
  toujours vécu en SQL. Les retirer ne désarme rien.
- `memberVisibility` **est déjà neutre en mode famille**
  (`household.ts:168-170` : `viewer === viewed → full`, sinon `kind === "family"
  ? "full" : "presence_only"`). La retirer ne change aucun comportement.
- `canSeeGoalOf` **est appelée**, à `HouseholdPage.tsx:234`, sous la forme
  `{canSeeGoalOf(household, m) ? null : null}` — les deux branches rendent
  `null`. C'est un no-op, et il prouve que l'objectif d'un membre n'est affiché
  nulle part aujourd'hui.

### La conséquence à assumer

FF-010 R3 cachait délibérément la part d'autrui **dans la conversation** en
colocation (`household.ts:155-160`). Cette distinction disparaît : un profil
réclamé qui demande « c'est quoi la part de Marc ? » l'obtiendra. Cohérent avec
« le repas est partagé, le corps est à soi » — mais c'est un vrai changement de
comportement, pas une simplification neutre.

---

## Lot 3 — L'objectif d'une bouche ✅ LIVRÉ (`9dc442d2`)

**Objet.** Donner un réservoir à la fonctionnalité qui est la douve du produit.

### Le fait qui commande

`generate-household-meal-v1:255-287` lit l'objectif d'un membre dans **son
propre `student_goals`** — une table qui exige un compte. Sans compte : pas de
ligne, `goal: null`, part standard. **La fonctionnalité-douve est muette pour
exactement les gens qu'on veut ajouter.**

### Ce qui est tranché

- **Une colonne `goal` sur la ligne membre**, vocabulaire fermé aux six jetons
  de `MEMBER_GOALS` (`fat_loss`, `muscle_gain`, `recomposition`, `performance`,
  `health`, `maintenance`). Le générateur cesse d'interroger `student_goals`
  pour les membres. *(Les deux vocabulaires sont alignés : `muscle_gain` a été
  ajouté à `student_goals` par `20260805121000`.)*
- **Une personne qui réclame son profil reprend la main sur son objectif.** La
  source ne change pas — c'est **qui a le droit d'y écrire** qui change. Il faut
  une seconde RPC, étroite : *poser l'objectif de ma propre ligne*. Un champ, un
  lecteur, deux écrivains possibles.
- **Sans âge, aucun objectif n'est appliqué.** L'âge reste facultatif (le flux
  de 90 secondes n'est pas bloqué), mais la personne reçoit une part standard
  tant qu'il manque. `is_minor` cesse de rendre un booléen : il lui faut trois
  états — mineur, majeur, **inconnu** — parce qu'« inconnu » et « majeur »
  doivent désormais produire des résultats opposés. Le `coalesce(…, false)`
  disparaît au lieu d'être inversé.

### Une prémisse corrigée

L'idée qu'un profil sans compte ne doit pas porter « d'objectif de perte
agressif » est plus rassurante qu'il n'y paraît : `fat_loss` ne produit qu'une
consigne d'assiette — `household_portions.ts:99`, *« generous vegetables, full
protein share, smaller starch share »*. Aucun chiffre, aucun canal
d'agressivité. L'agressivité vit dans `student_goals.target_weight`
(`20260805130000`) et dans les mesures corporelles, **tous deux clés sur un
compte**. Une ligne membre qui ne porte qu'un jeton est bornée par construction.

### Le maître, et ses deux objectifs

Il en portera un sur sa ligne membre (**sa portion**) et un dans `student_goals`
(**la doctrine du repas** — `situation`, `practical_constraints`,
`content_locale`, `generate-household-meal-v1:408-507`). Sans règle, rien
n'empêche `fat_loss` d'un côté et `maintenance` de l'autre : le plat composé
pour perdre du gras, la part servie en maintien, et personne pour le voir.

**Tranché : un seul champ à l'écran, écrit dans les deux au même geste.**
`student_goals` reste seul porteur de la situation et des contraintes. Pas de
trigger — la règle vaudrait pour une seule personne du foyer, et un trigger qui
ne s'applique qu'à un cas est un piège pour le prochain lecteur.

---

## Lot 3B — Le corps sur le chemin du foyer ✅ LIVRÉ (`c95706ee`)

> Fiche produit : [FF-047 · Le corps dans la part du foyer](../fonctionnalites/le-foyer/FF-047-le-corps-dans-la-part-du-foyer.md).

**Objet.** Rendre le cran 2 réel. Aujourd'hui, réclamer son profil ne change
**rien** à la portion servie par le foyer.

### Le fait qui commande

| Chemin | Corps lu |
|---|---|
| `generate-meal-v1:514-521` | `loadStudentBody` + `mealBodyContextFrom` → taille, bande d'âge, sexe, dernier poids, dernier tour de taille. Passé en `body:` à `buildMealPrompt` (`meal_generation.ts:944`), rendu par `mealBodyBlocks` |
| `generate-household-meal-v1` | **zéro occurrence** de `loadStudentBody`, `mealBodyContextFrom` ou `heightCm` |

Même avec un compte, même avec un poids suivi, le générateur du foyer ne connaît
de vous qu'un jeton d'objectif et un booléen mineur.

### Ce qu'il faut faire

1. **Charger le corps par membre qui a un `user_id`.** Les autres portent
   `null`. Best-effort et jamais bloquant : l'arbitrage est déjà écrit et nommé
   sur le chemin individuel (`generate-meal-v1:511-532` — *« refuser le dîner de
   quelqu'un parce qu'on n'a pas su lire sa balance serait la mauvaise moitié de
   l'arbitrage »*).
2. **`PortionMember` gagne `body: MealBodyContext | null`**
   (`household_portions.ts:55`).
3. **`buildPortionBrief` enrichit la ligne du membre** (`household_portions.ts:123`).
4. **`restrictionFlag` par membre, fail-closed** — comme l'individuel, où il
   part à `true` (`generate-meal-v1:492`) et n'est abaissé que par une lecture
   réussie du plancher. Un membre dont le plancher est illisible ne reçoit
   **aucun** fait corporel.

### La règle qui tient tout le lot

> **L'entrée gagne des faits, la sortie n'en gagne aucun.**

Le brief se termine déjà par *« NEVER state a reason, a goal, a calorie count or
anything about a person's body … They are read aloud at the table by the whole
household »*, et `FORBIDDEN_PORTION_TERMS` (`household_portions.ts:152`, appliquée en `:215`) est la
ceinture déterministe qui l'applique — **bilingue**, parce que ce dépôt a déjà
payé « garde testée dans une seule langue ». Brancher le corps augmente
mécaniquement la pression sur cette ceinture : le modèle aura enfin de quoi
dire « pour ton poids ».

### Les pièges nommés

- **Le foyer mixte.** Deux membres avec corps, trois sans. Le brief doit rester
  homogène à table : une consigne visiblement plus « précise » pour les uns
  fabrique une asymétrie que personne n'a demandée.
- **Le coût.** N lectures de corps par génération, là où il y en avait une. À
  mesurer, pas à supposer — c'est la ligne que le persona prioritaire paie.
- **`CONTRACT.md`** : l'interdit sur les calories ne bouge pas.

### Preuve d'acceptation

Un run réel, foyer mixte, où la consigne de service d'un membre **avec** corps
diffère de celle du même membre **sans** corps — et la ceinture
`FORBIDDEN_PORTION_TERMS` verte sur les deux sorties, **dans les deux langues**.

#### Livré le 2026-08-10 — ce qui a été prouvé, et ce qui ne l'a pas été

**Prouvé** : 1798 tests deno verts, `deno check` propre, et **six mutations
donnent six rouges** (plancher désarmé, appariement sur `user_id`, plancher
fail-open, ligne sans faits, fil débranché, groupe `height` retiré). La ceinture
a été **rearmée** : trois groupes (`height`, `measurements`, `age`) plus
`bmi`/`imc`, en formes possessives uniquement. Vérifié avant correction que
« 1,5 part vu ta taille », « a bigger share for your height », « à ton âge »,
« ton tour de taille » et « BMI » passaient **toutes**, dans les deux langues.

**Coût mesuré, pas estimé** : 7 allers-retours par bouche qui a un compte, 0
pour une bouche sans compte (8 si elle porte un engagement `measure='energy'`).
L'estimation à la lecture du code disait 6 — la lecture des mesures datées est
cachée deux niveaux plus bas, dans la dérivation FF-031. Deux tests-cliquets
épinglent le chiffre.

**NON FAIT** : aucun run réel avec appel Gemini. Il faudrait une fixture avec
foyer publié et deux comptes portant des mesures. La preuve d'acceptation
ci-dessus **n'est donc pas honorée** ; les quatre garanties sont prouvées au
niveau où elles se décident, pas au niveau du texte que le modèle produit.

**TROU LAISSÉ OUVERT, ET C'EST UNE DÉCISION PRODUIT** : l'écho numérique nu
(« pour tes 84 kg ») n'est mordu par personne. Le moteur apparie des mots ; il
ne sait pas exprimer « un nombre suivi d'une unité, rattaché à une personne ».
Écrit en toutes lettres au-dessus de la liste
(`_shared/keel/household_portions.ts:270-277`).

**DÉCISION PRISE ET NOMMÉE** : un mineur — et une bouche d'âge **inconnu** — ne
reçoit aucun fait corporel, même avec un compte (`meal_body.ts:247`). Poser
« 152 cm, 41 kg » à côté du prénom d'un enfant rend la direction `fat_loss`
**dérivable** sans qu'on l'ait demandée. Réversible en une ligne.

---

## Lot 4 — L'ajout en 90 secondes ⚠️ LIVRÉ À ⅔ (`26de20ab`)

> Fiches produit : [FF-045 · Décrire son foyer](../fonctionnalites/le-foyer/FF-045-decrire-son-foyer.md)
> et [FF-046 · L'allergie d'une bouche sans compte](../fonctionnalites/le-foyer/FF-046-l-allergie-d-une-bouche-sans-compte.md).
> **Le découpage en deux fiches est délibéré** : l'écran et la contrainte de
> sécurité n'ont ni les mêmes modes de défaillance, ni le même statut. Fondre
> l'allergie dans la fiche de l'écran l'aurait enterrée dans une §3.

**Objet.** L'écran qui décide de la complétude du foyer, donc de la douve, donc
de la rétention.

### Ce qui est tranché

- **Le maître est la première bouche du flux.** Il est un convive, pas un
  administrateur. Effet de bord décisif : la falaise disparaît — aujourd'hui la
  génération refuse de démarrer si le maître n'a pas d'objectif **et** de
  situation (`goal_required`, `generate-household-meal-v1:267-271`), c'est-à-dire
  exactement après l'effort d'avoir saisi trois personnes.
- **Champs de la bouche** : prénom (**obligatoire** — sinon la portion disparaît
  en silence), âge (facultatif, mais il conditionne l'objectif), objectif
  (facultatif), contraintes.

### Les allergies : trois choses, pas deux

C'est un trou de sécurité, pas un manque de confort. Les allergies vivent dans
`student_safety_constraints` (`20260727090000:617`), **clé sur `user_id`**. Le
générateur en fait l'union qui arme le prompt
(`generate-household-meal-v1:390` — *« une allergie d'un seul membre gouverne
TOUTE la casserole »*), et si la lecture échoue **toute la génération s'arrête**
(`safety_constraints_unreadable`, ligne 399). Une bouche sans compte n'a donc
nulle part où porter son allergie.

Et elle ne peut pas atterrir dans `household_food_restrictions` : cette table est
celle du **pouvoir domestique**, sans colonne de raison, délibérément — et son
verrou (`household_restriction_lock.ts:26-38`) **efface le « pourquoi » du
plat** pour que Sophia ne porte pas une décision parentale comme un conseil de
santé. Y mettre une allergie tairait la raison médicale et classerait un
allergène au rang d'un Nutella interdit.

| | Nature | Traitement |
|---|---|---|
| **Allergie** | médicale | union de sécurité, fail-closed |
| **Règle de maison** | parentale | verrou qui tait le pourquoi |
| **Aversion** | goût | préférence |

**Tranché** : une contrainte de foyer clée sur `member_id`, avec un `kind`
explicite qui sépare allergie et règle de maison. Un `kind` n'est pas une
« raison » au sens que la migration interdit — c'est précisément ce qui empêche
la confusion qu'elle redoute.

### Ouvert

- ~~Le plafond de 8 personnes : contrainte en base ou garde d'écran ?~~
  **Tranché au lot 7 : en base.** `keel_household_max_mouths()` le nomme,
  `keel_household_add_member` le cite.

### Livré le 2026-08-10 — et la moitié qui n'est pas partie

**Livré et commité** : la table `household_member_allergies` (migration
`20260810170000`), le module `_shared/keel/household_safety.ts` (dérivation du
slug à la lecture, `householdHardConstraints` qui rend les deux sorties d'un
seul geste), les deux RPC d'identité séparées
(`keel_household_set_member_name`, `keel_household_set_member_birth_date`), et
l'écran — le maître d'abord, puis les bouches en rafale. `addHouseholdMember`,
`removeHouseholdMember` et `setMemberGoal` n'avaient **aucun appelant** depuis
le lot 1 : ils en ont un. 14 clés i18n mortes retirées.

**Preuves** : 1880 tests deno verts (baseline 1798), `household_rls_test.sql`
passe **56** assertions sur la base réelle (36 avant), typecheck frontend exit 0,
514 vitest verts hors les 2 rouges connus du garde de couverture. Table neuve :
`anon` sans SELECT, `authenticated` sans INSERT ni TRUNCATE, RLS active. Deux
mutations vérifiées : `grant select to anon` fait rougir l'assertion 09, une
allergie écrite **aussi** en règle de maison fait rougir la 44.

**⚠️ NON COMMITÉ, ET C'EST LE TROU LE PLUS COÛTEUX DU CHANTIER** : les trois
retouches de `generate-household-meal-v1/index.ts` (lecture des allergies de
foyer avec le MÊME fail-closed, `householdHardConstraints`, `applyHouseRuleLock`
alimenté par les seules règles de maison) sont restées sur le disque — le
fichier importe des modules d'une session en vol. **Conséquence vérifiée le
2026-08-10 : à `HEAD`, `household_safety.ts` n'a aucun importeur.** L'écran
collecte une allergie que rien ne lit côté serveur.

**NON FAIT** : aucune vérification navigateur (zéro foyer et zéro persona en
base locale), donc le rendu à 320 px est **raisonné et non mesuré**. Aucun run
réel du générateur : `POST generate-household-meal-v1` rend 404 en local,
reproduit sur la version **commitée** — le registre du routeur edge est figé au
démarrage du CLI.

**TROU CONNU, NON REFERMÉ, ET IL SURVIT AU COMMIT MANQUANT** : le chat ne voit
pas les allergies du foyer. `sophia-brain/router/run.ts:1329` charge
`student_safety_constraints` du **seul locuteur** ; `applyKeelOutputLocks` n'a
donc rien à comparer pour une bouche sans compte. Même une fois le générateur
recâblé, un parent qui demande « je cuisine quoi ce soir ? » dans le chat n'a pas
l'allergie de son enfant armée.

---

## Lot 5 — Les envies, version maître 🟠 TERMINÉ, **NON COMMITÉ**

> Fiche produit : [FF-050 · L'envie de la semaine](../fonctionnalites/le-foyer/FF-050-l-envie-de-la-semaine.md).
> **Le code est fini et vert sur le disque.** Il n'est pas dans `HEAD` : le
> changement d'interface `envies → envyLine` exige
> `generate-household-meal-v1/index.ts`, qui importe `food_composition.ts`, non
> suivi, d'une session qui écrit encore. Voir « Pourquoi le lot 5 attend » en
> tête de document. La migration `20260810210000_household_envy_master_line.sql`
> est appliquée en local et **non suivie par git**.

**Objet.** Remplacer la récolte par membre par une ligne que le maître écrit.

**Tranché** : `household_envy_submissions` **survit**, avec son ancrage
`week_start` et son unique par semaine ; l'écriture est réservée au maître ;
`mergeEnvies` et la carte « qui a parlé, qui s'est tu » partent.

L'ancrage à la semaine est la raison du choix : sans lui, rien ne distingue
« Marc en a marre du poulet » écrit ce matin de la même phrase oubliée depuis six
semaines, et le générateur la servirait pareil.

⚠️ Contrairement aux quatre fonctions mortes du lot 2, `mergeEnvies` est
**appelée pour de vrai** (`household_meal_generation.ts:135`). Ce lot retire du
code d'un chemin vivant.

### Ce que la livraison a dû trancher en plus

**`week_start` est recalée sur le lundi ISO, à l'écriture comme à la lecture**
(`20260810210000_household_envy_master_line.sql`). La colonne s'appelait
`week_start` mais acceptait n'importe quelle date, et l'écran y écrivait la date
**du jour** : une envie déposée lundi n'était donc plus trouvée par une
composition lancée mercredi (`where week_start = <jour de départ>`). Le foyer
recevait un plan qui ignorait sa demande, sans une seule erreur nulle part.
L'unique passe du même geste de `(foyer, personne, semaine)` à
`(foyer, semaine)` : « une ligne par semaine » n'était vrai qu'en commentaire.

**La carte n'apparaît que pour le compte maître.** Un membre ne voit pas la
ligne en lecture seule — la policy `for select` de tout le foyer reste ouverte,
c'est l'écran qui ne rend rien. *Question ouverte, pas décision fermée* : rendre
la phrase visible à tout le foyer est faisable sans toucher à la base.

---

## Lot 6 — La réclamation de profil ✅ LIVRÉ (`193e228a`)

> Fiche produit : [FF-048 · Réclamer son profil](../fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md).

**Objet.** Attacher un compte à une ligne qui existe déjà.

**Tranché** : version minimale, **maintenant**. Le lot 1 la rend presque
gratuite — c'est une écriture de `user_id` sur une ligne existante, et ses
portions, ses interdits et son historique lui restent attachés.

**Ce qu'elle livre** : le lien, l'attachement, la lecture du plan, la RPC étroite
« poser l'objectif de ma propre ligne », et — depuis le lot 3B — **une portion
qui change vraiment**.

**Ce qu'elle ne livre pas** : composer, ajouter, retirer, restreindre. Une seule
personne gouverne le menu. Ni chat ni mesures corporelles dans cette version :
ils viendront quand quelqu'un les demandera.

`household_invitations` et `keel_household_join` **changent de rôle** : ce n'est
plus l'entrée dans le produit, c'est la réclamation d'un profil.

### Livré le 2026-08-10 — ce que la livraison a dû trancher en plus

**La cible vit sur l'invitation, pas sur le join.** `household_invitations`
gagne `member_id` : le maître désigne QUI il invite. L'alternative — choisir la
ligne au moment de rejoindre — ferait d'un lien qui fuite le droit de se
déclarer **n'importe qui** du foyer.

**L'ordre des refus du join est inversé, et c'était un défaut réel.** L'adresse
est vérifiée AVANT l'état du compte : avant, un voleur de jeton qui avait déjà
son propre foyer recevait `already_in_household` — un motif qui ne parle pas du
vol. Le test « jeton volé » ne passait qu'au prix d'une fixture qui sortait
l'intrus de son foyer.

**Une RPC de plus exécutable par `anon`** : `keel_household_preview_invitation`.
Trois champs (nom du foyer, prénom de la bouche, adresse invitée) rendus à qui
détient **déjà** le jeton ; elle ne le consomme pas et rend
`{valid:false, reason:unknown_token}` sur un jeton bidon — vérifié.

**Une fixture qui mentait, corrigée au passage** : les assertions « bouche d'un
AUTRE foyer » lisaient le `member_id` du voisin sous le JWT du maître, à qui RLS
ne rend rien. Le sous-select rendait `NULL`, et le test prouvait qu'un `NULL` est
refusé — pas qu'un identifiant étranger l'est.

**Preuves** : `household_rls_test.sql` passe **76** assertions sur la base réelle
(56 avant), 1880 tests deno verts, typecheck frontend exit 0, 517 vitest verts
hors les 2 rouges connus de FF-028. Mutation vérifiée : un `join` qui **insère**
au lieu d'**attacher** fait rougir l'assertion 67.

**⚠️ TROU CONNU, NON REFERMÉ, ET C'EST UNE DÉCISION COMMERCIALE** : une personne
sans compte ne peut pas EN CRÉER un. L'inscription est fermée hors
`?role=coach` (`frontend/src/pages/Auth.tsx:59`), et `/start` attache au coach
maison — une relation de coaching, pas une place à table. La page de réclamation
le **DIT** au lieu de mener à un formulaire qui échoue
(`frontend/src/keel/pages/JoinHouseholdPage.tsx:42-49`). C'est le seul endroit
où le fil s'arrête.

---

## Lot 7 — Le prix ⚠️ DÉFINITION SEULE (`f9efc488`)

> Fiche produit : [FF-049 · Le prix du foyer](../fonctionnalites/le-foyer/FF-049-le-prix-du-foyer.md).
> **Rien ne facture.** Ce qui est livré, c'est la DÉFINITION de ce qu'on
> facturera ; les cinq gestes qui manquent sont humains, et aucun n'est faisable
> par un agent.

**Objet.** 12,99 €/mois foyer entier, +2 €/mois par profil réclamé.

**Fait vérifié** : **zéro occurrence de `household`** dans `stripe-*` et
`_shared/billing-tier.ts`. Le vocabulaire de siège existant est entièrement
coach-side (49 € plateforme + sièges élèves). Le prix du foyer n'existe nulle
part.

**Tranché** : dans ce chantier, **en deux morceaux séparés** —

1. **Le plafond de 8 en base**, avec la migration du bloc structurel : il touche
   le schéma, il part avec le schéma.
2. **Stripe en dernier, détachable** : une décision commerciale réversible ne
   doit jamais bloquer une migration qui ne l'est pas.

### Le +2 €, et le plafond

**Tranché : une ligne sur l'abonnement du maître.** Une seule carte dans tout le
foyer, +2 € par profil réclamé. La machinerie existe :
`stripe-reconcile-seats:27,54,230` sait déjà pousser une **quantité** sur un item
d'abonnement, sans proration et avec clé d'idempotence.

⚠️ **Le coût produit à surveiller** : le maître paie un accès qu'il ne reçoit
pas, et il peut le retirer. Réclamer son profil devient une **faveur du maître**,
pas un droit de la personne. Si le retrait d'un profil réclamé devient un geste
courant, le modèle est à revoir — pas la facturation.

**Tranché : le plafond de 8 vit en base**, dans la RPC d'ajout, avec un motif
nommé rendu à l'écran. Même raisonnement que `keel_household_invite`, dont le
commentaire l'a déjà écrit (`foundation.sql:434`) : *« une limite d'UI n'est pas
une limite »*. Le plafond existe à cause du coût LLM — 8 bouches, ce sont 8
portions à composer à chaque génération — donc il doit tenir face à un appel
direct de la RPC, pas seulement face à un bouton.

### État au 2026-08-10 — la frontière

**Livré, en base et testé** (`20260810120000`, puis `20260810260000`) :

- le plafond de 8, motif `household_full`, dans `keel_household_add_member` —
  et la RPC **cite** désormais `keel_household_max_mouths()` au lieu de recopier
  le littéral ;
- `keel_household_billable_profiles(uuid)` — **la définition unique** de la
  quantité à facturer : une ligne membre qui porte un compte, **le maître
  exclu**. Ne compte ni une bouche sans compte, ni une invitation non réclamée.
  `service_role` seul (elle prend un foyer en argument et est `security
  definer`) ;
- 11 assertions de plus dans `household_rls_test.sql` (101 au total, 0 FAIL),
  dont celle qui refuse de confondre **8 bouches** et **4 profils facturés**.

**Pas livré, et volontairement pas simulé** — rien de ce qui suit n'existe, même
en ébauche, parce qu'une fausse intégration donnerait l'illusion que le foyer
est vendable :

1. **Deux prix Stripe**, créés par un humain, puis posés en secrets :
   `STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY` (12,99 €, quantité 1) et
   `STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY` (2,00 €, quantité réconciliée).
2. **Un jeton de palier.** `subscriptions_tier_check` n'admet que `coach` et les
   trois paliers grand public morts ; `profiles_access_tier_check` de même.
3. **Une troisième forme de tunnel** (`plan='keel_household'`) dans
   `stripe-create-checkout-session`, à deux articles.
4. **`stripe-reconcile-households`**, calqué sur `stripe-reconcile-seats`, avec
   sa table de période (forme de `coach_billing_periods`).
5. **Le déploiement** : `supabase db push` puis `functions deploy`.

### Ouvert

- **La ligne à mesurer en premier** : la recommandation quotidienne (FF-028)
  ajoute ~30 appels LLM par mois et par foyer. Le lot 3B en ajoute N-1 lectures
  de corps par génération. La marge de ~10 € tient probablement — mais c'est le
  quotidien qui s'accumule en silence, pas la génération hebdomadaire.

- **« Retirer l'accès » n'existe pas comme geste.** La décision du 2026-08-10 dit
  que le maître *peut retirer* un profil réclamé qu'il paie. Aujourd'hui le seul
  retrait disponible est `keel_household_remove_member`, qui **détruit la
  bouche** — ses portions, ses allergies, sa place dans le menu — alors que la
  personne continue de manger dans ce foyer. Le détachement (`user_id` remis à
  NULL, la ligne reste) n'est pas construit : il change ce que le produit promet.

- **Supprimer son compte supprime sa bouche.** `household_members_user_id_fkey`
  est `on delete cascade` — un héritage du modèle d'avant le lot 1, où une bouche
  ÉTAIT un compte. Un profil réclamé qui exerce son droit RGPD fait donc
  disparaître une bouche du foyer, et le foyer maigrit sans que personne l'ait
  décidé. Même famille de question que le point précédent.

- **Aucun chemin du foyer ne vérifie de solvabilité.** `generate-household-meal-v1`
  ne lit pas `access_tier`. Le foyer est gratuit quoi qu'il arrive — acceptable
  pendant un pilote, mais c'est un choix, pas un état.

---

## Lot 8 — Les résidus ✅ LIVRÉ (`476a4acb`)

> **Pas de fiche produit, et c'est délibéré** : les vagues de courses
> appartiennent au domaine `composition-des-repas`, pas au foyer, et supprimer
> un jumeau n'est pas une fonctionnalité. La fiche existante
> [FF-005](../fonctionnalites/composition-des-repas/FF-005-strategie-de-courses.md)
> a été **corrigée** — elle décrivait le jumeau comme un choix, et sa règle R6
> exigeait « les mêmes tests des deux côtés du jumeau ».

### Le doublon des vagues de courses

`_shared/keel/grocery_waves.ts` a **zéro importeur** hors son test ; le chemin
vivant est une **copie front** (`api/groceryWaves.ts:31`, `MAX_FRIDGE_DAYS = 3`
en dur, le commentaire ligne 27 dit lui-même « COPIE »), consommée par
`KitchenToday.tsx:78` → `TodayPage.tsx:249`. Le jour où le frigo passe à 4 jours,
l'une des deux ment.

*Nuance honnête : `KitchenToday.tsx` n'est pas commité. Avant la branche en
cours, les **deux** implémentations étaient mortes.*

**Tranché : le backend est la source, le front ne fait qu'afficher.** Le motif
n'est pas esthétique — toutes les surfaces envisagées (PDF du frigo, liste de
courses partageable sans compte, widget « ce soir ») sont **hors navigateur** et
ne peuvent pas exécuter un calcul React. Garder la logique au client, c'est
garantir de la réécrire à la première de ces surfaces.

**Reste à décider dans le lot** : les vagues sont-elles calculées à la lecture,
ou **stockées avec le plan** ? Recommandation : calculées à la lecture. `cook_on`
et la liste de courses sont déjà dans la ligne du plan ; stocker les vagues
créerait un troisième état à invalider quand une préparation change de jour.

#### Livré le 2026-08-10 — comment la source est devenue effective

**À la lecture, comme recommandé.** Rien n'est stocké, aucune migration.

Le point dur était : « le backend est la source » suppose un endroit serveur où
la lecture a lieu, et il n'y en a pas — le front lit `student_generated_meals`
directement en PostgREST. Les quatre issues envisagées se départagent ainsi :

| Issue | Verdict |
|---|---|
| Fonction SQL | Une **troisième** écriture de la règle, en PL/pgSQL. Pire que le doublon. |
| Edge function de plan | Crée une surface, un déploiement et une auth pour ne rien calculer de plus ; `keel-meal-plan-v1` avait déjà été retirée faute d'appelant. |
| Le générateur émet les vagues | Contredit « à la lecture », et exige de toucher `generate-household-meal-v1` — interdit sur cette branche. |
| **Le front importe le module serveur** | ✅ retenu. |

Le motif du lot — « les surfaces à venir sont hors navigateur » — porte sur
**où la règle est écrite**, pas sur où elle s'exécute. Un PDF construit dans une
edge function importera `_shared/keel/grocery_waves.ts` et obtiendra la même
réponse que l'écran, parce que c'est le **même fichier**.

L'argument qui justifiait le jumeau (« les modules Deno ne sont pas importables
par Vite ») ne tenait pas à la vérification : la clôture d'imports de
`grocery_waves.ts` (21 modules) ne contient **aucun** spécificateur
`jsr:`/`npm:`/`https:` ni **aucun** global `Deno.`, et `tsconfig.app.json` porte
déjà `allowImportingTsExtensions`. Coût mesuré : `tsc -b` vert, bundle
+1,9 ko (1 329,2 → 1 331,1 ko), et le serveur de dev sert le fichier en 200 sans
toucher à `server.fs.allow`.

`wavesAreMeaningful` et `waveAssignments` sont remontés avec le calcul : un PDF
se pose exactement la même question qu'un écran. Ce qui reste côté front est un
**adaptateur de forme**, sans règle (`frontend/src/keel/api/groceryWaves.ts`, 72
lignes contre 248 — et son en-tête dit : *« si tu ajoutes une règle ici, tu as
recréé le jumeau »*).

#### La preuve, avec son contrefactuel

`MAX_FRIDGE_DAYS` 3→4 dans `meal_generation.ts:594` : **4 tests deno rouges ET 3
vitest rouges**. Avec l'ancien jumeau restauré sous la MÊME mutation : **16/16
vitest verts** — l'écran serait resté à 3 jours pendant que le générateur
planifie à 4, sans que rien n'échoue. C'est exactement la divergence silencieuse
que le lot ferme.

**Non-régression par harnais différentiel, jetable** : 300 plans tirés au sort
(dates valides et vides, durées 1-7, 8 rayons dont un inconnu, jetons hors
fenêtre, doublons, accents), ancien module contre nouveau sur les quatre
fonctions : identiques. Harnais muté (ajout de `grains` aux périssables) :
rouge, donc il mord. **Une seule différence intentionnelle** : une date NON VIDE
mais malformée rendait une vague dont le `buyOn` était la chaîne malformée ; elle
rend `[]` maintenant, et l'écran retombe sur la liste plate.

**Preuves** : 3961 tests deno verts (2 rouges connus), 513 vitest verts (2
rouges connus), `tsc -b` exit 0, `deno check` exit 0, eslint exit 0.
`wiring-check` : 3 orphelins → 2.

### Le reste

- Les quatre fonctions mortes du lot 2 (`canRestrict`, `canInvite`,
  `memberVisibility`, `canSeeGoalOf`) sont tombées avec le lot 1+2+3.
- ⚠️ `KitchenToday.tsx` — travail **non commité** d'une autre session, seul
  consommateur des vagues — n'a pas été touché : zéro ligne, shasum vérifié.

### Laissé ouvert

`frontend/src/keel/api/mealWindow.ts` est un jumeau **documenté** de
`_shared/keel/meal_plan_window.ts`, gardé par `meal_plan_window_fixtures.ts` —
l'un des 2 orphelins restants. **Même défaut, même remède, non fait** : son
consommateur `MealBuilder.tsx` appartient à une autre session.

---

## Lot 9 — Les documents ✅ LIVRÉ (2026-08-10)

**Ce qui a été écrit :**

1. **[`docs/fonctionnalites/le-foyer/README.md`](../fonctionnalites/le-foyer/README.md)**
   — la direction du domaine : la règle mère (*une personne gouverne le menu ;
   une bouche n'a pas besoin d'un compte*), le circuit d'ensemble, les crans
   d'intake avec la raison **technique** de la frontière du corps, dix règles
   transverses `F1`–`F10`, le hors-périmètre engageant, et **les six trous
   connus** dans un tableau qui nomme le fichier et la ligne de chacun. Modèle
   suivi : `docs/fonctionnalites/conversation/README.md`.
2. **Sept fiches, `FF-044` → `FF-050`.**
3. **[`FF-005`](../fonctionnalites/composition-des-repas/FF-005-strategie-de-courses.md)
   corrigée** — elle était devenue **fausse** au lot 8 : elle décrivait le jumeau
   des vagues comme un choix, et sa R6 exigeait « les mêmes tests des deux côtés
   du jumeau ». R6 a changé de sens, un bandeau daté dit ce qui a bougé.
4. Le bandeau « périmé » de [`PIVOT-FOYER.md`](PIVOT-FOYER.md) §8 (posé par le
   lot 5) reste ; l'entrée de tête de ce document nomme désormais §8.1–§8.3
   parmi les sections périmées.

### Les identifiants, et pourquoi ils ne sont pas ceux qui étaient réservés

`FF-032`, `FF-033`, `FF-034`, `FF-035` et `FF-036` avaient été réservés ici. Ils
n'ont **pas** été utilisés : trois sessions écrivaient en parallèle et `FF-032` à
`FF-043` étaient déjà cités dans `docs/` au moment d'attribuer. Les cinq
identifiants sont **brûlés**, et les cinq sont écrits en toutes lettres dans
l'index et dans le README du domaine — un identifiant qui n'apparaît nulle part
se fait réattribuer par le prochain `grep`.

### Le découpage, et pourquoi il fait sept fiches et pas cinq

La règle est *une fiche par **fonctionnalité***, pas une fiche par lot. Deux
lots se sont donc dédoublés, et un lot n'a produit aucune fiche :

| Fiche | Couvre | Pourquoi ce découpage |
|---|---|---|
| [FF-044](../fonctionnalites/le-foyer/FF-044-la-bouche-sans-compte.md) | lots 1+2+3 | Un seul modèle, un seul geste, une seule fiche |
| [FF-045](../fonctionnalites/le-foyer/FF-045-decrire-son-foyer.md) | lot 4, l'écran **+** le plafond du lot 7 | Le plafond est un refus d'ajout : il vit là où on le rencontre |
| [FF-046](../fonctionnalites/le-foyer/FF-046-l-allergie-d-une-bouche-sans-compte.md) | lot 4, la sécurité | **Séparée exprès** : autre table, autre ceinture, autre statut (🟠 contre 🟢), et c'est elle qui porte le trou n°1. Fondue dans FF-045, elle aurait été enterrée dans une §3 |
| [FF-047](../fonctionnalites/le-foyer/FF-047-le-corps-dans-la-part-du-foyer.md) | lot 3B | Vaut aussi pour le maître, qui a déjà un compte : ce n'est pas un sous-chapitre de la réclamation |
| [FF-048](../fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md) | lot 6 | Porte les trous n°3, 4 et 5 |
| [FF-049](../fonctionnalites/le-foyer/FF-049-le-prix-du-foyer.md) | lot 7 | Porte le trou n°6. Sans elle, « le foyer est gratuit » n'a aucune adresse dans `docs/fonctionnalites/` |
| [FF-050](../fonctionnalites/le-foyer/FF-050-l-envie-de-la-semaine.md) | lot 5 | Statut à part : livrée sur le disque, non commitée |
| *(aucune)* | lots 0 et 8 | Une lignée de migrations et une suppression de jumeau ne sont pas des fonctionnalités. Le lot 8 a **corrigé** FF-005 au lieu d'en créer une |

---

## L'ordre d'exécution — tel qu'il s'est réellement déroulé

```
Lot 0    ✅ 73115206  la lignée débloquée
Lot 1+2+3 ✅ 9dc442d2  un seul geste — migration + re-clavetage + gardes retournées
         ✅ 6259fcab  (voisin) FF-037 → FF-040 mis à l'abri
Lot 3B   ✅ c95706ee  le corps au foyer      ← dépend de 1 (member_id) et 3 (goal)
Lot 4    ⚠️ 26de20ab  l'écran d'ajout        ← le fil du générateur reste sur le disque
Lot 6    ✅ 193e228a  la réclamation         ← porte les décisions des lots 3 et 3B
Lot 7    ⚠️ f9efc488  le plafond + la définition facturable ; Stripe: 5 gestes humains
Lot 8    ✅ 476a4acb  les résidus            ← une seule définition des vagues
Lot 5    🟠 —         les envies             ← TERMINÉ, NON COMMITÉ (session en vol)
Lot 9    ✅ (ce commit) la direction du domaine, puis sept fiches
```

Les lots 1, 2 et 3 ne se livrent pas séparément : le lot 3 a besoin de la clé du
lot 1, et le lot 2 est la raison pour laquelle le lot 3 est dangereux.

**Ce que l'ordre réel a coûté** : deux moitiés de lot (4 et 5) attendent le même
fichier, `generate-household-meal-v1/index.ts`, partagé avec une session en vol.
Le prochain commit qui le touche doit emporter **les deux**.

---

## Ce qui reste ouvert

### Les décisions de conception — toutes tranchées

| # | Décision | Lot | Sort |
|---|---|---|---|
| 1 | ~~Les vagues : calculées à la lecture, ou stockées avec le plan ?~~ | 8 | ✅ **à la lecture**, le front importe le module serveur |
| 2 | ~~Où le brief de portion place les faits corporels dans le prompt~~ | 3B | ✅ `householdBodyFacts` réutilise `mealBodyBlocks` ; aucun second format |
| 3 | ~~Le plafond : base ou écran ?~~ | 4 → 7 | ✅ **en base**, nommé une fois et cité |

### Les trous connus, non refermés — six, et chacun a une adresse

Ils ne sont pas des oublis. Chacun est porté par une fiche, en §7 ou §11, et le
tableau complet — fichier et ligne — vit dans
[la direction du domaine](../fonctionnalites/le-foyer/README.md).

| # | Trou | Fiche |
|---|---|---|
| 1 | **Le chat ne voit pas les allergies du foyer** (`router/run.ts:1329` = le seul locuteur) — et à `HEAD`, le générateur non plus, faute de commit | [FF-046](../fonctionnalites/le-foyer/FF-046-l-allergie-d-une-bouche-sans-compte.md) |
| 2 | **L'écho numérique nu** (« pour tes 84 kg ») n'est mordu par aucune ceinture | [FF-047](../fonctionnalites/le-foyer/FF-047-le-corps-dans-la-part-du-foyer.md) |
| 3 | **Une personne sans compte ne peut pas en créer un** | [FF-048](../fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md) |
| 4 | **« Retirer l'accès » n'existe pas** — le seul retrait détruit la bouche | [FF-048](../fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md) |
| 5 | **Supprimer son compte supprime sa bouche** (`on delete cascade`) | [FF-048](../fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md) |
| 6 | **Le foyer est gratuit** — aucune garde de solvabilité sur aucun chemin | [FF-049](../fonctionnalites/le-foyer/FF-049-le-prix-du-foyer.md) |

Les trous **4** et **5** sont la même question posée deux fois : *que devient
une bouche quand le compte qui lui est attaché s'en va ?* Y répondre, c'est
décider si la ligne survit à son compte — ce qui est exactement ce que le lot 1
affirme pour tous les autres cas.

### Le travail non commité, et ce qu'il bloque

| Ce qui attend | Pourquoi | Ce que `HEAD` porte en attendant |
|---|---|---|
| Le fil des allergies dans `generate-household-meal-v1` (lot 4) | Le fichier importe des modules d'une session en vol | `household_safety.ts` **sans aucun importeur** ; la table est écrite et lue par personne côté serveur |
| Le lot 5 en entier, migration comprise | Même fichier, et un changement d'interface qui l'exige | `mergeEnvies` et la récolte par membre |

### Les chiffres à relever, qui ne sont pas des décisions

- Le coût LLM de la recommandation quotidienne (FF-028), ~30 appels/mois/foyer,
  qui s'accumule en silence.
- Le coût des lectures de corps par génération : **7 par bouche avec compte**
  (mesuré, pas estimé). Un foyer de 8 dont 4 comptes ⇒ 28 lectures.
- La marge nette par foyer, coût LLM déduit. La marge de ~10 € tient
  probablement — mais c'est le quotidien qui l'use, pas la génération
  hebdomadaire.

### Ce qui n'a jamais été fait, sur aucun lot

**Aucun run réel avec appel Gemini.** Aucune vérification navigateur. `POST
generate-household-meal-v1` rend 404 en local — reproduit sur la version
**commitée** — parce que le registre du routeur edge est figé au démarrage du
CLI. Toutes les garanties de ce chantier sont prouvées **au niveau où elles se
décident** : tests unitaires, mutations, et `household_rls_test.sql` sur la base
réelle. Aucune ne l'est au niveau du texte que le modèle produit.

---

## Hors de ce chantier — pour le borner

Mode cuisine, liste de courses partageable sans compte, widget « ce soir », PDF
du frigo. Ce sont des **surfaces**, pas le modèle. Les mêler ici ferait un
chantier qu'on ne finit pas.

**Et un trou connu, hors périmètre mais qui touche le cran 2** :
[FF-003-intake-structure](../fonctionnalites/composition-des-repas/FF-003-intake-structure.md)
est au statut **🔵 Idée**. La prose libre (`situation`) part telle quelle dans le
prompt et n'est structurée par personne. Le champ le plus expressif du cran 2 est
aujourd'hui celui qui n'engage à rien.

---

## Les règles opérationnelles

1. **Jamais seul** : `supabase db push`, `db reset`, `functions deploy`,
   `secrets`, `link` — un hook les bloque. En local, `migration up` est permis.
2. **La base locale est partagée.** Jamais de `db reset`.
3. **Tests Deno avec l'environnement purgé**, sinon 114 faux rouges :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
4. **Typecheck frontend** : `npx tsc -b` (le tsconfig racine ne vérifie rien).
5. Code edge modifié → `docker restart supabase_edge_runtime_Sophia_2`.
6. Branche `ff-001-quotidien-du-coach`, aucune autre, aucun push.

## Les pièges que ce dépôt a déjà payés

- Un morceau construit, testé, déployé, **dont personne n'a rebranché le fil**.
  Mode d'échec n°1.
- Une garde testée dans **une seule langue** est à moitié désarmée.
- Un **paramètre de garde optionnel** est une garde désarmée.
- `create or replace view` **perd `security_invoker`** — invisible aux tests.
- `revoke from public` **laisse `anon`** — vérifier `has_table_privilege`.
- Toute table neuve donne **tout** à `authenticated` par défaut, `TRUNCATE`
  compris — et `TRUNCATE` échappe à RLS.
- Une **fixture qui ment** rend une fonctionnalité verte sans qu'elle marche.
- **La vérité est en base, jamais dans une réponse HTTP** — ni dans le ledger
  des migrations, comme le lot 0 vient de le montrer.
