# Bug Sheet — demotivation_repair local doctrine R3

## R3-B01

- Bug id: R3-B01
- Tours: Tour 4
- Famille: BF-ROUTE-03 — Product/status/tool mal priorises
- Domaine owner: `demotivation_repair`
- Source amont: dispatcher/reducer local, decision `action_card_candidate`
- Symptome visible: Sophia propose une carte de soutien alors que le user vient seulement de stabiliser le sens de l'action et n'a pas demande de support produit.
- Preuve systeme: Tour 4 produit `flow_action=action_card_candidate`, `visible_task=action_card_candidate`, `response_intent=action_card_ready`, `selected_potion=null`, `operation_suggestions=[]`, sans effet durable ni demande user explicite de carte.
- Correction attendue: `action_card_candidate` doit etre reserve aux demandes explicites de carte/support/action, a une acceptation user, ou a une opportunite produit qualifiee qui ne remplace pas la reparation conversationnelle. Sinon le flow doit rester sur un stage conversationnel ou terminer localement.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts` rend `action_card_candidate` strict dans le prompt dispatcher et ajoute un garde reducer structurel: sans `phase=action_card_ready`, `action_readiness=ready/already_chosen`, `intent=concrete_action_emerged/asks_smaller_step`, `allow_tool_suggestion=true`, `allow_attack_card_suggestion=true` et absence de `no_tool`, le stage est degrade vers un stage conversationnel avec `blocked_effects.action_card/stage_not_mature`.
- Verification reference: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-10-demotivation-repair-local-doctrine-r5.md` confirme en run IA reel qu'apres reconnexion au sens Sophia ne propose ni carte ni support produit sans demande explicite.
- Tests requis:
  - unit/contract: apres `restore_meaning` avec sens clarifie mais sans demande produit, le reducer ne produit pas `action_card_candidate`;
  - unit/contract: `action_card_candidate` exige un signal user explicite ou une opportunite qualifiee documentee dans `conversation_context`;
  - real QA: demotivation repair peut conclure apres reconnexion au sens sans proposer automatiquement une carte.
