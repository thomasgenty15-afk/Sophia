# Note Information Contract

## Scope

`note_information` est le contrat transverse non visible transmis quand un
dispatcher local transfere l'ownership du tour a un autre dispatcher.

Elle s'applique a toutes les transitions suivantes :

- flow local -> dispatcher global ;
- flow local -> `safety_crisis.local_dispatcher` ;
- flow local -> `product_help.local_dispatcher` appele inline ;
- flow local -> `status_recap.local_dispatcher` / `get_info_db` appele inline ;
- `emotional_repair` -> `select_state_potion.local_dispatcher` ;
- `demotivation_repair` -> `select_state_potion.local_dispatcher` ;
- proactive local flow -> dispatcher global ;
- tool local flow -> dispatcher global ;
- autre bridge direct vers un dispatcher local documente.

Elle ne s'applique pas quand le flow se ferme localement sans nouveau sujet et
sans handoff. Dans ce cas, le reducer produit une `visible_task`
d'acknowledgement, stoppe ou differe l'etat actif, et le dispatcher global ne
doit pas etre appele sur le meme tour.

Exception specialisee : le passage interne `select_state_potion -> sous-skill
potion` peut conserver son contrat structure de sous-flow. Il ne requiert pas
`note_information`, parce qu'il ne change pas de dispatcher local au sens
runtime transverse.

## Canonical JSON

```json
{
  "note_information": {
    "source_flow_id": "string",
    "source_flow_presentation": "string",
    "source_flow_state_summary": "string",
    "handoff_reason": "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request",
    "target_dispatcher": "global|safety_crisis|select_state_potion|product_help|status_recap|verification_opportunities|other_local",
    "handoff_context_for_next_dispatcher": "string",
    "target_local_dispatcher_hint": "string|null",
    "user_words": ["string"],
    "structured_context": {},
    "risk_score": 0,
    "no_chat_mutation": {
      "db_write_committed": false,
      "potion_session_created": false,
      "scheduled_checkin_created": false,
      "recurring_reminder_created": false,
      "executable_confirmation_generated": false
    }
  }
}
```

Minimum compatible legacy : si un ancien `exit_memo` existe, il doit porter ou
etre normalise vers `note_information.source_flow_presentation` et
`note_information.handoff_context_for_next_dispatcher`. Les autres champs
deviennent obligatoires des que le flow est migre vers ce contrat.

## Exit Taxonomy

`exit_to_global_dispatcher`
: autre sujet clair, demande hors flow, demande explicite d'un autre owner, ou
reprise globale autorisee par le contrat local. `note_information` obligatoire,
`target_dispatcher="global"`, stop local oui.

`safety_preempt`
: passage prioritaire vers `safety_crisis.local_dispatcher`.
`note_information` obligatoire, `target_dispatcher="safety_crisis"`, stop ou
suspend local oui selon le flow source.

`handoff_to_local_dispatcher`
: bridge direct vers un flow local cible, par exemple
`emotional_repair -> select_state_potion` ou
`flow_opportunity_verification -> prepare_attack_card`.
`note_information` obligatoire, `target_dispatcher` cible, stop local oui.

`inline_tool_roundtrip`
: appel inline a `product_help`, `status_recap` ou
`verification_opportunities` pour repondre a une question d'information, puis
retour au flow parent. `note_information` obligatoire pour l'appel entrant et
pour le retour si le sous-skill rend un resume structure. Stop local non :
l'ownership parent est preserve.

`stop_local_no_handoff`
: arret, fermeture, acknowledgement ou defer local sans nouveau dispatcher.
`note_information` interdite ou `needed=false`, stop local oui, aucun appel au
global sur le meme tour.

## Local Actions That Are Not Handoffs

Les noms exacts peuvent varier par flow, mais ils doivent appartenir a une de
ces categories :

- `stop_local_and_ack` : le user refuse, arrete, ou veut juste une fermeture ;
- `complete_and_stop` : le flow a termine son travail localement ;
- `defer_and_ack` : le flow garde ou differe un etat sans rerouter ;
- `cancel_flow_without_reroute` : annulation locale sans nouveau sujet ;
- `apply_attempt` non-mutant : le user demande d'appliquer depuis le chat, mais
  le contrat local ne permet pas l'execution ;
- `repeat_*` ou `platform_destination_followup` : reexplication locale du
  handoff deja produit.

Ces actions choisissent une `visible_task` locale. Elles ne peuvent pas appeler
le dispatcher global sur le meme message sauf si le JSON local produit aussi un
exit structure distinct.

## Dispatcher Responsibilities

Le dispatcher local produit du JSON seulement. Quand il transfere l'ownership,
il doit remplir `note_information` en plus de son action de sortie.

Il choisit `target_dispatcher` ainsi :

- `global` : sujet clairement hors flow, demande d'un autre owner non cible
  directement par le flow, ou fallback legacy de bridge ;
- `safety_crisis` : signal safety preemptif ;
- `product_help` : question produit/navigation/limite appelee inline ;
- `status_recap` : question DB/status/read-only appelee inline ;
- `select_state_potion` : bridge consenti vers potion depuis
  `emotional_repair`, `demotivation_repair`, ou autre flow qui supporte ce
  bridge explicitement ;
- `verification_opportunities` : verification inline d'une opportunite
  implicite, si le flow parent la supporte ;
- `other_local` : bridge vers un dispatcher local cible documente, avec
  `target_local_dispatcher_hint` explicite.

Le dispatcher ne doit jamais :

- produire un message visible ;
- utiliser une regex metier ou `message.includes(...)` metier ;
- router deterministiquement depuis une note recue ;
- traiter `note_information` comme un second dispatcher cache ;
- remplir les slots finaux du flow cible hors contexte source ;
- inventer un effet durable, une confirmation executable ou une mutation.

## Reducer Responsibilities

Le reducer valide le contrat et choisit la prochaine `visible_task`.

Il doit :

- refuser un changement de dispatcher sans `note_information` ;
- refuser un `target_dispatcher` incompatible avec l'action de sortie ;
- verifier que `no_chat_mutation` reste coherent avec les effets committes ;
- preserver le flow parent sur `inline_tool_roundtrip` ;
- stopper ou deferer l'etat local sur `stop_local_no_handoff` sans appeler
  global ;
- transmettre la note au dispatcher cible sans la rendre visible.

Il ne doit pas :

- reclassifier le message brut ;
- choisir un target depuis le texte de la note ;
- rendre un template user-facing ;
- laisser l'agent visible decider le routing ou les champs.

## Source Flow Presentation

`source_flow_presentation` vient du
`flow-presentation-catalog.md`. Elle doit reprendre la presentation canonique du
flow source en deux lignes maximum. Elle ne doit pas etre reformulee pour
convaincre le flow cible ni contenir d'instruction de routing.

Exemples de presentations canoniques :

- `emotional_repair` : "Repairs shame, guilt, anxiety, self-attack, relational
  tension, or acute emotional pressure. It can bridge to limited state potions
  after consent."
- `demotivation_repair` : "Repairs demotivation, fatigue, loss of meaning,
  avoidance, or overwhelm without moralizing. It may bridge to a potion after
  consent."
- `status_recap` : "Answers DB-grounded questions about what exists, is active,
  was cancelled, or recently happened. It is read-only and never mutates."

## Handoff Context

`handoff_context_for_next_dispatcher` est ecrit pour le dispatcher cible, pas
pour le user. Il doit contenir :

- ce que le flow source a deja compris ;
- ce qui a ete confirme, refuse, annule, ou rendu ;
- les contraintes a preserver ;
- les champs candidats utiles au flow cible, avec confidence si disponible ;
- ce qui manque encore ;
- le statut no-mutation ;
- si le meme message user doit etre reanalyse par le dispatcher cible.

Il ne doit pas contenir :

- un message a afficher tel quel ;
- une decision deterministe pour le flow cible ;
- une injonction a executer ou muter ;
- un claim de succes durable sans `committed_effect`.

## Transition Matrix

| Source flow | Target dispatcher | Note required | Stop local | Category |
| --- | --- | --- | --- | --- |
| any active local flow | global | yes | yes | `exit_to_global_dispatcher` |
| any active non-safety flow | safety_crisis | yes | yes | `safety_preempt` |
| any active local flow with inline product question | product_help | yes | no | `inline_tool_roundtrip` |
| any active local flow with inline DB/status question | status_recap | yes | no | `inline_tool_roundtrip` |
| any active local flow | none | no | yes | `stop_local_no_handoff` |
| `emotional_repair` | select_state_potion | yes | yes | `handoff_to_local_dispatcher` |
| `demotivation_repair` | select_state_potion | yes | yes | `handoff_to_local_dispatcher` |
| `select_state_potion` | potion subskill | no | no | internal specialized exception |
| `safety_crisis` resolved exit | global | yes | yes | `exit_to_global_dispatcher` |
| `product_help` standalone | global | yes | yes | `exit_to_global_dispatcher` |
| `product_help` inline | parent flow | yes | no | `inline_tool_roundtrip` |
| `status_recap` standalone | global | yes | yes | `exit_to_global_dispatcher` |
| `status_recap` inline | parent flow | yes | no | `inline_tool_roundtrip` |
| `flow_opportunity_verification` | target local dispatcher | yes | yes | `handoff_to_local_dispatcher` |
| `flow_opportunity_verification` | product_help/status_recap | yes | no | `inline_tool_roundtrip` |
| `daily_action_review_v1` | global | yes | yes | `exit_to_global_dispatcher` |
| `weekly_adaptive_review_v1` | global | yes | yes | `exit_to_global_dispatcher` |
| `weekly_adaptive_review_v1` | adjust_plan_item | yes | yes | `handoff_to_local_dispatcher` |
| `post_morning_nudge.action` | global | yes | yes | `exit_to_global_dispatcher` |
| `post_morning_nudge.suppressed_action` | global | yes | yes | `exit_to_global_dispatcher` |
| `post_morning_nudge.emotional_presence` | global/select_state_potion | yes | yes | `exit_to_global_dispatcher` or `handoff_to_local_dispatcher` |
| `adjust_plan_item` | global | yes | yes | `exit_to_global_dispatcher` |
| `adjust_plan_item` | product_help/status_recap | yes | no | `inline_tool_roundtrip` |
| `prepare_attack_card` | global | yes | yes | `exit_to_global_dispatcher` |
| `prepare_attack_card` | product_help/status_recap | yes | no | `inline_tool_roundtrip` |
| `prepare_attack_card` | select_state_potion | yes | yes | `handoff_to_local_dispatcher` |
| `prepare_defense_card` | global | yes | yes | `exit_to_global_dispatcher` |
| `prepare_defense_card` | prepare_attack_card/select_state_potion | yes | yes | `handoff_to_local_dispatcher` |
| `create_recurring_reminder` | global/safety_crisis | yes | yes | exit or safety |
| `create_recurring_reminder` | product_help/status_recap | yes | no | `inline_tool_roundtrip` |
| `create_recurring_reminder` | one_shot_reminder | yes | yes | local/direct-effect boundary |
| `update_coach_preferences` | global/safety_crisis | yes | yes | exit or safety |
| `update_coach_preferences` | product_help/status_recap | yes | no | `inline_tool_roundtrip` |
| `whatsapp_onboarding` | global | yes | yes | `exit_to_global_dispatcher` when contract allows exit |

## Flow-Specific Context Requirements

`emotional_repair`
: include repair summary, emotional dominance, constraints, selected potion,
prefill candidates, missing/weak context, and no-potion-session invariant.

`demotivation_repair`
: include diagnosed motivation source, durable need, selected potion, prefill
candidates, weak/missing context, and no-chat-mutation.

`safety_crisis`
: inbound notes from non-safety flows must include the source flow and deferred
tool/product attempt if any. Resolved exit notes to global must include risk
facts, deescalation/resolution facts, residual constraints, and the warning not
to resume product/tool work automatically.

`product_help`
: include answered question, grounding source ids, mode, parent flow if inline,
and the invariant that no object was created/modified/cancelled.

`status_recap`
: include last DB intent, target objects, projection summary, answer summary,
and the instruction not to treat status facts as create/modify intent.

`proactive` flows
: include source proactive event, target actions/items, local assessment,
committed effects if any, and whether the followup should be considered closed.

`tool` local flows
: include collected fields, missing fields, current stage, last platform
handoff summary, and no-chat-mutation fields relevant to the tool.

## Open Questions

- `create_recurring_reminder -> one_shot_reminder` crosses from platform
  handoff flow into a chat-executable direct effect boundary. The target should
  receive a note, but the exact `target_dispatcher` enum may need
  `one_shot_reminder` instead of `other_local`.
- `product_help inline -> parent flow` is a return to an existing owner rather
  than a new dispatcher. The contract treats the return summary as
  note-compatible context, but implementation may name it `return_to_parent`.
- Some proactive specs still model product/status as global exits. They should
  either become true inline roundtrips with notes or keep `target_dispatcher`
  global until inline support is implemented.
- `verification_opportunities` exists as an inline/opportunity flow in docs, but
  its final enum name should be aligned with runtime naming before code
  implementation.
