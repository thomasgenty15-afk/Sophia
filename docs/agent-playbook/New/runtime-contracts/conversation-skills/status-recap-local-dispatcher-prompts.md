# status_recap Local Dispatcher Prompt Architecture

Document de prompts pour migrer `status_recap` vers une architecture a
dispatcher local, tout en conservant son invariant principal :

```txt
read-only, DB-grounded, never mutates
```

## Mental Model

`status_recap` repond aux questions du type :

- "qu'est-ce qui existe vraiment ?";
- "est-ce que ce rappel est actif ?";
- "quelles preferences coach sont enregistrees ?";
- "fais le recap fait / prevu / fragile";
- "qu'est-ce qui a ete cree puis annule ?";

La premiere activation peut venir du dispatcher global quand aucun flow actif ne
doit prendre la main.

Apres une reponse `status_recap`, le skill doit rester actif brièvement parce
que le user peut demander :

- plus de detail sur un objet ;
- seulement une categorie ;
- "redis-moi";
- "et les rappels ?";
- "c'est source d'ou ?";
- "ok cree-le" ;
- "ou je le change ?" ;
- "en fait aide-moi a faire autre chose".

Tant que `status_recap` est actif, le dispatcher global ne doit pas fonctionner,
sauf si le dispatcher local retourne explicitement :

```txt
flow_action = exit_to_global_dispatcher
```

Dans ce cas, le meme message user est reanalyse par le dispatcher global avec un
`exit_memo`.

## Runtime Shape

```txt
first status request
  -> global dispatcher selects status_recap
  -> status_recap.local_dispatcher
  -> loadStatusRecapProjection()
  -> reducer read-only decision
  -> visible prompt DB-grounded
  -> write __status_recap_flow_state_v1

followup user message
  -> status_recap local flow active
  -> skip global dispatcher
  -> status_recap.local_dispatcher
  -> maybe reload projection
  -> reducer read-only decision
  -> visible prompt DB-grounded
  -> close / continue / exit_to_global_dispatcher
```

## Inventaire

Inventaire retenu : **13 prompts au total**.

- 1 prompt dispatcher local structure.
- 12 prompts conversationnels visibles.

Routes non visibles :

- `exit_to_global_dispatcher` ne produit pas de message local si le global doit
  reanalyser le meme message.
- `safety_preempt` laisse la pipeline safety reprendre.

## Cross-Dispatcher Note Information

Use `09-note-information-contract.md`.

When `status_recap` is called inline by a parent flow, the parent must provide
`note_information` with `target_dispatcher="status_recap"`. `status_recap`
answers read-only from DB/effect projections and returns to the parent with a
note-compatible summary; it does not mutate parent fields.

When standalone `status_recap` exits to global or safety, produce
`note_information` with `source_flow_id="status_recap"` and the catalog
presentation. Do not produce it for `repeat_last_status`, `narrow_scope`, or
`cancel_flow` when no new topic exists. `target_dispatcher` is `global` for
create/modify/cancel/product/help/normal coaching requests and `safety_crisis`
for safety. The handoff context must include last DB intent, target objects,
projection summary, answer summary, and the read-only/no-mutation constraint.

## Difference Avec L'Existant

L'existant est :

```txt
projection DB -> reducer deterministe -> renderer deterministe
```

La cible est :

```txt
dispatcher local JSON
  -> projection DB
  -> reducer/validator read-only
  -> prompt visible stage-specific DB-grounded
```

La projection DB reste deterministe et source de verite.

Le renderer visible deterministe doit sortir du chemin nominal. Les prompts
visibles peuvent seulement reformuler les faits fournis par la projection et le
reducer. Ils ne doivent jamais inventer un etat durable.

## State

Etat actif recommande :

```json
{
  "skill_id": "status_recap",
  "mode": "local_readonly_flow",
  "status": "active|closing|closed|exit_to_global|safety",
  "last_intent": "durable_status|object_status|recent_effects_recap|fait_prevu_fragile|cancelled_objects|coach_preferences_status|human_recap_no_db|unclear",
  "last_target_objects": [],
  "last_projection_summary": {
    "attack_card_count": 0,
    "defense_card_count": 0,
    "one_shot_pending_count": 0,
    "one_shot_cancelled_recent_count": 0,
    "recurring_reminder_count": 0,
    "potion_session_count": 0,
    "coach_preference_count": 0,
    "recent_effect_history_count": 0
  },
  "last_answer_summary": "string|null",
  "turn_count": 0,
  "max_turns": 3,
  "created_at": "iso",
  "updated_at": "iso"
}
```

Default `max_turns=3`. `status_recap` doit rester un read-only followup court.

## Dispatcher Output Contract

Le dispatcher local retourne uniquement ce JSON :

```json
{
  "flow_action": "answer_status|answer_object_status|answer_coach_preferences_status|answer_cancelled_objects|answer_recent_effects|answer_fait_prevu_fragile|narrow_scope|repeat_last_status|explain_sources|no_source_status|human_recap_no_db|cancel_flow|exit_to_global_dispatcher|safety_preempt",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "status_intent": {
    "kind": "durable_status|object_status|recent_effects_recap|fait_prevu_fragile|cancelled_objects|coach_preferences_status|human_recap_no_db|unclear|not_status|safety",
    "summary": "string",
    "requires_db_projection": true,
    "requires_effect_history": true
  },
  "target_objects": [
    "attack_card|defense_card|one_shot_reminder|recurring_reminder|potion|coach_preference|plan_item|memory|unknown"
  ],
  "read_scope": {
    "requested_categories": [
      "attack_cards|defense_cards|one_shot_reminders|recurring_reminders|potions|coach_preferences|recent_effects|all"
    ],
    "include_cancelled": true,
    "include_recent_failed_or_blocked_effects": true,
    "format": "compact|object_answer|recap|fait_prevu_fragile"
  },
  "state_updates": {
    "status": "active|closing|closed|exit_to_global|safety",
    "turn_count_increment": 1,
    "close_after_visible": false
  },
  "visible_task": {
    "kind": "status_compact|object_status|coach_preferences_status|cancelled_objects|recent_effects|fait_prevu_fragile|narrow_scope_question|repeat_status|explain_sources|no_source|human_recap_redirect|exit_or_cancel|safety",
    "instruction": "string"
  },
  "exit_memo": {
    "needed": true,
    "reason": "topic_change|explicit_tool_request|product_help|preference_update|new_goal|confirmation_for_other_flow|safety|unknown|none",
    "user_intent_summary": "string|null",
    "local_flow_context": {
      "skill_id": "status_recap",
      "last_intent": "string|null",
      "last_target_objects": [],
      "last_answer_summary": "string|null",
      "last_projection_summary": "string|null"
    },
    "handoff_hint_for_global_dispatcher": {
      "likely_intent": "prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|one_shot_reminder|recurring_reminder|product_help|normal_coaching|unknown",
      "why": "string|null"
    }
  },
  "evidence": ["string"]
}
```

Rules :

- `exit_memo.needed=true` uniquement pour `exit_to_global_dispatcher` ou
  `safety_preempt`.
- `answer_*` actions doivent toujours avoir `requires_db_projection=true`.
- `recent_effects_recap` doit avoir `requires_effect_history=true`.
- `human_recap_no_db` ne doit pas rendre un panneau DB status ; il doit sortir
  vers normal coaching ou rendre un redirect visible selon runtime.
- Si le user demande "ok cree-le", "annule-le", "change-le", "active-le",
  `flow_action=exit_to_global_dispatcher`.
- Si le user demande "ou je le change ?", `flow_action=exit_to_global_dispatcher`
  avec likely_intent `product_help`.
- Si le user demande seulement "et les rappels ?", rester dans `status_recap`
  avec target reminders.

## Prompt 01 - Dispatcher Local Status Recap

```txt
Tu es le dispatcher local du flow status_recap.

Contexte :
status_recap est un skill read-only, DB-grounded.
Il repond aux questions sur ce qui existe vraiment, ce qui est actif, ce qui est
annule, les preferences coach enregistrees, les effets recents, ou le format
fait / prevu / fragile.

Tu n'es pas le dispatcher global.
Tu ne reponds jamais directement au user.
Tu retournes uniquement un JSON conforme au contrat.

Regle centrale :
status_recap ne mute jamais. Il ne cree, modifie, annule, active, confirme ou
programme rien.

Etat local status_recap :
{{status_recap_state_json}}

Projection summary disponible :
{{projection_summary_json}}

Message utilisateur :
{{user_message}}

Historique utile :
{{conversation_excerpt}}

Actions possibles :

1. answer_status
Le user demande un recap global de ce qui existe, est actif, est en place ou est
vraiment enregistre.

2. answer_object_status
Le user demande le statut d'un objet ou d'une categorie precise : cartes,
rappels ponctuels, rappels recurrents, potions, plan item, memoire.

3. answer_coach_preferences_status
Le user demande les preferences coach actives/enregistrees.

4. answer_cancelled_objects
Le user demande ce qui a ete annule, ou si un objet annule est encore actif.

5. answer_recent_effects
Le user demande ce qui s'est passe recemment, ce qui a ete cree/echoue/bloque,
ou un recap d'execution recent.

6. answer_fait_prevu_fragile
Le user demande explicitement un recap fait / prevu / fragile.

7. narrow_scope
Le user demande un status mais le scope est ambigu et il faut choisir la
categorie avant de repondre.

8. repeat_last_status
Le user demande de redire, repeter, resumer ou reformuler le status precedent.

9. explain_sources
Le user demande d'ou vient l'information, si c'est fiable, ou pourquoi Sophia
dit qu'un objet existe/n'existe pas.

10. no_source_status
Le user demande un status, mais la projection indique qu'aucune source DB utile
n'est disponible pour affirmer l'existence.

11. human_recap_no_db
Le user demande un recap humain/conversationnel, pas un status DB.
Exemples : "recap ce que je t'ai dit", "resume mon probleme", "fais le recap de
notre discussion".
Ce n'est pas un status_recap DB.

12. cancel_flow
Le user demande d'arreter le recap/status sans nouveau sujet.

13. exit_to_global_dispatcher
Le user demande autre chose : creer, modifier, annuler, activer, lancer,
programmer, product help, preference update, potion, carte, rappel, plan,
coaching general.
Tu dois fournir un exit_memo utile pour la seconde analyse globale.

14. safety_preempt
Signal safety. Fournis un exit_memo reason=safety.

Regles :

- Ne fais aucune regex metier.
- Ne decide pas par mot-cle isole.
- Ne transforme pas une commande mutative en status.
- Ne transforme pas une question "ou/comment dans l'app" en status.
- Ne transforme pas un recap humain en status DB.
- DB projection = verite d'etat actuel.
- Effect history = verite d'execution observee, mais un effet requested/failed
  ne prouve jamais qu'un objet existe.
- Si un followup demande une categorie precise, reste dans status_recap.
- Si un followup demande d'agir, sors vers le dispatcher global.
- Si tu sors, explique dans exit_memo ce que le status precedent avait etabli.

Sortie JSON :
{
  "flow_action": "answer_status|answer_object_status|answer_coach_preferences_status|answer_cancelled_objects|answer_recent_effects|answer_fait_prevu_fragile|narrow_scope|repeat_last_status|explain_sources|no_source_status|human_recap_no_db|cancel_flow|exit_to_global_dispatcher|safety_preempt",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "status_intent": {
    "kind": "durable_status|object_status|recent_effects_recap|fait_prevu_fragile|cancelled_objects|coach_preferences_status|human_recap_no_db|unclear|not_status|safety",
    "summary": "string",
    "requires_db_projection": true,
    "requires_effect_history": true
  },
  "target_objects": [
    "attack_card|defense_card|one_shot_reminder|recurring_reminder|potion|coach_preference|plan_item|memory|unknown"
  ],
  "read_scope": {
    "requested_categories": [
      "attack_cards|defense_cards|one_shot_reminders|recurring_reminders|potions|coach_preferences|recent_effects|all"
    ],
    "include_cancelled": true,
    "include_recent_failed_or_blocked_effects": true,
    "format": "compact|object_answer|recap|fait_prevu_fragile"
  },
  "state_updates": {
    "status": "active|closing|closed|exit_to_global|safety",
    "turn_count_increment": 1,
    "close_after_visible": false
  },
  "visible_task": {
    "kind": "status_compact|object_status|coach_preferences_status|cancelled_objects|recent_effects|fait_prevu_fragile|narrow_scope_question|repeat_status|explain_sources|no_source|human_recap_redirect|exit_or_cancel|safety",
    "instruction": "string"
  },
  "exit_memo": {
    "needed": true,
    "reason": "topic_change|explicit_tool_request|product_help|preference_update|new_goal|confirmation_for_other_flow|safety|unknown|none",
    "user_intent_summary": "string|null",
    "local_flow_context": {
      "skill_id": "status_recap",
      "last_intent": "string|null",
      "last_target_objects": [],
      "last_answer_summary": "string|null",
      "last_projection_summary": "string|null"
    },
    "handoff_hint_for_global_dispatcher": {
      "likely_intent": "prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|one_shot_reminder|recurring_reminder|product_help|normal_coaching|unknown",
      "why": "string|null"
    }
  },
  "evidence": ["string"]
}
```

## Prompt 02 - Visible Status Compact

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande un recap global de ce qui existe vraiment.
Le reducer fournit uniquement des faits issus de la projection DB/effect history.

Faits autorises :
{{grounded_status_facts_json}}

Objectif :
Rendre un recap court, naturel et DB-grounded.

Regles :
- N'ajoute aucun fait absent des donnees.
- Ne dis jamais "j'ai cree", "j'ai active", "c'est fait".
- Ne donne pas d'instructions produit.
- Ne propose pas de prochaine action.
- Si une categorie est vide, dis-le sobrement.
- Reste compact.

Retourne uniquement le message visible.
```

## Prompt 03 - Visible Object Status

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande le statut d'une categorie ou d'un objet precis.

Faits autorises :
{{grounded_object_status_facts_json}}

Objectif :
Repondre seulement sur l'objet ou la categorie demandee.

Regles :
- N'ajoute aucun fait absent des donnees.
- Si la source DB manque, dis que tu ne vois pas de source suffisante.
- Ne transforme pas la reponse en recap global.
- Ne donne pas de chemin produit.
- Ne propose pas de modification.

Retourne uniquement le message visible.
```

## Prompt 04 - Visible Coach Preferences Status

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande les preferences coach actives/enregistrees.

Faits autorises :
{{grounded_coach_preferences_facts_json}}

Objectif :
Dire quelles preferences coach explicites sont enregistrees.

Regles :
- Ne compte pas les defaults systeme comme choix utilisateur explicites.
- N'ajoute aucune preference absente des donnees.
- Ne dis pas que tu changes une preference.
- Ne donne pas de chemin produit.
- Reste court.

Retourne uniquement le message visible.
```

## Prompt 05 - Visible Cancelled Objects

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande ce qui a ete annule, ou si un objet annule est encore actif.

Faits autorises :
{{grounded_cancelled_objects_facts_json}}

Objectif :
Clarifier l'etat actuel : actif ou annule.

Regles :
- DB courante prime sur l'historique.
- Si un rappel a ete cree puis annule, dis clairement qu'il n'est pas actif.
- Ne dis pas qu'un objet est actif si la DB dit cancelled.
- Ne propose pas de recréer l'objet.
- Reste factuel.

Retourne uniquement le message visible.
```

## Prompt 06 - Visible Recent Effects

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande ce qui s'est passe recemment, ou un recap des effets recents.

Faits autorises :
{{grounded_recent_effects_facts_json}}

Objectif :
Rendre une timeline courte d'execution observee, sans confondre effet demande et
objet durable actuel.

Regles :
- Un effet requested/failed/blocked ne prouve pas qu'un objet existe.
- Un effet committed doit rester lie a sa source DB si l'etat actuel est connu.
- Ne dis pas "c'est actif" sans source DB actuelle.
- Reste court.

Retourne uniquement le message visible.
```

## Prompt 07 - Visible Fait Prevu Fragile

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande un format fait / prevu / fragile.

Faits autorises :
{{grounded_fait_prevu_fragile_facts_json}}

Objectif :
Rendre exactement trois lignes :
Fait :
Prevu :
Fragile :

Regles :
- Exactement trois lignes.
- Pas de question.
- Pas d'introduction.
- Pas de conclusion.
- N'ajoute aucun fait absent des donnees.
- Ne dis pas qu'un objet existe sans source DB.

Retourne uniquement le message visible.
```

## Prompt 08 - Visible Narrow Scope Question

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande un status, mais le scope est trop ambigu pour repondre utilement
sans faire un recap global potentiellement lourd.

Objectif :
Poser une seule question courte pour choisir la categorie.

Regles :
- Une seule question.
- Ne fais pas une longue liste.
- Ne rends pas encore de status.
- Ne propose pas de mutation.

Retourne uniquement le message visible.
```

## Prompt 09 - Visible Repeat Status

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande de redire ou reformuler le dernier status.

Dernier status autorise :
{{last_answer_summary}}

Faits autorises :
{{grounded_status_facts_json}}

Objectif :
Redire le status precedent de maniere plus courte ou plus claire.

Regles :
- Ne rajoute pas de nouveaux faits non fournis.
- Ne change pas l'etat des objets.
- Ne propose pas d'action.
- Reste bref.

Retourne uniquement le message visible.
```

## Prompt 10 - Visible Explain Sources

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande d'ou vient l'information, ou pourquoi Sophia affirme qu'un
objet existe/n'existe pas.

Faits autorises :
{{grounded_source_explanation_facts_json}}

Objectif :
Expliquer sobrement les sources : DB metier pour l'etat actuel, effect history
pour l'execution recente.

Regles :
- Ne donne pas de details internes inutiles.
- Explique que la DB courante prime sur l'historique.
- Ne transforme pas ca en product help.
- Reste court.

Retourne uniquement le message visible.
```

## Prompt 11 - Visible No Source

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user demande un status, mais aucune source DB suffisante ne permet
d'affirmer qu'un objet existe.

Faits autorises :
{{grounded_no_source_facts_json}}

Objectif :
Dire clairement que Sophia ne voit pas de source suffisante.

Regles :
- Ne dis pas que l'objet n'existe absolument pas.
- Dis que tu ne vois pas de source DB suffisante.
- Ne propose pas de creer l'objet.
- Ne donne pas de chemin produit.
- Reste court.

Retourne uniquement le message visible.
```

## Prompt 12 - Visible Human Recap Redirect

```txt
Tu ecris le prochain message visible de Sophia seulement si le runtime choisit
de ne pas faire de seconde passe globale.

Contexte :
Le user demande un recap humain ou conversationnel, pas un status DB.

Objectif :
Dire brievement qu'on sort du recap d'etat factuel.

Regles :
- Ne rends pas de status DB.
- Ne parle pas de sources DB.
- Reponse courte.

Retourne uniquement le message visible.
```

## Prompt 13 - Visible Exit Or Cancel

```txt
Tu ecris le prochain message visible de Sophia.

Contexte :
Le user annule le flow status_recap sans autre demande a router.

Objectif :
Fermer proprement.

Regles :
- Ne rends pas un nouveau recap.
- Ne propose pas d'action.
- Reponse courte.

Retourne uniquement le message visible.
```

## Reducer Notes

Le reducer consomme uniquement le JSON du dispatcher.

Checks deterministes autorises :

- validation de contrat ;
- validation des enums ;
- validation `exit_memo` obligatoire si exit ;
- validation que le flow reste non-mutant ;
- validation que les faits visibles viennent de la projection ;
- validation des formats, notamment `fait_prevu_fragile` trois lignes ;
- validation source DB avant claim durable ;
- safety/risk wiring ;
- max turns.

Checks interdits :

- classifier le message par regex ;
- mapper des mots utilisateur vers `flow_action` cote code ;
- produire une reponse visible par renderer deterministe dans le chemin nominal.

## Invariants QA

- Status global reste DB-grounded.
- Object status ne devient pas product help.
- Coach preferences ignore system defaults as explicit choices.
- Cancelled reminder is rendered as not active.
- Requested-only effect does not become durable object.
- Human recap does not render DB status.
- Followup "et les rappels ?" stays local.
- Followup "redis-moi" stays local.
- Followup "d'ou tu sais ?" stays local explain sources.
- Followup "ok cree-le" exits to global with `exit_memo`.
- Followup "ou je le change ?" exits to global product_help with `exit_memo`.
- Global dispatcher does not run while status_recap active.
- Global dispatcher runs only after `exit_to_global_dispatcher`.
- No durable effect is created by this flow.
