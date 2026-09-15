# QA Run Report — demotivation_repair local doctrine R1

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `demotivation-repair-local-doctrine-r1`
- Persona: `qa-skill`, connexion temporaire locale `demotivationlocal_20260609_r1`, user `e7113156-a77d-4d98-93da-2f6b493e1791`
- Objectif: verifier en conditions reelles les modifications `demotivation_repair` local dispatcher, active flow ownership, conversation_context visible, absence d'effet durable, puis handoff potion avec note_information.
- Trajectoire: perte de sens -> clarification -> proposition Potion de clarte -> confirmation/handoff.
- Surfaces visees: dispatcher global initial, active local flow `demotivation_repair`, visible agent local, EffectLedger, bridge `select_state_potion`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. Le run a ete mene tour par tour. Incident: le tour 3 a d'abord ete bloque par limite d'escalade Codex, puis relance avec succes dans le meme historique.
- Cleanup: connexion temporaire `demotivationlocal_20260609_r1` nettoyee apres run via `qa-cleanup-run-connection.sh`.
- Artefacts:
  - Raw: `tests/real-personas/qa-skill/runs/operations/2026-06-09-demotivation-repair-local-doctrine-r1.raw.json`
  - Summary: `tests/real-personas/qa-skill/runs/operations/2026-06-09-demotivation-repair-local-doctrine-r1.summary.json`
  - Durable snapshot: `tests/real-personas/qa-skill/runs/operations/2026-06-09-demotivation-repair-local-doctrine-r1.durable.json`
  - Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-09-demotivation-repair-local-doctrine-r1-bugs.md`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je fais encore les petites actions du plan, mais depuis quelques jours ça sonne creux. J'avance par réflexe et je ne vois plus très bien à quoi je suis en train de tenir.

**Sophia**
> Agir par pur automatisme est une forme de fatigue silencieuse qui finit par vider l'action de sa substance. Si tu regardes ce que tu as fait aujourd'hui, quel aspect te semble le plus déconnecté de la raison initiale pour laquelle tu t'es lancé ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- safety: null
- direct_effects: []
- operation: none
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none, EffectLedger committed=0

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 — Mauvaise transition de flow

**User**
> C'est surtout l'action de relancer mon dossier administratif. Au départ ça devait me redonner de l'air, mais là je clique juste pour ne pas me sentir en retard, sans sentir le lien avec le fait de reprendre de la place.

**Sophia**
> Je comprends que cette relance administrative ressemble de plus en plus à une course contre la montre plutôt qu'à un moyen de retrouver de l'air. La Potion de clarté permet de remettre en lumière le lien entre ces démarches et ton besoin de reprendre ta place, afin que l'action retrouve son sens initial. Est-ce que tu souhaites essayer cela ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: null
- direct_effects: []
- operation: none
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none, EffectLedger committed=0
- system proof: `flow_action=potion_bridge_offer`, but `reason_code=demotivation_repair_potion_bridge_blocked`, blocked effect `select_state_potion/bridge_not_mature`, `last_potion_bridge_offer=null`, `conversation_context.selected_candidate.potion=null`

**Analyse si yellow/red**
- Symptome: le message visible propose `Potion de clarté` et demande consentement alors que le reducer a bloque le bridge et n'a pas persiste d'offre confirmable.
- Source amont probable: contrat reducer -> visible_task.conversation_context. Le visible agent a pu nommer une potion absente du `selected_candidate`.
- Owner runtime: `demotivation_repair` local reducer / visible agent contract.
- Meilleure correction selon les guidelines: si le bridge est bloque, le `visible_task` ne doit pas etre `potion_bridge_offer` avec une formulation qui demande consentement; ou bien le reducer doit persister une offre avec `selected_candidate.potion`.
- Pourquoi ce n'est pas un patch local de phrase: le bug est un mismatch entre etat structure, visible context et continuation de flow.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-02 — Pending confirmation cible perdue

**User**
> Oui, je veux essayer la Potion de clarté. Ce que je veux garder, c'est que ce dossier n'est pas juste une corvée : c'est une manière de récupérer un peu de marge et d'arrêter de subir.

**Sophia**
> C'est une intention forte de vouloir retrouver de la marge. Qu'est-ce qui, selon toi, a fait que le lien s'est rompu entre tes actions concrètes sur ce dossier et ce besoin profond de ne plus subir ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.clarte`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: null
- direct_effects: []
- operation: `select_state_potion`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: no DB commit; platform handoff delivered, `no_chat_mutation=true`, EffectLedger committed=0
- note_information: present, but produced by orientation/global bridge around `select_state_potion`, not by a persisted `demotivation_repair` local handoff

**Analyse si yellow/red**
- Symptome: la confirmation route bien vers `select_state_potion.clarte`, mais pas via le chemin local attendu `demotivation_repair` confirmation -> `note_information` -> target local dispatcher. La potion redemande la raison alors que le user vient de fournir l'ancre "recuperer de la marge et arreter de subir".
- Source amont probable: perte du pending local au tour 2 (`last_potion_bridge_offer=null`) puis rattrapage par arbitrage d'intention outil au tour 3.
- Owner runtime: `demotivation_repair` local reducer/state, puis bridge orientation.
- Meilleure correction selon les guidelines: rendre impossible une offre visible non persistable; faire porter le consentement par le local state demotivation et transmettre les candidats au dispatcher `select_state_potion`.
- Pourquoi ce n'est pas un patch local: le probleme touche la continuite de flow et la source de `note_information`, pas seulement la phrase de Sophia.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 1: ton sobre, non moralisateur, une seule question utile.
- Tour 2: humainement, la proposition de clarté semble pertinente en surface.

**Problemes**
- Tour 2: Sophia demande consentement pour une potion que l'etat local ne considere pas comme une offre confirmable. Famille: BF-STATE-01. Impact: le user croit confirmer un flow local stable alors que l'etat ne contient pas l'offre.
- Tour 3: Sophia redemande la raison du lien rompu alors que le user vient de donner l'ancre de sens. Famille: BF-STATE-02 / BF-INTAKE-01. Impact: repetition visible et perte de fluidite au moment du handoff.

**Fix propose**
- Source amont: `demotivation_repair` reducer + visible context.
- Correction recommandee: aligner strictement `potion_bridge_offer` visible sur une offre persistable; si `bridge_not_mature`, produire une reponse de clarification/repair, pas une demande de consentement.
- Tests d'invariant attendus:
  - blocked bridge -> no visible consent request;
  - visible `Potion de clarté` -> `last_potion_bridge_offer.selected_potion=clarte`;
  - confirmation -> local handoff with demotivation note_information;
  - target potion receives candidate anchor and does not redemander le meme sens.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1: entree correcte vers `demotivation_repair`.
- Tour 2: continuation correcte par active skill, mais sortie reducer incoherente avec visible.
- Tour 3: `select_state_potion.clarte` est atteint, mais par `orientation_clarification_resolved_tool_skill` / tool-intent supersede, pas par le handoff local demotivation attendu.

**Skills / Operations / Tools**
- `demotivation_repair` observe aux tours 1-2.
- `select_state_potion.clarte` observe au tour 3.
- Aucun executor durable appele.
- `tool_execution=platform_handoff` au tour 3, `executable_from_chat=false`, `no_chat_mutation=true`.

**Memory / Effets durables**
- EffectLedger committed=0 sur les trois tours.
- `chat_messages` contient les 6 messages du run avec `force_full_ai=true`.
- Snapshot durable partiellement degrade: les requetes QA `memory_items_recent`, `scheduled_checkins_recent` et `turn_summary_logs` utilisent des colonnes inexistantes (`content`, `type`, `summary_type`). Cela ne change pas le verdict conversationnel mais degrade la preuve DB secondaire.

**Problemes**
- Tour 2: visible offer sans state offer. Famille: BF-STATE-01. Impact systeme: confirmation locale impossible ou non fiable.
- Tour 3: confirmation recuperee par autre chemin que le local handoff attendu. Famille: BF-STATE-02. Impact systeme: la note d'information source demotivation n'est pas le chemin prouve.
- Durable snapshot helper: colonnes obsoletes. Famille: BF-TEST-01. Impact systeme: preuve DB partielle. Severite: yellow.

**Fix propose**
- Source amont: `supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts` et `visible_agent.ts`.
- Correction recommandee: garantir que `visible_task.kind=potion_bridge_offer` implique une offre persistable dans `last_potion_bridge_offer`, avec `conversation_context.selected_candidate.potion` non-null; sinon basculer vers `restore_meaning` ou `ask_gentle_clarification`.
- Tests d'invariant attendus: tests unitaires reducer + run IA reel de confirmation; assertion raw sur `demotivation_repair_potion_handoff.note_information`.

## Verdict Global

- Verdict: red
- Raison principale: les deux premiers invariants d'entree/continuation active passent, mais le bridge potion est incoherent: Sophia demande consentement alors que le reducer bloque et ne persiste pas l'offre, puis la confirmation est rattrapee par un autre chemin.
- Follow-up prioritaire: corriger l'alignement reducer -> conversation_context -> visible offer dans `demotivation_repair`, puis rerun le meme scenario jusqu'a une note_information locale demotivation consommee par `select_state_potion`.
