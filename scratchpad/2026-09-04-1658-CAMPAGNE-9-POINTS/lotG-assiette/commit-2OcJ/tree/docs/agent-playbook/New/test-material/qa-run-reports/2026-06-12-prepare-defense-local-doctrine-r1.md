# QA Run - prepare_defense_card Local Doctrine R1

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `prepare-defense-local-doctrine-r1`
- Persona: `alex` (`tests/real-personas/alex/connection.json`, auth via `scripts/get-jwt.sh`; JWT non consigne)
- Objectif: verifier en conditions IA reelles que le flow local `prepare_defense_card` reste fluide, non-mutant, stage-specific, et respecte la doctrine dispatcher local apres les derniers changements.
- Trajectoire: entree defense explicite -> confirmation -> destination courte -> revision -> tentative d'ajout -> changement explicite vers carte d'attaque.
- Surfaces visees: dispatcher global d'entree, `note_information`, active flow routing, `prepare_defense_card.local_dispatcher`, reducer local, visible agent local, EffectLedger, no-chat-mutation, transition vers `prepare_attack_card`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `scripts/qa_prepare_defense_turn.mjs`, aucun renderer deterministe, aucun fallback direct `processMessage`, aucun staging/deploy.
- Validite QA: valide. Les messages ont ete choisis tour par tour apres lecture des reponses et traces courtes. Aucune correction code pendant le run.
- Nettoyage: cleanup cible effectue apres run sur le scope exact `qa-prepare-defense-card-alex-2026-06-12-prepare-defense-local-doctrine-r1`: 12 `chat_messages` et 1 `user_chat_states` supprimes. Verification finale `chat_messages=0`, `user_chat_states=0`, `user_defense_cards=0`.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r1.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r1.summary.json`
- Durable: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r1.durable.json`
- Cleanup: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r1.cleanup.json`
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-12-prepare-defense-local-doctrine-r1-bugs.md`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Je veux préparer une carte de défense pour le moment où je rentre tard, je suis vidé, et je me retrouve à commander n'importe quoi au lieu de me faire un vrai repas.

**Sophia**
> C'est un moment délicat, mais identifier ce signal est déjà une grande étape. Pour préparer ta parade, tu peux te rendre dans Ressources / Défense / Cartes de défense libres. La carte n'est pas créée automatiquement depuis notre discussion, il faudra donc copier cette formulation dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : "les soirs où je rentre tard et vidé, pour ne pas commander n'importe quoi par automatisme". Est-ce que cette description te convient ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- note_information: presente, `source_flow_id=global_dispatcher`, `target_dispatcher=prepare_defense_card`
- local dispatcher: `flow_action=confirm_proposed_field`, `visible_task=confirm_support_need_proposal`, `support_need=proposed`
- reducer: `visible_task=handoff_ready`, `support_need=locked`
- response_tool_execution: `platform_handoff`
- safety: `risk_band=low`, pas de safety preempt
- direct_effects: `[]`
- pending_confirmation: `null`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `user_defense_cards=0`
- ai_call_count: 2

**Analyse si yellow/red**
- Symptome: la reponse visible livre deja la destination plateforme et le champ verrouille, mais finit par demander confirmation. La trace confirme le decalage: le dispatcher local etait en `confirm_support_need_proposal`, puis le reducer a force `handoff_ready`.
- Source amont probable: reducer local `prepare_defense_card`, regle de verrouillage trop large sur `confirm_proposed_field`.
- Owner runtime: `prepare_defense_card`.
- Meilleure correction selon les guidelines: ne verrouiller une proposition que si elle confirme une candidate deja presente dans l'etat precedent ou si le dispatcher retourne explicitement `support_need_state.status=locked`; sinon conserver `confirm_support_need_proposal`.
- Pourquoi ce n'est pas un patch local: le wording visible est coherent avec le contexte recu; le probleme est la transition d'etat qui donne un contexte contradictoire au prompt visible.

### Tour 2

**Verdict du tour:** green

**User**
> Oui, garde cette formulation.

**Sophia**
> C'est entendu. Pour finaliser ta préparation, rends-toi dans Ressources / Défense / Cartes de défense libres. Dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu peux recopier : les soirs où je rentre tard et vidé, pour ne pas commander n'importe quoi par automatisme. Note que la carte n'est pas créée automatiquement depuis notre échange, il te suffit de l'ajouter dans ton espace.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=handoff_ready`, `visible_task=handoff_ready`
- reducer: `support_need=locked`
- response_tool_execution: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 3

**Verdict du tour:** green

**User**
> Je dois la mettre où exactement ?

**Sophia**
> Tu peux placer ta carte dans Ressources / Défense / Cartes de défense libres. Pour le champ exact Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu peux recopier ceci : les soirs où je rentre tard et vidé, pour ne pas commander n'importe quoi par automatisme.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=platform_destination_followup`, `visible_task=destination_short`
- response_tool_execution: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 4

**Verdict du tour:** green

**User**
> Reformule plutôt comme ça : quand je rentre tard et que je suis vidé, j'ai besoin d'aide à ne pas ouvrir les applis de livraison par réflexe.

**Sophia**
> Voici la formulation pour ta carte. Tu peux maintenant l'ajouter dans tes Cartes de défense (dans Ressources / Défense / Cartes de défense libres). Comme elle n'est pas créée depuis le chat, il te suffit de copier ce texte dans le champ : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?
>
> « quand je rentre tard et que je suis vidé, j'ai besoin d'aide à ne pas ouvrir les applis de livraison par réflexe »

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=revise_support_need`, `visible_task=handoff_ready`
- platform value: `quand je rentre tard et que je suis vidé, j'ai besoin d'aide à ne pas ouvrir les applis de livraison par réflexe`
- response_tool_execution: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 5

**Verdict du tour:** green

**User**
> Ok vas-y, ajoute-la pour moi.

**Sophia**
> Je ne peux pas créer la carte directement pour toi depuis notre discussion, mais tu peux l'ajouter en un instant dans Ressources / Défense / Cartes de défense libres.
>
> Il te suffira de copier cette formulation pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? :
>
> quand je rentre tard et que je suis vidé, j'ai besoin d'aide à ne pas ouvrir les applis de livraison par réflexe

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=apply_attempt`, `visible_task=apply_attempt`
- blocked_effects: `create_defense_card / chat_creation_disabled_platform_handoff`
- response_tool_execution: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `user_defense_cards=0`
- ai_call_count: 2

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Active flow / interruption policy contourne le flow actif

**User**
> En fait je change : j'ai plutôt besoin d'une carte d'attaque pour me lancer sur mon dossier CAF demain matin.

**Sophia**
> C'est entendu pour la carte d'attaque. Est-ce que ton objectif est bien de te lancer sur ton dossier CAF demain matin ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- blocked_paths: `[]`
- active flow debug: `__active_tool_skill_intake=prepare_defense_card` visible a `read_active_flow_state`, puis retire avant `before_run_conversation_routers`
- note_information: presente mais `source_flow_id=global_dispatcher`, `target_dispatcher=prepare_attack_card`
- local defense dispatcher: non appele sur ce tour
- attack local dispatcher: `flow_action=answer_current_field`, `visible_task=confirm_target_candidate`
- response_tool_execution: `blocked`
- pending_confirmation: `null`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: l'experience visible est bonne et la carte d'attaque ne mentionne plus de brouillon premature, mais la doctrine locale n'est pas respectee. Le global dispatcher a repris directement alors qu'un active flow `prepare_defense_card` existait au debut du tour.
- Source amont probable: active flow lifecycle / interruption policy apres `apply_attempt`; l'etat `__active_tool_skill_intake` defense est efface avant le routing au lieu de laisser le dispatcher local retourner `exit_to_global_dispatcher`.
- Owner runtime: router active flow / `prepare_defense_card` lifecycle.
- Meilleure correction selon les guidelines: conserver l'ownership local jusqu'a decision explicite du dispatcher local. Pour un changement vers attaque, `prepare_defense_card.local_dispatcher` doit retourner `exit_to_global_dispatcher` avec `note_information.target_dispatcher=global` et `recommended_next_focus=prepare_attack_card`; ensuite seulement le global reanalyse le meme message.
- Pourquoi ce n'est pas un patch local: le resultat visible final est correct; le probleme est le chemin systeme et la provenance de la note, qui violent l'invariant "global skipped while flow active".

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le flow defense est globalement naturel: proposition, confirmation, destination courte, revision et refus de creation directe sont comprehensibles.
- Le champ plateforme canonique est correct: `Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?`.
- Les anciens champs legacy ne sont pas exposes.
- Aucune phrase ne pretend que la carte est creee ou activee.
- La transition visible vers carte d'attaque est propre et ne parle plus de "brouillon propose" premature.

**Problemes**
- Tour 1: la reponse mele handoff plateforme et demande de confirmation. Famille: `BF-STATE-01`. Impact: confusion legere, le user ne sait pas si la formulation est encore a confirmer ou deja prete. Severite: yellow.
- Tour 6: la conversation visible est bonne, mais elle masque une violation systeme du flow actif. Famille: `BF-ROUTE-02`. Impact utilisateur direct faible sur ce run, risque fort en QA et en cas de transitions plus complexes. Severite: red systeme, yellow UX.

**Fix propose**
- Source amont T1: reducer local `prepare_defense_card`.
- Correction recommandee T1: distinguer strictement `confirm_support_need_proposal` et `handoff_ready`; ne pas auto-locker une proposition de premier tour si le dispatcher n'a pas retourne `locked`.
- Tests d'invariant T1: entree claire mais dispatcher `support_need=proposed` -> visible `confirm_support_need_proposal` sans destination; confirmation suivante -> `handoff_ready`.
- Source amont T6: active flow lifecycle / router active flow.
- Correction recommandee T6: ne jamais effacer `__active_tool_skill_intake` avant le passage par le dispatcher local actif; verifier la sortie `exit_to_global_dispatcher` avant relance globale.
- Tests d'invariant T6: apres `apply_attempt`, message "je veux une carte d'attaque" -> tour defense local `exit_to_global_dispatcher`, puis global -> `prepare_attack_card`; la trace doit montrer la note source `prepare_defense_card`, pas `global_dispatcher`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1 route correctement via global dispatcher initial vers `prepare_defense_card` avec `note_information.target_dispatcher=prepare_defense_card`.
- T2-T5 respectent l'invariant actif: `blocked_paths` contient `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`; tour normal actif = 2 appels IA.
- T6 ne respecte pas l'invariant: l'active flow defense est present au debut du tour, puis disparait avant routing; le global dispatcher selectionne directement `prepare_attack_card`.

**Skills / Operations / Tools**
- `prepare_defense_card` ne mute pas la DB: `executed_tools=[]`, `committed_effects=[]`, `pending_confirmation=null`.
- `apply_attempt` bloque bien `create_defense_card` avec `chat_creation_disabled_platform_handoff`.
- `prepare_attack_card` recoit correctement la demande d'attaque en T6, mais via une provenance global directe plutot que via une sortie locale defense.

**Memory / Effets durables**
- `user_defense_cards=0` avant cleanup et apres cleanup.
- Cleanup cible: `chat_messages=12 -> 0`, `user_chat_states=1 -> 0`, uniquement sur le scope QA.
- Pas d'effet durable non consenti observe.

**Problemes**
- Tour 1: `flow_action=confirm_proposed_field` + `visible_task=confirm_support_need_proposal` est reduit en `handoff_ready` avec `support_need=locked`. Famille: `BF-STATE-01`. Impact systeme: state transition trop agressive.
- Tour 6: active flow defense contourne avant le dispatcher local. Famille: `BF-ROUTE-02`. Impact systeme: violation de la doctrine "dispatcher global skipped while flow active" et absence de `note_information` source `prepare_defense_card`.

**Fix propose**
- Source amont: reducer `prepare_defense_card` pour T1; active flow routing/lifecycle pour T6.
- Correction recommandee: gates d'auto-lock bases sur etat precedent + status dispatcher, et preserve active owner jusqu'a `exit_to_global_dispatcher`.
- Tests d'invariant attendus: T1 proposed ne handoff pas; confirmation courte handoff; apres apply_attempt active flow reste owner; changement vers attaque produit d'abord `exit_to_global_dispatcher` depuis defense.

## Verdict Global

- Verdict: red
- Raison principale: le flow defense fonctionne bien pour collecte, revision et no-chat-mutation, mais T6 viole la doctrine en laissant le global dispatcher reprendre sans sortie explicite du dispatcher local actif.
- Follow-up prioritaire: corriger le lifecycle active flow apres `apply_attempt` et le verrouillage trop large de `confirm_proposed_field`, puis rerun la meme trajectoire avec formulation differente.
