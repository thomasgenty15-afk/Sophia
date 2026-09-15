# FF-060 · Le parcours d'entrée

| | |
|---|---|
| **Identifiant** | `FF-060-le-parcours-d-entree` |
| **Statut** | 🟢 Livrée |
| **Date** | 2026-08-12 |
| **Autorité produit** | [docs/keel/MODEL.md](../../keel/MODEL.md) · [docs/keel/PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) §5 et §6.1 · [FF-045](../le-foyer/FF-045-decrire-son-foyer.md) · [FF-046](../le-foyer/FF-046-l-allergie-d-une-bouche-sans-compte.md) · [FF-048](../le-foyer/FF-048-reclamer-son-profil.md) |
| **Dépend de** | `/start` (le compte existe déjà) · les RPC de foyer · `generate-meal-v1` · `generate-household-meal-v1` |
| **Effort estimé** | 2 jours |

---

## 1. Le problème

Quelqu'un vient de créer son compte. Il atterrit sur `/app/today`, **vide**, avec
une phrase qui ne lui dit rien à faire. Tout ce dont son premier plan a besoin —
son âge, sa taille, sa direction, ses allergies, son rythme de repas, ses jours
de cuisine — vit derrière un bouton **« Set up »** enfoui dans une fenêtre de
`/app/plan`, qui empile quatre sections dans un ordre que personne ne peut
deviner. Le mot « onboarding » n'existe nulle part dans `frontend/src/keel`,
sinon dans trois commentaires dont un désigne une route morte.

Il n'existe donc **aucun chemin** qui mène de « je viens de m'inscrire » à
« voici mon premier plan ». Et pour la cible qui vaut le plus cher — le foyer —
c'est pire: §6.1 de `PIVOT-FOYER.md` décrit **huit attributs par personne**.
Huit × quatre personnes = 32 champs avant de voir quoi que ce soit.

**Ce que coûte l'inaction.** L'activation. Un produit dont la valeur est un plan
composé, et qui ne compose rien tant qu'on n'a pas trouvé un bouton caché,
n'est jugé par personne sur ce qu'il fait — il est jugé sur son écran vide. Et
la démonstration la plus vendeuse (« un pot, deux directions ») est
inatteignable: elle demande de décrire une seconde personne, ce que rien ne
propose jamais.

## 2. Job stories

- **Quand je viens de créer mon compte et que je ne connais rien du produit**,
  je veux qu'on me pose les questions dont mon plan a besoin, dans l'ordre,
  **pour que** j'aie un plan ce soir plutôt qu'un écran vide.
- **Quand je cuisine pour ma famille**, je veux décrire les autres en trois
  champs chacun et pas en huit, **pour que** l'effort reste proportionné à ce
  que ça me rend.
- **Quand j'ai commencé et que la vie m'interrompt**, je veux revenir et
  reprendre où j'en étais, **pour que** rien de ce que j'ai déjà répondu ne soit
  à refaire.

## 3. Périmètre

### Dans le périmètre

- Une route `/app/setup`, en **trois étapes**, dont la dernière action **EST la
  génération** du premier plan.
- Le branchement solo / couple / famille depuis une seule question.
- La saisie des autres bouches en rafale, et l'invitation à réclamer un profil.
- La reprise, **dérivée des faits en base**, sans aucun drapeau de progression.
- La couture: qui envoie vers l'entonnoir, et comment on n'y retourne pas.
- La correction du défaut **D2** — l'objectif perdu à la réclamation.

### Hors périmètre — engageant

- ❌ **Les goûts, les dégoûts, le niveau de cuisine et les contraintes
  médicales des autres.** Après le plan, devant le plat que ça change.
- ❌ **Le nom du foyer.** Aucun consommateur au moment où on le demanderait. Il
  vaut `Home` et se renomme sur `/app/household`.
- ❌ **Un compte pour les enfants.** Une bouche mineure vit sur la ligne du
  foyer, pas sur un compte à elle.
  ⚠️ **Amendé le 2026-08-13** : la ligne disait aussi « un mineur n'a jamais
  d'objectif nutritionnel individuel ». Ce n'est plus vrai — un enfant PEUT
  porter une direction, et l'entonnoir la demande. Ce qui reste
  inconstructible est le registre **correctif sur le corps** : `fat_loss` et
  `recomposition` sont refusés à l'écriture (`goal_not_for_minor`, migration
  `20260813180000`) et à la lecture (`goalApplies`). Voir
  [PIVOT-FOYER §8.4](../../keel/PIVOT-FOYER.md).
- ❌ **Toute calorie.** Le contrat en vigueur et la chaîne de portes de
  [FF-059](../composition-des-repas/FF-059-le-chiffre-affiche.md) ne sont pas
  touchés.
- ❌ **La refonte de `/start` et de `/auth`.** L'entonnoir commence **après** le
  compte.
- ❌ **Le paiement, le plafond de sièges, l'essai.**
- ❌ **Une question dont on ne peut pas nommer le consommateur.** Y compris la
  question annexe « tu vis avec d'autres personnes ? » au solo: rien, dans le
  dépôt, ne lirait la réponse — elle n'est donc pas posée.

## 4. Le circuit

```
/start ───► compte créé ───► /auth ou session immédiate
                                  │
                       resolveHomePath(userId)
                                  │
              ┌───────────────────┼────────────────────┐
     coaches.status='active'      │            aucune ligne student_goals
              │                   │                    │
           /coach          ligne présente          /app/setup ◄── états vides
                                  │                    │
                        /app/today ou /app/household    │
                                                        ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │ ÉTAPE 1 — SITUER                                                   │
   │   « Pour combien de personnes tu cuisines ? »  1 / 2 / 3+          │
   │   1  → aucun foyer créé                                            │
   │   2+ → keel_household_create('Home')  (le maître = 1re bouche)     │
   ├────────────────────────────────────────────────────────────────────┤
   │ ÉTAPE 2 — LES GENS                                                 │
   │   MOI : prénom* · naissance · taille · sexe · direction · allergies│
   │         (* seulement s'il y a un foyer)                            │
   │              │ Save ─► profiles + student_goals + safety           │
   │              ▼                                                     │
   │   2b — LES AUTRES (foyer seul, et seulement une fois MA direction  │
   │        posée : l'accusé d'allergie se fusionne dans SA ligne)      │
   │        par bouche : prénom · enfant/adulte · date · direction      │
   │                     · allergies · [accès ?]                        │
   ├────────────────────────────────────────────────────────────────────┤
   │ ÉTAPE 3 — LE PLAN  (une seule fois, pour le foyer)                 │
   │   rythme · jours de cuisine · minutes · budget                     │
   │              │                                                     │
   │              ▼  « Build my first plan »                            │
   │   savePlanAnswers ─► relecture ─► canGenerate ─► GÉNÉRATION        │
   │        maître d'un foyer ≥2 bouches → generate-household-meal-v1   │
   │        sinon (solo, ou secondaire)  → generate-meal-v1             │
   └───────────────────────────┬────────────────────────────────────────┘
                               ▼
                           /app/plan
```

## 5. Modèle de données

**Aucune table neuve, aucune colonne neuve.** L'entonnoir est un assemblage: il
écrit là où les écrans existants écrivaient déjà.

| Réponse | Où elle s'écrit | Nature |
|---|---|---|
| Prénom, naissance, taille, sexe | `profiles.full_name` / `birth_date` / `height_cm` / `gender` | saisi |
| Direction | `student_goals.goal` (+ nettoyage des cibles croisées) | saisi |
| Mes allergies | `student_safety_constraints` (`kind='allergy'`, `severity='medical'`) | saisi |
| Rythme, jours, minutes, budget | `student_goals.practical_constraints` (`eating_rhythm`, `cook_days`, `cooking_time_min`, `budget_band`) | saisi |
| Les bouches | `household_members` (prénom, date, objectif) | saisi |
| Allergie d'une bouche | `household_member_allergies` | saisi |
| « On a posé la question des allergies » | `student_goals.practical_constraints.allergy_check` = `{self, members[]}` | saisi |
| Le nombre de personnes (étape 1) | **rien** — dérivé | dérivé |
| L'état de reprise | **rien** — dérivé | dérivé |

**⚠️ `cook_days`, pas `cooking_days`.** C'est la clé que lisent
`readCookingCapacity` des deux générateurs et `CookingCapacityCard`.

**⚠️ `allergy_check` n'est pas un drapeau de progression, c'est une réponse.**
« As-tu des allergies ? — aucune » n'a nulle part ailleurs où vivre: une table
d'allergies vide ne distingue pas « rien à déclarer » de « on n'a jamais
demandé », et sur une question de sécurité ces deux-là ne sont pas la même
chose. Son seul consommateur est la reprise.

**L'étape 1 se dérive**, et c'est ce qui permet de n'écrire aucun drapeau:

- un foyer en base ⇒ « au moins deux » (et `max(2, bouches)`, pour qu'un foyer
  commencé et vide garde son étape 2b);
- pas de foyer mais une ligne `student_goals` ⇒ « juste moi » — le solo **ne
  crée pas de foyer**, c'est sa signature;
- ni l'un ni l'autre ⇒ la question n'a pas encore été posée.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | **Chaque question déclare le CHEMIN de son consommateur**, et un test le résout sur le disque. | La règle mère du dépôt — on ne collecte que ce qu'un aval consomme — n'est tenable que si elle est écrite à côté de la question. Un lecteur supprimé fait rougir la suite le jour de la suppression, pas six mois plus tard. |
| R2 | Une question **`weight: "wrong"`** (sans elle le plan est FAUX) entre dans l'entonnoir; une **`"better"`** (il est seulement MOINS BON) est déclarée dans le même catalogue et **jamais rendue**. | C'est le tri qui empêche les 32 champs. Garder les deux listes ensemble est ce qui force à se demander, en ajoutant un champ, s'il n'est pas plutôt « moins bon ». |
| R3 | **`canGenerate` est la seule source** qui active le bouton de fin. L'écran ne refait jamais le calcul « à peu près ». | Deux vérités divergentes sur ce qui manque, c'est un bouton actif qui rend une erreur — ou un bouton gris sans explication. |
| R4 | **Aucun paramètre optionnel sur `canGenerate`**, et aucune horloge. | Cicatrice du dépôt: `safetyBand` a vécu des mois en paramètre facultatif d'une garde, n'a jamais été passé, et personne ne l'a vu. Un fait de plus entre dans `FunnelState`, où le compilateur le réclame. |
| R5 | Un adulte porteur d'une direction **sans date de naissance** est refusé sous le motif nommé `adult_without_birth_date`, qui **remplace** le motif générique de date. | Défaut **D1**. `goalApplies` exige `ageState === "adult"`, dérivé de `birth_date`: sans date, la direction est ignorée **sans aucun message**, et la bifurcation des portions — toute la démonstration « couple à objectifs divergents » — est muette. Le motif remplace pour rester testable: émis en plus, on pourrait supprimer la garde sans faire rougir un test qui n'assert que `ok`. |
| R6 | **L'invitation ne bloque JAMAIS la génération.** | Un plan se compose avec les bouches saisies, invitation envoyée ou non, acceptée ou non. « Rien n'attend personne » est la phrase du produit; un plan qui attendrait la démentirait. |
| R7 | **L'écran rend le lien, il n'envoie aucun e-mail.** | `keel_household_invite` est une RPC SQL, et l'entonnoir n'appelle aucune fonction d'envoi. En local, `EMAIL_DELIVERY_ENABLED=1` est un pistolet chargé. Le `{name}` du lien est *load-bearing*: le maître émet plusieurs liens dans la même minute. |
| R8 | **L'entonnoir ne collecte que l'ALLERGIE**, jamais la règle de maison ni l'aversion. | Trois natures tranchées par FF-046: médicale (union de sécurité, fail-closed) / pouvoir domestique (verrou qui tait le pourquoi) / goût. Les confondre à la saisie, c'est promettre une garde de sécurité sur une préférence parentale. |
| R9 | **On ajoute toujours une bouche; l'accès est un ajout PAR-DESSUS.** L'écran ne présente jamais une fourche « bouche ou compte ? ». | Ce ne sont pas deux natures de personne, c'est le même objet à deux stades: `keel_household_invite` vise une ligne qui existe, `keel_household_join` y attache un `user_id` (FF-048 §1). |
| R10 | **L'objectif saisi pour une bouche est SEMÉ dans sa ligne `student_goals` au moment de la réclamation.** | Défaut **D2**. Le roster bascule sur `sg.goal` dès qu'une bouche a un compte; un compte neuf n'en a aucun, donc l'objectif cessait d'être lu à la seconde où la personne s'engageait. La source unique reste `student_goals` — elle est amorcée, pas dupliquée. `on conflict do nothing`: une déclaration personnelle existante n'est jamais écrasée. |
| R11 | **La reprise se dérive des faits**, jamais d'un drapeau. `profiles.onboarding_completed` n'est pas réutilisé. | Un drapeau dit « terminé » d'un parcours dont les faits ont changé depuis, et « à faire » à un compte réglé avant que l'écran n'existe. Il ment dans les deux sens. |
| R12 | **L'étape 2b n'est offerte qu'au compte maître**, et seulement une fois SA direction posée. | Un secondaire reçoit `not_owner` aux quatre gestes; lui montrer les champs serait promettre ce que la base refusera. Et l'accusé d'allergie se fusionne dans la ligne `student_goals` du maître, qui n'existe qu'après sa direction. |
| R13 | **La dernière action EST la génération**, et l'atterrissage est le plan. | « Ton coach prépare ton plan » est faux dans ce produit: le coach ne produit rien de personnel (`MODEL.md`). Aucune copie ne doit faire attendre qui que ce soit. |
| R14 | **« Skip for now » est visible à chaque étape**, et ce qui est déjà enregistré l'est vraiment. | Personne n'est retenu dans un couloir. Chaque étape écrit pour de bon avant d'avancer, donc partir ne coûte rien. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Un `update` PostgREST ne matche aucune ligne (204 muet) | **Échec lisible**, jamais « Saved ». Toutes les écritures passent par `mergePracticalConstraints` ou portent leur propre `.select()` et refusent zéro ligne. |
| Une bouche adulte porte une direction sans date | Refus nommé `adult_without_birth_date`, et la phrase dit ce que l'absence **coûte** — une part standard servie en silence —, pas qu'un champ est vide. |
| Une bouche est ajoutée avec « rien à déclarer » | L'accusé est écrit. Sans lui, la reprise relisait « jamais demandé » et l'entonnoir se bloquait sur une question à laquelle la ligne n'offrait aucun champ. **Défaut mesuré au navigateur le 2026-08-12, et refermé.** |
| Une bouche arrive sans réponse d'allergie (saisie sur `/app/household`) | Sa ligne affiche le sélecteur, pour que la question soit répondable là où elle est posée. |
| Le générateur refuse | Le **jeton nommé** est traduit par `EDGE_REFUSAL_KEYS` (table testée contre les sources des deux fonctions). Un jeton inconnu retombe sur le message brut — un refus imprévu doit rester visible. |
| Le générateur échoue après le modèle | Phrase qui dit que le plan précédent est intact, parce que c'est vrai (l'écriture est à la toute fin). |
| La lecture d'état échoue au montage | **Aucun formulaire rendu.** Un écran qui affiche du vide non lu finit toujours par le faire écrire. |
| `resolveHomePath` ne peut pas lire la ligne d'objectif | On **ne route pas** vers l'entonnoir. Ne pas savoir n'est pas une raison de renvoyer quelqu'un régler ce qu'il a déjà réglé. |
| Un foyer existe déjà et on choisit « juste moi » | Le choix est désarmé: cet écran ne supprime pas un foyer — ce serait effacer des bouches, leurs allergies et leurs portions sur un clic d'entonnoir. Le geste vit sur `/app/household`. |

## 8. Critères d'acceptation

```gherkin
Étant donné un compte neuf sans ligne student_goals
Quand il se connecte
Alors resolveHomePath rend "/app/setup", et pas "/app/today"

Étant donné une bouche adulte qui porte "muscle_gain" et aucune date de naissance
Quand on demande canGenerate
Alors la réponse est ok:false et missing contient "adult_without_birth_date"
Et  missing ne contient PAS "member_birth_date"

Étant donné le même adulte, sa date de naissance renseignée
Quand on demande canGenerate
Alors la réponse est ok:true

Étant donné un entonnoir rempli jusqu'à l'étape 2
Quand on recharge la page
Alors on reprend à l'étape 3, sans avoir rien ressaisi

Étant donné un foyer de quatre bouches et une invitation émise et NON consommée
Quand on appuie sur « Build my first plan »
Alors le plan du foyer est composé et compte les quatre bouches

Étant donné une bouche sans compte qui porte l'objectif "muscle_gain"
Quand la personne invitée réclame son profil
Alors sa ligne student_goals porte "muscle_gain"
Et  keel_household_roster_for rend le même objectif avant et après

Étant donné une personne qui a déjà son propre « about you »
Quand elle réclame une bouche portant un autre objectif
Alors sa déclaration personnelle n'est PAS écrasée
```

## 9. Rabbit holes

- **Refaire le calcul de « ce qui manque » dans le JSX.** C'est la tentation
  numéro un, et le bug de six mois plus tard. Une seule source: `canGenerate`.
- **Réutiliser `profiles.onboarding_completed`.** Il existe, il est tentant, et
  il n'est lu que par un chemin legacy (`process-checkins`). Voir R11.
- **Faire retomber le roster sur `household_members.goal` quand la ligne
  `student_goals` est vide.** Ça « répare » D2 en une ligne et recrée les deux
  sources qui divergent sans arbitre que D1 a délibérément supprimées.
- **Écrire `profiles.locale` comme `content_locale`.** Cette colonne vaut
  `fr-FR` par défaut et l'app authentifiée est déclarée anglaise: la graine
  écrirait `fr-FR` sur des contenus anglais, pour tout le monde.
- **Fusionner un état de brouillon depuis la fermeture React** (`onChange({
  ...draft, ...patch })`). Deux réponses cochées dans le même tick partent du
  même état de départ et la seconde efface la première. **Mesuré sur cet
  écran** — trois moments de repas cochés d'affilée n'en laissaient qu'un.
  Mises à jour fonctionnelles partout.
- **Demander la taille et le sexe « plus tard ».** Ils ne changent aucun plat
  en particulier: ils changent toutes les quantités, invisiblement. Il n'existe
  donc aucun moment postérieur pour les demander, et « après » signifierait
  jamais. C'est ce qui les met dans l'entonnoir malgré §3.1.

## 10. Ce qu'on mesure

- **La mesure**: la part des comptes créés qui obtiennent un premier plan dans
  les 24 h. C'est le seul chiffre que cet écran existe pour bouger.
- **La contre-mesure**: la part des comptes qui **entrent** dans l'entonnoir et
  n'en sortent pas — « Skip for now », ou abandon en cours d'étape. Si elle
  monte pendant que la première ne bouge pas, l'entonnoir demande trop, et la
  bonne réaction est de faire redescendre des questions en `weight: "better"`,
  pas d'ajouter un écran d'encouragement.
- **Le repère de coût**: le temps de bout en bout pour un foyer de quatre. Il
  est de l'ordre de la minute côté saisie; la génération, elle, prend deux à
  trois minutes de modèle, et c'est elle qui domine.

## 11. Questions ouvertes

- **Le corps des autres bouches** (taille, poids, sexe) est exigé par la
  décision humaine du 2026-08-12 pour servir juste, et l'entonnoir ne le
  collecte pas — quatre champs de plus par bouche est le mur que cet écran
  existe pour éviter. Le moteur sert alors une part standard. La question
  ouverte est **où** ces champs se demandent ensuite, et il n'y a pas encore de
  moment pour ça.
- **L'élève d'un coach** (`/join`) suit le **même** entonnoir: la seule
  différence est le propriétaire de doctrine, que l'entonnoir ne touche pas.
  Rien à brancher, mais rien n'a encore été joué de bout en bout sur ce chemin.
