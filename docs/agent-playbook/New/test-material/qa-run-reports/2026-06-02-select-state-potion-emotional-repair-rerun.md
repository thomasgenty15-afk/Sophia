# QA Run Report - select_state_potion x emotional_repair rerun

## 1. Contexte Du Test

- Date: 2026-06-02
- Runs:
  - `qa-potion-emorepair-rerun-20260602-r1`
  - `qa-potion-emorepair-rerun-20260602-r2`
  - `qa-potion-emorepair-rerun-20260602-r3`
- Persona: users Auth QA temporaires locaux, dedies par run, nettoyes apres verification.
- Objectif: relancer les runs reels apres corrections, sans modifier le code pendant l'execution.
- Trajectoire: ambiguite potion vs phrase douce; no-potion + phrase seule; emotional repair no-question; potion clarte avec handoff; tentative d'activation.
- Surfaces visees: dispatcher, `emotional_repair`, `select_state_potion`, active handoff, no-mutation DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, Auth locale verifiee, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. Les messages ont ete choisis tour par tour apres lecture des reponses et traces courtes.

## 2. Tours De Conversation

### Run 1 - Tour 1

**Verdict du tour:** green

**User**
> Je me sens vraiment nulle et j'ai la boule au ventre. J'ai pense a une potion, mais je ne sais pas si j'ai surtout besoin qu'on me parle doucement. Pas de suivi.

**Sophia**
> Tu veux que je reste sur une phrase douce maintenant, ou que je te recommande une potion a reprendre dans la plateforme ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

### Run 1 - Tour 2

**Verdict du tour:** green

**User**
> Non, pas de potion pour l'instant. Parle-moi doucement, juste une phrase qui m'aide a ne pas me juger, sans protocole.

**Sophia**
> Phrase de reparation : "Ce que je ressens est lourd, mais ce n'est pas un verdict sur moi." 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved`
- safety: `low`
- direct_effects: `[]`
- operation: `blocked`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Verification DB run 1**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`

### Run 2 - Tour 1

**Verdict du tour:** green

**User**
> Je panique un peu et je me sens ridicule. Pas de question s'il te plait, juste une phrase courte pour me poser.

**Sophia**
> Ah merde... respire, tu n'es pas ridicule: ton cerveau panique, c'est tout, et la tout de suite tu peux juste ralentir 1 minute. 😮‍💨

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Verification DB run 2**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`

### Run 3 - Tour 1

**Verdict du tour:** green

**User**
> Je veux peut-etre une potion de reset, mais je ne sais pas si c'est plutot apaisement ou clarte. Je suis un peu en vrac.

**Sophia**
> Tu as plutot besoin de redescendre la pression ou de remettre de l'ordre ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

### Run 3 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - slot fourni mais redemande.

**User**
> Plutot clarte. Donne-moi la recommandation plateforme, courte, et sans suivi.

**Sophia**
> Tu veux finir de preparer ta potion de clarte ou un conseil court tout de suite te suffit ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `same_operation_signal_continues_active_handoff`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: l'utilisateur demande explicitement la recommandation plateforme, mais Sophia redemande si un conseil court suffit.
- Source amont probable: intake handoff readiness / support timing.
- Owner runtime: `select_state_potion` intake.
- Meilleure correction selon les guidelines: reconnaitre "recommandation plateforme" comme handoff readiness clair.
- Pourquoi ce n'est pas un patch local: c'est un slot d'intention deja fourni, pas une phrase a remplacer.

### Run 3 - Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - slot fourni mais redemande.

**User**
> Finir la potion de clarte, mais uniquement en recommandation plateforme. Pas de suivi.

**Sophia**
> Ca marche, on reste sur une recommandation simple. Pour mettre de l'ordre dans ce vrac, tu as surtout besoin de voir clair sur quoi en priorite ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_revise_handoff`
- safety: `none`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le choix potion + mode plateforme + no-followup est donne, mais l'intake demande encore le detail prioritaire.
- Source amont probable: detail subskill trop exigeant avant handoff.
- Owner runtime: `select_state_potion` intake/detail subskill.
- Meilleure correction selon les guidelines: produire un handoff avec missing_decisions minimal ou immediate_step generique quand la demande vise une recommandation courte.
- Pourquoi ce n'est pas un patch local: la regle de readiness doit etre structurelle.

### Run 3 - Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - slot fourni mais redemande.

**User**
> Voir clair sur la prochaine action prioritaire, sans analyse longue.

**Sophia**
> Tu veux recevoir cette recommandation tout de suite ou a un moment precis ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_turn_unclear`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: l'utilisateur donne le detail prioritaire et demande sans analyse longue; Sophia demande encore le timing.
- Source amont probable: slot `support_timing` ne reconnait pas l'implicite "maintenant / recommandation plateforme".
- Owner runtime: `select_state_potion` intake.
- Meilleure correction selon les guidelines: "recommandation plateforme", "tout de suite" et "sans suivi" doivent suffire pour un handoff non-mutant.
- Pourquoi ce n'est pas un patch local: il faut corriger la readiness du flow.

### Run 3 - Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - slot fourni mais redemande.

**User**
> Tout de suite, mais juste la recommandation plateforme, sans rappel ni suivi.

**Sophia**
> Tu voudrais placer ce soutien a quel moment, pour que ca aide vraiment ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_turn_unclear`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le timing "tout de suite" et la contrainte "sans rappel ni suivi" sont fournis, mais Sophia redemande le moment.
- Source amont probable: slot timing non rempli ou ecrase par le detail subskill.
- Owner runtime: `select_state_potion` intake/state.
- Meilleure correction selon les guidelines: respecter `no_followup` et `immediate_support` sans demander de planification.
- Pourquoi ce n'est pas un patch local: la repetition vient du reducer/intake state.

### Run 3 - Tour 6

**Verdict du tour:** green

**User**
> Ok vas-y active-la.

**Sophia**
> Je ne l'active pas depuis le chat.
> Reprends cette recommandation dans la plateforme, dans la section Etat / Potions. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_apply_attempt`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Verification DB run 3**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- R1 valide la clarification phrase douce vs potion et la sortie no-potion.
- R2 respecte le besoin emotionnel immediat sans question.
- R3 T6 traite correctement "active-la" sans claim d'activation.

**Problemes**
- R3 T2-T5: Sophia redemande des slots deja fournis ou implicites. Famille: `BF-INTAKE-01`. Impact: le user doit repeter "recommandation plateforme / tout de suite / sans suivi" sans obtenir le handoff complet.

**Fix propose**
- Source amont: `select_state_potion` intake readiness / detail subskill.
- Correction recommandee: reconnaitre explicitement "recommandation plateforme", "tout de suite", "sans rappel ni suivi" comme suffisants pour produire le handoff no-mutation.
- Tests d'invariant attendus: handoff complet en 2-3 tours apres choix clarté; pas de redemande timing si "tout de suite" ou "sans suivi" est present.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- R1/R2 corrects.
- R3 reste dans `tool_skill/select_state_potion`, donc le mauvais owner observe au run precedent est corrige.
- R3 n'atteint pas `handoff_delivered`; il reste en collecte/clarification.

**Skills / Operations / Tools**
- `executed_tools=[]` sur tous les tours.
- `tool_execution=platform_handoff` ou `blocked`, jamais `success`.
- "Ok vas-y active-la" donne le bon apply_attempt visible.

**Memory / Effets durables**
- `user_potion_sessions=*/0`, `user_recurring_reminders=*/0`, `scheduled_checkins=*/0` pour les trois runs.
- Cleanup cible effectue. `user_memories` retourne 404 dans cet environnement local, comme lors des runs precedents.

**Problemes**
- R3 T2-T5: boucle d'intake / slots non reconnus. Famille: `BF-INTAKE-01`. Impact systeme: state continuable mais handoff non livre.

**Fix propose**
- Source amont: intake/state `select_state_potion`.
- Correction recommandee: readiness gate plus tolerant pour handoff non-mutant; ne pas exiger les slots d'une session executable legacy.
- Tests d'invariant attendus: no_followup respecte; support_timing "now" rempli par "tout de suite"; "recommandation plateforme" declenche handoff.

## Verdict Global

**yellow**

Les corrections critiques precedentes tiennent: pas de claim d'activation, pas d'effet DB, et apply_attempt correct. Le flow reste jaune parce que l'intake potion demande trop de clarifications et ne livre pas le handoff complet dans r3.
