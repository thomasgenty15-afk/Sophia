# Les fiches de fonctionnalité

> Une fonctionnalité qui n'a pas de fiche ici n'existe pas comme décision : elle
> existe comme code, ce qui n'est pas la même chose. Ce dossier est l'endroit où
> l'on écrit **ce qu'on construit et pourquoi**, avant de le construire.

---

## La règle

**1. Une fiche par fonctionnalité, dans le sous-dossier de son domaine.**
Jamais à la racine. Si aucun domaine ne convient, c'est probablement que la
fonctionnalité en recouvre deux — coupe-la, ou ouvre un domaine et dis-le ici.

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
Plusieurs personnes, une cuisson. Appartenance, invitation, conseil de famille,
restrictions domestiques, portions qui bifurquent.

`household*.ts` · `generate-household-meal-v1` · `HouseholdPage` ·
autorité : [PIVOT-FOYER.md](../keel/PIVOT-FOYER.md)

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
| [FF-001](methode-du-coach/FF-001-quotidien-du-coach.md) | Le quotidien du coach | `methode-du-coach` | 🟡 Spécifiée |

> Les fonctionnalités **déjà construites** n'ont pas encore de fiche. Elles sont
> décrites par les en-têtes de leurs modules et par `docs/keel/`. On en écrit
> une **quand on y retouche** — écrire quarante fiches rétroactives produirait
> quarante documents que personne n'a vérifiés.

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
