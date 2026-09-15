# Bug Sheet - select_state_potion blockfix rerun - 2026-06-02

## POT-BLOCKFIX-20260602-B01

- Bug id: `POT-BLOCKFIX-20260602-B01`
- Tours: `qa-potion-emorepair-blockfix-20260602-r1` T2, `qa-potion-emorepair-blockfix-20260602-r2` T2-T3, `qa-potion-emorepair-blockfix-20260602-r3` T3
- Famille: `BF-LEDGER-02` - rendu visible de handoff mal adapte au resultat reel
- Domaine owner: `select_state_potion` renderer
- Source amont: libelle visible du champ `recommendation.immediate_step`.
- Symptome visible: le handoff affiche `Pas immédiat : ...`, lisible comme "not immediate" alors que le contenu est un petit pas a faire maintenant.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=select_state_potion`, `tool_execution=platform_handoff`, `executed_tools=[]`; contenu correct mais libelle ambigu.
- Correction attendue: remplacer le libelle par une formulation non ambigue, retirer les blocs `À préserver` / `À éviter`, et afficher les reponses exactes a saisir dans le parcours UI potion.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/select_state_potion/renderer.ts`, `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts`, `supabase/functions/sophia-brain/tools/operations/select_state_potion/contract.ts`.
- Tests requis: couverts par `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts`: handoff complet contient `À mettre dans la plateforme`, les libelles des questions UI, ne contient pas `À préserver`, `À éviter`, ni `Pas immédiat :`; repeat handoff conserve le rendu corrige.
- Validation locale: `/usr/local/bin/deno test --allow-all supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts supabase/functions/sophia-brain/tools/operations/handoff_renderer_registry_test.ts` => `58 passed | 0 failed`.
- Validation reelle: non relancee apres correction.
