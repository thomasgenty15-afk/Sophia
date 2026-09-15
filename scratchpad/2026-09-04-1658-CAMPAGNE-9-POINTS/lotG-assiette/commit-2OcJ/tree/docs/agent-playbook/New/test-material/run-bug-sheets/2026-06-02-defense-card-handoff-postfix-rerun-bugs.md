# Bug Sheet - Defense Card Handoff Postfix Rerun

## BUG-01

- Bug id: R1B-B01
- Tours: R1B Tour 2
- Famille: BF-EFFECT-04
- Domaine owner: prepare_defense_card
- Source amont: intake/runtime apres `orientation_clarification_resolved_tool_skill`
- Symptome visible: Sophia dit "Je n'arrive pas à préparer cette carte proprement là" apres que l'utilisateur choisit defense et donne le risque.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=prepare_defense_card`, `route_reason=orientation_clarification_resolved_tool_skill`, `tool_execution=failed`, `executed_tools=[]`, `user_defense_cards=0`.
- Correction attendue: transmettre les slots resolus par clarification au runtime defense card et produire un handoff no-mutation quand attachment/risk sont donnés dans le tour de resolution.
- Statut: open
- Fix reference: a definir
- Tests requis: clarification attaque/defense -> defense explicite avec no_create -> `platform_handoff`; anti-regression direct no_create reste vert.

## BUG-02

- Bug id: R3B-B01
- Tours: R3B Tour 3
- Famille: BF-STATE-01
- Domaine owner: active handoff arbitration + prepare_defense_card state
- Source amont: transition `cancel_handoff` / clear active handoff state
- Symptome visible: "Pas de carte finalement" obtient une reponse normale proactive au lieu d'un cancel handoff sobre.
- Preuve systeme: `response_owner=normal_reply`, `route_reason=normal_reply_default`, `tool_execution=none`, `active_tool_skill_intake.status=repeat_handoff` encore present, `user_defense_cards=0`.
- Correction attendue: capturer le cancel explicite dans le handoff actif, router vers `prepare_defense_card`, rendre `status=cancelled`, vider l'etat actif, garder no-mutation.
- Statut: open
- Fix reference: a definir
- Tests requis: active defense handoff + "pas de carte finalement" -> `selected_handler=prepare_defense_card`, `status=cancelled`, active state cleared; explicit reminder doit toujours interrompre le handoff.

## Notes De Run

- Premiere tentative `r1/r2` invalide par `502 upstream`; reprise effectuee avec connexions fraiches `r1b/r2b/r3b`.
- Invariant no-mutation verifie sur tous les tours exploitables: `executed_tools=[]`, `user_defense_cards=0`.

