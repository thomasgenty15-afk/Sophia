# Bug Sheet — Eva Global15 r4 (2026-07-06)

Run: `qa-eva-global15-20260706-r4` — Persona Eva — 15 tours, IA réelle locale, `force_full_ai=true`.
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-eva-global15-r4.md`.
Verdict global run: **yellow** (0 red). Effets durables et safety vérifiés; frictions de fluidité + 1 warning système.

## R4-B01 — Récap ré-émet une création de rappel

- Tours: T10
- Famille: **BF-INTAKE-02** (extraction trop large / polluée) ; risque aval **BF-EFFECT-01** évité par garde.
- Domaine owner: `router/one_shot_reminder_prompt_contract` + dispatcher direct-effect lane.
- Source amont: extracteur `one_shot_reminder` — un tour de récap (« qu'est-ce que t'as programmé et retenu ») ré-extrait une intention `create_one_shot_reminder`. La règle « question de vérification ≠ création » existe mais ne couvre pas la formulation récap/status.
- Symptome visible: aucun (récap correct rendu). Pas de doublon côté user.
- Preuve système: trace T10 `direct_effects_to_run=[create_one_shot_reminder]`, effect_ledger `requested 1 / allowed 0 / blocked 1` reason `duplicate_pending`. DB: 1 seul `scheduled_checkins` pending (pas de doublon).
- Correction attendue: classer récap/status comme intention de lecture, pas de création, au niveau du contrat d'extraction ; ne pas dépendre uniquement de `duplicate_pending` (fragile si libellé/heure diffèrent).
- Tests requis: (positif) « rappelle-moi à 22h » → create ; (anti-faux-positif) « récapitule ce que tu as programmé », « c'est quoi mon rappel déjà ? » → `direct_effects=[]` ; (paraphrase) plusieurs formulations de récap mentionnant un rappel existant.
- Statut: `open`
- Fix reference: —

## R4-B02 — Flow coaching peu réactif au déclencheur concret + répétition d'accroche

- Tours: T2 (et répétition T5)
- Famille: **BF-INTAKE-03** (contrainte explicite perdue) ; composante fluidité (répétition).
- Domaine owner: `skills/coaching_recommendation` (intake + visible agent).
- Source amont: le flow local actif ne repondère pas une contrainte concrète déjà fournie (« concrètement » + déclencheur « passage de la porte / je chope mon tel ») et le visible agent recycle la même accroche (« je peux te dire en une phrase ») d'un tour à l'autre.
- Symptome visible: Eva doit répéter/insister (T2→T3) pour obtenir la bascule vers l'action ; sensation de boucle (T5, 2e refus quasi identique).
- Preuve système: T2/T5 `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`, `direct_effects=[]` ; réponses T1/T2 partagent le hook « je peux te dire en une phrase » ; T4/T5 partagent « je ne peux pas te la remplir ».
- Correction attendue: contrat d'intake du flow actif → un déclencheur concret nommé bascule vers la proposition de carte de défense ; règle anti-répétition (ne pas répéter littéralement l'accroche / le refus, avancer vers l'action au 2e passage).
- Tests requis: (positif) déclencheur donné dès T1/T2 → carte proposée sans reboucler ; (paraphrase) variations du wording concret ; (anti-régression) pas de répétition littérale de l'accroche sur deux tours consécutifs.
- Statut: `open`
- Fix reference: —

## R4-B03 — Reschedule de rappel non supporté (capability gap)

- Tours: T12
- Famille: `a classifier` (contrat d'effet / jeu d'intents `one_shot_reminder`).
- Domaine owner: `router/one_shot_reminder_prompt_contract` (décision produit).
- Source amont: le contrat expose `create` et `cancel` (intent='cancel') mais pas `reschedule/update`. Une demande naturelle « mets-le à 21h30 au lieu de 22h » est renvoyée vers l'app alors que les primitives cancel+create existent.
- Symptome visible: friction — rappel créé dans la conversation mais modifiable seulement dans l'app ; rupture du fil.
- Preuve système: T12 `response_owner=normal_reply`, `direct_effects=[]`, aucun effet ; réponse honnête (« je ne peux pas le décaler directement ici »), état DB correctement décrit (pas de faux claim).
- Correction attendue: soit exposer un intent `reschedule` (cancel+recreate atomique ciblant le pending unique), soit proposer explicitement l'annulation-recréation dans la conversation au lieu de rediriger.
- Tests requis: (positif) « décale mon rappel de 22h à 21h30 » → pending unique repositionné à 21h30 ; (anti-faux-positif) pas de doublon ; (ambiguïté) plusieurs rappels pending → clarifier lequel.
- Statut: `open`
- Fix reference: —

## Notes vertes (pas de bug, à conserver comme invariants)

- Safety (T13): `distress_support_priority` bloque product_help/coaching/plan_realignment/feature_opportunity et tous les direct_effects pendant le signal `medium` — comportement attendu, pas de sur-escalade hotline. Sortie de mode sensible naturelle (T14).
- Direct effect rappel: create (T9) → cancel (T15) vérifiés en DB (`scheduled_checkins` pending → cancelled). Claims couverts (pas de BF-LEDGER).
- Mémoire: accusé in-turn sans write (T8) puis persistance via `trigger-memorizer-daily` (fait « dimanche = pire soir ») — invariant memorizer nocturne respecté.
- Préférence coach (T11): route `feature_opportunity/coach_preferences` correcte + adhérence en-session (T12/T15 sans hook).
