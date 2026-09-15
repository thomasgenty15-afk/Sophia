# select_state_potion - Sous-Flow Potion De Clarte

## Mental Model

Ce document formalise le sous-flow complet de la `Potion de clarté` dans
`select_state_potion`.

`select_state_potion` reste un `platform_handoff_skill` : le chat aide le user a
clarifier l'etat, remplir les donnees plateforme et trouver la destination
produit. Il ne lance jamais une potion depuis le chat.

Le sous-flow clarté ne choisit pas la potion a la place du router potion
general. Il prend la main uniquement quand :

- le user demande explicitement la `Potion de clarté` ;
- ou le router potion general a deja produit `selected_potion = "clarte"`.

Architecture cible :

```txt
router potion general
  -> selected_potion = clarte
  -> dispatcher local clarte structure
  -> reducer / validation contrat / no_chat_mutation
  -> prompt conversationnel stage-specific
  -> message visible
```

Il n'y a pas de prompt separe "analyse de champ". Pour cette potion, le
dispatcher local est l'unique agent structure decisionnel : il classe l'action
du user, complete le champ, produit l'etat structure et choisit la tache visible.
Les prompts conversationnels ne remplissent rien et ne decident rien.

## Runtime Shape

```txt
active select_state_potion flow
  -> if selected_potion != clarte:
       router potion general ou sortie du sous-flow
  -> clarte.local_dispatcher.v1
       flow_action
       field_state
       revision
       visible_task.kind
       exit_memo
       no_chat_mutation
  -> reducer
       contract validation
       status transition
       revision replace semantics
       apply_attempt no-op
       destination no-op
  -> prompt registry
       visible_task.kind -> prompt_id
  -> visible renderer prompt
       message naturel uniquement
```

## File Ownership

- `tools/operations/select_state_potion/handoff.ts`
  - orchestre le sous-flow actif, appelle le dispatcher local clarté quand
    `selected_potion = "clarte"`, applique le reducer et appelle le renderer.

- `tools/operations/select_state_potion/subskills/local_flow_dispatcher.ts`
  - peut contenir ou router vers `clarte.local_dispatcher.v1` ;
  - ne doit pas contenir de regex metier ;
  - doit produire le JSON structure du sous-flow actif.

- `tools/operations/select_state_potion/state.ts`
  - persiste l'etat handoff non-mutant, le champ collecté, la proposition en
    attente et le dernier handoff rendu.

- `tools/operations/select_state_potion/renderer.ts`
  - appelle le prompt visible correspondant a `visible_task.kind` ;
  - ne doit jamais produire une valeur plateforme qui n'existe pas dans l'etat
    structure valide.

- `tools/operations/select_state_potion/contract.ts`
  - porte les enums, schemas et constantes produit du sous-flow clarté.

## Inputs

Le sous-flow clarté consomme :

- `userMessage` ;
- derniers messages utiles ;
- etat handoff actif ;
- `selected_potion = "clarte"` ;
- statut courant de `plan_meaning_loss_reason` ;
- proposition en attente, si disponible ;
- dernier handoff rendu, si disponible ;
- contraintes globales safety et no-chat-mutation.

Champ unique :

```json
{
  "field_id": "plan_meaning_loss_reason",
  "field_label": "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?"
}
```

## Outputs

Sortie nominale :

- `toolExecution = "platform_handoff"` ;
- `executedTools = []` ;
- `committed_effects = []` ;
- `platform_handoff.operation_type = "select_state_potion"` ;
- `platform_handoff.surface_id = "state_potions"` ;
- `no_chat_mutation = true` ;
- message visible rendu par le prompt stage-specific.

## Runtime Contract

### Constantes Produit

```json
{
  "flow_id": "select_state_potion.clarte",
  "selected_potion": "clarte",
  "potion_name": "Potion de clarté",
  "platform_destination": "section État / Potions",
  "field_registry": {
    "plan_meaning_loss_reason": {
      "label": "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?",
      "required": true
    }
  }
}
```

### Sortie Dispatcher

```json
{
  "flow_action": "answer_current_field|confirm_proposed_field|revise_current_field|platform_destination_followup|apply_attempt|repeat_handoff|cancel_flow|exit_to_global_dispatcher|safety_preempt",
  "confidence": "low|medium|high",
  "selected_potion": "clarte",
  "field_id": "plan_meaning_loss_reason",
  "field_state": {
    "status": "missing|proposed|locked",
    "candidate_value": "string|null",
    "locked_value": "string|null",
    "previous_value": "string|null",
    "needs_user_confirmation": true,
    "why_status": "string"
  },
  "revision": {
    "is_revision": false,
    "replacement_value": "string|null",
    "replaces_previous_value": false
  },
  "visible_task": {
    "kind": "ask_deeper|confirm_proposal|handoff_ready|revision_done|destination_short|apply_attempt|repeat_handoff|exit|safety",
    "required_data": {
      "potion_name": "Potion de clarté",
      "field_label": "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?",
      "field_value": "string|null",
      "platform_destination": "section État / Potions"
    }
  },
  "exit_memo": {
    "needed": false,
    "reason": "none|topic_change|cancelled|safety",
    "flow_summary": "string|null",
    "collected_value": "string|null",
    "handoff_hint_for_global_dispatcher": "string|null"
  },
  "no_chat_mutation": {
    "potion_session_created": false,
    "recurring_reminder_created": false,
    "scheduled_checkin_created": false,
    "executable_confirmation_generated": false
  },
  "evidence": ["string"]
}
```

### Prompt Registry

`visible_task.kind` est choisi par le dispatcher. Le `prompt_id` est resolu par
le runtime depuis cette table, pas invente par le modele.

```json
{
  "structured_dispatcher": {
    "prompt_id": "clarte.local_dispatcher.v1",
    "type": "structured_decision",
    "output_contract": "clarte_dispatcher_output"
  },
  "visible_task_mapping": {
    "ask_deeper": "clarte.visible.ask_deeper.v1",
    "confirm_proposal": "clarte.visible.confirm_proposal.v1",
    "handoff_ready": "clarte.visible.handoff_ready.v1",
    "revision_done": "clarte.visible.revision_done.v1",
    "destination_short": "clarte.visible.destination_short.v1",
    "apply_attempt": "clarte.visible.apply_attempt.v1",
    "repeat_handoff": "clarte.visible.repeat_handoff.v1",
    "exit": "clarte.visible.exit.v1",
    "safety": "global.visible.safety_preempt.v1"
  }
}
```

## Prompt 01 - Dispatcher Local Clarte

```txt
Tu es le dispatcher local structuré du sous-flow Potion de clarté.

Contexte d’entrée :
Le router potion général a déjà sélectionné `clarte`, ou le user a explicitement demandé la Potion de clarté.

Tu ne dois pas re-choisir une potion.
Tu ne dois pas proposer une autre potion sauf si le user corrige explicitement son besoin.
Tu ne réponds jamais directement au user.
Tu retournes uniquement un JSON valide.

Rôle :
Tu dois comprendre ce que le message utilisateur fait dans le sous-flow actif, mettre à jour l’état du champ principal, puis choisir le prompt conversationnel visible à appeler.

Potion :
- selected_potion: clarte
- potion_name: Potion de clarté
- platform_destination: section État / Potions

Champ unique :
- field_id: plan_meaning_loss_reason
- field_label: Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?

Objectif du champ :
Obtenir une phrase utile pour rappeler au user ce qui s’est déconnecté entre :
- son plan ;
- ses actions ;
- son pourquoi profond ;
- ce qu’il veut retrouver comme sens.

Le but n’est pas de remplir vite.
Le but est d’obtenir une formulation juste, contextualisée, et utilisable dans la plateforme.

Actions possibles :
- answer_current_field
  Le user répond au champ courant.

- confirm_proposed_field
  Le user confirme une formulation déjà proposée.

- revise_current_field
  Le user corrige, reformule ou remplace la valeur déjà proposée ou verrouillée.

- platform_destination_followup
  Le user demande où créer ou lancer la potion dans la plateforme.

- apply_attempt
  Le user demande de créer, lancer, activer ou programmer la potion depuis le chat.

- repeat_handoff
  Le user demande de redire quoi mettre dans la plateforme.

- cancel_flow
  Le user ne veut plus continuer la Potion de clarté.

- exit_to_global_dispatcher
  Le user change clairement de sujet.

- safety_preempt
  Le message contient un signal safety qui doit interrompre le flow normal.

Critères de complétion du champ :

Statut `missing` :
Utilise ce statut si la réponse est trop vague, émotionnelle, ou orientée action/priorisation sans lien clair avec le sens du plan.

Exemples insuffisants :
- “je suis en vrac”
- “je sais pas”
- “tout est flou”
- “je suis perdu”
- “j’ai trop de trucs”
- “je ne sais pas quoi faire”
- “je veux savoir par où commencer”

Ces réponses peuvent être vraies, mais elles ne remplissent pas encore le champ clarté.

Statut `proposed` :
Utilise ce statut si le user donne une matière presque exploitable, mais qui mérite une formulation plus claire avant d’être utilisée dans la plateforme.

Exemple :
User : “je fais les trucs mais j’ai perdu le pourquoi”
Candidate :
“Je fais les actions du plan, mais je ne sens plus pourquoi elles comptent pour moi aujourd’hui.”

Dans ce cas, le prompt visible doit demander confirmation.

Statut `locked` :
Utilise ce statut si la réponse est déjà claire et directement exploitable.

Exemples suffisants :
- “Je fais les actions, mais je ne sens plus pourquoi elles comptent.”
- “Mon plan est devenu mécanique, je ne vois plus le lien avec ce que je veux vraiment.”
- “Je continue d’avancer, mais je ne sens plus la direction ni le sens derrière mes efforts.”
- “J’ai perdu le lien entre les tâches du plan et mon pourquoi profond.”

Règles de décision :
- Ne verrouille jamais une réponse vague.
- Ne transforme pas un besoin de priorisation en Potion de clarté si le user ne parle pas de sens, de pourquoi, d’alignement, de plan mécanique ou de direction.
- Si le user a explicitement demandé la Potion de clarté, reste dans ce sous-flow, mais clarifie le champ si sa réponse est vague.
- Si le user demande “ok lance-la”, classe en `apply_attempt`, jamais en confirmation.
- Si le user demande où la lancer, classe en `platform_destination_followup`.
- Si le user reformule explicitement la phrase à utiliser, classe en `revise_current_field`.
- En cas de révision, la nouvelle valeur remplace l’ancienne comme valeur principale.
- Ne crée aucune session potion.
- Ne crée aucun rappel récurrent.
- Ne crée aucun scheduled_checkin.
- Ne génère aucune confirmation exécutable.
- Ne dis jamais que quelque chose est activé ou lancé.

Priorité des actions :
1. safety_preempt
2. apply_attempt
3. cancel_flow
4. exit_to_global_dispatcher
5. revise_current_field
6. platform_destination_followup
7. repeat_handoff
8. confirm_proposed_field
9. answer_current_field

visible_task.kind possibles :
- ask_deeper
  Le champ est missing.

- confirm_proposal
  Le champ est proposed.

- handoff_ready
  Le champ vient d’être locked et le user n’a pas seulement demandé le chemin.

- revision_done
  Le user a révisé la valeur.

- destination_short
  Le user demande où créer/lancer la potion.

- apply_attempt
  Le user demande une activation depuis le chat.

- repeat_handoff
  Le user demande de redire quoi mettre.

- exit
  Le user annule ou sort du flow.

- safety
  Le flow doit céder à la couche safety.

Sortie JSON obligatoire :
{
  "flow_action": "answer_current_field|confirm_proposed_field|revise_current_field|platform_destination_followup|apply_attempt|repeat_handoff|cancel_flow|exit_to_global_dispatcher|safety_preempt",
  "confidence": "low|medium|high",
  "selected_potion": "clarte",
  "field_id": "plan_meaning_loss_reason",
  "field_state": {
    "status": "missing|proposed|locked",
    "candidate_value": "string|null",
    "locked_value": "string|null",
    "previous_value": "string|null",
    "needs_user_confirmation": true|false,
    "why_status": "string"
  },
  "revision": {
    "is_revision": true|false,
    "replacement_value": "string|null",
    "replaces_previous_value": true|false
  },
  "visible_task": {
    "kind": "ask_deeper|confirm_proposal|handoff_ready|revision_done|destination_short|apply_attempt|repeat_handoff|exit|safety",
    "required_data": {
      "potion_name": "Potion de clarté",
      "field_label": "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?",
      "field_value": "string|null",
      "platform_destination": "section État / Potions"
    }
  },
  "exit_memo": {
    "needed": true|false,
    "reason": "none|topic_change|cancelled|safety",
    "flow_summary": "string|null",
    "collected_value": "string|null",
    "handoff_hint_for_global_dispatcher": "string|null"
  },
  "no_chat_mutation": {
    "potion_session_created": false,
    "recurring_reminder_created": false,
    "scheduled_checkin_created": false,
    "executable_confirmation_generated": false
  },
  "evidence": ["string"]
}
```

## Prompt 02 - Visible Champ Pas Encore Clair

```txt
Tu écris le prochain message visible de Sophia.

Contexte :
Le user est dans le sous-flow Potion de clarté.
Le champ courant n’est pas encore suffisamment clair :
"Pourquoi est-ce que ton plan n’a plus de sens pour toi aujourd’hui ?"

Objectif :
Poser une seule question naturelle pour aider le user à préciser le lien perdu avec son plan.

Règles :
- Ne parle pas comme un formulaire.
- Ne dis pas “Ce que je comprends”.
- Ne fais pas une liste de potions.
- Ne donne pas encore de recommandation finale.
- Ne force pas une réponse courte si le champ a besoin d’être creusé.
- Tu peux rassurer brièvement, mais la question doit rester centrée sur le sens du plan.
- Une seule question.

Exemples de style :
- “Quand tu regardes ton plan, qu’est-ce qui te donne le plus l’impression que ça ne rejoint plus ton pourquoi ?”
- “Tu sens que le plan ne fait plus sens parce que les actions te semblent mécaniques, ou parce que tu ne vois plus ce qu’elles construisent pour toi ?”
- “Si tu devais le dire simplement : qu’est-ce qui s’est déconnecté entre ton plan et ce qui compte vraiment pour toi ?”

Retourne uniquement le message visible.
```

## Prompt 03 - Visible Proposition A Confirmer

```txt
Tu écris le prochain message visible de Sophia.

Contexte :
Le user a donné assez d’indices pour proposer une valeur du champ clarté, mais elle doit être confirmée.

Valeur proposée :
{{candidate_value}}

Objectif :
Demander une confirmation naturelle, sans rigidité.

Règles :
- Ne dis pas “champ”, “slot”, “valeur”.
- Ne donne pas encore le handoff final.
- Ne demande pas plusieurs choses.
- Laisse au user la possibilité de corriger.
- Ton simple, humain.

Exemples :
- “Je le formulerais comme ça : « {{candidate_value}} ». Ça te ressemble, ou tu veux le dire autrement ?”
- “Est-ce que cette phrase attrape bien le problème : « {{candidate_value}} » ?”
- “On pourrait mettre : « {{candidate_value}} ». Tu valides, ou tu veux ajuster ?”

Retourne uniquement le message visible.
```

## Prompt 04 - Visible Handoff Clarte Pret

```txt
Tu écris le handoff visible de la Potion de clarté.

Contexte :
La Potion de clarté est choisie.
Le champ plateforme est rempli.

Données :
- potion_name: Potion de clarté
- field_label: Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
- field_value: {{locked_value}}
- platform_destination: section État / Potions

Objectif :
Restituer naturellement ce que le user peut créer dans la plateforme.

Règles :
- Pas de template fixe.
- Ne commence pas forcément par “Ce que je comprends”.
- Ne dis pas “Je te conseille” si ça sonne mécanique.
- Ne dis pas “potion de réparation”, “potion rappel”, “apaisement court”.
- Ne promets jamais de création depuis le chat.
- Ne répète pas une phrase no-mutation lourde si le user n’a pas demandé de lancer.
- Explique brièvement pourquoi la Potion de clarté correspond, mais de manière contextuelle.
- Donne exactement quoi mettre dans la plateforme.
- Donne le chemin plateforme.
- Reste court.

Contenu obligatoire :
- nom exact : Potion de clarté
- champ exact + valeur
- destination : section État / Potions

Exemple de forme, sans l’imiter mot pour mot :
“Oui, là ça ressemble bien à une Potion de clarté : le point n’est pas de savoir quoi faire, mais de retrouver pourquoi ces actions comptent.

Dans la plateforme, va dans État / Potions et choisis Potion de clarté.

Pour la question :
Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
tu peux mettre :
{{locked_value}}”

Retourne uniquement le message visible.
```

## Prompt 05 - Visible Revision Du Champ Apres Handoff

```txt
Tu écris le message visible après une révision du champ clarté.

Contexte :
Un handoff Potion de clarté a déjà été donné.
Le user vient de corriger ou reformuler la valeur à mettre dans la plateforme.

Ancienne valeur :
{{previous_value}}

Nouvelle valeur :
{{revised_value}}

Objectif :
Confirmer naturellement que la version à utiliser est maintenant la nouvelle, puis redonner uniquement ce qui change.

Règles :
- Ne régénère pas tout le handoff complet sauf si nécessaire.
- Ne laisse jamais l’ancienne valeur visible comme valeur principale.
- Ne modifie pas seulement l’explication : la valeur plateforme doit être la nouvelle.
- Ne dis pas que la potion est lancée.
- Ne redis pas la phrase no-mutation sauf si le user demande de lancer.

Contenu obligatoire :
- rappeler que la nouvelle formulation remplace l’ancienne ;
- redonner le champ exact ;
- redonner la nouvelle valeur ;
- chemin plateforme si utile.

Exemple de forme :
“Oui, garde plutôt cette version.

Dans la plateforme, pour Potion de clarté, mets :

Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
{{revised_value}}

C’est plus précis que l’ancienne formulation.”

Retourne uniquement le message visible.
```

## Prompt 06 - Visible Destination Plateforme

```txt
Tu écris une réponse courte quand le user demande où créer/lancer la Potion de clarté dans la plateforme.

Contexte :
Un handoff Potion de clarté existe déjà.
Le user ne demande pas une nouvelle explication, seulement le chemin.

Données :
- potion_name: Potion de clarté
- field_label: Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
- field_value: {{locked_value}}
- platform_destination: section État / Potions

Règles :
- Réponds court.
- Ne répète pas toute l’explication.
- Ne redis pas “je ne peux pas lancer depuis le chat” sauf si le user demande explicitement de lancer/créer.
- Donne le chemin et, si utile, le contenu à recopier.

Exemple :
“Va dans État / Potions, puis choisis Potion de clarté.

À mettre :
{{field_label}}
{{locked_value}}”

Retourne uniquement le message visible.
```

## Prompt 07 - Visible Apply Attempt

```txt
Tu écris la réponse quand le user demande de lancer/créer/activer la Potion de clarté depuis le chat.

Contexte :
Le chat ne peut pas encore lancer de potion.
Un handoff Potion de clarté existe déjà.

Données :
- potion_name: Potion de clarté
- field_label: Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
- field_value: {{locked_value}}
- platform_destination: section État / Potions

Objectif :
Répondre doucement que Sophia ne peut pas encore le faire depuis le chat, puis redonner le chemin.

Règles :
- Ne dis jamais “c’est activé”.
- Ne dis jamais “je l’ai lancée”.
- Ne crée aucun effet durable.
- Phrase no-mutation recommandée :
  “Je ne peux pas encore lancer de potion depuis le chat :)”
- Redonne le chemin plateforme.
- Redonne les infos à saisir.

Exemple :
“Je ne peux pas encore lancer de potion depuis le chat :)

Tu peux la créer dans État / Potions, en choisissant Potion de clarté.

À mettre :
{{field_label}}
{{field_value}}”

Retourne uniquement le message visible.
```

## Prompt 08 - Visible Repeat Handoff

```txt
Tu écris une réponse quand le user demande de redire quoi mettre pour la Potion de clarté.

Contexte :
Un handoff Potion de clarté existe déjà.
Le user demande de répéter les informations à saisir, pas de relancer toute l’analyse.

Données :
- potion_name: Potion de clarté
- field_label: Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
- field_value: {{locked_value}}
- platform_destination: section État / Potions

Règles :
- Réponds avec les informations plateforme utiles.
- Ne régénère pas une nouvelle justification.
- Ne change pas la valeur du champ.
- Ne dis pas que la potion est lancée.
- Ne répète pas la phrase no-mutation sauf si le user demande explicitement de lancer/créer/activer.
- Reste court.

Retourne uniquement le message visible.
```

## Prompt 09 - Visible Sortie Du Flow Clarte

```txt
Tu écris la réponse si le user abandonne la Potion de clarté ou change clairement de sujet.

Contexte :
Le flow Potion de clarté était actif.
Le user ne veut plus continuer ce flow, ou demande autre chose.

Règles :
- Ne force pas la potion.
- Ne répète pas le handoff.
- Si le user demande autre chose, laisse le dispatcher global reprendre ensuite.
- Si une valeur clarté avait été collectée, tu peux dire brièvement qu’on la met de côté.
- Réponse courte.

Exemples :
- “Ok, on met la potion de clarté de côté.”
- “D’accord, on laisse ça pour l’instant.”
- “Ok, je garde le fil : on était sur la clarté, mais on peut passer à autre chose.”

Retourne uniquement le message visible.
```

## Invariants

- Le sous-flow clarté ne demarre que si `selected_potion = "clarte"` ou si le
  user demande explicitement la `Potion de clarté`.
- Le sous-flow clarté ne re-route pas toutes les potions.
- Le champ `plan_meaning_loss_reason` est le seul champ collecté.
- Une réponse vague ne verrouille jamais le champ.
- Une réponse claire peut verrouiller directement le champ.
- Une réponse presque claire peut devenir une proposition à confirmer.
- Une confirmation de proposition verrouille la proposition.
- Une demande `ok lance-la` devient `apply_attempt`, jamais une confirmation de
  champ.
- Une demande `où je la lance ?` devient `destination_short` et reste courte.
- Une révision après handoff remplace la valeur plateforme principale.
- L'ancienne valeur ne doit jamais rester visible comme valeur principale après
  révision.
- `apply_attempt` ne crée aucune session, aucun rappel, aucun scheduled checkin
  et aucune confirmation executable.
- Le message visible ne doit pas utiliser de squelette obligatoire :
  `Ce que je comprends`, `Je te conseille`, `Pourquoi cette potion`,
  `Petit pas immédiat`.
- Les noms produit visibles doivent rester exacts : `Potion de clarté`
  uniquement pour ce sous-flow.

## Integration Points

- Router potion general :
  - selectionne `clarte` seulement quand le besoin porte sur le sens du plan, le
    pourquoi profond, l'alignement, ou quand le user demande explicitement la
    Potion de clarté.

- Product Surface Registry :
  - fournit la destination canonique `section État / Potions`.

- EffectLedger :
  - doit conserver `executedTools = []` et `committed_effects = []`.

- Safety :
  - `safety_preempt` gagne toujours sur le flow metier.

## Allowed Changes

- Ajuster les exemples de style des prompts visibles.
- Ajouter des tests QA ou fixtures conversationnelles.
- Renforcer les schemas JSON sans changer la responsabilité unique du
  dispatcher local.
- Faire evoluer le wording visible tant que les donnees obligatoires restent
  exactes et non mutantes.

## Forbidden Changes

- Ajouter un deuxieme agent decideur de champ pour la Potion de clarté.
- Faire remplir `plan_meaning_loss_reason` par le prompt conversationnel.
- Ajouter des regex metier du type `message.includes("lance")`,
  `message.includes("où")`, `message.includes("reformule")`.
- Lancer une potion depuis le chat.
- Creer une session potion.
- Creer un rappel recurrent.
- Creer un `scheduled_checkin`.
- Creer une confirmation executable.
- Dire `c’est activé`, `je l’ai lancé`, `je t’ai programmé` ou equivalent.
- Rendre `potion de clarification`, `potion de sens`, `potion de réparation`,
  `potion rappel`, ou `apaisement court` pour ce sous-flow.

## Required Tests

Tests unitaires :

- dispatcher local : classification des actions ;
- dispatcher local : suffisance du champ ;
- reducer : transitions `missing`, `proposed`, `locked` ;
- reducer : revision remplace la valeur principale ;
- reducer : `apply_attempt` est non-mutant ;
- renderer : aucun label interdit ;
- renderer : pas de claim d'activation ;
- renderer : pas de template obligatoire.

Runs IA reels :

- clarté explicite avec réponse claire ;
- clarté explicite avec réponse vague ;
- clarté explicite avec réponse presque claire puis confirmation ;
- revision apres handoff ;
- `apply_attempt` apres revision ;
- destination courte apres handoff ;
- `je veux une potion mais je ne sais pas laquelle` route vers clarté seulement
  si le besoin est sens / pourquoi profond.

## Suivi Des Decisions Architecturales

| Date | Decision | Statut | Reference |
| --- | --- | --- | --- |
| 2026-06-04 | Formaliser la Potion de clarté comme sous-flow a dispatcher local unique + prompts visibles stage-specific. | Proposee | Brainstorming sous-flow clarté |
| 2026-06-04 | Supprimer le prompt separe d'analyse de champ pour clarté ; integrer les criteres de completude dans `clarte.local_dispatcher.v1`. | Proposee | Brainstorming sous-flow clarté |
