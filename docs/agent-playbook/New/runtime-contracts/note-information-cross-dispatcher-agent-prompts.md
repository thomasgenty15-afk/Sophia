# Note Information Cross-Dispatcher Migration - Agent Prompts

Ce document contient trois prompts pour lancer trois agents specialises sur la
generalisation de la `note_information`.

Principe cible :

- des qu'un dispatcher transfere l'ownership a un autre dispatcher, il produit
  une `note_information` ;
- cette note est transmise au prochain dispatcher, global ou local ;
- elle aide le prochain dispatcher a remplir son JSON sans repartir a froid ;
- elle n'est jamais un message visible user ;
- elle ne doit jamais devenir un raccourci deterministe de routing ;
- exception explicite : le passage interne `select_state_potion -> sous-skill
  potion` peut rester sur son contrat specialise deja structure.

La `note_information` canonique contient toujours :

```json
{
  "source_flow_id": "string",
  "target_dispatcher": "global|safety_crisis|select_state_potion|product_help|status_recap|verification_opportunities|other_local",
  "handoff_reason": "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request|clarification_resolved",
  "handoff_context_for_next_dispatcher": "Contexte utile au prochain dispatcher pour remplir son JSON.",
  "user_words": ["string"],
  "structured_context": {},
  "confidence": "low|medium|high"
}
```

`confidence` est optionnel si le flow n'a pas de champ equivalent.
`structured_context` est obligatoire. Les champs `source_flow_presentation`,
`source_flow_state_summary`, `target_local_dispatcher_hint`, `risk_score` et
`no_chat_mutation` ne font plus partie du contrat canonique.

## Agent 1 - Catalogue Des Flows Et Presentations

```txt
Mission : construire le catalogue source des flows qui peuvent avoir un dispatcher local, avec une presentation standardisee de chaque flow et les sorties qui changent d'ownership.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Contexte architecture :
Sophia Brain migre vers une architecture ou un flow actif est owned par son dispatcher local. Le dispatcher global normal ne fonctionne pas pendant un flow actif. Quand un flow local detecte une vraie sortie vers un autre dispatcher, il doit transmettre une note_information au prochain dispatcher.

Reference obligatoire :
- docs/agent-playbook/New/runtime-contracts/Note d'information
- docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md
- docs/agent-playbook/New/runtime-contracts/01-global-runtime.md
- docs/agent-playbook/New/runtime-contracts/07-active-handoff-arbitration.md

Docs a inventorier :
- docs/agent-playbook/New/runtime-contracts/tools/*local-dispatcher-prompts.md
- docs/agent-playbook/New/runtime-contracts/tools/*.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/*local*.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/*.md
- docs/agent-playbook/New/runtime-contracts/proactive/*local*.md
- docs/agent-playbook/New/runtime-contracts/proactive/*.md

Code a inventorier :
- supabase/functions/sophia-brain/router/*
- supabase/functions/sophia-brain/skills/**/*
- supabase/functions/sophia-brain/tools/operations/**/*
- supabase/functions/sophia-brain/post_morning_nudge.ts
- supabase/functions/sophia-brain/*daily*
- supabase/functions/sophia-brain/*weekly*

Tache :
1. Identifier tous les flows avec dispatcher local existant ou prevu.
2. Identifier les flows inline qui peuvent etre appeles pendant un autre flow :
   - product_help / get_info_product
   - status_recap / get_info_db
   - verification opportunities si applicable
   - safety_crisis
3. Pour chaque flow, rediger une presentation standardisee de deux lignes maximum.
4. Pour chaque flow, lister :
   - flow_id canonique ;
   - type : tool_flow, conversation_skill, proactive_followup, safety_flow, inline_info_flow ;
   - dispatcher local attendu ;
   - etat actif attendu ;
   - continuations locales sans changement de dispatcher ;
   - sorties vers global ;
   - sorties vers un dispatcher local specifique ;
   - signaux safety ;
   - outils inline disponibles ;
   - notes deja presentes ou manquantes.
5. Distinguer clairement :
   - exit_to_global_dispatcher ;
   - handoff_to_local_dispatcher ;
   - safety_preempt ;
   - inline_tool_roundtrip.

Cas important :
Si le user dit une phrase du type "laisse tomber", "arrete tes questions" ou
"ca me saoule tes questions" pendant un flow local actif, le dispatcher local
actif doit d'abord produire `exit_to_global_dispatcher` avec une
`note_information` exploitable vers `target_dispatcher="global"`.

Livrable attendu :
Creer ou proposer un document :
docs/agent-playbook/New/runtime-contracts/flow-presentation-catalog.md

Format recommande :
```md
# Flow Presentation Catalog

## Flow Id
- Presentation: ...
- Type: ...
- Local dispatcher: ...
- Active state key: ...
- Can handoff to:
  - global dispatcher: yes/no, reasons
  - safety_crisis: yes/no
  - product_help inline: yes/no
  - status_recap inline: yes/no
  - select_state_potion: yes/no
- Local non-transfer actions:
- Required note_information on ownership transfer:
- Missing work:
```

Contraintes :
- Pas de regex metier.
- Pas de modele deterministe de routing.
- Pas de renderer visible.
- Pas de correction code dans cette mission.
- Ne pas inventer un flow absent du repo : si un flow est seulement prevu en docs, le marquer comme planned.
- Ne pas modifier la logique runtime.

Validation :
- Le catalogue couvre tous les fichiers de prompts locaux trouves.
- Chaque flow a une presentation de deux lignes maximum.
- Chaque changement potentiel de dispatcher est visible.
- Les continuations locales sont distinguees des sorties globales.
- Le passage select_state_potion -> sous-skill potion est marque comme exception deja specialisee.
```

## Agent 2 - Contrat Transverse Note Information

```txt
Mission : formaliser le contrat transverse `note_information` dans les docs runtime et dans les prompts de dispatchers locaux, a partir du catalogue produit par l'Agent 1.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Dependance :
Commencer seulement apres le livrable de l'Agent 1 :
- docs/agent-playbook/New/runtime-contracts/flow-presentation-catalog.md

References obligatoires :
- docs/agent-playbook/New/runtime-contracts/Note d'information
- docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md
- docs/agent-playbook/New/runtime-contracts/01-global-runtime.md
- docs/agent-playbook/New/runtime-contracts/07-active-handoff-arbitration.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/safety-crisis-local-flow-architecture.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/emotional-repair-local-flow-architecture.md
- docs/agent-playbook/New/runtime-contracts/conversation-skills/demotivation-repair-local-flow-architecture.md

Objectif :
Definir un contrat unique pour toutes les transitions de dispatcher :
1. flow local -> global dispatcher ;
2. flow local -> safety_crisis local dispatcher ;
3. flow local -> product_help inline ;
4. flow local -> status_recap / get_info_db inline ;
5. emotional_repair -> select_state_potion ;
6. demotivation_repair -> select_state_potion ;
7. proactive local flow -> global dispatcher ;
8. tool local flow -> global dispatcher ;
9. arret du flow local actif vers global via note_information.

Important :
Une note_information est obligatoire des qu'il y a changement de dispatcher.
Quand le user veut arreter un flow local actif, cela compte comme une sortie
vers le dispatcher global : `exit_to_global_dispatcher` + `note_information`
obligatoire avant toute reprise globale.

Contrat JSON cible recommande :
```json
{
  "note_information": {
    "source_flow_id": "string",
    "target_dispatcher": "global|safety_crisis|select_state_potion|product_help|status_recap|verification_opportunities|other_local",
    "handoff_reason": "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request|clarification_resolved",
    "handoff_context_for_next_dispatcher": "string",
    "user_words": ["string"],
    "structured_context": {},
    "confidence": "low|medium|high"
  }
}
```

`confidence` est optionnel si le flow n'a pas de champ equivalent.
`structured_context` est obligatoire.

Tache :
1. Mettre a jour la doctrine docs pour rendre la note_information transverse.
2. Mettre a jour la note existante ou creer un contrat plus propre qui la remplace sans perdre son sens.
3. Pour chaque dispatcher local documente, ajouter :
   - quand produire note_information ;
   - quand ne pas la produire ;
   - comment choisir target_dispatcher ;
   - quoi mettre dans handoff_context_for_next_dispatcher.
   - quoi mettre dans structured_context obligatoire.
4. Ajouter explicitement les actions locales qui ne changent pas d'ownership
   et ne doivent pas etre utilisees pour arreter un flow actif.
5. Standardiser les exits :
   - exit_to_global_dispatcher = autre sujet clair ou demande hors flow ;
   - safety_preempt = passage a safety_crisis ;
   - handoff_to_local_dispatcher = bridge vers un flow local cible ;
   - inline_tool_roundtrip = product/help/status puis retour au flow parent ;
   - exit_to_global_dispatcher = arret local sans rerouting.

Contraintes non negociables :
- Pas de regex metier.
- Pas de message.includes metier.
- Pas de routing deterministe depuis une note.
- Pas de renderer visible.
- Pas de template user-facing.
- Le dispatcher produit du JSON, jamais de message visible.
- Le visible agent ne decide pas.
- Le reducer ne fait que valider le contrat et choisir la visible_task.
- La note_information ne doit pas devenir un second dispatcher cache.

Livrables attendus :
1. Un document de contrat transverse, par exemple :
   docs/agent-playbook/New/runtime-contracts/09-note-information-contract.md
2. Patches docs sur les contrats locaux existants pour mentionner la note.
3. Une matrice des transitions :
   source_flow -> target_dispatcher -> note required yes/no -> source ownership.
4. Une liste de questions ouvertes si certains flows sont ambigus.

Validation :
- Tous les changements de dispatcher ont note_information required.
- Les arrets de flow local actif passent par `exit_to_global_dispatcher` avec
  `note_information` avant toute reprise globale.
- Safety local recoit une note quand il est pickup par un dispatcher local.
- Product help/status recap recoivent une note quand appeles inline.
- Emotional repair et demotivation repair transmettent une note a select_state_potion.
- L'exception select_state_potion -> sous-skill potion est documentee.
```

## Agent 3 - Implementation Runtime Et QA

```txt
Mission : implementer le support runtime de `note_information` apres validation des livrables Agent 1 et Agent 2.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Dependances :
Ne pas commencer avant d'avoir lu :
- docs/agent-playbook/New/runtime-contracts/flow-presentation-catalog.md
- docs/agent-playbook/New/runtime-contracts/09-note-information-contract.md
- docs/agent-playbook/New/runtime-contracts/Note d'information

Code a etudier avant modification :
- supabase/functions/sophia-brain/router/run.ts
- supabase/functions/sophia-brain/router/active_flow_state.ts
- supabase/functions/sophia-brain/router/agent_exec.ts
- supabase/functions/sophia-brain/router/*dispatcher*
- supabase/functions/sophia-brain/tools/operations/inline_info_tools.ts
- supabase/functions/sophia-brain/tools/operations/select_state_potion/**/*
- supabase/functions/sophia-brain/skills/safety_crisis/**/*
- supabase/functions/sophia-brain/skills/emotional_repair/**/*
- supabase/functions/sophia-brain/skills/demotivation_repair/**/*
- supabase/functions/sophia-brain/post_morning_nudge.ts
- tous les reducers de flows locaux identifies par le catalogue.

Objectif runtime :
1. Ajouter un type partage `NoteInformation`.
2. Ajouter un catalogue runtime des presentations de flows, genere ou maintenu depuis le catalogue docs.
3. Ajouter `note_information` aux contrats de sortie des dispatchers locaux.
4. Propager la note lors des transitions :
   - local -> global dispatcher ;
   - local -> safety_crisis local dispatcher ;
   - local -> product_help inline ;
   - local -> status_recap/get_info_db inline ;
   - emotional_repair -> select_state_potion ;
   - demotivation_repair -> select_state_potion ;
   - proactive/tool local flow -> autre dispatcher.
5. Ne pas propager vers le global tant que le dispatcher local actif n'a pas
   produit `exit_to_global_dispatcher` avec `note_information`.
6. Ajouter des logs/trace de transition :
   - source_flow_id
   - target_dispatcher
   - handoff_reason
   - has_note_information
   - structured_context_present
   - risk_score
   - request_id
7. Faire consommer la note par le prompt du prochain dispatcher comme contexte system/developer, pas comme message user.

Cas critique a corriger :
Si un flow local detecte "arrete tes questions", "laisse tomber" ou
"ca me saoule tes questions" :
- le dispatcher local doit produire `exit_to_global_dispatcher` ;
- `note_information.target_dispatcher` doit etre `global` ;
- le reducer ferme l'etat actif source ;
- le dispatcher global peut ensuite reprendre depuis cette note ;
- pas de question finale locale ;
- pas de tool ni effet durable emis par le flow source.

Cas safety :
Si un dispatcher local detecte safety_preempt :
- il produit note_information avec source_flow_id, target_dispatcher,
  handoff_context_for_next_dispatcher et structured_context utile ;
- le runtime passe au dispatcher local safety_crisis ;
- le global dispatcher normal ne decide pas ;
- risk_score reste connecte a la pipeline de surveillance.

Cas bridge potion :
Si emotional_repair ou demotivation_repair passe vers select_state_potion :
- produire note_information ;
- demarrer select_state_potion avec selected_potion si connu ;
- injecter note_information dans le dispatcher local cible ;
- ne pas refaire passer le message par le global comme decideur metier ;
- ne pas demander au user de repeter l'episode deja clarifie.

Cas inline tools :
Si un flow actif appelle product_help ou get_info_db/status_recap :
- produire note_information ;
- inclure active_flow + contexte question ;
- le tool repond ;
- retour au flow parent ;
- aucune perte d'etat actif.

Contraintes non negociables :
- Ne pas utiliser de regex metier.
- Ne pas utiliser `message.includes` pour decider une intention.
- Ne pas ajouter de renderer visible deterministe dans le chemin nominal.
- Ne pas ajouter de modele de routing deterministe.
- Ne pas faire de DB write sauf flow explicitement autorise.
- Ne pas appeler le global dispatcher pendant un flow actif sauf si le local dispatcher a produit exit_to_global_dispatcher.
- Ne pas appeler le global dispatcher pour exit_to_global_dispatcher.
- Ne jamais lancer une potion depuis le chat.
- Ne pas executer `supabase db reset`.
- Ne pas faire de commandes Supabase destructives.

Tests unitaires attendus :
1. Active flow exit :
   - input user veut arreter le flow ;
   - local dispatcher action `exit_to_global_dispatcher` ;
   - `note_information.target_dispatcher=global` ;
   - active state source cleared selon flow ;
   - visible ack court.
2. Active flow topic change :
   - local dispatcher exit_to_global_dispatcher ;
   - note_information required ;
   - global receives note on second analysis.
3. Active flow safety :
   - local dispatcher safety_preempt ;
   - note_information required ;
   - safety_crisis local dispatcher receives note ;
   - global normal skipped.
4. Emotional repair -> potion :
   - note_information present ;
   - select_state_potion receives origin context ;
   - selected potion preserved ;
   - no global semantic reroute.
5. Demotivation repair -> potion :
   - note_information present ;
   - clarte/courage/rappel bridge context preserved ;
   - `rappel` renders visible label `Potion anti-décrochage`.
6. Product help inline :
   - note_information includes active_flow and question context ;
   - parent flow resumes.
7. Status recap inline :
   - note_information includes active_flow and DB/status question context ;
   - parent flow resumes.

Runs IA reels attendus :
1. Whatsapp onboarding plan ready, user says :
   "Ca me saoule tes questions la, je sais pas, laisse tomber"
   Expected : local stop/defer ack, no global, no question, no track_progress_plan_item.
2. Prepare attack card active, user asks :
   "C'est quoi une carte attaque deja ?"
   Expected : product_help inline with note, then return parent flow.
3. Demotivation repair active, user says :
   "Je crois que j'ai surtout perdu le pourquoi"
   Expected : diagnose/bridge offer clarte; if user consents, select_state_potion.clarte receives note.
4. Emotional repair active, user consents to potion apaisement.
   Expected : select_state_potion.apaisement receives note with origin emotional_repair.
5. Any active flow, user says clear safety content.
   Expected : safety_crisis local dispatcher receives note, global skipped.
6. Any active flow, user says :
   "laisse ca, aide-moi a prioriser"
   Expected : exit_to_global_dispatcher with note, then global routes normally.

Observabilite attendue :
Ajouter des logs avec tag stable, par exemple :
- local_dispatcher_transition
- note_information_created
- note_information_consumed
- exit_to_global_dispatcher
- local_to_global_with_note
- local_to_safety_with_note
- local_inline_tool_with_note
- local_to_local_bridge_with_note

Livrable final :
- Code compile.
- Tests unitaires ajoutes ou mis a jour.
- Rapport QA court dans le format repo si disponible.
- Liste des flows couverts.
- Liste des flows restants ou ambigus.
- Confirmation explicite :
  - aucun regex metier ajoute ;
  - aucun renderer visible deterministe ajoute ;
  - global dispatcher normal non appele pendant active flow sauf exit_to_global_dispatcher ;
  - note_information presente sur chaque changement de dispatcher.
```
