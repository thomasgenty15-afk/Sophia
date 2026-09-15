# Bug Sheet - select_state_potion handoff rerun - 2026-06-01

## R2-B01

- Bug id: `R2-B01`
- Tours: `qa-potion-handoff-rerun-r2`, tour 1
- Famille: `a classifier` - renderer handoff destination dupliquee
- Domaine owner: `select_state_potion` handoff renderer / product surface registry
- Source amont: composition entre `platform_destination` et `platform_steps`
- Symptome visible: le message dit "Dans la plateforme, dans la section Etat / Potions, puis ouvre la section Etat / Potions..."
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=select_state_potion`, `tool_execution=platform_handoff`, `executed_tools=[]`, aucun effet DB; le bug est seulement visible dans le rendu.
- Correction attendue: dedupliquer destination et steps au niveau renderer/registry. Les steps doivent commencer apres l'arrivee dans la section, ou le renderer doit omettre le step qui repete la destination.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/select_state_potion/renderer.ts`, `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts`
- Tests requis: test renderer handoff complet avec destination registry; test anti-regression sur absence de deux occurrences proches de "section Etat / Potions"; run QA ou test runtime qui garde `executed_tools=[]` et `no_chat_mutation=true`.
- Verification: test contractuel local passe (`potion handoff does not duplicate platform destination in steps`). Rerun reel local `qa-potion-handoff-postfix-r1` verifie le handoff complet sans duplication: "Dans la plateforme, dans la section Etat / Potions, puis choisis la potion recommandee, active-la depuis la plateforme si elle te convient." Runs `qa-potion-handoff-postfix-r1`, `qa-potion-handoff-postfix-r2`, `qa-potion-handoff-postfix-r3`: `executed_tools=[]`, DB `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`; cleanup cible effectue.
