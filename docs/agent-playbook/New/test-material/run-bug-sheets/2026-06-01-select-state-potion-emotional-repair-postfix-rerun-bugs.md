# Bug Sheet - select_state_potion x emotional_repair postfix rerun - 2026-06-01

## ER-POT-RERUN-B01

- Bug id: `ER-POT-RERUN-B01`
- Tours: `qa-potion-emorepair-postfix-r1` T1
- Famille: `BF-TEST-01`
- Domaine owner: runtime local / test endpoint
- Source amont: Edge/upstream local pendant `/functions/v1/test-send-message`
- Symptome visible: premier tour vide avec HTTP 502.
- Preuve systeme: raw response `An invalid response was received from the upstream server`; trace courte vide; `executed_tools=[]`.
- Correction attendue: investiguer seulement si l'incident se reproduit; ne pas utiliser de fallback; documenter et retenter le tour.
- Statut: `open`
- Fix reference: aucune.
- Tests requis: rerun local full AI sans 502; surveillance des logs Edge si recurrence.

## ER-POT-RERUN-B02

- Bug id: `ER-POT-RERUN-B02`
- Tours: `qa-potion-emorepair-postfix-r1` T2
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher / active arbitration / `select_state_potion` handoff readiness
- Source amont: priorite emotion dominante vs mention potion, et ambiguite mode soutien immediat vs potion.
- Symptome visible: Sophia propose de choisir entre deux potions alors que le user dit ne pas savoir s'il a surtout besoin qu'on lui parle doucement.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=select_state_potion`, `route_reason=skill_entry_signal`, `skill_entry_ids=["emotional_repair"]`, `tool_execution=platform_handoff`, `executed_tools=[]`.
- Correction attendue: si le message contient emotion forte + demande de douceur/soutien immediat + mention potion ambigue, produire une clarification mode "phrase/soutien maintenant" vs "recommandation potion plateforme" ou laisser `emotional_repair` porter le tour.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts`, test `potion versus being spoken to softly clarifies mode before potion shortlist`.
- Tests requis: positif "potion mais parle-moi doucement"; paraphrase "je ne sais pas si j'ai besoin d'une potion ou juste d'etre rassure"; anti-faux-positif "je veux une recommandation potion claire"; integration `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Verification: run reel `qa-potion-emorepair-verified-r1` T1 retourne une clarification "phrase douce maintenant" vs "potion plateforme", sans shortlist potion, `executed_tools=[]`.

## ER-POT-RERUN-B03

- Bug id: `ER-POT-RERUN-B03`
- Tours: `qa-potion-emorepair-postfix-r1` T3
- Famille: `BF-AGENDA-02`
- Domaine owner: active flow interruption / `select_state_potion` cancellation policy
- Source amont: interruption no-potion qui bloque l'effet mais ne restaure pas le besoin emotionnel et les contraintes de rendu.
- Symptome visible: apres "pas de potion", "juste une phrase" et "sans protocole", Sophia ajoute une micro-action orientee tache.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=select_state_potion`, `route_reason=explicit_no_tool_request_blocks_tool_start`, `tool_execution=blocked`, `executed_tools=[]`; DB effects a 0.
- Correction attendue: sur annulation potion + demande de phrase douce/sans protocole, rendre une seule phrase emotionnelle contextualisee ou repasser a `emotional_repair`; aucune micro-action/protocole.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/select_state_potion/policy.ts`, tests `no_potion with self-judgment phrase only respects no protocol` et `select_state_potion policy owns no_potion, exit, and concrete reply wording`.
- Tests requis: positif "non pas de potion, juste une phrase"; variante "sans protocole"; anti-faux-positif no-potion simple sans demande emotionnelle; verification DB `user_potion_sessions`, `user_recurring_reminders`, `scheduled_checkins` a 0.
- Verification: run reel `qa-potion-emorepair-verified-r1` T2 retourne une seule phrase de reparation, sans micro-action ni protocole, `tool_execution=blocked`, `executed_tools=[]`, DB effects a 0.
