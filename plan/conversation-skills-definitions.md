# Sophia - Conversation skills definitions

## Statut du document

Ce document contient les fiches de definition des skills conversationnels.

Il complete :

- `plan/conversation-skills-tools-dispatcher-alignment-plan.md`
- `plan/memory-v2-mvp-consolidated-architecture-plan.md`

Objectif :

```text
Definir chaque skill avant implementation :
- role ;
- triggers ;
- contexte necessaire ;
- comportement ;
- sorties structurees ;
- liens avec recommendation_tool ;
- regles de sortie ;
- tests.
```

## Liste cible MVP

Skills humains :

```text
safety_crisis
emotional_repair
demotivation_repair
execution_breakdown
```

Skill produit :

```text
product_help
```

Modules transversaux non-skills :

```text
skill_router
recommendation_tool
operation_payload_builder
generators
tool_executors
memorizer async
```

## Contrat commun d'un skill

Chaque skill doit respecter ce contrat conceptuel :

```ts
type ConversationSkillDefinition = {
  id: string;
  family: "human" | "product";
  priority: number;
  role: string;
  trigger_signals: string[];
  entry_conditions: string[];
  required_context: string[];
  behavior_rules: string[];
  recommendation_policy: string[];
  exit_rules: string[];
  forbidden_behaviors: string[];
  tests: string[];
};
```

Chaque run de skill doit retourner un JSON structure :

```ts
type ConversationSkillOutput = {
  skill_id: string;
  status: "continue" | "complete" | "exit" | "handoff" | "recommendation_needed";
  response_intent: string;
  reply?: string;
  diagnosis?: Record<string, unknown>;
  state_patch?: Record<string, unknown>;
  recommendation_need?: {
    needed: boolean;
    type:
      | "state_regulation"
      | "execution_repair"
      | "motivation_repair"
      | "product_help"
      | "none";
    urgency: "none" | "low" | "medium" | "high";
    constraints: string[];
  };
  handoff_request?: {
    target_skill_id: string;
    reason: string;
    confidence: number;
  };
  memory_write_candidates?: Array<Record<string, unknown>>;
};
```

## Skill: product_help

### Role

`product_help` repond quand le user demande explicitement de l'aide sur une
fonctionnalite Sophia.

Il sert a :

- expliquer une fonctionnalite ;
- dire quand l'utiliser ;
- dire comment l'utiliser ;
- clarifier les benefices ;
- mentionner les contre-indications ;
- lancer un flow de confirmation si le user veut creer/modifier quelque chose.

Il ne sert pas a pousser une opportunite produit cachee. Pour cela, utiliser
`recommendation_tool`.

### Famille

```text
product
```

### Priorite

```text
Apres safety, emotional_repair, execution_breakdown et demotivation_repair.
```

Exception :

Si le user demande explicitement une aide produit sans signal humain fort,
`product_help` peut prendre la main directement.

### Triggers

Signaux :

```text
product_guidance_intent
dashboard_help
feature_question
how_to_use
```

Exemples :

```text
"c'est quoi une potion ?"
"comment je cree une carte d'attaque ?"
"ou je change mes rappels ?"
"a quoi sert une carte de defense ?"
"je veux modifier mes preferences coach"
"comment ajuster mon plan ?"
```

### Lifecycle

#### Entry

Entrer dans `product_help` si :

```text
product_guidance_intent=true
OU le user mentionne explicitement une fonctionnalite couverte
OU le user demande comment utiliser / modifier / trouver une fonctionnalite
```

Conditions :

- pas de signal `safety` actif ;
- pas de skill humain prioritaire avec urgence forte ;
- demande produit suffisamment explicite ;
- si une `__pending_operation_confirmation` existe, traiter d'abord Oui/Non.

Exemples entry :

```text
"c'est quoi une potion ?"
"comment je cree une carte d'attaque ?"
"je veux changer ton ton"
"ou sont les rappels recurrents ?"
```

#### Active loop

Par defaut, `product_help` est un skill court.

```text
max_turns = 2
default = 1 tour
```

A chaque tour, le skill doit :

- identifier la fonctionnalite demandee ;
- repondre uniquement sur cette fonctionnalite ;
- distinguer explication simple vs demande de creation/modification ;
- si creation/modification : produire `next_step.type="recommendation_gate"` ;
- ne pas ouvrir une autre fonctionnalite sauf demande explicite.

#### Exit

Sortir de `product_help` si :

```text
reponse explicative donnee
OU max_turns atteint
OU user change de sujet
OU user demande une operation -> pending confirmation / recommendation gate
OU skill humain prioritaire detecte
```

Apres une simple explication, retour au mode general.

Apres une operation acceptee ou refusee :

```text
Oui -> executor -> ack -> exit
Non -> cancel -> exit
```

#### Handoff

Transitions possibles :

```text
product_help -> safety_crisis
  si danger detecte

product_help -> emotional_repair
  si la question produit cache une detresse claire

product_help -> execution_breakdown
  si la demande produit revele un blocage d'action concret

product_help -> demotivation_repair
  si la demande produit revele une perte de sens ou d'elan
```

Exemples :

```text
"c'est quoi une potion, parce que la je suis vraiment au bout"
-> emotional_repair ou safety selon intensite

"comment creer une carte d'attaque, parce que je bloque sur ma marche"
-> product_help peut expliquer, puis handoff execution_breakdown si le user veut diagnostiquer le blocage
```

#### Recommendation policy

`product_help` n'appelle pas directement un generator ou un executor.

Si le user veut creer/modifier :

```text
product_help
-> recommendation_gate
-> operation_payload_builder
-> generator
-> pending_operation_confirmation Oui/Non
```

Cas :

```text
"cree une carte d'attaque" -> recommendation_gate prepare_attack_card
"ajuste mon plan" -> recommendation_gate adjust_plan_item
"mets un rappel tous les matins" -> recommendation_gate create_recurring_reminder
"change ton ton en plus doux" -> recommendation_gate update_coach_preferences
```

Le skill peut expliquer une fonctionnalite sans recommendation gate.

#### Memory policy

`product_help` ne propose pas de souvenir durable par defaut.

Exceptions possibles :

```text
operation acceptee -> memorizer peut noter l'evenement operationnel
preference coach explicite acceptee -> memorizer peut noter une preference relationnelle
refus repete d'une fonctionnalite -> recommendation history, pas memoire conversationnelle durable
```

Le skill ne doit jamais ecrire directement.

#### Fallback

Si la fonctionnalite est inconnue :

```text
requested_feature="unknown"
intent="explain"
reply court qui demande clarification ou propose les fonctionnalites plan connues
exit
```

Si plusieurs fonctionnalites sont possibles :

```text
demander une clarification courte
max 1 clarification
```

Si la demande melange produit + detresse :

```text
priorite au skill humain
```

### Sortie structuree

```ts
type ProductHelpOutput = {
  skill_id: "product_help";
  requested_feature:
    | "plan_adjustment"
    | "defense_card"
    | "attack_card"
    | "potion"
    | "coach_preferences"
    | "recurring_reminder"
    | "unknown";
  intent: "explain" | "how_to" | "benefits" | "compare" | "start_flow";
  reply: string;
  next_step?: {
    type: "none" | "recommendation_gate";
    operation_type?: string;
  };
};
```

### Product help feature schema

Chaque fonctionnalite couverte par `product_help` doit avoir une fiche :

```ts
type ProductHelpFeature = {
  id: string;
  label: string;
  when_to_use: string;
  how_to_use: string;
  benefits: string[];
  contraindications: string[];
  chat_behavior: {
    can_explain: boolean;
    can_start_confirmation_flow: boolean;
    requires_recommendation_gate: boolean;
  };
};
```

## Product help registry - Plan scope

Pour le MVP, `product_help` couvre uniquement la partie plan/dashboard plan.

Il ne couvre pas les fonctionnalites Architecte :

```text
architect.coaching
architect.wishlist
architect.stories
architect.reflections
architect.quotes
```

Raison :

```text
Les fonctionnalites Architecte risquent de brouiller le skill product_help MVP.
```

### Feature: plan_adjustment

Label :

```text
Ajuster le plan
```

Dans quel cadre l'utiliser :

```text
Quand une action, un niveau ou une partie du plan ne colle plus :
- trop dur ;
- trop flou ;
- mauvais timing ;
- charge trop elevee ;
- blocage repete ;
- besoin de recalibrer sans abandonner tout le plan.
```

Detail d'utilisation :

```text
Le user peut demander un ajustement depuis le chat ou utiliser son espace Sophia.
Depuis le chat, Sophia doit preparer une proposition puis demander Oui/Non.
Aucune modification n'est appliquee sans confirmation explicite.
```

Benefices :

- evite d'abandonner tout le plan ;
- permet de reduire, deplacer, clarifier ou recalibrer ;
- garde la transformation vivante plutot que rigide ;
- transforme un blocage en ajustement concret.

Contre-indications :

- ne pas ajuster pendant une emotion forte sans stabilisation ;
- ne pas modifier le plan pour un simple mauvais jour isole ;
- ne pas modifier sans confirmation explicite ;
- ne pas proposer si le besoin est surtout ecoute ou regulation d'etat.

Chat behavior :

```json
{
  "can_explain": true,
  "can_start_confirmation_flow": true,
  "requires_recommendation_gate": true
}
```

Operation cible :

```text
adjust_plan_item
```

### Feature: defense_card

Label :

```text
Carte de defense
```

Dans quel cadre l'utiliser :

```text
Quand il y a une tentation, une rechute possible, une impulsion, un piege
recurrent ou un moment ou le user risque de se faire embarquer.
```

Detail d'utilisation :

```text
La carte de defense formalise :
- le moment a risque ;
- le piege ;
- la reponse de defense ;
- parfois un plan B.

Depuis le chat, Sophia peut proposer une carte si le contexte est assez clair,
puis demander Oui/Non avant creation.
```

Benefices :

- prepare les moments faibles avant qu'ils arrivent ;
- donne une reponse claire quand le user perd en lucidite ;
- protege le plan contre les declencheurs connus ;
- rend le comportement de defense plus disponible au bon moment.

Contre-indications :

- pas utile si le probleme est seulement logistique ;
- ne pas proposer en pleine crise safety ;
- ne pas creer sans situation a risque assez claire ;
- ne pas transformer une emotion vague en carte trop specifique.

Chat behavior :

```json
{
  "can_explain": true,
  "can_start_confirmation_flow": true,
  "requires_recommendation_gate": true
}
```

Operation cible :

```text
prepare_defense_card
```

### Feature: attack_card

Label :

```text
Carte d'attaque
```

Dans quel cadre l'utiliser :

```text
Quand le user veut rendre une action plus facile a lancer :
- evitement ;
- procrastination ;
- action trop lourde ;
- manque d'elan ;
- friction avant de commencer.
```

Detail d'utilisation :

```text
La carte d'attaque transforme une action en strategie concrete :
- version minimale ;
- premier pas ;
- regle simple ;
- appui environnemental ;
- mode d'emploi.

Depuis le chat, Sophia peut preparer une proposition, puis demander Oui/Non
avant creation.
```

Benefices :

- reduit la dependance a la volonte brute ;
- rend l'action plus naturelle ;
- aide a agir avant le moment de friction ;
- rend le demarrage plus concret et moins intimidant.

Contre-indications :

- eviter si le user est en honte forte ;
- eviter si le vrai besoin est repos ou regulation ;
- ne pas augmenter la difficulte ;
- ne pas proposer si l'action ciblee n'est pas claire.

Chat behavior :

```json
{
  "can_explain": true,
  "can_start_confirmation_flow": true,
  "requires_recommendation_gate": true
}
```

Operation cible :

```text
prepare_attack_card
```

### Feature: potion

Label :

```text
Potions
```

Dans quel cadre l'utiliser :

```text
Quand le probleme principal est un etat interne a traverser avant de repartir
dans l'action : honte, stress, flou, peur, decrochage, durete envers soi.
```

Detail d'utilisation :

```text
Une potion est un petit parcours d'etat.
Elle part de ce que le user ressent, pose quelques questions, puis produit une
reponse adaptee et parfois une proposition de suivi.
```

Types de potions :

```text
1. Potion anti-decrochage
   Quand le user sent qu'il laisse filer quelque chose qu'il voulait tenir.

2. Potion de courage
   Quand la peur, l'apprehension ou l'evitement bloquent.

3. Potion de guerison
   Quand le user s'en veut, a craque, a echoue ou se sent blesse.

4. Potion de clarte
   Quand tout est flou, disperse, trop charge ou sans priorite nette.

5. Potion d'amour
   Quand le user est dur avec lui-meme ou manque de douceur envers lui.

6. Potion d'apaisement
   Quand le user monte en pression, est a cran ou trop stresse.
```

Benefices :

- regule avant d'agir ;
- evite d'ajouter de la pression a un etat deja fragile ;
- aide a nommer l'etat dominant ;
- peut preparer un retour plus propre vers l'action.

Contre-indications :

- pas en safety aiguë ;
- ne pas utiliser comme fuite systematique de l'action ;
- choisir une potion seulement si l'etat dominant est clair ;
- ne pas proposer une potion si le user demande explicitement une solution concrete deja claire.

Chat behavior :

```json
{
  "can_explain": true,
  "can_start_confirmation_flow": true,
  "requires_recommendation_gate": true
}
```

Operation cible :

```text
select_state_potion
```

### Feature: coach_preferences

Label :

```text
Preferences coach
```

Dans quel cadre l'utiliser :

```text
Quand le user veut changer la maniere dont Sophia lui parle :
- plus doux ;
- plus direct ;
- moins de questions ;
- plus de challenge ;
- moins de pression ;
- relation ressentie comme mal calibree.
```

Detail d'utilisation :

```text
Les preferences coach reglent le style relationnel de Sophia.
Elles vivent dans l'espace dashboard et peuvent etre modifiees par le user.
Depuis le chat, une modification doit passer par confirmation Oui/Non.
```

Preferences actuelles :

```text
1. Ton global
   - doux ;
   - bienveillant ferme ;
   - tres direct.

2. Niveau de challenge
   - leger ;
   - equilibre ;
   - eleve.

3. Tendance a poser des questions
   - peu de questions ;
   - equilibre ;
   - tres questionnant.
```

Benefices :

- adapte Sophia au style relationnel du user ;
- reduit les frictions ;
- ameliore la sensation d'etre compris ;
- evite de confondre un probleme de fond avec un probleme de ton.

Contre-indications :

- ne pas changer sur un seul agacement isole ;
- ne pas proposer en plein moment emotionnel intense sauf demande explicite ;
- ne pas utiliser pour eviter une vraie correction de diagnostic ;
- ne pas modifier sans confirmation explicite.

Chat behavior :

```json
{
  "can_explain": true,
  "can_start_confirmation_flow": true,
  "requires_recommendation_gate": true
}
```

Operation cible :

```text
update_coach_preferences
```

### Feature: recurring_reminder

Label :

```text
Initiative recurrente / reminder recurrent
```

Dans quel cadre l'utiliser :

```text
Quand le user veut que Sophia revienne a un moment precis, plusieurs jours par
semaine, avec un message ou une initiative.
```

Detail d'utilisation :

Champs principaux :

```text
- message ;
- raison / contexte ;
- heure ;
- jours actifs ;
- destination : plan actuel ou base de vie.
```

Difference avec one-shot reminder :

```text
one-shot reminder = rappel ponctuel.
recurring reminder = initiative recurrente plusieurs jours / semaine.
```

Benefices :

- soutien proactif ;
- aide a tenir un rythme ;
- installe une presence au bon moment ;
- permet a Sophia de revenir quand le user en a vraiment besoin.

Contre-indications :

- ne pas confondre avec une habitude a suivre soi-meme ;
- ne pas multiplier les rappels si le user ignore deja les relances ;
- ne pas creer si l'heure ou les jours sont trop flous ;
- ne pas creer sans confirmation explicite.

Chat behavior :

```json
{
  "can_explain": true,
  "can_start_confirmation_flow": true,
  "requires_recommendation_gate": true
}
```

Operation cible :

```text
create_recurring_reminder
```

## Product help behavior rules

Le skill doit :

- repondre simplement ;
- ne pas pousser d'autres fonctionnalites non demandees ;
- distinguer explication et creation/modification ;
- renvoyer vers le flow Oui/Non si le user veut agir ;
- rappeler apres execution : "Tu peux modifier dans ton espace sur sophia-coach.ai."

Le skill ne doit pas :

- creer ou modifier directement ;
- diagnostiquer un etat humain profond ;
- bypasser le recommendation gate ;
- mentionner les termes techniques internes (`surface_plan`, `skill_router`, etc.).

## Product help tests MVP

Cas minimum :

```text
"c'est quoi une potion ?" -> explique potions + types
"j'ai besoin d'une potion de guerison" -> recommendation_gate select_state_potion
"comment creer une carte d'attaque ?" -> explique attack_card
"cree moi une carte d'attaque pour ma marche" -> recommendation_gate prepare_attack_card
"a quoi sert une carte de defense ?" -> explique defense_card
"je veux changer ton ton" -> coach_preferences / start_flow possible
"rappelle-moi tous les matins" -> recurring_reminder start_flow
"rappelle-moi demain a 9h" -> ne pas traiter comme recurring_reminder, laisser one-shot reminder
"comment ajuster mon plan ?" -> explique plan_adjustment
"ajuste ma marche du soir" -> recommendation_gate adjust_plan_item
```

## Skill: safety_crisis

TODO.

## Skill: emotional_repair

TODO.

## Skill: demotivation_repair

TODO.

## Skill: execution_breakdown

TODO.
