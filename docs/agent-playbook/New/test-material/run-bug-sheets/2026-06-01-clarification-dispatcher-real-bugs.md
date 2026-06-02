# 2026-06-01 clarification-dispatcher-real Bugs

## Run

- Run ids:
  - `clarification-dispatcher-real-20260601-r1`
  - `clarification-dispatcher-real-20260601-r2`
  - Fix verification:
    - `clarification-dispatcher-real-20260601-fix-r1c`
    - `clarification-dispatcher-real-20260601-fix-r2b`
    - Rerun:
      - `clarification-dispatcher-real-20260601-rerun-r1b`
      - `clarification-dispatcher-real-20260601-rerun-r1-control`
      - `clarification-dispatcher-real-20260601-rerun-r2`
      - `clarification-dispatcher-real-20260601-fix-chaque-matin-r1`
- Cadre: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, connexions temporaires QA, cleanup cible effectue.
- Objectif: verifier en conditions reelles si les ambiguities hors flow sont
  clarifiees au niveau dispatcher avec les primitives `clarification_tool`.
- Verdict initial: red.
- Verdict apres fix: green.
- Verdict rerun 2026-06-01: yellow/red mix. Les deux scénarios
  d'acceptation restent verts, mais une variante rappel avec "chaque matin"
  reste rouge.
- Verdict apres fix B03: green sur la variante "chaque matin".

## Bugs

### CDR-20260601-B01

- Tours: r1 tour 1.
- Famille: `BF-INTAKE-04` — Ambiguite non reconnue.
- Domaine owner: dispatcher / clarification integration.
- Source amont: routing dispatcher hors flow avant selection d'un tool skill.
- Symptome visible: Sophia ne pose pas de question entre rappel ponctuel et
  rappel recurrent. Elle route vers `create_recurring_reminder`, puis la reponse
  visible devient "Je ne confirme aucun changement durable sans effet confirme."
- Preuve systeme:
  - `response_owner=tool_skill`
  - `selected_handler=create_recurring_reminder`
  - `route_reason=tool_skill_intent_start`
  - `tool_skill_intents=["create_recurring_reminder"]`
  - `temp_memory.__active_tool_skill_intake.operation_type=create_recurring_reminder`
  - aucun `__clarification_state_v1`, aucun `orientation_clarification`
  - aucun `scheduled_checkins`
- Correction attendue: quand le dispatcher recoit des candidats concurrents
  prepared hors flow et que l'ambiguite est reelle, construire une
  `ClarificationRequest` et passer par `runClarificationTool` au lieu de
  selectionner directement un tool skill.
- Statut: fixed + verified local.
- Fix reference:
  - `router/clarification_candidate_builder.ts`
  - `router/clarification_arbitrator.ts`
  - `router/final_response_pipeline.ts`
  - `dispatcher/dispatcher.prompts.ts`
- Tests requis:
  - positif: ponctuel vs recurrent ambigu demande une seule question.
  - paraphrase: meme ambiguite sans mots exacts "demain/tous les matins".
  - anti-faux-positif: demande recurrente claire continue vers
    `create_recurring_reminder`.
  - integration: run local `test-send-message` avec `force_full_ai=true`.
- Verification:
  - run `clarification-dispatcher-real-20260601-fix-r1c`;
  - `response_owner=orientation_clarification`;
  - `selected_handler=orientation_clarification`;
  - `executed_tools=[]`, `tool_execution=none`, `scheduled_checkins_count=0`;
  - `__clarification_state_v1.owner=dispatcher`;
  - candidats: `create_one_shot_reminder`, `create_recurring_reminder`.

### CDR-20260601-B02

- Tours: r2 tour 1.
- Famille: `BF-ROUTE-01` — Mauvais owner selectionne.
- Domaine owner: dispatcher / product_help intake / clarification integration.
- Source amont: arbitration product_help vs tool-skill opportunity.
- Symptome visible: l'utilisateur dit hesiter entre comprendre les cartes
  d'attaque et en preparer une. Sophia repond comme si la cible etait
  `plan.clarifications`, sans demander de choisir entre aide produit et action.
- Preuve systeme:
  - `response_owner=product_help`
  - `selected_handler=product_help`
  - `route_reason=skill_entry_signal`
  - `skill_entry_ids=["product_help"]`
  - `tool_skill_opportunity.operation_type=prepare_attack_card`
  - aucun `__clarification_state_v1`, aucun `orientation_clarification`
- Correction attendue: quand product_help et une operation candidate coexistent
  avec doute explicite utilisateur, le dispatcher doit utiliser une clarification
  transversale plutot que laisser product_help repondre sur une feature voisine.
- Statut: fixed + verified local.
- Fix reference:
  - `router/clarification_candidate_builder.ts`
  - `router/clarification_arbitrator.ts`
  - `router/final_response_pipeline.ts`
  - `dispatcher/dispatcher.prompts.ts`
- Tests requis:
  - positif: product help vs preparation carte attaque ambigu demande une seule
    question.
  - paraphrase: "je veux comprendre ou la creer" sur carte defense.
  - anti-faux-positif: question purement produit reste `product_help`.
  - integration: run local `test-send-message` avec `force_full_ai=true`.
- Verification:
  - run `clarification-dispatcher-real-20260601-fix-r2b`;
  - `response_owner=orientation_clarification`;
  - `selected_handler=orientation_clarification`;
  - `executed_tools=[]`, `tool_execution=none`, `scheduled_checkins_count=0`;
  - `__clarification_state_v1.owner=dispatcher`;
  - candidats: `product_help`, `prepare_attack_card`.

### CDR-20260601-B03

- Tours: `clarification-dispatcher-real-20260601-rerun-r1b` tour 1.
- Famille: `BF-INTAKE-04` — Ambiguite non reconnue.
- Domaine owner: dispatcher / production de signaux concurrents TurnFrame.
- Source amont: dispatcher L1 expose deux `direct_effects`
  `create_one_shot_reminder` au lieu d'exposer aussi le candidat
  `create_recurring_reminder` quand l'utilisateur dit "chaque matin".
- Symptome visible: Sophia ne pose pas la question ponctuel vs récurrent et
  répond "Je n'ai pas réussi à le faire." après blocage des effets non
  exécutés.
- Preuve systeme:
  - `response_owner=normal_reply`
  - `selected_handler=null`
  - `route_reason=normal_reply_default`
  - `direct_effects=["create_one_shot_reminder","create_one_shot_reminder"]`
  - `direct_effects_to_run=["create_one_shot_reminder","create_one_shot_reminder"]`
  - `executed_tools=[]`
  - aucun `__clarification_state_v1`
  - `scheduled_checkins_count=0`
- Correction attendue: le dispatcher doit exposer un signal structuré
  `create_recurring_reminder` pour les formulations récurrentes équivalentes à
  "tous les matins", y compris "chaque matin", afin que l'arbitrator puisse
  construire les deux candidats sans lire le message brut.
- Statut: fixed + verified local.
- Fix reference:
  - `dispatcher/dispatcher.v2.ts`
  - `dispatcher/dispatcher.v2.test.ts`
- Tests requis:
  - positif: "demain matin... ou chaque matin" demande une clarification
    ponctuel vs récurrent;
  - anti-faux-positif: "demain matin" seul reste rappel ponctuel clair;
  - anti-faux-positif: "chaque matin" seul reste recurring clair;
  - intégration: run local `test-send-message` avec `force_full_ai=true`.
- Verification:
  - run `clarification-dispatcher-real-20260601-fix-chaque-matin-r1`;
  - `response_owner=orientation_clarification`;
  - `selected_handler=orientation_clarification`;
  - `executed_tools=[]`, `tool_execution=none`, `scheduled_checkins_count=0`;
  - `__clarification_state_v1.owner=dispatcher`;
  - candidats: `create_one_shot_reminder`, `create_recurring_reminder`.
