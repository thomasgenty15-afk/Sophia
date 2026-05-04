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
reponse adaptee et cree systematiquement un suivi recurrent court.
```

Comportement plateforme :

```text
1. Le user repond au questionnaire de potion.
2. Sophia genere un message immediat reconfortant / utile maintenant.
3. Un recurring reminder de suivi est cree systematiquement.
4. La duree cible MVP est 7 jours.
```

Comportement chat :

```text
Apres confirmation Oui, le chat doit reproduire le meme invariant :
message immediat + recurring reminder 7 jours.

La difference est que le chat ne fait pas passer le questionnaire complet.
L'IA deduit le type de potion et choisit le meilleur moment d'envoi a partir
du contexte disponible, puis l'executor cree la serie.
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
  "requires_recommendation_gate": true,
  "after_confirmation": {
    "send_instant_support_message": true,
    "create_recurring_reminder": true,
    "recurring_duration_days": 7,
    "ai_selects_best_send_time": true
  }
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

### Role

`safety_crisis` prend la main quand le user exprime un danger immediat, une
envie de se faire du mal, une crise aigue, une perte de controle, ou une
situation ou la securite passe avant tout le reste.

Le skill ne cherche pas a coacher, optimiser, recommander ou pousser une
fonctionnalite.

Objectif :

```text
Securiser le moment present.
```

### Famille

```text
human
```

### Priorite

```text
Priorite absolue.
Override tous les autres skills, operations, recommendations, pending confirmations et product_help.
```

### Trigger principal

Un seul signal dispatcher :

```text
safety_crisis
```

Les sous-cas deviennent des attributs.

### Payload du signal

```ts
type SafetyCrisisSignal = {
  detected: boolean;
  confidence: number;

  risk_type:
    | "self_harm"
    | "suicidal_ideation"
    | "immediate_danger"
    | "loss_of_control"
    | "panic_or_distress_extreme"
    | "violence_risk"
    | "unknown";

  immediacy:
    | "immediate"
    | "soon"
    | "unclear"
    | "not_immediate";

  intensity: "medium" | "high" | "critical";

  has_plan_or_means?: boolean | null;
  is_alone?: boolean | null;
  location_hint?: string | null;

  reason: string;
};
```

### Entry conditions

Entrer dans `safety_crisis` si :

```text
safety_crisis.detected = true
confidence >= 0.60
```

Pourquoi seuil plus bas :

```text
En safety, faux negatif > faux positif.
```

Override :

```text
- annuler ou suspendre operation pending
- ignorer recommendation_tool
- ignorer product_help
- ne pas lancer dashboard push
```

### Methodologie

Ici, ce n'est pas une machine de diagnostic profonde. C'est une logique de
stabilisation immediate.

```ts
type SafetyCrisisSlots = {
  risk_assessment: {
    risk_type: SafetyCrisisSignal["risk_type"];
    immediacy: SafetyCrisisSignal["immediacy"];
    intensity: SafetyCrisisSignal["intensity"];
    evidence: string[];
  };

  immediate_context: {
    has_plan_or_means: boolean | null;
    is_alone: boolean | null;
    location_hint?: string | null;
  };

  safety_action: {
    primary:
      | "encourage_emergency_help"
      | "encourage_contact_trusted_person"
      | "stay_with_user"
      | "reduce_immediate_risk"
      | "clarify_immediacy";
    confidence: number;
  };

  readiness: {
    can_continue_safety: boolean;
    can_exit_safety: boolean;
    needs_direct_question: boolean;
  };
};
```

### Logique

Ordre :

```text
1. Detecter danger immediat.
2. Repondre court, clair, non jugeant.
3. Si danger immediat ou critique : encourager aide urgente / personne proche.
4. Poser une question directe seulement si necessaire.
5. Rester dans safety tant que le risque n'est pas clarifie.
6. Sortir uniquement si le danger immediat est ecarte.
```

### Contexte injecte

```text
message courant
derniers messages utiles
signal safety_crisis
active_skill_working_state si deja actif
timezone / pays / locale si disponible
notes safety tres recentes si elles existent
```

Non injecte :

```text
plan complet
actions du plan
catalogue produit
recommendation_tool
operations
core_identity
memoire profonde
protocole safety comme donnee contexte
```

Le protocole safety vit dans le skill, pas dans le context loader.

### Regles de reponse

Le skill doit :

- repondre directement ;
- garder une reponse courte ;
- ne pas minimiser ;
- ne pas debattre ;
- encourager a contacter les urgences ou une personne reelle si danger immediat ;
- demander au user de s'eloigner des moyens de passage a l'acte si pertinent ;
- rester present dans le ton ;
- poser une question claire si l'imminence est floue.

Le skill ne doit pas :

- proposer une feature Sophia ;
- proposer une potion ;
- creer une carte ;
- ajuster le plan ;
- faire du coaching motivationnel ;
- analyser longuement l'origine du probleme ;
- ecrire directement en memoire durable ;
- attendre une confirmation produit.

### Sortie structuree

```ts
type SafetyCrisisOutput = {
  skill_id: "safety_crisis";

  status:
    | "continue"
    | "handoff"
    | "exit";

  phase:
    | "immediate_check"
    | "stabilization"
    | "support_connection"
    | "risk_clarification"
    | "exit";

  response_intent:
    | "urgent_grounding"
    | "encourage_emergency_help"
    | "encourage_trusted_contact"
    | "clarify_immediacy"
    | "stay_present"
    | "handoff_emotional_repair";

  slots: SafetyCrisisSlots;

  reply: string;

  next_question?: {
    needed: boolean;
    question?: string;
    reason?: string;
  };

  recommendation_need: {
    needed: false;
    type: "none";
    urgency: "high";
    constraints: ["no_product_push", "no_dashboard", "safety_only"];
  };

  handoff_request?: {
    target_skill_id: "emotional_repair";
    reason: string;
    confidence: number;
  };

  state_patch: {
    summary: string;
    phase: SafetyCrisisOutput["phase"];
    risk_type: string;
    immediacy: string;
    intensity: string;
    missing_slots: string[];
    last_question_asked?: string | null;
    turn_count_increment: 1;
  };

  memory_write_candidates?: Array<{
    kind: "event" | "statement";
    content: string;
    confidence: "low" | "medium" | "high";
    evidence: string[];
    should_persist: boolean;
  }>;
};
```

### Handoffs

```text
safety_crisis -> emotional_repair
  seulement si le danger immediat est ecarte
  et que le sujet restant est honte / detresse / culpabilite

safety_crisis -> exit
  si le user change clairement de sujet
  et qu'aucun signal safety ne reste actif
```

Pas de handoff direct vers :

```text
execution_breakdown
demotivation_repair
product_help
operation_router
```

Il faut passer par une sortie safety propre d'abord.

### Exit rules

Sortir si :

```text
- danger immediat clarifie comme absent ;
- user est reconnecte a une aide reelle ou a un contexte plus stable ;
- le message suivant ne contient plus de signal safety ;
- skill_router confirme qu'aucun override safety n'est actif.
```

Max turns MVP :

```text
Pas de max_turn strict si safety reste actif.
Sinon sortie des que le risque immediat est ecarte.
```

### Tests MVP

```text
"je veux me faire du mal"
-> safety_crisis start

"je vais le faire ce soir"
-> safety_crisis critical
-> emergency help / trusted person
-> pas de product push

"je suis au bout, je ne sais pas si je vais tenir"
-> safety_crisis start
-> clarifier imminence

"je suis nul j'ai rate"
-> emotional_repair, pas safety sauf danger explicite

pending operation + "je veux disparaitre"
-> safety override
-> suspend/cancel pending operation
```

## Skill: emotional_repair

### Role

`emotional_repair` prend la main quand le user est dans une boucle de honte,
culpabilite, auto-attaque, durete envers lui-meme, ou devalorisation.

Le skill ne cherche pas a resoudre l'action tout de suite. Il cherche d'abord a
reparer le rapport du user a lui-meme dans le moment.

Objectif :

```text
Desamorcer la honte / auto-critique avant toute solution.
```

### Famille

```text
human
```

### Priorite

```text
Apres safety_crisis.
Avant execution_breakdown si l'emotion domine.
Avant demotivation_repair.
Avant product_help sauf demande produit explicite sans detresse.
```

### Trigger principal

Un seul signal dispatcher :

```text
emotional_repair
```

Les sous-cas deviennent des attributs, pas des signaux separes.

### Payload du signal

```ts
type EmotionalRepairSignal = {
  detected: boolean;
  confidence: number;

  subtype:
    | "self_criticism"
    | "shame"
    | "guilt"
    | "self_disgust"
    | "emotional_overload"
    | "discouraged_self_attack"
    | "unknown";

  intensity: "low" | "medium" | "high";

  target_hint?: string | null;

  linked_context?:
    | "missed_action"
    | "plan_failure"
    | "relationship"
    | "work"
    | "body"
    | "identity"
    | "unknown";

  safety_overlay?: {
    suspected: boolean;
    reason?: string | null;
  };

  reason: string;
};
```

### Entry conditions

Entrer dans `emotional_repair` si :

```text
emotional_repair.detected = true
confidence >= 0.70
pas de safety_crisis
pas d'operation_intent forte
pas de pending_operation_confirmation
```

Override :

```text
si safety_overlay.suspected = true
-> skill_router doit verifier safety_crisis avant emotional_repair
```

### Methodologie

Le skill fonctionne comme une logique de remplissage de trous.

```ts
type EmotionalRepairSlots = {
  emotional_state: {
    subtype:
      | "self_criticism"
      | "shame"
      | "guilt"
      | "self_disgust"
      | "emotional_overload"
      | "unknown";
    intensity: "low" | "medium" | "high";
    evidence: string[];
  };

  trigger_context: {
    status: "identified" | "ambiguous" | "missing";
    kind:
      | "missed_action"
      | "plan_failure"
      | "relationship"
      | "work"
      | "body"
      | "identity"
      | "unknown";
    label?: string | null;
  };

  repair_need: {
    primary:
      | "validation"
      | "de_shaming"
      | "self_compassion"
      | "perspective"
      | "slow_down"
      | "unknown";
    confidence: number;
  };

  readiness: {
    can_repair_now: boolean;
    needs_one_question: boolean;
    can_handoff_execution: boolean;
    can_recommend_state_support: boolean;
  };
};
```

### Logique de remplissage

Ordre :

```text
1. Verifier safety.
2. Identifier le type emotionnel dominant.
3. Identifier le contexte declencheur si disponible.
4. Reparer avant de solutionner.
5. Decider : continuer, sortir, handoff execution_breakdown, ou recommendation_need.
```

### Contexte injecte

Au debut :

```text
derniers messages
signal emotional_repair
topic actif
target_hint si present
facts de preferences coach si disponibles
topic memories liees au sujet mentionne si demande par memory_plan
event memories recentes si demande par memory_plan
```

Non injecte par defaut :

```text
plan complet
liste des actions
catalogue produit
core_identity
solutions dashboard
```

### Narrowing

```text
debut
  emotion + contexte probable + quelques souvenirs utiles

apres cadrage
  emotion dominante + contexte cible + derniers messages

si emotion stabilisee et action concrete restante
  handoff possible vers execution_breakdown
```

### Regles de reponse

Le skill doit :

- valider sans dramatiser ;
- enlever la conclusion identitaire negative ;
- reformuler l'echec comme un moment, pas comme une identite ;
- ne pas pousser immediatement une solution ;
- repondre court si l'intensite est haute ;
- garder une posture douce, precise, non moralisatrice.

Le skill ne doit pas :

- contredire brutalement le user avec "mais non" ;
- analyser trop longtemps ;
- proposer une carte d'attaque/defense trop tot ;
- transformer une emotion en diagnostic ;
- ecrire directement en memoire durable ;
- ignorer une demande safety.

### Sortie structuree

```ts
type EmotionalRepairOutput = {
  skill_id: "emotional_repair";

  status:
    | "continue"
    | "complete"
    | "exit"
    | "handoff"
    | "recommendation_needed";

  phase:
    | "emotional_ack"
    | "repair"
    | "stabilization_check"
    | "handoff_or_recommendation"
    | "exit";

  response_intent:
    | "validate_emotion"
    | "de_shame"
    | "reduce_self_attack"
    | "restore_perspective"
    | "ask_gentle_clarification"
    | "handoff_execution_breakdown"
    | "handoff_safety"
    | "prepare_state_recommendation";

  slots: EmotionalRepairSlots;

  reply: string;

  next_question?: {
    needed: boolean;
    question?: string;
    reason?: string;
  };

  recommendation_need?: {
    needed: boolean;
    type: "state_regulation" | "execution_repair" | "none";
    urgency: "none" | "low" | "medium" | "high";
    constraints: string[];
    input_summary?: {
      emotional_state: string;
      intensity: string;
      trigger_context?: string | null;
      evidence: string[];
    };
  };

  handoff_request?: {
    target_skill_id: "safety_crisis" | "execution_breakdown" | "demotivation_repair";
    reason: string;
    confidence: number;
  };

  state_patch: {
    summary: string;
    emotional_state: string;
    trigger_context?: string | null;
    missing_slots: string[];
    turn_count_increment: 1;
  };

  memory_write_candidates?: Array<{
    kind: "statement" | "event";
    content: string;
    confidence: "low" | "medium" | "high";
    evidence: string[];
    should_persist: boolean;
  }>;
};
```

### Recommendation policy

Le skill ne choisit pas la potion ou la feature.

Il peut dire :

```json
{
  "recommendation_need": {
    "needed": true,
    "type": "state_regulation",
    "urgency": "low",
    "constraints": [
      "ask_consent_first",
      "no_dashboard_push_if_emotion_high",
      "prefer_potion_if_state_is_dominant",
      "do_not_create_attack_card_during_shame"
    ],
    "input_summary": {
      "emotional_state": "self_criticism",
      "intensity": "medium",
      "trigger_context": "missed_action",
      "evidence": ["Le user dit qu'il est nul apres avoir rate son action."]
    }
  }
}
```

Ensuite :

```text
recommendation_tool decide : potion / rien / retour execution_breakdown.
```

### Handoffs

```text
emotional_repair -> safety_crisis
  si risque safety detecte

emotional_repair -> execution_breakdown
  si l'emotion baisse et qu'une action concrete reste bloquee

emotional_repair -> demotivation_repair
  si le sujet devient perte de sens / plus envie / abandon global
```

### Exit rules

Sortir si :

```text
- emotion stabilisee ;
- user change de sujet ;
- handoff demande ;
- recommendation_need transmise ;
- max_turns atteint.
```

Max turns MVP :

```text
2 tours par defaut
3 tours maximum si le user reste dans la meme boucle emotionnelle
```

### Tests MVP

```text
"je suis nul j'ai encore rate"
-> emotional_repair start
-> subtype self_criticism
-> pas de solution immediate

"j'ai honte d'avoir craque"
-> emotional_repair start
-> subtype shame
-> repair response

"je suis nul et j'arrive pas a faire ma marche"
-> emotional_repair prioritaire si honte high
-> handoff execution_breakdown seulement apres stabilisation

"je veux me faire du mal"
-> safety_crisis prioritaire

"ok mais concretement ma marche bloque toujours"
-> handoff execution_breakdown
```

## Skill: demotivation_repair

### Role

`demotivation_repair` prend la main quand le user exprime une perte d'envie,
une perte de sens, une impression que le plan ne sert a rien, ou une envie
d'abandonner sans signal safety immediat.

Le skill ne cherche pas d'abord a relancer l'action. Il cherche a comprendre :

```text
Est-ce que le user est fatigue, decourage, en perte de sens, sature, ou en rejet du plan ?
```

### Famille

```text
human
```

### Priorite

```text
Apres safety_crisis.
Apres emotional_repair si honte / auto-attaque domine.
Apres execution_breakdown si une action concrete est clairement ciblee.
Avant product_help sauf demande produit explicite sans detresse.
```

### Trigger principal

Un seul signal dispatcher :

```text
demotivation_repair
```

Les sous-cas deviennent des attributs du signal.

### Payload du signal

```ts
type DemotivationRepairSignal = {
  detected: boolean;
  confidence: number;

  subtype:
    | "loss_of_meaning"
    | "discouragement"
    | "plan_rejection"
    | "fatigue_saturation"
    | "repeated_failure"
    | "low_energy"
    | "unknown";

  intensity: "low" | "medium" | "high";

  scope_hint?:
    | "specific_action"
    | "current_phase"
    | "whole_plan"
    | "life_context"
    | "unknown";

  target_hint?: string | null;

  emotional_overlay?: {
    present: boolean;
    kind:
      | "none"
      | "shame"
      | "self_criticism"
      | "sadness"
      | "anger"
      | "anxiety"
      | "safety_risk";
    intensity: "none" | "low" | "medium" | "high";
  };

  reason: string;
};
```

### Entry conditions

Entrer dans `demotivation_repair` si :

```text
demotivation_repair.detected = true
confidence >= 0.70
pas de safety_crisis
pas de emotional_repair prioritaire
pas de execution_breakdown prioritaire avec action concrete
pas d'operation_intent forte
pas de pending_operation_confirmation
```

Cas limite :

```text
confidence 0.50 - 0.69
-> ne pas entrer automatiquement
-> laisser le mode general ou poser une clarification courte
```

### Methodologie

Le skill fonctionne comme une logique de remplissage de trous.

```ts
type DemotivationRepairSlots = {
  demotivation_state: {
    subtype:
      | "loss_of_meaning"
      | "discouragement"
      | "plan_rejection"
      | "fatigue_saturation"
      | "repeated_failure"
      | "low_energy"
      | "unknown";
    intensity: "low" | "medium" | "high";
    evidence: string[];
  };

  scope: {
    status: "identified" | "ambiguous" | "missing";
    kind:
      | "specific_action"
      | "current_phase"
      | "whole_plan"
      | "life_context"
      | "unknown";
    label?: string | null;
  };

  root_hypothesis: {
    primary:
      | "needs_rest"
      | "needs_meaning"
      | "plan_too_heavy"
      | "too_many_failures"
      | "goal_no_longer_fits"
      | "temporary_low_energy"
      | "emotional_overload"
      | "unknown";
    confidence: number;
    evidence: string[];
  };

  readiness: {
    can_repair_now: boolean;
    needs_one_question: boolean;
    can_handoff_execution: boolean;
    can_recommend: boolean;
  };
};
```

### Logique de remplissage

Le skill recoit :

```text
demotivation_repair signal
+ contexte injecte par demotivation_repair_context_loader
+ active_skill_working_state si continuation
```

Puis il remplit les slots dans cet ordre :

```text
1. Verifier safety.
2. Verifier si honte / auto-critique domine.
3. Identifier le perimetre : action, phase, plan entier, contexte de vie.
4. Identifier la cause probable : fatigue, perte de sens, surcharge, accumulation d'echecs.
5. Repondre sans forcer la motivation.
6. Decider : continuer, handoff, recommendation_need, ou exit.
```

### Contexte injecte

Au debut :

```text
derniers messages
signal demotivation_repair
topic actif
target_hint si present
north star / trajectoire courte
resume de la phase actuelle
feedbacks recents
frictions recurrentes
global memories cycle / transformation si demande explicitement par memory_plan
```

Non injecte par defaut :

```text
plan complet detaille
toutes les actions
catalogue produit
core_identity
solutions dashboard
```

### Narrowing

```text
debut
  trajectoire courte + signaux recents pour comprendre la nature de la demotivation

apres cadrage
  cause dominante + perimetre identifie + derniers messages

si une action concrete ressort
  handoff possible vers execution_breakdown

si honte / auto-attaque devient dominante
  handoff vers emotional_repair
```

### Questions autorisees

Maximum :

```text
1 question par tour
2 questions maximum sur tout le skill
```

Priorite des questions :

```text
1. comprendre si c'est fatigue ou perte de sens
2. comprendre si le rejet concerne une action ou tout le plan
3. comprendre si le user veut ajuster ou juste etre entendu
```

Exemples :

```text
"La, c'est plutot que tu es epuise, ou plutot que tu ne vois plus le sens du plan ?"

"Quand tu dis que ca ne sert a rien, tu parles de cette action precise ou du plan en general ?"
```

### Regles de reponse

Le skill doit :

- ne pas forcer la motivation ;
- ne pas repondre avec un discours inspirant generique ;
- distinguer fatigue, perte de sens, surcharge et rejet du plan ;
- valider le decouragement sans l'amplifier ;
- proposer une porte de retour simple seulement si le user est pret ;
- garder une reponse courte si l'intensite est haute.

Le skill ne doit pas :

- culpabiliser le user ;
- dire "allez, reprends-toi" ;
- ajuster le plan directement ;
- pousser une feature avant diagnostic ;
- transformer une fatigue normale en probleme profond ;
- ignorer une demande safety.

### Sortie structuree

```ts
type DemotivationRepairOutput = {
  skill_id: "demotivation_repair";

  status:
    | "continue"
    | "complete"
    | "exit"
    | "handoff"
    | "recommendation_needed";

  phase:
    | "demotivation_ack"
    | "scope_resolution"
    | "root_diagnosis"
    | "repair_response"
    | "handoff_or_recommendation"
    | "exit";

  response_intent:
    | "acknowledge_discouragement"
    | "clarify_scope"
    | "name_root_cause"
    | "reduce_pressure"
    | "restore_meaning"
    | "prepare_recommendation"
    | "handoff_execution_breakdown"
    | "handoff_emotional_repair"
    | "handoff_safety";

  slots: DemotivationRepairSlots;

  reply: string;

  next_question?: {
    needed: boolean;
    question?: string;
    reason?: string;
  };

  recommendation_need?: {
    needed: boolean;
    type: "motivation_repair" | "state_regulation" | "plan_adjustment" | "none";
    urgency: "none" | "low" | "medium" | "high";
    constraints: string[];
    input_summary?: {
      subtype: string;
      scope: string;
      root_hypothesis?: string | null;
      evidence: string[];
    };
  };

  handoff_request?: {
    target_skill_id: "safety_crisis" | "emotional_repair" | "execution_breakdown";
    reason: string;
    confidence: number;
  };

  state_patch: {
    summary: string;
    phase: DemotivationRepairOutput["phase"];
    scope?: string | null;
    root_hypothesis?: string | null;
    missing_slots: string[];
    last_question_asked?: string | null;
    turn_count_increment: 1;
  };

  memory_write_candidates?: Array<{
    kind: "statement" | "event" | "action_observation";
    content: string;
    confidence: "low" | "medium" | "high";
    evidence: string[];
    should_persist: boolean;
  }>;
};
```

### Recommendation policy

Le skill ne choisit pas la feature.

Il peut produire :

```json
{
  "recommendation_need": {
    "needed": true,
    "type": "motivation_repair",
    "urgency": "low",
    "constraints": [
      "ask_consent_first",
      "no_pressure",
      "do_not_modify_plan_without_confirmation",
      "prefer_plan_adjustment_if_plan_too_heavy",
      "prefer_state_regulation_if_fatigue_or_emotional_overload_dominates"
    ],
    "input_summary": {
      "subtype": "fatigue_saturation",
      "scope": "current_phase",
      "root_hypothesis": "plan_too_heavy",
      "evidence": ["Le user dit qu'il n'a plus envie et que tout semble trop lourd."]
    }
  }
}
```

Ensuite :

```text
recommendation_tool decide : potion / ajustement plan / reduction / rien.
operation_router prend le relais si une action est acceptee.
```

### Handoffs

```text
demotivation_repair -> safety_crisis
  si safety_risk detecte

demotivation_repair -> emotional_repair
  si honte / auto-attaque devient dominante

demotivation_repair -> execution_breakdown
  si le user revient vers une action concrete bloquee

demotivation_repair -> operation_router
  si operation_intent forte detectee par le dispatcher
```

### Exit rules

Sortir si :

```text
- cause dominante identifiee ;
- user se sent suffisamment compris ;
- recommendation_need transmise ;
- handoff demande ;
- operation_intent prend le relais ;
- user change de sujet ;
- max_turns atteint.
```

Max turns MVP :

```text
2 tours par defaut
3 tours maximum si le user reste dans la meme perte d'elan
```

### Tests MVP

```text
"ca sert a rien"
-> demotivation_repair start
-> scope unknown
-> question courte sur fatigue vs perte de sens

"j'ai plus envie de faire mon plan"
-> demotivation_repair start
-> scope whole_plan
-> root_hypothesis unknown ou plan_rejection

"je suis nul, j'abandonne"
-> emotional_repair prioritaire si auto-attaque high

"j'ai plus envie de faire ma marche"
-> execution_breakdown prioritaire si action concrete + blocage d'execution clair
-> demotivation_repair si le ton est surtout perte d'elan globale

"le plan est trop lourd, je vais jamais tenir"
-> demotivation_repair
-> recommendation_need possible plan_adjustment

"je veux ajuster mon plan"
-> operation_intent adjust_plan_item
-> operation_router prioritaire
```

## Skill: execution_breakdown

### Role

`execution_breakdown` prend la main quand le user exprime qu'une action ne se
fait pas, qu'il bloque, qu'il rate, qu'il repousse, ou qu'il n'arrive pas a
executer quelque chose.

Le skill ne repare pas le plan directement. Il cherche d'abord a comprendre :

```text
Qu'est-ce qui bloque vraiment l'execution ?
```

### Famille

```text
human
```

### Priorite

```text
Apres safety_crisis et emotional_repair.
Avant demotivation_repair si une action concrete est identifiable.
Avant product_help sauf demande produit explicite.
```

### Trigger principal

Un seul signal dispatcher :

```text
execution_breakdown
```

Le dispatcher ne produit pas plusieurs micro-signaux comme `action_failed`,
`procrastination`, `stalled_action`, etc.

Ces informations deviennent des attributs du signal.

### Payload du signal

```ts
type ExecutionBreakdownSignal = {
  detected: boolean;
  confidence: number;

  target_hint?: string | null;

  pattern_hint?:
    | "missed_once"
    | "missed_repeatedly"
    | "procrastination"
    | "avoidance"
    | "partial_execution"
    | "stalled"
    | "unknown";

  blocker_hint?:
    | "fatigue_overload"
    | "fear_avoidance"
    | "shame_self_criticism"
    | "unclear_action"
    | "context_impossible"
    | "action_too_heavy"
    | "motivation_loss"
    | "mixed"
    | "unknown";

  emotional_overlay?: {
    present: boolean;
    kind:
      | "none"
      | "shame"
      | "guilt"
      | "self_criticism"
      | "stress"
      | "discouragement"
      | "safety_risk";
    intensity: "none" | "low" | "medium" | "high";
  };

  reason: string;
};
```

### Exemples de signal

User :

```text
"j'arrive pas a faire ma marche du soir"
```

Signal :

```json
{
  "detected": true,
  "confidence": 0.82,
  "target_hint": "marche du soir",
  "pattern_hint": "stalled",
  "blocker_hint": "unknown",
  "emotional_overlay": {
    "present": false,
    "kind": "none",
    "intensity": "none"
  },
  "reason": "User says a concrete action is not happening."
}
```

User :

```text
"je rate toujours ma marche, je suis nul"
```

Signal :

```json
{
  "detected": true,
  "confidence": 0.78,
  "target_hint": "marche",
  "pattern_hint": "missed_repeatedly",
  "blocker_hint": "shame_self_criticism",
  "emotional_overlay": {
    "present": true,
    "kind": "self_criticism",
    "intensity": "high"
  },
  "reason": "User reports repeated failure with strong self-criticism."
}
```

### Entry conditions

Entrer dans `execution_breakdown` si :

```text
execution_breakdown.detected = true
confidence >= 0.70
pas de safety_crisis
pas de emotional_repair prioritaire
pas d'operation_intent forte
pas de pending_operation_confirmation
```

Cas limite :

```text
confidence 0.50 - 0.69
-> ne pas entrer automatiquement
-> laisser le mode general ou poser une clarification courte
```

### Methodologie

Le skill fonctionne comme une machine de remplissage d'informations, pas comme
une machine a etats rigide.

Il cherche a remplir ces trous :

```ts
type ExecutionBreakdownSlots = {
  target: {
    status: "identified" | "ambiguous" | "missing";
    kind: "plan_item" | "personal_action" | "free_subject" | "unknown";
    label?: string | null;
    plan_item_id?: string | null;
    confidence: number;
  };

  failure_pattern: {
    kind:
      | "missed_once"
      | "missed_repeatedly"
      | "procrastination"
      | "avoidance"
      | "partial_execution"
      | "stalled"
      | "unknown";
    evidence: string[];
  };

  blocker_hypothesis: {
    primary:
      | "fatigue_overload"
      | "fear_avoidance"
      | "shame_self_criticism"
      | "unclear_action"
      | "context_impossible"
      | "action_too_heavy"
      | "motivation_loss"
      | "mixed"
      | "unknown";
    confidence: number;
    evidence: string[];
  };

  emotional_overlay: {
    present: boolean;
    dominant:
      | "none"
      | "shame"
      | "guilt"
      | "self_criticism"
      | "stress"
      | "discouragement"
      | "safety_risk";
    intensity: "none" | "low" | "medium" | "high";
  };

  readiness: {
    can_diagnose_now: boolean;
    needs_one_question: boolean;
    can_recommend: boolean;
    should_handoff: boolean;
  };
};
```

### Logique de remplissage

Le skill recoit :

```text
execution_breakdown signal
+ contexte injecte par execution_breakdown_context_loader
+ active_skill_state si continuation
```

Puis il remplit les slots dans cet ordre :

```text
1. target
   De quelle action / sujet parle-t-on ?

2. emotional_overlay
   Est-ce que la honte, l'auto-critique ou le danger dominent ?

3. failure_pattern
   Que se passe-t-il concretement ? rate, repousse, commence puis arrete, evite ?

4. blocker_hypothesis
   Quel frein semble dominant ?

5. readiness
   Est-ce qu'on peut repondre / recommander / faut-il poser une question / handoff ?
```

### Questions autorisees

Le skill peut poser une question courte si un trou bloque vraiment la suite.

Maximum :

```text
1 question par tour
2 questions maximum sur tout le skill
```

Priorite des questions :

```text
1. cible manquante
2. frein dominant inconnu
3. contexte impossible a trancher
```

Exemples :

```text
"Tu parles de quelle action precisement ?"

"Quand tu arrives au moment de le faire, c'est plutot fatigue, peur, flou, ou le contexte qui bloque ?"
```

### Regles de reponse

Le skill doit :

- ralentir le reflexe solution ;
- ne pas modifier le plan directement ;
- ne pas proposer de carte / potion / reminder trop tot ;
- poser maximum une question utile si un trou critique manque ;
- reformuler le blocage sans culpabiliser ;
- distinguer action trop dure, mauvais contexte, fatigue, peur, honte, flou ;
- transmettre une opportunite au recommendation_tool seulement si le diagnostic
  est suffisant.

Le skill ne doit pas :

- dire "il faut juste faire plus simple" automatiquement ;
- pousser le dashboard sans diagnostic ;
- creer une operation lui-meme ;
- rester actif si la honte ou la crise devient dominante ;
- resoudre une demande explicite d'operation a la place de l'operation_router ;
- multiplier les signaux dispatcher necessaires a son activation.

### Sortie structuree

```ts
type ExecutionBreakdownOutput = {
  skill_id: "execution_breakdown";

  status:
    | "continue"
    | "complete"
    | "exit"
    | "handoff"
    | "recommendation_needed";

  phase:
    | "target_resolution"
    | "diagnosis"
    | "repair_response"
    | "recommendation_handoff"
    | "exit";

  response_intent:
    | "clarify_target"
    | "understand_blocker"
    | "name_blocker"
    | "reduce_pressure"
    | "prepare_recommendation"
    | "handoff_emotional_repair"
    | "handoff_demotivation_repair"
    | "handoff_safety";

  slots: ExecutionBreakdownSlots;

  reply: string;

  next_question?: {
    needed: boolean;
    question?: string;
    reason?: string;
  };

  recommendation_need?: {
    needed: boolean;
    type: "execution_repair" | "state_regulation" | "plan_adjustment" | "none";
    urgency: "none" | "low" | "medium" | "high";
    constraints: string[];
    input_summary?: {
      target_label?: string | null;
      target_kind?: "plan_item" | "personal_action" | "free_subject" | "unknown";
      plan_item_id?: string | null;
      blocker_type?: string | null;
      emotional_overlay?: string | null;
      evidence: string[];
    };
  };

  handoff_request?: {
    target_skill_id: "safety_crisis" | "emotional_repair" | "demotivation_repair";
    reason: string;
    confidence: number;
  };

  state_patch: {
    summary: string;
    phase: ExecutionBreakdownOutput["phase"];
    target_label?: string | null;
    target_id?: string | null;
    blocker_hypothesis?: string | null;
    missing_slots: string[];
    turn_count_increment: 1;
  };

  memory_write_candidates?: Array<{
    kind: "statement" | "event" | "action_observation";
    content: string;
    confidence: "low" | "medium" | "high";
    evidence: string[];
    should_persist: boolean;
  }>;
};
```

### Recommendation policy

Le skill ne choisit pas la feature.

Il peut seulement produire :

```json
{
  "recommendation_need": {
    "needed": true,
    "type": "execution_repair",
    "urgency": "low",
    "constraints": [
      "ask_consent_first",
      "no_pressure",
      "do_not_modify_plan_without_confirmation",
      "prefer_state_regulation_if_shame_or_fatigue_dominates"
    ],
    "input_summary": {
      "target_label": "marche du soir",
      "target_kind": "plan_item",
      "blocker_type": "fatigue_overload",
      "emotional_overlay": "low",
      "evidence": ["Le user dit qu'il est rince le soir."]
    }
  }
}
```

Ensuite :

```text
recommendation_tool decide : potion / reduction / reminder / carte / rien.
operation_router prend le relais si action acceptee.
```

### Handoffs

```text
execution_breakdown -> safety_crisis
  si emotional_overlay.kind = safety_risk

execution_breakdown -> emotional_repair
  si honte / culpabilite / auto-critique domine

execution_breakdown -> demotivation_repair
  si le probleme n'est pas l'action mais la perte de sens ou d'elan

execution_breakdown -> operation_router
  si operation_intent forte detectee par le dispatcher
```

### Exit rules

Sortir si :

```text
- cible + frein dominant identifies ;
- recommendation_need transmise ;
- handoff demande ;
- operation_intent prend le relais ;
- user change de sujet ;
- max_turns atteint.
```

Max turns MVP :

```text
2 tours par defaut
3 tours maximum si le user repond clairement aux questions
```

### Tests MVP

```text
"j'arrive pas a faire ma marche"
-> execution_breakdown start
-> target_hint marche
-> blocker unknown
-> pose une question courte

"je rate toujours ma marche, je suis nul"
-> emotional_overlay self_criticism high
-> handoff emotional_repair
-> pas de recommendation

"je rate ma marche parce que je suis rince le soir"
-> blocker fatigue_overload
-> recommendation_needed execution_repair possible

"cree-moi une carte d'attaque pour ma marche"
-> operation_intent prepare_attack_card
-> operation_router prioritaire
-> execution_breakdown ne prend pas la main

"ca sert a rien mon plan"
-> demotivation_repair prioritaire sauf action concrete claire
```

# Operation skills definitions

Les operation skills ne sont pas des conversation skills humains.

Ils gerent un flow produit concret :

```text
operation_intent / recommendation_operation
-> operation_router
-> operation skill
-> readiness_gate
-> generator
-> pending_confirmation Oui/Non
-> executor si Oui
```

Regles communes :

- aucun write durable sans confirmation Oui ;
- le generator produit un draft, jamais un write ;
- l'executor recoit uniquement un draft confirme ;
- safety override toujours ;
- le chemin `recommendation_tool` ne doit pas relancer une discussion d'intake si
  le payload est deja suffisant ;
- le chemin `direct_user_request` peut poser une question courte si une info
  obligatoire manque.

## Operation Skill: prepare_attack_card_operation_skill

### Role

`prepare_attack_card_operation_skill` prepare une carte d'attaque a partir d'une
demande directe du user ou d'une recommandation deja structuree.

Il ne decide pas si une carte d'attaque est la meilleure intervention. Il ne
cree rien directement. Il prepare un draft, demande confirmation Oui/Non, puis
l'executor ecrit seulement si Oui.

Objectif :

```text
Creer une carte d'attaque ciblee pour faciliter le demarrage d'une action.
```

### Famille

```text
operation
```

### Deux chemins d'entree

#### Chemin A - demande directe du user

Le user demande explicitement une carte d'attaque.

```text
user
-> dispatcher.operation_intent
-> operation_router
-> prepare_attack_card_operation_skill
-> intake si infos manquantes
-> readiness_gate
-> generator
-> pending_confirmation Oui/Non
-> executor si Oui
```

Exemples :

```text
"cree-moi une carte d'attaque"
"fais une carte d'attaque pour ma marche"
"prepare-moi une carte pour reussir a lancer ma seance"
```

Ici, la discussion est possible, parce que le user peut ne pas avoir donne assez
d'infos.

#### Chemin B - recommandation deja structuree

Un skill conversationnel a diagnostique la situation, puis `recommendation_tool`
recommande l'operation.

```text
conversation_skill
-> recommendation_tool
-> recommend_operation prepare_attack_card avec payload suffisant
-> operation_router
-> readiness_gate
-> generator
-> pending_confirmation Oui/Non
-> executor si Oui
```

Ici, normalement il n'y a pas de discussion d'intake.

Regle :

```text
recommendation_tool path = skip intake conversationnel
direct user request path = intake possible
```

Si le payload recommendation est insuffisant :

```text
ne pas demander au user dans ce flow
-> retourner invalid_recommendation_payload
-> revenir au skill precedent ou ne rien recommander
```

### Declencheurs

#### Direct operation_intent

```json
{
  "operation_intent": {
    "detected": true,
    "operation_type": "prepare_attack_card",
    "user_intent": "create",
    "confidence": 0.84,
    "target_hint": "ma marche du soir",
    "needs_intake": true,
    "reason": "User explicitly asks Sophia to create an attack card."
  }
}
```

#### Recommendation operation

```json
{
  "decision": "recommend_operation",
  "operation_type": "prepare_attack_card",
  "confidence": 0.82,
  "requires_confirmation": true,
  "operation_input": {
    "target": {
      "plan_item_id": "item_123",
      "title": "Marche du soir"
    },
    "blocker": {
      "type": "avoidance",
      "evidence": ["Le user repousse la marche depuis plusieurs soirs."]
    },
    "constraints": ["short", "no_pressure"]
  }
}
```

### Entry conditions

Entrer via demande directe si :

```text
operation_intent.operation_type = prepare_attack_card
operation_intent.confidence >= 0.75
pas de safety_crisis
pas de pending_operation_confirmation
```

Entrer via recommendation si :

```text
recommendation.decision = recommend_operation
recommendation.operation_type = prepare_attack_card
recommendation.operation_input satisfait le minimum viable payload
pas de safety_crisis
pas de pending_operation_confirmation
```

Ne pas entrer si :

```text
"c'est quoi une carte d'attaque ?" -> product_help
honte / auto-attaque high -> emotional_repair prioritaire
safety -> safety_crisis
payload recommendation incomplet -> invalid_recommendation_payload
```

### Working state

```ts
type PrepareAttackCardOperationState = {
  operation_id: string;
  operation_type: "prepare_attack_card";

  status:
    | "intake"
    | "asking_question"
    | "ready_to_generate"
    | "draft_generated"
    | "pending_confirmation"
    | "executed"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload";

  source: "direct_user_request" | "recommendation_tool";

  turn_count: number;
  max_collection_questions: 1;

  previous_skill_id?: string | null;

  summary: string;
  slots: PrepareAttackCardSlots;
  missing_slots: string[];

  last_question_asked?: string | null;
  draft_id?: string | null;
};
```

Stockage :

```text
__active_operation_intake_v1
```

### Slots

```ts
type PrepareAttackCardSlots = {
  target: {
    required: true;
    status: "identified" | "ambiguous" | "missing";
    kind: "plan_item" | "personal_action" | "free_subject" | "unknown";
    plan_item_id?: string | null;
    title?: string | null;
    confidence: number;
    source:
      | "user_message"
      | "dispatcher_hint"
      | "plan_snapshot"
      | "memory"
      | "recommendation";
  };

  current_action: {
    required: true;
    instruction?: string | null;
    confidence: number;
  };

  blocker: {
    required: true;
    type:
      | "avoidance"
      | "procrastination"
      | "action_too_heavy"
      | "unclear_first_step"
      | "low_energy"
      | "friction"
      | "mixed"
      | "unknown";
    evidence: string[];
    confidence: number;
    source: "user_message" | "memory" | "recommendation" | "skill_output";
  };

  desired_attack_angle: {
    required: false;
    value:
      | "minimum_version"
      | "first_step"
      | "environment_setup"
      | "if_then_rule"
      | "reduce_friction"
      | "unknown";
    confidence: number;
  };

  constraints: {
    required: true;
    values: string[];
  };
};
```

### Context loader

#### Source = direct_user_request

Phase `target_resolution`, avant cible identifiee :

```text
actions du plan actives cette semaine / phase active
actions personnelles pertinentes
target_hint dispatcher
dernier plan item discute
active topic
action context recent
```

Phase `slot_filling`, apres cible identifiee :

```text
plan_item ou action cible
instruction actuelle
observations / blockers lies
historique recent de tentatives
slots deja remplis
derniers messages utiles
```

Phase `generation` :

```text
plan_item/action cible
instruction actuelle
blocker valide ou fallback safe angle
contraintes
2-3 elements memoire utiles maximum
```

#### Source = recommendation_tool

Ne pas charger large.

Injecter seulement :

```text
operation_input recommendation
skill_output summary
target plan_item/action deja identifie
blocker deja identifie
contraintes
2-3 evidence items maximum
```

Regle :

```text
Pas de nouvelle discussion d'intake.
Pas de liste large d'actions.
Pas de plan complet.
```

### Target resolver

Pour une carte d'attaque, le `target_resolver` doit rattacher la carte a une
action concrete.

Contrairement a une carte de defense, une carte d'attaque ne doit pas etre
generee pour un risque libre ou un contexte vague. Elle sert a faciliter le
demarrage d'une action.

Questions auxquelles le resolver repond :

```text
1. Quelle action la carte doit-elle aider a demarrer ?
2. Cette action vient-elle du plan actif ou d'une action personnelle hors plan ?
3. A-t-on assez d'information pour generer une strategie de demarrage ?
```

Sortie attendue :

```ts
type AttackCardTargetResolution = {
  target: {
    status: "identified" | "ambiguous" | "missing";
    kind:
      | "plan_item"
      | "personal_action"
      | "free_subject"
      | "unknown";
    plan_item_id?: string | null;
    title?: string | null;
    current_instruction?: string | null;
    confidence: number;
    source:
      | "user_message"
      | "dispatcher_hint"
      | "plan_snapshot"
      | "memory"
      | "recommendation";
  };

  action_fit: {
    can_create_attack_card: boolean;
    reason: string;
  };
};
```

Cas autorises MVP :

```text
plan_item
  action du plan actif identifiee clairement

personal_action
  action personnelle concrete hors plan, clairement nommee
```

Cas non autorises MVP :

```text
free_subject
  sujet vague sans action concrete

unknown
  cible introuvable
```

#### Direct request

```text
si action du plan claire -> target.kind=plan_item -> continuer
si action personnelle claire -> target.kind=personal_action -> continuer si executor supporte personal_action
si sujet vague sans action -> poser 1 question
si target toujours floue apres 1 question -> fallback dashboard
```

Exemples :

```text
"cree une carte d'attaque pour ma marche du soir"
-> plan_item si la marche du soir existe dans le plan actif
-> sinon personal_action si elle est claire hors plan

"cree une carte d'attaque pour me remettre au sport"
-> ambiguous/free_subject
-> question: "Tu veux la carte pour quelle action sportive precise ?"

"cree une carte d'attaque pour ma seance de muscu demain"
-> personal_action si pas dans le plan, mais action concrete
```

#### Recommendation path

```text
target doit deja etre identified
target.kind doit etre plan_item ou personal_action
sinon invalid_recommendation_payload
```

Regles de contexte :

```text
avant identification
  injecter actions du plan actif + actions personnelles pertinentes + target_hint

apres identification
  ne garder que l'action ciblee, son instruction actuelle, les blockers et les derniers messages utiles

avant generation
  ne garder que target + blocker + contraintes + evidence minimale
```

### Questions autorisees

Seulement pour `source = direct_user_request`.

Maximum :

```text
1 question de collecte
```

Priorite :

```text
1. cible manquante
2. blocker totalement inconnu si necessaire
```

Exemples :

```text
"Tu veux la carte d'attaque pour quelle action precisement ?"

"Pour cette action, le blocage principal c'est plutot de commencer, de savoir quoi faire en premier, ou que l'action est trop lourde ?"
```

Aucune question d'intake pour `source = recommendation_tool`.

### Readiness gate

Minimum viable payload :

```text
target.status = identified
target.kind = plan_item ou personal_action
target.title existe
current_action.instruction existe OU target.title suffit
blocker.type != unknown OU fallback safe angle possible
constraints incluent no_pressure + do_not_increase_difficulty
```

Sortie :

```ts
type PrepareAttackCardReadiness = {
  ready_to_generate: boolean;
  safe_to_generate: boolean;
  needs_one_question: boolean;
  fallback_to_dashboard: boolean;
  invalid_recommendation_payload: boolean;
  missing_required_slots: string[];
  reason: string;
};
```

Regles :

```text
safety -> ready_to_generate=false
honte forte -> emotional_repair prioritaire
direct request + target missing + question non posee -> ask_question
direct request + target missing + question deja posee -> fallback_dashboard
recommendation path + missing required slot -> invalid_recommendation_payload
recommendation path + ready -> generator direct
```

### Payload builder

```ts
type PrepareAttackCardDraftRequest = {
  operation_id: string;
  operation_type: "prepare_attack_card";

  source: "direct_user_request" | "recommendation_tool";

  target: {
    plan_item_id?: string | null;
    title: string;
    current_instruction?: string | null;
    kind: "plan_item" | "personal_action";
  };

  blocker: {
    type:
      | "avoidance"
      | "procrastination"
      | "action_too_heavy"
      | "unclear_first_step"
      | "low_energy"
      | "friction"
      | "mixed";
    evidence: string[];
    confidence: number;
  };

  desired_attack_angle:
    | "minimum_version"
    | "first_step"
    | "environment_setup"
    | "if_then_rule"
    | "reduce_friction"
    | "unknown";

  constraints: string[];
  forbidden: string[];

  output_schema: "attack_card_draft_v1";
};
```

Contraintes par defaut :

```text
short
no_pressure
must_be_doable_under_5_minutes
do_not_moralize
do_not_increase_difficulty
ask_confirmation_before_write
```

### Generator

Le generator produit un draft uniquement.

```ts
type AttackCardDraftV1 = {
  operation_type: "prepare_attack_card";
  draft: {
    title: string;
    target_label: string;
    technique:
      | "minimum_version"
      | "first_step"
      | "environment_setup"
      | "if_then_rule"
      | "reduce_friction";
    instruction: string;
    why_it_helps: string;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};
```

### Pending confirmation

Apres generator :

```text
envoyer confirmation_message
afficher [Oui] [Non]
stocker __pending_operation_confirmation
clear/suspend __active_operation_intake_v1
```

Etat :

```json
{
  "operation_id": "op_123",
  "operation_type": "prepare_attack_card",
  "previous_skill_id": "execution_breakdown",
  "source": "recommendation_tool",
  "summary": "Creer une carte d'attaque courte pour la marche du soir.",
  "draft": {
    "title": "Version minimale de la marche du soir",
    "instruction": "Mettre tes chaussures et marcher 4 minutes."
  },
  "expires_after_turns": 2
}
```

### Oui / Non

```text
Oui -> executor prepare_attack_card
Non -> cancel, aucun write
Autre texte -> clear pending, traiter comme conversation normale
Safety -> blocked_by_safety + clear pending
Expiration -> cancel
```

Apres Oui :

```text
C'est fait. J'ai cree une carte d'attaque pour ta marche du soir : mettre tes chaussures et marcher 4 minutes.
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Executor

L'executor recoit uniquement le draft confirme.

```ts
type PrepareAttackCardExecutorInput = {
  operation_id: string;
  user_id: string;
  target: {
    plan_item_id?: string | null;
    kind: "plan_item" | "personal_action";
    title: string;
  };
  draft: AttackCardDraftV1["draft"];
  source: {
    trigger_message_id: string;
    previous_skill_id?: string | null;
    operation_source: "direct_user_request" | "recommendation_tool";
  };
};
```

L'executor :

```text
valide input
ecrit en DB
log executed_tools / event
clear pending confirmation
ack user
memorizer async si utile
```

### Output du skill operationnel

```ts
type PrepareAttackCardOperationOutput = {
  operation_type: "prepare_attack_card";

  status:
    | "continue_intake"
    | "ask_question"
    | "ready_to_generate"
    | "draft_generated"
    | "pending_confirmation"
    | "executed"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";

  source: "direct_user_request" | "recommendation_tool";

  phase:
    | "target_resolution"
    | "slot_filling"
    | "readiness_check"
    | "generation"
    | "confirmation"
    | "execution"
    | "exit";

  slots: PrepareAttackCardSlots;

  readiness: PrepareAttackCardReadiness;

  next_question?: {
    needed: boolean;
    question?: string;
    reason?: string;
  };

  draft_request?: PrepareAttackCardDraftRequest;
  draft?: AttackCardDraftV1;

  confirmation?: {
    required: boolean;
    message: string;
    actions: ["yes", "no"];
  };

  state_patch: {
    summary: string;
    phase: PrepareAttackCardOperationOutput["phase"];
    slots: Partial<PrepareAttackCardSlots>;
    missing_slots: string[];
    last_question_asked?: string | null;
    turn_count_increment: 1;
  };

  exit_reason?: string;
};
```

### Tests MVP

```text
"cree-moi une carte d'attaque pour ma marche"
-> direct_user_request
-> target resolved marche
-> generator
-> pending confirmation Oui/Non

"cree-moi une carte d'attaque"
-> direct_user_request
-> target missing
-> ask one question

target still missing after one question
-> fallback dashboard

recommendation_tool returns prepare_attack_card with full payload
-> skip intake
-> readiness_gate
-> generator
-> pending confirmation

recommendation_tool returns prepare_attack_card with missing target
-> invalid_recommendation_payload
-> no question asked

"je suis nul, cree une carte d'attaque"
-> emotional_repair prioritaire si honte high
-> pas de generator

pending confirmation + Oui
-> executor
-> ack avec "Tu peux modifier dans ton espace sur sophia-coach.ai."

pending confirmation + Non
-> cancel
-> no DB write

safety pendant intake
-> blocked_by_safety
-> clear operation state
```

## Operation Skill: prepare_defense_card_operation_skill

### Role

`prepare_defense_card_operation_skill` prepare une carte de defense quand le
user veut se proteger d'un moment a risque : tentation, rechute, impulsion,
evitement previsible, contexte recurrent qui le fait derailer.

Il ne decide pas seul qu'une carte de defense est pertinente. Il prepare un
draft, demande confirmation Oui/Non, puis l'executor ecrit seulement si Oui.

Objectif :

```text
Creer une reponse defensive claire pour un moment a risque identifie.
```

### Famille

```text
operation
```

### Deux chemins d'entree

#### Chemin A - demande directe du user

```text
user
-> dispatcher.operation_intent prepare_defense_card
-> operation_router
-> prepare_defense_card_operation_skill
-> intake si infos manquantes
-> readiness_gate
-> generator
-> pending_confirmation Oui/Non
-> executor si Oui
```

Exemples :

```text
"cree-moi une carte de defense"
"fais une carte de defense pour quand j'ai envie de fumer"
"prepare une defense pour le soir quand je craque"
```

#### Chemin B - recommandation deja structuree

```text
conversation_skill
-> recommendation_tool
-> recommend_operation prepare_defense_card avec payload suffisant
-> operation_router
-> readiness_gate
-> generator
-> pending_confirmation Oui/Non
-> executor si Oui
```

Regle :

```text
recommendation_tool path = pas d'intake conversationnel
direct_user_request path = intake possible
```

Si le payload recommendation est incomplet :

```text
invalid_recommendation_payload
-> pas de question user dans ce flow
-> retour au skill precedent ou aucune recommandation
```

### Entry conditions

Entrer via demande directe si :

```text
operation_intent.operation_type = prepare_defense_card
operation_intent.confidence >= 0.75
pas de safety_crisis
pas de pending_operation_confirmation
```

Entrer via recommendation si :

```text
recommendation.operation_type = prepare_defense_card
recommendation.operation_input satisfait le minimum viable payload
pas de safety_crisis
pas de pending_operation_confirmation
```

Ne pas entrer si :

```text
"c'est quoi une carte de defense ?" -> product_help
danger immediat -> safety_crisis
honte forte sans risque concret -> emotional_repair
probleme de demarrage d'action -> attack_card plutot que defense_card
payload recommendation incomplet -> invalid_recommendation_payload
```

### Resolution cible + risque

Pour une carte de defense, la resolution est plus complexe que pour une carte
d'attaque.

Le skill doit repondre a deux questions :

```text
1. A quoi la carte est rattachee ?
2. Contre quoi elle defend ?
```

La carte peut etre :

```text
- liee a une action du plan ;
- liee a une action personnelle hors plan ;
- liee a un risque libre sans action precise ;
- liee a un contexte recurrent.
```

### Target resolver

Sortie attendue :

```ts
type DefenseCardTargetResolution = {
  attachment: {
    status: "identified" | "ambiguous" | "missing";
    kind:
      | "plan_item"
      | "personal_action"
      | "free_risk_context"
      | "recurring_context"
      | "unknown";
    plan_item_id?: string | null;
    title?: string | null;
    confidence: number;
    source:
      | "user_message"
      | "dispatcher_hint"
      | "plan_snapshot"
      | "memory"
      | "recommendation";
  };

  risk: {
    status: "identified" | "ambiguous" | "missing";
    label?: string | null;
    trigger_hint?: string | null;
    timing_hint?: string | null;
    confidence: number;
  };
};
```

### Slots

```ts
type PrepareDefenseCardSlots = {
  attachment: {
    required: true;
    status: "identified" | "ambiguous" | "missing";
    kind:
      | "plan_item"
      | "personal_action"
      | "free_risk_context"
      | "recurring_context"
      | "unknown";
    plan_item_id?: string | null;
    title?: string | null;
    confidence: number;
  };

  risk_situation: {
    required: true;
    status: "identified" | "ambiguous" | "missing";
    label?: string | null;
    description?: string | null;
    timing_hint?: string | null;
    context_hint?: string | null;
    confidence: number;
  };

  trigger: {
    required: true;
    type:
      | "temptation"
      | "impulse"
      | "emotional_drop"
      | "social_context"
      | "fatigue"
      | "stress"
      | "habit_loop"
      | "avoidance"
      | "unknown";
    evidence: string[];
    confidence: number;
  };

  defense_goal: {
    required: true;
    value:
      | "avoid_relapse"
      | "interrupt_impulse"
      | "protect_action"
      | "leave_context"
      | "reduce_damage"
      | "unknown";
    confidence: number;
  };

  defense_response_hint: {
    required: false;
    value?: string | null;
    strategy_hint:
      | "delay"
      | "leave_context"
      | "replace_action"
      | "contact_support"
      | "environment_block"
      | "self_talk"
      | "unknown";
    confidence: number;
  };

  constraints: {
    required: true;
    values: string[];
  };
};
```

### Context loader

#### Phase 1 - attachment_resolution

Si on ne sait pas si la carte est liee au plan :

```text
actions du plan actives cette semaine / phase active
actions personnelles pertinentes
dernier plan item discute
target_hint dispatcher
active topic
recent messages
```

Objectif :

```text
identifier si la carte se rattache a un plan_item, une action perso, ou un contexte libre.
```

#### Phase 2 - risk_resolution

Une fois l'attachement identifie :

Si `plan_item` :

```text
plan_item cible
instruction actuelle
observations / blockers lies
events recents lies
topic memories liees si utiles
```

Si `personal_action` :

```text
action personnelle identifiee
contexte conversationnel recent
events / statements lies
topic actif
```

Si `free_risk_context` :

```text
description du risque
moments recents ou ce risque apparait
trigger / timing / contexte
topic actif
```

Si `recurring_context` :

```text
contexte recurrent
timing connu
declencheurs connus
historique recent
```

#### Phase 3 - generation

Toujours reduire a :

```text
attachment identifie
risk_situation identifiee
trigger
timing/context si connu
defense souhaitee si connue
contraintes
2-3 evidence items maximum
```

Ne pas injecter :

```text
plan complet
liste des autres actions
memoire profonde
catalogue produit
```

#### Source = recommendation_tool

Injecter seulement :

```text
operation_input recommendation
skill_output summary
attachment deja identifie
risk_situation deja identifiee
trigger deja identifie
contraintes
2-3 evidence items maximum
```

Regle :

```text
Pas de nouvelle discussion d'intake.
Pas de liste large d'actions.
Pas de plan complet.
```

### Questions autorisees

Seulement pour `source = direct_user_request`.

Maximum :

```text
1 question de collecte
```

La question depend du trou principal.

Si `attachment` manque :

```text
"Tu veux la carte pour proteger quelle action ou quel moment precisement ?"
```

Si `risk_situation` manque :

```text
"Tu veux te defendre contre quoi exactement dans ce moment-la ?"
```

Si `trigger` manque mais attachment + risk sont suffisants :

```text
pas forcement besoin de question
-> generer une defense simple et sure
```

### Readiness gate

Minimum viable payload :

```text
attachment.status = identified
risk_situation.status = identified
defense_goal != unknown
trigger.type != unknown OU risk_situation assez claire
constraints incluent no_pressure + no_safety_substitution
```

Important :

```text
attachment.kind peut etre free_risk_context.
On n'exige donc pas forcement un plan_item_id.
```

Exemples valides :

```text
plan_item:
"carte de defense pour ne pas sauter ma marche quand il pleut"

personal_action:
"carte de defense pour ne pas commander Uber Eats le soir"

free_risk_context:
"carte de defense quand j'ai envie de fumer"

recurring_context:
"carte de defense pour les dimanches soir ou je decroche"
```

Regles :

```text
safety -> blocked_by_safety
direct request + attachment/risk missing + question non posee -> ask_question
direct request + attachment/risk missing apres 1 question -> fallback_dashboard
recommendation path + missing required slot -> invalid_recommendation_payload
honte forte sans risque concret -> emotional_repair
```

### Contraintes par defaut

```text
short
no_pressure
do_not_moralize
do_not_shame
no_safety_substitution
must_be_actionable_in_the_moment
ask_confirmation_before_write
```

### Generator

Le generator produit un draft uniquement.

```ts
type DefenseCardDraftV1 = {
  operation_type: "prepare_defense_card";
  draft: {
    title: string;
    target_label: string;
    risk_situation: string;
    trigger: string;
    defense_response: string;
    fallback_plan?: string | null;
    why_it_helps: string;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};
```

### Pending confirmation

```text
generator
-> confirmation_message
-> [Oui] [Non]
-> __pending_operation_confirmation
```

Apres Oui :

```text
C'est fait. J'ai cree une carte de defense pour ce moment a risque : ...
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Output operationnel

```ts
type PrepareDefenseCardOperationOutput = {
  operation_type: "prepare_defense_card";
  status:
    | "continue_intake"
    | "ask_question"
    | "ready_to_generate"
    | "draft_generated"
    | "pending_confirmation"
    | "executed"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase:
    | "attachment_resolution"
    | "risk_resolution"
    | "slot_filling"
    | "readiness_check"
    | "generation"
    | "confirmation"
    | "execution"
    | "exit";
  slots: PrepareDefenseCardSlots;
  readiness: Record<string, unknown>;
  next_question?: { needed: boolean; question?: string; reason?: string };
  draft?: DefenseCardDraftV1;
  state_patch: {
    summary: string;
    phase: string;
    slots: Partial<PrepareDefenseCardSlots>;
    missing_slots: string[];
    last_question_asked?: string | null;
    turn_count_increment: 1;
  };
  exit_reason?: string;
};
```

### Tests MVP

```text
"cree une carte de defense pour quand j'ai envie de fumer"
-> direct_user_request
-> attachment free_risk_context
-> risk_situation identified
-> generator
-> pending confirmation

"cree une carte de defense pour ne pas sauter ma marche quand il pleut"
-> direct_user_request
-> attachment plan_item
-> risk_situation identified
-> generator

"cree-moi une carte de defense"
-> ask one question

recommendation_tool returns full payload
-> skip intake
-> generator
-> pending confirmation

recommendation payload missing risk_situation
-> invalid_recommendation_payload
-> no user question

"je veux me faire du mal"
-> safety_crisis
-> no defense card

pending confirmation + Oui
-> executor
-> ack avec "Tu peux modifier dans ton espace sur sophia-coach.ai."

pending confirmation + Non
-> cancel
-> no DB write
```

## Operation Skill: update_coach_preferences_operation_skill

### Role

`update_coach_preferences_operation_skill` prepare une modification des
preferences coach quand le user demande explicitement a Sophia de changer sa
maniere de repondre, de challenger, de poser des questions ou d'accompagner.

Il ne modifie rien directement. Il prepare un patch de preferences, demande
confirmation Oui/Non, puis l'executor applique seulement si Oui.

Objectif :

```text
Adapter le style de Sophia sans interpreter trop largement une remarque ponctuelle.
```

### Famille

```text
operation
```

### Deux chemins d'entree

#### Chemin A - demande directe du user

```text
user
-> dispatcher.operation_intent update_coach_preferences
-> operation_router
-> update_coach_preferences_operation_skill
-> intake si preference/valeur manquante
-> readiness_gate
-> coach_preferences_patch_builder
-> pending_confirmation Oui/Non
-> executor si Oui
```

Exemples :

```text
"sois plus direct"
"pose-moi moins de questions"
"challenge-moi davantage"
"reponds plus doucement"
"arrete de me mettre la pression"
```

#### Chemin B - recommendation_tool

```text
conversation_skill
-> recommendation_tool
-> recommend_operation update_coach_preferences avec payload suffisant
-> operation_router
-> readiness_gate
-> coach_preferences_patch_builder
-> pending_confirmation Oui/Non
-> executor si Oui
```

Regle :

```text
recommendation_tool path = pas d'intake conversationnel
direct_user_request path = intake possible
```

### Preferences couvertes MVP

```ts
type CoachPreferenceKey =
  | "coach.tone"
  | "coach.challenge_level"
  | "coach.question_tendency";
```

Valeurs :

```ts
type CoachPreferencePatchValue = {
  "coach.tone": "doux" | "bienveillant_ferme" | "tres_direct";
  "coach.challenge_level": "leger" | "equilibre" | "eleve";
  "coach.question_tendency": "peu_de_questions" | "equilibre" | "tres_questionnant";
};
```

### Entry conditions

Entrer si :

```text
operation_type = update_coach_preferences
confidence >= 0.75
pas de safety_crisis
pas de pending_operation_confirmation
```

Ne pas entrer si :

```text
user exprime juste une emotion ponctuelle -> emotional_repair possible
user demande "ou changer tes preferences ?" -> product_help
payload recommendation incomplet -> invalid_recommendation_payload
```

### Slots internes

```ts
type UpdateCoachPreferencesSlots = {
  preference: {
    required: true;
    status: "identified" | "ambiguous" | "missing";
    key: CoachPreferenceKey | "unknown";
    confidence: number;
  };

  desired_value: {
    required: true;
    status: "identified" | "ambiguous" | "missing";
    value:
      | "doux"
      | "bienveillant_ferme"
      | "tres_direct"
      | "leger"
      | "equilibre"
      | "eleve"
      | "peu_de_questions"
      | "tres_questionnant"
      | "unknown";
    confidence: number;
  };

  reason: {
    required: false;
    evidence: string[];
    confidence: number;
  };

  constraints: {
    required: true;
    values: string[];
  };
};
```

### Mapping user -> preference

```text
"sois plus direct"
-> coach.tone = tres_direct

"reponds plus doucement"
-> coach.tone = doux

"challenge-moi plus"
-> coach.challenge_level = eleve

"vas-y plus doucement"
-> coach.challenge_level = leger OU coach.tone = doux selon contexte

"pose-moi moins de questions"
-> coach.question_tendency = peu_de_questions

"questionne-moi plus"
-> coach.question_tendency = tres_questionnant
```

### Context loader

#### Direct request

Injecter :

```text
message courant
preferences coach actuelles
preference_hint dispatcher
valeur demandee si claire
dernier feedback user sur le style Sophia
```

Ne pas injecter :

```text
plan complet
memoire profonde
catalogue produit
```

#### Recommendation path

Injecter seulement :

```text
operation_input recommendation
preference ciblee
valeur proposee
raison/evidence courte
preferences actuelles necessaires pour diff
```

Pas d'intake.

### Questions autorisees

Seulement pour `direct_user_request`.

Maximum :

```text
1 question de collecte
```

Priorite :

```text
1. preference ambigue
2. valeur ambigue
```

Exemples :

```text
"Quand tu dis plus doux, tu veux surtout moins de challenge, ou un ton plus chaleureux ?"

"Tu veux que je pose moins de questions, ou que je les garde mais plus directes ?"
```

### Readiness gate

Minimum viable payload :

```text
preference.status = identified
desired_value.status = identified
desired_value compatible avec preference.key
constraints incluent requires_confirmation
```

Regles :

```text
direct request + preference/value ambiguous + question non posee -> ask_question
direct request + toujours ambigu apres 1 question -> fallback_dashboard ou product_help
recommendation path + missing required slot -> invalid_recommendation_payload
```

### Builder output

```ts
type CoachPreferencesPatchDraftV1 = {
  operation_type: "update_coach_preferences";
  draft: {
    patch: Partial<Record<CoachPreferenceKey, string>>;
    summary: string;
    reason?: string | null;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};
```

Exemple :

```json
{
  "operation_type": "update_coach_preferences",
  "draft": {
    "patch": {
      "coach.question_tendency": "peu_de_questions"
    },
    "summary": "Sophia posera moins de questions dans ses reponses.",
    "reason": "Le user demande explicitement moins de questions."
  },
  "confirmation_message": "Je peux regler ma facon de repondre pour poser moins de questions. Tu veux que je l'applique ?",
  "confirmation_actions": ["yes", "no"]
}
```

### Pending confirmation

```text
builder
-> confirmation_message
-> [Oui] [Non]
-> __pending_operation_confirmation
```

Apres Oui :

```text
C'est fait. J'ai mis a jour ta preference : je poserai moins de questions.
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Output operationnel

```ts
type UpdateCoachPreferencesOperationOutput = {
  operation_type: "update_coach_preferences";

  status:
    | "continue_intake"
    | "ask_question"
    | "ready_to_generate"
    | "draft_generated"
    | "pending_confirmation"
    | "executed"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";

  source: "direct_user_request" | "recommendation_tool";

  phase:
    | "preference_resolution"
    | "value_resolution"
    | "readiness_check"
    | "generation"
    | "confirmation"
    | "execution"
    | "exit";

  slots: UpdateCoachPreferencesSlots;
  draft?: CoachPreferencesPatchDraftV1;

  state_patch: {
    summary: string;
    phase: string;
    slots: Partial<UpdateCoachPreferencesSlots>;
    missing_slots: string[];
    last_question_asked?: string | null;
    turn_count_increment: 1;
  };

  exit_reason?: string;
};
```

### Tests MVP

```text
"pose-moi moins de questions"
-> preference coach.question_tendency
-> desired_value peu_de_questions
-> pending confirmation

"sois plus direct"
-> coach.tone tres_direct
-> pending confirmation

"vas-y plus doucement"
-> ambiguous tone/challenge
-> ask one question

"ou je change tes preferences ?"
-> product_help

recommendation_tool returns full payload
-> skip intake
-> builder
-> pending confirmation

recommendation payload missing desired_value
-> invalid_recommendation_payload
-> no user question

pending confirmation + Oui
-> executor
-> ack avec sophia-coach.ai

pending confirmation + Non
-> cancel
-> no DB write
```

## Operation Skill: create_recurring_reminder_operation_skill

### Role

`create_recurring_reminder_operation_skill` prepare la creation d'un rappel
recurrent quand le user demande a Sophia de revenir regulierement sur un sujet,
une action, un etat ou un moment.

Il ne gere pas les rappels ponctuels du type :

```text
"rappelle-moi demain a 9h"
"rappelle-moi dans 30 minutes"
```

Ces cas restent dans le tool existant :

```text
one_shot_reminder
```

Objectif :

```text
Creer un rappel recurrent clair, utile, non intrusif, avec confirmation Oui/Non.
```

### Famille

```text
operation
```

### Deux chemins d'entree

#### Chemin A - demande directe du user

```text
user
-> dispatcher.operation_intent create_recurring_reminder
-> operation_router
-> create_recurring_reminder_operation_skill
-> intake si infos manquantes
-> readiness_gate
-> recurring_reminder_builder
-> pending_confirmation Oui/Non
-> executor si Oui
```

Exemples :

```text
"rappelle-moi tous les matins de faire ma marche"
"envoie-moi un rappel chaque dimanche soir"
"rappelle-moi tous les jours de faire une pause"
"tous les lundis, rappelle-moi de regarder mon plan"
```

#### Chemin B - recommendation_tool

```text
conversation_skill
-> recommendation_tool
-> recommend_operation create_recurring_reminder avec payload suffisant
-> operation_router
-> readiness_gate
-> recurring_reminder_builder
-> pending_confirmation Oui/Non
-> executor si Oui
```

Regle :

```text
recommendation_tool path = pas d'intake conversationnel
direct_user_request path = intake possible
```

### Entry conditions

Entrer si :

```text
operation_type = create_recurring_reminder
confidence >= 0.75
pas de safety_crisis
pas de pending_operation_confirmation
```

Ne pas entrer si :

```text
rappel ponctuel clair -> one_shot_reminder
question "comment marchent les rappels ?" -> product_help
payload recommendation incomplet -> invalid_recommendation_payload
```

### Slots internes

```ts
type CreateRecurringReminderSlots = {
  recurrence: {
    required: true;
    status: "identified" | "ambiguous" | "missing";
    frequency:
      | "daily"
      | "weekly"
      | "specific_days"
      | "weekdays"
      | "custom"
      | "unknown";
    days?: string[];
    time?: string | null;
    timezone?: string | null;
    confidence: number;
  };

  reminder_content: {
    required: true;
    status: "identified" | "ambiguous" | "missing";
    message?: string | null;
    subject_hint?: string | null;
    confidence: number;
  };

  destination: {
    required: false;
    value: "current_plan" | "base_de_vie" | "unknown";
    related_plan_item_id?: string | null;
    confidence: number;
  };

  constraints: {
    required: true;
    values: string[];
  };
};
```

### Context loader

#### Direct request

Injecter :

```text
message courant
timezone user
jours/heures mentionnes
target_hint dispatcher
action ou sujet lie si mentionne
rappels recurrents recents pour eviter doublon
plan_item lie si evident
```

Ne pas injecter :

```text
plan complet
memoire profonde
catalogue produit
```

#### Recommendation path

Injecter seulement :

```text
operation_input recommendation
recurrence deja identifiee
message deja propose
destination si connue
contraintes
```

Pas d'intake.

### Questions autorisees

Seulement pour `direct_user_request`.

Maximum :

```text
1 question de collecte
```

Priorite :

```text
1. frequence / jours manquants
2. heure manquante
3. contenu du rappel manquant
```

Exemples :

```text
"Tu veux ce rappel a quel moment de la journee ?"

"Tu veux que je te rappelle ca tous les jours, ou seulement certains jours ?"
```

### Readiness gate

Minimum viable payload :

```text
recurrence.status = identified
reminder_content.status = identified
time existe
timezone existe
constraints incluent requires_confirmation
```

Regles :

```text
one-shot clair -> route one_shot_reminder, pas operation skill
direct request + recurrence/time missing + question non posee -> ask_question
direct request + toujours incomplet apres 1 question -> fallback_dashboard
recommendation path + missing required slot -> invalid_recommendation_payload
```

### Builder output

```ts
type RecurringReminderDraftV1 = {
  operation_type: "create_recurring_reminder";
  draft: {
    title: string;
    message: string;
    frequency: string;
    days?: string[];
    time: string;
    timezone: string;
    destination: "current_plan" | "base_de_vie";
    related_plan_item_id?: string | null;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};
```

### Confirmation

```text
Je te propose de creer ce rappel recurrent :
[message], [frequence], [heure].
Tu veux que je le cree ?
[Oui] [Non]
```

Apres Oui :

```text
C'est fait. J'ai cree ce rappel recurrent : ...
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Output operationnel

```ts
type CreateRecurringReminderOperationOutput = {
  operation_type: "create_recurring_reminder";

  status:
    | "continue_intake"
    | "ask_question"
    | "ready_to_generate"
    | "draft_generated"
    | "pending_confirmation"
    | "executed"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";

  source: "direct_user_request" | "recommendation_tool";

  phase:
    | "recurrence_resolution"
    | "content_resolution"
    | "readiness_check"
    | "generation"
    | "confirmation"
    | "execution"
    | "exit";

  slots: CreateRecurringReminderSlots;
  draft?: RecurringReminderDraftV1;

  state_patch: {
    summary: string;
    phase: string;
    slots: Partial<CreateRecurringReminderSlots>;
    missing_slots: string[];
    last_question_asked?: string | null;
    turn_count_increment: 1;
  };

  exit_reason?: string;
};
```

### Tests MVP

```text
"rappelle-moi tous les matins de faire ma marche"
-> create_recurring_reminder
-> recurrence daily
-> time morning
-> pending confirmation

"rappelle-moi demain a 9h"
-> one_shot_reminder
-> pas operation skill

"rappelle-moi tous les jours"
-> content missing
-> ask one question

recommendation_tool returns full payload
-> skip intake
-> builder
-> pending confirmation

recommendation payload missing time
-> invalid_recommendation_payload
-> no user question

pending confirmation + Oui
-> executor
-> ack avec sophia-coach.ai

pending confirmation + Non
-> cancel
-> no DB write
```

## Operation Skill: select_state_potion_operation_skill

### Role

`select_state_potion_operation_skill` prepare l'activation d'une potion d'etat
quand le user demande explicitement une potion, ou quand une recommandation
structuree indique qu'une potion est la meilleure reponse.

Il ne choisit pas une intervention produit a la place du `recommendation_tool`
quand ca vient d'un skill conversationnel. Il selectionne une potion adaptee,
demande confirmation Oui/Non, puis l'executor active ou cree la session
seulement si Oui.

Invariant produit :

```text
Potion activee = message immediat rassurant + recurring reminder 7 jours.
```

Cet invariant vaut pour le chat et pour la plateforme.

Objectif :

```text
Aider le user a traverser un etat interne precis sans ajouter de pression.
```

### Famille

```text
operation
```

### Precision sur les slots

Les slots ci-dessous sont internes au skill operationnel.

Ils ne sont pas une sortie du dispatcher.

```text
dispatcher = detecte l'intention d'operation
operation skill = remplit les slots
readiness_gate = decide si assez d'infos
generator / selector = prepare le draft
```

Le dispatcher doit rester leger :

```json
{
  "operation_intent": {
    "detected": true,
    "operation_type": "select_state_potion",
    "user_intent": "select",
    "confidence": 0.82,
    "target_hint": "stress",
    "needs_intake": true
  }
}
```

### Deux chemins d'entree

#### Chemin A - demande directe du user

```text
user
-> dispatcher.operation_intent select_state_potion
-> operation_router
-> select_state_potion_operation_skill
-> intake leger si etat/type manquant
-> readiness_gate
-> potion_session_selector
-> pending_confirmation Oui/Non
-> executor si Oui
```

Exemples :

```text
"j'ai besoin d'une potion"
"lance une potion de guerison"
"je suis stresse, fais-moi une potion"
"je veux une potion pour arreter de decrocher"
```

#### Chemin B - recommendation_tool

```text
conversation_skill
-> recommendation_tool
-> recommend_operation select_state_potion avec payload suffisant
-> operation_router
-> readiness_gate
-> potion_session_selector
-> pending_confirmation Oui/Non
-> executor si Oui
```

Regle :

```text
recommendation_tool path = pas d'intake conversationnel
direct_user_request path = intake possible
```

Si payload recommendation incomplet :

```text
invalid_recommendation_payload
-> pas de question user dans ce flow
```

### Potion types

```ts
type StatePotionType =
  | "rappel"      // anti-decrochage
  | "courage"    // peur / evitement
  | "guerison"   // honte / culpabilite / craquage
  | "clarte"     // flou / surcharge
  | "amour"      // durete envers soi
  | "apaisement"; // stress / pression
```

### Entry conditions

Entrer si :

```text
operation_type = select_state_potion
confidence >= 0.75
pas de safety_crisis
pas de pending_operation_confirmation
```

Ne pas entrer si :

```text
user demande "c'est quoi une potion ?" -> product_help
safety/crise aigue -> safety_crisis
payload recommendation incomplet -> invalid_recommendation_payload
```

### Slots

```ts
type SelectStatePotionSlots = {
  state: {
    required: true;
    status: "identified" | "ambiguous" | "missing";
    kind:
      | "decrochage"
      | "fear_avoidance"
      | "shame_guilt"
      | "confusion_overload"
      | "self_harshness"
      | "stress_pressure"
      | "unknown";
    intensity: "low" | "medium" | "high";
    evidence: string[];
    confidence: number;
  };

  potion_type: {
    required: true;
    value: StatePotionType | "unknown";
    confidence: number;
    source: "user_message" | "state_inference" | "recommendation";
  };

  context: {
    required: false;
    target_hint?: string | null;
    related_plan_item_id?: string | null;
    topic_hint?: string | null;
  };

  constraints: {
    required: true;
    values: string[];
  };
};
```

### Mapping etat -> potion

```text
decrochage -> rappel
fear_avoidance -> courage
shame_guilt -> guerison
confusion_overload -> clarte
self_harshness -> amour
stress_pressure -> apaisement
```

### Context loader

#### Direct request

```text
message courant
derniers messages utiles
state_hint dispatcher
potion_type explicite si mentionne
topic actif si utile
target_hint si lie a une action
facts de preference coach si disponibles
```

Pas de plan complet par defaut.

#### Recommendation path

Injecter seulement :

```text
operation_input recommendation
skill_output summary
etat identifie
potion_type recommande
contraintes
evidence courte
```

Pas d'intake.

### Questions autorisees

Seulement pour `direct_user_request`.

Maximum :

```text
1 question de collecte
```

Priorite :

```text
1. etat manquant
2. potion_type ambigu
```

Exemples :

```text
"Tu veux une potion plutot pour te calmer, retrouver de la clarte, ou sortir d'une boucle de culpabilite ?"

"La, c'est plutot stress, honte, peur, flou, ou decrochage ?"
```

Si le user donne deja un etat clair :

```text
"je suis stresse, lance une potion"
-> potion_type = apaisement
-> pas de question
```

### Readiness gate

Minimum viable payload :

```text
state.status = identified
potion_type != unknown
constraints incluent no_pressure + no_safety_substitution
```

Regles :

```text
safety -> blocked_by_safety
direct request + state missing + question non posee -> ask_question
direct request + state missing apres 1 question -> fallback_product_help ou exit
recommendation path + missing state/potion_type -> invalid_recommendation_payload
```

### Selector / Generator

```ts
type PotionSessionDraftV1 = {
  operation_type: "select_state_potion";
  draft: {
    potion_type: StatePotionType;
    title: string;
    opening_prompt: string;
    instant_support_message: string;
    expected_duration: "short";
    why_this_potion: string;
    follow_up: {
      reminder_instruction: string;
      local_time_hhmm: string;
      duration_days: 7;
      reason_for_time: string;
    };
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};
```

Exemple :

```json
{
  "operation_type": "select_state_potion",
  "draft": {
    "potion_type": "apaisement",
    "title": "Potion d'apaisement",
    "opening_prompt": "On va d'abord faire redescendre la pression avant de decider quoi faire.",
    "instant_support_message": "Tu n'as pas besoin de regler toute la situation maintenant. La, l'objectif c'est juste de faire baisser la pression d'un cran.",
    "expected_duration": "short",
    "why_this_potion": "Le user decrit surtout du stress et une montee en pression.",
    "follow_up": {
      "reminder_instruction": "Petit point d'apaisement : prends 30 secondes pour verifier ce qui est tendu, puis relache juste un cran.",
      "local_time_hhmm": "18:30",
      "duration_days": 7,
      "reason_for_time": "Le user parle d'une montee en pression en fin de journee."
    }
  },
  "confirmation_message": "Je te propose une potion d'apaisement courte pour faire redescendre la pression. Tu veux la lancer ?",
  "confirmation_actions": ["yes", "no"]
}
```

### Pending confirmation

```text
selector
-> confirmation_message
-> [Oui] [Non]
-> __pending_operation_confirmation
```

Apres Oui :

```text
C'est fait. J'ai lance une potion d'apaisement.

[message immediat rassurant genere par la potion]

Je t'ai aussi programme un rappel quotidien pendant 7 jours.
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Output operationnel

```ts
type SelectStatePotionOperationOutput = {
  operation_type: "select_state_potion";

  status:
    | "continue_intake"
    | "ask_question"
    | "ready_to_generate"
    | "draft_generated"
    | "pending_confirmation"
    | "executed"
    | "cancelled"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";

  source: "direct_user_request" | "recommendation_tool";

  phase:
    | "state_resolution"
    | "potion_selection"
    | "readiness_check"
    | "generation"
    | "confirmation"
    | "execution"
    | "exit";

  slots: SelectStatePotionSlots;
  readiness: Record<string, unknown>;
  draft?: PotionSessionDraftV1;

  state_patch: {
    summary: string;
    phase: string;
    slots: Partial<SelectStatePotionSlots>;
    missing_slots: string[];
    last_question_asked?: string | null;
    turn_count_increment: 1;
  };

  exit_reason?: string;
};
```

### Tests MVP

```text
"lance une potion de guerison"
-> direct_user_request
-> potion_type guerison
-> selector
-> pending confirmation

"je suis stresse, fais-moi une potion"
-> state stress_pressure
-> potion_type apaisement
-> pending confirmation

"j'ai besoin d'une potion"
-> state missing
-> ask one question

recommendation_tool returns potion with full payload
-> skip intake
-> selector
-> pending confirmation

recommendation payload missing state
-> invalid_recommendation_payload
-> no user question

"je veux me faire du mal"
-> safety_crisis
-> no potion

pending confirmation + Oui
-> executor
-> message immediat rassurant
-> recurring reminder 7 jours cree automatiquement
-> ack avec "Tu peux modifier dans ton espace sur sophia-coach.ai."

pending confirmation + Non
-> cancel
-> no DB write
```

## Operation Skill: adjust_plan_item_operation_skill

### Role

`adjust_plan_item_operation_skill` prepare une modification du plan quand le user
demande explicitement d'ajuster une action, une partie du plan, une phase, ou
quand une recommandation structuree propose un ajustement.

Il ne modifie rien directement. Il prepare un patch, demande Oui/Non, puis
l'executor applique seulement si Oui.

Objectif :

```text
Adapter le plan sans casser la trajectoire ni modifier trop vite.
```

### Famille

```text
operation
```

### Deux chemins d'entree

#### Chemin A - demande directe du user

```text
user
-> dispatcher.operation_intent adjust_plan_item
-> operation_router
-> adjust_plan_item_operation_skill
-> intake si infos manquantes
-> readiness_gate
-> generator
-> pending_confirmation Oui/Non
-> executor si Oui
```

Exemples :

```text
"ajuste ma marche du soir"
"c'est trop dur, reduis cette action"
"il faut changer mon plan"
"mon niveau actuel est trop charge"
```

#### Chemin B - recommendation_tool

```text
conversation_skill
-> recommendation_tool
-> recommend_operation adjust_plan_item avec payload suffisant
-> operation_router
-> readiness_gate
-> generator
-> pending_confirmation Oui/Non
-> executor si Oui
```

Regle :

```text
recommendation_tool path = pas d'intake conversationnel
direct_user_request path = intake possible
```

Si payload recommendation incomplet :

```text
invalid_recommendation_payload
-> pas de question user dans ce flow
```

### Entry conditions

Entrer si :

```text
operation_type = adjust_plan_item
confidence >= 0.75
pas de safety_crisis
pas de pending_operation_confirmation
```

Ne pas entrer si :

```text
user demande juste "comment ajuster mon plan ?" -> product_help
user veut changer le jour precis d'une action -> fallback_dashboard
honte forte / crise emotionnelle -> emotional_repair avant modification
payload recommendation incomplet -> invalid_recommendation_payload
```

### Scope resolver

C'est le coeur du skill. Il doit identifier le perimetre de modification.

```ts
type PlanAdjustmentScopeResolution = {
  scope: {
    status: "identified" | "ambiguous" | "missing";
    kind:
      | "specific_plan_item"
      | "current_phase"
      | "future_phase"
      | "whole_plan"
      | "schedule_change"
      | "unknown";
    plan_item_id?: string | null;
    phase_id?: string | null;
    title?: string | null;
    confidence: number;
    source:
      | "user_message"
      | "dispatcher_hint"
      | "plan_snapshot"
      | "memory"
      | "recommendation";
  };

  adjustment_fit: {
    can_adjust_from_chat: boolean;
    reason: string;
  };
};
```

Regle importante :

```text
schedule_change -> fallback_dashboard
```

Donc :

```text
"mets ma marche mardi" -> dashboard
"change le jour de cette action" -> dashboard
"deplace ca a vendredi" -> dashboard
```

### Slots

```ts
type AdjustPlanItemSlots = {
  scope: {
    required: true;
    status: "identified" | "ambiguous" | "missing";
    kind:
      | "specific_plan_item"
      | "current_phase"
      | "future_phase"
      | "whole_plan"
      | "schedule_change"
      | "unknown";
    plan_item_id?: string | null;
    phase_id?: string | null;
    title?: string | null;
    confidence: number;
  };

  adjustment_type: {
    required: true;
    value:
      | "reduce"
      | "clarify"
      | "simplify"
      | "split"
      | "pause"
      | "replace"
      | "rebalance"
      | "unknown";
    confidence: number;
  };

  reason: {
    required: true;
    type:
      | "too_hard"
      | "too_vague"
      | "too_heavy"
      | "bad_fit"
      | "repeated_failure"
      | "fatigue"
      | "context_changed"
      | "unknown";
    evidence: string[];
    confidence: number;
  };

  constraints: {
    required: true;
    values: string[];
  };
};
```

### Context loader

#### Direct request - scope_resolution

```text
resume global du plan actif
phase actuelle
actions actives
futures phases en grandes lignes
target_hint dispatcher
feedbacks recents
```

#### Apres scope identifie

```text
specific_plan_item -> uniquement cet item + contexte lie
current_phase -> resume phase actuelle + items concernes
future_phase -> future phase en grandes lignes
whole_plan -> trajectoire + feedbacks globaux
schedule_change -> fallback dashboard
```

#### Generation

```text
scope identifie
raison de l'ajustement
contraintes
items concernes seulement
2-3 evidence items maximum
pas de plan complet si item cible
```

#### Recommendation path

Injecter seulement :

```text
operation_input recommendation
scope deja identifie
adjustment_type deja propose
reason/evidence
contraintes
```

Pas d'intake.

### Questions autorisees

Seulement pour `direct_user_request`.

Maximum :

```text
1 question de collecte
```

Priorite :

```text
1. scope manquant
2. type d'ajustement manquant
```

Exemples :

```text
"Tu veux ajuster une action precise ou le niveau actuel du plan ?"

"Quand tu dis trop dur, tu veux plutot reduire, clarifier, ou remplacer l'action ?"
```

### Readiness gate

Minimum viable payload :

```text
scope.status = identified
scope.kind != schedule_change
adjustment_type != unknown OU fallback safe adjustment possible
reason.type != unknown
constraints incluent requires_confirmation
```

Regles :

```text
safety -> blocked_by_safety
schedule_change -> fallback_dashboard
direct request + scope missing + question non posee -> ask_question
direct request + scope missing apres 1 question -> fallback_dashboard
recommendation path + missing required slot -> invalid_recommendation_payload
```

### Generator

```ts
type PlanAdjustmentDraftV1 = {
  operation_type: "adjust_plan_item";
  draft: {
    title: string;
    scope_label: string;
    adjustment_type:
      | "reduce"
      | "clarify"
      | "simplify"
      | "split"
      | "pause"
      | "replace"
      | "rebalance";
    proposed_change: string;
    why_it_helps: string;
    patch: Record<string, unknown>;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};
```

Contraintes par defaut :

```text
no_pressure
do_not_overwrite_plan
minimal_patch
preserve_plan_intent
ask_confirmation_before_write
no_schedule_day_change
```

### Pending confirmation

```text
generator
-> confirmation_message
-> [Oui] [Non]
-> __pending_operation_confirmation
```

Apres Oui :

```text
C'est fait. J'ai ajuste ton plan avec cette modification : ...
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Output operationnel

```ts
type AdjustPlanItemOperationOutput = {
  operation_type: "adjust_plan_item";

  status:
    | "continue_intake"
    | "ask_question"
    | "ready_to_generate"
    | "draft_generated"
    | "pending_confirmation"
    | "executed"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";

  source: "direct_user_request" | "recommendation_tool";

  phase:
    | "scope_resolution"
    | "slot_filling"
    | "readiness_check"
    | "generation"
    | "confirmation"
    | "execution"
    | "exit";

  slots: AdjustPlanItemSlots;
  readiness: Record<string, unknown>;
  draft?: PlanAdjustmentDraftV1;

  state_patch: {
    summary: string;
    phase: string;
    slots: Partial<AdjustPlanItemSlots>;
    missing_slots: string[];
    last_question_asked?: string | null;
    turn_count_increment: 1;
  };

  exit_reason?: string;
};
```

### Tests MVP

```text
"reduis ma marche du soir"
-> scope specific_plan_item
-> adjustment_type reduce
-> generator
-> pending confirmation

"mon plan est trop lourd"
-> scope ambiguous/current_phase
-> ask one question

"change ma marche a mardi"
-> schedule_change
-> fallback_dashboard

recommendation_tool returns full payload
-> skip intake
-> generator
-> pending confirmation

recommendation payload missing scope
-> invalid_recommendation_payload
-> no question asked

pending confirmation + Oui
-> executor
-> ack avec "Tu peux modifier dans ton espace sur sophia-coach.ai."

pending confirmation + Non
-> cancel
-> no DB write
```
