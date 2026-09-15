# QA Run Report - Product Help Local Flow - Real Conditions

## 1. Contexte Du Test

- Date du run valide : 2026-06-12
- Run ID : `product-help-local-flow-20260612-r5`
- Scope : `qa-product-help-local-flow-20260612-r5`
- Flow audite : `product_help`
- Objectif : verifier que le flow local `product_help` respecte le fix demande :
  - pas de handoff direct vers un dispatcher local operationnel ;
  - sortie explicite vers le dispatcher global quand le user demande une action hors product_help ;
  - presence d'une `note_information` exploitable ;
  - reprise effective par le bon flow operationnel (`prepare_attack_card`) ;
  - aucun effet durable execute par erreur.
- Mode de test : conditions reelles via harness local, IA active, conversation multi-tours.
- Guidelines suivies :
  - `docs/agent-playbook/New/test-material/14-qa-test-guidelines.md`
  - `docs/agent-playbook/New/test-material/01-qa-run-report-structure.md`

### Perimetre Du Run

Le run valide est uniquement `r5`.

Des tentatives precedentes (`r2`, `r3`, `r4`) ont ete exclues du verdict final :
- `r2` : incident technique HTTP 502 sans trace exploitable.
- `r3` / `r4` : executions invalidees car elles ne validaient pas encore le runtime final charge apres correction/reload.

Ces tentatives ont ete nettoyees et ne sont pas melangees au verdict QA.

### Nettoyage

Le nettoyage cible du perimetre QA `r5` a ete execute :
- `chat_messages` : nettoye
- `scheduled_checkins` : nettoye
- `user_chat_states` : nettoye
- `user_topic_memories` : nettoye
- `memory_items` : nettoye
- `auth.users` : nettoye
- `user_memories` : table absente ou non disponible, non bloquant

## 2. Tours De Conversation

### T1 - Entree Product Help

User :
> Dans Sophia, je ne comprends pas la difference entre une carte d'attaque et une carte de defense. Tu peux me l'expliquer sans creer quoi que ce soit ?

Assistant :
> C'est une question de moment et d'objectif. La carte d'attaque t'aide a lancer l'action quand c'est difficile de s'y mettre : elle clarifie le premier geste pour reduire la friction. La carte de defense intervient pour proteger ton action contre un risque de derapage (fatigue, impulsion, pression) en prevoyant un plan B simple. En resume : l'attaque sert a entrer dans l'action, la defense sert a ne pas en sortir.

Trace systeme :
- HTTP status : `200`
- `response_owner` : `product_help`
- `selected_handler` : `product_help`
- `route_reason` : `skill_entry_signal`
- Safety : `low`
- Tools executes : aucun
- Effets directs : aucun

Verdict T1 : green.

Analyse :
Le flow `product_help` est correctement active. La reponse reste explicative, sans creation d'objet et sans effet durable.

### T2 - Continuation Product Help Active

User :
> Oui, et si j'en ai une plus tard, je la retrouve ou dans l'app ? Je veux juste le chemin, pas un statut de mes cartes.

Assistant :
> Tu peux les retrouver a deux endroits dans ton dashboard : soit dans l'onglet **Ressources** (elles y sont rangees par niveau), soit directement dans ton **Plan** en ouvrant la mission ou l'habitude a laquelle elles sont liees.

Trace systeme :
- HTTP status : `200`
- `response_owner` : `product_help`
- `selected_handler` : `product_help`
- `route_reason` : `active_product_help_local_dispatcher`
- Safety : `none`
- Tools executes : aucun
- Effets directs : aucun

Verdict T2 : green.

Analyse :
Le dispatcher global normal ne reprend pas pendant le flow actif. Le message passe bien par le dispatcher local `product_help`. La reponse respecte la contrainte utilisateur : chemin produit uniquement, pas de statut DB.

### T3 - Demande Operationnelle Hors Product Help

User :
> D'accord. Alors prepare-moi une carte d'attaque pour ranger mes papiers demain matin.

Assistant :
> OK. Je te prepare une carte d'attaque claire pour "ranger tes papiers" demain matin.
>
> Carte d'attaque (version courte)
> - But (30 sec) : "Je prepare juste mon point de depart, pas tout le rangement."
> - 1er geste (5 min) : mets tout sur une surface (table/sol), et crees 3 piles :
>   1) A garder
>   2) A trier
>   3) A jeter / a classer ailleurs
> - Regle anti-blocage : je ne decide pas parfaitement, je fais "au premier tri".
> - Fin facile (check) : des que les 3 piles sont faites, je m'arrete (ou je continue si je suis en elan).
>
> Tu veux que ce soit plutot "5 minutes" ou "15 minutes" demain matin ?

Trace systeme :
- HTTP status : `200`
- `response_owner` : `tool_skill`
- `selected_handler` : `prepare_attack_card`
- `route_reason` : `tool_skill_intent_start`
- Safety : `low`
- Tools executes : aucun
- Effets directs : aucun

Trace specifique au fix :
- `product_help.local_visible_reply` bloque avec raison :
  - `local_exit_to_global_dispatcher_blocks_local_reply`
- `local_flow_exit_handoff` present :
  - `source_flow_id` : `product_help`
  - `target_dispatcher` : `global`
  - `consumed_by` : `global_dispatcher_second_pass`
  - `response_owner` : `tool_skill`
  - `selected_handler` : `prepare_attack_card`
- `note_information` presente :
  - `source_flow_id` : `product_help`
  - `target_dispatcher` : `global`
  - `handoff_reason` : `explicit_user_request`
  - `structured_context.origin_flow` : `product_help`
  - `structured_context.requested_operation` : `prepare_attack_card`
  - `structured_context.user_task_description` : `ranger mes papiers demain matin`
- Effets directs demandes : `0`
- Effets directs autorises : `0`
- Effets directs executes : `0`

Trace manquante pour valider le nouveau flow :
- pas de `toolSkillRun.mode = platform_handoff`
- pas de `toolSkillRun.executable_from_chat = false`
- pas de `toolSkillRun.no_chat_mutation = true`
- pas de `toolSkillRun.runtime_trace` contenant :
  - `prepare_attack_card.local_flow`
  - `local_dispatcher start`
  - `local_dispatcher decision`
  - `reducer reduced`
  - `visible_stage complete`
- pas de `visible_task` local `prepare_attack_card`
- pas de `visible_task_context`

Verdict T3 : red.

Analyse :
Le fix `product_help` est partiellement valide : `product_help` ne fait plus de handoff direct vers un dispatcher local operationnel et sort vers le dispatcher global avec une `note_information`.

En revanche, le run ne prouve pas la reprise effective par le nouveau dispatcher local `prepare_attack_card`. La trace selectionne `prepare_attack_card`, mais le runtime local attendu n'apparait pas. La reponse visible simule une carte d'attaque courte alors que le nouveau contrat `prepare_attack_card` doit rester en `platform_handoff`, ne pas creer depuis le chat, et collecter/clarifier les champs via le dispatcher local et son visible agent stage-specific.

Conclusion T3 :
- `product_help -> global` : green.
- `global -> nouveau prepare_attack_card local dispatcher` : red.
- Effet durable execute : aucun, green.
- Reponse visible conforme au nouveau contrat attack card : red.

### T4 - Continuation Dans Prepare Attack Card

User :
> Plutot 5 minutes. Le piege, c'est que je commence a lire les papiers importants et je me perds.

Assistant :
> Pour ne pas te laisser distraire par la lecture de tes papiers alors que tu veux simplement les trier, je te propose d'utiliser Le texte magique. Est-ce que cette technique te semble adaptee ?

Trace systeme :
- HTTP status : `200`
- `response_owner` : `tool_skill`
- `selected_handler` : `prepare_attack_card`
- `route_reason` : `tool_skill_intent_start`
- Safety : `low`
- Tool execution : `blocked`
- Effets directs demandes : `0`
- Effets directs autorises : `0`
- Effets directs executes : `0`

Trace locale `prepare_attack_card` :
- `flow_action` : `choose_technique`
- `visible_task` : `ask_or_confirm_technique`
- `status` : `clarifying`
- `mode` : `platform_handoff`
- `no_chat_mutation` : `true`
- `executable_from_chat` : `false`
- `runtime_trace` contient :
  - `global_dispatcher_skipped`
  - `note_information_consumed`
  - decision dispatcher local
  - reducer execute
  - visible stage complete

Verdict T4 : yellow.

Analyse :
La suite de conversation montre cette fois des traces locales `prepare_attack_card` avec `platform_handoff`, `no_chat_mutation` et `executable_from_chat=false`. Toutefois, comme T3 a demarre par une reponse visible non conforme, T4 ne suffit pas a valider le flow complet de transition.

## 3. Analyse De Fluidite Humaine

La conversation est fluide pour un utilisateur, mais pas conforme systemiquement :
- T1 repond clairement a la question produit.
- T2 conserve le cadre demande par le user : chemin produit, pas de statut personnel.
- T3 gere mal le changement d'intention : le user passe d'une aide produit a une demande de carte, mais Sophia repond comme si une carte courte pouvait etre preparee dans le chat.
- T4 revient vers une clarification plus proche du nouveau flow cible, mais apres un T3 deja non conforme.

Point bloquant :
- En T3, la reponse visible donne un brouillon de carte. Ce n'est pas acceptable si le contrat actuel `prepare_attack_card` interdit la creation/preparation de carte depuis le chat et exige un handoff plateforme non mutant.

## 4. Analyse Systeme

### Invariants Verifies

- Global dispatcher skipped while flow active : green en T2.
- Pas de handoff direct `product_help` -> dispatcher local operationnel : green en T3.
- Exit vers global avec `note_information` : green en T3.
- Reprise par le dispatcher global dans le meme tour : green en T3.
- Routage global vers `prepare_attack_card` : partiel en T3 (`selected_handler=prepare_attack_card`).
- Execution effective du nouveau dispatcher local `prepare_attack_card` sur le meme tour : red en T3.
- Pas de reponse visible locale apres exit product_help : green en T3.
- Aucun effet durable execute par erreur : green sur T1-T4.
- Continuation dans le flow cible apres transition : yellow en T4, car T3 etait non conforme.
- Pas de fallback global silencieux pendant product_help actif : green.

### Evidence Principale

La trace T3 contient la preuve partielle :

```json
{
  "blocked_path": "product_help.local_visible_reply",
  "reason_code": "local_exit_to_global_dispatcher_blocks_local_reply",
  "local_flow_exit_handoff": {
    "source_flow_id": "product_help",
    "target_dispatcher": "global",
    "consumed_by": "global_dispatcher_second_pass",
    "response_owner": "tool_skill",
    "selected_handler": "prepare_attack_card"
  }
}
```

Cette trace valide seulement la sortie locale `product_help` vers le global et la selection nominale de `prepare_attack_card`.

Elle ne valide pas l'execution du nouveau runtime local `prepare_attack_card`. Les marqueurs attendus sont absents du T3 :

```json
{
  "toolSkillRun": {
    "mode": "platform_handoff",
    "no_chat_mutation": true,
    "executable_from_chat": false,
    "runtime_trace": [
      "prepare_attack_card.local_flow local_dispatcher start",
      "prepare_attack_card.local_flow local_dispatcher decision",
      "prepare_attack_card.local_flow reducer reduced",
      "prepare_attack_card.local_flow visible_stage complete"
    ]
  }
}
```

## 5. Verdict Global

Verdict : red.

Le fix demande n'est pas completement valide en conditions reelles sur le run `product-help-local-flow-20260612-r5`.

Le flow `product_help` :
- reste actif pour les questions produit ;
- ne fait plus de handoff direct vers un dispatcher local operationnel ;
- sort vers le dispatcher global avec une `note_information` ;
- n'execute aucun tool ni effet durable par erreur.

Mais le run montre un blocage :
- le tour T3 selectionne `prepare_attack_card` sans prouver l'execution du nouveau dispatcher local ;
- la reponse visible T3 ressemble a une preparation de carte dans le chat ;
- cela contredit le contrat attendu si `prepare_attack_card` doit uniquement preparer un handoff plateforme non mutant et ne pas creer/preparer de carte visible depuis le chat.

Bug sheet requise : oui.

Risque residuel : eleve tant que le chemin `product_help -> global -> prepare_attack_card` ne force pas le runtime local `prepare_attack_card` sur le meme tour avec traces `platform_handoff`.

Correction recommandee :
- garantir que la sortie `product_help` vers global, lorsqu'elle est reroutee vers `prepare_attack_card`, appelle effectivement `maybeRunPrepareAttackCardOperation` via le pipeline runtime ;
- ajouter une QA/invariant trace exigeant `toolSkillRun.mode=platform_handoff`, `no_chat_mutation=true`, `executable_from_chat=false` et `runtime_trace` local `prepare_attack_card` au tour de transition ;
- relancer un run reel apres correction.
