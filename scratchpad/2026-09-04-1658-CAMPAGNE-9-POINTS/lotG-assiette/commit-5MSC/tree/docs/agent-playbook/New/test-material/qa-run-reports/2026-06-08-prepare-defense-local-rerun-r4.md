# QA Run - prepare_defense_card Local Rerun R4

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `prepare-defense-local-rerun-r4`
- Persona: `alex` (`tests/real-personas/alex/connection.json`, auth via `scripts/get-jwt.sh`; JWT non consigne)
- Objectif: verifier apres correction que le flow `prepare_defense_card` demarre par signal global explicite, reste sous dispatcher local pendant le flow actif, et que la revision ne produit plus de claim de persistance type "j'ai pris en compte" / "c'est note".
- Trajectoire: entree defense -> confirmation -> destination -> revision -> tentative de creation -> bascule attaque.
- Surfaces visees: dispatcher global, active local flow routing, `prepare_defense_card.local_dispatcher`, reducer local, visible agent, handoff plateforme, effect ledger.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe ni fallback direct `processMessage`.
- Validite QA: valide avec incident documente. T1-T4 sont valides sur le run R4 initial. T5-T6 ont d'abord retourne HTTP 502 sans trace Sophia, puis ont ete repris sur le meme scope R4 avec l'historique T1-T4 et sont passes en HTTP 200.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-defense-local-rerun-r4.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-defense-local-rerun-r4.summary.json`
- Resume raw T5-T6: `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-defense-local-rerun-r4-resume-t5t6.raw.json`
- Resume summary T5-T6: `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-defense-local-rerun-r4-resume-t5t6.summary.json`
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-08-prepare-defense-local-rerun-r4-bugs.md`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Il me faudrait un filet de securite pour le moment ou je rentre rince et que je commande n'importe quoi au lieu de manger correctement.

**Sophia**
> C'est un moment de vulnerabilite tres courant. Est-ce que cette formulation te convient pour decrire ce qui se passe : « quand je rentre rince et que je commande n'importe quoi au lieu de manger correctement » ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- global signal: `tool_skill_intents[0].operation_type=prepare_defense_card`, `explicitness=explicit`, `confidence_band=high`, `ambiguity=none`
- opportunity: `tool_skill_opportunity.type=none`
- operation: `collecting`, reason `prepare_defense_card_local_collecting`
- local dispatcher: `flow_action=confirm_proposed_field`, `visible_task=confirm_support_need_proposal`, `support_need_status=proposed`
- ai_call_count: 2
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui, c'est exactement ca.

**Sophia**
> Parfait. Pour finaliser ce filet de securite, tu peux te rendre dans Ressources / Defense / Cartes de defense libres. Comme la carte n'est pas creee automatiquement depuis notre echange, il te suffira de copier cette formulation dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? :
>
> quand je rentre rince et que je commande n'importe quoi au lieu de manger correctement 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- operation: `handoff_delivered`, reason `platform_handoff_delivered`
- local dispatcher: `flow_action=confirm_proposed_field`, `visible_task=handoff_ready`, `support_need_status=locked`
- ai_call_count: 2
- committed_effects: `[]`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Je la mets ou exactement ?

**Sophia**
> Tu peux l'ajouter dans Ressources / Defense / Cartes de defense libres. Il te suffit de copier ce texte dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? :
>
> quand je rentre rince et que je commande n'importe quoi au lieu de manger correctement 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- operation: `handoff_delivered`, reason `destination_short`
- local dispatcher: `flow_action=platform_destination_followup`, reducer visible `destination_short`, `support_need_status=locked`
- ai_call_count: 2
- committed_effects: `[]`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Reformule plutot : quand je rentre vide apres le travail, j'ai besoin d'aide a ne pas commander compulsivement.

**Sophia**
> Voici la formulation que tu peux utiliser pour ta carte de defense. Tu peux te rendre dans Ressources / Defense / Cartes de defense libres pour l'ajouter. Comme la carte n'est pas creee directement depuis notre echange, il te suffit de copier ce texte dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? :
>
> quand je rentre vide apres le travail, j'ai besoin d'aide a ne pas commander compulsivement. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- operation: `handoff_delivered`, reason `revised_platform_handoff`
- local dispatcher: `flow_action=revise_support_need`, reducer visible `handoff_ready`, `support_need_status=locked`
- visible guard: accepted, `issues=[]`
- ai_call_count: 2
- committed_effects: `[]`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

Verification ciblee:
- Aucun claim de persistance observe: pas de "j'ai pris en compte", "c'est note", "je garde", "j'ai enregistre".
- La nouvelle valeur remplace bien le `support_need.locked_value`.

### Tour 5

**Verdict du tour:** green apres reprise

**User**
> Ok vas-y cree-la.

**Sophia**
> Je ne peux pas creer la carte directement pour toi d'ici, mais tu peux l'ajouter en un instant dans Ressources / Defense / Cartes de defense libres. Il te suffit de copier cette formulation dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? :
>
> quand je rentre vide apres le travail, j'ai besoin d'aide a ne pas commander compulsivement. 🙂

**Trace courte**
- premiere tentative R4: HTTP 502, reponse vide, aucune trace Sophia
- reprise T5 sur meme scope: http_status 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- operation: `apply_attempt`, reason `apply_attempt_no_chat_mutation`
- local dispatcher: `flow_action=apply_attempt`, `visible_task=apply_attempt`, `support_need_status=locked`
- visible guard: accepted, `issues=[]`
- ai_call_count: 2
- blocked_effects: `create_defense_card / chat_creation_disabled_platform_handoff`
- committed_effects: `[]`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

Note incident:
- La premiere tentative reste documentee comme incident local `BF-TEST-01`.
- La reprise valide le comportement produit attendu: refus doux, destination, aucune mutation, aucune confirmation executable.

### Tour 6

**Verdict du tour:** green apres reprise

**User**
> Finalement je veux plutot une carte d'attaque pour demarrer mon dossier demain matin.

**Sophia**
> C'est entendu pour le dossier demain matin. Quel est l'obstacle principal ou le piege qui risque de t'empecher de t'y mettre au moment voulu ? 🙂

**Trace courte**
- premiere tentative R4: HTTP 502, reponse vide, aucune trace Sophia
- reprise T6 sur meme scope: http_status 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- global signal: `tool_skill_intents[0].operation_type=prepare_attack_card`, `explicitness=explicit`, `confidence_band=high`, `ambiguity=none`
- opportunity: `tool_skill_opportunity.type=none`
- operation: `collecting`, reason `prepare_attack_card_local_ask_target`
- attack local dispatcher: `flow_action=answer_current_field`, `visible_task=ask_target`
- visible guard: accepted, `issues=[]`
- committed_effects: `[]`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

Note incident:
- La premiere tentative reste documentee comme incident local `BF-TEST-01`.
- La reprise valide la sortie defense -> `prepare_attack_card` sur demande explicite.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- T1 pose une confirmation naturelle, sans exposer un formulaire legacy.
- T2-T3 donnent la destination et la valeur a recopier sans claim de creation.
- T4 corrige le probleme observe dans RQA1: Sophia ne dit plus "j'ai bien pris en compte" et reste sur une formulation a recopier.
- T5 refuse naturellement la creation depuis le chat et redonne le chemin.
- T6 accepte naturellement la bascule vers une carte d'attaque.

**Problemes**
- T5-T6 premiere tentative: reponses vides HTTP 502. Famille: `BF-TEST-01`. Impact: retry necessaire. Severite: yellow infra; la reprise est valide.

**Fix propose**
- Source amont: endpoint local QA / upstream local.
- Correction recommandee: stabiliser `/functions/v1/test-send-message` pour eviter les 502 intermittents.
- Tests d'invariant attendus: apply attempt non-mutant, aucun pending confirmation, sortie explicite defense -> `prepare_attack_card`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1: le dispatcher global detecte une intention explicite `prepare_defense_card`, pas une opportunite.
- T2-T4: le dispatcher global est bloque pendant le flow actif via `active_prepare_defense_card_uses_local_dispatcher`.
- T2-T4: le flow actif reste sous `prepare_defense_card` local dispatcher.
- T5 reprise: le dispatcher global reste bloque pendant `apply_attempt`.
- T6 reprise: la demande explicite d'attaque sort correctement vers `prepare_attack_card`.

**Skills / Operations / Tools**
- T1-T5: runtime `prepare_defense_card` actif, `ai_call_count=2` par tour defense exploitable.
- T4: `flow_action=revise_support_need`; le `support_need.locked_value` devient la nouvelle formulation.
- T5: `flow_action=apply_attempt`; `blocked_effects=create_defense_card/chat_creation_disabled_platform_handoff`.
- T6: runtime `prepare_attack_card` actif, `flow_action=answer_current_field`, `visible_task=ask_target`.
- T1-T6 valides apres reprise: `committed_effects=[]`, `executed_tools=[]`, `pending_confirmation=null`.

**Effets durables**
- Aucun writer de carte n'est appele.
- Aucun effet durable n'est observe.
- La tentative de creation est explicitement bloquee par le ledger.

**Tests techniques associes**
- `deno test supabase/functions/sophia-brain/tools/operations/prepare_defense_card/local_flow_test.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/local_flow_test.ts` -> 40 passed, 0 failed.
- `deno check` sur les visible agents et suites locales defense/attaque -> OK.

## Verdict Global

Verdict global: **green avec incident infra documente**.

Le fix du tour 4 est verifie en conditions IA reelles: le routage local fonctionne, le global ne reprend pas pendant le flow actif, la revision ne produit plus de claim de persistance, `apply_attempt` ne mute rien, et la sortie explicite vers attaque route vers `prepare_attack_card`. L'incident HTTP 502 initial sur T5-T6 reste documente comme fragilite infra locale, mais la reprise sur le meme scope a produit une trace valide.
