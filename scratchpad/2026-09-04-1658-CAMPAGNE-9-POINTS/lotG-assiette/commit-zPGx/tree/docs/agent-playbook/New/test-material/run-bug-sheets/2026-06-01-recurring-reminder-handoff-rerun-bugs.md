# 2026-06-01 recurring-reminder-handoff-rerun bugs

Run source: `qa-recurring-report-r3-20260601`

## R3-B01

- Bug id: `R3-B01`
- Tours: `Run 3 / Tour 1`
- Famille: `BF-ROUTE-01`
- Domaine owner: `router / central arbitrator / create_recurring_reminder admission`
- Source amont: `central_arbitrator_one_shot_reminder_priority`
- Symptome visible: demande explicitement recurrente repondue par `normal_reply`, avec destination erronee `Rendez-vous` au lieu de `Rappels`.
- Preuve systeme: `tool_skill_intents[0].operation_type=create_recurring_reminder`, mais `response_owner=normal_reply`, `route_reason=central_arbitrator_one_shot_reminder_priority`, `executed_tools=[]`.
- Correction attendue: quand un intent structure `create_recurring_reminder` est high confidence et sans ambiguite, l'arbitrage central ne doit pas forcer `normal_reply` via une priorite one-shot.
- Statut: `open`
- Fix reference: none
- Tests requis: positif demande hebdomadaire high confidence; paraphrase avec `Mets un rappel recurrent`; anti-faux-positif demande one-shot; integration route -> handoff plateforme.

## R3-B02

- Bug id: `R3-B02`
- Tours: `Run 3 / Tour 2`
- Famille: `BF-INTAKE-01`
- Domaine owner: `create_recurring_reminder intake`
- Source amont: mapping/canonicalisation des slots de recurrence fournis par le dispatcher.
- Symptome visible: Sophia redemande la cadence alors que le user et la trace contiennent deja `tous les vendredis`.
- Preuve systeme: `operation_input.recurrence=tous les vendredis`, `time=17h`, `message=envoyer mon bilan rapide`, mais `operation.status=collecting` et reponse `j'ai juste besoin de savoir a quelle frequence`.
- Correction attendue: accepter ou normaliser `tous les vendredis` en recurrence hebdomadaire vendredi avant de declarer le slot cadence manquant.
- Statut: `open`
- Fix reference: none
- Tests requis: intake recurrent avec recurrence string en francais; continuation active handoff; anti-regression cadence deja donnee non redemandee.

## R3-B03

- Bug id: `R3-B03`
- Tours: `Run 3 / Tour 4`
- Famille: `BF-STATE-01`
- Domaine owner: `create_recurring_reminder handoff reducer`
- Source amont: transition active handoff `apply_attempt`.
- Symptome visible: `Ok programme-le` ne cree rien, mais passe en clarification et ne repete pas le draft complet comme attendu.
- Preuve systeme: `route_reason=active_handoff_apply_attempt`, `executed_tools=[]`, `committed_effects=[]`, mais `operation.status=clarifying` et `reason_code=handoff_clarification_needed`.
- Correction attendue: un apply attempt sur handoff actif doit rester non-mutant et rendre le draft/destination avec status `apply_attempt`.
- Statut: `open`
- Fix reference: none
- Tests requis: active handoff + `ok programme-le` -> `status=apply_attempt`; no executed tools; no committed effects; renderer contient destination et no-mutation.

## R3-B04

- Bug id: `R3-B04`
- Tours: `Run 3 / Tour 5`
- Famille: `BF-ROUTE-03`
- Domaine owner: `active handoff arbitration / status recap priority / one-shot reminder routing`
- Source amont: priorisation status/tool pendant sortie one-shot d'un handoff recurrent.
- Symptome visible: demande de rappel unique suffisante repondue par `Je ne l'ai pas enregistre`, sans creation one-shot ni clarification utile.
- Preuve systeme: `direct_effects[0].effect_type=create_one_shot_reminder`, mais `selected_handler=status_recap`, `route_reason=recap_only_request_supersedes_tool_flow`, `executed_tools=[]`, `committed_effects=[]`.
- Correction attendue: une intention one-shot explicite et complete doit sortir du handoff recurrent vers `create_one_shot_reminder`; status recap ne doit pas superseder cette intention.
- Statut: `open`
- Fix reference: none
- Tests requis: handoff recurrent actif + `un rappel unique demain a 17h pour X` -> one-shot direct effect; anti-regression vraie question status DB reste status.
