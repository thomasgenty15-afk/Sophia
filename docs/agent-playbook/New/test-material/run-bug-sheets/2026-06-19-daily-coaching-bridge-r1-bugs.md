# Run Bug Sheet - qa-daily-coaching-bridge-2026-06-19T170746446Z

## R1-B01 - Persona WhatsApp sans acces actif bloque le test coaching

- Bug id: `R1-B01`
- Tours: 1
- Famille: `BF-TEST-01`
- Domaine owner: QA harness / donnees locales personas
- Source amont: preflight du runner daily/coaching et configuration `profiles.access_tier`.
- Symptome visible: le user demande un levier Sophia pendant le daily, mais reçoit le paywall WhatsApp au lieu d'une recommandation coaching.
- Preuve systeme: `profiles.access_tier=none`, `trial_end=2026-06-16T14:44:21.425091+00:00`; Tour 1 assistant metadata `purpose=whatsapp_paywall_upgrade`, `tier=none`; daily trace `last_daily_exit_target=coaching_recommendation`; coaching trace `active_skill_id=null`, `last_coaching_exit_target=null`.
- Correction attendue: le runner doit verifier avant creation de fixture que la persona a un acces WhatsApp actif (`alliance`, `architecte` ou trial actif). Si ce n'est pas le cas, il doit stopper avec verdict invalide au lieu de lancer un run suppose tester coaching.
- Statut: `open`
- Fix reference: none
- Tests requis: preflight runner rouge quand aucune persona active; run positif avec persona active observant `active_skill_id=coaching_recommendation`; cleanup restaurant toute modification temporaire si un patch d'acces est explicitement autorise.

## R1-B02 - Post-probe global non exploitable apres scenario invalide

- Bug id: `R1-B02`
- Tours: 3
- Famille: `BF-TEST-01`
- Domaine owner: QA harness daily/coaching
- Source amont: scenario driver envoie un post-probe global alors que le chemin coaching a deja ete invalide par paywall.
- Symptome visible: le tour post-daily reçoit une reponse assistant vide.
- Preuve systeme: Tour 3 `assistant_message_count=0`, `pending_status=done`, aucun `active_skill_id`, aucun nouveau durable effect.
- Correction attendue: supprimer le post-probe de ce scenario tant que le bridge coaching n'a pas ete observe, ou le marquer explicitement hors objectif. Le run doit s'arreter au premier blocage rouge non recuperable.
- Statut: `open`
- Fix reference: none
- Tests requis: runner daily/coaching ne continue pas en post-probe quand le Tour 1 est bloque par paywall; rapport inclut le blocage et ne fabrique pas de verdict vert.
