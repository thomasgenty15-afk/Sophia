# Bug Sheet — select_state_potion postfix r3

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, connexion temporaire `state_potion_postfix_20260603_r3`, aucun fallback déterministe, aucune modification de code pendant les runs.

Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-select-state-potion-postfix-r3.md`

## R3-B01 — Révision clarté ne met toujours pas à jour la valeur plateforme

- Tours: clarté T2, clarté T3
- Famille: `BF-STATE-03` — Draft lifecycle casse
- Domaine owner: `select_state_potion` platform handoff
- Source amont: lifecycle `revise_handoff`; le texte génératif (`why_this_potion`) reçoit la révision, mais le champ structuré `platform_inputs.answers[0].value` reste dérivé de l’ancien `intake_state.details.answers`.
- Symptôme visible: le user demande de remplacer le champ par “je fais les actions, mais je ne sens plus pourquoi elles comptent…”, mais Sophia continue d’afficher l’ancienne valeur “Je continue à faire les actions du plan, mais je ne sens plus bien le lien avec mon pourquoi.”
- Preuve système: clarté T2 `route_reason=active_handoff_revise_handoff`, `active_handoff_action=revise_handoff high`, `tool_skill_status=handoff_delivered`, durable counts à 0; contenu visible divergent entre `why_this_potion` révisé et `À mettre dans la plateforme` stale. T3 `apply_attempt` répète le stale draft.
- Correction attendue: faire porter la révision sur la source structurée des champs plateforme: sous-skill détail field-aware, ou action interne de revision du champ courant avant génération du handoff. Ne pas corriger par regex locale sur “reformule”.
- Statut: `open`
- Fix reference: à venir
- Tests requis: positif `reformule le champ comme ça` remplace `plan_meaning_loss_reason`; paraphrase `mets plutôt`; anti-faux-positif révision de ton sans changement de champ; integration réelle `/test-send-message force_full_ai=true` revision + apply_attempt.

## R3-B02 — Guérison sur-clarifie malgré demande explicite de potion

- Tours: guérison T1
- Famille: `BF-INTAKE-03` — Contrainte explicite perdue
- Domaine owner: dispatcher / orientation clarification / `select_state_potion` entry arbitration
- Source amont: arbitrage initial entre soutien émotionnel et potion ne respecte pas assez le signal explicite “préparer une potion” + “pas juste être rassuré”.
- Symptôme visible: Sophia demande “préparer la potion ou traverser la honte ?” alors que le user avait déjà choisi la potion.
- Preuve système: T1 `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `route_reason=clarification_required`; aucune mutation.
- Correction attendue: renforcer le contrat de clarification pour conserver la contrainte structurée `user_wants_potion_not_immediate_support` quand elle est produite par le dispatcher/intake. Le besoin émotionnel peut informer le ton, mais ne doit pas forcer une clarification déjà résolue.
- Statut: `open`
- Fix reference: à venir
- Tests requis: positif “je veux vraiment préparer une potion, pas juste être rassuré” démarre `select_state_potion`; paraphrase “je veux la potion, pas seulement une phrase”; anti-faux-positif “je ne sais pas si je veux une potion ou être rassuré” doit clarifier.

## R3-B03 — Confirmation de champ n’est plus classée apply_attempt

- Tours: guérison T2-T3, apaisement T2, potion inconnue T2/T4
- Famille: `BF-STATE-01` — Mauvaise transition de flow
- Domaine owner: dispatcher `active_handoff_action` + active handoff arbitration
- Source amont: ancien bug R2-B02, où une confirmation de champ était classée `handoff_apply_attempt`.
- Symptôme visible: corrigé. Les réponses “oui, c’est la honte” et “oui, c’est bien ça” verrouillent le champ et livrent le handoff, sans message d’activation.
- Preuve système: T3 guérison `route_reason=active_handoff_field_confirmation`, `active_handoff_action.type=field_confirmation`, `continuation_intent=field_confirmation`, `tool_skill_status=handoff_delivered`, durable counts à 0.
- Correction attendue: déjà en place pour ce run.
- Statut: `verified`
- Fix reference: corrections avant R3; tests unitaires `handoff_flow_arbitration_test.ts` et `select_state_potion/handoff_test.ts`; vérification réelle R3.
- Tests requis: conserver les tests `field_confirmation`; integration réelle si le contrat dispatcher change.

## R3-B04 — Destination plateforme rendue courtement

- Tours: apaisement T3
- Famille: `BF-ROUTE-03` — Product/status/tool mal priorisés
- Domaine owner: active handoff arbitration + `select_state_potion` renderer
- Source amont: ancien bug R2-B03, où une demande “où je la lance ?” répétait tout le handoff.
- Symptôme visible: corrigé. Sophia répond avec chemin plateforme + potion + champs à renseigner + no-mutation, sans refaire `Pourquoi cette potion`.
- Preuve système: T3 apaisement `route_reason=active_handoff_platform_destination_followup`, `active_handoff_action.type=platform_destination_followup`, `continuation_intent=platform_destination_followup`, `tool_skill_status=repeat_handoff`, durable counts à 0.
- Correction attendue: déjà en place pour ce run.
- Statut: `verified`
- Fix reference: corrections avant R3; tests unitaires `handoff_flow_arbitration_test.ts` et `select_state_potion/handoff_test.ts`; vérification réelle R3.
- Tests requis: conserver positif “où je la lance ?”; anti-faux-positif question produit générale “où sont mes rappels ?” doit rester product_help.

## R3-W01 — Trace imprécise dans le routing potion inconnue

- Tours: potion inconnue T1-T2
- Famille: `BF-TEST-01` — Trace/test incohérent ou suite malsaine
- Domaine owner: route trace / active handoff action labelling
- Source amont: T1 a `route_reason=normal_reply_default` malgré `response_owner=tool_skill`; T2 classe le choix “plutôt apaisement” en `field_confirmation`.
- Symptôme visible: aucun problème utilisateur bloquant; Sophia route naturellement vers apaisement et pose les bons champs.
- Preuve système: T1 `selected_handler=select_state_potion`, `tool_skill_status=collecting`, mais `route_reason=normal_reply_default`; T2 `field_confirmation` pour un choix de potion.
- Correction attendue: optionnelle sauf si les traces sont utilisées comme invariant fort. Clarifier les reason codes du handoff actif pour distinguer choix de potion vs confirmation de champ.
- Statut: `open`
- Fix reference: à venir si jugé nécessaire
- Tests requis: trace contract sur “je ne sais pas quelle potion” -> `potion_choice`/`clarify_state` reason; anti-régression visible déjà couvert par R3.
