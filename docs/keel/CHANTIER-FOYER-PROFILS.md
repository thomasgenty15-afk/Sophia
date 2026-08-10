# Chantier — Les bouches sans compte

> **Ce que ce chantier fait, en une phrase :** faire passer le foyer d'un graphe
> clé sur `auth.users` à un graphe clé sur **une bouche**, dont le compte devient
> optionnel — et retourner les gardes qui ont été écrites pour l'ancien modèle.

| | |
|---|---|
| **Date** | 2026-08-10 |
| **Branche** | `ff-001-quotidien-du-coach` |
| **Autorités produit** | [MODEL.md](MODEL.md) · [CONTRACT.md](CONTRACT.md) · [PIVOT-FOYER.md](PIVOT-FOYER.md) (⚠️ ses §7, §7.5 et son modèle d'invitation sont **périmés** par les décisions du 2026-08-08) |
| **État du dépôt** | rien de déployé ; base locale à jour ; lignée de migrations saine |

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

## Lot 1 — L'identité d'une bouche

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

## Lot 2 — Les gardes retournées

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

## Lot 3 — L'objectif d'une bouche

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

## Lot 3B — Le corps sur le chemin du foyer 🆕

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

---

## Lot 4 — L'ajout en 90 secondes

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

- Le plafond de 8 personnes : contrainte en base ou garde d'écran ? *Un écran
  seul n'est pas une limite.* (Passe au lot 7.)

---

## Lot 5 — Les envies, version maître

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

---

## Lot 6 — La réclamation de profil

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

---

## Lot 7 — Le prix

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

### Ouvert

- **La ligne à mesurer en premier** : la recommandation quotidienne (FF-028)
  ajoute ~30 appels LLM par mois et par foyer. Le lot 3B en ajoute N-1 lectures
  de corps par génération. La marge de ~10 € tient probablement — mais c'est le
  quotidien qui s'accumule en silence, pas la génération hebdomadaire.

---

## Lot 8 — Les résidus

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

### Le reste

- Les quatre fonctions mortes du lot 2 (`canRestrict`, `canInvite`,
  `memberVisibility`, `canSeeGoalOf`) tombent avec lui.

---

## Lot 9 — Les documents

1. **`docs/fonctionnalites/le-foyer/README.md`** — la direction du domaine,
   **avant** de coder. Le README actuel dit lui-même de ne pas écrire de fiches
   rétroactives ; la direction, elle, se fixe en amont. Modèle à suivre :
   `docs/fonctionnalites/conversation/README.md`.
2. **Les fiches, après livraison**, une par fonctionnalité retouchée.
   Identifiants libres à partir de **FF-032** (FF-031 est le dernier pris,
   FF-042 est réservé dans le template) :

| Fiche | Couvre |
|---|---|
| FF-032 | Les bouches sans compte (lots 1 + 2 + 3) |
| FF-033 | Le corps sur le chemin du foyer (lot 3B) |
| FF-034 | L'ajout en 90 secondes (lot 4) |
| FF-035 | La réclamation de profil (lot 6) |
| FF-036 | Le prix du foyer (lot 7) |

---

## L'ordre d'exécution

```
Lot 0    ✅ la lignée débloquée
Lot 1+2+3   un seul geste          ← migration + re-clavetage + gardes retournées
Lot 3B      le corps au foyer      ← dépend de 1 (member_id) et 3 (la colonne goal)
Lot 4       l'écran d'ajout        ← surface des précédents
Lot 6       la réclamation         ← porte les décisions des lots 3 et 3B
Lot 5       les envies             ← indépendant, se glisse où on veut
Lot 8       les résidus            ← les 4 fonctions mortes tombent avec le lot 2
Lot 7       le plafond (avec la migration), puis Stripe (détachable)
Lot 9       README de direction, puis fiches
```

Les lots 1, 2 et 3 ne se livrent pas séparément : le lot 3 a besoin de la clé du
lot 1, et le lot 2 est la raison pour laquelle le lot 3 est dangereux.

---

## Ce qui reste ouvert

Les six questions de conception ont été tranchées le 2026-08-10. Il ne reste que
des décisions **internes aux lots**, à prendre par celui qui les livre :

| # | Décision | Lot | Recommandation |
|---|---|---|---|
| 1 | Les vagues : calculées à la lecture, ou stockées avec le plan ? | 8 | à la lecture — pas de troisième état à invalider |
| 2 | Où le brief de portion place les faits corporels dans le prompt | 3B | réutiliser `mealBodyBlocks`, ne pas écrire un second format |

Et deux **mesures**, qui ne sont pas des décisions mais des chiffres à relever :

- Le coût LLM de la recommandation quotidienne (FF-028), qui s'accumule en
  silence.
- Le coût des N lectures de corps par génération, ajouté par le lot 3B.

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
