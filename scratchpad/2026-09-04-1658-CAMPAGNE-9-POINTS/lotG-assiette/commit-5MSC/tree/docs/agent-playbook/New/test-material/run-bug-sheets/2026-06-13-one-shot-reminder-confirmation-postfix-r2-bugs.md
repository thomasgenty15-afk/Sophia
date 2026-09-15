# Bug Sheet — one-shot-reminder-confirmation-postfix-r2

## Run

- Date: 2026-06-13
- Run id: `one-shot-reminder-confirmation-postfix-20260613-r2`
- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-one-shot-reminder-confirmation-postfix-r2.md`
- Verdict global: red
- Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer déterministe, aucun fallback direct `processMessage`.

## Bugs

### R2-B01 — Active flow capture un rappel ponctuel explicite avec second sujet

- Tours: 4
- Famille: BF-ROUTE-02 — Ancien flow capture une nouvelle intention; BF-EFFECT-02 — Effet attendu absent
- Domaine owner: `flow_opportunity_verification` / active flow arbitration
- Source amont: arbitration visible flow vs direct effect committable
- Symptome visible: Sophia traite seulement le second sujet émotionnel et ne confirme pas le rappel.
- Preuve systeme: `direct_effects_to_run=["create_one_shot_reminder"]`, `selected_handler=flow_opportunity_verification`, `executed_tools=[]`, `committed_effects=[]`; DB ne contient pas le rappel 10:40.
- Correction attendue: exécuter le direct effect one-shot avant ou pendant le visible flow, puis transmettre le commit au visible owner final.
- Statut: open
- Fix reference: n/a
- Tests requis: rappel + second sujet sous flow actif; vérifier commit DB + visible confirmation + reprise du second sujet.

### R2-B02 — Status pendant flow actif retourne 409 vide

- Tours: 5, 6
- Famille: BF-TEST-01 — Trace/test incohérent ou suite malsaine; BF-STATUS-02 — Historique incomplet
- Domaine owner: `flow_opportunity_verification` / `status_recap`
- Source amont: handoff interne `flow_opportunity_verification_get_info_db`
- Symptome visible: réponse vide avec `http_status=409` quand le user demande si le rappel a été créé.
- Preuve systeme: `selected_handler=flow_opportunity_verification`, `route_reason=active_flow_opportunity_verification_local_dispatcher`, `subskill_run.selected_handler=status_recap`, `skill_output=null`, `executed_tools=[]`.
- Correction attendue: rendre une réponse status visible ou laisser `status_recap` répondre; jamais de 409 vide pour une question de status.
- Statut: open
- Fix reference: n/a
- Tests requis: active flow + question "est-ce que le rappel a été créé ?", cas effet absent et cas effet présent.

### R2-B03 — Rappel émotionnel explicite perdu par visible flow

- Tours: 7
- Famille: BF-ROUTE-02 — Ancien flow capture une nouvelle intention; BF-EFFECT-02 — Effet attendu absent
- Domaine owner: active flow arbitration / visible emotional flow
- Source amont: coordination direct effect + visible owner final
- Symptome visible: Sophia répond au stress mais ne crée pas le rappel "respirer doucement et boire un verre d'eau".
- Preuve systeme: `direct_effects_to_run=["create_one_shot_reminder"]`, `selected_handler=flow_opportunity_verification`, `executed_tools=[]`, `committed_effects=[]`, aucune ligne DB 10:20.
- Correction attendue: le visible agent émotionnel peut garder le style final, mais il doit recevoir et confirmer le commit one-shot quand la demande est explicite.
- Statut: open
- Fix reference: n/a
- Tests requis: contexte émotionnel léger + rappel explicite; contexte safety non critique + rappel explicite; vérifier DB et visible confirmation.

### R2-B04 — Confirmation visible one-shot encore trop minimale

- Tours: 3, 9
- Famille: BF-LEDGER-02 — Commit réel mal rendu
- Domaine owner: visible owner final / one-shot renderer
- Source amont: rendu depuis `committed_effects`
- Symptome visible: `C'est programmé pour...` sans libellé, même quand le commit est correct.
- Preuve systeme: tours 3 et 9 ont `committed_effects` corrects et `direct_effect.confirmation_visible_agent` absent.
- Correction attendue: rendre l'heure et le libellé utile depuis le commit, dans le style du visible owner final.
- Statut: open
- Fix reference: n/a
- Tests requis: create success simple; create success après clarification; assertion visible contient l'instruction committée.

## Fixes Vérifiés Par Le Rerun

- Demande incomplète `Rappelle-moi de vérifier le fichier.`: `needs_clarify`, `tool_execution=blocked`, aucun commit stale.
- Reprise temporelle `Pour vérifier le fichier, mets-le plutôt dans 30 minutes.`: commit DB propre avec `reminder_instruction=vérifier le fichier`.
- Récap strict: liste seulement les deux rappels réellement créés, sans inventer les rappels perdus.
