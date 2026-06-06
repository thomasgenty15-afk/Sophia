# QA Run Report - select-state-potion-selection-guidelines-r1

## 1. Contexte Du Test

- Date: 2026-06-05
- Run: `select-state-potion-selection-guidelines-r1`
- Variante: `N.1`
- Persona: `qa-skill`
- Connexion: `statepotion_selection_guidelines_r1` temporaire, nettoyee apres run
- Objectif: tester `select_state_potion` selon `14-qa-test-guidelines.md`, depuis l'entree globale "je veux une potion mais je ne sais pas laquelle" jusqu'a identification de la potion, sans aller dans la transition aval.
- Trajectoire: ambiguite apaisement vs anti-decrochage, clarification, reponse utilisateur choisie apres lecture de Sophia, identification attendue de `Potion anti-décrochage`.
- Surfaces visees: global dispatcher, local flow `select_state_potion`, router potion, visible agent IA, no-mutation potion/follow-up/checkin, trace runtime.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Le run a ete mene tour par tour via le chemin IA reel Sophia. La verification REST locale post-run indique `user_potion_sessions=0` et `scheduled_checkins=0` pour le user QA temporaire.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je veux une potion, mais je ne sais pas laquelle. J’ai la pression qui monte et en même temps je sens que je suis en train de décrocher de mon rythme.

**Sophia**
> Je comprends que tu as la pression qui monte et que tu sens que tu décroches de ton rythme. Pour t'aider au mieux, est-ce que tu souhaiterais plutôt te concentrer sur l'apaisement de cette pression, ou sur le fait de retrouver ton rythme pour ne pas décrocher ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: pas de signal safety observe
- direct_effects: `null`
- operation: `select_state_potion`
- pending_confirmation: aucun
- memory_plan: non inspecte dans cette sortie courte
- executed_tools: `null`
- durable_effect: aucun

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Là c’est surtout retrouver mon rythme. La pression est là, mais le vrai risque c’est que je lâche complètement ce que j’avais commencé.

**Sophia**
> D'accord, je pense que la Potion anti-décrochage est celle qui correspond le mieux à ton besoin de retrouver ton rythme et d'éviter de lâcher ce que tu as commencé. 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_turn_unclear`
- safety: pas de signal safety observe
- direct_effects: `null`
- operation: `select_state_potion`
- pending_confirmation: aucun
- memory_plan: non inspecte dans cette sortie courte
- executed_tools: `null`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: la potion est bien identifiee dans le message visible, mais la trace dit `active_handoff_turn_unclear`.
- Source amont probable: reducer / state machine / mapping de reason code du flow actif apres reponse a clarification.
- Owner runtime: `select_state_potion` local flow + trace mapping runtime.
- Meilleure correction selon les guidelines: produire une transition structuree explicite `potion_selected` quand le router local a assez d'information, puis propager un reason code coherent.
- Pourquoi ce n'est pas un patch local: le probleme n'est pas la phrase visible; c'est la transition runtime qui reste marquee comme unclear alors que la decision metier est prise.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia repond naturellement a l'ambiguite initiale sans proposer une liste de labels produit.
- La question du tour 1 aide vraiment a distinguer apaisement et anti-decrochage.
- Le tour 2 identifie clairement `Potion anti-décrochage`.
- Aucun nom produit invente: pas de "potion rappel", pas de "potion de réparation", pas d'"apaisement court".
- Aucun claim d'activation: Sophia ne dit pas avoir cree, lance ou sauvegarde une potion.
- Le rythme est court et comprehensible; l'emoji est acceptable selon la preference produit exprimee.

**Problemes**
- Aucun probleme humain bloquant. Le "je pense que" reste acceptable dans un contexte de selection nuancee.

**Fix propose**
- Source amont: aucun fix visible prioritaire.
- Correction recommandee: garder le visible agent stage-specific et les gardes anti-template.
- Tests d'invariant attendus: conserver ce run comme positif visible pour ambiguite apaisement vs anti-decrochage; ajouter paraphrase et anti-faux-positif dans un prochain lot.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1: routage propre vers `select_state_potion`, reason code coherent.
- Tour 2: owner et handler restent corrects, mais `route_reason=active_handoff_turn_unclear` est incoherent avec la selection visible de `Potion anti-décrochage`.

**Skills / Operations / Tools**
- `select_state_potion` reste proprietaire du flow jusqu'a identification de la potion.
- Aucun executor de potion n'est appele.
- Aucun tool execute.
- Aucun token de confirmation, aucune mutation DB attendue ou observee.

**Memory / Effets durables**
- Verification REST locale post-run:
  - `user_potion_sessions`: `0`
  - `scheduled_checkins`: `0`
- La connexion temporaire `statepotion_selection_guidelines_r1` a ete nettoyee apres run.

**Problemes**
- Tour 2: la transition runtime devrait etre `potion_selected`, pas `active_handoff_turn_unclear`. Famille: `BF-STATE-01`. Impact systeme: la suite du flow et les rapports QA ne peuvent pas distinguer proprement "reponse pas claire" de "potion identifiee". Severite: yellow.

**Fix propose**
- Source amont: local flow dispatcher / reducer / reason code mapping.
- Correction recommandee: quand la reponse a clarification suffit a selectionner une potion, emettre une action structuree `potion_selected` et un `reason_code` coherent. La transition aval vers le sous-flow de potion peut rester hors scope pour ce chantier.
- Tests d'invariant attendus:
  - positif: ambiguite apaisement vs anti-decrochage puis reponse "retrouver le rythme" -> `Potion anti-décrochage` + reason/stage `potion_selected`;
  - paraphrase: "je veux surtout ne pas abandonner ce que j'avais repris";
  - anti-faux-positif: user choisit explicitement "calmer la pression maintenant" -> `Potion d'apaisement`, pas anti-decrochage;
  - integration: `/test-send-message force_full_ai=true` jusqu'a potion identifiee, no DB mutation.

## Verdict Global

- Verdict: yellow
- Raison principale: comportement conversationnel et selection de potion corrects, mais transition runtime mal tracee au tour de selection.
- Follow-up prioritaire: corriger le reducer / reason code mapping pour sortir `potion_selected` quand la potion est identifiee, sans toucher au visible par patch lexical.
