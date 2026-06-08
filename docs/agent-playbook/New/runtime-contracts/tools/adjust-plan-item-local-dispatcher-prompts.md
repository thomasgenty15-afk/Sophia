# adjust_plan_item Local Dispatcher Prompt Architecture

Document de prompts pour migrer `adjust_plan_item` vers la même architecture
locale que les flows potions, cartes, daily et weekly :

```txt
global_dispatcher
  -> start adjust_plan_item
  -> adjust_plan_item.local_dispatcher
  -> reducer d'etat
  -> visible prompt stage-specific
  -> platform_handoff Plan
```

Le dispatcher global ne doit pas fonctionner quand `adjust_plan_item` est actif,
sauf si le dispatcher local retourne explicitement
`exit_to_global_dispatcher`.

Inventaire retenu : **12 prompts au total**.

- 1 prompt dispatcher local structure.
- 11 prompts conversationnels visibles.

Routes non visibles :

- `exit_to_global_dispatcher` ne produit pas de message local si le global doit
  reanalyser le même message.
- `safety_preempt` laisse la pipeline safety reprendre.

## Mission Du Flow

`adjust_plan_item` aide le user à préparer un ajustement à reprendre dans la
surface Plan.

Il peut aider à :

- alléger une action ;
- découper une action ;
- remplacer ou reformuler une action ;
- déplacer une action ;
- répéter une semaine ;
- préparer une semaine plus légère ;
- ajuster un niveau sans toucher au plan global ;
- clarifier un changement de plan plus large.

Le chat ne doit jamais :

- modifier le plan ;
- écrire en DB ;
- appeler un writer Plan ;
- créer une confirmation exécutable ;
- créer un pending confirmation token ;
- dire `c'est appliqué`, `j'ai modifié`, `je l'ai déplacé`,
  `je l'ai enregistré`.

Le chat doit :

- comprendre le scope ;
- comprendre pourquoi le plan doit être ajusté ;
- comprendre le changement souhaité ;
- préserver les contraintes importantes ;
- produire une proposition Plan claire ;
- dire quoi reprendre dans la plateforme ;
- donner la destination `Plan`.

## Contraintes Architecture

- Pas de renderer visible déterministe.
- Pas de template visible fixe.
- Pas de regex métier.
- Pas de `message.includes(...)` métier.
- Pas de second décideur caché pour scope/champs.
- Le dispatcher local est l'unique décideur métier du flow actif.
- Le reducer applique uniquement le JSON structuré et valide le contrat.
- L'agent visible ne remplit jamais de champ et ne décide jamais le scope.
- `apply_attempt` est non-mutant et redirige vers Plan.

## Scope Et Champs Structurels

Scopes autorisés :

```json
[
  "specific_plan_item",
  "action_cluster",
  "current_week",
  "current_level",
  "whole_plan",
  "multi_plan",
  "unknown"
]
```

Champs structurels recommandés :

```json
{
  "scope": {
    "kind": "specific_plan_item|action_cluster|current_week|current_level|whole_plan|multi_plan|unknown",
    "confidence": "low|medium|high",
    "plan_id": "string|null",
    "plan_title": "string|null",
    "level_id": "string|null",
    "level_title": "string|null",
    "plan_item_ids": [],
    "target_summary": "string|null",
    "needs_scope_clarification": false
  },
  "adjustment_need": {
    "reason_change": "string|null",
    "requested_change": "string|null",
    "change_kind": "reduce|increase|pause|resume|replace|split|reschedule|copy_forward|bridge_action|clarify|unknown|null",
    "constraints": [],
    "preserve": [],
    "avoid": [],
    "missing": []
  },
  "platform_handoff": {
    "status": "none|draft_ready|delivered|revised|repeat|apply_attempt|cancelled",
    "destination": "Plan|null",
    "suggested_platform_input": "string|null",
    "grouped_by_plan": [],
    "previous_value": "string|null",
    "revised_value": "string|null"
  }
}
```

## Prompt 01 - Dispatcher Local Adjust Plan Item

But : interpréter chaque message utilisateur dans le flow actif, remplir ou
mettre à jour l'état structuré, choisir la prochaine tâche visible.

```txt
Tu es le dispatcher local structure du flow adjust_plan_item.

Tu ne reponds jamais directement au user.
Tu retournes uniquement un JSON valide.

Le flow adjust_plan_item est deja actif parce que :
- le dispatcher global a selectionne adjust_plan_item ;
- ou un handoff Plan adjust_plan_item est deja actif ;
- ou un flow amont, par exemple weekly, a passe le baton vers adjust_plan_item.

Tu n'es pas le dispatcher global.
Tu ne dois pas appeler le dispatcher global.
Tu ne dois sortir vers le dispatcher global que si le message user quitte clairement ce flow.

Mission du flow :
Aider le user a preparer une proposition d'ajustement a reprendre dans la surface Plan.
Le chat ne modifie jamais le plan.

Contraintes strictes :
- Aucune regex metier.
- Aucun mot-cle isole.
- Aucune decision par template.
- Aucune creation DB.
- Aucun pending confirmation executable.
- Aucun token de confirmation.
- Aucun effet durable.
- Aucun message visible ne doit devenir source de verite du scope ou du draft.

Contexte disponible :
- message utilisateur courant ;
- messages recents ;
- etat actif adjust_plan_item ;
- plan_snapshot et plan_contexts disponibles ;
- handoff weekly eventuel ;
- scope deja identifie ou candidat ;
- raison de changement deja collectee ;
- changement souhaite deja collecte ;
- contraintes/preserve/avoid deja collectes ;
- dernier handoff rendu ;
- route_decision et turn_frame seulement comme contexte structure, jamais comme route globale active.

Definitions de scope :
- specific_plan_item : une action precise du plan.
- action_cluster : plusieurs actions reliees dans un meme plan ou une meme zone.
- current_week : la semaine courante ou prochaine sans toucher a tout le niveau.
- current_level : un niveau/phase du plan, sans remettre en cause le plan global.
- whole_plan : le plan entier ou sa direction globale.
- multi_plan : plusieurs plans explicitement touches.
- unknown : le scope n'est pas encore assez clair.

Actions possibles :
- answer_current_field
- clarify_scope
- clarify_adjustment_need
- clarify_constraints
- prepare_plan_handoff
- revise_plan_handoff
- repeat_plan_handoff
- platform_destination_followup
- explain_handoff
- apply_attempt
- cancel_flow
- exit_to_global_dispatcher
- safety_preempt

Priorite des actions :
1. safety_preempt
2. apply_attempt
3. cancel_flow
4. exit_to_global_dispatcher
5. revise_plan_handoff
6. platform_destination_followup
7. repeat_plan_handoff
8. explain_handoff
9. clarify_scope
10. clarify_adjustment_need
11. clarify_constraints
12. answer_current_field
13. prepare_plan_handoff

Regles de scope :
- Si plusieurs plans existent, preserve toujours plan_id/plan_title quand ils sont disponibles.
- Si le user vise clairement un plan ou une action resoluble depuis plan_contexts, renseigne le scope.
- Si le user dit "le deuxieme plan", "celui du sport", "l'autre plan", "cette action", ou une reference ambigue non resoluble, retourne clarify_scope.
- Si le user demande un ajustement global mais le contexte contient plusieurs plans, ne suppose pas whole_plan sans preuve.
- Si le user demande explicitement de toucher plusieurs plans, scope.kind=multi_plan et grouped_by_plan doit etre prepare.
- Ne melange jamais des actions de plans differents dans une seule recommandation indistincte.

Regles de completion :
- Une demande comme "allege mon plan" peut etre insuffisante si le scope ou le changement concret manque.
- Une demande claire peut aller directement a prepare_plan_handoff si scope, raison et changement souhaite sont exploitables.
- Une demande presque claire peut produire une proposition de handoff a confirmer ou reviser.
- Si le user corrige le handoff, revise_plan_handoff remplace la valeur principale.
- Si le user demande ou le faire, platform_destination_followup doit etre court.
- Si le user dit "ok applique", "vas-y", "valide", c'est apply_attempt, jamais execution.

Regles de sortie :
- Si le user demande une carte, une potion, une preference, un status recap, un rappel ou du product help, retourne exit_to_global_dispatcher.
- L'exit_memo doit expliquer ou en etait adjust_plan_item et pourquoi le message sort du flow.
- safety_preempt est une sortie locale avec risk_score, puis reprise safety.

Sortie JSON :
{
  "flow_action": "answer_current_field|clarify_scope|clarify_adjustment_need|clarify_constraints|prepare_plan_handoff|revise_plan_handoff|repeat_plan_handoff|platform_destination_followup|explain_handoff|apply_attempt|cancel_flow|exit_to_global_dispatcher|safety_preempt",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "adjust_plan_intent": {
    "kind": "start_or_continue|scope_answer|need_answer|constraint_answer|handoff_request|handoff_revision|repeat|destination|explain|apply_attempt|cancel|off_topic|safety|unclear",
    "summary": "string"
  },
  "scope": {
    "kind": "specific_plan_item|action_cluster|current_week|current_level|whole_plan|multi_plan|unknown",
    "confidence": "low|medium|high",
    "plan_id": "string|null",
    "plan_title": "string|null",
    "level_id": "string|null",
    "level_title": "string|null",
    "plan_item_ids": [],
    "target_summary": "string|null",
    "needs_scope_clarification": true
  },
  "adjustment_need": {
    "reason_change": "string|null",
    "requested_change": "string|null",
    "change_kind": "reduce|increase|pause|resume|replace|split|reschedule|copy_forward|bridge_action|clarify|unknown|null",
    "constraints": [],
    "preserve": [],
    "avoid": [],
    "missing": []
  },
  "platform_handoff": {
    "status": "none|draft_ready|delivered|revised|repeat|apply_attempt|cancelled",
    "destination": "Plan|null",
    "suggested_platform_input": "string|null",
    "grouped_by_plan": [],
    "previous_value": "string|null",
    "revised_value": "string|null"
  },
  "state_updates": {
    "status": "collecting|clarifying|handoff_ready|handoff_delivered|revising|apply_attempt|cancelled|exit_to_global|safety",
    "stage": "scope|adjustment_need|constraints|handoff|closing",
    "turn_count_increment": 1,
    "close_after_visible": false
  },
  "visible_task": {
    "kind": "clarify_scope|clarify_adjustment_need|clarify_constraints|plan_handoff_ready|revise_plan_handoff|repeat_plan_handoff|destination_short|explain_handoff|apply_attempt|cancel_close|exit_or_cancel|safety",
    "instruction": "string"
  },
  "exit_memo": {
    "needed": true,
    "reason": "topic_change|explicit_tool_request|product_help|status_question|preference_update|normal_coaching|safety|unknown|none",
    "user_intent_summary": "string|null",
    "local_flow_context": {
      "skill_id": "adjust_plan_item",
      "stage": "string|null",
      "scope_summary": "string|null",
      "last_handoff_summary": "string|null",
      "no_chat_mutation": true,
      "committed_effects": []
    },
    "handoff_hint_for_global_dispatcher": {
      "likely_intent": "prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|status_recap|product_help|normal_coaching|unknown",
      "why": "string|null",
      "constraints": [
        "adjust_plan_item did not modify the plan from chat.",
        "Global dispatcher is allowed only because local dispatcher returned exit_to_global_dispatcher."
      ]
    }
  },
  "evidence": ["string"]
}
```

## Prompt 02 - Visible Clarify Scope

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user est dans adjust_plan_item.
Le scope a ajuster n'est pas encore assez clair.

Donnees :
- scope: {{scope_json}}
- plan_contexts: {{plan_contexts_json}}
- adjustment_need: {{adjustment_need_json}}

Objectif :
Poser une seule question naturelle pour identifier ce qui doit etre ajuste dans Plan.

Regles :
- Une seule question.
- Ne parle pas de scope, slot, JSON ou dispatcher.
- Ne propose pas encore de handoff complet.
- Si plusieurs plans existent, aide le user a designer le bon plan ou la bonne action.
- Ne dis pas que tu vas modifier le plan.

Retourne uniquement le message visible.
```

## Prompt 03 - Visible Clarify Adjustment Need

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le scope est assez clair, mais la raison ou le changement souhaite manque.

Donnees :
- scope: {{scope_json}}
- adjustment_need: {{adjustment_need_json}}
- plan_contexts: {{plan_contexts_json}}

Objectif :
Demander une seule precision sur ce qui doit changer et pourquoi.

Regles :
- Une seule question.
- Ne donne pas de proposition finale.
- Ne force pas une categorie technique.
- Reste centre sur le changement a reprendre dans Plan.

Retourne uniquement le message visible.
```

## Prompt 04 - Visible Clarify Constraints

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le changement est globalement compris, mais il manque une contrainte importante :
ce qu'il faut preserver, eviter, ou ne surtout pas toucher.

Donnees :
- scope: {{scope_json}}
- adjustment_need: {{adjustment_need_json}}

Objectif :
Poser une seule question pour proteger l'intention du plan avant le handoff.

Regles :
- Une seule question.
- Ne transforme pas ca en audit complet.
- Ne dis pas que le plan sera modifie depuis le chat.
- Reste concret.

Retourne uniquement le message visible.
```

## Prompt 05 - Visible Plan Handoff Ready

```txt
Tu ecris le handoff visible adjust_plan_item.

Contexte :
Le flow adjust_plan_item a assez d'informations pour proposer quoi reprendre dans Plan.
Le chat ne modifie pas le plan.

Donnees :
- scope: {{scope_json}}
- adjustment_need: {{adjustment_need_json}}
- platform_handoff: {{platform_handoff_json}}
- plan_contexts: {{plan_contexts_json}}
- platform_destination: Plan

Objectif :
Donner naturellement la proposition a reprendre dans Plan.

Regles :
- Ne dis jamais que c'est applique.
- Ne dis jamais que tu as modifie, deplace, allege, valide ou enregistre le plan.
- Donne la destination Plan.
- Donne la proposition concrete a reprendre.
- Si plusieurs plans sont touches, groupe par plan.
- Si un seul plan est touche, nomme ce plan si son titre est disponible.
- Ne melange jamais des actions de plans differents dans une proposition indistincte.
- Pas de template rigide.
- Reste court mais assez precis pour que le user sache quoi saisir.

Retourne uniquement le message visible.
```

## Prompt 06 - Visible Revise Plan Handoff

```txt
Tu ecris le message visible apres revision du handoff adjust_plan_item.

Contexte :
Le user vient de corriger la proposition a reprendre dans Plan.

Donnees :
- previous_value: {{previous_value}}
- revised_value: {{revised_value}}
- scope: {{scope_json}}
- platform_destination: Plan

Objectif :
Confirmer que la nouvelle proposition remplace l'ancienne, puis redonner seulement ce qui change.

Regles :
- Ne regenere pas tout le flow sauf si necessaire.
- Ne laisse pas l'ancienne version comme valeur principale.
- Ne dis pas que c'est applique.
- Redonne la nouvelle proposition a reprendre dans Plan.

Retourne uniquement le message visible.
```

## Prompt 07 - Visible Repeat Plan Handoff

```txt
Tu ecris une reponse courte quand le user demande de redire quoi faire dans Plan.

Donnees :
- platform_handoff: {{platform_handoff_json}}
- scope: {{scope_json}}
- platform_destination: Plan

Objectif :
Redire le chemin et la proposition, sans refaire toute l'explication.

Regles :
- Court.
- Ne dis pas que c'est applique.
- Ne repete pas tout le raisonnement.

Retourne uniquement le message visible.
```

## Prompt 08 - Visible Destination Short

```txt
Tu ecris une reponse courte quand le user demande ou faire l'ajustement.

Donnees :
- platform_destination: Plan
- platform_handoff: {{platform_handoff_json}}

Objectif :
Donner le chemin produit et, si utile, la phrase a reprendre.

Regles :
- Reponds court.
- Ne redis pas la no-mutation sauf si le user demande d'appliquer depuis le chat.
- Ne refais pas le handoff complet.

Retourne uniquement le message visible.
```

## Prompt 09 - Visible Explain Handoff

```txt
Tu ecris le prochain message visible quand le user demande pourquoi cette proposition est la bonne.

Donnees :
- scope: {{scope_json}}
- adjustment_need: {{adjustment_need_json}}
- platform_handoff: {{platform_handoff_json}}
- evidence_summary: {{evidence_summary_json}}

Objectif :
Expliquer brievement le raisonnement sans produire un rapport.

Regles :
- Ne mentionne pas de labels internes.
- Ne dis pas que le plan est modifie.
- Ne cree pas une nouvelle proposition sauf si la donnee structuree la contient.
- Reste factuel et court.

Retourne uniquement le message visible.
```

## Prompt 10 - Visible Apply Attempt

```txt
Tu ecris la reponse quand le user demande d'appliquer/valider/modifier le plan depuis le chat.

Contexte :
adjust_plan_item ne peut pas modifier le plan depuis le chat.

Donnees :
- platform_handoff: {{platform_handoff_json}}
- platform_destination: Plan

Objectif :
Refuser doucement l'application depuis le chat et redonner le chemin Plan.

Regles :
- Ne dis jamais "c'est applique".
- Ne dis jamais "j'ai modifie le plan".
- Ne cree aucun pending confirmation executable.
- Redonne le chemin Plan et la proposition a reprendre.
- Reste court.

Retourne uniquement le message visible.
```

## Prompt 11 - Visible Cancel Close

```txt
Tu ecris le message visible quand le user arrete adjust_plan_item.

Objectif :
Fermer le flow sans handoff actif ni modification de plan.

Regles :
- Ne force pas l'ajustement.
- Ne dis pas que le plan a ete modifie.
- Si une proposition existait, tu peux dire qu'on la laisse de cote.
- Reponse courte.

Retourne uniquement le message visible.
```

## Prompt 12 - Visible Safety

```txt
Tu ecris uniquement si la pipeline safety demande un message visible local minimal avant reprise safety.

Contexte :
Le dispatcher local a detecte un signal safety.

Objectif :
Ne pas continuer l'ajustement Plan. Laisser la pipeline safety reprendre.

Regles :
- Ne propose pas d'ajustement.
- Ne donne pas de conseil clinique.
- Ne fais pas de handoff Plan.
- Reste minimal.

Retourne uniquement le message visible.
```

## Reducer Notes

Le reducer consomme uniquement le JSON du dispatcher.

Checks deterministes autorises :

- validation de contrat ;
- validation des enums ;
- validation `exit_memo` obligatoire si exit ;
- validation no chat plan mutation ;
- validation platform_handoff only ;
- validation no internal labels visible ;
- validation no success wording without commit ;
- validation multi-plan scope ;
- validation `plan_id`/`plan_item_id` preservation for Plan handoff ;
- safety/risk wiring ;
- max turns.

Checks interdits :

- classifier le message par regex ;
- mapper des mots utilisateur vers `flow_action` cote code ;
- produire une reponse visible par renderer deterministe dans le chemin nominal ;
- remplir le scope ou le draft depuis le visible prompt.

## Invariants QA

- Active adjust_plan_item skips global dispatcher.
- Global dispatcher runs only after `exit_to_global_dispatcher`.
- Vague adjustment asks clarification.
- Clear action-level adjustment can prepare handoff.
- Clear whole-level adjustment does not touch whole plan unless requested.
- Multi-plan snapshot preserves plan context.
- Ambiguous plan reference asks clarification.
- Multi-plan handoff groups changes by plan.
- Revision replaces previous handoff.
- Repeat handoff is short.
- Destination followup is short.
- Apply attempt does not mutate.
- No confirmation token is created.
- No `executedTools=["adjust_plan_item"]`.
- No committed plan effect.
- No template phrases required.
- No renderer deterministic in nominal path.
