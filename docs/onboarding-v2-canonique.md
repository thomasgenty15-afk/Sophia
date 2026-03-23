# Onboarding V2 Canonique

## Statut du document

Document canonique de travail pour la refonte V2 de l'onboarding, de la structuration des transformations, de la generation de plan et des impacts aval sur dashboard / bilans / momentum.

Ce document remplace le cadre precedent fonde sur :

- un questionnaire d'entree structure
- des axes issus d'un catalogue visible
- une formalisation trop precoce
- un plan organise en phases / semaines comme structure principale

La V2 repart d'une page blanche. Il n'y a pas de contrainte de compatibilite legacy a preserver.

## Objectif

Construire un systeme d'onboarding et de planification plus naturel, plus intelligent, plus AI-native, qui :

- accueille la complexite reelle de l'utilisateur
- structure avant d'imposer
- formalise seulement au bon moment
- garde l'onboarding rapide
- produit des plans plus riches et moins monotones
- aligne onboarding, execution, bilans et momentum sur le meme modele metier

## Principes produit

- L'utilisateur commence toujours par un texte libre.
- Le systeme structure avant de demander a l'utilisateur de prioriser.
- Avant validation, on ne parle pas encore de "transformation".
- On parle d'aspects, de pans de situation, de regroupements proposes.
- Le questionnaire ne sert qu'a combler les informations manquantes.
- Le profil demande le strict minimum utile.
- Le plan est organise par dimensions, pas par phases.
- La progression se fait par debloquage conditionnel, pas par calendrier impose.
- Les sujets non prioritaires ne sont pas perdus : ils vont dans "Pour plus tard".
- L'IA peut signaler localement une incertitude de placement.
- Si necessaire, l'inscription intervient apres le questionnaire sur mesure et avant le profil minimal.
- Le produit est mobile-first.

## Decision canoniques

### Ce qui est abandonne

- Le questionnaire d'entree comme porte d'acces principale
- Le catalogue d'axes comme structure produit visible
- La dependance au concept de `currentAxis`
- La formalisation trop precoce en transformations
- Le plan en `phases` comme structure canonique
- La logique de progression basee d'abord sur les semaines
- Toute contrainte de compatibilite legacy

### Ce qui est conserve

- La notion de cycle
- La priorisation entre plusieurs transformations
- La limite de 2 generations de plan
- La possibilite de faire le parcours en invite jusqu'au questionnaire
- La conservation des sujets non prioritaires
- Une structure relationnelle en base pour execution, bilans et metrics

## Lexique canonique

### Cycle

Un cycle represente une session complete de transformation. Il contient :

- un texte libre initial
- des aspects extraits
- une structure validee
- 1 a 3 transformations
- une priorisation
- les plans associes

Le cycle existe sous 2 etats conceptuels :

- `cycle draft pre-signup`
- `cycle persisted post-signup`

### Aspect

Un aspect est une unite fine issue du texte libre de l'utilisateur.

Exemples :

- "je fume des que je suis stresse"
- "je procrastine quand je suis fatigue"
- "je dors mal depuis que je change d'horaires"
- "j'evite les conversations difficiles"

L'aspect est une brique de regroupement. Ce n'est pas encore une transformation.

### Transformation

Une transformation est un regroupement formalise d'aspects valides, suffisamment coherents pour produire un questionnaire et un plan.

### Pour plus tard

Zone de stockage des aspects valides mais non prioritaires dans le cycle courant.

### Dimension

Ligne structurante du plan. La V2 en a 3 :

- `support`
- `missions`
- `habits`

### Item de plan

Unite executable du plan. Chaque item appartient a une dimension et a un sous-type.

## Flow canonique V2

## Etape 1 - Capture libre

### Objectif

Laisser l'utilisateur decrire librement ce qu'il veut ameliorer, sans cadrage premature.

### Input utilisateur

Un texte libre unique.

### Output systeme

Un `raw_intake_text` stocke dans le brouillon du cycle.

### Contraintes UX

- un grand champ libre
- pas de categorisation
- pas de navigation par themes
- pas de choix d'axes

## Etape 2 - Analyse IA initiale

### Objectif

Extraire la matiere utile du texte libre et produire une premiere organisation provisoire.

### Responsabilites IA

- extraire les aspects significatifs
- supprimer les redondances evidentes
- regrouper les aspects proches
- creer 1 a 3 blocs provisoires maximum
- isoler certains aspects dans `Pour plus tard` si necessaire
- marquer certains aspects comme incertains si le placement est ambigu

### Sortie attendue

- `aspects`
- `provisional_groups`
- `deferred_aspects`
- `uncertain_aspects`

### Regles

- max 3 blocs principaux
- ne pas forcer 12 sujets dans 3 categories artificielles
- utiliser `Pour plus tard` quand c'est sain
- ne pas encore donner de nom de transformation final

### Critere de performance

L'analyse initiale doit viser un excellent ratio :

- comprehension maximale
- nombre minimal d'interactions correctives demandees a l'utilisateur

La bonne sortie n'est pas celle qui "explique tout", mais celle qui :

- capture l'essentiel
- garde une vue globale
- reste modifiable tres vite

## Etape 3 - Validation des aspects

### Objectif

Permettre a l'utilisateur de corriger le regroupement avant formalisation.

### UI canonique

- 1 a 3 cartes principales
- 1 zone `Pour plus tard`
- chaque carte contient des aspects courts
- certains aspects peuvent etre marques `a confirmer`

### Actions utilisateur

- deplacer un aspect entre cartes
- deplacer un aspect vers `Pour plus tard`
- sortir un aspect de `Pour plus tard`
- retirer un aspect hors sujet
- confirmer un aspect incertain

### Regle de langage

On ne parle pas encore de transformations.

On parle de :

- aspects
- sujets a traiter ensemble
- regroupements proposes
- pans de ta situation

## Etape 4 - Cristallisation

### Objectif

Transformer les regroupements valides en transformations formelles du cycle.

### Responsabilites IA

Pour chaque regroupement valide :

- produire un titre de transformation
- produire une synthese interne detaillee
- produire une synthese user-ready
- preparer le contexte questionnaire
- proposer un ordre recommande initial entre transformations

### Resultat

Naissance des `transformations` du cycle.

## Etape 5 - Priorisation

### Objectif

Choisir l'ordre des transformations.

### Regles

- l'utilisateur peut reordonner
- l'ordre IA est recommande mais modifiable
- cette etape ne sert plus a corriger le contenu des transformations

### Cas simple

S'il n'y a qu'une transformation, cette etape peut etre sautee ou reduite a une validation simple.

## Etape 6 - Questionnaire sur mesure

### Objectif

Recuperer uniquement les informations critiques manquantes pour generer un bon plan.

### Format cible

- 3 questions qualitatives
- 3 questions a choix
- choix unique ou multiple selon le besoin

### Regles

- court par defaut
- dynamique
- pas de question si l'info est deja connue
- pas d'etape supplementaire pour des infos qui peuvent etre capturees ici

### Types d'informations possibles

- definition concrete de reussite
- blocages reels
- contraintes du moment
- maniere de fonctionner qui aide
- maniere de fonctionner a eviter
- clarifications importantes

## Etape 7 - Inscription

### Objectif

Creer le compte si necessaire sans perdre le contexte du parcours.

### Regles

- si l'utilisateur est deja inscrit, on continue directement
- si l'utilisateur n'est pas inscrit, l'inscription intervient apres le questionnaire sur mesure
- le brouillon du cycle doit etre serialisable
- tout doit etre backfille apres inscription

## Etape 8 - Profil minimal

### Objectif

Completer les donnees minimales necessaires a la personnalisation.

### Champs

- date de naissance
- genre
- duree souhaitee du plan : `1`, `2`, ou `3` mois

### Regles

- ces donnees arrivent apres l'inscription
- elles restent positionnees juste avant la generation du plan
- elles ne doivent pas etre demandees plus tot
- elles doivent rester percevables comme de la personnalisation, pas comme de l'administratif

## Etape 9 - Generation du plan

### Objectif

Generer un plan actionnable pour la transformation prioritaire.

### Entrees

- transformation prioritaire
- questionnaire
- profil minimal
- duree choisie

### Sortie

Un plan V2 structure par dimensions.

## Etape 10 - Execution

L'utilisateur entre dans le dashboard de la transformation active.

## Etape 11 - Transformation suivante

Quand il passe a la transformation suivante :

- on repart de la synthese cristallisee deja preparee
- on affiche un mini recap tres court avant generation du questionnaire
- ce mini recap peut accepter un complement libre optionnel
- puis on regenere un questionnaire sur mesure

Ce mini recap n'existe pas pour la premiere transformation afin de garder l'onboarding initial rapide.

## Couches IA canoniques

Le systeme distingue 3 couches IA principales :

### 1. IA de structuration

Responsable de :

- extraire les aspects
- detecter les redondances
- regrouper
- differer
- signaler les incertitudes

### 2. IA de cristallisation

Responsable de :

- transformer les regroupements valides en transformations
- produire les syntheses internes
- produire les syntheses user-ready
- recommander un ordre initial

### 3. IA de generation

Responsable de :

- generer le questionnaire sur mesure
- generer le plan
- proposer les metrics et marqueurs de progression

### Regle

Ces 3 couches doivent rester distinguees conceptuellement, meme si certaines peuvent etre fusionnees techniquement dans le meme service.

## Gestion des cas produit

### Cas A - besoin simple

Le texte libre correspond a une seule transformation claire.

Flow :

- capture libre
- analyse
- validation legere
- questionnaire sur mesure
- inscription si necessaire
- profil minimal
- generation du plan

### Cas B - besoin multiple

Le texte libre contient plusieurs sujets distincts.

Flow :

- capture libre
- analyse
- validation des regroupements
- priorisation
- questionnaire sur mesure
- inscription si necessaire
- profil minimal
- generation

### Cas C - besoin flou

Le texte est trop vague.

Flow :

- capture libre
- clarification courte
- nouvelle analyse

### Cas D - besoin tres large

Le texte contient beaucoup plus de sujets qu'il n'est raisonnable d'en traiter maintenant.

Flow :

- analyse
- 1 a 3 blocs actifs max
- surplus vers `Pour plus tard`

## Sujet "Pour plus tard"

## Role

`Pour plus tard` n'est pas une poubelle. C'est une reserve de travail futur.

## Ce qui y va

- aspects valides
- sujets non prioritaires maintenant
- sujets qui meritent un prochain cycle

## Ce qui n'y va pas

- les erreurs de parsing hors sujet
- les aspects rejetes

## Statuts canoniques des aspects

- `active`
- `deferred`
- `rejected`

## Regles

- un aspect `deferred` peut etre reintroduit dans un cycle suivant
- le parking lot est rattache d'abord au cycle
- pas de backlog global infini en V1

## Signal d'incertitude IA

## Principe

L'IA peut signaler un doute localise sur le placement d'un aspect.

## Buts

- eviter la fausse certitude
- rendre la validation utilisateur plus naturelle
- augmenter la credibilite du systeme

## Forme produit

Un aspect peut porter :

- `uncertainty_level = low | medium | high`
- `placement_to_confirm = true`

## Regle UX

Le systeme ne doit jamais presenter cela comme une erreur.

## Structure canonique du plan

## Regle centrale

Le plan V2 n'est pas structure en phases.

Le plan V2 est structure en dimensions.

## Dimensions

### 1. Support

Leviers de soutien a la transformation.

Contient :

- frameworks
- exercices
- outils de regulation
- outils d'auto-observation
- pratiques d'aide ponctuelles ou recurrentes

### 2. Missions

Actions concretes d'avancee.

Contient :

- tasks
- milestones
- decisions
- one-shots

### 3. Habits

Habitudes a installer et stabiliser.

Contient :

- habitudes progressives
- comportements repetes
- routines cumulatives

## Temporalite

Le systeme ne suit pas un calendrier rigide par semaine.

A la place, chaque item a :

- un ordre d'activation
- des conditions de debloquage
- un niveau d'intensite
- un statut

## Caps de charge active

### Objectif

Eviter les plans trop lourds, reduire la friction d'execution et maintenir la qualite des bilans.

### Regles canoniques

- maximum `1 mission principale` active a la fois
- maximum `1 mission secondaire` active si la charge reelle le permet
- maximum `1 a 2 supports recommended_now`
- maximum `2 habitudes en construction` simultanees
- les autres items restent `pending`, `available` ou `in_maintenance`

### Critere de performance

Le systeme doit preferer :

- moins d'items actifs
- plus de traction reelle
- plus de completion

plutot que :

- plus d'items visibles
- plus de variete superficielle
- plus d'ouverture prematuree

## Debloquage

## Principe general

Les items ne se debloquent pas parce qu'on est "en semaine 2".

Ils se debloquent quand les preconditions utiles ont ete atteintes.

## Mecanique canonique

### Pour les missions / frameworks / exercices

Debloquage par :

- completion d'un item precedent
- validation d'un milestone
- traction suffisante sur un support precedent

Exemples :

- faire un exercice de clarification peut debloquer une mission concrete
- finir une mission peut debloquer un framework d'approfondissement

### Pour les habitudes

La V2 n'utilise pas le streak pur comme mecanique principale.

On ne veut pas que la progression soit cassante ou punitive.

## Mecanique canonique des habitudes

### Principe

Une habitude se debloque par `preuves d'ancrage`, pas par perfection.

### Recommandation V1 canonique

Une nouvelle habitude peut etre debloquee apres `3 reussites sur 5 jours`.

Ce n'est pas obligatoirement 3 jours consecutifs.

### Pourquoi cette regle

- elle est simple
- elle est lisible
- elle n'est pas punitive
- elle mesure une traction reelle
- elle fonctionne mieux qu'un streak pur pour des utilisateurs humains

### Interpretation

Debloquer l'habitude suivante ne veut pas dire abandonner la precedente.

Cela veut dire que la precedente a atteint un niveau suffisant de traction pour ne plus monopoliser le focus principal.

### Stades conceptuels d'une habitude

- `discovery` : faite 1 fois
- `starter traction` : faite 3 fois sur 5 jours
- `initial anchor` : repetition suffisamment stable
- `stable` : ne bloque plus l'ouverture d'autres habitudes

### Etats produit recommandes

- `active_building`
- `in_maintenance`
- `stalled`

### Interpretation

- `active_building` : l'habitude est en cours de construction active
- `in_maintenance` : l'habitude est suffisamment ancree pour rester presente avec faible pression
- `stalled` : l'habitude n'avance plus de facon utile et doit etre reevaluee, allegee ou remplacee

### Regles produit

- les streaks peuvent exister comme signal secondaire ou badge
- ils ne doivent pas etre la mecanique canonique de debloquage

### Generalisation recommandee

La logique "3 reussites sur 5 jours" doit etre comprise plus largement comme une logique de `3 reussites sur 5 opportunites pertinentes`.

Exemples :

- habitude quotidienne -> `3 reussites sur 5 jours`
- habitude planifiee -> `3 reussites sur 5 occurrences prevues`
- habitude contextuelle -> `3 reussites sur 5 occasions pertinentes`

La formulation produit V1 peut rester simple, mais le modele metier doit rester compatible avec cette generalisation.

## Modele metier unifie des items

## Regle

La V2 ne doit pas garder `user_actions` et `user_framework_tracking` comme primitives produit centrales.

La V2 repose sur une entite unifiee : `plan item`.

## Champs conceptuels d'un item

- `dimension`
- `kind`
- `title`
- `description`
- `tracking_type`
- `status`
- `activation_order`
- `unlock_rule`
- `target_reps`
- `current_reps`
- `time_of_day`
- `scheduled_days`
- `payload`

## Dimensions canoniques

- `support`
- `missions`
- `habits`

## Kinds canoniques

- `framework`
- `exercise`
- `task`
- `milestone`
- `habit`

## Exemples de mapping

- coherence cardiaque -> `support / exercise`
- protocole anti-envie -> `support / framework`
- appeler son medecin -> `missions / task`
- obtenir un premier rendez-vous -> `missions / milestone`
- marcher 10 minutes par jour -> `habits / habit`

## Modes d'usage des supports

Tous les items de support n'ont pas le meme mode d'usage.

Un item de support peut etre :

- `always_available`
- `recommended_now`
- `unlockable`

### Interpretation

- `always_available` : outil toujours accessible, meme s'il n'est pas au premier plan
- `recommended_now` : outil actuellement mis en avant dans l'execution
- `unlockable` : outil qui doit attendre un certain niveau de contexte ou de traction

Le modele metier doit permettre cette distinction.

## Taxonomie fonctionnelle des supports

Au-dela du mode d'usage, un support peut aussi etre classe selon sa fonction :

- `practice`
- `rescue`
- `understanding`

### Interpretation

- `practice` : outil a pratiquer regulierement pour soutenir la transformation
- `rescue` : outil a mobiliser dans les moments critiques ou a forte friction
- `understanding` : outil destine a clarifier, comprendre, recadrer ou conscientiser

### Regle

Tous les supports n'ont pas vocation a etre trackes de la meme maniere.

Par defaut :

- `practice` peut etre tracke
- `rescue` est surtout disponible au besoin
- `understanding` peut etre ponctuel, one-shot ou tres faiblement tracke

## Duree du plan

## Primitive canonique

La duree se stocke en :

- `duration_months = 1 | 2 | 3`

## Interpretation

- `1 mois` = intense
- `2 mois` = progressif
- `3 mois` = tres progressif

## Regle

La duree ne doit pas imposer une structure hebdomadaire rigide.

Elle modifie surtout :

- la densite
- la vitesse d'ouverture
- la quantite d'items actifs simultanes
- le niveau de progressivite

## Questionnaire sur mesure - details

## Mission

Recuperer seulement les informations critiques manquantes pour produire un bon plan.

## Regles

- 3 questions qualitatives et 3 questions a choix est une bonne cible UX
- ce n'est pas une contrainte absolue
- le vrai principe est : court, adapte, utile

### Critere UX

Le questionnaire doit chercher le minimum d'information qui augmente vraiment la qualite du plan.

Chaque question doit justifier son existence par au moins un de ces gains :

- meilleure personnalisation
- meilleure faisabilite
- meilleure priorisation
- meilleure qualite de generation

### Rappel produit

Pour la premiere transformation, il n'y a pas de mini recap supplementaire avant le questionnaire.

Pour les transformations suivantes, un mini recap peut exister avant la regeneration du questionnaire.

## Informations critiques possibles

- ce qui constituerait une vraie avancee
- ce qui bloque reellement
- la contrainte reelle du moment
- les formes d'action supportables
- les formes d'action deja efficaces

## Profil minimal - details

## Champs

- `birth_date`
- `gender`
- `duration_months`

## Regle

Ces champs interviennent apres l'inscription et juste avant la generation.

## 1 plan = 1 transformation

## Regle canonique

- `1 plan = 1 transformation`
- `1 cycle = 1 a 3 transformations ordonnees`

## Consequences

- les quotas de generation s'appliquent au niveau de la transformation
- le dashboard actif est toujours rattache a une transformation active
- le passage a la transformation suivante ne regenere pas un "plan de cycle", mais le plan de la transformation suivante
- les bilans et signaux d'execution restent ancres sur la transformation active, tout en pouvant consommer certaines donnees du cycle

## Machine d'etat canonique

## Objectif

Rendre explicites les etats reels du flow afin d'eviter qu'ils restent disperses dans le frontend, la base et les edge functions.

La machine d'etat ne sert pas a complexifier le produit. Elle sert a expliciter ce qui existera de toute facon.

## `cycle.status`

Valeurs proposees :

- `draft`
- `structured`
- `prioritized`
- `questionnaire_in_progress`
- `questionnaire_completed`
- `account_pending`
- `profile_pending`
- `ready_for_plan`
- `active`
- `completed`
- `abandoned`

## `transformation.status`

Valeurs proposees :

- `draft`
- `ready`
- `active`
- `pending`
- `completed`
- `abandoned`

## `plan.status`

Valeurs proposees :

- `draft`
- `generated`
- `active`
- `completed`
- `abandoned`

## `plan_item.status`

Valeurs proposees :

- `pending`
- `available`
- `active`
- `in_maintenance`
- `completed`
- `deactivated`
- `abandoned`

## Transitions canoniques simplifiees

### Cycle

- `draft -> structured`
- `structured -> prioritized`
- `prioritized -> questionnaire_in_progress`
- `questionnaire_in_progress -> questionnaire_completed`
- `questionnaire_completed -> account_pending` si inscription requise
- `questionnaire_completed -> profile_pending` si deja inscrit
- `account_pending -> profile_pending`
- `profile_pending -> ready_for_plan`
- `ready_for_plan -> active`
- `active -> completed`
- `active -> abandoned`

### Transformation

- `draft -> ready`
- `ready -> active`
- `ready -> pending`
- `pending -> active`
- `active -> completed`
- `active -> abandoned`

### Plan

- `draft -> generated`
- `generated -> active`
- `active -> completed`
- `active -> abandoned`

## Architecture data canonique

## Regle generale

Comme il n'y a pas de legacy a conserver, on peut construire un modele propre.

## Tables canoniques proposees

### `user_cycles`

Represente un cycle complet.

Champs conceptuels :

- `id`
- `user_id`
- `status`
- `raw_intake_text`
- `validated_structure`
- `duration_months`
- `birth_date_snapshot`
- `gender_snapshot`
- `created_at`
- `updated_at`

### Note

`duration_months`, `birth_date_snapshot` et `gender_snapshot` ne sont renseignes qu'apres inscription et profil minimal.

### `user_transformations`

Represente une transformation dans un cycle.

Champs conceptuels :

- `id`
- `cycle_id`
- `priority_order`
- `status`
- `title`
- `internal_summary`
- `user_summary`
- `success_definition`
- `main_constraint`
- `questionnaire_schema`
- `questionnaire_answers`
- `created_at`
- `updated_at`

### `user_transformation_aspects`

Represente les aspects issus du texte libre.

Champs conceptuels :

- `id`
- `cycle_id`
- `transformation_id`
- `label`
- `raw_excerpt`
- `status`
- `uncertainty_level`
- `deferred_reason`
- `source_rank`
- `created_at`
- `updated_at`

### `user_plans`

Garde le plan genere, mais en shape V2.

Champs clefs a conserver ou reintroduire :

- `id`
- `user_id`
- `transformation_id`
- `cycle_id`
- `content`
- `status`
- `generation_attempts`
- `created_at`
- `updated_at`

### `user_plan_items`

Entite relationnelle centrale d'execution.

Champs conceptuels :

- `id`
- `plan_id`
- `cycle_id`
- `transformation_id`
- `dimension`
- `kind`
- `title`
- `description`
- `tracking_type`
- `status`
- `activation_order`
- `unlock_rule`
- `target_reps`
- `current_reps`
- `time_of_day`
- `scheduled_days`
- `payload`
- `created_at`
- `updated_at`

### `user_plan_item_entries`

Logs d'execution des items.

Champs conceptuels :

- `id`
- `user_id`
- `plan_item_id`
- `status`
- `value`
- `note`
- `performed_at`
- `created_at`

### `user_plan_metrics`

Metrics globales.

Champs conceptuels :

- `id`
- `plan_id`
- `kind`
- `title`
- `unit`
- `target_value`
- `current_value`
- `status`

### Separation canonique des metrics

Le systeme distingue 2 niveaux :

- `cycle-level`
- `transformation-level`

### Regles recommandees

- maximum `1 North Star active` au niveau cycle
- `3 suggestions IA` maximum proposees pour aider au choix initial
- `0 a 3 progress markers` au niveau d'une transformation

### Objectif

Eviter de melanger :

- l'indicateur global du cycle
- les reperes de progression de la transformation active

## Catalogue de connaissance

## Decision canonique

Le catalogue d'axes visible n'est plus une primitive produit.

## Ce qu'on garde

- le savoir metier
- les themes implicites
- les patterns de regroupement
- les frameworks existants
- les formulations utiles

## Ce qu'on retire

- la navigation utilisateur par axes
- la selection directe d'un axe catalogue
- la dependance produit a `axis_id`

## Contrat JSON canonique du plan

Le JSON de plan V2 doit ressembler conceptuellement a ceci :

```json
{
  "version": 2,
  "cycle_id": "uuid",
  "transformation_id": "uuid",
  "title": "string",
  "user_summary": "string",
  "internal_summary": "string",
  "duration_months": 2,
  "strategy": {
    "identity_shift": "string",
    "core_principle": "string",
    "success_definition": "string",
    "main_constraint": "string"
  },
  "dimensions": [
    {
      "id": "support",
      "title": "Leviers de soutien",
      "items": []
    },
    {
      "id": "missions",
      "title": "Missions",
      "items": []
    },
    {
      "id": "habits",
      "title": "Habitudes",
      "items": []
    }
  ],
  "progression": {
    "current_focus": "string",
    "unlock_logic_summary": "string"
  },
  "metrics": {
    "cycle_north_star_candidates": [],
    "cycle_north_star": null,
    "progress_markers": []
  }
}
```

Exemple d'item :

```json
{
  "id": "stable-key-or-uuid",
  "dimension": "support",
  "kind": "framework",
  "title": "string",
  "description": "string",
  "tracking_type": "boolean",
  "status": "pending",
  "activation_order": 1,
  "unlock_rule": {
    "type": "after_item_completion",
    "depends_on": ["item_1"]
  },
  "target_reps": 1,
  "current_reps": 0,
  "time_of_day": "evening",
  "scheduled_days": null,
  "payload": {}
}
```

## Dashboard V2

## Regle

Le dashboard action ne doit plus afficher le plan comme une colonne de phases.

## Structure canonique du dashboard

- header transformation active
- bloc strategie
- dimension support
- dimension missions
- dimension habits
- bloc metrics
- bloc prochain debloquage
- acces a la transformation suivante si besoin

## Bilans quotidiens

## Regle

Le daily bilan doit raisonner sur les items du plan, pas sur un modele legacy centré sur phases.

## Ce qu'il doit savoir faire

- identifier les items actifs
- adapter la question selon `dimension + kind`
- enregistrer un log d'execution
- nourrir les signaux de traction et de debloquage

### Regle UX

Le daily bilan ne doit jamais donner l'impression d'une checklist administrative.

Il doit :

- partir du reel
- parler le langage de l'utilisateur
- rester centre sur ce qui compte aujourd'hui

## Weekly bilan

## Regle

Le weekly bilan ne doit plus raisonner en `phase actuelle / phase suivante`.

Il doit raisonner en :

- charge actuelle
- traction par dimension
- traction par item actif
- readiness de debloquage
- consolidation vs expansion

## Sorties canoniques du weekly bilan

- `hold`
- `expand`
- `consolidate`
- `reduce`

### Interpretation

- `hold` : on garde l'etat actuel sans ouvrir davantage
- `expand` : on peut ouvrir un item supplementaire
- `consolidate` : on privilegie le renforcement de ce qui est deja ouvert
- `reduce` : on allege la charge active

## Questions metier cibles

- la charge actuelle est-elle soutenable ?
- la dimension support aide-t-elle reellement ?
- faut-il ouvrir une mission supplementaire ?
- faut-il consolider les habitudes avant d'ouvrir autre chose ?
- faut-il differer ou desactiver certains items ?

### Critere de performance

Le weekly bilan doit optimiser :

- traction
- soutenabilite
- clarte

et non :

- volume d'activation
- sensation artificielle de progression
- complexite croissante du plan

## Momentum

## Regle

Le momentum doit etre recale sur les dimensions et la logique de debloquage.

## Signaux possibles

- surcharge de missions
- absence totale d'engagement support
- traction stable sur habitudes
- multiplication d'items actifs simultanes
- stagnation durable
- debloquage trop rapide ou trop lent

## Gestion invite / inscription

## Regle

Le brouillon complet du cycle doit etre serialisable.

## Le cache invite V2 doit pouvoir stocker

- texte libre
- aspects extraits
- regroupements provisoires
- regroupements valides
- transformations cristallisees
- priorite
- questionnaire

Le cache invite V2 ne stocke pas :

- profil minimal
- choix de duree

car ces informations sont capturees apres inscription.

## Limites canoniques

- max 3 transformations par cycle
- max 2 generations de plan par transformation
- max 3 blocs principaux lors de la structuration
- duree du plan : 1 / 2 / 3 mois uniquement

## Regles techniques de refonte

## Frontend

A remplacer ou refondre en profondeur :

- flow onboarding initial
- etape avant priorisation
- priorisation
- questionnaire qualitatif actuel
- dashboard action phase-based

## Edge functions

A supprimer ou remplacer dans leur forme actuelle :

- la logique de recommandation d'axes catalogue
- la logique de summarize-context liee a un currentAxis legacy
- la logique de generation phase-based

## Data model

A reconstruire proprement autour de :

- cycle
- transformation
- aspect
- plan
- item
- entry
- metric

## Decision finale

La V2 de Sophia est un systeme de transformation structure ainsi :

- un cycle commence par une expression libre
- l'IA extrait des aspects
- ces aspects sont regroupes et valides
- certains sont differes dans `Pour plus tard`
- les regroupements valides deviennent des transformations
- les transformations sont priorisees
- un questionnaire sur mesure complete uniquement les informations manquantes
- le profil minimal et la duree sont collectes juste avant generation
- le plan est structure en dimensions
- la progression se fait par debloquage conditionnel
- les habitudes suivent une logique de preuves d'ancrage
- la mecanique canonique d'ouverture d'une habitude suivante est `3 reussites sur 5 jours`

## Prochaine etape de travail

Ce document doit maintenant servir de base pour :

- figer le schema SQL V2
- figer les enums
- figer les payloads JSON
- lister `keep / refactor / delete`
- definir l'ordre de refonte technique
