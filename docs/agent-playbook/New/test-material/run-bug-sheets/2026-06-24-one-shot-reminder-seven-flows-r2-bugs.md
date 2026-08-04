# Bug Sheet - One-Shot Reminder Seven Flows R2

## R2-B01

- Tours: Global, Product Help, Coaching Recommendation, Feature Opportunity
- Famille: `BF-EFFECT-03` - Payload durable faux
- Domaine owner: `create_one_shot_reminder` direct-effect lane
- Source amont: payload compiler / timezone validation
- Symptome visible: Sophia confirme l’heure demandée.
- Preuve systeme: `scheduled_for` persiste l’heure locale comme UTC (`09:10 Paris` -> `09:10Z`) sur plusieurs comptes QA.
- Correction attendue: convertir l’heure utilisateur vers UTC dans une couche runtime commune, à partir de la timezone canonique.
- Tests requis: invariant Europe/Paris CEST sur normal/product/coaching/feature; anti-régression hiver CET.
- Statut: `open`

## R2-B02

- Tours: Safety Crisis
- Famille: `BF-EFFECT-02` - Effet attendu absent
- Domaine owner: `safety_crisis` local dispatcher + direct-effect bridge
- Source amont: safety local output / bridge vers direct-effect lane
- Symptome visible: le user demande un rappel pendant safety, aucun rappel n’est créé.
- Preuve systeme: `response_owner=safety`, `selected_handler=safety_crisis`, `direct_effects_to_run=[]`, `scheduled_checkins=[]`.
- Correction attendue: safety garde l’ownership mais expose la demande explicite à la lane standard, conformément au contrat transverse.
- Tests requis: safety high + rappel explicite avec délai; safety visible ne confirme que si commit réel.
- Statut: `open`

## R2-B03

- Tours: Daily Action Review
- Famille: `BF-LEDGER-02` - Commit réel mal rendu
- Domaine owner: `whatsapp-webhook/handlers_pending.ts` + daily visible response
- Source amont: propagation `direct_effect_confirmation_context` après pending daily
- Symptome visible: Sophia répond au bilan mais ne confirme pas le rappel.
- Preuve systeme: `scheduled_checkins` contient le rappel `finir ce bloc`, mais assistant dit seulement “C’est noté pour le rangement...”.
- Correction attendue: injecter le contexte de confirmation post-commit dans le rendu daily, sans recréer ni redécider le rappel.
- Tests requis: pending daily + one-shot reminder; vérifier DB + visible confirmation.
- Statut: `open`

## R2-B04

- Tours: Weekly Adaptive Review
- Famille: `BF-STATUS-03` - Temps/localisation mal rendus
- Domaine owner: weekly visible / direct-effect confirmation formatter
- Source amont: rendu visible de `scheduled_for` UTC au lieu de l’heure locale demandée
- Symptome visible: user demande `10h30`, Sophia confirme `8h30`.
- Preuve systeme: DB correcte `2026-06-25T08:30:00Z`, mais visible “demain à 8h30”.
- Correction attendue: formatter les confirmations depuis timezone + local label canonique, pas depuis UTC brut.
- Tests requis: weekly active owner + rappel `10h30 Europe/Paris`; visible doit dire `10h30`, DB doit être `08:30Z`.
- Statut: `open`
