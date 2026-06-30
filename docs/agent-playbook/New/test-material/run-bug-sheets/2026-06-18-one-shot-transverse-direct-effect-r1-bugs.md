# Bug Sheet - 2026-06-18 One-shot Transverse Direct Effect R1

## Contexte

- Rapport lie: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-18-one-shot-transverse-direct-effect-r1.md`
- Runs: `one-shot-transverse-coaching-r1`, `one-shot-transverse-safety-r1`
- Cadre: IA reelle locale, `force_full_ai=true`, endpoint `/functions/v1/test-send-message`
- Statut global: open

## Bugs

### R1-B01

- Bug id: R1-B01
- Tours: Run 1 tour 1; Run 2 tour 2
- Famille: `BF-INTAKE-02`
- Domaine owner: `create_one_shot_reminder` direct effect intake/parser
- Source amont: extraction du slot `reminder_instruction`
- Symptome visible: Sophia confirme un rappel dont le texte contient aussi une autre intention utilisateur.
- Preuve systeme: payload run 1 `rouvrir le dossier banque, et aide-moi aussi a comprendre pourquoi je bloque a ecrire le mail a Camille`; payload run 2 `a Nora. J'ai encore besoin de redescendre, et le rappel dans 30 minutes est toujours important`.
- Correction attendue: extraire uniquement l'objet du rappel, sans absorber les propositions ou phrases suivantes non rattachees au rappel.
- Statut: `open`
- Fix reference: none
- Tests requis: reminder + coaching composite; reminder + emotional support composite; paraphrases avec "et aide-moi aussi"; anti-faux-positif ou le rappel contient legitimement une phrase longue.

### R1-B02

- Bug id: R1-B02
- Tours: Run 1 tour 1; Run 2 tour 2
- Famille: `BF-EFFECT-03`
- Domaine owner: direct effect payload compiler / scheduled_checkins writer
- Source amont: compilation du payload durable depuis l'intake polluee
- Symptome visible: un reminder est bien cree mais il rappellera le mauvais contenu.
- Preuve systeme: `scheduled_checkins.message_payload.reminder_instruction` ne correspond pas a la demande cible (`rouvrir le dossier banque`; `envoyer un message a Nora`).
- Correction attendue: bloquer ou degrader l'execution quand le payload contient des marqueurs d'intention additionnelle; persister uniquement le slot nettoye.
- Statut: `open`
- Fix reference: none
- Tests requis: assertion DB exacte sur `message_payload.reminder_instruction`, `event_context` et confirmation visible.

### R1-B03

- Bug id: R1-B03
- Tours: Run 1 tour 1; Run 2 tour 2
- Famille: `BF-AGENDA-01`
- Domaine owner: TurnAgenda / final response pipeline
- Source amont: composition direct effect confirmation + intention conversationnelle restante
- Symptome visible: Sophia confirme le reminder mais ne traite pas le coaching ou le soutien emotionnel demande dans le meme tour.
- Preuve systeme: run 1 tour 1 `memory_plan=response_intent handle reminder request and identify coaching lever...` mais reponse visible reminder-only; run 2 tour 2 `memory_plan=support_now_and_schedule_reminder` mais reponse visible reminder-only.
- Correction attendue: apres execution d'un direct effect, le renderer final doit recevoir `visible_confirmation_hint` plus `remaining_user_needs` et repondre aux deux si la securite le permet.
- Statut: `open`
- Fix reference: none
- Tests requis: full AI local multi-intention avec side effect et reponse conversationnelle obligatoire; verifier que la reponse ne devient pas verbeuse.

### R1-B04

- Bug id: R1-B04
- Tours: Run 2 tour 1
- Famille: `BF-SAFETY-01`
- Domaine owner: safety preemption / safety handoff / coaching recommendation handoff
- Source amont: passage `coaching_recommendation` vers safety quand `risk_band=medium`
- Symptome visible: Sophia renvoie une reponse vide sur un message de panique et isolement.
- Preuve systeme: http_status 409, `empty_response=true`, `risk_band=medium`, `skill_run.status=handoff`, no assistant content.
- Correction attendue: un tour safety medium doit toujours produire une reponse visible de soutien minimal; le handoff ne doit pas terminer le tour sans renderer.
- Statut: `open`
- Fix reference: none
- Tests requis: panic + no self-harm denial + one-shot reminder; panic sans reminder; assertion `content.length > 0` et safety content present.

### R1-B05

- Bug id: R1-B05
- Tours: Run 2 tour 1
- Famille: `BF-EFFECT-02`
- Domaine owner: direct effect lane admission during safety handoff
- Source amont: orchestration direct effect + safety/coaching handoff
- Symptome visible: reminder explicitement demande et detecte, mais aucun reminder n'est cree au tour 1.
- Preuve systeme: `direct_effects_to_run=["create_one_shot_reminder"]`, `executed_tools=[]`, `scheduled_checkins=[]`.
- Correction attendue: si l'effet est explicite, non dangereux et slot suffisant, l'executer meme quand safety preempte la reponse; sinon expliquer clairement le report sans claim de creation.
- Statut: `open`
- Fix reference: none
- Tests requis: safety medium + one-shot direct effect; safety high anti-test si l'effet doit etre bloque; ledger counts requested/allowed/committed coherents.

### R1-B06

- Bug id: R1-B06
- Tours: Run 1 tour 3
- Famille: `BF-ROUTE-03`
- Domaine owner: global dispatcher / active flow arbitration
- Source amont: arbitrage entre continuation coaching recommendation et product_help
- Symptome visible: reponse correcte mais owner `product_help`, alors que la question est la guidance produit de la recommandation coaching precedente.
- Preuve systeme: `response_owner=product_help`, `route_reason=product_help_signal`, apres recommandation active `carte d'attaque`.
- Correction attendue: si la question produit est le prolongement direct d'une recommandation locale, router vers l'etape locale `platform_guidance_visible_agent` ou transmettre explicitement le contexte coaching a product_help.
- Statut: `open`
- Fix reference: none
- Tests requis: coaching recommendation -> "ou je la trouve"; product_help pur sans contexte coaching; contrainte "ne cree rien" conservee.
