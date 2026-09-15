# Bug Sheet — Demotivation Repair Local Doctrine R8

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-11-demotivation-repair-local-doctrine-r8.md`

## R8-B01 — Micro-geste demotivation transforme en ajustement de plan

- Bug id: `R8-B01`
- Tours: 3
- Famille: `BF-ROUTE-01` — mauvais owner selectionne
- Domaine owner: dispatcher global / active flow arbitration / orientation clarification
- Source amont: frontiere entre continuation locale `demotivation_repair` et interruption tool skill `adjust_plan_item`.
- Symptome visible: le user stabilise un micro-geste informel ("enlever deux objets de la table, pas ranger la pièce") dans un flow de demotivation actif; Sophia bascule vers `adjust_plan_item` et envoie vers la plateforme Plan.
- Preuve systeme:
  - `response_owner=tool_skill`
  - `selected_handler=adjust_plan_item`
  - `route_reason=orientation_clarification_resolved_tool_skill`
  - `active_flow_arbitration.decision=supersede_active`
  - `active_flow_arbitration.reason_code=explicit_tool_intent_supersedes_active_conversation_skill`
  - `local_flow_action=prepare_plan_handoff`
  - `local_visible_task_kind=plan_handoff_ready`
  - `tool_execution=platform_handoff`
  - no DB mutation committed
- Correction attendue:
  - Pendant `demotivation_repair` actif, un micro-geste ponctuel de regulation doit rester en continuation locale sauf demande explicite de modifier le plan, l'action, le niveau, la plateforme ou un objet produit.
  - Les expressions "je peux garder juste ça", "pas ranger toute la pièce", "je vais faire seulement X ce soir" ne suffisent pas a elles seules a supersede vers `adjust_plan_item`.
  - Conserver un anti-faux-positif: "modifie mon plan / ajuste cette action / change mon rituel dans le plan" doit toujours router vers `adjust_plan_item`.
- Statut: `open`
- Fix reference: none yet
- Tests requis:
  - Positif: active `demotivation_repair` + micro-geste informel -> `conversation_handler/demotivation_repair`.
  - Paraphrase: "je garde juste deux assiettes a enlever ce soir" -> pas de tool skill.
  - Anti-faux-positif: "change mon plan pour que ce soit deux objets" -> `adjust_plan_item`.
  - Integration: run IA reel ou test router avec active flow state.

## R8-B02 — Contrainte "sans suite" perdue apres sortie du tool flow

- Bug id: `R8-B02`
- Tours: 4
- Famille: `BF-INTAKE-03` — contrainte explicite perdue
- Domaine owner: normal reply post-handoff / handoff context filtering
- Source amont: preservation des contraintes utilisateur pendant `local_flow_exit_handoff` et generation visible `normal_reply`.
- Symptome visible: le user refuse la plateforme et dit "sans outil ni suite"; Sophia acquiesce mais demande ensuite "Quand c'est fait, tu me dis juste : c'était facile, moyen, ou galère ?".
- Preuve systeme:
  - `response_owner=normal_reply`
  - `route_reason=normal_reply_default`
  - `blocked_paths[0].reason_code=local_exit_to_global_dispatcher_blocks_local_reply`
  - `local_flow_exit_handoff.note_information` present
  - note minimale: `source_flow_id=adjust_plan_item`, `target_dispatcher=global`, `structured_context` present
  - no DB mutation committed
- Correction attendue:
  - Le contexte filtre transmis a `normal_reply` apres handoff doit porter une contrainte visible `no_followup_question/no_extra_action` quand le message courant contient "sans suite", "rien d'autre", "je m'arrête là", ou equivalent semantique produit par IA.
  - La reponse globale post-exit doit etre un acknowledgement bref, sans nouvelle question ni demande de retour.
- Statut: `open`
- Fix reference: none yet
- Tests requis:
  - Positif: sortie d'un tool/local flow + "sans suite" -> normal reply sans question.
  - Paraphrase: "ne me relance pas", "pas besoin de suivi", "on ferme ici".
  - Anti-faux-positif: "sans suite dans la plateforme, mais aide-moi ici" peut continuer en conversation.
  - Integration: verifier `local_flow_exit_handoff` present et reponse visible sans question.

## R8-B03 — Cloture normale ajoute encore une suggestion apres refus explicite

- Bug id: `R8-B03`
- Tours: 5
- Famille: `BF-INTAKE-03` — contrainte explicite perdue
- Domaine owner: normal reply policy / response style constraints
- Source amont: application des contraintes de cloture dans le mode conversation normale.
- Symptome visible: apres "je ne veux pas faire de retour apres" et "je m'arrête là", Sophia ajoute encore une phrase de mini-cloture.
- Preuve systeme:
  - `response_owner=normal_reply`
  - `route_reason=normal_reply_default`
  - `active_flow_arbitration.reason_code=no_active_flow`
  - `note_information=null`
  - no DB mutation committed
- Correction attendue:
  - En conversation normale, un message de cloture avec refus explicite de suite doit produire uniquement une fermeture courte.
  - Eviter d'ajouter une suggestion, meme douce, quand le user vient de refuser toute suite.
- Statut: `open`
- Fix reference: none yet
- Tests requis:
  - Positif: "je m'arrête là, bonne soirée, rien d'autre" -> ack bref uniquement.
  - Paraphrase: "pas de retour apres", "ne rajoute rien", "on coupe".
  - Anti-faux-positif: "bonne soirée, mais avant..." doit traiter la demande apres "mais".

## Notes QA

- Le contrat `note_information` minimal est observe en run reel:
  - `source_flow_id`, `target_dispatcher`, `handoff_reason`, `handoff_context_for_next_dispatcher`, `user_words`, `structured_context`, `confidence` quand disponible.
- `structured_context` est present sur les notes observees.
- Aucun effet durable non consenti n'a ete commis.
- Le run est red a cause du mauvais owner au tour 3, pas a cause d'un echec de compilation ou de validite QA.
