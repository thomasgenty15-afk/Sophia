# flow_opportunity_verification - Local Dispatcher Doctrine Audit And Plan

Reference lue integralement avant audit:
`docs/agent-playbook/New/runtime-contracts/11-local-dispatcher-doctrine.md`

Scope: `flow_opportunity_verification`, le flow local de verification courte
d'une opportunite implicite deja choisie par un dispatcher source.

## 0. Brainstorming Produit

But exact du flow:
- verifier une opportunite implicite sans executer le flow cible trop vite;
- garder une ancre de confirmation stable;
- permettre des questions inline produit/status;
- lancer ou transferer vers le flow cible uniquement apres acceptation claire;
- sortir proprement si le user refuse, repousse, change de sujet ou declenche
  safety.

Etats utiles:
- `offered`: proposition initiale visible;
- `waiting_confirmation`: attente d'un oui/non, d'une revision, ou d'une question;
- `explaining_inline`: un inline tool vient de repondre, l'ancre reste active;
- `revising`: le user corrige le focus ou le target flow;
- `handoff_ready`: le flow cible peut reprendre avec note_information;
- `declined|cancelled|deferred|completed`: stop local sans global;
- `exit_to_global`: sujet clair hors flow;
- `safety_preempt`: safety reprend;
- `blocked`: contrat invalide ou cible non supportee.

Decisions a stabiliser:
- `target_flow`, `target_kind`, `target_action`;
- `target_context` et `confirmation_anchor`;
- consentement: absent, vague, accepte, refuse, revise;
- inline tool requis: `product_help` ou `status_recap`;
- stop local vs exit global vs safety vs handoff local;
- note_information pour tout changement d'owner.

Reponses user possibles:
- acceptation directe ou tardive: "oui", "vas-y", "fais le changement";
- refus: "non", "pas maintenant";
- abandon simple: "laisse tomber", "oublie";
- revision: "plutot ma defense", "pas ca, les preferences";
- question produit: "c'est quoi une carte d'attaque ?";
- question DB/status: "qu'est-ce qui est actif ?";
- repetition: "tu proposais quoi ?";
- autre sujet clair: "aide-moi a prioriser";
- safety: crise, danger, auto-dommage, urgence.

Inline tools:
- `product_help`: explication produit sans ownership final;
- `status_recap`: lecture DB/status inline, read-only.

Passages vers un autre dispatcher:
- `handoff_to_local_flow`: acceptation du target flow;
- `exit_to_global_dispatcher`: nouveau sujet clair;
- `safety_preempt`: dispatcher local safety;
- `stop_local_no_handoff`: aucun autre dispatcher sur le meme tour.

Passages entrants:
- dispatcher global choisit une `flow_opportunity`;
- eventuellement un autre flow local peut deleguer une verification
  d'opportunite; il doit fournir une note_information inbound.

Micro-memoire:
- non chargee par defaut. Ce flow est une `verification_opportunities`;
- exception V1 seulement si l'opportunite cible un objet/action deja identifie
  et que le flow cible beneficie vraiment de 1 ou 2 items memoire. La memoire
  reste pour le dispatcher, jamais brute dans le visible prompt.

## 1. Diagnostic Du Flow Actuel

Ce qui respecte deja la doctrine:
- etat local dedie dans `state.ts`;
- branche active dans `router/run.ts` qui bloque le dispatcher global normal;
- dispatcher local structure en JSON dans `prompt.ts`;
- reducer qui valide statuts, target flow, low confidence launch et inline tool;
- ancre de confirmation preservee dans les cas heureux;
- `product_help` et `status_recap` appeles inline sans effet durable;
- flow lui-meme ne commit pas de DB write.

Ce qui diverge:
- premiere activation sans `note_information` consommee par le dispatcher local;
- contract sortie legacy: `local_action`, `exit_memo`, `visible_task.instruction`
  au lieu de `flow_action`, `visible_task.conversation_context`,
  `note_information`;
- visible agent unique generaliste avec `stageInstruction` et fallback template;
- visible agent recoit `local_state` brut au lieu d'un `conversation_context`
  filtre;
- `stop_local_no_handoff` n'existe pas explicitement;
- `safety_preempt` devient un blocage/local visible, pas une transition vers
  `safety_crisis` avec note;
- acceptation du target flow lance directement le runtime cible avec TurnFrame
  synthetique, sans `note_information` explicite consommee par le dispatcher
  cible;
- inline product/status passent par contexte ad hoc, pas par note_information;
- `origin.user_message`, `turn_count` et `recent_user_messages` peuvent deriver
  apres inline product help;
- QA reelle: l'opportunity `update_coach_preferences` fonctionne, mais
  `status_recap.attack_card_uncertainty` n'est pas produite par le global sur le
  wording canonique.

Legacy a supprimer:
- `exit_memo` comme objet principal de transition;
- `visible_task.instruction`;
- `fallbackVisibleMessage` dans le chemin nominal;
- lancement cible direct sans note;
- presentation visible depuis `local_state` brut.

Risques:
- oui tardif interpretable correctement aujourd'hui sur un happy path, mais
  fragile si l'etat derive;
- safety non conforme;
- QA difficile car la trace ne prouve pas note_information pour chaque ownership
  change;
- visible messages peuvent inventer ou exposer trop de contexte.

## 2. Architecture Cible

Runtime cible:

```txt
message user
-> active flow detected
-> db_context_pack loaded
-> micro_memory_context empty by default
-> flow_opportunity local dispatcher
-> reducer validates + patches state
-> visible_task.conversation_context
-> stage-specific visible prompt
-> message visible
```

Changement d'owner:

```txt
source local dispatcher
-> flow_action=handoff_to_local_flow|exit_to_global_dispatcher|safety_preempt
-> note_information
-> target dispatcher consumes note
-> target reducer
-> target conversation_context
-> target visible prompt
```

Dispatcher local:
- recoit input standard doctrine;
- decide uniquement une sortie structuree;
- ne rend jamais de message;
- ne lance jamais d'effet durable;
- distingue explicitement stop local, exit global, safety, inline et handoff.

Reducer:
- valide le JSON;
- refuse tout handoff sans note_information;
- construit `conversation_context`;
- preserve `origin` et `confirmation_anchor`;
- incremente les compteurs une seule fois par tour user;
- produit une suite exacte pour chaque `flow_action`.

Conversation context:
- filtre le `db_context_pack`, la note inbound et l'etat local;
- expose seulement ce que le prompt visible doit dire;
- ne contient pas de memoire brute.

Transitions:
- `get_info_product`: note_information vers `product_help`, retour parent;
- `get_info_db`: note_information vers `status_recap`, retour parent;
- `handoff_to_local_flow`: note vers target flow;
- `exit_to_global_dispatcher`: note vers global;
- `safety_preempt`: note vers `safety_crisis`;
- `stop_local_no_handoff`: message local court, clear/defer state, pas de global.

## 3. Contrat JSON Du Dispatcher Local

Actions V1:
- `offer_opportunity`
- `insufficient_response`
- `confirm_acceptance`
- `revise_focus`
- `correct_target_flow`
- `repeat_current_state`
- `get_info_product`
- `get_info_db`
- `handoff_to_local_flow`
- `stop_local_no_handoff`
- `cancel_flow`
- `defer_flow`
- `complete_flow`
- `exit_to_global_dispatcher`
- `safety_preempt`
- `blocked_or_unsupported`

Shape cible:

```json
{
  "flow_action": "offer_opportunity",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "local_state_patch": {
    "status": "waiting_confirmation",
    "target_flow": "status_recap",
    "target_context": {},
    "confirmation_anchor": {},
    "append_event": {}
  },
  "visible_task": {
    "kind": "offer_status_recap",
    "conversation_context": {
      "state_summary": "string",
      "user_words": [],
      "offer": {},
      "anchor_summary": "string",
      "tone_constraints": [],
      "do_not_say": [],
      "evidence_used": []
    }
  },
  "note_information": {
    "needed": false,
    "source_flow_id": "flow_opportunity_verification",
    "target_dispatcher": "global|product_help|status_recap|safety_crisis|...",
    "handoff_reason": "topic_change|inline_tool|bridge|safety|explicit_user_request",
    "handoff_context_for_next_dispatcher": "string",
    "structured_context": {},
    "risk_score": 0,
    "no_chat_mutation": {}
  },
  "safety": {
    "preempt": false,
    "reason_codes": [],
    "evidence": []
  },
  "no_chat_mutation": {
    "db_write_committed": false,
    "executable_confirmation_generated": false
  },
  "evidence": []
}
```

Chaque note_information doit couvrir: source_flow, target_dispatcher,
handoff_reason, user_message_summary, active_flow_summary, collected_state,
unresolved_questions, confidence, evidence, recommended_next_focus.

## 4. Prompts Conversationnels Necessaires

- `offer_status_recap`: propose un recap read-only; recoit surface/focus, user
  words, raison, ancre; ne rend jamais le recap.
- `offer_preference_update`: propose d'ajuster une preference; recoit preference
  candidate et valeur proposee; ne dit jamais que c'est modifie.
- `offer_emotional_repair`: propose un soutien emotionnel court; pas de
  diagnostic, pas de plan force.
- `offer_demotivation_repair`: propose un reset/remobilisation; pas
  d'hypothese verrouillee.
- `offer_target_flow_generic`: offre pour cible non specialisee; ne promet pas
  de capacite non fournie.
- `insufficient_response_reanchor`: user vague; rappelle l'offre et demande une
  confirmation simple.
- `repeat_offer`: redit l'offre initiale depuis l'ancre.
- `reanchor_after_inline_product`: apres product_help si le user revient; ne
  reroute pas.
- `reanchor_after_inline_status`: apres status_recap inline si utile.
- `revise_focus_question`: demande ou confirme le nouveau focus; ne choisit pas
  librement une autre opportunite.
- `correct_target_flow_ack`: accuse reception avant handoff ou sortie; pas
  d'execution.
- `handoff_ready`: court message optionnel si le target flow ne rend pas le meme
  tour; ne revendique aucun effet final.
- `launch_blocked`: explique que le transfert n'est pas possible maintenant.
- `stop_local_no_handoff`: acknowledgement court, pas de question finale.
- `exit_ack`: seulement si le meme message ne sera pas reprocess par global.
- `safety_transition`: met le flow de cote et transmet a safety.

Chaque prompt recoit uniquement `visible_task.conversation_context` et les
contraintes communes de ton. Il ne recoit pas `local_state`, `db_context_pack`
ou `micro_memory_context` bruts.

## 5. Contexte A Injecter

`db_context_pack` commun:
- opportunity payload: id, target_flow, target_kind, confidence, priority,
  reason, evidence, seed_context;
- active flow state compact: status, anchor summary, target_context,
  subskill_history summaries;
- supported targets et inline tools;
- target capability summary;
- source/evidence/confidence/status sur chaque champ important.

Packs par cible:
- `status_recap`: surfaces disponibles et snapshot compact des objets cibles
  seulement; le recap final lit sa propre DB projection.
- `update_coach_preferences`: preferences actuelles concernees et derniere
  valeur connue.
- cards/reminders/plan/potions: ids/labels candidats et statut compact si deja
  fournis par le seed context.
- `product_help`: surface produit demandee, question exacte, parent flow.

`micro_memory_context`:
- par defaut: absent / `{items: [], budget: {max_items: 0}}`;
- justification: `verification_opportunities` ne doit pas charger de memoire
  par defaut; il verifie une opportunite deja choisie;
- exception: max 1-2 items si la note inbound ou seed_context cible un objet
  precis dont le flow cible depend et que l'information est proche du tour;
- exclusions: pas de profil global, pas de dump memoire, pas de safety memory
  hors `safety_preempt`, jamais transmis brut au visible prompt.

## 6. Invariants QA

- Global dispatcher skipped while `flow_opportunity_verification` is active.
- No business regex and no `message.includes(...)` routing.
- No deterministic visible renderer/template in the nominal path.
- No single generic conversation agent for all stages.
- Every `flow_action` has one exact continuation.
- `stop_local_no_handoff` does not call global.
- `exit_to_global_dispatcher` includes note_information.
- `safety_preempt` routes to safety local dispatcher with note_information.
- `handoff_to_local_flow` includes note_information consumed by target.
- Inline product/status preserves parent flow and anchor.
- Conversation agent only uses `visible_task.conversation_context`.
- `micro_memory_context` is minimal and never leaked raw to visible prompt.
- `origin.user_message` remains the initial opportunity message.
- `turn_count` increments once per user turn.
- Late "yes" after inline help confirms the original anchor.
- Accepted target flow owns its own writes and visible claims.

## 7. Plan D'Implementation

Ordre recommande:

1. Types/contrats
   - Modifier `skills/flow_opportunity_verification/contract.ts`.
   - Ajouter `FlowOpportunityConversationContext`,
     `FlowOpportunityNoteInformation`, `FlowOpportunityDbContextPack`.
   - Remplacer progressivement `exit_memo` par `note_information`.

2. Input dispatcher
   - Modifier `prompt.ts` pour l'input standard doctrine:
     `current_user_message`, `recent_messages`, `active_flow_state`,
     `note_information_inbound`, `db_context_pack`, `micro_memory_context`,
     `platform_context`, `risk_context`, `available_inline_tools`, `timezone`,
     `channel`.
   - Ajouter les actions manquantes: `stop_local_no_handoff`,
     `handoff_to_local_flow`, `defer_flow`, `complete_flow`.

3. Reducer
   - Construire `visible_task.conversation_context`.
   - Enforcer note_information pour exit/global, safety, inline et handoff.
   - Corriger preservation `origin`, `turn_count`, `recent_user_messages`.
   - Bloquer tout handoff sans target dispatcher explicite.

4. Prompts visibles
   - Remplacer `visible_agent.ts` par une collection stage-specific
     (`visible_prompts.ts` ou sous-dossier `visible_prompts/`).
   - Chaque prompt recoit seulement `conversation_context`.
   - Supprimer les fallbacks templates du chemin nominal; en echec LLM, utiliser
     une clarification safe minimale sans decision metier.

5. Runtime
   - Charger `db_context_pack` avant dispatcher.
   - Garder `micro_memory_context` vide par defaut.
   - Premiere activation: creer/consommer une note_information depuis global.
   - Inline tools: produire note_information puis restaurer l'etat parent.
   - Target flow: passer par `handoff_to_local_flow` avec note_information.
   - Safety: appeler/brancher le dispatcher safety local, pas global.
   - Logs: `local_dispatcher_called`, `local_dispatcher_result`,
     `flow_action`, `visible_task.kind`, `note_information_created`,
     `note_information_consumed`, `db_context_pack_loaded`,
     `global_dispatcher_skipped`, `inline_tool_roundtrip`,
     `local_stop_no_handoff`, `risk_score`.

6. Integration global/TurnFrame
   - Corriger la production canonique `flow_opportunity` pour
     `status_recap.attack_card_uncertainty`.
   - Garder les guards directs: une demande explicite status reste
     `status_recap`, pas verification.

Tests unitaires:
- selection `status_recap` implicite vs direct status;
- initial activation with note;
- product_help inline preserves anchor;
- status_recap inline preserves anchor;
- late yes launches target via note;
- stop_local_no_handoff does not call global;
- exit global requires note;
- safety requires note to `safety_crisis`;
- state counters/origin stable;
- invalid JSON safe handling;
- no deterministic renderer nominal;
- visible prompts receive only conversation_context.

Tests IA reels:
- "Je sais plus ce qu'il y a dans ma carte d'attaque" -> offer status recap.
- Product question inside active opportunity -> inline product, anchor stable.
- Late yes -> target flow launched from anchor.
- "laisse tomber" -> local stop, no global.
- "aide-moi a prioriser" -> exit global with note.
- Safety phrase during active flow -> safety local dispatcher with note.
- Revision "ma carte de defense plutot" -> revised context or target handoff.

Critere de validation:
- QA verdict green on status_recap and update_coach_preferences opportunities;
- traces show skipped global while active;
- every dispatcher transition has note_information;
- no raw memory/local_state in visible prompt input;
- no durable claim unless target flow commits.
