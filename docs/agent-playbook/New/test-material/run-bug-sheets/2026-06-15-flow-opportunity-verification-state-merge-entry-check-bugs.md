# Bug Sheet - flow_opportunity_verification state merge entry check

## R2-B01

- Bug id: `R2-B01`
- Tours: `r2.1`, `r2.2`, `r2.3`, `r3.1`, `r4.1`
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: QA scenario / test design
- Source amont: scenario choisi pour tester `flow_opportunity_verification`
- Symptome visible: le run pretend tester le flow opportunity, mais les messages utilisateur formulent surtout une demande de verification factuelle (`status_recap`) ou une demande de conseil (`normal_reply`).
- Preuve systeme: `selected_handler=status_recap` ou `response_owner=normal_reply`; `flow_opportunity_state=null`; aucun `state_mutation_audit`, car le flow cible n'a pas ete active.
- Correction attendue: relancer un scenario ou l'ambiguite d'opportunite est reelle: le user laisse entendre qu'un flow pourrait aider sans demander explicitement un status DB ni un conseil normal. Le run doit observer une activation `flow_opportunity_verification` avant de tester conservation, refus, confirmation et handoff.
- Statut: `open`
- Fix reference: none
- Tests requis: nouveau run reel avec entree implicite candidate, pre-acceptation non confirmante, refus explicite, changement de sujet et confirmation claire; garder un anti-faux-positif ou `status_recap` doit bien repondre directement a une demande de verification de reglage.
