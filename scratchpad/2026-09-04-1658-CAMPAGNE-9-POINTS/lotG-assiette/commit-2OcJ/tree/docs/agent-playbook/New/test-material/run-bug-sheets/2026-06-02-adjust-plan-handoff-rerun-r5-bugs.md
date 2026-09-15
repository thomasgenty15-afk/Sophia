# Bug Sheet — Adjust Plan Handoff R5

## Run

- Date: 2026-06-02
- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-adjust-plan-handoff-rerun-r5.md`
- Runs:
  - `adjust-plan-action-20260602-r5`
  - `adjust-plan-level-20260602-r5`
  - `adjust-plan-whole-20260602-r5`
- Verdict: yellow
- Cadre: full AI local, `/functions/v1/test-send-message`, `force_full_ai=true`

## Bugs

### R5-B01 — Action scope sur-clarifie apres un changement concret

- Tours: action T2
- Famille: `BF-INTAKE-01` — Slot fourni mais redemande
- Domaine owner: `adjust_plan_item`
- Source amont: intake/readiness gate `specific_plan_item`, handoff draft readiness
- Symptome visible: apres cible, levier, duree, frequence et contexte, Sophia redemande ce qu'il faut garder dans la version 2 minutes.
- Preuve systeme:
  - T2 `status=clarifying`
  - `missing_slots=["draft_generation_retry_needed"]`
  - `executed_tools=[]`, `committed_effects=[]`, `pending_confirmation=null`
- Correction attendue: passer en handoff quand `target_summary`, levier d'allegement et changement concret sont presents; ne pas exiger des slots executables supplementaires pour un handoff no-mutation.
- Statut: fixed
- Fix reference: `coach_guidance.ts`, `router.ts`, `router_test.ts`
- Tests requis:
  - action cible + duree + frequence -> handoff sans clarification supplementaire;
  - paraphrase avec "jours charges" -> handoff;
  - anti-regression action vraiment vague -> clarification.
- Tests ajoutes:
  - `adjust_plan action guidance can hand off when no clarification remains`

### R5-B02 — Handoff action trop pauvre et wording operationnel dans les steps

- Tours: action T3, T4, T5
- Famille: `BF-INTAKE-03` — Contrainte/qualite de draft degradee
- Domaine owner: `adjust_plan_item`
- Source amont: handoff draft mapping action-level, renderer platform steps, active handoff repeat/revise
- Symptome visible:
  - `À préserver` devient seulement `Le reste du plan`;
  - `À éviter` liste des objets a ne pas modifier plutot que des risques/action boundaries;
  - step visible: `Applique l'ajustement recommandé seulement à cette cible`.
- Preuve systeme:
  - T3 `status=handoff_delivered`, `reason_code=platform_handoff_no_chat_mutation`
  - T4 `status=apply_attempt`, no mutation intact
  - T5 `status=revise_handoff`, preserve/avoid faibles conserves
- Correction attendue: mapper `preserve/avoid` depuis la guidance action quand elle existe; sur revision, regenerer ou merger ces listes; remplacer les verbes operationnels des platform steps par `reprends`, `modifie dans Plan`, `ajuste dans Plan`.
- Statut: fixed
- Fix reference: `handoff.ts`, `renderer.ts`, `router_test.ts`
- Tests requis:
  - handoff action inclut l'intention de l'action dans `À préserver`;
  - action revise regenere preserve/avoid;
  - renderer action ne contient pas `Applique l'ajustement recommandé`;
  - no-mutation invariants inchanges.
- Tests ajoutes:
  - `adjust_plan action handoff uses coach preserve avoid and non-operational Plan steps`
  - `adjust_plan revise_handoff updates the recommendation without execution`

### R5-B03 — Wording meta visible dans handoff niveau

- Tours: niveau T1
- Famille: `BF-INTAKE-03` — Texte interne rendu au user
- Domaine owner: `adjust_plan_item`
- Source amont: `coaching_guidance.recommendation` -> handoff draft -> renderer
- Symptome visible: Sophia dit `Le sous-skill doit surtout distinguer...`.
- Preuve systeme:
  - T1 `status=handoff_delivered`
  - `reason_code=current_level_partial_scope_platform_handoff`
  - reponse visible contient `Le sous-skill doit`
  - `executed_tools=[]`, `committed_effects=[]`
- Correction attendue: sanitizer/transformer les formulations meta (`sous-skill`, `orienter la réponse`, `la réponse coach doit`) avant rendu user-facing.
- Statut: fixed
- Fix reference: `handoff.ts`, `router_test.ts`
- Tests requis:
  - current-level handoff avec guidance meta -> pas de `sous-skill`;
  - whole-plan handoff avec guidance meta -> pas de `la réponse coach doit`;
  - renderer conserve destination Plan et no-mutation.
- Tests ajoutes:
  - `adjust_plan current-level handoff hides internal diagnostic wording`

### R5-B04 — Whole-plan redemande les blocs deja fournis inline

- Tours: whole-plan T2
- Famille: `BF-INTAKE-01` — Slot fourni mais redemande
- Domaine owner: `adjust_plan_item`
- Source amont: whole-plan intake/readiness, parsing semantique des listes inline
- Symptome visible: le user donne `ordre actuel` et `ordre test`, mais Sophia redemande les intitulés exacts et l'ordre actuel.
- Preuve systeme:
  - T2 `status=clarifying`
  - `missing_slots=["draft_generation_retry_needed"]`
  - `executed_tools=[]`, `committed_effects=[]`, `pending_confirmation=null`
- Correction attendue: reconnaitre une phrase contenant ordre actuel + ordre cible comme inventaire suffisant, meme sans numerotation formelle; produire un handoff ou demander seulement la decision reellement manquante.
- Statut: fixed
- Fix reference: `coach_guidance.ts`, `router_test.ts`
- Tests requis:
  - whole-plan inline current order + target order -> handoff;
  - whole-plan enumerated current/target order -> handoff;
  - whole-plan sans blocs -> clarification;
  - no executor/no writer/no confirmation.
- Tests ajoutes:
  - `adjust_plan whole-plan structured reorder guidance can hand off despite retry slot`

### R5-B05 — Operation id non-null dans un handoff action

- Tours: action T3
- Famille: `BF-TEST-01` — Trace/test incoherent ou suite malsaine
- Domaine owner: `adjust_plan_item` / trace contract
- Source amont: handoff runtime metadata
- Symptome visible: aucun symptome utilisateur; trace contient `operation_id` non-null alors que le handoff est `no_chat_mutation`.
- Preuve systeme:
  - T3 `status=handoff_delivered`
  - `operation_id="2cca51ec-c869-459e-a70a-75f2bc87b98c"`
  - `requested_effects=[]`, `allowed_effects=[]`, `blocked_effects=[]`, `committed_effects=[]`
- Correction attendue: clarifier si cet id est seulement un id de run/handoff. Si oui, renommer dans la trace; sinon le supprimer du mode handoff pour eviter toute confusion avec un draft executable.
- Statut: fixed
- Fix reference: `router.ts`, `router_test.ts`
- Tests requis:
  - handoff runtime trace n'expose pas d'id interpretable comme operation executable;
  - apply_attempt apres cet id ne peut pas executer;
  - ledger reste `committed_effects=[]`.
- Tests ajoutes:
  - `adjust_plan legacy pending handoff trace does not expose executable operation id`

## Invariants Verifies

- 18 tours full AI locaux valides.
- `response_owner=tool_skill` et `selected_handler=adjust_plan_item` sur les 18 tours.
- `executed_tools=[]` sur les 18 tours.
- `committed_effects=[]` sur les 18 tours.
- `pending_confirmation=null` sur les 18 tours.
- `durable_effect=platform_handoff` sur les 18 tours.
- `ok vas-y` / `applique` devient `apply_attempt`, sans execution.
- `redis-moi` reste dans le handoff actif, pas status recap ni product help.
- Aucune reponse ne contient `c'est fait`, `j'ai modifié`, ou `je l'ai appliqué`.
