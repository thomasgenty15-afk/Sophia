# flow_opportunity_verification Dispatcher And Visible Prompts

## Objectif

`flow_opportunity_verification` est un flow local de verification courte pour
les opportunites detectees par le dispatcher global quand le user n'a pas fait
une demande explicite.

Il sert a proposer le bon flow, garder l'ancre de confirmation, repondre aux
questions produit via `product_help` comme sub-skill non-mutant, puis lancer le
flow cible si le user accepte.

Ce document decrit :

- le payload attendu du dispatcher global ;
- le prompt du dispatcher local ;
- les actions JSON du dispatcher local ;
- les prompts visibles vers lesquels il route ;
- les signaux de sortie vers le dispatcher global.

## Regles Architecturales

- Pendant un `flow_opportunity_verification` actif, le dispatcher global est
  suspendu.
- Le dispatcher global ne reprend la main que si le dispatcher local retourne
  explicitement `exit_to_global_dispatcher`.
- `product_help` peut etre appele comme sub-skill inline, mais il ne devient pas
  owner du flow.
- Apres un appel `product_help`, le flow revient a
  `flow_opportunity_verification` avec la meme ancre de confirmation.
- Un "oui" tardif apres plusieurs questions produit continue de pointer vers
  l'opportunite initiale, sauf correction explicite du user.
- Le flow ne mute jamais directement. Il lance seulement le flow cible, qui
  reste proprietaire de son metier, de ses validations et de ses effets.
- Aucun prompt visible ne choisit de flow, ne mappe de champ et ne valide de
  mutation.
- Pas de regex metier, pas de `message.includes(...)` metier, pas de renderer
  visible decideur, pas de reducer qui interprete le message user.
- Pas de deuxieme decideur cache. Les decideurs declares sont :
  - dispatcher global : detecte la route directe ou la top opportunity initiale ;
  - dispatcher local `flow_opportunity_verification` : gere la verification
    locale, les questions produit inline, l'acceptation, le refus, la revision
    et la sortie ;
  - sub-skill `product_help` : explique le produit depuis son catalogue, sans
    choisir ni lancer le flow final ;
  - flow cible : gere son propre metier apres lancement.

## Distinction Direct Route / Opportunity

Demandes explicites :

```txt
"Tu peux me dire mes preferences coach actives ?"
-> direct_skill: status_recap

"Elle dit quoi ma carte d'attaque ?"
-> direct_skill: status_recap

"C'est quoi une carte d'attaque ?"
-> direct_skill: product_help

"Prepare-moi une carte d'attaque"
-> direct_skill: prepare_attack_card
```

Demandes implicites :

```txt
"Je sais plus ce que j'ai comme carte d'attaque"
-> flow_opportunity: status_recap.attack_card_uncertainty
-> verification locale

"Tu me poses trop de questions en ce moment"
-> flow_opportunity: update_coach_preferences.question_tendency
-> verification locale

"Je suis en train de decrocher"
-> flow_opportunity: demotivation_repair
-> verification locale
```

## Payload Du Dispatcher Global

Quand le global choisit une opportunity, il doit fournir un contexte suffisant
pour que le flow local n'ait pas a refaire le raisonnement initial.

Exemple `status_recap` implicite :

```json
{
  "route_kind": "flow_opportunity",
  "direct_skill": null,
  "normal_reply_allowed": false,
  "flow_opportunity": {
    "opportunity_id": "status_recap.attack_card_uncertainty",
    "target_flow": "status_recap",
    "confidence": "high",
    "priority": 82,
    "reason": "The user expresses uncertainty about an active attack card but does not explicitly ask for a recap.",
    "evidence": [
      "je sais plus ce qu'il y a dans ma carte d'attaque"
    ],
    "seed_context": {
      "focus": ["attack_card"],
      "surface": "attack_card",
      "status_surfaces_available": [
        "coach_preferences",
        "active_potions",
        "active_actions",
        "upcoming_actions",
        "level_state",
        "attack_card",
        "defense_card"
      ],
      "user_need": "recover current active state"
    }
  },
  "exit_memo": null
}
```

Exemple `update_coach_preferences` implicite :

```json
{
  "route_kind": "flow_opportunity",
  "direct_skill": null,
  "normal_reply_allowed": false,
  "flow_opportunity": {
    "opportunity_id": "update_coach_preferences.too_many_questions",
    "target_flow": "update_coach_preferences",
    "confidence": "medium",
    "priority": 76,
    "reason": "The user complains about too many questions, but does not explicitly ask to change durable coach preferences.",
    "evidence": [
      "tu me poses trop de questions"
    ],
    "seed_context": {
      "focus": ["coach.question_tendency"],
      "surface": "coach_preferences",
      "suggested_mapping": {
        "key": "coach.question_tendency",
        "value": "low",
        "requires_confirmation": true
      },
      "user_need": "less questioning"
    }
  },
  "exit_memo": null
}
```

## Etat Local

```json
{
  "skill_id": "flow_opportunity_verification",
  "mode": "local_verification_flow",
  "status": "offered|explaining|waiting_confirmation|accepted|declined|launched|cancelled|exit|blocked",
  "opportunity_id": "status_recap.attack_card_uncertainty",
  "target_flow": "status_recap",
  "target_action": "run_status_recap",
  "target_context": {
    "focus": ["attack_card"],
    "surface": "attack_card"
  },
  "origin": {
    "user_message": "Je sais plus ce qu'il y a dans ma carte d'attaque",
    "evidence": ["je sais plus ce qu'il y a dans ma carte d'attaque"],
    "created_at": "iso"
  },
  "confirmation_anchor": {
    "meaning": "accept target_flow status_recap with focus attack_card",
    "target_flow": "status_recap",
    "target_context": {
      "focus": ["attack_card"]
    },
    "must_not_reinterpret_acceptance_as": [
      "product_help",
      "normal_reply",
      "prepare_attack_card"
    ]
  },
  "subskill_history": [],
  "recent_user_messages": [],
  "turn_count": 1,
  "max_turns": 6,
  "created_at": "iso",
  "updated_at": "iso"
}
```

## Prompt Dispatcher Local

```txt
Tu es le dispatcher local du flow `flow_opportunity_verification`.

Ton role :
- garder l'ancre de l'opportunite initiale ;
- verifier si le user accepte, refuse, demande une explication, corrige le
  focus, corrige le flow cible, donne une commande explicite, change de sujet
  ou declenche safety ;
- appeler `product_help` comme sub-skill inline quand le user pose une question
  produit pendant la verification ;
- lancer le flow cible seulement si l'acceptation est suffisante dans le
  contexte de l'ancre courante ;
- retourner au dispatcher global seulement avec `exit_to_global_dispatcher`.

Tu recois :
- le message user courant ;
- l'etat local actif `flow_opportunity_verification` ;
- le payload initial du dispatcher global ;
- le resume des 5 derniers messages user ;
- l'historique des appels sub-skill, notamment `product_help` ;
- les surfaces disponibles du flow cible ;
- les contraintes safety/risk ;
- les flows cibles supportes.

Tu dois retourner uniquement un JSON strict conforme au contrat.

Tu ne dois jamais :
- utiliser une regex ou des mots-cles comme decision metier ;
- re-picker librement entre toutes les opportunities ;
- oublier `target_flow`, `target_context` ou `confirmation_anchor` apres une
  explication produit ;
- traiter `product_help` comme owner final ;
- creer un pending executable legacy ;
- pretendre qu'un flow cible a ete lance si tu retournes seulement un prompt ;
- lancer un flow mutatif si le user n'a pas accepte ou donne une commande
  explicite suffisante ;
- faire de write DB.

Priorites :
1. Safety/risk preempt si necessaire.
2. Commande explicite du user dans le flow actif :
   - si elle concerne le target flow, lancer ce flow avec le contexte corrige ;
   - si elle concerne un autre flow clair, retourner `direct_command_interrupt`
     ou `exit_to_global_dispatcher` selon les conventions d'integration ;
   - ne pas laisser le dispatcher global reprendre silencieusement.
3. Question produit inline : appeler `product_help` en conservant l'ancre.
4. Acceptation/refus/revision de l'offre.
5. Repetition ou re-ancrage si le user est confus.
6. Sortie globale seulement si topic change, cancel global, stale flow ou
   besoin non couvert.

Distinctions :
- "C'est quoi une carte d'attaque ?" pendant ce flow => `get_info_product`,
  puis retour au flow local.
- "Oui" apres une ou plusieurs explications produit => acceptation de
  `confirmation_anchor`, pas nouvelle decision globale.
- "Non, ma carte de defense plutot" => `revise_focus`.
- "En fait cree-moi une carte d'attaque" => commande explicite vers le flow
  `prepare_attack_card`, pas `status_recap`.
- "Au fait aide-moi a revoir mon plan" => `exit_to_global_dispatcher` avec memo.
```

## Sortie JSON Dispatcher Local

```json
{
  "local_action": "offer_opportunity|accept_opportunity|decline_opportunity|get_info_product|return_from_get_info_product|repeat_offer|revise_focus|correct_target_flow|launch_target_flow|get_info_db|direct_command_interrupt|unsupported_request_inside_flow|stale_or_already_answered|cancel_flow|exit_to_global_dispatcher|safety_preempt",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "opportunity": {
    "opportunity_id": "string",
    "target_flow": "status_recap|update_coach_preferences|emotional_repair|demotivation_repair|prepare_attack_card|prepare_defense_card|select_state_potion|one_shot_reminder|create_recurring_reminder|adjust_plan_item|unknown",
    "target_action": "string",
    "confirmation_anchor_still_valid": true,
    "reason": "string"
  },
  "target_flow_input": {
    "focus": ["string"],
    "surface": "string|null",
    "seed_context": {},
    "origin_evidence": ["string"]
  },
  "subskill_call": {
    "needed": true,
    "skill_id": "product_help|status_recap",
    "reason": "user asks an inline information round-trip",
    "context_for_subskill": {
      "origin_flow": "flow_opportunity_verification",
      "opportunity_id": "string",
      "target_flow": "string",
      "target_context": {},
      "question_to_answer": "string",
      "preserve_confirmation_anchor": true
    }
  },
  "visible_task": {
    "kind": "offer_status_recap|offer_preference_update|offer_emotional_repair|offer_demotivation_repair|offer_target_flow_generic|reanchor_offer_after_product_help|accept_and_launch_status_recap|accept_and_launch_target_flow|decline_ack|repeat_offer|revise_focus_question|correct_target_flow_ack|unsupported_inside_flow|stale_or_already_answered|cancel_or_exit|handoff_to_global|safety|none",
    "instruction": "string"
  },
  "state_patch": {
    "status": "offered|explaining|waiting_confirmation|accepted|declined|launched|cancelled|exit|blocked",
    "target_flow": "string",
    "target_context": {},
    "confirmation_anchor": {},
    "subskill_history_append": {}
  },
  "exit_memo": {
    "needed": false,
    "reason": "topic_change|cancelled|direct_command_other_flow|unsupported|stale|safety|none",
    "flow_summary": "string|null",
    "original_opportunity_id": "string|null",
    "target_flow": "string|null",
    "target_context": {},
    "handoff_hint_for_global_dispatcher": "string|null",
    "same_user_message_should_be_reprocessed": false
  },
  "evidence": ["string"]
}
```

Notes :

- `subskill_call.needed=true` implique que le runtime appelle `product_help`
  pour `get_info_product` ou `status_recap` pour `get_info_db`, puis conserve
  le flow local actif.
- `visible_task.kind="none"` est attendu pour `get_info_product` si la reponse
  visible est entierement produite par `product_help`, et pour `get_info_db` si
  elle est entierement produite par `status_recap`.
- `launch_target_flow` ne rend pas un succes visible lui-meme. Le flow cible
  produit la suite visible.
- `exit_to_global_dispatcher` doit toujours fournir `exit_memo`.

## Prompts Visibles Du Flow

Les prompts ci-dessous sont les sorties visibles proprietaires de
`flow_opportunity_verification`. Ils ne couvrent pas la reponse `product_help`
elle-meme, qui appartient au sub-skill `product_help`.

### `offer_status_recap`

But : proposer un rappel d'etat quand le user exprime un doute implicite sans
demande explicite.

Signaux :

- `target_flow=status_recap`.
- `confirmation_anchor` present.
- `focus` connu ou partiellement connu.

Contraintes :

- Ne pas rendre le recap.
- Ne pas affirmer de DB state.
- Une seule proposition claire.

### `offer_preference_update`

But : proposer d'ajuster les preferences coach quand le user exprime une
friction implicite sur le style de Sophia sans commande durable explicite.

Signaux :

- `target_flow=update_coach_preferences`.
- `seed_context.suggested_mapping` optionnel.
- confirmation requise.

Contraintes :

- Ne pas dire que la preference est modifiee.
- Ne pas mapper definitivement dans le prompt visible.
- Le flow cible validera support, durabilite et valeur.

### `offer_emotional_repair`

But : proposer une prise en charge emotionnelle quand l'opportunity detectee
est `emotional_repair`.

Signaux :

- `target_flow=emotional_repair`.
- evidence emotionnelle non safety.

Contraintes :

- Ne pas diagnostiquer.
- Ne pas prendre la place de safety.
- Proposition courte, non insistante.

### `offer_demotivation_repair`

But : proposer un flow de remobilisation quand le user montre une perte d'elan
ou un decrochage implicite.

Signaux :

- `target_flow=demotivation_repair`.
- evidence demotivation ou avoidance.

Contraintes :

- Ne pas moraliser.
- Ne pas lancer d'outil d'action sans acceptation.

### `offer_target_flow_generic`

But : proposition generique pour une opportunity supportee qui n'a pas encore
de prompt specialise.

Signaux :

- `target_flow` supporte.
- `visible_task.instruction` specifique fournie par le dispatcher local.

Contraintes :

- Ne pas inventer les capacites du flow cible.
- Ne pas promettre un effet.

### `reanchor_offer_after_product_help`

But : apres une ou plusieurs explications `product_help`, rappeler l'offre
initiale et garder l'ancre de confirmation.

Signaux :

- `subskill_history` contient au moins un appel `product_help`.
- `confirmation_anchor_still_valid=true`.
- `status=waiting_confirmation`.

Contraintes :

- Ne pas redecider le flow.
- Ne pas repasser global.
- Rappeler sobrement ce qui etait propose.

### `accept_and_launch_status_recap`

But : transition courte quand le user accepte une opportunity `status_recap`.

Signaux :

- `local_action=launch_target_flow`.
- `target_flow=status_recap`.
- `focus` fourni.

Contraintes :

- Ne pas rendre le status dans ce prompt.
- Laisser le runtime `status_recap` produire la restitution DB-grounded.

### `accept_and_launch_target_flow`

But : transition courte vers un flow cible non `status_recap`.

Signaux :

- `local_action=launch_target_flow`.
- `target_flow` supporte.
- `target_flow_input` fourni.

Contraintes :

- Ne pas pretendre que l'effet final est deja fait.
- Ne pas remplir les champs du flow cible.

### `decline_ack`

But : confirmer que Sophia ne lance pas l'opportunity si le user refuse.

Signaux :

- `local_action=decline_opportunity`.
- `status=declined`.

Contraintes :

- Pas d'insistance.
- Pas de nouvelle proposition automatique.

### `repeat_offer`

But : repeter l'offre si le user n'a pas compris ou demande de repeter.

Signaux :

- `local_action=repeat_offer`.
- `confirmation_anchor_still_valid=true`.

Contraintes :

- Ne pas ajouter de nouveau flow.
- Ne pas changer le focus sans signal user.

### `revise_focus_question`

But : demander ou confirmer le nouveau focus quand le user corrige la surface
visee mais reste dans le meme flow cible.

Signaux :

- `local_action=revise_focus`.
- `target_flow` conserve.
- `target_context.focus` incomplet ou modifie.

Contraintes :

- Une seule question.
- Ne pas lancer tant que le nouveau focus reste ambigu.

### `correct_target_flow_ack`

But : acter que le user corrige vers un autre flow cible clair.

Signaux :

- `local_action=correct_target_flow` ou `direct_command_interrupt`.
- nouveau `target_flow` supporte.

Contraintes :

- Ne pas executer un effet dans ce prompt.
- Le flow cible prend la main ensuite.

### `unsupported_inside_flow`

But : expliquer que la demande inline n'est pas couverte par l'opportunity ni
par un flow cible supporte.

Signaux :

- `local_action=unsupported_request_inside_flow`.
- pas de route cible sure.

Contraintes :

- Ne pas inventer de flow.
- Peut proposer de revenir a l'offre initiale si elle reste valide.

### `stale_or_already_answered`

But : eviter de relancer une opportunity devenue obsolete, deja traitee ou
incoherente avec la conversation recente.

Signaux :

- `local_action=stale_or_already_answered`.
- `turn_count` trop eleve, contexte contradictoire ou target deja servie.

Contraintes :

- Ne pas forcer la relance.
- Peut sortir vers global avec memo si le user a donne un nouveau sujet.

### `cancel_or_exit`

But : sortir proprement du flow local apres annulation, refus global ou topic
change clair.

Signaux :

- `local_action=cancel_flow` ou `exit_to_global_dispatcher`.
- `exit_memo.needed=true` si global doit reprendre.

Contraintes :

- Ne pas lancer le flow cible.
- Ne pas perdre le memo.

### `handoff_to_global`

But : message court quand le meme message user doit etre reprocess par le
dispatcher global apres sortie explicite.

Signaux :

- `local_action=exit_to_global_dispatcher`.
- `exit_memo.same_user_message_should_be_reprocessed=true`.

Contraintes :

- Le prompt peut etre omis si le runtime reprocess le meme message sans reponse
  intermediaire.
- Ne pas produire de reponse finale qui empeche le global de traiter le message.

### `safety`

But : laisser safety reprendre la main.

Signaux :

- `local_action=safety_preempt`.
- `risk_score` ou signal safety bloque.

Contraintes :

- Ne pas proposer d'opportunity.
- Ne pas appeler `product_help`.
- Ne pas lancer de flow cible.

## Appel `product_help` Inline

`product_help` n'est pas un prompt visible de ce flow. C'est un sub-skill
non-mutant appele quand le user pose une question produit pendant la
verification.

Contexte minimal a lui passer :

```json
{
  "origin_flow": "flow_opportunity_verification",
  "opportunity_id": "status_recap.attack_card_uncertainty",
  "target_flow": "status_recap",
  "target_context": {
    "focus": ["attack_card"],
    "surface": "attack_card"
  },
  "confirmation_anchor": {
    "meaning": "accept target_flow status_recap with focus attack_card"
  },
  "user_question": "C'est quoi une carte d'attaque ?",
  "recent_user_messages": [],
  "preserve_active_flow": true
}
```

Apres la reponse `product_help`, l'etat local reste actif :

```json
{
  "status": "waiting_confirmation",
  "confirmation_anchor_still_valid": true,
  "subskill_history_append": {
    "skill_id": "product_help",
    "surface": "attack_card",
    "question": "C'est quoi une carte d'attaque ?"
  }
}
```

## Signaux De Sortie Vers Dispatcher Global

Le local dispatcher peut sortir vers le global seulement via
`exit_to_global_dispatcher`.

Sortie topic change :

```json
{
  "local_action": "exit_to_global_dispatcher",
  "visible_task": {
    "kind": "handoff_to_global",
    "instruction": "No visible text if the same message is reprocessed immediately."
  },
  "exit_memo": {
    "needed": true,
    "reason": "topic_change",
    "flow_summary": "User left a status recap opportunity about attack card.",
    "original_opportunity_id": "status_recap.attack_card_uncertainty",
    "target_flow": "status_recap",
    "target_context": {
      "focus": ["attack_card"]
    },
    "handoff_hint_for_global_dispatcher": "Reprocess the current message as a new topic.",
    "same_user_message_should_be_reprocessed": true
  }
}
```

Sortie commande explicite autre flow :

```json
{
  "local_action": "exit_to_global_dispatcher",
  "visible_task": {
    "kind": "handoff_to_global",
    "instruction": "No visible text if the same message is reprocessed immediately."
  },
  "exit_memo": {
    "needed": true,
    "reason": "direct_command_other_flow",
    "flow_summary": "User moved from status recap opportunity to an explicit attack card creation request.",
    "original_opportunity_id": "status_recap.attack_card_uncertainty",
    "target_flow": "prepare_attack_card",
    "target_context": {
      "surface": "attack_card"
    },
    "handoff_hint_for_global_dispatcher": "Route current message as explicit prepare_attack_card request.",
    "same_user_message_should_be_reprocessed": true
  }
}
```

Sortie annulation :

```json
{
  "local_action": "cancel_flow",
  "visible_task": {
    "kind": "cancel_or_exit",
    "instruction": "Acknowledge cancellation briefly."
  },
  "exit_memo": {
    "needed": true,
    "reason": "cancelled",
    "flow_summary": "User cancelled the opportunity verification.",
    "original_opportunity_id": "string",
    "target_flow": "string",
    "target_context": {},
    "handoff_hint_for_global_dispatcher": null,
    "same_user_message_should_be_reprocessed": false
  }
}
```

Sortie safety :

```json
{
  "local_action": "safety_preempt",
  "visible_task": {
    "kind": "safety",
    "instruction": "Do not continue the opportunity. Let safety pipeline answer."
  },
  "exit_memo": {
    "needed": true,
    "reason": "safety",
    "flow_summary": "Opportunity verification interrupted by safety.",
    "original_opportunity_id": "string",
    "target_flow": "string",
    "target_context": {},
    "handoff_hint_for_global_dispatcher": "Safety must own this turn.",
    "same_user_message_should_be_reprocessed": true
  }
}
```

## Exemples De Trajectoires

### Status Recap Implicite Avec Explications Produit

```txt
User: Je sais plus ce qu'il y a dans ma carte d'attaque.
Global: flow_opportunity status_recap.attack_card_uncertainty.
Sophia: Tu veux que je te rappelle ta carte d'attaque active ?

User: C'est quoi une carte d'attaque ?
Local: get_info_product, ancre conservee.
Sophia/product_help: explique la carte d'attaque.
Local state: waiting_confirmation, target_flow=status_recap, focus=attack_card.

User: Et la difference avec une carte de defense ?
Local: get_info_product, ancre conservee.
Sophia/product_help: explique la difference.
Local state: waiting_confirmation, target_flow=status_recap, focus=attack_card.

User: Oui je veux bien.
Local: launch_target_flow.
Target: status_recap avec focus attack_card.
```

### Correction De Focus

```txt
User: Je sais plus ce que j'ai comme carte.
Global: flow_opportunity status_recap.card_uncertainty, focus ambiguous.
Sophia: Tu veux que je te rappelle tes cartes actives ?

User: Juste la defense.
Local: revise_focus -> target_flow=status_recap, focus=defense_card.
Sophia: Ok, je te rappelle ta carte de defense.
Target: status_recap avec focus defense_card.
```

### Opportunity Preference Update

```txt
User: Tu me poses trop de questions en ce moment.
Global: flow_opportunity update_coach_preferences.too_many_questions.
Sophia: Je peux te proposer d'ajuster tes preferences coach pour poser moins de questions. Tu veux qu'on le fasse ?

User: C'est quoi les preferences coach ?
Local: get_info_product, ancre conservee.
Sophia/product_help: explique les preferences coach.

User: Oui.
Local: launch_target_flow.
Target: update_coach_preferences avec seed_context coach.question_tendency low proposal.
```

## Logs Recommandes

- `flow_opportunity_verification.local_dispatcher_called`
- `flow_opportunity_verification.global_dispatcher_skipped_due_active_flow`
- `flow_opportunity_verification.local_action`
- `flow_opportunity_verification.visible_task.kind`
- `flow_opportunity_verification.confirmation_anchor`
- `flow_opportunity_verification.get_info_product_called`
- `flow_opportunity_verification.get_info_product_returned_to_flow`
- `flow_opportunity_verification.target_flow_launched`
- `flow_opportunity_verification.exit_to_global_dispatcher`
- `flow_opportunity_verification.exit_memo`

## Tests Requis

- Implicite status : "je sais plus ce que j'ai dans ma carte d'attaque" ->
  opportunity `status_recap`, pas direct recap.
- Explicite status : "elle dit quoi ma carte d'attaque ?" ->
  direct `status_recap`, pas opportunity.
- Explication produit directe : "c'est quoi une carte d'attaque ?" ->
  direct `product_help`, pas opportunity.
- Explication produit inline pendant opportunity -> `product_help` appele,
  `confirmation_anchor` conservee, global dispatcher skippe.
- "Oui" apres 4 questions produit -> lance le target flow initial correct.
- Correction focus : "non la defense" -> conserve `status_recap`, focus
  `defense_card`.
- Commande explicite autre flow : "en fait cree-moi une carte d'attaque" ->
  sortie ou interruption structuree vers `prepare_attack_card`.
- Refus : "non laisse tomber" -> pas de target flow, pas de write.
- Topic change -> `exit_to_global_dispatcher` avec memo et reprocess selon
  besoin.
- Safety -> safety preempt, pas de product_help, pas de target flow.
