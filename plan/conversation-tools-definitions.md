# Sophia - Conversation tools definitions

## Statut du document

Ce document definit les outils conversationnels Sophia et leur relation avec :

- `plan/conversation-skills-tools-dispatcher-alignment-plan.md`
- `plan/conversation-skills-definitions.md`
- `plan/memory-v2-mvp-consolidated-architecture-plan.md`

Objectif :

```text
Clarifier quels outils peuvent agir directement,
quels outils passent par les operation skills,
et quelles operations sont interdites depuis le chat au MVP.
```

## Principes

### Trois familles d'outils

```text
1. Always-on tools
   Outils simples, directs, executes depuis le runtime conversationnel quand
   l'intention est explicite et le payload suffisant.

2. Recommendation tool
   Moteur de decision produit. Il ne vit pas dans le dispatcher et n'execute pas.

3. Operation tools
   Generators / builders / executors adosses aux operation skills.
   Ils passent par readiness_gate + confirmation Oui/Non avant tout write.
```

### Separation des responsabilites

```text
dispatcher
  detecte des intentions legeres et des signaux

always-on tool
  execute une action simple deja claire

conversation skill
  diagnostique / repare / structure une opportunite

recommendation_tool
  decide si une opportunite produit vaut une proposition

operation skill
  remplit les slots operationnels si besoin

generator / builder
  prepare un draft concret

executor
  applique uniquement apres confirmation Oui
```

### Invariants

- aucun write produit complexe sans confirmation Oui ;
- safety bloque tous les outils non-safety ;
- le dispatcher ne remplit pas les slots detailles des operation skills ;
- `recommendation_tool` ne doit pas executer ;
- un generator ne doit jamais ecrire en DB ;
- un executor ne doit recevoir qu'un draft confirme ;
- le planning fin des actions n'est pas modifiable depuis le chat au MVP.

## Outils always-on MVP

Outils directs conserves :

```text
create_one_shot_reminder
track_progress_plan_item
```

Retire / hors scope :

```text
track_progress_north_star
```

Raison :

```text
La North Star n'existe plus dans le modele produit actuel.
```

## Tool: create_one_shot_reminder

### Role

`create_one_shot_reminder` programme un rappel ponctuel quand le user demande
explicitement a Sophia de lui rappeler quelque chose a un moment unique.

Fichier actuel :

```text
supabase/functions/sophia-brain/lib/one_shot_reminder_tool.ts
```

Tool execute :

```text
create_one_shot_reminder
```

Table cible actuelle :

```text
scheduled_checkins
```

### Famille

```text
always-on tool
```

### Quand l'utiliser

Utiliser quand le user demande un rappel ponctuel clair :

```text
"rappelle-moi dans 30 minutes de faire une pause"
"rappelle-moi demain a 9h d'appeler Paul"
"mets-moi un rappel ce soir pour sortir les poubelles"
"fais-moi un rappel dans un quart d'heure"
```

### Quand ne pas l'utiliser

Ne pas utiliser pour les rappels recurrents :

```text
"rappelle-moi tous les matins"
"chaque lundi, rappelle-moi de regarder mon plan"
"tous les jours a 9h, envoie-moi un rappel"
```

Ces cas vont vers :

```text
create_recurring_reminder_operation_skill
```

Ne pas utiliser si :

```text
- safety_crisis actif ;
- pending confirmation active ;
- horaire impossible a resoudre ;
- demande produit explicative seulement ;
- user demande une habitude / un planning recurrent ;
- message ne contient pas une demande explicite de rappel.
```

### Detection

Le tool possede sa propre detection :

```ts
isLikelyOneShotReminderRequest(message)
```

Regles actuelles :

- ignore les demandes recurrents via `isRecurringReminderRequest` ;
- detecte les formulations de rappel explicites ;
- accepte les hints temporels resolvables : `dans 30 minutes`, `demain`,
  `ce soir`, `dans un quart d'heure`, etc. ;
- peut utiliser un fallback IA pour extraire une demande ponctuelle.

Le dispatcher peut detecter des signaux autour des outils, mais ce tool ne doit
pas devenir un operation skill.

### Input minimal

Le tool a besoin de :

```text
user_id
message courant
scope/channel
timezone / user time context
supabase client
```

Payload extrait :

```ts
type ParsedReminderRequest = {
  scheduledFor: string;
  reminderInstruction: string;
  eventContext: string;
};
```

### Output

Sortie actuelle :

```ts
type OneShotReminderToolOutcome =
  | {
      detected: false;
    }
  | {
      detected: true;
      status: "needs_clarify";
      reason: "missing_time" | "past_time" | "unsupported_time";
      user_message: string;
    }
  | {
      detected: true;
      status: "failed";
      reason: "insert_failed";
      user_message: string;
      error_message: string;
    }
  | {
      detected: true;
      status: "success";
      user_message: string;
      scheduled_for: string;
      scheduled_for_local_label: string;
      reminder_instruction: string;
      event_context: string;
      inserted_checkin_id: string;
    };
```

### Execution

Si le parsing est valide et le moment est futur :

```text
upsert scheduled_checkins
origin = initiative
message_mode = dynamic
message_payload.source = companion_one_shot_reminder_tool
message_payload.reminder_kind = one_shot
status = pending
```

Idempotence :

```text
onConflict = user_id,event_context,scheduled_for
source_message_id si disponible dans metadata / message_payload
```

Le tool ne contacte pas directement le user au moment du rappel.

Responsabilite runtime :

```text
create_one_shot_reminder
-> cree scheduled_checkins pending
-> scheduler / outreach worker
-> envoie le rappel quand scheduled_for arrive
-> marque processed / failed / retrying selon resultat
```

### Ack utilisateur

Si success :

```text
Confirmer clairement que le rappel est programme.
Mentionner l'objet du rappel et le moment local si utile.
Ne pas promettre autre chose que la programmation confirmee.
```

Si needs_clarify :

```text
Ne pas annoncer que le rappel est programme.
Demander une seule precision courte sur l'heure / le moment exact.
```

Si failed :

```text
Ne pas annoncer que le rappel est programme.
Dire simplement qu'il y a eu un souci technique pour le programmer maintenant.
```

### Trace tool

Resume actuel :

```ts
success -> executedTools: ["create_one_shot_reminder"], toolExecution: "success"
needs_clarify -> executedTools: ["create_one_shot_reminder"], toolExecution: "blocked"
failed -> executedTools: ["create_one_shot_reminder"], toolExecution: "failed"
none -> executedTools: [], toolExecution: "none"
```

### Relation avec operation skills

`create_one_shot_reminder` reste distinct de :

```text
create_recurring_reminder_operation_skill
```

Regle :

```text
one-shot clair -> tool direct
recurring reminder -> operation skill + confirmation Oui/Non
```

Integration runtime cible :

```text
safety gate
-> pending confirmation gate
-> always-on tools directs
-> operation_intent
-> skill_router
```

Donc :

```text
si pending confirmation active, le Oui/Non est traite avant le one-shot.
si safety_crisis actif, le one-shot est bloque.
si le message contient une recurrence, route recurring operation skill.
```

Cas skill actif :

```text
Un skill conversationnel non-safety peut rester proprietaire de la reponse,
mais le one-shot peut etre programme en parallele si la demande est claire.
```

### Limites

- ne gere pas les rappels recurrents ;
- ne doit pas modifier des actions du plan ;
- ne doit pas creer une habitude ;
- ne doit pas etre utilise comme fallback pour un planning produit complexe ;
- ne doit pas s'executer pendant safety.

### Tests MVP

```text
"rappelle-moi dans 30 minutes de faire une pause"
-> create_one_shot_reminder success

"rappelle-moi demain a 9h d'appeler Paul"
-> create_one_shot_reminder success

"rappelle-moi tous les matins de marcher"
-> pas one-shot
-> create_recurring_reminder_operation_skill

"rappelle-moi de faire une pause"
-> needs_clarify si horaire manquant

"rappelle-moi hier de faire une pause"
-> needs_clarify / blocked, pas de write futur invalide

safety_crisis actif + demande de rappel
-> safety prioritaire, pas d'execution tool

pending confirmation + "oui"
-> traiter la confirmation, pas one-shot

message retraite avec meme event_context + scheduled_for
-> idempotent, pas de doublon
```

## Tool: track_progress_plan_item

### Role

`track_progress_plan_item` logge le progres d'une action du plan quand le user
dit clairement qu'il l'a faite, ratee, ou partiellement faite.

Ce n'est pas un operation skill. Il ne cree rien, ne modifie pas le plan, ne
propose pas de changement. Il ajoute seulement une entree de suivi.

Objectif :

```text
Capturer un check-in d'execution simple sans lancer un flow lourd.
```

### Famille

```text
always-on tool
```

### Source actuelle

Signal dispatcher :

```text
track_progress_plan_item
```

Executor actuel :

```text
logPlanItemProgressV2
```

### Quand l'utiliser

Quand le user dit explicitement qu'une action du plan a ete :

```text
completed
missed
partial
```

Exemples :

```text
"j'ai fait ma marche"
"j'ai rate ma meditation hier"
"j'ai fait la moitie de ma seance"
"j'ai commence mais pas termine"
"j'ai valide mon action du jour"
```

### Quand ne pas l'utiliser

Ne pas utiliser si :

```text
- la cible est ambigue ;
- aucune action du plan n'est identifiee ;
- le user parle d'une action hors plan ;
- le user demande de modifier une action ;
- le user demande de deplacer / changer le jour ;
- le user demande une carte / potion / rappel ;
- safety_crisis actif ;
- le message est seulement une intention future : "je vais faire ma marche".
```

### Signal dispatcher attendu

Le dispatcher produit un signal leger :

```ts
type TrackProgressPlanItemSignal = {
  detected: boolean;
  target_item_id?: string | null;
  target_title?: string | null;
  status_hint?: "completed" | "missed" | "partial" | "unknown";
  operation_hint?: "add" | "set" | null;
  value_hint?: number | null;
  date_hint?: string | null; // YYYY-MM-DD si fiable
};
```

Regle critique :

```text
Le dispatcher doit recopier l'ID exact depuis le snapshot plan items.
Il ne doit jamais inventer un target_item_id.
```

Si plusieurs actions sont plausibles :

```text
detected = true
target_item_id = null
```

Donc :

```text
pas d'execution tool
```

### Conditions d'execution

Executer seulement si :

```text
detected = true
target_item_id existe
status_hint in completed | missed | partial
pas de checkup actif
pas deja logge pour ce message
pas de safety active
pas de pending confirmation active
```

Valeurs par defaut :

```text
completed -> value = 1
partial -> value = value_hint si fourni, sinon 1 ou statut partial
missed -> value = 0
operation_hint = add par defaut
```

### Date

```text
date_hint = YYYY-MM-DD seulement si inferable de facon fiable
sinon date du tour courant
```

Exemples :

```text
"j'ai rate hier"
-> date_hint = hier si resolu proprement

"j'ai fait ma marche"
-> date du jour
```

### Output

```ts
type TrackProgressPlanItemOutcome = {
  mode: "logged" | "needs_clarify";
  message: string;
  target: string;
  status: "completed" | "missed" | "partial";
};
```

### Ack utilisateur

Si log reussi :

```text
Confirmer brievement que c'est note.
Ne pas relancer le tool.
Continuer la conversation si le user avait un autre sujet.
```

Exemples :

```text
"Note pour ta marche."
"Ok, j'ai note que tu l'as partiellement faite."
"J'ai note que tu l'as ratee hier."
```

Si cible ambigue :

```text
Ne pas logger.
Demander une clarification courte seulement si utile.
```

Exemple :

```text
"Tu parles de quelle action du plan exactement ?"
```

### Integration runtime cible

Ordre d'execution dans le systeme cible :

```text
safety gate
-> pending confirmation gate
-> always-on tools directs
-> operation_intent
-> skill_router
```

`track_progress_plan_item` peut tourner en parallele d'un skill conversationnel
non-safety.

Exemple :

```text
"j'ai rate ma marche, je suis nul"
-> track_progress_plan_item log missed si target_item_id clair
-> emotional_repair garde la main sur la reponse
```

Cas ambigus :

```text
detected = true
target_item_id = null
-> no write
-> runtime addon needs_clarify
```

Idempotence attendue :

```text
source_message_id deja traite dans le runtime -> no write
source_message_id deja present en DB pour la meme cible -> no write
```

Multi-plan :

```text
si plusieurs plans / transformations sont candidats, le tool ne logge que si
plan_id + transformation_id + target_item_id sont resolus sans ambiguite.
sinon -> no write / clarification ou dashboard.
```

### Limites

`track_progress_plan_item` ne doit jamais :

```text
- modifier le plan ;
- changer une frequence ;
- changer un jour ;
- deplacer une action ;
- creer une carte ;
- creer un reminder ;
- interpreter une intention future comme une action faite ;
- logger une action hors plan.
```

### Relation avec les skills

Ce tool peut tourner en parallele du mode conversationnel si le message contient
un check-in clair.

Exemple :

```text
"j'ai rate ma marche, je suis nul"
```

Runtime :

```text
track_progress_plan_item -> log missed si cible claire
skill_router -> emotional_repair
```

Mais le tool ne remplace pas le skill emotionnel.

### Tests MVP

```text
"j'ai fait ma marche"
-> log completed si target_item_id clair

"j'ai rate ma meditation hier"
-> log missed avec date_hint hier

"j'ai fait la moitie de ma seance"
-> log partial

"j'ai fait mon action"
-> target ambigue
-> no write / clarification possible

"je vais faire ma marche ce soir"
-> no log

"change ma marche a mardi"
-> no log
-> fallback dashboard si planning

"j'ai rate ma marche, je suis nul"
-> log missed + emotional_repair possible
```

## Recommendation tool

### Role

`recommendation_tool` choisit s'il faut proposer une fonctionnalite Sophia a
partir d'un diagnostic structure.

Il ne repond pas au user directement. Il ne genere pas de draft. Il n'execute
rien.

Objectif :

```text
Decider si une opportunite produit merite d'etre proposee maintenant, et sous quelle forme.
```

### Famille

```text
recommendation tool
```

### Quand l'appeler

Appeler quand un skill conversationnel produit une opportunite structuree :

```text
execution_breakdown -> blocage d'action clair
emotional_repair -> besoin de regulation d'etat
demotivation_repair -> perte d'elan / plan trop lourd
product_help -> non, sauf cas explicite de start_flow
```

Ou quand un signal produit fort existe deja, mais hors safety.

### Ne pas appeler si

```text
safety_crisis actif
user demande juste une explication produit -> product_help
operation_intent explicite deja detectee -> operation_router
diagnostic trop flou
moment emotionnel trop intense pour pousser une operation
```

### Input

```ts
type RecommendationToolInput = {
  user_id: string;
  channel: "web" | "whatsapp";
  locale: "fr";

  source: {
    kind: "conversation_skill" | "product_signal";
    skill_id?:
      | "execution_breakdown"
      | "emotional_repair"
      | "demotivation_repair"
      | null;
    skill_run_id?: string | null;
    trigger_message_id: string;
  };

  skill_output?: {
    skill_id: string;
    status: string;
    response_intent: string;
    diagnosis?: Record<string, unknown>;
    recommendation_need?: {
      needed: boolean;
      type:
        | "execution_repair"
        | "state_regulation"
        | "motivation_repair"
        | "plan_adjustment"
        | "none";
      urgency: "none" | "low" | "medium" | "high";
      constraints: string[];
      input_summary?: Record<string, unknown>;
    };
  };

  context: {
    active_skill_summary?: string | null;
    target?: {
      kind?: "plan_item" | "personal_action" | "free_subject" | "unknown";
      plan_item_id?: string | null;
      title?: string | null;
    };
    emotional_state?: {
      kind?: string | null;
      intensity?: "low" | "medium" | "high" | "unknown";
    };
    blocker_type?: string | null;
    motivation_state?: string | null;
    evidence: string[];
  };

  product_state: {
    recent_recommendations: Array<{
      surface_or_operation: string;
      shown_at: string;
      user_response: "accepted" | "declined" | "ignored" | "unknown";
    }>;
    cooldowns: Record<string, boolean>;
    unavailable_operations: string[];
  };

  registry: {
    allowed_operations: Array<
      | "prepare_attack_card"
      | "prepare_defense_card"
      | "adjust_plan_item"
      | "select_state_potion"
      | "create_recurring_reminder"
      | "update_coach_preferences"
    >;
  };
};
```

### Output

```ts
type RecommendationToolOutput = {
  decision:
    | "recommend_operation"
    | "recommend_explanation"
    | "no_recommendation"
    | "defer"
    | "invalid_input";

  confidence: number;

  operation_type?:
    | "prepare_attack_card"
    | "prepare_defense_card"
    | "adjust_plan_item"
    | "select_state_potion"
    | "create_recurring_reminder"
    | "update_coach_preferences"
    | null;

  surface_id?: string | null;

  reason: string;

  timing: "now" | "later" | "watch";

  presentation: {
    level: 0 | 1 | 2 | 3 | 4 | 5;
    style: "none" | "soft" | "direct";
    user_facing_offer?: string | null;
  };

  requires_confirmation: boolean;

  operation_input?: Record<string, unknown> | null;

  alternatives: Array<{
    operation_type?: string | null;
    surface_id?: string | null;
    reason: string;
    confidence: number;
  }>;

  do_not_recommend: Array<{
    operation_type?: string | null;
    surface_id?: string | null;
    reason: string;
  }>;
};
```

### Decisions possibles

#### recommend_operation

Le tool recommande une operation produit concrete.

Exemple :

```json
{
  "decision": "recommend_operation",
  "operation_type": "select_state_potion",
  "confidence": 0.86,
  "reason": "L'etat dominant est la honte et la regulation doit preceder l'action.",
  "timing": "now",
  "presentation": {
    "level": 2,
    "style": "soft",
    "user_facing_offer": "On peut faire une potion courte pour faire redescendre cette honte avant de revenir a l'action."
  },
  "requires_confirmation": true,
  "operation_input": {
    "state": "shame_guilt",
    "potion_type": "guerison",
    "evidence": ["Le user s'auto-attaque apres avoir rate une action."]
  }
}
```

#### recommend_explanation

Pour une aide produit simple, sans creation.

```text
Rare. Normalement product_help gere ca.
```

#### no_recommendation

Quand le skill doit juste repondre humainement.

#### defer

Quand l'idee est bonne mais pas maintenant.

Exemples :

```text
user trop fragile emotionnellement
feature deja proposee recemment
diagnostic encore incomplet
```

#### invalid_input

Quand l'input est trop incomplet ou incoherent.

### Regles de choix MVP

```text
safety -> no_recommendation
honte forte -> potion avant attack_card
fatigue forte -> potion ou plan_adjustment leger, pas carte d'attaque par defaut
action claire + evitement/procrastination -> attack_card possible
risque recurrent / tentation / rechute -> defense_card possible
plan trop lourd -> adjust_plan_item possible
besoin de rappel recurrent clair -> create_recurring_reminder possible
preference coach explicite -> update_coach_preferences possible
```

### Relation avec operation skills

Si `decision = recommend_operation` :

```text
recommendation_tool
-> operation_router
-> operation_skill
```

Regle importante :

```text
Le payload recommendation doit etre suffisant.
```

Sinon :

```text
recommendation_tool ne doit pas recommander l'operation.
```

Donc :

```text
recommendation_tool path = pas d'intake conversationnel
```

L'operation skill garde quand meme un `readiness_gate`, mais seulement pour
valider.

### Ce que le tool ne fait pas

```text
- ne repond pas au user ;
- ne pose pas de question ;
- ne genere pas de draft ;
- n'execute pas ;
- ne modifie pas la memoire ;
- ne remplace pas product_help ;
- ne bypass pas safety ;
- ne choisit pas un planning precis ;
- ne recommande pas si le diagnostic est trop flou.
```

### Tests MVP

```text
emotional_repair + shame medium
-> recommend_operation select_state_potion

emotional_repair + shame high
-> defer ou state_regulation soft, pas attack_card

execution_breakdown + action claire + avoidance
-> recommend_operation prepare_attack_card

execution_breakdown + self_criticism high
-> do_not_recommend attack_card
-> recommend/select potion ou defer

execution_breakdown + recurring risk
-> prepare_defense_card

demotivation_repair + plan_too_heavy
-> adjust_plan_item

safety_crisis
-> no_recommendation

product_help simple question
-> no_recommendation
```

## Operation tools

### Role

Les `operation tools` sont les outils utilises par les operation skills pour
transformer une intention validee en action produit confirmee.

Ils ne sont pas always-on. Ils ne sont jamais appeles directement par le
dispatcher.

Flow commun :

```text
operation_skill
-> readiness_gate
-> generator / builder
-> pending_confirmation Oui/Non
-> executor si Oui
```

### Familles

```text
generator / builder
executor
```

### Liste MVP

```text
attack_card_generator
prepare_attack_card_executor

defense_card_generator
prepare_defense_card_executor

plan_adjustment_generator
adjust_plan_item_executor

potion_session_selector
activate_state_potion_executor

recurring_reminder_builder
create_recurring_reminder_executor

coach_preferences_patch_builder
update_coach_preferences_executor
```

### Regles communes generators/builders

Un generator/builder :

- recoit un payload minimal et structure ;
- produit un draft ;
- produit un `confirmation_message` ;
- ne pose pas de question ;
- ne choisit pas la feature produit ;
- ne lit pas directement toute la memoire ;
- n'ecrit jamais en DB ;
- respecte un `output_schema` versionne.

### Regles communes executors

Un executor :

- recoit uniquement un draft confirme ;
- valide les preconditions ;
- ecrit en DB ou appelle l'API produit ;
- log `executed_tools` / event ;
- clear pending confirmation ;
- produit un ack utilisateur ;
- peut declencher memorizer async si utile.

### Invariants

```text
generator sans readiness_gate -> interdit
executor sans pending_confirmation Oui -> interdit
executor pendant safety -> interdit
generator avec contexte brut complet -> interdit
```

### Output commun generator

```ts
type OperationDraftBase = {
  operation_type: string;
  output_schema: string;
  draft: Record<string, unknown>;
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};
```

### Input commun executor

```ts
type OperationExecutorInput = {
  operation_id: string;
  user_id: string;
  operation_type: string;
  confirmed_at: string;
  draft: Record<string, unknown>;
  source: {
    trigger_message_id: string;
    operation_source: "direct_user_request" | "recommendation_tool";
    previous_skill_id?: string | null;
  };
};
```

### Ack commun

Apres succes :

```text
C'est fait. [Resume de ce qui a ete cree/modifie].
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Tests communs

```text
generator called without ready payload -> refuse
executor called without confirmation -> refuse
executor during safety -> refuse
Non confirmation -> no write
Oui confirmation -> write + ack
```

## Operation Tool: attack_card_generator

### Role

`attack_card_generator` prepare un draft de carte d'attaque pour une action
concrete.

Il ne cree pas la carte. Il produit seulement un draft confirmable.

### Input

```ts
type AttackCardGeneratorInput = {
  operation_type: "prepare_attack_card";
  output_schema: "attack_card_draft_v1";

  target: {
    kind: "plan_item" | "personal_action";
    plan_item_id?: string | null;
    title: string;
    current_instruction?: string | null;
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
};
```

### Output

```ts
type AttackCardDraftV1 = {
  operation_type: "prepare_attack_card";
  output_schema: "attack_card_draft_v1";
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

### Contraintes

```text
short
no_pressure
must_be_doable_under_5_minutes
do_not_moralize
do_not_increase_difficulty
```

### Tests MVP

```text
valid payload -> attack_card_draft_v1
missing target -> refuse
target free_subject -> refuse
generator tries to write -> invalid
draft increases difficulty -> invalid
```

## Operation Tool: prepare_attack_card_executor

### Role

`prepare_attack_card_executor` cree la carte d'attaque confirmee en base.

Il ne recoit que le draft confirme.

### Input

```ts
type PrepareAttackCardExecutorInput = {
  operation_id: string;
  user_id: string;
  target: {
    kind: "plan_item" | "personal_action";
    plan_item_id?: string | null;
    title: string;
  };
  draft: AttackCardDraftV1["draft"];
  source: {
    trigger_message_id: string;
    operation_source: "direct_user_request" | "recommendation_tool";
    previous_skill_id?: string | null;
  };
};
```

### Regles

```text
requires confirmed pending operation
target.kind doit etre plan_item ou personal_action
draft.title et draft.instruction requis
pas de write si safety active
```

### Ack

```text
C'est fait. J'ai cree une carte d'attaque pour [target] : [instruction].
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Tests MVP

```text
valid confirmed draft -> DB write
missing confirmation -> refuse
missing target -> refuse
safety active -> refuse
Non -> no write
```

## Operation Tool: defense_card_generator

### Role

`defense_card_generator` prepare un draft de carte de defense pour un moment a
risque identifie.

Il ne decide pas si une carte de defense est pertinente. Il ne cree rien en
base. Il transforme un payload valide en draft confirmable.

Objectif :

```text
Produire une reponse defensive concrete pour un risque identifie.
```

### Input

```ts
type DefenseCardGeneratorInput = {
  operation_type: "prepare_defense_card";
  output_schema: "defense_card_draft_v1";

  attachment: {
    kind:
      | "plan_item"
      | "personal_action"
      | "free_risk_context"
      | "recurring_context";
    plan_item_id?: string | null;
    title: string;
  };

  risk_situation: {
    label: string;
    description?: string | null;
    timing_hint?: string | null;
    context_hint?: string | null;
  };

  trigger: {
    type:
      | "temptation"
      | "impulse"
      | "emotional_drop"
      | "social_context"
      | "fatigue"
      | "stress"
      | "habit_loop"
      | "avoidance";
    evidence: string[];
    confidence: number;
  };

  defense_goal:
    | "avoid_relapse"
    | "interrupt_impulse"
    | "protect_action"
    | "leave_context"
    | "reduce_damage";

  defense_response_hint?: {
    strategy_hint:
      | "delay"
      | "leave_context"
      | "replace_action"
      | "contact_support"
      | "environment_block"
      | "self_talk"
      | "unknown";
    value?: string | null;
  };

  constraints: string[];
  forbidden: string[];
};
```

### Output

```ts
type DefenseCardDraftV1 = {
  operation_type: "prepare_defense_card";
  output_schema: "defense_card_draft_v1";

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

### Contraintes

```text
short
no_pressure
do_not_moralize
do_not_shame
no_safety_substitution
must_be_actionable_in_the_moment
```

### Regles

Le generator doit :

- produire une reponse utilisable dans le moment de risque ;
- garder une formulation simple ;
- eviter les strategies abstraites ;
- inclure un `fallback_plan` si le premier geste echoue ;
- respecter `no_safety_substitution`.

Il ne doit pas :

- traiter un risque safety comme une carte de defense ;
- culpabiliser ;
- proposer une action irrealiste ;
- ecrire en DB ;
- demander une clarification.

### Tests MVP

```text
free_risk_context + envie de fumer -> draft defense card
plan_item + risque de sauter marche quand il pleut -> draft defense card
missing risk_situation -> refuse
safety risk -> refuse
draft moralizing -> invalid
```

## Operation Tool: prepare_defense_card_executor

### Role

`prepare_defense_card_executor` cree la carte de defense confirmee en base.

Il recoit uniquement le draft confirme.

### Input

```ts
type PrepareDefenseCardExecutorInput = {
  operation_id: string;
  user_id: string;

  attachment: {
    kind:
      | "plan_item"
      | "personal_action"
      | "free_risk_context"
      | "recurring_context";
    plan_item_id?: string | null;
    title: string;
  };

  draft: DefenseCardDraftV1["draft"];

  source: {
    trigger_message_id: string;
    operation_source: "direct_user_request" | "recommendation_tool";
    previous_skill_id?: string | null;
  };
};
```

### Regles

```text
requires confirmed pending operation
attachment.kind doit etre autorise
draft.risk_situation et draft.defense_response requis
pas de write si safety active
```

### Ack

```text
C'est fait. J'ai cree une carte de defense pour [risk_situation] : [defense_response].
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Tests MVP

```text
valid confirmed draft -> DB write
missing confirmation -> refuse
missing risk_situation -> refuse
safety active -> refuse
Non -> no write
```

## Operation Tool: plan_adjustment_generator

### Role

`plan_adjustment_generator` prepare un draft de modification du plan a partir
d'un scope et d'un besoin d'ajustement deja valides par
`adjust_plan_item_operation_skill`.

Il ne decide pas s'il faut modifier le plan. Il ne modifie rien. Il produit un
patch minimal confirmable.

Objectif :

```text
Preparer une modification petite, claire, reversible, qui preserve l'intention du plan.
```

### Input

```ts
type PlanAdjustmentGeneratorInput = {
  operation_type: "adjust_plan_item";
  output_schema: "plan_adjustment_draft_v1";

  scope: {
    kind:
      | "specific_plan_item"
      | "current_phase"
      | "future_phase"
      | "whole_plan";
    plan_item_id?: string | null;
    phase_id?: string | null;
    title?: string | null;
    current_summary: string;
  };

  adjustment_type:
    | "reduce"
    | "clarify"
    | "simplify"
    | "split"
    | "pause"
    | "replace"
    | "rebalance";

  reason: {
    type:
      | "too_hard"
      | "too_vague"
      | "too_heavy"
      | "bad_fit"
      | "repeated_failure"
      | "fatigue"
      | "context_changed";
    evidence: string[];
  };

  allowed_patch_fields: string[];
  forbidden_patch_fields: string[];

  constraints: string[];
};
```

### Output

```ts
type PlanAdjustmentDraftV1 = {
  operation_type: "adjust_plan_item";
  output_schema: "plan_adjustment_draft_v1";

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

### Contraintes

```text
no_pressure
minimal_patch
preserve_plan_intent
do_not_overwrite_plan
ask_confirmation_before_write
no_schedule_day_change
```

### Regles

Le generator doit :

- proposer le plus petit changement utile ;
- preserver l'intention initiale du plan ;
- ne modifier que les champs autorises ;
- rendre le changement comprehensible pour le user ;
- eviter de transformer tout le plan pour un signal faible.

Il ne doit pas :

- changer le jour d'une action ;
- deplacer une action a une date precise ;
- reconfigurer le planning fin ;
- reecrire tout le plan ;
- creer une nouvelle carte ;
- ecrire en DB ;
- demander une clarification.

### Cas `schedule_change`

Si le payload demande :

```text
changer le jour
deplacer a mardi
mettre demain
reprogrammer une action
```

Alors :

```text
generator refuse
-> fallback_dashboard
```

### Tests MVP

```text
specific_plan_item + reduce -> draft patch minimal
current_phase + too_heavy -> draft rebalance leger
schedule_change -> refuse
patch touches forbidden field -> invalid
generator writes DB -> invalid
```

## Operation Tool: adjust_plan_item_executor

### Role

`adjust_plan_item_executor` applique un patch de plan confirme.

Il recoit uniquement un draft confirme par Oui.

### Input

```ts
type AdjustPlanItemExecutorInput = {
  operation_id: string;
  user_id: string;

  scope: {
    kind:
      | "specific_plan_item"
      | "current_phase"
      | "future_phase"
      | "whole_plan";
    plan_item_id?: string | null;
    phase_id?: string | null;
  };

  patch: Record<string, unknown>;

  source: {
    trigger_message_id: string;
    operation_source: "direct_user_request" | "recommendation_tool";
    previous_skill_id?: string | null;
  };
};
```

### Regles

```text
requires confirmed pending operation
patch doit respecter allowed_patch_fields
patch ne doit contenir aucun planning day/date change
pas de write si safety active
```

### Ack

```text
C'est fait. J'ai ajuste ton plan : [resume du changement].
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Tests MVP

```text
valid confirmed patch -> DB write
missing confirmation -> refuse
patch contains schedule/day field -> refuse
patch too broad -> refuse
safety active -> refuse
Non -> no write
```

## Operation Tool: potion_session_selector

### Role

`potion_session_selector` prepare une session de potion adaptee a l'etat du user,
a partir d'un payload deja valide par `select_state_potion_operation_skill`.

Il ne decide pas si une potion est la meilleure intervention. Il ne remplace pas
`recommendation_tool`. Il selectionne le bon type de potion et prepare un
lancement confirmable.

Invariant :

```text
Potion activee = message immediat rassurant + recurring reminder 7 jours.
```

Le selector doit donc preparer les deux elements :

```text
1. le message immediat que le user recoit apres activation ;
2. le rappel recurrent quotidien pendant 7 jours.
```

Objectif :

```text
Preparer une regulation d'etat courte, adaptee et non intrusive.
```

### Input

```ts
type PotionSessionSelectorInput = {
  operation_type: "select_state_potion";
  output_schema: "potion_session_draft_v1";

  state: {
    kind:
      | "decrochage"
      | "fear_avoidance"
      | "shame_guilt"
      | "confusion_overload"
      | "self_harshness"
      | "stress_pressure";
    intensity: "low" | "medium" | "high";
    evidence: string[];
  };

  potion_type:
    | "rappel"
    | "courage"
    | "guerison"
    | "clarte"
    | "amour"
    | "apaisement";

  context?: {
    target_hint?: string | null;
    related_plan_item_id?: string | null;
    topic_hint?: string | null;
  };

  constraints: string[];
  forbidden: string[];
};
```

### Output

```ts
type PotionSessionDraftV1 = {
  operation_type: "select_state_potion";
  output_schema: "potion_session_draft_v1";

  draft: {
    potion_type:
      | "rappel"
      | "courage"
      | "guerison"
      | "clarte"
      | "amour"
      | "apaisement";
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

### Contraintes

```text
no_pressure
no_safety_substitution
short
do_not_moralize
do_not_push_action_immediately
```

### Regles

Le selector doit :

- respecter le `potion_type` valide ;
- preparer un lancement court ;
- produire un message immediat rassurant / utile maintenant ;
- produire une instruction de recurring reminder pour 7 jours ;
- choisir le meilleur horaire d'envoi a partir du contexte disponible ;
- eviter de transformer la potion en solution d'execution ;
- ne pas pousser d'action concrete immediatement ;
- rester compatible avec l'etat emotionnel.

Il ne doit pas :

- choisir une potion si l'etat est `unknown` ;
- traiter un risque safety comme une potion ;
- ecrire en DB ;
- demander une clarification ;
- recommander une carte ou un ajustement plan.

### Tests MVP

```text
stress_pressure + apaisement -> potion_session_draft_v1
shame_guilt + guerison -> potion_session_draft_v1
valid draft -> contient instant_support_message + follow_up.duration_days = 7
unknown state -> refuse
safety risk -> refuse
selector writes DB -> invalid
```

## Operation Tool: activate_state_potion_executor

### Role

`activate_state_potion_executor` active ou cree la session de potion confirmee,
envoie le message immediat et cree la serie de suivi recurrente.

Il recoit uniquement un draft confirme.

Invariant :

```text
Apres confirmation Oui, l'executor doit faire les 3 choses :
1. creer/activer la potion session ;
2. retourner le message immediat rassurant ;
3. creer un recurring reminder quotidien de 7 jours.
```

### Input

```ts
type ActivateStatePotionExecutorInput = {
  operation_id: string;
  user_id: string;

  draft: PotionSessionDraftV1["draft"];

  context?: {
    related_plan_item_id?: string | null;
    topic_hint?: string | null;
  };

  source: {
    trigger_message_id: string;
    operation_source: "direct_user_request" | "recommendation_tool";
    previous_skill_id?: string | null;
  };
};
```

### Regles

```text
requires confirmed pending operation
draft.potion_type requis
draft.instant_support_message requis
draft.follow_up.reminder_instruction requis
draft.follow_up.duration_days = 7
pas de write si safety active
ne pas creer de carte / plan patch
```

Writes attendus :

```text
user_potion_sessions
user_recurring_reminders
scheduled_checkins x 7
```

Le recurring reminder cree par une potion doit etre tagge comme suivi potion :

```text
initiative_kind = potion_follow_up
source_kind = potion_generated
source_potion_session_id = potion_session.id
```

### Ack

```text
C'est fait. J'ai lance une potion [type].

[draft.instant_support_message]

Je t'ai aussi programme un rappel quotidien pendant 7 jours.
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Tests MVP

```text
valid confirmed draft -> create/activate potion session
valid confirmed draft -> create recurring reminder 7 days
valid confirmed draft -> schedule 7 checkins
missing confirmation -> refuse
missing potion_type -> refuse
missing instant_support_message -> refuse
missing follow_up reminder -> refuse
safety active -> refuse
Non -> no write
```

## Operation Tool: recurring_reminder_builder

### Role

`recurring_reminder_builder` prepare un draft de rappel recurrent a partir d'un
payload valide par `create_recurring_reminder_operation_skill`.

Il ne traite pas les rappels ponctuels. Il ne cree rien directement.

Objectif :

```text
Preparer un rappel recurrent clair, non intrusif, avec frequence et contenu precis.
```

### Input

```ts
type RecurringReminderBuilderInput = {
  operation_type: "create_recurring_reminder";
  output_schema: "recurring_reminder_draft_v1";

  recurrence: {
    frequency:
      | "daily"
      | "weekly"
      | "specific_days"
      | "weekdays"
      | "custom";
    days?: string[];
    time: string;
    timezone: string;
  };

  reminder_content: {
    message: string;
    subject_hint?: string | null;
  };

  destination: {
    value: "current_plan" | "base_de_vie";
    related_plan_item_id?: string | null;
  };

  constraints: string[];
  forbidden: string[];
};
```

### Output

```ts
type RecurringReminderDraftV1 = {
  operation_type: "create_recurring_reminder";
  output_schema: "recurring_reminder_draft_v1";

  draft: {
    title: string;
    message: string;
    frequency: "daily" | "weekly" | "specific_days" | "weekdays" | "custom";
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

### Contraintes

```text
no_spam
clear_frequency
clear_time
requires_confirmation
do_not_create_one_shot
do_not_modify_plan_schedule
```

### Regles

Le builder doit :

- preserver la frequence demandee ;
- produire un message de rappel court ;
- eviter les doublons si un rappel proche existe deja ;
- respecter la timezone ;
- distinguer destination `current_plan` / `base_de_vie`.

Il ne doit pas :

- traiter un one-shot reminder ;
- deplacer une action du plan ;
- modifier le planning d'une action ;
- ecrire en DB ;
- demander une clarification.

### Tests MVP

```text
daily + time + message -> recurring_reminder_draft_v1
specific_days + time + message -> draft
missing time -> refuse
one-shot payload -> refuse
builder writes DB -> invalid
```

## Operation Tool: create_recurring_reminder_executor

### Role

`create_recurring_reminder_executor` cree le rappel recurrent confirme.

Il recoit uniquement un draft confirme.

### Input

```ts
type CreateRecurringReminderExecutorInput = {
  operation_id: string;
  user_id: string;

  draft: RecurringReminderDraftV1["draft"];

  source: {
    trigger_message_id: string;
    operation_source: "direct_user_request" | "recommendation_tool";
    previous_skill_id?: string | null;
  };
};
```

### Regles

```text
requires confirmed pending operation
draft.frequency, draft.time, draft.message requis
pas de write si safety active
ne pas creer si one-shot
ne pas modifier action schedule
```

### Ack

```text
C'est fait. J'ai cree ce rappel recurrent : [message], [frequence], [heure].
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Tests MVP

```text
valid confirmed recurring reminder -> DB write
missing confirmation -> refuse
missing time -> refuse
one-shot draft -> refuse
safety active -> refuse
Non -> no write
```

## Operation Tool: coach_preferences_patch_builder

### Role

`coach_preferences_patch_builder` prepare un patch de preferences coach a partir
d'une demande validee par `update_coach_preferences_operation_skill`.

Il ne decide pas seul d'une preference. Il ne modifie rien. Il transforme une
intention claire en patch confirmable.

Objectif :

```text
Preparer une modification explicite du style d'accompagnement de Sophia.
```

### Input

```ts
type CoachPreferencesPatchBuilderInput = {
  operation_type: "update_coach_preferences";
  output_schema: "coach_preferences_patch_draft_v1";

  current_preferences: Partial<Record<
    "coach.tone" | "coach.challenge_level" | "coach.question_tendency",
    string
  >>;

  requested_patch: Partial<Record<
    "coach.tone" | "coach.challenge_level" | "coach.question_tendency",
    string
  >>;

  reason?: {
    evidence: string[];
  };

  constraints: string[];
  forbidden: string[];
};
```

### Output

```ts
type CoachPreferencesPatchDraftV1 = {
  operation_type: "update_coach_preferences";
  output_schema: "coach_preferences_patch_draft_v1";

  draft: {
    patch: Partial<Record<
      "coach.tone" | "coach.challenge_level" | "coach.question_tendency",
      string
    >>;
    summary: string;
    reason?: string | null;
  };

  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};
```

### Contraintes

```text
requires_confirmation
explicit_user_preference_only
do_not_infer_from_one_emotional_message
do_not_change_multiple_preferences_unless_explicit
```

### Regles

Le builder doit :

- produire un patch minimal ;
- ne changer que les preferences explicitement demandees ;
- formuler clairement ce qui va changer ;
- comparer avec les preferences actuelles si utile ;
- eviter de surinterpreter un feedback emotionnel.

Il ne doit pas :

- modifier plusieurs preferences si le user n'en demande qu'une ;
- transformer une plainte emotionnelle en preference durable ;
- ecrire en DB ;
- demander une clarification ;
- modifier des preferences hors scope MVP.

### Tests MVP

```text
coach.question_tendency -> peu_de_questions -> draft patch
coach.tone -> doux -> draft patch
multiple inferred preferences from vague message -> refuse
unsupported preference key -> refuse
builder writes DB -> invalid
```

## Operation Tool: update_coach_preferences_executor

### Role

`update_coach_preferences_executor` applique un patch de preferences coach
confirme.

Il recoit uniquement un draft confirme.

### Input

```ts
type UpdateCoachPreferencesExecutorInput = {
  operation_id: string;
  user_id: string;

  draft: CoachPreferencesPatchDraftV1["draft"];

  source: {
    trigger_message_id: string;
    operation_source: "direct_user_request" | "recommendation_tool";
    previous_skill_id?: string | null;
  };
};
```

### Regles

```text
requires confirmed pending operation
draft.patch contient uniquement des cles MVP autorisees
pas de write si safety active
ne pas modifier preferences hors scope
```

### Ack

```text
C'est fait. J'ai mis a jour ta preference : [summary].
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Tests MVP

```text
valid confirmed patch -> DB write
missing confirmation -> refuse
unsupported key -> refuse
empty patch -> refuse
safety active -> refuse
Non -> no write
```

## Interdits chat MVP

Les operations suivantes ne doivent pas etre executees depuis le chat au MVP :

```text
- changer le jour d'une action ;
- deplacer une action a une date precise ;
- reconfigurer le planning fin d'une action ;
- modifier le plan sans confirmation Oui ;
- creer / modifier une operation produit pendant safety ;
- traiter un rappel recurrent comme un one-shot reminder ;
- traiter une demande one-shot comme un rappel recurrent.
```

Fallback :

```text
rediriger vers l'espace Sophia / dashboard quand le planning fin est demande.
```
