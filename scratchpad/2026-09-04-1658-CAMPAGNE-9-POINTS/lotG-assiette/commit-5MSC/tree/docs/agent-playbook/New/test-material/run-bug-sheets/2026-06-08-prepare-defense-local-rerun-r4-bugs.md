# Bug Sheet - prepare-defense-local-rerun-r4

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, run cible `prepare-defense-local-rerun-r4`. T1-T4 valides sur le run initial; T5-T6 ont d'abord retourne HTTP 502 sans trace Sophia, puis ont ete repris sur le meme scope avec succes.

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R4-B01` | T5-T6 initial | `BF-TEST-01` | Test/runtime local | Endpoint local `/functions/v1/test-send-message` ou upstream local | Reponse vide sur premiere tentative; retry necessaire | HTTP 502, `response_owner=null`, `selected_handler=null`, aucune trace Sophia sur tentative initiale. Reprise T5/T6: HTTP 200, traces valides | Stabiliser le endpoint local pour eviter les 502 intermittents; ne pas utiliser de fallback | `open` | Reprise T5/T6 valide: `2026-06-08-prepare-defense-prepare-defense-local-rerun-r4-resume-t5t6.raw.json` | Garder un rerun complet sans 502 lors d'une prochaine validation; T5 apply attempt et T6 sortie attaque deja verifies par reprise |

## Verifications Positives Du Run

- T1: signal global explicite `prepare_defense_card`, `tool_skill_opportunity=none`.
- T2-T4: global dispatcher bloque pendant flow actif via `active_prepare_defense_card_uses_local_dispatcher`.
- T4: wording de revision corrige; aucun claim "j'ai pris en compte", "c'est note", "j'ai enregistre".
- T5 reprise: `apply_attempt`, `blocked_effects=create_defense_card/chat_creation_disabled_platform_handoff`, `committed_effects=[]`, `pending_confirmation=null`.
- T6 reprise: sortie vers `prepare_attack_card`, `flow_action=answer_current_field`, `visible_task=ask_target`, `committed_effects=[]`.
- T1-T5 defense: `ai_call_count=2`, `committed_effects=[]`, `pending_confirmation=null`.
