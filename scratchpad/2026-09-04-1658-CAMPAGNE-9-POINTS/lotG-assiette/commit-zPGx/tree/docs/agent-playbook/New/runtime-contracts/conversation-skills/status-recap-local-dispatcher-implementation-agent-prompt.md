# Implementation Agent Prompt - status_recap Local Dispatcher

```txt
Mission : migrer `status_recap` vers une architecture a dispatcher local,
read-only, DB-grounded, avec followups locaux et sortie explicite vers le
dispatcher global.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant de coder :

1. Contrat actuel status_recap :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/status-recap.md

2. Nouveau contrat prompts local dispatcher :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/status-recap-local-dispatcher-prompts.md

3. Patterns locaux deja mis en place :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/select-state-potion-local-dispatcher-prompts.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/morning-nudge-v2-local-flow-architecture.md

Code a inspecter :

- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/status_recap/contract.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/status_recap/projection.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/status_recap/reducer.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/status_recap/renderer.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/status_recap/runtime.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/status_recap/status_recap.test.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/status_recap/status_recap_runtime_test.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/run.ts

Objectif

`status_recap` doit devenir un flow local read-only :

```txt
status request
  -> status_recap.local_dispatcher JSON
  -> loadStatusRecapProjection()
  -> reducer/validator read-only
  -> visible prompt DB-grounded
  -> active state for followups

followup message
  -> status_recap local flow active
  -> skip global dispatcher
  -> status_recap.local_dispatcher
  -> answer locally or exit_to_global_dispatcher
```

Le dispatcher global ne doit pas fonctionner pendant un flow `status_recap`
actif.

Exception unique :

```txt
flow_action = exit_to_global_dispatcher
```

Alors le meme message user est reanalyse par le dispatcher global en seconde
passe avec `exit_memo`.

Contraintes absolues

Ne pas faire :

- regex metier ;
- `message.includes(...)` metier ;
- renderer visible deterministe dans le chemin nominal ;
- template visible fixe ;
- dispatcher global pendant flow actif ;
- mutation durable ;
- creation/annulation/modification/activation ;
- product help depuis status_recap ;
- confirmation executable ;
- pending confirmation token ;
- claim durable sans source DB.

Ne pas lancer :

- `supabase db reset`
- commande destructive Supabase.

Invariant principal

`status_recap` reste strictement :

```txt
toolExecution = "none"
executedTools = []
operation_suggestions = []
committed_effects = []
read-only
DB-grounded
```

Etape 1 - Ajouter le contrat dispatcher local

Ajouter les types pour :

```txt
StatusRecapLocalFlowAction =
  answer_status
  answer_object_status
  answer_coach_preferences_status
  answer_cancelled_objects
  answer_recent_effects
  answer_fait_prevu_fragile
  narrow_scope
  repeat_last_status
  explain_sources
  no_source_status
  human_recap_no_db
  cancel_flow
  exit_to_global_dispatcher
  safety_preempt

StatusRecapVisibleTaskKind =
  status_compact
  object_status
  coach_preferences_status
  cancelled_objects
  recent_effects
  fait_prevu_fragile
  narrow_scope_question
  repeat_status
  explain_sources
  no_source
  human_recap_redirect
  exit_or_cancel
  safety
```

Ajouter aussi :

- `status_intent`;
- `read_scope`;
- `state_updates`;
- `exit_memo`;
- validation enums.

Etape 2 - Ajouter l'etat actif

Ajouter un etat tempMemory :

```txt
__status_recap_flow_state_v1
```

Structure :

```json
{
  "skill_id": "status_recap",
  "mode": "local_readonly_flow",
  "status": "active|closing|closed|exit_to_global|safety",
  "last_intent": "durable_status|object_status|recent_effects_recap|fait_prevu_fragile|cancelled_objects|coach_preferences_status|human_recap_no_db|unclear",
  "last_target_objects": [],
  "last_projection_summary": {},
  "last_answer_summary": "string|null",
  "turn_count": 0,
  "max_turns": 3,
  "created_at": "iso",
  "updated_at": "iso"
}
```

Le flow doit rester court. Default `max_turns=3`.

Etape 3 - Ajouter le prompt dispatcher local

Utiliser :

`Prompt 01 - Dispatcher Local Status Recap`

du document :

/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/status-recap-local-dispatcher-prompts.md

Le prompt doit recevoir :

- message user ;
- etat local status_recap ;
- projection summary ;
- dernier answer summary ;
- historique utile ;
- signaux route/turn frame utiles.

Il retourne uniquement JSON.

Ne pas remplacer ses decisions par du TypeScript.

Etape 4 - Conserver la projection DB comme source de verite

`loadStatusRecapProjection()` reste proprietaire de la lecture DB.

Le dispatcher local ne doit jamais inventer les faits. Il decide seulement :

- quel type de status lire ;
- quelles categories cibler ;
- s'il faut repondre localement ;
- s'il faut sortir vers le global.

Le reducer/visible prompt recoivent des faits structures issus de la projection.

Etape 5 - Remplacer le renderer visible deterministe

Le chemin nominal ne doit plus appeler `renderStatusRecapDecision()` pour
produire le message visible final.

A la place :

```txt
projection DB
-> reducer prepares grounded facts
-> visible prompt stage-specific
```

Le renderer legacy peut rester pour compat tests ou wrappers si necessaire,
mais il ne doit plus etre le chemin nominal.

Prompts visibles a brancher :

1. Status Compact
2. Object Status
3. Coach Preferences Status
4. Cancelled Objects
5. Recent Effects
6. Fait Prevu Fragile
7. Narrow Scope Question
8. Repeat Status
9. Explain Sources
10. No Source
11. Human Recap Redirect
12. Exit Or Cancel

Etape 6 - Reducer/validator read-only

Le reducer doit :

- valider le JSON ;
- valider les enums ;
- charger/recharger la projection si necessaire ;
- preparer des `grounded_*_facts_json` pour le visible prompt ;
- interdire tout claim absent des faits ;
- maintenir `last_answer_summary`;
- incrementer `turn_count`;
- fermer si `close_after_visible=true` ou max turns atteint ;
- exiger `exit_memo` si sortie globale.

Checks deterministes autorises :

- validation contrat ;
- validation enum ;
- validation source DB avant claim durable ;
- validation no mutation ;
- validation format `fait_prevu_fragile` trois lignes ;
- validation `exit_memo` ;
- max turns ;
- safety/risk wiring.

Checks interdits :

- classifier le message user par regex ;
- mapper mots user vers intent/status en TypeScript ;
- produire le message visible via renderer deterministe nominal.

Etape 7 - Routing

Premiere activation :

- le dispatcher global peut selectionner `status_recap` si aucun flow actif ne
  doit prendre la main ;
- ensuite `status_recap.local_dispatcher` doit produire la decision structuree.

Followup :

Si `__status_recap_flow_state_v1.status=active` :

```txt
skip global dispatcher
-> call status_recap.local_dispatcher
-> reduce
-> visible prompt
```

Exception :

```txt
flow_action=exit_to_global_dispatcher
```

Alors :

- clear/mark local state `exit_to_global`;
- transmettre `exit_memo`;
- reanalyser le meme message par le dispatcher global ;
- ne pas produire un message local concurrent.

Etape 8 - Exit memo

`exit_memo` est obligatoire pour toute sortie globale.

Il doit expliquer :

- dernier intent status ;
- derniers objets cibles ;
- dernier recap rendu ;
- projection summary ;
- pourquoi le message courant n'est plus un status ;
- likely intent pour le global.

Exemples :

User : "ok cree-le"

```json
{
  "reason": "explicit_tool_request",
  "handoff_hint_for_global_dispatcher": {
    "likely_intent": "one_shot_reminder",
    "why": "The user is no longer asking status; they ask to create the reminder mentioned in the status context."
  }
}
```

User : "ou je le change ?"

```json
{
  "reason": "product_help",
  "handoff_hint_for_global_dispatcher": {
    "likely_intent": "product_help",
    "why": "The user asks where/how to change an existing object in the product."
  }
}
```

Etape 9 - Logs / trace

Ajouter logs :

- `status_recap.local_dispatcher_called`;
- `flow_action`;
- `status_intent.kind`;
- `target_objects`;
- `visible_task.kind`;
- `projection_used`;
- `projection_summary`;
- `global_dispatcher_skipped_due_status_recap`;
- `exit_to_global_dispatcher`;
- `exit_memo.reason`;
- `global_dispatcher_second_pass_after_status_exit`;
- `toolExecution`;
- `executedTools`.

Etape 10 - Tests unitaires

Ajouter/adapter tests :

1. status global read-only
   Attendu : toolExecution none, executedTools [].

2. object status reminders
   User : "et les rappels ?"
   En followup actif.
   Attendu : local answer_object_status, no global.

3. repeat
   User : "redis-moi"
   Attendu : repeat_last_status local.

4. explain sources
   User : "d'ou tu sais ?"
   Attendu : explain_sources local.

5. product help exit
   User : "ou je le change ?"
   Attendu : exit_to_global_dispatcher likely product_help.

6. create request exit
   User : "ok cree-le"
   Attendu : exit_to_global_dispatcher likely reminder/tool, no local mutation.

7. preference update exit
   User : "mets moins de questions maintenant"
   Attendu : exit_to_global_dispatcher likely update_coach_preferences.

8. human recap no DB
   User : "resume notre discussion"
   Attendu : human_recap_no_db or exit normal_coaching, not DB status.

9. cancelled reminder
   Attendu : cancelled not active.

10. requested-only effect
    Attendu : no durable claim.

11. coach defaults
    Attendu : system defaults ignored as explicit choices.

12. active status flow skips global
    Attendu : no global dispatcher call.

13. exit second pass
    Attendu : local exit + global dispatcher with exit_memo.

14. fait/preveu/fragile
    Attendu : exactly three lines, no question.

Etape 11 - QA reel minimal

Scenario A - initial status + reminder followup

User :
"sans rien modifier, dis-moi ce qui est en place"

Puis :
"et les rappels ?"

Attendu :
- premier tour status_recap ;
- second tour local status_recap ;
- pas de global au second tour ;
- read-only.

Scenario B - exit creation

Apres status :
"ok cree-le"

Attendu :
- local exit_to_global_dispatcher ;
- exit_memo explique le dernier status ;
- global reprend ;
- status_recap ne mute rien.

Scenario C - product help

Apres status :
"ou je le change ?"

Attendu :
- local exit_to_global_dispatcher likely product_help ;
- global reprend.

Scenario D - source explanation

Apres status :
"d'ou tu sais ?"

Attendu :
- local explain_sources ;
- pas de global.

Critere d'acceptation

- `status_recap.local_dispatcher` existe et est branche.
- Followups status sont geres localement.
- Le dispatcher global ne tourne pas pendant flow status actif.
- Le dispatcher global tourne seulement apres `exit_to_global_dispatcher`.
- `exit_memo` est obligatoire et transmis.
- Projection DB reste source de verite.
- Aucun effet durable.
- Aucun renderer visible deterministe dans le chemin nominal.
- Aucune regex metier nouvelle.
- Les tests existants read-only restent verts.
```

