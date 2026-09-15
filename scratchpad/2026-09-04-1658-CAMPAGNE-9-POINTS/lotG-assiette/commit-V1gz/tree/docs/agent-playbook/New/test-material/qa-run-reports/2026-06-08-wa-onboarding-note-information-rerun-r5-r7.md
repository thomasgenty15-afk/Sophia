# QA Run Report - WhatsApp Onboarding Note Information Rerun R5-R7

## 1. Contexte Du Test

- Date: 2026-06-08
- Runs:
  - `20260608_wa_onboarding_local_flow_r5_frustration_after_plan_fixed`
  - `20260608_wa_onboarding_local_flow_r6_mixed_progress_fixed`
  - `20260608_wa_onboarding_local_flow_r7_exit_before_plan_fixed`
- Persona: trois users temporaires locaux, un par variante.
- Objectif: verifier la correction annoncee sur l'exit d'onboarding apres plan pret, avec note d'information vers le dispatcher global.
- Trajectoire:
  - R5: plan actif + user interrompt le flow avec frustration.
  - R6: plan actif + phrase composite "plan pret" + progression mentionnee.
  - R7: aucun plan actif + user tente d'interrompre.
- Surfaces visees: `whatsapp-webhook`, `whatsapp_onboarding.local_flow`, note d'information / exit memo, dispatcher global, `user_plan_item_entries`.
- Cadre IA reel: Supabase local, endpoint reel `/functions/v1/whatsapp-webhook`, transport loopback. Pas de renderer ni fallback direct.
- Validite QA: valide.
- Cleanup: les trois users temporaires ont ete supprimes. Verification finale read-only: pour chaque run `profiles=0`, `chat_messages=0`, `user_profile_facts=0`, `user_plan_item_entries=0`, Auth user `404`.
- Tests unitaires: `deno test --no-check supabase/functions/whatsapp-webhook/onboarding/local_flow_test.ts supabase/functions/whatsapp-webhook/wa_text_test.ts supabase/functions/whatsapp-webhook/handlers_onboarding_state_test.ts` -> 11 passed, 0 failed.

## 2. Tours De Conversation

### Variante R5 - Frustration apres plan pret

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-AGENDA-02` - Interruption explicite mal restauree

**User**
> Ca me saoule tes questions la, je sais pas, laisse tomber.

**Sophia**
> Je comprends 😕 Quand ca saoule, je stoppe tout de suite les questions et on fait simple : ce soir, ton seul job c'est de sortir 1 truc concret lie a “lister 5 contacts professionnels”. Tu le fais a la suite, sans reflechir.
>
> Tu preferes : A) 5 contacts en 15 minutes, ou B) 2 contacts maintenant puis le reste plus tard ?

**Trace courte**
- http_status: 200
- local_flow: `reason_code=whatsapp_onboarding_local_exit_to_global_dispatcher`
- visible_task local: `frustration_exit_after_plan_ready`
- selected_handler final: `whatsapp_default_brain_reply`
- response_owner trace: `normal_reply`
- profile_state: `null`
- done: `__whatsapp_onboarding_done.source=deferred_after_plan_ready`
- exit_memo:
  - `reason=frustration`
  - `handoff_hint_for_global_dispatcher=null`
  - `handoff_justification_for_global_dispatcher=null`
- note_information observed: `null`
- global trace:
  - `active_flow_arbitration.reason_code=no_active_flow`
  - `conversation_risk.reason_codes=["explicit_stop_or_abandon","anger_or_profanity"]`
  - `flow_exit_context=null`
- durable_effect: `user_plan_item_entries=[]`, no pending confirmation, no preference write

**Analyse si yellow/red**
- Symptome: le local flow sort bien, mais le global ne recoit toujours pas de contexte exploitable. Il repond par une consigne d'action et une question A/B, alors que le user demande d'arreter les questions.
- Source amont probable: l'exit local n'ecrit pas encore la note d'information attendue dans le contexte lu par le global dispatcher, ou le global ne la consomme pas.
- Owner runtime: `whatsapp_onboarding.local_flow` + handoff global dispatcher.
- Meilleure correction selon les guidelines: produire une note d'information non vide pour `frustration_exit_after_plan_ready`, la transmettre au global dans le contexte reel du tour, et faire en sorte que le global route depuis cette note plutot que depuis le message brut seul.
- Pourquoi ce n'est pas un patch local: les tests unitaires passent, mais le webhook reel montre que la note n'arrive pas dans le global. Le probleme est dans le transport/consommation du contexte inter-dispatcher.

### Variante R6 - Plan pret + progression mentionnee

**Verdict du tour:** green

**User**
> Oui c'est bon, le plan est pret, et j'ai deja liste deux contacts vite fait.

**Sophia**
> Top, ton plan est pret ! Dis-moi, pour nos echanges, tu preferes que je sois plutot douce, directe, ou un mix des deux ?

**Trace courte**
- http_status: 200
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_ready_resume_preferences`
- visible_task: `plan_ready_resume_preferences`
- next_state: `onboarding_pref_tone`
- local_flow: `reason_code=whatsapp_onboarding_plan_ready_resume_preferences`
- durable_effect: `user_plan_item_entries=[]`, `allow_track_progress_plan_item=false`

### Variante R7 - Frustration avant plan pret

**Verdict du tour:** green

**User**
> Franchement je sais pas, ca me saoule, arrete avec ca.

**Sophia**
> Je comprends tout a fait, c'est vrai que ca fait beaucoup d'un coup. On a juste besoin de caler ton plan pour que tu puisses demarrer sur de bonnes bases, c'est vraiment le seul truc indispensable avant la suite. On fait une petite pause ou tu preferes qu'on essaie de simplifier ?

**Trace courte**
- http_status: 200
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_not_ready`
- visible_task: `blocked_exit_before_plan_ready`
- plan_status: `missing`
- next_state: `awaiting_plan_finalization`
- done: false
- durable_effect: `user_plan_item_entries=[]`, `allow_track_progress_plan_item=false`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- R6 reste bon: le flow ne confond pas plan pret et progression d'action.
- R7 reste bon systemiquement: impossible de sortir avant plan pret.

**Problemes**
- R5: le comportement visible est pire que le run precedent. Sophia dit qu'elle stoppe les questions, puis donne une injonction d'action et pose une question A/B. Famille: `BF-AGENDA-02`. Impact: contradiction directe avec l'interruption du user. Severite: red pour la correction visee.

**Fix propose**
- Source amont: handoff inter-dispatcher depuis `whatsapp_onboarding`.
- Correction recommandee:
  - Le local flow doit produire une note d'information observable et non vide pour `frustration_exit_after_plan_ready`.
  - Cette note doit etre disponible dans le contexte du global dispatcher du meme tour, pas seulement documentee ou gardee dans un champ non consomme.
  - Le global doit recevoir une contrainte claire: ne pas poser de nouvelle question quand le user refuse les questions et qu'aucun nouveau sujet clair n'est fourni.
- Tests d'invariant attendus:
  - R5 doit avoir `flow_exit_context` ou equivalent non null dans la trace globale.
  - R5 doit avoir `handoff_justification_for_global_dispatcher` non null.
  - R5 ne doit pas produire de question A/B ou de relance d'action.
  - R6/R7 doivent rester verts.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- R5: le local flow sort correctement vers le global, mais le global trace `active_flow_arbitration=no_active_flow` et `flow_exit_context=null`. Cela indique que la sortie locale ne transporte pas la note attendue jusqu'au dispatcher global.
- R6: onboarding garde la main.
- R7: onboarding garde la main parce que le plan est absent.

**Skills / Operations / Tools**
- Aucun tool engageant appele.
- Aucun pending cree.
- Aucun `track_progress_plan_item`.

**Effets Durables**
- R5: `profiles.whatsapp_state=null`, `__whatsapp_onboarding_done.source=deferred_after_plan_ready`, `user_plan_item_entries=[]`, mais exit memo incomplet.
- R6: `profiles.whatsapp_state=onboarding_pref_tone`, `user_plan_item_entries=[]`.
- R7: `profiles.whatsapp_state=awaiting_plan_finalization`, `user_plan_item_entries=[]`.

**Conclusion Systeme**
- Les invariants de non-mutation sont bons.
- La correction de note d'information n'est pas verifiee en conditions reelles: le global agit comme s'il ne recevait pas le contexte d'interruption de flow.

## Verdict Global

**red** — Les tests unitaires passent et les effets durables restent safe, mais le bug cible n'est pas corrige en run reel: apres frustration avec plan pret, la note/handoff vers le global reste absente ou non consommee, et Sophia repose une question.
