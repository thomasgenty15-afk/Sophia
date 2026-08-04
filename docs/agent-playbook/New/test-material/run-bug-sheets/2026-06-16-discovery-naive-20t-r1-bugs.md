# Bug Sheet - Discovery Naive 20T - 2026-06-16 - R1

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-16-discovery-naive-20t-r1.md`

## R1-B01

- Bug id: `R1-B01`
- Tours: T4-T8
- Famille: `BF-INTAKE-03` / `BF-INTAKE-01`
- Domaine owner: `prepare_attack_card`
- Source amont: local dispatcher intake, slot policy, compact constraints
- Symptome visible: le user demande un déclencheur très court, mais Sophia redemande plusieurs validations et réintroduit un slot profond.
- Preuve systeme: `selected_handler=prepare_attack_card`, `route_reason=active_prepare_attack_card_local_dispatcher`; T6 demande "qu'est-ce que tu protèges" malgré `je veux juste un déclencheur`.
- Correction attendue: ajouter/renforcer un mode compact d'intake quand le user demande court/simple; rendre certains slots optionnels ou implicites si l'objectif est un mot de bascule minimal.
- Statut: `open`
- Fix reference: n/a
- Tests requis: paraphrases "fais simple", "juste une phrase", "pas profond"; vérifier finalisation sans 3 questions.

## R1-B02

- Bug id: `R1-B02`
- Tours: T9
- Famille: `BF-LEDGER-01`
- Domaine owner: `prepare_attack_card` + final response guard / EffectLedger
- Source amont: reducer/final visible output après flow non committé
- Symptome visible: Sophia dit "Tout est prêt" et renvoie vers l'UI, mais aucune carte n'est créée.
- Preuve systeme: DB inspect post-run `user_attack_cards=[]`; trace T9 `selected_handler=prepare_attack_card`, aucun `executed_tools`, aucun effet durable.
- Correction attendue: si le flow ne commit pas, visible doit dire explicitement "brouillon à reprendre" ou "je n'ai rien créé ici", jamais laisser croire que c'est finalisé.
- Statut: `open`
- Fix reference: n/a
- Tests requis: flow attack sans commit -> status recap doit dire 0 carte; visible ne doit pas dire "créé/prêt/finalisé".

## R1-B03

- Bug id: `R1-B03`
- Tours: T10-T12
- Famille: `BF-ROUTE-02`
- Domaine owner: active flow arbitration + `prepare_attack_card` local dispatcher
- Source amont: interruption/exit policy d'un flow opérationnel actif
- Symptome visible: nouveau sujet "piège du soir biscuits/téléphone" reste capturé par `prepare_attack_card`, puis la question status est bloquée.
- Preuve systeme: T10/T11/T12 `selected_handler=prepare_attack_card`, `route_reason=active_prepare_attack_card_local_dispatcher`; T12 Sophia répond "je garde la carte d'attaque en cours" à une demande de status.
- Correction attendue: `prepare_attack_card` doit émettre `exit_to_global_dispatcher` ou handoff quand le user signale `autre sujet`, risque récurrent, correction de domaine ou status explicite.
- Statut: `open`
- Fix reference: n/a
- Tests requis: active attack + "autre sujet"; active attack + "je veux éviter le piège"; active attack + "qu'est-ce qui a été créé".

## R1-B04

- Bug id: `R1-B04`
- Tours: T16-T17
- Famille: `BF-ROUTE-03` puis `BF-ROUTE-02`
- Domaine owner: `demotivation_repair` local dispatcher + active conversation skill arbitration
- Source amont: product/tool handoff depuis conversation skill actif
- Symptome visible: demande "tu peux faire quoi" reste en repair sans exposer clairement les capacités; demande de prévenir à 19h reste capturée par demotivation au premier signal.
- Preuve systeme: T16/T17 `selected_handler=demotivation_repair`, `active_flow_arbitration=continue_active`; T17 contient heure + instruction mais aucun `create_one_shot_reminder`.
- Correction attendue: depuis `demotivation_repair`, product_help explicite doit pouvoir être répondu/handoff; tool explicite daté doit sortir au premier signal.
- Statut: `open`
- Fix reference: n/a
- Tests requis: active demotivation + "tu peux faire quoi"; active demotivation + rappel daté implicite; active demotivation + rappel daté explicite.

## R1-B05

- Bug id: `R1-B05`
- Tours: T18
- Famille: `BF-LEDGER-02`
- Domaine owner: one-shot reminder confirmation visible / final response add-on
- Source amont: restitution de l'instruction reminder
- Symptome visible: "je te ferai un rappel pour ouvre le fichier du dossier" est grammaticalement maladroit.
- Preuve systeme: DB correct `reminder_instruction=ouvre le fichier du dossier`, visible mal rendu.
- Correction attendue: l'agent conversationnel doit reformuler naturellement la confirmation, par exemple "je te rappellerai d'ouvrir le fichier du dossier".
- Statut: `open`
- Fix reference: n/a
- Tests requis: instructions impératives avec verbe nu; confirmation en tutoiement naturel; conserver les apostrophes internes.

## R1-B06

- Bug id: `R1-B06`
- Tours: T9, T15, T16, T18
- Famille: `BF-TEST-01`
- Domaine owner: runtime latency / observability
- Source amont: appels IA locaux ou owners actifs longs
- Symptome visible: plusieurs tours prennent environ 20-50 secondes.
- Preuve systeme: attente observée pendant le run; endpoint finit en 200 sans fallback.
- Correction attendue: profiler les segments long-running des local dispatchers concernés et ajouter traces de timing si absentes.
- Statut: `open`
- Fix reference: n/a
- Tests requis: trace timing par segment sur `prepare_attack_card`, `demotivation_repair`, one-shot reminder.
