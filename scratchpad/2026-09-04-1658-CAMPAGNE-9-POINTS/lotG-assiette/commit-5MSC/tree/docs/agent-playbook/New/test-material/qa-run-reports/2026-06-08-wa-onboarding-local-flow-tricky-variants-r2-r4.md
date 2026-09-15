# QA Run Report - WhatsApp Onboarding Local Flow Tricky Variants R2-R4

## 1. Contexte Du Test

- Date: 2026-06-08
- Runs:
  - `20260608_wa_onboarding_local_flow_r2_mixed_progress`
  - `20260608_wa_onboarding_local_flow_r3_frustration_after_plan`
  - `20260608_wa_onboarding_local_flow_r4_exit_before_plan`
- Personas: trois connexions temporaires locales, une par variante.
- Objectif: stresser le flow WhatsApp onboarding avec des messages ambigus ou irrites pour verifier la prevention `track_progress_plan_item`, le signal d'exit apres plan pret, et le blocage d'exit avant plan pret.
- Trajectoires:
  - R2: plan actif + user dit que le plan est pret + mentionne une progression d'action.
  - R3: plan actif + user refuse les questions / veut laisser tomber.
  - R4: aucun plan actif + user refuse les questions / veut arreter.
- Surfaces visees: `whatsapp-webhook`, local flow onboarding, global handoff apres exit, state WhatsApp, `user_plan_item_entries`, temp memory d'exit.
- Cadre IA reel: Supabase local, entree reelle `/functions/v1/whatsapp-webhook`, transport loopback. Pas de renderer ou fallback direct appele par le runner.
- Validite QA: valide. Les messages ont ete choisis variante par variante apres lecture du run precedent.
- Cleanup: les trois users temporaires ont ete supprimes. Verification finale read-only: pour chaque run `profiles=0`, `chat_messages=0`, `user_profile_facts=0`, `user_plan_item_entries=0`, Auth user `404`.

## 2. Tours De Conversation

### Variante R2 - Plan pret + progression mentionnee

**Verdict du tour:** green

**User**
> Oui c'est bon, le plan est pret, et j'ai deja liste deux contacts vite fait.

**Sophia**
> C'est note ! Ton plan est pret, on va pouvoir structurer tes premiers contacts.
>
> Avant de se lancer, dis-moi : tu preferes que je sois plutot douce, directe, ou un melange des deux avec toi ?

**Trace courte**
- http_status: 200
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_ready_resume_preferences`
- visible_task: `plan_ready_resume_preferences`
- next_state: `onboarding_pref_tone`
- local_flow: `reason_code=whatsapp_onboarding_plan_ready_resume_preferences`
- safety: none observed
- direct_effects: `profiles.whatsapp_state=onboarding_pref_tone`
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: `user_plan_item_entries=0`, `allow_track_progress_plan_item=false`

**Analyse**
- Le piege principal est evite: la mention "j'ai deja liste deux contacts" ne declenche pas `track_progress_plan_item` pendant l'onboarding.

### Variante R3 - Frustration apres plan pret

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-AGENDA-02` - Interruption explicite mal restauree

**User**
> Ca me saoule tes questions la, je sais pas, laisse tomber.

**Sophia**
> Je comprends : ca saoule quand ca fait “interrogatoire” 😕. Je coupe les questions pour ce tour.
>
> Dis-moi juste une chose : tu veux qu'on fasse quoi maintenant, concretement—avancer sur tes contacts pro, ou faire une pause et juste respirer 2 minutes ?

**Trace courte**
- http_status: 200
- selected_handler final visible: `whatsapp_default_brain_reply`
- local_flow: `reason_code=whatsapp_onboarding_local_exit_to_global_dispatcher`
- visible_task local: `frustration_exit_after_plan_ready`
- profile_state: `null`
- done: `__whatsapp_onboarding_done.source=deferred_after_plan_ready`
- exit_memo: `reason=frustration`, mais `handoff_hint_for_global_dispatcher=null` et `handoff_justification_for_global_dispatcher=null`
- conversation_turn_traces: 1
- durable_effect: `user_plan_item_entries=0`, no preference fact write, no pending confirmation

**Analyse si yellow/red**
- Symptome: le local flow sort bien apres plan pret, mais le global visible re-pose une question juste apres avoir dit "je coupe les questions". Le memo d'exit transmis au global ne contient pas de justification/hint exploitable.
- Source amont probable: contrat d'exit du local dispatcher/reducer onboarding et handoff vers global dispatcher.
- Owner runtime: `whatsapp_onboarding.local_flow` + global dispatcher handoff context.
- Meilleure correction selon les guidelines: rendre `handoff_justification_for_global_dispatcher` obligatoire quand `flow_action=frustration_exit_after_plan_ready` ou `exit_to_global_dispatcher`, avec retry/validation JSON ou synthese contractuelle depuis l'evidence structuree; puis le global doit recevoir un signal explicite "ne pas enchainer par une question de preference, repondre court et proposer une seule option non intrusive".
- Pourquoi ce n'est pas un patch local: le bug n'est pas une phrase exacte; c'est la perte du signal d'interruption entre local flow et global owner.

### Variante R4 - Frustration avant plan pret

**Verdict du tour:** green

**User**
> Franchement je sais pas, ca me saoule, arrete avec ca.

**Sophia**
> Je comprends tout a fait, c'est pas forcement le moment le plus fun. On y est presque, mais j'ai vraiment besoin de caler ton plan pour qu'on puisse demarrer concretement. On essaie juste de finir ce point ensemble pour que tu sois tranquille ?

**Trace courte**
- http_status: 200
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_not_ready`
- visible_task: `blocked_exit_before_plan_ready`
- plan_status: `missing`
- next_state: `awaiting_plan_finalization`
- done: false
- local_flow: `reason_code=whatsapp_onboarding_plan_not_ready`
- durable_effect: `user_plan_item_entries=0`, `allow_track_progress_plan_item=false`

**Analyse**
- La contrainte "pas d'exit tant que le plan n'est pas fait" est respectee.
- Le message est un peu insistant, mais il explique pourquoi le flow reste bloque sans muter de donnees.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- R2 gere bien une phrase composite et evite de traiter la progression comme un effet durable.
- R4 respecte la contrainte produit sans comportement systeme dangereux.
- Les trois variantes gardent `user_plan_item_entries=0`.

**Problemes**
- R3: Sophia dit qu'elle coupe les questions puis pose immediatement une nouvelle question a double option. Famille: `BF-AGENDA-02`. Impact: le user qui vient de dire "tes questions me saoulent" peut percevoir une contradiction. Severite: yellow.
- R3: le handoff memo vers global est incomplet (`hint=null`, `justification=null`), donc le global n'a pas assez de contexte pour respecter l'interruption.

**Fix propose**
- Source amont: local dispatcher/reducer onboarding, puis handoff global.
- Correction recommandee: sur `frustration_exit_after_plan_ready`, exiger un `handoff_hint_for_global_dispatcher` et une `handoff_justification_for_global_dispatcher` non vides; si le dispatcher local ne les fournit pas, retry contractuel ou fallback structurel non visible depuis `exit_reason/evidence`, sans regex metier. Le global doit recevoir l'instruction de ne pas enchainer par une nouvelle question preference/onboarding.
- Tests d'invariant attendus:
  - plan actif + "tes questions me saoulent" -> exit local, memo justification non vide, no progress entry.
  - la reponse globale ne contient pas de question multiple juste apres le signal de refus de questions.
  - plan missing + meme frustration -> no exit, state reste `awaiting_plan_finalization`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- R2: `selected_handler=whatsapp_onboarding`, pas de dispatcher global.
- R3: le local flow sort explicitement vers global apres plan pret. C'est autorise, mais le contexte transmis est incomplet.
- R4: le local flow garde la main et bloque l'exit avant plan pret.

**Skills / Operations / Tools**
- Aucun tool engageant appele.
- Aucun pending confirmation cree.
- Aucun `track_progress_plan_item` appele ou commite.

**Effets Durables**
- R2: `profiles.whatsapp_state=onboarding_pref_tone`, `user_plan_item_entries=[]`.
- R3: `profiles.whatsapp_state=null`, `__whatsapp_onboarding_done.source=deferred_after_plan_ready`, `__last_whatsapp_onboarding_exit_memo.reason=frustration`, mais hint/justification null.
- R4: `profiles.whatsapp_state=awaiting_plan_finalization`, `done=false`, `user_plan_item_entries=[]`.

**Memory / Trace**
- R3 a 1 trace globale apres exit.
- R2/R4 restent sur metadata assistant + temp memory; pas de ligne `conversation_turn_traces`, comme observe dans le run principal.

**Correction Systeme**
- Le fix doit etre dans le contrat local d'exit et le handoff global, pas dans le texte visible uniquement.

## Verdict Global

**yellow** — Les invariants critiques sont bons: pas de progression parasite, exit bloque avant plan pret, exit autorise apres plan pret. Le warning important est l'exit apres frustration: le handoff memo manque de justification et le global re-pose une question alors que le user vient de refuser les questions.
