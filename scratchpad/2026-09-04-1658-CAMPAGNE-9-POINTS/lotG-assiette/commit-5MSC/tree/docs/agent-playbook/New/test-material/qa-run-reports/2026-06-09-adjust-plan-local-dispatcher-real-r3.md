# QA Run Report - adjust_plan_item local dispatcher real R3 - 2026-06-09

## 1. Context

- Date: 2026-06-09.
- Flow vise: `adjust_plan_item` local dispatcher.
- Objectif: verifier les nouvelles modifications en conditions reelles apres les runs invalides R1/R2.
- Cadre IA reel: valide. Run hors sandbox demande par le user, Supabase local `127.0.0.1:54321`, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback direct.
- Connexion QA: `qa-skill / all_skills_adjustplan_local_20260609_qa1`.
- Trajectoire: demande d'allegement de plan -> precision -> handoff Plan -> tentative d'application -> repetition -> arret local.

## 2. Tours

### T1 - Entree adjust_plan_item

User:

> Mon plan est trop lourd cette semaine, surtout l'action du soir. Je voudrais l'alleger sans tout abandonner.

Sophia:

> C'est compris, on cherche à réduire la charge de vos soirées cette semaine tout en gardant l'essentiel. Quelle partie de cette action vous semble la plus pesante actuellement ?

Trace:

- HTTP 200, `ok=true`.
- `response_owner=tool_skill`.
- `route_decision.selected_handler=adjust_plan_item`.
- `reason_code=tool_skill_intent_start`.
- `note_information.source_flow_id=global_dispatcher`, `target_dispatcher=adjust_plan_item`.
- `tool_skill_run.flow_action=get_info_db`.
- `committed_effects=[]`.

Evaluation:

- Pass: premiere activation locale via note information.
- Pass: pas de mutation.
- Warning: statut DB inline appele alors que le snapshot plan est vide; la question reste fluide mais peu ancree DB.

### T2 - Precision utilisateur

User:

> C'est surtout les 20 minutes de decompression et le telephone hors chambre. Cette semaine je veux garder le signal de pause, mais en version 5 minutes, carnet pret et telephone juste pose loin du lit.

Sophia:

> Pour alléger ton rituel tout en gardant ton signal de pause, on peut partir sur 5 minutes de décompression, le carnet à portée de main et le téléphone loin du lit. Je te laisse reprendre cette proposition directement dans ton Plan.

Trace:

- HTTP 200, `ok=true`.
- `response_owner=tool_skill`.
- `selected_handler=adjust_plan_item`.
- Handoff Plan non mutant.
- `committed_effects=[]`.

Evaluation:

- Pass: le flow transforme la precision en proposition utile.
- Pass: pas de promesse d'application.

### T3 - Apply attempt

User:

> Ok vas-y, applique-le dans mon plan.

Sophia:

> C'est noté pour cet ajustement plus léger. Je ne peux pas modifier ton programme directement ici, alors je t'invite à te rendre dans ton Plan pour y reporter cette nouvelle version : 'Pause 5 min, carnet prêt, téléphone loin du lit'.

Trace:

- HTTP 200, `ok=true`.
- `response_owner=tool_skill`.
- `flow_action=apply_attempt`.
- `reason_code=adjust_plan_item_apply_attempt_no_chat_mutation`.
- `effect_ledger.counts.committed=0`.
- `effect_ledger.entries[0].no_chat_mutation=true`.
- `effect_ledger.entries[0].executed_tool=false`.
- `executed_tools=[]`.

Evaluation:

- Pass critique: `ok vas-y / applique` ne modifie pas la DB.
- Pass: wording explicite "je ne peux pas modifier".

### T4 - Repeat handoff

User:

> Redis-moi exactement quoi mettre dans Plan, en une phrase courte.

Sophia:

> Ta proposition pour l'action du soir — 5 minutes de pause, carnet prêt et téléphone loin du lit — est disponible dans ton Plan.

Trace:

- HTTP 200, `ok=true`.
- `response_owner=tool_skill`.
- `route_decision.reason_code=active_adjust_plan_item_local_dispatcher`.
- `blocked_paths[0].path=global_dispatcher`.
- `flow_action=repeat_plan_handoff`.
- `visible_task.kind=repeat_plan_handoff`.
- `effect_ledger.counts.committed=0`.
- `effect_ledger.entries[0].executed_tool=false`.
- `no_chat_mutation=true`.

Evaluation:

- Pass: global dispatcher bloque pendant flow actif.
- Pass: repeat reste dans `adjust_plan_item`.
- Fail visible: "est disponible dans ton Plan" peut faire croire que le changement est deja present dans Plan. Le contexte `do_not_say` disait pourtant de ne pas dire que le Plan est applique, modifie, sauvegarde ou enregistre.

### T5 - Stop local

User:

> Laisse tomber pour l'instant, on arrete cet ajustement.

Sophia:

> Pas de souci, on s'arrête là pour cet ajustement. Je te laisse reprendre la suite sur ton plan.

Trace:

- HTTP 200, `ok=true`.
- `response_owner=tool_skill`.
- `route_decision.reason_code=active_adjust_plan_item_local_dispatcher`.
- `blocked_paths[0].path=global_dispatcher`.
- `flow_action=cancel_flow`.
- `visible_task.kind=cancel_close`.
- `local_flow_state=null`.
- `effect_ledger.counts.committed=0`.

Evaluation:

- Pass: stop local ne part pas au global sur le meme tour.
- Pass: flow state ferme.
- Warning visible: apres "on arrete", "reprendre la suite sur ton plan" pousse encore vers Plan. La reponse devrait fermer courtement.

## 3. Fluidite humaine

Verdict: yellow.

Le parcours est globalement fluide: Sophia comprend la surcharge, demande une precision utile, formule une version allegee, refuse correctement l'application chat, puis repete et ferme. Le ton est naturel.

Deux defauts visibles restent:

- T4 donne une phrase qui peut etre interpretee comme une modification deja presente dans Plan.
- T5 ferme le flow mais ajoute une invitation Plan contradictoire avec l'abandon.

## 4. Analyse systeme

Verdict: yellow.

Points conformes:

- Premiere activation locale avec `note_information` depuis global vers `adjust_plan_item`.
- Pendant flow actif, `global_dispatcher` est bloque: `active_adjust_plan_item_uses_local_dispatcher`.
- `response_owner=tool_skill` sur les 5 tours.
- `selected_handler=adjust_plan_item` sur le flow.
- `conversation_context` contient `do_not_say` et les donnees filtrees du flow.
- `apply_attempt` ne mute pas: `committed=0`, `executed_tool=false`, `no_chat_mutation=true`, `executed_tools=[]`.
- `repeat_plan_handoff` reste local.
- `cancel_flow` ferme le state local.
- Pas de trace d'executor plan ni de pending confirmation executable.

Points a corriger:

- Visible guard insuffisant sur `repeat_plan_handoff`: le visible agent accepte une phrase qui sous-entend que le contenu est deja dans Plan.
- Visible guard insuffisant sur `cancel_close`: le message de fermeture pousse encore vers Plan apres abandon explicite.
- Contexte DB absent: `plan_snapshot=[]`, donc le flow a fonctionne en handoff generique plutot qu'ancre a une action DB precise. Ce n'est pas bloquant pour la doctrine V1, mais le prochain run devrait semer ou utiliser un plan actif reel.

## 5. Verdict Global

Verdict global: yellow.

Les invariants runtime principaux de la doctrine locale sont respectes en conditions reelles hors sandbox. Le flow est utilisable et no-mutation, mais il reste deux bugs visibles de wording qui peuvent brouiller la promesse produit.

Familles bugs:

- `BF-VISIBLE-01`: wording visible laisse croire a une disponibilite/application Plan.
- `BF-FLOW-STOP-01`: stop local ferme bien le flow mais message visible n'est pas assez net.

Critere de validation green:

- T4 doit repondre sous forme "A mettre dans Plan: ..." ou equivalent, sans "est disponible dans ton Plan".
- T5 doit repondre courtement, sans renvoyer vers Plan apres abandon.
- Relancer avec un vrai plan actif DB pour verifier `plan_snapshot` et cible action.
