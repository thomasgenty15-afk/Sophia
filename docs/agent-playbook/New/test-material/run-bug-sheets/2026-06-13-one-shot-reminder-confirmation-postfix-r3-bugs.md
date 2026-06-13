# Bug Sheet — one-shot-reminder-confirmation-postfix-20260613-r3

## Run

- Date: 2026-06-13
- Run id: `one-shot-reminder-confirmation-postfix-20260613-r3`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-one-shot-reminder-confirmation-postfix-r3.md`
- Verdict global: `red`
- Cleanup: effectue, scoped par `user_id=d3956b70-c7e2-4d69-a3e5-8c0fc7fafa24`; `user_memories` 404, autres tables et Auth OK.

## Bugs

### R3-B01 — Payload durable faux sur contrainte negative

- Tours: 3, 8
- Famille: `BF-EFFECT-03` — Payload durable faux
- Domaine owner: `one_shot_reminder`
- Source amont: extraction instruction / payload compiler avant executor.
- Symptome visible: Sophia confirme `je te rappellerai de régler tout le dossier` alors que le user a demandé `ouvrir le fichier, sans essayer de régler tout le dossier`.
- Preuve systeme:
  - T3 `executed_tools=["create_one_shot_reminder"]`, `tool_execution=success`
  - T3 `committed_effects[0].reminder_instruction="régler tout le dossier"`
  - DB `event_context=one_shot_reminder:regler_tout_le_dossier`
  - T8 `status_recap` liste le payload DB incorrect.
- Correction attendue: l'instruction parser doit conserver l'action positive principale et la contrainte de scope negative, ou au minimum ne jamais promouvoir la clause interdite apres `sans` comme cible du rappel. Le fix appartient au domaine `one_shot_reminder`, pas au renderer ni au recap.
- Statut: `fixed`
- Fix reference: `one_shot_reminder` now treats `TurnFrame.direct_effects[].payload_hint.instruction_hint` as canonical for create commits; covered by `create uses dispatcher instruction_hint as canonical reminder payload`.
- Tests requis:
  - Positif: `Rappelle-moi dans 25 minutes : ouvrir le fichier, sans essayer de régler tout le dossier.` doit committer une instruction contenant `ouvrir le fichier` et la limite `sans essayer...`, ou une structure equivalente.
  - Paraphrase: `dans 20 minutes, juste ouvrir le doc sans résoudre le dossier`.
  - Anti-faux-positif: `rappelle-moi de régler tout le dossier` doit continuer a committer `régler tout le dossier`.
  - Integration: run via direct effect lane et recap DB.
  - Verification locale 2026-06-13: `deno check` on `executor.ts`, `router.ts`, `one_shot_reminder_router_test.ts`; `one_shot_reminder_router_test.ts` 11/11 OK; QA R1 parser/tool tests 7/7 OK.

### R3-B02 — Confirmation visible doublee quand un visible owner local recoit le commit

- Tours: 4, 5
- Famille: `BF-LEDGER-02` — Commit reel mal rendu
- Domaine owner: direct effect lane / final response pipeline / visible owner composition.
- Source amont: `mergeDirectEffectRuntimeIntoVisibleRuntime` concatene la confirmation pre-rendue avec la reponse du visible owner, et le visible owner confirme a son tour.
- Symptome visible:
  - T4 affiche deux confirmations du meme rappel, puis une relance de suffixe brute.
  - T5 affiche deux confirmations du meme rappel dans le contexte emotionnel.
- Preuve systeme:
  - T4/T5 `selected_handler=flow_opportunity_verification`
  - T4/T5 `executed_tools=["create_one_shot_reminder"]`, `tool_execution=success`
  - T4/T5 `committed_effects` corrects et `direct_effect_lane` present
  - `direct_effect.confirmation_visible_agent` absent
- Correction attendue: quand un visible owner existe, la lane doit transmettre `committed_effects` / `blocked_effects` comme facts et ne pas concatener automatiquement son `content`, sauf si le visible owner ne produit aucun message ou ne confirme pas le commit. La final response pipeline doit eviter d'ajouter un follow-up de suffixe redondant quand le visible owner a deja repris le second sujet.
- Statut: `open`
- Fix reference: none yet
- Tests requis:
  - Positif: rappel + second sujet sous `flow_opportunity_verification` produit une seule confirmation et une reprise naturelle.
  - Paraphrase: rappel emotionnel + question personnelle produit une seule confirmation.
  - Anti-faux-positif: si visible owner retourne vide, la confirmation pre-rendue reste visible.
  - Trace: `selected_handler` visible owner conserve, `executed_tools` et `committed_effects` presents, aucun `direct_effect.confirmation_visible_agent`.

### R3-B03 — Second sujet repris avec connecteur brut

- Tours: 4
- Famille: `BF-AGENDA-01` — Multi-intention incomplete
- Domaine owner: final response pipeline / agenda suffix handling.
- Source amont: `appendUncoveredMessageFollowup` ou equivalent conserve le suffixe avec `et ensuite`.
- Symptome visible: `Je garde aussi la suite : « et ensuite j'aimerais... »` expose un fragment de phrase peu naturel apres que le visible owner a deja mentionne le sujet.
- Preuve systeme: T4 reponse visible contient a la fois la reprise naturelle et le suffixe brut.
- Correction attendue: normaliser le suffixe multi-intention avant rendu, et ne pas ajouter le follow-up si le visible owner a deja traite ou repris le second sujet.
- Statut: `open`
- Fix reference: none yet
- Tests requis:
  - Rappel + `et ensuite j'aimerais...` sous visible owner local.
  - Rappel + `apres ca on peut parler de...`.
  - Anti-faux-positif: si le visible owner ignore totalement le suffixe, garder une relance courte mais sans connecteur brut.
