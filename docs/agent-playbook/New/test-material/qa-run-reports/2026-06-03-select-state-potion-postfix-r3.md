# QA Run — select_state_potion postfix r3

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `state_potion_postfix_20260603_r3`
- Persona: `qa-skill`, connexion temporaire `state_potion_postfix_20260603_r3`, user `3e9be660-ab33-4740-bf85-d85d8d3ac5c0`
- Objectif: rerun des cas problématiques R2 après corrections, plus scénario “je veux une potion mais je ne sais pas laquelle”.
- Trajectoire: révision clarté puis apply_attempt; confirmation de champ guérison; destination plateforme apaisement; routing potion inconnue vers sous-skill.
- Surfaces visées: dispatcher `active_handoff_action`, active handoff arbitration, `select_state_potion` handoff runtime, sous-skills potion, renderer no-mutation, DB no-mutation.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, messages choisis tour par tour après lecture réponse/trace, aucun renderer déterministe, aucun fallback direct, aucune modification de code pendant les runs.
- Validité QA: valide. Accès Supabase local exécuté hors sandbox car Docker socket bloqué par le sandbox. Aucun `supabase db reset`, aucun restart Supabase.
- Artefacts bruts:
  - `tests/real-personas/qa-skill/runs/state_potion/2026-06-03-state_potion_postfix_20260603_r3-clarte_revision.summary.json`
  - `tests/real-personas/qa-skill/runs/state_potion/2026-06-03-state_potion_postfix_20260603_r3-guerison_field.summary.json`
  - `tests/real-personas/qa-skill/runs/state_potion/2026-06-03-state_potion_postfix_20260603_r3-apaisement_destination.summary.json`
  - `tests/real-personas/qa-skill/runs/state_potion/2026-06-03-state_potion_postfix_20260603_r3-unknown_routing.summary.json`

## 2. Tours De Conversation

### Flow Clarté — révision puis apply_attempt

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux une potion de clarté. Je continue à faire les actions du plan, mais je ne sens plus bien le lien avec mon pourquoi.

**Sophia**
> Ce que je comprends : Je continue à faire les actions du plan, mais je ne sens plus bien le lien avec mon pourquoi.
>
> Je te conseille de choisir une potion de clarté. Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.
>
> Pourquoi cette potion : Tu continues à faire les actions de ton plan, mais tu ne sens plus bien le lien avec ton pourquoi profond.
> Petit pas immédiat : Je comprends que tu te sentes un peu déconnecté de ton plan. Prends un instant pour respirer. Cette potion est là pour t'aider à retrouver le fil.
>
> À mettre dans la plateforme :
> Potion : Potion de clarte
> - Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ? Je continue à faire les actions du plan, mais je ne sens plus bien le lien avec mon pourquoi.
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: tool_skill_intent_start
- operation: platform_handoff
- tool_skill_status: handoff_delivered
- active_handoff_action: null
- executed_tools: []
- durable_effect: none (`user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`)

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-03 — Draft lifecycle casse

**User**
> Reformule plutôt le champ comme ça : je fais les actions, mais je ne sens plus pourquoi elles comptent pour moi aujourd hui.

**Sophia**
> Ce que je comprends : Je continue à faire les actions du plan, mais je ne sens plus bien le lien avec mon pourquoi.
>
> Je te conseille de choisir une potion de clarté. Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.
>
> Pourquoi cette potion : Tu fais les actions, mais tu ne sens plus pourquoi elles comptent pour toi aujourd'hui.
> Petit pas immédiat : Je suis là pour t'aider à retrouver le fil et le sens de ce qui compte pour toi.
>
> À mettre dans la plateforme :
> Potion : Potion de clarte
> - Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ? Je continue à faire les actions du plan, mais je ne sens plus bien le lien avec mon pourquoi.
>
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_revise_handoff
- active_handoff_action: revise_handoff high
- operation: platform_handoff
- tool_skill_status: handoff_delivered
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptôme: `why_this_potion` intègre la nouvelle formulation, mais `user_state_summary` et surtout `platform_inputs.answers[0].value` restent sur l’ancienne valeur.
- Source amont probable: lifecycle `revise_handoff` dans `select_state_potion`; le générateur voit la révision mais le sous-skill détail ou l’intake state qui alimente les champs plateforme ne remplace pas la valeur verrouillée.
- Owner runtime: `select_state_potion` detail intake / handoff revision.
- Meilleure correction selon les guidelines: faire porter la révision explicitement au champ UI courant via sortie structurée IA ou mécanisme de revision field-aware; ne pas corriger par regex locale sur “reformule”.
- Pourquoi ce n'est pas un patch local: le bug concerne toutes les révisions de valeurs plateforme, pas cette phrase de clarté.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-03 — Draft lifecycle casse

**User**
> Ok alors lance cette potion.

**Sophia**
> Je ne peux pas le créer/lancer depuis le chat.
> Tu peux le faire toi-même dans la plateforme, dans la section État / Potions.
> Choisis : Potion de clarte.
> À renseigner :
> - Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ? Je continue à faire les actions du plan, mais je ne sens plus bien le lien avec mon pourquoi.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_apply_attempt
- active_handoff_action: handoff_apply_attempt high
- operation: platform_handoff
- tool_skill_status: apply_attempt
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptôme: l’apply_attempt est correctement non-mutant, mais il répète la valeur stale issue du tour 2.
- Source amont probable: même bug que T2; apply_attempt réutilise le draft courant.
- Owner runtime: `select_state_potion` handoff state.
- Meilleure correction selon les guidelines: corriger le draft courant à la révision; l’apply_attempt doit rester un renderer court qui ne répare pas lui-même les champs.

### Flow Guérison — confirmation de champ

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 — Contrainte explicite perdue

**User**
> Je veux vraiment préparer une potion de guérison, pas juste être rassuré. Hier j ai abandonné un engagement que je voulais tenir, et depuis ça me laisse surtout de la honte.

**Sophia**
> Tu veux que je t’aide surtout à préparer la potion de guérison, ou plutôt à traverser la honte et la culpabilité ?

**Trace courte**
- http_status: 200
- response_owner: orientation_clarification
- selected_handler: orientation_clarification
- route_reason: clarification_required
- active_handoff_action: null
- operation: none
- durable_effect: none

**Analyse si yellow/red**
- Symptôme: Sophia clarifie potion vs soutien émotionnel alors que le user dit explicitement “préparer une potion” et “pas juste être rassuré”.
- Source amont probable: dispatcher / clarification orientation ne tient pas assez compte de la contrainte explicite `not immediate support`.
- Owner runtime: dispatcher clarification / select_state_potion entry arbitration.
- Meilleure correction selon les guidelines: faire respecter la contrainte structurée explicite dans le contrat de clarification; pas de regex sur cette phrase.

#### Tour 2

**Verdict du tour:** green

**User**
> Préparer la potion, oui. L épisode à mettre c est : j ai abandonné mon engagement hier.

**Sophia**
> Tu ressens surtout de la honte ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: orientation_clarification_resolved_tool_skill
- active_handoff_action: field_confirmation high
- operation: platform_handoff
- tool_skill_status: clarifying
- durable_effect: none

#### Tour 3

**Verdict du tour:** green

**User**
> Oui, c est surtout de la honte.

**Sophia**
> Ce que je comprends : avoir abandonné un engagement hier ; honte
>
> Je te conseille de choisir une potion de réparation. Le shift recommandé est de réparer la trace émotionnelle sans rouvrir toute l'analyse.
>
> Pourquoi cette potion : Tu as mentionné avoir abandonné un engagement hier et ressentir de la honte. Cette potion est là pour t'aider à te relever de cet épisode sans t'enfoncer davantage.
>
> À mettre dans la plateforme :
> Potion : Potion de guerison
> - Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ? avoir abandonné un engagement hier
> - Tu ressens surtout quoi ? De la honte
>
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_field_confirmation
- active_handoff_action: field_confirmation high
- active_flow_arbitration.continuation_intent: field_confirmation
- operation: platform_handoff
- tool_skill_status: handoff_delivered
- executed_tools: []
- durable_effect: none

### Flow Apaisement — destination plateforme

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux préparer une potion d apaisement. Ce qui me met sous pression là, c est une discussion qui tourne en boucle, et je me sens à cran.

**Sophia**
> Ok, ce qui te met sous pression, c'est une discussion qui tourne en boucle. Et tu te sens à cran, c'est bien ça ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: tool_skill_intent_start
- tool_skill_status: clarifying
- durable_effect: none

#### Tour 2

**Verdict du tour:** green

**User**
> Oui, c est bien ça : discussion qui tourne en boucle, et je suis à cran.

**Sophia**
> Ce que je comprends : une discussion qui tourne en boucle ; a_cran
>
> Je te conseille de choisir une potion d'apaisement court.
>
> À mettre dans la plateforme :
> Potion : Potion d'apaisement
> - Qu'est-ce qui te met le plus sous pression la ? une discussion qui tourne en boucle
> - Tu te sens plutot comment ? A cran
>
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_field_confirmation
- active_handoff_action: field_confirmation high
- tool_skill_status: handoff_delivered
- durable_effect: none

#### Tour 3

**Verdict du tour:** green

**User**
> Et concrètement je vais où dans la plateforme pour la lancer ?

**Sophia**
> Tu peux la reprendre dans la plateforme, dans la section État / Potions.
> Choisis : Potion d'apaisement.
> À renseigner :
> - Qu'est-ce qui te met le plus sous pression la ? une discussion qui tourne en boucle
> - Tu te sens plutot comment ? A cran
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_platform_destination_followup
- active_handoff_action: platform_destination_followup high
- active_flow_arbitration.continuation_intent: platform_destination_followup
- tool_skill_status: repeat_handoff
- executed_tools: []
- durable_effect: none

### Flow Potion inconnue — routing naturel

#### Tour 1

**Verdict du tour:** green

**User**
> Je crois que j ai besoin d une potion, mais je ne sais pas laquelle. Là je suis mélangé : un peu tendu, un peu découragé, et je n arrive pas à savoir si je dois me calmer ou retrouver de l élan.

**Sophia**
> Entre apaisement et rappel, laquelle te parle le plus en ce moment ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: normal_reply_default
- tool_skill_status: collecting
- durable_effect: none

#### Tour 2

**Verdict du tour:** green

**User**
> Plutôt apaisement je pense. Ce que je veux d abord, c est redescendre la pression avant de repartir.

**Sophia**
> Qu'est-ce qui te met le plus sous pression là ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_field_confirmation
- active_handoff_action: field_confirmation high
- tool_skill_status: clarifying
- durable_effect: none

#### Tour 3

**Verdict du tour:** green

**User**
> C est surtout l accumulation de messages et de décisions à prendre aujourd hui.

**Sophia**
> Et du coup, tu te sens plutôt comment avec tout ça ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_turn_unclear
- active_flow_arbitration.continuation_intent: unclear
- tool_skill_status: clarifying
- durable_effect: none

#### Tour 4

**Verdict du tour:** green

**User**
> Je suis à cran, pas complètement submergé, mais clairement à cran.

**Sophia**
> Ce que je comprends : l'accumulation de messages et de décisions à prendre aujourd'hui ; a_cran
>
> Je te conseille de choisir une potion d'apaisement court.
>
> À mettre dans la plateforme :
> Potion : Potion d'apaisement
> - Qu'est-ce qui te met le plus sous pression la ? l'accumulation de messages et de décisions à prendre aujourd'hui
> - Tu te sens plutot comment ? A cran
>
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_field_confirmation
- active_handoff_action: field_confirmation high
- tool_skill_status: handoff_delivered
- durable_effect: none

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- Le cas “où je la lance ?” est maintenant très clair: chemin court, choix, champs à renseigner, no-mutation.
- Le flow potion inconnue est naturel: Sophia ne remplit pas en one-shot; elle fait d’abord le routing potion, puis avance champ par champ dans le sous-skill apaisement.
- Les confirmations de champ guérison/apaisement sont fluides et ne déclenchent pas de message d’activation.

**Problèmes**
- Clarté T2-T3: la révision demandée par le user n’est pas répercutée dans la valeur plateforme. Famille: BF-STATE-03. Impact: le user reçoit une consigne concrète à saisir qui ne correspond pas à sa correction. Sévérité: red.
- Guérison T1: clarification émotion vs potion malgré “préparer une potion” et “pas juste être rassuré”. Famille: BF-INTAKE-03. Impact: petite friction conversationnelle; le user doit répéter son choix. Sévérité: yellow.

**Fix proposé**
- Source amont clarté: `select_state_potion` detail intake / handoff revision.
- Correction recommandée clarté: en `revise_handoff`, déclencher une révision field-aware du champ plateforme déjà verrouillé, ou fournir au sous-skill détail une tâche explicite `revise_current_platform_field` avec le draft et l’intake state; le générateur ne doit pas être la seule couche à recevoir la révision.
- Tests d’invariant attendus clarté: run IA réel “reformule le champ comme ça” puis apply_attempt; assertion sur `platform_inputs.answers[0].value` et contenu visible.

## 4. Analyse Système

**Verdict: yellow**

**Routage**
- `field_confirmation` est bien produit et arbitré pour guérison/apaisement. Le bug R2-B02 est vérifié corrigé.
- `platform_destination_followup` est bien produit pour la demande de chemin plateforme. Le bug R2-B03 est vérifié corrigé.
- Le flow potion inconnue reste chez `select_state_potion`; pas de capture par `product_help`, `status_recap` ou `normal_reply`.
- Warning faible: dans le flow potion inconnue, T1 a `route_reason=normal_reply_default` malgré `response_owner=tool_skill` et `selected_handler=select_state_potion`; T2 classe le choix de potion comme `field_confirmation`. Pas d’impact visible, mais la trace reste un peu imprécise.

**Skills / Operations / Tools**
- `select_state_potion` reste en `platform_handoff`.
- Aucun executor potion n’est appelé.
- `apply_attempt` ne crée rien et rend bien un refus doux + chemin plateforme.

**Memory / Effets durables**
- Tous les tours observés gardent:
  - `user_potion_sessions=0`
  - `user_recurring_reminders=0`
  - `scheduled_checkins=0`
- `executed_tools=[]` sur les tours potion/handoff.

**Problèmes**
- Clarté T2-T3: BF-STATE-03. Impact système: le draft handoff courant contient une divergence entre `why_this_potion` révisé et `platform_inputs` stale.
- Guérison T1: BF-INTAKE-03. Impact système: clarification d’orientation trop sensible malgré contrainte utilisateur explicite.

**Fix proposé**
- Source amont clarté: lifecycle `revise_handoff` + detail slot filling.
- Correction recommandée: le handoff doit faire modifier la source structurée des champs, pas seulement la génération textuelle du draft.
- Tests d’invariant attendus: unitaires avec vrai slot filler contractuel mocké + run IA réel `force_full_ai=true`; anti-régression apply_attempt reprenant le champ révisé; anti-faux-positif révision de ton sans changement de champ.

## Verdict Global

**yellow/red ciblé.** Deux corrections R2 sont validées en réel (`field_confirmation`, `platform_destination_followup`) et le routing “potion inconnue” est humainement bon. Le bug critique restant est la révision clarté: la valeur plateforme ne suit toujours pas la correction utilisateur.
