# Bug Sheet - Weekly Full R6

## Contexte

- Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-weekly-full-r6.md`
- Run: `weekly-full-20260613-r6-rose`
- Persona: Rose
- Statut global: yellow
- Cadre: IA reelle locale, `/functions/v1/test-send-message`, `force_full_ai=true`, hors sandbox.

## Bugs

### R6-B01

- Bug id: `R6-B01`
- Tours: Tours 3 et 9
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_review`
- Source amont: action status projection dans `conversation_context`
- Symptome visible: Sophia dit `tu as maintenu le rangement` / `le matériel a été rangé` alors que le user a precise trois jours seulement.
- Preuve systeme: Tour 2 donne une correction partielle; Tours 3 et 9 restent trop positifs.
- Correction attendue: les corrections user par action doivent override la projection DB initiale dans la synthese et les questions suivantes.
- Statut: `open`
- Fix reference: a renseigner.
- Tests requis: action initialement done dans projection mais corrigee partielle par user; synthese doit dire `tenu trois jours`, pas `maintenu`.

### R6-B02

- Bug id: `R6-B02`
- Tours: Tour 4
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_review` solution fit
- Source amont: qualification attack vs defense
- Symptome visible: proposition d'une carte d'attaque pour un besoin de defense contre une impulsion.
- Preuve systeme: user parle de premiere minute, boîte visible, negocier pour fumer; Sophia propose `carte d'attaque`.
- Correction attendue: quand le besoin est proteger un moment critique, eviter une impulsion ou contrer un piege, preferer defense_card ou demander confirmation.
- Statut: `open`
- Fix reference: a renseigner.
- Tests requis: trigger defensif -> defense; demarrage volontaire -> attack; ambiguity -> question.

### R6-B03

- Bug id: `R6-B03`
- Tours: Tour 8
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: `prepare_defense_card`
- Source amont: platform handoff renderer/context
- Symptome visible: draft structure `route_kind=plan_item_card`, mais message visible dit `Cartes de défense libres`.
- Preuve systeme: Tour 8 trace `platform_flow.route_kind=plan_item_card`; visible destination `Cartes de défense libres`.
- Correction attendue: aligner route visible et structured route depuis le draft, sans template deterministe.
- Statut: `open`
- Fix reference: a renseigner.
- Tests requis: plan item card -> destination plan item card; free card -> cartes libres.

### R6-B04

- Bug id: `R6-B04`
- Tours: Tours 9 et 10
- Famille: `BF-LEDGER-01` - Claim sans commit
- Domaine owner: `weekly_review` synthesis
- Source amont: child flow result / effect ledger context
- Symptome visible: Sophia dit carte `disponible` ou `sera disponible` alors qu'il n'y a aucun commit et que le user doit la creer.
- Preuve systeme: committed_effects `[]`, platform handoff `no_chat_mutation=true`, visible claim de disponibilite.
- Correction attendue: le parent weekly doit dire `preparée dans la conversation, à ajouter dans l'espace`, jamais disponible/active sans commit.
- Statut: `open`
- Fix reference: a renseigner.
- Tests requis: platform handoff only -> no available/created/active wording.

### R6-B05

- Bug id: `R6-B05`
- Tours: Tour 12
- Famille: `BF-LEDGER-01` - Claim sans commit
- Domaine owner: `weekly_review` closure reducer
- Source amont: mismatch visible `weekly_closure` vs flow_action `confirm_weekly_diagnostic`
- Symptome visible: Sophia dit `Ton point hebdomadaire est maintenant terminé`, mais durable reste `active_status=open` jusqu'au tour 13.
- Preuve systeme: Tour 12 `status=answered`, `flow_action=confirm_weekly_diagnostic`, durable apres tour 12 `active_status=open`; Tour 13 seulement `complete_flow`.
- Correction attendue: confirmation explicite de cloture doit produire `complete_flow` sur le meme tour, ou le visible ne doit pas annoncer la fermeture.
- Statut: `open`
- Fix reference: a renseigner.
- Tests requis: user dit `on peut clôturer` -> durable completed on same turn.

### R6-B06

- Bug id: `R6-B06`
- Tours: Cleanup
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: runner QA `tmp/weekly_local_real_qa.mjs`
- Source amont: cleanup `createdScopes` trop large
- Symptome visible: aucun cote user; cleanup supprime un scope QA hors run courant.
- Preuve systeme: cleanup r6 supprime `qa-product-help-adjust-observability-20260613-r1` en plus du scope weekly r6.
- Correction attendue: cleanup allowlist uniquement le scope du run courant ou les scopes explicitement crees par ce runner.
- Statut: `open`
- Fix reference: a renseigner.
- Tests requis: scope concurrent cree apres snapshot doit rester intact.
