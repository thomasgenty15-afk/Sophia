# Bug Sheet — select_state_potion 6 flows handoff r2

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, connexion temporaire `state_potion_handoff_20260603-r2`, aucun changement de code pendant les runs, aucun fallback deterministe.

## R2-B01 — Revision handoff clarté ne met pas à jour la valeur plateforme

- Tours: clarté T2, clarté T3
- Famille: `BF-STATE-03` — Draft lifecycle casse
- Domaine owner: `select_state_potion` platform handoff
- Source amont: lifecycle `revise_handoff`; `platform_inputs.answers` reste derive de l'ancien `intake_state.details.answers` alors que `why_this_potion` est regenere avec la revision.
- Symptome visible: le user demande de reformuler le champ clarté en "je fais les actions, mais je ne sens plus pourquoi elles comptent...", mais Sophia continue d'afficher "Je ne vois plus le lien entre mes actions et mon pourquoi profond" dans la section "À mettre dans la plateforme".
- Preuve systeme: clarté T2 route `active_handoff_revise_handoff`, `active_handoff_action=revise_handoff high`, `tool_skill_run.platform_handoff.draft.recommendation.why_this_potion` revise, mais `platform_inputs.answers[0].value` stale.
- Correction attendue: quand `revise_handoff` touche un champ plateforme, mettre à jour l'intake/detail answer structurée ou regenerer le draft handoff depuis une source unique revisee; l'apply_attempt doit reutiliser ce draft revise.
- Statut: open
- Fix reference: a venir
- Tests requis: positif revision clarté remplace `plan_meaning_loss_reason`; paraphrase "mets plutôt..."; anti-faux-positif correction de ton qui ne change pas les champs; integration `/test-send-message force_full_ai=true` revision + apply_attempt.

## R2-B02 — Confirmation de champ guérison classée apply_attempt

- Tours: guérison T3
- Famille: `BF-STATE-01` — Mauvaise transition de flow
- Domaine owner: dispatcher active_handoff_action + active handoff arbitration
- Source amont: contrat `active_handoff_action` quand un handoff en detail intake attend confirmation d'un champ proposé.
- Symptome visible: aucun probleme visible majeur; Sophia livre le handoff correct. Systeme: `Oui, c'est la honte surtout` est classé `handoff_apply_attempt` alors que c'est une confirmation du champ `dominant_feeling`.
- Preuve systeme: route_reason `active_handoff_apply_attempt`, `active_handoff_action={"type":"handoff_apply_attempt","confidence":"high"}`, mais `tool_skill_run.status="handoff_delivered"` grace au guard runtime.
- Correction attendue: renforcer la sortie structuree pour distinguer `field_confirmation` / `continue_collecting` de `handoff_apply_attempt` quand `active_tool_skill_intake.phase=detail_intake` et qu'un champ proposé attend confirmation.
- Statut: open
- Fix reference: a venir
- Tests requis: positif "Oui, c'est la honte" verrouille le champ; paraphrase "oui c'est bien ça"; anti-faux-positif "oui active-la" apres handoff livré; integration active handoff detail intake.

## R2-B03 — Destination plateforme demandée, rendu trop large

- Tours: apaisement T3
- Famille: `BF-ROUTE-03` — Product/status/tool mal priorises
- Domaine owner: active handoff arbitration + select_state_potion renderer
- Source amont: `active_handoff_action` classe "où exactement dans la plateforme ?" en `clarify_handoff` high et le renderer répète tout le handoff.
- Symptome visible: le user demande seulement où lancer la potion; Sophia redonne toute la recommandation au lieu d'un chemin court.
- Preuve systeme: apaisement T3 route `active_handoff_action_unclear`, `active_handoff_action={"type":"clarify_handoff","confidence":"high"}`, owner reste `select_state_potion`.
- Correction attendue: ajouter une action structuree transversale de type `platform_destination_followup` ou mapper ce cas vers `repeat_handoff` court; renderer doit reutiliser le draft et rendre seulement chemin + choix + no-mutation.
- Statut: open
- Fix reference: a venir
- Tests requis: positif "où je la lance ?" -> chemin court; paraphrase "je vais dans quel écran ?"; anti-faux-positif question produit generale "où sont mes rappels ?" -> product_help; integration `/test-send-message force_full_ai=true`.
