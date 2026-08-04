# Bug Sheet - select_state_potion x emotional_repair ambiguous runs - 2026-06-01

## ER-POT-B01

- Bug id: `ER-POT-B01`
- Tours: `qa-potion-emorepair-amb-r1` T1
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher / active arbitration
- Source amont: priorite emotion dominante vs mention potion
- Symptome visible: Sophia demande de choisir entre deux potions alors que le user dit ne pas savoir s'il a surtout besoin qu'on lui parle doucement.
- Preuve systeme: `skill_entry_ids=["emotional_repair"]`, mais `response_owner=tool_skill`, `selected_handler=select_state_potion`.
- Correction attendue: si emotion dominante + demande de douceur/phrase/soutien immediat, prioriser `emotional_repair` ou produire une clarification mode "soutien maintenant" vs "potion plateforme".
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts`, `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts`
- Tests requis: ambiguous emotion+potion positive; anti-faux-positif demande potion explicite; run integration avec trace `emotional_repair` ou clarification mode.
- Verification: test contractuel `potion or phrase ambiguity asks mode clarification before handoff` passe. Mini-rerun reel `qa-potion-emorepair-fix-r1` a encore servi l'ancien comportement, ce qui indique que le service Edge local n'avait pas recharge le code modifie; user QA nettoye, DB sensible a 0.

## ER-POT-B02

- Bug id: `ER-POT-B02`
- Tours: `qa-potion-emorepair-amb-r1` T2, `qa-potion-emorepair-amb-r2` T3
- Famille: `BF-AGENDA-02`
- Domaine owner: active flow interruption / `select_state_potion` cancellation reply
- Source amont: sortie no-potion qui ne restaure pas le besoin emotionnel
- Symptome visible: apres "pas de potion / juste une phrase douce / sans protocole", Sophia repond avec une phrase generique + micro-action.
- Preuve systeme: `selected_handler=select_state_potion`, `tool_execution=blocked`, `executed_tools=[]`; contenu visible non aligne avec "juste phrase".
- Correction attendue: annulation potion + besoin emotionnel doit rendre la main a `emotional_repair` ou produire une phrase emotionnelle contextualisee sans micro-action si `sans protocole`.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/select_state_potion/policy.ts`, `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts`
- Tests requis: no-potion active handoff + "juste phrase"; no-potion + "sans protocole"; anti-regression no mutation.
- Verification: test contractuel `no_potion with just phrase returns no protocol or micro action` passe. Run reel apres reload encore requis pour passer `verified`.

## ER-POT-B03

- Bug id: `ER-POT-B03`
- Tours: `qa-potion-emorepair-amb-r2` T1, `qa-potion-emorepair-amb-r3` T2
- Famille: `BF-INTAKE-03`
- Domaine owner: `emotional_repair`
- Source amont: constraint extraction / reducer invariants
- Symptome visible: `emotional_repair` donne un protocole ou plusieurs questions malgre "pas de plan", "pas de solution" ou "pas de question".
- Preuve systeme: `response_owner=conversation_handler`, `selected_handler=emotional_repair`, `executed_tools=[]`; violation visible des contraintes.
- Correction attendue: durcir les contraintes `no_plan`, `no_questions`, `short_reply` comme invariants de rendu; zero question mark et zero demande de score quand no_questions est present.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/skills/emotional_repair/reducer.ts`, `supabase/functions/sophia-brain/skills/conversation_skills_contract_test.ts`
- Tests requis: no_plan emotional repair; no_questions panic; short_reply only phrase; anti-faux-positif quand le user accepte une question.
- Verification: test contractuel `emotional_repair enforces explicit no-plan and no-question constraints from user text` passe. Run reel apres reload encore requis pour passer `verified`.

## ER-POT-B04

- Bug id: `ER-POT-B04`
- Tours: `qa-potion-emorepair-amb-r2` T2
- Famille: `BF-INTAKE-04`
- Domaine owner: `select_state_potion` clarification / handoff readiness
- Source amont: ambiguite soutien immediat vs potion non reconnue
- Symptome visible: user demande "potion ou juste une phrase"; Sophia choisit directement une potion d'amour envers soi.
- Preuve systeme: `selected_handler=select_state_potion`, `tool_execution=platform_handoff`, `executed_tools=[]`; pas de clarification mode.
- Correction attendue: utiliser clarification_tool avec candidats structures `immediate_support` et `state_potion_handoff` quand les deux options sont dans le message.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts`, `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts`
- Tests requis: "potion ou phrase" asks clarification; "je veux la potion" produces handoff; "juste phrase" stays emotional.
- Verification: test contractuel `potion or phrase ambiguity asks mode clarification before handoff` passe. Run reel apres reload encore requis pour passer `verified`.
