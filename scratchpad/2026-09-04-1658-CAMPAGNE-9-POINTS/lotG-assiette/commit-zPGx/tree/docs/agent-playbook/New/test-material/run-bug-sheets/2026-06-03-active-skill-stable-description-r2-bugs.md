# Bug Sheet — active-skill-stable-description-r2

## R2-B01

- Bug id: R2-B01
- Tours: tentative R1 Tour 2
- Famille: BF-ROUTE-03 — Product/status/tool mal priorises
- Domaine owner: dispatcher
- Source amont: frontiere active skill stable description / product_help dans le prompt dispatcher
- Symptome visible: "support dans Sophia pour garder cette douceur" pendant `emotional_repair` route vers `product_help` et explique les preferences coach.
- Preuve systeme: `selected_handler=product_help`, `route_reason=skill_handoff_requested`, `active_flow_arbitration.active_owner=conversation_skill`.
- Correction attendue: quand `active_skill_stable_description` existe, ne pas transformer automatiquement "support/outil/aide dans Sophia" en product_help; utiliser la fiche active pour ponderer le signal.
- Statut: verified
- Fix reference: correction du prompt dispatcher `product_help` dans `supabase/functions/sophia-brain/dispatcher/dispatcher.prompts.ts`, reverifiee en R2.
- Tests requis: positif emotional active + support ambigu; positif demotivation active + support ambigu; anti-faux-positif vraie question interface; no active skill question potions; safety override.

## R2-B02

- Bug id: R2-B02
- Tours: Emotional R2 Tour 2, Demotivation R2 Tour 3
- Famille: BF-INTAKE-01 — Slot fourni mais redemande
- Domaine owner: conversation skills `emotional_repair`, `demotivation_repair`
- Source amont: intake / continuation / rendu de skill actif
- Symptome visible: le bon owner est selectionne, mais Sophia repond par un fallback generique ou repete la question precedente au lieu de traiter la demande de support.
- Preuve systeme: `selected_handler=emotional_repair` puis `selected_handler=demotivation_repair`, aucun tool execute, mais contenu assistant non adapte au message courant.
- Correction attendue: les skills doivent reconnaitre "support pour garder X" comme suite naturelle du skill actif et produire une clarification ou un bridge consenti, sans execution implicite.
- Statut: open
- Fix reference: none
- Tests requis: test conversationnel sur continuations "support" avec owner actif, verification que la reponse reconnait le besoin et ne repete pas la question precedente.
