# QA Run Report - adjust_plan_item field rules real R4 - 2026-06-09

## 1. Contexte Du Test

- Date: 2026-06-09.
- Run: `adjustplan-field-rules-r4`.
- Persona: `qa-skill`, connexion temporaire `all_skills_adjustplan_field_rules_20260609_r4`.
- Objectif: verifier en conditions reelles que le renforcement du prompt dispatcher local `adjust_plan_item` remplit mieux les champs du JSON reel, notamment contraintes, visible context, apply attempt et stop local.
- Trajectoire: demande d'allegement de routine du soir -> revision avec contraintes -> demande d'application -> stop local.
- Surfaces visees: dispatcher local `adjust_plan_item`, reducer local, `visible_task.conversation_context`, EffectLedger, no-chat-mutation, active-flow global skip.
- Cadre IA reel: valide. Supabase local hors sandbox, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. Cleanup cible de la connexion temporaire effectue apres run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je veux ajuster mon plan : cette semaine ma routine du soir me crame. Je ne veux pas la supprimer, juste la transformer en version mini.

**Sophia**
> Je comprends, c'est important de s'écouter quand la fatigue s'installe. Pour souffler un peu cette semaine sans tout arrêter, on pourrait passer ta routine du soir en version mini. Je te laisse reprendre cette proposition dans ton Plan pour l'ajuster.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation: `flow_action=prepare_plan_handoff`, `visible_task=plan_handoff_ready`
- executed_tools: none
- durable_effect: `committed=0`, `executed_tool=false`
- context: `constraints=["cette semaine"]`, `preserve=["maintenir la routine (ne pas supprimer)"]`, `avoid=["supprimer la routine"]`

### Tour 2

**Verdict du tour:** green

**User**
> Oui, mais sois plus précis : je veux garder le signal de pause, passer à 3 minutes de respiration avec le carnet déjà ouvert, et éviter toute nouvelle action ou règle autour du téléphone.

**Sophia**
> C'est bien plus clair avec ces précisions. Voici la formulation mise à jour : "Routine du soir (version mini cette semaine) : Garder le signal de pause, passer à 3 minutes de respiration avec le carnet déjà ouvert. Ne pas ajouter de règle ou d'action liée au téléphone." On bascule vers le Plan pour ajuster cela ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- global dispatcher: blocked with `active_adjust_plan_item_uses_local_dispatcher`
- operation: `flow_action=revise_plan_handoff`, `visible_task=revise_plan_handoff`
- executed_tools: none
- durable_effect: `committed=0`, `executed_tool=false`
- context: `constraints=["cette semaine"]`, `preserve=["maintenir la routine (ne pas supprimer)", "signal de pause"]`, `avoid=["supprimer la routine", "toute nouvelle action ou règle autour du téléphone"]`

### Tour 3

**Verdict du tour:** green

**User**
> Oui fais-le, mets cette version dans mon plan.

**Sophia**
> Je ne peux pas modifier ton plan directement depuis notre discussion. Pour appliquer ce changement, je t'invite à te rendre dans ton Plan et à y reporter cette version : 'Routine du soir (version mini cette semaine) : Garder le signal de pause, passer à 3 minutes de respiration avec le carnet déjà ouvert. Ne pas ajouter de règle ou d'action liée au téléphone.' On se retrouve là-bas ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- operation: `flow_action=apply_attempt`, `visible_task=apply_attempt`
- blocked_effects: `chat_plan_mutation_disabled_platform_handoff`
- executed_tools: none
- durable_effect: `committed=0`, `executed_tool=false`

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` — mauvaise transition de flow

**User**
> Ok stop, laisse tomber l’ajustement pour maintenant.

**Sophia**
> D'accord, on s'arrête là pour l'ajustement. Je te laisse retourner à ton plan.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- global dispatcher: blocked with `active_adjust_plan_item_uses_local_dispatcher`
- operation: `flow_action=cancel_flow`, `visible_task=cancel_close`
- state: `local_state_null=true`
- executed_tools: none
- durable_effect: `committed=0`, `executed_tool=false`

**Analyse si yellow/red**
- Symptome: le state local se ferme correctement, mais le message visible ajoute "retourner à ton plan" alors que le user demande explicitement de laisser tomber.
- Source amont probable: prompt visible `cancel_close` / contrat de fermeture locale.
- Owner runtime: `adjust_plan_item` visible agent.
- Meilleure correction selon les guidelines: renforcer le prompt visible de stop/cancel pour produire une fermeture courte sans redirection Plan quand `flow_action=cancel_flow|stop_local_no_handoff|defer_flow`.
- Pourquoi ce n'est pas un patch local: le dispatcher et reducer sont corrects; c'est le stage visible qui doit respecter le contrat de fermeture.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia comprend l'intention d'allegement sans sortir du flow.
- La revision conserve les contraintes explicites et produit une formulation utile.
- La demande "fais-le" est traitee humainement: Sophia explique qu'elle ne peut pas modifier le Plan depuis le chat.

**Problemes**
- Tour 4: fermeture localement correcte mais phrase finale contradictoire avec "laisse tomber". Famille: `BF-STATE-01`. Impact: petite friction UX; le user vient d'arreter, Sophia le renvoie quand meme vers Plan. Severite: yellow.

**Fix propose**
- Source amont: prompt visible `cancel_close` de `adjust_plan_item`.
- Correction recommandee: si le user stoppe/defer/cancel sans nouveau sujet, repondre simplement "D'accord, on met cet ajustement de côté." Pas de destination Plan, pas de question, pas de suite.
- Tests d'invariant attendus: test visible-agent `cancel_close` avec "laisse tomber" -> aucun "Plan", "retourner", "reprendre", "appliquer".

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 demarre via `tool_skill_intent_start` vers `adjust_plan_item`.
- T2-T4 restent dans `active_adjust_plan_item_local_dispatcher`.
- Le global dispatcher est explicitement bloque pendant le flow actif.

**Skills / Operations / Tools**
- `flow_action` evolue correctement: `prepare_plan_handoff` -> `revise_plan_handoff` -> `apply_attempt` -> `cancel_flow`.
- `visible_task.kind` est stage-specific sur chaque tour.
- `apply_attempt` ne cree ni confirmation executable ni mutation.

**Memory / Effets durables**
- Aucun outil execute.
- EffectLedger: `committed=0` sur tous les tours.
- T3 bloque explicitement l'effet avec `chat_plan_mutation_disabled_platform_handoff`.
- Les contraintes explicites sont conservees dans `visible_task.conversation_context`.

**Problemes**
- Aucun probleme systeme bloquant observe. Le warning T4 est visible/UX, pas un mauvais owner ni un mauvais effet durable.

**Fix propose**
- Source amont: `adjust_plan_item` visible agent.
- Correction recommandee: ajouter un invariant de wording pour `cancel_close`.
- Tests d'invariant attendus: unitaires visible prompt + rerun court stop local.

## Verdict Global

- Verdict: yellow
- Raison principale: les nouvelles regles du dispatcher local fonctionnent en runtime reel, mais la fermeture visible reste trop orientee Plan apres un stop explicite.
- Follow-up prioritaire: corriger le prompt visible `cancel_close`, puis rerun un scenario stop local.
