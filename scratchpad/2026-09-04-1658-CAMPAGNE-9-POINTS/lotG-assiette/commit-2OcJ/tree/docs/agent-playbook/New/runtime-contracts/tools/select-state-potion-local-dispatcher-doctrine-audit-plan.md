# Select State Potion - Local Dispatcher Doctrine Audit Plan

Document de reference lu en entier avant redaction:
`docs/agent-playbook/New/runtime-contracts/11-local-dispatcher-doctrine.md`.

Perimetre:

- flow parent `select_state_potion`;
- sous-flow specifique `select_state_potion.clarte`;
- dispatcher local commun des sous-skills potions:
  `rappel`, `courage`, `guerison`, `amour`, `apaisement`.

Objectif V1: fiabilite, fluidite, no mutation, suppression du legacy rigide,
et alignement strict avec le modele:

```txt
message user
-> dispatcher local
-> reducer
-> visible_task.conversation_context
-> prompt conversationnel stage-specific
-> message visible
```

## 0. Brainstorming Produit Avant Architecture

### But exact du flow

`select_state_potion` aide le user a choisir une potion d'etat et a preparer
les champs exacts a saisir dans la plateforme. Le chat ne lance jamais une
potion, ne cree jamais une session, ne programme aucun rappel, et ne genere pas
de confirmation executable.

Le resultat nominal est un handoff plateforme:

- nom exact de la potion;
- destination `Etat / Potions`;
- champs UI exacts;
- valeurs stabilisees par le user ou proposees et confirmees;
- phrase explicite que l'activation se fait dans la plateforme.

### Etats possibles

Etat parent:

- `collecting`: besoin general de potion, etat encore peu clair;
- `clarifying`: clarification entre plusieurs besoins/potions;
- `potion_selected`: potion selectionnee mais champs UI pas encore collectes;
- `detail_intake`: sous-skill potion actif;
- `handoff_delivered`: champs prets, handoff rendu;
- `repeat_handoff`: user demande de redire;
- `revise_handoff`: user corrige un champ ou la potion;
- `apply_attempt`: user demande de lancer depuis le chat;
- `exit_to_global_dispatcher`: user veut arreter sans nouveau sujet;
- `exit_to_global_dispatcher`: nouveau sujet clair;
- `handoff_to_local_flow`: autre flow local explicitement demande;
- `safety_preempt`: risque prioritaire;
- `blocked`: erreur/safety/contrat invalide.

Etat sous-skill commun:

- potion selectionnee;
- ordre de champs UI;
- statut par champ: `missing`, `proposed`, `locked`;
- detail sufficiency pour champs `free_text`;
- champ courant;
- dernier `visible_task`;
- handoff deja livre ou non;
- historique inline minimal product/status.

### Champs et decisions a stabiliser

Parent:

- est-ce une vraie demande de potion ou une demande d'explication produit;
- potion cible parmi `rappel`, `courage`, `guerison`, `clarte`, `amour`,
  `apaisement`;
- besoin de clarification entre soutien immediat, potion, action, carte, plan;
- eventuel origin bridge depuis `emotional_repair` ou `demotivation_repair`.

Sous-skills:

- `rappel`: `drift_target`, `drift_style`;
- `courage`: `avoidance_target`, `blocker_kind`;
- `guerison`: `recent_hurt`, `dominant_feeling`;
- `clarte`: `plan_meaning_loss_reason`;
- `amour`: `love_lack_context`, `love_state`;
- `apaisement`: `pressure_source`, `pressure_state`.

Chaque champ doit porter: valeur, statut, evidence user, confidence,
source, detail sufficiency si utile.

### Reponses user possibles

- demande vague: "j'aimerais une potion mais je ne sais pas laquelle";
- demande explicite de potion: "potion de courage";
- reponse a un ou plusieurs champs en un seul message;
- reponse trop pauvre: "mon echec de vendredi";
- correction multi-champ: "en fait c'est X, et ce qui bloque c'est Y";
- confirmation: "oui", "c'est ca";
- demande de repetition: "redis-moi";
- demande destination: "ou je la mets ?";
- apply attempt: "ok active-la";
- aide produit: "c'est quoi une potion ?";
- statut DB: "j'en ai deja une active ?";
- abandon: "laisse tomber", "pas de potion";
- changement clair: "aide-moi plutot a faire une carte";
- safety: ideation, danger, crise aigue.

### Signaux d'exit

- `exit_to_global_dispatcher`: abandon sans nouveau sujet. Reponse locale courte,
  pas de global sur le meme tour.
- `exit_to_global_dispatcher`: sujet clair hors potion. Note information
  obligatoire vers global.
- `handoff_to_local_flow`: cible locale explicite, par exemple
  `prepare_attack_card`, `adjust_plan_item`, `emotional_repair`.
- `safety_preempt`: note information vers `safety_crisis`, jamais global normal.
- inline `product_help` ou `status_recap`: roundtrip temporaire, parent garde
  l'etat.

### Inline tools possibles

- `product_help`: navigation, definition, limites, ou "ou est-ce dans l'app".
- `status_recap`: potions actives, sessions existantes, statut DB.

Ces roundtrips ne doivent pas effacer le flow potion actif.

### Passages entrants possibles

- global dispatcher: demande explicite de potion;
- clarification: ambiguite resolue vers potion;
- `emotional_repair`: bridge consenti vers amour/guerison/apaisement/courage;
- `demotivation_repair`: bridge consenti vers clarte/rappel/apaisement/courage;
- opportunite de flow: verification puis handoff local;
- reprise active depuis temp memory.

Chaque entree depuis un autre dispatcher doit fournir une `note_information`.

### Prompts conversationnels necessaires

Le visible ne doit pas etre un agent unique generaliste. Il faut un prompt par
stage:

- `clarify_potion_need`;
- `announce_selected_potion`;
- `ask_missing_field`;
- `ask_deeper`;
- `confirm_candidate`;
- `handoff_ready`;
- `revise_value`;
- `repeat_handoff`;
- `destination_followup`;
- `apply_attempt`;
- `inline_tool_return`;
- `stop_or_cancel`;
- `exit_ack`;
- `safety_transition`.

### Contexte DB utile

Utile pour dispatcher, pas pour le visible brut:

- catalogue canonique potions et champs UI;
- active flow state;
- potions actives ou recentes si question DB/status;
- destination produit `Etat / Potions`;
- contexte bridge entrant;
- pour `clarte` seulement: plan/deep why compact si deja disponible et
  pertinent, jamais comme fait verrouille sans evidence user.

### Micro memory

Pas de micro-memoire par defaut. Pour V1, `select_state_potion` peut fonctionner
avec recent messages, active state, note_information et DB pack compact.

Exception possible plus tard:

- 0 a 2 items maximum;
- seulement si le user reference un episode/action deja proche du thread;
- jamais transmis brut au visible;
- jamais utilise seul pour lock un champ;
- aucune memoire safety hors safety.

## 1. Diagnostic Du Flow Actuel

### Ce qui respecte deja la doctrine

- `router.ts` desactive l'ancien router executable.
- `SelectStatePotionEffect = never`; `requested_effects`, `allowed_effects`,
  `committed_effects` restent vides dans le runtime nominal.
- `runSelectStatePotionHandoffSkill` maintient un etat local multi-tour dans
  `__active_tool_skill_intake`.
- Le sous-flow commun des potions a un vrai dispatcher IA structure:
  `subskills/state_potion_subskill_flow.ts`.
- Le reducer commun gere `answer_current_field`, `confirm_proposed_field`,
  `revise_current_field`, `repeat_handoff`, `apply_attempt`, `get_info_product`,
  `get_info_db`, `cancel_flow`, `exit_to_global_dispatcher`, `safety_preempt`.
- Les champs UI par potion sont centralises dans les definitions et derives du
  catalogue front.
- `renderer.ts` est desactive pour le handoff visible, et le visible est produit
  par IA.
- Les tests couvrent deja plusieurs invariants no-mutation et anti-renderer.
- Le bridge depuis `emotional_repair` / `demotivation_repair` sait deja porter
  une `note_information` normalisee.

### Ce qui diverge

- Le visible agent recoit encore `intake_state`, `clarte_state` et
  `potion_subskill_state` bruts, au lieu de recevoir seulement
  `visible_task.conversation_context`.
- `visible_agents/agent.ts` reste un agent visible unique avec instructions
  conditionnelles par stage. La doctrine demande des prompts stage-specific.
- Les sorties de dispatcher utilisent `visible_task.required_data`, pas
  `visible_task.conversation_context`.
- Les sorties de changement de dispatcher utilisent surtout `exit_memo`;
  elles ne produisent pas une `note_information` complete avec tous les champs
  obligatoires.
- `safety_preempt` produit un blocage local visible, mais ne route pas encore
  explicitement vers le dispatcher local `safety_crisis`.
- `exit_to_global_dispatcher` n'est pas distingue de `cancel_flow`.
- `handoff_to_local_flow` n'existe pas comme action de sortie dediee.
- `runSelectStatePotionHandoffSkill` continue a recevoir une `routeDecision`
  globale et contient des exceptions de type `product_help_interrupts...` ou
  `status_recap_interrupts...`. En flow actif, ces decisions doivent etre
  requalifiees par le dispatcher local, pas par global.
- Le parent peut encore passer par l'ancien `runSelectStatePotionIntake` et
  `generatePotionSessionDraftWithAi` avant sous-skill. Pour le chemin nominal
  V1, il faut preferer: selection de potion -> sous-skill local -> handoff
  fields, sans generation de draft de session.
- Des helpers utilisent du matching textuel pour nettoyer ou valider du texte
  visible. Certains sont des guards acceptables, mais `sanitizeHandoffQuestion`
  et les fuzzy normalizations doivent sortir du chemin nominal metier ou etre
  confines a validation/observabilite.

### Legacy a supprimer ou isoler

- `runSelectStatePotionIntake` comme orchestrateur nominal de detail fields.
  Il peut rester en compat temporaire, mais le nominal doit passer par le
  local dispatcher.
- `generatePotionSessionDraftWithAi` dans le chemin nominal handoff.
- `handoffDraftFromPotionDraft` pour les nouveaux sous-skills.
- `sanitizeHandoffQuestion` dans le chemin nominal.
- `exit_memo` minimal comme contrat de transition inter-dispatcher.
- `visible_agents/agent.ts` comme agent unique generaliste.

### Risques observes

- QA Courage global: demande vague de potion avec contexte courage routee en
  `normal_reply`, puis labels non canoniques inventes. Source: entree globale
  vers `select_state_potion` pas assez prioritaire.
- QA Guerison: le visible comprend "honte", mais le champ `dominant_feeling`
  reste `culpabilite`. Source: extraction/merge ne priorise pas assez le
  dernier signal explicite du message courant.
- Risque produit: un `status_recap` ou `product_help` global peut interrompre
  un flow actif au lieu de passer par inline roundtrip local.
- Risque QA: traces `route_reason=normal_reply_default` avec
  `selected_handler=select_state_potion` rendent le diagnostic ambigu.

## 2. Architecture Cible

### Schema runtime cible

```txt
message user
-> active flow detector
-> if select_state_potion active: skip global dispatcher normal
-> select_state_potion local dispatcher
-> reducer
-> visible_task.kind + visible_task.conversation_context
-> prompt visible stage-specific
-> message Sophia
```

Entrant depuis global/clarification/bridge:

```txt
source dispatcher
-> note_information
-> select_state_potion dispatcher local parent
-> reducer parent
-> stage-specific prompt
```

Transition sortante:

```txt
select_state_potion dispatcher local
-> note_information
-> target local/global dispatcher
-> target reducer
-> target visible prompt
```

### Dispatcher local parent

Responsabilites:

- classifier la demande potion vs explication produit vs autre support;
- selectionner une potion ou demander clarification;
- construire l'etat initial du sous-skill;
- produire `handoff_to_local_flow` si le user choisit un autre support;
- produire `note_information` pour toute transition.

Le parent ne doit pas produire de message visible et ne doit pas remplir les
champs UI apres selection de potion. Une fois la potion connue, le sous-skill
local devient owner.

### Dispatcher local commun sous-skills

Responsabilites:

- interpreter le message dans le sous-flow actif;
- mettre a jour plusieurs champs si le user les donne clairement;
- proposer sans verrouiller quand la valeur est plausible mais non donnee;
- demander un approfondissement si un champ free_text est trop pauvre;
- gerer repeat, revision, destination, apply attempt, product/status inline,
  stop, exit, safety;
- produire `visible_task.conversation_context`;
- produire `note_information` pour safety, global ou child flow.

### Reducer

Responsabilites:

- valider enums, ids de champs et options canoniques;
- merger fields avec precedence claire:
  - valeur locked conservee;
  - correction user explicite remplace;
  - message courant explicite prime sur contexte precedent;
  - memoire/note seule ne verrouille pas sans confiance haute et champ copiable;
- calculer `current_field_id`;
- calculer `visible_task.kind`;
- construire `conversation_context` filtre;
- persister l'etat actif;
- ne jamais ecrire de session potion.

### Conversation context

Forme cible:

```json
{
  "state_summary": "string",
  "field_or_stage": "string|null",
  "known_values": {},
  "missing_or_weak_values": [],
  "selected_candidate": {},
  "handoff_data": {},
  "tone_constraints": [],
  "do_not_say": [],
  "context_summary": "string|null",
  "evidence_used": []
}
```

Le visible agent ne recoit plus `intake_state`, `route_decision`,
`turn_frame`, `db_context_pack`, `micro_memory_context` ni `note_information`
brute.

### Prompts conversationnels

Remplacer le prompt unique par une registry:

```txt
visible_agents/prompts/
  clarify_potion_need.ts
  announce_selected_potion.ts
  ask_missing_field.ts
  ask_deeper.ts
  confirm_candidate.ts
  handoff_ready.ts
  revise_value.ts
  repeat_handoff.ts
  destination_followup.ts
  apply_attempt.ts
  inline_tool_return.ts
  stop_or_cancel.ts
  exit_ack.ts
  safety_transition.ts
```

Chaque prompt recoit seulement `conversation_context`.

### Transitions vers autres dispatchers

- `get_info_product`: inline product_help, parent garde state.
- `get_info_db`: inline status_recap, parent garde state.
- `exit_to_global_dispatcher`: message local court, clear/defer state, pas global.
- `exit_to_global_dispatcher`: note information vers global.
- `handoff_to_local_flow`: note information vers target dispatcher local.
- `safety_preempt`: note information vers `safety_crisis`.

## 3. Contrat JSON Du Dispatcher Local

### Actions possibles

```ts
type SelectStatePotionLocalFlowAction =
  | "continue_local"
  | "missing_info"
  | "confirm_candidate"
  | "handoff_ready"
  | "revise"
  | "repeat"
  | "apply_attempt"
  | "get_info_product"
  | "get_info_db"
  | "exit_to_global_dispatcher"
  | "cancel_flow"
  | "defer_flow"
  | "exit_to_global_dispatcher"
  | "handoff_to_local_flow"
  | "safety_preempt";
```

Pour compat, les actions actuelles peuvent etre mappees:

- `answer_current_field` -> `continue_local`;
- `confirm_proposed_field` -> `confirm_candidate`;
- `revise_current_field` -> `revise`;
- `repeat_handoff` -> `repeat`;
- `platform_destination_followup` -> `get_info_product` ou `repeat` selon
  question;
- `cancel_flow` -> `exit_to_global_dispatcher` ou `cancel_flow` selon intention.

### Sortie dispatcher cible

```json
{
  "flow_action": "continue_local",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "risk_assessment": {
    "risk_score": 0,
    "risk_band": "none|low|medium|high|critical",
    "safety_preempt": false,
    "reason_codes": []
  },
  "local_state_patch": {
    "selected_potion": "rappel|courage|guerison|clarte|amour|apaisement|null",
    "fields": [
      {
        "field_id": "string",
        "status": "missing|proposed|locked",
        "candidate_value": "string|null",
        "locked_value": "string|null",
        "option_value": "string|null",
        "option_label": "string|null",
        "source": "user_message|note_information|db_context|memory|inference",
        "confidence": "low|medium|high",
        "evidence": ["string"],
        "needs_user_confirmation": false,
        "detail_sufficiency": {
          "status": "unknown|sufficient|needs_more_detail",
          "reason": "string|null",
          "followup_question": "string|null",
          "followup_asked": false,
          "followup_answered": false
        }
      }
    ],
    "revision": {
      "is_revision": false,
      "field_id": "string|null",
      "replacement_value": "string|null"
    }
  },
  "visible_task": {
    "kind": "ask_deeper",
    "conversation_context": {}
  },
  "note_information": {
    "needed": false
  },
  "inline_tool_call": {
    "needed": false,
    "target": "product_help|status_recap|null",
    "context": {}
  },
  "no_chat_mutation": {
    "potion_session_created": false,
    "recurring_reminder_created": false,
    "scheduled_checkin_created": false,
    "executable_confirmation_generated": false
  },
  "evidence": []
}
```

### `visible_task.kind`

Minimum cible:

- `clarify_potion_need`;
- `announce_selected_potion`;
- `ask_missing_field`;
- `ask_deeper`;
- `confirm_candidate`;
- `handoff_ready`;
- `revision_done`;
- `repeat_handoff`;
- `destination_followup`;
- `apply_attempt`;
- `inline_tool_return`;
- `stop_or_cancel`;
- `exit_ack`;
- `safety_transition`;
- `none`.

### `note_information`

Obligatoire si:

- `exit_to_global_dispatcher`;
- `handoff_to_local_flow`;
- `safety_preempt`;
- entree depuis global, clarification, emotional_repair ou demotivation_repair.

Forme cible:

```json
{
  "source_flow_id": "select_state_potion.rappel",
  "source_flow_presentation": "string",
  "source_flow_state_summary": "string",
  "handoff_reason": "topic_change|safety|inline_tool|bridge|clarification_resolved|flow_interruption|explicit_user_request",
  "target_dispatcher": "global|safety_crisis|product_help|status_recap|prepare_attack_card|adjust_plan_item|...",
  "handoff_context_for_next_dispatcher": "string",
  "target_local_dispatcher_hint": "string|null",
  "structured_context": {
    "selected_potion": "string|null",
    "collected_fields": {},
    "unresolved_questions": [],
    "last_visible_task": "string|null"
  },
  "risk_score": 0,
  "no_chat_mutation": {
    "db_write_committed": false,
    "potion_session_created": false,
    "scheduled_checkin_created": false,
    "recurring_reminder_created": false,
    "executable_confirmation_generated": false
  }
}
```

## 4. Liste Des Prompts Conversationnels Necessaires

### `clarify_potion_need`

- Appele quand le besoin d'etat est clair mais la potion ou le support est
  ambigu.
- Recoit: besoin resume, 2 a 3 axes de besoin, user words, contraintes.
- Produit: une seule question naturelle.
- Ne doit jamais: lister des labels produits inventes, remplir un champ.

### `announce_selected_potion`

- Appele quand une potion vient d'etre choisie.
- Recoit: label canonique, raison courte, prochain champ attendu.
- Produit: annonce breve et transition vers une question.
- Ne doit jamais: rendre un handoff complet sans champs locked.

### `ask_missing_field`

- Appele quand un champ requis manque.
- Recoit: field label UI, intention conversationnelle, valeurs connues.
- Produit: une seule question naturelle, pas un formulaire.
- Ne doit jamais: choisir une option ou remplir le champ.

### `ask_deeper`

- Appele quand un champ free_text est copiable mais trop pauvre.
- Recoit: champ, valeur actuelle, raison de faiblesse, followup question.
- Produit: une question courte de creusement.
- Ne doit jamais: demander plus d'un approfondissement par champ.

### `confirm_candidate`

- Appele quand une valeur est proposee.
- Recoit: proposition, champ, evidence, raison d'incertitude.
- Produit: demande de validation/correction.
- Ne doit jamais: verrouiller la valeur en visible.

### `handoff_ready`

- Appele quand tous les champs requis sont locked.
- Recoit: potion label, destination, champs UI exacts et valeurs exactes.
- Produit: message naturel, court, copiable.
- Ne doit jamais: dire que la potion est lancee, ajouter des champs, generer
  une session ou un texte de potion.

### `revise_value`

- Appele apres correction.
- Recoit: ancien champ, ancienne valeur, nouvelle valeur.
- Produit: ack court + champ corrige ou handoff mis a jour.
- Ne doit jamais: reouvrir tous les champs sans raison.

### `repeat_handoff`

- Appele apres "redis-moi".
- Recoit: handoff_data locked.
- Produit: repetition concise des champs.
- Ne doit jamais: redemander, reformuler les valeurs, inventer.

### `destination_followup`

- Appele apres "ou je la mets ?".
- Recoit: destination et si disponibles les champs locked.
- Produit: chemin court `Etat / Potions`.
- Ne doit jamais: passer en product_help global.

### `apply_attempt`

- Appele apres "active-la", "lance-la".
- Recoit: handoff_data, no_chat_mutation.
- Produit: refus doux d'execution + rappel destination/champs.
- Ne doit jamais: creer, confirmer, demander "oui", ou annoncer activation.

### `inline_tool_return`

- Appele apres retour product/status inline si le parent doit reprendre.
- Recoit: reponse inline resumee, state parent, prochaine etape.
- Produit: reponse utile puis reprise locale si necessaire.
- Ne doit jamais: effacer l'etat parent.

### `stop_or_cancel`

- Appele pour abandon sans nouveau sujet.
- Recoit: raison, etat a clore.
- Produit: ack court, sans question finale.
- Ne doit jamais: appeler global sur le meme tour.

### `exit_ack`

- Appele seulement si une transition explicite doit afficher un court ack
  avant handoff. Souvent, aucun visible local n'est necessaire car le dispatcher
  cible repond.
- Recoit: note summary.
- Produit: eventuel ack minimal.
- Ne doit jamais: traiter le nouveau sujet lui-meme.

### `safety_transition`

- Appele si la pipeline doit afficher un pont ultra court avant safety.
- Recoit: risk summary filtre, target safety.
- Produit: message de transition minimal.
- Ne doit jamais: pousser une potion ou la plateforme.

## 5. Contexte A Injecter

### `db_context_pack`

Nominal:

```json
{
  "source": "select_state_potion_context_pack",
  "freshness": "same_turn",
  "confidence": "high",
  "platform": {
    "surface": "Etat / Potions",
    "available_potions": [],
    "field_catalog": {}
  },
  "active_flow": {},
  "potion_status_summary": null,
  "plan_context_for_clarte": null,
  "origin_bridge_context": null
}
```

Inclure:

- catalogue potions et champs UI;
- destination plateforme;
- active handoff state;
- potions actives/recentes seulement si demande status ou si utile au
  dispatcher;
- plan/deep why compact seulement pour Clarte ou bridge demotivation;
- note_information inbound si transition locale.

Exclure:

- dump DB complet;
- historique potion brut;
- preferences globales non utiles;
- memoire safety;
- profils emotionnels.

### `micro_memory_context`

Decision V1: non charge par defaut.

Justification:

- les champs potion doivent venir du message, de l'etat actif ou d'une
  note_information;
- trop de memoire augmente le risque de verrouiller une hypothese;
- `status_recap` doit lire DB cible, pas micro-memoire;
- `product_help` n'en a pas besoin.

Exception future:

- maximum 2 items;
- uniquement si le message reference un episode/action deja proche;
- chaque item avec source, freshness, confidence, evidence;
- dispatcher seulement;
- pas de fuite brute dans `conversation_context`;
- memoire seule = candidate, jamais locked.

## 6. Invariants QA

Unitaires et architecture:

- global dispatcher skipped while `select_state_potion` active;
- no regex routing;
- no deterministic renderer nominal;
- no single generic conversation agent;
- every `flow_action` has exact continuation;
- `exit_to_global_dispatcher` does not call global;
- `exit_to_global_dispatcher` includes full `note_information`;
- `safety_preempt` routes to `safety_crisis` local dispatcher with note;
- conversation agent only receives `conversation_context`;
- `micro_memory_context` minimal and never leaked raw to visible prompt;
- inline product/status keeps parent state;
- apply attempt never creates potion/session/reminder/pending confirmation;
- repeat handoff repeats locked fields exactly;
- revision updates targeted field and preserves others;
- detail sufficiency asks one max followup per free_text field;
- message current explicit field evidence overrides older context for that
  field;
- bridge high confidence can lock only copiable values, medium proposes, low
  asks;
- `dominant_feeling` current "surtout honte" beats previous "culpabilite";
- vague global potion + fear/avoidance enters `select_state_potion`, not
  `normal_reply`.

IA reelle:

- vague potion -> select_state_potion -> clarification -> subskill;
- Courage global: "je dois envoyer un message, peur reaction" routes
  `select_state_potion`, no invented labels;
- Guerison conflict: "culpabilite" then "surtout honte" renders honte;
- `redis-moi` inside handoff -> repeat;
- `ok active-la` -> apply_attempt no mutation;
- `ou je la mets` -> destination local;
- `pas de potion` -> stop local no global;
- "laisse ca, aide-moi a prioriser" -> exit global with note;
- safety message inside flow -> safety local dispatcher.

## 7. Plan D'Implementation

### Fichiers a modifier

Contrats:

- `select_state_potion/contract.ts`
  - ajouter `ConversationContext`, `NoteInformation` fields, actions V1;
  - remplacer `required_data` par `conversation_context` dans les sorties
    nouvelles;
  - garder aliases compat si necessaire.

Dispatchers/reducers:

- `select_state_potion/subskills/state_potion_subskill_flow.ts`
  - produire `conversation_context`;
  - produire `note_information`;
  - ajouter `exit_to_global_dispatcher`, `handoff_to_local_flow`;
  - renforcer precedence message courant pour champs fermes;
  - extraire builder de context visible.

- `select_state_potion/subskills/clarte_flow.ts`
  - aligner sur le meme contrat;
  - ou migrer Clarte vers le dispatcher commun avec definition specifique.

- `select_state_potion/subskills/local_flow_dispatcher.ts`
  - limiter la dependance a `route_decision` globale;
  - consommer seulement signals structures compatibles;
  - produire sorties doctrine.

- `select_state_potion/handoff.ts`
  - skip global normal en active flow;
  - supprimer interruptions globales silencieuses;
  - brancher inline product/status via local dispatcher;
  - creer/propager `note_information`;
  - passer uniquement `conversation_context` au visible.

Visible:

- `select_state_potion/visible_agents/agent.ts`
  - remplacer input brut par `{ stage, conversation_context }`;
  - router vers prompt stage-specific.

- nouveaux fichiers:
  - `visible_agents/prompts/*.ts`;
  - `visible_agents/context.ts`;
  - `subskills/note_information.ts` ou helper partage.

Docs/tests:

- `select_state_potion/visible_agent_architecture_test.ts`;
- `select_state_potion/local_runtime_contract_test.ts`;
- `select_state_potion/subskills/state_potion_subskill_flow_test.ts`;
- `select_state_potion/subskills/clarte_flow_test.ts`;
- tests route/arbitration si le bug Courage global est corrige.

### Ordre de modification

1. Ajouter les types `conversation_context`, `note_information`,
   `flow_action` V1 et aliases compat.
2. Ajouter builders purs:
   - `buildStatePotionConversationContext`;
   - `buildSelectStatePotionNoteInformation`;
   - `compactStatePotionDbContextPack`.
3. Adapter reducer commun pour remplir `conversation_context` sur chaque
   `visible_task`.
4. Ajouter `exit_to_global_dispatcher`, `handoff_to_local_flow`,
   `safety_preempt -> note`.
5. Adapter Clarte ou la migrer dans le commun.
6. Refondre visible agent en registry stage-specific.
7. Modifier `handoff.ts` pour ne transmettre que `conversation_context`.
8. Nettoyer le chemin nominal qui appelle generator/draft legacy.
9. Corriger route globale d'entree "je veux une potion mais je ne sais pas
   laquelle" pour que `select_state_potion` gagne avant `normal_reply`.
10. Renforcer Guerison: precedence du message courant sur
    `dominant_feeling`.
11. Ajouter logs doctrine.
12. Lancer tests unitaires puis QA reelle.

### Tests unitaires

- active flow skips global route decision and calls local dispatcher;
- local dispatcher output contains conversation_context for every visible task;
- visible agent input does not contain raw state/db/memory/route;
- every visible task maps to a stage-specific prompt;
- exit_to_global has full note_information;
- safety_preempt has note_information target `safety_crisis`;
- exit_to_global_dispatcher clears/defer state and does not global reroute;
- inline product/status preserves parent state;
- Courage vague global enters select_state_potion;
- Guerison "surtout honte" locks/selects honte;
- no legacy generator in nominal subskill handoff;
- no deterministic visible template.

### Tests IA reels

- 1 run par potion depuis demande vague globale;
- 1 run bridge depuis emotional_repair vers amour/guerison/apaisement;
- 1 run bridge depuis demotivation_repair vers clarte/rappel;
- 1 run product help inline inside handoff;
- 1 run status recap inline inside handoff;
- 1 run safety inside active potion;
- 1 run topic change clear;
- 1 run exit to global dispatcher.

### Logs/traces a ajouter

- `local_dispatcher_called`;
- `local_dispatcher_result`;
- `global_dispatcher_skipped`;
- `flow_action`;
- `visible_task.kind`;
- `conversation_context_built`;
- `note_information_created`;
- `note_information_consumed`;
- `inline_tool_roundtrip`;
- `exit_to_global_dispatcher`;
- `target_dispatcher`;
- `risk_score`;
- `no_chat_mutation`.

### Criteres de validation

- Tous les tours actifs passent par local dispatcher avant visible.
- Aucun prompt visible ne recoit DB/memoire brute.
- Aucun renderer deterministe dans le nominal.
- Aucun writer DB, token execution, pending executable, session potion ou
  reminder cree depuis chat.
- Les bugs QA Courage global et Guerison honte/culpabilite sont verts en run
  reel.
- Les traces montrent `global_dispatcher_skipped`, `conversation_context_built`
  et `note_information_created` quand applicable.
