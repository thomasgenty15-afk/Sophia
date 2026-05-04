# Sophia - Conversation skills, tools et dispatcher

## Statut du document

Ce document cadre l'implementation des **conversation skills**, du futur
**recommendation tool**, du mode **product guidance**, et leur alignement avec le
dispatcher et Memory V2.

Il complete :

- `plan/memory-v2-mvp-consolidated-architecture-plan.md`
- `plan/memory-v2-implementation-roadmap.md`

Il ne remplace pas Memory V2. Les skills doivent se brancher sur le runtime
Memory V2, pas creer une deuxieme memoire.

## Probleme a resoudre

Aujourd'hui, le dispatcher porte deja beaucoup de responsabilites :

- detection des signaux conversationnels ;
- routing vers les modes existants ;
- `memory_plan` ;
- `surface_plan` ;
- detection d'intentions dashboard ;
- signaux d'action ;
- signaux safety ;
- opportunites produit.

Si on ajoute les skills directement dans le dispatcher, il devient trop gros :

```text
dispatcher = routeur + coach + psy de crise + product advisor + memorizer implicite
```

Ce document pose une separation stricte :

```text
Dispatcher / runtime
  detecte, route, charge le contexte

Conversation skill
  prend temporairement la posture de reponse

Recommendation tool
  choisit la meilleure fonctionnalite / surface produit

Product guidance
  aide le user a comprendre ou utiliser le produit

Tool executor
  execute une action concrete autorisee

Memorizer async
  persiste les souvenirs durables et les skill runs utiles
```

## Etat existant dans le repo

### 1. Tool executable : one-shot reminder

Fichier :

```text
supabase/functions/sophia-brain/lib/one_shot_reminder_tool.ts
```

Role actuel :

- detecter une demande ponctuelle de rappel ;
- parser la date ;
- creer le rappel ;
- remonter `executed_tools: ["create_one_shot_reminder"]`.

Statut :

```text
Garder comme vrai tool executable.
```

Il ne doit pas etre confondu avec une recommandation. Il agit quand le user
demande explicitement une action.

### 2. Surface registry

Fichier :

```text
supabase/functions/sophia-brain/surface_registry.ts
```

Surfaces actuelles :

```text
dashboard.personal_actions
dashboard.north_star
dashboard.reminders
dashboard.preferences
architect.coaching
architect.wishlist
architect.stories
architect.reflections
architect.quotes
```

Role actuel :

- decrire les surfaces produit ;
- fournir leurs objectifs, cas pertinents, anti-noise, aliases et keywords ;
- alimenter le prompt dispatcher via `SURFACE_REGISTRY_PROMPT_BLOCK`.

Statut :

```text
Garder.
Faire evoluer en Product Surface Registry v2.
```

Ce registry doit devenir la source de verite des surfaces produit pour le
recommendation tool et product guidance.

### 3. Surface plan

Fichier :

```text
supabase/functions/sophia-brain/router/dispatcher.ts
```

Role actuel :

- le dispatcher produit `surface_plan` ;
- il detecte une opportunite produit potentielle ;
- il propose des candidates avec niveau, raison, CTA, besoin de contenu.

Statut cible :

```text
Ne pas supprimer tout de suite.
Le passer progressivement de "dispatcher-owned recommendation" a
"recommendation input / legacy surface signal".
```

Probleme :

Le dispatcher n'est pas le bon endroit pour choisir finement la meilleure
fonctionnalite produit. Il manque :

- le diagnostic structure d'un skill ;
- l'historique produit recent ;
- les contraintes d'etat emotionnel ;
- les alternatives ;
- les raisons de non-recommandation.

### 4. Surface state

Fichier :

```text
supabase/functions/sophia-brain/surface_state.ts
```

Role actuel :

- lire/ecrire `__surface_state` dans `temp_memory` ;
- gerer fatigue, cooldown, acceptation, ignore ;
- choisir si un addon surface doit etre montre ;
- eviter les pushes repetitifs.

Statut cible :

```text
Legacy / transition.
Ne pas en faire la couche cible long terme.
```

Decision produit :

```text
Les fonctionnalites doivent arriver par deux chemins seulement :

1. product_help
   Quand le user demande explicitement une explication ou une aide produit.

2. recommendation_tool
   Quand une opportunite est structuree par un skill ou par un signal fort.
```

Donc `surface_state` ne doit pas rester une troisieme logique autonome. Ses
responsabilites utiles doivent etre migrees vers :

- `product_help` pour l'explication / navigation ;
- `recommendation_tool` pour le choix de la fonctionnalite ;
- `recommendation_orchestrator` pour fatigue, cooldown, timing, confirmation.

Architecture de transition :

```text
court terme:
dispatcher -> surface_plan -> surface_state -> addon

cible:
skill output / product signal -> recommendation_tool -> recommendation_orchestrator
user product question -> product_help
```

### 5. Coaching intervention selector

Fichiers :

```text
supabase/functions/sophia-brain/coaching_intervention_selector.ts
supabase/functions/sophia-brain/coaching_interventions.ts
```

Role actuel :

- choisir une technique de coaching ;
- tenir compte du blocker, de l'historique et des gates ;
- injecter un addon coaching dans le contexte.

Statut cible :

```text
Garder comme sous-moteur specialise.
Le recommendation tool pourra l'appeler ou reutiliser son catalogue.
```

Ce n'est pas encore un recommendation tool transversal. C'est un selector de
techniques.

## Definitions cibles

### Conversation skill

Un conversation skill est un ownership temporaire de la reponse.

Il ne doit pas :

- executer directement une action produit ;
- ecrire directement en memoire durable ;
- porter tout le catalogue dashboard ;
- recharger toute la memoire ;
- s'appeler librement avec d'autres skills.

Il doit :

- recevoir un contexte deja filtre ;
- diagnostiquer la situation humaine ;
- produire une reponse ou une intention de reponse ;
- produire un JSON structure ;
- proposer eventuellement un besoin de recommandation ;
- declarer `continue`, `exit`, `handoff` ou `recommendation_needed`.

Skills conversationnels MVP :

```text
safety_crisis
emotional_repair
demotivation_repair
execution_breakdown
```

### Product guidance

Product guidance n'est pas un skill de diagnostic humain.

Il sert quand le user parle du produit lui-meme :

```text
"ou je change mes rappels ?"
"c'est quoi une potion ?"
"comment je cree une carte d'attaque ?"
"je veux modifier mes preferences coach"
"je ne comprends pas cette section"
```

Role :

- expliquer une surface ;
- guider vers une page ou une action ;
- clarifier la difference entre fonctionnalites ;
- ne pas diagnostiquer l'etat du user sauf signal safety.

Product guidance peut utiliser le Product Surface Registry, mais ne choisit pas
la meilleure intervention emotionnelle.

### Recommendation tool

Le recommendation tool est un moteur transversal.

Il recoit :

- output JSON du skill actif ;
- signaux runtime ;
- Memory V2 payload ;
- surface registry ;
- etat produit ;
- historique des recommandations ;
- preferences user ;
- gates safety/privacy ;
- contraintes de presentation.

Il retourne :

- la meilleure recommandation ;
- des alternatives ;
- des raisons de non-recommandation ;
- une intensite de presentation ;
- une contrainte de consentement ;
- eventuellement une demande de clarification.

Il ne doit pas :

- executer directement l'action ;
- forcer l'affichage ;
- remplacer la reponse du skill ;
- decider seul d'une modification produit sans confirmation user.

Le recommendation tool produit une decision structuree. L'orchestrateur decide
ensuite si cette decision devient :

- une simple proposition dans la reponse ;
- une demande de confirmation ;
- une operation preparee par un generateur specialise ;
- rien, si le moment n'est pas bon.

### Tool executor

Un tool executor fait une action concrete.

Exemples :

```text
create_one_shot_reminder
create_recurring_reminder        (futur)
activate_state_potion            (futur)
prepare_attack_card              (futur)
prepare_defense_card             (futur)
reschedule_plan_item             (futur)
update_coach_preferences         (futur)
```

Un tool executor doit avoir :

- un input structure ;
- des preconditions ;
- un resultat explicite ;
- un ack utilisateur ;
- une trace dans `executed_tools`.

## Activation des skills

Activation initiale MVP :

```text
signal conversationnel courant -> skill_router -> active_skill_state
```

Continuation :

```text
active_skill_state deja ouvert -> skill peut rester owner sur 1 a N tours
```

Safety :

```text
safety_crisis override tout
```

Activation proactive par evenement systeme :

```text
Reporte apres MVP.
```

Raison :

Les activations proactives augmentent fortement le risque d'incoherence. Au MVP,
on prefere activer les skills quand le user amene le sujet en conversation.

## Skill router

Le `skill_router` est le composant qui decide si un skill doit demarrer,
continuer, sortir ou etre remplace par un autre skill.

Il ne genere pas la reponse user.
Il ne charge pas directement la memoire.
Il ne choisit pas une fonctionnalite produit.

Role :

```text
dispatcher/runtime signals
+ active_skill_state
+ pending_operation_confirmation
-> SkillRouterDecision
```

### Operation intent dans le dispatcher

Le dispatcher doit detecter les demandes explicites d'operation produit dans son
JSON de sortie.

Il ne doit pas :

- faire l'intake ;
- generer un draft ;
- appeler un tool ;
- lancer une modification ;
- faire un appel IA supplementaire dedie.

Decision :

```text
Pas de `operation_intent_classifier` IA separe au MVP.
Pas de regex comme gate principal.
Le dispatcher existant ajoute un bloc structure `operation_intent`.
```

Raison :

Le dispatcher analyse deja le message. Ajouter un second appel IA pour classifier
les operations augmenterait le cout et la latence, et les regex seules seraient
trop fragiles.

### Contrat `operation_intent`

Bloc cible dans la sortie dispatcher :

```json
{
  "operation_intent": {
    "detected": true,
    "operation_type": "prepare_attack_card",
    "user_intent": "create",
    "confidence": 0.84,
    "target_hint": "ma marche du soir",
    "reason": "User explicitly asks Sophia to create an attack card for an action.",
    "needs_intake": true
  }
}
```

Types MVP :

```text
prepare_attack_card
prepare_defense_card
adjust_plan_item
select_state_potion
create_recurring_reminder
update_coach_preferences
none
```

Intentions MVP :

```text
create
update
adjust
select
explain_only
none
```

### Routing

```text
safety
-> pending_operation_confirmation Oui/Non
-> dispatcher.operation_intent
-> operation_intake si confidence suffisante
-> skill_router sinon
```

Regles :

```text
operation_intent.confidence >= 0.75
  -> operation_intake

0.55 <= confidence < 0.75
  -> clarification courte ou product_help selon le message

confidence < 0.55
  -> pas d'intake
```

Important :

```text
product_help n'active pas operation_intake par lui-meme.
operation_intake demarre uniquement via operation_intent explicite ou via une
recommendation acceptee.
```

### Frontiere dispatcher / intake

Le dispatcher detecte :

```text
"Le user demande probablement a Sophia de creer/modifier X."
```

`operation_intake` gere :

```text
quelles informations sont deja disponibles ;
quelles informations manquent ;
si le minimum viable payload est rempli ;
si une question courte est necessaire ;
si on peut generer le draft.
```

Donc le dispatcher reste routeur. L'intelligence operationnelle vit dans
`operation_intake`, `operation_payload_builder`, les generateurs et les executors.

### Skill signals dans le dispatcher

Le dispatcher doit aussi produire des signaux fins pour les skills.

Decision :

```text
Pas de classifier IA separe pour les skills.
Pas de regex comme base principale.
Le dispatcher existant ajoute un bloc structure `skill_signals`.
```

Le `skill_router` ne fait pas d'analyse NLP profonde. Il consomme les signaux du
dispatcher et applique des regles deterministes de lifecycle.

Separation :

```text
dispatcher = perception
skill_router = arbitration / lifecycle
```

### Contrat `skill_signals`

Le bloc `skill_signals` doit toujours etre present, mais son contenu depend de
l'existence d'un skill actif.

#### Aucun skill actif

Quand aucun skill n'est actif, le dispatcher cherche surtout des signaux
d'entree :

```json
{
  "skill_signals": {
    "entry": {
      "safety_crisis": {
        "detected": false,
        "confidence": 0.1,
        "reason": null
      },
      "emotional_repair": {
        "detected": true,
        "confidence": 0.86,
        "subtype": "self_criticism",
        "reason": "User strongly self-blames after missing an action."
      },
      "execution_breakdown": {
        "detected": true,
        "confidence": 0.72,
        "target_hint": "marche du soir",
        "reason": "User reports repeated failure on a concrete action."
      },
      "demotivation_repair": {
        "detected": false,
        "confidence": 0.25,
        "reason": null
      },
      "product_help": {
        "detected": false,
        "confidence": 0.1,
        "reason": null
      }
    }
  }
}
```

Le `skill_router` decide ensuite :

```text
start skill
ou none
```

#### Skill actif

Quand un skill est actif, le dispatcher recoit l'etat actif en input :

```json
{
  "active_skill": {
    "skill_id": "emotional_repair",
    "turn_count": 2,
    "summary": "User is self-blaming after missing an action."
  }
}
```

Il cherche alors surtout des signaux de lifecycle :

```json
{
  "skill_signals": {
    "lifecycle": {
      "continue_current_skill": {
        "detected": true,
        "confidence": 0.78,
        "reason": "User continues the same emotional thread."
      },
      "exit_current_skill": {
        "detected": false,
        "confidence": 0.12,
        "reason": null
      },
      "handoff_target": {
        "skill_id": "execution_breakdown",
        "confidence": 0.64,
        "reason": "Emotion has softened and user returns to a concrete action."
      }
    },
    "entry": {
      "safety_crisis": {
        "detected": false,
        "confidence": 0.1,
        "reason": null
      }
    }
  }
}
```

Le `skill_router` decide ensuite :

```text
continue
exit
handoff
safety override
```

### Relation avec operation_intent

`operation_intent` reste toujours disponible, que le user soit dans un skill ou
non.

Regle :

```text
safety override tout
operation_router gere pending_operation_confirmation Oui/Non avant tout
operation_intent fort peut demarrer operation_router
sinon skill_router arbitre les skill_signals
```

Cela permet au user de demander une action produit explicite dans n'importe quel
contexte conversationnel, sans que chaque skill porte ses propres flows produit.

## Operation router

L'`operation_router` gere le lifecycle operationnel.

Il est l'equivalent operationnel du `skill_router`, mais pour les creations et
modifications produit.

Il ne fait pas :

- d'analyse NLP profonde ;
- de generation de draft ;
- d'execution DB ;
- de choix de recommandation.

Il consomme :

```text
dispatcher.operation_intent
OU recommendation acceptee
OU pending_operation_confirmation
+ active_operation_intake
+ safety signal
```

Et retourne une decision deterministe.

### Role

```text
operation_intent / recommendation accepted / pending confirmation
-> operation_router
-> start_intake | continue_intake | ask_confirmation | execute_confirmed | cancel | none
```

### Decisions

```ts
export type OperationRouterDecisionKind =
  | "start_intake"
  | "continue_intake"
  | "ask_confirmation"
  | "execute_confirmed"
  | "cancel"
  | "none"
  | "blocked_by_safety";

export type OperationRouterDecision = {
  decision: OperationRouterDecisionKind;
  operation_id?: string | null;
  operation_type?: string | null;
  reason: string;
  next_step?:
    | "run_intake"
    | "ask_one_question"
    | "run_generator"
    | "send_confirmation"
    | "run_executor"
    | "clear_state"
    | "none";
};
```

### Active operation intake

Etat temporaire :

```text
__active_operation_intake_v1
```

Format minimal :

```json
{
  "operation_id": "op_123",
  "operation_type": "prepare_defense_card",
  "status": "collecting_info",
  "slots": {
    "plan_item_id": {
      "value": "item_123",
      "confidence": 0.91,
      "source": "plan_context"
    }
  },
  "missing_slots": ["trigger"],
  "questions_asked": 1,
  "previous_skill_id": "execution_breakdown",
  "created_at": "...",
  "updated_at": "..."
}
```

### Pipeline operationnel canonique

Toutes les operations produit structurantes suivent ce pipeline :

```text
operation_intake
  -> identifie l'operation demandee et cree/met a jour l'intake actif

operation_context_builder
  -> charge le bon contexte selon operation_type et progression de l'intake

target_resolver
  -> identifie la cible : plan item, action personnelle, sujet libre, plan global

slot_extractor
  -> remplit les infos depuis message / contexte operationnel / memoire

readiness_gate
  -> decide si le minimum viable payload est rempli
  -> decide si une question courte est necessaire
  -> decide si on doit fallback dashboard

generator
  -> prepare le draft concret, sans executer

pending_confirmation
  -> envoie un resume court avec [Oui] [Non]

executor
  -> applique seulement si Oui
```

Invariant :

```text
Aucune operation produit durable ne saute le readiness_gate.
Aucun generator n'execute.
Aucun executor ne tourne sans confirmation Oui.
```

### Operation context builder

L'`operation_context_builder` charge le contexte utile pour l'operation.

Il est state-aware :

```text
operation_type
+ active_operation_intake
+ slots deja remplis
+ missing_slots
-> contexte operationnel adapte
```

Principe :

```text
Plus les slots sont remplis, moins le contexte est large.
```

Le but est d'eviter de continuer a injecter tout le plan une fois que la cible
est identifiee.

### Context narrowing

Chaque operation passe progressivement de :

```text
target_resolution
  contexte large pour identifier la cible

slot_filling
  contexte cible pour remplir les informations manquantes

generation
  contexte minimal pour produire un draft fiable
```

Regles :

- ne pas rouvrir une ambiguite deja resolue sauf correction explicite du user ;
- ne pas garder tout le plan dans le contexte une fois `plan_item_id` identifie ;
- limiter la memoire sensible au strict necessaire ;
- si la cible reste floue apres 1 question, fallback dashboard.

### Contextes par operation

#### prepare_attack_card / prepare_defense_card

Debut, avant cible identifiee :

```text
actions du plan actives cette semaine / phase active
actions personnelles pertinentes
target_hint dispatcher
active topic
dernier plan item discute
action context recent
```

Apres cible identifiee :

```text
plan_item ou action ciblee
observations / blockers lies
slots deja remplis
derniers messages utiles
```

Avant generation :

```text
plan_item/action ciblee
slots valides
contraintes
2-3 elements memoire utiles maximum
```

#### adjust_plan_item

Debut :

```text
resume global du plan actif
phase / niveau actuel
futures phases en grandes lignes
actions actives
feedbacks recents
target_hint dispatcher
```

Apres scope identifie :

```text
specific_plan_item -> uniquement cet item + contexte lie
current_level -> niveau actuel resume + items concernes
future_levels -> futures phases en grandes lignes
global_plan -> trajectoire + feedbacks globaux
schedule_change -> fallback dashboard
```

Regle MVP :

```text
Changer le jour / planning d'une action -> fallback dashboard.
```

#### update_coach_preferences

Contexte :

```text
preferences actuelles
preference ciblee si detectee
valeur demandee si claire
```

#### create_recurring_reminder

Contexte :

```text
timezone
jours / heure mentionnes
destination possible : plan actuel ou base de vie
reminders existants recents pour eviter doublons
sujet ou action liee si mentionnee
```

Regle :

```text
one-shot reminder clair -> laisser le tool one-shot existant.
recurring reminder -> operation intake.
```

### Target resolver

Le `target_resolver` repond a la question :

```text
Est-ce que l'action / le sujet cible est identifie ?
```

Sortie cible :

```ts
type OperationTarget = {
  target_status: "identified" | "ambiguous" | "missing";
  target_kind:
    | "plan_item"
    | "personal_action"
    | "free_subject"
    | "global_plan"
    | "unknown";
  plan_item_id?: string | null;
  title_hint?: string | null;
  confidence: number;
  source: "dispatcher_hint" | "plan_snapshot" | "memory" | "user_message";
};
```

Pour `prepare_attack_card` et `prepare_defense_card`, le MVP doit rester strict :

```text
si plan_item/action ciblee clairement -> continuer
si cible manquante -> poser 1 question
si toujours flou -> fallback dashboard
```

### Slot extractor

Le `slot_extractor` n'est pas une machine a etapes. Il remplit un objet
d'information incomplet.

Sources autorisees :

```text
message user courant
conversation recente
plan snapshot
Memory V2 payload
action context
active skill summary
recommendation input
```

Chaque slot doit porter :

```json
{
  "value": "...",
  "confidence": 0.82,
  "source": "user_message|plan|memory|runtime|recommendation",
  "required": true
}
```

### Readiness gate

Chaque operation declare :

```text
required_slots
optional_slots
minimum_viable_payload
```

Le gate retourne :

```json
{
  "ready_to_generate": true,
  "safe_to_generate": true,
  "needs_one_question": false,
  "fallback_to_dashboard": false,
  "missing_required_slots": []
}
```

Regles MVP :

- max 1 question de collecte ;
- si le minimum viable payload reste incomplet apres 1 question, fallback dashboard ;
- safety bloque tout ;
- sensible/safety content ne doit etre utilise que si strictement necessaire.

### Pending operation confirmation

Etat temporaire :

```text
__pending_operation_confirmation
```

L'`operation_router` le traite avant tout autre flow operationnel.

Regles :

```text
Oui -> execute_confirmed
Non -> cancel
autre reponse -> cancel ou clear_state, puis retour conversation normale
safety -> blocked_by_safety + clear_state
expiration -> cancel
```

### Ordre runtime

Ordre cible :

```text
1. safety
2. operation_router sur pending confirmation
3. always-on tools directs
4. dispatcher.operation_intent
5. operation_router sur operation_intent fort
6. skill_router si aucune operation prioritaire
```

Always-on tools directs MVP :

```text
create_one_shot_reminder
track_progress_plan_item
```

Ces tools ne sont pas des operation skills.

Ils peuvent s'executer sans flow d'intake, mais seulement avec des garde-fous
stricts :

```text
safety active -> bloque
pending confirmation active -> traiter Oui/Non avant
target ambigu -> no write
source_message_id deja traite -> no write
```

Pour `track_progress_plan_item`, le runtime peut logger en parallele d'un skill
conversationnel non-safety, puis injecter un addon court au skill actif :

```text
tool execute -> addon tracking -> skill continue la reponse humaine
```

Exemple :

```text
"j'ai rate ma marche, je suis nul"
-> track_progress_plan_item log missed si cible claire
-> emotional_repair reste proprietaire de la reponse
```

### Relation avec skill_router

```text
skill_router = lifecycle conversationnel
operation_router = lifecycle operationnel
```

Regles :

- safety override les deux ;
- operation explicite user peut interrompre un skill actif ;
- operation pending bloque le demarrage d'un nouveau skill non-safety ;
- apres `cancel`, le skill precedent peut reprendre si encore pertinent ;
- apres `execute_confirmed`, le systeme envoie l'ack puis sort du flow operationnel.

### Tests minimum

```text
operation_intent prepare_attack_card fort -> start_intake
active_operation_intake missing slot -> continue_intake / ask_one_question
active_operation_intake ready -> run_generator
generator draft ready -> ask_confirmation
pending confirmation + Oui -> execute_confirmed
pending confirmation + Non -> cancel
pending confirmation + autre texte -> cancel + conversation normale
safety pendant operation -> blocked_by_safety
```

### Inputs

```ts
export type SkillRouterInput = {
  user_id: string;
  channel: "web" | "whatsapp";
  user_message: string;
  recent_messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  dispatcher_signals: Record<string, unknown>;
  operation_intent?: {
    detected: boolean;
    operation_type?: string | null;
    user_intent?: string | null;
    confidence: number;
    target_hint?: string | null;
    needs_intake?: boolean;
  } | null;
  skill_signals?: {
    entry?: Record<string, unknown>;
    lifecycle?: Record<string, unknown>;
  } | null;
  active_skill_state?: ActiveConversationSkillState | null;
  pending_operation_confirmation?: PendingOperationConfirmation | null;
};
```

### Output

```ts
export type SkillRouterDecisionKind =
  | "start"
  | "continue"
  | "handoff"
  | "exit"
  | "none"
  | "wait_for_confirmation";

export type SkillRouterDecision = {
  decision: SkillRouterDecisionKind;
  skill_id?: string | null;
  previous_skill_id?: string | null;
  reason: string;
  confidence: number;
  should_clear_active_skill?: boolean;
};
```

### Active skill state

Etat stocke dans `temp_memory` :

```text
__active_conversation_skill_v1
```

Format minimal :

```ts
export type ActiveConversationSkillState = {
  version: 1;
  skill_id:
    | "safety_crisis"
    | "emotional_repair"
    | "demotivation_repair"
    | "execution_breakdown"
    | "product_help";
  status: "active";
  started_at: string;
  updated_at: string;
  turn_count: number;
  max_turns: number;
  primary_signal: string;
  summary: string;
  previous_skill_id?: string | null;
};
```

### Active skill working state

`__active_conversation_skill_v1` n'est pas seulement un marqueur de routing.
C'est d'abord la memoire de travail du skill actif.

Le consommateur principal est :

```text
skill.run()
```

Pas le dispatcher.

Le dispatcher peut recevoir une vue courte pour decider `continue`, `exit` ou
`handoff`, mais l'appel IA qui produit la reponse du skill doit recevoir la vue
complete.

Separation :

```text
dispatcher view
  skill_id
  turn_count
  phase
  summary court

skill view
  summary vivant
  phase
  slots
  missing_slots
  derniere question posee
  derniere intention de reponse
  resume de la derniere reponse user
```

Format cible :

```ts
export type ActiveConversationSkillWorkingState = {
  version: 1;
  skill_id:
    | "safety_crisis"
    | "emotional_repair"
    | "demotivation_repair"
    | "execution_breakdown"
    | "product_help";
  status: "active";
  started_at: string;
  updated_at: string;
  turn_count: number;
  max_turns: number;

  primary_signal: string;
  phase?: string;
  summary: string;
  slots?: Record<string, unknown>;
  missing_slots?: string[];

  last_response_intent?: string | null;
  last_question_asked?: string | null;
  last_user_answer_summary?: string | null;

  previous_skill_id?: string | null;
  handoff_from?: string | null;
};
```

Chaque run de skill doit produire un `state_patch`.

Exemple `execution_breakdown` :

```json
{
  "state_patch": {
    "summary": "User bloque sur la marche du soir. Cible identifiee. Frein probable: fatigue le soir. Pas de honte dominante.",
    "phase": "diagnosis",
    "slots": {
      "target": {
        "status": "identified",
        "kind": "plan_item",
        "label": "marche du soir"
      },
      "blocker_hypothesis": {
        "primary": "fatigue_overload",
        "confidence": 0.78
      }
    },
    "missing_slots": [],
    "last_question_asked": null,
    "turn_count_increment": 1
  }
}
```

Exemple si le skill pose une question :

```json
{
  "state_patch": {
    "summary": "User dit qu'il n'arrive pas a faire une action, mais la cible n'est pas encore claire.",
    "phase": "target_resolution",
    "slots": {
      "target": {
        "status": "missing"
      }
    },
    "missing_slots": ["target"],
    "last_question_asked": "Tu parles de quelle action precisement ?",
    "turn_count_increment": 1
  }
}
```

Au tour suivant, le skill recoit ce working state et comprend :

```text
- quelle question a deja ete posee ;
- quels trous restent a remplir ;
- quelle cible ou hypothese a deja ete stabilisee ;
- quelle phase continuer ;
- quand eviter de reposer la meme question.
```

Lifecycle :

```text
skill.run()
-> output JSON + state_patch
-> runtime merge state_patch dans __active_conversation_skill_v1
-> prochain tour: skill_context_loader reinjecte la vue complete au skill
```

A l'exit :

```text
- clear __active_conversation_skill_v1 ;
- optionnel : produire un skill_run_summary pour observability / memorizer async.
```

### Pending operation confirmation

Si une operation attend un Oui/Non, le router ne doit pas lancer un nouveau skill
sauf safety.

Etat :

```text
__pending_operation_confirmation
```

Regles :

```text
Si safety -> override et suspend/annule l'operation pending.
Si user clique Oui -> executer l'operation, puis clear pending.
Si user clique Non -> annuler, clear pending, reprendre le skill precedent si utile.
Si user repond autre chose -> clear pending ou ignorer l'operation, puis traiter comme conversation normale.
```

Decision router possible :

```json
{
  "decision": "wait_for_confirmation",
  "skill_id": null,
  "previous_skill_id": "execution_breakdown",
  "reason": "operation confirmation pending",
  "confidence": 1
}
```

### Priorites

Ordre MVP :

```text
1. safety_crisis
2. emotional_repair
3. execution_breakdown
4. demotivation_repair
5. product_help
6. none
```

Notes :

- `safety_crisis` override tout.
- `emotional_repair` couvre auto-flagellation, honte, culpabilite et surcharge emotionnelle non-safety.
- `execution_breakdown` passe avant `demotivation_repair` quand une action concrete est ciblee.
- `product_help` ne prend la main que si le user demande explicitement une aide produit.

### Regles de continuation

Un skill actif peut continuer si :

```text
turn_count < max_turns
ET pas de safety
ET pas de changement de sujet explicite
ET le user repond encore dans le meme probleme
```

Un skill doit sortir si :

```text
max_turns atteint
OU user change clairement de sujet
OU objectif atteint
OU operation pending creee
OU handoff valide par l'orchestrateur
```

### Transitions autorisees

```text
any_skill -> safety_crisis

emotional_repair -> execution_breakdown
  si l'emotion est stabilisee et une action concrete reste bloquee

execution_breakdown -> emotional_repair
  si honte / auto-attaque devient dominante

demotivation_repair -> execution_breakdown
  si le user revient vers une action concrete

execution_breakdown -> demotivation_repair
  si le probleme est surtout perte de sens ou motivation

any_skill -> product_help
  seulement si demande produit explicite

any_skill -> exit
  si changement de sujet ou objectif atteint
```

### Conversation skill context loader

Le `conversation_skill_context_loader` charge le contexte utile au skill actif.

Il intervient ici :

```text
dispatcher
-> skill_signals + operation_intent + memory hints
-> skill_router
-> conversation_skill_context_loader
-> skill.run()
```

Il ne remplace pas Memory V2. Il utilise Memory V2 avec un profil de retrieval
adapte au skill.

Role :

```text
skill_id
+ active_skill_working_state complet pour le skill
+ skill_signals
+ dispatcher memory hints
+ recent_messages
+ Memory V2 payload/runtime
-> contexte filtre pour le skill
```

Le dispatcher reste responsable de la perception :

```text
- signaux conversationnels ;
- signaux de lifecycle du skill actif ;
- operation_intent ;
- memory hints / topic hints.
```

Le skill doit recevoir en priorite :

```text
- active_skill_working_state.summary ;
- active_skill_working_state.phase ;
- active_skill_working_state.slots ;
- active_skill_working_state.missing_slots ;
- active_skill_working_state.last_question_asked ;
- active_skill_working_state.last_response_intent.
```

Le loader est responsable du contexte :

```text
- quelles couches Memory V2 charger ;
- quel contexte plan/dashboard autoriser ;
- quels elements sensibles exclure ;
- quand reduire le contexte.
```

Precision importante :

```text
"charge" veut dire "injecte dans le prompt du skill pour ce tour".
```

Cela ne veut pas dire que l'information disparait de la base ou de la memoire.
Elle reste disponible dans les tables, le plan, les events ou les snapshots.
Le loader decide seulement ce qui est utile d'injecter maintenant pour eviter :

```text
- bruit cognitif pour le skill ;
- reponses incoherentes ;
- cout token inutile ;
- sur-interpretation de donnees non pertinentes.
```

Separation stricte :

```text
context loader = donnees user / conversation / plan / memoire injectees au tour courant
skill = regles, posture, protocole, logique de reponse, format de sortie
```

Exemple :

```text
Le protocole safety appartient au skill safety_crisis.
Il ne doit pas etre injecte par le context loader comme une donnee utilisateur.
```

### Regles generales des context loaders conversationnels

Chaque skill a un profil de contexte dedie.

Regles :

- ne pas injecter tout le plan par defaut ;
- ne pas injecter toute la memoire par defaut ;
- privilegier les derniers messages + le topic actif + quelques souvenirs utiles ;
- injecter le contexte produit uniquement si le skill en a besoin ;
- ne jamais pousser de dashboard pendant `safety_crisis` ;
- ne pas melanger contexte operationnel et contexte conversationnel ;
- si `operation_intent` est fort, passer a l'`operation_router` plutot qu'au loader conversationnel ;
- si une operation est pending confirmation, gerer Oui/Non avant d'injecter un contexte de skill ;
- si un skill demande une recommandation, transmettre un diagnostic structure au recommendation tool, pas tout le contexte brut.

### Context narrowing des conversation skills

Un skill conversationnel doit aussi reduire son contexte au fil des tours.

Phases :

```text
entry
  contexte leger pour comprendre la situation

focus
  contexte cible une fois le probleme principal identifie

handoff_or_exit
  contexte minimal pour sortir, recommander ou passer a une operation
```

Regles :

- une fois le sujet/action identifie, ne pas continuer a injecter les candidats ;
- une fois l'etat emotionnel identifie, ne pas injecter des hypotheses concurrentes sauf nouveau signal ;
- garder le `active_skill_working_state.summary` comme fil conducteur ;
- utiliser `slots` et `missing_slots` pour eviter les boucles de questions ;
- laisser le memorizer async decider des ecritures durables ;
- ne pas rouvrir une analyse si le user a deja confirme ou corrige le cadrage.

### Contextes par conversation skill

#### safety_crisis

Objectif :

```text
securiser le moment present, detecter l'urgence, repondre avec un cadre safety.
```

Contexte injecte :

```text
derniers messages
signal safety courant
active_skill_state si safety deja actif
timezone / pays si utile pour ressources
notes safety tres recentes si elles existent
```

Contexte non injecte par defaut :

```text
plan complet
dashboard/product surfaces
recommendation tool
operations produit
profil identitaire large
protocole de reponse safety
```

Narrowing :

```text
tour 1
  injecter uniquement le message courant, les derniers messages utiles et le signal safety

tours suivants
  garder uniquement les elements safety du thread actif et le resume du skill actif
```

Sortie :

```text
sortir seulement si le danger est clarifie comme non-immediat
ou si le user change explicitement vers un sujet non-safety.
```

#### emotional_repair

Objectif :

```text
desamorcer auto-flagellation, honte, culpabilite ou durete excessive.
```

Contexte injecte au debut :

```text
derniers messages
topic actif
signal emotionnel courant
evenements recents lies a l'auto-critique
topic memories liees au sujet mentionne
facts de preferences coach si disponibles
global memories ciblees par le memory_plan si le dispatcher en demande explicitement
event memories recentes liees au moment si le dispatcher en demande explicitement
action/sujet mentionne si present
```

Contexte non injecte par defaut :

```text
plan complet
liste de toutes les actions
catalogue produit
solutions execution trop rapides
```

Narrowing :

```text
avant cadrage
  injecter emotion + sujet probable + 2-3 souvenirs recents utiles

apres cadrage
  injecter seulement pattern emotionnel, sujet/action cible si utile, derniers messages

si l'emotion baisse et qu'une action concrete reste bloquee
  handoff possible vers execution_breakdown
```

Recommendation :

```text
possible apres stabilisation, souvent potion d'etat.
pas de carte defense immediate sauf pattern recurrent clair et non aigu.
```

#### execution_breakdown

Objectif :

```text
comprendre pourquoi une action ne se fait pas sans sauter trop vite vers une solution.
```

Contexte injecte avant cible identifiee :

```text
derniers messages
target_hint dispatcher
actions du plan actives cette semaine / phase active
dernier plan item discute
actions personnelles pertinentes
evenements recents d'execution
momentum / slipping signals
blockers connus
topic memories liees a l'action si une action probable existe
```

Contexte injecte apres cible identifiee :

```text
plan_item ou action ciblee
observations / blockers lies
historique recent de tentatives
contraintes connues
topic memories liees a l'action ciblee
derniers messages utiles
```

Contexte non injecte apres cible identifiee :

```text
plan complet une fois la cible identifiee
liste des autres actions candidates
recommendation produit avant diagnostic minimal
modification de planning automatique
```

Narrowing :

```text
target_resolution
  injecter un contexte large mais court pour identifier si le blocage concerne une action du plan, une action personnelle ou un sujet libre

diagnosis
  injecter uniquement la cible + les indices du frein dominant : fatigue, peur, honte, flou, contexte impossible, action trop lourde

recommendation_or_handoff
  transmettre seulement diagnostic + cible + evidence utile, pas le contexte brut complet
```

Handoffs :

```text
honte / auto-attaque dominante -> emotional_repair
perte de sens dominante -> demotivation_repair
danger -> safety_crisis
operation explicite -> operation_router
```

#### demotivation_repair

Objectif :

```text
traiter la perte d'envie, le "ca sert a rien", la baisse de sens ou d'elan.
```

Contexte injecte au debut :

```text
derniers messages
topic actif
north star / trajectoire en version courte
phase actuelle du plan en resume
feedbacks recents
frictions recurrentes
moments ou le user retrouvait de l'elan
global memories cycle / transformation si utiles
```

Contexte non injecte par defaut :

```text
detail complet de toutes les actions
catalogue produit
push dashboard trop rapide
```

Narrowing :

```text
avant diagnostic
  injecter trajectoire courte + signaux recents pour distinguer fatigue, perte de sens, accumulation d'echecs, rejet du plan, crise emotionnelle

apres diagnostic
  injecter seulement trajectoire courte + cause dominante + derniers messages

si action concrete emerge
  handoff possible vers execution_breakdown
```

Recommendation :

```text
possible si le besoin est clair : potion, ajustement de plan, reduction d'engagement.
le recommendation tool decide la surface, pas le skill.
```

#### product_help

`product_help` utilise son propre loader leger :

```text
product_help_context_loader
```

Voir section :

```text
Product help context loader
```

Il ne charge pas Memory V2 profond par defaut et ne doit pas devenir un intake
operationnel.

### Tests minimum

Cas a couvrir :

```text
"je veux me faire du mal" -> safety_crisis start
"je suis nul j'ai encore rate" -> emotional_repair start
"j'arrive pas a faire ma marche" -> execution_breakdown start
"ca sert a rien j'ai plus envie" -> demotivation_repair start
"c'est quoi une potion ?" -> product_help start
active emotional_repair + "oui mais c'est toujours pareil" -> continue
active execution_breakdown + auto-insulte forte -> handoff emotional_repair
pending operation + Oui -> wait_for_confirmation / executor path
pending operation + Non -> cancel / optional resume previous skill
pending operation + safety -> safety override
```

## Relation entre skills et recommendation tool

Regle centrale :

```text
Le skill diagnostique.
Le recommendation tool choisit la fonctionnalite.
Le recommendation orchestrator decide timing / intensite / confirmation.
Le tool executor execute seulement apres consentement user.
```

Exemple execution breakdown :

```json
{
  "skill_id": "execution_breakdown",
  "status": "continue",
  "diagnosis": {
    "blocker_type": "fatigue_shame_mixed",
    "confidence": 0.74,
    "danger": "none"
  },
  "action_context": {
    "plan_item_id": "item_123",
    "title": "Marche du soir",
    "missed_count_recent": 2
  },
  "recommendation_need": {
    "needed": true,
    "type": "execution_repair",
    "urgency": "low",
    "constraints": [
      "ask_consent_first",
      "no_pressure",
      "prefer_state_or_reduction_before_attack_card"
    ]
  }
}
```

Le recommendation tool peut repondre :

```json
{
  "decision": "recommend",
  "surface_id": "potion.state",
  "tool_id": null,
  "confidence": 0.82,
  "timing": "now",
  "presentation_level": 2,
  "cta_style": "soft",
  "reason": "L'etat de honte/fatigue domine le probleme d'execution.",
  "user_facing_offer": "On peut d'abord faire une potion d'etat courte, puis revenir a l'action.",
  "alternatives": [
    {
      "surface_id": "dashboard.personal_actions",
      "reason": "Possible plus tard si le blocage est surtout structurel."
    }
  ],
  "do_not_recommend": [
    {
      "surface_id": "attack_card",
      "reason": "Trop oriente performance pendant un moment de honte."
    }
  ]
}
```

## Transitions entre skills

Les skills ne doivent pas s'appeler librement.

Ils retournent une demande de transition, l'orchestrateur valide.

Transitions autorisees MVP :

```text
any_skill -> safety_crisis

emotional_repair -> execution_breakdown
  si honte apaisee et probleme d'action encore actif

execution_breakdown -> emotional_repair
  si auto-flagellation devient dominante

demotivation_repair -> execution_breakdown
  si le user revient vers une action concrete

execution_breakdown -> demotivation_repair
  si le probleme n'est pas l'action mais la perte de sens

any_skill -> exit
  si user change de sujet ou objectif atteint
```

Product help reste a part :

```text
any_skill -> product_help
  seulement si le user demande explicitement comment utiliser le produit
```

## Que faire de surface_plan ?

### Court terme

Garder le systeme actuel :

```text
dispatcher -> surface_plan -> surface_state -> addon
```

Ne pas le casser pendant l'implementation Memory V2.

### Moyen terme

Introduire `recommendation_tool` en shadow et commencer a reduire le role de
`surface_plan` :

```text
dispatcher surface_plan actuel
skill_output/recommendation_input nouveau
recommendation_tool shadow
comparaison des decisions
```

On log :

- surface choisie par `surface_plan` ;
- surface choisie par `recommendation_tool` ;
- divergence ;
- raisons ;
- user accepted / ignored.

### Cible

Le dispatcher ne produit plus une recommandation produit detaillee, et
`surface_state` ne choisit plus de push produit de facon autonome.

Il produit plutot :

```json
{
  "product_signal": {
    "detected": true,
    "kind": "possible_surface_opportunity",
    "confidence": 0.72,
    "surface_hints": ["dashboard.reminders"],
    "reason": "User mentions needing reminders."
  }
}
```

Puis :

```text
recommendation_tool -> ProductRecommendation
recommendation_orchestrator -> timing / confirmation / message template
```

`surface_plan` peut rester pendant une phase de compatibilite, puis devenir un
adapter autour du recommendation tool.

## Deux chemins produit cibles

### Chemin A - Product help

Declencheur :

```text
Le user demande explicitement de l'aide sur une fonctionnalite.
```

Exemples :

```text
"ou je change mes rappels ?"
"c'est quoi une potion ?"
"comment on cree une carte d'attaque ?"
"je veux modifier mes preferences coach"
```

Flow :

```text
user product question
-> product_help skill
-> product_help_context_loader
-> Product Help Feature Registry
-> reponse explicative / redirection / aide d'usage
```

Product help ne recommande pas une intervention cachee. Il explique, clarifie
ou guide.

### Product help context loader

`product_help` utilise un contexte leger.

Decision MVP :

```text
Pas de Memory V2 profond par defaut.
Pas de plan complet.
Pas de payload operationnel.
```

Le loader charge :

```text
- liste des fonctionnalites plan disponibles ;
- requested_feature si identifiee ;
- fiche detaillee de la feature identifiee ;
- regles product_help ;
- etat locked/unavailable si necessaire.
```

Niveaux :

```text
feature inconnue
  -> charger liste courte des features plan connues

feature identifiee
  -> charger uniquement la fiche complete de cette feature

question comparative
  -> charger uniquement les fiches comparees
```

Cas rares ou un contexte utilisateur est autorise :

```text
question sur preferences coach
  -> charger preferences actuelles

question precise sur reminders
  -> charger reminders existants recents

feature locked / indisponible
  -> charger entitlement / availability
```

Si le user demande "comment l'utiliser pour mon cas", ne pas charger
automatiquement tout le contexte. Soit :

```text
- reponse explicative generale ;
- ou operation_intent si le user demande explicitement d'agir ;
- ou skill humain si la demande cache un blocage / etat emotionnel.
```

### Chemin B - Recommendation

Declencheur :

```text
Un skill ou un signal structure une opportunite produit.
```

Exemples :

```text
execution_breakdown -> action trop lourde / fatigue / peur / honte
emotional_repair -> besoin de regulation d'etat
demotivation_repair -> besoin de sens ou d'ajustement
```

Flow :

```text
skill output JSON
-> recommendation_tool
-> recommendation_orchestrator
-> proposition / confirmation / operation preparee
```

Ici le user n'a pas demande "comment marche le dashboard". Sophia detecte une
opportunite utile, mais doit rester prudente, demander le consentement quand il
y a modification ou creation, et ne jamais pousser en safety.

## Pipeline de modification produit depuis le chat

Certaines recommandations ne sont pas de simples redirections. Elles peuvent
mener a une modification ou creation produit :

```text
ajuster une action du plan
reduire une action
deplacer une action
creer une carte d'attaque
creer une carte de defense
activer une potion d'etat
modifier des preferences coach
creer un reminder recurrent
```

Pour ces cas, le flow doit etre en deux temps.

### Etape 1 - Recommendation structuree

Le recommendation tool ne cree rien directement. Il produit une intention
operationnelle :

```json
{
  "decision": "recommend_operation",
  "operation_type": "prepare_attack_card",
  "confidence": 0.84,
  "reason": "Le blocage est lie a l'evitement d'une action claire.",
  "requires_confirmation": true,
  "operation_input": {
    "plan_item_id": "item_123",
    "blocker_type": "avoidance",
    "constraints": ["short", "no_pressure"]
  }
}
```

### Etape 2 - Generateur specialise

Une IA specialisee ou un module dedie transforme cette sortie en draft concret.

Exemples :

```text
attack_card_generator
defense_card_generator
plan_adjustment_generator
potion_session_selector
recurring_reminder_builder
coach_preferences_patch_builder
```

Chaque generateur a son propre prompt, son schema de sortie et ses tests. Il ne
doit pas etre inclus dans le skill conversationnel.

Le generateur ne doit pas recevoir tout le contexte conversationnel brut. Il
recoit un payload minimal, structure et adapte a son operation.

Exemple sortie generateur :

```json
{
  "operation_type": "prepare_attack_card",
  "draft": {
    "title": "Version minimale de la marche du soir",
    "technique": "minimum_version",
    "instruction": "Mettre ses chaussures et marcher 4 minutes."
  },
  "confirmation_message": "Je te propose de creer une carte d'attaque tres courte pour ta marche du soir : mettre tes chaussures et marcher 4 minutes. Tu veux que je la cree ?",
  "confirmation_actions": ["yes", "no"]
}
```

### Etape 3 - Confirmation user

Le systeme envoie un message template :

```text
Je te propose de changer X / creer Y.
Resume court de ce qui sera cree ou modifie.
[Oui] [Non]
```

Regles :

- aucune modification durable sans confirmation explicite ;
- le bouton "oui" execute l'operation preparee ;
- le bouton "non" annule simplement ;
- pas d'ajustement dans ce flow MVP ;
- si le user repond en texte libre, traiter comme une reponse conversationnelle normale, sans executer l'operation.

Etat temporaire :

```json
{
  "__pending_operation_confirmation": {
    "operation_id": "op_123",
    "operation_type": "prepare_attack_card",
    "previous_skill_id": "execution_breakdown",
    "summary": "Creer une carte d'attaque courte pour la marche du soir.",
    "draft": {},
    "expires_after_turns": 2
  }
}
```

### Etape 4 - Execution

Seulement apres confirmation :

```text
confirmed operation draft
-> tool executor
-> DB write / edge function
-> ack user avec details
-> event log
-> memorizer async si utile
```

Message apres execution :

```text
C'est fait. J'ai cree/modifie X avec les details suivants : ...
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

Cette separation evite que Sophia modifie le plan ou cree des cartes trop vite
pendant un moment emotionnel.

## Operation payload builder

Le point central du pipeline operationnel est un builder dedie :

```text
supabase/functions/sophia-brain/operation_payload_builder.ts
```

Role :

```text
skill_output
-> recommendation_tool
-> OperationDraftRequest canonique
-> payload adapter specifique
-> generator specialise
```

Le builder doit empecher deux erreurs :

- envoyer trop de contexte a une IA specialisee ;
- laisser le generateur prendre une decision produit qui appartient au
  recommendation tool.

### Payload canonique

Tous les generateurs partent d'un socle commun :

```ts
export type OperationDraftRequest = {
  operation_id: string;
  operation_type:
    | "prepare_attack_card"
    | "prepare_defense_card"
    | "adjust_plan_item"
    | "select_state_potion"
    | "create_recurring_reminder"
    | "update_coach_preferences";

  source: {
    skill_id: string;
    skill_run_id?: string | null;
    recommendation_id: string;
    trigger_message_id: string;
  };

  user_context: {
    user_id: string;
    timezone: string;
    channel: "web" | "whatsapp";
    locale: "fr";
  };

  diagnosis: {
    blocker_type?: string | null;
    emotional_state?: string[];
    motivation_state?: string | null;
    confidence: number;
    constraints: string[];
  };

  target: {
    plan_item_id?: string | null;
    plan_item_title?: string | null;
    transformation_id?: string | null;
    topic_id?: string | null;
  };

  evidence: {
    current_user_message: string;
    recent_summary?: string | null;
    relevant_memory_items: Array<{
      id: string;
      kind: string;
      summary: string;
      sensitivity_level: "normal" | "sensitive" | "safety";
    }>;
    action_observations?: Array<{
      plan_item_id: string;
      summary: string;
      window: string;
    }>;
  };

  product_constraints: {
    allowed_operations: string[];
    forbidden_operations: string[];
    requires_confirmation: true;
    max_intrusiveness: 1 | 2 | 3 | 4 | 5;
  };
};
```

### Adapters par generateur

Le payload canonique est ensuite converti par un adapter specifique.

```text
buildAttackCardPayload()
buildDefenseCardPayload()
buildPlanAdjustmentPayload()
buildPotionSelectionPayload()
buildRecurringReminderPayload()
buildCoachPreferencesPayload()
```

Chaque adapter doit :

- garder uniquement les champs necessaires ;
- ajouter l'`output_schema` attendu ;
- ajouter les contraintes et interdits utiles ;
- retirer les contenus sensibles non necessaires ;
- refuser de construire un payload si les preconditions manquent.

### Exemple attack card payload

```json
{
  "operation_type": "prepare_attack_card",
  "plan_item": {
    "id": "item_123",
    "title": "Marche du soir",
    "current_instruction": "Marcher 20 minutes apres diner"
  },
  "blocker": {
    "type": "avoidance",
    "confidence": 0.78,
    "evidence": "Le user dit rater souvent la marche du soir."
  },
  "constraints": [
    "short",
    "no_pressure",
    "must_be_doable_under_5_minutes"
  ],
  "forbidden": [
    "do_not_moralize",
    "do_not_increase_difficulty"
  ],
  "output_schema": "attack_card_draft_v1"
}
```

### Exemple plan adjustment payload

```json
{
  "operation_type": "adjust_plan_item",
  "adjustment_type": "reduce",
  "plan_item": {
    "id": "item_123",
    "title": "Marche du soir",
    "current_target": "20 minutes",
    "current_schedule": "soir"
  },
  "reason": {
    "blocker_type": "fatigue",
    "evidence": "Deux echecs recents, fatigue elevee le soir."
  },
  "allowed_patch_fields": [
    "title",
    "target_reps",
    "duration_minutes",
    "schedule_hint",
    "difficulty"
  ],
  "confirmation_required": true,
  "output_schema": "plan_item_patch_v1"
}
```

Sortie attendue :

```json
{
  "patch": {
    "duration_minutes": 5,
    "schedule_hint": "apres diner ou avant douche",
    "difficulty": "low"
  },
  "confirmation_message": "Je te propose de reduire la marche du soir a 5 minutes pendant quelques jours. Tu veux que je l'ajuste ?"
}
```

### Regles de construction des payloads

1. Minimalite

Le generateur ne recoit pas le thread complet. Il recoit seulement les elements
necessaires a l'operation.

2. Evidence structuree

Utiliser des resumes sources, pas du verbatim sensible sauf necessite stricte.

3. Contraintes explicites

Inclure les contraintes comme `no_pressure`, `ask_consent_first`,
`do_not_moralize`, `do_not_increase_difficulty`.

4. Schema strict

Chaque generateur doit avoir un `output_schema` versionne et validable.

5. Pas de decision produit dans le generateur

Le generateur ne choisit pas entre potion, carte, reminder ou plan adjustment.
Il prepare uniquement l'objet demande.

6. Refus si preconditions manquent

Exemples :

```text
prepare_attack_card sans plan_item_id -> refuse
adjust_plan_item sans allowed_patch_fields -> refuse
create_recurring_reminder sans timezone -> refuse
update_coach_preferences sans preference keys -> refuse
```

## Invariant potion

Une potion n'est pas seulement une surface explicative ni seulement une session
ouverte.

Invariant produit :

```text
Potion activee = message immediat rassurant + recurring reminder 7 jours.
```

### Depuis le chat

Quand `select_state_potion_operation_skill` est confirme par Oui :

```text
select_state_potion_operation_skill
-> potion_session_selector
-> pending_confirmation Oui/Non
-> activate_state_potion_executor
-> creer/activer user_potion_session
-> envoyer le message immediat rassurant
-> creer user_recurring_reminder potion_follow_up
-> creer scheduled_checkins x 7
```

Le user ne choisit pas l'horaire dans le chat MVP.

```text
L'IA choisit le meilleur horaire d'envoi a partir du contexte disponible.
Si rien n'est fiable, utiliser un default calme, par exemple 09:00 ou 18:30
selon le type de potion et le moment du probleme.
```

L'ack apres execution doit contenir :

```text
C'est fait. J'ai lance une potion [type].

[message immediat rassurant]

Je t'ai aussi programme un rappel quotidien pendant 7 jours.
Tu peux modifier dans ton espace sur sophia-coach.ai.
```

### Depuis la plateforme

Comportement cible :

```text
questionnaire potion
-> generation du message immediat
-> creation systematique d'un recurring reminder de suivi
```

La plateforme doit donc rester alignee avec le chat :

```text
message immediat visible
recurring reminder cree systematiquement
duree cible MVP = 7 jours
source = potion_generated / potion_follow_up
```

Point de vigilance implementation :

```text
Si l'UI plateforme laisse encore le user cliquer sur "Programmer" ou choisir
3 / 5 / 10 / 14 jours, ce comportement est a revalider.
Le comportement cible de ce plan est : suivi potion systematique, 7 jours.
```

## Product Surface Registry v2

Le registry actuel doit etre enrichi.

Champs a ajouter progressivement :

```ts
type ProductSurfaceDefinition = {
  id: string;
  family: "utility" | "transformational" | "state" | "execution" | "safety";
  label: string;
  goal: string;
  when_relevant: string;
  anti_noise: string;
  contraindications: string[];
  requires_consent: boolean;
  can_execute_from_chat: boolean;
  executor_tool_id?: string | null;
  default_level_cap: 1 | 2 | 3 | 4 | 5;
  content_source: string;
  aliases: string[];
  trigger_keywords: string[];
}
```

Surfaces a ajouter a terme :

```text
potion.state
attack_card
defense_card
plan_item.reduce
plan_item.reschedule
plan_item.clarify
dashboard.reminders
dashboard.preferences
dashboard.personal_actions
```

Important :

Les potions, cartes et modifications de plan ne doivent pas etre traitees comme
de simples redirections dashboard. Ce sont des interventions produit avec plus
de risque UX.

## Contrats TypeScript cibles

### Skill output

```ts
export type ConversationSkillStatus =
  | "continue"
  | "complete"
  | "exit"
  | "handoff"
  | "recommendation_needed";

export type ConversationSkillOutput = {
  skill_id: string;
  status: ConversationSkillStatus;
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

### Recommendation input

```ts
export type RecommendationToolInput = {
  user_id: string;
  channel: "web" | "whatsapp";
  current_skill_id?: string | null;
  skill_output?: ConversationSkillOutput | null;
  dispatcher_signals: Record<string, unknown>;
  memory_payload: Record<string, unknown>;
  active_topic_state?: Record<string, unknown> | null;
  presentation_state?: Record<string, unknown> | null;
  available_surfaces: ProductSurfaceDefinition[];
  recent_recommendations: Array<Record<string, unknown>>;
  user_preferences?: Record<string, unknown>;
};
```

### Recommendation output

```ts
export type RecommendationDecision =
  | "none"
  | "recommend"
  | "recommend_operation"
  | "ask_clarification"
  | "defer"
  | "blocked";

export type ProductRecommendation = {
  decision: RecommendationDecision;
  surface_id?: string | null;
  executor_tool_id?: string | null;
  operation_type?: string | null;
  operation_input?: Record<string, unknown> | null;
  confidence: number;
  timing: "now" | "later" | "watch";
  presentation_level: 0 | 1 | 2 | 3 | 4 | 5;
  cta_style: "none" | "soft" | "direct";
  requires_consent: boolean;
  reason: string;
  user_facing_offer?: string | null;
  alternatives: Array<{
    surface_id: string;
    confidence: number;
    reason: string;
  }>;
  do_not_recommend: Array<{
    surface_id: string;
    reason: string;
  }>;
};
```

## Implementation roadmap

### Phase 0 - Documentation et invariants

DoD :

- ce document est valide ;
- les termes sont stabilises :
  - skill ;
  - product guidance ;
  - recommendation tool ;
  - surface ;
  - executable tool ;
  - recommendation_orchestrator ;
  - surface_state legacy.

### Phase 1 - Signal schema

Ajouter ou preparer les signaux :

```text
self_criticism
demotivation
execution_breakdown
product_help_intent
recommendation_opportunity
```

DoD :

- pas encore de skill actif ;
- detection en shadow ;
- logs de precision sur conversations samples.

### Phase 2 - Active skill state

Ajouter dans `temp_memory` :

```text
__active_conversation_skill_v1
```

Contenu minimal :

```json
{
  "skill_id": "emotional_repair",
  "status": "active",
  "started_at": "...",
  "turn_count": 1,
  "primary_signal": "self_criticism",
  "summary": "...",
  "phase": "repair",
  "slots": {},
  "missing_slots": [],
  "last_question_asked": null,
  "max_turns": 3
}
```

DoD :

- creation, continuation, exit ;
- `state_patch` merge apres chaque run de skill ;
- le skill recoit la vue complete du working state au tour suivant ;
- le dispatcher ne recoit qu'une vue courte pour routing/lifecycle ;
- safety override ;
- aucune ecriture durable.

### Phase 3 - Deux skills MVP

Implementer :

```text
safety_crisis
emotional_repair
```

DoD :

- self-blame scenario passe ;
- safety minimal context passe ;
- pas de dashboard push pendant safety ;
- memory candidates envoyes au memorizer async seulement si utile.

### Phase 4 - Product help minimal

Implementer `product_help` comme mode separe :

- detecte les demandes produit explicites ;
- utilise `surface_registry`;
- explique ou redirige ;
- ne fait pas de diagnostic humain lourd.

DoD :

- "ou changer mes rappels ?" -> guide reminders ;
- "c'est quoi les preferences coach ?" -> guide preferences ;
- pas de push opportuniste.

### Phase 5 - Recommendation tool shadow

Creer un module :

```text
supabase/functions/sophia-brain/recommendation_tool.ts
```

Shadow only :

- input depuis skill output + registry + historique de presentation ;
- output logge ;
- pas utilise pour repondre.

Comparer avec `surface_plan`.

DoD :

- divergences tracees ;
- aucune regression utilisateur ;
- 20 conversations samples auditees.

### Phase 6 - Recommendation tool actif pour skills

Activer uniquement pour :

```text
emotional_repair
execution_breakdown
```

DoD :

- le skill ne choisit pas directement la surface ;
- recommendation tool propose ;
- recommendation_orchestrator decide presentation / confirmation ;
- consentement requis avant tool execution.

### Phase 7 - Operation proposal pipeline

Implementer le flow :

```text
recommend_operation
-> operation_router
-> operation_intake
-> operation_context_builder
-> target_resolver / slot_extractor
-> readiness_gate
-> operation_payload_builder
-> generateur specialise
-> confirmation template
-> tool executor apres oui
```

Commencer par un seul cas :

```text
prepare_attack_card ou plan_item.reduce
```

DoD :

- `OperationDraftRequest` canonique implemente ;
- adapter specifique du premier cas implemente ;
- preconditions testees ;
- aucun write sans confirmation ;
- resume court visible dans le message de confirmation ;
- oui execute ;
- non annule sans ajustement ;
- apres oui, message de details envoye avec "Tu peux modifier dans ton espace sur sophia-coach.ai." ;
- event log complet.

### Phase 8 - Migration de surface_plan

Reduire progressivement le role du dispatcher :

```text
Avant:
dispatcher -> surface_plan detaille

Apres:
dispatcher -> product_signal / surface_hints
recommendation_tool -> recommendation detaillee
recommendation_orchestrator -> presentation / confirmation
```

DoD :

- `surface_plan` garde compatibilite ;
- nouveau chemin stable ;
- metrics de fatigue et acceptance meilleures ou equivalentes.

## Decisions ouvertes

1. Est-ce que `recommendation_tool` doit etre LLM-first ou hybride rules + LLM ?

Recommandation :

```text
Hybride.
Rules pour gates safety/privacy/cooldown.
LLM pour le ranking et les raisons.
```

2. Est-ce que les potions sont une surface ou un tool ?

Recommandation :

```text
Les deux.
Surface = proposer / expliquer la potion.
Tool = activer ou planifier une potion concrete.
```

3. Est-ce que product guidance est un skill ?

Recommandation :

```text
Oui techniquement, mais pas dans la meme famille.
Famille: product_help.
Pas emotional/execution skill.
```

4. Est-ce que `dashboard_guidance` doit exister ?

Recommandation :

```text
Renommer en product_help.
Ne pas l'utiliser pour recommander une intervention.
```

## Invariants a ne pas casser

```text
Un skill ne doit pas executer un tool directement.
Un skill ne doit pas ecrire durablement en memoire.
Un skill ne doit pas choisir seul une surface complexe.
Le recommendation tool ne doit pas executer une operation.
Toute modification produit depuis le chat exige une confirmation user.
Le dispatcher ne doit pas porter la logique fine de recommandation.
Product help sert a expliquer, pas a pousser une opportunite cachee.
Safety override tout.
Le runtime Memory V2 reste leger.
Le memorizer reste async.
```
