# update_coach_preferences - Local Dispatcher Doctrine Audit And V1 Plan

Reference obligatoire lue avant ce document :
`docs/agent-playbook/New/runtime-contracts/11-local-dispatcher-doctrine.md`

Flow audite : `update_coach_preferences`

Objectif V1 : fiabilite, efficacite, fluidite conversationnelle, suppression du
legacy rigide, stabilisation rapide du flow local.

## 0. Brainstorming Produit Avant Architecture

### But exact du flow

`update_coach_preferences` sert a modifier depuis le chat uniquement les
preferences coach durables supportees par le runtime :

- `coach.tone`: `soft`, `warm_direct`, `direct`
- `coach.challenge_level`: `low`, `balanced`, `high`
- `coach.question_tendency`: `low`, `normal`, `high`

Le flow ne doit pas devenir un outil general de personnalisation de Sophia. Il
doit ecrire en DB seulement quand la demande est claire, durable, supportee,
non ambigue, non bloquee par risk/safety, et structurellement `locked` apres
reducer.

Demandes non stockables durablement par ce flow :

- longueur exacte ;
- usage ou absence d'emoji ;
- "ne termine jamais par une question finale" ;
- ordre de reponse action-avant-question ;
- format strict ;
- regle conditionnelle cachee ;
- style trop specifique non representable par les trois reglages.

Ces demandes doivent rester locales et non-mutantes : consigne ponctuelle,
explication "non supporte durablement", ou mapping partiel propose avec
confirmation explicite.

### Etats possibles

Etat local nominal : `__coach_preference_flow_state_v1`.

Etats V1 cibles :

- `collecting`: le flow cherche durabilite, setting ou valeur.
- `proposed`: mapping partiel propose, confirmation requise.
- `write_ready`: reducer a valide une update `locked`; writer peut tenter DB.
- `written`: commit DB realise; flow peut se clore.
- `blocked`: validation, risk, safety ou DB bloque l'ecriture.
- `cancelled`: user stoppe/annule sans autre sujet clair.
- `exit`: user change clairement de sujet et le global peut reprendre avec note.

Stages V1 :

- `durability`
- `setting`
- `value`
- `confirmation`
- `done`

### Champs et decisions a stabiliser

Le dispatcher local stabilise seulement des structures, pas de texte visible :

- intention : durable supported, durable unsupported, punctual, ambiguous,
  status, explain, cancel, topic_change, safety ;
- durabilite : durable, ponctuelle, ambigue, non applicable ;
- support : supported, unsupported, partial, ambiguous, non applicable ;
- preference updates : key, value, status, label user-facing, reason, besoin de
  confirmation ;
- unsupported_parts ;
- missing_decisions ;
- visible_task.kind ;
- visible_task.conversation_context ;
- note_information pour tout changement de dispatcher ;
- risk_score et evidence.

Le reducer verrouille seulement :

- enums valides ;
- key/value supportees ;
- pas de doublon ;
- confidence non low ;
- risk sous seuil ;
- durable_supported + durable + supported ;
- update `locked` ;
- commit DB requis avant claim visible de succes.

### Reponses user possibles

Pendant le flow actif, le user peut :

- donner une valeur claire : "sois plus direct", "challenge-moi plus" ;
- preciser la durabilite : "oui, pour la suite", "juste maintenant" ;
- confirmer une proposition : "ok applique", "oui note-le" ;
- refuser : "non", "laisse tomber" ;
- reviser : "non plutot plus doux", "en fait challenge moyen" ;
- demander repetition : "tu proposes quoi deja ?" ;
- demander aide produit : "c'est quoi les niveaux ?" ;
- demander status DB : "quelles preferences coach sont actives ?" ;
- donner une consigne ponctuelle : "la maintenant sois direct" ;
- demander une preference unsupported : "pas d'emoji et trois lignes" ;
- changer de sujet : "aide-moi a revoir mon plan" ;
- declencher safety : crise, autodestruction, urgence, risque fort.

### Signaux d'exit

- `exit_to_global_dispatcher`: le user veut arreter/annuler sans nouveau sujet.
  Reponse locale courte, pas de dispatcher global sur ce tour.
- `exit_to_global_dispatcher`: nouveau sujet clair. Note obligatoire, le meme
  message peut etre reanalyse par le dispatcher global.
- `safety_preempt`: risque prioritaire. Note obligatoire vers
  `safety_crisis.local_dispatcher`, pas de dispatcher global normal.
- `inline_tool_roundtrip`: question produit/status temporaire. Note obligatoire
  vers `product_help` ou `status_recap`, parent flow preserve.
- `handoff_to_local_flow`: non requis en V1 pour ce flow hors safety. Si un
  autre flow local explicite est demande ("je veux une potion", "prepare une
  carte"), utiliser `exit_to_global_dispatcher` avec note exploitable, sauf
  decision future de bridge direct documente.

### Safety

Safety n'est pas un cas de rendu local. Le dispatcher local doit classer
`safety_preempt`, produire une `note_information` cible
`safety_crisis`, suspendre/fermer le flow selon risk, et laisser le dispatcher
local safety produire son propre `conversation_context`.

### Inline tools possibles

- `status_recap`: read-only, DB-grounded, focus `coach_preferences`.
- `product_help`: read-only/non-mutant, explication des reglages coach,
  `origin_flow=update_coach_preferences`.

Ces inline tools ne deviennent pas owner final du flow parent. Le retour inline
doit conserver l'etat parent et ajouter un resume compact dans
`subskill_history`.

### Passages depuis un autre flow

Le dispatcher local peut etre active avec `note_information_inbound` depuis :

- dispatcher global : demande explicite de mutation de preferences coach ;
- `flow_opportunity_verification`: user accepte une opportunite de modifier une
  preference ;
- `product_help`: user a demande une explication produit puis veut appliquer un
  reglage ;
- `status_recap`: user a demande son etat puis veut modifier une preference ;
- un autre flow actif : user interrompt ce flow pour modifier le style de
  Sophia.

Le dispatcher local consomme la note comme contexte source, jamais comme ordre
irrevisable.

### Prompts conversationnels necessaires

Le flow ne doit pas avoir un agent visible unique generaliste. Les prompts
stage-specific V1 necessaires sont :

- `preference_saved`
- `ask_durable_vs_punctual`
- `ask_setting_or_value`
- `confirm_supported_mapping`
- `punctual_instruction_ack`
- `unsupported_preference`
- `repeat_current_preference_flow`
- `write_failed_or_blocked`
- `inline_tool_return`
- `stop_or_cancel`
- `exit_ack`
- `safety_transition`

`get_info_db` et `get_info_product` ne sont pas des prompts visibles principaux
du parent : ils appellent respectivement `status_recap` et `product_help` via
inline roundtrip. Le parent peut ensuite utiliser `inline_tool_return` seulement
si une phrase locale de reprise est necessaire.

### Contexte DB utile au dispatcher

`db_context_pack` utile :

- preferences coach actuelles, seulement les cles supportees ;
- pour chaque preference : key, value, label, source_type, updated_at,
  last_confirmed_at, reason si disponible ;
- derniere proposition locale active ;
- dernier commit local du flow ;
- unsupported_parts deja identifiees ;
- catalogue supporte des trois reglages ;
- contexte produit minimal des surfaces coach preferences ;
- risk/safety band, channel, timezone.

Plans, actions, cartes, rappels et potions ne sont pas utiles a ce flow, sauf
si le user change de sujet. Dans ce cas, il faut sortir avec note plutot que
charger tout ce contexte dans `update_coach_preferences`.

### Micro memory context

Pour V1, `micro_memory_context` n'est pas charge par defaut.

Justification :

- le flow porte sur des reglages fermes et actuels ;
- le contexte recent et l'etat local suffisent ;
- les preferences actives viennent de la DB, pas de la memoire ;
- les passages depuis opportunites/product/status doivent transmettre une
  `note_information`, pas un dump memoire ;
- une memoire de profil conversationnel global risquerait de verrouiller des
  hypotheses non confirmees.

Budget V1 : `0` item.

Exception future limitee : 1 a 2 items maximum si un parent flow transmet une
note indiquant qu'une frustration conversationnelle recente doit etre preservee
comme evidence de mapping. Meme dans ce cas, la memoire ne verrouille jamais une
update durable.

## 1. Diagnostic Du Flow Actuel

### Ce qui respecte deja la doctrine

- `router/run.ts` detecte `__coach_preference_flow_state_v1` actif et construit
  une route locale `selected_handler=update_coach_preferences` avec
  `global_dispatcher` bloque.
- `local_flow.ts` appelle un dispatcher IA local qui retourne du JSON strict et
  ne repond pas directement au user.
- Le reducer valide cles, valeurs, statuts, confidence, risk, durabilite,
  support status et update `locked`.
- Le writer DB est borne a `user_profile_facts` via les cles supportees.
- Le commit DB conditionne `executedTools=["update_coach_preferences"]` et
  `committed_effects`.
- `status_recap` et `product_help` existent comme subskills inline dans le
  routeur local.
- Les tests unitaires couvrent le write direct, no-write ponctuel/unsupported,
  mapping propose puis confirmation, et deux cas inline.

### Divergences doctrinales

- Le contrat local expose `exit_memo` au lieu de `note_information` canonique.
- `visible_task` ne contient pas `conversation_context`; il contient seulement
  `kind` et `instruction`.
- L'agent visible recoit encore `local_state` et `current_preferences`, donc un
  contexte plus brut que le `conversation_context` filtre attendu.
- `visible_agent.ts` est un agent visible unique avec switch par stage. Il faut
  des prompts stage-specific distincts, meme s'ils peuvent partager un petit
  helper de JSON parsing.
- `router.ts` contient `fallbackVisibleMessage`, qui est un renderer visible
  deterministe avec templates fixes.
- `safety_preempt` reste rendu localement via `visible_task.kind=safety` au lieu
  de produire une transition obligatoire vers `safety_crisis.local_dispatcher`.
- `status_question` et `explain_preferences` appellent les subskills, mais la
  note inline canonique n'est pas produite/tracee comme `note_information`.
- Le legacy `platform_handoff`, `handoff_draft`, `slot_filler`, `generator`,
  `renderer` et `executor` reste dans les types/fichiers du dossier et peut
  polluer les chemins ou les tests.
- `routeIsSelected` lit encore `__coach_preference_handoff_state_v1` pour
  selectionner le flow. Cette lecture peut rester temporaire pour migration,
  mais elle ne doit pas piloter le chemin nominal.
- Le run QA r3 a montre que des demandes de preference durable peuvent encore
  etre traitees hors skill par le global/normal reply. C'est une dependance de
  routing global, mais le flow local doit aussi etre capable d'entrer depuis une
  note inbound propre.

### Legacy a supprimer ou isoler

- `renderer.ts` : ne doit pas etre dans le chemin nominal.
- `slot_filler.ts` : ancien second decideur de handoff plateforme.
- `generator.ts` : constructeur de handoff plateforme, utile seulement legacy.
- `executor.ts` : ancien executor bloquant `chat_mutation_disabled_platform_handoff`.
- Types `CoachPreferenceHandoff*` dans `contract.ts` : a deplacer ou marquer
  legacy pour ne pas melanger contrat local V1 et handoff legacy.
- Etats `__coach_preference_handoff_state_v1` : lecture migration douce
  seulement, jamais source nominale.

### Risques

- Faux succes visible si le visible agent ou fallback dit "c'est note" sans
  commit.
- Global dispatcher actif par erreur si l'etat local n'est pas reconnu.
- Perte d'etat parent apres product/status inline.
- Safety traitee comme simple blocage preference au lieu de preemption.
- Product help standalone peut capturer une demande mutante apres explication
  et ne pas revenir vers `update_coach_preferences`.
- Tests unitaires verts mais doctrine non respectee faute de tests
  `note_information`, `conversation_context`, no-fallback et no-global.

## 2. Architecture Cible

### Schema runtime V1

```txt
message user
-> si __coach_preference_flow_state_v1 actif:
     skip dispatcher global normal
     load db_context_pack compact
     load micro_memory_context = {items: []}
     update_coach_preferences.local_dispatcher
     reducer / validator
     si write_ready -> writer DB borne
     si inline_tool_roundtrip -> note_information -> subskill -> retour parent
     si safety_preempt -> note_information -> safety_crisis.local_dispatcher
     si exit_to_global_dispatcher -> note_information -> global dispatcher
     sinon -> visible_task.conversation_context
              -> prompt conversationnel stage-specific
              -> message visible

message user sans flow actif
-> dispatcher global peut selectionner update_coach_preferences
-> creation initiale avec note_information inbound obligatoire
-> meme runtime local
```

### Dispatcher local

Responsabilites :

- analyser le message dans le contexte du flow actif ou de la note inbound ;
- classer l'intention locale ;
- produire `flow_action` ;
- produire les updates candidates avec status ;
- produire `visible_task.kind` et `visible_task.conversation_context` ;
- produire `note_information` si changement de dispatcher ;
- produire risk_score/evidence ;
- ne jamais ecrire de message visible.

Input standard cible :

```json
{
  "current_user_message": "string",
  "recent_messages": [],
  "active_flow_state": {},
  "note_information_inbound": {},
  "db_context_pack": {},
  "micro_memory_context": { "items": [] },
  "platform_context": { "timezone": "Europe/Paris", "channel": "web" },
  "risk_context": {},
  "available_inline_tools": ["status_recap", "product_help"],
  "parent_flow_context": {}
}
```

### Reducer

Le reducer ne reclassifie jamais le message user.

Il valide :

- JSON et enums ;
- coherence `flow_action` -> `visible_task.kind` ou transition ;
- coherence `flow_action` -> `note_information` quand target dispatcher ;
- key/value/status ;
- no duplicate ;
- confidence/risk ;
- write gates ;
- no committed success sans commit ;
- parent flow preserve pour inline roundtrip ;
- stop/cancel ne declenche jamais global.

### Conversation context

`conversation_context` est le seul contexte donne au prompt visible local.

Schema cible commun :

```json
{
  "state_summary": "string",
  "field_or_stage": "durability|setting|value|confirmation|done|null",
  "known_values": {
    "current_preferences": [],
    "proposed_updates": [],
    "committed_updates": []
  },
  "missing_or_weak_values": [],
  "selected_candidate": {},
  "unsupported_parts": [],
  "write_result": {
    "committed": false,
    "preference_keys": [],
    "blocked_reason": null
  },
  "inline_tool_result": {
    "skill_id": null,
    "summary": null
  },
  "tone_constraints": [],
  "do_not_say": [
    "Ne pas dire que c'est enregistre si write_result.committed=false.",
    "Ne pas mentionner dashboard comme chemin nominal pour une preference supportee."
  ],
  "context_summary": "string|null",
  "evidence_used": []
}
```

Le prompt visible ne recoit pas `db_context_pack`, `micro_memory_context`,
raw temp memory, ou state complet.

### Transitions vers autres dispatchers

- `inline_tool_roundtrip` -> `status_recap`: status preferences coach.
- `inline_tool_roundtrip` -> `product_help`: explication reglages coach.
- `safety_preempt` -> `safety_crisis.local_dispatcher`.
- `exit_to_global_dispatcher` -> global normal, uniquement nouveau sujet clair.
- `exit_to_global_dispatcher` / `cancel_flow`: pas de dispatcher cible.

Chaque transition sauf stop local porte une `note_information`.

## 3. Contrat JSON Du Dispatcher Local

### Actions possibles

Actions locales :

- `write_preferences`
- `clarify_durable_vs_punctual`
- `clarify_supported_setting`
- `clarify_value`
- `propose_supported_mapping`
- `confirm_proposed_mapping`
- `punctual_instruction`
- `unsupported_preference`
- `revise_preferences`
- `repeat_current_state`
- `exit_to_global_dispatcher`
- `cancel_flow`
- `complete_flow`

Actions de transition :

- `inline_tool_roundtrip`
- `exit_to_global_dispatcher`
- `safety_preempt`
- `handoff_to_local_flow` (reserve, non nominal V1)

Compatibilite legacy possible :

- accepter en normalisation `status_question` comme alias de
  `inline_tool_roundtrip` target `status_recap` ;
- accepter `explain_preferences` comme alias de `inline_tool_roundtrip` target
  `product_help` ;
- accepter `repeat_saved_preferences` comme alias de `repeat_current_state`.

### JSON cible

```json
{
  "flow_action": "write_preferences|clarify_durable_vs_punctual|clarify_supported_setting|clarify_value|propose_supported_mapping|confirm_proposed_mapping|punctual_instruction|unsupported_preference|revise_preferences|repeat_current_state|exit_to_global_dispatcher|cancel_flow|complete_flow|inline_tool_roundtrip|exit_to_global_dispatcher|safety_preempt|handoff_to_local_flow",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "preference_intent": {
    "kind": "durable_supported|durable_unsupported|punctual_instruction|ambiguous|status_question|explain|cancel|topic_change|safety",
    "durability": "durable|punctual|ambiguous|not_applicable",
    "support_status": "supported|unsupported|partial|ambiguous|not_applicable",
    "summary": "string"
  },
  "preference_updates": [
    {
      "key": "coach.tone|coach.challenge_level|coach.question_tendency",
      "value": "soft|warm_direct|direct|low|balanced|high|normal",
      "status": "missing|proposed|locked|rejected",
      "user_facing_label": "string",
      "user_facing_value": "string",
      "reason": "string",
      "needs_user_confirmation": true,
      "source": "user_message|db_context|note_information|inference",
      "confidence": "low|medium|high",
      "evidence": ["string"]
    }
  ],
  "unsupported_parts": ["string"],
  "missing_decisions": ["durability|setting|value|confirmation"],
  "visible_task": {
    "kind": "preference_saved|ask_durable_vs_punctual|ask_setting_or_value|confirm_supported_mapping|punctual_instruction_ack|unsupported_preference|repeat_current_state|write_failed_or_blocked|inline_tool_return|stop_or_cancel|exit_ack|safety_transition",
    "conversation_context": {}
  },
  "note_information": {
    "needed": false,
    "source_flow_id": "update_coach_preferences",
    "source_flow_presentation": "Modifies the small supported set of coach style preferences from chat when the request is clear, durable, supported, and consented.",
    "source_flow_state_summary": "string",
    "handoff_reason": "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request",
    "target_dispatcher": "global|safety_crisis|product_help|status_recap|other_local",
    "handoff_context_for_next_dispatcher": "string",
    "target_local_dispatcher_hint": "string|null",
    "structured_context": {
      "source_flow": "update_coach_preferences",
      "active_flow_summary": "string",
      "collected_state": {},
      "unresolved_questions": [],
      "committed_effects": [],
      "unsupported_parts": [],
      "same_user_message_should_be_reanalysed": true
    },
    "risk_score": 0,
    "no_chat_mutation": {
      "db_write_committed": false,
      "potion_session_created": false,
      "scheduled_checkin_created": false,
      "recurring_reminder_created": false,
      "executable_confirmation_generated": false
    }
  },
  "safety": {
    "risk_band": "none|low|medium|high|critical",
    "reason_codes": [],
    "should_preempt": false
  },
  "evidence": ["string"]
}
```

### `note_information` obligatoire

Obligatoire si :

- `flow_action=inline_tool_roundtrip`
- `flow_action=exit_to_global_dispatcher`
- `flow_action=safety_preempt`
- `flow_action=handoff_to_local_flow`

Interdite ou `needed=false` si :

- `exit_to_global_dispatcher`
- `cancel_flow` sans nouveau sujet
- `punctual_instruction`
- `unsupported_preference`
- `repeat_current_state`
- `write_failed_or_blocked`

## 4. Prompts Conversationnels Necessaires

### `preference_saved`

- Quand : commit DB reel realise.
- Recoit : `write_result.committed=true`, preference keys/labels/values,
  evidence_used.
- Produit : confirmation naturelle courte du changement durable.
- Ne doit jamais : parler de succes si `committed=false`, promettre un format
  unsupported, mentionner DB/table.

### `ask_durable_vs_punctual`

- Quand : demande de style claire mais durabilite ambigue.
- Recoit : summary, missing `durability`, setting/value candidats
  si disponibles.
- Produit : une seule question durable vs maintenant.
- Ne doit jamais : choisir durable/punctual a la place du dispatcher.

### `ask_setting_or_value`

- Quand : le setting ou l'intensite manque.
- Recoit : stage, missing field, options supportees pertinentes, current prefs
  filtrees.
- Produit : une seule question sur le champ manquant.
- Ne doit jamais : mapper un mot user vers une valeur non fournie.

### `confirm_supported_mapping`

- Quand : demande unsupported/partial mappee vers un reglages supporte propose.
- Recoit : proposed_updates status proposed, unsupported_parts, raison du
  mapping, confirmation requise.
- Produit : demande de confirmation explicite.
- Ne doit jamais : enregistrer, dire "c'est note", ou transformer proposed en
  locked.

### `punctual_instruction_ack`

- Quand : consigne pour cette reponse seulement.
- Recoit : summary ponctuel, no_write=true.
- Produit : acknowledgement court que cela vaut pour maintenant.
- Ne doit jamais : dire preference durable, stockee, gardee.

### `unsupported_preference`

- Quand : demande durable non supportee sans mapping confirme.
- Recoit : unsupported_parts, options supportees si utiles, no_write=true.
- Produit : explication sobre; proposition optionnelle si le dispatcher l'a
  fournie.
- Ne doit jamais : inventer une nouvelle preference ou un contournement DB.

### `repeat_current_state`

- Quand : user demande de redire la proposition ou ce qui vient d'etre sauve.
- Recoit : proposed_updates ou last_committed_updates filtres.
- Produit : recap court.
- Ne doit jamais : lire la DB brute ou lancer status.

### `write_failed_or_blocked`

- Quand : reducer/DB/risk bloque.
- Recoit : blocked_reason user-safe, attempted updates, committed=false.
- Produit : dit que ce n'est pas applique, sans detail technique lourd.
- Ne doit jamais : masquer un echec comme succes.

### `inline_tool_return`

- Quand : retour d'un inline subskill et reprise locale utile.
- Recoit : inline_tool_result summary, parent state summary, next expected
  stage.
- Produit : courte transition locale si necessaire.
- Ne doit jamais : refaire la reponse product/status ni changer l'etat.

### `stop_or_cancel`

- Quand : user abandonne sans nouveau sujet clair.
- Recoit : cancel/defer summary, no target dispatcher.
- Produit : acknowledgement tres court, sans question finale.
- Ne doit jamais : appeler global, proposer autre chose, coacher.

### `exit_ack`

- Quand : optionnel avant sortie globale si le runtime exige un ack local.
- Recoit : note_information summary, target global.
- Produit : idealement rien ou ack minimal selon pipeline.
- Ne doit jamais : traiter le nouveau sujet; le global le fera.

### `safety_transition`

- Quand : safety preempt avant handoff safety si un message local minimal est
  necessaire.
- Recoit : risk summary safe, target `safety_crisis`.
- Produit : transition minimale sans preference.
- Ne doit jamais : repondre au contenu safety a la place du safety flow.

## 5. Contexte A Injecter

### `db_context_pack`

```json
{
  "source": "user_profile_facts",
  "freshness": "same_turn",
  "confidence": "high",
  "preferences": [
    {
      "key": "coach.tone",
      "value": "warm_direct",
      "label": "Bienveillant ferme",
      "source_type": "system_default|explicit_user|ui",
      "status": "active",
      "updated_at": "iso|null",
      "last_confirmed_at": "iso|null",
      "reason": "string|null",
      "evidence": ["string"]
    }
  ],
  "supported_catalog": {
    "coach.tone": ["soft", "warm_direct", "direct"],
    "coach.challenge_level": ["low", "balanced", "high"],
    "coach.question_tendency": ["low", "normal", "high"]
  },
  "active_flow": {},
  "last_committed_effects": [],
  "product_surface_summary": "Preferences coach: ton, challenge, tendency to ask questions."
}
```

Exclusions :

- pas de plans/actions/cartes/rappels/potions dans ce pack ;
- pas de memory dump ;
- pas de preferences unsupported comme cles writeables ;
- pas de facts safety.

### `micro_memory_context`

V1 :

```json
{
  "items": [],
  "exclusions": [
    "no default memory retrieval for coach preferences",
    "no safety memory outside safety_crisis",
    "no global emotional/personality profile",
    "no raw memory in visible prompt"
  ],
  "budget": {
    "max_items": 0,
    "reason": "Current preferences and local state are sufficient for this closed write-skill."
  }
}
```

Si une variante future l'active :

- max 2 items ;
- uniquement evidence proche d'une frustration conversationnelle recente ;
- source/evidence/confidence obligatoires ;
- memoire seule = contexte/proposition, jamais update `locked` ;
- jamais transmise brute au prompt visible.

## 6. Invariants QA

- Global dispatcher skipped while `__coach_preference_flow_state_v1` is active.
- No regex routing.
- No `message.includes(...)` business routing.
- No deterministic renderer in nominal visible path.
- No single generic conversation agent for all stages.
- Every `flow_action` has exact continuation: visible prompt, inline tool,
  local stop, global exit, safety preempt, or local handoff.
- `exit_to_global_dispatcher` does not call global on the same turn.
- `exit_to_global_dispatcher` includes canonical `note_information`.
- `safety_preempt` routes to `safety_crisis.local_dispatcher` with
  `note_information`.
- Inline `product_help` and `status_recap` preserve parent local flow state.
- Conversation agent only receives `visible_task.conversation_context`.
- Conversation agent never receives raw DB context, raw temp memory, or raw
  micro memory.
- `micro_memory_context` is minimal, default empty, and not leaked raw to
  visible prompt.
- Write DB only for clear durable supported locked updates.
- No write for ambiguous, punctual, unsupported, low confidence, high risk.
- `preference_saved` visible claim only after committed DB effect.
- `executedTools=["update_coach_preferences"]` only on real DB commit.
- No pending confirmation token.
- No platform handoff on nominal write path.
- Unsupported durable request does not claim durable storage.
- Status question during active flow uses inline `status_recap`, no write.
- Product explanation during active flow uses inline `product_help`, no write.
- Clear topic change exits with note and same message is reanalysed by global.

## 7. Plan D'Implementation

### Fichiers a modifier

Flow local :

- `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/contract.ts`
- `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/local_flow.ts`
- `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/router.ts`
- `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/visible_agent.ts`
- `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/state.ts`
- `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/status.ts`
- `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`

Boundary runtime :

- `supabase/functions/sophia-brain/router/run.ts`
- `supabase/functions/sophia-brain/router/active_flow_state.ts`
- `supabase/functions/sophia-brain/router/effect_ledger_adapter.ts`
- `supabase/functions/sophia-brain/dispatcher/dispatcher.prompts.ts`
- `supabase/functions/sophia-brain/dispatcher/active_skill_descriptions.ts`

Legacy isolation :

- `renderer.ts`, `slot_filler.ts`, `generator.ts`, `executor.ts`, `intake.ts`
  under `update_coach_preferences/`

Docs/tests :

- this document
- `docs/agent-playbook/New/runtime-contracts/tools/update-coach-preferences.md`
- QA reports/bug sheets for r3 and rerun r4.

### Ordre de modification

1. Split contract local vs legacy.
   - Add `CoachPreferenceLocalDispatcherInputV1`.
   - Add `CoachPreferenceConversationContext`.
   - Add canonical `note_information`.
   - Keep legacy types isolated or clearly marked non-nominal.

2. Update local dispatcher prompt.
   - Input uses `db_context_pack`, `note_information_inbound`,
     `micro_memory_context`, `available_inline_tools`.
   - Output includes `conversation_context` and canonical `note_information`.
   - Add explicit actions for stop, inline roundtrip, safety, exit.

3. Update reducer.
   - Validate action/visible/transition matrix.
   - Reject transition without note.
   - Build/normalize `conversation_context`.
   - Preserve state for inline tools.
   - Clear state for stop/cancel/written/exit.

4. Update router.
   - Load `db_context_pack`.
   - Set `micro_memory_context` empty by default.
   - Remove `fallbackVisibleMessage` from nominal path.
   - For inline product/status, create and trace `note_information`.
   - For safety, hand off to safety local dispatcher instead of local visible
     answer.
   - Pass only `conversation_context` to visible prompts.

5. Split visible prompts.
   - Replace one generic visible agent with a registry of stage prompts.
   - Each prompt receives only its stage `conversation_context`.
   - Keep JSON output parsing shared, but system prompts stage-specific.

6. Isolate legacy.
   - Ensure nominal runtime never imports/calls `renderer`, `slot_filler`,
     `generator`, or `executor`.
   - Keep migration read for `__coach_preference_handoff_state_v1` only if
     necessary and trace it as legacy migration.

7. Boundary fixes.
   - Global dispatcher: explicit status questions about preferences should
     route `status_recap`, not `normal_reply`.
   - Global dispatcher: durable unsupported preference requests should route
     `update_coach_preferences`, not `normal_reply`.
   - Product help active flow: mutation after explanation should exit/handoff
     with note so `update_coach_preferences` can own the write.

### Tests unitaires

Dispatcher/reducer :

- direct durable supported -> write_ready.
- proposed mapping -> proposed, no write.
- confirmation active proposal -> write_ready.
- ambiguous -> no write.
- punctual -> no write.
- unsupported -> no write and no durable claim context.
- invalid key/value/status -> blocked.
- confidence low -> blocked.
- risk high -> blocked.
- exit_to_global_dispatcher -> no global flag, local state cleared/cancelled.
- exit_to_global_dispatcher -> canonical note required.
- safety_preempt -> canonical note target `safety_crisis`.
- inline status -> canonical note target `status_recap`, parent preserved.
- inline product -> canonical note target `product_help`, parent preserved.
- invalid dispatcher JSON -> safe no business decision, no global silent
  fallback.

Visible prompts :

- each `visible_task.kind` maps to one stage-specific prompt.
- visible input has `conversation_context` only.
- `preference_saved` refuses/does not run when committed=false.
- no visible prompt claims durable success without committed context.
- no prompt asks more than one question in clarification stages.
- no fallback deterministic template in nominal path.

Runtime :

- active flow skips global dispatcher.
- local exit reroutes same message to global only with note.
- stop local does not reroute same message.
- safety preempt routes safety local, not global.
- committed effect emitted only on DB success.
- no pending confirmation.
- no platform handoff nominal path.
- status/product inline produce no executed tools and no committed effects.

Source scans :

- no imports from `renderer.ts`, `slot_filler.ts`, `generator.ts`, `executor.ts`
  in nominal local runtime.
- no business regex / `message.includes` in local flow decision path.

### Tests IA reels

Rerun local Sophia with `/functions/v1/test-send-message`,
`force_full_ai=true`, `disable_debounce=true`.

Minimum r4 :

1. Direct write :
   - "Dorénavant, quand je bloque, réponds plus direct et limite les questions."
   - Expect `update_coach_preferences`, DB `tone=direct`,
     `question_tendency=low`, committed effect.

2. Explicit status no active flow :
   - "Tu peux vérifier quelles préférences coach sont actives maintenant ?"
   - Expect `status_recap`, no write.

3. Unsupported durable :
   - "Je veux aussi que tu ne termines jamais par une question finale."
   - Expect `update_coach_preferences`, no write, no durable claim, unsupported
     or proposed mapping.

4. Product help inline from active update flow :
   - Ask "c'est quoi les reglages coach ?" while proposed/collecting.
   - Expect parent `update_coach_preferences`, subskill `product_help`, parent
     state preserved.

5. Status inline from active update flow :
   - Ask "rappelle mes preferences coach actives" while flow active.
   - Expect parent `update_coach_preferences`, subskill `status_recap`, no
     write.

6. Product help standalone then mutation :
   - Explain preferences, then "ok, mets le challenge plus haut pour la suite."
   - Expect product help exits/handoffs with note; update coach writes.

7. Stop local :
   - "laisse tomber"
   - Expect local ack, no global same turn.

8. Exit global :
   - "au fait aide-moi a revoir mon plan"
   - Expect local note then global reanalyse same message.

9. Safety :
   - safety-like message during active flow.
   - Expect safety local dispatcher, no preference write.

Cleanup DB targeted after run for supported coach keys only.

### Logs / trace a ajouter

- `update_coach_preferences.db_context_pack_loaded`
- `update_coach_preferences.micro_memory_context_loaded`
- `update_coach_preferences.local_dispatcher_called`
- `update_coach_preferences.local_dispatcher_result`
- `update_coach_preferences.reducer_validated`
- `update_coach_preferences.flow_action`
- `update_coach_preferences.visible_task_kind`
- `update_coach_preferences.conversation_context_created`
- `update_coach_preferences.note_information_created`
- `update_coach_preferences.note_information_consumed`
- `update_coach_preferences.inline_tool_roundtrip`
- `update_coach_preferences.global_dispatcher_skipped`
- `update_coach_preferences.exit_to_global_dispatcher`
- `update_coach_preferences.safety_preempt`
- `update_coach_preferences.write_attempted`
- `update_coach_preferences.write_committed`
- `update_coach_preferences.write_blocked_reason`
- `update_coach_preferences.committed_effects`

### Criteres de validation

- Le flow actif ne lance jamais le dispatcher global normal.
- Le global reprend seulement apres `exit_to_global_dispatcher` avec note.
- Safety ne passe jamais par le global normal.
- Le visible agent ne voit que `conversation_context`.
- Chaque stage visible a son prompt specialise.
- Les inline tools ont note + retour parent.
- Les writes DB sont exacts et bornes.
- Les claims visibles de succes dependent d'un commit DB reel.
- Les demandes unsupported/ponctuelles/ambigues n'ecrivent pas.
- Aucun renderer deterministic/template fixe dans le chemin nominal.
- Aucun legacy platform handoff dans le chemin nominal write.
