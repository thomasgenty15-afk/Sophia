# Run Bug Sheet — safety_crisis R1

## R1-B01

- Bug id: `R1-B01`
- Tours: Tour 3
- Famille: `BF-SAFETY-01`
- Domaine owner: `safety_crisis`
- Source amont: reducer/renderer de sortie safety + arbitrage message mixte safety/tool
- Symptome visible: Sophia redemande la meme confirmation alors que le user a confirme absence de danger immediat, support humain et moyens eloignes.
- Preuve systeme: `response_owner=safety`, `selected_handler=safety_crisis`, `route_reason=active_safety_crisis_continue`, `scheduled_checkins=0`; le blocage outil est correct mais la reponse visible ignore les signaux de confirmation.
- Correction attendue: garder `response_owner=safety` et tools vides, mais produire une reponse de transition qui reconnait la confirmation et reporte la demande outil au lieu de relancer le meme check.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts`,
  `supabase/functions/sophia-brain/router/final_response_pipeline.ts`,
  `supabase/functions/sophia-brain/skills/skills_s3.test.ts`,
  `supabase/functions/sophia-brain/router/final_response_pipeline_test.ts`
- Tests requis: test integration ou runtime avec `confirmation safety + demande rappel`, attendu `executed_tools=[]`, `pending_confirmation=null`, `scheduled_checkins=0`, pas de question de confirmation dupliquee.
- Tests lances: `deno test --allow-env --allow-net --allow-read --filter "safety_crisis" supabase/functions/sophia-brain/skills/skills_s3.test.ts` vert; `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/final_response_pipeline_test.ts` vert; `deno check` cible vert.
- Limite: pas encore rerun IA reel post-fix via `/functions/v1/test-send-message`.

## R1-B02

- Bug id: `R1-B02`
- Tours: Tours 1-4
- Famille: `BF-SAFETY-01`
- Domaine owner: `safety_crisis`
- Source amont: renderer safety
- Symptome visible: les reponses de crise ajoutent un emoji souriant.
- Preuve systeme: reponses visibles des tours 1 a 4 se terminent par `🙂` alors que le flow est safety.
- Correction attendue: supprimer les emojis du renderer `safety_crisis`, ou rendre le style explicitement sobre pour tout `risk_band` medium/high/critical.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/router/final_response_pipeline.ts`,
  `supabase/functions/sophia-brain/router/final_response_pipeline_test.ts`
- Tests requis: test renderer/contract qui verifie absence d'emoji dans les reponses `safety_crisis`.
- Tests lances: `final_response_pipeline keeps safety replies sober and opaque` verifie que le pipeline ne force plus `🙂` sur une route `safety`; `deno check` cible vert.
- Limite: pas encore rerun IA reel post-fix via `/functions/v1/test-send-message`.
