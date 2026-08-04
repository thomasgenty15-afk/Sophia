# Bug Sheet - One Shot Reminder 7 Flows R2

## R2-B01

- Tours: Coaching Recommendation Tours 2-3
- Famille: `BF-ROUTE-02` - ancien flow capture une nouvelle intention; consequence `BF-EFFECT-02`
- Domaine owner: `coaching_recommendation` local flow / active owner direct-effect integration
- Source amont: sortie structuree locale ne remonte pas `direct_effect_request` create one-shot pendant `active_coaching_recommendation`
- Symptome visible: Sophia ignore "Rappelle-moi..." puis "cree juste le rappel..."
- Preuve systeme: `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`, `direct_effects_to_run=[]`, `scheduled_checkins=[]`
- Correction attendue: quand un active local flow detecte un rappel ponctuel explicite, il doit produire la sortie commune `direct_effect_request` et laisser la direct-effect lane commune executer exactement une fois, tout en continuant le flow si besoin.
- Statut: `open`
- Fix reference: none
- Tests requis: active coaching + multi-intent reminder; active coaching + reminder-only interruption; anti-faux-positif sans demande de rappel.

## R2-B02

- Tours: Feature Opportunity Tours 2-3
- Famille: `BF-ROUTE-02` - ancien flow capture une nouvelle intention; consequence `BF-EFFECT-02`
- Domaine owner: `feature_opportunity` local flow / active owner direct-effect integration
- Source amont: sortie structuree locale ne remonte pas `direct_effect_request` create one-shot pendant `active_feature_opportunity`
- Symptome visible: Sophia poursuit l'explication initiative et ignore la creation du rappel.
- Preuve systeme: `response_owner=feature_opportunity`, `route_reason=active_feature_opportunity`, `direct_effects_to_run=[]`, `scheduled_checkins=[]`
- Correction attendue: meme invariant transverse que coaching; aucun local flow actif ne doit avaler une demande explicite de rappel ponctuel.
- Statut: `open`
- Fix reference: none
- Tests requis: active feature + multi-intent reminder; active feature + reminder-only interruption; anti-faux-positif sur discussion initiative sans rappel.

## R2-B03

- Tours: Daily Action Review Tour 2
- Famille: `BF-LEDGER-02` - commit reel mal rendu
- Domaine owner: `whatsapp-webhook` pending daily + visible daily response context
- Source amont: `direct_effect_confirmation_context` non restitue dans la reponse visible daily
- Symptome visible: Sophia confirme le bilan daily mais ne dit pas que le rappel a ete programme.
- Preuve systeme: DB contient `event_context=one_shot_reminder:relancer_ce_bloc`, `scheduled_for=2026-06-24T20:13:47.068+00:00`, mais reponse visible: "Bien note..." sans rappel.
- Correction attendue: si `one_shot_reminder.committed=true`, le visible daily doit confirmer clairement le rappel dans la meme reponse, en plus du bilan.
- Statut: `open`
- Fix reference: none
- Tests requis: pending daily multi-intent avec rappel; verifier DB + reponse visible; anti-faux-positif daily sans rappel.

## R2-B04

- Tours: Safety Crisis Tour 1
- Famille: `BF-SAFETY-01` - priorite ou desescalade safety incorrecte
- Domaine owner: safety pregate / router arbitration
- Source amont: signal `risk_band=medium` avec detresse non imminente laisse `coaching_recommendation` produire une suggestion de potion
- Symptome visible: un message "au bord de craquer" est repondu comme coaching produit au lieu d'un cadrage safety/support minimal.
- Preuve systeme: trace Tour 1 `safety.risk_band=medium`, `reason_codes=[distress_without_immediate_danger]`, mais `response_owner=coaching_recommendation`.
- Correction attendue: clarifier la politique medium safety: soit preemption safety non-crisis, soit contraintes visibles interdisant une reponse outil/produit trop rapide sur detresse medium.
- Statut: `open`
- Fix reference: none
- Tests requis: detresse medium non imminente; high critical; sortie resolved puis rappel autorise.
