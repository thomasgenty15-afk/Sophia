# Les fiches de fonctionnalité

> Une fonctionnalité qui n'a pas de fiche ici n'existe pas comme décision : elle
> existe comme code, ce qui n'est pas la même chose. Ce dossier est l'endroit où
> l'on écrit **ce qu'on construit et pourquoi**, avant de le construire.

---

## La règle

**1. Une fiche par fonctionnalité, dans le sous-dossier de son domaine.**
Jamais à la racine. Si aucun domaine ne convient, c'est probablement que la
fonctionnalité en recouvre deux — coupe-la, ou ouvre un domaine et dis-le ici.

**1 bis. La DIRECTION d'un domaine vit dans son README, jamais dans une fiche.**
Une fiche décrit une fonctionnalité — quelque chose qui permet de faire. Ce qui
gouverne un domaine entier (sa règle mère, son circuit d'ensemble, ses règles
transverses, ce qu'il s'interdit) va dans le README du sous-dossier, où tout le
monde le lit en arrivant. Une « fiche de direction » se retrouve numérotée,
statutée et triée comme les autres — c'est-à-dire perdue.
Le modèle à suivre : [`conversation/README.md`](conversation/README.md).

**2. La fiche suit [TEMPLATE.md](TEMPLATE.md), section par section.**
Les onze sections sont obligatoires. Une section sans contenu s'écrit
« *néant* » — jamais supprimée : une section absente se lit « on n'y a pas
pensé », une section vide se lit « on y a pensé, il n'y a rien ».

**3. L'identifiant est global et définitif : `FF-042`.**
Il ne se renumérote pas quand la fiche change de dossier, et il ne se réutilise
jamais. Un identifiant cité dans un commit, un test ou une conversation doit
rester lisible dix-huit mois plus tard.

**4. Le nom de fichier est `FF-042-nom-parlant.md`**, en minuscules, sans
accent, mots séparés par des tirets.

**5. Le statut est en tête, et il est tenu à jour.**
Une fiche `🟢 Livrée` dont le code ne fait pas ce qu'elle décrit est pire
qu'une absence de fiche.

| Statut | Sens |
|---|---|
| 🔵 Idée | discutée, pas arbitrée. Périmètre flou assumé |
| 🟡 Spécifiée | arbitrée, pas construite. Les critères d'acceptation tiennent |
| 🟠 En cours | du code existe, la fiche n'est pas encore honorée en entier |
| 🟢 Livrée | le code fait ce que la fiche dit, et c'est vérifié |
| ⚪ Gelée | volontairement suspendue. **Dire pourquoi** |
| 🔴 Abandonnée | on ne le fera pas. **Dire pourquoi** — c'est ce qui empêche de le reproposer dans six mois |

**6. Ce qui est hors périmètre est aussi engageant que ce qui est dedans.**
La section « Hors périmètre » n'est pas une liste de regrets : c'est ce qu'on
s'interdit, et un no-go se lève par une décision écrite, pas par une envie en
cours de route.

**7. Une fiche cite le code, le code cite la fiche.**
Une fiche qui affirme « le plancher TCA suspend déjà ceci » nomme le fichier et
la constante. Un module qui implémente une fiche la cite dans son en-tête. Sans
ce va-et-vient, les deux divergent en silence — le mode d'échec que ce dépôt
paie le plus souvent.

---

## Les domaines

Onze sous-dossiers, dérivés de ce que le dépôt contient **aujourd'hui** (edge
functions, modules `_shared/keel/`, écrans). Ils ne décrivent pas une
architecture souhaitée : ils décrivent le produit tel qu'il est.

### `methode-du-coach/`
Ce que le coach écrit, et qui gouverne tout le reste. La doctrine et ses
versions, le point de départ (forks/packs), la délégation à la maison, le
mapping alimentaire, le corpus documentaire, la note 1:1, le message de cohorte,
et le **verrou déterministe** qui empêche l'agent de la contredire.

`doctrine*.ts` · `protocol_*.ts` · `food_*.ts` · `document_corpus*.ts` ·
`coach_broadcast.ts` · `coach_note.ts` · `forbidden_matcher.ts` ·
`coach-doctrine-v1` · `coach-protocol-v1` · `keel-coach-broadcast-v1` ·
`CoachDoctrinePage` · `CoachProtocolPage` · `CoachMealsPage`

### `composition-des-repas/`
Ce que l'agent compose : plats, **préparations**, sessions de cuisine, fenêtre
de plan, liste de courses et ses vagues, précision de repas, export PDF.

`meal_generation.ts` · `meal_plan_window.ts` · `meal_precision*.ts` ·
`grocery_waves.ts` · `week_plan_generation.ts` · `planned_dish_*.ts` ·
`generate-meal-v1` · `generate-week-plan-v1` · `meal-document-v1` ·
`StudentWeekPlanPage` · `MealBuilder` · `ShoppingListPanel`

### `le-foyer/`
Plusieurs personnes, une cuisson. Appartenance et identité d'une bouche,
invitation et réclamation de profil, allergies et règles domestiques, portions
qui bifurquent, prix.

`household*.ts` · `generate-household-meal-v1` · `HouseholdPage` ·
`JoinHouseholdPage` · direction : [le-foyer/README.md](le-foyer/README.md) ·
autorités : [PIVOT-FOYER.md](../keel/PIVOT-FOYER.md) (⚠️ §7, §7.5, §8.1–§8.3
périmés) · [CHANTIER-FOYER-PROFILS.md](../keel/CHANTIER-FOYER-PROFILS.md)

### `conversation/`
Le dialogue et sa mémoire. Le cerveau, les compétences, le routage, la mémoire
longue et sa consolidation.

`sophia-brain` · `chat-inbound-v1` · `trigger-memorizer-daily` ·
`trigger-topic-compaction` · `promote-candidate-memory-items` · `ChatPage`

### `suivi-quotidien/`
La boucle de mesure : le tap du soir, le fait de la journée, la coche, le point
du dimanche, l'adhérence, la bascule de semaine.

`daily_pulse*.ts` · `daily_recap*.ts` · `weekly_flow*.ts` · `week_review*.ts` ·
`adherence.ts` · `meal_tick.ts` · `following_io.ts` · `keel-daily-pulse-v1` ·
`keel-weekly-flow-v1` · `evaluate-adherence-v1` · `TodayPage` · `ProgressPage`

### `securite-et-sante/`
Les planchers qui ne se négocient pas. Contraintes dures de l'élève, allergènes,
plancher TCA, conditions médicales, ressources de crise, âge.

`restriction_guard.ts` · `safety_constraints*.ts` · `medical_condition_floor.ts` ·
`allergen_catalog.ts` · `crisis_resources.ts` · `student_age.ts` ·
`StudentHealthPage` · autorité : [CONTRACT.md](../keel/CONTRACT.md)

### `relation-coach-eleve/`
Ce qui circule entre eux **sans canal 1:1** : la page du lundi, l'invitation, la
relance, la synthèse de cohorte.

`coach_synthesis*.ts` · `reengagement*.ts` · `coach-synthesis-v1` ·
`coach-invite-student-v1` · `keel-reengage-v1` · `CoachHomePage` ·
`CoachWeeklyPage` · `CoachStudentPage` · autorité : [MODEL.md](../keel/MODEL.md)

### `acquisition-et-acces/`
Comment on entre. Pages de vente, inscription coach, inscription libre, `/join`,
essai, rôles et paywall.

`coach-signup-v1` · `send-welcome-email` · `trigger-retention-emails` ·
`LandingPage` · `GymsLandingPage` · `CommunitiesPage` · `StartPage` · `JoinPage`

### `abonnement-et-facturation/`
Qui paie quoi. Sièges, périodes, réconciliation Stripe, portail client.

`stripe-*` (5 fonctions) · `coachSeat.ts` · `coachBilling.ts` ·
`CoachBillingPage`

### `donnees-personnelles/`
Export, suppression, restauration, purge. Ce que la loi exige et ce qu'on
promet en plus.

`account-export-v1` · `account-deletion-v1` · `account-restore-v1` ·
`purge-deleted-accounts` · autorité : [LEGAL.md](../keel/LEGAL.md)

### `plateforme/`
Les décisions transverses qui ne sont pas une fonctionnalité mais qui les
gouvernent toutes : plafonds de messages proactifs, langue et locale, cadence
des crons, observabilité, files de reprise.

`delivery_policy.ts` · `locale.ts` · `labels.*.ts` · `local_date.ts` ·
`process-llm-retry-jobs` · `get-*-scorecard` · `get-*-trace`

---

## Index

| ID | Fonctionnalité | Domaine | Statut |
|---|---|---|---|
| [FF-001](methode-du-coach/FF-001-quotidien-du-coach.md) | Le quotidien du coach | `methode-du-coach` | 🟠 En cours |
| [FF-002](composition-des-repas/FF-002-dire-son-absence.md) | Dire qu'on ne sera pas là | `composition-des-repas` | 🟡 Spécifiée |
| [FF-003](composition-des-repas/FF-003-intake-structure.md) | Lire ce que l'élève écrit avant de composer | `composition-des-repas` | 🔵 Idée |
| [FF-004](composition-des-repas/FF-004-conservation-et-decongelation.md) | Ce qui se garde, et le mot la veille | `composition-des-repas` | 🔵 Idée |
| [FF-005](composition-des-repas/FF-005-strategie-de-courses.md) | Une course ou deux — l'élève choisit | `composition-des-repas` | 🟡 Spécifiée |
| [FF-006](composition-des-repas/FF-006-cycle-de-vie-du-plan.md) | Refaire sa semaine sans perdre celle d'avant | `composition-des-repas` | 🔵 Idée |
| ~~FF-007~~ | *brûlé* — la direction d'un domaine n'est pas une fonctionnalité : elle vit dans son [README](conversation/README.md) | — | — |
| [FF-008](conversation/FF-008-le-poids-annonce.md) | Le poids annoncé | `conversation` | 🟡 Spécifiée |
| [FF-009](conversation/FF-009-le-repas-hors-plan.md) | Le repas hors plan | `conversation` | 🟡 Spécifiée |
| [FF-010](conversation/FF-010-la-lecture-du-foyer.md) | La lecture du foyer | `conversation` | 🟡 Spécifiée |
| [FF-011](conversation/FF-011-le-soutien-grounde.md) | Le soutien groundé | `conversation` | 🟡 Spécifiée |
| ~~FF-012~~ | *brûlé* — le retrait de la sollicitation est un chantier, pas une fonctionnalité | — | — |
| ~~FF-013~~ | *brûlé* — absorbé par FF-023 (ne jamais redemander) et FF-027 | — | — |
| ~~FF-014~~ | *brûlé* — devenu [RETRAIT-CARTE-DE-DEFENSE.md](../keel/RETRAIT-CARTE-DE-DEFENSE.md) | — | — |
| ~~FF-015~~ | *brûlé* — devenu [RETRAIT-RESIDUS-GRAND-PUBLIC.md](../keel/RETRAIT-RESIDUS-GRAND-PUBLIC.md) | — | — |
| [FF-016](conversation/FF-016-la-question-d-alimentation.md) | La question d'alimentation | `conversation` | 🟠 En cours |
| [FF-017](conversation/FF-017-le-repas-declare.md) | Le repas déclaré (+ la question d'approfondissement) | `conversation` | 🟠 En cours |
| [FF-018](conversation/FF-018-la-photo-de-repas.md) | La photo de repas | `conversation` | 🟠 En cours |
| ~~FF-019~~ | *brûlé* — absorbé par FF-017 §3 | — | — |
| [FF-020](conversation/FF-020-l-accompagnement-de-crise.md) | L'accompagnement de crise | `conversation` | 🟢 Livrée |
| [FF-021](conversation/FF-021-le-plancher-de-restriction-alimentaire.md) | Le plancher de restriction alimentaire | `conversation` | 🟢 Livrée |
| ~~FF-022~~ | *brûlé* — fiche rétroactive retirée au tri de valeur ; le code reste l'autorité | — | — |
| [FF-023](conversation/FF-023-la-conversation-normale.md) | La conversation normale | `conversation` | 🟠 En cours |
| ~~FF-024~~ | *brûlé* — le message du soir est le véhicule de FF-028/FF-029, pas une fonctionnalité | — | — |
| [FF-025](conversation/FF-025-l-invitation-a-la-photo.md) | L'invitation à la photo | `conversation` | 🟡 Spécifiée |
| [FF-026](conversation/FF-026-la-preference-captee.md) | La préférence captée | `conversation` | 🟠 En cours |
| [FF-027](conversation/FF-027-la-faim-branchee-au-plan.md) | La faim branchée au plan | `conversation` | 🟡 Spécifiée |
| [FF-028](conversation/FF-028-la-recommandation-quotidienne.md) | La recommandation quotidienne | `conversation` | 🟡 Spécifiée (V1) |
| [FF-029](conversation/FF-029-les-pratiques-quotidiennes.md) | Les pratiques quotidiennes | `conversation` | 🟠 En cours |
| [FF-030](composition-des-repas/FF-030-le-contexte-de-composition.md) | Le contexte de composition | `composition-des-repas` | 🟡 Spécifiée (volet coach) |
| [FF-031](suivi-quotidien/FF-031-mesures-corporelles-datees.md) | Une mesure du corps est datée à l'instant, pas à la semaine | `suivi-quotidien` | 🟠 En cours |
| ~~FF-032~~ ~~FF-033~~ ~~FF-034~~ ~~FF-035~~ ~~FF-036~~ | *brûlés* (2026-08-10) — réservés par [CHANTIER-FOYER-PROFILS.md](../keel/CHANTIER-FOYER-PROFILS.md) puis **jamais attribués** : le chantier foyer a livré sous FF-044 → FF-050, avec un découpage différent (sept fiches, pas cinq). **Ne pas réattribuer** | — | — |
| [FF-037](composition-des-repas/FF-037-l-ancre-proteique.md) | L'ancre protéique | `composition-des-repas` | 🟠 En cours |
| [FF-038](composition-des-repas/FF-038-le-referentiel-de-composition.md) | Le référentiel de composition, et les quantités qu'on recalcule | `composition-des-repas` | 🟠 En cours |
| [FF-039](composition-des-repas/FF-039-enveloppes-et-verdicts-en-observation.md) | Les enveloppes et les verdicts, en observation | `composition-des-repas` | 🟠 En cours |
| [FF-040](composition-des-repas/FF-040-la-boucle-de-correction.md) | La boucle de correction — les nombres dedans, les mots dehors | `composition-des-repas` | 🟠 En cours |
| [FF-041](composition-des-repas/FF-041-la-methode-du-coach-executable.md) | La méthode du coach, rendue exécutable | `composition-des-repas` | 🟠 En cours |
| ~~FF-042~~ | *réservé par [TEMPLATE.md](TEMPLATE.md)* — ne pas attribuer | — | — |
| [FF-043](le-foyer/FF-043-la-resolution-foyer.md) | La résolution foyer — une cuisson, des assiettes qui divergent | `le-foyer` | 🟡 Spécifiée |
| [FF-044](le-foyer/FF-044-la-bouche-sans-compte.md) | La bouche sans compte | `le-foyer` | 🟢 Livrée |
| [FF-045](le-foyer/FF-045-decrire-son-foyer.md) | Décrire son foyer | `le-foyer` | 🟢 Livrée |
| [FF-046](le-foyer/FF-046-l-allergie-d-une-bouche-sans-compte.md) | L'allergie d'une bouche sans compte | `le-foyer` | 🟠 En cours |
| [FF-047](le-foyer/FF-047-le-corps-dans-la-part-du-foyer.md) | Le corps dans la part du foyer | `le-foyer` | 🟢 Livrée |
| [FF-048](le-foyer/FF-048-reclamer-son-profil.md) | Réclamer son profil | `le-foyer` | 🟢 Livrée |
| [FF-049](le-foyer/FF-049-le-prix-du-foyer.md) | Le prix du foyer | `le-foyer` | 🟠 En cours |
| [FF-050](le-foyer/FF-050-l-envie-de-la-semaine.md) | L'envie de la semaine | `le-foyer` | 🟠 En cours (livrée sur le disque, non commitée) |

> **Un identifiant ne se réutilise jamais** — y compris quand deux sessions
> écrivent en parallèle, et y compris quand la fiche disparaît. `FF-002` a été
> attribué deux fois le 2026-08-07 (la fiche du chat a été renumérotée en
> `FF-007`) ; `FF-014` et `FF-015` ont été **brûlés** le même jour quand les
> deux retraits ont quitté ce dossier. Avant d'ouvrir une fiche :
> `grep -rho 'FF-[0-9]\{3\}' docs/ | sort -u`.
>
> ⚠️ **`FF-040` EST ATTRIBUÉ DEUX FOIS, au 2026-08-10.** Deux fichiers portent
> l'identifiant dans `composition-des-repas/` :
> `FF-040-les-regimes-alimentaires.md` (commité en `6259fcab`) et
> `FF-040-la-boucle-de-correction.md` (non commité, c'est celui que l'index
> ci-dessus référence). Constaté par le lot 9 du chantier foyer, **non
> arbitré** : les deux appartiennent à une session qui écrivait encore. L'un des
> deux doit être renuméroté — et l'identifiant libéré est **brûlé**, pas
> réutilisé.

> **Un retrait n'est pas une fonctionnalité.** Il n'a ni utilisateur, ni job
> story durable, ni métrique de succès au-delà de « zéro ». Les chantiers de
> suppression vivent dans `docs/keel/`, pas ici.

> **Fiches rétroactives.** La règle reste : *on écrit une fiche quand on
> retouche.* Une exception assumée existe — les neuf fiches `conversation`
> `FF-016` à `FF-024`, écrites le 2026-08-07 à partir du code parce qu'un
> chantier entier allait s'appuyer dessus. Elles portent toutes, en §11, la
> mention de ce qu'elles transcrivent (le code et ses tests) et de ce qu'elles
> **ne** prouvent pas (les mesures de leur §10). Ne pas généraliser sans la
> même honnêteté.

---

## Ce que ce dossier n'est pas

- **Pas un backlog.** Une fiche décrit une fonctionnalité, pas une tâche. Le
  découpage en tâches vit dans le plan d'exécution du chantier.
- **Pas une documentation d'API.** L'autorité sur le comportement reste le code
  et ses tests. Une fiche dit l'intention et les invariants ; elle ne
  paraphrase pas les signatures.
- **Pas un journal.** Ce qui s'est passé pendant un chantier va dans
  `docs/keel/` (voir `NUIT-FOYER.md`). Une fiche décrit un état visé, pas un
  récit.
