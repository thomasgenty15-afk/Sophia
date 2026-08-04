# Bug Sheet — 2026-06-12 select-state-potion-prompt-rules-r1

## R1-B01

- Bug id: `R1-B01`
- Tours: T2
- Famille: `BF-INTAKE-04` — Ambiguité non reconnue
- Domaine owner: `select_state_potion` sous-skill commun potions
- Source amont: dispatcher local / `detail_sufficiency` des champs `free_text`
- Symptome visible: Sophia livre le handoff Potion d'amour dès que le user choisit “douceur”, avec la valeur “mon échec de vendredi et le fait de me parler très durement”, sans creuser ce qui s'est passé ou ce qui se rejoue.
- Preuve systeme: T2 `selected_handler=select_state_potion.amour`, `status=handoff_delivered`, `reason_code=amour_handoff_delivered`, `platform_inputs.love_lack_context=mon échec de vendredi et le fait de me parler très durement`.
- Correction attendue: si le champ libre contient seulement un événement bref et une émotion générale, le dispatcher doit marquer `detail_sufficiency.status=needs_more_detail` et poser un seul creusement avant handoff.
- Statut: `verified`
- Fix reference: renforcement du prompt `detail_sufficiency` dans `state_potion_subskill_flow.ts`; test d'architecture ajouté dans `visible_agent_architecture_test.ts`; `deno check` OK; rerun IA réel `2026-06-12-select-state-potion-prompt-rules-r3` green, T2 `amour_field_needs_more_detail`, T3 `amour_handoff_delivered`.
- Tests requis: positif “mon échec de vendredi” -> `needs_more_detail`; positif après précision “j'ai abandonné la rédaction alors que ça comptait” -> handoff; anti-faux-positif valeur déjà concrète -> handoff direct; run IA réel `select_state_potion.amour`.
