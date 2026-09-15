# WhatsApp Onboarding Local Dispatcher Doctrine Audit Plan

Reference lue integralement avant audit :
`docs/agent-playbook/New/runtime-contracts/11-local-dispatcher-doctrine.md`.

Scope : flow local `whatsapp_onboarding`.

Ce document est un plan d'audit et de correction. Il ne decrit pas une
architecture ideale exhaustive ; la cible V1 est fiabilite, efficacite,
fluidite conversationnelle, suppression du legacy rigide, et stabilisation
rapide du flow.

## 0. Brainstorming Produit Avant Technique

### But exact du flow

`whatsapp_onboarding` gere le passage entre la fin de l'onboarding web/plan et
le demarrage utile sur WhatsApp.

Le flow doit :

- attendre que le plan soit disponible quand il ne l'est pas encore ;
- reprendre automatiquement la calibration WhatsApp quand le plan devient pret ;
- collecter trois preferences minimales de coaching ;
- demander un feedback court sur la creation du plan ;
- choisir le premier sujet : commencer par le plan ou laisser un autre sujet
  clair reprendre ;
- proteger le chat contre les faux logs de progression pendant ce flow.

Le flow ne sert pas a coacher longuement, refaire le plan, creer des objets,
logger une action, ou remplacer le dispatcher global une fois l'onboarding
termine.

### Etats possibles

Etats produits deja presents :

- `awaiting_plan_finalization`
- `awaiting_plan_finalization_support`
- `onboarding_pref_tone`
- `onboarding_pref_challenge`
- `onboarding_pref_questions`
- `onboarding_plan_creation_feedback`
- `onboarding_topic_choice`

Etats conceptuels a stabiliser dans le contrat :

- `plan_wait`
- `plan_ready_resume`
- `pref_tone`
- `pref_challenge`
- `pref_questions`
- `plan_feedback`
- `topic_choice`
- `stopped_after_plan_ready`
- `completed`
- `inline_tool`
- `handoff`
- `safety`
- `technical`

### Champs ou decisions a stabiliser

- readiness plan : `missing|generating|ready_pending_activation|active|unknown`
- stage onboarding courant ;
- preference courante cible ;
- preference update : `missing|ambiguous|proposed|locked|skipped` ;
- feedback plan : `missing|positive|negative|mixed|skipped|unclear` ;
- topic choice : `plan|other_topic|skip|unclear|missing` ;
- progress/apply attempt pendant onboarding ;
- sortie via dispatcher global ;
- exit global avec note information ;
- handoff vers dispatcher local cible ;
- safety preempt ;
- no-chat-mutation : aucun progress item, aucun pending, aucun token.

### Reponses user possibles

- confirmation que le plan est pret : "c'est bon", "le plan est pret" ;
- phrase composite : "plan pret + j'ai deja fait une action" ;
- reponse preference claire : "directe", "un mix", "creuse un peu" ;
- reponse nuancee : "equilibre, mais recadre-moi si je tourne autour du pot" ;
- reponse insuffisante : "bof", "comme tu veux" ;
- inconnue cooperative : "je sais pas" ;
- refus du flow sans nouveau sujet clair : "laisse tomber", "arrete tes
  questions", "pas maintenant" ;
- changement de sujet clair : "laisse ca, aide-moi a prioriser", "aide-moi avec
  mon planning" ;
- demande produit inline : "ou est-ce que je vois ca ?", "comment je change ce
  reglage ?" ;
- demande statut DB inline : "est-ce que mon plan est pret ?", "quelles
  preferences sont notees ?" ;
- demande action/apply/progress : "ok logge-le", "j'ai fait l'action" ;
- safety : detresse, danger, crise, auto-agression, urgence.

### Signaux d'exit

Doctrine importante :

- `exit_to_global_dispatcher` : user veut juste arreter le flow sans nouveau sujet
  clair. Reponse locale courte, pas de global sur le meme tour.
- `exit_to_global_dispatcher` : nouveau sujet clair. Note information
  obligatoire, puis global reanalyse le message avec la note.
- `safety_preempt` : note information vers `safety_crisis.local_dispatcher`, pas
  de dispatcher global normal.
- `handoff_to_local_flow` : autre dispatcher local cible explicite, note
  information obligatoire.

Application au flow :

- plan pas pret + refus : rester local, `blocked_exit_before_plan_ready`.
- plan pret + refus sans nouveau sujet : `exit_to_global_dispatcher` avec
  `stopped_after_plan_ready`, clear/defer onboarding, message local court.
- plan pret + nouveau sujet clair : `exit_to_global_dispatcher` avec note.
- safety : `safety_preempt` avec note vers safety.

### Signaux safety

Le dispatcher local doit pouvoir preempter :

- risque suicidaire ou auto-agressif ;
- menace immediate ;
- panique critique ou detresse intense ;
- violence / danger ;
- signal safety explicite pendant une question onboarding.

Le flow ne doit pas passer par global normal. Il doit produire une note
information vers `safety_crisis`.

### Inline tools possibles

V1 sobre :

- `get_info_product` / `product_help` : seulement question produit/navigation
  pendant le flow, sans effacer le parent flow.
- `get_info_db` / `status_recap` : question read-only sur plan/prefs/statut.

Pas de micro-tool pour logger une action pendant onboarding. Si le user demande
une mutation ou dit avoir progresse, le local flow bloque `track_progress` et
repond depuis le stage courant ou stoppe localement selon l'intention.

### Passages vers un autre dispatcher

- vers global : uniquement si sujet clair hors onboarding ;
- vers safety : toute safety ;
- vers product_help/status_recap : inline roundtrip, parent flow conserve ;
- vers select_state_potion ou emotional/demotivation repair : seulement si le
  user demande clairement un soutien d'etat distinct et que le plan est pret ;
  V1 peut laisser global router via note si le bridge direct n'est pas encore
  implemente.

### Passages depuis un autre flow

Le flow peut etre active par :

- webhook WhatsApp avec `whatsapp_state` onboarding ;
- detection plan pret apres `awaiting_plan_finalization` ;
- dispatcher global qui decide de lancer l'onboarding WhatsApp ;
- autre flow qui termine et doit reprendre l'onboarding WhatsApp.

Doctrine : toute activation depuis un autre dispatcher doit inclure une note
information inbound. L'activation par evenement systeme interne doit fournir un
contexte equivalent.

### Prompts conversationnels stage-specific necessaires

Le flow a un etat actif multi-tours ; il ne doit pas utiliser un seul agent
visible generaliste. Les prompts V1 necessaires sont :

- `plan_wait`
- `plan_ready_resume_preferences`
- `ask_tone`
- `preference_saved_next_challenge`
- `preference_saved_next_questions`
- `preference_skipped`
- `ask_plan_feedback`
- `ask_topic_choice`
- `complete_to_plan`
- `blocked_exit_before_plan_ready`
- `stop_after_plan_ready`
- `repeat_question`
- `inline_product_return`
- `inline_status_return`
- `progress_attempt_blocked`
- `technical_blocked`

`exit_to_global_dispatcher`, `handoff_to_local_flow`, et `safety_preempt` ne
doivent pas produire de prompt visible source. Le dispatcher cible consomme la
note et produit son propre visible.

### Contexte DB utile

Utile au dispatcher :

- `profiles.whatsapp_state`, onboarding web complete, opt-in WhatsApp ;
- marqueur `__whatsapp_onboarding_done` / defer / stop ;
- plan projection compact : status, titre, resume user-facing, premiers items ;
- preferences coach actuelles et source (`explicit_user|system_default`) ;
- recent messages WhatsApp ;
- timezone/channel ;
- inbound note information si le flow est active par un dispatcher.

Inutile ou dangereux :

- dump de plan complet ;
- historique long de messages ;
- memoire globale de profil ;
- action/progress history exhaustive ;
- raw DB pour visible agent.

### Micro memory context

Decision V1 : pas de `micro_memory_context` par defaut pour
`whatsapp_onboarding`.

Justification :

- c'est un flow de demarrage produit, pas un flow de reparation emotionnelle ;
- le contexte utile est DB/produit compact et messages recents ;
- une micro-memoire pourrait polluer les preferences ou faire affirmer des
  choses non dites dans le tour ;
- les tests recents montrent le bug sur handoff/stop, pas sur manque de memoire.

Exception possible future : au stage `topic_choice`, une micro-memoire de 0 a 2
items pourrait aider si le user dit "l'autre sujet dont je parlais", mais ce
n'est pas necessaire pour la V1.

## 1. Diagnostic Du Flow Actuel

### Ce qui respecte deja la doctrine

- Un module local existe : `supabase/functions/whatsapp-webhook/onboarding/`.
- Le webhook appelle le local flow quand `whatsapp_state` est onboarding.
- Le dispatcher local est appele via `whatsapp_onboarding.local_dispatcher`.
- Le reducer applique des sorties structurees et bloque
  `allow_track_progress_plan_item=false`.
- Les preferences sont ecrites uniquement depuis `preference_updates.locked`.
- Les runs reels ont confirme : aucun `user_plan_item_entries` pendant le flow.
- Le plan non pret bloque l'exit et conserve `awaiting_plan_finalization`.

### Ce qui diverge

- `frustration_exit_after_plan_ready` est traite comme
  `exit_to_global_dispatcher`, alors que la doctrine classe "arrete tes
  questions / laisse tomber" comme `exit_to_global_dispatcher` sans global.
- Le contrat de sortie n'a pas de `exit_to_global_dispatcher`, `get_info_product`,
  `get_info_db`, `handoff_to_local_flow`, `apply_attempt/progress_attempt`.
- Le JSON actuel expose `visible_task.required_data`, pas
  `visible_task.conversation_context`.
- Il n'y a pas de `note_information` canonique ; il reste un `exit_memo`
  legacy, incomplet en run reel.
- `safety_preempt` retourne `handled=false`, ce qui laisse potentiellement le
  global normal reprendre au lieu de passer a `safety_crisis.local_dispatcher`
  avec note.
- L'agent visible est un seul module avec `stageInstruction()` ; il est
  source-specific, mais encore trop proche d'un agent conversationnel unique.
- L'agent visible recoit `planProjection`, `decisionRequiredData` et le message
  user, plutot qu'un `conversation_context` filtre.
- Un fallback visible technique en code construit un message user-facing fixe.
- Les anciennes branches `onboarding_pref_*` dans `handlers_onboarding.ts`
  restent comme legacy rigide, meme si le chemin local les capture avant.
- Les tests actuels valident une expectation obsolete :
  "plan ready allows frustration exit with global handoff memo".

### Legacy a supprimer ou contourner

- `inferTonePreference`, `inferChallengePreference`, `inferQuestionPreference`
  et branches legacy associees dans le chemin nominal.
- `replyWithGuidedOnboardingBrain` pour states onboarding captures par le local
  flow.
- `exit_memo_request` comme contrat principal de handoff ; le remplacer par
  `note_information`.
- Tout fallback visible construit par code dans le chemin nominal.
- Toute hypothese "frustration apres plan pret = global".

### Risques

- UX : contradiction directe si le global repose une question apres un refus de
  questions.
- Systeme : changement de dispatcher sans note exploitable.
- Safety : safety pourrait passer par le global normal.
- Observabilite : pas de trace DB claire `note_information_created/consumed`
  sur le webhook.
- Tests : unit tests verts peuvent masquer un run reel rouge si le contexte
  n'est pas transporte au global.

## 2. Architecture Cible

### Schema runtime

```txt
message WhatsApp
-> load active onboarding state
-> load db_context_pack compact
-> optional inbound note_information
-> whatsapp_onboarding.local_dispatcher
-> reducer
-> if owned:
     visible_task.conversation_context
     -> whatsapp_onboarding.visible.<stage>
     -> assistant message
-> if exit_to_global_dispatcher:
     clear/defer local state
     visible_task.conversation_context
     -> whatsapp_onboarding.visible.stop_after_plan_ready
     -> assistant message
     -> no global on same turn
-> if exit_to_global_dispatcher:
     clear local state
     note_information
     -> global dispatcher
-> if safety_preempt:
     note_information
     -> safety_crisis.local_dispatcher
-> if inline tool:
     note_information
     -> product_help/status_recap inline
     -> return summary
     -> parent local visible inline_tool_return
```

### Dispatcher local

Le dispatcher local devient l'unique cerveau metier du flow actif.

Input standard :

- `current_user_message`
- `recent_messages`
- `active_flow_state`
- `note_information_inbound`
- `db_context_pack`
- `micro_memory_context` vide par defaut
- `platform_context`
- `risk_context`
- `available_inline_tools`
- `timezone`
- `channel`

Il produit seulement du JSON structure.

### Reducer

Le reducer :

- valide enums, no-chat-mutation, note information obligatoire si handoff ;
- applique `whatsapp_state` ;
- ecrit les preferences explicites ;
- pose `__whatsapp_onboarding_done` ou
  `__whatsapp_onboarding_deferred_after_plan_ready` ;
- calcule `visible_task.conversation_context` ;
- bloque global et track progress si le flow reste owner ;
- refuse `exit_to_global_dispatcher` sans note information ;
- refuse `safety_preempt` sans note vers safety.

### Conversation context

Le visible agent ne recoit plus `planProjection` brute ni `decisionRequiredData`
brut.

Il recoit seulement :

```json
{
  "state_summary": "string",
  "stage": "string",
  "plan": {
    "status": "active|missing|...",
    "title": "string|null",
    "summary": "string|null",
    "first_items": ["string"]
  },
  "preference": {
    "key": "coach.tone|null",
    "label": "string|null",
    "value_label": "string|null",
    "notes": "string|null"
  },
  "missing_or_weak_values": ["string"],
  "feedback_summary": "string|null",
  "topic_choice_summary": "string|null",
  "inline_tool_summary": "string|null",
  "tone_constraints": ["string"],
  "do_not_say": ["string"],
  "evidence_used": ["string"]
}
```

### Transitions vers autres dispatchers

- `exit_to_global_dispatcher` : uniquement sujet clair, note obligatoire.
- `safety_preempt` : note vers `safety_crisis`, global normal skip.
- `handoff_to_local_flow` : cible explicite, note obligatoire.
- `get_info_product|get_info_db` : inline, note obligatoire, parent conserve.
- `exit_to_global_dispatcher` : aucune note, aucune reprise global.

## 3. Contrat JSON Du Dispatcher Local

### Actions possibles

```json
[
  "plan_not_ready_wait",
  "plan_ready_resume_preferences",
  "answer_tone",
  "answer_challenge",
  "answer_questions",
  "skip_optional_preference",
  "answer_plan_feedback",
  "answer_topic_choice",
  "repeat_current_question",
  "revise_preference",
  "progress_attempt_during_onboarding",
  "blocked_exit_before_plan_ready",
  "exit_to_global_dispatcher",
  "complete_onboarding",
  "get_info_product",
  "get_info_db",
  "handoff_to_local_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
  "technical_blocked"
]
```

### Sortie cible

```json
{
  "flow_action": "string",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "stage": "plan_wait|plan_ready_resume|pref_tone|pref_challenge|pref_questions|plan_feedback|topic_choice|stopped|completed|inline_tool|handoff|safety|technical",
  "local_state_patch": {
    "next_whatsapp_state": "string|null",
    "completion_mode": "not_done|completed|deferred_after_plan_ready|stopped_after_plan_ready|null",
    "last_question": "string|null"
  },
  "preference_updates": [
    {
      "key": "coach.tone|coach.challenge_level|coach.question_tendency",
      "status": "missing|ambiguous|proposed|locked|skipped",
      "candidate_value": "string|null",
      "locked_value": "soft|warm_direct|direct|low|balanced|high|normal|null",
      "label": "string|null",
      "notes": "string|null",
      "source": "user_message|db_context|note_information|inference",
      "confidence": "low|medium|high",
      "evidence": ["string"]
    }
  ],
  "plan_feedback": {
    "status": "missing|positive|negative|mixed|skipped|unclear",
    "summary": "string|null",
    "source": "user_message|inference",
    "confidence": "low|medium|high",
    "evidence": ["string"]
  },
  "topic_choice": {
    "status": "missing|plan|other_topic|skip|unclear",
    "summary": "string|null",
    "target_hint": "string|null",
    "confidence": "low|medium|high",
    "evidence": ["string"]
  },
  "inline_tool": {
    "requested": false,
    "target_dispatcher": "product_help|status_recap|null",
    "question_to_answer": "string|null"
  },
  "visible_task": {
    "kind": "stage_specific_kind",
    "conversation_context": {}
  },
  "note_information": {
    "needed": false,
    "source_flow": "whatsapp_onboarding",
    "source_flow_presentation": "Manages WhatsApp onboarding, plan readiness, preference calibration, and first-topic handoff. It blocks normal product exits until the plan is ready.",
    "target_dispatcher": "global|safety_crisis|product_help|status_recap|select_state_potion|other_local|null",
    "handoff_reason": "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request|none",
    "user_message_summary": "string|null",
    "active_flow_summary": "string|null",
    "collected_state": {},
    "unresolved_questions": ["string"],
    "confidence": "low|medium|high",
    "evidence": ["string"],
    "recommended_next_focus": "string|null",
    "handoff_context_for_next_dispatcher": "string|null",
    "target_local_dispatcher_hint": "string|null",
    "risk_score": 0,
    "no_chat_mutation": {}
  },
  "no_chat_mutation": {
    "plan_created": false,
    "plan_item_progress_logged": false,
    "pending_confirmation_created": false,
    "confirmation_token_created": false,
    "preference_write_requested": false
  },
  "safety": {
    "preempt": false,
    "risk_band": "none|low|medium|high|critical",
    "reason_codes": ["string"],
    "evidence": ["string"]
  },
  "evidence": ["string"]
}
```

### Important

- `exit_to_global_dispatcher` ne produit pas de note information et ne permet pas
  global.
- `exit_to_global_dispatcher`, `safety_preempt`, `handoff_to_local_flow`,
  `get_info_product`, `get_info_db` exigent une note information exploitable.
- La note ne va pas au prompt visible cible ; elle est consommee par le
  dispatcher cible.

## 4. Prompts Conversationnels Necessaires

### `plan_wait`

- Appele quand le plan n'est pas pret et le flow attend.
- Recoit : `plan.status`, `state_summary`, `do_not_say`.
- Produit : message court d'attente/synchronisation.
- Ne doit jamais : parler de preferences, router global, logguer une action.

### `plan_ready_resume_preferences`

- Appele quand le plan devient pret et preferences non terminees.
- Recoit : titre/resume plan filtre, premiere question.
- Produit : accusé court + question de ton.
- Ne doit jamais : traiter une progression mentionnee comme effet.

### `ask_tone`

- Appele si la preference de ton doit etre demandee explicitement.
- Recoit : stage, question cible.
- Produit : une question de ton.
- Ne doit jamais : choisir la valeur.

### `preference_saved_next_challenge`

- Appele apres write `coach.tone`.
- Recoit : preference saved label/value/notes.
- Produit : confirmation courte + question challenge.
- Ne doit jamais : dire que la preference reste a appliquer ailleurs.

### `preference_saved_next_questions`

- Appele apres write `coach.challenge_level`.
- Recoit : preference saved label/value/notes.
- Produit : confirmation courte + question tendance de questions.
- Ne doit jamais : transformer une nuance en valeur extreme.

### `preference_skipped`

- Appele quand le user ne sait pas mais accepte de continuer.
- Recoit : preference skippee, next stage, next question.
- Produit : ack neutre + prochaine question si necessaire.
- Ne doit jamais : culpabiliser ou quitter global.

### `ask_plan_feedback`

- Appele apres preferences terminees/skippees.
- Recoit : plan title/summary filtre.
- Produit : une question de feedback creation plan.
- Ne doit jamais : refaire les preferences.

### `ask_topic_choice`

- Appele apres feedback plan.
- Recoit : plan title, user feedback summary.
- Produit : question simple plan vs autre sujet.
- Ne doit jamais : lancer un tool ou logguer une progression.

### `complete_to_plan`

- Appele quand topic choice = plan.
- Recoit : plan title/summary/items user-facing.
- Produit : transition courte vers premiere action.
- Ne doit jamais : marquer une action comme faite.

### `blocked_exit_before_plan_ready`

- Appele quand le user refuse/interrompt avant plan pret.
- Recoit : plan status, exit attempt summary, reason.
- Produit : baisse pression + explique que le plan reste incompressible.
- Ne doit jamais : appeler global ou multiplier les questions.

### `stop_after_plan_ready`

- Appele quand le user veut juste arreter les questions apres plan pret, sans
  nouveau sujet clair.
- Recoit : plan summary, saved/skipped preferences summary, user words.
- Produit : acknowledgement court, clear/defer local, porte ouverte.
- Ne doit jamais : poser une question finale, donner une injonction d'action,
  appeler global, coacher.

### `progress_attempt_blocked`

- Appele si le user mentionne/propose de logger une progression pendant
  onboarding actif.
- Recoit : progress attempt summary, current stage.
- Produit : ack court et revient au stage local, ou defer si le user refuse.
- Ne doit jamais : creer `user_plan_item_entries` ou dire que c'est logge.

### `repeat_question`

- Appele si reponse insuffisante ou demande de repetition.
- Recoit : current question, stage, why ambiguous.
- Produit : reformulation simple.
- Ne doit jamais : refaire tout le flow.

### `inline_product_return`

- Appele apres product_help inline.
- Recoit : answer summary, parent stage, current question.
- Produit : reponse inline courte puis retour parent.
- Ne doit jamais : effacer l'etat parent.

### `inline_status_return`

- Appele apres status_recap inline.
- Recoit : DB answer summary, parent stage.
- Produit : reponse read-only puis retour parent.
- Ne doit jamais : transformer un statut en mutation.

### `technical_blocked`

- Appele si dispatcher/DB/visible path bloque.
- Recoit : technical reason, next safe action.
- Produit : message court d'incident.
- Ne doit jamais : fabriquer une completion ou un succes.

## 5. Contexte A Injecter

### `db_context_pack`

```json
{
  "profile": {
    "whatsapp_state": "string",
    "web_onboarding_completed": true,
    "whatsapp_preferences_done": false,
    "whatsapp_opted_in": true,
    "timezone": "Europe/Paris"
  },
  "plan": {
    "status": "missing|generating|ready_pending_activation|active|unknown",
    "is_ready_for_onboarding": false,
    "title": "string|null",
    "summary": "string|null",
    "first_items": ["string"],
    "evidence": ["string"],
    "freshness": "same_turn"
  },
  "preferences": {
    "coach.tone": {"value": "string|null", "source": "explicit_user|system_default|null"},
    "coach.challenge_level": {"value": "string|null", "source": "explicit_user|system_default|null"},
    "coach.question_tendency": {"value": "string|null", "source": "explicit_user|system_default|null"}
  },
  "local_markers": {
    "done": false,
    "deferred_after_plan_ready": false,
    "last_stage": "string|null"
  }
}
```

### `micro_memory_context`

V1 : `{ "items": [], "exclusions": ["not useful for whatsapp_onboarding V1"], "budget": { "max_items": 0 } }`.

Justification : recent messages + DB context pack suffisent. La micro memoire
risque de sur-interpreter les preferences ou l'intention de topic.

### Exclusions

- pas de memoire safety hors `safety_preempt` ;
- pas de profil global ;
- pas de dump plan complet ;
- pas de progression historique exhaustive ;
- pas de raw memory dans `conversation_context`.

## 6. Invariants QA

- Global dispatcher skipped while flow active.
- No regex routing.
- No deterministic renderer.
- No single generic conversation agent.
- Every `flow_action` has exact continuation.
- `exit_to_global_dispatcher` does not call global.
- `exit_to_global_dispatcher` includes note_information.
- `safety_preempt` routes to safety local dispatcher.
- Conversation agent only uses `conversation_context`.
- `micro_memory_context` is minimal and not leaked raw to visible prompt.
- `frustration/stop after plan ready` without new clear topic produces local
  acknowledgement, no question, no global.
- Plan missing + stop attempt remains local and does not clear state.
- Plan ready + clear new subject exits global with note.
- Plan ready + progress mention does not log progress while onboarding active.
- Inline product/status preserves parent flow.
- Preference writes happen only from locked structured updates.
- Visible prompt never fills preferences or topic choice.
- Invalid JSON retries or produces local safe clarification, never silent
  global fallback.
- Observability logs `note_information_created` and `note_information_consumed`
  on ownership changes.

## 7. Plan D'Implementation

### Fichiers a modifier

- `supabase/functions/whatsapp-webhook/onboarding/contract.ts`
- `supabase/functions/whatsapp-webhook/onboarding/state.ts`
- `supabase/functions/whatsapp-webhook/onboarding/local_flow.ts`
- `supabase/functions/whatsapp-webhook/onboarding/visible_agent.ts`
- `supabase/functions/whatsapp-webhook/onboarding/local_flow_test.ts`
- `supabase/functions/whatsapp-webhook/handlers_onboarding.ts`
- `docs/agent-playbook/New/runtime-contracts/tools/whatsapp-onboarding-local-dispatcher-prompts.md`
- `docs/agent-playbook/New/runtime-contracts/flow-presentation-catalog.md` si la presentation doit etre ajustee

Optionnel selon integration note globale :

- `supabase/functions/sophia-brain/contracts/note_information.v1.ts`
- `supabase/functions/sophia-brain/router/run.ts`
- webhook bridge qui appelle `replyWithBrain` apres `handled=false`

### Ordre de modification

1. Mettre a jour le contrat doc existant :
   - remplacer "frustration apres plan pret -> exit global" par
     `exit_to_global_dispatcher` sauf nouveau sujet clair ;
   - ajouter `conversation_context` et note information canonique.

2. Etendre `contract.ts` :
   - actions communes doctrine ;
   - `visible_task.conversation_context` ;
   - `note_information` canonique ;
   - statut reducer `exit_to_global_dispatcher`, `handoff_to_local_flow`,
     `inline_tool`.

3. Corriger le reducer :
   - `frustration_exit_after_plan_ready` devient
     `exit_to_global_dispatcher` si pas de nouveau sujet clair ;
   - `exit_to_global_dispatcher` uniquement si clear topic + note valide ;
   - safety route vers safety local avec note ;
   - inline tool conserve parent state.

4. Remplacer le prompt dispatcher code :
   - injecter `db_context_pack` ;
   - micro memory vide ;
   - demander `conversation_context` et `note_information` ;
   - retirer l'instruction "fatigue apres plan pret -> global".

5. Remplacer l'agent visible :
   - registry de prompts stage-specific ;
   - chaque prompt prend uniquement `conversation_context` ;
   - supprimer fallback visible fixe ; fallback = prompt `technical_blocked`.

6. Integrer note information au handoff :
   - quand global doit reprendre, transmettre la note dans la structure consommee
     par `replyWithBrain` / Sophia brain ;
   - verifier dans trace globale que `flow_exit_context` ou equivalent n'est pas
     null.

7. Supprimer ou isoler legacy :
   - branches `onboarding_pref_*` legacy hors chemin nominal ;
   - preference inference legacy non appelee par states locaux.

8. Ajouter observabilite :
   - `whatsapp_onboarding.local_dispatcher.start`
   - `whatsapp_onboarding.local_dispatcher.result`
   - `whatsapp_onboarding.reducer.reduced`
   - `whatsapp_onboarding.exit_to_global_dispatcher`
   - `whatsapp_onboarding.note_information_created`
   - `whatsapp_onboarding.safety_preempt`
   - `whatsapp_onboarding.visible_stage.start/complete`
   - `global_dispatcher_skipped`

### Tests unitaires

- Plan missing + stop attempt -> owned, blocked, no global.
- Plan active + stop without clear topic -> `exit_to_global_dispatcher`,
  mark/defer done, visible `stop_after_plan_ready`, no global.
- Plan active + clear topic -> `exit_to_global_dispatcher`, note info complete.
- Plan active + clear topic but missing note -> reducer refuses / technical.
- Safety -> target `safety_crisis`, note complete, no global normal.
- Product question inline -> note to `product_help`, parent state preserved.
- Status question inline -> note to `status_recap`, parent state preserved.
- Progress mention during onboarding -> no entry, visible
  `progress_attempt_blocked` or stage continuation.
- Preference nuanced answer -> locked main value + notes.
- Invalid preference value -> repeat question.
- No deterministic renderer nominal.
- No business regex in onboarding runtime.
- Visible agent receives no raw DB/memory context.

### Tests IA reels

- R1 happy path complet : plan pret -> preferences -> feedback -> plan.
- R2 composite : plan pret + "j'ai deja liste deux contacts" -> no progress.
- R3 stop apres plan pret : "tes questions me saoulent" -> local stop, no
  global, no question finale.
- R4 clear topic apres plan pret : "laisse ca, aide-moi a prioriser" -> global
  avec note complete.
- R5 stop avant plan pret -> blocked local.
- R6 product inline : "ou je change ce reglage ?" -> product_help inline puis
  retour stage.
- R7 status inline : "est-ce que mon plan est pret ?" -> status/local answer,
  no global.
- R8 safety pendant onboarding -> safety local dispatcher.
- R9 nuance preference challenge -> balanced + notes.
- R10 apres onboarding done, "j'ai fait l'action" -> global peut router
  `track_progress_plan_item` a nouveau.

### Criteres de validation

- Le run reel "tes questions me saoulent" apres plan pret ne produit plus de
  question A/B, pas de global trace, pas de progress entry.
- Le run reel "laisse ca, aide-moi a prioriser" produit une trace de note
  information consommee par global.
- `conversation_turn_traces` ou logs exposent le changement de dispatcher et la
  note.
- `user_plan_item_entries=[]` pendant tous les tours onboarding-owned.
- Tests unitaires + tests IA reels verts.
