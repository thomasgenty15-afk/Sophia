# QA Run Report — Demotivation Repair Local Doctrine R8

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `demotivation-repair-local-doctrine-r8`
- Persona: `qa-skill`
- Connexion: `demotivation_repair_local_doctrine_r8` (temporary local QA user)
- Objectif: verifier en conditions reelles les changements `note_information` minimal + transmission de `structured_context` apres les corrections post-R7b.
- Trajectoire: demotivation sur rangement du soir -> restauration du sens -> micro-geste informel -> refus outil/plan -> cloture stricte.
- Surfaces visees: dispatcher global, dispatcher local `demotivation_repair`, arbitration active flow, `adjust_plan_item`, handoff local->global, normal reply post-exit, durable state.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, pas de renderer deterministe, pas de fallback direct.
- Validite QA: valide. Les messages ont ete choisis tour par tour apres lecture de la reponse precedente et des traces courtes.

Artifacts:

- Raw: `tests/real-personas/qa-skill/runs/operations/2026-06-11-demotivation-repair-local-doctrine-r8.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/operations/2026-06-11-demotivation-repair-local-doctrine-r8.summary.json`
- Durable snapshot: `tests/real-personas/qa-skill/runs/operations/2026-06-11-demotivation-repair-local-doctrine-r8.durable.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je décroche de mon rangement du soir. J'avais réussi à en faire un petit rituel, mais là j'ai juste l'impression que ça ne sert plus à rien et que je vais zapper.

**Sophia**
> C'est tout à fait normal de vouloir décrocher quand un geste perd son utilité à tes yeux. Ce n'est pas une question de volonté, c'est simplement que le lien entre cette action et ton bien-être semble s'être rompu. Qu'est-ce qui a changé pour que ce rangement te paraisse si vide de sens aujourd'hui ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- active_flow_arbitration: `no_active_flow`
- note_information: present on `turn_frame.note_information`; minimal schema with `source_flow_id`, `target_dispatcher=demotivation_repair`, `handoff_reason=bridge`, `structured_context`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Je crois que j'ai arrêté de le relier au lendemain matin. Au départ ça me donnait l'impression de poser la journée, maintenant je ne vois que les objets à bouger et ça me fatigue d'avance.

**Sophia**
> C’est tout à fait compréhensible que tu ressentes cette fatigue d'avance. Ton rituel a glissé d'une préparation mentale vers une simple corvée de manutention, et sans ce lien avec ton bien-être du lendemain, l'effort paraît démesuré.
>
> Qu'est-ce qui, dans ce geste de ranger, te donnait l'impression de vraiment « poser ta journée » au tout début ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- active_flow_arbitration: `continue_active`
- note_information: present on `turn_frame.note_information`; minimal schema with `structured_context.recommended_next_focus`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — mauvais owner selectionne

**User**
> Au début c'était le fait d'avoir une table vide en entrant dans la cuisine le matin. Je crois que je peux garder juste ça : enlever deux objets de la table, pas ranger la pièce.

**Sophia**
> Ton rituel de rangement du soir te semble trop lourd en ce moment, alors on va réduire l'action pour que ça reste gérable. L'objectif est de te limiter à enlever deux objets de la table afin de garder le bénéfice d'une surface vide le matin, sans t'épuiser à ranger toute la pièce. Pour faire ce changement, va dans ton Plan sur la plateforme. Sous le niveau actif, tu trouveras 'Ajuster mon plan' où tu pourras saisir cette proposition : Simplifier le rituel du soir : enlever seulement deux objets de la table pour garantir une table vide le matin, sans ranger le reste de la pièce.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `orientation_clarification_resolved_tool_skill`
- active_flow_arbitration: `decision=supersede_active`, `reason_code=explicit_tool_intent_supersedes_active_conversation_skill`
- note_information: present on `turn_frame.note_information`; minimal schema with `target_dispatcher=adjust_plan_item`
- local_flow_action: `prepare_plan_handoff`
- local_visible_task_kind: `plan_handoff_ready`
- tool_execution: `platform_handoff`
- executed_tools: none
- durable_effect: no DB mutation; platform handoff only

**Analyse si yellow/red**
- Symptome: le user stabilise un micro-geste informel dans le flow `demotivation_repair`, mais Sophia le transforme en ajustement de plan et envoie vers la plateforme.
- Source amont probable: dispatcher/global arbitration ou orientation clarification classe "garder juste ça / pas ranger la pièce" comme demande explicite `adjust_plan_item` au lieu de continuation locale de demotivation.
- Owner runtime: dispatcher global + active flow interruption policy, avec `adjust_plan_item` comme mauvais owner aval.
- Meilleure correction selon les guidelines: renforcer la frontiere demotivation_repair/action informelle: pendant un flow demotivation actif, un micro-geste de regulation ne doit pas supersede vers `adjust_plan_item` sauf demande explicite de modifier le plan, l'action, la plateforme ou le niveau.
- Pourquoi ce n'est pas un patch local: la trace montre que le local `demotivation_repair` n'est plus owner; le mauvais choix vient de l'arbitration amont.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — contrainte explicite perdue

**User**
> Non, je ne veux pas changer mon plan ni aller dans la plateforme. Je veux juste garder cette phrase et ce micro-geste pour ce soir, sans outil ni suite.

**Sophia**
> Ok, ni outil ni suite. ✅🙂
>
> Pour ce soir, tu gardes juste ton “micro” : enlever deux objets de la table, point. Tu t’arrêtes là, comme si c’était déjà suffisant pour “poser le matin”.
>
> Quand c’est fait, tu me dis juste : c’était facile, moyen, ou galère ? 😅

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `no_active_flow`
- blocked_paths: `adjust_plan_item.local_visible_reply` blocked by `local_exit_to_global_dispatcher_blocks_local_reply`
- local_flow_exit_handoff: present
- note_information: present and minimal under `local_flow_exit_handoff.note_information`; `source_flow_id=adjust_plan_item`, `target_dispatcher=global`, `structured_context` present
- global note: present and minimal; includes `recommended_next_focus` to acknowledge tool refusal
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: no DB mutation

**Analyse si yellow/red**
- Symptome: le systeme sort proprement de `adjust_plan_item` vers global, mais la reponse globale ajoute une demande de retour malgre "sans outil ni suite".
- Source amont probable: preservation insuffisante de la contrainte "sans suite" dans normal reply post-exit, meme avec note_information transmise.
- Owner runtime: normal reply post-handoff / response style policy.
- Meilleure correction selon les guidelines: dans le contexte filtre post-handoff vers normal_reply, conserver explicitement `no_followup_question` / `no_extra_action` quand le message courant contient une cloture de ce type; la reponse doit etre un acknowledgement bref.
- Pourquoi ce n'est pas un patch local: le flow local source est deja ferme et la reponse visible vient de `normal_reply`.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — contrainte explicite perdue

**User**
> Non justement, je ne veux pas faire de retour après. Je m'arrête là pour aujourd'hui. Bonne soirée.

**Sophia**
> OK, tu t’arrêtes là pour aujourd’hui. Bonne soirée 🌿🙂
>
> Si tu veux juste te donner une mini-clôture mentale (sans retour), dis-toi une phrase du style “Table vidée = mission remplie”, et tu coupes.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `no_active_flow`
- note_information: null
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: final durable snapshot `chat_messages=10`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`

**Analyse si yellow/red**
- Symptome: Sophia reconnait la cloture, mais ajoute encore une phrase de micro-cloture alors que le user vient de refuser toute suite.
- Source amont probable: normal reply final style ne respecte pas assez les contraintes de cloture explicite.
- Owner runtime: normal reply policy / response style constraints.
- Meilleure correction selon les guidelines: lorsque le dernier message est une cloture explicite avec refus de suite, produire uniquement un ack bref, sans nouvelle suggestion.
- Pourquoi ce n'est pas un patch local: aucun flow local n'est actif; c'est la politique de reponse normale.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tours 1-2: le ton est pertinent pour une demotivation, sans moraliser.
- Le flow ne pousse pas de potion trop tot.
- Le nouveau contrat `note_information` est visible dans les traces sous forme minimale avec `structured_context`.
- Aucun effet durable non consenti n'est commis.

**Problemes**
- Tour 3: le micro-geste conversationnel est transforme en handoff plateforme `adjust_plan_item`. Famille: `BF-ROUTE-01`. Impact: Sophia casse le flow de repair au moment ou le user stabilise un geste simple. Severite: red.
- Tour 4: apres refus clair de l'outil et "sans suite", Sophia demande quand meme un retour. Famille: `BF-INTAKE-03`. Impact: le user doit se repeter. Severite: yellow.
- Tour 5: apres deux refus de suite, Sophia ajoute encore une mini-suggestion. Famille: `BF-INTAKE-03`. Impact: cloture pas totalement respectee. Severite: yellow.

**Fix propose**
- Source amont:
  - `BF-ROUTE-01`: dispatcher/arbitration active flow entre `demotivation_repair` et `adjust_plan_item`.
  - `BF-INTAKE-03`: normal reply post-exit et normal reply de cloture.
- Correction recommandee:
  - Ne pas traiter une micro-action informelle comme demande de modification de plan pendant `demotivation_repair` actif sans demande explicite de plan/platform/edit.
  - Faire survivre la contrainte `sans suite` jusqu'au prompt visible global.
- Tests d'invariant attendus:
  - Demotivation active + "je garde juste enlever deux objets" -> `conversation_handler/demotivation_repair`, pas `tool_skill/adjust_plan_item`.
  - "sans outil ni suite" apres handoff -> `normal_reply` sans question et sans suggestion.
  - Anti-faux-positif: "modifie mon plan pour réduire l'action à deux objets" doit toujours router vers `adjust_plan_item`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1-2: routage attendu vers `demotivation_repair`.
- Tour 3: mauvais supersede vers `adjust_plan_item` avec `active_flow_arbitration.reason_code=explicit_tool_intent_supersedes_active_conversation_skill`. Le message ne demandait pas explicitement de modifier le plan.
- Tour 4: sortie de `adjust_plan_item` vers global fonctionne techniquement: `blocked_paths` contient `local_exit_to_global_dispatcher_blocks_local_reply`, `local_flow_exit_handoff` present, `note_information` minimale presente.
- Tour 5: plus d'active flow.

**Skills / Operations / Tools**
- `adjust_plan_item` a prepare un handoff plateforme non-mutant au tour 3.
- Aucun executor durable n'a ete appele.
- Aucun rappel, carte, potion, scheduled checkin ou memory item cree.

**Note Information**
- Le nouveau format minimal est bien produit:
  - tour 1: `global_dispatcher -> demotivation_repair` avec `structured_context`;
  - tour 2: lifecycle `demotivation_repair` avec `structured_context`;
  - tour 3: `global_dispatcher -> adjust_plan_item` avec `structured_context`;
  - tour 4: `adjust_plan_item -> global` avec `structured_context`.
- Aucun champ legacy requis n'est necessaire pour le run. Warning: le `structured_context` du tour 4 contient encore une cle semantique `no_chat_mutation`; ce n'est pas un champ top-level de note et n'a pas provoque d'effet durable.

**State / Durable**
- Snapshot final:
  - `chat_messages=10`
  - `memory_items=0`
  - `scheduled_checkins=0`
  - `user_recurring_reminders=0`
- Pas de mutation durable non consentie.

## Verdict Global

**red**

Le changement `note_information` minimal fonctionne techniquement et la transmission de `structured_context` est observable. Le run n'est pas vert parce que le flow demotivation est interrompu au tour 3 par un mauvais owner `adjust_plan_item`, puis la cloture "sans suite" reste insuffisamment respectee par `normal_reply`.
