# Implementation Agent Prompt - post_morning_nudge.emotional_presence

```txt
Mission : implementer le troisieme dispatcher local de followup morning nudge :
`post_morning_nudge.emotional_presence_dispatcher`.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant de coder :

1. Architecture globale morning nudge :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/morning-nudge-v2-local-flow-architecture.md

2. Prompts du dispatcher emotional presence :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-emotional-presence-dispatcher-prompts.md

3. Dispatchers post morning nudge deja specifies :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-action-dispatcher-prompts.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-suppressed-action-dispatcher-prompts.md

4. Patterns locaux deja mis en place :
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

Objectif

Quand un `morning_nudge_v2` de type `emotional_presence_nudge` a ete envoye, le
prochain message utilisateur doit etre traite par un flow local :

```txt
post_morning_nudge.emotional_presence
  -> emotional_presence_dispatcher JSON
  -> reducer local
  -> prompt visible stage-specific
  -> close / continue / exit_to_global_dispatcher
```

Ce flow existe parce que Sophia a envoye une presence relationnelle ou
emotionnelle sans action cible. Il ne doit pas inventer une action ni agir comme
si une action avait ete supprimee.

Le dispatcher global ne doit pas fonctionner tant que ce flow local est actif.

Exception unique :
si `emotional_presence_dispatcher` retourne
`flow_action=exit_to_global_dispatcher`, alors le meme message utilisateur est
reanalysee par le dispatcher global dans une seconde passe avec `exit_memo`.

Contraintes absolues

Ne pas faire :

- regex metier ;
- `message.includes(...)` metier ;
- renderer visible deterministe ;
- template visible fixe ;
- analyse semantique du message user dans le resolver ;
- dispatcher global pendant flow actif ;
- inventer une action cible ;
- parler comme si une action avait ete supprimee ;
- pousser l'execution ou l'accountability ;
- creation ou modification d'action ;
- creation de carte, potion, rappel, scheduled_checkin, preference ;
- patch de plan ;
- confirmation executable ;
- pending confirmation token ;
- effet durable depuis `post_morning_nudge.emotional_presence`.

Ne pas lancer :

- `supabase db reset`
- commande destructive Supabase.

Scope de cette mission

Implementer seulement :

```txt
post_morning_nudge.emotional_presence_dispatcher
```

Les dispatchers action et suppressed_action peuvent deja exister ou etre
implementes separement. Ne les refactorer que si necessaire pour partager les
types/reducer communs.

Etape 1 - Verifier l'architecture globale

Verifier que l'architecture globale morning nudge est en place ou l'ajouter si
elle ne l'est pas encore :

- payload `morning_nudge_v2` enrichi ;
- `nudge_kind=emotional_presence_nudge` ;
- `opens_local_flow=true` ;
- `intended_followup_flow=emotional_presence` ;
- active state `post_morning_nudge` ;
- resolver base sur payload structure ;
- global dispatcher skip pendant flow actif ;
- `exit_to_global_dispatcher` second pass.

Si ce socle n'existe pas, l'implementer pour le cas emotional_presence sans
changer la semantique des autres flows.

Etape 2 - Ajouter les types emotional presence dispatcher

Creer les types pour le contrat JSON :

```txt
PostMorningNudgeEmotionalPresenceFlowAction =
  presence_ack_close
  hold_space_support
  ask_support_preference
  offer_soft_next_step
  reactivate_gently
  clarify_emotional_need
  repeat_presence_context
  negative_nudge_feedback
  cancel_flow
  exit_to_global_dispatcher
  safety_preempt

PostMorningNudgeEmotionalPresenceVisibleTaskKind =
  presence_close
  hold_space
  ask_support_preference
  offer_soft_next_step
  reactivate_gently
  clarify_emotional_need
  repeat_presence_context
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

`Prompt 01 - Dispatcher Local Emotional Presence Followup`

du document :

/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-emotional-presence-dispatcher-prompts.md

Le prompt doit recevoir :

- message utilisateur courant ;
- source_nudge payload ;
- etat local post_morning_nudge ;
- historique utile ;
- turn_count/max_turns ;
- coach_intent ;
- source_grounding ;
- contexte emotionnel utile.

Il doit retourner uniquement JSON.

Ne pas remplacer ses decisions par du TypeScript.

Etape 4 - Ajouter le reducer local emotional presence

Le reducer doit :

- valider le JSON ;
- incrementer `turn_count`;
- appliquer `state_updates.status`;
- fermer si `close_after_visible=true`;
- fermer ou sortir si max_turns atteint ;
- exiger `exit_memo` si `exit_to_global_dispatcher`;
- conserver le fait qu'il n'y a pas d'action cible ;
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

1. Presence Close
2. Hold Space
3. Ask Support Preference
4. Offer Soft Next Step
5. Reactivate Gently
6. Clarify Emotional Need
7. Repeat Presence Context
8. Negative Feedback Close
9. Exit Or Cancel
10. Safety

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
  "flow_kind": "emotional_presence",
  "status": "active"
}
```

Le runtime doit :

```txt
skip global dispatcher
-> call post_morning_nudge.emotional_presence_dispatcher
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

- `post_morning_nudge.emotional_presence_dispatcher_called`;
- `flow_action`;
- `visible_task.kind`;
- `local_assessment.emotional_load`;
- `local_assessment.support_need`;
- `local_assessment.action_readiness`;
- `state_updates.status`;
- `close_after_visible`;
- `exit_to_global_dispatcher`;
- `exit_memo.reason`;
- `global_dispatcher_skipped_due_post_morning_nudge`;
- `global_dispatcher_second_pass_after_local_exit`.

Etape 8 - Tests unitaires

Ajouter tests :

1. simple ack closes
   User : "merci"
   Attendu : `presence_ack_close`, close, no global.

2. emotional support
   User : "en vrai ca va pas trop"
   Attendu : `hold_space_support`, no action pressure.

3. vague support need
   User : "je sais pas, c'est bizarre"
   Attendu : `ask_support_preference` ou `clarify_emotional_need`.

4. soft next step
   User : "donne-moi juste un petit point d'appui"
   Attendu : `offer_soft_next_step`, no action creation.

5. gentle reactivation
   User : "j'aimerais reprendre un petit cap"
   Attendu : `reactivate_gently`, no plan patch.

6. repeat context
   User : "pourquoi tu m'envoies ca ?"
   Attendu : `repeat_presence_context`.

7. no hidden action
   User : "c'etait quoi l'action ?"
   Attendu : repeat context explique qu'il n'y avait pas d'action cible cachee.

8. negative nudge feedback
   User : "pas maintenant"
   Attendu : `negative_nudge_feedback`, close.

9. explicit preference request
   User : "a partir de maintenant pose-moi moins de questions"
   Attendu : `exit_to_global_dispatcher`, likely_intent `update_coach_preferences`.

10. explicit potion request
    User : "je veux une potion de clarte"
    Attendu : `exit_to_global_dispatcher`, likely_intent `select_state_potion`.

11. global skipped
    Active emotional presence flow + normal followup
    Attendu : aucun appel dispatcher global.

12. global second pass
    Active emotional presence flow + explicit tool request
    Attendu : local exit puis dispatcher global appele avec exit_memo.

Etape 9 - QA reel minimal

Scenario A - close presence

- Envoyer/forcer un `morning_nudge_v2` emotional presence.
- User : "merci"
- Attendu : local emotional presence flow, fermeture rapide, pas de global.

Scenario B - support

- User : "en vrai ca va pas"
- Attendu : soutien doux, pas de push action, pas de mutation.

Scenario C - reprise douce

- User : "j'aimerais reprendre un petit cap"
- Attendu : reactivation douce, sans creation de plan/action.

Scenario D - sortie preference

- User : "pose-moi moins de questions a partir de maintenant"
- Attendu : local exit_to_global_dispatcher + exit_memo ; global reprend apres.

Critere d'acceptation

- `post_morning_nudge.emotional_presence_dispatcher` existe et est branche.
- Le resolver utilise uniquement `flow_kind=emotional_presence`, pas le texte
  user.
- Le dispatcher global ne tourne pas pendant le flow local.
- Le dispatcher global tourne seulement apres `exit_to_global_dispatcher`.
- `exit_memo` est obligatoire et transmis.
- Les messages visibles passent par prompts stage-specific.
- Aucun renderer visible deterministe.
- Aucune regex metier.
- Aucun effet durable.
- Le flow n'invente jamais une action cible.
```

