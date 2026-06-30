# QA Run - Clarification Local Flow Real R2

## 1. Contexte Du Test

- Date: 2026-06-12
- Flow vise: clarification locale Sophia, avec resolution vers `prepare_attack_card`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Conformite protocole: messages choisis tour par tour apres lecture des reponses et traces; aucun correctif code pendant le run; cleanup cible des connexions QA temporaires effectue.
- Connexions temporaires:
  - R1: `clarification_local_clarif_local_20260612_r1`, user `a77cb176-cf55-479c-99ca-30abe8ef2ca2`, cleanup OK.
  - R2: `clarification_local_clarif_local_20260612_r2`, user `587f80df-ab4b-4267-9803-5293057e1b7a`, cleanup OK.
- Artefacts:
  - `tests/real-personas/qa-skill/runs/clarification/2026-06-12-clarification-local-flow-clarif_local_20260612_r1.summary.json`
  - `tests/real-personas/qa-skill/runs/clarification/2026-06-12-clarification-local-flow-clarif_local_20260612_r1.raw.json`
  - `tests/real-personas/qa-skill/runs/clarification/2026-06-12-clarification-local-flow-clarif_local_20260612_r1.trace-rows.json`
  - `tests/real-personas/qa-skill/runs/clarification/2026-06-12-clarification-local-flow-clarif_local_20260612_r2.summary.json`
  - `tests/real-personas/qa-skill/runs/clarification/2026-06-12-clarification-local-flow-clarif_local_20260612_r2.raw.json`
  - `tests/real-personas/qa-skill/runs/clarification/2026-06-12-clarification-local-flow-clarif_local_20260612_r2.trace-rows.json`

## 2. Tours De Conversation

### R1 - Tour 1

**Verdict du tour:** yellow

**User**
> Je ne sais pas si je veux juste comprendre la carte attaque ou en préparer une pour mon blocage de demain matin.

**Sophia**
> Est-ce que tu préfères que je t'explique d'abord le principe de la carte d'attaque, ou on commence directement à en préparer une pour ton blocage de demain matin ?

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- visible diagnosis: `flow_action=clarify_product_question`
- bridge: `needed=true`, `operation_type=prepare_attack_card`, `kind=offer_with_consent`
- executed_tools: `[]`
- direct_effects: `[]`
- effect_ledger: `committed=0`, `asked=0`, `resolved=0`
- style: tutoiement OK, pas de `vous/votre/souhaitez-vous/préférez-vous`

**Analyse si yellow/red**
- La question visible est bonne et courte.
- Le tour ne passe pas par `orientation_clarification`; il active `product_help` qui pose sa propre clarification. Ce n'est pas bloquant pour l'utilisateur, mais ce n'est pas le flow clarification strict attendu pour cette famille ambiguë.

### R1 - Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-HANDOFF-01 - handoff annonce sans continuation effective sur le meme tour

**User**
> On la prépare : c’est pour demain matin, quand je repousse le réveil dès que ça sonne.

**Sophia**
> Ça marche, on s'occupe de préparer ta carte d'attaque pour demain matin.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `active_product_help_local_dispatcher`
- active_flow_arbitration: `continue_active`, `active_owner=conversation_skill`
- blocked_paths: `global_dispatcher`, `global_router`
- diagnosis: `flow_action=exit_to_global_dispatcher`
- note_information target: `prepare_attack_card`
- handoff_request target: `prepare_attack_card`
- executed_tools: `[]`
- direct_effects: `[]`
- effect_ledger: `committed=0`
- DB: `user_attack_cards=0`

**Analyse si yellow/red**
- Sophia annonce que la preparation commence, mais aucun tour `prepare_attack_card` n'est execute sur ce meme message.
- Le dispatcher global est bien bloque pendant le flow actif, mais le handoff local reste au niveau `product_help` et produit seulement un ack visible.
- Impact produit: l'utilisateur doit envoyer un message supplementaire pour obtenir la premiere question utile de la carte.

### R1 - Tour 3

**Verdict du tour:** green

**User**
> Oui, commence maintenant avec cette cible : repousser le réveil demain matin.

**Sophia**
> C'est quoi le piège ou l'excuse qui te fait craquer au moment où ton réveil sonne ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_skill_run: `prepare_attack_card`, `status=clarifying`, `visible_task=ask_blocker`
- runtime_trace: `global_dispatcher_skipped`
- runtime_trace: `note_information_consumed`, mais `source_flow_id=global_dispatcher`
- visible_task_context: target locked `repousser le réveil demain matin`
- executed_tools: `[]`
- direct_effects: `[]`
- DB: `user_attack_cards=0`, `__active_attack_card_handoff` present avant cleanup

### R2 - Tour 1

**Verdict du tour:** green

**User**
> Pour demain matin avec mon réveil, je veux préparer une carte, mais je ne sais pas si c’est plutôt une carte d’attaque ou une carte de défense.

**Sophia**
> C'est assez simple : avec une carte d'attaque, tu passes à l'offensive pour avancer concrètement vers ton objectif. Avec une carte de défense, tu cherches plutôt à te protéger d'un imprévu ou à sécuriser ta position actuelle.
>
> Laquelle te semble la plus adaptée à ta situation ?

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- executed_tools: `[]`
- direct_effects: `[]`
- effect_ledger: `committed=0`
- style: tutoiement OK, pas de vouvoiement

### R2 - Tour 2

**Verdict du tour:** green

**User**
> Carte d’attaque : je veux anticiper le moment où je repousse le réveil demain matin.

**Sophia**
> Pour contrer l'envie de snoozer et réussir à te lever dès que le réveil sonne, quelle technique préfères-tu utiliser entre Preparer le terrain, Mot de bascule ou Le texte magique ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- tool_skill_run: `prepare_attack_card`
- tool_status: `clarifying`
- visible_task: `ask_or_confirm_technique`
- executed_tools: `[]`
- direct_effects: `[]`
- DB: `user_attack_cards=0`, `user_defense_cards=0`
- style: tutoiement OK

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

Ce qui marche:
- Le vouvoiement observe dans le run precedent est corrige sur les deux trajectoires.
- Les questions visibles restent au format conversationnel court.
- R2 donne une clarification utile attaque vs defense puis enchaine vers `prepare_attack_card`.
- Sophia ne pretend jamais avoir cree une carte; aucun effet durable n'est commis.

Problemes:
- R1 T2 est frustrant: Sophia dit "on s'occupe de préparer" mais ne pose pas encore la premiere question de preparation.
- R1 demande un T3 artificiel pour entrer vraiment dans `prepare_attack_card`.
- R2 T2 contient "Preparer le terrain" sans accent; c'est mineur, pas bloquant.

Fix propose:
- Quand `product_help` retourne `flow_action=exit_to_global_dispatcher` avec `target_dispatcher=prepare_attack_card`, le runtime doit enchainer vers le dispatcher local cible ou produire une sortie de transition qui garantit la continuation au tour suivant sans obliger l'utilisateur a redemander "commence".
- Ajouter un test reel ou integration pour `product_help clarify_product_question -> exit_to_global_dispatcher -> prepare_attack_card` avec cible deja fournie.

## 4. Analyse Systeme

**Verdict: yellow**

Routage:
- R2 respecte le contrat attendu: `orientation_clarification` puis `orientation_clarification_resolved_tool_skill`.
- R1 montre un chemin adjacent: ambiguite produit/action captee par `product_help`, avec `note_information` et `handoff_request`, mais sans execution du dispatcher cible sur le tour de resolution.
- Pendant R1 T2, le dispatcher global normal est bien bloque: `blocked_paths` contient `global_dispatcher` et `global_router`.

Skills / Operations / Tools:
- Aucun tool ou effet durable execute dans les tours de clarification.
- R1 T3 et R2 T2 activent `prepare_attack_card` en `status=clarifying`.
- `prepare_attack_card` consomme bien la cible au moment ou il est enfin appele.

Memory / Effets durables:
- R1 avant cleanup: 6 `chat_messages`, `user_attack_cards=0`, `__active_attack_card_handoff` present apres T3.
- R2 avant cleanup: `user_attack_cards=0`, `user_defense_cards=0`.
- Cleanup cible: OK pour les deux connexions temporaires.

Problemes:
- R1 T2: `product_help_note_information.target_dispatcher=prepare_attack_card` existe, mais la continuation effective arrive seulement apres un nouveau message user. Famille: BF-HANDOFF-01. Severite: yellow/red selon UX; classe red au tour car il n'accomplit pas la transition annoncee.
- Trace R1 T3 indique `note_information_consumed` avec `source_flow_id=global_dispatcher`, alors que le contexte venait du handoff `product_help`; la traçabilité source est donc confuse.

## Verdict Global

- Verdict global: yellow
- Raison principale: le flow strict `orientation_clarification` fonctionne mieux et le style est corrige, mais le cas adjacent product_help/action laisse encore un trou de handoff: ack visible au lieu de continuation locale effective.
- Validation: partielle.
- Rerun requis apres correction: oui, sur le scénario R1 uniquement.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-12-clarification-local-flow-real-r2-bugs.md`
