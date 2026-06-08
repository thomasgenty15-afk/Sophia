# Implementation Agent Prompt - post_morning_nudge.suppressed_action

```txt
Mission : implementer le deuxieme dispatcher local de followup morning nudge :
`post_morning_nudge.suppressed_action_dispatcher`.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Docs a lire avant de coder :

1. Architecture globale morning nudge :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/morning-nudge-v2-local-flow-architecture.md

2. Prompts du dispatcher suppressed action :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-suppressed-action-dispatcher-prompts.md

3. Dispatcher action deja specifie :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-action-dispatcher-prompts.md

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

Quand un `morning_nudge_v2` de type `suppressed_action_nudge` a ete envoye, le
prochain message utilisateur doit etre traite par un flow local :

```txt
post_morning_nudge.suppressed_action
  -> suppressed_action_dispatcher JSON
  -> reducer local
  -> prompt visible stage-specific
  -> close / continue / exit_to_global_dispatcher
```

Ce flow existe parce qu'il y avait une action ou un item prevu, mais Sophia a
choisi de ne pas le pousser a cause de l'etat du user.

Le dispatcher global ne doit pas fonctionner tant que ce flow local est actif.

Exception unique :
si `suppressed_action_dispatcher` retourne
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
- pousser l'action par defaut ;
- dire que le plan est modifie, reporte ou allege ;
- creation ou modification d'action ;
- creation de carte, potion, rappel, scheduled_checkin, preference ;
- patch de plan ;
- confirmation executable ;
- pending confirmation token ;
- effet durable depuis `post_morning_nudge.suppressed_action`.

Ne pas lancer :

- `supabase db reset`
- commande destructive Supabase.

Scope de cette mission

Implementer seulement :

```txt
post_morning_nudge.suppressed_action_dispatcher
```

Ne pas implementer maintenant :

```txt
post_morning_nudge.emotional_presence_dispatcher
```

Le dispatcher action peut deja exister ou etre implemente separement. Ne le
refactorer que si necessaire pour partager les types/reducer communs.

Etape 1 - Verifier l'architecture globale

Verifier que l'architecture globale morning nudge est en place ou l'ajouter si
elle ne l'est pas encore :

- payload `morning_nudge_v2` enrichi ;
- `nudge_kind=suppressed_action_nudge` ;
- `opens_local_flow=true` ;
- `intended_followup_flow=suppressed_action` ;
- active state `post_morning_nudge` ;
- resolver base sur payload structure ;
- global dispatcher skip pendant flow actif ;
- `exit_to_global_dispatcher` second pass.

Si ce socle n'existe pas, l'implementer pour le cas suppressed action sans
changer la semantique des autres flows.

Etape 2 - Ajouter les types suppressed action dispatcher

Creer les types pour le contrat JSON :

```txt
PostMorningNudgeSuppressedActionFlowAction =
  protective_close
  support_emotion
  offer_minimal_save
  confirm_no_action_today
  reopen_action_gently
  ask_suppressed_action_clarification
  repeat_protective_context
  negative_nudge_feedback
  cancel_flow
  exit_to_global_dispatcher
  safety_preempt

PostMorningNudgeSuppressedActionVisibleTaskKind =
  protective_close
  soft_support
  offer_minimal_save
  confirm_no_action_today
  reopen_action_gently
  ask_suppressed_action_clarification
  repeat_protective_context
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

`Prompt 01 - Dispatcher Local Suppressed Action Followup`

du document :

/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-suppressed-action-dispatcher-prompts.md

Le prompt doit recevoir :

- message utilisateur courant ;
- source_nudge payload ;
- etat local post_morning_nudge ;
- historique utile ;
- turn_count/max_turns ;
- suppressed_action_titles ;
- suppression_reason ;
- contexte action/item cible.

Il doit retourner uniquement JSON.

Ne pas remplacer ses decisions par du TypeScript.

Etape 4 - Ajouter le reducer local suppressed action

Le reducer doit :

- valider le JSON ;
- incrementer `turn_count`;
- appliquer `state_updates.status`;
- fermer si `close_after_visible=true`;
- fermer ou sortir si max_turns atteint ;
- exiger `exit_memo` si `exit_to_global_dispatcher`;
- maintenir le contexte `suppressed_action_titles` ;
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

1. Protective Close
2. Soft Support
3. Offer Minimal Save
4. Confirm No Action Today
5. Reopen Action Gently
6. Ask Suppressed Action Clarification
7. Repeat Protective Context
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
  "flow_kind": "suppressed_action",
  "status": "active"
}
```

Le runtime doit :

```txt
skip global dispatcher
-> call post_morning_nudge.suppressed_action_dispatcher
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

- `post_morning_nudge.suppressed_action_dispatcher_called`;
- `flow_action`;
- `visible_task.kind`;
- `local_assessment.action_readiness`;
- `local_assessment.suppression_still_valid`;
- `local_assessment.main_need`;
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
   Attendu : `protective_close`, close, no global.

2. emotional support
   User : "je suis vraiment epuise"
   Attendu : `support_emotion`, no action push.

3. cannot today
   User : "je peux pas aujourd'hui"
   Attendu : `confirm_no_action_today`, no plan mutation claim.

4. minimal save
   User : "j'aimerais quand meme sauver un petit truc"
   Attendu : `offer_minimal_save`.

5. reopen action
   User : "non je veux quand meme avancer dessus"
   Attendu : `reopen_action_gently`.

6. vague answer
   User : "je sais pas"
   Attendu : `ask_suppressed_action_clarification`.

7. repeat context
   User : "pourquoi tu ne me parles pas de mon action ?"
   Attendu : `repeat_protective_context`.

8. negative nudge feedback
   User : "pas maintenant, ca me met la pression"
   Attendu : `negative_nudge_feedback`, close.

9. explicit defense card request
   User : "prepare-moi une carte de defense pour ne pas craquer"
   Attendu : `exit_to_global_dispatcher`, likely_intent `prepare_defense_card`.

10. explicit attack card request
    User : "prepare-moi une carte d'attaque pour m'y mettre"
    Attendu : `exit_to_global_dispatcher`, likely_intent `prepare_attack_card`.

11. global skipped
    Active suppressed flow + normal followup
    Attendu : aucun appel dispatcher global.

12. global second pass
    Active suppressed flow + explicit tool request
    Attendu : local exit puis dispatcher global appele avec exit_memo.

Etape 9 - QA reel minimal

Scenario A - close protecteur

- Envoyer/forcer un `morning_nudge_v2` suppressed action.
- User : "merci"
- Attendu : local suppressed flow, fermeture rapide, pas de global.

Scenario B - fatigue

- User : "je suis trop fatigue aujourd'hui"
- Attendu : soutien doux, pas de push action, pas de mutation.

Scenario C - sauver une micro-version

- User : "je veux quand meme sauver un petit truc"
- Attendu : proposition minimale, sans dire que le plan est modifie.

Scenario D - sortie tool

- User : "prepare-moi une carte de defense"
- Attendu : local exit_to_global_dispatcher + exit_memo ; global reprend apres.

Critere d'acceptation

- `post_morning_nudge.suppressed_action_dispatcher` existe et est branche.
- Le resolver utilise uniquement `flow_kind=suppressed_action`, pas le texte
  user.
- Le dispatcher global ne tourne pas pendant le flow local.
- Le dispatcher global tourne seulement apres `exit_to_global_dispatcher`.
- `exit_memo` est obligatoire et transmis.
- Les messages visibles passent par prompts stage-specific.
- Aucun renderer visible deterministe.
- Aucune regex metier.
- Aucun effet durable.
- Le flow ne pousse jamais l'action par defaut.
```

