# Local Dispatcher Doctrine

Fiche de regles transverses pour tous les dispatchers locaux Sophia.

Objectif : donner une checklist commune aux agents d'implementation et de
correction pour verifier qu'un flow local respecte la nouvelle architecture.

But V1 : fiabilite et efficacite.

Cette doctrine ne cherche pas a produire une architecture parfaite ou
exhaustive. Elle sert a rendre les flows locaux plus fiables, plus rapides a
stabiliser, et moins rigides. Les agents doivent eviter de sur-compliquer : si
un flow fonctionne avec un dispatcher local clair, quelques prompts
stage-specific, un contexte compact et des transitions explicites, c'est
suffisant pour la V1.

## Principe Central

Un dispatcher local est le cerveau d'un flow actif.

Quand un flow est actif :

```txt
message user
-> dispatcher local
-> reducer
-> conversation_context
-> prompt conversationnel stage-specific
-> message visible
```

Le dispatcher global normal ne fonctionne pas pendant un flow actif, sauf si le
dispatcher local retourne explicitement `exit_to_global_dispatcher`.

Si le tour change d'ownership :

```txt
dispatcher local source
-> note_information
-> dispatcher cible local ou global
-> reducer cible
-> prompt conversationnel cible
```

## Interdits

Un dispatcher local ne doit jamais utiliser :

- regex metier ;
- `message.includes(...)` metier ;
- routing par mots-cles ;
- routing deterministe de domaine ;
- renderer visible deterministe dans le chemin nominal ;
- template visible fixe ;
- modele de message construit par code ;
- fallback global silencieux pendant un flow actif ;
- agent conversationnel unique et generaliste pour tout le flow.

Les seuls checks deterministes acceptables :

- validation de contrat JSON ;
- validation de statuts ;
- validation que les ids selectionnes existent ;
- no-chat-mutation guards ;
- safety-critical guards ;
- EffectLedger ;
- anti-duplication ;
- logs/observabilite ;
- contraintes structurelles deja produites par IA.

## Dispatcher Local

Le dispatcher local :

- analyse le message user dans le contexte du flow actif ;
- met a jour l'etat structure ;
- choisit `flow_action` ;
- choisit `visible_task.kind` ;
- remplit `visible_task.conversation_context` ;
- produit `note_information` si un autre dispatcher doit reprendre ;
- produit les signaux safety et risk score du flow local ;
- ne repond jamais directement au user.

Il ne doit pas :

- produire un message visible ;
- lancer un outil durable ;
- muter la DB sauf flow explicitement autorise ;
- inventer un contexte absent ;
- laisser le prompt conversationnel remplir les champs metier ;
- deleguer une decision metier au visible agent.

## Contrat D'Entree Standard

Chaque dispatcher local doit recevoir un input stable :

```json
{
  "current_user_message": "string",
  "recent_messages": [],
  "active_flow_state": {},
  "note_information_inbound": {},
  "db_context_pack": {},
  "micro_memory_context": {},
  "platform_context": {},
  "risk_context": {},
  "available_inline_tools": [],
  "parent_flow_context": {},
  "timezone": "string",
  "channel": "string"
}
```

Champs optionnels selon flow :

- `candidate_signals` pour `clarification` ;
- `potion_bridge_context` pour bridges vers potions ;
- `origin_flow` pour transitions locales ;
- `handoff_state` pour platform handoff skills ;
- `micro_memory_context` quand une memoire minimale tres pertinente peut aider
  le dispatcher.

## Contrat De Sortie Standard

Tous les dispatchers locaux doivent exposer les memes grandes familles de
sortie, meme si les noms exacts varient par flow :

```json
{
  "flow_action": "continue_local|missing_info|confirm_candidate|handoff_ready|revise|repeat|apply_attempt|inline_tool|get_info_product|get_info_db|exit_to_global_dispatcher|cancel_flow|complete_flow|defer_flow|safety_preempt",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "local_state_patch": {},
  "visible_task": {
    "kind": "stage_specific_kind",
    "conversation_context": {}
  },
  "note_information": {
    "needed": false
  },
  "no_chat_mutation": {},
  "evidence": []
}
```

Le reducer peut adapter ce contrat au domaine, mais la categorie de sortie doit
etre claire.

## Sorties Communes

### Continuer Le Flow Local

Le dispatcher reste owner et route vers un prompt conversationnel local.

```txt
dispatcher local
-> reducer
-> visible_task.kind
-> visible_task.conversation_context
-> prompt conversationnel stage-specific
```

### Inline Tool Roundtrip

Pour `get_info_product`, `get_info_db` ou equivalent :

```txt
dispatcher local parent
-> note_information
-> inline tool / inline flow
-> reponse inline
-> retour au flow parent
```

Le parent flow ne doit pas perdre son etat.

### Transition Specialisee Vers Dispatcher Local

Pour une exception specialisee vers un autre flow local, le contrat doit etre
nomme par le flow source et documente explicitement. Ne pas utiliser
`exit_to_global_dispatcher` comme bridge renomme.

```txt
dispatcher local source
-> flow_action specifique documentee
-> note_information
-> dispatcher local cible
```

Exemples :

- `emotional_repair -> select_state_potion` ;
- `demotivation_repair -> select_state_potion` ;
- `clarification -> prepare_attack_card` ;
- `create_recurring_reminder -> one_shot_reminder` ;
- any flow -> `safety_crisis`.

La premiere activation d'un dispatcher local doit aussi recevoir une
`note_information` quand elle vient d'un autre dispatcher, y compris depuis le
dispatcher global. Le premier tour local ne doit pas etre un demarrage nu : la
note explique pourquoi ce flow a ete choisi, quel signal a declenche
l'activation, et quel contexte initial le dispatcher local doit prendre en
compte.

### Exit Vers Global

`exit_to_global_dispatcher` est utilise des que le flow local arrete de posseder
le tour et que le dispatcher global doit reprendre, y compris quand le user
demande simplement d'arreter le flow actif.

Exemple :

```txt
"laisse ca, aide-moi a prioriser"
"j'arrete ce flow pour aujourd'hui"
```

Dans ce cas :

- `note_information` obligatoire ;
- global dispatcher peut reanalyser le message avec la note ;
- le flow local source arrete de posseder le tour.
- le dispatcher global ne doit jamais etre appele directement par l'arbitrage
  d'active flow : le dispatcher local source produit d'abord
  `exit_to_global_dispatcher` avec une `note_information` exploitable.

### Safety

Safety est une sortie du dispatcher local, pas une raison de relancer le global.

```txt
dispatcher local
-> safety_preempt
-> note_information
-> safety_crisis.local_dispatcher
```

Le `risk_score` du dispatcher local doit rester raccord avec la meme pipeline de
surveillance que le dispatcher global.

## Signaux D'Exit Communs

Tous les dispatchers locaux doivent savoir classer au minimum :

- `safety_preempt` : risque/safety prioritaire ;
- `cancel_flow` : user annule l'objet ou le support en cours ;
- `defer_flow` : user repousse le flow sans autre demande ;
- `complete_flow` : flow suffisamment fini, pas de suite immediate ;
- `exit_to_global_dispatcher` : user veut arreter le flow actif ou apporte un
  nouveau sujet clair ;
- transition specialisee documentee : autre flow cible explicite ou structure ;
- `inline_tool_roundtrip` : question produit/status temporaire ;
- `repeat_current_state` : user demande de redire ;
- `revise_current_state` : user corrige une valeur deja produite.

## Note Information

Une `note_information` est obligatoire des qu'il y a changement de dispatcher.
Cela inclut la premiere activation d'un dispatcher local par le dispatcher
global ou par un autre dispatcher local.

Exception limitee : si le flow local est cree par un evenement systeme interne
deja type et non par un dispatcher, l'evenement doit fournir un contexte
equivalent a `note_information`.

Elle contient toujours :

```json
{
  "source_flow_id": "string",
  "target_dispatcher": "global|safety_crisis|product_help|status_recap|select_state_potion|...",
  "handoff_reason": "topic_change|safety|inline_tool|bridge|clarification_resolved|flow_interruption|explicit_user_request",
  "handoff_context_for_next_dispatcher": "string",
  "structured_context": {},
  "confidence": "low|medium|high"
}
```

`confidence` est optionnel si le flow n'a pas de champ equivalent.
`user_words`, si requis par un contrat legacy, est ajoute par le runtime et non
demande au dispatcher local.
`structured_context` est obligatoire. Il peut etre minimal, mais il ne doit pas
etre omis. Les champs retires du contrat canonique sont
`source_flow_presentation`, `source_flow_state_summary`,
`target_local_dispatcher_hint`, `risk_score` et `no_chat_mutation`.

La note doit contenir :

- resume compact de ce qui est acquis ;
- ce qui reste incertain ;
- pourquoi le prochain dispatcher recoit la main ;
- contexte exploitable pour remplir le JSON du dispatcher cible ;
- mots du user utiles ;
- evidence courte.

Les informations de risque restent dans `risk_score` du dispatcher local et les
preuves de non-mutation restent dans EffectLedger/runtime trace. Elles ne sont
pas transmises comme champs de `note_information`.

La note ne doit jamais devenir :

- un message visible ;
- un second dispatcher cache ;
- une decision deterministe imposee au prochain dispatcher.

Le dispatcher cible traite la note comme contexte source, pas comme ordre metier
irrevisable.

## Conversation Context

`conversation_context` est le contexte transmis par un dispatcher local a son
agent conversationnel local.

Terminologie standard :

```txt
db_context_pack
= contexte DB/produit large mais compact, charge avant le dispatcher local.

micro_memory_context
= memoire minimale tres pertinente, chargee avant le dispatcher local.

note_information
= contexte transmis entre dispatchers lors d'un changement d'ownership.

conversation_context
= contexte filtre transmis par le dispatcher/reducer au prompt visible local.
```

Flux sans changement de flow :

```txt
message user
-> db_context_pack + micro_memory_context
-> dispatcher local
-> reducer
-> visible_task.conversation_context
-> prompt conversationnel stage-specific
-> message visible
```

Flux avec changement de flow :

```txt
dispatcher local source
-> note_information
-> dispatcher cible
-> reducer cible
-> visible_task.conversation_context
-> prompt conversationnel cible
```

La `note_information` ne va pas directement au prompt conversationnel cible en
contournant son dispatcher. Le dispatcher cible la consomme, puis decide quels
elements transmettre a son propre prompt visible.

`conversation_context` doit etre visible-agent-safe :

- assez riche pour ecrire naturellement ;
- assez filtre pour ne pas redevenir un contexte DB brut ;
- centre sur l'etat et la tache visibles ;
- sans donnees inutiles ;
- sans decision metier a refaire.

Schema recommande :

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

Le prompt conversationnel ne doit pas :

- remplir un champ metier absent du `conversation_context` ;
- choisir une route ;
- appeler un outil ;
- lire directement le `db_context_pack` ou la memoire brute ;
- corriger une decision dispatcher.

## Prompts Conversationnels

Un dispatcher local ne peut pas router vers un seul agent conversationnel
generique.

Regle :

```txt
dispatcher local
-> visible_task.kind precis
-> prompt conversationnel stage-specific
```

Chaque flow local avec etat actif doit avoir plusieurs prompts conversationnels
specialises.

Exemples de prompts visibles attendus :

- `ask_missing_field` ;
- `ask_deeper` ;
- `confirm_candidate` ;
- `handoff_ready` ;
- `revise_value` ;
- `repeat_handoff` ;
- `destination_followup` ;
- `apply_attempt` ;
- `inline_tool_return` ;
- `stop_or_cancel` ;
- `exit_ack` ;
- `safety_transition`.

Un unique prompt visible du type `conversation_agent` est un red flag
architectural.

Exception possible : flow trivial one-turn sans etat actif, sans changement de
dispatcher, sans revision, sans abandon. Si un flow a un etat actif ou plusieurs
tours possibles, l'exception ne s'applique pas.

## Completeness De `visible_task`

Chaque `flow_action` doit avoir une suite exacte :

- prompt conversationnel stage-specific ;
- inline tool ;
- transition dispatcher ;
- transition dispatcher ;
- safety.

`visible_task.conversation_context` doit contenir assez d'information pour que
le prompt conversationnel fasse son travail sans inventer.

Interdit :

```json
{
  "visible_task": {
    "kind": "ask_target",
    "conversation_context": {}
  }
}
```

Attendu :

```json
{
  "visible_task": {
    "kind": "ask_target_reference",
    "conversation_context": {
      "known_goal": "string",
      "candidate_targets": [],
      "why_target_is_missing": "string",
      "db_context_summary": "string"
    }
  }
}
```

## Context Packs DB

Les dispatchers locaux doivent avoir acces au contexte DB utile quand ce
contexte les aide a faire leur travail.

Le contexte doit etre charge avant l'appel dispatcher, puis injecte dans
`db_context_pack`.

Il doit porter :

- source ;
- fraicheur ;
- confiance ;
- evidence courte ;
- statut `user_provided|db_derived|inferred|bridge_provided`.

Le dispatcher peut utiliser ce contexte pour raisonner, mais ne doit pas
inventer d'ids ou transformer une hypothese en fait.

`db_context_pack` concerne plutot l'etat produit/DB :

- plans ;
- actions actives ;
- niveaux ;
- cartes ;
- rappels ;
- potions ;
- preferences ;
- historique de progression ou de statut ;
- surfaces produit.

## Micro Memory Context

`micro_memory_context` est une version minimale du memory plan, chargee pour un
dispatcher local quand une memoire tres pertinente peut l'aider a comprendre le
tour sans polluer le prompt.

Objectif :

- recuperer seulement les elements de memoire vraiment proches du contexte ;
- aider le dispatcher a ne pas redemander ce qui est deja connu ;
- relier le message courant a une action active, un item, un thread ou un motif
  recent ;
- rester compact.

`micro_memory_context` n'est pas un etat DB produit. C'est une petite couche de
memoire contextuelle.

Sources possibles :

- memoire liee aux actions actives ;
- memoire liee aux plan items candidats ;
- memoire semantiquement proche du dernier message ;
- memoire de thread recent ;
- memoire d'evenement/item deja relie par le `TurnFrame` ;
- action observations recentes ;
- blockers/progress entries si elles sont exposees comme contexte memoire.

Budget recommande :

- 0 a 4 items maximum ;
- resumes compacts ;
- pas de dump brut ;
- pas de memoire sensible sauf autorisation explicite du flow ;
- pas de memoire safety hors flow safety ;
- chaque item porte source/evidence/confidence/freshness.

Schema recommande :

```json
{
  "items": [
    {
      "summary": "string",
      "source": "action_memory|semantic_memory|thread_memory|plan_item_memory|event_memory",
      "linked_object": {
        "type": "plan_item|action|memory_item|thread|unknown",
        "id": "string|null",
        "label": "string|null"
      },
      "freshness": "same_turn|recent|older",
      "confidence": "low|medium|high",
      "evidence": ["string"],
      "sensitivity": "normal|sensitive|safety"
    }
  ],
  "exclusions": ["string"],
  "budget": {
    "max_items": 4,
    "reason": "string"
  }
}
```

Le dispatcher peut utiliser `micro_memory_context` pour produire des candidats,
jamais pour verrouiller une interpretation sans evidence actuelle.

Regle de verrouillage :

- memoire seule -> `candidate` ou `context`, pas `locked` ;
- user vient de le redire explicitement -> peut devenir `locked` si le contrat
  du flow l'autorise ;
- memoire contradictoire ou faible -> demander clarification ou ignorer.

Tous les agents qui auditent un dispatcher local doivent se demander :

- ce flow beneficie-t-il d'une micro memoire ?
- si oui, quelles familles de memoire sont vraiment utiles ?
- quel budget minimal suffit ?
- quels cas doivent explicitement ne pas charger de micro memoire ?

Exemples ou c'est souvent utile :

- `emotional_repair` ;
- `demotivation_repair` ;
- `prepare_attack_card` ;
- `prepare_defense_card` ;
- `adjust_plan_item` ;
- `daily_action_review` ;
- `weekly_review` ;
- `create_recurring_reminder` quand lie a une action/habitude.

Cas particulier `emotional_repair` :

- la micro memoire peut aider a ne pas faire repeter une blessure, une relation
  ou un episode emotionnel deja evident dans le thread ;
- elle doit rester minimale et proche du message courant, sans construire de
  profil emotionnel global, sans diagnostic, et sans injecter de safety memory
  hors transition explicite vers safety.

Cas particulier `demotivation_repair` :

- la micro memoire peut aider a relier la demotivation a une action active, un
  blocage recent ou une pression de plan deja connue ;
- elle ne doit pas transformer une hypothese de cause en fait verrouille : si le
  lien action/plan/motivation n'est pas clair, le dispatcher doit demander ou
  proposer, pas affirmer.

Exemples ou ce n'est pas toujours utile :

- `clarification`, sauf si les familles candidates exigent un context pack
  dynamique ;
- `verification_opportunities`, sauf si le flow verifie cible explicitement un
  objet/flow qui a besoin de memoire ;
- `product_help`, sauf contexte parent minimal ;
- `status_recap`, qui doit surtout lire l'etat DB cible.

## Matrice Contextuelle Par Flow

| Flow cible                   | Contexte a injecter                                                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clarification`              | Contexte compose dynamiquement selon les familles candidates : produit, plan, actions, rappels, cartes, potions, preferences, statut DB, flow parent. Micro memoire non chargee par defaut, sauf si une famille candidate l'exige. |
| `prepare_attack_card`        | Actions actives, plans actifs, cartes d'attaque existantes, action candidate, contexte de friction, contraintes du plan. Micro memoire action-linked si une action active/candidate est identifiee.                                |
| `prepare_defense_card`       | Actions actives, risques actifs, cartes de defense existantes, situations recurrentes, contexte d'environnement/pulsion. Micro memoire action/risk-linked si utile.                                                                |
| `adjust_plan_item`           | Plans complets, niveaux, actions, statut des actions, historique recent de progression, contraintes utilisateur. Micro memoire liee aux actions/niveaux concernes si pertinente.                                                   |
| `select_state_potion`        | Etat du flow, origin bridge context, champs deja collectes, potions actives/historique si utile. Micro memoire seulement si elle soutient le champ courant sans polluer.                                                           |
| `emotional_repair`           | Recent messages, active flow state, plan context gradue seulement si relevant, micro memoire minimale liee au dernier message, aux actions actives ou au thread relationnel. Pas de profil emotionnel lourd invente.               |
| `demotivation_repair`        | Recent messages, active flow state, actions actives/candidates, plan context gradue, micro memoire action-linked et semantic match minimal autour du dernier message. Pas d'historique motivationnel lourd par defaut.             |
| `create_recurring_reminder`  | Rappels recurrents existants, plans/actions/habitudes actifs, contexte d'action_family, timezone. Micro memoire seulement si le rappel vise une action/habitude connue.                                                            |
| `one_shot_reminder`          | Calendrier/checkins recents si utile, timezone, contexte du message source, note depuis recurring si boundary.                                                                                                                     |
| `status_recap`               | Snapshot DB cible : cartes, rappels, potions, preferences, plan, effets recents selon question.                                                                                                                                    |
| `product_help`               | Surface produit demandee, flow actif parent, question exacte, objet/surface cible.                                                                                                                                                 |
| `verification_opportunities` | Flow ou opportunite a verifier, contexte DB du flow cible, actions/plans/cartes/potions selon candidate. Micro memoire non chargee par defaut, sauf si le flow verifie cible en a besoin.                                          |
| `update_coach_preferences`   | Preferences actuelles, historique de preferences, contexte conversationnel recent, consentement d'ecriture si applicable.                                                                                                          |
| `daily_action_review`        | Actions a checker par plan, plusieurs plans actifs, statuts du jour, contexte intro daily.                                                                                                                                         |
| `weekly_review`              | Actions et progression par plan, plusieurs plans actifs, resultats de la semaine, signaux d'ajustement.                                                                                                                            |
| `safety_crisis`              | Message safety, flow source, contexte de risque, note_information source, pas de contexte produit inutile.                                                                                                                         |

Si un flow manque dans cette matrice, l'agent doit l'ajouter avant
implementation.

## Source, Evidence Et Confidence

Tout champ structure important doit pouvoir etre explique par :

- `source` ;
- `evidence` ;
- `confidence` ;
- `status` ;
- evidence runtime si disponible.

Exemple :

```json
{
  "candidate_value": "string",
  "source": "user_message|db_context|note_information|memory|inference",
  "confidence": "low|medium|high",
  "evidence": ["string"],
  "status": "missing|proposed|locked"
}
```

Le reducer peut verrouiller seulement ce que le contrat autorise.

## Active Flow, Inline Tool, Child Flow

Il faut distinguer :

- parent flow actif ;
- inline tool temporaire ;
- child flow reel ;
- transition definitive ;
- safety preemption.

Definitions :

- `product_help` et `status_recap` sont souvent des inline roundtrips ;
- `safety_crisis` est une preemption ;
- `clarification` est un flow local transverse ;
- bridges potions/cartes/rappels sont des transitions locales ;
- global est uniquement pour `exit_to_global_dispatcher`.

Un inline tool ne doit pas effacer l'etat parent.

Un child flow ne doit pas relancer le dispatcher global sauf si son dispatcher
local sort lui-meme vers global.

## Invalid JSON Et Fallback

Si la sortie dispatcher est invalide :

- retry structure si possible ;
- sinon produire une clarification safe minimale ;
- ne pas faire de decision metier par code ;
- ne pas appeler global silencieusement pendant un flow actif ;
- ne pas utiliser un renderer generique ;
- ne pas "continuer utilement" hors contrat.

## Observabilite

Chaque tour local doit etre observable.

Logs attendus :

- `local_dispatcher_called` ;
- `local_dispatcher_result` ;
- `flow_action` ;
- `visible_task.kind` ;
- `note_information_created` ;
- `note_information_consumed` ;
- `db_context_pack_loaded` ;
- `target_dispatcher` ;
- `global_dispatcher_skipped` ;
- `inline_tool_roundtrip` ;
- `exit_to_global_dispatcher` ;
- `risk_score`.

Un changement de dispatcher sans trace de `note_information` est un bug de QA.

## Tests Minimum Par Dispatcher Local

Chaque dispatcher local doit avoir au minimum :

- continue local ;
- missing info ;
- response vague stays local ;
- response claire avance ;
- revision ;
- repeat ;
- apply_attempt si handoff ;
- inline product ;
- inline status ;
- exit global avec note ;
- cancel/defer/complete ;
- exit global with note ;
- handoff local with note ;
- safety with note ;
- invalid JSON safe handling ;
- no forbidden wording ;
- no renderer deterministic nominal ;
- no business regex ;
- no global while active.

## Checklist Agent

Avant de considerer un dispatcher local conforme, verifier :

- [ ] Le dispatcher ne repond jamais directement au user.
- [ ] Le dispatcher ne contient pas de regex metier.
- [ ] Le dispatcher ne contient pas de routing deterministe par mots-cles.
- [ ] Le flow actif skip le dispatcher global normal.
- [ ] Chaque `flow_action` a une suite exacte.
- [ ] Chaque `visible_task.kind` a un prompt stage-specific.
- [ ] Il n'y a pas un unique agent conversationnel generaliste.
- [ ] `visible_task.conversation_context` est suffisant.
- [ ] Les exits communs sont presents.
- [ ] Aucun `exit_to_global_dispatcher` legacy ne reste dans les contrats
      actifs.
- [ ] Un arret de flow passe par `exit_to_global_dispatcher` avec
      `note_information` avant toute reprise globale.
- [ ] `exit_to_global_dispatcher` produit une `note_information`.
- [ ] `safety_preempt` produit une `note_information` vers safety.
- [ ] Les inline tools conservent le parent flow.
- [ ] Les context packs DB utiles sont injectes.
- [ ] Le contexte porte source/evidence/confidence.
- [ ] Les transitions locales passent par le dispatcher cible avec note.
- [ ] Aucun renderer visible deterministe n'est dans le chemin nominal.
- [ ] Les tests couvrent continue, exit, safety, stop, inline, revision.
