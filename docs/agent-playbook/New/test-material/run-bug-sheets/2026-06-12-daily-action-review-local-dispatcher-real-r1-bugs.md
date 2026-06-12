# Bug Sheet - Daily Action Review Local Dispatcher Real R1

## Run

- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-daily-action-review-local-dispatcher-real-r1.md`
- Run id: `daily-action-review-real-20260611231555-r1`
- Persona: Rose
- Verdict: red

## Bugs

### R1-B01

- Tours: Tour 1
- Famille: `BF-TEST-01`
- Domaine owner: QA runner / WhatsApp loopback setup
- Source amont: numero QA non relie au profil Rose, donc `whatsapp-webhook` trouve `candidates_count=0`
- Symptome visible: aucune reponse Sophia, pending daily reste `pending`
- Preuve systeme: logs webhook `before_profile_lookup -> after_profile_lookup candidates_count=0`, puis unlinked handler
- Correction attendue: fournir un helper QA daily qui associe explicitement le numero loopback au user ou envoie un champ simule effectivement lu par le webhook
- Statut: open
- Fix reference: none
- Tests requis: run daily pending fixture sans patch manuel du profil; webhook doit atteindre `before_pending_handler` avec `candidates_count=1`

### R1-B02

- Tours: Tour 1 Retry
- Famille: `BF-LEDGER-02`
- Domaine owner: daily action review visible response / final response pipeline
- Source amont: rendu apres commit persiste une enveloppe JSON `{name, role, content}` au lieu du texte visible
- Symptome visible: Sophia envoie `{"name":"user","role":"assistant","content":"..."}`
- Preuve systeme: `chat_messages.content` contient l'objet JSON serialise; DB daily entries et occurrences sont pourtant correctement commitees
- Correction attendue: garantir que la sortie visible daily apres commit est du plain text; sanitizer anti-envelope et prompt visible qui interdit tout JSON visible
- Statut: open
- Fix reference: none
- Tests requis:
  - completed+partial daily -> plain text visible
  - visible runner retourne enveloppe JSON -> extraction de `content` ou rejet controle
  - durable commit correct ne suffit pas si message visible n'est pas humain
