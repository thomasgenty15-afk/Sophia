# Implementation Agent Prompt - post_morning_nudge.action

```txt
Mission : implementer le premier dispatcher local de followup morning nudge :
`post_morning_nudge.action_dispatcher`.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant de coder :

1. Architecture globale morning nudge :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/morning-nudge-v2-local-flow-architecture.md

2. Prompts du dispatcher action :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-action-dispatcher-prompts.md

3. Patterns locaux deja mis en place :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/select-state-potion-local-dispatcher-prompts.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/prepare-attack-card-local-dispatcher-prompts.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/prepare-defense-card-local-dispatcher-prompts.md

Code a inspecter :

- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/momentum_morning_nudge.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/momentum_morning_nudge_test.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/process-checkins/index.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/whatsapp-webhook/
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/run.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/agent_exec.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/

Objectif

Quand un `morning_nudge_v2` de type `action_nudge` a ete envoye, le prochain
message utilisateur doit etre traite par un flow local :

```txt
post_morning_nudge.action
  -> action_dispatcher JSON
  -> reducer local
  -> prompt visible stage-specific
  -> close / continue / exit_to_global_dispatcher
```

Le dispatcher global ne doit pas fonctionner tant que ce flow local est actif.

Exception unique :
si `action_dispatcher` retourne `flow_action=exit_to_global_dispatcher`, alors
le meme message utilisateur est reanalyse par le dispatcher global dans une
seconde passe avec `exit_memo`.

Contraintes absolues

Ne pas faire :

- regex metier ;
- `message.includes(...)` metier ;
- renderer visible deterministe ;
- template visible fixe ;
- analyse semantique du message user dans le resolver ;
- dispatcher global pendant flow actif ;
- creation ou modification d'action ;
- creation de carte, potion, rappel, scheduled_checkin, preference ;
- patch de plan ;
- confirmation executable ;
- pending confirmation token ;
- effet durable depuis `post_morning_nudge.action`.

Ne pas lancer :

- `supabase db reset`
- commande destructive Supabase.

Scope de cette mission

Implementer seulement :

```txt
post_morning_nudge.action_dispatcher
```

Ne pas implementer maintenant :

```txt
post_morning_nudge.suppressed_action_dispatcher
post_morning_nudge.emotional_presence_dispatcher
```

Ces deux flows peuvent rester en stub/unsupported propre si l'architecture
globale les reference deja.

Etape 1 - Verifier l'architecture globale

Verifier que l'architecture globale morning nudge est en place ou l'ajouter si
elle ne l'est pas encore :

- payload `morning_nudge_v2` enrichi ;
- `nudge_kind`;
- `opens_local_flow`;
- `intended_followup_flow`;
- active state `post_morning_nudge`;
- resolver base sur payload structure ;
- global dispatcher skip pendant flow actif ;
- `exit_to_global_dispatcher` second pass.

Si ce socle n'existe pas, l'implementer d'abord pour le cas action uniquement.

Etape 2 - Ajouter les types action dispatcher

Creer les types pour le contrat JSON :

```txt
PostMorningNudgeActionFlowAction =
  quick_close_ready
  motivate_light
  choose_first_step
  reduce_scope
  handle_blocker
  support_not_today
  meaning_reconnect
  ask_action_clarification
  repeat_nudge_context
  negative_nudge_feedback
  cancel_flow
  exit_to_global_dispatcher
  safety_preempt

PostMorningNudgeActionVisibleTaskKind =
  quick_close
  gentle_boost
  choose_first_step
  reduce_scope
  blocker_help
  not_today_protective_close
  meaning_reconnect
  ask_action_clarification
  repeat_context
  negative_feedback_close
  exit_or_cancel
  safety
```

Ajouter aussi :

- `local_assessment`;
- `state_updates`;
- `exit_memo`;
- validation enums.

Etape 3 - Ajouter le prompt dispatcher local

Utiliser le prompt :

`Prompt 01 - Dispatcher Local Action Followup`

du document :

/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-action-dispatcher-prompts.md

Le prompt doit recevoir :

- message utilisateur courant ;
- source_nudge payload ;
- etat local post_morning_nudge ;
- historique utile ;
- turn_count/max_turns ;
- contexte action/item cible.

Il doit retourner uniquement JSON.

Ne pas remplacer ses decisions par du TypeScript.

Etape 4 - Ajouter le reducer local action

Le reducer doit :

- valider le JSON ;
- incrementer `turn_count`;
- appliquer `state_updates.status`;
- fermer si `close_after_visible=true`;
- fermer ou sortir si max_turns atteint ;
- exiger `exit_memo` si `exit_to_global_dispatcher`;
- ne jamais creer d'effet durable ;
- ne jamais appeler le dispatcher global sauf sortie locale explicite.

Checks autorises :

- validation de contrat ;
- validation enum ;
- safety/risk score wiring ;
- max turns ;
- no mutation ;
- exit_memo obligatoire ;
- anti-duplication.

Checks interdits :

- classifier le message user par regex ;
- mapper texte user vers flow_action ;
- produire une reponse visible deterministe.

Etape 5 - Ajouter les prompts visibles

Brancher les prompts visibles du document :

1. Quick Close
2. Gentle Boost
3. Choose First Step
4. Reduce Scope
5. Blocker Help
6. Not Today Protective Close
7. Meaning Reconnect
8. Ask Action Clarification
9. Repeat Context
10. Negative Feedback Close
11. Exit Or Cancel

Chaque visible prompt :

- recoit uniquement les donnees necessaires ;
- retourne uniquement le message visible ;
- ne remplit pas l'etat ;
- ne route pas ;
- ne cree pas d'effet.

Etape 6 - Integrer avec le routing

Quand l'etat actif est :

```json
{
  "skill_id": "post_morning_nudge",
  "flow_kind": "action",
  "status": "active"
}
```

Le runtime doit :

```txt
skip global dispatcher
-> call post_morning_nudge.action_dispatcher
-> reduce
-> call exactly one visible prompt
```

Exception :

```txt
flow_action = exit_to_global_dispatcher
```

Dans ce cas :

- clear/mark local state `exit_to_global`;
- transmettre `exit_memo`;
- reanalyser le meme message par le dispatcher global ;
- ne pas produire un message local concurrent.

Etape 7 - Logs / trace

Ajouter logs :

- `post_morning_nudge.action_dispatcher_called`;
- `flow_action`;
- `visible_task.kind`;
- `local_assessment.action_readiness`;
- `local_assessment.motivation_need`;
- `state_updates.status`;
- `close_after_visible`;
- `exit_to_global_dispatcher`;
- `exit_memo.reason`;
- `global_dispatcher_skipped_due_post_morning_nudge`;
- `global_dispatcher_second_pass_after_local_exit`.

Etape 8 - Tests unitaires

Ajouter tests :

1. simple ack closes
   User : "ok je m'y mets"
   Attendu : `quick_close_ready`, close, no global.

2. ready answer no question
   User : "yes je lance ca"
   Attendu : visible quick close, pas de relance.

3. light hesitation
   User : "j'ai un peu la flemme"
   Attendu : `motivate_light`.

4. first step
   User : "je commence par quoi ?"
   Attendu : `choose_first_step`.

5. overload
   User : "c'est trop gros pour ce matin"
   Attendu : `reduce_scope`, no plan mutation claim.

6. concrete blocker
   User : "j'ai que 10 minutes"
   Attendu : `handle_blocker`.

7. not today
   User : "je peux pas aujourd'hui"
   Attendu : `support_not_today`, no push.

8. meaning doubt
   User : "je vois plus trop pourquoi je fais ca"
   Attendu : `meaning_reconnect`, no potion launch.

9. explicit potion request
   User : "je veux une potion de clarte"
   Attendu : `exit_to_global_dispatcher`, likely_intent `select_state_potion`.

10. explicit card request
    User : "prepare-moi une carte d'attaque"
    Attendu : `exit_to_global_dispatcher`, likely_intent `prepare_attack_card`.

11. negative nudge feedback
    User : "pas maintenant, ca me met la pression"
    Attendu : `negative_nudge_feedback`, close.

12. cancel
    User : "laisse tomber"
    Attendu : `cancel_flow`, close.

13. global skipped
    Active action flow + normal followup
    Attendu : aucun appel dispatcher global.

14. global second pass
    Active action flow + explicit tool request
    Attendu : local exit puis dispatcher global appele avec exit_memo.

Etape 9 - QA reel minimal

Scenario A - close rapide

- Envoyer/forcer un `morning_nudge_v2` action sur une action du jour.
- User : "ok je m'y mets"
- Attendu : 2 appels IA max si visible IA : local dispatcher + visible prompt.
- Aucun dispatcher global.
- Flow ferme.

Scenario B - motivation

- User : "j'ai la flemme ce matin"
- Attendu : boost court, pas de tool, pas de global.

Scenario C - premiere marche

- User : "je commence par quoi ?"
- Attendu : premiere marche simple.

Scenario D - sortie tool

- User : "prepare-moi une carte d'attaque pour m'y mettre"
- Attendu : local exit_to_global_dispatcher + exit_memo ; global reprend apres.

Critere d'acceptation

- `post_morning_nudge.action_dispatcher` existe et est branche.
- Le resolver utilise uniquement `flow_kind=action`, pas le texte user.
- Le dispatcher global ne tourne pas pendant le flow local.
- Le dispatcher global tourne seulement apres `exit_to_global_dispatcher`.
- `exit_memo` est obligatoire et transmis.
- Les messages visibles passent par prompts stage-specific.
- Aucun renderer visible deterministe.
- Aucune regex metier.
- Aucun effet durable.
- Le flow ferme vite quand le user est pret.
```

