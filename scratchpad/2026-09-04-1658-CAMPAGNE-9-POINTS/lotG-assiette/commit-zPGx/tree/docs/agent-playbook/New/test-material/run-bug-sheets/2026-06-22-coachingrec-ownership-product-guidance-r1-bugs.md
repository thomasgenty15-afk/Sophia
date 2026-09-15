# Bug Sheet - Coaching Recommendation Ownership Product Guidance R1

## Run

- Date: 2026-06-22
- Run id: `coachingrec-ownership-product-guidance-20260622-r1`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-22-coaching-recommendation-ownership-product-guidance-r1.md`
- Verdict global: yellow

## Bugs

### R1-B01

- Tours: T4-T5
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: local reducer / completion policy / active state persistence
- Symptome visible: apres une reponse correcte sur "carte d'attaque vs potion" pour le meme blocage, le flow se vide; la question suivante "ou relire la carte" part en `product_help`.
- Preuve systeme:
  - T4: `response_owner=normal_reply`, `route_reason=coaching_recommendation_exit_to_global`, `selected_skill_id=coaching_recommendation`, active skill apres tour = null.
  - T5: `response_owner=product_help`, `route_reason=product_help_signal`, active skill = null.
- Correction attendue: conserver `coaching_recommendation` actif quand le user compare une alternative produit/emotionnelle a la recommandation stable ou demande une guidance produit liee a cette recommandation.
- Statut: open
- Fix reference: a creer
- Tests requis:
  - Positif: plan action -> attack card -> explanation -> Plan destination -> action-linked emotion/potion comparison -> next product guidance reste `active_coaching_recommendation`.
  - Paraphrase: meme scenario avec "je suis stresse/tendu avant de commencer" et "je la retrouve ou".
  - Anti-faux-positif: vrai changement de sujet produit standalone apres cloture explicite peut aller vers `product_help`.
  - Integration: run IA reel local `/functions/v1/test-send-message`, `force_full_ai=true`.

### R1-B02

- Tours: T5
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: dispatcher global / active flow arbitration, consequence de `coaching_recommendation`
- Source amont: absence d'active flow apres T4; `readActiveFlowState` ne peut plus proteger l'ownership.
- Symptome visible: une question de guidance sur la carte d'attaque recommandee dans le flow est traitee par `product_help`.
- Preuve systeme: T5 `response_owner=product_help`, `selected_handler=product_help`, `route_reason=product_help_signal`; active skill null.
- Correction attendue: corriger R1-B01 en amont; si l'etat actif existe, le global doit continuer a respecter `readActiveFlowState`.
- Statut: open
- Fix reference: depend de R1-B01
- Tests requis:
  - Positif: T5-like reste `response_owner=coaching_recommendation` si le dernier flow coaching parle d'une carte deja recommandee.
  - Anti-faux-positif: une question produit standalone sans active coaching reste routee `product_help`.
