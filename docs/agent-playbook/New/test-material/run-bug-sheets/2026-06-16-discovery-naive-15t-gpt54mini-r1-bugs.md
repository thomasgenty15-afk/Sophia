# Bug Sheet - Discovery Naive 15T GPT54Mini Check - 2026-06-16 - R1

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-16-discovery-naive-15t-gpt54mini-r1.md`

## R1-B01

- Bug id: `R1-B01`
- Tours: model observability all turns
- Famille: `BF-TEST-01`
- Domaine owner: local Edge runtime / model configuration
- Source amont: environment propagation or model selection override
- Symptome visible: the run was intended to verify GPT 5.4 mini, but successful LLM usage events show 0 `gpt-5.4-mini` calls.
- Preuve systeme: `llm_usage_events`: 31 `gemini-3-flash-preview`, 5 `gpt-5.4-nano`, 1 `gemini-2.5-flash`, 0 `gpt-5.4-mini`; raw events show no GPT 5.4 mini attempts.
- Correction attendue: ensure local Edge worker runtime actually receives `GLOBAL_AI_MODEL=gpt-5.4-mini` and `SOPHIA_DISPATCHER_LLM_MODEL=gpt-5.4-mini`, or document the override path that still forces Gemini.
- Statut: `open`
- Fix reference: n/a
- Tests requis: one-turn smoke with usage assertion per source; dispatcher-v2 + local operation dispatcher should log `openai/gpt-5.4-mini`.

## R1-B02

- Bug id: `R1-B02`
- Tours: T5, T10
- Famille: `BF-ROUTE-02` / `BF-STATUS-02`
- Domaine owner: active operation flows + status inline runtime
- Source amont: `prepare_attack_card` and `prepare_defense_card` inline `get_info_db/status_recap`
- Symptome visible: status question during active operation flow returns "Je n'arrive pas à répondre..." instead of factual status.
- Preuve systeme: T5 `selected_handler=prepare_attack_card`; T10 `selected_handler=prepare_defense_card`; both are explicit status/ledger questions; DB later confirms no cards and one reminder.
- Correction attendue: explicit status questions inside active operation flows should either complete inline status or exit/handoff to `status_recap` with the active flow context.
- Statut: `open`
- Fix reference: n/a
- Tests requis: active attack + "créé vraiment ou préparation"; active defense + "ce qui existe vraiment"; assert visible answer includes no cards created and active reminder if present.

## R1-B03

- Bug id: `R1-B03`
- Tours: T12
- Famille: `BF-LEDGER-02`
- Domaine owner: one-shot reminder confirmation visible / final response add-on
- Source amont: reminder confirmation phrasing
- Symptome visible: "je te ferai un rappel pour ouvre le fichier..." is grammatically awkward.
- Preuve systeme: DB correct; `scheduled_checkins.message_payload.reminder_instruction = ouvre le fichier et lis seulement la consigne`.
- Correction attendue: visible confirmation should blend the instruction naturally: "je te rappellerai d'ouvrir le fichier et de lire seulement la consigne".
- Statut: `open`
- Fix reference: n/a
- Tests requis: imperative reminder instruction; confirmation in natural tutoiement; preserve exact DB instruction.
